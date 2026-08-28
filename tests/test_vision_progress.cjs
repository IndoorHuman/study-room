/*
 * tests/test_vision_progress.cjs — V22: the reading phase's honest readout
 * (26.94-06, D-04, law 6). Zero-dep node (assert/fs/path only).
 *
 * WHAT THIS SUITE IS FOR. Law 6 permits unlimited machine time BEHIND AN
 * HONEST ETA. The reading pass takes about twenty minutes over the owner's
 * 13,453 photographs, which makes the readout the thing she actually
 * experiences of this whole phase — and there are exactly three ways for it
 * to be dishonest, each of which passes a naive test perfectly:
 *
 *   1. A BAR THAT COUNTS ONLY SUCCESSES. A photograph that fails to read
 *      still consumed wall-clock. Counting only the good ones stalls the
 *      fraction and stretches the ETA by the failure rate.
 *   2. AN ETA GUESSED FROM ONE SAMPLE. `importEtaLine` refuses to forecast
 *      below 5 done OR under 3 seconds elapsed, and says it is still
 *      counting instead. BOTH thresholds are load-bearing and are asserted
 *      INDEPENDENTLY here — a suite that only ever tested "few and early"
 *      would go green with either one deleted.
 *   3. A CLOCK THAT OUTLIVES THE SCREEN (law 1). The re-arm chain is a
 *      ONE-SHOT re-read that only re-arms while the readout's host screen is
 *      still active. Without that guard it becomes a background poller, which
 *      is the one construct this product does not have.
 *
 * The RELEASE half of this readout — the owner's 2026-08-14 ruling that the
 * import report is held until the reading stops — is a separate contract with
 * its own suite: tests/test_vision_hold.cjs.
 *
 * ⚠ EVERY ASSERTION DRIVES THE REAL BYTES OF app.js. The five functions are
 * SLICED BY NAME out of the shipped source and evaluated — never retyped —
 * so a suite that agreed with a copy of the code while the code moved is not
 * possible here. `importEtaLine` in particular is the SHIPPED one: this plan
 * does not touch it, and the whole point is that the fourth stage reuses the
 * arithmetic the room already trusted.
 *
 * ⚠ SIX UNMUTATED CONTROLS RUN IN THE SAME PASS AS THE FIVE MUTATIONS (the
 * 26.65-07 discipline), and the case count is asserted BY VALUE, so a
 * harness that mutated nothing — or silently skipped a case — cannot report
 * a pass.
 *
 * Prints its counts and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
const appSrc = fs.readFileSync(APP, 'utf8');

// Lift a `function name(...) { ... }` verbatim by brace-matching. Sliced by
// NAME, never by line number — app.js has moved under every earlier plan.
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1, name + ' must be defined in app.js');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

// ---- the render half -------------------------------------------------------
//
// visionStageLine carries the sentence the OWNER APPROVED on 2026-08-13
// (26.94-03's ruling, `as-proposed`). It is lifted, never retyped: the byte
// pin lives in tests/test_no_push.cjs and this suite must not become a second
// place her wording is written down.

function loadRender(src) {
  // ⚠ THE CARD IS LIFTED TOO, SINCE 2026-08-14. The import screen no longer
  // spells its own readout: it draws the SAME card the room does
  // (renderVisionLine) and appends its own closing sentence. Lifting both is
  // what keeps this suite measuring the shipped composition rather than half
  // of it.
  const code = extractFn(src, 'groupThousands') + '\n' +
    extractFn(src, 'visionStageLine') + '\n' +
    extractFn(src, 'importEtaLine') + '\n' +
    extractFn(src, 'visionEtaLine') + '\n' +
    extractFn(src, 'renderVisionLine') + '\n' +
    extractFn(src, 'renderVisionProgress');
  // eslint-disable-next-line no-new-func
  return new Function('escapeHtml', 'escapeAttr', 'count', 'Date',
    code + '\nreturn renderVisionProgress;')(
    function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },
    function (s) { return String(s); },
    function (n, one, many) { return n + ' ' + (n === 1 ? one : many); },
    // ⚠ A FAKE CLOCK THAT MOVES, not the real one. 26.94-05 recorded the
    // sibling trap: a wall-clock assertion cannot see a wall-clock read
    // because every sample lands inside the same second and agrees. Here the
    // clock is injected so each case names its own elapsed time exactly.
    { now: function () { return loadRender.NOW; } });
}

function paint(src, snap, nowMs) {
  loadRender.NOW = nowMs;
  const render = loadRender(src);
  const box = { innerHTML: '' };
  render(box, snap);
  return box.innerHTML;
}

// A running snapshot; its elapsed time is set by the fake clock below, so
// each case names the two numbers importEtaLine actually reads.
const STARTED = 1000000;
function snapAt(done, total) {
  return { state: 'running', done: done, total: total, started_ms: STARTED };
}
function nowFor(elapsedMs) { return STARTED + elapsedMs; }

// ---- the re-arm half -------------------------------------------------------

// ⚠ THE HOST PREDICATE IS INJECTED, AND IT CHANGED ON 2026-08-14. Until then
// readVisionProgress guarded on $('screen-setup') — a screen the reading phase
// never runs on, which is precisely why the pair called only each other and
// this half of the suite was exercising code no user could reach. The live
// guard is adapterHostLive(), the same predicate readAdapterProgress uses, so
// that is what the harness now supplies. The CLAIM under test is unchanged and
// is about the guard's CONTRACT: when the host screen goes, nothing paints and
// nothing re-arms (law 1).
function loadReader(src, screenActive, sink) {
  const code = extractFn(src, 'readVisionProgress') + '\n' +
    extractFn(src, 'armVisionReread');
  // eslint-disable-next-line no-new-func
  return new Function('apiGet', 'adapterHostLive', 'renderVisionProgress',
    'paintVisionTrouble', 'setTimeout',
    code + '\nreturn readVisionProgress;')(
    function () {
      return Promise.resolve({ ok: true,
        data: { state: 'running', done: 9, total: 20,
          started_ms: 1000000 } });
    },
    function () { return screenActive; },
    function () { sink.painted += 1; },
    function () { sink.errored += 1; },
    function () { sink.armed += 1; });
}

// ---------------------------------------------------------------------------
// ---- the claims ------------------------------------------------------------
// ---------------------------------------------------------------------------
//
// Each returns a list of plain-words violations, so a mutation's failure says
// WHICH claim broke rather than only which instrument.

// Her 2026-08-14 ruling: "this should be updated to 4,182 instead". On a
// library her size the readout prints five-figure numbers every second for
// twenty minutes, and ungrouped they are hard to read at a glance.
//
// ⚠ THE SEPARATOR IS GROUPED BY HAND, NOT BY toLocaleString, AND THIS CLAIM IS
// WHAT KEEPS IT THAT WAY. A locale-driven separator would print a comma on
// this machine and a full stop or a thin space on another — the same room
// showing a different number, and no test run here could ever see it.
function claimGroupedThousands(src) {
  const out = [];
  const html = paint(src, snapAt(4182, 13606), nowFor(600000));
  if (html.indexOf('reading your photographs — 4,182 of 13,606.') === -1) {
    out.push('[vision] app.js: five-figure counts must be grouped with ' +
      'commas (owner ruling 2026-08-14) — got: ' + html);
  }
  // and the small numbers she also sees must NOT grow a separator
  const small = paint(src, snapAt(7, 999), nowFor(600000));
  if (small.indexOf('reading your photographs — 7 of 999.') === -1) {
    out.push('[vision] app.js: a number under a thousand must stay bare — ' +
      'got: ' + small);
  }
  return out;
}

function claimFraction(src) {
  const out = [];
  // per ATTEMPTED item: this snapshot's `done` INCLUDES rows that failed to
  // read, and the readout must print that number and not a smaller one.
  const html = paint(src, snapAt(7, 20), nowFor(10000));
  if (html.indexOf('reading your photographs — 7 of 20.') === -1) {
    out.push('[vision] app.js: the reading readout must print the owner-' +
      'approved sentence with the ATTEMPTED count — rows that failed to ' +
      'read consumed wall-clock too, and a bar that counted only successes ' +
      'would stall while the ETA stretched (law 6). got: ' + html);
  }
  if (html.indexOf('you can close this; the room will be ready.') === -1) {
    out.push('[vision] app.js: the pinned close-line is missing — leaving ' +
      'is safe, and the readout says so in the same words the other two ' +
      'phases use.');
  }
  return out;
}

function claimFewDone(src) {
  // 4 done, TEN seconds elapsed: the time threshold is long past, so only
  // the 5-item threshold can refuse here.
  const html = paint(src, snapAt(4, 20), nowFor(10000));
  if (html.indexOf('still counting…') === -1) {
    return ['[vision] app.js: with 4 items done the ETA must say it is ' +
      'still counting. Four samples is not a rate; a forecast from them is ' +
      'a lie with a number on it. got: ' + html];
  }
  return [];
}

function claimEarly(src) {
  // 6 done, TWO seconds elapsed: the item threshold is past, so only the
  // 3-second threshold can refuse here.
  const html = paint(src, snapAt(6, 20), nowFor(2000));
  if (html.indexOf('still counting…') === -1) {
    return ['[vision] app.js: under three seconds elapsed the ETA must say ' +
      'it is still counting — six pictures read in two seconds says more ' +
      'about the first two than about the next thousand. got: ' + html];
  }
  return [];
}

function claimRealEta(src) {
  // 6 done, TEN seconds, and 2,000 still to go — her real library's scale,
  // where the answer is minutes rather than "less than a minute". Both
  // thresholds are cleared, so a real forecast must appear: otherwise
  // "still counting…" for ever would pass every case above and the ETA
  // would never arrive at all.
  const html = paint(src, snapAt(6, 2000), nowFor(10000));
  if (html.indexOf('still counting…') !== -1
      || html.indexOf('about ') === -1) {
    return ['[vision] app.js: with both thresholds cleared a real ETA must ' +
      'appear — a readout that says "still counting…" for twenty minutes ' +
      'is not honest, it is silent. got: ' + html];
  }
  return [];
}

// ---------------------------------------------------------------------------
// ---- the mutations ---------------------------------------------------------
// ---------------------------------------------------------------------------

const MUTATIONS = [
  ['the thousands separator goes',
    function (s) {
      return s.replace("      if (i > 0 && (digits.length - i) % 3 === 0) { out += ','; }\n", '');
    },
    claimGroupedThousands],

  ['the 5-item threshold lowered to 1',
    function (s) { return s.replace('if (done < 5 || elapsed < 3000)',
      'if (done < 1 || elapsed < 3000)'); },
    claimFewDone],
  ['the 3-second threshold lowered to 0',
    function (s) { return s.replace('if (done < 5 || elapsed < 3000)',
      'if (done < 5 || elapsed < 0)'); },
    claimEarly],
  ['the readout prints the SUCCESS count instead of the attempted one',
    function (s) {
      return s.replace(
        "    return 'reading your photographs — ' + groupThousands(snap.done || 0) +",
        "    return 'reading your photographs — ' + groupThousands(snap.ok || 0) +");
    },
    claimFraction],
  ['the ETA is replaced by a constant',
    function (s) {
      // ⚠ RE-ANCHORED 2026-08-14 (twice today). The ETA no longer sits in
      // renderVisionProgress at all: since the import screen was given the
      // room's bar it rides inside visionEtaLine's caption, and both surfaces
      // read it from there. Mutating the one place it is fetched is what this
      // drill was always trying to do.
      return s.replace('    var eta = importEtaLine(snap);',
        "    var eta = 'about 20 minutes';");
    },
    claimFewDone]
];

(function main() {
  let ran = 0;
  let caught = 0;
  let controlsGreen = 0;
  const failures = [];

  // ---- CONTROLS: the shipped bytes, unmutated ----
  const CONTROLS = [
    ['the fraction and the pinned close-line', claimFraction],
    ['five-figure counts are grouped with commas', claimGroupedThousands],
    ['a real ETA once both thresholds clear', claimRealEta],
    ['four done, ten seconds: still counting', claimFewDone],
    ['six done, two seconds: still counting', claimEarly]
  ];
  CONTROLS.forEach(function (pair) {
    ran += 1;
    const said = pair[1](appSrc);
    if (said.length === 0) {
      controlsGreen += 1;
    } else {
      failures.push('CONTROL RED: ' + pair[0] + ' :: ' + said.join(' ;; '));
    }
  });

  // ---- MUTATIONS: each must be caught by its own claim ----
  MUTATIONS.forEach(function (m) {
    ran += 1;
    const mutated = m[1](appSrc);
    if (mutated === appSrc) {
      failures.push('MUTATION NEVER PLANTED: ' + m[0] +
        ' — a substitution that matched nothing scores as a pass, which is ' +
        'a drill measuring the repo instead of the gate');
      return;
    }
    let said;
    try {
      said = m[2](mutated);
    } catch (e) {
      said = ['threw: ' + e.message];
    }
    if (said.length > 0) {
      caught += 1;
    } else {
      failures.push('MUTATION MISSED: ' + m[0]);
    }
  });

  // ---- the re-arm guard: law 1, no clock outlives the screen ----
  // Three cases, run against the real bytes and against one mutation.
  const guardCases = [];

  function guardCase(name, src, active, expect) {
    const sink = { painted: 0, errored: 0, armed: 0 };
    const read = loadReader(src, active, sink);
    return Promise.resolve(read({ innerHTML: '' }, 0)).then(function () {
      guardCases.push([name, sink, expect]);
    });
  }

  const NO_GUARD = appSrc.replace(
    "      if (!adapterHostLive()) { return; }\n" +
    "      if (!res.ok || !res.data) {\n" +
    "        armVisionReread(box, misses + 1, onEnd, paint);",
    "      if (!res.ok || !res.data) {\n" +
    "        armVisionReread(box, misses + 1, onEnd, paint);");
  // ⚠ NOT A BARE THROW. If the guard is already gone from the shipped source
  // the mutation cannot be planted — but the honest first thing to say then
  // is that the CONTROL is red (a closed screen kept re-arming), not that
  // this harness could not find a string. So it is recorded as a failure and
  // the run continues to the controls below, which name the defect in plain
  // words.
  const guardPlanted = (NO_GUARD !== appSrc);
  if (!guardPlanted) {
    failures.push('MUTATION NEVER PLANTED: the re-arm guard — app.js no ' +
      'longer contains the adapterHostLive() guard in readVisionProgress, ' +
      'so no clock construct is stopped when the screen goes (law 1)');
  }

  Promise.resolve()
    .then(function () {
      return guardCase('screen active: paints and re-arms exactly once',
        appSrc, true, { painted: 1, armed: 1 });
    })
    .then(function () {
      return guardCase('screen gone: nothing painted, nothing armed',
        appSrc, false, { painted: 0, armed: 0 });
    })
    .then(function () {
      if (!guardPlanted) { return null; }
      return guardCase('MUTATED, guard removed: it keeps going',
        NO_GUARD, false, { painted: 1, armed: 1 });
    })
    .then(function () {
      guardCases.forEach(function (c) {
        ran += 1;
        const name = c[0];
        const sink = c[1];
        const want = c[2];
        const ok = sink.painted === want.painted && sink.armed === want.armed;
        if (name.indexOf('MUTATED') === 0) {
          // the mutation is CAUGHT when the shipped expectation (silence)
          // no longer holds — i.e. when it behaves like the guardless code.
          if (ok) { caught += 1; } else {
            failures.push('MUTATION MISSED: the re-arm guard removed — a ' +
              'closed screen still did not re-arm, so the guard is not ' +
              'what stops it');
          }
        } else if (ok) {
          controlsGreen += 1;
        } else {
          failures.push('CONTROL RED: ' + name + ' :: painted=' +
            sink.painted + ' armed=' + sink.armed);
        }
      });

      // ---- counts, printed as integers and then asserted BY VALUE ----
      console.log('CASES ' + ran);
      console.log('DRILL ' + caught + '/' + (MUTATIONS.length + 1) +
        ' mutations caught, ' + controlsGreen + ' controls green');

      assert.strictEqual(failures.length, 0,
        'V22 failures: ' + failures.join(' ;; '));
      assert.strictEqual(MUTATIONS.length, 5,
        'the render drill carries FIVE mutations — a sixth or a fifth ' +
        'removed must be a conscious edit of this literal');
      assert.strictEqual(caught, 6,
        'all six mutations (five render, one re-arm) must be caught');
      assert.strictEqual(controlsGreen, 7,
        'all seven unmutated controls must be green in the same run');
      assert.strictEqual(ran, 13,
        'CASES: seven controls plus six mutations ran — a skipped case ' +
        'cannot hide behind a passing total');

      // ---- importEtaLine is REUSED, NEVER EDITED ----
      // The shipped thresholds, read off the source by value. This plan's
      // whole ETA claim rests on the function the room already trusted.
      assert.ok(appSrc.indexOf('if (done < 5 || elapsed < 3000)') !== -1,
        "importEtaLine's 5-item / 3-second refusal to guess must be " +
        'byte-exact — it is not this plan\'s to lower');

      console.log('OK test_vision_progress.cjs — V22: the reading readout ' +
        'counts every ATTEMPT, refuses to guess below 5 items AND below 3 ' +
        'seconds (each threshold proved alone), reuses importEtaLine ' +
        'unedited, and its one-shot re-read dies with the screen (law 1)');
    })
    .catch(function (e) {
      console.error(e && e.message ? e.message : e);
      process.exit(1);
    });
}());
