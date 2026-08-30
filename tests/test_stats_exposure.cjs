/*
 * tests/test_stats_exposure.cjs — D-11 numeric-target exposure guard (27-03).
 *
 * Verifies the SHIPPED SRM-09 stats surface already exposes what the
 * Phase-27 self-test needs — expose-only, no redesign:
 *   glad-rate as X of Y opens
 *   never-again rate as X of Y opens
 *   blessed / resting pool sizes
 *   cumulative visits (meta.room_entries)
 *   zero-leak = len(meta.incidents) == 0
 *   first-run Y=0 → em-dash rows, never NaN/Infinity
 *
 * Counting is exercised by LIFTING manageStatCounts from app.js and
 * running it over an in-hand synthetic snapshot (no fetch, no new
 * route). Weekly visit cadence and first-import effort are SELF-LOG
 * measures (A2/A3) — this suite asserts they are NOT on the stats
 * surface.
 *
 * Run: node tests/test_stats_exposure.cjs
 * Contract: one OK line + exit 0, or a named failure + exit 1.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

function readRepo(name) {
  return fs.readFileSync(path.join(REPO, name), 'utf8');
}

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function note(msg) {
  console.log('  ok —', msg);
}

/** Brace-balanced lift of `function name(...){...}` from source text. */
function liftFn(src, name) {
  const marker = 'function ' + name + '(';
  const at = src.indexOf(marker);
  if (at === -1) {
    throw new Error('LIFT_SHORT: function ' + name + ' not found');
  }
  const open = src.indexOf('{', at);
  if (open === -1) {
    throw new Error('LIFT_SHORT: function ' + name + ' has no body');
  }
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === '{') { depth += 1; }
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { end += 1; break; }
    }
  }
  if (depth !== 0 || end - at < 40) {
    throw new Error('LIFT_SHORT: function ' + name + ' body truncated');
  }
  return src.slice(at, end);
}

const app = readRepo('app.js');
const server = readRepo('server.py');

// ---- Presence: shipped helpers exist ---------------------------------------

if (app.indexOf('function manageStatCounts()') === -1) {
  fail('app.js: manageStatCounts missing — D-11 needs the shipped counter');
}
if (app.indexOf('function renderStatsSection()') === -1) {
  fail('app.js: renderStatsSection missing — D-11 needs the shipped surface');
}
note('manageStatCounts + renderStatsSection present in app.js');

const countsSrc = liftFn(app, 'manageStatCounts');
const rowsSrc = liftFn(app, 'renderStatsSection');

// ---- Pure counting over an in-hand synthetic snapshot ----------------------
//
// manageStatCounts closes over MANAGE.items. Inject a synthetic MANAGE and
// run the LIFTED source — proving the shipped counter, not a retyped oracle.

const runCounts = new Function(
  'MANAGE',
  countsSrc + '\nreturn manageStatCounts();'
);

const snapshotItems = {
  a: {
    state: 'blessed',
    history: [{ via: 'opened' }, { via: 'reaction:glad' }]
  },
  b: {
    state: 'resting',
    history: [{ via: 'opened' }, { via: 'reaction:never_again' }]
  },
  c: {
    state: 'blessed',
    history: [{ via: 'opened' }, { via: 'reaction:glad' }]
  },
  d: {
    state: 'never_show',
    history: []
  },
  e: {
    state: 'retired',
    history: [{ via: 'opened' }, { via: 'reaction:glad' },
              { via: 'opened' }, { via: 'reaction:never_again' }]
  }
};

const c = runCounts({ items: snapshotItems });
assert.strictEqual(c.opens, 5, 'opens should count every via:opened');
assert.strictEqual(c.glad, 3, 'glad should count reaction:glad vias');
assert.strictEqual(c.neverAgain, 2,
  'neverAgain should count reaction:never_again vias');
assert.strictEqual(c.blessed, 2, 'blessed pool from state===blessed');
assert.strictEqual(c.resting, 1, 'resting pool from state===resting');
note('synthetic snapshot: glad 3/5, never-again 2/5, blessed 2, resting 1');

// Glad-rate / never-again as X of Y (the self-test's numeric form).
const gladRate = c.glad / c.opens;
const neverAgainRate = c.neverAgain / c.opens;
assert.ok(Math.abs(gladRate - 0.6) < 1e-12, 'glad-rate 3/5 === 0.6');
assert.ok(Math.abs(neverAgainRate - 0.4) < 1e-12,
  'never-again rate 2/5 === 0.4');
note('glad-rate and never-again rate are X/Y over opens');

// Display copy pins: "X of Y opens" (not a bare float that loses the denom).
if (rowsSrc.indexOf("c.glad + ' of ' + c.opens + ' opens'") === -1) {
  fail("renderStatsSection: glad row no longer formats as 'X of Y opens'");
}
if (rowsSrc.indexOf(
      "c.neverAgain + ' of ' + c.opens + ' opens'") === -1) {
  fail("renderStatsSection: never-again row no longer formats as " +
    "'X of Y opens'");
}
if (rowsSrc.indexOf(
      "'blessed: ' + c.blessed + ' (resting ' + c.resting + ')'") === -1) {
  fail('renderStatsSection: blessed/resting pool row copy drifted');
}
note('row copy exposes glad / never-again as X of Y and blessed+resting');

// Cumulative visits from meta.room_entries (in-hand; not a new fetch).
if (rowsSrc.indexOf('MANAGE.meta.room_entries') === -1) {
  fail('renderStatsSection: visits no longer read meta.room_entries');
}
note('cumulative visits read from meta.room_entries on the in-hand snapshot');

// ---- First-run Y=0: em-dash, never divide-by-zero / NaN / Infinity ---------

const empty = runCounts({ items: {} });
assert.strictEqual(empty.opens, 0);
assert.strictEqual(empty.glad, 0);
assert.strictEqual(empty.neverAgain, 0);
assert.strictEqual(empty.blessed, 0);
assert.strictEqual(empty.resting, 0);

if (rowsSrc.indexOf("c.opens === 0 ? 'glad: — (no opens yet)'") === -1) {
  fail('renderStatsSection: zero-opens glad guard missing');
}
if (rowsSrc.indexOf(
      "c.opens === 0 ? 'never again: — (no opens yet)'") === -1) {
  fail('renderStatsSection: zero-opens never-again guard missing');
}

// The shipped path never divides — only formats. Mirror the guard so a
// future "helpful" rate float cannot sneak NaN into the instrument.
function formatGlad(counts) {
  return counts.opens === 0
    ? 'glad: — (no opens yet)'
    : 'glad: ' + counts.glad + ' of ' + counts.opens + ' opens';
}
function formatNever(counts) {
  return counts.opens === 0
    ? 'never again: — (no opens yet)'
    : 'never again: ' + counts.neverAgain + ' of ' + counts.opens + ' opens';
}
const zeroGlad = formatGlad(empty);
const zeroNever = formatNever(empty);
assert.ok(zeroGlad.indexOf('NaN') === -1 &&
          zeroGlad.indexOf('Infinity') === -1,
  'zero-opens glad must not be NaN/Infinity');
assert.ok(zeroNever.indexOf('NaN') === -1 &&
          zeroNever.indexOf('Infinity') === -1,
  'zero-opens never-again must not be NaN/Infinity');
note('first-run Y=0 uses em-dash; no NaN/Infinity');

// ---- Zero-leak = len(meta.incidents) == 0 (in-hand; no network) ------------

function zeroLeak(meta) {
  const incidents = (meta && Array.isArray(meta.incidents))
    ? meta.incidents
    : [];
  return incidents.length === 0;
}

assert.strictEqual(zeroLeak({ incidents: [] }), true,
  'empty incidents → zero-leak holds');
assert.strictEqual(zeroLeak({}), true,
  'absent incidents treated as empty → zero-leak holds');
assert.strictEqual(
  zeroLeak({
    incidents: [{ item_id: 'x', surface: 'shelf', reason: 'leak' }]
  }),
  false,
  'non-empty incidents → zero-leak fails'
);
note('zero-leak = len(meta.incidents)==0 over in-hand meta');

// Server documents the same claim (append-only incidents are the record).
if (server.indexOf('len(meta.incidents) == 0') === -1 &&
    server.indexOf('len(meta.incidents)==0') === -1) {
  fail('server.py: zero-leaks claim comment missing ' +
    '(len(meta.incidents)==0)');
}
if (server.indexOf('def validate_incidents') === -1) {
  fail('server.py: validate_incidents missing — append-only gate required');
}
note('server append-only incidents gate present; zero-leak claim documented');

// ---- Threat T-27-07: no new /api stats route, no stats fetch ---------------

if (/\/api\/stats\b/.test(app) || /\/api\/stats\b/.test(server)) {
  fail('a /api/stats route appeared — stats must stay in-hand snapshot only');
}
if (/fetch\s*\([^)]*stats/i.test(app)) {
  fail('app.js fetches a stats URL — breaks nothing-transmitted (D-03)');
}
// manageStatCounts itself must not call fetch / apiGet.
if (/\bfetch\b|\bapiGet\b|\bapiPost\b|\bXMLHttpRequest\b/.test(countsSrc)) {
  fail('manageStatCounts performs a network call — expose-only broken');
}
note('no /api/stats route; manageStatCounts is network-free');

// ---- Cadence + first-import are self-log measures, NOT stats (A2/A3) -------

const cadenceHints = /weekly|per.?week|3\s*[×x]\s*\/\s*wk|cadence|first.?import/i;
if (cadenceHints.test(countsSrc)) {
  fail('manageStatCounts absorbed a self-log measure (cadence/first-import) ' +
    '— keep those in 27-SELF-LOG.md (A2/A3)');
}
if (cadenceHints.test(rowsSrc)) {
  fail('renderStatsSection absorbed a self-log measure (cadence/first-import)');
}
note('weekly cadence + first-import effort stay off the stats surface ' +
  '(self-log measures)');

console.log('OK test_stats_exposure');
