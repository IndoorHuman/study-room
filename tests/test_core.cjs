/*
 * test_core.cjs — frozen-now, zero-dependency node suite for core.js
 * (Plan 22-03, Task 1).
 *
 * Style ported from the house's tests/test_magazine.cjs: assert/fs/path
 * only, IIFE test blocks, exits non-zero on any throw, one OK line at the
 * end. The single frozen `now` comes from tests/fixtures/frozen-now.json —
 * core.js itself NEVER reads the wall clock (D-02); the suite proves it
 * with a source-text scan at the bottom.
 *
 * No golden fixtures shared with python (D-02): item fixtures are inline
 * object literals with timestamps derived from `now` via DAY_MS arithmetic.
 *
 * Behaviors covered:
 *   1. STATES — exactly the five states, byte-matching study_lib.VALID_STATES
 *   2. DEFAULTS / DAY_MS — the tunable thresholds and the day constant
 *   3. canTransition — every ordinary revision allowed; retired leaves only
 *      via the management dig-out; into retired always allowed; unknown
 *      target states rejected (SRM-01)
 *   4. applyTransition — pure (input never mutated), one history entry
 *      {at, from, to, via} with `at` derived from the injected nowMs,
 *      resting_until_ms cleared when leaving resting, plain Error naming
 *      the rejected pair on failure
 *   5. pickBlessingCandidates — unseen only, oldest-first within buckets,
 *      round-robin interleave across (type + top-level source folder)
 *      buckets (D-10), default count 10 / opts override, deterministic
 *      with id-lexicographic tie-breaks, accepts the store's items map
 *   6. eligibleForShelf — blessed or expired-resting only (lazy wake, no
 *      timers); unseen / never_show / retired NEVER eligible (Plan 22-04)
 *   7. shelfSize — the adaptive 3–5 band (D-14), thresholds opts-overridable
 *   8. selectShelf — deterministic preference bands (never-opened oldest
 *      first, then 30+-days-unopened oldest first, then the rest), cycle
 *      exclusion + reset reporting, never-list integrity by construction,
 *      LOOP INVARIANT, regeneration stability (SRM-01)
 *   9. applyReaction / markOpened — glad / not_really (resting ~90d) /
 *      never_again (retired), opened recording + lazy resting wake, all pure
 *  9b. attachment rendering (22-uat) — attachmentUrl (id + /att/ route,
 *      full percent-encoding), rewriteAttachmentRefs (wikilinks and local
 *      markdown images matching an attached picture become standard
 *      markdown images over the route; NFC/case-folded matching; anything
 *      unmatched stays byte-for-byte), unreferencedAttachments (the
 *      pictures the body never mentions, natural numeric filename order)
 *  10. source-text discipline — no wall-clock reads, no randomness, exactly
 *      one dual-export line
 *
 * Phase 23 (Plan 23-02) additions — the exclusion machinery:
 *  11. matchesFilter / itemExcluded / surfacePool — per-facet matching
 *      (year as a pure integer compare on the stamped field, the
 *      screenshots tag facet), the four-class union exclusion, the choke
 *      point, and filter add/remove restoring every selector output
 *      exactly (D-07/D-10/D-11)
 *  12. gated selectors — a trigger-hidden item is absent from selectShelf,
 *      pickBlessingCandidates AND pickCoverCandidate while its state stays
 *      untouched (the overlay wins, D-08); trigger+filter union adjacency;
 *      an all-excluded store yields empty results without error
 *  13. pickCoverCandidate — at most ONE unseen id, cooldown-aware
 *      (COVER_COOLDOWN_DAYS), oldest-first with an explicit
 *      id-lexicographic tie, null when nothing qualifies (D-01/D-04)
 *  14. setTrigger — a same-state transition wrapper: trigger flipped,
 *      state preserved, history entry with the via; hidden survives
 *      markOpened, the resting wake, reactions, and dig-out — release is
 *      ONLY an explicit setTrigger false (D-08)
 *  15. guardSurface — the independent render-boundary re-check: null when
 *      clean, the documented reason string per excluded class (D-13)
 *
 * Phase 24 (Plan 24-02) additions — the containers:
 *  17. pickAlbumItems / pickJournalItems / countPileByType — blessed-only
 *      type-split browse selectors (saved_ms ascending, id-lexicographic
 *      ties, input-order independence, empty stores, clean filter
 *      restore) and the gated pile count: a trigger-hidden or
 *      filter-matched unseen item never counts (24 D-11/D-12/D-13)
 *
 * Phase 26.88 (Plan 26.88-12, Q4) addition:
 *  18. cleanVaultMarkup / escapeHtml / escapeAttr — the renderer's own
 *      scaffolding transform and its two escapers, moved out of app.js.
 *      THESE BEHAVIOURS SHIPPED IN 2026-05 AND HAVE NEVER HAD A DIRECT
 *      TEST, because until the move they could not have one: app.js has no
 *      module surface, so no node suite could see what `marked` receives.
 *      That is exactly how F-1's empty `## ` heading survived 47 green
 *      suites — the empty heading only exists after cleanVaultMarkup runs.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const C = require('../core.js');
// core.js as TEXT, for the one 26.91-04 assertion that must prove a dead
// CONTRACT is gone rather than that a live value is right (a retired opts
// key has no evaluated presence to read).
const coreSrc = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');

const FIX = path.join(__dirname, 'fixtures');
// The single frozen `now` epoch injected verbatim — stored as an integer so
// date math consumes IDENTICAL ms (no per-runtime re-derive).
const now = JSON.parse(
  fs.readFileSync(path.join(FIX, 'frozen-now.json'), 'utf8')).now_ms;
const DAY = 86400000;

// ---- inline fixture helpers ------------------------------------------------

let seq = 0;
function mkItem(over) {
  seq += 1;
  const id = (over && over.id) || ('item' + String(seq).padStart(11, '0'));
  return Object.assign({
    id: id,
    content_hash: id + id,
    source: 'folder-drop',
    origin_path: '/src/notes/' + id + '.md',
    library_path: 'items/' + id + '.md',
    type: 'text',
    title: id + '.md',
    created_ms: now - 40 * DAY,
    saved_ms: now - 40 * DAY,
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

// ---- 1. STATES ---------------------------------------------------------------

(function testStatesMatchStudyLib() {
  assert.deepStrictEqual(C.STATES,
    ['unseen', 'blessed', 'never_show', 'resting', 'retired'],
    'STATES is exactly the five states in order');
  // Cross-language pin without a golden fixture: parse VALID_STATES straight
  // out of study_lib.py so the two enums can never drift silently.
  const py = fs.readFileSync(path.join(__dirname, '..', 'study_lib.py'),
    'utf8');
  const m = py.match(/VALID_STATES\s*=\s*\(([^)]*)\)/);
  assert.ok(m, 'VALID_STATES tuple found in study_lib.py');
  const pyStates = m[1].split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  assert.deepStrictEqual(C.STATES, pyStates,
    'STATES matches study_lib.VALID_STATES byte for byte');
})();

// ---- 2. DEFAULTS + DAY_MS ------------------------------------------------------

(function testDefaults() {
  assert.deepStrictEqual(C.DEFAULTS, {
    OPEN_STALE_DAYS: 30,
    RESTING_DAYS: 90,
    SHELF_MIN: 3,
    SHELF_MAX: 5,
    SHELF_SIZE_4_AT: 10,
    SHELF_SIZE_5_AT: 25,
    BLESSING_COUNT: 10,
    // 26.999 (her ruling, night of 2026-08-25): the guided pass may LEAD
    // with things related to what she recently welcomed, and this many
    // places always go to the rest of her pile so nothing she saved can
    // become unreachable. Her words, chosen over related-first-always:
    // "Always keep a slice for the rest". The pin moved deliberately and
    // was seen red first (this table is by-value on purpose).
    BLESSING_RESERVE: 2,
    COVER_COOLDOWN_DAYS: 14
  }, 'DEFAULTS carries the tunable thresholds');
  assert.strictEqual(C.DAY_MS, 86400000, 'DAY_MS is one day in epoch ms');
})();

// ---- 3. canTransition (the 5-state table, SRM-01) --------------------------------

(function testTransitionTable() {
  const ordinary = ['unseen', 'blessed', 'never_show', 'resting'];
  ordinary.forEach(function (from) {
    ordinary.forEach(function (to) {
      assert.strictEqual(C.canTransition(from, to, 'blessing'), true,
        from + ' -> ' + to + ' is an ordinary revision (allowed)');
      assert.strictEqual(C.canTransition(from, to, 'management'), true,
        from + ' -> ' + to + ' allowed with any plain via label');
    });
    // INTO retired is always allowed (never_again reaction, management).
    assert.strictEqual(C.canTransition(from, 'retired', 'reaction'), true,
      from + ' -> retired allowed (never_again reaction)');
    assert.strictEqual(C.canTransition(from, 'retired', 'management'), true,
      from + ' -> retired allowed (management)');
    // OUT of retired requires the deliberate dig-out route.
    assert.strictEqual(C.canTransition('retired', from, 'blessing'), false,
      'retired -> ' + from + ' rejected with a plain via');
    assert.strictEqual(C.canTransition('retired', from, 'management'), false,
      'retired -> ' + from + ' rejected even via management');
    assert.strictEqual(
      C.canTransition('retired', from, 'management-dig-out'), true,
      'retired -> ' + from + ' allowed via the management dig-out');
  });
  assert.strictEqual(C.canTransition('retired', 'retired', 'management'),
    true, 'retired -> retired is not a leave (allowed)');
  // Unknown target states are rejected.
  assert.strictEqual(C.canTransition('unseen', 'archived', 'management'),
    false, 'unknown target state rejected');
  assert.strictEqual(C.canTransition('unseen', undefined, 'management'),
    false, 'missing target state rejected');
  assert.strictEqual(C.canTransition('unseen', '', 'management'),
    false, 'empty target state rejected');
})();

// ---- 4. applyTransition (pure, history, resting clear, rejects) ------------------

(function testApplyTransitionPurity() {
  const item = mkItem({ id: 'pure000000000001' });
  const snapshot = JSON.parse(JSON.stringify(item));
  const out = C.applyTransition(item, 'blessed', 'blessing', now);
  assert.notStrictEqual(out, item, 'returns a NEW object');
  assert.deepStrictEqual(item, snapshot, 'the input item is never mutated');
  assert.notStrictEqual(out.history, item.history,
    'the history array is copied, not shared');
  assert.strictEqual(out.state, 'blessed', 'state set on the new object');
  assert.strictEqual(out.history.length, item.history.length + 1,
    'exactly one history entry appended');
  assert.deepStrictEqual(out.history[out.history.length - 1], {
    at: new Date(now).toISOString(),
    from: 'unseen',
    to: 'blessed',
    via: 'blessing'
  }, 'the entry is {at from to via} with `at` derived from the injected nowMs');
  assert.strictEqual(out.id, item.id, 'identity rule: id carried unchanged');
})();

(function testApplyTransitionRestingClear() {
  const until = now + 90 * DAY;
  const rest = mkItem({ state: 'resting', resting_until_ms: until });
  const woke = C.applyTransition(rest, 'blessed', 'reaction', now);
  assert.strictEqual(woke.resting_until_ms, null,
    'leaving resting clears resting_until_ms');
  assert.strictEqual(rest.resting_until_ms, until,
    'the input item keeps its resting_until_ms (purity)');
  const still = C.applyTransition(rest, 'resting', 'management', now);
  assert.strictEqual(still.resting_until_ms, until,
    'staying in resting keeps resting_until_ms');
})();

(function testApplyTransitionRejects() {
  const dug = mkItem({ state: 'retired' });
  assert.throws(function () {
    C.applyTransition(dug, 'blessed', 'blessing', now);
  }, function (err) {
    return err instanceof Error &&
      err.message.indexOf('retired') !== -1 &&
      err.message.indexOf('blessed') !== -1;
  }, 'a rejected transition throws a plain Error naming the pair');
  const out = C.applyTransition(dug, 'blessed', 'management-dig-out', now);
  assert.strictEqual(out.state, 'blessed',
    'the management dig-out releases a retired item');
  assert.throws(function () {
    C.applyTransition(mkItem({}), 'archived', 'management', now);
  }, function (err) {
    return err instanceof Error && err.message.indexOf('archived') !== -1;
  }, 'an unknown target state throws');
})();

(function testApplyTransitionNoHistory() {
  const bare = mkItem({ id: 'bare000000000001' });
  delete bare.history;
  const out = C.applyTransition(bare, 'never_show', 'blessing', now);
  assert.strictEqual(out.history.length, 1,
    'a missing history array is treated as empty, one entry appended');
})();

// ---- 5. pickBlessingCandidates ------------------------------------------------

(function testCandidatesUnseenOnly() {
  const items = [
    mkItem({ id: 'aa00000000000001', state: 'unseen',
             created_ms: now - 50 * DAY }),
    mkItem({ id: 'aa00000000000002', state: 'blessed',
             created_ms: now - 90 * DAY }),
    mkItem({ id: 'aa00000000000003', state: 'never_show',
             created_ms: now - 90 * DAY }),
    mkItem({ id: 'aa00000000000004', state: 'resting',
             created_ms: now - 90 * DAY }),
    mkItem({ id: 'aa00000000000005', state: 'retired',
             created_ms: now - 90 * DAY }),
    mkItem({ id: 'aa00000000000006', state: 'unseen',
             created_ms: now - 60 * DAY })
  ];
  const picks = C.pickBlessingCandidates(items, [], now);
  assert.deepStrictEqual(picks,
    ['aa00000000000006', 'aa00000000000001'],
    'only unseen items are candidates, oldest first');
})();

(function testCandidatesOldestFirstAndTies() {
  // One bucket (same type, same folder): pure oldest-first ordering.
  const items = [
    mkItem({ id: 'cc00000000000001', created_ms: now - 10 * DAY }),
    mkItem({ id: 'cc00000000000002', created_ms: now - 30 * DAY }),
    mkItem({ id: 'cc00000000000003', created_ms: now - 20 * DAY }),
    // Two items born the same ms: the tie breaks id-lexicographic.
    mkItem({ id: 'zz00000000000009', created_ms: now - 99 * DAY }),
    mkItem({ id: 'bb00000000000009', created_ms: now - 99 * DAY })
  ];
  const picks = C.pickBlessingCandidates(items, [], now);
  assert.deepStrictEqual(picks, [
    'bb00000000000009', 'zz00000000000009',
    'cc00000000000002', 'cc00000000000003', 'cc00000000000001'
  ], 'oldest-first by created_ms, ties broken by id lexicographic');
})();

(function testCandidatesInterleaveTypesAndFolders() {
  // Notes under /src/notes, photos under /src/photos: two buckets keyed by
  // (type + top-level source folder), visited round-robin so the pass mixes
  // notes and photos instead of front-loading one pile (D-10).
  const items = [
    mkItem({ id: 'nn00000000000001', type: 'text',
             origin_path: '/src/notes/one.md', created_ms: now - 100 * DAY }),
    mkItem({ id: 'nn00000000000002', type: 'text',
             origin_path: '/src/notes/two.md', created_ms: now - 90 * DAY }),
    mkItem({ id: 'nn00000000000003', type: 'text',
             origin_path: '/src/notes/three.md', created_ms: now - 80 * DAY }),
    mkItem({ id: 'pp00000000000001', type: 'image',
             origin_path: '/src/photos/one.png', created_ms: now - 95 * DAY,
             library_path: 'items/pp00000000000001.png' }),
    mkItem({ id: 'pp00000000000002', type: 'image',
             origin_path: '/src/photos/two.png', created_ms: now - 85 * DAY,
             library_path: 'items/pp00000000000002.png' })
  ];
  const picks = C.pickBlessingCandidates(items, [], now);
  assert.deepStrictEqual(picks, [
    'nn00000000000001', 'pp00000000000001',
    'nn00000000000002', 'pp00000000000002',
    'nn00000000000003'
  ], 'buckets interleave round-robin, oldest bucket leads, oldest first inside');
})();

(function testCandidatesInterleaveFoldersSameType() {
  // Same type, different top-level source folders still form distinct
  // buckets — journal and work notes mix.
  const items = [
    mkItem({ id: 'jj00000000000001', origin_path: '/src/journal/a.md',
             created_ms: now - 50 * DAY }),
    mkItem({ id: 'jj00000000000002', origin_path: '/src/journal/deep/b.md',
             created_ms: now - 40 * DAY }),
    mkItem({ id: 'ww00000000000001', origin_path: '/src/work/c.md',
             created_ms: now - 45 * DAY }),
    mkItem({ id: 'ww00000000000002', origin_path: '/src/work/d.md',
             created_ms: now - 35 * DAY })
  ];
  const picks = C.pickBlessingCandidates(items, [], now);
  assert.deepStrictEqual(picks, [
    'jj00000000000001', 'ww00000000000001',
    'jj00000000000002', 'ww00000000000002'
  ], 'same-type items from different source folders interleave');
})();

(function testCandidatesUnevenBuckets() {
  // When a bucket runs dry the round-robin keeps drawing from the rest.
  const items = [
    mkItem({ id: 'aa00000000000011', origin_path: '/src/notes/a.md',
             created_ms: now - 70 * DAY }),
    mkItem({ id: 'aa00000000000012', origin_path: '/src/notes/b.md',
             created_ms: now - 60 * DAY }),
    mkItem({ id: 'aa00000000000013', origin_path: '/src/notes/c.md',
             created_ms: now - 50 * DAY }),
    mkItem({ id: 'pp00000000000011', type: 'image',
             origin_path: '/src/photos/only.png', created_ms: now - 65 * DAY })
  ];
  const picks = C.pickBlessingCandidates(items, [], now);
  assert.deepStrictEqual(picks, [
    'aa00000000000011', 'pp00000000000011',
    'aa00000000000012', 'aa00000000000013'
  ], 'an exhausted bucket is skipped, the rest keep rotating');
})();

(function testCandidatesCountAndOverride() {
  const items = [];
  for (let i = 1; i <= 14; i++) {
    items.push(mkItem({
      id: 'dd000000000000' + String(i).padStart(2, '0'),
      created_ms: now - (200 - i) * DAY
    }));
  }
  assert.strictEqual(C.pickBlessingCandidates(items, [], now).length, 10,
    'default count is DEFAULTS.BLESSING_COUNT (10)');
  assert.strictEqual(
    C.pickBlessingCandidates(items, [], now, { BLESSING_COUNT: 4 }).length, 4,
    'count is overridable via opts');
  const few = items.slice(0, 3);
  assert.strictEqual(C.pickBlessingCandidates(few, [], now).length, 3,
    'fewer than the count returns them all');
  assert.deepStrictEqual(C.pickBlessingCandidates([], [], now), [],
    'no unseen items means an empty pass, not an error');
})();

(function testCandidatesDeterministicAndMapInput() {
  const items = [
    mkItem({ id: 'ee00000000000001', origin_path: '/src/notes/a.md',
             created_ms: now - 80 * DAY }),
    mkItem({ id: 'ee00000000000002', type: 'image',
             origin_path: '/src/photos/b.png', created_ms: now - 75 * DAY }),
    mkItem({ id: 'ee00000000000003', origin_path: '/src/notes/c.md',
             created_ms: now - 70 * DAY })
  ];
  const first = C.pickBlessingCandidates(items, [], now);
  const second = C.pickBlessingCandidates(items, [], now);
  assert.deepStrictEqual(second, first,
    'identical inputs give identical output (no wall clock, no randomness)');
  // The store serves items as an object map keyed by id — accept that too.
  const map = {};
  items.forEach(function (it) { map[it.id] = it; });
  assert.deepStrictEqual(C.pickBlessingCandidates(map, [], now), first,
    'the store items map form gives the same picks as the array form');
})();

// ---- 6. eligibleForShelf (SRM-01 eligibility, lazy resting wake) -----------------

(function testEligibility() {
  const blessed = mkItem({ state: 'blessed' });
  assert.strictEqual(C.eligibleForShelf(blessed, now), true,
    'blessed items are eligible for the shelf');
  const expired = mkItem({ state: 'resting', resting_until_ms: now - 1 * DAY });
  assert.strictEqual(C.eligibleForShelf(expired, now), true,
    'expired resting wakes lazily into eligibility (no timers anywhere)');
  const exact = mkItem({ state: 'resting', resting_until_ms: now });
  assert.strictEqual(C.eligibleForShelf(exact, now), true,
    'resting_until_ms equal to now counts as expired');
  const future = mkItem({ state: 'resting', resting_until_ms: now + 1 * DAY });
  assert.strictEqual(C.eligibleForShelf(future, now), false,
    'a still-sleeping resting item is not eligible');
  const dateless = mkItem({ state: 'resting', resting_until_ms: null });
  assert.strictEqual(C.eligibleForShelf(dateless, now), true,
    'a resting item with no wake date is not held asleep');
  ['unseen', 'never_show', 'retired'].forEach(function (state) {
    const it = mkItem({ state: state, created_ms: now - 900 * DAY,
                        last_opened_ms: null });
    assert.strictEqual(C.eligibleForShelf(it, now), false,
      state + ' is NEVER eligible, regardless of dates');
  });
})();

// ---- 7. shelfSize (D-14 adaptive 3–5 band) ----------------------------------------

(function testShelfSizeBands() {
  assert.strictEqual(C.shelfSize(1), 3, 'pool of 1 -> 3 (band floor)');
  assert.strictEqual(C.shelfSize(9), 3, 'pool of 9 -> 3');
  assert.strictEqual(C.shelfSize(10), 4, 'pool of 10 -> 4');
  assert.strictEqual(C.shelfSize(24), 4, 'pool of 24 -> 4');
  assert.strictEqual(C.shelfSize(25), 5, 'pool of 25 -> 5');
  assert.strictEqual(C.shelfSize(200), 5, 'pool of 200 -> 5 (ceiling locked)');
  assert.strictEqual(C.shelfSize(3, { SHELF_SIZE_4_AT: 2, SHELF_SIZE_5_AT: 4 }),
    4, 'the 4-pick threshold is opts-overridable');
  assert.strictEqual(C.shelfSize(4, { SHELF_SIZE_4_AT: 2, SHELF_SIZE_5_AT: 4 }),
    5, 'the 5-pick threshold is opts-overridable');
})();

// ---- 8. selectShelf (bands, cycle, never-list integrity, LOOP INVARIANT) ----------

(function testShelfPreferenceBandsAndDeterminism() {
  // Widen the shelf via opts so the full ordering is observable in one call.
  const opts = { SHELF_SIZE_4_AT: 1, SHELF_SIZE_5_AT: 2, SHELF_MAX: 8 };
  const items = [
    // band 1 (never opened): oldest created first, id-lexicographic ties
    mkItem({ id: 'aaz0000000000001', state: 'blessed',
             created_ms: now - 150 * DAY, last_opened_ms: null }),
    mkItem({ id: 'aat0000000000001', state: 'blessed',
             created_ms: now - 150 * DAY, last_opened_ms: null }),
    mkItem({ id: 'b1a0000000000001', state: 'blessed',
             created_ms: now - 100 * DAY, last_opened_ms: null }),
    mkItem({ id: 'b1b0000000000001', state: 'blessed',
             created_ms: now - 50 * DAY, last_opened_ms: null }),
    // band 2 (opened 30+ days ago): oldest last_opened first; exactly 30
    // days counts as stale (30+)
    mkItem({ id: 'b2a0000000000001', state: 'blessed',
             created_ms: now - 200 * DAY, last_opened_ms: now - 60 * DAY }),
    mkItem({ id: 'b2b0000000000001', state: 'blessed',
             created_ms: now - 200 * DAY, last_opened_ms: now - 30 * DAY }),
    // band 3 (opened recently): oldest last_opened first
    mkItem({ id: 'b3a0000000000001', state: 'blessed',
             created_ms: now - 200 * DAY, last_opened_ms: now - 5 * DAY }),
    mkItem({ id: 'b3b0000000000001', state: 'blessed',
             created_ms: now - 200 * DAY, last_opened_ms: now - 29 * DAY })
  ];
  const res = C.selectShelf(items, { number: 1, shown_ids: [] }, [], now,
    opts);
  assert.deepStrictEqual(res.picks, [
    'aat0000000000001', 'aaz0000000000001',
    'b1a0000000000001', 'b1b0000000000001',
    'b2a0000000000001', 'b2b0000000000001',
    'b3b0000000000001', 'b3a0000000000001'
  ], 'band 1 (never-opened, oldest created, id ties) then band 2 (30+ days, ' +
     'oldest opened) then band 3 (rest, oldest opened)');
  assert.strictEqual(res.cycleReset, false,
    'a fresh cycle with room to spare is not a reset');
  // Determinism: identical input -> deep-equal output on repeated calls.
  assert.deepStrictEqual(C.selectShelf(items, { number: 1, shown_ids: [] },
    [], now, opts), res,
    'identical inputs give identical output (no randomness)');
  // The store's items-map form gives the same shelf as the array form.
  const map = {};
  items.forEach(function (it) { map[it.id] = it; });
  assert.deepStrictEqual(C.selectShelf(map, { number: 1, shown_ids: [] },
    [], now, opts), res, 'the store items map form gives the same picks');
})();

(function testShelfNeverListIntegrity() {
  // Every excluded state gets the most tempting dates possible — ancient,
  // never opened — and must STILL never appear (never-list integrity by
  // construction, T-22-14).
  const never = mkItem({ id: 'nv00000000000001', state: 'never_show',
                         created_ms: now - 900 * DAY, last_opened_ms: null });
  const retired = mkItem({ id: 'rt00000000000001', state: 'retired',
                           created_ms: now - 900 * DAY, last_opened_ms: null });
  const unseen = mkItem({ id: 'un00000000000001', state: 'unseen',
                          created_ms: now - 900 * DAY, last_opened_ms: null });
  const asleep = mkItem({ id: 'sl00000000000001', state: 'resting',
                          resting_until_ms: now + 30 * DAY,
                          created_ms: now - 900 * DAY, last_opened_ms: null });
  const items = [never, retired, unseen, asleep,
    mkItem({ id: 'bl00000000000001', state: 'blessed' }),
    mkItem({ id: 'bl00000000000002', state: 'blessed' })
  ];
  const res = C.selectShelf(items, { number: 1, shown_ids: [] }, [], now);
  [never, retired, unseen, asleep].forEach(function (it) {
    assert.ok(res.picks.indexOf(it.id) === -1,
      it.state + ' item ' + it.id + ' never appears in picks');
  });
  assert.deepStrictEqual(res.picks.slice().sort(),
    ['bl00000000000001', 'bl00000000000002'],
    'only the blessed items are ever picked');
  // Even a cycle reset (everything eligible already shown) re-selects ONLY
  // from the eligible pool — the excluded states stay excluded.
  const res2 = C.selectShelf(items,
    { number: 1, shown_ids: ['bl00000000000001', 'bl00000000000002'] },
    [], now);
  assert.strictEqual(res2.cycleReset, true,
    'an exhausted eligible pool reports cycleReset');
  [never, retired, unseen, asleep].forEach(function (it) {
    assert.ok(res2.picks.indexOf(it.id) === -1,
      it.state + ' stays excluded across a cycle reset');
  });
})();

(function testShelfLazyWakeInSelection() {
  const woke = mkItem({ id: 'wk00000000000001', state: 'resting',
                        resting_until_ms: now - 1 * DAY,
                        last_opened_ms: now - 100 * DAY });
  const items = [woke, mkItem({ id: 'bl00000000000009', state: 'blessed' })];
  const res = C.selectShelf(items, null, [], now); // null cycle = nothing shown
  assert.ok(res.picks.indexOf('wk00000000000001') !== -1,
    'an expired-resting item wakes into the selection (lazy, no timers)');
})();

(function testShelfAdaptiveSizeNeverExceedsPool() {
  function pool(n) {
    const arr = [];
    for (let i = 1; i <= n; i++) {
      arr.push(mkItem({
        id: 'sz000000000000' + String(i).padStart(2, '0'),
        state: 'blessed', created_ms: now - (300 - i) * DAY
      }));
    }
    return arr;
  }
  assert.strictEqual(C.selectShelf(pool(9), null, [], now).picks.length, 3,
    'pool of 9 -> 3 picks');
  assert.strictEqual(C.selectShelf(pool(10), null, [], now).picks.length, 4,
    'pool of 10 -> 4 picks');
  assert.strictEqual(C.selectShelf(pool(25), null, [], now).picks.length, 5,
    'pool of 25 -> 5 picks');
  const tiny = C.selectShelf(pool(2), null, [], now);
  assert.strictEqual(tiny.picks.length, 2,
    'never more picks than the eligible pool provides');
  assert.strictEqual(tiny.cycleReset, false,
    'a small pool with nothing shown is not a cycle reset');
})();

(function testShelfCycleLoopInvariant() {
  const items = [];
  for (let i = 1; i <= 10; i++) {
    items.push(mkItem({
      id: 'cy000000000000' + String(i).padStart(2, '0'),
      state: 'blessed', created_ms: now - (300 - i) * DAY
    }));
  }
  const first = C.selectShelf(items, { number: 1, shown_ids: [] }, [], now);
  assert.strictEqual(first.picks.length, 4, 'pool of 10 -> 4 picks');
  const second = C.selectShelf(items, { number: 1, shown_ids: first.picks },
    [], now);
  first.picks.forEach(function (id) {
    assert.ok(second.picks.indexOf(id) === -1,
      'LOOP INVARIANT: shown id ' + id + ' is absent from the next ' +
      'selection with the same cycle');
  });
  assert.strictEqual(second.cycleReset, false,
    'no reset while the unshown pool still covers the shelf');
  // 8 of 10 shown: eligible-minus-shown (2) falls below the shelf size (4)
  // -> cycleReset reported, selection recomputed against an EMPTY shown
  // list (repeats allowed again).
  const third = C.selectShelf(items,
    { number: 1, shown_ids: first.picks.concat(second.picks) }, [], now);
  assert.strictEqual(third.cycleReset, true,
    'an exhausted cycle reports cycleReset true');
  assert.deepStrictEqual(third.picks, first.picks,
    'the reset recomputes against an empty shown list');
})();

(function testShelfRegenerationStability() {
  const items = [];
  for (let i = 1; i <= 6; i++) {
    items.push(mkItem({
      id: 'rg000000000000' + String(i).padStart(2, '0'),
      state: 'blessed', created_ms: now - (100 - i) * DAY
    }));
  }
  const cycle = { number: 2, shown_ids: ['rg00000000000001'] };
  const a = C.selectShelf(items, cycle, [], now);
  const b = C.selectShelf(items, cycle, [], now);
  assert.deepStrictEqual(b, a,
    'same items, cycle, and now -> the identical shelf (the pure function ' +
    'is stateless; the UI persists current_shelf and reuses it)');
})();

// ---- 9. applyReaction + markOpened (D-15 reactions, opened recording) -------------

(function testReactionGlad() {
  const item = mkItem({ state: 'blessed', last_opened_ms: now });
  const snap = JSON.parse(JSON.stringify(item));
  const out = C.applyReaction(item, 'glad', now);
  assert.notStrictEqual(out, item, 'returns a NEW object');
  assert.deepStrictEqual(item, snap, 'pure: the input is never mutated');
  assert.strictEqual(out.state, 'blessed', 'glad leaves the state unchanged');
  assert.strictEqual(out.history.length, item.history.length + 1,
    'exactly one history entry appended');
  assert.deepStrictEqual(out.history[out.history.length - 1], {
    at: new Date(now).toISOString(),
    from: 'blessed', to: 'blessed', via: 'reaction:glad'
  }, 'the glad entry is recorded via reaction:glad');
})();

(function testReactionNotReally() {
  const item = mkItem({ state: 'blessed', last_opened_ms: now });
  const snap = JSON.parse(JSON.stringify(item));
  const out = C.applyReaction(item, 'not_really', now);
  assert.strictEqual(out.state, 'resting', 'not_really rests the item');
  assert.strictEqual(out.resting_until_ms, now + 90 * DAY,
    'rests RESTING_DAYS (90) from the injected now');
  assert.strictEqual(out.history[out.history.length - 1].via,
    'reaction:not_really', 'recorded via reaction:not_really');
  assert.deepStrictEqual(item, snap, 'pure: the input is never mutated');
  const short = C.applyReaction(item, 'not_really', now, { RESTING_DAYS: 10 });
  assert.strictEqual(short.resting_until_ms, now + 10 * DAY,
    'RESTING_DAYS is opts-overridable');
})();

(function testReactionNeverAgain() {
  const item = mkItem({ state: 'resting', resting_until_ms: now - 2 * DAY,
                        last_opened_ms: now });
  const out = C.applyReaction(item, 'never_again', now);
  assert.strictEqual(out.state, 'retired', 'never_again retires the item');
  assert.strictEqual(out.resting_until_ms, null,
    'resting_until_ms cleared on retirement');
  assert.strictEqual(out.history[out.history.length - 1].via,
    'reaction:never_again', 'recorded via reaction:never_again');
  assert.strictEqual(item.state, 'resting', 'pure: the input still rests');
  assert.throws(function () {
    C.applyReaction(mkItem({ state: 'blessed' }), 'love', now);
  }, function (err) {
    return err instanceof Error && err.message.indexOf('love') !== -1;
  }, 'an unknown reaction throws a plain Error naming it');
})();

(function testMarkOpened() {
  const item = mkItem({ state: 'blessed', last_opened_ms: null });
  const snap = JSON.parse(JSON.stringify(item));
  const out = C.markOpened(item, now);
  assert.notStrictEqual(out, item, 'returns a NEW object');
  assert.deepStrictEqual(item, snap, 'pure: the input is never mutated');
  assert.strictEqual(out.last_opened_ms, now, 'last_opened_ms set to now');
  assert.strictEqual(out.state, 'blessed', 'the state is untouched');
  assert.deepStrictEqual(out.history[out.history.length - 1], {
    at: new Date(now).toISOString(),
    from: 'blessed', to: 'blessed', via: 'opened'
  }, 'the open is recorded via opened');
})();

(function testMarkOpenedWakesExpiredResting() {
  const rest = mkItem({ state: 'resting', resting_until_ms: now - 1 * DAY });
  const out = C.markOpened(rest, now);
  assert.strictEqual(out.state, 'blessed',
    'opening an expired-resting item wakes it to blessed');
  assert.strictEqual(out.resting_until_ms, null,
    'the wake clears resting_until_ms');
  assert.strictEqual(out.last_opened_ms, now, 'last_opened_ms set to now');
  assert.deepStrictEqual(out.history.slice(-2).map(function (h) {
    return h.via;
  }), ['resting-wake', 'opened'],
    'the store reflects the lazy wake AND the open');
  assert.strictEqual(rest.state, 'resting', 'pure: the input still rests');
  const asleep = mkItem({ state: 'resting', resting_until_ms: now + 5 * DAY });
  const opened = C.markOpened(asleep, now);
  assert.strictEqual(opened.state, 'resting',
    'a not-yet-expired resting item keeps resting');
  assert.strictEqual(opened.resting_until_ms, now + 5 * DAY,
    'its wake date is untouched');
})();

// ---- 9b. attachment rendering (22-uat) ---------------------------------------
//
// A clipped image-post is a caption .md plus its pictures — item.attachments
// carries 'attachments/<id>/<basename>' rel paths from import. The reader
// shows them: body-referenced ones inline (rewritten to the /lib/<id>/att/
// route), the rest trailing in natural filename order. Matching mirrors
// study_lib._match_name: NFC-normalized + lowercased on BOTH sides.

(function testAttachmentUrl() {
  assert.strictEqual(
    C.attachmentUrl('abc123', 'attachments/abc123/pic one (2).jpg'),
    '/lib/abc123/att/pic%20one%20%282%29.jpg',
    'the route is /lib/<id>/att/<basename>, percent-encoded — parentheses ' +
    'included, so the URL survives inside markdown image syntax');
  assert.strictEqual(
    C.attachmentUrl('n1', 'attachments/n1/漫画｜第一页.jpg'),
    '/lib/n1/att/' + encodeURIComponent('漫画｜第一页.jpg'),
    'CJK + fullwidth ｜ basenames are fully encoded');
})();

(function testRewriteAttachmentRefs() {
  const item = mkItem({
    id: 'noteid0000000001',
    attachments: ['attachments/noteid0000000001/Café｜第一页_1.jpg',
                  'attachments/noteid0000000001/Café｜第一页_2.jpg']
  });
  const md = '标题\n\n![[Café｜第一页_1.jpg]]\n\n结尾';
  const out = C.rewriteAttachmentRefs(item, md);
  assert.ok(out.indexOf('![](/lib/noteid0000000001/att/' +
    encodeURIComponent('Café｜第一页_1.jpg') + ')') !== -1,
    'a matching wikilink becomes a standard markdown image over the route');
  assert.ok(out.indexOf('![[') === -1, 'the wikilink form itself is gone');
  assert.ok(out.indexOf('标题') === 0 && out.indexOf('结尾') !== -1,
    'the rest of the body is untouched');
  // alias form + NFD/case folding: macOS filesystems hand back NFD names
  // while bodies may carry NFC (and vice versa) — both sides fold.
  const nfd = 'café｜第一页_1.jpg'.normalize('NFD');
  const aliased = C.rewriteAttachmentRefs(item, '![[' + nfd + '|第一页]]');
  assert.ok(aliased.indexOf('![](/lib/') === 0,
    'an NFD, lowercased, |alias wikilink still matches the NFC name');
  // a local markdown image pointing at an attached picture rewrites too
  // (mirrors study_lib.extract_image_refs — %-decoded, basename-matched)
  const mdimg = C.rewriteAttachmentRefs(item,
    '![p2](Caf%C3%A9%EF%BD%9C%E7%AC%AC%E4%B8%80%E9%A1%B5_2.jpg)');
  assert.ok(mdimg.indexOf('![p2](/lib/noteid0000000001/att/') === 0,
    'a %-encoded local markdown image rewrites, alt text preserved');
  // unmatched references stay byte-for-byte as saved (verbatim law)
  assert.strictEqual(C.rewriteAttachmentRefs(item, '![[elsewhere.png]]'),
    '![[elsewhere.png]]', 'an unmatched wikilink is never touched');
  assert.strictEqual(
    C.rewriteAttachmentRefs(item, '![x](https://e.co/Café｜第一页_1.jpg)'),
    '![x](https://e.co/Café｜第一页_1.jpg)',
    'a web reference never rewrites — only local pictures');
  // a note without attachments renders its body untouched
  assert.strictEqual(C.rewriteAttachmentRefs(mkItem({}), md), md,
    'no attachments -> identity');
})();

(function testUnreferencedAttachments() {
  const atts = ['attachments/n1/comic_10.jpg',
                'attachments/n1/comic_2.jpg',
                'attachments/n1/comic_1.jpg'];
  const item = mkItem({ id: 'n1', attachments: atts });
  assert.deepStrictEqual(C.unreferencedAttachments(item, 'caption only'),
    ['attachments/n1/comic_1.jpg', 'attachments/n1/comic_2.jpg',
     'attachments/n1/comic_10.jpg'],
    'natural numeric filename order: _1, _2, _10 — never _1, _10, _2');
  assert.deepStrictEqual(
    C.unreferencedAttachments(item, '![[COMIC_2.jpg]]'),
    ['attachments/n1/comic_1.jpg', 'attachments/n1/comic_10.jpg'],
    'a body-referenced picture (case-folded) never trails twice');
  assert.deepStrictEqual(
    C.unreferencedAttachments(item, '![p](comic_1.jpg)'),
    ['attachments/n1/comic_2.jpg', 'attachments/n1/comic_10.jpg'],
    'a local markdown-image reference counts as referenced too');
  assert.strictEqual(
    C.unreferencedAttachments(item,
      '![x](https://e.co/comic_1.jpg)').length, 3,
    'a web reference never claims a local picture');
  assert.deepStrictEqual(C.unreferencedAttachments(mkItem({}), 'x'), [],
    'a note without attachments trails nothing');
})();

// 26-05 UAT (the owner): a body embed may carry the vault-prefixed name
// (<note-stem>_<n>_<original>.jpg) while the stored attachment kept its bare
// <original>.jpg — study_lib folds them together, so the reader resolves the
// prefixed reference to the bare-named file (a separator-boundary suffix) and
// renders it INLINE, never also trailing it as unreferenced.
(function testPrefixedEmbedResolvesToBareFile() {
  const item = mkItem({
    id: 'eggnote0000001',
    attachments: ['attachments/eggnote0000001/2026-04-27_13-16-11.jpg']
  });
  const md = '## 做法\n\n![[日本邻居奶奶祖传味玉_1_2026-04-27_13-16-11.jpg]]\n';
  const out = C.rewriteAttachmentRefs(item, md);
  assert.ok(
    out.indexOf(
      '![](/lib/eggnote0000001/att/2026-04-27_13-16-11.jpg)') !== -1,
    'the prefixed embed resolves inline to the bare-named attachment');
  assert.ok(out.indexOf('![[') === -1,
    'no raw wikilink survives the rewrite');
  assert.deepStrictEqual(C.unreferencedAttachments(item, md), [],
    'the inline-resolved picture never also trails as unreferenced');
  // a shorter bare suffix must NOT be captured by an unrelated longer ref
  const other = mkItem({
    id: 'n2', attachments: ['attachments/n2/11.jpg'] });
  assert.strictEqual(
    C.rewriteAttachmentRefs(other, '![[trip_2026-04-27_13-16-11.jpg]]'),
    '![[trip_2026-04-27_13-16-11.jpg]]',
    'suffix match needs a separator boundary, not a mid-token tail');
})();

// ---- 10. source-text discipline (no wall-clock reads, no randomness) --------------

(function testSourceTextDiscipline() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');
  assert.ok(!/\bDate\s*\.\s*now\s*\(/.test(src),
    'core.js never calls the Date API\'s now method (D-02)');
  assert.ok(!/new\s+Date\s*\(\s*\)/.test(src),
    'core.js never constructs a zero-argument Date');
  assert.ok(!/Math\s*\.\s*random/.test(src),
    'no randomness anywhere in the module (locked deterministic)');
  const exportLines = src.split('\n').filter(function (l) {
    return l.indexOf('module.exports') !== -1;
  });
  assert.strictEqual(exportLines.length, 1,
    'exactly one module.exports line (the dual-export wrapper)');
})();

// ---- 11. matchesFilter / itemExcluded / surfacePool (D-07/D-10/D-11) ----------

(function testMatchesFilterPerFacet() {
  const it = mkItem({ id: 'ff00000000000001', source: 'folder-drop',
                      type: 'image', year: 2023, folder: 'camera',
                      tags: ['screenshots'] });
  assert.strictEqual(C.matchesFilter(it, { facet: 'source',
    value: 'folder-drop' }), true, 'source facet matches its own value');
  assert.strictEqual(C.matchesFilter(it, { facet: 'source',
    value: 'photos' }), false, 'source facet rejects a different value');
  assert.strictEqual(C.matchesFilter(it, { facet: 'type', value: 'image' }),
    true, 'type facet matches');
  assert.strictEqual(C.matchesFilter(it, { facet: 'type', value: 'text' }),
    false, 'type facet rejects');
  assert.strictEqual(C.matchesFilter(it, { facet: 'year', value: 2023 }),
    true, 'year matches as a pure integer compare on the stamped field');
  assert.strictEqual(C.matchesFilter(it, { facet: 'year', value: '2023' }),
    false, 'a string year never matches the stamped integer (strict)');
  assert.strictEqual(C.matchesFilter(it, { facet: 'year', value: 2024 }),
    false, 'a different year never matches');
  assert.strictEqual(C.matchesFilter(it, { facet: 'folder',
    value: 'camera' }), true, 'folder is a pure string compare');
  assert.strictEqual(C.matchesFilter(it, { facet: 'folder',
    value: 'notes' }), false, 'a different folder never matches');
  assert.strictEqual(C.matchesFilter(it, { facet: 'tag',
    value: 'screenshots' }), true,
    'the screenshots facet is tag membership in item.tags');
  assert.strictEqual(C.matchesFilter(it, { facet: 'tag',
    value: 'receipts' }), false, 'an absent tag never matches');
  assert.strictEqual(C.matchesFilter(mkItem({ tags: undefined }),
    { facet: 'tag', value: 'screenshots' }), false,
    'a missing tags array is treated as empty, never a throw');
  assert.strictEqual(C.matchesFilter(it, { facet: 'mood', value: 'x' }),
    false, 'an unknown facet matches nothing');
  assert.strictEqual(C.matchesFilter(it, null), false,
    'a missing filter matches nothing');
})();

(function testItemExcludedClasses() {
  assert.strictEqual(C.itemExcluded(null, []), true,
    'a missing item fails closed');
  assert.strictEqual(C.itemExcluded(mkItem({ state: 'never_show' }), []),
    true, 'never_show is excluded');
  assert.strictEqual(C.itemExcluded(mkItem({ state: 'retired' }), []),
    true, 'retired is excluded');
  assert.strictEqual(
    C.itemExcluded(mkItem({ state: 'blessed', trigger: true }), []), true,
    'the trigger overlay excludes regardless of the underlying state');
  const shot = mkItem({ state: 'blessed', tags: ['screenshots'] });
  assert.strictEqual(
    C.itemExcluded(shot, [{ facet: 'tag', value: 'screenshots' }]), true,
    'an active-filter match excludes');
  assert.strictEqual(C.itemExcluded(shot, []), false,
    'without the active filter the same item is clean');
  assert.strictEqual(C.itemExcluded(mkItem({ state: 'blessed' }), []),
    false, 'a clean blessed item is not excluded');
  assert.strictEqual(C.itemExcluded(mkItem({ state: 'unseen' }), []),
    false,
    'unseen is not an exclusion class — eligibility is a separate layer');
})();

(function testSurfacePoolChokePoint() {
  const clean = mkItem({ id: 'ok00000000000001', state: 'blessed' });
  const never = mkItem({ id: 'nv00000000000011', state: 'never_show' });
  const gone = mkItem({ id: 'rt00000000000011', state: 'retired' });
  const hidden = mkItem({ id: 'hd00000000000011', state: 'blessed',
                          trigger: true });
  const shot = mkItem({ id: 'fl00000000000011', state: 'unseen',
                        tags: ['screenshots'] });
  const items = [clean, never, gone, hidden, shot];
  const filters = [{ facet: 'tag', value: 'screenshots' }];
  const pool = C.surfacePool(items, filters, now);
  assert.deepStrictEqual(pool.map(function (it) { return it.id; }),
    ['ok00000000000001'],
    'the pool strips all four exclusion classes at once');
  const map = {};
  items.forEach(function (it) { map[it.id] = it; });
  assert.deepStrictEqual(
    C.surfacePool(map, filters, now).map(function (it) { return it.id; }),
    ['ok00000000000001'],
    'the store items map form gives the same pool');
  assert.deepStrictEqual(
    C.surfacePool(items, [], now).map(function (it) { return it.id; })
      .sort(),
    ['fl00000000000011', 'ok00000000000001'],
    'with no active filters only the state/overlay classes strip');
})();

(function testFilterRemovalRestoresExactly() {
  // D-07: a filter is a reversible overlay — removing it restores every
  // selector output exactly, with no memory left on items.
  const items = [
    mkItem({ id: 'ra00000000000001', state: 'blessed', type: 'image',
             created_ms: now - 90 * DAY }),
    mkItem({ id: 'ra00000000000002', state: 'blessed', type: 'text',
             created_ms: now - 80 * DAY }),
    mkItem({ id: 'ra00000000000003', state: 'blessed', type: 'text',
             created_ms: now - 70 * DAY }),
    mkItem({ id: 'ra00000000000004', state: 'unseen', type: 'image',
             created_ms: now - 60 * DAY }),
    mkItem({ id: 'ra00000000000005', state: 'unseen', type: 'text',
             created_ms: now - 50 * DAY })
  ];
  const snap = JSON.parse(JSON.stringify(items));
  function outputs(filters) {
    return {
      shelf: C.selectShelf(items, { number: 1, shown_ids: [] }, filters,
        now),
      blessing: C.pickBlessingCandidates(items, filters, now),
      cover: C.pickCoverCandidate(items, filters, {}, now)
    };
  }
  const before = outputs([]);
  const during = outputs([{ facet: 'type', value: 'image' }]);
  assert.ok(during.shelf.picks.indexOf('ra00000000000001') === -1,
    'the image item is off the shelf while the filter is active');
  assert.ok(during.blessing.indexOf('ra00000000000004') === -1,
    'the image item is out of the guided pass while the filter is active');
  assert.notStrictEqual(during.cover, 'ra00000000000004',
    'the image item is never offered behind a cover while filtered');
  const after = outputs([]);
  assert.deepStrictEqual(after, before,
    'removing the filter restores every selector output exactly');
  assert.deepStrictEqual(items, snap,
    'no memory left on items — nothing was mutated');
})();

// ---- 12. gated selectors (overlay wins, union adjacency, all-excluded) --------

(function testOverlayWinsOnEverySelector() {
  // SRM-05 adjacency: a blessed item with trigger true is excluded from
  // every selector output while staying blessed underneath (D-08).
  const hiddenBlessed = mkItem({ id: 'hb00000000000001', state: 'blessed',
                                 trigger: true,
                                 created_ms: now - 500 * DAY });
  const hiddenUnseen = mkItem({ id: 'hu00000000000001', state: 'unseen',
                                trigger: true,
                                created_ms: now - 400 * DAY });
  const blessed = mkItem({ id: 'ok00000000000002', state: 'blessed' });
  const unseen = mkItem({ id: 'ok00000000000003', state: 'unseen',
                          created_ms: now - 10 * DAY });
  const items = [hiddenBlessed, hiddenUnseen, blessed, unseen];
  const shelf = C.selectShelf(items, { number: 1, shown_ids: [] }, [], now);
  assert.ok(shelf.picks.indexOf('hb00000000000001') === -1,
    'the hidden blessed item never reaches the shelf');
  const pass = C.pickBlessingCandidates(items, [], now);
  assert.ok(pass.indexOf('hu00000000000001') === -1,
    'the hidden unseen item never reaches the guided pass');
  assert.ok(pass.indexOf('hb00000000000001') === -1,
    'the hidden blessed item never reaches the guided pass either');
  assert.strictEqual(C.pickCoverCandidate(items, [], {}, now),
    'ok00000000000003',
    'the cover picker skips hidden items even when they are far older');
  assert.strictEqual(hiddenBlessed.state, 'blessed',
    'the hidden item stays blessed underneath — the overlay never touches ' +
    'state');
  assert.strictEqual(hiddenBlessed.trigger, true,
    'the overlay itself is untouched by selection');
})();

(function testUnionAdjacency() {
  // SRM-04 adjacency: an item matching BOTH a per-item trigger and a
  // category filter is excluded exactly like an item matching either one
  // — the exclusion set is a union, never a double-negative.
  const filters = [{ facet: 'tag', value: 'screenshots' }];
  const both = mkItem({ id: 'ub00000000000001', state: 'blessed',
                        trigger: true, tags: ['screenshots'],
                        created_ms: now - 100 * DAY });
  const triggerOnly = mkItem({ id: 'ut00000000000001', state: 'blessed',
                               trigger: true,
                               created_ms: now - 100 * DAY });
  const filterOnly = mkItem({ id: 'uf00000000000001', state: 'blessed',
                              tags: ['screenshots'],
                              created_ms: now - 100 * DAY });
  const clean = mkItem({ id: 'uc00000000000001', state: 'blessed',
                         created_ms: now - 100 * DAY });
  assert.strictEqual(C.itemExcluded(both, filters), true,
    'matching both classes excludes');
  assert.strictEqual(C.itemExcluded(triggerOnly, filters), true,
    'matching the trigger alone excludes');
  assert.strictEqual(C.itemExcluded(filterOnly, filters), true,
    'matching the filter alone excludes');
  assert.strictEqual(C.itemExcluded(clean, filters), false,
    'matching neither stays in');
  const items = [both, triggerOnly, filterOnly, clean];
  const pool = C.surfacePool(items, filters, now);
  assert.deepStrictEqual(pool.map(function (it) { return it.id; }),
    ['uc00000000000001'],
    'both-classes, trigger-only, and filter-only are each excluded ' +
    'exactly once — only the clean item remains');
  const shelf = C.selectShelf(items, { number: 1, shown_ids: [] }, filters,
    now);
  assert.deepStrictEqual(shelf.picks, ['uc00000000000001'],
    'the shelf sees exactly the same union');
})();

(function testAllExcludedStoreEmptyResults() {
  // SRM-05 empty edge: when every item is excluded, surfacePool returns
  // an empty list and every selector returns its empty result — no throw.
  const filters = [{ facet: 'tag', value: 'screenshots' }];
  const items = [
    mkItem({ state: 'never_show' }),
    mkItem({ state: 'retired' }),
    mkItem({ state: 'blessed', trigger: true }),
    mkItem({ state: 'unseen', tags: ['screenshots'] })
  ];
  assert.deepStrictEqual(C.surfacePool(items, filters, now), [],
    'the pool is empty');
  const shelf = C.selectShelf(items, { number: 1, shown_ids: [] }, filters,
    now);
  assert.deepStrictEqual(shelf.picks, [],
    'the shelf comes back empty without error');
  assert.strictEqual(shelf.cycleReset, false,
    'an empty pool is not a cycle reset');
  assert.deepStrictEqual(C.pickBlessingCandidates(items, filters, now), [],
    'the guided pass comes back empty without error');
  assert.strictEqual(C.pickCoverCandidate(items, filters, {}, now), null,
    'no cover candidate means null, never a throw');
})();

// ---- 13. pickCoverCandidate (D-01/D-04, SRM-04 ordering) ----------------------

(function testCoverAtMostOneUnseenOnly() {
  const items = [
    mkItem({ id: 'cv00000000000001', state: 'unseen',
             created_ms: now - 30 * DAY }),
    mkItem({ id: 'cv00000000000002', state: 'unseen',
             created_ms: now - 20 * DAY }),
    mkItem({ id: 'cv00000000000003', state: 'unseen',
             created_ms: now - 10 * DAY }),
    mkItem({ id: 'cv00000000000004', state: 'blessed',
             created_ms: now - 900 * DAY }),
    mkItem({ id: 'cv00000000000005', state: 'resting',
             created_ms: now - 900 * DAY }),
    mkItem({ id: 'cv00000000000006', state: 'never_show',
             created_ms: now - 900 * DAY }),
    mkItem({ id: 'cv00000000000007', state: 'retired',
             created_ms: now - 900 * DAY })
  ];
  const pick = C.pickCoverCandidate(items, [], {}, now);
  assert.strictEqual(typeof pick, 'string',
    'at most ONE candidate, returned as a single id');
  assert.strictEqual(pick, 'cv00000000000001',
    'only unseen items are candidates — the far older blessed / resting / ' +
    'never_show / retired items never win');
})();

(function testCoverHonoursTheNotRelevantRecord() {
  // wayfinder #127 (owner ruling 2026-08-19): the cover is the room's THIRD
  // proposal surface and it was screened NOWHERE. The block on
  // selectLibrarianSuggestions claimed the librarian's list and the Offer
  // were the only two; this pins the correction so nobody restores the claim.
  const items = [
    mkItem({ id: 'nr00000000000001', state: 'unseen',
             created_ms: now - 30 * DAY }),
    mkItem({ id: 'nr00000000000002', state: 'unseen',
             created_ms: now - 20 * DAY })
  ];
  assert.strictEqual(C.pickCoverCandidate(items, [], {}, now),
    'nr00000000000001',
    'baseline: the oldest unseen item is the cover');
  assert.strictEqual(
    C.pickCoverCandidate(items, [], {}, now,
      { notRelevantIds: ['nr00000000000001'] }),
    'nr00000000000002',
    'an id she has permanently set aside is never offered behind the ' +
    'cover — the next candidate is, so the surface stays live');
  assert.strictEqual(
    C.pickCoverCandidate(items, [], {}, now,
      { notRelevantIds: ['nr00000000000001', 'nr00000000000002'] }),
    null,
    'when every candidate is set aside the cover is empty, never a ' +
    'fallback to one she refused');
  // ADDITIVE, and that is a safety property: a caller that has not been
  // updated must behave exactly as before rather than fail open loudly.
  assert.strictEqual(C.pickCoverCandidate(items, [], {}, now, {}),
    'nr00000000000001', 'an absent list is the old behaviour');
  assert.strictEqual(
    C.pickCoverCandidate(items, [], {}, now, { notRelevantIds: 'nope' }),
    'nr00000000000001', 'a non-array list is the old behaviour');
  // The __proto__/constructor trap the sibling selector documents: an id
  // that happens to be one of those two words must be ordinary.
  const trap = [
    mkItem({ id: '__proto__', state: 'unseen', created_ms: now - 40 * DAY }),
    mkItem({ id: 'constructor', state: 'unseen', created_ms: now - 35 * DAY }),
    mkItem({ id: 'tr00000000000001', state: 'unseen',
             created_ms: now - 30 * DAY })
  ];
  assert.strictEqual(C.pickCoverCandidate(trap, [], {}, now, {}),
    '__proto__',
    'an id named __proto__ is not withdrawn by a property nobody wrote');
  assert.strictEqual(
    C.pickCoverCandidate(trap, [], {}, now,
      { notRelevantIds: ['__proto__', 'constructor'] }),
    'tr00000000000001',
    'and those two ids CAN be withdrawn like any other');
})();

(function testCoverCooldown() {
  const items = [
    mkItem({ id: 'cd00000000000001', state: 'unseen',
             created_ms: now - 30 * DAY }),
    mkItem({ id: 'cd00000000000002', state: 'unseen',
             created_ms: now - 20 * DAY })
  ];
  const cooling = { 'cd00000000000001': now - 13 * DAY };
  assert.strictEqual(C.pickCoverCandidate(items, [], cooling, now),
    'cd00000000000002',
    'an id offered under 14 frozen-days ago is skipped — a different ' +
    'cover is offered instead');
  const rested = { 'cd00000000000001': now - 14 * DAY };
  assert.strictEqual(C.pickCoverCandidate(items, [], rested, now),
    'cd00000000000001',
    'exactly 14 days after the offer the same cover is eligible again');
  assert.strictEqual(
    C.pickCoverCandidate(items, [], cooling, now,
      { COVER_COOLDOWN_DAYS: 10 }),
    'cd00000000000001', 'COVER_COOLDOWN_DAYS is opts-overridable');
  const allCooling = {
    'cd00000000000001': now - 1 * DAY,
    'cd00000000000002': now - 1 * DAY
  };
  assert.strictEqual(C.pickCoverCandidate(items, [], allCooling, now), null,
    'every candidate cooling down means null — a quiet visit, no nagging');
  assert.strictEqual(C.pickCoverCandidate(items, [], null, now),
    'cd00000000000001', 'a missing offers map is treated as empty');
})();

(function testCoverDeterministicOrdering() {
  // SRM-04 ordering: two items born the same ms — the id-lexicographic
  // winner is explicit, so the same inputs give the same cover anywhere.
  const items = [
    mkItem({ id: 'zz00000000000021', state: 'unseen',
             created_ms: now - 50 * DAY }),
    mkItem({ id: 'aa00000000000021', state: 'unseen',
             created_ms: now - 50 * DAY })
  ];
  assert.strictEqual(C.pickCoverCandidate(items, [], {}, now),
    'aa00000000000021',
    'equal created_ms ties break id-lexicographic');
  assert.strictEqual(
    C.pickCoverCandidate(items.slice().reverse(), [], {}, now),
    'aa00000000000021', 'input order never changes the winner');
  assert.strictEqual(C.pickCoverCandidate([], [], {}, now), null,
    'an empty store yields null');
})();

// ---- 14. setTrigger (D-08 orthogonality — hidden survives everything) ---------

(function testSetTriggerPureSameState() {
  const item = mkItem({ id: 'tg00000000000001', state: 'blessed' });
  const snap = JSON.parse(JSON.stringify(item));
  const hidden = C.setTrigger(item, true, 'hide', now);
  assert.notStrictEqual(hidden, item, 'returns a NEW object');
  assert.deepStrictEqual(item, snap, 'pure: the input is never mutated');
  assert.strictEqual(hidden.trigger, true, 'trigger flipped on');
  assert.strictEqual(hidden.state, 'blessed',
    'the state is untouched — blessed stays blessed underneath');
  assert.deepStrictEqual(hidden.history[hidden.history.length - 1], {
    at: new Date(now).toISOString(),
    from: 'blessed', to: 'blessed', via: 'hide'
  }, 'a same-state history entry records the judgment');
  const released = C.setTrigger(hidden, false, 'release', now);
  assert.strictEqual(released.trigger, false, 'release flips it back');
  assert.strictEqual(released.state, 'blessed',
    'release touches nothing but the flag');
  assert.strictEqual(released.history[released.history.length - 1].via,
    'release', 'the release is recorded too');
  const gone = C.setTrigger(mkItem({ state: 'retired' }), true, 'hide',
    now);
  assert.strictEqual(gone.state, 'retired',
    'hiding a retired item is a legal same-state pair');
  assert.strictEqual(gone.trigger, true,
    'the overlay rides any underlying state');
})();

(function testHiddenSurvivesEveryOtherTransition() {
  // The plan-level prohibition: a trigger-hidden item returns to no
  // unprompted surface without an explicit release — no timer, no return
  // on open, reaction, resting wake, or dig-out.
  const hidden = C.setTrigger(
    mkItem({ id: 'hs00000000000001', state: 'blessed' }), true, 'hide',
    now);
  assert.strictEqual(C.markOpened(hidden, now).trigger, true,
    'hidden survives markOpened');
  assert.strictEqual(C.applyReaction(hidden, 'glad', now).trigger, true,
    'reactions never read or clear the trigger');
  // The resting wake: an expired-resting hidden item wakes to blessed on
  // open but STAYS hidden — the wake never reads trigger.
  const restingHidden = C.setTrigger(
    mkItem({ id: 'hs00000000000002', state: 'resting',
             resting_until_ms: now - 1 * DAY }), true, 'hide', now);
  const woke = C.markOpened(restingHidden, now);
  assert.strictEqual(woke.state, 'blessed',
    'the expired resting item wakes on open');
  assert.strictEqual(woke.trigger, true,
    'the wake never releases a hidden item');
  const shelf = C.selectShelf(
    [restingHidden, mkItem({ state: 'blessed' })],
    { number: 1, shown_ids: [] }, [], now);
  assert.ok(shelf.picks.indexOf('hs00000000000002') === -1,
    'an expired-resting hidden item is still absent from the shelf');
  // Dig-out (retired -> unseen) keeps the overlay too.
  const retiredHidden = C.setTrigger(
    mkItem({ id: 'hs00000000000003', state: 'retired' }), true, 'hide',
    now);
  const dugOut = C.applyTransition(retiredHidden, 'unseen',
    'management-dig-out', now);
  assert.strictEqual(dugOut.state, 'unseen',
    'the dig-out brings a retired item back to the pile');
  assert.strictEqual(dugOut.trigger, true,
    'but the item stays hidden through the dig-out');
  assert.strictEqual(C.pickCoverCandidate([dugOut], [], {}, now), null,
    'a dug-out hidden item is still never offered behind a cover');
  assert.deepStrictEqual(C.pickBlessingCandidates([dugOut], [], now), [],
    'and still never reaches the guided pass');
  // ONLY the explicit release brings it back to the surfaces.
  const released = C.setTrigger(dugOut, false, 'release', now);
  assert.strictEqual(C.pickCoverCandidate([released], [], {}, now),
    released.id,
    'after the explicit release the item may be offered again');
})();

// ---- 15. guardSurface (D-13 render-boundary re-check) -------------------------

(function testGuardSurfaceReasons() {
  assert.strictEqual(C.guardSurface(mkItem({ state: 'blessed' }), []),
    null, 'a clean blessed item passes (null)');
  assert.strictEqual(C.guardSurface(null, []), 'missing',
    'a missing item names the missing reason');
  assert.strictEqual(C.guardSurface(undefined, []), 'missing',
    'undefined fails closed the same way');
  assert.strictEqual(C.guardSurface(mkItem({ state: 'never_show' }), []),
    'never_show', 'never_show names its reason');
  assert.strictEqual(C.guardSurface(mkItem({ state: 'retired' }), []),
    'retired', 'retired names its reason');
  assert.strictEqual(
    C.guardSurface(mkItem({ state: 'blessed', trigger: true }), []),
    'hidden', 'the overlay reason regardless of the underlying state');
  const shot = mkItem({ state: 'blessed', tags: ['screenshots'] });
  assert.strictEqual(
    C.guardSurface(shot, [{ facet: 'tag', value: 'screenshots' }]),
    'filter:tag', 'a filter match carries its facet in the reason');
  assert.strictEqual(
    C.guardSurface(mkItem({ state: 'blessed', year: 2023 }),
      [{ facet: 'year', value: 2023 }]),
    'filter:year', 'the year facet form works the same way');
  assert.strictEqual(C.guardSurface(shot, []), null,
    'without the active filter the same item is clean');
  const worst = mkItem({ state: 'never_show', trigger: true,
                         tags: ['screenshots'] });
  assert.strictEqual(
    C.guardSurface(worst, [{ facet: 'tag', value: 'screenshots' }]),
    'never_show',
    'the first matching class names the reason (state before overlay ' +
    'before filter)');
})();

// ---- 16. CR-01: reactions are fenced to surfaced states (law 5) -------------
//
// The reaction line belongs to items the room legitimately handed over
// (blessed, or resting mid-sleep). A reaction on a never_show item would
// quietly un-never it (never_show -> resting -> shelf ~90 days later); on
// an unseen item it would bypass blessing entirely; retired only ever
// leaves via the deliberate dig-out. Core is the fence: reactionAllowed
// says who may react, applyReaction throws for everyone else.

(function () {
  assert.strictEqual(C.reactionAllowed(mkItem({ state: 'blessed' })), true,
    'blessed items may react');
  assert.strictEqual(C.reactionAllowed(mkItem({ state: 'resting' })), true,
    'resting items may react (opened mid-sleep)');
  ['unseen', 'never_show', 'retired'].forEach(function (state) {
    assert.strictEqual(C.reactionAllowed(mkItem({ state: state })), false,
      state + ' items may not react');
    ['glad', 'not_really', 'never_again'].forEach(function (reaction) {
      const item = mkItem({ state: state });
      assert.throws(function () { C.applyReaction(item, reaction, now); },
        /surfaced/,
        reaction + ' on a ' + state + ' item must refuse');
      assert.strictEqual(item.state, state, 'the input is never mutated');
    });
  });
  // The held-out never-list row (the CR-01 leak, verbatim): "not really"
  // on a revealed never_show item must refuse — resting would put it back
  // on the shelf ~90 days later with no explicit un-never judgment.
  assert.throws(function () {
    C.applyReaction(mkItem({ state: 'never_show' }), 'not_really', now);
  }, /surfaced/, 'never_show + not_really is the leak row and must throw');
})();

// ---- 17. container selectors + gated pile count (24 D-11/D-12/D-13) ----------
//
// Phase 24 (Plan 24-02): the album/journal browse selectors and the
// gated pile-count helper — blessed-only + type split, saved_ms order
// with id-lexicographic ties, input-order independence, empty stores,
// gated counting (a trigger-hidden or filter-matched unseen item never
// counts), and filter add/remove restoring output exactly.

(function testAlbumBlessedOnly() {
  const items = [
    mkItem({ id: 'al00000000000001', state: 'blessed', type: 'image',
             saved_ms: now - 50 * DAY }),
    mkItem({ id: 'al00000000000002', state: 'unseen', type: 'image',
             saved_ms: now - 900 * DAY }),
    mkItem({ id: 'al00000000000003', state: 'resting', type: 'image',
             saved_ms: now - 900 * DAY, resting_until_ms: now - 1 * DAY }),
    mkItem({ id: 'al00000000000004', state: 'never_show', type: 'image',
             saved_ms: now - 900 * DAY }),
    mkItem({ id: 'al00000000000005', state: 'retired', type: 'image',
             saved_ms: now - 900 * DAY }),
    mkItem({ id: 'al00000000000006', state: 'blessed', type: 'image',
             saved_ms: now - 900 * DAY, trigger: true })
  ];
  assert.deepStrictEqual(C.pickAlbumItems(items, [], now),
    ['al00000000000001'],
    'strictly blessed image items — unseen / resting (even past its ' +
    'wake date) / never_show / retired / trigger-hidden never reach ' +
    'the album');
})();

(function testContainerTypeSplit() {
  const items = [
    mkItem({ id: 'ts00000000000001', state: 'blessed', type: 'image' }),
    mkItem({ id: 'ts00000000000002', state: 'blessed', type: 'text' })
  ];
  assert.deepStrictEqual(C.pickAlbumItems(items, [], now),
    ['ts00000000000001'],
    'the album holds image items only — a blessed note never appears');
  assert.deepStrictEqual(C.pickJournalItems(items, [], now),
    ['ts00000000000002'],
    'the journal holds text items only — a blessed photo never appears');
})();

(function testContainerSavedOrder() {
  const items = [
    mkItem({ id: 'zz00000000000031', state: 'blessed', type: 'text',
             saved_ms: now - 10 * DAY }),
    mkItem({ id: 'aa00000000000031', state: 'blessed', type: 'text',
             saved_ms: now - 10 * DAY }),
    mkItem({ id: 'mm00000000000031', state: 'blessed', type: 'text',
             saved_ms: now - 90 * DAY })
  ];
  assert.deepStrictEqual(C.pickJournalItems(items, [], now),
    ['mm00000000000031', 'aa00000000000031', 'zz00000000000031'],
    'saved_ms ascending (oldest saved first); equal saved_ms ties ' +
    'break id-lexicographic');
  assert.deepStrictEqual(
    C.pickJournalItems(items.slice().reverse(), [], now),
    ['mm00000000000031', 'aa00000000000031', 'zz00000000000031'],
    'input order never changes the output');
  const photos = [
    mkItem({ id: 'zz00000000000032', state: 'blessed', type: 'image',
             saved_ms: now - 5 * DAY }),
    mkItem({ id: 'aa00000000000032', state: 'blessed', type: 'image',
             saved_ms: now - 5 * DAY })
  ];
  assert.deepStrictEqual(C.pickAlbumItems(photos, [], now),
    ['aa00000000000032', 'zz00000000000032'],
    'the album breaks equal-saved ties id-lexicographic too');
  assert.deepStrictEqual(
    C.pickAlbumItems(photos.slice().reverse(), [], now),
    ['aa00000000000032', 'zz00000000000032'],
    'album output is input-order independent');
})();

(function testContainerEmptyStore() {
  assert.deepStrictEqual(C.pickAlbumItems([], [], now), [],
    'an empty store yields an empty album');
  assert.deepStrictEqual(C.pickJournalItems({}, [], now), [],
    'an empty items map yields an empty journal');
  assert.strictEqual(C.countPileByType([], [], now, 'image'), 0,
    'an empty store counts zero');
})();

(function testPileCountGated() {
  const items = [
    mkItem({ id: 'pc00000000000001', state: 'unseen', type: 'image' }),
    mkItem({ id: 'pc00000000000002', state: 'unseen', type: 'image',
             trigger: true }),
    mkItem({ id: 'pc00000000000003', state: 'unseen', type: 'text' }),
    mkItem({ id: 'pc00000000000004', state: 'blessed', type: 'image' })
  ];
  assert.strictEqual(C.countPileByType(items, [], now, 'image'), 1,
    'one unseen image survives the gate — the trigger-hidden unseen ' +
    'image counts zero, and blessed items are not pile');
  assert.strictEqual(C.countPileByType(items, [], now, 'text'), 1,
    'an unseen item of the other type never joins this count');
})();

(function testContainerFilters() {
  const items = [
    mkItem({ id: 'cf00000000000001', state: 'blessed', type: 'image',
             tags: ['screenshots'] }),
    mkItem({ id: 'cf00000000000002', state: 'blessed', type: 'text',
             year: 2023 }),
    mkItem({ id: 'cf00000000000003', state: 'unseen', type: 'image',
             tags: ['screenshots'] })
  ];
  const shots = [{ facet: 'tag', value: 'screenshots' }];
  assert.deepStrictEqual(C.pickAlbumItems(items, shots, now), [],
    'a filter-matched blessed image never reaches the album');
  assert.deepStrictEqual(
    C.pickJournalItems(items, [{ facet: 'year', value: 2023 }], now), [],
    'a filter-matched blessed note never reaches the journal');
  assert.strictEqual(C.countPileByType(items, shots, now, 'image'), 0,
    'a filter-matched unseen item never inflates the pile count');
  assert.deepStrictEqual(C.pickAlbumItems(items, [], now),
    ['cf00000000000001'],
    'without the filter the same album item is back — clean restore ' +
    '(D-07), no memory left on items');
  assert.deepStrictEqual(C.pickJournalItems(items, [], now),
    ['cf00000000000002'],
    'and the journal restores too');
})();

// ---- 18. cleanVaultMarkup + the escapers (26.88-12, Q4) ----------------------
//
// Moved out of app.js by 26.88-12 so they can be asserted at all. Every case
// below pins behaviour that has been live since the 26-05 UAT and untested
// ever since — not new behaviour. The move changed nothing; these prove it.

(function testCleanVaultMarkupComments() {
  assert.strictEqual(C.cleanVaultMarkup('a %%x%% b'), 'a  b',
    'an Obsidian %% comment span is deleted, exactly as Obsidian hides it');
  assert.strictEqual(
    C.cleanVaultMarkup('%% auto-links:start %%\nRelated\n%% auto-links:end %%'),
    '\nRelated\n',
    'the vault-linker markers go, the block between them stays');
  assert.strictEqual(
    C.cleanVaultMarkup('%% a\nmulti-line\ncomment %%tail'), 'tail',
    'a %% span crosses line boundaries ([\\s\\S] rather than .)');
  // THE F-1 SHAPE, stated as what the renderer actually receives. This is the
  // one case no suite could hold before the move: `## %% auto-links` is not an
  // empty heading until THIS function has run on it.
  assert.strictEqual(
    C.cleanVaultMarkup('## %% auto-links\n\nstart %%'), '## ',
    'F-1: a heading promoted out of a comment marker renders as an EMPTY ' +
    '`## ` heading, and only cleanVaultMarkup makes that visible. The span ' +
    'closes on the STRANDED `%%` two lines down, so the paragraph after the ' +
    'heading is swallowed with it — the whole emitted block collapses to a ' +
    'heading bound to nothing');
  assert.strictEqual(C.cleanVaultMarkup(null), '',
    'a null body is the empty string; it never throws');
  assert.strictEqual(C.cleanVaultMarkup(undefined), '',
    'and so is undefined');
})();

(function testCleanVaultMarkupWikilinks() {
  assert.strictEqual(C.cleanVaultMarkup('see [[Target]] here'),
    'see <a href="#" class="wikilink" data-wiki="Target">Target</a> here',
    '[[target]] becomes a clickable wikilink anchor');
  assert.strictEqual(C.cleanVaultMarkup('see [[dir/Target|Alias]] here'),
    'see <a href="#" class="wikilink" data-wiki="Target">Alias</a> here',
    '[[target|alias]] shows the ALIAS and keys on the target basename');
  assert.strictEqual(C.cleanVaultMarkup('![[picture.png]]'), '![[picture.png]]',
    'an ![[…]] EMBED is left byte-identical by the [^!] guard — embeds are ' +
    'resolved upstream by rewriteAttachmentRefs');
  assert.strictEqual(C.cleanVaultMarkup('[[Head]] first'),
    '<a href="#" class="wikilink" data-wiki="Head">Head</a> first',
    'the ^ alternative in (^|[^!]) reaches a wikilink at position 0');
  // The output is ESCAPED on both axes: display text through escapeHtml, the
  // data-wiki attribute through escapeAttr. A wikilink target is untrusted
  // input (it is a filename in her vault).
  assert.strictEqual(C.cleanVaultMarkup('x [[a|<b>]] y'),
    'x <a href="#" class="wikilink" data-wiki="a">&lt;b&gt;</a> y',
    'the display text is escaped with escapeHtml');
  assert.strictEqual(C.cleanVaultMarkup('x [[a"b]] y'),
    'x <a href="#" class="wikilink" data-wiki="a&quot;b">a"b</a> y',
    'the data-wiki attribute is escaped with escapeAttr');
})();

// ---- 26.9-01 (D-18): pickSessionReading, the reading door's selector ---------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07): the selector is GONE, and -------
// ---- every RULE it carried keeps its test on the selector that survives -----
//
// DISPOSITION: rewritten, not deleted. 26.9-01/26.9-02 authored the two
// sections below (five named tests, fifteen call sites) against
// StudyCore.pickSessionReading. 26.91 D-06 retired the reading book and the
// selector with it.
//
// THE RULE KEEPS A TEST EVEN THOUGH THE FUNCTION DOES NOT. pickSessionReading
// never owned a rule of its own — core.js's own header said so:
//   * its FENCE was surfacePool's, shared with every gated selector;
//   * its PROPOSAL COHORT was the un-acked-verdicts-joined-through-the-pool
//     rule that StudyCore.selectLibrarianSuggestions still implements — the
//     carrier D-07 wires into the librarian conversation in plan 05;
//   * its ARRIVALS PREDICATE was, verbatim, pickWalkArrivals'.
// So each retired assertion is re-pointed at the surviving selector it shared
// its rule with, OVER THE SAME FIXTURE and with the SAME expected ids. Where
// the answer legitimately differs, the difference is named rather than
// silently accommodated. Deleting these tests would have discarded coverage
// of rules that are still live — and a deletion-shaped fix is
// indistinguishable from losing coverage.
//
// THE FIXTURES STAY NON-EMPTY ON BOTH SIDES. An exclusion assertion over a
// fixture where nothing survives is satisfied by a selector that returns
// nothing at all, so the surviving ids are asserted BY IDENTITY beside every
// exclusion, never with a `>= 0` band.

(function testSessionReadingSelectorIsRetired() {
  // G-A3's core half, read from the EVALUATED export — never from file text,
  // which a comment would satisfy.
  assert.strictEqual(typeof C.pickSessionReading, 'undefined',
    'StudyCore.pickSessionReading must be undefined — 26.91 D-06 retired ' +
    'the reading door and its gated selector');
  // The two carriers the rewritten tests below depend on MUST be present,
  // asserted here so a broken export table cannot make those tests vacuous.
  assert.strictEqual(typeof C.selectLibrarianSuggestions, 'function',
    "StudyCore.selectLibrarianSuggestions SURVIVES — it is D-07's carrier " +
    'in plan 05, and NOT the `suggested` line that lived inside the removed ' +
    'selector. A removal that took it would leave law 7 (the librarian ' +
    'proposes) with no proposing surface at all.');
  assert.strictEqual(typeof C.pickWalkArrivals, 'function',
    'and pickWalkArrivals SURVIVES — the arrivals predicate the reading ' +
    'door borrowed rather than re-spelled');
  // The D-21 fail-closed day-formatter contract left WITH the selector: it
  // existed only to keep two books distinct, and there is one book now.
  assert.strictEqual(coreSrc.indexOf('dayLabel'), -1,
    'core.js must carry no `dayLabel` option anywhere — the injected day ' +
    'formatter existed solely for the reading book\'s blessed-today ' +
    'exclusion (D-21), and clean removal means no dead contract survives ' +
    'into the freeze');
})();

(function testSessionReadingFenceOverSurvivors() {
  // NAME KEPT. The SAME five-item fixture 26.9-01 wrote, now driven through
  // selectLibrarianSuggestions — the surviving owner of the proposal-cohort
  // rule. The expected ids are UNCHANGED, which is the evidence that the
  // rule, not the function, was what this test was ever about.
  const items = [
    mkItem({ id: 'sr00000000000001', state: 'blessed', type: 'text',
             saved_ms: now - 2 * DAY }),
    mkItem({ id: 'sr00000000000002', state: 'never_show', type: 'text',
             saved_ms: now - 3 * DAY }),
    mkItem({ id: 'sr00000000000003', state: 'retired', type: 'text',
             saved_ms: now - 4 * DAY }),
    mkItem({ id: 'sr00000000000004', state: 'blessed', type: 'text',
             saved_ms: now - 5 * DAY, trigger: true }),
    mkItem({ id: 'sr00000000000005', state: 'blessed', type: 'text',
             saved_ms: now - 6 * DAY, tags: ['screenshots'] })
  ];
  const suggestions = { verdicts: {} };
  items.forEach(function (it) {
    suggestions.verdicts[it.id] = { shelf: 'joyful', why: 'x' };
  });
  const idsOf = (out) => out.map(function (row) { return row.item.id; });

  // BAND: exactly 2 of 5 survive — named, not counted. "Return nothing"
  // fails this line; so does "return everything".
  assert.deepStrictEqual(idsOf(C.selectLibrarianSuggestions(items, [],
    suggestions, now)), ['sr00000000000001', 'sr00000000000005'],
    'never_show / retired / trigger-flagged items are absent from the ' +
    'librarian cohort, and the two clean ones ARE returned — byte-for-byte ' +
    'the same two ids 26.9-01 pinned on the retired selector');

  // The fourth class, over the SAME fixture so survivors still exist:
  // an active filter drops sr…05 and leaves sr…01 standing.
  assert.deepStrictEqual(idsOf(C.selectLibrarianSuggestions(items,
    [{ facet: 'tag', value: 'screenshots' }], suggestions, now)),
    ['sr00000000000001'],
    'a filter-matched item is dropped and the unmatched one survives — ' +
    'the fence is the choke point, not an emptying');

  // Removing every filter restores the pool exactly (no memory on items).
  assert.deepStrictEqual(idsOf(C.selectLibrarianSuggestions(items, [],
    suggestions, now)), ['sr00000000000001', 'sr00000000000005'],
    'dropping the filter restores the cohort exactly');

  // An ACKED verdict is no longer "set out" — the librarian's card was
  // taken. Not a fence case; the proposal-set contract, and the surviving
  // carrier implements it identically.
  const acked = { verdicts: {} };
  Object.keys(suggestions.verdicts).forEach(function (id) {
    acked.verdicts[id] = { shelf: 'joyful', why: 'x',
      acked: id === 'sr00000000000001' };
  });
  assert.deepStrictEqual(idsOf(C.selectLibrarianSuggestions(items, [],
    acked, now)), ['sr00000000000005'],
    'an acked verdict leaves the cohort; the un-acked one stays');
})();

(function testSessionReadingArrivalsBoundaryAndOrder() {
  // NAME KEPT. The SAME fixture, driven through pickWalkArrivals — the
  // predicate the reading door borrowed verbatim rather than re-spelling.
  //
  // ⚠ ONE NAMED DIVERGENCE, and only one. pickSessionReading added a
  // `type === 'text'` filter of its OWN on top of this predicate (the book
  // was a door onto a NOTE; the album is the door onto a picture). That
  // filter died with the reading book, so ar…05 — an unseen IMAGE after the
  // boundary — is now an arrival here where it was absent there. The
  // difference is stated and asserted, never quietly accommodated by
  // dropping the image from the fixture.
  const items = [
    // after the boundary, unseen: both arrive, newest first
    mkItem({ id: 'ar00000000000001', state: 'unseen', type: 'text',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY }),
    mkItem({ id: 'ar00000000000002', state: 'unseen', type: 'text',
             created_ms: now - 2 * DAY, saved_ms: now - 2 * DAY }),
    // unseen but BEFORE the boundary — 26.95's problem, not this one
    mkItem({ id: 'ar00000000000003', state: 'unseen', type: 'text',
             created_ms: now - 90 * DAY, saved_ms: now - 90 * DAY }),
    // after the boundary but already judged: not an arrival
    mkItem({ id: 'ar00000000000004', state: 'blessed', type: 'text',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY }),
    // an unseen IMAGE after the boundary — see the divergence note above
    mkItem({ id: 'ar00000000000005', state: 'unseen', type: 'image',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY })
  ];
  const opts = { boundaryMs: now - 30 * DAY };
  assert.deepStrictEqual(
    C.pickWalkArrivals(items, [], now, opts),
    ['ar00000000000001', 'ar00000000000005', 'ar00000000000002'],
    'arrivals = unseen items with a walk stamp strictly after the ' +
    'boundary, recent-first with an id-lexicographic tiebreak — a pre-' +
    'boundary unseen item and an already-judged item are both absent, and ' +
    'the real arrivals ARE returned. The unseen image is present because ' +
    'the text-only narrowing belonged to the retired reading door.');
  // Deterministic id tiebreak on equal stamps, so two runs over one
  // store emit byte-identical arrays.
  const tied = [
    mkItem({ id: 'tb00000000000002', state: 'unseen', type: 'text',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY }),
    mkItem({ id: 'tb00000000000001', state: 'unseen', type: 'text',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY })
  ];
  assert.deepStrictEqual(
    C.pickWalkArrivals(tied, [], now, opts),
    ['tb00000000000001', 'tb00000000000002'],
    'equal arrival stamps break id-lexicographic');
  assert.deepStrictEqual(
    C.pickWalkArrivals(tied.slice().reverse(), [], now, opts),
    ['tb00000000000001', 'tb00000000000002'],
    'and input order does not change the answer');
  // No opts at all: boundary 0, so every unseen item is an arrival.
  // Proves the default is not silently "nothing".
  assert.deepStrictEqual(C.pickWalkArrivals(items, [], now),
    ['ar00000000000001', 'ar00000000000005', 'ar00000000000002',
     'ar00000000000003'],
    'with no boundary supplied the default is 0, not an empty result');
  assert.deepStrictEqual(C.pickWalkArrivals({}, [], now, opts), [],
    'an empty store yields an empty cohort, never a null');
})();

// ---- 26.9-02 (D-21): the two rules that kept the two books distinct ---------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07): there is ONE book now -----------
//
// DISPOSITION: rewritten, not deleted. D-21 was the two-book distinctness
// contract — "the notebook remembers; the reading book is where you are
// reading right now" — and its two rules (blessed-today exclusion,
// positional dedupe across the two cohorts) existed ONLY because there were
// two books and one surface with two cohorts. D-06 retires the reading book,
// so both rules retire WITH their reason, not by accident.
//
// What survives is the consequence, and it is asserted POSITIVELY over the
// same fixtures: with one book, an item blessed today is no longer withheld
// from the librarian's proposals, and the two surviving selectors are
// INDEPENDENT of each other — no subtraction was left behind between them.
// That second one is this plan's blast-radius pin for plan 05: a phantom
// cross-selector subtraction would silently thin the cohort D-07 wires.

(function testSessionReadingBlessedTodayExcluded() {
  // NAME KEPT. The SAME three-item fixture, and the OPPOSITE expectation —
  // which is the whole content of D-06 at this level.
  const items = [
    // blessed TODAY: was the notebook's material and withheld from the
    // reading book. With no reading book, it is simply a proposal again.
    mkItem({ id: 'bd00000000000001', state: 'blessed', type: 'text',
             created_ms: now - 2 * DAY, saved_ms: now - 2 * DAY,
             history: [{ at: new Date(now).toISOString(), from: 'unseen',
                         to: 'blessed', via: 'user' }] }),
    mkItem({ id: 'bd00000000000002', state: 'blessed', type: 'text',
             created_ms: now - 3 * DAY, saved_ms: now - 3 * DAY,
             history: [{ at: new Date(now - 5 * DAY).toISOString(),
                         from: 'unseen', to: 'blessed', via: 'user' }] }),
    mkItem({ id: 'bd00000000000003', state: 'unseen', type: 'text',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY })
  ];
  const suggestions = { verdicts: {
    bd00000000000001: { shelf: 'joyful', why: 'x' },
    bd00000000000002: { shelf: 'joyful', why: 'x' }
  } };
  const idsOf = (out) => out.map(function (row) { return row.item.id; });

  // BOTH proposals come through. Stated as identities AND as a number, so
  // "return everything" and "return nothing" both fail.
  const out = C.selectLibrarianSuggestions(items, [], suggestions, now);
  assert.deepStrictEqual(idsOf(out),
    ['bd00000000000001', 'bd00000000000002'],
    'with ONE book, an item blessed TODAY is no longer withheld — D-21 ' +
    'withheld it only to keep the reading book distinct from the notebook, ' +
    'and D-06 removed the reading book');
  assert.strictEqual(out.length, 2,
    'exactly 2 — the third fixture item carries no verdict and is not a ' +
    'proposal, so this is not "return everything" either');

  // AND THE FENCE STILL RUNS FIRST (T-26.9-06 survives the rewrite): a
  // never_show item with a prior-day blessing hop is dropped by surfacePool
  // and stays dropped. Retiring a distinctness rule must never relax a
  // safety rule that ran beside it.
  const fenced = items.concat([
    mkItem({ id: 'bd00000000000004', state: 'never_show', type: 'text',
             created_ms: now - 4 * DAY, saved_ms: now - 4 * DAY,
             history: [{ at: new Date(now - 5 * DAY).toISOString(),
                         from: 'unseen', to: 'blessed', via: 'user' }] })
  ]);
  const fs2 = { verdicts: Object.assign({
    bd00000000000004: { shelf: 'joyful', why: 'x' } }, suggestions.verdicts) };
  assert.deepStrictEqual(
    idsOf(C.selectLibrarianSuggestions(fenced, [], fs2, now)),
    ['bd00000000000001', 'bd00000000000002'],
    'a fenced item never reaches the cohort at all — the choke point is ' +
    'untouched by 26.91-04');
})();

(function testSessionReadingDedupeIsPositional() {
  // NAME KEPT. The dedupe this test owned was a SET SUBTRACTION between the
  // retired selector's two cohorts (first group wins). One surface with two
  // cohorts no longer exists, so what is asserted now is the property that
  // replaced it and that plan 05 depends on: THE TWO SURVIVING SELECTORS
  // ARE INDEPENDENT. An id that is both proposed and newly arrived appears
  // in BOTH — no subtraction was left behind by the removal.
  //
  // This is the blast-radius pin for D-07: a phantom cross-selector
  // subtraction would silently thin the cohort plan 05 wires into the
  // librarian conversation, and it would do so with every count still
  // "looking right".
  const items = [
    mkItem({ id: 'dd00000000000001', state: 'unseen', type: 'text',
             created_ms: now - 1 * DAY, saved_ms: now - 1 * DAY }),
    mkItem({ id: 'dd00000000000002', state: 'unseen', type: 'text',
             created_ms: now - 2 * DAY, saved_ms: now - 2 * DAY })
  ];
  const suggestions = { verdicts: {
    dd00000000000001: { shelf: 'joyful', why: 'x' } } };
  const opts = { boundaryMs: now - 30 * DAY };
  const proposed = C.selectLibrarianSuggestions(items, [], suggestions, now)
    .map(function (row) { return row.item.id; });
  const arrived = C.pickWalkArrivals(items, [], now, opts);

  assert.deepStrictEqual(proposed, ['dd00000000000001'],
    'the librarian proposes the one id it has a verdict for');
  assert.deepStrictEqual(arrived,
    ['dd00000000000001', 'dd00000000000002'],
    'and the walk still reports BOTH — the proposed id is NOT subtracted ' +
    'from arrivals. The retired selector subtracted it because one surface ' +
    'rendered both cohorts; nothing does now, and nothing may pretend to.');
  assert.strictEqual(arrived.indexOf('dd00000000000001'), 0,
    'stated positionally too, so a reordering cannot mask it');

  // Symmetry: with nothing proposed, the walk answer is unchanged — the
  // two selectors do not read each other in either direction.
  assert.deepStrictEqual(C.pickWalkArrivals(items, [], now, opts),
    C.pickWalkArrivals(items, [], now, opts),
    'pickWalkArrivals is deterministic across calls');
  assert.deepStrictEqual(
    C.selectLibrarianSuggestions(items, [], { verdicts: {} }, now), [],
    'and with no verdicts the librarian proposes nothing at all — the ' +
    'cohort is built from verdicts, never from arrivals');
})();

(function testEscapers() {
  assert.strictEqual(C.escapeHtml('<a href="x">&'), '&lt;a href="x"&gt;&amp;',
    'escapeHtml folds & < > and deliberately leaves quotes alone (it is a ' +
    'TEXT escaper, never an attribute one)');
  assert.strictEqual(C.escapeHtml('&amp;'), '&amp;amp;',
    'the ampersand rule runs FIRST, so an escape is never double-decoded');
  assert.strictEqual(C.escapeAttr('a"b\'c&d'), 'a&quot;b&#39;c&amp;d',
    'escapeAttr folds & " \' — the three that can break out of either ' +
    'quoting style');
  assert.strictEqual(C.escapeHtml(null), 'null',
    'both escapers String() their input rather than throwing');
  assert.strictEqual(C.escapeAttr(42), '42', 'and coerce a number');
})();

// ---- 26.9-04 (D-04/D-12): pickPickerImages, the notebook picker ----------
//
// TWO INSTRUMENTS, AND NEITHER SUBSUMES THE OTHER. The behavioural fixture
// below cannot see a branch it does not exercise; the region-scoped source
// pin cannot see behaviour. The claim "the fence has exactly four exclusion
// branches and the picker's rule is exactly those four" needs both.
(function () {
  const img = function (id, extra) {
    return Object.assign({ id: id, type: 'image', state: 'blessed',
      saved_ms: now - 1000 }, extra || {});
  };
  // SEVEN items, one per class the rule has to decide:
  const items = {
    a_never: img('a_never', { state: 'never_show' }),
    b_retired: img('b_retired', { state: 'retired' }),
    c_trigger: img('c_trigger', { trigger: true }),
    d_filtered: img('d_filtered', { folder: 'screenshots' }),
    // THE POSITIVE HALF OF D-12: a personal-flagged item IS reachable.
    e_personal: img('e_personal', { folder: 'personal', source: 'personal' }),
    f_plain: img('f_plain', { saved_ms: now - 3000 }),
    g_plain: img('g_plain', { saved_ms: now - 2000 })
  };
  const filters = [{ facet: 'folder', value: 'screenshots' }];

  // AN EXACT SET, not a count and not a single absence. Asserting only
  // "the never-listed one is absent" is satisfied by returning nothing;
  // asserting only a count is satisfied by returning the wrong three.
  const got = C.pickPickerImages(items, filters, now).slice().sort();
  assert.deepStrictEqual(got, ['e_personal', 'f_plain', 'g_plain'],
    '(26.9-04) D-12: the picker reaches exactly the items guardSurface ' +
    'clears — the two ordinary images AND the personal-flagged one. The ' +
    'four exclusions are the negative half of the decision and the ' +
    'personal item is the POSITIVE half; both are asserted in one band, ' +
    'because a picker that returns nothing passes the negative half alone');

  // the same claim, stated as the predicate the code comment states
  Object.keys(items).forEach(function (id) {
    const cleared = C.guardSurface(items[id], filters) === null;
    assert.strictEqual(
      C.pickPickerImages(items, filters, now).indexOf(id) !== -1, cleared,
      '(26.9-04) the picker shows an image item IFF guardSurface returns ' +
      'null — ' + id + ' disagrees');
  });

  // non-image items never appear, whatever their state
  const mixed = Object.assign({}, items,
    { h_text: { id: 'h_text', type: 'text', state: 'blessed',
      saved_ms: now } });
  assert.strictEqual(
    C.pickPickerImages(mixed, filters, now).indexOf('h_text'), -1,
    '(26.9-04) the pictures tab is pictures — a text item never appears');

  // recent-first, id tiebreak (deterministic)
  assert.deepStrictEqual(
    C.pickPickerImages({ f_plain: items.f_plain, g_plain: items.g_plain },
      [], now),
    ['g_plain', 'f_plain'],
    '(26.9-04) newest saved first — her newest pictures are the ones she ' +
    'reaches for');
  const tie = { x1: img('x1', { saved_ms: 5 }), x0: img('x0',
    { saved_ms: 5 }) };
  assert.deepStrictEqual(C.pickPickerImages(tie, [], now), ['x0', 'x1'],
    '(26.9-04) and an id tiebreak, so the grid does not churn');

  // removing the filter restores the filtered item — no memory is left
  assert.ok(C.pickPickerImages(items, [], now).indexOf('d_filtered') !== -1,
    '(26.9-04) D-07: dropping a filter restores the pool exactly');

  // ---- THE SOURCE PIN THE FIXTURE CANNOT MAKE ---------------------------
  //
  // A fifth exclusion branch built on a predicate NO fixture item carries
  // would leave the 3-of-7 band above completely green. This pins the
  // fence's shape directly, region-scoped to guardSurface's own body so a
  // branch living in a neighbouring function cannot satisfy it.
  //
  // THE COUNTING CONVENTION, STATED, because it is off-by-one-able and an
  // unstated convention is how this phase's defect class arrives:
  // guardSurface's body contains SIX return statements. FOUR of them are
  // EXCLUSIONS and those four are what "exactly four branches" counts. The
  // other two are NOT exclusions and are deliberately outside the count:
  //   - `return 'missing'` — the !item NULL-GUARD (fail-closed on absence,
  //     not an exclusion of a real item)
  //   - `return null`      — the CLEAN verdict
  // Note also that the trigger branch returns the reason string 'hidden',
  // NOT 'trigger'. Anyone re-deriving this number from the reason set has
  // to read that.
  (function () {
    const src = fs.readFileSync(path.join(__dirname, '..', 'core.js'),
      'utf8');
    // comment-stripped, ALWAYS. Prose has answered a grep meant to measure
    // code three times on this project.
    const clean = src.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const start = clean.indexOf('function guardSurface(');
    assert.ok(start !== -1, '(26.9-04) guardSurface must exist');
    const end = clean.indexOf('\n  function ', start + 20);
    const body = clean.slice(start, end === -1 ? clean.length : end);

    const returns = body.match(/return\b[^;]*;/g) || [];
    assert.strictEqual(returns.length, 6,
      '(26.9-04) guardSurface has SIX returns: the null-guard, FOUR ' +
      'exclusions, and the clean null. See the convention above before ' +
      'changing this number — found ' + returns.length + ': ' +
      JSON.stringify(returns));

    // BY EQUALITY, never a floor: a floor is a zone so broad nothing fires.
    const reasons = (body.match(/return\s+'([a-z_]+)'/g) || [])
      .map(function (r) { return r.replace(/return\s+'|'/g, ''); }).sort();
    assert.deepStrictEqual(reasons, ['hidden', 'missing', 'never_show',
      'retired'],
      '(26.9-04) the returnable literal reason set, pinned BY EQUALITY. ' +
      'A fifth branch with a new reason lands here even if no fixture ' +
      'item triggers it');
    assert.ok(/return 'filter:' \+/.test(body),
      '(26.9-04) plus the one computed reason, filter:<facet>');

    // the four exclusions, each named at its own predicate
    [/state === 'never_show'/, /state === 'retired'/,
      /trigger === true/, /matchesFilter\(/].forEach(function (re) {
      assert.ok(re.test(body),
        '(26.9-04) guardSurface must still test ' + re);
    });

    // AND NO FIFTH. The personal branch is the realistic one CONTEXT named
    // and the one the owner ruled out on 2026-08-04, so it is named here
    // explicitly rather than left to the count alone.
    ['isPersonalNote', 'PERSONAL_SOURCE', 'FOLDER_PERSONAL',
      'hasFrontmatterBlock'].forEach(function (token) {
      assert.strictEqual(body.indexOf(token), -1,
        '(26.9-04) D-12, OWNER-DECIDED: guardSurface has NO personal ' +
        'branch ("' + token + '" found). isPersonalNote governs BODY ' +
        'REFORMATTING (26.88 D-19), not display. Adding it here makes ' +
        'the picker permanently EMPTY — measured: every image item in ' +
        'the library lacks a markdown body, so isPersonalNote returns ' +
        'true for all of them');
    });
    // itemExcluded is the same fence and gets the same treatment
    const iStart = clean.indexOf('function itemExcluded(');
    const iBody = clean.slice(iStart,
      clean.indexOf('\n  function ', iStart + 20));
    // THE ASYMMETRY, MEASURED RATHER THAN ASSUMED — and it is exactly the
    // off-by-one the convention above exists to stop. itemExcluded reads
    // `state === 'never_show' || state === 'retired'` as ONE condition with
    // ONE return, where guardSurface splits them into two (it has to: it
    // returns a DIFFERENT REASON STRING for each). So the same FOUR
    // exclusion CLASSES are spelled with four `return true;` here (the
    // null-guard plus three) and five returns there. Counting statements
    // instead of classes gives 4 vs 5 and looks like a discrepancy; there
    // is none.
    assert.strictEqual((iBody.match(/return true;/g) || []).length, 4,
      '(26.9-04) itemExcluded: the null-guard plus THREE exclusion ' +
      'statements covering the same four classes (never_show and retired ' +
      'share one condition here, because this function returns no reason)');
    assert.ok(/never_show' \|\| item\.state === 'retired'/.test(iBody),
      '(26.9-04) and that shared condition is why the count is 4 — if ' +
      'this is ever split, the number above becomes 5');
    assert.strictEqual(iBody.indexOf('isPersonalNote'), -1,
      '(26.9-04) and no personal branch here either');

    // THE PICKER WRITES NO SECOND EXCLUSION FUNCTION. Its body may only
    // narrow by TYPE; every state/trigger/filter decision belongs to the
    // choke point it calls.
    const pStart = clean.indexOf('function pickPickerImages(');
    assert.ok(pStart !== -1, '(26.9-04) pickPickerImages must exist');
    const pBody = clean.slice(pStart,
      clean.indexOf('\n  function ', pStart + 20));
    assert.ok(/surfacePool\s*\(/.test(pBody),
      '(26.9-04) the gate is consumed INSIDE the selector body');
    ['never_show', 'retired', 'trigger', 'isPersonalNote',
      'matchesFilter'].forEach(function (token) {
      assert.strictEqual(pBody.indexOf(token), -1,
        '(26.9-04) the picker must NEVER re-spell the fence ("' + token +
        '"). One rule, one predicate — the second implementation is the bug');
    });
    // the positive half: it DOES narrow to images, or it is not a picker
    assert.ok(/type === 'image'/.test(pBody),
      '(26.9-04) and it does narrow to image items — the positive half, ' +
      'without which the bans above are satisfied by an empty body');
  }());
}());

// ---------------------------------------------------------------------------
// 26.95-06 (#86 ruling 3): the finished sort shows A FEW PER GROUP, and the
// few ROTATE.
//
// ⚠ WHY THE ROTATION IS THE TEST AND NOT THE CAP. A cap alone was the
// obvious fix and it would have been LOSSY: this selector is the ONLY
// consumer of the sort's verdicts in the whole app, so capping at four would
// mean paying for a sort over thousands of notes in order to ever see four
// of them. The rotation is what makes "no show-more" the right answer rather
// than a backlog with a lid on it. So the load-bearing assertion here is not
// "at most four" — it is "every verdict is eventually reachable".
// ---------------------------------------------------------------------------

(function testSuggestionsAreRationedNotCapped() {
  const N = C.SUGGESTIONS_PER_SHELF * 7 + 3;   // sized from the constant
  const items = [];
  const verdicts = {};
  for (let i = 0; i < N; i++) {
    const id = 'sg' + String(i).padStart(14, '0');
    items.push(mkItem({ id: id, state: 'blessed', type: 'text',
      saved_ms: now - 2 * DAY }));
    verdicts[id] = { shelf: 'joyful', why: 'because', acked: false };
  }
  const map = {};
  items.forEach(function (it) { map[it.id] = it; });
  const sug = { verdicts: verdicts };

  // (a) a few per group — never the whole wall.
  const first = C.selectLibrarianSuggestions(map, [], sug, now, 0);
  assert.strictEqual(first.length, C.SUGGESTIONS_PER_SHELF,
    'the finished sort shows A FEW, not every un-acked verdict. Before ' +
    'this there was no cap of any kind and the owner\'s real vault would ' +
    'have painted thousands of rows in three lists');

  // (b) stable WITHIN a visit — a repaint must not reshuffle the cards
  //     under her hand.
  assert.deepStrictEqual(
    C.selectLibrarianSuggestions(map, [], sug, now, 0).map(function (r) {
      return r.item.id;
    }),
    first.map(function (r) { return r.item.id; }),
    'the same visit renders the same few — the rotation is seeded by the ' +
    'visit counter and never by a clock read, because this selector is ' +
    'pure and a repaint is not a new visit');

  // (c) ⚠ AND NOTHING IS STRANDED. Every verdict the sort produced is
  //     reachable by simply coming back.
  const seen = new Set();
  for (let visit = 0; visit < N; visit++) {
    C.selectLibrarianSuggestions(map, [], sug, now, visit)
      .forEach(function (r) { seen.add(r.item.id); });
  }
  assert.strictEqual(seen.size, N,
    'RATIONED, NOT CAPPED: over enough visits every one of the ' + N +
    ' verdicts is shown. If this ever fails, the sort is doing work whose ' +
    'result nobody can ever see — which is what a plain cap would have ' +
    'shipped');

  // (d) a group SMALLER than the window is untouched — no padding, no
  //     wrapping onto itself, no duplicate card.
  const few = {};
  const fewVerdicts = {};
  items.slice(0, 2).forEach(function (it) {
    few[it.id] = it;
    fewVerdicts[it.id] = { shelf: 'joyful', why: 'w', acked: false };
  });
  const small = C.selectLibrarianSuggestions(few, [], { verdicts: fewVerdicts },
    now, 5);
  assert.strictEqual(small.length, 2,
    'a group with fewer than a window renders exactly what it has');
  assert.strictEqual(new Set(small.map(function (r) { return r.item.id; })).size,
    2, 'and never shows the same card twice to fill the window');

  // (e) a missing or nonsense rotation is the FIRST window, not a crash and
  //     not a negative index.
  [undefined, null, NaN, Infinity, -1, -7.5, 'three'].forEach(function (bad) {
    const rows = C.selectLibrarianSuggestions(map, [], sug, now, bad);
    assert.strictEqual(rows.length, C.SUGGESTIONS_PER_SHELF,
      'a rotation of ' + String(bad) + ' still renders one clean window');
    rows.forEach(function (r) {
      assert.ok(map[r.item.id],
        'and never an index off the end of the list');
    });
  });
}());

// ---- N. THE TIDY-UP'S WRITE CHUNKER (26.95-15) ------------------------------
//
// ⚠ THIS ARITHMETIC BROKE A WHOLE-VAULT RUN ON THE OWNER'S REAL VAULT and no
// suite could have caught it: the client sent 60 notes per write regardless of
// size, the server refuses a body over 1 MB, and sixty of her notes are
// several megabytes — so the FIRST chunk 413'd and the run wrote NOTHING.
// The same defect as the librarian's, a third time: a batch sized in ITEMS
// against a limit spent in BYTES. It lives here, exported by name, because a
// chunker inside app.js could only ever be pinned as text.

(function () {
  const row = (id, n) => ({ id: id, body: 'x'.repeat(n) });

  // (a) the BYTES bound, not the count: three 400 KB notes never ride in one
  //     1 MB request, however small the count limit says they may be.
  const big = [row('a', 400000), row('b', 400000), row('c', 400000)];
  const fit = C.cleaningWriteChunk(big, null, 60);
  assert.strictEqual(fit.take, 2,
    'two 400 KB notes fit under the budget and the third does not — the ' +
    'shipped client would have sent all three and been refused');
  assert.strictEqual(fit.oversize, false);
  assert.ok(fit.bytes <= C.CLEAN_WRITE_BUDGET,
    'and what it says it will send is under the budget it was given');

  // (b) the COUNT bound survives as the second ceiling: a request of ten
  //     thousand tiny notes is its own problem.
  const many = Array.from({ length: 500 }, (_, i) => row('i' + i, 10));
  assert.strictEqual(C.cleaningWriteChunk(many, null, 60).take, 60,
    'the count cap still applies when everything is small');

  // (c) ⚠ AN OVERSIZE NOTE IS NEVER SENT. One note too big to fit alone
  //     cannot be made to fit; sending it would 413 and take every note
  //     behind it down too — the pre-sort worker's stop-on-one-failure in a
  //     new place. take:0 + oversize:true is how the caller is told to skip
  //     it and SAY SO (product law 9).
  const huge = C.cleaningWriteChunk([row('big', 2000000), row('ok', 10)],
                                    null, 60);
  assert.strictEqual(huge.take, 0, 'nothing is sent');
  assert.strictEqual(huge.oversize, true, 'and the caller is told why');

  // (d) never zero-take on a note that DOES fit — that is the infinite loop.
  assert.strictEqual(C.cleaningWriteChunk([row('x', 999)], null, 60).take, 1);
  assert.strictEqual(C.cleaningWriteChunk([], null, 60).take, 0);
  assert.strictEqual(C.cleaningWriteChunk([], null, 60).oversize, false,
    'an empty queue is finished, not oversize');

  // (e) ⚠ THE SIZE IS THE SERIALIZED SIZE. JSON escaping is not a constant
  //     factor — and every note this pass touches is one the layout rule
  //     just filled with NEW NEWLINES, each of which costs two bytes on the
  //     wire, so a raw-length estimate is wrong in exactly the direction
  //     that 413s.
  const newlines = [{ id: 'n', body: '\n'.repeat(600000) }];
  assert.strictEqual(C.cleaningWriteChunk(newlines, null, 60).oversize, true,
    '600k newlines is 1.2 MB once escaped, and must be seen as oversize ' +
    'even though the string is only 600k characters long');

  // (f) utf8Length is BYTES, not characters — her vault is largely Chinese.
  assert.strictEqual(C.utf8Length('abc'), 3);
  assert.strictEqual(C.utf8Length('日记'), 6, 'CJK is three bytes each');
  assert.strictEqual(C.utf8Length('😀'), 4, 'and a surrogate pair is four');
  assert.strictEqual(C.utf8Length(''), 0);
  assert.strictEqual(C.utf8Length(null), 0);
}());

// ---- N+1. THE RULE MAY NOT EAT AN INVISIBLE CHARACTER (26.95-18) ----------
//
// ⚠ FOUND BY THE WRITE GATE REFUSING THREE OF HER NOTES, AND IT WAS RIGHT TO.
// The sentence splitter trimmed each piece with `String.trim()`, which strips
// everything Unicode calls whitespace — including NARROW NO-BREAK SPACE and
// LINE SEPARATOR, which are characters her text actually contains. It deleted
// 26 of one note's 32 narrow spaces and 2 of another's 3 line separators:
// invisible on screen, gone from the file, which is the silent loss law 9 is
// written against.
//
// ⚠ IT ALSO PUT THE RULE OUT OF STEP WITH ITS OWN GUARD. `_readability_same_words`
// counts only ASCII whitespace as space, so a rule allowed to eat anything
// else can only ever produce refusals. Trimming the same set the gate does is
// what makes the two agree, and this case is where that stays true.

(function () {
  const NNBSP = '\u202f';      // NARROW NO-BREAK SPACE
  const LSEP = '\u2028';       // LINE SEPARATOR
  const NBSP = '\u00a0';       // NO-BREAK SPACE
  const IDEO = '\u3000';       // IDEOGRAPHIC SPACE

  const long = 'x'.repeat(320) + '. ';
  [NNBSP, LSEP, NBSP, IDEO].forEach(function (ch) {
    const body = long + ch + 'y'.repeat(320) + '. ' + ch + 'z'.repeat(80) + '.';
    const out = C.sentenceBreaksOnly(body);
    assert.notStrictEqual(out, body, 'the rule still lays this body out');
    const count = function (s) { return s.split(ch).length - 1; };
    assert.strictEqual(count(out), count(body),
      'every ' + escape(ch) + ' survives the layout — it is a character in ' +
      'her writing, not spacing the room may throw away');
    // and nothing else moved either: strip ASCII space from both and compare
    const strip = function (s) { return s.replace(/[ \t\n\r\f\v]+/g, ''); };
    assert.strictEqual(strip(out), strip(body),
      'and no other character changed');
  });

  // the ordinary case is untouched: ASCII space around a break is still
  // absorbed, which is what makes a break a break rather than an insertion
  const plain = 'a'.repeat(320) + '.   ' + 'b'.repeat(320) + '.';
  assert.ok(C.sentenceBreaksOnly(plain).indexOf('.   ') === -1,
    'ASCII run around a sentence break is still collapsed by the layout');
}());

// ---- N+2. `not relevant` SCREENS THE LIBRARIAN'S PROPOSALS (26.95-31) ------
//
// D-13 says saying `not relevant` withdraws an item from EVERY future
// librarian proposal, permanently. The Offer is one of the tree's two live
// proposal surfaces; selectLibrarianSuggestions is the other, and this section
// is what makes the word "every" true of the code rather than only of the
// ruling.
//
// ⚠ THE SIXTH ARGUMENT IS ADDITIVE, AND THAT IS A SAFETY PROPERTY. A caller
// nobody has updated must behave EXACTLY as it did before the argument
// existed, or a half-finished wiring change silently changes what she is
// shown. Case (a) is that claim, driven over the same fixture the rest of the
// section uses.
//
// ⛔ AND IT REACHES NO FURTHER THAN THE PROPOSAL SURFACES. The guided first
// pass and the Manage grind are deliberately NOT screened: the glossary
// requires a not-relevant item stay unseen, stay in Manage and stay findable,
// so hiding it from her own deliberate pass would be the opposite of what the
// answer means. Case (e) pins that omission as a decision rather than leaving
// it to be "fixed" later by accident.
//
// ⚠ NOTE ON THE COUNT. This suite has no global case registry — it is a
// sequence of IIFEs and its OK line carries no number — so the count is
// pinned HERE, by value, over this section's own roster. A count alone is
// satisfied by a rename, so the roster of names is pinned beside it.

(function testNotRelevantScreensLibrarianSuggestions() {
  const ran = [];
  const EXPECTED = ['absent-is-shipped-behaviour', 'named-ids-absent',
    'screen-equals-never-having-a-verdict', 'shelf-order-and-acked-unchanged',
    'guided-pass-not-screened', 'inherited-property-not-swallowed'];
  const sub = function (name, fn) { ran.push(name); fn(); };

  const idsOf = (out) => out.map(function (row) { return row.item.id; });
  const mkMap = function (list) {
    const m = {};
    list.forEach(function (it) { m[it.id] = it; });
    return m;
  };

  // ---- (a) absent, or not an array, is the shipped behaviour ------------
  sub('absent-is-shipped-behaviour', function () {
    const items = [
      mkItem({ id: 'nr00000000000001', state: 'blessed', type: 'text' }),
      mkItem({ id: 'nr00000000000002', state: 'blessed', type: 'text' }),
      mkItem({ id: 'nr00000000000003', state: 'blessed', type: 'text' })
    ];
    const map = mkMap(items);
    const sug = { verdicts: {} };
    items.forEach(function (it) {
      sug.verdicts[it.id] = { shelf: 'joyful', why: 'x' };
    });

    // The shipped answer, stated BY IDENTITY so "returns nothing" fails too.
    const shipped = idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0));
    assert.deepStrictEqual(shipped,
      ['nr00000000000001', 'nr00000000000002', 'nr00000000000003'],
      'the fixture proposes all three with no list passed at all');

    // ...and every non-array value behaves identically. A caller that has not
    // been updated, or one that fails its own read open, must not be able to
    // change what she is shown.
    [undefined, null, 'nr00000000000001', 0, 42, {}, true, NaN,
      { 0: 'nr00000000000001' }].forEach(function (bad) {
      assert.deepStrictEqual(
        idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0, bad)),
        shipped,
        'a sixth argument of ' + JSON.stringify(String(bad)) +
        ' is the shipped behaviour exactly — the screen is ADDITIVE');
    });
    // An empty array is the same answer as no array: nothing refused yet is
    // not the same shape as a broken read, but it must give the same page.
    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0, [])), shipped);
  });

  // ---- (b) with a list, exactly the named ids are absent -----------------
  sub('named-ids-absent', function () {
    const items = [
      mkItem({ id: 'nb00000000000001', state: 'blessed', type: 'text' }),
      mkItem({ id: 'nb00000000000002', state: 'blessed', type: 'text' }),
      mkItem({ id: 'nb00000000000003', state: 'blessed', type: 'text' }),
      mkItem({ id: 'nb00000000000004', state: 'blessed', type: 'text' })
    ];
    const map = mkMap(items);
    const sug = { verdicts: {} };
    items.forEach(function (it) {
      sug.verdicts[it.id] = { shelf: 'joyful', why: 'x' };
    });

    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0,
        ['nb00000000000002'])),
      ['nb00000000000001', 'nb00000000000003', 'nb00000000000004'],
      'exactly the named id is absent, IN ORDER, and the other three are ' +
      'named by identity — an emptied cohort fails this line');

    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0,
        ['nb00000000000002', 'nb00000000000004'])),
      ['nb00000000000001', 'nb00000000000003'],
      'and two named ids leave the other two, still in order');

    // An id in the list that is not in the cohort changes nothing — the file
    // is hers to hand-edit, so a stale line must be inert rather than fatal.
    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0,
        ['nb00000000000002', 'an-id-that-left-the-library-long-ago'])),
      ['nb00000000000001', 'nb00000000000003', 'nb00000000000004'],
      'a recorded id the store no longer holds is inert');

    // AND THE ANSWER IS RESTORED EXACTLY when the record is empty again —
    // this screen leaves no memory on the items, the same property the
    // filter machinery states beside surfacePool.
    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0, [])),
      ['nb00000000000001', 'nb00000000000002', 'nb00000000000003',
        'nb00000000000004'],
      'dropping the record restores the cohort exactly');
  });

  // ---- (c) screening an id == that id never having had a verdict ---------
  sub('screen-equals-never-having-a-verdict', function () {
    // ⚠ THE STRONGEST FORM OF "AND NOTHING ELSE MOVES". Rather than asserting
    // the sort and the rotating window separately — which would pass over a
    // screen applied AFTER the window, thinning a page instead of shrinking a
    // list — this drives the whole rotation and asserts the screened answer
    // equals the answer for a cohort that never carried those verdicts. Any
    // reordering, any short page, any wrapped duplicate lands here.
    const N = C.SUGGESTIONS_PER_SHELF * 3 + 1;
    const items = [];
    const verdicts = {};
    for (let i = 0; i < N; i++) {
      const id = 'nw' + String(i).padStart(14, '0');
      items.push(mkItem({ id: id, state: 'blessed', type: 'text' }));
      verdicts[id] = { shelf: 'joyful', why: 'x' };
    }
    const map = mkMap(items);
    const removed = ['nw00000000000001', 'nw00000000000005'];
    const without = { verdicts: {} };
    Object.keys(verdicts).forEach(function (id) {
      if (removed.indexOf(id) === -1) { without.verdicts[id] = verdicts[id]; }
    });

    // the instrument is live: the two cohorts differ in size before rotating
    assert.strictEqual(Object.keys(without.verdicts).length, N - 2,
      'the control cohort really is two verdicts smaller');

    for (let r = 0; r <= N; r++) {
      const screened = idsOf(C.selectLibrarianSuggestions(map, [],
        { verdicts: verdicts }, now, r, removed));
      const never = idsOf(C.selectLibrarianSuggestions(map, [], without,
        now, r));
      assert.deepStrictEqual(screened, never,
        'at rotation ' + r + ' the screened cohort is byte-identical to a ' +
        'cohort that never held those verdicts — the screen runs BEFORE the ' +
        'sort and the window, so it shrinks the list rather than thinning ' +
        'the page');
      assert.strictEqual(screened.length, C.SUGGESTIONS_PER_SHELF,
        'and every window is still a full window at rotation ' + r);
      removed.forEach(function (id) {
        assert.strictEqual(screened.indexOf(id), -1,
          id + ' must never appear, at any rotation — the answer is ' +
          'PERMANENT and rotating back round is exactly how a cycle-shaped ' +
          'screen would leak it');
      });
    }
  });

  // ---- (d) the shelf order, the acked screen and the fence are untouched --
  sub('shelf-order-and-acked-unchanged', function () {
    const items = [
      mkItem({ id: 'ns00000000000001', state: 'blessed', type: 'text' }),
      mkItem({ id: 'ns00000000000002', state: 'blessed', type: 'text' }),
      mkItem({ id: 'ns00000000000003', state: 'blessed', type: 'text' }),
      mkItem({ id: 'ns00000000000004', state: 'blessed', type: 'text' }),
      mkItem({ id: 'ns00000000000005', state: 'never_show', type: 'text' })
    ];
    const map = mkMap(items);
    const sug = { verdicts: {
      ns00000000000001: { shelf: 'heavy', why: 'x' },
      ns00000000000002: { shelf: 'joyful', why: 'x' },
      ns00000000000003: { shelf: 'receipts', why: 'x' },
      ns00000000000004: { shelf: 'joyful', why: 'x', acked: true },
      ns00000000000005: { shelf: 'joyful', why: 'x' }
    } };

    // grouped joyful -> receipts -> heavy, acked dropped, fenced dropped
    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0, [])),
      ['ns00000000000002', 'ns00000000000003', 'ns00000000000001'],
      'the three-shelf order, the acked screen and the choke point are ' +
      'exactly as shipped when nothing is refused');

    // and screening the middle shelf's only card leaves the other two shelves
    // in the same order rather than re-grouping anything
    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0,
        ['ns00000000000003'])),
      ['ns00000000000002', 'ns00000000000001'],
      'a shelf emptied by the screen simply contributes nothing — the shelf ' +
      'order is untouched and no card moves between groups');

    // the fenced item stays out whether or not it is also refused: two
    // independent reasons, and neither is allowed to become the other's
    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0,
        ['ns00000000000005'])),
      ['ns00000000000002', 'ns00000000000003', 'ns00000000000001'],
      'refusing an already-fenced item changes nothing at all');
  });

  // ---- (e) the guided pass is deliberately NOT screened ------------------
  //
  // ⛔⛔ wayfinder #127 (owner ruling 2026-08-19): THIS GATE USED TO BAN THE
  // TOKEN IN TWO PLACES AT ONCE — pickBlessingCandidates AND
  // pickCoverCandidate — under ONE reason, and the reason only ever fitted
  // the first. Her guided pass IS her own deliberate looking, so screening it
  // would hide her material from her. The cover is NOT: it chooses one unseen
  // item per visit and puts it in front of her, which is the room bringing
  // something, wrapped or not. Her words: "the room picking something and
  // putting it in front of you is the room bringing it."
  //
  // ⚠ THE GATE WAS NOT DELETED AND WAS NOT QUIETLY RE-BASELINED. It was SPLIT,
  // by her, as a blocking checkpoint: the ban stands whole over the guided
  // pass, and the cover moves to the POSITIVE half below — it must now consult
  // the record, and a later tidy-up that removes the screening goes red.
  //
  // ⚠ The block on selectLibrarianSuggestions in core.js said "this list and
  // the Offer are the tree's only two live proposal surfaces". That claim was
  // FALSE — the cover was the third — and it was true-sounding enough to
  // survive a gate written beside it.
  sub('guided-pass-not-screened', function () {
    // ⚠ A SOURCE PIN, because no fixture can see an omission. The behavioural
    // half is unreachable: pickBlessingCandidates does not take the argument,
    // so "it ignores it" is not a thing a call can demonstrate. What CAN be
    // demonstrated is that its body never learns the token — which is what a
    // later well-meaning widening would have to add.
    //
    // The glossary's reason, quoted here where the gate cannot grep it: a
    // not-relevant item "stays unseen, stays in Manage, stays findable", so
    // screening her own deliberate pass would hide material from her.
    const clean = coreSrc.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const region = function (name) {
      const start = clean.indexOf('function ' + name + '(');
      assert.ok(start !== -1, name + ' must exist in core.js');
      const end = clean.indexOf('\n  function ', start + 20);
      const body = clean.slice(start, end === -1 ? clean.length : end);
      // ⚠ THE RANGE SANITY ASSERTIONS. This phase has lost time twice to a
      // region that matched its own end pattern, and to a slicer off by the
      // indent width. A region that came back empty or one line long would
      // make every scan below report clean for the wrong reason.
      assert.ok(body.length > 0, name + ': the region is empty');
      assert.ok(body.split('\n').length > 3,
        name + ': the region is ' + body.split('\n').length + ' line(s) — ' +
        'the slicer is measuring the wrong text');
      assert.strictEqual(body.indexOf('function ' + name + '('), 0,
        name + ': the region must BEGIN at its own declaration, and it ' +
        'begins with ' + JSON.stringify(body.slice(0, 24)));
      return body;
    };

    // THE POSITIVE HALF FIRST, so the ban below cannot be satisfied by a
    // token that exists nowhere in the file.
    ['selectLibrarianSuggestions', 'pickCoverCandidate'].forEach(
      function (name) {
        assert.ok(region(name).indexOf('notRelevant') !== -1,
          name + ' is a PROPOSAL surface and must consult the record — the ' +
          'room choosing something and putting it in front of her is the ' +
          'room bringing it (owner ruling 2026-08-19, #127). Without this ' +
          'the ban below is vacuous as well.');
      });

    ['pickBlessingCandidates'].forEach(function (name) {
      assert.strictEqual(region(name).indexOf('notRelevant'), -1,
        name + ' must NOT be screened against the not-relevant record. This ' +
        'is a DECISION, not an oversight: an item she called not relevant ' +
        'stays unseen, stays in Manage and stays findable, so filtering her ' +
        'own deliberate pass would hide her material from her — the ' +
        'opposite of what the answer means. ⛔ THE COVER IS NOT HER PASS ' +
        'and left this list on 2026-08-19; do not put it back.');
    });
  });

  // ---- (f) an inherited property never withdraws anything ---------------
  sub('inherited-property-not-swallowed', function () {
    // ⚠ A PERMANENT, INVISIBLE RECORD MUST NOT HAVE IDS IT QUIETLY GETS
    // WRONG. Built on an object literal, the lookup answers `true` for
    // `constructor` on its own — so that id would be withdrawn forever by a
    // property nobody wrote, from a file that says nothing about it.
    //
    // ⚠ `__proto__` IS NAMED HERE AND DELIBERATELY NOT ASSERTED, rather than
    // dropped in silence. It is the other half of the same quirk (an object
    // literal cannot hold it as a key at all, so such an id could never be
    // withdrawn however often she asked) and the prototype-less set fixes it —
    // but the case is UNCONSTRUCTIBLE in a fixture: writing `map['__proto__']
    // = item` sets a prototype instead of a key, so the shipped `byId` and
    // `verdicts` maps would lose the item before this screen ever saw it. The
    // fix is real; the test for it cannot be written at this level, and a
    // fixture that pretended otherwise would be measuring itself.
    const odd = ['constructor', 'toString', 'hasOwnProperty'];
    const items = odd.map(function (id) {
      return mkItem({ id: id, state: 'blessed', type: 'text' });
    });
    const map = mkMap(items);
    const sug = { verdicts: {} };
    odd.forEach(function (id) {
      sug.verdicts[id] = { shelf: 'joyful', why: 'x' };
    });

    assert.deepStrictEqual(
      idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0, [])).sort(),
      odd.slice().sort(),
      'with nothing refused, every one of these ids is proposed — an object ' +
      'literal would have withdrawn `constructor` here on its own');

    odd.forEach(function (id) {
      const got = idsOf(C.selectLibrarianSuggestions(map, [], sug, now, 0,
        [id]));
      assert.strictEqual(got.indexOf(id), -1,
        'refusing ' + id + ' withdraws it, and only it');
      assert.strictEqual(got.length, odd.length - 1,
        'and refusing ' + id + ' withdraws nothing else');
    });
  });

  // ---- the count and the roster, both BY VALUE ---------------------------
  assert.strictEqual(ran.length, 6,
    '26.95-31 pins SIX sub-cases here by value — found ' + ran.length);
  assert.deepStrictEqual(ran, EXPECTED,
    'and the roster of names, because a count alone is satisfied by a rename');
}());

console.log('test_core OK');
process.exit(0);
