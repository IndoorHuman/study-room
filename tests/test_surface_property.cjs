/*
 * tests/test_surface_property.cjs — the D-12 seeded property suite
 * (Plan 23-05).
 *
 * 300 randomized stores — every state × trigger × filter combination —
 * proving that no excluded item ever appears in ANY selector's output,
 * checked against an INDEPENDENT oracle re-implemented in this file
 * (asserting the gate against itself would prove only self-consistency —
 * RESEARCH Pitfall 10, threat T-23-16).
 *
 * Fully deterministic: mulberry32 (integer-ops-only, identical stream on
 * every platform), a fixed BASE_SEED, iteration i runs seed BASE_SEED + i,
 * the failing seed prints on any failure, and
 *   node tests/test_surface_property.cjs <seed>
 * replays exactly that one store. The only time source is the shared
 * frozen-now fixture — no wall clock, no Math.random, so two runs produce
 * byte-identical output.
 *
 * Properties per iteration:
 *   P1 — no id in selectShelf picks, pickBlessingCandidates output, the
 *        pickCoverCandidate result, or (Plan 24-02) the pickAlbumItems /
 *        pickJournalItems outputs satisfies oracleExcluded — the
 *        D-10/D-12 core guarantee: all four exclusion classes
 *        (never_show, retired, trigger overlay, filter matches) on all
 *        five selectors; countPileByType is covered per-solo-item in
 *        assertAllSelectorsRefuse (a number, not an id list)
 *   P2 — guardSurface flags a planted never_show leak forced into a
 *        picks list, and names its reason (the test is tested)
 *   P3 — hidden orthogonality (D-08): markOpened, the resting wake, and
 *        the dig-out transition all leave a hidden item excluded; ONLY
 *        an explicit setTrigger(false, 'release') readmits it
 *   P4 — filter restore (D-07): removing every filter restores all three
 *        selector outputs exactly, and no item field was ever touched
 *   P5 — cover determinism: identical inputs return the identical id
 *        (the SRM-05 ordering edge, doubly covered by fixed-seed replay)
 *
 * Fixed fixtures (not randomized) run once before the loop: an
 * all-excluded store yields empty picks, empty blessing candidates, and a
 * null cover with no throw; a never_show item forced into a picks list
 * draws a non-null guard reason.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; the failing iteration's seed + offending ids + a replay
 * command + exit 1 on failure.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const C = require('../core.js');

const REPO = path.join(__dirname, '..');
function readRepo(name) {
  return fs.readFileSync(path.join(REPO, name), 'utf8');
}

const FIX = path.join(__dirname, 'fixtures');
// The single frozen `now` epoch injected verbatim (the test_core.cjs
// discipline) — never a wall clock.
const now = JSON.parse(
  fs.readFileSync(path.join(FIX, 'frozen-now.json'), 'utf8')).now_ms;
const DAY = 86400000;

// ---- deterministic randomness ------------------------------------------------

// mulberry32 (public domain, RESEARCH Pattern 6 verbatim): 32-bit integer
// ops only — no float-precision hazards, so the stream is identical on
// every machine. JS has no seedable stdlib PRNG; this is the zero-dep
// standard answer.
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_SEED = 20260715;
const ITERATIONS = 300;

function pickOne(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(rand, lo, hi) {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

// ---- the independent oracle (RESEARCH Pitfall 10, T-23-16) ---------------------
//
// A plain straight-line re-implementation of the exclusion rules, IN THIS
// FILE. It never calls the module under test — a bug shared between the
// gate and its oracle would certify a false safety claim, so the two may
// share nothing. Keep this function boring and obvious: state checks,
// the trigger overlay, then a per-facet switch.
function oracleExcluded(item, filters) {
  if (!item) { return true; }
  if (item.state === 'never_show') { return true; }
  if (item.state === 'retired') { return true; }
  if (item.trigger === true) { return true; }
  const active = filters || [];
  for (let i = 0; i < active.length; i++) {
    const f = active[i];
    if (!f) { continue; }
    if (f.facet === 'source' && item.source === f.value) { return true; }
    if (f.facet === 'type' && item.type === f.value) { return true; }
    if (f.facet === 'year' && item.year === f.value) { return true; }
    if (f.facet === 'folder' && item.folder === f.value) { return true; }
    if (f.facet === 'tag' && Array.isArray(item.tags) &&
        item.tags.indexOf(f.value) !== -1) { return true; }
  }
  return false;
}

// ---- store + filter generators -------------------------------------------------

const GEN_STATES = ['unseen', 'blessed', 'never_show', 'resting', 'retired'];
const GEN_SOURCES = ['folder-drop', 'phone-notes', 'ai-chat-export'];
const GEN_FOLDERS = ['notes', 'photos', 'journal', 'clippings'];
const GEN_TYPES = ['text', 'image'];

// Facet values that exist on NO generated item — filters over these must
// exclude nothing (the absent-value arm of the generator).
const ABSENT = {
  source: 'nowhere',
  type: 'mixed',
  year: 2003,
  folder: 'attic',
  tag: 'postcards'
};

function genItem(rand, n) {
  const id = 'it' + String(n).padStart(14, '0');
  const state = pickOne(rand, GEN_STATES);
  const createdDays = randInt(rand, 1, 2700); // spread back around ~2019
  let resting = null;
  if (state === 'resting') {
    const roll = rand();
    if (roll < 0.34) { resting = null; }                              // wakes on sight
    else if (roll < 0.67) { resting = now - randInt(rand, 1, 60) * DAY; } // already awake
    else { resting = now + randInt(rand, 1, 90) * DAY; }              // still asleep
  }
  return {
    id: id,
    content_hash: id + id,
    source: pickOne(rand, GEN_SOURCES),
    origin_path: '/src/notes/' + id + '.md',
    library_path: 'items/' + id + '.md',
    type: pickOne(rand, GEN_TYPES),
    title: id + '.md',
    created_ms: now - createdDays * DAY,
    saved_ms: now - createdDays * DAY,
    imported_ms: now - randInt(rand, 0, 30) * DAY,
    last_opened_ms: rand() < 0.5 ? null : now - randInt(rand, 0, 120) * DAY,
    state: state,
    resting_until_ms: resting,
    year: randInt(rand, 2019, 2026), // the server-stamped int facet (23-01)
    folder: pickOne(rand, GEN_FOLDERS),
    tags: rand() < 0.3 ? ['screenshots'] : [],
    trigger: rand() < 0.25,
    history: [{ at: '2026-06-01T00:00:00+00:00', from: null,
                to: 'unseen', via: 'import' }]
  };
}

// 0–300 items, a random shown-ids subset, and random cover-offer
// timestamps — the store shape the selectors consume.
function genStore(rand) {
  const size = randInt(rand, 0, 300);
  const items = {};
  const list = [];
  for (let n = 0; n < size; n++) {
    const it = genItem(rand, n);
    items[it.id] = it;
    list.push(it);
  }
  const shown = [];
  list.forEach(function (it) {
    if (rand() < 0.3) { shown.push(it.id); }
  });
  const coverOffers = {};
  list.forEach(function (it) {
    if (rand() < 0.25) {
      coverOffers[it.id] = now - randInt(rand, 0, 40) * DAY;
    }
  });
  return {
    items: items,
    list: list,
    cycle: { number: randInt(rand, 1, 5), shown_ids: shown },
    coverOffers: coverOffers
  };
}

// 0–4 filters, drawn from both PRESENT item facets (guaranteed matches)
// and ABSENT values (guaranteed non-matches).
function genFilters(rand, list) {
  const count = randInt(rand, 0, 4);
  const filters = [];
  for (let i = 0; i < count; i++) {
    const facet = pickOne(rand, ['source', 'type', 'year', 'folder', 'tag']);
    let value;
    if (list.length && rand() < 0.7) {
      const it = pickOne(rand, list);
      value = facet === 'source' ? it.source
        : facet === 'type' ? it.type
        : facet === 'year' ? it.year
        : facet === 'folder' ? it.folder
        : (it.tags[0] || 'screenshots');
    } else {
      value = ABSENT[facet];
    }
    filters.push({ facet: facet, value: value });
  }
  return filters;
}

// ---- shared assertion helpers ---------------------------------------------------

function selectorOutputs(items, cycle, filters, coverOffers) {
  return {
    shelf: C.selectShelf(items, cycle, filters, now),
    bless: C.pickBlessingCandidates(items, filters, now),
    cover: C.pickCoverCandidate(items, filters, coverOffers, now),
    album: C.pickAlbumItems(items, filters, now),
    journal: C.pickJournalItems(items, filters, now)
  };
}

// P1: every id any selector surfaced must be clean by the ORACLE's
// reading — never the module's own.
function assertNoLeak(items, filters, out, label) {
  const surfaced = out.shelf.picks
    .concat(out.bless)
    .concat(out.cover === null ? [] : [out.cover])
    .concat(out.album)
    .concat(out.journal);
  surfaced.forEach(function (id) {
    assert.ok(!oracleExcluded(items[id], filters),
      label + ': excluded item ' + id + ' (state=' + items[id].state +
      ', trigger=' + items[id].trigger + ') reached a surface — P0 leak');
  });
}

// Put one item alone in a store and assert every selector refuses it —
// the strongest per-item reading of "excluded from every unprompted
// surface".
function assertAllSelectorsRefuse(item, label) {
  const solo = {};
  solo[item.id] = item;
  const shelf = C.selectShelf(solo, { number: 1, shown_ids: [] }, [], now);
  assert.ok(shelf.picks.indexOf(item.id) === -1,
    label + ': ' + item.id + ' reached the shelf');
  const bless = C.pickBlessingCandidates(solo, [], now);
  assert.ok(bless.indexOf(item.id) === -1,
    label + ': ' + item.id + ' reached the blessing pass');
  assert.notStrictEqual(C.pickCoverCandidate(solo, [], {}, now), item.id,
    label + ': ' + item.id + ' was offered as a cover');
  const album = C.pickAlbumItems(solo, [], now);
  assert.ok(album.indexOf(item.id) === -1,
    label + ': ' + item.id + ' reached the album');
  const journal = C.pickJournalItems(solo, [], now);
  assert.ok(journal.indexOf(item.id) === -1,
    label + ': ' + item.id + ' reached the journal');
  assert.strictEqual(C.countPileByType(solo, [], now, item.type), 0,
    label + ': ' + item.id + ' inflated the pile count');
  // 26-02 (additive): a hand-planted librarian verdict for the same
  // excluded item must render nothing — the suggestions surface rides
  // the same gate as every other selector.
  const soloVerdicts = { verdicts: {} };
  soloVerdicts.verdicts[item.id] = { shelf: 'joyful', why: 'planted' };
  assert.strictEqual(
    C.selectLibrarianSuggestions(solo, [], soloVerdicts, now).length, 0,
    label + ': ' + item.id + ' reached the librarian suggestions ' +
    'surface');
}

// ---- one seeded iteration ---------------------------------------------------------

function runIteration(seed) {
  const rand = mulberry32(seed);
  const store = genStore(rand);
  const items = store.items;
  const filters = genFilters(rand, store.list);
  const tag = 'seed=' + seed;

  // Snapshot before ANY module call — nothing below may mutate the store.
  const storeSnapshot = JSON.stringify(items);

  // P4 baseline: the outputs of this store as if it never had filters.
  const baseline = selectorOutputs(items, store.cycle, [], store.coverOffers);

  // P1 — the core guarantee: all four classes on all three selectors,
  // with and without active filters.
  const gated = selectorOutputs(items, store.cycle, filters,
    store.coverOffers);
  assertNoLeak(items, filters, gated, tag);
  assertNoLeak(items, [], baseline, tag + ' (no filters)');

  // P5 — cover determinism: identical inputs, identical result.
  const coverAgain = C.pickCoverCandidate(items, filters, store.coverOffers,
    now);
  assert.strictEqual(coverAgain, gated.cover,
    tag + ': pickCoverCandidate is not deterministic (' + gated.cover +
    ' then ' + coverAgain + ')');

  // P2 — the planted leak: force a never_show item into a picks list and
  // assert the guard catches it and names the reason (the test is tested).
  const planted = genItem(rand, 9099);
  planted.state = 'never_show';
  planted.trigger = false;
  const fakeItems = {};
  Object.keys(items).forEach(function (k) { fakeItems[k] = items[k]; });
  fakeItems[planted.id] = planted;
  const fakePicks = gated.shelf.picks.concat([planted.id]);
  const caught = fakePicks.filter(function (id) {
    return C.guardSurface(fakeItems[id], filters) !== null;
  });
  assert.ok(caught.indexOf(planted.id) !== -1,
    tag + ': guardSurface let the planted never_show leak ' + planted.id +
    ' through a picks list');
  assert.strictEqual(C.guardSurface(planted, filters), 'never_show',
    tag + ': guardSurface must name the planted leak never_show');

  // P3 — hidden orthogonality (D-08): a sampled (or crafted) hidden item
  // stays hidden through markOpened; a hidden expired-resting item wakes
  // to blessed underneath but stays hidden; a hidden retired item dug out
  // stays hidden; ONLY the explicit release readmits.
  let hidden = null;
  for (let i = 0; i < store.list.length; i++) {
    if (store.list[i].trigger === true) { hidden = store.list[i]; break; }
  }
  if (!hidden) {
    hidden = genItem(rand, 9001);
    hidden.trigger = true;
  }
  const opened = C.markOpened(hidden, now);
  assert.strictEqual(opened.trigger, true,
    tag + ': markOpened cleared the trigger flag on ' + hidden.id);
  assert.ok(oracleExcluded(opened, []),
    tag + ': an opened hidden item stopped being excluded (' +
    hidden.id + ')');
  assertAllSelectorsRefuse(opened, tag + ' (opened hidden)');

  const rest = genItem(rand, 9002);
  rest.state = 'resting';
  rest.resting_until_ms = now - 5 * DAY;
  rest.trigger = true;
  const woken = C.markOpened(rest, now);
  assert.strictEqual(woken.state, 'blessed',
    tag + ': the expired-resting item did not wake to blessed');
  assert.strictEqual(woken.trigger, true,
    tag + ': the resting wake cleared the trigger flag on ' + rest.id);
  assertAllSelectorsRefuse(woken, tag + ' (woken hidden)');

  const ret = genItem(rand, 9003);
  ret.state = 'retired';
  ret.resting_until_ms = null;
  ret.trigger = true;
  const dug = C.applyTransition(ret, 'unseen', 'management-dig-out', now);
  assert.strictEqual(dug.trigger, true,
    tag + ': dig-out cleared the trigger flag on ' + ret.id);
  assert.ok(oracleExcluded(dug, []),
    tag + ': a dug-out hidden item stopped being excluded (' + ret.id + ')');
  assertAllSelectorsRefuse(dug, tag + ' (dug-out hidden)');

  // ONLY the explicit flag flip brings an item back (D-08).
  const releasedUnseen = C.setTrigger(dug, false, 'release', now);
  assert.strictEqual(oracleExcluded(releasedUnseen, []), false,
    tag + ': a released unseen item is still excluded');
  const soloA = {};
  soloA[releasedUnseen.id] = releasedUnseen;
  assert.strictEqual(C.pickCoverCandidate(soloA, [], {}, now),
    releasedUnseen.id,
    tag + ': a released unseen item never became a cover candidate');
  const releasedBlessed = C.setTrigger(woken, false, 'release', now);
  const soloB = {};
  soloB[releasedBlessed.id] = releasedBlessed;
  const backOnShelf = C.selectShelf(soloB, { number: 1, shown_ids: [] },
    [], now);
  assert.ok(backOnShelf.picks.indexOf(releasedBlessed.id) !== -1,
    tag + ': a released blessed item never came back to the shelf');

  // P4 — exact restore (D-07): removing every filter restores all three
  // selector outputs exactly, and no item field was ever touched — a
  // filter is a reversible overlay, never a state change.
  const restored = selectorOutputs(items, store.cycle, [],
    store.coverOffers);
  assert.deepStrictEqual(restored, baseline,
    tag + ': removing every filter did not restore the selector outputs ' +
    'exactly (D-07)');
  assert.strictEqual(JSON.stringify(items), storeSnapshot,
    tag + ': a selector or overlay call mutated the store — every core ' +
    'function must be pure');

  // 26-02 (additive) — the librarian suggestions selector obeys the
  // same gate: a verdict for an excluded item renders nothing, unsure
  // renders nothing, acked renders nothing, and an id the store never
  // held renders nothing (a hand-edited suggestions file is untrusted
  // input). Uses its OWN PRNG stream so every established seed above
  // replays byte-identically.
  const srand = mulberry32((seed ^ 0x2602) >>> 0);
  const sverd = {};
  store.list.forEach(function (it) {
    if (srand() < 0.8) {
      sverd[it.id] = {
        shelf: pickOne(srand, ['joyful', 'receipts', 'heavy', 'unsure']),
        why: 'w-' + it.id
      };
      if (srand() < 0.2) { sverd[it.id].acked = true; }
    }
  });
  sverd['gh0st00000000000'] = { shelf: 'joyful', why: 'no such item' };
  const libRows = C.selectLibrarianSuggestions(items, filters,
    { verdicts: sverd }, now);
  libRows.forEach(function (r) {
    assert.ok(items[r.item.id],
      tag + ': the librarian surfaced an id the store never held');
    assert.ok(!oracleExcluded(items[r.item.id], filters),
      tag + ': excluded item ' + r.item.id + ' reached the librarian ' +
      'suggestions surface — P0 leak');
    const v = sverd[r.item.id];
    assert.ok(v && v.shelf !== 'unsure' && v.acked !== true,
      tag + ': the librarian surfaced an unsure or acked verdict for ' +
      r.item.id);
    assert.strictEqual(r.shelf, v.shelf,
      tag + ': the surfaced shelf must be the verdict\'s own shelf');
  });
  assert.strictEqual(JSON.stringify(items), storeSnapshot,
    tag + ': selectLibrarianSuggestions mutated the store — every ' +
    'core function must be pure');

  // 26.8-01 (additive) — the walk selector on this iteration's store:
  // the same no-leak guarantee plus unseen-only, the strict arrival
  // boundary, recent-first order, and completeness (uncapped — the
  // sitting cap is app.js's). Rand-free (the boundary derives from the
  // frozen now), so every established seed above replays
  // byte-identically.
  const walkBoundary = now - 1400 * DAY;
  const walkStamp = function (it) {
    return Math.max(it.created_ms || 0, it.saved_ms || 0);
  };
  [[filters, 'filtered'], [[], 'unfiltered']].forEach(function (pair) {
    const wf = pair[0];
    const wtag = tag + ' walk(' + pair[1] + ')';
    const walkIds = C.pickWalkArrivals(items, wf, now,
      { boundaryMs: walkBoundary });
    walkIds.forEach(function (id, idx) {
      const it = items[id];
      assert.ok(it, wtag + ': surfaced an id the store never held');
      assert.ok(!oracleExcluded(it, wf),
        wtag + ': excluded item ' + id + ' (state=' + it.state +
        ', trigger=' + it.trigger + ') reached the walk — P0 leak');
      assert.strictEqual(it.state, 'unseen',
        wtag + ': non-unseen item ' + id + ' reached the walk');
      assert.ok(walkStamp(it) > walkBoundary,
        wtag + ': at-or-before-boundary item ' + id +
        ' reached the walk (the boundary is strict >)');
      if (idx > 0) {
        const prev = items[walkIds[idx - 1]];
        const a = walkStamp(prev);
        const b = walkStamp(it);
        assert.ok(a > b || (a === b && prev.id < it.id),
          wtag + ': order must be recent-first (newest max-stamp ' +
          'first, ties id-ascending) — ' + prev.id + ' before ' + id);
      }
    });
    const want = store.list.filter(function (it) {
      return it.state === 'unseen' && !oracleExcluded(it, wf) &&
        walkStamp(it) > walkBoundary;
    }).map(function (it) { return it.id; }).sort();
    assert.deepStrictEqual(walkIds.slice().sort(), want,
      wtag + ': the walk pool must be exactly the eligible arrivals');
  });
  assert.strictEqual(JSON.stringify(items), storeSnapshot,
    tag + ': pickWalkArrivals mutated the store — every core function ' +
    'must be pure');
}

// ---- fixed fixtures (not randomized) ------------------------------------------------

function fixedItem(id, over) {
  return Object.assign({
    id: id,
    content_hash: id + id,
    source: 'folder-drop',
    origin_path: '/src/notes/' + id + '.md',
    library_path: 'items/' + id + '.md',
    type: 'text',
    title: id + '.md',
    created_ms: now - 400 * DAY,
    saved_ms: now - 400 * DAY,
    imported_ms: now - 1 * DAY,
    last_opened_ms: null,
    state: 'unseen',
    resting_until_ms: null,
    year: 2026,
    folder: 'notes',
    tags: [],
    trigger: false,
    history: [{ at: '2026-06-01T00:00:00+00:00', from: null,
                to: 'unseen', via: 'import' }]
  }, over || {});
}

function runFixedFixtures() {
  // An all-excluded store — every class represented at once: empty picks,
  // empty blessing candidates, a null cover, and no throw anywhere.
  const items = {};
  [
    fixedItem('fx00000000000001', { state: 'never_show' }),
    fixedItem('fx00000000000002', { state: 'retired' }),
    fixedItem('fx00000000000003', { state: 'blessed', trigger: true }),
    fixedItem('fx00000000000004', { state: 'unseen', trigger: true }),
    fixedItem('fx00000000000005', { state: 'unseen', tags: ['screenshots'] }),
    fixedItem('fx00000000000006', { state: 'blessed', tags: ['screenshots'] })
  ].forEach(function (it) { items[it.id] = it; });
  const filters = [{ facet: 'tag', value: 'screenshots' }];
  const shelf = C.selectShelf(items, { number: 1, shown_ids: [] }, filters,
    now);
  assert.deepStrictEqual(shelf.picks, [],
    'all-excluded store: the shelf must come back empty');
  assert.deepStrictEqual(C.pickBlessingCandidates(items, filters, now), [],
    'all-excluded store: the blessing pass must come back empty');
  assert.strictEqual(C.pickCoverCandidate(items, filters, {}, now), null,
    'all-excluded store: the cover must be null');

  // The planted-leak self-test on fixed fixtures: a never_show item
  // forced into a picks list must draw a non-null guard reason.
  const leak = fixedItem('fx00000000000007', { state: 'never_show' });
  assert.strictEqual(C.guardSurface(leak, []), 'never_show',
    'guardSurface must flag a forced never_show leak with its reason');

  // 26-02 (additive): a hand-edited suggestions file cannot render a
  // fenced item — the two-suite redundancy over the server fence.
  const leakStore = {};
  leakStore[leak.id] = leak;
  const leakVerdicts = { verdicts: {} };
  leakVerdicts.verdicts[leak.id] = { shelf: 'joyful',
    why: 'hand-edited' };
  assert.deepStrictEqual(
    C.selectLibrarianSuggestions(leakStore, [], leakVerdicts, now), [],
    'a never_show item with a hand-edited verdict must render nothing');
}

// ---- 26.4-04 held-out backstops + fence parity -------------------------------
//
// Two held-out visual-state properties for the insight bookshelf (UI-SPEC
// long-text rows), plus the JS<->Python fence-parity assertion (D-19,
// T-26.4-12). These are independent of the seeded stores above: the backstops
// read the shipped tokens.css + app.js as text (the truncation is a CSS fact,
// the full-title render an app.js fact); the parity spawns python once over a
// golden fixture. All run ONCE, before the seeded loop.

function runInsightBackstops() {
  const tokens = readRepo('tokens.css');
  const app = readRepo('app.js');

  // Backstop 1 — a long book-spine title (e.g. 120 chars): it must truncate
  // on the spine (single line, ellipsis, CSS-only — never breaking the shelf)
  // AND render in FULL in the reader header. The 120-char title itself round-
  // trips untrimmed because the JS never slices it: only the CSS truncates.
  const longTitle = 'x'.repeat(120);
  assert.strictEqual(longTitle.length, 120,
    'backstop long-spine: the held-out title is 120 chars');
  const spineBlock = (tokens.match(/\.book-spine-title\s*\{[^}]*\}/) ||
    [''])[0];
  ['white-space: nowrap', 'overflow: hidden', 'text-overflow: ellipsis']
    .forEach(function (decl) {
      assert.ok(spineBlock.indexOf(decl) !== -1,
        'backstop long-spine: .book-spine-title must declare "' + decl +
        '" — a 120-char title truncates to a single ellipsized line on the ' +
        'spine, never breaking shelf layout');
    });
  // the spine carries the FULL title (escapeHtml(book.title)); the JS never
  // trims it — no .slice/.substr/.substring is applied to book.title anywhere.
  assert.ok(app.indexOf('escapeHtml(book.title)') !== -1,
    'backstop long-spine: the spine + reader header render escapeHtml(' +
    'book.title) — the full, untrimmed title');
  assert.ok(!/book\.title\s*\.\s*(?:slice|substr|substring)\s*\(/.test(app),
    'backstop long-spine: book.title must never be truncated in JS — the ' +
    'spine ellipsis is CSS-only, and the reader header shows it in full');

  // Backstop 2 — a very long verbatim connected note: it scrolls inside
  // #reader-content's OWN region (flex 1 1 auto / overflow-y:auto) without
  // pushing the sticky judgment bar (position: sticky) or breaking the panel;
  // content is never trimmed (law 4). All shipped facts the book reuses.
  const readerBlock = (tokens.match(/#reader-content\s*\{[^}]*\}/) || [''])[0];
  assert.ok(/overflow-y:\s*auto/.test(readerBlock),
    'backstop long-content: #reader-content must scroll (overflow-y:auto) — ' +
    'a long verbatim note scrolls in its own region');
  assert.ok(/#reader-content\s*\{[^}]*flex:\s*1 1 auto/
    .test(tokens.replace(/\s+/g, ' ')) ||
    /reader-content[\s\S]{0,120}flex:\s*1 1 auto/.test(tokens),
    'backstop long-content: #reader-content is the flex 1 1 auto scroller ' +
    'inside the room-home panel');
  ['#reaction-bar', '#proposals-bar'].forEach(function (sel) {
    const block = (tokens.match(new RegExp(sel + '\\s*\\{[^}]*\\}')) ||
      [''])[0];
    assert.ok(/position:\s*sticky/.test(block),
      'backstop long-content: ' + sel + ' must be position:sticky so long ' +
      'content never pushes the judgment bar out of reach (H9)');
  });
  // the book renders its verbatim content INTO #reader-content (the shipped
  // capped scroller), so it inherits the scroll region + sticky-bar guarantee.
  assert.ok(/function openInsightBook[\s\S]*?\$\('reader-content'\)/
    .test(app),
    'backstop long-content: openInsightBook renders into #reader-content — ' +
    'the shipped capped scroller');
}

// ---- 26.8.1-01 (D-A): the shared count-free "more waiting" line --------------
//
// Text-level backstops (the runInsightBackstops discipline: read app.js as
// text and assert the source facts — the count-free wording is an app.js
// chrome fact, not a core-selector fact). The exact "un-reviewed pile"
// count is removed from every front-facing browse/session surface and
// replaced by ONE shared constant, MORE_WAITING_COPY, rendered only when
// something is actually waiting (n > 0) and NOTHING at n == 0 (law 3). The
// celebratory "you welcomed N thing(s) back." line KEEPS its integer (that
// N is things in hand, not a backlog). Runs ONCE, before the seeded loop.
// The forbidden pile-count regexes deliberately do NOT live here — they are
// owned solely by tests/test_refinements_grep.cjs; this suite asserts the
// POSITIVE contract only.
//
// ⚠ ONE OF D-A's FOUR SURFACES CHANGED MECHANISM IN 26.95-32 (D-08), AND THE
// PROPERTY IT PROTECTS DID NOT. The album DESK-STATION is now the third door
// onto the visit's one Offer, so it no longer renders MORE_WAITING_COPY
// through pileHintCopy — it carries its own sentence at that one call site
// (candidate C-5 in 26.95-COPY.md, `copy_approved: false`). D-A's subject
// there was never the mechanism: it was that the label is COUNT-FREE and that
// the TAP AFFORDANCE survives. Both are still asserted, on the new mechanism,
// and both can still fail — see the re-pointed block below.
//   · album PANEL (#album-hint) — UNCHANGED, still pileHintCopy via
//     renderPileHint, which is why the two pins above stay where they are.
//   · album DESK-STATION (#album-pile) — RE-POINTED (26.95-32, D-08, C-5).
//   · session walk-close — UNCHANGED, still MORE_WAITING_COPY gated pile > 0,
//     where the sentence is still true.
// ⛔ The two places now make two different claims, and one sentence for both
// would make one of them false (OD-6 → A). MORE_WAITING_COPY is byte-identical.

function runMoreWaitingBackstops() {
  const app = readRepo('app.js');
  const CANON =
    /There('|\\')s more still waiting, whenever you('|\\')d like\./;

  // welcomed-N KEEPS its integer — the celebratory line still interpolates
  // the count of things in hand; law-3-fine, unchanged. (Asserted first so
  // this regression stays demonstrably GREEN even while the D-A surface
  // conversion below is still RED, pre-implementation.)
  assert.ok(app.indexOf('you welcomed 1 thing back.') !== -1 &&
    /you welcomed '\s*\+\s*n\s*\+\s*' things back\./.test(app),
    'D-A: the "you welcomed N thing(s) back." session line must KEEP its ' +
    'integer (that N is things IN HAND, not a backlog — law-3-fine)');

  // (n > 0) — the shared constant exists with the canonical value and is
  // what pileHintCopy returns, so the album panel renders the count-free
  // line. ⚠ THE STATED REASON HERE WAS CORRECTED IN 26.95-32, not the
  // assertion: this used to say "the album panel + album desk-station",
  // and the desk-station stopped inheriting through pileHintCopy when it
  // became a door onto the Offer (D-08). pileHintCopy is NOT retired — the
  // panel is a live caller through renderPileHint — so this pin stays
  // pointed exactly where it is.
  assert.ok(/(?:var|let|const)\s+MORE_WAITING_COPY\s*=/.test(app),
    'D-A: the shared MORE_WAITING_COPY constant must be declared');
  assert.ok(CANON.test(app),
    'D-A: MORE_WAITING_COPY must hold the canonical count-free value');
  assert.ok(
    /function pileHintCopy\([^)]*\)\s*\{[\s\S]*?return\s+MORE_WAITING_COPY\s*;[\s\S]*?\}/
      .test(app),
    'D-A: pileHintCopy must return the shared MORE_WAITING_COPY line (the ' +
    'album panel inherits the count-free copy through renderPileHint; the ' +
    'desk-station took its own sentence in 26.95-32, D-08)');

  // (n == 0) — renderPileHint keeps its early empty-return gate: at zero
  // the line renders nothing (no count, no count-free line — silence).
  assert.ok(
    /function renderPileHint\([^)]*\)\s*\{[\s\S]*?n === 0[\s\S]*?return;/
      .test(app),
    'D-A: renderPileHint must still render NOTHING at n==0 (the n===0 ' +
    'early-return gate is preserved — never a "0 waiting" line)');

  // ---- the album desk-station: D-A RE-POINTED (26.95-32, D-08, C-5) --------
  //
  // ⛔ RE-POINTED, NEVER RELAXED. D-A protects TWO things at this door — the
  // label carries NO COUNT, and the TAP AFFORDANCE survives. `pileHintCopy(n,
  // 'image')` was only ever the mechanism that delivered both, and D-08 moved
  // the mechanism: the station is now the third door onto the visit's one
  // Offer, so it takes its own sentence at this one call site and its tap
  // opens the shared door entry instead of the blessing pass. Both properties
  // are asserted below on the new mechanism and BOTH CAN STILL FAIL — each is
  // driven red by its own planted mutation, recorded in 26.95-32-SUMMARY.md.
  // ⛔ "Some label exists" would not be this pin. Count-free and tap-alive are
  // what it is for, and neither may be softened into the other.
  const PILE_ID = "pile.id = 'album-pile';";
  const PILE_TAIL = 'scene.appendChild(pile);';
  const pileIdAt = app.indexOf(PILE_ID);
  assert.ok(pileIdAt !== -1,
    'D-A: the #album-pile desk-station door was not found in app.js — it ' +
    'was renamed or removed; update this gate deliberately, never silently');
  assert.strictEqual(app.split(PILE_ID).length - 1, 1,
    'D-A: the #album-pile door must be built at exactly ONE site — a second ' +
    'would make every region check below read the wrong one');
  // ⚖️⚖️ RE-AIMED 2026-08-23 BY OWNER RULING (UAT session 2, Beat 9 → A).
  // ⛔ A PIN IS NEVER MOVED TO MAKE A SUITE GREEN. This one is moved because
  // the contract changed by ruling, and it now asserts the OPPOSITE of what it
  // used to. What it used to hold: the door sits inside an `if (hasOffer)`
  // presence gate, ABSENT when there is nothing to offer, never
  // present-but-inert (D-09, G-2). Her ruling, verbatim:
  //
  //   "A. Always shows its line. The album always says 'something from a
  //    while back, if you'd like.' ... Sometimes you tap it and there's
  //    nothing, so that sentence would sometimes be a lie."
  //
  // ⛔ She was told that cost, in those words, before she chose. "It is not a
  // misunderstanding and no agent may reverse it."
  //
  // So the gate now guards the ruling FROM BEING UNDONE: a presence condition
  // reappearing around this door is the regression, and this catches it. The
  // region is bounded forward from the door's own construction instead.
  const pileBuildAt = app.lastIndexOf("var pile = document.createElement('button');", pileIdAt);
  assert.ok(pileBuildAt !== -1 && pileIdAt - pileBuildAt < 200,
    'D-A: the #album-pile door must be constructed immediately before its id ' +
    'is set — the region could not be bounded');
  const pileGateAt = pileBuildAt;
  const beforeDoor = app.slice(Math.max(0, pileBuildAt - 900), pileBuildAt);
  assert.ok(!/if \(hasOffer\)/.test(beforeDoor),
    'D-A, Beat 9 → A: the #album-pile door must NOT sit inside a presence ' +
    'condition. She ruled the album is ALWAYS there and ALWAYS shows its ' +
    'line, and accepted that the line is sometimes false. An `if (hasOffer)` ' +
    'reappearing here is that ruling being reversed');
  const pileEnd = app.indexOf(PILE_TAIL, pileIdAt);
  assert.ok(pileEnd !== -1,
    'D-A: the #album-pile block must end by appending the door to the ' +
    'scene (' + PILE_TAIL + ') — the region could not be bounded');
  const pileRegion = app.slice(pileGateAt, pileEnd + PILE_TAIL.length);
  assert.ok(pileRegion.split('\n').length > 1,
    'D-A: the #album-pile region must span more than one line — a collapsed ' +
    'region would let every check below pass on nothing');
  // ⚠ COMMENTS STRIPPED BEFORE ANY SCAN. This block's own prose carries rule
  // ids (D-08, OD-6, P-8) and a dated veto, so a scan that read comments
  // would be reading the explanation instead of the code.
  const pileCode = pileRegion.split('\n')
    .map(function (l) { return l.replace(/^\s*\/\/.*$/, ''); }).join('\n');

  // PROPERTY 1 — THE LABEL CARRIES NO COUNT (law 3, her 2026-07-27 veto).
  // Three routes a number could take back into it, all closed: the label is
  // the BARE constant (never a concatenation); BOTH attributes are set from
  // that ONE identifier (never one of them re-derived); and the constant's
  // own value holds no digit.
  assert.ok(pileCode.indexOf('var pileLabel = OFFER_COPY.albumPile;') !== -1,
    'D-A: the album desk-station label must be the bare OFFER_COPY.albumPile ' +
    'constant — a concatenation here is exactly where a count would come ' +
    'back (candidate C-5, law 3)');
  ["pile.setAttribute('aria-label', pileLabel);",
    'pile.textContent = pileLabel;'].forEach(function (stmt) {
    assert.ok(pileCode.indexOf(stmt) !== -1,
      'D-A: the album desk-station must set its label AND its aria from the ' +
      'one pileLabel identifier — missing: ' + stmt + ' (OD-6: a screen ' +
      'reader and the screen may never make different claims)');
  });
  const albumPileValue =
    /albumPile:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(app);
  assert.ok(albumPileValue,
    'D-A: OFFER_COPY.albumPile must be declared as one string literal — the ' +
    'door\'s words have one home (candidate C-5, copy_approved: false)');
  assert.ok(!/[0-9]/.test(albumPileValue[1]),
    'D-A: the album desk-station label may carry NO COUNT — a number of ' +
    'things still waiting is the shape law 3 forbids on a front-facing ' +
    'surface. Found: ' + albumPileValue[1]);

  // PROPERTY 2 — THE TAP AFFORDANCE SURVIVES, and still reaches the ONE
  // shared door entry. A door that computed its own reach would spend a
  // second visit's worth of the store (G-8, D-08).
  assert.ok(pileCode.indexOf("pile.addEventListener('click',") !== -1,
    'D-A: the album desk-station must keep its tap affordance — a pile that ' +
    'cannot be tapped is a label pretending to be a door');
  assert.ok(pileCode.indexOf("reachDoorOpen('album',") !== -1,
    'D-A: the album desk-station\'s tap must open the ONE shared door entry, ' +
    "reachDoorOpen('album', …) — never a reach of its own (G-8, D-08)");

  // the session walk-close pushes the shared line, gated pile > 0; at
  // pile == 0 it pushes nothing.
  assert.ok(/pile > 0[\s\S]{0,300}MORE_WAITING_COPY/.test(app),
    'D-A: the session walk-close must push the shared MORE_WAITING_COPY ' +
    'line only when pile > 0 (nothing at pile==0)');
}

function runFenceParity() {
  // D-19 / T-26.4-12: the insight books draw from the JS fence
  // (StudyCore.surfacePool -> itemExcluded); the deterministic Python
  // selectors draw from study_lib._librarian_fenced. This golden fixture
  // asserts BOTH exclude EXACTLY the same items across the four shared
  // classes (never_show, retired, trigger overlay, filter match) — a fenced
  // item leaking into an insight on EITHER side is a P0. Valid states only,
  // the contract the two fences share.
  const items = [
    fixedItem('pa00000000000001', { state: 'blessed' }),
    fixedItem('pa00000000000002', { state: 'unseen' }),
    fixedItem('pa00000000000003', { state: 'never_show' }),
    fixedItem('pa00000000000004', { state: 'retired' }),
    fixedItem('pa00000000000005', { state: 'blessed', trigger: true }),
    fixedItem('pa00000000000006', { state: 'unseen', folder: 'private' }),
    fixedItem('pa00000000000007', { state: 'blessed', tags: ['screenshots'] }),
    fixedItem('pa00000000000008', { state: 'resting' })
  ];
  const filters = [
    { facet: 'folder', value: 'private' },
    { facet: 'tag', value: 'screenshots' }
  ];
  const jsExcluded = items
    .filter(function (it) { return C.itemExcluded(it, filters); })
    .map(function (it) { return it.id; }).sort();
  const tmp = path.join(os.tmpdir(), 'sr-fence-parity-' + process.pid +
    '.json');
  fs.writeFileSync(tmp, JSON.stringify({ items: items, filters: filters }));
  let pyOut;
  try {
    pyOut = execFileSync('python3', ['-c',
      'import sys, json, study_lib\n' +
      'd = json.load(open(sys.argv[1]))\n' +
      'ex = [it["id"] for it in d["items"] ' +
      'if study_lib._librarian_fenced(it, d["filters"])]\n' +
      'print(json.dumps(sorted(ex)))', tmp],
      { cwd: REPO, encoding: 'utf8' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const pyExcluded = JSON.parse(String(pyOut).trim());
  assert.deepStrictEqual(pyExcluded, jsExcluded,
    'fence parity (D-19, T-26.4-12): JS itemExcluded and Python ' +
    '_librarian_fenced must exclude the SAME items — JS=' +
    JSON.stringify(jsExcluded) + ' PY=' + JSON.stringify(pyExcluded));
}

// ---- 26.8-01 walk fixtures: the strict boundary + the predicate split --------
//
// Fixed cases for pickWalkArrivals (D-02/D-06): an item stamped exactly
// AT the boundary stays out and one ms past it comes in (strict >, both
// directions); a saved_ms newer than created_ms admits (max of the two);
// results sort recent-first; only unseen items walk; fenced / hidden /
// retired / filter-matched items stay out even with fresh stamps. Plus
// the Pitfall-1 BOTH-DIRECTIONS case: an OLD unseen item carrying a NEW
// comment is EXCLUDED from the walk while the reflection pool's own
// predicate (study_lib._reflection_stamp_ms, spawned as the authority)
// ADMITS exactly that fixture — two predicates, one boundary value, so
// the walk skips while the session still proceeds on the comment-bearing
// pool.

function runWalkFixtures() {
  const b = now - 100 * DAY;
  const atBoundary = fixedItem('wk00000000000001',
    { created_ms: b, saved_ms: b });
  const justIn = fixedItem('wk00000000000002',
    { created_ms: b + 1, saved_ms: b + 1 });
  const savedIn = fixedItem('wk00000000000003',
    { created_ms: b - 50 * DAY, saved_ms: b + 5 * DAY });
  const commentOnly = fixedItem('wk00000000000004', {
    created_ms: b - 200 * DAY, saved_ms: b - 200 * DAY,
    comments: [{
      at: new Date(b + 10 * DAY).toISOString().replace('Z', '+00:00'),
      text: 'a margin note'
    }]
  });
  const blessedNew = fixedItem('wk00000000000005',
    { state: 'blessed', created_ms: b + 2 * DAY, saved_ms: b + 2 * DAY });
  const fencedNew = fixedItem('wk00000000000006', {
    state: 'never_show', created_ms: b + 3 * DAY, saved_ms: b + 3 * DAY
  });
  const hiddenNew = fixedItem('wk00000000000007',
    { trigger: true, created_ms: b + 4 * DAY, saved_ms: b + 4 * DAY });
  const retiredNew = fixedItem('wk00000000000008',
    { state: 'retired', created_ms: b + 6 * DAY, saved_ms: b + 6 * DAY });
  const filteredNew = fixedItem('wk00000000000009', {
    tags: ['screenshots'], created_ms: b + 7 * DAY, saved_ms: b + 7 * DAY
  });
  const items = {};
  [atBoundary, justIn, savedIn, commentOnly, blessedNew, fencedNew,
    hiddenNew, retiredNew, filteredNew].forEach(function (it) {
    items[it.id] = it;
  });
  const filters = [{ facet: 'tag', value: 'screenshots' }];
  const ids = C.pickWalkArrivals(items, filters, now, { boundaryMs: b });
  assert.deepStrictEqual(ids, [savedIn.id, justIn.id],
    'walk fixtures: exactly the strict-after arrivals, recent-first ' +
    '(the saved-stamp item outranks the boundary+1ms item) — the ' +
    'boundary-exact, comment-only, non-unseen, fenced, hidden, retired, ' +
    'and filter-matched items all stay out');

  // the test is tested: one ms past the boundary flips the verdict
  const flipped = C.pickWalkArrivals(items, filters, now,
    { boundaryMs: b - 1 });
  assert.ok(flipped.indexOf(atBoundary.id) !== -1,
    'walk fixtures: the exact-boundary item walks once the boundary ' +
    'moves 1ms earlier — strict > proven from both sides');

  // Pitfall 1, the other direction: the reflection predicate ADMITS the
  // comment-bearing fixture the walk refused — python is the authority.
  const tmp = path.join(os.tmpdir(), 'sr-walk-split-' + process.pid +
    '.json');
  fs.writeFileSync(tmp, JSON.stringify({ item: commentOnly,
    boundary: b }));
  let pyOut;
  try {
    pyOut = execFileSync('python3', ['-c',
      'import sys, json, study_lib\n' +
      'd = json.load(open(sys.argv[1]))\n' +
      'print(json.dumps(study_lib._reflection_stamp_ms(d["item"]) > ' +
      'd["boundary"]))', tmp],
      { cwd: REPO, encoding: 'utf8' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  assert.strictEqual(JSON.parse(String(pyOut).trim()), true,
    'walk fixtures (Pitfall 1): the reflection predicate must ADMIT ' +
    'the old item with the new comment that the walk refused — the ' +
    'session proceeds on the comment-bearing pool while the walk skips');
}

// ---- main ------------------------------------------------------------------------

const replaySeed = process.argv[2] != null ? Number(process.argv[2]) : null;
if (replaySeed !== null && !Number.isInteger(replaySeed)) {
  console.error('usage: node tests/test_surface_property.cjs [seed]');
  process.exit(1);
}

let current = 'fixed fixtures';
try {
  runFixedFixtures();
  current = 'insight backstops (long-spine + long-content)';
  runInsightBackstops();
  current = 'more-waiting count-free backstops (D-A, 26.8.1-01)';
  runMoreWaitingBackstops();
  current = 'fence parity (JS itemExcluded <-> Python _librarian_fenced)';
  runFenceParity();
  current = 'walk fixtures (strict boundary + predicate split)';
  runWalkFixtures();
  current = 'fixed fixtures';
  if (replaySeed !== null) {
    current = 'seed=' + replaySeed;
    runIteration(replaySeed);
    console.log('test_surface_property OK (replayed seed ' + replaySeed +
      ')');
    process.exit(0);
  }
  for (let i = 0; i < ITERATIONS; i++) {
    const seed = BASE_SEED + i;
    current = 'seed=' + seed;
    runIteration(seed);
  }
  console.log('test_surface_property OK (' + ITERATIONS +
    ' seeded stores, base seed ' + BASE_SEED + ')');
  process.exit(0);
} catch (e) {
  console.error('test_surface_property FAILED at ' + current);
  console.error('  ' + (e && e.message ? e.message : String(e)));
  if (current.indexOf('seed=') === 0) {
    console.error('  replay: node tests/test_surface_property.cjs ' +
      current.slice(5));
  }
  process.exit(1);
}
