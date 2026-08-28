/*
 * tests/test_blessings_notebook.cjs — the blessings notebook's pure model
 * suite (Plan 26.8-04, D-11/D-12/D-13, law 3 / law 5).
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * The notebook's model functions are PURE, top-level functions inside
 * app.js — no DOM, no wall clock, no store access — lifted by
 * brace-matching (the test_station_pack.cjs idiom; app.js is a browser
 * IIFE that touches `document` at load, so it can't be require()'d
 * under node). The lift co-lifts the family and injects NOTHING beyond
 * it: a free variable outside the family is itself a failure. The fence
 * guard is passed IN as a parameter at every call — this suite hands
 * the REAL core.js guardSurface, so the fence-drop cases run against
 * the shipped independent render guard, never a test double.
 *
 * Functions under test (exported by 26.8-04 Task 2):
 *   mulberry32(seed)                      — the property-suite PRNG, verbatim
 *   blessingSeed(itemId, ms)              — stable string hash → uint32
 *   pickBlessingDecoration(itemId, ms)    — {mark, corner}, deterministic
 *   blessingDayLabel(ms)                  — MM/DD/YYYY, local day
 *   blessingMonthKey(ms)                  — YYYY-MM, local month
 *   packBlessingsToc(ledger, items, filters, guard)
 *                                         — surviving entries, newest first
 *   blessingsMonthRoster(entries)         — populated months, newest first
 *   blessingsMonthGrid(entries, monthKey) — the month-grid model
 *   blessingsDayRoster(entries)           — the lit-day set, newest first
 *                                           (D-C day-by-day navigation)
 *
 * Behavior families (all present as named cases):
 *   1. PAGER — one blessing per page (every page row IS an entry — no
 *      heading-only page can exist), newest first by ledger ms; the day
 *      label derives from the ledger `ms` ONLY (a decoy history hop on
 *      the item proves history is never parsed — D-11); entry rows
 *      carry the allowed keys only (no body/content field can leak);
 *      two pages per view via the fixed view math (page p → view
 *      ceil(p/2): view 0 = calendar + newest page).
 *   2. CALENDAR — only days with ≥1 SURVIVING blessing produce lit
 *      cells; unlit cells are byte-identical inert markers ({day, lit}
 *      and nothing else — no handler flag, no distinguishing field);
 *      months with zero blessings are absent from the roster; default
 *      month = the newest populated (roster[0]).
 *   3. CALENDAR LAW-3 — no today-marker field, no per-day counts, no
 *      gap/streak/total field exists anywhere in the grid model.
 *   4. DETERMINISM — the decoration pick for (item_id, ms) is identical
 *      across repeated calls; adjacent entries can differ (variety
 *      probe); the mark set is exactly 3 and the corner set exactly 2.
 *   5. FENCE DROP (held out, law 5 P0) — a sentinel-retired fixture:
 *      entries whose live item is retired / never_show / trigger-
 *      flagged / filter-matched / missing are absent from pages AND
 *      their day goes unlit when the dropped entry was the day's only
 *      one; pagination recomputes with no hole; NO explanation string
 *      appears anywhere in the model.
 *   6. DAY ROSTER + DAY NAV (D-C) — blessingsDayRoster returns the
 *      distinct LOCAL calendar days newest-first, across months, derived
 *      from the already-guarded packBlessingsToc output; an empty day is
 *      structurally absent (never in the roster); the roster-index door
 *      logic yields no earlier/later neighbor at the extremes and neither
 *      for a single lit day; the day-set re-resolves through the guard
 *      every derivation (a retired day's last blessing self-heals away —
 *      held out, law 5 P0); NO per-day count field exists on any entry.
 *   6c. ARRIVAL PACKER + PROMOTED ROSTER (26.91-06, D-01) — packArrival
 *      Days is fail-closed on a missing guard, emits no gap tell, never
 *      reads origin_path, reuses the shipped day/month formatters, and
 *      buckets on the LOCAL day boundary to the millisecond. blessings
 *      DayRoster is generalized IN PLACE to the UNION of lit days and
 *      import days; `lit` is an ATTRIBUTE of an entry. Backward
 *      compatibility is compared to a FROZEN D-C oracle copied verbatim
 *      from b3d3da7, not to a description of it.
 *   6d. REACHABILITY — every day in the roster, import-only days
 *      included, has at least one spread, so the prev/next page flip
 *      really does step onto it; no spread carries an undefined page.
 *   6e. THE ZERO-OVERLAP FIXTURE, G-B5, AND THE GENERALIZATION
 *      INVARIANT — the fixture's disjointness is itself asserted; the
 *      unlit cell is pinned by KEY-SET EQUALITY (a `lit === false` check
 *      passes with a third field added); and the roster is pinned to the
 *      UNION, computed independently, so filtering back down to lit days
 *      or dropping the `lit` flag both go red.
 *   6f. THE COMPOSED ARRIVAL TRACE (26.91-07, PART B) — one sentence,
 *      ALWAYS PLURAL, count-free; the winning folder by surviving count
 *      with a lexicographic tie-break driven over shuffles; the law-5
 *      tail equality driven in BOTH directions (present and absent); the
 *      opaque `studyroom-collect-*` hash never emitted; a FORBIDDEN_
 *      TOKENS scan over every string the composer can emit; and the
 *      1,898-versus-1 byte-identity.
 *   6g. THE TRACE PAGE ON THE SPREAD (26.91-07, PART B) — the trace is
 *      the day's LAST page in both cases; a day with zero surviving
 *      arrivals has none, driven by flipping the last arrival to
 *      never_show between two runs of the SAME call; NB_PLACE stays null
 *      on a trace-page spread; and the `arrange this day` row does NOT
 *      render on an import-only spread (Open Decision #2, owner ruling
 *      `read-only-import-day`, 2026-08-07) — all driven through the real
 *      painter, never read from source.
 *   G-B1. THE PHASE'S CENTRAL GATE — the trace renders on an IMPORT-ONLY
 *      day AND that same day's `lit === false`, in ONE run, over the
 *      zero-overlap fixture. Two assertions or the gate is vacuous.
 *   G-B3. THE COUNT-LEAK GATE, with its fixture PINNED — two days holding
 *      kinds and folders CONSTANT and varying only in cardinality.
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ⛔⛔ THE EDITOR CSS, BOUNDED — NARROWED 2026-08-24 (26.98-06).
//
// Two assertions below (9g and 9i) forbid motion in "the editor CSS", and both
// took their slice as `css.slice(css.indexOf('.page-deco-canvas'))` — from the
// editor's FIRST rule to the END OF THE FILE, forever. Every rule any later
// plan appends to tokens.css, in any phase, about any surface, therefore landed
// inside "the editor CSS" and was judged by a rule about the notebook's design
// mode. Handoff §M7's feeling-mark block surfaced it: a 200ms settle on a
// reaction button, thousands of lines away, failed a gate about this editor.
//
// ⛔ NEITHER RULE IS WEAKENED. The editor still may carry no transition and no
// animation. What is fixed is only WHERE "the editor CSS" ends — at the end of
// the editor's own last rule, which is what the sentence always meant.
//
// ⛔ ONE DEFINITION, SO THE TWO CANNOT DRIFT APART, and the lift is CHECKED
// BEFORE IT IS TRUSTED: a boundary search that came up short would shrink the
// slice toward nothing and print a clean pass — the vacuous instrument this
// file catches everywhere else. The four landmarks bracket the editor, so a
// narrowed lift fails LOUDLY instead of quietly measuring less.
const EDITOR_CSS_LANDMARKS = ['.page-deco-canvas', '.page-deco-handles',
  '.page-deco-rotate', 'body.nb-design'];
function editorCssBlock(css, tag) {
  const start = css.indexOf('.page-deco-canvas');
  const last = css.lastIndexOf('page-deco');
  const end = last === -1 ? -1 : css.indexOf('}', last);
  assert.ok(start !== -1 && last > start && end !== -1,
    tag + ' the editor-CSS boundaries could not be found in tokens.css ' +
    '(start ' + start + ', last ' + last + ', end ' + end + ') — a slice ' +
    'that cannot be taken cannot be judged, and an untaken slice passes ' +
    'every assertion made over it');
  const block = css.slice(start, end + 1);
  EDITOR_CSS_LANDMARKS.forEach(function (landmark) {
    assert.ok(block.indexOf(landmark) !== -1,
      tag + ' the editor-CSS slice no longer reaches ' + landmark + ' — the ' +
      'lift came up SHORT, which is the failure mode that still prints a ' +
      'clean count. Fix the boundary, never the landmark list');
  });
  return block;
}
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// 26.91-31 (F-27/A-24): A REFUSAL FIXTURE MUST BE A SENTENCE THE SERVER
// ACTUALLY SAYS. Two `REASON` fixtures below drive the row's reason plumbing
// by feeding a literal through paintBand and comparing the painted row to it.
// That shape is right for what it measures — and it is structurally blind to
// the literal going stale, which is exactly what happened: rewording all four
// page-bounds refusals in server.py left both fixtures green while their own
// comments claimed to carry the server's exact sentence.
//
// This closes that BY EXACT VALUE and never by loosening. The fixture must
// appear as a WHOLE double-quoted literal inside validate_decorations — a
// substring, a near-miss or a re-punctuation fails.
function serverSaysIt(reason, tag) {
  const srv = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const from = srv.indexOf('def validate_decorations(');
  assert.notStrictEqual(from, -1,
    tag + ' reason-fixture-is-the-server\'s: validate_decorations could not ' +
    'be found in server.py — the window is empty and the check below would ' +
    'be a check over nothing');
  const region = srv.slice(from, srv.indexOf('\n    return None', from));
  assert.notStrictEqual(region.indexOf(JSON.stringify(reason)), -1,
    tag + ' reason-fixture-is-the-server\'s: the fixture ' +
    JSON.stringify(reason) + ' is NOT a whole quoted literal inside ' +
    'validate_decorations. The row\'s reason is the SERVER\'s words (law 4); ' +
    'a fixture the server never says makes every assertion below a ' +
    'measurement of a sentence nobody will ever read. Re-point the fixture ' +
    'BY EXACT VALUE — do not relax this to a substring test');
}

// The REAL independent render guard (core.js) — the fence the notebook
// re-checks at every render (D-13 posture; law 5).
const C = require('../core.js');
const guard = C.guardSurface;
assert.strictEqual(typeof guard, 'function',
  'core.js must export guardSurface');

// ---- the lift (test_station_pack.cjs idiom) ---------------------------------

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

// Co-lift the whole pure family; inject nothing else — a free variable
// outside the family is a purity failure by construction.
const FAMILY = ['mulberry32', 'blessingSeed', 'pickBlessingDecoration',
  'blessingDayLabel', 'blessingMonthKey', 'packBlessingsToc',
  'packArrivalDays',
  // 26.91-07 (PART B): the composer joins the pure family. It is pure over
  // its arguments — co-lifting it with NOTHING ELSE INJECTED is what makes
  // that a fact rather than a claim: a free variable outside the family is
  // a ReferenceError at call time, not a review finding.
  // (`buildBlessingSpreads` keeps its OWN standalone lift further down,
  // where 26.9 put it — moving it here would be a second lift of the same
  // function, and this file already has one.)
  'composeArrivalTrace',
  'blessingsMonthRoster', 'blessingsMonthGrid', 'blessingsDayRoster'];

// 26.91-08: the composer's THREE POLICY TABLES are module-scope constants in
// app.js, so they are free variables inside the lift above and the composer
// would ReferenceError the moment it ran. They are co-lifted BY NAME through
// `declOf` — the same balanced-declaration scan over COMMENT-STRIPPED source
// that the geometry tables use — rather than retyped here. A harness that
// retypes the table it is checking is a harness agreeing with itself, which
// is this project's named defect class in its purest form. Their membership
// is then pinned BY VALUE in group 8a, over the LIFTED objects.
const TRACE_CONST_NAMES = ['TRACE_NEVER_NAME', 'TRACE_SOURCE_PHRASE',
  'TRACE_FOLDER_CAP'];
const lifted = (function () {
  const body = TRACE_CONST_NAMES.map(declOf).join('\n') + '\n' +
    FAMILY.map(function (n) { return extractFn(appSrc, n); }).join('\n');
  const names = TRACE_CONST_NAMES.concat(FAMILY);
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn { ' + names.map(function (n) {
    return n + ': ' + n;
  }).join(', ') + ' };')();
})();
const TRACE_NEVER_NAME = lifted.TRACE_NEVER_NAME;
const TRACE_SOURCE_PHRASE = lifted.TRACE_SOURCE_PHRASE;
const TRACE_FOLDER_CAP = lifted.TRACE_FOLDER_CAP;

const packBlessingsToc = lifted.packBlessingsToc;
const packArrivalDays = lifted.packArrivalDays;
const composeArrivalTrace = lifted.composeArrivalTrace;
const blessingsMonthRoster = lifted.blessingsMonthRoster;
const blessingsMonthGrid = lifted.blessingsMonthGrid;
const blessingsDayRoster = lifted.blessingsDayRoster;
const pickBlessingDecoration = lifted.pickBlessingDecoration;
const blessingDayLabel = lifted.blessingDayLabel;

// 26.91-13 (D-1): THE REAL SPREAD BUILDER IS LIFTED HERE, BESIDE THE OTHER
// MODEL FUNCTIONS, RATHER THAN 900 LINES DOWN WHERE IT USED TO SIT.
//
// This is a RELOCATION of an existing lift, not a new one, and the reason is
// D-1. The calendar family and the fence-survivor family both used to pin the
// grid's navigation target against the deleted page-to-spread helper — a
// TEST-LOCAL COPY OF THE FORMULA UNDER TEST — because the real builder was
// not yet in scope at their
// position in the file. A mirror was reachable and the original was not, so
// the mirror is what got asserted against. Hoisting the lift is what makes
// "compare against buildBlessingSpreads' actual output" possible AT the sites
// that were getting it wrong.
const buildBlessingSpreads = (function () {
  // eslint-disable-next-line no-new-func
  return new Function(extractFn(appSrc, 'buildBlessingSpreads') +
    '\nreturn buildBlessingSpreads;')();
})();

// D-1's two navigation oracles, both READ OFF THE REAL SPREAD LIST.
//
// `firstSpreadIndexForDay` is the model-level twin of what the shipped
// lit-cell click handler does at run time: build the day's label, then scan
// `spreads` for the first entry whose `day` matches. It is written as a scan
// rather than as arithmetic ON PURPOSE — an arithmetic oracle here would be a
// new mirror of whatever `buildBlessingSpreads` does internally, which is the
// exact defect D-1 names.
function firstSpreadIndexForDay(spreads, dayLabel) {
  for (let i = 0; i < spreads.length; i++) {
    if (spreads[i].day === dayLabel) { return i; }
  }
  return -1;
}

// Which spread holds a given page, by the page's own item id.
function spreadIndexOfPage(spreads, page) {
  for (let i = 0; i < spreads.length; i++) {
    const ps = spreads[i].pages || [];
    for (let j = 0; j < ps.length; j++) {
      if (ps[j] && ps[j].itemId === page.itemId) { return i; }
    }
  }
  return -1;
}

// ---- fixtures ---------------------------------------------------------------

// Local-noon epoch ms — the local calendar day is stable in any machine
// timezone (the test_station_pack timezone discipline).
function ms(y, m, d) { return new Date(y, m - 1, d, 12).getTime(); }

function two(n) { return (n < 10 ? '0' : '') + n; }
function label(y, m, d) { return two(m) + '/' + two(d) + '/' + y; }
function monthKey(y, m) { return y + '-' + two(m); }

// A blessed store item. Every item carries a body-ish field on purpose —
// the allowed-keys pin below proves it can never leak into the model —
// and a DECOY history hop on a different day than any ledger ms, so the
// ms-only day derivation is proven against a live temptation (D-11).
function storeItem(id, type, title) {
  return {
    id: id,
    title: title || ('title of ' + id),
    type: type || 'text',
    state: 'blessed',
    body: 'PRIVATE CONTENT of ' + id,
    history: [{ from: 'unseen', to: 'blessed',
      at: '2020-01-05T12:00:00-07:00', via: 'decoy' }]
  };
}

function entry(id, when, why, author) {
  return { item_id: id, ms: when, why: why || 'a small joy',
    author: author || 'default' };
}

const ENTRY_KEYS = ['itemId', 'ms', 'why', 'author', 'title', 'isImage',
  'dayLabel', 'monthKey'];

function assertEntryKeys(e, where) {
  assert.deepStrictEqual(Object.keys(e).sort(), ENTRY_KEYS.slice().sort(),
    where + ' entry must carry exactly the allowed keys (no body/' +
    'content/excerpt field can exist — law 5 by construction), got: ' +
    Object.keys(e).join(','));
}

// 26.91-13 (D-1): THE TEST-LOCAL PAGE-TO-SPREAD HELPER WAS DELETED HERE —
// a one-line `Math.ceil(p / 2)` function — and its disposition is recorded
// rather than left to be inferred.
//
// ⚠ IT IS NAMED BY CONCEPT AND NOT BY ITS IDENTIFIER, ON PURPOSE. This
// plan's own gate is `grep -c '<the identifier>' <this file>' <= 1`, which
// is how *zero callers* is proven. Spelling the identifier out in this
// obituary would make that gate permanently unmeetable by the obituary
// itself — the self-invalidation trap, hit for the third time in this phase
// (26.91-08, 26.91-12, here). The literal name is preserved where a gate
// cannot be confused by it: `deferred-items.md` D-1 and
// `26.91-13-SUMMARY.md`.
//
// It was a TEST-LOCAL COPY OF THE FORMULA UNDER TEST, and all three of its
// callers asserted that formula against its own output: `:288` against a
// hand-written `[0,1,1,2,2]`, `:340` and `:342` against the very field the
// shipped grid derived FROM it. The suite was therefore structurally
// incapable of catching the disagreement D-1 describes.
//
// Deleted rather than annotated because it does not merely lack callers — it
// describes a model that no longer exists. 26.91-10 made a spread hold ONE
// page, so `ceil(p / 2)` is not the right shape for anything at all. Keeping
// a callerless mirror of a deleted model is the same dead-value shape one
// layer up. Its three callers were REWRITTEN, never deleted, against
// `buildBlessingSpreads`' real output.

// ---- 1. PAGER — one per page, newest first, ms-only days, allowed keys ------

(function pagerFamily() {
  const items = {
    a: storeItem('a', 'text', '手帐 first note'),
    b: storeItem('b', 'image', 'a photo'),
    c: storeItem('c', 'text', 'note c'),
    d: storeItem('d', 'text', 'note d'),
    e: storeItem('e', 'text', 'note e')
  };
  const ledger = { blessings: [
    // input order scrambled on purpose; ms decides everything.
    entry('c', ms(2026, 7, 21), 'why c', 'user'),
    entry('a', ms(2026, 7, 24), 'why a', 'librarian'),
    entry('e', ms(2026, 6, 3), 'why e', 'default'),
    entry('b', ms(2026, 7, 24) + 3600000, 'why b', 'user'),
    entry('d', ms(2026, 6, 3) + 60000, 'why d', 'default')
  ] };
  const snapshot = JSON.stringify({ ledger: ledger, items: items });
  const pages = packBlessingsToc(ledger, items, [], guard);

  // one blessing per page, newest first by ledger ms.
  assert.strictEqual(pages.length, 5, '(1) five entries → five pages');
  assert.deepStrictEqual(pages.map(function (p) { return p.itemId; }),
    ['b', 'a', 'c', 'd', 'e'],
    '(1) pages run newest ledger ms first');

  // no orphan heading-only pages: every page IS an entry.
  pages.forEach(function (p, i) {
    assert.ok(p.itemId, '(1) page ' + i + ' carries an entry — a ' +
      'heading-only page cannot exist in this model');
    assert.ok(!('heading' in p),
      '(1) no heading rows exist in the notebook model');
    assertEntryKeys(p, '(1) packBlessingsToc');
  });

  // the day label derives from the ledger ms ONLY — the decoy history
  // hop (2020-01-05) must never surface (D-11: the ledger IS the source).
  assert.strictEqual(pages[0].dayLabel, label(2026, 7, 24),
    '(1) day label comes from the ledger ms');
  assert.strictEqual(pages[4].dayLabel, label(2026, 6, 3),
    '(1) older entries label their own ledger day');
  assert.strictEqual(JSON.stringify(pages).indexOf('2020'), -1,
    '(1) the decoy history day never appears — history is never parsed');

  // titles resolve against the CURRENT store; content never rides.
  assert.strictEqual(pages[1].title, '手帐 first note',
    '(1) titles come from the live item, CJK verbatim');
  assert.strictEqual(JSON.stringify(pages).indexOf('PRIVATE CONTENT'), -1,
    '(1) item bodies can never leak into the model');

  // photo flag: image items alone carry isImage true.
  assert.strictEqual(pages[0].isImage, true,
    '(1) an image item flags its polaroid slot');
  assert.strictEqual(pages[1].isImage, false,
    '(1) a text item omits the slot');

  // authors ride through for the attribution suffix.
  assert.strictEqual(pages[1].author, 'librarian',
    '(1) the librarian author rides to the renderer');

  // ONE PAGE PER SPREAD: where each of the five pages actually lives.
  //
  // 26.91-13 (D-1), REWRITTEN — NEVER DELETED. This site was
  // the deleted page-to-spread helper mapped over `[0,1,2,3,4]` and compared
  // against a hand-written `[0,1,1,2,2]`,
  // messaged "view 0 holds the newest page; later views pair pages". It
  // pinned no model field at all, which is exactly why `deferred-items.md`'s
  // pin-shaped inventory missed it, and it was the formula asserted against a
  // copy of its own output — the same mirror shape as `:340`/`:342`, one
  // layer purer.
  //
  // THE EXPECTED VALUE MOVED because the CLAIM died: 26.91-10 (F-1) deleted
  // the two-page chunking this assertion described, so a spread holds at most
  // one page and `ceil(p / 2)` is not the right shape for anything. The live
  // claim over the post-plan-10 model is one page per spread — page index `p`
  // lives in spread `p` — and it is asserted against `buildBlessingSpreads`'
  // REAL output rather than against any test-local formula. The original
  // reason survives: this is still the site that says where a page lands.
  const pagerSpreads = buildBlessingSpreads(
    pages, blessingsDayRoster(pages, []), []);
  assert.strictEqual(pagerSpreads.length, 5,
    '(1) THE SPREAD COUNT, PINNED BY VALUE FIRST — five pages, five ' +
    'spreads. Pinned here rather than derived from pages.length so that a ' +
    'builder emitting nothing, or emitting one spread per DAY (three, for ' +
    'this fixture), fails on the count rather than being reported as a ' +
    'per-page mismatch further down. Got ' + pagerSpreads.length);
  assert.deepStrictEqual(
    pages.map(function (p) { return spreadIndexOfPage(pagerSpreads, p); }),
    [0, 1, 2, 3, 4],
    '(1) ONE PAGE PER SPREAD (F-1, 26.91-10): page index p lives in spread ' +
    'p, read off buildBlessingSpreads\' real output. Was: the two-page view ' +
    'pairing [0,1,1,2,2], computed by a test-local copy of the formula ' +
    'under test (D-1, closed 26.91-13)');

  // purity: neither input was touched.
  assert.strictEqual(JSON.stringify({ ledger: ledger, items: items }),
    snapshot, '(1) packBlessingsToc never mutates its inputs');

  // fail-open: a missing or off-shape ledger reads as empty.
  assert.deepStrictEqual(packBlessingsToc(null, items, [], guard), [],
    '(1) a null ledger packs to empty');
  assert.deepStrictEqual(
    packBlessingsToc({ blessings: 'nope' }, items, [], guard), [],
    '(1) an off-shape ledger packs to empty');
  assert.deepStrictEqual(packBlessingsToc(undefined, items, [], guard), [],
    '(1) an absent ledger packs to empty');
})();

// ---- 2. CALENDAR — lit days, inert unlit cells, populated-month roster ------

(function calendarFamily() {
  const items = {
    a: storeItem('a'), b: storeItem('b'), c: storeItem('c')
  };
  const ledger = { blessings: [
    entry('a', ms(2026, 7, 24)),
    entry('b', ms(2026, 7, 21)),
    entry('c', ms(2026, 5, 2))
  ] };
  const pages = packBlessingsToc(ledger, items, [], guard);
  const roster = blessingsMonthRoster(pages);

  // months with zero blessings do not exist; newest populated first —
  // the default month is roster[0].
  assert.deepStrictEqual(roster, [monthKey(2026, 7), monthKey(2026, 5)],
    '(2) the roster holds ONLY populated months, newest first — June ' +
    'is absent, not empty');

  const grid = blessingsMonthGrid(pages, monthKey(2026, 7));
  assert.deepStrictEqual(Object.keys(grid).sort(),
    ['days', 'firstWeekday', 'monthKey'],
    '(2) the grid model carries exactly monthKey/firstWeekday/days');
  assert.strictEqual(grid.days.length, 31, '(2) July holds 31 cells');
  assert.strictEqual(grid.firstWeekday, new Date(2026, 6, 1).getDay(),
    '(2) the grid is weekday-aligned from the local first-of-month');

  // lit days: exactly the surviving blessing days of the month.
  const lit = grid.days.filter(function (cell) { return cell.lit; });
  assert.deepStrictEqual(lit.map(function (cell) { return cell.day; }),
    [21, 24], '(2) only days holding a surviving blessing light up');

  // A LIT DAY OPENS THAT DAY'S FIRST SPREAD — asserted against the REAL
  // spread list.
  //
  // 26.91-13 (D-1), REWRITTEN — NEVER DELETED. These two sites read
  // the grid's navigation field compared against the deleted page-to-spread
  // helper called on pages 0 and 1 —
  // comparing a model field against A TEST-LOCAL COPY OF THE VERY FORMULA
  // THAT PRODUCED IT. Neither ever compared it against what the spread
  // builder really returns, so neither could ever have caught the
  // disagreement D-1 describes — the project's named defect class, sitting
  // inside the suite built to catch it.
  //
  // THE EXPECTED VALUE MOVED because the field is gone: the grid no longer
  // emits a navigation target, and the shipped lit-cell click handler derives
  // it by scanning the real spread list for the first entry whose `day`
  // matches. The original reason is kept verbatim in spirit — the newest day
  // opens first, an older day opens the spread holding that day's first page
  // — and it is now measured over `buildBlessingSpreads`' actual output. The
  // EXECUTED form of the same claim, driven through the real painter and a
  // real tap, is G-D1 further down.
  const calSpreads = buildBlessingSpreads(
    pages, blessingsDayRoster(pages, []), []);
  assert.deepStrictEqual(calSpreads.map(function (s) { return s.day; }),
    [label(2026, 7, 24), label(2026, 7, 21), label(2026, 5, 2)],
    '(2) POSITIVE CONTROL: the real spread list for this fixture, BY VALUE ' +
    '— three spreads, newest day first. Without it the two index ' +
    'assertions below are satisfied by a builder that returns nothing (a ' +
    'day found at index -1 in an empty list would still have to equal 0 ' +
    'and 1, but a REORDERED list of the right length would not be caught ' +
    'at all)');
  assert.strictEqual(firstSpreadIndexForDay(calSpreads, label(2026, 7, 24)), 0,
    '(2) the newest lit day opens spread 0 — read off the real spread list, ' +
    'never off a copy of the formula under test (D-1)');
  assert.strictEqual(firstSpreadIndexForDay(calSpreads, label(2026, 7, 21)), 1,
    "(2) an older lit day opens the spread holding that day's first page — " +
    'the same day-label scan the shipped click handler performs (D-1)');

  // unlit cells are byte-identical inert markers: {day, lit:false} and
  // NOTHING else — same shape, no handler flag, no distinguishing field.
  const unlit = grid.days.filter(function (cell) { return !cell.lit; });
  assert.strictEqual(unlit.length, 29, '(2) the other 29 days are unlit');
  unlit.forEach(function (cell) {
    assert.deepStrictEqual(Object.keys(cell).sort(), ['day', 'lit'],
      '(2) an unlit cell carries {day, lit} alone — any extra field is ' +
      'a distinguishing mark (D-13/D-35)');
    assert.strictEqual(cell.lit, false, '(2) unlit means lit:false');
    assert.strictEqual(JSON.stringify(cell),
      JSON.stringify({ day: cell.day, lit: false }),
      '(2) unlit cells are byte-identical in shape across the month');
  });

  // an unpopulated month asked directly (the painter never does — the
  // roster is the nav) still answers all-unlit, never a throw.
  const empty = blessingsMonthGrid(pages, monthKey(2026, 6));
  assert.ok(empty.days.every(function (cell) { return !cell.lit; }),
    '(2) a month with no blessings holds no lit cell');
})();

// ---- 3. CALENDAR LAW-3 — no today, no counts, no gap/streak vocabulary ------

(function calendarLawThree() {
  const items = { a: storeItem('a'), b: storeItem('b') };
  const ledger = { blessings: [
    entry('a', ms(2026, 7, 24)), entry('b', ms(2026, 7, 24) - 3600000)
  ] };
  const pages = packBlessingsToc(ledger, items, [], guard);
  const grid = blessingsMonthGrid(pages, monthKey(2026, 7));
  const json = JSON.stringify(grid);
  ['today', 'count', 'total', 'streak', 'gap', 'summary'].forEach(
    function (word) {
      assert.strictEqual(json.toLowerCase().indexOf('"' + word), -1,
        '(3) the grid model carries no ' + word + ' field anywhere ' +
        '(law 3: the lit/unlit distinction is the whole vocabulary)');
    });
  // two blessings on ONE day still light ONE plain cell — no per-day
  // count of any kind exists in the model.
  const lit = grid.days.filter(function (cell) { return cell.lit; });
  assert.strictEqual(lit.length, 1, '(3) two same-day blessings = one lit day');
  // 26.91-13 (D-1), REWRITTEN — NEVER DELETED. Was `['day','lit','view']`,
  // messaged "a lit cell carries day/lit/view alone — never a count". THE
  // EXPECTED VALUE MOVED because the dead navigation field was dropped; the
  // reason is unchanged and is now STRONGER, because with that field gone
  // there is one fewer property through which a count could arrive.
  //
  // ⚠ THIS SITE WAS ABSENT FROM `deferred-items.md`'s D-1 INVENTORY. That
  // record named four pins, was re-measured to five, and is five plus this
  // one. It is the reason the routing note in `deferred-items.md` states a
  // re-measured count rather than the recorded one.
  assert.deepStrictEqual(Object.keys(lit[0]).sort(),
    ['day', 'lit'],
    '(3) a lit cell carries day/lit alone — never a count, and after D-1 ' +
    'never a navigation target either (law 3)');
})();

// ---- 4. DETERMINISM — the seeded decoration pick ----------------------------

(function decorationFamily() {
  // identical across repeated calls — the seed is per-entry, forever.
  const first = pickBlessingDecoration('item-a', ms(2026, 7, 24));
  for (let i = 0; i < 50; i++) {
    assert.deepStrictEqual(
      pickBlessingDecoration('item-a', ms(2026, 7, 24)), first,
      '(4) the pick for (item_id, ms) is identical on every call — a ' +
      're-roll per open reads as machine churn (banned)');
  }
  // shape: one mark, one corner.
  assert.deepStrictEqual(Object.keys(first).sort(), ['corner', 'mark'],
    '(4) a pick is {mark, corner} alone');

  // the mark set is exactly 3 and the corner set exactly 2, observed
  // over a wide sample; adjacent entries can differ (variety probe).
  const marks = {};
  const corners = {};
  let adjacentDiffer = false;
  let prev = null;
  for (let i = 0; i < 300; i++) {
    const pick = pickBlessingDecoration('item-' + i, ms(2026, 7, 1) + i);
    marks[pick.mark] = true;
    corners[pick.corner] = true;
    if (prev && (prev.mark !== pick.mark || prev.corner !== pick.corner)) {
      adjacentDiffer = true;
    }
    prev = pick;
  }
  assert.deepStrictEqual(Object.keys(marks).sort(),
    ['candle', 'stamp', 'washi'],
    '(4) the mark set is exactly the three D-12 marks');
  assert.strictEqual(Object.keys(corners).length, 2,
    '(4) the corner set is exactly 2 positions');
  assert.ok(adjacentDiffer,
    '(4) adjacent entries vary — the notebook never wallpapers one mark');
})();

// ---- 5. FENCE DROP (held out, law 5 P0) — the sentinel-retired family -------

(function fenceDropFamily() {
  // Every excluded item wears a FENCE-SENTINEL title: if any model
  // output ever carries the sentinel, the fence leaked.
  const SENTINEL = 'FENCE-SENTINEL';
  const items = {
    ok1: storeItem('ok1', 'text', 'a clean surviving note'),
    ok2: storeItem('ok2', 'text', 'another clean note'),
    ret: Object.assign(storeItem('ret', 'text', SENTINEL + ' retired-item'),
      { state: 'retired' }),
    nev: Object.assign(storeItem('nev', 'text', SENTINEL + ' never-item'),
      { state: 'never_show' }),
    trg: Object.assign(storeItem('trg', 'text', SENTINEL + ' trigger-item'),
      { trigger: true }),
    fil: Object.assign(storeItem('fil', 'text', SENTINEL + ' filter-item'),
      { source: 'screenshots' })
    // 'gone' is deliberately ABSENT from the store — the missing case.
  };
  const filters = [{ facet: 'source', value: 'screenshots' }];
  const ledger = { blessings: [
    // the sole survivor of 07/24; the retired entry is 07/22's ONLY one.
    entry('ok1', ms(2026, 7, 24), 'kept'),
    entry('ret', ms(2026, 7, 22), 'blessed in july, retired in august'),
    entry('nev', ms(2026, 7, 21), 'now never_show'),
    entry('trg', ms(2026, 7, 20), 'now trigger-flagged'),
    entry('fil', ms(2026, 7, 19), 'now filter-matched'),
    entry('gone', ms(2026, 7, 18), 'item deleted since'),
    entry('ok2', ms(2026, 7, 10), 'also kept')
  ] };

  const pages = packBlessingsToc(ledger, items, filters, guard);

  // only the survivors render; pagination recomputes with NO hole —
  // ok2 sits directly beside ok1.
  assert.deepStrictEqual(pages.map(function (p) { return p.itemId; }),
    ['ok1', 'ok2'],
    '(5) retired / never_show / trigger / filter-matched / missing ' +
    'entries are ALL absent — silent drop, the ledger outlives the fence');

  // the sentinel appears NOWHERE in any model output.
  const roster = blessingsMonthRoster(pages);
  const grid = blessingsMonthGrid(pages, monthKey(2026, 7));
  const everything = JSON.stringify({ pages: pages, roster: roster,
    grid: grid });
  assert.strictEqual(everything.indexOf(SENTINEL), -1,
    '(5) no sentinel byte reaches any model output (law 5 P0)');

  // NO explanation string appears in the model — absence is silence.
  ['retired', 'never_show', 'hidden', 'missing', 'dropped', 'held back',
    'reason'].forEach(function (word) {
    assert.strictEqual(everything.indexOf(word), -1,
      "(5) the model never explains a drop — found '" + word + "'");
  });

  // the day whose ONLY entry dropped goes unlit (07/22 held only the
  // retired entry); the survivors' days stay lit.
  const litDays = grid.days.filter(function (cell) { return cell.lit; })
    .map(function (cell) { return cell.day; });
  assert.deepStrictEqual(litDays, [10, 24],
    "(5) a day whose only blessing dropped is unlit — 07/22 and every " +
    'other dropped day vanish; the surviving days alone light up');

  // PAGINATION RECOMPUTED, WITH NO HOLE where the five dropped entries once
  // sat — asserted against the REAL spread list.
  //
  // 26.91-13 (D-1), REWRITTEN — NEVER DELETED. These two sites read
  // `lit[1].view === 0` and `lit[0].view === 1`. Those literals are not
  // independent expectations: they are the OUTPUT of the same test-local
  // formula `:340`/`:342` compared against, for pages 0 and 1. THE EXPECTED
  // VALUE MOVED because the field they pinned no longer exists; the group's
  // point is kept exactly — ok2 sits directly beside ok1, with no gap left by
  // the five fenced entries — and it is now read off `buildBlessingSpreads`.
  const fenceSpreads = buildBlessingSpreads(
    pages, blessingsDayRoster(pages, []), []);
  assert.deepStrictEqual(fenceSpreads.map(function (s) { return s.day; }),
    [label(2026, 7, 24), label(2026, 7, 10)],
    '(5) POSITIVE CONTROL: the survivors produce EXACTLY two spreads, ' +
    "newest day first, and 07/22 — the retired entry's day — is absent. " +
    'Without this the two index assertions below pass over a spread list ' +
    'that still carries a hole, provided the two survivors happen to land ' +
    'at 0 and 1');
  assert.strictEqual(firstSpreadIndexForDay(fenceSpreads, label(2026, 7, 24)),
    0, '(5) ok1 (page 0, the 24th) opens spread 0');
  assert.strictEqual(firstSpreadIndexForDay(fenceSpreads, label(2026, 7, 10)),
    1, '(5) ok2 recomputed to spread 1 — no pagination hole where the five ' +
    'dropped entries sat');

  // the solo-drop edge in isolation: a ledger whose ONE entry is fenced
  // renders an empty book — empty pages, empty roster (the painter then
  // shows the invite line and NO grid).
  const solo = packBlessingsToc(
    { blessings: [entry('ret', ms(2026, 7, 22))] }, items, [], guard);
  assert.deepStrictEqual(solo, [],
    '(5) a book whose only entry dropped is an empty book');
  assert.deepStrictEqual(blessingsMonthRoster(solo), [],
    '(5) and holds no populated month at all');
})();

// ---- 6. DAY ROSTER + DAY NAV (D-C) — lit-day set, door logic, guard ---------
//
// The notebook's day-set == the calendar's lit-day set: the distinct
// local days holding at least one SURVIVING blessing, newest first,
// across months. blessingsDayRoster derives it from the already-guarded
// packBlessingsToc output — never a raw-ledger scan — so a day self-heals
// out of navigation when its last blessing is fenced (law 5 P0). The
// in-book ‹/› step this set with the shipped neighbor-exists door
// pattern: no earlier/later neighbor at the extremes, neither for a lone
// day. NO per-day count field may exist (law 3).

// the roster-index door predicates the painter uses (verbatim shape):
// a NEWER neighbor exists iff idx > 0; an OLDER neighbor exists iff
// idx + 1 < roster.length.
function newerNeighbor(roster, idx) { return idx > 0; }
function olderNeighbor(roster, idx) { return idx + 1 < roster.length; }

// 26.91-06 (D-01, owner-ruled 2026-08-07): REWRITTEN, NEVER DELETED. This
// pin used to read ['day', 'monthKey'] and it pinned the D-C SINGULAR — the
// assumption that every notebook day is a lit day. D-01 promoted the day-set
// to the UNION of lit days and import days, so `lit` is now an ATTRIBUTE of
// an entry rather than the shape of the collection, and the pin moves WITH
// the decision instead of being dropped as inconvenient (the 26.9 rule: a
// test pinning behaviour the owner later changed gets rewritten, never
// deleted). It still bans a per-day count of any kind (law 3).
const DAY_ROSTER_KEYS = ['day', 'monthKey', 'lit'];

(function dayRosterFamily() {
  const items = {
    a: storeItem('a', 'text', 'note a'),
    b: storeItem('b', 'text', 'note b'),
    c: storeItem('c', 'text', 'note c'),
    d: storeItem('d', 'text', 'note d')
  };
  // b and c share the local day 07/21 (c is an hour later); 07/24 and
  // 06/03 are their own days. Input order is scrambled — ms decides.
  const ledger = { blessings: [
    entry('b', ms(2026, 7, 21)),
    entry('d', ms(2026, 6, 3)),
    entry('a', ms(2026, 7, 24)),
    entry('c', ms(2026, 7, 21) + 3600000)
  ] };
  const pages = packBlessingsToc(ledger, items, [], guard);
  const dayRoster = blessingsDayRoster(pages);

  // distinct local days, newest first, ACROSS months — the two 07/21
  // blessings collapse to ONE day; 06/03 rides along a month boundary.
  assert.deepStrictEqual(dayRoster.map(function (r) { return r.day; }),
    [label(2026, 7, 24), label(2026, 7, 21), label(2026, 6, 3)],
    '(6) the day roster holds distinct local days, newest first, across ' +
    'months (two same-day blessings collapse to one day)');

  // each day carries its month key (for the transparent month switch on a
  // cross-month day step) and NOTHING more.
  assert.deepStrictEqual(
    dayRoster.map(function (r) { return r.monthKey; }),
    [monthKey(2026, 7), monthKey(2026, 7), monthKey(2026, 6)],
    '(6) each day carries its own month key');
  dayRoster.forEach(function (r) {
    assert.deepStrictEqual(Object.keys(r).sort(), DAY_ROSTER_KEYS.slice().sort(),
      '(6) a day-roster entry carries exactly {day, monthKey} — no per-day ' +
      'count/total/streak field can exist (law 3), got: ' +
      Object.keys(r).join(','));
  });

  // skip-empty: a day with nothing blessed NEVER appears in the roster —
  // 07/22 and 07/23 (between the lit days) are structurally absent, so the
  // ‹/› can never step onto an empty day.
  const litDays = dayRoster.map(function (r) { return r.day; });
  assert.strictEqual(litDays.indexOf(label(2026, 7, 23)), -1,
    '(6) an empty day (07/23) is never in the lit-day set — day nav skips it');
  assert.strictEqual(litDays.indexOf(label(2026, 7, 22)), -1,
    '(6) an empty day (07/22) is never in the lit-day set');

  // no per-day count anywhere in the roster model.
  const rjson = JSON.stringify(dayRoster);
  ['count', 'total', 'streak', 'gap', 'summary', 'days'].forEach(
    function (word) {
      assert.strictEqual(rjson.toLowerCase().indexOf('"' + word), -1,
        '(6) the day roster carries no ' + word + ' field (law 3)');
    });

  // the door logic over the roster: at the newest end there is no NEWER
  // neighbor; at the oldest end no OLDER neighbor; a middle day has both.
  const last = dayRoster.length - 1;
  assert.strictEqual(newerNeighbor(dayRoster, 0), false,
    '(6) the newest day has no newer neighbor — no out-of-range ‹ renders');
  assert.strictEqual(olderNeighbor(dayRoster, 0), true,
    '(6) the newest day has an older neighbor — › renders');
  assert.strictEqual(olderNeighbor(dayRoster, last), false,
    '(6) the oldest day has no older neighbor — no out-of-range › renders');
  assert.strictEqual(newerNeighbor(dayRoster, last), true,
    '(6) the oldest day has a newer neighbor — ‹ renders');
  assert.strictEqual(newerNeighbor(dayRoster, 1), true,
    '(6) a middle day has a newer neighbor');
  assert.strictEqual(olderNeighbor(dayRoster, 1), true,
    '(6) a middle day has an older neighbor');

  // a single lit day → no ‹/› at all (neither neighbor door opens).
  const soloPages = packBlessingsToc(
    { blessings: [entry('a', ms(2026, 7, 24))] }, items, [], guard);
  const soloRoster = blessingsDayRoster(soloPages);
  assert.strictEqual(soloRoster.length, 1,
    '(6) one blessed day → a single-entry roster');
  assert.strictEqual(newerNeighbor(soloRoster, 0), false,
    '(6) a lone lit day renders no ‹');
  assert.strictEqual(olderNeighbor(soloRoster, 0), false,
    '(6) a lone lit day renders no › — no ‹/› at all');

  // an empty book → an empty roster (the painter then shows the invite).
  assert.deepStrictEqual(blessingsDayRoster([]), [],
    '(6) no blessings → no lit day');
})();

// ---- 6b. DAY-SET GUARD RE-RESOLVE (held out, law 5 P0) ----------------------
//
// The day-set is recomputed over the GUARDED entries on every derivation,
// never cached: when a day's last surviving blessing is retired / never_
// show / trigger-flagged / filter-matched / missing, that day silently
// leaves the roster on the next derivation. Reuses the sentinel-retired
// fixture shape from family 5 — 07/22 held only the retired entry, so it
// darkens and drops out; the survivors' days remain.

(function dayRosterGuardReResolve() {
  const SENTINEL = 'FENCE-SENTINEL';
  const items = {
    ok1: storeItem('ok1', 'text', 'a clean surviving note'),
    ok2: storeItem('ok2', 'text', 'another clean note'),
    ret: Object.assign(storeItem('ret', 'text', SENTINEL + ' retired-item'),
      { state: 'retired' }),
    nev: Object.assign(storeItem('nev', 'text', SENTINEL + ' never-item'),
      { state: 'never_show' }),
    trg: Object.assign(storeItem('trg', 'text', SENTINEL + ' trigger-item'),
      { trigger: true }),
    fil: Object.assign(storeItem('fil', 'text', SENTINEL + ' filter-item'),
      { source: 'screenshots' })
    // 'gone' is deliberately ABSENT from the store — the missing case.
  };
  const filters = [{ facet: 'source', value: 'screenshots' }];
  const ledger = { blessings: [
    entry('ok1', ms(2026, 7, 24), 'kept'),
    entry('ret', ms(2026, 7, 22), 'blessed in july, retired in august'),
    entry('nev', ms(2026, 7, 21), 'now never_show'),
    entry('trg', ms(2026, 7, 20), 'now trigger-flagged'),
    entry('fil', ms(2026, 7, 19), 'now filter-matched'),
    entry('gone', ms(2026, 7, 18), 'item deleted since'),
    entry('ok2', ms(2026, 7, 10), 'also kept')
  ] };

  // derived from the GUARDED pack output (packBlessingsToc runs the real
  // core.js guard) — the day-set is never a raw-ledger scan.
  const pages = packBlessingsToc(ledger, items, filters, guard);
  const dayRoster = blessingsDayRoster(pages);

  // ONLY the survivors' days survive — every fenced/missing day is gone,
  // including 07/22 whose sole blessing was retired (the held-out self-
  // heal: a day darkens and leaves navigation the instant its last
  // surviving blessing is fenced).
  assert.deepStrictEqual(dayRoster.map(function (r) { return r.day; }),
    [label(2026, 7, 24), label(2026, 7, 10)],
    '(6b) the day-set re-resolves through the guard — 07/22 (retired), ' +
    '07/21 (never_show), 07/20 (trigger), 07/19 (filter), 07/18 (missing) ' +
    'all leave; only the surviving days remain');

  // the fenced days are individually absent from navigation.
  const litDays = dayRoster.map(function (r) { return r.day; });
  [22, 21, 20, 19, 18].forEach(function (d) {
    assert.strictEqual(litDays.indexOf(label(2026, 7, d)), -1,
      '(6b) 07/' + d + ' left the lit-day set when its blessing was fenced');
  });

  // no sentinel byte and no explanation reaches the day-set model.
  const rjson = JSON.stringify(dayRoster);
  assert.strictEqual(rjson.indexOf(SENTINEL), -1,
    '(6b) no fenced-item byte reaches the day roster (law 5 P0)');
  ['retired', 'never_show', 'hidden', 'missing', 'dropped', 'reason'].forEach(
    function (word) {
      assert.strictEqual(rjson.indexOf(word), -1,
        "(6b) the day-set never explains a drop — found '" + word + "'");
    });
})();

// ===========================================================================
// ---- 6c. 26.91-06 (D-01) — THE GUARDED ARRIVAL PACKER + THE PROMOTED -------
// ----      DAY ROSTER. The assumption delta, and its defence.         -------
// ===========================================================================
//
// THE ASSUMPTION DELTA, in three lines (the group's own header, so a reader
// of this test knows what it is defending):
//   NOUN     — a notebook day.
//   DECISION — `promote`. blessingsDayRoster is generalized IN PLACE to the
//              UNION of lit days and import days; the old singular (*every
//              notebook day is a lit day*) is demoted to `lit: true`, an
//              ATTRIBUTE of one variant, not the shape of the collection.
//   WHY      — the page-flip order is the FIRST consumer that would have to
//              sort the two kinds against each other, so an add-alongside
//              second roster would need an interleave rule immediately, and
//              two rosters that must agree are two rosters that can disagree.
//
// Owner ruling of record, 2026-08-07 (26.91-CONTEXT.md A-8): import days
// become openable pages reachable by the prev/next page flip, and their
// calendar cells stay UNLIT AND UNTAPPABLE. `lit` keeps meaning exactly
// *you welcomed something* (law 3). No third visual state, no count anywhere.

// The D-C SINGULAR, FROZEN VERBATIM at 26.91-06 from the shipped
// blessingsDayRoster at wave-5 HEAD `b3d3da7`. This is the BACKWARD-
// COMPATIBILITY ORACLE and it is deliberately a copy: its whole job is to
// not change when app.js does, so a one-argument call can be compared to
// what the function ACTUALLY returned before the promotion rather than to a
// remembered description of it. A mirror that is never compared to its
// original is the defect class; this one is compared, below, on every run.
function shippedDayRosterOracle(entries) {
  var list = entries || [];
  var seen = {};
  var roster = [];
  for (var i = 0; i < list.length; i++) {
    var key = list[i].dayLabel;
    if (!(key in seen)) {
      seen[key] = true;
      roster.push({ day: key, monthKey: list[i].monthKey });
    }
  }
  return roster;
}

// 26.91-06 PLAN CONTRADICTION, RESOLVED HERE AND RECORDED RATHER THAN
// ABSORBED. The plan's <behavior>, its <action>(a) and its must_have truth
// on ENCODING all three name SIX fields — {ms, dayLabel, monthKey, kind,
// folder, source} — while its acceptance_criteria list FIVE, dropping
// `dayLabel`. Six wins, 3-to-1, and structurally: blessingsDayRoster reads
// `arrivals[i].dayLabel`, so a five-field entry cannot be merged at all and
// the acceptance list as written is unsatisfiable. Pinned by VALUE so the
// resolution is a decision on the record, not a silently widened list.
const ARRIVAL_KEYS = ['dayLabel', 'folder', 'kind', 'monthKey', 'ms',
  'source'];

// A store item that ARRIVED — storeItem's shape plus the three fields the
// arrival packer is allowed to read. `origin_path` is deliberately present
// and deliberately POISONED: measured, the real one carries the fenced
// parent `personnel notes/` and the owner's username, and on the opaque days it
// resolves into a /var/folders/.../T/ temp dir. The key-set pin below is
// what proves the packer never reads it.
function arrivalItem(id, importedMs, opts) {
  const o = opts || {};
  return Object.assign(
    storeItem(id, o.type || 'text', o.title),
    {
      imported_ms: importedMs,
      folder: o.folder === undefined ? 'Clippings' : o.folder,
      source: o.source === undefined ? 'folder-drop' : o.source,
      origin_path: '/var/folders/zz/T/POISON-ORIGIN-PATH/' + id + '.md'
    },
    o.over || {});
}

function shuffled(list, seedStep) {
  // deterministic rotation-and-swap; no clock, no Math.random (a shuffle
  // driven by a PRNG would make this gate's own input unreproducible).
  const out = list.slice();
  for (let i = 0; i < out.length; i++) {
    const j = (i * seedStep + 1) % out.length;
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

(function arrivalPackerFamily() {
  const store = {
    n1: arrivalItem('n1', ms(2026, 7, 19), { folder: 'Clippings' }),
    n2: arrivalItem('n2', ms(2026, 7, 19) + 60000, { folder: 'Wiki' }),
    p1: arrivalItem('p1', ms(2026, 7, 22), { type: 'image',
      folder: 'Photos', source: 'apple-photos' }),
    // no imported_ms at all — never arrived, so never an arrival day.
    old: storeItem('old', 'text', 'an item with no arrival stamp')
  };

  // ---- (1) FAIL-CLOSED, THE FIRST DISJUNCT, DRIVEN ----------------------
  // Routed through a helper that turns a THROW into a failure on THIS
  // assertion. Written as a bare `deepStrictEqual(pack(...), [])` first,
  // and mutation-testing showed the honest failure mode is a raw
  // `TypeError: guard is not a function` thrown from inside the call — so
  // the assertion never evaluated and the gate reported the crash rather
  // than the contract. Red is not enough; it has to be red HERE.
  function packFailClosed(g, what) {
    try {
      return packArrivalDays(store, [], g);
    } catch (e) {
      assert.fail('(6c) packArrivalDays with ' + what + ' THREW (' +
        e.message + ') instead of returning []. The fail-closed ' +
        '`typeof guard !== \'function\'` disjunct must be FIRST, so a ' +
        'missing guard yields EMPTY output rather than OPEN output or a ' +
        'crash (law 5 P0)');
    }
  }
  assert.deepStrictEqual(packFailClosed(undefined, 'NO guard'), [],
    '(6c) packArrivalDays with NO guard returns [] — the fail-closed ' +
    '`typeof guard !== \'function\'` disjunct is FIRST, so a missing guard ' +
    'yields EMPTY output rather than OPEN output (law 5 P0)');
  assert.deepStrictEqual(packFailClosed(null, 'a null guard'), [],
    '(6c) a null guard is fail-closed too — the check is on callability, ' +
    'not on truthiness');
  assert.deepStrictEqual(packFailClosed({}, 'a non-callable object'), [],
    '(6c) a truthy but non-callable guard is fail-closed too — the check ' +
    'is `typeof g !== \'function\'`, never `!g`');
  assert.deepStrictEqual(
    packArrivalDays(store, [], function () { return 'blocked'; }), [],
    '(6c) a guard that rejects everything yields [] — and no reason field');

  // ---- (2) THE REAL core.js GUARD ADMITS, AND THE KEY SET IS PINNED -----
  const arrivals = packArrivalDays(store, [], guard);
  assert.strictEqual(arrivals.length, 3,
    '(6c) POSITIVE CONTROL: with the REAL core.js guardSurface the packer ' +
    'returns one entry per surviving stamped item (3 of 4 — `old` carries ' +
    'no imported_ms). Without this the three [] results above are ' +
    'satisfied by a packer that always returns []');
  arrivals.forEach(function (a) {
    assert.deepStrictEqual(Object.keys(a).sort(), ARRIVAL_KEYS.slice().sort(),
      '(6c) an arrival entry carries EXACTLY {folder,kind,monthKey,ms,' +
      'source} — no reason (a gap tell is a law-5 leak in a different ' +
      'costume), no origin_path, no count, no body. Got: ' +
      Object.keys(a).join(','));
  });
  const ajson = JSON.stringify(arrivals);
  assert.strictEqual(ajson.indexOf('POISON-ORIGIN-PATH'), -1,
    '(6c) origin_path never reaches the model — it carries the fenced ' +
    'parent `personnel notes/`, the owner\'s username, and a temp dir');
  assert.strictEqual(ajson.indexOf('PRIVATE CONTENT'), -1,
    '(6c) no item body reaches the model');
  ['reason', 'count', 'total', 'withheld', 'hidden', 'skipped'].forEach(
    function (word) {
      assert.strictEqual(ajson.toLowerCase().indexOf('"' + word), -1,
        '(6c) the arrival model carries no ' + word + ' field');
    });

  // ---- (3) kind IS DERIVED FROM type, AND IS ALWAYS PLURAL --------------
  const byMs = {};
  arrivals.forEach(function (a) { byMs[a.ms] = a; });
  assert.strictEqual(byMs[ms(2026, 7, 19)].kind, 'notes',
    '(6c) a text item is `notes`');
  assert.strictEqual(byMs[ms(2026, 7, 22)].kind, 'photographs',
    '(6c) an image item is `photographs`');

  // ---- (4) THE DAY/MONTH SPELLINGS ARE THE SHIPPED FORMATTERS ----------
  // LIFTED from real source, never re-typed: a second spelling would
  // silently orphan decorations.json records, which are keyed by dayLabel.
  arrivals.forEach(function (a) {
    assert.strictEqual(a.dayLabel, blessingDayLabel(a.ms),
      '(6c) day identity is blessingDayLabel(ms)\'s MM/DD/YYYY local ' +
      'spelling, reused verbatim');
    assert.strictEqual(a.monthKey, lifted.blessingMonthKey(a.ms),
      '(6c) month identity is blessingMonthKey(ms)\'s YYYY-MM local ' +
      'spelling, reused verbatim');
  });
  // The two formatter assertions above are only meaningful because the
  // packer does NOT re-spell either format: prove it at source, over the
  // extracted function text, so a hand-rolled MM/DD/YYYY inside
  // packArrivalDays fails here even though its OUTPUT would still match.
  const packSrc = extractFn(appSrc, 'packArrivalDays');
  assert.ok(packSrc.indexOf('blessingDayLabel(') !== -1,
    '(6c) packArrivalDays CALLS blessingDayLabel — the shipped formatter ' +
    'is reused, never re-spelled. A second spelling would silently orphan ' +
    'decorations.json records, which are keyed by dayLabel');
  assert.ok(packSrc.indexOf('blessingMonthKey(') !== -1,
    '(6c) ...and it CALLS blessingMonthKey for the same reason');
  assert.strictEqual(stripComments(packSrc).indexOf('origin_path'), -1,
    '(6c) `origin_path` appears ZERO times inside packArrivalDays, over ' +
    'COMMENT-STRIPPED source — so the reason written at the site cannot ' +
    'satisfy the ban that the reason exists to explain');
  // ...and the whole file's CODE occurrences are pinned BY VALUE at the
  // wave-5 count. 26.91-06's acceptance asked for the RAW `grep -c` to be
  // unchanged, which is unsatisfiable alongside the same plan's demand that
  // the reason (fenced parent `personnel notes/`, her username, a temp dir) be
  // WRITTEN AT THE SITE — the comment raises the raw line count to 2 by
  // design. The comment-stripped count is the honest form of that control
  // and it is the one pinned. A one-line by-value pin, so a fourth code
  // read fails here rather than hiding inside an "unchanged" that prose
  // already moved.
  //
  // ⚠ RE-MEASURED 2026-08-14 (26.95-05): 1 -> 0, and the pin is STRICTLY
  // STRONGER at zero. The single code read lived in `cleaningCandidates`,
  // the per-note tick screen's candidate builder, which #86 ruling 2 retired
  // — she picks a PLACE and approves a CHANGE now, and the client never sees
  // or sends a vault path at all: it sends ids, and the server resolves each
  // one to a path through the store. So app.js has no legitimate reason to
  // touch `origin_path` any more, and "zero" says exactly that.
  //
  // The comment above still reads true: a code read appearing here fails
  // rather than hiding inside prose. app.js keeps two PROSE mentions (both
  // of them bans, at the two sites where reading it would be the bug), and
  // the comment-stripped count ignores those by construction.
  assert.strictEqual(
    (stripComments(appSrc).match(/origin_path/g) || []).length, 0,
    '(6c) app.js CODE reads `origin_path` ZERO times in the whole file — ' +
    'the last read went with the retired per-note tick screen (#86 ruling ' +
    '2), and the client now sends ids while the SERVER resolves paths. ' +
    'Comment-stripped and pinned ' +
    'BY VALUE. Wave 6 added a mention of it in PROSE only');

  // ---- (5) PRECISION: LOCAL MIDNIGHT, ONE MILLISECOND EITHER SIDE ------
  const midnight = new Date(2026, 6, 20, 0, 0, 0, 0).getTime();
  const edge = {
    before: arrivalItem('before', midnight - 1),
    at: arrivalItem('at', midnight),
    after: arrivalItem('after', midnight + 1)
  };
  const edgeDays = packArrivalDays(edge, [], guard)
    .map(function (a) { return a.dayLabel; });
  assert.strictEqual(edgeDays.indexOf(label(2026, 7, 19)) !== -1, true,
    '(6c) one ms BEFORE local midnight belongs to the previous local day');
  assert.strictEqual(edgeDays.indexOf(label(2026, 7, 20)) !== -1, true,
    '(6c) local midnight itself, and one ms after, belong to the new day');
  assert.notStrictEqual(
    packArrivalDays({ b: edge.before }, [], guard)[0].dayLabel,
    packArrivalDays({ a: edge.at }, [], guard)[0].dayLabel,
    '(6c) two arrivals ONE MILLISECOND either side of local midnight land ' +
    'on DIFFERENT days — day bucketing uses the LOCAL day boundary');

  // ---- (6) IDEMPOTENCY, BY COMPARISON NOT BY REASONING ABOUT PURITY ----
  assert.deepStrictEqual(packArrivalDays(store, [], guard),
    packArrivalDays(store, [], guard),
    '(6c) two consecutive derivations over identical input are deep-equal');
})();

// ---- 6c(b) THE FENCE, DRIVEN — a day self-heals OUT between two runs ------
//
// HELD OUT (law 5 P0). The pack is re-derived on every paint, so flipping
// the last surviving arrival of a day to never_show and re-running THE SAME
// CALL WITH THE SAME ARGUMENTS must remove that day. A cached fence passes
// the first half and fails the second — which is the point.

(function arrivalFenceDriven() {
  const SENTINEL = 'ARRIVAL-FENCE-SENTINEL';
  const store = {
    keep: arrivalItem('keep', ms(2026, 7, 19), { folder: 'Clippings' }),
    // 07/26 has EXACTLY ONE arrival — the boundary where a day is in the
    // roster at 1 and out at 0.
    lone: arrivalItem('lone', ms(2026, 7, 26),
      { title: SENTINEL + ' the only arrival of its day',
        folder: SENTINEL + '-folder' })
  };

  const before = packArrivalDays(store, [], guard);
  assert.deepStrictEqual(before.map(function (a) { return a.dayLabel; })
    .sort(), [label(2026, 7, 19), label(2026, 7, 26)].sort(),
    '(6c-b) BOUNDARY: a day with EXACTLY ONE surviving arrival IS in the ' +
    'pack');

  // the SAME call, the SAME arguments, one item's state flipped.
  store.lone.state = 'never_show';
  const after = packArrivalDays(store, [], guard);
  assert.deepStrictEqual(after.map(function (a) { return a.dayLabel; }),
    [label(2026, 7, 19)],
    '(6c-b) BOUNDARY: a day with ZERO surviving arrivals is NOT — driven ' +
    'by flipping the last surviving arrival between two runs of the SAME ' +
    'call with the SAME arguments (a cached fence fails exactly here)');
  assert.strictEqual(JSON.stringify(after).indexOf(SENTINEL), -1,
    '(6c-b) not one fenced byte reaches the model, and nothing explains ' +
    'the drop (law 5 P0)');

  // every fenced state the real guard knows, driven together.
  const fenced = {
    ok: arrivalItem('ok', ms(2026, 7, 19)),
    ret: arrivalItem('ret', ms(2026, 7, 1), { over: { state: 'retired' } }),
    nev: arrivalItem('nev', ms(2026, 7, 2), { over: { state: 'never_show' } }),
    trg: arrivalItem('trg', ms(2026, 7, 3), { over: { trigger: true } }),
    fil: arrivalItem('fil', ms(2026, 7, 4), { source: 'screenshots' })
  };
  const filters = [{ facet: 'source', value: 'screenshots' }];
  assert.deepStrictEqual(
    packArrivalDays(fenced, filters, guard)
      .map(function (a) { return a.dayLabel; }),
    [label(2026, 7, 19)],
    '(6c-b) retired / never_show / trigger-flagged / filter-matched ' +
    'arrivals are all dropped silently by the REAL core.js guard — the ' +
    'filters arrive as an ARGUMENT, exactly as packBlessingsToc takes them');
})();

// ---- 6c(c) THE PROMOTED ROSTER — backward compatibility, then the union --

(function promotedDayRosterFamily() {
  const items = {
    a: storeItem('a', 'text', 'note a'),
    b: storeItem('b', 'text', 'note b'),
    c: storeItem('c', 'text', 'note c'),
    d: storeItem('d', 'text', 'note d')
  };
  const ledger = { blessings: [
    entry('b', ms(2026, 7, 21)),
    entry('d', ms(2026, 6, 3)),
    entry('a', ms(2026, 7, 24)),
    entry('c', ms(2026, 7, 21) + 3600000)
  ] };
  const pages = packBlessingsToc(ledger, items, [], guard);

  // ---- (1) THE ONE-ARGUMENT CALL STILL WORKS -----------------------------
  const oneArg = blessingsDayRoster(pages);
  const twoArgEmpty = blessingsDayRoster(pages, []);
  assert.deepStrictEqual(oneArg, twoArgEmpty,
    '(6c-c) the one-argument call and the empty-arrivals call are ' +
    'deep-equal — the shipped call shape still works');
  assert.deepStrictEqual(blessingsDayRoster(pages, undefined), oneArg,
    '(6c-c) an explicitly undefined second argument is the same call');

  // ---- (2) COMPARED TO THE FROZEN D-C ORACLE, NOT TO A DESCRIPTION -------
  // The ONLY difference a one-argument call may have from the shipped
  // singular is the added `lit` attribute. Everything else — the day
  // sequence, the month keys, the dedupe, the ordering — must be byte-
  // identical to what actually shipped.
  assert.deepStrictEqual(
    oneArg.map(function (r) { return { day: r.day, monthKey: r.monthKey }; }),
    shippedDayRosterOracle(pages),
    '(6c-c) BACKWARD COMPATIBILITY: strip `lit` from the one-argument ' +
    'call and it deep-equals the FROZEN shipped D-C roster, over the same ' +
    'fixture. Compared to the real prior implementation, not to a memory ' +
    'of it');
  assert.ok(shippedDayRosterOracle(pages).length === 3,
    '(6c-c) POSITIVE CONTROL: the oracle is not returning [] — the ' +
    'comparison above is over three real days, not over two empties');
  oneArg.forEach(function (r) {
    assert.strictEqual(r.lit, true,
      '(6c-c) ...and every entry of a one-argument call is `lit: true` — ' +
      'the old singular DEMOTED to an attribute, present rather than ' +
      'implied');
  });

  // ---- (3) THE UNION: lit-only, import-only, and BOTH --------------------
  // 07/24 and 06/03 are lit-only; 07/21 is BOTH; 07/19 and 08/06 are
  // import-only. Two of her seven real import days are also lit days, so
  // the BOTH case is driven over a fixture that contains one.
  const arrivals = [
    { ms: ms(2026, 7, 19), dayLabel: label(2026, 7, 19),
      monthKey: monthKey(2026, 7), kind: 'notes', folder: 'Clippings',
      source: 'folder-drop' },
    { ms: ms(2026, 7, 21) + 7200000, dayLabel: label(2026, 7, 21),
      monthKey: monthKey(2026, 7), kind: 'notes', folder: 'Wiki',
      source: 'obsidian-vault' },
    { ms: ms(2026, 8, 6), dayLabel: label(2026, 8, 6),
      monthKey: monthKey(2026, 8), kind: 'photographs', folder: 'Photos',
      source: 'folder-drop' }
  ];
  const merged = blessingsDayRoster(pages, arrivals);

  assert.deepStrictEqual(merged.map(function (r) { return r.day; }),
    [label(2026, 8, 6), label(2026, 7, 24), label(2026, 7, 21),
      label(2026, 7, 19), label(2026, 6, 3)],
    '(6c-c) ORDERING: the merged roster is newest-first ACROSS MONTHS, and ' +
    'a lit day and an import day on the SAME local day COLLAPSE to one ' +
    'entry rather than sorting against each other');

  assert.deepStrictEqual(merged.map(function (r) { return r.lit; }),
    [false, true, true, false, true],
    '(6c-c) ADJACENCY: 07/21 is BOTH an import day and a lit day and it ' +
    'appears EXACTLY ONCE, with lit:true — welcoming wins. 08/06 and ' +
    '07/19 are import-only and carry lit:false');

  const dayCounts = {};
  merged.forEach(function (r) {
    dayCounts[r.day] = (dayCounts[r.day] || 0) + 1;
  });
  Object.keys(dayCounts).forEach(function (d) {
    assert.strictEqual(dayCounts[d], 1,
      '(6c-c) every day appears exactly once in the merged roster — ' + d);
  });

  merged.forEach(function (r) {
    assert.deepStrictEqual(Object.keys(r).sort(),
      DAY_ROSTER_KEYS.slice().sort(),
      '(6c-c) a merged entry carries exactly {day, monthKey, lit} — no ' +
      'per-day count/total/streak field can exist (law 3), got: ' +
      Object.keys(r).join(','));
  });
  assert.deepStrictEqual(
    merged.map(function (r) { return r.monthKey; }),
    [monthKey(2026, 8), monthKey(2026, 7), monthKey(2026, 7),
      monthKey(2026, 7), monthKey(2026, 6)],
    '(6c-c) every entry still carries its own month key, import days ' +
    'included — a cross-month day step can still switch the calendar');
  const mjson = JSON.stringify(merged);
  ['count', 'total', 'streak', 'gap', 'summary'].forEach(function (word) {
    assert.strictEqual(mjson.toLowerCase().indexOf('"' + word), -1,
      '(6c-c) the merged roster carries no ' + word + ' field (law 3)');
  });

  // ---- (4) ORDERING IS DETERMINISTIC UNDER SHUFFLE ----------------------
  [2, 3, 5].forEach(function (step) {
    assert.deepStrictEqual(
      blessingsDayRoster(shuffled(pages, step), shuffled(arrivals, step)),
      merged,
      '(6c-c) shuffling EITHER input array produces a deep-equal roster ' +
      '(shuffle step ' + step + ') — no clock, no Math.random, no ' +
      'insertion-order dependence');
  });

  // ---- (5) IDEMPOTENCY AND CONCURRENCY ---------------------------------
  assert.deepStrictEqual(blessingsDayRoster(pages, arrivals), merged,
    '(6c-c) IDEMPOTENCY: two consecutive derivations over identical input ' +
    'are deep-equal — asserted by calling it twice, not by reasoning about ' +
    'purity');
  // interleaved: a repaint mid-import cannot produce a torn roster, it
  // produces either the old one or the new one.
  const halfArrivals = arrivals.slice(0, 1);
  const runA1 = blessingsDayRoster(pages, halfArrivals);
  const runB1 = blessingsDayRoster(pages, arrivals);
  const runA2 = blessingsDayRoster(pages, halfArrivals);
  const runB2 = blessingsDayRoster(pages, arrivals);
  assert.deepStrictEqual(runA1, runA2,
    '(6c-c) CONCURRENCY: interleaving two different inputs leaves each ' +
    'result equal to its OWN input\'s result — the roster derives only ' +
    'from its arguments');
  assert.deepStrictEqual(runB1, runB2,
    '(6c-c) CONCURRENCY: ...and the same for the other input');
  assert.notDeepStrictEqual(runA1, runB1,
    '(6c-c) POSITIVE CONTROL: the two inputs really do produce different ' +
    'rosters, so the two equalities above are not both trivially true');

  // ---- (6) EMPTY, THREE WAYS, ALL DRIVEN, NONE THROWS -------------------
  assert.deepStrictEqual(blessingsDayRoster([], []), [],
    '(6c-c) EMPTY: both empty yields [] — the painter then shows the ' +
    'invite');
  assert.deepStrictEqual(blessingsDayRoster(pages, []).map(function (r) {
    return r.day;
  }), [label(2026, 7, 24), label(2026, 7, 21), label(2026, 6, 3)],
  '(6c-c) EMPTY: an empty arrivals array yields only the lit side');
  const arrivalsOnly = blessingsDayRoster([], arrivals);
  assert.deepStrictEqual(arrivalsOnly.map(function (r) { return r.day; }),
    [label(2026, 8, 6), label(2026, 7, 21), label(2026, 7, 19)],
    '(6c-c) EMPTY: an empty blessings array yields only the import side');
  arrivalsOnly.forEach(function (r) {
    assert.strictEqual(r.lit, false,
      '(6c-c) EMPTY: ...and with nothing welcomed, NOTHING is lit');
  });
})();

// ---- 6c(d) REACHABILITY — an import day is really ON the page flip --------
//
// The roster half above proves an import day is IN the day-set. That is not
// the same claim as *she can reach it*, and the difference is exactly this
// phase's defect class: buildBlessingSpreads chunks a day's blessing pages
// two at a time, so a day with ZERO blessings emitted NOTHING from that loop
// and would have sat in the roster, invisible, while every assertion above
// stayed green. Driven here over the shape her real library actually has —
// the NEWEST day is import-only (08/06 imported; 07/30 is the newest lit
// day) — because that is also the case where the shipped `pages: [de[0]]`
// produced `[undefined]`.

// 26.91-13 (D-1): `buildBlessingSpreads`' lift MOVED UP, to sit beside the
// other model lifts near the top of this file. It is unchanged; only its
// position moved, so that the calendar family and the fence-survivor family
// can assert against the REAL builder instead of against a test-local copy
// of the formula they were checking. See the note at the lift.

(function importDayReachability() {
  const items = { a: storeItem('a', 'text', 'note a'),
    b: storeItem('b', 'text', 'note b') };
  const pages = packBlessingsToc({ blessings: [
    entry('a', ms(2026, 7, 30)),
    entry('b', ms(2026, 7, 27))
  ] }, items, [], guard);
  const arrivals = [
    // the NEWEST day of all, and import-only — the di === 0 case.
    { ms: ms(2026, 8, 6), dayLabel: label(2026, 8, 6),
      monthKey: monthKey(2026, 8), kind: 'photographs', folder: 'Photos',
      source: 'folder-drop' },
    // an import-only day in the MIDDLE of the flip order.
    { ms: ms(2026, 7, 28), dayLabel: label(2026, 7, 28),
      monthKey: monthKey(2026, 7), kind: 'notes', folder: 'Clippings',
      source: 'folder-drop' },
    // 07/30 is BOTH — it must not gain a duplicate spread.
    { ms: ms(2026, 7, 30) + 60000, dayLabel: label(2026, 7, 30),
      monthKey: monthKey(2026, 7), kind: 'notes', folder: 'Wiki',
      source: 'obsidian-vault' }
  ];
  const roster = blessingsDayRoster(pages, arrivals);
  // 26.91-07: THE SHIPPED CALL TAKES THREE ARGUMENTS. `spreads` is the
  // shipped shape (the trace page mints the import day's page); `legacy` is
  // the TWO-argument call, kept and driven so the `made === 0` empty-page
  // fallback stays REACHABLE. Unreachable defensive code that no mutation
  // can redden is this project's named defect class, so the branch is
  // exercised by name rather than left to rot behind the shipped path.
  const spreads = buildBlessingSpreads(pages, roster, arrivals);
  const legacy = buildBlessingSpreads(pages, roster);

  assert.deepStrictEqual(roster.map(function (r) { return r.day; }),
    [label(2026, 8, 6), label(2026, 7, 30), label(2026, 7, 28),
      label(2026, 7, 27)],
    '(6c-d) the roster interleaves import days and lit days in date order');

  // EVERY day in the roster has at least one spread — the reachability
  // claim, stated as a set equality rather than as a count so a day that
  // gained a spread while another lost one cannot pass.
  const spreadDays = [];
  spreads.forEach(function (s) {
    if (spreadDays.indexOf(s.day) === -1) { spreadDays.push(s.day); }
  });
  assert.deepStrictEqual(spreadDays, roster.map(function (r) {
    return r.day;
  }), '(6c-d) REACHABILITY: every day in the roster — import-only days ' +
    'INCLUDED — has at least one spread, in the same order, so one press ' +
    'of › really does step onto it. Set equality, not a count');

  // ...and the import-only days really are the ones that would have been
  // missing. Without this, the equality above passes over a roster that
  // happens to hold only lit days.
  assert.strictEqual(spreadDays.indexOf(label(2026, 8, 6)) !== -1, true,
    '(6c-d) POSITIVE CONTROL: 08/06 is import-only and IS reachable');
  assert.strictEqual(spreadDays.indexOf(label(2026, 7, 28)) !== -1, true,
    '(6c-d) POSITIVE CONTROL: 07/28 is import-only, sits mid-flip, and IS ' +
    'reachable — a fix that only handled the newest day fails here');

  // NO SPREAD CARRIES AN UNDEFINED PAGE. The shipped `pages: [de[0]]` on
  // spread 0 produced `[undefined]` the moment the newest day stopped
  // being a lit day, which on her real library is TODAY.
  spreads.forEach(function (s) {
    s.pages.forEach(function (p, i) {
      assert.ok(p && typeof p === 'object',
        '(6c-d) no spread carries an undefined page — ' + s.day +
        ' page ' + i);
    });
  });
  // 26.91-07 REWRITTEN, NEVER DELETED. This pinned spread 0 as an EMPTY
  // page list, which was correct while the import day's page had nothing on
  // it yet — 26.91-06's own comment said the trace line was "a later plan's
  // deliverable". It is now that plan, so the pin MOVES with the behaviour:
  // the newest day is import-only, so spread 0 pairs the calendar with that
  // day's TRACE page.
  //
  // 26.91-10 REWRITTEN AGAIN, STILL NEVER DELETED — F-1 (26.91-UAT.md) is
  // the authority. THE ORIGINAL REASON IS UNCHANGED and is still what this
  // line is for: the newest day on her real library is IMPORT-ONLY, and the
  // shipped `pages: [de[0]]` produced `[undefined]` the moment that became
  // true. WHAT MOVED: the spread-level grid discriminator is GONE from the
  // emitted object, because the month grid is now the permanent left half of
  // every spread rather than something spread 0 carries — so a field that
  // could only ever hold one value would carry no information. The page
  // itself is unchanged.
  assert.deepStrictEqual(spreads[0], {
    day: label(2026, 8, 6), monthKey: monthKey(2026, 8),
    pages: [{ trace: true, day: label(2026, 8, 6),
      monthKey: monthKey(2026, 8), arrivals: [arrivals[0]] }]
  }, '(6c-d/F-1) the newest day is import-only, so spread 0 carries that ' +
     'day\'s TRACE page — never [undefined], and never empty now that the ' +
     'page has something on it. F-1: the emitted object carries NO ' +
     'spread-level grid discriminator, because the grid is painted on ' +
     'every spread and a constant-valued field carries no information');
  // ...and the TWO-argument call still yields the empty-page fallback, so
  // that branch is reachable and driven rather than dead.
  //
  // 26.91-10: same rewrite, same reason — the discriminator is gone from
  // this shape too. The `made === 0` branch itself is UNTOUCHED and is
  // still the only producer of a page-less spread.
  assert.deepStrictEqual(legacy[0],
    { day: label(2026, 8, 6), monthKey: monthKey(2026, 8), pages: [] },
    '(6c-d/F-1) THE TWO-ARGUMENT FALLBACK, DRIVEN: a caller that omits ' +
    '`arrivals` still gets a reachable day, with an empty page list rather ' +
    'than [undefined]. This is the `made === 0` branch, exercised by name');
  const legacyDays = [];
  legacy.forEach(function (s) {
    if (legacyDays.indexOf(s.day) === -1) { legacyDays.push(s.day); }
  });
  assert.deepStrictEqual(legacyDays, roster.map(function (r) {
    return r.day;
  }), '(6c-d) ...and REACHABILITY holds on the two-argument path too');

  // a day that is BOTH keeps its blessing page and gains no duplicate.
  const bothSpreads = spreads.filter(function (s) {
    return s.day === label(2026, 7, 30);
  });
  assert.strictEqual(bothSpreads.length, 1,
    '(6c-d) a day that is BOTH an import day and a lit day gets exactly ' +
    'one spread — the empty-day fallback must not fire on it. 26.91-10: ' +
    'the value is UNMOVED at 1, but for a second reason now — that day ' +
    'holds ONE surviving blessing and one page per spread, and F-3 mints ' +
    'it NO extra bare-date page');
  // 26.91-10 REWRITTEN, NEVER DELETED — F-3 is the authority. THE ORIGINAL
  // REASON STANDS: this asserts by POSITION, so a page landing in the wrong
  // slot fails here rather than satisfying a membership check. WHAT MOVED:
  // wave 7 appended the trace as the day's LAST page in BOTH cases, so the
  // expected shape was [false, true]. F-3 takes the composed sentence off
  // the trace page, and a bare-date page wedged between blessing pages is a
  // page with no reason to exist — so a LIT day now gets NO trace page at
  // all and the expected shape is [false]. The adjacency claim is the point:
  // this is the assertion mutation (4) reddens.
  assert.deepStrictEqual(
    bothSpreads[0].pages.map(function (p) { return !!p.trace; }),
    [false],
    '(6c-d/F-3) ADJACENCY: a day that is BOTH lit and imported yields its ' +
    'blessing page and NO bare-date page. Asserted by POSITION over the ' +
    'whole page list, so a trace page minted anywhere on a lit day fails ' +
    'here rather than satisfying a membership check');
  assert.strictEqual(legacy.filter(function (s) {
    return s.day === label(2026, 7, 30);
  })[0].pages.length, 1,
    '(6c-d) ...while the two-argument call leaves that day with its ' +
    'blessing page alone');
})();

// ===========================================================================
// ---- 6e. 26.91-06 — THE ZERO-OVERLAP FIXTURE, G-B5, AND THE ---------------
// ----      GENERALIZATION INVARIANT                            ---------------
// ===========================================================================
//
// THE ASSUMPTION DELTA THIS GROUP DEFENDS, in three lines:
//   NOUN     — a notebook day.
//   DECISION — `promote`: the day-set is the UNION of lit days and import
//              days, and `lit` is an attribute of an entry.
//   WHY      — the page-flip order is the first consumer that would have to
//              sort the two kinds against each other, so an add-alongside
//              second roster would need an interleave rule immediately.
//
// It goes RED the instant a future phase reintroduces the singular — by
// filtering the roster back down to lit days, or by dropping `lit` as
// redundant.

const ZO = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', '26.91-zero-overlap-days.json'), 'utf8'));

// [y, m, d, h] -> local epoch ms, the shipped local-noon-ish idiom. A
// hardcoded epoch in the fixture would name a DIFFERENT local calendar day
// in a different machine timezone, and every day-bucketing assertion in
// this suite depends on that not happening.
function atMs(a) { return new Date(a[0], a[1] - 1, a[2], a.length > 3 ? a[3] : 12).getTime(); }
function atLabel(a) { return label(a[0], a[1], a[2]); }

// Hydrate a fixture section into the shapes the real functions take.
function hydrate(section) {
  const items = {};
  Object.keys(section.items).forEach(function (id) {
    const it = Object.assign({}, section.items[id]);
    if (it.at) { it.imported_ms = atMs(it.at); }
    delete it.at;
    items[id] = it;
  });
  const ledger = { blessings: section.blessings.map(function (b) {
    return { item_id: b.item_id, ms: atMs(b.at), why: b.why };
  }) };
  return { items: items, ledger: ledger };
}

(function zeroOverlapFixtureIsHonest() {
  const zo = ZO.zero_overlap;

  // ---- (0) THE FIXTURE'S CENTRAL PROPERTY IS ITSELF ASSERTED ------------
  // Without this, a later edit can quietly reintroduce an overlap and
  // hollow out every gate below while they all stay green.
  const impDays = zo.declared_import_days.map(atLabel);
  const litDays = zo.declared_blessing_days.map(atLabel);
  const intersection = impDays.filter(function (d) {
    return litDays.indexOf(d) !== -1;
  });
  assert.deepStrictEqual(intersection, [],
    '(6e) THE FIXTURE IS ZERO-OVERLAP: its import days and its blessing ' +
    'days do not intersect. This is the property every gate below rests ' +
    'on and it is checked rather than trusted — on the owner\'s REAL ' +
    'library 07-27 and 07-30 are BOTH, so a gate of the form "the trace ' +
    'renders on at least one page" passes today under the SUPERSEDED ' +
    'design and measures nothing');
  assert.ok(impDays.length >= 2 && litDays.length >= 1,
    '(6e) POSITIVE CONTROL: both declared day sets are non-empty, so the ' +
    'disjointness above is a real disjointness and not two empty lists');

  // ...and the declared sets are the sets the fixture's DATA actually
  // produces. A declaration nobody checks against the payload is a comment.
  const h = hydrate(zo);
  const packedArrivals = packArrivalDays(h.items, [], guard);
  const packedBlessings = packBlessingsToc(h.ledger, h.items, [], guard);
  const liveImpDays = [];
  packedArrivals.forEach(function (a) {
    if (liveImpDays.indexOf(a.dayLabel) === -1) {
      liveImpDays.push(a.dayLabel);
    }
  });
  const liveLitDays = [];
  packedBlessings.forEach(function (e) {
    if (liveLitDays.indexOf(e.dayLabel) === -1) {
      liveLitDays.push(e.dayLabel);
    }
  });
  assert.deepStrictEqual(liveLitDays.slice().sort(), litDays.slice().sort(),
    '(6e) the fixture\'s DECLARED blessing days are the days its ledger ' +
    'actually produces');
  assert.deepStrictEqual(
    liveImpDays.filter(function (d) { return liveLitDays.indexOf(d) !== -1; }),
    [], '(6e) ...and the LIVE day sets are disjoint too, not only the ' +
    'declared ones');

  // ---- (1) THE FENCED-ONLY DAY IS GONE, THE LONE-ARRIVAL DAY IS NOT -----
  const fencedDay = atLabel(zo._import_only_day_all_fenced);
  const loneDay = atLabel(zo._import_only_day_with_exactly_one);
  const manyDay = atLabel(zo._import_only_day_with_many);
  assert.strictEqual(liveImpDays.indexOf(fencedDay), -1,
    '(6e) a day whose EVERY arrival is fenced is not an import day at all ' +
    '— it self-heals out entirely (law 5 P0)');
  assert.strictEqual(liveImpDays.indexOf(loneDay) !== -1, true,
    '(6e) BOUNDARY: a day with EXACTLY ONE surviving arrival IS an import ' +
    'day');
  assert.strictEqual(liveImpDays.indexOf(manyDay) !== -1, true,
    '(6e) ...and so is a day with many');
  assert.strictEqual(
    JSON.stringify(packedArrivals).indexOf('SYNTHETIC BODY'), -1,
    '(6e) no item body reaches the arrival model');

  // ---- (2) THE GENERALIZATION INVARIANT --------------------------------
  const roster = blessingsDayRoster(packedBlessings, packedArrivals);

  // (2a) EVERY entry carries a `lit` KEY — by key PRESENCE, not by value,
  // so dropping the flag as redundant fails here even if every day
  // happened to be lit.
  roster.forEach(function (r) {
    assert.ok(Object.prototype.hasOwnProperty.call(r, 'lit'),
      '(6e) GENERALIZATION INVARIANT: every roster entry carries a `lit` ' +
      'key. Dropping it — "every notebook day is a lit day, so the flag ' +
      'is redundant" — is exactly the singular this phase promoted away ' +
      'from, and it fails HERE. Offending entry: ' + JSON.stringify(r));
  });

  // (2b) at least one `lit: false` AND at least one `lit: true`, as a
  // PAIR. A roster filtered back down to lit days fails the first; a
  // roster that lost the flag fails the second.
  const unlit = roster.filter(function (r) { return r.lit === false; });
  const lit = roster.filter(function (r) { return r.lit === true; });
  assert.ok(unlit.length >= 1,
    '(6e) GENERALIZATION INVARIANT: over the ZERO-OVERLAP fixture the ' +
    'roster holds at least one `lit: false` entry — an import day that ' +
    'is a page in her notebook without ever having been welcomed. ' +
    'Filtering the roster back down to lit days fails HERE');
  assert.ok(lit.length >= 1,
    '(6e) GENERALIZATION INVARIANT: ...and at least one `lit: true` ' +
    'entry, in the same pair, so a roster that lost the flag (or set it ' +
    'false everywhere) fails HERE instead of passing the line above');

  // (2c) the roster's LENGTH equals the size of the UNION of the two day
  // sets — computed independently in this test from the fixture, never
  // read back out of the function's own output.
  const unionIndependently = liveLitDays.slice();
  liveImpDays.forEach(function (d) {
    if (unionIndependently.indexOf(d) === -1) { unionIndependently.push(d); }
  });
  assert.strictEqual(roster.length, unionIndependently.length,
    '(6e) GENERALIZATION INVARIANT: the roster holds exactly the UNION of ' +
    'the lit days and the import days — |union| computed here from the ' +
    'fixture, not read out of the roster it is checking');
  assert.deepStrictEqual(roster.map(function (r) { return r.day; })
    .slice().sort(), unionIndependently.slice().sort(),
    '(6e) ...and it is the same union by MEMBERSHIP, not only by count');
  assert.ok(unionIndependently.length > liveLitDays.length,
    '(6e) POSITIVE CONTROL: the union is strictly bigger than the lit-day ' +
    'set. Without this, the length equality above passes over a fixture ' +
    'with no import days at all — the degenerate form of this very gate');

  // ---- (3) ADJACENCY, from the fixture's SEPARATE section ---------------
  // Kept out of the zero-overlap section on purpose, so that section stays
  // genuinely zero-overlap. Two of the owner's seven real import days are
  // exactly this shape, so the collapse is driven rather than reasoned.
  const ad = ZO.adjacency;
  const ah = hydrate(ad);
  const adArrivals = packArrivalDays(ah.items, [], guard);
  const adBlessings = packBlessingsToc(ah.ledger, ah.items, [], guard);
  const bothDay = atLabel(ad.declared_both_day);
  assert.ok(adArrivals.length >= 2 && adBlessings.length >= 1,
    '(6e) POSITIVE CONTROL: the adjacency section really does carry BOTH ' +
    'arrivals and a blessing on that day');
  const adRoster = blessingsDayRoster(adBlessings, adArrivals);
  assert.deepStrictEqual(adRoster.map(function (r) { return r.day; }),
    [bothDay],
    '(6e) ADJACENCY: a day that is BOTH an import day and a lit day ' +
    'appears EXACTLY ONCE in the merged roster — three entries across two ' +
    'inputs collapse to one day');
  assert.strictEqual(adRoster[0].lit, true,
    '(6e) ADJACENCY: ...and it is lit:true — welcoming wins over arriving');
})();

// ---- 6e(b) G-B5 — THE UNLIT CELL, PRESERVED BY KEY-SET EQUALITY ----------
//
// ⚠ THIS PIN EXISTS ONLY TO CLOSE A DEGENERATE PASS, AND IT PASSES TODAY.
// A later plan that "simplifies" it to `cell.lit === false` returns the
// instrument to measuring nothing. That is not a guess — it was MEASURED
// at 26.91-06, twice, over the identical mutation (adding a third field
// `empty: true` to blessingsMonthGrid's unlit cell):
//
//   PROBE A — this group AS WRITTEN (key-set equality) ...... RED, here
//   PROBE B — this group rewritten as `cell.lit === false` .. GREEN
//
// Same mutation, opposite verdicts. The key-set equality is the entire
// instrument; the `lit === false` line below it is a convenience. Same
// status as 26.9's empty-state assertion 2 and regen-gate steps 1 and 4 —
// DO NOT SIMPLIFY.

(function gB5UnlitCellPreserved() {
  const zo = ZO.zero_overlap;
  const h = hydrate(zo);
  const entries = packBlessingsToc(h.ledger, h.items, [], guard);
  const arrivals = packArrivalDays(h.items, [], guard);

  // July holds the lit day 07/30 AND the import-only days 07/19 and 07/26.
  const grid = blessingsMonthGrid(entries, monthKey(2026, 7));
  assert.ok(grid && grid.days.length === 31,
    '(6e-b) POSITIVE CONTROL: the July grid built at all, with 31 cells');

  function cellFor(d) {
    const hit = grid.days.filter(function (c) { return c.day === d; });
    assert.strictEqual(hit.length, 1, '(6e-b) one cell for day ' + d);
    return hit[0];
  }

  const importOnly = cellFor(19);
  assert.deepStrictEqual(Object.keys(importOnly).sort(), ['day', 'lit'],
    '(6e-b) G-B5: the cell for an IMPORT-ONLY day is EXACTLY {day, lit} ' +
    'and nothing else — asserted by KEY-SET EQUALITY, because a ' +
    '`lit === false` check passes with a third field added. The ' +
    'lit/unlit distinction is the calendar\'s entire vocabulary ' +
    '(D-13/D-35, verbatim-binding). Got: ' + Object.keys(importOnly).join(','));
  assert.strictEqual(importOnly.lit, false,
    '(6e-b) G-B5: ...and it is UNLIT. Lighting it would shift the ' +
    'calendar from *days you welcomed something* to *days the app did ' +
    'something*, and a month of unblessed imports would read as a wall of ' +
    'lit days she did not act on — law-3 damage by the back door');
  assert.deepStrictEqual(Object.keys(cellFor(26)).sort(), ['day', 'lit'],
    '(6e-b) G-B5: the same for 07/26, the import-only day with exactly ' +
    'ONE arrival — a threshold implementation would betray itself here');

  // ---- THE POSITIVE CONTROL, REBUILT — 26.91-13 (D-1) ------------------
  //
  // ⚠ THIS IS THE ONLY ASSERTION INSIDE G-B5 THAT MOVED. The two unlit
  // key-set equalities above, and every `lit === false` beside them, are
  // byte-unchanged.
  //
  // It USED to read `Object.keys(litCell).sort() === ['day','lit','view']`,
  // messaged: *without this, the two key-set equalities above are satisfied
  // by a grid in which NO cell has a view and nothing is lit*. Its whole
  // discriminating power was the THIRD KEY — the one thing a lit cell had
  // that an unlit cell did not.
  //
  // Dropping the dead field makes a lit cell and an unlit cell STRUCTURALLY
  // IDENTICAL. Re-keying this line to `['day','lit']` and stopping there
  // would have left a control that no longer closes the degenerate pass it
  // was written for: an all-unlit grid satisfies `['day','lit']` on every
  // cell. That is the *gate that survives its own subject* failure — an
  // assertion still passing after the thing it protected is gone.
  //
  // So the discriminator MOVED FROM SHAPE TO VALUE: which days are lit,
  // asserted by value, inside this group. An all-unlit grid now fails on the
  // lit-day list rather than on the absence of a third key — a strictly
  // stronger control, because "has an extra key" was satisfiable by any
  // extra key at all, while "07/30 and only 07/30 is lit" is satisfiable
  // only by the right grid.
  const litDaysJuly = grid.days.filter(function (c) { return c.lit; })
    .map(function (c) { return c.day; });
  assert.deepStrictEqual(litDaysJuly, [30],
    '(6e-b) POSITIVE CONTROL, BY VALUE: in the zero-overlap fixture\'s July ' +
    'exactly ONE day is lit and it is the 30th — the day holding surviving ' +
    'blessings. Without this the two unlit key-set equalities above are ' +
    'satisfied by a grid in which NOTHING is lit, which is the degenerate ' +
    'pass this control exists to close. It replaces a control that ' +
    'discriminated on a lit cell carrying a THIRD KEY; after D-1 a lit cell ' +
    'and an unlit cell carry the identical key set, so shape can no longer ' +
    'tell them apart and only value can. Got: ' + JSON.stringify(litDaysJuly));
  const litCell = cellFor(30);
  assert.deepStrictEqual(Object.keys(litCell).sort(), ['day', 'lit'],
    '(6e-b) ...and that lit cell is EXACTLY {day, lit} — the same key set ' +
    'as an unlit cell. After D-1 law 3 holds STRUCTURALLY: there is no ' +
    'field left on a calendar cell through which a third mark, a count or a ' +
    'today flag could arrive. Got: ' + Object.keys(litCell).join(','));
  assert.strictEqual(litCell.lit, true, '(6e-b) ...and it is lit');

  // ---- THE TWO HALVES IN THE SAME RUN ----------------------------------
  // Nobody can satisfy one by breaking the other: the import-only day is
  // IN the day roster (reachable by page flip) WHILE its calendar cell is
  // unlit (never reachable by tap).
  const roster = blessingsDayRoster(entries, arrivals);
  const day19 = roster.filter(function (r) {
    return r.day === label(2026, 7, 19);
  });
  assert.strictEqual(day19.length, 1,
    '(6e-b) the import-only day 07/19 IS in the notebook\'s day-set — it ' +
    'is a page, reachable by the prev/next page flip (D-02)');
  assert.strictEqual(day19[0].lit, false,
    '(6e-b) ...carrying lit:false');
  assert.strictEqual(cellFor(19).lit, false,
    '(6e-b) ...WHILE its calendar cell, in the same run, stays unlit. ' +
    'Both halves together — the page exists, the cell does not light');

  // and import days NEVER reach the grid: the grid is built from `entries`
  // alone, so passing arrivals into it is not even possible by signature.
  assert.strictEqual(blessingsMonthGrid.length, 2,
    '(6e-b) blessingsMonthGrid still takes exactly (entries, monthKey) — ' +
    'there is no parameter through which an import day could reach it');
})();

// ===========================================================================
// ---- 6f. 26.91-07 (PART B) — composeArrivalTrace: ONE SENTENCE, COUNT-FREE
// ===========================================================================
//
// THE WRITTEN ANTI-VACUITY AUDIT (26.91-VALIDATION.md's five questions):
//
//   (a) CAN IT PASS BEFORE THE WORK? No. `composeArrivalTrace` does not
//       exist before 26.91-07 and the FAMILY lift above throws BY NAME on
//       its absence, before a single assertion in this group is reached.
//   (b) CAN IT PASS ONCE THE WORK IS BROKEN? No, and it is DRIVEN rather
//       than argued — see 26.91-07-SUMMARY.md's mutation table. Each of the
//       plural rule, the fixed kind order, the winner rule, the
//       lexicographic tie-break, the opaque-hash ban and the tail rule has
//       its own assertion and its own mutation.
//   (c) DOES A DEGENERATE IMPLEMENTATION SATISFY IT? THE EMPTY STRING IS THE
//       degenerate form here: it satisfies every ban in this group at once.
//       So EVERY ban below is paired, IN THE SAME RUN, with a positive
//       assertion that names the emitted sentences BY VALUE. A composer that
//       returned '' for everything fails on the positives before the bans
//       are even reached.
//   (d) EVALUATION ORDER OR SOURCE ORDER? EVALUATION. Every string in this
//       group is produced by CALLING the shipped composer over output the
//       SHIPPED fence (core.js guardSurface, through packArrivalDays)
//       actually produced. The three source scans are labelled as such.
//   (e) DOES A GREP MATCH THE FIX'S OWN COMMENT? The source scans run over
//       COMMENT-STRIPPED source, because this plan MANDATES site comments
//       naming `origin_path` and the law-5 tail property — a raw grep would
//       be matching the fix's own explanation of itself.

// ---- the part-B fixture, built once and shared by 6f, 6g, G-B1 and G-B3 ----
//
// Synthetic. No folder name here appears in the owner's real library, and no
// name carries a digit or a magnitude word — the FORBIDDEN_TOKENS scan below
// would otherwise be measuring the fixture instead of the composer.
function traceItem(id, o) {
  const it = {
    id: id,
    title: 'title of ' + id,
    type: o.type || 'text',
    state: o.state || 'blessed',
    folder: o.folder === undefined ? '' : o.folder,
    source: o.source || 'folder-drop',
    imported_ms: o.at,
    // present ON PURPOSE: the composer must never be able to reach it.
    body: 'PRIVATE CONTENT of ' + id,
    origin_path: '/Users/SYNTHETIC/personnel notes/' + id + '.md'
  };
  if (o.trigger === true) { it.trigger = true; }
  return it;
}

// `bulk` builds n items of one shape on one day. Insertion order is the
// argument order, which is what the shuffle probes below perturb.
function traceBulk(store, prefix, n, o) {
  for (let i = 0; i < n; i++) {
    store[prefix + '-' + String.fromCharCode(97 + (i % 26)) + i] =
      traceItem(prefix + '-' + i, o);
  }
  return store;
}

// One day's ALREADY-GUARDED arrivals, through the SHIPPED fence.
function traceArrivalsOn(store, dayLabel) {
  return packArrivalDays(store, [], guard).filter(function (a) {
    return a.dayLabel === dayLabel;
  });
}

const TRACE_DAY = ms(2026, 7, 19);
const TRACE_LABEL = label(2026, 7, 19);

function traceOver(store) {
  return composeArrivalTrace(traceArrivalsOn(store, TRACE_LABEL));
}

// THE PINNED G-B3 PAIR, declared HERE so the count-leak gate and the
// composer group share one definition. The two days hold KINDS and FOLDERS
// CONSTANT and vary ONLY in cardinality — 1,898 against 1 — which is what
// turns G-B3 from "a gate that happens to be a count-leak test" into one.
const GB3_MANY = traceBulk({}, 'many', 1898,
  { at: TRACE_DAY, type: 'text', folder: 'chinese' });
const GB3_ONE = traceBulk({}, 'one', 1,
  { at: TRACE_DAY, type: 'text', folder: 'chinese' });

// Every sentence the composer emits anywhere in this file, collected for the
// FORBIDDEN_TOKENS scan. A ban over an EMPTY collection is the purest form of
// this project's defect class, so the collection's size and membership are
// asserted BY VALUE before the ban runs.
const EMITTED = [];
function emit(s) { EMITTED.push(s); return s; }

(function composerBehaviour() {
  // ---- (1) EMPTY — three cases, each driven --------------------------
  assert.strictEqual(composeArrivalTrace([]), '',
    '(6f) EMPTY: a day with ZERO arrivals composes the EMPTY STRING, and ' +
    'the caller renders no page. There is no "the librarian brought in ' +
    'nothing" state and none is authored — that sentence would be law-3 ' +
    'damage and a fence tell at once');
  assert.strictEqual(composeArrivalTrace(undefined), '',
    '(6f) EMPTY: ...and so does a missing argument. The composer is total ' +
    'over its input rather than throwing into a render path');

  // the THIRD empty case, driven through the real fence: a day whose EVERY
  // arrival is fenced produces no arrivals at all, so no sentence exists to
  // be written. The day self-heals out of navigation entirely.
  const allFenced = traceBulk({}, 'gone', 4,
    { at: TRACE_DAY, folder: 'chinese', state: 'never_show' });
  assert.deepStrictEqual(traceArrivalsOn(allFenced, TRACE_LABEL), [],
    '(6f) POSITIVE CONTROL for the line below: the all-fenced day really ' +
    'does survive the fence with zero arrivals');
  assert.strictEqual(traceOver(allFenced), '',
    '(6f) EMPTY: a day whose EVERY arrival is fenced has NO trace line — ' +
    'it is not a "the librarian brought in nothing" page, it is not a page ' +
    'at all (law 5 P0, self-healing)');

  // ---- (2) BOUNDARY — the plural rule at cardinality ONE --------------
  // This is where a plural-sensitive implementation betrays itself, so all
  // three kind shapes are driven at the MINIMUM cardinality.
  const oneText = traceBulk({}, 't', 1,
    { at: TRACE_DAY, type: 'text', folder: 'chinese' });
  const oneImage = traceBulk({}, 'i', 1,
    { at: TRACE_DAY, type: 'image', folder: 'chinese' });
  const oneEach = traceBulk(traceBulk({}, 't', 1,
    { at: TRACE_DAY, type: 'text', folder: 'chinese' }), 'i', 1,
    { at: TRACE_DAY, type: 'image', folder: 'chinese' });

  const sText = emit(traceOver(oneText));
  const sImage = emit(traceOver(oneImage));
  const sEach = emit(traceOver(oneEach));

  assert.strictEqual(sText,
    'the librarian brought in notes from your chinese folder.',
    '(6f) BOUNDARY: exactly ONE `text` arrival renders `notes`, PLURAL, ' +
    'pinned BY VALUE. A plural-sensitive string is a count in disguise — ' +
    '"a note" versus "some notes" leaks 1-vs-many (law 3)');
  assert.strictEqual(sImage,
    'the librarian brought in photographs from your chinese folder.',
    '(6f) BOUNDARY: exactly ONE `image` arrival renders `photographs`');
  assert.strictEqual(sEach,
    'the librarian brought in notes and photographs from your chinese ' +
    'folder.',
    '(6f) BOUNDARY: one of each renders `notes and photographs`, in that ' +
    'FIXED order');
  assert.strictEqual(/\bnote\b/.test(sText), false,
    '(6f) BOUNDARY: ...and the singular word `note` appears NOWHERE in the ' +
    'one-arrival sentence. Pinned as its own assertion because a value ' +
    'equality that someone later "generalises" to a substring check would ' +
    'stop seeing this. Got: ' + JSON.stringify(sText));
  assert.strictEqual(/\bphotograph\b/.test(sImage), false,
    '(6f) BOUNDARY: ...and the singular `photograph` likewise');

  // ---- (3) ORDERING — notes-then-photographs, whatever arrived first ---
  // Photographs arrive FIRST and outnumber notes ten to one. If the order
  // or the wording leaked either fact, this string would differ from the
  // one-of-each string above.
  const photosDominant = traceBulk(traceBulk({}, 'i', 10,
    { at: TRACE_DAY, type: 'image', folder: 'chinese' }), 't', 1,
    { at: TRACE_DAY, type: 'text', folder: 'chinese' });
  assert.strictEqual(emit(traceOver(photosDominant)), sEach,
    '(6f) ORDERING: ten photographs and one note compose the string that ' +
    'ONE photograph and ONE note compose, byte for byte. The `{kinds}` ' +
    'order is FIXED notes-then-photographs regardless of which arrived ' +
    'first or in what proportion, so the sentence\'s shape cannot leak ' +
    'arrival order OR proportion');

  // ---- (4) THE 1,898-VERSUS-1 BYTE-IDENTITY (G-B3's core) --------------
  const sMany = emit(traceOver(GB3_MANY));
  const sOne = emit(traceOver(GB3_ONE));
  assert.strictEqual(traceArrivalsOn(GB3_MANY, TRACE_LABEL).length, 1898,
    '(6f) POSITIVE CONTROL: the many-day really does carry 1,898 surviving ' +
    'arrivals. Without this the identity below is two empty days agreeing');
  assert.strictEqual(traceArrivalsOn(GB3_ONE, TRACE_LABEL).length, 1,
    '(6f) POSITIVE CONTROL: ...and the one-day carries exactly one');
  assert.strictEqual(sMany, sOne,
    '(6f) THE COUNT-FREE PROPERTY, DRIVEN: a day with 1,898 arrivals and a ' +
    'day with 1 — same kinds, same folder — compose BYTE-IDENTICAL ' +
    'sentences. She vetoed "2,762 more await" on 2026-07-27; this is that ' +
    'ruling as an executable fact. Many: ' + JSON.stringify(sMany) +
    ' One: ' + JSON.stringify(sOne));
  assert.strictEqual(sMany, sText,
    '(6f) ...and both are the same sentence the ONE-text-arrival day ' +
    'composes, which is the same claim stated a third way');

  // ---- (5) THE WINNER, AND THE LEXICOGRAPHIC TIE-BREAK ----------------
  const clearWinner = traceBulk(traceBulk(traceBulk({}, 'c', 5,
    { at: TRACE_DAY, folder: 'chinese' }), 'a', 3,
    { at: TRACE_DAY, folder: 'ai-skills' }), 'h', 2,
    { at: TRACE_DAY, folder: 'Hubs' });
  assert.strictEqual(emit(traceOver(clearWinner)),
    'the librarian brought in notes from your chinese folder, and ' +
    'elsewhere in your vault.',
    '(6f) THE WINNER is the speakable folder with the MOST surviving items ' +
    'on the day. Naming ONE folder reveals no number');

  // TIES: two speakable folders with EXACTLY equal surviving counts. The
  // lexicographically smaller name wins, and it must not depend on
  // insertion order — so the store is built BOTH ways and the packed array
  // is shuffled three more times on top.
  function tieStore(firstIsBeta) {
    const s = {};
    if (firstIsBeta) {
      traceBulk(s, 'b', 4, { at: TRACE_DAY, folder: 'beta' });
      traceBulk(s, 'a', 4, { at: TRACE_DAY, folder: 'alpha' });
    } else {
      traceBulk(s, 'a', 4, { at: TRACE_DAY, folder: 'alpha' });
      traceBulk(s, 'b', 4, { at: TRACE_DAY, folder: 'beta' });
    }
    return s;
  }
  const TIE_EXPECTED =
    'the librarian brought in notes from your alpha folder, and elsewhere ' +
    'in your vault.';
  [true, false].forEach(function (betaFirst) {
    assert.strictEqual(emit(traceOver(tieStore(betaFirst))), TIE_EXPECTED,
      '(6f) ADJACENCY: on an EXACT tie the lexicographically smaller ' +
      'folder name wins — and it does so with `beta` inserted ' +
      (betaFirst ? 'FIRST' : 'SECOND') + ', so the result is not ' +
      'insertion order wearing a rule');
  });
  // ...and over three deterministic shuffles of the PACKED array, which is
  // the argument the composer actually receives.
  const tiePacked = traceArrivalsOn(tieStore(true), TRACE_LABEL);
  assert.strictEqual(tiePacked.length, 8,
    '(6f) POSITIVE CONTROL: the tie fixture packs 8 surviving arrivals, ' +
    'four in each folder — an exact tie rather than an accident');
  [1, 3, 5].forEach(function (step) {
    const shuffled = tiePacked.slice();
    // a deterministic rotate-and-reverse: no clock, no Math.random, so a
    // failure here is reproducible rather than flaky.
    for (let r = 0; r < step; r++) { shuffled.push(shuffled.shift()); }
    if (step % 2) { shuffled.reverse(); }
    assert.notDeepStrictEqual(shuffled, tiePacked,
      '(6f) POSITIVE CONTROL: shuffle step ' + step + ' really did change ' +
      'the array. Two identical ids can make sort() and reverse() produce ' +
      'the same array, and a shuffle that shuffles nothing is a probe that ' +
      'probes nothing');
    assert.strictEqual(emit(composeArrivalTrace(shuffled)), TIE_EXPECTED,
      '(6f) ADJACENCY: ...and the tie still resolves to `alpha` under ' +
      'shuffle step ' + step + '. Deterministic — no clock, no ' +
      'Math.random, no insertion-order dependence');
  });

  // ---- (6) THE LAW-5 TAIL, DRIVEN IN BOTH DIRECTIONS ------------------
  //
  // `, and elsewhere in your vault` appears for the SAME REASON whether the
  // other folders were FENCED or merely NOT THE LARGEST — and its ABSENCE
  // is equally ambiguous. Both directions are driven, because a property
  // asserted in one direction only is half a property.
  // ⚠ HOW THIS GATE WAS FIRST WRITTEN, AND WHY IT WAS REWRITTEN BEFORE IT
  // SHIPPED. The obvious form is "a day whose non-winner was FENCED composes
  // the same sentence as a day whose non-winner was merely SMALLER". That
  // form was written, and then ARMED ON A PLANTED FENCE BYPASS — the
  // composer handed the UNGUARDED arrivals instead of the guarded ones — and
  // it STAYED GREEN. It could not go red: the fenced folder is not the
  // winner either way, so both sides name the same folder and both carry
  // the tail whether the fence ran or not. It was measuring nothing.
  //
  // THE FORM THAT CAN GO RED is a THREE-WAY equality across the whole
  // pack -> compose pipeline: the fenced day, the merely-smaller day, and a
  // day where the third folder NEVER EXISTED must all compose one string.
  // That is the property in its real shape — no sentence is reachable ONLY
  // via fencing — and it breaks the instant anything downstream of the
  // fence carries a gap tell. Armed on a planted gap tell; see
  // 26.91-07-SUMMARY.md M13.
  const tailFenced = traceBulk(traceBulk(traceBulk({}, 'c', 5,
    { at: TRACE_DAY, folder: 'chinese' }), 'a', 3,
    { at: TRACE_DAY, folder: 'ai-skills', state: 'never_show' }), 'h', 2,
    { at: TRACE_DAY, folder: 'Hubs' });
  const tailSmaller = traceBulk(traceBulk(traceBulk({}, 'c', 5,
    { at: TRACE_DAY, folder: 'chinese' }), 'a', 3,
    { at: TRACE_DAY, folder: 'ai-skills' }), 'h', 2,
    { at: TRACE_DAY, folder: 'Hubs' });
  // the SURVIVORS of the fenced day, as a day that never held the fenced
  // folder at all. No `never_show` item exists anywhere in this store.
  const tailNeverThere = traceBulk(traceBulk({}, 'c', 5,
    { at: TRACE_DAY, folder: 'chinese' }), 'h', 2,
    { at: TRACE_DAY, folder: 'Hubs' });
  const sFenced = emit(traceOver(tailFenced));
  const sSmaller = emit(traceOver(tailSmaller));
  const sNever = emit(traceOver(tailNeverThere));
  assert.strictEqual(traceArrivalsOn(tailFenced, TRACE_LABEL).length, 7,
    '(6f) POSITIVE CONTROL: the fenced day really did lose three arrivals ' +
    'to the fence — 7 of 10 survive');
  assert.strictEqual(traceArrivalsOn(tailSmaller, TRACE_LABEL).length, 10,
    '(6f) POSITIVE CONTROL: ...and the merely-smaller day keeps all ten');
  assert.strictEqual(traceArrivalsOn(tailNeverThere, TRACE_LABEL).length, 7,
    '(6f) POSITIVE CONTROL: ...and the never-there day holds the fenced ' +
    'day\'s SURVIVORS exactly');
  assert.strictEqual(sFenced, sSmaller,
    '(6f) THE LAW-5 TAIL, DIRECTION 1 (tail present): the FENCED day and ' +
    'the MERELY-SMALLER day compose byte-identical sentences. Fenced: ' +
    JSON.stringify(sFenced) + ' Smaller: ' + JSON.stringify(sSmaller));
  assert.strictEqual(sFenced, sNever,
    '(6f) THE LAW-5 TAIL, DIRECTION 1, THE HALF THAT CAN GO RED: the ' +
    'FENCED day composes the sentence a day that NEVER HELD that folder ' +
    'composes. NO SENTENCE IS REACHABLE ONLY VIA FENCING — that is the ' +
    'property, and a gap tell anywhere downstream of the fence (a `reason` ' +
    'field, a "some hidden" clause, a count of what was withheld) breaks ' +
    'it HERE. Do NOT "improve" the tail by distinguishing the two cases. ' +
    'Fenced: ' + JSON.stringify(sFenced) + ' Never-there: ' +
    JSON.stringify(sNever));

  // DIRECTION 2, the same three-way shape where the tail is ABSENT.
  const soloFenced = traceBulk(traceBulk({}, 'c', 5,
    { at: TRACE_DAY, folder: 'chinese' }), 'a', 3,
    { at: TRACE_DAY, folder: 'ai-skills', state: 'never_show' });
  const soloNever = traceBulk({}, 'c', 5,
    { at: TRACE_DAY, folder: 'chinese' });
  const sSoloFenced = emit(traceOver(soloFenced));
  const sSoloNever = emit(traceOver(soloNever));
  assert.strictEqual(sSoloFenced, sSoloNever,
    '(6f) THE LAW-5 TAIL, DIRECTION 2 (tail absent): a day whose only ' +
    'OTHER folder was fenced composes the sentence a day that only ever ' +
    'had ONE folder composes. So the tail\'s ABSENCE is as ambiguous as ' +
    'its presence, and a reader can read fencing off NEITHER. Fenced: ' +
    JSON.stringify(sSoloFenced) + ' Never-there: ' +
    JSON.stringify(sSoloNever));
  assert.notStrictEqual(sFenced, sSoloFenced,
    '(6f) POSITIVE CONTROL for both directions: the with-tail and ' +
    'without-tail sentences are DIFFERENT strings. Without this, a ' +
    'composer that returned one constant satisfies every equality above ' +
    'and the whole property is vacuous');
  assert.strictEqual(sSoloFenced,
    'the librarian brought in notes from your chinese folder.',
    '(6f) ...and the no-tail form is pinned BY VALUE');
  assert.strictEqual(sFenced,
    'the librarian brought in notes from your chinese folder, and ' +
    'elsewhere in your vault.',
    '(6f) ...and so is the with-tail form');

  // ---- (7) THE THREE `{place}` FORMS, BY VALUE ------------------------
  const noFolder = traceBulk({}, 'n', 3, { at: TRACE_DAY, folder: '' });
  // ⚠ PIN REWRITTEN IN 26.91-08, NEVER DELETED. Wave 7 pinned this at
  // `elsewhere in your vault`, correctly, because the per-source phrasing did
  // not exist yet and wave 7's own summary named it a residual for this wave.
  // The fixture's items carry `source: folder-drop` (traceBulk's default),
  // which is now a MAPPED source, so the honest fallback for THIS fixture is
  // the source phrase. The unmapped/absent/empty/null shapes still reach
  // `elsewhere in your vault` and are driven separately in group 8a.
  const sNoFolder = emit(traceOver(noFolder));
  assert.strictEqual(sNoFolder,
    'the librarian brought in notes from what you dropped in.',
    '(6f) NO SPEAKABLE FOLDER AT ALL: the honest fallback, pinned BY VALUE. ' +
    'Rewritten in 26.91-08: `folder-drop` is a MAPPED source, so the day ' +
    'falls through to `what you dropped in` rather than to `elsewhere in ' +
    'your vault`');
  assert.strictEqual(/folder/.test(sNoFolder.slice(sNoFolder.indexOf(
    'from '))), false,
    '(6f) ...and THE PROPERTY WAVE 7 WAS PINNING SURVIVES THE REWRITE ' +
    'INTACT: no folder is named. That is what the original assertion was ' +
    'protecting, and it is asserted here in a form the copy change cannot ' +
    'move');

  // ---- (8) D-05 — THE OPAQUE ADAPTER HASH IS NEVER SPOKEN -------------
  const OPAQUE = 'studyroom-collect-k2ks84n7';
  const hashBiggest = traceBulk(traceBulk({}, 'o', 9,
    { at: TRACE_DAY, folder: OPAQUE }), 'c', 2,
    { at: TRACE_DAY, folder: 'chinese' });
  const sHash = emit(traceOver(hashBiggest));
  assert.strictEqual(sHash,
    'the librarian brought in notes from your chinese folder, and ' +
    'elsewhere in your vault.',
    '(6f) D-05: the opaque hash is the day\'s BIGGEST folder by far (9 to ' +
    '2) and the sentence names the SMALLER speakable one instead. An ' +
    'opaque adapter hash means nothing to a human and must never reach a ' +
    'surface');
  const hashOnly = traceBulk({}, 'o', 9, { at: TRACE_DAY, folder: OPAQUE });
  // ⚠ PIN REWRITTEN IN 26.91-08, NEVER DELETED — same reason as (7): these
  // items carry the MAPPED source `folder-drop`. The D-05 property being
  // pinned (the hash is not spoken, and the day does not go silent) is
  // unchanged and is asserted separately below so the copy change cannot
  // quietly take it with it.
  const sHashOnly = emit(traceOver(hashOnly));
  assert.strictEqual(sHashOnly,
    'the librarian brought in notes from what you dropped in.',
    '(6f) D-05: a day whose ONLY folder is an opaque hash falls back — it ' +
    'does not name the hash and it does not go silent. Rewritten in ' +
    '26.91-08: the fallback for a `folder-drop` day is now the source ' +
    'phrase');
  assert.strictEqual(sHashOnly.indexOf(OPAQUE), -1,
    '(6f) D-05: ...and THE PROPERTY SURVIVES THE REWRITE — the hash itself ' +
    'appears nowhere in the sentence');
  assert.notStrictEqual(sHashOnly, '',
    '(6f) D-05: ...and the day does not go silent either');

  // ---- (9) IDEMPOTENCY AND CONCURRENCY --------------------------------
  const idemInput = traceArrivalsOn(clearWinner, TRACE_LABEL);
  assert.strictEqual(composeArrivalTrace(idemInput),
    composeArrivalTrace(idemInput),
    '(6f) IDEMPOTENCY: composing TWICE over the same input yields a ' +
    'strictly equal string. The composer is pure over its arguments and ' +
    'reads no clock');
  const xIn = traceArrivalsOn(tailSmaller, TRACE_LABEL);
  // Y is the HASH-ONLY day on purpose: it composes the fallback form, so X
  // and Y really are two different sentences and the interleave below is an
  // interleave of two things rather than one thing twice.
  const yIn = traceArrivalsOn(hashOnly, TRACE_LABEL);
  const x1 = composeArrivalTrace(xIn);
  const y1 = composeArrivalTrace(yIn);
  const x2 = composeArrivalTrace(xIn);
  const y2 = composeArrivalTrace(yIn);
  assert.strictEqual(x1, x2, '(6f) CONCURRENCY: X composes identically ' +
    'when interleaved with a DIFFERENT guarded input');
  assert.strictEqual(y1, y2, '(6f) CONCURRENCY: ...and so does Y');
  assert.notStrictEqual(x1, y1,
    '(6f) POSITIVE CONTROL: X and Y really are different sentences, so ' +
    'the interleave above is an interleave of two things');

  // ---- (10) ENCODING — length in JS string units, Latin AND CJK -------
  //
  // The 24-character cap and its trailing ellipsis are a NAMED RESIDUAL
  // landing in plan 08 with their own gate. What is pinned HERE is the
  // LONGEST COMPOSABLE LINE at that cap, measured in JS string units, for
  // both a no-space Latin name and a CJK one — because the slot clips
  // SILENTLY and the live backstop (G-B-trace) needs a number to aim at.
  const LONGEST_COMPOSABLE = 118;
  const LATIN24 = 'mmmmmmmmmmmmmmmmmmmmmmmm';
  const CJK24 = '文文文文文文文文文文文文文文文文文文文文文文文文';
  assert.strictEqual(LATIN24.length, 24, '(6f) the Latin probe is 24 units');
  assert.strictEqual(CJK24.length, 24, '(6f) the CJK probe is 24 units');
  [LATIN24, CJK24].forEach(function (name) {
    const worst = traceBulk(traceBulk(traceBulk({}, 'w', 5,
      { at: TRACE_DAY, type: 'text', folder: name }), 'p', 5,
      { at: TRACE_DAY, type: 'image', folder: name }), 'o', 1,
      { at: TRACE_DAY, folder: 'chinese' });
    const s = emit(traceOver(worst));
    assert.strictEqual(s,
      'the librarian brought in notes and photographs from your ' + name +
      ' folder, and elsewhere in your vault.',
      '(6f) ENCODING: the WORST composable line, pinned by value for ' +
      (name === CJK24 ? 'CJK' : 'Latin'));
    assert.strictEqual(s.length, LONGEST_COMPOSABLE,
      '(6f) ENCODING: ...and it is exactly ' + LONGEST_COMPOSABLE + ' JS ' +
      'string units — 57 of frame + 24 of capped folder + 37 of tail. ' +
      'CJK and Latin measure the SAME because both are BMP single units; ' +
      'their RENDERED widths differ, which is what G-B-trace measures ' +
      'live. Got ' + s.length);
  });
})();

// ===========================================================================
// ---- 8a. 26.91-08 — THE NEVER-NAME LIST, THE SOURCE MAP, THE 24-CAP -------
//
// ANTI-VACUITY AUDIT for this group:
//   (a) WHAT MAKES IT FAIL? Each never-name entry removed individually makes
//       its own case name a folder; the cap removed makes the 25- and 40-char
//       cases emit whole; the source map removed makes every no-speakable-
//       folder case read `elsewhere in your vault`; the librarian filter
//       removed makes the arrival sentence gain `photographs`.
//   (b) CAN IT PASS EMPTY? No. Every case below asserts a POSITIVE sentence
//       by value, and the distinct emitted set is pinned by value in 6f-b
//       immediately after — an empty or shrunken collection is caught there.
//   (c) IS ANY POSITIVE CASE A DEAD BRANCH? `apple-notes` and `apple-photos`
//       DO NOT EXIST IN THIS LIBRARY (measured sources: folder-drop 2,256,
//       obsidian-vault 878, librarian 1). They are covered here over an
//       explicitly SYNTHETIC fixture and each such assertion SAYS SO in its
//       own message. NO assertion in this group has either of them as its
//       ONLY positive case.
//   (d) COMMENT OR CODE? Every sentence below is produced by CALLING the
//       shipped composer. The two source scans are labelled as scans and run
//       over COMMENT-STRIPPED source, because the never-name site comment
//       explains at length why the global roster route was NOT used — a raw
//       grep for `api/librarian/roster` would be matching the fix's own
//       explanation of itself.

// A day entry as packArrivalDays emits it, but built directly, so the three
// DEGENERATE source shapes the packer can never produce (absent key, null,
// empty string) are reachable at the composer's own boundary.
function traceEntry(o) {
  const e = {
    ms: TRACE_DAY,
    dayLabel: TRACE_LABEL,
    monthKey: '2026-07',
    kind: o.kind || 'notes',
    folder: o.folder === undefined ? '' : o.folder
  };
  if (Object.prototype.hasOwnProperty.call(o, 'source')) {
    e.source = o.source;
  }
  return e;
}
function traceEntries(n, o) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(traceEntry(o)); }
  return out;
}

(function neverNameSourceMapAndCap() {
  // ---- (1) THE LIST ITSELF, PINNED BY VALUE --------------------------
  assert.strictEqual(TRACE_NEVER_NAME.length, 3,
    '(8a) TRACE_NEVER_NAME holds EXACTLY THREE rules. Pinned by value: a ' +
    'fourth entry is a policy nobody reviewed, and a vanished entry is a ' +
    'name that became speakable without anyone deciding it should');
  assert.deepStrictEqual(TRACE_NEVER_NAME.map(function (r) {
    return (r instanceof RegExp) ? { re: r.source } : { literal: r };
  }), [
    { literal: 'processed jd' },
    { re: '^studyroom-collect-' },
    { literal: 'items' }
  ], '(8a) ...and its MEMBERS by deep-equality on their string/source ' +
     'forms. `processed jd` is the OWNER RULING D-10 (2026-08-06), shipped ' +
     'trace-scoped by her answer to UI-SPEC Open Decision #1 (2026-08-07); ' +
     '`/^studyroom-collect-/` is D-05; `items` is the store\'s own ' +
     'directory name');
  assert.strictEqual(TRACE_FOLDER_CAP, 24,
    '(8a) TRACE_FOLDER_CAP is 24, PINNED BY VALUE. Length is measured in ' +
    'JAVASCRIPT STRING UNITS (UTF-16 code units), which is the convention ' +
    'that decides what a 24-glyph CJK name does');

  // ---- (2) `processed jd` IS NEVER NAMED -----------------------------
  const jdUnmapped = traceEntries(4,
    { folder: 'processed jd', source: 'no-such-adapter' });
  const jdSentence = emit(composeArrivalTrace(jdUnmapped));
  assert.strictEqual(jdSentence,
    'the librarian brought in notes from elsewhere in your vault.',
    '(8a) NEVER-NAME: a day whose ONLY speakable folder is `processed jd` ' +
    'composes `elsewhere in your vault` and NAMES NO FOLDER. Her active ' +
    'job search under a standing publishing embargo (D-10)');
  assert.strictEqual(jdSentence.indexOf('processed jd'), -1,
    '(8a) NEVER-NAME: ...and the literal string never appears anywhere in ' +
    'the composed sentence');
  const jdVault = emit(composeArrivalTrace(traceEntries(4,
    { folder: 'processed jd', source: 'obsidian-vault' })));
  assert.strictEqual(jdVault,
    'the librarian brought in notes from your vault.',
    '(8a) NEVER-NAME: the SAME day with a MAPPED dominant source falls ' +
    'through to the source phrase, NOT to the folder. The property that ' +
    'matters is that the folder is not named — which tail replaces it is ' +
    'the source map\'s business');
  assert.strictEqual(jdVault.indexOf('processed jd'), -1,
    '(8a) NEVER-NAME: ...and it is still not named on that path either');

  // ---- (3) `items` IS NEVER NAMED ------------------------------------
  const itemsSentence = emit(composeArrivalTrace(traceEntries(3,
    { folder: 'items', source: 'no-such-adapter' })));
  assert.strictEqual(itemsSentence,
    'the librarian brought in notes from elsewhere in your vault.',
    '(8a) NEVER-NAME: a day whose only speakable folder is `items` — the ' +
    'store\'s OWN directory name, and 07-27\'s only survivor — composes ' +
    'the same fallback. Naming it would be the app talking about its own ' +
    'plumbing rather than about a place in her vault');

  // ---- (4) CASE-SENSITIVITY / NO NORMALISATION -----------------------
  // Written so that a future `toLowerCase()` fold, a `trim()`, or a Unicode
  // normalisation that merged two folders' fates goes RED here.
  const capItems = emit(composeArrivalTrace(traceEntries(2,
    { folder: 'Items', source: 'no-such-adapter' })));
  assert.strictEqual(capItems,
    'the librarian brought in notes from your Items folder.',
    '(8a) ENCODING: comparison is EXACT, CASE-SENSITIVE string equality on ' +
    'the stored folder value. `Items` is a DIFFERENT folder from `items` ' +
    'and is judged on its own membership. A `toLowerCase()` fold added ' +
    'anywhere in the speakability test merges two folders\' fates and must ' +
    'trip HERE');
  const spacedItems = emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items ', source: 'no-such-adapter' })));
  assert.strictEqual(spacedItems,
    'the librarian brought in notes from your items  folder.',
    '(8a) ENCODING: no TRIMMING either — `items ` (trailing space) is a ' +
    'different folder from `items`. The doubled space in the output is the ' +
    'point: the stored value is emitted verbatim, uncleaned');

  // ---- (5) THE 24-CHARACTER CAP, AT BOTH BOUNDARIES ------------------
  const at24 = 'n'.repeat(24);
  const at25 = 'n'.repeat(25);
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: at24, source: 'no-such-adapter' }))),
    'the librarian brought in notes from your ' + at24 + ' folder.',
    '(8a) BOUNDARY: a folder name of EXACTLY 24 JavaScript string units is ' +
    'emitted WHOLE, with no ellipsis');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: at25, source: 'no-such-adapter' }))),
    'the librarian brought in notes from your ' + at24 + '… folder.',
    '(8a) BOUNDARY: at 25 JavaScript string units it is truncated to the ' +
    'first 24 plus a trailing ellipsis. 24 and 25 are the two sides of the ' +
    'same boundary and both are driven');
  const cjk25 = '文'.repeat(25);
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: cjk25, source: 'no-such-adapter' }))),
    'the librarian brought in notes from your ' + '文'.repeat(24) +
    '… folder.',
    '(8a) ENCODING: a 25-GLYPH CJK name truncates at 24 too, because ' +
    'length is measured in JAVASCRIPT STRING UNITS and each of these ' +
    'glyphs is one unit. The convention is stated so a future switch to ' +
    'grapheme counting is a deliberate change, not a drift');

  // ---- (6) THE CAP IS APPLIED **BEFORE** COMPOSITION ------------------
  const long40 = 'p'.repeat(40);
  const capBefore = emit(composeArrivalTrace(
    traceEntries(5, { folder: long40, source: 'no-such-adapter' })
      .concat(traceEntries(2, { folder: 'chinese',
        source: 'no-such-adapter' }))));
  assert.strictEqual(capBefore,
    'the librarian brought in notes from your ' + 'p'.repeat(24) +
    '… folder, and elsewhere in your vault.',
    '(8a) THE CAP RUNS BEFORE THE SENTENCE IS COMPOSED, so the TAIL ' +
    'ALWAYS SURVIVES. A 40-character name capped AFTER composition would ' +
    'eat `, and elsewhere in your vault.` — the law-5 tail — and turn its ' +
    'absence into a tell about name length');
  assert.ok(/, and elsewhere in your vault\.$/.test(capBefore),
    '(8a) ...asserted separately on the tail itself, so this cannot pass ' +
    'by the whole-string comparison alone drifting');

  // ---- (7) THE SOURCE MAP — consulted ONLY when nothing is speakable --
  assert.deepStrictEqual(Object.keys(TRACE_SOURCE_PHRASE).sort(),
    ['apple-notes', 'apple-photos', 'folder-drop', 'obsidian-vault'],
    '(8a) TRACE_SOURCE_PHRASE\'s KEY SET pinned BY VALUE. The map is a ' +
    'frozen constant read-only at compose time, so two concurrent composes ' +
    'cannot observe a partially-built map — pinning the key set is the ' +
    'testable form of that');
  assert.strictEqual(Object.isFrozen(TRACE_SOURCE_PHRASE), true,
    '(8a) ...and it is actually FROZEN, not merely described as frozen');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(3,
    { folder: 'studyroom-collect-k2ks84n7', source: 'folder-drop' }))),
    'the librarian brought in notes from what you dropped in.',
    '(8a) SOURCE MAP: `folder-drop` -> `what you dropped in`. Driven over ' +
    'a day whose only folder is an OPAQUE ADAPTER HASH, which is the real ' +
    'shape on 07-26 — 2,256 of her items carry this source, so this is ' +
    'the map\'s LIVE branch, not a synthetic one');
  // DEAD BRANCHES — kept for correctness, never a gate's only positive case.
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items', source: 'apple-notes' }))),
    'the librarian brought in notes from your phone notes.',
    '(8a) SOURCE MAP: `apple-notes` -> `your phone notes`. ⚠ THIS BRANCH ' +
    'IS DEAD ON THE REAL LIBRARY — measured sources are folder-drop ' +
    '(2,256), obsidian-vault (878) and librarian (1); no apple-notes item ' +
    'exists. The fixture is SYNTHETIC and this assertion is NOT the only ' +
    'positive case for anything: the live branches above and below carry ' +
    'the group');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items', source: 'apple-photos', kind: 'photographs' }))),
    'the librarian brought in photographs from your photos.',
    '(8a) SOURCE MAP: `apple-photos` -> `your photos`. ⚠ ALSO DEAD ON THE ' +
    'REAL LIBRARY, same reasoning, same synthetic fixture');

  // ---- (8) THE THREE DEGENERATE SOURCE SHAPES ------------------------
  const FALLBACK = 'the librarian brought in notes from elsewhere in your ' +
    'vault.';
  assert.strictEqual(emit(composeArrivalTrace(
    [traceEntry({ folder: 'items' })])), FALLBACK,
    '(8a) FALLBACK/EMPTY: an ABSENT `source` key resolves to `elsewhere ' +
    'in your vault` — never the literal `undefined`, and never a throw');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items', source: '' }))), FALLBACK,
    '(8a) FALLBACK/EMPTY: an EMPTY-STRING source resolves the same way');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items', source: null }))), FALLBACK,
    '(8a) FALLBACK/EMPTY: a NULL source resolves the same way. All three ' +
    'driven SEPARATELY because they are three different code paths that ' +
    'happen to agree');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items', source: 'some-future-adapter' }))), FALLBACK,
    '(8a) FALLBACK/ADJACENCY: an UNMAPPED source resolves IDENTICALLY to ' +
    'the absent one, so an unknown adapter cannot be distinguished from a ' +
    'missing one by reading the sentence');
  assert.strictEqual(emit(composeArrivalTrace(traceEntries(2,
    { folder: 'items', source: 'constructor' }))), FALLBACK,
    '(8a) FALLBACK/ADJACENCY: ...and an INHERITED property name resolves ' +
    'to the fallback too — the lookup is an own-property check, so ' +
    '`constructor` cannot reach Object.prototype and emit a function body');

  // ---- (9) IDEMPOTENCY — no memo, no clock ---------------------------
  const twiceIn = traceEntries(3, { folder: 'chinese',
    source: 'obsidian-vault' });
  const first = emit(composeArrivalTrace(twiceIn));
  const second = emit(composeArrivalTrace(twiceIn));
  assert.strictEqual(first, second,
    '(8a) IDEMPOTENCY: composing the same day twice yields the IDENTICAL ' +
    'sentence. The fence is re-run on every render and holds no memo; the ' +
    'source map is a pure lookup with no clock and no store read');
  assert.strictEqual(emit(composeArrivalTrace(twiceIn.slice())), first,
    '(8a) IDEMPOTENCY: ...and a third compose over a COPY of the same ' +
    'input agrees, so the equality above is not two reads of one cache');

  // ---- (10) ORDERING — nameable beats opaque, both ways round --------
  const nameable = traceEntries(3, { folder: 'chinese',
    source: 'folder-drop' });
  const opaque = traceEntries(5,
    { folder: 'studyroom-collect-k2ks84n7', source: 'folder-drop' });
  const MIXED = 'the librarian brought in notes from your chinese folder, ' +
    'and elsewhere in your vault.';
  assert.strictEqual(emit(composeArrivalTrace(nameable.concat(opaque))),
    MIXED,
    '(8a) ORDERING: when a day MIXES opaque and nameable, the NAMEABLE ' +
    'folder wins even though the opaque one is LARGER (5 against 3), and ' +
    'the opaque items fold into the tail. The source map is NOT consulted ' +
    'here, because a folder IS speakable');
  assert.strictEqual(emit(composeArrivalTrace(opaque.concat(nameable))),
    MIXED,
    '(8a) ORDERING: ...and the SAME sentence in the OPPOSITE input order, ' +
    'so the winner is not an artefact of which arrived first');

  // ---- (11) THE LIBRARIAN\'S OWN NOTE IS NOT AN ARRIVAL ---------------
  const libStore = {};
  libStore['real-1'] = traceItem('real-1',
    { at: TRACE_DAY, type: 'text', folder: '', source: 'folder-drop' });
  libStore['lib-1'] = traceItem('lib-1',
    { at: TRACE_DAY, type: 'image', folder: '', source: 'librarian' });
  const libPacked = traceArrivalsOn(libStore, TRACE_LABEL);
  assert.strictEqual(libPacked.length, 1,
    '(8a) LIBRARIAN: the packer emits ONE arrival from a day holding one ' +
    'real item and one `source: librarian` item. Exactly one such item ' +
    'exists in her library — the librarian\'s OWN note is not something ' +
    'the librarian BROUGHT IN');
  assert.strictEqual(libPacked[0].source, 'folder-drop',
    '(8a) LIBRARIAN: ...and the surviving one is the real arrival, not ' +
    'the librarian note (a length check alone would pass if the WRONG ' +
    'one survived)');
  const libSentence = emit(composeArrivalTrace(libPacked));
  assert.strictEqual(libSentence,
    'the librarian brought in notes from what you dropped in.',
    '(8a) LIBRARIAN: the sentence names the real arrival\'s kind ONLY. ' +
    'The librarian note is an IMAGE, so if it were counted the sentence ' +
    'would read `notes and photographs` — the fixture is built so the ' +
    'filter\'s absence changes the OUTPUT, not just a length');
  assert.strictEqual(libSentence.indexOf('photographs'), -1,
    '(8a) LIBRARIAN: ...asserted directly on the word that would appear');
})();

// ---- 6f(b) FORBIDDEN_TOKENS — the ban, over a collection pinned BY VALUE --
//
// The scan runs over EVERY string the composer emitted anywhere above,
// including the 1,898-arrival day and the 1-arrival day. A ban over an empty
// or shrunken collection is this project's defect class in its purest form,
// so the collection is asserted non-empty AND its distinct membership is
// pinned by value FIRST.
(function forbiddenTokens() {
  const FORBIDDEN_TOKENS = ['many', 'a lot', 'several', 'more', 'remaining',
    'await'];
  assert.ok(EMITTED.length >= 20,
    '(6f-b) POSITIVE CONTROL: the composer emitted ' + EMITTED.length +
    ' sentences across this file and the ban below scans all of them. A ' +
    'ban over an empty collection passes by never running');
  const distinct = EMITTED.filter(function (s, i) {
    return EMITTED.indexOf(s) === i;
  }).sort();
  // ⚠ PIN REWRITTEN IN 26.91-08, NEVER DELETED — and it went RED on the
  // rewrite, which is the pin working rather than the pin failing. Wave 7
  // pinned EIGHT sentences; this wave adds the never-name fallbacks, the
  // per-source phrases, the two cap boundaries and the two no-normalisation
  // shapes, for EIGHTEEN. Every one of the original eight is still here.
  assert.deepStrictEqual(distinct, [
    'the librarian brought in notes and photographs from your chinese ' +
      'folder.',
    'the librarian brought in notes and photographs from your ' +
      'mmmmmmmmmmmmmmmmmmmmmmmm folder, and elsewhere in your vault.',
    'the librarian brought in notes and photographs from your ' +
      '文文文文文文文文文文文文文文文文文文文文文文文文 folder, and elsewhere in your vault.',
    'the librarian brought in notes from elsewhere in your vault.',
    'the librarian brought in notes from what you dropped in.',
    'the librarian brought in notes from your Items folder.',
    'the librarian brought in notes from your alpha folder, and elsewhere ' +
      'in your vault.',
    'the librarian brought in notes from your chinese folder, and ' +
      'elsewhere in your vault.',
    'the librarian brought in notes from your chinese folder.',
    'the librarian brought in notes from your items  folder.',
    'the librarian brought in notes from your ' + 'n'.repeat(24) + ' folder.',
    'the librarian brought in notes from your ' + 'n'.repeat(24) +
      '… folder.',
    'the librarian brought in notes from your phone notes.',
    'the librarian brought in notes from your ' + 'p'.repeat(24) +
      '… folder, and elsewhere in your vault.',
    'the librarian brought in notes from your vault.',
    'the librarian brought in notes from your ' + '文'.repeat(24) +
      '… folder.',
    'the librarian brought in photographs from your chinese folder.',
    'the librarian brought in photographs from your photos.'
  ], '(6f-b) THE EMITTED SET, PINNED BY VALUE. Eighteen distinct sentences ' +
     'and no others. A nineteenth shape appearing here is a new copy string ' +
     'that nobody reviewed, and a shape VANISHING is a probe that stopped ' +
     'probing. Got:\n' + distinct.map(function (s) {
       return '  ' + JSON.stringify(s);
     }).join('\n'));
  // 26.91-08: the never-named folder names must not appear ANYWHERE in the
  // emitted set, asserted over the whole collection rather than case by case.
  ['processed jd', 'studyroom-collect-'].forEach(function (banned) {
    distinct.forEach(function (s) {
      assert.strictEqual(s.indexOf(banned), -1,
        '(6f-b) NEVER-NAME: ' + JSON.stringify(banned) + ' reaches no ' +
        'composed sentence anywhere in this file: ' + JSON.stringify(s));
    });
  });
  EMITTED.forEach(function (s) {
    assert.strictEqual(/[0-9]/.test(s), false,
      '(6f-b) NO DIGIT reaches the trace: ' + JSON.stringify(s));
    assert.strictEqual(s.indexOf('%'), -1,
      '(6f-b) NO PERCENT reaches the trace: ' + JSON.stringify(s));
    FORBIDDEN_TOKENS.forEach(function (tok) {
      assert.strictEqual(s.indexOf(tok), -1,
        '(6f-b) NO MAGNITUDE WORD reaches the trace — found ' +
        JSON.stringify(tok) + ' in ' + JSON.stringify(s) + '. The token ' +
        'list is pinned BY VALUE: ' + JSON.stringify(FORBIDDEN_TOKENS));
    });
    assert.strictEqual(s.indexOf('nothing'), -1,
      '(6f-b) and NO "nothing" sentence is authored: ' + JSON.stringify(s));
    assert.strictEqual(s.indexOf('undefined'), -1,
      '(6f-b) 26.91-08: and the LITERAL `undefined` appears in NO emitted ' +
      'string — scanned over EVERY sentence, not spot-checked, because the ' +
      'absent/empty/null source shapes are exactly where a bare lookup ' +
      'would stringify one onto the page: ' + JSON.stringify(s));
    assert.strictEqual(s.indexOf('null'), -1,
      '(6f-b) 26.91-08: ...and so does the literal `null`: ' +
      JSON.stringify(s));
    assert.strictEqual(s.indexOf('studyroom-collect-'), -1,
      '(6f-b) and NO opaque adapter hash reaches the surface: ' +
      JSON.stringify(s));
    assert.strictEqual(s.indexOf('PRIVATE CONTENT'), -1,
      '(6f-b) and no item body reaches the trace: ' + JSON.stringify(s));
    assert.strictEqual(s.indexOf('personnel notes'), -1,
      '(6f-b) and no origin_path segment reaches the trace — every fixture ' +
      'item carries a synthetic `/Users/SYNTHETIC/personnel notes/...` ' +
      'origin_path ON PURPOSE, so this is a live temptation rather than a ' +
      'hypothetical: ' + JSON.stringify(s));
  });

  // ---- THE THREE SOURCE SCANS, LABELLED AS SUCH, COMMENT-STRIPPED -----
  const composerSrc = bodyOf('composeArrivalTrace');
  assert.strictEqual((composerSrc.match(/origin_path/g) || []).length, 0,
    '(6f-b) SOURCE SCAN (comment-stripped): `origin_path` appears ZERO ' +
    'times inside composeArrivalTrace. It carries the fenced parent `HR ' +
    'related/`, her username, and on the opaque days a /var/folders/.../T/ ' +
    'temp dir');
  assert.strictEqual((composerSrc.match(/guard/g) || []).length, 0,
    '(6f-b) SOURCE SCAN (comment-stripped): the composer CALLS NO GUARD. ' +
    'The fence already ran inside packArrivalDays; re-running it here ' +
    'would be a SECOND implementation of a law-5 surface');
  assert.strictEqual((composerSrc.match(/innerHTML/g) || []).length, 0,
    '(6f-b) SOURCE SCAN (comment-stripped): no `innerHTML` inside the ' +
    'composer');
})();

// ===========================================================================
// ---- (G-B2) THE FENCE, DRIVEN BY MUTATION — AND ITS FAIL-CLOSED HALF ------
// ---- (G-B4) NO HASH ON THE SURFACE; THE LIBRARIAN IS NOT AN ARRIVAL -------
//
// ⚠⚠ THE STANDING WARNING, AT THE TOP WHERE IT CANNOT BE MISSED: half two of
// G-B2 (`typeof guard !== 'function'` yields EMPTY output) LOOKS LIKE
// DEFENSIVE NOISE AND IS THE DIFFERENCE BETWEEN A LAW-5 P0 LEAK AND AN EMPTY
// LINE. A later plan that "simplifies" it returns this instrument to
// measuring nothing. Same status as G-B5, G-C4, 26.9's empty-state assertion
// 2, and regen-gate steps 1 and 4. IT MAY NOT BE SIMPLIFIED AWAY.
//
// BOTH DEGENERATE FORMS ARE CLOSED, AND HERE IS THE SENTENCE THAT SAYS SO:
// an ALWAYS-FALLBACK implementation (one that never names a folder) FAILS
// HALF ONE, because half one asserts the pre-flip sentence NAMES the folder;
// a NEVER-FENCE implementation (one that ignores the guard) FAILS HALF TWO,
// because half two asserts the post-flip sentence does NOT. NEITHER CAN PASS
// ALONE, and that is why both halves exist.
//
// ANTI-VACUITY AUDIT:
//   (a) WHAT MAKES IT FAIL? A cached fence fails half one's mutation (and is
//       DEMONSTRATED to, below, by caching deliberately). Deleting the
//       `typeof guard !== 'function'` disjunct fails the fail-closed half.
//       Ignoring the guard entirely fails the post-flip assertion.
//   (b) CAN IT PASS EMPTY? No — the PAIRING is explicit and in THIS group:
//       the clean day is asserted to DO emit a folder name, so a composer
//       that returned '' for everything satisfies the two negative
//       assertions and dies on the positive one. This is the mitigation
//       VALIDATION names for G-B3/G-B4 and it is written here rather than
//       implied by test-file adjacency.
//   (c) DEAD BRANCH? No assertion here has `apple-notes` or `apple-photos`
//       as its only positive case; neither appears in this group at all.
//   (d) COMMENT OR CODE? Every string below is produced by CALLING the
//       shipped packer and the shipped composer, with the REAL core.js
//       guardSurface threaded in as an argument. Evaluation order, not
//       source order.
//
// This group keeps its OWN emitted collection and its OWN by-value pin
// rather than feeding 6f-b's, so the ban that covers these sentences lives
// beside them and cannot be satisfied by a collection assembled elsewhere.
(function fenceDrivenAndG_B4() {
  const GB = [];
  function gemit(s) { GB.push(s); return s; }
  const OPAQUE = 'studyroom-collect-k2ks84n7';

  // The day under test: ONE item in a speakable folder, plus nine in an
  // opaque one. `chinese` is therefore the winner (the hash is unspeakable)
  // AND holds exactly one item — so flipping exactly ONE item's state
  // removes the whole folder, which is the boundary a THRESHOLD
  // implementation would betray itself at and nowhere else.
  function fenceStore() {
    const s = traceBulk({}, 'o', 9, { at: TRACE_DAY, folder: OPAQUE });
    s['c-only'] = traceItem('c-only',
      { at: TRACE_DAY, type: 'text', folder: 'chinese' });
    return s;
  }

  // ---- HALF ONE — THE MUTATION, SAME CALL, SAME ARGUMENTS ------------
  const store = fenceStore();
  const before = gemit(traceOver(store));
  assert.strictEqual(before,
    'the librarian brought in notes from your chinese folder, and ' +
    'elsewhere in your vault.',
    '(G-B2/1) HALF ONE, PRE-FLIP: the day\'s largest SURVIVING speakable ' +
    'folder is named. ⚠ AN ALWAYS-FALLBACK IMPLEMENTATION FAILS EXACTLY ' +
    'HERE — this is the assertion that closes that degenerate form');
  assert.ok(before.indexOf('chinese') !== -1,
    '(G-B2/1) ...asserted on the folder name itself, so the whole-string ' +
    'comparison above is not the only thing holding the positive case');

  // flip EXACTLY ONE item — the shipped guard reads `state`.
  store['c-only'].state = 'never_show';
  // THE SAME CALL, THE SAME ARGUMENTS. That is the whole method: a fence
  // that ran once and cached its answer passes the assertion above and
  // FAILS the one below, and nothing else in this file would notice.
  const after = gemit(traceOver(store));
  assert.strictEqual(after,
    'the librarian brought in notes from what you dropped in.',
    '(G-B2/1) HALF ONE, POST-FLIP: ONE item flipped to `never_show` and ' +
    'the folder name is GONE, replaced by the fallback. THE SAME CALL WITH ' +
    'THE SAME ARGUMENTS produced both sentences — a CACHED FENCE passes ' +
    'the pre-flip assertion and fails this one, which is precisely what ' +
    'this half exists to catch. ⚠ A NEVER-FENCE IMPLEMENTATION FAILS ' +
    'EXACTLY HERE');
  assert.strictEqual(after.indexOf('chinese'), -1,
    '(G-B2/1) ...asserted directly on the vanished name');
  assert.notStrictEqual(before, after,
    '(G-B2/1) POSITIVE CONTROL: the two sentences really are different ' +
    'strings. Without this, a composer returning one constant satisfies ' +
    'both equalities above');

  // ---- ADJACENCY: ONE fenced item is as unspeakable as ninety-four ----
  const oneFenced = fenceStore();
  oneFenced['c-only'].state = 'never_show';
  assert.strictEqual(traceOver(oneFenced), after,
    '(G-B2/adjacency) THE ONE-FENCED-ITEM BOUNDARY: a folder holding ' +
    'EXACTLY ONE fenced item is unspeakable, exactly as one holding ' +
    'ninety-four is. The fence is per-folder-MEMBERSHIP, never ' +
    'proportional — a threshold implementation would betray itself HERE ' +
    'and nowhere else, which is why the fixture holds one and not two');

  // ---- THE CACHED-FENCE DEMONSTRATION, DRIVEN ------------------------
  // Not described: performed. The packed result is computed ONCE and reused
  // across the flip, which is exactly the shape a memo would introduce.
  const cachedStore = fenceStore();
  const cachedPack = traceArrivalsOn(cachedStore, TRACE_LABEL);
  cachedStore['c-only'].state = 'never_show';
  const cachedAfter = composeArrivalTrace(cachedPack);
  assert.strictEqual(cachedAfter, before,
    '(G-B2/cached) DEMONSTRATION: with the pack CACHED across the flip, ' +
    'the post-flip sentence is byte-identical to the PRE-flip one — the ' +
    'fenced folder is still named. So a cached fence passes half one\'s ' +
    'first assertion and FAILS its second. This is the demonstration that ' +
    'the same-call-same-arguments method is what catches it');
  assert.notStrictEqual(cachedAfter, after,
    '(G-B2/cached) ...and the cached answer differs from the correctly ' +
    're-run one, which is the leak stated as an inequality');

  // ---- HALF TWO — FAIL-CLOSED ----------------------------------------
  const failClosedStore = fenceStore();
  assert.deepStrictEqual(packArrivalDays(failClosedStore, [], undefined), [],
    '(G-B2/2) HALF TWO, FAIL-CLOSED: `typeof guard !== \'function\'` is ' +
    'the FIRST disjunct, so a MISSING guard yields EMPTY output rather ' +
    'than OPEN output. ⚠ DO NOT SIMPLIFY THIS AWAY — it is the difference ' +
    'between a law-5 P0 leak and an empty line');
  assert.deepStrictEqual(packArrivalDays(failClosedStore, [], null), [],
    '(G-B2/2) ...a null guard likewise');
  assert.deepStrictEqual(packArrivalDays(failClosedStore, [], {}), [],
    '(G-B2/2) ...and a non-callable object likewise, because the check is ' +
    'on CALLABILITY and not on truthiness');
  assert.strictEqual(
    composeArrivalTrace(packArrivalDays(failClosedStore, [], undefined)), '',
    '(G-B2/2) ...and the composer therefore emits NOTHING for that day. ' +
    'The guard\'s absence produces an empty page, never an unfenced one');
  assert.strictEqual(traceOver(failClosedStore), before,
    '(G-B2/2) POSITIVE CONTROL: the SAME store with the REAL guard still ' +
    'composes the full sentence, so the three empties above are the ' +
    'guard\'s absence and not a broken fixture');

  // ---- fence/empty ---------------------------------------------------
  const allUnspeakable = traceBulk({}, 'u', 5,
    { at: TRACE_DAY, folder: OPAQUE, source: 'no-such-adapter' });
  const sAllUnspeakable = gemit(traceOver(allUnspeakable));
  assert.strictEqual(sAllUnspeakable,
    'the librarian brought in notes from elsewhere in your vault.',
    '(G-B2/empty) A day whose EVERY folder is unspeakable names NO folder ' +
    'and renders NO explanation — there is no "some folders were hidden" ' +
    'copy and none is authored. A gap tell is a law-5 leak in a different ' +
    'costume');
  const allFenced = traceBulk({}, 'f', 5,
    { at: TRACE_DAY, folder: 'chinese', trigger: true });
  assert.deepStrictEqual(traceArrivalsOn(allFenced, TRACE_LABEL), [],
    '(G-B2/empty) POSITIVE CONTROL: a day whose every arrival is FENCED ' +
    'really does pack to zero arrivals');
  assert.strictEqual(traceOver(allFenced), '',
    '(G-B2/empty) ...and composes NOTHING, so the day carries no trace ' +
    'page at all — distinct from the unspeakable-folder case above, which ' +
    'carries a page with no folder named. Both driven, and NEITHER ' +
    'renders an explanation');
  assert.strictEqual(composeArrivalTrace([]), '',
    '(G-B2/empty) ...and a day with no items at all is not in the roster');

  // ---- fence/encoding — no fold, no trim, no normalisation ------------
  // Two folders differing ONLY by case, one of them holding a fenced item.
  // Written so a future `toLowerCase()` that merged their fates goes RED.
  const caseStore = {};
  caseStore['J1'] = traceItem('J1',
    { at: TRACE_DAY, type: 'text', folder: 'alpha', trigger: true });
  caseStore['J2'] = traceItem('J2',
    { at: TRACE_DAY, type: 'text', folder: 'alpha', trigger: true });
  caseStore['j1'] = traceItem('j1',
    { at: TRACE_DAY, type: 'text', folder: 'Alpha' });
  caseStore['x1'] = traceItem('x1',
    { at: TRACE_DAY, type: 'text', folder: OPAQUE });
  const casePacked = traceArrivalsOn(caseStore, TRACE_LABEL);
  assert.strictEqual(casePacked.length, 2,
    '(G-B2/encoding) POSITIVE CONTROL: the two `alpha` items are fenced ' +
    'and the `Alpha` item and the opaque one survive');
  assert.deepStrictEqual(casePacked.map(function (a) { return a.folder; })
    .sort(), ['Alpha', OPAQUE].sort(),
    '(G-B2/encoding) ...and the survivor really is the CAPITALISED one. ' +
    'Folder comparison is EXACT STRING EQUALITY on the stored value — ' +
    'case-sensitive, with NO normalisation, NO trimming and NO Unicode ' +
    'folding. `Alpha` and `alpha` are DIFFERENT folders evaluated on ' +
    'their OWN membership; a fold added later merges two folders\' fates ' +
    'and must trip here');

  // ---- fence/idempotency ---------------------------------------------
  const idemStore = fenceStore();
  const i1 = traceOver(idemStore);
  const i2 = traceOver(idemStore);
  // an unrelated "repaint": pack a DIFFERENT day in between, then re-compose.
  traceOver(allUnspeakable);
  const i3 = traceOver(idemStore);
  assert.strictEqual(i1, i2,
    '(G-B2/idempotency) Composing the same day twice yields the IDENTICAL ' +
    'sentence: the fence is re-run on every render and holds no memo');
  assert.strictEqual(i3, i1,
    '(G-B2/idempotency) ...and a THIRD invocation after an unrelated ' +
    'repaint agrees, so the equality above is not two reads of one cache');

  // ---- fence/ordering — survivors only --------------------------------
  // Three folders. The LARGEST is fenced, so the winner must be the
  // second-largest SURVIVOR rather than the fallback.
  const orderStore = traceBulk({}, 'big', 6,
    { at: TRACE_DAY, folder: 'chinese', trigger: true });
  traceBulk(orderStore, 'mid', 4, { at: TRACE_DAY, folder: 'alpha' });
  traceBulk(orderStore, 'sml', 2, { at: TRACE_DAY, folder: OPAQUE });
  const sOrder = gemit(traceOver(orderStore));
  assert.strictEqual(sOrder,
    'the librarian brought in notes from your alpha folder, and elsewhere ' +
    'in your vault.',
    '(G-B2/ordering) The winner is chosen from SURVIVORS ONLY: fencing ' +
    'the LARGEST folder (6 items) PROMOTES the next-largest survivor (4) ' +
    'rather than collapsing to the fallback. If the winner were chosen ' +
    'before the fence, this would name the fenced folder');
  assert.strictEqual(sOrder.indexOf('chinese'), -1,
    '(G-B2/ordering) ...and the fenced folder is named nowhere');

  // ---- fence/concurrency — interleaved compose from two guarded inputs -
  const cA = fenceStore();
  const cB = fenceStore();
  cB['c-only'].state = 'never_show';
  const packA1 = traceArrivalsOn(cA, TRACE_LABEL);
  const packB1 = traceArrivalsOn(cB, TRACE_LABEL);
  const packA2 = traceArrivalsOn(cA, TRACE_LABEL);
  const packB2 = traceArrivalsOn(cB, TRACE_LABEL);
  const outs = [composeArrivalTrace(packB1), composeArrivalTrace(packA1),
    composeArrivalTrace(packB2), composeArrivalTrace(packA2)];
  assert.deepStrictEqual(outs, [after, before, after, before],
    '(G-B2/concurrency) The guard is threaded as an ARGUMENT at every ' +
    'layer and re-run on every render, so composing from two guarded ' +
    'inputs in an INTERLEAVED order produces the pre- or the post- ' +
    'sentence and NEVER a torn one. No shared mutable state exists ' +
    'between the two');

  // ---- (G-B4) NO OPAQUE HASH ANYWHERE, SCANNED NOT SPOT-CHECKED -------
  const hashOnlyDay = traceBulk({}, 'h', 7,
    { at: TRACE_DAY, folder: OPAQUE, source: 'no-such-adapter' });
  gemit(traceOver(hashOnlyDay));
  assert.strictEqual(GB.length, 5,
    '(G-B4) POSITIVE CONTROL, PINNED BY VALUE rather than by a threshold: ' +
    'this group emitted ' + GB.length + ' sentences and the scan below ' +
    'covers all of them. A scan over an empty collection passes by never ' +
    'running, and a `>=` threshold survives ten times its input — which is ' +
    'this project\'s named defect class');
  const gDistinct = GB.filter(function (s, i) {
    return GB.indexOf(s) === i;
  }).sort();
  assert.deepStrictEqual(gDistinct, [
    'the librarian brought in notes from elsewhere in your vault.',
    'the librarian brought in notes from what you dropped in.',
    'the librarian brought in notes from your alpha folder, and elsewhere ' +
      'in your vault.',
    'the librarian brought in notes from your chinese folder, and ' +
      'elsewhere in your vault.'
  ], '(G-B4) THIS GROUP\'S EMITTED SET, PINNED BY VALUE. A fifth shape is ' +
     'copy nobody reviewed; a vanished shape is a probe that stopped ' +
     'probing. Got:\n' + gDistinct.map(function (s) {
       return '  ' + JSON.stringify(s);
     }).join('\n'));
  GB.forEach(function (s) {
    assert.strictEqual(/studyroom-collect-/.test(s), false,
      '(G-B4) NO `studyroom-collect-*` HASH reaches any composed sentence ' +
      '— scanned over EVERY string this group emits, including a day ' +
      'whose ONLY folder is one: ' + JSON.stringify(s));
    assert.strictEqual(/[0-9]/.test(s), false,
      '(G-B4) ...and no digit either (law 3): ' + JSON.stringify(s));
    assert.strictEqual(s.indexOf('undefined'), -1,
      '(G-B4) ...and never the literal `undefined`: ' + JSON.stringify(s));
  });

  // ---- (G-B4) THE LIBRARIAN'S OWN NOTE, PAIRED WITH THE POSITIVE -------
  const libDay = {};
  libDay['real'] = traceItem('real',
    { at: TRACE_DAY, type: 'text', folder: '', source: 'no-such-adapter' });
  libDay['lib'] = traceItem('lib',
    { at: TRACE_DAY, type: 'image', folder: '', source: 'librarian' });
  const libPacked = traceArrivalsOn(libDay, TRACE_LABEL);
  assert.strictEqual(libPacked.length, 1,
    '(G-B4) A day holding exactly one `source: librarian` item plus one ' +
    'real arrival packs to ONE arrival');
  assert.strictEqual(composeArrivalTrace(libPacked),
    'the librarian brought in notes from elsewhere in your vault.',
    '(G-B4) ...and the sentence describes the REAL arrival\'s kind ONLY. ' +
    'The librarian note is an IMAGE, so without the filter this would ' +
    'read `notes and photographs` — the fixture is built so the filter\'s ' +
    'absence changes the OUTPUT, not merely a length');

  // ⚠ THE EXPLICIT PAIRING. Empty output satisfies every negative
  // assertion above trivially. This is the mitigation VALIDATION names for
  // G-B3 and G-B4, written HERE rather than implied by adjacency.
  assert.strictEqual(before,
    'the librarian brought in notes from your chinese folder, and ' +
    'elsewhere in your vault.',
    '(G-B4/pairing) THE PAIRING, EXPLICIT: the fixture\'s CLEAN day DOES ' +
    'emit a folder name. Remove this assertion and empty the composer, ' +
    'and every scan above passes over an empty collection. This is what ' +
    'stops G-B3 and G-B4 being satisfied by silence');
  assert.ok(gDistinct.some(function (s) {
    return /your \w+ folder/.test(s);
  }), '(G-B4/pairing) ...and at least one sentence in THIS group\'s own ' +
      'scanned collection names a folder, so the collection the ban runs ' +
      'over is demonstrably non-degenerate');
})();

// ===========================================================================
// ---- 6g. 26.91-07 (PART B) — THE TRACE PAGE ON THE SPREAD -----------------
// ===========================================================================
(function tracePageOnTheSpread() {
  // 26.91-10 (F-3) — THE RULE THIS GROUP HOLDS IS REWRITTEN, NEVER DELETED.
  //
  //   WAVE 7's RULE: *one rule, both cases* — a day with surviving arrivals
  //   gains the trace as its LAST page, whether or not it also holds
  //   blessings. That was right while the page carried a composed sentence,
  //   because the sentence was worth reading beside a blessing.
  //
  //   26.91-10's RULE: the trace page is minted ONLY for a day that
  //   contributed NO surviving blessing page. F-3 takes the sentence off
  //   (the owner's UAT finding: she already knows the librarian syncs when
  //   she enters the room), and what would be left on a lit day is a bare
  //   date wedged between two blessing pages — a page with no reason to
  //   exist.
  //
  // STILL NO BRANCH THAT FIRES ON 0.19% OF THE DATA AND ROTS: both shapes
  // are driven in the SAME build below, so neither can be satisfied by
  // breaking the other.
  const store = traceBulk(traceBulk({}, 'c', 3,
    { at: TRACE_DAY, folder: 'chinese' }), 'x', 1,
    { at: ms(2026, 7, 30), folder: 'chinese' });
  // ...plus a blessing on 07/30 ONLY, so 07/19 is import-only and 07/30 is
  // both. The two shapes are driven in the SAME build.
  store.blessed1 = storeItem('blessed1', 'text', 'a welcomed thing');
  store.blessed2 = storeItem('blessed2', 'text', 'another welcomed thing');
  const ledger = { blessings: [
    entry('blessed1', ms(2026, 7, 30)),
    entry('blessed2', ms(2026, 7, 30))
  ] };

  const entries = packBlessingsToc(ledger, store, [], guard);
  const arrivals = packArrivalDays(store, [], guard);
  const roster = blessingsDayRoster(entries, arrivals);
  const spreads = buildBlessingSpreads(entries, roster, arrivals);

  assert.strictEqual(entries.length, 2,
    '(6g) POSITIVE CONTROL: two surviving blessings, both on 07/30');
  assert.strictEqual(arrivals.length, 4,
    '(6g) POSITIVE CONTROL: four surviving arrivals — three on 07/19, one ' +
    'on 07/30');

  function pagesOfDay(d) {
    const out = [];
    spreads.forEach(function (s) {
      if (s.day !== d) { return; }
      s.pages.forEach(function (p) { out.push(p); });
    });
    return out;
  }

  // ---- the IMPORT-ONLY day: exactly ONE page, and it is the trace ------
  const impPages = pagesOfDay(TRACE_LABEL);
  assert.strictEqual(impPages.length, 1,
    '(6g) an IMPORT-ONLY day has exactly ONE page. Got ' + impPages.length);
  assert.strictEqual(impPages[0].trace, true,
    '(6g) ...and that page is the TRACE page, marked with a ' +
    'DISCRIMINATING FIELD on the PAGE. paintNotebookSpread branches on the ' +
    'page, never on a day-level `lit` flag — wave 6 deliberately demoted ' +
    '`lit` to an attribute of an ENTRY, and re-coupling the two concepts ' +
    'on the render path would undo that');
  assert.deepStrictEqual(impPages[0].arrivals,
    arrivals.filter(function (a) { return a.dayLabel === TRACE_LABEL; }),
    '(6g) ...and it carries THAT DAY\'s already-guarded arrival entries, ' +
    'so the composer never has to reach past its argument');

  // ---- the BOTH day: every blessing page, AND NO BARE-DATE PAGE -------
  //
  // 26.91-10 REWRITTEN, NEVER DELETED — F-3 is the authority. THE ORIGINAL
  // REASON IS UNCHANGED and still carries the assertion: it is stated over
  // the day's WHOLE page sequence BY POSITION, not by membership, so a page
  // in the wrong slot fails here instead of passing a set check. WHAT MOVED:
  // wave 7 expected `2 + 1 = 3` with the trace LAST; F-3 mints a lit day no
  // trace page at all, so the day keeps its two blessing pages and nothing
  // else. This is the assertion mutation (4) — *mint the trace page on lit
  // days too* — is aimed at.
  const bothPages = pagesOfDay(label(2026, 7, 30));
  assert.strictEqual(bothPages.length, 2,
    '(6g/F-3) a day that is BOTH lit and an import day keeps every ' +
    'blessing page and gains NO bare-date page: 2 + 0 = 2. Got ' +
    bothPages.length);
  assert.deepStrictEqual(bothPages.map(function (p) { return !!p.trace; }),
    [false, false],
    '(6g/F-3) ADJACENCY: NO TRACE PAGE IS MINTED ON A LIT DAY — asserted ' +
    'by POSITION over the day\'s whole page sequence, not by membership, ' +
    'so a trace page minted in ANY slot fails here rather than escaping a ' +
    'set check. A bare-date page between two blessing pages is a page with ' +
    'no reason to exist once F-3 removes its sentence');

  // ---- ONE RULE, BOTH CASES: no day-level branch ----------------------
  spreads.forEach(function (s) {
    s.pages.forEach(function (p) {
      assert.strictEqual(p.trace === true || p.itemId !== undefined, true,
        '(6g) every page is either a blessing page (it has an itemId) or a ' +
        'trace page (trace: true) — no third, undefined shape reaches the ' +
        'painter. Got: ' + JSON.stringify(Object.keys(p)));
    });
  });

  // ---- A DAY WITH ZERO SURVIVING ARRIVALS HAS NO TRACE PAGE -----------
  //
  // Driven by flipping the LAST surviving arrival to never_show between TWO
  // RUNS OF THE SAME CALL WITH THE SAME ARGUMENTS — which is what proves
  // the page list is RE-DERIVED through the fence rather than cached.
  //
  // 26.91-10 REWRITTEN, NEVER DELETED — F-3. THE ORIGINAL REASON IS THE
  // WHOLE POINT AND IS UNCHANGED: the page list must be RE-DERIVED through
  // the fence on every call rather than cached, and that is proven by two
  // runs of the SAME call with the SAME arguments across a status flip.
  // WHAT MOVED: the fixture put the blessing and the arrival on the SAME
  // day, which was fine while a lit day also carried a trace page. Under
  // F-3 a lit day carries none, so that fixture would have made the
  // positive control below read 0 and the group would have gone quietly
  // vacuous — a gate silently satisfied by its subject vanishing, which is
  // this project's named defect class. The arrival now sits on an
  // IMPORT-ONLY day (07/19) and the blessing on a different day (07/30), so
  // the trace page genuinely exists before the flip and the surviving
  // blessing still answers the "not the whole notebook" control after it.
  const heal = traceBulk({}, 'c', 1, { at: TRACE_DAY, folder: 'chinese' });
  heal.blessed1 = storeItem('blessed1', 'text', 'a welcomed thing');
  const healLedger = { blessings: [entry('blessed1', ms(2026, 7, 30))] };
  function buildHeal() {
    const e = packBlessingsToc(healLedger, heal, [], guard);
    const a = packArrivalDays(heal, [], guard);
    return buildBlessingSpreads(e, blessingsDayRoster(e, a), a);
  }
  function traceCount(sp) {
    let n = 0;
    sp.forEach(function (s) {
      s.pages.forEach(function (p) { if (p.trace) { n++; } });
    });
    return n;
  }
  const before = buildHeal();
  assert.strictEqual(traceCount(before), 1,
    '(6g) POSITIVE CONTROL: before the flip, the day carries exactly one ' +
    'trace page');
  // the flip — the SAME store object, the SAME call, the SAME arguments.
  Object.keys(heal).forEach(function (id) {
    if (typeof heal[id].imported_ms === 'number') {
      heal[id].state = 'never_show';
    }
  });
  const after = buildHeal();
  assert.strictEqual(traceCount(after), 0,
    '(6g) SELF-HEALING: flipping the day\'s LAST surviving arrival to ' +
    'never_show removes the trace page — same call, same arguments, ' +
    'different answer. A cached arrival pack passes the control above and ' +
    'fails HERE, which is the whole point of driving it twice');
  assert.strictEqual(after.length > 0, true,
    '(6g) POSITIVE CONTROL: ...and the day is still a page, because its ' +
    'blessing survived. Without this, "no trace page" is satisfied by the ' +
    'whole notebook going empty');
})();

// ---- 6g(b) 26.91-07 — NB_TRACE_GEOM AND THE TRACE PAINTER, AT SOURCE -----
//
// SOURCE ASSERTIONS, LABELLED AS SUCH. The trace page's BEHAVIOUR is driven
// in (91c-b) through the real painter; what a driven test structurally
// cannot see is that the geometry is held BY REFERENCE rather than re-typed
// — two objects with equal numbers are indistinguishable at runtime, and
// re-typing a slot is precisely the drift this project keeps finding.
(function traceGeomAndPainterAtSource() {
  const code = stripComments(appSrc);

  // ---- NB_TRACE_GEOM: BY REFERENCE, ZERO NEW SCENE-PX VALUES ----------
  const uses = (appSrc.match(/NB_TRACE_GEOM/g) || []).length;
  assert.ok(uses >= 2,
    '(6g-b) `NB_TRACE_GEOM` appears at least twice in app.js — a ' +
    'declaration nothing reads is a slot that is not in play. Found ' + uses);
  const decl = /var NB_TRACE_GEOM = \{([\s\S]*?)\};/.exec(code);
  assert.ok(decl, '(6g-b) NB_TRACE_GEOM is declared once, as a literal');
  assert.strictEqual(/[0-9]/.test(decl[1]), false,
    '(6g-b) PART B INTRODUCES ZERO NEW SCENE-PX VALUES: NB_TRACE_GEOM\'s ' +
    'declaration contains NO NUMERIC LITERAL AT ALL, over ' +
    'COMMENT-STRIPPED source (the site comment quotes the measured numbers ' +
    'on purpose, so a raw grep here would be matching the fix\'s own ' +
    'explanation of itself). It is two BY-REFERENCE members. Got: ' +
    JSON.stringify(decl[1].trim()));
  assert.ok(/day:\s*STATION_NOTEBOOK_GEOM\.date/.test(decl[1]),
    '(6g-b) ...`day` is STATION_NOTEBOOK_GEOM.date VERBATIM, h:10 ' +
    'exception and all — dates land where dates land');
  assert.ok(/line:\s*STATION_NOTEBOOK_GEOM\.whyText/.test(decl[1]),
    '(6g-b) ...and `line` is STATION_NOTEBOOK_GEOM.whyText — the trace is ' +
    'the page\'s prose and it belongs where a why goes');

  // ---- THE TRACE PAINT BRANCH -----------------------------------------
  const painter = bodyOf('paintTracePage');
  assert.strictEqual((painter.match(/origin_path/g) || []).length, 0,
    '(6g-b) SOURCE SCAN (comment-stripped): `origin_path` appears ZERO ' +
    'times in the trace paint branch. Measured, it carries the fenced ' +
    'parent `personnel notes/`, her username, and on the opaque days a ' +
    '/var/folders/.../T/ temp dir');
  assert.strictEqual((painter.match(/innerHTML/g) || []).length, 0,
    '(6g-b) SOURCE SCAN: `innerHTML` appears ZERO times in the trace paint ' +
    'branch. Folder names are USER DATA on a front-facing surface');
  // 26.91-10 REWRITTEN, NEVER DELETED — F-3 is the authority. THE ORIGINAL
  // REASON IS UNCHANGED: an unreviewed extra node on this page is exactly
  // what the count forbids, and holding it at an EXACT value (never `<=`) is
  // what makes that a gate. WHAT MOVED: wave 7 wrote two nodes — the day
  // label and the composed line — and F-3 removes the line, so the page is
  // the day label and nothing else. THE COUNT GOT SMALLER, WHICH IS THE
  // DIRECTION THAT NEEDS THE MOST CARE: it must not be relaxed to `<= 2`,
  // because that would admit the very node F-3 removed.
  assert.strictEqual((painter.match(/textContent/g) || []).length, 1,
    '(6g-b/F-3) SOURCE SCAN: exactly ONE textContent write — the day ' +
    'label, and nothing else. THE ALMOST-EMPTY PAGE, DESIGNED: a second ' +
    'write would be either the composed sentence F-3 removed or a ' +
    'replacement for it, and no replacement is authored (a "nothing ' +
    'arrived" line would be law-3 damage and a law-5 fence tell at once)');
  // 26.91-10 (F-3), NEW: the CALL SITE is gone, and this is the source half
  // of that claim. The RENDER half — that the composed sentence reaches no
  // painted node at any spread index — is G-F3's, because a source grep
  // cannot see a render. Both are stated so neither is mistaken for the
  // other.
  assert.strictEqual((painter.match(/composeArrivalTrace/g) || []).length, 0,
    '(6g-b/F-3) SOURCE SCAN: `composeArrivalTrace` is NOT called from the ' +
    'trace paint branch. The composer itself is RETAINED in app.js with a ' +
    'retention notice at its site — only this edge is cut — so its absence ' +
    'HERE and its presence THERE are two different claims and both are ' +
    'asserted');
  assert.strictEqual(/station-fixture/.test(painter), false,
    '(6g-b) neither node wears `.station-fixture`. A shared affordance ' +
    'class on a non-interactive element is the same law-3 distinction the ' +
    'unlit calendar cells already avoid');
  assert.strictEqual(/createElement\('button'\)/.test(painter), false,
    '(6g-b) ...and neither node is a button');
  assert.strictEqual(/addEventListener/.test(painter), false,
    '(6g-b) ...and neither takes a listener');
  assert.strictEqual(/paintPageDecorations/.test(painter), false,
    '(6g-b) THE TRACE PAGE CARRIES NO DECORATIONS — paintPageDecorations ' +
    'is not called from here. It has exactly ONE call site, inside ' +
    'paintBlessingPage, and that is the second of the two CLIENT-SIDE ' +
    'blocks keeping an import-only day un-decoratable (the third block ' +
    'that A-2 claimed, the server one, does not exist: validate_decorations ' +
    'enforces only a non-empty string)');
  // The DEFINITION also matches `paintPageDecorations(scene`, so the pin is
  // 2 — one definition plus one call — and the definition is subtracted by
  // name rather than by hoping the reader remembers. Written as `1` first
  // and it failed at 2, which is how the convention got stated here.
  assert.strictEqual(
    (code.match(/function paintPageDecorations\(scene/g) || []).length, 1,
    '(6g-b) POSITIVE CONTROL: paintPageDecorations is defined exactly once');
  assert.strictEqual(
    (code.match(/paintPageDecorations\(scene/g) || []).length, 2,
    '(6g-b) ...and it has EXACTLY ONE CALL SITE (2 matches = 1 definition ' +
    '+ 1 call), over comment-stripped whole-file source. A second caller ' +
    'would silently open the block that keeps an import-only day ' +
    'un-decoratable');
})();

// ===========================================================================
// ---- G-B1. THE PHASE'S CENTRAL GATE (26.91-07 task 3) ---------------------
// ===========================================================================
//
// ⚠ TWO ASSERTIONS IN ONE RUN, OR THIS GATE IS VACUOUS. That is not an
// opinion — it was MEASURED before the gate was written. `26.91-CONTEXT.md`
// A-1 records that on the owner's REAL library `07-27` and `07-30` are BOTH
// import days AND lit days, so a gate of the form
//
//     "the trace renders on at least one page"
//
// PASSES TODAY UNDER THE SUPERSEDED DESIGN and measures nothing. The honest
// gate must assert on an IMPORT-ONLY day and assert `lit === false` for that
// SAME day in the SAME run, over a fixture whose disjointness is itself
// asserted (6e).
//
// THE DEGENERATE FORM IS NOT DESCRIBED HERE, IT IS DEMONSTRATED — section
// (0) below runs the single-assertion form over the fixture's BOTH-day
// section and shows it GREEN while the day is `lit: true`. A later reader
// who wants to "simplify" this group has the evidence in front of them
// rather than a claim about it.
(function gB1TheCentralGate() {
  const zo = ZO.zero_overlap;
  const h = hydrate(zo);
  const entries = packBlessingsToc(h.ledger, h.items, [], guard);
  const arrivals = packArrivalDays(h.items, [], guard);
  const roster = blessingsDayRoster(entries, arrivals);
  const spreads = buildBlessingSpreads(entries, roster, arrivals);

  function traceLineFor(sp, dayLabel) {
    let found = null;
    sp.forEach(function (s) {
      if (s.day !== dayLabel) { return; }
      s.pages.forEach(function (p) {
        if (p.trace) { found = composeArrivalTrace(p.arrivals); }
      });
    });
    return found;
  }
  function anyTraceRenders(sp) {
    let n = 0;
    sp.forEach(function (s) {
      s.pages.forEach(function (p) { if (p.trace) { n++; } });
    });
    return n > 0;
  }

  // ---- (0) THE DEGENERATE FORM, DEMONSTRATED GREEN ---------------------
  const ad = ZO.adjacency;
  const ah = hydrate(ad);
  const adEntries = packBlessingsToc(ah.ledger, ah.items, [], guard);
  const adArrivals = packArrivalDays(ah.items, [], guard);
  const adRoster = blessingsDayRoster(adEntries, adArrivals);
  const adSpreads = buildBlessingSpreads(adEntries, adRoster, adArrivals);
  const bothDay = atLabel(ad.declared_both_day);
  // 26.91-10 REWRITTEN, NEVER DELETED — F-3 is the authority, and this pin
  // INVERTS rather than relaxes.
  //
  //   THE PROPERTY IT WAS WRITTEN TO PROTECT, UNCHANGED: a one-assertion
  //   gate of the form *"the trace renders on at least one page"* must not
  //   be trusted, because a day that is BOTH an import day and a lit day
  //   satisfies it — and on her real library 07-27 and 07-30 are exactly
  //   that shape. That is why the real gate below needs a zero-overlap
  //   fixture AND a second assertion.
  //
  //   WHAT MOVED, AND WHY THE VALUE FLIPPED: under the superseded design a
  //   both-day gained the trace as its LAST page, so this demonstration
  //   read TRUE. F-3 mints a trace page ONLY for a day with no surviving
  //   blessing page, so a both-day now yields NO trace page at all and the
  //   demonstration reads FALSE.
  //
  //   WHY IT IS STILL A GATE, AND A STRONGER ONE: asserting FALSE here pins
  //   that the degenerate pass is now structurally IMPOSSIBLE. If a later
  //   plan re-mints trace pages on lit days, the old degeneracy returns and
  //   THIS LINE GOES RED — which is more than the original could do, since
  //   the original merely recorded that the hole existed. It is also the
  //   assertion mutation (4) is aimed at.
  assert.strictEqual(anyTraceRenders(adSpreads), false,
    '(G-B1/0/F-3) THE DEGENERATE FORM IS NOW STRUCTURALLY CLOSED, ' +
    'DEMONSTRATED: over a fixture whose only day is BOTH an import day and ' +
    'a lit day, "the trace renders on at least one page" is FALSE — ' +
    'because F-3 mints a trace page only for a day with NO surviving ' +
    'blessing page. Under the SUPERSEDED design this read TRUE and that ' +
    'was the whole hole. Re-minting a trace page on a lit day reopens it ' +
    'and reddens HERE');
  assert.strictEqual(adRoster[0].lit, true,
    '(G-B1/0) ...and that day is `lit: true`, so the `lit === false` half ' +
    'of the real gate would FAIL here. Same fixture, opposite verdicts: ' +
    'that is what makes the two assertions a gate rather than one ' +
    'assertion written twice');
  assert.strictEqual(adRoster.length, 1,
    '(G-B1/0) POSITIVE CONTROL: the adjacency section really does hold ' +
    'exactly one day, so the demonstration above is about a both-day and ' +
    'not about some other day in the same fixture');

  // ---- (1) THE TRACE RENDERS ON AN IMPORT-ONLY DAY --------------------
  const impDay = atLabel(zo._import_only_day_with_many);
  const line = traceLineFor(spreads, impDay);
  assert.strictEqual(typeof line, 'string',
    '(G-B1/1) THE TRACE RENDERS ON THE IMPORT-ONLY DAY ' + impDay + ' — ' +
    'named explicitly, and it is import-only by the fixture\'s own asserted ' +
    'disjointness (6e), not by assumption. Got: ' + JSON.stringify(line));
  assert.ok(line.length > 0 && line.indexOf('the librarian brought in') === 0,
    '(G-B1/1) ...and it is a real composed sentence, not the empty string ' +
    'the composer answers for a day with no surviving arrivals. Got: ' +
    JSON.stringify(line));

  // ---- (2) ...AND THAT SAME DAY IS UNLIT, IN THE SAME RUN -------------
  const rosterEntry = roster.filter(function (r) { return r.day === impDay; });
  assert.strictEqual(rosterEntry.length, 1,
    '(G-B1/2) POSITIVE CONTROL: ' + impDay + ' is in the merged day roster ' +
    'exactly once');
  assert.strictEqual(rosterEntry[0].lit, false,
    '(G-B1/2) THE SECOND HALF, IN THE SAME RUN: ' + impDay + '\'s merged ' +
    'roster entry is `lit: false`. Without this the gate is satisfied by a ' +
    'day that is both, which is what 2 of the owner\'s 7 real import days ' +
    'are');
  const dayNum = zo._import_only_day_with_many[2];
  const grid = blessingsMonthGrid(entries,
    monthKey(zo._import_only_day_with_many[0],
      zo._import_only_day_with_many[1]));
  const cell = grid.days.filter(function (c) { return c.day === dayNum; });
  assert.strictEqual(cell.length, 1,
    '(G-B1/2) POSITIVE CONTROL: the calendar has exactly one cell for day ' +
    dayNum);
  assert.strictEqual(cell[0].lit, false,
    '(G-B1/2) ...AND ITS CALENDAR CELL IS UNLIT TOO, in the same run. The ' +
    'page exists and is reachable by the prev/next flip; the cell does not ' +
    'light and is not tappable. Lighting it would shift the calendar from ' +
    '*days you welcomed something* to *days the app did something* — law-3 ' +
    'damage by the back door');
  // 26.91-13 (D-1), REWRITTEN — NEVER DELETED, AND THE REASON IS THE WHOLE
  // POINT OF THE REWRITE.
  //
  // This site read `hasOwnProperty(cell[0], 'view') === false`, messaged
  // "...and the unlit cell carries no `view`, so it cannot be tapped into a
  // spread even by accident". It was a pin on the field's ABSENCE, so it was
  // invisible to a pin-shaped search for the field and absent from
  // `deferred-items.md`'s inventory — and it is the single most dangerous
  // site in this change, because REMOVING THE FIELD MAKES IT PASS
  // VACUOUSLY. No cell anywhere carries that property now, so the assertion
  // would go on reporting green forever while measuring nothing. That is the
  // purest form of this project's named defect class: a gate that survives
  // the disappearance of its own subject.
  //
  // Rewritten to a claim that can still fail. What the original was really
  // protecting is *this cell offers the tap nothing* — so it is asserted as
  // a KEY-SET EQUALITY (a third field of any name reddens it, not merely one
  // spelled `view`) and paired with a by-value positive control naming the
  // month's lit days, so an all-unlit grid cannot satisfy it either.
  assert.deepStrictEqual(Object.keys(cell[0]).sort(), ['day', 'lit'],
    '(G-B1/2) ...and that unlit cell is EXACTLY {day, lit} — it offers the ' +
    'tap NOTHING to navigate by, so it cannot be opened into a spread even ' +
    'by accident. Asserted as a key-set equality rather than as the absence ' +
    'of one named field, because after D-1 (26.91-13) no cell carries that ' +
    'field at all and a named-absence check would pass vacuously forever. ' +
    'Got: ' + Object.keys(cell[0]).join(','));
  const gb1LitDays = grid.days.filter(function (c) { return c.lit; })
    .map(function (c) { return c.day; });
  assert.ok(gb1LitDays.length > 0 && gb1LitDays.indexOf(dayNum) === -1,
    '(G-B1/2) POSITIVE CONTROL: this month really does hold lit days — ' +
    JSON.stringify(gb1LitDays) + ' — and day ' + dayNum + ' is not among ' +
    'them. Without this the key-set equality above is satisfied by a grid ' +
    'in which nothing is lit, where every cell is trivially {day, lit}');

  // ---- (3) AND IT DOES NOT RENDER ON A DAY WITH ZERO ARRIVALS ---------
  //
  // Driven by flipping the LAST surviving arrival to `never_show` between
  // TWO RUNS OF THE SAME CALL WITH THE SAME ARGUMENTS. That is what makes
  // this an assertion about RE-DERIVATION rather than about a value: a
  // cached pack passes the first run and fails the second.
  function rebuild() {
    const e = packBlessingsToc(h.ledger, h.items, [], guard);
    const a = packArrivalDays(h.items, [], guard);
    return buildBlessingSpreads(e, blessingsDayRoster(e, a), a);
  }
  assert.strictEqual(typeof traceLineFor(rebuild(), impDay), 'string',
    '(G-B1/3) POSITIVE CONTROL: before the flip the day still has its ' +
    'trace page');
  const flipped = [];
  Object.keys(h.items).forEach(function (id) {
    const it = h.items[id];
    if (typeof it.imported_ms !== 'number') { return; }
    if (blessingDayLabel(it.imported_ms) !== impDay) { return; }
    if (guard(it, []) !== null) { return; }
    it.state = 'never_show';
    flipped.push(id);
  });
  assert.ok(flipped.length > 0,
    '(G-B1/3) POSITIVE CONTROL: the flip really did change items (' +
    flipped.length + '). A flip that flipped nothing is a probe that ' +
    'probes nothing');
  assert.strictEqual(traceLineFor(rebuild(), impDay), null,
    '(G-B1/3) SELF-HEALING: with every arrival on ' + impDay + ' fenced, ' +
    'the SAME CALL WITH THE SAME ARGUMENTS renders NO trace page — and no ' +
    '"the librarian brought in nothing" page either. The day leaves ' +
    'navigation entirely (law 5 P0)');
  assert.strictEqual(anyTraceRenders(rebuild()), true,
    '(G-B1/3) POSITIVE CONTROL: ...and the OTHER import days still have ' +
    'theirs. Without this, "no trace page" is satisfied by the whole ' +
    'notebook going empty');
  // put the fixture back, so nothing downstream inherits a mutated store.
  flipped.forEach(function (id) { h.items[id].state = 'blessed'; });
  assert.strictEqual(typeof traceLineFor(rebuild(), impDay), 'string',
    '(G-B1/3) ...and the day self-heals BACK IN when the fence lifts. The ' +
    'restoration is asserted rather than assumed, because a probe that ' +
    'leaves the fixture mutated poisons every group after it');
})();

// ---- G-B3. THE COUNT-LEAK GATE, WITH ITS FIXTURE PINNED ------------------
//
// `26.91-VALIDATION.md`'s G-B3 is SOUND AS WRITTEN — this is a fixture pin,
// not a repair, and the framing matters. Revision 1 of the UI-SPEC called
// G-B3 "UNPASSABLE AS WRITTEN"; that was overstated, and describing a sound
// gate as unpassable teaches a future reader to distrust the VALIDATION
// register, which is an instrument this project relies on.
//
// What G-B3 lacked is a PINNED FIXTURE: any two days that happen to carry
// equal kinds satisfy it exactly as written, which makes its strength
// accidental. The two days below hold KINDS AND FOLDERS CONSTANT and vary
// ONLY IN CARDINALITY — 1,898 against 1, the owner's real 07-19 against her
// real 07-27 in shape — so the only surviving difference IS the count, and
// the gate becomes a true count-leak test rather than one that happens to be
// one.
(function gB3TheCountLeakGate() {
  const many = traceArrivalsOn(GB3_MANY, TRACE_LABEL);
  const one = traceArrivalsOn(GB3_ONE, TRACE_LABEL);
  assert.strictEqual(many.length, 1898,
    '(G-B3) THE FIXTURE IS PINNED: the many-day carries exactly 1,898 ' +
    'surviving arrivals');
  assert.strictEqual(one.length, 1,
    '(G-B3) ...and the one-day exactly 1. The two differ ONLY in ' +
    'cardinality');
  assert.deepStrictEqual(
    many.map(function (a) { return a.kind + '|' + a.folder; })
      .filter(function (v, i, l) { return l.indexOf(v) === i; }),
    one.map(function (a) { return a.kind + '|' + a.folder; })
      .filter(function (v, i, l) { return l.indexOf(v) === i; }),
    '(G-B3) ...and they hold the SAME kinds and the SAME folders, asserted ' +
    'rather than declared. Without this the byte-identity below is two ' +
    'days that happen to agree, which is exactly the accidental strength ' +
    'this pin exists to remove');
  const sMany = composeArrivalTrace(many);
  const sOne = composeArrivalTrace(one);
  assert.ok(sMany.length > 0,
    '(G-B3) POSITIVE CONTROL: the composed line is non-empty. The empty ' +
    'string satisfies every count ban at once and is the degenerate pass ' +
    'this line closes');
  assert.strictEqual(sMany, sOne,
    '(G-B3) NO COUNT LEAKS: 1,898 arrivals and 1 arrival compose ' +
    'BYTE-IDENTICAL sentences. Many: ' + JSON.stringify(sMany) + ' One: ' +
    JSON.stringify(sOne));
  assert.strictEqual(/[0-9]/.test(sMany), false,
    '(G-B3) ...and no digit appears in either');
})();

// ---------------------------------------------------------------------------
// (7) 26.87 UAT F5 — the why must not die mid-word with the page half empty.
//
// Owner-reported twice with a screenshot. The stored text was always whole;
// this is render truncation, so the pins are geometric and they are pinned
// AGAINST THE PAGE rather than against a remembered number — a bare
// `h === 108` would go green again the day someone shrank the page.
// ---------------------------------------------------------------------------
(function () {
  function geom(name) {
    // the literal block, read out of source: this file never executes the
    // painter, so the numbers are lifted the same way the rest of this
    // suite lifts app.js constants.
    const block = appSrc.slice(appSrc.indexOf('STATION_NOTEBOOK_GEOM = {'));
    const row = new RegExp(name + ':\\s*\\{([^}]*)\\}').exec(block);
    assert.ok(row, 'STATION_NOTEBOOK_GEOM.' + name + ' is gone');
    const out = {};
    row[1].split(',').forEach(function (part) {
      const kv = part.split(':');
      if (kv.length === 2) { out[kv[0].trim()] = Number(kv[1].trim()); }
    });
    return out;
  }

  const why = geom('whyText');
  const deco = /bl:\s*\{\s*dx:\s*\d+\s*,\s*y:\s*(\d+)/.exec(
    appSrc.slice(appSrc.indexOf('STATION_NOTEBOOK_GEOM = {')));
  assert.ok(deco, '(7) the bottom-left decoration anchor is gone');
  const floorY = Number(deco[1]);

  // it must actually USE the page it is given — the F5 symptom was a box
  // ending at 108 on a page whose furniture starts at 178.
  const bottom = why.y + why.h;
  assert.ok(bottom > floorY - 20,
    '(7) the text why stops at y=' + bottom + ' while the page runs to ' +
    floorY + ' — that is the F5 clip: it cuts with the page still empty');
  // ...and it must not run UNDER that furniture.
  assert.ok(bottom <= floorY,
    '(7) the why (ends y=' + bottom + ') overlaps the page decoration at ' +
    'y=' + floorY + ' — it grew past the page instead of filling it');

  // the clamp is DERIVED, never a second hand-typed line count.
  assert.ok(/webkitLineClamp\s*=\s*[\s\S]{0,120}?wy\.h/.test(appSrc),
    '(7) the why clamp must be derived from the box height in play — a ' +
    'typed line count silently disagrees the first time either geometry ' +
    'moves');
  assert.ok(appSrc.indexOf('NOTEBOOK_CAPTION_LINE_PX') !== -1,
    '(7) the rendered line height must be named once, not inlined twice');

  // and the why must clamp AT ALL — raw overflow:hidden is what made it
  // die mid-word with no ellipsis, unlike the title above it.
  const painter = appSrc.slice(appSrc.indexOf('var why = document.create'));
  assert.ok(painter.slice(0, 1400).indexOf('webkitLineClamp') !== -1,
    '(7) the why has no line clamp — it will truncate mid-word with no ' +
    'visible sign anything was cut, which is the half of F5 that growing ' +
    'the box does not fix');
})();

// ---- 8. LAW 4: content imagery is never filtered (26.9-01, CONTEXT A-5) -----
//
// `.station-scene img` declares `image-rendering: pixelated`.
// `.station-photo img` declared only height / object-fit / width. Both
// selectors have specificity (0,0,1,1) and the cascade resolves PER
// PROPERTY, so the unopposed `pixelated` reached her polaroid — three
// lines below a section header that reads "Content imagery: NO
// image-rendering pixelated here." The comment was right and the CSS did
// not implement it.
//
// ⚠ THIS CHECK IS BLOCK-SCOPED ON PURPOSE, AND A FILE-WIDE GREP FOR THE
// PROPERTY NAME IS EXPLICITLY REJECTED AS THE DEGENERATE FORM. Measured
// this session: `image-rendering` matches 11 lines in tokens.css — 7
// declarations and 4 COMMENT lines, one of which is the very comment that
// describes the defect. A file-wide grep is satisfied eleven different
// ways today, at least four of them prose, and would have passed against
// the broken stylesheet. So: parse from the `.station-photo img` selector
// to its closing brace and search inside THAT SPAN only.
//
// ⚠ NAMED RESIDUAL, carried forward on purpose: a source assertion cannot
// see a cascade. Whether the rule actually wins at render is a live
// computed-style read, and that is a blocking UAT beat in plan 08. The fix
// ships regardless of it.

(function lawFourContentImageryUnfiltered() {
  const raw = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  // COMMENTS ARE STRIPPED FIRST, so prose cannot satisfy anything below by
  // construction rather than by luck. This is what makes the check
  // structurally different from the file-wide grep it replaces.
  const cssSrc = raw.replace(/\/\*[\s\S]*?\*\//g, '');

  // Every rule in the file as {selectors[], body}. A declaration may reach
  // a selector through a selector LIST, so the lookup below collects ALL
  // rules naming a selector — not the first block that happens to mention
  // it. (Reading only the first block is how this check first passed the
  // pre-fix stylesheet's original .station-photo img rule and reported the
  // shipped three-selector fix as missing.)
  const rules = [];
  const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = RULE_RE.exec(cssSrc)) !== null) {
    rules.push({
      selectors: m[1].split(',').map(function (s) { return s.trim(); })
        .filter(Boolean),
      body: m[2]
    });
  }
  assert.ok(rules.length > 100,
    '(8) the tokens.css rule scan found only ' + rules.length + ' rules — ' +
    'the parse broke; fix the instrument before trusting any result below');

  function declaredFor(selector, valueRe) {
    return rules.some(function (r) {
      return r.selectors.indexOf(selector) !== -1 && valueRe.test(r.body);
    });
  }

  // (8a) the shipped defect site.
  assert.ok(rules.some(function (r) {
    return r.selectors.indexOf('.station-photo img') !== -1;
  }), '(8) a .station-photo img rule must exist in tokens.css');
  assert.ok(declaredFor('.station-photo img', /image-rendering\s*:/),
    '(8) NO rule naming .station-photo img declares image-rendering — ' +
    ".station-scene img's `pixelated` reaches her photographs unopposed, " +
    'because the property cascades independently of height/object-fit/' +
    'width (law 4, 26.9 A-5). A file-wide grep for the property name would ' +
    'pass here and prove nothing: it matches 11 lines in this file, at ' +
    'least 4 of them comments — and comments are stripped above precisely ' +
    'so they cannot answer this question.');
  assert.ok(declaredFor('.station-photo img', /image-rendering\s*:\s*auto/),
    '(8) .station-photo img must resolve to image-rendering: auto — her ' +
    'photographs are content, and content is never filtered (law 4)');

  // (8b) the two Tier B sites ship in the same rule. If the editor is cut
  // they degrade to the first selector alone, which is where the SHIPPED
  // defect lives — this is the one named cross-tier dependency.
  //
  // 26.9-09 WIDENS THIS LIST RATHER THAN ADDING A SECOND INSTRUMENT. One
  // instrument that keeps pace beats two that each cover half — the lesson
  // waves 5, 6 and 7 each applied to the region-scoped snap check. The new
  // site is `.page-deco-photo img`: the page's OWN polaroid once she has
  // promoted it out of the pinned `.station-photo` slot, which is the same
  // photograph, one layer up, and must not become pixel art on the way.
  ['.page-deco-img img', '.page-deco-photo img',
    '.station-tin-tray .tray-picture img']
    .forEach(function (sel) {
      assert.ok(declaredFor(sel, /image-rendering\s*:\s*auto/),
        '(8) ' + sel + ' must resolve to image-rendering: auto — the ' +
        'Tier B content-image sites live in the SAME scene as the defect ' +
        'and ship with it, so a cut degrades the rule instead of losing it');
    });
  // and the promoted polaroid is SIZED like a placed picture, whole and
  // never cropped (law 4) — the second shipped selector list it joins.
  assert.ok(declaredFor('.page-deco-photo img', /object-fit\s*:\s*contain/),
    '(8) .page-deco-photo img must resolve to object-fit: contain — a ' +
    'promoted polaroid displays WHOLE, exactly as the pinned slot it left');

  // (8c) SPRITE decorations are the OPPOSITE case and must stay opposite:
  // pixel art keeps its pixels. A blanket rule that turned everything to
  // `auto` would satisfy 8a and 8b and quietly blur the washi.
  assert.ok(
    declaredFor('.station-scene img', /image-rendering\s*:\s*pixelated/),
    '(8) .station-scene img must KEEP image-rendering: pixelated — ' +
    'station sprites are pixel art; a blanket `auto` is not the fix');
})();

// ===========================================================================
// ---- 9: THE NOTEBOOK'S DESIGN MODE (26.9-03, D-13/D-14, SRM-14) ----------
//
// THE ACCEPTED DEBT THIS GROUP EXISTS TO MAKE SAFE, stated verbatim from
// 26.9-03's assumption-delta block:
//
//   "Two booleans encode a three-valued state, so the invalid combination
//    {DESIGN: true, notebook mode: true} is representable even though it is
//    unreachable. Nothing in the type system forbids it."
//
// The claim the plan makes for this group is that it goes RED THE INSTANT
// `DESIGN` CAN BE TRUTHY WHILE A STATION IS OPEN. That claim is only true
// if the assertions cover every route into the flag, so the group asserts
// the invariant from BOTH ENDS:
//
//   DIRECTION A (notebook side) — setNotebookDesign returns early when
//   DESIGN is truthy, and no station painter raises room design mode.
//
//   DIRECTION B (room side, THE INVERTING ASSERTION) — setDesign's OWN body
//   refuses to raise DESIGN while a station is raised, so a call arriving
//   from a key handler, from Manage, or from a room-mode toggle written
//   next year is caught too. Plus the setDesign( call-site count BY
//   EQUALITY, so a new route cannot be added around the guard.
//
// Without Direction B the group would cover two routes while ASSERTING it
// covers all of them — a gate measuring less than it says, which is this
// phase's named defect class. A floor rather than an equality on the count
// would be a zone so broad nothing fires.
// ===========================================================================

// Comment-stripped source. This matters and is not decoration: the guard's
// own explanatory comment mentions `setDesign(` four times in prose, so a
// raw count over the file reads 10 where the truth is 6. The shipped
// tokens.css check strips comments for exactly this reason — prose must not
// be able to answer a question about code.
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(function (l) { return l.replace(/^\s*\/\/.*$/, ''); })
    .join('\n');
}
const appCode = stripComments(appSrc);

// EVERY source assertion in this group runs over stripped code, without
// exception. Two of them were written against raw source first and both
// were WRONG: the guard's own comment says "NEVER 'design-mode'" and the
// mode-entry comment mentions `setDesign(` four times, so a raw check read
// a ban as a violation and a call count as 10 instead of 6. Prose must
// never be able to answer a question about code — the shipped tokens.css
// rule-table check strips comments for precisely this reason, and this is
// the third time on this project that a comment has satisfied or broken a
// grep that was supposed to be measuring behaviour.
function bodyOf(name) { return stripComments(extractFn(appSrc, name)); }

// 26.9-05: the pure transform helpers ship WITH the drag into every harness
// below, as REAL SOURCE rather than as stubs. A stubbed wrapDecoAngle or
// clampDecoScale would let the harness answer the very questions the bound
// cases are asking — the harness would be under test instead of the code.
// The four bounding CONSTANTS are injected as literals instead, and pinned
// separately by value against their declarations in 9i, so the expected
// value and the actual value never come from the same place.
//
// 26.9-09 PREPENDS THE REAL GEOMETRY TABLE, and that is not tidiness either.
// decoBox gained a `photo` branch that reads STATION_NOTEBOOK_GEOM.photo —
// deliberately, so the promoted polaroid's 72x54 box is the geometry table's
// own number rather than a second copy that agrees today. Every harness that
// lifts decoBox therefore needs the table in scope, and a `new Function` body
// is sloppy mode: an unresolved READ throws, but only if the branch is
// reached, so an un-injected table would be a landmine that fires the first
// time some later harness happens to paint a photo record. It is injected
// here, ONCE, from the REAL declaration — never as a hand-typed subset,
// because a harness that retypes the numbers it is checking is a harness
// agreeing with itself.
//
// 26.91-26 (F-23) ADDS THREE MORE, FOR THE REASON THE PARAGRAPH ABOVE GIVES
// RATHER THAN FOR A NEW ONE. The drag's move branch now calls
// `clampDecoOriginFor`, which calls `decoPointExtent`, which calls
// `strokeList`. Roughly twenty harnesses in this file lift `attachPageDrag`;
// patching them one at a time was the obvious move and the wrong one — the
// twenty-first would be written next month against the old idiom and would
// die with a ReferenceError that reads as a bug in the drag. Binding the
// family into THIS ONE STRING means the dependency cannot be forgotten,
// because there is no longer a way to express forgetting it. Note that a
// `new Function` body is SLOPPY MODE: an unresolved read throws only when the
// branch is REACHED, so an un-injected helper is a landmine rather than a
// load error — which is exactly how this was found (by driving, not reading).
// The four server-mirror bounds travel WITH the clamp for the same reason the
// geometry table travels with decoBox: they are read from the REAL
// declarations, never re-typed, so a harness's bound and the shipped one
// cannot drift.
//
// 26.91-27 (F-23 b) ADDS THREE MORE, FOR THE SAME REASON AND FOUND THE SAME
// WAY — by DRIVING a ReferenceError, not by reading. `postDecorations` now
// reaches `errorText` and `nbSaveFailed`, and `nbSaveFailed` keeps
// `NB_SAVE_REASON`. Sloppy mode means an un-injected read throws only when
// the FAILURE branch is reached, so this was invisible until a refusing
// transport ran. Binding the family here is the file's own stated doctrine:
// there is no longer a way to express forgetting it.
const NB_HELPERS = declOf('STATION_NOTEBOOK_GEOM') + '\n' +
  ['NB_DECOR_X_MIN', 'NB_DECOR_X_MAX', 'NB_DECOR_Y_MIN', 'NB_DECOR_Y_MAX']
    .map(declOf).join('\n') + '\n' +
  'var NB_SAVE_REASON = null;\n' +
  ['wrapDecoAngle', 'clampDecoScale', 'strokeList', 'decoBox',
    'previewDecoTransform', 'decoPointExtent', 'clampDecoOriginFor',
    'errorText']
    .map(function (n) { return extractFn(appSrc, n); }).join('\n') + '\n' +
  optFn('nbSaveFailed');
const NB_BOUND_NAMES = ['NB_A_MOD', 'NB_S_MIN', 'NB_S_MAX', 'NB_S_DEFAULT'];
const NB_BOUND_VALUES = [360, 0.5, 2.0, 1];

// 26.9-07: EVERY HARNESS THAT LIFTS attachPageDrag OR setNotebookDesign
// STATES ITS OWN PEN PRE-STATE, OUT LOUD.
//
// This is not tidiness. Both functions read `NB_PEN`, setNotebookDesign
// WRITES it, and a `new Function` body runs in SLOPPY MODE — where an
// assignment to an undeclared name creates a GLOBAL. MEASURED WHILE WRITING
// THIS, not reasoned about: 9a's setNotebookDesign really was creating a
// global `NB_PEN`, and that global was then silently answering the pen guard
// inside FOUR other harnesses (9d, 9e, 9h(b)/9h(c), 9i(b)) that never
// injected it. Every one of them was green, and every one of them was
// reading a value no test had set — this phase's named defect class landing
// inside the instruments once more.
//
// The declaration below is the pen-down pre-state those groups are actually
// about. THE PEN'S OWN GROUP DOES NOT USE IT: 9n passes NB_PEN as a real
// parameter and varies it, which is the only way its two halves can differ.
//
// 26.91-02: NB_WRITE JOINS IT, for exactly the same reason. `write` is the
// pen's second instance and the page-canvas handler reads BOTH flags, so an
// un-injected NB_WRITE would be the identical sloppy-mode landmine one
// identifier over — a global created by the first harness to assign it,
// then silently answering the armed-tool guard inside every later harness
// that never set it.
const PEN_DOWN =
  'var NB_PEN = false; var NB_PEN_GROUP = null; var NB_WRITE = false;\n';

// 26.91-02: THE DECORATION PAINTER TRAVELS WITH ITS THREE HELPERS, ALWAYS.
//
// paintPageDecorations attaches `nbCanvasPointerHandler(...)` — a FACTORY,
// called at attach time, not lazily — which in turn needs nbTextOriginFrom
// and nbPlaceTextRecord. A harness that lifts the painter alone throws a
// ReferenceError the moment it paints a page.
//
// SIX harnesses lift this painter. Patching them one at a time was the
// obvious move and the wrong one: the seventh would be written next month
// against the old idiom and would fail in a way that reads as a bug in the
// painter. Binding the four into ONE string means the dependency cannot be
// forgotten, because there is no longer a way to express forgetting it.
// 26.91-23 (F-22): `nbGuardEditorFocus` joins the bundle for exactly the
// reason the paragraph above gives. It is called by `nbCanvasPointerHandler`,
// so every harness lifting that handler needs it or dies on load with a
// ReferenceError that reads as a bug in the painter. Adding it to the ONE
// binding is what stops the next harness forgetting it.
// 26.91-38 (D-13): `nbPaintMarkRegion` JOINS THE BUNDLE, for exactly the
// reason the paragraph above gives. The region's construction was inline in
// paintPageDecorations until this wave and is now one named builder with two
// call sites, so every harness lifting the painter needs it in scope or dies
// on the first arranging paint with a ReferenceError that reads as a bug in
// the painter. Adding it to the ONE binding is what stops the next harness
// forgetting it.
//
// ⚠ IT IS LIFTED **OPTIONALLY**, on NB_MARK_REGION_VALUE's own precedent and
// for the same measured reason: at a HEAD where the builder does not exist
// yet this file must still LOAD, or `G-31` could never be watched failing —
// and a gate whose red has never been seen is not evidence. At HEAD the
// region's construction is still inline in paintPageDecorations, so the page
// still paints its one region and only the band's fallback is missing, which
// is exactly the state the two red rows are measured against.
const DECO_PAINTER_SRC = ['nbTextOriginFrom', 'nbPlaceTextRecord',
  'nbCanvasPointerHandler', 'nbGuardEditorFocus']
  .map(function (n) { return extractFn(appSrc, n); })
  .concat([optFn('nbPaintMarkRegion'),
    extractFn(appSrc, 'paintPageDecorations')]).join('\n');

// 26.9-06: lift a `var NAME = <literal>;` declaration out of app.js by
// balanced-delimiter scan over COMMENT-STRIPPED source. Every geometry
// assertion in 9k/9l runs over the real declarations rather than over a
// hand-copied table in this file — a harness that retypes the numbers it is
// checking is a harness agreeing with itself, which is this phase's named
// defect class in its purest form.
function declOf(name) {
  const src = stripComments(appSrc);
  const at = src.search(new RegExp('\\n\\s*var ' + name + '\\s*='));
  if (at === -1) { throw new Error('no declaration for ' + name); }
  const from = src.indexOf('=', at) + 1;
  let d = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '[' || c === '(') { d++; }
    else if (c === '}' || c === ']' || c === ')') { d--; }
    else if (c === ';' && d === 0) {
      return 'var ' + name + ' =' + src.slice(from, i) + ';';
    }
  }
  throw new Error('unterminated declaration for ' + name);
}

// 26.91-10: NB_GUTTER_X and NB_MARK_BOUNDS are lifted AFTER NB_BOUNDS, and
// the order is load-bearing — NB_MARK_BOUNDS derives x1/y0/y1 from NB_BOUNDS
// BY REFERENCE, so lifting it first would throw. Reading them from the real
// declarations (rather than re-typing the numbers here) is what keeps the
// harnesses' mark bound and the shipped one from drifting apart.
const NB_SRC_NAMES = ['STATION_NOTEBOOK_GEOM', 'NB_TIN', 'NB_TRAY',
  'NB_ENTRY_ROW', 'NB_BAND', 'NB_BAND_ARRANGING', 'NB_BOUNDS', 'NB_GUTTER_X',
  'NB_MARK_BOUNDS', 'NB_TEXT_BOX',
  'NB_IMG_BOX', 'NB_STICKER_H', 'NB_STICKERS', 'NB_RESET_COPY'];
// eslint-disable-next-line no-new-func
const NB_SRC_CONSTS = new Function(
  NB_SRC_NAMES.map(declOf).join('\n') +
  '\nreturn { ' + NB_SRC_NAMES.map(function (n) {
    return n + ': ' + n;
  }).join(', ') + ' };')();

// 26.91-10 — THE MARK CANVAS, LIFTED WITH ITS CONSUMERS.
//
// `clampDecoOrigin` (stickers, photographs, placed pictures) and the pen's
// pointer gate (handwriting) both read NB_MARK_BOUNDS, which the owner's
// `right-page-only` ruling introduced (26.91-CONTEXT.md A-12). Every harness
// that lifts either one needs it in scope.
//
// EMITTED AS RESOLVED LITERALS, FROM THE REAL DECLARATION. Two reasons, both
// deliberate: the values come from NB_SRC_CONSTS — i.e. from app.js — so no
// number is re-typed here and the harness bound cannot drift from the
// shipped one; and emitting literals rather than the by-reference source
// means this snippet does not require NB_BOUNDS to already be in scope,
// which the harnesses vary on.
//
// 26.91-30 (F-26) — NB_MARK_REGION JOINS IT, as a resolved literal FROM THE
// REAL DECLARATION, for the reason the paragraph above gives. The painter
// reads it, so every harness that paints a page needs it in scope. It is
// lifted OPTIONALLY: at a HEAD where the constant does not exist yet this
// file must still LOAD, or (G-27) could never be watched failing — and a
// gate whose red has never been seen is not evidence. The emitted literal is
// deliberately NOT what G-27/region/derived-not-retyped checks: that
// assertion reads the DECLARATION TEXT out of app.js, so the harness cannot
// answer the question the harness is asking.
const NB_MARK_REGION_VALUE = (function () {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(['NB_BOUNDS', 'NB_GUTTER_X', 'NB_MARK_BOUNDS',
      'NB_DECOR_X_MIN', 'NB_DECOR_X_MAX', 'NB_DECOR_Y_MIN', 'NB_DECOR_Y_MAX',
      'NB_MARK_REGION'].map(declOf).join('\n') +
      '\nreturn NB_MARK_REGION;')();
  } catch (e) { return null; }
}());
const NB_MARK_DECLS =
  'var NB_GUTTER_X = ' + JSON.stringify(NB_SRC_CONSTS.NB_GUTTER_X) + ';\n' +
  'var NB_MARK_BOUNDS = ' +
  JSON.stringify(NB_SRC_CONSTS.NB_MARK_BOUNDS) + ';\n' +
  (NB_MARK_REGION_VALUE
    ? 'var NB_MARK_REGION = ' +
      JSON.stringify(NB_MARK_REGION_VALUE) + ';\n' : '');

// 26.91-38 (D-13): THE REGION BUILDER TRAVELS WITH ITS ONE CONSTANT, ALWAYS.
//
// `nbPaintMarkRegion` now has TWO callers — the page painter and the band's
// refusal fallback — so a harness lifting EITHER needs the builder AND
// NB_MARK_REGION in scope. Binding the two into one string means the
// dependency cannot be forgotten, because there is no longer a way to express
// forgetting it. This is the DECO_PAINTER_SRC lesson applied the moment the
// second caller appeared rather than after the third harness dies on it.
//
// LIFTED AS REAL SOURCE, never re-typed: the builder's geometry is the whole
// point of the extraction, and a harness that re-typed it would be a harness
// agreeing with itself about the one thing this wave is meant to keep single.
//
// OPTIONAL, for the reason DECO_PAINTER_SRC's own note gives: this file must
// LOAD at a HEAD without the builder, or G-31's red could never be watched.
const NB_REGION_SRC = NB_MARK_DECLS + optFn('nbPaintMarkRegion') + '\n';

// ---- 9a: DIRECTION A — the notebook side ---------------------------------

(function () {
  const body = bodyOf('setNotebookDesign');
  // the FIRST statement, not merely "somewhere in the body"
  const first = body.slice(body.indexOf('{') + 1).trim();
  assert.ok(/^if\s*\(\s*on\s*&&\s*DESIGN\s*\)\s*\{\s*return;/.test(first),
    '(9a) setNotebookDesign must OPEN with the DESIGN early return — ' +
    'room design mode wins outright (D-14). Found instead: ' +
    JSON.stringify(first.slice(0, 80)));

  // it sets its OWN body class and never the room's
  assert.ok(body.indexOf("'nb-design'") !== -1,
    '(9a) the notebook mode sets body.nb-design');
  assert.strictEqual(body.indexOf('design-mode'), -1,
    '(9a) setNotebookDesign must NEVER set body.design-mode — that class ' +
    'slides #catalog-panel open (tokens.css:1007) and would drop the ' +
    "room's accessory dock over the station");

  // no station painter raises room design mode
  //
  // 26.91-04 (D-06, 2026-08-07): `renderJournalStation` removed from this
  // roster — the reading door was retired, so the name asserts over nothing.
  //
  // ⚠ AND THE SILENT SKIP IS REMOVED WITH IT. This roster used to open with
  // `if (appSrc.indexOf('function ' + name + '(') === -1) { return; }`, so a
  // painter that was renamed, moved or deleted DROPPED OUT OF THE GATE
  // WITHOUT A WORD — a gate that silently skips, which is this repo's named
  // defect class in its purest form. Retiring one entry is precisely the
  // operation that skip would have hidden, so a missing name now FAILS.
  // The roster is pinned BY VALUE for the same reason: it is consumed by a
  // bare .forEach, and a vanished entry would shrink the gate silently.
  const DESIGN_SAFE_PAINTERS = ['renderNotebookStation',
    'paintNotebookSpread', 'paintBlessingPage', 'paintPageDecorations',
    'attachPageDrag', 'openHandTextEditor', 'renderShelfStation',
    'renderDeskStation', 'renderAlbumStation'];
  assert.strictEqual(DESIGN_SAFE_PAINTERS.length, 9,
    '(9a) the design-safe painter roster is pinned BY VALUE at 9 — it was ' +
    '10 until 26.91 D-06 retired renderJournalStation with the reading book');
  DESIGN_SAFE_PAINTERS.forEach(function (name) {
    assert.notStrictEqual(appSrc.indexOf('function ' + name + '('), -1,
      '(9a) the painter `' + name + '` is not declared in app.js — it was ' +
      'renamed, moved or removed. Update this roster DELIBERATELY; the ' +
      'previous silent skip let a vanished painter leave this gate unnoticed');
    const b = bodyOf(name);
    assert.strictEqual(b.indexOf('setDesign('), -1,
      '(9a) the station painter ' + name + ' must never call setDesign( ' +
      '— a station is open by definition while it paints');
    assert.strictEqual(b.indexOf("'design-mode'"), -1,
      '(9a) ' + name + ' must never touch body.design-mode');
  });

  // THE STATE MATRIX. Two booleans, four representable combinations; the
  // both-on cell must be unreachable through either setter. Driven, not
  // asserted from source — this is the debt itself, exercised.
  // 26.9-06: the key-binding ledger. Every addEventListener /
  // removeEventListener the mode makes, in order, so "bound on entry and
  // RELEASED on exit" is asserted by the listener actually leaving rather
  // than by the flag going false — the flag going false is what the mode
  // does anyway, and would pass with the listener still attached.
  const boundLog = [];
  const setters = (function () {
    const src = PEN_DOWN + extractFn(appSrc, 'setNotebookDesign');
    // eslint-disable-next-line no-new-func
    return new Function('body', 'repaint', 'bound', `
      var DESIGN = false, NBDESIGN = false, NB_SEL = null;
      var NB_UNDO = [], NB_REDO = [], NB_RESET_ARMED = false;
      function nbKeydown() {}
      var document = { body: { classList: {
        toggle: function (c, on) { body[c] = !!on; },
        remove: function (c) { body[c] = false; } } },
        addEventListener: function (t, fn) { bound.push(['+', t, fn]); },
        removeEventListener: function (t, fn) { bound.push(['-', t, fn]); } };
      var NB_REPAINT = repaint;
      ${src}
      return {
        setNotebookDesign: setNotebookDesign,
        setRoomDesign: function (v) { DESIGN = v; },
        seed: function () { NB_UNDO.push('x'); NB_REDO.push('y'); },
        stacks: function () {
          return { undo: NB_UNDO.length, redo: NB_REDO.length };
        },
        handler: function () { return nbKeydown; },
        read: function () { return { DESIGN: DESIGN, NBDESIGN: NBDESIGN }; }
      };`)({}, null, boundLog);
  })();

  const matrix = [];
  // (1) room OFF -> notebook ON  => allowed
  setters.setRoomDesign(false);
  setters.setNotebookDesign(true);
  matrix.push(setters.read());
  // (2) notebook ON -> notebook OFF => the exit always works
  setters.setNotebookDesign(false);
  matrix.push(setters.read());
  // (3) room ON -> notebook ON => REFUSED (the invalid cell)
  setters.setRoomDesign(true);
  setters.setNotebookDesign(true);
  matrix.push(setters.read());
  // (4) room ON -> notebook OFF => still allowed (exits are never blocked)
  setters.setNotebookDesign(false);
  matrix.push(setters.read());

  assert.deepStrictEqual(matrix, [
    { DESIGN: false, NBDESIGN: true },
    { DESIGN: false, NBDESIGN: false },
    { DESIGN: true, NBDESIGN: false },
    { DESIGN: true, NBDESIGN: false }
  ], '(9a) the two-flag state matrix: the both-on cell is UNREACHABLE, ' +
     'and turning the notebook mode OFF is never blocked in either room ' +
     'state (a guard that also caught the falsy branch would be a ' +
     'degenerate over-fire)');
  assert.ok(!matrix.some(function (s) { return s.DESIGN && s.NBDESIGN; }),
    '(9a) {DESIGN: true, NBDESIGN: true} never occurred');

  // ---- 26.9-06 (D-15): THE BINDINGS ARE BOUND ON ENTRY AND RELEASED ------
  //
  // Driven over the SAME four transitions above, so the ledger is a record
  // of real calls rather than of a source read. The assertion is that the
  // listener is HANDED BACK to removeEventListener with the SAME function
  // reference — a remove with a different reference detaches nothing, and
  // "NBDESIGN is false" would pass with the listener still attached, which
  // is the failure this is here to catch.
  const keydowns = boundLog.filter(function (e) { return e[1] === 'keydown'; });
  assert.deepStrictEqual(keydowns.map(function (e) { return e[0]; }),
    ['+', '-', '-'],
    '(9a) transition (1) room-off -> notebook-on BINDS keydown; (2) ' +
    'notebook-off RELEASES it; (3) the refused entry binds NOTHING (it ' +
    'returns before the flag is touched); (4) the second exit releases ' +
    'again, harmlessly. Found: ' +
    JSON.stringify(keydowns.map(function (e) { return e[0]; })));
  assert.ok(keydowns.length >= 2 && keydowns[0][2] === keydowns[1][2],
    '(9a) and the release hands back the SAME function reference it bound ' +
    '— removeEventListener with a fresh closure detaches nothing at all, ' +
    'and the mode flag would still read false');
  assert.strictEqual(keydowns[0][2], setters.handler(),
    '(9a) which is nbKeydown itself, not a wrapper');

  // ---- 26.9-06: THE STACK CLEARS AT MODE ENTRY, AND ONLY AT ENTRY --------
  setters.setRoomDesign(false);
  setters.setNotebookDesign(true);
  setters.seed();
  assert.deepStrictEqual(setters.stacks(), { undo: 1, redo: 1 },
    '(9a) the positive control: the seeded stacks are non-empty BEFORE the ' +
    're-entry below, without which "cleared" is trivially true');
  setters.setNotebookDesign(true);   // already on: not a fresh entry
  assert.deepStrictEqual(setters.stacks(), { undo: 1, redo: 1 },
    '(9a) a redundant setNotebookDesign(true) is NOT a fresh entry and ' +
    'must not throw her history away mid-session');
  setters.setNotebookDesign(false);
  setters.setNotebookDesign(true);
  assert.deepStrictEqual(setters.stacks(), { undo: 0, redo: 0 },
    '(9a) but a real exit-and-re-entry starts a fresh arranging session ' +
    'with no history — the room\'s clear-at-mode-boundary precedent, and ' +
    'what makes the glyphs honestly disabled at entry');
})();

// ---- 9b: DIRECTION B — the room side, the inverting assertion ------------

(function () {
  // REGION-SCOPED from the signature to the closing brace, so a guard
  // sitting in some other function cannot satisfy this.
  const body = bodyOf('setDesign');
  const first = body.slice(body.indexOf('{') + 1).trim();
  assert.ok(
    /^if\s*\(\s*on\s*&&\s*stationIsRaised\(\)\s*\)\s*\{\s*return;/
      .test(first),
    '(9b) setDesign must OPEN with the station-raised guard. This is the ' +
    'assertion that makes the group\'s COVERAGE match its CLAIM: without ' +
    'it a setDesign(true) from a key handler, from Manage, or from a ' +
    'future room-mode toggle reaches the invalid state unopposed, and the ' +
    'shared undo bindings stop being safe SILENTLY. Found: ' +
    JSON.stringify(first.slice(0, 90)));

  // the guard must not catch the falsy branch — exiting is never blocked
  assert.ok(/\bon\s*&&/.test(first),
    '(9b) the guard is conditioned on the TRUTHY argument only. ' +
    'setDesign(false) must stay completely unguarded: blocking an EXIT ' +
    'from room design mode would be a degenerate over-fire');

  // stationIsRaised reads the EXISTING raised-station state, never a
  // second source of truth for it
  const raised = bodyOf('stationIsRaised');
  assert.ok(raised.indexOf('viewStack') !== -1 &&
    raised.indexOf("'station'") !== -1,
    '(9b) stationIsRaised must read ROOM.viewStack — the existing ' +
    'raised-station state, not a second flag that can disagree with it');
  assert.ok(/for\s*\(/.test(raised),
    '(9b) it scans the WHOLE stack, not just the top: a spread can sit ON ' +
    'a station and the station is still open underneath');

  // THE CALL-SITE COUNT, BY EQUALITY. A floor would be a zone so broad
  // nothing fires; an equality means a new route added anywhere at all
  // either passes through the guard above or turns this group red.
  const occurrences = (appCode.match(/setDesign\(/g) || []).length;
  const definitions = (appCode.match(/function setDesign\(/g) || []).length;
  assert.strictEqual(definitions, 1,
    '(9b) setDesign is defined exactly once');
  assert.strictEqual(occurrences - definitions, 5,
    '(9b) app.js holds EXACTLY 5 setDesign( call sites (measured ' +
    '2026-08-04: the Manage arrange row, the manage-link exit, the ' +
    'toolbar arrange button, the Escape exit, and the design-done ' +
    'button). Adding a sixth is not forbidden — it is a decision that ' +
    'has to be made deliberately, because every route into the flag must ' +
    'pass through the station-raised guard. If you added one on purpose, ' +
    'update this number and say why in the summary. Counted ' +
    (occurrences - definitions) + '.');

  // and the count is over CODE, not prose — proven, not asserted
  const rawOccurrences = (appSrc.match(/setDesign\(/g) || []).length;
  assert.ok(rawOccurrences > occurrences,
    '(9b) the comment strip is load-bearing: the raw file mentions ' +
    'setDesign( ' + rawOccurrences + ' times against ' + occurrences +
    ' in code. A count that let prose answer it would drift every time ' +
    'someone edited a comment');
})();

// ---- 9c: the room's snap NEVER reaches the notebook (region-scoped) ------

(function () {
  // The notebook design region: from setNotebookDesign through the end of
  // attachPageDrag. FILE-WIDE NEGATIVE GREPS ARE REJECTED — releaseSnap,
  // gridClampX and snapY legitimately live elsewhere in app.js, so only a
  // region-scoped check can say anything true.
  // 26.9-05 EXTENDS THE REGION rather than adding a second negative grep
  // somewhere else: the transform helpers, the reorder and the handle
  // painter are part of the same canvas and a snap could hide in any of
  // them. One instrument, widened, is stronger than two that each cover
  // half — and the widening is what makes the claim keep pace with the
  // code.
  // 26.9-06 WIDENS IT AGAIN, for the same reason 26.9-05 did: the second
  // undo stack and the band are part of the same canvas, and the room's
  // snap or the room's stack could hide in either. One instrument that
  // keeps pace beats two that each cover half.
  const region = ['setNotebookDesign', 'clampDecoOrigin', 'attachPageDrag',
    'paintPageDecorations', 'openHandTextEditor',
    'wrapDecoAngle', 'clampDecoScale', 'decoBox', 'previewDecoTransform',
    'bringDecoToFront', 'paintDecoHandles',
    'nbSnapshot', 'applyNbSnapshot', 'pushNbUndo', 'doNbUndo', 'doNbRedo',
    'updateNbButtons', 'nbGlyphState', 'nbKeydown',
    'renderNotebookBand',
    // 26.9-07 WIDENS IT ONCE MORE, for the reason 05 and 06 both did: the
    // pen draws on the same canvas, and a 12px snap hiding in the capture
    // would destroy D-03's free position exactly where it matters most.
    'strokeList', 'strokeBox', 'penFlatten', 'penShift', 'paintStrokeGroup',
    'commitStroke', 'attachPenCapture',
    'setNotebookPen',
    // 26.9-09 WIDENS IT ONCE MORE, for the reason 05, 06 and 07 all did:
    // the promoted polaroid is created and located by these two, and a
    // 12px snap hiding in the promotion origin would put the page's own
    // photograph on a grid the moment she entered the mode.
    'livePagePhoto', 'ensurePagePhoto'].map(bodyOf).join('\n');

  ['releaseSnap', 'gridClampX', 'snapY', 'pushDesignUndo',
    'recordDesignPosition', 'DESIGN_UNDO', 'DESIGN_REDO',
    'data-cls', 'room-scene-el', 'syncSeatedZ', 'syncSurfacesToLayout',
    'postLayout'].forEach(function (name) {
    assert.strictEqual(region.indexOf(name), -1,
      '(9c) the notebook design region must never reach "' + name + '" — ' +
      'it belongs to the ROOM. A 12px snap here would silently destroy ' +
      "D-03's free-overlap decision, which is the whole point of a " +
      'separate canvas');
  });

  // the positive control: the region is real and is the right region
  assert.ok(region.length > 1500,
    '(9c) the extracted region must be substantial — a negative grep ' +
    'over an empty region proves nothing (' + region.length + ' chars)');
  assert.ok(region.indexOf('station-scene') !== -1,
    '(9c) and it must be the STATION region — it reads #station-scene');

  // --k is read at pointerdown, from #station-scene, never cached at boot
  const drag = bodyOf('attachPageDrag');
  const pd = drag.slice(drag.indexOf('pointerdown'));
  assert.ok(pd.indexOf("getPropertyValue('--k')") !== -1,
    '(9c) the notebook drag reads --k INSIDE the pointerdown handler ' +
    '(shipped Pitfall 6: fitStationScale recomputes it on resize, so a ' +
    'value cached at boot is wrong the first time the window changes)');
  assert.ok(pd.indexOf("$('station-scene')") !== -1,
    '(9c) and it reads it from #station-scene, not the room scene');
  // NO MODULE-SCOPE CACHE OF IT WAS INTRODUCED. The indentation IS the
  // scope test here: app.js is one big IIFE whose module-level
  // declarations sit at exactly two spaces, while every function-local
  // one is indented deeper. A pattern that ignored indentation would fire
  // on the perfectly correct `var k = parseInt(getComputedStyle(...))`
  // INSIDE the pointerdown handler — which is the very line the
  // assertion above requires. (Measured while writing this: it did.)
  const moduleCache =
    (appCode.match(/^ {2}var\s+[\w$]+\s*=\s*[^;]*getComputedStyle/gm) || []);
  assert.strictEqual(moduleCache.length, 0,
    '(9c) no module-scope --k cache was introduced (grep -c reads 0) — ' +
    'found: ' + JSON.stringify(moduleCache));
  // and the positive control: the function-scope reads DO exist, so the
  // pattern above is not passing because nothing reads --k at all
  assert.ok(
    (appCode.match(/getComputedStyle\([^)]*\)\s*\n?\s*\.getPropertyValue\('--k'\)|getComputedStyle\(scene\)\.getPropertyValue\('--k'\)/g) ||
      appCode.match(/getPropertyValue\('--k'\)/g) || []).length >= 2,
    '(9c) --k IS read at pointerdown in both drag paths — without this ' +
    'the negative assertion above is satisfied by never reading it');
})();

// ---- 9d: the drag itself, DRIVEN — the 3px threshold and the clamp -------

(function () {
  // A fake-DOM harness that runs the REAL attachPageDrag. Asserting the
  // threshold from source would measure that a number appears in a file;
  // this measures what the drag DOES with it.
  function makeEl() {
    const handlers = {};
    return {
      props: {},
      captured: false,
      style: {
        setProperty: function (n, v) { this.__p[n] = v; },
        __p: {}
      },
      addEventListener: function (t, fn) {
        (handlers[t] = handlers[t] || []).push(fn);
      },
      removeEventListener: function (t, fn) {
        handlers[t] = (handlers[t] || []).filter(function (f) {
          return f !== fn;
        });
      },
      setPointerCapture: function () { this.captured = true; },
      releasePointerCapture: function () { this.captured = false; },
      fire: function (t, ev) {
        (handlers[t] || []).slice().forEach(function (fn) { fn(ev); });
      }
    };
  }

  function loadDrag(k, day) {
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag');
    const posted = [];
    const edits = [];
    const dismissed = [];
    const repaints = [];
    // 26.9-06: the undo push is RECORDED WITH THE RECORD'S STATE AT THE
    // MOMENT IT FIRED, not merely counted. "Push before every mutation" is
    // an ORDERING claim, and a counter cannot tell a push taken before the
    // record was touched from one taken after — the second kind snapshots
    // the state she is already looking at and undoes nothing.
    const pushes = [];
    const holder = {};
    // 26.9-05: the REAL bringDecoToFront over a real day record, so the
    // reordering assertions in 9h measure the shipped function and not a
    // stub that happens to agree with it.
    const bring = new Function('decoDay', 'NB_DAY',
      extractFn(appSrc, 'bringDecoToFront') +
      '\nreturn bringDecoToFront;')(
      function () { return day || { reset: false, items: [] }; },
      '08/04/2026');
    // eslint-disable-next-line no-new-func
    const api = new Function(
      'NBDESIGN', '$', 'getComputedStyle', 'NB_TEXT_BOX', 'NB_BOUNDS',
      'NB_DRAG_THRESHOLD', 'postDecorations', 'NB_DAY',
      'openHandTextEditor',
      // 26.9-04: the tray dismissal and the per-kind box
      'dismissTray', 'NB_STICKERS', 'NB_STICKER_H', 'NB_IMG_BOX',
      // 26.9-05: selection, reordering and the repaint at release
      'NB_SEL', 'bringDecoToFront', 'NB_REPAINT',
      // 26.9-06: the undo push
      'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn { attachPageDrag: attachPageDrag, ' +
      'clampDecoOrigin: clampDecoOrigin, ' +
      'readSelection: function () { return NB_SEL; } };')(
      true,
      function () { return {}; },
      function () {
        return { getPropertyValue: function () { return String(k); } };
      },
      { w: 72, h: 24 },
      { x0: 4, x1: 380, y0: 4, y1: 190 },
      3,
      function (d) { posted.push(d); },
      '08/04/2026',
      function () { edits.push(true); },
      function () { dismissed.push(true); },
      { 'washi-stripe': { x: 24, w: 48 } },
      24,
      { w: 48, h: 36 },
      null,
      bring,
      function () { repaints.push(true); },
      function () {
        pushes.push(holder.rec ? JSON.stringify(holder.rec) : null);
      },
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]
    );
    return { api: api, posted: posted, edits: edits,
      dismissed: dismissed, repaints: repaints, pushes: pushes,
      holder: holder };
  }

  function drag(k, dx, dy, start, kindRec) {
    const h = loadDrag(k);
    const el = makeEl();
    const rec = kindRec || { page: 'abc', kind: 'text',
      // 26.91-10 (A-12): the default origin sits INSIDE the mark canvas
      // (x >= 192). It used to be 100, which is now left of the gutter, so
      // every assertion below would have measured the clamp pulling the
      // record to 192 instead of the thing it was written to measure. The
      // threshold, the scale and the no-snap claims are unchanged; only the
      // fixture moved onto the surface those claims are about.
      x: (start && start.x) || 200, y: (start && start.y) || 100,
      text: '' };
    h.holder.rec = rec;
    h.api.attachPageDrag(el, rec);
    el.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    el.fire('pointermove', { clientX: 500 + dx, clientY: 500 + dy });
    el.fire('pointerup', {});
    return { rec: rec, posted: h.posted, edits: h.edits, el: el,
      dismissed: h.dismissed, pushes: h.pushes };
  }

  // THE THRESHOLD, BOTH DIRECTIONS. Exactly at, and exactly one past.
  const tap = drag(1, 3, 0);
  assert.strictEqual(tap.rec.x, 200,
    '(9d) a 3px movement is a TAP — the record is unchanged. The shipped ' +
    'threshold is `> 3`, so exactly 3 must not move anything');
  assert.strictEqual(tap.posted.length, 0,
    '(9d) and a tap writes NOTHING to the store');
  assert.strictEqual(tap.edits.length, 1,
    '(9d) a tap opens the editor instead — the element is how she types');

  const moved = drag(1, 4, 0);
  assert.strictEqual(moved.rec.x, 204,
    '(9d) a 4px movement IS a drag — exactly one past the threshold ' +
    'moves the record');
  assert.strictEqual(moved.posted.length, 1,
    '(9d) and it persists ONCE, at release');
  assert.deepStrictEqual(moved.posted, ['08/04/2026'],
    '(9d) scoped to the open spread\'s day');
  assert.strictEqual(moved.edits.length, 0,
    '(9d) a drag does not open the editor');

  // PERSIST ONCE, NEVER MID-DRAG — driven across many moves
  const h = loadDrag(1);
  const el = makeEl();
  const rec = { page: 'abc', kind: 'text', x: 100, y: 100, text: '' };
  h.api.attachPageDrag(el, rec);
  el.fire('pointerdown', {
    clientX: 500, clientY: 500, pointerId: 1,
    preventDefault: function () {}, stopPropagation: function () {}
  });
  for (let i = 1; i <= 20; i++) {
    el.fire('pointermove', { clientX: 500 + i, clientY: 500 });
  }
  assert.strictEqual(h.posted.length, 0,
    '(9d) twenty pointermoves write NOTHING — the write is at release, ' +
    'never mid-drag (a per-move write would hammer the disk with her ' +
    'handmade file 20 times per gesture)');
  el.fire('pointerup', {});
  assert.strictEqual(h.posted.length, 1, '(9d) exactly one write, at up');

  // --k IS APPLIED, not merely read. At k=4 the same pointer distance
  // moves the record a quarter as far.
  assert.strictEqual(drag(4, 40, 0).rec.x, 210,
    '(9d) the scale divides the pointer delta (40 CSS px at --k 4 is 10 ' +
    'scene px) — reading --k and not using it would pass a source grep');

  // THE CLAMP, at BOTH ENDS of BOTH AXES — four cases, never one corner.
  //
  // 26.91-10 REWRITTEN, NEVER DELETED (owner ruling `right-page-only`,
  // 2026-08-08, 26.91-CONTEXT.md A-12). The four-cases-never-one-corner
  // discipline is unchanged and is the reason this block exists. Only the
  // LEFT expectation moved, from the spread's bound (4) to the gutter
  // (192), because **26.9 D-05's** gutter-straddle clause is retired.
  assert.strictEqual(drag(1, -9999, 0, { x: 200, y: 100 }).rec.x, 192,
    '(9d/A-12) clamp: the left edge is THE GUTTER (192), not the spread ' +
    'bound (4). Marks live on the right page only');
  assert.strictEqual(drag(1, 9999, 0, { x: 200, y: 100 }).rec.x, 380 - 72,
    '(9d) clamp: right edge is x1-w — nothing can be pushed off-page');
  assert.strictEqual(drag(1, 0, -9999, { x: 200, y: 100 }).rec.y, 4,
    '(9d) clamp: top edge is y0=4');
  assert.strictEqual(drag(1, 0, 9999, { x: 200, y: 100 }).rec.y, 190 - 24,
    '(9d) clamp: bottom edge is y1-h — nothing can hide under the ' +
    'chrome band');

  // 26.91-10 REWRITTEN, NEVER DELETED — and this is the pin the owner's
  // ruling INVERTS rather than moves.
  //
  //   WAS: *a decoration crosses the gutter at x=192 freely* — **26.9
  //   D-05** said the spread is the canvas and D-02 made overlap free.
  //   NOW: the gutter is the WALL. A drag that starts on the right page and
  //   pulls left stops there, because the left half of every spread is the
  //   month grid she navigates with (F-1) and a sticker across the day
  //   numbers reads as broken rather than placed.
  //
  //   D-02 IS UNTOUCHED: overlap is still fully free — WITHIN the right
  //   page. So is **26.9 D-05's** other clause, *the design unit is THE
  //   DAY*. Only the straddle permission is retired. (**26.91 D-05**, the
  //   law-5 naming fallback, is a different decision and is unaffected.)
  const across = drag(1, -100, 0, { x: 250, y: 100 });
  assert.strictEqual(across.rec.x, 192,
    '(9d/A-12) A DECORATION CANNOT CROSS THE GUTTER: dragged 100 scene px ' +
    'left from x=250 it stops at 192 rather than reaching 150. This is ' +
    '**26.9 D-05\'s** straddle clause retired, driven through the real ' +
    'drag rather than read off the constant');

  // and NO SNAP OF ANY KIND: a non-multiple-of-12 landing stays put
  assert.strictEqual(drag(1, 7, 5, { x: 200, y: 100 }).rec.x % 12 === 0,
    false, '(9d) 207 is not on the 12px grid and STAYS at 207 — the ' +
    "room's coarse snap must never touch this canvas (D-03)");
  assert.strictEqual(drag(1, 7, 5, { x: 200, y: 100 }).rec.x, 207);
  assert.strictEqual(drag(1, 7, 5, { x: 200, y: 100 }).rec.y, 105);

  // the mode gate: with the mode OFF the drag is inert
  const off = (function () {
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag');
    const posted = [];
    // eslint-disable-next-line no-new-func
    const api = new Function(
      'NBDESIGN', '$', 'getComputedStyle', 'NB_TEXT_BOX', 'NB_BOUNDS',
      'NB_DRAG_THRESHOLD', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', 'NB_SEL', 'bringDecoToFront', 'NB_REPAINT',
      'NB_STICKERS', 'NB_STICKER_H', 'NB_IMG_BOX',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn { attachPageDrag: attachPageDrag, ' +
      'readSelection: function () { return NB_SEL; } };')(
      false, function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      { w: 72, h: 24 }, { x0: 4, x1: 380, y0: 4, y1: 190 }, 3,
      function (d) { posted.push(d); }, '08/04/2026', function () {},
      null, function () {}, function () {},
      { 'moon': { x: 120, w: 20 } }, 24, { w: 48, h: 36 },
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    const e2 = makeEl();
    const r2 = { page: 'a', kind: 'text', x: 100, y: 100, text: '' };
    api.attachPageDrag(e2, r2);
    e2.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    e2.fire('pointermove', { clientX: 600, clientY: 500 });
    e2.fire('pointerup', {});
    return { rec: r2, posted: posted, captured: e2.captured,
      sel: api.readSelection() };
  })();
  assert.strictEqual(off.rec.x, 100,
    '(9d) with the notebook mode OFF the drag no-ops instantly — the ' +
    'reading loop is byte-identical (the room\'s D-02 posture)');
  assert.strictEqual(off.posted.length, 0, '(9d) and writes nothing');
  assert.strictEqual(off.captured, false,
    '(9d) and never even captures the pointer');
  assert.strictEqual(off.sel, null,
    '(9d/26.9-05) and NOTHING IS SELECTED — a coral selection outline is ' +
    'design-mode chrome and must never appear in the reading loop');
})();

// ---- G-21: 26.91-20 — THE MARK-LOCK RULE, DRIVEN FOR BOTH ARMED TOOLS ----
//
// WHY EACH ASSERTION HERE IS GREEN AT HEAD — AND WHICH TWO ARE NOT.
//
// The DISARMED cases are the shipped 26.9-05 behaviour: a pointerdown on a
// mark selects it, and four pixels — one past the 3px threshold — moves it.
// The PEN cases are the shipped 26.9-07 behaviour; they are RE-asserted
// here and never relaxed. The two `write` cases are the NEW claim and they
// are RED at HEAD: A-15 ruling 1, taken by the owner on 2026-08-09 with the
// conflict against ruling 2 put to her explicitly, says `write` must lock a
// placed mark exactly as the pen does. 26.91-20 task 3 makes them green by
// widening attachPageDrag's pointerdown guard to name both armed tools.
//
// ONE GUARD, TWO SYMPTOMS — AND BOTH ARE DRIVEN, IN EVERY STATE.
// The guard returns at POINTERDOWN, and 26.9-05's `NB_SEL = rec || null;`
// sits DOWNSTREAM of that return. So extending the guard removes SELECTION
// as well as the drag — that is A-15's stated intent, not a side effect. A
// gate that drove only the drag would go GREEN on a fix that left selection
// working, and a gate that drove only selection would go green on the
// mirror-image half-fix. Every state therefore asserts BOTH, and the
// assertion names say which symptom died.
//
// THE DISARMED STATE RUNS FIRST AND IT IS A POSITIVE CONTROL. Without it
// every negative below is satisfied by a harness that cannot drive anything
// at all — the degenerate pass this file has caught repeatedly. The FOURTH
// state restores the disarmed case afterwards, so a harness that
// permanently broke selection cannot pass the two armed cases by accident.
//
// NB_PEN AND NB_WRITE ARE REAL PARAMETERS HERE, never PEN_DOWN's fixed
// declarations, because varying them is the entire point of this group —
// the same reason 9n takes the pen as a parameter rather than injecting the
// pen-down pre-state. Passing them also SHADOWS any sloppy-mode global a
// earlier harness may have leaked, which is what PEN_DOWN's own comment
// warns about.

(function () {
  // A fake element, per-group as everywhere else in this file. It is a
  // stand-in for the DOM, never for anything under test — the function
  // being measured is the real lifted attachPageDrag.
  function makeEl() {
    const handlers = {};
    return {
      captured: false,
      style: { setProperty: function (n, v) { this.__p[n] = v; }, __p: {} },
      addEventListener: function (t, fn) {
        (handlers[t] = handlers[t] || []).push(fn);
      },
      removeEventListener: function (t, fn) {
        handlers[t] = (handlers[t] || []).filter(function (f) {
          return f !== fn;
        });
      },
      setPointerCapture: function () { this.captured = true; },
      releasePointerCapture: function () { this.captured = false; },
      fire: function (t, ev) {
        (handlers[t] || []).slice().forEach(function (fn) { fn(ev); });
      }
    };
  }

  // The REAL shipped attachPageDrag, executed. Never greped.
  function loadDrag(pen, write) {
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      extractFn(appSrc, 'attachPageDrag');
    const posted = [];
    // eslint-disable-next-line no-new-func
    return new Function(
      'NBDESIGN', '$', 'getComputedStyle', 'NB_TEXT_BOX', 'NB_BOUNDS',
      'NB_DRAG_THRESHOLD', 'postDecorations', 'NB_DAY', 'openHandTextEditor',
      'dismissTray', 'NB_STICKERS', 'NB_STICKER_H', 'NB_IMG_BOX',
      'NB_SEL', 'bringDecoToFront', 'NB_REPAINT', 'pushNbUndo',
      // the two armed-tool flags, varied — this is the group's whole axis
      'NB_PEN', 'NB_PEN_GROUP', 'NB_WRITE',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn { attachPageDrag: attachPageDrag, ' +
      'readSelection: function () { return NB_SEL; } };')(
      true,
      function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      { w: 72, h: 24 },
      { x0: 4, x1: 380, y0: 4, y1: 190 },
      3,
      function (d) { posted.push(d); },
      '08/04/2026',
      function () {},
      function () {},
      { 'washi-stripe': { x: 24, w: 48 } },
      24,
      { w: 48, h: 36 },
      null,
      function () {},
      function () {},
      function () {},
      pen, null, write,
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]
    );
  }

  // ONE gesture, driven end to end: pointerdown on the mark, a move of 4px
  // (one past the shipped 3px threshold, so a disarmed drag MUST land),
  // pointerup. Returns both symptoms.
  function drive(pen, write) {
    const api = loadDrag(pen, write);
    const el = makeEl();
    const rec = { page: 'abc', kind: 'text', x: 200, y: 100, text: '' };
    api.attachPageDrag(el, rec);
    el.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    el.fire('pointermove', { clientX: 504, clientY: 500 });
    el.fire('pointerup', {});
    return { rec: rec, sel: api.readSelection(), captured: el.captured };
  }

  // 1. DISARMED — THE POSITIVE CONTROL, AND IT RUNS FIRST.
  const bare = drive(false, false);
  assert.strictEqual(bare.sel, bare.rec,
    'G-21/disarmed/selects — with NEITHER tool armed a pointerdown on a ' +
    'mark must SELECT it (26.9-05). If this fails, nothing below is a ' +
    'measurement: a harness that cannot select cannot show a guard ' +
    'preventing selection');
  assert.strictEqual(bare.rec.x, 204,
    'G-21/disarmed/drags — and a 4px move, one past the shipped 3px ' +
    'threshold, must MOVE the record. If this fails, the two armed ' +
    '"no-drag" assertions below are vacuous for a reason that has nothing ' +
    'to do with the guard');

  // 2. THE PEN — shipped 26.9-07, re-asserted and never relaxed.
  const pen = drive(true, false);
  assert.strictEqual(pen.sel, null,
    'G-21/pen/no-select — with the pen armed a pointerdown on a mark must ' +
    'NOT select it. NB_SEL is assigned eight lines BELOW the guard, so ' +
    'this is the guard\'s second symptom, not a separate rule');
  assert.strictEqual(pen.rec.x, 200,
    'G-21/pen/no-drag — and the record must not move. A stroke begun on ' +
    'top of an existing mark draws a line; it never drags the mark');

  // 3. `write` — THE NEW CLAIM. RED AT HEAD BY DESIGN.
  const write = drive(false, true);
  assert.strictEqual(write.sel, null,
    'G-21/write/no-select — with `write` armed a pointerdown on a mark ' +
    'must NOT select it, exactly as the pen does. RED until 26.91-20 ' +
    'task 3 widens attachPageDrag\'s guard (A-15 ruling 1, the owner\'s). ' +
    'Two armed tools the band presents as one idiom must not differ ' +
    'silently in what they lock');
  assert.strictEqual(write.rec.x, 200,
    'G-21/write/no-drag — and the record must not move. This is F-21\'s ' +
    'behaviour half: making the two tools LOOK identical while they BEHAVE ' +
    'differently is what half-passed the seal UAT');

  // 4. RESTORED — a harness that broke selection permanently fails HERE
  //    rather than passing states 2 and 3 for the wrong reason.
  const again = drive(false, false);
  assert.strictEqual(again.sel, again.rec,
    'G-21/restored/selects — disarming must give selection back. Without ' +
    'this, a harness that permanently destroyed selection would satisfy ' +
    'both armed states by accident and the group would be a tautology');

  // THE SOURCE-SHAPE PIN — ONE EXPRESSION, AND IT IS REGION-SCOPED.
  //
  // Scoped to bodyOf('attachPageDrag') and NEVER file-wide, deliberately.
  // A file-wide count of either flag name is enormous (both are read by the
  // canvas handler, the band painter, setNotebookPen/Write and the armed
  // body class) and a file-wide NEGATIVE would be invalidated by the very
  // prose that describes it — T-26.91-104, the self-invalidation trap, hit
  // three times in this phase already.
  //
  // Two symptoms behind one guard means the guard must stay ONE guard. A
  // second copy of the rule elsewhere in this function could drift away
  // from the first and this group would still be green.
  const dragBody = bodyOf('attachPageDrag');
  const guards = dragBody.match(/if\s*\([^)]*\)\s*\{\s*return;\s*\}/g) || [];
  const armed = guards.filter(function (g) {
    return /\bNB_PEN\b/.test(g) || /\bNB_WRITE\b/.test(g);
  });
  assert.strictEqual(armed.length, 1,
    'G-21/shape/one-guard — attachPageDrag must carry EXACTLY ONE ' +
    'early-return guard naming an armed tool, and it carries ' +
    armed.length + ': ' + JSON.stringify(armed));
  assert.ok(/\bNB_PEN\b/.test(armed[0]) && /\bNB_WRITE\b/.test(armed[0]),
    'G-21/shape/both-in-one — that one guard must test BOTH armed tools ' +
    'in ONE expression, so the rule cannot be half-changed. Found: ' +
    JSON.stringify(armed[0]));
  assert.strictEqual((dragBody.match(/\bNB_PEN\b/g) || []).length, 1,
    'G-21/shape/pen-once — NB_PEN is read exactly once inside ' +
    'attachPageDrag (comment-stripped), and that once is the guard');
  assert.strictEqual((dragBody.match(/\bNB_WRITE\b/g) || []).length, 1,
    'G-21/shape/write-once — and NB_WRITE exactly once, in the same ' +
    'expression. A second read is a second rule');
})();

// ---- G-21(b): WHAT THE RULING DID *NOT* MAKE IDENTICAL — MEASURED --------
//
// A-15 predicted that closing F-21 would make gate (9o)'s antecedent true
// "by construction". It does not, and this group is the measurement that
// says so before plan 22 words a gate around the wrong claim.
//
// The two armed tools now share a mark-LOCK rule. They still differ in what
// a tap over a mark MAKES: with the pen armed it DRAWS, because
// attachPenCapture binds on the SCENE — an ANCESTOR of every mark — in the
// CAPTURE phase, so it sees the event first and calls stopPropagation. With
// `write` armed it does NOTHING, because the placement canvas is a SIBLING
// of the mark rather than its ancestor, so nbCanvasPointerHandler is never
// on the event's path at all.
//
// THIS GROUP MEASURES THE PARENTAGE BY EXECUTING THE REAL PAINTER. What it
// does NOT do is re-derive DOM propagation: that a sibling's listener never
// sees an event dispatched on its brother is the platform's rule, not this
// harness's finding, and a fake DOM "proving" it would be proving its own
// construction. THE BOUND IS STATED RATHER THAN HIDDEN — the measurement
// here is the tree shape; the consequence follows from the platform.
//
// Recorded for her at deferred-items.md D-9, with the grip consequence.

(function () {
  const created = [];
  const doc = penDoc(created);
  // a scene that records real parentage, exactly as penDoc's own nodes do
  const scene = {
    ownerDocument: doc,
    kids: [],
    handlers: {},
    appendChild: function (n) { n.parentNode = this; this.kids.push(n); },
    addEventListener: function (t, fn, capture) {
      (this.handlers[t] = this.handlers[t] || []).push({ fn: fn, cap: !!capture });
    },
    removeEventListener: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0 }; },
    querySelector: function () { return null; }
  };
  const dayRecord = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 200, y: 100, text: 'hi' }] };

  const src = NB_HELPERS + '\n' +
    ['SVG_NS'].map(declOf).join('\n') + '\n' +
    NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
    extractFn(appSrc, 'strokeList') + '\n' +
    extractFn(appSrc, 'strokeBox') + '\n' +
    extractFn(appSrc, 'paintStrokeGroup') + '\n' +
    extractFn(appSrc, 'attachPageDrag') + '\n' +
    DECO_PAINTER_SRC + '\n' +
    extractFn(appSrc, 'paintDecoHandles');
  // eslint-disable-next-line no-new-func
  const paint = new Function(
    'DECORATIONS', 'document', 'NBDESIGN', 'NB_BOUNDS', 'NB_TEXT_BOX',
    'NB_DRAG_THRESHOLD', 'NB_REPAINT', 'postDecorations', 'NB_DAY',
    'openHandTextEditor', '$', 'getComputedStyle', 'decoDay',
    'NB_STICKERS', 'NB_STICKER_H', 'NB_SHEET_W', 'NB_IMG_BOX',
    'NB_DECO_CAP', 'NB_TIN_OPEN', 'paintStickerCrop', 'recordIncident',
    'dismissTray', 'encodeURIComponent', 'NB_SEL', 'bringDecoToFront',
    'pushNbUndo', 'NB_PEN', 'NB_WRITE',
    NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
    NB_BOUND_NAMES[3],
    src + '\nreturn paintPageDecorations;')(
    { '08/04/2026': dayRecord }, doc, true,
    { x0: 4, x1: 380, y0: 4, y1: 190 }, { w: 72, h: 24 }, 3, null,
    function () {}, '08/04/2026', function () {},
    function () { return {}; },
    function () {
      return { getPropertyValue: function () { return '1'; } };
    },
    function () { return dayRecord; },
    { 'moon': { x: 120, w: 20 } }, 24, 316, { w: 48, h: 36 }, 48, false,
    function () { return true; }, function () {}, function () {},
    global.encodeURIComponent, null, function () {}, function () {},
    false, true,                     // pen DOWN, `write` ARMED
    NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
    NB_BOUND_VALUES[3]);

  paint(scene, { itemId: 'abc123', dayLabel: '08/04/2026' }, 'right',
    {}, [], function () { return true; });

  // THE FINDER WALKS THE WHOLE TREE, NEVER scene.kids ALONE — and that is a
  // correction, not a flourish. Searching only the scene's direct children
  // made the existence guard SHADOW the parentage assertions: a mutation
  // that reparented the mark onto the canvas made the mark unfindable, so
  // the group went red on "no mark was painted" and the two assertions this
  // group exists for were never reached. Same shape as 26.9-03's M-3c/M-4b.
  // Walking the tree means the mark is found under EITHER arrangement, so
  // the parentage assertions carry their own discrimination.
  function walk(n, out) {
    (n.kids || []).forEach(function (c) { out.push(c); walk(c, out); });
    return out;
  }
  const all = walk(scene, []);
  const mark = all.filter(function (n) {
    return n.attrs && n.attrs['data-deco-idx'] !== undefined;
  })[0];
  assert.ok(mark,
    'G-21b/mark-painted — the real painter must have produced a mark ' +
    'SOMEWHERE in the tree, or every parentage claim below is about an ' +
    'empty tree');
  const canvas = all.filter(function (n) {
    return n !== mark && n.handlers && n.handlers.pointerdown;
  })[0];
  assert.ok(canvas,
    'G-21b/canvas-painted — and the placement canvas, which is the node ' +
    'that would have to see the tap for `write` to place anything');

  assert.strictEqual(mark.parentNode, scene,
    'G-21b/mark-child-of-scene — the mark is a direct child of the SCENE. ' +
    'That is why the pen reaches it: attachPenCapture binds on the scene ' +
    'in the capture phase, so it is on the event path and draws');
  assert.strictEqual(canvas.parentNode, scene,
    'G-21b/canvas-child-of-scene — and so is the placement canvas');
  assert.strictEqual(canvas.kids.indexOf(mark), -1,
    'G-21b/canvas-not-ancestor — THE CANVAS IS A SIBLING OF THE MARK, ' +
    'never its ancestor. A pointerdown dispatched on the mark therefore ' +
    'never reaches nbCanvasPointerHandler, so with `write` armed a tap ' +
    'over a mark makes NOTHING — while the same tap with the pen armed ' +
    'DRAWS. (9o) must be keyed to the mark-LOCK property this file drives, ' +
    'NOT to a blanket behavioural equality between the two tools, which ' +
    'is false. deferred-items.md D-9');
})();

// ---- 9e: the render — T3-8 and T3-9, asserted TOGETHER and BY NUMBER -----

(function () {
  // T3-8 alone ("a day with zero decorations renders the auto-composed
  // page unchanged") is passed by a render-nothing implementation. T3-9 is
  // the counter-case that makes it non-degenerate, and it is asserted BY
  // COUNT: one decoration must produce exactly one more node.
  const incidents = [];
  function paint(dayRecord, items, filters, guard) {
    const nodes = [];
    const doc = {
      createElement: function (t) {
        const n = {
          tag: t, cls: '', attrs: {}, text: '', kids: [],
          style: { setProperty: function (k, v) { this.__p[k] = v; },
            __p: {} },
          addEventListener: function () {},
          appendChild: function (c) { this.kids.push(c); },
          getBoundingClientRect: function () {
            return { left: 0, top: 0 };
          }
        };
        Object.defineProperty(n, 'className', {
          get: function () { return this.cls; },
          set: function (v) { this.cls = v; }
        });
        // textContent is THE sink under test — the harness has to model
        // it as the real property name, not a convenient alias, or the
        // assertion below would be measuring the harness.
        Object.defineProperty(n, 'textContent', {
          get: function () { return this.text; },
          set: function (v) { this.text = v; }
        });
        n.setAttribute = function (k, v) { this.attrs[k] = v; };
        return n;
      }
    };
    const scene = {
      appendChild: function (n) { nodes.push(n); },
      querySelector: function () { return null; }
    };
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag') + '\n' +
      DECO_PAINTER_SRC + '\n' +
      extractFn(appSrc, 'paintDecoHandles');
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'DECORATIONS', 'document', 'NBDESIGN', 'NB_BOUNDS', 'NB_TEXT_BOX',
      'NB_DRAG_THRESHOLD', 'NB_REPAINT', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', '$', 'getComputedStyle', 'decoDay',
      // 26.9-04: the sticker/picture kinds and the render-time fence
      'NB_STICKERS', 'NB_STICKER_H', 'NB_SHEET_W', 'NB_IMG_BOX',
      'NB_DECO_CAP', 'NB_TIN_OPEN', 'paintStickerCrop', 'recordIncident',
      'dismissTray', 'encodeURIComponent',
      // 26.9-05: selection and the release-time reorder
      'NB_SEL', 'bringDecoToFront',
      // 26.9-06: the undo push
      'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn paintPageDecorations;')(
      dayRecord ? { '08/04/2026': dayRecord } : {},
      doc, false, { x0: 4, x1: 380, y0: 4, y1: 190 }, { w: 72, h: 24 },
      3, null, function () {}, '08/04/2026', function () {},
      function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      function (d) {
        const r = (dayRecord && d === '08/04/2026')
          ? dayRecord : { reset: false, items: [] };
        if (!Array.isArray(r.items)) { r.items = []; }
        return r;
      },
      { 'moon': { x: 120, w: 20 } }, 24, 316, { w: 48, h: 36 },
      48, false,
      function (el) { el.style.__p.__crop = true; return true; },
      function (id, surface, reason) {
        incidents.push({ id: id, surface: surface, reason: reason });
      },
      function () {}, global.encodeURIComponent,
      null, function () {}, function () {},
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    fn(scene, { itemId: 'abc123', dayLabel: '08/04/2026' }, 'right',
      items, filters, guard);
    return nodes;
  }

  const empty = paint(null);
  const decoNodes = function (ns) {
    return ns.filter(function (n) {
      return String(n.cls).indexOf('page-deco-text') !== -1;
    });
  };

  // T3-8: a day with ZERO decorations adds no decoration node at all.
  assert.strictEqual(decoNodes(empty).length, 0,
    '(9e) T3-8: a day with zero decorations renders the shipped ' +
    'auto-composed page UNCHANGED — no placeholder, no dashed drop zone, ' +
    'no add-something prompt, no auto-decoration. Plain is the ' +
    'invitation (D-08)');
  // the canvas layer is still appended (it is inert while reading) — this
  // is what a "renders nothing at all" implementation would also skip
  assert.strictEqual(empty.length, 1,
    '(9e) exactly one node — the inert placement canvas, which carries ' +
    'no copy and no affordance while reading');

  // T3-9: ONE decoration renders exactly ONE decoration node. A
  // render-nothing implementation passes T3-8 and FAILS here, which is the
  // entire reason this assertion exists.
  const one = paint({ reset: false, items: [
    { page: 'abc123', kind: 'text', x: 40, y: 90, text: 'the light' }] });
  assert.strictEqual(decoNodes(one).length, 1,
    '(9e) T3-9: one decoration renders EXACTLY one decoration node. ' +
    'Asserted by NUMBER: "render nothing" passes T3-8 alone and fails ' +
    'here');
  assert.strictEqual(one.length, empty.length + 1,
    '(9e) and the total node count is the empty case PLUS EXACTLY ONE');
  assert.strictEqual(one[1].text, 'the light',
    '(9e) her line reaches the DOM through textContent');
  assert.strictEqual(one[1].tag, 'button',
    '(9e) the hand-text element is a real button — selectable, ' +
    'focusable, movable');

  // three decorations -> three nodes, with z ordering by array position
  const three = paint({ reset: false, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'a' },
    { page: 'abc123', kind: 'text', x: 20, y: 20, text: 'b' },
    { page: 'abc123', kind: 'text', x: 30, y: 30, text: 'c' }] });
  assert.strictEqual(decoNodes(three).length, 3,
    '(9e) three decorations render exactly three nodes');
  assert.deepStrictEqual(
    decoNodes(three).map(function (n) { return n.style.__p['--i']; }),
    ['0', '1', '2'],
    '(9e) draw order IS array position — the station scene has no shipped ' +
    'z rule (Research Q4), so an explicit --i is required, not optional');

  // OWNERSHIP BY itemId (D-06): another page's records never render here
  const other = paint({ reset: false, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'mine' },
    { page: 'zzz999', kind: 'text', x: 20, y: 20, text: 'someone else' }] });
  assert.strictEqual(decoNodes(other).length, 1,
    '(9e) D-06: a record is owned by the BLESSING\'s itemId, never a page ' +
    'ordinal — a sibling page\'s marks do not render here');
  assert.strictEqual(decoNodes(other)[0].text, 'mine');

  // D-15: a reset day renders the auto composition and the records SURVIVE
  const reset = paint({ reset: true, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'hidden' }] });
  assert.strictEqual(decoNodes(reset).length, 0,
    '(9e) D-15: a reset day renders the auto page and ignores the records');
  assert.strictEqual(reset.length, 0,
    '(9e) and a reset day paints no canvas either — there is nothing to ' +
    'arrange until the reset is undone');

  // the untyped element persists as a REAL element showing the prompt copy
  const untyped = paint({ reset: false, items: [
    { page: 'abc123', kind: 'text', x: 40, y: 90, text: '' }] });
  assert.strictEqual(decoNodes(untyped).length, 1,
    '(9e) UI-SPEC E5: a placed-but-untyped element is a REAL element, ' +
    'not a ghost — it can be selected, moved and undone like any other');
  assert.strictEqual(decoNodes(untyped)[0].text, 'write something',
    '(9e) and it shows the pinned prompt copy before she types');

  // ---- 26.9-04: THE FENCE FLIP TAKES EFFECT ON AN ALREADY-PLACED
  // REFERENCE. This is the whole of D-04/D-06's safety claim: a picture
  // pasted onto a page is NOT resolved once at placement and trusted after.
  // The guard is passed IN as an argument and consulted at EVERY render.
  (function () {
    const guard = StudyCore.guardSurface;
    const anyDeco = function (ns) {
      return ns.filter(function (n) {
        return String(n.cls).indexOf('page-deco ') !== -1 ||
          /page-deco$/.test(String(n.cls));
      });
    };
    // a day holding TWO marks: her line, and a picture of item `pic1`
    const day = function () {
      return { reset: false, items: [
        { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'the light' },
        { page: 'abc123', kind: 'image', x: 60, y: 60, ref: 'pic1' }] };
    };
    const clean = { pic1: { id: 'pic1', type: 'image', state: 'blessed' } };
    const before = paint(day(), clean, [], guard);
    assert.strictEqual(anyDeco(before).length, 2,
      '(9e/26.9-04) BOTH marks render while the item is clean — the ' +
      'positive control, without which every assertion below is passed ' +
      'by an implementation that renders nothing at all');
    assert.strictEqual(
      anyDeco(before).filter(function (n) {
        return String(n.cls).indexOf('page-deco-img') !== -1;
      }).length, 1,
      '(9e/26.9-04) and exactly one of them is the picture');

    // SHE FENCES IT. Same records, same day, same render call.
    const fenced = { pic1: { id: 'pic1', type: 'image',
      state: 'never_show' } };
    const after = paint(day(), fenced, [], guard);
    const imgs = anyDeco(after).filter(function (n) {
      return String(n.cls).indexOf('page-deco-img') !== -1;
    });
    assert.strictEqual(imgs.length, 0,
      '(9e/26.9-04) the picture renders ZERO nodes at the very next ' +
      'render — the fence re-resolves every time, so marking an item ' +
      'never-show removes it from a page it was already pasted onto');
    assert.strictEqual(anyDeco(after).length, 1,
      '(9e/26.9-04) WHILE THE DAY\'S OTHER DECORATIONS STILL RENDER. ' +
      'This is the half that makes the case non-degenerate: "render ' +
      'nothing" satisfies the assertion above all by itself');

    // THE DROP IS SILENT — asserted by node-count EQUALITY against a page
    // where the record is absent from the day entirely. No gap node, no
    // placeholder, no count, no explanation field.
    const absent = paint({ reset: false, items: [
      { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'the light' }] },
      fenced, [], guard);
    assert.strictEqual(after.length, absent.length,
      '(9e/26.9-04) a fenced picture leaves the page BYTE-FOR-BYTE the ' +
      'shape it would have had if she had never placed it — equal node ' +
      'counts, so there is no gap and no placeholder');

    // and the drop is RECORDED through the shipped fail-visible counterpart
    assert.ok(incidents.some(function (i) {
      return i.id === 'pic1' && i.reason === 'never_show';
    }), '(9e/26.9-04) the render-time drop records an incident — silent ' +
      'to HER, never silent to the app');
    assert.ok(incidents.every(function (i) { return i.surface; }),
      '(9e/26.9-04) every incident names its surface');

    // ALL FOUR guard branches drop an already-placed picture, not just the
    // one the fixture happened to pick.
    [['retired', { id: 'p', type: 'image', state: 'retired' }],
      ['trigger', { id: 'p', type: 'image', state: 'blessed',
        trigger: true }],
      ['missing', undefined]].forEach(function (pair) {
      const st = {};
      if (pair[1]) { st.pic1 = pair[1]; }
      const ns = paint(day(), st, [], guard);
      assert.strictEqual(
        ns.filter(function (n) {
          return String(n.cls).indexOf('page-deco-img') !== -1;
        }).length, 0,
        '(9e/26.9-04) a ' + pair[0] + ' item drops its placed picture too');
    });

    // FAIL-CLOSED on a missing guard: a picture whose fence cannot be
    // consulted does not render. The default here makes a mistake VISIBLE
    // (a page missing a photograph she can see is missing), which is the
    // rule 26.9-03 named.
    const noGuard = paint(day(), clean, [], null);
    assert.strictEqual(
      noGuard.filter(function (n) {
        return String(n.cls).indexOf('page-deco-img') !== -1;
      }).length, 0,
      '(9e/26.9-04) no guard, no picture — fail-CLOSED, because an ' +
      'unconsultable fence is not a clean one');

    // A STICKER carries no item reference at all, so the fence has nothing
    // to say about it and it survives every flip above.
    const sticker = paint({ reset: false, items: [
      { page: 'abc123', kind: 'sticker', x: 20, y: 20, sprite: 'moon' }] },
      fenced, [], guard);
    assert.strictEqual(sticker.filter(function (n) {
      return String(n.cls).indexOf('page-deco-sprite') !== -1;
    }).length, 1,
      '(9e/26.9-04) a sticker stores a ROSTER NAME, not an item — no ' +
      'fence applies and it is unaffected by any item state');
    // an OFF-ROSTER name renders nothing rather than composing a path
    const bogus = paint({ reset: false, items: [
      { page: 'abc123', kind: 'sticker', x: 20, y: 20,
        sprite: '../../items.json' }] }, fenced, [], guard);
    assert.strictEqual(bogus.filter(function (n) {
      return String(n.cls).indexOf('page-deco-sprite') !== -1;
    }).length, 0,
      '(9e/26.9-04) T-26.9-20: an off-roster sprite name finds no cell ' +
      'and renders NOTHING — it is never sanitised, because sanitising ' +
      'invites the question of whether the sanitiser is complete');
  }());

  // it is NOT .station-fixture — overlapping decorations would otherwise
  // stack accent rings while editing
  decoNodes(three).forEach(function (n) {
    assert.strictEqual(String(n.cls).indexOf('station-fixture'), -1,
      '(9e) .page-deco must NEVER carry .station-fixture — that class ' +
      'has a hover/focus accent ring (tokens.css:1726-1727) and D-02\'s ' +
      'free overlap would stack rings all over the page');
  });
})();

// ---- 9f: the store round trip, the caps, and the copy --------------------

(function () {
  // the client half exists (the positive subject test_display_fence's
  // group 4b deliberately does not pin, because it did not exist yet
  // when that group shipped one task earlier in this same plan)
  ['loadDecorations', 'postDecorations', 'setNotebookDesign',
    'attachPageDrag', 'paintPageDecorations', 'clampDecoOrigin',
    'stationIsRaised', 'openHandTextEditor'].forEach(function (n) {
    assert.ok(appSrc.indexOf('function ' + n + '(') !== -1,
      '(9f) ' + n + ' must be defined in app.js');
  });

  const post = bodyOf('postDecorations');
  assert.ok(post.indexOf("'/api/decorations'") !== -1,
    '(9f) postDecorations writes to /api/decorations');
  assert.ok(post.indexOf('version: 1') !== -1,
    '(9f) and sends the version the validator demands');
  // LOCAL STATE IS KEPT ON A FAILED WRITE, NEVER REVERTED
  assert.strictEqual(post.indexOf('splice'), -1);
  assert.strictEqual(post.indexOf('DECORATIONS = '), -1,
    '(9f) a failed write must NEVER revert local state — a silent loss ' +
    'of handmade work is the outcome this error path exists to prevent');
  // 26.91-27 (F-23 b): REWRITTEN TO THE NEW LITERAL IN THE SAME COMMIT,
  // never relaxed to a bare substring search — the wave-20 (9n) posture.
  // This pinned the spelling `NB_SAVE_FAILED` inside postDecorations. The
  // flag is still raised and the CLAIM is still true, but it is now raised
  // through ONE function rather than at two inline sites that agreed, so
  // the old pin was keyed to a spelling rather than to the claim. The
  // rewrite is STRICTER than what it replaces: it asserts the single path
  // AND that BOTH branches reach it, which the old form never checked.
  const raises = (post.match(/nbSaveFailed\(/g) || []).length;
  assert.strictEqual(raises, 2,
    '(9f) and the failure is recorded fail-VISIBLY rather than swallowed — ' +
    'through EXACTLY ONE function, reached on BOTH branches. Found ' +
    raises + ' call(s) to nbSaveFailed(. Two sites that agree today is the ' +
    'shape this file refuses elsewhere');
  assert.strictEqual(post.indexOf('NB_SAVE_FAILED'), -1,
    '(9f) and postDecorations no longer touches the flag directly at all — ' +
    'an inline assignment surviving beside the setter is exactly the two ' +
    'agreeing sites the single path exists to prevent');
  assert.ok(/\.then\([\s\S]*nbSaveFailed\([\s\S]*\.catch\([\s\S]*nbSaveFailed\(/
    .test(post),
    '(9f) and the two branches are the PROMISE branch and the CATCH ' +
    'branch, in that order — a refusal the server answered, and a ' +
    'transport that never answered at all');

  const load = bodyOf('loadDecorations');
  assert.ok(load.indexOf('catch') !== -1,
    '(9f) loadDecorations is FAIL-OPEN: an unreachable store is an ' +
    'undecorated book, never an error surface');

  // the stored string cap, at exactly 80 and 81
  const editor = bodyOf('openHandTextEditor');
  assert.ok(editor.indexOf('maxLength = NB_TEXT_CAP') !== -1,
    '(9f) the input carries a maxlength — the house\'s end-to-end cap ' +
    'discipline (the blessing why\'s 280 works the same way)');
  assert.ok(/slice\(0,\s*NB_TEXT_CAP\)/.test(editor),
    '(9f) and the stored string is sliced to the cap on commit too — ' +
    'a maxlength alone is a client courtesy, not a guarantee');
  const cap = /var NB_TEXT_CAP = (\d+);/.exec(appSrc);
  assert.ok(cap, '(9f) NB_TEXT_CAP is declared');
  assert.strictEqual(cap[1], '80',
    '(9f) the cap is exactly 80 characters');
  // driven, at and one past
  const capFn = new Function('NB_TEXT_CAP',
    'return function (s) { return String(s).slice(0, NB_TEXT_CAP); };')(80);
  assert.strictEqual(capFn('x'.repeat(80)).length, 80,
    '(9f) exactly 80 characters survives whole');
  assert.strictEqual(capFn('x'.repeat(81)).length, 80,
    '(9f) 81 is cut to 80 — asserted at the boundary, not with an ' +
    'inequality');
  assert.strictEqual(capFn('光'.repeat(81)).length, 80,
    '(9f) and the cap counts CHARACTERS, so 81 CJK code points cut to 80');

  // THERE IS NO HTML SINK ON THIS ELEMENT AT ALL
  const region = ['paintPageDecorations', 'openHandTextEditor',
    'attachPageDrag', 'paintDecoHandles', 'previewDecoTransform',
    'wrapDecoAngle', 'clampDecoScale'].map(bodyOf).join('\n');
  ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'contentEditable',
    'contenteditable', 'document.write'].forEach(function (sink) {
    assert.strictEqual(region.indexOf(sink), -1,
      '(9f) T-26.9-12: the hand-text element has NO HTML sink at all ' +
      '("' + sink + '" found). Her text reaches the DOM through ' +
      'textContent only');
  });
  assert.ok(region.indexOf('textContent') !== -1,
    '(9f) and textContent IS the sink — the positive half, without which ' +
    'the bans above are satisfied by rendering nothing');

  // the day cap, silently refusing the 49th.
  //
  // 26.9-04 REPLACED the literal-48 grep this assertion used to make. That
  // form was correct while ONE placement path existed; the tray added a
  // second, and two hand-typed copies of a cap is precisely the drift this
  // phase keeps finding. The cap is one constant now, pinned BY VALUE here
  // and referenced by BOTH paths — and then DRIVEN at 48 and 49 below,
  // because a source grep cannot tell a cap that refuses from a cap that is
  // read and ignored.
  const capDecl = /var NB_DECO_CAP = (\d+);/.exec(appSrc);
  assert.ok(capDecl, '(9f) NB_DECO_CAP is declared exactly once');
  assert.strictEqual(capDecl[1], '48',
    '(9f) the per-day cap is 48, mirroring server.py DECOR_CAP — sized ' +
    'down from the room\'s ADDED_CAP of 64 because a spread physically ' +
    'holds fewer marks than a room holds objects');
  // 26.91-02: THE TEXT PATH'S CAP CHECK MOVED, AND THIS GUARD FOLLOWED IT
  // RATHER THAN BEING RELAXED TO ADMIT THE MOVE.
  //
  // paintPageDecorations used to inline the whole text-creation tail, so it
  // was the right place to look. It now delegates to nbPlaceTextRecord,
  // which is the SINGLE tail shared by the armed-write pointerdown and the
  // shipped dblclick — so scanning it covers BOTH text paths at once where
  // the old form covered one. The guard is scoped tighter and reaches
  // further; it was not widened, weakened, or turned into an inequality.
  const paint = bodyOf('paintPageDecorations');
  const tail = bodyOf('nbPlaceTextRecord');
  const tray = bodyOf('placeFromTray');
  [['nbPlaceTextRecord', tail], ['placeFromTray', tray]].forEach(
    function (pair) {
      assert.ok(/items\.length >= NB_DECO_CAP/.test(pair[1]),
        '(9f) BOTH placement paths refuse at the shared constant — ' +
        pair[0] + ' does not');
      assert.strictEqual(/\b48\b/.test(pair[1]), false,
        '(9f) and neither may re-type the number: a second copy of a cap ' +
        'is a cap that drifts (' + pair[0] + ')');
    });
  // AND THE PAINTER MUST NOT HAVE KEPT A COPY. Without this, the delegation
  // above is satisfied while paintPageDecorations still holds the old
  // inlined tail beside it — two creation paths, one of which nobody is
  // looking at any more.
  assert.strictEqual(/items\.length >= NB_DECO_CAP/.test(paint), false,
    '(9f) and paintPageDecorations no longer carries its own cap check: ' +
    'it delegates to the shared tail, so a copy left behind here would be ' +
    'a second creation path drifting quietly out of sight');
  assert.strictEqual(/\b48\b/.test(paint), false,
    '(9f) nor a re-typed 48');

  // DRIVEN, at and one past — not with an inequality, and not by grep.
  (function () {
    function placeN(n) {
      const day = { reset: false, items: [] };
      for (let i = 0; i < n; i++) {
        day.items.push({ page: 'abc123', kind: 'text', x: 10, y: 10,
          text: '' });
      }
      const posted = [];
      // 26.9-06: the push is recorded WITH the day's mark count at the
      // moment it fired, so "before the mutation" is an ordering claim the
      // fixture can actually decide.
      const pushes = [];
      // 26.9 F-9: placeFromTray now routes its reset-flag clear through the
      // shared nbClearResetForEdit helper (so the pen and the tray cannot
      // drift apart again), so the lift has to carry it too.
      const src = NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
        extractFn(appSrc, 'nbClearResetForEdit') + '\n' +
        extractFn(appSrc, 'placeFromTray');
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'NB_PLACE', 'NB_DAY', 'decoDay', 'NB_DECO_CAP', 'NB_STICKERS',
        'NB_STICKER_H', 'NB_IMG_BOX', 'NB_BOUNDS', 'clampDecoOrigin',
        'postDecorations', 'NB_REPAINT', 'pushNbUndo',
        src + '\nreturn placeFromTray;')(
        { itemId: 'abc123', x0: 0 }, '08/04/2026',
        function () { return day; }, 48,
        { 'moon': { x: 120, w: 20 } }, 24, { w: 48, h: 36 },
        { x0: 4, x1: 380, y0: 4, y1: 190 },
        undefined, function (d) { posted.push(d); }, null,
        function () { pushes.push(day.items.length); });
      fn({ kind: 'sticker', sprite: 'moon' });
      return { day: day, posted: posted, pushes: pushes };
    }
    const at47 = placeN(47);
    assert.strictEqual(at47.day.items.length, 48,
      '(9f) the 48th mark IS placed — the cap is a ceiling, not a fence ' +
      'one short of it. Without this half, "refuse everything" passes');
    assert.strictEqual(at47.posted.length, 1,
      '(9f) and it is persisted');
    const at48 = placeN(48);
    assert.strictEqual(at48.day.items.length, 48,
      '(9f) the 49th is refused — the day stays at 48');
    assert.strictEqual(at48.posted.length, 0,
      '(9f) SILENTLY: no write, and no error row exists to render — the ' +
      'tray stays open and the tap simply does not place');
    // 26.9-06: the push is BEFORE the placement and AFTER the cap check
    assert.deepStrictEqual(at47.pushes, [47],
      '(9f) the placement pushes undo exactly once, and the day still held ' +
      '47 marks when it fired — a push taken AFTER the push to items would ' +
      'read 48 and would snapshot the page she is already looking at');
    assert.deepStrictEqual(at48.pushes, [],
      '(9f) and a REFUSED placement pushes nothing: a refusal is not an ' +
      'act, and an undo that handed back a page she never changed would be ' +
      'a keystroke that appears to do nothing');
  }());

  // ---- 26.91-02: THE TEXT PATH'S CAP, NOW DRIVEN TOO ------------------
  //
  // The text tail's cap was only ever GREP-ASSERTED, because the tail was
  // buried inside a painter and could not be lifted. Factoring it into
  // nbPlaceTextRecord made it drivable, so it is driven — at 47 and at 48,
  // the same both-sides shape the tray path gets. A source grep cannot
  // tell a cap that refuses from a cap that is read and ignored.
  (function () {
    function placeText(n) {
      const day = { reset: false, items: [] };
      for (let i = 0; i < n; i++) {
        day.items.push({ page: 'abc123', kind: 'text', x: 10, y: 10,
          text: '' });
      }
      const posted = [];
      const pushes = [];
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'decoDay', 'NB_DECO_CAP', 'postDecorations', 'NB_REPAINT',
        'pushNbUndo', 'openHandTextEditor',
        extractFn(appSrc, 'nbPlaceTextRecord') +
        '\nreturn nbPlaceTextRecord;')(
        function () { return day; }, 48,
        function (d) { posted.push(d); }, null,
        function () { pushes.push(day.items.length); },
        function () {});
      const out = fn({ querySelector: function () { return null; } },
        { itemId: 'abc123' }, '08/04/2026', { x: 10, y: 10 });
      return { day: day, posted: posted, pushes: pushes, out: out };
    }
    const t47 = placeText(47);
    assert.strictEqual(t47.day.items.length, 48,
      '(9f) the 48th TEXT mark IS placed — a ceiling, not a fence one short');
    assert.strictEqual(t47.posted.length, 1, '(9f) and it is persisted');
    assert.deepStrictEqual(t47.pushes, [47],
      '(9f) with undo pushed BEFORE the mutation');
    const t48 = placeText(48);
    assert.strictEqual(t48.day.items.length, 48,
      '(9f) the 49th TEXT mark is refused — the day stays at 48');
    assert.strictEqual(t48.posted.length, 0,
      '(9f) SILENTLY: no write, no error. The page keeps working and says ' +
      'nothing (UI-SPEC A7)');
    assert.strictEqual(t48.out, null,
      '(9f) and the tail REPORTS the refusal to its caller rather than ' +
      'returning a record that was never stored');
    assert.deepStrictEqual(t48.pushes, [],
      '(9f) a refused placement pushes no undo');
  }());

  // NO TIMERS. Law 1: every surface is reached by a pointer act.
  ['setInterval(', 'setTimeout(', 'requestAnimationFrame('].forEach(
    function (t) {
      assert.strictEqual(region.indexOf(t), -1,
        '(9f) LAW 1: the editor introduces no timer of any kind ("' + t +
        '") — nothing in this room ever surfaces itself');
    });
})();

// ---- 9g: the entry row, the mode's three changes, and the CSS ------------

(function () {
  const spread = bodyOf('paintNotebookSpread');
  assert.ok(spread.indexOf("'arrange this day'") !== -1,
    '(9g) the entry row carries the pinned copy `arrange this day`');
  assert.ok(spread.indexOf("'done arranging'") !== -1,
    '(9g) and flips to `done arranging` in the mode');
  assert.ok(spread.indexOf('station-caption-add') !== -1,
    '(9g) in the SHIPPED quiet lowercase underlined register — the ' +
    'second implementation of a quiet row would be the bug');
  // 26.91-07 REWRITTEN, NEVER DELETED. This line pinned the row's guard as
  // a BARE `if (!DESIGN)`. Open Decision #2's owner ruling
  // (`read-only-import-day`, 2026-08-07 — 26.91-CONTEXT.md A-9) makes the
  // row conditional on THE SPREAD holding a decoratable page as well, so
  // the bare form is now the FAILING state rather than the passing one. The
  // pin MOVES with the behaviour rather than being deleted — the rule 26.9
  // set after two tests pinned behaviour she then changed.
  assert.ok(/if\s*\(\s*!DESIGN\s*&&\s*decoratable\s*\)/.test(spread),
    '(9g) D-14 + OPEN DECISION #2: the row renders only when room design ' +
    'mode is OFF **and** this spread holds a decoratable page. The bare ' +
    '`if (!DESIGN)` this line used to pin painted `arrange this day` on an ' +
    'import-only spread, where NB_PLACE is null and the tin is inert — a ' +
    'control that appears and does nothing, which is the F-6 shape in the ' +
    'phase built to fix F-6. The DRIVEN half of this claim lives in (91c); ' +
    'this SOURCE line pins the shape');
  assert.ok(
    /decoratable = false;[\s\S]{0,240}spread\.pages\[pi\]\.trace/.test(spread),
    '(9g) ...and `decoratable` is derived from THE SPREAD\'S PAGES — is ' +
    'any page not a trace page — never from a day-level flag');
  assert.strictEqual(/\.lit\b/.test(spread), false,
    '(9g) ...and paintNotebookSpread reads NO `lit` field at all. Wave 6 ' +
    'demoted `lit` to an attribute of an ENTRY on purpose; a `spread.lit` ' +
    'spelling would satisfy the two lines above while re-coupling the two ' +
    'concepts this phase separated');

  const slot = /var NB_ENTRY_ROW = \{ x: (\d+), y: (\d+), w: (\d+), h: (\d+) \}/
    .exec(appSrc);
  assert.ok(slot, '(9g) the entry row slot is declared once');
  assert.deepStrictEqual(slot.slice(1, 5), ['140', '196', '104', '16'],
    '(9g) at the UI-SPEC slot {x:140, y:196, w:104, h:16} — y:196 is the ' +
    "shipped .station-flip band line, so the row reads as a footer");

  // the CSS contract, comment-stripped so prose cannot answer it
  const raw = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.page-deco\s*\{[^}]*z-index:\s*calc\(3 \+ var\(--i\)\)/
    .test(css),
    '(9g) .page-deco takes an EXPLICIT z-index from its array position — ' +
    'Research Q4 measured that the station scene has no shipped z rule, ' +
    'so a decoration under the why text is otherwise unrepresentable');
  assert.ok(/body\.nb-design/.test(css),
    '(9g) the mode has its own body class');
  assert.strictEqual(/body\.nb-design[^{]*#catalog-panel/.test(css), false,
    '(9g) and it never touches the room\'s accessory dock');
  assert.ok(/body\.nb-design\s+\.station-fixture\[data-id\]/.test(css),
    '(9g) reading affordances are off while arranging, scoped to the ' +
    'CONTENT-opening fixtures — the page-flip arrows carry no data-id ' +
    'and stay live, because navigating between days is not reading');

  // NO MOTION anywhere in the new block
  //
  // ⛔⛔ NARROWED 2026-08-24 (26.98-06). THIS SLICE USED TO RUN TO THE END OF
  // THE FILE: `css.slice(css.indexOf('.page-deco-canvas'))` takes everything
  // after the editor's FIRST rule and never stops, so every rule any later
  // plan appends to tokens.css — in any phase, about any surface — landed
  // inside what this assertion calls "the editor CSS" and was judged by a rule
  // written about the notebook's design mode. Handoff §M7's feeling-mark block
  // is what surfaced it: a 200ms settle on a reaction button, five thousand
  // lines away from this editor, failed a gate about the notebook.
  //
  // ⛔ THE RULE ITSELF IS UNCHANGED AND STILL BITES. The editor CSS still may
  // carry no transition and no animation — the mode open/close is a state
  // change, not motion. What changed is only WHERE "the editor CSS" ends, and
  // it now ends where the editor's own last rule ends, which is what the
  // sentence always meant.
  //
  // ⛔ AND THE LIFT IS CHECKED BEFORE IT IS TRUSTED. A boundary search that
  // came up short would shrink the slice toward nothing and print a clean
  // pass — the vacuous instrument this file catches everywhere else. The
  // slice is asserted to still contain the four landmarks that bracket the
  // editor, so a narrowed lift fails LOUDLY instead of quietly measuring less.
  const block = editorCssBlock(css, '(9g)');
  assert.strictEqual(/transition\s*:/.test(block), false,
    '(9g) no transition property anywhere in the editor CSS — the mode ' +
    'open/close is a state change, not motion');
  assert.strictEqual(/animation\s*:/.test(block), false,
    '(9g) and no animation either');

  // no hover ring on .page-deco (the whole reason it is not
  // .station-fixture)
  assert.strictEqual(/\.page-deco:hover/.test(css), false,
    '(9g) .page-deco has NO hover ring — overlapping decorations wearing ' +
    'one would stack accent outlines while editing');
  assert.ok(/\.page-deco:focus-visible/.test(css),
    '(9g) but it DOES have an explicit focus-visible outline, because ' +
    'tokens.css deliberately has no global focus rule');
})();

// ===========================================================================
// ---- 9h: 26.9-05 — THE Z RULE, SELECTION, AND THE REORDERING GESTURE ------
//
// D-02 removed this phase's most obvious machine-checkable invariant: with
// fully free overlap there is NO "the page is still readable" rule, and none
// is invented here. What CAN be checked is checked hard, because the gates
// that remain carry more weight, not less:
//
//   - the four z layers BY VALUE and in STRICT ORDER, so "give everything
//     the same z" fails even though a z-index would exist everywhere;
//   - two coincident decorations render as EXACTLY 2 nodes, so "render
//     nothing" fails a count rather than sliding past an "at least one";
//   - the reorder asserted by INDEX BEFORE AND AFTER, not by "the array
//     changed";
//   - the accent as an EQUALITY of 2, because a floor here would let the
//     tin, a tab or a card take the reserved colour silently — and paired
//     with positive assertions that the displaced rings still EXIST, since
//     deleting them would satisfy the equality just as well.
// ===========================================================================

(function () {
  const rawCss = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

  // ---- (1) THE FOUR Z LAYERS, BY VALUE AND IN STRICT ORDER ---------------
  function zOf(sel) {
    // the LAST rule wins for this property, so scan them all and take the
    // final one — a check that read only the first would report the
    // shipped (absent) value and pass for the wrong reason
    const re = new RegExp(
      '(^|[,}])\\s*' + sel.replace(/[.[\]]/g, '\\$&') +
      '\\s*(,[^{]*)?\\{([^}]*)\\}', 'g');
    let m, z = null;
    while ((m = re.exec(css)) !== null) {
      const d = /z-index:\s*([^;}]+)/.exec(m[3]);
      if (d) { z = d[1].trim(); }
    }
    return z;
  }
  const layers = {
    background: zOf('.station-bg'),
    photo: zOf('.station-photo'),
    caption: zOf('.station-caption'),
    tocLine: zOf('.station-toc-line'),
    deco: zOf('.page-deco')
  };
  assert.deepStrictEqual(layers, {
    background: '0', photo: '1', caption: '2', tocLine: '2',
    deco: 'calc(3 + var(--i))'
  }, '(9h) the four z layers are pinned BY VALUE: background 0, photo 1, ' +
     'captions and contents rows 2, decorations 3 + array position. ' +
     'Before this wave the station scene had NO z rule at all (Research ' +
     'Q4) — .station-bg, .station-photo and .station-caption were plain ' +
     '`position: absolute`, so paint order was DOM append order and a ' +
     'decoration dropped UNDER the why text was unrepresentable rather ' +
     'than merely unstyled. Found: ' + JSON.stringify(layers));

  // AND IN STRICT ORDER. The pin above would still pass if someone
  // "simplified" all four to the same number by editing this test's
  // expectation; this assertion is about the RELATION and fails for a
  // reason the equality cannot express.
  const order = [Number(layers.background), Number(layers.photo),
    Number(layers.caption), 3];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1],
      '(9h) layer ' + i + ' must sit STRICTLY above layer ' + (i - 1) +
      ' (' + order.join(' < ') + '). A single shared z value would give ' +
      'every element a z-index and still leave the stack ambiguous — ' +
      'which is exactly the degenerate implementation this assertion, and ' +
      'not the by-value pin above, is here to fail');
  }
  // the decoration layer's FLOOR is the caption layer + 1, driven rather
  // than read: at array position 0 a decoration must already be above the
  // why text, because "she placed it last" is not a precondition for
  // "it is hers".
  assert.strictEqual(3 + 0, Number(layers.caption) + 1,
    '(9h) the FIRST decoration in the array already outranks the why — ' +
    'calc(3 + var(--i)) at i=0 is 3, one above the caption layer');

  // ---- (2) THE ACCENT, AS AN EQUALITY ------------------------------------
  //
  // Scoped to THIS PHASE'S CSS SURFACE — sliced from the RAW file by its
  // own block markers (which live inside comments, so the slice must
  // happen BEFORE the strip) and only then comment-stripped, so prose
  // cannot answer a question about code.
  // A TRAP THIS ASSERTION FELL INTO AND IS RECORDED RATHER THAN QUIETLY
  // ROUTED AROUND: the markers live INSIDE comments, so slicing AT the
  // marker starts the region mid-comment — the opening `/*` is left behind,
  // the strip below cannot match the header comment, and its prose ("a
  // stack of decorations wearing `var(--accent)`…") survives into the
  // count. Measured while writing this: the naive slice read 3 accent hits
  // where the code holds 2, and the extra one was a sentence. The slice
  // therefore backs up to the `/*` that OPENS the header and runs past the
  // `*/` that CLOSES the footer, so every comment inside the region is
  // whole and strippable. Third time on this project that a comment has
  // answered a question about code.
  const startMark = "26.9-03 THE NOTEBOOK'S DESIGN MODE (SRM-14-EXT-EDITOR)";
  const endMark = "26.9-03 THE NOTEBOOK'S DESIGN MODE (end)";
  const m0 = rawCss.indexOf(startMark);
  const m1 = rawCss.indexOf(endMark);
  assert.ok(m0 !== -1 && m1 > m0,
    '(9h) the phase CSS block markers are present and in order');
  const s0 = rawCss.lastIndexOf('/*', m0);
  const s1 = rawCss.indexOf('*/', m1) + 2;
  assert.ok(s0 !== -1 && s1 > s0,
    '(9h) and both marker comments are whole');
  const regionRaw = rawCss.slice(s0, s1);
  const region = regionRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  // the strip is LOAD-BEARING, proven rather than assumed
  assert.ok((regionRaw.match(/var\(--accent\)/g) || []).length >
    (region.match(/var\(--accent\)/g) || []).length,
    '(9h) the comment strip is load-bearing: the raw region mentions the ' +
    'accent more often than the code does. A count that let prose answer ' +
    'it would drift every time somebody edited a comment');
  // the positive control FIRST: a negative/equality assertion over an
  // empty region proves nothing at all
  assert.ok(region.length > 1200,
    '(9h) the phase CSS region is substantial (' + region.length +
    ' chars of code after the comment strip)');
  assert.ok(region.indexOf('.page-deco') !== -1 &&
    region.indexOf('.station-tin') !== -1,
    '(9h) and it is the RIGHT region — it holds both the decorations and ' +
    'the tin');

  const accentHits = (region.match(/var\(--accent\)/g) || []).length;
  assert.strictEqual(accentHits, 2,
    '(9h) EXACTLY TWO rules in this phase\'s CSS surface reference the ' +
    'accent, and this is an EQUALITY rather than a ceiling on purpose: a ' +
    'floor here would let the tin, a tray tab or a sticker card take the ' +
    'reserved colour silently, and "nothing fires" would read as a pass. ' +
    'The two are `.page-deco.is-selected` and the `.page-deco:' +
    'focus-visible` ring that deliberately matches it — one member of the ' +
    'UI-SPEC\'s closed list, told the same way to a pointer user and a ' +
    'keyboard user. Counted ' + accentHits);
  assert.ok(/\.page-deco\.is-selected\s*\{[^}]*outline:\s*1px solid var\(--accent\)/
    .test(region),
    '(9h) `.page-deco.is-selected` takes a 1px coral outline — selection ' +
    'STATE, never an action');
  assert.ok(/\.page-deco:focus-visible\s*\{[^}]*var\(--accent\)/.test(region),
    '(9h) and the focus ring matches it');

  // THE DISPLACED RINGS STILL EXIST. Without this half, deleting every
  // focus ring on the tin and the tray satisfies the equality above just
  // as well as moving them off the accent does — and that would be an
  // accessibility regression dressed up as a colour discipline win.
  [['.station-tin:focus-visible', 'the tin'],
    ['.tray-card:focus-visible', 'a sticker card'],
    ['.tray-picture:focus-visible', 'a picture thumbnail'],
    ['.tray-tab:focus-visible', 'a tray tab']].forEach(function (pair) {
    assert.ok(region.indexOf(pair[0]) !== -1,
      '(9h) ' + pair[1] + ' KEEPS its focus ring — this stylesheet has no ' +
      'global :focus-visible rule, so removing it leaves the control with ' +
      'nothing at all');
  });
  assert.ok(/\.tray-tab:focus-visible\s*\{\s*outline:\s*1px solid var\(--ink\)/
    .test(region),
    '(9h) and the displaced rings are `--ink` — the precedent the ' +
    '26.88-04 block set for exactly this situation ("the accent is ' +
    'reserved chrome and never touches this control")');

  // ---- (3) .page-deco IS NOT .station-fixture AND HAS NO HOVER RULE -----
  assert.strictEqual(/\.page-deco[^,{]*:hover/.test(css), false,
    '(9h) no hover rule on .page-deco or any of its variants anywhere in ' +
    'the stylesheet — with D-02\'s free overlap a hover ring would stack ' +
    'outlines all over the page as the pointer crossed a pile of marks');
  const painter = bodyOf('paintPageDecorations');
  assert.strictEqual(/'page-deco[^']*station-fixture|station-fixture[^']*page-deco/
    .test(painter), false,
    '(9h) and the painter never puts .station-fixture on a decoration');
})();

// ---- 9h(b): the render — coincidence, selection, and the aria posture ----

(function () {
  const posted = [];
  const nodesFor = function (dayRecord, sel) {
    const nodes = [];
    const doc = {
      createElement: function (t) {
        const n = {
          tag: t, cls: '', attrs: {}, text: '', kids: [], __on: {},
          style: { setProperty: function (k, v) { this.__p[k] = v; },
            __p: {} },
          // REAL event plumbing, not a no-op. A stubbed addEventListener
          // lets "paint a handle and wire nothing to it" pass every
          // structural assertion in this group — which it did, until a
          // mutation said so (M-T9).
          addEventListener: function (t2, fn) {
            (this.__on[t2] = this.__on[t2] || []).push(fn);
          },
          removeEventListener: function (t2, fn) {
            this.__on[t2] = (this.__on[t2] || []).filter(function (f) {
              return f !== fn;
            });
          },
          setPointerCapture: function () {},
          releasePointerCapture: function () {},
          fire: function (t2, ev) {
            (this.__on[t2] || []).slice().forEach(function (f) { f(ev); });
          },
          appendChild: function (c) { this.kids.push(c); },
          getBoundingClientRect: function () {
            return { left: 0, top: 0 };
          }
        };
        Object.defineProperty(n, 'className', {
          get: function () { return this.cls; },
          set: function (v) { this.cls = v; }
        });
        Object.defineProperty(n, 'textContent', {
          get: function () { return this.text; },
          set: function (v) { this.text = v; }
        });
        n.setAttribute = function (k, v) { this.attrs[k] = v; };
        return n;
      }
    };
    const scene = {
      appendChild: function (n) { nodes.push(n); },
      querySelector: function () { return null; },
      getBoundingClientRect: function () { return { left: 0, top: 0 }; }
    };
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag') + '\n' +
      DECO_PAINTER_SRC + '\n' +
      extractFn(appSrc, 'paintDecoHandles');
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'DECORATIONS', 'document', 'NBDESIGN', 'NB_BOUNDS', 'NB_TEXT_BOX',
      'NB_DRAG_THRESHOLD', 'NB_REPAINT', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', '$', 'getComputedStyle', 'decoDay',
      'NB_STICKERS', 'NB_STICKER_H', 'NB_SHEET_W', 'NB_IMG_BOX',
      'NB_DECO_CAP', 'NB_TIN_OPEN', 'paintStickerCrop', 'recordIncident',
      'dismissTray', 'encodeURIComponent', 'NB_SEL', 'bringDecoToFront',
      'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn paintPageDecorations;')(
      { '08/04/2026': dayRecord },
      // NBDESIGN is TRUE here: a painted handle whose drag no-ops because
      // the mode is off would look identical to a handle that is wired.
      doc, true, { x0: 4, x1: 380, y0: 4, y1: 190 }, { w: 72, h: 24 },
      3, null, function (d) { posted.push(d); }, '08/04/2026',
      function () {},
      function () { return scene; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      function () { return dayRecord; },
      { 'moon': { x: 120, w: 20 } }, 24, 316, { w: 48, h: 36 },
      48, false,
      function (el) { el.style.__p.__crop = true; return true; },
      function () {}, function () {}, global.encodeURIComponent,
      sel || null, function () {}, function () {},
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    fn(scene, { itemId: 'abc123', dayLabel: '08/04/2026' }, 'right',
      { pic1: { id: 'pic1', type: 'image', state: 'blessed' } }, [],
      StudyCore.guardSurface);
    const deco = nodes.filter(function (n) {
      return /(^|\s)page-deco(\s|$)/.test(String(n.cls));
    });
    deco.all = nodes;
    return deco;
  };

  // ---- TWO DECORATIONS AT EXACTLY THE SAME COORDINATES -------------------
  // EDGE SRM-14-EXT-EDITOR/adjacency: they do not merge and do not collide.
  const coincident = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 100, y: 100, text: 'under' },
    { page: 'abc123', kind: 'text', x: 100, y: 100, text: 'over' }] };
  const both = nodesFor(coincident);
  assert.strictEqual(both.length, 2,
    '(9h) two decorations at IDENTICAL stored coordinates render as ' +
    'EXACTLY 2 nodes — asserted by number, because "at least 1" is passed ' +
    'by a merge and by a render-nothing implementation alike');
  assert.deepStrictEqual(both.map(function (n) { return n.text; }),
    ['under', 'over'],
    '(9h) and they stack by ARRAY POSITION — output order is the array, ' +
    'and it is stable across renders because nothing else is consulted');
  assert.deepStrictEqual(
    both.map(function (n) { return n.style.__p['--i']; }), ['0', '1'],
    '(9h) the later array entry takes the higher --i, so the z rule puts ' +
    'it on top. Nothing about their coordinates enters this decision');
  assert.notStrictEqual(both[0].style.__p['--i'], both[1].style.__p['--i'],
    '(9h) and the two --i values DIFFER — a shared value would leave the ' +
    'pair ambiguous again, which is the state before this wave');

  // ---- SELECTION: EXACTLY ONE -------------------------------------------
  const none = nodesFor(coincident, null);
  assert.strictEqual(none.filter(function (n) {
    return / is-selected/.test(String(n.cls));
  }).length, 0,
    '(9h) with nothing selected, no node wears the selected class');
  const one = nodesFor(coincident, coincident.items[1]);
  const sel = one.filter(function (n) {
    return / is-selected/.test(String(n.cls));
  });
  assert.strictEqual(sel.length, 1,
    '(9h) a selection selects EXACTLY ONE, never a set');
  assert.strictEqual(sel[0].text, 'over',
    '(9h) and it is the one selected — the RECORD is the selection key, ' +
    'never an index, because the reordering gesture moves records inside ' +
    'the array and an index would point at a different mark the instant ' +
    'she dragged something');

  // ---- THE ARIA POSTURE (LAW 4) -----------------------------------------
  const mixed = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'her line' },
    { page: 'abc123', kind: 'sticker', x: 20, y: 20, sprite: 'moon' },
    { page: 'abc123', kind: 'image', x: 30, y: 30, ref: 'pic1' }] };
  const three = nodesFor(mixed);
  assert.strictEqual(three.length, 3,
    '(9h) the positive control: all three kinds render, so the aria ' +
    'assertions below have three real subjects');
  const byKind = {};
  three.forEach(function (n) {
    byKind[/page-deco-text/.test(n.cls) ? 'text'
      : /page-deco-sprite/.test(n.cls) ? 'sticker' : 'image'] = n;
  });
  ['sticker', 'image'].forEach(function (kind) {
    assert.strictEqual(byKind[kind].attrs['aria-hidden'], 'true',
      '(9h) a ' + kind + ' is page CHROME and carries aria-hidden — it ' +
      'never becomes content to a screen reader (law 4)');
    assert.strictEqual(byKind[kind].attrs.tabindex, '-1',
      '(9h) and it leaves the tab order WITH it. aria-hidden on a ' +
      'focusable element is a real defect: the node would be tab-reachable ' +
      'and simultaneously invisible to the reader announcing the stop. ' +
      'These are <button>s, so the two attributes go together or neither');
  });
  assert.strictEqual(byKind.text.attrs['aria-hidden'], undefined,
    '(9h) THE ONE EXCEPTION: the hand-text element is HER WRITING, not ' +
    'chrome, and is never hidden from a screen reader');
  assert.strictEqual(byKind.text.attrs.tabindex, undefined,
    '(9h) and it keeps its tab stop — it is the one decoration with a ' +
    'keyboard surface behind it');
  assert.strictEqual(byKind.text.attrs['aria-label'], 'her line',
    '(9h) announced as what she wrote');

  // ---- THE HANDLES, AS PAINTED (26.9-05 T2-1) ---------------------------
  const gripsIn = function (ns) {
    return (ns.all || []).filter(function (n) {
      return /page-deco-handles/.test(String(n.cls));
    });
  };
  assert.strictEqual(gripsIn(nodesFor(coincident, null)).length, 0,
    '(9h) UNSELECTED elements show NO handles — not one, not a faded ' +
    'one. Without this half, "always paint handles on everything" passes ' +
    'the count below');
  const wraps = gripsIn(nodesFor(coincident, coincident.items[1]));
  assert.strictEqual(wraps.length, 1,
    '(9h) and a selection paints EXACTLY ONE handle wrapper — per ' +
    'element, never a shared gizmo floating between two coincident marks');
  // 26.9 F-10 (owner, 2026-08-06): a THIRD handle joined — remove. Her
  // report: "I may want to delete a sticker which I did a while ago but this
  // current workflow only have the option to undo and redo, this will get rid
  // of all of the other changes I want to keep." Undo is a TIME control; this
  // is an OBJECT control, and neither substitutes for the other. The count is
  // still asserted EXACTLY, so a fourth gizmo cannot appear unnoticed.
  assert.strictEqual(wraps[0].kids.length, 3,
    '(9h) carrying EXACTLY THREE handles: rotate, scale and remove');
  assert.deepStrictEqual(
    wraps[0].kids.map(function (g) { return g.attrs['data-handle']; }),
    ['rotate', 'scale', 'remove'],
    '(9h) rotate first (top-right), scale second (bottom-right), remove ' +
    'third (top-LEFT — off the edge the two adjust grips own, so a ' +
    'destructive control never sits under the thumb that just scaled)');
  wraps[0].kids.forEach(function (g) {
    assert.strictEqual(g.attrs['aria-hidden'], 'true',
      '(9h) a handle is a pointer gizmo and is hidden from a screen ' +
      'reader — rotate and scale have no keyboard path, and remove\'s ' +
      'keyboard path is the Delete/Backspace binding in nbKeydown, not ' +
      'this node');
    assert.strictEqual(g.attrs.tabindex, '-1',
      '(9h) and it leaves the tab order with it, for the same reason the ' +
      'decoration nodes do');
  });
  // the wrapper is sized to the ALREADY-SCALED box and rotated with the
  // element — driven, because this is what keeps the 12px target constant
  const big = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 100, y: 100, a: 30, s: 2,
      text: 'x' }] };
  const bigWrap = gripsIn(nodesFor(big, big.items[0]))[0];
  assert.strictEqual(bigWrap.style.__p['--a'], '30',
    '(9h) the wrapper carries the element\'s rotation');
  assert.deepStrictEqual(
    [bigWrap.style.__p['--w'], bigWrap.style.__p['--h']], ['144', '48'],
    '(9h) and its box is the 72x24 element ALREADY MULTIPLIED by the ' +
    'scale of 2. The wrapper never scales itself — a wrapper that did ' +
    'would shrink a 12-scene-px target to 6 CSS px at the floor, exactly ' +
    'when she is reaching for it to undo having made the thing tiny');
  assert.deepStrictEqual(
    [bigWrap.style.__p['--x'], bigWrap.style.__p['--y']], ['64', '88'],
    '(9h) centred on the element\'s centre (136, 112), so the handles sit ' +
    'at the corners of what she can SEE rather than of what is stored');

  // ---- THE PAINTED HANDLE IS ACTUALLY WIRED -----------------------------
  //
  // FOUND BY A MUTATION, NOT BY READING (M-T9). Replacing the painter's
  // `attachPageDrag(grip, ...)` with an inert listener left every
  // structural assertion above green: the wrapper was there, both grips
  // were there, both classes were right, and the source still MENTIONED
  // attachPageDrag. The driven rotate/scale cases in 9i call
  // attachPageDrag DIRECTLY, so they could not see it either. Nothing in
  // this file connected the thing that is painted to the thing that works.
  const wired = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 100, y: 100, text: 'x' }] };
  const wiredNodes = nodesFor(wired, wired.items[0]);
  const wiredGrip = gripsIn(wiredNodes)[0].kids[0];   // the rotate handle
  assert.ok((wiredGrip.__on.pointerdown || []).length === 1,
    '(9h) the PAINTED rotate handle carries exactly one pointerdown ' +
    'listener');
  const before = posted.length;
  // the element is 72x24 at (100,100), so its centre is (136,112) and at
  // --k 1 with the scene at the origin that is also client (136,112)
  wiredGrip.fire('pointerdown', {
    clientX: 236, clientY: 112, pointerId: 1,
    preventDefault: function () {}, stopPropagation: function () {}
  });
  wiredGrip.fire('pointermove', { clientX: 136, clientY: 212 });
  wiredGrip.fire('pointerup', {});
  assert.strictEqual(wired.items[0].a, 90,
    '(9h) and DRIVING that painted handle a quarter turn stores 90 ' +
    'degrees on the record. This is the assertion that connects the ' +
    'painter to the drag: paint two grips and wire neither, and only this ' +
    'one goes red');
  assert.strictEqual(posted.length, before + 1,
    '(9h) persisted once, at release, through the shipped write path');

  // and the transform reaches the decoration node itself
  const bigDeco = nodesFor(big, big.items[0])[0];
  assert.deepStrictEqual(
    [bigDeco.style.__p['--a'], bigDeco.style.__p['--s']], ['30', '2'],
    '(9h) the decoration carries its own stored angle and scale');
  const plainDeco = nodesFor({ reset: false, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'x' }] })[0];
  assert.deepStrictEqual(
    [plainDeco.style.__p['--a'], plainDeco.style.__p['--s']], ['0', '1'],
    '(9h) and a record written BEFORE this wave — carrying neither field ' +
    '— paints at the resting defaults, so the page it was is the page it ' +
    'stays');
})();

// ---- 9h(c): the reordering gesture, by index before and after -----------

(function () {
  function makeEl() {
    const handlers = {};
    return {
      style: { setProperty: function (n, v) { this.__p[n] = v; }, __p: {} },
      addEventListener: function (t, fn) {
        (handlers[t] = handlers[t] || []).push(fn);
      },
      removeEventListener: function (t, fn) {
        handlers[t] = (handlers[t] || []).filter(function (f) {
          return f !== fn;
        });
      },
      setPointerCapture: function () {},
      releasePointerCapture: function () {},
      fire: function (t, ev) {
        (handlers[t] || []).slice().forEach(function (fn) { fn(ev); });
      }
    };
  }

  // three marks; the FIRST one is dragged. Its index before is 0.
  function run(dx) {
    const day = { reset: false, items: [
      { page: 'abc123', kind: 'text', x: 100, y: 100, text: 'a' },
      { page: 'abc123', kind: 'text', x: 110, y: 110, text: 'b' },
      { page: 'abc123', kind: 'text', x: 120, y: 120, text: 'c' }] };
    const target = day.items[0];
    const before = day.items.indexOf(target);
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag');
    const posted = [];
    const bring = new Function('decoDay', 'NB_DAY',
      extractFn(appSrc, 'bringDecoToFront') +
      '\nreturn bringDecoToFront;')(
      function () { return day; }, '08/04/2026');
    // eslint-disable-next-line no-new-func
    const api = new Function(
      'NBDESIGN', '$', 'getComputedStyle', 'NB_TEXT_BOX', 'NB_BOUNDS',
      'NB_DRAG_THRESHOLD', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', 'dismissTray', 'NB_STICKERS', 'NB_STICKER_H',
      'NB_IMG_BOX', 'NB_SEL', 'bringDecoToFront', 'NB_REPAINT',
      'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn { attachPageDrag: attachPageDrag, ' +
      'readSelection: function () { return NB_SEL; } };')(
      true, function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      { w: 72, h: 24 }, { x0: 4, x1: 380, y0: 4, y1: 190 }, 3,
      function (d) { posted.push(d); }, '08/04/2026', function () {},
      function () {}, { 'moon': { x: 120, w: 20 } }, 24, { w: 48, h: 36 },
      null, bring, function () {}, function () {},
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    const el = makeEl();
    api.attachPageDrag(el, target);
    el.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    el.fire('pointermove', { clientX: 500 + dx, clientY: 500 });
    el.fire('pointerup', {});
    return { day: day, before: before,
      after: day.items.indexOf(target), posted: posted,
      sel: api.readSelection(), target: target };
  }

  const dragged = run(40);
  assert.strictEqual(dragged.before, 0,
    '(9h) BEFORE: the dragged mark sat at array index 0');
  assert.strictEqual(dragged.after, 2,
    '(9h) AFTER: it sits at the array\'s END. Asserted by INDEX BEFORE ' +
    'AND AFTER — "the array changed" would also be satisfied by a shuffle, ' +
    'by a duplicate, and by a delete');
  assert.strictEqual(dragged.day.items.length, 3,
    '(9h) and the array is the same LENGTH — the record moved, it was not ' +
    'copied to the end and left behind');
  assert.deepStrictEqual(
    dragged.day.items.map(function (r) { return r.text; }),
    ['b', 'c', 'a'],
    '(9h) the other two close up in their existing order — this is a ' +
    'move to the end, not a sort');
  assert.strictEqual(dragged.day.items[2], dragged.target,
    '(9h) and the SAME OBJECT is at the end, so the selection (which is ' +
    'held as the record) still points at it');
  assert.strictEqual(dragged.posted.length, 1,
    '(9h) persisted once, at release');
  assert.strictEqual(dragged.sel, dragged.target,
    '(9h) touching a mark SELECTS it — and selection happens at ' +
    'pointerdown, so it is true of a drag as well as of a tap');

  // THE COUNTER-CASE. A tap is not a reorder: an implementation that
  // brought the record forward on every pointerdown would pass every
  // assertion above and would silently re-stack her page whenever she
  // merely touched something.
  const tapped = run(2);
  assert.strictEqual(tapped.after, 0,
    '(9h) a <=3px TAP does NOT reorder — the record stays exactly where ' +
    'it was in the array. Without this case, "reorder on pointerdown" ' +
    'passes the whole group above');
  assert.strictEqual(tapped.posted.length, 0,
    '(9h) and a tap still writes nothing');
  assert.strictEqual(tapped.sel, tapped.target,
    '(9h) while STILL selecting it — selection and reordering are two ' +
    'different gestures and only one of them is destructive to the stack');

  // and there is NO send-behind gesture and no bring-forward chrome
  const painter = bodyOf('paintPageDecorations');
  const tray = bodyOf('renderTinTray');
  ['send behind', 'sendBehind', 'bringForward', 'bring forward',
    'send-behind'].forEach(function (t) {
    assert.strictEqual((painter + tray).indexOf(t), -1,
      '(9h) there is no "' + t + '" control anywhere: with free overlap ' +
      'and no legibility invariant a buried element would be ' +
      'undiscoverable, and the day reset must not have to rescue a thing ' +
      'the interface hid');
  });
})();

// ===========================================================================
// ---- 9i: 26.9-05 — FREE TRANSFORM, EVERY BOUND AT IT AND ONE STEP PAST ---
//
// TWELVE BOUND CASES, and each one is a pair: the value AT the bound and the
// value one step past it, in both directions. A single "it clamps"
// assertion is explicitly not enough here — it cannot tell a floor from a
// wall, and it cannot tell a clamp from a quantiser.
//
// T2-4 IS THE NON-DEGENERATE HALF and it is why the clamp cases mean
// anything: a value strictly BETWEEN the bounds survives unchanged and is
// not snapped to anything. A clamp-everything implementation passes every
// clamp assertion in this group and fails that one.
//
// THE EXPECTED VALUES DO NOT COME FROM THE CODE. 0.5, 2.0, 360 and 1 are
// written here as literals and separately pinned against their declarations
// in app.js, so neither side can move without the other being noticed —
// the wave-4 lesson, where an expectation derived from the thing it
// measured followed its own mutation to zero and `0 == 0` held.
// ===========================================================================

(function () {
  // the four bounding constants, PINNED BY VALUE against their declarations
  const decls = {};
  NB_BOUND_NAMES.forEach(function (n) {
    const m = new RegExp('var ' + n + ' = ([0-9.]+);').exec(appSrc);
    assert.ok(m, '(9i) ' + n + ' is declared exactly once in app.js');
    decls[n] = Number(m[1]);
  });
  assert.deepStrictEqual(
    NB_BOUND_NAMES.map(function (n) { return decls[n]; }),
    NB_BOUND_VALUES,
    '(9i) the bounds are pinned BY VALUE: the angle wraps modulo 360, the ' +
    'scale floors at 0.5 (D-07 — a photo cannot be reduced to nothing; ' +
    '0.5 is chosen rather than rounded to, because it leaves a polaroid ' +
    'recognisable), ceilings at 2.0, and rests at 1. Found: ' +
    JSON.stringify(decls));

  // and they AGREE with the server's, which is the other half of the fence
  const py = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const sBand = /DECOR_S_MIN, DECOR_S_MAX = ([0-9.]+), ([0-9.]+)/.exec(py);
  const aBand = /DECOR_A_MIN, DECOR_A_MAX = (\d+), (\d+)/.exec(py);
  assert.ok(sBand && aBand, '(9i) the server declares both bands');
  assert.deepStrictEqual([Number(sBand[1]), Number(sBand[2])], [0.5, 2.0],
    '(9i) the SERVER floors and ceilings the scale at the same two ' +
    'numbers. The client clamps and the server refuses — both halves, or ' +
    'a hand-edited store file places a decoration at a scale the page ' +
    'cannot show');
  assert.deepStrictEqual([Number(aBand[1]), Number(aBand[2])], [0, 359],
    '(9i) and the server takes integer degrees 0-359');

  const helpers = new Function(
    NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
    NB_BOUND_NAMES[3],
    NB_HELPERS + '\nreturn { wrap: wrapDecoAngle, ' +
    'clampS: clampDecoScale };')(
    NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
    NB_BOUND_VALUES[3]);

  // ---- FOUR ANGLE CASES: AT THE BOUND AND ONE STEP PAST, BOTH WAYS -------
  // The angle WRAPS. It is cyclic, not bounded — clamping it would make
  // 359 a wall you cannot turn a stamp through, which is not what turning
  // a stamp does.
  assert.deepStrictEqual(
    [helpers.wrap(0), helpers.wrap(359), helpers.wrap(360),
      helpers.wrap(-1)],
    [0, 359, 0, 359],
    '(9i) the angle WRAPS rather than clamping, asserted BY VALUE at each ' +
    'bound and one step past it in both directions: 0 stays 0, 359 stays ' +
    '359, 360 becomes 0, and -1 becomes 359. A clamp would give ' +
    '[0, 359, 359, 0] and would make 359 a wall');
  // and it keeps wrapping past a full turn in either direction, which a
  // single modulo without the +MOD would get wrong for negatives
  assert.deepStrictEqual(
    [helpers.wrap(720), helpers.wrap(-360), helpers.wrap(-361),
      helpers.wrap(361)],
    [0, 0, 359, 1],
    '(9i) and it wraps past a full turn in BOTH directions — a bare `% ' +
    '360` returns -1 for -361 in JavaScript, which the server would then ' +
    'refuse and her stamp would silently stop turning');
  // INTEGER DEGREES: sub-degree precision is invisible at scene scale and
  // doubles the stored payload
  assert.strictEqual(helpers.wrap(12.5), 13,
    '(9i) rotation is stored as an INTEGER degree');
  assert.strictEqual(Number.isInteger(helpers.wrap(0.4)), true,
    '(9i) always, including near zero');

  // ---- FOUR SCALE CASES: AT THE BOUND AND ONE STEP PAST, BOTH WAYS ------
  assert.deepStrictEqual(
    [helpers.clampS(0.5), helpers.clampS(0.49), helpers.clampS(2.0),
      helpers.clampS(2.01)],
    [0.5, 0.5, 2.0, 2.0],
    '(9i) the scale CLAMPS at the floor and the ceiling, asserted at each ' +
    'bound and one step past it: 0.5 and 2.0 survive exactly, 0.49 rises ' +
    'to the floor and 2.01 falls to the ceiling. THE FLOOR IS D-07\'s ' +
    'requirement, not a round number — a photo cannot be reduced to ' +
    'nothing');
  assert.deepStrictEqual(
    [helpers.clampS(undefined), helpers.clampS(null),
      helpers.clampS('nonsense')],
    [1, 1, 1],
    '(9i) and a record with no stored scale — every record written before ' +
    'this wave — rests at 1. That default is half of what keeps the day ' +
    'reset able to restore a page in full');

  // ---- T2-4: THE COUNTER-CASE THAT MAKES ALL OF THE ABOVE MEAN ANYTHING -
  const between = [0.5001, 0.73, 1.0, 1.37, 1.999];
  assert.deepStrictEqual(between.map(helpers.clampS), between,
    '(9i) T2-4: every value STRICTLY BETWEEN the bounds survives a round ' +
    'trip UNCHANGED and is not quantised to anything. THIS IS THE ' +
    'NON-DEGENERATE HALF: a clamp-everything implementation passes all ' +
    'four clamp cases above and fails here, and a snap-to-a-grid ' +
    'implementation fails here too while passing every bound');
  // the same claim for the angle, which is where a rotation snap would hide
  assert.deepStrictEqual([1, 7, 47, 183, 358].map(helpers.wrap),
    [1, 7, 47, 183, 358],
    '(9i) and no rotation snap: 7 degrees stays 7 rather than becoming 0 ' +
    'or 15. `.page-deco` is EXEMPT from the integer-at-rest rule — a ' +
    'decoration is content she placed by hand and a fractional scale or ' +
    'an odd angle is the entire point');

  // ---- EIGHT ORIGIN CASES: EACH PAGE-INTERIOR EDGE, AND ONE STEP OUT ----
  //
  // 26.91-10 REWRITTEN, NEVER DELETED — the authority is the OWNER'S RULING
  // `right-page-only`, taken 2026-08-08 (26.91-CONTEXT.md A-12).
  //
  //   THE PROPERTY THESE EIGHT CASES PROTECT IS UNCHANGED, and it is the
  //   pairing that makes them a gate rather than a wall test: every edge of
  //   the mark canvas is REACHABLE (exactly on the bound survives, so she
  //   can put something in a corner) AND one step past every edge is pulled
  //   back (so nothing can be pushed off-page or hidden under the chrome
  //   band). Drop either half and the remaining half is satisfied by a
  //   clamp-everything or a clamp-nothing implementation.
  //
  //   WHAT MOVED: the LEFT bound only, from the spread interior (4) to the
  //   gutter (192), because **26.9 D-05's** gutter-straddle clause
  //   (`26.9-CONTEXT.md:37`) is retired by her call and the left half of
  //   every spread is the month grid now. Right, top and bottom are
  //   untouched. (**26.91 D-05**, the law-5 naming fallback, is a different
  //   decision entirely and is not in scope here.)
  //
  //   THE BOX IS READ FROM THE REAL DECLARATION rather than hand-typed, so
  //   this pin cannot quietly disagree with the shipped bound — which is
  //   what a re-typed `{ x0: 192, ... }` here would eventually do.
  const MB = NB_SRC_CONSTS.NB_MARK_BOUNDS;
  // NB_MARK_DECLS is deliberately NOT used here: this harness injects the
  // box as a PARAMETER so the pin is visibly about the box it was handed,
  // and a `var` from the shared snippet would silently overwrite it.
  const clampO = new Function('NB_MARK_BOUNDS',
    extractFn(appSrc, 'clampDecoOrigin') + '\nreturn clampDecoOrigin;')(MB);
  const W = 72, H = 24;
  assert.strictEqual(MB.x0, 192,
    '(9i/A-12) POSITIVE CONTROL: the mark canvas\'s left bound IS the ' +
    'gutter (192), read from the shipped declaration. Every case below is ' +
    'about that box, so a bound that silently reverted to 4 must fail ' +
    'HERE — before the eight cases, which would all still pass against a ' +
    'spread-wide box and tell us nothing');
  const atEdge = [
    ['left', clampO(MB.x0, 100, W, H).x, MB.x0],
    ['right', clampO(380 - W, 100, W, H).x, 380 - W],
    ['top', clampO(100, 4, W, H).y, 4],
    ['bottom', clampO(100, 190 - H, W, H).y, 190 - H]
  ];
  atEdge.forEach(function (c) {
    assert.strictEqual(c[1], c[2],
      '(9i) the ' + c[0] + ' mark-canvas edge is REACHABLE — exactly on ' +
      'the bound survives. Without this half the clamp is a wall and she ' +
      'cannot put anything in a corner');
  });
  const pastEdge = [
    ['left', clampO(MB.x0 - 1, 100, W, H).x, MB.x0],
    ['right', clampO(380 - W + 1, 100, W, H).x, 380 - W],
    ['top', clampO(100, 3, W, H).y, 4],
    ['bottom', clampO(100, 190 - H + 1, W, H).y, 190 - H]
  ];
  pastEdge.forEach(function (c) {
    assert.strictEqual(c[1], c[2],
      '(9i) and ONE STEP past the ' + c[0] + ' edge is pulled back — ' +
      'nothing can be pushed off-page or hidden under the chrome band');
  });
  // ---- 26.91-10 (A-12): THE RETIREMENT ITSELF, ASSERTED ----------------
  //
  // One step past a bound is a boundary case; this is the RULING. An origin
  // deep in the old left page — 4, the bound that shipped, and 100, the
  // middle of the month grid — is pulled to the gutter. A clamp that still
  // straddled would leave both where they were, so this goes red the
  // instant the left bound drifts back, at any distance rather than only at
  // the boundary.
  assert.strictEqual(clampO(4, 100, W, H).x, MB.x0,
    '(9i/A-12) **26.9 D-05\'s** GUTTER-STRADDLE CLAUSE IS RETIRED (owner ' +
    'ruling `right-page-only`, 2026-08-08): an origin at the OLD left ' +
    'bound (4) is pulled to the gutter. Marks live on the right page only');
  assert.strictEqual(clampO(100, 100, W, H).x, MB.x0,
    '(9i/A-12) ...and so is an origin in the MIDDLE of the month grid ' +
    '(100). Stated away from the boundary on purpose: a boundary-only pin ' +
    'would pass against a clamp that had merely shifted by one');
})();

// ---- 9i(b): the handles, DRIVEN through the shipped drag ----------------

(function () {
  function makeEl() {
    const handlers = {};
    return {
      style: { setProperty: function (n, v) { this.__p[n] = v; }, __p: {} },
      addEventListener: function (t, fn) {
        (handlers[t] = handlers[t] || []).push(fn);
      },
      removeEventListener: function (t, fn) {
        handlers[t] = (handlers[t] || []).filter(function (f) {
          return f !== fn;
        });
      },
      setPointerCapture: function () {},
      releasePointerCapture: function () {},
      fire: function (t, ev) {
        (handlers[t] || []).slice().forEach(function (fn) { fn(ev); });
      }
    };
  }

  // The REAL attachPageDrag in a handle mode. The scene rect is stubbed at
  // the origin and --k is 1, so the element's centre is at scene
  // coordinates and every number below can be reasoned about by hand.
  function handleDrag(mode, rec, from, to) {
    const posted = [];
    // 26.9-06: what the record LOOKED LIKE when the push fired, so the
    // ordering claim is decidable rather than merely counted.
    const pushed = [];
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag');
    const deco = makeEl();
    const wrap = makeEl();
    // eslint-disable-next-line no-new-func
    const api = new Function(
      'NBDESIGN', '$', 'getComputedStyle', 'NB_TEXT_BOX', 'NB_BOUNDS',
      'NB_DRAG_THRESHOLD', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', 'dismissTray', 'NB_STICKERS', 'NB_STICKER_H',
      'NB_IMG_BOX', 'NB_SEL', 'bringDecoToFront', 'NB_REPAINT',
      'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn { attachPageDrag: attachPageDrag };')(
      true,
      function () {
        return {
          getBoundingClientRect: function () {
            return { left: 0, top: 0 };
          }
        };
      },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      { w: 72, h: 24 }, { x0: 4, x1: 380, y0: 4, y1: 190 }, 3,
      function (d) { posted.push(d); }, '08/04/2026', function () {},
      function () {},
      { 'moon': { x: 120, w: 20 } }, 24, { w: 48, h: 36 },
      null,
      function () { throw new Error('a handle must never reorder'); },
      function () {}, function () { pushed.push(rec.a + '/' + rec.s); },
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    const grip = makeEl();
    api.attachPageDrag(grip, rec, mode, { deco: deco, wrap: wrap });
    grip.fire('pointerdown', {
      clientX: from[0], clientY: from[1], pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    grip.fire('pointermove', { clientX: to[0], clientY: to[1] });
    grip.fire('pointerup', {});
    return { rec: rec, posted: posted, deco: deco, wrap: wrap,
      pushed: pushed };
  }

  // A text-box decoration at x100 y100 is 72x24, so its centre is
  // (136, 112) — and at --k 1 with the scene at the client origin, that is
  // also its centre in client pixels.
  const CX = 136, CY = 112;
  const at = function (deg, r) {
    return [CX + r * Math.cos(deg * Math.PI / 180),
      CY + r * Math.sin(deg * Math.PI / 180)];
  };

  // ---- ROTATE: the gesture reaches the stored field ---------------------
  const spun = handleDrag('rotate',
    { page: 'p', kind: 'text', x: 100, y: 100, text: '' },
    at(0, 100), at(90, 100));
  assert.strictEqual(spun.rec.a, 90,
    '(9i) dragging the ROTATE handle a quarter turn about the centre ' +
    'stores 90 degrees. Driven through the shipped attachPageDrag, not ' +
    'through a helper — the bound cases in 9i prove the arithmetic, this ' +
    'proves the handle is wired to it');
  assert.strictEqual(spun.posted.length, 1,
    '(9i) and it persists ONCE, at release, through the same path a move ' +
    'takes — the handles are not a second drag implementation');
  assert.strictEqual(spun.rec.x, 100,
    '(9i) AND THE ORIGIN DID NOT MOVE. T2-5: the transform composes about ' +
    'the element\'s CENTRE, so an element turns in place instead of ' +
    'walking across the page as it is turned');
  assert.strictEqual(spun.rec.y, 100);

  // THE WRAP, DRIVEN: 359 plus a quarter turn is 89, not 449 and not 359
  const wrapped = handleDrag('rotate',
    { page: 'p', kind: 'text', x: 100, y: 100, a: 359, text: '' },
    at(0, 100), at(90, 100));
  assert.strictEqual(wrapped.rec.a, 89,
    '(9i) 359 + 90 stores as 89 — the angle wraps THROUGH the top rather ' +
    'than stopping at it, driven end to end');

  // ---- SCALE: floor, ceiling, and the free value between ---------------
  const doubled = handleDrag('scale',
    { page: 'p', kind: 'text', x: 100, y: 100, text: '' },
    at(45, 100), at(45, 200));
  // A TOLERANCE HERE AND AN EQUALITY BELOW, AND THE DIFFERENCE IS THE
  // POINT. This case reaches 2 by ARITHMETIC — cos and sin of 45 degrees
  // put it at 1.9999999999999998 — so a strict equality would be
  // measuring IEEE754 rather than the scale. The next case reaches 2 by
  // CLAMPING, where the stored value IS the constant and an equality is
  // exactly right. The pure-helper block above already pins
  // clampDecoScale(2.0) === 2.0 by value.
  assert.ok(Math.abs(doubled.rec.s - 2) < 1e-9,
    '(9i) dragging the SCALE handle to twice the distance from the centre ' +
    'stores 2 — the ceiling, reached by arithmetic. Got ' + doubled.rec.s);
  const overCeil = handleDrag('scale',
    { page: 'p', kind: 'text', x: 100, y: 100, text: '' },
    at(45, 100), at(45, 400));
  assert.strictEqual(overCeil.rec.s, 2,
    '(9i) and four times the distance is CLAMPED to the same 2 — it ' +
    'cannot pass the ceiling');
  const floored = handleDrag('scale',
    { page: 'p', kind: 'text', x: 100, y: 100, text: '' },
    at(45, 400), at(45, 20));
  assert.strictEqual(floored.rec.s, 0.5,
    '(9i) and it clamps at the FLOOR of 0.5 — D-07: a photo cannot be ' +
    'reduced to nothing');
  // T2-4 DRIVEN, not merely asserted on the helper: a drag that lands
  // between the bounds stores what it landed on
  const free = handleDrag('scale',
    { page: 'p', kind: 'text', x: 100, y: 100, text: '' },
    at(45, 100), at(45, 137));
  assert.ok(Math.abs(free.rec.s - 1.37) < 1e-9,
    '(9i) T2-4, DRIVEN: a scale drag between the bounds lands on 1.37 and ' +
    'is not quantised. A clamp-everything implementation stores 0.5 or 2 ' +
    'here and fails; a snap-to-a-step implementation stores 1.5 and fails. ' +
    'Got ' + free.rec.s);

  // THE PHOTOGRAPH PARTICIPATES (T2-7) — a placed picture is transformed
  // by exactly the same path, and at the floor it is still a photograph
  const pic = handleDrag('scale',
    { page: 'p', kind: 'image', ref: 'pic1', x: 100, y: 100 },
    at(45, 400), at(45, 20));
  assert.strictEqual(pic.rec.s, 0.5,
    '(9i) T2-7: her own photograph moves, turns and resizes like any ' +
    'other element and floors at the same 0.5');
  assert.deepStrictEqual([48 * 0.5, 36 * 0.5], [24, 18],
    '(9i) which leaves a placed 48x36 picture at 24x18 scene px — at the ' +
    'typical --k of 3-4 that is 72-96 CSS px across, still a photograph ' +
    'rather than nothing');

  // A TWITCH ON A HANDLE CHANGES NOTHING. The 3px threshold is the SAME
  // one the move gesture uses, reached through the same code.
  const twitch = handleDrag('rotate',
    { page: 'p', kind: 'text', x: 100, y: 100, a: 12, text: '' },
    at(0, 100), [CX + 100, CY + 2]);
  assert.strictEqual(twitch.rec.a, 12,
    '(9i) a <=3px twitch on a handle stores nothing — the shipped ' +
    'threshold, not a second one');
  assert.strictEqual(twitch.posted.length, 0,
    '(9i) and writes nothing');

  // AND A HANDLE NEVER REORDERS. The harness above throws if
  // bringDecoToFront is reached from a handle drag, so every assertion in
  // this block is also that assertion — but state it, because a silent
  // precondition is not a check.
  assert.ok(true,
    '(9i) turning or resizing a mark is not the reordering gesture: the ' +
    'harness throws if a handle reaches bringDecoToFront, and none of the ' +
    'drags above did');
})();

// ---- 9i(c): the handles as painted, and the stylesheet contract ---------

(function () {
  const painter = bodyOf('paintPageDecorations');
  const handles = bodyOf('paintDecoHandles');
  assert.ok(/if \(r === NB_SEL\) \{ paintDecoHandles\(/.test(painter),
    '(9i) handles are painted for the SELECTED element only — an ' +
    'unselected element shows none');
  assert.ok(/\['rotate', 'scale'\]/.test(handles),
    '(9i) exactly two handles, rotate and scale');
  assert.ok(/'page-deco-handle page-deco-' \+ which/.test(handles),
    '(9i) each takes its own class from that roster, so the stylesheet ' +
    'rules below have subjects');
  assert.strictEqual(
    (handles.match(/attachPageDrag\(/g) || []).length, 1,
    '(9i) and BOTH ride the same attachPageDrag call site — the handles ' +
    'are not a second drag implementation, which is the whole reason the ' +
    'threshold, the pointer capture, the pointerdown --k read and the ' +
    'persist-at-release behave identically for all three gestures');

  const rawCss = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

  // THE TRANSFORM COMPOSITION, BY VALUE AND IN ORDER
  const tf = /\.page-deco \{[^}]*transform:\s*([^;]+);/.exec(css);
  assert.ok(tf, '(9i) .page-deco declares a transform');
  assert.strictEqual(tf[1].trim(),
    'rotate(calc(var(--a, 0) * 1deg)) scale(var(--s, 1))',
    '(9i) rotation THEN scale, each from its stored field, each carrying ' +
    'the RESTING DEFAULT in the var() fallback — so a record written ' +
    'before this wave reads as rotate(0deg) scale(1) and is ' +
    'byte-identically the page it was. That default is also half of what ' +
    'keeps the day reset able to restore a page in full');
  assert.ok(/\.page-deco \{[^}]*transform-origin:\s*center/.test(css),
    '(9i) about the CENTRE (T2-5), so an element does not walk across the ' +
    'page as it is turned');

  // THE HIT AREA AND THE ART ARE TWO DIFFERENT NUMBERS
  const hit = /\.page-deco-handle \{[^}]*width:\s*calc\((\d+)px \* var\(--k\)\)/
    .exec(css);
  const art = /\.page-deco-handle::before \{[^}]*width:\s*calc\((\d+)px \* var\(--k\)\)/
    .exec(css);
  assert.ok(hit && art, '(9i) both the handle target and its art are sized');
  assert.deepStrictEqual([hit[1], art[1]], ['12', '6'],
    '(9i) THE HIT AREA IS 12 SCENE PX AND THE ART IS 6 — two different ' +
    'values, read separately. A single value for both would mean the ' +
    'target had silently shrunk to the size of the drawing; the 6 is ' +
    'drawn size ONLY and is never the target. At the typical --k of 3-4 ' +
    'the 12 lands at 36-48 CSS px');
  assert.notStrictEqual(hit[1], art[1],
    '(9i) stated as a relation as well as by value, so "make them the ' +
    'same and update the expectation" is not a silent edit');

  // the wrapper carries the ROTATION but never the SCALE
  const wrapRule = /\.page-deco-handles \{([^}]*)\}/.exec(css);
  assert.ok(wrapRule, '(9i) the handle wrapper has a rule');
  assert.ok(/transform:\s*rotate\(calc\(var\(--a, 0\) \* 1deg\)\);/
    .test(wrapRule[1]),
    '(9i) the wrapper rotates with the element');
  assert.strictEqual(/scale\(/.test(wrapRule[1]), false,
    '(9i) but it NEVER scales: a wrapper that scaled would shrink a ' +
    '12-scene-px target to 6 CSS px at the floor — exactly when she is ' +
    'reaching for it to undo having made the thing tiny. The painter ' +
    'sizes the wrapper to the already-scaled box instead');

  // NO MOTION AND NO TIMERS WERE INTRODUCED
  // (the slice is the shared bounded lift — see editorCssBlock at the top of
  // this file for why it stopped running to the end of tokens.css)
  const block = editorCssBlock(css, '(9i)');
  assert.strictEqual(/transition\s*:/.test(block), false,
    '(9i) no transition anywhere in the editor CSS — rotating and ' +
    'scaling are DIRECT manipulation; the element is under her finger and ' +
    'must not lag behind it');
  assert.strictEqual(/animation\s*:/.test(block), false,
    '(9i) and no animation');
  const jsRegion = ['attachPageDrag', 'paintDecoHandles',
    'previewDecoTransform', 'wrapDecoAngle', 'clampDecoScale',
    'bringDecoToFront'].map(bodyOf).join('\n');
  ['setInterval(', 'setTimeout(', 'requestAnimationFrame('].forEach(
    function (t) {
      assert.strictEqual(jsRegion.indexOf(t), -1,
        '(9i) LAW 1: the transform introduces no timer of any kind ("' +
        t + '") — Pointer Events only');
    });
  assert.ok(jsRegion.indexOf('pointermove') !== -1,
    '(9i) and the positive half: Pointer Events ARE how it moves, without ' +
    'which the bans above are satisfied by nothing happening at all');
})();

// ===========================================================================
// ---- 9j: 26.9-05 — THE SPINE DID NOT MOVE, AND NOTHING WAS REWRITTEN -----
//
// THIS GROUP LANDS AFTER THE TRANSFORM WORK, NOT BEFORE IT, AND THAT IS THE
// POINT. Task 2 gave decorations free position, free rotation and free
// scale; it could equally have given them to the date, the title or the why
// and nothing in this file would have noticed. D-01 says the readable spine
// stays pinned, so the pin lands where it can catch that.
//
// WHAT THIS GROUP DELIBERATELY DOES NOT DO: check that the page is still
// READABLE. D-02 removed that invariant on the owner's record, so there is
// no such rule to check and inventing a heuristic one would be a machine
// deciding what only she can decide. The absence is asserted as an absence
// below, and the claim is routed to the owner's eye in plan 08.
// ===========================================================================

(function () {
  // ---- (1) NO HEURISTIC READABILITY CHECK WAS ADDED ---------------------
  const designRegion = ['paintPageDecorations', 'paintBlessingPage',
    'paintDecoHandles', 'attachPageDrag', 'previewDecoTransform',
    'clampDecoOrigin', 'wrapDecoAngle', 'clampDecoScale', 'placeFromTray',
    'nbClearResetForEdit',
    'bringDecoToFront'].map(bodyOf).join('\n');
  ['coverage', 'occlusion', 'occlude', 'overlapRatio', 'legib',
    'readability', 'intersectionArea', 'isCovered'].forEach(function (t) {
    assert.strictEqual(designRegion.indexOf(t), -1,
      '(9j) NO heuristic readability check exists in the notebook design ' +
      'region ("' + t + '" found). D-02 removed the legibility invariant ' +
      'BY DESIGN; a rule that guessed at whether her page is still ' +
      'readable would be a machine deciding what only she can decide, and ' +
      'it would be a check that looks rigorous and measures nothing. THE ' +
      'ABSENCE IS DELIBERATE and is recorded in the SUMMARY');
  });
  // the region is real (the negative above is not over an empty string)
  assert.ok(designRegion.length > 3000,
    '(9j) and the region searched is substantial (' + designRegion.length +
    ' chars) — a negative grep over nothing proves nothing');

  // the five clauses are written where the next editor will meet them
  // NOT DECO_PAINTER_SRC: this one is not a lift. It locates the painter's
  // own text inside appSrc so the preamble immediately above it can be
  // read, and the bundled string starts 200-odd lines earlier.
  const rawPainter = extractFn(appSrc, 'paintPageDecorations');
  const preamble = appSrc.slice(
    Math.max(0, appSrc.indexOf(rawPainter) - 2600),
    appSrc.indexOf(rawPainter));
  [[/removed the legibility guarantee/i, 'the invariant was removed'],
    [/none is invented here/i, 'and none is invented here'],
    [/may fully cover the why/i, 'a decoration may cover the why'],
    [/the net is the day reset/i, 'the reset is the net'],
    [/two-tap/i, 'its confirmation is two-tap'],
    [/flag rather than a delete/i, 'its representation is a flag'],
    [/blocking owner verdict/i, 'the owner verdict is the only check']]
    .forEach(function (pair) {
      assert.ok(pair[0].test(preamble),
        '(9j) the decoration painter\'s note must state: ' + pair[1]);
    });

  // ---- (2) THE SPINE, PINNED BY VALUE -----------------------------------
  const geom = {};
  ['date', 'title', 'whyText', 'whyImage'].forEach(function (slot) {
    const m = new RegExp(slot +
      ': \\{ dx: (\\d+), y: (\\d+), w: (\\d+), h: (\\d+) \\}').exec(appSrc);
    assert.ok(m, '(9j) STATION_NOTEBOOK_GEOM.' + slot + ' is declared');
    geom[slot] = m.slice(1, 5).map(Number);
  });
  assert.deepStrictEqual(geom, {
    date: [8, 24, 144, 10],
    title: [8, 38, 144, 20],
    whyText: [8, 62, 144, 108],
    whyImage: [8, 122, 144, 46]
  }, '(9j) D-01: the date, the title and the why keep their SHIPPED ' +
     'geometry slots, pinned BY VALUE so a later edit that moves the ' +
     'spine fails here rather than passing quietly. Only the photo and ' +
     'the decorations compose. Found: ' + JSON.stringify(geom));
})();

// ---- 9j(b): DRIVEN — six decorations over the why, and the why is intact -

(function () {
  // The REAL paintBlessingPage, over a page carrying SIX decorations, four
  // of which sit squarely on top of the why text. Asserting this over an
  // EMPTY decoration set would be trivially true, which is exactly the
  // vacuity the six-decoration precondition removes.
  function paintPage(dayRecord, entry) {
    const nodes = [];
    const doc = {
      createElement: function (t) {
        const n = {
          tag: t, cls: '', attrs: {}, text: '', kids: [], __on: {},
          style: { position: '', left: '', top: '', width: '', height: '',
            setProperty: function (k, v) { this.__p[k] = v; }, __p: {} },
          addEventListener: function (t2, fn) {
            (this.__on[t2] = this.__on[t2] || []).push(fn);
          },
          removeEventListener: function () {},
          appendChild: function (c) { this.kids.push(c); },
          getBoundingClientRect: function () {
            return { left: 0, top: 0 };
          }
        };
        Object.defineProperty(n, 'className', {
          get: function () { return this.cls; },
          set: function (v) { this.cls = v; }
        });
        Object.defineProperty(n, 'textContent', {
          get: function () { return this.text; },
          set: function (v) { this.text = v; }
        });
        Object.defineProperty(n, 'innerHTML', {
          get: function () { return this.__html || ''; },
          set: function (v) { this.__html = v; }
        });
        n.setAttribute = function (k, v) { this.attrs[k] = v; };
        return n;
      }
    };
    const scene = {
      appendChild: function (n) { nodes.push(n); },
      querySelector: function () { return null; },
      getBoundingClientRect: function () { return { left: 0, top: 0 }; }
    };
    const src = [
      extractFn(appSrc, 'placeNotebookInert'),
      extractFn(appSrc, 'pickBlessingDecoration'),
      extractFn(appSrc, 'mulberry32'),
      extractFn(appSrc, 'blessingSeed'),
      NB_HELPERS,
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin'),
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag'),
      // 26.9-09: the REAL promotion helpers, never stubs. paintBlessingPage
      // calls ensurePagePhoto at its first statement, and a stub would let
      // this harness answer the question 9p is asking about it.
      extractFn(appSrc, 'livePagePhoto'),
      extractFn(appSrc, 'ensurePagePhoto'),
      extractFn(appSrc, 'paintDecoHandles'),
      DECO_PAINTER_SRC,
      extractFn(appSrc, 'paintBlessingPage')
    ].join('\n');
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'STATION_NOTEBOOK_GEOM', 'document', 'escapeAttr',
      'encodeURIComponent', 'NBDESIGN', 'openContainerItem',
      'NOTEBOOK_CAPTION_LINE_PX', 'DECORATIONS', 'decoDay', 'NB_BOUNDS',
      'NB_TEXT_BOX', 'NB_DRAG_THRESHOLD', 'NB_REPAINT', 'postDecorations',
      'NB_DAY', 'openHandTextEditor', '$', 'getComputedStyle',
      'NB_STICKERS', 'NB_STICKER_H', 'NB_SHEET_W', 'NB_IMG_BOX',
      'NB_DECO_CAP', 'NB_TIN_OPEN', 'paintStickerCrop', 'recordIncident',
      'dismissTray', 'NB_SEL', 'bringDecoToFront',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn paintBlessingPage;')(
      {
        pageX: { left: 18, right: 202 },
        date: { dx: 8, y: 24, w: 144, h: 10 },
        title: { dx: 8, y: 38, w: 144, h: 20 },
        photo: { dx: 44, y: 62, w: 72, h: 54 },
        whyImage: { dx: 8, y: 122, w: 144, h: 46 },
        whyText: { dx: 8, y: 62, w: 144, h: 108 },
        deco: { tr: { dx: 132, y: 8 }, bl: { dx: 8, y: 178 } }
      },
      doc, function (s) { return s; }, global.encodeURIComponent,
      false, function () {}, 7 * 1.3,
      { '08/04/2026': dayRecord }, function () { return dayRecord; },
      { x0: 4, x1: 380, y0: 4, y1: 190 }, { w: 72, h: 24 }, 3, null,
      function () {}, '08/04/2026', function () {},
      function () { return scene; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      { 'moon': { x: 120, w: 20 } }, 24, 316, { w: 48, h: 36 }, 48, false,
      function () { return true; }, function () {}, function () {},
      null, function () {},
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    fn(scene, entry, 'left', {}, [], function () { return null; });
    return nodes;
  }

  // the ledger's stored why, in her own words, with the punctuation and
  // the whitespace that make a byte comparison mean something
  const WHY = 'because you were laughing, and it was  raining — I kept it.';
  // THE dayLabel MUST BE THE KEY THE DECORATIONS MAP IS KEYED BY. Written
  // as a prettier '04 August' first, which silently made
  // `DECORATIONS[entry.dayLabel]` undefined inside the real painter — the
  // six decorations still rendered (the decoDay stub hands them back
  // regardless), so the harness LOOKED right while the reset lookup and
  // anything else reading the map was reaching a hole. A mutation that
  // rewrote the why only when the day carried decorations went GREEN
  // against it. The harness must be faithful or it is answering its own
  // questions.
  const entry = { itemId: 'abc123', dayLabel: '08/04/2026', title: 'a walk',
    why: WHY, author: 'you', isImage: false, ms: 1754300000000 };

  const emptyDay = { reset: false, items: [] };
  const bare = paintPage(emptyDay, entry);
  const captionOf = function (ns) {
    return ns.filter(function (n) {
      return /station-caption/.test(String(n.cls));
    });
  };
  // date and why are both .station-caption; the why is the second
  const bareCaps = captionOf(bare);
  assert.strictEqual(bareCaps.length, 2,
    '(9j) the positive control: the bare page paints its date and its why');
  assert.strictEqual(bareCaps[1].text, WHY,
    '(9j) and the why is the ledger\'s string');

  // SIX DECORATIONS, four of them squarely on top of the why text (which
  // occupies x 26-170, y 62-170 on the left page).
  const sixDay = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 30, y: 70, text: 'over the why' },
    { page: 'abc123', kind: 'text', x: 40, y: 100, text: 'also over it' },
    { page: 'abc123', kind: 'sticker', x: 60, y: 120, sprite: 'moon' },
    { page: 'abc123', kind: 'sticker', x: 26, y: 62, sprite: 'moon',
      a: 17, s: 2 },
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'a corner' },
    { page: 'abc123', kind: 'text', x: 200, y: 150, text: 'far away' }] };
  const buried = paintPage(sixDay, entry);
  const buriedDecos = buried.filter(function (n) {
    return /(^|\s)page-deco(\s|$)/.test(String(n.cls));
  });
  assert.strictEqual(buriedDecos.length, 6,
    '(9j) THE PRECONDITION, ASSERTED RATHER THAN ASSUMED: all six ' +
    'decorations really rendered. Over an EMPTY set the byte-identity ' +
    'assertion below is trivially true, and that is the vacuity this ' +
    'removes');

  // ---- THE SPINE DID NOT MOVE -------------------------------------------
  const spine = buried.filter(function (n) {
    return /station-caption|station-toc-line/.test(String(n.cls));
  });
  const at = function (n) {
    return [n.style.__p['--x'], n.style.__p['--y'],
      n.style.__p['--w'], n.style.__p['--h']];
  };
  assert.deepStrictEqual(spine.map(at), [
    ['26', '24', '144', '10'],    // the date:  pageX.left 18 + dx 8
    ['26', '38', '144', '20'],    // the title
    ['26', '62', '144', '108']    // the why (text variant)
  ], '(9j) D-01, DRIVEN over a six-decoration page: the date, the title ' +
     'and the why are painted at their SHIPPED slots and nowhere else. ' +
     'Task 2 handed out free position, rotation and scale; it could ' +
     'equally have handed them to these three and nothing else in this ' +
     'file would have noticed. Found: ' + JSON.stringify(spine.map(at)));
  spine.forEach(function (n) {
    assert.strictEqual(n.style.__p['--a'], undefined,
      '(9j) and no spine element carries a rotation');
    assert.strictEqual(n.style.__p['--s'], undefined,
      '(9j) or a scale — the spine does not compose');
  });

  // ---- THE CONTENT WAS NEVER REWRITTEN (LAW 4) --------------------------
  const buriedWhy = captionOf(buried)[1];
  assert.strictEqual(buriedWhy.text, WHY,
    '(9j) LAW 4, over a NON-EMPTY page: the why string is BYTE-IDENTICAL ' +
    'to the ledger\'s stored value after six decorations have been ' +
    'rendered over it — two of them directly on top of it, one of them ' +
    'rotated 17 degrees and scaled to 2. The decoration layer ADDS NODES; ' +
    'it never rewrites, reflows, summarises, truncates or filters the ' +
    'content it sits beside');
  assert.strictEqual(buriedWhy.text.length, WHY.length,
    '(9j) same length — no whitespace was collapsed and no em dash was ' +
    '"normalised"');
  assert.strictEqual(buriedWhy.text, bareCaps[1].text,
    '(9j) and identical to the same page with NO decorations at all, ' +
    'which is the comparison that catches a rewrite that happens to be ' +
    'idempotent');

  // THE SPINE IS IDENTICAL BETWEEN THE TWO PAGES — compared to the OTHER
  // PAGE, not to the same literal twice. (Written the wrong way first: a
  // deepStrictEqual against a hand-built copy of the expectation two
  // assertions above, which compares a literal to itself and would have
  // passed for any implementation whatsoever. That is this phase's named
  // defect class, landing inside the instrument built to catch it, for the
  // fourth time.)
  const bareSpine = bare.filter(function (n) {
    return /station-caption|station-toc-line/.test(String(n.cls));
  }).map(at);
  assert.deepStrictEqual(spine.map(at), bareSpine,
    '(9j) the spine sits in exactly the same three places whether the ' +
    'page is bare or buried under six marks — the decorations do not ' +
    'push it and nothing reflows around them');
  assert.strictEqual(bareSpine.length, 3,
    '(9j) and the comparison had three real subjects on both sides');
})();

// ===========================================================================
// ---- 9k: 26.9-06 — TWO HISTORIES THAT CANNOT REACH EACH OTHER -------------
//
// D-15 diverged deliberately and only HALFWAY: the STACK is separate, the KEY
// BINDINGS are reused. This group drives the stack half; 9a drives the
// binding half (bound on entry, released on exit, same function reference).
//
// THE DEGENERATE THIS GROUP IS BUILT AGAINST, said in advance: a stack that
// never pushes passes "a notebook undo leaves the room alone" trivially,
// because it leaves EVERYTHING alone. So every cross-contamination assertion
// below is paired with a positive control that the undo it just ran actually
// changed the side it was supposed to change. Both halves, always.
//
// And it drives across the SEAM. The room's and the notebook's histories are
// lifted into ONE scope, over ONE LAYOUT and ONE DECORATIONS, and mutated
// through the REAL drag rather than by calling pushNbUndo by hand — because
// the bug this exists to prevent lives in the wiring, not in either unit.
// (M-T9, one wave ago: a painter wired to nothing left every structural
// assertion green.)
// ===========================================================================

// 26.91-27 (F-23 change b): a TOLERANT lift. `nbSaveFailed` and
// `NB_SAVE_REASON_CAP` do not exist at HEAD, and a hard lift would make this
// whole file THROW there — killing the three controls that must be measured
// GREEN at HEAD before anything is trusted to them. Absent, they contribute
// nothing and the assertions that need them go RED on their own value.
function optFn(name) {
  return appSrc.indexOf('function ' + name + '(') === -1
    ? '' : extractFn(appSrc, name);
}
const NB_SAVE_REASON_CAP = (function () {
  const m = /\n\s*var NB_SAVE_REASON_CAP = (\d+);/.exec(stripComments(appSrc));
  return m ? Number(m[1]) : null;
})();

function loadTwoHistories() {
  const state = {
    LAYOUT: { version: 1, objects: {}, added: [], removed: [], books: {} },
    DECORATIONS: {},
    NB_UNDO: [], NB_REDO: [], DESIGN_UNDO: [], DESIGN_REDO: [],
    posted: [], bodies: [], layoutPosts: [], repaints: [], apiOk: true,
    // 26.91-27: the transport's RESPONSE SHAPE, not merely an ok flag.
    // `apiReason` defaults to ABSENT, so every existing call site — each of
    // which sets only `apiOk` — reads exactly as it read before this wave.
    apiReason: null, deferred: false, micro: [], liveInput: null,
    // and every repaint records WHAT THE FLAG SAID WHEN IT RAN. A count
    // alone cannot tell a repaint that ran BEFORE the failure from one that
    // ran AFTER it, and that difference is the whole of M-25 part 4(ii).
    repaintSaw: []
  };
  const src = NB_HELPERS + '\n' + PEN_DOWN +
    ['postDecorations',
      'decoDay', 'nbSnapshot', 'applyNbSnapshot', 'pushNbUndo', 'doNbUndo',
      'doNbRedo', 'nbGlyphState', 'updateNbButtons', 'clampDecoOrigin',
      'attachPageDrag', 'bringDecoToFront', 'placeFromTray', 'nbClearResetForEdit',
      'designSnapshot', 'pushDesignUndo', 'applyDesignSnapshot',
      'doDesignUndo', 'doDesignRedo', 'updateDesignButtons']
      .map(function (n) { return extractFn(appSrc, n); }).join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function('S', `
    var DECORATIONS = S.DECORATIONS;
    var LAYOUT = S.LAYOUT;
    var NB_UNDO = S.NB_UNDO, NB_REDO = S.NB_REDO;
    var DESIGN_UNDO = S.DESIGN_UNDO, DESIGN_REDO = S.DESIGN_REDO;
    var NB_UNDO_CAP = ${/var NB_UNDO_CAP = (\d+);/.exec(appSrc)[1]};
    var NB_DAY = '08/04/2026';
    var NBDESIGN = true;
    var NB_SEL = null;
    var NB_DAY_KEY = NB_DAY;
    var NB_TEXT_BOX = { w: 72, h: 24 };
    var NB_IMG_BOX = { w: 48, h: 36 };
    var NB_BOUNDS = { x0: 4, x1: 380, y0: 4, y1: 190 };
    // 26.91-10 (A-12): the mark canvas — the RIGHT PAGE. The spread
    // interior above is unchanged; only a mark's origin bound moved.
    var NB_GUTTER_X = 192;
    var NB_MARK_BOUNDS = { x0: 192, x1: 380, y0: 4, y1: 190 };
    var NB_DRAG_THRESHOLD = 3;
    var NB_DECO_CAP = 48;
    var NB_STICKER_H = 24;
    var NB_STICKERS = { 'moon': { x: 120, w: 20 } };
    var NB_PLACE = { itemId: 'abc123', x0: 0 };
    var NB_A_MOD = 360, NB_S_MIN = 0.5, NB_S_MAX = 2.0, NB_S_DEFAULT = 1;
    var DEFAULT_POS = {};
    var NB_REPAINT = function () {
      S.repaints.push(true);
      S.repaintSaw.push(NB_SAVE_FAILED);
    };
    var NB_SAVE_FAILED = false;
    // 26.91-27: NB_SAVE_REASON is declared by NB_HELPERS, with nbSaveFailed
    // and errorText, so no harness can carry one without the others.
    // 26.9-06: the REAL postDecorations over a switchable transport, so
    // "local state is kept on a failed write" is driven through the shipped
    // write path rather than asserted about a stub. A synchronous thenable
    // stands in for the promise so the flag is readable in the same tick.
    function syncP(v) {
      return { then: function (f) { return syncP(f(v)); },
        catch: function () { return syncP(v); } };
    }
    // 26.91-27: A PROMISE THAT RESOLVES ON A LATER TURN, drained by
    // api.flush(). The synchronous thenable above is precisely the
    // instrument that HID M-25 part 4(ii) — it lets the release path's own
    // repaint read a flag the real browser does not raise until one
    // microtask later. Nothing switches to it implicitly: a harness must
    // set S.deferred, so every shipped call site keeps today's ordering.
    function laterP(v) {
      var o = {
        then: function (f) { S.micro.push(function () { f(v); }); return o; },
        catch: function () { return o; }
      };
      return o;
    }
    function apiPost(url, body) {
      S.posted.push(body.day);
      S.bodies.push(JSON.parse(JSON.stringify(body)));
      // 26.91-27: THE REAL apiPost's SHAPE — { ok, status, data }. The
      // shipped errorText reads res.data.error and falls back when there
      // is none, so a response whose data carries no error field behaves
      // EXACTLY as the old one-flag response did.
      var res = { ok: S.apiOk, status: S.apiOk ? 200 : 400,
        data: S.apiReason ? { error: S.apiReason } : {} };
      return S.deferred ? laterP(res) : syncP(res);
    }
    function postLayout() { S.layoutPosts.push(true); }
    function dismissTray() {}
    function openHandTextEditor() {}
    function applyAccessoryState() {}
    function syncSurfacesToLayout() {}
    function renderReflectionSpines() {}
    function syncSeatedZ() {}
    // 26.91-27: the scene resolves to a stub ONLY when a harness has planted
    // a live hand-text input. With none planted this returns null for every
    // id, byte-for-byte the shipped behaviour, so the two existing callers
    // (updateNbButtons, attachPageDrag) take exactly the branch they take
    // today. The stub carries querySelector and NOT querySelectorAll,
    // which is the property updateNbButtons guards on — so even with an
    // input planted it still returns early, as it did before.
    function $(id) {
      if (id !== 'station-scene' || !S.liveInput) { return null; }
      return { querySelector: function (sel) {
        return sel === '.page-deco-input' ? S.liveInput : null; } };
    }
    function getComputedStyle() {
      return { getPropertyValue: function () { return '1'; } };
    }
    ${src}
    return {
      attachPageDrag: attachPageDrag,
      placeFromTray: placeFromTray,
      pushNbUndo: pushNbUndo,
      doNbUndo: doNbUndo, doNbRedo: doNbRedo,
      pushDesignUndo: pushDesignUndo,
      doDesignUndo: doDesignUndo, doDesignRedo: doDesignRedo,
      setDay: function (d) { NB_DAY = d; },
      selection: function () { return NB_SEL; },
      select: function (r) { NB_SEL = r; },
      failed: function () { return NB_SAVE_FAILED; },
      clearFailed: function () { NB_SAVE_FAILED = false; },
      // 26.91-27: the module state the row consumes, read at its own hop.
      reason: function () { return NB_SAVE_REASON; },
      // drain the deferred transport. This is the microtask boundary the
      // browser has and the synchronous thenable does not.
      flush: function () {
        var q = S.micro.slice();
        S.micro.length = 0;
        q.forEach(function (f) { f(); });
      },
      post: postDecorations
    };`)(state);
  api.state = state;
  return api;
}

function nbEl() {
  const on = {};
  return {
    style: { setProperty: function (k, v) { this.__p[k] = v; }, __p: {} },
    addEventListener: function (t, fn) { (on[t] = on[t] || []).push(fn); },
    removeEventListener: function (t, fn) {
      on[t] = (on[t] || []).filter(function (f) { return f !== fn; });
    },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    fire: function (t, ev) {
      (on[t] || []).slice().forEach(function (fn) { fn(ev); });
    }
  };
}

// Drive a REAL move drag of `rec` by (dx, dy) through the REAL attachPageDrag.
function nbDrag(api, rec, dx, dy) {
  const el = nbEl();
  api.attachPageDrag(el, rec);
  el.fire('pointerdown', {
    clientX: 500, clientY: 500, pointerId: 1,
    preventDefault: function () {}, stopPropagation: function () {}
  });
  el.fire('pointermove', { clientX: 500 + dx, clientY: 500 + dy });
  el.fire('pointerup', {});
}

(function () {
  // ---- (1) THE TWO STACKS ARE DISTINCT DECLARATIONS ---------------------
  assert.ok(/\n\s*var NB_UNDO = \[\];/.test(appCode) &&
    /\n\s*var NB_REDO = \[\];/.test(appCode),
    '(9k) the notebook declares its OWN two stacks');
  assert.ok(/\n\s*var DESIGN_UNDO = \[\];/.test(appCode),
    '(9k) and the room keeps its own — the positive control, without ' +
    'which the region check below could pass because neither exists');
  const nbRegion = ['nbSnapshot', 'applyNbSnapshot', 'pushNbUndo', 'doNbUndo',
    'doNbRedo', 'updateNbButtons', 'nbGlyphState', 'nbKeydown',
    'renderNotebookBand'].map(bodyOf).join('\n');
  ['DESIGN_UNDO', 'DESIGN_REDO', 'pushDesignUndo', 'doDesignUndo',
    'doDesignRedo', 'designSnapshot', 'applyDesignSnapshot', 'postLayout',
    'design-undo', 'design-redo'].forEach(function (name) {
    assert.strictEqual(nbRegion.indexOf(name), -1,
      '(9k) the notebook history region must never reach "' + name + '" — ' +
      'a shared stack is exactly the bug D-15 diverged to prevent');
  });
  assert.ok(nbRegion.length > 800,
    '(9k) positive control: the region is real (' + nbRegion.length +
    ' chars of stripped code), so the negatives above are not passing ' +
    'over an empty string');

  // ---- (1b) THE SHARED BINDINGS ARE SAFE BY VERIFICATION ---------------
  //
  // D-15 reuses the room's ⌘Z/⇧⌘Z/⌘Y against a DIFFERENT stack, and the
  // whole safety argument rests on two facts about code that lives
  // elsewhere. 26.9-03's trip-wire holds the second one (setDesign's
  // inverting guard, so DESIGN cannot be truthy while a station is open).
  // THE FIRST ONE WAS HELD BY NOTHING, and a mutation said so: deleting the
  // room design listener's opening early return left the whole suite green
  // while both handlers became live on one keystroke. That is this phase's
  // named defect class, landing in the instrument built to catch it, and it
  // is fixed here rather than described.
  //
  // The listener is anonymous, so it is found by the thing only IT does —
  // the coarse arrow nudge — and then read backwards to its own opening.
  const nudgeAt = appCode.indexOf('nudgeDesignObject(active');
  assert.ok(nudgeAt > 0,
    '(9k) positive control: the room\'s design keydown listener is ' +
    'findable by the arrow nudge only it performs');
  const openAt = appCode.lastIndexOf(
    "document.addEventListener('keydown', function (e) {", nudgeAt);
  assert.ok(openAt > 0 && openAt < nudgeAt,
    '(9k) and it is a document keydown listener');
  const firstStmt = appCode
    .slice(openAt + "document.addEventListener('keydown', function (e) {".length)
    .trim();
  assert.ok(/^if\s*\(\s*!DESIGN\s*\)\s*\{\s*return;/.test(firstStmt),
    '(9k) THE ROOM\'S DESIGN KEYDOWN LISTENER OPENS WITH ITS EARLY RETURN. ' +
    'This is half the reason the notebook may reuse the shipped combos: ' +
    'the room handler DECLINES while room design mode is off, and D-14 ' +
    'keeps it off for the entire time a station is open. Remove this line ' +
    'and both handlers fire on one keystroke and a ⌘Z in the notebook ' +
    'reverts a room drag. Found instead: ' +
    JSON.stringify(firstStmt.slice(0, 60)));
  const nbKey = bodyOf('nbKeydown');
  const nbFirst = nbKey.slice(nbKey.indexOf('{') + 1).trim();
  assert.ok(/^if\s*\(\s*!NBDESIGN\s*\)\s*\{\s*return;/.test(nbFirst),
    '(9k) and the notebook\'s handler opens with the mirror guard — belt ' +
    'to the release-on-exit suspenders in 9a, since a listener that is ' +
    'detached cannot fire and one that is somehow still attached declines');

  // ---- (2) CROSS-CONTAMINATION, BOTH DIRECTIONS, DRIVEN -----------------
  //
  // ONE scope, ONE LAYOUT, ONE DECORATIONS, both histories real. Anything
  // less than this cannot see the bug: two harnesses that each hold only
  // their own state agree by construction.
  const H = loadTwoHistories();
  const st = H.state;

  // the room gets a real act: push, then move an object.
  H.pushDesignUndo();
  st.LAYOUT.objects.lamp = { x: 60, y: 96 };
  const roomAfter = JSON.stringify(st.LAYOUT);

  // the notebook gets a real act, THROUGH THE REAL DRAG — never by calling
  // pushNbUndo by hand, because the seam between the gesture and the stack
  // is where the wiring bug lives.
  // 26.91-10 (A-12): the mark starts INSIDE the mark canvas (x >= 192).
  // At x=100 the clamp now pulls it to the gutter, and this precondition —
  // whose whole job is to prove the real drag moved the record — would have
  // been measuring the clamp instead. The cross-contamination claim below
  // is unchanged; only the fixture moved onto the surface a mark lives on.
  const mark = { page: 'abc123', kind: 'text', x: 200, y: 100, text: '' };
  st.DECORATIONS['08/04/2026'] = { reset: false, items: [mark] };
  nbDrag(H, mark, 40, 0);
  assert.strictEqual(mark.x, 240,
    '(9k) precondition: the real drag actually moved the record');
  assert.strictEqual(st.NB_UNDO.length, 1,
    '(9k) and the real drag pushed onto the NOTEBOOK stack — this is the ' +
    'assertion that crosses the seam between the gesture and the history. ' +
    'Wire the drag to nothing and only this one goes red');
  assert.strictEqual(st.DESIGN_UNDO.length, 1,
    '(9k) while the ROOM stack is still exactly where the room left it — ' +
    'a notebook act never grows the room\'s history');
  const decoAfter = JSON.stringify(st.DECORATIONS);

  // DIRECTION A: a notebook undo must leave the room byte-identical.
  H.doNbUndo();
  assert.strictEqual(JSON.stringify(st.LAYOUT), roomAfter,
    '(9k) DIRECTION A: a ⌘Z struck while arranging a page leaves the ' +
    'ROOM\'S LAYOUT byte-identical. This is the bug D-15 diverged to ' +
    'prevent, and one direction alone would miss half of it');
  assert.strictEqual(st.layoutPosts.length, 0,
    '(9k) and it never posts a room layout either');
  // the positive control: the undo DID undo something
  assert.strictEqual(st.DECORATIONS['08/04/2026'].items[0].x, 200,
    '(9k) POSITIVE CONTROL: the notebook undo put the mark back at 200. ' +
    'Without this, a stack that never pushes passes DIRECTION A trivially ' +
    'by leaving absolutely everything alone');

  // DIRECTION B: a room undo must leave the day's decorations byte-identical.
  const decoBeforeRoomUndo = JSON.stringify(st.DECORATIONS);
  H.doDesignUndo();
  assert.strictEqual(JSON.stringify(st.DECORATIONS), decoBeforeRoomUndo,
    '(9k) DIRECTION B: a ⌘Z struck in the room leaves the DAY\'S ' +
    'DECORATION RECORDS byte-identical');
  assert.deepStrictEqual(st.LAYOUT.objects, {},
    '(9k) POSITIVE CONTROL: the room undo DID undo the room — the lamp is ' +
    'back where it started');
  assert.notStrictEqual(decoAfter, decoBeforeRoomUndo,
    '(9k) and the two decoration snapshots either side of the notebook ' +
    'undo genuinely differ, so DIRECTION B is comparing real state rather ' +
    'than two copies of an empty store');

  // ---- (3) DEPTH: EXACTLY 60, WITH A SHIFT ------------------------------
  const D = loadTwoHistories();
  const ds = D.state;
  ds.DECORATIONS['08/04/2026'] = { reset: false, items: [] };
  for (let i = 1; i <= 60; i++) {
    ds.DECORATIONS['08/04/2026'].items.push({ page: 'p', kind: 'text',
      x: i, y: 4, text: '' });
    D.pushNbUndo();
  }
  assert.strictEqual(ds.NB_UNDO.length, 60,
    '(9k) sixty pushes leave sixty snapshots — asserted AT the ceiling, ' +
    'not merely below it');
  const oldest = ds.NB_UNDO[0];
  D.pushNbUndo();
  assert.strictEqual(ds.NB_UNDO.length, 60,
    '(9k) and the sixty-FIRST does not grow the stack — 60 is a ceiling ' +
    'with a shift, the room\'s own value');
  assert.notStrictEqual(ds.NB_UNDO[0], oldest,
    '(9k) it SHIFTED: the oldest snapshot left the bottom. A cap that ' +
    'refused the new push instead would also hold the length at 60 and ' +
    'would silently stop recording her most recent act');
  assert.strictEqual(ds.NB_UNDO[59], ds.NB_UNDO[ds.NB_UNDO.length - 1],
    '(9k) and the newest is still on top');

  // ---- (4) A NEW ACT AFTER AN UNDO CLEARS REDO --------------------------
  const R = loadTwoHistories();
  const rs = R.state;
  // 26.91-10 (A-12): inside the mark canvas, for the same reason as (2).
  const m2 = { page: 'abc123', kind: 'text', x: 200, y: 100, text: '' };
  rs.DECORATIONS['08/04/2026'] = { reset: false, items: [m2] };
  nbDrag(R, m2, 40, 0);
  R.doNbUndo();
  assert.strictEqual(rs.NB_REDO.length, 1,
    '(9k) an undo fills redo — the positive control for the clear below');
  R.doNbRedo();
  assert.strictEqual(rs.NB_REDO.length, 0,
    '(9k) and a redo drains it');
  assert.strictEqual(rs.DECORATIONS['08/04/2026'].items[0].x, 240,
    '(9k) REDO RESTORES THE EXACT PRIOR SNAPSHOT — asserted by the stored ' +
    'value, not by "redo is enabled"');
  R.doNbUndo();
  assert.strictEqual(rs.NB_REDO.length, 1,
    '(9k) undone again, redo refilled');
  // now a NEW act
  const m3 = rs.DECORATIONS['08/04/2026'].items[0];
  nbDrag(R, m3, 8, 0);
  assert.strictEqual(rs.NB_REDO.length, 0,
    '(9k) A NEW ACT AFTER AN UNDO CLEARS REDO, asserted by the redo ' +
    'DEPTH going to 0 rather than by "the glyph is disabled" — a glyph ' +
    'that is disabled for the wrong reason reads identically');

  // ---- (5) THE SNAPSHOT CARRIES THE RESET FLAG --------------------------
  // This is what makes the day reset itself undoable, and it is asserted
  // here rather than described, because a snapshot of `items` alone would
  // pass every assertion above and silently make the reset one-way.
  const F = loadTwoHistories();
  const fs2 = F.state;
  fs2.DECORATIONS['08/04/2026'] = { reset: false, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'hers' }] };
  F.pushNbUndo();
  fs2.DECORATIONS['08/04/2026'].reset = true;
  F.doNbUndo();
  assert.strictEqual(fs2.DECORATIONS['08/04/2026'].reset, false,
    '(9k) undoing a reset puts the flag back down — the direction that ' +
    'makes the day reset itself undoable');
  assert.strictEqual(fs2.DECORATIONS['08/04/2026'].items.length, 1,
    '(9k) and the records came back with it');

  // THE OTHER DIRECTION, AND IT IS THE ONE THAT ACTUALLY MEASURES THE
  // SNAPSHOT. Found by a mutation, not by reading: dropping `reset` from
  // nbSnapshot left the case above GREEN, because applyNbSnapshot reads
  // `!!rec.reset` and a missing field is already false — the restore's own
  // default was answering the question the snapshot was supposed to answer.
  // Starting from reset TRUE removes that shadow: a snapshot that carries
  // no flag restores false and fails here. (M-U6 / M-U6′.)
  const fs3 = F.state;
  fs3.DECORATIONS['08/04/2026'] = { reset: true, items: [
    { page: 'abc123', kind: 'text', x: 10, y: 10, text: 'hers' }] };
  F.pushNbUndo();
  fs3.DECORATIONS['08/04/2026'].reset = false;
  F.doNbUndo();
  assert.strictEqual(fs3.DECORATIONS['08/04/2026'].reset, true,
    '(9k) THE SNAPSHOT CARRIES THE `reset` FLAG, not the items alone. ' +
    'Asserted from a TRUE pre-state on purpose: from a false one, ' +
    'applyNbSnapshot\'s own `!!rec.reset` default supplies the expected ' +
    'answer and a snapshot that dropped the field would pass');
})();

// ---- 9k(b): the glyphs as painted — DISABLED, never HIDDEN ---------------

// 26.91-03: the fake node factory, lifted out of paintBand so the spread
// harness below can paint into nodes of the SAME shape. It is the identical
// object it has always been — extracted, not rewritten — because two
// harnesses comparing nodes of two different shapes would be comparing the
// harnesses rather than the painters.
function nbNodeDoc() {
  return {
    createElement: function (t) {
      const n = { tag: t, cls: '', attrs: {}, text: '', __on: {}, kids: [],
        style: { setProperty: function (k, v) { this.__p[k] = v; },
          __p: {} },
        addEventListener: function (t2, fn) {
          (this.__on[t2] = this.__on[t2] || []).push(fn);
        },
        appendChild: function (c) { this.kids.push(c); },
        setAttribute: function (k, v) { this.attrs[k] = v; } };
      // 26.91-13 (D-1): `classList`, backed by the node's real class string.
      //
      // Added so a node can survive a REPAINT, not for cosmetics.
      // `paintNotebookSpread` clears the scene with
      // `if (!el.classList.contains('station-bg')) scene.removeChild(el)`.
      // Without this property the FIRST paint worked (an empty scene never
      // enters that loop) and every SECOND paint threw — so no group could
      // drive a click handler that repaints, which is every navigation
      // control in the notebook. G-D1's executed tap is the first assertion
      // that needs one. This is an ADDITION to the stub's fidelity; nothing
      // reads `classList` in this file today, so no existing gate is
      // loosened by it.
      Object.defineProperty(n, 'classList', {
        get: function () {
          const self = this;
          return {
            contains: function (c) {
              return String(self.cls).split(/\s+/).indexOf(c) !== -1;
            },
            add: function (c) {
              if (String(self.cls).split(/\s+/).indexOf(c) === -1) {
                self.cls = (self.cls ? self.cls + ' ' : '') + c;
              }
            },
            remove: function (c) {
              self.cls = String(self.cls).split(/\s+/).filter(
                function (x) { return x && x !== c; }).join(' ');
            }
          };
        }
      });
      Object.defineProperty(n, 'className', {
        get: function () { return this.cls; },
        set: function (v) { this.cls = v; } });
      Object.defineProperty(n, 'textContent', {
        get: function () { return this.text; },
        set: function (v) { this.text = v; } });
      return n;
    }
  };
}

// 26.91-27: `reason` is the FIFTH parameter and it DEFAULTS TO ABSENT, so
// all four existing call sites are untouched and read exactly as they read
// before this wave. It carries the server's own refusal text to the row.
function paintBand(undoDepth, redoDepth, armed, failed, reason) {
  const nodes = [];
  const doc = nbNodeDoc();
  // 26.91-38 (D-13): THE SCENE ANSWERS `querySelectorAll` FOR REAL, over the
  // nodes it has actually been given. The band's refusal fallback asks the
  // scene how many `.page-deco-region` nodes are already on it, and a harness
  // that answered a constant [] would make that guard untestable here — the
  // fallback would fire on every refusal regardless of what the pages drew,
  // and the "does not double an existing region" row would be measuring the
  // harness. This rig paints the BAND ALONE, so the answer is genuinely zero
  // and the fallback genuinely fires; `g31Rig` is where a page and the band
  // share one scene and the non-zero branch is driven.
  const scene = { appendChild: function (n) { nodes.push(n); },
    querySelectorAll: function (sel) {
      const want = String(sel).replace(/^\./, '');
      return nodes.filter(function (n) {
        return String(n.cls || '').split(/\s+/).indexOf(want) !== -1;
      });
    } };
  const undone = [];
  const log = [];
  // 26.9-07: the band paints the pen glyph, so this harness states the pen's
  // pre-state too — and stubs the toggle, because this group is about the
  // band's SLOTS and 9n is where the toggle's behaviour is driven. Without
  // the explicit declaration `renderNotebookBand`'s read of NB_PEN would
  // reach a leaked global (see PEN_DOWN).
  // 26.91-02: and the band paints the `write` toggle too, so its setter is
  // stubbed the same way — but RECORDING, so 9o can drive the click and see
  // the argument rather than merely observing that nothing threw.
  const toggled = [];
  // 26.91-38: NB_REGION_SRC joins the window because renderNotebookBand now
  // reaches nbPaintMarkRegion on the refusal path. Lifted as REAL SOURCE, so
  // the box this rig counts is the box the app draws.
  const src = PEN_DOWN + NB_REGION_SRC + 'var setNotebookPen = function (v) ' +
    '{ __toggled.push(["pen", v]); };\n' +
    'var setNotebookWrite = function (v) ' +
    '{ __toggled.push(["write", v]); };\n' +
    [extractFn(appSrc, 'nbGlyphState'),
      extractFn(appSrc, 'renderNotebookBand'),
      // 26.91-03: THE TIN'S PAINTER JOINS THE WINDOW.
      //
      // G-C1 is the findability gate and `marks` is the single most
      // important label in the phase — the tin is the control the owner
      // could not find at all (F-6). Without lifting renderTinTray the
      // gate would measure every band control EXCEPT the one the phase
      // exists for. It is lifted as REAL SOURCE by extractFn exactly as
      // renderNotebookBand is; its class name and its label are never
      // re-typed here.
      extractFn(appSrc, 'renderTinTray')].join('\n');
  // NB_BAND and NB_RESET_COPY are lifted as REAL SOURCE, never re-typed here
  // — a hand-copied slot table or a hand-copied string in the harness would
  // be the harness agreeing with itself.
  // eslint-disable-next-line no-new-func
  const fn = new Function('document', 'NBDESIGN', 'NB_BAND', 'NB_UNDO',
    'NB_REDO', 'doNbUndo', 'doNbRedo', 'NB_RESET_ARMED', 'NB_RESET_COPY',
    'NB_REPAINT', 'nbResetDay', 'NB_DAY', 'NB_SAVE_FAILED',
    // 26.91-38: DECORATIONS is DECLARED, on PEN_DOWN's own stated reason —
    // a `new Function` body is sloppy mode, so an un-injected name is
    // answered by whatever global some earlier harness happened to create.
    // The band did not read it before this wave and does not read it now,
    // and that is exactly why it is declared: a future edit that reaches for
    // the day record from the band must fail on the RECORD BEING EMPTY here,
    // not on a leaked global from a harness three thousand lines up. It is
    // also what let the reset-flag mutation of this plan be driven as a
    // mutation rather than as a ReferenceError.
    'DECORATIONS',
    'postDecorations', 'nbDisarmReset', '__toggled',
    // 26.91-03: the tin's three module-scope reads are DECLARED as
    // parameters, exactly the way PEN_DOWN declares the pen's pre-state and
    // for the same measured reason: a `new Function` body is sloppy mode,
    // so an un-injected name is answered by whatever global some earlier
    // harness happened to create. NB_TIN_OPEN is `false` on purpose — the
    // painter then appends the tin and RETURNS before building the tray, so
    // this window holds the tin itself and nothing else.
    'NB_TIN', 'NB_TIN_OPEN', 'NB_TIN_TAB',
    // 26.91-27: the reason and its cap, both DECLARED as parameters for the
    // reason PEN_DOWN's own comment gives — a `new Function` body is sloppy
    // mode, so an un-injected name is answered by whatever global some
    // earlier harness happened to create. The cap is LIFTED from app.js,
    // never re-typed, so a harness cannot agree with itself about it.
    'NB_SAVE_REASON', 'NB_SAVE_REASON_CAP',
    src + '\nreturn { render: renderNotebookBand, ' +
    'renderTin: renderTinTray, ' +
    'tinOpen: function () { return NB_TIN_OPEN; }, ' +
    'armed: function () { return NB_RESET_ARMED; }, ' +
    'reason: function () { return NB_SAVE_REASON; }, ' +
    'failed: function () { return NB_SAVE_FAILED; } };')(
    doc, true, NB_SRC_CONSTS.NB_BAND,
    new Array(undoDepth).fill('s'), new Array(redoDepth).fill('s'),
    function () { undone.push('undo'); }, function () { undone.push('redo'); },
    !!armed, NB_SRC_CONSTS.NB_RESET_COPY,
    function () { log.push('repaint'); },
    function (d) { log.push('reset:' + d); }, '08/04/2026', !!failed,
    {},
    function (d) { log.push('post:' + d); },
    // 26.9 F-13: declining now routes through one shared function, so the
    // harness records the CALL rather than re-implementing the disarm.
    function () { log.push('disarm'); return true; }, toggled,
    NB_SRC_CONSTS.NB_TIN, false, 'marks',
    reason === undefined ? null : reason, NB_SAVE_REASON_CAP);
  fn.render(scene);
  // The tin paints into its OWN collection rather than into `nodes`. Every
  // shipped assertion in 9k(b)/9m/9o is written against the band painter's
  // node list, and quietly growing that list by one would move assertions
  // onto a control they were never about. G-C1 takes the union explicitly.
  const tinNodes = [];
  fn.renderTin({ appendChild: function (n) { tinNodes.push(n); } }, [], {});
  return { nodes: nodes, tinNodes: tinNodes, undone: undone, log: log,
    armed: fn.armed, failed: fn.failed, reason: fn.reason, toggled: toggled };
}

const glyphsOf = function (r) {
  return r.nodes.filter(function (n) { return n.attrs['data-nb-stack']; });
};

(function () {
  const empty = paintBand(0, 0);
  const filled = paintBand(2, 1);

  assert.strictEqual(glyphsOf(empty).length, 2,
    '(9k) the band paints EXACTLY TWO glyphs on an empty history — ' +
    'asserted by number, because "at least one" is passed by a painter ' +
    'that renders only undo');
  assert.strictEqual(empty.nodes.length, filled.nodes.length,
    '(9k) DISABLED, NOT HIDDEN: the band\'s TOTAL control count is ' +
    'identical between the empty and the non-empty state. A hidden glyph ' +
    'satisfies "not enabled" and reflows the row');

  const slotsOf = function (r) {
    return r.nodes.map(function (n) {
      return [n.attrs['data-nb-stack'] || n.cls, n.style.__p['--x'],
        n.style.__p['--y'], n.style.__p['--w'], n.style.__p['--h']];
    });
  };
  assert.deepStrictEqual(slotsOf(empty), slotsOf(filled),
    '(9k) AND EVERY SLOT IS IDENTICAL BETWEEN THE TWO STATES. This is the ' +
    'load-bearing half: the band is where the reset and the exit rows ' +
    'live, and a row that reflows as history accrues moves those two ' +
    'targets under her finger at exactly the moment she is reaching for ' +
    'them');
  assert.deepStrictEqual(slotsOf(empty).slice(0, 2), [
    ['undo', '64', '196', '28', '16'],
    ['redo', '96', '196', '28', '16']
  ], '(9k) at the UI-SPEC slots, by value. 26.91-02 moved both: 16 -> 28 ' +
     'wide, because they carry the WORDS `undo` and `redo` now instead of ' +
     'the arrow glyphs. This pin is a SECOND, INDEPENDENT copy of the ' +
     'geometry on purpose — 9m pins the NB_BAND table, this pins what the ' +
     'painter actually wrote onto the node, and a table the painter ' +
     'ignores is worse than no table');

  // the disabled treatment itself
  assert.deepStrictEqual(glyphsOf(empty).map(function (n) {
    return n.attrs['data-nb-off'];
  }), ['1', '1'],
    '(9k) both glyphs are disabled on a fresh history');
  glyphsOf(empty).forEach(function (n) {
    assert.ok(/station-nb-off/.test(n.cls),
      '(9k) and wear the disabled class');
  });
  assert.deepStrictEqual(glyphsOf(filled).map(function (n) {
    return n.attrs['data-nb-off'];
  }), ['0', '0'],
    '(9k) and BOTH are live once each stack holds something — the ' +
    'positive half, without which "always disabled" passes');
  const half = paintBand(2, 0);
  assert.deepStrictEqual(glyphsOf(half).map(function (n) {
    return n.attrs['data-nb-off'];
  }), ['0', '1'],
    '(9k) each glyph reads ITS OWN stack: undo live, redo still disabled. ' +
    'A single shared flag passes both cases above and fails only here');

  // aria + the glyph faces
  assert.deepStrictEqual(glyphsOf(empty).map(function (n) {
    return n.attrs['aria-label'];
  }), ['undo', 'redo'], '(9k) named for a screen reader');
  assert.deepStrictEqual(glyphsOf(empty).map(function (n) { return n.text; }),
    ['undo', 'redo'],
    '(9k) THE PINNED LABELS. This assertion pinned the glyph faces ' +
    "['↺', '↻'] until 26.91-02 and is REWRITTEN rather than " +
    'deleted, because the behaviour it guards did not go away — it ' +
    'changed. The owner could not find these two controls; the arrows were ' +
    'the reason. The visible text now EQUALS the aria-label asserted ' +
    'directly above, which is the property that makes the pair meaningful: ' +
    'an accessible name that disagrees with the visible one is the ' +
    'degenerate form of "this control is named"');

  // they are WIRED, and to the notebook's own functions
  glyphsOf(filled)[0].__on.click[0]();
  glyphsOf(filled)[1].__on.click[0]();
  assert.deepStrictEqual(filled.undone, ['undo', 'redo'],
    '(9k) and each glyph is actually wired to its own action — a painted ' +
    'control wired to nothing left every structural assertion green one ' +
    'wave ago (M-T9), so the wiring is driven rather than read');

  // ---- THE 700 WEIGHT STAYS AT ONE USER -------------------------------
  const rawCss = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const startMark = "26.9-03 THE NOTEBOOK'S DESIGN MODE (SRM-14-EXT-EDITOR)";
  const endMark = "26.9-03 THE NOTEBOOK'S DESIGN MODE (end)";
  const s0 = rawCss.lastIndexOf('/*', rawCss.indexOf(startMark));
  const s1 = rawCss.indexOf('*/', rawCss.indexOf(endMark)) + 2;
  const phaseCss = rawCss.slice(s0, s1).replace(/\/\*[\s\S]*?\*\//g, '');
  const heavy = phaseCss.match(
    /(?:font-weight\s*:\s*|font\s*:\s*(?:italic\s+)?)(?:700|bold)/g) || [];
  assert.strictEqual(heavy.length, 0,
    '(9k) this phase\'s CSS surface introduces ZERO users of the 700 ' +
    'weight — an EQUALITY, so a second one cannot appear silently. The ' +
    'UI-SPEC closes the weight at exactly one class and the new glyphs ' +
    'reuse it rather than restating it. Found: ' + JSON.stringify(heavy));
  const wholeCss = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.station-flip\s*\{[^}]*font:\s*700\s/.test(wholeCss),
    '(9k) POSITIVE CONTROL: .station-flip — the one class — really does ' +
    'declare 700, so the zero above is a zero over a real rule and not ' +
    'over a weight nobody uses');
  // ---- 26.91-02: THE 700 WEIGHT LOSES ITS BAND USERS ENTIRELY ---------
  //
  // REWRITTEN, NOT DELETED. This asserted that nbGlyphState wears
  // `.station-flip`, which was the right guard while undo/redo were GLYPHS:
  // reusing the shipped class is what kept the 700 weight at one declaring
  // rule. They are WORDS now and joined the band's one type register, so
  // wearing .station-flip would put a 700-weight 10px face on a 6px/400
  // band row — the guard's own goal, inverted. The replacement asserts the
  // same underlying contract (ONE type register in the band) from the other
  // side.
  assert.ok(bodyOf('nbGlyphState').indexOf('station-caption-add') !== -1 &&
    bodyOf('nbGlyphState').indexOf('station-nb-row') !== -1,
    '(9k) undo/redo wear the band\'s ONE type register ' +
    '(`.station-caption-add.station-nb-row`) — the same class the reset ' +
    'and arrange rows already wore, so the band has one face and not four');
  assert.strictEqual(bodyOf('nbGlyphState').indexOf('station-flip'), -1,
    '(9k) and they NO LONGER wear .station-flip: a 700-weight 10px glyph ' +
    'face on a 6px/400 word row is exactly the mixed-register look F-12 ' +
    'and F-13 were about');
  const bandBody = bodyOf('renderNotebookBand');
  assert.strictEqual((bandBody.match(/station-flip/g) || []).length, 0,
    '(9k) AND THE WHOLE BAND PAINTER IS FREE OF IT — asserted over the ' +
    'painter, not just over nbGlyphState, because the pen set its className ' +
    'inline and would not have been caught by the helper check alone');
  // THE POSITIVE HALF: the weight still has its user, and it is the pair
  // the owner deliberately did NOT flag. Without this, deleting
  // .station-flip everywhere satisfies the two zeroes above just as well.
  //
  // SCOPED TO THE NOTEBOOK'S OWN PAINTER, and that scoping is the whole
  // assertion. Written first against `appCode` (the whole file), it was
  // VACUOUS: multiple painters declare a prev/next pair the same way, so
  // stripping .station-flip off the NOTEBOOK's pair still matched another
  // painter's and the suite stayed green. Driven and confirmed as mutation
  // M-L. (26.91-04 prose correction: the sibling painters were named as
  // three — paintAlbumSpread, paintJournalPage, paintNotebookSpread — and
  // D-06 retired paintJournalPage, so there are two. The SCOPING argument is
  // unchanged and does not depend on how many siblings there happen to be;
  // the count is corrected rather than left as a stale stated fact.)
  // A positive control that can be satisfied by a DIFFERENT subsystem is
  // this project's named defect class landing inside the instrument again.
  const spreadSrc = bodyOf('paintNotebookSpread');
  assert.strictEqual(
    (spreadSrc.match(/className = 'station-fixture station-flip'/g) || [])
      .length, 2,
    '(9k) POSITIVE CONTROL, scoped to paintNotebookSpread: EXACTLY TWO ' +
    'controls in the notebook scene still wear .station-flip, and they are ' +
    'the page flips prev/next. They are the exemption — the shipped ' +
    'reason, quoted: "the page-turn arrows the owner did NOT flag keep ' +
    'their shipped bare treatment". Pinned at 2 BY VALUE in both ' +
    'directions: at 1 or 0 the 700 weight was deleted rather than kept ' +
    '(an unforced change to a control she never flagged), and at 3+ the ' +
    'exemption GREW — which is how a findability gate gets satisfied by ' +
    'excusing a control instead of naming it');

  // the arranging row moved to the band's EXIT slot
  const spread = bodyOf('paintNotebookSpread');
  assert.ok(/place\(arrange,\s*NBDESIGN \? NB_BAND\.exit : NB_BAND\.entry\)/
    .test(spread),
    '(9k) the mode row sits at the band\'s exit slot while arranging and ' +
    'at the entry slot while reading — the entry slot (140-244) overlaps ' +
    'BOTH the reset row (128-204) and the exit row (212-288), so one slot ' +
    'for both modes stops being possible the moment the arranging ' +
    'controls exist beside it. 26.91-02 NARROWED that overlap from 60 px ' +
    'to 32 px as a side effect of the re-lay, which is the one thing about ' +
    'the jump that got better: a finger resting inside the overlap hits ' +
    '`arrange this day` in one mode and `done arranging` in the other');
})();

// ===========================================================================
// ---- 9l: 26.9-06 — PUT THIS DAY BACK (D-15, A-3) --------------------------
//
// THE DEGENERATE THIS GROUP IS BUILT AGAINST, said in advance and in three
// parts, because each one passes a different wrong implementation:
//
//   1. RESETTING AN ALREADY-AUTO PAGE proves nothing — the page was already
//      the thing the reset restores. Step (c) below is the whole answer: the
//      fixture asserts the decorated page DIFFERS from the auto page before
//      it resets anything. Without (c) the fixture measures nothing at all.
//   2. A SINGLE-PAGE DAY proves nothing about a DAY-scoped gesture — clearing
//      "the page" and clearing "the day" are indistinguishable on a day with
//      one page. Every fixture here uses a day with TWO decorated pages.
//   3. A DELETE IMPLEMENTATION passes the auto-render half perfectly. Only
//      the records-still-present half tells a flag from a delete, and only
//      the undo-after-reset case says why that matters.
//
// The whole scope is ONE scope — the reset, the history, the placement path
// and the real page painter over one DECORATIONS — because everything this
// group claims is about how those four meet.
// ===========================================================================

function loadResetScope() {
  const state = { DECORATIONS: {}, NB_UNDO: [], NB_REDO: [], posted: [] };
  const src = [
    extractFn(appSrc, 'placeNotebookInert'),
    extractFn(appSrc, 'mulberry32'),
    extractFn(appSrc, 'blessingSeed'),
    extractFn(appSrc, 'pickBlessingDecoration'),
    NB_HELPERS,
    extractFn(appSrc, 'decoDay'),
    extractFn(appSrc, 'nbSnapshot'),
    extractFn(appSrc, 'applyNbSnapshot'),
    extractFn(appSrc, 'pushNbUndo'),
    extractFn(appSrc, 'doNbUndo'),
    extractFn(appSrc, 'doNbRedo'),
    extractFn(appSrc, 'updateNbButtons'),
    extractFn(appSrc, 'nbGlyphState'),
    extractFn(appSrc, 'nbResetDay'),
    // 26.9 F-9: the shared reset-flag clear both edit paths now route through.
    extractFn(appSrc, 'nbClearResetForEdit'),
    NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin'),
    PEN_DOWN + extractFn(appSrc, 'attachPageDrag'),
    extractFn(appSrc, 'bringDecoToFront'),
    extractFn(appSrc, 'placeFromTray'),
    extractFn(appSrc, 'nbClearResetForEdit'),
    // 26.9-09: the REAL promotion helpers, never stubs (see 9j(b)).
    extractFn(appSrc, 'livePagePhoto'),
    extractFn(appSrc, 'ensurePagePhoto'),
    extractFn(appSrc, 'paintDecoHandles'),
    DECO_PAINTER_SRC,
    extractFn(appSrc, 'paintBlessingPage')
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function('S', 'GEOM', 'mkdoc', `
    var DECORATIONS = S.DECORATIONS;
    var NB_UNDO = S.NB_UNDO, NB_REDO = S.NB_REDO;
    var NB_UNDO_CAP = ${/var NB_UNDO_CAP = (\d+);/.exec(appSrc)[1]};
    var STATION_NOTEBOOK_GEOM = GEOM;
    var NB_DAY = '08/04/2026';
    var NBDESIGN = true;
    var NB_SEL = null;
    var NB_TEXT_BOX = { w: 72, h: 24 };
    var NB_IMG_BOX = { w: 48, h: 36 };
    var NB_BOUNDS = { x0: 4, x1: 380, y0: 4, y1: 190 };
    // 26.91-10 (A-12): the mark canvas — the RIGHT PAGE. The spread
    // interior above is unchanged; only a mark's origin bound moved.
    var NB_GUTTER_X = 192;
    var NB_MARK_BOUNDS = { x0: 192, x1: 380, y0: 4, y1: 190 };
    var NB_DRAG_THRESHOLD = 3, NB_DECO_CAP = 48;
    var NB_STICKER_H = 24, NB_SHEET_W = 316, NB_TIN_OPEN = false;
    var NB_STICKERS = { 'moon': { x: 120, w: 20 },
      'ticket': { x: 88, w: 32 } };
    var NB_PLACE = null;
    var NOTEBOOK_CAPTION_LINE_PX = 7 * 1.3;
    var NB_A_MOD = 360, NB_S_MIN = 0.5, NB_S_MAX = 2.0, NB_S_DEFAULT = 1;
    var NB_REPAINT = null;
    var __scene = null;
    function postDecorations(d) { S.posted.push(d); }
    function dismissTray() {}
    function openHandTextEditor() {}
    function openContainerItem() {}
    function recordIncident() {}
    function paintStickerCrop(el, name) {
      el.style.setProperty('--sprite', name);
      return !!NB_STICKERS[name];
    }
    function escapeAttr(s) { return s; }
    function $() { return __scene; }
    function getComputedStyle() {
      return { getPropertyValue: function () { return '1'; } };
    }
    ${src}
    return {
      paint: function (entry, side) {
        var built = mkdoc();
        __scene = built.scene;
        document = built.doc;
        paintBlessingPage(built.scene, entry, side, {}, [],
          function () { return null; });
        return built.nodes;
      },
      place: function (itemId, x0, seed) {
        NB_PLACE = { itemId: itemId, x0: x0 };
        placeFromTray(seed);
      },
      autoMark: function (itemId, ms) {
        return pickBlessingDecoration(itemId, ms);
      },
      resetDay: nbResetDay,
      undo: doNbUndo,
      redo: doNbRedo
    };`)(state, {
    pageX: { left: 18, right: 202 },
    date: { dx: 8, y: 24, w: 144, h: 10 },
    title: { dx: 8, y: 38, w: 144, h: 20 },
    photo: { dx: 44, y: 62, w: 72, h: 54 },
    whyImage: { dx: 8, y: 122, w: 144, h: 46 },
    whyText: { dx: 8, y: 62, w: 144, h: 108 },
    deco: { tr: { dx: 132, y: 8 }, bl: { dx: 8, y: 178 } }
  }, function () {
    const nodes = [];
    const doc = {
      createElement: function (t) {
        const n = { tag: t, cls: '', attrs: {}, text: '', kids: [], __on: {},
          style: { setProperty: function (k, v) { this.__p[k] = v; },
            __p: {} },
          addEventListener: function () {}, removeEventListener: function () {},
          setPointerCapture: function () {},
          releasePointerCapture: function () {},
          appendChild: function (c) { this.kids.push(c); },
          getBoundingClientRect: function () { return { left: 0, top: 0 }; } };
        Object.defineProperty(n, 'className', {
          get: function () { return this.cls; },
          set: function (v) { this.cls = v; } });
        Object.defineProperty(n, 'textContent', {
          get: function () { return this.text; },
          set: function (v) { this.text = v; } });
        Object.defineProperty(n, 'innerHTML', {
          get: function () { return this.__html || ''; },
          set: function (v) { this.__html = v; } });
        n.setAttribute = function (k, v) { this.attrs[k] = v; };
        return n;
      }
    };
    const scene = {
      appendChild: function (n) { nodes.push(n); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getBoundingClientRect: function () { return { left: 0, top: 0 }; }
    };
    return { doc: doc, scene: scene, nodes: nodes };
  });
  api.state = state;
  return api;
}

// A rendered page, as a comparable signature. Everything the painter put on
// the page, in order, with its slot — so "the page came back" is a byte
// comparison rather than a node count.
function pageSig(nodes) {
  return nodes.map(function (n) {
    return [n.cls, n.text, n.style.__p['--x'], n.style.__p['--y'],
      n.style.__p['--w'], n.style.__p['--h'], n.style.__p['--sprite'],
      n.style.__p['--i'], n.style.left, n.style.top].join('|');
  });
}

// The same signature WITHOUT the placement canvas.
//
// RAISED, NOT SILENTLY ABSORBED. A reset day and a never-decorated day are
// byte-identical in every painted element EXCEPT one: 26.9-03 returns from
// paintPageDecorations before the canvas is created on a reset day, so the
// reset page carries no placement surface and no inset hairline. That is a
// SHIPPED, DELIBERATE choice with its own assertion in 9e ("there is
// nothing to arrange until the reset is undone"), so this plan does not
// change it — but the difference is real, it is the one place where "put
// this day back" does not land on exactly the page the room composed, and
// pretending otherwise by comparing loosely is how a check stops measuring.
// The comparison below is therefore explicit about what it excludes, and
// the exclusion is asserted BY COUNT immediately after so it cannot quietly
// grow to cover a second difference.
//
// 26.91-30 (F-26) WIDENS THE EXCLUSION BY EXACTLY ONE NODE, AND SAYS SO
// RATHER THAN LOOSENING THE COMPARISON. `.page-deco-region` is the second
// member of the SAME layer: it is created inside paintPageDecorations AFTER
// the very early return the paragraph above describes, so a reset day paints
// neither it nor the canvas, for one reason rather than two. This tripwire
// FIRED when the region landed — which is what it is for — and it is
// answered the way it asks to be answered: the filter names the second class
// explicitly and `regionCount` joins `canvasCount` at every pin site, so the
// exclusion is still exactly bounded and a THIRD omission would fail here.
function pageSigNoCanvas(nodes) {
  return pageSig(nodes.filter(function (n) {
    return !/page-deco-(canvas|region)/.test(String(n.cls));
  }));
}
function canvasCount(nodes) {
  return nodes.filter(function (n) {
    return /page-deco-canvas/.test(String(n.cls));
  }).length;
}
function regionCount(nodes) {
  return nodes.filter(function (n) {
    return /page-deco-region/.test(String(n.cls));
  }).length;
}

(function () {
  const DAY = '08/04/2026';
  const MS = 1754300000000;
  const pageA = { itemId: 'abc123', dayLabel: DAY, title: 'a walk',
    why: 'because you were laughing.', author: 'you', isImage: false,
    ms: MS };
  // TWO DECORATED PAGES ON ONE DAY. A single-page day is the degenerate
  // fixture for a DAY-scoped gesture and does not satisfy anything here.
  const pageB = { itemId: 'def456', dayLabel: DAY, title: 'the window',
    why: 'the light was good.', author: 'you', isImage: false,
    ms: MS + 3600000 };

  const R = loadResetScope();
  const st = R.state;

  // ---- STEP (a): THE AUTO COMPOSITION, BEFORE SHE TOUCHES IT ------------
  const autoNodesA = R.paint(pageA, 'left');
  const autoNodesB = R.paint(pageB, 'right');
  const autoA = pageSig(autoNodesA);
  const autoB = pageSig(autoNodesB);
  const autoMarkA = R.autoMark('abc123', MS);
  assert.ok(autoA.length >= 4 && autoB.length >= 4,
    '(9l) positive control: both auto pages painted real nodes (' +
    autoA.length + ', ' + autoB.length + ')');
  assert.ok(['stamp', 'washi', 'candle'].indexOf(autoMarkA.mark) !== -1,
    '(9l) and the page carries one of the three seeded marks: ' +
    autoMarkA.mark);

  // ---- STEP (b): DECORATE BOTH PAGES, THROUGH THE REAL PLACEMENT PATH ---
  R.place('abc123', 0, { kind: 'sticker', sprite: 'moon' });
  R.place('def456', 192, { kind: 'sticker', sprite: 'ticket' });
  assert.strictEqual(st.DECORATIONS[DAY].items.length, 2,
    '(9l) the day now carries two marks, one per page');
  const decoA = pageSig(R.paint(pageA, 'left'));
  const decoB = pageSig(R.paint(pageB, 'right'));

  // ---- STEP (c): THE MUTATION-FIRED CHECK ------------------------------
  //
  // WITHOUT THIS STEP THE WHOLE FIXTURE IS VACUOUS. A test that resets a
  // page which was already auto-composed passes for every implementation,
  // including one that does nothing at all. This is the step the postmortem
  // says was missing, and it is named so nobody removes it as redundant.
  assert.notDeepStrictEqual(decoA, autoA,
    '(9l) STEP (c): page A genuinely DIFFERS from its auto composition ' +
    'before anything is reset. Delete this assertion and every one below ' +
    'is satisfied by a reset that does nothing');
  assert.notDeepStrictEqual(decoB, autoB,
    '(9l) STEP (c): and so does page B — the second page of the same day, ' +
    'which is what makes the day-scope claim below decidable');
  assert.notStrictEqual(st.DECORATIONS[DAY].items[0].sprite,
    autoMarkA.mark,
    '(9l) STEP (c), the mark half: the sprite she placed is a DIFFERENT ' +
    'mark from the one the room seeded onto the page');

  // ---- STEP (d): RESET ---------------------------------------------------
  const beforeCount = st.DECORATIONS[DAY].items.length;
  R.resetDay(DAY);

  // ---- STEP (e): EQUALITY WITH (a), ON EVERY PAGE OF THE DAY ------------
  const resetNodesA = R.paint(pageA, 'left');
  const resetNodesB = R.paint(pageB, 'right');
  assert.deepStrictEqual(pageSigNoCanvas(resetNodesA),
    pageSigNoCanvas(autoNodesA),
    '(9l) STEP (e): page A is byte-for-byte the page the room composed — ' +
    'every element, its slot, its text and its draw order');
  assert.deepStrictEqual(pageSigNoCanvas(resetNodesB),
    pageSigNoCanvas(autoNodesB),
    '(9l) STEP (e): AND SO IS PAGE B. The gesture is the DAY, not the page ' +
    'she happens to be looking at — asserted over a day with two decorated ' +
    'pages, because on a one-page day "clear the page" and "clear the day" ' +
    'are the same thing');
  // and the ONE excluded difference, pinned by count so the exclusion above
  // cannot quietly grow to cover a second one
  assert.deepStrictEqual(
    [canvasCount(autoNodesA), canvasCount(resetNodesA)], [1, 0],
    '(9l) THE ONE DIFFERENCE, NAMED: an undecorated day paints the ' +
    'placement canvas and a reset day does not (26.9-03\'s early return, ' +
    'asserted in 9e as a deliberate choice). This plan does not change ' +
    'that, but it refuses to hide it inside a loose comparison — the ' +
    'exclusion is exactly one node and this is what says so');
  // 26.91-30 (F-26): the SECOND member of the same layer, pinned the same
  // way. Page B is the RIGHT page, which is the only page a mark may live on
  // (A-12) and therefore the only page that carries the drawn region.
  //
  // ---- DISPOSITION 2026-08-11 (26.91-38, D-13) — RE-KEYED, NOT DELETED ---
  //
  // THE VALUE IS UNCHANGED AND THE GROUP ID IS UNCHANGED. What moved is what
  // the pair MEANS, and saying so here is the point of the clause.
  //
  // This rig is `loadResetScope`, which paints THE PAGE PAINTER AND NOTHING
  // ELSE — no band. `[1, 0]` therefore still states exactly what it always
  // stated, and it is still true after wave 38: THE PAGE HALF of a reset day
  // draws no region, because paintPageDecorations still returns at its reset
  // guard before the canvas and before the region. That guard is untouched.
  //
  // WHAT IS NO LONGER TRUE IS THE INFERENCE A READER WOULD DRAW FROM IT —
  // that a reset day carries no outline ANYWHERE ON SCREEN. Her ruling
  // (`A-26` ruling 3, 2026-08-11) makes the SCENE's total conditional: with a
  // refusal live the band draws one, and with no refusal it draws none. So
  // the zero here is now the zero of one PAINTER rather than the zero of the
  // whole scene, and the scene-level pair — 0 without a refusal, 1 with one —
  // is asserted BY VALUE in `G-31/reset/blank-without-a-refusal` and
  // `G-31/refusal/reset-day-gets-an-outline`, on a rig where the page and the
  // band share one scene.
  //
  // ⚠ DO NOT "RECONCILE" THE TWO BY LOOSENING THIS ONE. A page painter that
  // started drawing a region on a reset day is the option she REJECTED
  // (*draw the outline on reset days too*), and this pin is what would catch
  // it.
  assert.deepStrictEqual(
    [regionCount(autoNodesB), regionCount(resetNodesB)], [1, 0],
    '(9l) THE SECOND EXCLUDED DIFFERENCE, NAMED: an undecorated day paints ' +
    'the drawn legal region and a reset day does not — the SAME early ' +
    'return, one node later. Pinned by count so a THIRD omission fails ' +
    'here rather than sliding through the filter above. 26.91-38: this is ' +
    'THE PAGE PAINTER\'S half; the scene\'s total is conditional on a live ' +
    'refusal from this wave and is pinned by value in G-31');
  assert.deepStrictEqual(
    [regionCount(autoNodesA), regionCount(resetNodesA)], [0, 0],
    '(9l) and the LEFT page carries no region on either side of the reset. ' +
    'The region\'s x0 IS the gutter, so the left page has no legal ' +
    'placement at all and a hairline claiming otherwise around the month ' +
    'grid would be the F-6 shape one page over');
  assert.strictEqual(
    pageSig(resetNodesA).length + 1, pageSig(autoNodesA).length,
    '(9l) and the excluded node is the ONLY thing the reset page is ' +
    'missing — a count, so a second omission would fail here rather than ' +
    'slide through the filter above');

  // ---- THE REPRESENTATION IS A FLAG, AND BOTH HALVES SAY SO -------------
  assert.strictEqual(st.DECORATIONS[DAY].items.length, beforeCount,
    '(9l) THE RECORDS ARE STILL THERE. A delete would satisfy the ' +
    'auto-render half above just as exactly; only this half tells a flag ' +
    'from a delete');
  assert.strictEqual(st.DECORATIONS[DAY].reset, true,
    '(9l) and the flag is what is stored');

  // ---- THE RESET IS UNDOABLE. This is the property the flag exists for --
  R.undo();
  assert.strictEqual(st.DECORATIONS[DAY].reset, false,
    '(9l) one undo takes the flag back down');
  assert.deepStrictEqual(pageSig(R.paint(pageA, 'left')), decoA,
    '(9l) and page A comes back EXACTLY as she left it');
  assert.deepStrictEqual(pageSig(R.paint(pageB, 'right')), decoB,
    '(9l) and so does page B — on EVERY page of the day, which is the ' +
    'whole reason the reset is a flag and not a delete');

  // ---- THE OWNERSHIP KEY DID NOT MOVE (D-06 vs A-3) ---------------------
  st.DECORATIONS[DAY].items.forEach(function (r) {
    assert.ok(r.page === 'abc123' || r.page === 'def456',
      '(9l) every stored record still keys by the BLESSING\'S ITEM ID. ' +
      'The gesture is day-scoped and the key is page-scoped; A-3 forbids ' +
      'reconciling them by moving the key, and this is where that would ' +
      'show');
  });
  const resetRegion = ['nbResetDay', 'placeFromTray', 'decoDay',
    'paintPageDecorations'].map(bodyOf).join('\n');
  ['pageIndex', 'pageOrdinal', 'ordinal', 'pageNo', 'pageNum'].forEach(
    function (k) {
      assert.strictEqual((resetRegion.match(new RegExp(k, 'g')) || []).length,
        0, '(9l) and no page-ordinal key was introduced ("' + k +
        '" reads 0)');
    });

  // ---- PLACING SOMETHING NEW STARTS OVER (F-9, owner call 2026-08-06) ----
  //
  // THIS ASSERTION WAS INVERTED, DELIBERATELY. It used to require that
  // placing a mark on a reset day brought the hidden records BACK, and
  // argued: "between an invisible write and a visible restoration, take the
  // one that makes the mistake visible." the owner failed exactly this in the
  // 26.9 UAT — the only beat she failed:
  //
  //   "sometimes user press this because they want to start over, however
  //    after I tried to start over, all of the old edits are back."
  //
  // The old rule guarded a real hazard (a write into a day whose contents
  // are hidden) but aimed it at the wrong scenario: the REASON people press
  // the reset control is to start over, so the first new mark undid the
  // gesture's whole purpose. The hazard is still answered — the page is
  // blank, so her new mark is the only thing on it and nothing is invisible.
  // (26.91-11: that last sentence is CLAUDE'S PROSE and names the control by
  // ROLE now that F-2 renamed its label. The block quote ABOVE is the owner's
  // own words and stays byte-unchanged — the exemption is the quotation,
  // never the file.)
  //
  // Nothing is lost: nbResetDay still only raises the flag, and the undo
  // stack snapshots the WHOLE day record, so one undo restores everything.
  // (test_nb_reset_start_over.cjs pins that half.)
  const P = loadResetScope();
  P.place('abc123', 0, { kind: 'sticker', sprite: 'moon' });
  P.resetDay(DAY);
  assert.strictEqual(P.state.DECORATIONS[DAY].reset, true,
    '(9l) positive control: the day is reset');
  assert.strictEqual(P.state.DECORATIONS[DAY].items.length, 1,
    '(9l) and the record still survives UNDER the flag — reset hides, it ' +
    'never deletes, which is what keeps it undoable');
  P.place('abc123', 0, { kind: 'sticker', sprite: 'ticket' });
  assert.strictEqual(P.state.DECORATIONS[DAY].reset, false,
    '(9l) placing something new clears the flag');
  assert.strictEqual(P.state.DECORATIONS[DAY].items.length, 1,
    '(9l) F-9: and starting over STARTS OVER — the page holds only the new ' +
    'mark. The superseded records are dropped, not resurrected');

  // ---- IDEMPOTENCE (EDGE SRM-14-EXT-EDITOR/idempotency) ----------------
  const I = loadResetScope();
  I.place('abc123', 0, { kind: 'sticker', sprite: 'moon' });
  I.place('def456', 192, { kind: 'sticker', sprite: 'ticket' });
  I.resetDay(DAY);
  const once = JSON.stringify(I.state.DECORATIONS[DAY]);
  const onceA = pageSig(I.paint(pageA, 'left'));
  I.resetDay(DAY);
  assert.strictEqual(JSON.stringify(I.state.DECORATIONS[DAY]), once,
    '(9l) resetting a day TWICE leaves exactly what resetting it once ' +
    'left — no records lost on the second pass, which a delete-based ' +
    'implementation could not promise');
  assert.deepStrictEqual(I.paint(pageA, 'left').map(function (n) {
    return [n.cls, n.text, n.style.__p['--x'], n.style.__p['--y'],
      n.style.__p['--w'], n.style.__p['--h'], n.style.__p['--sprite'],
      n.style.__p['--i'], n.style.left, n.style.top].join('|');
  }), onceA,
    '(9l) and re-rendering a reset day twice paints the same auto ' +
    'composition — the seeded mark never re-rolls (LAW-2/idempotency), ' +
    'which is what makes the reset a RESTORATION rather than a new guess');
})();

// ---- 9l(b): the reset row — two steps, now via a confirmation panel ------
//
// 26.9 F-13 (the owner, 2026-08-06): "the yes/no can be shown as a pop up window
// instead." THIS BLOCK PREVIOUSLY PINNED THE OPPOSITE — "two taps, in place,
// NO MODAL AND NO SCRIM", down to an equality on the scene's node count. The
// owner reversed that call, so the assertions are rewritten to pin the NEW
// contract rather than deleted. What is deliberately KEPT from the old block:
// the two-step itself, the single source for the copy, `yes` as the only
// destructive word, and declining changing nothing.

(function () {
  const rowOf = function (r) {
    return r.nodes.filter(function (n) {
      return /station-nb-reset/.test(String(n.cls));
    })[0];
  };
  const scrimOf = function (r) {
    return r.nodes.filter(function (n) {
      return /station-nb-scrim/.test(String(n.cls));
    })[0];
  };
  const flat = function (row) {
    return row.kids.map(function (k) { return k.text; }).join('');
  };
  // depth-first text of a subtree, so the panel's copy can be read whole
  const deep = function (n) {
    return (n.text || '') + (n.kids || []).map(deep).join('');
  };
  const findDeep = function (n, pred) {
    if (pred(n)) { return n; }
    let hit = null;
    (n.kids || []).forEach(function (k) { hit = hit || findDeep(k, pred); });
    return hit;
  };

  const calm = paintBand(0, 0, false);
  const row = rowOf(calm);
  assert.ok(row, '(9l) T2-1: the reset row is present in the band');
  assert.strictEqual(flat(row), 'undo everything',
    '(9l) with its pinned copy. 26.91-11 (F-2, owner UAT 2026-08-07) ' +
    'renamed it: she asked for plainer words, and her FIRST choice was ' +
    'measured 46% over the shipped label and rejected on that measurement ' +
    'rather than on preference');
  assert.deepStrictEqual([row.style.__p['--x'], row.style.__p['--y'],
    row.style.__p['--w'], row.style.__p['--h']], ['128', '196', '76', '16'],
    '(9l) at the UI-SPEC slot, by value. 26.91-02 moved `x` 100 -> 128 ' +
    'because the three controls to its left widened to carry words; its ' +
    '`w` is UNCHANGED at 76. 26.91-11 renamed the label to a SHORTER one ' +
    'and STILL did not move this number: under the pessimistic ' +
    'integer-rounded model the current label needs 57 px against 68 px of ' +
    'content box (11 px of margin, up from 4), so w:76 is no longer the ' +
    'floor it was — but the freed 4 px is NOT reclaimed and this row is ' +
    'NOT shrunk to 72, because Open Decision #4 answered ' +
    '`pre-authorize-ladder-only` and taking it back would be the third ' +
    're-lay D-09 forbids');
  assert.strictEqual(row.kids.length, 1,
    '(9l) and it is ONE tap target while calm');
  assert.strictEqual(scrimOf(calm), undefined,
    '(9l) T2-1: and NO panel exists while calm — asserted as absence, so a ' +
    'panel that merely renders offscreen or transparent would still fail');

  // T2-2: the first tap arms; the confirmation appears as a PANEL
  row.kids[0].__on.click[0]();
  assert.strictEqual(calm.armed(), true,
    '(9l) T2-2: the first tap arms the row');

  const armed = paintBand(0, 0, true);
  const arow = rowOf(armed);
  assert.strictEqual(flat(arow), 'undo everything',
    '(9l) T2-2: the ROW ITSELF no longer changes — its label is the same ' +
    'armed or not, which is what let the label be centred (F-12): it no ' +
    'longer has to reserve width for a confirmation sentence');
  assert.deepStrictEqual([arow.style.__p['--x'], arow.style.__p['--y'],
    arow.style.__p['--w'], arow.style.__p['--h']],
  [row.style.__p['--x'], row.style.__p['--y'], row.style.__p['--w'],
    row.style.__p['--h']],
  '(9l) and it holds the identical slot — the band does not reflow');

  const scrim = scrimOf(armed);
  assert.ok(scrim, '(9l) T2-2: arming paints the confirmation panel');
  assert.ok(armed.nodes.length > calm.nodes.length,
    '(9l) which is a REAL additional node in the scene — the inverse of the ' +
    'equality this block used to assert, and it is stated as an inequality ' +
    'for the same reason: so the panel cannot be faked by renaming a class');

  const panel = findDeep(scrim, function (n) {
    return /station-nb-confirm(?![-\w])/.test(String(n.cls));
  });
  assert.ok(panel, '(9l) the scrim carries the panel');
  assert.strictEqual(panel.attrs.role, 'dialog',
    '(9l) announced as a dialog');
  assert.strictEqual(panel.attrs['aria-modal'], 'true',
    '(9l) and as modal — it dims and blocks the spread behind it');
  assert.ok(/undo everything\?/.test(deep(panel)),
    '(9l) T2-2: the question is assembled from the SAME NB_RESET_COPY the ' +
    'row uses, so the two cannot drift apart. 26.91-11 moved the expected ' +
    'value with the constant. NOTE THE DIRECTION: this seeks the LONGER ' +
    'string, so a control labelled `undo` cannot satisfy it — the unsafe ' +
    'form would be a substring search for `undo`, which the longer label ' +
    'WOULD satisfy');

  // 26.91-11, FOUND BY DRIVING THE MUTATION SET: the assertion above says
  // the question "is assembled from the SAME NB_RESET_COPY", but it only
  // measures the RENDERED STRING — so a re-typed literal that happens to be
  // byte-equal to the constant passes it. Measured: replacing
  // `NB_RESET_COPY + '?'` with the literal `'undo everything?'` left the
  // whole suite GREEN. The threat register names exactly this
  // ("a re-typed literal at any consumer lets the question and the control
  // it came from drift apart"), so the gate was STRENGTHENED rather than
  // its message softened. This half reads the PAINTER'S SOURCE and pins the
  // ASSEMBLY, which is the only form that can see a byte-equal re-type.
  {
    const bandSrcQ = bodyOf('renderNotebookBand');
    assert.ok(/q\.textContent = NB_RESET_COPY \+ '\?';/.test(bandSrcQ),
      '(9l) T2-2 SOURCE SHAPE: the panel\'s question is ASSEMBLED from ' +
      'NB_RESET_COPY, not re-typed. A rendered-value check cannot tell a ' +
      'byte-equal literal from the constant, and a literal is exactly how ' +
      'the question and the control drift apart on the NEXT rename — the ' +
      'one after this plan\'s');
    assert.ok(
      /panel\.setAttribute\('aria-label', NB_RESET_COPY \+ '\?'\);/
        .test(bandSrcQ),
      '(9l) T2-2 SOURCE SHAPE: and so is the panel\'s aria-label, from the ' +
      'SAME constant — so the accessible name and the visible question ' +
      'cannot drift from each other or from the control they came from');
  }
  // ---- T-26.91-60, REWRITTEN 26.91-18 — NEVER DELETED --------------------
  //
  // WHAT THIS PIN USED TO BE: a check that the consequence sentence's final
  // clause NAMED ITS CONTROL by a noun phrase, because 26.91-11 had found
  // that a bare reference had two referents once the band held a single-step
  // control labelled `undo` beside a destructive one whose label BEGINS with
  // that word.
  //
  // WHY ITS SUBJECT CHANGED: the owner replaced the whole sentence (the owner,
  // 2026-08-09), and her sentence NAMES NO CONTROL AT ALL. So the clause that
  // pin was about no longer exists to be checked. The naming FINDING is not
  // retired — it still binds anything written here later, and it is recorded
  // in this message so it cannot be lost with the clause it described.
  //
  // WHAT SURVIVES UNCHANGED, and is what keeps T-26.91-60 armed: the panel's
  // title and its consequence sentence can still DRIFT APART, and the
  // question is still ASSEMBLED from the shared constant. The two
  // SOURCE-SHAPE assertions directly above are byte-unchanged by this
  // rewrite; they are the drift half of this threat and they were not
  // touched.
  //
  // WHAT THIS PIN MEASURES NOW — and it does not over-claim beyond it
  // (26.91-11's finding: a gate's message must not say more than it
  // measures). Two things, and no more: the sentence is HERS BY VALUE, and
  // her sentence names no band control.
  assert.strictEqual(
    findDeep(panel, function (n) {
      return /station-nb-confirm-says/.test(String(n.cls));
    }) ? deep(findDeep(panel, function (n) {
      return /station-nb-confirm-says/.test(String(n.cls));
    })) : null,
    'are you sure you want to remove all of your edits?',
    '(9l) T-26.91-60 (rewritten): the consequence sentence is HERS, ' +
    'VERBATIM (2026-08-09), pinned BY VALUE. She chose it AFTER being shown ' +
    'that it drops the panel\'s only statement that the act is recoverable ' +
    '— an owner-accepted cost recorded at the site, never to be re-argued ' +
    'by restoring a remedy clause here');

  // THE REGION-SCOPED NEGATIVE. It is scoped to the consequence node's OWN
  // text and NEVER to the panel, because the panel's question legitimately
  // contains the reset control's label — a panel-wide negative could never
  // pass, and a gate that cannot pass is not a stricter gate, it is a broken
  // one.
  {
    const saysNode = findDeep(panel, function (n) {
      return /station-nb-confirm-says/.test(String(n.cls));
    });
    // ARMED AT A NODE THAT DOES NOT EXIST, THIS MUST REFUSE — NOT PASS. A
    // region gate whose region is missing counts zero occurrences of
    // everything and reports success, which is this phase's defect class in
    // its purest form. So the region is proven to EXIST and to be NON-EMPTY
    // before anything is counted over it.
    assert.ok(saysNode, '(9l) T-26.91-60: the consequence node EXISTS — ' +
      'proven before it is counted over, because a negative gate armed at a ' +
      'missing node passes vacuously forever');
    const saysText = deep(saysNode);
    assert.ok(saysText.length > 0,
      '(9l) T-26.91-60: and its region is NON-EMPTY (' + saysText.length +
      ' chars). An empty region satisfies every negative below it');
    [NB_SRC_CONSTS.NB_RESET_COPY, 'undo', 'redo', 'marks', 'arrange',
      'done arranging'].forEach(function (control) {
      assert.strictEqual(saysText.indexOf(control), -1,
        '(9l) T-26.91-60: her sentence names NO band control — found "' +
        control + '" in the consequence text. This is the half of the ' +
        'threat that CHANGED: the sentence used to name a control on ' +
        'purpose (26.91-11 made it a noun phrase precisely so it named the ' +
        'right one), and now it must name none. THE 26.91-11 FINDING IS ' +
        'NOT RETIRED and still binds anything written here later: with a ' +
        'single-step control labelled `undo` beside a destructive one whose ' +
        'label BEGINS with that word, a bare reference has two referents ' +
        'and points at the wrong one first');
    });
  }

  const yes = findDeep(panel, function (n) { return n.text === 'yes'; });
  const no = findDeep(panel, function (n) { return n.text === 'no'; });
  assert.ok(yes && no, '(9l) both words are real tap targets');
  assert.ok(/station-nb-yes/.test(yes.cls),
    '(9l) and only `yes` wears the destructive class — carried across the ' +
    'move rather than dropped in it');
  assert.strictEqual(/station-nb-yes/.test(no.cls), false,
    '(9l) `no` does not — declining is the quiet default');

  // T2-3: confirming resets the DAY
  yes.__on.click[0]();
  assert.deepStrictEqual(armed.log.filter(function (e) {
    return /^reset:/.test(e);
  }), ['reset:08/04/2026'],
    '(9l) T2-3: confirming resets THE DAY, by its day key');
  assert.strictEqual(armed.armed(), false, '(9l) and disarms');

  // T2-4: declining changes nothing — from BOTH routes
  const armed2 = paintBand(0, 0, true);
  const no2 = findDeep(scrimOf(armed2), function (n) {
    return n.text === 'no';
  });
  no2.__on.click[0]();
  assert.ok(armed2.log.indexOf('disarm') !== -1,
    '(9l) T2-4: `no` routes through the shared disarm');
  assert.strictEqual(armed2.log.filter(function (e) {
    return /^reset:/.test(e);
  }).length, 0,
    '(9l) T2-4: and resets NOTHING. Asserted by the reset never being ' +
    'called, not by the copy having changed back');

  const armed3 = paintBand(0, 0, true);
  scrimOf(armed3).__on.click[0]();
  assert.ok(armed3.log.indexOf('disarm') !== -1,
    '(9l) T2-4: tapping the SCRIM also declines — the safe reading of an ' +
    'ambiguous gesture; an outside tap must never confirm');
  assert.strictEqual(armed3.log.filter(function (e) {
    return /^reset:/.test(e);
  }).length, 0, '(9l) and resets nothing either');

  // T2-5: Escape is the third route, and the editing keys go inert
  const kd = String(extractFn(appSrc, 'nbKeydown'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(/escape/i.test(kd) && /nbDisarmReset\(/.test(kd),
    '(9l) T2-5: Escape declines through the same shared disarm — a modal ' +
    'that cannot be dismissed from the keyboard is a trap');
  assert.ok(/NB_RESET_ARMED\s*\)\s*\{\s*return/.test(kd.replace(/\s+/g, ' ')
    .replace(/if \( /g, 'if (')),
    '(9l) T2-5: and the editing keys are inert while it is up — undoing ' +
    'underneath an open modal edits a page she cannot see');

  // ---- THE DESTRUCTIVE COLOUR APPEARS EXACTLY ONCE ---------------------
  const rawCss = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const startMark = "26.9-03 THE NOTEBOOK'S DESIGN MODE (SRM-14-EXT-EDITOR)";
  const endMark = "26.9-03 THE NOTEBOOK'S DESIGN MODE (end)";
  const s0 = rawCss.lastIndexOf('/*', rawCss.indexOf(startMark));
  const s1 = rawCss.indexOf('*/', rawCss.indexOf(endMark)) + 2;
  const regionRaw = rawCss.slice(s0, s1);
  const region = regionRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok((regionRaw.match(/var\(--never\)/g) || []).length >
    (region.match(/var\(--never\)/g) || []).length,
    '(9l) the comment strip is load-bearing here too — the raw region ' +
    'names --never more often than the code does');
  const nevers = (region.match(/var\(--never\)/g) || []).length;
  assert.strictEqual(nevers, 1,
    '(9l) THE DESTRUCTIVE COLOUR IS USED EXACTLY ONCE in this phase\'s CSS ' +
    'surface — an EQUALITY, so a second use cannot appear silently. ' +
    'Counted ' + nevers);
  assert.ok(/\.station-nb-yes\s*\{\s*color:\s*var\(--never\)/.test(region),
    '(9l) and it is the `yes` word: one vermillion word, no fill, no ' +
    'border, no .btn-never chrome');
  const band = bodyOf('renderNotebookBand');
  assert.strictEqual((band.match(/station-nb-yes/g) || []).length, 1,
    '(9l) and exactly ONE word in the copy wears it — an equality over ' +
    'the painter as well as over the stylesheet, because a second ' +
    'application of an existing class adds no CSS at all');

  // ---- LAW 3: the AUTHORED BAND LABELS name no absence, no duration, no
  // count -----------------------------------------------------------------
  //
  // 26.91-27 (F-23 change b) — RE-KEYED TO ITS REAL SUBJECT, NOT WEAKENED.
  //
  // Every assertion below is the shipped one, unchanged in form and applied
  // to every string it applied to before. What changes is the NAME of the
  // subject: these five are THE HOUSE'S OWN AUTHORED BAND COPY, and that is
  // what the digit rule was always about. From this wave the error row can
  // also render a reason the SERVER wrote — and the server's refusal
  // register speaks page bounds, character caps and per-day counts, which
  // are figures the user needs and which law 3 was never about. The
  // authority for that scoping is the plan-25 amendment to the UI-SPEC's
  // `long-text | E2` row: the refusal register is a SEPARATE register with
  // a separate job, and no band string is cardinality-sensitive within the
  // authored set.
  //
  // Narrowing a subject opens a hole — anybody could satisfy the digit rule
  // by authoring a second, client-side copy of the refusals. The sibling
  // assertion below closes it, and it is why this narrowing is safe.
  const AUTHORED_BAND_LABELS = [NB_SRC_CONSTS.NB_RESET_COPY,
    'undo everything? yes / no', 'yes', 'no', "couldn't save — try again."];
  AUTHORED_BAND_LABELS.forEach(function (s) {
    ['sched', 'cron', 'reminder', 'notification(', 'pushmanager',
      'shownotification', 'setinterval(', 'navigator.serviceworker',
      'osascript'].forEach(function (ban) {
      assert.strictEqual(s.toLowerCase().indexOf(ban), -1,
        '(9l) authored-labels-speak-no-count: "' + s + '" clears the ' +
        'case-insensitive vocabulary bans');
    });
    assert.strictEqual(/\d/.test(s), false,
      '(9l) authored-labels-speak-no-count: "' + s + '" speaks no count ' +
      'and no duration (law 3). SUBJECT: the five AUTHORED band labels. ' +
      'The server\'s refusal register is out of scope by the plan-25 ' +
      'UI-SPEC amendment (long-text | E2) — its figures are the bounds she ' +
      'needs in order to understand a refusal, not a count of her absence');
    assert.strictEqual(s, s.toLowerCase(),
      '(9l) authored-labels-speak-no-count: and stays in the quiet ' +
      'lowercase register');
  });
  assert.strictEqual(AUTHORED_BAND_LABELS.length, 5,
    '(9l) authored-labels-speak-no-count: FIVE authored labels, counted — ' +
    'so a label cannot leave this subject silently while the rule goes on ' +
    'reporting itself green over a shorter list');

  // ---- THE HOLE THE NARROWING WOULD OTHERWISE OPEN, CLOSED --------------
  //
  // (9l) refusal-register-is-not-authored-copy. The refusal strings are the
  // SERVER'S words and they are read off the wire. If a future change
  // answered the digit rule by authoring a second copy of them client-side,
  // that copy would be authored band copy carrying digits — exactly what the
  // rule above forbids — and the narrowing would have been a loophole rather
  // than a correction. Measured against app.js rather than argued.
  (function () {
    const srv = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    const from = srv.indexOf('def validate_decorations(');
    assert.notStrictEqual(from, -1,
      '(9l) refusal-register-is-not-authored-copy: validate_decorations ' +
      'could not be found in server.py — the window is empty and every ' +
      'negative below would be a negative over nothing');
    const to = srv.indexOf('\n    return None', from);
    const region = srv.slice(from, to);
    // whole double-quoted literal chunks carrying no f-string placeholder
    const frags = (region.match(/"[^"\\{}\n]{24,}"/g) || [])
      .map(function (q) { return q.slice(1, -1); });
    assert.ok(frags.length >= 8,
      '(9l) refusal-register-is-not-authored-copy: ANTI-VACUITY FLOOR — ' +
      'only ' + frags.length + ' refusal fragment(s) of 24+ characters ' +
      'were lifted out of validate_decorations. A negative asserted over a ' +
      'short list is a negative over almost nothing');
    const authored = frags.filter(function (f) {
      return appSrc.indexOf(f) !== -1;
    });
    assert.deepStrictEqual(authored, [],
      '(9l) refusal-register-is-not-authored-copy: ' + frags.length +
      ' refusal fragments were lifted from server.py and app.js must ' +
      'author NONE of them — the reason the row speaks is READ OFF THE ' +
      'WIRE (law 4: the server\'s own words, never a rewrite of them). ' +
      'A client-side copy would also be authored band copy carrying ' +
      'digits, which is precisely what the digit rule above forbids');
  })();
})();

// ===========================================================================
// ---- 9m: 26.9-06 — THE ONE ERROR, AND THE BAND THAT NEVER MOVES ----------
//
// Two claims, and the second is the one that needs saying carefully: a
// horizontal layout check is a DERIVATION, and a derivation is a hypothesis
// until a scan has executed it. The table in the UI-SPEC was read by a human
// and read correctly, and that is still not the same as running the
// arithmetic. So the sort, the overlap test and the gap ladder below are all
// computed here from the real declaration, and the SUMMARY records what the
// run produced rather than what the table said.
// ===========================================================================

(function () {
  // ---- LOCAL STATE IS KEPT ON A FAILED WRITE ---------------------------
  //
  // Driven through the SHIPPED write path with a transport that refuses,
  // and asserted by the RECORD'S POSITION — never by "an error was shown".
  // This is the assertion the prohibition exists to protect.
  const F = loadTwoHistories();
  const fst = F.state;
  fst.apiOk = false;
  // 26.91-10 (A-12): inside the mark canvas, so this measures the refused
  // write rather than the clamp.
  const rec = { page: 'abc123', kind: 'text', x: 200, y: 100, text: '' };
  fst.DECORATIONS['08/04/2026'] = { reset: false, items: [rec] };
  nbDrag(F, rec, 40, 0);
  assert.strictEqual(rec.x, 240,
    '(9m) LOCAL STATE IS KEPT: the mark is still where she put it after ' +
    'the write was REFUSED. A silent revert to the last saved value is the ' +
    'outcome this row exists to prevent — she would have no way to know ' +
    'what was lost');
  assert.deepStrictEqual(fst.DECORATIONS['08/04/2026'].items, [rec],
    '(9m) and the day\'s records are untouched — not trimmed, not ' +
    'reordered, not replaced by a reload');
  assert.strictEqual(F.failed(), true,
    '(9m) the failure is recorded fail-VISIBLY rather than swallowed');

  // and the positive half: a write that SUCCEEDS leaves the flag down
  const G = loadTwoHistories();
  const gst = G.state;
  const rec2 = { page: 'abc123', kind: 'text', x: 100, y: 100, text: '' };
  gst.DECORATIONS['08/04/2026'] = { reset: false, items: [rec2] };
  nbDrag(G, rec2, 40, 0);
  assert.strictEqual(G.failed(), false,
    '(9m) POSITIVE HALF: a successful write raises nothing. Without it, ' +
    '"always show the error" passes every assertion above');

  // ---- THE ROW ITSELF ---------------------------------------------------
  const calm = paintBand(1, 0, false, false);
  const broke = paintBand(1, 0, false, true);
  const errRow = function (r) {
    return r.nodes.filter(function (n) {
      return /station-nb-error/.test(String(n.cls));
    })[0];
  };
  assert.strictEqual(errRow(calm), undefined,
    '(9m) no failure, no row — the band says nothing when nothing is wrong');
  const row = errRow(broke);
  assert.ok(row, '(9m) and the row appears when a write has failed');

  // ---- 26.91-27: THE COPY ASSERTION SPLITS INTO ITS TWO BRANCHES -------
  //
  // NOTHING IS DELETED AND NOTHING IS WEAKENED. Before this wave the row had
  // one branch, so one assertion measured it. From this wave it has two —
  // the server's reason when there is one, the house line when there is not
  // — and a single assertion driving only the fallback would go on passing
  // while it stopped measuring the branch that matters. That is this phase's
  // named defect class, and it is instance TWENTY of it.
  //
  // The FALLBACK branch below keeps the shipped equality-against-the-literal
  // form VERBATIM, because that form is what catches a re-authored near-miss
  // ("could not save, please try again") that any grep for "save" would pass.
  const others = appSrc.split("couldn't save — try again.").length - 1;
  assert.ok(others >= 10,
    '(9m) fallback-branch: the save-failure line is the house\'s one ' +
    'save-failure line — it occurs ' + others + ' times in app.js, so ' +
    'reusing it is REUSE rather than authoring. It is NOT retired by ' +
    'F-23 change (b); it becomes the fallback, and this count is what ' +
    'makes that reuse rather than authoring');
  const shipped = /"(couldn't save — try again\.)"/.exec(appSrc);
  assert.ok(shipped, '(9m) fallback-branch: and it is findable as a literal');
  assert.strictEqual(row.text, shipped[1],
    '(9m) fallback-branch: THE ROW\'S COPY IS THAT EXACT STRING when the ' +
    'transport had no reason to speak, asserted by equality against the ' +
    'literal as it appears elsewhere in app.js — a re-authored near-miss ' +
    '("could not save, please try again") fails here and would pass any ' +
    'grep for "save". This is the CONTROL: green before F-23 change (b) ' +
    'and green after, which is what proves the house line was not retired');
  assert.strictEqual(row.attrs['aria-label'], shipped[1],
    '(9m) fallback-branch: and it is announced as what it says');

  // ---- THE BRANCH THAT DID NOT EXIST BEFORE ----------------------------
  //
  // 26.91-31 (F-27/A-24): RE-POINTED BY EXACT VALUE to her chosen sentence.
  // NOT relaxed to indexOf, includes or a widened regex — wave 22 refused
  // exactly that relaxation on `(9n)` and recorded why.
  //
  // AND A FINDING, RECORDED WHERE IT WAS FOUND. Changing the four server
  // strings did NOT redden this group. It could not have: this literal is a
  // FIXTURE fed to paintBand, and every assertion below compares the painted
  // row to the fixture. Nothing here ever compared it to server.py, so the
  // comment that called it "the exact sentence F-23 produces" was a claim the
  // gate had no way to keep. That is this phase's own defect class landing
  // inside an instrument built to catch it. The answer is NOT to loosen
  // anything: `serverSaysIt` below asserts the fixture is a WHOLE quoted
  // literal inside validate_decorations, so the next reword reddens HERE
  // instead of leaving a stale sentence sitting in a green suite.
  const REASON = "move that mark inside the page outline.";
  serverSaysIt(REASON, '(9m)');
  const spoke = errRow(paintBand(1, 0, false, true, REASON));
  assert.ok(spoke, '(9m) reason-branch: the row still appears');
  assert.strictEqual(spoke.text, REASON,
    '(9m) reason-branch: WHEN THE SERVER SAID WHY, THE ROW SAYS WHAT THE ' +
    'SERVER SAID — verbatim and undecorated (law 4), not a rewrite of it ' +
    'and not the house line pretending to be one. 26.91-31: this is now ' +
    'the sentence SHE chose (A-24) rather than the one F-23 produced — she ' +
    'read that one at the fifth seal and answered "1 no and 2 no"');
  assert.strictEqual(spoke.attrs['aria-label'], REASON,
    '(9m) reason-branch: and its accessible name matches its copy — a row ' +
    'that says one thing and announces another is two messages');
  assert.strictEqual(REASON.length, 39,
    '(9m) reason-branch: and the sentence is 39 characters, COUNTED. A-20 ' +
    'part 2 shipped a correct string beside a WRONG count for four days, so ' +
    'the count is asserted where the string is rather than trusted from a ' +
    'document');
  assert.notStrictEqual(spoke.text, shipped[1],
    '(9m) reason-branch: POSITIVE CONTROL — the two branches must actually ' +
    'differ. Without this, a painter that ignored the reason entirely ' +
    'would satisfy the fallback branch and pass here by rendering the ' +
    'house line into a variable nobody compared');
  assert.deepStrictEqual([row.style.__p['--x'], row.style.__p['--y'],
    row.style.__p['--w'], row.style.__p['--h']], ['64', '184', '316', '12'],
    '(9m) at the UI-SPEC slot, ABOVE the band line rather than in it — a ' +
    'failure should not have to displace a control to be seen. 26.91-27 ' +
    'MOVED THIS PIN BY VALUE IN THE SAME COMMIT AS THE SLOT: 180 -> 316 ' +
    'wide, 100 -> 64 left, y and h unchanged. A stale pin a changed slot ' +
    'happens to satisfy is the same defect class as a vacuous gate. The ' +
    'new numbers are MEASURED, not chosen — see the declaration');

  // THE WHOLE ROW is the retry target
  assert.strictEqual(row.tag, 'button',
    '(9m) THE WHOLE ROW IS THE RETRY TARGET: the row element itself is the ' +
    'button, not a child of it. A word-sized target inside a 180-wide row ' +
    'is a row that looks tappable and mostly is not');
  assert.strictEqual((row.__on.click || []).length, 1,
    '(9m) and it carries exactly one handler');
  assert.strictEqual(row.kids.length, 0,
    '(9m) with no child to steal the tap');
  row.__on.click[0]();
  assert.strictEqual(broke.failed(), false,
    '(9m) tapping it clears the flag FIRST — a retry that left it up would ' +
    'repaint the row on success and read as a failure that never ends');
  assert.deepStrictEqual(broke.log.filter(function (e) {
    return /^post:/.test(e);
  }), ['post:08/04/2026'],
    '(9m) and RETRIES the write, scoped to the open day');

  // ---- THE BAND, PINNED BY VALUE ---------------------------------------
  const B = NB_SRC_CONSTS.NB_BAND;
  assert.deepStrictEqual(B, {
    prev: { x: 4, y: 196, w: 20, h: 16 },
    // 26.91-02: the tin JOINS the band line. Its 28-tall departure is
    // retired (see the departures assertion below for the owner's reason).
    tin: { x: 28, y: 196, w: 32, h: 16 },
    undo: { x: 64, y: 196, w: 28, h: 16 },
    redo: { x: 96, y: 196, w: 28, h: 16 },
    reset: { x: 128, y: 196, w: 76, h: 16 },
    entry: { x: 140, y: 196, w: 104, h: 16 },
    exit: { x: 212, y: 196, w: 76, h: 16 },
    pen: { x: 292, y: 196, w: 24, h: 16 },
    // 26.91-02: the armed `write` tool — the control app.js's KNOWN DEBT
    // comment was waiting for. It is the reason five slots widened.
    write: { x: 320, y: 196, w: 32, h: 16 },
    next: { x: 360, y: 196, w: 20, h: 16 },
    // 26.91-27 (F-23 b): re-laid on a live measurement, in the same commit.
    error: { x: 64, y: 184, w: 316, h: 12 }
  }, '(9m) all ELEVEN band slots, BY VALUE. Four of them (prev, next, tin, ' +
     'entry) are REFERENCES to the shipped declarations rather than copies, ' +
     'so this pin reaches those too and a second table cannot drift from ' +
     'the first');
  assert.strictEqual(Object.keys(B).length, 11,
    '(9m) eleven, counted — so a twelfth slot cannot be added without ' +
    'being pinned');

  // ONE BASELINE, ONE HEIGHT — with the ONE declared departure named.
  //
  // DERIVED from the table rather than hand-listed, then pinned by value.
  // A hand-written list is a second table that can silently shrink: drop a
  // name and its slot stops being checked while the loop still passes.
  // Deriving means a new slot is checked the moment it is declared; pinning
  // the derived list by value means a DELETED slot still fails here.
  const online = Object.keys(B).filter(function (k) { return k !== 'error'; });
  assert.deepStrictEqual(online,
    ['prev', 'tin', 'undo', 'redo', 'reset', 'entry', 'exit', 'pen', 'write',
      'next'],
    '(9m) TEN slots sit on the band line — every slot except the save-error ' +
    'row. This is a superset of NB_BAND_ARRANGING (9), because `entry` is ' +
    'the READING-mode row: it rides the same baseline but never shares the ' +
    'line with the arranging controls');
  online.forEach(function (k) {
    assert.strictEqual(B[k].y, 196,
      '(9m) ' + k + ' shares the band line y:196 (the shipped .station-flip ' +
      'geometry) — one baseline, no per-element justification');
    assert.strictEqual(B[k].h, 16,
      '(9m) and the band height 16');
  });
  assert.deepStrictEqual([B.tin.h, B.error.y], [16, 184],
    '(9m) THE DECLARED DEPARTURE LIST IS NOW ONE, NOT TWO, and the reason ' +
    'the tin left it is the OWNER\'S VERDICT, recorded rather than dropped. ' +
    'The retired justification read: the tin is taller than the band on ' +
    'purpose, because the extra height is what makes it findable as the ' +
    'entry to decoration WITHOUT A LABEL. 26.9\'s UAT retired exactly that ' +
    'claim — she could not find the tin at all, and F-6 named it an ' +
    '"empty-looking thin rectangle outline". So the tin is given the label ' +
    'the old reasoning was a substitute for (`marks`), and with a label it ' +
    'no longer needs to be an outlier: ONE BASELINE BEATS ONE OUTLIER, ' +
    'which is the same lesson F-12 and F-13 taught about labels sitting ' +
    'off-centre from their neighbours. Only the save-error row departs now, ' +
    'and it departs VERTICALLY (y:184) so it can share the band\'s ' +
    'horizontal span without colliding with anything on the line');

  // ---- THE HORIZONTAL CHECK, RUN AS ARITHMETIC -------------------------
  //
  // Sorted by left edge and walked, rather than read off the table. A check
  // that compared only the first two slots would pass any table whose first
  // two happened to be in order.
  const run = NB_SRC_CONSTS.NB_BAND_ARRANGING.map(function (k) {
    return { k: k, x0: B[k].x, x1: B[k].x + B[k].w };
  }).sort(function (a, b) { return a.x0 - b.x0; });
  assert.strictEqual(run.length, 9,
    '(9m) NINE controls share the band while arranging — the entry row is ' +
    'NOT among them, and that is why the overlap check runs over a MODE ' +
    'and not over the whole table: the entry slot (140-244) overlaps both ' +
    'the reset row and the exit row, legitimately, because they never ' +
    'exist at the same time. 26.91-02 moved this 8 -> 9 by INSERTING the ' +
    'armed `write` tool; no existing control was re-ranked');
  assert.deepStrictEqual(run.map(function (r) { return r.k; }),
    ['prev', 'tin', 'undo', 'redo', 'reset', 'exit', 'pen', 'write', 'next'],
    '(9m) and the EXECUTED sort by left edge gives the reading order — ' +
    'this is the derivation being run rather than read. THE SHIPPED ' +
    'RELATIVE ORDER OF ALL EIGHT EXISTING CONTROLS IS PRESERVED EXACTLY: ' +
    'strike `write` from this list and it is the 26.9-07 order, unchanged');
  const gaps = [];
  for (let i = 1; i < run.length; i++) {
    assert.ok(run[i].x0 >= run[i - 1].x1,
      '(9m) ' + run[i - 1].k + ' (' + run[i - 1].x0 + '-' + run[i - 1].x1 +
      ') and ' + run[i].k + ' (' + run[i].x0 + '-' + run[i].x1 +
      ') must not overlap');
    gaps.push(run[i].x0 - run[i - 1].x1);
  }
  assert.deepStrictEqual(gaps, [4, 4, 4, 4, 8, 4, 4, 8],
    '(9m) and the EIGHT gaps, BY VALUE, in order. Pinning the list is what ' +
    'makes "no overlap" more than an inequality nobody looked at. 26.91-02 ' +
    'PAID FOR THE WIDENING OUT OF THE BAND rather than out of the bound: ' +
    'five slots up (tin 24->32, undo 16->28, redo 16->28, pen 16->24, and ' +
    'the new write at 32) is +52, paid by one shipped slot down (exit ' +
    '96->76, -20) and by the two 32-wide gaps 26.9-07 left either side of ' +
    'the pen (-64 -> +8 of the two safety gaps). Width sum 336, gap sum 40, ' +
    '336 + 40 = 376 = 380 - 4 = NB_BOUNDS.x1 - NB_BOUNDS.x0. THE TWO 8s ARE ' +
    'THE ONLY GAPS SPENT ON SAFETY RATHER THAN RHYTHM, and each buys a ' +
    'named one: reset->exit separates a control that clears a whole day of ' +
    'handmade work from the way out, and write->next keeps an ARMED tool ' +
    'from sitting 4 px from a page flip that clears the undo stack on day ' +
    'change');
  const LADDER = [4, 8, 12, 16, 24, 32, 48];
  gaps.forEach(function (g) {
    assert.strictEqual(g % 4, 0,
      '(9m) every gap is a multiple of 4 — a composition of ladder steps');
  });
  assert.deepStrictEqual(gaps.filter(function (g) {
    return LADDER.indexOf(g) === -1;
  }), [],
    '(9m) and every gap between ADJACENT controls is a ladder token, ' +
    'asserted by MEMBERSHIP rather than by "the gap is positive". 26.9-06 ' +
    'carried ONE exception here — the 80-wide empty middle — and 26.9-07 ' +
    'spent it on the pen, so the exception list is now EMPTY and the ' +
    'membership rule is total. The by-value gap list above is what keeps ' +
    'this from being vacuous: it proves seven real gaps were measured');
  // ---- THE WALK TOUCHES BOTH BOUNDS, ASSERTED AT EACH END BY VALUE -----
  //
  // Without this, a band that fit perfectly but FLOATED — every gap a
  // ladder token, zero overlap, and 4 px of dead space at each end — would
  // pass every assertion above. "It fits" is not "it is laid out."
  assert.strictEqual(run[0].x0, NB_SRC_CONSTS.NB_BOUNDS.x0,
    '(9m) the walk STARTS at the shipped left bound NB_BOUNDS.x0 (4), read ' +
    'from the declaration rather than typed, so the band is anchored ' +
    'rather than merely small enough');
  assert.strictEqual(run[run.length - 1].x1, NB_SRC_CONSTS.NB_BOUNDS.x1,
    '(9m) and ENDS exactly at NB_BOUNDS.x1 (380): next.x + next.w. Both ' +
    'ends by value, because a band anchored at one end and short at the ' +
    'other is the shape this pair exists to catch');
  assert.strictEqual(run[0].x0 + 336 + 40, run[run.length - 1].x1,
    '(9m) and the two sums CLOSE the walk arithmetically: 4 + 336 (widths) ' +
    '+ 40 (gaps) = 380. This is the exact-fit claim executed rather than ' +
    'asserted — no slack was invented anywhere in the row');

  assert.strictEqual(B.error.x >= B.tin.x + B.tin.w, true,
    '(9m) the error row still clears the tin HORIZONTALLY (error starts at ' +
    B.error.x + ', the tin ends at ' + (B.tin.x + B.tin.w) + '). THE ' +
    'CLEARANCE NARROWED 44 -> 40 px when the tin widened 24 -> 32, and ' +
    'that is stated rather than glossed: it is the one measure this ' +
    're-lay makes slightly worse. NOTE FOR A LATER EDITOR: tin.w may not ' +
    'grow past 32 without re-checking THIS LINE first. The shipped reason ' +
    'for this assertion ("the two share the y 184 line") is RETIRED — the ' +
    'tin now sits at y:196 and the two no longer share a row at all — but ' +
    'the assertion is KEPT rather than deleted, because the error row and ' +
    'the tin are still 12 px apart vertically and a widened tin would ' +
    'crowd it visually long before it overlapped it');

  // ---- EVERY SCENE-PX VALUE THIS PHASE INTRODUCES IS A MULTIPLE OF 4 ---
  //
  // As a SET DIFFERENCE against the UI-SPEC's enumerated Exceptions, not as
  // a scan with an open escape hatch. Four values walked around the old
  // mechanism precisely because it had one.
  const collected = [];
  [B.prev, B.tin, B.undo, B.redo, B.reset, B.entry, B.exit, B.pen, B.write,
    B.next, B.error,
    NB_SRC_CONSTS.NB_TRAY, NB_SRC_CONSTS.NB_TEXT_BOX,
    NB_SRC_CONSTS.NB_IMG_BOX].forEach(function (o) {
    Object.keys(o).forEach(function (k) { collected.push(o[k]); });
  });
  Object.keys(NB_SRC_CONSTS.NB_BOUNDS).forEach(function (k) {
    collected.push(NB_SRC_CONSTS.NB_BOUNDS[k]);
  });
  collected.push(NB_SRC_CONSTS.NB_STICKER_H);
  Object.keys(NB_SRC_CONSTS.NB_STICKERS).forEach(function (k) {
    collected.push(NB_SRC_CONSTS.NB_STICKERS[k].x);
    collected.push(NB_SRC_CONSTS.NB_STICKERS[k].w);
  });
  assert.ok(collected.length >= 60,
    '(9m) positive control: ' + collected.length + ' scene-px values were ' +
    'collected, so the set difference below has real subjects');
  // The UI-SPEC's Exceptions table, enumerated. These are the ONLY
  // permitted non-multiples; anything else is a new off-ladder value.
  const EXCEPTIONS = [170, 178, 190];
  const off = collected.filter(function (v) { return v % 4 !== 0; });
  assert.deepStrictEqual(off.sort(function (a, b) { return a - b; }), [190],
    '(9m) exactly ONE collected value is not a multiple of 4, pinned by ' +
    'value — so the exception list below is load-bearing rather than ' +
    'decorative. Found: ' + JSON.stringify(off));
  assert.deepStrictEqual(off.filter(function (v) {
    return EXCEPTIONS.indexOf(v) === -1;
  }), [],
    '(9m) and it is a row in the Exceptions table (the notebook page ' +
    'interior bound, derived from the shipped whyText/deco slots and only ' +
    'READ by the clamp). A SET DIFFERENCE, so a new off-ladder value fails ' +
    'here instead of walking around the mechanism the way four of them did');

  // ---- THE ACCENT BUDGET, WHOLE-FILE, BY VALUE, WITH ITS WEARERS -------
  //
  // WHY WHOLE-FILE AND NOT REGION-SCOPED. 9h already pins the accent at 2
  // inside the 26.9-03 CSS region, and that pin is untouched. But this
  // re-lay edits `.station-nb-glyph, .station-nb-pen` at tokens.css:3216,
  // which sits OUTSIDE that region — so the 9h pin cannot see this plan's
  // own edits at all. That is precisely the 26.9-05 failure the UI-SPEC's
  // T-26.91-12 row names: "a region-scoped test whose scan window missed
  // the rule." A count that cannot see the change it is guarding is the
  // named defect class, so the census below is over the WHOLE stylesheet.
  const accRaw = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const accCss = accRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  // the strip is LOAD-BEARING, proven rather than assumed
  assert.ok((accRaw.match(/var\(--accent\)/g) || []).length >
    (accCss.match(/var\(--accent\)/g) || []).length,
    '(9m) the comment strip is load-bearing on the whole file too — the ' +
    'raw sheet names the accent more often than the code uses it. Prose ' +
    'must never be able to answer a question about code');
  const accWearers = [];
  const accRe = /([^{}]*)\{([^{}]*)\}/g;
  let accM;
  while ((accM = accRe.exec(accCss)) !== null) {
    if (accM[2].indexOf('var(--accent)') !== -1) {
      accWearers.push(accM[1].trim().replace(/\s+/g, ' '));
    }
  }
  assert.deepStrictEqual(accWearers, [
    'a.wikilink',
    '.cat-sw.active',
    '.room-title',
    '.room-rule i',
    '.station-fixture:hover, .station-fixture:focus-visible',
    '.page-deco:focus-visible',
    '.page-deco.is-selected'
  ], '(9m) THE ACCENT\'S WEARERS, ENUMERATED BY NAME AND PINNED IN SOURCE ' +
     'ORDER — not counted. A COUNT IS THE WRONG INSTRUMENT HERE and the ' +
     '26.9-05 lesson says why: deleting a ring satisfies an equality every ' +
     'bit as well as moving it does, so "still 7" would hold while an ' +
     'accessibility regression shipped underneath it. Naming them means a ' +
     'ring that MOVES fails, a ring that is DELETED fails, and a ring that ' +
     'is ADDED fails — three different defects, one assertion. This ' +
     're-lay must not change this list: it takes .station-fixture OFF the ' +
     'pen (and with it the pen\'s coral hover ring) but adds no accent ' +
     'anywhere, and prev/next keep that rule alive');
  // THE TWO NOTEBOOK-SURFACE WEARERS, POSITIVELY, BY NAME
  [['.page-deco.is-selected', 'the selected mark\'s coral outline'],
    ['.station-fixture:hover, .station-fixture:focus-visible',
      'the shipped fixture hover/focus ring that prev and next still wear']
  ].forEach(function (pair) {
    assert.ok(accWearers.indexOf(pair[0]) !== -1,
      '(9m) ' + pair[1] + ' STILL EXISTS (' + pair[0] + '). Asserted ' +
      'positively and separately from the list above, because this is the ' +
      'half that stops the budget being satisfied by deletion');
  });
  // AND THE PEN'S RING MOVED RATHER THAN VANISHED. Dropping .station-fixture
  // from the pen removes its coral hover ring; without this line that would
  // be an a11y regression dressed up as colour discipline. It is --ink now,
  // via the row rule 26.91-01 added — the 26.88-04 precedent, not a third
  // colour.
  assert.ok(/\.station-caption-add\.station-nb-row:focus-visible/
    .test(accCss),
    '(9m) and the pen LANDS somewhere when it leaves .station-fixture: ' +
    '`.station-caption-add.station-nb-row:focus-visible` is the --ink ring ' +
    '26.91-01 added, which the pen now wears by joining that register. ' +
    'This stylesheet has no global :focus-visible rule (:2318), so without ' +
    'this the pen would have NO focus indicator at all');

  // ---- EVERY NAMED CONTROL ACTUALLY CARRIES ITS WORD ------------------
  //
  // THIS GROUP EXISTS BECAUSE ITS ABSENCE WAS MEASURED, not because it
  // looked tidy. Mutation M-I emptied the tin's `textContent` while leaving
  // its aria-label at 'marks' — the EXACT degenerate form this phase is
  // about, a control that is named for a screen reader and invisible to her
  // eye, which is precisely the state F-6 was reported against — and the
  // whole suite stayed GREEN. The phase's central deliverable had no gate
  // at all. Driven, found, closed here.
  //
  // The pairing is the point: aria-label === textContent, asserted TOGETHER
  // for each control. Either one alone is satisfiable by the failure mode.
  const trayS = bodyOf('renderTinTray');
  const bandSrcNames = bodyOf('renderNotebookBand');
  assert.ok(/tin\.setAttribute\('aria-label', 'marks'\)/.test(trayS),
    '(9m) the tin is ANNOUNCED as `marks`');
  assert.ok(/tin\.textContent = 'marks'/.test(trayS),
    '(9m) and it VISIBLY SAYS `marks` — the half whose absence left the ' +
    'suite green while the tin rendered as a wordless box. It names its ' +
    'CONTENTS, which is the thing she was hunting for');
  assert.ok(/pen\.setAttribute\('aria-label', 'pen'\)/.test(bandSrcNames) &&
    /pen\.textContent = 'pen'/.test(bandSrcNames),
    '(9m) the pen is announced AND visibly says `pen` — one string, so the ' +
    'accessible name and the visible name cannot drift apart');
  assert.ok(/b\.setAttribute\('aria-label', spec\[0\]\)/.test(bandSrcNames) &&
    /b\.textContent = spec\[0\]/.test(bandSrcNames),
    '(9m) and undo/redo take BOTH names from the SAME expression (spec[0]), ' +
    'which is stronger than asserting two equal literals: they cannot ' +
    'drift apart even in principle');
  assert.ok(/\['undo',/.test(bandSrcNames) && /\['redo',/.test(bandSrcNames),
    '(9m) POSITIVE CONTROL: and spec[0] really is the word — the roster ' +
    'holds `undo` and `redo`, so the shared-expression assertion above is ' +
    'about real words and not about two equally empty strings');

  // ---- THE GLYPH LITERALS LEAVE THE BAND ------------------------------
  //
  // Comment-stripped, and that is LOAD-BEARING here rather than tidy: the
  // replacement comments in app.js discuss the retired glyphs by name, so a
  // raw scan would be answered by the prose explaining the removal.
  const bandSrc = bodyOf('renderNotebookBand');
  ['↺', '↻', '✎'].forEach(function (g) {
    assert.strictEqual((bandSrc.match(new RegExp(g, 'g')) || []).length, 0,
      '(9m) the glyph ' + g + ' is GONE from renderNotebookBand — every ' +
      'control it paints carries a lowercase word instead');
  });
  assert.strictEqual((appCode.match(/↺|↻/g) || []).length, 0,
    '(9m) and the two arrows are gone from app.js ENTIRELY — they had no ' +
    'other site');
  // THE PEN NIB IS NOT ZERO WHOLE-FILE, AND THAT IS CORRECT — SO IT IS
  // PINNED BY SITE RATHER THAN WAVED THROUGH.
  //
  // app.js carried TWO pen nibs at HEAD: the band's pen glyph (removed by
  // this wave) and `sessionChatGlyph`, which uses one as the LIBRARIAN'S
  // SPEAKER MARK in the session chat — a different subsystem this phase
  // does not touch. A blanket "zero in app.js" would only have been
  // reachable by deleting a working, unrelated feature's glyph to make a
  // band assertion green, which is the tail wagging the dog. Pinning the
  // count at 1 AND naming its one legitimate site means the band can never
  // quietly take a glyph back, and the exemption cannot grow to two.
  assert.strictEqual((appCode.match(/✎/g) || []).length, 1,
    '(9m) exactly ONE pen nib survives in app.js');
  assert.ok(bodyOf('sessionChatGlyph').indexOf('✎') !== -1,
    '(9m) and it is `sessionChatGlyph`\'s librarian speaker mark — the ' +
    'session chat, not the notebook band. Named, so the survivor is an ' +
    'identified exemption rather than an uncounted one');

  // ---- THE TIN\'S ACCESSIBLE NAME NARROWED TO ITS VISIBLE NAME ---------
  assert.strictEqual((appCode.match(/your marks and pictures/g) || []).length,
    0,
    '(9m) the tin\'s old accessible name `your marks and pictures` is gone ' +
    'from app.js. It could not survive alongside a visible `marks`: the ' +
    'findability contract requires aria-label === textContent, and an ' +
    'accessible name that disagrees with the visible one is the degenerate ' +
    'form that requirement exists to close. Nothing is lost — the tray\'s ' +
    'two tabs are themselves labelled `marks` and `pictures`');

  // ---- THE VACATED CLASS: ZERO WEARERS, RETAINED DELIBERATELY ----------
  //
  // Comment-stripped, because the replacement comments in app.js discuss
  // this very class by name — a raw grep would be answered by the prose
  // explaining why the prose is not the answer.
  assert.strictEqual((appCode.match(/station-nb-glyph/g) || []).length, 0,
    '(9m) `station-nb-glyph` has ZERO wearers in app.js after the re-lay — ' +
    'undo and redo joined the band\'s one type register. MEASURED, not ' +
    'assumed: this number is the whole point of asserting it, because the ' +
    're-lay is exactly the kind of change that leaves an orphan behind');
  assert.strictEqual(
    (accCss.match(/\.station-nb-glyph/g) || []).length, 1,
    '(9m) and the class is still DECLARED exactly once in tokens.css. ' +
    'RETAINED, NOT DELETED — the standing rule ("a test pinning behaviour ' +
    'the owner later changed gets REWRITTEN, never deleted") applied to ' +
    'CSS: the shipped raised-key face stays available for a future glyph ' +
    'control. Pinning the orphan BY VALUE is what makes it a deliberate ' +
    'zero rather than an unnoticed one');
})();

// ===========================================================================
// ---- G-26: 26.91-27 (F-23 change b) — THE HONEST REFUSAL ------------------
//
// THE DEFECT THIS GROUP EXISTS FOR. `validate_decorations` returns a
// PLAIN-WORDS reason for every one of its 33 refusals, `handle_decorations_post`
// puts it on the wire as the `error` field, and `postDecorations` reduced the
// whole response to a boolean at ONE LINE. The band then printed a fixed
// sentence naming RETRYING as the cure. She hit a write retrying could never
// fix and saw exactly that.
//
// AND THE SURFACE WAS LATENT EVEN WHEN THE FLAG WAS RAISED. M-25 part 4(ii)
// drove it over a REAL promise: the flag goes up inside the promise and the
// drag's release path repaints SYNCHRONOUSLY one line earlier, so
// ROW_PAINTS_IN_THE_SAME_GESTURE was FALSE. Surfacing a reason onto a surface
// that does not paint is not surfacing it.
//
// EVERY ASSERTION HERE IS DRIVEN. Not one of them is satisfied by "an error
// was shown": each names the hop it measures, so a reason dropped anywhere
// along transport -> module state -> row names its own hop.
// ===========================================================================

(function () {
  // 26.91-31 (F-27/A-24): re-pointed BY EXACT VALUE, and fenced against
  // going stale the same way the (9m) fixture is — this one was green
  // through the reword too, for the same structural reason.
  const REASON = "move that mark inside the page outline.";
  serverSaysIt(REASON, '(G-26)');

  // ---- HOP 1..3: THE REASON SURVIVES EVERY HOP -------------------------
  (function () {
    const F = loadTwoHistories();
    F.state.apiOk = false;
    F.state.apiReason = REASON;
    const rec = { page: 'abc123', kind: 'text', x: 200, y: 100, text: '' };
    F.state.DECORATIONS['08/04/2026'] = { reset: false, items: [rec] };
    nbDrag(F, rec, 40, 0);
    // HOP 1 — the transport. Asserted FIRST and separately, so a harness
    // that silently stopped carrying the reason fails HERE rather than
    // making the two hops below look like an app.js defect.
    assert.strictEqual(F.state.apiReason, REASON,
      '(G-26/reason/survives-every-hop) HOP 1 (transport): the refusal ' +
      'carries a reason. Without this the two hops below would be measured ' +
      'over a response that never had one');
    assert.strictEqual(F.failed(), true,
      '(G-26/reason/survives-every-hop) and the write really was refused — ' +
      'a green run over a SUCCESSFUL write would prove nothing');
    // HOP 2 — the module state.
    assert.strictEqual(F.reason(), REASON,
      '(G-26/reason/survives-every-hop) HOP 2 (module state): ' +
      'NB_SAVE_REASON holds the server\'s own words, read through the ' +
      'SHIPPED errorText helper and kept rather than swallowed — so the ' +
      'row that consumes it is a wiring job and not a re-derivation');
    // HOP 3 — the rendered row.
    const row = paintBand(1, 0, false, true, F.reason()).nodes
      .filter(function (n) { return /station-nb-error/.test(String(n.cls)); })[0];
    assert.ok(row, '(G-26/reason/survives-every-hop) the row exists');
    assert.strictEqual(row.text, REASON,
      '(G-26/reason/survives-every-hop) HOP 3 (the rendered row): what the ' +
      'server said reaches her eye UNMODIFIED up to the cap. law 4 — ' +
      'verbatim and undecorated, the server\'s own words and never a ' +
      'rewrite of them');
    // and the absent case arrives as ABSENT, never as the house line
    // pretending to be a reason the server gave.
    const G = loadTwoHistories();
    G.state.apiOk = false;
    const r2 = { page: 'abc123', kind: 'text', x: 200, y: 100, text: '' };
    G.state.DECORATIONS['08/04/2026'] = { reset: false, items: [r2] };
    nbDrag(G, r2, 40, 0);
    assert.strictEqual(G.reason(), null,
      '(G-26/reason/survives-every-hop) NEGATIVE HALF: a refusal with no ' +
      'reason to speak leaves NB_SAVE_REASON absent. errorText is called ' +
      'with NO fallback on purpose — an absent reason must arrive as ' +
      'absent, so the row can choose the house line knowingly rather than ' +
      'the house line arriving disguised as something the server said');
  })();

  // ---- THE ROW PAINTS IN THE GESTURE THAT FAILED -----------------------
  //
  // DRIVEN OVER A DEFERRED TRANSPORT, never the synchronous thenable. The
  // synchronous one resolves inside postDecorations, so the release path's
  // own repaint would read a flag the real browser does not raise until a
  // microtask later — and this assertion would be GREEN over a defect
  // M-25 measured as real. The instrument is the whole assertion here.
  (function () {
    const F = loadTwoHistories();
    F.state.apiOk = false;
    F.state.apiReason = REASON;
    F.state.deferred = true;
    const rec = { page: 'abc123', kind: 'text', x: 200, y: 100, text: '' };
    F.state.DECORATIONS['08/04/2026'] = { reset: false, items: [rec] };
    nbDrag(F, rec, 40, 0);
    assert.strictEqual(F.failed(), false,
      '(G-26/reason/row-paints-without-another-gesture) PRECONDITION, and ' +
      'it is M-25 part 4(ii) reproduced: at the end of the release path ' +
      'the flag is still DOWN, because the promise has not resolved. Any ' +
      'harness where this reads true is measuring the synchronous thenable ' +
      'and not the browser');
    assert.deepStrictEqual(F.state.repaintSaw, [false],
      '(G-26/reason/row-paints-without-another-gesture) and the gesture\'s ' +
      'OWN repaint saw the flag down — the row it painted said nothing');
    F.flush();
    assert.strictEqual(F.failed(), true,
      '(G-26/reason/row-paints-without-another-gesture) the write is now ' +
      'known to have failed');
    assert.strictEqual(F.state.repaintSaw.indexOf(true) !== -1, true,
      '(G-26/reason/row-paints-without-another-gesture) AND A REPAINT RAN ' +
      'AFTER THE FLAG WENT UP, with NO further gesture driven. Without it ' +
      'the reason exists in memory and never reaches her eye until some ' +
      'later unrelated repaint happens to run. repaintSaw=' +
      JSON.stringify(F.state.repaintSaw));
  })();

  // ---- AND IT NEVER RUNS OVER A LIVE EDITOR ---------------------------
  //
  // ASSERTED AS A PAIR, because the negative half alone is VACUOUS at HEAD:
  // before this wave the failure path repainted in NO case at all, so
  // "it does not repaint over a live input" was true for the wrong reason.
  // The positive half is what makes the negative mean something.
  (function () {
    const clear = loadTwoHistories();
    clear.state.apiOk = false;
    clear.state.deferred = true;
    clear.state.DECORATIONS['08/04/2026'] = { reset: false, items: [] };
    clear.post('08/04/2026');
    clear.flush();
    const repaintedWithNoInput = clear.state.repaints.length;

    const live = loadTwoHistories();
    live.state.apiOk = false;
    live.state.deferred = true;
    live.state.liveInput = { className: 'page-deco-input caption-hand',
      value: 'the sentence she was in the middle of typing' };
    live.state.DECORATIONS['08/04/2026'] = { reset: false, items: [] };
    live.post('08/04/2026');
    live.flush();

    assert.deepStrictEqual([
      repaintedWithNoInput > 0,
      live.state.repaints.length,
      live.state.liveInput !== null,
      live.state.liveInput.value
    ], [true, 0, true, 'the sentence she was in the middle of typing'],
      '(G-26/reason/never-repaints-over-a-live-editor) THE PAIR: with no ' +
      'hand-text input in the scene a refused write DOES repaint (' +
      repaintedWithNoInput + ' repaint(s)) — that is the positive half, ' +
      'and without it the negative is vacuous. With one live it repaints ' +
      'NOT AT ALL (' + live.state.repaints.length + '), the input is still ' +
      'in the scene, and its value is intact. paintNotebookSpread clears ' +
      'every scene child that is not the background, so firing it over an ' +
      'open input would DELETE HER TYPING to display an error about ' +
      'saving — a fix for a data loss causing one. The row lands on the ' +
      'next repaint instead, which costs nothing because she is still ' +
      'typing');
  })();

  // ---- THE CAP, AND THE ABSENCE OF A MARKUP SINK ----------------------
  //
  // TWO of the 33 refusals interpolate names taken from the REQUEST BODY,
  // so they are neither authored nor bounded. Measured from server.py at
  // wave 27: the FIELDS refusal's fixed shell is 87 characters with the
  // interpolation EMPTY (the KEYS refusal's is 65) and the interpolation
  // itself is UNBOUNDED. `long-text | E2` says no user text renders in the
  // band, ever — so the reason is capped, ends in an ellipsis, and reaches
  // the DOM through textContent with no markup channel at all.
  (function () {
    const srv = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    const from = srv.indexOf('def validate_decorations(');
    const region = srv.slice(from, srv.indexOf('\n    return None', from));
    // the two shells, RE-MEASURED from server.py rather than trusted from
    // the plan: their accepted-lists are the two DECOR_* key tuples.
    const keyList = function (name) {
      const m = new RegExp('\\n' + name + ' = \\(([\\s\\S]*?)\\)').exec(srv);
      assert.ok(m, '(G-26/reason/capped-and-text-only) could not lift ' +
        name + ' out of server.py');
      return (m[1].match(/"([^"]+)"/g) || [])
        .map(function (q) { return q.slice(1, -1); }).join(', ');
    };
    const shellKeys = 'unknown decoration keys:  (accepted: ' +
      keyList('DECOR_KEYS') + ').';
    const shellFields = 'unknown decoration fields:  (accepted: ' +
      keyList('DECOR_ITEM_KEYS') + ').';
    assert.ok(region.indexOf('unknown decoration fields:') !== -1 &&
      region.indexOf('unknown decoration keys:') !== -1,
      '(G-26/reason/capped-and-text-only) both interpolating refusals are ' +
      'still in the register — if either is renamed this measurement is ' +
      'about a string that no longer exists');
    assert.ok(shellFields.length > shellKeys.length,
      '(G-26/reason/capped-and-text-only) THE FIELDS REFUSAL IS THE LONGER ' +
      'SHELL, measured: ' + shellFields.length + ' characters against the ' +
      'keys refusal\'s ' + shellKeys.length + ', both with the ' +
      'interpolation EMPTY. It is the one this assertion drives, because ' +
      'its accepted-list names ten fields against the keys list\'s four');

    assert.strictEqual(typeof NB_SAVE_REASON_CAP, 'number',
      '(G-26/reason/capped-and-text-only) app.js must declare ' +
      'NB_SAVE_REASON_CAP as a plain integer. It is LIFTED here, never ' +
      're-typed, so this gate and the painter cannot drift apart');

    // an adversarial field name long enough to blow any plausible cap
    const adversarial = 'unknown decoration fields: ' +
      new Array(4001).join('m') + ' (accepted: ' +
      keyList('DECOR_ITEM_KEYS') + ').';
    const row = paintBand(1, 0, false, true, adversarial).nodes
      .filter(function (n) { return /station-nb-error/.test(String(n.cls)); })[0];
    assert.ok(row, '(G-26/reason/capped-and-text-only) the row exists');
    assert.strictEqual(row.text.length, NB_SAVE_REASON_CAP,
      '(G-26/reason/capped-and-text-only) a ' + adversarial.length +
      '-character reason renders at exactly the cap (' +
      NB_SAVE_REASON_CAP + '), measured on the RENDERED node rather than ' +
      'on the string the painter was handed. Unbounded caller-influenced ' +
      'text must not enter the band (T-26.91-171)');
    assert.strictEqual(row.text.slice(-1), '…',
      '(G-26/reason/capped-and-text-only) and it ends in the ellipsis, so ' +
      'a truncation reads AS a truncation rather than as a sentence the ' +
      'server stopped mid-word');
    assert.strictEqual(row.attrs['aria-label'], row.text,
      '(G-26/reason/capped-and-text-only) the accessible name is capped ' +
      'too — an uncapped aria-label would put the whole unbounded string ' +
      'back on the one surface nobody looks at');
    assert.strictEqual(row.innerHTML, undefined,
      '(G-26/reason/capped-and-text-only) NO MARKUP CHANNEL: the node was ' +
      'never given an innerHTML at all. The hand-text element\'s own ' +
      'contract says there is no HTML sink on this surface and there must ' +
      'not become one; contenteditable was rejected for exactly this');
    const bandBody = bodyOf('renderNotebookBand');
    const errFrom = bandBody.indexOf('station-nb-error');
    assert.notStrictEqual(errFrom, -1,
      '(G-26/reason/capped-and-text-only) the error row could not be found ' +
      'in the painter — the source window below would be empty');
    const errRegion = bandBody.slice(Math.max(0, errFrom - 400), errFrom + 900);
    ['innerHTML', 'outerHTML', 'insertAdjacentHTML'].forEach(function (sink) {
      assert.strictEqual(errRegion.indexOf(sink), -1,
        '(G-26/reason/capped-and-text-only) and the painter names no ' +
        sink + ' anywhere near the row. The rendered-node half above ' +
        'cannot see a sink the fake DOM does not model; this half can');
    });
    // the ellipsis costs a character rather than being added past the cap
    const exactly = new Array(NB_SAVE_REASON_CAP + 1).join('x');
    const atCap = paintBand(1, 0, false, true, exactly).nodes
      .filter(function (n) { return /station-nb-error/.test(String(n.cls)); })[0];
    assert.deepStrictEqual([atCap.text.length, atCap.text.slice(-1)],
      [NB_SAVE_REASON_CAP, 'x'],
      '(G-26/reason/capped-and-text-only) BOUNDARY: a reason of EXACTLY ' +
      'the cap renders whole and gains no ellipsis. Without this the cap ' +
      'could be an off-by-one that silently truncated the register\'s ' +
      'longest bounded refusal, which is measured at exactly ' +
      NB_SAVE_REASON_CAP + ' characters');
  })();

  // ---- THE RETRY CLEARS BOTH -------------------------------------------
  (function () {
    const broke = paintBand(1, 0, false, true, REASON);
    const row = broke.nodes.filter(function (n) {
      return /station-nb-error/.test(String(n.cls)); })[0];
    assert.strictEqual(broke.reason(), REASON,
      '(G-26/retry/clears-both) PRECONDITION: the reason is up before the ' +
      'press');
    row.__on.click[0]();
    assert.deepStrictEqual([broke.failed(), broke.reason()], [false, null],
      '(G-26/retry/clears-both) pressing the row clears the flag AND the ' +
      'reason, both BEFORE the repost — for the same measured reason the ' +
      'flag alone was already cleared first: a retry that left either up ' +
      'would repaint a failure that never ends, and a retry that cleared ' +
      'only the flag would leave a stale sentence behind for the NEXT ' +
      'failure to speak in the wrong words');
    assert.deepStrictEqual(broke.log.filter(function (e) {
      return /^post:/.test(e); }), ['post:08/04/2026'],
      '(G-26/retry/clears-both) and it still retries the write, scoped to ' +
      'the open day');
  })();

  // ---- THE NINE ARRANGING SLOTS ARE BYTE-UNCHANGED ---------------------
  //
  // THE CONTROL. This plan may move the save-error row and NOTHING else: the
  // row is the band's only conditional member, it is additive, and it sits
  // ABOVE the band line, so re-laying it touches the nine-slot arithmetic
  // not at all. That is asserted by comparing the DECLARATION LINES
  // THEMSELVES against a second, independent by-value copy — not argued in
  // prose, and not derived from the very table it is checking.
  (function () {
    const code = stripComments(appSrc);
    const bandDecl = /\n\s*var NB_BAND = \{([\s\S]*?)\n\s*\};/.exec(code);
    assert.ok(bandDecl,
      '(G-26/band/arranging-arithmetic-byte-unchanged) NB_BAND\'s ' +
      'declaration could not be read — every comparison below would be ' +
      'over nothing');
    const geomDecl =
      /\n\s*var STATION_NOTEBOOK_GEOM = \{([\s\S]*?)\n\s*\};/.exec(code);
    assert.ok(geomDecl,
      '(G-26/band/arranging-arithmetic-byte-unchanged) ' +
      'STATION_NOTEBOOK_GEOM\'s declaration could not be read');
    const lineFor = function (src, key) {
      const m = new RegExp('\\n\\s*' + key + ':\\s*([^\\n]*)').exec(src);
      return m ? key + ': ' + m[1].trim() : 'MISSING(' + key + ')';
    };
    const nine = NB_SRC_CONSTS.NB_BAND_ARRANGING.map(function (k) {
      return lineFor(bandDecl[1], k);
    });
    const tinLine = /\n\s*var NB_TIN = ([^\n]*)/.exec(code);
    assert.ok(tinLine, '(G-26/band/arranging-arithmetic-byte-unchanged) ' +
      'NB_TIN\'s declaration could not be read');
    const referenced = [lineFor(geomDecl[1], 'prev'),
      lineFor(geomDecl[1], 'next'), 'NB_TIN = ' + tinLine[1].trim()];
    assert.deepStrictEqual(nine.concat(referenced), [
      'prev: STATION_NOTEBOOK_GEOM.prev,',
      'tin: NB_TIN,',
      'undo: { x: 64, y: 196, w: 28, h: 16 },',
      'redo: { x: 96, y: 196, w: 28, h: 16 },',
      'reset: { x: 128, y: 196, w: 76, h: 16 },',
      'exit: { x: 212, y: 196, w: 76, h: 16 },',
      'pen: { x: 292, y: 196, w: 24, h: 16 },',
      'write: { x: 320, y: 196, w: 32, h: 16 },',
      'next: STATION_NOTEBOOK_GEOM.next,',
      'prev: { x: 4, y: 196, w: 20, h: 16 },',
      'next: { x: 360, y: 196, w: 20, h: 16 }',
      'NB_TIN = { x: 28, y: 196, w: 32, h: 16 };'
    ], '(G-26/band/arranging-arithmetic-byte-unchanged) THE NINE ARRANGING ' +
       'SLOTS AND THE THREE DECLARATIONS THEY POINT AT, compared LINE BY ' +
       'LINE against a second independent copy pinned by value. Two of the ' +
       'nine are REFERENCES, so their real numbers live elsewhere and are ' +
       'pinned here too — a check that read only the NB_BAND body would ' +
       'have been blind to a change in the geometry it forwards. This is ' +
       'a CONTROL: green before F-23 change (b) and green after. Whoever ' +
       'legitimately re-lays this band moves these lines in the SAME ' +
       'commit, which is the point rather than an inconvenience');
  })();
})();

// ===========================================================================
// ---- G-25: 26.91-26 (F-23) — THE CLAMP AND THE VALIDATOR, ONE RULE --------
//
// THE DEFECT THIS GROUP EXISTS FOR. The client clamps a mark's ORIGIN; the
// server checks every stroke POINT's ABSOLUTE position. `strokeBox` returns a
// SPAN (the largest relative point) and `clampDecoOrigin` consumes it as a
// COUNT, so on stroke records the two ceilings differ by EXACTLY ONE PIXEL on
// both axes. A drag the page previews and accepts is a write the server 400s —
// and because a post replaces the WHOLE DAY, one out-of-bounds mark refuses
// every other mark's write on that day too. Her edit dies behind a message
// that names retrying as the cure when retrying can never work.
//
// THE ASSERTION REGISTER IS (9m)'s, DELIBERATELY: drive the shipped path
// through a real drag, and assert by the RECORD and by the REAL VALIDATOR
// rather than by a rendered string. "An error was shown" is not the claim;
// "the origin the UI settles on is an origin the server accepts" is.
//
// THE FOUR SERVER BOUNDS ARE LIFTED OUT OF server.py AS TEXT. Not one of 4,
// 379, 4 or 189 is typed below — a gate that hard-codes the number it is
// checking cannot notice the number moving, which is precisely how the client
// and server bounds drifted apart in the first place.
//
// EVERY CHECK RUNS, AND A RED RUN NAMES ITSELF. `assert` halts at the first
// failure, which would hide every red behind the earliest one — and this
// group's whole value at HEAD is the LIST of what fails. So the checks are
// named closures, all of them are executed, and the collected red names are
// asserted against the empty list at the end. The roll call is printed too,
// so a reader sees all seven names whatever the outcome.
// ===========================================================================

(function () {
  const cp = require('child_process');
  const os = require('os');
  const g25Src = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

  // ---- the four SERVER bounds, LIFTED AS TEXT --------------------------
  // The shipped spelling is the PAIRED form `NAME_MIN, NAME_MAX = a, b`, so
  // the parser reads that shape rather than a single-assignment one it would
  // never meet.
  function g25SrvBound(name) {
    const re = /^(\w+),\s*(\w+)\s*=\s*(-?\d+),\s*(-?\d+)\s*(?:#.*)?$/gm;
    let m;
    while ((m = re.exec(g25Src)) !== null) {
      if (m[1] === name) { return parseInt(m[3], 10); }
      if (m[2] === name) { return parseInt(m[4], 10); }
    }
    throw new Error('G-25 could not lift ' + name + ' out of server.py');
  }
  const SRV = {
    X_MIN: g25SrvBound('DECOR_X_MIN'), X_MAX: g25SrvBound('DECOR_X_MAX'),
    Y_MIN: g25SrvBound('DECOR_Y_MIN'), Y_MAX: g25SrvBound('DECOR_Y_MAX')
  };

  // ---- the python bridge, whose OWN exit status is read DIRECTLY --------
  //
  // NEVER THROUGH A PIPE. `grep` on PATH is a shell function under this
  // project's shell snapshot and a piped status is the pipeline's, not the
  // interpreter's — this phase has already shipped one rig that could never
  // have reported a failure for exactly that reason. spawnSync hands back the
  // interpreter's own status and it is asserted before the stdout is believed.
  // `validate_decorations` is a PURE FUNCTION: it opens nothing, takes no
  // lock and writes nothing, which is why the fourth-seal UAT could run it
  // against her real data with zero writes.
  const G25_BRIDGE =
    'import sys,json\n' +
    'sys.path.insert(0,".")\n' +
    'import server\n' +
    'print(repr(server.validate_decorations(json.load(sys.stdin))))\n';
  function g25Validate(doc) {
    const r = cp.spawnSync('python3', ['-c', G25_BRIDGE],
      { cwd: ROOT, input: JSON.stringify(doc), encoding: 'utf8' });
    assert.strictEqual(r.status, 0,
      'G-25/bridge — the python bridge must EXIT ZERO before its stdout is ' +
      'believed. A bridge that cannot report its own failure is worse than ' +
      'no bridge. stderr: ' + String(r.stderr).slice(0, 400));
    return r.stdout.trim();
  }

  // ---- the harness ------------------------------------------------------
  //
  // A LOCAL one rather than loadTwoHistories, for one reason that is not
  // tidiness: `decoBox` reaches `strokeBox` for stroke records and the shared
  // NB_HELPERS bundle does not carry it, so the shared harness dies on the
  // first stroke — the same sloppy-mode landmine the file's own comments
  // describe one identifier over. And `clampDecoOriginFor` does not exist
  // until this plan's task 3 lands, so it is lifted OPTIONALLY: at HEAD the
  // drag still calls `clampDecoOrigin` and the harness must load anyway, or
  // the group could never be watched failing.
  function g25FnOpt(name) {
    try { return extractFn(appSrc, name); } catch (e) { return ''; }
  }
  const G25_SRC =
    declOf('STATION_NOTEBOOK_GEOM') + '\n' +
    ['wrapDecoAngle', 'clampDecoScale', 'strokeList', 'strokeBox', 'decoBox',
      'previewDecoTransform', 'postDecorations', 'decoDay', 'nbSnapshot',
      'applyNbSnapshot', 'pushNbUndo', 'nbGlyphState', 'updateNbButtons',
      'clampDecoOrigin', 'attachPageDrag', 'bringDecoToFront',
      'nbClearResetForEdit']
      .map(function (n) { return extractFn(appSrc, n); }).join('\n') + '\n' +
    ['decoPointExtent', 'clampDecoOriginFor'].map(g25FnOpt).join('\n') +
    // 26.91-27 (F-23 b): postDecorations' new dependencies. This bundle is
    // deliberately NOT NB_HELPERS (see above), so it states them itself.
    '\nvar NB_SAVE_REASON = null;\n' + extractFn(appSrc, 'errorText') +
    '\n' + g25FnOpt('nbSaveFailed');

  function g25Harness() {
    const state = { DECORATIONS: {}, posted: [], bodies: [], repaints: [] };
    // eslint-disable-next-line no-new-func
    const api = new Function('S', `
      var DECORATIONS = S.DECORATIONS;
      var NB_UNDO = [], NB_REDO = [];
      var NB_UNDO_CAP = ${/var NB_UNDO_CAP = (\d+);/.exec(appSrc)[1]};
      var NB_DAY = '08/04/2026';
      var NBDESIGN = true;
      var NB_SEL = null;
      var NB_PEN = false, NB_PEN_GROUP = null, NB_WRITE = false;
      ${['NB_BOUNDS', 'NB_GUTTER_X', 'NB_MARK_BOUNDS', 'NB_TEXT_BOX',
    'NB_IMG_BOX', 'NB_STICKER_H', 'NB_STICKERS',
    'NB_DRAG_THRESHOLD', 'NB_DECO_CAP',
    'NB_A_MOD', 'NB_S_MIN', 'NB_S_MAX', 'NB_S_DEFAULT'].map(declOf).join('\n      ')}
      ${['NB_DECOR_X_MIN', 'NB_DECOR_X_MAX', 'NB_DECOR_Y_MIN',
    'NB_DECOR_Y_MAX'].map(function (n) {
    try { return declOf(n); } catch (e) { return ''; }
  }).join('\n      ')}
      var NB_PLACE = { itemId: 'abc123', x0: 0 };
      var NB_REPAINT = function () { S.repaints.push(true); };
      var NB_SAVE_FAILED = false;
      function syncP(v) {
        return { then: function (f) { return syncP(f(v)); },
          catch: function () { return syncP(v); } };
      }
      function apiPost(url, body) {
        S.posted.push(body.day);
        S.bodies.push(JSON.parse(JSON.stringify(body)));
        return syncP({ ok: true });
      }
      function dismissTray() {}
      function openHandTextEditor() {}
      function $() { return null; }
      function getComputedStyle() {
        return { getPropertyValue: function () { return '1'; } };
      }
      ${G25_SRC}
      return { attachPageDrag: attachPageDrag, decoBox: decoBox,
        strokeBox: strokeBox };`)(state);
    api.state = state;
    return api;
  }

  // Place `rec` on a fresh day, drag it by (dx, dy) through the REAL
  // attachPageDrag, and hand back the origin the clamp settled on.
  function g25Settle(rec, dx, dy) {
    const api = g25Harness();
    api.state.DECORATIONS['08/04/2026'] = { reset: false, items: [rec] };
    nbDrag(api, rec, dx, dy);
    return { x: rec.x, y: rec.y, api: api };
  }
  function g25Stroke(ex, ey, x, y) {
    return { page: 'abc123', kind: 'stroke', x: x, y: y,
      pts: [[0, 0, ex, 0, ex, ey, 0, ey]] };
  }
  function g25Doc(rec) {
    return { version: 1, day: '08/04/2026', reset: false,
      items: [JSON.parse(JSON.stringify(rec))] };
  }

  // ---- the library pointer, the third-copy idiom S10 already carries ----
  function g25LibraryRoot() {
    try {
      const doc = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'library.local.json'), 'utf8'));
      if (doc && typeof doc.library_root === 'string' && doc.library_root) {
        return doc.library_root;
      }
    } catch (e) { /* fall through to the conventional location */ }
    return path.join(os.homedir(), 'StudyRoom');
  }

  // =====================================================================
  // THE SEVEN NAMED ASSERTIONS
  // =====================================================================
  const G25 = [];

  // (1) the ceiling agrees with the server, driven for FOUR extents so a
  //     single lucky record cannot carry it.
  G25.push({ name: 'G-25/stroke/ceiling-agrees-with-server', fn: function () {
    [[63, 54], [16, 15], [1, 1], [120, 90]].forEach(function (e) {
      const rec = g25Stroke(e[0], e[1], 250, 60);
      const got = g25Settle(rec, 5000, 5000);
      assert.deepStrictEqual({ x: got.x, y: got.y },
        { x: SRV.X_MAX - e[0], y: SRV.Y_MAX - e[1] },
        'G-25/stroke/ceiling-agrees-with-server — for a stroke whose ' +
        'largest relative point is (' + e[0] + ',' + e[1] + '), the largest ' +
        'origin the clamp will settle on must be the largest origin ' +
        'validate_decorations accepts, on BOTH axes. The server checks ' +
        'origin + point, so the ceiling is MAX - extent. `strokeBox` returns ' +
        'a SPAN and the shipped clamp consumes it as a COUNT, which is ' +
        'exactly one pixel of slack and is F-23');
    });
  } });

  // (2) THE NO-OP CONTROL. It protects the marks she has already placed, and
  //     it must be GREEN BEFORE the fix as well as after — a control that is
  //     red before the change is not measuring what it claims.
  G25.push({ name: 'G-25/boxkind/unchanged', fn: function () {
    const cases = [
      ['sticker', { page: 'abc123', kind: 'sticker', sprite: 'washi-stripe',
        x: 250, y: 60 }, { x: 332, y: 166 }],
      ['text', { page: 'abc123', kind: 'text', x: 250, y: 60, text: '' },
        { x: 308, y: 166 }],
      ['image', { page: 'abc123', kind: 'image', ref: 'i1', x: 250, y: 60 },
        { x: 332, y: 154 }],
      ['photo', { page: 'abc123', kind: 'photo', x: 250, y: 60 },
        { x: 308, y: 136 }]
    ];
    cases.forEach(function (c) {
      const got = g25Settle(c[1], 5000, 5000);
      assert.deepStrictEqual({ x: got.x, y: got.y }, c[2],
        'G-25/boxkind/unchanged — a ' + c[0] + ' record must settle on the ' +
        'BYTE-IDENTICAL origin it settled on before this change. These four ' +
        'kinds carry a genuine COUNT-box and already clamp correctly, so a ' +
        'fix that shifted them by a pixel would move marks she has already ' +
        'placed on a page she has already approved. PINNED BY VALUE, which ' +
        'is the point: derived expectations agree with whatever the code does');
    });
  } });

  // (3) the TRUE minimum, not zero.
  G25.push({ name: 'G-25/extent/true-minimum', fn: function () {
    // Unreachable from the UI — commitStroke rebases every append so the
    // stored minimum is always 0. Reachable from a HAND-EDITED store, which
    // is the same reason validate_decorations exists at all.
    const rec = { page: 'abc123', kind: 'stroke', x: 250, y: 60,
      pts: [[-20, -10, 30, 40]] };
    const got = g25Settle(rec, -5000, -5000);
    assert.strictEqual(got.y, SRV.Y_MIN - (-10),
      'G-25/extent/true-minimum — a record whose smallest relative point is ' +
      'NEGATIVE must clamp against THAT minimum, not against zero. Its ' +
      'lowest ink sits at origin + (-10), so the floor is MIN + 10. Seeding ' +
      'an extent at zero is exactly what made strokeBox unable to see a ' +
      'negative offset');
    assert.strictEqual(got.x, NB_SRC_CONSTS.NB_MARK_BOUNDS.x0,
      'G-25/extent/true-minimum — and on x the MARK CANVAS floor wins, ' +
      'because the client is deliberately STRICTER than the server there ' +
      '(her `right-page-only` ruling, A-12). That direction is intended: a ' +
      'client that refuses MORE than the server can never produce a payload ' +
      'the server rejects');
  } });

  // (4) no legal origin at all — hold position rather than invent one.
  G25.push({ name: 'G-25/empty-interval/holds-position', fn: function () {
    const rec = { page: 'abc123', kind: 'stroke', x: 250, y: 60,
      pts: [[0, 0, 400, 300]] };
    const got = g25Settle(rec, 10, 10);
    assert.deepStrictEqual({ x: got.x, y: got.y }, { x: 250, y: 60 },
      'G-25/empty-interval/holds-position — a record whose own point span ' +
      'exceeds the page has NO legal origin on either axis: the floor is ' +
      'above the ceiling. The clamp must return the record\'s CURRENT ' +
      'origin rather than invent one, and leave the write to be refused ' +
      'honestly. Inventing an origin there would move her mark to a place ' +
      'she did not choose AND still be refused');
  } });

  // (5) the two files' bounds, asserted equal FROM BOTH SIDES.
  G25.push({ name: 'G-25/mirror/constants-agree', fn: function () {
    const pairs = [['NB_DECOR_X_MIN', 'X_MIN'], ['NB_DECOR_X_MAX', 'X_MAX'],
      ['NB_DECOR_Y_MIN', 'Y_MIN'], ['NB_DECOR_Y_MAX', 'Y_MAX']];
    const lifted = {};
    pairs.forEach(function (p) {
      const m = new RegExp('\\n\\s*var ' + p[0] + '\\s*=\\s*(-?\\d+)\\s*;')
        .exec(appCode);
      assert.ok(m,
        'G-25/mirror/constants-agree — ' + p[0] + ' must be DECLARED in ' +
        'app.js as a plain integer, mirroring server.py. Silent divergence ' +
        'between these two files is exactly how F-23 was born');
      lifted[p[1]] = parseInt(m[1], 10);
    });
    assert.deepStrictEqual(lifted, SRV,
      'G-25/mirror/constants-agree — the four client constants must EQUAL ' +
      'the four DECOR_* server constants, both sides read as TEXT from ' +
      'their own file. The pen caps already assert equality this way ' +
      '(NB_PEN_PTS_CAP / DECOR_PTS_CAP); this joins that mechanism rather ' +
      'than authoring a second one. Client ' + JSON.stringify(lifted) +
      ' vs server ' + JSON.stringify(SRV));
  } });

  // (6) THE END-TO-END ASSERTION — the one that would have caught F-23.
  G25.push({ name: 'G-25/drag/round-trips-through-the-validator',
    fn: function () {
      [[63, 54], [46, 41], [50, 35]].forEach(function (e) {
        const rec = g25Stroke(e[0], e[1], 250, 60);
        g25Settle(rec, 5000, 5000);
        assert.strictEqual(g25Validate(g25Doc(rec)), 'None',
          'G-25/drag/round-trips-through-the-validator — a drag driven to ' +
          'the clamp\'s OWN ceiling must produce a day document the REAL ' +
          'validate_decorations accepts. Extent (' + e[0] + ',' + e[1] +
          ') settled at (' + rec.x + ',' + rec.y + '). This is the ' +
          'assertion that would have caught F-23: everything upstream can ' +
          'be internally consistent and still promise a write the server ' +
          'refuses');
      });
    } });

  // (7) THE KIND THE FIX ACTUALLY CHANGES. The new ceiling is one pixel
  //     TIGHTER on strokes, so a stored record already past it would be
  //     DISPLACED on her next drag — the fix moving her work, which is the
  //     one outcome it exists to prevent.
  G25.push({ name: 'G-25/stroke/no-stored-record-is-displaced',
    fn: function () {
      const store = path.join(g25LibraryRoot(), 'decorations.json');
      if (!fs.existsSync(store)) {
        process.stdout.write('  G-25/stroke/no-stored-record-is-displaced ' +
          'SKIPPED — no decoration store at ' + store + '. This claim is ' +
          'about the REAL archive and never invents a fixture corpus; a ' +
          'fixture would make it a claim about fixtures.\n');
        return;
      }
      // READ-ONLY, and proven so: the modification time is compared across
      // the read. Her handmade work is never written by a test (law 2).
      const before = fs.statSync(store).mtimeMs;
      const doc = JSON.parse(fs.readFileSync(store, 'utf8'));
      let seen = 0;
      Object.keys((doc && doc.days) || {}).sort().forEach(function (day) {
        ((doc.days[day] || {}).items || []).forEach(function (it, i) {
          if (!it || !Array.isArray(it.pts)) { return; }
          let mx = null;
          let my = null;
          it.pts.forEach(function (run) {
            if (!Array.isArray(run) || run.length < 4 || run.length % 2) {
              return;
            }
            for (let j = 0; j + 1 < run.length; j += 2) {
              if (mx === null || run[j] > mx) { mx = run[j]; }
              if (my === null || run[j + 1] > my) { my = run[j + 1]; }
            }
          });
          if (mx === null) { return; }
          seen++;
          const marginX = SRV.X_MAX - mx - it.x;
          const marginY = SRV.Y_MAX - my - it.y;
          process.stdout.write('  G-25/stroke/no-stored-record-is-displaced ' +
            day + ' idx' + i + ' stored=(' + it.x + ',' + it.y + ') ' +
            'margin_x=' + marginX + ' margin_y=' + marginY + '\n');
          assert.ok(marginX >= 0 && marginY >= 0,
            'G-25/stroke/no-stored-record-is-displaced — every STORED ' +
            'stroke must already satisfy the NEW, tighter ceiling on both ' +
            'axes, or the fix would move a mark she has already placed. ' +
            day + ' idx' + i + ' has margin (' + marginX + ',' + marginY +
            '). A NEGATIVE margin is a BLOCKING finding routed to her, ' +
            'never a silently accepted move of her work');
        });
      });
      assert.ok(seen > 0,
        'G-25/stroke/no-stored-record-is-displaced — the walk must have ' +
        'MEASURED at least one stored stroke. A pass over zero records is ' +
        'the degenerate implementation of this gate: a green equally ' +
        'consistent with "all inside" and "never ran"');
      assert.strictEqual(fs.statSync(store).mtimeMs, before,
        'G-25/stroke/no-stored-record-is-displaced — and the store\'s ' +
        'modification time is UNCHANGED across the read. "This did not ' +
        'touch her data" is a claim that gets checked, not asserted');
    } });

  // ---- run them ALL, print the roll call, then fail on the collected set --
  const g25Red = [];
  G25.forEach(function (c) {
    let err = null;
    try { c.fn(); } catch (e) { err = e; }
    process.stdout.write('  ' + (err ? 'RED  ' : 'green') + ' ' + c.name +
      (err ? ' :: ' + String(err.message).split('\n')[0].slice(0, 160) : '') +
      '\n');
    if (err) { g25Red.push(c.name); }
  });
  assert.strictEqual(G25.length, 7,
    '(G-25) SEVEN named assertions, counted — so one cannot be dropped ' +
    'without the count noticing');
  assert.deepStrictEqual(g25Red, [],
    '(G-25) these named assertions are RED: ' + g25Red.join(', ') +
    '. Every check is executed rather than halted at the first failure, ' +
    'because this group\'s whole value before the fix is the LIST of what ' +
    'fails — a gate whose red state has never been seen is a gate nobody ' +
    'has checked can fail');
})();

// ---- 9n: 26.9-07 — THE FREEHAND PEN --------------------------------------
//
// THE SHAPE OF THE VACUOUS TEST THIS GROUP IS WRITTEN AGAINST, stated first
// because a stroke test is unusually easy to write so that it measures
// nothing:
//
//   - "no stroke escapes the page bounds" is satisfied by an overlay with
//     ZERO polylines in it;
//   - "renders as SVG" is satisfied by an EMPTY <svg>;
//   - most geometry claims are satisfied by a stroke with ONE point.
//
// So every assertion below is paired with ink: a real multi-point stroke is
// driven through the real capture, the polylines are counted, and the points
// are read back BY VALUE. What is NOT claimed anywhere in this group is that
// the result reads as HANDWRITING at --k 1. That is her eye's judgement and
// it is routed to plan 08 in the SUMMARY, plainly, rather than implied by an
// assertion that could not see it.

// the pen's own scope, lifted whole. Real source everywhere it matters: the
// clamp, decoDay, the undo family and the painter are the SHIPPED ones, so
// this harness cannot answer the questions it is asking.
const PEN_DECLS = ['SVG_NS', 'NB_BOUNDS', 'NB_GUTTER_X',
  'NB_MARK_BOUNDS', 'NB_DECO_CAP', 'NB_PEN_PTS_CAP',
  'NB_PEN_STROKE_CAP', 'NB_UNDO_CAP', 'NB_TEXT_BOX', 'NB_IMG_BOX',
  'NB_STICKER_H'];
const PEN_FNS = ['clampDecoOrigin', 'decoDay', 'strokeList', 'strokeBox',
  'penFlatten', 'penShift', 'paintStrokeGroup', 'commitStroke',
  'attachPenCapture', 'setNotebookPen', 'nbSnapshot', 'applyNbSnapshot',
  'pushNbUndo', 'doNbUndo', 'nbResetDay', 'decoBox',
  // 26.9 F-9: commitStroke routes its reset-flag clear through this helper.
  'nbClearResetForEdit',
  // 26.91-18: THE ARMED SETTERS TRAVEL WITH THEIR BODY-CLASS HOOK, ALWAYS —
  // the DECO_PAINTER_SRC lesson, one dependency over. setNotebookPen calls
  // nbSyncArmedClass, so a roster that lifts the setter and not the hook
  // throws `nbSyncArmedClass is not defined` the moment the pen is armed.
  // MEASURED, not predicted: it did, in this exact rig, the first time the
  // hook shipped. Any future roster lifting either armed setter must carry
  // this name with it.
  'nbSyncArmedClass'];
const PEN_SRC = PEN_DECLS.map(declOf).join('\n') + '\n' +
  PEN_FNS.map(function (n) { return extractFn(appSrc, n); }).join('\n');

function penDoc(created) {
  function make(tag, ns) {
    const n = {
      tag: tag, ns: ns || null, cls: '', attrs: {}, kids: [],
      parentNode: null, text: '',
      style: { __p: {},
        setProperty: function (k, v) { this.__p[k] = v; } },
      handlers: {},
      addEventListener: function (t, fn) {
        (this.handlers[t] = this.handlers[t] || []).push(fn);
      },
      removeEventListener: function () {},
      setPointerCapture: function () {},
      releasePointerCapture: function () {},
      getBoundingClientRect: function () { return { left: 0, top: 0 }; },
      appendChild: function (c) { c.parentNode = this; this.kids.push(c); },
      removeChild: function (c) {
        const i = this.kids.indexOf(c);
        if (i !== -1) { this.kids.splice(i, 1); c.parentNode = null; }
      },
      setAttribute: function (k, v) { this.attrs[k] = v; }
    };
    Object.defineProperty(n, 'className', {
      get: function () { return this.cls; },
      set: function (v) { this.cls = v; }
    });
    Object.defineProperty(n, 'textContent', {
      get: function () { return this.text; },
      set: function (v) { this.text = v; }
    });
    created.push(n);
    return n;
  }
  // 26.91-18: A REAL <body> WITH A REAL classList, because the armed-tool
  // hook is a BODY CLASS and a stub would let every assertion about it pass
  // without measuring anything. `toggle` honours the two-argument form the
  // shipped code uses (`toggle(name, force)`), which is the whole mechanism
  // under test — a one-argument stub would flip on every call and turn the
  // disarm assertions into coin tosses that happen to land green.
  const bodyCls = [];
  const body = {
    classList: {
      add: function (c) {
        if (bodyCls.indexOf(c) === -1) { bodyCls.push(c); }
      },
      remove: function (c) {
        const i = bodyCls.indexOf(c);
        if (i !== -1) { bodyCls.splice(i, 1); }
      },
      contains: function (c) { return bodyCls.indexOf(c) !== -1; },
      toggle: function (c, force) {
        const on = arguments.length > 1 ? !!force
          : bodyCls.indexOf(c) === -1;
        if (on) { this.add(c); } else { this.remove(c); }
        return on;
      }
    },
    classes: bodyCls
  };
  return {
    createElement: function (t) { return make(t, null); },
    createElementNS: function (ns, t) { return make(t, ns); },
    body: body,
    addEventListener: function () {},
    removeEventListener: function () {}
  };
}

// A scene that keeps a LEDGER of every listener operation, in order, with
// the function reference and the capture flag — the 9a idiom. A remove with
// a fresh closure detaches nothing at all while the flag still reads false,
// so the reference is the assertion and not the count.
function penScene() {
  const ledger = [];
  const live = [];
  const scene = {
    kids: [],
    getBoundingClientRect: function () { return { left: 0, top: 0 }; },
    appendChild: function (c) { c.parentNode = scene; scene.kids.push(c); },
    removeChild: function (c) {
      const i = scene.kids.indexOf(c);
      if (i !== -1) { scene.kids.splice(i, 1); c.parentNode = null; }
    },
    addEventListener: function (t, fn, cap) {
      ledger.push({ op: '+', type: t, fn: fn, capture: !!cap });
      live.push({ type: t, fn: fn, capture: !!cap });
    },
    removeEventListener: function (t, fn, cap) {
      ledger.push({ op: '-', type: t, fn: fn, capture: !!cap });
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].type === t && live[i].fn === fn) { live.splice(i, 1); }
      }
    }
  };
  return { scene: scene, ledger: ledger, live: live };
}

function penRig(opts) {
  const o = opts || {};
  const created = [];
  const doc = penDoc(created);
  const s = penScene();
  const DEC = o.decorations || {};
  const calls = { post: 0, repaint: 0 };
  // 26.91-18: `NB_WRITE` IS INJECTED NOW, AND THIS IS THE PEN_DOWN LANDMINE
  // FIRING FOR REAL RATHER THAN BEING DESCRIBED. setNotebookPen has assigned
  // `NB_WRITE = false` since 26.91-02 — in sloppy mode that CREATED a global
  // rather than throwing, which is exactly why nobody noticed this rig never
  // declared it. nbSyncArmedClass now READS the same name, and a read of an
  // undeclared identifier throws, so the latent hole became a hard failure at
  // `setNotebookPen(false)` — where the write is never reached. Declaring it
  // here is the fix the PEN_DOWN comment already prescribes.
  // 26.91-36: `NB_TIN_OPEN` IS INJECTED NOW, AND IT IS THE PARAGRAPH ABOVE
  // FIRING A SECOND TIME, ONE IDENTIFIER OVER. nbSyncArmedClass now READS
  // NB_TIN_OPEN (arming a tool puts the tray away), and a read of an
  // undeclared identifier THROWS — so this rig died at `setNotebookPen(true)`
  // the moment that line shipped. Found by DRIVING, not by reading. Any
  // future roster lifting either armed setter must carry this name too.
  const names = ['document', 'NBDESIGN', 'NB_PEN', 'NB_WRITE', 'NB_PEN_GROUP',
    'NB_PEN_HANDLER', 'NB_DAY', 'NB_PLACE', 'DECORATIONS', 'NB_SEL',
    'NB_UNDO', 'NB_REDO', 'postDecorations', 'NB_REPAINT',
    'updateNbButtons', 'getComputedStyle', 'NB_STICKERS', 'NB_TIN_OPEN'];
  // eslint-disable-next-line no-new-func
  const api = new Function(names.join(','),
    PEN_SRC + '\nreturn {' +
    ' attachPenCapture: attachPenCapture,' +
    ' setNotebookPen: setNotebookPen,' +
    ' paintStrokeGroup: paintStrokeGroup,' +
    ' strokeBox: strokeBox, strokeList: strokeList, decoBox: decoBox,' +
    ' doNbUndo: doNbUndo, nbResetDay: nbResetDay,' +
    ' pushNbUndo: pushNbUndo,' +
    ' undoDepth: function () { return NB_UNDO.length; },' +
    ' pen: function () { return NB_PEN; },' +
    ' group: function () { return NB_PEN_GROUP; },' +
    ' setDesign: function (v) { NBDESIGN = v; },' +
    // 26.91-18: the armed body class, read back through the SHIPPED hook's
    // own effect rather than through a flag this rig maintains itself.
    ' bodyClasses: function () { return document.body.classes.slice(); },' +
    ' setWriteFlag: function (v) { NB_WRITE = v; },' +
    ' write: function () { return NB_WRITE; },' +
    ' setPenFlag: function (v) { NB_PEN = v; } };')(
    doc, true, false, false, null, null, '08/04/2026',
    { itemId: 'abc123', x0: 0 }, DEC, null, [], [],
    function () { calls.post++; },
    function () { calls.repaint++; },
    function () {},
    function () {
      return { getPropertyValue: function () { return '1'; } };
    },
    { 'moon': { x: 120, w: 20 } }, false);
  return { api: api, scene: s.scene, ledger: s.ledger, live: s.live,
    created: created, dec: DEC, calls: calls };
}

// Drive ONE stroke through the REAL capture: a pointerdown, N pointermoves
// and a pointerup, at --k 1. `pts` are client px.
function penDraw(rig, pts) {
  const down = rig.live.filter(function (l) {
    return l.type === 'pointerdown' && l.capture;
  });
  assert.strictEqual(down.length, 1,
    '(9n) exactly one capture-phase pointerdown listener is live');
  const ev = { clientX: pts[0][0], clientY: pts[0][1], pd: false, sp: false,
    preventDefault: function () { this.pd = true; },
    stopPropagation: function () { this.sp = true; } };
  down[0].fn(ev);
  function last(type) {
    const m = rig.live.filter(function (l) { return l.type === type; });
    return m.length ? m[m.length - 1].fn : null;
  }
  for (let i = 1; i < pts.length; i++) {
    const mv = last('pointermove');
    if (mv) { mv({ clientX: pts[i][0], clientY: pts[i][1] }); }
  }
  const up = last('pointerup');
  if (up) { up({}); }
  return ev;
}

function penItems(rig) {
  const d = rig.dec['08/04/2026'];
  return (d && Array.isArray(d.items)) ? d.items : [];
}

// ---- 9n(1): NO <canvas>, ANYWHERE — anchored, with its own positive control

(function () {
  const region = ['paintPageDecorations', 'paintStrokeGroup',
    'attachPenCapture', 'commitStroke', 'renderNotebookBand',
    'paintNotebookSpread'].map(bodyOf).join('\n');

  // THE ANCHORS MATTER AND THIS IS NOT PEDANTRY: the word "canvas" occurs
  // legitimately in this region — `.page-deco-canvas` is the shipped inert
  // placement layer 26.9-03 named — so a bare grep for it fires on CORRECT
  // code and would have to be relaxed until it measured nothing. Anchor on
  // the four ways a raster canvas can actually come into existence.
  assert.ok(region.indexOf('page-deco-canvas') !== -1,
    '(9n) POSITIVE CONTROL FOR THE ANCHORS: the region really does contain ' +
    'the string "canvas" (the shipped .page-deco-canvas), so a bare grep ' +
    'would fire on correct code and the anchored greps below are doing ' +
    'real work rather than being decorative');
  [["createElement('canvas')", "createElement('canvas')"],
    ['createElement("canvas")', 'createElement("canvas")'],
    ["'canvas')", "createElementNS(.., 'canvas')"],
    ['getContext(', 'getContext(']].forEach(function (pair) {
    assert.strictEqual(region.indexOf(pair[0]), -1,
      '(9n) THE RASTER ROUTE IS THE THING THE CONTRACT EXISTS TO PREVENT: ' +
      'no ' + pair[1] + ' anywhere in the notebook render region. A canvas ' +
      'would be a second rendering system, a second persistence shape and ' +
      'a second thing to rotate and scale');
  });
  // and the route that IS taken, by value
  assert.ok(bodyOf('paintStrokeGroup').indexOf('createElementNS') !== -1,
    '(9n) the overlay is built through createElementNS — element APIs, ' +
    'never a parsed markup string (T-26.9-35)');
  assert.ok(bodyOf('paintStrokeGroup').indexOf("'polyline'") !== -1,
    '(9n) and the node it makes per stroke is a polyline');
  ['innerHTML', 'outerHTML', 'insertAdjacentHTML'].forEach(function (sink) {
    assert.strictEqual(bodyOf('paintStrokeGroup').indexOf(sink), -1,
      '(9n) and no markup sink (' + sink + ') is anywhere near it');
  });
})();

// ---- 9n(2): THE STYLESHEET CONTRACT, BLOCK-SCOPED AND BY VALUE -----------

(function () {
  const css = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // ONE BLOCK, parsed from its selector to its closing brace. Block scoping
  // is the whole point here: `stroke-linecap: square` on one selector and
  // `shape-rendering: crispEdges` on another would be two correct
  // declarations styling nothing, and a file-wide grep for both would be
  // perfectly satisfied by that.
  const sel = '.page-deco-stroke polyline';
  const at = css.indexOf(sel);
  assert.notStrictEqual(at, -1, '(9n) the polyline rule exists');
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  const block = css.slice(open + 1, close);
  assert.ok(block.trim().length > 40,
    '(9n) positive control: the block is real (' + block.trim().length +
    ' chars) — a value check over an empty span proves nothing');
  const decls = block.split(';').map(function (d) { return d.trim(); })
    .filter(Boolean).sort();
  assert.deepStrictEqual(decls, [
    'fill: none',
    'shape-rendering: crispEdges',
    'stroke-linecap: square',
    'stroke-linejoin: miter',
    'stroke-width: 1',
    'stroke: var(--ink)'
  ], '(9n) THE WHOLE BLOCK, BY VALUE, as a set equality rather than as six ' +
     'separate contains-checks. SQUARE CAPS AND CRISP EDGES ARE BOTH HERE ' +
     'AND BOTH ARE IN THIS ONE BLOCK — they are what make a vector ' +
     'polyline read as pixel work beside pixel washi, and either one ' +
     'missing is a failure. Found: ' + JSON.stringify(decls));
  // NO NEW HEX. The ink is a palette token reference, not a literal.
  assert.strictEqual(block.indexOf('#'), -1,
    '(9n) NO NEW HEX: the stroke colour is a token reference, never a ' +
    'literal. This phase spends zero new colours');
  assert.ok(block.indexOf('stroke: var(--ink)') !== -1,
    '(9n) and the token is --ink, the same one the page text is drawn with');
  // the pen glyph's live state takes NEITHER the accent NOR --never
  const pat = css.indexOf('.station-nb-pen.is-on');
  assert.notStrictEqual(pat, -1, '(9n) the pen glyph has a live state');
  const pblock = css.slice(css.indexOf('{', pat) + 1,
    css.indexOf('}', css.indexOf('{', pat)));
  assert.strictEqual(pblock.indexOf('--accent'), -1,
    '(9n) and it is NOT the accent — the UI-SPEC list is closed at two and ' +
    'a mode toggle is not on it');
  assert.strictEqual(pblock.indexOf('--never'), -1,
    '(9n) nor the destructive colour — the pen is not destructive');
  assert.ok(pblock.indexOf('var(--ink)') !== -1 &&
    pblock.indexOf('var(--card)') !== -1,
  '(9n) it is an inverted chip built from two tokens already in the scene');
})();

// ---- 9n(3): THE TAP COUNTER-CASE — BOTH HALVES, IN ONE TEST -------------

(function () {
  // T1-6 is the non-degenerate half of the whole feature, so both sides are
  // driven here rather than in two tests that could drift apart:
  //   capture NOTHING  -> fails the drag half
  //   capture EVERYTHING -> fails the tap half
  const rig = penRig();
  rig.api.setNotebookPen(true);
  rig.api.attachPenCapture(rig.scene);

  // (a) A TAP: pointerdown and pointerup with ZERO movement.
  // 26.91-10 (A-12): every pen fixture below draws on the RIGHT PAGE.
  // Handwriting is one of the three kinds of mark her `right-page-only`
  // ruling names, so the pen's pointer gate now refuses a pointerdown
  // left of the gutter outright. At the old x=40 these strokes would be
  // refused and the tap/drag halves would both read 0 — the group would
  // go quietly vacuous instead of measuring capture.
  penDraw(rig, [[240, 90]]);
  assert.strictEqual(penItems(rig).length, 0,
    '(9n) T1-6 THE TAP HALF: a pointerdown/pointerup with no movement ' +
    'records EXACTLY 0 strokes. A capture-everything implementation would ' +
    'fill the store with empty polylines, one per stray tap on the page');
  assert.strictEqual(rig.api.undoDepth(), 0,
    '(9n) and it pushes NOTHING onto the undo stack — a refused mark is ' +
    'not an act, and an undo that handed back an unchanged page would be a ' +
    'keystroke that appears to do nothing');

  // (b) A DRAG: the same handler, with movement.
  const ev = penDraw(rig, [[240, 90], [244, 92], [252, 96], [260, 96]]);
  assert.strictEqual(ev.pd && ev.sp, true,
    '(9n) a drag on the page interior is claimed by the pen — prevented ' +
    'and stopped in the CAPTURE phase, so a mark underneath it is drawn ' +
    'over rather than dragged');
  const items = penItems(rig);
  assert.strictEqual(items.length, 1,
    '(9n) T1-6 THE DRAG HALF: one drag records EXACTLY 1 stroke group. ' +
    'Both halves are in this one test on purpose — either alone is passed ' +
    'by a degenerate implementation');
  assert.strictEqual(items[0].kind, 'stroke',
    '(9n) and it takes the fourth kind the store already carried');
  assert.deepStrictEqual(Object.keys(items[0]).sort(),
    ['kind', 'page', 'pts', 'x', 'y'],
    '(9n) THE RECORD SHAPE, BY VALUE — the same day record, one new field ' +
    'and no new store: ' + JSON.stringify(Object.keys(items[0])));
  assert.strictEqual(items[0].page, 'abc123',
    '(9n) owned by the page, keyed by the blessing itemId (D-06)');
  assert.strictEqual(rig.api.strokeList(items[0]).length, 1,
    '(9n) ONE polyline for one drag');
  // THE INK ITSELF, BY VALUE — origin at the bounding-box corner and the
  // points held relative to it. Without this the group could be an empty
  // overlay and every structural assertion above would still hold.
  assert.deepStrictEqual([items[0].x, items[0].y], [240, 90],
    '(9n) the record origin IS the bounding-box corner (26.91-10: the ' +
    'absolute x moved with the fixture onto the right page; every RELATIVE ' +
    'point value below is byte-unchanged, which is the property that ' +
    'matters here)');
  assert.deepStrictEqual(items[0].pts[0], [0, 0, 4, 2, 12, 6, 20, 6],
    '(9n) AND THE INK IS THERE AND IS CORRECT: four points, whole scene ' +
    'px, held RELATIVE to the origin. An overlay with zero polylines ' +
    'satisfies every bounds claim in this group and fails here');

  // (c) T1-2: a SECOND drag joins the SAME group.
  penDraw(rig, [[300, 40], [304, 44], [308, 40]]);
  const after = penItems(rig);
  assert.strictEqual(after.length, 1,
    '(9n) T1-2: a second drag does NOT make a second record — it joins the ' +
    'group the pen is already drawing into');
  assert.strictEqual(rig.api.strokeList(after[0]).length, 2,
    '(9n) as a SECOND polyline in that group');
  assert.deepStrictEqual([after[0].x, after[0].y], [240, 40],
    '(9n) and the group REBASED: the origin moved to the new bounding-box ' +
    'corner (x stays 240, y drops to 40) rather than leaving the second ' +
    'stroke at a negative offset');
  assert.deepStrictEqual(after[0].pts, [
    [0, 50, 4, 52, 12, 56, 20, 56],
    [60, 0, 64, 4, 68, 0]
  ], '(9n) with EVERY point of BOTH strokes rebased by value — the first ' +
     'stroke moved down by 50 exactly, which is a rebase and not a reset');

  // (d) and the painted overlay carries one polyline per stroke.
  const node = rig.api.paintStrokeGroup(rig.scene, after[0]);
  assert.ok(node, '(9n) the group paints');
  assert.strictEqual(node.tag, 'button',
    '(9n) as a real element the drag can take hold of');
  assert.strictEqual(node.cls, 'page-deco page-deco-stroke',
    '(9n) wearing .page-deco — a stroke group is a decoration like any ' +
    'other, and .page-deco is where its slot, transform, selection outline ' +
    'and z come from');
  assert.strictEqual(node.kids.length, 1, '(9n) one child');
  const svg = node.kids[0];
  assert.strictEqual(svg.tag, 'svg', '(9n) an INLINE SVG, never a canvas');
  assert.strictEqual(svg.ns, 'http://www.w3.org/2000/svg',
    '(9n) in the SVG namespace, made through createElementNS');
  assert.strictEqual(svg.kids.length, 2,
    '(9n) ONE <polyline> PER STROKE — counted, because an empty <svg> ' +
    'satisfies "renders as SVG" perfectly');
  assert.ok(svg.kids.every(function (c) { return c.tag === 'polyline'; }),
    '(9n) and every child is a polyline');
  assert.strictEqual(svg.attrs.viewBox, '0 0 68 56',
    '(9n) the view box is the group\'s OWN box in SCENE px, so one user ' +
    'unit is one scene px and stroke-width 1 is a one-scene-px line at ' +
    'every --k');
  assert.deepStrictEqual(svg.kids.map(function (c) {
    return c.attrs.points;
  }), ['0,50 4,52 12,56 20,56', '60,0 64,4 68,0'],
  '(9n) and the POINTS THEMSELVES, by value, assembled from numbers that ' +
  'have been through Math.round — no stored string reaches this overlay ' +
  'at all, so there is no injection surface to sanitise (T-26.9-35)');
  assert.deepStrictEqual([node.style.__p['--w'], node.style.__p['--h']],
    ['68', '56'],
    '(9n) and the element box is the same box the view box is');
})();

// ---- 9n(4): T1-5 — CLAMPED AT ALL FOUR EDGES, AND ONE STEP PAST ---------

(function () {
  // Driven through the REAL capture, so this measures what the pen DOES
  // with the shipped clamp rather than that a number appears in a file.
  // A point is a ONE-SCENE-PX footprint, which is exactly the bound
  // server.py fences an origin at — so the client's clamp and the server's
  // refusal agree by construction rather than by two hand-typed tables.
  [
    // 26.91-10 REWRITTEN, NEVER DELETED (owner ruling `right-page-only`,
    // 2026-08-08, 26.91-CONTEXT.md A-12). THE PROPERTY IS UNCHANGED —
    // every edge reachable, one step past every edge pulled back — and only
    // the LEFT bound moved, from the spread's 4 to the gutter's 192,
    // because **26.9 D-05's** straddle clause is retired and handwriting is
    // one of the three kinds of mark her ruling names.
    ['left edge (THE GUTTER)', [192, 90], [192, 90]],
    ['one step past the left', [191, 90], [192, 90]],
    ['right edge', [379, 90], [379, 90]],
    ['one step past the right', [380, 90], [379, 90]],
    ['far past the right', [900, 90], [379, 90]],
    // 26.91-10: the y rows carry x=290 rather than x=90, so they measure
    // the y bound instead of being pulled sideways by the new left bound.
    ['top edge', [290, 4], [290, 4]],
    ['one step past the top', [290, 3], [290, 4]],
    ['bottom edge', [290, 189], [290, 189]],
    ['one step past the bottom', [290, 190], [290, 189]],
    ['far past the bottom (under the chrome band)', [290, 215], [290, 189]]
  ].forEach(function (row) {
    const rig = penRig();
    rig.api.setNotebookPen(true);
    rig.api.attachPenCapture(rig.scene);
    // start somewhere safely interior, then move to the edge case, so the
    // stroke is a real two-point stroke and the clamp is applied to a MOVE
    penDraw(rig, [[200, 100], row[1]]);
    const it = penItems(rig);
    assert.strictEqual(it.length, 1, '(9n) ' + row[0] + ': a stroke landed');
    const run = it[0].pts[0];
    assert.deepStrictEqual([it[0].x + run[2], it[0].y + run[3]], row[2],
      '(9n) T1-5 ' + row[0] + ': ' + JSON.stringify(row[1]) + ' is ' +
      'clamped to ' + JSON.stringify(row[2]) + ' — nothing can run under ' +
      'the chrome band. The bound is THE RIGHT PAGE at a 1px footprint ' +
      '(192-379, 4-189). On y it still agrees with server.py exactly; on x ' +
      'the client is now STRICTER than the server (4-379), which is the ' +
      'safe direction — a client that refuses more can never produce a ' +
      'payload the server rejects');
  });

  // ---- 26.91-10 (A-12): THE PEN HALF OF THE RULING, DRIVEN -------------
  //
  // The table above clamps a MOVE. This is the POINTERDOWN gate, and it is
  // a different code path: a press left of the gutter is not clamped, it is
  // declined outright — not prevented, not stopped, nothing recorded — so
  // the month grid underneath keeps its taps. Without this assertion the
  // ruling would be half delivered and the gate could revert silently.
  const leftRig = penRig();
  leftRig.api.setNotebookPen(true);
  leftRig.api.attachPenCapture(leftRig.scene);
  const leftEv = penDraw(leftRig, [[100, 90], [108, 96]]);
  assert.strictEqual(leftEv.pd, false,
    '(9n/A-12) a pointerdown at x=100 — ON THE MONTH GRID, left of the ' +
    'gutter — is NOT prevented. The calendar is the thing she navigates ' +
    'with on every spread now, and a pen that claimed those presses would ' +
    'take her navigation away');
  assert.strictEqual(leftEv.sp, false, '(9n/A-12) nor stopped');
  assert.strictEqual(penItems(leftRig).length, 0,
    '(9n/A-12) and NOTHING is recorded from it — marks live on the right ' +
    'page only');

  // AND THE BAND IS NOT A DRAWING SURFACE. A pointerdown below the page
  // interior is left ALONE — not prevented, not stopped — so the pen glyph,
  // undo, the reset row and the page flips keep working while the pen is
  // live. Excluded GEOMETRICALLY rather than by sniffing at classes.
  const rig = penRig();
  rig.api.setNotebookPen(true);
  rig.api.attachPenCapture(rig.scene);
  const ev = penDraw(rig, [[312, 200], [316, 204]]);
  assert.strictEqual(ev.pd, false,
    '(9n) a pointerdown on the BAND (y 200, the pen glyph\'s own row) is ' +
    'not prevented — otherwise the pen could be turned on and never off');
  assert.strictEqual(ev.sp, false, '(9n) nor stopped');
  assert.strictEqual(penItems(rig).length, 0,
    '(9n) and nothing is recorded from it');
})();

// ---- 9n(5): BOTH CEILINGS, AT THE CEILING AND ONE PAST (client side) -----

(function () {
  const CAPS = new Function(
    ['NB_PEN_PTS_CAP', 'NB_PEN_STROKE_CAP'].map(declOf).join('\n') +
    '\nreturn [NB_PEN_PTS_CAP, NB_PEN_STROKE_CAP];')();
  assert.deepStrictEqual(CAPS, [64, 16],
    '(9n) the two ceilings, BY VALUE — mirrored in server.py as ' +
    'DECOR_PTS_CAP / DECOR_STROKE_CAP and asserted equal from the python ' +
    'side too, because a ceiling the two sides disagree about is a ceiling ' +
    'the client silently walks through');

  // THE PER-STROKE POINT CEILING: drive cap + 8 distinct moves.
  const rig = penRig();
  rig.api.setNotebookPen(true);
  rig.api.attachPenCapture(rig.scene);
  // 26.91-10 (A-12): x shifted onto the right page. The relative point
  // values asserted below are unchanged, because they are measured from
  // the group's own box origin.
  const many = [[200, 10]];
  for (let i = 1; i <= CAPS[0] + 8; i++) { many.push([200 + i, 10]); }
  penDraw(rig, many);
  const it = penItems(rig);
  assert.strictEqual(it.length, 1, '(9n) the long stroke landed');
  assert.strictEqual(it[0].pts[0].length / 2, CAPS[0],
    '(9n) THE PER-STROKE POINT CEILING HOLDS AT EXACTLY ' + CAPS[0] + ': ' +
    (CAPS[0] + 9) + ' distinct positions were driven and ' + CAPS[0] +
    ' points were kept. Asserted by EQUALITY — a floor would be satisfied ' +
    'by keeping all of them');
  assert.deepStrictEqual(it[0].pts[0].slice(-2), [CAPS[0] - 1, 0],
    '(9n) and the points kept are the FIRST ' + CAPS[0] + ', so the ' +
    'ceiling stops capture rather than trimming from the wrong end');

  // THE PER-GROUP STROKE CEILING: draw cap + 2 separate strokes.
  const rig2 = penRig();
  rig2.api.setNotebookPen(true);
  rig2.api.attachPenCapture(rig2.scene);
  for (let n = 0; n < CAPS[1] + 2; n++) {
    penDraw(rig2, [[200 + n * 4, 20], [204 + n * 4, 24]]);
  }
  const g = penItems(rig2);
  assert.strictEqual(g.length, 1,
    '(9n) still ONE group — the refusal does not start a second one');
  assert.strictEqual(rig2.api.strokeList(g[0]).length, CAPS[1],
    '(9n) THE PER-GROUP STROKE CEILING HOLDS AT EXACTLY ' + CAPS[1] + ': ' +
    (CAPS[1] + 2) + ' strokes were drawn and ' + CAPS[1] + ' were kept');
  assert.strictEqual(rig2.api.undoDepth(), CAPS[1],
    '(9n) and the two refused strokes pushed NOTHING — ' + CAPS[1] +
    ' pushes for ' + CAPS[1] + ' accepted strokes, so the stack is not ' +
    'quietly filling with keystrokes that would undo nothing');
})();

// ---- 9n(6): A DECORATION LIKE ANY OTHER, WITH NOTHING TAUGHT ABOUT IT ----

(function () {
  // The claim this group exists for: a stroke group is selectable, movable,
  // rotatable, scalable, UNDOABLE and RESETTABLE through the mechanisms
  // 26.9-05 and 26.9-06 already shipped, with NEITHER of them taught about
  // strokes. Both halves are asserted: that the mechanisms are field-
  // agnostic in SOURCE, and that they actually work on a stroke when DRIVEN.
  ['nbSnapshot', 'applyNbSnapshot', 'pushNbUndo', 'doNbUndo', 'doNbRedo',
    'nbResetDay', 'attachPageDrag', 'bringDecoToFront', 'clampDecoOrigin',
    'previewDecoTransform', 'wrapDecoAngle', 'clampDecoScale']
    .forEach(function (name) {
      const body = bodyOf(name);
      assert.strictEqual(body.indexOf("'stroke'"), -1,
        '(9n) ' + name + ' KNOWS NOTHING ABOUT STROKES — it must not, or ' +
        'the pen would not be a kind of decoration but a second editor ' +
        'wearing one');
      assert.strictEqual(body.indexOf('pts'), -1,
        '(9n) ' + name + ' never names the pen\'s own field either. This ' +
        'is what makes the cut a deletion rather than a migration');
    });
  // attachPageDrag is the ONE exception and it is a GUARD, not a branch:
  // it declines outright while EITHER tool is armed and knows nothing else.
  //
  // 26.91-20 (A-15 r1): THE LITERAL MOVED BECAUSE THE OWNER MOVED THE RULE,
  // AND THIS PIN WAS REWRITTEN RATHER THAN RELAXED. It read
  // `if (NB_PEN) { return; }` until 2026-08-09, when her ruling made `write`
  // lock a placed mark exactly as the pen does. THE CLAIM IS UNCHANGED —
  // one early return, never a branch — and it is still pinned BY VALUE.
  //
  // Widening this to a bare `NB_PEN` substring search would have admitted
  // this wave's own change by WEAKENING the pin, which is precisely the
  // move this phase forbids. The new literal is pinned instead, so the next
  // change to this guard has to come back here and say so too.
  assert.ok(bodyOf('attachPageDrag')
    .indexOf('if (NB_PEN || NB_WRITE) { return; }') !== -1,
    '(9n) attachPageDrag\'s only knowledge of the armed tools is one early ' +
    'return — either tool armed and marks are locked; both off and you ' +
    'arrange. Found instead: ' +
    JSON.stringify((bodyOf('attachPageDrag')
      .match(/if\s*\([^)]*NB_[^)]*\)\s*\{\s*return;\s*\}/g) || [])));

  // decoBox IS the seam, and it is asserted by value against a hand-made
  // record: without this branch a stroke group would be clamped and turned
  // as though it were a 72x24 hand-text element.
  const rig = penRig();
  const rec = { kind: 'stroke', x: 10, y: 10,
    pts: [[0, 0, 30, 0, 30, 20]] };
  assert.deepStrictEqual(rig.api.decoBox(rec), { w: 30, h: 20 },
    '(9n) decoBox derives a stroke group\'s box FROM ITS POINTS — this is ' +
    'the one seam that makes the drag, the clamp, the rotation centre and ' +
    'the handle wrapper all correct for a stroke without any of them ' +
    'knowing what a stroke is');
  assert.deepStrictEqual(rig.api.decoBox({ kind: 'text' }), { w: 72, h: 24 },
    '(9n) positive control: the other kinds are untouched');
  // a perfectly straight line still has a box to take hold of
  assert.deepStrictEqual(
    rig.api.decoBox({ kind: 'stroke', x: 0, y: 0, pts: [[0, 0, 40, 0]] }),
    { w: 40, h: 1 },
    '(9n) and a perfectly horizontal line floors at 1 in the other axis — ' +
    'a zero-size element is unselectable, undraggable and invisible');

  // UNDO, DRIVEN through the shipped stack.
  const r2 = penRig();
  r2.api.setNotebookPen(true);
  r2.api.attachPenCapture(r2.scene);
  penDraw(r2, [[240, 90], [248, 96], [256, 90]]);
  penDraw(r2, [[300, 40], [308, 48]]);
  assert.strictEqual(r2.api.strokeList(penItems(r2)[0]).length, 2,
    '(9n) two strokes in the group before the undo');
  r2.api.doNbUndo();
  assert.strictEqual(r2.api.strokeList(penItems(r2)[0]).length, 1,
    '(9n) ONE UNDO TAKES BACK ONE STROKE — through the shipped 60-deep ' +
    'stack, which snapshots the WHOLE day record and therefore carried the ' +
    'pen\'s new field without being told about it');
  r2.api.doNbUndo();
  assert.strictEqual(penItems(r2).length, 0,
    '(9n) and the second undo takes the group itself back off the page');

  // RESET, DRIVEN — and the records SURVIVE, which is the half a delete
  // implementation would fail while every visible outcome stayed identical.
  const r3 = penRig();
  r3.api.setNotebookPen(true);
  r3.api.attachPenCapture(r3.scene);
  penDraw(r3, [[240, 90], [248, 96], [256, 90]]);
  const before = JSON.stringify(penItems(r3));
  r3.api.nbResetDay('08/04/2026');
  assert.strictEqual(r3.dec['08/04/2026'].reset, true,
    '(9n) the day reset flags the day');
  assert.strictEqual(JSON.stringify(penItems(r3)), before,
    '(9n) AND THE STROKE RECORD IS STILL THERE, byte-identical. That is ' +
    'the half a delete-based reset would fail with every visible outcome ' +
    'unchanged — and it is the only thing that makes the reset undoable');
  r3.api.doNbUndo();
  assert.strictEqual(r3.dec['08/04/2026'].reset, false,
    '(9n) and one undo puts the day back, flag and all');

  // DRAWING ON A RESET DAY CLEARS THE FLAG — the shipped placeFromTray
  // rule, applied to the pen for the same reason: between an invisible
  // write and a visible restoration, take the visible one.
  const r4 = penRig({ decorations: { '08/04/2026': { reset: true,
    items: [] } } });
  r4.api.setNotebookPen(true);
  r4.api.attachPenCapture(r4.scene);
  penDraw(r4, [[240, 90], [248, 96]]);
  assert.strictEqual(r4.dec['08/04/2026'].reset, false,
    '(9n) a stroke drawn on a reset day clears the flag, so her line is ' +
    'never written into a day whose records are hidden');
})();

// ---- 9n(7): THE ONE SCENE LISTENER, BOUND ONCE AND RELEASED -------------

(function () {
  const rig = penRig();
  // pen OFF: nothing is bound at all.
  rig.api.attachPenCapture(rig.scene);
  assert.deepStrictEqual(rig.ledger, [],
    '(9n) with the pen down, attachPenCapture binds NOTHING — there is no ' +
    'listener sitting on the scene waiting to be gated by a flag');

  rig.api.setNotebookPen(true);
  rig.api.attachPenCapture(rig.scene);
  const first = rig.ledger.slice();
  assert.deepStrictEqual(first.map(function (l) { return l.op + l.type; }),
    ['+pointerdown'],
    '(9n) turning the pen on binds exactly one pointerdown');
  assert.strictEqual(first[0].capture, true,
    '(9n) IN THE CAPTURE PHASE, and that is load-bearing: a decoration\'s ' +
    'own pointerdown calls stopPropagation, so a stroke begun on top of an ' +
    'existing mark would otherwise become a drag of that mark');

  // a repaint must not STACK a second handler
  rig.api.attachPenCapture(rig.scene);
  const ops = rig.ledger.map(function (l) { return l.op; });
  assert.deepStrictEqual(ops, ['+', '-', '+'],
    '(9n) a repaint RELEASES before it re-binds — a handler per repaint ' +
    'would fire the capture N times on one pointerdown');
  assert.strictEqual(rig.ledger[1].fn, rig.ledger[0].fn,
    '(9n) AND THE RELEASE HANDS BACK THE SAME FUNCTION REFERENCE. A remove ' +
    'with a fresh closure detaches nothing at all, and the ledger would ' +
    'still read [+,-,+] while two live handlers accumulated');
  assert.strictEqual(rig.live.filter(function (l) {
    return l.type === 'pointerdown';
  }).length, 1, '(9n) so exactly ONE pointerdown handler is live');

  // turning the pen off RELEASES rather than gates
  rig.api.setNotebookPen(false);
  rig.api.attachPenCapture(rig.scene);
  assert.strictEqual(rig.live.filter(function (l) {
    return l.type === 'pointerdown';
  }).length, 0,
  '(9n) turning the pen off RELEASES the binding rather than merely ' +
  'gating it — nbKeydown\'s discipline, for nbKeydown\'s reason: a ' +
  'listener that outlives its mode is a listener somebody has to remember');

  // and leaving design mode does the same, with the pen still nominally on
  const r2 = penRig();
  r2.api.setNotebookPen(true);
  r2.api.attachPenCapture(r2.scene);
  r2.api.setDesign(false);
  r2.api.attachPenCapture(r2.scene);
  assert.strictEqual(r2.live.length, 0,
    '(9n) and leaving the notebook\'s design mode releases it too');
  // the pen cannot be RAISED outside the mode at all
  const r3 = penRig();
  r3.api.setDesign(false);
  r3.api.setNotebookPen(true);
  assert.strictEqual(r3.api.pen(), false,
    '(9n) setNotebookPen declines outright outside design mode — the pen ' +
    'is a mode WITHIN the mode, never a second mode');

  // and leaving the mode LOWERS it, so a re-entry never lands mid-stroke
  const exit = bodyOf('setNotebookDesign');
  assert.ok(exit.indexOf('NB_PEN = false;') !== -1 &&
    exit.indexOf('NB_PEN_GROUP = null;') !== -1,
  '(9n) leaving the notebook\'s design mode lowers the pen AND drops the ' +
  'group it was drawing into — re-entering must never resume a stroke ' +
  'session she left');
  const raise = bodyOf('renderNotebookStation');
  assert.ok(raise.indexOf('NB_PEN = false;') !== -1,
    '(9n) and a station RAISE lands with the pen down, exactly as it lands ' +
    'in reading mode with nothing selected');
})();

// ---- 9n(8): THE PAINTER'S STROKE BRANCH, DRIVEN THROUGH paintPageDecorations

(function () {
  // The seam 26.9-05's M-T9 found the hard way: two instruments on either
  // side of a seam and nothing across it. So the stroke branch is driven
  // through the REAL page painter rather than by calling paintStrokeGroup.
  const created = [];
  const doc = penDoc(created);
  const nodes = [];
  const scene = {
    ownerDocument: doc,
    appendChild: function (n) { nodes.push(n); },
    querySelector: function () { return null; }
  };
  const dayRecord = { reset: false, items: [
    { page: 'abc123', kind: 'stroke', x: 20, y: 30,
      pts: [[0, 0, 10, 4, 20, 0], [4, 12, 24, 12]] }] };
  const src = NB_HELPERS + '\n' +
    ['SVG_NS'].map(declOf).join('\n') + '\n' +
    NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
    extractFn(appSrc, 'strokeList') + '\n' +
    extractFn(appSrc, 'strokeBox') + '\n' +
    extractFn(appSrc, 'paintStrokeGroup') + '\n' +
    extractFn(appSrc, 'attachPageDrag') + '\n' +
    DECO_PAINTER_SRC + '\n' +
    extractFn(appSrc, 'paintDecoHandles');
  function run(rec, mode, pen) {
    nodes.length = 0;
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'DECORATIONS', 'document', 'NBDESIGN', 'NB_BOUNDS', 'NB_TEXT_BOX',
      'NB_DRAG_THRESHOLD', 'NB_REPAINT', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', '$', 'getComputedStyle', 'decoDay',
      'NB_STICKERS', 'NB_STICKER_H', 'NB_SHEET_W', 'NB_IMG_BOX',
      'NB_DECO_CAP', 'NB_TIN_OPEN', 'paintStickerCrop', 'recordIncident',
      'dismissTray', 'encodeURIComponent', 'NB_SEL', 'bringDecoToFront',
      // 26.91-20: NB_WRITE JOINS NB_PEN HERE, AND IT IS NOT OPTIONAL.
      // This rig varies the pen as a real parameter, so it does not use
      // PEN_DOWN — and A-15 ruling 1 made attachPageDrag's guard READ
      // NB_WRITE. Without it this harness throws a ReferenceError the
      // moment a pointerdown lands, which is exactly the sloppy-mode
      // landmine PEN_DOWN's own comment was written about, one identifier
      // over. It is pinned FALSE: this group is about the pen.
      'pushNbUndo', 'NB_PEN', 'NB_WRITE',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn paintPageDecorations;')(
      { '08/04/2026': rec }, doc, !!mode,
      { x0: 4, x1: 380, y0: 4, y1: 190 }, { w: 72, h: 24 }, 3, null,
      function () {}, '08/04/2026', function () {},
      function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      function () { return rec; },
      { 'moon': { x: 120, w: 20 } }, 24, 316, { w: 48, h: 36 }, 48, false,
      function () { return true; }, function () {}, function () {},
      global.encodeURIComponent, null, function () {}, function () {},
      !!pen, false,
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    fn(scene, { itemId: 'abc123', dayLabel: '08/04/2026' }, 'right',
      {}, [], guard);
    return nodes.slice();
  }

  const painted = run(dayRecord);
  assert.strictEqual(created.filter(function (n) {
    return n.tag === 'canvas';
  }).length, 0,
  '(9n) NO <canvas> NODE EXISTS ANYWHERE IN THE STATION SCENE — asserted ' +
  'over every node the painter actually created, not only over the source');
  const deco = painted.filter(function (n) {
    return String(n.cls).indexOf('page-deco-stroke') !== -1;
  });
  assert.strictEqual(deco.length, 1,
    '(9n) the page painter renders the stroke group through its ONE new ' +
    'branch — driven across the seam, not by calling paintStrokeGroup');
  const svg = deco[0].kids[0];
  assert.strictEqual(svg.tag, 'svg', '(9n) as an inline SVG');
  assert.strictEqual(svg.kids.length, 2,
    '(9n) with one polyline per stroke — TWO, counted, because an empty ' +
    'svg would pass "renders as SVG"');
  assert.deepStrictEqual([deco[0].style.__p['--x'], deco[0].style.__p['--y'],
    deco[0].style.__p['--w'], deco[0].style.__p['--h']],
  ['20', '30', '24', '12'],
  '(9n) at the record\'s own slot, with the box DERIVED from the points ' +
  '(24 wide because the SECOND stroke reaches further than the first — a ' +
  'box read off one run would be 20 and would clip her line)');
  assert.deepStrictEqual([deco[0].style.__p['--a'], deco[0].style.__p['--s'],
    deco[0].style.__p['--i']], ['0', '1', '0'],
  '(9n) and it takes the SAME transform and draw-order properties every ' +
  'other decoration takes — the resting defaults, from the shipped ' +
  'normalisers, with no stroke branch in either');
  assert.deepStrictEqual([deco[0].attrs['aria-hidden'],
    deco[0].attrs.tabindex], ['true', '-1'],
  '(9n) and the shipped chrome posture, as a PAIR — aria-hidden on a ' +
  'focusable element is a WCAG 4.1.2 defect, so the two ride together');

  // A GROUP WITH NO USABLE POINTS RENDERS NOTHING — the same silence an
  // off-roster sprite name gets, and the reason a one-point run is not a
  // stroke.
  const empty = run({ reset: false, items: [
    { page: 'abc123', kind: 'stroke', x: 20, y: 30, pts: [[4, 4]] }] });
  assert.strictEqual(empty.filter(function (n) {
    return String(n.cls).indexOf('page-deco-stroke') !== -1;
  }).length, 0,
  '(9n) a one-point run is not a stroke and renders NOTHING — no empty ' +
  'overlay, no placeholder node');

  // A RESET DAY paints no decoration layer at all, stroke included.
  const wasReset = run({ reset: true, items: dayRecord.items });
  assert.strictEqual(wasReset.length, 0,
    '(9n) and a reset day paints nothing — the shipped early return needed ' +
    'no stroke branch either');

  // ---- PEN ON, YOU DRAW; PEN OFF, YOU ARRANGE — BOTH HALVES, DRIVEN ----
  //
  // Asserted through the REAL attachPageDrag on a REAL painted node, and
  // both ways round: a guard that always declined would pass the pen-on
  // half alone and would have quietly disabled every drag in the editor.
  function grab(pen) {
    const rec = { page: 'abc123', kind: 'sticker', sprite: 'moon',
      x: 40, y: 90 };
    const out = run({ reset: false, items: [rec] }, true, pen);
    const el = out.filter(function (n) {
      return String(n.cls).indexOf('page-deco-sprite') !== -1;
    })[0];
    assert.ok(el, '(9n) the mark painted');
    const down = (el.handlers.pointerdown || [])[0];
    assert.ok(down, '(9n) and it carries a pointerdown');
    const ev = { clientX: 100, clientY: 100, pointerId: 1, pd: false,
      preventDefault: function () { this.pd = true; },
      stopPropagation: function () {} };
    down(ev);
    return { ev: ev, el: el };
  }
  assert.strictEqual(grab(false).ev.pd, true,
    '(9n) PEN OFF: a pointerdown on a mark is claimed by the drag, exactly ' +
    'as 26.9-05 shipped it. This is the half that stops "always decline" ' +
    'from passing');
  assert.strictEqual(grab(true).ev.pd, false,
    '(9n) PEN ON: attachPageDrag declines outright, so the pointerdown ' +
    'stays available to the pen. Without this a stroke begun on top of an ' +
    'existing mark would move the mark instead of drawing a line');
})();

// ---- 9o: 26.9-07 — THE CUT LADDER IS STILL TRUE AT THE TOP OF IT --------
//
// D-24's cut order only means anything if it is still true when the last
// wave lands. So it is ASSERTED rather than assumed, and asserted as an
// EQUALITY against an enumerated set of permitted sites — never as a floor,
// because a floor is satisfied by any number of new references and would let
// the ladder rot silently between here and the freeze.

(function () {
  const srvRaw = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const genRaw = fs.readFileSync(path.join(ROOT, 'tools/gen_room_sprites.py'),
    'utf8');
  const coreRaw = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
  const htmlRaw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cssRaw = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  // python comments are line comments; docstrings are prose and are left in
  // deliberately, because every count below is over a QUOTED literal and
  // prose does not quote.
  function stripPy(s) {
    return s.split('\n').filter(function (l) {
      return l.trim().indexOf('#') !== 0;
    }).join('\n');
  }
  function count(hay, needle) {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }
  const srv = stripPy(srvRaw);
  const gen = stripPy(genRaw);
  const coreCode = stripComments(coreRaw);
  const cssCode = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

  // ---- (A) THE STROKE KIND'S REFERENCE SET, AS AN EQUALITY --------------
  //
  // This is the property that makes cutting this plan a DELETION rather
  // than a migration, and it is a property to PRESERVE rather than a
  // coincidence to hope for.
  const PERMITTED = ['decoBox', 'paintPageDecorations', 'commitStroke',
    'attachPenCapture'];
  const per = PERMITTED.map(function (n) {
    return count(bodyOf(n), "'stroke'");
  });
  assert.deepStrictEqual(per, [1, 1, 1, 1],
    '(9o) the four PERMITTED sites, each naming the kind exactly once: ' +
    'decoBox (the box seam), paintPageDecorations (the one render branch), ' +
    'commitStroke (the stored record) and attachPenCapture (the live ' +
    'preview record). Found: ' + JSON.stringify(per));
  const total = count(appCode, "'stroke'");
  assert.strictEqual(total, per.reduce(function (a, b) { return a + b; }, 0),
    '(9o) AND THE FILE-WIDE COUNT EQUALS THEIR SUM — a SET DIFFERENCE of ' +
    'zero. This is the assertion the plan asks for as an EQUALITY rather ' +
    'than a floor: a floor would be satisfied by any number of new ' +
    'references and the cut would quietly stop being free. File-wide ' +
    total + ', permitted ' + per.reduce(function (a, b) { return a + b; }, 0));
  assert.strictEqual(total, 4,
    '(9o) and the number itself, pinned BY VALUE so the equality above ' +
    'cannot be satisfied by both sides falling to zero together');
  // the comment strip is load-bearing here, and provably so: the pen's own
  // block comment writes the record shape out in prose.
  assert.ok(count(appSrc, "'stroke'") > total,
    '(9o) POSITIVE CONTROL: the RAW file names it more often than the code ' +
    'does (' + count(appSrc, "'stroke'") + ' vs ' + total + '), so the ' +
    'comment strip is doing real work — prose must never be able to ' +
    'answer a question about code');

  // the server's half: the kind membership list, and nothing else.
  assert.strictEqual(count(srv, '"stroke"'), 1,
    '(9o) server.py names the kind EXACTLY ONCE');
  const kindsLine = srv.split('\n').findIndex(function (l) {
    return l.indexOf('DECOR_KINDS = (') === 0;
  });
  const strokeLine = srv.slice(0, srv.indexOf('"stroke"')).split('\n').length
    - 1;
  assert.strictEqual(strokeLine, kindsLine,
    '(9o) and that once is the validator\'s kind membership list itself — ' +
    'the vocabulary, not a branch. There is no `if kind == "stroke"` ' +
    'anywhere in the validator, which is why the pen needed no schema edit ' +
    'in either direction');

  // nowhere else in the product at all.
  [['core.js', coreCode], ['index.html', htmlRaw],
    ['tokens.css', cssCode]].forEach(function (pair) {
    assert.strictEqual(count(pair[1], "'stroke'") +
      count(pair[1], '"stroke"'), 0,
    '(9o) ' + pair[0] + ' never names the kind. (tokens.css does carry ' +
    '`.page-deco-stroke` and the `stroke:` property — which is exactly ' +
    'why this counts the QUOTED literal and not the word)');
  });
  assert.ok(cssCode.indexOf('page-deco-stroke') !== -1,
    '(9o) positive control for that last one: tokens.css really does ' +
    'contain the word, so the quoted-literal anchoring is load-bearing');

  // ---- (B) THE SAME SHAPE ONE TIER UP: RICHNESS 4 ----------------------
  //
  // Cutting decoration richness must stay a ROSTER EDIT PLUS A REGENERATION
  // — no geometry, no CSS, no store shape.
  const RICHNESS = ['stamp-round', 'washi-dot', 'tape-clear', 'thread'];
  const CORE6 = ['stamp-post', 'washi-stripe', 'corner-photo', 'ticket',
    'moon', 'candle-mark'];
  const roster = declOf('NB_STICKERS');
  const srvRoster = srv.slice(srv.indexOf('DECOR_SPRITES = ('),
    srv.indexOf(')', srv.indexOf('DECOR_SPRITES = (')) + 1);
  const genRoster = gen.slice(gen.indexOf("('stamp-post'"),
    gen.indexOf(']', gen.indexOf("('stamp-post'")) + 1);
  assert.ok(roster.length > 200 && srvRoster.length > 100 &&
    genRoster.length > 100,
  '(9o) positive control: all three rosters were located and are real (' +
    roster.length + '/' + srvRoster.length + '/' + genRoster.length + ')');

  RICHNESS.forEach(function (name) {
    assert.deepStrictEqual(
      [count(roster, "'" + name + "'"), count(srvRoster, '"' + name + '"'),
        count(genRoster, "'" + name + "'")], [1, 1, 1],
      '(9o) ' + name + ' appears exactly once in EACH of the three ' +
      'permitted rosters — the client table, the server roster and the ' +
      "generator's roster");
  });

  // AND NOWHERE ELSE — with the one real collision pinned BY VALUE rather
  // than waved through. `thread` is ALSO a shipped, entirely unrelated
  // vocabulary in this file (the reading list's `book.kind === 'thread'`),
  // which means a Tier-C cut performed with a grep would trip over three
  // occurrences that have nothing to do with stickers. That is a hazard
  // worth recording, not one worth relaxing an assertion around.
  const COLLISIONS = { 'thread': 3 };
  RICHNESS.forEach(function (name) {
    const outside = count(appCode, "'" + name + "'") -
      count(roster, "'" + name + "'");
    assert.strictEqual(outside, COLLISIONS[name] || 0,
      '(9o) outside the client roster, app.js names ' + name + ' exactly ' +
      (COLLISIONS[name] || 0) + ' times. The exception list is pinned BY ' +
      'VALUE so it is load-bearing rather than an escape hatch. Found: ' +
      outside);
    // outside the generator's roster the name may appear only in its OWN
    // drawing branch — one site, so a cut is still roster + regen.
    assert.strictEqual(count(gen, "'" + name + "'") -
      count(genRoster, "'" + name + "'"), 1,
    '(9o) and in the generator it has exactly ONE site beyond the roster: ' +
    'its own drawing branch, which is what a regeneration deletes with it');
    assert.strictEqual(count(srv, '"' + name + '"') -
      count(srvRoster, '"' + name + '"'), 0,
    '(9o) the server names it in the roster and NOWHERE else — no ' +
    'geometry, no branch, no store shape');
    [['core.js', coreCode], ['index.html', htmlRaw],
      ['tokens.css', cssCode]].forEach(function (pair) {
      assert.strictEqual(count(pair[1], name), 0,
        '(9o) and ' + pair[0] + ' never names ' + name + ' at all');
    });
  });
  // the collision is REAL and is what it is claimed to be, checked rather
  // than asserted: every extra `'thread'` in app.js is a book kind.
  const bookKinds = count(appCode, "kind: 'thread'") +
    count(appCode, "kind === 'thread'");
  assert.strictEqual(bookKinds, COLLISIONS.thread,
    '(9o) and all three are the READING LIST\'s book kind (`kind: ' +
    "'thread'` / `book.kind === 'thread'`), an unrelated shipped " +
    'vocabulary that happens to share a word with a sticker — so the ' +
    'exception is a name collision and not a leaked sticker reference');

  // the positive control that this whole section is not measuring an empty
  // set: the Core 6 are in the rosters too and are NOT in the cut.
  CORE6.forEach(function (name) {
    assert.strictEqual(count(roster, "'" + name + "'"), 1,
      '(9o) positive control: ' + name + ' (Core 6) is in the client ' +
      'roster too — the cut set is a strict subset, not the whole table');
  });
  assert.strictEqual(
    Object.keys(NB_SRC_CONSTS.NB_STICKERS).length,
    CORE6.length + RICHNESS.length,
    '(9o) and the roster is exactly Core 6 + Richness 4, counted');

  // ---- (C) THE SHEET WIDTH FOLLOWS THE ROSTER, EXECUTED ---------------
  const S = NB_SRC_CONSTS.NB_STICKERS;
  const full = Object.keys(S).reduce(function (a, k) { return a + S[k].w; },
    0);
  const cut = CORE6.reduce(function (a, k) { return a + S[k].w; }, 0);
  assert.deepStrictEqual([full, cut], [316, 156],
    '(9o) the sheet width is DERIVED from the roster — 316 scene px full, ' +
    '156 after a Tier-C cut. Run as arithmetic, not read off the UI-SPEC');
  assert.deepStrictEqual([full * 2, cut * 2], [632, 312],
    '(9o) so the PNG goes 632x48 -> 312x48 and a cut is a roster edit plus ' +
    'a regeneration: NO GEOMETRY, NO CSS, NO STORE SHAPE');
  // and the x offsets are a running prefix sum, so deleting the last four
  // entries leaves every surviving offset unchanged — which is the whole
  // reason the cut costs nothing.
  let run = 0;
  CORE6.forEach(function (k) {
    assert.strictEqual(S[k].x, run,
      '(9o) ' + k + ' sits at the running prefix sum ' + run + ', so a ' +
      'Tier-C cut moves NONE of the Core 6 offsets');
    run += S[k].w;
  });
})();

// ---- 9o(b): 26.9-09 — THE FIFTH KIND IS A VOCABULARY, NEVER A BRANCH ----
//
// 9o's shape, one kind later. The claim this holds is the same one that
// made the pen a branch rather than a schema edit: `server.py` names the
// new kind EXACTLY ONCE and that once is the membership list itself.
//
// THE NAME COLLIDES ON PURPOSE and the anchoring is what makes the count
// safe. The word `photo` is all over this product — `.station-photo`,
// `.page-deco-photo`, the `corner-photo` sticker, `STATION_NOTEBOOK_GEOM`'s
// own `photo` key, and the prose in the comment directly above the tuple.
// So every count here is of the QUOTED LITERAL — a quote, the word, a quote
// — never of the bare word, exactly as 26.9-07 anchored `'stroke'` against
// `.page-deco-stroke` and the CSS `stroke:` property. The positive control
// below proves the anchoring is load-bearing rather than decorative.

(function () {
  const srvRaw = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  function stripPy(s) {
    return s.split('\n').filter(function (l) {
      return l.trim().indexOf('#') !== 0;
    }).join('\n');
  }
  function count(hay, needle) {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }
  const srv = stripPy(srvRaw);

  assert.strictEqual(count(srv, '"photo"'), 1,
    '(9o) server.py names the new kind EXACTLY ONCE. A second occurrence ' +
    'would mean a per-kind branch had appeared in the validator, which is ' +
    'the drift 26.9-07 rejected for `pts` and rejects again here');
  const kindsLine = srv.split('\n').findIndex(function (l) {
    return l.indexOf('DECOR_KINDS = (') === 0;
  });
  assert.notStrictEqual(kindsLine, -1,
    '(9o) positive control: the DECOR_KINDS assignment line was located');
  const photoLine = srv.slice(0, srv.indexOf('"photo"')).split('\n').length
    - 1;
  assert.strictEqual(photoLine, kindsLine,
    '(9o) and that once is the validator\'s kind membership LIST — the ' +
    'vocabulary, not a branch. There is no `if kind == "photo"` anywhere ' +
    'in the validator, which is why the promoted polaroid needed no new ' +
    'field, no new bound and no new refusal case');
  // the negative has a subject: the file really does contain the name.
  assert.ok(srv.indexOf('photo') !== -1,
    '(9o) POSITIVE CONTROL for the negative above: server.py really does ' +
    'contain the word, so "no branch" is a measurement rather than a ' +
    'sentence about an absent string');
  // and the comment strip is load-bearing, proved rather than assumed: the
  // block comment above the tuple discusses the kind in prose at length.
  assert.ok(count(srvRaw, 'photo') > count(srv, '"photo"'),
    '(9o) the RAW file names the bare word far more often (' +
    count(srvRaw, 'photo') + ') than the code names the quoted literal (' +
    count(srv, '"photo"') + '), so both the comment strip AND the quote ' +
    'anchoring are doing real work — prose must never be able to answer a ' +
    'question about code');
})();

// ===========================================================================
// ---- 9p: 26.9-09 — THE PAGE'S OWN POLAROID IS A MARK ----------------------
//
// D-01's other half. WINDOWS row 19, built on the owner's explicit call.
//
// THE DEGENERATES THIS GROUP IS BUILT AGAINST, said in advance, because each
// one passes a different wrong implementation:
//
//   1. "RENDER NOTHING" satisfies every claim about the pinned slot. Only the
//      exactly-ONE promoted count can see it.
//   2. "RENDER BOTH ALWAYS" satisfies every claim about the promoted node.
//      Only the two zero-counts can see it.
//   3. "ATTACH NOTHING TO THE HANDLES" left every structural assertion in
//      wave 5 green, because the driven cases called attachPageDrag DIRECTLY
//      and never crossed the painter-to-drag seam (M-T9). So the drag here is
//      dispatched on THE NODE THE REAL PAINTER CREATED, and the assertion is
//      on the stored record's coordinates by value.
//   4. "HARDCODE THE INDEX" satisfies a --i assertion over a one-mark page.
//      The photo therefore lands at index 1 behind a placed picture.
//   5. "READ THE GEOMETRY ONCE AND HAND-TYPE IT" passes every by-value pin
//      today and drifts the first time the page composition moves. The
//      source assertion is what catches it, and the by-value pin is what
//      catches a geometry drift the source assertion cannot see. Each is the
//      other's blind spot and both are kept.
//   6. "OVERLOAD kind:image WITH ref === page" — 26.9-05's rejected
//      discriminator — renders ONE node, or two identical ones. The
//      both-kinds-on-one-page counter-case is what retires that objection.
//
// EVERY LIFTING HARNESS STATES ITS OWN PRE-STATE (26.9-07's leaked-global
// lesson): the pen is down, the mode is a PARAMETER and is varied, and
// `document` is DECLARED in the scope rather than assigned into the global
// object the way a sloppy-mode `new Function` body otherwise would.
// ===========================================================================

function loadPhotoScope(mode) {
  const state = { DECORATIONS: {}, NB_UNDO: [], NB_REDO: [], posted: [] };
  const src = [
    extractFn(appSrc, 'placeNotebookInert'),
    extractFn(appSrc, 'mulberry32'),
    extractFn(appSrc, 'blessingSeed'),
    extractFn(appSrc, 'pickBlessingDecoration'),
    NB_HELPERS,
    extractFn(appSrc, 'decoDay'),
    extractFn(appSrc, 'nbSnapshot'),
    extractFn(appSrc, 'applyNbSnapshot'),
    extractFn(appSrc, 'pushNbUndo'),
    extractFn(appSrc, 'doNbUndo'),
    extractFn(appSrc, 'doNbRedo'),
    extractFn(appSrc, 'updateNbButtons'),
    extractFn(appSrc, 'nbGlyphState'),
    extractFn(appSrc, 'nbResetDay'),
    NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin'),
    PEN_DOWN + extractFn(appSrc, 'attachPageDrag'),
    extractFn(appSrc, 'bringDecoToFront'),
    extractFn(appSrc, 'placeFromTray'),
    extractFn(appSrc, 'nbClearResetForEdit'),
    extractFn(appSrc, 'livePagePhoto'),
    extractFn(appSrc, 'ensurePagePhoto'),
    extractFn(appSrc, 'paintDecoHandles'),
    DECO_PAINTER_SRC,
    extractFn(appSrc, 'paintBlessingPage')
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function('S', 'mkdoc', 'MODE', `
    var DECORATIONS = S.DECORATIONS;
    var NB_UNDO = S.NB_UNDO, NB_REDO = S.NB_REDO;
    var NB_UNDO_CAP = ${/var NB_UNDO_CAP = (\d+);/.exec(appSrc)[1]};
    var NB_DAY = '08/04/2026';
    var NBDESIGN = MODE;
    var NB_SEL = null;
    var NB_TEXT_BOX = { w: 72, h: 24 };
    var NB_IMG_BOX = { w: 48, h: 36 };
    var NB_BOUNDS = { x0: 4, x1: 380, y0: 4, y1: 190 };
    // 26.91-10 (A-12): the mark canvas — the RIGHT PAGE. The spread
    // interior above is unchanged; only a mark's origin bound moved.
    var NB_GUTTER_X = 192;
    var NB_MARK_BOUNDS = { x0: 192, x1: 380, y0: 4, y1: 190 };
    var NB_DRAG_THRESHOLD = 3, NB_DECO_CAP = 48;
    var NB_STICKER_H = 24, NB_SHEET_W = 316, NB_TIN_OPEN = false;
    var NB_STICKERS = { 'moon': { x: 120, w: 20 } };
    var NB_PLACE = null;
    var NOTEBOOK_CAPTION_LINE_PX = 7 * 1.3;
    var NB_A_MOD = 360, NB_S_MIN = 0.5, NB_S_MAX = 2.0, NB_S_DEFAULT = 1;
    var NB_REPAINT = null;
    var __scene = null;
    var document = null;
    function postDecorations(d) { S.posted.push(d); }
    function dismissTray() {}
    function openHandTextEditor() {}
    function openContainerItem() {}
    function recordIncident() {}
    function paintStickerCrop(el, name) {
      el.style.setProperty('--sprite', name);
      return !!NB_STICKERS[name];
    }
    function escapeAttr(s) { return s; }
    function $() { return __scene; }
    function getComputedStyle() {
      return { getPropertyValue: function () { return '1'; } };
    }
    ${src}
    return {
      paint: function (entry, side, opts) {
        var o = opts || {};
        var built = mkdoc();
        __scene = built.scene;
        document = built.doc;
        paintBlessingPage(built.scene, entry, side, o.items || {},
          o.filters || [], o.guard || function () { return null; });
        return built.nodes;
      },
      place: function (itemId, x0, seed) {
        NB_PLACE = { itemId: itemId, x0: x0 };
        placeFromTray(seed);
      },
      box: function (rec) { return decoBox(rec); },
      sel: function () { return NB_SEL; },
      // 26.9-09: the mode is state she enters and leaves, so the harness
      // must be able to leave it too. The AUTO COMPOSITION is what the room
      // paints in READING mode — capturing it while arranging would capture
      // a page the mode had already promoted, and "the reset put it back"
      // would then be a claim about the wrong page.
      setMode: function (m) {
        NBDESIGN = m;
        // HARNESS FIDELITY, MIRRORED FROM THE SHIPPED SETTER AND CHECKED
        // IN SOURCE BELOW (9q), never invented: setNotebookDesign(false)
        // drops NB_SEL, because a coral outline is design-mode chrome and
        // must not survive into the reading loop (26.9-05). Without this
        // the harness would leave a selection alive outside the mode and
        // then compare pages that differ by chrome the app never paints.
        if (!m) { NB_SEL = null; }
      },
      resetDay: nbResetDay,
      undo: doNbUndo,
      redo: doNbRedo
    };`)(state, function () {
    const nodes = [];
    function mkNode(t) {
      const n = { tag: t, cls: '', attrs: {}, text: '', kids: [], __on: {},
        style: { setProperty: function (k, v) { this.__p[k] = v; },
          __p: {} },
        addEventListener: function (ty, fn) {
          (this.__on[ty] = this.__on[ty] || []).push(fn);
        },
        removeEventListener: function (ty, fn) {
          this.__on[ty] = (this.__on[ty] || []).filter(function (f) {
            return f !== fn;
          });
        },
        setPointerCapture: function () {},
        releasePointerCapture: function () {},
        appendChild: function (c) { this.kids.push(c); },
        getBoundingClientRect: function () { return { left: 0, top: 0 }; },
        // REAL EVENT PLUMBING. Wave 5's M-T9 went green because the paint
        // harness's addEventListener was a no-op, so nothing could cross
        // the painter-to-drag seam at all.
        fire: function (ty, ev) {
          (this.__on[ty] || []).slice().forEach(function (f) { f(ev); });
        } };
      Object.defineProperty(n, 'className', {
        get: function () { return this.cls; },
        set: function (v) { this.cls = v; } });
      Object.defineProperty(n, 'textContent', {
        get: function () { return this.text; },
        set: function (v) { this.text = v; } });
      Object.defineProperty(n, 'innerHTML', {
        get: function () { return this.__html || ''; },
        set: function (v) { this.__html = v; } });
      n.setAttribute = function (k, v) { this.attrs[k] = v; };
      return n;
    }
    const scene = {
      appendChild: function (n) { nodes.push(n); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getBoundingClientRect: function () { return { left: 0, top: 0 }; }
    };
    return { doc: { createElement: mkNode }, scene: scene, nodes: nodes };
  }, mode);
  api.state = state;
  return api;
}

(function () {
  const DAY = '08/04/2026';
  const MS = 1754300000000;
  const imgL = { itemId: 'img-left', dayLabel: DAY, title: 'the window',
    why: 'the light was good.', author: 'you', isImage: true, ms: MS };
  const imgR = { itemId: 'img-right', dayLabel: DAY, title: 'the hallway',
    why: 'you were laughing.', author: 'you', isImage: true,
    ms: MS + 3600000 };
  const txt = { itemId: 'txt-1', dayLabel: DAY, title: 'a walk',
    why: 'because.', author: 'you', isImage: false, ms: MS + 7200000 };

  const has = function (cls) {
    return new RegExp('(^|\\s)' + cls + '(\\s|$)');
  };
  const countCls = function (ns, cls) {
    return ns.filter(function (n) { return has(cls).test(String(n.cls)); })
      .length;
  };
  const oneCls = function (ns, cls) {
    const hit = ns.filter(function (n) {
      return has(cls).test(String(n.cls));
    });
    assert.strictEqual(hit.length, 1,
      '(9p) expected exactly one .' + cls + ' node, found ' + hit.length);
    return hit[0];
  };
  const at = function (n) {
    return [n.style.__p['--x'], n.style.__p['--y'],
      n.style.__p['--w'], n.style.__p['--h']];
  };
  const drag = function (el, x0, y0, x1, y1) {
    el.fire('pointerdown', { clientX: x0, clientY: y0, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {} });
    el.fire('pointermove', { clientX: x1, clientY: y1 });
    el.fire('pointerup', {});
  };

  // ---- T2-1: READING MODE — BYTE-FOR-BYTE WHAT SHIPS TODAY -------------
  const R0 = loadPhotoScope(false);
  const read = R0.paint(imgL, 'left');
  // TWO ASSERTIONS, NEVER ONE PAIR. A single deepStrictEqual over both
  // numbers conflates the two halves, and then a mutation cannot be
  // reported against the assertion it was written for — which is the whole
  // discipline this phase keeps re-learning.
  assert.strictEqual(countCls(read, 'station-photo'), 1,
    '(9p) T2-1a. NO RECORD: the pinned .station-photo slot paints EXACTLY ' +
    'ONE polaroid. "At least one" is a failure of this criterion');
  assert.strictEqual(countCls(read, 'page-deco-photo'), 0,
    '(9p) T2-1b. NO RECORD: and EXACTLY ZERO promoted nodes — a painter ' +
    'that drew both would put two copies of her photograph on the page');
  assert.strictEqual(R0.state.DECORATIONS[DAY].items.length, 0,
    '(9p) and READING MODE PROMOTES NOTHING. The photograph becomes a mark ' +
    'she can move only inside the mode she entered deliberately (law ' +
    'amendment 2026-07-18: locked by default, never in the reading loop)');

  // ---- T2-3 + T2-2 + T2-6 + T2-7: ONE FIXTURE, FIVE CLAIMS ------------
  //
  // A placed picture goes down FIRST, so the promoted polaroid lands at
  // array index 1 — which is what makes the --i pin able to fail a
  // hardcoded index, and what puts both kinds on one page.
  const R = loadPhotoScope(true);
  // 26.91-10 (F-1): the ONLY placement origin is now the right page's
  // 192 — paintNotebookSpread hands NB_PLACE a single value rather than
  // one of three, because there is no left page to place onto.
  R.place('img-left', 192, { kind: 'image', ref: 'img-left' });
  assert.strictEqual(R.state.DECORATIONS[DAY].items.length, 1,
    '(9p) precondition: the tin-placed picture is the only record so far, ' +
    'and it REFERENCES THE PAGE\'S OWN ITEM — the exact case 26.9-05 said ' +
    'a `ref === page` discriminator could not tell from the auto polaroid');
  // MEASURED AS A DELTA ACROSS THE PAINT, never as an absolute: the tin
  // placement above legitimately posted once and pushed once, and an
  // absolute count would be answering a question about placeFromTray.
  const postedBefore = R.state.posted.length;
  const undoBefore = R.state.NB_UNDO.length;
  assert.deepStrictEqual([postedBefore, undoBefore], [1, 1],
    '(9p) precondition: the tin placement posted once and pushed once');
  // 26.91-10 (F-1): painted on the RIGHT, which is the only side
  // paintNotebookSpread ever asks for now — the calendar owns the left half
  // of every spread. The side matters to THIS group specifically because
  // the polaroid's promoted record is created AT THE PAGE'S PINNED SLOT,
  // and on the left page that slot (x=62) now sits outside the mark canvas,
  // so T2-4's drag below would have measured the clamp instead of the
  // gesture. Every claim in the group is unchanged; the page moved to the
  // half it is painted on.
  const nodes = R.paint(imgL, 'right');
  const items = R.state.DECORATIONS[DAY].items;

  assert.strictEqual(items.length, 2,
    '(9p) T2-3: entering the mode promoted the polaroid to a record');
  const photoRec = items[1];
  assert.deepStrictEqual(Object.keys(photoRec).sort(),
    ['kind', 'page', 'x', 'y'],
    '(9p) NO NEW REFERENCE SURFACE, ASSERTED BY VALUE rather than assumed: ' +
    'the created record carries page, kind, x and y AND NOTHING ELSE — no ' +
    '`ref`, no sprite, no text, no points. A photo record IS the page\'s ' +
    'own item, so the page key is already the reference (T-26.9-41). ' +
    'Found: ' + JSON.stringify(Object.keys(photoRec).sort()));
  assert.deepStrictEqual([photoRec.kind, photoRec.page, photoRec.x,
    photoRec.y], ['photo', 'img-left', 246, 62],
  '(9p) T2-3, BY VALUE: the record is created AT THE PINNED SLOT — right ' +
  'page origin 246,62 (pageX.right 202 + photo.dx 44, photo.y 62) — so ' +
  'NOTHING MOVES at the moment of promotion. Found: ' +
  JSON.stringify([photoRec.kind, photoRec.page, photoRec.x, photoRec.y]));
  assert.strictEqual(R.state.posted.length, postedBefore,
    '(9p) and the promotion POSTS NOTHING. The mode making an existing ' +
    'thing touchable is not an act she performed, and a record encoding ' +
    'the resting position is not a change she can see');
  assert.strictEqual(R.state.NB_UNDO.length, undoBefore,
    '(9p) and it pushes NOTHING onto the history — an undo that handed ' +
    'back a page she never changed would be a keystroke that does nothing');

  assert.strictEqual(countCls(nodes, 'station-photo'), 0,
    '(9p) T2-2a. RECORD PRESENT: EXACTLY ZERO pinned slots. THIS IS THE ' +
    'ZERO-COUNT — it is what catches a painter that draws both, and it is ' +
    'the one M-P1 (drop the guarding condition) is written for');
  assert.strictEqual(countCls(nodes, 'page-deco-photo'), 1,
    '(9p) T2-2b. RECORD PRESENT: and EXACTLY ONE promoted node. THIS IS ' +
    'THE EXACTLY-ONE — it is what catches a branch that renders nothing ' +
    '(M-P2), which the zero-count above is satisfied by perfectly');

  const promoted = oneCls(nodes, 'page-deco-photo');
  assert.deepStrictEqual(at(promoted), ['246', '62', '72', '54'],
    '(9p) and the promoted node carries the polaroid\'s own 72x54 box at ' +
    'the pinned origin. The box comes through decoBox from the GEOMETRY ' +
    'TABLE, which is the seam that gives it the clamp, the rotation ' +
    'centre and the 12-scene-px handle wrapper for free');
  assert.ok(has('page-deco').test(String(promoted.cls)),
    '(9p) T2-6: it wears .page-deco — HER layer, calc(3 + var(--i))');
  assert.ok(!has('station-photo').test(String(promoted.cls)),
    '(9p) T2-6, THE OTHER DIRECTION: and it does NOT wear .station-photo ' +
    '(z 1, the furniture layer). The polaroid moves to her layer because ' +
    'the array position IS the draw order and the one reordering gesture ' +
    'moves a record to the END of the array — a photograph left on the ' +
    'furniture layer would be the single mark she can move but can never ' +
    'bring to the front, a rule nothing in the interface expresses');
  assert.strictEqual(promoted.style.__p['--i'],
    String(items.indexOf(photoRec)),
    '(9p) and --i is the ARRAY INDEX (' + items.indexOf(photoRec) + '), ' +
    'pinned against the array rather than against a literal — the photo ' +
    'sits behind a placed picture precisely so a hardcoded 0 fails here');
  assert.strictEqual(promoted.style.__p['--i'], '1',
    '(9p) and by value, so both sides cannot drift together');
  assert.deepStrictEqual(
    [promoted.attrs['aria-hidden'], promoted.attrs.tabindex], ['true', '-1'],
    '(9p) it falls into the SHIPPED TAIL: aria-hidden and tabindex=-1 ' +
    'together, never one without the other (WCAG 4.1.2 — these are ' +
    '<button>s). This is chrome to a screen reader exactly as the pinned ' +
    'polaroid already is');
  assert.deepStrictEqual(
    [promoted.style.__p['--a'], promoted.style.__p['--s']], ['0', '1'],
    '(9p) and through the shipped transform normalisers at their resting ' +
    'defaults — no second bound, no second normaliser');

  // ---- T2-7: THE COUNTER-CASE THAT RETIRES WAVE 5's OBJECTION ---------
  const decos = nodes.filter(function (n) {
    return has('page-deco').test(String(n.cls));
  });
  assert.strictEqual(decos.length, 2,
    '(9p) T2-7: a tin-placed picture that REFERENCES the page\'s own item ' +
    'and the promoted polaroid are TWO nodes on one page. A `ref === page` ' +
    'overload would paint ONE node, or two identical ones');
  assert.deepStrictEqual(decos.map(function (n) { return n.cls; }),
    ['page-deco page-deco-img', 'page-deco page-deco-photo'],
    '(9p) with two DISTINCT classes — told apart by the KIND, without ' +
    'inspecting any value');
  assert.deepStrictEqual(decos.map(at), [
    ['264', '79', '48', '36'],
    ['246', '62', '72', '54']],
  '(9p) and at two DISTINCT boxes by value — 48x36 for a placed picture, ' +
  '72x54 for the page\'s own polaroid. This is the assertion that answers ' +
  '26.9-05\'s ambiguity objection, which is the reason it deferred');
  const pic = decos[0];
  assert.strictEqual(pic.kids.length, 1);
  assert.strictEqual(pic.kids[0].attrs.src, '/lib/img-left',
    '(9p) the placed picture resolves through its STORED REF');
  assert.strictEqual(promoted.kids.length, 1);
  assert.strictEqual(promoted.kids[0].attrs.src, '/lib/img-left',
    '(9p) and the promoted polaroid resolves through THE ENTRY BEING ' +
    'PAINTED. They agree here because this fixture deliberately points ' +
    'the picture at the page\'s own item; the SOURCE assertion below is ' +
    'what proves they are built from different things');

  // ---- T2-4: DRIVEN ACROSS THE PAINTER-TO-DRAG SEAM --------------------
  //
  // On the node THE REAL PAINTER CREATED. Wave 5's M-T9 is why: a mutation
  // wiring NOTHING to the handles left every structural assertion green,
  // because the driven cases called attachPageDrag directly.
  drag(promoted, 500, 500, 540, 530);
  assert.deepStrictEqual([photoRec.x, photoRec.y], [286, 92],
    '(9p) T2-4: a real pointer gesture dispatched on the PAINTED node ' +
    'moves the stored record — 246+40, 62+30, by value. Not attachPageDrag ' +
    'called directly: that is the unit, and the unit was never the ' +
    'question. Found: ' + JSON.stringify([photoRec.x, photoRec.y]));
  assert.strictEqual(R.sel(), photoRec,
    '(9p) touching it SELECTS it, exactly as touching any other mark does');
  assert.strictEqual(R.state.posted.length, postedBefore + 1,
    '(9p) and THAT act persists — one write, at release. The promotion ' +
    'rode along with it rather than posting on its own');

  // ---- T2-5: ROTATE AND SCALE, THROUGH THE SHIPPED HANDLES ------------
  //
  // The handles paint on the SELECTED element only, so this repaints first
  // and drives the grips the painter made.
  const sel = R.paint(imgL, 'right');
  const wrap = oneCls(sel, 'page-deco-handles');
  const gripOf = function (which) {
    const hit = wrap.kids.filter(function (k) {
      return k.attrs['data-handle'] === which;
    });
    assert.strictEqual(hit.length, 1,
      '(9p) exactly one ' + which + ' grip on the selected mark');
    return hit[0];
  };
  const rot = gripOf('rotate');
  const scl = gripOf('scale');
  // centre of a 72x54 box at 286,92 with --k 1 is (322, 119). 26.91-10:
  // the box moved with the page onto the right half; the gesture is the
  // same quarter turn, taken from the same offsets around the new centre.
  drag(rot, 422, 119, 322, 219);
  assert.strictEqual(photoRec.a, 90,
    '(9p) T2-5: a quarter turn on the SHIPPED rotate handle stores 90 on ' +
    'the record — no new drag, no new normaliser');
  drag(scl, 422, 119, 332, 119);
  assert.strictEqual(photoRec.s, 0.5,
    '(9p) T2-5: and the scale clamps at D-07\'s FLOOR of 0.5 — the same ' +
    'floor every other mark has, reached through the same clampDecoScale');
  const floorBox = R.box(photoRec);
  assert.deepStrictEqual([floorBox.w * photoRec.s, floorBox.h * photoRec.s],
    [36, 27],
    '(9p) which is 36x27 scene px — the figure the UI-SPEC\'s Scale row ' +
    'cites, and D-07\'s stated requirement that a photo cannot be reduced ' +
    'to nothing. Whether 36x27 is STILL RECOGNISABLE is the owner\'s eye ' +
    'and is routed to plan 08, never asserted here');
  drag(scl, 148, 119, 1148, 119);
  assert.strictEqual(photoRec.s, 2,
    '(9p) and at the CEILING of 2.0 — both bounds, same normaliser');

  // ---- T2-10: THE OWNERSHIP KEY IS THE ENTRY, ON A TWO-PAGE DAY -------
  const T = loadPhotoScope(true);
  T.paint(imgL, 'left');
  T.paint(imgR, 'right');
  const two = T.state.DECORATIONS[DAY].items;
  assert.deepStrictEqual(two.map(function (r) {
    return [r.page, r.x, r.y];
  }), [['img-left', 62, 62], ['img-right', 246, 62]],
  '(9p) T2-10: on a TWO-PAGE DAY each page promotes ITS OWN photograph — ' +
  'the right page stores the RIGHT page\'s item id at the right page\'s ' +
  'origin (pageX.right 202 + 44 = 246). The polaroid is owned by the page ' +
  'it IS, so the two-page ambiguity WINDOWS row 28 raises for stroke ' +
  'groups (owned by the spread\'s FIRST page) structurally cannot reach ' +
  'this kind. Found: ' + JSON.stringify(two.map(function (r) {
    return [r.page, r.x, r.y];
  })));
  const rightNodes = T.paint(imgR, 'right');
  assert.strictEqual(countCls(rightNodes, 'station-photo'), 0,
    '(9p) and the RIGHT page paints no pinned slot');
  assert.strictEqual(countCls(rightNodes, 'page-deco-photo'), 1,
    '(9p) and exactly one promoted node — a page-scoped claim driven on ' +
    'the page that is NOT the spread\'s first');

  // ---- T2-9: A TEXT PAGE IS UNTOUCHED ---------------------------------
  const X = loadPhotoScope(true);
  const textNodes = X.paint(txt, 'left');
  assert.strictEqual(X.state.DECORATIONS[DAY].items.length, 0,
    '(9p) T2-9: a TEXT page promotes nothing — there is no polaroid to ' +
    'promote, and the why keeps the taller whyText slot it always had');
  assert.deepStrictEqual([countCls(textNodes, 'station-photo'),
    countCls(textNodes, 'page-deco-photo')], [0, 0],
    '(9p) and paints neither a pinned slot nor a promoted node');
  X.place('txt-1', 0, { kind: 'image', ref: 'img-left' });
  const textPic = X.paint(txt, 'left');
  assert.deepStrictEqual([countCls(textPic, 'page-deco-img'),
    countCls(textPic, 'page-deco-photo')], [1, 0],
    '(9p) while a tin-placed picture on a text page still renders exactly ' +
    'as it does today — the new branch took nothing away from the old one');

  // ---- THE SOURCE HALVES, over COMMENT-STRIPPED code ------------------
  const ensure = bodyOf('ensurePagePhoto');
  const live = bodyOf('livePagePhoto');
  const painter = bodyOf('paintPageDecorations');
  const tray = bodyOf('placeFromTray');

  assert.ok(ensure.indexOf('STATION_NOTEBOOK_GEOM') !== -1,
    '(9p) the promotion helper READS THE GEOMETRY TABLE. The by-value pin ' +
    'above catches a geometry drift; this catches a hand-typed copy that ' +
    'happens to agree today. Two assertions because each is the other\'s ' +
    'blind spot');
  [62, 246, 44, 72, 54].forEach(function (n) {
    assert.strictEqual(new RegExp('\\b' + n + '\\b').test(ensure), false,
      '(9p) and it carries no hand-typed ' + n + ' — every number it uses ' +
      'comes from the table');
  });
  assert.strictEqual(ensure.indexOf('NB_PLACE'), -1,
    '(9p) T2-10, THE SOURCE HALF: the promotion helper never names the ' +
    'SPREAD-WIDE placement target. Its key is the entry being painted');
  assert.ok(tray.indexOf('NB_PLACE') !== -1,
    '(9p) POSITIVE CONTROL, so that negative has a subject: the shipped ' +
    'tray placement path DOES name NB_PLACE — which is exactly why a ' +
    'stroke group is owned by the spread\'s first page and this kind ' +
    'is not');
  assert.ok(ensure.indexOf('.reset') !== -1,
    '(9p) THE TRAP, HELD: the promotion helper tests the RESET FLAG ' +
    'ITSELF rather than reading livePagePhoto\'s null as permission. That ' +
    'null is AMBIGUOUS between "not promoted yet" and "the day is reset", ' +
    'and the two need opposite answers — which is 26.9-05\'s rejected ' +
    'discriminator wearing a different costume');
  assert.ok(live.indexOf('.reset') !== -1,
    '(9p) and the lookup is the ONE NEW READER of the flag, which is what ' +
    'lets the reset put the page back in full');

  const fenceCalls = (painter.match(/[^.\w]guard\(/g) || []).length;
  assert.strictEqual(fenceCalls, 1,
    '(9p) THE FENCE CALL COUNT INSIDE THE DECORATION PAINTER IS EXACTLY ' +
    'ONE — the shipped picture branch. TWO would mean the new branch had ' +
    'invented a reference; ZERO would mean the shipped one was lost. ' +
    'Found: ' + fenceCalls);
  assert.ok(painter.indexOf('encodeURIComponent(entry.itemId)') !== -1,
    '(9p) and the promoted image\'s source is built from THE ENTRY BEING ' +
    'PAINTED, never from a stored reference field (T-26.9-41)');

  // ---- NO OCCLUSION HEURISTIC WAS ADDED. Wave 5 asserted this absence
  // deliberately; the region has grown by two functions and it must still
  // read 0.
  const heurRegion = [ensure, live, painter,
    bodyOf('paintBlessingPage'), bodyOf('decoBox')].join('\n');
  assert.ok(heurRegion.length > 1500,
    '(9p) positive control: the region is real (' + heurRegion.length +
    ' chars) — a negative grep over an empty string proves nothing');
  ['coverage', 'occlusion', 'occlude', 'overlapRatio', 'legib',
    'readability', 'intersectionArea', 'isCovered'].forEach(function (t) {
    assert.strictEqual(heurRegion.indexOf(t), -1,
      '(9p) no "' + t + '" heuristic reached the notebook design region. ' +
      'D-02 removed the legibility guarantee ON THE OWNER\'S RECORD, so ' +
      'guessing at whether a page is still worth reading would be a ' +
      'machine deciding what only she can decide. THE ABSENCE IS ' +
      'DELIBERATE and it is asserted as an absence');
  });
})();

// ===========================================================================
// ---- 9q: 26.9-09 — THE RESET PUTS IT ALL BACK, AND THE SPINE NEVER MOVED --
//
// The two invariants promoting the polaroid could QUIETLY break, driven from
// a pre-state NO SHIPPED CASE PRODUCES: an image page whose photograph has
// moved. 9j and 9j(b) are wave 5's spine pins and are byte-unchanged and
// green — they are PRESERVATION PINS, necessary and insufficient, because
// every case they drive is a page whose polaroid never moved.
//
// THE LOAD-BEARING ONE IS THE WHY. Moving the photograph vacates the band of
// page it was sitting in (y 62-116), and a HELPFUL implementation would
// reflow the why from its short `whyImage` slot into the taller `whyText`
// one to fill the gap. That is precisely what D-01 forbids and precisely
// what nothing shipped can currently see. The blank band it leaves behind is
// the intended consequence of pinning the spine; whether it READS as
// arranged rather than as broken is the owner's eye and is routed to plan
// 08, never asserted here.
// ===========================================================================

(function () {
  const DAY = '08/04/2026';
  const MS = 1754300000000;
  // TWO DECORATED PAGES ON ONE DAY, one of them an IMAGE page. A single-page
  // day is the degenerate fixture for a DAY-scoped gesture: on it, "clear
  // the page" and "clear the day" are indistinguishable (wave 6).
  const WHY = 'because you were laughing, and it was  raining — I kept it.';
  const pageA = { itemId: 'img-a', dayLabel: DAY, title: 'the window',
    why: WHY, author: 'you', isImage: true, ms: MS };
  const pageB = { itemId: 'txt-b', dayLabel: DAY, title: 'a walk',
    why: 'the light was good.', author: 'you', isImage: false,
    ms: MS + 3600000 };

  const has = function (cls) {
    return new RegExp('(^|\\s)' + cls + '(\\s|$)');
  };
  const countCls = function (ns, cls) {
    return ns.filter(function (n) { return has(cls).test(String(n.cls)); })
      .length;
  };

  const R = loadPhotoScope(false);
  const st = R.state;

  // ---- STEP (a): THE AUTO COMPOSITION, IN READING MODE ------------------
  const autoNodesA = R.paint(pageA, 'right');
  const autoNodesB = R.paint(pageB, 'right');
  const autoA = pageSig(autoNodesA);
  const autoB = pageSig(autoNodesB);
  assert.ok(autoA.length >= 4 && autoB.length >= 4,
    '(9q) positive control: both auto pages painted real nodes (' +
    autoA.length + ', ' + autoB.length + ')');
  assert.strictEqual(countCls(autoNodesA, 'station-photo'), 1,
    '(9q) and page A really is an IMAGE page — it carries the pinned ' +
    'polaroid. Without this the whole fixture is about a text page and ' +
    'says nothing about the thing it was built for');
  assert.strictEqual(st.DECORATIONS[DAY].items.length, 0,
    '(9q) and reading mode promoted nothing');

  // ---- STEP (b): DECORATE BOTH PAGES, THROUGH THE REAL PATHS -----------
  R.setMode(true);
  R.place('txt-b', 192, { kind: 'sticker', sprite: 'moon' });
  const arranging = R.paint(pageA, 'right');
  const promoted = arranging.filter(function (n) {
    return has('page-deco-photo').test(String(n.cls));
  })[0];
  assert.ok(promoted, '(9q) the polaroid promoted on entering the mode');
  // MOVED THROUGH THE REAL DRAG, on the node the real painter created.
  promoted.fire('pointerdown', { clientX: 500, clientY: 500, pointerId: 1,
    preventDefault: function () {}, stopPropagation: function () {} });
  promoted.fire('pointermove', { clientX: 560, clientY: 550 });
  promoted.fire('pointerup', {});
  const photoNow = function () {
    const r = st.DECORATIONS[DAY].items.filter(function (x) {
      return x.kind === 'photo';
    })[0];
    return r ? [r.x, r.y] : null;
  };
  const photoRec = st.DECORATIONS[DAY].items.filter(function (r) {
    return r.kind === 'photo';
  })[0];
  // 26.91-10 (F-1): pageA is painted on the RIGHT, the only side
  // paintNotebookSpread ever asks for now, so the polaroid's pinned slot is
  // 246,62 and the dragged position 306,112 is INSIDE the mark canvas. At
  // the old left-page slot the drag would have been clamped to the gutter
  // and this precondition — the unclamped pre-state every assertion in the
  // group depends on — would have been measuring the clamp.
  assert.deepStrictEqual([photoRec.x, photoRec.y], [306, 112],
    '(9q) the photograph has MOVED WELL AWAY from its slot (246,62 -> ' +
    '306,112, unclamped) — the pre-state no shipped case produces, and ' +
    'the one every assertion below depends on. Found: ' +
    JSON.stringify([photoRec.x, photoRec.y]));
  R.setMode(false);
  const decoNodesA = R.paint(pageA, 'right');
  const decoA = pageSig(decoNodesA);
  const decoB = pageSig(R.paint(pageB, 'right'));

  // ---- STEP (c): THE MUTATION-FIRED CHECK ------------------------------
  //
  // WITHOUT THIS STEP THE WHOLE FIXTURE IS VACUOUS. Wave 6 proved that by
  // BUILDING a degenerate variant and watching a reset that does literally
  // nothing pass step (e) against it — not by arguing for it.
  assert.notDeepStrictEqual(decoA, autoA,
    '(9q) STEP (c): page A genuinely DIFFERS from its auto composition ' +
    'before anything is reset. Delete this and every assertion below is ' +
    'satisfied by a reset that does nothing at all');
  assert.notDeepStrictEqual(decoB, autoB,
    '(9q) STEP (c): and so does page B — the second page of the same day, ' +
    'which is what makes the day-scope claim decidable');
  assert.deepStrictEqual([countCls(decoNodesA, 'station-photo'),
    countCls(decoNodesA, 'page-deco-photo')], [0, 1],
  '(9q) STEP (c), the photo half: the moved page shows the PROMOTED node ' +
  'and no pinned slot — outside the mode as well as inside it, because ' +
  'she arranged it and arrangements do not evaporate when she stops ' +
  'arranging');

  // ---- THE SPINE, over a page whose polaroid HAS MOVED (T3-4) ----------
  const at = function (n) {
    return [n.style.__p['--x'], n.style.__p['--y'],
      n.style.__p['--w'], n.style.__p['--h']];
  };
  const spine = decoNodesA.filter(function (n) {
    return /station-caption|station-toc-line/.test(String(n.cls));
  });
  assert.deepStrictEqual(spine.map(at), [
    ['210', '24', '144', '10'],     // the date:  pageX.left 18 + dx 8
    ['210', '38', '144', '20'],     // the title
    ['210', '122', '144', '46']],   // the why, in the SHORT whyImage slot
  '(9q) T3-4, THE LOAD-BEARING PIN. Over an IMAGE page whose polaroid has ' +
  'MOVED AWAY, the why keeps the SHORT `whyImage` slot {dx:8,y:122,w:144,' +
  'h:46} and does NOT reflow into the taller `whyText` {8,62,144,108} to ' +
  'fill the band the photograph vacated. D-01 pins the spine; a page whose ' +
  'photograph has moved therefore carries a blank band where it used to ' +
  'be, and that is the intended, owner-approved consequence. Whether it ' +
  'reads as arranged rather than as broken is her eye and is routed to ' +
  'plan 08. Found: ' + JSON.stringify(spine.map(at)));
  assert.strictEqual(spine[2].text, WHY,
    '(9q) and the why string is BYTE-IDENTICAL to the ledger\'s stored ' +
    'value — so a rewrite that fires ONLY when the polaroid has moved is ' +
    'caught here, which no shipped case could see');
  assert.strictEqual(spine[2].text.length, WHY.length,
    '(9q) same length — no whitespace collapsed, no em dash "normalised"');
  spine.forEach(function (n) {
    assert.strictEqual(n.style.__p['--a'], undefined,
      '(9q) and no spine element carries a rotation');
    assert.strictEqual(n.style.__p['--s'], undefined,
      '(9q) or a scale — the spine does not compose, even now that the ' +
      'thing beside it does');
  });

  // ---- STEP (d) + (e): RESET, AND EQUALITY WITH (a) ON EVERY PAGE -----
  const beforeCount = st.DECORATIONS[DAY].items.length;
  R.resetDay(DAY);
  const resetNodesA = R.paint(pageA, 'right');
  const resetNodesB = R.paint(pageB, 'right');
  // TWO INDEPENDENT CLAIMS, and each is proven below to fire alone.
  // CLAIM 1 — the pinned polaroid is back, by node count.
  assert.deepStrictEqual([countCls(resetNodesA, 'station-photo'),
    countCls(resetNodesA, 'page-deco-photo')], [1, 0],
  '(9q) STEP (e), CLAIM 1: the PINNED polaroid is back and the promoted ' +
  'node is gone. livePagePhoto answers null on a reset day, which is the ' +
  'one new reader of the flag and the whole reason the reset can restore ' +
  'an image page in full');
  // CLAIM 2 — the page's full node signature equals the captured one.
  assert.deepStrictEqual(pageSigNoCanvas(resetNodesA),
    pageSigNoCanvas(autoNodesA),
    '(9q) STEP (e), CLAIM 2: page A is byte-for-byte the page the room ' +
    'composed — every element, its slot, its text and its draw order');
  assert.deepStrictEqual(pageSigNoCanvas(resetNodesB),
    pageSigNoCanvas(autoNodesB),
    '(9q) STEP (e): AND SO IS PAGE B. The gesture is the DAY, not the page ' +
    'she happens to be looking at');
  assert.deepStrictEqual(
    [canvasCount(autoNodesA), canvasCount(resetNodesA)], [1, 0],
    '(9q) THE ONE EXCLUDED DIFFERENCE, NAMED AND PINNED BY COUNT — ' +
    'WINDOWS row 24, 26.9-03\'s deliberate early return. Unchanged here, ' +
    'and pinned so a SECOND omission fails rather than sliding through');
  // 26.91-30 (F-26): the second member of the same layer, MEASURED rather
  // than assumed — and it came back a different number from 9l's, which is
  // the finding. This fixture paints in READING mode until the trap below
  // calls setMode(true); the canvas is painted there (inert while reading)
  // and the region is NOT (arranging only), so the honest pin is [0, 0] and
  // not the [1, 0] the canvas takes one line up.
  assert.deepStrictEqual(
    [regionCount(autoNodesA), regionCount(resetNodesA)], [0, 0],
    '(9q) THE SECOND MEMBER OF THE SAME LAYER, PINNED BY COUNT — the drawn ' +
    'legal region is ARRANGING-ONLY, so a reading-mode page carries none ' +
    'on either side of the reset. Law 4: reading mode is byte-identical to ' +
    'what it was before F-26 was answered');

  // ---- THE TRAP, DRIVEN: A RESET DAY REPAINTED WHILE STILL ARRANGING --
  //
  // FOUND BY A MUTATION, NOT BY READING. M-R2 (the promotion helper stops
  // testing the reset flag and reads livePagePhoto's null as permission)
  // went GREEN against the first version of this fixture, because every
  // post-reset paint above happens in READING mode and ensurePagePhoto
  // declines on `!NBDESIGN` before the flag is ever consulted. The
  // mutation was UNREACHABLE and the source assertion in 9p was carrying
  // the whole claim on its own.
  //
  // This is the real situation: she resets the day and is still standing
  // in the mode. Without the flag test, the very next repaint silently
  // pushes ANOTHER photo record — invisible, because the painter's early
  // return means nothing is drawn — and one undo of the reset would then
  // hand her back a page with two polaroids on it.
  R.setMode(true);
  const resetArranging = R.paint(pageA, 'right');
  assert.deepStrictEqual([countCls(resetArranging, 'station-photo'),
    countCls(resetArranging, 'page-deco-photo')], [1, 0],
  '(9q) a reset day repainted WHILE ARRANGING still shows the pinned ' +
  'polaroid and no promoted node');
  assert.strictEqual(st.DECORATIONS[DAY].items.filter(function (r) {
    return r.kind === 'photo';
  }).length, 1,
  '(9q) AND IT CREATED NO SECOND RECORD. livePagePhoto returning null is ' +
  'AMBIGUOUS between "not promoted yet" and "the day is reset", so the ' +
  'promotion helper tests the FLAG ITSELF rather than reading the absence ' +
  'as permission — 26.9-05\'s rejected discriminator in a different ' +
  'costume. Without this the store accumulates a duplicate polaroid on ' +
  'every repaint of a reset day, invisibly, and one undo hands her back a ' +
  'page carrying two of them');
  R.setMode(false);

  // ---- T3-2: THE RECORDS SURVIVED. A DELETE PASSES CLAIM 1 AND 2 ------
  assert.strictEqual(st.DECORATIONS[DAY].items.length, beforeCount,
    '(9q) T3-2: THE RECORDS ARE STILL THERE. A reset implemented as a ' +
    'DELETE satisfies both render claims above perfectly; only this half ' +
    'tells a flag from a delete, and that survival is the only thing that ' +
    'makes the reset itself undoable');
  assert.deepStrictEqual(photoNow(), [306, 112],
    '(9q) and the MOVED photo record is untouched underneath the flag — ' +
    'still exactly where she left it. READ BACK OUT OF THE STORE, never ' +
    'off the object reference captured earlier: applyNbSnapshot replaces ' +
    'every record with a parsed copy, so a held reference would answer ' +
    'this question with a value nothing in the store carries');
  assert.strictEqual(st.DECORATIONS[DAY].reset, true,
    '(9q) and the flag is what is stored');

  // ---- T3-3: ONE UNDO AFTER THE RESET BRINGS IT BACK ------------------
  // THE MIRROR ABOVE IS CHECKED, NOT TRUSTED: the shipped mode setter
  // really does drop the selection on the way out.
  assert.ok(/if \(!NBDESIGN\) \{ NB_SEL = null; \}/
    .test(bodyOf('setNotebookDesign')),
  '(9q) the harness\'s setMode mirrors setNotebookDesign\'s own line — ' +
  'leaving the mode drops the selection, so a page compared outside the ' +
  'mode never differs by chrome the app would not have painted');

  R.undo();
  assert.strictEqual(st.DECORATIONS[DAY].reset, false,
    '(9q) T3-3: one undo takes the flag back down');
  assert.deepStrictEqual(pageSig(R.paint(pageA, 'right')), decoA,
    '(9q) and the moved polaroid comes back EXACTLY where she left it');
  assert.deepStrictEqual(pageSig(R.paint(pageB, 'right')), decoB,
    '(9q) and so does page B — on EVERY page of the day');

  // ---- T3-5: THE SNAPSHOT IS FIELD-AGNOSTIC ---------------------------
  R.redo();
  assert.strictEqual(st.DECORATIONS[DAY].reset, true,
    '(9q) T3-5: and redo puts it back — a promoted polaroid round-trips ' +
    'through the shipped history with nothing taught about it');
  R.undo();
  assert.deepStrictEqual(photoNow(), [306, 112],
    '(9q) positive control, READ BACK OUT OF THE STORE: the record the ' +
    'machinery carried is the same moved record, so the round trip had a ' +
    'real subject rather than a stale reference agreeing with itself');

  // AND THE MACHINERY NAMES NO KIND — an EQUALITY, 9o's shape, so the next
  // widening stays a branch rather than becoming a vocabulary edit in four
  // places.
  const machinery = ['nbSnapshot', 'applyNbSnapshot', 'pushNbUndo',
    'doNbUndo', 'doNbRedo', 'nbResetDay'].map(bodyOf).join('\n');
  assert.ok(machinery.length > 400,
    '(9q) positive control: the machinery region is real (' +
    machinery.length + ' chars)');
  ["'photo'", "'sticker'", "'image'", "'stroke'", "'text'"].forEach(
    function (k) {
      assert.strictEqual(machinery.indexOf(k), -1,
        '(9q) the undo / redo / reset machinery names NO kind at all (' +
        k + ' reads 0). nbSnapshot is JSON.stringify(decoDay(NB_DAY)) — ' +
        'the whole day record, field-agnostic — and the reset is one ' +
        'boolean the painter reads. That is why the fifth kind needed no ' +
        'change to any of them');
    });

  // ---- THE NEW KIND'S REFERENCE SET IN app.js, AS AN EQUALITY ---------
  //
  // 9o's shape. A FLOOR-SHAPED ASSERTION IS THE DEGENERATE FORM AND IS
  // EXPLICITLY REPLACED BY AN EQUALITY — a floor would be satisfied by any
  // number of new references and would let the branch quietly become a
  // vocabulary spread across the file.
  function count(hay, needle) {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }
  const PERMITTED = ['decoBox', 'paintPageDecorations', 'livePagePhoto',
    'ensurePagePhoto'];
  const per = PERMITTED.map(function (n) {
    return count(bodyOf(n), "'photo'");
  });
  assert.deepStrictEqual(per, [1, 1, 1, 1],
    '(9q) the FOUR permitted sites, each naming the kind exactly once: ' +
    'decoBox (the box seam), paintPageDecorations (the one render ' +
    'branch), livePagePhoto (the lookup) and ensurePagePhoto (the stored ' +
    'record). Found: ' + JSON.stringify(per));
  const total = count(appCode, "'photo'");
  // THE NAME COLLIDES WITH A SHIPPED, UNRELATED VOCABULARY — pinned BY
  // VALUE and then CHECKED TO BE WHAT IT IS CLAIMED TO BE, never waved
  // through. This is 26.9-07's `thread` precedent exactly.
  const FOREIGN = 3;
  assert.strictEqual(total, per.reduce(function (a, b) { return a + b; }, 0) +
    FOREIGN,
  '(9q) AND THE FILE-WIDE COUNT EQUALS THE PERMITTED SUM PLUS THE PINNED ' +
  'COLLISION — a set difference of zero. File-wide ' + total);
  assert.strictEqual(total, 7,
    '(9q) and the number itself, pinned BY VALUE so the equality above ' +
    'cannot be satisfied by both sides falling together (26.9-07\'s M-C7 ' +
    'is why: a second reference INSIDE a permitted site leaves the ' +
    'difference at zero)');
  // A DECORATION-KIND reference is one written as `kind === 'photo'` or
  // `kind: 'photo'`; everything else is the collision. Classified by the
  // characters immediately before the literal rather than by "does the
  // neighbourhood mention `kind`" — which was the first spelling here and
  // was WRONG: `var kind = item.type === 'image' ? 'photo' : 'note'`
  // mentions `kind` and is not one.
  const kindLike = /kind(?::| ===) $/;
  const foreign = [];
  let kindRefs = 0;
  let ix = appCode.indexOf("'photo'");
  while (ix !== -1) {
    if (kindLike.test(appCode.slice(Math.max(0, ix - 14), ix))) {
      kindRefs++;
    } else {
      foreign.push(appCode.slice(Math.max(0, ix - 70), ix + 30));
    }
    ix = appCode.indexOf("'photo'", ix + 7);
  }
  assert.strictEqual(kindRefs, per.reduce(function (a, b) {
    return a + b;
  }, 0),
  '(9q) every decoration-kind reference in the file is inside a permitted ' +
  'site — counted two independent ways (by function body, and by the ' +
  'characters before the literal) and they agree at ' + kindRefs);
  assert.strictEqual(foreign.length, FOREIGN,
    '(9q) exactly ' + FOREIGN + ' occurrences are NOT decoration kinds, ' +
    'pinned BY VALUE so the exception list is load-bearing rather than an ' +
    'escape hatch. Found ' + foreign.length);
  foreign.forEach(function (c) {
    assert.ok(/item\.type === 'image' \? 'photo'|'photo', 'photos'/.test(c),
      '(9q) and each one IS what it is claimed to be, CHECKED rather than ' +
      'trusted: the reading surfaces\' item-type label (`item.type === ' +
      "'image' ? 'photo' : 'note'`) and the summary line's count word " +
      '(`\'photo\', \'photos\'`). Both are shipped vocabulary that happens ' +
      'to share a word with the new kind — a name collision, not a leaked ' +
      'reference. Context: ' + JSON.stringify(c.slice(40)));
  });
  // THE ANCHORING IS LOAD-BEARING, proved rather than assumed: the word is
  // all over this file (.station-photo, .page-deco-photo, corner-photo, the
  // geometry table's own key) and the QUOTED LITERAL is not.
  assert.ok(count(appSrc, 'photo') > total * 4,
    '(9q) POSITIVE CONTROL: the raw file names the BARE WORD ' +
    count(appSrc, 'photo') + ' times against ' + total + ' quoted ' +
    'literals in code, so counting the quoted literal is doing real work ' +
    'rather than being a stylistic choice');
  assert.ok(appCode.indexOf('page-deco-photo') !== -1,
    '(9q) and a subject for it: `page-deco-photo` really is in the file, ' +
    'and the character before the word there is a hyphen rather than a ' +
    'quote — which is exactly why it is not counted');
})();

// ---- 9n(9): NO HARNESS MAY ANSWER ITS OWN QUESTION THROUGH A GLOBAL -----

(function () {
  // THE INSTRUMENT THIS PLAN OWES THE PHASE, and it is here because it
  // caught a real one while being written.
  //
  // Every harness in this file assembles lifted source into a `new Function`
  // body. That body is SLOPPY MODE, so an assignment to an UNDECLARED name
  // does not throw — it creates a GLOBAL. 26.9-07 gave setNotebookDesign a
  // line reading `NB_PEN = false;`, and because 9a lifts setNotebookDesign
  // WITHOUT injecting NB_PEN, running 9a quietly created `globalThis.NB_PEN`
  // — which then answered the pen guard for FIVE later harnesses that never
  // set it. Every suite stayed green. Nobody had asserted anything false;
  // five instruments were simply reading a value no test had written.
  //
  // A leaked global is worse than a wrong value: it makes harnesses ORDER-
  // DEPENDENT and silently couples groups that are supposed to be
  // independent. So this is asserted as an EQUALITY over an enumerated list
  // of the module's own names, at the very end of the file, after every
  // harness has run.
  const OWNED = ['NBDESIGN', 'NB_PEN', 'NB_PEN_GROUP', 'NB_PEN_HANDLER',
    'NB_SEL', 'NB_DAY', 'NB_REPAINT', 'NB_TIN_OPEN', 'NB_TIN_TAB',
    'NB_PLACE', 'NB_RESET_ARMED', 'NB_SAVE_FAILED', 'NB_UNDO', 'NB_REDO',
    'DECORATIONS', 'DESIGN', 'DESIGN_UNDO', 'DESIGN_REDO', 'LAYOUT'];
  const leaked = OWNED.filter(function (n) {
    return Object.prototype.hasOwnProperty.call(globalThis, n);
  });
  assert.deepStrictEqual(leaked, [],
    '(9n) NO MODULE-SCOPE NAME OF THE NOTEBOOK EDITOR MAY EXIST ON THE ' +
    'GLOBAL OBJECT once the suite has run. A `new Function` body is sloppy ' +
    'mode: an assignment to an undeclared name creates a global instead of ' +
    'throwing, and that global then silently answers the same question in ' +
    'every later harness. Leaked: ' + JSON.stringify(leaked));
  // THE POSITIVE CONTROL, because a list of names that are simply never
  // assigned anywhere would make the check above vacuous: prove that this
  // detection mechanism actually fires.
  const probe = 'NB_PEN';
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(globalThis, probe), false,
    '(9n) precondition: the probe name is clean before the control');
  // eslint-disable-next-line no-new-func
  new Function('NB_PEN_UNUSED', 'NB_PEN = true; return NB_PEN;')(0);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(globalThis, probe), true,
    '(9n) POSITIVE CONTROL: a sloppy-mode assignment to an undeclared ' +
    'NB_PEN really does create a global here, so the equality above is a ' +
    'measurement rather than a name list nobody could have failed');
  delete globalThis[probe];
})();

// ===========================================================================
// ---- 9o: 26.91-02 — THE ARMED `write` TOOL --------------------------------
//
// THE DEBT THIS PAYS, stated so the group's shape makes sense: text
// placement shipped as a DOUBLE-CLICK because the band was geometrically
// full and had no room for a tool. The band has room now. The debt comment
// said outright that the fix was a band re-layout, and this is it.
//
// THE SHAPE OF THE VACUOUS TEST THIS GROUP IS WRITTEN AGAINST:
//
//   - "arming write sets NB_WRITE" is satisfied by a setter that sets a
//     flag nothing reads;
//   - "the tools are mutually exclusive" is satisfied by a guard on ONE
//     side only — and a one-sided guard is exactly how a mode leaks, since
//     it holds in whichever direction the test happens to drive;
//   - "a pointerdown creates a text record" is satisfied by a handler that
//     creates one on EVERY pointerdown, which is the F-7 regression the
//     owner already hit once (six empty marks on one page from ordinary
//     clicking);
//   - "the dblclick path still works" is satisfied by a listener that is
//     registered and never reached.
//
// So: both exclusivity directions are driven, the pen-armed and
// nothing-armed cases are driven as ZERO-creation assertions beside the
// write-armed ONE-creation assertion, and the creation tail is asserted to
// exist in exactly ONE place rather than two that agree today.
// ===========================================================================

const WRITE_DECLS = ['NB_BOUNDS', 'NB_GUTTER_X', 'NB_MARK_BOUNDS', 'NB_DECO_CAP', 'NB_UNDO_CAP', 'NB_TEXT_BOX',
  'NB_IMG_BOX', 'NB_STICKER_H', 'SVG_NS', 'NB_PEN_PTS_CAP',
  'NB_PEN_STROKE_CAP'];
const WRITE_FNS = ['clampDecoOrigin', 'decoDay', 'nbSnapshot',
  'applyNbSnapshot', 'pushNbUndo', 'strokeList', 'decoBox',
  'setNotebookPen', 'setNotebookWrite',
  // 26.91-18: BOTH armed setters call it, so it travels with them here too.
  // See the same addition in PEN_FNS and the reason beside it.
  'nbSyncArmedClass',
  'nbTextOriginFrom', 'nbPlaceTextRecord', 'nbCanvasPointerHandler',
  // 26.91-23 (F-22): the armed-tap path calls it, so it travels with the
  // handler or the lifted source has a free variable and the rig dies on
  // load. IT IS LIFTED, NOT STUBBED — the rig runs the shipped function.
  //
  // ⚠ AND THIS RIG CANNOT SHOW THAT IT WORKS, WHICH IS THE POINT OF SAYING SO.
  // The guard suppresses the DEFAULT ACTION of a real mousedown to stop the
  // platform tearing focus off the editor. This document's addEventListener
  // is a no-op, its `openHandTextEditor` is a stub, its `scene.querySelector`
  // returns null unconditionally, and a synthetic document has no focus model
  // at all. So a green here says only that the call site is wired. The claim
  // that focus SURVIVES is held live by (G-23) in test_live_render.cjs, and
  // nowhere else — see 26.91-CONTEXT.md M-23.
  'nbGuardEditorFocus'];

function writeRig(opts) {
  const o = opts || {};
  const created = [];
  const doc = penDoc(created);
  const s = penScene();
  const DEC = o.decorations || {};
  const calls = { post: [], repaint: 0, edited: [] };
  const src = WRITE_DECLS.map(declOf).join('\n') + '\n' +
    WRITE_FNS.map(function (n) { return extractFn(appSrc, n); }).join('\n');
  const names = ['document', 'NBDESIGN', 'NB_PEN', 'NB_WRITE', 'NB_PEN_GROUP',
    'NB_TIN_OPEN', 'DECORATIONS', 'NB_UNDO', 'NB_REDO', 'NB_SEL', 'NB_PLACE',
    'NB_DAY', 'NB_UNDO_CAP',
    'postDecorations', 'NB_REPAINT', 'openHandTextEditor', 'getComputedStyle',
    'updateNbButtons', 'NB_STICKERS'];
  const scene = { querySelector: function () { return null; } };
  const canvas = {
    getBoundingClientRect: function () { return { left: 0, top: 0 }; }
  };
  // eslint-disable-next-line no-new-func
  return new Function(names.join(',') + ',__scene,__canvas',
    src + '\nreturn {' +
    ' setNotebookPen: setNotebookPen,' +
    ' setNotebookWrite: setNotebookWrite,' +
    // 26.91-18: the armed body class, read back through the shipped hook's
    // own effect. This rig is the ONE that drives BOTH setters, so it is
    // where the two armed tools can be shown to reach the same state.
    ' bodyClasses: function () { return document.body.classes.slice(); },' +
    ' nbPlaceTextRecord: nbPlaceTextRecord,' +
    // THE REAL HANDLER, built by the REAL factory and then FIRED. Not a
    // re-implementation of the guard: the thing the painter attaches.
    ' fire: function (x, y) {' +
    '   var h = nbCanvasPointerHandler(__scene, __canvas,' +
    '     { itemId: "abc123" }, "08/04/2026", "left");' +
    '   return h({ clientX: x, clientY: y }); },' +
    ' pen: function () { return NB_PEN; },' +
    ' write: function () { return NB_WRITE; },' +
    ' tinOpen: function () { return NB_TIN_OPEN; },' +
    ' setPen: function (v) { NB_PEN = v; },' +
    ' setWrite: function (v) { NB_WRITE = v; },' +
    ' setTinOpen: function (v) { NB_TIN_OPEN = v; },' +
    ' setDesign: function (v) { NBDESIGN = v; },' +
    ' undoDepth: function () { return NB_UNDO.length; } };')(
    doc, true, false, false, null, false, DEC, [], [], null,
    { itemId: 'abc123', x0: 0 }, '08/04/2026', 40,
    function (d) { calls.post.push(d); },
    function () { calls.repaint++; },
    function (el, rec) { calls.edited.push(rec); },
    function () {
      return { getPropertyValue: function () { return '1'; } };
    },
    function () {},
    { 'moon': { x: 120, w: 20 } }, scene, canvas);
}

// ---- 9o(1): EXCLUSIVITY, DRIVEN IN BOTH DIRECTIONS -----------------------
(function () {
  const a = writeRig();
  a.setNotebookWrite(true);
  assert.deepStrictEqual([a.write(), a.pen()], [true, false],
    '(9o) arming `write` from rest arms it and leaves the pen down');
  a.setNotebookPen(true);
  assert.deepStrictEqual([a.write(), a.pen()], [false, true],
    '(9o) DIRECTION 1: arming the PEN while `write` is armed disarms ' +
    '`write`. This is setNotebookPen\'s reciprocal edit');

  const b = writeRig();
  b.setNotebookPen(true);
  assert.deepStrictEqual([b.pen(), b.write()], [true, false],
    '(9o) arming the pen from rest arms it and leaves `write` down');
  b.setNotebookWrite(true);
  assert.deepStrictEqual([b.pen(), b.write()], [false, true],
    '(9o) DIRECTION 2: arming `write` while the PEN is armed disarms the ' +
    'pen. BOTH DIRECTIONS ARE DRIVEN because exclusivity enforced in one ' +
    'setter and hoped for in the other is not exclusivity — it holds in ' +
    'whichever direction somebody happened to test, and leaks in the other');

  // AND NO INTERMEDIATE STATE LEAVES BOTH ARMED
  const c = writeRig();
  c.setNotebookWrite(true);
  c.setNotebookPen(true);
  c.setNotebookWrite(true);
  c.setNotebookPen(true);
  assert.strictEqual(c.pen() && c.write(), false,
    '(9o) and no sequence of arming leaves BOTH tools armed — the last ' +
    'write wins and the loser is false. Two armed tools would contend for ' +
    'one pointerdown and mint records she did not ask for (T-26.91-07)');
})();

// ---- 9o(2): THE ARMED GESTURE — one record, and only when armed ----------
//
// ONE POINTERDOWN, THREE ARM STATES, THE SAME COORDINATES. The three cases
// differ ONLY in which tool is armed, so the arm state is provably the thing
// under test rather than the geometry.
(function () {
  function tap(arm) {
    const dec = {};
    const rig = writeRig({ decorations: dec });
    if (arm === 'write') { rig.setWrite(true); }
    if (arm === 'pen') { rig.setPen(true); }
    rig.setTinOpen(true);
    rig.fire(40, 30);
    const d = dec['08/04/2026'];
    return { rig: rig,
      items: (d && Array.isArray(d.items)) ? d.items : [] };
  }

  const w = tap('write');
  assert.strictEqual(w.items.length, 1,
    '(9o) WRITE ARMED: one pointerdown in the page interior creates ' +
    'EXACTLY ONE record — not zero (the tool would be painted and dead, ' +
    'which every structural assertion in this file would still pass) and ' +
    'not two (a doubled handler)');
  assert.strictEqual(w.items[0].kind, 'text',
    '(9o) and it is a `text` record');
  assert.strictEqual(w.items[0].text, '',
    '(9o) created EMPTY, and that is deliberate: it persists as a real ' +
    'element even while untyped, so it can be selected, moved and undone ' +
    'like any other mark rather than being a ghost that vanishes if she ' +
    'does not type');
  assert.strictEqual(w.rig.undoDepth(), 1,
    '(9o) and undo was pushed BEFORE the mutation — the room\'s own ' +
    'discipline, so the placement is reversible by the band control ' +
    'sitting four slots to its left');

  const p = tap('pen');
  assert.strictEqual(p.items.length, 0,
    '(9o) PEN ARMED: the same pointerdown at the same point creates ZERO ' +
    'records. The pen owns the gesture, so the write path must return ' +
    'BEFORE the creation tail. This is the F-7 regression direction and ' +
    'T-26.91-07 both');

  const n = tap('none');
  assert.strictEqual(n.items.length, 0,
    '(9o) NOTHING ARMED: a plain tap creates NOTHING. This is 26.9 F-7, ' +
    'which the owner hit as six empty marks on one page from ordinary ' +
    'clicking — a creation gesture bound to the most common idle click is ' +
    'the wrong default in any editor, and adding an armed tool must not ' +
    'quietly reintroduce it');
  assert.strictEqual(n.rig.tinOpen(), false,
    '(9o) and the SHIPPED behaviour survives: a plain tap still closes the ' +
    'tray. The armed path was added AFTER that, not instead of it');
})();

// ---- 9o(3): ONE CREATION TAIL, TWO CALLERS -------------------------------
(function () {
  assert.strictEqual((appCode.match(/kind: 'text'/g) || []).length, 1,
    '(9o) THE RECORD-CREATION TAIL EXISTS IN EXACTLY ONE PLACE in app.js. ' +
    'Two spellings of one creation is the drift this phase keeps finding — ' +
    'and it would be the WORST place to have it, because the two paths ' +
    '(the armed pointerdown and the shipped dblclick) would agree on the ' +
    'day they were written and diverge the first time either is touched. ' +
    'Counted over comment-stripped source');
  const tail = bodyOf('nbPlaceTextRecord');
  ['NB_DECO_CAP', 'pushNbUndo', 'postDecorations', 'openHandTextEditor']
    .forEach(function (t) {
      assert.ok(tail.indexOf(t) !== -1,
        '(9o) and the ONE tail carries `' + t + '` — so both callers get ' +
        'the cap refusal, the undo push, the write and the editor, rather ' +
        'than one of them getting three of the four');
    });
  // BOTH CALLERS REALLY CALL IT — otherwise "exactly one tail" is satisfied
  // by a helper nothing uses beside a path that still inlines its own.
  const deco = bodyOf('paintPageDecorations');
  const handler = bodyOf('nbCanvasPointerHandler');
  assert.ok(handler.indexOf('nbPlaceTextRecord') !== -1,
    '(9o) POSITIVE CONTROL A: the ARMED path calls the shared tail');
  // ---- DISPOSITION 2026-08-11 (26.91-37, F-25 / D-12): INVERTED ---------
  // This assertion is NOT deleted — it keeps its group id and is inverted,
  // per the phase's standing rule. It asserted that the shipped DBLCLICK
  // handler reached the shared tail. `G-30` MEASURED that the same handler
  // minted a record with NO deliberate arming act (and even with the pen
  // armed), which is `A-20`'s invariant failing, and HER RULING of
  // 2026-08-11 (`A-26` ruling 2) retired it. Its POSITIVE-CONTROL DUTY —
  // closing the degenerate pass where "one tail" is satisfied by a helper
  // nobody calls — is NOT dropped: it now rests on POSITIVE CONTROL A above
  // plus `G-30/surviving/one-tap-one-record`, which DRIVES the surviving
  // caller through the real canvas rather than grepping for it.
  assert.ok(!/addEventListener\('dblclick'[\s\S]*?nbPlaceTextRecord/
    .test(deco),
    '(9o) INVERTED 2026-08-11: the painter no longer routes a DBLCLICK into ' +
    'the shared creation tail. Retiring the caller must remove its ' +
    'REGISTRATION and nothing else — if this reddens because the tail ' +
    'itself vanished, the wrong thing was removed and G-30/tail says so');

  // THE LEGACY PATH IS RETIRED — INVERTED 2026-08-11, NOT DELETED
  assert.strictEqual(
    (appCode.match(/addEventListener\('dblclick'/g) || []).length, 0,
    '(9o) INVERTED 2026-08-11 (26.91-37): ZERO dblclick listeners are ' +
    'registered. This row used to pin exactly ONE and argued the path was ' +
    'DELIBERATELY KEPT because "it is free". IT WAS NOT FREE — G-30 ' +
    'measured it minting a mark she never asked for, and her ruling ' +
    '(`A-26` ruling 2) closed it. The argument is preserved in app.js at ' +
    'the retirement site rather than erased');
})();

// ---- 9o(4): THE DEBT IS CLOSED, AND THE CLOSURE IS RECORDED --------------
(function () {
  // THESE TWO CANNOT BE RESCUED BY COMMENT-STRIPPING, and that is the whole
  // trap: the thing being removed IS a comment, so a closure note that
  // quoted its own retired banner would satisfy a stripped scan while
  // leaving the banner in the file. Both run over RAW source on purpose.
  assert.strictEqual((appSrc.match(/KNOWN DEBT/g) || []).length, 0,
    '(9o) the KNOWN DEBT banner is GONE from app.js — asserted over RAW ' +
    'source, because the replacement is itself a comment and a stripped ' +
    'scan would pass while the banner sat in the file');
  assert.strictEqual(
    (appSrc.match(/WHY DOUBLE-CLICK AND NOT A BAND BUTTON/g) || []).length, 0,
    '(9o) and so is the double-click rationale banner it sat under');
  // A DEBT IS CLOSED IN THE COMMIT THAT PAYS IT, AND THE CLOSURE IS WRITTEN
  // DOWN. Deleting the banner without recording why is how the reasoning is
  // lost and the same question gets re-litigated in a year.
  assert.ok(/26\.91[\s\S]{0,600}the debt recorded here/.test(appSrc),
    '(9o) the closure NOTE is present and names the phase — the debt is ' +
    'recorded as PAID rather than silently deleted');
  // ---- DISPOSITION 2026-08-11 (26.91-37, F-25 / D-12): RE-KEYED --------
  // NOT DELETED. This row existed so a later reader would not remove the
  // dblclick path as dead weight. A later reader DID remove it — but on her
  // ruling and on a measurement, not as dead weight, which is the exact
  // distinction the row was protecting. So its duty is re-keyed rather than
  // dropped: the retirement must carry its DATE, its MEASUREMENT and the
  // ARGUMENT it overturned, so the removal is legible as a decision.
  // ORDER IS THE CLAIM, not an incidental: the preserved ARGUMENT must come
  // FIRST and the dated retirement clause must ANSWER it. Keyed the other
  // way round this row went red against a correct site — found by driving,
  // and left in this order deliberately so it stays a claim about shape.
  assert.ok(/costs nothing[\s\S]{0,1600}RETIRED 2026-08-11/.test(appSrc),
    '(9o) RE-KEYED 2026-08-11: the retirement site carries a DATED clause ' +
    'AND still quotes what the retained-path argument claimed ("costs ' +
    'nothing"), so the record shows a claim that was overturned rather ' +
    'than one quietly removed. A correction with no surviving argument to ' +
    'argue against is indistinguishable from a retcon');
})();

// ---- 9o(5): THE BUTTON IS PAINTED, AND IT IS THE PEN'S SECOND INSTANCE ---
(function () {
  const band = bodyOf('renderNotebookBand');
  assert.ok(/place\(write, NB_BAND\.write\)/.test(band),
    '(9o) `write` is painted at the band table\'s own slot — read from the ' +
    'table, never re-typed');
  assert.ok(/write\.textContent = 'write'/.test(band) &&
    /write\.setAttribute\('aria-label', 'write'\)/.test(band),
    '(9o) it says `write` and is announced as `write` — one string, so the ' +
    'visible and accessible names cannot drift');
  assert.ok(/aria-pressed/.test(band),
    '(9o) and it reports its armed state with aria-pressed, like the pen');
  assert.ok(/station-nb-write/.test(band),
    '(9o) it wears the `station-nb-write` hook the is-on inversion needs');
  assert.ok(/station-caption-add station-nb-row station-nb-write/.test(band),
    '(9o) on the band\'s ONE type register — the pen\'s second instance, ' +
    'not a new idiom');
  assert.ok(/setNotebookWrite\(!NB_WRITE\)/.test(band),
    '(9o) and its click TOGGLES rather than arms: a control that could ' +
    'only ever be armed would leave her no way back to plain arranging');

  // ---- AND IT REACHES THE SCENE. DRIVEN, NOT GREPED. -------------------
  //
  // EVERY ASSERTION ABOVE IS A SOURCE GREP, AND SOURCE GREPS CANNOT SEE
  // THE ONE DEFECT THAT MATTERS MOST HERE. Mutation N-I deleted
  // `scene.appendChild(write)` — the button was still constructed, still
  // classed, still labelled, still placed at its slot, and still wired to
  // its toggle. It simply never reached the page. Every grep above stayed
  // green. That is 26.9's M-T9 lesson exactly ("a painted control wired to
  // nothing left every structural assertion green"), and the phase's named
  // defect class landing inside the instrument built to catch it.
  //
  // So the node is taken off the SCENE the painter actually appended to.
  const painted = paintBand(0, 0);
  const w = painted.nodes.filter(function (n) {
    return n.attrs['aria-label'] === 'write';
  });
  assert.strictEqual(w.length, 1,
    '(9o) EXACTLY ONE `write` control is APPENDED TO THE SCENE — not zero ' +
    '(built and never attached: invisible to her, invisible to a grep) and ' +
    'not two (a doubled painter)');
  assert.strictEqual(w[0].tag, 'button',
    '(9o) it is a real <button>, so it is focusable and keyboard-operable ' +
    'without any extra work');
  assert.strictEqual(w[0].text, 'write',
    '(9o) it VISIBLY says `write` on the node itself');
  assert.strictEqual(w[0].attrs['aria-label'], w[0].text,
    '(9o) and the accessible name EQUALS the visible one, measured off the ' +
    'painted node rather than off two source literals that happen to match');
  assert.strictEqual(w[0].attrs['aria-pressed'], 'false',
    '(9o) it reports itself UNARMED at rest — aria-pressed present and ' +
    'false, not absent (absent means "not a toggle at all")');
  assert.deepStrictEqual([w[0].style.__p['--x'], w[0].style.__p['--y'],
    w[0].style.__p['--w'], w[0].style.__p['--h']],
  ['320', '196', '32', '16'],
    '(9o) at the band table\'s slot, BY VALUE, read off the painted node');
  assert.strictEqual(/\bis-on\b/.test(w[0].cls), false,
    '(9o) and it does not wear `is-on` while disarmed — the armed look is ' +
    'a state, and a control that always looks armed teaches nothing');
  // IT IS WIRED, AND TO ITS OWN SETTER
  assert.strictEqual((w[0].__on.click || []).length, 1,
    '(9o) it carries exactly one click handler');
  w[0].__on.click[0]();
  assert.deepStrictEqual(painted.toggled, [['write', true]],
    '(9o) AND THE CLICK IS DRIVEN: it calls setNotebookWrite with `true` ' +
    'from the disarmed state. A painted control wired to nothing passes ' +
    'every structural assertion above it (the M-T9 lesson), so the wiring ' +
    'is exercised rather than read');
  // THE PEN IS STILL THERE BESIDE IT — the positive control, because a
  // painter that dropped the pen while adding write would satisfy every
  // write assertion above.
  assert.strictEqual(painted.nodes.filter(function (n) {
    return n.attrs['aria-label'] === 'pen';
  }).length, 1,
    '(9o) POSITIVE CONTROL: the pen is still painted beside it. `write` ' +
    'was ADDED to the band, not swapped in for its sibling');

  // RESET ON RAISE, AND ON LEAVING THE MODE
  assert.ok(/NB_WRITE = false/.test(bodyOf('renderNotebookStation')),
    '(9o) a raise always lands with NO tool armed — NB_WRITE is reset ' +
    'beside the shipped NB_PEN reset');
  assert.ok(/NB_WRITE = false/.test(bodyOf('setNotebookDesign')),
    '(9o) AND LEAVING DESIGN MODE DISARMS IT TOO. `write` is a mode WITHIN ' +
    'the mode and cannot outlive it: without this, exiting and re-entering ' +
    'arranging would land with a tool already armed and the next tap on ' +
    'the page would mint a record she did not ask for');

  // THE ARMED LOOK IS THE SHIPPED INVERSION, NOT A THIRD COLOUR
  const cssRaw = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const cssCode = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  // 26.91-18: REWRITTEN, NEVER DELETED — and the invariant it guards is
  // UNCHANGED. What this assertion has always been about is that the two
  // armed tools share ONE rule: ONE IDIOM, TWO INSTANCES, so two tools that
  // behave identically look identical. That still holds and is still pinned
  // below. What changed is the rule's SELECTOR, and it had to.
  //
  // THIS ASSERTION CAUGHT A REAL CHANGE AND THAT IS WHY IT IS BEING
  // STRENGTHENED RATHER THAN RELAXED. It went red the moment 26.91-18 moved
  // the selector, which is a shipped gate doing exactly its job in a phase
  // whose standing lesson is that gates fail to fail.
  //
  // WHY THE SELECTOR MOVED: THIS RULE HAD NEVER TAKEN EFFECT. Measured live
  // on the glass 2026-08-09 at --k 3, the armed chip rendered
  // `rgb(224,199,154)` on `rgb(44,40,35)` — byte-for-byte its RESTING look,
  // i.e. `--btn-bg` over `--btn`. The old selector was `.station-nb-pen.is-on`
  // at specificity (0,0,2,0); the F-6 pixel-button type register
  // `.station-caption-add.station-nb-row` is ALSO (0,0,2,0) and is declared
  // LATER, so on the tie SOURCE ORDER decided and the register won every
  // time. Driven, not read: restating the SAME (0,0,2,0) selector after the
  // register inverts correctly, which isolates order as the whole cause.
  //
  // SO THE PIN IS NOW STRICTLY STRONGER. It still requires ONE rule carrying
  // BOTH hooks — the surviving half — and it additionally requires each hook
  // to be qualified by the type register, which is what makes the armed look
  // actually reach the glass. The old form would pass on a rule that renders
  // nothing at all; this one cannot. That is the opposite of a weakening.
  // ---- RE-KEYED 26.91-22 (A-15's instruction). REWORDED, NEVER DELETED
  // AND NEVER WEAKENED -----------------------------------------------------
  //
  // WHAT DIED. The assertion below used to carry the claim *two tools that
  // BEHAVE identically must LOOK identical*, and that MESSAGE is what
  // steered wave 18 into giving both armed tools one shared cursor. Her seal
  // UAT falsified the antecedent from both ends at once:
  //
  //   - beat S5 measured that pen and `write` do NOT behave identically —
  //     `attachPageDrag`'s pointerdown guard tested NB_PEN only;
  //   - and she then asked for the opposite conclusion anyway: "i need pen
  //     and write's curor should look different, like pen is a inkpen and
  //     write is a pencil" (A-15 ruling 2).
  //
  // AND THE OBVIOUS REPAIR IS ALSO WRONG, WHICH IS WHY THIS IS NOT KEYED TO
  // BEHAVIOUR AT ALL. A-15 predicted that wave 20's mark-lock fix would make
  // the antecedent universally true "by construction". WAVE 20 MEASURED THAT
  // IT DID NOT: `write` over a mark still makes nothing while the pen over a
  // mark draws, because the mark and the placement canvas are SIBLINGS
  // (deferred-items D-9). The two tools are now identical in the MARK-LOCK
  // property ONLY. A gate re-keyed to behavioural equality would assert
  // something false.
  //
  // WHAT THE EXPRESSION BELOW STILL IS. The regex and the single-rule count
  // that follows it are KEPT AS EXPRESSIONS, BYTE-UNCHANGED, because they
  // pin a separate and still-true claim: the band CHIP announces *a tool is
  // armed* — one fact, one rule — and each hook is qualified by the F-6 type
  // register so the rule actually reaches the glass. Wave 18 discovered by
  // live measurement that dropping that qualification makes the rule render
  // nothing at all, so the qualification is not decoration.
  //
  // ANTI-VACUITY, STATED AS MEASURED FACT RATHER THAN AS INTENT (measured
  // 2026-08-10 at this plan's own HEAD, before the tokens.css commit):
  //
  //   - the chip pin and the single-rule count were GREEN at HEAD and are
  //     green now. They are unchanged, so they prove nothing about this
  //     plan's work — and mutation 5 (dropping one hook from the selector
  //     list) reddens the chip pin, which is what shows the KEPT half is
  //     still armed rather than left green by accident.
  //   - all four new assertions below — exactly-one-rule-per-hook, the
  //     values differ, each names its own tool's asset, and the keyword
  //     tail — were RED at HEAD, where tokens.css carried zero references
  //     to either cursor asset and the two per-tool hooks keyed no rule at
  //     all.
  //   - the region-scoped negative was GREEN at HEAD, deliberately: it is a
  //     REGRESSION guard, not a claim about new work, and its discrimination
  //     is proven by mutation 1 rather than by its colour today.
  const ARMED_RULE =
    /\.station-caption-add\.station-nb-row\.station-nb-pen\.is-on,\s*\.station-caption-add\.station-nb-row\.station-nb-write\.is-on\s*\{/;
  assert.ok(ARMED_RULE.test(cssCode),
    '(9o) THE CHIP ANNOUNCES THAT A TOOL IS ARMED, IN ONE RULE, AND IT MUST ' +
    'ACTUALLY RENDER. One fact, one rule: the band chip says *a tool is ' +
    'armed*, which is the same fact whichever tool it is, so both hooks sit ' +
    'in ONE selector list — AND each hook is qualified by the band\'s type ' +
    'register so the armed look OUTRANKS it. Both halves are load-bearing: ' +
    'measured live 2026-08-09, the unqualified form lost a specificity TIE ' +
    'to that register on source order and had never inverted at all, so a ' +
    'gate that pinned only the sharing would stay green on a rule that ' +
    'renders nothing. THIS ASSERTION NO LONGER CLAIMS ANYTHING ABOUT HOW ' +
    'THE TWO TOOLS LOOK AT THE PAGE — see the re-key note above and the ' +
    'three assertions below');
  assert.strictEqual((cssCode.match(/\.station-nb-write/g) || []).length, 1,
    '(9o) `station-nb-write` appears in exactly ONE rule — it is an ' +
    'is-on hook, not a second face');

  // =======================================================================
  // 26.91-22: THE NEW CLAIM — EACH ARMED TOOL'S CURSOR NAMES THE MARK THAT
  // TOOL MAKES. Added, never substituted for anything above.
  // =======================================================================
  //
  // WHY THIS EXISTS. A-15 ruling 2, her words at beat S5 of the seal UAT:
  // "i need pen and write's curor should look different, like pen is a
  // inkpen and write is a pencil." The mapping inkpen -> `pen` and
  // pencil -> `write` is HERS and is pinned by value below rather than
  // derived, because it is a ruling and no measurement can produce it.
  //
  // THE HOOK NAMES ARE LIFTED FROM nbSyncArmedClass, by the FLAG each is
  // derived from, so a rename in app.js reddens here instead of passing.
  (function () {
    const src = bodyOf('nbSyncArmedClass');
    const PEN_H = (src.match(/toggle\('([a-z-]+)', !!NB_PEN\)/) || [])[1];
    const WRITE_H = (src.match(/toggle\('([a-z-]+)', !!NB_WRITE\)/) || [])[1];
    assert.ok(PEN_H && WRITE_H && PEN_H !== WRITE_H,
      '(9o) the two per-tool armed hooks LIFT from nbSyncArmedClass and are ' +
      'distinct — lifted ' + JSON.stringify([PEN_H, WRITE_H]));

    // THE CURSOR-DECLARING RULES, EXTRACTED ONCE AND ASSERTED NON-EMPTY
    // BEFORE ANYTHING IS COUNTED OVER THEM. T-26.91-104: a region gate armed
    // at a region that does not exist must REFUSE, not pass. That defect has
    // fired three times in this phase, twice inside the instrument written
    // to catch it.
    const RULES = [];
    const re = /cursor\s*:/g;
    let m;
    while ((m = re.exec(cssCode))) {
      const brace = cssCode.lastIndexOf('{', m.index);
      if (brace < 0) { continue; }
      const start = Math.max(cssCode.lastIndexOf('}', brace),
        cssCode.lastIndexOf('{', brace - 1)) + 1;
      const close = cssCode.indexOf('}', brace);
      RULES.push({
        sel: cssCode.slice(start, brace).replace(/\s+/g, ' ').trim(),
        body: close < 0 ? '' : cssCode.slice(brace + 1, close)
      });
    }
    assert.ok(RULES.length > 0,
      '(9o) the cursor-declaring region of tokens.css is EMPTY — every ' +
      'assertion below would be a count over nothing, which is the ' +
      'pass-equals-total shape this phase keeps re-discovering');

    // ---- THE REGION-SCOPED NEGATIVE. THIS IS THE HALF A-15 REQUIRES ANY
    // REWRITE TO KEEP: the gate must still catch a cursor keyed to the band
    // CHIP rather than to the page. She looks at the PAGE while she draws,
    // so a chip-keyed cursor is a fix she can never see — the wave-18
    // regression, mechanically.
    //
    // IT IS REGION-SCOPED AND MUST BE, OR IT IS UNSATISFIABLE. The chip
    // hooks legitimately appear in tokens.css — the armed-chip inversion
    // rule pinned directly above IS one — so a file-wide ban on the hook
    // name could never pass. The ban is taken over the cursor-declaring
    // rules ONLY. And it names the two PER-TOOL chip hooks, not the shared
    // `.station-caption-add` type register, which legitimately carries
    // `cursor: pointer` for every band row.
    const CHIP_HOOKS = (appSrc.match(
      /'station-caption-add station-nb-row (station-nb-[a-z]+)'/g) || [])
      .map(function (s) { return s.replace(/^.* /, '').replace(/'$/, ''); });
    // MEASURED 2026-08-10, AND IT CORRECTED THIS ASSERTION'S FIRST FORM.
    // The first version pinned the lift at EXACTLY 2 on the assumption that
    // the two armed tools were the only chips wearing this shape. Driving it
    // returned FOUR — the day reset and the error row wear it too. Pinning
    // 2 would have been a gate that could only ever be red. So the ban runs
    // over EVERY hook the painter emits (strictly stronger, and satisfiable:
    // none of the cursor-declaring rules names any of them), with a floor
    // and with the two ARMED hooks asserted present by name so the negative's
    // core claim cannot evaporate if the band's roster changes.
    assert.ok(CHIP_HOOKS.length >= 2 &&
      new Set(CHIP_HOOKS).size === CHIP_HOOKS.length,
      '(9o) the band-chip hooks LIFT from the shipped band painter and are ' +
      'distinct — lifted ' + JSON.stringify(CHIP_HOOKS) + '. Hand-typing ' +
      'them here would make this negative agree with itself after a rename');
    ['station-nb-pen', 'station-nb-write'].forEach(function (armed) {
      assert.ok(CHIP_HOOKS.indexOf(armed) !== -1,
        '(9o) the ARMED chip hook `' + armed + '` is among the lifted set. ' +
        'Pinned by name because it is the one this negative exists for: a ' +
        'lift that silently stopped finding it would leave the ban running ' +
        'over rows nobody was ever going to key a cursor off. Lifted: ' +
        JSON.stringify(CHIP_HOOKS));
    });
    CHIP_HOOKS.forEach(function (hook) {
      const bad = RULES.filter(function (r) {
        return r.sel.indexOf(hook) !== -1;
      });
      assert.deepStrictEqual(bad.map(function (r) { return r.sel; }), [],
        '(9o) NO `cursor` DECLARATION MAY SIT IN A RULE NAMING THE BAND ' +
        'CHIP HOOK `' + hook + '`. This is what wave 18 originally caught ' +
        'and what A-15 requires this rewrite to go on catching: a cursor ' +
        'hung off the band changes the pointer only while it is over the ' +
        'band, which is the one surface her ruling excludes. Offending ' +
        'rules: ' + JSON.stringify(bad.map(function (r) { return r.sel; })));
    });

    // ---- EXACTLY TWO PER-TOOL CURSOR RULES, AND THEIR VALUES DIFFER.
    const perTool = {};
    [PEN_H, WRITE_H].forEach(function (hook) {
      const hits = RULES.filter(function (r) {
        return r.sel.indexOf('.' + hook) !== -1;
      });
      assert.strictEqual(hits.length, 1,
        '(9o) the hook `' + hook + '` must key EXACTLY ONE cursor-declaring ' +
        'rule; found ' + hits.length + '. Two rules for one tool drift');
      perTool[hook] = hits[0].body.replace(/\s+/g, ' ').trim();
    });
    assert.notStrictEqual(perTool[PEN_H], perTool[WRITE_H],
      '(9o) AND THE TWO VALUES DIFFER. Her ruling at S5 is that the two ' +
      'armed tools must NOT look alike, so two identical declarations here ' +
      'would ship the very thing she sent back. pen ' +
      JSON.stringify(perTool[PEN_H]) + ' vs write ' +
      JSON.stringify(perTool[WRITE_H]));

    // ---- AND EACH NAMES ITS OWN TOOL'S ASSET. The pairing is HER RULING,
    // pinned by value: an inkpen for the tool that draws a permanent
    // stroke, a pencil for the tool that writes words.
    assert.ok(/cursor-inkpen\.png/.test(perTool[PEN_H]),
      '(9o) the PEN\'s rule names the INKPEN asset — "pen is a inkpen", ' +
      'her words. Found: ' + JSON.stringify(perTool[PEN_H]));
    assert.ok(/cursor-pencil\.png/.test(perTool[WRITE_H]),
      '(9o) and `write`\'s names the PENCIL — "write is a pencil". Swapping ' +
      'the two assets satisfies the difference assertion above completely, ' +
      'which is why this pair exists beside it. Found: ' +
      JSON.stringify(perTool[WRITE_H]));

    // ---- THE KEYWORD FALLBACK IS NOT OPTIONAL. A cursor list with no
    // keyword tail degrades to the default arrow wherever the image cannot
    // load, silently un-shipping F-17's fix along with F-20's.
    [PEN_H, WRITE_H].forEach(function (hook) {
      assert.ok(/,\s*[a-z-]+\s*;?\s*$/.test(perTool[hook]),
        '(9o) `' + hook + '`\'s cursor list must END IN A KEYWORD. ' +
        '`.page-deco-rotate` already ships this shape and it is the shipped ' +
        'pattern. Found: ' + JSON.stringify(perTool[hook]));
    });
  })();
})();

// ---- 91c: G-C1 — THE FINDABILITY GATE, OVER THE EXECUTED RENDER ----------
//
// WHAT THIS GATE IS FOR. Phase 26.9 shipped every wave with green suites and
// the owner could not find any of it. `working` and `findable` are different
// claims and only the first had ever been measured. This gate measures what
// her EYE reads — `textContent` — and asserts the accessible name equals it.
//
// THE WRITTEN ANTI-VACUITY AUDIT (26.91-VALIDATION.md's four questions):
//
//   (a) CAN IT PASS BEFORE THE WORK? No. At 26.9 HEAD the band painted `↺`
//       and `↻` and the tin painted nothing at all; the banned-glyph
//       assertion and the length floor both fail on that state, and the
//       by-value named set below could not be produced by it.
//   (b) CAN IT STILL PASS ONCE THE WORK IS BROKEN? No, and this was DRIVEN
//       four ways rather than argued — the undo glyph restored, the tin's
//       aria-label widened away from its visible word, a third exemption
//       manufactured, and the `write` control deleted from the painter. Each
//       went red on a DIFFERENT assertion. (26.91-03-SUMMARY.md, M-P1..M-P4.)
//   (c) DOES A DEGENERATE IMPLEMENTATION SATISFY IT? Four degenerate forms,
//       each closed by name:
//         - AN ARIA-ONLY AUDIT. This is the important one and it is REJECTED
//           rather than merely not chosen: every band control already
//           carried an `aria-label` BEFORE this phase (undo/redo have had
//           theirs since 26.9-06), so an aria-only gate passes at HEAD and
//           passes a deliberately broken build in which her eye still sees
//           two arrows. The gate therefore reads `textContent`, and the
//           aria-label is asserted only as an EQUALITY to it.
//         - A LABEL THAT IS NOT WHAT A USER READS — closed by that equality.
//         - AN EMPTY OR ONE-CHARACTER LABEL — closed by `length >= 3` and by
//           the `{2,}` floor in the regex.
//         - SATISFYING THE GATE BY EXEMPTING A CONTROL INSTEAD OF NAMING IT
//           — closed by the by-value exempt-set pin, which is the mechanism
//           this phase specifically needed.
//   (d) EVALUATION ORDER OR SOURCE ORDER? EVALUATION. Every string below is
//       read off a node a real painter appended to a real scene. The ONE
//       source assertion in this group is labelled as such and says why.
//
// WHAT IT CANNOT PROVE, STATED HONESTLY: that the controls are NAMED is not
// that she NOTICED them. There is no automated proxy for the second. This
// gate raises the floor from unnamed to named; the ceiling is her eye and
// that is the phase's blocking UAT beat.
//
// THE SCAN WINDOW, STATED AND THEN CLOSED. Three painters put controls in
// the notebook's band line, not two:
//     renderNotebookBand  -> undo, redo, pen, write, the reset row
//     renderTinTray       -> the tin (`marks`)
//     paintNotebookSpread -> prev, next, and the arrange/exit row
// The plan's letter partitioned the exempt pair out of the FIRST TWO
// painters' nodes. It cannot be done there: `prev` and `next` are painted by
// paintNotebookSpread and appear nowhere in the band harness, so an exempt
// partition taken over that window is EMPTY and `exempt.length === 2` is
// permanently unmeetable — a stale gate, which is the same defect class as a
// stale pinned total. The third painter is therefore DRIVEN here too, and
// each window's membership is pinned BY VALUE separately so a control that
// silently moved between painters fails rather than passing by relocation.

function paintSpread(opts) {
  const o = opts || {};
  const nodes = [];
  const doc = nbNodeDoc();
  const scene = { children: [], appendChild: function (n) { nodes.push(n); } };
  // The two downstream band painters are STUBBED, and the stubs are asserted
  // to have been CALLED. That is what makes the three windows disjoint AND
  // asserted: without the call check, a paintNotebookSpread that stopped
  // painting the band entirely would leave this window looking correct.
  // 26.91-10 — A REAL DEFECT IN THIS HARNESS, FOUND BY F-1 AND FIXED HERE.
  // `paintNotebookCalendar` and `paintBlessingPage` were BOTH stubbed onto
  // `calls.page`, two adjacent parameters incrementing one counter. It was
  // invisible while the calendar painted only on a spread whose fixture said
  // so — none of these fixtures did — so `calls.page` happened to mean
  // "paintBlessingPage". Under F-1 the calendar paints on EVERY spread, and
  // the conflated counter would have reported a blessing page on an
  // import-only spread. Split, with the calendar given its own counter and
  // its own assertions below.
  const calls = { band: 0, tin: 0, pen: 0, page: 0, calendar: 0,
    arrivals: 0, trace: 0 };
  // 26.91-07: THE SPREAD FIXTURE IS NOW A PARAMETER, AND ITS DEFAULT
  // CHANGED — REWRITTEN, NEVER DELETED. It used to be three `pages: []`
  // spreads, which was fine while the arrange row painted unconditionally.
  // Open Decision #2's owner ruling (`read-only-import-day`, 2026-08-07)
  // makes the row conditional on the spread holding a DECORATABLE page, so
  // a `pages: []` default would have quietly stopped painting the row and
  // taken (91c)'s by-value naming assertions down with it — the gate would
  // have reported "the row is gone" when the real claim is "the row is
  // conditional". The default therefore carries a real blessing page (the
  // row's NAME is asserted on a spread that CAN be arranged), and the
  // import-only shape is driven EXPLICITLY in (91c-b) rather than being
  // the accidental default nobody chose.
  const blessingPage = { itemId: 'abc123' };
  // 26.91-10 (F-1): the emitted spread shape no longer carries a
  // spread-level grid discriminator, so these fixtures do not either — a
  // harness that kept minting a field the model deleted would let a painter
  // that still read it look correct here.
  // 26.91-17 (F-15), THE DEFAULT FIXTURE MOVES WITH THE PREDICATE — the
  // repo's standing rule that expectations move with the constant. It used
  // to be three DISTINCT days, which was fine while the flip stepped across
  // day boundaries. Her ruling of 2026-08-09 makes the flip DAY-SCOPED, so
  // on that fixture the middle spread has no same-day neighbour on either
  // side and NEITHER door renders — the exempt partition below would have
  // gone to zero and reported "the page-turn arrows were deleted" when the
  // real behaviour is "the arrows are correctly absent at a day boundary".
  // A ONE-DAY, THREE-PAGE fixture is what exercises the doors now: at the
  // default view 1 both neighbours are the same day, so both arrows render
  // and every by-value assertion below keeps measuring what it was written
  // to measure. The day-BOUNDARY behaviour is driven separately in (91c-b),
  // by value, so neither case is inferred from the other.
  const spreads = o.spreads || [
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' }
  ];
  const names = ['document', 'NBDESIGN', 'DESIGN', 'STATION_NOTEBOOK_GEOM',
    'STATION_NOTEBOOK', 'NB_REPAINT', 'NB_DAY', 'NB_UNDO', 'NB_REDO',
    'NB_RESET_ARMED', 'NB_PLACE', 'NB_BAND', 'ROOM', 'SHELF', 'StudyCore',
    'attachPenCapture', 'packArrivalDays', 'blessingsDayRoster',
    'buildBlessingSpreads',
    'paintNotebookCalendar', 'paintBlessingPage', 'paintTracePage',
    'renderNotebookBand',
    'renderTinTray', 'setNotebookDesign', '__calls'];
  // eslint-disable-next-line no-new-func
  const fn = new Function(names.join(','),
    extractFn(appSrc, 'paintNotebookSpread') +
    // NB_PLACE is a parameter of the generated function, so an assignment
    // inside the painter is invisible from out here. It is read back
    // through the closure instead of being inferred, because 26.9-04 wrote
    // `NB_PLACE = null` on a page-less spread DELIBERATELY and 26.91-07
    // extends that to the trace page — a claim worth driving, not reading.
    '\nreturn { paint: paintNotebookSpread,' +
    ' place: function () { return NB_PLACE; } };')(
    doc, !!o.designing, false, NB_SRC_CONSTS.STATION_NOTEBOOK_GEOM,
    { view: o.view === undefined ? 1 : o.view, month: '2026-08' },
    null, null, [], [], false, null,
    NB_SRC_CONSTS.NB_BAND, { items: [] }, { filters: {} },
    { guardSurface: function () { return true; } },
    function () { calls.pen++; },
    function () { calls.arrivals++; return []; },
    function () { return []; },
    function () { return spreads; },
    function () { calls.calendar++; }, function () { calls.page++; },
    function () { calls.trace++; },
    function () { calls.band++; }, function () { calls.tin++; }, function () {},
    calls);
  fn.paint(scene, [{ itemId: 'abc123' }], []);
  return { nodes: nodes, calls: calls, place: fn.place() };
}

// Every <button> the painters appended, INCLUDING nested ones: the reset
// row is a <div> whose label lives on a `.station-nb-word` child, so a
// top-level-only walk would drop the reset control's label — the longest
// one INSIDE THIS WALK'S COUNTING WINDOW (renderNotebookBand +
// renderTinTray, the convention stated at the six-name roster below), and
// the one the owner has now reviewed three times: F-12, F-13, and the
// 2026-08-07 UAT that renamed it.
//
// 26.91-11: THE SUPERLATIVE IS SCOPED ON PURPOSE, because unscoped it is
// FALSE. `arrange this day` (16) is longer than the reset label (15) and
// always was — it is simply painted by paintNotebookSpread and therefore
// sits OUTSIDE this window. The structural point is unchanged: the label
// lives on a child node, so a top-level-only walk misses it.
function nbControlsIn(list) {
  const out = [];
  (function walk(ns) {
    ns.forEach(function (n) {
      if (n.tag === 'button') { out.push(n); }
      if (n.kids && n.kids.length) { walk(n.kids); }
    });
  })(list);
  return out;
}

(function () {
  const B = NB_SRC_CONSTS.NB_BAND;
  // The slot key is DERIVED by matching the painted node's own --x/--y/--w/--h
  // against the REAL NB_BAND table, never read from a hand-written map. Every
  // slot in that table is unique on those four numbers, which is what makes
  // the match a single key rather than a guess.
  function slotKeyOf(n) {
    const p = n.style.__p;
    if (p['--x'] === undefined) { return null; }
    const hit = Object.keys(B).filter(function (k) {
      return String(B[k].x) === p['--x'] && String(B[k].y) === p['--y'] &&
        String(B[k].w) === p['--w'] && String(B[k].h) === p['--h'];
    });
    return hit.length === 1 ? hit[0] : null;
  }

  // BOTH STACKS NON-EMPTY so every control is ENABLED — a band measured only
  // in its disabled state would be measuring `.station-nb-off`, not the
  // resting look she actually meets.
  const band = paintBand(2, 1);
  const spread = paintSpread({ designing: true });

  // ---- the window boundaries, asserted so they cannot silently shrink ----
  assert.strictEqual(spread.calls.band, 1,
    '(91c) SCAN WINDOW: paintNotebookSpread calls renderNotebookBand exactly ' +
    'once. The band painter is stubbed HERE and driven in its own window, so ' +
    'this call count is what keeps the two windows disjoint AND connected — ' +
    'without it, a spread that stopped painting the band would leave every ' +
    'assertion in this group green over a band that no longer exists');
  assert.strictEqual(spread.calls.tin, 1,
    '(91c) SCAN WINDOW: and renderTinTray exactly once, for the same reason. ' +
    'The tin is the control F-6 was reported against');
  // 26.91-17 (F-15) — REWRITTEN, NEVER DELETED, AND THE REWRITE IS THE
  // POINT. This line pinned `spread.calls.arrivals === 1`: wave 6's claim
  // that packArrivalDays is called exactly once per paint, inside the
  // render path, never hoisted and never memoized. The owner ruling of
  // 2026-08-09 (26.91-CONTEXT.md A-14) takes that call OFF the render path
  // entirely, so the old expectation is now the FAILING state rather than
  // the passing one. The pin MOVES with the behaviour.
  //
  // ⚠ A BARE `=== 0` WOULD BE THE VACUOUS SHAPE THIS FILE IS WRITTEN
  // AGAINST — it is satisfied just as well by a harness that lost its
  // counter, by a painter that threw before reaching anything, or by a stub
  // that was never wired in the first place. So it is asserted as a
  // CONJUNCTION with live counters from the SAME RUN: the paint really did
  // run and really did call the other four things it is supposed to call.
  assert.strictEqual(spread.calls.arrivals, 0,
    '(91c/26.91-17) THE ARRIVAL PACK CALL IS OFF THE RENDER PATH: ' +
    'paintNotebookSpread does not call packArrivalDays at all. Her ruling ' +
    'of 2026-08-09 (A-14) day-scopes the flip AND returns the notebook\'s ' +
    'day-set to the calendar\'s lit-day set; a call whose result no ' +
    'consumer reads is the dead-value shape wave 13 removed, so it is gone ' +
    'from the paint rather than left to "keep the fence warm". The PACKER ' +
    'itself is RETAINED WHOLE for Phase 26.95 with a retention notice at ' +
    'its own site, and is proven still able to FIRE by (G-F3/c) and ' +
    '(G-17/fence). Got ' + spread.calls.arrivals);
  assert.ok(spread.calls.calendar === 1 && spread.calls.band === 1 &&
    spread.calls.tin === 1 && spread.calls.pen === 1,
    '(91c/26.91-17) POSITIVE CONTROL FOR THE ZERO ABOVE, IN THE SAME RUN: ' +
    'the paint really ran and really called the calendar, the band, the tin ' +
    'and the pen exactly once each. Without this, `arrivals === 0` is ' +
    'satisfied by a painter that threw, a counter that was never wired, or ' +
    'a stub that was never passed — three ways to measure nothing while ' +
    'reporting green. Got ' + JSON.stringify(spread.calls));

  const bandCtl = nbControlsIn(band.nodes.concat(band.tinNodes));
  const spreadCtl = nbControlsIn(spread.nodes);

  assert.ok(bandCtl.length > 0 && spreadCtl.length > 0,
    '(91c) both windows painted something at all. A zero-length collection ' +
    'satisfies every per-node loop below by never running — the degenerate ' +
    'pass this assertion exists solely to close');

  // ---- (1)+(2) THE EXEMPT PARTITION, PINNED BY VALUE --------------------
  const EXEMPT_GLYPHS = ['‹', '›'];
  const all = bandCtl.concat(spreadCtl);
  const exempt = all.filter(function (n) {
    return EXEMPT_GLYPHS.indexOf(n.textContent) !== -1;
  });
  const named = all.filter(function (n) {
    return EXEMPT_GLYPHS.indexOf(n.textContent) === -1;
  });

  assert.strictEqual(exempt.length, 2,
    '(91c) THE EXEMPTION IS EXACTLY TWO, PINNED BY VALUE. This is the ' +
    'mechanism that stops G-C1 being satisfied by GROWING THE EXEMPTION ' +
    'LIST instead of naming a control: a third bare glyph anywhere in the ' +
    'band line fails here rather than quietly joining the excused set. It ' +
    'fails in the other direction too — at 1 or 0 a page-turn arrow stopped ' +
    'being painted, which is a different bug wearing the same number');
  assert.deepStrictEqual(exempt.map(slotKeyOf).sort(), ['next', 'prev'],
    '(91c) and the two exempt nodes are the page-turn arrows SPECIFICALLY, ' +
    'identified by matching each painted node\'s own --x/--y/--w/--h against ' +
    'the real NB_BAND table. Naming them by slot rather than counting them ' +
    'is what stops a NAMED control being excused by handing it a glyph: the ' +
    'exemption is `prev` and `next` or it is a failure. They are excluded ' +
    'because the owner did not flag them and widening the naming fix to ' +
    'them would force a change she never asked for (tokens.css:3170)');
  exempt.forEach(function (n) {
    assert.ok(EXEMPT_GLYPHS.indexOf(n.textContent) !== -1,
      '(91c) each exempt node really carries one of the two shipped bare ' +
      'glyphs — the partition is over what is PAINTED, not over a list of ' +
      'names the gate was told to skip');
  });

  // ---- (3) THE FOUR PER-CONTROL ASSERTIONS, SEPARATELY MESSAGED --------
  named.forEach(function (n) {
    const visible = n.textContent;
    const where = JSON.stringify(visible) + ' (slot ' +
      JSON.stringify(slotKeyOf(n)) + ')';
    // THE SPECIFIC CHECK RUNS BEFORE THE GENERAL ONE, AND THAT ORDER IS
    // LOAD-BEARING RATHER THAN STYLISTIC. Written the other way round — the
    // regex first — the banned-glyph line is UNREACHABLE: all five of `↺`
    // `↻` `✎` `‹` `›` already fail /^[a-z ]{2,}$/, so the regex always
    // throws first and no mutation can ever make the named list fire. An
    // assertion that cannot go red is this phase's defect class in its
    // purest form, and it very nearly landed inside the instrument built to
    // catch it for the second time this wave. Specific-then-general keeps
    // both reachable: the list names a REVERSION to a face the owner
    // already rejected, the regex catches everything else (`Undo`, `undo!`,
    // an empty string) that no list could enumerate.
    assert.strictEqual(['↺', '↻', '✎', '‹', '›'].indexOf(visible), -1,
      '(91c) IT IS NONE OF THE FIVE BANNED GLYPHS: ' + where + '. These are ' +
      'the exact faces the owner could not read — `↺` and `↻` were undo and ' +
      'redo, `✎` was the pen. Listed BY VALUE and checked FIRST so a ' +
      'REVERSION fails here by name rather than being reported as a generic ' +
      'regex miss');
    assert.ok(/^[a-z ]{2,}$/.test(visible),
      '(91c) AND IT IS A LOWERCASE WORD: ' + where + ' must match ' +
      '/^[a-z ]{2,}$/. A symbol, a capital or an empty string is not ' +
      'something her eye can read as a name — F-6 verbatim was an ' +
      '"empty-looking thin rectangle outline". This is the general rule ' +
      'behind the named list above; it catches what no list could enumerate');
    assert.ok(visible.length >= 3,
      '(91c) AND IT IS AT LEAST THREE CHARACTERS: ' + where + '. A one- or ' +
      'two-character label is a glyph with extra steps');
    assert.strictEqual(n.attrs['aria-label'], visible,
      '(91c) AND THE ACCESSIBLE NAME EQUALS THE VISIBLE ONE: ' + where +
      ' announces ' + JSON.stringify(n.attrs['aria-label']) + '. An ' +
      'aria-label that DISAGREES with the visible word is the degenerate ' +
      'form this whole gate exists to close — it lets a control claim to ' +
      'be named while her eye still sees nothing, which is precisely the ' +
      'state F-6 was reported against');
  });

  // ---- (4) THE NAMED SET, BY VALUE, PER WINDOW -------------------------
  //
  // THE COUNTING CONVENTION IS STATED IN THE MESSAGE, because the windows
  // are the thing a later reader will get wrong. A by-value list rather
  // than a count: a control that stops being painted at all must fail HERE,
  // and a count is satisfied by any replacement of equal cardinality.
  const visiblesOf = function (l) {
    return l.map(function (n) { return n.textContent; }).sort();
  };
  assert.deepStrictEqual(
    visiblesOf(bandCtl.filter(function (n) {
      return EXEMPT_GLYPHS.indexOf(n.textContent) === -1;
    })),
    ['marks', 'pen', 'redo', 'undo', 'undo everything', 'write'],
    '(91c) THE BAND + TIN WINDOW NAMES EXACTLY SIX CONTROLS, BY VALUE, at ' +
    'NB_RESET_ARMED === false. COUNTING CONVENTION: this window is ' +
    'renderNotebookBand + renderTinTray only. The arrange/exit row and the ' +
    'two page-turn arrows are painted by paintNotebookSpread and are ' +
    'asserted in their own window below; the confirmation panel\'s `yes`/' +
    '`no` are not painted at rest. A deleted control fails on this list ' +
    'rather than on a number, which is the difference between "one control ' +
    'went missing" and "some control went missing". ' +
    'THE PREFIX COLLISION, AND WHY THIS FORM IS LOAD-BEARING (26.91-11, ' +
    'F-2): `undo` is a STRICT PREFIX of `undo everything`, and since the ' +
    'rename both render in THIS band. This list is a sorted by-value ' +
    'deepStrictEqual and is therefore immune — it compares whole strings, ' +
    'so the two controls are two distinct entries and neither can stand in ' +
    'for the other. A SUBSTRING form of the same check could not tell them ' +
    'apart: searching for `undo` would be satisfied by text rendering ' +
    '`undo everything`, so a band that had LOST its single-step control ' +
    'would still pass. That is the identical defect the 2026-08-07 UAT ' +
    'scanner exhibited when it fired on `Memoirs` for the term ' +
    '`Memoir`. Do not convert this assertion to membership, includes, ' +
    'indexOf or a bare regex.');
  assert.deepStrictEqual(visiblesOf(spreadCtl.filter(function (n) {
    return EXEMPT_GLYPHS.indexOf(n.textContent) === -1;
  })), ['done arranging'],
    '(91c) AND THE SPREAD WINDOW NAMES EXACTLY ONE while arranging — the ' +
    'exit row. Pinned separately from the band window so a control that ' +
    'silently MOVED between painters fails rather than passing by ' +
    'relocation: a union alone could not tell the two apart');

  // the reading-mode face of the same row, so both branches of the ternary
  // are measured on a painted node rather than one of them being inferred
  const reading = paintSpread({ designing: false });
  assert.deepStrictEqual(visiblesOf(nbControlsIn(reading.nodes)
    .filter(function (n) {
      return EXEMPT_GLYPHS.indexOf(n.textContent) === -1;
    })), ['arrange this day'],
    '(91c) and in READING mode the same row says `arrange this day`. Both ' +
    'branches of the ternary are driven, because a ternary tested on one ' +
    'side is a constant');

  // ---- (5) THE ONE SOURCE ASSERTION, LABELLED AS SUCH -----------------
  //
  // This is a SOURCE assertion and it is marked as one deliberately. It is
  // kept even though the row is now driven above, because it pins the
  // shape — that the visible ternary and the aria-label ternary yield the
  // SAME PAIR OF STRINGS — which the driven half can only observe one
  // branch at a time. The 26.9-05 lesson was a region-scoped test whose
  // scan window silently missed the rule; the answer is to state the window
  // and then assert the part that falls outside it, not to shrink the claim.
  const spreadSrc91c = bodyOf('paintNotebookSpread');
  const ternaries = spreadSrc91c.match(
    /NBDESIGN \? '([^']+)' : '([^']+)'/g) || [];
  assert.strictEqual(ternaries.length, 2,
    '(91c) SOURCE ASSERTION (a node the executed harness reaches only one ' +
    'branch of at a time): the arrange row declares exactly TWO string ' +
    'ternaries on NBDESIGN — the visible one and the accessible one. Found: ' +
    JSON.stringify(ternaries));
  assert.deepStrictEqual(ternaries, [
    "NBDESIGN ? 'done arranging' : 'arrange this day'",
    "NBDESIGN ? 'done arranging' : 'arrange this day'"
  ], '(91c) SOURCE ASSERTION: and they are BYTE-IDENTICAL — the visible ' +
     'text and the aria-label come from the same pair of strings in the ' +
     'same order, so the two cannot drift apart in one mode while agreeing ' +
     'in the other. Pinned by value, over comment-stripped source');

  // ---- (6) LAW 3: NO BAND STRING IS CARDINALITY-SENSITIVE --------------
  //
  // consideration zero-one-many/E2. Law 3 forbids the room ever speaking a
  // count, and the band is the surface most likely to break it ("undo (3)").
  // It is also what makes G-C5's exact-equality assertion 1 WRITABLE AT ALL:
  // a label that varied with history could not be pinned to one string.
  const one = paintBand(1, 1);
  const many = paintBand(40, 40);
  assert.deepStrictEqual(
    nbControlsIn(one.nodes.concat(one.tinNodes)).map(function (n) {
      return n.textContent;
    }),
    nbControlsIn(many.nodes.concat(many.tinNodes)).map(function (n) {
      return n.textContent;
    }),
    '(91c) LAW 3: the band\'s visible strings at an undo depth of ONE are ' +
    'deep-equal to its strings at FORTY. Not one of them is ' +
    'cardinality-sensitive. Order is compared too, not just membership — a ' +
    'painter that re-ranked its controls with history would move the reset ' +
    'and exit targets under her finger');
  assert.notStrictEqual(one.nodes.length, 0,
    '(91c) POSITIVE CONTROL for the pair above: the one-deep run really did ' +
    'paint controls. Two empty lists are deep-equal, and that is exactly ' +
    'how a law-3 assertion becomes vacuous');
})();

// ---- 91c(b): 26.91-07 — THE BAND ON AN IMPORT-ONLY SPREAD, DRIVEN --------
//
// UI-SPEC Open Decision #2, OWNER RULING `read-only-import-day` (2026-08-07,
// 26.91-CONTEXT.md A-9): on an import-only day's spread the band shows `‹`
// and `›` and NOTHING ELSE. It is a page you can only read.
//
// DRIVEN THROUGH THE REAL PAINTER, never read from source. The source shape
// is pinned in (9g) and says so; this is the half that can see a row which
// was built, classed, labelled, placed and then not appended — the exact
// defect 26.91-02's N-I shipped and no grep caught.
//
// THE ANTI-VACUITY AUDIT:
//   (a) pre? No — before 26.91-07 the row painted on a bare `if (!DESIGN)`,
//       so the import-only run below painted `arrange this day` and the
//       by-value empty list fails.
//   (b) broken? No — restoring the bare guard reddens the import-only list;
//       conditioning on a day-level `lit` flag reddens (9g); dropping the
//       condition entirely reddens both.
//   (c) degenerate? THE ROW VANISHING EVERYWHERE satisfies the ban, so the
//       LIT-day contrast is asserted in the SAME RUN and pinned by value.
//   (d) evaluation. Every string is read off a node the real painter
//       appended to a real scene.
(function bandOnAnImportOnlySpread() {
  // A trace page carries `trace: true` and no itemId — the page-level
  // discriminator, exactly as buildBlessingSpreads mints it.
  const tracePage = { trace: true, day: '08/03/2026', monthKey: '2026-08',
    arrivals: [{ ms: 1, dayLabel: '08/03/2026', monthKey: '2026-08',
      kind: 'notes', folder: 'chinese', source: 'folder-drop' }] };
  const blessingPage = { itemId: 'abc123' };
  const importOnly = [
    { day: '08/02/2026', pages: [tracePage], monthKey: '2026-08' },
    { day: '08/03/2026', pages: [tracePage], monthKey: '2026-08' },
    { day: '08/04/2026', pages: [tracePage], monthKey: '2026-08' }
  ];
  // 26.91-10 REWRITTEN, NEVER DELETED. WAS: a LIT day that also imported,
  // as ONE spread holding `[blessingPage, tracePage]`. Two things retired
  // that shape and both are F-1/F-3: a spread now holds exactly ONE page,
  // and F-3 mints a lit day NO trace page at all. THE CONTRAST THIS
  // FIXTURE EXISTS FOR IS UNCHANGED and is the whole reason (1) is not
  // vacuous — a spread whose page CAN be decorated paints the entry row,
  // and the condition is on the SPREAD'S CONTENTS, never on a day-level
  // `lit` flag.
  const bothKinds = [
    { day: '08/02/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/04/2026', pages: [blessingPage], monthKey: '2026-08' }
  ];

  const EXEMPT = ['‹', '›'];
  function visibles(r) {
    return nbControlsIn(r.nodes).map(function (n) { return n.textContent; })
      .sort();
  }

  // 26.91-17 (F-15): the DAY-SCOPED positive control. A day holding THREE
  // pages renders both doors at its middle page — this is the fixture that
  // keeps every by-value empty list below non-vacuous, because "the arrows
  // disappeared everywhere" is a different bug that a bare absence check
  // reports as a pass. Written as a real, reachable shape: a lit day with
  // three blessings is exactly what her `08/07` and `07/27` days are.
  const sameDayLit = [
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/03/2026', pages: [blessingPage], monthKey: '2026-08' }
  ];

  // ---- (1) THE IMPORT-ONLY SPREAD: THE BAND IS EMPTY -------------------
  //
  // 26.91-17 REWRITTEN, NEVER DELETED. WAS: `‹` and `›` and nothing else —
  // Open Decision #2's ruling that an import-only day is a page you can
  // only read. THAT RULING IS NOT REVERSED; its subject moved. Her ruling
  // of 2026-08-09 day-scopes the flip, and an import-only day holds exactly
  // ONE spread, so it has no same-day neighbour on either side and renders
  // NEITHER door. The band on such a spread is now EMPTY: no arrange row
  // (Open Decision #2) and no arrow (F-15).
  //
  // ⚠ AND NOTHING REPLACES THEM. No "end of day" copy, no disabled control,
  // no placeholder, no count. Running out of arrows IS the signal — the
  // same signal the ends of the book have always given — and authoring a
  // sentence here would be law-3 damage and a law-5 fence tell at once,
  // which is why F-3 removed a sentence rather than shortening it.
  const imp = paintSpread({ spreads: importOnly });
  assert.deepStrictEqual(visibles(imp), [],
    '(91c-b/26.91-17) THE BAND IS EMPTY ON AN IMPORT-ONLY SPREAD: no ' +
    'arrange row (Open Decision #2, 2026-08-07) and no page-turn arrow ' +
    '(F-15, 2026-08-09 — a one-page day has no in-day neighbour). Pinned ' +
    'BY VALUE. THE NON-VACUITY OF THIS EMPTY LIST IS CLOSED IN THE SAME ' +
    'RUN by the same-day fixture below, which paints both arrows: without ' +
    'it, "the arrows are gone everywhere" would report as a pass here. ' +
    'Got: ' + JSON.stringify(visibles(imp)));
  const sameDay = paintSpread({ spreads: sameDayLit });
  assert.deepStrictEqual(visibles(sameDay), ['arrange this day', '‹', '›']
    .sort(),
    '(91c-b/26.91-17) THE POSITIVE CONTROL THAT MAKES THE EMPTY LIST ABOVE ' +
    'A MEASUREMENT: on a day holding THREE pages, the middle page renders ' +
    'BOTH doors — the flip still works, it is merely scoped to the day. ' +
    'Asserted in the same run and BY VALUE. Got: ' +
    JSON.stringify(visibles(sameDay)));
  assert.strictEqual(nbControlsIn(imp.nodes).filter(function (n) {
    return n.textContent === 'arrange this day';
  }).length, 0,
    '(91c-b) ...and `arrange this day` specifically is not among them. ' +
    'Stated separately from the by-value list so the failure names the ' +
    'control rather than a diff');
  assert.strictEqual(imp.calls.trace, 1,
    '(91c-b) POSITIVE CONTROL: the trace page really was painted — ' +
    'paintTracePage was called exactly once. Without this, every ban above ' +
    'is satisfied by a painter that rendered nothing at all');
  assert.strictEqual(imp.calls.page, 0,
    '(91c-b) ...and paintBlessingPage was NOT called on it. A trace page is ' +
    'not a blessing page: routing it through the blessing painter would ' +
    'drag paintPageDecorations along, which is the second of the two ' +
    'client-side blocks keeping an import-only day un-decoratable');
  assert.strictEqual(imp.place, null,
    '(91c-b) NB_PLACE stays NULL on a trace-page spread — DRIVEN through ' +
    'the real painter, read back out of the painter\'s own closure rather ' +
    'than inferred. 26.9-04 wrote that null deliberately so the tin\'s taps ' +
    'are inert instead of landing a mark on the page she was looking at ' +
    'three flips ago; the trace page inherits it');

  // ---- (2) THE LIT-DAY CONTRAST, IN THE SAME RUN -----------------------
  const both = paintSpread({ spreads: bothKinds });
  assert.deepStrictEqual(visibles(both), ['arrange this day'],
    '(91c-b) THE CONTRAST, and the reason (1) is not vacuous: a spread ' +
    'holding a DECORATABLE blessing page DOES paint the entry row. The ' +
    'condition is on the SPREAD\'s contents, not on the day. ' +
    '26.91-17 MOVED THE EXPECTED VALUE, NOT THE CLAIM: this fixture is ' +
    'three DISTINCT one-page days, so under the day-scoped flip the middle ' +
    'spread has no same-day neighbour and neither arrow renders — the row ' +
    'is now the whole band here. That the row survives at a day boundary ' +
    'while the arrows do not is exactly the discrimination this pair ' +
    'exists for: two different conditions, driven separately. Got: ' +
    JSON.stringify(visibles(both)));
  assert.strictEqual(both.calls.trace, 0,
    '(91c-b/F-3) ...and NO trace page is painted on it. Wave 7 expected 1 ' +
    'here, because a lit day carried the trace as its last page; F-3 mints ' +
    'a lit day none, so a bare-date page never reaches the painter');
  assert.strictEqual(both.calls.page, 1,
    '(91c-b) ...alongside exactly one blessing page');
  assert.deepStrictEqual(both.place, { itemId: 'abc123', x0: 192 },
    '(91c-b/F-1) ...and NB_PLACE points at the BLESSING page, at the RIGHT ' +
    'page origin 192. Wave 7 read 0 here because a non-calendar spread ' +
    'painted its first page on the LEFT; F-1 makes the right page the only ' +
    'page, so `x0` is a single value rather than one of three');

  // ---- (4) 26.91-10 (F-1): THE CALENDAR IS PAINTED ON EVERY SPREAD -----
  //
  // The painter-level half of F-1, in this window, over the executed
  // painter. It is asserted on BOTH fixtures — the import-only spread and
  // the blessing spread — because *the calendar never leaves* is a claim
  // about every spread, and a calendar that painted only where a page
  // happened to exist would satisfy either one alone. G-F1 carries the
  // per-index half over the real model; this carries the per-call half over
  // the real painter, and the two are stated separately on purpose.
  assert.strictEqual(imp.calls.calendar, 1,
    '(91c-b/F-1) THE CALENDAR IS PAINTED ON AN IMPORT-ONLY SPREAD — ' +
    'paintNotebookCalendar called exactly once, unconditionally. Restoring ' +
    'the `di === 0` rule reddens HERE');
  assert.strictEqual(both.calls.calendar, 1,
    '(91c-b/F-1) ...and exactly once on a blessing spread too. EXACTLY ' +
    'ONE, not "at least one": a second call would repaint the grid over ' +
    'itself and is a different bug wearing the same green light');

  // ---- (3) AND THE ARRANGING FACE IS CONDITIONAL TOO -------------------
  const impArranging = paintSpread({ spreads: importOnly, designing: true });
  assert.deepStrictEqual(visibles(impArranging), [],
    '(91c-b) BOTH BRANCHES OF THE TERNARY: `done arranging` does not ' +
    'appear on an import-only spread either. A condition wrapped around ' +
    'only the reading face would leave the exit row painting on a page ' +
    'that can never be entered — a ternary tested on one side is a ' +
    'constant. 26.91-17 moved the expected value from the two arrows to ' +
    'the empty band, for the same reason as (1): a one-page day has no ' +
    'in-day neighbour and renders no door. THE ARRANGING FACE IS STILL ' +
    'DRIVEN SOMEWHERE — the same-day fixture below paints it, so this ' +
    'empty list is not the ternary vanishing everywhere');
  const sameDayArranging = paintSpread({ spreads: sameDayLit,
    designing: true });
  assert.deepStrictEqual(visibles(sameDayArranging),
    ['done arranging', '‹', '›'].sort(),
    '(91c-b/26.91-17) POSITIVE CONTROL FOR THE EMPTY LIST ABOVE: on a ' +
    'three-page day the arranging face DOES paint, alongside both doors. ' +
    'Asserted by value in the same run, so the ternary\'s design branch is ' +
    'measured rather than inferred from its absence. Got: ' +
    JSON.stringify(visibles(sameDayArranging)));
  assert.deepStrictEqual(EXEMPT, ['‹', '›'],
    '(91c-b) the exempt glyph pair is unchanged by this plan — the two ' +
    'doors keep their shipped faces and their shipped band slots; only ' +
    'WHEN they render changed');
})();

// ---- 91d: G-C3 — THE WRITE TOOL, DRIVEN; AND G-C4 PRESERVED --------------
//
// WHY THIS GROUP DRIVES RATHER THAN READS. One wave ago (26.9 M-T9) a
// painted control wired to nothing left EVERY structural assertion in this
// file green. Half a wave ago (26.91-02 N-I) a `write` button that was
// built, classed, labelled, placed and wired — and never appended — did the
// same. Source greps cannot see either. So the shipped functions are lifted
// as real source and CALLED, and the two creation paths are counted through
// a WRAPPED REFERENCE rather than by grepping for the helper's name: a grep
// for `nbPlaceTextRecord` inside a caller proves the identifier appears in
// the caller, not that the call happens.
//
// THE WRITTEN ANTI-VACUITY AUDIT:
//
//   (a) CAN IT PASS BEFORE THE WORK? No. `setNotebookWrite`, `NB_WRITE` and
//       `nbCanvasPointerHandler` did not exist before 26.91-02; extractFn
//       throws by name on their absence.
//   (b) CAN IT PASS ONCE BROKEN? No, and it was DRIVEN: each reciprocal
//       removed in turn reddens ITS OWN direction and not the other; the
//       pen's early return removed reddens the pen-armed ZERO; a doubled
//       push reddens the exactly-one; the raise's disarm removed reddens
//       BOTH the source half and the driven half, separately recorded.
//   (c) DOES A DEGENERATE IMPLEMENTATION SATISFY IT? Four forms, closed:
//         - a flag nothing reads — closed by driving a real pointerdown
//           through the handler the real painter attached to the real canvas;
//         - a ONE-SIDED exclusivity guard — closed by enumerating all four
//           call sequences, since a one-sided guard holds in whichever
//           direction somebody happened to test and leaks in the other;
//         - a handler that creates on EVERY pointerdown (26.9 F-7, which the
//           owner hit as six empty marks from ordinary clicking) — closed by
//           asserting the pen-armed and nothing-armed cases as POSITIVE
//           zeroes beside the armed one;
//         - "one shared tail" satisfied by a helper nobody calls sitting
//           beside a path that still inlines its own — closed by the wrapped
//           reference counting BOTH callers' invocations.
//   (d) EVALUATION ORDER OR SOURCE ORDER? EVALUATION for every behavioural
//       claim. The two source assertions here (the raise's disarm, and the
//       G-C4 ban) are labelled as source assertions and each is paired with
//       a driven half or a region-length pin.

const TAIL_DECLS = ['SVG_NS', 'NB_BOUNDS', 'NB_GUTTER_X',
  'NB_MARK_BOUNDS', 'NB_TEXT_BOX', 'NB_IMG_BOX',
  'NB_STICKER_H', 'NB_DECO_CAP', 'NB_UNDO_CAP', 'NB_PEN_PTS_CAP',
  'NB_PEN_STROKE_CAP'];
const TAIL_FNS = ['clampDecoOrigin', 'decoDay', 'nbSnapshot',
  'applyNbSnapshot', 'pushNbUndo', 'strokeList', 'strokeBox',
  'paintStrokeGroup', 'attachPageDrag', 'paintDecoHandles',
  // 26.91-18: the THIRD roster lifting an armed setter, and the third place
  // the hook has to travel with it. See PEN_FNS for the reason.
  'setNotebookPen', 'setNotebookWrite', 'nbSyncArmedClass'];
// DECO_PAINTER_SRC last: it binds paintPageDecorations to the three helpers
// it attaches at paint time, so there is no way to express forgetting them.
const TAIL_SRC = NB_HELPERS + '\n' + TAIL_DECLS.map(declOf).join('\n') + '\n' +
  TAIL_FNS.map(function (n) { return extractFn(appSrc, n); }).join('\n') +
  '\n' + DECO_PAINTER_SRC;

function tailRig(opts) {
  const o = opts || {};
  const created = [];
  const doc = penDoc(created);
  const nodes = [];
  const scene = {
    ownerDocument: doc,
    appendChild: function (n) { nodes.push(n); },
    querySelector: function () { return null; }
  };
  const DEC = { '08/04/2026': { reset: false, items: [] } };
  const calls = { post: [], repaint: 0, edited: [] };
  const names = ['document', 'DECORATIONS', 'NBDESIGN', 'NB_PEN', 'NB_WRITE',
    'NB_PEN_GROUP', 'NB_TIN_OPEN', 'NB_DAY', 'NB_UNDO', 'NB_REDO', 'NB_SEL',
    'NB_REPAINT', 'postDecorations', 'openHandTextEditor', 'getComputedStyle',
    'updateNbButtons', 'NB_STICKERS', 'NB_SHEET_W', 'NB_DRAG_THRESHOLD',
    'paintStickerCrop', 'recordIncident', 'dismissTray', 'bringDecoToFront',
    '$', 'encodeURIComponent',
    NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
    NB_BOUND_NAMES[3]];
  // eslint-disable-next-line no-new-func
  const api = new Function(names.join(','), TAIL_SRC +
    '\nreturn {' +
    ' paint: function (entry, side) {' +
    '   paintPageDecorations(arguments[2] || __scene, entry, side, {}, [],' +
    '     function () { return true; }); },' +
    ' setNotebookPen: setNotebookPen, setNotebookWrite: setNotebookWrite,' +
    ' pen: function () { return NB_PEN; },' +
    ' write: function () { return NB_WRITE; },' +
    ' tinOpen: function () { return NB_TIN_OPEN; },' +
    ' setPen: function (v) { NB_PEN = v; },' +
    ' setWrite: function (v) { NB_WRITE = v; },' +
    ' setTinOpen: function (v) { NB_TIN_OPEN = v; },' +
    ' undoDepth: function () { return NB_UNDO.length; },' +
    // THE WRAPPED REFERENCE. Both creation paths call `nbPlaceTextRecord`
    // through this ONE binding, so reassigning it counts real invocations.
    // A grep for the identifier inside each caller proves only that the
    // identifier appears there; this proves the call HAPPENS.
    ' wrapTail: function () { var orig = nbPlaceTextRecord; var seen = [];' +
    '   nbPlaceTextRecord = function () {' +
    '     seen.push(Array.prototype.slice.call(arguments));' +
    '     return orig.apply(null, arguments); };' +
    '   return seen; } };')
    .call(null, doc, DEC, o.designing === false ? false : true,
      !!o.pen, !!o.write, null, !!o.tinOpen, '08/04/2026', [], [], null,
      function () { calls.repaint++; },
      function (d) { calls.post.push(d); },
      function (el, rec) { calls.edited.push(rec); },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      function () {}, { 'moon': { x: 120, w: 20 } }, 316, 3,
      function () { return true; }, function () {}, function () {},
      function () {}, function () { return {}; }, global.encodeURIComponent,
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
  return {
    api: api, doc: doc, created: created, nodes: nodes, scene: scene,
    dec: DEC, calls: calls,
    items: function () { return DEC['08/04/2026'].items; },
    // The canvas the REAL painter created, with the listeners the REAL
    // painter attached. Not a factory call — the node that ships.
    canvas: function () {
      const c = created.filter(function (n) {
        return String(n.cls).indexOf('page-deco-canvas') !== -1;
      });
      assert.strictEqual(c.length, 1,
        '(91d) the real painter created EXACTLY ONE page canvas — the node ' +
        'both creation gestures hang off. Zero would make every drive below ' +
        'vacuous by never firing anything');
      return c[0];
    }
  };
}

function tailPaint(opts) {
  const rig = tailRig(opts);
  rig.api.paint({ itemId: 'abc123', dayLabel: '08/04/2026' }, 'left',
    rig.scene);
  return rig;
}

// ---- 91d(1): EXCLUSIVITY — ALL FOUR CALL SEQUENCES ENUMERATED ------------
(function () {
  const r = tailRig();
  r.api.setNotebookWrite(true);
  r.api.setNotebookPen(true);
  assert.deepStrictEqual([r.api.write(), r.api.pen()], [false, true],
    '(91d) DIRECTION 1: arming the PEN while `write` is armed disarms ' +
    '`write`. This is setNotebookPen\'s reciprocal edit, driven through the ' +
    'REAL setter rather than read out of it');

  const r2 = tailRig();
  r2.api.setNotebookPen(true);
  r2.api.setNotebookWrite(true);
  assert.deepStrictEqual([r2.api.pen(), r2.api.write()], [false, true],
    '(91d) DIRECTION 2: arming `write` while the PEN is armed disarms the ' +
    'pen — setNotebookWrite\'s reciprocal. BOTH directions are driven ' +
    'because exclusivity enforced in one setter and hoped for in the other ' +
    'holds in whichever direction somebody happened to test and leaks in ' +
    'the other');

  // ALL FOUR ORDERINGS, ENUMERATED. Two toggles have exactly four two-call
  // sequences and every one of them is checked, so "no ordering leaves both
  // armed" is a demonstration rather than a claim about the two that
  // happened to be convenient.
  const SEQS = [['pen', 'pen'], ['pen', 'write'], ['write', 'pen'],
    ['write', 'write']];
  assert.strictEqual(SEQS.length, 4,
    '(91d) all FOUR two-call sequences over the two toggles are enumerated ' +
    '— pinned by value, so a shortened list is a failure rather than a ' +
    'shorter pass');
  SEQS.forEach(function (seq) {
    const rr = tailRig();
    seq.forEach(function (which) {
      if (which === 'pen') { rr.api.setNotebookPen(true); }
      else { rr.api.setNotebookWrite(true); }
    });
    assert.strictEqual(rr.api.pen() && rr.api.write(), false,
      '(91d) NO ORDERING LEAVES BOTH TOOLS ARMED. Sequence ' +
      JSON.stringify(seq) + ' ended pen=' + rr.api.pen() + ' write=' +
      rr.api.write() + '. Two armed tools would contend for one pointerdown ' +
      'and mint records she did not ask for (T-26.91-07)');
    assert.strictEqual(rr.api.pen() || rr.api.write(), true,
      '(91d) POSITIVE CONTROL for sequence ' + JSON.stringify(seq) + ': one ' +
      'of the two IS armed afterwards. Without this half, a pair of setters ' +
      'that armed NOTHING would satisfy the exclusivity assertion perfectly');
  });
})();

// ---- 91d(2..4): THE ARMED GESTURE, THROUGH THE REAL CANVAS ---------------
//
// ONE POINTERDOWN, THREE ARM STATES, THE SAME COORDINATES — so the arm state
// is provably the thing under test rather than the geometry.
(function () {
  function tap(arm) {
    const rig = tailPaint({ write: arm === 'write', pen: arm === 'pen',
      tinOpen: true });
    const c = rig.canvas();
    assert.ok(c.handlers.pointerdown && c.handlers.pointerdown.length === 1,
      '(91d) the real painter attached EXACTLY ONE pointerdown listener to ' +
      'the page canvas — the gesture under test');
    c.handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
    return rig;
  }

  const w = tap('write');
  assert.strictEqual(w.items().length, 1,
    '(91d) WRITE ARMED: one pointerdown in the page interior creates ' +
    'EXACTLY ONE record — not zero (the tool painted and dead, which every ' +
    'source assertion in this file would still pass: 26.9 M-T9) and not two ' +
    '(a doubled handler)');
  const rec = w.items()[0];
  assert.strictEqual(rec.kind, 'text',
    '(91d) and it is a `text` record');
  assert.strictEqual(rec.text, '',
    '(91d) created EMPTY, deliberately: consideration empty/E4 — a ' +
    'placed-but-untyped element persists as a REAL element, selectable, ' +
    'movable and undoable, never a ghost that vanishes if she does not type');
  const BND = NB_SRC_CONSTS.NB_BOUNDS;
  assert.ok(Number.isInteger(rec.x) && Number.isInteger(rec.y),
    '(91d) with INTEGER coordinates — this is a pixel-art surface and a ' +
    'fractional origin would place a mark on a half pixel. Got x=' + rec.x +
    ' y=' + rec.y);
  assert.ok(rec.x >= BND.x0 && rec.x <= BND.x1 &&
    rec.y >= BND.y0 && rec.y <= BND.y1,
    '(91d) AND INSIDE NB_BOUNDS, read from the REAL declaration (' +
    JSON.stringify(BND) + '), never re-typed here. Got x=' + rec.x + ' y=' +
    rec.y + '. A record outside the bound is a mark she can never reach');
  assert.strictEqual(w.api.undoDepth(), 1,
    '(91d) and undo was pushed BEFORE the mutation, so the placement is ' +
    'reversible by the band control four slots to its left');

  const p = tap('pen');
  assert.strictEqual(p.items().length, 0,
    '(91d) PEN ARMED: the same pointerdown at the same point creates ZERO ' +
    'records. This is the F-7 regression direction and T-26.91-07 both');

  // ---- AND THE TWO ASSERTIONS THAT MAKE THAT ZERO MEAN SOMETHING -------
  //
  // THE ZERO ABOVE IS VACUOUS ON ITS OWN, AND THIS WAS MEASURED RATHER THAN
  // REASONED ABOUT. Mutation M-Q3 deleted `if (NB_PEN) { return; }` from the
  // handler outright and the whole suite still exited 0: with the pen armed,
  // `write` is NOT armed, so the handler falls through to `if (!NB_WRITE)
  // { return; }` and creates nothing ANYWAY. The assertion passed for a
  // reason that had nothing to do with the guard it claimed to be measuring
  // — this phase's named defect class landing inside the instrument built
  // to catch it, found only by driving. The two assertions below are what
  // actually pin the pen's early return, and each fails when it is removed.
  //
  // (i) THE ORDERING. The guard's contract is that the pen owns the tap and
  // returns BEFORE the creation tail. That is observable only from a state
  // where the tail would otherwise run, so both flags are forced TRUE
  // directly — deliberately bypassing the setters, whose exclusivity makes
  // this state unreachable through the UI. That is the point: it is a
  // DEFENSIVE ordering guarantee, and a guarantee that only holds while
  // another guarantee holds is not one.
  const both = tailRig({ pen: true, write: true, tinOpen: true });
  both.api.paint({ itemId: 'abc123', dayLabel: '08/04/2026' }, 'left',
    both.scene);
  both.canvas().handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
  assert.strictEqual(both.items().length, 0,
    '(91d) THE PEN OWNS THE TAP, ORDERING ASSERTED: with the pen armed AND ' +
    '`write` armed — forced directly, since the setters make this state ' +
    'unreachable — one pointerdown creates ZERO records. The pen\'s early ' +
    'return fires BEFORE the creation tail. Without forcing both flags, the ' +
    'pen-armed zero above is satisfied by `write` merely being disarmed and ' +
    'measures nothing about the guard (mutation M-Q3 proved exactly that)');

  // (ii) THE TRAY. The shipped comment states the second half of the same
  // guard outright: it returns before the tray close as well, so a stroke
  // that BEGINS over an open tray must not also dismiss it mid-gesture.
  assert.strictEqual(p.api.tinOpen(), true,
    '(91d) AND A PEN GESTURE LEAVES AN OPEN TRAY OPEN. The early return ' +
    'precedes the tray close deliberately: a stroke beginning over the tray ' +
    'must not dismiss the very surface it started on. This is the direction ' +
    'that distinguishes "the pen returned early" from "nothing happened", ' +
    'and it is the exact inverse of the nothing-armed case below, where the ' +
    'tray MUST close');

  const n = tap('none');
  assert.strictEqual(n.items().length, 0,
    '(91d) NOTHING ARMED: a plain tap creates NOTHING. 26.9 F-7 verbatim — ' +
    'the owner hit six empty marks on one page from ordinary clicking');
  assert.strictEqual(n.api.tinOpen(), false,
    '(91d) AND THE SHIPPED BEHAVIOUR SURVIVES: the plain tap still closes ' +
    'an open tray. BOTH HALVES ARE ASSERTED because a mutation that removed ' +
    'the whole handler would satisfy the zero half on its own — the tray ' +
    'half is what tells "nothing armed" apart from "nothing attached"');
})();

// ---- 91d(5): A RAISE DISARMS BOTH — SOURCE *AND* DRIVEN ------------------
(function () {
  const raise = bodyOf('renderNotebookStation');
  assert.ok(raise.indexOf('NB_PEN = false;') !== -1,
    '(91d) SOURCE: a station raise lowers the pen');
  assert.ok(raise.indexOf('NB_WRITE = false;') !== -1,
    '(91d) SOURCE: and disarms `write` beside it — a raise always lands ' +
    'with NO tool armed');

  // AND DRIVEN, because the source half is satisfied by an assignment that
  // is never reached. The REAL prologue is sliced out of the REAL function
  // (never re-typed) and executed with both flags pre-set TRUE, which is the
  // only pre-state under which the assignments can be observed to do work.
  const whole = extractFn(appSrc, 'renderNotebookStation');
  const cut = whole.indexOf("document.body.classList.remove('nb-design')");
  assert.ok(cut > 0,
    '(91d) the raise prologue is located by the shipped nb-design removal ' +
    'line, so the slice below is REAL SOURCE rather than a re-typed copy');
  const prologue = whole.slice(whole.indexOf('{') + 1, cut);
  assert.ok(prologue.length > 0,
    '(91d) and the sliced prologue is NON-EMPTY. A slice that silently ' +
    'collapsed to nothing would run cleanly and assert nothing — the ' +
    'degenerate pass this line exists to close');
  // eslint-disable-next-line no-new-func
  const after = new Function('$', 'document',
    'var NBDESIGN = true, NB_SEL = {}, NB_PEN = true, NB_WRITE = true,' +
    ' NB_PEN_GROUP = {};\n' + prologue +
    '\nreturn { design: NBDESIGN, sel: NB_SEL, pen: NB_PEN,' +
    ' write: NB_WRITE, group: NB_PEN_GROUP };')(
    function () { return { firstChild: null, removeChild: function () {} }; },
    { body: { classList: { remove: function () {} } } });
  assert.deepStrictEqual([after.pen, after.write], [false, false],
    '(91d) DRIVEN: executing the real raise prologue from a pre-state where ' +
    'BOTH tools are armed leaves BOTH disarmed. The source half above is ' +
    'satisfied by an assignment that is never reached; this half is not. ' +
    'Recorded separately from it on purpose, so a mutation reddens the two ' +
    'independently and neither can shadow the other');
  assert.deepStrictEqual([after.design, after.sel, after.group],
    [false, null, null],
    '(91d) POSITIVE CONTROL: the same prologue also lands in READING mode ' +
    'with nothing selected and no stroke group — so the pair above is a ' +
    'measurement of a prologue that really ran, not of a slice that threw ' +
    'early and left the initialisers standing');
})();

// ---- 91d(6): ONE CREATION TAIL, BOTH CALLERS — COUNTED, NOT GREPED ------
(function () {
  const rig = tailPaint({ write: true });
  const c = rig.canvas();
  // ---- DISPOSITION 2026-08-11 (26.91-37, F-25 / D-12): INVERTED --------
  // Kept, inverted, dated — never deleted. It pinned exactly ONE dblclick
  // listener as "deliberately kept … it costs nothing". G-30 MEASURED the
  // cost: one mark she did not ask for, minted with no arming act at all.
  assert.strictEqual((c.handlers.dblclick || []).length, 0,
    '(91d) INVERTED 2026-08-11 (26.91-37): the REAL painter attaches ZERO ' +
    'dblclick listeners to the REAL canvas. Driven, not grepped — a source ' +
    'count of zero is satisfied by a registration that moved somewhere a ' +
    'grep does not look');

  // WRAP THE SHARED TAIL, THEN DRIVE BOTH PATHS THROUGH IT.
  const seen = rig.api.wrapTail();
  assert.strictEqual(seen.length, 0,
    '(91d) the wrapped tail starts at zero invocations — the baseline the ' +
    'two counts below are measured against');
  c.handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
  assert.strictEqual(seen.length, 1,
    '(91d) THE ARMED POINTERDOWN CALLS THE SHARED TAIL — counted through a ' +
    'wrapped reference, not grepped. A grep for `nbPlaceTextRecord` inside ' +
    'the handler proves the identifier appears there; it cannot prove the ' +
    'call happens');
  // ---- DISPOSITION 2026-08-11 (26.91-37, F-25 / D-12): INVERTED --------
  // These three rows drove the SECOND door and counted its record. The door
  // is retired on her ruling, so they are inverted and dated rather than
  // deleted: the tail must now be reached from ONE gesture and one only,
  // and it must still be reached — "closed the path" is satisfied by
  // breaking creation entirely, which the count below refuses.
  assert.strictEqual(seen.length, 1,
    '(91d) INVERTED 2026-08-11: the shared tail is reached EXACTLY ONCE, ' +
    'from the ONE surviving gesture. It used to be reached twice, from two ' +
    'doors; the second door minted without any arming act (G-30) and her ' +
    'ruling closed it');
  assert.strictEqual(rig.items().length, 1,
    '(91d) INVERTED 2026-08-11: ONE gesture, ONE mark. The invocation ' +
    'count alone would be satisfied by a tail called once that wrote ' +
    'nothing, so the record count is asserted beside it');
  assert.deepStrictEqual(rig.items().map(function (r) { return r.kind; }),
    ['text'],
    '(91d) INVERTED 2026-08-11: and it is still a TEXT record — retiring a ' +
    'caller must not change what the surviving one creates');
  // AND THE CAP IS ON THE SHARED TAIL, so both doors inherit the refusal
  // rather than one of them getting three of the four behaviours.
  const tailBody = bodyOf('nbPlaceTextRecord');
  ['NB_DECO_CAP', 'pushNbUndo', 'postDecorations', 'openHandTextEditor']
    .forEach(function (t) {
      assert.ok(tailBody.indexOf(t) !== -1,
        '(91d) the ONE tail carries `' + t + '`, so BOTH callers get the ' +
        'cap refusal, the undo push, the write and the editor');
    });
  assert.strictEqual((appCode.match(/NB_TEXT_CAP = 80/g) || []).length, 1,
    '(91d) consideration long-text/E4: NB_TEXT_CAP is UNCHANGED at 80. The ' +
    'rendered-box half of that overflow is owned by 26.9\'s CJK / ' +
    'no-space-Latin backstop and is deliberately NOT re-litigated here — ' +
    'and G-C5\'s Range form must not be copied onto it without first ' +
    'checking whether its container is a centred flex box');
})();

// ---- 91d(7): G-C4 PRESERVED, WITH ITS SCAN WINDOW ASSERTED --------------
//
// THIS PIN EXISTS ONLY TO CLOSE A DEGENERATE PASS. A region-scoped ban is
// satisfied trivially by a region that shrank to nothing: `''.indexOf(x)`
// is -1 for every x, so an extractFn that silently returned an empty string
// would make the ban below green over a painter it never read. That is the
// 26.9-05 lesson verbatim — a region-scoped test whose scan window missed
// the rule — and it is why each region's byte length is pinned with its
// painter NAMED. SIMPLIFYING THIS RETURNS THE INSTRUMENT TO MEASURING
// NOTHING. Do not replace the length pins with the ban alone.
(function () {
  const PAINTERS = ['renderNotebookBand', 'renderTinTray',
    'paintNotebookSpread'];
  assert.strictEqual(PAINTERS.length, 3,
    '(91d) G-C4 scans exactly THREE painters, pinned BY VALUE. The UI-SPEC ' +
    'names these three and says to scope the ban to them and SAY SO');
  PAINTERS.forEach(function (name) {
    // extracted by name, never by line range: line ranges rot silently and
    // a rotted range is an empty scan window wearing a plausible number.
    const region = bodyOf(name);
    assert.ok(region.length > 0,
      '(91d) SCAN WINDOW NON-EMPTY for ' + name + ' — ' + region.length +
      ' bytes. This pin exists ONLY to close a degenerate pass: an empty ' +
      'region satisfies every indexOf ban below trivially');
    assert.strictEqual(region.indexOf('#catalog-panel'), -1,
      '(91d) G-C4: ' + name + ' must never reference #catalog-panel. The ' +
      'catalog is the ROOM\'s design-mode dock; a part-C proposal that ' +
      'solved the notebook\'s discoverability by reaching for it would ' +
      'drop the whole right dock into the notebook scene (constraint 4)');
    assert.strictEqual(region.indexOf('design-mode'), -1,
      '(91d) G-C4: and ' + name + ' must never touch the body design-mode ' +
      'class — that class slides #catalog-panel open (tokens.css:1007). ' +
      'The notebook has its own nb-design class precisely so the two modes ' +
      'cannot reach each other');
  });
  // ---- THE POSITIVE CONTROLS, EACH SCOPED TO WHERE ITS STRING LIVES ----
  //
  // A ban is only evidence if the banned string is real somewhere. Getting
  // that control wrong is how 26.91-02's M-L survived its first mutation
  // round: a whole-file regex matched a DIFFERENT subsystem and passed while
  // the thing it guarded was gone. So the two banned strings get two
  // DIFFERENT controls, because they genuinely live in two different places,
  // and writing one control for both would make the weaker of the two
  // vacuous.
  //
  // EVERY CONTROL BELOW RUNS OVER COMMENT-STRIPPED SOURCE. That is not
  // tidiness — it is the finding that produced this block. The first draft
  // asserted `#catalog-panel` was real by looking at app.js, and it went
  // RED: the id occurs in app.js TWICE AND BOTH ARE COMMENTS
  // (`app.js:12173`, `app.js:12411`, each explaining the very rule being
  // banned). A control satisfied by prose is not a control — it is this
  // project's own defect class, the same shape as 26.9's source grep that
  // was satisfied by the fix's own comment. Pinned by value in BOTH
  // directions below so the distinction is machine-held rather than
  // remembered.
  const APP_COMMENTS_ONLY = appSrc.split('#catalog-panel').length - 1;
  assert.strictEqual(appCode.indexOf('#catalog-panel'), -1,
    '(91d) RECORDED AS A FINDING, NOT WORKED AROUND: `#catalog-panel` ' +
    'appears ZERO times in app.js CODE. The app.js half of the G-C4 ban is ' +
    'therefore a FORWARD ban — it guards against a selector no code has ' +
    'ever written, which is exactly what it is for, and it means app.js ' +
    'cannot supply its own positive control. Pinned so that the day some ' +
    'code legitimately names the catalog, this line fails and whoever adds ' +
    'it must re-scope the control below rather than inherit a stale one');
  assert.strictEqual(APP_COMMENTS_ONLY, 2,
    '(91d) and it appears exactly TWICE in app.js RAW source — both of them ' +
    'COMMENTS explaining this very rule. Pinned by value so the comment/code ' +
    'split cannot drift silently. THIS IS WHY EVERY BAN AND EVERY CONTROL ' +
    'IN THIS GROUP RUNS OVER STRIPPED SOURCE: over raw source the three ' +
    'bans above would have read a rule\'s own explanation as a violation');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(indexHtml.indexOf('catalog-panel') !== -1,
    '(91d) POSITIVE CONTROL for the catalog ban, scoped to index.html — ' +
    'where the element ACTUALLY LIVES. The three -1 results above are a ban ' +
    'over a real, shipped element rather than over a string nothing in the ' +
    'served tree has ever mentioned. Deliberately NOT taken from app.js: ' +
    'app.js only mentions it in prose, and prose must never be able to ' +
    'answer a question about code');
  assert.ok(stripComments(indexHtml.replace(/<!--[\s\S]*?-->/g, ''))
    .indexOf('catalog-panel') !== -1,
    '(91d) and it is real in index.html\'s MARKUP, not in an HTML comment ' +
    'there either — the same trap one file over');
  assert.ok(appCode.indexOf('design-mode') !== -1,
    '(91d) POSITIVE CONTROL for the design-mode ban, scoped to app.js CODE ' +
    '(comment-stripped): the room\'s own design mode really does use that ' +
    'class, so the three -1 results above are a ban over a live string. ' +
    'This control CAN live in app.js and the catalog one cannot, and that ' +
    'asymmetry is the whole reason they are written as two controls');
  assert.ok(bodyOf('setNotebookDesign').indexOf('nb-design') !== -1,
    '(91d) POSITIVE CONTROL: the notebook\'s OWN mode class is still set by ' +
    'setNotebookDesign — scoped to that ONE function, not whole-file. ' +
    'Without this, the three bans above are satisfied by a build in which ' +
    'the notebook has no mode class at all and therefore nothing to ban');
})();

// ===========================================================================
// ---- G-F1 / G-F3. 26.91-10 — THE CALENDAR NEVER LEAVES, THE ALMOST-EMPTY --
// ----             PAGE, AND THE FENCE PROVEN ARMED -------------------------
// ===========================================================================
//
// THE WRITTEN ANTI-VACUITY AUDIT, four questions, answered before the code.
//
//   (a) CAN IT PASS BEFORE THE WORK? No. Before 26.91-10 the grid painted
//       under `if (di === 0)` only, so the day-cell count below is zero at
//       every index above 0 and the loop fails at index 1. Mutation (1)
//       restores that rule and is recorded RED.
//   (b) CAN IT PASS ONCE THE WORK IS BROKEN? No, and six mutations are run
//       to say so rather than to assert it: restoring `di === 0`, painting
//       the page on the left, chunking two entries per spread, minting the
//       trace page on lit days, deleting the day-label node, and restoring
//       the composed-sentence node each redden a NAMED assertion.
//   (c) WHAT DEGENERATE INPUT SATISFIES IT? An EMPTY MODEL. Every per-index
//       assertion in the loop is satisfied by a loop that never runs, which
//       is the same hole `p === n` leaves in the sweep. It is closed the
//       same way: the spread count is pinned BY VALUE at 5, the number of
//       indices actually visited is asserted equal to it, and two positive
//       controls name a real blessing page and the import-only page. A
//       painter that drew the grid and nothing else is closed separately,
//       by asserting the RIGHT PAGE'S CONTENT DIFFERS between two indices.
//   (d) SOURCE READ OR EXECUTION? EXECUTION. Every node below is read off a
//       scene the REAL painters appended to — paintNotebookSpread,
//       paintNotebookCalendar, paintBlessingPage and paintTracePage are all
//       lifted as real source, not stubbed.
//
// ⚠ WHAT THIS GATE CANNOT SEE, STATED HERE RATHER THAN LEFT TO BE
// DISCOVERED. F-1 is TWO claims and this gate covers only the first.
//
//   (1) PAINTED AT EVERY INDEX — structural. G-F1 owns it. Its driver is
//       `extractFn` + `new Function` + a synthetic document, which CAN
//       count appended day-cell nodes, CAN compare page origins by value,
//       and propagates a throw — so *the painter did not run*, *the painter
//       threw* and *the painter drew an empty container* all redden it.
//
//   (2) VISIBLE ONCE PAINTED — a layout property. THIS DRIVER CANNOT SEE IT
//       AT ALL. There is no layout engine here: a grid painted at zero
//       size, clipped, occluded by the right page or hidden by CSS
//       satisfies every assertion below while being invisible on the glass.
//       That is the standing lesson — *working and findable are different
//       claims* — and it is why half 2 is NAMED here rather than implied.
//       It is closed by `G-F1-live` (plan 11 task 3) through the real CDP
//       runner, measuring the shipped markup's boxes in the shipped
//       stylesheet at every pinned `--k`, and for anything painted outside
//       the notebook scene by the owner's eye at plan 14 beats R1/R2. No
//       coordinate in `STATION_NOTEBOOK_GEOM.grid` moves in this plan, so
//       that later measurement measures THIS result.
//
// Do not restate G-F1's reach without this bound.

// The whole render path, lifted as REAL SOURCE and executed. The band, the
// tin, the pen and the design toggle are stubbed and their calls counted —
// they are driven in their own windows (91c, 9n) and stubbing them is what
// keeps these windows disjoint AND connected.
function f1Rig(section) {
  const zo = section || ZO.zero_overlap;
  const h = hydrate(zo);
  const entries = packBlessingsToc(h.ledger, h.items, [], guard);
  const nodes = [];
  const calls = { calendar: 0, page: 0, trace: 0, band: 0, tin: 0, pen: 0 };
  const NB = { view: 0, month: '' };
  // 26.91-38 (D-13): THE PAINT ORDER, RECORDED BY EXECUTION.
  //
  // Purely additive — every entry is an array push inside a counter that
  // already ran, so no existing assertion in this file can see it. It exists
  // because plan 38's fallback is guarded on `the scene carries ZERO region
  // nodes`, and a zero-count guard is only meaningful where the count is
  // FINAL. Reading paintNotebookSpread and concluding "pages first" is
  // exactly the kind of source reading this phase has been wrong about
  // before, so the order is DRIVEN and pinned as its own named assertion.
  const order = [];
  const state = { items: h.items, calls: calls, NB: NB, order: order,
    sceneNodes: null, tracePainted: null, pagePainted: null };
  const src = [
    NB_HELPERS,
    // Every module-scope constant the render path reads, lifted BY NAME
    // from app.js through declOf rather than retyped. A harness that
    // retypes the table it is checking is a harness agreeing with itself.
    ['NB_BOUNDS', 'NB_TEXT_BOX', 'NB_IMG_BOX', 'NB_STICKER_H',
      'NB_STICKERS', 'NB_DECO_CAP', 'NB_DRAG_THRESHOLD', 'NB_SHEET_W',
      'NB_TIN', 'NB_TRAY', 'NB_ENTRY_ROW', 'NB_BAND', 'NB_TEXT_CAP',
      'SVG_NS', 'NB_PEN_PTS_CAP',
      'NB_PEN_STROKE_CAP'].map(declOf).join('\n'),
    declOf('NB_TRACE_GEOM'),
    NB_MARK_DECLS,
    // ⚠ THE COMPOSER AND ITS THREE POLICY TABLES ARE LIFTED INTO THE RIG
    // EVEN THOUGH THE SHIPPED PAINTER NO LONGER CALLS THEM, AND THE REASON
    // IS A MEASURED FINDING RATHER THAN A PRECAUTION.
    //
    // Mutation (6) — restore the composed-sentence node to paintTracePage —
    // is the mutation G-F3/b exists to be reddened by. Driven WITHOUT this
    // lift, it did not redden G-F3/b at all: the restored call hit a free
    // variable and the rig threw `composeArrivalTrace is not defined` from
    // inside paintTracePage, during G-F1's loop. That is a red, but it is
    // the WRONG red — it reads as a broken harness, and G-F3/b's scan never
    // ran. A gate whose targeted mutation kills the harness before reaching
    // it has not been shown to work.
    //
    // With the composer in scope the mutation paints a REAL sentence and
    // G-F3/b reddens on its own assertion. Recorded here so a later reader
    // does not "tidy away" a lift that looks unused.
    TRACE_CONST_NAMES.map(declOf).join('\n'),
    extractFn(appSrc, 'composeArrivalTrace'),
    extractFn(appSrc, 'placeNotebookInert'),
    extractFn(appSrc, 'mulberry32'),
    extractFn(appSrc, 'blessingSeed'),
    extractFn(appSrc, 'pickBlessingDecoration'),
    extractFn(appSrc, 'blessingDayLabel'),
    extractFn(appSrc, 'blessingMonthKey'),
    extractFn(appSrc, 'packArrivalDays'),
    extractFn(appSrc, 'blessingsDayRoster'),
    extractFn(appSrc, 'blessingsMonthGrid'),
    extractFn(appSrc, 'buildBlessingSpreads'),
    extractFn(appSrc, 'clampDecoOrigin'),
    extractFn(appSrc, 'decoDay'),
    PEN_DOWN + extractFn(appSrc, 'attachPageDrag'),
    extractFn(appSrc, 'livePagePhoto'),
    extractFn(appSrc, 'ensurePagePhoto'),
    extractFn(appSrc, 'paintDecoHandles'),
    DECO_PAINTER_SRC,
    extractFn(appSrc, 'paintBlessingPage'),
    extractFn(appSrc, 'paintTracePage'),
    extractFn(appSrc, 'paintNotebookCalendar'),
    extractFn(appSrc, 'paintNotebookSpread')
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function('S', 'GEOM', 'mkdoc', 'guardSurface', `
    var STATION_NOTEBOOK = S.NB;
    var ROOM = { items: S.items };
    var SHELF = { filters: [] };
    var StudyCore = { guardSurface: guardSurface };
    var DESIGN = false, NBDESIGN = false;
    var NB_DAY = '', NB_PLACE = null, NB_REPAINT = null;
    var NB_UNDO = [], NB_REDO = [], NB_RESET_ARMED = false;
    var NB_UNDO_CAP = 60;
    var NB_SEL = null, NB_TIN_OPEN = false, NB_PEN = false;
    var DECORATIONS = {};
    var NOTEBOOK_CAPTION_LINE_PX = 7 * 1.3;
    var NB_A_MOD = 360, NB_S_MIN = 0.5, NB_S_MAX = 2.0, NB_S_DEFAULT = 1;
    var __scene = null;
    function postDecorations() {}
    function dismissTray() {}
    function openHandTextEditor() {}
    function openContainerItem() {}
    function recordIncident() {}
    function pushNbUndo() {}
    function bringDecoToFront() {}
    function paintStickerCrop() { return true; }
    function escapeAttr(s) { return s; }
    function $() { return __scene; }
    function getComputedStyle() {
      return { getPropertyValue: function () { return '1'; } };
    }
    function attachPenCapture() { S.calls.pen++; }
    function renderNotebookBand() { S.calls.band++; S.order.push('band'); }
    function renderTinTray() { S.calls.tin++; S.order.push('tin'); }
    function setNotebookDesign() {}
    ${src}
    // THE COUNTERS ARE WRAPPERS AROUND THE REAL PAINTERS, NEVER STUBS IN
    // THEIR PLACE. Each records the call and then calls through, so
    // "paintTracePage ran" and "what paintTracePage drew" are the same
    // event. A counting stub would have made every positive control below
    // a statement about the harness.
    var __realCal = paintNotebookCalendar;
    var __realPage = paintBlessingPage;
    var __realTrace = paintTracePage;
    paintNotebookCalendar = function () {
      S.calls.calendar++; S.order.push('calendar');
      return __realCal.apply(null, arguments);
    };
    // Both PAGE painters record the nodes THEY appended, by snapshotting
    // the scene's node list across the call. S.pagePainted is therefore the
    // right page's own content and nothing else — see the note on
    // paintTracePage's wrapper for why geometry filtering is not enough.
    paintBlessingPage = function () {
      S.calls.page++;
      S.order.push('page');
      var n0 = S.sceneNodes ? S.sceneNodes.length : 0;
      var r = __realPage.apply(null, arguments);
      S.pagePainted = S.sceneNodes ? S.sceneNodes.slice(n0) : [];
      return r;
    };
    // paintTracePage's wrapper ALSO records exactly which nodes IT
    // appended, by snapshotting the scene's node list across the call.
    // Filtering the finished scene by geometry instead would sweep in the
    // band's own \u203a arrow, which sits at a page-side x and is not a page
    // node at all — measured, and it is why the capture is taken here.
    paintTracePage = function () {
      S.calls.trace++;
      S.order.push('page');
      var n0 = S.sceneNodes ? S.sceneNodes.length : 0;
      var r = __realTrace.apply(null, arguments);
      S.tracePainted = S.sceneNodes ? S.sceneNodes.slice(n0) : [];
      S.pagePainted = S.tracePainted;
      return r;
    };
    return {
      // THE DRIVEN-DIRECTLY MODEL: the two-argument roster and the
      // three-argument builder, called WITH arrivals. 26.91-17 takes this
      // shape off the RENDER path (owner ruling of 2026-08-09, A-14) and
      // RETAINS it whole for Phase 26.95, so this entry is what keeps the
      // retained half provably alive: everything reached through here is
      // exercising working code with a named future consumer, never the
      // shipped paint. Its counterpart is \`shippedSpreads\` below, and the
      // two together are what distinguish DORMANT from BROKEN.
      spreads: function (entries) {
        var a = packArrivalDays(ROOM.items, SHELF.filters,
          StudyCore.guardSurface);
        return buildBlessingSpreads(entries, blessingsDayRoster(entries, a),
          a);
      },
      // THE SHIPPED MODEL: exactly what paintNotebookSpread now derives —
      // the roster and the builder called with the blessing entries ALONE,
      // so the notebook's day-set equals the calendar's lit-day set again
      // (A-14, 2026-08-09). Written as its own entry rather than inferred
      // from the paint, so a gate can name the shipped day-set BY VALUE.
      shippedSpreads: function (entries) {
        return buildBlessingSpreads(entries, blessingsDayRoster(entries));
      },
      // THE RETAINED TRACE PAINTER, DRIVEN DIRECTLY onto a fresh scene.
      // 26.91-17: paintTracePage is no longer reachable from the shipped
      // render path, so every claim F-3 made about that page — the
      // almost-empty page, and the composed sentence reaching no node —
      // would otherwise pass VACUOUSLY the instant its subject left. This
      // driver is the rewrite of those absence pins, added BEFORE the
      // removal lands so neither pin ever spends a commit measuring
      // nothing. It returns the nodes THAT PAINTER appended and nothing
      // else.
      paintTraceDirect: function (page, side) {
        var built = mkdoc();
        __scene = built.scene;
        S.sceneNodes = built.nodes;
        S.tracePainted = null;
        S.pagePainted = null;
        document = built.doc;
        paintTracePage(built.scene, page, side || 'right');
        return { nodes: built.nodes, painted: S.tracePainted || [] };
      },
      grid: blessingsMonthGrid,
      dayLabel: blessingDayLabel,
      paint: function (entries, roster) {
        var built = mkdoc();
        __scene = built.scene;
        S.sceneNodes = built.nodes;
        S.tracePainted = null;
        S.pagePainted = null;
        S.order.length = 0;
        document = built.doc;
        paintNotebookSpread(built.scene, entries, roster);
        return built.nodes;
      }
    };`)(state,
    NB_SRC_CONSTS.STATION_NOTEBOOK_GEOM,
    function () {
      const out = [];
      const doc = nbNodeDoc();
      const scene = {
        children: [],
        appendChild: function (n) { out.push(n); scene.children.push(n); },
        // 26.91-13 (D-1): removeChild REALLY REMOVES, where it used to be a
        // no-op. `paintNotebookSpread` clears the scene before every repaint;
        // with a no-op the second paint's nodes were reported on top of the
        // first paint's, and G-D1's executed tap reads the scene AFTER a
        // repaint. The first paint of any mkdoc scene starts empty, so no
        // existing group's node list changes.
        removeChild: function (n) {
          const i = scene.children.indexOf(n);
          if (i !== -1) { scene.children.splice(i, 1); }
          const j = out.indexOf(n);
          if (j !== -1) { out.splice(j, 1); }
        },
        querySelector: function () { return null; },
        addEventListener: function () {},
        removeEventListener: function () {},
        getBoundingClientRect: function () { return { left: 0, top: 0 }; }
      };
      return { doc: doc, scene: scene, nodes: out };
    }, guard);
  return { api: api, entries: entries, calls: calls, NB: NB, order: order,
    items: h.items, state: state };
}

// Every node the painters appended, flattened — a page's own nodes nest.
function f1Flat(list) {
  const out = [];
  (function walk(ns) {
    ns.forEach(function (n) {
      out.push(n);
      if (n.kids && n.kids.length) { walk(n.kids); }
    });
  })(list);
  return out;
}

// A DAY CELL is a node whose whole text is a bare day number. The grid is
// the only painter in the scene that writes one: the month label is a long
// date string, the two month arrows and the two page arrows are `‹`/`›`, a
// blessing page's date is `MM/DD/YYYY` and its title is prose. Counted by
// what was PAINTED rather than by a class the test was told to look for.
function f1DayCells(nodes) {
  return f1Flat(nodes).filter(function (n) {
    return /^\d{1,2}$/.test(String(n.text || ''));
  });
}

// ===========================================================================
// ---- G-D1 — THE LIT CELL NAVIGATES BY THE REAL SPREAD LIST (D-1) ----------
// ===========================================================================
//
// THE ASSERTION D-1 SAYS THIS SUITE NEVER HAD. Four sites used to pin the
// calendar's navigation target, and every one of them compared it against a
// test-local copy of the formula that produced it. Not one ever asked where a
// tap actually goes. This group asks, BY EXECUTION.
//
// THE WRITTEN ANTI-VACUITY AUDIT:
//
//   (a) CAN IT PASS BEFORE THE WORK? The navigation itself predates D-1 —
//       the day-label scan is the shipped handler and was already correct.
//       What could not exist before is the COMPARISON: the removed field and
//       the executed tap disagree, so an assertion pinning the field and an
//       assertion pinning the tap could not both be green. This group is the
//       half that survives, and (1) below is the record of the disagreement.
//   (b) CAN IT PASS ONCE THE WORK IS BROKEN? No — mutation 3 of this plan
//       pins the handler to spread 0 and reddens (3) by name.
//   (c) WHAT DEGENERATE INPUT SATISFIES IT? A grid with no lit cell paints no
//       button, so a `forEach` over lit cells never runs. Closed by pinning
//       the lit-day set BY VALUE first, and by asserting the number of taps
//       actually driven equals it.
//   (d) SOURCE READ OR EXECUTION? EXECUTION, end to end. The button is the
//       node the REAL `paintNotebookCalendar` appended; the tap is that
//       node's own registered click listener, invoked; the landing place is
//       read off `STATION_NOTEBOOK.view` after the handler ran.

(function gD1LitCellNavigatesByRealSpreads() {
  const R = f1Rig();
  const roster = blessingsMonthRoster(R.entries);
  // 26.91-17 (F-15) — THE ORACLE MOVES TO THE SHIPPED LIST, BECAUSE THAT IS
  // WHAT THE HANDLER SCANS. This group drives the calendar's REAL click
  // handler, which scans the spread list `paintNotebookSpread` built. Her
  // ruling of 2026-08-09 (A-14) makes that list the LIT-DAY set: the
  // arrivals no longer reach the roster or the builder on the shipped call.
  // Reading the oracle from the three-argument (driven-directly) list would
  // have compared the executed tap against a list the app no longer builds —
  // an oracle measuring a different program from the one under test, which
  // is a subtler form of the parallel-derivation defect D-1 removed. The
  // three-argument list is still exercised, deliberately and by name, in
  // (G-F1) and (G-F3): it is RETAINED for Phase 26.95, not deleted.
  const spreads = R.api.shippedSpreads(R.entries);

  // ---- (1) THE DISAGREEMENT, PRESERVED AS A REGRESSION PIN -------------
  //
  // 06/03 is the case that proved the removed field dead. The formula it
  // carried, `Math.ceil(i / 2)` over the flat newest-first entry index,
  // computed 1 for that day. The real spread list puts it at 4, because
  // `buildBlessingSpreads` chunks day-aligned and mints spreads for
  // import-only days that a flat blessing index cannot see at all. The tap
  // went to 4 — the field was wrong AND unread.
  //
  // The two numbers are pinned here so the fixture cannot drift into a shape
  // where the two derivations happen to agree, which would quietly turn every
  // assertion below into a tautology.
  const JUNE = '2026-06';
  const JUNE_3 = label(2026, 6, 3);
  const deadFormulaWouldHaveSaid = Math.ceil(
    R.entries.map(function (e) { return e.dayLabel; }).indexOf(JUNE_3) / 2);
  const realIndex = firstSpreadIndexForDay(spreads, JUNE_3);
  assert.strictEqual(deadFormulaWouldHaveSaid, 1,
    '(G-D1/1) the dropped field\'s formula computes 1 for 06/03 over this ' +
    'fixture. Recomputed here from the entry list rather than quoted, so ' +
    'this stays a measurement');
  assert.strictEqual(realIndex, 2,
    '(G-D1/1) ...while the REAL SHIPPED spread list puts 06/03 at index 2. ' +
    '26.91-17 MOVED THIS VALUE FROM 4 TO 2 AND THE CLAIM IS UNCHANGED: her ' +
    'ruling of 2026-08-09 takes the two import-only days (07/26, 07/19) out ' +
    'of the notebook, so the list is 07/30 x2 then 06/03. THE ' +
    'DISCRIMINATION SURVIVES — 1 and 2 still disagree — which is the ' +
    'property this pin exists for, and it is asserted below rather than ' +
    'assumed. Got ' + realIndex);
  assert.notStrictEqual(deadFormulaWouldHaveSaid, realIndex,
    '(G-D1/1) THE TWO DERIVATIONS DISAGREE (1 vs 2), and the fixture must ' +
    'keep them disagreeing. If they ever agree, the executed tap below stops ' +
    'discriminating between the correct derivation and the dead one, and ' +
    'this whole group becomes satisfiable by the defect D-1 removed');

  // ---- (2) THE LIT-DAY SET FOR JUNE, BY VALUE --------------------------
  const juneGrid = R.api.grid(R.entries, JUNE);
  const juneLit = juneGrid.days.filter(function (c) { return c.lit; })
    .map(function (c) { return c.day; });
  assert.deepStrictEqual(juneLit, [3],
    '(G-D1/2) POSITIVE CONTROL: June holds exactly one lit day, the 3rd. ' +
    'Without this the tap below is satisfied by a month that paints no lit ' +
    'button at all. Got: ' + JSON.stringify(juneLit));

  // ---- (3) THE TAP, EXECUTED -------------------------------------------
  R.NB.view = 0;
  R.NB.month = JUNE;
  const nodes = R.api.paint(R.entries, roster);
  const dayButtons = f1DayCells(nodes).filter(function (n) {
    return n.tag === 'button' && String(n.text) === '3';
  });
  assert.strictEqual(dayButtons.length, 1,
    '(G-D1/3) POSITIVE CONTROL: the real painter appended EXACTLY ONE ' +
    'button for the lit 3rd — a lit day is a button, an unlit day is an ' +
    'inert span. Got ' + dayButtons.length);
  assert.ok(dayButtons[0].__on.click && dayButtons[0].__on.click.length === 1,
    '(G-D1/3) POSITIVE CONTROL: ...and it carries exactly one registered ' +
    'click listener, so the tap below invokes the shipped handler rather ' +
    'than nothing');
  dayButtons[0].__on.click[0]();
  assert.strictEqual(R.NB.view, realIndex,
    '(G-D1/3) TAPPING THE LIT CELL FOR 06/03 LANDS ON SPREAD ' + realIndex +
    ' — the index of the first spread whose day matches, read off ' +
    'buildBlessingSpreads\' REAL output. This is the assertion D-1 says the ' +
    'suite never had: every previous pin compared the calendar against a ' +
    'copy of its own formula, which computed ' + deadFormulaWouldHaveSaid +
    ' here. Got ' + R.NB.view);
  assert.strictEqual(spreads[R.NB.view].day, JUNE_3,
    '(G-D1/3) ...and the spread it landed on really is 06/03\'s, stated as ' +
    'the day rather than as an index, so an off-by-one in the oracle above ' +
    'cannot hide inside a matching number');

  // ---- (4) EVERY LIT DAY OF THE BUSY MONTH, NOT JUST THE ONE ------------
  // One passing case is an anecdote. July's lit day is driven the same way,
  // and the number of taps actually executed is asserted against the lit-day
  // set so a loop that never ran cannot pass.
  const JULY = '2026-07';
  const julyGrid = R.api.grid(R.entries, JULY);
  const julyLit = julyGrid.days.filter(function (c) { return c.lit; })
    .map(function (c) { return c.day; });
  assert.deepStrictEqual(julyLit, [30],
    '(G-D1/4) POSITIVE CONTROL: July\'s lit-day set, by value — the 30th ' +
    'alone. 07/26 and 07/19 are import-only and stay unlit (G-B5); 07/15 is ' +
    'fenced out entirely. Got: ' + JSON.stringify(julyLit));
  let tapped = 0;
  julyLit.forEach(function (d) {
    R.NB.view = 0;
    R.NB.month = JULY;
    const ns = R.api.paint(R.entries, roster);
    const btn = f1DayCells(ns).filter(function (n) {
      return n.tag === 'button' && String(n.text) === String(d);
    });
    assert.strictEqual(btn.length, 1,
      '(G-D1/4) exactly one button painted for lit day ' + d);
    btn[0].__on.click[0]();
    tapped++;
    const want = firstSpreadIndexForDay(spreads, label(2026, 7, d));
    assert.strictEqual(R.NB.view, want,
      '(G-D1/4) tapping 07/' + d + ' lands on spread ' + want + ', the ' +
      'first spread carrying that day. Got ' + R.NB.view);
  });
  assert.strictEqual(tapped, julyLit.length,
    '(G-D1/4) ...and every lit day of July was actually tapped (' + tapped +
    '), so this loop cannot pass by never running');
})();

(function gF1TheCalendarNeverLeaves() {
  const R = f1Rig();
  const roster = blessingsMonthRoster(R.entries);
  // 26.91-17: `spreads` is the DRIVEN-DIRECTLY model — the three-argument
  // builder, RETAINED whole for Phase 26.95 — and `shipped` is what
  // paintNotebookSpread now derives. Both are pinned BY VALUE below, and
  // the paint loop walks the SHIPPED one because that is the list the
  // painter clamps its view against. Pairing the executed render with a
  // list the app no longer builds is how a per-index loop starts measuring
  // a different program from the one under test.
  const spreads = R.api.spreads(R.entries);
  const shipped = R.api.shippedSpreads(R.entries);

  // ---- (1) THE SPREAD COUNT, PINNED BY VALUE --------------------------
  //
  // FIRST, and on purpose. A model that emits nothing satisfies every
  // per-index assertion below by never running the loop — the same hole
  // `p === n` leaves in the sweep, closed the same way.
  assert.strictEqual(spreads.length, 5,
    '(G-F1/1) THE SPREAD COUNT OVER THE ZERO-OVERLAP FIXTURE IS EXACTLY 5, ' +
    'PINNED BY VALUE: 07/30 holds two blessings (two spreads now that a ' +
    'spread holds one page), 07/26 and 07/19 are import-only (one trace ' +
    'page each), 06/03 holds one blessing, and 07/15 is fenced out ' +
    'entirely. Got ' + spreads.length);
  assert.deepStrictEqual(spreads.map(function (s) { return s.day; }),
    ['07/30/2026', '07/30/2026', '07/26/2026', '07/19/2026', '06/03/2026'],
    '(G-F1/1) ORDERING, BY VALUE: spreads run NEWEST DAY FIRST and, within ' +
    'a day, in the shipped newest-first entry order. Asserted by value so ' +
    'a stable-sort change goes red here rather than silently reordering ' +
    'her book. ⚠ 26.91-17: this is the DRIVEN-DIRECTLY list — the ' +
    'three-argument builder RETAINED for Phase 26.95. What the app now ' +
    'paints is pinned separately, immediately below, and the two are ' +
    'deliberately not the same list');

  // ---- (1b) 26.91-17: THE SHIPPED DAY-SET, BY VALUE -------------------
  //
  // HER RULING, MADE MACHINE-CHECKABLE. A-14 (2026-08-09): the notebook's
  // day-set EQUALS the calendar's lit-day set again. Asserted as a LIST OF
  // DAYS, never as a count — a count of 3 is satisfied by the WRONG three
  // days, and "which days are in her book" is precisely the claim.
  assert.deepStrictEqual(shipped.map(function (s) { return s.day; }),
    ['07/30/2026', '07/30/2026', '06/03/2026'],
    '(G-F1/1b) THE SHIPPED DAY-SET IS THE LIT-DAY SET, BY VALUE: 07/30 ' +
    'holds two blessings (two spreads), 06/03 holds one, 07/15 is fenced ' +
    'out entirely — and the two IMPORT-ONLY days 07/26 and 07/19 are GONE, ' +
    'which is the retirement. Pinned as a list of days rather than as a ' +
    'count, because a count is satisfied by the wrong days. Got: ' +
    JSON.stringify(shipped.map(function (s) { return s.day; })));
  const shippedLitDays = shipped.map(function (s) { return s.day; })
    .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  const calendarLitDays = R.entries.map(function (e) { return e.dayLabel; })
    .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  assert.deepStrictEqual(shippedLitDays, calendarLitDays,
    '(G-F1/1b) ...AND THE EQUALITY ITSELF, DERIVED FROM BOTH SIDES RATHER ' +
    'THAN RETYPED: the distinct days the notebook can show equal the ' +
    'distinct days the ALREADY-GUARDED blessing entries fall on — the ' +
    'calendar\'s lit-day set. D-C\'s original equality RESTORED. Written ' +
    'this way so it cannot be satisfied by a literal that happens to match ' +
    'today. Got ' + JSON.stringify(shippedLitDays) + ' vs ' +
    JSON.stringify(calendarLitDays));
  assert.ok(shippedLitDays.length > 0,
    '(G-F1/1b) POSITIVE CONTROL: both sides are NON-EMPTY. Two empty ' +
    'arrays are deep-equal, which is the degenerate pass this line closes');

  // ---- (2) THE MODEL CARRIES NO SPREAD-LEVEL GRID DISCRIMINATOR -------
  spreads.forEach(function (s, i) {
    assert.deepStrictEqual(Object.keys(s).sort(),
      ['day', 'monthKey', 'pages'],
      '(G-F1/2) spread ' + i + ' carries EXACTLY day, monthKey and pages ' +
      '— asserted as a KEY-SET EQUALITY, so a discriminator re-added with ' +
      'a constant value fails here rather than being ignored. Got: ' +
      JSON.stringify(Object.keys(s).sort()));
    assert.ok(s.pages.length <= 1,
      '(G-F1/2) ...and spread ' + i + ' holds AT MOST ONE PAGE. The ' +
      'two-page chunking is gone, not disabled: her design has no second ' +
      'reading in which two pages share a spread. Got ' + s.pages.length);
  });

  // ---- (3) EVERY INDEX: THE GRID IS PAINTED, THE PAGE IS ON THE RIGHT --
  const GEOM = NB_SRC_CONSTS.STATION_NOTEBOOK_GEOM;
  const RIGHT_X = GEOM.pageX.right + GEOM.date.dx;
  const seen = { blessing: 0, trace: 0 };
  const rightText = [];
  let visited = 0;
  // 26.91-17: THE SHIPPED LIST, because the painter clamps its view against
  // that list and painting index 4 of a 3-spread book measures the clamp,
  // not the calendar.
  shipped.forEach(function (s, i) {
    // the flip handlers carry the month along on a page turn; this mirrors
    // them so each index is painted against its own month.
    R.NB.view = i;
    R.NB.month = s.monthKey;
    R.calls.calendar = 0;
    R.calls.page = 0;
    R.calls.trace = 0;
    const nodes = R.api.paint(R.entries, roster);
    visited++;

    // THE GRID, COUNTED BY ITS REAL DAY CELLS rather than by a truthy node
    // — a stray empty container satisfies a node check.
    const grid = R.api.grid(R.entries, s.monthKey);
    const cells = f1DayCells(nodes);
    assert.strictEqual(cells.length, grid.days.length,
      '(G-F1/3) THE CALENDAR NEVER LEAVES — at spread index ' + i + ' (' +
      s.day + ') the grid paints EXACTLY ' + grid.days.length + ' day ' +
      'cells, one per day of ' + s.monthKey + '. Counted from the real ' +
      'month grid, not from a literal, and compared by EQUALITY: a painter ' +
      'that drew an empty container, threw, or did not run at all fails ' +
      'here. Got ' + cells.length);
    assert.strictEqual(R.calls.calendar, 1,
      '(G-F1/3) ...and paintNotebookCalendar ran EXACTLY ONCE at index ' +
      i + '. Exactly one, not at least one: a second call would repaint ' +
      'the grid over itself and is a different bug wearing the same green');

    // THE PAGE IS ON THE RIGHT, BY VALUE.
    if (s.pages.length) {
      const lead = f1Flat(nodes).filter(function (n) {
        return n.style && n.style.__p['--x'] !== undefined &&
          Number(n.style.__p['--x']) === RIGHT_X;
      });
      assert.ok(lead.length >= 1,
        '(G-F1/3) SELECTING A DATE FILLS THE RIGHT PAGE — at index ' + i +
        ' the page\'s leading node sits at the RIGHT page origin ' +
        RIGHT_X + ' (pageX.right ' + GEOM.pageX.right + ' + date.dx ' +
        GEOM.date.dx + '), BY VALUE. On the left it would sit at ' +
        (GEOM.pageX.left + GEOM.date.dx));
      assert.strictEqual(R.calls.page + R.calls.trace, 1,
        '(G-F1/3) ...and EXACTLY ONE page painter ran at index ' + i +
        ' — one page per spread, painted once');
      if (s.pages[0].trace) {
        seen.trace++;
      } else {
        seen.blessing++;
      }
      // WHAT THE RIGHT PAGE ACTUALLY SAYS AT THIS INDEX, for (5) below —
      // read from THE PAGE PAINTER'S OWN NODES, never from the finished
      // scene.
      //
      // ⚠ MEASURED, NOT ASSUMED. Written first as a text scan over the
      // whole scene, it was DRIVEN against a painter stubbed to draw the
      // calendar and nothing else — and (5) STAYED GREEN, because the
      // grid's month label differs between the July spreads and the June
      // one. The gate was measuring the CALENDAR changing, not the page.
      // Fixed here rather than by weakening the probe.
      const words = f1Flat(R.state.pagePainted || []).map(function (n) {
        return String(n.text || '');
      }).join('|');
      rightText.push(words);
    }
  });

  assert.strictEqual(visited, shipped.length,
    '(G-F1/3) THE LOOP VISITED EVERY INDEX: ' + visited + ' of ' +
    shipped.length + '. A loop that silently visited fewer indices than it ' +
    'claims is the defect class this file is written against, so the count ' +
    'is asserted rather than trusted');

  // ---- (4) THE POSITIVE CONTROLS, IN THE SAME RUN --------------------
  assert.ok(seen.blessing >= 1,
    '(G-F1/4) POSITIVE CONTROL, BY NAME: at least one index rendered a ' +
    'REAL BLESSING PAGE (' + seen.blessing + '). Without it the whole ' +
    'per-index loop is satisfied by a book of nothing but empty spreads');
  // 26.91-17 REWRITTEN, NEVER DELETED. WAS: `seen.trace >= 1` — at least one
  // index rendered the import-only page, wave 6's positive control that the
  // book HAD import days in it. Her ruling of 2026-08-09 inverts that
  // expectation: the shipped book has none. The pin moves with the
  // behaviour rather than being dropped, and it moves to an EQUALITY at
  // zero over EVERY index of the executed render, which is a stronger claim
  // than the `>= 1` it replaces.
  assert.strictEqual(seen.trace, 0,
    '(G-F1/4/26.91-17) NO INDEX OF THE SHIPPED BOOK RENDERS A TRACE PAGE ' +
    '— asserted over the EXECUTED render at EVERY index, not read from ' +
    'source. This is one half of the DORMANT-versus-BROKEN pair; the other ' +
    'half (the builder STILL MINTS one when driven directly with arrivals) ' +
    'is asserted in (G-17/dormant) and neither half means anything alone. ' +
    'Got ' + seen.trace);
  assert.strictEqual(seen.blessing, visited,
    '(G-F1/4/26.91-17) ...and EVERY visited index rendered a blessing ' +
    'page: ' + seen.blessing + ' of ' + visited + '. This is what makes ' +
    'the zero above a measurement rather than an absence — the book is ' +
    'full, it simply holds nothing but pages she made');

  // ---- (5) THE RIGHT PAGE'S CONTENT DIFFERS BETWEEN TWO INDICES ------
  const distinct = rightText.filter(function (t, i) {
    return rightText.indexOf(t) === i;
  });
  assert.ok(distinct.length >= 2,
    '(G-F1/5) THE RIGHT PAGE SAYS SOMETHING DIFFERENT AT TWO DISTINCT ' +
    'INDICES (' + distinct.length + ' distinct). A painter that drew the ' +
    'calendar and NOTHING ELSE passes "the calendar never leaves" ' +
    'perfectly; this is the assertion that closes it. Measured over the ' +
    'PAGE PAINTERS\' OWN NODES — a scan of the whole scene passes this ' +
    'against a page-less painter, because the grid\'s month label already ' +
    'differs between the July spreads and the June one');
  assert.ok(rightText.every(function (t) { return t.length > 0; }),
    '(G-F1/5) POSITIVE CONTROL: every index that HAS a page painted a ' +
    'non-empty one. Without this, a painter that appended nothing gives ' +
    'every index the empty string, and "distinct" collapses to 1 — which ' +
    'is the failure this control names rather than leaves to the count');

  // ---- (6) IDEMPOTENCY: painting the same index twice ----------------
  R.NB.view = 0;
  R.NB.month = spreads[0].monthKey;
  const once = f1Flat(R.api.paint(R.entries, roster)).map(function (n) {
    return n.tag + ':' + n.cls + ':' + n.text;
  });
  const twice = f1Flat(R.api.paint(R.entries, roster)).map(function (n) {
    return n.tag + ':' + n.cls + ':' + n.text;
  });
  assert.deepStrictEqual(twice, once,
    '(G-F1/6) IDEMPOTENCY: painting the same spread index twice produces ' +
    'the same node set. The painter clears and repaints and holds no ' +
    'accumulating state');
  assert.ok(once.length > 0,
    '(G-F1/6) POSITIVE CONTROL: ...and it painted something at all. Two ' +
    'empty lists are deep-equal, which is how an idempotency assertion ' +
    'becomes vacuous');
})();

(function gF3TheAlmostEmptyPageAndTheArmedFence() {
  // THE HEADER THIS GROUP NEEDS MOST: THIS INSTRUMENT'S SURFACE VANISHED.
  //
  // F-3 takes the composed sentence off the page, so wave 8's law-5 folder
  // fence has nothing left to guard on any rendered surface. ASSERTING THAT
  // IT IS QUIET WOULD BE ASSERTING NOTHING AT ALL — a gate that silently
  // skips because its subject vanished is this project's defect class in
  // its purest form, and a gate that cannot go red is the same defect
  // wearing a green light. So this group asserts the fence still FIRES.
  //
  // Per D-04 and **26.91 D-05** — *the naming fallback: an opaque hash must
  // never reach the surface* (`26.91-CONTEXT.md:94`, NOT `26.9-CONTEXT.md:37`'s
  // gutter clause, which is a different phase's decision and was retired by
  // A-12). The fence and its naming fallback are RETAINED for Phase 26.95
  // and must be provably able to go red while they wait.
  const R = f1Rig();
  const roster = blessingsMonthRoster(R.entries);
  const spreads = R.api.spreads(R.entries);
  const impLabel = atLabel(ZO.zero_overlap._import_only_day_with_many);
  const impIndex = spreads.map(function (s) { return s.day; })
    .indexOf(impLabel);
  assert.notStrictEqual(impIndex, -1,
    '(G-F3) POSITIVE CONTROL: the import-only day ' + impLabel + ' has a ' +
    'spread at all. Every assertion below is about that spread');

  // ---- (a) 26.91-17: THE PAGE IS OFF THE SHIPPED RENDER PATH ---------
  //
  // REWRITTEN, NEVER DELETED. This block used to paint the shipped spread at
  // the import-only day's index and assert the almost-empty page there. Her
  // ruling of 2026-08-09 (A-14) takes that day out of the notebook, so the
  // old form would now paint a DIFFERENT day's spread and assert about
  // whatever it happened to find — a pin passing for a reason that has
  // nothing to do with what it was written to catch. The almost-empty-page
  // claim did NOT disappear with its call site: it moved to (a2), driven at
  // the retained painter directly, and (a2) landed in an EARLIER COMMIT so
  // it never spent a single commit vacuous.
  //
  // What this block asserts now is the retirement itself, by value.
  const shipped = R.api.shippedSpreads(R.entries);
  const GEOM = NB_SRC_CONSTS.STATION_NOTEBOOK_GEOM;
  assert.strictEqual(shipped.map(function (s) { return s.day; })
    .indexOf(impLabel), -1,
    '(G-F3/a/26.91-17) THE IMPORT-ONLY DAY ' + impLabel + ' IS ABSENT ' +
    'FROM THE SHIPPED SPREAD LIST. Her ruling of 2026-08-09: the ' +
    'notebook\'s day-set is the calendar\'s lit-day set again. Got: ' +
    JSON.stringify(shipped.map(function (s) { return s.day; })));
  assert.ok(shipped.length > 0,
    '(G-F3/a/26.91-17) POSITIVE CONTROL: ...and the book is NOT EMPTY. ' +
    'Without this, "the import day left" is satisfied by the whole ' +
    'notebook going away — the same degenerate pass (c) closes below');
  let tracedAnywhere = 0;
  let paintedAnywhere = 0;
  shipped.forEach(function (s, i) {
    R.NB.view = i;
    R.NB.month = s.monthKey;
    R.calls.trace = 0;
    const ns = R.api.paint(R.entries, roster);
    assert.ok(ns.length > 0,
      '(G-F3/a/26.91-17) POSITIVE CONTROL: the paint appended something at ' +
      'index ' + i);
    paintedAnywhere++;
    tracedAnywhere += R.calls.trace;
  });
  assert.strictEqual(paintedAnywhere, shipped.length,
    '(G-F3/a/26.91-17) the loop visited EVERY shipped index (' +
    paintedAnywhere + ' of ' + shipped.length + '), asserted FIRST because ' +
    'the zero below is satisfied by a loop that never ran');
  assert.strictEqual(tracedAnywhere, 0,
    '(G-F3/a/26.91-17) AND paintTracePage RUNS AT NO INDEX of the shipped ' +
    'book — driven over the EXECUTED render at every index, never read ' +
    'from source. The painter is RETAINED and still works; it is simply ' +
    'unreachable from here. That distinction is the whole content of ' +
    '"dormant", and it is only meaningful paired with (a2) below, which ' +
    'drives the same painter directly and finds it whole. Got ' +
    tracedAnywhere);
  assert.strictEqual(
    (bodyOf('paintTracePage').match(/innerHTML/g) || []).length, 0,
    '(G-F3/a) ENCODING: the page assigns through textContent only — ' +
    'innerHTML appears ZERO times in the painter. A folder name, and now a ' +
    'day label, is user-derived text on a front-facing surface');

  // ---- (a2) THE SAME CLAIM, DRIVEN DIRECTLY AT THE RETAINED PAINTER ----
  //
  // 26.91-17, WRITTEN BEFORE THE SUBJECT LEAVES. The owner ruling of
  // 2026-08-09 (A-14) takes paintTracePage off the shipped render path.
  // Every assertion in (a) above reaches that painter THROUGH the shipped
  // paint, so the moment the call site goes they would pass because the
  // painter never ran — reporting green while measuring nothing, which is
  // this project's named defect class in its purest form. The rewrite
  // lands HERE, in a commit BEFORE the removal, so the claim never spends
  // a single commit vacuous.
  //
  // This is also the half of the DORMANT-versus-BROKEN pair that says
  // *the painter still works*. Its counterpart — *and the shipped paint
  // never reaches it* — is asserted in the same file over the executed
  // render. Neither half means anything alone.
  const tracePage = spreads[impIndex].pages[0];
  assert.strictEqual(!!tracePage.trace, true,
    '(G-F3/a2) POSITIVE CONTROL: the page handed to the direct driver ' +
    'really is a trace page. Without this the driver below is measuring ' +
    'whatever the builder happened to mint');
  const direct = R.api.paintTraceDirect(tracePage, 'right');
  const directNodes = f1Flat(direct.painted);
  assert.strictEqual(directNodes.length, 1,
    '(G-F3/a2) THE RETAINED PAINTER STILL PAINTS THE ALMOST-EMPTY PAGE: ' +
    'driven DIRECTLY, paintTracePage appends EXACTLY ONE node. Same claim ' +
    'as (a), reached without the render path, so it survives the render ' +
    'path being cut. Got ' + directNodes.length + ': ' +
    JSON.stringify(directNodes.map(function (n) { return n.text; })));
  assert.strictEqual(directNodes[0].text,
    R.api.dayLabel(atMs(ZO.zero_overlap._import_only_day_with_many)),
    '(G-F3/a2) ...and that one node is THE DAY LABEL, by exact string ' +
    'equality against blessingDayLabel\'s own output — the retained ' +
    'painter is RETAINED WHOLE, not retained as a shell');

  // ---- (b) NO COMPOSED SENTENCE REACHES ANY PAGE, AT ANY INDEX -------
  //
  // THE POSITIVE HALF FIRST, and it is what makes the negative half a test
  // rather than a tautology: compute the sentence directly and confirm it
  // is a real non-empty string, so the scan below has something to look for.
  const impArrivals = packArrivalDays(R.items, [], guard)
    .filter(function (a) { return a.dayLabel === impLabel; });
  const sentence = composeArrivalTrace(impArrivals);
  assert.ok(typeof sentence === 'string' && sentence.length > 0,
    '(G-F3/b) POSITIVE HALF: composeArrivalTrace still returns a REAL ' +
    'composed sentence for that day\'s arrivals — ' +
    JSON.stringify(sentence) + '. The composer is RETAINED and working; ' +
    'only its call site is gone. Without this the scan below is a ' +
    'tautology over the empty string');
  // 26.91-17: THE SHIPPED LIST. Walking the driven-directly list here would
  // set `view` past the end of the shipped book at two indices, where
  // paintNotebookSpread CLAMPS — so the scan would silently paint the last
  // spread three times while reporting five visited indices. A loop that
  // visits fewer distinct states than it claims is this file's named defect
  // class, and it would have landed inside the instrument built to catch it.
  let scanned = 0;
  shipped.forEach(function (s, i) {
    R.NB.view = i;
    R.NB.month = s.monthKey;
    const texts = f1Flat(R.api.paint(R.entries, roster)).map(function (n) {
      return String(n.text || '');
    });
    assert.strictEqual(R.NB.view, i,
      '(G-F3/b/26.91-17) THE PAINTER DID NOT CLAMP AT INDEX ' + i + ': the ' +
      'view survives the paint, so this iteration really is a distinct ' +
      'spread rather than the last one repeated. Without this the scan ' +
      'below reports every index while measuring one');
    scanned++;
    texts.forEach(function (t) {
      assert.strictEqual(t.indexOf(sentence), -1,
        '(G-F3/b) THE COMPOSED SENTENCE REACHES NO PAINTED NODE, at spread ' +
        'index ' + i + '. Asserted over the EXECUTED render at EVERY ' +
        'index — a source grep cannot see a render, and a sentence ' +
        'surviving on some index the gate never visits is exactly the leak ' +
        'this scan exists for. Found: ' + JSON.stringify(t));
    });
  });
  assert.strictEqual(scanned, shipped.length,
    '(G-F3/b) ...and the scan visited EVERY index (' + scanned + ' of ' +
    shipped.length + '), asserted equal to the by-value count rather than ' +
    'trusted');

  // ---- (b2) THE SAME BAN, DRIVEN AT THE PAINTER ITSELF ----------------
  //
  // 26.91-17, WRITTEN BEFORE THE SUBJECT LEAVES — the same reasoning as
  // (a2). The scan above walks the SHIPPED spread list; once the owner
  // ruling of 2026-08-09 takes the trace page off that list, the scan
  // passes because there is no trace page to carry a sentence, not
  // because F-3's removal held. That is a pin passing for a reason with
  // nothing to do with what it was written to catch.
  //
  // So the ban is ALSO taken where F-3 actually made it: at the painter,
  // handed the very day whose arrivals compose a real non-empty sentence.
  // The positive half above (`sentence` is a real string) is what makes
  // this a test rather than a tautology, and it is reused deliberately.
  const b2 = R.api.paintTraceDirect(spreads[impIndex].pages[0], 'right');
  const b2texts = f1Flat(b2.painted).map(function (n) {
    return String(n.text || '');
  });
  assert.ok(b2texts.length > 0,
    '(G-F3/b2) POSITIVE CONTROL: the direct drive painted something at ' +
    'all. A painter that appended nothing satisfies the ban below by ' +
    'having no text to search');
  b2texts.forEach(function (t) {
    assert.strictEqual(t.indexOf(sentence), -1,
      '(G-F3/b2) F-3 HOLDS AT THE PAINTER, NOT MERELY AT THE CALL SITE: ' +
      'driven directly with the day whose arrivals compose ' +
      JSON.stringify(sentence) + ', paintTracePage writes no node ' +
      'containing it. This is the assertion that survives the render path ' +
      'being cut — the scan over the shipped spreads above cannot, because ' +
      'after 26.91-17 that list holds no trace page at all. Found: ' +
      JSON.stringify(t));
  });

  // ---- (c) THE FENCE'S LIVE HALF IS STILL ON THE RENDER PATH ---------
  //
  // Per D-04: the fence runs at render, on every render, threaded as an
  // argument. Driven by fencing every arrival of the import-only day and
  // re-running the SAME call — a pack hoisted out of the paint, or
  // memoized, passes before the flip and fails here.
  const L = f1Rig();
  const before = L.api.spreads(L.entries).map(function (s) { return s.day; });
  assert.ok(before.indexOf(impLabel) !== -1,
    '(G-F3/c) POSITIVE CONTROL: before the flip the import-only day is in ' +
    'the flip order');
  const flipped = [];
  Object.keys(L.items).forEach(function (id) {
    const it = L.items[id];
    if (typeof it.imported_ms !== 'number') { return; }
    if (blessingDayLabel(it.imported_ms) !== impLabel) { return; }
    if (guard(it, []) !== null) { return; }
    it.state = 'never_show';
    flipped.push(id);
  });
  assert.ok(flipped.length > 0,
    '(G-F3/c) POSITIVE CONTROL: the flip really did change items (' +
    flipped.length + '). A flip that flipped nothing is a probe that ' +
    'probes nothing');
  const after = L.api.spreads(L.entries).map(function (s) { return s.day; });
  assert.strictEqual(after.indexOf(impLabel), -1,
    '(G-F3/c) THE FENCE\'S LIVE HALF IS STILL LIVE: with every arrival of ' +
    impLabel + ' fenced, the SAME CALL WITH THE SAME ARGUMENTS removes ' +
    'that day\'s spread — the day self-heals out of navigation entirely ' +
    '(law 5 P0). packArrivalDays is still called inside the paint, never ' +
    'hoisted and never memoized');
  assert.ok(after.length > 0,
    '(G-F3/c) POSITIVE CONTROL: ...and the book is not empty. Without ' +
    'this, "the day left" is satisfied by the whole notebook going away');
  // FAIL-CLOSED IS A DIFFERENT OUTCOME AND IS RECORDED SEPARATELY, never
  // conflated with fail-fenced: `typeof guard !== 'function'` drops
  // EVERYTHING, so the day leaves for a different reason.
  const noGuard = f1Rig();
  const packNoGuard = packArrivalDays(noGuard.items, [], undefined);
  assert.deepStrictEqual(packNoGuard, [],
    '(G-F3/c) FAIL-CLOSED, STATED SEPARATELY: passing the guard as ' +
    '`undefined` yields an EMPTY arrival set, because packArrivalDays ' +
    'keeps an item only when `guard(item, filters) === null` and drops ' +
    'everything when the guard is not a function. That is fail-CLOSED, ' +
    'not fail-FENCED, and recording them as one outcome would hide which ' +
    'of the two a regression broke');

  // ---- (d) THE FENCE'S NAMING HALF IS STILL ARMED --------------------
  //
  // ⚠ DRIVEN THROUGH THE GUARDED PIPELINE, NEVER ON THE COMPOSER ALONE.
  // composeArrivalTrace(dayEntries) takes ONE argument and is PURE over it
  // (`var list = dayEntries || []`). Fencing is applied UPSTREAM by
  // packArrivalDays(items, filters, guard), which drops fenced ITEMS before
  // the composer ever sees them. So flipping a status and re-calling the
  // composer WITH THE SAME ARRAY returns a BYTE-IDENTICAL string — an
  // assertion in that shape cannot go red, which is precisely the failure
  // this group exists to prevent. The pipeline is re-run instead.
  function pipeline(store, dayLabel) {
    return composeArrivalTrace(packArrivalDays(store, [], guard)
      .filter(function (a) { return a.dayLabel === dayLabel; }));
  }
  // ⚠ THE SOLE-ARRIVAL PRECONDITION IS ABOUT A **FOLDER**, NOT ABOUT A DAY,
  // AND GETTING THAT WRONG MAKES THIS WHOLE GROUP VACUOUS. MEASURED WHILE
  // WRITING IT, not reasoned about afterwards.
  //
  // Written first against the zero-overlap fixture's 07/26 — whose SOLE
  // arrival from the folder is also its ONLY arrival — the three recorded
  // sentences came back:
  //
  //     before the flip      "the librarian brought in notes from your Recipes folder."
  //     after  the flip      ""
  //     never held it        ""
  //
  // Both post-flip values are THE EMPTY STRING. So *the folder name is
  // gone* and *byte-identical to a day that never held it* were BOTH
  // satisfied by `'' === ''` — a gate passing on a degenerate value, which
  // is this project's named defect class wearing a green light, landing
  // once more inside the instrument built to catch it. Flipping a day's
  // only arrival empties the DAY; what DIRECTION-2 is about is a day that
  // STILL HAS A SENTENCE which no longer names one folder.
  //
  // So the fixture is built for the property instead of borrowed: a day
  // holding arrivals from TWO folders, where the folder under test has
  // EXACTLY ONE. *Flip exactly ONE item* is still not sufficient on its own
  // — with two arrivals from the same folder, flipping one leaves the
  // folder named and the sentence byte-identical, which is the care the
  // shipped fence driver at (6b) already takes — and now the day cannot go
  // empty either.
  // ⚠ AND THE FOLDER UNDER TEST MUST BE THE ONE THE SENTENCE NAMES.
  // MEASURED, not assumed: composeArrivalTrace names ONE folder — the
  // WINNER by arrival count, with a LEXICOGRAPHIC tie-break — and puts
  // everything else behind `, and elsewhere in your vault.` Written first
  // with the fenced folder as the smaller one, STEP 1 failed outright:
  //
  //     Letters x2 + Recipes x1 -> "…from your Letters folder, and elsewhere in your vault."
  //
  // Recipes was never named, so there was nothing for the flip to remove.
  // The fixture therefore uses ONE arrival each and lets the tie-break
  // decide, which is the only shape where the folder under test both WINS
  // (so it is named) and is SOLE (so one flip removes it) while the day
  // still holds another arrival (so it cannot go empty):
  //
  //     Apples x1 + Zebra x1 -> "…from your Apples folder, and elsewhere in your vault."
  //     Zebra  x1            -> "…from your Zebra folder."
  //
  // The names are chosen for their ORDER, not their prettiness, and that is
  // said out loud so nobody "tidies" them into something that reverses the
  // tie-break and quietly re-vacuates the group.
  const KEEP = 'Zebra';
  const GO = 'Apples';
  function armedStore() {
    const st = traceBulk({}, 'keep', 1, { at: TRACE_DAY, folder: KEEP });
    return traceBulk(st, 'go', 1, { at: TRACE_DAY, folder: GO });
  }
  function armedPipeline(store) {
    return composeArrivalTrace(packArrivalDays(store, [], guard)
      .filter(function (a) { return a.dayLabel === TRACE_LABEL; }));
  }
  const A = armedStore();
  const goIds = Object.keys(A).filter(function (id) {
    return A[id].folder === GO && guard(A[id], []) === null;
  });
  assert.strictEqual(goIds.length, 1,
    '(G-F3/d) THE SOLE-ARRIVAL PRECONDITION, ASSERTED RATHER THAN ASSUMED, ' +
    'AND IT IS PER-FOLDER: the day holds EXACTLY ONE surviving arrival ' +
    'from ' + JSON.stringify(GO) + ', so flipping it really does remove ' +
    'that folder from the sentence. At two, the flip leaves the folder ' +
    'named and the composed string byte-identical — measured. Got ' +
    goIds.length);
  const keepIds = Object.keys(A).filter(function (id) {
    return A[id].folder === KEEP && guard(A[id], []) === null;
  });
  assert.ok(armedPipelineNamesWinner(),
    '(G-F3/d) PRECONDITION, MEASURED: the composer names the WINNER folder ' +
    'with a lexicographic tie-break, so ' + JSON.stringify(GO) + ' is the ' +
    'one named at one arrival each. A fixture where the fenced folder is ' +
    'the smaller one never names it at all, and STEP 3 would be removing ' +
    'something that was never there');
  assert.ok(keepIds.length >= 1,
    '(G-F3/d) ...and the day ALSO holds arrivals from a SECOND folder (' +
    keepIds.length + ' from ' + JSON.stringify(KEEP) + '). THIS IS WHAT ' +
    'STOPS THE GROUP GOING VACUOUS: without it the flip empties the day, ' +
    'the composer answers the EMPTY STRING, and both assertions below pass ' +
    'on two empty strings while proving nothing');
  function armedPipelineNamesWinner() {
    return armedPipeline(A).indexOf(GO) !== -1;
  }
  const armedBefore = armedPipeline(A);
  assert.ok(armedBefore.indexOf(GO) !== -1,
    '(G-F3/d) STEP 1: through the GUARDED PIPELINE, the composed sentence ' +
    'NAMES ' + JSON.stringify(GO) + '. Got: ' + JSON.stringify(armedBefore));
  A[goIds[0]].state = 'never_show';
  const armedAfter = armedPipeline(A);
  assert.ok(armedAfter.length > 0,
    '(G-F3/d) STEP 2, THE ANTI-VACUITY HALF, AND IT COMES FIRST: after the ' +
    'flip the day STILL COMPOSES A REAL SENTENCE. An empty string would ' +
    'satisfy every assertion below trivially, and that is exactly how this ' +
    'group failed when it was first written. Got: ' +
    JSON.stringify(armedAfter));
  assert.strictEqual(armedAfter.indexOf(GO), -1,
    '(G-F3/d) STEP 3: THE FENCE STILL FIRES. The day\'s SOLE arrival from ' +
    JSON.stringify(GO) + ' is flipped to never_show and the pipeline is ' +
    're-run WITH THE SAME ARGUMENTS — the folder name is GONE from a ' +
    'sentence that is still there. This is the assertion that carries the ' +
    'whole ARMED claim, and it is why the composer is never driven alone: ' +
    'composeArrivalTrace is pure over one argument and would answer ' +
    'byte-identically. Got: ' + JSON.stringify(armedAfter));
  assert.ok(armedAfter.indexOf(KEEP) !== -1,
    '(G-F3/d) ...and the OTHER folder is STILL NAMED, so the fence removed ' +
    'exactly what was fenced rather than silencing the sentence wholesale');
  // DIRECTION-2, the shipped (6f) property: gone-and-explained and
  // gone-silently are different outcomes and only the second is law-5
  // compliant.
  const neverHeld = armedPipeline(traceBulk({}, 'keep', 2,
    { at: TRACE_DAY, folder: KEEP }));
  assert.ok(neverHeld.length > 0,
    '(G-F3/d) POSITIVE CONTROL for DIRECTION-2: the never-held-it day ' +
    'composes a real sentence too. Two empty strings are byte-identical, ' +
    'which is precisely how this comparison went vacuous the first time');
  assert.strictEqual(armedAfter, neverHeld,
    '(G-F3/d) DIRECTION-2: the sentence after the flip is BYTE-IDENTICAL ' +
    'to the one a day that NEVER HELD ' + JSON.stringify(GO) + ' produces ' +
    '(' + JSON.stringify(armedAfter) + '). Gone-and-explained and ' +
    'gone-silently are different outcomes and only the second is law-5 ' +
    'compliant — the tail must not become a tell');

  // ---- (e) THE NEGATIVE CONTROL, RUN AND RECORDED --------------------
  //
  // An armed-half assertion that has only ever been seen green has been
  // WATCHED, not tested. This drives the SAME pipeline with the fence
  // DISARMED — a guard returning `null` for everything, which is the
  // shipped keep-convention inverted (packArrivalDays keeps an item only
  // when `guard(item, filters) === null`) — and shows the folder name
  // SURVIVING the flip, i.e. STEP 3 above going red on demand.
  function openPipeline(store) {
    return composeArrivalTrace(
      packArrivalDays(store, [], function () { return null; })
        .filter(function (a) { return a.dayLabel === TRACE_LABEL; }));
  }
  const D = armedStore();
  const dGo = Object.keys(D).filter(function (id) {
    return D[id].folder === GO;
  });
  assert.strictEqual(dGo.length, 1,
    '(G-F3/e) precondition: the disarmed run flips the SAME single item');
  const openBefore = openPipeline(D);
  D[dGo[0]].state = 'never_show';
  const openAfter = openPipeline(D);
  assert.ok(openBefore.indexOf(GO) !== -1 && openAfter.indexOf(GO) !== -1,
    '(G-F3/e) THE NEGATIVE CONTROL: with the fence DISARMED, the SAME flip ' +
    'leaves the folder name STANDING — before: ' +
    JSON.stringify(openBefore) + ', after: ' + JSON.stringify(openAfter) +
    '. That is STEP 3 going RED on demand, which is what makes the armed ' +
    'half a gate rather than an observation. It is NOT the same thing as ' +
    'the fail-closed case in (c): there the guard was not a function and ' +
    'the arrival set was EMPTY; here the guard is a function that permits ' +
    'everything and the set is full');
  assert.strictEqual(openAfter, openBefore,
    '(G-F3/e) ...and byte-identically so, which is the sharpest form: with ' +
    'no fence, a status flip changes the composed sentence not at all');
})();

// ---- G-W1(src): 26.91-15 — THE TYPING SURFACE'S ASSEMBLY -----------------
//
// THE SOURCE-SHAPE HALF of 26.91-15. `G-W1` in tests/test_live_render.cjs
// measures what the typing surface RENDERS AS; this group pins how it is
// ASSEMBLED, which is a different claim and fails differently. A rendered
// measurement cannot tell you that the box came from the same constant the
// committed mark's box came from — it can only tell you the two numbers
// happen to agree today.
//
// WHY IT EXISTS AT ALL. 26.91-15 measured the matched cascade on this
// element and found ONE rule — a type-plus-attribute selector at (0,0,1,1),
// written for the palace's page chrome — winning `width`, `font-family`,
// `font-style`, `font-size`, `border`, `padding` and `box-sizing` over the
// two class rules written FOR this element at (0,0,1,0). One rule, both
// reported defects. The fix excludes this element from that recipe AT THE
// SELECTOR, which is why the assertions below care about the element's class
// list and about where its face is allowed to come from.
//
// THE REGION IS PROVEN NON-EMPTY BEFORE ANY COUNT OVER IT IS BELIEVED. A
// region gate armed at a selector that does not exist reports a clean zero
// and is worse than no gate at all — this phase's named defect class in its
// purest form.
(function () {
  const tokens = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const cssStrip = function (s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); };
  const blockOf = function (sel) {
    const src = cssStrip(tokens);
    const at = src.indexOf('\n' + sel + ' {');
    assert.ok(at !== -1,
      '(G-W1/src) THE REGION MUST EXIST BEFORE IT IS COUNTED: no rule block ' +
      'for `' + sel + '` in tokens.css. A gate armed at a missing selector ' +
      'reports a clean zero and proves nothing');
    const from = src.indexOf('{', at) + 1;
    const to = src.indexOf('}', from);
    assert.ok(to !== -1, '(G-W1/src) unterminated rule block for ' + sel);
    return src.slice(from, to);
  };

  // 1. THE TYPING SURFACE'S OWN BLOCK, PROVEN NON-EMPTY FIRST.
  const inputBlock = blockOf('.page-deco-input');
  assert.ok(inputBlock.trim().length > 0,
    '(G-W1/src) the typing surface\'s rule block is EMPTY — every count ' +
    'below would be a vacuous zero');

  // 2. THE FACE IS NOT RESTATED HERE. It comes from the her-layer class the
  //    painter puts on this element beside its own; declaring it a second
  //    time would be a second implementation of a shipped rule, which this
  //    repo treats as a planning error rather than a style preference.
  const serifToken = ['--font', 'serif'].join('-');
  const italicDecl = ['font-style:', 'italic'].join(' ');
  assert.strictEqual(inputBlock.split(serifToken).length - 1, 0,
    '(G-W1/src) the typing surface\'s own rule block names the serif token. ' +
    'The face must come from the shipped her-layer class, never from a ' +
    'second declaration here');
  assert.strictEqual(inputBlock.split(italicDecl).length - 1, 0,
    '(G-W1/src) the typing surface\'s own rule block declares the slanted ' +
    'style. Same reason: one implementation, in the her-layer class');

  // 3. ...AND THE COUNT IS NOT VACUOUS, proven by a POSITIVE CONTROL over
  //    the very block the face is supposed to come from. Without this, a
  //    typo in either needle would read as a clean pass.
  const handBlock = blockOf('.caption-hand');
  assert.ok(handBlock.split(serifToken).length - 1 >= 1 &&
            handBlock.split(italicDecl).length - 1 >= 1,
    '(G-W1/src) THE NEEDLES ARE PROVEN TO MATCH SOMETHING: the her-layer ' +
    'class must declare both, or the two zeroes above are measuring a typo ' +
    'rather than an absence');

  // 4. THE BOX MODEL IS DECLARED, because with the palace recipe correctly
  //    out of reach an undeclared box model falls to the UA default and the
  //    rim lands OUTSIDE the declared box — two CSS px wider and taller than
  //    the committed mark that comes from the same constant.
  assert.ok(/box-sizing:\s*border-box/.test(inputBlock),
    '(G-W1/src) the typing surface must declare its box model. Undeclared, ' +
    'its rim is added outside the declared width and it can no longer ' +
    'occupy the same box as the committed mark');

  // 5. THE RECIPE IS NARROWED, AND THE EXCLUSION NAMES THIS ELEMENT.
  const narrowed = 'input[type="text"]:not(.page-deco-input) {';
  assert.strictEqual(cssStrip(tokens).split(narrowed).length - 1, 1,
    '(G-W1/src) the palace input recipe must select on the narrowed form ' +
    'exactly once. Reverted to the bare type-plus-attribute selector it ' +
    'outranks both class rules written for the typing surface and takes ' +
    'the box AND the face with it');

  // 6. ONE CONSTANT, TWO CONSUMERS — LIFTED, NEVER RE-TYPED. This is the
  //    assertion a rendered measurement cannot make: the typing surface's
  //    box and the committed mark's box must come from the SAME declaration.
  const EDITOR = extractFn(appSrc, 'openHandTextEditor');
  const PAINTER = extractFn(appSrc, 'paintPageDecorations');
  const propOf = function (src, name) {
    const m = src.match(new RegExp(
      'setProperty\\(\'' + name + '\', String\\(([^)]+)\\)\\)'));
    assert.ok(m && m[1],
      '(G-W1/src) could not lift the `' + name + '` assignment out of the ' +
      'typing surface\'s own painter — a lift that silently yielded nothing ' +
      'would make the comparison below compare undefined to undefined');
    return m[1].trim();
  };
  assert.strictEqual(propOf(EDITOR, '--w'), 'NB_TEXT_BOX.w',
    '(G-W1/src) the typing surface\'s width must come from the lifted box ' +
    'constant, never from a re-typed number');
  assert.strictEqual(propOf(EDITOR, '--h'), 'NB_TEXT_BOX.h',
    '(G-W1/src) the typing surface\'s height must come from the lifted box ' +
    'constant, never from a re-typed number');
  assert.ok(/var bw = NB_TEXT_BOX\.w;/.test(PAINTER) &&
            /var bh = NB_TEXT_BOX\.h;/.test(PAINTER),
    '(G-W1/src) the COMMITTED mark\'s box must come from the same constant. ' +
    'One constant, two consumers — which is exactly what makes the live ' +
    'relational gate the honest one rather than a coincidence');

  // 7. THE CLASS LIST IS LIFTED FROM BOTH PAINTERS AND THE HER-LAYER CLASS
  //    IS ON BOTH — the face's only source, on both sides of the comparison.
  const clsOf = function (src, re, what) {
    const m = src.match(re);
    assert.ok(m && m[1], '(G-W1/src) could not lift ' + what);
    return m[1].split(/\s+/);
  };
  const inputCls = clsOf(EDITOR, /input\.className = '([^']+)'/,
    "the typing surface's class list");
  const markCls = clsOf(PAINTER,
    /btn\.className = '(page-deco page-deco-text[^']*)'/,
    "the committed mark's class list");
  const HER_LAYER = 'caption-hand';
  assert.ok(inputCls.indexOf(HER_LAYER) !== -1,
    '(G-W1/src) the typing surface must carry the her-layer class — it is ' +
    'the ONLY source of its face, lifted: ' + JSON.stringify(inputCls));
  assert.ok(markCls.indexOf(HER_LAYER) !== -1,
    '(G-W1/src) the committed mark must carry the same her-layer class, or ' +
    'the two faces have no shared source and any agreement between them is ' +
    'an accident: ' + JSON.stringify(markCls));
  assert.ok(inputCls.indexOf('page-deco-input') !== -1,
    '(G-W1/src) the typing surface must carry the class the narrowed recipe ' +
    'excludes, or the exclusion in (5) reaches nothing');
})();

// ===========================================================================
// ---- G-17. 26.91-17 (F-15) — THE DAY-SCOPED FLIP, THE DORMANT HALF, ------
// ----        REACHABILITY, AND THE RETAINED FENCE STILL FIRING ------------
// ===========================================================================
//
// HER RULING, 2026-08-09 (26.91-CONTEXT.md A-14, UAT §F-15). Severity
// verbatim: *"quite critical … it is hard to notice if I am reading the date
// I select or not."* Design: remove the arrow when it is the last page of the
// day. Implemented in plan 17; NEVER re-decided here.
//
// THE WRITTEN ANTI-VACUITY AUDIT, four questions, answered before the code.
//
//   (a) CAN IT PASS BEFORE THE WORK? No. Before this plan the flip stepped
//       across day boundaries, so (doors/2) — no forward door at a day's
//       last page — fails at HEAD~1, and the shipped list carried trace
//       pages, so (dormant/1) fails there too. Both are driven RED by
//       restoring the old predicate and the old roster call.
//   (b) CAN IT PASS ONCE THE WORK IS BROKEN? No, and seven mutations say so
//       rather than assert it: restore a cross-day FORWARD neighbour;
//       restore a cross-day BACKWARD neighbour (separately, so the backward
//       half has its own gate rather than riding the forward one); re-pass
//       arrivals to the roster; re-pass arrivals to the builder; disarm the
//       fence inside the packer; empty the fixture so the count pin fires
//       first; and pin the lit-cell handler to one index so the reachability
//       walk breaks.
//   (c) WHAT DEGENERATE INPUT SATISFIES IT? AN EMPTY MODEL, twice over.
//       Every per-index assertion is satisfied by a loop that never runs,
//       and every "no door here" is satisfied by a band that paints no doors
//       anywhere. Closed the same way both times: the spread count is pinned
//       BY VALUE first, the number of indices actually visited is asserted
//       equal to it, and every negative is paired with a positive control in
//       THE SAME RUN that names a door which really does render.
//   (d) SOURCE READ OR EXECUTION? EXECUTION. Every door below is a node the
//       REAL painter appended; every press is that node's own registered
//       click listener, invoked; every landing is read off
//       STATION_NOTEBOOK.view after the handler ran.
//
// WHAT IT CANNOT PROVE, STATED HONESTLY: that an arrow's ABSENCE reads to her
// as *this is the last page of this day*. There is no automated proxy for
// that. The floor this raises is *the arrow is not there to mislead her*;
// the ceiling is her eye, and the backward door in particular is a behaviour
// she has not yet seen — routed to the seal UAT rather than assumed invisible.

(function g17TheDayScopedFlipAndTheDormantHalf() {
  const R = f1Rig();
  const roster = blessingsMonthRoster(R.entries);
  const shipped = R.api.shippedSpreads(R.entries);
  const driven = R.api.spreads(R.entries);

  // ---- (dormant) DORMANT IS NOT BROKEN: BOTH HALVES, IN ONE RUN --------
  //
  // Neither half means anything alone. "No trace page" alone is satisfied by
  // a builder that lost the branch entirely — which would be a DELETION, and
  // A-14 forbids one. "Still mints one" alone is satisfied by a shipped
  // paint that still renders it — which would be the retirement not landing.
  const shippedTrace = shipped.filter(function (s) {
    return s.pages.length && s.pages[0].trace;
  });
  assert.strictEqual(shippedTrace.length, 0,
    '(G-17/dormant/1) THE SHIPPED SPREAD LIST CONTAINS NO TRACE PAGE. Her ' +
    'ruling of 2026-08-09: the arrivals no longer reach the roster or the ' +
    'builder on the shipped call. Got ' + shippedTrace.length);
  const drivenTrace = driven.filter(function (s) {
    return s.pages.length && s.pages[0].trace;
  });
  assert.ok(drivenTrace.length > 0,
    '(G-17/dormant/2) ...AND THE BUILDER STILL MINTS ONE WHEN DRIVEN ' +
    'DIRECTLY WITH ARRIVALS (' + drivenTrace.length + '). This is the half ' +
    'that distinguishes DORMANT from BROKEN: the trace-mint branch is ' +
    'RETAINED WHOLE for Phase 26.95 with a retention notice at its own ' +
    'site, not deleted. Asserted in the SAME RUN as (1) so a deletion ' +
    'cannot masquerade as the retirement');
  assert.ok(shipped.length > 0 && driven.length > shipped.length,
    '(G-17/dormant/3) POSITIVE CONTROL: both lists are non-empty and the ' +
    'driven one is STRICTLY LONGER (' + driven.length + ' vs ' +
    shipped.length + '). Two empty arrays satisfy (1) perfectly, and two ' +
    'IDENTICAL lists would mean the shipped call never changed at all');

  // ---- (dayset) THE SHIPPED DAY-SET IS THE LIT-DAY SET, BY VALUE ------
  //
  // A LIST OF DAYS, never a count — a count of three is satisfied by the
  // wrong three days, and *which days are in her book* is the whole claim.
  const shippedDays = shipped.map(function (s) { return s.day; })
    .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  const litDays = R.entries.map(function (e) { return e.dayLabel; })
    .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  assert.ok(litDays.length > 0,
    '(G-17/dayset/0) POSITIVE CONTROL FIRST: the fixture has lit days at ' +
    'all (' + JSON.stringify(litDays) + '). Two empty arrays are ' +
    'deep-equal, which is the degenerate pass this line closes BEFORE the ' +
    'equality below is believed');
  assert.deepStrictEqual(shippedDays, litDays,
    '(G-17/dayset/1) THE NOTEBOOK\'S DAY-SET EQUALS THE CALENDAR\'S ' +
    'LIT-DAY SET — D-C\'s original equality RESTORED. Both sides DERIVED, ' +
    'neither retyped, so a literal that happens to match today cannot ' +
    'satisfy it. Got ' + JSON.stringify(shippedDays) + ' vs ' +
    JSON.stringify(litDays));
  const drivenDays = driven.map(function (s) { return s.day; })
    .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  assert.notDeepStrictEqual(drivenDays, litDays,
    '(G-17/dayset/2) ...AND THE DRIVEN SET STILL DIFFERS: the promote path ' +
    'is RETAINED and still promotes (' + JSON.stringify(drivenDays) + '). ' +
    'If these ever agree, (1) stops discriminating between the retirement ' +
    'landing and the fixture having no import days at all');
})();

(function g17BothDoorsAreDayScoped() {
  // Driven over a fixture holding ALL THREE shapes the ruling distinguishes:
  // a MULTI-PAGE day (both doors at its middle, one door at each end), a
  // ONE-PAGE day (neither door), and an IMPORT-ONLY day that is present in
  // the items and ABSENT from the spreads.
  const blessingPage = { itemId: 'abc123' };
  // ⚠ THE FIXTURE IS THE WHOLE INSTRUMENT HERE, AND THE FIRST ONE WAS WRONG.
  // Written first as a single three-page day, (2) and (3) below were NOT
  // DISCRIMINATING: at the last page of that day `v + 1 < spreads.length` is
  // already false, so "no forward door" was satisfied by the END OF THE BOOK
  // rather than by the day boundary — and the assertion passed identically
  // with the day-scoping REMOVED. Found by driving M1 (restore a cross-day
  // forward neighbour) and watching it redden a different assertion; the
  // instrument was corrected rather than the claim weakened.
  //
  // The book therefore holds a day BEFORE and a day AFTER the multi-page
  // day, so every "no door" below is a claim about the DAY BOUNDARY with a
  // real array neighbour sitting on the other side of it:
  //     index 0        08/06  one-page day, at the book's newest end
  //     indices 1,2,3  08/05  the three-page day
  //     index 4        08/04  one-page day, at the book's oldest end
  const book = [
    { day: '08/06/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/05/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/05/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/05/2026', pages: [blessingPage], monthKey: '2026-08' },
    { day: '08/04/2026', pages: [blessingPage], monthKey: '2026-08' }
  ];
  function doorsAt(spreads, view) {
    const r = paintSpread({ spreads: spreads, view: view });
    return nbControlsIn(r.nodes).map(function (n) { return n.textContent; })
      .filter(function (t) { return t === '‹' || t === '›'; })
      .sort();
  }

  // ---- (1) THE POSITIVE CONTROL FIRST: BOTH DOORS EXIST AT ALL --------
  assert.deepStrictEqual(doorsAt(book, 2), ['‹', '›'],
    '(G-17/doors/1) POSITIVE CONTROL, ASSERTED FIRST: at a WITHIN-DAY ' +
    'index of the three-page day, BOTH doors render. Every "no door" ' +
    'assertion below is satisfied by a band that paints no doors anywhere, ' +
    'so this is what makes them measurements rather than absences');

  // ---- (2) THE FORWARD DOOR IS ABSENT AT A DAY'S LAST PAGE ------------
  assert.deepStrictEqual(doorsAt(book, 3), ['‹'],
    '(G-17/doors/2) HER RULING, DRIVEN: at the LAST PAGE OF A DAY the ' +
    'FORWARD door does not render — *remove the arrow when it is the last ' +
    'page of the day*. INDEX 3 IS NOT THE END OF THE BOOK: 08/04\'s spread ' +
    'sits at index 4, so this is the DAY boundary and not the array\'s. ' +
    'Written first against a fixture where the two coincided, where it ' +
    'passed with the day-scoping removed — the mutation that found that is ' +
    'M1, and the fixture was corrected rather than the claim weakened. The ' +
    'BACKWARD door still renders, which is what makes this a scoped ' +
    'predicate rather than a band that stopped painting');

  // ---- (3) THE BACKWARD DOOR MIRRORS IT, AT THE DAY'S FIRST PAGE ------
  assert.deepStrictEqual(doorsAt(book, 1), ['›'],
    '(G-17/doors/3) AND THE BACKWARD DOOR MIRRORS IT at the day\'s FIRST ' +
    'page. INDEX 1 IS NOT THE START OF THE BOOK — 08/06\'s spread sits at ' +
    'index 0 — so this too is the DAY boundary rather than the array\'s. ' +
    'ASSERTED SEPARATELY AND DRIVEN BY ITS OWN MUTATION (M2): her ruling ' +
    'names *the arrow*, singular, and the forward door is the one she ' +
    'pressed — scoping only that one would leave this door able to walk ' +
    'her onto a different date, the same defect facing the other way. The ' +
    'symmetric reading is taken deliberately and goes to the seal UAT');

  // ---- (4) A ONE-PAGE DAY RENDERS NEITHER DOOR ------------------------
  assert.deepStrictEqual(doorsAt(book, 0), [],
    '(G-17/doors/4) A DAY HOLDING ONE PAGE RENDERS NEITHER DOOR, even ' +
    'though another day\'s spread sits right beside it in the array. No ' +
    'disabled control and no end-of-book copy: running out of arrows IS ' +
    'the signal, and it is the same signal the ends of the book have ' +
    'always given');
  assert.deepStrictEqual(doorsAt(book, 4), [],
    '(G-17/doors/4) ...and the same at the one-page day on the OTHER side ' +
    'of the multi-page day. Driven at BOTH ends because a predicate tested ' +
    'on one side is a constant');

  // ---- (5) THE IMPORT-ONLY DAY: IN THE ITEMS, ABSENT FROM THE SPREADS --
  //
  // Over the REAL library fixture rather than a hand-built array, because
  // *the day still exists and simply is not a page* is a claim about the
  // model, not about a literal.
  const R = f1Rig();
  const impLabel = atLabel(ZO.zero_overlap._import_only_day_with_many);
  const packed = packArrivalDays(R.items, [], guard)
    .filter(function (a) { return a.dayLabel === impLabel; });
  assert.ok(packed.length > 0,
    '(G-17/doors/5) POSITIVE CONTROL: the import-only day is STILL THERE ' +
    'in the items and still survives the fence (' + packed.length + ' ' +
    'arrivals). Her library did not lose anything — the page left the ' +
    'notebook, the material did not, and Phase 26.95 inherits it');
  const shipped = R.api.shippedSpreads(R.entries);
  assert.strictEqual(shipped.map(function (s) { return s.day; })
    .indexOf(impLabel), -1,
    '(G-17/doors/5) ...AND IT IS ABSENT FROM THE SHIPPED SPREAD LIST. The ' +
    'two halves together are the retirement: present in the library, not a ' +
    'page in the book');
})();

(function g17EverySpreadIsReachableFromAColdOpen() {
  // THE CLAIM THIS GROUP EXISTS FOR: a day-scoped flip that stranded a page
  // would be the SAME DEFECT ONE STEP TO THE LEFT. So reachability is
  // DRIVEN, never argued — every spread the notebook can show is reached
  // from a cold open by tapping a LIT calendar cell and then pressing the
  // within-day door N times.
  const R = f1Rig();
  const roster = blessingsMonthRoster(R.entries);
  const shipped = R.api.shippedSpreads(R.entries);

  // ---- (0) THE COUNT, PINNED BY VALUE AND ASSERTED FIRST --------------
  //
  // FIRST, on purpose: every per-index assertion below is satisfied by a
  // walk that never runs. Same hole `p === n` leaves in the sweep, closed
  // the same way.
  assert.strictEqual(shipped.length, 3,
    '(G-17/reach/0) THE SHIPPED SPREAD COUNT IS EXACTLY 3, PINNED BY ' +
    'VALUE: 07/30 holds two blessings, 06/03 holds one. Asserted BEFORE ' +
    'the walk, because a walk over an empty book reaches every one of its ' +
    'zero spreads. Got ' + shipped.length);

  const reached = {};
  let taps = 0;
  let presses = 0;
  // The lit days, taken from the MODEL rather than from a literal, and each
  // opened the way she opens one: a cold view 0, then the month, then the
  // cell's own click handler.
  const litDays = shipped.map(function (s) { return s.day; })
    .filter(function (d, i, a) { return a.indexOf(d) === i; });
  litDays.forEach(function (dayLabel) {
    const monthKey = shipped.filter(function (s) {
      return s.day === dayLabel;
    })[0].monthKey;
    const dayNum = Number(dayLabel.split('/')[1]);
    // COLD OPEN: the notebook opens at spread 0 on every deliberate tap.
    R.NB.view = 0;
    R.NB.month = monthKey;
    const nodes = R.api.paint(R.entries, roster);
    const cell = f1DayCells(nodes).filter(function (n) {
      return n.tag === 'button' && String(n.text) === String(dayNum);
    });
    assert.strictEqual(cell.length, 1,
      '(G-17/reach/1) POSITIVE CONTROL: the real calendar painted EXACTLY ' +
      'ONE tappable cell for ' + dayLabel + ' — a lit day is a button. ' +
      'Got ' + cell.length);
    cell[0].__on.click[0]();
    taps++;
    reached[R.NB.view] = true;
    // NOW WALK THE DAY with the within-day door, pressing the node the
    // painter appended rather than setting the view by hand. A walk that
    // assigned the index would prove nothing about the door.
    let guardStop = 0;
    for (;;) {
      const ns = R.api.paint(R.entries, roster);
      const fwd = nbControlsIn(ns).filter(function (n) {
        return n.textContent === '›';
      });
      if (!fwd.length) { break; }
      const before = R.NB.view;
      fwd[0].__on.click[0]();
      presses++;
      assert.strictEqual(shipped[R.NB.view].day, dayLabel,
        '(G-17/reach/2) A PRESS CANNOT CHANGE THE DATE: from index ' +
        before + ' on ' + dayLabel + ' the forward door landed on ' +
        shipped[R.NB.view].day + '. This is the promise F-1 made and the ' +
        'arrow silently broke — *pick a date on the left, read it on the ' +
        'right* — now true on EVERY press');
      reached[R.NB.view] = true;
      guardStop++;
      assert.ok(guardStop <= shipped.length + 1,
        '(G-17/reach/2) the walk terminates: a door that never stops ' +
        'rendering is a cycle, not a book');
    }
  });

  assert.strictEqual(taps, litDays.length,
    '(G-17/reach/3) EVERY LIT DAY WAS ACTUALLY TAPPED (' + taps + ' of ' +
    litDays.length + '), so this walk cannot pass by never running');
  assert.ok(presses > 0,
    '(G-17/reach/3) ...AND AT LEAST ONE DOOR WAS ACTUALLY PRESSED (' +
    presses + '). Without this the walk is satisfied by three cold opens ' +
    'and no flip at all, which would prove the calendar works and say ' +
    'nothing whatever about the door');
  assert.strictEqual(Object.keys(reached).length, shipped.length,
    '(G-17/reach/4) EVERY SPREAD IN THE SHIPPED LIST IS REACHABLE FROM A ' +
    'COLD OPEN — ' + Object.keys(reached).length + ' distinct indices ' +
    'visited of ' + shipped.length + ', asserted against the BY-VALUE ' +
    'count pinned before the walk. NOTHING BECAME UNREACHABLE. A ' +
    'day-scoped flip that stranded a page would be the F-6 shape one step ' +
    'to the left, in the phase built to fix F-6. Reached: ' +
    JSON.stringify(Object.keys(reached).sort()));
  assert.deepStrictEqual(Object.keys(reached).map(Number).sort(
    function (a, b) { return a - b; }),
    shipped.map(function (s, i) { return i; }),
    '(G-17/reach/4) ...and they are the indices 0..n-1 BY VALUE, not ' +
    'merely n of them. A walk that visited index 2 three times has the ' +
    'right count and the wrong coverage');
})();

(function g17TheRetainedFenceStillFires() {
  // THE FENCE GUARDS NO LIVE SURFACE NOW. That is exactly why this group
  // exists: a fence nobody can redden is not a fence, and a retention
  // nobody drove is not a retention. A-14 records the law-5 folder fence as
  // RETAINED and ARMED for Phase 26.95, and requires plan 17 to prove it
  // still FIRES by mutation after the render path is cut.
  const L = f1Rig();
  const impLabel = atLabel(ZO.zero_overlap._import_only_day_with_many);

  // ---- (1) ONE ITEM FLIPPED BETWEEN TWO OTHERWISE IDENTICAL CALLS -----
  const before = packArrivalDays(L.items, [], guard)
    .filter(function (a) { return a.dayLabel === impLabel; });
  assert.ok(before.length > 0,
    '(G-17/fence/1) POSITIVE CONTROL: the day packs arrivals at all ' +
    'before the flip (' + before.length + ')');
  const beforeSentence = composeArrivalTrace(before);
  assert.ok(beforeSentence.length > 0,
    '(G-17/fence/1) ...and composes a REAL sentence, so the comparison ' +
    'below is between two strings rather than between two empty ones');
  const flipped = [];
  Object.keys(L.items).forEach(function (id) {
    const it = L.items[id];
    if (typeof it.imported_ms !== 'number') { return; }
    if (blessingDayLabel(it.imported_ms) !== impLabel) { return; }
    if (guard(it, []) !== null) { return; }
    it.state = 'never_show';
    flipped.push(id);
  });
  assert.ok(flipped.length > 0,
    '(G-17/fence/1) POSITIVE CONTROL: the flip really did change items (' +
    flipped.length + '). A flip that flipped nothing probes nothing');
  const after = packArrivalDays(L.items, [], guard)
    .filter(function (a) { return a.dayLabel === impLabel; });
  assert.strictEqual(after.length, 0,
    '(G-17/fence/1) THE FENCE STILL FIRES WITH NO SURFACE LEFT TO GUARD: ' +
    'ONE item flipped to `never_show` between two OTHERWISE IDENTICAL ' +
    'calls changes the packed output — every arrival of that day is ' +
    'dropped. Driven, never read: the packer is off the render path and ' +
    'RETAINED for Phase 26.95, and this is the assertion that says so. ' +
    'Got ' + after.length);

  // ---- (2) FAIL-CLOSED IS A DIFFERENT OUTCOME, RECORDED SEPARATELY ----
  const N = f1Rig();
  assert.deepStrictEqual(packArrivalDays(N.items, [], undefined), [],
    '(G-17/fence/2) FAIL-CLOSED, STATED SEPARATELY FROM FAIL-FENCED: with ' +
    'the guard passed as `undefined` the packer yields EMPTY. Recording ' +
    'the two as one outcome would hide which of them a regression broke');
  assert.ok(packArrivalDays(N.items, [], guard).length > 0,
    '(G-17/fence/2) POSITIVE CONTROL: ...and with a REAL guard the same ' +
    'store packs a non-empty set, so the empty result above is the guard ' +
    'contract firing rather than an empty fixture');

  // ---- (3) THE GUARD CONTRACT IS UNCHANGED, UNSOFTENED, UNNARROWED ----
  const packer = stripComments(extractFn(appSrc, 'packArrivalDays'));
  assert.ok(packer.length > 0,
    '(G-17/fence/3) SCAN WINDOW NON-EMPTY (' + packer.length + ' bytes). ' +
    'An empty region satisfies every check below trivially — a region gate ' +
    'armed at a function that is not there must REFUSE, never pass');
  assert.ok(/typeof guard !== 'function'/.test(packer),
    '(G-17/fence/3) the fail-closed FIRST disjunct is intact — the ' +
    'contract copied verbatim from packBlessingsToc, and A-14 forbids ' +
    'shortening, softening or narrowing it');
  assert.ok(/continue;/.test(packer),
    '(G-17/fence/3) ...and the bare `continue` is intact');
})();

console.log('test_blessings_notebook OK (pager newest-first ms-only, ' +
  'calendar lit/unlit + populated-month roster, law-3 model shape, ' +
  'decoration determinism, sentinel-retired fence drop, day roster + ' +
  'door logic + day-set guard re-resolve, F5 why fills the page + clamps, ' +
  'guarded arrival packer + PROMOTED day roster vs the frozen D-C oracle, ' +
  'import-day reachability on the page flip, zero-overlap fixture ' +
  'disjointness + G-B5 key-set equality + the generalization invariant)');

// ---- (G-18) 26.91-18 (F-17): TWO SYMPTOMS, ONE GUARD, AND THE ARMED HOOK --
//
// F-17 IS NOT A 26.91 REGRESSION. `attachPageDrag` carries a shipped 26.9-07
// guard that returns from the mark's pointerdown handler while the pen is
// armed, so that a stroke begun over a mark DRAWS instead of moving it. The
// pen is a TOGGLE, not a one-shot, so it stays armed after she draws and
// every later gesture belongs to it.
//
// THE TWO SYMPTOMS ARE ONE REPAIR, AND THIS HEADER SAYS SO SO THAT A LATER
// READER CANNOT FIX ONE AND BELIEVE THEY ARE DONE. The guard fires on
// POINTERDOWN, and 26.9-05's *touching a mark SELECTS it* assignment sits
// DOWNSTREAM of that return — so one guard kills selection AND drag. A fix
// aimed only at dragging would leave selection broken and would look like a
// fix.
//
// THE GUARD IS NOT WHAT CHANGES. Narrowing it to admit a selection would
// resurrect the exact defect it was written for. What this plan changed is
// that the armed state became impossible to miss, at the surface her hand is
// on. This group pins the guard's behaviour UNCHANGED, and pins the new hook
// beside it.
//
// THE DISARMED HALF IS NOT DECORATION. Without it, a rig that does nothing at
// all satisfies both armed claims.
//
// DISPOSITION 26.91-22: REWRITTEN, nothing deleted. THIS GROUP IS THE THIRD
// GATE THE TWO-CURSOR CHANGE HAD TO PASS, and plan 22 named only two — the
// armed-tool `9o` group and `(G-18-live)`. It was found by DRIVING task 1
// rather than by reading the plan: it pinned the disarm literal BY VALUE as
// a ONE-argument `remove()` and pinned the armed body state as a
// ONE-element array, so it went red the moment the per-tool hooks landed.
// Both pins are rewritten to the new literals in the same commit that
// changed them (the wave-20 `(9n)` posture), never relaxed to a substring
// search — and `remove('nb-armed'` is a live substring of the widened call,
// so relaxing here would have been silent. Everything the guard half
// asserts is UNCHANGED.
(function () {
  const armedSrc = bodyOf('nbSyncArmedClass');
  // the class name is LIFTED from the shipped hook, never re-typed here — a
  // harness that retyped it would agree with itself and would keep passing
  // after a rename that broke every rule keyed on it.
  const ARMED_CLS = (armedSrc.match(
    /toggle\('([a-z-]+)', !!\(NB_PEN \|\| NB_WRITE\)\)/) || [])[1];
  // 26.91-22: AND THE TWO PER-TOOL HOOKS, LIFTED THE SAME WAY. A-15 ruling 2
  // gave each armed tool its own cursor, so the shared hook is no longer the
  // whole state. These two are lifted by the FLAG each is derived from, not
  // by name, so a rename in app.js reddens here instead of passing.
  const PEN_CLS = (armedSrc.match(/toggle\('([a-z-]+)', !!NB_PEN\)/) || [])[1];
  const WRITE_CLS = (armedSrc.match(
    /toggle\('([a-z-]+)', !!NB_WRITE\)/) || [])[1];
  assert.ok(ARMED_CLS,
    '(G-18) the armed body class is LIFTED from nbSyncArmedClass — if this ' +
    'lift fails the hook was renamed or restructured, and every assertion ' +
    'below would be measuring a name this file invented');
  assert.ok(PEN_CLS && WRITE_CLS && PEN_CLS !== WRITE_CLS &&
    PEN_CLS !== ARMED_CLS && WRITE_CLS !== ARMED_CLS,
    '(G-18) AND THE TWO PER-TOOL HOOKS LIFT, AND ALL THREE ARE DISTINCT. ' +
    'Three names that collapsed to two would make the per-tool cursor rules ' +
    'unreachable while every assertion keyed on "a hook exists" stayed ' +
    'green. Lifted: ' + JSON.stringify([ARMED_CLS, PEN_CLS, WRITE_CLS]));

  // ---- (a) THE ONE GUARD, DRIVEN OVER AN EXECUTED POINTERDOWN ------------
  function driveMark(penArmed) {
    const rig = penRigForGuard(penArmed);
    return rig;
  }

  // A minimal rig around the REAL attachPageDrag, varying ONE input.
  function penRigForGuard(penArmed) {
    const src = NB_HELPERS + '\n' + NB_MARK_DECLS +
      extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      'var NB_PEN = ' + JSON.stringify(!!penArmed) + ';\n' +
      'var NB_PEN_GROUP = null; var NB_WRITE = false;\n' +
      extractFn(appSrc, 'attachPageDrag');
    const posted = [];
    const bring = new Function('decoDay', 'NB_DAY',
      extractFn(appSrc, 'bringDecoToFront') + '\nreturn bringDecoToFront;')(
      function () { return { reset: false, items: [] }; }, '08/04/2026');
    // eslint-disable-next-line no-new-func
    const api = new Function(
      'NBDESIGN', '$', 'getComputedStyle', 'NB_TEXT_BOX', 'NB_BOUNDS',
      'NB_DRAG_THRESHOLD', 'postDecorations', 'NB_DAY', 'openHandTextEditor',
      'dismissTray', 'NB_STICKERS', 'NB_STICKER_H', 'NB_IMG_BOX',
      'NB_SEL', 'bringDecoToFront', 'NB_REPAINT', 'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn { attachPageDrag: attachPageDrag,' +
      ' readSelection: function () { return NB_SEL; } };')(
      true,
      function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      NB_SRC_CONSTS.NB_TEXT_BOX, NB_SRC_CONSTS.NB_BOUNDS, 3,
      function (d) { posted.push(d); }, '08/04/2026',
      function () {}, function () {},
      NB_SRC_CONSTS.NB_STICKERS, NB_SRC_CONSTS.NB_STICKER_H,
      NB_SRC_CONSTS.NB_IMG_BOX,
      null, bring, function () {}, function () {},
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    const handlers = {};
    const el = {
      style: { setProperty: function () {} },
      addEventListener: function (t, fn) {
        (handlers[t] = handlers[t] || []).push(fn);
      },
      removeEventListener: function () {},
      setPointerCapture: function () {}, releasePointerCapture: function () {},
      fire: function (t, ev) {
        (handlers[t] || []).slice().forEach(function (fn) { fn(ev); });
      }
    };
    const rec = { page: 'abc', kind: 'text', x: 200, y: 100, text: '' };
    api.attachPageDrag(el, rec);
    el.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    el.fire('pointermove', { clientX: 540, clientY: 500 });
    el.fire('pointerup', {});
    return { selection: api.readSelection(), x: rec.x };
  }

  const armed = driveMark(true);
  const off = driveMark(false);

  assert.strictEqual(armed.selection, null,
    '(G-18) PEN ARMED — SYMPTOM 1: touching a mark does NOT select it. This ' +
    'is the third symptom she reported ("the selectbox of the stamp is ' +
    'disabled") and it is the SAME guard as the drag, not a second bug');
  assert.strictEqual(armed.x, 200,
    '(G-18) PEN ARMED — SYMPTOM 2: the mark\'s stored position does NOT ' +
    'move. Same pointerdown return, one line above the selection');
  assert.notStrictEqual(off.selection, null,
    '(G-18) PEN DISARMED — POSITIVE CONTROL: selection DOES change. ' +
    'Without this half, a rig that did nothing at all would satisfy both ' +
    'assertions above');
  assert.strictEqual(off.x, 240,
    '(G-18) PEN DISARMED — POSITIVE CONTROL: the position DOES change ' +
    '(200 -> 240 at --k 1, well past the shipped 3px threshold)');

  // ---- (b) THE ARMED HOOK, SET FROM BOTH SETTERS AND CLEARED AT ALL THREE
  const penSrc = bodyOf('setNotebookPen');
  const writeSrc = bodyOf('setNotebookWrite');
  assert.ok(/nbSyncArmedClass\(\)/.test(penSrc),
    '(G-18) the pen\'s setter drives the armed hook');
  assert.ok(/nbSyncArmedClass\(\)/.test(writeSrc),
    '(G-18) AND SO DOES `write`\'s. BOTH are required: a hook set in one ' +
    'setter and hoped for in the other holds in whichever direction ' +
    'somebody happened to drive it and leaks in the other — the exact ' +
    'asymmetry the shipped mutual-exclusion lines exist to refuse');
  assert.ok(new RegExp('toggle\\(\'' + ARMED_CLS +
    '\', !!\\(NB_PEN \\|\\| NB_WRITE\\)\\)').test(armedSrc),
    '(G-18) and it is driven by the DISJUNCTION of both flags, so the ' +
    'cursor can never disagree with the chip');
  // 26.91-22: AND EACH PER-TOOL HOOK IS DRIVEN BY ITS OWN FLAG ALONE. The
  // shared hook stays the idiom (and the keyword fallback in tokens.css
  // hangs off it); these two are the instances. A per-tool hook derived
  // from the disjunction would put BOTH cursors on the body at once and the
  // last rule in source order would silently win for both tools.
  assert.ok(new RegExp('toggle\\(\'' + PEN_CLS + '\', !!NB_PEN\\)')
    .test(armedSrc),
    '(G-18) the pen\'s own hook is derived from NB_PEN ALONE');
  assert.ok(new RegExp('toggle\\(\'' + WRITE_CLS + '\', !!NB_WRITE\\)')
    .test(armedSrc),
    '(G-18) and `write`\'s from NB_WRITE ALONE');

  // ALL THREE SHIPPED DISARM PATHS. A hook that outlives its mode is the
  // representable-but-unreachable state the shipped comment already names.
  const DISARM_SITES = [
    ['setNotebookDesign', bodyOf('setNotebookDesign'),
      'leaving the notebook\'s design mode'],
    ['renderNotebookStation', bodyOf('renderNotebookStation'),
      'raising the station'],
    ['viewPop', stripComments(appSrc).slice(
      stripComments(appSrc).indexOf('popped.view === \'station\' && NBDESIGN'),
      stripComments(appSrc).indexOf('popped.view === \'station\' && NBDESIGN')
        + 320),
      'popping the station view']
  ];
  DISARM_SITES.forEach(function (site) {
    assert.ok(site[1].length > 0,
      '(G-18) the disarm region for ' + site[0] + ' is NON-EMPTY — a ' +
      'region gate armed at a site that does not exist passes forever');
    // 26.91-22: REWRITTEN TO THE NEW LITERAL, NEVER RELAXED TO A SUBSTRING
    // SEARCH. This pin went red the moment the per-tool hooks landed, which
    // is a shipped gate doing its job. Admitting one's own change by
    // weakening a by-value pin to `remove('nb-armed'` — which the widened
    // call still contains — is the move this phase forbids, and it is the
    // wave-20 `(9n)` posture applied one file over. All THREE hooks are
    // named, in ONE call per site, and the names are LIFTED.
    assert.ok(new RegExp('classList\\.remove\\(\'' + ARMED_CLS + '\', \'' +
      PEN_CLS + '\', \'' + WRITE_CLS + '\'\\)').test(site[1]),
      '(G-18) DISARM PATH: ' + site[2] + ' (' + site[0] + ') must clear ALL ' +
      'THREE armed classes in ONE call. It inherits the obligation the mode ' +
      'class already carries at the same three sites — a stale armed hook ' +
      'on the room screen is a drawing cursor stranded over a scene with no ' +
      'page in it, and a per-tool hook that outlives its mode strands a ' +
      'DRAWN one. Three of these sites do not derive the hooks: the pop at ' +
      'the station view never drops NB_PEN/NB_WRITE at all (its own shipped ' +
      'comment says so), so a derived clear there would leave them ON');
  });

  // ---- (b2) THE FOUR-SITE OBLIGATION, PINNED BY COUNT --------------------
  //
  // 26.91-22. The three sites above are the LITERAL-removal paths; the
  // fourth is the derivation in nbSyncArmedClass itself. Each hook must
  // occur at the SAME number of sites, so a later fifth disarm path that
  // forgets the per-tool hooks fails on the equality rather than shipping a
  // stale drawn cursor.
  //
  // COUNTED OVER COMMENT-STRIPPED SOURCE, NEVER THE RAW FILE. This repo's
  // house style writes a long comment block at every change site and those
  // blocks name the hooks in prose, so a raw count is self-invalidating.
  // AND COUNTED AS QUOTED LITERALS: `nb-armed` is a strict prefix of both
  // per-tool names, so a bare substring count would read the shared hook
  // three times per site and the equality would be arithmetic about nothing.
  (function () {
    const win = stripComments(appSrc);
    /* ⚠ 26.91-35: THIS FLOOR WAS RE-KEYED, AND THE REASON IS THAT ITS OLD
       FORM WAS ARITHMETICALLY DOOMED IN THIS REPO.

       It read `win.length > appSrc.length * 0.5`. MEASURED at the head of
       wave 35, before a byte of this wave's source moved: raw 887,405,
       stripped 444,134 — a ratio of 0.50049 and a headroom of **431
       characters**. This file's house style writes a multi-hundred-character
       comment block at EVERY change site (this comment is one), so app.js's
       comment share rises monotonically and the floor was ~one change site
       from tripping. Wave 35's two source comments consumed it and the whole
       suite went down on a control that has nothing to say about the counts
       it guards.

       WHAT THE CONTROL IS ACTUALLY FOR, stated in its own old message: that
       `stripComments` did not return nothing, so the counts below are not
       arithmetic over an empty window. A RATIO OF THE RAW FILE IS A PROXY FOR
       THAT, and it is a proxy coupled to comment VOLUME, which is unrelated
       to whether stripping worked.

       RE-KEYED TO THE THING ITSELF, AND STRICTLY STRONGER — not weakened:
         (1) an ABSOLUTE floor, so a collapsed window fails on size; and
         (2) the window must still contain the very function whose sites are
             counted below, by name. A `stripComments` that ate code rather
             than comments loses that landmark, which the old ratio could not
             see at all: a stripper that deleted every FUNCTION BODY and kept
             every comment passed the old form and fails this one.
       Both are independent of how many comments the file carries. Driven RED
       under a planted broken stripper before this form was believed. */
    assert.ok(win.length > 100000,
      '(G-18) the comment-stripped window is ' + win.length + ' chars ' +
      '(raw ' + appSrc.length + '); the absolute floor is 100,000. A ' +
      'collapsed window makes every count below arithmetic over nothing');
    assert.ok(win.indexOf('function nbSyncArmedClass(') !== -1,
      '(G-18) the comment-stripped window no longer contains ' +
      '`function nbSyncArmedClass(` — the derivation whose sites the counts ' +
      'below are about. A stripper that ate CODE rather than comments ' +
      'leaves a large window and a meaningless one, which is exactly what a ' +
      'size-only floor cannot see');
    const at = function (cls) {
      return (win.match(new RegExp('\'' + cls + '\'', 'g')) || []).length;
    };
    const counts = [at(ARMED_CLS), at(PEN_CLS), at(WRITE_CLS)];
    assert.ok(counts[0] >= 4,
      '(G-18) the shared hook occurs at ' + counts[0] + ' sites in ' +
      'comment-stripped app.js — the floor is 4 (one derivation plus the ' +
      'three literal-removal disarm paths). A floor of zero would let the ' +
      'equality below pass on three hooks that had all vanished together');
    assert.strictEqual(counts[1], counts[0],
      '(G-18) the pen\'s hook occurs at ' + counts[1] + ' sites against ' +
      'the shared hook\'s ' + counts[0] + '. Every site that knows about ' +
      'one must know about all three');
    assert.strictEqual(counts[2], counts[0],
      '(G-18) and `write`\'s at ' + counts[2] + ' against ' + counts[0] +
      '. A disarm path that clears the shared hook and leaves a per-tool ' +
      'one behind strands a DRAWN cursor on the room screen — worse than ' +
      'the crosshair this obligation was first written for');
  })();

  // ---- (c) DRIVEN: arming sets it, disarming leaves NOTHING behind -------
  const r = penRig();
  assert.deepStrictEqual(r.api.bodyClasses(), [],
    '(G-18) a fresh rig carries no armed class');
  r.api.setNotebookPen(true);
  assert.deepStrictEqual(r.api.bodyClasses(), [ARMED_CLS, PEN_CLS],
    '(G-18) DRIVEN: arming the pen puts the SHARED armed class AND the ' +
    'pen\'s own on the body — through the SHIPPED setter, not through a ' +
    'class this test planted. Both are required: the shared one is the ' +
    'idiom and carries the keyword fallback, the pen\'s own is what makes ' +
    'its cursor an inkpen rather than `write`\'s pencil');
  r.api.setNotebookPen(false);
  assert.deepStrictEqual(r.api.bodyClasses(), [],
    '(G-18) DRIVEN: disarming takes it off again, leaving NOTHING. A ' +
    'disarmed body carrying an armed class is a failure, not an oversight');

  // BOTH TOOLS REACH THE SAME STATE — driven through both real setters.
  // writeRig returns the api DIRECTLY (penRig wraps it in `.api`); the two
  // rigs differ and this comment is here so the next reader does not "fix"
  // one to match the other.
  const w = writeRig();
  w.setNotebookPen(true);
  const penState = w.bodyClasses();
  w.setNotebookPen(false);
  w.setNotebookWrite(true);
  const writeState = w.bodyClasses();
  // 26.91-22: REWRITTEN, AND THE SURVIVING HALF IS THE ONE THAT MATTERS.
  // The claim was *both tools reach the SAME state*; A-15 ruling 2 retires
  // that half — her words at S5 are that pen and `write` should NOT look
  // alike. What survives, and is now asserted explicitly, is that both
  // reach the SHARED state, which is the idiom and the fallback; each then
  // adds its OWN; and the two therefore DIFFER. Asserting the difference is
  // what stops a "fix" that quietly gives both tools one cursor again.
  assert.deepStrictEqual(penState, [ARMED_CLS, PEN_CLS],
    '(G-18) the pen reaches the shared armed state AND its own');
  assert.deepStrictEqual(writeState, [ARMED_CLS, WRITE_CLS],
    '(G-18) and `write` reaches the SAME SHARED one and its OWN — one ' +
    'idiom, two instances, and the idiom is the half that survives A-15 ' +
    'ruling 2. A tool that reached only its own hook would lose the ' +
    'keyword fallback the shared rule carries and would show the default ' +
    'arrow wherever the image cannot load');
  assert.notDeepStrictEqual(penState, writeState,
    '(G-18) AND THE TWO STATES DIFFER — her ruling at S5, verbatim: "i ' +
    'need pen and write\'s curor should look different, like pen is a ' +
    'inkpen and write is a pencil." Two identical body states cannot carry ' +
    'two different cursors, so this is the assertion that stops the shared ' +
    'cursor coming back');
  w.setNotebookWrite(false);
  assert.deepStrictEqual(w.bodyClasses(), [],
    '(G-18) and `write` cleans up after itself too');
})();

// ---- G-22-art. 26.91-21 (F-20) — THE TWO CURSOR SPRITES, JUDGED BY -------
// ----            READING THEIR REAL PIXELS, against a palette LIFTED from --
// ----            tools/SPRITES.md rather than hand-typed here -------------
//
// F-20 is the owner's: "maybe you should change the cursor to a pen shape
// pixel style cursor", refined at S5 to "pen is a inkpen and write is a
// pencil". This group does not judge the DRAWING — that is hers, at plan
// 21's blocking checkpoint. It judges the one thing a machine can: that the
// two sprites are drawn in colours the register actually approves.
//
// WHY THE ALLOWED SET IS LIFTED AND NEVER TYPED: a hand-typed palette in a
// test is the harness agreeing with itself. `tools/SPRITES.md` §2 (11 rows)
// plus §8.2's two approved additions ARE the register; a change there must
// move this gate, not leave it green against a stale copy of the truth.
//
// WHY A SUBSET CHECK OVER ALL 13 IS NOT ENOUGH: §2 constrains three of the
// thirteen BY ROLE, and those constraints are part of the register. A cursor
// drawn entirely in destructive red is inside the 13 and passes a plain
// subset test. So the three role-constrained hexes carry their own ban.
//
// ZERO-DEP, AND STAYS THAT WAY (law 8): node's built-in `zlib` inflates the
// IDAT and the five standard PNG filter types un-filter it. No package is
// installed, no package.json is created, no node_modules appears.
(function () {
  const zlib = require('zlib');
  const REPO = path.join(__dirname, '..');

  // =====================================================================
  // (1) THE LIFT — the 13 approved hexes, read out of the register
  // =====================================================================
  const SPRITES_MD = path.join(REPO, 'tools', 'SPRITES.md');
  assert.ok(fs.existsSync(SPRITES_MD),
    '(G-22-art) tools/SPRITES.md must exist — it IS the palette register ' +
    'and this gate has no allowed set without it');
  const spritesSrc = fs.readFileSync(SPRITES_MD, 'utf8');

  function sectionBetween(startRe, endRe, label) {
    const s = spritesSrc.search(startRe);
    assert.ok(s !== -1,
      '(G-22-art) LIFT: could not find the start of ' + label + ' in ' +
      'tools/SPRITES.md. A lift that silently finds nothing yields an ' +
      'EMPTY allowed set, which fails open — so this is a hard failure');
    const rest = spritesSrc.slice(s);
    const e = rest.slice(1).search(endRe);
    assert.ok(e !== -1,
      '(G-22-art) LIFT: could not find the end of ' + label);
    return rest.slice(0, e + 1);
  }

  // A table row's FIRST cell. A row whose first cell is struck through
  // (`~~`) is a REJECTED entry and is skipped — that is exactly how §8.2
  // records `#4a3a2c`, and reading it as approved would be the whole
  // failure this gate exists to prevent.
  function hexesFromTable(block, label) {
    const out = [];
    for (const line of block.split('\n')) {
      if (line[0] !== '|') continue;
      const first = line.split('|')[1];
      if (first === undefined) continue;
      if (first.indexOf('~~') !== -1) continue;      // struck = rejected
      const m = /#([0-9a-fA-F]{6})\b/.exec(first);
      if (m) out.push('#' + m[1].toLowerCase());
    }
    assert.ok(out.length > 0,
      '(G-22-art) LIFT: ' + label + ' yielded ZERO hexes. An empty lift is ' +
      'not a small problem — every colour ban below would pass vacuously');
    return out;
  }

  const SEC2 = sectionBetween(/^## 2\. The palette/m, /^## 3\./m, '§2');
  const SEC82 = sectionBetween(/^### 8\.2 The added hexes/m, /^### 8\.3/m, '§8.2');

  // 26.9995-05: §8.2 now records THREE things — the two 2026-08-06
  // additions (with their struck rejection), the eight desk-scene hexes of
  // Ruling 1 (2026-08-25), and 26.9995-02's four DECLINED wood tones. The
  // eight are approved "for the desk scene and the new sprites only" —
  // §8.2's own scoping sentence — and a declined row is not an approval at
  // all. THIS gate's two subjects are notebook implements, so it lifts
  // only the block ABOVE the 2026-08-25 material: reading the desk-scene
  // eight into a notebook sprite's allowed set would widen a palette she
  // scoped, and reading a declined row as approved is the exact defect the
  // lift guards. FAIL-CLOSED: if the 2026-08-25 heading is ever reworded,
  // the cut finds nothing, the WHOLE section is lifted, and the BY-VALUE
  // count pin below goes red rather than quietly narrowing.
  const CUT_82 = SEC82.indexOf('**✅ APPROVED 2026-08-25');
  const SEC82_ADDITIONS = CUT_82 === -1 ? SEC82 : SEC82.slice(0, CUT_82);

  const LIFTED_2 = hexesFromTable(SEC2, '§2 (the token-sheet palette)');
  const LIFTED_82 = hexesFromTable(SEC82_ADDITIONS,
    '§8.2 (the 2026-08-06 additions)');

  assert.strictEqual(LIFTED_2.length, 11,
    '(G-22-art) §2 must yield exactly 11 hexes, BY VALUE. It is the ' +
    'UI-SPEC Sprite Palette table reproduced verbatim; a different count ' +
    'means the parse drifted from the register, and a gate that quietly ' +
    'accepts whatever it happens to parse is not enforcing anything');
  assert.strictEqual(LIFTED_82.length, 2,
    '(G-22-art) §8.2 must yield exactly 2 APPROVED additions, BY VALUE ' +
    '(#a8804f wood-dark, #3c6234 green-dark). Three would mean the struck ' +
    'row was read as approved — the exact defect this lift guards');

  const ALLOWED = new Set(LIFTED_2.concat(LIFTED_82));
  assert.strictEqual(ALLOWED.size, 13,
    '(G-22-art) THE PALETTE IS 13, PINNED BY VALUE (owner ruling ' +
    '2026-08-06: 11 from §2 + 2 from §8.2; the proposed 14th is REJECTED). ' +
    'Lifted ' + ALLOWED.size + ' instead: ' +
    [...ALLOWED].sort().join(' '));

  // The rejected outline, spelled once, here.
  const REJECTED = '#4a3a2c';
  assert.ok(!ALLOWED.has(REJECTED),
    '(G-22-art) the REJECTED outline ' + REJECTED + ' must never be in ' +
    'the lifted set. Owner ruling 2026-08-06: the sprite outline stays ' +
    '#2c2823 (--ink); #4a3a2c is not an approved sprite colour');

  // POSITIVE CONTROL 4 — the exclusion is DOING WORK rather than the regex
  // simply missing. #4a3a2c is present in SPRITES.md (as §8.1's rejection
  // and §8.2's struck row); if it ever stopped being there, "absent from
  // the lifted set" would become a claim about nothing.
  assert.ok(spritesSrc.indexOf(REJECTED) !== -1,
    '(G-22-art) CONTROL 4: ' + REJECTED + ' must be PRESENT somewhere in ' +
    'tools/SPRITES.md (it is there as a struck, rejected row). If it is ' +
    'absent, the exclusion above is not doing work — the parse is just ' +
    'not seeing it, and the two are indistinguishable from a green gate');

  // =====================================================================
  // (2) THE BANNED SUB-LIST — §2's three ROLE constraints, pinned
  // =====================================================================
  // Each reason is quoted from §2 rather than invented here.
  //   #9a2828 --never  : "not used in sprites — destructive chrome only"
  //   #e8503a --accent : "active-filter markers in chrome. NOT scene
  //                       decoration" (at most ONE rare art-pop pixel
  //                       scene-wide; a drawn implement has no such role)
  //   #4f7b43 --green  : "the ONE living-green feature wall ... + plant
  //                       foliage only"
  const BANNED_ROLE = ['#9a2828', '#e8503a', '#4f7b43'];

  // PIN THE LIST ITSELF — length AND membership, both by value. Without
  // this, the mechanism below could be proven on #9a2828 while the other
  // two were silently absent from the list: a gate demonstrated on a
  // subject it does not actually cover.
  assert.strictEqual(BANNED_ROLE.length, 3,
    '(G-22-art) the role-ban list is EXACTLY 3 long, by value. If the ' +
    'owner ever asks for one of the three in these two sprites, the ban ' +
    'MOVES with her ruling CITED at this assertion and this number moves ' +
    'to 2 in the same edit — it is never quietly widened to nothing');
  assert.ok(BANNED_ROLE.indexOf('#9a2828') !== -1,
    '(G-22-art) #9a2828 (--never) is banned for these sprites — §2: ' +
    '"not used in sprites — destructive chrome only"');
  assert.ok(BANNED_ROLE.indexOf('#e8503a') !== -1,
    '(G-22-art) #e8503a (--accent, coral) is banned for these sprites — ' +
    '§2 confines it to "active-filter markers in chrome. NOT scene ' +
    'decoration"; a drawn implement has no such role');
  assert.ok(BANNED_ROLE.indexOf('#4f7b43') !== -1,
    '(G-22-art) #4f7b43 (--green) is banned for these sprites — §2 ' +
    'reserves it for "the ONE living-green feature wall ... + plant ' +
    'foliage only"');
  BANNED_ROLE.forEach(function (h) {
    assert.ok(ALLOWED.has(h),
      '(G-22-art) ' + h + ' must be INSIDE the 13 for its role-ban to be ' +
      'meaningful. A hex the subset check already rejects needs no role ' +
      'ban — the sub-list only earns its keep on colours a plain subset ' +
      'test would wave through');
  });

  // =====================================================================
  // (3) THE DECODER — zero-dep PNG colour census
  // =====================================================================
  function decodePng(buf, what) {
    assert.ok(buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47,
      '(G-22-art) ' + what + ' is not a PNG');
    let off = 8, ihdr = null;
    const idat = [];
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      const data = buf.slice(off + 8, off + 8 + len);
      if (type === 'IHDR') {
        ihdr = {
          w: data.readUInt32BE(0), h: data.readUInt32BE(4),
          depth: data[8], ct: data[9], interlace: data[12],
        };
      } else if (type === 'IDAT') { idat.push(data); }
      off += 12 + len;
    }
    assert.ok(ihdr, '(G-22-art) ' + what + ' has no IHDR');
    assert.ok(idat.length > 0, '(G-22-art) ' + what + ' has no IDAT');
    assert.strictEqual(ihdr.depth, 8,
      '(G-22-art) ' + what + ' must be 8-bit; this decoder reads no other ' +
      'depth and must SAY SO rather than silently census nothing');
    assert.strictEqual(ihdr.interlace, 0,
      '(G-22-art) ' + what + ' must not be interlaced');
    const bpp = ihdr.ct === 6 ? 4 : ihdr.ct === 2 ? 3 : 0;
    assert.ok(bpp > 0,
      '(G-22-art) ' + what + ' colour type ' + ihdr.ct + ' is not ' +
      'supported by this decoder (2=RGB, 6=RGBA). Refusing rather than ' +
      'returning an empty census, which would pass every ban below');

    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = ihdr.w * bpp;
    const out = Buffer.alloc(ihdr.h * stride);
    let p = 0;
    for (let y = 0; y < ihdr.h; y++) {
      const ft = raw[p++];
      const line = raw.slice(p, p + stride); p += stride;
      const cur = out.slice(y * stride, (y + 1) * stride);
      const prev = y > 0 ? out.slice((y - 1) * stride, y * stride)
                         : Buffer.alloc(stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const x = line[i];
        let v;
        if (ft === 0) { v = x; }
        else if (ft === 1) { v = x + a; }
        else if (ft === 2) { v = x + b; }
        else if (ft === 3) { v = x + ((a + b) >> 1); }
        else if (ft === 4) {
          const pa = Math.abs(b - c), pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          v = x + pr;
        } else {
          throw new Error('(G-22-art) ' + what + ': unknown PNG filter ' + ft);
        }
        cur[i] = v & 0xff;
      }
    }
    const census = new Map();
    const mask = new Set();                         // OCCUPANCY = silhouette
    const at = new Map();                           // 'x,y' -> hex, for the
    // pose block, which must separate BODY from the 1px rim. Kept generic
    // (a plain per-pixel index) rather than teaching this decoder what a
    // "rim" is — the decoder reports what it read, callers interpret.
    let opaque = 0;
    for (let y = 0; y < ihdr.h; y++) {
      for (let x = 0; x < ihdr.w; x++) {
        const i = y * stride + x * bpp;
        const al = bpp === 4 ? out[i + 3] : 255;
        if (al === 0) continue;                     // fully transparent
        opaque++;
        mask.add(x + ',' + y);
        const hex = '#' + [out[i], out[i + 1], out[i + 2]]
          .map(function (n) { return n.toString(16).padStart(2, '0'); })
          .join('');
        at.set(x + ',' + y, hex);
        census.set(hex, (census.get(hex) || 0) + 1);
      }
    }
    return {
      w: ihdr.w, h: ihdr.h, census: census, opaque: opaque, mask: mask,
      at: at,
    };
  }

  // --- a synthesiser, so the deliberate-failure controls need no fixtures
  const CRC_TABLE = (function () {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) {
      c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  }
  function synthPng(hexes) {                        // one row, N RGBA pixels
    const w = hexes.length;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const raw = Buffer.alloc(1 + w * 4);
    hexes.forEach(function (hx, i) {
      raw[1 + i * 4] = parseInt(hx.slice(1, 3), 16);
      raw[2 + i * 4] = parseInt(hx.slice(3, 5), 16);
      raw[3 + i * 4] = parseInt(hx.slice(5, 7), 16);
      raw[4 + i * 4] = 255;
    });
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', zlib.deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
  }

  function subsetViolations(census) {
    return [...census.keys()].filter(function (h) { return !ALLOWED.has(h); });
  }
  function roleViolations(census) {
    return [...census.keys()].filter(function (h) {
      return BANNED_ROLE.indexOf(h) !== -1;
    });
  }

  // =====================================================================
  // (4) FOUR POSITIVE CONTROLS — a decoder that returns nothing satisfies
  //     every ban, so the instrument is proven able to SEE before it is
  //     believed. Controls run BEFORE the subjects.
  // =====================================================================
  // CONTROL 1 — a real shipped sprite must decode to a NON-EMPTY set.
  const REAL = path.join(REPO, 'assets', 'room', 'notebook.png');
  assert.ok(fs.existsSync(REAL),
    '(G-22-art) CONTROL 1 needs a real shipped sprite to decode');
  const realDec = decodePng(fs.readFileSync(REAL), 'assets/room/notebook.png');
  assert.ok(realDec.census.size > 0 && realDec.opaque > 0,
    '(G-22-art) CONTROL 1: decoding a real shipped sprite must FIND ' +
    'colours. An empty pixel set is the vacuous-check defect this phase ' +
    'is named for, in a brand-new instrument — every ban below would pass ' +
    'over nothing at all. Got ' + realDec.census.size + ' colours over ' +
    realDec.opaque + ' non-transparent pixels');

  // CONTROL 2 — the REJECTED hex must make the SUBSET ban fire.
  const c2 = decodePng(synthPng([REJECTED]), 'CONTROL 2 synthetic');
  assert.deepStrictEqual(subsetViolations(c2.census), [REJECTED],
    '(G-22-art) CONTROL 2: a synthesised PNG containing the rejected ' +
    REJECTED + ' must make the SUBSET check fire. If it does not, the ' +
    'subset check cannot fail and proves nothing about the real exports');

  // CONTROL 3 — the one a plain subset test CANNOT provide. #9a2828 is
  // INSIDE the 13, so the subset check waves it through by design; only
  // the role ban can catch it.
  const c3 = decodePng(synthPng(['#9a2828']), 'CONTROL 3 synthetic');
  assert.deepStrictEqual(subsetViolations(c3.census), [],
    '(G-22-art) CONTROL 3 (half a): #9a2828 IS one of the 13, so the ' +
    'subset check must stay GREEN on it. This half is what makes the ' +
    'other half meaningful');
  assert.deepStrictEqual(roleViolations(c3.census), ['#9a2828'],
    '(G-22-art) CONTROL 3 (half b): the ROLE ban must fire on #9a2828 ' +
    'even though the subset check did not. Without this control the ' +
    'banned sub-list could be silently unreachable and nobody would know');

  // (CONTROL 4 is the "#4a3a2c is present in SPRITES.md" assertion above,
  //  placed with the lift it qualifies.)

  // =====================================================================
  // (5) THE SUBJECTS — both implements, both sizes
  // =====================================================================
  // SIZES MOVED BY VALUE, WITH THE AUTHORITY CITED AT THE ASSERTION:
  // owner ruling A-17 part 2, taken 2026-08-09 at plan 26.91-21 task 3 —
  // "THE REDRAW TARGETS 32x32", because at 16x16 the silhouettes could not
  // carry the difference even in principle (the first pass measured 8
  // differing pixels of 256). The 16x16 pins these lines carried before that
  // ruling are RETIRED with the 16x16 art; `@2x` is now a true 2x of the
  // served 32, which is what the suffix has always claimed.
  const SILHOUETTES = {};
  const SUBJECTS = [
    { rel: 'assets/room/cursor-inkpen.png',                  w: 32, h: 32 },
    { rel: 'assets/room/cursor-pencil.png',                  w: 32, h: 32 },
    { rel: 'assets/aseprite/items/cursor-inkpen@2x.png',     w: 64, h: 64 },
    { rel: 'assets/aseprite/items/cursor-pencil@2x.png',     w: 64, h: 64 },
  ];

  SUBJECTS.forEach(function (s) {
    const abs = path.join(REPO, s.rel);
    assert.ok(fs.existsSync(abs),
      '(G-22-art) ' + s.rel + ' must EXIST. This gate refuses rather than ' +
      'passing over an absent subject — at HEAD, before plan 26.91-21 ' +
      'draws them, this is the assertion that is red, and that is correct');
    const d = decodePng(fs.readFileSync(abs), s.rel);
    assert.strictEqual(d.w + 'x' + d.h, s.w + 'x' + s.h,
      '(G-22-art) ' + s.rel + ' must be ' + s.w + 'x' + s.h + ' — a cursor ' +
      'renders at device pixels wherever the pointer is, so its size is ' +
      'not a detail the room\'s --k can absorb later');
    assert.ok(d.census.size > 0,
      '(G-22-art) ' + s.rel + ' decoded to ZERO non-transparent pixels. ' +
      'A blank export passes every colour ban and is not a drawing');
    assert.deepStrictEqual(subsetViolations(d.census), [],
      '(G-22-art) ' + s.rel + ' uses colours outside the 13 lifted from ' +
      'tools/SPRITES.md §2 + §8.2. Census: ' +
      [...d.census.entries()].map(function (e) { return e[0] + '×' + e[1]; })
        .sort().join(' '));
    SILHOUETTES[s.rel] = d.mask;
    assert.deepStrictEqual(roleViolations(d.census), [],
      '(G-22-art) ' + s.rel + ' uses a hex that is inside the 13 but is ' +
      'ROLE-CONSTRAINED by §2 away from a drawn implement (' +
      BANNED_ROLE.join(' ') + '). Inside the palette is not the same as ' +
      'permitted here');
  });

  // =====================================================================
  // (6) G-22-shape — SEPARABLE BY SHAPE ALONE, which is the thing the
  //     first pass FAILED and the reason she ruled `redraw`
  // =====================================================================
  //
  // OWNER RULING A-17 (2026-08-09, plan 26.91-21 task 3), her brief verbatim:
  // "The two silhouettes must be separable by SHAPE ALONE." The first pass
  // failed tools/SPRITES.md §8.3's own rule — legibility at this size comes
  // from SHAPE, not edge or colour — because a tan wood cone against a grey
  // steel nib was COLOUR doing the work SHAPE was supposed to do. Measured:
  // the two 16x16 silhouettes differed in EIGHT pixels of 256.
  //
  // Her acceptance measure, and the two halves of it:
  //   (a) the occupancy difference must be SUBSTANTIALLY larger than 8/256;
  //   (b) the two must still be told apart rendered in a SINGLE FLAT COLOUR.
  //
  // (b) IS THE HALF THAT NEEDS THE STRONGER INSTRUMENT. A naive
  // "the flattened images differ" check passes on two IDENTICAL shapes one
  // pixel apart, which no human would call separable — so the assertion below
  // is the difference MINIMISED OVER EVERY INTEGER TRANSLATION in a ±4 window.
  // A shape difference that survives best-case alignment is a difference in
  // FORM, which is what "shape alone" means. That is also why this check
  // cannot be satisfied by nudging one sprite.
  //
  // AND IT IS DRIVEN, NOT ASSERTED: plan 21 task 4(c) planted the pencil's own
  // silhouette into the inkpen export and watched BOTH assertions below go
  // RED, then reverted. The phase's standing lesson is that the defect lands
  // most often inside the instrument built to catch it.
  const SIL_A = SILHOUETTES['assets/room/cursor-inkpen.png'];
  const SIL_B = SILHOUETTES['assets/room/cursor-pencil.png'];
  assert.ok(SIL_A && SIL_B && SIL_A.size > 0 && SIL_B.size > 0,
    '(G-22-shape) both 32x32 silhouettes must be non-empty before they can ' +
    'be compared — an empty mask makes every separation number meaningless');

  function sep(a, b, dx, dy) {
    let inter = 0;
    const shifted = new Set();
    b.forEach(function (k) {
      const p = k.split(',');
      shifted.add((+p[0] + dx) + ',' + (+p[1] + dy));
    });
    a.forEach(function (k) { if (shifted.has(k)) inter++; });
    const union = a.size + shifted.size - inter;
    return (union - inter) / union;                 // symmetric-difference /
  }                                                 // union, i.e. 1 - IoU

  const ALIGNED = sep(SIL_A, SIL_B, 0, 0);
  // THE FLOOR IS PINNED BY VALUE and carries the number it replaces: the
  // first pass measured 8/256 = 0.031 at 16x16. 0.25 is eight times that
  // ratio and is what "substantially larger" was given to mean.
  const SEP_FLOOR = 0.25;
  assert.ok(ALIGNED >= SEP_FLOOR,
    '(G-22-shape) the inkpen and pencil silhouettes differ in only ' +
    ALIGNED.toFixed(3) + ' of their union, below the pinned floor ' +
    SEP_FLOOR + '. The first pass measured 0.031 (8 px of 256) and THAT is ' +
    'the number owner ruling A-17 sent this art back to beat. If this is ' +
    'red, colour is doing shape\'s work again');

  let best = 1;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const v = sep(SIL_A, SIL_B, dx, dy);
      if (v < best) best = v;
    }
  }
  // Pinned BY VALUE and deliberately lower than SEP_FLOOR: a best-alignment
  // search can only ever REDUCE the difference, so a floor equal to the
  // aligned one would be unfalsifiable-by-construction in the other
  // direction. 0.20 is the number the two drawn shapes must clear.
  const SHIFT_FLOOR = 0.20;
  assert.ok(best >= SHIFT_FLOOR,
    '(G-22-shape) SINGLE-FLAT-COLOUR SEPARATION FAILED: under the best of ' +
    '81 integer alignments the two silhouettes differ in only ' +
    best.toFixed(3) + ' of their union (floor ' + SHIFT_FLOOR + '). Two ' +
    'shapes that coincide once one is nudged are the SAME shape in two ' +
    'places, and a human rendering both in one colour would not tell them ' +
    'apart. This is the half of A-17\'s acceptance measure that a plain ' +
    '"the images differ" check cannot express');

  // =====================================================================
  // (7) G-22-pose — SEPARABLE BY POSE, not only by PROFILE.
  //     Owner verdict A-18 (2026-08-09, plan 26.91-21 task 5), verbatim:
  //
  //       "Both implements are currently the same object at the same 45
  //        degree angle, so what separates them is PROFILE, not POSE.
  //        Pitch the pencil more upright and lay the inkpen back, so pose
  //        separates them too. A pencil is conventionally held more
  //        upright than a fountain pen."
  //
  // She approved round 1's profile work and spent her LAST round on the
  // angle, because she was shown — and accepted — that at 8x the flat
  // shape-plate DOES separate the two, but AT TRUE SIZE IN FLAT COLOUR
  // they were much closer than the magnified plate suggested, and what
  // carried them at ship size was still substantially the wood tone.
  //
  // EVERY MEASURE BELOW IS SELF-CALIBRATING. The axis of each implement is
  // derived from its OWN silhouette (principal axis of the second moments,
  // origin at its own extreme point), so nothing here hardcodes an angle,
  // a tip or a region boundary. That matters because the first draft of
  // this round's checker DID hardcode a tip and an angle, and when the
  // drawing moved 66->68 and 32->36 it measured in the wrong frame and
  // reported four landmarks lost that were never lost. A gate that has to
  // be hand-edited in step with the art is a gate that will one day be
  // measuring the wrong thing quietly. This one cannot be.
  //
  // ROUND 1's ART WOULD FAIL P1 AND ITS ASPECTS, WHICH IS THE POINT: its
  // two axes sat 7.6 degrees apart (52.5 vs 44.9) with bbox aspects 0.87
  // and 1.00 — two square-ish diagonals. Round 2 measures 31.0 degrees
  // apart (37.2 vs 68.2) with aspects 1.24 and 0.59, i.e. one clearly
  // wider than tall and one clearly taller than wide.
  const RIM_HEX = '#fbf7ee';
  function bodyMask(rel) {
    const d = decodePng(fs.readFileSync(path.join(REPO, rel)), rel);
    const body = new Set();
    d.mask.forEach(function (k) { if (d.at.get(k) !== RIM_HEX) body.add(k); });
    assert.ok(body.size > 0,
      '(G-22-pose) ' + rel + ' has NO body pixels once the rim hex ' +
      RIM_HEX + ' is removed. A sprite that is all rim would satisfy every ' +
      'landmark ratio below vacuously');
    return body;
  }
  // principal-axis orientation, in degrees above the horizontal
  function poseOf(mask) {
    const P = [...mask].map(function (k) { return k.split(',').map(Number); });
    const n = P.length;
    let cx = 0, cy = 0;
    P.forEach(function (p) { cx += p[0] + 0.5; cy += p[1] + 0.5; });
    cx /= n; cy /= n;
    let mxx = 0, myy = 0, mxy = 0;
    P.forEach(function (p) {
      const dx = p[0] + 0.5 - cx, dy = p[1] + 0.5 - cy;
      mxx += dx * dx; myy += dy * dy; mxy += dx * dy;
    });
    mxx /= n; myy /= n; mxy /= n;
    let deg = -(0.5 * Math.atan2(2 * mxy, mxx - myy)) * 180 / Math.PI;
    while (deg < 0) deg += 180;
    while (deg >= 180) deg -= 180;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    P.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    });
    return { n: n, deg: deg, cx: cx, cy: cy, pts: P,
             bw: x1 - x0 + 1, bh: y1 - y0 + 1,
             aspect: (x1 - x0 + 1) / (y1 - y0 + 1) };
  }
  // width profile along the derived axis, origin at the implement's own tip
  function axisProfile(mask) {
    const P = poseOf(mask);
    const r = P.deg * Math.PI / 180;
    const u = [Math.cos(r), -Math.sin(r)], v = [Math.sin(r), Math.cos(r)];
    const pts = P.pts.map(function (p) {
      const dx = p[0] + 0.5 - P.cx, dy = p[1] + 0.5 - P.cy;
      return { x: p[0], y: p[1], s: dx * u[0] + dy * u[1], t: dx * v[0] + dy * v[1] };
    });
    let smin = Infinity, smax = -Infinity;
    pts.forEach(function (p) { if (p.s < smin) smin = p.s; if (p.s > smax) smax = p.s; });
    pts.forEach(function (p) { p.s -= smin; });
    const L = smax - smin;
    const bins = new Map();
    pts.forEach(function (p) {
      const k = Math.floor(p.s);
      const e = bins.get(k) || { lo: 1e9, hi: -1e9, n: 0 };
      if (p.t < e.lo) e.lo = p.t; if (p.t > e.hi) e.hi = p.t; e.n++;
      bins.set(k, e);
    });
    bins.forEach(function (e) { e.w = e.hi - e.lo; });
    const ks = [...bins.keys()].sort(function (a, b) { return a - b; });
    // BARREL = the MEDIAN width over the middle half of the length. A median
    // over the middle half cannot be moved by either end, which is what makes
    // the two end ratios below comparable between two different implements.
    const mid = ks.filter(function (k) { return k >= 0.30 * L && k <= 0.70 * L; })
                  .map(function (k) { return bins.get(k).w; })
                  .sort(function (a, b) { return a - b; });
    const barrel = mid.length ? mid[mid.length >> 1] : 0;
    const tipW = Math.max(bins.get(ks[0]) ? bins.get(ks[0]).w : 0,
                          bins.get(ks[1]) ? bins.get(ks[1]).w : 0);
    const solid = ks.filter(function (k) { return bins.get(k).n >= 3; });
    const endW = bins.get(solid[solid.length - 1]).w;
    const tipPt = pts.reduce(function (a, b) { return a.s <= b.s ? a : b; });
    return { L: L, barrel: barrel, tipW: tipW, endW: endW,
             endRatio: barrel ? endW / barrel : 0, tip: [tipPt.x, tipPt.y] };
  }

  const POSE_I = poseOf(SILHOUETTES['assets/room/cursor-inkpen.png']);
  const POSE_P = poseOf(SILHOUETTES['assets/room/cursor-pencil.png']);
  let POSE_D = Math.abs(POSE_I.deg - POSE_P.deg);
  if (POSE_D > 90) POSE_D = 180 - POSE_D;

  // --- P1: THE ANGLE. This is A-18 itself, expressed as a number. -------
  // Pinned BY VALUE at 20 degrees, carrying the number it replaces: round 1
  // measured 7.6 degrees apart and that is what she sent this art back to
  // beat. 20 is comfortably above any raster wobble in the axis estimate
  // (which is sub-degree at this size) and comfortably below the 31.0 the
  // redraw achieves, so it is a floor, not a fitted threshold.
  const POSE_FLOOR = 20;
  assert.ok(POSE_D >= POSE_FLOOR,
    '(G-22-pose) POSE SEPARATION FAILED: the two implements\' principal ' +
    'axes lie only ' + POSE_D.toFixed(1) + ' degrees apart (inkpen ' +
    POSE_I.deg.toFixed(1) + ', pencil ' + POSE_P.deg.toFixed(1) + '), below ' +
    'the pinned floor of ' + POSE_FLOOR + '. Owner verdict A-18 spent the ' +
    'LAST of two capped redraw rounds on exactly this: round 1 measured ' +
    '7.6 degrees apart, so what separated the two was PROFILE and not ' +
    'POSE, and at true size in flat colour the wood tone was still doing ' +
    'much of the work. If this is red, the angle lever has been given back');

  const PROF_I = axisProfile(bodyMask('assets/room/cursor-inkpen.png'));
  const PROF_P = axisProfile(bodyMask('assets/room/cursor-pencil.png'));

  // --- P2: ONE HOTSPOT, SHARED. Plan 22 DECLARES the cursor hotspot; if
  // the two implements' tips stop coinciding it must declare two, and the
  // divergence must be visible HERE rather than discovered downstream.
  assert.deepStrictEqual(PROF_I.tip, PROF_P.tip,
    '(G-22-pose) the two implements\' BODY TIPS no longer coincide — ' +
    'inkpen (' + PROF_I.tip.join(',') + ') vs pencil (' +
    PROF_P.tip.join(',') + '). Plan 22 declares the cursor hotspot at the ' +
    'tip; while these agree it declares ONE, and a silent divergence would ' +
    'make one of the two cursors point with a pixel that is not its point');

  // --- P3: FLAT CUT vs DOME, the far-end landmark pair, measured by the
  // SAME ratio for both so neither threshold is fitted to one implement.
  // A flat-cut eraser holds the barrel's width to its last bin; a domed
  // cap has shed most of it. Measured: pencil 1.17, inkpen 0.56.
  assert.ok(PROF_P.endRatio >= 0.85,
    '(G-22-pose) the pencil\'s FLAT-CUT end is gone: its final bin is ' +
    PROF_P.endW.toFixed(2) + ' px wide against a barrel of ' +
    PROF_P.barrel.toFixed(2) + ' (ratio ' + PROF_P.endRatio.toFixed(2) +
    ', floor 0.85). A-18 kept the five profile landmarks A-17 approved — ' +
    'this round adds pose, it does not spend profile to buy it');
  assert.ok(PROF_I.endRatio <= 0.70,
    '(G-22-pose) the inkpen\'s DOMED cap is gone: its final bin is ' +
    PROF_I.endW.toFixed(2) + ' px wide against a barrel of ' +
    PROF_I.barrel.toFixed(2) + ' (ratio ' + PROF_I.endRatio.toFixed(2) +
    ', ceiling 0.70) — it is ending in a flat cut like the pencil, which ' +
    'is one of the two ends that tell them apart');

  // --- P4: SHARPENED POINT vs NIB, the tip-end landmark pair. A sharpened
  // pencil comes to an actual point; a spade nib is blunter by design.
  // Measured: pencil 0.00 px, inkpen 1.40 px.
  assert.ok(PROF_P.tipW <= 0.9,
    '(G-22-pose) the pencil\'s SHARPENED CONE no longer comes to a point: ' +
    'its first two bins are ' + PROF_P.tipW.toFixed(2) + ' px wide ' +
    '(ceiling 0.9). This is the landmark A-17 approved and A-18 kept');
  assert.ok(PROF_I.tipW >= 1.0,
    '(G-22-pose) the inkpen\'s SPADE NIB has been sharpened to a pencil ' +
    'point: its first two bins are ' + PROF_I.tipW.toFixed(2) + ' px wide ' +
    '(floor 1.0). A nib is blunter than a sharpened cone, and that ' +
    'difference is readable at true size where finer ones are not');
})();

// ===========================================================================
// ---- G-27: 26.91-30 (F-26) — THE DRAWN LINE AND THE ENFORCED RULE ---------
//
// THE DEFECT THIS GROUP EXISTS FOR. The app ALREADY draws the outline she
// asked for. tokens.css shipped `body.nb-design .page-deco-canvas {
// box-shadow: inset 0 0 0 1px var(--paper-shadow) }` under a comment saying it
// marks the placeable area — and it is drawn on the CANVAS box, whose right
// page runs `--x:192 --w:192`, so the line sits at x = 384. Ink may only reach
// NB_DECOR_X_MAX. Three different right edges live in the tree at HEAD: 384
// (the art and the canvas box), NB_BOUNDS.x1 (380) and NB_DECOR_X_MAX (379);
// on the bottom axis the same three collapse to 190 / 190 / 189. That is her
// reported asymmetry exactly — five page px of daylight on the right against
// one on the bottom. The line has been telling her a lie for two phases.
//
// COORDINATE SPACE IS THE TRAP AND IT IS NAMED IN EVERY ASSERTION BELOW.
// NB_MARK_REGION is an INK-SPACE rectangle — the box a record's ink must land
// inside. The shipped clamp works in ORIGIN space and converts the fence
// PER RECORD by that record's own decoPointExtent. So:
//
//   * THE CEILING IS EXACT AND UNCONDITIONAL. `origin + e.x1 <= X_MAX` is
//     clampDecoOriginFor's own ceiling rearranged. NB_MARK_BOUNDS.x1 never
//     enters that ceiling at all — the Math.min's first term is INERT at
//     today's constants and is kept only as a fail-safe against a future
//     narrowing of the canvas. It is not a second live rule.
//   * THE FLOOR DROPS THE CLAMP'S PER-RECORD `- e.x0` TERM, because a
//     page-level rectangle cannot carry a per-record one. Converted into ink
//     space the clamp's floor is Math.max(NB_MARK_BOUNDS.x0 + e.x0,
//     NB_DECOR_X_MIN); the drawn floor is Math.max(NB_MARK_BOUNDS.x0,
//     NB_DECOR_X_MIN). The two are EQUAL only where a record's minimum ink
//     offset is exactly ZERO; a strictly positive minimum stops the ink that
//     many px RIGHT of the line (contained, safe, NOT exact); a negative one
//     would let ink land LEFT of it. G-27/region/ink-space-floor MEASURES
//     each minimum by value rather than assuming any of the three.
//
// EVERY CHECK RUNS AND A RED RUN NAMES ITSELF, on G-25's register: the checks
// are named closures, all executed, and the collected red names asserted
// against the empty list at the end. This group's whole value before the fix
// is the LIST of what fails.
// ===========================================================================

(function () {
  const g27Css = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const g27CssCode = stripComments(g27Css);
  const g27Py = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const g27AppCode = stripComments(appSrc);

  // ---- the region's DECLARATION BODY, lifted as TEXT --------------------
  // Returns null when the constant does not exist, so this file still LOADS
  // at a HEAD without it — a gate that cannot be watched failing is not a
  // gate, and it has to load before it can be watched.
  function g27RegionBody() {
    const at = g27AppCode.search(/\n\s*var NB_MARK_REGION\s*=/);
    if (at === -1) { return null; }
    const from = g27AppCode.indexOf('=', at) + 1;
    let d = 0;
    for (let i = from; i < g27AppCode.length; i++) {
      const c = g27AppCode[i];
      if (c === '{' || c === '[' || c === '(') { d++; }
      else if (c === '}' || c === ']' || c === ')') { d--; }
      else if (c === ';' && d === 0) { return g27AppCode.slice(from, i); }
    }
    return null;
  }
  function g27Region() {
    assert.ok(NB_MARK_REGION_VALUE,
      'G-27 — NB_MARK_REGION must be DECLARED in app.js beside the four ' +
      'NB_DECOR_* it derives from. Without it there is no drawn region to ' +
      'compare against the enforced rule, which IS F-26');
    return NB_MARK_REGION_VALUE;
  }

  // ---- the clamp family, lifted from the REAL source --------------------
  // strokeBox travels with decoBox for the reason NB_HELPERS' own header
  // gives: a `new Function` body is SLOPPY MODE, so an un-injected helper is
  // a landmine that fires only when a stroke record is reached.
  const G27_API = (function () {
    // eslint-disable-next-line no-new-func
    return new Function(
      NB_HELPERS + '\n' + NB_MARK_DECLS +
      extractFn(appSrc, 'strokeBox') + '\n' +
      'var NB_TEXT_BOX = ' +
        JSON.stringify(NB_SRC_CONSTS.NB_TEXT_BOX) + ';\n' +
      'var NB_IMG_BOX = ' +
        JSON.stringify(NB_SRC_CONSTS.NB_IMG_BOX) + ';\n' +
      'var NB_STICKER_H = ' +
        JSON.stringify(NB_SRC_CONSTS.NB_STICKER_H) + ';\n' +
      'var NB_STICKERS = ' +
        JSON.stringify(NB_SRC_CONSTS.NB_STICKERS) + ';\n' +
      'return { extent: decoPointExtent, clamp: clampDecoOriginFor, ' +
      'box: decoBox };')();
  }());

  // THE SEVEN RECORD SHAPES THE CLAMP CAN PRODUCE. `agrees-with-clamp` and
  // `ink-space-floor` take their own copies from their OWN factory: mutation
  // (5)'s negative-minimum record belongs to the floor assertion's set alone,
  // because agrees-with-clamp's floor half is explicitly conditional on a
  // non-negative minimum and does not claim to cover such a record. One that
  // leaked across would redden two assertions and prove neither.
  const STICKER_NAME = Object.keys(NB_SRC_CONSTS.NB_STICKERS)[0];
  function g27ClampShapes() {
    return [
      { name: 'sticker (count-box)',
        rec: { page: 'abc123', kind: 'sticker', sprite: STICKER_NAME,
          x: 250, y: 60 } },
      { name: 'placed image',
        rec: { page: 'abc123', kind: 'image', x: 250, y: 60, src: 'a' } },
      { name: 'hand-text element',
        rec: { page: 'abc123', kind: 'text', x: 250, y: 60, text: 'hi' } },
      { name: 'photo (the page\'s own polaroid)',
        rec: { page: 'abc123', kind: 'photo', x: 250, y: 60 } },
      { name: 'single-point stroke',
        rec: { page: 'abc123', kind: 'stroke', x: 250, y: 60,
          pts: [[0, 0]] } },
      { name: 'multi-run stroke (ink extent differs from its box)',
        rec: { page: 'abc123', kind: 'stroke', x: 250, y: 60,
          pts: [[0, 0, 10, 10], [20, 5, 30, 25]] } },
      { name: 'stroke with NO legal origin at all',
        noLegal: true,
        rec: { page: 'abc123', kind: 'stroke', x: 250, y: 60,
          pts: [[0, 0, 400, 300]] } }
    ];
  }
  function g27FloorShapes() { return g27ClampShapes(); }

  // ---- the fake-DOM painter rig (9e's, with NBDESIGN parameterised) ------
  function g27Paint(design, side) {
    const nodes = [];
    const dayRecord = { reset: false, items: [] };
    const doc = {
      createElement: function (t) {
        const n = {
          tag: t, cls: '', attrs: {}, text: '', kids: [],
          style: { setProperty: function (k, v) { this.__p[k] = v; },
            __p: {} },
          addEventListener: function () {},
          appendChild: function (c) { this.kids.push(c); },
          getBoundingClientRect: function () { return { left: 0, top: 0 }; }
        };
        Object.defineProperty(n, 'className', {
          get: function () { return this.cls; },
          set: function (v) { this.cls = v; }
        });
        Object.defineProperty(n, 'textContent', {
          get: function () { return this.text; },
          set: function (v) { this.text = v; }
        });
        n.setAttribute = function (k, v) { this.attrs[k] = v; };
        return n;
      }
    };
    const scene = {
      appendChild: function (n) { nodes.push(n); },
      querySelector: function () { return null; }
    };
    const src = NB_HELPERS + '\n' +
      NB_MARK_DECLS + extractFn(appSrc, 'clampDecoOrigin') + '\n' +
      extractFn(appSrc, 'strokeBox') + '\n' +
      PEN_DOWN + extractFn(appSrc, 'attachPageDrag') + '\n' +
      DECO_PAINTER_SRC + '\n' +
      extractFn(appSrc, 'paintDecoHandles');
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'DECORATIONS', 'document', 'NBDESIGN', 'NB_BOUNDS', 'NB_TEXT_BOX',
      'NB_DRAG_THRESHOLD', 'NB_REPAINT', 'postDecorations', 'NB_DAY',
      'openHandTextEditor', '$', 'getComputedStyle', 'decoDay',
      'NB_STICKERS', 'NB_STICKER_H', 'NB_SHEET_W', 'NB_IMG_BOX',
      'NB_DECO_CAP', 'NB_TIN_OPEN', 'paintStickerCrop', 'recordIncident',
      'dismissTray', 'encodeURIComponent', 'NB_SEL', 'bringDecoToFront',
      'pushNbUndo',
      NB_BOUND_NAMES[0], NB_BOUND_NAMES[1], NB_BOUND_NAMES[2],
      NB_BOUND_NAMES[3],
      src + '\nreturn paintPageDecorations;')(
      { '08/04/2026': dayRecord }, doc, design,
      NB_SRC_CONSTS.NB_BOUNDS, NB_SRC_CONSTS.NB_TEXT_BOX, 3, null,
      function () {}, '08/04/2026', function () {},
      function () { return {}; },
      function () {
        return { getPropertyValue: function () { return '1'; } };
      },
      function () { return dayRecord; },
      NB_SRC_CONSTS.NB_STICKERS, NB_SRC_CONSTS.NB_STICKER_H, 316,
      NB_SRC_CONSTS.NB_IMG_BOX, 48, false,
      function () { return true; }, function () {}, function () {},
      global.encodeURIComponent, null, function () {}, function () {},
      NB_BOUND_VALUES[0], NB_BOUND_VALUES[1], NB_BOUND_VALUES[2],
      NB_BOUND_VALUES[3]);
    fn(scene, { itemId: 'abc123', dayLabel: '08/04/2026' }, side || 'right',
      {}, [], function () { return true; });
    return nodes;
  }
  function g27RegionNodes(ns) {
    return ns.filter(function (n) {
      return String(n.cls).split(/\s+/).indexOf('page-deco-region') !== -1;
    });
  }

  // =====================================================================
  const G27 = [];

  // (1) DERIVED, NEVER RETYPED. Both halves are needed: the no-digit check
  //     alone passes on a wrong formula, and the equality alone passes on
  //     four typed literals that happen to agree today.
  G27.push({ name: 'G-27/region/derived-not-retyped', fn: function () {
    const body = g27RegionBody();
    assert.ok(body !== null,
      'G-27/region/derived-not-retyped — NB_MARK_REGION must be DECLARED ' +
      'in app.js. F-26 is a drawn line that disagrees with the enforced ' +
      'rule; there is nothing to draw honestly until the effective region ' +
      'exists as a derived value');
    // NO NUMERIC LITERAL — which is NOT the same as "no digit", and the
    // difference is a finding rather than a nicety. The region's own
    // property names are x0/x1/y0/y1 and it reads NB_MARK_BOUNDS.x0, so a
    // bare /[0-9]/ ban is UNSATISFIABLE by the very shape this assertion
    // exists to require (NB_SHEET_W's precedent body does not satisfy it
    // either — it opens `var t = 0`). The discriminator is a digit that is
    // not part of an identifier or a property name, and it carries its own
    // POSITIVE CONTROL below so it cannot be a ban over nothing.
    const LIT = /(^|[^A-Za-z0-9_$.])[0-9]/;
    assert.ok(LIT.test('x1: Math.min(NB_MARK_BOUNDS.x1, 379)'),
      'G-27/region/derived-not-retyped — POSITIVE CONTROL: the ' +
      'numeric-literal discriminator must FIRE on a typed bound. A ban ' +
      'that cannot fire is a ban over nothing');
    assert.ok(!LIT.test('x1: Math.min(NB_MARK_BOUNDS.x1, NB_DECOR_X_MAX)'),
      'G-27/region/derived-not-retyped — NEGATIVE CONTROL: and it must NOT ' +
      'fire on the derived form, or every derivation would read as a copy');
    assert.ok(!LIT.test(body),
      'G-27/region/derived-not-retyped — the declaration body must carry ' +
      'NO NUMERIC LITERAL, on the NB_SHEET_W precedent. A typed copy of a ' +
      'bound agrees today and drifts silently tomorrow, which is exactly ' +
      'how F-23 was born. Found: ' + JSON.stringify(body.slice(0, 200)));
    const got = g27Region();
    const B = NB_SRC_CONSTS.NB_MARK_BOUNDS;
    const D = (function () {
      // eslint-disable-next-line no-new-func
      return new Function(['NB_DECOR_X_MIN', 'NB_DECOR_X_MAX',
        'NB_DECOR_Y_MIN', 'NB_DECOR_Y_MAX'].map(declOf).join('\n') +
        '\nreturn { xmin: NB_DECOR_X_MIN, xmax: NB_DECOR_X_MAX, ' +
        'ymin: NB_DECOR_Y_MIN, ymax: NB_DECOR_Y_MAX };')();
    }());
    assert.deepStrictEqual(got, {
      x0: Math.max(B.x0, D.xmin), x1: Math.min(B.x1, D.xmax),
      y0: Math.max(B.y0, D.ymin), y1: Math.min(B.y1, D.ymax)
    }, 'G-27/region/derived-not-retyped — the four evaluated values must ' +
      'EQUAL Math.max/Math.min over the SEPARATELY LIFTED NB_MARK_BOUNDS ' +
      'and NB_DECOR_*. Evaluated ' + JSON.stringify(got) + ' against ' +
      'canvas ' + JSON.stringify(B) + ' and fence ' + JSON.stringify(D));
    process.stdout.write('  G-27/region/derived-not-retyped EVALUATED ' +
      JSON.stringify(got) + '  (canvas ' + JSON.stringify(B) +
      ', fence ' + JSON.stringify(D) + ')\n');
  } });

  // (2) THE BOUNDS ARE INCLUSIVE, so the drawn region includes its own edge.
  //     Read from server.py's own comparison operators, never assumed.
  G27.push({ name: 'G-27/region/edge-inclusive', fn: function () {
    const cmp = g27Py.split('\n').filter(function (l) {
      return /DECOR_[XY]_(MIN|MAX)\s*<=?/.test(l) &&
        /DECOR_[XY]_MAX\s*\)/.test(l);
    });
    assert.ok(cmp.length >= 4,
      'G-27/region/edge-inclusive — the fence comparisons must be FOUND in ' +
      'server.py before their shape is believed. A scan over zero lines ' +
      'passes forever. Found ' + cmp.length);
    cmp.forEach(function (l) {
      assert.ok(l.indexOf('<=') !== -1 && l.replace(/<=/g, '').indexOf('<') === -1,
        'G-27/region/edge-inclusive — every DECOR_* comparison must be ' +
        '`<=` at BOTH ends: a mark whose ink lands exactly ON the bound is ' +
        'ACCEPTED, so a region drawn one pixel inside would make the app ' +
        'refuse a placement she can see is legal. Offending line: ' +
        JSON.stringify(l.trim()));
    });
    process.stdout.write('  G-27/region/edge-inclusive ' + cmp.length +
      ' comparisons, all inclusive\n');
  } });

  // (3) THE DRAWN REGION AGREES WITH THE CLAMP. The two halves are asserted
  //     SEPARATELY and labelled, because only one of them is conditional.
  G27.push({ name: 'G-27/region/agrees-with-clamp', fn: function () {
    const R = g27Region();
    const PUSH = [[5000, 5000], [-5000, -5000], [5000, -5000], [-5000, 5000]];
    g27ClampShapes().forEach(function (s) {
      const e = G27_API.extent(s.rec);
      PUSH.forEach(function (p) {
        const rec = JSON.parse(JSON.stringify(s.rec));
        const got = G27_API.clamp(rec, rec.x + p[0], rec.y + p[1]);
        if (s.noLegal) {
          assert.deepStrictEqual(got, { x: rec.x, y: rec.y },
            'G-27/region/agrees-with-clamp — a record with NO legal origin ' +
            '(' + s.name + ') must HOLD POSITION rather than have one ' +
            'invented for it. Inventing an origin moves her mark somewhere ' +
            'she did not choose AND is still refused');
          return;
        }
        // CEILING CONTAINMENT — holds UNCONDITIONALLY. It is the clamp's
        // own ceiling (NB_DECOR_*_MAX - e.*1) rearranged, so ink can never
        // pass the drawn edge for any record whatsoever.
        assert.ok(got.x + e.x1 <= R.x1 && got.y + e.y1 <= R.y1,
          'G-27/region/agrees-with-clamp CEILING CONTAINMENT ' +
          '(unconditional) — ' +
          s.name + ' pushed by (' + p + ') settled at (' + got.x + ',' +
          got.y + ') with ink extent x1=' + e.x1 + ' y1=' + e.y1 + ', so ' +
          'its ink reaches (' + (got.x + e.x1) + ',' + (got.y + e.y1) +
          ') against a drawn region ceiling of (' + R.x1 + ',' + R.y1 +
          '). Edge INCLUSIVE');
        // CEILING TIGHTNESS — THE HALF CONTAINMENT CANNOT CARRY, added
        // because mutation (2) proved it. Drawing the region at
        // NB_BOUNDS.x1 (380) instead of NB_DECOR_X_MAX (379) makes the
        // rectangle WIDER, and a wider rectangle still CONTAINS the ink —
        // so the containment half above stayed green under exactly the
        // over-drawing that IS F-26 (the retired hairline sat at 384, five
        // px too wide). Containment says "nothing crosses the line";
        // tightness says "the line is WHERE THE MARK STOPS". Only the
        // second one is what she asked for.
        if (p[0] > 0 && p[1] > 0) {
          assert.deepStrictEqual(
            { x: got.x + e.x1, y: got.y + e.y1 }, { x: R.x1, y: R.y1 },
            'G-27/region/agrees-with-clamp CEILING TIGHTNESS — ' + s.name +
            ' pushed far past the bound must settle with its ink EXACTLY ' +
            'ON the drawn ceiling, not merely somewhere inside it. Reached ' +
            '(' + (got.x + e.x1) + ',' + (got.y + e.y1) + ') against a ' +
            'drawn ceiling of (' + R.x1 + ',' + R.y1 + '). A region drawn ' +
            'WIDER than the rule is invisible to a containment check and ' +
            'is precisely the F-26 defect');
        }
        // FLOOR HALF — holds ON THE NON-NEGATIVE-MINIMUM CONDITION that
        // G-27/region/ink-space-floor measures. The drawn floor drops the
        // clamp's per-record `- e.x0`, so it sits AT OR LEFT OF the clamp's
        // ink-space floor while that minimum is non-negative, and is EQUAL
        // to it only where the minimum is exactly zero.
        assert.ok(got.x + e.x0 >= R.x0 && got.y + e.y0 >= R.y0,
          'G-27/region/agrees-with-clamp FLOOR HALF (conditional on a ' +
          'non-negative minimum ink offset) — ' + s.name + ' pushed by (' +
          p + ') settled at (' + got.x + ',' + got.y + ') with minimum ink ' +
          'offset x0=' + e.x0 + ' y0=' + e.y0 + ', so its lowest ink sits ' +
          'at (' + (got.x + e.x0) + ',' + (got.y + e.y0) + ') against a ' +
          'drawn region floor of (' + R.x0 + ',' + R.y0 + ')');
        // FLOOR TIGHTNESS — asserted ONLY where the minimum ink offset is
        // exactly ZERO, because that is the only case in which the drawn
        // floor EQUALS the clamp's ink-space floor. A strictly positive
        // minimum stops the ink that many px RIGHT of the line: contained,
        // safe, and NOT exact. Asserting exactness there would be the
        // over-claim this whole round has been correcting.
        if (p[0] < 0 && p[1] < 0 && e.x0 === 0 && e.y0 === 0) {
          assert.deepStrictEqual(
            { x: got.x + e.x0, y: got.y + e.y0 }, { x: R.x0, y: R.y0 },
            'G-27/region/agrees-with-clamp FLOOR TIGHTNESS (asserted only ' +
            'where the minimum ink offset is exactly ZERO) — ' + s.name +
            ' pushed far past the floor reached (' + (got.x + e.x0) + ',' +
            (got.y + e.y0) + ') against a drawn floor of (' + R.x0 + ',' +
            R.y0 + ')');
        }
      });
    });
    process.stdout.write('  G-27/region/agrees-with-clamp CEILING ' +
      'containment+tightness unconditional; FLOOR containment conditional ' +
      'on a non-negative minimum and FLOOR tightness only on a zero one — ' +
      g27ClampShapes().length + ' shapes x ' + PUSH.length + ' pushes\n');
  } });

  // (4) THE ASSERTION THAT CARRIES THE COORDINATE-SPACE CLAIM. Every minimum
  //     is PRINTED BY VALUE — a bare pass would hide which of the three
  //     dispositions is true.
  G27.push({ name: 'G-27/region/ink-space-floor', fn: function () {
    const bad = [];
    const mins = [];
    g27FloorShapes().forEach(function (s) {
      const e = G27_API.extent(s.rec);
      mins.push(s.name + ' x0=' + e.x0 + ' y0=' + e.y0);
      process.stdout.write('  G-27/region/ink-space-floor  ' + s.name +
        ' :: minimum ink offset x0=' + e.x0 + ' y0=' + e.y0 + '\n');
      if (e.x0 < 0 || e.y0 < 0) { bad.push(s.name + ' (' + e.x0 + ',' + e.y0 + ')'); }
    });
    // THE SHAPE OF THE DERIVATION ITSELF, over a COMMENT-STRIPPED window, so
    // a later edit that swaps a bound is caught by structure and not only by
    // today's numbers. A raw grep would be satisfied by the prose above it.
    const body = g27RegionBody();
    assert.ok(body !== null,
      'G-27/region/ink-space-floor — NB_MARK_REGION must exist before its ' +
      'derivation can be checked for shape');
    const xline = /x1\s*:\s*Math\.min\([^)]*NB_DECOR_X_MAX[^)]*\)/.test(body);
    const x0line = /x0\s*:\s*Math\.max\([^)]*NB_DECOR_X_MIN[^)]*\)/.test(body);
    assert.ok(xline && x0line,
      'G-27/region/ink-space-floor — the CEILING expression must contain ' +
      'NB_DECOR_X_MAX and the FLOOR expression NB_DECOR_X_MIN, read over a ' +
      'comment-stripped window. Structure, not today\'s numbers: a later ' +
      'edit that swaps a bound would keep the values agreeing for one wave ' +
      'and then not. Found: ' + JSON.stringify(body.slice(0, 240)));
    assert.deepStrictEqual(bad, [],
      'G-27/region/ink-space-floor — these shapes have a NEGATIVE minimum ' +
      'ink offset: ' + bad.join(', ') + '. The drawn floor drops the ' +
      'clamp\'s per-record `- e.x0` term, so a negative minimum puts ink ' +
      'LEFT OF or ABOVE the drawn line. That is a FINDING routed to the ' +
      'record — the region is documented conservative-on-the-left and the ' +
      'line is NOT moved to chase it, because moving it would make the ' +
      'drawn floor wrong for every other record. All minima: ' +
      mins.join(' | '));
  } });

  // (5) ARRANGING MODE ONLY.
  G27.push({ name: 'G-27/region/arranging-only', fn: function () {
    const design = g27RegionNodes(g27Paint(true, 'right'));
    const reading = g27RegionNodes(g27Paint(false, 'right'));
    assert.strictEqual(design.length, 1,
      'G-27/region/arranging-only — EXACTLY ONE region node per painted ' +
      'blessing page while arranging. Zero means the line she asked for is ' +
      'not drawn; two means the page carries two claims about where a mark ' +
      'may go');
    assert.strictEqual(reading.length, 0,
      'G-27/region/arranging-only — and ZERO while reading. Law 4: the ' +
      'region is chrome BESIDE her marks in arranging mode, and reading ' +
      'mode is byte-identical to what it was');
  } });

  // (6) INERT. The .page-deco-canvas posture, which is the shipped idiom.
  G27.push({ name: 'G-27/region/inert', fn: function () {
    const n = g27RegionNodes(g27Paint(true, 'right'))[0];
    assert.ok(n,
      'G-27/region/inert — no region node was painted, so every inertness ' +
      'claim below would be about nothing');
    assert.strictEqual(n.attrs['aria-hidden'], 'true',
      'G-27/region/inert — aria-hidden="true". A chrome element that ' +
      'speaks is a new surface law-5 scanning would have to cover');
    assert.strictEqual(n.attrs.tabindex, undefined,
      'G-27/region/inert — no tabindex: it is not a tab stop');
    assert.strictEqual(n.tag, 'div',
      'G-27/region/inert — a div, never a button');
    assert.strictEqual(n.text, '',
      'G-27/region/inert — it contributes NO accessible name');
    assert.ok(/\.page-deco-region\s*\{[^}]*pointer-events:\s*none/
      .test(g27CssCode),
      'G-27/region/inert — and tokens.css must give .page-deco-region ' +
      '`pointer-events: none` in BOTH modes. The hairline is a drawing, ' +
      'never a target');
  } });

  // (7) THE ASSERTION THAT STOPS A FIX TO A LINE BECOMING A CHANGE TO A
  //     GESTURE. .page-deco-canvas is also the placement and pen target.
  G27.push({ name: 'G-27/canvas/box-unmoved', fn: function () {
    const c = g27Paint(true, 'right').filter(function (n) {
      return String(n.cls).split(/\s+/).indexOf('page-deco-canvas') !== -1;
    })[0];
    assert.ok(c, 'G-27/canvas/box-unmoved — the placement canvas must be ' +
      'painted, or the pin below is about nothing');
    const pinned = { '--x': c.style.__p['--x'], '--y': c.style.__p['--y'],
      '--w': c.style.__p['--w'], '--h': c.style.__p['--h'] };
    process.stdout.write('  G-27/canvas/box-unmoved PINNED ' +
      JSON.stringify(pinned) + '\n');
    assert.deepStrictEqual(pinned,
      { '--x': '192', '--y': '4', '--w': '192', '--h': '186' },
      'G-27/canvas/box-unmoved — the canvas box is pinned BY VALUE from ' +
      'the painter\'s own output. Shrinking the BOX to fix the LINE would ' +
      'move where a tap places a mark and where the pen may start a stroke ' +
      '— a behaviour change nobody asked for, inside a round scoped to two ' +
      'findings');
    assert.ok(/body\.nb-design\s+\.page-deco-canvas\s*\{[^}]*pointer-events:\s*auto/
      .test(g27CssCode),
      'G-27/canvas/box-unmoved — and the body.nb-design pointer-events ' +
      'rule is pinned PRESENT over a comment-stripped tokens.css. Without ' +
      'it the canvas stops taking the tap at all');
  } });

  // (8) THE LYING RULE IS RETIRED — measured over a COMMENT-STRIPPED window,
  //     because a bare grep would be satisfied by the replacement comment
  //     describing what was removed.
  G27.push({ name: 'G-27/tokens/old-inset-retired', fn: function () {
    const rules = g27CssCode.match(
      /body\.nb-design\s+\.page-deco-canvas\s*\{[^}]*\}/g) || [];
    assert.ok(rules.length >= 1,
      'G-27/tokens/old-inset-retired — POSITIVE CONTROL: the window must ' +
      'contain at least one body.nb-design .page-deco-canvas rule, or the ' +
      'absence below is the absence of the whole selector rather than of ' +
      'the box-shadow. Found ' + rules.length);
    rules.forEach(function (r) {
      assert.strictEqual(/box-shadow/.test(r), false,
        'G-27/tokens/old-inset-retired — the inset hairline must be GONE ' +
        'from .page-deco-canvas. It sat at the canvas edge while ink may ' +
        'only reach NB_DECOR_X_MAX, so it has been marking the wrong ' +
        'rectangle for two phases. Still present in: ' +
        JSON.stringify(r.slice(0, 160)));
    });
    assert.ok(/\.page-deco-region\s*\{/.test(g27CssCode),
      'G-27/tokens/old-inset-retired — and the honest rule must EXIST. ' +
      'Deleting the lie without drawing the truth answers F-26 by removing ' +
      'the only line she had');
  } });

  // =====================================================================
  // ---- 26.91-30 TASK 2: THE DRAGGED MARK'S INK BOX --------------------
  //
  // A mark stops when its INK reaches the bound, not its box:
  // clampDecoOriginFor ceilings on decoPointExtent(rec) and NOT on
  // decoBox(rec). So two marks of the same apparent size stop in different
  // places, and one fixed region cannot explain that on its own.
  // =====================================================================

  function g27DragHarness() {
    /* 26.91-35 (G-28/cancel): `editors` joins the record so the rig can say
       whether the hand-text editor was raised. A cancel that opened it would
       be a typing surface raised by an interruption she did not make, and a
       box-count-only gate cannot see that. */
    const S = { nodes: [], DECORATIONS: {}, posted: [], bodies: [],
      repaints: [], editors: [] };
    function mk(t) {
      const n = {
        tag: t, cls: '', attrs: {}, text: '', kids: [],
        style: { setProperty: function (k, v) { this.__p[k] = v; },
          __p: {} },
        addEventListener: function () {},
        appendChild: function (c) { this.kids.push(c); },
        getBoundingClientRect: function () { return { left: 0, top: 0 }; }
      };
      Object.defineProperty(n, 'className', {
        get: function () { return this.cls; },
        set: function (v) { this.cls = v; }
      });
      Object.defineProperty(n, 'textContent', {
        get: function () { return this.text; },
        set: function (v) { this.text = v; }
      });
      n.setAttribute = function (k, v) { this.attrs[k] = v; };
      return n;
    }
    const doc = { createElement: mk };
    // A REAL scene, with a REAL removeChild — this harness's whole point.
    // loadTwoHistories' `$` answers null for every id, so the drag there
    // never had a scene to hang a transient node on and could not have
    // measured one.
    const scene = {
      appendChild: function (n) { S.nodes.push(n); },
      removeChild: function (n) {
        const i = S.nodes.indexOf(n);
        if (i !== -1) { S.nodes.splice(i, 1); }
      },
      querySelector: function () { return null; },
      getBoundingClientRect: function () { return { left: 0, top: 0 }; }
    };
    const src = NB_HELPERS + '\n' + NB_MARK_DECLS +
      extractFn(appSrc, 'strokeBox') + '\n' +
      ['postDecorations', 'decoDay', 'nbSnapshot', 'applyNbSnapshot',
        'pushNbUndo', 'nbGlyphState', 'updateNbButtons', 'clampDecoOrigin',
        'attachPageDrag', 'bringDecoToFront', 'nbClearResetForEdit']
        .map(function (n) { return extractFn(appSrc, n); }).join('\n');
    // eslint-disable-next-line no-new-func
    const api = new Function('S', 'document', 'scene', `
      var DECORATIONS = S.DECORATIONS;
      var NB_UNDO = [], NB_REDO = [];
      var NB_UNDO_CAP = ${/var NB_UNDO_CAP = (\d+);/.exec(appSrc)[1]};
      var NB_DAY = '08/04/2026';
      var NBDESIGN = true;
      var NB_SEL = null;
      var NB_PEN = false, NB_PEN_GROUP = null, NB_WRITE = false;
      var NB_DECO_CAP = 48;
      var NB_TEXT_BOX = ${JSON.stringify(NB_SRC_CONSTS.NB_TEXT_BOX)};
      var NB_IMG_BOX = ${JSON.stringify(NB_SRC_CONSTS.NB_IMG_BOX)};
      var NB_STICKER_H = ${JSON.stringify(NB_SRC_CONSTS.NB_STICKER_H)};
      var NB_STICKERS = ${JSON.stringify(NB_SRC_CONSTS.NB_STICKERS)};
      var NB_BOUNDS = ${JSON.stringify(NB_SRC_CONSTS.NB_BOUNDS)};
      var NB_DRAG_THRESHOLD = ${/var NB_DRAG_THRESHOLD = (\d+);/
    .exec(appSrc)[1]};
      var NB_A_MOD = 360, NB_S_MIN = 0.5, NB_S_MAX = 2.0, NB_S_DEFAULT = 1;
      var NB_PLACE = { itemId: 'abc123', x0: 0 };
      var NB_SAVE_FAILED = false;
      var NB_REPAINT = function () { S.repaints.push(true); };
      function syncP(v) {
        return { then: function (f) { return syncP(f(v)); },
          catch: function () { return syncP(v); } };
      }
      function apiPost(url, body) {
        S.posted.push(body.day);
        S.bodies.push(JSON.parse(JSON.stringify(body)));
        return syncP({ ok: true, status: 200, data: {} });
      }
      function dismissTray() {}
      function openHandTextEditor() { S.editors.push(true); }
      function $(id) { return id === 'station-scene' ? scene : null; }
      function getComputedStyle() {
        return { getPropertyValue: function () { return '1'; } };
      }
      ${src}
      return { attachPageDrag: attachPageDrag,
        undoLen: function () { return NB_UNDO.length; } };`)(S, doc, scene);
    api.state = S;
    api.inkboxes = function () {
      return S.nodes.filter(function (n) {
        return String(n.cls).split(/\s+/).indexOf('page-deco-inkbox') !== -1;
      });
    };
    return api;
  }

  // Drive a REAL move drag through the REAL attachPageDrag and snapshot the
  // ink-box population at each phase of the gesture.
  function g27Drag(rec, dx, dy) {
    const H = g27DragHarness();
    H.state.DECORATIONS['08/04/2026'] = { reset: false, items: [rec] };
    const el = nbEl();
    H.attachPageDrag(el, rec);
    const before = H.inkboxes().length;
    el.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    el.fire('pointermove', { clientX: 500 + dx, clientY: 500 + dy });
    const during = H.inkboxes();
    const node = during[0] || null;
    // THE ORIGIN IS READ OFF THE ELEMENT, NOT RECOMPUTED. A harness that
    // computes the number it then checks is a harness agreeing with itself.
    const origin = node
      ? { x: parseInt(el.style.__p['--x'], 10),
        y: parseInt(el.style.__p['--y'], 10) } : null;
    const snapshot = node
      ? { '--x': node.style.__p['--x'], '--y': node.style.__p['--y'],
        '--w': node.style.__p['--w'], '--h': node.style.__p['--h'] } : null;
    el.fire('pointerup', {});
    return { before: before, duringCount: during.length,
      after: H.inkboxes().length, node: node, origin: origin,
      snapshot: snapshot, rec: rec };
  }

  // (9) PRESENT DURING THE DRAG, AND ONLY THEN.
  G27.push({ name: 'G-27/inkbox/present-during-drag', fn: function () {
    const r = g27Drag({ page: 'abc123', kind: 'text', x: 250, y: 60,
      text: 'hi' }, 40, 20);
    assert.deepStrictEqual(
      { before: r.before, during: r.duringCount, after: r.after },
      { before: 0, during: 1, after: 0 },
      'G-27/inkbox/present-during-drag — EXACTLY ONE ink box while the ' +
      'mark is being dragged, ZERO before the gesture starts and ZERO ' +
      'after release. It explains a gesture, so it exists only while the ' +
      'gesture does — a selected mark she is not moving needs no ' +
      'explanation, and one left behind on release is chrome she did not ' +
      'ask for');
  } });

  // (10) IT IS THE EXTENT — measured against the SHIPPED decoPointExtent,
  //      never against a value the harness computed for itself.
  G27.push({ name: 'G-27/inkbox/is-the-extent', fn: function () {
    [{ page: 'abc123', kind: 'text', x: 250, y: 60, text: 'hi' },
      { page: 'abc123', kind: 'sticker', sprite: STICKER_NAME,
        x: 250, y: 60 },
      { page: 'abc123', kind: 'stroke', x: 250, y: 60,
        pts: [[0, 0, 10, 10], [20, 5, 30, 25]] }].forEach(function (rec) {
      const r = g27Drag(JSON.parse(JSON.stringify(rec)), 40, 20);
      assert.ok(r.node, 'G-27/inkbox/is-the-extent — an ink box must exist ' +
        'for a ' + rec.kind + ' before its values can be checked');
      const e = G27_API.extent(r.rec);
      assert.deepStrictEqual(r.snapshot, {
        '--x': String(r.origin.x + e.x0), '--y': String(r.origin.y + e.y0),
        '--w': String(e.x1 - e.x0 + 1), '--h': String(e.y1 - e.y0 + 1)
      }, 'G-27/inkbox/is-the-extent — the ink box is the record\'s ORIGIN ' +
        'plus the extent LIFTED FROM THE SHIPPED decoPointExtent, sized as ' +
        'a COUNT because the bounds are inclusive. ' + rec.kind + ': ' +
        JSON.stringify(r.snapshot) + ' against origin ' +
        JSON.stringify(r.origin) + ' + extent ' + JSON.stringify(e));
    });
  } });

  // (11) THE ASSERTION THAT CARRIES THE FINDING.
  G27.push({ name: 'G-27/inkbox/same-box-different-extent',
    fn: function () {
      // Same decoBox (NB_TEXT_BOX 72x24 and a stroke whose strokeBox SPAN
      // is also 72x24) — DIFFERENT decoPointExtent, because the fallback
      // path returns a COUNT (b.w - 1) and the stroke path returns the real
      // largest point. That one-pixel difference IS F-23's shape and it is
      // why two marks of the same apparent size stop in different places.
      const T = { page: 'abc123', kind: 'text', x: 250, y: 60, text: 'hi' };
      const K = { page: 'abc123', kind: 'stroke', x: 250, y: 60,
        pts: [[0, 0, 72, 24]] };
      const bT = G27_API.box(T);
      const bK = G27_API.box(K);
      assert.deepStrictEqual(bT, bK,
        'G-27/inkbox/same-box-different-extent — PRECONDITION: the two ' +
        'records must have the SAME visible box, or the claim below is ' +
        'about two marks that simply look different. ' +
        JSON.stringify(bT) + ' vs ' + JSON.stringify(bK));
      const eT = G27_API.extent(T);
      const eK = G27_API.extent(K);
      assert.notDeepStrictEqual(eT, eK,
        'G-27/inkbox/same-box-different-extent — and DIFFERENT ink ' +
        'extents: ' + JSON.stringify(eT) + ' vs ' + JSON.stringify(eK));
      const rT = g27Drag(JSON.parse(JSON.stringify(T)), 5000, 5000);
      const rK = g27Drag(JSON.parse(JSON.stringify(K)), 5000, 5000);
      // MATCHED BY RECORD IDENTITY, NEVER BY ARRAY INDEX — bringDecoToFront
      // REORDERS d.items, and an index-wise match reported three phantom
      // moves in session 5. Each drag carries its own record object back.
      assert.strictEqual(rT.rec.kind, 'text');
      assert.strictEqual(rK.rec.kind, 'stroke');
      assert.notDeepStrictEqual(
        { w: rT.snapshot['--w'], h: rT.snapshot['--h'] },
        { w: rK.snapshot['--w'], h: rK.snapshot['--h'] },
        'G-27/inkbox/same-box-different-extent — the two ink boxes must be ' +
        'MEASURABLY DIFFERENT SIZES on screen. That difference is the whole ' +
        'thing this affordance exists to show; a version that merely ' +
        'COMPUTES it and draws the visible box would pass every other ' +
        'assertion here. text ' + JSON.stringify(rT.snapshot) + ' vs ' +
        'stroke ' + JSON.stringify(rK.snapshot));
      assert.notDeepStrictEqual(rT.origin, rK.origin,
        'G-27/inkbox/same-box-different-extent — and they STOP AT ' +
        'DIFFERENT ORIGINS when pushed to the same bound: text ' +
        JSON.stringify(rT.origin) + ' vs stroke ' +
        JSON.stringify(rK.origin) + '. Two marks of the same apparent size ' +
        'stopping in different places is exactly what read as arbitrary');
      process.stdout.write('  G-27/inkbox/same-box-different-extent box ' +
        JSON.stringify(bT) + ' shared; extents ' + JSON.stringify(eT) +
        ' vs ' + JSON.stringify(eK) + '; origins ' +
        JSON.stringify(rT.origin) + ' vs ' + JSON.stringify(rK.origin) +
        '\n');
    } });

  // (12) INERT.
  G27.push({ name: 'G-27/inkbox/inert', fn: function () {
    const r = g27Drag({ page: 'abc123', kind: 'text', x: 250, y: 60,
      text: 'hi' }, 40, 20);
    assert.ok(r.node, 'G-27/inkbox/inert — no ink box was painted, so ' +
      'every inertness claim below would be about nothing');
    assert.strictEqual(r.node.attrs['aria-hidden'], 'true',
      'G-27/inkbox/inert — aria-hidden="true"');
    assert.strictEqual(r.node.attrs.tabindex, undefined,
      'G-27/inkbox/inert — no tabindex: it is not a tab stop');
    assert.strictEqual(r.node.tag, 'div',
      'G-27/inkbox/inert — a div, never a button');
    assert.strictEqual(r.node.text, '',
      'G-27/inkbox/inert — it contributes NO accessible name');
    assert.ok(/\.page-deco-inkbox\s*\{[^}]*pointer-events:\s*none/
      .test(g27CssCode),
      'G-27/inkbox/inert — and tokens.css gives .page-deco-inkbox ' +
      '`pointer-events: none`. It is a drawing about a gesture, never a ' +
      'target inside one');
    // NO NEW COLOUR: the two hairlines are told apart by PATTERN.
    const inkRule = /\.page-deco-inkbox\s*\{[^}]*\}/.exec(g27CssCode);
    assert.ok(inkRule && /dashed/.test(inkRule[0]) &&
      /var\(--paper-shadow\)/.test(inkRule[0]),
      'G-27/inkbox/inert — the ink box is distinguished from the drawn ' +
      'region by PATTERN (dashed) in the SAME var(--paper-shadow), never ' +
      'by a second hex. The sprite palette register stays at 13 (A-17). ' +
      'Found: ' + JSON.stringify(inkRule ? inkRule[0] : null));
  } });

  // (13) THE ASSERTION THAT ACTUALLY CARRIES THE REUSE CLAIM. Added because
  //      mutation (1) of task 2 PROVED that (10) does not: recomputing the
  //      extent inline leaves `is-the-extent` green, because an inline
  //      recomputation returns the same numbers. Behaviour cannot see a
  //      duplicated derivation; only source shape can.
  G27.push({ name: 'G-27/inkbox/reuses-decoPointExtent', fn: function () {
    const drag = bodyOf('attachPageDrag');
    assert.ok(drag.length > 2000,
      'G-27/inkbox/reuses-decoPointExtent — POSITIVE CONTROL: the ' +
      'comment-stripped drag body is ' + drag.length + ' chars. A shape ' +
      'check over an empty window passes forever');
    assert.ok(drag.indexOf('decoPointExtent(') !== -1,
      'G-27/inkbox/reuses-decoPointExtent — the drag must CALL the shipped ' +
      'decoPointExtent. A second extent computation is the same defect ' +
      'class as a second copy of a bound, and this phase has found that ' +
      'class about twenty-five times');
    assert.strictEqual(drag.indexOf('strokeList('), -1,
      'G-27/inkbox/reuses-decoPointExtent — and it must NOT reach ' +
      'strokeList, which is the only way to re-derive an extent inline. ' +
      'This is the half `is-the-extent` cannot carry: an inline ' +
      'recomputation returns the same numbers and leaves every behavioural ' +
      'assertion green');
    const calls = (g27AppCode.match(/decoPointExtent\(/g) || []).length;
    process.stdout.write('  G-27/inkbox/reuses-decoPointExtent ' +
      'decoPointExtent( call sites, comment-stripped: ' + calls + '\n');
    assert.strictEqual(calls, 3,
      'G-27/inkbox/reuses-decoPointExtent — pinned BY VALUE at 3: the ' +
      'definition, clampDecoOriginFor\'s call, and the drag\'s. A fourth ' +
      'live reference is a fourth place the extent could be read ' +
      'differently');
  } });

  // ---- run them ALL, print the roll call, then fail on the collected set --
  const g27Red = [];
  G27.forEach(function (c) {
    let err = null;
    try { c.fn(); } catch (e) { err = e; }
    process.stdout.write('  ' + (err ? 'RED  ' : 'green') + ' ' + c.name +
      (err ? ' :: ' + String(err.message).split('\n')[0].slice(0, 200) : '') +
      '\n');
    if (err) { g27Red.push(c.name); }
  });
  /* ⚠ 26.91-35: G-27's TWO CLOSING ASSERTS MOVED TO THE END OF THIS IIFE,
     BELOW G-28's ROLL CALL. They are unchanged in text and in meaning; only
     their POSITION moved, and the reason is a masking this wave measured on
     itself. G-28 was added after G-27 inside the same IIFE, so a red anywhere
     in G-27 threw here and G-28 NEVER RAN AT ALL — found by driving mutation
     M-10, which reddened `G-27/inkbox/present-during-drag` and reported
     nothing about the four G-28 assertions it was aimed at. That is the same
     principle both groups already state in their own words — *every check is
     executed rather than halted at the first failure, because the value
     before the fix is the LIST of what fails* — applied one level up, to the
     groups themselves. Both roll calls now always run; both closing asserts
     still fire. */

  // =====================================================================
  // ---- 26.91-35 TASK 2 (G-28/cancel): A CANCELLED PRESS LEAVES NOTHING
  //
  // LATENT AND PROVEN, AND SHE HAS NEVER SEEN IT. At HEAD there is no
  // `pointercancel` handler on the mark drag at all: the ink box is removed
  // ONLY in `onUp`. A press cancelled by the system rather than released by
  // her therefore strands the box for the rest of the session — through a
  // full repaint and through page turns — until the next `pointerup` on a
  // mark. Asked whether the box remains after an ordinary release she
  // answered *"gone"*, so the release path works in her hands and the
  // single-bug reading holds. This is fixed WITHOUT being claimed as
  // something she reported.
  //
  // THE FIVE ANTI-VACUITY QUESTIONS (26.91-VALIDATION.md), ANSWERED IN
  // WRITING FOR THIS GROUP:
  //
  //   1. CAN IT PASS BEFORE THE WORK? NO. Driven at HEAD before the handler
  //      landed: `G-28/cancel/no-stranded-box` measured ONE stranded box and
  //      `G-28/cancel/the-gesture-ended` measured ZERO repaints. Recorded by
  //      value in 26.91-35-SUMMARY.md. A rig reporting 0 stranded at HEAD
  //      would be a broken rig, and THAT would be the finding.
  //   2. CAN IT STILL PASS ONCE THE WORK IS BROKEN? NO. Four mutations were
  //      driven, each sha256-verified as LANDED before its exit code was
  //      believed, each red on its INTENDED named assertion: remove the
  //      cancel listener; make the cancel path commit; make the cancel path
  //      open the editor; make the teardown skip the node drop.
  //   3. DOES A DEGENERATE IMPLEMENTATION SATISFY IT? NO — and that is what
  //      the two RELEASE assertions are for. A cancel handler that swallowed
  //      the release path (or a teardown wired to fire on every event) would
  //      pass a box-count-only gate and fail `G-28/release/commits-exactly-
  //      once`. `G-28/cancel/tap-still-opens-the-editor` is the matching
  //      control for the editor: without it, "no editor after a cancel"
  //      passes on a rig where the editor never opens at all.
  //   4. IS IT READING EVALUATION ORDER OR SOURCE ORDER? EVALUATION, except
  //      for `G-28/cancel/one-teardown`, which is declared a SOURCE-SHAPE
  //      assertion in its own message — behaviour cannot see a duplicated
  //      teardown, because two copies that agree today behave identically.
  //   5. DOES THE GREP MATCH THE FIX'S OWN COMMENT? NO. `bodyOf` returns the
  //      COMMENT-STRIPPED body, and the positive control on its length keeps
  //      a shape check from passing over an empty window.
  // =====================================================================

  const G28 = [];

  /* Drive a REAL gesture through the REAL attachPageDrag and end it with
     `ending` — 'pointerup' or 'pointercancel'. The two paths differ in ONE
     string, so a difference in the readings below cannot be a difference in
     how the two were driven. */
  function g28Drive(rec, dx, dy, ending) {
    const H = g27DragHarness();
    H.state.DECORATIONS['08/04/2026'] = { reset: false, items: [rec] };
    const el = nbEl();
    const start = { x: rec.x, y: rec.y, a: rec.a, s: rec.s };
    H.attachPageDrag(el, rec);
    const undo0 = H.undoLen();
    el.fire('pointerdown', {
      clientX: 500, clientY: 500, pointerId: 1,
      preventDefault: function () {}, stopPropagation: function () {}
    });
    el.fire('pointermove', { clientX: 500 + dx, clientY: 500 + dy });
    const during = H.inkboxes().length;
    const repaints0 = H.state.repaints.length;
    el.fire(ending, {});
    /* every reading is taken AFTER the ending has run to completion, and the
       repaint the ending itself drives has therefore already happened — so
       "immediately" and "after a repaint" are the same measurement here, by
       construction rather than by assumption. */
    return {
      during: during,
      stranded: H.inkboxes().length,
      repaints: H.state.repaints.length - repaints0,
      undoGrew: H.undoLen() - undo0,
      posts: H.state.posted.length,
      editors: H.state.editors.length,
      start: start,
      after: { x: rec.x, y: rec.y, a: rec.a, s: rec.s }
    };
  }

  const CANCEL_REC = function () {
    return { page: 'abc123', kind: 'text', x: 250, y: 60, text: 'hi' };
  };

  // ---- (1) THE LEAK ITSELF. RED AT HEAD, measured at ONE. --------------
  G28.push({ name: 'G-28/cancel/no-stranded-box', fn: function () {
    const r = g28Drive(CANCEL_REC(), 40, 20, 'pointercancel');
    assert.strictEqual(r.during, 1,
      'G-28/cancel/no-stranded-box — PRECONDITION: exactly one ink box must ' +
      'exist mid-gesture, or the zero below is the zero of a gesture that ' +
      'never started. Measured ' + r.during);
    process.stdout.write('  G-28/cancel/no-stranded-box stranded after a ' +
      'dispatched pointercancel: ' + r.stranded + '\n');
    assert.strictEqual(r.stranded, 0,
      'G-28/cancel/no-stranded-box — after a dispatched `pointercancel` the ' +
      'page carries ' + r.stranded + ' ink box(es); expected 0. MEASURED 1 ' +
      'AT HEAD, where the box is removed only in `onUp`: a press cancelled ' +
      'by the system rather than released by her stranded the explanation ' +
      'for the rest of the session, through a full repaint and through page ' +
      'turns, until the next `pointerup` on a mark');
  } });

  // ---- (2) AND THE GESTURE ACTUALLY ENDED. RED AT HEAD, at ZERO. -------
  G28.push({ name: 'G-28/cancel/the-gesture-ended', fn: function () {
    const r = g28Drive(CANCEL_REC(), 40, 20, 'pointercancel');
    assert.strictEqual(r.repaints, 1,
      'G-28/cancel/the-gesture-ended — the cancel path must repaint EXACTLY ' +
      'once, so the mark is drawn back where it started; measured ' +
      r.repaints + '. ZERO AT HEAD, because nothing at all was listening. ' +
      'This is the assertion that separates *a cancel tears down* from *a ' +
      'cancel is unhandled*');
  } });

  // ---- (3) A CANCEL IS NOT A RELEASE: NOTHING IS COMMITTED. -----------
  //     Green at HEAD by accident — at HEAD nothing happens at all — and
  //     said so here rather than left to be mistaken for a red assertion.
  G28.push({ name: 'G-28/cancel/nothing-committed', fn: function () {
    const r = g28Drive(CANCEL_REC(), 40, 20, 'pointercancel');
    assert.deepStrictEqual(r.after, r.start,
      'G-28/cancel/nothing-committed — the record after a cancel is ' +
      JSON.stringify(r.after) + '; it must equal its pointerdown state ' +
      JSON.stringify(r.start). replace(/\s+/g, ' '));
    assert.strictEqual(r.undoGrew, 0,
      'G-28/cancel/nothing-committed — the undo stack grew by ' + r.undoGrew +
      '; a cancel must push NOTHING. An undo entry for a gesture she did not ' +
      'complete is an undo that undoes the wrong thing');
    assert.strictEqual(r.posts, 0,
      'G-28/cancel/nothing-committed — ' + r.posts + ' decoration post(s) ' +
      'were issued; expected 0. A cancel that posted would write her day ' +
      'for an interruption she did not make. NOTE: this assertion is GREEN ' +
      'AT HEAD, where the event is unhandled and nothing happens at all — ' +
      'it is the guard on the FIX, not the detector of the defect');
  } });

  // ---- (4) AND IT NEVER RAISES A TYPING SURFACE. ----------------------
  G28.push({ name: 'G-28/cancel/no-editor', fn: function () {
    // sub-threshold on purpose: 1 + 1 = 2 <= NB_DRAG_THRESHOLD (3), which is
    // EXACTLY the shape that reaches the editor branch on release.
    const r = g28Drive(CANCEL_REC(), 1, 1, 'pointercancel');
    assert.strictEqual(r.editors, 0,
      'G-28/cancel/no-editor — a cancel on a `text` record with ' +
      'sub-threshold movement raised ' + r.editors + ' hand-text editor(s); ' +
      'expected 0. That movement is precisely the shape that reaches the ' +
      'editor branch on RELEASE, so this is the assertion that separates *a ' +
      'cancel tears down* from *a cancel is a quiet tap*. A typing surface ' +
      'raised by an interruption she did not make is the worst of the four ' +
      'outcomes onUp can reach');
    assert.strictEqual(r.stranded, 0,
      'G-28/cancel/no-editor — and the box is gone on the sub-threshold ' +
      'path too (measured ' + r.stranded + '). The box is created at ' +
      'POINTERDOWN, before the 3 px threshold, so a cancelled press that ' +
      'never moved strands one just the same');
  } });

  // ---- (5) THE CONTROL FOR (4). Without it, (4) passes on a rig where
  //     the editor never opens at all.
  G28.push({ name: 'G-28/cancel/tap-still-opens-the-editor', fn: function () {
    const r = g28Drive(CANCEL_REC(), 1, 1, 'pointerup');
    assert.strictEqual(r.editors, 1,
      'G-28/cancel/tap-still-opens-the-editor — POSITIVE CONTROL: the SAME ' +
      'sub-threshold movement ended with a RELEASE must open exactly one ' +
      'editor; measured ' + r.editors + '. Without this, ' +
      '`G-28/cancel/no-editor` is satisfied by a rig whose editor never ' +
      'opens, and the two readings differ in ONE string');
  } });

  // ---- (6) THE RELEASE PATH SHE CONFIRMED STILL WORKS. ----------------
  G28.push({ name: 'G-28/release/commits-exactly-once', fn: function () {
    const r = g28Drive(CANCEL_REC(), 40, 20, 'pointerup');
    assert.strictEqual(r.undoGrew, 1,
      'G-28/release/commits-exactly-once — an ordinary release pushed ' +
      r.undoGrew + ' undo snapshot(s); expected exactly 1');
    assert.strictEqual(r.posts, 1,
      'G-28/release/commits-exactly-once — and issued ' + r.posts +
      ' decoration post(s); expected exactly 1');
    assert.ok(r.after.x !== r.start.x || r.after.y !== r.start.y,
      'G-28/release/commits-exactly-once — and the record carries the MOVED ' +
      'origin: ' + JSON.stringify(r.start) + ' -> ' +
      JSON.stringify(r.after) + '. A cancel handler that swallowed the ' +
      'release path would pass a box-count-only gate and fail here. She ' +
      'answered "gone" about the release path, and that answer must stay ' +
      'true');
    assert.strictEqual(r.stranded, 0,
      'G-28/release/commits-exactly-once — and the release still drops the ' +
      'box (measured ' + r.stranded + '). Factoring the teardown must not ' +
      'have moved it off the path that already worked');
  } });

  // ---- (7) ONE TEARDOWN, NOT TWO SPELLINGS THAT AGREE TODAY. ----------
  //     A SOURCE-SHAPE assertion, declared as one: behaviour cannot see a
  //     duplicated teardown, because two copies that agree behave alike.
  G28.push({ name: 'G-28/cancel/one-teardown', fn: function () {
    const drag = bodyOf('attachPageDrag');
    assert.ok(drag.length > 2000,
      'G-28/cancel/one-teardown — POSITIVE CONTROL: the comment-stripped ' +
      'drag body is ' + drag.length + ' chars. A shape check over an empty ' +
      'window passes forever');
    assert.ok(/addEventListener\('pointercancel'/.test(drag),
      'G-28/cancel/one-teardown — the mark drag must register a ' +
      '`pointercancel` listener beside its `pointerup`, which is the ' +
      'idiom this file already uses at the catalog drag (app.js:7450) ' +
      'rather than a new one invented here');
    const drops = (drag.match(/removeChild\(inkbox\)/g) || []).length;
    const offMove = (drag.match(/removeEventListener\('pointermove'/g) || [])
      .length;
    process.stdout.write('  G-28/cancel/one-teardown removeChild(inkbox) ' +
      'sites: ' + drops + ', removeEventListener(pointermove) sites: ' +
      offMove + '\n');
    assert.strictEqual(drops, 1,
      'G-28/cancel/one-teardown — the ink box must be dropped in exactly ' +
      'ONE place, reached by BOTH the release and the cancel paths; found ' +
      drops + '. A second copy is the same defect class as a second copy of ' +
      'a bound, which this phase has now found about twenty-five times');
    assert.strictEqual(offMove, 1,
      'G-28/cancel/one-teardown — and the listeners are removed in exactly ' +
      'ONE place too; found ' + offMove + '. A teardown split across two ' +
      'spellings drifts the first time one of them changes');
  } });

  // ---- run them ALL, print the roll call, then fail on the collected set --
  const g28Red = [];
  G28.forEach(function (c) {
    let err = null;
    try { c.fn(); } catch (e) { err = e; }
    process.stdout.write('  ' + (err ? 'RED  ' : 'green') + ' ' + c.name +
      (err ? ' :: ' + String(err.message).split('\n')[0].slice(0, 200) : '') +
      '\n');
    if (err) { g28Red.push(c.name); }
  });
  // ---- BOTH GROUPS HAVE NOW RUN. Only here may either one throw. --------
  assert.strictEqual(G27.length, 13,
    '(G-27) THIRTEEN named assertions, counted — so one cannot be dropped ' +
    'without the count noticing');
  assert.strictEqual(G28.length, 7,
    '(G-28) SEVEN named assertions, counted — so one cannot be dropped ' +
    'without the count noticing');
  assert.deepStrictEqual(g27Red, [],
    '(G-27) these named assertions are RED: ' + g27Red.join(', ') +
    '. Every check is executed rather than halted at the first failure, ' +
    'because this group\'s whole value before the fix is the LIST of what ' +
    'fails — a gate whose red state has never been seen is a gate nobody ' +
    'has checked can fail');
  assert.deepStrictEqual(g28Red, [],
    '(G-28) these named assertions are RED: ' + g28Red.join(', ') +
    '. Every check is executed rather than halted at the first failure, ' +
    'because this group\'s whole value before the fix is the LIST of what ' +
    'fails — a gate whose red state has never been seen is a gate nobody ' +
    'has checked can fail');
})();

// ===========================================================================
// ---- G-29: 26.91-36 (F-24 / D-11) — ONE TOOL AT A TIME --------------------
//
// HER RULING, AND IT IS NOT REOPENED HERE. `A-21` part 1: DISABLE the marks
// tin — greyed, and unpressable — while the pen or the `write` tool is armed.
// She chose that over *pressing the tin disarms the armed tool*; both were put
// to her as behaviourally different builds. She then raised it AGAIN herself,
// unprompted, after being told it was out of scope: "But I noticed the marks
// button should be disbaled while the pen or write button is enbaled".
//
// THE PRE-STATE, MEASURED BEFORE A SOURCE BYTE MOVED. With a tool armed the
// tin reported `disabled` undefined, className exactly `station-tin`, computed
// opacity 1 and computed pointer-events `auto`, and an attempted press left
// the armed flag TRUE while opening the tray. The tin was not merely styled as
// available — it WAS available, and two mark-making modes were live at once.
//
// THE SHAPE OF THE VACUOUS TEST THIS GROUP IS WRITTEN AGAINST:
//
//   - "the tin carries the disabled class when a tool is armed" is satisfied
//     by a tin that never painted at all — every disabled assertion is
//     trivially true of a node that does not exist. Hence the POSITIVE
//     CONTROL runs FIRST, in the same run: with NO tool armed the tin is
//     present, named, ungreyed, and its press OPENS THE TRAY.
//   - "the tin is greyed" is satisfied by the class alone, which MEASURED
//     LIVE leaves `disabled` false and the node keyboard-activatable — a
//     disabled LOOK with an open keyboard route. Her word was *unpressable*.
//   - "the tin is disabled" is satisfied by the native attribute alone, which
//     MEASURED LIVE paints NOTHING: `.station-tin` is not a `.btn`, so it has
//     no `:disabled` rule and reads opacity 1. Neither half is redundant and
//     BOTH are asserted separately.
//   - "the tin goes grey" is satisfied by a tin that goes grey AND STAYS
//     GREY. A chip that greys and never comes back is WORSE than the defect,
//     so all four disarm routes are DRIVEN, in both directions, and the
//     station-close-then-re-raise route — the one whose disarm site never
//     zeroes the flags — is driven rather than reasoned about.
//   - "the tin is unpressable" is satisfied while the TRAY IT OPENS sits live
//     behind it, placing marks from its own cards. Measured at HEAD: it did.
//
// THE FIVE ANTI-VACUITY QUESTIONS (26.91-VALIDATION.md), ANSWERED:
//   1. Can it pass before the work? NO — driven RED at HEAD; the failing
//      assertion names and their measured values are recorded by value in
//      26.91-36-SUMMARY.md.
//   2. Can it pass after the work is deliberately broken? NO — five mutations
//      were driven (drop the class, drop the native attribute, invert the
//      condition, read only ONE of the two armed flags, remove the tray
//      clear) and each reddened its intended named assertion.
//   3. Does a degenerate implementation satisfy it? NO — a tin that never
//      paints fails the positive control; a tin greyed unconditionally fails
//      all four return legs; a tin greyed by class only fails the native
//      half, and vice versa.
//   4. Evaluation order or source order? EVALUATION — every reading below
//      comes off a node the SHIPPED painter produced, driven through the
//      SHIPPED setters, the SHIPPED mode toggle and the SHIPPED station
//      raise. Nothing is asserted about a string in a file.
//   5. Does it match the fix's own comment? NO — the fix's comment says the
//      state is DERIVED rather than toggled; this group never reads that
//      claim, it drives the four routes that would break an imperative one.
// ===========================================================================

(function () {
  // ---- THE LIFT. Every class token and every label below comes out of
  //      app.js. A hand-typed `station-nb-off` would agree with itself
  //      forever, which is this phase's named defect class.
  function lift1(src, re, what) {
    const m = src.match(re);
    assert.ok(m && m[1],
      'G-29 lift: could not lift ' + what + ' out of app.js. A rename must ' +
      'report WHICH lift failed rather than skipping the group');
    return m[1];
  }
  // THE SHIPPED DISABLED TOKEN, LIFTED FROM THE BAND'S OWN ONE-RULE HELPER —
  // and it is the ONLY token this group knows. It is deliberately NOT lifted
  // a second time out of the tin's painter: a second lift would THROW at load
  // time before the fix exists, and a group that cannot be run RED at HEAD is
  // a group whose red state nobody has ever seen. The claim *the tin reuses
  // the shipped treatment rather than authoring a second one* is therefore an
  // ASSERTION (`G-29/one-disabled-treatment`) that goes red at HEAD, not a
  // load-time lift that aborts the whole group.
  const GLYPH_OFF_CLS = lift1(bodyOf('nbGlyphState'),
    /\(off \? ' ([a-z-]+)' : ''\)/, "nbGlyphState's disabled class token");
  const TIN_OFF_CLS = GLYPH_OFF_CLS;
  const TIN_WORD = lift1(bodyOf('renderTinTray'),
    /tin\.textContent = '([a-z]+)'/, "the tin's visible word");
  const TIN_BASE_CLS = lift1(bodyOf('renderTinTray'),
    /tin\.className = '([a-z-]+)'/, "the tin's base class");

  // ---- THE RIG. The shipped painter, the shipped setters, the shipped mode
  //      toggle and the SHIPPED STATION RAISE, all lifted as REAL SOURCE.
  //      `renderNotebookStation` is lifted whole rather than having its three
  //      flag lines re-typed here: the raise is the load-bearing half of route
  //      4 and a re-typed copy would be the harness agreeing with itself about
  //      the very statement under test. Its async tail is inert — `apiGet`
  //      returns a promise that never settles — so only the synchronous
  //      prologue, which is the part that zeroes the flags, executes.
  const TIN_DECLS = ['NB_BOUNDS', 'NB_DECO_CAP', 'NB_IMG_BOX', 'NB_STICKER_H',
    'NB_STICKERS', 'NB_TIN', 'NB_TRAY', 'NB_UNDO_CAP', 'NB_TEXT_BOX',
    'NB_MARK_BOUNDS', 'NB_GUTTER_X'];
  const TIN_FNS = ['clampDecoOrigin', 'decoDay', 'nbSnapshot',
    'applyNbSnapshot', 'pushNbUndo', 'nbClearResetForEdit', 'strokeList',
    'decoBox', 'paintStickerCrop', 'placeFromTray', 'renderTinTray',
    'dismissTray', 'nbSyncArmedClass', 'setNotebookPen', 'setNotebookWrite',
    'setNotebookDesign', 'renderNotebookStation',
    // 26.999 (2026-08-25 night): the notebook station now clears the quiet
    // wait mark as it paints (she is reading the pages right now), so the
    // lifted painter reaches these three. They are LIFTED WHOLE like every
    // other name here rather than stubbed — a stub would let the real
    // clearing rot untested behind a green suite. In this sandbox
    // `document.querySelector` answers null (see tinDoc) and `window` is
    // absent, which the shipped code already treats as "nothing to paint"
    // and "storage unavailable" respectively — both its real fail-open
    // arms, exercised here rather than mocked away.
    'stampNotebookSeen', 'applyNotebookMark', 'setWaitMarkArt'];
  const TIN_SRC = TIN_DECLS.map(declOf).join('\n') + '\n' +
    declOf('NB_SHEET_W') + '\n' +
    'var EMPTY_QUIET_LINE = ' + JSON.stringify('nothing here right now.') +
    ';\n' + TIN_FNS.map(function (n) { return extractFn(appSrc, n); })
      .join('\n');

  function tinDoc() {
    const doc = {
      __bodyCls: [],
      createElement: function (t) {
        const n = { tag: t, cls: '', attrs: {}, text: '', __on: {}, kids: [],
          style: { setProperty: function (k, v) { this.__p[k] = v; },
            __p: {} },
          addEventListener: function (t2, fn) {
            (this.__on[t2] = this.__on[t2] || []).push(fn);
          },
          removeEventListener: function () {},
          appendChild: function (c) { this.kids.push(c); },
          setAttribute: function (k, v) { this.attrs[k] = v; } };
        Object.defineProperty(n, 'className', {
          get: function () { return this.cls; },
          set: function (v) { this.cls = v; } });
        Object.defineProperty(n, 'textContent', {
          get: function () { return this.text; },
          set: function (v) { this.text = v; } });
        return n;
      },
      addEventListener: function () {}, removeEventListener: function () {},
      // 26.999: the wait-mark clearing looks for the notebook's art in the
      // room and in the desk zoom; in a lifted station neither exists, and
      // the shipped code's own guard is to do nothing. Answering null is
      // the truthful answer for this sandbox, not a convenience.
      querySelector: function () { return null; }
    };
    doc.body = { classList: {
      toggle: function (c, on) {
        const i = doc.__bodyCls.indexOf(c);
        if (on && i === -1) { doc.__bodyCls.push(c); }
        if (!on && i !== -1) { doc.__bodyCls.splice(i, 1); }
      },
      remove: function () {
        Array.prototype.slice.call(arguments).forEach(function (c) {
          const i = doc.__bodyCls.indexOf(c);
          if (i !== -1) { doc.__bodyCls.splice(i, 1); }
        });
      }
    } };
    return doc;
  }

  function tinRig(opts) {
    const o = opts || {};
    const doc = tinDoc();
    const calls = { repaint: 0, post: [] };
    const kids = [];
    const stationScene = {
      get firstChild() { return kids.length ? kids[0] : null; },
      removeChild: function (n) {
        const i = kids.indexOf(n); if (i !== -1) { kids.splice(i, 1); }
      },
      appendChild: function (n) { kids.push(n); },
      querySelector: function () { return null; }
    };
    const names = ['document', 'DESIGN', 'NBDESIGN', 'NB_PEN', 'NB_WRITE',
      'NB_PEN_GROUP', 'NB_TIN_OPEN', 'NB_TIN_TAB', 'NB_PLACE', 'NB_DAY',
      'DECORATIONS', 'NB_UNDO', 'NB_REDO', 'NB_SEL', 'NB_RESET_ARMED',
      'NB_REPAINT', 'postDecorations', 'StudyCore', 'recordIncident',
      'nbKeydown', '$', 'apiGet', 'loadDecorations', 'ROOM', 'SHELF',
      'STATION_NOTEBOOK', 'packBlessingsToc', 'blessingsMonthRoster',
      'paintNotebookSpread', 'updateNbButtons', 'console'];
    // eslint-disable-next-line no-new-func
    const api = new Function(names.join(','), TIN_SRC + '\nreturn {' +
      ' renderTin: renderTinTray, raise: renderNotebookStation,' +
      ' setNotebookPen: setNotebookPen,' +
      ' setNotebookWrite: setNotebookWrite,' +
      ' setNotebookDesign: setNotebookDesign,' +
      ' pen: function () { return NB_PEN; },' +
      ' write: function () { return NB_WRITE; },' +
      ' design: function () { return NBDESIGN; },' +
      ' tinOpen: function () { return NB_TIN_OPEN; },' +
      ' setPen: function (v) { NB_PEN = v; },' +
      ' setWrite: function (v) { NB_WRITE = v; },' +
      ' setTinOpen: function (v) { NB_TIN_OPEN = v; },' +
      // the STATION-POP disarm site, reproduced as the ONE THING it does to
      // this group's state: it drops NBDESIGN and LEAVES THE FLAGS ARMED.
      // That is `app.js:5873-5879`, whose own shipped comment says so. It is
      // not liftable by name (it is an anonymous callback inside
      // `zoomBackFromView`), so what it does is stated here EXPLICITLY rather
      // than smuggled in — and the assertion that follows is about the RAISE,
      // which IS lifted whole.
      ' closeStation: function () { NBDESIGN = false; },' +
      ' items: function () { return DECORATIONS["08/04/2026"].items; } };')(
      doc, false, o.designing === false ? false : true, !!o.pen, !!o.write,
      null, !!o.tinOpen, 'marks', { itemId: 'abc123', x0: 0 }, '08/04/2026',
      { '08/04/2026': { reset: false, items: [] } }, [], [], null, false,
      function () { calls.repaint++; },
      function (d) { calls.post.push(d); },
      { pickPickerImages: function () { return []; },
        guardSurface: function () { return null; } },
      function () {}, function () {},
      function () { return stationScene; },
      function () { return new Promise(function () {}); },
      function () { return new Promise(function () {}); },
      { items: {}, meta: {} },
      { cycle: null, filters: [], coverOffers: {} },
      { month: '', view: 0 }, function () { return []; },
      function () { return []; }, function () {}, function () {},
      { warn: function () {} });
    return { api: api, doc: doc, calls: calls };
  }

  // ONE paint of the shipped painter, and everything the group reads off it.
  function paintTin(r) {
    const nodes = [];
    r.api.renderTin({ appendChild: function (n) { nodes.push(n); } }, {}, {});
    const tin = nodes.filter(function (n) {
      return new RegExp('(^|\\s)' + TIN_BASE_CLS + '(\\s|$)').test(n.cls);
    })[0] || null;
    const tray = nodes.filter(function (n) {
      return /station-tin-tray/.test(n.cls);
    });
    const grid = tray.length ? tray[0].kids.filter(function (k) {
      return /tray-grid/.test(k.cls);
    })[0] : null;
    return { nodes: nodes, tin: tin, tray: tray,
      cards: grid ? grid.kids : [] };
  }
  function offCls(n) {
    return new RegExp('(^|\\s)' + TIN_OFF_CLS + '(\\s|$)').test(n.cls);
  }
  // A PRESS, MODELLED AS THE PLATFORM DELIVERS IT — and it is declared here
  // rather than hidden, because it is the one place this group is not simply
  // reading the painter's output.
  //
  // A real `<button disabled>` dispatches NO click at all, and
  // `pointer-events: none` swallows the pointer before it ever reaches the
  // node. A harness that invoked the handler regardless would be demanding
  // that app.js re-implement the browser inside its own click listener —
  // which is neither what her ruling asks for nor what ships.
  //
  // BOTH GATES ARE READ OFF THE NODE THE SHIPPED PAINTER PRODUCED, never off
  // a flag this file maintains, so removing either half of the fix makes this
  // function FIRE and the assertions below go red. The POSITIVE CONTROL above
  // uses this same function and REQUIRES it to fire, so it cannot degenerate
  // into a stub that never presses anything.
  //
  // ⚠ WHAT IT DOES NOT PROVE, STATED SO NOBODY INHERITS A SUSPICION: that the
  // PLATFORM really behaves this way is not asserted here and cannot be —
  // this document has no layout engine and no focus model. It is measured on
  // a live page by `G-29/live` in tests/test_live_render.cjs: opacity,
  // pointer-events and the disabled attribute, together, at every pinned
  // `--k`, with the armed and unarmed readings required to differ on all
  // three.
  function attemptPress(node) {
    if (node.disabled === true) { return 'blocked:disabled'; }
    if (offCls(node)) { return 'blocked:pointer-events'; }
    (node.__on.click || []).forEach(function (f) { f(); });
    return 'fired';
  }
  function slotOf(n) {
    return [n.style.__p['--x'], n.style.__p['--y'],
      n.style.__p['--w'], n.style.__p['--h']];
  }

  const G29 = [];

  // ---- (0) THE LIFTS AGREE. One idea, one spelling. ---------------------
  G29.push({ name: 'G-29/one-disabled-treatment', fn: function () {
    const tinSrc = bodyOf('renderTinTray');
    assert.ok(tinSrc.length > 2000,
      'G-29/one-disabled-treatment — POSITIVE CONTROL: the comment-stripped ' +
      'tin painter is ' + tinSrc.length + ' chars. A shape check over an ' +
      'empty window passes forever, and this file has already lost two ' +
      'window controls to exactly that (26.91-35 finding 4)');
    assert.ok(tinSrc.indexOf(GLYPH_OFF_CLS) !== -1,
      'G-29/one-disabled-treatment — the tin painter must apply the SHIPPED ' +
      'disabled token `' + GLYPH_OFF_CLS + '`, which is lifted out of the ' +
      'band\'s own nbGlyphState rather than typed here. `tokens.css` gives ' +
      'it `opacity: 0.45` — the shipped `.btn:disabled` value verbatim — ' +
      'plus `pointer-events: none`, and a SECOND disabled opacity would be ' +
      'a second spelling of one idea');
    const others = (tinSrc.match(/station-[a-z-]*-off\b/g) || [])
      .filter(function (t) { return t !== GLYPH_OFF_CLS; });
    assert.deepStrictEqual(others, [],
      'G-29/one-disabled-treatment — and it must author NO OTHER ' +
      'disabled-looking token; found ' + JSON.stringify(others));
  } });

  // ---- (1) THE POSITIVE CONTROL. It runs FIRST. -------------------------
  G29.push({ name: 'G-29/positive-control', fn: function () {
    const r = tinRig({});
    const p = paintTin(r);
    assert.ok(p.tin,
      'G-29/positive-control — with NO tool armed the tin must PAINT. ' +
      'Without this every disabled assertion below is satisfied by a tin ' +
      'that never existed');
    assert.strictEqual(p.tin.text, TIN_WORD,
      'G-29/positive-control — and carry its shipped word ' + TIN_WORD);
    assert.strictEqual(offCls(p.tin), false,
      'G-29/positive-control — and NOT be greyed; className read ' +
      JSON.stringify(p.tin.cls));
    assert.notStrictEqual(p.tin.disabled, true,
      'G-29/positive-control — and NOT carry the native disabled attribute');
    assert.strictEqual(attemptPress(p.tin), 'fired',
      'G-29 press: the platform would deliver this press');
    assert.strictEqual(r.api.tinOpen(), true,
      'G-29/positive-control — and a press must OPEN the tray. A tin that ' +
      'never opened anything satisfies "an armed press opens nothing" for ' +
      'free');
    assert.strictEqual(paintTin(r).tray.length, 1,
      'G-29/positive-control — and the tray really paints, by count');
  } });

  // ---- (2) BOTH HALVES, ASSERTED SEPARATELY, IN BOTH ARMED STATES ------
  [['pen', { pen: true }], ['write', { write: true }]].forEach(function (c) {
    G29.push({ name: 'G-29/' + c[0] + '-armed/class', fn: function () {
      const p = paintTin(tinRig(c[1]));
      assert.ok(p.tin, 'G-29/' + c[0] + '-armed/class — the tin must paint');
      assert.strictEqual(offCls(p.tin), true,
        'G-29/' + c[0] + '-armed/class — with `' + c[0] + '` armed the tin ' +
        'must wear the SHIPPED disabled class `' + TIN_OFF_CLS + '`; ' +
        'className read ' + JSON.stringify(p.tin.cls) + '. This is the ' +
        'POINTER half and the LOOK: `.station-nb-off` is opacity 0.45 plus ' +
        '`pointer-events: none`, measured live');
      assert.strictEqual(p.tin.attrs['data-nb-off'], '1',
        'G-29/' + c[0] + '-armed/class — and the shipped off-MARKER ' +
        'attribute, set the way nbGlyphState sets it; read ' +
        JSON.stringify(p.tin.attrs['data-nb-off']));
    } });
    G29.push({ name: 'G-29/' + c[0] + '-armed/native', fn: function () {
      const p = paintTin(tinRig(c[1]));
      assert.strictEqual(p.tin.disabled, true,
        'G-29/' + c[0] + '-armed/native — with `' + c[0] + '` armed the tin ' +
        'must ALSO carry the NATIVE disabled attribute; read ' +
        JSON.stringify(p.tin.disabled) + '. THIS HALF IS NOT REDUNDANT AND ' +
        'IT WAS MEASURED, NOT ASSUMED: on a live page the class ALONE ' +
        'leaves `disabled` false and the node keyboard-activatable — a ' +
        'disabled LOOK with an open keyboard route — and the attribute ' +
        'ALONE paints NOTHING (opacity 1, pointer-events auto), because ' +
        '`.station-tin` is not a `.btn` and has no `:disabled` rule. Her ' +
        'word was UNPRESSABLE, so the keyboard route closes too');
    } });
  });

  // ---- (3) HER RULING, NOT ITS ALTERNATIVE. ----------------------------
  G29.push({ name: 'G-29/press-does-not-disarm', fn: function () {
    const r = tinRig({ pen: true });
    const p = paintTin(r);
    assert.strictEqual(attemptPress(p.tin), 'blocked:disabled',
      'G-29/press-does-not-disarm — the press never reaches the handler at ' +
      'all: a `<button disabled>` dispatches no click. At HEAD this read ' +
      '`fired`');
    assert.strictEqual(r.api.pen(), true,
      'G-29/press-does-not-disarm — an attempted press on the greyed tin ' +
      'must leave the armed flag UNCHANGED. She was offered *pressing the ' +
      'tin disarms the armed tool* and chose *grey it and make it ' +
      'unpressable* instead; implementing the alternative she rejected is a ' +
      'prohibition of this plan, not a nicety');
    assert.strictEqual(r.api.tinOpen(), false,
      'G-29/press-does-not-disarm — and it must open NOTHING; the tray ' +
      'flag read ' + JSON.stringify(r.api.tinOpen()));
    assert.strictEqual(paintTin(r).tray.length, 0,
      'G-29/press-does-not-disarm — asserted by NODE COUNT as well as by ' +
      'the flag, because a flag nobody paints from is not a measurement');
  } });

  // ---- (4) THE RETURN LEG. FOUR ROUTES, EVERY ONE DRIVEN. --------------
  //     The stranding failure mode lives ENTIRELY here. A gate that only
  //     proves the greyed state is half a gate.
  G29.push({ name: 'G-29/return/pen-disarmed', fn: function () {
    const r = tinRig({ pen: true });
    assert.strictEqual(offCls(paintTin(r).tin), true,
      'G-29/return/pen-disarmed — precondition: greyed while armed');
    r.api.setNotebookPen(false);
    const p = paintTin(r);
    assert.strictEqual(offCls(p.tin), false,
      'G-29/return/pen-disarmed — ROUTE 1: putting the pen down through ' +
      'the SHIPPED setter brings the tin back; className read ' +
      JSON.stringify(p.tin.cls));
    assert.notStrictEqual(p.tin.disabled, true,
      'G-29/return/pen-disarmed — and drops the native attribute too');
    assert.strictEqual(attemptPress(p.tin), 'fired',
      'G-29 press: the platform would deliver this press');
    assert.strictEqual(r.api.tinOpen(), true,
      'G-29/return/pen-disarmed — and it is PRESSABLE again, driven ' +
      'rather than inferred from a class');
  } });

  G29.push({ name: 'G-29/return/reciprocal-then-disarmed', fn: function () {
    const r = tinRig({ pen: true });
    r.api.setNotebookWrite(true);
    assert.deepStrictEqual([r.api.pen(), r.api.write()], [false, true],
      'G-29/return/reciprocal-then-disarmed — precondition: the RECIPROCAL ' +
      'exclusion fired, so the pen is down and `write` is up');
    assert.strictEqual(offCls(paintTin(r).tin), true,
      'G-29/return/reciprocal-then-disarmed — and the tin is still greyed ' +
      'across the hand-off. A derivation reading only ONE of the two flags ' +
      'passes every pen row above and fails HERE');
    r.api.setNotebookWrite(false);
    const p = paintTin(r);
    assert.strictEqual(offCls(p.tin), false,
      'G-29/return/reciprocal-then-disarmed — ROUTE 2: and comes back when ' +
      '`write` goes down');
    assert.strictEqual(attemptPress(p.tin), 'fired',
      'G-29 press: the platform would deliver this press');
    assert.strictEqual(r.api.tinOpen(), true,
      'G-29/return/reciprocal-then-disarmed — pressable again');
  } });

  G29.push({ name: 'G-29/return/mode-exit-reenter', fn: function () {
    const r = tinRig({ pen: true });
    assert.strictEqual(offCls(paintTin(r).tin), true,
      'G-29/return/mode-exit-reenter — precondition: greyed while armed. ' +
      'Stated as a precondition rather than assumed, because without it the ' +
      'row below asserts "not greyed" against a build where nothing is ever ' +
      'greyed — green for the wrong reason, forever');
    r.api.setNotebookDesign(false);
    assert.deepStrictEqual([r.api.pen(), r.api.write()], [false, false],
      'G-29/return/mode-exit-reenter — precondition: leaving arranging ' +
      'zeroes BOTH flags at setNotebookDesign\'s labelled disarm site');
    r.api.setNotebookDesign(true);
    const p = paintTin(r);
    assert.ok(p.tin,
      'G-29/return/mode-exit-reenter — re-entering arranging paints the tin');
    assert.strictEqual(offCls(p.tin), false,
      'G-29/return/mode-exit-reenter — ROUTE 3: and it is live; className ' +
      'read ' + JSON.stringify(p.tin.cls));
    assert.strictEqual(attemptPress(p.tin), 'fired',
      'G-29 press: the platform would deliver this press');
    assert.strictEqual(r.api.tinOpen(), true,
      'G-29/return/mode-exit-reenter — pressable again');
  } });

  G29.push({ name: 'G-29/return/station-reraise', fn: function () {
    const r = tinRig({ pen: true });
    assert.strictEqual(offCls(paintTin(r).tin), true,
      'G-29/return/station-reraise — precondition: greyed while armed, ' +
      'asserted BEFORE the station closes (once it closes nothing paints). ' +
      'Same reason as route 3: without it the row below is green on a build ' +
      'where nothing is ever greyed');
    // the pop site: NBDESIGN drops, the flags DO NOT.
    r.api.closeStation();
    assert.deepStrictEqual([r.api.pen(), r.api.design()], [true, false],
      'G-29/return/station-reraise — precondition, AND THE LOAD-BEARING ' +
      'ONE: closing the station leaves the pen ARMED. `app.js:5876-5877` ' +
      'says so in its own shipped comment — "this site never dropped ' +
      'NB_PEN/NB_WRITE". This is the route an IMPERATIVELY toggled chip ' +
      'gets wrong');
    r.api.raise();
    assert.deepStrictEqual([r.api.pen(), r.api.write()], [false, false],
      'G-29/return/station-reraise — the SHIPPED renderNotebookStation, ' +
      'lifted whole and EXECUTED, zeroes both flags on a raise');
    r.api.setNotebookDesign(true);
    const p = paintTin(r);
    assert.ok(p.tin,
      'G-29/return/station-reraise — and the tin paints on re-entry. (A ' +
      'raise lands in READING mode by design, so arranging is re-entered ' +
      'here — that is the real sequence, not a shortcut: setNotebookDesign ' +
      'does NOT zero the flags on the way IN, so if the raise had not ' +
      'zeroed them this assertion would find a greyed tin)');
    assert.strictEqual(offCls(p.tin), false,
      'G-29/return/station-reraise — ROUTE 4: and it is live; className ' +
      'read ' + JSON.stringify(p.tin.cls));
    assert.strictEqual(attemptPress(p.tin), 'fired',
      'G-29 press: the platform would deliver this press');
    assert.strictEqual(r.api.tinOpen(), true,
      'G-29/return/station-reraise — pressable again');
  } });

  // ---- (5) THE TRAY CANNOT SIT LIVE BEHIND A GREYED TIN. ---------------
  G29.push({ name: 'G-29/tray-not-live-behind', fn: function () {
    // THE POSITIVE CONTROL FIRST, in the same run: with the tray open and NO
    // tool armed the tray really paints and its cards really place a mark.
    // Without it, "zero tray nodes" is satisfied by a rig whose tray never
    // painted and whose cards never worked.
    const ctl = tinRig({ tinOpen: true });
    const cp = paintTin(ctl);
    assert.strictEqual(cp.tray.length, 1,
      'G-29/tray-not-live-behind — POSITIVE CONTROL: with the tray open and ' +
      'nothing armed the tray paints (count ' + cp.tray.length + ')');
    assert.ok(cp.cards.length > 0,
      'G-29/tray-not-live-behind — POSITIVE CONTROL: and holds ' +
      cp.cards.length + ' sticker card(s)');
    attemptPress(cp.cards[0]);
    assert.strictEqual(ctl.api.items().length, 1,
      'G-29/tray-not-live-behind — POSITIVE CONTROL: and pressing one ' +
      'really PLACES A MARK. Measured at HEAD, this is exactly what stayed ' +
      'live behind the greyed tin');

    [['pen', 'setNotebookPen'], ['write', 'setNotebookWrite']]
      .forEach(function (c) {
        const r = tinRig({ tinOpen: true });
        r.api[c[1]](true);
        assert.strictEqual(r.api.tinOpen(), false,
          'G-29/tray-not-live-behind — arming `' + c[0] + '` with the tray ' +
          'open must CLEAR the tray flag; read ' +
          JSON.stringify(r.api.tinOpen()));
        const p = paintTin(r);
        assert.strictEqual(p.tray.length, 0,
          'G-29/tray-not-live-behind — and ZERO tray nodes paint, asserted ' +
          'BY COUNT (measured ' + p.tray.length + '). Leaving the tray up ' +
          'is the same two-modes-at-once defect one level in, inside the ' +
          'fix for it — a control that reads as applied and is not');
        assert.strictEqual(p.cards.length, 0,
          'G-29/tray-not-live-behind — and no sticker card survives to be ' +
          'pressed (measured ' + p.cards.length + ')');
      });
  } });

  // ---- (6) THE STATE MOVED; THE BAND DID NOT. --------------------------
  G29.push({ name: 'G-29/geometry-and-name-unmoved', fn: function () {
    const off = paintTin(tinRig({ pen: true })).tin;
    const on = paintTin(tinRig({})).tin;
    assert.deepStrictEqual(slotOf(off), slotOf(on),
      'G-29/geometry-and-name-unmoved — the tin\'s slot is IDENTICAL armed ' +
      'and unarmed: ' + JSON.stringify(slotOf(off)) + ' vs ' +
      JSON.stringify(slotOf(on)) + '. This plan changes a control\'s STATE, ' +
      'never the band\'s layout — DISABLED, NOT HIDDEN, because a band whose ' +
      'control count changed would reflow the row and move the reset and ' +
      'exit targets under her finger');
    [off, on].forEach(function (n) {
      assert.strictEqual(n.attrs['aria-label'], n.text,
        'G-29/geometry-and-name-unmoved — the accessible name equals the ' +
        'visible text in BOTH states (the G-C1 findability contract). A ' +
        'DISABLED CONTROL KEEPS ITS NAME; greying is not a licence to ' +
        'change or remove a label');
      assert.strictEqual(n.text, TIN_WORD,
        'G-29/geometry-and-name-unmoved — and the word is still ' + TIN_WORD);
    });
    assert.ok(new RegExp('^' + TIN_BASE_CLS + '(\\s|$)').test(off.cls),
      'G-29/geometry-and-name-unmoved — and the greyed tin KEEPS its own ' +
      'base class `' + TIN_BASE_CLS + '`; the disabled token is added ' +
      'ALONGSIDE it, never instead of it. className read ' +
      JSON.stringify(off.cls));
  } });

  // ---- (7) THE NO-FIFTH-SITE PIN. ------------------------------------
  //     The claim "there is no fifth place to remember" is what makes the
  //     derived state safe. It is PINNED BY VALUE rather than asserted in
  //     prose, and the site list travels in the failure message so a later
  //     reader sees WHAT moved rather than only that something did.
  G29.push({ name: 'G-29/no-fifth-site', fn: function () {
    const lines = appCode.split('\n');
    const sites = [];
    lines.forEach(function (l, i) {
      const m = l.match(/\bNB_(?:PEN|WRITE)\s*=(?!=)/g);
      if (m) {
        for (let j = 0; j < m.length; j++) {
          sites.push((i + 1) + ': ' + l.trim());
        }
      }
    });
    process.stdout.write('  G-29/no-fifth-site armed-flag writer sites: ' +
      sites.length + '\n');
    assert.ok(appCode.length > 100000,
      'G-29/no-fifth-site — POSITIVE CONTROL: the comment-stripped window is ' +
      appCode.length + ' chars, against an ABSOLUTE floor. Not a fraction of ' +
      'the raw file: 26.91-35 measured two window controls of that shape ' +
      'sitting 431 characters from tripping, in a repo whose house style ' +
      'writes a comment block at every change site');
    assert.ok(appCode.indexOf('function nbSyncArmedClass(') !== -1,
      'G-29/no-fifth-site — POSITIVE CONTROL: and it still contains the ' +
      'named code landmark `function nbSyncArmedClass(`. A stripper that ate ' +
      'CODE and kept comments leaves a LARGE window and a meaningless one, ' +
      'which passes a size floor alone');
    assert.strictEqual(sites.length, 10,
      'G-29/no-fifth-site — EXACTLY TEN comment-stripped assignments to ' +
      '`NB_PEN` or `NB_WRITE` exist in app.js; found ' + sites.length + '. ' +
      'The ten are the two module declarations, the station raise (2), ' +
      'setNotebookDesign\'s exit (2) and the two setters (4).\n' +
      'SITES:\n  ' + sites.join('\n  ') + '\n' +
      'A NEW WRITER APPEARING LATER MUST MAKE THIS PIN RED, and this is what ' +
      'it is asking of whoever adds one: the tin\'s off state is DERIVED at ' +
      'paint time, so a new writer is SAFE — but only if it REACHES A ' +
      'REPAINT. That is the thing to check, and checking it is the pin\'s ' +
      'real job. It is NOT asking you to grey the tin by hand at your new ' +
      'site: doing that is the imperative build this fix exists to avoid, ' +
      'and it strands (app.js:5876 is a disarm site that deliberately never ' +
      'zeroes the flags).');
  } });

  // ---- (8) THE UNDO/REDO ASYMMETRY, MEASURED AND RECORDED. -------------
  //     PRE-EXISTING, NOT `F-24`, AND DELIBERATELY NOT FIXED HERE.
  //     `nbGlyphState` gives undo and redo the shipped class and the
  //     `data-nb-off` marker but NEVER the native disabled attribute, so the
  //     band's two existing disabled controls remain KEYBOARD ACTIVATABLE
  //     while visually disabled. Widening the fix to them is not her ruling.
  //     It is measured here rather than left as a suspicion, and asserted so
  //     that closing it later is a DELIBERATE edit to this line rather than a
  //     silent one.
  G29.push({ name: 'G-29/undo-redo-asymmetry-recorded', fn: function () {
    const r = paintBand(0, 0);
    const glyphs = r.nodes.filter(function (n) {
      return n.attrs['data-nb-stack'];
    });
    assert.strictEqual(glyphs.length, 2,
      'G-29/undo-redo-asymmetry-recorded — POSITIVE CONTROL: the band paints ' +
      'exactly two glyph controls to measure; found ' + glyphs.length);
    const marks = glyphs.map(function (n) { return n.attrs['data-nb-off']; });
    const natives = glyphs.map(function (n) { return n.disabled; });
    // printed with String(), not JSON.stringify: JSON renders `undefined`
    // inside an array as `null`, which would read as a value that was set.
    process.stdout.write('  G-29/undo-redo-asymmetry undo/redo data-nb-off=' +
      JSON.stringify(marks) + ' native disabled=[' +
      natives.map(String).join(', ') + ']' +
      '; tin native disabled(armed)=' +
      JSON.stringify(paintTin(tinRig({ pen: true })).tin.disabled) + '\n');
    assert.deepStrictEqual(marks, ['1', '1'],
      'G-29/undo-redo-asymmetry-recorded — both glyphs really ARE in the ' +
      'disabled state here (empty history), so the reading below is about a ' +
      'disabled control rather than about an enabled one');
    assert.deepStrictEqual(natives, [undefined, undefined],
      'G-29/undo-redo-asymmetry-recorded — and NEITHER carries the native ' +
      'disabled attribute; read ' + JSON.stringify(natives) + '. THIS IS ' +
      'PRE-EXISTING AND IT IS NOT `F-24`: the consequence is that the band\'s ' +
      'two existing disabled controls stay KEYBOARD ACTIVATABLE while ' +
      'visually disabled. The tin, whose state this plan adds, carries BOTH ' +
      'halves. Recorded rather than widened, because widening is not her ' +
      'ruling. IF A LATER PLAN CLOSES THIS, IT MUST EDIT THIS LINE ' +
      'DELIBERATELY — which is the whole point of pinning a known gap.');
  } });

  // ---- run them ALL, print the roll call, then fail on the collected set --
  const g29Red = [];
  G29.forEach(function (c) {
    let err = null;
    try { c.fn(); } catch (e) { err = e; }
    process.stdout.write('  ' + (err ? 'RED  ' : 'green') + ' ' + c.name +
      (err ? ' :: ' + String(err.message).split('\n')[0].slice(0, 220) : '') +
      '\n');
    if (err) { g29Red.push(c.name); }
  });
  assert.strictEqual(G29.length, 15,
    '(G-29) FIFTEEN named assertions, counted — so one cannot be dropped ' +
    'without the count noticing');
  assert.deepStrictEqual(g29Red, [],
    '(G-29) these named assertions are RED: ' + g29Red.join(', ') +
    '. Every check is executed rather than halted at the first failure, ' +
    'because this group\'s whole value before the fix is the LIST of what ' +
    'fails — a gate whose red state has never been seen is a gate nobody ' +
    'has checked can fail');
})();

// ---- G-30: 26.91-37 (F-25 / D-12) — ONE CREATION GESTURE, NOT TWO ---------
//
// HER RULING, TAKEN 2026-08-11 (`26.91-CONTEXT.md` `A-26`, ruling 2): REMOVE
// THE STRAY EMPTY MARK **AND** CLOSE THE PATH THAT MINTED IT. Chosen over
// *leave it, decide later* and over *close the path, leave the mark*. `D-12`
// spent a whole round recorded as a ROUTING WITH NO RULING — she was never
// asked — and this is the first gate entitled to act on the answer.
//
// WHAT WENT WRONG. An EMPTY `write something` mark appeared on her
// `08/07/2026` page during the fourth seal session. Nobody placed it on
// purpose. `A-20` records that the app NEVER mints a mark she did not ask
// for, and that this was the COST which moved her off the literal reading of
// her own `F-22` sentence onto `first-tap` — so a mark minted unasked is that
// invariant failing, in the same round that shipped the ruling resting on it.
//
// WHICH CALLER CLOSES IS MEASURED, NOT READ. `nbPlaceTextRecord` has exactly
// two callers: the armed `write` pointerdown via `nbCanvasPointerHandler`, and
// the `dblclick` listener registered in `paintPageDecorations`. Both are DRIVEN
// here across four input shapes BEFORE either changes, and the caller that
// creates a record WITH NO DELIBERATE ARMING ACT is the one that is retired.
// A reading of the source would have named the same one; a reading is not a
// measurement, and this phase has been wrong about a source reading before.
//
// ⚠ `A-20` IS NOT REOPENED. The armed `write` first-tap is asked-for BY
// CONSTRUCTION — arming is a deliberate act, the band names the tool, and SHE
// WORDED ITS PROMPT HERSELF. Her `first-tap` ruling and her prompt's wording
// are untouched by this plan, and the prompt literal's occurrence count is
// asserted unchanged below so that "untouched" is measured rather than said.
//
// THE SHAPE OF THE VACUOUS TEST THIS GROUP IS WRITTEN AGAINST:
//
//   - "the double-click no longer creates" is satisfied by a rig whose canvas
//     never painted, or whose listener list was never populated — every
//     zero-creation assertion is trivially true of a gesture that cannot
//     fire. Hence the THREE POSITIVE MEASUREMENTS run FIRST, in the same run:
//     the armed tap must create exactly ONE, and the unarmed and pen-armed
//     taps must create ZERO through the SAME driven canvas.
//   - "one creation gesture" is satisfied by removing BOTH, leaving her with
//     no way to place a mark at all. Hence the surviving gesture is driven
//     for a record AND for the editor it opens, in the same run.
//   - "the path is closed" is satisfied by deleting `nbPlaceTextRecord`
//     outright — which would take the cap refusal, the undo push, the write
//     and the editor with it. Hence the tail is asserted intact.
//   - "a mark she did not ask for cannot appear" is satisfied by making a
//     PLACED-BUT-UNTYPED mark vanish on the next repaint — which would break
//     UI-SPEC `empty | E4`, a SHIPPED design commitment, while claiming to
//     honour a different one. Hence the untyped record is created through the
//     surviving gesture, left untyped, repainted, and asserted STILL THERE.
//   - "the rationale was dealt with" is satisfied by deleting the paragraph
//     that argued for keeping the gesture, leaving a silence where the
//     history used to be. Hence the paragraph is asserted STILL PRESENT and
//     carrying a dated clause naming the measurement that overturned it.
//
// THE FIVE ANTI-VACUITY QUESTIONS (26.91-VALIDATION.md), ANSWERED:
//   1. Can it pass before the work? NO — driven RED at HEAD; the failing
//      names and their measured values are recorded by value in
//      26.91-37-SUMMARY.md.
//   2. Can it pass once deliberately broken? NO — five mutations are driven,
//      each sha256-verified as LANDED before its exit code is believed, each
//      red on its own INTENDED named assertion.
//   3. Does a degenerate implementation satisfy it? The five forms above are
//      each closed by a named row rather than by a comment.
//   4. Evaluation order or source order? EVALUATION for every behavioural
//      claim — the listeners driven are the ones the REAL painter attached to
//      the REAL canvas node. The two source rows (the registration count and
//      the rationale clause) are LABELLED as source rows and each is paired
//      with a driven half.
//   5. Is the fixture the thing? YES — `tailPaint` runs the shipped
//      `paintPageDecorations` and the shipped setters, lifted whole.
(function () {
  const G30 = [];
  function g(name, fn) { G30.push({ name: name, fn: fn }); }

  // A scene whose querySelector RESOLVES, so the editor-opening tail of
  // `nbPlaceTextRecord` is reachable. The shared `tailRig` scene returns null
  // by design, which would make "the surviving gesture opens the editor"
  // silently unmeasurable rather than false.
  function editableRig(opts) {
    const rig = tailRig(opts);
    const stub = { cls: 'page-deco page-deco-text', attrs: {} };
    rig.scene.querySelector = function (sel) {
      return String(sel).indexOf('page-deco-text') !== -1 ? stub : null;
    };
    rig.api.paint({ itemId: 'abc123', dayLabel: '08/04/2026' }, 'left',
      rig.scene);
    return rig;
  }

  // ---- THE MEASUREMENT: BOTH CALLERS, FOUR INPUT SHAPES, BEFORE EITHER
  // ---- CHANGES. Printed as a table so the caller that closes is named FROM
  // ---- THIS, not from a reading of the source.
  function drive(shape) {
    const rig = tailPaint(shape.arm);
    const c = rig.canvas();
    const before = rig.items().length;
    const list = c.handlers[shape.evt];
    let fired = 0;
    if (list && list.length) { list[0]({ clientX: 40, clientY: 30 }); fired = 1; }
    return { records: rig.items().length - before, before: before,
      listeners: (list || []).length, fired: fired };
  }
  const SHAPES = [
    { key: 'write armed  + pointerdown', arm: { write: true }, evt: 'pointerdown', deliberate: true },
    { key: 'nothing armed+ pointerdown', arm: {}, evt: 'pointerdown', deliberate: false },
    { key: 'pen armed    + pointerdown', arm: { pen: true }, evt: 'pointerdown', deliberate: false },
    { key: 'nothing armed+ dblclick   ', arm: {}, evt: 'dblclick', deliberate: false },
    { key: 'pen armed    + dblclick   ', arm: { pen: true }, evt: 'dblclick', deliberate: false }
  ];
  const M = {};
  process.stdout.write(
    '  G-30 CALLER MEASUREMENT (both callers, before either changes)\n');
  SHAPES.forEach(function (s) {
    const r = drive(s);
    M[s.key] = r;
    process.stdout.write(
      '    ' + s.key + '  listeners=' + r.listeners +
      ' fired=' + r.fired + ' records_created=' + r.records +
      (r.records > 0 && !s.deliberate ? '   <== MINTS WITHOUT ARMING' : '') +
      '\n');
  });

  g('G-30/measure/write-armed-pointerdown-creates-one', function () {
    assert.strictEqual(M['write armed  + pointerdown'].records, 1,
      '(G-30) POSITIVE MEASUREMENT, RUN FIRST: with `write` armed a single ' +
      'pointerdown on the REAL painted canvas creates EXACTLY ONE record. ' +
      'Every zero-creation row below is trivially true of a canvas that ' +
      'never painted or a listener list that was never populated, so this ' +
      'row is what makes those rows mean anything');
  });
  g('G-30/measure/unarmed-pointerdown-creates-zero', function () {
    assert.strictEqual(M['nothing armed+ pointerdown'].records, 0,
      '(G-30) POSITIVE ZERO: a plain unarmed tap creates nothing. This is ' +
      '26.9 F-7, which the owner hit as six empty marks on one page from ' +
      'ordinary clicking, and it stays closed');
  });
  g('G-30/measure/pen-armed-pointerdown-creates-zero', function () {
    assert.strictEqual(M['pen armed    + pointerdown'].records, 0,
      '(G-30) POSITIVE ZERO: with the PEN armed a tap creates no text ' +
      'record — the pen owns the gesture and returns before any creation ' +
      '(T-26.91-07, two armed tools contending for one pointerdown)');
  });
  g('G-30/retired/unarmed-dblclick-creates-zero', function () {
    assert.strictEqual(M['nothing armed+ dblclick   '].records, 0,
      '(G-30) ⚠ THE CULPRIT, NAMED BY MEASUREMENT: a double-click with ' +
      'NOTHING ARMED must create NOTHING. At HEAD it created a record — ' +
      'and a plain select-then-select produces exactly this event shape, ' +
      'so an ordinary pair of clicks on her page minted an empty mark she ' +
      'never asked for. THAT IS `A-20`\'s invariant failing, and it is the ' +
      'defect `D-12`/`F-25` records. This caller requires NO deliberate ' +
      'arming act, which is what names it for retirement');
  });
  g('G-30/retired/pen-armed-dblclick-creates-zero', function () {
    assert.strictEqual(M['pen armed    + dblclick   '].records, 0,
      '(G-30) AND IT MINTED EVEN WITH THE PEN ARMED — the dblclick listener ' +
      'consulted NEITHER armed flag, only NBDESIGN. So it could mint a text ' +
      'record mid-drawing, which the pointerdown path is explicitly guarded ' +
      'against. Recorded as its own row because it is a strictly worse ' +
      'reading of the same defect and a fix that closed only the unarmed ' +
      'case would leave it standing');
  });
  g('G-30/retired/listener-not-attached', function () {
    const c = tailPaint({ write: true }).canvas();
    assert.strictEqual((c.handlers.dblclick || []).length, 0,
      '(G-30) DRIVEN HALF: the REAL painter attaches ZERO dblclick ' +
      'listeners to the REAL canvas node. Paired with the source row below ' +
      'on purpose — a source count of zero is satisfied by a registration ' +
      'that moved somewhere a grep does not look');
  });
  g('G-30/retired/listener-not-in-source', function () {
    assert.strictEqual(
      (appCode.match(/addEventListener\('dblclick'/g) || []).length, 0,
      '(G-30) SOURCE ROW, labelled as one: no dblclick listener is ' +
      'registered anywhere in app.js. Paired with the driven half above, ' +
      'because a driven zero is satisfied by a listener registered under a ' +
      'condition this fixture happens not to meet');
  });
  g('G-30/surviving/one-tap-one-record', function () {
    const rig = editableRig({ write: true });
    const c = rig.canvas();
    c.handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
    assert.strictEqual(rig.items().length, 1,
      '(G-30) THE GESTURE SHE CHOOSES DELIBERATELY STILL WORKS: `write` ' +
      'armed, one tap, exactly one record. "One creation gesture instead of ' +
      'two" is satisfied by removing BOTH, which would leave her unable to ' +
      'place a mark at all');
  });
  g('G-30/surviving/opens-the-editor', function () {
    const rig = editableRig({ write: true });
    const c = rig.canvas();
    c.handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
    assert.strictEqual(rig.calls.edited.length, 1,
      '(G-30) and it OPENS THE EDITOR on the record it just made — the ' +
      'tail`s editor-opening half is reached, not merely present. The ' +
      'shared rig`s scene resolves nothing by design, so this row uses a ' +
      'scene whose querySelector answers; without it the claim would be ' +
      'silently unmeasurable rather than false');
  });
  g('G-30/surviving/pen-guard-intact', function () {
    const rig = tailPaint({ pen: true });
    const c = rig.canvas();
    c.handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
    assert.strictEqual(rig.items().length, 0,
      '(G-30) the pen still owns its tap after the retirement — the guard ' +
      'that returns before any creation is untouched. Re-driven here rather ' +
      'than assumed, because this plan edits the painter that registers the ' +
      'handler');
  });
  g('G-30/a20/prompt-literal-count-unchanged', function () {
    assert.strictEqual(
      (appCode.match(/write something/g) || []).length, 3,
      '(G-30) ⚠ `A-20` IS NOT REOPENED. The prompt SHE WORDED HERSELF is ' +
      'byte-untouched and its occurrence count is pinned BY VALUE. This ' +
      'plan changes WHICH GESTURE MAY CREATE, never what a created record ' +
      'says or whether first-tap is the rule');
  });
  g('G-30/e4/untyped-mark-persists-after-repaint', function () {
    const rig = editableRig({ write: true });
    const c = rig.canvas();
    c.handlers.pointerdown[0]({ clientX: 40, clientY: 30 });
    const rec = rig.items()[0];
    assert.strictEqual(rec.text, '',
      '(G-30) the record created by the surviving gesture starts UNTYPED — ' +
      'the precondition of the persistence claim below, asserted rather ' +
      'than assumed, so the row cannot pass over a record that was never ' +
      'empty');
    const before = rig.created.length;
    rig.api.paint({ itemId: 'abc123', dayLabel: '08/04/2026' }, 'left',
      rig.scene);
    const painted = rig.created.slice(before).filter(function (n) {
      return String(n.cls).indexOf('page-deco-text') !== -1;
    });
    assert.strictEqual(painted.length, 1,
      '(G-30) UI-SPEC `empty | E4` IS A SHIPPED COMMITMENT AND HOLDS: a ' +
      'placed-but-untyped mark STILL EXISTS AS A REAL ELEMENT after a ' +
      'repaint — selectable, movable, undoable — and is never a ghost that ' +
      'vanishes if she does not type. This plan must not break one design ' +
      'commitment while honouring another');
    assert.strictEqual(painted[0].text, 'write something',
      '(G-30) and it still shows her shipped prompt while untyped');
  });
  g('G-30/tail/creation-tail-intact', function () {
    const tail = bodyOf('nbPlaceTextRecord');
    ['NB_DECO_CAP', 'pushNbUndo', 'postDecorations', 'openHandTextEditor']
      .forEach(function (t) {
        assert.ok(tail.indexOf(t) !== -1,
          '(G-30) the creation TAIL is intact and carries `' + t + '`. ' +
          'Only a listener REGISTRATION is removed: "close the path" is ' +
          'satisfied by deleting nbPlaceTextRecord outright, which would ' +
          'take the cap refusal, the undo push, the write and the editor ' +
          'with it — and the surviving gesture uses every one of them');
      });
    assert.strictEqual((appCode.match(/kind: 'text'/g) || []).length, 1,
      '(G-30) and the record-creation tail still exists in EXACTLY ONE ' +
      'place — retiring a caller must not fork the tail');
  });
  g('G-30/rationale/rewritten-not-deleted', function () {
    assert.ok(/RETIRED 2026-08-11[\s\S]{0,900}measurement/i.test(appSrc),
      '(G-30) THE PARAGRAPH THAT ARGUED FOR KEEPING THE RETIRED GESTURE IS ' +
      'REWRITTEN, NEVER DELETED, and carries a DATED clause naming the ' +
      'measurement that overturned it. Asserted over RAW source because ' +
      'the subject IS a comment. Deleting it would leave the next reader a ' +
      'silence where the history used to be, and the same question would ' +
      'be re-litigated in a year');
  });
  g('G-30/rationale/original-argument-preserved', function () {
    assert.ok(/costs nothing/.test(appSrc),
      '(G-30) and what it ARGUED is still legible — *it costs nothing* — ' +
      'so the record shows a claim that was overturned rather than a claim ' +
      'that was quietly removed. A dated clause with no surviving argument ' +
      'to argue against is a correction indistinguishable from a retcon');
  });

  // ---- run them ALL, print the roll call, then fail on the collected set --
  const g30Red = [];
  G30.forEach(function (c) {
    let err = null;
    try { c.fn(); } catch (e) { err = e; }
    process.stdout.write('  ' + (err ? 'RED  ' : 'green') + ' ' + c.name +
      (err ? ' :: ' + String(err.message).split('\n')[0].slice(0, 220) : '') +
      '\n');
    if (err) { g30Red.push(c.name); }
  });
  assert.strictEqual(G30.length, 15,
    '(G-30) FIFTEEN named assertions, counted — so one cannot be dropped ' +
    'without the count noticing');
  assert.deepStrictEqual(g30Red, [],
    '(G-30) these named assertions are RED: ' + g30Red.join(', ') +
    '. Every check is executed rather than halted at the first failure, ' +
    'because this group\'s whole value before the fix is the LIST of what ' +
    'fails — a gate whose red state has never been seen is a gate nobody ' +
    'has checked can fail');
})();

// ===========================================================================
// ---- G-31: 26.91-38 (D-13 / F-26) — AN OUTLINE TO POINT AT ----------------
//
// HER RULING (`26.91-CONTEXT.md` `A-26`, ruling 3, 2026-08-11): SHOW THE
// PAGE OUTLINE ONLY WHILE THE ROOM IS REFUSING. A reset day stays visually
// blank as it is now; the moment a save is refused on a day with no outline,
// the page outline appears so her sentence points at something real, and then
// it goes away. She chose this over *draw the outline on reset days too* and
// over *use different words on that one path*, and she was told it has the
// most moving parts of the three.
//
// ⚠ `A-24` IS NOT REOPENED. `move that mark inside the page outline.` ships
// exactly as she chose it. This group is about WHERE THE OUTLINE IS DRAWN,
// never about her words.
//
// ---- THE WRITTEN ANTI-VACUITY AUDIT (the five questions) -----------------
//
//   (a) CAN IT PASS BEFORE THE WORK? No, and this is recorded BY VALUE
//       rather than claimed: driven at HEAD, `G-31/refusal/reset-day-gets-an-
//       outline` and `G-31/refusal/fence-dropped-page-gets-an-outline` both
//       measured a region count of 0 against an expected 1. Every other row
//       in this group was GREEN at HEAD and is declared below as a GUARD
//       rather than as a detector — the group's whole value is that the two
//       rows above turn without any of the guards turning with them.
//   (b) CAN IT PASS ONCE THE WORK IS BROKEN? No. Six mutations are driven in
//       this plan's SUMMARY, each sha256-verified as landed, and each named
//       against the assertion it reddens.
//   (c) WHAT DEGENERATE INPUT SATISFIES IT? A scene that painted nothing at
//       all satisfies every zero-count row for free. Closed by the positive
//       controls: `ordinary/one-region-no-refusal` pins 1 on the ordinary
//       day, and `positive/the-band-actually-spoke` asserts the refusal row
//       is really on the scene in every refusal case — so a zero measured
//       elsewhere is a zero on a page that genuinely painted.
//   (d) SOURCE READ OR EXECUTION? EXECUTION. The region nodes counted are
//       the nodes the REAL `paintPageDecorations` and the REAL
//       `renderNotebookBand` appended to ONE shared scene, driven in the
//       order MEASURED from the shipped `paintNotebookSpread` (see
//       `G-31/order/*`). The one source-shaped row — `builder/one-
//       construction-site` — is a construction-site count and says so.
//   (e) WHAT WOULD MAKE IT VACUOUS LATER? A scene whose `querySelectorAll`
//       stopped resolving `.page-deco-region` would make the fallback's
//       guard see zero forever and every count would still look plausible.
//       Closed by `G-31/rig/queryselectorall-really-resolves`, which drives
//       the rig's own selector against a known-populated scene BEFORE any
//       behavioural row is read.
// ===========================================================================

// ---- (a) THE PAINT ORDER, MEASURED BY DRIVING ----------------------------
//
// The fallback is guarded on `the scene carries ZERO region nodes`, and a
// zero-count guard is only meaningful where the count is FINAL. If the band
// painted BEFORE the pages, a guard evaluated there would see zero on an
// ordinary day, append a region, and the page painter would then append a
// second — breaking the shipped `G-27/live-app/one-region-while-arranging`
// invariant, whose own message says two regions means the page makes two
// claims about where a mark may go.
(function g31PaintOrder() {
  const R = f1Rig();
  const roster = blessingsMonthRoster(R.entries);
  R.api.paint(R.entries, roster);
  const seq = R.order.slice();

  assert.ok(seq.length > 0,
    'G-31/order/something-painted — POSITIVE CONTROL, taken before any ' +
    'ordering claim: the shipped spread painter recorded ' + seq.length +
    ' painter call(s). An empty sequence makes every ordering assertion ' +
    'below vacuously true, which is how an order gate stops measuring.');
  assert.ok(seq.indexOf('page') !== -1,
    'G-31/order/a-page-was-painted — and at least one PAGE painter ran ' +
    '(sequence: ' + JSON.stringify(seq) + '). Without a page in the ' +
    'sequence "the band is after every page" is true of a spread with no ' +
    'pages at all.');
  assert.ok(seq.indexOf('band') !== -1,
    'G-31/order/the-band-was-painted — and the BAND painter ran ' +
    '(sequence: ' + JSON.stringify(seq) + ').');

  const lastPage = seq.lastIndexOf('page');
  const bandAt = seq.indexOf('band');
  assert.ok(bandAt > lastPage,
    'G-31/order/band-paints-after-every-page — MEASURED, NOT READ. The ' +
    'shipped paintNotebookSpread painted in the order ' +
    JSON.stringify(seq) + ': the last page painter ran at index ' +
    lastPage + ' and the band at index ' + bandAt + '. THE CONCLUSION THIS ' +
    'MEASUREMENT LICENSES: the region count is FINAL by the time ' +
    'renderNotebookBand runs, so that is where the zero-count fallback ' +
    'goes. If this ever reverses, the fallback must move WITH it or it will ' +
    'double the region on an ordinary day.');

  // The tin paints after the band (the tray must stay topmost). It appends
  // no region, which is why "final at the band" is still final for regions.
  // Asserted rather than assumed, because it is the one painter that runs
  // AFTER the chosen fallback site.
  const tinAt = seq.indexOf('tin');
  assert.ok(tinAt === -1 || tinAt > bandAt,
    'G-31/order/tin-paints-after-the-band — the tin ran at index ' + tinAt +
    ', after the band at ' + bandAt + '. Recorded because the tin is the ' +
    'ONLY painter that runs after the fallback site, so it is the only one ' +
    'that could invalidate "the count is final there".');
  assert.strictEqual(
    (bodyOf('renderTinTray').match(/page-deco-region/g) || []).length, 0,
    'G-31/order/tin-appends-no-region — and renderTinTray contains ZERO ' +
    'occurrences of the region class, so the count the band sees stays the ' +
    'count that reaches her. This is the half that makes the tin\'s later ' +
    'position harmless rather than merely unmeasured.');

  console.log('  G-31 paint order (driven): ' + JSON.stringify(seq));
})();

// ---- (b) THE RIG: ONE SCENE, THE REAL PAGE PAINTER AND THE REAL BAND ------
//
// Both painters, lifted as REAL SOURCE, appending to ONE shared scene in the
// order `G-31/order/band-paints-after-every-page` MEASURED above. Nothing
// here re-implements either painter and nothing re-types the region's box:
// the count read at the end is a count of nodes the shipped code appended.
//
// THE SCENE ANSWERS `querySelectorAll` OVER WHAT IT HAS ACTUALLY BEEN GIVEN.
// That is the whole hinge of the fallback's guard, so the rig's own selector
// is driven against a known-populated scene before any behavioural row is
// read (`G-31/rig/queryselectorall-really-resolves`). A rig whose selector
// silently answered [] would make every refusal row fire for the wrong
// reason and the "does not double" row would be measuring the harness.
function g31Rig(opts) {
  const o = opts || {};
  const nodes = [];
  const doc = nbNodeDoc();
  const scene = {
    appendChild: function (n) { nodes.push(n); },
    querySelector: function () { return null; },
    querySelectorAll: function (sel) {
      const want = String(sel).replace(/^\./, '');
      return nodes.filter(function (n) {
        return String(n.cls || '').split(/\s+/).indexOf(want) !== -1;
      });
    },
    getBoundingClientRect: function () { return { left: 0, top: 0 }; }
  };
  const DAY = '08/04/2026';
  const state = { DECORATIONS: {}, posted: [] };
  // The day record. `reset` is the flag, never a delete — the records survive
  // underneath it, and that survival is the whole reason the server can still
  // refuse one on a reset day.
  state.DECORATIONS[DAY] = {
    reset: !!o.reset,
    items: o.items || [{ kind: 'sticker', sprite: 'moon',
      page: 'onscreen-page', x: 260, y: 40 }]
  };

  const src = [
    NB_HELPERS,
    ['NB_BOUNDS', 'NB_TEXT_BOX', 'NB_IMG_BOX', 'NB_STICKER_H', 'NB_STICKERS',
      'NB_DECO_CAP', 'NB_DRAG_THRESHOLD', 'NB_SHEET_W', 'NB_TIN', 'NB_TRAY',
      'NB_ENTRY_ROW', 'NB_BAND', 'NB_TEXT_CAP', 'SVG_NS', 'NB_PEN_PTS_CAP',
      'NB_PEN_STROKE_CAP', 'NB_RESET_COPY'].map(declOf).join('\n'),
    NB_REGION_SRC,
    extractFn(appSrc, 'clampDecoOrigin'),
    extractFn(appSrc, 'decoDay'),
    PEN_DOWN + extractFn(appSrc, 'attachPageDrag'),
    extractFn(appSrc, 'livePagePhoto'),
    extractFn(appSrc, 'ensurePagePhoto'),
    extractFn(appSrc, 'paintDecoHandles'),
    DECO_PAINTER_SRC,
    extractFn(appSrc, 'placeNotebookInert'),
    extractFn(appSrc, 'mulberry32'),
    extractFn(appSrc, 'blessingSeed'),
    extractFn(appSrc, 'pickBlessingDecoration'),
    extractFn(appSrc, 'paintBlessingPage'),
    extractFn(appSrc, 'nbGlyphState'),
    extractFn(appSrc, 'renderNotebookBand')
  ].join('\n');

  // eslint-disable-next-line no-new-func
  const api = new Function('S', 'GEOM', 'doc', 'scene', 'design', 'failed',
    'reason', `
    var document = doc;
    var DECORATIONS = S.DECORATIONS;
    var STATION_NOTEBOOK_GEOM = GEOM;
    var NBDESIGN = design;
    var NB_DAY = '08/04/2026';
    var NB_SAVE_FAILED = failed;
    var NB_SAVE_REASON = reason;
    var NB_SAVE_REASON_CAP = ${NB_SAVE_REASON_CAP};
    var NB_UNDO = [], NB_REDO = [], NB_UNDO_CAP = 60;
    var NB_RESET_ARMED = false;
    var NB_SEL = null, NB_TIN_OPEN = false, NB_TIN_TAB = 'marks';
    var NB_REPAINT = null;
    var NOTEBOOK_CAPTION_LINE_PX = 7 * 1.3;
    var NB_A_MOD = 360, NB_S_MIN = 0.5, NB_S_MAX = 2.0, NB_S_DEFAULT = 1;
    var NB_PLACE = null;
    function postDecorations(d) { S.posted.push(d); }
    function doNbUndo() {} function doNbRedo() {}
    function nbResetDay() {} function nbDisarmReset() { return true; }
    function setNotebookPen() {} function setNotebookWrite() {}
    function dismissTray() {} function openHandTextEditor() {}
    function openContainerItem() {} function recordIncident() {}
    function pushNbUndo() {} function bringDecoToFront() {}
    function paintStickerCrop() { return true; }
    function escapeAttr(s) { return s; }
    function $() { return scene; }
    function getComputedStyle() {
      return { getPropertyValue: function () { return '1'; } };
    }
    ${src}
    return {
      page: function (entry, side) {
        paintBlessingPage(scene, entry, side, {}, [],
          function () { return true; });
      },
      band: function () { renderNotebookBand(scene); }
    };`)(state, NB_SRC_CONSTS.STATION_NOTEBOOK_GEOM, doc, scene,
    o.design !== false, !!o.failed,
    o.reason === undefined ? null : o.reason);

  // THE SHIPPED ORDER, driven: pages first, then the band. Measured above,
  // never assumed here.
  const MS = 1754300000000;
  const left = { itemId: 'left1', dayLabel: DAY, title: 'the month',
    why: 'the grid', author: 'you', isImage: false, ms: MS };
  const right = { itemId: 'onscreen-page', dayLabel: DAY, title: 'the window',
    why: 'the light was good.', author: 'you', isImage: false, ms: MS + 1000 };
  api.page(left, 'left');
  // THE FENCE-DROPPED RIGHT PAGE (relative (a)): a page the never-show list
  // dropped is NEVER PAINTED at all — paintPageDecorations is only reached
  // through paintBlessingPage, which is only called for a page that survived
  // the fence. So the drop is modelled by NOT PAINTING IT, which is what
  // actually happens, rather than by a flag inside the painter.
  if (!o.dropRightPage) { api.page(right, 'right'); }
  api.band();

  return { nodes: nodes, scene: scene, state: state,
    regions: function () {
      return nodes.filter(function (n) {
        return /(^|\s)page-deco-region(\s|$)/.test(String(n.cls || ''));
      });
    },
    decorations: function () {
      return nodes.filter(function (n) {
        return /(^|\s)page-deco(\s|$)/.test(String(n.cls || ''));
      });
    },
    errorRow: function () {
      return nodes.filter(function (n) {
        return /station-nb-error/.test(String(n.cls || ''));
      })[0];
    } };
}

// ---- (c) THE ROWS -------------------------------------------------------
//
// EVERY CHECK RUNS AND A RED RUN NAMES ITSELF, on G-25's register: the checks
// are named closures, ALL executed, and the collected red names asserted
// against the empty list at the end. This group's whole value before the fix
// is the LIST of what fails, so halting at the first failure would hide it.
(function g31Rows() {
  const G31 = [];
  const push = function (name, fn) { G31.push({ name: name, fn: fn }); };

  // ---- THE RIG'S OWN SELECTOR, DRIVEN BEFORE ANYTHING IS READ OFF IT ----
  push('G-31/rig/queryselectorall-really-resolves', function () {
    const r = g31Rig({ failed: false });
    const viaSelector = r.scene.querySelectorAll('.page-deco-region').length;
    const viaFilter = r.regions().length;
    assert.strictEqual(viaSelector, viaFilter,
      'G-31/rig/queryselectorall-really-resolves — the rig\'s scene ' +
      'resolved ' + viaSelector + ' `.page-deco-region` node(s) through ' +
      'querySelectorAll and ' + viaFilter + ' through an independent ' +
      'filter over the same node list. THE FALLBACK\'S WHOLE GUARD IS THAT ' +
      'SELECTOR: a scene that silently answered [] would make every ' +
      'refusal row below fire for the wrong reason, and the ' +
      '"does not double an existing region" row would be measuring the ' +
      'harness instead of the app.');
    assert.ok(viaSelector > 0,
      'G-31/rig/queryselectorall-really-resolves — and it resolved a ' +
      'NON-ZERO count on an ordinary arranging page (' + viaSelector + '). ' +
      'Two selectors agreeing on zero is the session-3 fault shape: both ' +
      'sides empty and the check reporting agreement.');
  });

  // ---- ORDINARY DAY, NO REFUSAL: unchanged from today ------------------
  push('G-31/ordinary/one-region-no-refusal', function () {
    const r = g31Rig({ failed: false });
    assert.strictEqual(r.regions().length, 1,
      'G-31/ordinary/one-region-no-refusal — an ordinary arranging day with ' +
      'no refusal carries ' + r.regions().length + ' region node(s); ' +
      'expected exactly 1, unchanged from before this wave. GUARD, GREEN AT ' +
      'HEAD and declared as such: it is the positive control that makes ' +
      'every zero measured elsewhere a zero on a page that genuinely ' +
      'painted.');
    assert.strictEqual(r.errorRow(), undefined,
      'G-31/ordinary/one-region-no-refusal — and no failure, no row.');
    // ⚠ THE DECORATION COUNTER'S OWN POSITIVE CONTROL, and it is not
    // decoration. Every "her marks are NOT painted" row below is a ZERO, and
    // a zero is trivially true of a fixture whose mark never painted in the
    // first place. This is the row that makes those zeroes mean something:
    // on an ORDINARY day the SAME fixture mark paints a REAL `.page-deco`
    // node. Without it the reset rows could pass against a rig that draws no
    // marks at all — which is the degenerate the postmortems keep naming.
    assert.ok(r.decorations().length > 0,
      'G-31/ordinary/one-region-no-refusal — POSITIVE CONTROL FOR THE ' +
      'DECORATION COUNTER: an ordinary arranging day paints ' +
      r.decorations().length + ' `.page-deco` node(s) from the same fixture ' +
      'record the reset rows use; expected at least 1. Every ' +
      '"her marks are not painted" assertion in this group is a ZERO, and a ' +
      'zero is free on a fixture that never painted a mark.');
  });

  // ---- RESET DAY, NO REFUSAL: HER RULING'S FIRST HALF -------------------
  push('G-31/reset/blank-without-a-refusal', function () {
    const r = g31Rig({ reset: true, failed: false });
    assert.strictEqual(r.regions().length, 0,
      'G-31/reset/blank-without-a-refusal — a reset day with NO refusal ' +
      'carries ' + r.regions().length + ' region node(s); expected 0. THIS ' +
      'IS HALF OF HER RULING: the reset day stays visually blank as it is ' +
      'now. GUARD, green at HEAD — but it is the half a fix could most ' +
      'easily break by "just always drawing the outline", which is the ' +
      'option she REJECTED.');
    assert.strictEqual(r.decorations().length, 0,
      'G-31/reset/blank-without-a-refusal — and none of her marks are ' +
      'painted (' + r.decorations().length + '). Reset is a FLAG, not a ' +
      'delete: ' + r.state.DECORATIONS['08/04/2026'].items.length +
      ' record(s) survive underneath and are simply not drawn.');
  });

  // ---- RESET DAY + REFUSAL: RED AT HEAD (1 of 2) -----------------------
  push('G-31/refusal/reset-day-gets-an-outline', function () {
    const r = g31Rig({ reset: true, failed: true,
      reason: 'move that mark inside the page outline.' });
    assert.ok(r.errorRow(),
      'G-31/refusal/reset-day-gets-an-outline — POSITIVE CONTROL FIRST: ' +
      'the band must actually be speaking. Without the row on the scene, ' +
      'the region count below would be about a band that said nothing.');
    assert.strictEqual(r.regions().length, 1,
      'G-31/refusal/reset-day-gets-an-outline — THE STRONG CASE, AND THE ' +
      'ASSERTION THIS GROUP EXISTS FOR. On a reset day with a refusal live ' +
      'the scene carries ' + r.regions().length + ' region node(s); ' +
      'expected exactly 1. MEASURED 0 AT HEAD. paintPageDecorations returns ' +
      'at its reset guard before the placement canvas and before the ' +
      'region, on EVERY page of the day, while renderNotebookBand consults ' +
      'no reset flag at all — so the row says `move that mark inside the ' +
      'page outline.` with no outline anywhere on screen. Her ruling ' +
      '(A-26/3): show the outline ONLY while the room is refusing.');
  });

  // ---- RESET DAY + REFUSAL: HER RULING'S OTHER HALF, SAME RUN ----------
  push('G-31/refusal/reset-day-still-paints-none-of-her-marks', function () {
    const r = g31Rig({ reset: true, failed: true,
      reason: 'move that mark inside the page outline.' });
    assert.strictEqual(r.regions().length, 1,
      'G-31/refusal/reset-day-still-paints-none-of-her-marks — region ' +
      'count is 1 (measured ' + r.regions().length + ')');
    assert.strictEqual(r.decorations().length, 0,
      'G-31/refusal/reset-day-still-paints-none-of-her-marks — AND HER ' +
      'MARKS ARE STILL NOT PAINTED: ' + r.decorations().length +
      ' decoration node(s), expected 0, asserted in the SAME RUN as the ' +
      'region count above so the two halves of her ruling cannot be ' +
      'satisfied one at a time. Painting them would undo the reset\'s whole ' +
      'meaning while claiming to help her — law 3 forbids the room getting ' +
      'worse in the act of explaining itself. The day still holds ' +
      r.state.DECORATIONS['08/04/2026'].items.length + ' surviving ' +
      'record(s); this is about drawing, never about deleting.');
  });

  // ---- ORDINARY DAY + REFUSAL: 1, NOT 2 --------------------------------
  push('G-31/refusal/ordinary-day-is-not-doubled', function () {
    const r = g31Rig({ failed: true,
      reason: 'move that mark inside the page outline.' });
    assert.ok(r.errorRow(),
      'G-31/refusal/ordinary-day-is-not-doubled — POSITIVE CONTROL: the ' +
      'band is speaking, so the count below is taken in the refusal state.');
    assert.strictEqual(r.regions().length, 1,
      'G-31/refusal/ordinary-day-is-not-doubled — an ORDINARY day with a ' +
      'refusal live carries ' + r.regions().length + ' region node(s); ' +
      'expected exactly 1, NOT 2. This is what the zero-count guard buys, ' +
      'and it is what keeps `G-27/live-app/one-region-while-arranging` true ' +
      'now that the region has a second call site — that gate\'s own ' +
      'message says two regions means the page makes two claims about ' +
      'where a mark may go.');
  });

  // ---- THE GOING-AWAY HALF, ITS OWN ROW --------------------------------
  push('G-31/refusal/the-outline-leaves-when-the-refusal-does', function () {
    const withRefusal = g31Rig({ reset: true, failed: true,
      reason: 'move that mark inside the page outline.' });
    assert.strictEqual(withRefusal.regions().length, 1,
      'G-31/refusal/the-outline-leaves-when-the-refusal-does — PRE-STATE: ' +
      'the outline is on the scene while refusing (' +
      withRefusal.regions().length + ')');
    // The retry handler clears BOTH flags and repaints. A repaint is a fresh
    // scene from state already in hand, which is exactly what this second
    // build is — the condition is READ AT PAINT TIME, so there is no
    // teardown to forget.
    const cleared = g31Rig({ reset: true, failed: false });
    assert.strictEqual(cleared.regions().length, 0,
      'G-31/refusal/the-outline-leaves-when-the-refusal-does — AND IT IS ' +
      'GONE once the refusal clears and the scene repaints: ' +
      cleared.regions().length + ' region node(s), expected 0. A fix that ' +
      'only proves the APPEARANCE is half a fix — the stranding failure ' +
      'mode lives entirely on the return leg, and an outline that arrives ' +
      'and never leaves is a reset day that stopped looking blank.');
    assert.strictEqual(cleared.errorRow(), undefined,
      'G-31/refusal/the-outline-leaves-when-the-refusal-does — and the row ' +
      'is gone with it; the outline and the sentence it names leave ' +
      'together, because they are drawn by one block.');
  });

  // ---- RELATIVE (a): THE FENCE-DROPPED PAGE — RED AT HEAD (2 of 2) ------
  push('G-31/refusal/fence-dropped-page-gets-an-outline', function () {
    const r = g31Rig({ failed: true, dropRightPage: true,
      reason: 'move that mark inside the page outline.' });
    assert.ok(r.errorRow(),
      'G-31/refusal/fence-dropped-page-gets-an-outline — POSITIVE CONTROL: ' +
      'the band is speaking.');
    assert.strictEqual(r.regions().length, 1,
      'G-31/refusal/fence-dropped-page-gets-an-outline — THE FIRST WEAKER ' +
      'RELATIVE, closed by the SAME RULE and driven rather than argued. A ' +
      'spread whose right page the never-show fence dropped is never ' +
      'painted at all (paintPageDecorations is reached only through ' +
      'paintBlessingPage), so it carries no outline — while its record is ' +
      'still in the posted day and can still be the one refused. Measured ' +
      r.regions().length + ' region node(s) with a refusal live; expected ' +
      '1. MEASURED 0 AT HEAD. This row is why the condition is a NODE ' +
      'COUNT and not `rec.reset`: a reset-flag test closes one path and ' +
      'leaves this one exactly as open as it was.');
    // law 5 is not weakened by any of this: the dropped page is still not
    // painted, and nothing about it is named on screen.
    assert.strictEqual(r.decorations().length, 0,
      'G-31/refusal/fence-dropped-page-gets-an-outline — and the dropped ' +
      'page is STILL NOT PAINTED (' + r.decorations().length + ' ' +
      'decoration node(s)). Law 5 is absolute: drawing an empty box where a ' +
      'never-shown page would have been must not become a way of saying ' +
      'that something is there. The box is the PAGE\'s legal region, ' +
      'aria-hidden and textless — it names nothing and reveals nothing.');
  });

  push('G-31/refusal/fence-dropped-page-no-refusal-no-outline', function () {
    const r = g31Rig({ failed: false, dropRightPage: true });
    assert.strictEqual(r.regions().length, 0,
      'G-31/refusal/fence-dropped-page-no-refusal-no-outline — the SAME ' +
      'dropped-page spread with NO refusal carries ' + r.regions().length +
      ' region node(s); expected 0. Asserted separately so the row above ' +
      'is not shown to fire for the wrong reason: the outline appears ' +
      'because the room is REFUSING, never because a page was dropped.');
  });

  // ---- READING MODE: THE OUTLINE NEVER APPEARS THERE --------------------
  push('G-31/reading/no-outline-even-while-refusing', function () {
    [[false, false], [true, false], [false, true], [true, true]]
      .forEach(function (c) {
        const r = g31Rig({ design: false, reset: c[0], failed: c[1],
          reason: 'move that mark inside the page outline.' });
        assert.strictEqual(r.regions().length, 0,
          'G-31/reading/no-outline-even-while-refusing — reading mode, ' +
          'reset=' + c[0] + ' failed=' + c[1] + ': ' + r.regions().length +
          ' region node(s), expected 0. UI-SPEC `empty | E8` sets the ' +
          'arranging-only boundary and it binds the NEW call site exactly ' +
          'as it binds the original: a page she has not decorated must not ' +
          'acquire a box in reading mode. renderNotebookBand returns at ' +
          '`if (!NBDESIGN)` before the fallback can be reached, and the ' +
          'page painter\'s own condition is unchanged.');
        assert.strictEqual(r.errorRow(), undefined,
          'G-31/reading/no-outline-even-while-refusing — and reading mode ' +
          'paints no band row at all, so the sentence is not spoken there ' +
          'either. Both halves stay in arranging.');
      });
  });

  // ---- RELATIVE (b): DRIVEN, AND ASSERTED AS THE PRESENT BEHAVIOUR ------
  //
  // ⚠ THIS ROW IS A RECORDED RESIDUAL, NOT A PASSING CHECK. It asserts what
  // the room does TODAY on the one path this wave does NOT close, so the
  // survivor is MEASURED rather than described in prose and re-discovered as
  // a new finding at a later seal.
  //
  // WHY IT CANNOT BE CLOSED HERE: the server's refusal carries A COORDINATE
  // AND A BOUND AND NEVER A RECORD IDENTITY, so nothing on the client can
  // tell WHICH mark is meant. Closing it would need the server to name the
  // offending record — a change to the fail-closed fence, and outside her
  // ruling. Asserted below against server.py itself rather than claimed.
  push('G-31/residual/spread-she-is-not-looking-at-still-open', function () {
    // The refused mark lives on a page of the SAME DAY that is not on this
    // spread. The day record spans every page sharing the day label; only
    // the open spread is painted.
    const r = g31Rig({ failed: true,
      reason: 'move that mark inside the page outline.',
      items: [{ kind: 'sticker', sprite: 'moon', page: 'OFFSCREEN-page',
        x: 999, y: 40 }] });
    assert.ok(r.errorRow(),
      'G-31/residual/spread-she-is-not-looking-at-still-open — the band ' +
      'is speaking about a mark that is not on this spread.');
    assert.strictEqual(r.regions().length, 1,
      'G-31/residual/spread-she-is-not-looking-at-still-open — AN OUTLINE ' +
      'IS ON SCREEN (' + r.regions().length + ') and the fallback ' +
      'correctly does NOT fire, because the count is not zero. THAT IS THE ' +
      'RESIDUAL: the outline she can see belongs to the page she is ' +
      'looking at, and the refused mark lives on a DIFFERENT page of the ' +
      'same day — so the sentence names an outline that is not the one it ' +
      'means, which is arguably worse than none because it invites her to ' +
      'drag the wrong thing. THIS ASSERTION PASSES BECAUSE THE DEFECT IS ' +
      'STILL HERE. It is a record, not a verdict.');
    const onScreen = ['left1', 'onscreen-page'];
    const refused = r.state.DECORATIONS['08/04/2026'].items[0].page;
    assert.strictEqual(onScreen.indexOf(refused), -1,
      'G-31/residual/spread-she-is-not-looking-at-still-open — and the ' +
      'refused record\'s page (' + JSON.stringify(refused) + ') is NOT one ' +
      'of the pages this spread painted (' + JSON.stringify(onScreen) +
      '). Without this the row above would be a residual claim about a ' +
      'case the fixture never actually built.');
  });

  push('G-31/residual/the-refusal-names-no-record', function () {
    const py = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    const at = py.indexOf('def validate_decorations');
    assert.ok(at !== -1,
      'G-31/residual/the-refusal-names-no-record — validate_decorations ' +
      'must exist; it is the fence this residual is about.');
    const body = py.slice(at, at + 6000);
    const SENTENCE = 'move that mark inside the page outline.';
    const occurrences = body.split(SENTENCE).length - 1;
    assert.ok(occurrences > 0,
      'G-31/residual/the-refusal-names-no-record — POSITIVE CONTROL: her ' +
      'sentence occurs ' + occurrences + ' time(s) inside ' +
      'validate_decorations. A scan of a body that does not contain it ' +
      'would prove nothing about what a refusal carries.');
    // The refusal messages are WHOLE QUOTED LITERALS. No f-string, no
    // .format, no % interpolation reaches them — which is exactly why the
    // client cannot learn WHICH record was refused.
    const lines = body.split('\n').filter(function (l) {
      return l.indexOf(SENTENCE) !== -1;
    });
    assert.ok(lines.length > 0,
      'G-31/residual/the-refusal-names-no-record — and the sentence is ' +
      'findable on its own line(s) for the interpolation scan below.');
    lines.forEach(function (l) {
      assert.strictEqual(/f["']|\.format\(|%\s*\(|\{\}/.test(l), false,
        'G-31/residual/the-refusal-names-no-record — THE REASON THE THIRD ' +
        'PATH CANNOT BE CLOSED HERE, asserted against server.py rather ' +
        'than claimed in prose. The refusal line ' + JSON.stringify(l.trim()) +
        ' carries NO interpolation of any kind, so the message that reaches ' +
        'the client names a coordinate and a bound and NEVER a record ' +
        'identity. Nothing on the client can therefore tell which mark is ' +
        'meant, and no node count can either. Closing the residual would ' +
        'need the server to name the offending record — a change to the ' +
        'fail-closed fence, and outside her ruling. ⚠ IF THIS ROW EVER ' +
        'REDDENS BECAUSE THE FENCE STARTED NAMING RECORDS, the residual ' +
        'becomes closeable and `D-13` should be re-opened, not re-keyed.');
    });
  });

  // ---- THE BUILDER: ONE CONSTRUCTION, TWO CALLERS -----------------------
  push('G-31/builder/one-construction-site', function () {
    const code = stripComments(appSrc);
    const constructions =
      (code.match(/className = 'page-deco-region'/g) || []).length;
    assert.strictEqual(constructions, 1,
      'G-31/builder/one-construction-site — app.js contains ' +
      constructions + ' site(s) assigning the region class; expected ' +
      'exactly 1. TWO SPELLINGS OF ONE CONSTRUCTION IS THE DRIFT CLASS ' +
      'THIS PHASE HAS FOUND ROUGHLY TWENTY-FIVE TIMES, and this is the ' +
      'worst place in the file for it: the two boxes would agree on the ' +
      'day they were written and diverge the first time either bound ' +
      'moved, silently, because both would keep drawing a plausible box.');
    const decl =
      (code.match(/function nbPaintMarkRegion\(scene/g) || []).length;
    assert.strictEqual(decl, 1,
      'G-31/builder/one-construction-site — and the builder is DECLARED ' +
      'exactly once (' + decl + ').');
    // The DEFINITION `function nbPaintMarkRegion(scene)` also matches
    // `nbPaintMarkRegion(scene)`, so the pin is 3 — one definition plus two
    // calls — and the definition is subtracted BY NAME rather than by hoping
    // the reader remembers. This is (6g-b)'s stated convention, applied here
    // because it was written as `2` first and failed at 3, which is exactly
    // how that convention got written down there.
    const withDef =
      (code.match(/nbPaintMarkRegion\(scene\)/g) || []).length;
    assert.strictEqual(withDef - decl, 2,
      'G-31/builder/one-construction-site — and it is CALLED exactly ' +
      'twice (' + (withDef - decl) + ' = ' + withDef + ' matches minus ' +
      decl + ' definition): the page painter\'s original site and the ' +
      'band\'s refusal fallback. Pinned BY VALUE in both directions — at 1 ' +
      'the fallback is gone, and at 3+ a third caller appeared without a ' +
      'reason on the record.');
  });

  push('G-31/builder/no-literal-in-the-builder', function () {
    const body = stripComments(extractFn(appSrc, 'nbPaintMarkRegion'));
    // The SAME discriminator G-27 uses: a digit that is not part of an
    // identifier or a property name. `x0`/`x1`/`y0`/`y1` are property names.
    const LIT = /(^|[^A-Za-z0-9_$.])[0-9]/g;
    const found = (body.match(LIT) || []);
    // The one arithmetic digit is the `+ 1` that turns an INCLUSIVE bound
    // pair into a COUNT. It is arithmetic ON the bounds, not a value of its
    // own, and it is pinned BY VALUE at exactly two occurrences (one per
    // axis) so a third digit cannot arrive unnoticed.
    assert.strictEqual(found.length, 2,
      'G-31/builder/no-literal-in-the-builder — the builder\'s body ' +
      'carries ' + found.length + ' bare numeric literal(s) ' +
      JSON.stringify(found) + '; expected exactly 2, and both must be the ' +
      '`+ 1` that turns an inclusive bound pair into a COUNT (one per ' +
      'axis). THE GEOMETRY STAYS DERIVED FROM THE CLAMP\'S OWN CONSTANTS ' +
      'AND IS NEVER RE-TYPED — that is wave 30\'s finding and extracting ' +
      'this block does not undo it. A typed bound here agrees today and ' +
      'drifts silently tomorrow, which is exactly how F-23 was born.');
    assert.strictEqual((body.match(/\+ 1\)/g) || []).length, 2,
      'G-31/builder/no-literal-in-the-builder — and both are `+ 1)` in the ' +
      'span arithmetic, named rather than merely counted.');
    assert.ok(/NB_MARK_REGION\.x0/.test(body) &&
      /NB_MARK_REGION\.y0/.test(body),
      'G-31/builder/no-literal-in-the-builder — and the box is read from ' +
      'NB_MARK_REGION, the value derived at 12050 from NB_MARK_BOUNDS and ' +
      'the four NB_DECOR_* fence constants.');
  });

  // ---- THE KNOWN LIMIT: A LIVE INPUT DELAYS THE OUTLINE, IT DOES NOT ----
  // ---- CANCEL IT. MEASURED AND RECORDED RATHER THAN FOUGHT. ------------
  push('G-31/limit/live-input-delays-the-outline', function () {
    const raiser = bodyOf('nbSaveFailed');
    assert.ok(/page-deco-input/.test(raiser) && /return;/.test(raiser),
      'G-31/limit/live-input-delays-the-outline — nbSaveFailed still ' +
      'carries its live-input guard: over a live hand-text input it sets ' +
      'the flag and RETURNS WITHOUT REPAINTING. ⚠ DO NOT REMOVE IT. Wave ' +
      '27\'s reason, verbatim in its own words: a repaint clears every ' +
      'scene child, and this is her handmade work — losing it quietly is ' +
      'worse than showing an error, because she would have no way to know ' +
      'what was lost or when. THE ACCEPTED COST: on that ONE path the ' +
      'outline appears at the NEXT repaint rather than immediately.');
    assert.ok(/NB_SAVE_FAILED = true/.test(raiser),
      'G-31/limit/live-input-delays-the-outline — and the FLAG IS SET ' +
      'BEFORE the guard returns, which is the whole reason the delay is a ' +
      'delay and not a loss.');
    const flagFirst = raiser.indexOf('NB_SAVE_FAILED = true');
    const guardAt = raiser.indexOf('page-deco-input');
    assert.ok(flagFirst !== -1 && guardAt !== -1 && flagFirst < guardAt,
      'G-31/limit/live-input-delays-the-outline — ORDER PINNED: the flag ' +
      'is set at ' + flagFirst + ' and the guard returns at ' + guardAt +
      '. If the guard ever moved first, the refusal would be DROPPED ' +
      'rather than deferred and the outline would never arrive at all.');
    // AND THE EVENTUAL APPEARANCE, DRIVEN: with the flag set, the very next
    // paint carries the outline. The delayed case is asserted, not removed.
    const next = g31Rig({ reset: true, failed: true,
      reason: 'move that mark inside the page outline.' });
    assert.strictEqual(next.regions().length, 1,
      'G-31/limit/live-input-delays-the-outline — and the NEXT repaint ' +
      'after such a refusal carries the outline (' + next.regions().length +
      '). The delay is measured and accepted; it is not a hole.');
  });

  // ---- HER SENTENCE IS NOT TOUCHED -------------------------------------
  push('G-31/a24/her-sentence-is-untouched', function () {
    const py = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    const SENTENCE = 'move that mark inside the page outline.';
    const inPy = py.split(SENTENCE).length - 1;
    assert.strictEqual(inPy, 4,
      'G-31/a24/her-sentence-is-untouched — her sentence occurs ' + inPy +
      ' time(s) in server.py; pinned BY VALUE at 4, the count it has had ' +
      'since it shipped at wave 31. ⚠ `A-24` IS NOT REOPENED. This wave is ' +
      'a finding about WHERE THE OUTLINE IS DRAWN, never about her words, ' +
      'and *softening the sentence on that one path* is the option she ' +
      'REJECTED — so it must not resurface as a simplification.');
    assert.strictEqual(SENTENCE.length, 39,
      'G-31/a24/her-sentence-is-untouched — and it is 39 characters, ' +
      'counted, so a whitespace edit fails here too.');
    const inApp = appSrc.split(SENTENCE).length - 1;
    assert.strictEqual(inApp, 0,
      'G-31/a24/her-sentence-is-untouched — and it occurs ' + inApp +
      ' time(s) in app.js. The client never authors it; it says what the ' +
      'server said, verbatim and undecorated (law 4).');
  });

  // ==== THE REGISTER ====================================================
  const red = [];
  G31.forEach(function (c) {
    try { c.fn(); console.log('  green ' + c.name); }
    catch (e) {
      red.push(c.name);
      console.log('  RED   ' + c.name + '\n        ' +
        String(e && e.message).split('\n')[0]);
    }
  });
  assert.deepStrictEqual(red, [],
    'G-31 — ' + red.length + ' of ' + G31.length + ' check(s) RED: ' +
    JSON.stringify(red) + '. Every check is executed rather than halted at ' +
    'the first failure, because this group\'s whole value before the fix is ' +
    'the LIST of what fails — a gate whose red state has never been seen is ' +
    'a gate nobody has checked can fail.');
})();
