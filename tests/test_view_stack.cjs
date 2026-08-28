/*
 * tests/test_view_stack.cjs — the diegetic view-stack pure core (Plan
 * 26.5-01, D-06/D-10 + the D-05 spread stacking contract).
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * viewStackApply(stack, action) is a PURE function inside app.js — no DOM,
 * no clock, no write — lifted by brace-matching (app.js is a browser IIFE
 * that touches `document` at load, so it can't be require()'d under node);
 * the repo's text-extraction idiom (mirrors test_display_fence.cjs).
 *
 * Behaviors covered:
 *   1. PUSH — viewStackApply([], {type:'push', view:'station', id:'desk'})
 *      returns a 1-deep stack whose top is the desk station.
 *   2. SCROLL RECORD/RESTORE (D-05) — pushing a spread over a spread
 *      records the prior top's scrollTop in place (on a COPY — the input
 *      stack is never mutated); popping resolves to that exact entry with
 *      that exact scrollTop value.
 *   3. ONE-LEVEL POP (D-10) — pop removes exactly ONE level and resolves
 *      to the new top; an emptied stack resolves to the room.
 *   4. EMPTY-STACK SAFETY — popping an empty stack returns an empty stack
 *      + a 'room' resolution: never throws, never double-pops.
 *   5. BLESSING-SESSION TEARDOWN ON POP (26.5-09 UAT F8) — the pure
 *      blessTeardownOnPop decision: TRUE exactly when the popped level
 *      is the blessing walk's OWN tagged spread while the walk is
 *      active; FALSE for a station pop, an untagged (wikilink-door)
 *      spread over the walk, or when no session is live. Plus the
 *      wiring pins: popView consults the decision and resets the whole
 *      session (spread flag, queue, index, ribbon offer); openSpread
 *      stamps the blessWalk tag from opts.ribbon; pushView carries the
 *      tag onto the stack entry (the pure core copies neither).
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

function loadApply() {
  const fnSrc = extractFn(appSrc, 'viewStackApply');
  // The core must be free-var-clean: no DOM ($, document), no clock, no
  // ROOM/SHELF state — the factory injects nothing.
  // eslint-disable-next-line no-new-func
  return new Function(fnSrc + '\nreturn viewStackApply;')();
}

const apply = loadApply();

// ---- 1. PUSH ----------------------------------------------------------------

(function () {
  const r = apply([], { type: 'push', view: 'station', id: 'desk' });
  assert.ok(Array.isArray(r.stack), '(1) push returns a stack array');
  assert.strictEqual(r.stack.length, 1, '(1) push onto empty is 1-deep');
  assert.strictEqual(r.stack[0].view, 'station',
    '(1) the top is a station view');
  assert.strictEqual(r.stack[0].id, 'desk', '(1) the top is the desk');
  assert.strictEqual(r.resolved.view, 'station',
    '(1) the resolved entry is the pushed top');
  assert.strictEqual(r.resolved.id, 'desk',
    '(1) the resolved entry carries the pushed id');
})();

// ---- 2. SCROLL RECORD/RESTORE (D-05 spread stacking) --------------------------

(function () {
  let st = apply([], { type: 'push', view: 'station', id: 'shelf' }).stack;
  st = apply(st, { type: 'push', view: 'spread', id: 'reflection-a' }).stack;
  const before = st[1];

  // push a second spread over the first, recording the first's scroll spot
  const r = apply(st, {
    type: 'push', view: 'spread', id: 'item-b', scrollTop: 420
  });
  assert.strictEqual(r.stack.length, 3,
    '(2) the second spread stacks on top (3 levels)');
  assert.strictEqual(r.stack[1].scrollTop, 420,
    "(2) the prior top's scrollTop is recorded in place");
  assert.strictEqual(before.scrollTop, undefined,
    '(2) PURE — the input stack entry is never mutated (copy-on-record)');

  // popping restores exactly that entry with exactly that scrollTop
  const p = apply(r.stack, { type: 'pop' });
  assert.strictEqual(p.stack.length, 2, '(2) pop removes exactly one level');
  assert.strictEqual(p.resolved.view, 'spread',
    '(2) pop resolves to the spread beneath');
  assert.strictEqual(p.resolved.id, 'reflection-a',
    '(2) pop resolves to the exact prior spread');
  assert.strictEqual(p.resolved.scrollTop, 420,
    '(2) pop restores the exact recorded scrollTop value');
})();

// ---- 3. ONE-LEVEL POP (D-10) --------------------------------------------------

(function () {
  let st = apply([], { type: 'push', view: 'station', id: 'desk' }).stack;
  st = apply(st, { type: 'push', view: 'spread', id: 'x' }).stack;

  const p1 = apply(st, { type: 'pop' });
  assert.strictEqual(p1.stack.length, 1,
    '(3) pop removes exactly ONE level, never more');
  assert.strictEqual(p1.resolved.view, 'station',
    '(3) spread pops back to its station');
  assert.strictEqual(p1.resolved.id, 'desk',
    '(3) the station beneath keeps its identity');

  const p2 = apply(p1.stack, { type: 'pop' });
  assert.strictEqual(p2.stack.length, 0, '(3) the last level pops off');
  assert.strictEqual(p2.resolved.view, 'room',
    '(3) an emptied stack resolves to the room');
})();

// ---- 4. EMPTY-STACK SAFETY -----------------------------------------------------

(function () {
  const e1 = apply([], { type: 'pop' });
  assert.ok(Array.isArray(e1.stack) && e1.stack.length === 0,
    '(4) popping an empty stack returns an empty stack');
  assert.strictEqual(e1.resolved.view, 'room',
    "(4) popping an empty stack resolves to 'room'");

  // never double-pops, never throws — pop the already-empty result again
  const e2 = apply(e1.stack, { type: 'pop' });
  assert.strictEqual(e2.stack.length, 0,
    '(4) a second empty pop is still an empty stack (no throw)');
  assert.strictEqual(e2.resolved.view, 'room',
    "(4) a second empty pop still resolves to 'room'");

  // defensive: a null stack and an unknown action both fail safe
  const n = apply(null, { type: 'pop' });
  assert.ok(Array.isArray(n.stack) && n.stack.length === 0,
    '(4) a null stack fails safe to empty');
  const u = apply([{ view: 'station', id: 'desk' }], { type: 'noop' });
  assert.strictEqual(u.stack.length, 1,
    '(4) an unknown action leaves the stack unchanged');
  assert.strictEqual(u.resolved.view, 'station',
    '(4) an unknown action resolves to the current top');
})();

// ---- 5. BLESSING-SESSION TEARDOWN ON POP (26.5-09 UAT F8) ---------------------

(function () {
  // eslint-disable-next-line no-new-func
  const teardown = new Function(
    extractFn(appSrc, 'blessTeardownOnPop') +
    '\nreturn blessTeardownOnPop;')();

  // TRUE: the walk's own tagged spread is popped while the session lives —
  // the escape (ESC / dim edge / back arrow / scrim, all through popView).
  assert.strictEqual(
    teardown({ view: 'spread', blessWalk: true }, true), true,
    '(5) popping the tagged blessing spread mid-session tears it down');

  // FALSE: a verdict-exhausted end already cleared the flag (finishBlessing
  // sets BLESS.spread=false BEFORE its quiet pop) — never double-handled.
  assert.strictEqual(
    teardown({ view: 'spread', blessWalk: true }, false), false,
    '(5) the quiet exhaustion pop (flag already off) never trips it');

  // FALSE: an untagged reading spread stacked OVER the walk (a wikilink
  // door) pops back INTO the live session — the walk survives beneath.
  assert.strictEqual(
    teardown({ view: 'spread' }, true), false,
    '(5) popping an untagged spread over the walk resumes the session');

  // FALSE: a station pop is never a session escape; null fails safe.
  assert.strictEqual(
    teardown({ view: 'station', id: 'desk' }, true), false,
    '(5) a station pop never tears the session down');
  assert.strictEqual(teardown(null, true), false,
    '(5) a null popped view fails safe (no throw, no teardown)');

  // wiring: popView consults the decision and resets the WHOLE session;
  // openSpread stamps the tag from opts.ribbon; pushView carries it.
  const pop = extractFn(appSrc, 'popView');
  assert.ok(pop.indexOf('blessTeardownOnPop(') !== -1,
    '(5) popView consults blessTeardownOnPop on every pop');
  ['BLESS.spread = false', 'BLESS.ids = []', 'BLESS.index = 0',
    'BLESS.ribbonOffer = null'].forEach(function (reset) {
    assert.ok(pop.indexOf(reset) !== -1,
      "(5) popView's teardown resets '" + reset +
      "' — queue, scope, spread flag and pending offer all die together");
  });
  const open = extractFn(appSrc, 'openSpread');
  // 26.7-uat: the ribbon is no longer the walk's exclusive mark — the
  // reflection session's spread carries one too (paths + chat) and tags
  // itself opts.session; only a ribbon WITHOUT that tag is the walk.
  assert.ok(/blessWalk:\s*!!\(opts && opts\.ribbon && !opts\.session\)/
    .test(open),
    '(5) openSpread stamps blessWalk from opts.ribbon on non-session ' +
    'spreads — the walk\'s distinctive mark, session spreads excluded');
  const push = extractFn(appSrc, 'pushView');
  assert.ok(push.indexOf('blessWalk') !== -1,
    '(5) pushView carries the blessWalk tag onto the stack entry');
})();

// ---- 6. 26.8-01: the session walk's OWN tag (the sessionSpread lesson) --------
//
// The walk that OPENS the reflection session re-hosts the desk-stack
// spread chassis, so its spreads carry blessWalk AND a distinct
// sessionWalk mark. pushView must carry the tag field-by-field (a
// dropped tag silently disarms its guard — the 26.7-uat beacon lesson),
// and popView's teardown branch must close the walk STAGE (never the
// whole session) exactly when the escaped spread carries the mark while
// the stage is live. blessTeardownOnPop itself stays byte-pure — the
// walk rides its existing decision, it never forks a second one.

(function () {
  const open = extractFn(appSrc, 'openSpread');
  assert.ok(/sessionWalk:\s*!!\(opts && opts\.walk\)/.test(open),
    '(6) openSpread stamps the sessionWalk tag from opts.walk — the ' +
    'session walk\'s own distinct mark');
  const push = extractFn(appSrc, 'pushView');
  assert.ok(push.indexOf('sessionWalk') !== -1,
    '(6) pushView carries the sessionWalk tag onto the stack entry ' +
    '(field-by-field, the sessionSpread lesson)');
  const pop = extractFn(appSrc, 'popView');
  assert.ok(pop.indexOf('popped.sessionWalk === true') !== -1 &&
    pop.indexOf('sessionWalkClose(') !== -1,
    '(6) popView closes the walk STAGE when the escaped spread carries ' +
    'the sessionWalk mark — the session beneath survives the pop');
  assert.ok(pop.indexOf('SESSION.busy') !== -1 &&
    pop.indexOf('SESSION.walkActive') !== -1,
    '(6) the walk-close on pop is guarded by the live session + live ' +
    'stage — a plain 26.5 walk pop touches no session state');
  const show = extractFn(appSrc, 'deskSpreadShow');
  assert.ok(show.indexOf('walk: SESSION.walkSpread === true') !== -1,
    '(6) deskSpreadShow passes the walk opt keyed on the session\'s own ' +
    'walkSpread flag — a plain desk-stack pass stays untagged');
  // blessTeardownOnPop is untouched by 26.8: its body reads only the
  // popped entry + the walk flag (the pure decision the suite drives
  // above), never session state.
  const teardownSrc = extractFn(appSrc, 'blessTeardownOnPop');
  assert.ok(teardownSrc.indexOf('SESSION') === -1,
    '(6) blessTeardownOnPop stays a pure two-argument decision — the ' +
    'session-walk close lives in popView, not here');
})();

console.log('OK test_view_stack.cjs — pure view-stack core (push, D-05 ' +
  'scroll record/restore, one-level pop, empty-stack safety, F8 ' +
  'blessing-session teardown on pop, 26.8 session-walk tag)');
