/*
 * tests/test_offer_selector.cjs — the pure-core pins for the fortnight
 * lookup (Plan 26.95-30, Task 2; SRM-11 / SRM-12).
 *
 * core.js owns the reach back's PURE half (P-1): the gated pool draw, the
 * fortnight filter, the oldest-first ordering, the Seed, and the silent
 * presence probe. The burst collapse and the cap of three live on the server
 * and are pinned by tests/test_offer_records.py — nothing here reads a file,
 * a socket or a clock.
 *
 * Run contract (the house's, identical to test_core.cjs): zero-dep
 * (assert/fs/path), path-independent via path.join(__dirname, '..'), ONE OK
 * line and exit 0 on success, every failure listed with its case name and the
 * throwing frame and exit 1. There is no runner and no framework, so a quiet
 * stop is indistinguishable from a pass — the exit code is the whole report.
 *
 * ⛔ NO CASE NAMES A NUMERIC SIMILARITY THRESHOLD, and no comment states a
 * precision or a recall figure for burst grouping (D-06; study_lib's
 * assumption A5). The facet is the bar: a fortnight lookup either has older
 * photographs in it or it does not.
 *
 * The thirteen cases, in the order the registry pins them:
 *
 *   1. ordering            — oldest capture first, and reversing the input
 *                            array cannot change the answer (D-05).
 *   2. ordering-tie        — a shared created_ms breaks id-lexicographic
 *                            ascending, in BOTH input orders.
 *   3. boundary-year       — THIS year is OUT and one year below is IN, and
 *                            moving the CLOCK forward a year admits what was
 *                            excluded (D-05 as amended 2026-08-16: the bound
 *                            is the calendar's, never the Seed's).
 *   4. boundary-bucket     — the first and last day of a bucket are both in;
 *                            one day on is out; day 364 and day 365 share
 *                            bucket 26; two adjacent buckets never merge.
 *   5. boundary-no-date    — P-5: a capture stamp and an import stamp on one
 *                            UTC calendar day is a photograph with no real
 *                            capture date, and it is EXCLUDED.
 *   6. p9-missing-bound    — the programming-error branch, for the BUCKET and
 *                            for the CLOCK (which is a bound now), driven with
 *                            a POISONED item map so the case can actually fail
 *                            when the guard is deleted (see the long note in
 *                            the case body — asserting `[]` alone cannot).
 *   7. p9-dateless-path    — the fallback pair reachDoorOpen computes when the
 *                            Seed knows no date yields a NON-EMPTY Offer,
 *                            driven end to end rather than inferred.
 *   8. empty               — four empty shapes resolve to [] without throwing.
 *   9. law5                — trigger-hidden, filter-matched, never_show and
 *                            retired candidates are all absent: the
 *                            surfacePool draw happens inside the body (D-11).
 *  10. seed                — the newest to:'blessed' hop by ISO-8601 `at`,
 *                            read with Date.parse and NEVER divided.
 *  11. probe               — offerLikely agrees with pickOfferCandidates on
 *                            the fallback pair, is false with nothing blessed,
 *                            mutates no input, and issues nothing (P-8).
 *  12. purity              — identical arguments give deep-equal answers and
 *                            moving the global clock between calls changes
 *                            nothing (D-02: nowMs is injected).
 *  13. f5-no-ratchet       — TWO reads with a blessing between them: welcoming
 *                            the oldest candidate does not narrow the next
 *                            Offer. The shape the suite lacked, and the reason
 *                            UAT finding F-5 shipped with every gate green.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE_PATH = path.join(ROOT, 'core.js');
const C = require(CORE_PATH);
// core.js as TEXT, for the two region-scoped negative scans (cases 10 and 11)
// that must assert about a function's BODY rather than about its answer.
const coreSrc = fs.readFileSync(CORE_PATH, 'utf8');

const DAY = 86400000;

// ---- the region slicer, and the trap it is written against ----------------
//
// ⚠ A RANGE EXTRACTION WHOSE END PATTERN MATCHES ON LINE ONE CAPTURES A SINGLE
// LINE, and every negative grep over that one line then returns zero for
// entirely the wrong reason — a gate that reports clean because it looked at
// nothing. So this slicer asserts the region it produced is real before any
// caller is allowed to scan it: it must start at the named function, and it
// must be more than a handful of lines long.
// core.js's module-level functions live inside an IIFE, so they sit at ONE
// indent. The width is named ONCE and every boundary below is derived from it:
// the opening marker, the closing marker, and — the bug this constant exists to
// make impossible — the offset the region must be advanced past to begin at the
// declaration itself. Spelling the indent three times is how `from = start + 1`
// came to skip the newline and NOT the two spaces, which made the "begins at
// its own declaration" assertion compare 2 against 0 on every call: the guard
// failed on its own arithmetic instead of on the region.
const MODULE_INDENT = '  ';
const CLOSE_MARK = '\n' + MODULE_INDENT + '}\n';

function fnBody(name) {
  const open = MODULE_INDENT + 'function ' + name + '(';
  const marker = '\n' + open;
  const start = coreSrc.indexOf(marker);
  assert.ok(start !== -1,
    'core.js: function ' + name + ' not found at module indent — renamed or ' +
    'removed; update this scan deliberately');
  // Past the newline (1) AND past the indent, so the region starts at the `f`
  // of `function` rather than at the whitespace in front of it. Both terms are
  // spelled; neither is a bare literal.
  const from = start + 1 + MODULE_INDENT.length;
  const end = coreSrc.indexOf(CLOSE_MARK, from);
  assert.ok(end !== -1,
    'core.js: no module-level close brace after ' + name);
  const text = coreSrc.slice(from, end + CLOSE_MARK.length);
  assert.strictEqual(text.indexOf('function ' + name + '('), 0,
    'core.js: the ' + name + ' region does not begin at its own declaration ' +
    '— it begins ' + JSON.stringify(text.slice(0, 24)) + '. Check this ' +
    "slicer's own arithmetic before suspecting core.js");
  // ...and it CLOSES where a module-level function closes. This is the direct
  // statement of "the region is bounded", and it is what the line count below
  // can only imply.
  assert.ok(text.slice(-CLOSE_MARK.length) === CLOSE_MARK,
    'core.js: the ' + name + ' region does not end at a module-level close');
  // ⚠ THE LENGTH GUARD, AND ITS MARGIN, STATED. A range whose end pattern
  // matched on line one captures a single line, and every negative scan over
  // that line then reports clean for entirely the wrong reason. Four is the
  // smallest a real two-statement function produces (declaration, one body
  // line, the close, and the trailing empty string after the final newline) —
  // `fortnightOf` and `yearOfUTC` sit EXACTLY there, so this bound has no
  // slack. A one-line collapse yields 1 or 2 and is what it rejects.
  const lines = text.split('\n').length;
  assert.ok(lines >= 4,
    'core.js: the ' + name + ' region is ' + lines +
    ' line(s) long — the end pattern matched too early and this scan would ' +
    'report clean without looking at the function');
  return text;
}

// ---- fixture builders ------------------------------------------------------

// A UTC instant on a 0-BASED day-of-year INDEX. Using the index rather than a
// calendar date is what keeps a leap year's buckets aligned with every other
// year's: day 112 is bucket 8 in 2016 exactly as it is in 2015.
function utcDay(year, dayIndex, hour) {
  return Date.UTC(year, 0, 1 + dayIndex, hour == null ? 12 : hour);
}

// One unseen photograph. imported_ms deliberately sits a decade after the
// capture, so the P-5 no-capture-date predicate never fires by accident on a
// fixture that is not about it (case 5 supplies its own stamps).
function pic(id, createdMs, over) {
  const it = {
    id: id,
    state: 'unseen',
    type: 'image',
    created_ms: createdMs,
    imported_ms: createdMs + 3650 * DAY,
    trigger: false,
    tags: [],
    year: new Date(createdMs).getUTCFullYear(),
    folder: 'pictures',
    source: 'folder-drop',
    history: []
  };
  if (over) {
    Object.keys(over).forEach(function (k) { it[k] = over[k]; });
  }
  return it;
}

// A blessed item carrying one blessing hop, whose `at` is an ISO-8601 STRING
// — the one timestamp in the store that is not epoch ms.
function blessed(id, createdMs, atIso, over) {
  const base = {
    state: 'blessed',
    history: [{ at: atIso, from: 'unseen', to: 'blessed', via: 'blessing' }]
  };
  if (over) {
    Object.keys(over).forEach(function (k) { base[k] = over[k]; });
  }
  return pic(id, createdMs, base);
}

function mapOf(list) {
  const m = {};
  list.forEach(function (it) { m[it.id] = it; });
  return m;
}

function ids(list) { return list.map(function (it) { return it.id; }); }

// The frozen instant every case injects. core.js NEVER reads the clock, so
// this is the only "now" in the suite (D-02).
const NOW = Date.UTC(2026, 7, 15, 9, 30);
const NOW_FN = C.fortnightOf(NOW);
const NOW_DAY0 = NOW_FN * 14;
const NOW_YEAR = C.yearOfUTC(NOW);

// A fortnight deliberately far from today's, so a case about the Seed's own
// window can never pass because it accidentally coincides with the fallback.
const TARGET_FN = 8;
const TARGET_DAY0 = TARGET_FN * 14;

// ---- the registry ----------------------------------------------------------
//
// ⚠ THE CASE COUNT IS ASSERTED BY VALUE, and so is the roster of names. A
// count alone is satisfied by a rename, and a renamed case is a case nobody
// notices going missing; a roster alone is satisfied by a case that registers
// and never runs. `ran` counts INVOCATIONS, so a case deleted, skipped or
// renamed fails the verdict below.
const EXPECTED_CASES = ['ordering', 'ordering-tie', 'boundary-year',
  'boundary-bucket', 'boundary-no-date', 'p9-missing-bound',
  'p9-dateless-path', 'empty', 'law5', 'seed', 'probe', 'purity',
  'f5-no-ratchet'];

const failures = [];
const ranNames = [];

function test(name, fn) {
  ranNames.push(name);
  try {
    fn();
  } catch (err) {
    const frame = String(err.stack || '').split('\n').slice(0, 3).join(' | ');
    failures.push('[' + name + '] ' + err.message + ' — ' + frame);
  }
}

// ---- 1. ordering: oldest capture first, order-independent -------------------

test('ordering', function () {
  // Ids run BACKWARDS against time on purpose: a comparator that sorted by id
  // would produce a,b,c,d,e and fail here, so the case pins created_ms as the
  // primary key rather than merely agreeing with a lexicographic accident.
  const list = [
    pic('e', utcDay(2015, TARGET_DAY0 + 0)),
    pic('d', utcDay(2016, TARGET_DAY0 + 1)),
    pic('c', utcDay(2017, TARGET_DAY0 + 2)),
    pic('b', utcDay(2018, TARGET_DAY0 + 3)),
    pic('a', utcDay(2019, TARGET_DAY0 + 4))
  ];
  const opts = { fortnight: TARGET_FN };
  const forward = C.pickOfferCandidates(mapOf(list), [], NOW, opts);
  assert.deepStrictEqual(forward, ['e', 'd', 'c', 'b', 'a'],
    'oldest capture first (D-05)');
  // The array form, reversed. The comparator ends in an id tiebreak, so the
  // arrival order cannot reach the answer.
  const reversed = C.pickOfferCandidates(list.slice().reverse(), [], NOW,
    opts);
  assert.deepStrictEqual(reversed, forward,
    'reversing the input array must not change the output');
  // ...and ids come back UNCAPPED (P-2): the cap counts Moments and lives on
  // the server, so five candidates return as five.
  assert.strictEqual(forward.length, 5, 'the pure half caps nothing');
});

// ---- 2. ordering, tie -------------------------------------------------------

test('ordering-tie', function () {
  const same = utcDay(2017, TARGET_DAY0 + 5);
  const pair = [pic('zz', same), pic('aa', same)];
  const opts = { fortnight: TARGET_FN };
  assert.deepStrictEqual(C.pickOfferCandidates(pair, [], NOW, opts),
    ['aa', 'zz'], 'a created_ms tie breaks id-lexicographic ascending');
  assert.deepStrictEqual(
    C.pickOfferCandidates(pair.slice().reverse(), [], NOW, opts),
    ['aa', 'zz'], 'and the tie breaks the same way from the other order');
  // The comparator itself, directly — the sort above could be masked by a
  // stable sort agreeing with input order by luck.
  assert.ok(C.byOldestCapture(pair[1], pair[0]) < 0,
    'byOldestCapture puts the lexicographically smaller id first on a tie');
  assert.ok(C.byOldestCapture(pair[0], pair[1]) > 0, 'and antisymmetrically');
  assert.strictEqual(C.byOldestCapture(pair[0], pair[0]), 0,
    'an item ties with itself');
});

// ---- 3. boundary, year ------------------------------------------------------
//
// ⚠ REWRITTEN 2026-08-16 FOR THE D-05 AMENDMENT. It used to pass `beforeYear`
// in and assert the bound it had just supplied, which is a case that agrees
// with whatever the caller says — and that is precisely how F-5 shipped
// green. The bound now comes off the CLOCK, so the clock is what this case
// moves, and the fixture never changes between the two reads.

test('boundary-year', function () {
  const atBound = pic('at-bound', utcDay(NOW_YEAR, TARGET_DAY0 + 1));
  const below = pic('below', utcDay(NOW_YEAR - 1, TARGET_DAY0 + 1));
  const store = mapOf([atBound, below]);
  const out = C.pickOfferCandidates(store, [], NOW, { fortnight: TARGET_FN });
  assert.deepStrictEqual(out, ['below'],
    'THIS year is EXCLUDED (strictly earlier years only); one year below ' +
    'is included');
  // ...and the SAME store read a year later admits both, so the exclusion
  // above is caused by the clock and not by the fixture.
  const nextYear = Date.UTC(NOW_YEAR + 1, 7, 15, 9, 30);
  assert.deepStrictEqual(
    C.pickOfferCandidates(store, [], nextYear, { fortnight: TARGET_FN }).sort(),
    ['at-bound', 'below'], 'the control: both are otherwise eligible');
});

// ---- 4. boundary, bucket edge ----------------------------------------------

test('boundary-bucket', function () {
  const first = pic('first-day', utcDay(2017, TARGET_DAY0));
  const last = pic('last-day', utcDay(2017, TARGET_DAY0 + 13));
  const nextBucket = pic('next-bucket', utcDay(2017, TARGET_DAY0 + 14));
  const out = C.pickOfferCandidates(mapOf([first, last, nextBucket]), [], NOW,
    { fortnight: TARGET_FN });
  assert.deepStrictEqual(out, ['first-day', 'last-day'],
    'both edge days of bucket N are inside; one day on is bucket N+1');
  // The arithmetic itself, stated rather than inferred from the filter.
  assert.strictEqual(C.fortnightOf(utcDay(2017, TARGET_DAY0)), TARGET_FN);
  assert.strictEqual(C.fortnightOf(utcDay(2017, TARGET_DAY0 + 13)), TARGET_FN);
  assert.strictEqual(C.fortnightOf(utcDay(2017, TARGET_DAY0 + 14)),
    TARGET_FN + 1, 'two adjacent buckets never merge — this is integer ' +
    'division, not a sliding window');
  // The last bucket is a day or two long on purpose: a leap year adds no
  // twenty-eighth bucket, so no year has a bucket the others lack.
  assert.strictEqual(C.dayOfYearUTC(utcDay(2024, 364)), 364);
  assert.strictEqual(C.dayOfYearUTC(utcDay(2024, 365)), 365);
  assert.strictEqual(C.fortnightOf(utcDay(2024, 364)), 26);
  assert.strictEqual(C.fortnightOf(utcDay(2024, 365)), 26);
  // 1 January is day 0, not day 1.
  assert.strictEqual(C.dayOfYearUTC(Date.UTC(2021, 0, 1, 23, 59)), 0);
  assert.strictEqual(C.fortnightOf(Date.UTC(2021, 0, 1)), 0);
  assert.strictEqual(C.yearOfUTC(Date.UTC(2021, 0, 1)), 2021);
});

// ---- 5. boundary, no capture date (P-5) ------------------------------------

test('boundary-no-date', function () {
  const created = utcDay(2016, TARGET_DAY0 + 2, 1);
  // The 187 EXIF-less photographs: created_ms falls back to the file's
  // birthtime, so a capture stamp and an import stamp land on ONE UTC day.
  const dateless = pic('dateless', created, { imported_ms: created + 7200000 });
  // Its twin, identical but imported a year later — a real capture date.
  const dated = pic('dated', created, { imported_ms: created + 365 * DAY });
  const out = C.pickOfferCandidates(mapOf([dateless, dated]), [], NOW,
    { fortnight: TARGET_FN });
  assert.deepStrictEqual(out, ['dated'],
    'a capture stamp and an import stamp on one UTC calendar day is a ' +
    'photograph with no real capture date, and it is excluded (P-5)');
  // Fail-open on absence: one missing number is not evidence of anything, so
  // an item with no import stamp is NOT judged dateless by this rule.
  const noImport = pic('no-import', created, { imported_ms: 0 });
  assert.deepStrictEqual(
    C.pickOfferCandidates(mapOf([noImport]), [], NOW,
      { fortnight: TARGET_FN }),
    ['no-import'], 'a missing import stamp is not a dateless verdict');
  // The Seed reads the same predicate, so a dateless Seed reports hasDate
  // false rather than a window derived from an import night.
  const seed = C.pickBlessingSeed(
    mapOf([blessed('s', created, '2026-08-14T10:00:00.000Z',
      { imported_ms: created + 7200000 })]), 0);
  assert.strictEqual(seed.hasDate, false,
    'the Seed reuses the P-5 predicate rather than re-spelling it');
});

// ---- 6. P-9: the missing bound is a PROGRAMMING ERROR ----------------------

test('p9-missing-bound', function () {
  const live = mapOf([
    pic('m1', utcDay(2015, TARGET_DAY0 + 1)),
    pic('m2', utcDay(2016, TARGET_DAY0 + 2))
  ]);
  const good = { fortnight: TARGET_FN };
  assert.deepStrictEqual(C.pickOfferCandidates(live, [], NOW, good),
    ['m1', 'm2'],
    'the control fixture must yield with the bucket supplied — otherwise ' +
    'every empty answer below would be true for the wrong reason');

  // ⚠⚠ WHY THIS CASE IS NOT SPELLED AS "IT RETURNS []". ASSERTING [] ALONE
  // CANNOT FAIL WHEN THE P-9 GUARD IS DELETED. With opts.fortnight absent,
  // `fortnightOf(ms) !== undefined` is always true and the filter empties the
  // pool anyway; with a non-finite clock, `yearOfUTC(NaN)` is NaN and
  // `year < NaN` is false, so the filter empties the pool anyway. The plain
  // assertion would pass over gutted code, which is this project's own
  // recurring defect class — a gate that cannot fail on the thing it names.
  //
  // What the guard actually promises is that the call returns BEFORE the pool
  // is drawn: a missing bound is a call-site error caught by the wiring gate,
  // never a legitimate empty Offer. So the difference is made OBSERVABLE — a
  // poisoned item map whose only member throws the moment it is read. With the
  // guard, nothing reads it. Without the guard, surfacePool reads it and the
  // case goes red.
  function poisoned() {
    const m = {};
    Object.defineProperty(m, 'boom', {
      enumerable: true,
      get: function () { throw new Error('POOL-DRAWN'); }
    });
    return m;
  }
  // The poison is proven LIVE first. A poisoned map that quietly failed to
  // throw would make every row below vacuous.
  assert.throws(function () {
    C.pickOfferCandidates(poisoned(), [], NOW, good);
  }, /POOL-DRAWN/,
  'the poisoned map must actually throw when the pool IS drawn — otherwise ' +
  'this instrument measures nothing');

  const badRows = [
    {},                                          // no fortnight
    { fortnight: NaN },                          // NaN !== n is true, silently
    { fortnight: '8' },                          // a string is not a bucket
    { fortnight: Infinity },
    { fortnight: null },
    { beforeYear: 2020 }                         // ⚠ THE RETIRED KEY, and it
                                                 // is not a bucket either —
                                                 // a caller still passing the
                                                 // old pair gets the
                                                 // programming-error branch,
                                                 // not a silent Offer
  ];
  badRows.forEach(function (opts, i) {
    assert.deepStrictEqual(C.pickOfferCandidates(poisoned(), [], NOW, opts),
      [], 'bad-bucket row ' + i + ' must return before the pool is drawn');
    assert.deepStrictEqual(C.pickOfferCandidates(live, [], NOW, opts), [],
      'bad-bucket row ' + i + ' must yield no ids');
  });
  // ⚠ THE CLOCK IS A BOUND NOW, NOT ONLY A POOL ARGUMENT (D-05 amendment), so
  // it carries the same guard and the same instrument. A non-finite clock
  // would empty the Offer just as silently as a missing bucket once did.
  const badClocks = [undefined, null, NaN, Infinity, -Infinity, '1786000000000',
    {}];
  badClocks.forEach(function (clock, i) {
    assert.deepStrictEqual(
      C.pickOfferCandidates(poisoned(), [], clock, good), [],
      'bad-clock row ' + i + ' must return before the pool is drawn');
    assert.deepStrictEqual(C.pickOfferCandidates(live, [], clock, good), [],
      'bad-clock row ' + i + ' must yield no ids');
  });
  // opts omitted entirely — the same programming error, one argument short.
  assert.deepStrictEqual(C.pickOfferCandidates(poisoned(), [], NOW), []);
  assert.deepStrictEqual(C.pickOfferCandidates(live, [], NOW), []);
});

// ---- 7. P-9: the dateless path, end to end ---------------------------------

test('p9-dateless-path', function () {
  // A Seed whose capture stamp and import stamp land on ONE UTC day — the
  // dateless branch — and whose own fortnight is deliberately NOT today's, so
  // a fallback that quietly used the Seed's own window would find nothing.
  const seedCreated = utcDay(2024, 4, 1);
  assert.notStrictEqual(C.fortnightOf(seedCreated), NOW_FN,
    'the Seed must sit in a different fortnight from today, or this case ' +
    'could pass while the fallback pair was never used');
  const seedItem = blessed('seed-dateless', seedCreated,
    '2026-08-14T18:00:00.000Z', { imported_ms: seedCreated + 7200000 });

  // ...and older-year photographs in TODAY's fortnight, which is what the
  // fallback pair must find.
  const older = [
    pic('o1', utcDay(NOW_YEAR - 6, NOW_DAY0 + 1)),
    pic('o2', utcDay(NOW_YEAR - 4, NOW_DAY0 + 5)),
    pic('o3', utcDay(NOW_YEAR - 2, NOW_DAY0 + 13))
  ];
  const store = mapOf([seedItem].concat(older));

  const seed = C.pickBlessingSeed(store, 0);
  assert.strictEqual(seed.id, 'seed-dateless');
  assert.strictEqual(seed.hasDate, false, 'the dateless branch is the one ' +
    'under test');

  // THE EXACT PAIR reachDoorOpen computes on the dateless branch: the Seed
  // knows no date, so the window comes from today's calendar.
  const basis = seed.hasDate ? seed.dateMs : NOW;
  const out = C.pickOfferCandidates(store, [], NOW, {
    fortnight: C.fortnightOf(basis)
  });
  // ⚠ A POSITIVE ASSERTION, never "does not throw". The absence of exactly
  // this case is what let an unstated bound empty the Offer in silence.
  assert.ok(out.length > 0,
    'the dateless-Seed path must yield a NON-EMPTY Offer');
  assert.deepStrictEqual(out, ['o1', 'o2', 'o3'],
    'oldest capture first, all three older-year photographs from today\'s ' +
    'fortnight');
  // ...and the silent probe agrees, which is what a container's presence rule
  // reads at scene paint.
  assert.strictEqual(C.offerLikely(store, [], NOW, 0), true);
});

// ---- 8. empty ---------------------------------------------------------------

test('empty', function () {
  const opts = { fortnight: TARGET_FN };
  assert.deepStrictEqual(C.pickOfferCandidates({}, [], NOW, opts), [],
    'an empty item map');
  assert.deepStrictEqual(C.pickOfferCandidates([], [], NOW, opts), [],
    'an empty array');
  assert.deepStrictEqual(
    C.pickOfferCandidates(mapOf([pic('one', utcDay(2016, TARGET_DAY0))]),
      [], NOW, opts),
    ['one'], 'a single-item map is one id, not an error');
  // ...whose only candidates are already blessed
  const blessedOnly = mapOf([
    pic('b1', utcDay(2016, TARGET_DAY0), { state: 'blessed' }),
    pic('b2', utcDay(2017, TARGET_DAY0), { state: 'blessed' })
  ]);
  assert.deepStrictEqual(C.pickOfferCandidates(blessedOnly, [], NOW, opts), [],
    'the Offer reaches for UNSEEN photographs only');
  // ...whose candidates are all in THIS year
  //
  // ⚠ THIS ROW USED TO SAY "the seed's own year is not other years", AND THAT
  // IS NO LONGER THE RULE (D-05 amendment, 2026-08-16). The seed's own year is
  // reachable now — only the current one is not — and that is a consequence
  // the owner took knowingly when she chose "older than this year". The row is
  // kept, aimed at the bound that actually exists.
  const thisYear = mapOf([
    pic('y1', utcDay(NOW_YEAR, TARGET_DAY0 + 1)),
    pic('y2', utcDay(NOW_YEAR, TARGET_DAY0 + 2))
  ]);
  assert.deepStrictEqual(C.pickOfferCandidates(thisYear, [], NOW, opts), [],
    'THIS year is not "other years"');
  // ...and the seed's own year IS, which is the half a caller could otherwise
  // reintroduce the ratchet under without a single case going red.
  assert.deepStrictEqual(
    C.pickOfferCandidates(
      mapOf([pic('s1', utcDay(NOW_YEAR - 1, TARGET_DAY0 + 1))]), [], NOW, opts),
    ['s1'], 'a year that is merely not THIS one is reachable');
  // ...and a text note in the right fortnight is not a photograph
  assert.deepStrictEqual(
    C.pickOfferCandidates(
      mapOf([pic('t1', utcDay(2016, TARGET_DAY0), { type: 'text' })]),
      [], NOW, opts),
    [], 'the reach back offers photographs (D-05)');
  // ...and nothing above threw.
  assert.strictEqual(C.offerLikely({}, [], NOW, 0), false,
    'no Seed at all is false, not an error');
});

// ---- 9. law 5: the gate lives INSIDE the selector ---------------------------

test('law5', function () {
  // ⚠ WHICH ROWS CARRY THIS GATE. `never_show` and `retired` are ALSO caught
  // by the selector's own state === 'unseen' test, so those two rows are
  // belt-and-braces and cannot fail when the surfacePool draw is removed. The
  // TRIGGER row and the FILTER row are the two that can: both are unseen, and
  // only the choke point excludes them. Said out loud so nobody later reads
  // four green rows as four independent proofs.
  const day = TARGET_DAY0 + 3;
  const hidden = pic('hidden', utcDay(2016, day), { trigger: true });
  const filtered = pic('filtered', utcDay(2017, day));   // year facet 2017
  const never = pic('never', utcDay(2015, day), { state: 'never_show' });
  const retired = pic('retired', utcDay(2014, day), { state: 'retired' });
  const clean = pic('clean', utcDay(2018, day));
  const store = mapOf([hidden, filtered, never, retired, clean]);
  const filters = [{ facet: 'year', value: 2017 }];
  const opts = { fortnight: TARGET_FN };

  assert.deepStrictEqual(C.pickOfferCandidates(store, filters, NOW, opts),
    ['clean'],
    'a never_show, a retired, a trigger-flagged and a filter-matched ' +
    'candidate each reach neither the candidate list nor the page');

  // Removing every filter restores the pool EXACTLY — an exclusion is a
  // reversible overlay and leaves no memory on items (D-07). This is also
  // what makes the filter row above a real gate rather than a state check in
  // disguise: with no filters, `filtered` comes back.
  assert.deepStrictEqual(C.pickOfferCandidates(store, [], NOW, opts),
    ['filtered', 'clean'],
    'dropping the filters restores the filter-matched candidate exactly');
  // ...and the trigger overlay survives that restore, because it is not a
  // filter: it wins regardless of the underlying state (D-08).
  assert.strictEqual(
    C.pickOfferCandidates(store, [], NOW, opts).indexOf('hidden'), -1,
    'the trigger overlay is not a filter and does not lift with them');

  // The probe honours the same gate — a presence rule must never be the one
  // surface that answers from an ungated pool.
  assert.strictEqual(
    C.offerLikely(mapOf([blessed('sd', utcDay(2020, day),
      '2026-08-14T10:00:00.000Z'), hidden]), [], NOW, 0),
    false, 'the probe draws through the same choke point');
});

// ---- 10. the Seed -----------------------------------------------------------

test('seed', function () {
  const created = utcDay(2020, TARGET_DAY0 + 6);
  // Hops deliberately OUT of chronological order in the array.
  const older = '2026-08-01T10:00:00.000Z';
  const newer = '2026-08-10T10:00:00.000Z';
  const item = pic('s1', created, {
    state: 'blessed',
    history: [
      { at: newer, from: 'unseen', to: 'blessed', via: 'blessing' },
      { at: '2026-08-05T10:00:00.000Z', from: 'blessed', to: 'resting',
        via: 'not_really' },
      { at: older, from: 'unseen', to: 'blessed', via: 'blessing' }
    ]
  });
  const seed = C.pickBlessingSeed(mapOf([item]), 0);
  assert.strictEqual(seed.id, 's1');
  assert.strictEqual(seed.blessedMs, Date.parse(newer),
    'the NEWEST to:"blessed" hop wins, whatever order the array is in, and ' +
    'its ISO-8601 `at` is read with Date.parse');
  assert.strictEqual(seed.dateMs, created);
  assert.strictEqual(seed.hasDate, true);

  // A hop that is not a blessing does not count, even when it is newest.
  const onlyResting = pic('s2', created, {
    state: 'resting',
    history: [{ at: '2026-08-20T10:00:00.000Z', from: 'blessed',
      to: 'resting', via: 'not_really' }]
  });
  assert.strictEqual(C.pickBlessingSeed(mapOf([onlyResting]), 0), null,
    'nothing was ever blessed here');
  assert.strictEqual(C.pickBlessingSeed({}, 0), null, 'an empty store');
  assert.strictEqual(C.pickBlessingSeed(mapOf([pic('u', created)]), 0), null,
    'an unseen item with no history');

  // sinceMs prefers a blessing made after the boundary; with none, it falls
  // back to the newest blessing in the store, so a visit where she blessed
  // nothing new still has something to reach from.
  const p = blessed('p', created, '2026-08-02T10:00:00.000Z');
  const q = blessed('q', created, '2026-08-09T10:00:00.000Z');
  const two = mapOf([p, q]);
  assert.strictEqual(
    C.pickBlessingSeed(two, Date.parse('2026-08-05T00:00:00.000Z')).id, 'q',
    'the blessing made after the boundary is the Seed');
  assert.strictEqual(
    C.pickBlessingSeed(two, Date.parse('2026-08-20T00:00:00.000Z')).id, 'q',
    'with no blessing after the boundary, the newest of all is the fallback');
  // A blessedMs tie is deterministic on id.
  const tieA = blessed('tie-a', created, '2026-08-03T00:00:00.000Z');
  const tieB = blessed('tie-b', created, '2026-08-03T00:00:00.000Z');
  assert.strictEqual(C.pickBlessingSeed(mapOf([tieA, tieB]), 0).id, 'tie-a');
  assert.strictEqual(C.pickBlessingSeed(mapOf([tieB, tieA]), 0).id, 'tie-a');

  // ⚠ AND IT IS NEVER DIVIDED. `at` is the one timestamp in the store that is
  // not epoch ms; dividing it by a thousand raises, and doing it inside a try
  // would silently produce a Seed of null. A region-scoped negative scan,
  // because the behaviour above cannot distinguish "parsed correctly" from
  // "parsed correctly today".
  const body = fnBody('pickBlessingSeed');
  assert.ok(/Date\.parse\s*\(/.test(body),
    'pickBlessingSeed must read `at` with Date.parse');
  assert.strictEqual((body.match(/\/\s*1000\b/g) || []).length, 0,
    'pickBlessingSeed must never divide `at` — it is an ISO-8601 string');
});

// ---- 11. the silent probe (P-8) --------------------------------------------

test('probe', function () {
  const day = TARGET_DAY0 + 7;
  const seedItem = blessed('probe-seed', utcDay(2020, day),
    '2026-08-14T10:00:00.000Z');
  const older = pic('probe-old', utcDay(2016, day));
  // ⚠ THIS YEAR, not the Seed's year. Before the D-05 amendment a candidate
  // sharing the Seed's year was the "nothing to offer" fixture; the bound is
  // the calendar's now, so the only year that yields nothing is the current
  // one. Using the old fixture here would make the `no` arm quietly true and
  // this case would assert agreement between two answers that were both wrong.
  const thisYear = pic('probe-now', utcDay(NOW_YEAR, day));

  const yes = mapOf([seedItem, older]);
  const no = mapOf([seedItem, thisYear]);

  // The probe agrees with the selector on the fallback bucket, in both
  // directions — that agreement IS the contract.
  const pair = {
    fortnight: C.fortnightOf(utcDay(2020, day))
  };
  assert.strictEqual(C.offerLikely(yes, [], NOW, 0), true);
  assert.ok(C.pickOfferCandidates(yes, [], NOW, pair).length > 0);
  assert.strictEqual(C.offerLikely(no, [], NOW, 0), false);
  assert.strictEqual(C.pickOfferCandidates(no, [], NOW, pair).length, 0);
  assert.strictEqual(C.offerLikely({}, [], NOW, 0), false,
    'with nothing ever blessed there is no Seed and no probe answer');

  // Side-effect free: two calls leave every input object exactly as it was.
  const before = JSON.stringify(yes);
  C.offerLikely(yes, [], NOW, 0);
  C.offerLikely(yes, [], NOW, 0);
  assert.strictEqual(JSON.stringify(yes), before,
    'the probe mutates nothing it is handed');

  // ...AND IT ISSUES NOTHING. A region-scoped negative scan, because the
  // whole point of P-8 is that a presence rule can never become an unprompted
  // surfacing or an unbilled cloud call (law 1). A behavioural assertion
  // cannot see a request that a later edit adds.
  const body = fnBody('offerLikely');
  [/apiPost\s*\(/, /apiGet\s*\(/, /\bfetch\s*\(/, /XMLHttpRequest/,
    /\bREACH\b/, /call_librarian/, /navigator\.sendBeacon/]
    .forEach(function (re) {
      assert.strictEqual(re.test(body), false,
        'offerLikely must not reference ' + re +
        ' — the probe is pure and silent (P-8, law 1)');
    });
});

// ---- 12. purity -------------------------------------------------------------

test('purity', function () {
  const day = TARGET_DAY0 + 9;
  const store = mapOf([
    blessed('pure-seed', utcDay(2020, day), '2026-08-14T10:00:00.000Z'),
    pic('pure-a', utcDay(2016, day)),
    pic('pure-b', utcDay(2017, day + 1))
  ]);
  const opts = { fortnight: TARGET_FN };
  const snapshot = JSON.stringify(store);

  function sample() {
    return {
      dayOfYearUTC: C.dayOfYearUTC(NOW),
      fortnightOf: C.fortnightOf(NOW),
      yearOfUTC: C.yearOfUTC(NOW),
      byOldestCapture: C.byOldestCapture(store['pure-a'], store['pure-b']),
      pickBlessingSeed: C.pickBlessingSeed(store, 0),
      pickOfferCandidates: C.pickOfferCandidates(store, [], NOW, opts),
      offerLikely: C.offerLikely(store, [], NOW, 0)
    };
  }

  const first = sample();
  assert.deepStrictEqual(sample(), first,
    'identical arguments give deep-equal answers');
  assert.ok(first.pickOfferCandidates.length > 0,
    'the sample must exercise a non-empty path, or "deep-equal" is trivial');

  // MOVE THE GLOBAL CLOCK BETWEEN CALLS. nowMs is injected (D-02), so nothing
  // here may notice.
  const realNow = Date.now;
  try {
    Date.now = function () { return 0; };
    const atZero = sample();
    Date.now = function () { return 4102444800000; };
    const atFuture = sample();
    assert.deepStrictEqual(atZero, first, 'the wall clock is not an input');
    assert.deepStrictEqual(atFuture, first, 'still not an input');
  } finally {
    Date.now = realNow;
  }

  assert.strictEqual(JSON.stringify(store), snapshot,
    'no function mutated the store it was handed');

  // ...and the seven bodies name no clock read at all. The file-wide scan in
  // test_core.cjs already covers core.js; this one is scoped to the reach so
  // a clock read added HERE is named here.
  ['dayOfYearUTC', 'fortnightOf', 'yearOfUTC', 'byOldestCapture',
    'pickBlessingSeed', 'pickOfferCandidates', 'offerLikely']
    .forEach(function (name) {
      const body = fnBody(name);
      assert.strictEqual(/Date\.now\s*\(/.test(body), false,
        name + ' reads the wall clock — nowMs is injected (D-02)');
      assert.strictEqual(/new\s+Date\s*\(\s*\)/.test(body), false,
        name + ' constructs a Date with no argument — that is a clock read');
      assert.strictEqual(/Math\.random/.test(body), false,
        name + ' is not deterministic');
    });

  // The export table carries all seven by name — a function that is correct
  // and unexported is a function no call site can reach.
  ['dayOfYearUTC', 'fortnightOf', 'yearOfUTC', 'byOldestCapture',
    'pickBlessingSeed', 'pickOfferCandidates', 'offerLikely']
    .forEach(function (name) {
      assert.strictEqual(typeof C[name], 'function',
        'StudyCore.' + name + ' is not exported');
    });
});

// ---- 13. F-5: welcoming an old photograph does not shut the door -----------
//
// ⛔ THE CASE THIS SUITE HAD NO SHAPE FOR, AND THE REASON F-5 SHIPPED GREEN.
// Every case above drives ONE selector call. The defect lived in the SECOND
// call: the Seed is the newest blessing, the year ceiling was the Seed's own
// capture year, so welcoming an old photograph made that photograph the Seed
// and dropped the ceiling to its year. One successful use of the feature moved
// the door towards shut; on the owner's real library it went 332 reachable to
// 0 in one Offer. No single-call case can see that. This one blesses a
// candidate BETWEEN two reads and asserts against the second.
//
// ⚠ IT IS WRITTEN TO GO RED IF THE RATCHET RETURNS. The photograph welcomed is
// the OLDEST in the fixture, so under the old rule the second read has nothing
// strictly older to find and returns []; under the amendment it returns the
// two that remain. The guard below proves the Seed actually moved — without
// it, a case where the blessing silently failed to register would pass for
// entirely the wrong reason.

test('f5-no-ratchet', function () {
  const day = TARGET_DAY0 + 4;
  const store = mapOf([
    blessed('seed-recent', utcDay(NOW_YEAR, day), '2026-08-01T10:00:00.000Z'),
    pic('c-2015', utcDay(2015, day)),
    pic('c-2018', utcDay(2018, day + 1)),
    pic('c-2021', utcDay(2021, day + 2))
  ]);
  const opts = { fortnight: TARGET_FN };

  assert.strictEqual(C.pickBlessingSeed(store, 0).id, 'seed-recent',
    'the first Seed is the recent blessing');
  assert.deepStrictEqual(C.pickOfferCandidates(store, [], NOW, opts),
    ['c-2015', 'c-2018', 'c-2021'],
    'before her first Offer, all three are reachable');
  assert.strictEqual(C.offerLikely(store, [], NOW, 0), true);

  // SHE WELCOMES THE OLDEST — the exact act that closed the door. The hop is
  // later than the first Seed's, so this photograph becomes the newest
  // blessing, which is the whole mechanism.
  store['c-2015'].state = 'blessed';
  store['c-2015'].history = [{ at: '2026-08-16T10:00:00.000Z', from: 'unseen',
    to: 'blessed', via: 'blessing' }];

  assert.strictEqual(C.pickBlessingSeed(store, 0).id, 'c-2015',
    'the welcomed photograph IS the new Seed — if this ever stops being ' +
    'true the case below proves nothing, because the ratchet needs a moved ' +
    'Seed to bite');
  assert.strictEqual(C.yearOfUTC(store['c-2015'].created_ms) < NOW_YEAR, true,
    'and it is older than this year, or the reach was never narrowed at all');

  // ⚠ THE ASSERTION F-5 WOULD HAVE FAILED. Under the old rule this is [].
  assert.deepStrictEqual(C.pickOfferCandidates(store, [], NOW, opts),
    ['c-2018', 'c-2021'],
    'the two that remain are STILL reachable — welcoming an old photograph ' +
    'does not narrow the next Offer (D-05 amendment, UAT F-5)');
  assert.strictEqual(C.offerLikely(store, [], NOW, 0), true,
    'and the door still reads as open at scene paint, which is the surface ' +
    'she actually met');

  // ...and again, welcoming the next oldest. The ratchet was cumulative, so
  // one round is not evidence that it is gone.
  store['c-2018'].state = 'blessed';
  store['c-2018'].history = [{ at: '2026-08-16T11:00:00.000Z', from: 'unseen',
    to: 'blessed', via: 'blessing' }];
  assert.strictEqual(C.pickBlessingSeed(store, 0).id, 'c-2018');
  assert.deepStrictEqual(C.pickOfferCandidates(store, [], NOW, opts),
    ['c-2021'], 'a second welcome does not shut it either');
  assert.strictEqual(C.offerLikely(store, [], NOW, 0), true);
});

// ---- verdict ----------------------------------------------------------------

if (ranNames.length !== 13) {
  failures.push('[registry] ' + ranNames.length + ' case(s) ran — pinned BY ' +
    'VALUE at exactly 13. A case deleted, renamed or never invoked shrinks ' +
    'this suite\'s coverage and its own count together, which is the shape ' +
    'this project has repeatedly failed to notice.');
}
if (JSON.stringify(ranNames) !== JSON.stringify(EXPECTED_CASES)) {
  failures.push('[registry] the cases that ran are ' +
    JSON.stringify(ranNames) + ' — expected exactly ' +
    JSON.stringify(EXPECTED_CASES) + '. Contents are pinned as well as ' +
    'count, because a count alone is satisfied by a rename.');
}

if (failures.length) {
  console.error('test_offer_selector FAILED — ' + failures.length +
    ' violation(s):');
  failures.forEach(function (f) { console.error('  ' + f); });
  process.exit(1);
}

console.log('test_offer_selector OK — 13/13 cases');
process.exit(0);
