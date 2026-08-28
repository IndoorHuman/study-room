/*
 * tests/test_related_blessings.cjs — the pass that LEADS with what she
 * recently welcomed, and always keeps a slice for the rest of her pile.
 *
 * HER RULING, 2026-08-25 night, from the built desk. Her complaint first,
 * in her own words: "I cannot tell how much the current blessing is
 * related to what my recenlty things is". Then, choosing from an offered
 * set: "go option2 ... but if the librarian cannot find the enough
 * aomount things like for my example is 10, the librarian will pick the
 * other unrelated blessing things". Then, on the starvation consequence
 * put back to her (if related things always fill the pass, parts of the
 * pile may never come up again): "Always keep a slice for the rest".
 *
 * Zero-dep node (assert only). core.js is require()-able, so these drive
 * the REAL selector rather than a lifted copy.
 *
 * ⛔ WHAT THIS SUITE EXISTS TO STOP, and each is a law before it is a
 * behaviour:
 *   1. THE PILE GOING UNREACHABLE. The reserve is the whole difference
 *      between "leads with" and "only ever shows"; a related streak long
 *      enough to fill every pass must still not bury the rest. Group 3
 *      drives a library where the related pool alone could fill the pass
 *      forever and asserts the rest still appears.
 *   2. A MODEL, A BODY, OR A NETWORK CREEPING IN. Relatedness is computed
 *      from the time of year and the folder — things the room already
 *      knows. Group 6 asserts the selector reaches no body text at all,
 *      by handing it items whose bodies are poisoned: if a facet ever
 *      derives from content, the poisoned pool changes the answer.
 *   3. THE PASS COMING UP SHORT. Her rule's own second half: when the
 *      related pool cannot fill it, the unrelated ones fill the rest.
 *   4. DISPOSAL BY ORDERING (law 7 / law 2). Every id returned is one she
 *      still judges; nothing is dropped from the library, and the
 *      selector never returns an item the ordinary pass would not.
 */

'use strict';
const assert = require('assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'core.js'));

let groups = 0;
function group(name, fn) { groups++; fn(); console.log('  ok  ' + name); }

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);   // fixed clock, injected

/* A library builder. `blessedAt` marks an item as one of her welcomes via
 * a history hop, exactly as the store records it (ISO string `at`). */
function item(id, opts) {
  opts = opts || {};
  const it = {
    id: id,
    state: opts.state || 'unseen',
    type: opts.type || 'text',
    origin_path: opts.path || ('/src/' + (opts.folder || 'notes') + '/' + id + '.md'),
    created_ms: opts.created_ms,
    saved_ms: opts.saved_ms || opts.created_ms || NOW - 400 * DAY,
    body: opts.body || ''
  };
  if (opts.blessedAt) {
    it.state = 'blessed';
    it.history = [{ to: 'blessed', at: new Date(opts.blessedAt).toISOString() }];
  }
  return it;
}
function lib(list) {
  const out = {};
  list.forEach(function (it) { out[it.id] = it; });
  return out;
}
/* Two dates in the SAME fortnight of different years — the season facet. */
const JULY_2019 = Date.UTC(2019, 6, 20);
const JULY_2021 = Date.UTC(2021, 6, 21);
const JULY_2015 = Date.UTC(2015, 6, 22);
const MARCH_2018 = Date.UTC(2018, 2, 3);

/* ---- 1. the facets come off her recent welcomes ------------------------- */
group('her recent welcomes set the season and folder facets', function () {
  const items = lib([
    item('w1', { blessedAt: NOW - 2 * DAY, created_ms: JULY_2019,
      folder: 'trips' }),
    item('u1', { created_ms: JULY_2021, folder: 'other' })
  ]);
  const facets = C.recentBlessingFacets(items, 2);
  assert.ok(Object.keys(facets.fortnights).length >= 1,
    'a welcomed item with a capture date contributes its fortnight');
  assert.ok(Object.keys(facets.folders).length >= 1,
    'a welcomed item contributes its folder');
  /* and the unseen July item is recognised as related to it */
  const res = C.pickRelatedBlessingCandidates(items, [], NOW, {});
  assert.deepStrictEqual(res.ids, ['u1'],
    'the only unseen item is the pass');
  assert.ok(res.relation.u1, 'and it carries a relation payload');
  assert.strictEqual(res.relation.u1.kind, 'season',
    'the same fortnight of another year is a SEASON relation');
});

/* ---- 2. related things LEAD the pass ------------------------------------ */
group('related things lead, ahead of older unrelated ones', function () {
  const list = [item('w1', { blessedAt: NOW - DAY, created_ms: JULY_2019,
    folder: 'trips' })];
  /* five unrelated items, all OLDER (so oldest-first alone would take them) */
  for (let i = 0; i < 5; i++) {
    list.push(item('old' + i, { created_ms: MARCH_2018 - i * 40 * DAY,
      saved_ms: NOW - (900 + i) * DAY, folder: 'misc' }));
  }
  /* three related-by-season, all NEWER */
  for (let i = 0; i < 3; i++) {
    list.push(item('rel' + i, { created_ms: JULY_2021 + i * DAY,
      saved_ms: NOW - 10 * DAY, folder: 'other' }));
  }
  const res = C.pickRelatedBlessingCandidates(lib(list), [], NOW,
    { BLESSING_COUNT: 5, BLESSING_RESERVE: 2 });
  assert.strictEqual(res.ids.length, 5, 'the pass is full');
  const rel = res.ids.filter(function (id) { return id.indexOf('rel') === 0; });
  assert.strictEqual(rel.length, 3,
    'all three related things are in the pass, though every unrelated one ' +
    'is older — the lead is what she asked for');
  rel.forEach(function (id) {
    assert.ok(res.relation[id], 'every related pick carries its why: ' + id);
  });
});

/* ---- 3. ⛔ THE RESERVE — the rest of the pile is never buried ------------ */
group('a related pool big enough to fill the pass forever still leaves ' +
  'room for the rest', function () {
  const list = [item('w1', { blessedAt: NOW - DAY, created_ms: JULY_2019,
    folder: 'trips' })];
  /* forty related items — enough to fill every pass on their own */
  for (let i = 0; i < 40; i++) {
    list.push(item('rel' + i, { created_ms: JULY_2015 + i * 60 * 1000,
      saved_ms: NOW - 100 * DAY, folder: 'trips' }));
  }
  /* and three things from elsewhere she would otherwise never meet */
  for (let i = 0; i < 3; i++) {
    list.push(item('far' + i, { created_ms: MARCH_2018 + i * DAY,
      saved_ms: NOW - 800 * DAY, folder: 'faraway' }));
  }
  const res = C.pickRelatedBlessingCandidates(lib(list), [], NOW,
    { BLESSING_COUNT: 10, BLESSING_RESERVE: 2 });
  assert.strictEqual(res.ids.length, 10, 'the pass is full');
  const far = res.ids.filter(function (id) { return id.indexOf('far') === 0; });
  assert.strictEqual(far.length, 2,
    'HER RULING: two places always go to the rest of her pile, even when ' +
    'the related pool could have taken every one — got ' + far.length);
  far.forEach(function (id) {
    assert.ok(!res.relation[id],
      'a reserve pick carries NO relation line rather than an invented ' +
      'one: ' + id);
  });
});

/* ---- 4. her second half: too few related → unrelated fill the rest ------ */
group('when related things run out the pass is still full', function () {
  const list = [item('w1', { blessedAt: NOW - DAY, created_ms: JULY_2019,
    folder: 'trips' })];
  list.push(item('rel0', { created_ms: JULY_2021, folder: 'other' }));
  for (let i = 0; i < 12; i++) {
    list.push(item('u' + i, { created_ms: MARCH_2018 + i * DAY,
      saved_ms: NOW - (500 + i) * DAY, folder: 'misc' }));
  }
  const res = C.pickRelatedBlessingCandidates(lib(list), [], NOW,
    { BLESSING_COUNT: 10, BLESSING_RESERVE: 2 });
  assert.strictEqual(res.ids.length, 10,
    'her rule: "the librarian will pick the other unrelated blessing ' +
    'things" until the pass is full');
  assert.ok(res.ids.indexOf('rel0') !== -1,
    'and the one related thing is still in it');
});

/* ---- 5. a library with no welcomes yet behaves like the ordinary pass --- */
group('day one — no welcomes yet — is the ordinary pass, unharmed', function () {
  const list = [];
  for (let i = 0; i < 15; i++) {
    list.push(item('u' + i, { created_ms: MARCH_2018 + i * DAY,
      saved_ms: NOW - (500 + i) * DAY, folder: i % 2 ? 'a' : 'b' }));
  }
  const items = lib(list);
  const res = C.pickRelatedBlessingCandidates(items, [], NOW, {});
  const ordinary = C.pickBlessingCandidates(items, [], NOW, {});
  assert.deepStrictEqual(res.ids, ordinary,
    'with nothing welcomed there are no facets, so the pass IS the shipped ' +
    'one — the feature cannot make day one worse');
  assert.deepStrictEqual(res.relation, {},
    'and nothing claims a relation it does not have');
});

/* ---- 6. ⛔ NO BODY IS EVER READ ----------------------------------------- */
group('the selector reaches no body text — poisoned bodies change nothing',
  function () {
    function build(bodyText) {
      const list = [item('w1', { blessedAt: NOW - DAY, created_ms: JULY_2019,
        folder: 'trips', body: bodyText })];
      for (let i = 0; i < 12; i++) {
        list.push(item('u' + i, { created_ms: MARCH_2018 + i * DAY,
          saved_ms: NOW - (500 + i) * DAY, folder: 'misc', body: bodyText }));
      }
      return lib(list);
    }
    const plain = C.pickRelatedBlessingCandidates(build(''), [], NOW, {});
    const poisoned = C.pickRelatedBlessingCandidates(
      build('trips july 2019 holiday beach ' + 'x'.repeat(2000)), [], NOW, {});
    assert.deepStrictEqual(poisoned.ids, plain.ids,
      'if any facet derived from content, these two libraries would differ — ' +
      'they must not: relatedness is time-of-year and folder ONLY');
  });

/* ---- 7. law 7 / law 2: it proposes an order, disposes of nothing -------- */
group('every id returned is one the ordinary pass would also offer',
  function () {
    const list = [item('w1', { blessedAt: NOW - DAY, created_ms: JULY_2019,
      folder: 'trips' })];
    for (let i = 0; i < 20; i++) {
      list.push(item('x' + i, {
        created_ms: (i % 3 === 0 ? JULY_2021 : MARCH_2018) + i * DAY,
        saved_ms: NOW - (300 + i) * DAY, folder: i % 2 ? 'a' : 'b' }));
    }
    const items = lib(list);
    const res = C.pickRelatedBlessingCandidates(items, [], NOW, {});
    const whole = C.pickBlessingCandidates(items, [], NOW,
      { BLESSING_COUNT: 999 });
    res.ids.forEach(function (id) {
      assert.ok(whole.indexOf(id) !== -1,
        'the related pass invented an id the ordinary pass would never ' +
        'offer: ' + id);
    });
    assert.strictEqual(new Set(res.ids).size, res.ids.length,
      'no id appears twice in one pass');
  });

/* ---- 8. purity: the same library twice gives the same pass -------------- */
group('deterministic, and it does not mutate the library', function () {
  const list = [item('w1', { blessedAt: NOW - DAY, created_ms: JULY_2019,
    folder: 'trips' })];
  for (let i = 0; i < 14; i++) {
    list.push(item('u' + i, { created_ms: JULY_2021 + i * DAY,
      saved_ms: NOW - (200 + i) * DAY, folder: i % 2 ? 'a' : 'b' }));
  }
  const items = lib(list);
  const before = JSON.stringify(items);
  const a = C.pickRelatedBlessingCandidates(items, [], NOW, {});
  const b = C.pickRelatedBlessingCandidates(items, [], NOW, {});
  assert.deepStrictEqual(a.ids, b.ids, 'same library, same pass');
  assert.strictEqual(JSON.stringify(items), before,
    'the selector mutated the library it was handed');
});

console.log('OK test_related_blessings.cjs — ' + groups + ' groups. Her ' +
  '2026-08-25 night ruling driven on the REAL core selector: the facets ' +
  'come off her recent welcomes (season + folder), related things lead ' +
  'the pass, ⛔ the reserve keeps the rest of her pile reachable even ' +
  'against a related pool that could fill every pass, her second half ' +
  '(too few related → unrelated fill it) holds, day one is byte-identical ' +
  'to the shipped ordinary pass, ⛔ poisoned bodies change nothing (no ' +
  'model, no body, no network), nothing is invented or disposed of, and ' +
  'the selector is pure.');
