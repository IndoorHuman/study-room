/*
 * tests/test_vision_hold.cjs — 26.94-11/13/14: the import screen AND the
 * candle re-pull HOLD until the reading stops, and the room shows the count
 * alone (three owner rulings, 2026-08-14). Zero-dep node (assert/fs/path).
 *
 * WHAT THIS SUITE IS FOR. The owner was shown three placements for the
 * sentence she approved — "reading your photographs: N of M." — and ruled:
 * KEEP ME ON THE IMPORT SCREEN. Shown the result, she ruled again: the candle
 * re-pull should be held too. The ending waits; the reading readout is what
 * she watches for the ~21 minutes it takes; the ending lands when the reading
 * stops. That makes the hand-off, not the wording, the thing that can go
 * wrong, and it can go wrong in six ways that all pass a naive test:
 *
 *   1. NO HOLD AT ALL. The report is painted the instant both earlier phases
 *      report done — which is exactly what shipped before today, and is the
 *      defect the ruling exists to fix. Twenty-one minutes paint nothing.
 *   2. A HOLD THAT NEVER LETS GO. Every ending must release: done, skipped,
 *      error, a job that vanished, and a readout that gave up after three
 *      failed reads. One missing release is a screen stuck on a progress line
 *      for ever, which is worse than the defect it replaced.
 *   3. A ONE-SECOND BLINK. The worker marks the export and copy phases done
 *      BEFORE the reading phase names itself, so there is a window in which
 *      a 1 Hz reader sees both done. The server closes it by stamping
 *      `pending` in the same locked block; the client must HOLD there, or the
 *      ending goes up over a reading that has not started.
 *   4. NOISE WHERE SILENCE WAS PROMISED. `pending`, and `running` before the
 *      pass has computed its remainder, carry no fraction. Painting them puts
 *      "reading your photographs: 0 of 0." in the room's panel every time a
 *      candle re-pull finds nothing new AND has nothing to read — text where
 *      the shipped rule is that a run which added nothing paints none at all.
 *      So the hold is SILENT until there is a number, and a zero total is a
 *      clean read rather than a miss (the pass computes its remainder across
 *      a load_store of her whole library, which outlasts the miss cap).
 *   5. A ROOM GONE DEAD UNDER HER HAND. The candle's ending also fires the
 *      completion seam the reflection session chains on. Held with the
 *      panel's text, a tap on the candle would produce no session for twenty
 *      minutes. Only the LAST WORD is held; the seam never is.
 *      ⛔ AMENDED 2026-08-21 (26.995-15, G-26.995-3). The source QUEUE was
 *      listed here as the second thing never held, for the stated reason
 *      that holding it "would leave the second source uncollected". That
 *      premise was measured and is false: not holding it gets the second
 *      source REFUSED by the reading this run itself started, on every tap,
 *      for ever. Her ruling of 2026-08-21 is that the queue WAITS ITS TURN.
 *      The seam's half of this is unchanged and is asserted alongside it.
 *   6. A RELEASE INTO A DEAD SCREEN. When the host screen goes, the readout
 *      dies with it (law 1) — and must NOT fire the release on its way out.
 *   7. ONE SURFACE'S COPY LEAKING ONTO THE OTHER. Shown the three-line
 *      readout in her room she ruled "just show the count", so the panel gets
 *      a one-line wrapper around the SAME approved sentence. The import
 *      screen must keep the three it shipped with: its ETA is law 6's honest
 *      forecast on the one path where her effort is budgeted.
 *
 * ⚠ EVERY ASSERTION DRIVES THE REAL BYTES OF app.js. readVisionProgress,
 * armVisionReread and readAdapterProgress are SLICED BY NAME out of the
 * shipped source and evaluated — never retyped. The wiring claim in
 * particular runs the SHIPPED readAdapterProgress: a suite that only checked
 * readVisionProgress in isolation would stay green with the call site removed,
 * and the call site is the entire ruling.
 *
 * ⚠ UNMUTATED CONTROLS RUN IN THE SAME PASS AS THE MUTATIONS, and every count
 * is asserted BY VALUE, so a harness that planted nothing — or silently
 * skipped a case — cannot report a pass.
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
// 26.995-14: harness D drives the collect route's BUSY answer, and that
// sentence lives in server.py. It is LIFTED from the shipped bytes, never
// retyped -- this suite must not become a second place a shipped sentence is
// written down.
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

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

// A promise chain settles over several microtask turns and one of the paths
// under test defers through setTimeout. Flush both, deterministically: no
// wall-clock wait, and the fake timer below runs its callbacks synchronously
// on demand rather than on a real clock.
function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

// ---------------------------------------------------------------------------
// ---- harness A: readVisionProgress + armVisionReread ----------------------
// ---------------------------------------------------------------------------
//
// `states` is the sequence the fake /api/vision-progress answers, one per
// read. `null` means the read failed (an unreachable room). When the list
// runs out the last answer repeats, so a chain that never stops is caught by
// the arm cap rather than by hanging this suite.

const ARM_CAP = 12;

function loadVisionReader(src, states, hostLive, sink) {
  const code = extractFn(src, 'readVisionProgress') + '\n' +
    extractFn(src, 'armVisionReread');
  let read = 0;
  // eslint-disable-next-line no-new-func
  return new Function('apiGet', 'adapterHostLive', 'renderVisionProgress',
    'paintVisionTrouble', 'setTimeout',
    code + '\nreturn readVisionProgress;')(
    function () {
      const s = states[Math.min(read, states.length - 1)];
      read += 1;
      sink.reads += 1;
      if (s === null) { return Promise.resolve({ ok: false, data: null }); }
      return Promise.resolve({ ok: true, data: s });
    },
    function () { return hostLive(); },
    function (box, snap) { sink.painted += 1; sink.lastSnap = snap; },
    function (box, message) { sink.trouble.push(message); },
    // The deferred re-read runs immediately and synchronously: this suite is
    // about WHICH endings release, not about the one-second cadence (that is
    // test_vision_progress.cjs's guard case).
    //
    // ⚠ BOUNDED, AND THE BOUND IS PART OF THE INSTRUMENT. A `running` answer
    // resets the miss count by design, so a chain that has lost its host
    // guard re-arms for ever — which is exactly what the dead-screen mutation
    // produces. With a real one-second timer that is a background poller (the
    // defect); here it would be an infinite synchronous loop that HANGS the
    // suite, and a suite that hangs reports nothing at all. The cap turns it
    // back into a countable observation.
    function (fn) {
      sink.armed += 1;
      if (sink.armed <= ARM_CAP) { fn(); }
    });
}

function runVision(src, states, hostLive, sink) {
  const read = loadVisionReader(src, states, hostLive, sink);
  return Promise.resolve(
    read({ innerHTML: '' }, 0, function () { sink.released += 1; })
  ).then(flush).then(flush);
}

function freshSink() {
  return { reads: 0, painted: 0, armed: 0, released: 0, trouble: [],
    lastSnap: null };
}

// ---------------------------------------------------------------------------
// ---- harness B: the SHIPPED readAdapterProgress (the wiring claim) --------
// ---------------------------------------------------------------------------
//
// Both phases answer `done`, which is the exact moment the ruling governs.
// Everything readAdapterProgress reaches for is injected, so the function
// under test is the shipped one and nothing else is.

function runAdapter(src, sink, opts) {
  opts = opts || {};
  const code = extractFn(src, 'readAdapterProgress');
  const EXP_DONE = { state: 'done', report: { collected: 3, skipped: {} } };
  const IMP_DONE = { state: 'done', report: { items: 42, imported: 3 } };
  // eslint-disable-next-line no-new-func
  const read = new Function(
    'apiGet', 'adapterHostLive', 'ACTIVE_ADAPTER', 'APP',
    'renderImportReport', 'paintAdapterPartial', 'readVisionProgress',
    'finishRoomRepull', 'renderAdapterError', 'adapterErrorCopy',
    'renderImportProgress', 'repullQuicken', 'reenableNotes',
    'armAdapterReread', 'renderVisionLine',
    code + '\nreturn readAdapterProgress;')(
    function (url) {
      return Promise.resolve({ ok: true,
        data: url === '/api/adapter/progress' ? EXP_DONE : IMP_DONE });
    },
    function () { return true; },
    { source: 'apple-photos', room: !!opts.room },
    { items: 0 },
    function () { sink.reported += 1; },
    function () { sink.partial += 1; },
    function (box, misses, onEnd, paint) {
      sink.handedToVision += 1;
      sink.visionOnEnd = onEnd;
      sink.visionPaint = paint;
    },
    function () { sink.roomFinished += 1; },
    function () { sink.errored += 1; },
    function (m) { return m; },
    function () { sink.progressed += 1; },
    function () {},
    function () {},
    function () { sink.rearmed += 1; },
    function () { sink.roomPainterUsed = true; });
  return Promise.resolve(read({ innerHTML: '' }, 0)).then(flush).then(flush);
}

function freshAdapterSink() {
  return { reported: 0, partial: 0, handedToVision: 0, roomFinished: 0,
    errored: 0, progressed: 0, rearmed: 0, visionOnEnd: null,
    visionPaint: undefined };
}

// ---------------------------------------------------------------------------
// ---- harness C: the candle re-pull's ending (owner ruling 2026-08-14) -----
// ---------------------------------------------------------------------------
//
// She ruled the candle re-pull should be held too. The COMPLETION SEAM must
// NOT be held with it, and only this harness can tell that apart from the
// panel's text: the reflection session chains on the seam — held, a tap on the
// candle produces nothing at all for twenty minutes, which is not a readout
// being honest, it is the room going dead.
// ⛔ THE SOURCE QUEUE USED TO BE ON THAT LIST AND IS NOT ANY MORE (26.995-15,
// her ruling 2026-08-21): it now WAITS for the reading rather than being
// refused by it. The two claims sit side by side below, because the wait and
// the release happen in the same breath and swapping them is the failure.

function runRepullFinish(src, opts) {
  const code = extractFn(src, 'finishRoomRepull');
  const sink = { seam: 0, next: 0, vision: 0, onEnd: null, paint: null,
    painted: [], seamAtFirstPaint: null };
  // 26.995-17: a caller may hand in the run state a PREVIOUS drive left
  // behind, so a whole two-source run can be driven end to end over ONE run
  // state — which is the only way a flag that is never cleared shows up as
  // the behaviour it actually causes (a later tap swallowed) rather than as
  // a field this suite happened to look at.
  // ⚠ SEEDED WHOLE. A harness seeding a partial object measures a state the
  // app never actually has — `pendingSource` is initialised in app.js's own
  // REPULL literal, so it is initialised here too.
  const REPULL = opts.repull || { queue: opts.queue.slice(),
    brought: opts.brought, busy: true, pendingSource: false, onDone: null };
  const box = {
    _h: null,
    get innerHTML() { return this._h; },
    set innerHTML(v) {
      this._h = v;
      sink.painted.push(v);
      if (sink.seamAtFirstPaint === null) { sink.seamAtFirstPaint = sink.seam; }
    }
  };
  const ROOM_PAINTER = function () {};
  sink.roomPainter = ROOM_PAINTER;
  // 26.995-21 (WR-05): the collect identity this run owns. A claim can take
  // it away between the wait starting and the reading stopping — which is
  // exactly what a manual collect from Manage does to a room run, now that
  // the wait holds the global open for minutes.
  const ACTIVE_ADAPTER = opts.active || { source: 'apple-notes', room: true };
  sink.active = ACTIVE_ADAPTER;
  // eslint-disable-next-line no-new-func
  const fn = new Function('REPULL', 'runNextRepull', 'consumeRepullSeam',
    'escapeHtml', 'count', 'readVisionProgress', 'renderVisionLine',
    'ACTIVE_ADAPTER',
    code + '\nreturn finishRoomRepull;')(
    REPULL,
    function () { sink.next += 1; },
    function () { sink.seam += 1; },
    function (s) { return String(s); },
    function (n, one, many) { return n + ' ' + (n === 1 ? one : many); },
    function (b, misses, onEnd, paint) {
      sink.vision += 1; sink.onEnd = onEnd; sink.paint = paint;
    },
    ROOM_PAINTER,
    ACTIVE_ADAPTER);
  fn(opts.report, box);
  return { sink: sink, REPULL: REPULL, box: box };
}

// ---------------------------------------------------------------------------
// ---- harness D: the SHIPPED collect's TWO FAILURE ARMS (26.995-14) --------
// ---------------------------------------------------------------------------
//
// G-26.995-2, found by the owner's UAT on 2026-08-21: four taps on the candle,
// no reflection, and the room told her the librarian had been too slow. It had
// not been asked.
//
// A collect that does not succeed comes back in TWO shapes and the room built
// two renderers for them. Only ONE of the two released the completion seam the
// reflection session chains on:
//
//   * renderVaultRefusal  ends with `if (room) { consumeRepullSeam(); }`, under
//     a comment stating the principle outright -- holding it "would mean a tap
//     on the candle produced no reflection session ... the room going dead
//     under her hand."
//   * renderAdapterError  cleared the queue and released NOTHING.
//
// The photo-reading-busy guard on the collect route answers `json_error(400)`
// with no `refused` key, so it takes the ERROR arm -- and a candle tap on a
// library with two apps connected hits it EVERY time, deterministically.
//
// ⛔ THIS HARNESS EXISTS BECAUSE NOTHING IN THIS REPO HAS EVER DRIVEN THAT ARM.
// Harness C above drives finishRoomRepull (the success arm);
// tests/test_vault_refusal.cjs case 9 drives the refusal arm;
// tests/test_session_flow.cjs pins the seam at the queue-empty end. All three
// were built to catch exactly this defect and all three were green while it
// shipped.
//
// ⛔ AND IT MAY NOT BE A MIRROR. A check asserting that renderAdapterError
// CONTAINS the string `consumeRepullSeam` restates the edit and proves nothing.
// This drives a real collect through a real failing response, all the way
// through the shipped renderers, and COUNTS the seam firings BY VALUE.

// ⚠ HER SENTENCE, READ OFF server.py RATHER THAN COPIED. A retyped copy would
// drift the day the guard's wording changes and this suite would keep passing
// against a message the server no longer sends.
function liftServerString(name) {
  const m = new RegExp('^' + name + ' = "([^"]*)"', 'm').exec(serverSrc);
  assert.ok(m, name + ' must be defined in server.py');
  return m[1];
}

const VISION_BUSY = liftServerString('VISION_BUSY_MSG');

// ⚠ THE READING'S OWN FAILURE LINE, READ OFF server.py TOO, and for the same
// reason: retyped, this suite would keep passing against a sentence the room
// no longer sends. It is written there as a wrapped concatenation rather than
// on one line, so it is joined back together here.
function liftWrappedServerString(name) {
  const m = new RegExp('^' + name + ' = \\(([\\s\\S]*?)\\)\\n', 'm')
    .exec(serverSrc);
  assert.ok(m, name + ' must be defined in server.py');
  const parts = m[1].match(/"([^"]*)"/g) || [];
  assert.ok(parts.length > 0, name + ' must be a wrapped string in server.py');
  return parts.map(function (p) { return p.slice(1, -1); }).join('');
}

const VISION_TROUBLE = liftWrappedServerString('VISION_ERROR_MSG');

// Drive the SHIPPED runAdapterCollect against a stubbed response and let it
// route itself. Nothing here decides which renderer runs -- app.js does, off
// the SHAPE of the answer, exactly as it does in her room.
function runFailedCollect(src, opts) {
  const code = extractFn(src, 'errorText') + '\n' +
    extractFn(src, 'reenableNotes') + '\n' +
    extractFn(src, 'runAdapterCollect') + '\n' +
    extractFn(src, 'renderAdapterError') + '\n' +
    extractFn(src, 'renderVaultRefusal');
  const sink = { seam: 0, next: 0, progressed: 0, picker: 0, painted: [] };
  // A room re-pull mid-run: busy, and this is the last source in the queue.
  // ⚠ THE QUEUE IS EMPTY ON PURPOSE. A refusal with sources still queued goes
  // to runNextRepull instead of ending, which is a different claim (T-26.97-30,
  // pinned in test_vault_refusal.cjs) and would silently hide the release.
  const REPULL = { busy: true, queue: [], excludes: {}, brought: 0,
    onDone: null, holding: null, refused: null };
  const box = {
    _h: '',
    get innerHTML() { return this._h; },
    set innerHTML(v) { this._h = v; sink.painted.push(v); }
  };
  // eslint-disable-next-line no-new-func
  const collect = new Function(
    '$', 'ACTIVE_ADAPTER', 'ADAPTER_BUTTON_IDS', 'VAULT_SOURCE', 'escapeHtml',
    'sourceExclusionKey', 'apiPost', 'adapterErrorCopy',
    'renderAdapterProgress', 'readAdapterProgress', 'REPULL',
    'consumeRepullSeam', 'runNextRepull', 'renderVaultFolderPicker',
    'VAULT_REFUSAL_TITLE', 'VAULT_REFUSAL_WHY', 'VAULT_REFUSAL_NEXT',
    'VAULT_REFUSAL_RETRY', 'VAULT_REFUSAL_PRIVATE', 'VAULT_PICKER_UNREACHABLE',
    'warnBeforeLongRun',
    code + '\nreturn runAdapterCollect;')(
    // No DOM: every control the renderers reach for is absent, so nothing is
    // wired and nothing is clicked. This suite is about the release, not the
    // buttons (those are test_candle_repull.cjs's).
    function () { return null; },
    // ⚠ ASSIGNED BY runAdapterCollect ITSELF. The room flag the release is
    // gated on is the one the shipped code sets, never one this suite hands it.
    {},
    { 'apple-notes': 'btn-onb-source-notes',
      'apple-photos': 'btn-onb-source-photos' },
    'obsidian-vault',
    function (x) { return String(x); },
    function () { return ''; },
    function () { return Promise.resolve(opts.response); },
    function () { return ''; },
    function () { sink.progressed += 1; },
    function () {},
    REPULL,
    function () { sink.seam += 1; },
    function () { sink.next += 1; },
    function () { sink.picker += 1; },
    // ⛔ NOT HER WORDING. The refusal card's six strings are placeholders here
    // on purpose: their bytes are pinned in test_no_push.cjs and
    // test_vault_refusal.cjs, and this suite asserts nothing about them.
    'VAULT_REFUSAL_TITLE', 'VAULT_REFUSAL_WHY', 'VAULT_REFUSAL_NEXT',
    'VAULT_REFUSAL_RETRY', 'VAULT_REFUSAL_PRIVATE', 'VAULT_PICKER_UNREACHABLE',
    // HEAD #171: the shipped collect asks first; this suite is about the
    // release after the call, so the warning continues at once. Bytes of
    // that sentence live in test_long_run_warning.cjs, not here.
    function (_box, onContinue) { onContinue(); });
  collect('apple-photos', undefined, box, opts.room);
  return Promise.resolve().then(flush).then(flush).then(function () {
    return { sink: sink, REPULL: REPULL, box: box };
  });
}

// The 400 the photo-reading guard actually sends: `ok: false`, an `error`
// string, and NO `refused` key. The absence of that key is the whole routing
// decision -- it is what sends this down the arm nothing had ever driven.
const BUSY_ANSWER = { ok: false, status: 400, data: { error: VISION_BUSY } };


// ---------------------------------------------------------------------------
// ---- harness E: a TWO-SOURCE candle re-pull, driven end to end (26.995-15) -
// ---------------------------------------------------------------------------
//
// G-26.995-3, found in the owner's UAT on 2026-08-21 while the defect above
// was being diagnosed. Six taps on the candle, six identical sequences:
// apple-notes 200, apple-photos 400 one second later. The re-pull walks its
// sources one at a time; the first collect's reading phase sets VISION_JOB to
// pending/running and "outlives the other two by twenty minutes", so the
// second source met the collect route's guard and was turned away.
// ⛔ WITH TWO APPS CONNECTED THE SECOND WAS REFUSED ON EVERY TAP, FOR EVER --
// her Photos had never once been re-pulled from the room.
//
// HER RULING, 2026-08-21, shown all three ways out and what each one costs:
// "A -- Wait your turn (Recommended)." The queue waits for the reading and
// then asks the next source, instead of being refused by it.
//
// ⛔ THIS DRIVES THE WHOLE WAY THROUGH, and that is the point of a fifth
// harness: startCandleRepull -> runNextRepull -> runAdapterCollect ->
// readAdapterProgress -> finishRoomRepull -> the wait -> readVisionProgress ->
// runNextRepull -> the second collect. Every one of those is SLICED BY NAME
// out of the shipped app.js. Only the painters and the network are stubbed,
// and the network is a fake room that answers the way server.py answers --
// its guard included, in behaviour, as tests/test_server_smoke.py drives it.
//
// ⛔ AND IT MAY NOT BE A MIRROR. Nothing here asserts that a condition string
// changed. It COUNTS, BY VALUE: which sources were actually asked, which were
// turned away, when the sitting's seam fired, and the most readings the fake
// room ever had running at one time.
//
// ⚠ THE FAKE ROOM CAN DROP ITS GUARD (`guard: false`), and THAT is what makes
// the safety claim a measurement instead of a restatement of it. Against a
// room that would let a second reading start, a client that does not wait its
// turn really does start two -- so `readersAtOnce` is a number this drive can
// make come out wrong, and the mutation at the bottom of this file makes it
// come out wrong. A claim that merely counted refusals would go green on the
// broken code, which refuses everything.

const TWO_SOURCE_FNS = ['errorText', 'count', 'reenableNotes',
  'consumeRepullSeam', 'repullExclusions', 'repullExcludesFor',
  'startCandleRepull', 'runNextRepull', 'finishRoomRepull',
  'runAdapterCollect', 'renderAdapterError', 'renderVaultRefusal',
  'readAdapterProgress', 'armAdapterReread', 'readVisionProgress',
  'armVisionReread'];

function runTwoSourceRepull(src, opts) {
  opts = opts || {};
  const guard = opts.guard !== false;
  // How many reads the fake room's reading lasts. Two is enough for the
  // client to have to wait for it; the real one takes about twenty minutes.
  const readingReads = 2;
  // 26.995-21 (WR-01/WR-02): WHICH WAY THE READOUT ANSWERS. `clean` is the
  // shipped drive every claim above uses. The other three are the arms
  // nothing in this repo had ever driven:
  //   `unusable`      — the answer cannot be read at all (three in a row is
  //                     armVisionReread's give-up), and the reading is still
  //                     going the whole time.
  //   `unknown-state` — a state the reader does not recognise (`idle` after a
  //                     room restart mid-run), which falls through to the
  //                     same give-up.
  //   `error`         — the reading itself reports a failure, with the room's
  //                     own plain-words line.
  // ⚠ In all three the fake room's reading NEVER reports done, so it still
  // holds the library — which is the whole point: a client that treats the
  // give-up as a stop walks its next source straight into the guard.
  const reading = opts.reading || 'clean';
  let visionErrored = false;
  const connected = opts.connected || ['apple-notes', 'apple-photos'];

  const room = {
    asked: [],           // sources the room actually answered 200 to
    turnedAway: [],      // sources its guard sent back the 400 to
    seamAtAsk: [],       // the seam's firing count as each ask went out
    readers: 0,          // readings in flight right now
    readersAtOnce: 0,    // the most there have ever been at one time
    visionReads: 0,
    left: 0              // reads remaining before this reading reports done
  };
  // 26.995-21 (WR-02): `painted` is the append-only log this harness always
  // kept. `paintLog` records the same events with their KIND, and the box
  // below now models what a real panel does with them — which is the only way
  // to tell "a paint happened in this order" from "she can still read it".
  const sink = { seam: 0, painted: [], timers: [], paintLog: [], trouble: [] };

  function startReading() {
    room.readers += 1;
    if (room.readers > room.readersAtOnce) {
      room.readersAtOnce = room.readers;
    }
    room.left = readingReads;
  }

  // ⛔⛔ THE BOX KEEPS ITS CONTENTS, NOT JUST A LIST OF PAINTS. An assertion
  // that one paint happened BEFORE another proves nothing about whether she
  // can read either of them: in a real panel `box.innerHTML = ...` DESTROYS
  // every child already there, and `paintVisionTrouble` does not go through
  // innerHTML at all — it inserts a <p> before the first child, so it lives
  // exactly as long as nothing assigns innerHTML after it. `nodes` models
  // both, so a claim can ask the question that matters: at the end of the
  // drive, is the reading's failure sentence still in the panel?
  const box = {
    _h: '',
    nodes: [],
    get innerHTML() { return this._h; },
    set innerHTML(v) {
      this._h = v;
      this.nodes = [v];
      sink.painted.push(v);
      sink.paintLog.push({ kind: 'innerHTML', text: v });
    }
  };

  const REPULL = { busy: false, queue: [], excludes: {}, brought: 0,
    onDone: null, holding: null, refused: null };
  // The sitting the candle tap opened: the seam it chains on, armed exactly
  // as startReflectionSession arms it.
  REPULL.onDone = function () { sink.seam += 1; };

  function get(url) {
    if (url === '/api/items') {
      return Promise.resolve({ ok: true, data: { meta: {
        connected_sources: connected,
        // she saw the picker and kept nothing out: a real answer, which the
        // shipped fail-closed filter requires before a source may be asked.
        notes_excluded_folders: [] } } });
    }
    if (url === '/api/adapter/progress') {
      return Promise.resolve({ ok: true,
        data: { state: 'done', report: {} } });
    }
    if (url === '/api/import-progress') {
      return Promise.resolve({ ok: true, data: { state: 'done',
        report: { imported: 1, items: 5 } } });
    }
    if (url === '/api/vision-progress') {
      room.visionReads += 1;
      // ⛔ THE READING IS STILL RUNNING ON ALL THREE OF THESE. The room never
      // clears `readers` here, so the guard below is still armed — a client
      // that asks the next source now really does meet the 400.
      if (reading === 'unusable') {
        return Promise.resolve({ ok: false, data: null });
      }
      if (reading === 'unknown-state') {
        return Promise.resolve({ ok: true, data: { state: 'idle' } });
      }
      if (reading === 'error-silent' && !visionErrored) {
        // ⚠ THE ARM WITH NOTHING TO SAY. A failure the room reports without a
        // message must put NO words at the candle — the reader has no
        // sentence of its own and may not invent one.
        visionErrored = true;
        room.readers = 0;
        return Promise.resolve({ ok: true, data: { state: 'error' } });
      }
      if (reading === 'error' && !visionErrored) {
        // ⚠ AND THE READING IS OVER ON THIS ONE, unlike the two above. A
        // reading that reports a failure has stopped, so the room's guard
        // stands down and the next source really is asked — which is exactly
        // what makes this arm the one where her failure sentence is at risk.
        //
        // ⛔ ONCE, AND ONLY ONCE, ON PURPOSE. If every read answered `error`
        // the SECOND source's reading would fail too and lay the sentence
        // again at the run's end — and the claim would go green on the wrong
        // failure. Exactly one reading fails here: the one she is waiting
        // through between her two apps.
        visionErrored = true;
        room.readers = 0;
        return Promise.resolve({ ok: true,
          data: { state: 'error', message: VISION_TROUBLE } });
      }
      if (room.readers === 0) {
        return Promise.resolve({ ok: true, data: { state: 'done' } });
      }
      room.left -= 1;
      if (room.left <= 0) {
        room.readers = 0;
        return Promise.resolve({ ok: true, data: { state: 'done' } });
      }
      return Promise.resolve({ ok: true, data: { state: 'running',
        done: 1, total: 4, started_ms: 1000000 } });
    }
    return Promise.resolve({ ok: false, data: null });
  }

  function post(url, payload) {
    if (url !== '/api/adapter/collect') {
      return Promise.resolve({ ok: false, data: null });
    }
    // ⚠ server.py's guard, in behaviour: a collect that arrives while the
    // reading is going is refused with VISION_BUSY_MSG and NO `refused` key,
    // which is what sends app.js down the error arm. Driven for real in
    // tests/test_server_smoke.py
    // (test_a_second_collect_during_the_vision_stage_is_refused).
    if (guard && room.readers > 0) {
      room.turnedAway.push(payload.source);
      return Promise.resolve({ ok: false, status: 400,
        data: { error: VISION_BUSY } });
    }
    room.asked.push(payload.source);
    room.seamAtAsk.push(sink.seam);
    startReading();
    return Promise.resolve({ ok: true, data: { ok: true } });
  }

  const code = TWO_SOURCE_FNS.map(function (n) {
    return extractFn(src, n);
  }).join('\n');

  // eslint-disable-next-line no-new-func
  const start = new Function(
    '$', 'APP', 'ACTIVE_ADAPTER', 'ADAPTER_BUTTON_IDS', 'VAULT_SOURCE',
    'SOURCE_EXCLUSION_META', 'REPULL', 'apiGet', 'apiPost', 'escapeHtml',
    'connectedSourceName', 'sourceExclusionKey', 'adapterErrorCopy',
    'adapterHostLive', 'roomRepullBox', 'repullQuicken',
    'renderAdapterProgress', 'renderImportProgress', 'renderImportReport',
    'paintAdapterPartial', 'renderVisionProgress', 'renderVisionLine',
    'paintVisionTrouble', 'renderVaultFolderPicker', 'VAULT_REFUSAL_TITLE',
    'VAULT_REFUSAL_WHY', 'VAULT_REFUSAL_NEXT', 'VAULT_REFUSAL_RETRY',
    'VAULT_REFUSAL_PRIVATE', 'VAULT_PICKER_UNREACHABLE', 'setTimeout',
    'warnBeforeLongRun',
    code + '\nreturn startCandleRepull;')(
    function () { return null; },
    { items: 0 },
    // ⚠ ASSIGNED BY runAdapterCollect ITSELF, never handed in.
    {},
    { 'apple-notes': 'btn-onb-source-notes',
      'apple-photos': 'btn-onb-source-photos' },
    'obsidian-vault',
    { 'apple-notes': 'notes_excluded_folders',
      'obsidian-vault': 'vault_excluded_folders' },
    REPULL,
    get,
    post,
    function (x) { return String(x); },
    function (s) {
      return (s === 'apple-notes' || s === 'apple-photos') ? s : '';
    },
    function (s) {
      return s === 'apple-notes' ? 'notes_excluded_folders' :
        (s === 'obsidian-vault' ? 'vault_excluded_folders' : '');
    },
    function () { return ''; },
    // the room view is up for the whole drive; the dead-screen case is
    // claimDeadScreenReleasesNothing's, above.
    function () { return true; },
    function () { return box; },
    function () {},
    // renderAdapterProgress, renderImportProgress, renderImportReport,
    // paintAdapterPartial, renderVisionProgress, renderVisionLine
    function () {}, function () {}, function () {}, function () {},
    function () {}, function () {},
    // paintVisionTrouble — the one painter this claim has to watch. It
    // PREPENDS, exactly as the shipped one does (insertBefore firstChild),
    // so whether the sentence survives is decided by what happens after.
    function (b, message) {
      b.nodes.unshift(message);
      sink.trouble.push(message);
      sink.paintLog.push({ kind: 'trouble', text: message });
    },
    // renderVaultFolderPicker
    function () {},
    'VAULT_REFUSAL_TITLE', 'VAULT_REFUSAL_WHY', 'VAULT_REFUSAL_NEXT',
    'VAULT_REFUSAL_RETRY', 'VAULT_REFUSAL_PRIVATE', 'VAULT_PICKER_UNREACHABLE',
    // A fake deferral: nothing runs on a clock here, and the drain below
    // decides when the one-shot re-reads happen.
    function (fn) { sink.timers.push(fn); },
    function (_box, onContinue) { onContinue(); });

  start();
  return drainTimers(sink).then(function () {
    return { room: room, sink: sink, REPULL: REPULL, box: box };
  });
}

// Flush the promise chains, then run whatever one-shot re-reads they armed,
// and repeat. Bounded: a chain that never stops ends the drive rather than
// hanging this suite, and the counts below then say so by value.
function drainTimers(sink) {
  let rounds = 0;
  function settle() {
    return flush().then(flush).then(flush).then(flush).then(flush)
      .then(flush);
  }
  function step() {
    return settle().then(function () {
      if (sink.timers.length === 0 || rounds >= 40) { return null; }
      rounds += 1;
      const due = sink.timers.splice(0, sink.timers.length);
      due.forEach(function (fn) { fn(); });
      return step();
    });
  }
  return step();
}


// ---------------------------------------------------------------------------
// ---- the claims ------------------------------------------------------------
// ---------------------------------------------------------------------------
//
// Each returns a list of plain-words violations, so a mutation's failure names
// WHICH claim broke rather than only which instrument.

const RUNNING = { state: 'running', done: 9, total: 20, started_ms: 1000000 };
const PENDING = { state: 'pending', done: 0, total: 0, started_ms: 0 };

function claimHoldsWhileRunning(src) {
  const sink = freshSink();
  // running, running, then done: the report must not appear until the third.
  return runVision(src, [RUNNING, RUNNING, { state: 'done' }],
    function () { return true; }, sink).then(function () {
    const out = [];
    if (sink.released !== 1) {
      out.push('[hold] the import report must be released EXACTLY once, when ' +
        'the reading stops — released ' + sink.released + ' times across a ' +
        'running/running/done sequence');
    }
    if (sink.painted !== 2) {
      out.push('[hold] every running read must paint the reading readout — ' +
        'she is watching this line for about twenty minutes; painted ' +
        sink.painted + ' of 2 running reads');
    }
    return out;
  });
}

function claimHoldsOnPending(src) {
  const sink = freshSink();
  // The race window: the worker has marked the other two phases done and has
  // not yet reached run_vision_stage. Releasing here blinks the report up for
  // one second and then replaces it. FOUR pendings on purpose — the miss cap
  // is three, so a `pending` that merely fell through to the miss path would
  // let go before the reading ever became visible, and a shorter sequence
  // could not tell that apart from a real hold.
  return runVision(src, [PENDING, PENDING, PENDING, PENDING, RUNNING,
    { state: 'done' }], function () { return true; }, sink)
    .then(function () {
      const out = [];
      if (sink.released !== 1) {
        out.push('[hold] `pending` is the reading phase one statement before ' +
          'it names itself and must HOLD exactly as `running` does — the ' +
          'report was released ' + sink.released + ' times, so it goes up ' +
          'over a reading that has not started yet');
      }
      if (sink.painted !== 1) {
        out.push('[hold] `pending` carries no fraction yet and must paint ' +
          'NOTHING — only the one running read with a real total should have ' +
          'painted; painted ' + sink.painted);
      }
      return out;
    });
}

// Law 3, and the reason the candle can be held at all. A reading with nothing
// to read passes through `pending` and through `running` with a total of 0 on
// its way to `done`. If either painted, a candle re-pull that found nothing
// new would put "reading your photographs: 0 of 0." in the room's panel —
// text where the shipped rule is that a run which added nothing paints none.
function claimNothingToReadPaintsNothing(src) {
  const sink = freshSink();
  return runVision(src, [PENDING, { state: 'running', done: 0, total: 0,
    started_ms: 1000000 }, { state: 'done' }],
  function () { return true; }, sink).then(function () {
    const out = [];
    if (sink.painted !== 0) {
      out.push('[hold] a reading with nothing to read must paint NOTHING at ' +
        'all — painted ' + sink.painted + ' time(s). At the candle that is ' +
        'text on a re-pull that added nothing, which is the one thing the ' +
        'in-room panel is not allowed to do.');
    }
    if (sink.released !== 1) {
      out.push('[hold] it must still release exactly once — released ' +
        sink.released);
    }
    return out;
  });
}

// A total of 0 that lasts is a CLEAN read, not a miss. run_vision_stage paints
// the honest zero and run_vision_pass replaces it only after a load_store over
// her whole library, which can outlast three one-second reads — counted as
// misses, the hold would let go mid-reading.
function claimAZeroTotalIsNotAMiss(src) {
  const sink = freshSink();
  const ZERO = { state: 'running', done: 0, total: 0, started_ms: 1000000 };
  return runVision(src, [ZERO, ZERO, ZERO, ZERO, ZERO, RUNNING,
    { state: 'done' }], function () { return true; }, sink)
    .then(function () {
      const out = [];
      if (sink.painted !== 1 || sink.released !== 1) {
        out.push('[hold] five reads with no total yet must hold silently and ' +
          'still reach the reading — painted ' + sink.painted +
          ' released ' + sink.released);
      }
      return out;
    });
}

function claimReleasesOnEveryEnding(src) {
  // 2 is the miss cap's own ending: three failed reads in a row give up, and
  // giving up on the READOUT must not mean holding the REPORT for ever.
  const endings = [
    ['done', [{ state: 'done' }], 1],
    ['skipped', [{ state: 'skipped' }], 1],
    ['error', [{ state: 'error', message: 'the photo reading could not ' +
      'finish. your photographs are untouched.' }], 1],
    ['a job that vanished (idle)', [{ state: 'idle' }], 1],
    ['three failed reads', [null], 1]
  ];
  return endings.reduce(function (chain, e) {
    return chain.then(function (out) {
      const sink = freshSink();
      return runVision(src, e[1], function () { return true; }, sink)
        .then(function () {
          if (sink.released !== e[2]) {
            out.push('[hold] ending "' + e[0] + '" must release the import ' +
              'report exactly ' + e[2] + ' time — released ' + sink.released +
              '. A hold with an ending that never lets go is a screen stuck ' +
              'on a progress line for ever, which is worse than the twenty ' +
              'silent minutes it replaced.');
          }
          return out;
        });
    });
  }, Promise.resolve([]));
}

function claimErrorSaysTheServersOwnWords(src) {
  const MSG = 'the photo reading could not finish. your photographs are ' +
    'untouched, and anything already in your library is safe. Try again.';
  const sink = freshSink();
  return runVision(src, [{ state: 'error', message: MSG }],
    function () { return true; }, sink).then(function () {
    const out = [];
    if (sink.trouble.length !== 1 || sink.trouble[0] !== MSG) {
      out.push('[hold] a reading that failed must lay the SERVER\'S OWN ' +
        'plain-words line above the released report and invent nothing — ' +
        'got ' + JSON.stringify(sink.trouble));
    }
    if (sink.released !== 1) {
      out.push('[hold] a failed reading still ends an import that SUCCEEDED ' +
        '— the report belongs on screen either way');
    }
    return out;
  });
}

function claimDeadScreenReleasesNothing(src) {
  const sink = freshSink();
  return runVision(src, [RUNNING], function () { return false; }, sink)
    .then(function () {
      const out = [];
      if (sink.released !== 0 || sink.painted !== 0 || sink.armed !== 0) {
        out.push('[hold] when the host screen has gone the readout dies with ' +
          'it (law 1) and releases NOTHING — released=' + sink.released +
          ' painted=' + sink.painted + ' armed=' + sink.armed);
      }
      return out;
    });
}

function claimAdapterHandsOffInsteadOfReporting(src) {
  const sink = freshAdapterSink();
  return runAdapter(src, sink).then(function () {
    const out = [];
    if (sink.handedToVision !== 1) {
      out.push('[wiring] with both earlier phases done the collect must hand ' +
        'to the reading readout — handed ' + sink.handedToVision +
        ' times. This is the owner\'s 2026-08-14 placement ruling and it is ' +
        'the ONE call site that makes the readout reachable at all.');
    }
    if (sink.reported !== 0 || sink.partial !== 0) {
      out.push('[wiring] the import report must NOT be painted at hand-off ' +
        'time — it is HELD until the reading stops; report=' + sink.reported +
        ' partial=' + sink.partial);
    }
    if (typeof sink.visionOnEnd !== 'function') {
      out.push('[wiring] the hand-off must carry the release callback, or ' +
        'the report can never appear at all');
      return out;
    }
    sink.visionOnEnd();
    if (sink.reported !== 1 || sink.partial !== 1) {
      out.push('[wiring] releasing must paint the SHIPPED ending — the ' +
        'import report and the collect\'s own partial line; report=' +
        sink.reported + ' partial=' + sink.partial);
    }
    return out;
  });
}

function claimRoomRepullRoutesThroughItsOwnEnding(src) {
  // 26.65-05: a candle re-pull's ending is the in-room panel and it NEVER
  // navigates. The hold belongs inside finishRoomRepull rather than here,
  // because only that function knows whether this was the last source in the
  // queue — held here, the second source would wait out the first source's
  // reading before it was ever collected.
  const sink = freshAdapterSink();
  return runAdapter(src, sink, { room: true }).then(function () {
    const out = [];
    if (sink.roomFinished !== 1 || sink.handedToVision !== 0 ||
        sink.reported !== 0) {
      out.push('[wiring] a candle re-pull must go to the in-room panel and ' +
        'nowhere else — roomFinished=' + sink.roomFinished +
        ' handedToVision=' + sink.handedToVision +
        ' importReport=' + sink.reported);
    }
    return out;
  });
}

function claimCandleHoldsItsLastWord(src) {
  // 1 already counted from an earlier source + 3 in this report = 4, so the
  // fixture also proves the accumulation still happens before the hold.
  const r = runRepullFinish(src, { queue: [], brought: 1,
    report: { imported: 3 } });
  const out = [];
  if (r.sink.vision !== 1 || typeof r.sink.onEnd !== 'function') {
    out.push('[candle] the last source of a re-pull must hand its ending to ' +
      'the reading readout (owner ruling 2026-08-14: the candle re-pull is ' +
      'held too) — handed ' + r.sink.vision + ' times');
    return out;
  }
  if (r.sink.painted.length !== 0) {
    out.push('[candle] nothing may be painted at hand-off time — the panel ' +
      'carries the reading while it runs; painted ' +
      JSON.stringify(r.sink.painted));
  }
  r.sink.onEnd();
  if (r.sink.painted.length !== 1 ||
      r.sink.painted[0].indexOf('brought in 4 things.') === -1) {
    out.push('[candle] releasing must paint the SHIPPED brought-in line — ' +
      'got ' + JSON.stringify(r.sink.painted));
  }
  return out;
}

function claimCandleSeamIsNeverHeld(src) {
  const r = runRepullFinish(src, { queue: [], brought: 4,
    report: { imported: 4 } });
  const out = [];
  if (r.sink.seam !== 1) {
    out.push('[candle] the completion seam must fire exactly once when the ' +
      'queue empties — fired ' + r.sink.seam + '. The reflection session ' +
      'chains on it, so held it would mean a tap on the candle produced ' +
      'nothing for twenty minutes.');
  }
  if (r.REPULL.busy !== false) {
    out.push('[candle] the re-pull must stop counting itself busy when its ' +
      'queue empties — a held `busy` swallows her next candle tap for the ' +
      'whole length of the reading');
  }
  r.sink.onEnd();
  if (r.sink.seamAtFirstPaint !== 1) {
    out.push('[candle] the seam must have already fired BEFORE the panel ' +
      'gets its last word — it fired at count ' + r.sink.seamAtFirstPaint +
      ', so the reflection session is waiting on the reading');
  }
  return out;
}

function claimCandleReportsTheRunItFinished(src) {
  const r = runRepullFinish(src, { queue: [], brought: 0,
    report: { imported: 3 } });
  const out = [];
  if (typeof r.sink.onEnd !== 'function') {
    out.push('[candle] nothing was held, so this claim cannot run');
    return out;
  }
  // Twenty minutes pass and she taps the candle again: REPULL.brought is a
  // live counter and a fresh run resets it. Read at release time, the panel
  // would report the WRONG run's number.
  r.REPULL.brought = 99;
  r.sink.onEnd();
  if (r.sink.painted.length !== 1 ||
      r.sink.painted[0].indexOf('brought in 3 things.') === -1) {
    out.push('[candle] the held line must report the run that finished, not ' +
      'whatever the counter says twenty minutes later — got ' +
      JSON.stringify(r.sink.painted));
  }
  return out;
}

function claimCandleSilenceSurvivesTheHold(src) {
  const r = runRepullFinish(src, { queue: [], brought: 0,
    report: { imported: 0 } });
  const out = [];
  if (typeof r.sink.onEnd !== 'function') {
    out.push('[candle] nothing was held, so this claim cannot run');
    return out;
  }
  r.sink.onEnd();
  if (r.sink.painted.length !== 1 || r.sink.painted[0] !== '') {
    out.push('[candle] a re-pull that added nothing must still end in ' +
      'silence — law 3, and the hold must not turn it into text; got ' +
      JSON.stringify(r.sink.painted));
  }
  return out;
}

// ---------------------------------------------------------------------------
// ---- the drill -------------------------------------------------------------
// ---------------------------------------------------------------------------


// ---- 26.94-14: "just show the count." -------------------------------------
//
// Shown the three-line readout in the room, she ruled it down to her approved
// sentence alone. Three claims, because the ruling has three halves that can
// each break without the others noticing: the room gets the short wrapper, the
// import screen KEEPS the long one, and the short wrapper is genuinely short.

// ---- WINDOWS #43: the readout is resumed, never left frozen ---------------
//
// The reading is ~21 minutes and she will not stand in the room for it. The
// chain stops at its host guard when she leaves (law 1) and the ending never
// fires, so the panel used to keep a count that had stopped being true. Three
// claims: the hold is RECORDED so there is something to resume from, entering
// the room RESUMES it, and the ending can only ever be released once — which
// the resume itself made possible to get wrong.

function claimTheHoldIsRecordedForTheResume(src) {
  const r = runRepullFinish(src, { queue: [], brought: 1,
    report: { imported: 3 } });
  const out = [];
  const held = r.REPULL.holding;
  if (!held || held.box !== r.box || held.ending !== r.sink.onEnd) {
    out.push('[frozen] the held ending must be recorded where a later room ' +
      'entry can find it — without it there is nothing to resume and the ' +
      'panel keeps a count that has stopped being true');
    return out;
  }
  r.sink.onEnd();
  if (r.REPULL.holding !== null) {
    out.push('[frozen] a released hold must be cleared, or the next room ' +
      'entry resumes a reading that is already over');
  }
  return out;
}

function claimEnteringTheRoomResumesIt(src) {
  const out = [];
  const code = extractFn(src, 'resumeRoomReadingReadout');
  const seen = { calls: 0, box: null, ending: null, paint: null };
  const PAINTER = function () {};
  const HELD = { box: { innerHTML: '' }, ending: function () {} };
  // eslint-disable-next-line no-new-func
  const resume = new Function('REPULL', 'readVisionProgress',
    'renderVisionLine', code + '\nreturn resumeRoomReadingReadout;')(
    { holding: HELD },
    function (box, misses, onEnd, paint) {
      seen.calls += 1; seen.box = box; seen.ending = onEnd; seen.paint = paint;
    },
    PAINTER);
  resume();
  if (seen.calls !== 1 || seen.box !== HELD.box ||
      seen.ending !== HELD.ending || seen.paint !== PAINTER) {
    out.push('[frozen] walking back into the room must pick the held readout ' +
      'back up with its own box, its own ending and the room\'s one-line ' +
      'wrapper — calls=' + seen.calls);
  }
  // ⚠ AND IT MUST DO NOTHING WHEN THERE IS NOTHING HELD. This runs on EVERY
  // room entry, including the ordinary ones where no reading is going.
  const idle = { calls: 0 };
  // eslint-disable-next-line no-new-func
  const resumeIdle = new Function('REPULL', 'readVisionProgress',
    'renderVisionLine', code + '\nreturn resumeRoomReadingReadout;')(
    { holding: null },
    function () { idle.calls += 1; },
    PAINTER);
  resumeIdle();
  if (idle.calls !== 0) {
    out.push('[frozen] an ordinary room entry must start no reader at all — ' +
      'started ' + idle.calls);
  }
  return out;
}

function claimTheEndingReleasesOnlyOnce(src) {
  const r = runRepullFinish(src, { queue: [], brought: 1,
    report: { imported: 3 } });
  const out = [];
  if (typeof r.sink.onEnd !== 'function') {
    out.push('[frozen] nothing was held, so this claim cannot run');
    return out;
  }
  // A chain armed a moment before she left can fire once the room is active
  // again, alongside the one her entry just started: two readers, two
  // releases. A release is a contract, not a repaint.
  r.sink.onEnd();
  r.sink.onEnd();
  if (r.sink.painted.length !== 1) {
    out.push('[frozen] the ending must release exactly once however many ' +
      'readers reach it — painted ' + r.sink.painted.length + ' times');
  }
  return out;
}

// The call site, read out of showScreen itself. Every claim above would stay
// green with this one line deleted — the resume would simply never run, and
// the panel would freeze again exactly as WINDOWS #43 described. Same lesson
// the import screen's hand-off taught: the call site IS the repair.
function claimTheRoomEntryIsWired(src) {
  const out = [];
  const show = extractFn(src, 'showScreen');
  const calls = (show.match(/resumeRoomReadingReadout\(\)/g) || []).length;
  if (calls !== 1) {
    out.push('[frozen] showScreen must pick a held readout back up when it ' +
      'shows the room — found ' + calls + ' call(s). Without it the resume ' +
      'exists and never runs.');
    return out;
  }
  // and it must sit on the room branch, not on every screen change
  const branch = show.slice(show.indexOf("if (name === 'room')"));
  if (branch.indexOf('resumeRoomReadingReadout()') === -1) {
    out.push('[frozen] the resume must run only when the ROOM is shown — ' +
      'started from any screen it would poll behind a panel the readout ' +
      'does not live on');
  }
  return out;
}

function claimCandleShowsOnlyTheCount(src) {
  const r = runRepullFinish(src, { queue: [], brought: 1,
    report: { imported: 3 } });
  const out = [];
  if (r.sink.paint !== r.sink.roomPainter) {
    out.push('[count] the room panel must be handed its OWN one-line wrapper ' +
      '(owner ruling 2026-08-14: "just show the count") — handed ' +
      (r.sink.paint === undefined ? 'nothing, so it falls back to the import ' +
        "screen's three lines" : 'something else'));
  }
  return out;
}

// Since 2026-08-14 both surfaces draw the SAME card — she ruled "give the
// import screen the same bar" — but they are still two different endings, and
// the import screen reaches its one by falling through rather than by being
// handed the room's wrapper. If it were handed renderVisionLine it would lose
// its own closing sentence.
function claimTheImportScreenFallsThroughToItsOwn(src) {
  const sink = freshAdapterSink();
  return runAdapter(src, sink).then(function () {
    const out = [];
    if (sink.visionPaint !== undefined) {
      out.push('[count] the import screen must fall through to its OWN ' +
        'readout — it draws the same card as the room and then adds "you can ' +
        'close this; the room will be ready.", a sentence that is true there ' +
        'and meaningless in the room. Handed the room\'s wrapper it would ' +
        'silently lose that line.');
    }
    return out;
  });
}

// The room's readout, run against the real bytes. Her sentence is LIFTED, not
// retyped: the byte pin lives in tests/test_no_push.cjs and this suite must
// not become a second place her wording is written down.
//
// ⚠ THE BAR IS LAW 6's, NOT A DECORATION. "Unlimited machine time is fine
// behind a progress bar with an honest ETA" — the room had the honest
// fraction and no bar until she asked for one on 2026-08-14.
function paintRoomLine(src, snap, nowMs) {
  const code = extractFn(src, 'groupThousands') + '\n' +
    extractFn(src, 'visionStageLine') + '\n' +
    extractFn(src, 'importEtaLine') + '\n' +
    extractFn(src, 'visionEtaLine') + '\n' +
    extractFn(src, 'renderVisionLine');
  // eslint-disable-next-line no-new-func
  // appendLongWaitW1 / ACTIVE_ADAPTER / REPULL: W-1 (26.997-03) appends after
  // the card; this harness is about the count+bar shape, so the append is a
  // no-op here. Byte pin for W-1 lives in test_session_flow.cjs.
  const render = new Function('escapeHtml', 'escapeAttr', 'count', 'Date',
    'appendLongWaitW1', 'ACTIVE_ADAPTER', 'REPULL',
    code + '\nreturn renderVisionLine;')(
    function (x) { return String(x); },
    function (x) { return String(x); },
    function (n, one, many) { return n + ' ' + (n === 1 ? one : many); },
    { now: function () { return nowMs; } },
    function () {},
    { source: '' },
    { longWaitAttempted: 0 });
  const box = { innerHTML: '' };
  render(box, snap);
  return box.innerHTML;
}

const STARTED_AT = 1000000;

function claimTheRoomShowsHerBar(src) {
  const out = [];
  // 7 of 20 done, ten seconds elapsed: past both of importEtaLine's refusal
  // thresholds, so this snapshot HAS a forecast.
  const html = paintRoomLine(src,
    { state: 'running', done: 7, total: 20, started_ms: STARTED_AT },
    STARTED_AT + 10000);
  const want = 'reading your photographs: 7 of 20.';
  if (html.indexOf(want) === -1) {
    out.push('[bar] the room must still carry her approved sentence with the ' +
      'live count — got ' + html);
  }
  if (html.indexOf('width:35.0%') === -1) {
    out.push('[bar] the fill must be the real fraction (7 of 20 = 35.0%) — ' +
      'a bar that does not move with the reading is worse than no bar; got ' +
      html);
  }
  if (html.indexOf('var(--clay)') === -1) {
    out.push('[bar] the fill must be her chosen terracotta; got ' + html);
  }
  if (html.indexOf('var(--accent)') !== -1) {
    out.push('[bar] the fill must NOT be the coral — in this room that ' +
      'colour means a proposal she has seen and allowed, and the readout is ' +
      'not asking her for anything');
  }
  // ⚠ THE EXPECTED PHRASE IS importEtaLine'S REAL ANSWER, COMPUTED BY HAND
  // AND CHECKED: 10s elapsed over 7 done, 13 left => 10000/7*13 = 18.6s, which
  // rounds under a minute. A first draft of this claim asserted "about 1
  // minute" and went red against correct code — the instrument was wrong, not
  // the room.
  if (html.indexOf('35.0% \u00b7 less than a minute left') === -1) {
    out.push('[bar] the honest ETA must ride beside the percentage (law 6) ' +
      'and say what it is — got ' + html);
  }
  return out;
}

// The other half of the ETA contract: when importEtaLine REFUSES to forecast,
// the room must not staple "left" onto its refusal.
function claimTheBarNeverInventsAForecast(src) {
  const out = [];
  // 2 done, one second elapsed: under BOTH thresholds.
  const html = paintRoomLine(src,
    { state: 'running', done: 2, total: 20, started_ms: STARTED_AT },
    STARTED_AT + 1000);
  if (html.indexOf('still counting') === -1) {
    out.push('[bar] with too little to go on the room must say it is still ' +
      'counting, in importEtaLine\'s own words — got ' + html);
  }
  if (/still counting[^<]*left/.test(html)) {
    out.push('[bar] "left" must not be stapled onto a refusal to forecast — ' +
      'that reads as a forecast; got ' + html);
  }
  if (html.indexOf('10.0%') === -1) {
    out.push('[bar] the percentage is real even when the forecast is not, ' +
      'and must still show; got ' + html);
  }
  return out;
}

// ---- 26.995-14 (G-26.995-2): THE ARM NOTHING HAD EVER DRIVEN --------------
//
// Driven BY VALUE through the shipped collect. The claim below is the one that
// was red before the fix; the two under it are its controls and were green
// on both sides of it.
function claimAFailedCollectStillStartsTheSitting(src) {
  return runFailedCollect(src, { room: true, response: BUSY_ANSWER })
    .then(function (r) {
      const out = [];
      const last = r.sink.painted[r.sink.painted.length - 1] || '';
      if (r.sink.seam !== 1) {
        out.push('[error-arm] a candle collect that came back a plain error ' +
          'must fire the completion seam EXACTLY ONCE - fired ' + r.sink.seam +
          '. At 0 the tap produces no sitting at all: the session waits on ' +
          '"gathering what\'s new..." until the 45-second bound tells her the ' +
          'librarian was slow, and the librarian was never asked. That is ' +
          'G-26.995-2, and it shipped.');
      }
      if (last.indexOf(VISION_BUSY) === -1) {
        out.push('[error-arm] she is STILL told the collect failed, in the ' +
          'route\'s own words - the release does not buy the sitting by ' +
          'swallowing the error; painted ' + JSON.stringify(last));
      }
      if (last.indexOf('try again') === -1) {
        out.push('[error-arm] the failed collect must still offer "try ' +
          'again" - she is entitled to BOTH, the sentence and the sitting, ' +
          'never one bought with the other; painted ' + JSON.stringify(last));
      }
      return out;
    });
}

// The instrument's own control. If this ever reads 0 the harness cannot see a
// release at all and the claim above proves nothing about anything.
// ⛔ THIS ARM IS UNCHANGED BY 26.995-14 and must stay unchanged.
function claimTheRefusalArmStillStartsTheSitting(src) {
  return runFailedCollect(src, { room: true, response: { ok: false,
    status: 409,
    data: { ok: false, refused: true, source: 'apple-photos',
      reason: 'private_folders' } } })
    .then(function (r) {
      const out = [];
      if (r.sink.seam !== 1) {
        out.push('[control] the refusal arm already released before ' +
          '26.995-14 and must still release exactly once - fired ' +
          r.sink.seam + '. Red here means the harness cannot observe a ' +
          'release, not that the room is broken.');
      }
      if (r.sink.next !== 0) {
        out.push('[control] with an empty queue a refusal ENDS the run - it ' +
          'must not walk to a next source; walked ' + r.sink.next + ' times.');
      }
      return out;
    });
}

// The other side of the gate, and the reason the fix could not be made by
// releasing unconditionally. The sources screen is not the candle: nothing is
// waiting on a seam there, and firing one would release a session she never
// started.
function claimAFailedCollectOutsideTheRoomStartsNothing(src) {
  return runFailedCollect(src, { room: false, response: BUSY_ANSWER })
    .then(function (r) {
      const out = [];
      if (r.sink.seam !== 0) {
        out.push('[control] a collect that failed OUTSIDE room mode must ' +
          'release NOTHING - fired ' + r.sink.seam + '. A release made ' +
          'unconditional passes the error-arm claim above and fails here, ' +
          'which is the entire reason this control exists (T-26.995-42).');
      }
      return out;
    });
}


// ---- 26.995-15 (G-26.995-3): the second source waits its turn -------------

function claimCandleQueueWaitsItsTurn(src) {
  const r = runRepullFinish(src, { queue: ['apple-photos'], brought: 1,
    report: { imported: 1 } });
  const out = [];
  if (r.sink.next !== 0) {
    out.push('[candle] with a source still queued the re-pull must NOT go ' +
      'straight to it — it went ' + r.sink.next + ' time(s). The reading ' +
      'this collect just started is what refuses the next source, so ' +
      'moving now is the refusal (G-26.995-3).');
  }
  if (r.sink.vision !== 1) {
    out.push('[candle] the queue must wait for the reading to stop — ' +
      'heldForReading=' + r.sink.vision);
  }
  if (r.sink.seam !== 1) {
    out.push('[candle] the sitting must be released BEFORE the wait, not ' +
      'behind it — seam fired ' + r.sink.seam + '. Held, a tap on the ' +
      'candle would produce nothing at all while a source waits its turn.');
  }
  // ⛔⛔ THIS PAIR REPLACES A SINGLE ASSERTION THAT CERTIFIED THE DEFECT.
  // It used to read `if (r.REPULL.busy !== true)` — i.e. it required the very
  // flag value that made `startReflectionSession` swallow her tap, so a
  // 54-case green run sat on top of CR-01 for as long as the bug shipped.
  // The two facts are now asserted SEPARATELY and BY VALUE, and neither is a
  // negation of the other: no collect is in flight, AND a source is queued.
  // Re-merging them puts CR-01 back and four mutations below say so.
  if (r.REPULL.busy !== false) {
    out.push('[candle] no collect is in flight while the reading runs — ' +
      'busy=' + r.REPULL.busy + '. True here is CR-01: the session opener ' +
      'reads this same flag, so a tap during the wait gives her the flame ' +
      'and nothing else.');
  }
  if (r.REPULL.pendingSource !== true) {
    out.push('[candle] but a source IS queued behind that reading — ' +
      'pendingSource=' + r.REPULL.pendingSource + '. False here would let a ' +
      'second tap start a second queue over the same reading.');
  }
  if (!r.REPULL.holding || r.REPULL.holding.box !== r.box ||
      typeof r.REPULL.holding.ending !== 'function') {
    out.push('[candle] the wait must be recorded for the resume — the ' +
      'readout chain dies with the room view (law 1), so a wait she walks ' +
      'out of would strand the source behind it AND strand `busy` with it, ' +
      'swallowing every later tap. Got ' + JSON.stringify(r.REPULL.holding));
    return out;
  }
  r.REPULL.holding.ending();
  if (r.sink.next !== 1) {
    out.push('[candle] the recorded wait must move to the next source when ' +
      'the reading stops — next=' + r.sink.next);
  }
  r.sink.onEnd();
  if (r.sink.next !== 1) {
    out.push('[candle] the wait must fire ONCE — the resumed chain and the ' +
      'original can both land, and two collects at once is the very harm ' +
      'the guard exists for. next=' + r.sink.next);
  }
  return out;
}

function claimBothConnectedAppsAreAsked(src) {
  return runTwoSourceRepull(src, {}).then(function (r) {
    const out = [];
    if (r.room.asked.length !== 2) {
      out.push('[two-source] a candle re-pull must ask EVERY connected app ' +
        'what is new — sources asked ' + r.room.asked.length + ' ' +
        JSON.stringify(r.room.asked) + ', turned away ' +
        JSON.stringify(r.room.turnedAway) + '. Her library has two ' +
        'connected and the second has never once been asked (G-26.995-3).');
    }
    if (r.room.asked.join(',') !== 'apple-notes,apple-photos') {
      out.push('[two-source] both connected apps must be asked, in her ' +
        'stored order — got ' + JSON.stringify(r.room.asked));
    }
    if (r.room.turnedAway.length !== 0) {
      out.push('[two-source] no source may be turned away by the reading ' +
        'the run itself started — turned away ' +
        JSON.stringify(r.room.turnedAway));
    }
    return out;
  });
}

function claimNeverTwoReadersOverOneLibrary(src) {
  // ⚠ THE GUARD IS DROPPED FOR THIS ONE, ON PURPOSE. Against a room that
  // enforces it, "no two readers" is the room's own answer being read back —
  // a mirror. Against a room that would allow it, only the CLIENT waiting its
  // turn keeps the count at one, which is the property her ruling has to buy.
  return runTwoSourceRepull(src, { guard: false }).then(function (r) {
    const out = [];
    if (r.room.readersAtOnce !== 1) {
      out.push('[two-source] no two readings may ever run over one library ' +
        'at once — the most at one time was ' + r.room.readersAtOnce + '. ' +
        'This is asserted DIRECTLY against a room that would have allowed ' +
        'it, never inferred from a refusal count (T-26.995-51).');
    }
    if (r.room.asked.length !== 2) {
      out.push('[two-source] and both sources must still be asked while ' +
        'that holds — asked ' + JSON.stringify(r.room.asked));
    }
    return out;
  });
}

function claimTheSittingStartsBeforeTheWait(src) {
  return runTwoSourceRepull(src, {}).then(function (r) {
    const out = [];
    if (r.sink.seam !== 1) {
      out.push('[two-source] the sitting the tap opened must be released ' +
        'exactly once — fired ' + r.sink.seam);
    }
    if (r.room.seamAtAsk.length !== 2 || r.room.seamAtAsk[1] !== 1) {
      out.push('[two-source] the sitting must already be running by the ' +
        'time the second source is asked — the seam had fired ' +
        JSON.stringify(r.room.seamAtAsk) + ' times as each ask went out. ' +
        'Behind the wait, a tap on the candle would produce no reflection ' +
        'for twenty minutes: the room going dead under her hand.');
    }
    return out;
  });
}


// ---------------------------------------------------------------------------
// ---- 26.995-21 (WR-01): THE ARMS NOTHING HAS EVER DRIVEN ------------------
// ---------------------------------------------------------------------------
//
// The wait ends on `onEnd`, and `onEnd` used to say only THAT the readout had
// stopped, never WHY. Two routes fire it while the reading is still going:
// three unreadable answers in a row, and any state the reader does not
// recognise (`idle` after a room restart mid-run). On either one the next
// source was asked while the reading still held the library, and the reading
// this very run started turned it away — the collision her ruling bought the
// wait to remove, restored on the two arms no control had ever driven. The
// reviewer printed it against the shipped bytes on 2026-08-21:
//
//     asked      : ["apple-notes"]
//     turnedAway : ["apple-photos"]
//
// ⛔ AND THEY MAY NOT BE MIRRORS. Nothing below asserts that `takeTurn` takes
// a parameter or that any condition string changed. Each arm drives the
// SHIPPED chain against a room whose readout answers that way and COUNTS, BY
// VALUE, which sources were asked and which were turned away.

function giveUpViolations(tag, r) {
  const out = [];
  if (r.room.asked.length !== 1 || r.room.asked[0] !== 'apple-notes') {
    out.push('[' + tag + '] a readout the room GAVE UP READING is not the ' +
      'reading having stopped — the next source must NOT be asked. Asked ' +
      JSON.stringify(r.room.asked) + ', turned away ' +
      JSON.stringify(r.room.turnedAway) + '.');
  }
  if (r.room.turnedAway.length !== 0) {
    out.push('[' + tag + '] and NO source may be turned away by the reading ' +
      'this run itself started — turned away ' +
      JSON.stringify(r.room.turnedAway) + '. That is G-26.995-3 restored: ' +
      'her Photos dropped for that tap, a server-internal sentence in the ' +
      'panel, and a `try again` that will be refused for as long as the ' +
      'reading runs.');
  }
  // ⛔ AND THE RUN MUST END WHOLE. 26.995-17's defect one level up: a run
  // state left standing turns every later candle tap away for ever. Dropping
  // the queued source without ending the run would trade one defect for it.
  if (r.REPULL.busy !== false || r.REPULL.pendingSource !== false ||
      r.REPULL.queue.length !== 0) {
    out.push('[' + tag + '] a run that gives up must end the way a run with ' +
      'nothing left to do already ends — busy=' + r.REPULL.busy +
      ' pendingSource=' + r.REPULL.pendingSource + ' queue=' +
      JSON.stringify(r.REPULL.queue) + '. Anything left standing here is ' +
      'the swallowed-for-ever defect (26.995-17).');
  }
  return out;
}

function claimAGiveUpNeverAsksTheNextSource(src) {
  return runTwoSourceRepull(src, { reading: 'unusable' })
    .then(function (r) { return giveUpViolations('give-up', r); });
}

function claimAnUnrecognisedStateNeverAsksTheNextSource(src) {
  return runTwoSourceRepull(src, { reading: 'unknown-state' })
    .then(function (r) { return giveUpViolations('unknown-state', r); });
}

// ---- 26.995-21 (WR-02): SHE IS TOLD ON BOTH BRANCHES, NOT ONE -------------
//
// ⛔⛔ AND THIS IS ASSERTED ON WHAT THE PANEL CONTAINS, NOT ON WHICH PAINT
// CAME FIRST. A paint-order assertion would have gone GREEN on a change that
// still loses the sentence: MEASURED on 2026-08-21, painting BEFORE releasing
// puts the trouble line earlier in the log and she still never sees it,
// because the next collect's first statement assigns the panel's contents and
// an assignment destroys what is already there. It also breaks the branch
// that worked. Both orderings, both arms, driven:
//
//   released then painted (shipped) : mid-queue false · after-the-last true
//   painted then released (proposed): mid-queue false · after-the-last FALSE
//   the sentence carried to the end : mid-queue TRUE  · after-the-last TRUE
//
// So the question this claim asks is the one that matters — at the end of the
// drive, is the room's own sentence still in the panel — and the paint
// indices are asserted underneath it, by value, to pin HOW it got there.

function troubleAt(r) {
  let at = -1;
  r.sink.paintLog.forEach(function (p, i) {
    if (p.kind === 'trouble' && at === -1) { at = i; }
  });
  return at;
}

function panelHas(r, text) {
  return r.box.nodes.some(function (n) { return String(n) === text; });
}

function claimTheReadingsFailureReachesHerOnBothBranches(src) {
  const out = [];
  return runTwoSourceRepull(src, { reading: 'error' }).then(function (mid) {
    if (mid.room.asked.length !== 2) {
      out.push('[wr-02] a reading that FAILED has stopped, so the next ' +
        'source must still be asked — asked ' +
        JSON.stringify(mid.room.asked) + '. Without that this arm is not ' +
        'the mid-queue arm at all.');
    }
    if (!panelHas(mid, VISION_TROUBLE)) {
      out.push('[wr-02] when the reading fails BETWEEN two of her apps she ' +
        'must be told, exactly as she is when it fails after the last one — ' +
        'the room\'s own sentence is not in the panel at the end of the run. ' +
        'Panel: ' + JSON.stringify(mid.box.nodes) + '. Law 6 held on one ' +
        'branch and not the other is law 6 not held.');
    }
    if (mid.box.nodes[0] !== VISION_TROUBLE) {
      out.push('[wr-02] and it must sit ABOVE the run\'s last word, the ' +
        'place it already occupies on the other branch — panel ' +
        JSON.stringify(mid.box.nodes));
    }
    if (mid.sink.trouble.length !== 1) {
      out.push('[wr-02] laid exactly once — ' +
        JSON.stringify(mid.sink.trouble));
    }
    // BY VALUE, and deliberately the opposite way round from the fix the
    // review proposed: the sentence is laid AFTER the next collect has taken
    // the panel, because anything laid before it is destroyed by that claim.
    const at = troubleAt(mid);
    const secondCollectAt = 2;
    if (at <= secondCollectAt) {
      out.push('[wr-02] the sentence must be laid AFTER the next collect ' +
        'has claimed the panel, not into one it is about to wipe — trouble ' +
        'at ' + at + ', the next collect\'s first paint at ' +
        secondCollectAt + '. Paints: ' +
        JSON.stringify(mid.sink.paintLog.map(function (p) {
          return p.kind === 'trouble' ? 'TROUBLE' : p.text.slice(0, 20);
        })));
    }
    if (mid.REPULL.trouble !== null) {
      out.push('[wr-02] and the held sentence must be consumed, not left on ' +
        'the run to be laid again on a later tap — trouble=' +
        JSON.stringify(mid.REPULL.trouble));
    }
    return runTwoSourceRepull(src, { reading: 'error',
      connected: ['apple-notes'] });
  }).then(function (last) {
    // ⚠ THE UNMUTATED CONTROL: the branch that already worked, in the same
    // run, asserting the SHIPPED order is untouched — the ending is released
    // first and the line laid above it.
    if (!panelHas(last, VISION_TROUBLE) ||
        last.box.nodes[0] !== VISION_TROUBLE) {
      out.push('[wr-02 control] the after-the-last-source branch is ' +
        'unchanged and still tells her — panel ' +
        JSON.stringify(last.box.nodes));
    }
    const at = troubleAt(last);
    if (at !== last.sink.paintLog.length - 1) {
      out.push('[wr-02 control] and there the line is still laid LAST, ' +
        'above the released ending — trouble at ' + at + ' of ' +
        last.sink.paintLog.length + ' paints.');
    }
    return runTwoSourceRepull(src, { reading: 'error-silent' });
  }).then(function (silent) {
    // ⛔ NOTHING IS INVENTED. A failure carrying no message paints no words.
    if (silent.sink.trouble.length !== 0) {
      out.push('[wr-02] a failure with no sentence of its own must put NO ' +
        'words at the candle — got ' + JSON.stringify(silent.sink.trouble) +
        '. A client-side fallback would be front-facing copy she has never ' +
        'seen.');
    }
    if (silent.REPULL.trouble) {
      out.push('[wr-02] and nothing is held either — trouble=' +
        JSON.stringify(silent.REPULL.trouble));
    }
    return out;
  });
}

function claimAWaitThatLostItsCollectDoesNotStartOnTop(src) {
  // ⛔ REVIEW WR-05. `ACTIVE_ADAPTER` is one module-global that every collect
  // reassigns, and `adapterHostLive()` branches on its `room` flag to decide
  // which screen a readout belongs to. The wait now holds that global open
  // for the whole reading — minutes, where it used to be microseconds — so a
  // collect she starts from Manage in that window owns it. Starting source
  // two on top of her collect takes it back with room mode on, and HER live
  // readout then asks about a screen that is not up and dies with no line.
  //
  // ⚠ NOT DRIVEN END TO END, AND SAID SO PLAINLY: the harm needs two hosts
  // and a real DOM. What is driven here is the REFUSAL — that a wait which no
  // longer owns the identity does not start its second source — and the
  // paired control that one which does owns it still starts it.
  const out = [];
  const opts = function () {
    return { queue: ['apple-photos'], brought: 1, report: { imported: 1 },
      active: { source: 'apple-notes', room: true } };
  };
  const lost = runRepullFinish(src, opts());
  if (!lost.REPULL.holding) {
    out.push('[wr-05] the wait must be recorded before it can be driven — ' +
      'got ' + JSON.stringify(lost.REPULL.holding));
    return out;
  }
  // She opened Manage mid-reading and started a collect of her own.
  lost.sink.active.room = false;
  // The reading then really stops — a REAL ending, not a give-up, so nothing
  // but the identity check can hold this back.
  lost.REPULL.holding.ending(true);
  if (lost.sink.next !== 0) {
    out.push('[wr-05] a run that no longer owns the collect identity must ' +
      'NOT start its second source on top of another collect — it went ' +
      lost.sink.next + ' time(s).');
  }
  if (lost.REPULL.busy !== false || lost.REPULL.pendingSource !== false ||
      lost.REPULL.queue.length !== 0) {
    out.push('[wr-05] and it must still end WHOLE — busy=' +
      lost.REPULL.busy + ' pendingSource=' + lost.REPULL.pendingSource +
      ' queue=' + JSON.stringify(lost.REPULL.queue));
  }
  const kept = runRepullFinish(src, opts());
  if (!kept.REPULL.holding) {
    out.push('[wr-05 control] the wait must be recorded here too');
    return out;
  }
  kept.REPULL.holding.ending(true);
  if (kept.sink.next !== 1) {
    out.push('[wr-05 control] a run that DOES still own the identity must ' +
      'move to its second source when the reading stops — next=' +
      kept.sink.next + '. Her ruling is a wait, not a refusal.');
  }
  return out;
}

function claimACleanReadStillAsksBoth(src) {
  // ⚠ THE PAIRED, UNMUTATED CONTROL for the two arms above, driven through
  // the same harness and asserting the SAME TWO NUMBERS. Without it, a change
  // that simply stopped asking anything at all would satisfy both give-up
  // claims and read as a fix.
  return runTwoSourceRepull(src, {}).then(function (r) {
    const out = [];
    if (r.room.asked.length !== 2 ||
        r.room.asked.join(',') !== 'apple-notes,apple-photos') {
      out.push('[clean-read control] a readout that really stopped must ' +
        'still hand on to the next source — her ruling `A — Wait your turn` ' +
        'is a WAIT, not a refusal. Asked ' + JSON.stringify(r.room.asked));
    }
    if (r.room.turnedAway.length !== 0) {
      out.push('[clean-read control] and still nothing turned away — ' +
        JSON.stringify(r.room.turnedAway));
    }
    return out;
  });
}


// ---------------------------------------------------------------------------
// ---- harness E: the SHIPPED session opener, driven against the run state
//      the SHIPPED wait branch actually leaves behind (26.995-17 / CR-01) ----
// ---------------------------------------------------------------------------
//
// ⛔⛔ THE RUN STATE IS NOT TYPED IN BY HAND ON THE ARM THAT MATTERS. It is
// produced by running the real `finishRoomRepull` (harness C) and then the
// SAME OBJECT is handed to the real `startReflectionSession`. A harness that
// seeded its own idea of "waiting" would be asserting the author's expectation
// of the wait rather than the wait itself — which is this repo's signature
// defect (a check that re-derives its expectation from the code it guards),
// and CR-01 is an instance of it: a 54-case green run sat on top of the bug
// because the suite asserted the very flag value that produced it.
//
// Everything the opener reaches for is injected and COUNTED. Nothing is
// retyped from app.js.

function runSessionOpener(src, opts) {
  const code = extractFn(src, 'startReflectionSession');
  const sink = { busyBegin: 0, ensureHome: 0, paintSpot: 0, reachReset: 0,
    offerBeat: 0, repull: 0, statusFetch: 0, seam: 0, busyNote: 0 };
  const SESSION = { busy: !!opts.sessionBusy, view: 'idle' };
  const WHY = { host: null };
  // NOT null: the shipped re-entry arm fetches and recurses on a null status,
  // and that arm is not what this claim is about.
  const LIBRARIAN = { status: { available: true } };
  const REPULL = opts.REPULL;
  const SEAM = function sessionRepullFinished() { sink.seam += 1; };
  // eslint-disable-next-line no-new-func
  // ⚠ 2026-08-23: `visitGatherDone` is a NEW dependency of the shipped opener
  // (her gather-at-the-landing ruling). A harness that did not inject it threw
  // `visitGatherDone is not defined` the moment the branch landed — which is
  // the RIGHT failure: a stub that has drifted from the thing it stands in for
  // is a suite measuring itself, and this one said so instead of passing.
  // ⚠ 2026-08-25: `candleBusyNoteSeat` and `$` are new dependencies the same
  // way (her a-tap-is-answered ruling: the REPULL.busy arm seats her line,
  // and the opening sitting clears any stale copy of it). Injected and
  // COUNTED, per this harness's own rule above.
  const fn = new Function('DIEGETIC_ROOM_ENABLED', 'LIBRARIAN', 'SESSION',
    'REPULL', 'apiGet', 'librarianOn', 'sessionBusyBegin', 'sessionEnsureHome',
    'sessionPaintSpot', 'reachReset', 'WHY', 'sessionRepullFinished',
    'sessionOfferBeat', 'startCandleRepull', 'visitGatherDone',
    'candleBusyNoteSeat', '$',
    code + '\nreturn startReflectionSession;')(
    true, LIBRARIAN, SESSION, REPULL,
    function () {
      sink.statusFetch += 1;
      return Promise.resolve({ ok: false, data: null });
    },
    function () { return true; },
    function () { sink.busyBegin += 1; SESSION.busy = true; },
    function () { sink.ensureHome += 1; },
    function () { sink.paintSpot += 1; },
    function () { sink.reachReset += 1; },
    WHY,
    SEAM,
    function () { sink.offerBeat += 1; },
    function () { sink.repull += 1; },
    function () { return !!opts.gatherDone; },
    function () { sink.busyNote += 1; },
    function () { return null; });
  fn();
  return { sink: sink, SESSION: SESSION, REPULL: REPULL, seam: SEAM };
}


// ---------------------------------------------------------------------------
// ---- HER RULING 2026-08-23: the landing gathers, so the candle need not ----
// ---------------------------------------------------------------------------
//
// Her 2026-08-21 sitting died because 27 seconds of gathering sat inside a
// 45-second clock that starts at the tap. She ruled the gathering happens at
// the LANDING. Record:
// 26.995-OWNER-RULING-2026-08-23-gather-before-the-candle.md
//
// ⛔ BOTH ARMS ARE BUILT, and that is the point: a claim with only the arm
// that should pass proves nothing. The SAME opener, the SAME run state, ONE
// input different.

function claimTheLandingGatherSpareTheCandle(src) {
  const out = [];
  const idle = { busy: false, pendingSource: false, queue: [], excludes: {},
    brought: 0, onDone: null, holding: null, refused: null, trouble: null };

  // ---- ARM 1: nothing gathered yet — the tap must gather, as it always did.
  const before = runSessionOpener(src, {
    REPULL: JSON.parse(JSON.stringify(idle)), sessionBusy: false,
    gatherDone: false });
  if (before.sink.repull !== 1) {
    out.push('[landing] with no landing gather done, the tap must still ' +
      'gather exactly as it always has — started it ' + before.sink.repull +
      ' time(s), expected 1. This is the arm that must NOT change: if the ' +
      'landing never lands, the worst case is the behaviour she has today.');
  }
  if (before.sink.seam !== 0) {
    out.push('[landing] and it must NOT release the sitting before the ' +
      'gather has run — the seam fired ' + before.sink.seam + ' time(s)');
  }

  // ---- ARM 2: the landing already gathered — the tap must NOT gather again.
  const after = runSessionOpener(src, {
    REPULL: JSON.parse(JSON.stringify(idle)), sessionBusy: false,
    gatherDone: true });
  if (after.sink.repull !== 0) {
    out.push('[landing] ⛔ HER RULING: with the landing gather already done, ' +
      'the tap must NOT gather again — it started one ' + after.sink.repull +
      ' time(s). Every second spent here is a second off the give-up clock, ' +
      'which starts at the tap and which she has ruled three times keeps ' +
      'running.');
  }
  if (after.sink.seam !== 1) {
    out.push('[landing] ⛔ and it must go STRAIGHT ON — the completion seam ' +
      'fired ' + after.sink.seam + ' time(s), expected 1. Zero here is a ' +
      'sitting that opens and then waits for a gather nobody is running: ' +
      'the flame and nothing else, which is CR-01 wearing a new hat.');
  }

  // ---- the sitting is a WHOLE sitting on both arms -------------------------
  if (before.sink.busyBegin !== 1 || after.sink.busyBegin !== 1) {
    out.push('[landing] both arms must open a real sitting — began ' +
      before.sink.busyBegin + ' (before) and ' + after.sink.busyBegin +
      ' (after), expected 1 each');
  }
  if (before.sink.reachReset !== 1 || after.sink.reachReset !== 1) {
    out.push('[landing] and both must reset the visit — ' +
      before.sink.reachReset + ' / ' + after.sink.reachReset);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ---- harness F: the SHIPPED startCandleRepull, over a given run state -----
// ---------------------------------------------------------------------------
//
// Counts what a tap actually DOES: whether it asks the room what is new
// (`api`), whether it starts a collect (`next`), and whether it releases the
// sitting it was chained to (`seam`). A silent refusal and a fail-open refusal
// differ only in that last number, and the difference is a sitting that hangs.

function runCandleStart(src, opts) {
  const code = extractFn(src, 'startCandleRepull');
  const sink = { seam: 0, next: 0, api: 0 };
  const REPULL = opts.REPULL;
  const box = { innerHTML: null };
  const meta = { connected_sources: ['apple-notes'],
    apple_notes_excluded_folders: [] };
  // eslint-disable-next-line no-new-func
  const fn = new Function('REPULL', 'roomRepullBox', 'consumeRepullSeam',
    'apiGet', 'connectedSourceName', 'sourceExclusionKey', 'repullExclusions',
    'runNextRepull',
    code + '\nreturn startCandleRepull;')(
    REPULL,
    function () { return box; },
    function () { sink.seam += 1; },
    function () {
      sink.api += 1;
      return Promise.resolve({ ok: true, data: { meta: meta } });
    },
    function (s) { return s === 'apple-notes' ? 'Notes' : ''; },
    function () { return 'apple_notes_excluded_folders'; },
    function () { return {}; },
    function () { sink.next += 1; });
  fn();
  return flush().then(flush).then(function () {
    return { sink: sink, REPULL: REPULL, box: box };
  });
}

// ---------------------------------------------------------------------------
// ---- HER RULING 2026-08-25: a tap during a COLLECT is ANSWERED ------------
// ---------------------------------------------------------------------------
//
// "we need to have a message when the user is tapping the candle otherwise it
// feels like the librarian is broken" — after two silently swallowed taps in
// one night. Record: 26.995-OWNER-RULING-2026-08-25-skip-new-videos-and-the-
// candle-says-so.md. The tap still opens NO second sitting and starts NO
// second collect (both unchanged and asserted); what changed is that it no
// longer answers with NOTHING.

function claimATapDuringACollectIsAnswered(src) {
  const out = [];
  const collecting = { busy: true, pendingSource: false, queue: [],
    excludes: {}, brought: 0, onDone: null, holding: null, refused: null,
    trouble: null, candleAsked: false };
  const tap = runSessionOpener(src, { REPULL: collecting,
    sessionBusy: false });
  if (tap.sink.busyBegin !== 0 || tap.sink.repull !== 0) {
    out.push('[collect-tap] the guard itself must hold — no second sitting ' +
      '(' + tap.sink.busyBegin + ') and no second collect (' +
      tap.sink.repull + ') while one runs');
  }
  if (tap.sink.busyNote !== 1) {
    out.push('[collect-tap] ⛔ HER RULING 2026-08-25: the tap must be ' +
      'ANSWERED — her line seated ' + tap.sink.busyNote + ' time(s), ' +
      'expected 1. Zero is the silent swallow she named: "it feels like ' +
      'the librarian is broken".');
  }
  if (tap.REPULL.candleAsked !== true) {
    out.push('[collect-tap] and the run must remember it was asked ' +
      '(candleAsked=' + tap.REPULL.candleAsked + ') so the progress ' +
      'repaints re-seat her line instead of wiping it within one tick');
  }
  // CONTROL: an open SITTING (no collect) keeps its shipped re-entry — the
  // paper comes back, and her collect line has no business appearing.
  const reopened = runSessionOpener(src, {
    REPULL: { busy: false, pendingSource: false, candleAsked: false },
    sessionBusy: true });
  if (reopened.sink.ensureHome !== 1 || reopened.sink.paintSpot !== 1 ||
      reopened.sink.busyNote !== 0) {
    out.push('[collect-tap control] a tap on an OPEN sitting must bring ' +
      'its paper back (home ' + reopened.sink.ensureHome + ', painted ' +
      reopened.sink.paintSpot + ') and seat no collect line (' +
      reopened.sink.busyNote + ')');
  }
  return out;
}

// ---------------------------------------------------------------------------
// ---- harness G: the WHOLE dirty night of 2026-08-25, one shared state -----
// ---------------------------------------------------------------------------
//
// The 04:06 swallow (26.995-OBSERVATION-2026-08-25-her-sitting-timed-out-
// under-a-loaded-machine.md § FOURTH DEAD TAP): after a night of
// landing gather → tap during the collect → her sitting timing out → the
// gather ending in error, her next candle tap produced NOTHING — no request,
// no sitting, no words. By source both known swallow-flags should have been
// clear by then, so either a reset did not run or a THIRD latch exists. The
// observation file names this exact sequence as the regression script for
// the whole night, and says: prove it driven, never by reading.
//
// ⛔ SO THE STATE IS NEVER SEEDED WHERE A SHIPPED FUNCTION CAN PRODUCE IT.
// Every beat below runs the real shipped function over the SAME live
// objects — the same REPULL, the same SESSION, the same VISIT_GATHER — so a
// latch that only forms across the sequence has somewhere to form. The one
// seeded input is the walk-view flags before the timeout beat, because that
// is the recorded fact of her night (the walk card was on screen), and the
// walk stage that would paint it ends in a model call this harness must not
// fake all the way through.

function runDirtyNight(src) {
  const sink = { busyBegin: 0, busyNote: 0, repullNext: 0, seamFin: 0,
    ensureHome: 0, paintSpot: 0 };
  const SESSION = { busy: false, view: 'idle' };
  const REPULL = { busy: false, pendingSource: false, queue: [], excludes: {},
    brought: 0, onDone: null, holding: null, refused: null, trouble: null,
    candleAsked: false };
  const ACTIVE_ADAPTER = { source: 'apple-photos', exclude: [], box: null,
    room: true };
  const WHY = { host: null };
  const LIBRARIAN = { status: { available: true } };
  const box = { innerHTML: null };
  const meta = { connected_sources: ['apple-photos'],
    apple_photos_excluded_folders: [] };
  const lifted = [
    'visitGatherDone', 'visitGatherFinished', 'visitGatherBegin',
    'consumeRepullSeam', 'startCandleRepull', 'renderAdapterError',
    'startReflectionSession', 'sessionTimedOut', 'sessionBoundStillEarning',
    'sessionWaitingInHerWalk', 'sessionWaitedDuringWalk',
    'sessionWaitingOnHerAnswer', 'sessionQuietEnd'
  ].map(function (n) { return extractFn(src, n); }).join('\n');
  // eslint-disable-next-line no-new-func
  const handles = new Function('DIEGETIC_ROOM_ENABLED', 'LIBRARIAN',
    'SESSION', 'REPULL', 'ACTIVE_ADAPTER', 'WHY', 'apiGet', 'librarianOn',
    'sessionBusyBegin', 'sessionEnsureHome', 'sessionPaintSpot', 'reachReset',
    'sessionRepullFinished', 'sessionOfferBeat', 'candleBusyNoteSeat', '$',
    'roomRepullBox', 'connectedSourceName', 'sourceExclusionKey',
    'repullExclusions', 'runNextRepull', 'escapeHtml', 'runAdapterCollect',
    'sessionConsentCardShowing', 'sessionReachShowing', 'sessionTurnFailed',
    'sessionCloseFailed', 'SESSION_WALK_WAITED_LINE',
    'SESSION_OPENING_WAITED_LINE', 'SESSION_BOUND_LINE', 'SESSION_STATIC_LINE',
    "var VISIT_GATHER = { state: 'idle' };\n" + lifted +
    '\nreturn { visitGatherBegin: visitGatherBegin, ' +
    'startCandleRepull: startCandleRepull, ' +
    'renderAdapterError: renderAdapterError, ' +
    'startReflectionSession: startReflectionSession, ' +
    'sessionTimedOut: sessionTimedOut, ' +
    'gather: function () { return VISIT_GATHER; } };')(
    true, LIBRARIAN, SESSION, REPULL, ACTIVE_ADAPTER, WHY,
    function () {
      return Promise.resolve({ ok: true, data: { meta: meta } });
    },
    function () { return true; },
    function () { sink.busyBegin += 1; SESSION.busy = true; },
    function () { sink.ensureHome += 1; },
    function () { sink.paintSpot += 1; },
    function () { },
    function () { sink.seamFin += 1; },
    function () { },
    function () { sink.busyNote += 1; },
    function () { return null; },
    function () { return box; },
    function (s) { return s === 'apple-photos' ? 'Photos' : ''; },
    function () { return 'apple_photos_excluded_folders'; },
    function () { return {}; },
    function () { sink.repullNext += 1; },
    function (s) { return String(s); },
    function () { },
    function () { return false; },
    function () { return false; },
    function () { },
    function () { },
    'W5', 'U5', 'BOUND', 'STATIC');
  return { sink: sink, SESSION: SESSION, REPULL: REPULL, box: box,
    fns: handles };
}

// ---------------------------------------------------------------------------
// ---- ⛔ 26.995 owed item 4: the 04:06 dirty-state sequence, driven --------
// ---------------------------------------------------------------------------

function claimTheNightsDirtySequenceStillLandsHerNextTap(src) {
  const out = [];
  const h = runDirtyNight(src);
  const fns = h.fns;
  // ---- beat 1: the landing gathers (02:26 / 04:01 shape) -----------------
  fns.visitGatherBegin();
  return flush().then(flush).then(function () {
    if (fns.gather().state !== 'running' || h.REPULL.busy !== true ||
        h.sink.repullNext !== 1) {
      out.push('[dirty-night] the landing gather never stood up — state ' +
        fns.gather().state + ', busy ' + h.REPULL.busy + ', collect sent ' +
        h.sink.repullNext + ' time(s). Red here is a dead harness, and ' +
        'every zero below it measures nothing.');
      return out;
    }
    // ---- beat 2: a tap during the collect — answered, never a sitting ----
    fns.startReflectionSession();
    if (h.sink.busyBegin !== 0 || h.sink.busyNote !== 1 ||
        h.REPULL.candleAsked !== true) {
      out.push('[dirty-night] the mid-collect tap must be ANSWERED and ' +
        'refused — sitting ' + h.sink.busyBegin + ', her line ' +
        h.sink.busyNote + ', asked ' + h.REPULL.candleAsked);
    }
    // ---- beat 3: that gather ends in error (the busy-refusal shape) ------
    fns.renderAdapterError(h.box, 'the collect failed');
    if (h.REPULL.busy !== false || h.REPULL.pendingSource !== false) {
      out.push('[dirty-night] ⛔ an errored gather must end WHOLE — busy ' +
        h.REPULL.busy + ', pending ' + h.REPULL.pendingSource + '. A flag ' +
        'left standing here is the every-later-tap-swallowed latch.');
    }
    if (fns.gather().state !== 'done') {
      out.push('[dirty-night] and the seam must fail OPEN into the gather ' +
        'latch — state ' + fns.gather().state + '. Stuck at running, the ' +
        'candle re-gathers for ever behind a run nobody is running.');
    }
    // ---- beat 4: her 04:01 tap — the sitting opens and goes straight on --
    fns.startReflectionSession();
    return flush().then(function () {
      if (h.sink.busyBegin !== 1 || h.SESSION.busy !== true ||
          h.sink.seamFin !== 1) {
        out.push('[dirty-night] her tap after the errored gather must open ' +
          'a WHOLE sitting and go straight on — began ' + h.sink.busyBegin +
          ', busy ' + h.SESSION.busy + ', went on ' + h.sink.seamFin);
      }
      if (h.REPULL.candleAsked !== false) {
        out.push('[dirty-night] the opening sitting must spend the ' +
          'mid-collect answer (candleAsked=' + h.REPULL.candleAsked + ')');
      }
      // ---- beat 5: the sitting times out under her walk card -------------
      // ⚠ THE ONE SEEDED INPUT (see harness G note): the walk flags as her
      // night recorded them — card on screen, nothing posted.
      h.SESSION.view = 'walk';
      h.SESSION.walkActive = true;
      h.SESSION.walkDone = false;
      h.SESSION.posted = false;
      fns.sessionTimedOut();
      if (h.SESSION.busy !== false || h.SESSION.view !== 'error' ||
          h.SESSION.line !== 'W5') {
        out.push('[dirty-night] the give-up clock under her walk must end ' +
          'the sitting through HER ruled ending — busy ' + h.SESSION.busy +
          ', view ' + h.SESSION.view + ', line ' + h.SESSION.line +
          '. A busy flag still up here swallows every tap after it.');
      }
      // ---- beat 6: a second collect runs and ends in error (04:05) -------
      fns.startCandleRepull();
      return flush().then(flush).then(function () {
        if (h.REPULL.busy !== true) {
          out.push('[dirty-night] the second collect never stood up (busy ' +
            h.REPULL.busy + ') — the 04:05 beat was not driven and the ' +
            'claim below is over a different night.');
          return out;
        }
        fns.renderAdapterError(h.box, 'ended in error');
        if (h.REPULL.busy !== false) {
          out.push('[dirty-night] the errored second collect must end ' +
            'whole too — busy ' + h.REPULL.busy);
        }
        // ---- beat 7: HER 04:06 TAP — THE CLAIM ---------------------------
        fns.startReflectionSession();
        return flush().then(function () {
          if (h.sink.busyBegin !== 2 || h.SESSION.busy !== true ||
              h.SESSION.view !== 'thinking') {
            out.push('[dirty-night] ⛔⛔ THE 04:06 SWALLOW: after gather → ' +
              'mid-collect tap → timeout → errored gather, her next tap ' +
              'must OPEN A FRESH SITTING — began ' + h.sink.busyBegin +
              ' (expected 2), busy ' + h.SESSION.busy + ', view ' +
              h.SESSION.view + '. Anything else is the fourth dead tap ' +
              'of 2026-08-25: a candle that answers nothing, requests ' +
              'nothing, says nothing.');
          }
          if (h.sink.busyNote !== 1) {
            out.push('[dirty-night] and it must open CLEAN — the ' +
              'mid-collect line seated ' + h.sink.busyNote +
              ' time(s) all night, expected exactly the beat-2 one');
          }
          return out;
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// ---- 26.995-17 / CR-01: the three claims that have never existed ----------
// ---------------------------------------------------------------------------

function claimATapDuringTheWaitOpensItsSitting(src) {
  const out = [];
  // ---- THE ARM CR-01 LIVES ON: a source queued behind a reading ----------
  const waiting = runRepullFinish(src, { queue: ['apple-photos'], brought: 1,
    report: { imported: 1 } });
  // her ruling of 2026-08-21, re-asserted on the very object this arm is
  // built from — the fix may not buy the sitting back by abandoning the wait.
  if (waiting.sink.next !== 0 || waiting.sink.vision !== 1) {
    out.push('[wait-tap] her `A — Wait your turn` ruling must still hold on ' +
      'the same run this arm is built from — went to the next source ' +
      waiting.sink.next + ' time(s), waited on the reading ' +
      waiting.sink.vision + ' time(s)');
    return out;
  }
  const tap = runSessionOpener(src, { REPULL: waiting.REPULL,
    sessionBusy: false });
  if (tap.sink.busyBegin !== 1) {
    out.push('[wait-tap] ⛔ CR-01: a tap on the candle while a source waits ' +
      'its turn behind a reading must OPEN ITS SITTING — the sitting began ' +
      tap.sink.busyBegin + ' time(s). Zero is the flame and nothing else: ' +
      'no sitting, no words, no error, for one to three seconds on her ' +
      'library and up to the whole reading on a fresh room.');
  }
  if (tap.sink.reachReset !== 1) {
    out.push('[wait-tap] and it must be a WHOLE sitting — the visit reset ' +
      'ran ' + tap.sink.reachReset + ' time(s), expected 1');
  }
  if (tap.sink.ensureHome !== 1 || tap.sink.paintSpot !== 1) {
    out.push('[wait-tap] and its paper must be on the desk — home ' +
      tap.sink.ensureHome + ', painted ' + tap.sink.paintSpot);
  }
  if (typeof tap.REPULL.onDone !== 'function') {
    out.push('[wait-tap] the sitting must chain on the completion seam — ' +
      'onDone is ' + typeof tap.REPULL.onDone);
  }
  // ---- CONTROL 1, SAME RUN: both idle. Proves the harness reaches the -----
  // ---- live path, so the zeros above can never be a dead harness. --------
  const idle = runRepullFinish(src, { queue: [], brought: 0,
    report: { imported: 0 } });
  const idleTap = runSessionOpener(src, { REPULL: idle.REPULL,
    sessionBusy: false });
  if (idleTap.sink.busyBegin !== 1 || idleTap.sink.reachReset !== 1 ||
      idleTap.sink.repull !== 1) {
    out.push('[wait-tap control] with nothing running at all the shipped ' +
      'opener must start a sitting AND the re-pull — began ' +
      idleTap.sink.busyBegin + ', reset ' + idleTap.sink.reachReset +
      ', re-pulled ' + idleTap.sink.repull + '. If this is red the harness ' +
      'never reached the live path and the arm above measured nothing.');
  }
  // ---- CONTROL 2, SAME RUN: a sitting already open, nothing pending ------
  const open = runRepullFinish(src, { queue: [], brought: 0,
    report: { imported: 0 } });
  const openTap = runSessionOpener(src, { REPULL: open.REPULL,
    sessionBusy: true });
  if (openTap.sink.busyBegin !== 0) {
    out.push('[wait-tap control] a tap while her sitting is already open ' +
      'must never start a second one — began ' + openTap.sink.busyBegin);
  }
  if (openTap.sink.ensureHome !== 1 || openTap.sink.paintSpot !== 1) {
    out.push('[wait-tap control] it must bring the open paper back into ' +
      'view — home ' + openTap.sink.ensureHome + ', painted ' +
      openTap.sink.paintSpot);
  }
  return out;
}

function claimASecondTapDuringTheWaitFailsOpen(src) {
  const waiting = runRepullFinish(src, { queue: ['apple-photos'], brought: 1,
    report: { imported: 1 } });
  return runCandleStart(src, { REPULL: waiting.REPULL }).then(function (c) {
    const out = [];
    if (c.sink.api !== 0 || c.sink.next !== 0) {
      out.push('[second-tap] a tap during the wait must NOT start a second ' +
        'queue over the same reading — asked the room ' + c.sink.api +
        ' time(s), started ' + c.sink.next + ' collect(s). Two readings ' +
        'over one library is the harm the reading guard exists for.');
    }
    if (c.sink.seam !== 1) {
      out.push('[second-tap] but it must FAIL OPEN through the seam — the ' +
        'seam fired ' + c.sink.seam + ' time(s), expected 1. A silent ' +
        'return here hangs the sitting this very tap just opened, which is ' +
        'CR-01 again one level up. The shipped nothing-connected, ' +
        'unreachable-room and no-box arms all take this posture.');
    }
    const idle = runRepullFinish(src, { queue: [], brought: 0,
      report: { imported: 0 } });
    return runCandleStart(src, { REPULL: idle.REPULL }).then(function (c2) {
      if (c2.sink.api !== 1 || c2.sink.next !== 1) {
        out.push('[second-tap control] with nothing running the same tap ' +
          'must really reach the room and start a collect — asked ' +
          c2.sink.api + ', started ' + c2.sink.next + '. If this is red ' +
          'the zeros above measured a dead harness.');
      }
      if (c2.sink.seam !== 0) {
        out.push('[second-tap control] and a tap that DID start a collect ' +
          'must not release the sitting early — seam ' + c2.sink.seam);
      }
      return out;
    });
  });
}

function claimTheWaitEndsWholeAndLaterTapsStillCollect(src) {
  const out = [];
  const first = runRepullFinish(src, { queue: ['apple-photos'], brought: 1,
    report: { imported: 1 } });
  if (!first.REPULL.holding ||
      typeof first.REPULL.holding.ending !== 'function') {
    out.push('[wait-end] the wait must be recorded for the resume — got ' +
      JSON.stringify(first.REPULL.holding));
    return Promise.resolve(out);
  }
  // the reading stops: the wait ends and the next source is asked
  first.REPULL.holding.ending();
  if (first.sink.next !== 1) {
    out.push('[wait-end] the recorded wait must move to the next source ' +
      'when the reading stops — next=' + first.sink.next);
  }
  if (first.REPULL.busy !== true) {
    out.push('[wait-end] and the run must be in flight again the instant ' +
      'the next collect starts — busy=' + first.REPULL.busy + '. Left ' +
      'false, a tap during that collect starts a WHOLE SECOND RUN over the ' +
      'same library.');
  }
  // that second source now finishes with nothing behind it: the run ends
  first.REPULL.queue = [];
  const second = runRepullFinish(src, { repull: first.REPULL,
    report: { imported: 0 } });
  if (second.REPULL.busy !== false) {
    out.push('[wait-end] a run whose queue is empty is over — busy=' +
      second.REPULL.busy);
  }
  if (second.REPULL.pendingSource !== false) {
    out.push('[wait-end] ⛔ and nothing may still be recorded as waiting — ' +
      'pendingSource=' + second.REPULL.pendingSource + '. A pending flag ' +
      'left standing turns EVERY later candle tap away for ever, which is ' +
      'the swallow this whole plan exists to prevent.');
  }
  // and the behaviour that fact causes, driven rather than inferred
  return runCandleStart(src, { REPULL: second.REPULL }).then(function (c) {
    if (c.sink.api !== 1 || c.sink.next !== 1) {
      out.push('[wait-end] after the run is over a candle tap must ask the ' +
        'room what is new again — asked ' + c.sink.api + ', started ' +
        c.sink.next + '. Zero here is every later tap swallowed.');
    }
    return out;
  });
}


const CONTROLS = [
  ['holds while the reading runs', claimHoldsWhileRunning],
  ['holds on `pending` (the race window)', claimHoldsOnPending],
  ['nothing to read paints nothing', claimNothingToReadPaintsNothing],
  ['a total of 0 is a clean read, not a miss', claimAZeroTotalIsNotAMiss],
  ['releases on every one of the five endings', claimReleasesOnEveryEnding],
  ['a failed reading says the server\'s own words', claimErrorSaysTheServersOwnWords],
  ['a dead screen releases nothing', claimDeadScreenReleasesNothing],
  ['the collect hands off instead of reporting', claimAdapterHandsOffInsteadOfReporting],
  ['a candle re-pull routes through its own ending',
    claimRoomRepullRoutesThroughItsOwnEnding],
  ['the candle holds its last word', claimCandleHoldsItsLastWord],
  ['the candle never holds the reflection seam', claimCandleSeamIsNeverHeld],
  ['the candle\'s queue waits its turn', claimCandleQueueWaitsItsTurn],
  ['both connected apps are actually asked',
    claimBothConnectedAppsAreAsked],
  ['never two readers over one library',
    claimNeverTwoReadersOverOneLibrary],
  ['the sitting starts before the wait, not behind it',
    claimTheSittingStartsBeforeTheWait],
  ['⛔ WR-01: a give-up read never asks the next source',
    claimAGiveUpNeverAsksTheNextSource],
  ['⛔ WR-01: an unrecognised state never asks the next source',
    claimAnUnrecognisedStateNeverAsksTheNextSource],
  ['a clean read still asks both (control for the two above)',
    claimACleanReadStillAsksBoth],
  ['⚠ WR-05: a wait that lost its collect does not start on top of one',
    claimAWaitThatLostItsCollectDoesNotStartOnTop],
  ['⛔ WR-02: the reading\'s failure reaches her on BOTH branches',
    claimTheReadingsFailureReachesHerOnBothBranches],
  ['⛔ CR-01: a tap during the wait opens its sitting',
    claimATapDuringTheWaitOpensItsSitting],
  ['⛔ HER RULING 2026-08-25: a tap during a collect is ANSWERED',
    claimATapDuringACollectIsAnswered],
  ['⛔ 26.995 owed 4: the night\'s dirty sequence still lands her next tap',
    claimTheNightsDirtySequenceStillLandsHerNextTap],
  ['a second tap during the wait fails OPEN through the seam',
    claimASecondTapDuringTheWaitFailsOpen],
  ['the wait ends whole and later taps still collect',
    claimTheWaitEndsWholeAndLaterTapsStillCollect],
  ['the candle reports the run it finished', claimCandleReportsTheRunItFinished],
  ['the candle\'s silence survives the hold', claimCandleSilenceSurvivesTheHold],
  ['the candle shows only the count', claimCandleShowsOnlyTheCount],
  ['the import screen falls through to its own',
    claimTheImportScreenFallsThroughToItsOwn],
  ['the room shows her bar', claimTheRoomShowsHerBar],
  ['the bar never invents a forecast', claimTheBarNeverInventsAForecast],
  ['the hold is recorded for the resume', claimTheHoldIsRecordedForTheResume],
  ['entering the room resumes it', claimEnteringTheRoomResumesIt],
  ['the ending releases only once', claimTheEndingReleasesOnlyOnce],
  ['the room entry is wired', claimTheRoomEntryIsWired],
  ['⚖️ her ruling: the landing gathers, so the candle need not',
    claimTheLandingGatherSpareTheCandle],
  ['a failed collect still starts the sitting',
    claimAFailedCollectStillStartsTheSitting],
  ['a refused collect still starts the sitting (control)',
    claimTheRefusalArmStillStartsTheSitting],
  ['a failed collect outside the room starts nothing (control)',
    claimAFailedCollectOutsideTheRoomStartsNothing]
];

// Each mutation is a substitution that must MATCH (a substitution matching
// nothing scores as a pass, which is a drill measuring the repo instead of
// the gate) and must then be caught by the named claim.
//
// ⛔⛔ THE MATCH IS ASSERTED BEFORE THE VERDICT IS READ, AND THAT ORDER IS THE
// WHOLE GUARD. A MUTANT THAT NEVER APPLIED READS EXACTLY LIKE A GATE THAT DOES
// NOT HOLD. This repo has already been bitten by it once (2026-08-20, map #62):
// a drill reported SURVIVED because its patch string no longer matched the
// source, and the finding was believed. The bytes are compared below
// (`mutated === appSrc`) and an unplanted mutation FAILS THE RUN rather than
// scoring anything -- it is never counted as caught and never counted as
// missed, because it was never a measurement at all.
const MUTATIONS = [
  ['NO HOLD: the collect paints the report itself again (the shipped ' +
   'defect before 2026-08-14)',
    function (s) {
      return s.replace('            readVisionProgress(box, 0, finish);',
        '            finish();');
    },
    claimAdapterHandsOffInsteadOfReporting],

  ['NO PENDING ARM: `pending` falls through and the report blinks up',
    function (s) {
      return s.replace(
        "      if (snap.state === 'running' || snap.state === 'pending') {",
        "      if (snap.state === 'running') {");
    },
    claimHoldsOnPending],

  // ⚠ RE-CUT 26.995-21, NOT WEAKENED. Threading the ending's reason moved
  // the bytes both of these anchored on, and an anchor that no longer matches
  // reports NEVER PLANTED — which reads exactly like a gate that does not
  // hold. Both still remove the same release they always did.
  ['NEVER LETS GO: the finished reading stops releasing the report',
    function (s) {
      return s.replace(
        '        // A REAL ENDING: the reading itself says it is over.\n' +
        '        if (onEnd) { onEnd(true); }\n',
        '');
    },
    claimReleasesOnEveryEnding],

  ['NEVER LETS GO: a readout that gave up holds the report for ever',
    function (s) {
      return s.replace(
        '      if (onEnd) { onEnd(false); }\n' +
        '      return;\n' +
        '    }\n',
        '      return;\n' +
        '    }\n');
    },
    claimReleasesOnEveryEnding],

  ['RELEASES INTO A DEAD SCREEN: the host guard goes',
    function (s) {
      return s.replace(
        '      if (!adapterHostLive()) { return; }\n' +
        '      if (!res.ok || !res.data) {\n' +
        '        armVisionReread(box, misses + 1, onEnd, paint);',
        '      if (!res.ok || !res.data) {\n' +
        '        armVisionReread(box, misses + 1, onEnd, paint);');
    },
    claimDeadScreenReleasesNothing],

  ['NOISE AT THE CANDLE: it paints before it has a number',
    function (s) {
      return s.replace(
        "        if (snap.state === 'running' && (snap.total || 0) > 0) {\n" +
        '          (paint || renderVisionProgress)(box, snap);\n' +
        '        }\n',
        '        (paint || renderVisionProgress)(box, snap);\n');
    },
    claimNothingToReadPaintsNothing],

  ['THE REFLECTION SESSION NEVER STARTS: the seam is dropped',
    function (s) {
      return s.replace(
        '    consumeRepullSeam();\n' +
        "    // What IS held is the panel's last word.",
        "    // What IS held is the panel's last word.");
    },
    claimCandleSeamIsNeverHeld],

  ['THE REFLECTION SESSION WAITS OUT THE READING: the seam is held',
    function (s) {
      return s.replace(
        '    consumeRepullSeam();\n' +
        "    // What IS held is the panel's last word.",
        "    // What IS held is the panel's last word.")
        .replace('    var ending = function () {\n',
          '    var ending = function () {\n      consumeRepullSeam();\n');
    },
    claimCandleSeamIsNeverHeld],

  ['THE CANDLE STOPS HOLDING: its ending fires straight away',
    function (s) {
      return s.replace(
        '    readVisionProgress(box, 0, ending, renderVisionLine);',
        '    ending();');
    },
    claimCandleHoldsItsLastWord],

  // ⚠ RE-CUT 26.995-21: carrying the reading's failure sentence to the run's
  // end turned the ending's `if` into an `else if`, so this mutation's second
  // substitution stopped matching and it BROKE THE HARNESS (`brought is not
  // defined`) instead of scoring — which the IN-01 classifier reported for
  // what it was rather than counting as a catch. Not weakened: it still reads
  // the live counter at release time.
  ['THE WRONG RUN IS REPORTED: the counter is read at release time',
    function (s) {
      return s.replace('    var brought = REPULL.brought;\n', '')
        .replace('      } else if (brought > 0) {\n',
          '      } else if (REPULL.brought > 0) {\n')
        .replace('          count(brought, ', '          count(REPULL.brought, ');
    },
    claimCandleReportsTheRunItFinished],

  // ---- 26.995-21: the five routes back to the collision, and the loss ----

  ['⛔ WR-01 IS BACK: a give-up asks the next source anyway',
    function (s) {
      return s.replace(
        '        if (stopped === false || ACTIVE_ADAPTER.room !== true) {\n',
        '        if (ACTIVE_ADAPTER.room !== true) {\n');
    },
    claimAGiveUpNeverAsksTheNextSource],

  ['⛔ WR-01 IS BACK: an unrecognised state is read as the reading STOPPING',
    function (s) {
      return s.replace(
        '      armVisionReread(box, misses + 1, onEnd, paint);\n' +
        '    }).catch(function () {\n',
        '      if (onEnd) { onEnd(true); }\n' +
        '    }).catch(function () {\n');
    },
    claimAnUnrecognisedStateNeverAsksTheNextSource],

  ['AN UNRECOGNISED STATE IS TREATED AS A CLEAN READ: the miss count resets ' +
   'and the readout never gives up at all',
    function (s) {
      return s.replace(
        '      armVisionReread(box, misses + 1, onEnd, paint);\n' +
        '    }).catch(function () {\n',
        '      armVisionReread(box, 0, onEnd, paint);\n' +
        '    }).catch(function () {\n');
    },
    claimReleasesOnEveryEnding],

  ['⛔ WR-02 IS BACK: the mid-queue error arm releases BEFORE painting ' +
   '(the ordering fix the review proposed, driven and measured as no fix)',
    function (s) {
      return s.replace(
        '        var carried = onEnd ? onEnd(true, snap.message) : false;\n' +
        '        if (snap.message && carried !== true) {\n' +
        '          paintVisionTrouble(box, snap.message);\n' +
        '        }\n',
        '        if (snap.message) { paintVisionTrouble(box, snap.message); }\n' +
        '        if (onEnd) { onEnd(true); }\n');
    },
    claimTheReadingsFailureReachesHerOnBothBranches],

  ['⚠ WR-05 IS BACK: the collect-identity re-check is removed',
    function (s) {
      return s.replace(
        '        if (stopped === false || ACTIVE_ADAPTER.room !== true) {\n',
        '        if (stopped === false) {\n');
    },
    claimAWaitThatLostItsCollectDoesNotStartOnTop],

  ['THE ROOM FALLS BACK TO THE IMPORT SCREEN\'S THREE LINES',
    function (s) {
      return s.replace(
        '    readVisionProgress(box, 0, ending, renderVisionLine);',
        '    readVisionProgress(box, 0, ending);');
    },
    claimCandleShowsOnlyTheCount],

  ['THE RULING LEAKS ONTO THE IMPORT SCREEN AND EATS ITS ETA',
    function (s) {
      return s.replace('            readVisionProgress(box, 0, finish);',
        '            readVisionProgress(box, 0, finish, renderVisionLine);');
    },
    claimTheImportScreenFallsThroughToItsOwn],

  ['THE BAR STOPS MOVING: the fill is pinned at full',
    function (s) {
      return s.replace(
        "      'var(--clay);width:' + escapeAttr(pct.toFixed(1)) + '%\"></div>' +",
        "      'var(--clay);width:100%\"></div>' +");
    },
    claimTheRoomShowsHerBar],

  ['THE CORAL IS BORROWED FOR THE FILL',
    function (s) {
      return s.replace("      'var(--clay);width:'", "      'var(--accent);width:'");
    },
    claimTheRoomShowsHerBar],

  ['A FORECAST IS INVENTED OUT OF A REFUSAL',
    function (s) {
      return s.replace(
        "    return pct.toFixed(1) + '% \u00b7 ' + eta + " +
        "(eta === stillCounting ? '' : ' left');",
        "    return pct.toFixed(1) + '% \u00b7 ' + eta + ' left';");
    },
    claimTheBarNeverInventsAForecast],

  ['NOTHING TO RESUME FROM: the hold is never recorded',
    function (s) {
      return s.replace(
        '    REPULL.holding = { box: box, ending: ending };\n', '');
    },
    claimTheHoldIsRecordedForTheResume],

  ['A RELEASED HOLD IS RESUMED AGAIN: it never clears itself',
    function (s) {
      return s.replace('      released = true;\n      REPULL.holding = null;\n',
        '      released = true;\n');
    },
    claimTheHoldIsRecordedForTheResume],

  ['THE ROOM STOPS PICKING IT BACK UP',
    function (s) {
      return s.replace(
        '    readVisionProgress(held.box, 0, held.ending, renderVisionLine);',
        '    return;');
    },
    claimEnteringTheRoomResumesIt],

  ['TWO READERS, TWO RELEASES: the ending stops firing once',
    function (s) {
      return s.replace(
        '      if (released) { return; }\n      released = true;\n',
        '      released = true;\n');
    },
    claimTheEndingReleasesOnlyOnce],

  ['THE RESUME EXISTS AND IS NEVER CALLED',
    function (s) {
      return s.replace('        renderRoomObjects();\n' +
        '        resumeRoomReadingReadout();\n',
      '        renderRoomObjects();\n');
    },
    claimTheRoomEntryIsWired],

  // ---- 26.995-14 (G-26.995-2): the arm nothing had ever driven ----------
  //
  // The shipped defect, restored exactly. Before 2026-08-21 this mutation
  // WAS app.js, and every control in this file was green over it.
  ['THE FAILED COLLECT KILLS THE SITTING: the error arm releases nothing ' +
   '(the shipped defect before 2026-08-21)',
    function (s) {
      return s.replace(
        '    if (ACTIVE_ADAPTER.room) { consumeRepullSeam(); }\n', '');
    },
    claimAFailedCollectStillStartsTheSitting],

  // ---- 26.995-15 (G-26.995-3): the collision, put back ------------------
  //
  // ⛔⛔ EACH OF THESE IS ASSERTED TO HAVE APPLIED BEFORE ITS VERDICT IS READ,
  // by the `mutated === appSrc` compare in the runner below. A mutant that
  // never applied reads exactly like a gate that does not hold.
  ['THE COLLISION IS BACK: the queue moves straight to the next source ' +
   '(the shipped defect before 2026-08-21)',
    function (s) {
      return s.replace(
        '      consumeRepullSeam();\n' +
        '      // \u26d4 THE SPLIT ITSELF (26.995-17) — see the paragraph above.\n' +
        '      REPULL.busy = false;\n' +
        '      REPULL.pendingSource = true;\n' +
        '      REPULL.holding = { box: box, ending: takeTurn };\n' +
        '      readVisionProgress(box, 0, takeTurn, renderVisionLine);\n' +
        '      return;\n',
        '      runNextRepull(box);\n      return;\n');
    },
    claimBothConnectedAppsAreAsked],

  ['THE SITTING WAITS OUT THE OTHER SOURCE: the seam is released behind the ' +
   'wait instead of before it',
    function (s) {
      return s.replace(
        '      consumeRepullSeam();\n' +
        '      // \u26d4 THE SPLIT ITSELF (26.995-17) — see the paragraph above.\n',
        '      // \u26d4 THE SPLIT ITSELF (26.995-17) — see the paragraph above.\n');
    },
    claimTheSittingStartsBeforeTheWait],

  ['NOTHING TO RESUME FROM MID-QUEUE: the wait is never recorded, so a room ' +
   'exit strands the waiting source and `busy` with it',
    function (s) {
      return s.replace(
        '      REPULL.holding = { box: box, ending: takeTurn };\n', '');
    },
    claimCandleQueueWaitsItsTurn],

  ['TWO COLLECTS AT ONCE: the turn stops being taken once, so the resumed ' +
   'chain and the original both ask',
    function (s) {
      return s.replace('        if (tookTurn) { return; }\n', '');
    },
    claimCandleQueueWaitsItsTurn],

  // ---- 26.995-17 / CR-01: four routes back to the silence, one each -------
  //
  // ⛔ EACH ONE RESTORES THE SHIPPED DEFECT BY A DIFFERENT DOOR. The whole
  // point of splitting `busy` from `pendingSource` is that a future phase
  // which re-merges them goes RED rather than shipping the silence again, and
  // "re-merges them" has four distinct spellings.

  ['CR-01 IS BACK: the wait leaves the collect-in-flight flag TRUE (the ' +
   'shipped defect, exactly)',
    function (s) {
      return s.replace(
        '      // ⛔ THE SPLIT ITSELF (26.995-17) — see the paragraph above.\n' +
        '      REPULL.busy = false;\n',
        '      // ⛔ THE SPLIT ITSELF (26.995-17) — see the paragraph above.\n' +
        '      REPULL.busy = true;\n');
    },
    claimATapDuringTheWaitOpensItsSitting],

  ['CR-01 IS BACK: the session guard reads the pending fact again (the ' +
   'guard un-narrowed)',
    function (s) {
      return s.replace(
        '      if (SESSION.busy || REPULL.busy) {\n',
        '      if (SESSION.busy || REPULL.busy || REPULL.pendingSource) {\n');
    },
    claimATapDuringTheWaitOpensItsSitting],

  ['SWALLOWED FOR EVER: takeTurn forgets to clear the pending fact, so ' +
   'every later tap is turned away',
    function (s) {
      return s.replace(
        '        REPULL.pendingSource = false;\n' +
        '        REPULL.busy = true;\n',
        '        REPULL.busy = true;\n');
    },
    claimTheWaitEndsWholeAndLaterTapsStillCollect],

  ['THE SITTING HANGS: the second-tap arm returns SILENTLY instead of ' +
   'failing open through the seam (CR-01 one level up)',
    function (s) {
      return s.replace(
        '    if (REPULL.pendingSource) { consumeRepullSeam(); return; }\n',
        '    if (REPULL.pendingSource) { return; }\n');
    },
    claimASecondTapDuringTheWaitFailsOpen],

  // The arm that SHOULD fail, built on purpose (T-26.995-42): the fix made
  // the lazy way. Without this mutant the non-room control is only asserted
  // against code that already satisfies it, and a control never seen catch
  // anything is not a control.
  ['RELEASED TOO WIDELY: the room gate is dropped and the sources screen ' +
   'fires a seam nobody is waiting on',
    function (s) {
      return s.replace(
        '    if (ACTIVE_ADAPTER.room) { consumeRepullSeam(); }\n',
        '    consumeRepullSeam();\n');
    },
    claimAFailedCollectOutsideTheRoomStartsNothing],

  // 2026-08-25, the 04:06 sequence's own two latches — each is one flag
  // left standing on one path of the dirty night, which is exactly the
  // shape the observation file says the fourth dead tap must have had.
  ['THE WALK ENDING KEEPS THE FLAG UP: her sitting "ends" but stays busy, ' +
   'and every later tap dies on the session guard',
    function (s) {
      return s.replace(
        'are false here.\n    SESSION.busy = false;\n',
        'are false here.\n');
    },
    claimTheNightsDirtySequenceStillLandsHerNextTap],

  ['THE ERROR ARM STOPS ENDING THE RUN: an errored gather leaves the ' +
   'collect flag up for ever, and every later tap is turned away',
    function (s) {
      return s.replace(
        'if (ACTIVE_ADAPTER.room) {\n      REPULL.busy = false;\n',
        'if (ACTIVE_ADAPTER.room) {\n');
    },
    claimTheNightsDirtySequenceStillLandsHerNextTap]
];

// ---------------------------------------------------------------------------
// ---- the known negatives (26.995-21) --------------------------------------
// ---------------------------------------------------------------------------
//
// ⛔⛔ A DRILL THAT CATCHES EVERYTHING IS NOT A PERFECT DRILL, IT IS AN
// UNMEASURED ONE. Every mutation above was written to be caught, so a 35/35
// score says only that the author aimed well. These are changes on the SAME
// path that these controls genuinely do NOT pin — and each one must be proven
// planted and must then SURVIVE the WHOLE control tree. If a known negative
// is ever "caught", the run fails: either a control has started pinning
// something that does not matter (this repo's signature defect), or the
// change was not as harmless as it was believed to be. Either way it is news.
const KNOWN_NEGATIVES = [
  ['the wait\'s two run-state fields are assigned in the opposite order',
    function (s) {
      // Nothing reads either field between the two lines, so this cannot
      // change behaviour — and nothing here should pretend it can.
      return s.replace(
        '        REPULL.pendingSource = false;\n' +
        '        REPULL.busy = true;\n',
        '        REPULL.busy = true;\n' +
        '        REPULL.pendingSource = false;\n');
    }]
];

// 26.997-03 Task 1: same REPULL.busy fact the candle busy note uses must
// omit the walk begin door. Driven here so the hold suite, which already
// owns that flag, fails if the painter ignores it. Outside the 77-count
// mutation drill — this is a new behaviour pin, not a rewrite of CR-01.
function claimWalkBeginOmittedWhileCollectHolds(src) {
  const out = [];
  const sig = 'function sessionPaintWalkOpen(';
  const start = src.indexOf(sig);
  if (start === -1) {
    out.push('[26.997-03] sessionPaintWalkOpen missing');
    return out;
  }
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const paintSrc = src.slice(start, i);
  function run(busy) {
    const spot = {
      innerHTML: '',
      querySelector: function (sel) {
        const cls = String(sel).replace(/^\./, '');
        if (this.innerHTML.indexOf(cls) === -1) { return null; }
        return { addEventListener: function () {}, disabled: false, style: {} };
      },
      appendChild: function () {}
    };
    const fn = new Function('spot', 'OFFER_COPY', 'escapeHtml', 'REPULL',
      'sessionWalkBegin', 'sessionWalkSkip',
      paintSrc + '\nreturn sessionPaintWalkOpen;');
    fn(spot, { walkBookend: 'BOOKEND', walkQuiet: 'not today' },
      function (s) { return String(s); }, { busy: !!busy },
      function () {}, function () {})(spot);
    return spot.innerHTML;
  }
  const idle = run(false);
  const held = run(true);
  if (idle.indexOf('session-walk-begin') === -1) {
    out.push('[26.997-03] idle walk open lost the begin door');
  }
  if (held.indexOf('session-walk-begin') !== -1 ||
      held.indexOf('look through them') !== -1) {
    out.push('[26.997-03] walk begin still drawn while REPULL.busy');
  }
  return out;
}

(function main() {
  const failures = [];
  let controlsGreen = 0;
  let caught = 0;
  let ran = 0;
  // 26.995-17 (review IN-01): a mutation's verdict has THREE possible
  // provenances and only one of them is a measurement of the gate.
  let brokeHarness = 0;
  let neverPlanted = 0;
  // 26.995-21: and a fourth provenance — a change that SHOULD survive.
  let survived = 0;

  Promise.resolve()
    .then(function () {
      const said = claimWalkBeginOmittedWhileCollectHolds(appSrc);
      if (said.length) {
        failures.push('CONTROL RED: walk begin omitted while collect holds :: ' +
          said.join(' ;; '));
        assert.strictEqual(said.length, 0, said.join(' ;; '));
      }
    })
    .then(function () {
      // ---- the unmutated controls, all in the same pass as the drill ----
      return CONTROLS.reduce(function (chain, c) {
        return chain.then(function () {
          ran += 1;
          return Promise.resolve(c[1](appSrc)).then(function (said) {
            if (said.length === 0) { controlsGreen += 1; } else {
              failures.push('CONTROL RED: ' + c[0] + ' :: ' + said.join(' ;; '));
            }
          }, function (e) {
            failures.push('CONTROL THREW: ' + c[0] + ' :: ' +
              (e && e.message ? e.message : e));
          });
        });
      }, Promise.resolve());
    })
    .then(function () {
      // ⛔ THE UNMUTATED TREE IS ASSERTED HERE, BEFORE A SINGLE MUTATION
      // SCORE IS READ. A drill score computed over a tree that was already
      // red measures the breakage, not the gate.
      assert.strictEqual(controlsGreen, CONTROLS.length,
        'the unmutated control tree must be green BEFORE any mutation score ' +
        'is read — ' + controlsGreen + '/' + CONTROLS.length + ' green :: ' +
        failures.join(' ;; '));
    })
    .then(function () {
      // ---- the mutations ----
      return MUTATIONS.reduce(function (chain, m) {
        return chain.then(function () {
          ran += 1;
          const mutated = m[1](appSrc);
          if (mutated === appSrc) {
            neverPlanted += 1;
            failures.push('MUTATION NEVER PLANTED: ' + m[0] +
              ' — a substitution that matched nothing scores as a pass, ' +
              'which is a drill measuring the repo instead of the gate');
            return null;
          }
          // ⚠ THE CLAIM IS INVOKED INSIDE THE CHAIN, NOT BESIDE IT.
          // `Promise.resolve(m[2](mutated))` evaluates the claim BEFORE the
          // promise exists, so a SYNCHRONOUS throw — the commonest shape of a
          // broken harness, e.g. a renamed symbol the harness injects — flew
          // straight past the classifier below and aborted the whole run with
          // a bare one-line message, naming no mutation at all. Driven and
          // measured 26.995-17.
          return Promise.resolve().then(function () {
            return m[2](mutated);
          }).then(function (said) {
            if (said.length > 0) { caught += 1; } else {
              failures.push('MUTATION MISSED: ' + m[0]);
            }
          }, function (e) {
            // ⛔⛔ IN-01 (26.995-17): A BROKEN HARNESS IS NOT A CATCH.
            // This handler used to read `caught += 1` on ANY thrown error,
            // so a mutation that made the slice unparseable — or renamed a
            // symbol the harness injects — scored EXACTLY like a gate doing
            // its job. That is the same class of defect as an unplanted
            // mutation reading as SURVIVED: a verdict with no measurement
            // behind it.
            //
            // The claims in this file never throw to signal detection; they
            // RETURN a non-empty list of what went wrong. So a throw here is
            // always the harness dying, never a verdict. MEASURED on the
            // shipped tree before this changed: of the 26 mutations then in
            // the table, 26 were caught by return and 0 took this path.
            brokeHarness += 1;
            failures.push('MUTATION BROKE THE HARNESS: ' + m[0] + ' :: ' +
              (e && e.message ? e.message : e) + ' — this is NOT a catch. ' +
              'The claim never got to render a verdict, so nothing about ' +
              'the gate was measured. Fix the mutation or the harness.');
          });
        });
      }, Promise.resolve());
    })
    .then(function () {
      // ---- the known negatives: proven planted, then must SURVIVE --------
      return KNOWN_NEGATIVES.reduce(function (chain, k) {
        return chain.then(function () {
          ran += 1;
          const mutated = k[1](appSrc);
          if (mutated === appSrc) {
            neverPlanted += 1;
            failures.push('KNOWN NEGATIVE NEVER PLANTED: ' + k[0] +
              ' — a change that matched nothing survives trivially, which ' +
              'is the same empty verdict as an unplanted mutation');
            return null;
          }
          // ⛔ THE WHOLE CONTROL TREE, not one hand-picked claim. "These
          // controls do not pin it" is a statement about all of them.
          return CONTROLS.reduce(function (inner, c) {
            return inner.then(function (said) {
              return Promise.resolve().then(function () {
                return c[1](mutated);
              }).then(function (v) {
                return said.concat(v.map(function (x) {
                  return c[0] + ' :: ' + x;
                }));
              }, function (e) {
                return said.concat([c[0] + ' THREW :: ' +
                  (e && e.message ? e.message : e)]);
              });
            });
          }, Promise.resolve([])).then(function (all) {
            if (all.length === 0) { survived += 1; return; }
            failures.push('KNOWN NEGATIVE WAS CAUGHT: ' + k[0] +
              ' — this change cannot alter behaviour, so a control that ' +
              'fires on it is pinning the source text rather than what the ' +
              'room does (this repo\'s signature defect). Or it was not as ' +
              'harmless as believed. Either way, read it: ' +
              all.join(' ;; '));
          });
        });
      }, Promise.resolve());
    })
    .then(function () {
      console.log('CASES ' + ran);
      console.log('DRILL ' + caught + '/' + MUTATIONS.length +
        ' mutations caught BY VERDICT, ' + brokeHarness +
        ' broke the harness, ' + neverPlanted + ' never planted, ' +
        controlsGreen + '/' + CONTROLS.length + ' controls green, ' +
        survived + '/' + KNOWN_NEGATIVES.length +
        ' known negatives survived');

      assert.strictEqual(failures.length, 0,
        '26.94-11 failures: ' + failures.join(' ;; '));
      // 36 -> 37 on 2026-08-23: her gather-at-the-landing ruling brought one
      // new control, and it carries BOTH arms (the tap still gathers when the
      // landing has not; the tap does not when it has). ⚠ Raised deliberately
      // and named here — the whole point of pinning it by value is that a
      // number moving is a conscious edit, never a quiet one.
      // 37 -> 38 on 2026-08-25: her a-tap-is-answered ruling brought one new
      // control (claimATapDuringACollectIsAnswered) — the guard still holds
      // both refusals, and the refusal now seats her line instead of nothing.
      // 38 -> 39 on 2026-08-25 (night): the 04:06 dirty-state sequence,
      // driven whole (owed item 4 of the observation file) — gather → tap
      // during collect → timeout under her walk → errored gather → the next
      // tap must land. Two mutations ride with it (35 -> 37).
      assert.strictEqual(CONTROLS.length, 39,
        'thirty-nine controls — a removed one must be a conscious edit');
      assert.strictEqual(MUTATIONS.length, 37,
        'thirty-seven mutations — a removed one must be a conscious edit');
      assert.strictEqual(controlsGreen, 39,
        'all thirty-nine controls must be green');
      assert.strictEqual(caught, 37,
        'all thirty-seven mutations must be caught BY VERDICT');
      assert.strictEqual(brokeHarness, 0,
        'no mutation may score by breaking the harness (IN-01) — ' +
        brokeHarness + ' did');
      assert.strictEqual(neverPlanted, 0,
        'every mutation must be proven to have changed the file — ' +
        neverPlanted + ' matched nothing');
      assert.strictEqual(survived, KNOWN_NEGATIVES.length,
        'every known negative must SURVIVE the whole control tree — a ' +
        'drill that catches everything is not a perfect drill, it is an ' +
        'unmeasured one. ' + survived + '/' + KNOWN_NEGATIVES.length +
        ' survived');
      // 72 -> 73 on 2026-08-23 — her gather-at-the-landing ruling's own
      // control. Raised deliberately; see the CONTROLS note above.
      // 73 -> 74 on 2026-08-25 — her a-tap-is-answered ruling's own control.
      // 74 -> 77 on 2026-08-25 (night) — the dirty-sequence control and its
      // two mutations.
      assert.strictEqual(ran, 77,
        'CASES: thirty-nine controls, thirty-seven mutations and one\n        ' + 'known negative ran — a ' +
        'skipped case cannot hide behind a passing total');

      console.log('OK test_vision_hold.cjs — 26.94-11/13/14 + 26.995-15: ' +
        'the import screen AND the candle re-pull hold while the ' +
        'photographs are read (owner rulings 2026-08-14), hold silently ' +
        'until there is a number to show, release on all five endings, ' +
        'release nothing into a dead screen; the candle never holds the ' +
        'reflection session it starts, its source queue WAITS ITS TURN ' +
        'instead of being refused (her ruling 2026-08-21), both connected ' +
        'apps are asked and no two readings ever run over one library');
    })
    .catch(function (e) {
      console.error(e && e.message ? e.message : e);
      process.exit(1);
    });
}());
