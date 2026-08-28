/*
 * test_subject_aside.cjs — R-10's asymmetry, driven from HER side.
 *
 * 26.9985 R-10, her ruling verbatim from the ledger: "Hide them from the
 * librarian, not from me." The librarian half lives in
 * study_lib._librarian_fenced's `aside` arm (tests/test_subject_aside.py
 * drives it, with a source-mutation drill). THIS file drives the other
 * half against the REAL shipped core.js: an item carrying the `aside`
 * mark must still reach her own surfaces — itemExcluded does NOT gain a
 * fifth class, guardSurface still renders it, the shelf still selects it.
 *
 * ⛔ EVERY EXISTING CLASS HIDES FROM BOTH SIDES (never_show, retired, the
 * trigger overlay, an active filter). `aside` is the first that must not,
 * and the natural failure mode is a later "keep the core.js port in sync"
 * tidy-up copying the python arm across. These cases are what that
 * tidy-up fails.
 *
 * Style: test_core.cjs's — assert/require only, IIFE blocks, one OK line.
 * Controls prove each case can fail: the same item under never_show IS
 * excluded, so a suite that lost its fixtures cannot stay green.
 */

'use strict';

const assert = require('assert');
const C = require('../core.js');

const NOW = 1787000000000; // frozen; core.js never reads the wall clock
const DAY = 24 * 60 * 60 * 1000;

function asideItem(over) {
  return Object.assign({
    id: 'aside-1',
    state: 'blessed',
    type: 'text',
    source: 'obsidian-vault',
    title: 'ASIDE-TITLE-still-hers',
    created_ms: NOW - 400 * DAY,
    saved_ms: NOW - 400 * DAY,
    aside: ['her-subject'],
  }, over || {});
}

// 1. itemExcluded does NOT honour the aside mark — her choke point still
//    lets the item through to every surface selector.
(function () {
  assert.strictEqual(C.itemExcluded(asideItem(), []), false,
    'itemExcluded honoured `aside` — the fifth class leaked into her ' +
    'side, which is exactly what R-10 rules against');
  // control: the same item under never_show IS excluded, so this case is
  // not green because the fixture stopped reaching the classes at all.
  assert.strictEqual(
    C.itemExcluded(asideItem({state: 'never_show'}), []), true,
    'control broke: never_show no longer excludes');
})();

// 2. guardSurface — the independent render-boundary re-check — still
//    renders it (null = clean), and its control still refuses never_show.
(function () {
  assert.strictEqual(C.guardSurface(asideItem(), []), null,
    'guardSurface refused an aside item — it would vanish from her ' +
    'own screen at the render boundary');
  assert.strictEqual(C.guardSurface(asideItem({state: 'never_show'}), []),
    'never_show', 'control broke: guardSurface never_show arm');
})();

// 3. surfacePool keeps it in the pool her surfaces draw from.
(function () {
  const pool = C.surfacePool({'aside-1': asideItem()}, [], NOW);
  assert.strictEqual(pool.length, 1,
    'surfacePool dropped an aside item — hidden from her, not just ' +
    'from the librarian');
})();

// 4. Her shelf still selects it: eligible, and actually picked.
(function () {
  assert.strictEqual(C.eligibleForShelf(asideItem(), NOW), true,
    'eligibleForShelf refused an aside blessed item');
  const shelf = C.selectShelf({'aside-1': asideItem()}, null, [], NOW, {});
  assert.ok(shelf.picks.indexOf('aside-1') !== -1,
    'selectShelf left an aside item off her own shelf');
})();

console.log('CASES 4');
console.log('test_subject_aside OK (an aside item is hidden from the ' +
  'librarian only — every surface of HERS still shows it)');
