#!/usr/bin/env node
/* test_roster_route_behaviour — SE-9 / T-26.87-02, proved by EXECUTION.
 *
 * WHY THIS FILE EXISTS. tests/test_librarian_config_fence.cjs's [routing]
 * block is static text analysis. It proves the routing STRUCTURE exists and
 * that the decision precedes the first network call — both real, both
 * verified by negative control. But a static scan cannot prove the roster
 * branch is REACHABLE: an orchestrator control that neutered the branch to
 * `if (false) {` while leaving every literal in place kept the whole fence
 * green. T-26.87-02 is a HIGH threat (a roster diff on the meta route skips
 * add_roster_folder's retroactive trigger=True stamping and silently reopens
 * the hole 26.4-01 closed), so a structural proof is not enough.
 *
 * So this file RUNS the shipped functions against stubbed seams and asserts
 * which route actually received the diff. Added 2026-07-30 at the owner's
 * call after Wave 4; it is new scope no plan specified.
 *
 * Bare node, zero dependencies, the tests/*.cjs violations[] grammar.
 * Extraction + `new Function` is the shipped tests/test_view_stack.cjs idiom.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const violations = [];

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

const ROSTER_KEY = 'fenced_roster';

// ---------------------------------------------------------------------------
// 1. askRouteOf — the pure router, executed on real change lists
// ---------------------------------------------------------------------------

const routeOf = new Function(
  "var ASK_ROSTER_KEY = " + JSON.stringify(ROSTER_KEY) + ";" +
  "var ASK_ROUTE_ROSTER = 'route-roster';" +
  "var ASK_ROUTE_MIXED = 'route-mixed';" +
  "var ASK_ROUTE_META = 'route-meta';" +
  // #105: the device route's two collaborators, spelled as shipped.
  "var ASK_ROUTE_DEVICE = 'route-device';" +
  "var ASK_KEY_DEVICE_FENCE = 'display_fence_open';" +
  extractFn(appSrc, 'askRouteOf') +
  "\nreturn askRouteOf;")();

function routeCase(label, changes, expected) {
  const got = routeOf(changes);
  if (got !== expected) {
    violations.push('[router] ' + label + ': expected ' + expected +
      ' but askRouteOf returned ' + got);
  }
}

routeCase('a meta-only diff takes the meta route',
  [{ key: 'librarian_enabled' }], 'route-meta');
routeCase('a roster-only diff takes the ROSTER route',
  [{ key: ROSTER_KEY }], 'route-roster');
routeCase('roster + meta is MIXED, never split',
  [{ key: ROSTER_KEY }, { key: 'librarian_enabled' }], 'route-mixed');
routeCase('meta + roster is MIXED regardless of order',
  [{ key: 'librarian_enabled' }, { key: ROSTER_KEY }], 'route-mixed');
routeCase('two roster lines are MIXED — a roster card is single-change',
  [{ key: ROSTER_KEY }, { key: ROSTER_KEY }], 'route-mixed');
routeCase('an empty list is the meta route (nothing to route)',
  [], 'route-meta');
// #105: the device sink is this device's own storage — it travels alone or
// it does not travel, the roster rule one storage over.
routeCase('a device-only diff takes the DEVICE route',
  [{ key: 'display_fence_open' }], 'route-device');
routeCase('device + meta is MIXED, never split',
  [{ key: 'display_fence_open' }, { key: 'librarian_enabled' }],
  'route-mixed');
routeCase('meta + device is MIXED regardless of order',
  [{ key: 'librarian_enabled' }, { key: 'display_fence_open' }],
  'route-mixed');
routeCase('device + roster is MIXED — two sinks, no atomicity',
  [{ key: 'display_fence_open' }, { key: ROSTER_KEY }], 'route-mixed');
routeCase('two device lines are MIXED — a device card is single-change',
  [{ key: 'display_fence_open' }, { key: 'display_fence_open' }],
  'route-mixed');

// ---------------------------------------------------------------------------
// 2. askConfirmTap — REACHABILITY. Run the shipped confirm path against
//    stubbed seams and record which URL each diff actually reached.
// ---------------------------------------------------------------------------

function runConfirm(changes) {
  const calls = { get: [], post: [], refused: [], applied: 0,
    deviceSets: [], deviceValue: false };
  // A synchronous stand-in for the app's promise seam: .then runs inline so
  // the whole confirm path completes before runConfirm returns, and .catch
  // is a no-op because nothing here rejects.
  const thenable = function (value) {
    return {
      then: function (fn) { return thenable(fn(value)); },
      catch: function () { return thenable(value); }
    };
  };
  const harness =
    "var ASK_ROSTER_KEY = " + JSON.stringify(ROSTER_KEY) + ";" +
    "var ASK_ROUTE_ROSTER = 'route-roster';" +
    "var ASK_ROUTE_MIXED = 'route-mixed';" +
    "var ASK_ROUTE_META = 'route-meta';" +
    "var ASK_REASON_FENCE = 'fence';" +
    "var ASK_REASON_NOT_MINE = 'not-mine';" +
    "var ASK_REASON_STALE = 'stale';" +
    "var ASK_REASON_NOT_A_VALUE = 'not-a-value';" +
    // every proposable key the confirm path recognises
    "var ASK_STATE_COPY = {librarian_enabled:1, cleaning_enabled:1," +
    " display_fence_open:1};" +
    "var ASK_VALUE_KEYS = {};" +
    "ASK_VALUE_KEYS[ASK_ROSTER_KEY] = 1;" +
    // #105: the device route's collaborators — the key and route constants
    // as shipped, and a RECORDING double for this device's own storage so
    // the reach cases below can see what was written without any network.
    "var ASK_KEY_DEVICE_FENCE = 'display_fence_open';" +
    "var ASK_ROUTE_DEVICE = 'route-device';" +
    "function displayFenceOpen() { return CALLS.deviceValue === true; }" +
    "function setDisplayFenceOpen(on) { CALLS.deviceSets.push(on === true);" +
    " CALLS.deviceValue = on === true; }" +
    // 26.95-64: the batch key and its still-empty confirm label. ⚠ LIFTED AS
    // THE SHIPPED PAIR rather than stubbed to a convenient value: askDescribable
    // refuses this key precisely WHILE the label is empty, so a stub with a
    // label in it would quietly answer the question this group exists to ask.
    "var ASK_KEY_BATCH = 'blessing_batch_size';" +
    "var ASK_LABEL_BATCH = " + JSON.stringify(
      (appSrc.match(/var ASK_LABEL_BATCH = ('[^']*'|"[^"]*");/) || [])[1] ||
      "''") + ";" +
    "var ASK = {card:{changes:CHANGES}, applying:false};" +
    "function askRepaint() {}" +
    "function askRefused(r) { CALLS.refused.push(r); }" +
    "function askApplied() { CALLS.applied += 1; }" +
    "function askBefore(m, c) { return c.from; }" +   // never stale
    "function askTargetValue(m, c) { return c.to; }" +
    "function askValueText(c) { return c.value; }" +
    "function apiGet(u) { CALLS.get.push(u);" +
    "  return THEN({ok:true, data:{meta:{}}}); }" +
    "function apiPost(u, b) { CALLS.post.push({url:u, body:b});" +
    "  return THEN({ok:true, data:{}}); }" +
    // ⚠ 26.95-34: askConfirmTap GAINED A COLLABORATOR, and this scope has to
    // provide it or the lift throws. `askDescribable` is the predicate that
    // decides whether the room has words for a change; it used to be inline
    // here as `!ASK_STATE_COPY[c.key] && !ASK_VALUE_KEYS[c.key]` and is now a
    // named function applied at BOTH the card mint and this confirm.
    //
    // ⛔ IT IS LIFTED FROM THE REAL SOURCE, NEVER STUBBED. A stub that always
    // answered true would make this whole harness green while proving nothing
    // about the guard — and case (2d) below is the plant that says so: it is a
    // diff whose key is in NEITHER map above, and only the real predicate
    // refuses it at zero network cost.
    extractFn(appSrc, 'askDescribable') +
    extractFn(appSrc, 'askRouteOf') +
    extractFn(appSrc, 'askConfirmTap') +
    "\nreturn askConfirmTap;";
  const fn = new Function('CHANGES', 'CALLS', 'THEN', harness)(
    changes, calls, thenable);
  fn();
  return calls;
}

// ⚠ EVERY EXECUTING GROUP BELOW RUNS INSIDE THIS WRAPPER, AND THE REASON IS A
// REAL INCIDENT, TWICE. This file lifts shipped functions into a synthetic
// scope. When one of them gains a collaborator the scope does not provide, the
// lift throws a ReferenceError — and an uncaught throw at the FIRST executing
// group takes the whole file with it: the later groups never run, group 1's
// six router cases never report, and the verdict block at the foot is never
// reached. The failure then reads as "one function is undefined" when what
// actually happened is that a HIGH-threat reachability proof stopped being
// performed. It happened with `REACH` earlier in this phase and again with
// `askDescribable` in 26.95-34.
//
// So a throw becomes a LOUD VIOLATION and execution continues. The suite still
// fails — it must — but it fails saying which proof was lost, and it still runs
// the proofs that are unaffected.
function group(label, fn) {
  try {
    fn();
  } catch (e) {
    violations.push('[harness] group ' + label + ' THREW and therefore ' +
      'proved nothing: ' + (e && e.message ? e.message : String(e)) +
      '. ⚠ This is a broken instrument, not a product failure — a shipped ' +
      'function this file lifts has gained a collaborator the synthetic scope ' +
      'does not provide. Fix the harness, never the fence, and check what ' +
      'else stopped running.');
  }
}

// (2a) A ROSTER diff must REACH the roster route — the reachability proof.
group('2a (roster reaches the roster route)', function () {
  const c = runConfirm([{ key: ROSTER_KEY, from: 'x', to: null,
    value: 'Private Memoir' }]);
  const urls = c.post.map(function (p) { return p.url; });
  if (urls.indexOf('/api/librarian/roster') === -1) {
    violations.push('[reach] a roster-only diff never reached ' +
      '/api/librarian/roster — the branch exists in the source but is NOT ' +
      'REACHABLE. This is the exact SE-9 hole: the roster class must travel ' +
      'the roster route, or it does not travel. URLs posted: ' +
      JSON.stringify(urls));
  }
  if (urls.indexOf('/api/meta') !== -1) {
    violations.push('[reach] a roster diff reached /api/meta — that route ' +
      'validates the roster but SKIPS add_roster_folder\'s retroactive ' +
      'trigger=True stamping, silently reopening the hole 26.4-01 closed');
  }
  const body = (c.post[0] || {}).body || {};
  if (body.op !== 'remove' || !body.folder) {
    violations.push('[reach] the roster POST did not carry the roster ' +
      "route's own {op:'remove', folder} shape: " + JSON.stringify(body));
  }
});

// (2b) A MIXED diff must cost NOTHING — refused before any request at all.
group('2b (a mixed diff costs nothing)', function () {
  const c = runConfirm([
    { key: ROSTER_KEY, from: 'x', to: null, value: 'Private Memoir' },
    { key: 'librarian_enabled', from: true, to: false }]);
  if (c.get.length || c.post.length) {
    violations.push('[reach] a MIXED roster+meta diff reached the network — ' +
      'it must be refused at ZERO cost, before any read or write, because ' +
      'two writes across two routes cannot be atomic and a half-applied ' +
      'fence change is the worst partial state this app can produce. ' +
      'gets=' + JSON.stringify(c.get) + ' posts=' +
      JSON.stringify(c.post.map(function (p) { return p.url; })));
  }
  if (c.refused.indexOf('fence') === -1) {
    violations.push('[reach] a MIXED diff was not refused with the ' +
      'closed-vocabulary fence reason: ' + JSON.stringify(c.refused));
  }
});

// (2c) A META diff still reaches the meta route — the router did not simply
//      break everything into the roster branch.
group('2c (an ordinary meta diff still reaches /api/meta)', function () {
  const c = runConfirm([{ key: 'librarian_enabled', from: true, to: false }]);
  const urls = c.post.map(function (p) { return p.url; });
  if (urls.indexOf('/api/meta') === -1) {
    violations.push('[reach] an ordinary meta diff never reached /api/meta ' +
      '— posted: ' + JSON.stringify(urls));
  }
  if (urls.indexOf('/api/librarian/roster') !== -1) {
    violations.push('[reach] a meta diff reached the ROSTER route — the ' +
      'roster route runs retroactive stamping and must see only roster work');
  }
});

// (2d) 26.95-34 — A DIFF THE ROOM HAS NO WORDS FOR IS REFUSED AT ZERO COST.
//
// ⚠ THIS CASE EXISTS TO MAKE THE LIFT ABOVE LOAD-BEARING. (2a)/(2b)/(2c) all
// use keys that ARE in this harness's two copy maps, so every one of them
// would stay green against a stubbed `askDescribable` that always answered
// true — a stub would be decoration. This diff names a key that is in NEITHER
// map, which is exactly the shape 26.95-34 created: `blessing_batch_size` is a
// validated, model-proposable setting whose card sentence is still the owner's
// to write, so the room refuses to draw a card for it rather than paint a
// blank line over a live button.
//
// Only the REAL predicate refuses it. Replace the lift with `function
// askDescribable() { return true; }` and this case goes red on both halves at
// once — the refusal is missing AND the network was reached.
group('2d (an undescribable diff is refused at zero cost)', function () {
  const c = runConfirm([{ key: 'blessing_batch_size', from: 10, to: 4 }]);
  if (c.get.length || c.post.length) {
    violations.push('[reach] a diff the room has no copy for reached the ' +
      'network — gets=' + JSON.stringify(c.get) + ' posts=' +
      JSON.stringify(c.post.map(function (p) { return p.url; })) + '. The ' +
      'confirm path must refuse a change it cannot describe BEFORE any read ' +
      'or write, exactly as it refuses a mixed diff');
  }
  if (c.refused.indexOf('not-mine') === -1) {
    violations.push('[reach] a diff the room has no copy for was not refused ' +
      'with the closed-vocabulary reason: ' + JSON.stringify(c.refused) +
      '. ⚠ If this is empty while nothing reached the network either, the ' +
      'lifted askDescribable is a stub that answers true and every case in ' +
      'this section is passing on nothing');
  }
  if (c.applied !== 0) {
    violations.push('[reach] a diff the room has no copy for was APPLIED');
  }
  // POSITIVE CONTROL, so the two absences above are evidence: the SAME harness
  // and the SAME path do let a describable diff through and do apply it.
  const ok = runConfirm([{ key: 'librarian_enabled', from: true, to: false }]);
  if (!ok.post.length || ok.applied !== 1) {
    violations.push('[reach] the control diff did not reach the network and ' +
      'apply (posts=' + ok.post.length + ', applied=' + ok.applied + ') — ' +
      'then "nothing reached the network" above is true of everything and ' +
      'proves nothing about the guard');
  }
});

// (2e) #105 — A DEVICE diff touches NO network in EITHER direction and lands
//      in this device's own storage. The whole honesty story of the class is
//      "this setting stays on this device": the stale check reads the local
//      double, the apply writes through setDisplayFenceOpen, and neither
//      /api/items nor /api/meta is ever consulted.
group('2e (a device diff stays on the device)', function () {
  const c = runConfirm([{ key: 'display_fence_open', from: false, to: true }]);
  if (c.get.length || c.post.length) {
    violations.push('[reach] a device-only diff reached the network — ' +
      'gets=' + JSON.stringify(c.get) + ' posts=' +
      JSON.stringify(c.post.map(function (p) { return p.url; })) +
      '. The device route must read and write ONLY its own storage, or the ' +
      'shipped promise "this setting stays on this device" is broken by the ' +
      'very card that quotes it');
  }
  if (JSON.stringify(c.deviceSets) !== JSON.stringify([true]) ||
      c.applied !== 1) {
    violations.push('[reach] the device diff did not land exactly once ' +
      'through setDisplayFenceOpen (sets=' + JSON.stringify(c.deviceSets) +
      ', applied=' + c.applied + ') — the branch exists but the write is ' +
      'not reachable, which is the SE-9 hole one storage over');
  }
  // THE STALE ARM: a flip she made in Manage while the card sat on screen is
  // refused, nothing written. The double's value starts false; a card built
  // against from=true is stale by construction.
  const stale = runConfirm([{ key: 'display_fence_open',
    from: true, to: false }]);
  if (JSON.stringify(stale.deviceSets) !== JSON.stringify([]) ||
      stale.refused.indexOf('stale') === -1) {
    violations.push('[reach] a stale device diff was not refused ' +
      '(sets=' + JSON.stringify(stale.deviceSets) + ', refused=' +
      JSON.stringify(stale.refused) + ') — the stale check must read the ' +
      'device value, not the card');
  }
});

// ---------------------------------------------------------------------------
// 3. P-5 — THE SERVER IS UNTOUCHED. A CONTENT GATE, SPAN-SCOPED.
//
// Phase 26.96 builds a Manage pane over a roster route that ALREADY EXISTS —
// handle_librarian_roster's own docstring names this phase ("the ONE roster
// operation the import screen and (a later phase's) Manage editor both write
// through"). Not one byte of the server side is meant to move. That is a
// promise which is cheap to make and, unchecked, cheap to break in silence.
//
// ⛔ WHY A SPAN AND NEVER A WHOLE FILE. A second live session is committing to
// this repo and edits module-level constants near the top of study_lib.py;
// between f3309ab and this pin the file's own offsets moved twice
// (roster_segments 2085 -> 2094 -> 2147). A whole-file hash would have gone
// red on THEIR work, been read as noise, and been switched off inside a day.
// Worse, the repair an executor reaches for when a "must be unchanged" gate is
// red is `git restore` — which would destroy their uncommitted work. A gate
// must never be able to trigger the catastrophe it exists to prevent. The span
// gate asks the ONLY question this phase actually promised an answer to: did a
// ROSTER FUNCTION move? The wave-0 snapshot (tests/lib/tree_snapshot.cjs)
// answers the wider "did anything move, and who moved it" separately.
//
// ⚠ VERIFIED AT EXECUTION, NOT ASSUMED. All three spans hash identically at
// f3309ab, cf001e5, dc805ca, 7c81ba5 and in the working tree — even though the
// files around them moved. Pinning at the executing HEAD is therefore
// equivalent to pinning at the revision the planning documents cite.
//
// THE FIVE ANTI-VACUITY ANSWERS.
//  (1) Can it pass BEFORE the work? Yes — and that is correct and intended.
//      The server must be unchanged both before AND after this phase, so a
//      green reading today is the point, not a defect. What makes it evidence
//      rather than decoration is (2).
//  (2) Can it still pass once deliberately broken? No. ONE space planted
//      inside remove_roster_folder turns it red while add_roster_folder stays
//      green in the same run — executed, and recorded verbatim with its return
//      code in 26.96-01-SUMMARY.md. ⛔ The mutation goes to a SCRATCH COPY of
//      the whole tree, never to this one. Note there is deliberately NO env
//      override to point this gate at another file: a switch that redirects a
//      content gate is a switch that can silence it.
//  (3) Does a degenerate implementation satisfy it? No, and it is refused
//      three independent ways: the number of spans found is asserted to be
//      exactly three BY VALUE; each span must be non-empty; and each must
//      still contain a named literal drawn from its OWN body. An extractor
//      quietly returning '' for everything fails all three.
//  (4) Is it reading evaluation order or source order? NEITHER, and it says so
//      plainly: this is a CONTENT gate. It proves bytes did not move. It is
//      not offered as behavioural proof — groups 2a-2d above carry that, by
//      execution.
//  (5) Could a grep match the fix's own comment instead of the fix? There is
//      no grep. It hashes a span. A comment cannot satisfy it — and a comment
//      added INSIDE a span changes the hash, which is the intended
//      sensitivity, not a false positive.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

// sha256 of each span, captured at 011dd7d1622dc51e238399b5776e2e3a47e0f44c
// and verified byte-identical back through f3309ab / cf001e5 / dc805ca.
//
// ---------------------------------------------------------------------------
// ⚠⚠ THE SAME PIN MOVED A THIRD TIME, 2026-08-20 — a COMMENT CORRECTION, and
// the correction is the point.
//
//   OLD sha 4c5f1793e4c6a71a29e1635a0b46d214447644b0a5bb49ce5f3b63e8ac140d8e
//   NEW sha c0d84bd97d7aa83a9c5cf557089bafa752a9bab2445fe2b93e809831ae3ae622
//
// NO BEHAVIOUR CHANGED. What moved is the comment above the `known` field. It
// claimed that a folder she has not put anything in yet answers `None`, so
// only a genuine mistake would answer `False`. ⛔ THAT WAS FALSE, and it was
// found by DRIVING the route rather than reading it: with a vault root
// stamped, a REAL empty folder and a MIS-TYPED name both resolve zero origins
// and both answer `False`. The room cannot tell them apart.
//
// ⚠ It mattered because her sentence was about to be written against that
// claim. A line naming a mistake would have accused her every time she made a
// folder private before filling it. She was shown the measured truth instead,
// and chose N2 on it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ⚠⚠ THE SAME PIN MOVED A SECOND TIME, ON PURPOSE, ON 2026-08-20 — F-7, from
// the owner sitting, on her instruction to fix this phase's four defects.
//
// WHAT MOVED: `handle_librarian_roster` only. The other two spans are
// byte-unchanged and their pins are untouched.
//   OLD sha 29de2d2e07496c6a8eb3bc0d80220563e11d56ce80c9c8bcbabebb509abdbc7a
//   NEW sha 4c5f1793e4c6a71a29e1635a0b46d214447644b0a5bb49ce5f3b63e8ac140d8e
//
// WHAT WAS ADDED: one more field on the route's ANSWER — `"known"`, a
// TRI-STATE (true / false / null) saying whether the folder name she typed
// matched anything already in the library. She found, in the sitting, that she
// could type a folder that does not exist and be told it was kept private; a
// misspelling of a REAL folder is the same shape and is not harmless.
// Computed inside WRITE_LOCK off the same store object, on the add path only.
//
// ⛔ WHY A TRI-STATE AND NOT A BOOLEAN. A folder may honestly hold nothing yet
// — making one private BEFORE putting anything in it is legitimate — and with
// no vault root there is nothing to resolve origins against. Both answer
// `null` (cannot tell); only a store that could look and found nothing answers
// `false`. The client speaks on `=== false` and on nothing else.
//
// ⛔ A BOOLEAN-OR-NULL, NEVER A PATH AND NEVER A COUNT — the same rule the
// flagged number already lives under.
//
// ⚠ A DELIBERATE RE-PIN, NOT A NUMBER RAISED TO CLEAR A RED. The gate fired
// correctly, the span was read, the change is this session's, and it is
// recorded here with its reason — cause (a) in the gate's own wording, whose
// answer is that the owner asked for it.
// ---------------------------------------------------------------------------
//
// ⚠⚠ ONE PIN MOVED, ON PURPOSE, ON 2026-08-20 — 26.96-11 (G-26.96-3).
//
// WHAT MOVED: `handle_librarian_roster` only.
//   OLD sha 48a32a3997aa4825fdca6cbe149b261c770c418422de2335aec8b9caf85f8a46
//   NEW sha 29de2d2e07496c6a8eb3bc0d80220563e11d56ce80c9c8bcbabebb509abdbc7a
//
// WHAT WAS ADDED: one field on the route's ANSWER — `"retroactive"`, a
// boolean saying whether the retroactive pass was APPLICABLE on this store
// (i.e. whether a vault root is stamped), computed inside WRITE_LOCK off the
// same store object the operation ran against. Plus the docstring paragraph
// explaining it and the comment at the coercion site.
//
// WHY THE ANSWER HAD TO CHANGE. `add_roster_folder` reaches backwards ONLY
// when `meta.vault_root` is stamped, which happens ONLY on a whole-vault
// import — yet the Manage pane rendered the owner's sentence "…and anything
// already here from that folder is set aside too." on EVERY accepted add. On
// a Photos-only or folder-drop machine that is a false statement of
// protection on the strongest privacy control in the room. A client cannot
// tell an applicable pass from an inapplicable one from anything the route
// used to answer: ⛔ `flagged` is NOT that signal, because zero is also what
// an applicable pass answers for a folder that holds nothing yet, so a
// count-based gate would silence the room on a pass that really ran.
//
// ⛔ THE OTHER TWO PINS DID NOT MOVE, and that was verified rather than
// assumed: `add_roster_folder` and `remove_roster_folder` both hash to
// exactly their existing pinned values at this commit. This wave changed what
// the ROUTE ANSWERS, never what the LIBRARY DOES — D-07's asymmetry is
// untouched.
//
// ⚠ AND THE RE-PIN WAS RE-PROVEN CAPABLE OF RED: one space planted inside the
// NEW handler body turns this gate red naming `handle_librarian_roster` and
// printing both shas, with the other two spans reporting OK in the same run.
// Recorded verbatim in 26.96-11-SUMMARY.md. ⛔ A pin that moves without a
// recorded reason AND a re-proven red is how a content gate becomes a rubber
// stamp.
// ---------------------------------------------------------------------------
const P5_PINS = [
  { file: 'server.py', name: 'handle_librarian_roster', indent: '    ',
    // the operation validation, from the fail-closed head of the handler
    literal: "roster op must be 'add' or 'remove'.",
    // ⚠ RE-PINNED 2026-08-20 by 26.96-11. Previous value, kept on the record
    // so the move is legible rather than silent:
    //   48a32a3997aa4825fdca6cbe149b261c770c418422de2335aec8b9caf85f8a46
    sha: 'c0d84bd97d7aa83a9c5cf557089bafa752a9bab2445fe2b93e809831ae3ae622' },
  { file: 'study_lib.py', name: 'add_roster_folder', indent: '',
    // the retroactive history marker D-07 ADD stamps onto each flagged item
    literal: 'roster-add-retroactive',
    sha: 'c266b369656944963e01978f05fdc6c8fb87a176a145434ca2970c780018de19' },
  { file: 'study_lib.py', name: 'remove_roster_folder', indent: '',
    // D-07 REMOVE's deliberately-untouched note — the future-only asymmetry
    literal: 'DELIBERATELY untouched',
    sha: 'fe82bdb12d9f46764c3f1836fa7ce44bed98c231ec21a6b77511b00ef6a74287' }
];

// A Python analog of extractFn: slice a def to the start of the next def at
// the SAME indentation, then trim back to the body.
//
// ⚠ THE TRIM IS LOAD-BEARING AND WAS ADDED AFTER MEASURING. Slicing merely to
// the next def swallows whatever sits between the two — for remove_roster_folder
// that is THIRTY lines of module section commentary about the vault writers,
// which this phase never promised anything about and which the parallel
// session plausibly edits. Including it would have re-created, inside the span
// gate, the exact false-positive the span gate exists to avoid. A body line is
// indented deeper than its own def; blank lines and column-0 comments belong
// to neither function.
function extractPySpan(src, name, indent) {
  const lines = src.split('\n');
  const sig = indent + 'def ' + name + '(';
  let s = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(sig) === 0) { s = i; break; }
  }
  if (s === -1) { return null; }
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i++) {
    if (lines[i].indexOf(indent + 'def ') === 0) { e = i; break; }
  }
  while (e > s + 1) {
    const L = lines[e - 1];
    if (L.trim() === '' || L.indexOf(indent + ' ') !== 0) { e--; } else { break; }
  }
  return lines.slice(s, e).join('\n');
}

group('3 (P-5 the server side is byte-unchanged)', function () {
  const srcCache = {};
  const lifted = [];
  P5_PINS.forEach(function (pin) {
    if (!srcCache[pin.file]) {
      srcCache[pin.file] = fs.readFileSync(path.join(ROOT, pin.file), 'utf8');
    }
    const body = extractPySpan(srcCache[pin.file], pin.name, pin.indent);
    if (body === null) {
      violations.push('[P-5] ' + pin.name + ' was NOT FOUND in ' + pin.file +
        ' — the span gate cannot pin a function that no longer exists under ' +
        'that name. Either this phase renamed a server-side roster function ' +
        '(it promised not to), or the other live session in this tree did.');
      return;
    }
    lifted.push({ pin: pin, body: body });
  });

  // BY VALUE. Two spans or four is itself the violation: a gate that silently
  // pinned fewer functions than it claims would be green on an unpinned one.
  if (lifted.length !== 3) {
    violations.push('[P-5] expected EXACTLY 3 pinned spans, extracted ' +
      lifted.length + ' — a span gate that lifts the wrong number of ' +
      'functions is not measuring what it says it measures');
  }

  lifted.forEach(function (L) {
    const where = L.pin.file + '::' + L.pin.name;
    // Refuse a degenerate extraction: nothing to hash must never read as OK.
    if (!L.body.length) {
      violations.push('[P-5] the extracted span for ' + where + ' is EMPTY — ' +
        'hashing nothing would make this gate vacuously green');
      return;
    }
    if (L.body.indexOf(L.pin.literal) === -1) {
      violations.push('[P-5] the extracted span for ' + where + ' no longer ' +
        'contains its own named literal ' + JSON.stringify(L.pin.literal) +
        ' — either the extractor is lifting the wrong bytes, or that ' +
        "function's body genuinely changed");
      return;
    }
    const got = crypto.createHash('sha256').update(L.body, 'utf8')
      .digest('hex');
    if (got !== L.pin.sha) {
      violations.push('[P-5] ' + where + ' CHANGED. pinned=' + L.pin.sha +
        ' now=' + got + ' (' + L.body.split('\n').length + ' lines). ' +
        '⚠ THERE ARE TWO POSSIBLE CAUSES AND THE OWNER NEEDS TO SEE BOTH: ' +
        '(a) THIS PHASE edited a server-side roster function it promised not ' +
        'to touch — 26.96 ships a Manage pane over a route that already ' +
        'exists, so nothing here should move; or (b) ANOTHER LIVE SESSION in ' +
        'this tree edited it, which is legitimate work that simply needs ' +
        'attributing. ⛔ DO NOT respond by restoring, checking out, stashing ' +
        'or resetting anything: read the span, decide which cause it is, and ' +
        'record it. A gate must never trigger the catastrophe it prevents.');
    }
  });
});

// ---------------------------------------------------------------------------

if (violations.length) {
  console.log('test_roster_route_behaviour FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.log('  ' + v); });
  process.exit(1);
}
console.log('test_roster_route_behaviour OK (11 router cases, the #105 ' +
  'device route among them; a roster diff REACHES the roster route and ' +
  'never the meta route; a mixed diff is refused at zero network cost; an ' +
  'ordinary meta diff still reaches /api/meta; a diff the room has no copy ' +
  'for is refused at zero cost with not-mine, against a control that does ' +
  'reach and apply; and a device diff (#105) touches no network in either ' +
  'direction, lands exactly once through setDisplayFenceOpen, and is ' +
  'refused stale off the device value — 5 executing groups, each wrapped ' +
  'so a harness throw is reported instead of aborting the file); and P-5 — ' +
  'the three server-side roster functions (handle_librarian_roster, add_roster_folder, remove_roster_folder) are byte-unchanged, pinned by sha256 over their own SPANS so the parallel session\'s edits elsewhere in the same files cannot turn this red)');
