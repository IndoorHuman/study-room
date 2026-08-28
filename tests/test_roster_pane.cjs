#!/usr/bin/env node
/* test_roster_pane — phase 26.96's own suite. AT WAVE 0 THIS IS THE HARNESS
 * AND THE HARNESS'S OWN INTEGRITY PROOF, AND NOTHING ELSE.
 *
 * WHY IT ASSERTS NOTHING ABOUT THE PANE YET. `renderRosterEditor`,
 * `renderRosterSection`, `rosterWriteFailed`, `rosterConsequence` and
 * `askRouteFor` are created in plans 26.96-02 .. 26.96-05. A suite that
 * asserted product behaviour here would be red for four waves, and a suite
 * that is red for four waves stops being read — which is how a gate dies
 * without anyone deciding to kill it.
 *
 * WHY IT EXISTS AT ALL THIS EARLY. Every later plan in this phase asserts
 * something about a control that guards a person's privacy. If the instrument
 * cannot fail, the assertion is decoration. This project has ~30 recorded
 * instances of the defect landing INSIDE the measuring instrument, and one of
 * them is sitting in the very harness this phase would otherwise reuse:
 *
 * ⛔ THE SHIPPED `thenable` IN tests/test_roster_route_behaviour.cjs HAS A
 *    PASS-THROUGH `.catch` THAT NEVER CALLS ITS HANDLER. Its own comment
 *    admits the scope ("`.catch` is a no-op because nothing here rejects").
 *    That is correct for that file. But reuse it for a FAILURE arm and the
 *    swallowing defect and its fix produce byte-identical output — vacuously
 *    green, forever. Repo-wide there is NO suite that models a promise
 *    rejection at all, so the rejecting stub below is new work and is proven
 *    rather than assumed.
 *
 * THE FIVE ANTI-VACUITY ANSWERS.
 *  (1) Can it pass BEFORE the work is done? No. The file did not exist; the
 *      rejecting stub did not exist anywhere in this repo. There is no
 *      earlier state of the tree in which these cases were green.
 *  (2) Can it still pass once deliberately broken? No. Replacing the
 *      rejecting stub's `.catch` with a pass-through of the SHIPPED shape
 *      turns it red — executed in a scratch copy and recorded verbatim, with
 *      its return code, in 26.96-01-SUMMARY.md. ⛔ The mutation goes to the
 *      scratch copy; the committed file keeps the real stub.
 *  (3) Does a degenerate implementation satisfy it? No. A sloppy stub that
 *      fired BOTH handlers would satisfy "the catch ran" — so the then
 *      counter is asserted to be exactly 0 by value, not merely the catch
 *      counter to be 1. Both numbers are pinned, in the same run.
 *  (4) Is it reading evaluation order or source order? EVALUATION ORDER, and
 *      only that. The counters move if and only if a handler actually runs.
 *      No assertion here reads the text of anything.
 *  (5) Could a grep match the fix's own comment? There is no grep in this
 *      file, so no comment can satisfy any case in it.
 *
 * ⚠ AND THE CONTROL IS WHAT MAKES (2) EVIDENCE. The shipped pass-through
 * thenable is driven in the SAME RUN against the SAME fixture, and its catch
 * counter is asserted to be 0. Without it, "the catch ran" would be a claim
 * about a stub nobody compared to anything.
 *
 * Bare node, zero dependencies (fs/path/assert only), the tests/*.cjs
 * violations[] grammar and exit convention.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const violations = [];

// ---------------------------------------------------------------------------
// The harness, copied from tests/test_roster_route_behaviour.cjs so the later
// waves lift real functions the way that file already proved works.
// ---------------------------------------------------------------------------

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

// ⚠ EVERY GROUP IS WRAPPED, AND THE REASON IS A REAL INCIDENT, TWICE. This
// file lifts shipped functions into a synthetic scope. When one gains a
// collaborator the scope does not provide, the lift throws — and an uncaught
// throw at the FIRST group takes the whole file with it: every later proof
// silently stops being performed while the output blames one undefined name.
// So a throw becomes a LOUD violation and execution continues.
//
// `guarded` takes its sink as a parameter for ONE reason: group (D) below has
// to drive this guard against a deliberately throwing function, and it must be
// able to do so without poisoning the real verdict.
function guarded(label, fn, sink) {
  try {
    fn();
  } catch (e) {
    sink.push('[harness] group ' + label + ' THREW and therefore proved ' +
      'nothing: ' + (e && e.message ? e.message : String(e)) +
      '. ⚠ This is a broken instrument, not a product failure — fix the ' +
      'harness, never the fence, and check what else stopped running.');
  }
}

// ⛔ 26.96-21 (WR-09/WR-14): THE EXECUTED ROSTER, DERIVED FROM THE RUNNER
// ITSELF AND NEVER FROM A LIST OF NAMES TYPED IN THIS FILE.
//
// AN ABSENCE ASSERTION CANNOT TELL *GREEN* FROM *DID NOT RUN*. A group that
// never executed is absent from the violations too — and this wave's evidence
// leans on exactly that reading, in runs where OTHER groups are deliberately
// red: "absentKeyStillDefaults is not among the violations" is worth nothing
// unless absentKeyStillDefaults actually ran. This is the project's
// vacuous-zero class, the one where 7 of 19 checks once passed by looking
// nowhere.
//
// TWO MAPS, NOT ONE, AND THE DIFFERENCE IS LOAD-BEARING. `RAN` counts
// DISPATCH; `FINISHED` counts a group that returned WITHOUT THROWING. A group
// whose collaborator blew up is caught by `guarded` and reported as a broken
// instrument — it is neither green nor silently absent, and only the two
// counts together can say which of the three happened.
const GROUP_ORDER = [];
const RAN = {};
const FINISHED = {};

// The short handle a violation is filed under: '[readFailedCached]' comes from
// the label 'readFailedCached (a failed read …)'. Taken from the label the
// runner was HANDED, so the roster below cannot drift from what the
// violations say.
function groupHandle(label) { return String(label).split(' ')[0]; }

function group(label, fn) {
  const name = groupHandle(label);
  if (!Object.prototype.hasOwnProperty.call(RAN, name)) {
    GROUP_ORDER.push(name);
    RAN[name] = 0;
    FINISHED[name] = 0;
  }
  RAN[name] += 1;
  guarded(label, function () {
    fn();
    FINISHED[name] += 1;             // ← reached only if the group returned
  }, violations);
}

// The recording transport stubs. They push the URL AND the body so a later
// plan can assert WHICH ROUTE actually received the write — the SE-9 question.
// ⛔ A collaborator is LIFTED from real source, never stubbed; only the
// network edge is stubbed.
// ⚠ 26.96-09 (IN-01): this took a `state` parameter it never read. A helper
// that accepts an argument it ignores teaches every later caller that the
// argument matters, and the next reader spends time working out which state it
// is supposed to be. It has exactly one call site and that site now passes
// nothing.
function buildScope() {
  return (
    'function apiGet(u) { CALLS.get.push(u);' +
    '  return TRANSPORT(u, null); }' +
    'function apiPost(u, b) { CALLS.post.push({url:u, body:b});' +
    '  return TRANSPORT(u, b); }'
  );
}

// ---------------------------------------------------------------------------
// THE TWO NEW STUBS. Both are selected EXPLICITLY by each case. ⛔ Nothing
// here ever switches implicitly — the discipline is modelled on
// tests/test_blessings_notebook.cjs's `S.deferred` flag, which exists because
// an implicitly-switched promise stub once hid a real ordering defect.
// ---------------------------------------------------------------------------

// (i) THE SHIPPED PASS-THROUGH — carried here VERBATIM as the CONTROL, and
// never as the instrument. Its `.catch` returns without invoking its handler.
function shippedThenable(value) {
  return {
    then: function (fn) { return shippedThenable(fn(value)); },
    catch: function () { return shippedThenable(value); }
  };
}

// (ii) THE REJECTING STUB — new to this repo. A rejected promise SKIPS the
// fulfilment handler of `.then` entirely and runs the handler of `.catch`.
// That skipping is the behaviour under test, so `.then` must not call its
// argument: a stub that called it would be modelling a resolution and every
// failure-arm proof built on it would be describing the happy path.
function rejectingP(err) {
  const self = {
    then: function () { return self; },          // ⛔ handler NOT invoked
    catch: function (onRejected) {
      onRejected(err);                            // ← the handler actually RUNS
      return shippedThenable(undefined);          // .catch settles the chain
    }
  };
  return self;
}

// (ii-b) THE HELD STUB — 26.96-07, and the repo's FIRST DEFERRED promise
// double. `.then` and `.catch` STORE their handlers and invoke NOTHING; the
// case itself decides when the answer lands, by calling `settle(value)` or
// `reject(err)`.
//
// ⚠⚠ THIS IS THE INSTRUMENT THE PHASE LACKED, AND ITS ABSENCE IS WHY A
// 37-GROUP GREEN SUITE SAT ON TOP OF A PANE THAT ERASES ITS OWN FAILURE LINE.
// `shippedThenable` settles INSIDE `.then`, synchronously, so under it
// `renderRosterSection` claims and satisfies its own read within one turn and
// no interleaving is expressible at all. A defect that only exists between a
// read being issued and that read landing is invisible to a stub with no
// "between".
//
// ⚠ `pending` is asserted TRUE by every case before it acts. A "deferred" stub
// that had quietly resolved would be modelling the happy path, and every
// survival proof built on it would be describing the very sequence it claims
// to rule out.
//
// ⚠ THE CHAIN IS A LIST, NOT ONE SLOT, and that is load-bearing rather than
// tidy. `editVaultRoster` returns `apiPost(…).then(f1).catch(f2)` and its
// CALLER then attaches `.then(f3)` to the same object — a one-slot stub would
// have f3 OVERWRITE f1, so the product's own continuation would never run and
// the case would be driving the test file instead of the app.
//
// The settle semantics mirror the two shipped stubs exactly: on `settle` the
// `then` links run in order and the `catch` links are skipped (shippedThenable);
// on `reject` the `then` links BEFORE the first catch are skipped and the catch
// handler runs (rejectingP). ⛔ Nothing here ever switches implicitly: a case
// selects this stub by name or it never sees it.
function heldThenable() {
  const chain = [];
  let settled = false;
  function seal(v) {
    self.then = function (fn) { return shippedThenable(fn(v)); };
    self.catch = function () { return shippedThenable(v); };
  }
  const self = {
    pending: true,
    then: function (fn) { chain.push({ kind: 'then', fn: fn }); return self; },
    catch: function (fn) { chain.push({ kind: 'catch', fn: fn }); return self; },
    settle: function (value) {
      if (settled) {
        throw new Error('heldThenable: settled twice — a case that settles ' +
          'the same answer again is not modelling anything a promise does');
      }
      settled = true;
      self.pending = false;
      let v = value;
      chain.forEach(function (link) {
        if (link.kind === 'then') { v = link.fn(v); }
      });
      seal(v);
      return v;
    },
    reject: function (err) {
      if (settled) { throw new Error('heldThenable: settled twice'); }
      settled = true;
      self.pending = false;
      let v;
      let caught = false;
      chain.forEach(function (link) {
        if (!caught) {
          if (link.kind === 'catch') { link.fn(err); caught = true; }
          return;                       // ⛔ `then` links before the catch are SKIPPED
        }
        if (link.kind === 'then') { v = link.fn(v); }
      });
      seal(v);
      return v;
    }
  };
  return self;
}

// (iii) THE SWITCHABLE TRANSPORT — returns the REAL answer shape the app's
// post helper produces, `{ ok, status, data }`, flipped per case.
function makeTransport(state) {
  return function (url, body) {
    state.calls.push({ url: url, body: body });
    return state.ok
      ? { ok: true, status: 200, data: state.data || {} }
      : { ok: false, status: state.status || 400,
        data: { error: state.error || 'refused' } };
  };
}

// The fixture the stubs are driven against. ⚠ DELIBERATELY NOT APP CODE: this
// wave is proving the INSTRUMENT, and driving it against a moving target would
// confuse "the stub works" with "the product works".
function driveFixture(promise, counters) {
  promise
    .then(function () { counters.then += 1; })
    .catch(function () { counters.caught += 1; });
}

// ---------------------------------------------------------------------------
// (A) The lifter is real: it lifts a known function and refuses a missing one.
// ---------------------------------------------------------------------------
group('A (extractFn lifts real source and fails loudly on a missing name)',
  function () {
    const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const body = extractFn(appSrc, 'askRouteOf');
    if (body.indexOf('function askRouteOf(') !== 0) {
      violations.push('[instrument] extractFn did not return the lifted ' +
        'function starting at its own signature: ' +
        JSON.stringify(body.slice(0, 40)));
    }
    let open = 0;
    let close = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '{') { open++; }
      if (body[i] === '}') { close++; }
    }
    if (open !== close || open === 0) {
      violations.push('[instrument] the lifted body is not brace-balanced ' +
        '(open=' + open + ' close=' + close + ')');
    }
    // ⚠ A LIFTER THAT RETURNED '' FOR A MISSING NAME WOULD MAKE EVERY LATER
    // WAVE VACUOUSLY GREEN. It must THROW.
    let threw = false;
    try {
      extractFn(appSrc, 'aFunctionThisRepoDoesNotHave_26_96');
    } catch (e) { threw = true; }
    if (!threw) {
      violations.push('[instrument] extractFn did NOT throw on a missing ' +
        'function name — a silent empty lift would make every later ' +
        "wave's proof vacuous");
    }
  });

// ---------------------------------------------------------------------------
// (B) ⚠ THE POINT OF THIS WAVE. The rejecting stub FIRES, by value, against
//     the shipped pass-through as the control in the SAME RUN.
// ---------------------------------------------------------------------------
group('B (the rejecting stub fires; the shipped thenable cannot)',
  function () {
    const rejected = { then: 0, caught: 0 };
    driveFixture(rejectingP(new Error('the write was refused')), rejected);

    if (rejected.caught !== 1) {
      violations.push('[instrument] REJECTING STUB: the catch handler ran ' +
        rejected.caught + ' time(s), expected exactly 1. This stub is the ' +
        "phase's only means of expressing a rejection — if its catch does " +
        'not fire, every failure-arm proof in plans 26.96-02..06 is green ' +
        'on nothing, which is exactly the trap the shipped pass-through ' +
        'thenable set.');
    }
    if (rejected.then !== 0) {
      violations.push('[instrument] REJECTING STUB: the then handler ran ' +
        rejected.then + ' time(s), expected exactly 0. A stub that fires ' +
        'BOTH handlers would satisfy "the catch ran" while modelling a ' +
        'promise that both resolved and rejected — which is why this ' +
        'number is pinned too.');
    }

    // THE CONTROL, in the same run, against the same fixture. This is what
    // makes the two assertions above evidence rather than assertion: the
    // SHIPPED stub demonstrably cannot express the same failure.
    const shipped = { then: 0, caught: 0 };
    driveFixture(shippedThenable({ ok: true }), shipped);

    if (shipped.caught !== 0) {
      violations.push('[instrument] CONTROL: the shipped pass-through ' +
        "thenable's catch handler ran " + shipped.caught + ' time(s), ' +
        'expected exactly 0. If it CAN fire, then the rejecting stub above ' +
        'is not distinguishable from it and this phase did not need a ' +
        'second stub — re-read the control before trusting either.');
    }
    if (shipped.then !== 1) {
      violations.push('[instrument] CONTROL: the shipped thenable resolved ' +
        shipped.then + ' time(s), expected exactly 1 — the control must ' +
        'itself be working, or its silence proves nothing');
    }
  });

// ---------------------------------------------------------------------------
// (C) The switchable transport returns the REAL shape and flips per case.
// ---------------------------------------------------------------------------
group('C (the switchable transport answers { ok, status, data } both ways)',
  function () {
    const okState = { ok: true, calls: [], data: { fenced_roster: [] } };
    const okRes = makeTransport(okState)('/api/librarian/roster',
      { op: 'add', folder: 'Journal' });
    if (okRes.ok !== true || okRes.status !== 200) {
      violations.push('[instrument] the success arm did not answer the real ' +
        'post shape: ' + JSON.stringify(okRes));
    }
    if (!okRes.data || typeof okRes.data !== 'object') {
      violations.push('[instrument] the success arm carried no data object: ' +
        JSON.stringify(okRes));
    }
    if (okState.calls.length !== 1 ||
        okState.calls[0].url !== '/api/librarian/roster' ||
        okState.calls[0].body.op !== 'add') {
      violations.push('[instrument] the transport did not RECORD the url ' +
        'and body — a later plan has to assert which route received the ' +
        'write, and an unrecording stub cannot answer that: ' +
        JSON.stringify(okState.calls));
    }

    // The not-ok arm, selected EXPLICITLY — never by an implicit flip.
    const badState = { ok: false, status: 400, error: 'roster op must be ' +
      "'add' or 'remove'.", calls: [] };
    const badRes = makeTransport(badState)('/api/librarian/roster',
      { op: 'nonsense', folder: 'Journal' });
    if (badRes.ok !== false || badRes.status !== 400) {
      violations.push('[instrument] the not-ok arm did not answer a ' +
        '400-shaped refusal: ' + JSON.stringify(badRes));
    }
    if (!badRes.data || !badRes.data.error) {
      violations.push('[instrument] the not-ok arm carried no error text — ' +
        "the app's errorText reads res.data.error, so a refusal with no " +
        'error field cannot drive the failure copy: ' + JSON.stringify(badRes));
    }
    // The two arms must actually DIFFER, or the flip is decoration.
    if (okRes.ok === badRes.ok || okRes.status === badRes.status) {
      violations.push('[instrument] the two transport arms are ' +
        'indistinguishable (ok ' + okRes.ok + '/' + badRes.ok + ', status ' +
        okRes.status + '/' + badRes.status + ') — a switch that does not ' +
        'switch would let a failure-arm case pass on the success answer');
    }
    // The scope builder is exercised so a later wave inherits a proven string.
    const scope = buildScope();
    if (scope.indexOf('CALLS.post.push') === -1 ||
        scope.indexOf('CALLS.get.push') === -1) {
      violations.push('[instrument] the recording scope lost its url/body ' +
        'recorders: ' + JSON.stringify(scope.slice(0, 60)));
    }
  });

// ---------------------------------------------------------------------------
// (D) The throw-guard REPORTS a broken instrument instead of silently
//     cancelling every later proof. Driven against its own local sink so the
//     drive cannot poison the real verdict.
// ---------------------------------------------------------------------------
group('D (a throwing group is reported, and execution continues)',
  function () {
    const sink = [];
    let after = 0;
    guarded('a deliberately throwing group', function () {
      throw new ReferenceError('someCollaborator is not defined');
    }, sink);
    after += 1;                       // ← reached only if the guard caught
    if (sink.length !== 1) {
      violations.push('[instrument] the throw-guard recorded ' + sink.length +
        ' violation(s) for one throwing group, expected exactly 1');
    }
    if (sink.length && sink[0].indexOf('someCollaborator is not defined') === -1) {
      violations.push('[instrument] the throw-guard swallowed the reason: ' +
        JSON.stringify(sink[0]));
    }
    if (after !== 1) {
      violations.push('[instrument] execution did NOT continue past a ' +
        'throwing group — which is the whole incident this guard exists for');
    }
  });

// ===========================================================================
// 26.96-02 WAVE 2 — THE PANE ITSELF. Everything above proves the instrument;
// everything below DRIVES the product through it.
// ===========================================================================

const APP_SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');

// ⛔ THE ESCAPERS ARE LIFTED FROM core.js, NEVER STUBBED. app.js's own
// escapeHtml/escapeAttr are one-line proxies into StudyCore, so lifting THEM
// would import a name this synthetic scope cannot resolve — and stubbing
// either one would make the injection case below vacuously green, which is
// the exact class of failure this project keeps re-learning.
const ESCAPERS = extractFn(CORE_SRC, 'escapeHtml') + '\n' +
  extractFn(CORE_SRC, 'escapeAttr') + '\n';

// ---------------------------------------------------------------------------
// THE ONE SPELLING OF THE ONE-LITERAL RULE (26.96-09, IN-03).
//
// How many times `value` appears in `src` as a WHOLE quoted string literal —
// counting all three quote characters JavaScript has.
//
// ⚠⚠ WHY THIS MATTERS MORE THAN IT LOOKS. Two gates enforce the one-literal
// rule for the pane name: `copyBytes` and `routeOneSource`. Until this plan
// `copyBytes` counted `'…'` ONLY, while `routeOneSource` counted all three —
// so a SECOND literal typed with double quotes would have been caught by one
// gate and missed by the other. That is the same defect the gates are
// themselves enforcing about copy: one rule, two spellings, agreeing today.
// They now share this helper, and `routeOneSource` asserts they report the
// SAME NUMBER BY VALUE in the same run.
//
// ⛔ It lives HERE, above its first use, and not beside `routeOneSource` where
// it was written. It worked there only by function-declaration hoisting, and a
// gate that depends on hoisting turns into a ReferenceError the moment someone
// reorders the file — which the throw-guard would then report as a broken
// instrument rather than as a product failure.
// ---------------------------------------------------------------------------
function quotedLiteralCount(src, value) {
  let n = 0;
  ['\'', '"', '`'].forEach(function (q) {
    n += src.split(q + value + q).length - 1;
  });
  return n;
}

// What each gate actually saw, so the agreement can be asserted rather than
// assumed. ⛔ Recorded by value at the moment of counting.
const ONE_LITERAL_SEEN = {};
function recordQuotedCount(who, n) { ONE_LITERAL_SEEN[who] = n; }

// The registry is an ARRAY, not a function, so the brace-balanced lifter
// cannot find it. ⚠ Slice it deliberately and refuse a failed slice loudly:
// a silently-empty parse would turn every placement assertion below into a
// pass over nothing.
function liftArray(src, decl) {
  const start = src.indexOf(decl);
  assert.notStrictEqual(start, -1, decl + ' must exist in app.js — not found');
  let i = src.indexOf('[', start);
  let depth = 0;
  let j;
  for (j = i; j < src.length; j++) {
    if (src[j] === '[') { depth++; }
    else if (src[j] === ']') { depth--; if (depth === 0) { j++; break; } }
  }
  assert.ok(depth === 0, decl + "'s brackets must balance");
  return src.slice(i, j);
}

const REGISTRY_SRC = liftArray(APP_SRC, 'var MANAGE_PANES = [');
const DEFAULT_ROSTER_SRC = liftArray(APP_SRC, 'var VAULT_DEFAULT_ROSTER = [');

// ---------------------------------------------------------------------------
// 26.96-10: THE READ-FAILED SENTENCE'S ONE SEAT, LIFTED AS SOURCE.
//
// ✅ CORRECTED 2026-08-20 BY 26.96-13. The paragraph below said this seat
// "ships as the EMPTY STRING" and that an agent "may never choose one". Both
// were true when they were written and both are now superseded: SHE RULED B1
// at the owner sitting of 2026-08-20 and the constant holds her sentence. ⛔
// The sentences are corrected rather than deleted — this file's discipline is
// to record that a thing was said, then say what changed it.
//
// ⛔ WHAT HAS NOT CHANGED, AND IS THE WHOLE REASON THIS SEAT EXISTS. When the
// pane cannot read her list it must not state a protection it has not read.
// That subtraction still ships and every gate on it below is untouched.
//
// ⚠ WHY THIS IS LIFTED AND NOT PINNED **HERE**. A gate reading the same
// constant the renderer reads would certify an agent's edit of her sentence
// as correct, so this lift is for RUNNING the scope, never for asserting her
// bytes. Her bytes are pinned against `26.96-DECISIONS.md` in two places, both
// pointing at her record and never at the constant: tests/test_roster_ruled_
// copy.cjs (the shipped constant) and `ruledSlotBytes` below (what the pane
// actually PUTS ON SCREEN). The behaviour gate below keeps its own job —
// an EMPTY value emits no element at all, a NON-empty one really renders.
const UNREAD_LINE_SRC = (function () {
  const m = /var ROSTER_UNREAD_LINE\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/
    .exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: ROSTER_UNREAD_LINE is not declared as ' +
      'a plain string literal in app.js — the read-failed sentence must have ' +
      'exactly ONE named seat, settable without a rebuild');
  }
  return m[1];
})();
const UNREAD_LINE = new Function('return ' + UNREAD_LINE_SRC + ';')();

// ---------------------------------------------------------------------------
// 26.96-11: THE FUTURE-ONLY ADD SENTENCE'S ONE SEAT, LIFTED AS SOURCE.
//
// ✅ CORRECTED 2026-08-20 BY 26.96-13, the same correction as the seat above
// and for the same reason. This block said the sentence "ships EMPTY" and that
// an agent "may NEVER choose one". SHE RULED A1 at the owner sitting of
// 2026-08-20 and the constant holds her words. ⛔ The old sentences are
// corrected, not erased.
//
// ⛔ WHAT HAS NOT CHANGED. When the route says its retroactive pass was NOT
// applicable, C3 is false and may not be said. That subtraction still ships;
// what fills the silence is now hers.
//
// ⚠ LIFTED TO RUN, NEVER TO ASSERT HER BYTES AGAINST — exactly as
// ROSTER_UNREAD_LINE is, and for exactly the same reason. C3 itself is pinned
// in this file against 26.96-COPY.md (`const C3`), never against the constant
// the renderer reads; A1's bytes are pinned against `26.96-DECISIONS.md` in
// `ruledSlotBytes` below and in tests/test_roster_ruled_copy.cjs.
// ⚠⚠ THE GROUPS BELOW DO COMPARE THE RENDERED OUTPUT AGAINST THIS LIFTED
// VALUE (`addFutureOnly`, `addUnknownFailsClosed`), and on its own that would
// be a MIRROR — an agent's edit of the constant would move the expectation
// with it. It is not on its own: `ruledSlotBytes` compares the SAME rendered
// slot against her record, so an edited constant is caught there. ⛔ Do not
// delete `ruledSlotBytes` on the grounds that these groups already check the
// sentence. They check that the RIGHT ARM speaks; it checks that what is
// spoken is HERS.
const ADD_FUTURE_ONLY_SRC = (function () {
  const m =
    /var ROSTER_ADD_FUTURE_ONLY\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/
      .exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: ROSTER_ADD_FUTURE_ONLY is not ' +
      'declared as a plain string literal in app.js — the future-only add ' +
      'sentence must have exactly ONE named seat, settable without a rebuild');
  }
  return m[1];
})();
const ADD_FUTURE_ONLY = new Function('return ' + ADD_FUTURE_ONLY_SRC + ';')();

// ---------------------------------------------------------------------------
// 26.995-31: THE REMOVAL SCOPE SEAT (her W-7, ruled 2026-08-22), carried in
// for exactly the reason every seat above is — `rosterScopeLine` reads it, and
// a scope without it throws `ROSTER_REMOVE_FUTURE_ONLY is not defined` INSIDE
// a lifted body, which stops whole groups being performed while the file
// still reports something. ⛔ That failure has happened on this file twice
// (`ROSTER_CHOICES_ANSWERED`, 61 groups; `ROSTER_ADD_NAME_UNKNOWN`, a whole
// branch) and both times it was found by READING THE HARNESS'S OWN LOUD LINE,
// never by an exit status.
//
// ⛔ LIFTED TO RUN, NEVER TO ASSERT HER BYTES AGAINST. What proves this
// sentence is hers is `tests/test_roster_removal_scope_reaches_her.cjs`, which
// reads her record in the planning vault and then reads the RENDERED surface —
// both doors. Nothing here may become a second opinion about her wording.
const REMOVE_FUTURE_ONLY_SRC = (function () {
  const m =
    /var ROSTER_REMOVE_FUTURE_ONLY\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/
      .exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: ROSTER_REMOVE_FUTURE_ONLY is not ' +
      'declared as a plain string literal in app.js — her removal-scope ' +
      'sentence must have exactly ONE named seat, read by BOTH removal doors, ' +
      'and settable without a rebuild');
  }
  return m[1];
})();

// ---------------------------------------------------------------------------
// 26.96-13: THE THIRD SEAT — the sentence for a name the room found nothing
// under (F-7). She ruled N2 at the owner sitting of 2026-08-20.
//
// ⚠⚠ IT WAS MISSING FROM THE LIFTED SCOPE ENTIRELY UNTIL NOW, and that is
// worth recording rather than quietly fixing: `rosterSentence` has read a
// third constant since the F-7 fix landed, this suite never declared it, and
// so the whole `known === false` branch — the arm that says her third ruled
// sentence — could not be driven here at all. Nothing anywhere else drove it
// either (measured 2026-08-20 across every test in the tree). A sentence she
// ruled had no behavioural gate; `ruledSlotBytes` at the foot of this file is
// the gate, and this lift is what lets it run.
//
// ⛔ LIFTED TO RUN, NEVER TO ASSERT HER BYTES AGAINST — the same rule as the
// two seats above.
const ADD_NAME_UNKNOWN_SRC = (function () {
  const m =
    /var ROSTER_ADD_NAME_UNKNOWN\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/
      .exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: ROSTER_ADD_NAME_UNKNOWN is not ' +
      'declared as a plain string literal in app.js — the name-unknown add ' +
      'sentence must have exactly ONE named seat, settable without a rebuild');
  }
  return m[1];
})();

// ---------------------------------------------------------------------------
// 26.96-27: THE PICKER'S TWO SEATS. Her S-1 and S-5, chosen at the copy
// sitting of 2026-08-22.
//
// ⛔ BOTH ARE TIER 2 — APPROVED AS SHOWN. An orchestrator wrote each question
// and each option label and she picked one; she typed no prose and wrote no
// sentence. ⛔ No comment or message may call either a sentence she wrote cold.
//
// ⛔ LIFTED TO RUN, NEVER TO ASSERT HER BYTES AGAINST — exactly as the three
// seats above are, and for exactly the same reason. `pickerCopyBytes` below
// compares the RENDERED lines against pins taken from `26.96-COPY-ROUND3.md`,
// never against these constants: a gate reading the same constant the renderer
// reads would certify an agent's edit of her sentence as correct.
function pickerSeatSrc(name) {
  const re = new RegExp('var ' + name +
    '\\s*=\\s*(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*")\\s*;');
  const m = re.exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: ' + name + ' is not declared as a ' +
      'plain string literal in app.js — each picker sentence must have ' +
      'exactly ONE named seat, settable without a rebuild');
  }
  return m[1];
}
const PICKER_LEAD_SRC = pickerSeatSrc('ROSTER_PICKER_LEAD');
const PICKER_REACH_SRC = pickerSeatSrc('ROSTER_PICKER_REACH');
// ⛔ 26.96-28: her S-3 seat, under the same rule as the two above — LIFTED TO
// RUN, never so an assertion can read her wording out of the renderer's own
// constant. `pickerNoMatch` pins the rendered line against her RECORD.
const PICKER_NO_MATCH_SRC = pickerSeatSrc('ROSTER_PICKER_NO_MATCH');
// ⛔ 26.96-29 — her Ruling Q of 2026-08-22. Lifted TO RUN only; the byte
// comparison in `emptyVaultSaysSo` reads her record, never this.
const PICKER_NONE_SRC = pickerSeatSrc('ROSTER_PICKER_NONE');

// ⛔ THE DEFAULT OFFERED LIST EVERY SCOPE CARRIES, and it is NESTED on
// purpose. A top-level fixture passes the path-not-leaf assertion either way,
// so it can never fail it and proves nothing. ⚠ DIGIT-FREE on purpose too:
// `noCount` reads the pane's whole rendered output and a digit in a fixture
// name would redden a gate about HER counts on the instrument's own choice.
const PICKER_CHOICES = [['Clippings'], ['Clippings', 'journal'],
  ['Clippings', 'journal', 'chatgpt']];
// The nested entry, and the string the picker must emit for it.
const PICKER_NESTED = ['Clippings', 'journal', 'chatgpt'];
const PICKER_NESTED_PATH = 'Clippings/journal/chatgpt';

// ---------------------------------------------------------------------------
// 26.96-10 (WR-05): HER FRAMING SENTENCE'S ONE SOURCE, AND (IN-02) THE
// CROSS-HOST SHAPE, both carried in AS SOURCE so the scope can run.
//
// ⛔ LIFTED TO RUN, NEVER TO ASSERT AGAINST. `framingOneSource` below compares
// the RENDERED lines against C2 — the pin taken from 26.96-COPY.md — and never
// against `ROSTER_FRAMING`. A gate reading the same constant the renderer
// reads would certify an agent's edit of her sentence as correct, which is the
// one direction this project bans for owner copy.
const FRAMING_SRC = (function () {
  const m = /var ROSTER_FRAMING =([\s\S]*?);\n/.exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: ROSTER_FRAMING is not declared in ' +
      'app.js — her framing sentence must have exactly ONE source');
  }
  return m[1];
})();
// ⚠ IN-02: lifted rather than stubbed, so the shape the cases read is the
// PRODUCT'S shape. A hand-written stub carrying a `roster` slot would make
// "nothing writes VAULT_IMPORT.roster" unfalsifiable in the wrong direction —
// the property would exist whether the product wrote it or not.
const VAULT_IMPORT_SRC = (function () {
  const m = /var VAULT_IMPORT = \{[^}]*\};/.exec(APP_SRC);
  if (!m) {
    throw new Error('test_roster_pane: VAULT_IMPORT is not declared as a ' +
      'plain object literal in app.js');
  }
  return m[0];
})();

// ---------------------------------------------------------------------------
// THE CONTAINER DOUBLE. ⚠ IT IS A SEAM, NOT A STUB OF THE THING UNDER TEST:
// what it captures IS the rendered output, byte for byte as the renderer
// produced it. A double that swallowed the markup and answered an empty
// control list would make every case below green while proving nothing — so
// every rendering group asserts, BY VALUE, that the captured markup is
// non-empty, that it carries each expected folder name, and that the number
// of controls actually bound equals the roster length.
// ---------------------------------------------------------------------------

// ⚠ The attribute scanner tolerates '>' INSIDE a quoted value. escapeAttr
// escapes & " ' but NOT < or > — which is correct for a quoted attribute in
// real HTML, and would silently break a naive /[^>]*/ scan on exactly the
// injection fixture this file plants.
function scanTags(html) {
  const out = [];
  const re = /<(button|input)((?:[^>"]|"[^"]*")*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = {};
    const are = /([a-zA-Z-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[2])) !== null) { attrs[a[1]] = a[2]; }
    out.push({ tag: m[1], attrs: attrs });
  }
  return out;
}

function makeControl(spec, box) {
  const el = {
    tag: spec.tag,
    attrs: spec.attrs,
    value: '',
    handlers: [],
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(el.attrs, k) ?
        el.attrs[k] : null;
    },
    addEventListener: function (ev, fn) { el.handlers.push({ ev: ev, fn: fn }); },
    fire: function () {
      el.handlers.forEach(function (h) { if (h.ev === 'click') { h.fn(); } });
    },
    // ⚠ 26.96-28: TYPING, MODELLED AS THE TWO THINGS A KEYSTROKE REALLY DOES
    // — the field's value changes AND an `input` event fires. Her D-B ruling
    // is ONE BOX: the same field she types a folder name into is the one that
    // narrows the offered list, so a case that only assigned `.value` would
    // be driving a product nobody typed into. ⛔ Additive: `fire` is
    // untouched and still means a click, so no earlier case changes.
    type: function (v) {
      el.value = String(v == null ? '' : v);
      el.handlers.forEach(function (h) { if (h.ev === 'input') { h.fn(); } });
    }
  };
  box.bound.push(el);
  return el;
}

function classOf(sel) { return sel.charAt(0) === '.' ? sel.slice(1) : sel; }

// ⚠ 26.96-03: THE CLASSES THE DOUBLE TREATS AS CHILD CONTAINERS RATHER THAN
// CONTROLS. `scanTags` only ever matches <button> and <input>, so a <div> slot
// is invisible to it. `.vault-roster-note` is the slot a failed write speaks
// into — declared by the seam in BOTH hosts — and without it here every
// failure-arm case below would be asserting against a null and would pass on
// a product that says nothing at all.
//
// ⚠ 26.96-04 adds `.vault-roster-note`'s sibling: `.vault-roster-consequence`,
// the slot the consequence sentence is written into, emitted by the seam in
// the position of the element she acted on. It is a <div> for the same reason
// the note slot is, and it is invisible to `scanTags` for the same reason.
// ⛔ Adding it here does NOT change any earlier group: `querySelector` hands
// back a child container only when the parent's markup actually carries the
// class, and before this wave's product change no render ever emitted it.
//
// ⚠⚠ 26.96-28 adds a THIRD: `.vault-roster-choices`, the box the offered
// folder names live in. Her D-B ruling is that typing NARROWS that list, and
// a list that narrows is a list that is REPAINTED — but repainting the whole
// editor would destroy the very field she is typing into, so the renderer
// repaints the choices box alone. That box therefore stops being a passive
// <div> in the editor's own markup and becomes a container somebody writes
// into, which is exactly what this list is for.
// ⛔ IT DOES NOT LOOSEN ANY EARLIER GROUP. `rendered()` already walks child
// containers, so every copy, hard-negative and host-coverage assertion still
// sees the offered rows; what changes is only WHERE the double keeps them.
const CONTAINER_CLASSES = ['vault-roster-editor', 'vault-roster-note',
  'vault-roster-consequence', 'vault-roster-choices'];

function makeBox(id) {
  let html = '';
  let gen = 0;                     // bumped on every repaint
  const cache = {};
  const box = {
    id: id,
    bound: [],          // every control double this box has ever handed out
    kids: {},           // child CONTAINERS, kept so a repaint reaches the same one
    // ⚠ 26.96-03: HOW MANY TIMES SOMEBODY WROTE INTO THIS CONTAINER. A
    // parent's repaint RESETS a child rather than writing to it, so this
    // counter answers a question emptiness cannot: did the failure renderer
    // RUN? An implementation that called it on every write and then repainted
    // over the sentence would leave an empty note slot and satisfy any
    // "no failure line is showing" check — this refuses it.
    writes: 0,
    reset: function () {
      html = '';
      gen += 1;
      Object.keys(box.kids).forEach(function (k) { box.kids[k].reset(); });
    },
    // ⚠⚠ CONTROLS ARE CACHED PER REPAINT, AND THAT IS LOAD-BEARING, NOT AN
    // OPTIMISATION. A double that minted FRESH control objects on every query
    // would hand the test a button with NO handlers on it — the renderer
    // having bound its listeners to a different object — and every drive
    // below would record zero writes while the product was working. That is
    // the instrument silently reporting a defect that is not there, which is
    // the same family as an instrument silently reporting success.
    querySelectorAll: function (sel) {
      const key = gen + '|' + sel;
      if (!cache[key]) {
        const want = classOf(sel);
        cache[key] = scanTags(html)
          .filter(function (t) {
            return (t.attrs['class'] || '').split(/\s+/).indexOf(want) !== -1;
          })
          .map(function (t) { return makeControl(t, box); });
      }
      return cache[key];
    },
    querySelector: function (sel) {
      const want = classOf(sel);
      // A child CONTAINER (the pane's editor slot, and from 26.96-03 the
      // failure note slot) is persistent across repaints: a repaint must
      // reach the same object, or P-4 would read a container nobody ever
      // painted.
      if (CONTAINER_CLASSES.indexOf(want) !== -1 &&
          html.indexOf('class="' + want + '"') !== -1) {
        if (!box.kids[want]) { box.kids[want] = makeBox(id + '>' + want); }
        return box.kids[want];
      }
      const all = box.querySelectorAll(sel);
      return all.length ? all[0] : null;
    }
  };
  Object.defineProperty(box, 'innerHTML', {
    get: function () { return html; },
    // ⚠ 26.96-03: A REPAINT RE-EMITS ITS CHILD CONTAINERS EMPTY, and the
    // double must model that. Without it a failure line written into the note
    // slot would survive a repaint that, in a real browser, replaced the very
    // element it lived in — an instrument reporting a sentence that is no
    // longer on screen, which is the same family of lie this plan exists to
    // fix in the product.
    set: function (v) {
      html = String(v);
      gen += 1;
      box.writes += 1;
      Object.keys(box.kids).forEach(function (k) { box.kids[k].reset(); });
    }
  });
  return box;
}

// ⚠ "NO LIVE TAG" IS NOT "NO SUBSTRING". escapeAttr escapes & " and ' but
// deliberately NOT < or > — which is correct, because a DOUBLE-QUOTED
// attribute value may legally contain them and the browser never starts a
// tag there. The real safety property is that the quote cannot be broken
// out of. So this strips every quoted attribute value first, and only then
// asks whether a tag survived. A naive substring check would report the
// SHIPPED, SAFE output as an injection.
// ⚠ 26.96-28: THE ATTRIBUTE DECODER, ONE SPELLING, MODULE LEVEL. It undoes
// ONLY the entity encoding `escapeAttr` is supposed to have applied, so a
// reader gets the folder name back exactly as a browser would read it out of
// a quoted value. ⛔ It was local to `attr-breakout` until this wave, and a
// second reader that skipped it read `medical &amp; health notes` for one of
// HER OWN SIX and reported it missing — this project already carries the
// lesson that one rule with two spellings is how a gate goes blind.
function decodeAttr(v) {
  return String(v).replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripQuotedValues(html) {
  return html.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

// The DOM edge. ⛔ Only the EDGE is stubbed — every collaborator that is app
// code is lifted from app.js below.
function makeDom() {
  const boxes = {};
  const dom = function (id) {
    if (!boxes[id]) { boxes[id] = makeBox(id); }
    return boxes[id];
  };
  dom.boxes = boxes;
  return dom;
}

// Builds the scope both hosts run inside. Nothing here stubs a renderer.
// ⚠ 26.96-27: `choices` is the SECOND, OPTIONAL parameter and it defaults to
// the nested fixture, so every existing drive in this file renders the picker
// exactly as a real pane does. ⛔ THAT DEFAULT IS LOAD-BEARING, NOT
// CONVENIENCE: `hostCoverage`'s own drives are what must go RED when the
// picker's markup is moved to a host's call site, and a scope whose picker
// offered nothing would emit no control there to move — the signature defect
// of this project would be invisible to the gate that exists for it.
// A case that wants to drive the ENUMERATION itself passes `[]` and calls
// `loadChoices`.
function rosterScope(transport, choices) {
  const calls = { get: [], post: [] };
  const dom = makeDom();
  const src =
    'var MANAGE = { meta: {}, items: {} };' +
    VAULT_IMPORT_SRC +
    'function apiGet(u) { CALLS.get.push(u); return TRANSPORT(u, null); }' +
    'function apiPost(u, b) { CALLS.post.push({ url: u, body: b });' +
    '  return TRANSPORT(u, b); }' +
    'function $(id) { return DOM(id); }' +
    ESCAPERS +
    'var MANAGE_PANES = ' + REGISTRY_SRC + ';' +
    'var VAULT_DEFAULT_ROSTER = ' + DEFAULT_ROSTER_SRC + ';' +
    // ⛔ 26.96-10: the read-failed sentence's seat, carried in as SOURCE like
    // the default roster beside it. It is a `var`, not a function, so it is
    // declared here rather than lifted through extractFn.
    'var ROSTER_UNREAD_LINE = ' + UNREAD_LINE_SRC + ';' +
    // ⛔ 26.96-10 (WR-05): her framing sentence's ONE source, carried in as
    // source for the same reason. ⛔ Never asserted against — see the lift.
    'var ROSTER_FRAMING =' + FRAMING_SRC + ';' +
    // ⛔ 26.96-11: the future-only add sentence's seat, same treatment. It
    // ships EMPTY and is carried in so `rosterSentence` can run — ⛔ never so
    // any assertion can read her wording out of the renderer's own constant.
    'var ROSTER_ADD_FUTURE_ONLY = ' + ADD_FUTURE_ONLY_SRC + ';' +
    // ⛔ 26.96-13: the third seat (F-7, her N2). Carried in for the same
    // reason and under the same prohibition — without it `rosterSentence`
    // THROWS on the known===false arm rather than saying her sentence, which
    // is how this omission was found.
    'var ROSTER_ADD_NAME_UNKNOWN = ' + ADD_NAME_UNKNOWN_SRC + ';' +
    // ⛔ 26.995-31: her removal-scope seat (W-7), carried in under the same
    // rule as every seat above — lifted TO RUN, ⛔ never so an assertion can
    // read her wording out of the renderer's own constant. Without it
    // `rosterScopeLine` throws and every group that drives a REMOVE stops
    // being performed.
    'var ROSTER_REMOVE_FUTURE_ONLY = ' + REMOVE_FUTURE_ONLY_SRC + ';' +
    // ⛔ 26.96-27: the picker's two seats and its offered list, carried in
    // under the same rule as every seat above — lifted TO RUN, never so an
    // assertion can read her wording out of the renderer's own constant.
    'var ROSTER_PICKER_LEAD = ' + PICKER_LEAD_SRC + ';' +
    'var ROSTER_PICKER_REACH = ' + PICKER_REACH_SRC + ';' +
    'var ROSTER_PICKER_NO_MATCH = ' + PICKER_NO_MATCH_SRC + ';' +
    'var ROSTER_FOLDER_CHOICES = ' +
      JSON.stringify(choices === undefined ? PICKER_CHOICES : choices) + ';' +
    // ⛔ 26.96-29: her Ruling-Q seat, carried in under the same rule as every
    // seat above — lifted TO RUN, ⛔ never so an assertion can read her
    // wording out of the renderer's own constant. `emptyVaultSaysSo` reads
    // her chosen bytes out of 26.96-DECISIONS.md instead.
    'var ROSTER_PICKER_NONE = ' + PICKER_NONE_SRC + ';' +
    'var ROSTER_CHOICES_INFLIGHT = false;' +
    // ⛔⛔ 26.96-29: THE TRI-STATE. Without this the whole file THREW
    // `ROSTER_CHOICES_ANSWERED is not defined` and 61 groups stopped being
    // performed — found by reading the harness's own loud line, not by an
    // exit status. It starts FALSE in every scope, which is the room not yet
    // having found out; a case that wants "the room asked and the answer was
    // none" drives the route rather than setting this by hand.
    'var ROSTER_CHOICES_ANSWERED = false;' +
    // ⛔ 26.96-07: the paint claim's counter and its two helpers are LIFTED
    // from real source like every other collaborator. The counter itself is a
    // `var`, not a function, so it is declared here — fresh per scope, which
    // is what keeps each case's claim sequence its own.
    'var ROSTER_PAINT = 0;' +
    extractFn(APP_SRC, 'rosterPaintClaim') + '\n' +
    extractFn(APP_SRC, 'rosterPaintCurrent') + '\n' +
    extractFn(APP_SRC, 'managePaneLabel') + '\n' +
    extractFn(APP_SRC, 'renderRosterEditor') + '\n' +
    extractFn(APP_SRC, 'renderRosterHosts') + '\n' +
    // ⛔ 26.96-27: LIFTED FROM REAL SOURCE, NEVER STUBBED. `rosterFolderPath`
    // is what decides that a picked entry is a PATH FROM THE VAULT ROOT and
    // carries NO TRAILING SEPARATOR — the two properties plants 2 and 3 make
    // red — so a stub here would be the suite asserting against its own words.
    extractFn(APP_SRC, 'rosterFolderPath') + '\n' +
    // ⛔⛔ 26.96-32: THE TWO NEW MODULE-LEVEL FUNCTIONS THE LOADER NOW
    // CALLS. `loadRosterFolderChoices` reaches `repaintRosterChoices`, which
    // reaches `paintRosterChoices` — so a scope without both throws
    // `… is not defined` INSIDE the lifted body and every group that drives
    // the enumeration silently stops being performed. ⛔ That exact failure
    // has happened on this file before (`ROSTER_CHOICES_ANSWERED`, 61
    // groups) and was found by reading the harness's own loud line, never by
    // an exit status.
    extractFn(APP_SRC, 'paintRosterChoices') + '\n' +
    extractFn(APP_SRC, 'repaintRosterChoices') + '\n' +
    extractFn(APP_SRC, 'loadRosterFolderChoices') + '\n' +
    // ⛔ LIFTED FROM REAL SOURCE, NEVER STUBBED. A stub here would render
    // whatever this file told it to and every failure-arm case below would be
    // asserting against the test's own words instead of the product's.
    extractFn(APP_SRC, 'rosterWriteFailed') + '\n' +
    // ⛔ 26.96-04's two, LIFTED FROM REAL SOURCE like every other collaborator.
    // A stub for either would render this file's own words instead of the
    // product's, and the whole consolidated copy gate would then be asserting
    // that the test agrees with itself.
    extractFn(APP_SRC, 'rosterSentence') + '\n' +
    // ⛔ 26.995-31: the SCOPE half of a removal, LIFTED FROM REAL SOURCE like
    // its two neighbours. The producer calls it on every roster write, so a
    // scope without it throws `rosterScopeLine is not defined` inside
    // `editVaultRoster` and every group that drives a write stops proving
    // anything at all — measured, not imagined: that is exactly how this
    // omission was found.
    extractFn(APP_SRC, 'rosterScopeLine') + '\n' +
    extractFn(APP_SRC, 'rosterConsequence') + '\n' +
    extractFn(APP_SRC, 'renderVaultImportScreen') + '\n' +
    extractFn(APP_SRC, 'editVaultRoster') + '\n' +
    extractFn(APP_SRC, 'renderRosterSection') + '\n' +
    // ⚠ 26.96-07 exposes renderRosterHosts so a case can call it DIRECTLY —
    // which is what a second call site added later would do, and the only way
    // to drive its own claim rather than editVaultRoster's.
    'return { editor: renderRosterEditor, pane: renderRosterSection,' +
    '  imp: renderVaultImportScreen, hosts: renderRosterHosts,' +
    // ⚠ 26.96-10 (IN-02): the cross-host object itself, handed back so a case
    // can read it BY VALUE after driving a Manage-pane edit through it.
    '  failed: rosterWriteFailed, MANAGE: MANAGE,' +
    // ⛔ 26.96-27: the enumeration's own two members, handed back so a case
    // can drive the wire end to end, and a READER for the offered list so the
    // answer that really landed is read BY VALUE rather than inferred from
    // what the pane happened to paint.
    '  folderPath: rosterFolderPath,' +
    '  loadChoices: loadRosterFolderChoices,' +
    '  offered: function () { return ROSTER_FOLDER_CHOICES; },' +
    '  VAULT_IMPORT: VAULT_IMPORT };';
  const api = new Function('CALLS', 'DOM', 'TRANSPORT', src)(
    calls, dom, transport);
  return { calls: calls, dom: dom, api: api };
}

// A resolve-only transport that answers the REAL post shape through the
// SHIPPED pass-through thenable. ⚠ Deliberately the shipped stub and not the
// rejecting one: every case in this wave drives a SUCCESSFUL write, and the
// rejecting stub is 26.96-03's instrument. Using it here would model a
// failure nothing in this plan claims to handle yet.
function answering(fencedRoster) {
  return function (url, body) {
    if (url === '/api/items') {
      return shippedThenable({ ok: true, status: 200,
        data: { meta: { fenced_roster: fencedRoster } } });
    }
    return shippedThenable({ ok: true, status: 200,
      data: { fenced_roster: fencedRoster } });
  };
}

const R3 = ['Journal', 'personnel notes', 'appraisal record'];

// Renders the roster through HOST B (the Manage pane) and hands back the
// pane box, its editor child, and the recorded calls.
// ⚠ 26.96-27 adds the optional THIRD parameter, `choices` — the list the
// picker offers. It defaults (via `rosterScope`) to the nested fixture, so
// every existing caller is byte-unchanged in behaviour.
function drivePane(roster, transport, choices) {
  const s = rosterScope(transport || answering(roster), choices);
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  return { s: s, box: box, editor: box.kids['vault-roster-editor'] || null };
}

// Renders the SAME roster through HOST A (the pre-import disclosure screen).
function driveImport(roster, transport) {
  const s = rosterScope(transport || answering(roster));
  s.api.imp({ fenced_roster: roster });
  return { s: s, editor: s.dom('vault-roster-card') };
}

function nonEmptyNamed(where, markup, names) {
  if (!markup || markup.length === 0) {
    violations.push('[' + where + '] the captured editor markup is EMPTY. ' +
      'A renderer that produced nothing would satisfy a naive byte-equality ' +
      'comparison between the two hosts — this assertion is what refuses ' +
      'that degenerate pass.');
    return;
  }
  names.forEach(function (n) {
    if (markup.indexOf(n) === -1) {
      violations.push('[' + where + '] the captured markup does not carry ' +
        'the folder name ' + JSON.stringify(n) + ' BY VALUE: ' +
        JSON.stringify(markup.slice(0, 160)));
    }
  });
}

// ---------------------------------------------------------------------------
// (P-1) THE ROUTE THE FENCE OWNS IS THE ONE THAT RECEIVES THE WRITE.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? No — renderRosterSection did not
//      exist, and extractFn THROWS on a missing name, so the group would be
//      reported as a broken instrument rather than quietly passing.
//  (2) Can it still pass once deliberately broken? No — repointing the pane's
//      write at the metadata route was executed in a scratch copy of app.js
//      and turned this red while the import screen's control still reached
//      the roster route in the same run. Recorded verbatim in the SUMMARY.
//  (3) Does a degenerate implementation satisfy it? No — the URL is asserted
//      by value AND the metadata route is asserted to appear ZERO times, so a
//      renderer that posted to both would still be red.
//  (4) Is it reading evaluation order or source order? EVALUATION ORDER: a
//      control double's handler is actually INVOKED and the transport records
//      what it received. No assertion here reads the text of app.js.
//  (5) Could a grep match the fix's own comment? There is no grep here.
// ---------------------------------------------------------------------------
group('P-1 (the pane\'s remove control reaches the roster route, never the ' +
  'metadata route)', function () {
  const d = drivePane(R3);
  if (!d.editor) {
    violations.push('[P-1] the pane never created its editor container — ' +
      'nothing was driven and nothing below is evidence');
    return;
  }
  nonEmptyNamed('P-1', d.editor.innerHTML, R3);
  const rows = d.editor.querySelectorAll('.vault-roster-remove');
  if (rows.length !== R3.length) {
    violations.push('[P-1] the pane bound ' + rows.length + ' remove ' +
      'control(s) for a ' + R3.length + '-entry roster, expected ' +
      R3.length + ' BY VALUE');
    return;
  }
  const target = rows.filter(function (b) {
    return b.getAttribute('data-folder') === 'personnel notes';
  })[0];
  if (!target) {
    violations.push('[P-1] no remove control carried data-folder="personnel ' +
      'notes" — the row cannot name the folder it would unfence');
    return;
  }
  const before = d.s.calls.post.length;
  target.fire();
  const posted = d.s.calls.post.slice(before);
  if (posted.length !== 1) {
    violations.push('[P-1] one tap recorded ' + posted.length + ' write(s), ' +
      'expected exactly 1: ' + JSON.stringify(posted));
    return;
  }
  if (posted[0].url !== '/api/librarian/roster') {
    violations.push('[P-1] the pane\'s remove wrote to ' +
      JSON.stringify(posted[0].url) + ' — the roster class must travel the ' +
      'roster route or it does not travel. This is the SE-9 hole.');
  }
  const urls = d.s.calls.post.map(function (p) { return p.url; });
  const meta = urls.filter(function (u) { return u === '/api/meta'; }).length;
  if (meta !== 0) {
    violations.push('[P-1] the metadata route appears ' + meta + ' time(s) ' +
      'in the recorded URL list, expected 0 — /api/meta validates a roster ' +
      'but SKIPS add_roster_folder\'s retroactive trigger=True stamping, ' +
      'silently reopening the hole 26.4-01 closed. URLs: ' +
      JSON.stringify(urls));
  }
  const body = posted[0].body || {};
  if (body.op !== 'remove') {
    violations.push('[P-1] the posted body op was ' + JSON.stringify(body.op) +
      ', expected "remove" BY VALUE');
  }
  if (body.folder !== 'personnel notes') {
    violations.push('[P-1] the posted body folder was ' +
      JSON.stringify(body.folder) + ', expected "personnel notes" BY VALUE');
  }
});

// ---------------------------------------------------------------------------
// (P-2) THE ADD CONTROL POSTS {op:'add', folder} TO THE SAME ROUTE.
// The five answers are P-1's, with one sharpening: the remove case's op is
// the CONTROL for this one — a renderer that sent 'remove' for both would
// turn this red while leaving P-1 green, which is why both ops are pinned.
// ---------------------------------------------------------------------------
group('P-2 (the pane\'s add control posts the add op to the roster route)',
  function () {
    const d = drivePane(R3);
    if (!d.editor) {
      violations.push('[P-2] the pane never created its editor container');
      return;
    }
    const field = d.editor.querySelector('.vault-roster-add-input');
    const add = d.editor.querySelector('.vault-roster-add');
    if (!field || !add) {
      violations.push('[P-2] the add field or the add control is missing ' +
        'from the rendered editor — the empty state and the populated state ' +
        'must BOTH offer a way in');
      return;
    }
    field.value = '  Diaries  ';
    const before = d.s.calls.post.length;
    add.fire();
    const posted = d.s.calls.post.slice(before);
    if (posted.length !== 1) {
      violations.push('[P-2] one add tap recorded ' + posted.length +
        ' write(s), expected exactly 1: ' + JSON.stringify(posted));
      return;
    }
    if (posted[0].url !== '/api/librarian/roster') {
      violations.push('[P-2] the add wrote to ' +
        JSON.stringify(posted[0].url) + ', expected the roster route');
    }
    if ((posted[0].body || {}).op !== 'add') {
      violations.push('[P-2] the add posted op ' +
        JSON.stringify((posted[0].body || {}).op) + ', expected "add" BY ' +
        'VALUE. ⚠ P-1 asserts "remove" in the same suite: an editor that ' +
        'sent one op for both controls would be red HERE and green THERE.');
    }
    if ((posted[0].body || {}).folder !== 'Diaries') {
      violations.push('[P-2] the add posted folder ' +
        JSON.stringify((posted[0].body || {}).folder) +
        ', expected the typed value "Diaries" BY VALUE');
    }
  });

// ---------------------------------------------------------------------------
// (P-3) NEITHER HOST OWNS A SECOND COPY OF THE ROW MARKUP.
//
// ⚠ THE COMPARISON IS DRIVEN THROUGH EACH HOST, NOT BY CALLING THE SHARED
// FUNCTION TWICE. Calling it twice by hand would prove only that a function
// is deterministic — it would say nothing about whether the two hosts still
// route through it. And ⚠ answer (3) explicitly: a renderer producing EMPTY
// output for both hosts satisfies naive byte-equality, so the non-emptiness
// and names-by-value assertions in the same group are what refuse it.
// ⛔ Row COUNTS are never compared: a count-equality assertion survives a
// total rewrite of the row markup.
// ---------------------------------------------------------------------------
// ⭐⭐ 26.96-34 — WHY THIS GROUP NO LONGER COMPARES THE TWO HOSTS DIRECTLY,
// AND WHY THAT IS NOT A WIDENING.
//
// She ruled on 2026-08-23 (`26.96-34` question 1, ⛔ TIER 2 — approved as
// shown: an agent wrote the question and the option labels, she picked one,
// she typed no prose) that the bringing-in screen takes her two picker
// sentences OFF. So the two hosts are no longer byte-identical BY HER
// DECISION, and a bare equality here would now be red on correct code.
//
// ⛔ THE ANTI-DRIFT PROPERTY IS KEPT WHOLE, not relaxed. It is asserted in
// the only place it was ever really about: ONE RENDERER. The import screen's
// OWN container is re-rendered through the SHARED editor, asked for the same
// thing the Manage pane asks for, and the result must be byte-identical to
// the Manage pane's. ⛔ Any difference other than the one she ruled is still
// red. What changed is that the difference she ruled is now pinned BY VALUE
// instead of being invisible inside an equality.
group('P-3 (one renderer — the SAME renderer, asked the same thing, produces ' +
  'byte-identical markup for either host; and her ruled difference is ' +
  'pinned by value)',
  function () {
    const a = driveImport(R3);
    const b = drivePane(R3);
    if (!b.editor) {
      violations.push('[P-3] host B never created its editor container');
      return;
    }
    const markupA = a.editor.innerHTML;
    const markupB = b.editor.innerHTML;
    nonEmptyNamed('P-3/hostA', markupA, R3);
    nonEmptyNamed('P-3/hostB', markupB, R3);
    // ⛔ HER RULING R, BY VALUE, ON THE HOST AS IT REALLY RENDERS. The
    // bringing-in screen carries NO offered-names block at all.
    const PICKER_BLOCK = 'class="vault-roster-picker"';
    const aPicker = markupA.split(PICKER_BLOCK).length - 1;
    const bPicker = markupB.split(PICKER_BLOCK).length - 1;
    console.log('  [P-3/her-ruling] picker blocks: import=' + aPicker +
      ' manage=' + bPicker);
    if (aPicker !== 0) {
      violations.push('[P-3] ⛔ THE BRINGING-IN SCREEN STILL EMITS THE ' +
        'OFFERED-NAMES BLOCK (' + aPicker + ' of them). She ruled on ' +
        '2026-08-23 that the two lines above that list come OFF that ' +
        'screen, because the list there can never fill.');
    }
    if (bPicker !== 1) {
      violations.push('[P-3] ⛔ THE MANAGE PANE EMITTED ' + bPicker + ' ' +
        'offered-names block(s), expected exactly 1 BY VALUE. Her ruling ' +
        'removed a block from ONE screen — ⛔ never a sentence from the room.');
    }
    // ⛔ ONE RENDERER, DRIVEN: the import screen's own container, through the
    // SHARED editor, asked for what the Manage pane asks for. ⛔ This is what
    // refuses a second copy of the row markup living at a host's call site.
    a.s.api.editor(a.editor, R3, null, true);
    const markupAOffered = a.editor.innerHTML;
    nonEmptyNamed('P-3/hostA-offered', markupAOffered, R3);
    if (markupAOffered !== markupB) {
      violations.push('[P-3] ⛔ THE SAME RENDERER, ASKED THE SAME THING, ' +
        'PRODUCED DIFFERENT MARKUP FOR THE TWO HOSTS — one of them owns a ' +
        'second copy of the row markup, and two copies of a privacy editor ' +
        'drift until the day one stops writing through the roster route. ' +
        '⛔ This is NOT her ruled difference: both sides here were asked for ' +
        'the offered-names block.\n    hostA: ' +
        JSON.stringify(markupAOffered.slice(0, 200)) + '\n    hostB: ' +
        JSON.stringify(markupB.slice(0, 200)));
    }
    // ⛔ AND THE POSITIVE CONTROL FOR THE COMPARISON ABOVE: asked for the
    // block, the import screen's container really did gain it. Without this a
    // renderer that ignored the fourth argument entirely would satisfy the
    // equality with two identical PICKERLESS markups and prove nothing.
    const aOfferedPicker = markupAOffered.split(PICKER_BLOCK).length - 1;
    console.log('  [P-3/one-renderer] import container asked for the block: ' +
      'picker blocks=' + aOfferedPicker + ' identical-to-manage=' +
      (markupAOffered === markupB));
    if (aOfferedPicker !== 1) {
      violations.push('[P-3] ⛔ THE POSITIVE CONTROL FAILED: the shared ' +
        'renderer was asked for the offered-names block and emitted ' +
        aOfferedPicker + ' of them. Two picker-less markups are equal to ' +
        'each other, so the equality above would pass over nothing.');
    }
    const boundA = a.editor.querySelectorAll('.vault-roster-remove').length;
    const boundB = b.editor.querySelectorAll('.vault-roster-remove').length;
    if (boundA !== R3.length || boundB !== R3.length) {
      violations.push('[P-3] bound control count was hostA=' + boundA +
        ' hostB=' + boundB + ', expected ' + R3.length + ' BY VALUE on both');
    }
    // A6 / J2 — both convergences live in the SHARED renderer, so both hosts
    // must carry them or the seam is not actually shared.
    [['hostA', markupA], ['hostB', markupB]].forEach(function (pair) {
      if (pair[1].indexOf('aria-label=') === -1) {
        violations.push('[A6/' + pair[0] + '] the add field carries no ' +
          'accessible name — a placeholder stops being the accessible name ' +
          'the moment text is typed, and this fix lives in the shared ' +
          'renderer precisely so BOTH hosts gain it');
      }
      if (pair[1].indexOf('text-decoration:underline') === -1 ||
          pair[1].indexOf('background:none') === -1) {
        violations.push('[J2/' + pair[0] + '] the remove control does not ' +
          'wear the shipped quiet-link register — without it the control ' +
          'ships as raw browser chrome inside a styled pane');
      }
    });
  });

// ---------------------------------------------------------------------------
// (P-4) AFTER A WRITE, BOTH HOSTS FOLLOW THE ROUTE'S OWN ANSWER.
// The control in the same run is a success case whose answer and input agree.
// ---------------------------------------------------------------------------
group('P-4 (the repaint follows the route\'s answer, not the local input)',
  function () {
    const answer = ['Journal', 'appraisal record', 'letters'];
    const d = drivePane(R3, answering(R3));
    if (!d.editor) {
      violations.push('[P-4] the pane never created its editor container');
      return;
    }
    // From here the route answers something DIFFERENT from what was sent.
    let phase = 0;
    const s2 = rosterScope(function (url, body) {
      if (url === '/api/items') {
        return shippedThenable({ ok: true, status: 200,
          data: { meta: { fenced_roster: R3 } } });
      }
      phase += 1;
      return shippedThenable({ ok: true, status: 200,
        data: { fenced_roster: answer } });
    });
    s2.api.pane();
    const box = s2.dom('manage-sec-roster');
    const ed = box.kids['vault-roster-editor'];
    if (!ed) {
      violations.push('[P-4] no editor container to repaint');
      return;
    }
    const row = ed.querySelectorAll('.vault-roster-remove').filter(
      function (b) { return b.getAttribute('data-folder') === 'Journal'; })[0];
    if (!row) {
      violations.push('[P-4] no row to drive');
      return;
    }
    row.fire();
    if (phase !== 1) {
      violations.push('[P-4] the write never reached the transport');
      return;
    }
    const after = ed.innerHTML;
    nonEmptyNamed('P-4', after, answer);
    if (after.indexOf('personnel notes') !== -1) {
      violations.push('[P-4] the repaint still carries "personnel notes", ' +
        'which the ROUTE\'S ANSWER does not contain — the host repainted ' +
        'from its own local guess instead of from the store\'s truth, and a ' +
        'privacy list that shows a local guess is a list that can lie.');
    }
    // THE CONTROL, same run: an answer that AGREES with the input must leave
    // the input's entries on screen — otherwise "follows the answer" would be
    // satisfied by a renderer that simply dropped whatever it was given.
    const c = drivePane(R3, answering(R3));
    if (c.editor) {
      nonEmptyNamed('P-4/control', c.editor.innerHTML, R3);
    }
  });

// ===========================================================================
// ⛔⛔ WHICH BEHAVIOURAL INSTRUMENT REACHES WHICH SURFACE — PER SURFACE, BY
// NAME. (26.96-46)
//
// ⛔ A COUNT OF INSTRUMENTS IS NOT A GATE, AND AN INSTRUMENT CREDITED WITH
// MORE REACH THAN IT HAS IS THIS PROJECT'S OWN NAMED FAILURE CLASS. This
// pane renders her folder names into FIVE distinct places. Read the table
// before adding a sixth, and before believing that a green here covers one.
//
// The pane's renderer puts a folder name into a row TWICE — once as the text
// she reads, and once inside a quoted attribute so a control knows which
// folder it belongs to. ⛔ THOSE TWO ARE HELD BY DIFFERENT GROUPS, because
// they fail on different evidence and are protected by DIFFERENT escapers:
//
//     escapeHtml  escapes  &  <  >   and deliberately NOT  "  '   → TEXT
//     escapeAttr  escapes  &  "  '   and deliberately NOT  <  >   → ATTRIBUTE
//
//   surface                              TEXT node        quoted ATTRIBUTE
//   -----------------------------------  ---------------  ------------------
//   1. the FENCED roster row             escaping         attr-breakout
//   2. the picker's OFFERED row, at rest  offered-inert    attr-breakout
//                                                          /picker
//   3. the picker's OFFERED row,          offered-inert    attr-breakout
//      FILTERED by a keystroke            /filtered        /picker-filtered
//   4. the picker's NO-MATCH state       — nothing of hers reaches the
//      markup at all; asserted as an ABSENCE by
//      attr-breakout/picker-nomatch, which is the only shape where the
//      right answer is that her text is not there.
//   5. the name she TYPES into the add field — never echoed back onto the
//      page; held by typedNameSurvivesEnumeration and rejectedEnumeration.
//
// ⛔ UNTIL 26.96-46 ROWS 2 AND 3 HAD NO TEXT-NODE ENTRY AT ALL. Both
// behavioural escaping instruments that existed — `escaping` and
// `attr-breakout` — render the FENCED roster; the picker's offered list is
// reached through the pane driver's THIRD parameter, which defaults to a
// fixture of ordinary names, so no group had ever supplied that surface with
// a payload. The attribute halves of rows 2 and 3 were already held (26.96-27,
// 26.96-28); ⛔ the TEXT halves were held by nothing, and that asymmetry is
// what made the gap easy to miss — the picker looked covered because half of
// it was.
//
// ⛔ HOW IT WAS FOUND, AND WHY THE FINDING IS NOT "AN ESCAPER WAS MISSING".
// Driven at head 4de7eb1 in a clean clone, each arm asserting the file's md5
// MOVED and reading the changed line back FROM DISK:
//
//   · DELETE the text escaper on the offered row → the suite goes red, but
//     from `seamShape` ALONE. Both behavioural escaping groups stay GREEN.
//   · REPLACE it with escapeAttr — the wrong escaper for a text node, and an
//     entirely reasonable-looking line → ⛔⛔ THE WHOLE SUITE STAYS GREEN,
//     exit 0, over a picker rendering her folder name as a LIVE <img>.
//     `seamShape` cannot see it because escapeAttr is a member of the very
//     alternation it derives its vocabulary from: it proves an escaper is
//     CALLED, never that the RIGHT one was.
//   · DELETE the attribute escaper on the FENCED roster row → the mirror
//     image: `attr-breakout` goes red and `offered-inert` stays GREEN.
//
// ⛔ THE MIRROR IS THE POINT. Two instruments that each catch only their own
// surface are COMPLEMENTARY; one that caught both would mean the drive went
// through the wrong path and the reach claim would be unfounded.
//
// ⛔⛔ AND THE RESIDUE, STATED AT ITS REAL SIZE RATHER THAN AT A COMFORTABLE
// ONE. Every one of these sinks carries its correct escaper at this head, and
// every plant above required NEW CODE to create — ⛔ this is a GATE-REACH
// defect, never a live hole, and writing it up as a live hole would be false.
// ⛔ But it must not be understated either: the wrong-escaper arm passed
// EVERY instrument this repository has, the static one included. What is
// still not held anywhere: the same substitution made on a sink OUTSIDE this
// pane's delimited region, and the question of how far the net should reach
// across the rest of the room — both already recorded as open, and neither
// settled here.
// ===========================================================================

// ---------------------------------------------------------------------------
// (ESCAPING) A FOLDER NAME CARRYING MARKUP RENDERS INERT.
// ⛔ The escapers are the REAL ones, lifted from core.js at the top of this
// section. A stubbed escaper would make this case vacuously green.
// ---------------------------------------------------------------------------
group('escaping (a folder name carrying markup renders inert)', function () {
  const nasty = '<img src=x onerror="alert(1)">';
  const d = drivePane([nasty]);
  if (!d.editor) {
    violations.push('[escaping] the pane never created its editor container');
    return;
  }
  const markup = d.editor.innerHTML;
  if (markup.length === 0) {
    violations.push('[escaping] the captured markup is empty — nothing was ' +
      'rendered, so nothing was escaped');
    return;
  }
  const bare = stripQuotedValues(markup);
  if (bare.indexOf('<img') !== -1) {
    violations.push('[escaping] a LIVE <img tag reached the rendered ' +
      'markup — it survives with every quoted attribute value stripped, so ' +
      'it is a tag and not attribute text. The folder name is her free text ' +
      'and is this phase\'s main injection surface: ' +
      JSON.stringify(bare.slice(0, 200)));
  }
  // ⚠ AND THE STRONGER FORM: the set of tags the output actually opens must
  // be exactly this renderer's own vocabulary. An injected element shows up
  // here as a name that is not in the list, whatever it is called — which a
  // check hunting for one known-bad attribute would miss.
  // ⛔ Do NOT "simplify" this to a scan for `onerror`: the ESCAPED row text
  // legitimately contains the characters `onerror=` (that is the proof it
  // was escaped), so such a scan reports the correct output as an injection.
  const ALLOWED = ['div', 'p', 'span', 'button', 'input'];
  const seen = [];
  const tre = /<\/?([a-zA-Z][a-zA-Z0-9]*)/g;
  let t;
  while ((t = tre.exec(bare)) !== null) {
    const name = t[1].toLowerCase();
    if (seen.indexOf(name) === -1) { seen.push(name); }
  }
  const stray = seen.filter(function (n) { return ALLOWED.indexOf(n) === -1; });
  if (stray.length) {
    violations.push('[escaping] the rendered markup opens tag(s) outside ' +
      'this renderer\'s own vocabulary: ' + JSON.stringify(stray) +
      ' — a folder name became an ELEMENT: ' + JSON.stringify(bare.slice(0, 200)));
  }
  if (seen.indexOf('span') === -1 || seen.indexOf('button') === -1) {
    violations.push('[escaping] the tag scan found neither a span nor a ' +
      'button — the output is not the roster editor, so the check above ' +
      'passed on the wrong thing: ' + JSON.stringify(seen));
  }
  if (markup.indexOf('&lt;img') === -1) {
    violations.push('[escaping] the escaped form &lt;img is absent — the ' +
      'name was neither escaped NOR rendered in the row text, so this case ' +
      'proves nothing: ' + JSON.stringify(markup.slice(0, 200)));
  }
  // ⚠ THE ACTUAL SAFETY PROPERTY OF THE ATTRIBUTE PATH: the name cannot
  // break OUT of the double-quoted value. If a raw " survived into
  // data-folder, everything after it would be parsed as new attributes.
  const attr = /data-folder="([^"]*)"/.exec(markup);
  if (!attr) {
    violations.push('[escaping] no data-folder attribute was rendered — the ' +
      'row cannot name the folder it would unfence');
  } else if (attr[1].indexOf('"') !== -1) {
    violations.push('[escaping] a raw double quote survived into ' +
      'data-folder, so the value can be broken out of: ' +
      JSON.stringify(attr[1]));
  }
});

// ---------------------------------------------------------------------------
// (ATTR-BREAKOUT) ⛔ GAP V-1, 2026-08-21. THE ESCAPER ON HER FOLDER NAME IN
// `data-folder` WAS HELD BY NOTHING.
//
// MEASURED: deleting `escapeAttr(...)` from the `data-folder="` sink at
// app.js:19653 survives the WHOLE node suite — including the `escaping` group
// directly above, which stays rc=0. That group is NOT deleted and NOT weakened;
// it covers a real property (a folder name may not become an ELEMENT) and it
// still does. What it cannot see is a BREAKOUT, and the reason is mechanical,
// so it is written down rather than guessed at:
//
//   payload  Jo"urnal onmouseover=alert(1) x
//   unescaped sink renders  data-folder="Jo"urnal onmouseover=alert(1) x"
//
//   1. its tag scan runs over stripQuotedValues(markup), which collapses
//      "Jo" to "" — the broken-open text is INSIDE what that helper deletes,
//      so the scan never sees it and no stray tag name appears;
//   2. its attribute check is /data-folder="([^"]*)"/ — a regex that STOPS at
//      the first quote. On the broken output it captures `Jo`, which contains
//      no `"`, so "a raw double quote survived" is answered NO on exactly the
//      output where the quote did survive. The instrument's own stop character
//      is the injected character.
//
// So the repair is not a stronger version of that group's questions — it is a
// different question, asked here: DOES THE ATTRIBUTE VALUE STILL CARRY HER
// FOLDER NAME, WHOLE? That is checkable by value and cannot be answered by a
// scan that stops at a quote.
//
// THE ANTI-VACUITY ANSWERS (contract, 26.96-VALIDATION.md):
//  1. Can it pass BEFORE the work? No — driven RED in a scratch clone with the
//     escaper deleted from that one sink; the verbatim output is in the return.
//  2. Can it STILL pass once broken? No — with the escaper gone the value the
//     attribute actually carries is `Jo`, not the folder name, and the
//     comparison is BY VALUE against the name the renderer was handed.
//  3. Does a DEGENERATE implementation satisfy it? No. Rendering nothing, no
//     row, or no data-folder at all fails as a missing positive control; and
//     the same run asserts the ordinary name `Journal` round-trips, so an
//     implementation that escaped everything into mush fails too.
//  4. Evaluation order or source order? EVALUATION — it reads the markup the
//     shipped renderer produced for a driven roster. Not one byte of app.js
//     source text is consulted here.
//  5. Does it match THE FIX'S OWN COMMENT? It matches no comment at all: there
//     is no grep in this group.
// ---------------------------------------------------------------------------
// ⛔⛔ 26.96-22 (T-26.96-63): ONE PAYLOAD IS NOT A PAYLOAD SET, AND THE ONE
// THIS GROUP HELD WAS ALREADY THE RIGHT SHAPE BY LUCK RATHER THAN BY DESIGN.
// An attribute breakout is proved by A BARE DOUBLE QUOTE, never by a tag: the
// tag payload passes an unescaped attribute sink unharmed, because escapeAttr
// deliberately does not touch `<` or `>` and a quoted attribute value may
// legally contain them. That is exactly how V-1 hid for a whole phase behind a
// green `escaping` group. So the payload is now a NAMED MODULE-LEVEL SET, the
// group is driven over every member, and each member's catch/miss against a
// deleted escaper is recorded rather than assumed. The tag payload is KEPT and
// its own entry says why it is there: it is the recorded NEGATIVE — the member
// that proves a tag alone cannot see this defect.
// ⛔ The set is module-level so a later plan can add the picker's own emitted
// string to the SAME drive instead of starting a fourth one.
// ⛔ `attr-breakout` and `escaping` are NOT folded together. They fail on
// different evidence and merging them would let one carry the other's green.

// ---------------------------------------------------------------------------
// ⛔ THE ATTRIBUTE-BREAKOUT PAYLOAD SET. Each member carries its OWN reason for
// existing, and a member that catches nothing is kept only because its reason
// says it is the control for that.
// ---------------------------------------------------------------------------
const ATTR_PAYLOADS = [
  {
    name: 'tag',
    value: 'Jo<img src=x onerror=alert(1)>urnal',
    // ⛔ THE RECORDED NEGATIVE. escapeAttr escapes & " ' and deliberately NOT
    // < or >, so this payload renders BYTE-IDENTICALLY with the escaper and
    // without it. It catches nothing here and is not supposed to — it is here
    // so that "the tag payload alone is insufficient" stays a measured fact in
    // the file rather than a sentence in a summary nobody re-reads. The
    // property it DOES hold (a folder name may not become an ELEMENT) is
    // `escaping`'s, above, and is untouched.
    catches: false
  },
  {
    name: 'bareQuote',
    value: 'Jo"urnal',
    // ⛔ THE MINIMAL BREAKOUT: a quote and nothing else. It carries no
    // attribute-shaped tail at all, so it cannot be dismissed as "an injected
    // handler" — what it proves is narrower and worse: the value the row
    // actually carries stops at the quote, so the control names a DIFFERENT
    // folder from the one she is looking at.
    catches: true
  },
  {
    name: 'quoteThenAttr',
    value: 'Jo"urnal onmouseover=alert(1) x',
    // The shipped payload this group was born with: the quote plus something a
    // browser parses as a new event-handler attribute once the value closes
    // early. Kept because it is the one that shows the CONSEQUENCE of the
    // breakout, not merely its existence.
    catches: true
  },
  {
    name: 'quoteApostropheAmp',
    value: 'Jo"ur\'nal & Co',
    // The remaining two characters escapeAttr claims: `'` and `&`. A partial
    // escaper that handled only the double quote would satisfy the two members
    // above and lose this one — a half-fix reads exactly like a fix when
    // nothing drives the other half.
    // ⛔⛔ 26.96-46: THAT LAST SENTENCE WAS FALSE, AND IT WAS FALSE BY
    // MEASUREMENT. Driven at head 4de7eb1 in a clean clone, with this sink's
    // escapeAttr REPLACED by a double-quote-only escaper (md5 asserted MOVED,
    // the changed line read back FROM DISK): the WHOLE SUITE STAYED GREEN,
    // exit 0, and this member did not fire. The reason is arithmetic, so it is
    // written down rather than guessed at: `decodeAttr` undoes `&#39;` and
    // `&amp;`, and undoing them is IDEMPOTENT on characters that were never
    // escaped. A bare `'` decodes to `'`; a bare `&` followed by ` Co` decodes
    // to `&`. So this value round-trips through the half escaper exactly as it
    // round-trips through the whole one, and the member that was kept
    // specifically to catch a half-fix could not catch one. ⛔ It is NOT
    // removed — the characters it carries are still the right characters and
    // it is still the control for an over-escaping renderer. What it needed
    // was the member below, which is the case where the decode is NOT
    // idempotent.
    catches: true
  },
  {
    name: 'entityQuote',
    value: 'Jo&quot;urnal',
    // ⛔ 26.96-46: THE MEMBER THAT SEPARATES A HALF-ESCAPER FROM A WHOLE ONE.
    // A folder whose NAME literally contains the six characters `&quot;` is an
    // ordinary thing to have on a disk, and it is the one shape where the two
    // escapers disagree observably:
    //
    //   whole escapeAttr → renders `Jo&amp;quot;urnal` → decodes to
    //                      `Jo&quot;urnal`, her name, WHOLE.
    //   `"`-only escaper → renders `Jo&quot;urnal`     → decodes to
    //                      `Jo"urnal`, which is NOT her folder.
    //
    // ⛔ THE HARM IS THE ONE THIS WHOLE GROUP IS ABOUT, not a new one: the row
    // then carries a DIFFERENT folder name from the one she is reading, so the
    // control fences the wrong thing — on the one control where being wrong
    // costs her privacy. It is not a quote breakout (the delimiter survives),
    // and this member's reason says so rather than letting a reader assume the
    // stronger claim.
    // ⛔ ADDED TO THE SHARED SET, NEVER TO A SECOND ONE. The set is
    // module-level exactly so a member reaches every sink at once: this one is
    // driven over the fenced roster AND over the picker's at-rest, FILTERED
    // and NO-MATCH shapes, with no drive rewritten to receive it.
    catches: true
  }
];

const ATTR_PLAIN = 'Journal';        // the unmutated control, every run

group('attr-breakout (her folder name survives the attribute WHOLE — every ' +
  'payload in the set, each beside an ordinary name in the same case)',
  function () {
    ATTR_PAYLOADS.forEach(function (p) {
      const tag = 'attr-breakout/' + p.name;
      const d = drivePane([p.value, ATTR_PLAIN]);
      if (!d.editor) {
        violations.push('[attr-breakout] (' + p.name + ') the pane never ' +
          'created its editor container — nothing was rendered, so nothing ' +
          'is proven');
        return;
      }
      const markup = d.editor.innerHTML;
      if (!markup.length) {
        violations.push('[attr-breakout] (' + p.name + ') the captured ' +
          'markup is EMPTY');
        return;
      }
      // ⚠ THE VALUES ARE READ THE WAY A BROWSER READS THEM: from the opening
      // quote to the NEXT quote, which is precisely the rule that makes a
      // breakout dangerous. scanTags applies that rule; the assertion below
      // then undoes ONLY the entity encoding the escaper is supposed to have
      // applied, and demands the folder name back, whole.
      const rows = scanTags(markup).filter(function (t) {
        return (t.attrs['class'] || '').split(/\s+/)
          .indexOf('vault-roster-remove') !== -1;
      });
      // ⛔ 26.96-22: PRINTED ON EVERY RUN, BEFORE THE VERDICT, PER PAYLOAD.
      // The count and the value the attribute really carries are the two
      // numbers the deleted-escaper drive is read from; printing them makes a
      // vacuous pass (no rows at all, or a comparison against nothing) visible
      // rather than inferred.
      console.log('  [' + tag + '] rows=' + rows.length + ' value=' +
        (rows.length ? JSON.stringify(decodeAttr(rows[0].attrs['data-folder'])) :
          '(no row)'));
      if (rows.length !== 2) {
        violations.push('[attr-breakout] (' + p.name + ') expected exactly 2 ' +
          'remove controls for a 2-entry roster, the browser-rule parse found ' +
          rows.length + ' — the row markup did not survive an ' +
          'attribute-breakout name intact, so the rows themselves are already ' +
          'malformed: ' + JSON.stringify(markup.slice(0, 240)));
        return;
      }
      const got = rows.map(function (r) {
        return decodeAttr(r.attrs['data-folder']);
      });
      if (got[0] !== p.value) {
        violations.push('[attr-breakout] (' + p.name + ') ⛔ THE FOLDER NAME ' +
          'DID NOT SURVIVE THE ATTRIBUTE. The row is supposed to carry the ' +
          'name it would unfence; read the way a browser reads a quoted value ' +
          'it carries ' + JSON.stringify(got[0]) + ' instead of ' +
          JSON.stringify(p.value) + '. Everything after the lost quote is ' +
          'parsed as NEW ATTRIBUTES on her own row — and the control now ' +
          'names a DIFFERENT folder than the one she is looking at, so ' +
          'pressing it would unfence the wrong thing. Rendered: ' +
          JSON.stringify(markup.slice(0, 240)));
      }
      // THE UNMUTATED CONTROL, in the same case as every payload: an ordinary
      // name must come back untouched. A renderer that mangled or over-escaped
      // everything would fail here while satisfying the arm above.
      if (got[1] !== ATTR_PLAIN) {
        violations.push('[attr-breakout/control] (' + p.name + ') an ORDINARY ' +
          'folder name did not round-trip: ' + JSON.stringify(got[1]) + ' vs ' +
          JSON.stringify(ATTR_PLAIN) + ' — the reader above is measuring ' +
          'something other than the attribute, so its verdict means nothing ' +
          'either way');
      }
      // AND THE STRUCTURAL HALF: the breakout row may not have grown
      // attributes. The renderer's own vocabulary for this control is fixed
      // and small.
      const VOCAB = ['type', 'class', 'data-folder', 'style'];
      const stray = Object.keys(rows[0].attrs).filter(function (k) {
        return VOCAB.indexOf(k) === -1;
      });
      if (stray.length) {
        violations.push('[attr-breakout] (' + p.name + ') her folder name ' +
          'became ATTRIBUTES on the row: ' + JSON.stringify(stray));
      }
    });
    // -----------------------------------------------------------------
    // ⛔⛔ 26.96-27: THE SAME DRIVE, OVER THE PICKER'S OWN ROWS.
    //
    // The picker adds a SECOND attribute sink to the room's strongest
    // privacy control, and research V4 requires this group EXTENDED to it —
    // ⛔ not a second group, and ⛔ not a second payload set. ONE CONSTANT,
    // TWO SINKS, so a payload added later reaches both.
    //
    // ⚠⚠ BEFORE THIS WAS BUILT, V4 WAS CLAIMED AS MITIGATED BY NO ONE. The
    // threat register said the picker's sink had been added to plan
    // 26.96-22's payload set; nothing had added it. A threat row naming a
    // gate nobody built is worse than a row marked open, because it stops
    // anyone looking.
    //
    // ⛔ THE PROOF THAT THIS DRIVE HOLDS IS THE BARE QUOTE, NEVER THE TAG.
    // escapeAttr escapes & " and ' and deliberately NOT < or >, so the tag
    // payload renders byte-identically with the escaper and without it — it
    // is the recorded NEGATIVE here exactly as it is above.
    // -----------------------------------------------------------------
    let pickerDriven = 0;
    ATTR_PAYLOADS.forEach(function (p) {
      pickerDriven += 1;
      const tag = 'attr-breakout/picker/' + p.name;
      // The payload is one whole SEGMENT of an offered path, beside an
      // ordinary name in the same case.
      const d = drivePane(R3, undefined, [[p.value], [ATTR_PLAIN]]);
      if (!d.editor) {
        violations.push('[attr-breakout] (picker/' + p.name + ') the pane ' +
          'never created its editor container — nothing was rendered');
        return;
      }
      // ⚠ 26.96-28: `rendered()` — the editor AND its child containers —
      // because the offered rows moved into `.vault-roster-choices` when the
      // list learned to narrow. Reading `innerHTML` alone would find zero
      // rows and this whole arm would go quiet over the sink it exists for.
      const markup = rendered(d.editor);
      const rows = scanTags(markup).filter(function (t) {
        return (t.attrs['class'] || '').split(/\s+/)
          .indexOf('vault-roster-choice') !== -1;
      });
      // ⛔ THE SLICE IS TAKEN AROUND THE PICKER'S OWN CONTAINER, never from
      // the head of the document. A violation that prints the first 240 bytes
      // of this pane shows the ROSTER LIST — the sink that is NOT under test —
      // and a reader cannot see the malformed row at all. Liveness for the
      // deleted-escaper drive IS this markup, so it has to be the markup the
      // drive is about.
      // ⚠ CENTRED ON THE SINK ITSELF, not on the picker's container: the two
      // prose lines above the rows ate the whole budget of the first attempt
      // and the malformed row was still off the end. Driven, not guessed.
      // ⚠⚠ 26.96-28: THE ANCHOR CARRIES ITS CLOSING QUOTE, AND THAT IS A
      // DRILL FINDING FOR THE SECOND TIME ON THIS ARM. `vault-roster-choice`
      // is a PREFIX of `vault-roster-choices` — the empty container the
      // editor now emits — so a bare substring anchor landed on the
      // container and printed a region with no row in it at all. Plant 7's
      // required liveness IS the malformed row; driven, read, and repaired.
      const at = markup.indexOf('class="vault-roster-choice"');
      const shown = at === -1 ? markup.slice(-260) :
        markup.slice(Math.max(0, at - 40), at + 260);
      // ⛔ PRINTED BEFORE THE VERDICT, PER PAYLOAD — the count and the value
      // the attribute really carries. A vacuous pass (no rows at all, or a
      // comparison against nothing) is then VISIBLE rather than inferred.
      console.log('  [' + tag + '] rows=' + rows.length + ' value=' +
        (rows.length ?
          JSON.stringify(decodeAttr(rows[0].attrs['data-folder'])) :
          '(no row)'));
      if (rows.length !== 2) {
        violations.push('[attr-breakout] (picker/' + p.name + ') expected ' +
          'exactly 2 offered rows for a 2-entry answer, the browser-rule ' +
          'parse found ' + rows.length + ' — the picker\'s row markup did ' +
          'not survive an attribute-breakout name intact: ' +
          JSON.stringify(shown));
        return;
      }
      const got = rows.map(function (r) {
        return decodeAttr(r.attrs['data-folder']);
      });
      if (got[0] !== p.value) {
        violations.push('[attr-breakout] (picker/' + p.name + ') ⛔ THE ' +
          'FOLDER NAME DID NOT SURVIVE THE PICKER\'S ATTRIBUTE. That row is ' +
          'supposed to carry the path it would make PRIVATE; read the way a ' +
          'browser reads a quoted value it carries ' + JSON.stringify(got[0]) +
          ' instead of ' + JSON.stringify(p.value) + '. Everything after the ' +
          'lost quote is parsed as NEW ATTRIBUTES on the row, and the ' +
          'control now names a DIFFERENT folder from the one she is looking ' +
          'at — so tapping it would fence the wrong thing, on the one ' +
          'control where being wrong costs her privacy. Rendered: ' +
          JSON.stringify(shown));
      }
      if (got[1] !== ATTR_PLAIN) {
        violations.push('[attr-breakout/control] (picker/' + p.name + ') an ' +
          'ORDINARY folder name did not round-trip through the picker: ' +
          JSON.stringify(got[1]) + ' vs ' + JSON.stringify(ATTR_PLAIN) +
          ' — the reader above is measuring something other than the ' +
          'attribute, so its verdict means nothing either way');
      }
      const VOCAB = ['type', 'class', 'data-folder', 'style'];
      const stray = Object.keys(rows[0].attrs).filter(function (k) {
        return VOCAB.indexOf(k) === -1;
      });
      if (stray.length) {
        violations.push('[attr-breakout] (picker/' + p.name + ') her folder ' +
          'name became ATTRIBUTES on the picker\'s row: ' +
          JSON.stringify(stray));
      }
    });
    // -----------------------------------------------------------------
    // ⛔⛔ 26.96-28: THE SAME SET AGAIN, OVER THE SINK IN ITS *EXPANDED*
    // SHAPE — AND 26.96-27'S GREEN IS DELIBERATELY NOT INHERITED.
    //
    // The expansion added FILTERED rows, a FALL-THROUGH and a NO-MATCH state
    // to this sink. Those rows are built by a different function, in a
    // different assignment, on a different element, and they are rebuilt on
    // every keystroke. ⛔ A gate that held over the tracer's at-rest rows may
    // not hold over any of that, and "it was green last wave" is exactly the
    // inheritance this round exists to stop.
    //
    // ⛔ THE PROOF THAT THIS DRIVE HOLDS IS STILL THE BARE QUOTE, NEVER THE
    // TAG. escapeAttr escapes & " and ' and deliberately NOT < or >.
    // -----------------------------------------------------------------
    let expandedDriven = 0;
    ATTR_PAYLOADS.forEach(function (p) {
      expandedDriven += 1;
      const tag = 'attr-breakout/picker-filtered/' + p.name;
      // ⛔ A THIRD OFFERED NAME THE QUERY DROPS, so this really is the
      // FILTERED state and not the at-rest one under another name.
      const d = drivePane(R3, undefined,
        [[p.value], [ATTR_PLAIN], ['Recipes']]);
      if (!d.editor) {
        violations.push('[attr-breakout] (picker-filtered/' + p.name + ') ' +
          'the pane never created its editor container');
        return;
      }
      const before = scanTags(rendered(d.editor)).filter(function (t) {
        return (t.attrs['class'] || '').split(/\s+/)
          .indexOf('vault-roster-choice') !== -1;
      }).length;
      if (!typeInto('attr-breakout/picker-filtered', d.editor, 'jo')) {
        return;
      }
      const markup = rendered(d.editor);
      const rows = scanTags(markup).filter(function (t) {
        return (t.attrs['class'] || '').split(/\s+/)
          .indexOf('vault-roster-choice') !== -1;
      });
      // ⛔ SAME ANCHOR, SAME REASON — see the note on the arm above.
      const at = markup.indexOf('class="vault-roster-choice"');
      const shown = at === -1 ? markup.slice(-260) :
        markup.slice(Math.max(0, at - 40), at + 260);
      console.log('  [' + tag + '] offeredBefore=' + before + ' rows=' +
        rows.length + ' value=' + (rows.length ?
          JSON.stringify(decodeAttr(rows[0].attrs['data-folder'])) :
          '(no row)'));
      if (before !== 3) {
        violations.push('[attr-breakout] (picker-filtered/' + p.name + ') ' +
          'the picker offered ' + before + ' row(s) BEFORE the keystroke, ' +
          'expected 3 — the filtered state below was never reached and ' +
          'nothing in it is evidence');
        return;
      }
      if (rows.length !== 2) {
        violations.push('[attr-breakout] (picker-filtered/' + p.name + ') ' +
          'the FILTERED picker parsed to ' + rows.length + ' offered row(s), ' +
          'expected exactly 2 of 3 — either the filter did not run or the ' +
          'filtered row markup did not survive an attribute-breakout name ' +
          'intact: ' + JSON.stringify(shown));
        return;
      }
      const got = rows.map(function (r) {
        return decodeAttr(r.attrs['data-folder']);
      });
      if (got[0] !== p.value) {
        violations.push('[attr-breakout] (picker-filtered/' + p.name + ') ⛔ ' +
          'THE FOLDER NAME DID NOT SURVIVE THE FILTERED ROW\'S ATTRIBUTE. ' +
          'Read the way a browser reads a quoted value it carries ' +
          JSON.stringify(got[0]) + ' instead of ' + JSON.stringify(p.value) +
          ' — so tapping that row would fence a DIFFERENT folder from the ' +
          'one she is looking at, on the one control where being wrong ' +
          'costs her privacy. ⛔ This row is built by the keystroke repaint, ' +
          'not by the at-rest render 26.96-27 held. Rendered: ' +
          JSON.stringify(shown));
      }
      if (got[1] !== ATTR_PLAIN) {
        violations.push('[attr-breakout/control] (picker-filtered/' + p.name +
          ') an ORDINARY folder name did not round-trip through the ' +
          'FILTERED picker: ' + JSON.stringify(got[1]) + ' vs ' +
          JSON.stringify(ATTR_PLAIN));
      }
      const VOCAB = ['type', 'class', 'data-folder', 'style'];
      const stray = Object.keys(rows[0].attrs).filter(function (k) {
        return VOCAB.indexOf(k) === -1;
      });
      if (stray.length) {
        violations.push('[attr-breakout] (picker-filtered/' + p.name + ') ' +
          'her folder name became ATTRIBUTES on a filtered row: ' +
          JSON.stringify(stray));
      }

      // ⛔ AND THE FALL-THROUGH / NO-MATCH STATE, WHERE THE ROWS ARE GONE
      // AND THE ONLY THING LEFT IS A LITERAL SENTENCE. What she typed must
      // reach NO markup at all here — the box she types into is a value, not
      // a sink, and the moment a typed name is echoed back onto the page it
      // becomes an injection surface nobody declared.
      // ⚠ THE QUERY IS PREFIXED so it matches nothing. Typing the payload
      // ITSELF matches the payload's own row, which is a one-row FILTERED
      // state wearing the word "no-match" — driven, caught, and corrected
      // rather than left reading as a state it was not.
      const typedAway = 'zzzz-' + p.value;
      if (!typeInto('attr-breakout/picker-nomatch', d.editor, typedAway)) {
        return;
      }
      const nm = rendered(d.editor);
      const nmRows = scanTags(nm).filter(function (t) {
        return (t.attrs['class'] || '').split(/\s+/)
          .indexOf('vault-roster-choice') !== -1;
      });
      // ⛔ THE BROWSER'S OWN RULE FIRST: strip every quoted attribute value,
      // then ask whether a live tag survived. escapeAttr deliberately does
      // not escape < or >, which is correct inside a quoted value and would
      // make a naive substring scan report the SHIPPED, SAFE output as an
      // injection.
      const liveTag = /<\s*(img|script|svg|iframe)\b/i
        .test(stripQuotedValues(nm));
      const echoed = nm.indexOf(p.value) !== -1;
      console.log('  [attr-breakout/picker-nomatch/' + p.name + '] rows=' +
        nmRows.length + ' saidNoMatch=' + (noMatchSaid(d.editor) !== null) +
        ' typedTextEchoed=' + echoed + ' liveTag=' + liveTag);
      if (nmRows.length !== 0) {
        violations.push('[attr-breakout] (picker-nomatch/' + p.name + ') a ' +
          'query matching nothing left ' + nmRows.length + ' offered row(s) ' +
          '— this is not the no-match state and nothing here is about it');
        return;
      }
      if (noMatchSaid(d.editor) === null) {
        violations.push('[attr-breakout] (picker-nomatch/' + p.name + ') the ' +
          'no-match state said nothing, so this arm is measuring an empty ' +
          'box rather than the state the sentence belongs to');
      }
      if (echoed || liveTag) {
        violations.push('[attr-breakout] ⛔ (picker-nomatch/' + p.name + ') ' +
          'WHAT SHE TYPED REACHED THE MARKUP (echoed=' + echoed +
          ', live tag=' + liveTag + '). The no-match state renders a literal ' +
          'sentence and NOTHING of hers; a typed name echoed back onto this ' +
          'page is an injection surface on the room\'s strongest privacy ' +
          'control that nobody declared.');
      }
    });
    console.log('  [attr-breakout/picker-expanded] payloads driven over the ' +
      'picker\'s FILTERED and NO-MATCH shapes: ' + expandedDriven + ' of ' +
      ATTR_PAYLOADS.length);
    if (expandedDriven !== ATTR_PAYLOADS.length) {
      violations.push('[attr-breakout] ⛔ THE EXPANDED SINK WAS DRIVEN OVER ' +
        expandedDriven + ' of ' + ATTR_PAYLOADS.length + ' payload(s). The ' +
        'filtered rows are built by a DIFFERENT assignment from the at-rest ' +
        'ones, so a payload that never saw them is a payload they are not ' +
        'held to.');
    }
    // ⛔ THE SET ITSELF IS ASSERTED NON-EMPTY AND MIXED. A payload set that
    // silently emptied — or that lost its bare-quote members to a well-meaning
    // tidy-up — would leave this group green over nothing at all, which is the
    // vacuous-zero class this file already carries two other guards against.
    // ⛔ 26.96-27: AND THE PICKER ARM IS ASSERTED TO HAVE RUN OVER THE WHOLE
    // SET, BY COUNT. Without this the extension could silently stop iterating
    // and the group would stay green having driven ONE sink — which is
    // precisely the shape V4 was in when it was claimed by nobody.
    console.log('  [attr-breakout/picker] payloads driven over the picker: ' +
      pickerDriven + ' of ' + ATTR_PAYLOADS.length);
    if (pickerDriven !== ATTR_PAYLOADS.length) {
      violations.push('[attr-breakout] ⛔ THE PICKER SINK WAS DRIVEN OVER ' +
        pickerDriven + ' of ' + ATTR_PAYLOADS.length + ' payload(s). One ' +
        'constant, two sinks: a payload the picker never saw is a payload ' +
        'the picker is not held to.');
    }
    const quoteMembers = ATTR_PAYLOADS.filter(function (p) {
      return p.value.indexOf('"') !== -1;
    });
    if (ATTR_PAYLOADS.length < 3 || quoteMembers.length < 2) {
      violations.push('[attr-breakout] ⛔ THE PAYLOAD SET DEGENERATED: ' +
        ATTR_PAYLOADS.length + ' payload(s), ' + quoteMembers.length +
        ' of them carrying a bare double quote. A breakout is proved by a ' +
        'QUOTE and never by a tag, so a set that has lost its quote members ' +
        'is a group that runs and proves nothing.');
    }
  });

// ---------------------------------------------------------------------------
// (OFFERED-INERT) ⛔ 26.96-46. THE PICKER'S TEXT-NODE SINK HAD NO BEHAVIOURAL
// GATE — AND THE DEFECT THAT PROVES IT IS NOT A DELETED ESCAPER.
//
// `paintRosterChoices` puts an offered folder path into TWO sinks inside one
// map body: an HTML ATTRIBUTE, through escapeAttr(path), and an HTML TEXT
// NODE, through escapeHtml(path). The two escapers are COMPLEMENTARY, not
// interchangeable — read from their own bodies in core.js, not assumed:
//
//     escapeHtml  escapes  &  <  >     and deliberately NOT  "  '
//     escapeAttr  escapes  &  "  '     and deliberately NOT  <  >
//
// So the dangerous defect on the TEXT half is not a MISSING call. It is the
// WRONG call: escapeAttr standing in a text node lets `<img …>` through as a
// LIVE ELEMENT, while still reading as a perfectly ordinary escaped operand to
// anything that judges the SOURCE rather than the OUTPUT.
//
// ⛔ DRIVEN AT HEAD 4de7eb1 IN A CLEAN CLONE, BEFORE THIS GROUP EXISTED. Each
// arm asserted the file's md5 MOVED and read the changed line back FROM DISK:
//
//   arm 1 — escapeHtml(path) DELETED from the text sink.
//           The suite goes RED — but from `seamShape` ALONE, 2 violations,
//           both "A RAW VALUE INTERPOLATION IS INSIDE A BLIND REGION".
//           ⛔ BOTH behavioural escaping instruments stayed GREEN in that same
//           run: escaping=1, attr-breakout=1, and ZERO violations filed under
//           either handle.
//
//   arm 2 — escapeHtml(path) REPLACED BY escapeAttr(path) in the text sink.
//           ⛔⛔ THE WHOLE SUITE IS GREEN, exit 0. escaping=1,
//           attr-breakout=1, seamShape=1, not one violation anywhere — over a
//           picker that renders her folder name as a LIVE <img> element.
//
// Arm 2 is why this group exists; arm 1 is why it had to be BEHAVIOURAL rather
// than one more static check. `seamShape` can prove an escaper is CALLED. It
// cannot prove the RIGHT one was called, because escapeAttr is a member of the
// very alternation it derives its own vocabulary from. Only rendering the
// markup and then judging THE MARKUP tells those two apart.
//
// ⛔ WHAT THIS GROUP IS NOT. It is not a second attr-breakout, and it does not
// fork that payload set. The picker's ATTRIBUTE half is ALREADY held, over the
// whole set and in all three of its shapes, by `attr-breakout/picker/*`,
// `attr-breakout/picker-filtered/*` and `attr-breakout/picker-nomatch/*`
// (26.96-27, 26.96-28). This group asks the OTHER question about the OTHER
// sink: does an offered name become an ELEMENT?
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? No — arm 2 is a fully green suite
//      over exactly this defect, and this group is RED on it.
//  (2) Can it STILL pass once broken? No — the stray-tag scan runs over
//      stripQuotedValues(markup), so what it sees is a live tag OUTSIDE any
//      quoted value, which is precisely what the wrong escaper produces.
//  (3) Does a DEGENERATE implementation satisfy it? No. The offered-row count
//      is printed and asserted to be exactly 2; the ordinary control name must
//      come back WHOLE in the same case; and the renderer's own button must be
//      present. Rendering nothing, rendering the wrong container, and escaping
//      everything into mush all fail.
//  (4) Evaluation order or source order? EVALUATION — it reads the markup the
//      shipped renderer produced for a driven offered list. Not one byte of
//      app.js source text is consulted here.
//  (5) Does it match THE FIX'S OWN COMMENT? It matches no comment at all:
//      there is no grep in this group.
// ---------------------------------------------------------------------------

// ⛔ THE OFFERED-NAME PAYLOAD. It carries `<` and `>` because THIS sink's
// escaper is the one that claims them — the mirror of ATTR_PAYLOADS, whose
// members carry the quote characters escapeAttr claims. ⛔ The two sets are
// deliberately NOT merged: a payload proves a sink only when it carries the
// characters that sink's escaper is responsible for, and a merged set would
// quietly re-run each half against the escaper that was never asked about it.
const OFFERED_MARKUP_NAME = 'Jo<img src=x onerror="alert(1)">urnal';

// Reads what a picker row SHOWS, applying the browser's own rule for where an
// open tag ends: a quoted attribute value may legally contain `>`, so the tag
// scan must step over quoted runs rather than stop at the first `>`. That is
// the same rule `scanTags` applies; this reader exists because `scanTags`
// returns attributes only and the sink under test here is the TEXT.
function offeredRows(markup) {
  const out = [];
  const re = /<button((?:[^>"]|"[^"]*")*)>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(markup)) !== null) {
    const attrs = {};
    const are = /([a-zA-Z-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) { attrs[a[1]] = a[2]; }
    if ((attrs['class'] || '').split(/\s+/)
      .indexOf('vault-roster-choice') === -1) { continue; }
    out.push({ attrs: attrs, text: m[2] });
  }
  return out;
}

// Undoes ONLY the entity encoding escapeHtml is supposed to have applied, in
// the REVERSE of the order it applies them — `&amp;` last, or an escaped
// `&lt;` would be decoded twice into a live `<`. Same discipline as
// `decodeAttr` above, for the other escaper.
function decodeTextNode(v) {
  return String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

group('offered-inert (a folder name the PICKER OFFERS renders inert — the ' +
  'TEXT-NODE half of the picker\'s sink, beside an ordinary name in the ' +
  'same case)', function () {
    // ⛔ THE THIRD PARAMETER IS THE WHOLE POINT. It defaults to the nested
    // fixture, which is why every drive that existed before this one rendered
    // the picker with ordinary names only — and why no behavioural group had
    // ever supplied this sink with a payload.
    const d = drivePane(R3, undefined,
      [[OFFERED_MARKUP_NAME], [ATTR_PLAIN]]);
    if (!d.editor) {
      violations.push('[offered-inert] the pane never created its editor ' +
        'container — nothing was rendered, so nothing is proven');
      return;
    }
    // ⚠ `rendered()`, not `innerHTML`: the offered rows live in the
    // `.vault-roster-choices` child container, so reading innerHTML alone
    // would find zero rows and this whole group would go quiet over the very
    // sink it exists for. Driven, not assumed — the same trap 26.96-28
    // recorded on the attribute arm.
    const markup = rendered(d.editor);
    if (!markup.length) {
      violations.push('[offered-inert] the captured markup is EMPTY — ' +
        'nothing was rendered, so nothing was escaped');
      return;
    }
    const rows = offeredRows(markup);
    // ⛔ PRINTED BEFORE ANY VERDICT. A green over a picker that rendered
    // nothing is the failure this control refuses, so the count and the text
    // each row really shows are printed rather than inferred.
    console.log('  [offered-inert] offeredRows=' + rows.length +
      ' texts=' + JSON.stringify(rows.map(function (r) {
        return decodeTextNode(r.text);
      })));
    if (rows.length !== 2) {
      violations.push('[offered-inert] expected exactly 2 offered rows for a ' +
        '2-entry answer, the browser-rule parse found ' + rows.length +
        ' — either the picker offered nothing (in which case every verdict ' +
        'below is vacuous) or an offered name broke its own row markup: ' +
        JSON.stringify(markup.slice(0, 240)));
      return;
    }
    // ⛔ THE SAFETY PROPERTY, ASKED OF THE OUTPUT. Strip every quoted
    // attribute value first — escapeHtml deliberately does not escape `"`,
    // and `<` and `>` are legal inside a quoted value — then ask which tags
    // the output actually OPENS. An injected element appears here as a name
    // outside the renderer's own vocabulary, whatever it is called.
    // ⛔ Do NOT "simplify" this to a scan for `onerror`: the correctly ESCAPED
    // row text legitimately contains the characters `onerror=` (that is the
    // proof it was escaped), so such a scan reports the shipped, safe output
    // as an injection. That trap is already recorded on the roster-path
    // `escaping` group; it is not walked into here.
    const bare = stripQuotedValues(markup);
    // ⚠ DERIVED BY MEASUREMENT AT 4de7eb1, not guessed: the pane's rendered
    // vocabulary over `rendered()` is exactly button, div, input, p, span.
    const ALLOWED = ['div', 'p', 'span', 'button', 'input'];
    const seen = [];
    const tre = /<\/?([a-zA-Z][a-zA-Z0-9]*)/g;
    let t;
    while ((t = tre.exec(bare)) !== null) {
      const name = t[1].toLowerCase();
      if (seen.indexOf(name) === -1) { seen.push(name); }
    }
    const stray = seen.filter(function (n) {
      return ALLOWED.indexOf(n) === -1;
    });
    if (stray.length) {
      violations.push('[offered-inert] ⛔ AN OFFERED FOLDER NAME BECAME AN ' +
        'ELEMENT. The rendered markup opens tag(s) outside this renderer\'s ' +
        'own vocabulary: ' + JSON.stringify(stray) + '. The offered list is ' +
        'built from names discovered by WALKING HER REAL VAULT, so this is ' +
        'her own data reaching the page as live markup on the room\'s ' +
        'strongest privacy control: ' + JSON.stringify(bare.slice(0, 240)));
    }
    if (seen.indexOf('button') === -1) {
      violations.push('[offered-inert] the tag scan found no button at all — ' +
        'the output is not the picker, so the check above passed on the ' +
        'wrong thing: ' + JSON.stringify(seen));
    }
    // THE PAYLOAD ROW: its text must come back as the WHOLE original name once
    // only the escaper's own entity encoding is undone. A row that shows a
    // truncated or mangled name is a row that names a DIFFERENT folder from
    // the one she is looking at.
    const got = rows.map(function (r) { return decodeTextNode(r.text); });
    if (got[0] !== OFFERED_MARKUP_NAME) {
      violations.push('[offered-inert] the offered row does not SHOW the ' +
        'folder name it would fence. Decoded the way a browser reads a text ' +
        'node it carries ' + JSON.stringify(got[0]) + ' instead of ' +
        JSON.stringify(OFFERED_MARKUP_NAME) + ' — so she is reading one ' +
        'folder and tapping another.');
    }
    // ⛔ THE ESCAPED FORM, BY VALUE. Without this, a renderer that dropped the
    // name entirely would satisfy every check above: no stray tag, because no
    // name at all.
    if (markup.indexOf('&lt;img') === -1) {
      violations.push('[offered-inert] the escaped form &lt;img is absent — ' +
        'the offered name was neither escaped NOR shown in the row text, so ' +
        'this case proves nothing: ' + JSON.stringify(markup.slice(0, 240)));
    }
    // THE POSITIVE CONTROL, IN THE SAME CASE AS THE PAYLOAD — never in a case
    // of its own. An ordinary offered name must come back untouched, so an
    // over-escaping renderer is caught here as surely as an under-escaping one
    // is caught above.
    if (got[1] !== ATTR_PLAIN) {
      violations.push('[offered-inert/control] an ORDINARY offered folder ' +
        'name did not round-trip through the picker\'s text node: ' +
        JSON.stringify(got[1]) + ' vs ' + JSON.stringify(ATTR_PLAIN) +
        ' — the reader above is measuring something other than the row text, ' +
        'so its verdict means nothing either way');
    }

    // -----------------------------------------------------------------
    // ⛔ AND THE SAME SINK IN ITS *FILTERED* SHAPE, DRIVEN RATHER THAN
    // ASSUMED TO FOLLOW.
    //
    // The at-rest rows and the filtered rows come out of the same map body,
    // so a dropped or wrong escaper breaks both — but they are REBUILT ON
    // EVERY KEYSTROKE through a different call path, and 26.96-28 recorded
    // exactly that distinction when it extended the attribute arm here.
    // ⛔ Leaving the text half held only at rest would be this file's own
    // named failure — an instrument credited with reach it has not been
    // driven over. One extra drive is cheaper than the sentence explaining
    // why it was not done.
    // ⚠ A THIRD offered name the query drops, so this really is the FILTERED
    // state and not the at-rest one under another name.
    // -----------------------------------------------------------------
    const f = drivePane(R3, undefined,
      [[OFFERED_MARKUP_NAME], [ATTR_PLAIN], ['Recipes']]);
    if (!f.editor) {
      violations.push('[offered-inert/filtered] the pane never created its ' +
        'editor container');
      return;
    }
    const beforeRows = offeredRows(rendered(f.editor)).length;
    if (!typeInto('offered-inert/filtered', f.editor, 'jo')) { return; }
    const fMarkup = rendered(f.editor);
    const fRows = offeredRows(fMarkup);
    console.log('  [offered-inert/filtered] offeredBefore=' + beforeRows +
      ' rows=' + fRows.length + ' texts=' +
      JSON.stringify(fRows.map(function (r) {
        return decodeTextNode(r.text);
      })));
    if (beforeRows !== 3) {
      violations.push('[offered-inert/filtered] the picker offered ' +
        beforeRows + ' row(s) BEFORE the keystroke, expected 3 — the ' +
        'filtered state below was never reached and nothing in it is ' +
        'evidence');
      return;
    }
    if (fRows.length !== 2) {
      violations.push('[offered-inert/filtered] the FILTERED picker parsed ' +
        'to ' + fRows.length + ' offered row(s), expected exactly 2 of 3 — ' +
        'either the filter did not run or a filtered row\'s markup did not ' +
        'survive a name carrying markup: ' +
        JSON.stringify(fMarkup.slice(0, 240)));
      return;
    }
    const fBare = stripQuotedValues(fMarkup);
    const fSeen = [];
    const ftre = /<\/?([a-zA-Z][a-zA-Z0-9]*)/g;
    let ft;
    while ((ft = ftre.exec(fBare)) !== null) {
      const fn = ft[1].toLowerCase();
      if (fSeen.indexOf(fn) === -1) { fSeen.push(fn); }
    }
    const fStray = fSeen.filter(function (n) {
      return ALLOWED.indexOf(n) === -1;
    });
    if (fStray.length) {
      violations.push('[offered-inert/filtered] ⛔ AN OFFERED FOLDER NAME ' +
        'BECAME AN ELEMENT IN A FILTERED ROW: ' + JSON.stringify(fStray) +
        '. These rows are built by the keystroke repaint, not by the at-rest ' +
        'render, so the at-rest arm above could not have caught this: ' +
        JSON.stringify(fBare.slice(0, 240)));
    }
    const fGot = fRows.map(function (r) { return decodeTextNode(r.text); });
    if (fGot[0] !== OFFERED_MARKUP_NAME) {
      violations.push('[offered-inert/filtered] a FILTERED offered row does ' +
        'not SHOW the folder name it would fence. Decoded the way a browser ' +
        'reads a text node it carries ' + JSON.stringify(fGot[0]) +
        ' instead of ' + JSON.stringify(OFFERED_MARKUP_NAME) + '.');
    }
    if (fGot[1] !== ATTR_PLAIN) {
      violations.push('[offered-inert/filtered/control] an ORDINARY offered ' +
        'name did not round-trip through the FILTERED picker: ' +
        JSON.stringify(fGot[1]) + ' vs ' + JSON.stringify(ATTR_PLAIN));
    }
  });

// ---------------------------------------------------------------------------
// (SOURCE) ⚠ LABELLED A SOURCE GATE, AND NEVER PRESENTED AS BEHAVIOURAL
// PROOF. It reads the text of a lifted body. It is here because an id lookup
// inside the seam is invisible to every behavioural case above — the double
// would simply never be asked — and would break the day both hosts are on
// screen at once.
// ---------------------------------------------------------------------------
group('source (the shared renderer addresses no DOM id)', function () {
  const body = extractFn(APP_SRC, 'renderRosterEditor');
  if (/getElementById/.test(body)) {
    violations.push('[source] renderRosterEditor calls getElementById — ⚠ ' +
      'THIS IS A SOURCE-TEXT ASSERTION, not behavioural proof. Two hosts ' +
      'cannot share a global id; every control in the seam must be reached ' +
      'through the container it was passed.');
  }
  if (/[^A-Za-z0-9_.]\$\(/.test(body)) {
    violations.push('[source] renderRosterEditor calls the id-lookup helper ' +
      '— ⚠ SOURCE-TEXT ASSERTION. Same reason as above.');
  }
});

// ---------------------------------------------------------------------------
// (R1/R2/R3) THE PLACEMENT — position, unconditionality, and absent count.
//
// THE FIVE ANTI-VACUITY ANSWERS, and answer (4) explicitly because it is the
// one this group could most easily get wrong.
//  (1) Before the work? No — there was no roster entry to index.
//  (2) Once deliberately broken? No — three plants were executed in scratch
//      copies and each turned its own case red with its named control green.
//  (3) Degenerate implementation? No — the count case pins a key that
//      LEGITIMATELY carries a count to a number, so a count function that
//      answered null for everything is refused.
//  (4) EVALUATION ORDER, not source order. The indices are computed from the
//      PARSED registry and the rail is ACTUALLY RENDERED against a double —
//      nothing here greps app.js for a position.
//  (5) A comment cannot satisfy any case here.
//
// ⚠⚠ THE CONTROL FOR R1 IS ADJACENCY, NOT A PINNED NEIGHBOUR INDEX, AND THE
// REASON IS ARITHMETIC. Inserting this phase's entry near the top pushes
// every later entry DOWN by one; the plant that proves R1 red — moving the
// entry to the end — pulls them all back UP by one. A control pinned to a
// neighbour's ABSOLUTE index would therefore be required to change in exactly
// the run where it had to stay green: a control that can only fail is the
// same defect as one that can only pass. Gaps are invariant under both.
// ---------------------------------------------------------------------------
group('R1/R2/R3 (placement: position by index, unconditional, no count)',
  function () {
    const panes = new Function('return ' + REGISTRY_SRC + ';')();
    if (!Array.isArray(panes) || panes.length === 0) {
      violations.push('[R1] the registry slice did not parse to a non-empty ' +
        'array — a failed slice would make every assertion below a pass ' +
        'over nothing');
      return;
    }
    function idx(key) {
      for (let i = 0; i < panes.length; i++) {
        if (panes[i].key === key) { return i; }
      }
      return -1;
    }
    const iLib = idx('librarian');
    const iRos = idx('roster');
    const iCle = idx('cleaning');
    if (iLib === -1 || iRos === -1 || iCle === -1) {
      violations.push('[R1] a required registry key is missing (librarian=' +
        iLib + ' roster=' + iRos + ' cleaning=' + iCle + ')');
      return;
    }
    // ⛔ BY INDEX VALUE, never by presence: a presence check on the rail is
    // true at ANY position and would survive the entry being moved to the end.
    if (iRos !== iLib + 1) {
      violations.push('[R1] the fence pane sits at index ' + iRos +
        ', expected ' + (iLib + 1) + ' — immediately under the librarian, ' +
        'because it is the librarian\'s own boundary. Burying the app\'s ' +
        'strongest protection further down repeats the discoverability ' +
        'failure this phase exists to close.');
    }
    if (!(iRos < iCle)) {
      violations.push('[R1] the fence pane sits at ' + iRos + ', not above ' +
        'the tidy-up entry at ' + iCle);
    }
    // CONTROL (a): adjacency — invariant under the move-to-the-end plant,
    // red on any accidental reorder of these three.
    const iFil = idx('filters');
    const iNev = idx('never');
    const iHid = idx('hidden');
    if (iNev - iFil !== 1) {
      violations.push('[R1/control-adjacency] the gap between the filters ' +
        'entry and the never-show entry is ' + (iNev - iFil) +
        ', expected 1 BY VALUE');
    }
    if (iHid - iNev !== 1) {
      violations.push('[R1/control-adjacency] the gap between the never-show ' +
        'entry and the hidden entry is ' + (iHid - iNev) +
        ', expected 1 BY VALUE');
    }
    // CONTROL (b): length by value. ⚠ DERIVED AT EXECUTION on 2026-08-20 —
    // the shipped registry held 15 entries, this phase adds exactly one, so
    // 16. ⛔ Not copied from any planning document: four of them pinned a
    // count of something in this tree and all four were wrong.
    // ⚠ MOVED 16 → 17 by 26.99955-04 (2026-08-26): 26.9985 added the
    // set-aside (`subjects`) entry to the registry without moving this pin,
    // leaving the gate red at HEAD across two phases (attributed as D-01-A
    // in the 26.99955 deferred-items ledger). 17 is the value measured from
    // the shipped registry at execution, per this control's own charter.
    // ⚠ MOVED 17 → 18 by the 26.99955 UAT fix work (2026-08-26), HER RULING
    // G-…-01: the librarian's suggestions used to stream down the Manage
    // front page uncapped — the one surface there that was neither a framed
    // panel nor a tile — and she ruled that they fold into a tile you open,
    // which is one more registry entry (`noticed`). ⭐ THIS PIN WENT RED THE
    // MOMENT IT WAS ADDED, which is the control working: the two phases
    // above it added entries and left it red instead, and moving it in the
    // same breath as the entry is the discipline that record asks for.
    // 18 is measured from the shipped registry at execution, not copied.
    if (panes.length !== 18) {
      violations.push('[R1/control-length] the registry holds ' +
        panes.length + ' entries, expected 18 BY VALUE — an entry has been ' +
        'dropped or duplicated. (Invariant under a REORDER, which is what ' +
        'makes it a control for R1 rather than a restatement of it.)');
    }
    // R2 — UNCONDITIONALITY, driven: the rail is really rendered with the
    // tidy-up tier ABSENT.
    const railCalls = { get: [], post: [] };
    const dom = makeDom();
    const railSrc =
      'var CLEAN = { present: false };' +
      'var MANAGE = { pane: null, items: {} };' +
      'var SHELF = { filters: ["a", "b"] };' +
      'function sectionMembers() { return []; }' +
      'function showManagePane() {}' +
      'function $(id) { return DOM(id); }' +
      ESCAPERS +
      'var MANAGE_PANES = ' + REGISTRY_SRC + ';' +
      extractFn(APP_SRC, 'manageRailCount') + '\n' +
      // 26.99955-07: renderManageRail groups the list with the SHIPPED
      // manageLandingGroup (the drawn separators are derived, never a second
      // hand-kept list), so the sandbox lifts the real function rather than
      // stubbing it — a stub here would let the rail render under a grouping
      // this suite invented.
      extractFn(APP_SRC, 'manageLandingGroup') + '\n' +
      extractFn(APP_SRC, 'renderManageRail') + '\n' +
      'return { rail: renderManageRail, count: manageRailCount };';
    const rapi = new Function('CALLS', 'DOM', 'TRANSPORT', railSrc)(
      railCalls, dom, null);
    rapi.rail();
    const railHtml = dom('manage-rail').innerHTML;
    const rosterLabel = panes[iRos].label;
    const cleaningLabel = panes[iCle].label;
    const librarianLabel = panes[iLib].label;
    // ⚠ Without these two, a rail render that silently failed and produced
    // NOTHING would satisfy "the tidy-up label is absent" by producing
    // nothing at all.
    if (!railHtml || railHtml.length === 0) {
      violations.push('[R2] the rendered rail is EMPTY — the absence check ' +
        'below would pass on nothing');
      return;
    }
    if (railHtml.indexOf(librarianLabel) === -1) {
      violations.push('[R2] the rendered rail does not carry the librarian ' +
        'entry — the render did not really run');
    }
    if (railHtml.indexOf(rosterLabel) === -1) {
      violations.push('[R2] the fence pane is ABSENT from a rail rendered ' +
        'with the tidy-up tier absent. It must be unconditional: someone ' +
        'turning the librarian off is exactly the person who wants to see ' +
        'what it was never allowed to read.');
    }
    if (railHtml.indexOf(cleaningLabel) !== -1) {
      violations.push('[R2/control] the tidy-up entry is PRESENT with its ' +
        'tier absent — the filter did not run, so the previous assertion ' +
        'proved nothing about conditionality');
    }
    // R3 — NO COUNT, by value, with both controls in the same run.
    if (rapi.count('roster') !== null) {
      violations.push('[R3] the rail count for the fence pane is ' +
        JSON.stringify(rapi.count('roster')) + ', expected null BY VALUE. ' +
        '⚠ The default branch COMPUTES a count from item sections, so a ' +
        'forgotten key produces a plausible WRONG NUMBER, not silence — and ' +
        'a number beside her private folders is a count of her own things ' +
        'out of reach.');
    }
    if (rapi.count('sources') !== null) {
      violations.push('[R3/control] the connected-apps key no longer ' +
        'returns null — the control itself is broken, so R3 above proves ' +
        'nothing');
    }
    if (typeof rapi.count('filters') !== 'number') {
      violations.push('[R3/control] a key that LEGITIMATELY carries a count ' +
        'no longer returns a number — without this, a count function that ' +
        'answered null for everything would satisfy both assertions above');
    }
  });

// ===========================================================================
// 26.96-03 WAVE 3 — A FAILED PRIVACY CHANGE SAYS SO. Today it does not.
//
// ⚠⚠ THE DEFECT HAS TWO ARMS AND ONLY ONE IS VISIBLE IN THE CODE THAT CAUSES
// IT. The shipped post helper RESOLVES on any HTTP status and REJECTS only on
// a network or parsing failure, so the field-clearing handler runs after a
// swallowed rejection (ARM A) *and* after a refused save (ARM B). A fix — or
// a test — that addresses one addresses half the problem. Every case below
// therefore drives exactly ONE arm, and its sibling is the control.
//
// THE FIVE ANTI-VACUITY ANSWERS, for this whole block.
//  (1) Can it pass BEFORE the work is done? No — recorded verbatim, with its
//      return code, in 26.96-03-SUMMARY.md: five cases red against the
//      unfixed write path, the harness proven not to have crashed, and every
//      26.96-02 group still green in the same run.
//  (2) Can it still pass once deliberately broken? No — each of the three
//      defects is restored ALONE in a scratch copy OUTSIDE the repo and its
//      own case goes red while its named sibling stays green. ⚠ And each
//      mutation site is FIRST proven semantically LIVE by a canary throw
//      planted at that exact site, because 26.96-02 recorded a mutant that
//      changed the file and changed NOTHING on the driven path — after which
//      a surviving mutant and a dead gate are indistinguishable.
//  (3) Does a degenerate implementation satisfy it? No — `clearOK` refuses a
//      fix that simply never clears the field, `successQuiet` refuses one
//      that always reports failure, and `emptySubmit` refuses one that writes
//      on an empty field.
//  (4) Is it reading evaluation order or source order? EVALUATION ORDER. The
//      expected sentence is LIFTED from shipped bytes rather than re-typed,
//      but every assertion is made against the markup the renderer actually
//      produced, read back out of the container double.
//  (5) Could a grep match the fix's own comment? No — this block contains no
//      grep over app.js, and the note slot's contents come from the double.
// ===========================================================================

// ⚠ THE FAILURE LINE IS LIFTED FROM THE SHIPPED SOURCE, NEVER RE-TYPED. It
// ships with a STRAIGHT apostrophe and an EM DASH, and this project's
// recorded failure mode is a reword wearing the costume of a copy: an
// annotation claiming "this is your existing wording" is a claim about
// shipped bytes and must be verified against them. The connected-apps
// disconnect handler is where those bytes live today.
function shippedFailureLine() {
  const body = extractFn(APP_SRC, 'handleSourceDisconnect');
  const m = body.match(/"(couldn't save[^"]*)"/);
  return m ? m[1] : null;
}

const FAIL_LINE = shippedFailureLine();

group('copy (the failure line is LIFTED from shipped bytes, not re-typed)',
  function () {
    if (FAIL_LINE === null) {
      violations.push('[copy] the shipped failure line could not be lifted ' +
        'out of handleSourceDisconnect — every failure-arm case below would ' +
        'then be comparing rendered output against null, which is the silent ' +
        'vacuity this group exists to refuse');
      return;
    }
    if (FAIL_LINE.indexOf('—') === -1) {
      violations.push('[copy] the lifted line carries no EM DASH (U+2014): ' +
        JSON.stringify(FAIL_LINE) + ' — the shipped sentence uses one, and a ' +
        'hyphen in its place is a reword');
    }
    if (FAIL_LINE.indexOf('’') !== -1) {
      violations.push('[copy] the lifted line carries a CURLY apostrophe ' +
        '(U+2019): ' + JSON.stringify(FAIL_LINE) + ' — the shipped sentence ' +
        'uses a straight one');
    }
    if (FAIL_LINE.indexOf("'") === -1) {
      violations.push('[copy] the lifted line carries no straight ' +
        'apostrophe: ' + JSON.stringify(FAIL_LINE));
    }
  });

// The store read both hosts make before painting. Always answers, on both
// arms, so a failure-arm case is driving the WRITE and never the read.
function metaAnswer(fencedRoster) {
  return shippedThenable({ ok: true, status: 200,
    data: { meta: { fenced_roster: fencedRoster } } });
}

// ARM A — the request never completes: the room is not answering, the
// connection drops, or the answer is not readable. ⛔ Driven with the
// REJECTING stub 26.96-01 built and proved. The shipped pass-through thenable
// cannot express this: its catch never invokes its handler, so the swallowing
// defect and its fix produce byte-identical output under it.
function rejectingRoster(fencedRoster) {
  return function (url) {
    if (url === '/api/items') { return metaAnswer(fencedRoster); }
    return rejectingP(new TypeError('Failed to fetch'));
  };
}

// ARM B — the request completes and the answer is NOT ok: a refused
// operation, a refused origin, a failed save. ⚠ The answer carries an error
// and NO fenced_roster, which is what the route actually sends on a refusal.
function refusingRoster(fencedRoster) {
  return function (url) {
    if (url === '/api/items') { return metaAnswer(fencedRoster); }
    return shippedThenable({ ok: false, status: 400,
      data: { error: 'the write was refused' } });
  };
}

function noteOf(container) {
  if (!container) { return null; }
  const n = container.querySelector('.vault-roster-note');
  return n ? n.innerHTML : null;
}

function fireRemove(editor, folder, where) {
  if (!editor) {
    violations.push('[' + where + '] there is no editor container — nothing ' +
      'was driven and nothing below is evidence');
    return null;
  }
  const target = editor.querySelectorAll('.vault-roster-remove').filter(
    function (b) { return b.getAttribute('data-folder') === folder; })[0];
  if (!target) {
    violations.push('[' + where + '] no remove control carried data-folder=' +
      JSON.stringify(folder) + ' — nothing was driven');
    return null;
  }
  target.fire();
  return target;
}

// ⚠ BOTH HALVES ARE ASSERTED, AND THAT IS DELIBERATE. A renderer that
// produced nothing at all would satisfy "the line is there" if the line were
// the only assertion — so the markup is asserted non-empty and the acted-on
// row asserted still present in the SAME group.
function assertSaidSo(where, editor) {
  const markup = editor ? editor.innerHTML : '';
  if (!markup || markup.length === 0) {
    violations.push('[' + where + '] the captured editor markup is EMPTY — ' +
      'a renderer that produced nothing would satisfy a naive "the sentence ' +
      'is present" check, and this assertion is what refuses that');
    return;
  }
  const note = noteOf(editor);
  if (note === null) {
    violations.push('[' + where + '] the editor declared no ' +
      '.vault-roster-note slot, so a failed write has nowhere to speak');
    return;
  }
  if (FAIL_LINE === null || note.indexOf(FAIL_LINE) === -1) {
    violations.push('[' + where + '] A FAILED ROSTER WRITE SAID NOTHING. The ' +
      'note slot holds ' + JSON.stringify(note) + ' and does not carry the ' +
      'shipped line ' + JSON.stringify(FAIL_LINE) + ' byte-exactly. ⚠ This ' +
      'is not polish: a person can type a folder name, watch the field empty ' +
      'itself, and reasonably believe that folder is now private when the ' +
      'write never landed — the strongest privacy control in the room ' +
      'reporting a success it did not have.');
  }
  if (note.indexOf('var(--ink-soft)') === -1) {
    violations.push('[' + where + '] the failure line is not in the pane\'s ' +
      'own quiet register (soft ink): ' + JSON.stringify(note));
  }
  if (note.indexOf('quiet-error') !== -1) {
    violations.push('[' + where + '] the failure line wears the app\'s ' +
      'strongest safety register, whose class resolves to the vermillion ' +
      'token. Letting the librarian read a folder again is neither a failure ' +
      'nor the never action, and painting her own privacy control red would ' +
      'teach her that protecting herself looks like breakage: ' +
      JSON.stringify(note));
  }
}

function assertRowStayed(where, editor, folder) {
  const markup = editor ? editor.innerHTML : '';
  if (markup.indexOf(folder) === -1) {
    violations.push('[' + where + '] the row she acted on is GONE from the ' +
      'captured markup after a FAILED write. Nothing changed, so nothing ' +
      'should look changed — and the control is its own retry: ' +
      JSON.stringify(markup.slice(0, 160)));
  }
}

// ---------------------------------------------------------------------------
// (armA) THE REQUEST NEVER COMPLETES.
// ---------------------------------------------------------------------------
group('armA (a REJECTED roster write says so, and the acted-on row stays)',
  function () {
    const d = drivePane(R3, rejectingRoster(R3));
    if (!d.editor) {
      violations.push('[armA] the pane never created its editor container');
      return;
    }
    nonEmptyNamed('armA', d.editor.innerHTML, R3);
    if (fireRemove(d.editor, 'personnel notes', 'armA')) {
      assertSaidSo('armA', d.editor);
      assertRowStayed('armA', d.editor, 'personnel notes');
    }
    // S4 — the same fix reaches the vault-import screen because it lands in
    // the SHARED path. A convergence, not a fork.
    const i = driveImport(R3, rejectingRoster(R3));
    if (fireRemove(i.editor, 'personnel notes', 'armA/import')) {
      assertSaidSo('armA/import', i.editor);
      assertRowStayed('armA/import', i.editor, 'personnel notes');
    }
  });

// ---------------------------------------------------------------------------
// (armB) THE REQUEST COMPLETES AND THE ANSWER IS NOT OK.
// ⚠ armA is this case's control and this case is armA's: a fix that handled
// only the rejection would be green THERE and red HERE, and vice versa.
// ---------------------------------------------------------------------------
group('armB (a REFUSED roster write says so, and the acted-on row stays)',
  function () {
    const d = drivePane(R3, refusingRoster(R3));
    if (!d.editor) {
      violations.push('[armB] the pane never created its editor container');
      return;
    }
    nonEmptyNamed('armB', d.editor.innerHTML, R3);
    if (fireRemove(d.editor, 'personnel notes', 'armB')) {
      assertSaidSo('armB', d.editor);
      assertRowStayed('armB', d.editor, 'personnel notes');
    }
    const i = driveImport(R3, refusingRoster(R3));
    if (fireRemove(i.editor, 'personnel notes', 'armB/import')) {
      assertSaidSo('armB/import', i.editor);
      assertRowStayed('armB/import', i.editor, 'personnel notes');
    }
  });

// ---------------------------------------------------------------------------
// (fieldA / fieldB) HER TYPED FOLDER NAME SURVIVES A FAILED ADD.
// ⛔ These two assert the FIELD VALUE and nothing else. Folding the sentence
// assertion in here as well would make the swallowing-catch re-plant turn
// fieldA red as collateral and blur exactly the independence the re-plants
// exist to demonstrate.
// ---------------------------------------------------------------------------
function driveFailedAdd(where, transport) {
  const d = drivePane(R3, transport);
  if (!d.editor) {
    violations.push('[' + where + '] the pane never created its editor');
    return null;
  }
  const field = d.editor.querySelector('.vault-roster-add-input');
  const add = d.editor.querySelector('.vault-roster-add');
  if (!field || !add) {
    violations.push('[' + where + '] the add field or the add control is ' +
      'missing from the rendered editor');
    return null;
  }
  field.value = 'Diaries';
  add.fire();
  return { d: d, field: field };
}

function assertTypedNameSurvived(where, r) {
  if (!r) { return; }
  if (r.field.value !== 'Diaries') {
    violations.push('[' + where + '] after a FAILED add the field holds ' +
      JSON.stringify(r.field.value) + ', expected "Diaries" BY VALUE. The ' +
      'field emptying itself is the room telling her the folder is now ' +
      'private; it must clear ONLY after a write the route actually accepted.');
  }
}

group('fieldA (a failed add under a REJECTING transport keeps her typed name)',
  function () {
    assertTypedNameSurvived('fieldA',
      driveFailedAdd('fieldA', rejectingRoster(R3)));
  });

group('fieldB (a failed add under a NOT-OK answer keeps her typed name)',
  function () {
    assertTypedNameSurvived('fieldB',
      driveFailedAdd('fieldB', refusingRoster(R3)));
  });

// ---------------------------------------------------------------------------
// (clearOK) THE CONTROL. A successful add STILL clears the field — this is
// what keeps the fix from degenerating into "never clear anything".
// ⚠ It is green BEFORE the fix as well as after, deliberately.
// ---------------------------------------------------------------------------
group('clearOK (a SUCCESSFUL add still clears the field)', function () {
  const d = drivePane(R3);
  if (!d.editor) {
    violations.push('[clearOK] the pane never created its editor container');
    return;
  }
  const field = d.editor.querySelector('.vault-roster-add-input');
  const add = d.editor.querySelector('.vault-roster-add');
  if (!field || !add) {
    violations.push('[clearOK] the add field or the add control is missing');
    return;
  }
  field.value = 'Diaries';
  add.fire();
  if (field.value !== '') {
    violations.push('[clearOK] after a SUCCESSFUL add the field holds ' +
      JSON.stringify(field.value) + ', expected "" BY VALUE — a fix that ' +
      'simply stopped clearing the field on every arm would satisfy fieldA ' +
      'and fieldB while leaving her to delete her own text after every add');
  }
});

// ---------------------------------------------------------------------------
// (emptySubmit) TAPPING ADD WITH AN EMPTY FIELD IS A SILENT NO-OP.
// ⛔ Never a required marker, never a red border, never a confirmation.
// ---------------------------------------------------------------------------
group('emptySubmit (an empty add records zero writes and says nothing)',
  function () {
    const d = drivePane(R3);
    if (!d.editor) {
      violations.push('[emptySubmit] the pane never created its editor');
      return;
    }
    const field = d.editor.querySelector('.vault-roster-add-input');
    const add = d.editor.querySelector('.vault-roster-add');
    if (!field || !add) {
      violations.push('[emptySubmit] the add field or control is missing');
      return;
    }
    field.value = '   ';
    const before = d.s.calls.post.length;
    add.fire();
    const posted = d.s.calls.post.length - before;
    if (posted !== 0) {
      violations.push('[emptySubmit] an empty add recorded ' + posted +
        ' write(s), expected 0 BY VALUE: ' +
        JSON.stringify(d.s.calls.post.slice(before)));
    }
    const note = noteOf(d.editor);
    if (note && FAIL_LINE && note.indexOf(FAIL_LINE) !== -1) {
      violations.push('[emptySubmit] an empty add rendered the failure line ' +
        '— nothing was attempted, so nothing failed');
    }
  });

// ---------------------------------------------------------------------------
// (successQuiet) THE OTHER DEGENERATE FIX, REFUSED. `clearOK` refuses an
// implementation that simply never clears the field; this refuses one that
// simply always reports failure — which would turn armA and armB green while
// telling her every successful privacy change had failed.
//
// ⚠ EMPTINESS IS NOT ENOUGH HERE and that is the whole point of the write
// counter. A failure renderer that ran and was then repainted over would
// leave the note slot empty. So this asserts the slot was WRITTEN INTO ZERO
// TIMES, which only a fix that genuinely did not call it can satisfy.
// ---------------------------------------------------------------------------
group('successQuiet (an ACCEPTED write records exactly one post and never ' +
  'calls the failure renderer)', function () {
  const d = drivePane(R3);
  if (!d.editor) {
    violations.push('[successQuiet] the pane never created its editor');
    return;
  }
  // Registered BEFORE the drive, so the counter is watching from the start.
  const note = d.editor.querySelector('.vault-roster-note');
  if (!note) {
    violations.push('[successQuiet] the editor declared no note slot');
    return;
  }
  const before = d.s.calls.post.length;
  if (!fireRemove(d.editor, 'personnel notes', 'successQuiet')) { return; }
  const posted = d.s.calls.post.length - before;
  if (posted !== 1) {
    violations.push('[successQuiet] one tap on an ACCEPTED write recorded ' +
      posted + ' write(s), expected exactly 1 BY VALUE: ' +
      JSON.stringify(d.s.calls.post.slice(before)));
  }
  if (note.writes !== 0) {
    violations.push('[successQuiet] the failure renderer wrote into the note ' +
      'slot ' + note.writes + ' time(s) after a write the route ACCEPTED, ' +
      'expected 0 BY VALUE. An implementation that always reports failure ' +
      'would satisfy armA and armB while telling her that every successful ' +
      'change to her own privacy list had failed.');
  }
  if (FAIL_LINE && d.editor.innerHTML.indexOf(FAIL_LINE) !== -1) {
    violations.push('[successQuiet] the failure sentence is on screen after ' +
      'an accepted write: ' + JSON.stringify(d.editor.innerHTML.slice(0, 160)));
  }
});

// ---------------------------------------------------------------------------
// (inFlight) THE ACTED-ON CONTROL IS DISABLED FOR THE ROUND TRIP.
// ⛔ No spinner and no progress bar: one fast local write is not a job.
// ⚠ The mid-flight reading is taken INSIDE the transport, which the shipped
// post helper calls between the disable and the answer — so this reads
// evaluation order, not source text.
// ---------------------------------------------------------------------------
group('inFlight (the control is disabled for the round trip, no spinner)',
  function () {
    const held = { btn: null, midFlight: null };
    const d = drivePane(R3, function (url) {
      if (url === '/api/items') { return metaAnswer(R3); }
      held.midFlight = held.btn ? held.btn.disabled : 'not-yet-bound';
      return shippedThenable({ ok: true, status: 200,
        data: { fenced_roster: R3 } });
    });
    if (!d.editor) {
      violations.push('[inFlight] the pane never created its editor');
      return;
    }
    held.btn = d.editor.querySelectorAll('.vault-roster-remove').filter(
      function (b) { return b.getAttribute('data-folder') === 'Journal'; })[0];
    if (!held.btn) {
      violations.push('[inFlight] no remove control for "Journal"');
      return;
    }
    held.btn.fire();
    if (held.midFlight !== true) {
      violations.push('[inFlight] while the write was in flight the control ' +
        'read disabled=' + JSON.stringify(held.midFlight) + ', expected ' +
        'true BY VALUE — an undisabled control invites a second tap on a ' +
        'write that has not answered yet');
    }
    if (held.btn.disabled !== false) {
      violations.push('[inFlight] the handler did not re-enable the control ' +
        'after the round trip: disabled=' + JSON.stringify(held.btn.disabled));
    }
    const markup = d.editor.innerHTML;
    ['<progress', 'spinner', 'aria-busy'].forEach(function (m) {
      if (markup.indexOf(m) !== -1) {
        violations.push('[inFlight] the editor rendered ' +
          JSON.stringify(m) + ' — one fast local write is not a job, and a ' +
          'progress element here would make a privacy edit feel like one');
      }
    });
  });

// ===========================================================================
// 26.96-04 WAVE 4 — THE TWO HALVES OF THE D-07 ASYMMETRY, SAID AT THE MOMENT
// OF THEIR OWN ACT, PLUS THE PHASE'S CONSOLIDATED COPY GATE.
//
// WHAT THE SHIPPED STORE ACTUALLY DOES, AND WHY IT MUST BE SAID.
//   add    → writes the roster meta AND retroactively stamps every already
//            imported item under that folder, and forgets the librarian's
//            cached readings of them. Adding reaches BACKWARDS.
//   remove → writes the roster meta ONLY. What was already set aside STAYS
//            set aside. Removing does NOT reach backwards.
// Both halves are surprising, and the remove half is the one that can quietly
// MISLEAD: a person who lets a folder be read again may reasonably expect what
// was hidden to come back, and it does not. Today the app says neither.
//
// THE FIVE ANTI-VACUITY ANSWERS, for this whole block.
//  (1) Can it pass BEFORE the work is done? No — recorded verbatim, with its
//      return code, in 26.96-04-SUMMARY.md: consequenceAdd, consequenceRemove,
//      quietRegister and copyBytes' two consequence rows red against the
//      unfixed seam, the harness proven not to have crashed, and every
//      26.96-02 and 26.96-03 group green in the SAME run.
//  (2) Can it still pass once deliberately broken? No — four defects are
//      planted ALONE in a scratch copy OUTSIDE the repo (capitalise the pane
//      name; insert an arrival-claiming phrase into the framing line; render
//      the count the route answers with; swap the consequence's register for
//      the safety colour) and each turns its own case red while its named
//      control reports no violation in the same run.
//  (3) Does a degenerate implementation satisfy it? No — `threeRows` refuses a
//      render-nothing implementation that would satisfy noCount by producing
//      no digits because it produced no content; `framingPresent` refuses a
//      hard-negative gate satisfied by an empty framing line; `nothingAtRest`
//      refuses an implementation that simply shows both sentences always; and
//      `shownOnce` refuses one that lets a consequence linger.
//  (4) Is it reading evaluation order or source order? EVALUATION ORDER. Every
//      copy assertion is made against the markup the renderer ACTUALLY
//      produced, read back out of the container double. ⛔ NOT ONE is made
//      against a file's source text — two of the reused strings are SPLIT
//      across a line break in the shipped source, so a source assertion on
//      either would be red before this phase and green after it purely because
//      the phase moved the string: a change in the instrument dressed up as a
//      proof about the product. Expected VALUES are lifted from source; every
//      ASSERTION is made against the render.
//  (5) Could a grep match the fix's own comment? There is exactly one grep in
//      this block — the labelled source gate on the count — and it keys on a
//      PROPERTY ACCESS, never on the bare word: the shipped empty-state line
//      legitimately contains the word "flagged", so a bare-word negative grep
//      would be red on correct, shipped code.
// ===========================================================================

// ---------------------------------------------------------------------------
// HER FOUR SENTENCES. ⛔ SOURCE: 26.96-COPY.md, chosen by the owner on
// 2026-08-17 from candidate sets she was shown verbatim. AN AGENT CHOSE NONE
// OF THEM and an agent may not alter one byte of them.
//
// ⚠ WHAT IS LOAD-BEARING, WRITTEN DOWN SO IT SURVIVES A CARELESS EDIT:
//   C1 is LOWERCASE and carries NO TERMINAL PUNCTUATION. Capitalising it or
//      adding a full stop is a copy change, and `paneNameShape` below refuses
//      both by codepoint rather than by eye.
//   C3 and C4 each carry an EM DASH (U+2014), never a hyphen.
//   Neither C3 nor C4 interpolates a folder name. She did not put one in, and
//      adding one would be authoring copy. That is also why neither sentence
//      contains user data, which is what discharges the S2 long-text row here.
// ---------------------------------------------------------------------------
const C1 = 'private folders';
const C2 = 'These folders stay private. The librarian never reads them, ' +
  'and nothing from them appears in the room until you choose to release ' +
  'a specific item.';
const C3 = 'Kept private from now on — and anything already here from ' +
  'that folder is set aside too.';
const C4 = 'The librarian can read that folder again. Things already set ' +
  'aside stay set aside — you can bring any of them back yourself, one at ' +
  'a time.';

// ---------------------------------------------------------------------------
// THE FIVE REUSED SHIPPED STRINGS. ⛔ SOURCE: THE SHIPPED BYTES, LIFTED HERE
// AT RUN TIME — never re-typed from a planning document.
//
// ⚠⚠ THIS IS THIS PHASE'S OWN RECORDED FAILURE MODE. 26.96-COPY.md documents a
// candidate annotated "the shipped setup-screen sentence, minus its 'before we
// begin'" which was in fact a REWORD; she picked it on the strength of the
// description and had to be asked again. An annotation claiming "this is your
// existing wording" is a CLAIM ABOUT SHIPPED BYTES and must be checked against
// them. So these five are read out of the code, and only then compared to the
// render.
//
// ⚠ TWO OF THEM ARE SPLIT ACROSS A LINE BREAK in the shipped source, which is
// exactly why `assembleLiterals` exists: hunting for the assembled value as a
// raw substring of the source would fail on correct, shipped code.
// ---------------------------------------------------------------------------

// Re-joins adjacent single-quoted literals concatenated with `+` (across a
// line break or not), so a string SPLIT IN THE SHIPPED SOURCE is lifted by its
// ASSEMBLED value. ⛔ This is used to build EXPECTED VALUES only. No assertion
// in this block is made against its output.
function assembleLiterals(src) {
  return src.replace(/'\s*\+\s*'/g, '');
}

function liftShipped(body, re, label) {
  const m = assembleLiterals(body).match(re);
  if (!m) {
    violations.push('[copyBytes] the shipped string ' + label + ' could not ' +
      'be lifted out of the source, so every assertion about it below would ' +
      'be comparing rendered output against null — the silent vacuity this ' +
      'guard refuses. ⚠ If this fires, the shipped bytes MOVED: stop and ' +
      'report drift, do not re-type the string from a document.');
    return null;
  }
  return m[1];
}

const SEAM_SRC = extractFn(APP_SRC, 'renderRosterEditor');

// R1 — the empty state. ⚠ SPLIT IN THE SHIPPED SOURCE across a line break
// ('nothing flagged yet — add a ' + 'folder to keep private'). Carries an EM
// DASH. Where it ships: the seam's zero-length branch.
const R_EMPTY = liftShipped(SEAM_SRC,
  /escapeHtml\('(nothing flagged yet[^']*)'\)/, 'the empty state');
// R2 — the add control's label. Where it ships: the seam's add row.
const R_ADD = liftShipped(SEAM_SRC,
  /escapeHtml\('(keep this private too)'\)/, 'the add button label');
// R3 — the add field's placeholder, and (26.96-02, A6) its accessible name.
// ⚠ SPLIT IN THE SHIPPED SOURCE across a line break.
const R_PLACEHOLDER = liftShipped(SEAM_SRC,
  /escapeAttr\('(a folder to keep private[^']*)'\)/, 'the add placeholder');
// R4 — the remove control's label. ⚠ A STATIC literal sitting directly against
// its own </button>: the 26.87 config card reuses these bytes and a shipped
// gate holds the twin together, so it is deliberately NOT escapeHtml-wrapped.
//
// ⚠⚠ THIS ONE IS THE SPLIT-STRING TRAP ITSELF, AND IT CAUGHT ME. The obvious
// regex anchors on the OPENING quote — and there is no opening quote in the
// assembled form, because `assembleLiterals` has just consumed it joining this
// literal to the one on the line above (`…underline">' +` / `'let the…`). The
// anchor therefore has to be the CLOSING shape. Recorded rather than quietly
// corrected: a lifter that silently returned null here would have made every
// assertion about this string a comparison against null.
const R_REMOVE = liftShipped(SEAM_SRC,
  /(let the librarian read this)<\/button><\/p>'/, 'the remove control label');
// R5 — the failure line, already lifted above from handleSourceDisconnect's
// shipped bytes by 26.96-03. Carries a STRAIGHT apostrophe and an EM DASH.
//
// ⚠⚠ FIVE, NOT SIX. 26.96-COPY.md lists SIX reused shipped strings; the sixth
// is `not now`, the quiet decline, which ships on the ask / soft-cover / pile
// surfaces (`ASK_DECLINE_COPY`) and is NOT rendered by this pane at all. This
// plan's own copyBytes contract names nine strings — her four plus these five
// — and that is the reconciliation. ⛔ The failure line IS one of this pane's
// five: 26.96-03 shipped it into the seam's own note slot, so it belongs here
// and is not somebody else's surface.

// ---------------------------------------------------------------------------
// WHAT IS ACTUALLY ON SCREEN. ⚠ The double models a child container as its own
// box, so a PARENT's innerHTML does NOT contain its children's markup — and
// both the failure line and the consequence sentence live in child slots. A
// copy assertion made on the parent alone would miss every sentence this phase
// is about. Positional assertions still read the PARENT, deliberately: that is
// where the ordering of the slots lives.
// ---------------------------------------------------------------------------
function rendered(box) {
  if (!box) { return ''; }
  let out = box.innerHTML;
  Object.keys(box.kids).forEach(function (k) { out += rendered(box.kids[k]); });
  return out;
}

function consequenceBoxOf(editor) {
  return editor && editor.kids ?
    (editor.kids['vault-roster-consequence'] || null) : null;
}

function consequenceWrites(editor) {
  const b = consequenceBoxOf(editor);
  return b ? b.writes : 0;
}

// A transport that answers the store read with the roster BEFORE the act and
// the write with the roster AFTER it — plus the count the route really
// answers with, so `noCount` has a concrete number to prove never reaches a
// surface rather than an absence nobody supplied.
const FLAGGED_COUNT = 137;
// ⚠ 26.96-11: this transport models HER REAL MACHINE, whose library was
// brought in by an 878-item whole-vault import — so a vault root IS stamped
// and every add she makes genuinely reaches backwards. The route now says so,
// and this answer says so too.
// ⛔ THIS IS NOT LOOSENING A GATE. `consequenceAdd`, `copyBytes`'s C3 row and
// `consequenceWhole`'s add half went red the moment the client began gating on
// the flag, and that red was CORRECT: an answer with no flag is fail-closed to
// silence. The honest repair is to make the double answer what the real route
// answers, ⛔ never to default the client to true and ⛔ never to widen those
// groups. The arms that do NOT carry the flag are named transports of their
// own, selected by the cases that are about them.
function actTransport(before, after) {
  return function (url) {
    if (url === '/api/items') { return metaAnswer(before); }
    return shippedThenable({ ok: true, status: 200,
      data: { fenced_roster: after, flagged: FLAGGED_COUNT,
              retroactive: true } });
  };
}

const R_AFTER_ADD = ['Journal', 'personnel notes', 'appraisal record',
  'Diaries'];
const R_AFTER_REMOVE = ['Journal', 'appraisal record'];

// ---------------------------------------------------------------------------
// ⛔ 26.96-11 (G-26.96-3): THE ROUTE ANSWERS WHETHER ITS RETROACTIVE PASS WAS
// APPLICABLE, AND FOUR TRANSPORTS EXPRESS THE FOUR ANSWERS IT CAN GIVE.
//
// WHY THE FLAG AND NOT THE COUNT. `study_lib.add_roster_folder` reaches
// backwards ONLY when `meta.vault_root` is stamped, which happens ONLY on a
// whole-vault import — so a Photos-only or folder-drop user's add reaches
// nothing, and until this wave the room told her otherwise. The obvious
// discriminator, `flagged === 0`, is WRONG: zero is ALSO what a real,
// applicable pass answers for a folder that holds nothing yet, and a
// count-based gate would silence the room on a pass that genuinely ran.
// `retroYesZero` is the case that refuses it.
//
// ⛔ EACH IS SELECTED BY NAME PER CASE. Nothing switches implicitly, so no
// case can be reading an arm it did not ask for.
// ---------------------------------------------------------------------------
function retroTransport(before, after, extra) {
  return function (url) {
    if (url === '/api/items') { return metaAnswer(before); }
    const data = { fenced_roster: after, flagged: FLAGGED_COUNT };
    Object.keys(extra).forEach(function (k) { data[k] = extra[k]; });
    return shippedThenable({ ok: true, status: 200, data: data });
  };
}
// Her real machine's shape: an 878-item whole-vault import stamped a root, so
// every add she makes DOES reach backwards.
function retroYes(before, after) {
  return retroTransport(before, after, { retroactive: true });
}
// The Photos-only / folder-drop machine: the folder is added, nothing already
// here moves.
//
// ⚠⚠ `flagged: 0` IS NOT DECORATION AND IT IS NOT A CONVENIENCE — IT IS THE
// SHAPE THE ROUTE ACTUALLY ANSWERS, and this transport was wrong until the
// arm-that-should-fail drill caught it. With no stamped vault root
// `add_roster_folder` stamps nothing, so `flagged` is 0 BY CONSTRUCTION;
// measured against the shipped route on a synthetic store in
// tests/test_roster_retroactive.py::test_retroactive_absent. Answering
// `retroactive: false` beside a NON-zero count modelled an answer the server
// can never produce — and under the wrong fix (`flagged > 0`) that impossible
// shape turned `addFutureOnly` red too, making the drill a blanket red instead
// of the informative CONTRAST it exists to be.
function retroNo(before, after) {
  return retroTransport(before, after, { retroactive: false, flagged: 0 });
}
// ⛔ NO KEY AT ALL — an older server, a proxy that dropped a field, a bug.
// Fail-closed: an answer that does not say must be read as "it did not run".
function retroSilent(before, after) {
  return retroTransport(before, after, {});
}
// The pass RAN and reached nothing — the folder was empty. ⛔ This is the
// shape that makes the count useless as a discriminator.
function retroYesZero(before, after) {
  return retroTransport(before, after, { retroactive: true, flagged: 0 });
}

// ⚠ 26.96-11: `mk` is an OPTIONAL transport factory, defaulting to the one
// these helpers already used. Existing callers are unchanged by construction;
// the new cases name their arm explicitly at the call site.
function driveAddOn(host, where, mk) {
  const d = host(R3, (mk || actTransport)(R3, R_AFTER_ADD));
  if (!d.editor) {
    violations.push('[' + where + '] the host never created its editor');
    return null;
  }
  const field = d.editor.querySelector('.vault-roster-add-input');
  const add = d.editor.querySelector('.vault-roster-add');
  if (!field || !add) {
    violations.push('[' + where + '] the add field or control is missing');
    return null;
  }
  field.value = 'Diaries';
  add.fire();
  return d;
}

function driveRemoveOn(host, where, mk) {
  const d = host(R3, (mk || actTransport)(R3, R_AFTER_REMOVE));
  if (!d.editor) {
    violations.push('[' + where + '] the host never created its editor');
    return null;
  }
  if (!fireRemove(d.editor, 'personnel notes', where)) { return null; }
  return d;
}

// ---------------------------------------------------------------------------
// (consequenceAdd) ADDING REACHES BACKWARDS, AND THE ROOM SAYS SO — ONCE, IN
// THE POSITION THE ADD FIELD OCCUPIED.
// ---------------------------------------------------------------------------
group('consequenceAdd (a successful add says, once and in place, that adding ' +
  'reaches backwards)', function () {
  const d = driveAddOn(drivePane, 'consequenceAdd');
  if (!d) { return; }
  const full = rendered(d.editor);
  const parent = d.editor.innerHTML;
  if (!full || full.length === 0) {
    violations.push('[consequenceAdd] the captured markup is EMPTY — a ' +
      'renderer that produced nothing would satisfy a naive "the sentence is ' +
      'present" check, and this is what refuses it');
    return;
  }
  if (full.indexOf(C3) === -1) {
    violations.push('[consequenceAdd] ADDING A FOLDER SAID NOTHING ABOUT ' +
      'REACHING BACKWARDS. The captured render does not carry her sentence ' +
      JSON.stringify(C3) + ' byte-exactly. ⚠ The shipped store retroactively ' +
      'sets aside every already-imported item under that folder and forgets ' +
      'the librarian\'s readings of them — a person who is not told this ' +
      'cannot know what her own tap just did: ' +
      JSON.stringify(full.slice(0, 200)));
  }
  // IN PLACE, BY VALUE: the consequence occupies the add field's position and
  // the add field is no longer in it. ⛔ Not a toast, not a banner, not an
  // extra line appended beside a control that is still sitting there.
  if (parent.indexOf('class="vault-roster-consequence"') === -1) {
    violations.push('[consequenceAdd] the seam emitted no consequence slot — ' +
      'the sentence has nowhere to be said in place');
  }
  // ⚠⚠ THIS HALF OF THE GROUP CHANGED SHAPE ON 2026-08-21, AND THE REASON IS
  // HER RULING. It used to assert the add field was GONE — the shipped
  // one-decision register, where the acted-on element becomes the receipt. She
  // was shown that register working and ruled at Beat 6 of the 2026-08-20
  // sitting: `Yes this box should come straight back`. A gate still demanding
  // the field's absence would now be pinning the shape she rejected, and would
  // make her own decision read as a regression.
  //
  // ⛔ THE PROPERTY THE OLD SHAPE PROTECTED IS KEPT, NOT DROPPED. What it was
  // really defending is that the sentence is said IN THE ADD FIELD'S OWN
  // PLACE — never a toast, never a banner, never a line appended somewhere
  // else on the pane. That is now asserted by ORDER, by value: the consequence
  // sits after the list and BEFORE the returning field, so the receipt still
  // occupies the position the control she used occupied, and the control comes
  // back beneath it.
  if (parent.indexOf('vault-roster-add-input') === -1) {
    violations.push('[consequenceAdd] ⛔ THE ADD FIELD DID NOT COME BACK ' +
      'after the act. She ruled at Beat 6 (2026-08-20) that this box should ' +
      'come straight back, so a second folder can be added without waiting ' +
      'for the pane to render again: ' + JSON.stringify(parent.slice(-240)));
  }
  const iList = parent.indexOf('class="vault-roster-list"');
  const iConseq = parent.indexOf('class="vault-roster-consequence"');
  const iAdd = parent.indexOf('vault-roster-add-input');
  const iNote = parent.indexOf('class="vault-roster-note"');
  if (!(iList !== -1 && iConseq > iList && iAdd > iConseq && iNote > iAdd)) {
    violations.push('[consequenceAdd] the consequence is not in the add ' +
      'field\'s position by value (list=' + iList + ' consequence=' +
      iConseq + ' add=' + iAdd + ' note=' + iNote + ') — it must sit after ' +
      'the list and BEFORE the returning add row, which is exactly where the ' +
      'add row was; and the whole group must still sit before the note slot');
  }
  // ⛔ THE RETURNING FIELD IS EMPTY AND IS A NEW ELEMENT. `clearOK` proves a
  // successful add clears the box; this proves the box she gets back is the
  // cleared one rather than one still carrying the name she just filed.
  const back = d.editor.querySelector('.vault-roster-add-input');
  if (back && back.value) {
    violations.push('[consequenceAdd] the returning add field still holds ' +
      JSON.stringify(back.value) + ', expected "" BY VALUE — the box coming ' +
      'back with the last folder still in it would read as the add not ' +
      'having happened');
  }
  // ⛔ AND IT IS A WORKING CONTROL, not markup that looks like one. A field
  // re-emitted without its button is a box she can type into and never submit.
  if (!d.editor.querySelector('.vault-roster-add')) {
    violations.push('[consequenceAdd] the add field came back WITHOUT its ' +
      'button — she can type a second folder and has no way to file it');
  }
  // ONCE, COUNTED. ⚠⚠ EMPTINESS IS NOT ABSENCE OF A CALL — 26.96-03 proved a
  // sentence can be rendered and immediately repainted over, leaving a slot
  // that satisfies every emptiness check. So the WRITE is counted.
  const writes = consequenceWrites(d.editor);
  if (writes !== 1) {
    violations.push('[consequenceAdd] the consequence slot was written into ' +
      writes + ' time(s), expected exactly 1 BY VALUE — said once, at the ' +
      'moment of the act. A count, not an emptiness check: a sentence ' +
      'rendered twice, or rendered and painted over, is invisible to ' +
      'emptiness and visible here.');
  }
  // ⛔ The OTHER half must not be said. Adding does not un-set-aside anything.
  if (full.indexOf(C4) !== -1) {
    violations.push('[consequenceAdd] the REMOVE half\'s sentence is on ' +
      'screen after an ADD — the two halves of the asymmetry are opposite ' +
      'facts and saying the wrong one is worse than saying neither');
  }
});

// ---------------------------------------------------------------------------
// (consequenceRemove) LETTING A FOLDER BE READ AGAIN DOES *NOT* REACH
// BACKWARDS, AND THE ROOM SAYS SO — IN THE POSITION THE ROW HELD.
// ⚠ This is the half that can quietly mislead, so it is the half whose copy is
// driven red by the capitalisation plant in Task 3.
// ---------------------------------------------------------------------------
group('consequenceRemove (letting a folder be read again says, once and in ' +
  'place, that it does NOT reach backwards)', function () {
  const d = driveRemoveOn(drivePane, 'consequenceRemove');
  if (!d) { return; }
  const full = rendered(d.editor);
  const parent = d.editor.innerHTML;
  if (!full || full.length === 0) {
    violations.push('[consequenceRemove] the captured markup is EMPTY');
    return;
  }
  if (full.indexOf(C4) === -1) {
    violations.push('[consequenceRemove] LETTING THE LIBRARIAN READ A FOLDER ' +
      'AGAIN SAID NOTHING. The captured render does not carry her sentence ' +
      JSON.stringify(C4) + ' byte-exactly. ⚠⚠ This is the half that MISLEADS: ' +
      'the shipped store leaves everything that was already set aside set ' +
      'aside, and a person who unticks a folder may reasonably expect what ' +
      'was hidden to come back. It does not: ' +
      JSON.stringify(full.slice(0, 200)));
  }
  // The row she acted on is GONE — this is a successful write, so the list
  // follows the route's answer.
  if (parent.indexOf('personnel notes') !== -1) {
    violations.push('[consequenceRemove] the row she acted on is still in ' +
      'the captured markup after a write the route ACCEPTED — the repaint ' +
      'did not follow the answer');
  }
  // IN PLACE, BY VALUE: the sentence sits where that row sat — after the row
  // that preceded it and before the row that followed it.
  const iConseq = parent.indexOf('class="vault-roster-consequence"');
  const iFirst = parent.indexOf('Journal');
  const iThird = parent.indexOf('appraisal record');
  if (iConseq === -1) {
    violations.push('[consequenceRemove] the seam emitted no consequence slot');
  } else if (!(iFirst !== -1 && iFirst < iConseq && iConseq < iThird)) {
    violations.push('[consequenceRemove] the consequence is not in the ' +
      'position the row held by value (Journal=' + iFirst + ' consequence=' +
      iConseq + ' appraisal record=' + iThird + ') — the row she acted on ' +
      'was the second of three, so its sentence belongs between the two ' +
      'that remain, not appended to the end of the pane');
  }
  const writes = consequenceWrites(d.editor);
  if (writes !== 1) {
    violations.push('[consequenceRemove] the consequence slot was written ' +
      'into ' + writes + ' time(s), expected exactly 1 BY VALUE');
  }
  if (full.indexOf(C3) !== -1) {
    violations.push('[consequenceRemove] the ADD half\'s sentence is on ' +
      'screen after a REMOVE — the two halves are opposite facts');
  }
});

// ---------------------------------------------------------------------------
// 26.96-11 (G-26.96-3) — THE ROOM REPEATS ONLY WHAT THE ROUTE ACTUALLY DID.
//
// ⚠⚠ READ THE HARM, NOT THE DIFF. C3 says "anything already here from that
// folder is set aside too." On a machine with no stamped vault root the server
// sets NOTHING aside — measured against the shipped route on a synthetic store
// in tests/test_roster_retroactive.py: no vault_root ⇒ flagged 0 and both
// items keep trigger unset; with one ⇒ flagged 2 and both are set aside. A
// person reading C3 on the first machine has been told her already-imported
// things are private when they are not, on the surface this phase itself calls
// the strongest privacy control in the room.
//
// ⛔ THE FIX IS NOT A REWORD. C3 is HERS, chosen 2026-08-17 from candidate sets
// she was shown verbatim. A future-only variant is NEW user-visible copy and is
// owed to her (26.96-12). Until she rules, the honest interim is SILENCE — a
// wrong promise about her privacy is a harm, saying nothing is not. That is
// what these cases pin: not a different sentence, the absence of a false one.
//
// THE FIVE ANTI-VACUITY ANSWERS, for the four cases below.
//  (1) Can they pass BEFORE the work? `addRetroactive`, `addZeroFlaggedStillSays`
//      and `removeUnaffected` CAN and MUST — they are the controls that keep
//      the fix from degenerating into "never say C3". `addFutureOnly` and
//      `addUnknownFailsClosed` cannot: recorded RED verbatim in
//      26.96-11-SUMMARY.md before app.js moved.
//  (2) Can they still pass once deliberately broken? No — restoring the
//      unconditional-C3 defect in a scratch copy turns exactly those two red
//      with the other four green in the same run.
//  (3) Does a degenerate implementation satisfy them? No, twice over. The
//      silence is asserted by the consequence slot's WRITE COUNT, not by
//      emptiness — a parent repaint RESETS a child rather than writing to it,
//      so an empty slot passes while the sentence was rendered and painted
//      over (26.96-03's hole). And `addZeroFlaggedStillSays` refuses the
//      cheapest wrong fix, `flagged > 0`.
//  (4) Evaluation order or source order? EVALUATION. Every case fires a real
//      control through the seam's own listener and reads what was rendered.
//  (5) Could a grep match the fix's own comment? There is no grep here.
// ---------------------------------------------------------------------------
// ⚠⚠ THIS GROUP CHANGED SHAPE ON 2026-08-20, AND THE REASON IS HER RULING.
// It used to assert SILENCE — a consequence write count of exactly 0 — because
// the future-only sentence was owed to her and shipped as the empty string.
// She ruled it at the sitting (A1), so silence is no longer the contract and a
// gate still demanding it would now be pinning the ABSENCE OF HER OWN WORDS.
//
// ⛔ THE PROPERTY IT PROTECTS IS UNCHANGED AND IS NOT WEAKENED: the room must
// never claim a retroactive set-aside the server did not perform. That was
// enforced by "say nothing"; it is now enforced by "say HER future-only
// sentence, and never C3". Strictly stronger — the old shape would have
// accepted any sentence at all once the seat was filled, including C3 pasted
// into the wrong seat.
group('addFutureOnly (an add the server did not reach backwards with says ' +
  'HER future-only sentence — never C3, never C4)', function () {
  const d = driveAddOn(drivePane, 'addFutureOnly', retroNo);
  if (!d) { return; }
  const full = rendered(d.editor);
  const parent = d.editor.innerHTML;
  // NON-VACUITY BEFORE ABSENCE. The write must have landed and the pane must
  // have repainted from the answer, or every check below passes on nothing.
  if (!full || full.indexOf('Diaries') === -1) {
    violations.push('[addFutureOnly] the pane did not repaint from the ' +
      'route\'s answer — the newly-private folder "Diaries" is not on screen, ' +
      'so nothing below is evidence: ' + JSON.stringify(full.slice(0, 200)));
    return;
  }
  // ⛔ COUNTED, NOT CHECKED FOR EMPTINESS. 26.96-03 proved a sentence can be
  // written and immediately painted over, leaving a slot that satisfies every
  // emptiness check while she saw the words.
  const writes = consequenceWrites(d.editor);
  if (writes !== 1) {
    violations.push('[addFutureOnly] her future-only sentence was written ' +
      'into the slot ' + writes + ' time(s), expected exactly 1 BY VALUE. ' +
      'She ruled A1 at the sitting; 0 means the seat regressed to silence ' +
      'and >1 means the sentence was painted over — 26.96-03 proved a ' +
      'sentence can be written and immediately overwritten while she saw it.');
  }
  if (full.indexOf(ADD_FUTURE_ONLY) === -1) {
    violations.push('[addFutureOnly] ⛔ HER RULED SENTENCE IS NOT ON SCREEN ' +
      'after an add the server did not reach backwards with. expected ' +
      JSON.stringify(ADD_FUTURE_ONLY) + ' — she chose it precisely for this ' +
      'moment, and the seat is no longer owed.');
  }
  if (full.indexOf(C3) !== -1) {
    violations.push('[addFutureOnly] her sentence ' + JSON.stringify(C3) +
      ' is on screen after an add that reached backwards over nothing. ⛔ Do ' +
      'NOT fix this by rewording C3 — it is hers and not one byte may move. ' +
      'The fix is to say nothing until she has written the other sentence.');
  }
  if (full.indexOf(C4) !== -1) {
    violations.push('[addFutureOnly] the REMOVE half\'s sentence is on ' +
      'screen after an ADD — saying the wrong half is worse than saying ' +
      'neither');
  }
  // ⚠ THE ADD-FIELD CHECK IS DELIBERATELY GONE FROM THIS GROUP, not lost.
  // It asserted that silence leaves the control in place. Now that there IS a
  // consequence, the shipped design is that the sentence takes the position of
  // the control she just used and shows once — which is Beat 6's subject and
  // her open design question, NOT something this gate may quietly re-decide.
});

// ⚠ THE CONTROL. If this were red too, the pair would be measuring "C3 is
// never said" rather than "C3 is said exactly when it is true".
group('addRetroactive (an add the server DID reach backwards with still says ' +
  'her sentence, byte-exact and once)', function () {
  const d = driveAddOn(drivePane, 'addRetroactive', retroYes);
  if (!d) { return; }
  const full = rendered(d.editor);
  if (!full || full.indexOf('Diaries') === -1) {
    violations.push('[addRetroactive] the pane did not repaint from the ' +
      'route\'s answer, so nothing below is evidence');
    return;
  }
  if (full.indexOf(C3) === -1) {
    violations.push('[addRetroactive] the retroactive pass RAN and the room ' +
      'said nothing about it. Her sentence ' + JSON.stringify(C3) + ' is not ' +
      'in the rendered output byte-exactly. ⚠ The gate for the future-only ' +
      'case must not become "never say it": ' +
      JSON.stringify(full.slice(0, 200)));
  }
  const writes = consequenceWrites(d.editor);
  if (writes !== 1) {
    violations.push('[addRetroactive] the consequence slot was written into ' +
      writes + ' time(s), expected exactly 1 BY VALUE');
  }
});

// ⛔ FAIL CLOSED. An answer that does not say whether the pass ran is a bug,
// and the safe reading of a bug on this surface is silence: the harm being
// closed is a promise the server did not keep.
// ⚠ SAME RESHAPE AS addFutureOnly, SAME REASON, AND THE FAIL-CLOSED PROPERTY
// IS UNTOUCHED. "Read as false" used to mean "say nothing" because the seat
// was owed; it now means "say HER future-only sentence". What must never
// happen is unchanged and is still asserted below: an answer that never said
// the pass ran may not produce C3.
group('addUnknownFailsClosed (an answer carrying no retroactive flag at all ' +
  'is read as false — her future-only sentence, never C3)', function () {
  const d = driveAddOn(drivePane, 'addUnknownFailsClosed', retroSilent);
  if (!d) { return; }
  const full = rendered(d.editor);
  if (!full || full.indexOf('Diaries') === -1) {
    violations.push('[addUnknownFailsClosed] the pane did not repaint from ' +
      'the route\'s answer, so nothing below is evidence');
    return;
  }
  const writes = consequenceWrites(d.editor);
  if (writes !== 1) {
    violations.push('[addUnknownFailsClosed] the future-only sentence was ' +
      'written ' + writes + ' time(s), expected exactly 1 BY VALUE.');
  }
  if (full.indexOf(ADD_FUTURE_ONLY) === -1) {
    violations.push('[addUnknownFailsClosed] ⛔ A MISSING FLAG DID NOT FALL ' +
      'BACK TO HER FUTURE-ONLY SENTENCE. An older server, a dropped field or ' +
      'a bug must land on the honest half, never on the promise.');
  }
  if (full.indexOf(C3) !== -1) {
    violations.push('[addUnknownFailsClosed] her sentence is on screen on an ' +
      'answer that never said the pass ran. ⛔ Fail closed: the client may ' +
      'not default this to true.');
  }
});

// ---------------------------------------------------------------------------
// ⛔⛔ THE CASE THAT REFUSES THE OBVIOUS WRONG FIX.
//
// The route already answers `flagged`, and reaching for `flagged > 0` is the
// cheapest way to make the two cases above green. It is WRONG: a pass that
// really ran over a folder she added before putting anything in it answers
// zero, and a count-based gate would make the room go silent on it — the same
// defect pointing the other way. This case is red on that implementation and
// green on the correct one, and it exists for no other purpose.
// ---------------------------------------------------------------------------
group('addZeroFlaggedStillSays (the pass RAN and reached nothing — her ' +
  'sentence is still true and is still said)', function () {
  const d = driveAddOn(drivePane, 'addZeroFlaggedStillSays', retroYesZero);
  if (!d) { return; }
  const full = rendered(d.editor);
  if (!full || full.indexOf('Diaries') === -1) {
    violations.push('[addZeroFlaggedStillSays] the pane did not repaint from ' +
      'the route\'s answer, so nothing below is evidence');
    return;
  }
  if (full.indexOf(C3) === -1) {
    violations.push('[addZeroFlaggedStillSays] ⛔ THE COUNT WAS USED AS THE ' +
      'DISCRIMINATOR. The route said the retroactive pass WAS applicable and ' +
      'answered a count of 0 — a folder she made private before putting ' +
      'anything in it. That is a pass that ran, over nothing, and her ' +
      'sentence is true of it. A client reading the count instead of the ' +
      'flag goes silent on exactly this person: ' +
      JSON.stringify(full.slice(0, 200)));
  }
  const writes = consequenceWrites(d.editor);
  if (writes !== 1) {
    violations.push('[addZeroFlaggedStillSays] the consequence slot was ' +
      'written into ' + writes + ' time(s), expected exactly 1 BY VALUE');
  }
});

// ⛔ C4 AND THE REMOVE ARM ARE UNTOUCHED BY ALL OF THIS. Removing never
// reached backwards, on any machine, so no flag can change what it says.
group('removeUnaffected (letting a folder be read again says C4 whatever the ' +
  'retroactive flag says)', function () {
  [['flag true', retroYes], ['flag false', retroNo],
    ['no flag at all', retroSilent]].forEach(function (arm) {
    const d = driveRemoveOn(drivePane, 'removeUnaffected/' + arm[0], arm[1]);
    if (!d) { return; }
    const full = rendered(d.editor);
    if (!full || full.indexOf('Journal') === -1) {
      violations.push('[removeUnaffected] ' + arm[0] + ': nothing ' +
        'recognisable was rendered');
      return;
    }
    if (full.indexOf(C4) === -1) {
      violations.push('[removeUnaffected] ' + arm[0] + ': C4 is missing. ' +
        'The remove arm carries no retroactive claim to gate, and D-07\'s ' +
        'asymmetry is not this wave\'s to touch: ' +
        JSON.stringify(full.slice(0, 200)));
    }
    if (consequenceWrites(d.editor) !== 1) {
      violations.push('[removeUnaffected] ' + arm[0] + ': the consequence ' +
        'slot was written into ' + consequenceWrites(d.editor) + ' time(s), ' +
        'expected exactly 1 BY VALUE');
    }
  });
});

// ---------------------------------------------------------------------------
// (nothingAtRest) THE PANE CARRIES NO STANDING WARNING ABOUT A THING THAT HAS
// NOT HAPPENED. ⛔ A settings pane that lectures before she touches it is the
// config-stress failure the project's standing motto names — and it is also
// the cheapest wrong way to satisfy the two cases above.
// ⚠ GREEN BEFORE THE FIX AS WELL AS AFTER, deliberately: it is the control
// that keeps the fix from degenerating into "show both sentences always".
// ---------------------------------------------------------------------------
group('nothingAtRest (a pane nobody has touched says neither sentence)',
  function () {
    const d = drivePane(R3);
    if (!d.editor) {
      violations.push('[nothingAtRest] the pane never created its editor');
      return;
    }
    const full = rendered(d.s.dom('manage-sec-roster'));
    if (!full || full.indexOf('Journal') === -1) {
      violations.push('[nothingAtRest] the pane rendered nothing recognisable ' +
        '— the absence checks below would pass on nothing');
      return;
    }
    [['C3', C3], ['C4', C4]].forEach(function (pair) {
      if (full.indexOf(pair[1]) !== -1) {
        violations.push('[nothingAtRest] ' + pair[0] + ' is on screen before ' +
          'she has done anything. Nothing is said at rest: a consequence is ' +
          'said at the moment of its own act, and a standing warning about ' +
          'an act that has not happened is a lecture.');
      }
    });
    // ⚠ COUNTED, NOT CHECKED FOR EMPTINESS. The slot may legitimately not
    // exist at rest; what is asserted is that nobody has WRITTEN into it.
    if (consequenceWrites(d.editor) !== 0) {
      violations.push('[nothingAtRest] the consequence slot was written into ' +
        consequenceWrites(d.editor) + ' time(s) on a pane nobody touched, ' +
        'expected 0 BY VALUE');
    }
  });

// ---------------------------------------------------------------------------
// (shownOnce) THE CONSEQUENCE DOES NOT LINGER. The next render drops it.
// ⛔ No toast, no banner, no checkmark — and nothing that is still there when
// she comes back to the pane.
// ---------------------------------------------------------------------------
group('shownOnce (the consequence is gone on the next render, and is not ' +
  'said a second time)', function () {
  const d = driveRemoveOn(drivePane, 'shownOnce');
  if (!d) { return; }
  const afterAct = consequenceWrites(d.editor);
  if (afterAct !== 1) {
    violations.push('[shownOnce] the act itself wrote the consequence ' +
      afterAct + ' time(s), expected 1 BY VALUE — the rest of this case ' +
      'proves nothing until that holds');
    return;
  }
  // Render the pane again, the way coming back to it does.
  d.s.api.pane();
  const full = rendered(d.s.dom('manage-sec-roster'));
  if (!full || full.indexOf('Journal') === -1) {
    violations.push('[shownOnce] the second render produced nothing ' +
      'recognisable — the absence check below would pass on nothing');
    return;
  }
  if (full.indexOf(C4) !== -1) {
    violations.push('[shownOnce] the consequence is STILL on screen on the ' +
      'next render. It is said at the moment of its own act and then it is ' +
      'over; a sentence that survives the render is a standing notice about ' +
      'something she already did: ' + JSON.stringify(full.slice(0, 200)));
  }
  // ⚠⚠ AND THE COUNT, which is the assertion emptiness cannot make: a
  // consequence re-rendered and then painted over would leave an empty slot
  // and satisfy the check above while saying it twice.
  const afterRender = consequenceWrites(d.editor);
  if (afterRender !== 1) {
    violations.push('[shownOnce] the consequence slot has now been written ' +
      'into ' + afterRender + ' time(s), expected still exactly 1 BY VALUE — ' +
      'it was said a second time on a render that followed no act.');
  }
});

// ---------------------------------------------------------------------------
// (copyBytes) THE PHASE'S CONSOLIDATED COPY GATE — NINE STRINGS, ASSERTED
// AGAINST WHAT IS ACTUALLY RENDERED.
//
// ⛔ EVERY ASSERTION HERE TARGETS THE CAPTURED RENDER. Two of the five reused
// shipped strings are SPLIT across a line break in the source; asserting
// either against the file's text would be red before this phase and green
// after it BECAUSE the phase moved the string — a change in the instrument
// presented as a proof about the product.
//
// ⚠ SEVEN OF THE NINE ARE GREEN BEFORE THIS WAVE'S FIX, and that is the
// CONTROL: if the gate were red for the already-shipped strings too, it would
// be measuring itself rather than reading the product.
// ---------------------------------------------------------------------------
// ⚠ 26.96-10: the group label is a PARAMETER, defaulting to the one caller
// this helper had. It was hardcoded to '[copyBytes]', so the first gate
// outside copyBytes to use it reported its failures under copyBytes' name —
// sending anyone reading the red to the wrong group. A check that misattributes
// its own finding is this project's signature defect wearing a reporting
// costume, and it is cheap to close here rather than at the next reader.
function assertRendersByte(where, markup, expected, label, group_) {
  const g = '[' + (group_ || 'copyBytes') + '] ';
  if (expected === null) { return; }          // lift already reported
  if (!markup || markup.length === 0) {
    violations.push(g + where + ': nothing was rendered, so ' +
      label + ' cannot have been asserted');
    return;
  }
  if (markup.indexOf(expected) === -1) {
    violations.push(g + where + ': ' + label + ' does not ' +
      'appear in the rendered output byte-exactly. Expected ' +
      JSON.stringify(expected) + '. ⛔ Do not "fix" this by changing the ' +
      'expected value — every sentence on this surface is either the owner\'s ' +
      'own wording or a string already shipped, and an agent may not alter ' +
      'one byte of either. Rendered: ' + JSON.stringify(markup.slice(0, 220)));
  }
}

group('copyBytes (all nine strings on this phase\'s surfaces, byte-exact ' +
  'against RENDERED output)', function () {
  // --- the plain populated pane: C1, C2, and three of the reused five ---
  const plain = drivePane(R3);
  if (!plain.editor) {
    violations.push('[copyBytes] the pane never created its editor');
    return;
  }
  const paneFull = rendered(plain.s.dom('manage-sec-roster'));
  assertRendersByte('pane', paneFull, C1, 'C1, the pane name (hers)');
  assertRendersByte('pane', paneFull, C2, 'C2, the framing line (hers)');
  assertRendersByte('pane', paneFull, R_ADD, 'the add button label (shipped)');
  assertRendersByte('pane', paneFull, R_PLACEHOLDER,
    'the add field placeholder (shipped)');
  assertRendersByte('pane', paneFull, R_REMOVE,
    'the remove control label (shipped)');

  // --- C1 IS ASSERTED IN BOTH ITS PLACES, FROM ONE SOURCE ---------------
  // ⚠ Its two rendered consumers TODAY are the settings LIST entry and the
  // pane's own heading. (Its third home, the librarian's spoken route, is
  // 26.96-05's work and does not exist yet — ⛔ this plan may not author it.)
  // Both must be the SAME STRING FROM ONE SOURCE, not two literals that
  // happen to match today, so the one-source count is asserted in the same
  // group as the two renders.
  const railCalls2 = { get: [], post: [] };
  const dom2 = makeDom();
  const railApi = new Function('CALLS', 'DOM', 'TRANSPORT',
    'var CLEAN = { present: true };' +
    'var MANAGE = { pane: null, items: {} };' +
    'var SHELF = { filters: [] };' +
    'function sectionMembers() { return []; }' +
    'function showManagePane() {}' +
    'function $(id) { return DOM(id); }' +
    ESCAPERS +
    'var MANAGE_PANES = ' + REGISTRY_SRC + ';' +
    extractFn(APP_SRC, 'manageRailCount') + '\n' +
    // 26.99955-07: the shipped grouping function, lifted not stubbed —
    // see the note at the R2 sandbox above.
    extractFn(APP_SRC, 'manageLandingGroup') + '\n' +
    extractFn(APP_SRC, 'renderManageRail') + '\n' +
    'return { rail: renderManageRail };')(railCalls2, dom2, null);
  railApi.rail();
  const railHtml2 = dom2('manage-rail').innerHTML;
  assertRendersByte('rail (the settings list entry)', railHtml2, C1,
    'C1, the pane name (hers)');
  // ONE SOURCE, by value: the name is typed exactly once in app.js as a
  // quoted literal. Two matching literals are not a harmless duplicate — they
  // are how already-approved copy silently rots, one surface at a time.
  //
  // ⚠ 26.96-09 (IN-03): this counted SINGLE-quoted literals only, while
  // `routeOneSource` counted all three quote characters. A second literal
  // typed with double quotes was therefore catchable by one gate and invisible
  // to the other — one rule, two spellings. Both now go through
  // `quotedLiteralCount`, and `routeOneSource` asserts the two numbers agree.
  const quoted = quotedLiteralCount(APP_SRC, C1);
  recordQuotedCount('copyBytes', quoted);
  if (quoted !== 1) {
    violations.push('[copyBytes] the pane name appears as a quoted string ' +
      'literal ' + quoted + ' time(s) in app.js, expected exactly 1 BY ' +
      'VALUE. It is spoken in the settings list and in the pane heading (and ' +
      '26.96-05 will make the librarian speak it too); the copy record binds ' +
      'those to "the same string from one source, not two literals that ' +
      'happen to match today".');
  }
  // ⚠ ITS SHAPE, BY CODEPOINT, because this is precisely what an agent
  // "tidying" a heading would change without noticing it was copy.
  if (C1.charCodeAt(0) !== 112) {
    violations.push('[copyBytes] the pane name does not begin with a ' +
      'lowercase p (codepoint ' + C1.charCodeAt(0) + ') — she chose a ' +
      'lowercase pane name and an agent may not capitalise it');
  }
  if ('.!?:;'.indexOf(C1.charAt(C1.length - 1)) !== -1) {
    violations.push('[copyBytes] the pane name ends in terminal punctuation ' +
      '(' + JSON.stringify(C1.charAt(C1.length - 1)) + ') — she chose it ' +
      'without any, and an agent may not add one');
  }

  // --- the empty pane: the empty-state line ----------------------------
  const empty = drivePane([]);
  assertRendersByte('pane (empty roster)', rendered(empty.editor), R_EMPTY,
    'the empty-state line (shipped, SPLIT across a line break in source)');

  // --- a failed write: the failure line --------------------------------
  const failed = drivePane(R3, refusingRoster(R3));
  if (failed.editor) {
    fireRemove(failed.editor, 'personnel notes', 'copyBytes/failure');
    assertRendersByte('pane (a failed write)', rendered(failed.editor),
      FAIL_LINE, 'the failure line (shipped, straight apostrophe + em dash)');
  }

  // --- both acts, on BOTH hosts: C3 and C4 -----------------------------
  [['pane', drivePane], ['import screen', driveImport]].forEach(function (h) {
    const added = driveAddOn(h[1], 'copyBytes/add/' + h[0]);
    if (added) {
      assertRendersByte(h[0] + ' (after adding)', rendered(added.editor), C3,
        'C3, the consequence of adding (hers)');
    }
    const removed = driveRemoveOn(h[1], 'copyBytes/remove/' + h[0]);
    if (removed) {
      assertRendersByte(h[0] + ' (after letting one be read again)',
        rendered(removed.editor), C4,
        'C4, the consequence of letting the librarian read one again (hers)');
    }
  });
});

// ---------------------------------------------------------------------------
// (noCount) THE ROUTE ANSWERS WITH A NUMBER OF ITEMS NEWLY SET ASIDE, AND THAT
// NUMBER NEVER REACHES A SURFACE.
//
// ⚠ A count of her own things being taken out of reach is a count of LOSS.
// The value is deliberately unused, and it is recorded as a deliberate
// non-feature so a later reader does not "complete" it.
//
// TWO ASSERTIONS, because one is not enough:
//   (a) BEHAVIOURAL — the pane's rendered markup for a three-entry roster
//       carries no digit at all once the inline style values are removed, and
//       the specific number the route answered with appears nowhere.
//   (b) A LABELLED SOURCE GATE on the count's PROPERTY ACCESS. ⛔ Never on the
//       bare word: the shipped empty-state line legitimately contains
//       "flagged", so a bare-word negative grep is red on correct code.
// ---------------------------------------------------------------------------
// ⚠⚠ A STRIPPER IS THE EASIEST PLACE IN A SUITE TO HIDE A DEFECT, so exactly
// two things are removed and each is removed for a stated reason that is not
// "otherwise the gate is red":
//   (a) INLINE STYLE VALUES — `10rem`, `14px`, `0 0 8px` are CSS lengths. The
//       plan's own wording scopes this gate to digits "outside the inline
//       style values".
//   (b) HTML TAG NAMES — the heading really is an `<h3>`, and its `3` is the
//       document's own structure, not a number rendered to her. ⛔ Attribute
//       values other than style, and all text content, are LEFT INTACT: that
//       is where a count would actually appear.
// ⚠ And the stripper carries a POSITIVE CONTROL in the group below, because a
// stripper tuned until the gate goes green is this project's signature defect.
function stripMarkupDigits(html) {
  return html
    .replace(/style="[^"]*"/g, 'style=""')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9]*/g, '<');
}

group('noCount (the route\'s count of items newly set aside never reaches a ' +
  'surface)', function () {
  // THE STRIPPER'S OWN POSITIVE CONTROL, run first. If the stripper ever
  // swallows a real count, every assertion below is a pass over nothing.
  const probe = stripMarkupDigits('<h3 style="font-size:24px">private ' +
    'folders</h3><p style="margin:0 0 8px">' + FLAGGED_COUNT +
    ' items set aside</p>');
  if (probe.indexOf(String(FLAGGED_COUNT)) === -1) {
    violations.push('[noCount] the digit stripper swallowed a REAL count ' +
      'rendered as text (' + FLAGGED_COUNT + '), so every assertion in this ' +
      'group would pass on nothing. ⛔ Do not widen the stripper to make this ' +
      'group green — a stripper tuned until the gate passes is the defect ' +
      'landing inside the instrument.');
    return;
  }
  const acts = [['after adding', driveAddOn], ['after removing', driveRemoveOn]];
  acts.forEach(function (a) {
    const d = a[1](drivePane, 'noCount/' + a[0]);
    if (!d) { return; }
    const full = rendered(d.s.dom('manage-sec-roster'));
    if (!full || full.indexOf('Journal') === -1) {
      violations.push('[noCount] ' + a[0] + ': nothing recognisable was ' +
        'rendered, so the absence checks would pass on nothing');
      return;
    }
    if (full.indexOf(String(FLAGGED_COUNT)) !== -1) {
      violations.push('[noCount] ' + a[0] + ': the number the route answered ' +
        'with (' + FLAGGED_COUNT + ') appears in the rendered output. A ' +
        'count of her own things being taken out of reach is a count of ' +
        'loss: ' + JSON.stringify(full.slice(0, 220)));
    }
    const bare = stripMarkupDigits(full);
    const digits = bare.match(/[0-9]/g);
    if (digits) {
      violations.push('[noCount] ' + a[0] + ': the pane rendered digit(s) ' +
        JSON.stringify(digits.join('')) + ' outside its inline style values ' +
        'and its tag names — no number belongs on either half of this pane: ' +
        JSON.stringify(bare.slice(0, 220)));
    }
  });
  // (b) ⚠ THIS ONE IS A SOURCE GATE AND IS LABELLED AS ONE. It reads the text
  // of lifted bodies; it cannot prove anything about behaviour, and it is here
  // only because a count rendered into a branch no case drives would be
  // invisible to (a).
  ['renderRosterEditor', 'renderRosterHosts', 'renderRosterSection',
    'renderVaultImportScreen', 'editVaultRoster', 'rosterWriteFailed',
    'rosterConsequence', 'rosterSentence'].forEach(function (name) {
    if (APP_SRC.indexOf('function ' + name + '(') === -1) { return; }
    const body = extractFn(APP_SRC, name);
    if (/\.\s*flagged\b/.test(body)) {
      violations.push('[noCount] ⚠ SOURCE GATE (not behavioural proof): ' +
        name + ' reads the answer\'s item-count property. The route answers ' +
        'with it and no surface may use it. ⛔ Keyed on the PROPERTY ACCESS, ' +
        'never on the bare word — the shipped empty-state line legitimately ' +
        'contains "flagged".');
    }
  });
});

// ---------------------------------------------------------------------------
// (hardNegatives) THIS PANE NEVER CLAIMS TO GOVERN WHAT ARRIVES IN THE ROOM.
//
// With this pane the room has THREE surfaces naming folders she wants held
// back: this list, 26.97's exclusion picker, and the filters pane. This one
// promises *the librarian may never read it*; the picker promises *it never
// comes into the room at all*. They are kept apart BY COPY — ⛔ never by a
// second visual treatment, which would imply two safety levels.
//
// ⚠ SCOPED TO THE PANE'S RENDERED OUTPUT, NOT TO THE FILE. The connected-apps
// pane legitimately ships one of these phrases, so a file-wide gate would be
// red on shipped code that has nothing to do with this pane.
// ---------------------------------------------------------------------------
const ARRIVAL_CLAIMS = ['brought in', 'comes in'];

group('hardNegatives (the pane never claims to govern what arrives in the ' +
  'room)', function () {
  const surfaces = [
    ['at rest', function () { return drivePane(R3); }],
    ['after adding', function () { return driveAddOn(drivePane, 'hn/add'); }],
    ['after removing',
      function () { return driveRemoveOn(drivePane, 'hn/remove'); }]
  ];
  surfaces.forEach(function (s) {
    const d = s[1]();
    if (!d) { return; }
    const full = rendered(d.s.dom('manage-sec-roster'));
    if (!full || full.indexOf('Journal') === -1) {
      violations.push('[hardNegatives] ' + s[0] + ': nothing recognisable ' +
        'was rendered, so the absence checks would pass on nothing');
      return;
    }
    ARRIVAL_CLAIMS.forEach(function (phrase) {
      if (full.indexOf(phrase) !== -1) {
        violations.push('[hardNegatives] ' + s[0] + ': the pane\'s rendered ' +
          'output claims to govern what arrives in the room (' +
          JSON.stringify(phrase) + '). That is a DIFFERENT guarantee, owned ' +
          'by 26.97\'s folder picker. Conflating the two would tell her she ' +
          'has a protection she does not have: ' +
          JSON.stringify(full.slice(0, 220)));
      }
    });
  });
});

// ---------------------------------------------------------------------------
// (quietRegister) THE CONSEQUENCE SPENDS NO COLOUR.
// ⛔ Not the vermillion safety token, not the coral exclusion token, and not
// the red-error helper's class. Choosing what the librarian may read is her
// own reversible choice — not a failure, and not the never action. Painting it
// red would teach her that protecting herself looks like breakage.
// ---------------------------------------------------------------------------
group('quietRegister (the consequence is soft ink at 14px and spends no ' +
  'colour)', function () {
  [['after adding', driveAddOn], ['after removing', driveRemoveOn]]
    .forEach(function (a) {
      const d = a[1](drivePane, 'quietRegister/' + a[0]);
      if (!d) { return; }
      const slot = consequenceBoxOf(d.editor);
      const note = slot ? slot.innerHTML : '';
      if (!note || note.length === 0) {
        violations.push('[quietRegister] ' + a[0] + ': the consequence slot ' +
          'holds nothing, so its register cannot be read: ' +
          JSON.stringify(rendered(d.editor).slice(0, 200)));
        return;
      }
      if (note.indexOf('var(--ink-soft)') === -1) {
        violations.push('[quietRegister] ' + a[0] + ': the consequence is ' +
          'not in the pane\'s own quiet register (soft ink): ' +
          JSON.stringify(note));
      }
      if (note.indexOf('font-size:14px') === -1) {
        violations.push('[quietRegister] ' + a[0] + ': the consequence is ' +
          'not at the pane\'s label/meta size (14px): ' + JSON.stringify(note));
      }
      [['var(--never)', 'the vermillion safety token'],
        ['var(--accent)', 'the coral exclusion token'],
        ['quiet-error', 'the red-error helper\'s class']].forEach(function (t) {
        if (note.indexOf(t[0]) !== -1) {
          violations.push('[quietRegister] ' + a[0] + ': the consequence ' +
            'spends ' + t[1] + '. Letting the librarian read a folder again ' +
            'is neither a failure nor the never action, and coral means ' +
            'exactly one thing in this app — an exclusion is ON — sitting on ' +
            'the control that REMOVES the protection: ' + JSON.stringify(note));
        }
      });
    });
});

// ---------------------------------------------------------------------------
// (threeRows / framingPresent) THE TWO DEGENERATE READINGS, CLOSED BY VALUE.
//
// ⚠ Both exist because the two gates above are ABSENCE gates, and an absence
// gate is satisfied perfectly by a renderer that produces nothing. `noCount`
// would be green on a pane that rendered no digits BECAUSE it rendered no
// content; `hardNegatives` would be green on an EMPTY framing line. Neither
// would have caught it. These two say what must be THERE.
// ---------------------------------------------------------------------------
group('threeRows (a three-entry roster renders exactly three rows BY VALUE)',
  function () {
    const d = drivePane(R3);
    if (!d.editor) {
      violations.push('[threeRows] the pane never created its editor');
      return;
    }
    const markup = d.editor.innerHTML;
    const rows = markup.split('class="vault-roster-row"').length - 1;
    if (rows !== R3.length) {
      violations.push('[threeRows] a roster of ' + R3.length + ' rendered ' +
        rows + ' row(s), expected ' + R3.length + ' BY VALUE. ⚠ This is what ' +
        'refuses the degenerate reading of noCount: a renderer that produced ' +
        'nothing at all would carry no digits BECAUSE it carried no content.');
    }
    R3.forEach(function (name) {
      if (markup.indexOf(name) === -1) {
        violations.push('[threeRows] the folder ' + JSON.stringify(name) +
          ' is absent from the rendered rows BY VALUE');
      }
    });
    const bound = d.editor.querySelectorAll('.vault-roster-remove').length;
    if (bound !== R3.length) {
      violations.push('[threeRows] ' + bound + ' remove control(s) were ' +
        'bound, expected ' + R3.length + ' BY VALUE — rows that are drawn ' +
        'but not wired are not rows');
    }
  });

// ---------------------------------------------------------------------------
// (consequenceWhole) HER SENTENCE IS THE WHOLE OF WHAT THE SLOT SAYS.
//
// ⚠⚠ THIS CASE EXISTS BECAUSE A PLANT SURVIVED A GATE, and that is worth more
// than the plant it came from. The D3 plant appended the route's count to HER
// SENTENCE (`rosterSentence(op) + ' (' + …flagged + ')'`) and `copyBytes`
// stayed GREEN — because `indexOf` asks whether her words are PRESENT, never
// whether they are the WHOLE of what is said. `noCount` caught that particular
// suffix because it happened to be a number; ⛔ ANY OTHER SUFFIX WOULD HAVE
// SHIPPED. A sentence she approved, with an agent's words welded onto the end
// of it, is exactly the kind of copy rot 26.96-COPY.md exists to prevent, and
// a containment check cannot see it.
//
// So this asserts EQUALITY on the slot's text content, not containment.
//
// ⛔⛔ 26.995-31 — THIS GATE WAS **SPLIT**, NOT RE-BASELINED, AND THE
// DIFFERENCE IS THE WHOLE POINT. Her W-7 removal-scope sentence now renders as
// a SECOND paragraph in this slot (§ B-27, her ruling `Yes, put it there too`,
// 2026-08-22), and this gate went red — because it carried TWO properties
// welded together under ONE stated reason:
//
//   PROPERTY 1  each of her sentences is the WHOLE of the paragraph that
//               carries it — nothing welded onto either end of one
//   PROPERTY 2  the slot holds exactly ONE paragraph
//
// The reason written above — the D3 count suffix that survived `copyBytes` —
// is a reason for PROPERTY 1 ONLY. Property 2 was an incidental truth of the
// day it was written, never an argued rule, and no record anywhere puts it to
// her. ⛔ This project has the opposite mistake on record (#127: a gate banned
// two surfaces under one reason that fitted only one of them, and the fix was
// to SPLIT it rather than re-baseline it), so property 1 is kept EXACTLY as
// it was and property 2 is replaced by an EXPECTED LIST OF PARAGRAPHS.
//
// ⭐ THE RESULT IS STRICTLY STRONGER, NOT WEAKER: after a removal BOTH of her
// sentences are now equality-pinned, so a suffix welded onto EITHER is caught,
// and an extra paragraph nobody ruled is caught as a count mismatch.
//
// ⚠ WHAT THIS ARM DOES **NOT** DO, and its neighbour does. Comparing against
// the lifted W-7 constant asserts SHAPE — that the right arm speaks and that
// nothing is welded on. It does NOT assert the bytes are HERS; a constant an
// agent edited would move this expectation with it. That is the same division
// this file already documents for `addFutureOnly` vs `ruledSlotBytes`, and for
// W-7 the byte gate lives in `tests/test_roster_removal_scope_reaches_her.cjs`,
// which reads her record in the planning vault and then reads BOTH rendered
// removal surfaces. ⛔ Do not delete either on the grounds that the other exists.
// ---------------------------------------------------------------------------
group('consequenceWhole (each of her sentences is the WHOLE of the paragraph ' +
  'that carries it, and the slot holds exactly the paragraphs she ruled)',
  function () {
    const REMOVE_SCOPE =
      new Function('return ' + REMOVE_FUTURE_ONLY_SRC + ';')();
    [['after adding', driveAddOn, [C3]],
      ['after removing', driveRemoveOn, [C4, REMOVE_SCOPE]]]
      .forEach(function (a) {
        const d = a[1](drivePane, 'consequenceWhole/' + a[0]);
        if (!d) { return; }
        const slot = consequenceBoxOf(d.editor);
        const html = slot ? slot.innerHTML : '';
        if (!html) {
          violations.push('[consequenceWhole] ' + a[0] + ': the consequence ' +
            'slot holds nothing, so its text cannot be compared');
          return;
        }
        // ⛔ THE SLOT MUST BE PARAGRAPHS AND NOTHING ELSE. The pattern is
        // anchored at both ends and consumes the whole string, so any stray
        // markup between or around them fails here rather than being skipped.
        const parts = [];
        const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
        let m;
        let consumed = 0;
        while ((m = re.exec(html)) !== null) {
          if (m.index !== consumed) { break; }
          parts.push(m[1]);
          consumed = m.index + m[0].length;
        }
        if (consumed !== html.length) {
          violations.push('[consequenceWhole] ' + a[0] + ': the consequence ' +
            'slot holds something that is not a run of paragraphs: ' +
            JSON.stringify(html));
          return;
        }
        if (parts.length !== a[2].length) {
          violations.push('[consequenceWhole] ' + a[0] + ': the slot holds ' +
            parts.length + ' paragraph(s), expected ' + a[2].length +
            ' BY VALUE. ⛔ An extra paragraph here is a sentence nobody ruled ' +
            'and a missing one is a sentence she ruled that never reaches ' +
            'her. Slot said: ' + JSON.stringify(html));
          return;
        }
        a[2].forEach(function (want, i) {
          if (parts[i] !== want) {
            violations.push('[consequenceWhole] ' + a[0] + ': paragraph ' +
              (i + 1) + ' says ' + JSON.stringify(parts[i]) + ' but her ' +
              'sentence is ' + JSON.stringify(want) + '. ⛔ EQUALITY, not ' +
              'containment: a gate that only asked whether her words were ' +
              'PRESENT stayed green while a count was welded onto the end of ' +
              'them. Every sentence on this surface is hers or already ' +
              'shipped, and nothing may be added to either end of one.');
          }
        });
      });
  });

// ---------------------------------------------------------------------------
// (failWhole) HER FAILURE SENTENCE IS THE WHOLE OF WHAT THE NOTE SLOT SAYS.
//
// ⚠⚠ G-26.96-5. THIS IS `consequenceWhole`'S OWN CLOSURE, APPLIED TO THE SLOT
// IT WAS NOT APPLIED TO. Read the block directly above first: it exists
// because a plant welded a count onto the end of C3 and `copyBytes` stayed
// GREEN — `indexOf` asks whether her words are PRESENT, never whether they are
// the WHOLE of what is said. The team invented that closure, applied it to C3
// and C4, and never applied it to the failure line, whose only gate is
// `assertSaidSo`, which is containment (`note.indexOf(FAIL_LINE)`).
//
// The mutation this refuses is not hypothetical. The verification planted
// ' your folder is now private.' onto the paragraph `rosterWriteFailed`
// writes, proved it semantically live on the driven path — the rendered slot
// really reads "couldn't save — try again. your folder is now private." — and
// the suite returned rc=0 with all 37 groups green and no additional failure
// anywhere in the repo.
//
// ⛔ THAT SENTENCE IS THE PRECISE DECEPTION 26.96-03 EXISTS TO PREVENT: a
// person told her folder is private after a write that never landed, by the
// strongest privacy control in the room. And the measuring instrument
// certified it.
//
// So: EQUALITY on the slot's single paragraph, on BOTH failure arms and BOTH
// hosts — `rosterWriteFailed` writes into every note slot the shared seam
// declared, and a gate reaching only one host would miss a fork the
// byte-identity proof is supposed to make impossible.
//
// ⛔ `assertSaidSo` keeps all three of its own jobs (presence, the soft-ink
// register, the not-vermillion check) and not one of them is loosened here.
// ⛔ FAIL_LINE is LIFTED by `shippedFailureLine()` from app.js's bytes and is
// NEVER re-typed into this file: a pin re-typed wrongly agrees with a helper
// re-typed wrongly, and the gate then certifies the drift instead of catching
// it — this phase's own recorded lesson from the PIN_ROUTE_* constants.
// ---------------------------------------------------------------------------
group('failWhole (the shipped failure sentence is the WHOLE of what the note ' +
  'slot says — both arms, both hosts, by EQUALITY)', function () {
  if (FAIL_LINE === null) {
    violations.push('[failWhole] the shipped failure line could not be lifted ' +
      'out of app.js, so every equality below would be comparing rendered ' +
      'output against null — the silent vacuity this guard refuses');
    return;
  }
  [['arm A rejecting / Manage pane', drivePane, rejectingRoster],
    ['arm A rejecting / import screen', driveImport, rejectingRoster],
    ['arm B not-ok / Manage pane', drivePane, refusingRoster],
    ['arm B not-ok / import screen', driveImport, refusingRoster]
  ].forEach(function (combo) {
    const what = combo[0];
    const d = combo[1](R3, combo[2](R3));
    if (!d.editor) {
      violations.push('[failWhole] ' + what + ': the host never created its ' +
        'editor container — nothing was driven and nothing here is evidence');
      return;
    }
    if (!fireRemove(d.editor, 'personnel notes', 'failWhole ' + what)) {
      return;
    }
    const html = noteOf(d.editor);
    // ⛔ NON-VACUITY BEFORE CONTENT, exactly as consequenceWhole does it. A
    // renderer that produced nothing at all would otherwise satisfy an
    // equality test that never ran, so an absent slot, an empty slot and a
    // slot that is not exactly one paragraph are each a VIOLATION here and
    // never a pass over nothing.
    if (html === null) {
      violations.push('[failWhole] ' + what + ': the editor declared no ' +
        '.vault-roster-note slot, so a failed write has nowhere to speak');
      return;
    }
    if (html.length === 0) {
      violations.push('[failWhole] ' + what + ': the note slot holds NOTHING ' +
        'after a failed write. An empty slot is a violation here, never a ' +
        'pass — a silent failure is the same lie as a false success.');
      return;
    }
    const opens = html.split('<p').length - 1;
    const closes = html.split('</p>').length - 1;
    const m = /^<p[^>]*>([\s\S]*)<\/p>$/.exec(html);
    if (!m || opens !== 1 || closes !== 1) {
      violations.push('[failWhole] ' + what + ': the note slot does not hold ' +
        'exactly one paragraph and nothing else (' + opens + ' opening <p, ' +
        closes + ' closing </p>): ' + JSON.stringify(html));
      return;
    }
    if (m[1] !== FAIL_LINE) {
      violations.push('[failWhole] ' + what + ': the note slot says ' +
        JSON.stringify(m[1]) + ' but the shipped sentence is ' +
        JSON.stringify(FAIL_LINE) + '. ⛔ EQUALITY, not containment. ⚠⚠ READ ' +
        'THE HARM AND NOT THE DIFF: the write FAILED, so anything welded onto ' +
        'either end of that sentence is an agent making a claim about a ' +
        'folder whose privacy did not change. The mutation this group was ' +
        'driven RED on appended " your folder is now private." — a person ' +
        'told her folder is private after a write that never landed, which is ' +
        'the exact deception 26.96-03 exists to prevent — and the entire ' +
        'green suite certified it, because assertSaidSo asks only whether her ' +
        'words are PRESENT. Her sentence is the WHOLE of what this slot says.');
    }
  });
});

group('framingPresent (the pane\'s framing line is present and non-empty)',
  function () {
    const d = drivePane(R3);
    const paneHtml = d.s.dom('manage-sec-roster').innerHTML;
    if (!paneHtml || paneHtml.length === 0) {
      violations.push('[framingPresent] the pane rendered nothing');
      return;
    }
    if (paneHtml.indexOf(C2) === -1) {
      violations.push('[framingPresent] the framing line is absent from the ' +
        'rendered pane. ⚠ This is what refuses the degenerate reading of ' +
        'hardNegatives: an EMPTY framing line contains none of the forbidden ' +
        'phrases and would satisfy that gate perfectly while telling her ' +
        'nothing about what this list actually does.');
    }
    // And it really is inside the pane's own body, not merely somewhere in
    // the captured union — the heading must precede it.
    const iHead = paneHtml.indexOf(C1);
    const iFraming = paneHtml.indexOf(C2);
    if (!(iHead !== -1 && iHead < iFraming)) {
      violations.push('[framingPresent] the framing line does not follow the ' +
        'pane heading by value (heading=' + iHead + ' framing=' + iFraming +
        ')');
    }
  });

// ===========================================================================
// 26.96-05 WAVE 5 — THE LIBRARIAN'S SPOKEN ROUTE, DERIVED FROM THE PANE'S OWN
// LABEL.
//
// THE FINDING THIS CLOSES. F9: the librarian tells a person a control is
// "under manage your library" when for several topics it is not there at all.
// The private-folder list was one of them, and the code's own comment named
// the remedy — its own Manage pane. Waves 2-4 built it. This wave lets the
// librarian say so, and say so DERIVEDLY.
//
// ⚠⚠ WHY DERIVED AND NOT TYPED. The shipped route table's comment claims its
// strings are the MANAGE_PANES labels "reused byte-exactly". They are not:
// both are typed and nothing reads the registry. That is already the state
// 26.96-COPY.md forbids for the pane name — two literals that match TODAY.
// This wave does not add a third, and `routeOneSource` refuses one by value.
//
// ⚠ THE REGISTRY KEY AND THE TOPIC KEY DO NOT ALWAYS MATCH. The connected-apps
// pane's registry key is `sources`; the route table's topic key for it is
// `connected_sources`. `askRouteFor` takes a PANE key; mapping a topic to a
// pane is the caller's job. Both are driven below, deliberately, so a helper
// that only ever worked for keys that happen to agree could not pass.
// ===========================================================================

// The object literal is an OBJECT, not a function, so the brace-balanced
// function lifter cannot find it. ⚠ Slice it deliberately and refuse a failed
// slice loudly — a silently-empty parse turns every assertion below into a
// pass over nothing, which is this project's signature defect landing inside
// the instrument.
function liftObject(src, decl) {
  const start = src.indexOf(decl);
  assert.notStrictEqual(start, -1, decl + ' must exist in app.js — not found');
  let i = src.indexOf('{', start);
  let depth = 0;
  let j;
  for (j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; }
    else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  assert.ok(depth === 0, decl + "'s braces must balance");
  return src.slice(i, j);
}

// A contiguous span of source between two exact markers, or null when either
// marker is absent. ⛔ Returns null rather than throwing: before this plan's
// own fix the helper does not exist, and a throw here would take the whole
// file down as `[harness] group`, which this plan's RED acceptance criterion
// explicitly forbids.
function liftSpan(src, from, to) {
  const a = src.indexOf(from);
  if (a === -1) { return null; }
  const b = src.indexOf(to, a);
  if (b === -1) { return null; }
  return src.slice(a, b + to.length);
}

// The same span, ending BEFORE its end anchor instead of at it.
//
// ⚠ WHY BOTH EXIST, because a reader will otherwise delete one. A span that
// ends AT its anchor is right when the anchor is the LAST THING YOU WANT — it
// is how `ROUTE_TAIL_OLD_SRC` below pins the roster assignment as its final
// statement. A span that ends BEFORE its anchor is right when the anchor is
// THE NEXT DECLARATION and including it would be a syntax error or a duplicate
// definition — which is exactly the case here: `liftRouteScope` already lifts
// `askRouteLine` separately, so a span running through it would define the
// function twice in one scope.
//
// ⛔ Returns null rather than throwing, for the same reason `liftSpan` does: a
// throw here takes the whole file down as `[harness] group` and proves nothing.
function liftSpanBefore(src, from, to) {
  const a = src.indexOf(from);
  if (a === -1) { return null; }
  const b = src.indexOf(to, a);
  if (b === -1) { return null; }
  return src.slice(a, b);
}

// ---------------------------------------------------------------------------
// THE TWO SHIPPED ROUTE LINES, PINNED BY VALUE.
//
// ⛔ READ OUT OF THE SHIPPED BYTES at revision ffc0ebe45f5de251262d5bce6d649b21
// 7decea40 (`git show ffc0ebe:app.js`), verified identical to the worktree at
// that revision, and written here with the four quotation marks as EXPLICIT
// CODEPOINT ESCAPES.
//
// ⚠⚠ THE QUOTATION MARKS ARE CURLY — U+201C then U+201D, twice, in the order
// open, close, open, close. A straight-quote paste (U+0022) is invisible to
// the eye, and a pin that had been re-typed wrongly would AGREE with a helper
// that had been re-typed wrongly: the gate would then confirm the drift
// instead of catching it. So the pin is not trusted either — `pinShape` below
// asserts these very constants BY CODEPOINT before they are used to judge
// anything, and this comment's claim about them is therefore checked by the
// suite rather than believed.
//
// Measured at that revision, for the record:
//   filters           55 chars, marks at 8220 8221 8220 8221
//   connected_sources 62 chars, marks at 8220 8221 8220 8221
// ---------------------------------------------------------------------------
const PIN_ROUTE_FILTERS =
  'open “manage your library” in the room, then “filters”.';
const PIN_ROUTE_SOURCES =
  'open “manage your library” in the room, then ' +
  '“connected apps”.';

// The route table as it stands, plus — once this plan's fix lands — the
// template, the helper and the derived roster assignment, lifted as ONE
// contiguous span so the test drives the real construction order rather than a
// re-creation of it.
const ROUTE_OBJ_SRC = liftObject(APP_SRC, 'var ASK_MANAGE_ROUTE = {');
const ROUTE_ROSTER_ASSIGN = "ASK_MANAGE_ROUTE.roster = askRouteFor('roster');";
// ⚠⚠ 26.96-09 / G-26.96-6: THE OLD SPAN ENDED AT THE ASSIGNMENT LITERAL, SO
// NOTHING AFTER IT EVER ENTERED TEST SCOPE. The verification planted
// `ASK_MANAGE_ROUTE.roster += ' it may be hidden under the librarian.';`
// immediately AFTER the pinned assignment — an agent's clause welded onto the
// librarian's spoken direction — and every route group stayed green, because
// the mutated statement lived outside the lifted source entirely. A gate that
// cannot SEE a site is not a gate over it.
//
// The span now runs to the line BEFORE `function askRouteLine(`, the next
// declaration, so every statement between the template and it is evaluated.
// ⛔ The old span is KEPT, as the yardstick the non-vacuity guard measures
// against — the widened span must be strictly longer than it, or the anchor
// moved and this whole gate quietly became a pass over nothing.
const ROUTE_TAIL_OLD_SRC = liftSpan(APP_SRC, 'var ASK_ROUTE_TEMPLATE',
  ROUTE_ROSTER_ASSIGN);
const ROUTE_TAIL_SRC = liftSpanBefore(APP_SRC, 'var ASK_ROUTE_TEMPLATE',
  'function askRouteLine(');

// Builds the real scope. ⛔ Never throws: it reports what it could not lift.
function liftRouteScope() {
  const out = { ok: false, why: '', route: null, line: null, helper: null,
    label: null, template: null };
  // ⛔⛔ NON-VACUITY OF THE WIDENED SPAN, ASSERTED BEFORE ANY CONTENT IS READ.
  // Three checks, and all three are load-bearing: without them a moved anchor
  // turns every equality below into a pass over nothing, which is the precise
  // failure G-26.96-6 is. Reported as a named violation, never thrown — this
  // file's standing discipline is that a lift REPORTS what it could not lift.
  if (ROUTE_TAIL_SRC === null) {
    out.why = '⛔ THE WIDENED ROUTE SPAN LIFTED NOTHING. Either ' +
      '"var ASK_ROUTE_TEMPLATE" or "function askRouteLine(" is no longer in ' +
      'app.js, so the span is null and every route equality below would be ' +
      'evaluated against an empty scope — a pass over nothing.';
    return out;
  }
  if (ROUTE_TAIL_SRC.indexOf(ROUTE_ROSTER_ASSIGN) === -1) {
    out.why = '⛔ THE WIDENED ROUTE SPAN NO LONGER CARRIES THE PINNED ROSTER ' +
      'ASSIGNMENT ' + JSON.stringify(ROUTE_ROSTER_ASSIGN) + ' BY VALUE. The ' +
      'statement under test is outside the source being evaluated, so the ' +
      'roster route below is whatever the object literal happened to hold — ' +
      'not what the product actually assigns.';
    return out;
  }
  if (ROUTE_TAIL_OLD_SRC === null ||
      ROUTE_TAIL_SRC.length <= ROUTE_TAIL_OLD_SRC.length) {
    out.why = '⛔ THE WIDENED ROUTE SPAN IS NOT WIDER. It measures ' +
      (ROUTE_TAIL_SRC ? ROUTE_TAIL_SRC.length : 'null') + ' characters ' +
      'against the assignment-terminated span\'s ' +
      (ROUTE_TAIL_OLD_SRC ? ROUTE_TAIL_OLD_SRC.length : 'null') + '. The ' +
      'whole point of the widening is that statements AFTER the pinned ' +
      'assignment enter scope; if it is not strictly longer, the end anchor ' +
      'moved and this gate has silently gone back to seeing nothing.';
    return out;
  }
  try {
    const api = new Function(
      'var MANAGE_PANES = ' + REGISTRY_SRC + ';\n' +
      extractFn(APP_SRC, 'managePaneLabel') + '\n' +
      'var ASK_MANAGE_ROUTE = ' + ROUTE_OBJ_SRC + ';\n' +
      (ROUTE_TAIL_SRC || '') + '\n' +
      extractFn(APP_SRC, 'askRouteLine') + '\n' +
      'return { route: ASK_MANAGE_ROUTE, line: askRouteLine,' +
      ' label: managePaneLabel, panes: MANAGE_PANES,' +
      ' template: (typeof ASK_ROUTE_TEMPLATE !== "undefined" ?' +
      '   ASK_ROUTE_TEMPLATE : null),' +
      ' helper: (typeof askRouteFor === "function" ? askRouteFor : null) };'
    )();
    // ⚠ NON-VACUITY, ASSERTED BEFORE ANY CONTENT IS INSPECTED. A failed slice
    // parses to an empty object and every equality below would then be
    // comparing undefined against undefined and reporting nothing.
    if (!api.route || Object.keys(api.route).length < 2) {
      out.why = 'the route table lifted to fewer than 2 keys — the slice ' +
        'failed and every assertion built on it would be a pass over nothing';
      return out;
    }
    if (!Array.isArray(api.panes) || api.panes.length === 0) {
      out.why = 'the pane registry lifted to an empty array — the slice ' +
        'failed and no label could be read from it';
      return out;
    }
    if (typeof api.line !== 'function') {
      out.why = 'askRouteLine did not lift as a function';
      return out;
    }
    out.ok = true;
    out.route = api.route;
    out.line = api.line;
    out.label = api.label;
    out.helper = api.helper;
    out.template = api.template;
    return out;
  } catch (e) {
    out.why = 'the route scope could not be built: ' +
      (e && e.message ? e.message : String(e));
    return out;
  }
}

// ---------------------------------------------------------------------------
// THE ONE SPELLING OF THE EXPECTED ROSTER DIRECTION.
//
// head + the roster pane's own registry label + tail, where head and tail are
// DERIVED by splitting the SHIPPED filters line around the FILTERS pane's own
// registry label. ⛔ Never typed: the quotation marks are curly (U+201C /
// U+201D) and a straight-quote paste is invisible to the eye — the same reason
// the product itself derives them instead of typing a template.
//
// ⚠⚠ WHY AN EQUALITY AGAINST A VALUE DERIVED FROM THE SAME SOURCE IS NOT
// CIRCULAR HERE — AND A READER WHO DELETES HALF OF THIS LOOP MUST KNOW IT.
// If the TEMPLATE ITSELF were mutated, this expected value would move with the
// mutation and agree with it. This gate is NOT self-sufficient and does not
// claim to be. The template is pinned INDEPENDENTLY by `routeTemplateBytes`,
// which rebuilds BOTH shipped route lines by EQUALITY against
// PIN_ROUTE_FILTERS and PIN_ROUTE_SOURCES — and those two constants are
// themselves asserted BY CODEPOINT inside `routeShippedUnchanged` before they
// are trusted to judge anything. ⛔ THE TWO GATES TOGETHER CLOSE THE LOOP;
// EITHER ONE ALONE WOULD NOT.
//
// ⛔ NON-VACUITY, ASSERTED BEFORE THE VALUE IS HANDED BACK. A derivation whose
// head and tail came out empty would reduce to the bare label, and an equality
// against THAT would ACCEPT the bare-label direction this wave exists to
// refuse — widening a containment check to `===` can silence a red as easily
// as it can create one, so both directions are checked here.
// ---------------------------------------------------------------------------
function derivedRosterRoute(s) {
  const out = { ok: false, why: '', value: null, head: null, tail: null,
    label: null };
  const anchor = s.label('filters');
  const shipped = s.route.filters;
  const at = (anchor && typeof shipped === 'string') ?
    shipped.lastIndexOf(anchor) : -1;
  if (at === -1) {
    out.why = 'the route template could not be split out of the shipped ' +
      'filters line (label ' + JSON.stringify(anchor) + ', shipped ' +
      JSON.stringify(shipped) + '), so the expected direction could not be ' +
      'derived — every equality built on it would be a pass over nothing';
    return out;
  }
  const head = shipped.slice(0, at);
  const tail = shipped.slice(at + anchor.length);
  if (head.length === 0 || tail.length === 0) {
    out.why = 'the derived route template is empty on one side (head ' +
      JSON.stringify(head) + ', tail ' + JSON.stringify(tail) + '). An ' +
      'expected value of head + label + tail would then reduce to the bare ' +
      'LABEL, and an equality against that would ACCEPT the name-not-a-' +
      'direction answer this wave refuses — a silenced red, not a false one';
    return out;
  }
  const label = s.label('roster');
  if (!label) {
    out.why = 'the pane registry has no label for the roster pane, so there ' +
      'is nothing for the direction to be derived FROM';
    return out;
  }
  out.ok = true;
  out.head = head;
  out.tail = tail;
  out.label = label;
  out.value = head + label + tail;
  return out;
}

// ---------------------------------------------------------------------------
// (routeDerived) THE LIBRARIAN'S DIRECTION TO THE PRIVATE-FOLDER LIST EXISTS,
// AND IT CARRIES THE PANE'S LABEL AS READ FROM THE REGISTRY.
//
// ⚠ Today this is EMPTY: the roster topic is listed as deliberately absent,
// with a reason — the fence editor lives behind a photos fallback button on
// the import screen — that waves 2-4 have removed. Silence WAS honest. It is
// not honest any more, because there is now somewhere true to point.
// ---------------------------------------------------------------------------
group('routeDerived (the spoken route for the private-folder list exists and ' +
  'carries the pane\'s own registry label)', function () {
  const s = liftRouteScope();
  if (!s.ok) {
    violations.push('[routeDerived] ' + s.why);
    return;
  }
  const label = s.label('roster');
  if (!label) {
    violations.push('[routeDerived] the pane registry has no label for the ' +
      'roster pane, so there is nothing for the direction to be derived FROM');
    return;
  }
  const spoken = s.line('roster');
  if (!spoken) {
    violations.push('[routeDerived] THE LIBRARIAN STILL GIVES NO DIRECTION ' +
      'FOR THE PRIVATE-FOLDER LIST. askRouteLine(\'roster\') returned ' +
      JSON.stringify(spoken) + '. ⚠ Silence was the honest answer while the ' +
      'fence editor lived only on the import screen behind a photos fallback ' +
      'button — a path, not an instruction anyone could give. Waves 2-4 ' +
      'shipped the pane, so there is now a true destination and refusing to ' +
      'name it is no longer honesty, it is a brush-off. THIS IS THE FINDING ' +
      'THE PHASE IS NAMED AFTER.');
    return;
  }
  // ⚠ 26.96-09: this asked only whether the spoken direction CONTAINED the
  // label. It is now the same EQUALITY the whole wave runs on, through the one
  // derivation helper, so there is a single spelling of what the direction
  // must be. The F9 framing below is unchanged and is still what this group is
  // FOR: a direction that does not name a destination the settings rail
  // carries.
  const want = derivedRosterRoute(s);
  if (!want.ok) {
    violations.push('[routeDerived] ' + want.why);
    return;
  }
  if (spoken !== want.value) {
    violations.push('[routeDerived] the spoken direction ' +
      JSON.stringify(spoken) + ' is not the pane\'s own direction ' +
      JSON.stringify(want.value) + ', built from the registry label ' +
      JSON.stringify(label) + '. ⛔ EQUALITY, not containment. If the label ' +
      'is missing from it, the librarian names a destination the settings ' +
      'rail does not carry, which is the F9 failure exactly.');
  }
});

// ---------------------------------------------------------------------------
// (routeTemplateBytes) REBUILDING AN ALREADY-SHIPPED ROUTE LINE THROUGH THE
// HELPER REPRODUCES IT BYTE-FOR-BYTE.
//
// ⚠⚠ THIS IS THE CURLY-QUOTE GATE, AND IT IS ASSERTED AS EQUALITY. 26.96-04
// recorded a plant that welded a count onto the END of an approved sentence
// and survived a containment gate, because `indexOf` asks whether the words
// are PRESENT, never whether they are the WHOLE of what is said. Every copy
// assertion in this wave is `===`.
//
// ⚠ BOTH LINES ARE DRIVEN, and the second one is the point: its pane key
// (`sources`) differs from its topic key (`connected_sources`), so a helper
// that quietly assumed the two always agree cannot pass this group.
// ---------------------------------------------------------------------------
group('routeTemplateBytes (the helper rebuilds BOTH shipped route lines ' +
  'byte-for-byte, curly quotation marks included)', function () {
  const s = liftRouteScope();
  if (!s.ok) {
    violations.push('[routeTemplateBytes] ' + s.why);
    return;
  }
  if (typeof s.helper !== 'function') {
    violations.push('[routeTemplateBytes] NO HELPER EXISTS: askRouteFor is ' +
      'not defined in app.js, so no shipped route line can be rebuilt from ' +
      'the pane registry and the roster entry could only be a literal. ⚠ The ' +
      'route table\'s own comment already claims its strings are the ' +
      'MANAGE_PANES labels "reused byte-exactly" — nothing in the file reads ' +
      'the registry, so that claim is false today and this wave makes it true.');
    return;
  }
  [['filters', 'filters', 'the filters route line'],
    ['sources', 'connected_sources', 'the connected-apps route line']
  ].forEach(function (row) {
    const paneKey = row[0];
    const topicKey = row[1];
    const what = row[2];
    const rebuilt = s.helper(paneKey);
    const shipped = s.route[topicKey];
    if (rebuilt !== shipped) {
      violations.push('[routeTemplateBytes] ' + what + ' does not survive a ' +
        'round trip through the helper. Rebuilt ' + JSON.stringify(rebuilt) +
        ', shipped ' + JSON.stringify(shipped) + '. ⛔ EQUALITY, not ' +
        'containment. ⚠ If the two look identical on screen, compare the ' +
        'CODEPOINTS: the shipped quotation marks are CURLY (U+201C / U+201D) ' +
        'and a straight-quote paste is invisible to the eye. rebuilt=[' +
        Array.from(String(rebuilt)).map(function (c) {
          return c.charCodeAt(0);
        }).join(' ') + '] shipped=[' +
        Array.from(String(shipped)).map(function (c) {
          return c.charCodeAt(0);
        }).join(' ') + ']');
    }
  });
});

// ---------------------------------------------------------------------------
// (routeOneSource) THE PANE NAME IS TYPED EXACTLY ONCE IN app.js.
//
// ⚠ 26.96-09 (IN-03): `quotedLiteralCount` used to be DEFINED HERE, below the
// gate in `copyBytes` that now also calls it. It worked only by function-
// declaration hoisting, and a later reordering would have turned a working
// gate into a ReferenceError that the throw-guard reports as a broken
// instrument. It now lives with the other source helpers, above its first use.
//
// ⚠ A CONTROL: it is green BEFORE this plan's fix as well as after, because
// 26.96-02 established the one-source contract — the name typed once, as the
// registry label, with the heading reading it back through managePaneLabel.
// ⛔ If it is red on arrival the defect is UPSTREAM in wave 2, and the repair
// belongs there. Never loosen this gate to make a red go away: that is exactly
// how a one-source contract decays into two strings that agree today.
//
// ⚠⚠ COUNTED AS A QUOTED STRING LITERAL, NEVER AS A BARE SUBSTRING. The bare
// substring occurs TWICE more in shipped copy this phase never touches, so a
// substring count could only ever fail — a gate that cannot pass is a broken
// instrument, and correcting one is not loosening it.
// ---------------------------------------------------------------------------
group('routeOneSource (the pane name is one quoted literal in app.js — a ' +
  'SOURCE gate)', function () {
  const bare = APP_SRC.split(C1).length - 1;
  const quoted = quotedLiteralCount(APP_SRC, C1);
  recordQuotedCount('routeOneSource', quoted);
  // ⛔ IN-03: ONE RULE, ONE SPELLING — asserted here rather than assumed.
  // `copyBytes` runs earlier and records the number IT saw. If that record is
  // missing, that gate did not run and this run proves less than it looks like
  // it does; if the two numbers differ, the one-literal rule has two spellings
  // and one of them is wrong.
  if (!Object.prototype.hasOwnProperty.call(ONE_LITERAL_SEEN, 'copyBytes')) {
    violations.push('[routeOneSource] copyBytes recorded no quoted-literal ' +
      'count for the pane name, so the two gates cannot be compared. Either ' +
      'that group did not run or it stopped counting — and a rule with one ' +
      'unverified spelling is how this file got two in the first place.');
  } else if (ONE_LITERAL_SEEN.copyBytes !== quoted) {
    violations.push('[routeOneSource] THE ONE-LITERAL RULE HAS TWO SPELLINGS. ' +
      'copyBytes counted ' + ONE_LITERAL_SEEN.copyBytes + ' and this gate ' +
      'counted ' + quoted + ' for the SAME pane name in the SAME run. Both ' +
      'must obtain the number from quotedLiteralCount.');
  }
  if (quoted !== 1) {
    violations.push('[routeOneSource] ⚠ SOURCE GATE (not behavioural proof): ' +
      'the pane name appears as a quoted string literal ' + quoted +
      ' time(s) in app.js, expected exactly 1 BY VALUE. It is now spoken in ' +
      'THREE places — the settings list entry, the pane heading, and the ' +
      'librarian\'s route line — and 26.96-COPY.md binds them to "the same ' +
      'string from one source, not two literals that happen to match today". ' +
      'A second matching literal is not a harmless duplicate: it is how ' +
      'already-approved copy silently rots, one surface at a time. (Bare ' +
      'substring occurrences, for context and NOT asserted: ' + bare + ' — ' +
      'the extra ones are shipped copy this phase never touches, which is ' +
      'why this gate counts QUOTED LITERALS.) ⛔ Do not satisfy this by ' +
      'loosening the count; find the second literal and read the label ' +
      'through managePaneLabel instead.');
  }
});

// ---------------------------------------------------------------------------
// (routeShippedUnchanged) THE TWO SHIPPED ROUTE LINES ARE BYTE-UNCHANGED.
//
// ⚠ A CONTROL, green before and after. They are approved shipped copy and
// changing them is not this phase's business. Asserted by EQUALITY against the
// pinned bytes above.
// ---------------------------------------------------------------------------
group('routeShippedUnchanged (the two shipped route lines are byte-identical ' +
  'to their pinned values)', function () {
  // ⚠⚠ THE PIN IS CHECKED BEFORE IT IS TRUSTED. If an editor ever "tidied"
  // this file's own quotation marks into straight ones, the pin and a
  // similarly-tidied helper would agree and this gate would certify the drift.
  // So the constants above are asserted BY CODEPOINT first: exactly four
  // marks, U+201C U+201D U+201C U+201D, in that order, with no U+0022 at all.
  [[PIN_ROUTE_FILTERS, 'the filters pin'],
    [PIN_ROUTE_SOURCES, 'the connected-apps pin']].forEach(function (p) {
    const marks = Array.from(p[0])
      .map(function (c) { return c.charCodeAt(0); })
      .filter(function (n) { return n === 8220 || n === 8221 || n === 34; });
    if (marks.join(' ') !== '8220 8221 8220 8221') {
      violations.push('[routeShippedUnchanged] ⛔ THE PIN ITSELF IS WRONG — ' +
        p[1] + ' carries quotation marks [' + marks.join(' ') + '], expected ' +
        '[8220 8221 8220 8221]. A straight quote (34) here means this test ' +
        'file was re-typed or smart-quote-tidied, and the gate would then ' +
        'agree with an equally-wrong helper instead of catching it. Re-read ' +
        'the bytes from the shipped source; ⛔ do not re-type them.');
    }
  });
  const s = liftRouteScope();
  if (!s.ok) {
    violations.push('[routeShippedUnchanged] ' + s.why);
    return;
  }
  [['filters', PIN_ROUTE_FILTERS, 'the filters route line'],
    ['connected_sources', PIN_ROUTE_SOURCES, 'the connected-apps route line']
  ].forEach(function (row) {
    const live = s.route[row[0]];
    if (live !== row[1]) {
      violations.push('[routeShippedUnchanged] ' + row[2] + ' has CHANGED. ' +
        'Live ' + JSON.stringify(live) + ', pinned ' + JSON.stringify(row[1]) +
        ' (read out of the shipped bytes at ffc0ebe). ⛔ This is approved ' +
        'shipped copy and no agent may reword it. If the change was ' +
        'deliberate it is owed copy: stop and ask her.');
    }
  });
});

// ---------------------------------------------------------------------------
// (routeAbsentTopics) THE TOPICS SHE RULED ON STILL GET NO DIRECTION.
//
// ⚠ A CONTROL, green before and after, and it is the one that keeps this wave
// honest in the other direction. She was asked about the two dead-end settings
// and chose to leave them: the librarian still says only that it cannot change
// them from here. `librarian_name` never reaches this branch at all — the chat
// is its only route — so naming one would send her AWAY from the one thing
// that could have worked.
//
// ⛔ This group is also what refuses the lazy fix: giving EVERY absent topic a
// derived line would make `routeDerived` green while re-opening F9 three times
// over, because three of these panes do not exist.
// ---------------------------------------------------------------------------
group('routeAbsentTopics (the topics she ruled on still resolve to no ' +
  'direction at all)', function () {
  const s = liftRouteScope();
  if (!s.ok) {
    violations.push('[routeAbsentTopics] ' + s.why);
    return;
  }
  ['habit_anchor', 'onboarding', 'librarian_name'].forEach(function (t) {
    const spoken = s.line(t);
    if (spoken !== '') {
      violations.push('[routeAbsentTopics] the librarian now gives a ' +
        'direction for "' + t + '": ' + JSON.stringify(spoken) + '. ⛔ It ' +
        'must give none. She was asked about the dead-end settings and chose ' +
        'to leave them, and there is no pane to point at — SILENCE IS ' +
        'HONEST, A WRONG DIRECTION IS NOT, which is the rule the shipped ' +
        'comment already states and F9 was raised to enforce.');
    }
  });
});

// ---------------------------------------------------------------------------
// (routeWholeLine) THE DIRECTION IS A DIRECTION, NOT A LABEL.
//
// ⚠ THE DEGENERATE READING THIS CLOSES. `routeDerived` asks whether the spoken
// direction CONTAINS the pane's label. An implementation that returned the
// bare label — "private folders" and nothing else — satisfies that perfectly
// while telling her nothing about where to go. She would be handed the name of
// a thing and left to find it, which is a politer form of the exact brush-off
// F9 was raised about.
//
// So the direction must also carry the TEMPLATE'S OWN WORDS: the part before
// the label and the part after it. ⛔ Both are DERIVED here, by splitting the
// shipped filters line around the filters pane's own registry label — never
// typed, for the same curly-quote reason the product derives them.
// ---------------------------------------------------------------------------
group('routeWholeLine (the spoken direction carries the template\'s own ' +
  'words, not just the label)', function () {
  const s = liftRouteScope();
  if (!s.ok) {
    violations.push('[routeWholeLine] ' + s.why);
    return;
  }
  const want = derivedRosterRoute(s);
  if (!want.ok) {
    violations.push('[routeWholeLine] ' + want.why);
    return;
  }
  const spoken = s.line('roster');

  if (!spoken) {
    violations.push('[routeWholeLine] the spoken direction for the ' +
      'private-folder list is empty');
    return;
  }
  // ⛔ THIS GUARD STAYS, and it is not redundant under the equality below. It
  // catches a DIFFERENT failure and names it precisely: an implementation that
  // returns the bare label satisfies containment perfectly while telling her
  // nothing about where to go, and a reader who saw only "not equal" would
  // not know that is what happened.
  if (spoken === want.label) {
    violations.push('[routeWholeLine] the spoken direction is nothing but the ' +
      'pane\'s label (' + JSON.stringify(spoken) + '). ⛔ That is a NAME, not ' +
      'a DIRECTION — it hands her the word and leaves her to find the thing, ' +
      'which is the brush-off F9 was raised about wearing better manners.');
    return;
  }
  // ⚠ 26.96-09: these were two CONTAINMENT checks over the spoken direction,
  // in a wave whose own header states "Every copy assertion in this wave is
  // ===".
  // Containment could not see a clause welded onto either END of the shipped
  // direction — and it had a second hole besides: an EMPTY head or tail is
  // contained by every string, so a degenerate template would have passed
  // silently. Equality closes both.
  if (spoken !== want.value) {
    violations.push('[routeWholeLine] the spoken direction ' +
      JSON.stringify(spoken) + ' is not the route template\'s own words ' +
      'around the pane\'s own label. Expected ' + JSON.stringify(want.value) +
      ' — head ' + JSON.stringify(want.head) + ', label ' +
      JSON.stringify(want.label) + ', tail ' + JSON.stringify(want.tail) +
      ', derived from the shipped filters line by splitting it around that ' +
      'pane\'s own registry label. ⛔ EQUALITY, not containment.');
  }
});

// ---------------------------------------------------------------------------
// (routeValueWhole) THE LIBRARIAN'S SPOKEN DIRECTION IS THE WHOLE OF WHAT SHE
// IS TOLD — G-26.96-6.
//
// ⚠⚠ WHY THIS GROUP EXISTS RATHER THAN A TIGHTENING OF THE ONES ABOVE. The
// verification planted, immediately AFTER the pinned assignment:
//
//     ASK_MANAGE_ROUTE.roster += ' it may be hidden under the librarian.';
//
// — an agent's sentence welded onto the librarian's spoken direction, in the
// phase's only NEW copy string — and EVERY route group stayed green. Two
// independent reasons, and both are now closed:
//
//   1. `ROUTE_TAIL_SRC`'s span ENDED AT the assignment literal, so nothing
//      after it entered test scope at all. A gate cannot catch what it cannot
//      see. The span now runs to the line before `askRouteLine`.
//   2. `routeWholeLine` asked CONTAINMENT, in a wave whose own header reads
//      "Every copy assertion in this wave is `===`". A welded suffix is
//      contained by definition.
//
// This group asserts the value ITSELF, read from the LIVE SCOPE — not from a
// re-derivation, and not from a span that stops at a source literal.
//
// ⛔ IT IS NOT SELF-SUFFICIENT AND MUST NOT BE PRESENTED AS IF IT WERE. The
// expected value comes from the same template the product used; the template's
// own independent pin lives in `routeTemplateBytes`, whose constants are
// codepoint-checked in `routeShippedUnchanged`. Delete either of those and
// this equality starts agreeing with a mutated template. The comment above
// `derivedRosterRoute` says so at length; read it before touching any of the
// three.
// ---------------------------------------------------------------------------
group('routeValueWhole (the roster route VALUE equals head + the pane\'s ' +
  'registry label + tail, read from the live scope)', function () {
  const s = liftRouteScope();
  if (!s.ok) {
    violations.push('[routeValueWhole] ' + s.why);
    return;
  }
  // The live template, carried out of the same scope the product ran in — so
  // this is not a second derivation agreeing with the first by construction.
  if (!s.template || typeof s.template.head !== 'string' ||
      typeof s.template.tail !== 'string') {
    violations.push('[routeValueWhole] the live ASK_ROUTE_TEMPLATE did not ' +
      'come back out of the lifted scope (' + JSON.stringify(s.template) +
      '), so there is no evidence the widened span evaluated the product\'s ' +
      'own construction rather than an empty one');
    return;
  }
  const want = derivedRosterRoute(s);
  if (!want.ok) {
    violations.push('[routeValueWhole] ' + want.why);
    return;
  }
  const shipped = s.route.roster;
  if (shipped !== want.value) {
    violations.push('[routeValueWhole] THE LIBRARIAN\'S SPOKEN DIRECTION TO ' +
      'THE PRIVATE-FOLDER LIST IS NOT WHAT THE PANE\'S OWN LABEL BUILDS. ' +
      'Shipped ' + JSON.stringify(shipped) + ', expected ' +
      JSON.stringify(want.value) + '. ⛔ EQUALITY, not containment — the wave ' +
      'that added this line states in its own header that "Every copy ' +
      'assertion in this wave is ===", and this was the one place it was not. ' +
      '⚠⚠ READ THE HARM: a clause welded onto the end of a direction — the ' +
      'mutation this group was driven RED on appended " it may be hidden ' +
      'under the librarian." — is an AGENT putting words in the librarian\'s ' +
      'mouth about where a person\'s privacy control lives. It is the phase\'s ' +
      'only new copy string, and every sentence on this surface is hers or ' +
      'already shipped.');
  }
});

// ===========================================================================
// 26.96-07 WAVE 7 — WHO OWNS THE PANE'S SURFACE.
//
// G-26.96-1: a roster write that FAILS says so AND KEEPS SAYING SO.
// G-26.96-2: her typed folder name survives a failed add THROUGH a late read.
// WR-04:     two roster writes in flight are sequenced by the same claim.
//
// One mechanism, three symptoms. `renderRosterSection` issues GET /api/items on
// EVERY call and is called from renderManageHome AND from showManagePane — so
// entering Manage and then tapping the `private folders` rail entry leaves a
// read of the whole library in flight while she is looking at a live pane.
// ===========================================================================

// Holds the FIRST /api/items and answers every later one normally, delegating
// every other URL to the arm the case chose. This is the shape that expresses
// the real sequence: renderManageHome issues read #1, showManagePane issues
// read #2, read #2 lands first, the write fails, and THEN read #1 lands.
//
// ⛔ Selected by name, never implicitly. It hands the held object back on the
// returned function so the case — and only the case — decides when it lands.
//
// ⚠ `holdNth` DEFAULTS TO 1 AND IS PASSED EXPLICITLY WHEN IT IS NOT. Holding
// the SECOND read models the other real order — renderManageHome's read lands
// fast and PAINTS, and it is showManagePane's whole-library read that is still
// in the air while she is typing into a live pane. Which read is held decides
// which claim is the newest, and that in turn decides which guard is the
// load-bearing one; the re-plant drill in 26.96-07 measured exactly that.
function heldItemsThen(fencedRoster, armTransport, holdNth) {
  const held = heldThenable();
  const nth = holdNth || 1;
  let reads = 0;
  const t = function (url, body) {
    if (url === '/api/items') {
      reads += 1;
      return reads === nth ? held : metaAnswer(fencedRoster);
    }
    return armTransport(url, body);
  };
  t.held = held;
  t.reads = function () { return reads; };
  return t;
}

function assertHeld(where, t, expectedReads) {
  if (t.held.pending !== true) {
    violations.push('[' + where + '] the held /api/items read is NOT pending ' +
      'at the moment this case acts. A "deferred" stub that had quietly ' +
      'resolved would be modelling the happy path, and every survival ' +
      'assertion below it would be describing the very sequence it claims to ' +
      'rule out.');
    return false;
  }
  if (t.reads() !== expectedReads) {
    violations.push('[' + where + '] the pane issued ' + t.reads() +
      ' /api/items read(s), expected ' + expectedReads + ' BY VALUE — the ' +
      'interleaving this case describes did not actually happen');
    return false;
  }
  return true;
}

function noteBoxOf(editor) {
  return editor && editor.kids ?
    (editor.kids['vault-roster-note'] || null) : null;
}

// ---------------------------------------------------------------------------
// (deferredNote) A FAILED WRITE SAYS SO, AND KEEPS SAYING SO THROUGH A READ
// THAT LANDS AFTERWARDS.
//
// ⛔⛔ BOTH HALVES OF THE SURVIVAL ARE ASSERTED, AND THE REASON IS THIS FILE'S
// OWN: the container double's `reset()` empties a child WITHOUT incrementing
// its `writes` counter, so an ERASED slot still reads `writes === 1`. A case
// that asserted only the count would be GREEN ON THE DEFECT.
// ---------------------------------------------------------------------------
group('deferredNote (a failed write\'s sentence survives an /api/items read ' +
  'that lands after it)', function () {
  const t = heldItemsThen(R3, refusingRoster(R3));
  const s = rosterScope(t);
  s.api.pane();                       // renderManageHome — read #1, HELD
  s.api.pane();                       // showManagePane  — read #2, answers
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[deferredNote] the pane never created its editor ' +
      'container — nothing was driven and nothing below is evidence');
    return;
  }
  if (!assertHeld('deferredNote', t, 2)) { return; }
  nonEmptyNamed('deferredNote', editor.innerHTML, R3);

  if (!fireRemove(editor, 'personnel notes', 'deferredNote')) { return; }
  assertSaidSo('deferredNote/beforeSettle', editor);

  // ⚠ THE MOMENT UNDER TEST. The read that was already in the air lands.
  t.held.settle({ ok: true, status: 200,
    data: { meta: { fenced_roster: R3 } } });
  if (t.held.pending !== false) {
    violations.push('[deferredNote] the held read reports itself still ' +
      'pending after settle — the instrument did not do the thing this case ' +
      'is about');
    return;
  }

  const note = noteOf(editor);
  if (FAIL_LINE === null || note === null ||
      note.indexOf(FAIL_LINE) === -1) {
    violations.push('[deferredNote] ⛔ THE FAILED WRITE UNSAID ITSELF. After ' +
      'the in-flight /api/items read landed, the note slot holds ' +
      JSON.stringify(note) + ' and no longer carries ' +
      JSON.stringify(FAIL_LINE) + ' byte-exactly. One render later she is ' +
      'looking at exactly the deception 26.96-03 exists to prevent: the ' +
      'strongest privacy control in the room reporting a success it did not ' +
      'have.');
  }
  const nb = noteBoxOf(editor);
  if (!nb) {
    violations.push('[deferredNote] there is no note-slot container to count ' +
      'writes into');
    return;
  }
  if (nb.writes !== 1) {
    violations.push('[deferredNote] the note slot was written into ' +
      nb.writes + ' time(s), expected exactly 1 BY VALUE — the failure ' +
      'renderer must run once for one failed write, not once per repaint');
  }
});

// ---------------------------------------------------------------------------
// (deferredControl) THE ANTI-DEGENERATE CONTROL, GREEN BEFORE AND AFTER.
// A single held read that NOTHING has superseded still paints. Without this,
// "the sentence survived" is equally satisfied by a pane that simply stopped
// painting — which would be a worse lie than the one being fixed.
// ---------------------------------------------------------------------------
group('deferredControl (a held read that is still the newest claimant DOES ' +
  'paint when it lands)', function () {
  const t = heldItemsThen(R3, answering(R3));
  const s = rosterScope(t);
  s.api.pane();                       // one render, its read HELD
  const box = s.dom('manage-sec-roster');
  if (!assertHeld('deferredControl', t, 1)) { return; }
  if (box.writes !== 0) {
    violations.push('[deferredControl] the pane painted ' + box.writes +
      ' time(s) BEFORE its read landed, expected 0 BY VALUE — the read is ' +
      'not actually being held and this case is proving nothing');
    return;
  }
  t.held.settle({ ok: true, status: 200,
    data: { meta: { fenced_roster: R3 } } });
  if (box.writes !== 1) {
    violations.push('[deferredControl] ⛔ THE PANE NEVER PAINTED. After the ' +
      'held read settled with nothing newer having claimed the surface, the ' +
      'pane was written into ' + box.writes + ' time(s), expected exactly 1 ' +
      'BY VALUE. A paint claim that degenerated into "never paint" would ' +
      'satisfy every survival assertion in this wave and leave her looking ' +
      'at an empty pane — this is what refuses it.');
    return;
  }
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[deferredControl] the settled read painted no editor ' +
      'container');
    return;
  }
  nonEmptyNamed('deferredControl', editor.innerHTML, R3);
});

// ---------------------------------------------------------------------------
// (deferredField) HER TYPED FOLDER NAME SURVIVES THE SAME RACE.
//
// ⚠ THE FIELD IS RE-QUERIED AFTER THE SETTLE, AND THAT IS THE WHOLE CASE. The
// control double caches controls per repaint generation, so a reference taken
// BEFORE the repaint keeps answering "Diaries" from its own memory even when
// the pane has replaced the element it stood for. Reading the retained handle
// would be the instrument reporting a value that is no longer on screen —
// exactly the family of lie this wave exists to close in the product.
// ---------------------------------------------------------------------------
group('deferredField (her typed folder name survives an /api/items read that ' +
  'lands after a failed add)', function () {
  const t = heldItemsThen(R3, rejectingRoster(R3));
  const s = rosterScope(t);
  s.api.pane();
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[deferredField] the pane never created its editor');
    return;
  }
  if (!assertHeld('deferredField', t, 2)) { return; }
  const field = editor.querySelector('.vault-roster-add-input');
  const add = editor.querySelector('.vault-roster-add');
  if (!field || !add) {
    violations.push('[deferredField] the add field or the add control is ' +
      'missing from the rendered editor');
    return;
  }
  field.value = 'Diaries';
  add.fire();

  const mid = editor.querySelector('.vault-roster-add-input');
  if (!mid || mid.value !== 'Diaries') {
    violations.push('[deferredField] the failed add emptied her typed name ' +
      'BEFORE the held read even landed — 26.96-03\'s own guarantee, and ' +
      'nothing below this line is about the race any more');
    return;
  }

  t.held.settle({ ok: true, status: 200,
    data: { meta: { fenced_roster: R3 } } });

  const after = editor.querySelector('.vault-roster-add-input');
  if (!after) {
    violations.push('[deferredField] the add field is GONE from the pane ' +
      'after the in-flight read landed — she cannot even retype it');
    return;
  }
  if (after.value !== 'Diaries') {
    violations.push('[deferredField] ⛔ HER TYPED FOLDER NAME WAS ERASED BY A ' +
      'LATE READ. After the in-flight /api/items landed the add field holds ' +
      JSON.stringify(after.value) + ', expected "Diaries" BY VALUE. The field ' +
      'emptying itself is the room telling her the folder is now private, on ' +
      'a write the route never accepted.');
  }
});

// ---------------------------------------------------------------------------
// (staleWrite / staleWriteControl) TWO ROSTER WRITES IN FLIGHT ARE SEQUENCED
// BY THE ORDER THEY WERE ISSUED — WR-04.
//
// Each held answer carries the roster THAT write would really have produced,
// so the older answer is a genuinely stale roster and not a synthetic one:
//   write 1 (older): remove 'personnel notes'  → ['Journal', 'appraisal record']
//   write 2 (newer): remove 'appraisal record' → ['Journal']
// Settled in REVERSE, an unsequenced client repaints the OLDER roster last and
// puts 'appraisal record' back onto her fence — the display lying in the
// unsafe direction.
// ---------------------------------------------------------------------------
const R_AFTER_W1 = ['Journal', 'appraisal record'];
const R_AFTER_W2 = ['Journal'];

// Answers /api/items synchronously (the pane must be painted and interactive)
// and HOLDS every roster write, handing each one back to the case.
function heldRosterWrites(fencedBefore) {
  const held = [];
  const t = function (url, body) {
    if (url === '/api/items') { return metaAnswer(fencedBefore); }
    const h = heldThenable();
    held.push({ h: h, body: body });
    return h;
  };
  t.held = held;
  return t;
}

function rosterAnswer(roster) {
  return { ok: true, status: 200, data: { fenced_roster: roster } };
}

function driveTwoRemoves(where) {
  const t = heldRosterWrites(R3);
  const s = rosterScope(t);
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[' + where + '] the pane never created its editor');
    return null;
  }
  nonEmptyNamed(where, editor.innerHTML, R3);
  if (!fireRemove(editor, 'personnel notes', where)) { return null; }
  if (!fireRemove(editor, 'appraisal record', where)) { return null; }
  if (t.held.length !== 2) {
    violations.push('[' + where + '] ' + t.held.length + ' roster write(s) ' +
      'reached the transport, expected exactly 2 BY VALUE — there is no ' +
      'concurrency here to sequence and nothing below is evidence');
    return null;
  }
  if (t.held[0].body.folder !== 'personnel notes' ||
      t.held[1].body.folder !== 'appraisal record') {
    violations.push('[' + where + '] the two writes did not carry the ' +
      'folders this case issued: ' + JSON.stringify(t.held.map(function (x) {
        return x.body;
      })));
    return null;
  }
  if (t.held[0].h.pending !== true || t.held[1].h.pending !== true) {
    violations.push('[' + where + '] both writes are meant to be IN FLIGHT ' +
      'at this point and at least one has already settled — the interleaving ' +
      'this case describes did not happen');
    return null;
  }
  return { s: s, box: box, editor: editor, t: t };
}

// ⚠ THE ABSENCE IS ASSERTED ALONGSIDE A PRESENCE AND A NON-EMPTINESS. A
// renderer that produced nothing at all would satisfy "the folder is absent",
// which is the degenerate pass this file's own nonEmptyNamed idiom refuses.
function assertNewerRosterPainted(where, editor) {
  const markup = editor.innerHTML;
  nonEmptyNamed(where, markup, R_AFTER_W2);
  ['appraisal record', 'personnel notes'].forEach(function (gone) {
    if (markup.indexOf(gone) !== -1) {
      violations.push('[' + where + '] ⛔ A STALE ROSTER PUT ' +
        JSON.stringify(gone) + ' BACK ONTO HER FENCE. After both writes ' +
        'settled, the pane still carries that folder BY VALUE — so an older ' +
        'answer arriving last repainted a roster the room had already moved ' +
        'past, and the display is lying in the unsafe direction: ' +
        JSON.stringify(markup.slice(0, 200)));
    }
  });
}

group('staleWrite (two roster writes settled in REVERSE order paint the ' +
  'NEWER roster)', function () {
  const d = driveTwoRemoves('staleWrite');
  if (!d) { return; }
  d.t.held[1].h.settle(rosterAnswer(R_AFTER_W2));   // the NEWER answer, first
  d.t.held[0].h.settle(rosterAnswer(R_AFTER_W1));   // the OLDER answer, last
  assertNewerRosterPainted('staleWrite', d.editor);
});

group('staleWriteControl (the same two writes settled in ISSUE order paint ' +
  'the same newer roster)', function () {
  const d = driveTwoRemoves('staleWriteControl');
  if (!d) { return; }
  d.t.held[0].h.settle(rosterAnswer(R_AFTER_W1));
  d.t.held[1].h.settle(rosterAnswer(R_AFTER_W2));
  assertNewerRosterPainted('staleWriteControl', d.editor);
});

// ===========================================================================
// 26.96-07 STEP THREE — THE THREE CASES THE RE-PLANT DRILL PROVED WERE OWED.
//
// ⛔⛔ THESE ARE NOT BELT-AND-BRACES. All five token sites were proven
// semantically LIVE by a canary throw (29 / 7 / 16 / 7 / 16 groups reached
// them), and then re-planted one at a time. THREE SURVIVED THE WHOLE GREEN
// SUITE — rosterWriteFailed's claim, renderRosterHosts' claim, and
// editVaultRoster's failure-side guard. A site being REACHED and a mutation at
// that site being CAUGHT are different facts, and this phase has now met the
// gap between them twice (26.96-02's R4, and these three). The plan's own rule
// applies: a re-plant no case names is a REAL FINDING, and a permanent case is
// owed for it HERE rather than a note carried forward.
// ===========================================================================

// ---------------------------------------------------------------------------
// (noteHeldNewer) THE CLAIM rosterWriteFailed TAKES — re-plant B.
//
// The other real order, and arguably the commoner one: renderManageHome's read
// lands fast and PAINTS, then tapping this pane's rail entry issues a second
// read of the WHOLE LIBRARY which is still in the air while she is looking at
// a live, interactive pane. Here the held read is the NEWEST claim, so nothing
// but rosterWriteFailed's own claim can take the surface away from it.
// ---------------------------------------------------------------------------
group('noteHeldNewer (a failed write\'s sentence survives the read that was ' +
  'issued LAST)', function () {
  const t = heldItemsThen(R3, refusingRoster(R3), 2);
  const s = rosterScope(t);
  s.api.pane();                       // renderManageHome — lands, PAINTS
  s.api.pane();                       // showManagePane  — HELD, and NEWEST
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[noteHeldNewer] the pane never created its editor');
    return;
  }
  if (!assertHeld('noteHeldNewer', t, 2)) { return; }
  nonEmptyNamed('noteHeldNewer', editor.innerHTML, R3);
  if (!fireRemove(editor, 'personnel notes', 'noteHeldNewer')) { return; }
  assertSaidSo('noteHeldNewer/beforeSettle', editor);

  t.held.settle({ ok: true, status: 200,
    data: { meta: { fenced_roster: R3 } } });

  const note = noteOf(editor);
  if (FAIL_LINE === null || note === null || note.indexOf(FAIL_LINE) === -1) {
    violations.push('[noteHeldNewer] ⛔ THE FAILED WRITE UNSAID ITSELF, on the ' +
      'read that was issued LAST. The note slot holds ' + JSON.stringify(note) +
      ' and no longer carries ' + JSON.stringify(FAIL_LINE) + ' byte-exactly. ' +
      'Writing the sentence must CLAIM the surface, or the newest read in the ' +
      'air still owns it and erases her the moment it lands.');
  }
  const nb = noteBoxOf(editor);
  if (nb && nb.writes !== 1) {
    violations.push('[noteHeldNewer] the note slot was written into ' +
      nb.writes + ' time(s), expected exactly 1 BY VALUE');
  }
});

// ---------------------------------------------------------------------------
// (failedClaimDirect) THE CLAIM rosterWriteFailed TAKES — re-plant B, and the
// second measurement that had to be made honestly.
//
// ⚠⚠ `noteHeldNewer` above does NOT catch this re-plant, and saying so is the
// point. Both of rosterWriteFailed's callers are inside editVaultRoster, which
// claims at ISSUE time — so through that one door the claim is already covered
// and the mutant survives the whole suite. Measured, not assumed: the canary
// proved seven groups REACH the site, and the re-plant still came back green.
// Reached and caught are different facts.
//
// The claim is still required — the verification names it, and rosterWriteFailed
// is a NAMED surface a second caller will one day use. So this case walks
// through that other door: it calls rosterWriteFailed DIRECTLY, with a read in
// the air that is the newest claimant.
// ---------------------------------------------------------------------------
group('failedClaimDirect (writing the failure line invalidates a read already ' +
  'in the air, whoever wrote it)', function () {
  const t = heldItemsThen(R3, answering(R3), 2);
  const s = rosterScope(t);
  s.api.pane();                       // lands, PAINTS (claim 1)
  s.api.pane();                       // HELD, and NEWEST (claim 2)
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[failedClaimDirect] the pane never created its editor');
    return;
  }
  if (!assertHeld('failedClaimDirect', t, 2)) { return; }
  nonEmptyNamed('failedClaimDirect', editor.innerHTML, R3);

  // ⛔ CALLED DIRECTLY — no editVaultRoster claim in front of it.
  s.api.failed();
  assertSaidSo('failedClaimDirect/beforeSettle', editor);

  t.held.settle({ ok: true, status: 200,
    data: { meta: { fenced_roster: R3 } } });

  const note = noteOf(editor);
  if (FAIL_LINE === null || note === null || note.indexOf(FAIL_LINE) === -1) {
    violations.push('[failedClaimDirect] ⛔ THE FAILURE LINE WAS ERASED BY A ' +
      'READ ALREADY IN THE AIR. The note slot holds ' + JSON.stringify(note) +
      ' and no longer carries ' + JSON.stringify(FAIL_LINE) + ' byte-exactly. ' +
      'Writing the sentence must CLAIM the surface itself — a caller must not ' +
      'have to remember to claim on its behalf.');
  }
  const nb = noteBoxOf(editor);
  if (nb && nb.writes !== 1) {
    violations.push('[failedClaimDirect] the note slot was written into ' +
      nb.writes + ' time(s), expected exactly 1 BY VALUE');
  }
});

// ---------------------------------------------------------------------------
// (hostsClaimDirect) THE CLAIM renderRosterHosts TAKES — re-plant C.
//
// ⚠ renderRosterHosts has exactly ONE caller today (editVaultRoster, which
// claims at issue time), so its own claim is invisible through that door — the
// re-plant survived the entire suite. This case walks through the OTHER door:
// it calls renderRosterHosts DIRECTLY, which is precisely what a second call
// site added later would do, and the whole reason the claim is required rather
// than left to the caller to remember.
// ---------------------------------------------------------------------------
group('hostsClaimDirect (a repaint through renderRosterHosts invalidates a ' +
  'read already in the air)', function () {
  const t = heldItemsThen(R3, answering(R3), 2);
  const s = rosterScope(t);
  s.api.pane();                       // lands, PAINTS (claim 1)
  s.api.pane();                       // HELD, and NEWEST (claim 2)
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[hostsClaimDirect] the pane never created its editor');
    return;
  }
  if (!assertHeld('hostsClaimDirect', t, 2)) { return; }
  nonEmptyNamed('hostsClaimDirect', editor.innerHTML, R3);

  // ⛔ CALLED DIRECTLY — no editVaultRoster claim in front of it.
  s.api.hosts(R_AFTER_W2);
  nonEmptyNamed('hostsClaimDirect/repaint', editor.innerHTML, R_AFTER_W2);

  t.held.settle({ ok: true, status: 200,
    data: { meta: { fenced_roster: R3 } } });

  const markup = editor.innerHTML;
  nonEmptyNamed('hostsClaimDirect/after', markup, R_AFTER_W2);
  ['personnel notes', 'appraisal record'].forEach(function (gone) {
    if (markup.indexOf(gone) !== -1) {
      violations.push('[hostsClaimDirect] ⛔ A READ ALREADY IN THE AIR ERASED ' +
        'A REPAINT. After renderRosterHosts painted the new roster, the ' +
        'in-flight /api/items landed and put ' + JSON.stringify(gone) +
        ' back on screen BY VALUE. A repaint IS owning the surface, and a ' +
        'caller must not have to remember to say so on its behalf: ' +
        JSON.stringify(markup.slice(0, 200)));
    }
  });
});

// ---------------------------------------------------------------------------
// (staleFailure) THE FAILURE-SIDE GUARD IN editVaultRoster — re-plant D1.
//
// An OLDER write that FAILS, landing after a NEWER write already succeeded and
// repainted. Its sentence would sit under the newer act's result and be read as
// being about it — "couldn't save — try again." against a change she just
// watched land.
//
// ⛔⛔ COUNTED, NEVER CHECKED FOR EMPTINESS. A repaint RESETS the note slot
// without incrementing its counter, so an implementation that wrote the stale
// sentence and was then repainted over would leave the slot EMPTY and satisfy
// any "no failure line is showing" check. This is the phase's own law (2).
// ---------------------------------------------------------------------------
group('staleFailure (an OLDER write that FAILS does not speak over a NEWER ' +
  'write that succeeded)', function () {
  const t = heldRosterWrites(R3);
  const s = rosterScope(t);
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[staleFailure] the pane never created its editor');
    return;
  }
  nonEmptyNamed('staleFailure', editor.innerHTML, R3);
  // Materialise the counter BEFORE anything can write into it.
  if (noteOf(editor) === null) {
    violations.push('[staleFailure] the editor declared no note slot, so ' +
      'there is nothing to count and nothing below is evidence');
    return;
  }
  if (!fireRemove(editor, 'personnel notes', 'staleFailure')) { return; }
  if (!fireRemove(editor, 'appraisal record', 'staleFailure')) { return; }
  if (t.held.length !== 2) {
    violations.push('[staleFailure] ' + t.held.length + ' write(s) reached ' +
      'the transport, expected exactly 2 BY VALUE');
    return;
  }
  // The NEWER write succeeds and repaints…
  t.held[1].h.settle(rosterAnswer(R_AFTER_W2));
  // …and only THEN does the older write's refusal arrive.
  t.held[0].h.settle({ ok: false, status: 400,
    data: { error: 'the write was refused' } });

  const nb = noteBoxOf(editor);
  if (!nb) {
    violations.push('[staleFailure] the note-slot container vanished');
    return;
  }
  if (nb.writes !== 0) {
    violations.push('[staleFailure] ⛔ AN OLDER FAILED WRITE SPOKE OVER A ' +
      'NEWER ONE THAT SUCCEEDED. The note slot was written into ' + nb.writes +
      ' time(s) after a newer write had already landed and repainted; ' +
      'expected 0 BY VALUE. She would read "couldn\'t save — try again." as ' +
      'being about the change she just watched happen. ⚠ Counted, never ' +
      'checked for emptiness — a repaint RESETS the slot without writing to ' +
      'it, so emptiness cannot see this.');
  }
  nonEmptyNamed('staleFailure/after', editor.innerHTML, R_AFTER_W2);
});

// ---------------------------------------------------------------------------
// (paintNotNever) THE PERMANENT ANTI-DEGENERATE CASE.
//
// Every survival assertion in this wave is satisfied by a pane that simply
// stopped painting — which would be a worse lie than the one being fixed, and
// would ship a person a blank privacy list. A plain render through the shipped
// SYNCHRONOUS transport paints exactly ONCE, by value, and carries her roster.
// ---------------------------------------------------------------------------
group('paintNotNever (a plain pane render paints exactly once and carries the ' +
  'roster by value)', function () {
  const d = drivePane(R3);
  if (!d.editor) {
    violations.push('[paintNotNever] ⛔ THE PANE NEVER CREATED ITS EDITOR. A ' +
      'paint claim that degenerated into "never paint" satisfies every ' +
      'survival assertion in this wave — this is what refuses it.');
    return;
  }
  if (d.box.writes !== 1) {
    violations.push('[paintNotNever] the pane was painted ' + d.box.writes +
      ' time(s) for one ordinary render, expected exactly 1 BY VALUE');
  }
  nonEmptyNamed('paintNotNever', d.editor.innerHTML, R3);
});

// ===========================================================================
// 26.96-10 WAVE 10 — WHAT THE PANE MAY SAY WHEN IT HAS NOT READ HER LIST.
//
// THE FINDING (G-26.96-4). `renderRosterSection`'s `paint()` is ALSO its
// `.catch` handler, so it cannot tell "never read" from "read failed". On the
// FIRST render after a failed `GET /api/items` there is no cache, and paint
// falls back to `VAULT_DEFAULT_ROSTER` — four specific folder names rendered
// under her own sentence "These folders stay private. The librarian never
// reads them…", with nothing anywhere saying the read failed. If she has
// CLEARED her roster, the pane is stating a protection she does not have.
//
// ⚠⚠ THE OBVIOUS FIX IS THE WRONG ONE, AND `absentKeyStillDefaults` BELOW IS
// THE CONTROL THAT REFUSES IT. Gating on `Array.isArray(meta.fenced_roster)`
// would ALSO hide the fence for a store whose key is simply ABSENT — and such
// a store still has the DEFAULT FENCE IN FORCE, because the server
// materialises it. That would state a WEAKER protection than she has: the
// same defect pointing the other way. THE DISCRIMINATOR IS WHETHER THE READ
// SUCCEEDED.
//
// ⛔ MEASURED BEFORE ANY CASE HERE WAS WRITTEN, by driving the REAL route
// against a synthetic store in a temp directory (recorded verbatim in
// 26.96-10-SUMMARY.md):
//     GET /api/items for a store whose meta has NO fenced_roster key
//       → 'fenced_roster' in response meta: False        (the key is ABSENT)
//     study_lib._active_roster(that same store)
//       → ['Journal', 'personnel notes', 'billing & insurance notes',
//          'appraisal record']                           (the fence IS in force)
// `handle_items` answers `store_or_fresh()` — the raw store, with no
// materialisation — while `_active_roster` distinguishes ABSENT (→ the shipped
// default) from EMPTY (→ [], a deliberate clear). Both halves of that
// measurement are load-bearing: the first is why the key can be missing from a
// successful answer, the second is why hiding the fence for it would be a lie.
// ===========================================================================

// The four names as the PRODUCT declares them — EVALUATED from the array
// already lifted out of app.js's own bytes, never re-typed here. A re-typed
// copy would go on agreeing with itself after VAULT_DEFAULT_ROSTER moved.
const DEFAULT_NAMES = new Function('return ' + DEFAULT_ROSTER_SRC + ';')();

// ⚠ AND THEIR RENDERED SPELLING, through the product's own escaper. One of the
// four is 'billing & insurance notes', which reaches the markup as
// 'billing &amp; insurance notes' — so an absence check against the RAW name
// would pass trivially, on broken code, for that name. That is a pass over
// nothing, and it is the exact shape of defect this phase keeps finding.
//
// ⭐ THE TWO HALVES CHECK EACH OTHER. `readFailed` asserts these spellings are
// ABSENT; `absentKeyStillDefaults` asserts the SAME spellings are PRESENT on a
// successful read. If the spelling were wrong, the presence half would be red
// on correct, shipped code — so neither half can be silently vacuous.
const ESCAPE_ONLY = new Function(ESCAPERS + 'return { esc: escapeHtml };')();
const DEFAULT_SHOWN = DEFAULT_NAMES.map(function (n) {
  return ESCAPE_ONLY.esc(n);
});

// `/api/items` REJECTS: the room is not answering, the connection dropped, or
// the answer was unreadable. ⛔ The REJECTING stub, so `.then` is genuinely
// skipped — the pass-through thenable cannot express a failed read at all.
function rejectingItems() {
  return function (url) {
    if (url === '/api/items') {
      return rejectingP(new TypeError('Failed to fetch'));
    }
    return shippedThenable({ ok: true, status: 200, data: {} });
  };
}

// `/api/items` SUCCEEDS, answering the meta object VERBATIM — including a meta
// with no fenced_roster key at all, which is what the real route measurably
// returns for a store that has never had one written.
function okItems(meta) {
  return function (url) {
    if (url === '/api/items') {
      return shippedThenable({ ok: true, status: 200, data: { meta: meta } });
    }
    return shippedThenable({ ok: true, status: 200, data: {} });
  };
}

// Like drivePane, but able to seed MANAGE.meta BEFORE the render — which is
// the whole difference between "read failed with nothing cached" and "read
// failed with a real last read behind it".
function drivePaneWithMeta(meta, transport) {
  const s = rosterScope(transport);
  if (meta) { s.api.MANAGE.meta = meta; }
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  return { s: s, box: box, editor: box.kids['vault-roster-editor'] || null };
}

// The roster editor container's WRITE COUNT. ⛔ COUNTED, NEVER CHECKED FOR
// EMPTINESS: a parent's repaint RESETS a child rather than writing to it, so
// an "empty" slot reads exactly like a slot that was filled and painted over.
// This phase's ROADMAP records the incident that produced this counter.
function editorWrites(box) {
  const ed = box && box.kids ? box.kids['vault-roster-editor'] : null;
  return ed ? ed.writes : 0;
}

group('readFailed (with no read and no cache the pane states NOTHING about ' +
  'her fence)', function () {
  const d = drivePaneWithMeta(null, rejectingItems());
  const full = rendered(d.box);

  // (1) ⚠ THE ANTI-DEGENERATE HALF, FIRST. "The defaults are absent" is
  //     satisfied perfectly by a renderer that produced nothing at all, and a
  //     blank privacy pane is a worse answer than a wrong one. The pane must
  //     still render its own NAME — read from the registry through
  //     managePaneLabel, which is not a claim about anything.
  if (d.box.writes < 1) {
    violations.push('[readFailed] ⛔ THE PANE RENDERED NOTHING AT ALL. Every ' +
      'absence assertion below is satisfied by a renderer that stopped ' +
      'painting — this is what refuses that degenerate fix. The subtraction ' +
      'owed here is the invented FENCE, never the pane.');
    return;
  }
  if (full.indexOf(C1) === -1) {
    violations.push('[readFailed] the pane heading is absent by value. The ' +
      'heading is the pane\'s NAME, read from the registry — it states ' +
      'nothing about her fence and it must survive a failed read.');
  }

  // (2) NOT ONE INVENTED NAME. Asserted in the RENDERED spelling, so the
  //     ampersand name is really checked and not trivially absent.
  DEFAULT_SHOWN.forEach(function (n, i) {
    if (full.indexOf(n) !== -1) {
      violations.push('[readFailed] ⛔ THE PANE INVENTED A FENCE. The read ' +
        'FAILED and nothing is cached, yet the rendered pane carries the ' +
        'default folder name ' + JSON.stringify(DEFAULT_NAMES[i]) + ' BY ' +
        'VALUE. ⚠⚠ READ THE HARM AND NOT THE DIFF: if she has CLEARED her ' +
        'roster, this pane is naming four folders as private that the room ' +
        'is not keeping private — a stated protection she does not have, on ' +
        'the strongest privacy control in the room. Rendered: ' +
        JSON.stringify(full.slice(0, 200)));
    }
  });

  // (3) AND NOT HER FRAMING SENTENCE EITHER. C2 is a claim ABOUT A LIST. With
  //     no list read, the claim is unsupported — the four names removed but
  //     her sentence left standing would still be the pane asserting a fence.
  if (full.indexOf(C2) !== -1) {
    violations.push('[readFailed] ⛔ THE FRAMING SENTENCE IS STILL THERE. ' +
      '"These folders stay private…" is a claim about a list the pane has ' +
      'not read. Removing the four names while leaving her sentence would ' +
      'leave the pane still asserting a fence, over nothing.');
  }

  // (4) HER EMPTY SEAT, ASSERTED AS BEHAVIOUR RATHER THAN AS A VALUE.
  //     ⛔ An EMPTY ROSTER_UNREAD_LINE must emit NO ELEMENT — no empty
  //     paragraph, no placeholder — and a non-empty one must actually reach
  //     the markup. Written this way so it keeps its meaning on the day she
  //     fills it, and so it never becomes a gate that pins her sentence
  //     against the constant the renderer reads.
  if (UNREAD_LINE === '') {
    if (full.indexOf('<p') !== -1) {
      violations.push('[readFailed] ROSTER_UNREAD_LINE is empty, yet the ' +
        'read-failed pane emitted a paragraph element. An empty seat must ' +
        'emit NOTHING — an empty paragraph is a shape she never asked for, ' +
        'holding a sentence nobody has written. Rendered: ' +
        JSON.stringify(full.slice(0, 200)));
    }
  } else if (full.indexOf(ESCAPE_ONLY.esc(UNREAD_LINE)) === -1) {
    violations.push('[readFailed] ROSTER_UNREAD_LINE holds a sentence but it ' +
      'is absent from the rendered read-failed pane — the one seat her ' +
      'wording lands in is not being read.');
  }

  // (5) ⛔ COUNTED, NOT CHECKED FOR EMPTINESS.
  const w = editorWrites(d.box);
  if (w !== 0) {
    violations.push('[readFailed] the roster editor container was written ' +
      'into ' + w + ' time(s) with no read and no cache, expected 0 BY ' +
      'VALUE. ⚠ A count, because a parent repaint RESETS a child without ' +
      'incrementing it — a list that was rendered and then painted over ' +
      'looks exactly like a list that was never rendered.');
  }
});

group('readFailedCached (a failed read with a REAL last read behind it still ' +
  'shows that last read — the shipped intent, preserved)', function () {
  const d = drivePaneWithMeta({ fenced_roster: R3 }, rejectingItems());
  if (!d.editor) {
    violations.push('[readFailedCached] ⛔ THE PANE DROPPED A CACHED VIEW. ' +
      'There IS a last read here, so the shipped behaviour — keep showing ' +
      'it — is correct and is NOT this plan\'s to remove. The subtraction is ' +
      'scoped to the case where there is no last read at all.');
    return;
  }
  if (d.editor.writes !== 1) {
    violations.push('[readFailedCached] the roster editor was written into ' +
      d.editor.writes + ' time(s), expected exactly 1 BY VALUE');
  }
  nonEmptyNamed('readFailedCached', d.editor.innerHTML, R3);
  if (rendered(d.box).indexOf(C2) === -1) {
    violations.push('[readFailedCached] her framing line is absent. A list ' +
      'IS on screen here, so the sentence that says what the list means ' +
      'belongs with it.');
  }
});

group('absentKeyStillDefaults (⛔ THE CONTROL THAT REFUSES THE WRONG FIX — a ' +
  'store whose fenced_roster key was never written still shows the fence)',
function () {
  // MEASURED: the real route answers this meta with NO fenced_roster key, and
  // _active_roster puts the four defaults in force for that same store.
  const d = drivePaneWithMeta(null, okItems({}));
  if (!d.editor) {
    violations.push('[absentKeyStillDefaults] ⛔ THE FENCE WAS HIDDEN FOR A ' +
      'STORE THAT HAS ONE. The read SUCCEEDED; the key is merely absent, ' +
      'which the server treats as "behaves like fresh" and answers with the ' +
      'four defaults. Gating on Array.isArray(meta.fenced_roster) instead of ' +
      'on the READ\'S OUTCOME produces exactly this — a WEAKER protection ' +
      'stated than she has, which is G-26.96-4 pointing the other way.');
    return;
  }
  const full = rendered(d.box);
  DEFAULT_SHOWN.forEach(function (n, i) {
    if (full.indexOf(n) === -1) {
      violations.push('[absentKeyStillDefaults] the default folder name ' +
        JSON.stringify(DEFAULT_NAMES[i]) + ' is absent from the rendered ' +
        'pane. The read succeeded and this fence IS in force server-side — ' +
        'the pane must keep saying so. Rendered: ' +
        JSON.stringify(full.slice(0, 200)));
    }
  });
  if (full.indexOf(C2) === -1) {
    violations.push('[absentKeyStillDefaults] her framing line is absent ' +
      'from a pane that did read her store');
  }
});

group('readOkEmptyIsEmpty (a roster she CLEARED reads as cleared, never as ' +
  'the defaults)', function () {
  const d = drivePaneWithMeta(null, okItems({ fenced_roster: [] }));
  if (!d.editor) {
    violations.push('[readOkEmptyIsEmpty] the pane never created its editor ' +
      'for a successful read of a deliberately cleared roster');
    return;
  }
  const full = rendered(d.box);
  if (full.indexOf(R_EMPTY) === -1) {
    violations.push('[readOkEmptyIsEmpty] the shipped empty-state line is ' +
      'absent by value from a pane whose store answered an explicit empty ' +
      'roster');
  }
  DEFAULT_SHOWN.forEach(function (n, i) {
    if (full.indexOf(n) !== -1) {
      violations.push('[readOkEmptyIsEmpty] ⛔ A CLEARED ROSTER RENDERED AS ' +
        'THE DEFAULTS. ' + JSON.stringify(DEFAULT_NAMES[i]) + ' appears by ' +
        'value. The server distinguishes ABSENT from EMPTY precisely so that ' +
        'a person who cleared her roster is told she cleared it.');
    }
  });
});

// ===========================================================================
// 26.96-15 WAVE 15 — THE G-26.96-4 RESIDUAL: A READ THAT RESOLVED AND DID NOT
// SUCCEED.
//
// THE FINDING. 26.96-10 closed the LOST-CONNECTION door and closed it
// properly. It did not close the other one. `renderRosterSection`'s fulfilment
// handler calls the painter with a literal meaning *the promise resolved* —
// and the shipped `apiGet` RESOLVES for any HTTP status whose body parses as
// JSON. The server answers a JSON error on a corrupt store and a JSON refusal
// on a host-check failure. Both resolve. Neither is a read that succeeded.
//
// ⛔ MEASURED AGAINST THE UNFIXED PANE BEFORE ONE LINE OF THESE CASES WAS
// WRITTEN, by driving all three shapes through this file's own pane driver in
// a scratch copy (recorded verbatim in 26.96-15-SUMMARY.md). Every one of the
// three rendered ALL FOUR default folder names, in their rendered spelling,
// under her framing sentence saying the librarian never reads them — with her
// B1 read-failed line ABSENT and the editor container written into once:
//     HTTP 500 (corrupt store) → 4 of 4 names · C2 present · B1 absent
//     HTTP 403 (host refused)  → 4 of 4 names · C2 present · B1 absent
//     ok:true carrying no data → 4 of 4 names · C2 present · B1 absent
//
// ⚠⚠ THE HARM IS THE ONE THE TRUTH EXISTS TO PREVENT. On a corrupted store —
// precisely the state in which the room CANNOT know her list — a roster she
// has cleared or edited is replaced on screen by four folder names the room is
// not keeping private.
//
// ⛔ THE THIRD ARM IS THE EASY ONE TO MISS, and it is why the discriminator
// cannot be the ok flag alone: an answer that IS ok but carries no data at all
// also rendered the defaults. The value handed to the painter must be falsy
// for that shape too.
//
// ⛔ AND THE FIX MAY NOT BE BUILT BY REQUIRING A META OBJECT. A successful read
// of a store that has no meta at all is still a read that SUCCEEDED, and the
// server materialises the default fence for exactly that store.
// `absentKeyStillDefaults` above is the permanent control that refuses it, and
// `readFailedCached` is the permanent control that refuses a fix which drops a
// cached view. ⛔ BOTH MUST BE GREEN IN THE SAME RUN AS ALL THREE CASES BELOW;
// a run in which either is absent is not evidence.
// ===========================================================================

// `/api/items` RESOLVES carrying a NOT-OK status — the corrupt store and the
// refused host. ⛔ Deliberately the SHIPPED pass-through thenable and NOT the
// rejecting stub: the whole point of these arms is that the promise really
// does settle successfully, so `.then`'s handler really does run. Driving them
// through `rejectingItems` would re-drive `readFailed` under a new name and
// prove nothing new.
function notOkItems(status) {
  return function (url) {
    if (url === '/api/items') {
      return shippedThenable({ ok: false, status: status,
        data: { error: 'store unreadable' } });
    }
    return shippedThenable({ ok: true, status: 200, data: {} });
  };
}

// `/api/items` RESOLVES, ok, and carries NO DATA AT ALL. Measured to render the
// defaults exactly like the two not-ok shapes.
function okNoDataItems() {
  return function (url) {
    if (url === '/api/items') {
      return shippedThenable({ ok: true, status: 200, data: null });
    }
    return shippedThenable({ ok: true, status: 200, data: {} });
  };
}

// The five assertions each of the three arms owes, written once and driven
// three times through three DIFFERENT transports — so no arm is another arm's.
// ⛔ Deliberately NOT shared with `readFailed`: that case is 26.96-10's, its
// wording is about the rejection door, and re-cutting it to fit three new arms
// would edit a committed proof to accommodate this plan.
function blindPaneAssertions(where, d, why) {
  const full = rendered(d.box);

  // (1) ⚠ THE ANTI-DEGENERATE HALF, FIRST. Every absence below is satisfied
  //     perfectly by a renderer that produced nothing at all, and a blank
  //     privacy pane is a worse answer than a wrong one. The heading is the
  //     pane's NAME, read from the registry — it claims nothing about her
  //     fence and it must survive a failed read.
  if (d.box.writes < 1) {
    violations.push('[' + where + '] ⛔ THE PANE RENDERED NOTHING AT ALL. ' +
      'Every absence assertion below is satisfied by a renderer that stopped ' +
      'painting — this is what refuses that degenerate fix. What is owed here ' +
      'is the subtraction of the invented FENCE, never of the pane.');
    return;
  }
  if (full.indexOf(C1) === -1) {
    violations.push('[' + where + '] the pane heading is absent by value. ' +
      'The heading states nothing about her fence and must survive ' + why +
      '.');
  }

  // (2) NOT ONE INVENTED NAME — in the RENDERED spelling, so the ampersand
  //     name ('billing & insurance notes' → 'billing &amp; insurance notes')
  //     is really checked rather than trivially absent.
  DEFAULT_SHOWN.forEach(function (n, i) {
    if (full.indexOf(n) !== -1) {
      violations.push('[' + where + '] ⛔ THE PANE INVENTED A FENCE. ' + why +
        ', nothing is cached, yet the rendered pane carries the default ' +
        'folder name ' + JSON.stringify(DEFAULT_NAMES[i]) + ' BY VALUE. ' +
        '⚠⚠ READ THE HARM AND NOT THE DIFF: the promise RESOLVED, so a ' +
        'handler keyed on settlement paints this as a success — and on a ' +
        'corrupted store, the very state in which the room cannot know her ' +
        'list, a roster she CLEARED is replaced on screen by four folders ' +
        'the room is not keeping private. Rendered: ' +
        JSON.stringify(full.slice(0, 200)));
    }
  });

  // (3) AND NOT HER FRAMING SENTENCE EITHER. C2 is a claim ABOUT A LIST; with
  //     no list read the claim is unsupported, and the four names removed
  //     while her sentence stood would still be the pane asserting a fence.
  if (full.indexOf(C2) !== -1) {
    violations.push('[' + where + '] ⛔ THE FRAMING SENTENCE IS STILL THERE. ' +
      '"These folders stay private…" is a claim about a list the pane has ' +
      'not read.');
  }

  // (4) HER B1 SEAT, ASSERTED AS BEHAVIOUR RATHER THAN AS A VALUE — the same
  //     shape `readFailed` uses, so it keeps its meaning on the day the seat
  //     is refilled and never becomes a gate pinning her wording against the
  //     constant the renderer reads.
  if (UNREAD_LINE === '') {
    if (full.indexOf('<p') !== -1) {
      violations.push('[' + where + '] ROSTER_UNREAD_LINE is empty, yet this ' +
        'pane emitted a paragraph element. An empty seat must emit NOTHING.');
    }
  } else if (full.indexOf(ESCAPE_ONLY.esc(UNREAD_LINE)) === -1) {
    violations.push('[' + where + '] ROSTER_UNREAD_LINE holds a sentence but ' +
      'it is absent from this rendered pane — the read failed and the one ' +
      'seat her wording lands in is not being read.');
  }

  // (5) ⛔ COUNTED, NOT CHECKED FOR EMPTINESS. A parent repaint RESETS a child
  //     without incrementing it, so a list that was rendered and then painted
  //     over looks exactly like a list that was never rendered.
  const w = editorWrites(d.box);
  if (w !== 0) {
    violations.push('[' + where + '] the roster editor container was written ' +
      'into ' + w + ' time(s) when ' + why + ' with nothing cached, expected ' +
      '0 BY VALUE.');
  }
}

group('readNotOk (a read that RESOLVED carrying a server error is a FAILED ' +
  'read, and the pane invents no fence)', function () {
  blindPaneAssertions('readNotOk', drivePaneWithMeta(null, notOkItems(500)),
    'the store answered a server error');
});

group('readForbidden (the same for a REFUSAL, driven separately so neither ' +
  'arm is the other\'s)', function () {
  blindPaneAssertions('readForbidden',
    drivePaneWithMeta(null, notOkItems(403)),
    'the host refused the read');
});

group('readOkNoData (an ok answer carrying NO DATA AT ALL is still not a read ' +
  'of her list)', function () {
  blindPaneAssertions('readOkNoData',
    drivePaneWithMeta(null, okNoDataItems()),
    'the answer was ok but carried no data');
});

// ===========================================================================
// 26.96-10 — WR-05: ONE SOURCE FOR HER FRAMING SENTENCE, AND IN-02: THE DEAD
// CROSS-HOST WRITE.
//
// WR-05's finding. The sentence was typed TWICE — once in the Manage pane and
// once on the import screen, the second with its own trailing clause welded
// on — and the second copy was pinned by NOTHING. Two literals that agree
// today are how already-approved copy rots, one surface at a time, and this
// phase's own copy record carries the incident: a candidate annotated "your
// existing wording" was in fact a REWORD, and she had to be asked twice.
//
// ⭐ THE BYTES THIS REUSE WAS COMPARED AGAINST, per 26.96-COPY.md's rule that
// any candidate claiming to reuse a shipped string must CITE them. Both sites
// were re-assembled from app.js's own bytes BEFORE either was replaced:
//   pane site   (app.js:6838)  146 bytes
//     "These folders stay private. The librarian never reads them, and
//      nothing from them appears in the room until you choose to release a
//      specific item."
//   import site (app.js:19665) 188 bytes — the SAME 146 bytes, then:
//     " You can change this list before we begin."
//   pane + clause === import site : true
//
// ⛔ THE GATES BELOW COMPARE AGAINST C2 AND C2_IMPORT — pins typed from the
// copy record — and NEVER against ROSTER_FRAMING. A gate reading the same
// constant the renderer reads would certify an agent's edit of her sentence
// as correct. That direction is the whole defence.
// ===========================================================================

// The import screen's WHOLE rendered line, pinned byte-exactly. ⚠ It was the
// literal "pinned by nothing" the review named: `grep -rn "before we begin"
// tests/` found nothing before this plan.
const C2_IMPORT = 'These folders stay private. The librarian never reads ' +
  'them, and nothing from them appears in the room until you choose to ' +
  'release a specific item. You can change this list before we begin.';
// The import screen's OWN clause — genuinely that one host's, because it is
// about beginning: true there, false in settings.
const IMPORT_TAIL = ' You can change this list before we begin.';

// The text inside the first paragraph of some rendered markup. ⛔ Used for
// EQUALITY, never containment: a clause welded onto either end of her sentence
// is exactly what containment cannot see, and this phase has now recorded that
// same blindness three times (consequenceWhole, failWhole, routeValueWhole).
function firstParagraphText(html) {
  const m = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(html || '');
  return m ? m[1] : null;
}

group('framingOneSource (WR-05: both hosts render her sentence from ONE ' +
  'source, asserted by EQUALITY on rendered output)', function () {
  // --- HOST B, the Manage pane ---
  const pane = drivePane(R3);
  const paneLine = firstParagraphText(pane.box.innerHTML);
  if (paneLine === null) {
    violations.push('[framingOneSource] the pane rendered no paragraph at ' +
      'all, so nothing below is evidence');
  } else if (paneLine !== C2) {
    violations.push('[framingOneSource] the PANE\'s framing line is not her ' +
      'sentence. Rendered ' + JSON.stringify(paneLine) + ', expected ' +
      JSON.stringify(C2) + '. ⛔ EQUALITY, not containment — a clause welded ' +
      'onto either end is a claim about her fence that she did not make. ⛔ ' +
      'Do not "fix" this by changing the expected value: it is the owner\'s ' +
      'own wording, taken from 26.96-COPY.md, and an agent may not alter one ' +
      'byte of it.');
  }

  // --- HOST A, the pre-import disclosure screen ---
  const imp = driveImport(R3);
  const impLine = firstParagraphText(imp.s.dom('vault-fence-body').innerHTML);
  if (impLine === null) {
    violations.push('[framingOneSource] the import screen rendered no ' +
      'paragraph at all, so nothing below is evidence');
  } else if (impLine !== C2_IMPORT) {
    violations.push('[framingOneSource] the IMPORT SCREEN\'s framing line is ' +
      'not her sentence plus its own clause. Rendered ' +
      JSON.stringify(impLine) + ', expected ' + JSON.stringify(C2_IMPORT) +
      '. ⛔ Neither rendered line\'s bytes may change: this plan gives the ' +
      'sentence one SOURCE, and changes no surface.');
  }

  // --- AND THE RELATIONSHIP, asserted rather than assumed --------------
  // ⚠ This is what makes the two pins one rule instead of two constants that
  // happen to agree — the same defect the pins themselves exist to prevent.
  if (C2_IMPORT !== C2 + IMPORT_TAIL) {
    violations.push('[framingOneSource] ⛔ THE TWO PINS HAVE DRIFTED APART. ' +
      'The import screen\'s pinned line is no longer her sentence plus the ' +
      'one clause that host owns — so one of the two pins was edited alone, ' +
      'and the gate above would go on certifying whichever surface matched.');
  }
});

group('importLineBytes (the import screen\'s rendered line, pinned ' +
  'byte-exactly alongside C2 — the second literal is no longer pinned by ' +
  'nothing)', function () {
  const imp = driveImport(R3);
  const body = imp.s.dom('vault-fence-body').innerHTML;
  assertRendersByte('import screen', body, C2_IMPORT,
    'the import screen\'s whole framing line (her sentence + this host\'s ' +
    'own clause about beginning)', 'importLineBytes');
  // And her sentence really is inside it, at the front — so a future edit
  // that kept the whole line matching while re-ordering it would still be
  // caught by the equality gate above rather than only by this one.
  if (body.indexOf(C2) === -1) {
    violations.push('[importLineBytes] her sentence is absent from the ' +
      'import screen\'s rendered line by value');
  }
});

group('noDeadImportWrite (IN-02: a Manage-pane edit writes nothing into the ' +
  'import screen\'s cross-host object)', function () {
  // Driven through the PANE host, with an ACCEPTED write — the act that used
  // to reach renderVaultImportScreen and set VAULT_IMPORT.roster. ⚠ The read
  // answers R3 so the control she taps EXISTS; the write answers the roster
  // that remains, which is the shipped repaint-from-the-answer rule.
  const s = rosterScope(actTransport(R3, R_AFTER_REMOVE));
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[noDeadImportWrite] the pane never created its editor, ' +
      'so no edit was driven and nothing below is evidence');
    return;
  }
  fireRemove(editor, 'personnel notes', 'noDeadImportWrite');
  // ⛔ READ THE LIFTED SCOPE'S OWN OBJECT, BY VALUE. The shape is lifted from
  // app.js, so a `roster` slot appearing here can only have been written by
  // the product.
  const vi = s.api.VAULT_IMPORT;
  if (!vi) {
    violations.push('[noDeadImportWrite] the scope handed back no ' +
      'VAULT_IMPORT object — the case cannot see what it is asserting about');
    return;
  }
  if (Object.prototype.hasOwnProperty.call(vi, 'roster')) {
    violations.push('[noDeadImportWrite] ⛔ A MANAGE-PANE EDIT WROTE ' +
      'VAULT_IMPORT.roster = ' + JSON.stringify(vi.roster) + '. Nothing ' +
      'anywhere reads it — enumerated over app.js and index.html — so this ' +
      'is dead cross-host state that reads as load-bearing to the next ' +
      'person, and invites exactly the wrong conclusion about what the two ' +
      'hosts share.');
  }
  // The anti-vacuity half: the edit really happened. Without this the
  // assertion above is satisfied by a case that drove nothing at all.
  if (s.calls.post.length !== 1) {
    violations.push('[noDeadImportWrite] the case recorded ' +
      s.calls.post.length + ' write(s), expected exactly 1 BY VALUE — the ' +
      'absence above is only evidence if an edit was actually driven');
  }
});

// ---------------------------------------------------------------------------
// (ruledSlotBytes) ⛔⛔ WHAT THE PANE PUTS ON SCREEN, COMPARED AGAINST HER OWN
// RECORD — 26.96-13, T-26.96-42.
//
// THE DIRECTION IS THE WHOLE POINT AND IT IS WORTH SAYING TWICE. Every other
// group in this file that mentions one of her three ruled sentences compares
// the render against a constant LIFTED FROM app.js. That is a mirror: an agent
// who reworded `ROSTER_ADD_FUTURE_ONLY` would move the expectation with it and
// this suite would certify the reword. tests/test_roster_ruled_copy.cjs closes
// that on the CONSTANT. This closes it on the RENDER — the thing she actually
// reads — by taking its expectation from `26.96-DECISIONS.md`, a file outside
// this repo, written down in the sitting, in her words.
//
// ⛔ EQUALITY ON THE SLOT'S SINGLE PARAGRAPH, never containment. That closure
// is `consequenceWhole`'s and it was invented here for a reason on file: a
// plant welded a count onto the end of C3 and every `indexOf` gate stayed
// green.
//
// ⚠ AND IT COVERS THE ARM NOTHING ELSE IN THIS SUITE REACHES. Her third ruled
// sentence — N2, the one for a name the room found nothing under — had NO
// behavioural coverage anywhere in the tree before this group: measured
// 2026-08-20 by grepping every test for the constant and for `known`, which
// found exactly one file, the constant pin. The route really does answer
// `known` (server.py, handle_librarian_roster) — verified at that route before
// this arm was modelled, because this phase has already been bitten once by a
// transport modelling a shape the server cannot produce.
//
// THE ANTI-VACUITY ANSWERS. (1) It fails loudly if her record cannot be read
// or yields nothing. (2) It fails loudly if the pane did not repaint, so no
// check below can pass over an empty render. (3) Its expectation cannot be
// edited from inside this repo.
// ---------------------------------------------------------------------------
const RULED_RECORD = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker/' +
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases/' +
  '26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-2026-07-31/' +
  '26.96-DECISIONS.md');

// ⚠ THE OPTION NUMBER IS READ, NEVER ASSUMED — the same lesson the constant
// pin carries. A and B happened to be A1 and B1; she then chose N2, and a
// reader hard-coding "1" would have quietly stopped covering her.
function ruledSentence(tag) {
  const src = fs.readFileSync(RULED_RECORD, 'utf8');
  const re = new RegExp('^\\| ' + tag + ' \\|[^|]*\\|\\s*\\*\\*' + tag +
    '(\\d+)\\*\\*\\s*—\\s*`([^`]*)`', 'm');
  const m = src.match(re);
  if (!m) {
    throw new Error('her ruling for ' + tag + ' is not in ' + RULED_RECORD +
      ' — this pin has no expectation and must not invent one');
  }
  if (!m[2].length) {
    throw new Error('her ruling for ' + tag + ' is EMPTY in the record');
  }
  return { option: tag + m[1], text: m[2] };
}

// The route's F-7 answer: it looked, and found nothing under that name.
// ⛔ `retroactive: true` is not decoration — server-side `known` is only ever
// computed when a vault root is stamped, so `known: false` beside
// `retroactive: false` is a shape the route CANNOT produce.
function knownNo(before, after) {
  return retroTransport(before, after, { retroactive: true, known: false });
}

group('ruledSlotBytes (each sentence she ruled is on screen BYTE-EXACT, ' +
  'pinned against her record and never against the constant)', function () {
  let A;
  let B;
  let N;
  try {
    A = ruledSentence('A');
    B = ruledSentence('B');
    N = ruledSentence('N');
  } catch (e) {
    violations.push('[ruledSlotBytes] ' + (e && e.message ? e.message : e));
    return;
  }

  // --- A and N: the consequence slot, on the two arms that produce them ----
  [["A", retroNo, A], ['N', knownNo, N]].forEach(function (a) {
    const d = driveAddOn(drivePane, 'ruledSlotBytes/' + a[0], a[1]);
    if (!d) { return; }
    const full = rendered(d.editor);
    if (!full || full.indexOf('Diaries') === -1) {
      violations.push('[ruledSlotBytes/' + a[0] + '] the pane did not ' +
        'repaint from the route\'s answer, so nothing below is evidence');
      return;
    }
    const slot = consequenceBoxOf(d.editor);
    const html = slot ? slot.innerHTML : '';
    const m = /^<p[^>]*>([\s\S]*)<\/p>$/.exec(html);
    if (!m) {
      violations.push('[ruledSlotBytes/' + a[0] + '] the consequence slot ' +
        'does not hold exactly one paragraph and nothing else: ' +
        JSON.stringify(html));
      return;
    }
    const want = ESCAPE_ONLY.esc(a[2].text);
    if (m[1] !== want) {
      violations.push('[ruledSlotBytes/' + a[0] + '] ⛔ WHAT THE PANE SAYS IS ' +
        'NOT WHAT SHE RULED (' + a[2].option + ').\n      she ruled : ' +
        JSON.stringify(a[2].text) + '\n      on screen : ' +
        JSON.stringify(m[1]) + '\n      ⛔ Her record is the truth here. ' +
        'Change the code, never the record — and never this expectation.');
    }
    // ⛔ COUNTED. A sentence rendered and painted over is invisible to an
    // equality check on the final markup and visible here (26.96-03).
    const writes = consequenceWrites(d.editor);
    if (writes !== 1) {
      violations.push('[ruledSlotBytes/' + a[0] + '] her sentence was ' +
        'written into the slot ' + writes + ' time(s), expected exactly 1 ' +
        'BY VALUE');
    }
  });

  // --- B: the read-failed pane, where her list could not be read -----------
  const d = drivePaneWithMeta(null, rejectingItems());
  const full = rendered(d.box);
  if (d.box.writes < 1) {
    violations.push('[ruledSlotBytes/B] the pane rendered NOTHING — the ' +
      'comparison below would be over an empty string');
    return;
  }
  const mb = /<p[^>]*>([\s\S]*?)<\/p>/.exec(full);
  if (!mb) {
    violations.push('[ruledSlotBytes/B] the read-failed pane emitted no ' +
      'paragraph at all, so her sentence (' + B.option + ') is not on ' +
      'screen: ' + JSON.stringify(full.slice(0, 240)));
    return;
  }
  const wantB = ESCAPE_ONLY.esc(B.text);
  if (mb[1] !== wantB) {
    violations.push('[ruledSlotBytes/B] ⛔ WHAT THE READ-FAILED PANE SAYS IS ' +
      'NOT WHAT SHE RULED (' + B.option + ').\n      she ruled : ' +
      JSON.stringify(B.text) + '\n      on screen : ' +
      JSON.stringify(mb[1]) + '\n      ⚠ She chose B1 to echo the failure ' +
      'line she had already approved; a tidy of either drifts them apart.');
  }
});

// ===========================================================================
// 26.96-21 WAVE 21 — WR-09: A SUCCESSFUL READ IS THE TRUTH ABOUT HER FENCE,
// WHATEVER IT CARRIES. Plus WR-14's missing arm beside it.
//
// THE FINDING. 26.96-15 keyed the PAINTER on the read's own outcome and closed
// the resolved-but-not-succeeded door properly. It did not touch the CACHE one
// line above it, which is still written only when the answer carries a VALID
// ARRAY. So a read that SUCCEEDED and carried no roster key leaves the
// PREVIOUS read's list standing, and `paint` — correctly told the read
// succeeded — renders that stale list under her framing sentence saying the
// librarian never reads them.
//
// ⛔ THE HARM, BY VALUE AND NOT BY CATEGORY. On a warm cache holding folders
// that are NOT on the fence, plus a successful keyless read, the pane NAMES
// TWO FOLDERS THAT ARE NOT FENCED AND OMITS FOUR THAT ARE. A false statement
// in both directions at once, on the surface this phase calls the strongest
// privacy control in the room.
//
// ⛔ BOTH ARMS ARE DRIVEN THROUGH A RESOLVING TRANSPORT, NEVER THE REJECTING
// STUB. This phase's own canary finding (26.96-15) is that the rejecting stub
// SKIPS the fulfilment handler entirely — the site under test here — so an arm
// built on it would re-drive `readFailed` under a new name and prove nothing
// about this defect at all. That is also why WR-14's pairing needs its own
// arm: `readFailedCached` is a REJECTION, and a not-ok ANSWER is a different
// door into the same promise.
//
// ⛔ AND THE FIX MAY NOT BE "RENDER ONLY WHEN AN ARRAY IS PRESENT". That hides
// a fence that IS in force for a store whose key is merely absent — the same
// defect pointing the other way. `absentKeyStillDefaults` is the permanent
// control that refuses it; `readFailedCached` is the permanent control that
// refuses a fix which destroys a cached view on a bad answer. ⛔ BOTH ARE
// ASSERTED TO HAVE FINISHED, BY COUNT, IN THIS SAME RUN — see the executed
// roster printed at the foot of this file.
// ===========================================================================

// Two folder names a warm cache can plausibly hold that are NOT on the shipped
// default fence — so "the cached list is on screen" and "the default fence is
// on screen" can never be the same observation. ⛔ Their absence from the
// product's own array is ASSERTED inside the group rather than assumed: if the
// shipped defaults ever grew to include one of these, the fixture would go
// quiet and the group would pass over nothing.
const STALE_CACHE = ['tax returns 2019', 'letters to M'];

group('staleAfterKeylessOk (⛔ WR-09: a SUCCESSFUL read carrying no roster ' +
  'key renders THAT read\'s answer, never the cached one)', function () {
  // (0) THE FIXTURE ITSELF, FIRST. If a stale name were also a default name,
  //     every assertion below would be reading one list and calling it the
  //     other.
  STALE_CACHE.forEach(function (n) {
    if (DEFAULT_NAMES.indexOf(n) !== -1) {
      violations.push('[staleAfterKeylessOk] ⛔ BROKEN INSTRUMENT: the stale ' +
        'cache name ' + JSON.stringify(n) + ' is ALSO on the shipped default ' +
        'fence, so "the cached list rendered" and "the default fence ' +
        'rendered" are the same observation and nothing below is evidence.');
    }
  });

  // A warm cache holding two folders that are NOT fenced, then a read that
  // SUCCEEDS and answers a meta with NO fenced_roster key — which the real
  // route measurably does for a store that has never had one written
  // (26.96-10's measurement against the live route).
  const d = drivePaneWithMeta({ fenced_roster: STALE_CACHE.slice() },
    okItems({}));

  // (1) ANTI-DEGENERACY, FIRST. Every "the stale names are absent" assertion
  //     below is satisfied perfectly by a renderer that produced nothing.
  if (!d.editor) {
    violations.push('[staleAfterKeylessOk] ⛔ THE PANE HID THE FENCE. The ' +
      'read SUCCEEDED and the roster key is merely ABSENT — the server ' +
      'materialises the four defaults for exactly that store. Rendering ' +
      'nothing here states a WEAKER protection than she has: the same defect ' +
      'pointing the other way, and it is the wrong fix.');
    return;
  }
  const full = rendered(d.box);
  if (full.length === 0) {
    violations.push('[staleAfterKeylessOk] ⛔ BROKEN INSTRUMENT: the captured ' +
      'markup is EMPTY, so both halves below are absences over nothing.');
    return;
  }

  // (2) THE READ'S OWN ANSWER IS ON SCREEN — the four shipped defaults, in
  //     their RENDERED spelling so the ampersand name is really checked and
  //     not trivially absent.
  let present = 0;
  DEFAULT_SHOWN.forEach(function (n, i) {
    if (full.indexOf(n) === -1) {
      violations.push('[staleAfterKeylessOk] the default folder name ' +
        JSON.stringify(DEFAULT_NAMES[i]) + ' is ABSENT by value. The read ' +
        'SUCCEEDED and this fence IS in force server-side — the pane is ' +
        'OMITTING a folder that is genuinely private.');
    } else { present += 1; }
  });

  // (3) AND THE PREVIOUS READ'S ANSWER IS NOT.
  STALE_CACHE.forEach(function (n) {
    if (full.indexOf(ESCAPE_ONLY.esc(n)) !== -1) {
      violations.push('[staleAfterKeylessOk] ⛔ THE PANE STATED A FENCE IT ' +
        'DID NOT READ. This read SUCCEEDED and answered NO roster key, yet ' +
        'the rendered pane still carries ' + JSON.stringify(n) + ' BY VALUE ' +
        '— a name from an EARLIER read, sitting under her sentence "These ' +
        'folders stay private. The librarian never reads them…". ⚠⚠ READ ' +
        'THE HARM AND NOT THE DIFF: with ' + JSON.stringify(STALE_CACHE) +
        ' cached and this answer on the wire the pane names ' +
        STALE_CACHE.length + ' folders that are NOT fenced and omits ' +
        (DEFAULT_NAMES.length - present) + ' that ARE — a false statement in ' +
        'BOTH directions at once, on the strongest privacy control in the ' +
        'room. Rendered: ' + JSON.stringify(full.slice(0, 240)));
    }
  });

  // (4) HER FRAMING SENTENCE BELONGS WITH A LIST THAT WAS ACTUALLY READ.
  if (full.indexOf(C2) === -1) {
    violations.push('[staleAfterKeylessOk] her framing line is absent from a ' +
      'pane that DID read her store');
  }

  // (5) ⛔ COUNTED, NEVER CHECKED FOR EMPTINESS. A parent repaint RESETS a
  //     child without incrementing it, so a list rendered and then painted
  //     over looks exactly like a list that was never rendered.
  const w = editorWrites(d.box);
  if (w !== 1) {
    violations.push('[staleAfterKeylessOk] the roster editor container was ' +
      'written into ' + w + ' time(s) on a successful read, expected exactly ' +
      '1 BY VALUE.');
  }
});

group('cachedSurvivesNotOk (WR-14\'s missing arm: a warm cache plus a ' +
  'RESOLVING not-ok read still shows the last read)', function () {
  const d = drivePaneWithMeta({ fenced_roster: STALE_CACHE.slice() },
    notOkItems(500));
  if (!d.editor) {
    violations.push('[cachedSurvivesNotOk] ⛔ ONE BAD ANSWER DESTROYED WHAT ' +
      'SHE COULD LAST SEE. There IS a last read here and what is on screen ' +
      'is still true as of it; a read that did NOT succeed may change ' +
      'nothing. ⚠ This is the pairing WR-14 names, and it needs its own arm ' +
      'through a RESOLVING transport — readFailedCached drives the REJECTING ' +
      'stub, which never reaches the fulfilment handler at all and so cannot ' +
      'express this case.');
    return;
  }
  const full = rendered(d.box);
  if (full.length === 0) {
    violations.push('[cachedSurvivesNotOk] ⛔ BROKEN INSTRUMENT: the captured ' +
      'markup is EMPTY, so nothing below is evidence.');
    return;
  }
  nonEmptyNamed('cachedSurvivesNotOk', d.editor.innerHTML, STALE_CACHE);
  if (full.indexOf(C2) === -1) {
    violations.push('[cachedSurvivesNotOk] her framing line is absent. A ' +
      'list IS on screen here, so the sentence that says what the list means ' +
      'belongs with it.');
  }
  // ⛔ COUNTED, NEVER CHECKED FOR EMPTINESS — same reason as above.
  const w = editorWrites(d.box);
  if (w !== 1) {
    violations.push('[cachedSurvivesNotOk] the roster editor container was ' +
      'written into ' + w + ' time(s) on a not-ok read with a real last read ' +
      'behind it, expected exactly 1 BY VALUE.');
  }
});

// ---------------------------------------------------------------------------
// (HOSTCOVERAGE) ⛔ 26.96-22 (T-26.96-62): NO HOST OWNS A ROSTER CONTROL OF
// ITS OWN — AND THIS GATE EXISTS BEFORE THE PICKER DOES, DELIBERATELY.
//
// MEASURED (26.96-RESEARCH-ROUND2 § A-6, re-driven by this plan on both
// hosts): a picker-shaped markup block inserted into `renderRosterSection`'s
// OWN `box.innerHTML` assignment — exactly where a plausible implementation of
// a folder picker would put it — renders on the Manage pane, is ABSENT from
// both hosts' shared-editor markup, and the whole node suite returns a failure
// set IDENTICAL to baseline. P-3 included, rc=0. The person who never opens
// Manage never gets the control at all, and nothing says so.
//
// ⛔ WHY P-3 CANNOT SEE IT, AND WHY RUNNING IT MORE OFTEN WOULD NOT HELP. P-3
// compares `a.editor.innerHTML` against `b.editor.innerHTML`. It never looks at
// the pane AROUND the editor. A control added at a call site leaves both
// editors byte-identical, so P-3 is structurally incapable of noticing it. That
// is not a defect in P-3 — it is the boundary of the question P-3 asks, and the
// repair is a different question, asked here.
//
// ⛔ AND THE REPAIR IS NOT A SECOND BYTE-EQUALITY. The two hosts' PANES are NOT
// byte-comparable, and a group that compared them would be RED ON SHIPPED,
// CORRECT CODE: the Manage host wraps the editor in its registry-read heading
// and her framing sentence (`renderRosterSection`), while the import host
// writes her sentence PLUS its own trailing clause about beginning into a
// DIFFERENT box (`vault-fence-body`) and hands `vault-roster-card` straight to
// the shared renderer. Measured on the shipped tree before this group was
// written. The property that DOES hold across both hosts is narrower and true:
// every interactive control on a host's surface came out of the shared
// renderer.
//
// ⛔⛔ AND IT IS COMPUTED ON BOTH HOSTS, IN THE SAME CASE, BECAUSE THE PROPERTY
// IS ABOUT BOTH. The named trap is Manage-side; but a control emitted at the
// IMPORT host's own call site leaves BOTH hosts' editor markup identical too,
// and a Manage-only comparison is green on it — the same blindness rotated.
// Both plants were driven red, each with its md5 asserted moved first.
//
// WHAT A "CONTROL" IS HERE. An opening tag from the interactive vocabulary
// (button, input, select, textarea), keyed by tag name + its `type` + its
// `class`, so two different controls are never collapsed into one and an
// unclassed `<input type="file">` is still a distinct member.
// ⛔ A LOCAL SCANNER, NOT `scanTags`: four groups above depend on that helper's
// exact shape, and widening a shared helper to serve a new question is how one
// group ends up carrying another's green.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? The question did not exist. The
//      defect it names is GREEN on the shipped tree under every other group in
//      this file — that is the measurement in the objective above, not a
//      claim — so there is no earlier state of the tree in which this was
//      being asked at all.
//  (2) Can it still pass once deliberately broken? No — driven RED twice, once
//      per host, on the exact plant the research drove green, each mutation
//      asserted APPLIED by md5 and asserted LIVE from rendered output before
//      any verdict was read. Recorded verbatim in 26.96-22-SUMMARY.md.
//  (3) Does a DEGENERATE implementation satisfy it? No — and this is the
//      answer that needed the most care, because TWO EMPTY SETS ARE EQUAL. A
//      renderer that emitted nothing at all would satisfy a bare multiset
//      comparison on both hosts, forever. So the positive control is asserted
//      BY VALUE in the SAME case, per host: the shipped add field, the shipped
//      add button, and exactly one remove control per roster entry, counted —
//      never checked for emptiness — against the number of editor containers
//      that actually rendered, which is derived here rather than typed.
//  (4) Is it reading evaluation order or source order? EVALUATION ORDER, and
//      only that. Every multiset is computed from markup the shipped renderers
//      actually produced for a driven roster. Not one byte of app.js SOURCE
//      text is consulted.
//  (5) Could a grep match the fix's own comment? There is no grep in this
//      group, so no comment can satisfy any assertion in it.
//
// ⚠ THE RESIDUAL, WRITTEN DOWN RATHER THAN LEFT FOR SOMEBODY TO FIND LATER. A
// call site that appended its picker INTO the shared editor's own container —
// `$('vault-roster-card').innerHTML += …` on the import host, or the same on
// the Manage host's editor child — would land inside the very markup this group
// treats as the renderer's own output, and would pass. That is not the shape
// research measured and not the shape a plausible implementation takes, but it
// is NOT covered, and the honest place to say so is here rather than in a
// summary nobody re-reads.
//
// ⚠ WHY THIS GROUP SITS AT THE END OF THE FILE RATHER THAN BESIDE P-3. It
// drives the after-add and after-remove surfaces too, and those need
// `driveAddOn`/`driveRemoveOn` and the `const` transports and rosters declared
// further down. A `const` is in its temporal dead zone at the point P-3 runs,
// so the same group placed there would THROW rather than assert.
// ---------------------------------------------------------------------------

const HC_INTERACTIVE = '<(button|input|select|textarea)((?:[^>"]|"[^"]*")*)>';

// ⚠ Same tolerance as `scanTags`: a '>' may legally sit INSIDE a quoted
// attribute value (escapeAttr escapes & " ' but deliberately not < or >), and
// a naive /[^>]*/ scan would break on exactly the folder names this file
// plants elsewhere.
function hcDescriptors(html) {
  const out = [];
  const re = new RegExp(HC_INTERACTIVE, 'g');
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const cls = /(?:^|\s)class="([^"]*)"/.exec(m[2]);
    const typ = /(?:^|\s)type="([^"]*)"/.exec(m[2]);
    out.push(m[1] + '[type=' + (typ ? typ[1] : '') + ']' +
      '[class=' + (cls ? cls[1] : '') + ']');
  }
  return out;
}

// EVERY box this drive wrote into, children included. ⛔ Never a typed list of
// container ids: a picker emitted into a box nobody has heard of yet is
// precisely the thing being guarded against, and a typed roster of surfaces
// would be blind to it by construction.
function hcAllRendered(dom) {
  return Object.keys(dom.boxes).sort().map(function (k) {
    return rendered(dom.boxes[k]);
  }).join('');
}

// THE SHARED RENDERER'S OWN OUTPUT, per host, as it actually landed. The two
// hosts reach it by different routes and that asymmetry is shipped, not
// incidental: HOST A hands `vault-roster-card` — a top-level box — straight to
// `renderRosterEditor`, while HOST B creates `.vault-roster-editor` as a CHILD
// of its pane box and passes that. Both are read here; a host whose editor
// never rendered contributes nothing and is not counted as a host.
function hcEditorBoxes(dom) {
  const out = [];
  const card = dom.boxes['vault-roster-card'];
  if (card && rendered(card).length) {
    out.push({ where: 'vault-roster-card', html: rendered(card) });
  }
  const pane = dom.boxes['manage-sec-roster'];
  const kid = pane && pane.kids ? pane.kids['vault-roster-editor'] : null;
  if (kid && rendered(kid).length) {
    out.push({ where: 'manage>vault-roster-editor', html: rendered(kid) });
  }
  return out;
}

// Multiset difference, BY COUNT — never set difference. Two remove controls
// where one belongs is a real finding and a set comparison would swallow it.
function hcDiff(a, b) {
  const rest = b.slice();
  const extra = [];
  a.forEach(function (x) {
    const i = rest.indexOf(x);
    if (i === -1) { extra.push(x); } else { rest.splice(i, 1); }
  });
  return { extra: extra, missing: rest };
}

group('hostCoverage (every interactive control on a host\'s surface came out ' +
  'of the shared renderer — both hosts, same case)', function () {
  const ADD_FIELD = 'input[type=text][class=vault-roster-add-input]';
  const ADD_BTN = 'button[type=button][class=btn vault-roster-add]';
  const REMOVE = 'button[type=button][class=vault-roster-remove]';

  function countOf(list, d) {
    return list.filter(function (x) { return x === d; }).length;
  }

  function check(where, dom, entries) {
    const paneHtml = hcAllRendered(dom);
    const editors = hcEditorBoxes(dom);
    const editorHtml = editors.map(function (e) { return e.html; }).join('');
    const pane = hcDescriptors(paneHtml);
    const editor = hcDescriptors(editorHtml);
    // ⛔ PRINTED BEFORE ANY VERDICT IS READ, WITH ITS SIZE BESIDE IT, so a
    // comparison between two EMPTY sets is VISIBLE rather than inferred. This
    // line is the evidence half of anti-vacuity answer (3).
    console.log('  [hostCoverage/' + where + '] pane=' + pane.length + ' ' +
      JSON.stringify(pane.slice().sort()));
    console.log('  [hostCoverage/' + where + '] editor=' + editor.length +
      ' (' + editors.length + ' editor container(s): ' +
      JSON.stringify(editors.map(function (e) { return e.where; })) + ') ' +
      JSON.stringify(editor.slice().sort()));
    if (paneHtml.length === 0) {
      violations.push('[hostCoverage] ⛔ BROKEN INSTRUMENT (' + where + '): ' +
        'the captured surface is EMPTY, so nothing below is evidence.');
      return;
    }
    if (editors.length === 0) {
      violations.push('[hostCoverage] ⛔ (' + where + ') NO SHARED EDITOR ' +
        'RENDERED AT ALL. Every control on this surface is therefore a ' +
        'control some host owns privately — or the drive never reached the ' +
        'renderer, which is the same amount of evidence: none.');
      return;
    }
    // THE POSITIVE CONTROL, BY VALUE, IN THE SAME CASE. ⛔ Two empty sets are
    // equal; without this the comparison below would be satisfied forever by
    // a renderer that emitted nothing. The expected counts are DERIVED from
    // the number of editor containers that actually rendered — never typed —
    // because the after-act surfaces repaint BOTH hosts through
    // `renderRosterHosts` and a typed number would be wrong on half of them.
    [[ADD_FIELD, editors.length], [ADD_BTN, editors.length],
      [REMOVE, editors.length * entries]].forEach(function (want) {
      const inEditor = countOf(editor, want[0]);
      if (inEditor !== want[1]) {
        violations.push('[hostCoverage] ⛔ THE POSITIVE CONTROL FAILED (' +
          where + '): the shared renderer emitted ' + inEditor + ' × ' +
          JSON.stringify(want[0]) + ', expected ' + want[1] + ' BY VALUE (' +
          editors.length + ' editor container(s) × ' + entries + ' entr(ies)). ' +
          '⚠ Read this before reading any comparison below: the multiset ' +
          'equality this group rests on is satisfied by two EMPTY sets, so a ' +
          'renderer that stopped emitting controls would pass it silently. ' +
          'This assertion is what refuses that.');
      }
      const inPane = countOf(pane, want[0]);
      if (inPane !== want[1]) {
        violations.push('[hostCoverage] ⛔ THE POSITIVE CONTROL FAILED (' +
          where + '): the rendered SURFACE carries ' + inPane + ' × ' +
          JSON.stringify(want[0]) + ', expected ' + want[1] + ' BY VALUE.');
      }
    });
    const diff = hcDiff(pane, editor);
    if (diff.extra.length) {
      violations.push('[hostCoverage] ⛔ A ROSTER CONTROL WAS EMITTED AT A ' +
        'HOST\'S OWN CALL SITE, NOT IN THE SHARED RENDERER (' + where + '). ' +
        'On this surface: ' + JSON.stringify(diff.extra) + ' — present in the ' +
        'rendered pane and ABSENT from every shared-editor container on it. ' +
        '⛔ READ THE HARM AND NOT THE DIFF: this is the control the OTHER host ' +
        'will never receive. The Manage pane is reached from a rail; the ' +
        'import screen is reached once, before anything is read. A person who ' +
        'sets her fence at import gets a different privacy editor from a ' +
        'person who sets it in Manage, and NOTHING on either screen says so. ' +
        '⚠ P-3 is green on exactly this state — it compares the two editors, ' +
        'which are byte-identical, and never looks at the pane around them. ' +
        'The fix is to move the control INTO renderRosterEditor, never to ' +
        'widen this group.');
    }
    if (diff.missing.length) {
      violations.push('[hostCoverage] ⛔ BROKEN INSTRUMENT (' + where + '): ' +
        'the shared editor emitted control(s) the surface scan did not find: ' +
        JSON.stringify(diff.missing) + '. The editor markup is supposed to be ' +
        'a SUBSET of the rendered surface by construction, so this is the ' +
        'scanner disagreeing with itself and no verdict here means anything.');
    }
  }

  // AT REST, PER HOST, IN ITS OWN SCOPE. Neither host repaints the other at
  // rest, so each scope's box set IS that host's surface and no id needs
  // naming.
  const b = drivePane(R3);
  if (!b.editor) {
    violations.push('[hostCoverage] host B (the Manage pane) never created ' +
      'its editor container — nothing was driven and nothing is evidence');
  } else {
    check('manage-at-rest', b.s.dom, R3.length);
  }
  const a = driveImport(R3);
  if (!a.editor) {
    violations.push('[hostCoverage] host A (the import screen) never created ' +
      'its editor container — nothing was driven and nothing is evidence');
  } else {
    check('import-at-rest', a.s.dom, R3.length);
  }

  // AND ON THE SURFACES HER ACTS PRODUCE, because the pane's SHAPE changes on
  // both and a gate that only ever looked at the resting state would be blind
  // to a control emitted only after an edit. ⚠ `renderRosterHosts` repaints
  // EVERY host that is on screen, so these scopes may carry two editors; the
  // counts above are derived from that number rather than assuming one.
  const addB = driveAddOn(drivePane, 'hostCoverage/manage-after-add');
  if (addB) { check('manage-after-add', addB.s.dom, R_AFTER_ADD.length); }
  const addA = driveAddOn(driveImport, 'hostCoverage/import-after-add');
  if (addA) { check('import-after-add', addA.s.dom, R_AFTER_ADD.length); }
  const remB = driveRemoveOn(drivePane, 'hostCoverage/manage-after-remove');
  if (remB) { check('manage-after-remove', remB.s.dom, R_AFTER_REMOVE.length); }
  const remA = driveRemoveOn(driveImport, 'hostCoverage/import-after-remove');
  if (remA) { check('import-after-remove', remA.s.dom, R_AFTER_REMOVE.length); }
});


// ---------------------------------------------------------------------------
// (pickerTracer) 26.96-27 — ONE FOLDER, OFFERED AND FENCED, THROUGH EVERY
// LAYER.
//
// The owner ruled on 2026-08-22 (D-A, D-B, D-D — ⛔ all TIER 2, approved as
// shown: an orchestrator wrote every option label and she picked one; she
// typed no prose anywhere in either sitting) that the pane offers her EVERY
// FOLDER IN HER VAULT AT ANY DEPTH, from ONE box sitting WHERE THE TYPING BOX
// SITS TODAY, in a list DELIBERATELY DIFFERENT TO LOOK AT from the bringing-in
// screen's.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? No — `rosterFolderPath` and
//      `loadRosterFolderChoices` did not exist, and `extractFn` THROWS on a
//      missing name, so the scope would be reported as a broken instrument.
//  (2) Can it still pass once deliberately broken? No — seven planted defects
//      were driven against it, each proven applied by content hash AND proven
//      semantically live on the driven path before its verdict was read.
//  (3) Does a degenerate implementation satisfy it? No — the posted folder is
//      compared BY VALUE against the NESTED fixture's whole vault-root-
//      relative path, the metadata route is counted at ZERO rather than
//      checked for emptiness, and the consequence slot's WRITE COUNT is
//      asserted at exactly 1.
//  (4) Is it reading evaluation order or source order? EVALUATION ORDER: the
//      picker's own control double is INVOKED and the transport records what
//      it received. Nothing here reads the text of app.js.
//  (5) Could a grep match the fix's own comment? There is no grep here.
//
// ⛔ THE FIXTURE IS NESTED, AND A TOP-LEVEL ONE IS REFUSED. `Clippings` alone
// would satisfy the path-not-leaf assertion whether the picker emitted a path
// or a leaf, so it could never fail it.
// ---------------------------------------------------------------------------

// ⛔ HER SENTENCES, PINNED AGAINST `26.96-COPY-ROUND3.md` § 8 AND NEVER
// AGAINST THE CONSTANTS THE RENDERER READS. Both are TIER 2 — she chose an
// agent-written label at a multiple-choice control and wrote no prose. ⛔ No
// message, comment or summary may call either one a sentence she wrote cold.
const S1_LEAD = 'Choose a folder to keep private.';
const S5_REACH = 'Only folders in your vault appear here.';

// The shipped placeholder, ⛔ UNCHANGED BY HER RULING (ask 2, S-2: she chose
// "leave it"). It is pinned here because her answer was NO CHANGE, and a
// no-change answer with no gate is indistinguishable from nobody having asked.
const S2_PLACEHOLDER_UNCHANGED =
  'a folder to keep private, for example: Diaries';

// The transport for the enumeration drive: it answers the FOLDER ROUTE with
// the segment lists, and the roster route with the write's own answer.
function pickerTransport(folders, fencedAfter) {
  return function (url, body) {
    if (url === '/api/adapter/vault-folder-paths') {
      return shippedThenable({ ok: true, status: 200,
        data: { ok: true, folders: folders } });
    }
    if (url === '/api/items') {
      return shippedThenable({ ok: true, status: 200,
        data: { meta: { fenced_roster: R3 } } });
    }
    return shippedThenable({ ok: true, status: 200,
      data: { fenced_roster: fencedAfter, flagged: FLAGGED_COUNT,
        retroactive: true } });
  };
}

group('pickerTracer (one folder, offered from the source she ruled, chosen ' +
  'with one tap, written through the SHIPPED roster route, repainted from ' +
  'that route\'s own answer)', function () {
  const after = R3.concat([PICKER_NESTED_PATH]);

  // -- (a) THE WIRE: the enumeration really lands, and the picker offers it.
  // ⛔ THIS SCOPE STARTS WITH AN EMPTY OFFERED LIST, so what it renders can
  // only have come from the route.
  const s = rosterScope(pickerTransport(PICKER_CHOICES, after), []);
  s.api.loadChoices();
  const offered = s.api.offered();
  console.log('  [pickerTracer/wire] gets=' + JSON.stringify(s.calls.get) +
    ' offered=' + offered.length + ' ' + JSON.stringify(offered));
  if (s.calls.get.indexOf('/api/adapter/vault-folder-paths') === -1) {
    violations.push('[pickerTracer] the picker never asked the enumeration ' +
      'route at all — nothing below is evidence about a wire: ' +
      JSON.stringify(s.calls.get));
    return;
  }
  if (offered.length !== PICKER_CHOICES.length) {
    violations.push('[pickerTracer] the route answered ' +
      PICKER_CHOICES.length + ' entr(ies) and the picker holds ' +
      offered.length + ' — the offered list is not the route\'s answer');
    return;
  }

  const box = s.dom('manage-sec-roster');
  s.api.pane();
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[pickerTracer] the pane never created its editor ' +
      'container — nothing was driven and nothing is evidence');
    return;
  }
  const markup = editor.innerHTML;
  if (!markup.length) {
    violations.push('[pickerTracer] the captured editor markup is EMPTY');
    return;
  }

  // -- (b) HER SENTENCES, BYTE-EXACT, AGAINST HER RECORD.
  [[S1_LEAD, 'S-1 (the line above the folder names)'],
    [S5_REACH, 'S-5 (what the list reaches)'],
    [S2_PLACEHOLDER_UNCHANGED, 'S-2 (the shipped placeholder, which her ' +
      'ruling left UNCHANGED)']].forEach(function (pin) {
    if (markup.indexOf(pin[0]) === -1) {
      violations.push('[pickerTracer] ' + pin[1] + ' is not on screen ' +
        'BYTE-EXACT. ⛔ The expectation is pinned against ' +
        '26.96-COPY-ROUND3.md § 8, never against the constant the renderer ' +
        'reads: ' + JSON.stringify(pin[0]) + ' — rendered: ' +
        JSON.stringify(markup.slice(0, 260)));
    }
  });

  // -- (c) THE OFFERED ROWS, AND THE NESTED ONE AMONG THEM BY VALUE.
  // ⚠ 26.96-28: READ THROUGH THE LOCATION-AGNOSTIC READER. Her D-B ruling
  // made the offered list narrow as she types, which means it is repainted on
  // every keystroke — and repainting the whole editor would destroy the field
  // she is typing into, so the rows now live in the editor's own
  // `.vault-roster-choices` child. ⛔ This case's CLAIM is unchanged and no
  // number in it moved; only where the reader looks did.
  const rows = pickerRowsOf(editor);
  console.log('  [pickerTracer/rows] offered=' + rows.length + ' values=' +
    JSON.stringify(rows.map(function (r) {
      return r.getAttribute('data-folder');
    })));
  if (rows.length !== PICKER_CHOICES.length) {
    violations.push('[pickerTracer] the picker bound ' + rows.length +
      ' choice control(s) for a ' + PICKER_CHOICES.length +
      '-entry answer, expected ' + PICKER_CHOICES.length + ' BY VALUE');
    return;
  }
  // ⛔⛔ NO TRAILING SEPARATOR — ASSERTED HERE, OVER EVERY OFFERED ROW, AND
  // DELIBERATELY BEFORE THE EXACT-VALUE LOOKUP BELOW.
  //
  // ⚠ THIS POSITION IS A DRILL FINDING, NOT A STYLE CHOICE. It first sat AFTER
  // the lookup, on the posted body alone — and plant 3 (append a separator to
  // the emitted value) reddened the PATH-NOT-LEAF assertion instead, whose
  // early `return` meant the trailing-separator assertion NEVER RAN. ⛔ A
  // verdict that never ran is not evidence, so the plant's verdict for this
  // property was discarded and the assertion was moved. An assertion sitting
  // behind an early return is an assertion nothing holds.
  const trailing = rows.map(function (r) {
    return r.getAttribute('data-folder');
  }).filter(function (v) {
    const c = String(v == null ? '' : v).slice(-1);
    return c === '/' || c === '\\';
  });
  if (trailing.length) {
    violations.push('[pickerTracer] offered row(s) end in a separator: ' +
      JSON.stringify(trailing) + '. A stray mark on the end of an entry is ' +
      'the defect her D-C ruling is about; ⛔ the picker may not create one, ' +
      'and it cleans none of the ones she already has.');
  }
  const nested = rows.filter(function (r) {
    return r.getAttribute('data-folder') === PICKER_NESTED_PATH;
  })[0];
  if (!nested) {
    violations.push('[pickerTracer] ⛔ THE EMITTED VALUE IS A LEAF, NOT A ' +
      'PATH. No offered row carries ' + JSON.stringify(PICKER_NESTED_PATH) +
      '. The fence compares WHOLE SEGMENTS FROM THE VAULT ROOT, so a leaf ' +
      'name fences nothing at all and the row would look like protection ' +
      'while giving none. Rows carry: ' + JSON.stringify(rows.map(
        function (r) { return r.getAttribute('data-folder'); })));
    return;
  }

  // -- (d) ONE TAP, THROUGH THE SHIPPED ROUTE, AND NOWHERE ELSE.
  const importWritesBefore = JSON.stringify(s.api.VAULT_IMPORT || {});
  const before = s.calls.post.length;
  nested.fire();
  const posted = s.calls.post.slice(before);
  console.log('  [pickerTracer/tap] posts=' + posted.length + ' ' +
    JSON.stringify(posted));
  // ⚠ NO EARLY RETURN HERE, AND THAT IS THE SECOND HALF OF THE SAME DRILL
  // FINDING. Plant 4 (a direct metadata write beside the roster post) reddened
  // this count and then RETURNED — so the zero-write-by-count assertion below,
  // the one the threat register names as the mitigation, NEVER RAN. ⛔ The two
  // facts are recorded together on purpose: the write count and the metadata
  // route's count are different claims, and one may not swallow the other.
  if (posted.length !== 1) {
    violations.push('[pickerTracer] one tap recorded ' + posted.length +
      ' write(s), expected exactly 1: ' + JSON.stringify(posted));
  }
  if (!posted.length) {
    violations.push('[pickerTracer] the tap recorded NO write at all, so ' +
      'every assertion below would be a pass over nothing');
    return;
  }
  if (posted[0].url !== '/api/librarian/roster') {
    violations.push('[pickerTracer] the picker wrote to ' +
      JSON.stringify(posted[0].url) + ' — ⛔ the roster class must travel ' +
      'the SHIPPED roster route or it does not travel. That route owns ' +
      'D-07\'s asymmetry; any other door skips the retroactive stamp.');
  }
  // ⛔ THE ROSTER POST ITSELF, PICKED OUT BY ROUTE. Reading `posted[0]` alone
  // would let a planted extra write shift the index and turn a defect into a
  // different, less legible red.
  const rosterPosts = posted.filter(function (x) {
    return x.url === '/api/librarian/roster';
  });
  const body = (rosterPosts[0] || posted[0]).body || {};
  if (body.op !== 'add') {
    violations.push('[pickerTracer] the posted op was ' +
      JSON.stringify(body.op) + ', expected "add" BY VALUE');
  }
  // ⛔ THE EMITTED VALUE, BY VALUE, ON THE NESTED FIXTURE.
  if (body.folder !== PICKER_NESTED_PATH) {
    violations.push('[pickerTracer] the posted folder was ' +
      JSON.stringify(body.folder) + ', expected the WHOLE vault-root-' +
      'relative path ' + JSON.stringify(PICKER_NESTED_PATH) + ' BY VALUE');
  }
  // ⛔ NO TRAILING SEPARATOR — the whole of what her C2 ruling bought,
  // asserted rather than assumed.
  const last = String(body.folder || '').slice(-1);
  if (last === '/' || last === '\\') {
    violations.push('[pickerTracer] the posted folder ends in a separator (' +
      JSON.stringify(body.folder) + '). A stray mark on the end of an entry ' +
      'is the defect her D-C ruling is about; the picker may not create one.');
  }

  // ⛔ ZERO WRITES ELSEWHERE, ASSERTED BY COUNT AND NEVER BY EMPTINESS, in
  // the SAME case as the positive assertion above.
  const urls = s.calls.post.map(function (p) { return p.url; });
  const metaHits = urls.filter(function (u) { return u === '/api/meta'; })
    .length;
  console.log('  [pickerTracer/zero] posts=' + urls.length + ' meta=' +
    metaHits + ' urls=' + JSON.stringify(urls));
  if (metaHits !== 0) {
    violations.push('[pickerTracer] the metadata route appears ' + metaHits +
      ' time(s), expected 0 BY COUNT — /api/meta validates a roster but ' +
      'SKIPS add_roster_folder\'s retroactive trigger=True stamping, ' +
      'silently reopening the hole 26.4-01 closed. URLs: ' +
      JSON.stringify(urls));
  }
  const importWritesAfter = JSON.stringify(s.api.VAULT_IMPORT || {});
  if (importWritesAfter !== importWritesBefore) {
    violations.push('[pickerTracer] the picker wrote into the import ' +
      'screen\'s cross-host object: ' + importWritesBefore + ' -> ' +
      importWritesAfter);
  }

  // -- (e) THE CONSEQUENCE, SAID EXACTLY ONCE, BY WRITE COUNT.
  const slot = consequenceBoxOf(editor);
  const writes = slot ? slot.writes : 0;
  console.log('  [pickerTracer/consequence] writes=' + writes + ' said=' +
    JSON.stringify(slot ? slot.innerHTML.slice(0, 120) : '(no slot)'));
  if (writes !== 1) {
    violations.push('[pickerTracer] the consequence slot was written into ' +
      writes + ' time(s), expected exactly 1 BY COUNT. ⛔ A count, never an ' +
      'emptiness check: a sentence painted over is invisible to emptiness.');
  }
});

// ---------------------------------------------------------------------------
// (pickerFenceActs) ⛔ V3's ACTUAL REQUIREMENT, NOT ITS SYNTACTIC SHADOW.
//
// A picked entry that merely LOOKS like a path proves nothing. The string the
// picker emits is fed to the client-side surface that acts on roster entries —
// `collectFencedBasenames`, the bare-name belt that de-links a live wikilink
// door back into a private folder — and that surface is asserted to ACT on it,
// with the harvest printed BY VALUE beside its size.
//
// ⛔ IT LANDS HERE AND NOT IN PLAN 26.96-29, whose first task runs only if her
// D-C ruling admitted it. A property that rides on a decision she has not made
// is a property nothing holds. (She did rule it in — and this case stands
// either way, which is the point.)
//
// ⚠ THE SECOND SURFACE V3 NAMES, `study_lib._reflection_heavy`, IS PYTHON and
// is driven in tests/test_folder_enumeration.py, in the same plan, on the same
// nested fixture. ⛔ Recorded here so a reader does not conclude it was
// dropped.
// ---------------------------------------------------------------------------
group('pickerFenceActs (the string the picker emits is ACTED ON by the ' +
  'client-side fence surface, driven on the nested fixture)', function () {
  function harvest(rosterEntry, md) {
    const src =
      'var ROOM = { meta: { fenced_roster: ' +
        JSON.stringify([rosterEntry]) + ' } };' +
      'var REFLECTION_FENCED_ROSTER = ' + DEFAULT_ROSTER_SRC + ';' +
      // ⚠⚠ 26.96-29: `rosterSegments` JOINED THIS LIFT, AND IT HAD TO.
      // `collectFencedBasenames` now derives its pattern from the shipped
      // spelling of what an entry means instead of from the raw string, so a
      // lift carrying only the caller THREW `rosterSegments is not defined`
      // and this whole group proved nothing. ⛔ It was caught by the harness
      // saying so out loud and by reading that line — never by an exit
      // status. LIFT THE RULE, NOT JUST THE VERDICT.
      extractFn(APP_SRC, 'rosterSegments') + '\n' +
      extractFn(APP_SRC, 'reflectionActiveRoster') + '\n' +
      extractFn(APP_SRC, 'collectFencedBasenames') + '\n' +
      'return collectFencedBasenames(MD);';
    return new Function('MD', src)(md);
  }
  // A live wikilink door pointing INTO the nested folder the picker offered.
  // ⚠ The linked note's own name is the folder's last segment, so a harvest
  // that acts on the emitted path NAMES THE FIXTURE'S FOLDER by value.
  const md = 'see [[' + PICKER_NESTED_PATH + '/chatgpt.md]] and nothing else';

  const got = harvest(PICKER_NESTED_PATH, md);
  const keys = Object.keys(got);
  console.log('  [pickerFenceActs] entry=' + JSON.stringify(PICKER_NESTED_PATH) +
    ' harvested=' + keys.length + ' ' + JSON.stringify(keys));
  if (!keys.length) {
    violations.push('[pickerFenceActs] ⛔ THE FENCE SURFACE DID NOT ACT ON ' +
      'THE PICKER\'S OWN STRING. The harvest is EMPTY for a document ' +
      'carrying a live door into the folder she just made private, so the ' +
      'link would render clickable: ' + JSON.stringify(md));
    return;
  }
  if (keys.indexOf('chatgpt') === -1) {
    violations.push('[pickerFenceActs] the harvest does not name the ' +
      'fixture\'s folder BY VALUE: ' + JSON.stringify(keys));
  }

  // ⛔⛔ THE CONTROL, IN THE SAME RUN — AND IT IS THE SECOND ONE THIS CASE
  // CARRIED, BECAUSE THE FIRST ONE WAS FALSE AND THE RUN SAID SO.
  //
  // ⚠ RECORDED RATHER THAN QUIETLY REPLACED. The first control asserted that
  // the LEAF name alone harvests NOTHING from the document above. It was
  // driven and printed `harvested=1 ["chatgpt"]` — the leaf DOES act on this
  // surface, because the belt matches `<entry>/<path>` at any position and the
  // leaf really is a path segment in that link. ⛔ The claim was wrong, not
  // the product; it was found by BUILDING THE ARM THAT SHOULD FAIL and
  // READING WHAT IT PRINTED rather than by assuming its verdict.
  //
  // The real discriminator — and the reason her entries must be PATHS — is
  // OVER-REACH, not under-reach: a leaf name catches every folder anywhere in
  // her vault that happens to share it. So the control now drives a door into
  // a DIFFERENT folder with the same last segment and demands the picker's
  // PATH leave it alone, while the leaf would sweep it in.
  const strayMd = 'see [[Personal/chatgpt/secret.md]] and nothing else';
  const byPath = Object.keys(harvest(PICKER_NESTED_PATH, strayMd));
  const byLeaf = Object.keys(
    harvest(PICKER_NESTED[PICKER_NESTED.length - 1], strayMd));
  console.log('  [pickerFenceActs/control] stray-door byPath=' +
    JSON.stringify(byPath) + ' byLeaf=' + JSON.stringify(byLeaf));
  if (byPath.length !== 0) {
    violations.push('[pickerFenceActs/control] the picker\'s PATH harvested ' +
      JSON.stringify(byPath) + ' from a door into a DIFFERENT folder that ' +
      'merely shares its last segment. The positive arm above is therefore ' +
      'not evidence that the path acted — this harvester acts on anything.');
  }
  if (byLeaf.length === 0) {
    violations.push('[pickerFenceActs/control] ⛔ BROKEN INSTRUMENT: the ' +
      'LEAF name harvested nothing from the stray door either, so the ' +
      'assertion above distinguishes nothing and the over-reach it claims ' +
      'to measure is not being measured at all.');
  }
});

// ===========================================================================
// 26.96-28 — THE PICKER'S REMAINING SHAPE: SHE TYPES, IT NARROWS, AND WHAT
// SHE TYPED IS STILL USABLE WHEN NOTHING MATCHES.
//
// ⛔ HER RULINGS, AND HOW THEY REACH THIS FILE. All TIER 2 — approved as
// shown. At the two sittings of 2026-08-22 an orchestrator wrote every
// question and every option label and SHE PICKED ONE; she typed no prose and
// wrote no sentence. ⛔ No comment, group name or violation text below may
// describe any of them as words she wrote cold.
//
//   D-B (shape)    one box: she types, it narrows the list, and what she
//                  typed is still usable when nothing matches
//   D-B (position) where the typing box is today
//   D-D            the new list is deliberately different to look at
//   S-3            the sentence for the state where nothing matches
//   S-4            NO NEW WORDS — the shipped `keep this private too`
//                  control acts on what she typed
//
// ⛔⛔ AND THE SILENCE IS HERS. Nothing on this page tells her that a typed
// name still works. That was put to her at a re-put with the combined cost
// shown and three specific repairs offered, and she chose "Keep all six as
// answered." ⛔ No group below may demand such a sentence, and none does.
// ===========================================================================

// ⛔ HER SENTENCE IS READ OUT OF HER OWN RECORD AT RUN TIME, from the ask she
// answered — never from a constant in this file and ⛔ never from the constant
// the renderer reads. A gate reading the renderer's own seat would certify an
// agent's edit of her sentence as correct, and a gate reading a re-typed
// literal here would go quietly stale the moment the record moved.
//
// ⚠ THE ANSWER TABLE IS DELIBERATELY NOT THE SOURCE. § 8 carries TWO rows
// whose first cell is `**S-3**` — the owed-list row in § 1 and the answer row
// in § 8 — and a reader taking "the first one" would pin the word **OWED**.
// The ASK section is unambiguous: it has exactly one `**SHE CHOSE:**`.
const COPY_ROUND_RECORD = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker/' +
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases/' +
  '26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-2026-07-31/' +
  '26.96-COPY-ROUND3.md');

function copyRoundChosen(askNo) {
  const src = fs.readFileSync(COPY_ROUND_RECORD, 'utf8');
  const at = src.indexOf('### ASK ' + askNo + ' ');
  if (at === -1) {
    throw new Error('ask ' + askNo + ' is not in ' + COPY_ROUND_RECORD +
      ' — this pin has no expectation and must not invent one');
  }
  const end = src.indexOf('\n### ', at + 5);
  const sec = src.slice(at, end === -1 ? src.length : end);
  const c = sec.indexOf('**SHE CHOSE:**');
  if (c === -1) {
    throw new Error('ask ' + askNo + ' records no answer of hers');
  }
  const m = /^> \*\*(.+?)\*\*/m.exec(sec.slice(c));
  if (!m || !m[1].length) {
    throw new Error('ask ' + askNo + "'s answer is EMPTY in her record");
  }
  return m[1];
}

// ⛔ EVERY READ OF HER RECORDS BELOW IS LAZY AND MEMOISED, AND THAT IS THE
// SAME DRILL FINDING THE SEED LIFT PAID FOR. A `const` initialised at module
// load THROWS OUTSIDE EVERY `guarded` WRAPPER: the file dies, all 77 groups
// stop being performed, and the output blames one missing shape. Read inside
// the group that needs it, a record this file cannot find is ONE loud
// violation with every other proof still reported.
function memo(fn) {
  let got = null;
  return function () {
    if (got === null) { got = { v: fn() }; }
    return got.v;
  };
}

// Ask 3 — what the page says when nothing on the list matches what she typed.
const s3NoMatch = memo(function () { return copyRoundChosen(3); });

// ⛔⛔ HER REAL SIX, READ OUT OF THE PHASE RECORD AT RUN TIME AND ⛔ NEVER
// TYPED INTO THIS FILE. Two of them sit INSIDE another folder and two name
// places her vault does not contain at any depth — which is precisely why a
// picker that showed only what the enumeration offers would delete four of her
// six rows from view.
//
// ⛔⛔ THE REASON THEY ARE READ RATHER THAN TYPED IS A PRIVACY RULE OF THIS
// REPO, AND IT WAS FOUND BY RUNNING THE GATE RATHER THAN BY REMEMBERING IT.
// THREE of her six folder names are DENY patterns in `tools/stage_public.py`
// — wave 26.91-39 deliberately renamed them OUT of this tree, and the deny
// list is the braces to that rename's belt. A first version of this fixture
// typed all three back in. The publisher's REDACT pass would have quietly
// rewritten them and the gate would have stayed green, so nothing would ever
// have said so — which is exactly the shape of a guard nobody looks at again.
// ⛔ Reading her record instead means this tree carries none of them, the
// fixture is HER ROSTER rather than a re-typed copy of it, and the redactor
// has nothing to rewrite.
//
// ⚠ THE LIST IS READ, NEVER PROMOTED: it is her roster as 26.96-UAT.md
// recorded it, and this file says so rather than treating it as measured.
const PHASE_DIR = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker/' +
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases/' +
  '26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-2026-07-31');

function herRealSixFromRecord() {
  const src = fs.readFileSync(path.join(PHASE_DIR, '26.96-UAT.md'), 'utf8');
  const m = /roster_in_the_clone_at_start:[\s\S]*?(\[[\s\S]*?\])/.exec(src);
  if (!m) {
    throw new Error('her roster is not in 26.96-UAT.md in a readable shape — ' +
      'this fixture has no subject and must not invent one');
  }
  const got = JSON.parse(m[1].replace(/\s+/g, ' '));
  if (!Array.isArray(got) || got.length !== 6) {
    throw new Error('26.96-UAT.md records ' + (got && got.length) +
      ' roster entr(ies), not the six this fixture is about');
  }
  return got;
}

// ⛔ WHICH TWO NAME NOTHING IS READ FROM THE MEASUREMENT THAT ESTABLISHED IT,
// never asserted here: 26.96-30-MEASUREMENTS.md § 5 drove each of her six
// against the real tree at that head and marked two of them as naming no
// place at any depth.
function herAbsentFromRecord() {
  const src = fs.readFileSync(
    path.join(PHASE_DIR, '26.96-30-MEASUREMENTS.md'), 'utf8');
  const re = /^\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|([^|]*)\|/gm;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    if (/NO\b/.test(m[2])) { out.push(m[1]); }
  }
  return out;
}

const herRoster = memo(function () {
  const six = herRealSixFromRecord();
  // ⚠ DERIVED, not listed: "sits inside another folder" IS carrying a path
  // separator, and deriving it means the parts can never drift from the six.
  const nested = six.filter(function (e) { return e.indexOf('/') !== -1; });
  const absent = herAbsentFromRecord().filter(function (e) {
    return six.indexOf(e) !== -1;
  });
  // ⛔ HER TWO THAT A TOP-LEVEL ENUMERATION CAN REACH — derived from the two
  // reads above rather than typed, so the offered fixture cannot drift either.
  const reachable = six.filter(function (e) {
    return nested.indexOf(e) === -1 && absent.indexOf(e) === -1;
  });
  if (nested.length !== 2 || absent.length !== 2 || reachable.length !== 2) {
    throw new Error('her six did not split 2 nested / 2 naming nothing / 2 ' +
      'reachable — the records disagree and this fixture must not paper over ' +
      'it (nested=' + nested.length + ' absent=' + absent.length +
      ' reachable=' + reachable.length + ')');
  }
  return { six: six, nested: nested, absent: absent, reachable: reachable };
});

// ---------------------------------------------------------------------------
// THE READERS. ⛔ DELIBERATELY LOCATION-AGNOSTIC, so this file states a
// property of the PRODUCT ("the picker offers these names") rather than a
// property of one implementation of it. Before the filter landed the offered
// rows sat in the editor's own markup; a list that narrows has to be
// repainted without destroying the field she is typing into, so they now sit
// in the editor's `.vault-roster-choices` child. Both are read here.
// ---------------------------------------------------------------------------
function pickerRowsOf(editor) {
  if (!editor) { return []; }
  const own = editor.querySelectorAll('.vault-roster-choice');
  if (own.length) { return own; }
  const kid = editor.kids ? editor.kids['vault-roster-choices'] : null;
  return kid ? kid.querySelectorAll('.vault-roster-choice') : [];
}

function pickerValuesOf(editor) {
  return pickerRowsOf(editor).map(function (r) {
    return decodeAttr(r.getAttribute('data-folder'));
  });
}

function rosterValuesOf(editor) {
  if (!editor) { return []; }
  return editor.querySelectorAll('.vault-roster-remove').map(function (r) {
    // ⛔ DECODED, because one of her own six carries an `&`. A reader that
    // skipped this reported `medical &amp; health notes` as a MISSING row —
    // a broken instrument accusing a working product, found by driving it.
    return decodeAttr(r.getAttribute('data-folder'));
  });
}

// The no-match state's own sentence, read out of the rendered bytes. ⛔ Read
// WHOLE — from the element's opening tag to its close — because "her sentence
// is IN the output" is satisfied by a sentence with something welded onto it,
// and that exact defect has already shipped on this pane once.
function noMatchSaid(editor) {
  const m = /<p class="vault-roster-nomatch"[^>]*>([\s\S]*?)<\/p>/
    .exec(rendered(editor));
  return m ? m[1] : null;
}

// ⛔ THE ONE BOX. Her D-B ruling is that the field she types a folder name
// into is the same field that narrows the list, so this drives the SHIPPED
// add field and fires a real input event on it.
function typeInto(where, editor, text) {
  const f = editor ? editor.querySelector('.vault-roster-add-input') : null;
  if (!f) {
    violations.push('[' + where + '] the shipped add field is not in the ' +
      'pane, so nothing could be typed and nothing below is evidence');
    return null;
  }
  f.type(text);
  return f;
}

// ---------------------------------------------------------------------------
// (pickerFilter) SHE TYPES, IT NARROWS — AND IT NARROWS NOTHING ELSE.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? No — it was driven at the plan's
//      entry head, where no input handler exists at all, and the offered list
//      stayed at three rows for every query. Recorded in the SUMMARY.
//  (2) Can it still pass once deliberately broken? No — a filter that also
//      touched her own roster rows is caught by the second half, which
//      compares her rows BY VALUE across the keystroke.
//  (3) Does a degenerate implementation satisfy it? No — a filter that simply
//      emptied the list is caught by the multi-hit query and by the arm that
//      clears the box and demands the whole answer back.
//  (4) Is it reading evaluation order or source order? EVALUATION ORDER: a
//      real input event is fired on the shipped field and the rows are read
//      back off the rendered output.
//  (5) Could a grep match the fix's own comment? There is no grep here.
// ---------------------------------------------------------------------------
group('pickerFilter (typing narrows the OFFERED list and narrows nothing ' +
  'else)', function () {
  const d = drivePane(R3);
  if (!d.editor) {
    violations.push('[pickerFilter] the pane never created its editor ' +
      'container — nothing was driven and nothing is evidence');
    return;
  }
  const before = pickerValuesOf(d.editor);
  const rosterBefore = rosterValuesOf(d.editor);
  console.log('  [pickerFilter/at-rest] offered=' + before.length + ' ' +
    JSON.stringify(before) + ' herRows=' + rosterBefore.length + ' ' +
    JSON.stringify(rosterBefore));
  if (before.length !== PICKER_CHOICES.length) {
    violations.push('[pickerFilter] before anything was typed the picker ' +
      'offered ' + before.length + ' row(s) for a ' + PICKER_CHOICES.length +
      '-entry answer — the drive never reached a working picker, so every ' +
      'narrowing verdict below would be a reading of nothing');
    return;
  }

  // ONE HIT.
  if (!typeInto('pickerFilter', d.editor, 'chatgpt')) { return; }
  const one = pickerValuesOf(d.editor);
  const herRows = rosterValuesOf(d.editor);
  console.log('  [pickerFilter/one] typed="chatgpt" offered=' + one.length +
    ' ' + JSON.stringify(one) + ' herRows=' + herRows.length + ' ' +
    JSON.stringify(herRows));
  if (one.length !== 1 || one[0] !== PICKER_NESTED_PATH) {
    violations.push('[pickerFilter] ⛔ TYPING DID NOT NARROW THE OFFERED ' +
      'LIST. After typing "chatgpt" the picker offers ' +
      JSON.stringify(one) + ', expected exactly [' +
      JSON.stringify(PICKER_NESTED_PATH) + '] BY VALUE. Her D-B ruling is ' +
      'ONE BOX: she types and it narrows the list.');
  }

  // ⛔ AND HER OWN LIST IS NOT A THING THAT NARROWS. Two lists sit on one
  // pane and they are different things: the offered names may be filtered,
  // her private folders may never be. Four of her six real entries are not
  // on any offered list at all, so a filter that reached her rows would
  // delete real protection from view.
  if (JSON.stringify(herRows) !== JSON.stringify(R3)) {
    violations.push('[pickerFilter] ⛔ THE FILTER REACHED HER OWN PRIVATE ' +
      'FOLDERS. Her rows read ' + JSON.stringify(herRows) + ' after a ' +
      'keystroke, expected ' + JSON.stringify(R3) + ' BY VALUE. The offered ' +
      'list and her list are two different things on one pane, and only one ' +
      'of them is hers.');
  }

  // SEVERAL HITS — a filter that always narrowed to one would satisfy the
  // arm above and be wrong.
  if (!typeInto('pickerFilter', d.editor, 'journal')) { return; }
  const many = pickerValuesOf(d.editor);
  console.log('  [pickerFilter/many] typed="journal" offered=' + many.length +
    ' ' + JSON.stringify(many));
  if (many.length !== 2 ||
      many.indexOf('Clippings/journal') === -1 ||
      many.indexOf(PICKER_NESTED_PATH) === -1) {
    violations.push('[pickerFilter] a query matching TWO offered names ' +
      'produced ' + JSON.stringify(many) + ', expected both ' +
      '"Clippings/journal" and ' + JSON.stringify(PICKER_NESTED_PATH) +
      ' BY VALUE — a filter that always narrows to one row is not a filter.');
  }

  // AND CLEARING THE BOX GIVES THE WHOLE ANSWER BACK. ⛔ The control that
  // refuses a "filter" that merely deletes rows as she types.
  if (!typeInto('pickerFilter', d.editor, '')) { return; }
  const back = pickerValuesOf(d.editor);
  console.log('  [pickerFilter/cleared] typed="" offered=' + back.length +
    ' ' + JSON.stringify(back));
  if (back.length !== PICKER_CHOICES.length) {
    violations.push('[pickerFilter] clearing the box left ' + back.length +
      ' offered row(s) of ' + PICKER_CHOICES.length + ' — a list that never ' +
      'comes back is a list she can only ever shrink.');
  }
});

// ---------------------------------------------------------------------------
// (pickerNoMatch) THE STATE WHERE NOTHING MATCHES, IN HER WORDS — AND TRUE OF
// BOTH THINGS THE ROOM CANNOT TELL APART.
//
// ⛔ THE MEASURED FACT THIS RESTS ON: the room cannot tell a name she mistyped
// from a real folder nothing has come from yet. So the sentence must be true
// of both, and it may not accuse her of anything. Both cases are DRIVEN, and
// the two rendered sentences are compared to each other — if the product ever
// starts telling them apart, this goes red rather than going quiet.
// ---------------------------------------------------------------------------
group('pickerNoMatch (nothing matches: her sentence, whole, and true of a ' +
  'mistyped name AND of a real folder nothing has come from yet)',
  function () {
    const S3_NO_MATCH = s3NoMatch();
    // ⚠ THE SECOND CASE IS NOT A TYPO. A folder holding no importable file
    // anywhere beneath it is not offered at all (26.96-27 recorded that
    // narrowing by name), so a real folder of hers can be absent from the
    // list with nothing wrong anywhere.
    const CASES = [
      ['a name she mistyped', 'Jouranl'],
      ['a real folder nothing has come from yet', 'Recipes']
    ];
    // ⛔ NO SENTENCE MAY ACCUSE HER. The room does not know which of the two
    // cases it is in, so a word implying the fault is hers is a word it
    // cannot have earned.
    const ACCUSING = ['wrong', 'invalid', 'error', 'mistake', 'mistyped',
      'not found', 'no such', "doesn't exist", 'does not exist', 'check the',
      'try again', 'sorry'];
    const said = [];
    CASES.forEach(function (c) {
      const d = drivePane(R3);
      if (!d.editor) {
        violations.push('[pickerNoMatch] (' + c[0] + ') the pane never ' +
          'created its editor container');
        return;
      }
      if (pickerValuesOf(d.editor).length !== PICKER_CHOICES.length) {
        violations.push('[pickerNoMatch] (' + c[0] + ') the picker was not ' +
          'offering anything before the keystroke, so a no-match state ' +
          'below would be a reading of a picker that never worked');
        return;
      }
      if (!typeInto('pickerNoMatch', d.editor, c[1])) { return; }
      const rows = pickerValuesOf(d.editor);
      const line = noMatchSaid(d.editor);
      console.log('  [pickerNoMatch/' + c[1] + '] offered=' + rows.length +
        ' ' + JSON.stringify(rows) + ' said=' + JSON.stringify(line));
      if (rows.length !== 0) {
        violations.push('[pickerNoMatch] (' + c[0] + ') typing ' +
          JSON.stringify(c[1]) + ' left ' + rows.length + ' offered row(s) ' +
          JSON.stringify(rows) + ' — this is not the no-match state at all, ' +
          'so the sentence verdict below is about the wrong screen');
        return;
      }
      if (line === null) {
        violations.push('[pickerNoMatch] ⛔ (' + c[0] + ') THE PAGE SAYS ' +
          'NOTHING AT ALL when nothing matches what she typed. Her S-3 ' +
          'answer of 2026-08-22 (TIER 2, chosen from agent-written labels) ' +
          'is ' + JSON.stringify(S3_NO_MATCH) + ' and it is owed HERE — a ' +
          'list that silently empties reads as a dead end.');
        return;
      }
      // ⛔ EQUALITY, NEVER CONTAINMENT. A count or a nudge welded onto the
      // end of her sentence survives every containment check, and that
      // exact defect has shipped on this pane before.
      if (line !== S3_NO_MATCH) {
        violations.push('[pickerNoMatch] (' + c[0] + ') the no-match line ' +
          'is ' + JSON.stringify(line) + ', and her answer — read from ' +
          '26.96-COPY-ROUND3.md § 8 ask 3, never from the constant the ' +
          'renderer reads — is ' + JSON.stringify(S3_NO_MATCH) + '. ⛔ Her ' +
          'sentence is the WHOLE of what this slot may say.');
      }
      const low = String(line).toLowerCase();
      ACCUSING.forEach(function (w) {
        if (low.indexOf(w) !== -1) {
          violations.push('[pickerNoMatch] (' + c[0] + ') the no-match line ' +
            'carries ' + JSON.stringify(w) + '. ⛔ The room CANNOT TELL a ' +
            'name she mistyped from a real folder nothing has come from ' +
            'yet — measured, not assumed — so a word putting the fault on ' +
            'her is a word it has not earned: ' + JSON.stringify(line));
        }
      });
      said.push(line);
    });
    // ⛔ AND THE TWO CASES SAID THE SAME THING. The moment the product starts
    // telling them apart it is claiming knowledge it does not have.
    if (said.length === 2 && said[0] !== said[1]) {
      violations.push('[pickerNoMatch] ⛔ THE ROOM SAID TWO DIFFERENT ' +
        'THINGS: ' + JSON.stringify(said[0]) + ' for a mistyped name and ' +
        JSON.stringify(said[1]) + ' for a real folder nothing has come from ' +
        'yet. It cannot tell them apart, so it may not speak as if it can.');
    }
  });

// ---------------------------------------------------------------------------
// (pickerFallThrough) WHAT SHE TYPED IS STILL USABLE WHEN NOTHING MATCHES —
// AND THE THING THAT USES IT IS THE CONTROL THAT WAS ALREADY THERE.
//
// ⛔⛔ PROVED BY COUNTING WRITES, NEVER BY CHECKING THAT A FIELD EMPTIED. A
// field that clears itself and writes nothing satisfies every emptiness check
// on this pane, and this phase already carries a recorded instance of a
// sentence rendered and immediately painted over — invisible to exactly that
// kind of check.
//
// ⛔ HER S-4 ANSWER IS A BEHAVIOUR AND A PROHIBITION AT ONCE: the shipped
// `keep this private too` control acts on the typed name, and NO NEW CONTROL
// APPEARS. Both halves are asserted here, the second by comparing the pane's
// whole interactive vocabulary against the shipped one BY VALUE.
// ---------------------------------------------------------------------------
group('pickerFallThrough (a typed name matching nothing reaches the SHIPPED ' +
  'roster route, through the control that was already on the page)',
  function () {
    const HER_SIX_ABSENT = herRoster().absent;
    // One of her own two entries that name nothing in her vault at any
    // depth — the case her fall-through exists for, not a synthetic one.
    const TYPED = HER_SIX_ABSENT[0];
    const d = drivePane(R3, retroYes(R3, R3.concat([TYPED])));
    if (!d.editor) {
      violations.push('[pickerFallThrough] the pane never created its ' +
        'editor container');
      return;
    }
    // THE VOCABULARY BEFORE, so "no new control" is a comparison and not a
    // sentence. ⛔ Derived from the rendered surface, never typed.
    const vocabBefore = hcDescriptors(rendered(d.editor)).slice().sort();
    if (!typeInto('pickerFallThrough', d.editor, TYPED)) { return; }
    const rows = pickerValuesOf(d.editor);
    const line = noMatchSaid(d.editor);
    console.log('  [pickerFallThrough/typed] typed=' + JSON.stringify(TYPED) +
      ' offered=' + rows.length + ' said=' + JSON.stringify(line));
    if (rows.length !== 0) {
      violations.push('[pickerFallThrough] ' + JSON.stringify(TYPED) +
        ' matched ' + rows.length + ' offered row(s) ' + JSON.stringify(rows) +
        ' — this is not the fall-through state and nothing below is about it');
      return;
    }
    const vocabAfter = hcDescriptors(rendered(d.editor)).slice().sort();
    console.log('  [pickerFallThrough/vocabulary] before=' +
      vocabBefore.length + ' after=' + vocabAfter.length + ' ' +
      JSON.stringify(vocabAfter));
    // ⛔ HER S-4 RULING: NO NEW WORDS AND NO NEW CONTROL. The no-match state
    // may lose the offered rows; it may not GROW a control.
    const grew = vocabAfter.filter(function (x) {
      return vocabBefore.indexOf(x) === -1;
    });
    if (grew.length) {
      violations.push('[pickerFallThrough] ⛔ THE NO-MATCH STATE GREW A NEW ' +
        'CONTROL: ' + JSON.stringify(grew) + '. Her ask-4 answer of ' +
        '2026-08-22 (TIER 2) is NO NEW WORDS — the shipped "keep this ' +
        'private too" control acts on the name she typed, and nothing is ' +
        'added beside it.');
    }
    const add = d.editor.querySelector('.vault-roster-add');
    const field = d.editor.querySelector('.vault-roster-add-input');
    if (!add || !field) {
      violations.push('[pickerFallThrough] ⛔ THE SHIPPED ADD CONTROL IS ' +
        'GONE in the no-match state, so what she typed has nothing to act ' +
        'on it at all.');
      return;
    }
    if (String(field.value) !== TYPED) {
      violations.push('[pickerFallThrough] the shipped field no longer ' +
        'holds what she typed (' + JSON.stringify(String(field.value)) +
        ' vs ' + JSON.stringify(TYPED) + ') — a filter that eats her typing ' +
        'takes the fall-through with it.');
    }
    const before = d.s.calls.post.length;
    add.fire();
    const posted = d.s.calls.post.slice(before);
    const urls = posted.map(function (p) { return p.url; });
    console.log('  [pickerFallThrough/press] posts=' + posted.length + ' ' +
      JSON.stringify(posted));
    // ⛔ A COUNT COMPARED TO AN INTEGER. Never "the field emptied", never
    // "something happened".
    const rosterPosts = posted.filter(function (p) {
      return p.url === '/api/librarian/roster';
    });
    if (rosterPosts.length !== 1) {
      violations.push('[pickerFallThrough] ⛔ THE TYPED NAME DID NOT REACH ' +
        'THE SHIPPED ROSTER ROUTE. Pressing "keep this private too" with ' +
        JSON.stringify(TYPED) + ' typed recorded ' + rosterPosts.length +
        ' post(s) to /api/librarian/roster, expected exactly 1 BY COUNT. ' +
        'Two of her own six private folders name places her vault does not ' +
        'contain at any depth and could ONLY ever have been made this way. ' +
        'URLs: ' + JSON.stringify(urls));
      return;
    }
    const body = rosterPosts[0].body || {};
    if (body.op !== 'add' || body.folder !== TYPED) {
      violations.push('[pickerFallThrough] the fall-through posted ' +
        JSON.stringify(body) + ', expected op "add" and folder ' +
        JSON.stringify(TYPED) + ' BY VALUE.');
    }
    // ⛔ AND NOWHERE ELSE, BY COUNT. /api/meta validates a roster and skips
    // the retroactive stamp; a second door here would reopen the hole
    // 26.4-01 closed.
    const metaHits = urls.filter(function (u) { return u === '/api/meta'; })
      .length;
    if (metaHits !== 0) {
      violations.push('[pickerFallThrough] the metadata route appears ' +
        metaHits + ' time(s), expected 0 BY COUNT: ' + JSON.stringify(urls));
    }
  });

// ---------------------------------------------------------------------------
// (herRealSix) HER OWN LIST IS NOT A THING THE PICKER MAY EDIT.
//
// ⛔ THE HARM THIS REFUSES, STATED BEFORE THE MECHANISM. Two of her six real
// private folders sit INSIDE another folder and two name places her vault does
// not contain at any depth (26.96-30-MEASUREMENTS.md § 5, measured at that
// head). A picker that showed only what the enumeration offers — or a filter
// that reached her rows on its way past — would delete FOUR OF HER SIX from
// view. Those four are not decoration: two of them could only ever have been
// made by typing, which is the fact her D-B ruling rests on.
//
// ⚠ THE FIXTURE IS READ, NOT MEASURED HERE. `HER_SIX` is her roster as
// 26.96-UAT.md recorded it. This file states that rather than promoting a read
// list into a measurement of its own.
//
// THE FIVE ANTI-VACUITY ANSWERS. (1) It fails loudly if the pane renders
// nothing. (2) Driven RED by filtering her rows down to the offered names —
// red on the nested entry AND on the absent one, printed. (3) A degenerate
// renderer that emitted no rows fails the count first. (4) EVALUATION ORDER —
// the rows are read off rendered output. (5) There is no grep here.
// ---------------------------------------------------------------------------
group('herRealSix (all six of her real private folders render — including ' +
  'the two nested and the two that name nothing — with the picker offering ' +
  'a list that holds none of them)', function () {
  const HER = herRoster();
  const HER_SIX = HER.six;
  const HER_SIX_NESTED = HER.nested;
  const HER_SIX_ABSENT = HER.absent;
  const HER_SIX_TOP_LEVEL_REAL = HER.reachable;
  // ⛔ THE OFFERED LIST IS DELIBERATELY A PARTIAL OVERLAP, AND THE SHAPE IS A
  // MEASURED ONE. It holds the TWO of her six a top-level enumeration can
  // reach — the shape her D-A ruling REJECTED (26.96-30-MEASUREMENTS.md § 5:
  // S1 expresses 2 of her 6) — plus two names that are not hers at all.
  // ⛔ THAT PARTIALITY IS THE POINT. A fixture holding none of her six would
  // make the plant drop all six at once, and "the gate went red" would not
  // show WHICH rows a picker deletes. With this one the plant keeps exactly
  // her two top-level entries and drops exactly the two nested and the two
  // that name nothing — which is the harm, named.
  const OFFERED = HER_SIX_TOP_LEVEL_REAL.map(function (e) { return [e]; })
    .concat([['Recipes'], ['Recipes', 'bread'], ['Letters']]);
  const d = drivePane(HER_SIX, undefined, OFFERED);
  if (!d.editor) {
    violations.push('[herRealSix] the pane never created its editor ' +
      'container — nothing was driven and nothing is evidence');
    return;
  }
  function report(where, ed) {
    const rows = rosterValuesOf(ed);
    const offered = pickerValuesOf(ed);
    console.log('  [herRealSix/' + where + '] herRows=' + rows.length + ' ' +
      JSON.stringify(rows) + ' offered=' + offered.length + ' ' +
      JSON.stringify(offered));
    // ⛔ NAMED, SO A LATER READER CAN SEE THIS GATE IS NOT PASSING ON FOUR
    // EASY ROWS. The two nested and the two that name nothing are the ones a
    // picker would silently drop.
    const missing = HER_SIX.filter(function (f) {
      return rows.indexOf(f) === -1;
    });
    if (missing.length) {
      violations.push('[herRealSix] ⛔ (' + where + ') ' + missing.length +
        ' OF HER SIX PRIVATE FOLDERS ARE NOT ON SCREEN: ' +
        JSON.stringify(missing) + '. Of her six, ' +
        JSON.stringify(HER_SIX_NESTED) + ' sit INSIDE another folder and ' +
        JSON.stringify(HER_SIX_ABSENT) + ' name places her vault does not ' +
        'contain at any depth — so an offered list can never hold them, and ' +
        'a picker that showed only what it offers would delete four of her ' +
        'six rows from view. Rendered rows: ' + JSON.stringify(rows));
    }
    if (rows.length !== HER_SIX.length) {
      violations.push('[herRealSix] (' + where + ') the pane rendered ' +
        rows.length + ' row(s) for her ' + HER_SIX.length + '-entry roster: ' +
        JSON.stringify(rows));
    }
    return rows;
  }
  const atRest = report('at-rest', d.editor);
  if (!atRest.length) { return; }
  // ⛔ AND WITH THE FILTER RUNNING. A filter that reached her list would show
  // itself here and nowhere else.
  if (!typeInto('herRealSix', d.editor, 'bread')) { return; }
  const filtered = report('while-filtering', d.editor);
  if (JSON.stringify(filtered) !== JSON.stringify(HER_SIX)) {
    violations.push('[herRealSix] ⛔ HER LIST CHANGED WHILE SHE WAS TYPING: ' +
      JSON.stringify(filtered) + ' vs ' + JSON.stringify(HER_SIX) +
      ' BY VALUE.');
  }
  // AND IN THE NO-MATCH STATE, which is the one that empties the offered box.
  if (!typeInto('herRealSix', d.editor, 'zzzz-nothing')) { return; }
  const noMatch = report('no-match', d.editor);
  if (JSON.stringify(noMatch) !== JSON.stringify(HER_SIX)) {
    violations.push('[herRealSix] ⛔ HER LIST CHANGED IN THE NO-MATCH ' +
      'STATE: ' + JSON.stringify(noMatch) + ' vs ' + JSON.stringify(HER_SIX) +
      ' BY VALUE. The offered box emptying is not permission to empty hers.');
  }
});

// ---------------------------------------------------------------------------
// (sentenceStillTrue) A SENTENCE IS CHECKED AGAINST THE BEHAVIOUR IT
// DESCRIBES, NOT AGAINST ITSELF.
//
// ⛔⛔ WHY THIS GROUP IS BUILT AS A DRIVE AND NOT AS A LIST. A copy gate made
// of literal string lists HAS NO STALENESS DETECTOR, and this project has a
// live instance: a sentence stayed green while the behaviour it described
// narrowed underneath it. Containment can only ever answer "is this sentence
// somewhere in the output" — which stays true long after it has stopped being
// true of anything.
//
// ⛔ SO EVERY SENTENCE IS DRIVEN BOTH WAYS: rendered in the state it describes
// AND asserted ABSENT from a state it does not. The ABSENCE half is the
// detector; the presence half is what a literal list already had.
//
// ⛔ THE EXPECTATIONS COME FROM HER RECORD, read at run time out of
// 26.96-COPY-ROUND3.md § 8 — never from the constants the renderer reads, and
// never re-typed here. All three are TIER 2: an orchestrator wrote every
// option label and she picked one.
//
// ⛔⛔ 26.96-34 — WHY THIS GROUP'S GREEN MEANT NOTHING ABOUT ONE WHOLE SCREEN,
// AND WHAT WAS ADDED. Until now every state above was driven through the
// MANAGE host, through a transport that ANSWERS folders. So the group was
// structurally incapable of seeing the state its own header is about: on the
// bringing-in screen the room does not yet know where her vault is BY
// CONSTRUCTION, the offered list can never fill, and two sentences she
// approved sat above it describing something that cannot happen there. ⛔ THE
// GATE RAN AND WAS GREEN WHILE THAT SHIPPED. Two arms close it — the IMPORT
// HOST, and the Manage host through a transport that REFUSES the folder
// route, which is what the import screen's 400 really is.
//
// ⭐ HER RULING R OF 2026-08-23 (⛔ TIER 2 — approved as shown; an agent wrote
// the question and the option labels, she picked one, she typed no prose):
//   Q: "On the screen where the room first offers to bring your vault in, the
//       private-folders list can never fill. What should that screen do with
//       the two lines you chose above it?"
//   SHE CHOSE: `Take the two lines off that screen`
// ⛔ So on the import host S1 and S5 are asserted ABSENT — and that is the
// ABSENCE half, the one a literal string list can never have.
// ⛔ ON THE REFUSING MANAGE HOST THEY ARE ASSERTED PRESENT, and that is HER
// RULING Q holding: she was asked what the page should SAY when the room
// finds nothing, never what it should STOP saying, and a refused read on a
// pane whose list CAN fill is a transient rather than a construction.
// ---------------------------------------------------------------------------
group('sentenceStillTrue (each picker sentence is present in the state it ' +
  'describes and ABSENT from a state it does not)', function () {
  const S3_NO_MATCH = s3NoMatch();
  const S1 = copyRoundChosen(1);
  const S5 = copyRoundChosen(5);
  const S3 = S3_NO_MATCH;
  // ⚠ Her ask-2 answer was UNCHANGED, so the shipped placeholder is pinned
  // by its own bytes out of her record's option label.
  const S2 = /"([^"]*)"/.exec(copyRoundChosen(2));
  const PLACEHOLDER = S2 ? S2[1] : null;
  if (!PLACEHOLDER) {
    violations.push('[sentenceStillTrue] ⛔ BROKEN INSTRUMENT: her ask-2 ' +
      'answer could not be read as a quoted string, so the "she changed ' +
      'nothing" pin has no expectation and must not invent one.');
  }

  // THE STATE MATRIX. ⛔ `true` = the sentence describes this state and must
  // be on screen; `false` = it does not, and must NOT be.
  const STATES = [
    { name: 'at-rest (folders offered, nothing typed)', typed: null,
      want: { S1: true, S5: true, S3: false } },
    { name: 'typing, and the list matched', typed: 'journal',
      want: { S1: true, S5: true, S3: false } },
    { name: 'typing, and nothing matched', typed: 'zzzz-nothing',
      want: { S1: true, S5: true, S3: true } }
  ];
  STATES.forEach(function (st) {
    const d = drivePane(R3);
    if (!d.editor) {
      violations.push('[sentenceStillTrue] (' + st.name + ') the pane never ' +
        'created its editor container');
      return;
    }
    if (st.typed !== null && !typeInto('sentenceStillTrue', d.editor,
      st.typed)) { return; }
    const markup = rendered(d.editor);
    if (!markup.length || markup.indexOf('Journal') === -1) {
      violations.push('[sentenceStillTrue] (' + st.name + ') nothing ' +
        'recognisable rendered, so every absence below would pass on ' +
        'nothing');
      return;
    }
    const offered = pickerValuesOf(d.editor).length;
    console.log('  [sentenceStillTrue/' + st.name + '] offered=' + offered +
      ' S1=' + (markup.indexOf(S1) !== -1) +
      ' S5=' + (markup.indexOf(S5) !== -1) +
      ' S3=' + (markup.indexOf(S3) !== -1));
    [['S1', S1], ['S5', S5], ['S3', S3]].forEach(function (pair) {
      const there = markup.indexOf(pair[1]) !== -1;
      const want = st.want[pair[0]];
      if (there === want) { return; }
      if (want) {
        violations.push('[sentenceStillTrue] ⛔ ' + pair[0] + ' IS MISSING ' +
          'FROM THE STATE IT DESCRIBES (' + st.name + '). Her answer, read ' +
          'from 26.96-COPY-ROUND3.md § 8: ' + JSON.stringify(pair[1]));
      } else {
        violations.push('[sentenceStillTrue] ⛔ ' + pair[0] + ' IS ON SCREEN ' +
          'IN A STATE IT DOES NOT DESCRIBE (' + st.name + '): ' +
          JSON.stringify(pair[1]) + '. ⛔ THIS IS THE HALF A LITERAL STRING ' +
          'LIST CANNOT SEE — the sentence is present, so containment is ' +
          'happy, and it is saying something that is not true here.');
      }
    });
    // ⛔ AND HER PLACEHOLDER IS BYTE-UNTOUCHED IN EVERY STATE. Her ask-2
    // answer was NO CHANGE, and a no-change answer with no gate is
    // indistinguishable from nobody having asked.
    if (PLACEHOLDER && markup.indexOf(PLACEHOLDER) === -1) {
      violations.push('[sentenceStillTrue] (' + st.name + ') the shipped ' +
        'placeholder her ask-2 answer left UNCHANGED is not on screen ' +
        'byte-exact: ' + JSON.stringify(PLACEHOLDER));
    }
  });

  // ⛔⛔ THE TWO ARMS THAT CLOSE THE BLINDNESS. Each is DRIVEN, and each
  // prints a verdict PER SENTENCE, PER HOST, PER TRANSPORT, by name.
  const HOSTS = [
    { name: 'import host / answering transport (the bringing-in screen)',
      // ⛔ HER RULING R: the block is off this screen, so neither of her two
      // picker sentences is there — and S3 cannot be either, because the box
      // it is written into is part of the same block.
      drive: function () { return driveImport(R3); },
      want: { S1: false, S5: false, S3: false } },
    { name: 'Manage host / REFUSING transport (the folder route answers not-ok)',
      // ⛔ HER RULING Q: a read that did not succeed does not make the room
      // say anything about her vault — and it does not take her sentences
      // away either. The list on THIS pane can fill; it did not this time.
      drive: function () { return drivePane(R3, refusingRoster(R3), []); },
      want: { S1: true, S5: true, S3: false } }
  ];
  HOSTS.forEach(function (h) {
    const d = h.drive();
    if (!d.editor) {
      violations.push('[sentenceStillTrue] (' + h.name + ') the host never ' +
        'created its editor container — nothing was driven and nothing ' +
        'below is evidence');
      return;
    }
    const markup = rendered(d.editor);
    if (!markup.length || markup.indexOf('Journal') === -1) {
      violations.push('[sentenceStillTrue] (' + h.name + ') nothing ' +
        'recognisable rendered, so every absence below would pass on ' +
        'nothing');
      return;
    }
    const offered = pickerValuesOf(d.editor).length;
    [['S1', S1], ['S5', S5], ['S3', S3]].forEach(function (pair) {
      const there = markup.indexOf(pair[1]) !== -1;
      console.log('  [sentenceStillTrue/' + h.name + '] ' + pair[0] +
        '=' + there + ' want=' + h.want[pair[0]] + ' offered=' + offered);
      if (there === h.want[pair[0]]) { return; }
      if (h.want[pair[0]]) {
        violations.push('[sentenceStillTrue] ⛔ ' + pair[0] + ' IS MISSING ' +
          'FROM A STATE IT DESCRIBES (' + h.name + '). Her answer, read ' +
          'from 26.96-COPY-ROUND3.md § 8: ' + JSON.stringify(pair[1]) +
          '. ⛔ HER RULING R TOOK THESE TWO LINES OFF THE BRINGING-IN SCREEN ' +
          'AND OFF NOTHING ELSE — removing them anywhere they are still true ' +
          'is an agent overriding her.');
      } else {
        violations.push('[sentenceStillTrue] ⛔ ' + pair[0] + ' IS ON SCREEN ' +
          'IN A STATE IT DOES NOT DESCRIBE (' + h.name + '): ' +
          JSON.stringify(pair[1]) + '. ⛔ THIS IS THE STATE THAT SHIPPED ' +
          'WHILE THIS GROUP WAS GREEN: the list these lines describe can ' +
          'never fill on the bringing-in screen, and she ruled on ' +
          '2026-08-23 that they come off it.');
      }
    });
    // ⛔ AND THE POSITIVE CONTROL IN THE SAME ARM: the editor really is there
    // and really did render her add row. Without it an arm that rendered a
    // bare list would satisfy every absence above and prove nothing.
    if (PLACEHOLDER && markup.indexOf(PLACEHOLDER) === -1) {
      violations.push('[sentenceStillTrue] ⛔ THE POSITIVE CONTROL FAILED (' +
        h.name + '): the shipped placeholder her ask-2 answer left UNCHANGED ' +
        'is not on screen byte-exact, so the absences above are absences ' +
        'over nothing: ' + JSON.stringify(PLACEHOLDER));
    }
  });

  // ⚠⚠ A FOURTH STATE, DRIVEN AND PRINTED AND DELIBERATELY NOT ASSERTED.
  // With the enumeration answering NOTHING — the room could not read her
  // vault at that moment, so the offered list cannot fill — the picker still
  // says "choose a folder" and still says what the list reaches, above a box
  // that is there and empty.
  //
  // ⛔⛔ 26.96-39: WHY THIS IS STILL PRINTED AND STILL NOT A VERDICT — AND
  // WHY THE REASON IT USED TO GIVE IS QUOTED HERE RATHER THAN DELETED. It
  // read:
  //   > "her copy round was never asked about it (§ 8 ask 3 is about what
  //   > she TYPED), so turning it into a verdict would be an agent inventing
  //   > a requirement and then calling it hers."
  // ⛔ THAT WAS TRUE WHEN IT WAS WRITTEN AND HER SITTING OF 2026-08-23 MADE
  // IT FALSE. It is the same drift this phase keeps paying for — a true
  // sentence going stale under a later decision — so it is replaced in place
  // and quoted, never quietly dropped. She HAS now been asked about exactly
  // this state:
  //
  //   Q: "When the room can't read your vault at that moment, so the list of
  //       folders to pick from can't fill — what should that pane do with
  //       your two lines?"
  //   SHE CHOSE: `Say something else there`
  //   The cost she was shown: "it's a new line and doesn't exist yet — I'd
  //   come back with three or four candidates, each with its own cost, and
  //   you'd pick one the way you picked the others. That's a second sitting,
  //   not today."
  //
  // ⛔ TIER 2 — APPROVED AS SHOWN. An agent wrote the question and the option
  // labels and she picked one; she typed no prose. Recorded verbatim, with
  // the framing and both other options, in `26.96-DECISIONS.md` (RULING T).
  //
  // ⛔⛔ SO THE VERDICT IS OWED, NOT MISSING, AND THAT IS THE WHOLE REASON
  // THIS IS STILL A print(). The line she ruled for DOES NOT EXIST: no
  // candidate was shown to her, none was written, and ⛔ an agent may not
  // write one. 26.96-39 — the only plan in its round allowed to change what
  // this pane emits — STOPPED HERE and routed a candidate sitting instead of
  // inventing copy, so there is nothing whose presence could be asserted.
  // ⛔ TWO CANDIDATES ARE FORBIDDEN IN ANY SPELLING at that sitting: her
  // Ruling-Q sentence or any variant of it (it is about HER VAULT, and this
  // branch knows nothing about her vault), and any line telling her she can
  // still type a name — she was shown that wording and declined it twice.
  //
  // ⛔ WHAT IS ASSERTED TODAY IS THE HALF THAT IS ALREADY HERS: the arm
  // directly above drives the refusing transport and holds S1 and S5 PRESENT
  // on this pane. She was offered the option of taking them off for that
  // visit and did NOT take it, and her own register says so in as many words
  // (26.96-KNOWN-LIMITATIONS.md § 11). ⛔ Her RULING T authorised the pane
  // SAYING something, never the removal of anything she approved.
  const empty = drivePane(R3, undefined, []);
  if (empty.editor) {
    const m = rendered(empty.editor);
    console.log('  [sentenceStillTrue/NOTE-owed-to-her] with the enumeration ' +
      'answering NOTHING: offered=' + pickerValuesOf(empty.editor).length +
      ' S1-on-screen=' + (m.indexOf(S1) !== -1) +
      ' S5-on-screen=' + (m.indexOf(S5) !== -1) +
      ' S3-on-screen=' + (m.indexOf(S3) !== -1) +
      ' — ⛔ NOT A VERDICT YET: RULING T of 2026-08-23 — she ruled this ' +
      'pane should say something here, and the wording is owed to HER.');
  }
});

// ⛔ HER RULING-Q SENTENCE, READ OUT OF `26.96-DECISIONS.md` § *Round 3, part
// two* — the document this phase calls the primary record of her words. It is
// read by its own anchor (the ask's heading), so a rewording of the prose
// around it cannot silently change what this gate pins.
// ⛔ A RECORD THAT CANNOT BE READ IS A LOUD FAILURE, NEVER A SKIP: a gate that
// quietly stops having an expectation reports the same green as one that
// holds.
function rulingQSentence() {
  const src = fs.readFileSync(path.join(PHASE_DIR, '26.96-DECISIONS.md'),
    'utf8');
  const sec = src.indexOf('### RULING Q');
  if (sec === -1) {
    throw new Error('test_roster_pane: her Ruling Q is not in ' +
      '26.96-DECISIONS.md — this gate has no expectation and must not ' +
      'invent one');
  }
  const m = /\*\*SHE CHOSE:\*\*\s*\n\s*\n>\s*`([^`]+)`/.exec(src.slice(sec));
  if (!m) {
    throw new Error('test_roster_pane: her Ruling-Q answer is not in a ' +
      'readable shape in 26.96-DECISIONS.md');
  }
  return m[1];
}

// ---------------------------------------------------------------------------
// (emptyVaultSaysSo) ⭐ HER RULING Q OF 2026-08-22 — THE SENTENCE FOR THE
// STATE NOBODY HAD EVER ASKED HER ABOUT.
//
// ⛔ THIS GROUP EXISTS BECAUSE THE GROUP ABOVE REFUSED TO INVENT IT. 26.96-28
// drove the fourth state, PRINTED it as `[sentenceStillTrue/NOTE-owed-to-her]`
// and deliberately did NOT turn it into a verdict, because her copy round was
// asked only about what she TYPED. She has now been asked:
//
//   Q: "What should the page say when the room finds no folders at all in
//       your vault?"
//   SHE CHOSE: `No folders found in your vault.`
//   The cost she was shown: "Plain and true of the only cause. Cost: doesn't
//   say you can still type a name — consistent with the silence you chose."
//
// ⛔ TIER 2 — APPROVED AS SHOWN. An orchestrator wrote the question and the
// option labels and she picked one; she typed no prose. ⛔ Nothing may call
// this a sentence she wrote cold.
//
// ⛔ SHE WAS SHOWN, AND DECLINED, `No folders found — you can still type a
// name.` ⛔ NO DOCUMENT AND NO GATE MAY CLAIM SHE WANTED THE TYPED-NAME
// SILENCE BROKEN HERE. That silence is her own re-put-and-held ruling.
//
// ⛔⛔ THE DISCRIMINATOR IS "DID THE READ SUCCEED", NEVER "IS THE LIST
// EMPTY" — the same rule 26.96-10 and 26.96-15 had to establish twice on this
// very pane. A read that never happened, or one that COMPLETED WITH A NOT-OK
// ANSWER, must NOT make the room say it found no folders in her vault: that
// would be a false sentence about her vault built out of the room's own
// failure. Both arms are driven here, in one run, and the second is the one
// that can go quietly wrong.
//
// ⚠ SHE WILL NOT SEE THIS STATE. Her own vault holds 194 folders
// (26.96-30-MEASUREMENTS.md § 3). Someone whose notes all sit at the top
// level of their vault would. Recorded so the state is not mistaken for one
// of hers.
// ---------------------------------------------------------------------------
group('emptyVaultSaysSo (the room found no folders at all and says so — and ' +
  'only when it really did find out)', function () {
  // ⛔⛔ HER CHOSEN BYTES, READ OUT OF HER RECORD AT RUN TIME AND ⛔ NEVER
  // OUT OF THE RENDERER'S OWN CONSTANT. A sentence pinned against its own
  // source pins whatever that source currently says — this phase has already
  // shipped one gate that fed itself its own fixture and then asserted
  // against the literal it had typed (26.96-VALIDATION.md, audit finding 2).
  // ⛔ If the code and her record ever disagree, THE CODE IS WRONG.
  const NONE = rulingQSentence();
  const S1 = copyRoundChosen(1);
  const S5 = copyRoundChosen(5);

  // The room ASKED and the answer was an empty list. ⛔ Not the default
  // transport: that one answers this route with no `folders` key at all,
  // which is the room NOT FINDING OUT and is the second arm below.
  function answeredWith(folders) {
    return function (url) {
      if (url === '/api/adapter/vault-folder-paths') {
        return shippedThenable({ ok: true, status: 200,
          data: { ok: true, folders: folders } });
      }
      if (url === '/api/items') {
        return shippedThenable({ ok: true, status: 200,
          data: { meta: { fenced_roster: R3 } } });
      }
      return shippedThenable({ ok: true, status: 200,
        data: { fenced_roster: R3 } });
    };
  }

  // -- ARM 1: the room asked, the answer was NO FOLDERS, and it says so.
  const empty = drivePane(R3, answeredWith([]), []);
  if (!empty.editor) {
    violations.push('[emptyVaultSaysSo] the pane never created its editor ' +
      'container — nothing was driven and nothing below is evidence');
    return;
  }
  const m1 = rendered(empty.editor);
  const offered1 = pickerValuesOf(empty.editor).length;
  console.log('  [emptyVaultSaysSo/answered-empty] offered=' + offered1 +
    ' NONE-on-screen=' + (m1.indexOf(NONE) !== -1) +
    ' S1=' + (m1.indexOf(S1) !== -1) + ' S5=' + (m1.indexOf(S5) !== -1) +
    ' herRows=' + rosterValuesOf(empty.editor).length);
  if (offered1 !== 0) {
    violations.push('[emptyVaultSaysSo] ⛔ BROKEN INSTRUMENT: the picker ' +
      'offered ' + offered1 + ' folder(s) in the arm that is supposed to ' +
      'have none, so this arm is not measuring the empty-vault state at all.');
  } else if (m1.indexOf(NONE) === -1) {
    violations.push('[emptyVaultSaysSo] ⛔ HER RULING-Q SENTENCE IS MISSING ' +
      'FROM THE STATE IT DESCRIBES. The room asked, the answer was no ' +
      'folders at all, and the page says nothing about it: ' +
      JSON.stringify(NONE));
  }
  // ⛔ BYTE-EXACT. She chose the string, not its sense.
  if (m1.indexOf(NONE) !== -1) {
    const seat = /<p class="vault-roster-none"[^>]*>([\s\S]*?)<\/p>/
      .exec(m1);
    if (!seat) {
      violations.push('[emptyVaultSaysSo] the sentence is on screen but not ' +
        'in a seat of its own, so nothing can say WHERE it is said');
    } else if (seat[1] !== NONE) {
      violations.push('[emptyVaultSaysSo] the seat carries ' +
        JSON.stringify(seat[1]) + ', not her chosen bytes ' +
        JSON.stringify(NONE));
    }
  }
  // ⛔ AND HER SILENCE IS KEPT. She was shown and DECLINED a wording that
  // tells her she can still type a name. Nothing on this page may say it.
  if (/you can still type|still type a name|type it anyway/i.test(m1)) {
    violations.push('[emptyVaultSaysSo] ⛔ THE PAGE BROKE THE SILENCE SHE ' +
      'CHOSE. She declined "No folders found — you can still type a name." ' +
      'and held the same silence at a re-put.');
  }

  // -- ARM 2: THE ABSENCE HALF, AND THE ONE THAT GOES QUIETLY WRONG.
  // The read did NOT succeed — the route answered ok but carried no folder
  // list at all. The room has not found out anything about her vault, so it
  // may not say it found no folders in it.
  //
  // ⛔⛔ IT RENDERS TWICE, AND THAT IS A DRILL FINDING, NOT A STYLE CHOICE.
  // The first version rendered ONCE and reported GREEN against the very
  // mutation it exists to catch: a plant that marked the room as having FOUND
  // OUT on a read that did not succeed left this arm untouched, because the
  // flag flips inside the read's own `then` — AFTER that render's paint —
  // and nothing on the failing path repaints. So a pane that would say the
  // wrong sentence the next time anything drew it read as innocent here.
  // ⛔ Found by driving the plant and READING WHAT IT PRINTED, never by an
  // exit status. The second render is the state she would actually meet.
  const unknownScope = rosterScope(answering(R3), []);
  unknownScope.api.pane();                 // triggers the read
  unknownScope.api.pane();                 // the state she would then meet
  const unknownBox = unknownScope.dom('manage-sec-roster');
  const unknownEditor = unknownBox.kids['vault-roster-editor'] || null;
  if (!unknownEditor) {
    violations.push('[emptyVaultSaysSo/read-did-not-succeed] the pane never ' +
      'created its editor container, so this absence proves nothing');
  } else {
    // ⛔ LIVENESS FIRST: the room must really have ASKED. An arm where the
    // read never happened would report the same green as one where it
    // happened and was correctly disbelieved.
    const asked = unknownScope.calls.get.filter(function (u) {
      return u === '/api/adapter/vault-folder-paths';
    }).length;
    const m2 = rendered(unknownEditor);
    console.log('  [emptyVaultSaysSo/read-did-not-succeed] asked=' + asked +
      ' offered=' + pickerValuesOf(unknownEditor).length +
      ' NONE-on-screen=' + (m2.indexOf(NONE) !== -1));
    if (asked < 1) {
      violations.push('[emptyVaultSaysSo] ⛔ BROKEN INSTRUMENT: the pane ' +
        'never asked the enumeration route at all, so the absence below is ' +
        'an absence of a question rather than of an answer.');
    } else if (m2.indexOf(NONE) !== -1) {
      violations.push('[emptyVaultSaysSo] ⛔ THE ROOM SAID IT FOUND NO ' +
        'FOLDERS IN HER VAULT ON A READ THAT NEVER SUCCEEDED. The ' +
        'discriminator is DID THE READ SUCCEED, never IS THE LIST EMPTY — ' +
        'this pane has had to learn that twice already (26.96-10, 26.96-15).');
    }
  }

  // -- ARM 3: and it is absent from the state where folders ARE offered.
  const full = drivePane(R3);
  if (full.editor) {
    const m3 = rendered(full.editor);
    console.log('  [emptyVaultSaysSo/folders-offered] offered=' +
      pickerValuesOf(full.editor).length +
      ' NONE-on-screen=' + (m3.indexOf(NONE) !== -1));
    if (pickerValuesOf(full.editor).length === 0) {
      violations.push('[emptyVaultSaysSo] ⛔ BROKEN INSTRUMENT: the ' +
        'folders-offered arm offered nothing, so its absence proves nothing');
    } else if (m3.indexOf(NONE) !== -1) {
      violations.push('[emptyVaultSaysSo] ⛔ HER RULING-Q SENTENCE IS ON ' +
        'SCREEN IN A STATE IT DOES NOT DESCRIBE — folders WERE found.');
    }
  }
});

// ---------------------------------------------------------------------------
// (pickerSeedReach) THE ROSTER'S STRING SHAPE REACHES A SECOND SURFACE.
//
// The bringing-in screen's exclusion picker seeds from her private folders
// when it has no remembered list of its own, and its rule is PRESENCE, not
// truthiness: an ABSENT remembered list is a first open and seeds from the
// fence; a PRESENT one is her own earlier answer and wins EVEN WHEN IT IS
// EMPTY, so a re-open can never silently un-make a privacy choice with one
// tap. ⛔ A change to what the roster holds reaches that seed, so it is driven
// here rather than assumed harmless.
//
// ⚠ THE SEED EXPRESSION IS LIFTED FROM THE SHIPPED BYTES AND EVALUATED — not
// re-written here. A re-written rule would be this file agreeing with itself,
// and plant 6 (a truthiness test in place of the presence test) would never
// reach it.
// ---------------------------------------------------------------------------
// ⚠⚠ THE LIFT IS ANCHORED ON WHAT THE SEED IS *ABOUT*, NEVER ON THE RULE IT
// USES — AND THAT IS A DRILL FINDING, NOT A STYLE CHOICE. The first version
// anchored on the literal text `Array.isArray(meta.vault_excluded_folders)`,
// which is EXACTLY the text plant 6 replaces. Driven, the plant did not
// redden this gate: it made the lift THROW at module load, outside every
// `guarded` wrapper, and took the WHOLE FILE down with it — 77 groups
// silently stopped being performed while the output blamed a missing shape.
// ⛔ A gate that cannot survive the mutation it exists to catch is not a gate.
// It now finds the assignment by its SUBJECT (the remembered-exclusions key)
// and runs INSIDE the group, so a bad lift is a loud violation and every
// later proof still runs.
function liftSeedSrc() {
  const re = /\bvar kept = ([\s\S]*?);\n/g;
  const found = [];
  let m;
  while ((m = re.exec(APP_SRC)) !== null) {
    if (m[1].indexOf('vault_excluded_folders') !== -1) { found.push(m[1]); }
  }
  if (found.length !== 1) {
    throw new Error('test_roster_pane: the bringing-in screen\'s seed was ' +
      'found ' + found.length + ' time(s) in app.js — this gate has no ' +
      'single subject and must not invent one');
  }
  return found[0];
}

group('pickerSeedReach (the bringing-in screen\'s seed still behaves on ' +
  'PRESENCE, with the picker\'s string shape in play)', function () {
  const HER_SIX = herRoster().six;
  const SEED_SRC = liftSeedSrc();
  const seed = new Function('meta', 'VAULT_DEFAULT_ROSTER',
    'return (' + SEED_SRC + ');');
  const DEFAULTS = DEFAULT_NAMES;
  console.log('  [pickerSeedReach/source] ' +
    JSON.stringify(SEED_SRC.replace(/\s+/g, ' ').trim()));

  // (a) ⛔ THE CASE THE PRESENCE RULE EXISTS FOR: her own earlier answer was
  // "keep nothing out", and it must WIN over the fence.
  const a = seed({ vault_excluded_folders: [], fenced_roster: HER_SIX },
    DEFAULTS);
  console.log('  [pickerSeedReach/present-but-empty] kept=' +
    JSON.stringify(a));
  if (!Array.isArray(a) || a.length !== 0) {
    violations.push('[pickerSeedReach] ⛔ THE SEED READ TRUTHINESS, NOT ' +
      'PRESENCE. A remembered list that is PRESENT and EMPTY is her own ' +
      'earlier answer — "keep nothing out" — and it must win. It answered ' +
      JSON.stringify(a) + ' instead, which silently re-ticks folders she ' +
      'had already decided about and un-makes a privacy choice with one tap.');
  }

  // (b) NO REMEMBERED LIST AT ALL — a first open seeds from her fence, and
  // the fence it seeds from is HERS, picker-shaped entries included.
  const b = seed({ fenced_roster: HER_SIX }, DEFAULTS);
  console.log('  [pickerSeedReach/first-open] kept=' + JSON.stringify(b));
  if (JSON.stringify(b) !== JSON.stringify(HER_SIX)) {
    violations.push('[pickerSeedReach] a first open seeded ' +
      JSON.stringify(b) + ', expected her fence ' + JSON.stringify(HER_SIX) +
      ' BY VALUE.');
  }

  // (c) NEITHER — the shipped default.
  const c = seed({}, DEFAULTS);
  console.log('  [pickerSeedReach/nothing-known] kept=' + JSON.stringify(c));
  if (JSON.stringify(c) !== JSON.stringify(DEFAULTS)) {
    violations.push('[pickerSeedReach] with nothing known the seed answered ' +
      JSON.stringify(c) + ', expected the shipped default ' +
      JSON.stringify(DEFAULTS) + ' BY VALUE.');
  }

  // ⛔ AND THE PICKER'S OWN STRING SHAPE, CARRIED THROUGH THE SHIPPED ROW
  // BUILDER. A picked entry is a WHOLE PATH FROM THE VAULT ROOT, and that
  // shape has a measured consequence on this surface: it is LONGER than the
  // ancestor it sits under, so it cannot claim that ancestor — reading such
  // an entry as its first segment alone once fenced 1,921 things instead of
  // the 344 she asked for.
  const rowScope = new Function(
    extractFn(APP_SRC, 'rosterSegments') + '\n' +
    extractFn(APP_SRC, 'vaultPickerRows') + '\n' +
    'return vaultPickerRows;')();
  const FOLDERS = ['Clippings', 'Journal', 'Recipes'];
  const rows = rowScope(FOLDERS, [PICKER_NESTED_PATH], []);
  console.log('  [pickerSeedReach/shape] entry=' +
    JSON.stringify(PICKER_NESTED_PATH) + ' rows=' + JSON.stringify(rows));
  const byName = {};
  rows.forEach(function (r) { byName[r.name] = r; });
  if (!byName[PICKER_NESTED_PATH] || byName[PICKER_NESTED_PATH].kept !== true) {
    violations.push('[pickerSeedReach] ⛔ A PICKER-SHAPED ENTRY VANISHED ' +
      'FROM THE BRINGING-IN SCREEN. ' + JSON.stringify(PICKER_NESTED_PATH) +
      ' is claimed by no enumerated top-level folder, and an entry no folder ' +
      'claims must be SURFACED as its own kept-out row rather than dropped: ' +
      'a fence that quietly shrinks is worse than no seed at all. Rows: ' +
      JSON.stringify(rows));
  }
  if (!byName.Clippings || byName.Clippings.kept !== false) {
    violations.push('[pickerSeedReach] ⛔ A NESTED PICKER ENTRY KEPT ITS ' +
      'ANCESTOR OUT. ' + JSON.stringify(PICKER_NESTED_PATH) + ' is longer ' +
      'than "Clippings", so it cannot be a prefix of it and "Clippings" must ' +
      'stay ticked. Rows: ' + JSON.stringify(rows));
  }
});


// ===========================================================================
// 26.96-32 — A READ THAT DID NOT SUCCEED CHANGES NOTHING, AND A READ THAT DID
// CHANGES ONLY THE OFFERED LIST.
//
// ⚠⚠ READ THE HARM, NOT THE DIFF. `loadRosterFolderChoices` is documented, in
// its own comment, as "It reads; it never writes" — and until this wave its
// success path called `renderRosterHosts`, whose FIRST statement takes the
// pane's paint claim and whose THIRD writes a roster into MANAGE.meta. Two
// harms, both on the room's strongest privacy control:
//
//   (1) With nothing cached the call handed VAULT_DEFAULT_ROSTER over, so
//       four folder names the server was never asked about became the pane's
//       "last read". `paint()`'s discriminator is `blind = !readOk && !known`
//       and `known` IS that cache — so after ONE enumeration `blind` could
//       never be true again for the page session, and the no-read seat that
//       `readFailed` and 26.96-15's three arms all rest on was unreachable.
//       That is the door 26.96-21 closed, reopened one line above it.
//
//   (2) The enumeration is a walk of her whole vault issued from the pane's
//       FIRST render, so it lands late and it lands mid-write. The write it
//       overtook then found the surface owned by somebody else and said
//       NOTHING — and what it was carrying is her C4 sentence, the half
//       26.96-04 itself calls "the one that can quietly mislead".
//
// THE FIVE ANTI-VACUITY ANSWERS, for both groups below.
//  (1) Can they pass BEFORE the work is done? No. Both were driven against
//      the UNFIXED loader in a scratch mirror OUTSIDE this repo and their
//      failures are pasted verbatim into 26.96-32-SUMMARY.md: the cache arm
//      reporting the four VAULT_DEFAULT_ROSTER names BY VALUE, and both
//      ordering arms reporting a consequence-slot write count of 0.
//  (2) Can they still pass once deliberately broken? No — restoring the
//      `renderRosterHosts(...)` tail ALONE is exactly that mutation, and it
//      is the red run above.
//  (3) Does a degenerate implementation satisfy them? No, three times over.
//      The absence is asserted with hasOwnProperty BY VALUE — a falsiness
//      test would pass on `undefined` AND on `[]`, and `[]` is a poisoned
//      cache that says her fence is EMPTY. A positive control in the same
//      case (`offered=N`, N > 0) refuses a scope where the read never
//      landed. And a WRITE-PATH arm refuses a cache that could never be
//      written at all, which would make arm one pass for the wrong reason.
//  (4) Evaluation order or source order? EVALUATION. Every arm fires a real
//      control through the seam's own listener, settles real promises in a
//      chosen order, and reads the store and the rendered output back.
//  (5) Could a grep match the fix's own comment? There is no grep here.
// ===========================================================================

// The enumeration route, ANSWERED — plus the store read and the roster write,
// so a scope built on this is a whole working pane and not a stub with one
// live wire. ⛔ Deliberately NOT `answering`, which answers this route with no
// `folders` key at all: that is the room NOT FINDING OUT, and it is the arm
// `emptyVaultSaysSo` already drives.
function folderRouteAnswers(folders, fenced) {
  return function (url) {
    if (url === '/api/adapter/vault-folder-paths') {
      return shippedThenable({ ok: true, status: 200,
        data: { ok: true, folders: folders } });
    }
    if (url === '/api/items') { return metaAnswer(fenced); }
    return shippedThenable({ ok: true, status: 200,
      data: { fenced_roster: fenced } });
  };
}

group('readNeverSeedsRoster (a read of the folder route leaves the roster ' +
  'cache ABSENT BY VALUE — with a positive control and the write path as ' +
  'the arm that should fail)', function () {
  // -- ARM 1: THE READ. MANAGE.meta starts as {} in every scope this file
  // builds, so the key below can only be there because something WROTE it.
  const s = rosterScope(folderRouteAnswers(PICKER_CHOICES, R3), []);
  s.api.loadChoices();
  const meta = s.api.MANAGE.meta;
  const hasKey = Object.prototype.hasOwnProperty.call(meta, 'fenced_roster');
  const offered = s.api.offered();
  console.log('  [readNeverSeedsRoster/read] hasKey=' + hasKey +
    ' offered=' + offered.length + ' ' + JSON.stringify(offered) +
    ' cached=' + JSON.stringify(meta.fenced_roster));
  // ⛔ THE POSITIVE CONTROL, IN THE SAME CASE AND BEFORE THE VERDICT. A scope
  // where the read never landed would satisfy the absence assertion
  // vacuously, and this project has recorded 7 of 19 bare zero-assertions
  // passing for exactly that reason.
  if (offered.length !== PICKER_CHOICES.length) {
    violations.push('[readNeverSeedsRoster] ⛔ BROKEN INSTRUMENT: the read ' +
      'left ' + offered.length + ' offered entr(ies) for a ' +
      PICKER_CHOICES.length + '-entry answer, so the absence asserted below ' +
      'would be the absence of a READ rather than the absence of a write.');
    return;
  }
  if (hasKey) {
    violations.push('[readNeverSeedsRoster] ⛔ A READ-ONLY ROUTE SEEDED THE ' +
      'ROSTER CACHE. After one enumeration MANAGE.meta.fenced_roster holds ' +
      JSON.stringify(meta.fenced_roster) + ' BY VALUE, and the server was ' +
      'never asked about any of it. ⛔ Asserted with hasOwnProperty and ' +
      'NEVER with falsiness: `undefined` and `[]` are both falsy, and `[]` ' +
      'is a poisoned cache saying her fence is EMPTY. The harm is that ' +
      '`blind = !readOk && !known` can never be true again for the page ' +
      'session, so the pane can no longer reach the state where it says ' +
      'NOTHING about her list — the door 26.96-21 closed, reopened through ' +
      'a second one.');
  }

  // -- ARM 2: ⛔ THE ARM THAT SHOULD FAIL. The WRITE path — the one door that
  // is SUPPOSED to cache — is driven in the same group, so a cache that could
  // never be written at all cannot make arm one pass for the wrong reason.
  const w = rosterScope(folderRouteAnswers(PICKER_CHOICES, R3), []);
  const wMeta = w.api.MANAGE.meta;
  const wBefore = Object.prototype.hasOwnProperty.call(wMeta, 'fenced_roster');
  w.api.hosts(R3);
  const wAfter = Object.prototype.hasOwnProperty.call(wMeta, 'fenced_roster');
  console.log('  [readNeverSeedsRoster/write-path] hasKeyBefore=' + wBefore +
    ' hasKeyAfter=' + wAfter + ' cached=' +
    JSON.stringify(wMeta.fenced_roster));
  if (wBefore) {
    violations.push('[readNeverSeedsRoster] ⛔ BROKEN INSTRUMENT: this ' +
      'scope already carried a roster cache before anything wrote one, so ' +
      'neither arm of this group is reading what it claims to read.');
    return;
  }
  if (!wAfter ||
      JSON.stringify(wMeta.fenced_roster) !== JSON.stringify(R3)) {
    violations.push('[readNeverSeedsRoster] ⛔ THE ARM THAT SHOULD FAIL DID ' +
      'NOT FAIL: the WRITE path left the roster cache holding ' +
      JSON.stringify(wMeta.fenced_roster) + ', expected ' +
      JSON.stringify(R3) + ' BY VALUE. A cache nothing can ever write is a ' +
      'cache arm one proves nothing about.');
  }
});

// ---------------------------------------------------------------------------
// (readKeepsWriteClaim) A WRITE IN FLIGHT KEEPS ITS PAINT CLAIM WHEN THE
// ENUMERATION LANDS — IN BOTH SETTLE ORDERS.
//
// ⚠ THE ENUMERATION IS HELD, NOT ANSWERED SYNCHRONOUSLY, AND THAT IS THE
// WHOLE POINT. Under `shippedThenable` the read settles INSIDE the render
// that issued it and no interleaving is expressible at all — the same
// blindness 26.96-07 recorded when a 37-group green suite sat on top of a
// pane that erased its own failure line.
// ---------------------------------------------------------------------------

// Answers the store read synchronously (the pane must be painted and
// interactive) and HOLDS both the enumeration and every roster write, handing
// each one back to the case.
function heldWriteAndEnumeration(fencedBefore, folders) {
  const writes = [];
  const reads = [];
  const t = function (url, body) {
    if (url === '/api/items') { return metaAnswer(fencedBefore); }
    if (url === '/api/adapter/vault-folder-paths') {
      const h = heldThenable();
      reads.push(h);
      return h;
    }
    const h = heldThenable();
    writes.push({ h: h, body: body });
    return h;
  };
  t.writes = writes;
  t.reads = reads;
  t.folderAnswer = { ok: true, status: 200,
    data: { ok: true, folders: folders } };
  return t;
}

function drivePaneHeldEnumeration(where, fencedBefore) {
  const t = heldWriteAndEnumeration(fencedBefore, PICKER_CHOICES);
  const s = rosterScope(t, []);
  s.api.pane();
  const box = s.dom('manage-sec-roster');
  const editor = box.kids['vault-roster-editor'] || null;
  if (!editor) {
    violations.push('[' + where + '] the pane never created its editor ' +
      'container — nothing was driven and nothing below is evidence');
    return null;
  }
  nonEmptyNamed(where, editor.innerHTML, fencedBefore);
  if (t.reads.length !== 1) {
    violations.push('[' + where + '] the pane issued ' + t.reads.length +
      ' enumeration read(s), expected exactly 1 BY VALUE — there is no walk ' +
      'in the air to sequence and nothing below is evidence');
    return null;
  }
  if (t.reads[0].pending !== true) {
    violations.push('[' + where + '] the enumeration was meant to be IN ' +
      'FLIGHT at this point and has already settled — the interleaving this ' +
      'case describes did not happen');
    return null;
  }
  return { s: s, box: box, editor: editor, t: t };
}

// ⛔ THREE FIGURES, ALL VALUES, NEVER "present/absent": the roster on screen,
// the consequence slot's WRITE COUNT (a parent repaint RESETS a child rather
// than writing to it, so emptiness cannot answer "did the renderer run?"),
// and her sentence's presence.
function assertActSaidSo(where, d, expectedRoster, sentence, label) {
  const rows = rosterValuesOf(d.editor);
  const full = rendered(d.editor);
  const writes = consequenceWrites(d.editor);
  console.log('  [' + where + '] roster=' + rows.length + ' ' +
    JSON.stringify(rows) + ' consequenceWrites=' + writes + ' ' + label +
    '-on-screen=' + (full.indexOf(sentence) !== -1) + ' offered=' +
    pickerValuesOf(d.editor).length);
  if (JSON.stringify(rows) !== JSON.stringify(expectedRoster)) {
    violations.push('[' + where + '] the pane shows ' + JSON.stringify(rows) +
      ', expected the ROUTE\'S OWN ANSWER ' + JSON.stringify(expectedRoster) +
      ' BY VALUE. An enumeration landing beside a write may not decide what ' +
      'her fence looks like.');
  }
  if (writes !== 1) {
    violations.push('[' + where + '] the consequence slot was written into ' +
      writes + ' time(s), expected exactly 1 BY VALUE. ⛔ COUNTED, never ' +
      'checked for emptiness — a sentence painted over is invisible to an ' +
      'emptiness check, and a sentence never written is invisible to nothing ' +
      'else.');
  }
  if (full.indexOf(sentence) === -1) {
    violations.push('[' + where + '] ⛔ THE ROOM SAID NOTHING ABOUT WHAT HER ' +
      'ACT REACHED. The rendered pane does not carry ' +
      JSON.stringify(sentence) + ' byte-exactly. ⚠⚠ On the REMOVE half that ' +
      'is the sentence 26.96-04 calls the one that can quietly mislead: ' +
      'without it the pane goes on naming a folder as private after the ' +
      'librarian has been allowed to read it again. Rendered: ' +
      JSON.stringify(full.slice(0, 200)));
  }
}

group('readKeepsWriteClaim (a roster write in flight KEEPS its paint claim ' +
  'when the enumeration lands — both settle orders, with the accepted add ' +
  'as the mirror arm)', function () {
  // -- ORDER 1: the write is issued, THE ENUMERATION LANDS ON TOP OF IT, and
  // only then does the write settle. Under the unfixed loader the read had
  // taken the claim, so the write returned in silence and her C4 sentence was
  // never said at all.
  const a = drivePaneHeldEnumeration('readKeepsWriteClaim/enum-first', R3);
  if (a && fireRemove(a.editor, 'personnel notes',
    'readKeepsWriteClaim/enum-first')) {
    if (a.t.writes.length !== 1) {
      violations.push('[readKeepsWriteClaim/enum-first] ' +
        a.t.writes.length + ' roster write(s) reached the transport, ' +
        'expected exactly 1 BY VALUE');
    } else {
      a.t.reads[0].settle(a.t.folderAnswer);
      a.t.writes[0].h.settle(rosterAnswer(R_AFTER_REMOVE));
      assertActSaidSo('readKeepsWriteClaim/enum-first', a, R_AFTER_REMOVE,
        C4, 'C4');
    }
  }

  // -- ORDER 2: THE OPPOSITE ORDER. The write settles first and says its
  // sentence; the enumeration then lands on top of the sentence. Under the
  // unfixed loader the read repainted the WHOLE editor and painted her
  // sentence out — the same defect, arriving by the other door.
  const b = drivePaneHeldEnumeration('readKeepsWriteClaim/write-first', R3);
  if (b && fireRemove(b.editor, 'personnel notes',
    'readKeepsWriteClaim/write-first')) {
    if (b.t.writes.length !== 1) {
      violations.push('[readKeepsWriteClaim/write-first] ' +
        b.t.writes.length + ' roster write(s) reached the transport, ' +
        'expected exactly 1 BY VALUE');
    } else {
      b.t.writes[0].h.settle(rosterAnswer(R_AFTER_REMOVE));
      b.t.reads[0].settle(b.t.folderAnswer);
      assertActSaidSo('readKeepsWriteClaim/write-first', b, R_AFTER_REMOVE,
        C4, 'C4');
    }
  }

  // -- THE MIRROR CASE, AND IT IS THE ARM THAT SHOULD FAIL. An `add` the
  // route ACCEPTED, with the enumeration landing mid-flight. Before the
  // product change this arm shows no row at all — which reads exactly like a
  // failed add, on the one control where being wrong costs her privacy.
  const c = drivePaneHeldEnumeration('readKeepsWriteClaim/add-mirror', R3);
  if (c) {
    const field = c.editor.querySelector('.vault-roster-add-input');
    const add = c.editor.querySelector('.vault-roster-add');
    if (!field || !add) {
      violations.push('[readKeepsWriteClaim/add-mirror] the add field or ' +
        'the add control is missing from the rendered editor');
    } else {
      field.value = 'Diaries';
      add.fire();
      if (c.t.writes.length !== 1) {
        violations.push('[readKeepsWriteClaim/add-mirror] ' +
          c.t.writes.length + ' roster write(s) reached the transport, ' +
          'expected exactly 1 BY VALUE');
      } else {
        c.t.reads[0].settle(c.t.folderAnswer);
        c.t.writes[0].h.settle({ ok: true, status: 200,
          data: { fenced_roster: R_AFTER_ADD, retroactive: true,
            flagged: FLAGGED_COUNT } });
        const rows = rosterValuesOf(c.editor);
        console.log('  [readKeepsWriteClaim/add-mirror] roster=' +
          rows.length + ' ' + JSON.stringify(rows) + ' consequenceWrites=' +
          consequenceWrites(c.editor) + ' C3-on-screen=' +
          (rendered(c.editor).indexOf(C3) !== -1));
        if (rows.indexOf('Diaries') === -1) {
          violations.push('[readKeepsWriteClaim/add-mirror] ⛔ AN ACCEPTED ' +
            'ADD SHOWED NO ROW. The route said yes and the pane shows ' +
            JSON.stringify(rows) + ' BY VALUE, with "Diaries" absent. ⚠ This ' +
            'is the mirror of the silenced C4 and it is worse to read: an ' +
            'add the route accepted looks exactly like an add that failed.');
        }
        if (JSON.stringify(rows) !== JSON.stringify(R_AFTER_ADD)) {
          violations.push('[readKeepsWriteClaim/add-mirror] the pane shows ' +
            JSON.stringify(rows) + ', expected the route\'s own answer ' +
            JSON.stringify(R_AFTER_ADD) + ' BY VALUE.');
        }
      }
    }
  }
});


// ---------------------------------------------------------------------------
// (typedNameSurvivesEnumeration) WHAT SHE IS TYPING SURVIVES THE LIST
// ARRIVING — 26.96-REVIEW.md's WR-02, the same root cause as the two groups
// above and closed by the same fix.
//
// ⚠⚠ THE NAME IS ONE OF HER REAL SIX, AND IT IS THE ONE MOST AT RISK.
// `billing & insurance notes` is on NO offered list at all — her vault does not
// contain it at any depth — so it can ONLY ever be entered by typing. Its
// ampersand is also the character that already broke one reader on this file,
// which read `medical &amp; health notes` out of markup raw and reported one
// of her own six as missing. ⛔ The value below is read off the CONTROL, not
// out of markup; anything this group does read out of markup goes through the
// module-level `decodeAttr` (via `pickerValuesOf`), and no second decoder is
// introduced.
//
// ⚠⚠ RECORDED, NOT CLAIMED: THE FAKE DOM HAS NO FOCUS MODEL AND NO CARET.
// This group proves the VALUE survives. It cannot prove focus or caret
// position survives, and it does NOT tick `human_verification` item 2 of
// 26.96-VERIFICATION.md — "start typing a folder name the moment the pane
// opens, and keep typing" — which remains OWED to the fresh owner UAT. ⛔ A
// green here must not be read as coverage it does not have.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? No — driven against the UNFIXED
//      loader in a scratch mirror outside this repo, where the enumeration's
//      `renderRosterHosts` re-emits the field EMPTY. The failure is pasted
//      verbatim into 26.96-32-SUMMARY.md.
//  (2) Can it still pass once deliberately broken? No — that red run IS the
//      mutation, and it is the only change in that file.
//  (3) Does a degenerate implementation satisfy it? No. The field is
//      RE-QUERIED after the settle, so the double's per-generation control
//      cache cannot answer from memory; the editor container's own write
//      count is asserted UNCHANGED across the settle, which is the mechanism
//      rather than the symptom; and the arm that should fail drives the full
//      editor repaint and asserts the typed name is GONE, so a field double
//      that never lost its value could not make the first arm pass.
//  (4) Evaluation order or source order? EVALUATION — a real `input` event on
//      the shipped field, a real promise settled at a chosen moment.
//  (5) Could a grep match the fix's own comment? There is no grep here.
// ---------------------------------------------------------------------------
group('typedNameSurvivesEnumeration (a folder name typed into the field is ' +
  'still there BYTE-IDENTICAL after the walk of her vault lands — with the ' +
  'full editor repaint as the arm that should fail)', function () {
  const TYPED = 'billing & insurance notes';

  // -- ARM 1: THE READ LANDS WHILE SHE IS TYPING.
  const d = drivePaneHeldEnumeration('typedNameSurvivesEnumeration', R3);
  if (!d) { return; }
  if (!typeInto('typedNameSurvivesEnumeration', d.editor, TYPED)) { return; }
  const choicesBox = d.editor.kids['vault-roster-choices'] || null;
  if (!choicesBox) {
    violations.push('[typedNameSurvivesEnumeration] ⛔ BROKEN INSTRUMENT: ' +
      'the editor emitted no .vault-roster-choices child, so there is no box ' +
      'for a read to repaint and nothing below is evidence.');
    return;
  }
  const editorWritesBefore = d.editor.writes;
  const choiceWritesBefore = choicesBox.writes;

  d.t.reads[0].settle(d.t.folderAnswer);

  const editorWritesAfter = d.editor.writes;
  const choiceWritesAfter = choicesBox.writes;
  // ⛔ RE-QUERIED AFTER THE SETTLE. A repaint mints a NEW control, and the
  // handle taken before the settle would go on answering with the value it
  // was holding — the instrument reporting a survival that did not happen.
  // `deferredField` learned this on this same pane.
  const field = d.editor.querySelector('.vault-roster-add-input');
  const readBack = field ? String(field.value) : null;
  const shown = pickerValuesOf(d.editor).length;
  const offered = d.s.api.offered().length;
  console.log('  [typedNameSurvivesEnumeration/survives] typed=' +
    JSON.stringify(TYPED) + ' readBack=' + JSON.stringify(readBack) +
    ' shown=' + shown + ' offered=' + offered + ' editorWrites=' +
    editorWritesBefore + '->' + editorWritesAfter + ' choicesWrites=' +
    choiceWritesBefore + '->' + choiceWritesAfter + ' noMatchSaid=' +
    JSON.stringify(noMatchSaid(d.editor)));

  // ⛔ LIVENESS FIRST, BY VALUE. A settle that did nothing at all would
  // satisfy every survival assertion below vacuously.
  if (offered !== PICKER_CHOICES.length) {
    violations.push('[typedNameSurvivesEnumeration] ⛔ BROKEN INSTRUMENT: ' +
      'the enumeration settled and the picker holds ' + offered +
      ' entr(ies) for a ' + PICKER_CHOICES.length + '-entry answer, so the ' +
      'read did not land and nothing below is evidence.');
    return;
  }
  if (choiceWritesAfter !== choiceWritesBefore + 1) {
    violations.push('[typedNameSurvivesEnumeration] ⛔ THE READ DID NOT ' +
      'REPAINT THE OFFERED LIST. The choices box was written into ' +
      choiceWritesBefore + ' time(s) before the settle and ' +
      choiceWritesAfter + ' after, expected exactly one more BY VALUE. A ' +
      'read that repaints nothing would satisfy the survival assertion ' +
      'below by doing nothing at all.');
  }
  // ⛔ AND THE EDITOR AROUND IT IS NOT TOUCHED — the mechanism, not the
  // symptom. The field carries no `value` attribute, so one re-emission of
  // this container is all it takes to destroy what she typed.
  if (editorWritesAfter !== editorWritesBefore) {
    violations.push('[typedNameSurvivesEnumeration] ⛔ THE READ RE-EMITTED ' +
      'THE WHOLE EDITOR. Its container was written into ' +
      editorWritesBefore + ' time(s) before the settle and ' +
      editorWritesAfter + ' after, expected the SAME number BY VALUE. The ' +
      'read repaints the offered list alone; re-emitting the editor is what ' +
      'destroys the folder name she is in the middle of typing.');
  }
  if (readBack !== TYPED) {
    violations.push('[typedNameSurvivesEnumeration] ⛔ THE FOLDER NAME SHE ' +
      'WAS TYPING IS GONE. After the enumeration landed the field holds ' +
      JSON.stringify(readBack) + ', expected ' + JSON.stringify(TYPED) +
      ' BYTE-IDENTICAL. ⚠ Two of her six real private folders name places ' +
      'her vault does not contain at any depth and could ONLY ever have ' +
      'been made this way — a field that empties itself mid-word is the ' +
      'room deleting the only route to them.');
  }

  // ⛔ AND THE LIST REALLY IS THE ROUTE'S ANSWER NOW. Clearing the box gives
  // the whole answer back, which is the narrowing proved from the other
  // side: `shown` above is 0 because her name matches nothing on the offered
  // list, not because the box is empty.
  if (typeInto('typedNameSurvivesEnumeration', d.editor, '')) {
    const cleared = pickerValuesOf(d.editor).length;
    console.log('  [typedNameSurvivesEnumeration/cleared] shownCleared=' +
      cleared + ' ' + JSON.stringify(pickerValuesOf(d.editor)));
    if (cleared !== PICKER_CHOICES.length) {
      violations.push('[typedNameSurvivesEnumeration] clearing the box left ' +
        cleared + ' offered row(s) of ' + PICKER_CHOICES.length +
        ' — the box the read repainted does not hold the route\'s answer.');
    }
  }

  // -- ARM 2: ⛔ THE ARM THAT SHOULD FAIL. The FULL editor repaint, which
  // legitimately re-emits the field. Without it, a field double that never
  // lost its value would make arm one pass on a broken product.
  const e = drivePaneHeldEnumeration('typedNameSurvivesEnumeration/repaint',
    R3);
  if (!e) { return; }
  if (!typeInto('typedNameSurvivesEnumeration/repaint', e.editor, TYPED)) {
    return;
  }
  e.s.api.hosts(R3);
  const field2 = e.editor.querySelector('.vault-roster-add-input');
  const readBack2 = field2 ? String(field2.value) : null;
  console.log('  [typedNameSurvivesEnumeration/full-repaint] typed=' +
    JSON.stringify(TYPED) + ' readBack=' + JSON.stringify(readBack2) +
    ' — ⛔ THE ARM THAT SHOULD FAIL: this one is SUPPOSED to be gone.');
  if (readBack2 === TYPED) {
    violations.push('[typedNameSurvivesEnumeration] ⛔ THE INSTRUMENT ' +
      'CANNOT SEE THE DESTRUCTION IT IS ASSERTING THE ABSENCE OF. A FULL ' +
      'editor repaint re-emits the add field, which carries no `value` ' +
      'attribute, so the typed name must be GONE — and it read back as ' +
      JSON.stringify(readBack2) + '. A double that kept the value across a ' +
      'repaint would make arm one green on a product that empties her field.');
  }
});


// ===========================================================================
// (rejectedEnumeration) ⛔⛔ 26.96-33: A REJECTING TRANSPORT IS DRIVEN FOR THE
// ENUMERATION ROUTE — FOR THE FIRST TIME IN THIS REPO.
//
// `loadRosterFolderChoices` was the ONLY roster call in this pane with no
// `.catch`. Every sibling path guards; `editVaultRoster`'s tail is the shipped
// idiom. So `ROSTER_CHOICES_INFLIGHT = false` sat on the fulfilment path
// ALONE, and a rejection — a dropped connection, or a body that is not JSON
// making the parse throw — left that guard TRUE for the rest of the page. Every
// later render then turned back at it and never asked again.
//
// ⛔ THE HARM IS NOT COSMETIC. The picker is the room's strongest privacy
// control made easy to use, and one transient failure removed it until she
// reloaded the page. Nothing anywhere said so, and nothing may: her silence for
// this state is written down in 26.96-KNOWN-LIMITATIONS.md § 11 — if the room
// could not read her vault, or asked and got no answer, IT SAYS NOTHING.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work is done? No. Driven against the unfixed
//      loader it reports `gets=1` where it must report 2, and its failure is
//      pasted verbatim into 26.96-33-SUMMARY.md.
//  (2) Can it still pass once deliberately broken? No — deleting the `.catch`
//      IS that mutation, and it is the red run above.
//  (3) Does a degenerate implementation satisfy it? No. A `.catch` that reset
//      EVERY guard would make the rejecting arm pass while breaking the
//      shipped no-double-ask behaviour — so the SUCCEEDING arm below is built
//      to fail, and asserts `gets=1` by value. And the rejecting arm's
//      absences carry a positive control each: the note slot is written into
//      by hand afterwards to prove the zero was a real zero on a REACHABLE
//      slot rather than a null nobody could ever reach.
//  (4) Evaluation order or source order? EVALUATION, three times over: a real
//      transport rejects, the real pane renders twice, and the recorded GETs
//      are counted BY VALUE.
//  (5) Could a grep match the fix's own comment? There is no grep here.
// ===========================================================================

const FOLDER_ROUTE = '/api/adapter/vault-folder-paths';

// The enumeration route REJECTS; the store read and the roster write answer.
// ⛔ `rejectingP` is the stub group B proves really fires — its `.then` handler
// is never invoked and its `.catch` handler is. The shipped pass-through
// thenable CANNOT express this, which is why no test in this repo had ever
// driven a rejection down this route.
function folderRouteRejects(fenced) {
  return function (url) {
    if (url === FOLDER_ROUTE) {
      return rejectingP(new Error('the walk of her vault was dropped'));
    }
    if (url === '/api/items') { return metaAnswer(fenced); }
    return shippedThenable({ ok: true, status: 200,
      data: { fenced_roster: fenced } });
  };
}

function folderGets(scope) {
  return scope.calls.get.filter(function (u) {
    return u === FOLDER_ROUTE;
  }).length;
}

group('rejectedEnumeration (a dropped enumeration costs ONE read and not the ' +
  'page session: a second render really issues a second GET, COUNTED, the ' +
  'pane says nothing — with the SUCCEEDING arm as the one that should fail)',
function () {
  // ⛔ HER CHOSEN BYTES, READ OUT OF HER RECORD AT RUN TIME and ⛔ never out
  // of the renderer's own constant — exactly as `emptyVaultSaysSo` does. A
  // gate pinned against the source it is testing pins whatever that source
  // currently says.
  const NONE = rulingQSentence();

  // -- ARM 1: THE REJECTING TRANSPORT, THROUGH THE REAL PANE, RENDERED TWICE.
  // ⛔ TWICE IS THE ASSERTION, not a convenience. The first render issues the
  // read; the second is the state she meets next, and it is the one that must
  // ask again. A single render can say nothing at all about a wedged guard.
  const r = rosterScope(folderRouteRejects(R3), []);
  r.api.pane();
  r.api.pane();
  const rEditor = (r.dom('manage-sec-roster').kids || {})['vault-roster-editor']
    || null;
  if (!rEditor) {
    violations.push('[rejectedEnumeration] the pane never created its editor ' +
      'container — nothing was driven and nothing below is evidence');
    return;
  }
  const rGets = folderGets(r);
  const rMark = rendered(rEditor);
  const rOffered = pickerValuesOf(rEditor).length;
  const rNote = noteBoxOf(rEditor);
  const rNoteWrites = rNote ? rNote.writes : 0;
  // ⛔ THE POSITIVE CONTROL, PRINTED BESIDE THE ABSENCES. A scope that never
  // ran at all is visible here as `gets=0` rather than passing silently.
  console.log('  [rejectedEnumeration/rejecting] gets=' + rGets +
    ' answeredSentence=' + (rMark.indexOf(NONE) === -1 ? 'absent' : 'present') +
    ' offered=' + rOffered + ' noteWrites=' + rNoteWrites);

  if (rGets !== 2) {
    violations.push('[rejectedEnumeration] ⛔ ONE FAILED READ KILLED THE ' +
      'PICKER FOR THE PAGE SESSION. Two renders through a REJECTING ' +
      'enumeration issued ' + rGets + ' GET(s) to ' + FOLDER_ROUTE + ', ' +
      'expected exactly 2 BY VALUE. ⛔ COUNTED, never inferred from the ' +
      'absence of a wedged guard: the observable behaviour that matters is ' +
      'that a second request really went out. With the in-flight guard left ' +
      'true by an uncaught rejection, every later render turns back at it ' +
      'and the strongest privacy control in the room is gone until she ' +
      'reloads the page — with nothing anywhere saying so.');
  }
  // ⛔ AND IT SAID NOTHING. `ROSTER_CHOICES_ANSWERED` is asserted through the
  // RENDERED PANE rather than by reading the flag: her Ruling-Q sentence is
  // what that flag gates, and a sentence about HER VAULT may never be said on
  // the strength of the room's own failure.
  if (rMark.indexOf(NONE) !== -1) {
    violations.push('[rejectedEnumeration] ⛔ THE ROOM SAID IT FOUND NO ' +
      'FOLDERS IN HER VAULT ON A READ THAT WAS DROPPED. ' +
      JSON.stringify(NONE) + ' is on screen after a REJECTION — the ' +
      'discriminator is DID THE READ SUCCEED, never IS THE LIST EMPTY, and ' +
      'this pane has had to establish it three times already (26.96-10, ' +
      '26.96-15, 26.96-29).');
  }
  if (rMark.indexOf("couldn't save") !== -1) {
    violations.push('[rejectedEnumeration] ⛔ THE PANE SPOKE A FAILURE OVER ' +
      'THE FENCE SHE CAN ALREADY SEE. Her silence for this state is recorded ' +
      'in 26.96-KNOWN-LIMITATIONS.md § 11 and this plan wrote no sentence.');
  }
  if (rOffered !== 0) {
    violations.push('[rejectedEnumeration] ⛔ A SWALLOWED FAILURE OFFERED ' +
      rOffered + ' folder(s). A rejection must leave the offered list ' +
      'exactly as it was — fail closed, offer nothing new — and this scope ' +
      'started with none.');
  }
  if (rNoteWrites !== 0) {
    violations.push('[rejectedEnumeration] the note slot was written into ' +
      rNoteWrites + ' time(s) after a dropped READ, expected exactly 0 BY ' +
      'VALUE. ⛔ COUNTED, never checked for emptiness — a repaint RESETS a ' +
      'child without incrementing its counter, so a sentence painted over ' +
      'would be invisible to an emptiness check.');
  }
  // ⛔ THE ZERO ABOVE IS PROVED TO BE A REAL ZERO ON A REACHABLE SLOT. Without
  // this, a note container that never existed would satisfy it vacuously —
  // this project has recorded 7 of 19 bare zero-assertions passing for
  // exactly that reason.
  r.api.failed();
  const reachable = noteBoxOf(rEditor);
  const reachableWrites = reachable ? reachable.writes : 0;
  console.log('  [rejectedEnumeration/slot-reachable] noteWritesAfterControl=' +
    reachableWrites);
  if (reachableWrites !== 1) {
    violations.push('[rejectedEnumeration] ⛔ BROKEN INSTRUMENT: the note ' +
      'slot could not be written into even by hand (count ' +
      reachableWrites + ', expected 1), so the zero asserted above is the ' +
      'absence of a SLOT rather than the absence of a sentence.');
  }

  // -- ARM 2: ⛔ THE ARM THAT SHOULD FAIL. The SUCCEEDING transport, the same
  // two renders, and a GET count of exactly ONE. A `.catch` that reset every
  // guard on every path would make arm 1 green while quietly breaking the
  // shipped no-double-ask behaviour — a full recursive walk of her whole vault
  // re-issued on every repaint. ⛔ A unanimous verdict with no failing arm
  // proves nothing.
  const g = rosterScope(folderRouteAnswers(PICKER_CHOICES, R3), []);
  g.api.pane();
  g.api.pane();
  const gEditor = (g.dom('manage-sec-roster').kids || {})['vault-roster-editor']
    || null;
  const gGets = folderGets(g);
  const gMark = gEditor ? rendered(gEditor) : '';
  const gOffered = gEditor ? pickerValuesOf(gEditor).length : 0;
  const gNote = gEditor ? noteBoxOf(gEditor) : null;
  console.log('  [rejectedEnumeration/succeeding] gets=' + gGets +
    ' answeredSentence=' + (gMark.indexOf(NONE) === -1 ? 'absent' : 'present') +
    ' offered=' + gOffered + ' noteWrites=' + (gNote ? gNote.writes : 0));
  if (gOffered !== PICKER_CHOICES.length) {
    violations.push('[rejectedEnumeration] ⛔ BROKEN INSTRUMENT: the ' +
      'succeeding arm offered ' + gOffered + ' entr(ies) for a ' +
      PICKER_CHOICES.length + '-entry answer, so its GET count below is not ' +
      'measuring a read that landed.');
  } else if (gGets !== 1) {
    violations.push('[rejectedEnumeration] ⛔ THE ARM THAT SHOULD FAIL DID ' +
      'NOT FAIL: two renders through an ANSWERING enumeration issued ' +
      gGets + ' GET(s), expected exactly 1 BY VALUE. The three guards are ' +
      'what stop a repaint re-walking her whole vault, and a rejection path ' +
      'that loosened them would buy arm 1 at their price.');
  }

  // -- ARM 3: THE SAME REJECTION, DRIVEN AT THE LOADER ITSELF, with the two
  // doors 26.96-32 closed asserted STILL CLOSED. A read that did not succeed
  // may not seed the roster cache — asserted with hasOwnProperty and NEVER
  // with falsiness, because `undefined` and `[]` are both falsy and `[]` is a
  // poisoned cache saying her fence is EMPTY.
  const d = rosterScope(folderRouteRejects(R3), []);
  d.api.loadChoices();
  d.api.loadChoices();
  const dGets = folderGets(d);
  const dMeta = d.api.MANAGE.meta;
  const dHasKey = Object.prototype.hasOwnProperty.call(dMeta, 'fenced_roster');
  console.log('  [rejectedEnumeration/direct] gets=' + dGets +
    ' offered=' + d.api.offered().length + ' rosterCacheKey=' + dHasKey);
  if (dGets !== 2) {
    violations.push('[rejectedEnumeration/direct] the loader was called ' +
      'twice through a REJECTING transport and issued ' + dGets + ' GET(s), ' +
      'expected exactly 2 BY VALUE.');
  }
  if (d.api.offered().length !== 0) {
    violations.push('[rejectedEnumeration/direct] a rejected read left ' +
      d.api.offered().length + ' offered entr(ies) — it must leave the list ' +
      'exactly as it was.');
  }
  if (dHasKey) {
    violations.push('[rejectedEnumeration/direct] ⛔ A REJECTED READ SEEDED ' +
      'THE ROSTER CACHE with ' + JSON.stringify(dMeta.fenced_roster) + '. ' +
      '26.96-32 closed that door on the SUCCESS path; a rejection path may ' +
      'not reopen it.');
  }
});

// ---------------------------------------------------------------------------
// (26.96-36) seamShape — THE COUNT IN app.js'S SEAM-SHAPE COMMENT STOPS BEING
// ONLY A COMMENT.
//
// ⛔ THIS IS NOT A WIDENING OF THE SEAM GATE, AND THAT IS SAID HERE SO THE
// NEXT READER DOES NOT MISTAKE IT FOR THE WIDENING THAT WAS REJECTED. It
// changes nothing about what tests/test_no_push.cjs inspects, adds no sink to
// its scope, and loosens nothing. It re-derives — with that gate's OWN
// splitter, lifted from its LIVE source — the figures the seam-shape comment
// above renderRosterEditor's sink STATES, and fails when the two disagree.
// The gate's REACH is a different question and stays filed on its own at
// .planning/todos/pending/2026-08-21-seam-gate-blind-region-scope.md.
//
// WHY IT EXISTS. That comment's count was written by hand. It went stale
// inside a single round — 26.96-27 and 26.96-29 concatenated into the sink and
// 26.96-34 wrapped a block of it in a parenthesised conditional — and while it
// was stale it told the next engineer the blind region was somewhere else. ⛔ A
// COUNT IN A COMMENT IS NOT A GATE. This is the gate: change the sink and this
// goes RED, naming the sink and both numbers.
//
// ⛔ IT FAILS LOUDLY AND NEVER QUIETLY STOPS CHECKING. A member that cannot be
// lifted, a marker that is absent, and a marker naming a function that no
// longer exists are each a NAMED violation. A `try` that swallows and passes
// is forbidden here — a live gate that quietly stops checking is this
// project's named defect class.
//
// ⛔ IT READS THE GATE FROM DISK, NOT FROM A COMMITTED BLOB. The point is that
// the comment matches what the LIVE gate measures; pinning against a snapshot
// would let the two drift in silence.
//
// ⛔ A GROUP, NOT A NEW FILE. tests/test_stage_public.py pins the node-suite
// total by value; a new tests/*.cjs would change that total and force an edit
// to a suite that is red for reasons belonging to other sessions.
// ---------------------------------------------------------------------------
group('seamShape (the comment\'s seam figures are re-derived by the gate\'s ' +
  'own splitter and compared BY VALUE)', function () {
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const gatePath = path.join(ROOT, 'tests', 'test_no_push.cjs');
  const gateSrc = fs.readFileSync(gatePath, 'utf8');

  // --- 1. Lift the gate's own members. NEVER re-implement them: a
  //        re-implementation agrees with whatever its author believed, which
  //        is the mirrored-test trap this project has been bitten by nine
  //        times.
  const MEMBERS = ['jsMask', 'codeOnly', 'findAtDepthZero', 'splitSegments'];
  const bodies = [];
  let liftFailed = false;
  MEMBERS.forEach(function (n) {
    let body = null;
    try {
      body = extractFn(gateSrc, n);
    } catch (e) {
      body = null;
    }
    if (!body || body.indexOf('function ' + n + '(') !== 0) {
      liftFailed = true;
      violations.push('[seamShape] ⛔ COULD NOT LIFT ' + JSON.stringify(n) +
        ' FROM tests/test_no_push.cjs — the seam gate\'s splitter has been ' +
        'renamed or removed, so this gate can no longer re-derive the ' +
        'figures the comment in app.js states. ⛔ FIX THE LIFT, never delete ' +
        'this group: a staleness check that quietly stops checking is worse ' +
        'than the stale comment it was built to catch.');
      return;
    }
    bodies.push(body);
  });
  const seamReSrc = gateSrc.match(/^const\s+SEAM_RE\s*=\s*(.+);\s*$/m);
  if (!seamReSrc) {
    liftFailed = true;
    violations.push('[seamShape] ⛔ COULD NOT LIFT "SEAM_RE" FROM ' +
      'tests/test_no_push.cjs — same reason, same instruction.');
  }
  if (liftFailed) { return; }        // already reported LOUDLY, above

  const gate = new Function(bodies.join('\n') +
    '\nconst SEAM_RE = ' + seamReSrc[1] + ';\n' +
    'return { jsMask: jsMask, codeOnly: codeOnly, ' +
    'findAtDepthZero: findAtDepthZero, splitSegments: splitSegments, ' +
    'SEAM_RE: SEAM_RE };')();

  // --- 1b. (26.96-44) THE SINK SHAPES THEMSELVES ARE LIFTED, NOT ONLY THE
  //         SPLITTER.
  //
  // ⛔ WHY THIS EXISTS AND WHAT WENT THROUGH WITHOUT IT. Section 3 used to
  // enumerate with one hand-typed regex over inner/outerHTML ASSIGNMENT —
  // TWO shapes. The gate this group lifts its splitter from defines a sink
  // FOUR ways, and the other two are CALL forms. 26.96-VERIFICATION.md round
  // 5 and 26.96-REVIEW.md WR-01 each planted, independently, a third HTML
  // sink inside the delimited pane span in a call form carrying a folder
  // name into an HTML ATTRIBUTE. Re-driven at this head before this was
  // written: the pane suite exited 0 printing "sinks stated=2 measured=2",
  // named the planted function ZERO times in its whole output, and the seam
  // gate's violation set was BYTE-IDENTICAL to baseline. ⛔ Two of four
  // shapes were invisible to the count, and the comment in app.js claimed
  // coverage of all of them.
  //
  // ⛔ SO THE SHAPES ARE DERIVED FROM THE GATE, NEVER RE-TYPED HERE. A typed
  // list agrees with whatever its author believed on the day — the mirrored-
  // test trap this project has been bitten by, and the very defect being
  // repaired one level up. This is the same discipline the escaper-name
  // derivation further down already applies to SEAM_RE, including its
  // failure posture: a lift that does not land is a NAMED broken instrument
  // and stops the group, never a quiet fallback to a shorter list.
  //
  // ⛔ WHICH DECLARATION, AND WHY THAT ONE. The gate declares what a sink is
  // in TWO independent places: the scanning function, whose regexes carry
  // EXTRACTION semantics (where each shape's markup argument begins and what
  // terminates it), and a flat token alternation used on the markup file,
  // which carries none. The shapes AND their extraction rules are lifted
  // from the scanning function, because only it says where a right-hand side
  // starts and ends. The token alternation is then used as the INDEPENDENT
  // self-check below — neither is derived from the other, so their agreement
  // is evidence rather than construction.
  //
  // ⛔ THE EXTRACTION RULE IS DERIVED TOO, NOT ASSUMED. Each shape's driving
  // loop in the gate ends in a range check whose start and end expressions
  // name locals the same loop declares; this reads those declarations back
  // and recovers, per shape, whether the range starts after the match or
  // after a depth-0 separator, and which character at depth 0 terminates it.
  // ⛔ An assignment and a call do NOT share a terminator, so a single rule
  // applied to all shapes would mis-slice the call forms and hand the
  // splitter a range that is not the markup argument at all.
  //
  // ⛔ IT IS STILL NOT A WIDENING OF THE SEAM GATE. tests/test_no_push.cjs is
  // READ and never edited; nothing here asks it to inspect anything new, and
  // its own reach stays filed at
  // .planning/todos/pending/2026-08-21-seam-gate-blind-region-scope.md.
  const SHAPES = [];
  // ⛔ (26.96-48) THE EXEMPTION LIST, WRITTEN DOWN RATHER THAN INFERRED.
  //
  // A declaration inside `scanJsSinks` that NOTHING in `scanJsSinks` drives
  // is inert: the shipped gate names a shape and then never steps it over
  // the source, so this enumeration has nothing to enumerate with. That is a
  // legitimate state — a helper regex used for something other than
  // scanning — and it is the ONLY thing this list may excuse.
  //
  // ⛔ EACH ENTRY CARRIES ITS REASON, AND THE LIST IS PRINTED BY VALUE ON
  // EVERY RUN. An exemption nobody can see is how a gate goes blind, and a
  // waiver granted for one reason silently waives everything else riding on
  // the same check — this project has that written down as a law.
  //
  // ⛔ IT IS NOT A WAY TO SILENCE A SHAPE THAT IS GENUINELY DRIVEN. An entry
  // naming a name this lift can see being driven is itself a NAMED
  // violation, and so is an entry naming a name the gate does not declare at
  // all (a stale exemption outliving the declaration it excused), and so is
  // an entry carrying no reason.
  //
  // ⛔ IT IS EMPTY AT THIS HEAD, AND THAT IS ASSERTED RATHER THAN ASSUMED:
  // every declaration `scanJsSinks` makes at this head is driven, so any
  // entry here would name a driven or an undeclared shape and would go RED.
  const INERT_SHAPES = [];
  const declaredNames = [];
  const drivenNames = [];
  const exemptedNames = [];
  const unaccountedNames = [];
  const unreadableDriven = [];
  let shapeLiftFailed = false;
  let scanBody = null;
  try { scanBody = extractFn(gateSrc, 'scanJsSinks'); } catch (e) { scanBody = null; }
  if (!scanBody || scanBody.indexOf('function scanJsSinks(') !== 0) {
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: COULD NOT LIFT ' +
      '"scanJsSinks" FROM tests/test_no_push.cjs, which is where the shipped ' +
      'gate declares every shape it calls an HTML sink. This group cannot ' +
      'then enumerate the pane\'s sinks by the gate\'s own definition, and it ' +
      'will NOT fall back to a typed list — a typed list is exactly the ' +
      'defect 26.96-44 was written to repair, and a shorter one reading ' +
      'green is worse than no reading at all. ⛔ FIX THE LIFT AGAINST THE ' +
      'GATE\'S NEW SHAPE, never delete this derivation.');
  } else {
    // ⛔ (26.96-48) EVERY DECLARATION IS ACCOUNTED FOR, AND THE DERIVATION
    //    RUNS IN BOTH DIRECTIONS.
    //
    // ⛔ WHY THIS EXISTS AND WHAT WENT THROUGH WITHOUT IT. 26.96-44 replaced
    // a hand-typed sink list with a LIFT from the shipped gate. That removed
    // the drift, and then the lift's own SHORT path put it back: the walk
    // below located each shape's driving loop by searching for ONE typed
    // loop spelling — `while ((m = <name>.exec(code)) !== null) {` — and when
    // that string was absent it did a bare `continue`. Seven failure paths
    // in this derivation push a NAMED broken instrument and stop the group;
    // that one said NOTHING. 26.96-VERIFICATION.md round 6 gap 1 added a
    // FOURTH shape to the shipped gate driven by a loop whose match variable
    // is not `m`, planted a matching unescaped sink inside the pane span,
    // and got EXIT 0: three shapes lifted where the gate declared four,
    // "sinks stated=2 measured=2", the planted function named ZERO times,
    // and no broken-instrument line anywhere. 26.96-REVIEW.md CR-02 found
    // the same hole independently with a different loop spelling.
    //
    // ⛔ SO THE RULE IS: A LIFT THAT COMES UP **SHORT** IS AS LOUD AS A LIFT
    // THAT COMES UP **EMPTY**. The empty-shape-set arm already existed and
    // was loud. The NARROWED-shape-set arm did not exist at all, and that
    // was the whole defect — a count over a short list reads exactly like a
    // count over the list.
    //
    // ⛔ AND THE PIN NO LONGER RESTS ONLY ON `sinkRe`. Section 1c cross-checks
    // the lift against the gate's markup-file token declaration, which is a
    // DIFFERENT declaration that has no reason to move when a shape is added
    // to `scanJsSinks` — the case where the two disagree is precisely this
    // defect, and 1c stayed green through the plant. The conservation
    // identity below is the PRIMARY pin because it sees the case `sinkRe`
    // structurally cannot; 1c is demoted to a second, independent
    // cross-check.
    //
    // ⛔ THE THING THAT IDENTIFIES A DRIVE SITE IS THE REGEX NAME APPLIED TO
    // A SOURCE, NEVER THE KEYWORD IN FRONT OF IT. Depending on the loop
    // spelling is what the defect WAS. A `for`, a `while` with a different
    // match variable, or any other spelling reaches the same derivation
    // because the body is taken from the DRIVE SITE'S POSITION rather than
    // from a matched loop string.
    //
    // ⛔ IT IS STILL NOT A WIDENING OF THE SEAM GATE. tests/test_no_push.cjs
    // is READ and never edited; nothing here asks it to inspect anything
    // new, and its own reach stays filed at
    // .planning/todos/pending/2026-08-21-seam-gate-blind-region-scope.md.

    // --- DIRECTION 1: DECLARATION. Every regex the scanning function names.
    const declRe = /const\s+([A-Za-z0-9_$]+)\s*=\s*(\/(?:\\.|\[(?:\\.|[^\]])*\]|[^\/\\])+\/[gimsuy]*)\s*;/g;
    const declSites = [];
    let dm;
    while ((dm = declRe.exec(scanBody)) !== null) {
      declSites.push({ name: dm[1], src: dm[2], index: dm.index });
      if (declaredNames.indexOf(dm[1]) === -1) { declaredNames.push(dm[1]); }
    }

    // --- DIRECTION 2: DRIVE SITE. Every place a named regex is stepped over
    //     a source inside the same body. This is the direction that was
    //     MISSING, and it is what catches a shape spelled in a way the
    //     declaration walk below cannot follow.
    const driveRe = /([A-Za-z0-9_$]+)\s*\.\s*exec\s*\(\s*([A-Za-z0-9_$]+)\s*\)/g;
    const driveSites = [];
    let vm;
    while ((vm = driveRe.exec(scanBody)) !== null) {
      driveSites.push({ name: vm[1], over: vm[2], index: vm.index });
      if (drivenNames.indexOf(vm[1]) === -1) { drivenNames.push(vm[1]); }
    }

    // --- THE EXEMPTION LIST IS ITSELF CHECKED BEFORE IT IS HONOURED.
    INERT_SHAPES.forEach(function (ex) {
      const nm = ex && ex.name;
      const why = ex && ex.reason;
      if (!nm || !why || !String(why).trim()) {
        shapeLiftFailed = true;
        violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: AN INERT_SHAPES ' +
          'ENTRY CARRIES NO NAME OR NO REASON (' + JSON.stringify(ex) +
          '). An exemption whose reason nobody wrote down is a waiver nobody ' +
          'can review, and this list exists precisely so a shape excused ' +
          'from the enumeration is excused IN WRITING. ⛔ WRITE THE REASON ' +
          'OR REMOVE THE ENTRY.');
        return;
      }
      if (declaredNames.indexOf(nm) === -1) {
        shapeLiftFailed = true;
        violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: INERT_SHAPES ' +
          'EXEMPTS ' + JSON.stringify(nm) + ', WHICH tests/test_no_push.cjs ' +
          'NO LONGER DECLARES INSIDE "scanJsSinks". A stale exemption ' +
          'outlives the declaration it excused and then silently excuses ' +
          'whatever is renamed into its place. ⛔ REMOVE THE ENTRY AND ' +
          'RE-MEASURE.');
        return;
      }
      if (drivenNames.indexOf(nm) !== -1) {
        shapeLiftFailed = true;
        violations.push('[seamShape] ⛔ INERT_SHAPES IS BEING USED TO ' +
          'SILENCE A SHAPE THAT IS GENUINELY DRIVEN: ' + JSON.stringify(nm) +
          ' is declared AND driven inside "scanJsSinks", so the shipped gate ' +
          'really does call it an HTML sink and this enumeration really does ' +
          'need it. An exemption is for a declaration NOTHING drives. ' +
          'Excusing a live shape here would hide exactly the narrowing this ' +
          'accounting was written to end. ⛔ REMOVE THE ENTRY AND FIX THE ' +
          'LIFT.');
        return;
      }
      exemptedNames.push(nm);
    });

    // --- RECONCILE. Every declared name ends as a lifted shape, a printed
    //     exemption, or a NAMED violation. There is no fourth path and no
    //     silent one.
    declaredNames.forEach(function (nm) {
      let d = null;
      declSites.forEach(function (c) { if (d === null && c.name === nm) { d = c; } });
      const reSrc = d.src;
      let drive = null;
      driveSites.forEach(function (s) {
        if (drive === null && s.name === nm) { drive = s; }
      });
      if (!drive) {
        // A declaration nothing drives. Exempt IN WRITING, or NAMED.
        if (exemptedNames.indexOf(nm) !== -1) { return; }
        shapeLiftFailed = true;
        if (unaccountedNames.indexOf(nm) === -1) { unaccountedNames.push(nm); }
        violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE SHIPPED GATE ' +
          'DECLARES THE SINK SHAPE ' + JSON.stringify(nm) + ' INSIDE ' +
          '"scanJsSinks" AND THIS ENUMERATION CANNOT FIND ANYTHING DRIVING ' +
          'IT. Either the gate names a shape it never steps over the source ' +
          '— in which case say so in INERT_SHAPES, with the reason — or it ' +
          'drives it in a spelling this lift cannot see, in which case the ' +
          'pane count below would be a count over FEWER kinds of sink than ' +
          'the gate knows about and a sink of the missing kind would sit ' +
          'inside the delimited region measured by NOTHING. ⛔ THAT IS THE ' +
          'EXACT STATE 26.96-VERIFICATION.md round 6 gap 1 drove a fourth ' +
          'HTML sink through at exit 0. ⛔ FIX THE LIFT — a shorter list ' +
          'read green is worse than no reading at all.');
        return;
      }
      // The driving loop's BODY, taken from the DRIVE SITE'S POSITION so no
      // loop spelling is depended on.
      const bopen = scanBody.indexOf('{', drive.index);
      if (bopen === -1) {
        shapeLiftFailed = true;
        if (unaccountedNames.indexOf(nm) === -1) { unaccountedNames.push(nm); }
        violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE SHIPPED ' +
          'GATE DRIVES ' + JSON.stringify(nm) + ' AT AN OFFSET THIS LIFT ' +
          'CANNOT FIND A BLOCK AFTER, so the extraction rule that says where ' +
          'that shape\'s markup argument begins and ends is underived. ' +
          'NOTHING IS GUESSED. ⛔ FIX THE DERIVATION.');
        return;
      }
      let bi = bopen;
      let bd = 0;
      let bend = -1;
      for (; bi < scanBody.length; bi++) {
        if (scanBody[bi] === '{') { bd++; }
        else if (scanBody[bi] === '}') { bd--; if (bd === 0) { bend = bi; break; } }
      }
      const body = bend === -1 ? '' : scanBody.slice(drive.index, bend + 1);
      const cr = body.match(
        /checkRange\(\s*file\s*,\s*src\s*,\s*mask\s*,\s*([A-Za-z0-9_$]+(?:\s*\+\s*1)?)\s*,\s*([A-Za-z0-9_$]+)\s*,/);
      const endDecl = cr && body.match(new RegExp('const\\s+' + cr[2] +
        '\\s*=\\s*findAtDepthZero\\(\\s*src\\s*,\\s*mask\\s*,\\s*[A-Za-z0-9_$]+\\s*,\\s*\'(.)\'\\s*\\)'));
      let skipCh = null;
      const sm = cr && cr[1].replace(/\s+/g, '').match(/^([A-Za-z0-9_$]+)\+1$/);
      if (sm) {
        const sd = body.match(new RegExp('const\\s+' + sm[1] +
          '\\s*=\\s*findAtDepthZero\\(\\s*src\\s*,\\s*mask\\s*,\\s*[A-Za-z0-9_$]+\\s*,\\s*\'(.)\'\\s*\\)'));
        skipCh = sd ? sd[1] : null;
        if (!sd) {
          shapeLiftFailed = true;
          if (unaccountedNames.indexOf(nm) === -1) { unaccountedNames.push(nm); }
          violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: the gate\'s ' +
            JSON.stringify(nm) + ' loop starts its range one past ' +
            JSON.stringify(sm[1]) + ', but nothing in that loop says what ' +
            'character at depth 0 finds it. The markup argument\'s START is ' +
            'therefore underived, and slicing from the wrong place hands the ' +
            'splitter something that is not the argument. ⛔ FIX THE ' +
            'DERIVATION — do not guess the separator.');
        }
      }
      if (!cr || !endDecl) {
        shapeLiftFailed = true;
        if (unaccountedNames.indexOf(nm) === -1) { unaccountedNames.push(nm); }
        violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: LIFTED THE SINK ' +
          'SHAPE ' + JSON.stringify(nm) + ' FROM tests/test_no_push.cjs BUT ' +
          'COULD NOT DERIVE ITS EXTRACTION RULE — the loop that drives it ' +
          'no longer ends in a range check whose end is a depth-0 search ' +
          'this can read. Enumerating with the shape and guessing the rule ' +
          'would slice a range that is not the markup argument, so NOTHING ' +
          'IS GUESSED. ⛔ FIX THE DERIVATION.');
        return;
      }
      if (sm && skipCh === null) { return; }   // already NAMED, just above
      SHAPES.push({ name: nm, src: reSrc, skipCh: skipCh, endCh: endDecl[1] });
    });

    // --- THE OTHER DIRECTION. A regex driven against the scanned source with
    //     no declaration this lift can read is NAMED. Without this, a shape
    //     declared in a spelling the declaration walk misses would be
    //     invisible from BOTH sides.
    drivenNames.forEach(function (nm) {
      if (declaredNames.indexOf(nm) !== -1) { return; }
      shapeLiftFailed = true;
      if (unreadableDriven.indexOf(nm) === -1) { unreadableDriven.push(nm); }
      violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE SHIPPED GATE ' +
        'DRIVES ' + JSON.stringify(nm) + ' OVER THE SOURCE IT SCANS INSIDE ' +
        '"scanJsSinks", AND THIS LIFT CANNOT READ ANY DECLARATION FOR IT. ' +
        'The gate is therefore looking for a kind of HTML sink this ' +
        'enumeration is not looking for, and the pane count below would be ' +
        'a count over a short list while reading exactly like a count over ' +
        'the list. ⛔ FIX THE LIFT AGAINST THE DECLARATION\'S NEW SHAPE — ' +
        'do not type the shape here.');
    });
  }
  // ⛔ (26.96-48) THE CONSERVATION IDENTITY, PRINTED BY VALUE ON EVERY RUN,
  // RED OR GREEN. This is the NARROWED-lift arm. What was missing in round 6
  // was not a check — it was the ability to SEE that the lift came up short.
  // A count over a short list is indistinguishable from a count over the
  // list unless the list itself is printed beside what it was drawn from.
  console.log('  [seamShape/conservation] declared=[' +
    declaredNames.join(',') + '] driven=[' + drivenNames.join(',') +
    '] lifted=[' + SHAPES.map(function (s) { return s.name; }).join(',') +
    '] inertExempt=[' + exemptedNames.join(',') + '] unaccounted=[' +
    unaccountedNames.join(',') + '] unreadableDriven=[' +
    unreadableDriven.join(',') + '] | ' + declaredNames.length +
    ' declared = ' + SHAPES.length + ' lifted + ' + exemptedNames.length +
    ' exempted + ' + unaccountedNames.length + ' named-violation');
  if (declaredNames.length !== SHAPES.length + exemptedNames.length +
      unaccountedNames.length) {
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE CONSERVATION ' +
      'IDENTITY DOES NOT HOLD. ' + declaredNames.length + ' shape ' +
      'declaration(s) were found inside "scanJsSinks" but only ' +
      SHAPES.length + ' were lifted, ' + exemptedNames.length +
      ' exempted by name and ' + unaccountedNames.length + ' named as ' +
      'violations. A declaration that is none of those three left this ' +
      'derivation without a word, which is the silent narrowing this ' +
      'accounting exists to end. ⛔ FIX THE ACCOUNTING, never the number.');
  }
  // The regex objects, re-evaluated in the same isolated way SEAM_RE is.
  let shapeRes = [];
  if (SHAPES.length) {
    try {
      shapeRes = new Function('return [' +
        SHAPES.map(function (s) { return s.src; }).join(',') + '];')();
    } catch (e) {
      shapeRes = [];
    }
  }
  if (SHAPES.length && shapeRes.length !== SHAPES.length) {
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: ' + SHAPES.length +
      ' sink shape(s) were lifted from the gate but ' + shapeRes.length +
      ' re-evaluated. A shape that did not survive re-evaluation is a shape ' +
      'this group would silently stop looking for.');
  }
  SHAPES.forEach(function (s, i) {
    if (shapeRes[i] && shapeRes[i].global) { return; }
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE LIFTED SINK SHAPE ' +
      JSON.stringify(s.name) + ' (' + s.src + ') IS NOT A GLOBAL REGEX, so ' +
      'the enumeration below could find at most its first hit and would ' +
      'report a count that is not a count.');
  });
  // --- 1c. THE DERIVATION IS PINNED AGAINST THE GATE'S OTHER, INDEPENDENT
  //         DECLARATION OF WHAT A SINK IS.
  //
  // ⛔ WITHOUT THIS THE LIFT IS UNFALSIFIABLE. A scrape that quietly found
  // two of the four shapes would produce exactly the state being repaired,
  // and every count printed below would be a count over a short list. So
  // each alternative of the gate's flat token declaration is turned into a
  // probe and required to be recognised by at least one lifted shape.
  // ⛔ THE PROBES COME FROM THE OTHER DECLARATION, NEVER FROM THE SHAPES
  // THEMSELVES — a probe derived from the thing it is matched against
  // matches by construction and proves nothing.
  const tokDecl = gateSrc.match(/const\s+sinkRe\s*=\s*\/([^\/\n]+)\/[a-z]*\s*;/);
  const tokens = tokDecl ? tokDecl[1].split('|').map(function (a) {
    return a.replace(/\\s\*/g, '').replace(/\\\./g, '.').replace(/\\b/g, '');
  }).filter(function (t) { return t && !/[|()\[\]?*+{}^$]/.test(t); }) : [];
  if (!tokens.length) {
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: COULD NOT DERIVE THE ' +
      'SINK TOKEN ALTERNATIVES FROM THE GATE\'S MARKUP-FILE DECLARATION, so ' +
      'nothing independent pins the shape lift and a lift that found two of ' +
      'four shapes would read exactly like a lift that found all of them. ' +
      '⛔ FIX THE DERIVATION AGAINST THE DECLARATION\'S NEW SHAPE.');
  }
  const tokenCover = tokens.map(function (t) {
    const probes = ['q.' + t + " = 'a';", 'q.' + t + "('a');"];
    const by = SHAPES.filter(function (s, i) {
      const re = shapeRes[i];
      if (!re) { return false; }
      return probes.some(function (p) { re.lastIndex = 0; return re.test(p); });
    }).map(function (s) { return s.name; });
    return { token: t, by: by };
  });
  // ⛔ PRINTED ON EVERY RUN, RED OR GREEN. What it looked at is printed
  // beside what it found, because a check that goes green by having nothing
  // to look at is this project's most-recorded failure mode.
  console.log('  [seamShape/shapes] lifted=' + SHAPES.map(function (s) {
    return s.name + '{skip=' + JSON.stringify(s.skipCh) + ',end=' +
      JSON.stringify(s.endCh) + '}';
  }).join(' ') + ' | gateTokens=' + tokenCover.map(function (c) {
    return c.token + '->[' + c.by.join(',') + ']';
  }).join(' '));
  tokenCover.forEach(function (c) {
    if (c.by.length) { return; }
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ A SHAPE THE SHIPPED GATE CALLS A SINK IS ' +
      'NOT RECOGNISED BY THIS ENUMERATION: ' + JSON.stringify(c.token) +
      ' appears in the gate\'s own sink-token declaration and NO lifted ' +
      'shape matches it. The pane count below would then be a count of ' +
      'fewer kinds of sink than the gate knows about, and a sink in the ' +
      'missing kind would sit inside the delimited region measured by ' +
      'nothing — which is the exact state 26.96-VERIFICATION.md round 5 ' +
      'drove a third HTML sink through. ⛔ FIX THE LIFT.');
  });
  // ⛔ THE ANTI-VACUITY ARM. A shape set of nothing enumerates nothing, and
  // "measured=0" over nothing would read exactly like a clean pane. No
  // verdict is drawn from it.
  if (!SHAPES.length) {
    shapeLiftFailed = true;
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE LIFTED SINK-SHAPE ' +
      'SET IS EMPTY. Every count this group prints below would be a count ' +
      'over an instrument that looked for nothing, and its zeros would be ' +
      'vacuous. ⛔ NO VERDICT IS DRAWN AND NONE MAY BE.');
  }
  if (shapeLiftFailed) { return; }        // already reported LOUDLY, above

  // --- 2. Parse the markers out of app.js's comment. One shape each, fixed.
  const SINK_RE = /^\s*\/\/\s*SEAM-SINK-MARK:\s*(\S+)\s+segments\s+(\d+)\s*$/;
  const BLIND_RE = /^\s*\/\/\s*SEAM-BLIND-MARK:\s*(\S+)\s+seg(\d+)\s+(\d+)\s*$/;
  // (26.96-40) The pane's own three markers. The count marker is what makes
  // the NUMBER OF SINKS a gated fact instead of a sentence; the two
  // delimiters are what let this group ENUMERATE the pane's sinks rather
  // than iterate the marks that already exist.
  const PANE_RE = /^\s*\/\/\s*SEAM-PANE-MARK:\s*(\S+)\s+sinks\s+(\d+)\s*$/;
  const PANE_BEGIN_RE = /^\s*\/\/\s*SEAM-PANE-BEGIN:\s*(\S+)\s*$/;
  const PANE_END_RE = /^\s*\/\/\s*SEAM-PANE-END:\s*(\S+)\s*$/;
  const sinkMarks = [];
  const blindMarks = [];
  const paneMarks = [];
  const paneBegins = [];
  const paneEnds = [];
  appSrc.split('\n').forEach(function (line, i) {
    let m = line.match(SINK_RE);
    if (m) { sinkMarks.push({ fn: m[1], segments: Number(m[2]), line: i + 1 }); }
    m = line.match(BLIND_RE);
    if (m) {
      blindMarks.push({ fn: m[1], index: Number(m[2]), lines: Number(m[3]),
        line: i + 1 });
    }
    m = line.match(PANE_RE);
    if (m) { paneMarks.push({ pane: m[1], sinks: Number(m[2]), line: i + 1 }); }
    m = line.match(PANE_BEGIN_RE);
    if (m) { paneBegins.push({ pane: m[1], line: i + 1 }); }
    m = line.match(PANE_END_RE);
    if (m) { paneEnds.push({ pane: m[1], line: i + 1 }); }
  });
  if (!sinkMarks.length) {
    violations.push('[seamShape] ⛔ NO SEAM-SINK-MARK LINE IN app.js. The ' +
      'seam-shape comment\'s figures are supposed to be machine-readable so ' +
      'they cannot drift. If the marker was deleted, the count went back to ' +
      'being only a comment — put it back and re-measure, do not delete ' +
      'this group.');
    return;
  }
  if (!blindMarks.length) {
    violations.push('[seamShape] ⛔ NO SEAM-BLIND-MARK LINE IN app.js — the ' +
      'blind regions the comment claims to name are unmarked and therefore ' +
      'ungated. Same instruction.');
    return;
  }

  // --- 3. Re-derive, with the lifted splitter, over app.js as it is on disk.
  const mask = gate.jsMask(appSrc);
  const code = gate.codeOnly(appSrc, mask);
  function lineOf(idx) { return appSrc.slice(0, idx).split('\n').length; }
  // The enclosing NAMED function declaration for a position: the nearest one
  // that precedes it. Derived from the source, never from a typed list.
  function enclosingFn(idx) {
    const re = /function\s+([A-Za-z0-9_$]+)\s*\(/g;
    const before = appSrc.slice(0, idx);
    let m;
    let last = null;
    while ((m = re.exec(before)) !== null) { last = m[1]; }
    return last;
  }
  const sinks = [];
  // (26.96-44) ONE LOOP PER LIFTED SHAPE, EACH SLICING BY ITS OWN DERIVED
  // RULE. ⛔ The assignment keeps the rule it always had — its right-hand
  // side runs to the depth-0 terminator. Each call form runs from after its
  // own depth-0 separator, where the gate's loop says there is one, to the
  // matching close paren. ⛔ BOTH BOUNDS COME FROM THE GATE'S OWN
  // findAtDepthZero, which is the balanced matcher this group already
  // lifted: no second paren matcher is written here, because a second answer
  // to "where does this end" is the defect this whole group was built
  // against.
  SHAPES.forEach(function (shape, si) {
    const re = shapeRes[si];
    re.lastIndex = 0;
    let hit;
    while ((hit = re.exec(code)) !== null) {
      const argStart = hit.index + hit[0].length;
      let from = argStart;
      // ⛔ (26.96-48) A HIT THIS ENUMERATION CANNOT SLICE IS **NAMED**, NEVER
      //    SUBTRACTED FROM `measured` IN SILENCE.
      //
      // ⛔ WHAT WAS HERE BEFORE. Both searches below used to end in a bare
      // `continue`. A hit the gate itself calls an HTML sink then dropped
      // out of `sinks` without a word, and the pane count printed a few
      // lines down would be a count with one silently taken off it — in a
      // group whose whole thesis is that a sink it cannot read is NAMED
      // rather than dropped. It is the same class as a shape dropped from
      // the lift without a word, one level down (26.96-VERIFICATION.md
      // round 6, IN-07, which its verifier note folds into gap 1's fix).
      //
      // ⛔ THE MALFORMATION TEST IS THE SHIPPED GATE'S OWN, NOT A SECOND
      // OPINION. `scanJsSinks`'s call-form loop rejects a call whose
      // separator does not fall inside its argument list — it computes the
      // close and the separator FROM THE SAME START and rejects on
      // `close === -1 || comma === -1 || comma > close`, naming it an
      // "unparseable insertAdjacentHTML call". That ordering is reproduced
      // here for every shape carrying a separator, over the shape already
      // lifted from that gate. ⛔ NOTHING NEW IS DERIVED about what a
      // malformed call is.
      if (shape.skipCh) {
        const close = gate.findAtDepthZero(appSrc, mask, argStart, shape.endCh);
        const sep = gate.findAtDepthZero(appSrc, mask, argStart, shape.skipCh);
        if (close === -1 || sep === -1 || sep > close) {
          violations.push('[seamShape] ⛔ A HIT THE SHIPPED GATE CALLS AN ' +
            'HTML SINK IS MALFORMED FOR THE LIFTED SHAPE ' +
            JSON.stringify(shape.name) + ' IN ' +
            JSON.stringify(enclosingFn(hit.index)) + ' AT app.js:' +
            lineOf(hit.index) + ': its argument list does not close (' +
            JSON.stringify(shape.endCh) + ' at depth 0 found=' + (close !== -1) +
            '), or its separator ' + JSON.stringify(shape.skipCh) +
            ' does not fall INSIDE it (separator found=' + (sep !== -1) +
            ', separator-before-close=' + (sep !== -1 && close !== -1 &&
            sep < close) + '). This is the shipped gate\'s OWN test for a ' +
            'call it cannot parse, reproduced here over the shape lifted ' +
            'from it. ⛔ THE HIT IS NOT COUNTED, AND THAT IS SAID RATHER ' +
            'THAN DONE QUIETLY: the pane count below would otherwise be a ' +
            'count with one sink taken off it in silence. ⛔ FIX THE SINK ' +
            'OR THE DERIVATION — do not let the count stand.');
          continue;
        }
        from = sep + 1;
      }
      const to = gate.findAtDepthZero(appSrc, mask, from, shape.endCh);
      if (to === -1) {
        violations.push('[seamShape] ⛔ A HIT THE SHIPPED GATE CALLS AN HTML ' +
          'SINK COULD NOT BE SLICED FOR THE LIFTED SHAPE ' +
          JSON.stringify(shape.name) + ' IN ' +
          JSON.stringify(enclosingFn(hit.index)) + ' AT app.js:' +
          lineOf(hit.index) + ': nothing at depth 0 after app.js offset ' +
          from + ' terminates its markup argument with ' +
          JSON.stringify(shape.endCh) + '. The shipped gate names exactly ' +
          'this state too — it reports an unterminated sink assignment ' +
          'rather than passing over it. ⛔ THE HIT IS NOT COUNTED, AND THAT ' +
          'IS SAID: the pane count below would otherwise be a count with ' +
          'one sink taken off it in silence, which is the same class as a ' +
          'shape dropped from the lift without a word one level down. ' +
          '⛔ FIX THE SINK OR THE DERIVATION — do not let the count stand.');
        continue;
      }
      const segs = gate.splitSegments(appSrc, mask, from, to);
      sinks.push({
      shape: shape.name,
      fn: enclosingFn(hit.index),
      sinkLine: lineOf(hit.index),
      segments: segs.map(function (s, i) {
        return {
          index: i,
          // (26.96-41) THE SEGMENT'S OWN OFFSETS, CARRIED RATHER THAN
          // DISCARDED. splitSegments already returned them; section 6
          // slices the region out with these and never re-splits, so
          // there is exactly one answer in this group to the question
          // of where a segment begins.
          start: s[0],
          end: s[1],
          lines: lineOf(s[1]) - lineOf(s[0]) + 1,
          seamEvident: gate.SEAM_RE.test(code.slice(s[0], s[1]))
        };
      })
      });
    }
  });
  // ⛔ ONE ORDER, DERIVED FROM THE SOURCE. Enumerating shape-by-shape emits
  // hits in shape order rather than source order, and every figure this
  // group prints names a position in app.js. Sorted by that position so a
  // reader comparing two runs is comparing the same list.
  sinks.sort(function (a, b) { return a.sinkLine - b.sinkLine; });

  function resolve(fnName, tag) {
    if (appSrc.indexOf('function ' + fnName + '(') === -1) {
      violations.push('[seamShape] ⛔ ' + tag + ' NAMES A FUNCTION THAT NO ' +
        'LONGER EXISTS IN app.js: ' + JSON.stringify(fnName) + '. The ' +
        'marker is stale — the sink it described was renamed or removed, so ' +
        'nothing here is being checked. Re-measure and rewrite the comment.');
      return null;
    }
    const mine = sinks.filter(function (s) { return s.fn === fnName; });
    if (mine.length !== 1) {
      violations.push('[seamShape] ⛔ ' + tag + ' RESOLVES TO ' + mine.length +
        ' HTML SINKS IN ' + JSON.stringify(fnName) + ', expected exactly 1. ' +
        'A function that gained or lost a sink is exactly the change that ' +
        'makes the comment stale; re-measure and mark every sink.');
      return null;
    }
    return mine[0];
  }

  // --- 4. Compare BY VALUE, printing both sides. Never "they match".
  sinkMarks.forEach(function (mk) {
    const sink = resolve(mk.fn, 'SEAM-SINK-MARK');
    if (!sink) { return; }
    const measured = sink.segments.length;
    // ⛔ THE POSITIVE CONTROL, BEFORE ANY COMPARISON. A splitter that silently
    // returned an empty list would make the equality pass on two zeros — the
    // vacuous zero this project has recorded passing before.
    console.log('  [seamShape/' + mk.fn + '] segments stated=' + mk.segments +
      ' measured=' + measured + ' (sink at app.js:' + sink.sinkLine + ')');
    if (!(measured > 1)) {
      violations.push('[seamShape] ⛔ THE SPLITTER RETURNED ' + measured +
        ' SEGMENT(S) FOR ' + JSON.stringify(mk.fn) + ' — a sink with one or ' +
        'no depth-0 segments means the instrument looked nowhere, and any ' +
        'equality drawn from it would be vacuous. NOT compared.');
      return;
    }
    if (measured !== mk.segments) {
      violations.push('[seamShape] ⛔ THE SEAM-SHAPE COMMENT IS STALE FOR ' +
        JSON.stringify(mk.fn) + ': stated=' + mk.segments + ' measured=' +
        measured + ' depth-0 segments (marker at app.js:' + mk.line +
        ', sink at app.js:' + sink.sinkLine + '). Something was ' +
        'concatenated into that sink, or taken out of it, and the comment ' +
        'above it now describes a shape the gate does not have. ⛔ RE-MEASURE ' +
        'AND REWRITE THE COMMENT — do not edit the number to match.');
      return;
    }
    // The largest segment must be one of the NAMED blind regions, or a new
    // large blind region has appeared with nothing saying so.
    let largest = sink.segments[0];
    sink.segments.forEach(function (s) {
      if (s.lines > largest.lines) { largest = s; }
    });
    const named = blindMarks.some(function (b) {
      return b.fn === mk.fn && b.index === largest.index;
    });
    console.log('  [seamShape/' + mk.fn + '] largest segment index=' +
      largest.index + ' lines=' + largest.lines + ' named=' + named);
    if (!named) {
      violations.push('[seamShape] ⛔ THE LARGEST DEPTH-0 SEGMENT OF ' +
        JSON.stringify(mk.fn) + ' IS UNNAMED: index=' + largest.index +
        ' spanning ' + largest.lines + ' source lines. A segment passes the ' +
        'seam gate on ONE hit anywhere inside it, so the biggest one is the ' +
        'biggest blind region — and the comment does not mention it. That ' +
        'is the exact defect 26.96-36 exists to stop repeating.');
    }
  });

  blindMarks.forEach(function (mk) {
    const sink = resolve(mk.fn, 'SEAM-BLIND-MARK');
    if (!sink) { return; }
    const seg = sink.segments[mk.index];
    if (!seg) {
      violations.push('[seamShape] ⛔ SEAM-BLIND-MARK NAMES SEGMENT ' +
        mk.index + ' OF ' + JSON.stringify(mk.fn) + ', WHICH DOES NOT ' +
        'EXIST — the sink now has ' + sink.segments.length + ' depth-0 ' +
        'segments (marker at app.js:' + mk.line + '). Re-measure.');
      return;
    }
    console.log('  [seamShape/' + mk.fn + '/seg' + mk.index + '] lines ' +
      'stated=' + mk.lines + ' measured=' + seg.lines +
      ' seamEvident=' + seg.seamEvident);
    if (seg.lines !== mk.lines) {
      violations.push('[seamShape] ⛔ THE SEAM-SHAPE COMMENT IS STALE FOR ' +
        JSON.stringify(mk.fn) + ' seg' + mk.index + ': stated=' + mk.lines +
        ' measured=' + seg.lines + ' source lines (marker at app.js:' +
        mk.line + '). The blind region changed size and the comment did ' +
        'not. ⛔ RE-MEASURE AND REWRITE THE COMMENT — do not edit the number ' +
        'to match.');
    }
    if (!seg.seamEvident) {
      violations.push('[seamShape] ⛔ ' + JSON.stringify(mk.fn) + ' seg' +
        mk.index + ' IS NOT SEAM-EVIDENT UNDER THE GATE\'S OWN SEAM_RE, so ' +
        'calling it a BLIND REGION is wrong: it does not clear the gate on ' +
        'one hit, it would be reported by the gate itself. The comment is ' +
        'describing something other than what is there.');
    }
  });

  // --- 5. (26.96-40) THE PANE ENUMERATES ITS OWN SINKS AND THE COUNT IS
  //        COMPARED BY VALUE.
  //
  // ⛔ WHY THIS EXISTS AND WHAT WENT WRONG WITHOUT IT. Sections 4 and the
  // blind-region loop above iterate `sinkMarks` — the sinks the comment
  // ALREADY NAMES. 26.96-VERIFICATION.md round 4 planted a THIRD sink in
  // this pane (`paintRosterFooter`, carrying an unescaped folder path into
  // an HTML attribute AND a text node) and this file exited 0 with all
  // seven figures printed unchanged, while tests/test_no_push.cjs reported
  // only its unrelated pre-existing violation. A gate that iterates marks
  // cannot see a mark nobody wrote. ⛔ So this section ENUMERATES.
  //
  // ⛔ TWO INDEPENDENT CHECKS, DELIBERATELY NOT ONE. The count check catches
  // a sink appearing; the unmarked-function check catches a sink appearing
  // WHOSE AUTHOR ALSO BUMPED THE COUNT. Either alone would have a hole the
  // other closes, and both were driven red on the same plant.
  //
  // ⛔ STILL NOT A WIDENING OF THE SEAM GATE. tests/test_no_push.cjs is read
  // and never edited; nothing here asks it to inspect anything new. Its
  // reach stays filed at
  // .planning/todos/pending/2026-08-21-seam-gate-blind-region-scope.md.
  if (!paneMarks.length) {
    violations.push('[seamShape] ⛔ NO SEAM-PANE-MARK LINE IN app.js. The ' +
      'NUMBER OF HTML SINKS THIS PANE OWNS is then stated nowhere a machine ' +
      'reads, which is the exact state 26.96-VERIFICATION.md round 4 drove a ' +
      'third unescaped sink through. ⛔ PUT IT BACK AND RE-MEASURE — do not ' +
      'delete this check.');
  }
  paneMarks.forEach(function (pm) {
    const begins = paneBegins.filter(function (b) { return b.pane === pm.pane; });
    const ends = paneEnds.filter(function (e) { return e.pane === pm.pane; });
    if (begins.length !== 1 || ends.length !== 1) {
      violations.push('[seamShape] ⛔ THE PANE REGION ' + JSON.stringify(pm.pane) +
        ' IS NOT DELIMITED EXACTLY ONCE: found ' + begins.length +
        ' SEAM-PANE-BEGIN line(s) and ' + ends.length + ' SEAM-PANE-END ' +
        'line(s) (count marker at app.js:' + pm.line + '). Without exactly ' +
        'one of each there is no span to enumerate, so the sink count is ' +
        'unchecked. ⛔ RESTORE THE DELIMITERS AND RE-MEASURE — do not delete ' +
        'the marker.');
      return;
    }
    const from = begins[0].line;
    const to = ends[0].line;
    if (!(to > from)) {
      violations.push('[seamShape] ⛔ THE PANE REGION ' + JSON.stringify(pm.pane) +
        ' CLOSES AT app.js:' + to + ' BEFORE IT OPENS AT app.js:' + from +
        '. An inverted span encloses nothing and every sink in the pane ' +
        'would fall outside it unnoticed. ⛔ RE-MEASURE THE BOUNDARY.');
      return;
    }
    const paneSinks = sinks.filter(function (s) {
      return s.sinkLine > from && s.sinkLine < to;
    });
    // ⛔ VACUITY CONTROL, BEFORE ANY COMPARISON. A span that encloses no
    // sink at all would make `0 === 0` pass on an instrument that looked
    // nowhere — the vacuous zero this project has recorded passing before.
    if (!paneSinks.length) {
      violations.push('[seamShape] ⛔ THE PANE REGION ' + JSON.stringify(pm.pane) +
        ' (app.js:' + from + '–' + to + ') CONTAINS NO HTML SINK AT ALL. ' +
        'Either the boundary was narrowed until it encloses nothing, or the ' +
        'enumeration is broken. Any equality drawn from that is vacuous, so ' +
        'NONE IS DRAWN. ⛔ RE-MEASURE THE BOUNDARY.');
      return;
    }
    console.log('  [seamShape/' + pm.pane + '] sinks stated=' + pm.sinks +
      ' measured=' + paneSinks.length + ' (span app.js:' + from + '–' + to +
      ') in: ' + paneSinks.map(function (s) {
        return s.fn + '@' + s.sinkLine + '[' + s.shape + ']';
      }).join(' '));
    if (paneSinks.length !== pm.sinks) {
      violations.push('[seamShape] ⛔ THE PANE SINK COUNT IS STALE FOR ' +
        JSON.stringify(pm.pane) + ': stated=' + pm.sinks + ' measured=' +
        paneSinks.length + ' HTML sinks between app.js:' + from + ' and ' +
        'app.js:' + to + ' (marker at app.js:' + pm.line + '). Sinks found: ' +
        paneSinks.map(function (s) {
          return s.fn + '@' + s.sinkLine + '[' + s.shape + ']';
        }).join(', ') +
        '. A sink was added to or removed from the room\'s strongest privacy ' +
        'control and the comment did not say so. ⛔ RE-MEASURE AND REWRITE ' +
        'THE MARKER — do not edit the number to match, and do not move a ' +
        'delimiter to make the count agree.');
    }
    // ⛔ THE SECOND, INDEPENDENT CHECK. A pane sink whose enclosing function
    // carries no SEAM-SINK-MARK is a sink NOTHING measures: its depth-0
    // segment count is unstated and its blind regions are unnamed, so the
    // seam gate clears it on one hit anywhere and no comment says where.
    paneSinks.forEach(function (s) {
      const marked = sinkMarks.some(function (mk) { return mk.fn === s.fn; });
      if (marked) { return; }
      let largest = s.segments[0];
      s.segments.forEach(function (g) { if (g.lines > largest.lines) { largest = g; } });
      const evident = s.segments.filter(function (g) { return g.seamEvident; }).length;
      violations.push('[seamShape] ⛔ AN UNMARKED HTML SINK IS INSIDE THE ' +
        'PANE REGION ' + JSON.stringify(pm.pane) + ': ' + JSON.stringify(s.fn) +
        ' at app.js:' + s.sinkLine + ' (found by the lifted sink shape ' +
        JSON.stringify(s.shape) + ') carries NO SEAM-SINK-MARK. What is ' +
        'unmeasured about it: its right-hand side splits into ' +
        s.segments.length + ' depth-0 segment(s), of which ' + evident +
        ' clear the seam gate on a single hit and are therefore never ' +
        'looked into again; its largest is seg' + largest.index + ' at ' +
        largest.lines + ' source line(s), and NOTHING names it as a blind ' +
        'region. ⛔ MARK IT AND RE-MEASURE. This is the check that would ' +
        'have caught the third sink 26.96-VERIFICATION.md drove past both ' +
        'gates — and it fires INDEPENDENTLY of the count above, so bumping ' +
        'the count does not silence it.');
    });
    // ⛔ (26.96-40 task 2) THE OTHER DIRECTION, AND WITHOUT IT THE COUNT
    // CHECK IS DEFEATABLE BY MOVING A COMMENT. Every function the seam
    // comment ALREADY marks must resolve to a sink INSIDE this span. Narrow
    // the boundary until it encloses nothing and `measured` falls with it —
    // so a marker of 0 would agree with a region that watches nothing. A
    // marked sink that has drifted outside the boundary is therefore a
    // NAMED failure, not a quiet one.
    sinkMarks.forEach(function (mk) {
      const mine = sinks.filter(function (s) { return s.fn === mk.fn; });
      // A marker naming no sink, or more than one, is already NAMED by
      // resolve() in section 4. Re-reporting it here would say the same
      // thing twice and hide this check's own meaning.
      if (mine.length !== 1) { return; }
      const s = mine[0];
      if (s.sinkLine > from && s.sinkLine < to) { return; }
      violations.push('[seamShape] ⛔ A MARKED SINK HAS DRIFTED OUTSIDE THE ' +
        'PANE REGION ' + JSON.stringify(pm.pane) + ': SEAM-SINK-MARK names ' +
        JSON.stringify(mk.fn) + ' (marker at app.js:' + mk.line + ') whose ' +
        'sink is at app.js:' + s.sinkLine + ', and the region runs ' +
        'app.js:' + from + '–' + to + '. Either a delimiter moved or the ' +
        'sink did. ⛔ A BOUNDARY THAT EXCLUDES A MARKED SINK IS A BOUNDARY ' +
        'THAT HIDES ONE, and narrowing it far enough would let a sink ' +
        'count of nearly nothing agree with a region that watches nearly ' +
        'nothing. RE-MEASURE THE BOUNDARY — do not move a delimiter to ' +
        'clear a red.');
    });
  });

  // --- 6. (26.96-41) A BLIND REGION STOPS BEING GATED ONLY BY ITS OWN
  //        LENGTH. A raw value interpolation added inside one is NAMED.
  //
  // ⛔ WHY THIS EXISTS, IN THE COMMENT'S OWN WORDS. The seam-shape comment
  // says of the picker's segment — the LARGEST in this sink, larger than the
  // row map that IS gated — "That is a fact about today's CONTENTS, not
  // about the SHAPE — interpolate something in there and nothing will say
  // so." That sentence was true. Sections 4 and 5 assert a blind region's
  // LENGTH and its seam-evidence, and NEITHER property changes when a raw
  // interpolation is added inside it: driven in a clean clone before this
  // was written, a bare `+ pickedFolder +` planted inside the picker's
  // segment left this suite at exit 0 with all seven figures printed
  // unchanged and the identifier named ZERO times in the whole output.
  //
  // ⛔ IT USES THE OFFSETS THE GROUP ALREADY COMPUTES. `splitSegments`
  // returns [start, end) pairs in section 3; they are now CARRIED on each
  // segment rather than discarded. Nothing is re-split and no second offset
  // computation exists, because a second source of truth for where a
  // segment begins is the defect this whole group was built against.
  //
  // ⛔ IT IS NOT A WIDENING OF THE SEAM GATE. tests/test_no_push.cjs is read
  // and never edited. Its reach stays filed at
  // .planning/todos/pending/2026-08-21-seam-gate-blind-region-scope.md.
  //
  // ⚠ THE LIMIT, STATED RATHER THAN IMPLIED. This names a `+` operand that
  // is a BARE IDENTIFIER OR MEMBER CHAIN. An operand that is a CALL to
  // something other than an escaper (`makeLabel(folder)`) is counted in the
  // printed `other=` figure and is NOT a violation — widening it to every
  // call would go red on `list.map(...).join('')` at this head. The figure
  // is printed on every run so an `other=` above zero is visible rather
  // than silent.
  const ESC_ALT = gate.SEAM_RE.source.match(/\((?:\?:)?([A-Za-z0-9_$|]+)\)/);
  const ESCAPERS = ESC_ALT ? ESC_ALT[1].split('|') : [];
  // ⛔ DERIVED FROM THE LIVE GATE'S OWN SEAM_RE, NEVER TYPED. A typed list
  // agrees with whatever its author believed on the day — the mirrored-test
  // trap. And the derivation is PINNED BACK against the regex it came from:
  // every derived name must itself satisfy SEAM_RE, so a regex reshaped
  // into something this alternation-scrape misreads is a NAMED failure and
  // not a quietly shorter list.
  if (!ESCAPERS.length) {
    violations.push('[seamShape] ⛔ COULD NOT DERIVE THE ESCAPER NAMES FROM ' +
      'THE LIVE GATE\'S SEAM_RE (' + String(gate.SEAM_RE) + '). The ' +
      'blind-region interpolation check strips escaper calls before it ' +
      'scans, so with no names it strips nothing — and a scan that strips ' +
      'nothing sees every escaped value as raw, or is softened until it ' +
      'sees nothing at all. ⛔ FIX THE DERIVATION AGAINST THE REGEX\'S NEW ' +
      'SHAPE — do not type a list here.');
  }
  ESCAPERS.forEach(function (n) {
    if (gate.SEAM_RE.test(n + '(')) { return; }
    violations.push('[seamShape] ⛔ THE ESCAPER NAME ' + JSON.stringify(n) +
      ' WAS SCRAPED OUT OF SEAM_RE BUT DOES NOT SATISFY IT. The derivation ' +
      'and the regex disagree, so what this check strips is not what the ' +
      'seam gate accepts. ⛔ FIX THE DERIVATION.');
  });
  // Literals and comments are blanked to a SENTINEL, not to a space.
  // ⚠ MEASURED, NOT ASSUMED: `codeOnly` blanks them to SPACES, and a scanner
  // that walks back over whitespace from a `+` then walks straight over a
  // blanked literal and lands on whatever precedes it — driven here, that
  // reported the keyword `return` as an interpolated identifier in
  // paintRosterChoices seg2. The mask is the gate's OWN member; only how it
  // is rendered differs, and nothing is re-implemented.
  const LIT_CH = '\u0001';
  const ESC_CH = '\u0002';
  // ⛔⛔ 26.96-52: AN INTERPOLATION INSIDE A BACKTICK RUN IS CODE, AND THIS
  // CHECK NOW READS IT AS CODE. The gate's mask marks a whole template
  // literal as string content — its own comment says so — so the run was
  // blanked to LIT_CH BEFORE any part of it was ever judged, and a raw value
  // inside an interpolation sat in the same bin as ordinary markup.
  //
  // ⛔ DRIVEN BEFORE IT WAS WRITTEN, at 8138710 in a clean detached clone. A
  // backtick run carrying her folder name, planted in ATTRIBUTE position
  // inside the picker's own segment, left this suite at EXIT 0: seg1's part
  // `literal` bin moved 16 → 22, `bare` stayed at 0, and the name appeared
  // NOWHERE in the output. ⚠ THE SHIPPED SEAM GATE DID NAME IT in the same
  // drill, as an interpolation carrying no escaper — so the composite had
  // no hole here and only this instrument was blind.
  //
  // ⛔ THE REASON TO CLOSE IT ANYWAY: instruments that each miss what the
  // other catches are held together by coincidence, and this phase has
  // already recorded what happens when one of a pair moves. The pair now
  // AGREE about what an interpolation is.
  //
  // ⛔ CHARACTER-FOR-CHARACTER. Every index writes exactly one character and
  // a newline stays a newline, so every offset and every line number
  // downstream still holds — that property is why the sentinel exists
  // rather than a space, and breaking it would move every figure this group
  // prints.
  const TPL_CH = '\u0003';
  // 0 = masked as before · 1 = the original character carried through as
  // CODE (the interpolation's own brace, its body, and its closing brace)
  // · 2 = the dollar of an interpolation opener, written as the marker the
  // splitter below reads.
  const tplAct = new Uint8Array(appSrc.length);
  const tplSpans = [];
  const tplUnbounded = [];
  let tplRuns = 0;
  let tplInterpSeen = 0;
  let tplInterpRead = 0;
  {
    let ti = 0;
    while (ti < appSrc.length) {
      if (mask[ti] !== 's') { ti++; continue; }
      let tj = ti;
      while (tj < appSrc.length && mask[tj] === 's') { tj++; }
      if (appSrc[ti] === '`') {
        tplRuns++;
        // ⛔ SEEN IS COUNTED TEXTUALLY AND INDEPENDENTLY OF THE BOUNDING STEP
        // BELOW. A figure derived FROM the bounding step would fall to zero
        // beside a `seen` that fell to zero too, and the conservation
        // identity would then hold vacuously — which is the exact shape of
        // failure this round exists to end.
        tplInterpSeen += (appSrc.slice(ti, tj).match(/\$\{/g) || []).length;
        for (let k = ti; k + 1 < tj; k++) {
          if (appSrc[k] !== '$' || appSrc[k + 1] !== '{') { continue; }
          // ⛔ THE BALANCED MATCHER THIS GROUP ALREADY LIFTED FROM THE
          // SHIPPED GATE. No second one is written here: a second answer to
          // "where does this end" is the defect this whole group was built
          // against.
          const rest = appSrc.slice(k + 2, tj);
          const rel = gate.findAtDepthZero(rest, maskAllCode(rest), 0, '}');
          if (rel < 0) {
            tplUnbounded.push({ line: lineOf(k),
              text: appSrc.slice(k, Math.min(k + 60, tj)) });
            continue;
          }
          const close = k + 2 + rel;
          tplAct[k] = 2;
          for (let q = k + 1; q <= close; q++) { tplAct[q] = 1; }
          tplSpans.push({ at: k, close: close });
          tplInterpRead++;
          k = close;
        }
      }
      ti = tj;
    }
  }
  let marked = '';
  for (let mi = 0; mi < appSrc.length; mi++) {
    marked += (mask[mi] === 'c') ? appSrc[mi]
      : (tplAct[mi] === 1 ? appSrc[mi]
        : (tplAct[mi] === 2 ? TPL_CH
          : (appSrc[mi] === '\n' ? '\n' : LIT_CH)));
  }
  // ⛔⛔ THE PROOF THE CARRY ACTUALLY HAPPENED, READ BACK OUT OF THE MASK BY
  // VALUE rather than counted at the moment of intending it.
  let tplCarriedVerified = 0;
  tplSpans.forEach(function (s) {
    if (marked.slice(s.at, s.close + 1) ===
        TPL_CH + appSrc.slice(s.at + 1, s.close + 1)) {
      tplCarriedVerified++;
      return;
    }
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: AN INTERPOLATION ' +
      'THIS CHECK RECORDED AS CARRIED IN AS CODE IS NOT IN THE MASK IT ' +
      'BUILT, at app.js:' + lineOf(s.at) + '. The carry step and the mask ' +
      'disagree about the same bytes, so every part tally below is read ' +
      'from text this check does not understand. ⛔ FIX THE CARRY, and do ' +
      'not delete this check.');
  });
  // ⛔⛔ PRINTED BY VALUE ON EVERY RUN, RED OR GREEN, AND BEFORE ANY VERDICT.
  // ⚠ WHAT A ZERO HERE MEANS, STATED SO IT CANNOT BE MISREAD: at this head
  // `templateRuns` is itself zero — app.js contains no template literal at
  // all, every one of its backticks being inside a comment, which the mask
  // marks 'm' and never 's' — so `readIntoAsCode=0` is the only correct
  // reading and is NOT evidence that the treatment works. ⛔ READ IT AGAINST
  // `templateRuns` AND `interpolationsSeen`, never on its own: a `seen` above
  // zero with a `readIntoAsCode` below it is the treatment having silently
  // stopped firing, and the identity below turns that into a NAMED failure
  // rather than a figure nobody reads.
  console.log('  [seamShape/interpolation] templateRuns=' + tplRuns +
    ' interpolationsSeen=' + tplInterpSeen +
    ' readIntoAsCode=' + tplInterpRead +
    ' carriedVerifiedInMask=' + tplCarriedVerified +
    ' named=' + tplUnbounded.length +
    ' identity(' + tplInterpSeen + '=' + tplInterpRead + '+' +
    tplUnbounded.length + ')');
  if (tplInterpSeen !== tplInterpRead + tplUnbounded.length) {
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: THE INTERPOLATION ' +
      'CONSERVATION IDENTITY DOES NOT HOLD — ' + tplInterpSeen +
      ' seen, ' + tplInterpRead + ' read into as code, ' +
      tplUnbounded.length + ' named. Every interpolation inside a backtick ' +
      'run is either READ INTO or NAMED; a shortfall means this check is ' +
      'judging fewer of them than it found while still printing a clean ' +
      'count. ⛔ THAT IS THE CLASS THIS ROUND WAS PLANNED AGAINST. Fix the ' +
      'carry or name the case, and do not narrow the identity.');
  }
  if (tplCarriedVerified !== tplInterpRead) {
    violations.push('[seamShape] ⛔ BROKEN INSTRUMENT: ' + tplInterpRead +
      ' interpolations were recorded as carried in as code but only ' +
      tplCarriedVerified + ' of them are actually in the mask.');
  }
  tplUnbounded.forEach(function (h) {
    violations.push('[seamShape] ⛔ AN INTERPOLATION INSIDE A BACKTICK RUN ' +
      'HAS NO END THIS CHECK CAN FIND: ' + JSON.stringify(h.text) +
      ' at app.js:' + h.line + '. Its characters were therefore left masked ' +
      'as a literal and NOTHING is known about whether a raw value reaches ' +
      'the markup through it. ⛔ THIS IS A NAMED FAILURE AND NOT A PRINTED ' +
      'FIGURE, because a check that comes up short while printing a clean ' +
      'count is this phase\'s most expensive defect. Teach the bounding ' +
      'step the shape, and do not skip it.');
  });
  // Remove each escaper call TOGETHER WITH its whole parenthesised argument,
  // by balanced-paren matching, replacing it with an equal run of sentinels
  // so every offset and line number downstream still holds.
  function stripEscaperCalls(src, names) {
    if (!names.length) { return { code: src, removed: 0 }; }
    const re = new RegExp('\\b(?:' + names.join('|') + ')\\s*\\(', 'g');
    let out = '';
    let i = 0;
    let removed = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m.index < i) { re.lastIndex = i; continue; }
      const open = m.index + m[0].length - 1;
      let depth = 0;
      let end = -1;
      for (let j = open; j < src.length; j++) {
        const c = src[j];
        if (c === '(') { depth++; }
        else if (c === ')') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end === -1) { break; }
      out += src.slice(i, m.index);
      out += src.slice(m.index, end + 1).replace(/[^\n]/g, ESC_CH);
      i = end + 1;
      removed++;
      re.lastIndex = end + 1;
    }
    out += src.slice(i);
    return { code: out, removed: removed };
  }
  const OPEN_CH = '([{';
  const CLOSE_CH = ')]}';
  function leftOperand(s, i) {
    let depth = 0;
    let b = -1;
    for (let j = i - 1; j >= 0; j--) {
      const c = s[j];
      if (CLOSE_CH.indexOf(c) >= 0) { depth++; continue; }
      if (OPEN_CH.indexOf(c) >= 0) {
        if (depth === 0) { b = j; break; }
        depth--;
        continue;
      }
      if (depth === 0 && '+,;?:=&|!<>'.indexOf(c) >= 0) { b = j; break; }
    }
    return s.slice(b + 1, i);
  }
  function rightOperand(s, i) {
    let depth = 0;
    let b = s.length;
    for (let j = i + 1; j < s.length; j++) {
      const c = s[j];
      if (OPEN_CH.indexOf(c) >= 0) { depth++; continue; }
      if (CLOSE_CH.indexOf(c) >= 0) {
        if (depth === 0) { b = j; break; }
        depth--;
        continue;
      }
      if (depth === 0 && '+,;?:'.indexOf(c) >= 0) { b = j; break; }
    }
    return s.slice(i + 1, b);
  }
  const CHAIN_RE =
    /^[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*|\s*\[\s*[0-9]+\s*\])*$/;
  const NOT_A_VALUE = ['true', 'false', 'null', 'undefined', 'this', 'NaN',
    'Infinity', 'typeof', 'void', 'new', 'return', 'case', 'in', 'of',
    'instanceof', 'delete'];
  function unwrapParens(t) {
    t = t.trim();
    while (t.length > 1 && t[0] === '(' && t[t.length - 1] === ')') {
      let depth = 0;
      let whole = true;
      for (let k = 0; k < t.length; k++) {
        if (t[k] === '(') { depth++; }
        else if (t[k] === ')') {
          depth--;
          if (depth === 0 && k < t.length - 1) { whole = false; break; }
        }
      }
      if (!whole) { break; }
      t = t.slice(1, -1).trim();
    }
    return t;
  }
  function classifyOperand(t) {
    // ⛔ THE PARENS COME OFF FIRST, AND THAT IS NOT TIDINESS. Removing an
    // escaper's NAME and leaving its argument turns `escapeAttr(folder)`
    // into `(folder)` — a raw interpolation wearing a bracket. Without this
    // unwrap that arm reads exactly like a clean region, and a mutation
    // that reads like a clean region is the false verdict this project has
    // paid for more than once.
    return classifyAtom(unwrapParens(t));
  }
  // ⛔⛔ 26.96-51: A MEMBER ACCESS IS STILL A MEMBER ACCESS WHEN ITS KEY IS
  // WRITTEN AS A STRING. `list['pickedFolder']` carries a MASKED STRING
  // LITERAL inside itself — the key's own quotes and characters became
  // LIT_CH before this pass ever ran — so `classifyAtom`'s literal test
  // fired on the SUBSCRIPT'S OWN KEY and binned the WHOLE part as
  // `literal`, the same bucket as ordinary markup, before the member-chain
  // test was ever reached. ⛔ THE ORDER WAS THE DEFECT, so the repair is one
  // step placed AHEAD of the literal test and nowhere else: anywhere after
  // it and the part has already been swallowed.
  //
  // ⛔ DRIVEN BEFORE IT WAS WRITTEN, at 99f2800 in a clean detached clone:
  // `data-x="' + (list['pickedFolder'] || '') + '"` planted in ATTRIBUTE
  // position inside the picker's own segment left this suite at EXIT 0,
  // with seg1's `literal` bin moving 16 -> 22 and `bare` staying at 0 —
  // and `tests/test_no_push.cjs` reported zero `[seam]` violations on the
  // same plant. ⛔ IT IS THE ONE VALUE SHAPE NEITHER INSTRUMENT NAMED.
  //
  // ⛔ ONLY A SUBSCRIPT WHOSE CONTENTS ARE NOTHING BUT THE SENTINEL IS
  // NORMALISED, and that narrowness is deliberate rather than incidental.
  // `list[i + 1]`, `list[keyFor(x)]`, `list[a[b]]` — anything carrying code
  // beside the sentinel — is left exactly as it stood, reaches the existing
  // tests unchanged, and if it cannot be read remains a NAMED FAILURE.
  // ⛔ WIDENING WHAT COUNTS AS A VALUE IS NOT THIS REPAIR'S TO DO; folding
  // an unrelated shape in while the file is open is the move this round
  // exists to refuse.
  const LIT_SUBSCRIPT_RE = new RegExp('\\[\\s*' + LIT_CH + '+\\s*\\]', 'g');
  // The step a normalised subscript becomes. ⛔ ITS NAME IS NEVER SHOWN TO A
  // READER — see the `id` below — it exists only so CHAIN_RE can judge the
  // SHAPE of what remains.
  const LIT_KEY_STEP = '.$litKey';
  function normaliseLiteralSubscripts(u) {
    return u.replace(LIT_SUBSCRIPT_RE, LIT_KEY_STEP);
  }
  // ⛔ THE ATOMIC JUDGEMENT, SEPARATED FROM THE WHOLE-OPERAND ONE SO THE
  // COMPOSITIONAL PASS BELOW CAN REUSE IT VERBATIM. Its body is byte-for-byte
  // what `classifyOperand` used to do after the unwrap; nothing about the
  // whole-operand verdict, its printed tallies, or 26.96-41's own violation
  // changed, because a rewrite that silently moved the figure it is compared
  // against would make every comparison in this group meaningless.
  function classifyAtom(u) {
    if (u === '') { return { kind: 'empty' }; }
    if (u.indexOf(ESC_CH) >= 0) { return { kind: 'escaped' }; }
    // ⛔ 26.96-51: THE NORMALISATION, AND IT SITS HERE ON PURPOSE — ahead of
    // the literal test, which is the whole of the fix.
    const n = normaliseLiteralSubscripts(u);
    if (n.indexOf(LIT_CH) >= 0) { return { kind: 'literal' }; }
    // ⛔ `renorm` IS SET ONLY WHEN THE REWRITE ACTUALLY CHANGED THE VERDICT:
    // the subscript form was present AND what remains is no longer a
    // literal. A rewrite that fired and still binned as `literal` returned
    // on the line above and is NOT counted — so the figure printed from
    // this flag counts RE-CLASSIFICATIONS, never mere matches. A count of
    // matches would keep reading healthy while the fix did nothing.
    const renorm = (n !== u);
    if (CHAIN_RE.test(n) &&
        NOT_A_VALUE.indexOf(n.split(/[.[]/)[0].trim()) === -1) {
      // ⛔⛔ THE VIOLATION MUST NAME REAL SOURCE, NOT THE NORMALISED FORM.
      // The key's own characters were masked out before this classifier ran,
      // so `list.$litKey` is not what anyone wrote and must never be shown
      // as though it were. `show` renders the sentinel run back as `"…"`,
      // giving `list["…"]` — which points a reader at the operand as it
      // stands in the region AND says plainly that the key was a string
      // whose text this pass cannot recover. ⛔ Quoting a form the source
      // does not contain would send a reader looking for a line that is not
      // there.
      return { kind: 'bare', id: renorm ? show(u) : u.replace(/\s+/g, ''),
        renorm: renorm };
    }
    return { kind: 'other', text: u.replace(/\s+/g, ' ').slice(0, 60),
      renorm: renorm };
  }

  // --- 6a. (26.96-45) ⛔⛔ A LITERAL SOMEWHERE INSIDE AN OPERAND NO LONGER
  //         MAKES THE WHOLE OPERAND A LITERAL.
  //
  // ⛔ WHY THIS EXISTS. `classifyAtom` asks whether a literal appears
  // ANYWHERE in the operand and, if it does, bins the whole thing as
  // `literal` — the same bucket as ordinary markup — and never looks again.
  // A raw interpolation wearing a default is therefore invisible, and it is
  // one of the commonest shapes in this file. Driven in a clean clone at
  // a6a5fbb, three plants inside the picker's own segment
  // (`renderRosterEditor` seg1) each left this suite at EXIT 0:
  //   `+ (list.pickedFolder || '') +`                 → literal 16→18
  //   `... 0 0' + (list.pickedFolder || '') + '">'`   → literal 16→20
  //   `+ (list[list.length] || '') +`                 → literal 16→18
  // ⛔ THE SECOND OF THOSE PUTS AN UNESCAPED NAME STRAIGHT INSIDE A QUOTED
  // HTML ATTRIBUTE VALUE, and the movement landed in the one bin that also
  // moves for entirely benign reasons — so nothing could have been read off
  // it. The bare-identifier plant 26.96-41 was written to catch was caught
  // in the same set of runs, which is why the gap read as closed.
  //
  // ⛔ IT REUSES THE SHIPPED GATE'S OWN DEPTH-ZERO PRIMITIVES. `findAtDepthZero`
  // and `splitSegments` are LIFTED members (see the MEMBERS list above); no
  // second depth walker is written here, because a second source of truth for
  // where depth zero is, is the defect this whole group was built against.
  //
  // ⛔ THE SPLIT IS BY PRECEDENCE AND EACH LEVEL KEEPS ONLY WHAT CAN REACH
  // THE MARKUP — this is semantics, not a special case for the plants:
  //   `A ? B : C`  → A is a GUARD and is dropped; B and C are emitted.
  //   `A && B`     → A is a GUARD (when it decides, it emits a FALSY value,
  //                  which cannot carry an injection); B is emitted.
  //   `A || B`, `A ?? B` → EITHER can be the emitted value; both are kept.
  //   `A + B`      → both are emitted.
  // ⚠ Dropping guards is what keeps the real head green: `(inList ? '<div
  // class="' + escapeAttr(slotClass) + '"></div>' : '')` must not report
  // `inList`, which never reaches a sink.
  function maskAllCode(t) {
    const m = new Array(t.length);
    for (let k = 0; k < t.length; k++) { m[k] = 'c'; }
    return m;
  }
  // ⚠ THE MASK IS ALL-CODE BY CONSTRUCTION AND THAT IS SAFE HERE, not a
  // shortcut: every string literal and comment in this text was already
  // replaced by LIT_CH, and every escaper call by ESC_CH, before it reached
  // this function. There is no quote left for a mask to protect.
  function depthZeroOps(t, ch, dbl) {
    const m = maskAllCode(t);
    const out = [];
    let at = 0;
    for (;;) {
      const i = gate.findAtDepthZero(t, m, at, ch);
      if (i < 0) { break; }
      const dblHere = (t[i + 1] === ch);
      const ok = dbl ? dblHere
        : (!dblHere && t[i - 1] !== ch && t[i + 1] !== '.');
      if (ok) { out.push(i); at = i + (dbl ? 2 : 1); }
      else { at = i + 1; }
    }
    return out;
  }
  function cutAt(t, positions, width) {
    const parts = [];
    let from = 0;
    positions.forEach(function (pos) {
      parts.push(t.slice(from, pos));
      from = pos + width;
    });
    parts.push(t.slice(from));
    return parts;
  }
  const PART_DEPTH_CAP = 8;
  function valueParts(t, depth) {
    const u = unwrapParens(t);
    if (u === '' || depth > PART_DEPTH_CAP) { return [u]; }
    function below(list) {
      let out = [];
      list.forEach(function (x) {
        out = out.concat(valueParts(x, depth + 1));
      });
      return out;
    }
    // 1. conditional — drop the condition, keep every branch.
    const q = depthZeroOps(u, '?', false);
    if (q.length) {
      const cuts = cutAt(u, q.concat(depthZeroOps(u, ':', false))
        .sort(function (a, b) { return a - b; }), 1);
      cuts.shift();
      return below(cuts);
    }
    // 2. short-circuit default and nullish — EITHER side can be emitted.
    const orPos = depthZeroOps(u, '|', true)
      .concat(depthZeroOps(u, '?', true))
      .sort(function (a, b) { return a - b; });
    if (orPos.length) { return below(cutAt(u, orPos, 2)); }
    // 3. logical and — every operand but the last is a guard.
    const andPos = depthZeroOps(u, '&', true);
    if (andPos.length) {
      const cuts = cutAt(u, andPos, 2);
      return below([cuts[cuts.length - 1]]);
    }
    // 4. concatenation — the SHIPPED gate's own splitter, never a second one.
    const segs = gate.splitSegments(u, maskAllCode(u), 0, u.length);
    if (segs.length > 1) {
      return below(segs.map(function (r) { return u.slice(r[0], r[1]); }));
    }
    // 5. (26.96-52) TEMPLATE-LITERAL CONCATENATION. ⛔ A backtick run IS a
    //    concatenation — inert quasis and interpolated VALUES — so it is
    //    split like one, and this level is the splitter's grammar being
    //    completed rather than a special case for a shape. It sits LAST
    //    because a template literal binds tighter than every operator above,
    //    and it is reached at all only because the mask carried the
    //    interpolation's own characters through as code.
    //    ⛔ THE QUASIS ARE EMITTED TOO, never dropped: they classify as
    //    `literal` exactly as the string operands around them do, so nothing
    //    leaves this pass unaccounted for.
    if (u.indexOf(TPL_CH) >= 0) {
      const chunks = [];
      let from = 0;
      let k = 0;
      let n = 0;
      let broke = false;
      while (k + 1 < u.length) {
        if (u[k] !== TPL_CH || u[k + 1] !== '{') { k++; continue; }
        // ⛔ THE SAME LIFTED MATCHER AS THE MASK STEP, never a second one.
        const rest = u.slice(k + 2);
        const rel = gate.findAtDepthZero(rest, maskAllCode(rest), 0, '}');
        if (rel < 0) { broke = true; break; }
        const close = k + 2 + rel;
        chunks.push(u.slice(from, k));
        chunks.push(u.slice(k + 2, close));
        from = close + 1;
        k = close + 1;
        n++;
      }
      if (broke) {
        // ⛔ NAMED, NEVER A SILENT `continue`. The operand is returned whole
        // so the classifier bins it `other` and the unclassified-part
        // violation fires on it as well.
        tplUnreadable.push(u);
        return [u];
      }
      if (n) {
        chunks.push(u.slice(from));
        pTplRead += n;
        return below(chunks);
      }
    }
    return [u];
  }
  // ⛔⛔ 26.96-52: THE NARROWED-LIFT ARM FOR THIS FIX, PER REGION.
  // `pTplRead` counts the interpolation runs this pass READ INTO in the
  // region being scanned — the work done, never a match found — and it is
  // printed beside the bins it moves parts between on every run, red or
  // green. ⚠ An operand seen from both sides of a `+` is visited twice and
  // counted twice, exactly as the `literal=` figure beside it is.
  let pTplRead = 0;
  const tplUnreadable = [];
  // Sentinels are unprintable; render them so a violation message can be
  // read by a human without a hex dump.
  function show(s) {
    return String(s)
      .replace(/\u0001+/g, '"\u2026"')
      .replace(/\u0002+/g, 'esc(\u2026)')
      // 26.96-52: TPL_CH stands for a character that IS in the source, so it
      // is rendered back as itself and a reader is pointed at the
      // interpolation as written.
      .replace(/\u0003/g, '$')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
  }
  blindMarks.forEach(function (mk) {
    const sink = resolve(mk.fn, 'SEAM-BLIND-MARK');
    if (!sink) { return; }
    const seg = sink.segments[mk.index];
    if (!seg) { return; }        // already NAMED by the loop above
    const stripped = stripEscaperCalls(marked.slice(seg.start, seg.end),
      ESCAPERS);
    const body = stripped.code;
    const bare = [];
    const seenOperand = {};
    let nLit = 0;
    let nEsc = 0;
    let nEmpty = 0;
    let nOther = 0;
    // 26.96-45: the compositional pass runs BESIDE the whole-operand one, and
    // never in place of it, so 26.96-41's own violation keeps firing on the
    // shape it was written for and stays available as a positive control.
    const barePart = [];
    const unclassified = [];
    const seenPart = {};
    const seenUnc = {};
    let pBare = 0;
    // ⛔⛔ 26.96-51: THE NARROWED-LIFT ARM FOR THIS FIX, AND IT IS THE REASON
    // THIS FIGURE EXISTS. A normalisation that quietly stopped firing —
    // because the mask changed, or the sentinel changed, or a spelling
    // drifted — would leave every count on this line reading EXACTLY as it
    // does today, and the suite would stay green while the shape it was
    // taught to see went back to hiding. ⛔ That is this round's own lesson
    // applied to this round's own fix: a check that can come up SHORT while
    // still printing a clean count is the same defect as one that drifts.
    // ⛔ A ZERO HERE MEANS THE NORMALISATION RE-CLASSIFIED NOTHING IN THIS
    // REGION — which is the correct and expected reading at a head where no
    // such subscript is written, and the WRONG one the moment a plant is in
    // place. Read it against the plant, never on its own.
    let pReNorm = 0;
    // 26.96-52: reset per region, so the printed figure belongs to THIS one.
    pTplRead = 0;
    tplUnreadable.length = 0;
    let pLit = 0;
    let pEsc = 0;
    let pEmpty = 0;
    let pOther = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== '+') { continue; }
      if (body[i + 1] === '+' || body[i + 1] === '=' || body[i - 1] === '+') {
        continue;
      }
      [leftOperand(body, i), rightOperand(body, i)].forEach(function (t) {
        const c = classifyOperand(t);
        if (c.kind === 'literal') { nLit++; }
        else if (c.kind === 'escaped') { nEsc++; }
        else if (c.kind === 'empty') { nEmpty++; }
        else if (c.kind === 'other') { nOther++; }
        else {
          // One operand is seen twice — as the right of one `+` and the
          // left of the next. Same identifier, same line, same operand:
          // reported once. ⛔ Keyed by BOTH, so a second genuine hit on
          // the same line is still reported.
          const key = c.id + '@' + lineOf(seg.start + i);
          if (seenOperand[key]) { return; }
          seenOperand[key] = true;
          bare.push({ id: c.id, line: lineOf(seg.start + i) });
        }
        // ⛔⛔ 26.96-45: AND NOW THE SAME OPERAND IS JUDGED PART BY PART.
        // The whole-operand verdict above is left exactly as it was; this
        // pass exists because that verdict is made from a PARTIAL fact — one
        // literal anywhere — and a raw value sitting beside that literal was
        // therefore never examined at all.
        const ln = lineOf(seg.start + i);
        valueParts(t, 0).forEach(function (part) {
          const pc = classifyAtom(unwrapParens(part));
          // Counted BEFORE any bin returns, so no arm can drop it silently.
          if (pc.renorm) { pReNorm++; }
          if (pc.kind === 'literal') { pLit++; return; }
          if (pc.kind === 'escaped') { pEsc++; return; }
          if (pc.kind === 'empty') { pEmpty++; return; }
          if (pc.kind === 'other') {
            pOther++;
            const uk = pc.text + '@' + ln;
            if (seenUnc[uk]) { return; }
            seenUnc[uk] = true;
            unclassified.push({ text: show(pc.text), line: ln,
              operand: show(t) });
            return;
          }
          pBare++;
          // Already named by the whole-operand check above — reported once.
          if (c.kind === 'bare' && c.id === pc.id) { return; }
          const pk = pc.id + '@' + ln;
          if (seenPart[pk]) { return; }
          seenPart[pk] = true;
          barePart.push({ id: pc.id, line: ln, part: show(part),
            operand: show(t) });
        });
      });
    }
    // ⛔ PRINTED ON EVERY RUN, RED OR GREEN, BEFORE ANY VERDICT. A zero that
    // is never printed is a zero nobody can audit.
    console.log('  [seamShape/' + mk.fn + '/seg' + mk.index + '] ' +
      'strippedEscaperCalls=' + stripped.removed +
      ' interpolationOperands=' + bare.length +
      ' (literal=' + nLit + ' escaped=' + nEsc + ' empty=' + nEmpty +
      ' other=' + nOther + ')' +
      // 26.96-45: the per-part breakdown, printed on EVERY run beside the
      // whole-operand tallies rather than instead of them, so the two series
      // stay comparable across waves.
      ' parts(bare=' + pBare + ' literal=' + pLit + ' escaped=' + pEsc +
      ' empty=' + pEmpty + ' unclassified=' + pOther + ')' +
      // 26.96-51: printed by value on EVERY run, red or green, beside the
      // bins it moves parts between — so a reader can watch the
      // normalisation working without an assertion having to fail first.
      ' subscriptKeyReclassified=' + pReNorm +
      // 26.96-52: printed by value on EVERY run, red or green. ⛔ A zero
      // here is only ever readable against the file-level
      // [seamShape/interpolation] line above it, which says how many
      // interpolations exist to be read into at all.
      ' interpolationRunsRead=' + pTplRead);
    tplUnreadable.forEach(function (t) {
      violations.push('[seamShape] ⛔ AN INTERPOLATION INSIDE AN OPERAND OF ' +
        'A BLIND REGION HAS NO END THIS PASS CAN FIND: ' +
        JSON.stringify(show(t)) + ', in ' + JSON.stringify(mk.fn) + ' seg' +
        mk.index + ' (marker at app.js:' + mk.line + '). The operand was ' +
        'left whole rather than split, so NOTHING is known about what ' +
        'reaches the markup through it. ⛔ NAMED, NEVER DROPPED.');
    });
    // ⛔⛔ THE ANTI-VACUITY CONTROL, IN THE SAME CASE AS THE CHECK IT
    // PROTECTS, AND BEFORE ITS VERDICT. This region is asserted SEAM-EVIDENT
    // by the loop above, which means the gate's own SEAM_RE matched an
    // escaper call inside these very bytes. If the stripper then removed
    // NONE, the stripper and the gate disagree about the same slice, and the
    // scan that follows is reading text it does not understand — so its zero
    // would say nothing at all. ⛔ A zero-assertion that passes because it
    // was pointed at the wrong place is this project's most repeated
    // failure; the control is therefore DERIVED FROM THE SEGMENT ITSELF,
    // never from a typed list of which regions "carry user data".
    if (seg.seamEvident && stripped.removed === 0) {
      violations.push('[seamShape] ⛔ THE ESCAPER STRIPPER MATCHED NOTHING ' +
        'IN A SEAM-EVIDENT BLIND REGION: ' + JSON.stringify(mk.fn) + ' seg' +
        mk.index + ' (marker at app.js:' + mk.line + '). The gate\'s own ' +
        'SEAM_RE matched an escaper call inside this exact slice, so a ' +
        'stripped count of 0 means this check is reading something it does ' +
        'not recognise. ⛔ ITS ZERO IS VACUOUS AND NO VERDICT IS DRAWN FROM ' +
        'IT. Fix the stripper against the escapers\' real shape — do not ' +
        'delete this control.');
      return;
    }
    bare.forEach(function (h) {
      violations.push('[seamShape] ⛔ A RAW VALUE INTERPOLATION IS INSIDE A ' +
        'BLIND REGION: ' + JSON.stringify(h.id) + ' at app.js:' + h.line +
        ', in ' + JSON.stringify(mk.fn) + ' seg' + mk.index + ' (marker at ' +
        'app.js:' + mk.line + '). A depth-0 segment clears the seam gate on ' +
        'ONE escaper hit anywhere inside it, so everything else in here is ' +
        'never looked at again — and this operand is neither a literal nor ' +
        'an escaper call. ⛔ WRAP IT AT THE POINT IT REACHES THE MARKUP, in ' +
        'escapeHtml( / escapeAttr( / renderMarkdown(. Do not widen the ' +
        'blind region, and do not delete the marker: the marker is what ' +
        'lets this check run at all.');
    });
    // ⛔⛔ 26.96-45: A BARE PART IS A VIOLATION EVEN WITH A LITERAL BESIDE IT.
    barePart.forEach(function (h) {
      violations.push('[seamShape] ⛔ A RAW VALUE INTERPOLATION IS INSIDE A ' +
        'BLIND REGION, WEARING SOMETHING THAT LOOKS SAFE: ' +
        JSON.stringify(h.id) + ' at app.js:' + h.line + ', in ' +
        JSON.stringify(mk.fn) + ' seg' + mk.index + ' (marker at app.js:' +
        mk.line + '). The part is ' + JSON.stringify(h.part) + ' inside the ' +
        'operand ' + JSON.stringify(h.operand) + '. ⛔ A DEFAULT, A GUARD OR ' +
        'A CONDITIONAL BRANCH BESIDE A RAW VALUE DOES NOT MAKE THAT VALUE ' +
        'SAFE — whichever way the operator falls, THIS part can still be ' +
        'the one that reaches the markup, and it is neither a literal nor ' +
        'an escaper call. Until 26.96-45 the literal beside it made the ' +
        'WHOLE operand read as ordinary markup and it was never examined. ' +
        '⛔ WRAP IT AT THE POINT IT REACHES THE MARKUP, in escapeHtml( / ' +
        'escapeAttr( / renderMarkdown( — do not widen the blind region and ' +
        'do not delete the marker.');
    });
    // ⛔⛔ 26.96-45: AN UNCLASSIFIED PART IS A NAMED FAILURE, NOT A FIGURE.
    // ⚠ THE MEASUREMENT THAT LICENSES THIS, TAKEN BEFORE IT WAS MADE FATAL:
    // at a6a5fbb every named region reported unclassified=0. Round 5's third
    // plant moved that bin and NOTHING failed, because the safeguard on
    // record was only that the figure is PRINTED. ⛔ VISIBLE IS NOT A GATE:
    // a figure nobody reads is indistinguishable from a figure nobody wrote.
    unclassified.forEach(function (h) {
      violations.push('[seamShape] ⛔ AN OPERAND PART INSIDE A BLIND REGION ' +
        'CANNOT BE CLASSIFIED: ' + JSON.stringify(h.text) + ' at app.js:' +
        h.line + ', in ' + JSON.stringify(mk.fn) + ' seg' + mk.index +
        ' (marker at app.js:' + mk.line + '), inside the operand ' +
        JSON.stringify(h.operand) + '. This part is not a literal, not an ' +
        'escaper call, and not a shape this check can read — so NOTHING is ' +
        'known about whether a raw value reaches the markup through it. ' +
        '⛔ THIS BIN WAS ZERO IN EVERY NAMED REGION WHEN THE GATE WAS ' +
        'WRITTEN, so a rise in it is a NEW shape, not a pre-existing one. ' +
        'Either wrap the value at the sink, or teach this classifier the ' +
        'shape and re-drive all three plants — ⛔ do not silence the bin, ' +
        'and do not restore it to a printed figure.');
    });
  });

  // --- 7. (26.96-41) THE RULE THAT A FIGURE IS STATED ONCE, IN ONE
  //        SPELLING, BECOMES A GATE INSTEAD OF A PROMISE.
  //
  // ⛔ WHY. The comment says of itself that the marker lines are the ONLY
  // place in it any measured figure appears. 26.96-VERIFICATION.md round 4
  // found that false: the prose beneath the markers restated measured
  // counts IN WORDS — a second spelling of a gated number, itself ungated.
  // ⛔ ONE RULE WITH TWO SPELLINGS IS HOW A GATE GOES BLIND, which is that
  // truth's own sentence, and the comment was carrying its own
  // counter-example.
  //
  // ⛔ WORD FORMS, NOT DIGITS, AND THAT IS THE POINT. The markers hold
  // digits; a digit scan over prose would collide with dates, plan ids and
  // CSS values and would be noise. It is the SECOND SPELLING that is the
  // defect, so the scan looks for each marker value's ENGLISH WORD FORM.
  //
  // ⚠⚠ THE KNOWN COLLISION, WRITTEN DOWN RATHER THAN SUPPRESSED. Prose in
  // this comment legitimately states figures that are NOT seam markers —
  // the rejected-widening paragraph gives a span in source lines and a
  // count of segments, each beside its definition. If a re-measurement ever
  // gives a MARKER the same value as one of those, this check names that
  // paragraph. ⛔ THAT IS NOT A FALSE POSITIVE TO BE SUPPRESSED: two
  // spellings of the same number in one comment is exactly what the rule
  // forbids, and a reader cannot tell which of the two is the measured one.
  // The sanctioned way to keep a superseded or incidental figure is the
  // QUOTATION IDIOM this comment already uses — a `//   > ` blockquote line
  // — which this check skips, because a quotation of a figure is the record
  // of what was once believed, not a second live spelling of it.
  // ⛔ NO EXEMPTION TOKEN EXISTS AND NONE MAY BE ADDED. A waiver nobody can
  // see is how a gate goes quiet, and this project has a law about it.
  const proseFrom = Math.max(
    sinkMarks.length ? sinkMarks[sinkMarks.length - 1].line : 0,
    blindMarks.length ? blindMarks[blindMarks.length - 1].line : 0,
    paneMarks.length ? paneMarks[paneMarks.length - 1].line : 0);
  const appLines = appSrc.split('\n');
  const prose = [];
  let quotedSkipped = 0;
  for (let li = proseFrom; li < appLines.length; li++) {
    const raw = appLines[li];               // line number is li + 1
    if (!/^\s*\/\//.test(raw)) { break; }   // the sink assignment ends it
    if (/^\s*\/\/\s*>/.test(raw)) { quotedSkipped++; continue; }
    prose.push({ line: li + 1, text: raw });
  }
  // English word forms for a marker value. Written out rather than pinned
  // to today's six numbers, so a re-measurement that changes a figure is
  // covered without anyone remembering to extend a list.
  function numberWords(n) {
    const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
      'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
      'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
      'seventy', 'eighty', 'ninety'];
    function under100(v) {
      if (v < 20) { return [ones[v]]; }
      const t = tens[Math.floor(v / 10)];
      const r = v % 10;
      if (!r) { return [t]; }
      return [t + '-' + ones[r], t + ' ' + ones[r]];
    }
    if (n < 0 || n > 999 || Math.floor(n) !== n) { return []; }
    if (n < 100) { return under100(n); }
    const h = ones[Math.floor(n / 100)] + ' hundred';
    const r = n % 100;
    if (!r) { return [h, 'a hundred']; }
    const out = [];
    under100(r).forEach(function (w) {
      out.push(h + ' ' + w);
      out.push(h + ' and ' + w);
      out.push('a hundred and ' + w);
    });
    return out;
  }
  const markerValues = [];
  sinkMarks.forEach(function (m) { markerValues.push(m.segments); });
  blindMarks.forEach(function (m) { markerValues.push(m.lines); });
  paneMarks.forEach(function (m) { markerValues.push(m.sinks); });
  const distinctValues = markerValues.filter(function (v, i) {
    return markerValues.indexOf(v) === i;
  }).sort(function (a, b) { return a - b; });
  const wordForms = [];
  distinctValues.forEach(function (v) {
    numberWords(v).forEach(function (w) {
      if (wordForms.indexOf(w) === -1) { wordForms.push(w); }
    });
  });
  // ⛔ PRINTED ON EVERY RUN, RED OR GREEN, AND NEVER THE WORD "clean". A
  // check that goes green by having nothing to look at is the failure mode
  // this project has recorded most often, so what it looked at is printed
  // beside what it found.
  console.log('  [seamShape/oneSpelling] markerValues=' +
    distinctValues.join(',') + ' wordForms=' + wordForms.join(',') +
    ' proseLines=' + prose.length + ' quotationLinesSkipped=' + quotedSkipped +
    ' (prose runs app.js:' + (proseFrom + 1) + '-' +
    (prose.length ? prose[prose.length - 1].line : proseFrom) + ')');
  // ⛔ TWO ANTI-VACUITY CONTROLS, BEFORE ANY VERDICT AND IN THE SAME CASE.
  // A region-description prose block of nothing, or a marker set with no
  // word form, each make a zero-match result say nothing at all.
  if (!prose.length) {
    violations.push('[seamShape] ⛔ THERE IS NO REGION-DESCRIPTION PROSE ' +
      'AFTER THE MARKER BLOCK (searched from app.js:' + (proseFrom + 1) +
      '). The one-spelling check would then report zero matches because it ' +
      'looked at nothing, not because the rule holds. ⛔ ITS ZERO IS ' +
      'VACUOUS AND NO VERDICT IS DRAWN FROM IT.');
  } else if (!wordForms.length) {
    violations.push('[seamShape] ⛔ NO MARKER VALUE PRODUCED AN ENGLISH ' +
      'WORD FORM (values: ' + distinctValues.join(',') + '), so the ' +
      'one-spelling check searched for nothing. ⛔ ITS ZERO IS VACUOUS AND ' +
      'NO VERDICT IS DRAWN FROM IT — extend numberWords to the new range.');
  } else {
    prose.forEach(function (p) {
      wordForms.forEach(function (w) {
        const re = new RegExp('\\b' + w.replace(/[-\s]/g, '[-\\s]') + '\\b', 'i');
        if (!re.test(p.text)) { return; }
        const value = distinctValues.filter(function (v) {
          return numberWords(v).indexOf(w) !== -1;
        })[0];
        violations.push('[seamShape] ⛔ A MEASURED FIGURE IS SPELLED A ' +
          'SECOND TIME IN THE PROSE: app.js:' + p.line + ' says ' +
          JSON.stringify(w) + ', which is the marker value ' + value +
          '. The marker block holds that number in digits; this line holds ' +
          'it in words, and only the digits are gated — so the two can ' +
          'drift apart and nothing says so, while the paragraph above the ' +
          'markers claims the markers are the only place a measured figure ' +
          'appears. ⛔ DELETE THE WORD-SPELLED FIGURE OR DERIVE IT FROM THE ' +
          'MARKER — name the subject by index and by kind instead of by ' +
          'count. ⛔ DO NOT DELETE THE MARKER, and do not replace the word ' +
          'with the same figure in digits: that is one spelling in two ' +
          'places, the same defect wearing a different hat. To preserve a ' +
          'superseded or incidental figure, quote it on a `//   > ` line — ' +
          'the idiom this comment already uses, which this check skips. ' +
          'The line: ' + JSON.stringify(p.text.trim()));
      });
    });
  }
});

// ---------------------------------------------------------------------------
// ⛔ 26.96-21: THE EXECUTED ROSTER, PRINTED ON EVERY RUN — RED OR GREEN, AND
// BEFORE THE VERDICT. The run that most needs it is the RED one: that is the
// run in which "the permanent control is not among the violations" is being
// relied on, and that sentence is worthless without proof the control ran.
// ---------------------------------------------------------------------------
// (ROSTERSCANSAFE) ⛔ 26.96-46. THE EVIDENCE IN THIS ROUND IS READ OUT OF THE
// EXECUTED ROSTER BY GREP, SO THE ROSTER'S OWN SCANNABILITY IS A GATE.
//
// Every "it stayed GREEN in the same run" claim in this round's summaries is
// read out of the roster below with a match like `escaping=[0-9]*`. ⛔ Round 5
// lost a whole gate to a name that was a SUBSTRING of the name that replaced
// it, and the assertion passed on the wrong thing. So the roster is held to
// the property those claims actually rest on, rather than to a proxy for it.
//
// ⛔ MEASURED FIRST, AT 4de7eb1, AND THE RESULT CHANGED THIS GROUP'S SHAPE.
// The obvious rule — "no handle is a substring of any other" — is RED at head
// for 32 PRE-EXISTING pairs that have nothing to do with this wave: `A ⊂ armA`,
// `B ⊂ copyBytes`, `C ⊂ noCount`, `D ⊂ routeDerived`, `copy ⊂ copyBytes`,
// `staleWrite ⊂ staleWriteControl`, `readFailed ⊂ readFailedCached` and the
// rest. ⛔ Those are NOT this plan's to fix and are not fixed here — narrowing
// or renaming another wave's groups to clear a count is the move this round
// exists to refuse. They are recorded in deferred-items.md instead.
//
// ⛔ AND THEY ARE MOSTLY NOT THE HAZARD, WHICH IS WHY THE RULE WAS WRONG.
// The roster prints `handle=count`, and every scan in this round anchors on
// the `=`. `copy=[0-9]*` does not match inside `copyBytes=1`, because what
// follows `copy` there is `B` and not `=`. So the property the evidence really
// depends on is that `handle + '='` appears EXACTLY ONCE in the roster line.
//
// ⛔⛔ AND THAT PROPERTY IS ITSELF RED AT HEAD FOR TWO HANDLES — MEASURED, NOT
// ASSUMED, AND IT NARROWED THIS GROUP A SECOND TIME. `A=` occurs THREE times
// in the roster (`A=1`, `armA=1`, `fieldA=1`) and `B=` likewise (`B=1`,
// `armB=1`, `fieldB=1`). ⛔ So a per-group verdict grepped for the wave-0
// instrument groups A and B would be unfounded TODAY. That is a real defect in
// a real instrument and it is written down here and filed — ⛔ but it is
// PRE-EXISTING and it is NOT this plan's to repair: renaming another wave's
// groups to clear a count is the narrowing this round refuses.
//
// ⛔ SO THE GATE IS SCOPED TO WHAT THIS ROUND'S EVIDENCE ACTUALLY READS. The
// reach claims in 26.96-44, -45 and -46 are grepped for exactly five handles;
// those five are held to the uniqueness property, and every other handle's
// standing is PRINTED as a measured figure rather than asserted. ⛔ A gate
// scoped to what it can honestly hold beats a gate that is red for a reason
// its own plan may not touch — that red would be inherited by every later
// wave and would train its readers to ignore this group.
//
// This group is registered LAST so GROUP_ORDER is complete when it runs.
// ---------------------------------------------------------------------------
group('rosterScanSafe (every handle is uniquely findable in the EXECUTED ' +
  'roster, and this wave\'s new handles collide with nothing)',
  function () {
    const names = GROUP_ORDER.slice();
    // The roster line exactly as it is printed below.
    const line = names.map(function (n) {
      return n + '=' + RAN[n];
    }).join(' ');
    // ⛔ THE NEW HANDLES THIS WAVE INTRODUCES. Held to the STRICT rule, both
    // directions, because a new name is the one thing this plan controls.
    const MINE = ['offered-inert', 'rosterScanSafe'];
    const mineBad = [];
    MINE.forEach(function (mine) {
      if (names.indexOf(mine) === -1) {
        violations.push('[rosterScanSafe] this wave\'s handle ' +
          JSON.stringify(mine) + ' is ABSENT from the runner\'s roster — it ' +
          'never dispatched, so any verdict quoted for it is a verdict for a ' +
          'group that did not run');
        return;
      }
      names.forEach(function (other) {
        if (other === mine) { return; }
        if (other.indexOf(mine) !== -1) { mineBad.push(mine + ' ⊂ ' + other); }
        if (mine.indexOf(other) !== -1) { mineBad.push(other + ' ⊂ ' + mine); }
      });
    });
    // The pre-existing pairs, COUNTED AND PRINTED rather than fixed — so the
    // figure is a measured fact in the file rather than a sentence in a
    // summary nobody re-reads.
    const inherited = [];
    names.forEach(function (a) {
      names.forEach(function (b) {
        if (a !== b && b.indexOf(a) !== -1 &&
          MINE.indexOf(a) === -1 && MINE.indexOf(b) === -1) {
          inherited.push(a + ' ⊂ ' + b);
        }
      });
    });
    // ⛔ THE SCAN PROPERTY ITSELF: `handle=` occurs exactly once in the roster
    // line. Counted for EVERY handle, so the figure is honest — but ASSERTED
    // only for the five this round's reach claims are grepped for.
    // ⛔ EVIDENCE_HANDLES is the list of handles quoted by name in 26.96-44,
    // -45 and -46 as having stayed green or gone red in a given run. If a
    // later wave quotes a sixth, it belongs in this list, and a handle listed
    // here that has stopped existing is caught by the absence check below.
    const EVIDENCE_HANDLES = ['escaping', 'attr-breakout', 'seamShape',
      'offered-inert', 'rosterScanSafe'];
    function anchorCount(n) {
      const needle = n + '=';
      let count = 0;
      let at = line.indexOf(needle);
      while (at !== -1) { count += 1; at = line.indexOf(needle, at + 1); }
      return count;
    }
    const ambiguous = [];
    const inheritedAmbiguous = [];
    names.forEach(function (n) {
      const c = anchorCount(n);
      if (c === 1) { return; }
      if (EVIDENCE_HANDLES.indexOf(n) !== -1) { ambiguous.push(n + '×' + c); }
      else { inheritedAmbiguous.push(n + '×' + c); }
    });
    EVIDENCE_HANDLES.forEach(function (n) {
      if (names.indexOf(n) === -1) {
        violations.push('[rosterScanSafe] ⛔ EVIDENCE_HANDLES names ' +
          JSON.stringify(n) + ', which is NOT in the runner\'s roster. A ' +
          'verdict quoted for it in any summary is a verdict for a group ' +
          'that does not exist.');
      }
    });
    console.log('  [rosterScanSafe] handles=' + names.length +
      ' newHandles=' + JSON.stringify(MINE) +
      ' newCollisions=' + mineBad.length +
      ' inheritedSubstringPairs=' + inherited.length +
      ' evidenceHandlesAmbiguous=' + ambiguous.length +
      ' inheritedAmbiguous=' + JSON.stringify(inheritedAmbiguous));
    if (mineBad.length) {
      violations.push('[rosterScanSafe] ⛔ A HANDLE THIS WAVE INTRODUCED ' +
        'COLLIDES: ' + JSON.stringify(mineBad) + '. A per-group verdict scan ' +
        'over the roster would report one of these groups\' verdicts for the ' +
        'other, and this plan\'s whole evidence is a pair of per-group ' +
        'verdicts read that way.');
    }
    if (ambiguous.length) {
      violations.push('[rosterScanSafe] ⛔ ' + ambiguous.length + ' handle(s) ' +
        'THIS ROUND QUOTES BY NAME do not occur exactly once in the roster ' +
        'under the `handle=` anchor: ' + JSON.stringify(ambiguous) +
        '. Every "stayed GREEN in the same run" claim read out of this ' +
        'roster by grep is unfounded for those, and this plan\'s entire ' +
        'reach argument is a pair of such claims.');
    }
    // ⛔ ANTI-VACUITY: the roster must really be populated, or the three loops
    // above are green by looking nowhere.
    if (names.length < 80 || line.indexOf('offered-inert=') === -1) {
      violations.push('[rosterScanSafe] the roster carries ' + names.length +
        ' handle(s) and offered-inert= is ' +
        (line.indexOf('offered-inert=') === -1 ? 'ABSENT' : 'present') +
        ' — the checks above ran over the wrong list, so their green means ' +
        'nothing');
    }
  });

console.log('EXECUTED (' + GROUP_ORDER.length + ' groups, derived from the ' +
  'runner itself): ' + GROUP_ORDER.map(function (n) {
    // ⚠ No space inside a token: this line is read by eye AND by shell, and a
    // token that splits on whitespace is a roster nobody can grep by name.
    return n + '=' + FINISHED[n] +
      (RAN[n] === FINISHED[n] ? '' : '/THREW-dispatched-' + RAN[n]);
  }).join(' '));

// ⛔ AND THE TWO PERMANENT CONTROLS ARE ASSERTED TO HAVE FINISHED, BY COUNT.
// They are NAMED here because this wave's evidence rests on them; the LIST
// they are looked up in is the runner's own, never one typed in this file. If
// either stops existing, or starts throwing, this goes RED rather than going
// quiet.
['absentKeyStillDefaults', 'readFailedCached'].forEach(function (n) {
  if (!FINISHED[n]) {
    violations.push('[controlsRan] ⛔ THE PERMANENT CONTROL ' +
      JSON.stringify(n) + ' DID NOT FINISH — dispatched ' + (RAN[n] || 0) +
      ', finished ' + (FINISHED[n] || 0) + '. Every "the control is not ' +
      'among the violations" claim in this wave is vacuous without it: a ' +
      'group that never ran is absent from the violations too.');
  }
});

// ---------------------------------------------------------------------------

if (violations.length) {
  console.log('test_roster_pane FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.log('  ' + v); });
  process.exit(1);
}
console.log('test_roster_pane OK — the wave-0 instrument groups (extractFn ' +
  'lifts real source and throws on a missing name; the REJECTING stub runs ' +
  'its catch exactly 1 time and its then exactly 0, against the shipped ' +
  'pass-through thenable as the control in the same run at exactly 0 ' +
  'catches; the switchable transport answers the real { ok, status, data } ' +
  'shape on both arms and records url and body; a throwing group is ' +
  'reported instead of cancelling every later proof) — PLUS 26.96-02\'s ' +
  'driven groups: P-1 (the pane\'s remove control reaches ' +
  '/api/librarian/roster, body {op:"remove", folder} by value, /api/meta ' +
  'zero times), P-2 (the add control posts the add op and the typed folder), ' +
  'P-3 (one renderer — the editor markup driven through EACH host is ' +
  'byte-identical, non-empty, carries all three names and binds exactly ' +
  'three controls, and both hosts carry the accessible name and the ' +
  'quiet-link register), P-4 (the repaint follows the ROUTE\'S answer, with ' +
  'an agreeing answer as the control), escaping (a folder name carrying ' +
  'markup renders inert, through escapers LIFTED from core.js), source (the ' +
  'shared renderer addresses no DOM id — labelled a SOURCE gate, never ' +
  'behavioural proof), and R1/R2/R3 (placement by index value with adjacency ' +
  'and registry length as controls; the rail really rendered with the ' +
  'tidy-up tier absent; no rail count, with two controls) — PLUS ' +
  '26.96-03\'s failure groups: copy (the failure sentence is LIFTED from ' +
  'shipped bytes and carries a straight apostrophe and an em dash), armA (a ' +
  'REJECTED write renders that sentence in the note slot of BOTH hosts, in ' +
  'the soft-ink register, never the safety colour, with the acted-on row ' +
  'still present), armB (the same for a NOT-OK answer, driven on the other ' +
  'arm so neither case is the other\'s), fieldA/fieldB (her typed folder ' +
  'name survives a failed add on either arm, BY VALUE), clearOK (a ' +
  'successful add still clears the field — the control refusing a fix that ' +
  'never clears), successQuiet (an accepted write records exactly one post ' +
  'and calls the failure renderer ZERO times, counted — the control refusing ' +
  'a fix that always reports failure), emptySubmit (an empty add records ' +
  'zero writes and says nothing), and inFlight (the control is disabled for ' +
  'the round trip and re-enabled after, with no spinner and no progress ' +
  'element) — PLUS 26.96-04\'s consequence groups: consequenceAdd (a ' +
  'successful add says, byte-exactly and in the add field\'s own position, ' +
  'that adding reaches BACKWARDS over things already here — written into the ' +
  'slot exactly ONCE, counted), consequenceRemove (letting a folder be read ' +
  'again says, between the two rows that remain, that it does NOT reach ' +
  'backwards — the half that can quietly mislead), nothingAtRest (a pane ' +
  'nobody has touched says neither sentence and the slot has been written ' +
  'into ZERO times), shownOnce (the sentence is gone on the next render and ' +
  'the write count is STILL exactly 1 — a count, because a sentence painted ' +
  'over is invisible to emptiness), copyBytes (all NINE strings — her four ' +
  'and the five reused shipped ones — asserted byte-exact against RENDERED ' +
  'output on both hosts and both acts, never against a file\'s source text, ' +
  'with the pane name proven to come from ONE quoted literal and asserted in ' +
  'BOTH of its rendered places, its lowercase first letter and its absent ' +
  'terminal punctuation checked by codepoint), noCount (the number of items ' +
  'newly set aside never reaches a surface — no digit outside the inline ' +
  'style values, the answered number absent by value, plus a LABELLED source ' +
  'gate on the property access), hardNegatives (the pane never claims to ' +
  'govern what arrives in the room — scoped to its own rendered output, ' +
  'never to the file), quietRegister (the consequence is soft ink at 14px ' +
  'and spends neither reserved colour token nor the red-error class), ' +
  'threeRows and framingPresent (the two degenerate readings closed by ' +
  'value), and consequenceWhole (her sentence is the WHOLE of what the slot ' +
  'says, asserted by EQUALITY — added because a planted count welded onto ' +
  'the end of her sentence left the containment-based copy gate GREEN), and ' +
  'failWhole (26.96-09: the SAME closure applied to the slot it was never ' +
  'applied to — the shipped failure sentence is the WHOLE of what the note ' +
  'slot says, on both failure arms and both hosts, because appending " your ' +
  'folder is now private." to a FAILED write survived the entire green ' +
  'suite) — PLUS 26.96-05\'s route groups: routeDerived (the librarian\'s ' +
  'direction to the private-folder list exists and carries its own registry ' +
  'label — the F9 finding this phase is named after), routeTemplateBytes ' +
  '(the helper rebuilds BOTH shipped route lines byte-for-byte by EQUALITY, ' +
  'curly quotation marks included, driven on the connected-apps line too ' +
  'whose pane key differs from its topic key), routeOneSource (the pane name ' +
  'is ONE quoted literal in app.js — a labelled SOURCE gate, counted by ' +
  'value, never the bare substring, and since 26.96-09 asserting that ' +
  'copyBytes counted the SAME number through the SAME helper in the same ' +
  'run, because one rule with two spellings is how a double-quoted second ' +
  'literal was catchable by one gate and invisible to the other), ' +
  'routeShippedUnchanged (the two shipped ' +
  'lines equal pins read out of the bytes at ffc0ebe, with the pins ' +
  'themselves asserted BY CODEPOINT first so a smart-quote-tidied pin cannot ' +
  'certify an equally wrong helper), routeAbsentTopics (the topics she ruled ' +
  'on still resolve to NO direction at all — the control that refuses the ' +
  'lazy fix of giving every absent topic a line), routeWholeLine (the ' +
  'direction carries the template\'s own words and not merely the label, so ' +
  'a bare-label implementation could not satisfy routeDerived — its two ' +
  'containment checks UPGRADED to equality by 26.96-09, its NAME-is-not-a-' +
  'DIRECTION guard kept), and routeValueWhole (26.96-09 / G-26.96-6: the ' +
  'roster route VALUE equals head + the pane\'s registry label + tail, read ' +
  'from a scope whose span now runs to the line BEFORE askRouteLine so a ' +
  'statement mutating the value AFTER the pinned assignment finally enters ' +
  'it — the span\'s non-vacuity asserted three ways first) — PLUS ' +
  '26.96-07\'s ordering groups, driven through the repo\'s first DEFERRED ' +
  'transport: deferredNote (a failed write\'s sentence survives an /api/items ' +
  'read that lands after it — asserted by BYTES and by a write count of ' +
  'exactly 1, because a repaint RESETS a child without incrementing it), ' +
  'deferredField (her typed folder name survives the same race, RE-QUERIED ' +
  'after the settle so the double\'s per-generation cache cannot answer from ' +
  'memory), deferredControl and paintNotNever (the two anti-degenerate ' +
  'controls: a held read nothing superseded DOES paint, and a plain render ' +
  'paints exactly once carrying the roster by value — refusing a token that ' +
  'degenerated into "never paint"), staleWrite (two writes in flight settled ' +
  'in REVERSE order paint the NEWER roster; the folder the newer write ' +
  'removed is absent BY VALUE and the ones that remain are present — WR-04) ' +
  'with staleWriteControl (the same two in ISSUE order, so the claim is not ' +
  'an artifact of arrival order), staleFailure (an OLDER write that FAILS ' +
  'does not speak over a NEWER one that succeeded — COUNTED at zero, never ' +
  'checked for emptiness), and the three cases the re-plant drill proved were ' +
  'owed because the mutation survived the whole green suite: failedClaimDirect ' +
  'and hostsClaimDirect (rosterWriteFailed and renderRosterHosts each claim ' +
  'the surface THEMSELVES, driven through the second door a future call site ' +
  'would use, since today\'s only caller already claims at issue time) and ' +
  'noteHeldNewer (the other real order — the read issued LAST is the one in ' +
  'the air) — PLUS 26.96-10\'s read-outcome groups: readFailed (with no read ' +
  'and no cache the pane names none of the four defaults BY VALUE in their ' +
  'RENDERED spelling, does not render her framing sentence, and writes into ' +
  'the roster editor ZERO times — counted, never checked for emptiness — ' +
  'while still rendering its own registry-read heading, so a fix that simply ' +
  'stopped painting cannot satisfy it), readFailedCached (a failed read with ' +
  'a REAL last read behind it still shows that last read, the shipped intent ' +
  'preserved), absentKeyStillDefaults (⛔ THE CONTROL REFUSING THE WRONG ' +
  'FIX: a store whose fenced_roster key was never written still shows the ' +
  'fence, because the server materialises the default for exactly that ' +
  'store — MEASURED against the real route before the case was written), and ' +
  'readOkEmptyIsEmpty (a roster she CLEARED reads as cleared, never as the ' +
  'defaults), framingOneSource (WR-05: the pane\'s rendered framing line ' +
  'EQUALS C2 and the import screen\'s EQUALS C2 plus its own clause about ' +
  'beginning — by EQUALITY on RENDERED output, against pins from the copy ' +
  'record and never against the constant the renderer reads, with the two ' +
  'pins\' own relationship asserted so they cannot drift apart), ' +
  'importLineBytes (the import screen\'s whole line pinned byte-exactly ' +
  'alongside C2 — the second literal was pinned by nothing), and ' +
  'noDeadImportWrite (IN-02: a Manage-pane edit writes nothing into ' +
  'VAULT_IMPORT, read from the LIFTED scope\'s own object by value, with the ' +
  'edit\'s single write counted so the absence is not a pass over nothing) ' +
  '— PLUS 26.96-11\'s retroactive-truth groups (G-26.96-3): addFutureOnly ' +
  '(an add the server did NOT reach backwards with says nothing at all — ' +
  'the consequence slot\'s WRITE COUNT is 0 BY VALUE, never an emptiness ' +
  'check, and the add field comes back in its own position), addRetroactive ' +
  '(the control: an add that DID reach backwards still says her sentence ' +
  'byte-exactly and exactly once, so the fix cannot degenerate into "never ' +
  'say C3"), addUnknownFailsClosed (an answer carrying no flag at all is ' +
  'read as false — an older server or a dropped field may never resolve to ' +
  '"yes, her things were set aside"), addZeroFlaggedStillSays (⛔ THE CASE ' +
  'THAT REFUSES THE OBVIOUS WRONG FIX: the pass RAN and reached nothing, so ' +
  'flagged is 0 and her sentence is still TRUE and still said — a count-' +
  'based discriminator goes silent on exactly this person), and ' +
  'removeUnaffected (C4 renders on a successful remove whatever the flag ' +
  'says, on all three answer shapes — removing never reached backwards and ' +
  'D-07\'s asymmetry is not this wave\'s to touch) ' +
  '— PLUS 26.96-15\'s three RESOLVED-BUT-NOT-SUCCEEDED arms (the G-26.96-4 ' +
  'residual): readNotOk (a server error), readForbidden (a refusal) and ' +
  'readOkNoData (an ok answer carrying no data at all) — each driven through ' +
  'the SHIPPED pass-through thenable, because the point is that the promise ' +
  'really does settle, and each asserting the four defaults absent in their ' +
  'RENDERED spelling, her framing sentence absent, her B1 seat reached, the ' +
  'roster editor written into ZERO times (counted, never checked for ' +
  'emptiness) and the registry-read heading still present so a renderer that ' +
  'stopped painting cannot satisfy them — with readFailedCached and ' +
  'absentKeyStillDefaults green in the SAME run as the two permanent ' +
  'controls) ' +
  '— PLUS 26.96-21\'s two cache-outcome arms (WR-09/WR-14): ' +
  'staleAfterKeylessOk (a warm cache holding two folders that are NOT ' +
  'fenced, plus a read that SUCCEEDS carrying no roster key, renders THAT ' +
  'read\'s answer — the four defaults present by value in their rendered ' +
  'spelling and neither cached name present, with the editor written into ' +
  'exactly 1 time BY VALUE) and cachedSurvivesNotOk (the same warm cache ' +
  'plus a RESOLVING not-ok answer still shows the last read — WR-14\'s ' +
  'missing arm, which readFailedCached cannot cover because it drives the ' +
  'REJECTING stub and never reaches the fulfilment handler) ' +
  '— ' + GROUP_ORDER.length + ' groups, each wrapped, and the EXECUTED ' +
  'roster above is derived from the runner rather than from any list typed ' +
  'in this file)');
