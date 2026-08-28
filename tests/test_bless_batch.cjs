/*
 * tests/test_bless_batch.cjs — the blessing-session default batch
 * (26.5-09 UAT F5, the owner: "at least by default change it to 10").
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * blessBatch(ids, batch) is a PURE function inside app.js — no DOM, no
 * clock, no state — lifted by brace-matching (app.js is a browser IIFE
 * that touches `document` at load, so it can't be require()'d under
 * node); the repo's text-extraction idiom (mirrors test_view_stack.cjs).
 *
 * The decided behavior: a blessing session (the desk stack AND every
 * container-scoped pile walk on the diegetic path) is ONE SITTING of at
 * most BLESS_BATCH (default 10) things. The ribbon counter reads
 * "N of <this sitting>" — a count of the things in hand, never of the
 * whole pile (law 3: the pile hint keeps the total-count copy); after
 * the last verdict the session ends the same quiet way exhaustion does
 * (finishBlessing's spread-branch pop), and the next tap deals the next
 * batch.
 *
 * ⚠ THE SENTENCE THAT USED TO CLOSE THIS PARAGRAPH IS NO LONGER TRUE, and
 * it is rewritten here rather than left standing, because a stale header is
 * how a later reader deletes a correct pin. It read: "The legacy flag-off
 * blessing panel is untouched (startBlessing never calls blessBatch — core's
 * own BLESSING_COUNT default governs it)."
 *
 * As of 26.95-34 (D-16) HALF of that is still exactly right and half is
 * superseded:
 *   * startBlessing STILL never calls blessBatch. The two constants are
 *     independent by ruling — blessBatch/BLESS_BATCH is the desk-and-pile
 *     SITTING size and is not driven by the new key at all. Group 5 keeps
 *     that pin.
 *   * core's BLESSING_COUNT default no longer governs the guided pass
 *     UNCONDITIONALLY. It governs whenever meta.blessing_batch_size is absent
 *     or unusable — which is still every shipped store today — and the stored
 *     whole number governs when she has asked for one. That is the whole of
 *     the key's client reach: ONE call site, inside startBlessing, serving
 *     both surfaces the ruling names (the guided first pass and the
 *     deliberate grind in Manage). ⛔ The Offer is THREE, FIXED, and is not
 *     settable; ⛔ the retired-but-retained pickBlessingCandidates occurrence
 *     inside deskStackOpenNext is deliberately NOT given the key.
 *
 * Behaviors covered:
 *   1. TEN-ITEM CEILING — 23 candidates in, the FIRST 10 out, order
 *      preserved (narrowing only: selection order is the shipped
 *      picker's, never re-sorted).
 *   2. SHORT PILE — fewer than the batch remain → all of them ("N of
 *      <remaining>"); empty in → empty out (the quiet no-op tap).
 *   3. OPTS OVERRIDE — the DEFAULTS+opts convention: an explicit batch
 *      narrows (or widens) the sitting; batch=null falls to the default.
 *   4. INPUT PURITY — the candidate list is never mutated.
 *   5. WIRING — var BLESS_BATCH = 10 is the pinned default; the ONE
 *      spread-blessing entry (deskStackOpenNext) batches through
 *      blessBatch AFTER its typeScope narrowing, starts each sitting at
 *      index 0, and still selects through the SHIPPED picker; the quiet
 *      end is intact (finishBlessing's spread branch pops, no
 *      completion copy); startBlessing (the legacy panel) never batches.
 *   6. THE CLIENT HALF OF blessing_batch_size (26.95-34, D-16) — driven
 *      end-to-end through the SHIPPED core selector, never asserted by
 *      reading source: absent takes core's own default, a legal value takes
 *      exactly that many, both bounds work, and every value the SERVER would
 *      have refused behaves as ABSENT (the client is the second line).
 *   7. THE CROSS-LANGUAGE PINS, BY VALUE — app.js's bounds against
 *      server.py's, server.py's default against core.js's, and the default
 *      inside its own bounds. Each number is asserted against the OTHER
 *      number, never against a literal, so drift in either language fails.
 *      BLESS_BATCH keeps its own separate by-value pin: the two constants
 *      are independent by ruling and this suite must not forbid a divergence
 *      the ruling permits.
 *   8. NO DIAL — the room gains no slider, no stepper and no number field for
 *      this, and the absence is pinned WITH A POSITIVE CONTROL so a zero
 *      means something. A gate that would still pass if someone added a
 *      slider is not a gate.
 *
 * ⚠ Groups 6-8 read app.js as TEXT with comments stripped first, and say so:
 * a scan that reads comments finds a call that has been commented out and
 * reports green on fail-open code. Comment stripping here removes block
 * comments and WHOLE-LINE line comments; a trailing comment survives, which
 * is why every source pin below is anchored to an assignment at the start of
 * a line or scoped to a lifted function region.
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
const pySrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const StudyCore = require('../core.js');

// Comment strippers. Declared limitation, stated rather than hidden: block
// comments and whole-line line comments go; a TRAILING comment and a string
// literal that happens to contain a comment opener do not. Every pin that
// uses these is anchored to a line-start assignment or to a lifted function
// region, where that limitation cannot reach.
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function stripPyComments(src) {
  return src.replace(/^[ \t]*#.*$/gm, '');
}

const appCode = stripJsComments(appSrc);
const coreCode = stripJsComments(coreSrc);
const pyCode = stripPyComments(pySrc);

// ONE number out of one source, by value, with the extraction itself
// asserted: a regex that matched nothing would otherwise make every
// comparison below vacuously true (NaN) or silently absent.
function oneNumber(src, re, what) {
  const g = new RegExp(re.source, 'gm');
  const found = [];
  let m;
  while ((m = g.exec(src)) !== null) { found.push(Number(m[1])); }
  assert.strictEqual(found.length, 1,
    what + ': expected exactly ONE definition in the source, found ' +
    found.length + ' — a pin over the wrong count is not a pin');
  assert.ok(Number.isFinite(found[0]),
    what + ': did not read as a finite number');
  return found[0];
}

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

// The default is a free var of the lifted function; the source pin in
// group 5 holds the literal itself to 10.
function loadBatch(defaultBatch) {
  // eslint-disable-next-line no-new-func
  return new Function('BLESS_BATCH',
    extractFn(appSrc, 'blessBatch') + '\nreturn blessBatch;')(defaultBatch);
}

const blessBatch = loadBatch(10);

// ---- 1. ten-item ceiling ----------------------------------------------------

(function () {
  const ids = [];
  for (let i = 0; i < 23; i++) { ids.push('id-' + i); }
  const sitting = blessBatch(ids);
  assert.strictEqual(sitting.length, 10,
    '(1) 23 candidates deal a sitting of exactly 10');
  assert.deepStrictEqual(sitting, ids.slice(0, 10),
    '(1) the FIRST ten, in the shipped picker order — narrowing only');
})();

// ---- 2. short pile + empty ----------------------------------------------------

(function () {
  const four = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(blessBatch(four), four,
    '(2) fewer than the batch remain → the sitting is all of them');
  assert.deepStrictEqual(blessBatch([]), [],
    '(2) an empty pile deals an empty sitting (the quiet no-op tap)');
  assert.deepStrictEqual(blessBatch(null), [],
    '(2) a null list fails safe to empty — never throws');
})();

// ---- 3. opts override -----------------------------------------------------------

(function () {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepStrictEqual(blessBatch(ids, 3), ['a', 'b', 'c'],
    '(3) an explicit batch overrides the default (opts convention)');
  assert.strictEqual(blessBatch(ids, null).length, 5,
    '(3) batch=null falls to the default (5 < 10 → all five)');
})();

// ---- 4. input purity ------------------------------------------------------------

(function () {
  const ids = ['a', 'b', 'c'];
  const snapshot = JSON.stringify(ids);
  blessBatch(ids, 2);
  assert.strictEqual(JSON.stringify(ids), snapshot,
    '(4) blessBatch never mutates the candidate list');
})();

// ---- 5. wiring pins --------------------------------------------------------------

(function () {
  // the pinned default literal: ten, by owner order.
  assert.ok(/var BLESS_BATCH = 10;/.test(appSrc),
    '(5) var BLESS_BATCH = 10 — the owner-ordered default sitting size');

  const entry = extractFn(appSrc, 'deskStackOpenNext');
  assert.ok(entry.indexOf('blessBatch(') !== -1,
    '(5) deskStackOpenNext deals the sitting through blessBatch');
  assert.ok(entry.indexOf('StudyCore.pickBlessingCandidates(') !== -1,
    '(5) selection still runs through the SHIPPED picker (law 5)');
  // batching happens AFTER the typeScope narrowing — a scoped pile must
  // still fill its sitting from the whole scoped pool.
  assert.ok(entry.indexOf('typeScope') < entry.indexOf('blessBatch('),
    '(5) blessBatch narrows AFTER the typeScope post-filter');
  assert.ok(entry.indexOf('BLESS.index = 0') !== -1,
    '(5) every tap starts a fresh sitting at index 0 — the next tap ' +
    'deals the next batch');

  // the quiet end: exhaustion pops back to the hosting station/desk
  // through the spread branch — no completion copy of any kind.
  const finish = extractFn(appSrc, 'finishBlessing');
  assert.ok(finish.indexOf('BLESS.spread') !== -1 &&
    finish.indexOf('popView()') !== -1,
    '(5) finishBlessing keeps the quiet spread-branch pop (the batch ' +
    'end rides the SAME exhaustion exit)');

  // the legacy flag-off panel is untouched: startBlessing never batches.
  assert.ok(extractFn(appSrc, 'startBlessing').indexOf('blessBatch') === -1,
    '(5) startBlessing (legacy panel) never calls blessBatch — the ' +
    'flag-off pass is byte-untouched');
})();

// ---- shared numbers, read once out of the three languages -------------------

const SERVER_MIN = oneNumber(pyCode, /^BLESSING_BATCH_MIN = (\d+)$/,
  'server.py BLESSING_BATCH_MIN');
const SERVER_MAX = oneNumber(pyCode, /^BLESSING_BATCH_MAX = (\d+)$/,
  'server.py BLESSING_BATCH_MAX');
const SERVER_DEFAULT = oneNumber(pyCode, /^BLESSING_BATCH_DEFAULT = (\d+)$/,
  'server.py BLESSING_BATCH_DEFAULT');
const APP_MIN = oneNumber(appCode, /^\s*var BLESSING_BATCH_MIN = (\d+);$/,
  'app.js BLESSING_BATCH_MIN');
const APP_MAX = oneNumber(appCode, /^\s*var BLESSING_BATCH_MAX = (\d+);$/,
  'app.js BLESSING_BATCH_MAX');
const APP_BLESS_BATCH = oneNumber(appCode, /^\s*var BLESS_BATCH = (\d+);$/,
  'app.js BLESS_BATCH');
// core.js is REQUIRED, so its number is read off the EVALUATED export rather
// than off source text — no comment, commented-out line or lookalike literal
// can stand in for it. The text extraction runs beside it only to prove the
// constant has exactly one definition, and the two are asserted equal.
const CORE_DEFAULT = StudyCore.DEFAULTS.BLESSING_COUNT;
assert.strictEqual(
  oneNumber(coreCode, /^\s*BLESSING_COUNT: (\d+),/,
    'core.js DEFAULTS.BLESSING_COUNT'),
  CORE_DEFAULT,
  'core.js DEFAULTS.BLESSING_COUNT reads one way in source and another when ' +
  'evaluated — the source pin is measuring something that is not the value');

// ---- 6. the client half, driven through the SHIPPED core selector ----------
//
// NOT A SOURCE SCAN. The predicate is lifted verbatim out of app.js and the
// counts below come from core.js's own pickBlessingCandidates — so what is
// asserted is how many things a pass actually sets out, not what a line of
// source looks like.

(function () {
  const src = extractFn(appSrc, 'blessingBatchLegal');
  // hard rule: a lifted region must be asserted REAL before anything is
  // concluded from it — non-empty, more than one line, and beginning at the
  // symbol itself.
  assert.ok(src.indexOf('function blessingBatchLegal(') === 0,
    '(6) the lifted region does not begin at blessingBatchLegal');
  assert.ok(src.split('\n').length > 1 && src.length > 80,
    '(6) the lifted blessingBatchLegal region is not a real function body');

  // eslint-disable-next-line no-new-func
  const legal = new Function('BLESSING_BATCH_MIN', 'BLESSING_BATCH_MAX',
    src + '\nreturn blessingBatchLegal;')(APP_MIN, APP_MAX);

  // The ONE expression startBlessing uses, mirrored here — and the mirror is
  // ANCHORED: the region pin in group 8 asserts that exact substring is what
  // the shipped call site passes, so this is a copy of a pinned expression
  // rather than a second implementation of the rule.
  function opts(v) { return legal(v) ? { BLESSING_COUNT: v } : {}; }

  // 60 unseen things across four folders, so the round-robin has real buckets
  // and every count below is a NARROWING rather than exhaustion.
  const items = {};
  for (let i = 0; i < 60; i++) {
    const id = 'itm-' + (i < 10 ? '0' : '') + i;
    items[id] = {
      id: id, type: 'text', state: 'unseen', trigger: false,
      created_ms: 1000 + i, saved_ms: 1000 + i,
      origin_path: '/src/f' + (i % 4) + '/' + id + '.md',
      tags: [], year: 2024, folder: 'f' + (i % 4), source: 'folder-drop'
    };
  }
  const NOW = 1755000000000;

  // POSITIVE CONTROL: the pool really is bigger than every cap tested below.
  // Without it, "exactly 10" would also pass on a fixture holding ten things.
  assert.strictEqual(
    StudyCore.pickBlessingCandidates(items, [], NOW,
      { BLESSING_COUNT: 60 }).length, 60,
    '(6) the fixture does not hold 60 eligible unseen things — every ' +
    'narrowing assertion below would then be passing on exhaustion');

  // (a) ABSENT — core's own default governs, exactly as before this key.
  assert.strictEqual(
    StudyCore.pickBlessingCandidates(items, [], NOW, opts(undefined)).length,
    CORE_DEFAULT,
    '(6) with no stored batch size the guided pass takes core.js\'s own ' +
    'DEFAULTS.BLESSING_COUNT');

  // (b) a legal value, and both bounds.
  [[4, 4], [APP_MIN, APP_MIN], [APP_MAX, APP_MAX]].forEach(function (pair) {
    assert.strictEqual(
      StudyCore.pickBlessingCandidates(items, [], NOW, opts(pair[0])).length,
      pair[1],
      '(6) a stored batch size of ' + pair[0] + ' must set out exactly ' +
      pair[1] + ' things');
  });

  // (c) THE CLIENT IS THE SECOND LINE. Every value the server's validator
  // would have refused behaves as ABSENT here — never as itself, and never
  // as a coercion.
  [APP_MIN - 1, APP_MAX + 1, true, false, 3.5, '10', null, NaN, Infinity,
    -1, 0, {}, []].forEach(function (bad) {
    assert.strictEqual(legal(bad), false,
      '(6) ' + JSON.stringify(String(bad)) + ' must not read as a legal ' +
      'batch size — the write path refused it, and the read path is not the ' +
      'place to be generous');
    assert.strictEqual(
      StudyCore.pickBlessingCandidates(items, [], NOW, opts(bad)).length,
      CORE_DEFAULT,
      '(6) a hand-edited ' + JSON.stringify(String(bad)) +
      ' must fall to the shipped default, not to itself');
  });
})();

// ---- 7. the cross-language pins, BY VALUE -----------------------------------
//
// Each number is asserted against the OTHER number, never against a literal:
// the failure this catches is DRIFT, and a pair of literal assertions would
// pass happily while the two languages disagreed.

(function () {
  assert.strictEqual(APP_MIN, SERVER_MIN,
    '(7) app.js BLESSING_BATCH_MIN (' + APP_MIN + ') and server.py ' +
    'BLESSING_BATCH_MIN (' + SERVER_MIN + ') have drifted — the client is ' +
    'the second line and must refuse exactly what the write path refuses');
  assert.strictEqual(APP_MAX, SERVER_MAX,
    '(7) app.js BLESSING_BATCH_MAX (' + APP_MAX + ') and server.py ' +
    'BLESSING_BATCH_MAX (' + SERVER_MAX + ') have drifted');
  assert.strictEqual(SERVER_DEFAULT, CORE_DEFAULT,
    '(7) server.py BLESSING_BATCH_DEFAULT (' + SERVER_DEFAULT + ') and ' +
    'core.js DEFAULTS.BLESSING_COUNT (' + CORE_DEFAULT + ') have drifted — ' +
    'the ask document would then tell the model a current batch size the ' +
    'room does not actually run');
  assert.ok(SERVER_MIN <= SERVER_DEFAULT && SERVER_DEFAULT <= SERVER_MAX,
    '(7) the shipped default (' + SERVER_DEFAULT + ') is outside its own ' +
    'legal range ' + SERVER_MIN + '-' + SERVER_MAX + ' — the ask document ' +
    'would report a value validate_blessing_batch_size itself would refuse');
  // BLESS_BATCH keeps its OWN pin and is deliberately NOT tied to the three
  // above: the two-constants ruling makes them independent, and a pin that
  // forbade a divergence the ruling permits would be wrong in the other
  // direction. Its value is asserted here so a silent change is still caught.
  assert.strictEqual(APP_BLESS_BATCH, 10,
    '(7) BLESS_BATCH is no longer 10 — the desk/pile sitting size is not ' +
    'driven by blessing_batch_size and keeps its shipped value by ruling');
})();

// ---- 8. NO DIAL, and the call site is where the key reaches --------------
//
// Hard rule: pin the forbidden thing ABSENT, and give the absence a positive
// control so a zero means something.

(function () {
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  function countOf(hay, needle) {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }

  // (8a) no range input and no slider role anywhere in the room.
  [['app.js', appCode], ['index.html', htmlSrc]].forEach(function (pair) {
    ['type="range"', "type='range'", 'role="slider"', 'stepper']
      .forEach(function (tok) {
        assert.strictEqual(countOf(pair[1], tok), 0,
          '(8) ' + pair[0] + ' carries "' + tok + '" — no dial enters the ' +
          'room for this or anything else; the key moves through the ask ' +
          'and Manage, and nowhere else');
      });
  });
  // POSITIVE CONTROL for the scanner: input types this room DOES use are
  // found by exactly the same substring scan, so the zeros above are
  // evidence rather than a broken needle.
  assert.ok(countOf(appCode, 'type="checkbox"') >= 1,
    '(8) the scanner cannot find type="checkbox" in app.js, which plainly ' +
    'has one — every absence asserted above means nothing');
  assert.ok(countOf(htmlSrc, 'type="text"') >= 1,
    '(8) the scanner cannot find type="text" in index.html — same');

  // (8b) the key reaches exactly ONE call site, and it is startBlessing.
  const start = extractFn(appSrc, 'startBlessing');
  assert.ok(start.indexOf('function startBlessing(') === 0 &&
    start.split('\n').length > 5,
    '(8) the lifted startBlessing region is not real');
  const startCode = stripJsComments(start);
  assert.strictEqual(countOf(startCode, 'blessing_batch_size'), 1,
    '(8) startBlessing must read meta.blessing_batch_size exactly once');
  assert.strictEqual(
    countOf(startCode, 'blessingBatchLegal(batch) ? { BLESSING_COUNT: batch } : {}'),
    1,
    '(8) startBlessing no longer passes the stored value to the selector as ' +
    'opts.BLESSING_COUNT through the legality check — group 6 mirrors this ' +
    'exact expression, so the mirror is anchored to the shipped one');
  // NO NUMBER FIELD in the region either: the key is asked for in words.
  ['<input', 'type="number"', 'range'].forEach(function (tok) {
    assert.strictEqual(countOf(startCode, tok), 0,
      '(8) startBlessing carries "' + tok + '" — the guided pass grew a ' +
      'control for the batch size, which is exactly what the ruling forbids');
  });

  // (8c) the retired occurrence is NOT given the key, and keeps its own
  // MAX_SAFE_INTEGER override untouched.
  const desk = stripJsComments(extractFn(appSrc, 'deskStackOpenNext'));
  assert.strictEqual(countOf(desk, 'blessing_batch_size'), 0,
    '(8) deskStackOpenNext was handed the key — it has had no caller since ' +
    'plan 26.95-32 and is retained by ruling; a live setting wired into dead ' +
    'code makes the setting look like it governs a surface it does not');
  assert.strictEqual(
    countOf(desk, 'BLESSING_COUNT: Number.MAX_SAFE_INTEGER'), 1,
    '(8) deskStackOpenNext\'s shipped override moved — this plan does not ' +
    'touch it');
})();

console.log('OK test_bless_batch.cjs — 8 groups. blessing sitting: 10-item ' +
  'ceiling (order preserved), short/empty piles, opts override, input ' +
  'purity, wiring (picker + post-scope batching + fresh index + quiet end + ' +
  'legacy never batches). blessing_batch_size client half: 4 accepting ' +
  'cases (absent, ' + APP_MIN + ', 4, ' + APP_MAX + ') driven through the ' +
  'shipped core selector, ' + 13 + ' refusing cases each proven to fall to ' +
  'the shipped default of ' + CORE_DEFAULT + ', 1 positive control on a ' +
  'pool of 60. cross-language pins: 3 by-value pairs (app/server min, ' +
  'app/server max, server/core default) + 1 range invariant + BLESS_BATCH ' +
  'held at ' + APP_BLESS_BATCH + ' independently. no dial: 8 absence pins ' +
  'over app.js and index.html + 2 positive controls, 1 call site in ' +
  'startBlessing, 0 in the retired deskStackOpenNext');
