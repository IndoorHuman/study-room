/*
 * tests/test_session_flow.cjs — the reflection session's client wiring
 * (Plan 26.7-02).
 *
 * Zero-dep node (fs/path only), path-independent via __dirname, in the
 * read-source-as-TEXT style of tests/test_candle_repull.cjs. It reads
 * app.js and index.html as text — no browser, no DOM library — and pins
 * the session composition statically so Plans 03-05 can extend it
 * without trampling what 02 wired. It is NOT an APP_SOURCES member of
 * test_no_push.cjs (the global gate); this suite is the plan-scoped
 * complement over the session region.
 *
 * Five assertion groups (26.7-02 Task 3):
 *
 *   1. HANDLER ORDERING — the candle click handler survives intact:
 *      DESIGN guard first, the CANDLE.reaching branch present and
 *      untouched, the parked-connect guard still behind
 *      CONNECTION_ENGINE_ENABLED (still false), and the session start
 *      as the tail. startCandleRepull() keeps exactly ONE call site —
 *      now inside startReflectionSession — and the session chains on
 *      the finishRoomRepull completion seam (REPULL.onDone).
 *   2. BUSY-GATE COMPOSITION — a tap during REPULL.busy or a running
 *      session adds no second session (the SESSION.busy || REPULL.busy
 *      guard), the POST is latched (SESSION.posted), and
 *      /api/librarian/session has exactly one client call site.
 *   3. PINNED COPY — the warm nothing-new line and the static failure
 *      line are byte-present exactly once each; the consent copy
 *      carries the honest A3 pool framing ("what's newly arrived +
 *      your comments"); no absence/streak/time-gap vocabulary rides
 *      any session string or comment (a local Suite-5-shaped set).
 *   4. SPOT + SPREAD — the session renders at #desk-spot-session (the
 *      station refill re-paints it), the full read goes through
 *      openSpread (the view stack), and no screen-navigation call
 *      rides the session path; the one-shot re-arm is the only
 *      deferred work (one setTimeout, in sessionArmReread).
 *   5. SEAM DISCIPLINE — every innerHTML sink in the session region is
 *      a pure literal or seam-evident (escapeHtml / renderMarkdown /
 *      escapeAttr).
 *   6. THE ONE-OFFER BEAT + THE THINKING FLAME (26.7-05, Task 3) — the
 *      session-start beat has exactly one GET call site; the POST
 *      waits on the offer beat (a waiting offer paints before anything
 *      new) and every intent rides the ONE post call site; the offer
 *      painter builds exactly two quiet doors; the offer line is
 *      byte-present exactly once; sessionFlameSync rides only the
 *      reading/writing stages and never touches the reaching/settle/
 *      playing machinery; the strip loads through the ASSET_VER
 *      cache-buster and degrades silently; the tokens.css flame block
 *      adds warmth only (no geometry, no fade, no sub-1 brightness —
 *      the 26.4 D-23 candle fence).
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every unmet assertion listed on its own line + exit 1 on
 * failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const HTML = 'index.html';
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
// 26.95-57: the REAL core, handed to the harness rather than stood in for.
// escapeHtml delegates to it, and an escaper stand-in in a suite about what
// the room SAYS is a stand-in sitting between her sentence and the assertion.
const StudyCore = require(path.join(ROOT, 'core.js'));
const htmlSrc = fs.readFileSync(path.join(ROOT, HTML), 'utf8');

const violations = [];

// Slice a top-level function body: from its `function name(` keyword to
// the next module-indent function declaration (the test_candle_repull
// convention — app.js keeps a flat layout inside its IIFE).
function functionBody(name) {
  const marker = 'function ' + name + '(';
  const start = appSrc.indexOf(marker);
  if (start === -1) {
    violations.push('[session] ' + APP + ": function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return '';
  }
  const end = appSrc.indexOf('\n  function ', start + marker.length);
  const raw = appSrc.slice(start, end === -1 ? appSrc.length : end);
  const close = raw.lastIndexOf('\n  }');
  return close === -1 ? raw : raw.slice(0, close + 4);
}

// 26.995-28: the same slicer, for a function that may not exist yet. The
// RED run of this plan drove these arms against app.js BEFORE the two new
// functions were written, and a slicer that pushes a violation for a missing
// name would have buried the red it was supposed to report.
function functionBodyOptional(name) {
  if (appSrc.indexOf('function ' + name + '(') === -1) { return ''; }
  return functionBody(name);
}

// 26.95-57: the OFFER_COPY object, LIFTED from app.js rather than re-typed
// into the harness. ⛔ Hand-typing it would put HER sentence in this file a
// second time, and a silent reword in app.js would then pass here — the exact
// shape of the mirror trap this project keeps paying for.
function objectBody(name) {
  const marker = 'var ' + name + ' = {';
  const start = appSrc.indexOf(marker);
  if (start === -1) {
    violations.push('[session] ' + APP + ": object '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return '';
  }
  let depth = 0;
  for (let i = appSrc.indexOf('{', start); i < appSrc.length; i++) {
    const c = appSrc[i];
    if (c === '{') { depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0) { return appSrc.slice(start, i + 1) + ';'; }
    }
  }
  violations.push('[session] ' + APP + ": object '" + name +
    "' could not be bounded");
  return '';
}

function countOf(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// The region this plan owns — every session function plus the module
// state slice (SESSION + the static line) between the state marker and
// the first session function.
const SESSION_FNS = ['sessionSpot', 'sessionEnsureHome',
  'startReflectionSession', 'sessionRepullFinished',
  'sessionOfferBeat', 'sessionOfferResume', 'sessionOfferDecline',
  'sessionConsentAnswered', 'sessionConsentDeclined', 'sessionMaybePost',
  'sessionQuietEnd', 'sessionReadProgress', 'sessionArmReread',
  'sessionFetchDraft', 'sessionPaintSpot', 'sessionPaintThinking',
  'sessionPaintOffer', 'sessionPaintReveal', 'sessionOpenSpread',
  'sessionProbeThinkingStrip', 'sessionFlameSync',
  // 26.8-01: the walk stage's functions join the region so every gate
  // above (absence vocabulary, seam discipline, no-navigation, the
  // one-deferral pin) covers them from the first keystroke.
  'sessionWalkStage', 'sessionWalkSkip', 'sessionWalkBegin',
  'sessionWalkClose', 'sessionPaintWalkOpen', 'sessionPaintWalkClose',
  // Handoff §M6: the wall-clock bound joins the region so the absence
  // gate, the seam gate and the no-navigation gate cover it too.
  'sessionBusyBegin', 'sessionBoundRelease', 'sessionTimedOut',
  // map #50 / #68 ruling 3: the second go. ⚠ Joining the region is not
  // bookkeeping — it puts the retry door under the ABSENCE gate, which is
  // the one place a "you have not tried since…" sentence could creep into
  // a screen that appears exactly when something went wrong (law 3).
  'sessionGenerationFailed', 'sessionRetryGeneration',
  // 26.995-28: the two honest endings and their conditions join the
  // region. ⚠ NOT bookkeeping — it puts HER two sentences and everything
  // written around them under the ABSENCE gate and the seam gate, on
  // screens that appear at the exact moment an evening did not work. A
  // "you have not been here since…" clause is likeliest precisely there.
  // ⚠ The 26.995-22 pair were written before this list was extended and
  // were never scanned; they are added with the new pair rather than left
  // out, because "the new ones are covered" is not the property.
  'sessionConsentCardShowing', 'sessionWaitingOnHerAnswer',
  'sessionWaitedOnHer', 'sessionWaitingInHerWalk',
  'sessionWaitedDuringWalk'];
const stateAt = appSrc.indexOf('var SESSION = {');
const stateEnd = appSrc.indexOf('function sessionSpot(');
const stateSlice = (stateAt === -1 || stateEnd === -1) ? '' :
  appSrc.slice(stateAt, stateEnd);
if (!stateSlice) {
  violations.push('[session] ' + APP + ': the SESSION state block ' +
    '(var SESSION = { … } before sessionSpot) is missing');
}
const region = SESSION_FNS.map(functionBody).join('\n') + '\n' +
  stateSlice;

// The candle click handler's own slice (it lives inside initRoom): from
// the candle listener to a window past its close — wide enough to hold
// every branch through the session tail call.
const candleAt = appSrc.indexOf(
  "$('room-obj-candle').addEventListener('click'");
const candleSlice = candleAt === -1 ? '' :
  appSrc.slice(candleAt, candleAt + 2100);

// ---- 1. HANDLER ORDERING ----------------------------------------------------

if (candleAt === -1) {
  violations.push('[ordering] ' + APP +
    ': the candle click handler is missing');
}
const designAt = candleSlice.indexOf('if (DESIGN) { return; }');
const reachingAt = candleSlice.indexOf('CANDLE.reaching');
const parkedAt = candleSlice.indexOf(
  'CONNECTION_ENGINE_ENABLED && librarianOn()');
const tailAt = candleSlice.indexOf('startReflectionSession();');
if (designAt === -1 || reachingAt === -1 || parkedAt === -1 ||
    tailAt === -1) {
  violations.push('[ordering] ' + APP + ': the candle handler must keep ' +
    'all four beats — DESIGN guard, CANDLE.reaching branch, ' +
    'parked-connect guard, startReflectionSession() tail');
} else if (!(designAt < reachingAt && reachingAt < parkedAt &&
             parkedAt < tailAt)) {
  violations.push('[ordering] ' + APP + ': the candle handler beats are ' +
    'out of order — DESIGN guard first, reaching branch untouched, ' +
    'parked-connect guard, THEN the session tail');
}
if (candleSlice.indexOf('openProposalStack()') === -1 ||
    candleSlice.indexOf('triggerCandleSettle()') === -1) {
  violations.push('[ordering] ' + APP + ': the CANDLE.reaching branch ' +
    'must stay whole (triggerCandleSettle + openProposalStack)');
}
if (candleSlice.indexOf("classList.add('playing')") === -1) {
  violations.push('[ordering] ' + APP + ': the tap must keep the ambient ' +
    '.playing quicken');
}
// The connect engine stays parked (26.4 D-30) — the session is a NEW
// job, never /api/librarian/connect.
if (appSrc.indexOf('var CONNECTION_ENGINE_ENABLED = false;') === -1) {
  violations.push('[ordering] ' + APP +
    ': CONNECTION_ENGINE_ENABLED must stay false (26.4 D-30)');
}
if (region.indexOf('/api/librarian/connect') !== -1) {
  violations.push('[ordering] ' + APP + ': the session region must never ' +
    'reach /api/librarian/connect — the connect engine is parked');
}
// ⚖️⚖️ RE-AIMED 2026-08-23 BY OWNER RULING — 1 call site becomes EXACTLY 2.
// ⛔ A PIN IS NEVER MOVED TO MAKE A SUITE GREEN. It is moved when the room's
// contract changes by ruling, and the ruling is named here so a later reader
// checks the move instead of trusting it. Record:
// 26.995-OWNER-RULING-2026-08-23-gather-before-the-candle.md.
//
// WHAT IT USED TO HOLD: startCandleRepull has ONE call site, inside the
// session opener — "the tap IS still the fetch, one level down", which is
// startCandleRepull's own law-1 paragraph expressed as a gate.
//
// WHY IT MOVED: her 2026-08-21 sitting died because 27 seconds of gathering
// sat inside a 45-second clock that starts at the tap. She ruled the gathering
// happens at the LANDING instead. ⚠ She was told, in the option text, that this
// changes a law-1-justified property and what it costs — the room touching
// Photos on every open, and a status line without a tap — and ruled it anyway,
// on the second ask, after the law-1 line was put back to her.
//
// ⛔ SO THIS IS STILL A REAL GATE, AND STILL THE SAME ONE: a THIRD caller
// fails it, and so does losing either of the two. Both are named, so a caller
// that moves has to be moved deliberately.
const repullCalls = (appSrc.match(/startCandleRepull\(\);/g) || []).length;
if (repullCalls !== 2) {
  violations.push('[ordering] ' + APP + ': startCandleRepull() must have ' +
    'exactly TWO call sites — the session opener and the landing gather ' +
    '(her ruling of 2026-08-23) — found ' + repullCalls);
}
const gather = functionBody('visitGatherBegin');
if (gather.indexOf('startCandleRepull();') === -1) {
  violations.push('[ordering] ' + APP + ': visitGatherBegin must run the ' +
    "gather — it is the landing's whole job (her ruling of 2026-08-23)");
}
if (gather.indexOf('REPULL.onDone = visitGatherFinished;') === -1) {
  violations.push('[ordering] ' + APP + ': the landing gather must own the ' +
    'seam it started, or the landing can never reach done and the candle ' +
    'waits for a gather that already finished');
}
// ⛔ AND THE LANDING MAY GATHER, NEVER ASK A MODEL. Her ruling authorises
// exactly one thing; this is the half that cannot be widened by accident.
if (/api\/librarian\//.test(gather)) {
  violations.push('[ordering] ' + APP + ': the landing gather must reach NO ' +
    'librarian route — her ruling authorises gathering at the landing and ' +
    'nothing else (law 1)');
}
const opener = functionBody('startReflectionSession');
if (opener.indexOf('startCandleRepull();') === -1) {
  violations.push('[ordering] ' + APP + ': startReflectionSession must ' +
    "run the re-pull as the session's first beat (D-09)");
}
if (opener.indexOf('REPULL.onDone = sessionRepullFinished;') === -1) {
  violations.push('[ordering] ' + APP + ': the session must chain on the ' +
    'finishRoomRepull completion seam (REPULL.onDone)');
}
const finishRepull = functionBody('finishRoomRepull');
if (finishRepull.indexOf('consumeRepullSeam()') === -1) {
  violations.push('[ordering] ' + APP + ': finishRoomRepull must consume ' +
    'the completion seam (consumeRepullSeam) at its queue-empty end');
}

// ---- 2. BUSY-GATE COMPOSITION -----------------------------------------------

// ⚠⚠ A SOURCE-SHAPE PIN CANNOT SEE BEHAVIOUR, AND THIS LINE IS THE PROOF.
// It was GREEN for the whole life of CR-01 (26.995-15 → 26.995-17), because
// the guard's TEXT never changed — what changed was what `REPULL.busy` MEANT
// while a source waited its turn behind a photo reading, and a regex over the
// source is structurally incapable of seeing a meaning. A tap on the candle
// gave her the flame and nothing else, and this check said the guard was
// correct throughout.
//
// ⛔ THE BEHAVIOURAL GATE IS `claimATapDuringTheWaitOpensItsSitting` IN
// tests/test_vision_hold.cjs. It slices the shipped startReflectionSession
// and drives it against the run state the shipped finishRoomRepull wait
// branch actually leaves behind, counting by value, with two unmutated
// controls in the same pass. This pin is kept for the composition it CAN see
// and for nothing more; it must never again be read as covering the guard.
if (!/if \(SESSION\.busy \|\| REPULL\.busy\) \{/.test(opener)) {
  violations.push('[busy] ' + APP + ': startReflectionSession must guard ' +
    'on SESSION.busy || REPULL.busy — a tap during either is the ' +
    'quicken alone, never a second session');
}
// the guarded branch may re-raise the existing paper but must never
// start anything: no POST, no repull, no state reset inside it.
//
// ⛔⛔ THIS BLOCK HAD NEVER RUN. `guardEnd` was computed from a
// `SESSION.busy = true;` assignment that startReflectionSession DOES NOT
// CONTAIN — it calls `sessionBusyBegin()` — so `guardEnd` was -1, the
// `guardEnd !== -1` condition was false, and the whole busy-branch check
// silently examined nothing while reporting a pass. Re-anchored on the call
// site, and it now FAILS LOUDLY rather than skipping: a check that silently
// does nothing is the same class of defect as a check that pins the wrong
// thing, and this one file carried both at once.
const GUARD_HEAD = 'if (SESSION.busy || REPULL.busy) {';
const BRANCH_END = 'sessionBusyBegin();';
const guardAt = opener.indexOf(GUARD_HEAD);
const guardEnd = opener.indexOf(BRANCH_END);
if (guardAt === -1) {
  violations.push('[busy] ' + APP + ': the busy-branch check could not be ' +
    "run — the anchor '" + GUARD_HEAD + "' is gone from " +
    'startReflectionSession. Re-anchor it; never skip it.');
} else if (guardEnd === -1) {
  violations.push('[busy] ' + APP + ': the busy-branch check could not be ' +
    "run — the closing anchor '" + BRANCH_END + "' is gone from " +
    'startReflectionSession, so this check would examine NOTHING. That is ' +
    'exactly the state it was shipped in. Re-anchor it; never skip it.');
} else if (guardEnd <= guardAt) {
  violations.push('[busy] ' + APP + ': the busy-branch anchors are out of ' +
    'order (guard at ' + guardAt + ', branch end at ' + guardEnd + ') — ' +
    'the slice would be empty and would pass on nothing');
} else {
  const guarded = opener.slice(guardAt, guardEnd);
  // ⚠ AND THE SLICE MUST HAVE SUBSTANCE. A one-character slice satisfies
  // every `indexOf(...) === -1` below.
  if (guarded.length < 120) {
    violations.push('[busy] ' + APP + ': the busy branch sliced to ' +
      guarded.length + ' chars — an absence check that examined nothing ' +
      'must not pass');
  } else {
    console.log('[busy] busy-branch slice FOUND AND EXAMINED — ' +
      guarded.length + " chars between '" + GUARD_HEAD + "' and '" +
      BRANCH_END + "' (this block silently examined nothing until " +
      '26.995-17)');
  }
  if (guarded.indexOf('sessionMaybePost') !== -1 ||
      guarded.indexOf('startCandleRepull') !== -1) {
    violations.push('[busy] ' + APP + ': the busy branch must never ' +
      'POST or re-pull — the tap is the quicken (plus the existing ' +
      'paper) alone');
  }
  // ⛔ 26.995-17 (CR-01): the ONE thing a source-shape pin genuinely can
  // see. `REPULL.pendingSource` — a source queued behind a reading — is not
  // a reason to refuse her a sitting, and putting it back on this guard IS
  // the defect. The behaviour is gated in tests/test_vision_hold.cjs; this
  // catches the re-merge at the point someone would type it.
  if (guarded.indexOf('pendingSource') !== -1) {
    violations.push('[busy] ' + APP + ': the busy gate must never read ' +
      'REPULL.pendingSource — a source waiting its turn behind a photo ' +
      'reading is not a reason to refuse her a sitting. That is CR-01, and ' +
      'it shipped once already.');
  }
}
const poster = functionBody('sessionMaybePost');
if (poster.indexOf('SESSION.posted') === -1 ||
    poster.indexOf('SESSION.posted = true;') === -1) {
  violations.push('[busy] ' + APP + ': sessionMaybePost must latch on ' +
    'SESSION.posted — one POST per session, ever');
}
const postCalls = countOf(appSrc, "apiPost('/api/librarian/session'");
if (postCalls !== 1) {
  violations.push('[busy] ' + APP + ": expected exactly ONE " +
    "apiPost('/api/librarian/session' call site — found " + postCalls);
}

// ---- 3. PINNED COPY + the local absence gate --------------------------------

const WARM_LINE = 'the library is settled. nothing waiting today.';
const STATIC_LINE = 'the librarian could not finish just now. nothing ' +
  'is lost; the desk is as it was.';
const OFFER_LINE = 'pick up where we left off?';
const BOUND_LINE = 'the librarian let this one go; it was taking too ' +
  'long. nothing is lost; whatever arrived is still here.';
// ⛔⛔ HER TWO SENTENCES, 2026-08-22. PINNED BY VALUE exactly as BOUND_LINE
// above is, because a byte-pin is the only thing that catches a silent
// reword. Both are HERS and both were CHOSEN FROM AN OFFERED SET of three
// candidates — recorded with their provenance in 26.995-COPY.md § W-3 and
// § W-5. ⛔ Neither was volunteered and neither may be edited here: this
// file is a mirror of that record, and if the two ever disagree the CODE is
// wrong, not the record.
// ⚠ The dash in WALK_WAITED_LINE is an EM DASH, not a hyphen.
const WAITED_LINE = "the reflection hasn't started; it's waiting for your answer.";
const WALK_WAITED_LINE = 'no reflection tonight, but everything you welcome here is still kept.';
[[WARM_LINE, 'warm nothing-new'], [STATIC_LINE, 'static failure'],
  [OFFER_LINE, 'held-draft offer'], [BOUND_LINE, 'bound-expiry'],
  [WAITED_LINE, 'waiting-for-her (W-3, hers)'],
  [WALK_WAITED_LINE, 'walk-ending (W-5, hers)']]
  .forEach(function (pair) {
    const n = countOf(appSrc, pair[0]);
    if (n !== 1) {
      violations.push('[copy] ' + APP + ': the ' + pair[1] + ' line must ' +
        "be byte-present exactly once — found " + n + ": '" + pair[0] +
        "'");
    }
  });
// The consent copy frames the pool honestly (RESEARCH A3): newly
// arrived material + her comments — never live in-place vault edits.
if (appSrc.indexOf("what's newly arrived + your comments") === -1) {
  violations.push('[copy] ' + APP + ": the session consent line must " +
    "frame the pool as \"what's newly arrived + your comments\" (A3)");
}
if (region.indexOf("gathering what's new…") === -1) {
  violations.push('[copy] ' + APP + ': the immediate thinking label ' +
    '("gathering what\'s new…") must paint client-side at the tap ' +
    '(SC-1 — legible before any network answer)');
}
// The local absence/streak/time-gap set (Suite-5-shaped, comments
// included) over the whole session region.
const ABSENCE = [
  { name: 'since you', re: /\bsince\s+you\b/i },
  { name: 'welcome back', re: /\bwelcome\s+back\b/i },
  { name: "you've been away/gone", re: /\byou(?:'?ve|\s+have)\s+been\s+(?:away|gone)\b/i },
  { name: 'N ago', re: /\b\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i },
  { name: 'days ago', re: /\bdays?\s+ago\b/i },
  { name: 'streak', re: /\bstreak\b/i },
  { name: 'while you were', re: /\bwhile\s+you\s+were\b/i },
  { name: "it's been", re: /\b(?:it'?s|it\s+has)\s+been\b/i },
  { name: 'last visit', re: /\blast\s+visit\b/i },
  { name: "haven't (visited/opened)", re: /\bhaven'?t\b/i },
  { name: 'you were away', re: /\byou\s+were\s+(?:away|gone)\b/i },
  { name: 'day count', re: /\bday\s+count\b/i },
  { name: 'come back', re: /\bcome\s+back\b/i }
];
ABSENCE.forEach(function (tok) {
  if (tok.re.test(region)) {
    violations.push('[no-absence] ' + APP + ': the session region must ' +
      "not carry '" + tok.name + "' vocabulary (law 3) — comments " +
      'included');
  }
});

// ---- 4. SPOT + SPREAD, no navigation ----------------------------------------

if (functionBody('sessionSpot').indexOf("$('desk-spot-session')") === -1) {
  violations.push('[spot] ' + APP + ': the session must render at the ' +
    'reserved #desk-spot-session spot (D-15)');
}
if (functionBody('renderDeskStation').indexOf('sessionPaintSpot()') === -1) {
  violations.push('[spot] ' + APP + ': renderDeskStation must re-paint ' +
    'the session spot on every refill (a pop back to the station keeps ' +
    'the paper honest)');
}
if (htmlSrc.indexOf('desk-spot-session') === -1) {
  violations.push('[spot] ' + HTML + ': the station-overlay block should ' +
    'name the 26.7-02 session spot (documentation parity — the DOM is ' +
    'app.js-built)');
}
const openerSpread = functionBody('sessionOpenSpread');
if (openerSpread.indexOf('openSpread(') === -1) {
  violations.push('[spread] ' + APP + ': the full read must go through ' +
    'openSpread — the shipped view-stack spread grammar (SRM-12)');
}
['showScreen', 'onbGo(', 'startBlessing', 'location.href',
  'window.location', 'window.open', 'enterManage'].forEach(function (tok) {
  if (region.indexOf(tok) !== -1) {
    violations.push('[spread] ' + APP + ': the session path must never ' +
      "navigate — found '" + tok + "' in the session region");
  }
});
// notebook spot untouched: the session region never reaches 26.8's.
if (region.indexOf('desk-spot-notebook') !== -1) {
  violations.push('[spot] ' + APP + ': the session region must leave ' +
    "#desk-spot-notebook alone (26.8's)");
}
// Deferred work in the session region is enumerated, not merely counted.
// This gate shipped as "exactly ONE setTimeout, in sessionArmReread"; the
// Handoff §M6 bound is the second and last, so the pin is now BY OWNER as
// well as by count — a third site, or either of these two moving to a
// function that is not named here, fails. Never a repeating construct.
const DEFERRAL_OWNERS = ['sessionArmReread', 'sessionBusyBegin'];
const deferrals = (region.match(/setTimeout\s*\(/g) || []).length;
if (deferrals !== DEFERRAL_OWNERS.length) {
  violations.push('[one-shot] ' + APP + ': the session region must arm ' +
    'exactly ' + DEFERRAL_OWNERS.length + ' deferrals (found ' +
    deferrals + ' setTimeout sites)');
}
DEFERRAL_OWNERS.forEach(function (fn) {
  const body = functionBody(fn);
  const n = (body.match(/setTimeout\s*\(/g) || []).length;
  if (n !== 1) {
    violations.push('[one-shot] ' + APP + ': ' + fn + ' must own exactly ' +
      'ONE deferral (found ' + n + ')');
  }
});
if (region.match(/setInterval\s*\(/)) {
  violations.push('[one-shot] ' + APP + ': the session region must never ' +
    'use a repeating construct (setInterval)');
}

// ---- 5. SEAM DISCIPLINE -----------------------------------------------------

const SEAM_RE = /\b(?:renderMarkdown|escapeHtml|escapeAttr)\s*\(/;
let sinkAt = region.indexOf('.innerHTML');
while (sinkAt !== -1) {
  const semi = region.indexOf(';', sinkAt);
  const stmt = region.slice(sinkAt, semi === -1 ? region.length : semi + 1);
  const literalOnly =
    /^\.innerHTML\s*=\s*'(?:[^'\\]|\\.)*';$/.test(stmt.trim());
  if (!SEAM_RE.test(stmt) && !literalOnly) {
    violations.push('[seam] ' + APP + ': a session innerHTML sink is ' +
      'neither a pure literal nor seam-evident: ' +
      stmt.replace(/\s+/g, ' ').slice(0, 120));
  }
  sinkAt = region.indexOf('.innerHTML', sinkAt + 1);
}

// ---- 6. 26.7-05: the one-offer beat + the thinking flame --------------------

// The session-start beat: exactly ONE GET call site carries ?beat=start
// (the server spends the offer atomically inside that read).
const beatCalls = countOf(appSrc, "'/api/librarian/session?beat=start'");
if (beatCalls !== 1) {
  violations.push('[offer] ' + APP + ': the session-start beat must have ' +
    'exactly one call site (?beat=start) — found ' + beatCalls);
}
// The POST waits on the offer beat, and holds while an offer is open —
// a waiting offer paints before anything new (D-03).
const poster26 = functionBody('sessionMaybePost');
if (poster26.indexOf('SESSION.offerChecked') === -1 ||
    poster26.indexOf('SESSION.offer') === -1) {
  violations.push('[offer] ' + APP + ': sessionMaybePost must wait on ' +
    'the offer beat (offerChecked) and hold while an offer is open');
}
// Every intent rides the ONE post call site (the postCalls pin above
// stays 1): resume and discard are each set at exactly one door.
if (poster26.indexOf('intent') === -1) {
  violations.push('[offer] ' + APP + ': the resume/discard intent must ' +
    'ride the one session POST body — never a second call site');
}
if (countOf(appSrc, "heldIntent = 'resume'") !== 1 ||
    countOf(appSrc, "heldIntent = 'discard'") !== 1) {
  violations.push('[offer] ' + APP + ': resume and discard must each be ' +
    'set at exactly one site (the two offer doors)');
}
// The offer painter: exactly TWO quiet doors, the pinned line behind
// the escape seam, and no preview of the held content.
const offerPaint = functionBody('sessionPaintOffer');
if (countOf(offerPaint, '<button') !== 2) {
  violations.push('[offer] ' + APP + ': sessionPaintOffer must build ' +
    'exactly TWO quiet doors (resume / let it go)');
}
if (offerPaint.indexOf('SESSION_OFFER_LINE') === -1) {
  violations.push('[offer] ' + APP + ': the offer painter must render ' +
    'the ONE pinned offer line source literal');
}
if (offerPaint.indexOf('SESSION.draft') !== -1 ||
    offerPaint.indexOf('SESSION.chat') !== -1) {
  violations.push('[offer] ' + APP + ': the offer names that a ' +
    'conversation waits, never its content — no draft/chat preview');
}
// The thinking flame (D-14): rides only the reading/writing stages,
// never the 26.4-03 reaching/settle machinery or the ambient quicken.
const flame = functionBody('sessionFlameSync');
if (flame.indexOf('reading…') === -1 || flame.indexOf('writing…') === -1) {
  violations.push('[flame] ' + APP + ': sessionFlameSync must key on the ' +
    'reading…/writing… stages only (D-14)');
}
['reaching', 'settle', 'playing'].forEach(function (cls) {
  if (new RegExp("classList\\.(?:add|remove|toggle)\\('" + cls + "'")
    .test(flame)) {
    violations.push('[flame] ' + APP + ': sessionFlameSync must never ' +
      "touch the '" + cls + "' machinery (26.4-03 owns it)");
  }
});
const probeBody = functionBody('sessionProbeThinkingStrip');
if (probeBody.indexOf('_ver(') === -1) {
  violations.push('[flame] ' + APP + ': the strip must load through the ' +
    'ASSET_VER cache-buster (_ver)');
}
if (probeBody.indexOf('onload') === -1) {
  violations.push('[flame] ' + APP + ': the strip is probed — a missing ' +
    'asset must degrade to the glow silently (the backstop)');
}
// tokens.css: the flame block adds warmth ONLY — the 26.4 D-23 fence.
// No geometry, no fade, no brightness stop below 1: the candle never
// melts, shortens, or dims from thinking.
const cssSrc = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
const flameAt = cssSrc.indexOf('26.7-05 (D-14)');
if (flameAt === -1) {
  violations.push('[flame] tokens.css: the 26.7-05 (D-14) thinking-flame ' +
    'section is missing');
} else {
  const nextAt = cssSrc.indexOf('/* ---- 2', flameAt + 8);
  const flameBlock = cssSrc.slice(flameAt,
    nextAt === -1 ? cssSrc.length : nextAt);
  if (/\bheight\s*:|\bwidth\s*:|\bopacity\s*:|\btransform\s*:/
    .test(flameBlock)) {
    violations.push('[flame] tokens.css: the thinking-flame block must ' +
      'carry no geometry or fade properties (D-23: never melts, ' +
      'shortens, or dims)');
  }
  if (/brightness\(\s*0/.test(flameBlock)) {
    violations.push('[flame] tokens.css: every thinking-flame brightness ' +
      'stop must stay at 1 or above (D-23: the flame never dims)');
  }
}

// The alive-thinking pins (26.7-uat, owner-directed): a long sonnet wait
// must read alive, never frozen — the three REAL stages render as a step
// row whose active step pulses by pure CSS (no timers, no invented
// percentage: the stages are the server's own truth). And the paper
// scrolls: the session spot clips overflow-x only — content taller than
// the spot rides a scrollbar, never a silent cut.
const thinking = functionBody('sessionPaintThinking');
if (thinking.indexOf('session-steps') === -1 ||
    thinking.indexOf('session-step-now') === -1) {
  violations.push('[alive] ' + APP + ': sessionPaintThinking must render ' +
    'the session-steps row with a session-step-now active step (26.7-uat)');
}
const cssAll = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
if (!/@keyframes\s+session-step-pulse/.test(cssAll)) {
  violations.push('[alive] tokens.css: the session-step-pulse keyframes ' +
    'are missing — the active step must visibly breathe (26.7-uat)');
}
const liveRule = cssAll.match(
  /\.station-spot\.session-live\s*\{[^}]*\}/);
if (!liveRule || !/overflow-y:\s*auto/.test(liveRule[0]) ||
    /overflow:\s*hidden/.test(liveRule[0])) {
  violations.push('[alive] tokens.css: .station-spot.session-live must ' +
    'scroll (overflow-y: auto, never a bare overflow: hidden cut) — ' +
    'the essay must never be silently truncated (26.7-uat)');
}

// The paths-on-the-spread pins (26.7-uat, owner-directed): she reads the
// essay on the FULL spread, so the three-path gate must be reachable
// there too — re-hosted through the shipped ribbon hook (target-container
// pattern: same sessionPaintPaths, same handlers, same single-source
// copy; only the container moves). A path tapped on the spread pops back
// to the station first so the shelving fade / chat / settle land where
// they live.
const openSpreadFn = functionBody('sessionOpenSpread');
if (openSpreadFn.indexOf('ribbon') === -1 ||
    openSpreadFn.indexOf('sessionPaintPaths') === -1) {
  violations.push('[paths] ' + APP + ': sessionOpenSpread must re-host ' +
    'the three-path row into the spread bar via the ribbon hook ' +
    '(26.7-uat)');
}
['sessionSaveTap', 'sessionPassTap'].forEach(function (fn) {
  if (functionBody(fn).indexOf('sessionLeaveSpread') === -1) {
    violations.push('[paths] ' + APP + ': ' + fn + ' must return to the ' +
      'station (sessionLeaveSpread) before acting — the shelving/settle ' +
      'moments live at the spot (26.7-uat)');
  }
});
// The chat-on-the-spread pins (26.7-uat, owner-reported freeze): she
// reads AND types on the spread, so the chat surface rides the spread
// bar — add-details opens it in place (never a teleport back to the
// tiny spot), the send handler finds its input on whichever surface
// holds the session, and every turn repaint targets that same surface.
if (openSpreadFn.indexOf('sessionPaintChat') === -1 ||
    openSpreadFn.indexOf('spread-comments') === -1) {
  violations.push('[chat-spread] ' + APP + ': sessionOpenSpread must ' +
    'render the chat into the spread-comments region (scroll room under ' +
    'the essay — the thin ribbon strip clips it invisibly), replacing ' +
    'the reader notes UI on the not-yet-saved carrier');
}
if (functionBody('sessionSurface').indexOf('spread-overlay') === -1) {
  violations.push('[chat-spread] ' + APP + ': sessionSurface must return ' +
    'the whole spread overlay so the input is findable wherever it ' +
    'renders');
}
// The blessWalk-collision pins (26.7-uat, live-browser repro): opts.ribbon
// doubles as the blessing-walk MARKER in openSpread, so a session spread
// carrying a ribbon was tagged blessWalk and every session guard silently
// rejected it (add-details no-oped, send found no input, zero errors).
// The session spread carries its own explicit marker instead.
if (openSpreadFn.indexOf('session: true') === -1) {
  violations.push('[chat-spread] ' + APP + ': sessionOpenSpread must tag ' +
    'its spread with the explicit session marker (never mistaken for ' +
    'the blessing walk)');
}
if (!/blessWalk:\s*!!\(opts && opts\.ribbon && !opts\.session\)/
    .test(appSrc)) {
  violations.push('[chat-spread] ' + APP + ': openSpread blessWalk tag ' +
    'must exclude session spreads (opts.ribbon && !opts.session)');
}
['sessionSurface', 'sessionPaintSurface', 'sessionLeaveSpread']
  .forEach(function (fn) {
    if (functionBody(fn).indexOf('sessionSpread') === -1) {
      violations.push('[chat-spread] ' + APP + ': ' + fn + ' must key on ' +
        'the sessionSpread tag, not the blessWalk/id heuristic');
    }
  });
// pushView rebuilds stack entries field-by-field — the live-browser
// beacon showed the pushed entry carried NO sessionSpread at all, so
// every guard silently rejected the spread. The tag must ride the
// entry exactly as blessWalk and refill do.
if (functionBody('pushView').indexOf('sessionSpread') === -1) {
  violations.push('[chat-spread] ' + APP + ': pushView must carry the ' +
    'sessionSpread tag onto the stack entry (26.7-uat beacon finding)');
}
if (functionBody('sessionPaintPaths').indexOf('sessionPaintSurface') ===
    -1) {
  violations.push('[chat-spread] ' + APP + ': the add-details handler ' +
    'must repaint through sessionPaintSurface (chat opens in place)');
}
['sessionChatSend', 'sessionReturnToInput'].forEach(function (fn) {
  if (functionBody(fn).indexOf('sessionSurface(') === -1) {
    violations.push('[chat-spread] ' + APP + ': ' + fn + ' must find ' +
      'the chat input via sessionSurface (spot OR spread bar)');
  }
});
['sessionFetchDraft', 'sessionResync', 'sessionChatSend']
  .forEach(function (fn) {
    if (functionBody(fn).indexOf('sessionPaintSurface') === -1) {
      violations.push('[chat-spread] ' + APP + ': ' + fn + ' must ' +
        'repaint through sessionPaintSurface — a turn run from the ' +
        'spread must land back on the spread');
    }
  });
// The sticky-subject pin (26.7-uat, owner-directed): the essay's own
// heading stays visible while the paper scrolls.
if (!/\.session-paper[^{]*h2[^{]*\{[^}]*position:\s*sticky/.test(
    fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8'))) {
  violations.push('[sticky] tokens.css: the session paper heading must ' +
    'be position: sticky within the scroll region (26.7-uat)');
}

// The fade-once pin (26.7-uat, owner-reported blink): the paragraph
// fade choreography runs ONCE per draft — a repaint of an already-shown
// draft renders the paragraphs settled (no replayed fade, no blink);
// only a genuinely revised draft fades again (the D-01 revision cue).
const revealFn = functionBody('sessionPaintReveal');
if (revealFn.indexOf('revealedFor') === -1) {
  violations.push('[fade] ' + APP + ': sessionPaintReveal must track the ' +
    'already-revealed draft (revealedFor) so repaints never replay the ' +
    'fade (26.7-uat blink)');
}

// The full-read-reachable + weave-visible pins (26.7-uat, owner):
// at the little desk paper the full spread stays ONE tap away even
// when the chat holds the scroll, and a woven turn scrolls the revised
// paper back into view (D-01 "visibly revises" must be SEEN).
if (functionBody('sessionPaintReadWhole').indexOf('session-path-whole')
    === -1 ||
    functionBody('sessionPaintReveal').indexOf('sessionPaintReadWhole')
    === -1) {
  violations.push('[whole] ' + APP + ': the read-it-whole affordance ' +
    'must render at the spot via sessionPaintReadWhole (outside the ' +
    'D-28 three-path row) (26.7-uat)');
}
if (functionBody('sessionFetchDraft').indexOf('scrollTop') === -1) {
  violations.push('[whole] ' + APP + ': sessionFetchDraft must bring ' +
    'the revised paper into view after a woven turn (26.7-uat)');
}

// The status-before-gate pins (26.7-uat, beat-1 finding): the session
// gate reads LIBRARIAN.status synchronously at tap time, so the room
// MUST learn the status on landing — the parked connection engine
// (26.4-09) may never stand between the room and that read. Without
// these pins a fresh room load leaves status null and every candle tap
// silently downgrades to the bare 26.65 re-pull (the flash-and-vanish).
const candleState = functionBody('refreshCandleState');
const statusFetchAt = candleState.indexOf('/api/librarian/status');
const engineGateAt = candleState.indexOf('CONNECTION_ENGINE_ENABLED');
if (statusFetchAt === -1) {
  violations.push('[status] ' + APP + ': refreshCandleState must fetch ' +
    '/api/librarian/status (the room\'s landing read)');
} else if (engineGateAt !== -1 && statusFetchAt > engineGateAt) {
  violations.push('[status] ' + APP + ': refreshCandleState must fetch ' +
    '/api/librarian/status BEFORE the CONNECTION_ENGINE_ENABLED gate — ' +
    'the parked engine must never block the status read (26.7-uat)');
}
const startBody = functionBody('startReflectionSession');
if (startBody.indexOf('LIBRARIAN.status === null') === -1 ||
    startBody.indexOf('/api/librarian/status') === -1) {
  violations.push('[status] ' + APP + ': startReflectionSession must ' +
    'handle a null LIBRARIAN.status with one status fetch + re-entry — ' +
    'a tap that outraces the landing read must never silently downgrade ' +
    'to the bare re-pull (26.7-uat)');
}

// ---- 7. 26.8-01: the blessing walk stage (D-01/D-02/D-06..D-08) --------------
//
// The walk OPENS the session's judgment arc: a client beat between the
// re-pull and the consent card. These pins hold the latch discipline
// (walkDone gates the ONE POST), the fail-open rules (read miss /
// nothing-to-offer / skip door / resume all resolve the stage), the
// chassis re-host, and the pinned bookend copy.
//
// ⚠ RE-POINTED BY 26.95-32 (D-08 / D-03), AND EVERY MOVED PIN SAYS SO AT
// ITS OWN SITE. Three claims that stood here at 26.8-01 no longer do, and
// they are corrected rather than quietly dropped:
//   · "zero-AI by construction" — the door this beat announces opens the
//     Offer, and an Offer is computed with the librarian's help. The stage
//     itself still reads nothing but the store, and the probe below it is
//     pure and silent; the reach is one level down, on her tap. The (f)
//     scan still passes and that is a fact about the instrument, not
//     evidence of zero AI. app.js says the same thing at the same seam.
//   · "the shipped desk-stack loop presents the cards; blessBatch caps the
//     sitting" — the walk no longer deals blessing cards at all. It opens
//     the Offer through the ONE shared door entry. The RULE is unchanged:
//     re-host, never re-implement.
//   · "empty pool" — what the stage learns is now whether an Offer is
//     LIKELY, from a probe that spends nothing.
// ⛔ Nothing here was deleted to make a suite green. Each of the four moved
// assertions below is rewritten onto what the room does now, with the
// ruling named beside it so a later reader can check the move.

(function () {
  const stage = functionBody('sessionWalkStage');
  const skip = functionBody('sessionWalkSkip');
  const begin = functionBody('sessionWalkBegin');
  const close = functionBody('sessionWalkClose');
  const openPaint = functionBody('sessionPaintWalkOpen');
  const closePaint = functionBody('sessionPaintWalkClose');
  const walkRegion = [stage, skip, begin, close, openPaint, closePaint]
    .join('\n');

  // (a0) REGION REALITY, ASSERTED BEFORE ANY PIN READS THESE SLICES
  // (26.95-32). Several gates below are NEGATIVES — a retired selector must
  // be ABSENT from the stage, the two painters must NOT name the boundary —
  // and a negative over an empty slice passes for the wrong reason.
  // functionBody() does report a missing symbol, but it then returns '' and
  // every negative would go quietly green behind that one line. So each
  // slice is checked here for being real: present, beginning at its own
  // declaration, and spanning more than one line.
  [['sessionWalkStage', stage], ['sessionWalkSkip', skip],
   ['sessionWalkBegin', begin], ['sessionWalkClose', close],
   ['sessionPaintWalkOpen', openPaint],
   ['sessionPaintWalkClose', closePaint]].forEach(function (pair) {
    const body = pair[1];
    if (body.indexOf('function ' + pair[0] + '(') !== 0 ||
        body.split('\n').length < 2) {
      violations.push('[walk] ' + APP + ': the ' + pair[0] + ' slice is ' +
        'not a real region — it must begin at its own declaration and span ' +
        'more than one line. Every negative gate below would otherwise ' +
        'pass vacuously over it');
    }
  });

  // (a) the latch gates the ONE POST — after the repullDone guard,
  // before the posted flip; the guard line launches the stage so the
  // gate can never wedge on beat ordering.
  const poster28 = functionBody('sessionMaybePost');
  const repullGuardAt = poster28.indexOf(
    'if (!SESSION.repullDone) { return; }');
  const walkGuardAt = poster28.indexOf(
    'if (!SESSION.walkDone) { sessionWalkStage(); return; }');
  const postedAt = poster28.indexOf('SESSION.posted = true;');
  if (walkGuardAt === -1) {
    violations.push('[walk] ' + APP + ': sessionMaybePost must gate on ' +
      'SESSION.walkDone (launch + return) — the walk resolves before ' +
      'the ONE POST may fire (D-01)');
  } else if (!(repullGuardAt < walkGuardAt && walkGuardAt < postedAt)) {
    violations.push('[walk] ' + APP + ': the walkDone guard must sit ' +
      'after the repullDone guard and before the posted flip');
  }
  // (b) the re-pull seam hands off to the walk stage.
  if (functionBody('sessionRepullFinished')
    .indexOf('sessionWalkStage();') === -1) {
    violations.push('[walk] ' + APP + ': sessionRepullFinished must hand ' +
      'off to sessionWalkStage (the walk follows the re-pull, D-01)');
  }
  // (c) reset block carries the walk flags.
  const opener28 = functionBody('startReflectionSession');
  ['SESSION.walkDone = false;', 'SESSION.walkActive = false;',
    'SESSION.walkSpread = false;', 'SESSION.walkBlessed = [];']
    .forEach(function (reset) {
      if (opener28.indexOf(reset) === -1) {
        violations.push('[walk] ' + APP + ": the session reset block " +
          "must carry '" + reset + "'");
      }
    });
  if (stateSlice.indexOf('walkDone') === -1 ||
      stateSlice.indexOf('walkBlessed') === -1) {
    violations.push('[walk] ' + APP + ': the SESSION state block must ' +
      'declare the walk slice (walkDone, walkBlessed)');
  }
  // (d) resume skips the walk — the door opens the latch, and the
  // stage's own resume check precedes the items read.
  if (functionBody('sessionOfferResume')
    .indexOf('SESSION.walkDone = true;') === -1) {
    violations.push('[walk] ' + APP + ': sessionOfferResume must open ' +
      'the walk latch — a resumed session skips the walk (frozen pool, ' +
      '26.7-05)');
  }
  const heldAt = stage.indexOf("SESSION.heldIntent === 'resume'");
  const fetchAt = stage.indexOf("apiGet('/api/items')");
  if (heldAt === -1 || fetchAt === -1 || heldAt > fetchAt) {
    violations.push('[walk] ' + APP + ': sessionWalkStage must check the ' +
      'resume intent BEFORE the items read — no walk chrome paints on ' +
      'the resume path');
  }
  // (e) fail-open rules (T-26.8-04): read miss, NOTHING TO OFFER, and the
  // catch all resolve through the silent skip; the skip opens the
  // latch, proceeds, and paints no chrome of its own.
  //
  // ⚠ 26.95-32 (D-08) MOVED THE MIDDLE ARM, and it is RE-POINTED here rather
  // than dropped. The subject is unchanged and is the reason this pin
  // exists: the latch must never wedge the session, whatever the stage
  // learns. What changed is only how the stage learns there is nothing to
  // walk her through — it used to read a list of ids and skip on
  // `!ids.length`, and it now asks the pure, silent probe whether an Offer
  // is likely and skips on `!likely`. The read-miss arm and the transport
  // catch are byte-identical to what shipped.
  [['if (!res.ok) { sessionWalkSkip(); return; }', 'read miss'],
   ['if (!likely) { sessionWalkSkip(); return; }', 'nothing to offer']]
    .forEach(function (arm) {
      if (stage.indexOf(arm[0]) === -1) {
        violations.push('[walk] ' + APP + ': sessionWalkStage must resolve ' +
          'the ' + arm[1] + ' arm through sessionWalkSkip (the latch never ' +
          'wedges the session, 26.95-32 D-08) — missing: ' + arm[0]);
      }
    });
  const skipArms = (stage.match(/sessionWalkSkip\(\)/g) || []).length;
  if (skipArms < 3) {
    violations.push('[walk] ' + APP + ': sessionWalkStage must resolve read ' +
      'miss + nothing-to-offer + transport catch through sessionWalkSkip — ' +
      'found ' + skipArms + ' call sites, expected at least 3');
  }
  if (skip.indexOf('SESSION.walkDone = true;') === -1 ||
      skip.indexOf('sessionMaybePost();') === -1 ||
      skip.indexOf('innerHTML') !== -1) {
    violations.push('[walk] ' + APP + ': sessionWalkSkip must open the ' +
      'latch, proceed to the gate, and render nothing (silence, law 3)');
  }
  // (f) zero AI reachable from the walk (D-07): no librarian route, no
  // job state, no POST of any kind in the walk functions.
  ['/api/librarian', 'LIBRARIAN_JOB', 'apiPost('].forEach(function (tok) {
    if (walkRegion.indexOf(tok) !== -1) {
      violations.push('[walk] ' + APP + ": the walk functions must never " +
        "reach '" + tok + "' — the walk is zero-AI by construction " +
        '(D-07); verdicts persist through the shipped handler alone');
    }
  });
  // (g) THE POOL STILL HAS EXACTLY ONE SOURCE, AND 26.95-32 (D-08) CHANGED
  // WHICH ONE. The stage used to select the walk's own list through
  // StudyCore.pickWalkArrivals with a boundaryMs. That selector was retired
  // ON PURPOSE and nothing was deleted: its pure core stays in core.js and
  // on the export table, and tests/test_surface_wiring.cjs holds both halves
  // (off the GATED_SELECTORS roster, zero StudyCore. call sites in app.js).
  // The stage now decides with the pure, silent probe StudyCore.offerLikely
  // — it settles only whether there is a door worth announcing, and the
  // reach itself happens on her tap, through the ONE shared door entry, so
  // no door computes a reach of its own (P-8, G-8).
  // ⛔ REWRITTEN, NEVER DROPPED: the subject is unchanged — one source for
  // what the walk may put in front of her, and no second computation here.
  if (stage.indexOf('StudyCore.offerLikely(') === -1) {
    violations.push('[walk] ' + APP + ': sessionWalkStage must decide ' +
      'through the silent probe StudyCore.offerLikely — the one source for ' +
      'whether the walk has anything to announce (26.95-32, D-08)');
  }
  // ...and the probe reads the store's items THROUGH the store's own
  // filters, never a bare pool: a presence rule run over unfiltered items
  // would weigh material the fence holds back (law 5), on a path that runs
  // with no tap at all. ⚠ PINNED AS THE CALL'S OWN HEAD, not as the bare
  // token 'SHELF.filters' — that token also appears on the assignment line
  // a few lines above, so a bare-token pin would have stayed green while
  // the probe was handed an empty array. Brittle to a reformat of this one
  // call, and deliberately so: reformatting it is a deliberate edit.
  if (stage.indexOf('StudyCore.offerLikely(BLESS.items, SHELF.filters,') ===
      -1) {
    violations.push('[walk] ' + APP + ': sessionWalkStage must hand the ' +
      "store's items and the store's own filters to the probe — an " +
      'unfiltered pool would weigh material the fence holds back (law 5). ' +
      "Expected the call head: StudyCore.offerLikely(BLESS.items, " +
      'SHELF.filters,');
  }
  // ...and the retired selector must be ABSENT from the stage, not merely
  // unused. ⚠ This half exists because a positive pin alone is vacuous: a
  // restored call BESIDE the new one would leave the pin above green while
  // two sources decided the same question.
  if (stage.indexOf('StudyCore.pickWalkArrivals(') !== -1) {
    violations.push('[walk] ' + APP + ': sessionWalkStage must not reach ' +
      'the retired StudyCore.pickWalkArrivals selector beside the probe — ' +
      'two pool sources is exactly the drift this half catches (D-08)');
  }
  // THE BOUNDARY'S SUBJECT CHANGED DAY (26.95-32, D-03), AND THAT IS THIS
  // PIN GOING GREEN ON A NEW SUBJECT RATHER THAN A PIN BEING RELAXED. It
  // used to read the marker the librarian writes when it FINISHES A
  // REFLECTION; it now reads the marker the room writes when SHE OPENS IT,
  // because the reach and the date it reaches from must not be measured off
  // two different days. The guard and the fallback are byte-identical to
  // what shipped, and tests/test_surface_wiring.cjs §14(D) pins the new
  // subject from the other side.
  [['var marker = meta.last_visit_ms;', 'the visit marker (D-03)'],
   ["typeof marker === 'number' && isFinite(marker)", 'the shipped guard'],
   ['Date.now() - WALK_FIRST_WINDOW_MS', 'the mirrored first-session window']]
    .forEach(function (pair) {
      if (stage.indexOf(pair[0]) === -1) {
        violations.push('[walk] ' + APP + ': the walk boundary must carry ' +
          pair[1] + ' — missing: ' + pair[0]);
      }
    });
  // ...and it must be measured from ONE day only: the reflection marker is
  // a FACT about which day was read, not copy, so its return to this stage
  // is forbidden outright rather than merely recorded (D-03).
  if (stage.indexOf('last_reflection_ms') !== -1) {
    violations.push('[walk] ' + APP + ': sessionWalkStage must not read ' +
      'meta.last_reflection_ms — the reach and its date would again be ' +
      'measured off two different days (D-03)');
  }
  // ... and the boundary is machinery, never chrome: the two painters
  // must not touch it (law 3 — never rendered as a date or a gap). The
  // retired marker stays on this list beside the live one: neither may
  // ever surface as a date or a gap, whichever one the stage reads.
  ['last_visit_ms', 'last_reflection_ms', 'WALK_FIRST_WINDOW_MS']
    .forEach(function (tok) {
      if (openPaint.indexOf(tok) !== -1 || closePaint.indexOf(tok) !== -1) {
        violations.push('[walk] ' + APP + ": the walk painters must never " +
          "reference '" + tok + "' — the boundary is consumed silently, " +
          'never rendered (law 3)');
      }
    });
  // (h) THE CHASSIS RE-HOST (D-08) — SAME RULE, NEW HOST. The begin door
  // used to cap the sitting through blessBatch and enter the shipped
  // desk-stack loop. 26.95-32 re-pointed it: the walk no longer deals
  // blessing cards at all, so it opens THE OFFER through the one entry all
  // three doors tap, `reachDoorOpen(doorName, onNoOffer)`, with the walk's
  // OWN named quiet branch — the three doors genuinely differ, and the walk
  // is the one that must resolve its latch and move the session on (W-8).
  // ⛔ THE RULE BEING PINNED DID NOT CHANGE, and it is the reason this is a
  // rewrite and not a deletion: RE-HOST, NEVER RE-IMPLEMENT. The door builds
  // no card chrome of its own — no sink of any kind lives in it — and the
  // shipped verdict functions stay byte-clean of walk state.
  if (begin.indexOf("reachDoorOpen('walk', sessionWalkSkip)") === -1) {
    violations.push('[walk] ' + APP + ': sessionWalkBegin must open the ' +
      "Offer through the one shared entry — reachDoorOpen('walk', " +
      'sessionWalkSkip) — carrying the walk\'s own named quiet branch ' +
      '(26.95-32, D-08 / W-8)');
  }
  if (begin.indexOf('innerHTML') !== -1) {
    violations.push('[walk] ' + APP + ': sessionWalkBegin must build no ' +
      'chrome of its own (re-host, never re-implement) — an innerHTML sink ' +
      'is the walk starting to draw the page it was given');
  }
  ['handleBlessingTap', 'renderBlessingRibbon'].forEach(function (name) {
    if (functionBody(name).indexOf('SESSION.walk') !== -1) {
      violations.push('[walk] ' + APP + ': ' + name + ' must stay ' +
        'byte-clean of walk state — one verdict grammar app-wide (D-08)');
    }
  });
  // (i) the view dispatch carries both bookends.
  const spotPaint = functionBody('sessionPaintSpot');
  if (spotPaint.indexOf("SESSION.view === 'walk'") === -1 ||
      spotPaint.indexOf("SESSION.view === 'walkClose'") === -1) {
    violations.push('[walk] ' + APP + ': sessionPaintSpot must dispatch ' +
      "the 'walk' and 'walkClose' views (the two bookends)");
  }
  // (k-a) THE WALK'S TWO MOVED SENTENCES — RE-POINTED BY 26.95-32 (D-08),
  // RECORDED, NOT DELETED. The shipped count moment stays in (k) below,
  // unchanged; this block holds only the two that moved. It copies, in
  // shape and in wording, the precedent the wave-3 gap closure set in
  // tests/test_no_push.cjs (its [walk-copy] block) — the two rosters must
  // say the same thing about the same two sentences.
  //
  //   RETIRED FROM THIS ROSTER, recorded here rather than dropped:
  //     'some new things arrived. look through them — say how each one
  //      lands.' — the open bookend. The walk used to deal things that had
  //      just arrived; it now reaches BACK through something she blessed,
  //      so nothing arrives on this path (D-02) and the sentence has no
  //      path left on which it could be true.
  //     'straight to the reflection' — the quiet door. It named the walk's
  //      old destination, and the walk no longer goes there first.
  //
  //   ⛔ NEITHER IS BANNED, AND THAT ASYMMETRY IS DELIBERATE. A retired
  //   sentence is banned in this tree when it is FALSE ABOUT A FACT and
  //   must not creep back. These two are not that: they are COPY, and the
  //   OWNER'S SINGLE PASS OWNS THEM. A ban authored by an agent over words
  //   she has not ruled on would be this suite making a wording decision —
  //   the exact thing the pins below exist to prevent.
  //
  // ⚠⚠ THE TWO REPLACEMENTS ARE PROVISIONAL, AND THIS PIN SAYS SO RATHER
  // THAN PRETENDING OTHERWISE. They are candidates in the phase's copy
  // register, 26.95-COPY.md — row C-2 (the walk's open bookend) and row
  // C-6 (the walk's quiet door) — copied verbatim from that phase's UI-SPEC
  // and standing in so the code runs. `copy_approved: false` is the gate in
  // that file and it is still false.
  //   ⛔ An agent may not reword them. That is this pin.
  //   ⛔ An agent may not mark them settled either. WHEN THE OWNER'S ONE
  //      COPY PASS LANDS AND `copy_approved` BECOMES TRUE, THIS ROSTER
  //      MOVES TO HER SENTENCES AND THIS WHOLE WARNING COMES OUT WITH THEM.
  // Until that day a green run here means "no agent changed the
  // placeholder" — it never means "these are the words".
  //
  // ⚠ PINNED BY KEY *AND* AT THE RENDER SITE, because neither half is
  // enough alone: a loose substring pin passed tonight while the key had
  // been renamed and the room rendered `undefined`, and a declaration pin
  // on its own cannot tell a rendered constant from an orphaned one.
  // ✅ NO LONGER PROVISIONAL — 2026-08-17. Her copy pass ran, `copy_approved`
  // is `true`, and both strings below are HERS: C-2 chosen from candidates
  // offered to her, C-6 read to her and KEPT. ⚠ THIS IS THE THIRD SUITE THAT
  // PINNED C-2 — test_no_push and test_surface_wiring hold it too — and all
  // three went red on the day her words landed, which is the pin working
  // rather than the pin being wrong.
  [['C-2', 'walkBookend',
    "walkBookend: 'something you brought back led here: a " +
    "few from the same weeks, other years.'"],
   ['C-6', 'walkQuiet', "walkQuiet: 'not today'"]]
    .forEach(function (row) {
      const n = countOf(appSrc, row[2]);
      if (n !== 1) {
        violations.push('[walk] ' + APP + ': the OWNER-WORDED walk string ' +
          'OFFER_COPY.' + row[1] + ' must be byte-present exactly once, ' +
          'key and value together — found ' + n + '. It is candidate ' +
          row[0] + ' in 26.95-COPY.md, which she ANSWERED on 2026-08-17 ' +
          'with copy_approved: true, so no agent may reword it. ' +
          'Expected, verbatim: ' + JSON.stringify(row[2]));
      }
      if (openPaint.indexOf('OFFER_COPY.' + row[1]) === -1) {
        violations.push('[walk] ' + APP + ': sessionPaintWalkOpen must ' +
          'render OFFER_COPY.' + row[1] + ' (candidate ' + row[0] + ') — a ' +
          'constant the painter never reads is a sentence the room does ' +
          'not say, and the declaration pin above would not notice');
      }
    });
  // (j) the close bookend: composes OVER the shipped thinking painter
  // (the consent block renders beneath), the count moment and pile hint
  // are conditional, and zero-blessed + zero-pile paints nothing extra.
  if (closePaint.indexOf('sessionPaintThinking(spot)') === -1 ||
      closePaint.indexOf('if (!lines.length) { return; }') === -1) {
    violations.push('[walk] ' + APP + ': sessionPaintWalkClose must ' +
      'compose over sessionPaintThinking and stay silent when nothing ' +
      'was blessed and the pile is empty');
  }
  // (k) the pinned walk copy — each string one contiguous literal, once.
  [['you welcomed 1 thing back.', 'count moment singular']]
    .forEach(function (pair) {
      if (countOf(appSrc, pair[0]) !== 1) {
        violations.push('[walk] ' + APP + ': the ' + pair[1] + ' line ' +
          "must be byte-present exactly once: '" + pair[0] + "'");
      }
    });
  ['look through them', 'you welcomed ', ' things back.'].forEach(function (frag) {
    if (appSrc.indexOf(frag) === -1) {
      violations.push('[walk] ' + APP + ": pinned walk copy fragment " +
        "missing: '" + frag + "'");
    }
  });
})();

// ---- 7. THE WALL-CLOCK BOUND, DRIVEN (Handoff §M6) --------------------------
//
// A source grep cannot tell a live bound from a dead one, and this
// project's own defect class is the vacuous instrument — so the REAL
// sessionBusyBegin / sessionBoundRelease / sessionTimedOut / sessionFlameSync
// source is lifted into a harness with a fake clock and actually run.
// Nothing here is asserted about the code; everything is asserted about
// what the code does when the clock moves.
(function () {
  const msMatch = /var SESSION_BOUND_MS = (\d+);/.exec(appSrc);
  if (!msMatch) {
    violations.push('[bound] ' + APP + ': SESSION_BOUND_MS is missing — ' +
      'the session has no wall-clock bound');
    return;
  }
  // Pinned BY VALUE: 45s is the Handoff §M6 number. Changing it is a
  // deliberate edit to this line, never a drift.
  if (Number(msMatch[1]) !== 45000) {
    violations.push('[bound] ' + APP + ': the session bound must be ' +
      '45000ms (Handoff §M6) — found ' + msMatch[1]);
  }
  const lineMatch = /var SESSION_BOUND_LINE = '([^']*)';/.exec(appSrc);
  if (!lineMatch) {
    violations.push('[bound] ' + APP + ': SESSION_BOUND_LINE is missing');
    return;
  }

  // ---- 26.98-05: THE TWO SPEAKING RUNGS BENEATH THE SHIPPED BOUND --------
  //
  // Handoff §M6: "Motion tells you that something is happening. Only words
  // tell you what." Two rungs shipped 2026-08-07 — the resting state and the
  // 45s bound above. These are the two that SPEAK, and they change NO motion:
  // a pulse that quickens reads as anxiety.
  //
  // ⛔ THE FIVE ANTI-VACUITY ANSWERS, written where the gate lives:
  //  1. IT CANNOT PASS BEFORE THE WORK. Nothing in app.js produced either
  //     line, so the 4000ms arm read zero lines where it needs exactly one.
  //     That red is recorded verbatim in 26.98-05-SUMMARY.md.
  //  2. IT CANNOT PASS AFTER A DELIBERATE BREAK. Every threshold is asserted
  //     as an off-by-one PAIR — one tick before, then one tick — so moving a
  //     threshold by a single millisecond fails. Driven, and recorded.
  //  3. A DEGENERATE IMPLEMENTATION IS CAUGHT. One that always shows both
  //     lines fails the zero-lines assertion at 3999ms, and again at 19999ms
  //     where exactly one line — not two — must stand.
  //  4. IT READS EVALUATION, NOT SOURCE. Every count below comes from
  //     running the real lifted functions against a moved clock.
  //  5. THE ONLY GREPS READ THE THREE THRESHOLD NUMBERS out of source and
  //     compare them to literals. That is a value pin, not a behaviour
  //     claim, and the behaviour is proven separately by driving.
  //
  // ⛔⛔ HER THREE SENTENCES ARE NOT IN YET. 26.98-05 Task 1 is an OPEN owner
  // decision as of 2026-08-24. While the slots hold the pending sentinel the
  // ladder is INERT AT THE SURFACE and arm (o) pins exactly that, driven on
  // the SHIPPED constants: every tick shows zero lines and the ladder writes
  // no field at all. The machinery is proven on FIXTURE sentences the harness
  // supplies — sentences that are obviously not copy and that no surface can
  // ever reach — so nothing an agent wrote is ever one keystroke from her.
  function waitNum(name, expected) {
    const m = new RegExp('var ' + name + ' = (\\d+);').exec(appSrc);
    if (!m) {
      violations.push('[wait] ' + APP + ': ' + name + ' is missing — the ' +
        'wait ladder has no ' + expected + 'ms rung');
      return expected;
    }
    if (Number(m[1]) !== expected) {
      violations.push('[wait] ' + APP + ': ' + name + ' must be ' + expected +
        'ms (Handoff §M6) — found ' + m[1]);
    }
    return Number(m[1]);
  }
  const WAIT_NAME_MS = waitNum('SESSION_WAIT_NAME_MS', 4000);
  const WAIT_LEAVE_MS = waitNum('SESSION_WAIT_LEAVE_MS', 20000);
  const MIN_VISIBLE_MS = waitNum('SESSION_MIN_VISIBLE_MS', 600);

  // ⛔ THE ROSTER GATE — the same shape that already guards her W-3 sentence.
  // A copy slot may hold EXACTLY ONE of two things: the pending sentinel, or
  // a string literal that ALSO appears in HER_RULED_WAIT_LINES. An agent
  // therefore cannot ship a sentence without editing the roster in the same
  // commit, and the roster may only ever be edited out of HER recorded words.
  // ⚠ A placeholder that reads like copy is caught by this too — that is the
  // whole point of it, and it is why the sentinel is unmistakably not a
  // sentence.
  const pendM = /var SESSION_WAIT_COPY_PENDING = '([^']*)';/.exec(appSrc);
  if (!pendM) {
    violations.push('[wait] ' + APP + ': SESSION_WAIT_COPY_PENDING is ' +
      'missing — the empty-slot sentinel is what keeps an agent-authored ' +
      'sentence out of the room while her words are pending');
  }
  const PENDING = pendM ? pendM[1] : '<<owner-copy-pending-26.98-05>>';
  const rosterM = /var HER_RULED_WAIT_LINES = \[([\s\S]*?)\];/.exec(appSrc);
  if (!rosterM) {
    violations.push('[wait] ' + APP + ': HER_RULED_WAIT_LINES is missing — ' +
      'the roster is the gate that keeps the wording HERS');
  }
  const roster = rosterM ? rosterM[1] : '';
  const COPY_SLOTS = ['SESSION_WAIT_NAME_LINE', 'SESSION_WAIT_LEAVE_LINE',
    'SESSION_WAIT_PERMISSION_LINE'];
  function shippedSlot(name) {
    const m = new RegExp('var ' + name + ' = ([^\\n]+);').exec(appSrc);
    if (!m) {
      violations.push('[wait] ' + APP + ': ' + name + ' is missing');
      return null;
    }
    const rhs = m[1].trim();
    if (rhs === 'SESSION_WAIT_COPY_PENDING') { return PENDING; }
    if (roster.indexOf(rhs) === -1) {
      violations.push('[wait] ' + APP + ': ' + name + ' holds a sentence ' +
        'that is NOT in HER_RULED_WAIT_LINES — front-facing wording is ' +
        'HERS and an agent may never choose it (26.98-05 project law)');
    }
    const lit = /^'((?:[^'\\]|\\.)*)'$/.exec(rhs) ||
      /^"((?:[^"\\]|\\.)*)"$/.exec(rhs);
    return lit ? lit[1] : rhs;
  }
  const SHIPPED_COPY = COPY_SLOTS.map(shippedSlot);
  // True once she has ruled and her words are in the slots.
  const HER_WORDS_IN = SHIPPED_COPY[0] !== null && SHIPPED_COPY[0] !== PENDING;

  // ⛔⛔ HER THREE SENTENCES, PINNED BY VALUE. SET A, chosen by her on
  // 2026-08-24 from three offered sets plus the option of writing her own.
  //
  // ⛔ THE LITERALS BELOW ARE THE PIN, and they are deliberately written out
  // HERE BY HAND rather than lifted from app.js: a gate that lifts the
  // sentence it is checking compares a string with itself and passes through
  // any reword. That is this repo's own recorded defect class and this gate
  // refuses to repeat it. The roster in app.js is the FRICTION gate — it
  // makes changing a slot a two-place edit — and this is the VALUE gate.
  //
  // ⛔ THE LOWERCASE AND THE TRAILING FULL STOPS ARE HERS, exactly as she
  // read and chose them. The permission line is ONE sentence with no line
  // break (it was wrapped in the table she read, for column width only) and
  // its dash is an EM-DASH, not a hyphen.
  const HER_WAIT_SENTENCES = [
    'still reading.',
    'this one is taking a while.',
    'leave it for now. whatever arrives will still be here.'
  ];
  if (HER_WORDS_IN) {
    COPY_SLOTS.forEach(function (slot, i) {
      if (SHIPPED_COPY[i] !== HER_WAIT_SENTENCES[i]) {
        violations.push('[wait] ' + APP + ': ' + slot + ' is not HER ' +
          'sentence. She said ' + JSON.stringify(HER_WAIT_SENTENCES[i]) +
          ' and app.js carries ' + JSON.stringify(SHIPPED_COPY[i]) + '. ' +
          'Front-facing wording is HERS: no agent may edit, smooth, ' +
          'sentence-case or repunctuate it. If a gate objects to the ' +
          'casing, that gate is wrong about this string.');
      }
    });
  }

  // ⛔⛔ T-26.98-27 — ANSWERED AND REFUSED BY HER, 2026-08-24. NOT deferred,
  // not open, not parked: she was asked whether the four-second line should
  // name the actual work — warmer, and the shape the handoff describes — and
  // was told plainly that it could put the title of one of her notes on
  // screen where none appears today. Her answer, verbatim:
  //     "Same line every time"
  //
  // So the naming shape from candidate set B IS DEAD. Not a hook, not a
  // TODO, not a later phase. This half of the gate pins that every slot is
  // ONE contiguous string literal with no substitution point at all; the
  // DRIVEN half is arm (r) below, which puts a title in the room's reach and
  // asserts none of it lands on a wait line.
  COPY_SLOTS.forEach(function (slot) {
    const m = new RegExp('var ' + slot + ' = ([^\\n]+);').exec(appSrc);
    if (!m) { return; }
    const rhs = m[1].trim();
    if (rhs === 'SESSION_WAIT_COPY_PENDING') { return; }
    if (!/^'(?:[^'\\]|\\.)*'$/.test(rhs) &&
      !/^"(?:[^"\\]|\\.)*"$/.test(rhs)) {
      violations.push('[wait] ' + APP + ': ' + slot + ' is not a single ' +
        'contiguous string literal — a concatenation or a template is a ' +
        'substitution point, and she REFUSED the naming-the-work shape on ' +
        '2026-08-24 (`Same line every time`). Found: ' + rhs);
      return;
    }
    if (/[{}]/.test(rhs)) {
      violations.push('[wait] ' + APP + ': ' + slot + ' carries a {token} ' +
        'placeholder. She refused the naming-the-work shape on 2026-08-24 ' +
        '(`Same line every time`), and a waiting message must not carry a ' +
        'note title (T-26.98-27, refused). Found: ' + rhs);
    }
  });

  function harness(opts) {
    const S = {
      now: 0, timers: [], nextId: 1, cleared: 0,
      quiet: [], turn: [], close: [], probed: 0, classes: [], wrote: []
    };
    const api = new Function('S', 'BOUND_MS', 'BOUND_LINE', 'W', `
      // 26.98-05: SESSION is wrapped in a WRITE RECORDER so SC-4's
      // no-motion-changed half can be an EQUALITY over what the ladder
      // actually wrote, rather than a negative search over a 1.09 MB file —
      // which is exactly where this project's bugs hide inside the
      // measuring instrument, and which any rename satisfies.
      var SESSION = new Proxy({ busy: false, view: 'idle', stage: null,
        turnText: null, draft: null,
        waitLines: [], busyShownAt: null, busyHeld: false }, {
        set: function (t, k, v) { S.wrote.push(k); t[k] = v; return true; }
      });
      var SESSION_BOUND_MS = BOUND_MS;
      var SESSION_BOUND_LINE = BOUND_LINE;
      var SESSION_BOUND = null;
      var SESSION_RUN = 0;
      var THINKING_FLAME = { probed: false, strip: false };
      // 26.98-05: the WALL clock the 600ms floor reads, faked here so the
      // floor is DRIVEN rather than described. A var declaration here
      // shadows the global Date for every lifted function in this sandbox.
      var Date = { now: function () { return S.now; } };
      var SESSION_WAIT_NAME_MS = W.nameMs;
      var SESSION_WAIT_LEAVE_MS = W.leaveMs;
      var SESSION_MIN_VISIBLE_MS = W.minMs;
      var SESSION_WAIT_COPY_PENDING = W.pending;
      var SESSION_WAIT_NAME_LINE = W.nameLine;
      var SESSION_WAIT_LEAVE_LINE = W.leaveLine;
      var SESSION_WAIT_PERMISSION_LINE = W.permLine;
      var SESSION_WAIT_TIMERS = [];
      // The fake clock. clearTimeout is switchable so the epoch check can
      // be exercised on its own, with the hygiene release defeated.
      function setTimeout(fn, ms) {
        var id = S.nextId++;
        S.timers.push({ id: id, at: S.now + ms, fn: fn });
        return id;
      }
      function clearTimeout(id) {
        S.cleared++;
        if (S.noClear) { return; }
        S.timers = S.timers.filter(function (t) { return t.id !== id; });
      }
      function sessionQuietEnd(line) {
        S.quiet.push(line); SESSION.view = 'error'; SESSION.busy = false;
      }
      function sessionTurnFailed(line) {
        S.turn.push(line); SESSION.turnText = null; SESSION.busy = false;
      }
      function sessionCloseFailed(line) {
        S.close.push(line); SESSION.busy = false;
      }
      function sessionProbeThinkingStrip() { S.probed++; }
      function $() { return null; }
      var document = { querySelector: function () { return null; } };
      // 26.995-22: sessionTimedOut now tests the waiting-for-her route
      // FIRST, so its two helpers and the slot they read come with it.
      // This harness's SESSION carries no consent key at all, so
      // sessionConsentCardShowing is false throughout and every arm below
      // reaches exactly the branch it reached before. The waiting route is
      // driven in section 7b, on a SESSION shaped for it.
      var SESSION_WAITED_LINE = null;
      // 26.998 U-5: the opening stretch now has HER OWN third sentence
      // (§ B-26 closed). This harness drives the other branches, so it is
      // null here and every arm below reaches the branch it reached before.
      // 26.998 U-5: a SENTINEL, not null — the arm asserts the opening
      // stretch ends through THIS constant, so reusing her waiting line or
      // the blaming line there is caught rather than merely "not the bound
      // line". ⛔ Reusing her waiting line here is the SECOND falsehood
      // § B-26 refused, and a mutant that does it survived until this.
      var SESSION_OPENING_WAITED_LINE = '<<opening-stretch-sentinel>>';
      // 26.995-28: the walk's own ending comes with sessionTimedOut too.
      // This harness's SESSION carries no walk flags at all, so
      // sessionWaitingInHerWalk is false throughout and every arm below
      // reaches exactly the branch it reached before. The walk route is
      // driven in section 7b, on a SESSION shaped for it.
      var SESSION_WALK_WAITED_LINE = null;
      function sessionPaintSpot() { S.paints = (S.paints || 0) + 1; }
      ${functionBody('sessionBoundRelease')}
      ${functionBody('sessionBusyBegin')}
      // 26.998 U-3: sessionTimedOut now asks whether the run still deserves
      // time before it ends anything, so its predicate comes with it.
      ${functionBody('sessionBoundStillEarning')}
      ${functionBody('sessionTimedOut')}
      ${functionBody('sessionConsentCardShowing')}
      // 26.998-04: the reach question is a THIRD moment the room is asking
      // her, so sessionWaitingOnHerAnswer reads it too and it comes along
      // here. This harness's SESSION carries no reach key, so
      // sessionReachShowing is false throughout and every arm below reaches
      // exactly the branch it reached before.
      ${functionBody('sessionReachShowing')}
      ${functionBody('sessionWaitingOnHerAnswer')}
      ${functionBody('sessionWaitedOnHer')}
      ${functionBodyOptional('sessionWaitingInHerWalk')}
      ${functionBodyOptional('sessionWaitedDuringWalk')}
      ${functionBody('sessionFlameSync')}
      // 26.98-05: the wait ladder and the finish floor. OPTIONAL slicing on
      // purpose — the RED run drove these arms against app.js BEFORE any of
      // these functions existed, and a slicer that pushes a violation for a
      // missing name would have buried the red it was there to report.
      ${functionBodyOptional('sessionWaitLine')}
      ${functionBodyOptional('sessionWaitSpeak')}
      ${functionBodyOptional('sessionWaitLadderArm')}
      ${functionBodyOptional('sessionWaitLadderRelease')}
      ${functionBodyOptional('sessionMinVisibleHeld')}
      ${functionBodyOptional('sessionMinVisibleSync')}
      return {
        S: SESSION,
        begin: sessionBusyBegin,
        flameSync: sessionFlameSync,
        armed: function () { return SESSION_BOUND !== null; },
        lines: function () { return (SESSION.waitLines || []).slice(); },
        held: function () {
          return typeof sessionMinVisibleHeld === 'function' ?
            sessionMinVisibleHeld() : null;
        },
        wrote: function () {
          var seen = [];
          for (var i = 0; i < S.wrote.length; i++) {
            if (seen.indexOf(S.wrote[i]) === -1) { seen.push(S.wrote[i]); }
          }
          return seen.sort().join(',');
        },
        resetWrote: function () { S.wrote = []; },
        tick: function (ms) {
          S.now += ms;
          var due = S.timers.filter(function (t) { return t.at <= S.now; });
          S.timers = S.timers.filter(function (t) { return t.at > S.now; });
          due.forEach(function (t) { t.fn(); });
        }
      };`)(S, Number(msMatch[1]), lineMatch[1], {
      nameMs: WAIT_NAME_MS, leaveMs: WAIT_LEAVE_MS, minMs: MIN_VISIBLE_MS,
      pending: PENDING,
      // ⛔ FIXTURES, NOT COPY. The default sentences below are deliberately
      // unmistakable as machine tokens: they prove the RUNGS while her real
      // sentences are still hers to give, and no surface can reach them.
      nameLine: (opts && opts.wait && 'nameLine' in opts.wait) ?
        opts.wait.nameLine : FIXTURE_NAME,
      leaveLine: (opts && opts.wait && 'leaveLine' in opts.wait) ?
        opts.wait.leaveLine : FIXTURE_LEAVE,
      permLine: (opts && opts.wait && 'permLine' in opts.wait) ?
        opts.wait.permLine : FIXTURE_PERM
    });
    api.state = S;
    if (opts && opts.noClear) { S.noClear = true; }
    return api;
  }
  const FIXTURE_NAME = '<<fixture-rung-4s>>';
  const FIXTURE_LEAVE = '<<fixture-rung-20s-honest>>';
  const FIXTURE_PERM = '<<fixture-rung-20s-permission>>';
  const LINE = lineMatch[1];
  function fail(msg) { violations.push('[bound] ' + APP + ': ' + msg); }

  // (a) A stuck thinking run is ended AT the bound and not one tick before.
  let h = harness();
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = 'reading…';
  h.tick(44999);
  if (h.state.quiet.length !== 0 || h.S.busy !== true) {
    fail('the bound fired early — a run must survive to 45000ms');
  }
  h.tick(1);
  if (h.state.quiet.length !== 1 || h.state.quiet[0] !== LINE) {
    fail('a stuck thinking run is not ended at the bound (quiet line ' +
      'count ' + h.state.quiet.length + ')');
  }
  if (h.S.busy !== false) {
    fail('the bound left SESSION.busy true — the candle would keep ' +
      'concentrating, which is the whole defect being closed');
  }

  // (b) The candle is DERIVED back to rest: once the flag is down,
  //     sessionFlameSync's own `on` is false, so neither class can stick.
  h.flameSync();
  if (h.state.probed !== 0) {
    fail('the flame probed a thinking strip after the bound expired');
  }

  // (c) Partial output is kept, never rolled back: a turn in flight ends
  //     the TURN, and the draft that already arrived stays on the paper.
  h = harness();
  h.begin();
  h.S.view = 'reveal';
  h.S.draft = 'a paragraph that already arrived';
  h.S.turnText = 'her unsent words';
  h.tick(45000);
  if (h.state.turn.length !== 1 || h.state.turn[0] !== LINE) {
    fail('a turn in flight must end through sessionTurnFailed');
  }
  if (h.state.quiet.length !== 0 || h.state.close.length !== 0) {
    fail('a turn in flight must not take the quiet-end or close branch');
  }
  if (h.S.draft !== 'a paragraph that already arrived') {
    fail('the bound rolled back a draft — partial output must be KEPT');
  }

  // (d) A close in flight keeps the paper and leaves her tap free.
  h = harness();
  h.begin();
  h.S.view = 'reveal';
  h.S.draft = 'the finished reflection';
  h.tick(45000);
  if (h.state.close.length !== 1 || h.state.close[0] !== LINE) {
    fail('a close in flight must end through sessionCloseFailed');
  }
  if (h.S.draft !== 'the finished reflection') {
    fail('the bound discarded a revealed draft on a close timeout');
  }

  // (e) THE EPOCH. With the hygiene release defeated (clearTimeout made a
  //     no-op — i.e. a clear site that forgot the guard), a guard armed
  //     for a finished run must be INERT: it may not end the run that
  //     came after it. This is why no clear site had to be touched.
  h = harness({ noClear: true });
  h.begin();                 // run 1
  h.tick(10000);
  h.S.busy = false;          // run 1 ends by hand, guard left armed
  h.tick(5000);
  h.begin();                 // run 2 begins 15s in
  h.S.view = 'thinking';
  h.tick(30000);             // run 1's guard is now due (45s from its arm)
  if (h.state.quiet.length !== 0) {
    fail("a stale guard ended a LATER run — the epoch check is not " +
      'holding, so the bound is unsafe at every clear site');
  }
  if (h.S.busy !== true) {
    fail('a stale guard cleared the busy flag of the run that followed it');
  }
  h.tick(15000);             // run 2's own bound, 45s from ITS arm
  if (h.state.quiet.length !== 1) {
    fail("run 2's own bound did not fire at its own 45s");
  }

  // (f) A guard whose run simply ended is inert too — no line, no state.
  h = harness({ noClear: true });
  h.begin();
  h.S.busy = false;
  h.tick(45000);
  if (h.state.quiet.length || h.state.turn.length || h.state.close.length) {
    fail('a guard fired after its run had already finished');
  }

  // (g) The derived release actually disarms, so the common path leaves
  //     no timer behind (hygiene, on top of the epoch's correctness).
  h = harness();
  h.begin();
  if (!h.armed()) { fail('sessionBusyBegin did not arm a bound at all'); }
  h.S.busy = false;
  h.flameSync();
  if (h.armed()) {
    fail('sessionFlameSync must release the bound once the flag is down');
  }

  // ==== 26.98-05: THE TWO SPEAKING RUNGS AND THE FINISH FLOOR, DRIVEN =====
  //
  // ⛔ EVERY COUNT BELOW IS AN EQUALITY AGAINST A LITERAL INTEGER. Not one
  // is a length-greater-than-zero test — the shipped bound above pins its
  // own constant as the literal 45000 for exactly this reason, and a
  // greater-than-zero count is how a degenerate ladder that always speaks
  // would pass.
  // ⛔⛔ THE ARMS BELOW TICK AGAINST HAND-WRITTEN LITERALS, NEVER AGAINST THE
  // NUMBER READ OUT OF SOURCE. ⚠ THIS WAS MEASURED, NOT REASONED: the first
  // off-by-one drive moved the 4s threshold to 4001 and ONLY the value pin
  // went red — every tick had shifted with the constant it was guarding, so
  // the whole driven half reported a clean pass over drifted behaviour. A
  // check derived from the thing it guards kills drift and then hides it.
  // The harness is handed the SOURCE numbers; the clock below is hand-written.
  const EXPECT_NAME_MS = 4000;
  const EXPECT_LEAVE_MS = 20000;
  const EXPECT_MIN_MS = 600;
  const EXPECT_BOUND_MS = 45000;
  function waitFail(msg) { violations.push('[wait] ' + APP + ': ' + msg); }

  // (h) 3999 → the room is silent. 4000 → exactly ONE line, and it is the
  //     four-second sentence. The off-by-one pair is the whole gate: a
  //     threshold moved by a single millisecond fails one half of it.
  h = harness();
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = 'reading…';
  h.tick(EXPECT_NAME_MS - 1);
  if (h.lines().length !== 0) {
    waitFail('a wait line appeared at ' + (EXPECT_NAME_MS - 1) + 'ms — the ' +
      'room must still be silent one tick before ' + EXPECT_NAME_MS + 'ms ' +
      '(line count ' + h.lines().length + ', expected 0)');
  }
  h.tick(1);
  if (h.lines().length !== 1) {
    waitFail('at ' + EXPECT_NAME_MS + 'ms the surface must carry exactly 1 ' +
      'wait line — it carries ' + h.lines().length + ': ' +
      JSON.stringify(h.lines()));
  } else if (h.lines()[0] !== FIXTURE_NAME) {
    waitFail('the ' + EXPECT_NAME_MS + 'ms rung spoke a line that is not the ' +
      'four-second sentence it was handed — got ' +
      JSON.stringify(h.lines()[0]));
  }

  // (i) 19999 → STILL exactly one, unchanged. 20000 → exactly TWO, and the
  //     four-second line is replaced rather than stacked under: at twenty
  //     seconds what she needs is the honest line and the permission, not a
  //     growing pile that reads as the room getting agitated.
  h.tick(EXPECT_LEAVE_MS - EXPECT_NAME_MS - 1);
  if (h.lines().length !== 1) {
    waitFail('at ' + (EXPECT_LEAVE_MS - 1) + 'ms the surface must still carry ' +
      'exactly 1 wait line — it carries ' + h.lines().length + ': ' +
      JSON.stringify(h.lines()));
  } else if (h.lines()[0] !== FIXTURE_NAME) {
    waitFail('the four-second line changed before ' + EXPECT_LEAVE_MS + 'ms');
  }
  h.tick(1);
  const at20 = h.lines();
  if (at20.length !== 2) {
    waitFail('at ' + EXPECT_LEAVE_MS + 'ms the surface must carry exactly 2 ' +
      'wait lines — it carries ' + at20.length + ': ' + JSON.stringify(at20));
  } else if (at20[0] !== FIXTURE_LEAVE || at20[1] !== FIXTURE_PERM) {
    waitFail('the ' + EXPECT_LEAVE_MS + 'ms rung must speak the honest line ' +
      'and then the permission line — got ' + JSON.stringify(at20));
  }

  // (j) 44999 → still exactly those two, and the shipped bound has NOT
  //     fired. The rungs are added BENEATH a bound that already works.
  h.tick(EXPECT_BOUND_MS - EXPECT_LEAVE_MS - 1);
  if (h.lines().length !== 2) {
    waitFail('at ' + (EXPECT_BOUND_MS - 1) + 'ms the two wait lines must still ' +
      'stand — found ' + h.lines().length);
  }
  if (h.state.quiet.length !== 0) {
    waitFail('the shipped 45s bound fired early once the rungs were added');
  }

  // (k) 45000 → the SHIPPED bound fires with its SHIPPED line, unchanged.
  h.tick(1);
  if (h.state.quiet.length !== 1 || h.state.quiet[0] !== LINE) {
    waitFail('the shipped bound no longer ends a stuck run at ' + EXPECT_BOUND_MS +
      'ms with its own shipped line (quiet count ' + h.state.quiet.length +
      ')');
  }

  // (l) THE 600ms FLOOR — a run that finishes at 50ms. Without this a result
  //     that arrives instantly reads as an error rather than as an answer.
  h = harness();
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = 'reading…';
  h.tick(50);
  h.S.busy = false;
  h.flameSync();
  if (h.held() !== true) {
    waitFail('a run that finished at 50ms did not hold the busy surface — ' +
      'held=' + JSON.stringify(h.held()) + ', expected true');
  }
  h.tick(EXPECT_MIN_MS - 50 - 1);
  if (h.held() !== true) {
    waitFail('the floor released at ' + (EXPECT_MIN_MS - 1) + 'ms — it must ' +
      'hold to ' + EXPECT_MIN_MS + 'ms exactly');
  }
  h.tick(1);
  if (h.held() !== false) {
    waitFail('the floor did not release at ' + EXPECT_MIN_MS + 'ms — ' +
      'held=' + JSON.stringify(h.held()) + ', expected false');
  }

  // (m) THE SAME FLOOR ON A 900ms RUN — it clears at 900, never at 1500. A
  //     minimum, never an added delay. Asserted SEPARATELY from (l) so a
  //     fixed 600ms delay cannot pass itself off as a floor.
  h = harness();
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = 'reading…';
  h.tick(900);
  h.S.busy = false;
  h.flameSync();
  if (h.held() !== false) {
    waitFail('a run that took 900ms was held past its own finish — the ' +
      EXPECT_MIN_MS + 'ms rule is a FLOOR, never an added delay');
  }

  // (n) A RUNG CANNOT OUTLIVE ITS OWN RUN. With the hygiene release defeated
  //     (clearTimeout made a no-op — a clear site that forgot the ladder),
  //     a rung armed for a finished run must be INERT. That is why no clear
  //     site had to be touched, and it is the same epoch the bound carries.
  h = harness({ noClear: true });
  h.begin();
  h.S.view = 'thinking';
  h.S.busy = false;
  h.tick(EXPECT_LEAVE_MS);
  if (h.lines().length !== 0) {
    waitFail('a wait rung spoke over a run that had already finished — the ' +
      'epoch check is not holding (line count ' + h.lines().length + ')');
  }

  // (o) ⛔⛔ WHAT SHIPS TODAY, DRIVEN ON THE SHIPPED CONSTANTS THEMSELVES.
  //     Not on fixtures — on whatever is actually in app.js right now.
  h = harness({ wait: { nameLine: SHIPPED_COPY[0],
    leaveLine: SHIPPED_COPY[1], permLine: SHIPPED_COPY[2] } });
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = 'reading…';
  h.tick(EXPECT_LEAVE_MS);
  if (!HER_WORDS_IN) {
    // Her words are not in yet. The room must say NOTHING rather than
    // something an agent wrote — a half-finished room is silent, and the
    // sentinel never reaches a surface.
    if (h.lines().length !== 0) {
      waitFail('a sentence reached the surface while HER three sentences ' +
        'are still pending — the ladder must be silent until she rules ' +
        '(got ' + JSON.stringify(h.lines()) + ')');
    }
  } else {
    // She has ruled. The shipped slots must now actually speak, driven.
    if (h.lines().length !== 2) {
      waitFail('her ruled sentences are in the slots but the ladder does ' +
        'not speak them — at ' + EXPECT_LEAVE_MS + 'ms the surface carries ' +
        h.lines().length + ' line(s), expected 2');
    }
  }

  // ==== SC-4's NO-MOTION-CHANGED HALF, DRIVEN (26.98-05 Task 3) ===========
  //
  // ⛔ AN EQUALITY, NOT A SEARCH. The obvious way to prove "no motion
  // property changed" is to grep the ladder for `animation`, `class`,
  // `keyframes` and friends — and a negative search over a 1.09 MB file is
  // exactly where this project's bugs hide INSIDE the measuring instrument.
  // It is satisfied by a rename, by an aliased property, by a class toggled
  // through a variable. So instead every write to SESSION is RECORDED as the
  // clock moves, and the recorded SET is compared to a literal. A ladder that
  // reached for a styling or animation field changes the set and fails, with
  // no pattern involved at all.
  //
  // ⛔ ASSERTED SEPARATELY AT EACH THRESHOLD. One combined assertion would
  // let a change at twenty seconds hide behind the four-second tick.
  const LADDER_MAY_WRITE = 'waitLines';

  // (p) at 4000ms exactly, the ladder wrote {waitLines} and nothing else.
  h = harness();
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = 'reading…';
  h.tick(EXPECT_NAME_MS - 1);
  h.resetWrote();
  h.tick(1);
  const wroteAt4 = h.wrote();
  if (wroteAt4 !== LADDER_MAY_WRITE) {
    waitFail('at the ' + EXPECT_NAME_MS + 'ms threshold the ladder wrote {' +
      wroteAt4 + '} — the ONLY field it may write is {' + LADDER_MAY_WRITE +
      '}. Motion must never change at a threshold: a pulse that quickens ' +
      'reads as anxiety (SC-4, Handoff §M6)');
  }

  // (q) at 20000ms exactly, the same — separately, on its own tick.
  h.tick(EXPECT_LEAVE_MS - EXPECT_NAME_MS - 1);
  h.resetWrote();
  h.tick(1);
  const wroteAt20 = h.wrote();
  if (wroteAt20 !== LADDER_MAY_WRITE) {
    waitFail('at the ' + EXPECT_LEAVE_MS + 'ms threshold the ladder wrote {' +
      wroteAt20 + '} — the ONLY field it may write is {' + LADDER_MAY_WRITE +
      '}. Motion must never change at a threshold (SC-4, Handoff §M6)');
  }

  // ==== (r) T-26.98-27 REFUSED, DRIVEN: NO TITLE REACHES A WAITING LINE ===
  //
  // ⛔ HER ANSWER, 2026-08-24, verbatim: "Same line every time". She was
  // offered the warmer naming-the-work shape and was told plainly that it
  // could put the title of one of her notes on screen where none appears
  // today. She declined it. That is an ANSWER, not a deferral, so it gets a
  // gate rather than a note — a refusal written down is a refusal that gets
  // quietly re-opened three phases later.
  //
  // ⛔ DRIVEN, NOT GREPPED. The room is put in the state where a title
  // EXISTS and is within the ladder's reach: the stage text, the reflection's
  // resolved name and the draft body all carry distinct sentinels. Every wait
  // line the ladder produces, at BOTH rungs, is then checked for every one of
  // them. An interpolating rung would land one on the surface and fail here
  // even if it never touched the copy slots.
  h = harness({ wait: { nameLine: SHIPPED_COPY[0],
    leaveLine: SHIPPED_COPY[1], permLine: SHIPPED_COPY[2] } });
  h.begin();
  h.S.view = 'thinking';
  h.S.stage = '<<a-title-shaped-stage>>';
  h.S.name = '<<the-name-of-one-of-her-notes>>';
  h.S.draft = '<<a-paragraph-of-her-own-writing>>';
  h.S.turnText = '<<the-words-she-just-typed>>';
  const REACHABLE = ['<<a-title-shaped-stage>>',
    '<<the-name-of-one-of-her-notes>>', '<<a-paragraph-of-her-own-writing>>',
    '<<the-words-she-just-typed>>'];
  const spoken = [];
  h.tick(EXPECT_NAME_MS);
  h.lines().forEach(function (l) { spoken.push([EXPECT_NAME_MS, l]); });
  h.tick(EXPECT_LEAVE_MS - EXPECT_NAME_MS);
  h.lines().forEach(function (l) { spoken.push([EXPECT_LEAVE_MS, l]); });
  if (spoken.length === 0) {
    waitFail('arm (r) drove both rungs and NOTHING was spoken, so its ' +
      'refusal measured nothing at all — the vacuous instrument again');
  }
  spoken.forEach(function (pair) {
    REACHABLE.forEach(function (secret) {
      if (String(pair[1]).indexOf(secret) !== -1) {
        waitFail('⛔ A WAITING MESSAGE CARRIED SOMETHING OF HERS at ' +
          pair[0] + 'ms: ' + JSON.stringify(pair[1]) + ' contains ' +
          JSON.stringify(secret) + '. T-26.98-27 is REFUSED — she chose ' +
          '`Same line every time` on 2026-08-24 knowing the alternative ' +
          'was warmer, and a waiting line must not name a note. Re-opening ' +
          'this is HER call, never an agent widening it back.');
      }
    });
  });
})();

// ---- 7e. SC-4's DIFF: THE STYLING BYTES, HASHED AGAINST THE PHASE BASELINE
//
// SC-4 asks for a diff proving no motion property changed at either
// threshold. The driven half above is the stronger of the two; this is the
// other one, and it is a POSITIVE EQUALITY over real bytes rather than a
// negative search — for the same reason, and it is the reason this stays
// cheap to prove: the step row pulses by PURE CSS with no timers of its own,
// and the wait line is a string assignment. §06 law 5 — a one-shot removes
// its own class at animationend, never on a timer — is why the shipped
// motion code has not rotted, and keeping the ladder wordless-only is what
// keeps this provable at all. ⛔ IT MUST STAY EASY. The day this assertion
// needs loosening is the day the ladder has grown motion it should not have.
(function () {
  const cp = require('child_process');
  const crypto = require('crypto');

  // ⛔ THE BASELINE COMMIT IS RESOLVED FROM THE PHASE RECORD, never from
  // HEAD~n, never from a merge-base, never from a guess. ANOTHER LIVE
  // SESSION COMMITS TO THIS TREE, so any relative reference resolves to a
  // different commit on a different day and this comparison silently
  // measures nothing at all. If the line is missing or the SHA does not
  // resolve, this fails LOUDLY naming the file — there is no fallback.
  const SUMMARY = require('path').join(
    process.env.HOME || '',
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker',
    'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases',
    '26.98-the-room-reads-as-lit-art-motion-handoff/26.98-01-SUMMARY.md');
  const CSS = 'tokens.css';
  function fail(msg) { violations.push('[motion] ' + CSS + ': ' + msg); }

  let record = '';
  try {
    record = fs.readFileSync(SUMMARY, 'utf8');
  } catch (e) {
    fail('the phase record could not be read, so "baseline" has no ' +
      'definition here and nothing below would be a measurement — ' +
      SUMMARY + ' (' + e.message + ')');
    return;
  }
  const shaM = /PHASE BASELINE COMMIT:\s*`?([0-9a-f]{40})`?/.exec(record);
  if (!shaM) {
    fail('no `PHASE BASELINE COMMIT:` line in ' + SUMMARY + ' — plan 01 is ' +
      "this gate's declared dependency precisely because it cannot define " +
      '"baseline" on its own');
    return;
  }
  const BASE = shaM[1];

  // Read the command's OUTPUT, not its exit code, and carry stderr into any
  // failure message — a gate that reads only a status code cannot tell an
  // empty file from an unresolved commit.
  let baseCss = null;
  try {
    baseCss = cp.execFileSync('git',
      ['-C', ROOT, 'show', BASE + ':' + CSS],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    fail('the phase baseline commit ' + BASE + ' does not resolve in this ' +
      "repo's history, so there is nothing to compare against — git said: " +
      String((e && e.stderr) || e.message).trim());
    return;
  }
  if (typeof baseCss !== 'string' || baseCss.length === 0) {
    fail('git returned no bytes for ' + CSS + ' at ' + BASE);
    return;
  }
  const headCss = fs.readFileSync(require('path').join(ROOT, CSS), 'utf8');

  // Each block is a CONTIGUOUS span between two boundary markers, taken the
  // same way from both versions.
  const BLOCKS = [
    { name: 'the step row (.session-steps through its reduced-motion branch)',
      from: '.session-steps {',
      to: '.session-step-now { animation: none; }\n}' },
    { name: 'the stage paragraph (.session-stage)',
      from: '.session-stage {',
      to: '\n}' },
    { name: 'the thinking glow (@keyframes candle-thinking-glow through its ' +
        'reduced-motion branch)',
      from: '@keyframes candle-thinking-glow {',
      to: '.station-candle.thinking-strip img { filter: brightness(1.1); }' +
        '\n}' }
  ];

  function span(src, b) {
    const i = src.indexOf(b.from);
    if (i === -1) { return null; }
    const j = src.indexOf(b.to, i);
    if (j === -1) { return null; }
    return src.slice(i, j + b.to.length);
  }
  function hash(t) {
    return crypto.createHash('sha256').update(t, 'utf8').digest('hex');
  }

  // ⛔ THE COUNT IS PINNED BY VALUE BEFORE A SINGLE HASH IS COMPUTED. An
  // extractor that matched nothing would otherwise compare zero blocks and
  // report a clean pass — the vacuous instrument, again.
  const headSpans = BLOCKS.map(function (b) { return span(headCss, b); });
  const baseSpans = BLOCKS.map(function (b) { return span(baseCss, b); });
  const headFound = headSpans.filter(function (t) { return t !== null; });
  const baseFound = baseSpans.filter(function (t) { return t !== null; });
  if (headFound.length !== 3) {
    fail('the extractor found ' + headFound.length + ' of the 3 styling ' +
      'blocks that govern the wait surface at HEAD — a block that cannot be ' +
      'found cannot be compared, and a comparison of nothing passes. ' +
      'Missing: ' + BLOCKS.filter(function (b, i) {
        return headSpans[i] === null;
      }).map(function (b) { return b.name; }).join('; '));
    return;
  }
  if (baseFound.length !== 3) {
    fail('the extractor found ' + baseFound.length + ' of the 3 styling ' +
      'blocks at the phase baseline ' + BASE + ' — the two sides are not ' +
      'being read the same way, so no equality below would mean anything');
    return;
  }

  for (let i = 0; i < BLOCKS.length; i++) {
    const hh = hash(headSpans[i]);
    const bh = hash(baseSpans[i]);
    if (hh !== bh) {
      fail('THE STYLING BYTES GOVERNING THE WAIT SURFACE CHANGED — ' +
        BLOCKS[i].name + '\n' +
        '        baseline ' + BASE.slice(0, 12) + ' sha256 ' +
        bh.slice(0, 16) + ':\n' + baseSpans[i] + '\n' +
        '        HEAD sha256 ' + hh.slice(0, 16) + ':\n' + headSpans[i] +
        '\n        SC-4: the wait ladder adds WORDS and nothing else. A ' +
        'faster pulse reads as anxiety, so motion never changes at either ' +
        'threshold. If this change is wanted, it is an owner call, not a ' +
        'loosening of this gate.');
    }
  }
})();

// ---- 7f. THE PHASE 25 WELCOME-BACK, AND THE COLOUR SET, AGAINST THE BASELINE
//
// WHY THIS ARM EXISTS, AND WHY IT IS HERE RATHER THAN IN A NEW SUITE.
// 7e above pins the three styling blocks that govern the WAIT surface. That
// is SC-4's diff and it is correctly narrow — it says nothing at all about
// the rest of tokens.css. 26.98-06 is the first plan in this phase that must
// APPEND to that file (§M7's chosen state has to be class-based, because an
// inline style cannot carry a media query), and two things were riding on
// tokens.css having been left alone that nobody had actually written down:
//
//   (1) THE PHASE 25 WELCOME-BACK. §04's "delete the vignette" is an argument
//       about steady-state lighting; this radial gradient is the shipped
//       SRM-07 / D-01 feature and removing it is a separate owner call. An
//       append that lands two rules above it, or a repaint that "tidies" it,
//       must be impossible to do quietly.
//   (2) THE COLOURS THEMSELVES. Her ruling of 2026-08-23 (§R ruling 5) is
//       "Keep the current colours" — recorded NARROWLY: not now, not never,
//       made on a confounded comparison, and NOT touching her same-day
//       permission for the desk and new-sprite palette. A proposed 52-colour
//       palette is live in another session's hands. Until she rules on it,
//       no colour may reach the painted stylesheet — and "no colour reached
//       it" is a thing that must be PROVEN, not assumed from a clean diff
//       nobody read.
//
// ⛔ IT IS NOT A NEW SUITE ON PURPOSE. tests/test_live_render.cjs pins the
// .cjs suite count BY VALUE, and the next slot is spoken for by this plan's
// own live symmetry suite. A gate that costs a slot it does not need is a
// gate that makes the next one harder to add.
//
// ⛔ BOTH HALVES ARE EQUALITIES OVER REAL BYTES, never a negative search.
// A negative search is satisfied by a rename; a set equality names exactly
// what arrived and exactly what left. The count is pinned BY VALUE before a
// single hash or comparison is computed, because an extractor that matched
// nothing would otherwise compare zero against zero and report a clean pass.
//
// HOW TO MOVE THIS GATE LEGITIMATELY. You do not loosen it. When she rules a
// colour in, the new literal goes into the baseline the same way every other
// ruled value in this repo does: the pin moves IN THE SAME COMMIT as the
// paint, with her ruling cited in the message. That is the whole mechanism —
// an agent cannot widen it without saying out loud, in the record, that it
// did.
(function () {
  const cp = require('child_process');
  const crypto = require('crypto');

  const CSS = 'tokens.css';
  function fail(msg) { violations.push('[welcome/colour] ' + CSS + ': ' + msg); }

  // ⛔ THE BASELINE COMMIT IS RESOLVED FROM THE PHASE RECORD — never HEAD~n,
  // never a merge-base. Another live session commits to this tree, so a
  // relative reference resolves to a different commit on a different day and
  // every equality below silently measures nothing. Resolved independently of
  // 7e rather than shared with it: this arm outlives the wait surface, and a
  // helper shared between two gates is a helper one of them will eventually
  // bend for the other.
  const SUMMARY = require('path').join(
    process.env.HOME || '',
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker',
    'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases',
    '26.98-the-room-reads-as-lit-art-motion-handoff/26.98-01-SUMMARY.md');

  let record = '';
  try {
    record = fs.readFileSync(SUMMARY, 'utf8');
  } catch (e) {
    fail('the phase record could not be read, so "baseline" has no ' +
      'definition here and nothing below would be a measurement — ' +
      SUMMARY + ' (' + e.message + ')');
    return;
  }
  const shaM = /PHASE BASELINE COMMIT:\s*`?([0-9a-f]{40})`?/.exec(record);
  if (!shaM) {
    fail('no `PHASE BASELINE COMMIT:` line in ' + SUMMARY + ' — this gate ' +
      'cannot define "baseline" on its own and will not guess one');
    return;
  }
  const BASE = shaM[1];

  let baseCss = null;
  try {
    baseCss = cp.execFileSync('git',
      ['-C', ROOT, 'show', BASE + ':' + CSS],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    fail('the phase baseline commit ' + BASE + ' does not resolve in this ' +
      "repo's history, so there is nothing to compare against — git said: " +
      String((e && e.stderr) || e.message).trim());
    return;
  }
  if (typeof baseCss !== 'string' || baseCss.length === 0) {
    fail('git returned no bytes for ' + CSS + ' at ' + BASE);
    return;
  }
  const headCss = fs.readFileSync(require('path').join(ROOT, CSS), 'utf8');

  // ---- (i) the welcome-back bytes ------------------------------------------
  //
  // Six CONTIGUOUS spans, taken the same way from both versions. The bare
  // `#room-tint::after` boundary is anchored at a line start so it cannot
  // match the `body.welcome-back` rule that shares its selector text — the
  // kind of collision that makes an extractor read the same block twice and
  // call it agreement.
  const WELCOME = [
    { name: 'the opening frame (#room-tint::after)',
      from: '\n#room-tint::after {', to: '\n}' },
    { name: 'the sanctioned scene-light motion ' +
        '(body.welcome-back #room-tint::after)',
      from: 'body.welcome-back #room-tint::after {', to: '\n}' },
    { name: '@keyframes room-welcome-dim',
      from: '@keyframes room-welcome-dim {', to: '\n}' },
    { name: 'the masthead companion (body.welcome-back .room-masthead)',
      from: 'body.welcome-back .room-masthead {', to: '\n}' },
    { name: '@keyframes room-welcome-chrome',
      from: '@keyframes room-welcome-chrome {', to: '\n}' },
    { name: "the welcome sequence's reduced-motion branch",
      from: '  body.welcome-back #room-tint::after,',
      to: 'body.welcome-back .room-masthead { animation: none; }' }
  ];

  function span(src, b) {
    const i = src.indexOf(b.from);
    if (i === -1) { return null; }
    const j = src.indexOf(b.to, i + b.from.length);
    if (j === -1) { return null; }
    return src.slice(i, j + b.to.length);
  }
  function hash(t) {
    return crypto.createHash('sha256').update(t, 'utf8').digest('hex');
  }

  const headW = WELCOME.map(function (b) { return span(headCss, b); });
  const baseW = WELCOME.map(function (b) { return span(baseCss, b); });
  const headWn = headW.filter(function (t) { return t !== null; }).length;
  const baseWn = baseW.filter(function (t) { return t !== null; }).length;

  // ⛔ PINNED BY VALUE BEFORE A SINGLE HASH. Six, because six is what the
  // Phase 25 welcome sequence is made of; a selector rename drops this count
  // and fails here rather than sliding past an equality of nothing.
  if (headWn !== 6) {
    fail('the extractor found ' + headWn + ' of the 6 Phase 25 welcome-back ' +
      'blocks at HEAD — a block that cannot be found cannot be compared, ' +
      'and a comparison of nothing passes. Missing: ' +
      WELCOME.filter(function (b, i) { return headW[i] === null; })
        .map(function (b) { return b.name; }).join('; '));
  } else if (baseWn !== 6) {
    fail('the extractor found ' + baseWn + ' of the 6 welcome-back blocks ' +
      'at the phase baseline ' + BASE + ' — the two sides are not being ' +
      'read the same way, so no equality below would mean anything');
  } else {
    for (let i = 0; i < WELCOME.length; i++) {
      const hh = hash(headW[i]);
      const bh = hash(baseW[i]);
      if (hh !== bh) {
        fail('THE PHASE 25 WELCOME-BACK CHANGED — ' + WELCOME[i].name + '\n' +
          '        baseline ' + BASE.slice(0, 12) + ' sha256 ' +
          bh.slice(0, 16) + ':\n' + baseW[i] + '\n' +
          '        HEAD sha256 ' + hh.slice(0, 16) + ':\n' + headW[i] +
          '\n        §04\'s "delete the vignette" is an argument about ' +
          'steady-state lighting. THIS is the shipped SRM-07 / D-01 ' +
          'welcome and removing or retuning it is an OWNER CALL, not a ' +
          'consequence of appending rules to this file.');
      }
    }
  }

  // ---- (ii) the colour set -------------------------------------------------
  //
  // Comments are STRIPPED first, and that is deliberate rather than lax: this
  // gate is about what PAINTS. §M7 requires the two feeling-mark hues to have
  // their computed relative luminance recorded in a comment beside them, and a
  // scan that could not tell a recorded measurement from a declaration would
  // make its own documentation impossible to write.
  //
  // Both hex literals AND the rgb()/rgba()/hsl()/hsla() forms are collected,
  // because a palette that arrived only as rgb() would walk straight past a
  // hex-only scan — the vacuous instrument this project has paid for before.
  function colours(src) {
    const painted = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const hexes = painted.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    const fns = painted.match(/\b(?:rgba?|hsla?)\([^)]*\)/g) || [];
    const set = new Set();
    hexes.forEach(function (h) { set.add(h.toLowerCase()); });
    fns.forEach(function (f) {
      set.add(f.toLowerCase().replace(/\s+/g, ''));
    });
    return set;
  }

  const headC = colours(headCss);
  const baseC = colours(baseCss);

  // ⛔ PINNED BY VALUE, AGAIN BEFORE ANY COMPARISON. 14 unique hex literals
  // and 6 unique function-form colours stand in tokens.css at the phase
  // baseline — 20 members. A stripper that ate the whole file would otherwise
  // compare an empty set against an empty set and pass. ⚠ THE FIRST RUN OF
  // THIS ARM CAUGHT ITSELF HERE: the floor was written as 21 from a RAW
  // function-literal count of 7, two of which are the same rgba() spelled the
  // same way in two rules. A floor guessed from an un-deduplicated tally is
  // the vacuity guard failing the way it was built to fail — loudly, before
  // it had measured anything.
  const COLOUR_FLOOR = 20;
  if (baseC.size < COLOUR_FLOOR) {
    fail('the colour extractor found only ' + baseC.size + ' painted colour ' +
      'literals at the phase baseline ' + BASE + ', below the floor of ' +
      COLOUR_FLOOR + ' pinned by value — the extractor is broken, and a ' +
      'comparison of nothing passes');
  } else {
    const added = [...headC].filter(function (c) { return !baseC.has(c); });
    const gone = [...baseC].filter(function (c) { return !headC.has(c); });
    if (added.length) {
      fail('A COLOUR REACHED THE PAINTED STYLESHEET THAT SHE HAS NOT RULED ' +
        'ON: ' + added.sort().join(' ') + '\n' +
        '        Her ruling of 2026-08-23 (§R ruling 5) is "Keep the ' +
        'current colours", recorded NARROWLY — not now, not never. A ' +
        'proposed 52-colour palette is live and unruled. THIS GATE IS NOT ' +
        'LOOSENED TO LET A COLOUR THROUGH: when she rules one in, this ' +
        'baseline moves in the SAME COMMIT as the paint, with her ruling ' +
        'cited. §M7\'s two feeling-mark hues are subject to exactly this — ' +
        'derive them from colours the room already has (var(), color-mix) ' +
        'rather than inventing two literals nobody chose.');
    }
    if (gone.length) {
      fail('A COLOUR LEFT THE PAINTED STYLESHEET: ' + gone.sort().join(' ') +
        '\n        The whole-room repaint is DECLINED (§R ruling 5). ' +
        'Removing a shipped colour is the repaint arriving one literal at ' +
        'a time, and it is an owner call.');
    }
  }

  // ---- (iii) the outline colour she rejected twice -------------------------
  //
  // §R ruling 3: #2c2823 stays on the plates and #4a3a2c "must appear
  // nowhere". Scanned over the PAINTED bytes for the same reason as above —
  // the record is allowed to name what was rejected; the stylesheet is not
  // allowed to paint it.
  const paintedHead = headCss.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/#4a3a2c\b/i.test(paintedHead)) {
    fail('#4a3a2c is being painted. She rejected it TWICE (§R ruling 3) and ' +
      'ruled #2c2823 for the plates. This is not a preference that drifted ' +
      'back in — it is a refusal.');
  }
  if (paintedHead.indexOf('#2c2823') === -1) {
    fail('#2c2823 is no longer painted anywhere in this stylesheet. It is ' +
      'the outline colour she ruled for (§R ruling 3), and this is the ' +
      'positive control that proves the two checks above are reading real ' +
      'painted bytes rather than an emptied string.');
  }
})();

// ---- 7b. 26.995-22: THE CLOCK THAT RAN OUT WHILE THE ROOM WAITED FOR HER --
//
// HER RULING, 2026-08-21 (26.995-COPY.md § R-5), verbatim:
//     "B — keep the clock running, say something else and true"
// Branch B. A, C and D were NOT taken. Single-select from four
// orchestrator-framed options, none labelled Recommended.
//
// WHAT SHE REPORTED. The room told her `the librarian let this one go — it
// was taking too long.` Nothing was slow and no model was ever called: the
// room was sitting on its own consent card waiting for her tap, with the
// give-up clock running underneath it. Her $0.40 was never spent.
//
// ⛔ WHY THIS IS DRIVEN AND NOT GREPPED. A check that greps app.js for the
// new branch restates the edit and this project has paid for that ten times.
// Everything below RUNS the shipped sessionTimedOut on a fake clock and
// counts, BY VALUE, two things that a source read cannot see: how many times
// the librarian was asked, and which words reached her.
//
// THE ANTI-VACUITY ANSWERS.
//  (1) Can it pass before the fix? No. Driven against the shipped bytes it
//      reported, on the arm with ZERO calls to the librarian:
//        WORDS THAT REACHED HER ... ["the librarian let this one go — it was
//        taking too long. nothing is lost; whatever arrived is still here."]
//      quoted in the commit body.
//  (2) Could the counter be broken? Arm 2 asks the librarian once and the
//      counter reports 1 in the same run, so a counter stuck at zero fails.
//  (3) Could the words-detector be broken? CONTROL W plants a string in the
//      slot and asserts it DOES reach her. A detector that saw nothing would
//      fail there, and only then is arm 1's empty reading believed.
//  (4) Does the fix remove the bound? No — arm 1 asserts the sitting ENDED
//      (the flag is down, so sessionFlameSync derives the candle to rest).
//  (5) Is a resume affected? CONTROL R drives one and asserts today's
//      behaviour by value, unmutated.
(function () {
  // ⛔ EVERY CLAIM TAKES ITS SOURCE AS AN ARGUMENT and returns what it found,
  // so the same claims can be re-run over a MUTATED source without touching
  // a byte on disk. A drill that edits app.js in place cannot run beside a
  // live session, and this repo has one.
  function bodyOf(src, name) {
    const marker = 'function ' + name + '(';
    const start = src.indexOf(marker);
    if (start === -1) { throw new Error('MISSING: ' + name); }
    const end = src.indexOf('\n  function ', start + marker.length);
    const raw = src.slice(start, end === -1 ? src.length : end);
    const close = raw.lastIndexOf('\n  }');
    return close === -1 ? raw : raw.slice(0, close + 4);
  }

  function bodyOfOptional(src, name) {
    // 26.995-28: the mutation-safe twin of bodyOf. It exists because the
    // RED run of this plan drove the arms below against an app.js that did
    // not yet carry the walk route — and a slicer that THROWS on a missing
    // name would have reported "the claim THREW" instead of the defect.
    if (src.indexOf('function ' + name + '(') === -1) { return ''; }
    return bodyOf(src, name);
  }

  function claimTheWaitingRouteIsHonest(src) {
  const said = [];
  function fail(msg) { said.push(msg); }
  const appSrc = src;
  const msMatch = /var SESSION_BOUND_MS = (\d+);/.exec(appSrc);
  const lineMatch = /var SESSION_BOUND_LINE = '([^']*)';/.exec(appSrc);
  const staticMatch = /var SESSION_STATIC_LINE = '([^']*)';/.exec(appSrc);
  if (!msMatch || !lineMatch || !staticMatch) {
    fail('the bound constants could not be lifted — nothing below would be ' +
      'a reading');
    return said;
  }
  // ⛔ THE ROSTER OF SENTENCES SHE HAS RULED FOR THIS ROUTE.
  //
  // It was EMPTY from 2026-08-21 until 2026-08-22, because she ruled the
  // behaviour ships now and the words wait. On 2026-08-22 she gave the
  // words: ONE sentence, W-3, chosen from an offered set of three and
  // recorded verbatim with its provenance in 26.995-COPY.md § W-3. It is
  // the ONLY row here, and any other string reaching her on this route —
  // a placeholder included — still fails this suite.
  //
  // ⛔⛔ NOTHING GOES IN HERE THAT SHE HAS NOT WRITTEN OR CHOSEN. Adding a
  // row is a deliberate act with her words in hand, and it must cite the
  // 26.995-COPY.md row that carries them.
  //
  // ⚠ DRIVEN RED -> GREEN -> RED before it was committed: her sentence in
  // the slot with this roster still empty is RED; the row added is GREEN;
  // a different string in the slot is RED again.
  const HER_RULED_WAITING_LINES = [WAITED_LINE];

  // ⛔ THE WALK'S OWN ROSTER — a DIFFERENT surface, moment and content, and
  // numbered on its own (W-5) rather than folded into W-3. Her beat-4
  // ruling (`Stays open, but tells you`) is what opened it; 26.995-COPY.md
  // § W-5 carries the words and the provenance.
  const HER_RULED_WALK_LINES = [WALK_WAITED_LINE];

  const WAITED_SLOT = /var SESSION_WAITED_LINE = ([^\n]*);/.exec(appSrc);
  if (!WAITED_SLOT) {
    fail('SESSION_WAITED_LINE is missing — the waiting route has no slot ' +
      'for her sentence, so either the route is gone or something else is ' +
      'carrying its words');
    return said;
  }
  const WALK_SLOT = /var SESSION_WALK_WAITED_LINE = ([^\n]*);/.exec(appSrc);
  if (!WALK_SLOT) {
    fail('⛔ SESSION_WALK_WAITED_LINE is missing — the blessing walk has ' +
      'no slot for HER sentence (W-5, 26.995-COPY.md § W-5). Her beat-4 ' +
      'ruling was `Stays open, but tells you`, and "the room tells her" IS ' +
      'the sentence: without the slot there is nothing to tell her with.');
  }
  const WAITED_LIT = WAITED_SLOT[1].trim();
  const WALK_LIT = WALK_SLOT ? WALK_SLOT[1].trim() : 'null';

  function harness(waitedLiteral, walkLiteral, opts) {
    const S = { now: 0, timers: [], nextId: 1, quiet: [], turn: [],
      close: [], paints: [], words: [], asked: 0, walkClosed: 0, popped: 0,
      noClear: !!(opts && opts.noClear) };
    const api = new Function('S', 'BOUND_MS', 'BOUND_LINE', 'STATIC_LINE', `
      // 26.998 U-5: a SENTINEL, not null — the arm asserts the opening
      // stretch ends through THIS constant, so reusing her waiting line or
      // the blaming line there is caught rather than merely "not the bound
      // line". ⛔ Reusing her waiting line here is the SECOND falsehood
      // § B-26 refused, and a mutant that does it survived until this.
      var SESSION_OPENING_WAITED_LINE = '<<opening-stretch-sentinel>>';
      var SESSION = { busy: false, view: 'idle', stage: null, line: '',
        turnText: null, draft: null, consent: null, offerChecked: false,
        heldIntent: null, posted: false, retry: false, offer: false,
        // 26.995-28: the walk's own flags, because her beat-4 ruling is
        // about what happens to THEM — the walk stays open, so they must
        // be observable rather than described.
        walkActive: false, walkDone: false, walkSpread: false };
      var SESSION_BOUND_MS = BOUND_MS;
      var SESSION_BOUND_LINE = BOUND_LINE;
      var SESSION_STATIC_LINE = STATIC_LINE;
      var SESSION_WAITED_LINE = ${waitedLiteral};
      var SESSION_WALK_WAITED_LINE = ${walkLiteral};
      var SESSION_BOUND = null;
      var SESSION_RUN = 0;
      // 26.98-05: the wait ladder arms from sessionBusyBegin and releases
      // from sessionBoundRelease, so it comes along wherever they do. ⛔ ITS
      // COPY SLOTS HOLD THE PENDING SENTINEL HERE, so it cannot put a word
      // on this route — every arm below still reaches exactly the branch it
      // reached before, and the words-detector still counts only what the
      // ROUTE says.
      var SESSION_WAIT_NAME_MS = 4000;
      var SESSION_WAIT_LEAVE_MS = 20000;
      var SESSION_MIN_VISIBLE_MS = 600;
      var SESSION_WAIT_COPY_PENDING = '<<owner-copy-pending-26.98-05>>';
      var SESSION_WAIT_NAME_LINE = SESSION_WAIT_COPY_PENDING;
      var SESSION_WAIT_LEAVE_LINE = SESSION_WAIT_COPY_PENDING;
      var SESSION_WAIT_PERMISSION_LINE = SESSION_WAIT_COPY_PENDING;
      var SESSION_WAIT_TIMERS = [];
      var Date = { now: function () { return S.now; } };
      function setTimeout(fn, ms) {
        var id = S.nextId++;
        S.timers.push({ id: id, at: S.now + ms, fn: fn });
        return id;
      }
      function clearTimeout(id) {
        // Switchable, exactly as section 7's harness switches it: with the
        // hygiene release defeated (a clear site that forgot the guard) the
        // EPOCH check is the only thing left holding, and arm 3 below asks
        // whether it actually does.
        if (S.noClear) { return; }
        S.timers = S.timers.filter(function (t) { return t.id !== id; });
      }
      // The two painters model app.js's OWN fallbacks (both spell
      // \`SESSION.line || SESSION_STATIC_LINE\`), so a route that quietly
      // yields to the static line is counted as WORDS REACHING HER rather
      // than sliding through as silence.
      function sessionPaintSpot() {
        S.paints.push(SESSION.view);
        if (SESSION.view === 'error') {
          S.words.push(SESSION.line || SESSION_STATIC_LINE);
        }
      }
      function sessionQuietEnd(line) {
        S.quiet.push(line); SESSION.view = 'error';
        SESSION.line = line || SESSION_STATIC_LINE;
        SESSION.busy = false; SESSION.retry = false; sessionPaintSpot();
      }
      function sessionTurnFailed(line) {
        S.turn.push(line); SESSION.view = 'error';
        SESSION.line = line || SESSION_STATIC_LINE;
        SESSION.turnText = null; SESSION.busy = false; sessionPaintSpot();
      }
      function sessionCloseFailed(line) {
        S.close.push(line); SESSION.view = 'error';
        SESSION.line = line || SESSION_STATIC_LINE;
        SESSION.busy = false; sessionPaintSpot();
      }
      // 26.995-28: if anything the walk ending does reaches for the walk's
      // teardown, it is COUNTED here rather than assumed absent. Her ruling
      // is that the walk STAYS OPEN, and a negative asserted only by
      // reading the source is the shape this project keeps being bitten by.
      function sessionWalkClose() { S.walkClosed += 1; SESSION.walkDone = true; }
      function popView() { S.popped += 1; }
      ${bodyOfOptional(appSrc, 'sessionWaitLine')}
      ${bodyOfOptional(appSrc, 'sessionWaitSpeak')}
      ${bodyOfOptional(appSrc, 'sessionWaitLadderArm')}
      ${bodyOfOptional(appSrc, 'sessionWaitLadderRelease')}
      ${bodyOf(appSrc, 'sessionBoundRelease')}
      ${bodyOf(appSrc, 'sessionBusyBegin')}
      ${bodyOf(appSrc, 'sessionBoundStillEarning')}
      ${bodyOf(appSrc, 'sessionTimedOut')}
      ${bodyOf(appSrc, 'sessionConsentCardShowing')}
      // 26.998-04: the reach question is a THIRD asking-moment and
      // sessionWaitingOnHerAnswer reads it, so it comes along here too.
      ${bodyOf(appSrc, 'sessionReachShowing')}
      ${bodyOf(appSrc, 'sessionWaitingOnHerAnswer')}
      ${bodyOf(appSrc, 'sessionWaitedOnHer')}
      ${bodyOfOptional(appSrc, 'sessionWaitingInHerWalk')}
      ${bodyOfOptional(appSrc, 'sessionWaitedDuringWalk')}
      return {
        S: SESSION,
        begin: sessionBusyBegin,
        // The librarian is asked HERE and nowhere else — the counter.
        ask: function () { S.asked += 1; SESSION.posted = true; },
        tick: function (ms) {
          S.now += ms;
          var due = S.timers.filter(function (t) { return t.at <= S.now; });
          S.timers = S.timers.filter(function (t) { return t.at > S.now; });
          due.forEach(function (t) { t.fn(); });
        }
      };`)(S, Number(msMatch[1]), lineMatch[1], staticMatch[1]);
    api.state = S;
    return api;
  }

  // The state the room is in with her consent card on screen: the offer
  // beat has answered (so the block paints), her answer is not in, it is
  // not a resume, and the librarian has NOT been asked.
  function cardOnScreen(h) {
    h.begin();
    h.S.view = 'thinking';
    h.S.stage = "gathering what's new…";
    h.S.consent = null;
    h.S.offerChecked = true;
    h.S.heldIntent = null;
    h.S.posted = false;
  }

  // 26.995-28 — the other three moments the clock can run out in, each
  // shaped the way app.js itself shapes it, never approximated:
  //
  //   offerOnScreen    the held-draft offer is up and the room is waiting
  //                    for her yes or no (sessionOfferBeat sets exactly
  //                    these three fields). NEWLY covered by her beat-3
  //                    ruling.
  //   walkOpen         her blessing walk is up (sessionWalkStage sets the
  //                    view and the active latch together and neither
  //                    sessionWalkSkip nor sessionWalkClose has run).
  //                    ⛔ THIS IS THE STATE HER OWN SITTING HIT.
  //   openingStretch   the offer beat has NOT answered yet: the room is
  //                    doing its own first work and is not waiting for her
  //                    at all. ⛔ DELIBERATELY NOT COVERED — see ARM 1d.
  function offerOnScreen(h) {
    h.begin();
    h.S.view = 'offer';
    h.S.offer = true;
    h.S.offerChecked = true;
    h.S.consent = null;
    h.S.heldIntent = null;
    h.S.posted = false;
  }

  function walkOpen(h) {
    h.begin();
    h.S.view = 'walk';
    h.S.walkActive = true;
    h.S.walkDone = false;
    h.S.walkSpread = false;
    h.S.offerChecked = true;
    h.S.consent = null;
    h.S.heldIntent = null;
    h.S.posted = false;
  }

  function openingStretch(h) {
    h.begin();
    h.S.view = 'thinking';
    h.S.stage = "gathering what's new…";
    h.S.consent = null;
    h.S.offerChecked = false;
    h.S.heldIntent = null;
    h.S.posted = false;
  }

  const MS = Number(msMatch[1]);
  const LINE = lineMatch[1];

  // ---- ARM 1: the card is on screen the whole time -----------------------
  // ⛔ THE SHIPPED SLOT LITERAL IS USED HERE, NOT A HARD-CODED `null`.
  // Driving a `null` the harness supplied itself would say nothing about
  // what app.js actually carries — the arm would stay green while a
  // placeholder shipped, and only a source read would catch it. Measured:
  // planting a placeholder in the slot fires BOTH this arm and CONTROL S.
  let h = harness(WAITED_LIT, WALK_LIT);
  cardOnScreen(h);
  h.tick(MS);
  if (h.state.asked !== 0) {
    fail('the counter is broken — arm 1 recorded ' + h.state.asked +
      ' calls to the librarian on a path that makes none');
  }
  const blamedTheLibrarian = h.state.quiet.length + h.state.turn.length +
    h.state.close.length;
  if (blamedTheLibrarian !== 0) {
    fail('THE ROOM BLAMED THE LIBRARIAN FOR HER OWN TIME: with the consent ' +
      'card on screen and ' + h.state.asked + ' calls to the librarian, the ' +
      'bound still took a librarian-failed branch ' + blamedTheLibrarian +
      ' time(s) — ' +
      JSON.stringify(h.state.quiet.concat(h.state.turn, h.state.close)));
  }
  const unruled = h.state.words.filter(function (w) {
    return HER_RULED_WAITING_LINES.indexOf(w) === -1;
  });
  if (unruled.length !== 0) {
    fail('⛔ AN UNRULED SENTENCE REACHED HER on the waiting route. The ONLY ' +
      'sentence the room may say here is HERS (W-3, 26.995-COPY.md § W-3), ' +
      'and no agent may write, choose, reuse or placehold another. Found ' +
      JSON.stringify(unruled));
  }
  // 26.995-28: and it must actually ARRIVE. Until 2026-08-22 this moment
  // passed with NO WORDS AT ALL, which the arm above would have called
  // clean forever. Her sentence exists now, so silence here is a defect.
  if (h.state.words.length !== 1 ||
      h.state.words[0] !== HER_RULED_WAITING_LINES[0]) {
    fail('⛔ HER SENTENCE DID NOT REACH HER with the consent card on ' +
      'screen. She gave the words on 2026-08-22 and this moment is the ' +
      'first one they were owed to. Words seen: ' +
      JSON.stringify(h.state.words));
  }
  if (h.S.busy !== false) {
    fail('the waiting route left the sitting busy — the bound has been ' +
      'REMOVED on this path and the candle would concentrate with no end');
  }

  // ---- ARM 1b: THE HELD-DRAFT OFFER — newly covered ----------------------
  // ⛔ THE STATE app.js NAMED AND DID NOT COVER, first of three. Before
  // 2026-08-22 a clock that ran out here said the librarian had been slow
  // with the librarian never asked. Her beat-3 answer (`Just stop the wrong
  // words`) covers it: the room is plainly waiting for her yes or no.
  h = harness(WAITED_LIT, WALK_LIT);
  offerOnScreen(h);
  h.tick(MS);
  if (h.state.asked !== 0) {
    fail('the counter is broken — arm 1b recorded ' + h.state.asked +
      ' calls to the librarian on the held-draft offer, which makes none');
  }
  const blamedOnOffer = h.state.quiet.length + h.state.turn.length +
    h.state.close.length;
  if (blamedOnOffer !== 0) {
    fail('THE ROOM BLAMED THE LIBRARIAN WHILE ITS OWN OFFER WAS ON SCREEN: ' +
      'with `pick up where we left off?` up and ' + h.state.asked + ' calls ' +
      'to the librarian, the bound took a librarian-failed branch ' +
      blamedOnOffer + ' time(s) — ' +
      JSON.stringify(h.state.quiet.concat(h.state.turn, h.state.close)));
  }
  const unruledOnOffer = h.state.words.filter(function (w) {
    return HER_RULED_WAITING_LINES.indexOf(w) === -1;
  });
  if (unruledOnOffer.length !== 0) {
    fail('⛔ AN UNRULED SENTENCE REACHED HER on the held-draft offer — ' +
      JSON.stringify(unruledOnOffer));
  }
  if (h.state.words.length !== 1 ||
      h.state.words[0] !== HER_RULED_WAITING_LINES[0]) {
    fail('⛔ HER SENTENCE DID NOT REACH HER on the held-draft offer. Words ' +
      'seen: ' + JSON.stringify(h.state.words));
  }
  if (h.S.busy !== false) {
    fail('the offer route left the sitting busy — the bound has been ' +
      'REMOVED on that path');
  }

  // ---- ARM 1c: THE BLESSING WALK — THE STATE SHE ACTUALLY HIT ------------
  //
  // ⛔⛔ THIS IS THE ONE. On 2026-08-21 the clock ran out here, the room told
  // her the librarian had been slow, and no librarian had been asked. She
  // then blessed three photographs — one carrying her own words — into a
  // sitting that was already over, and the room did not tell her.
  //
  // Her beat-4 ruling, verbatim: `Stays open, but tells you`. So THREE
  // things are asserted in the one run, and a change that gets any one of
  // them alone fails rather than half-passing:
  //   (1) the librarian is not blamed;
  //   (2) HER sentence (W-5) is what reaches her, exactly once;
  //   (3) the walk is NOT dismantled — its own flags are untouched and
  //       nothing reached for its teardown.
  h = harness(WAITED_LIT, WALK_LIT);
  walkOpen(h);
  h.tick(MS);
  if (h.state.asked !== 0) {
    fail('the counter is broken — arm 1c recorded ' + h.state.asked +
      ' calls to the librarian during the walk, which makes none');
  }
  const blamedInWalk = h.state.quiet.length + h.state.turn.length +
    h.state.close.length;
  if (blamedInWalk !== 0) {
    fail('⛔⛔ THE ROOM BLAMED THE LIBRARIAN INSIDE HER OWN BLESSING WALK — ' +
      'THE EXACT STATE HER 2026-08-21 SITTING HIT. With her walk on screen ' +
      'and ' + h.state.asked + ' calls to the librarian, the bound took a ' +
      'librarian-failed branch ' + blamedInWalk + ' time(s) — ' +
      JSON.stringify(h.state.quiet.concat(h.state.turn, h.state.close)));
  }
  const unruledInWalk = h.state.words.filter(function (w) {
    return HER_RULED_WALK_LINES.indexOf(w) === -1;
  });
  if (unruledInWalk.length !== 0) {
    fail('⛔ AN UNRULED SENTENCE REACHED HER DURING THE WALK. The only ' +
      'sentence the room may say there is HERS (W-5, 26.995-COPY.md § W-5) ' +
      '— found ' + JSON.stringify(unruledInWalk));
  }
  if (h.state.words.length !== 1 ||
      h.state.words[0] !== HER_RULED_WALK_LINES[0]) {
    fail('⛔ HER WALK SENTENCE DID NOT REACH HER. `the room tells her` IS ' +
      'her ruling — silence here is the half of beat 4 that cannot ship. ' +
      'Words seen: ' + JSON.stringify(h.state.words));
  }
  if (h.S.walkActive !== true || h.S.walkDone !== false ||
      h.S.walkSpread !== false) {
    fail('⛔ THE WALK WAS DISMANTLED. She ruled it STAYS OPEN (option 1 — ' +
      'the walk closes too — was offered and NOT taken). Flags after the ' +
      'run out: walkActive ' + h.S.walkActive + ', walkDone ' + h.S.walkDone +
      ', walkSpread ' + h.S.walkSpread);
  }
  if (h.state.walkClosed !== 0 || h.state.popped !== 0) {
    fail('⛔ THE WALK ENDING REACHED FOR THE WALK TEARDOWN — ' +
      h.state.walkClosed + ' close(s), ' + h.state.popped + ' pop(s). Her ' +
      'ruling keeps the walk on screen and taking her taps.');
  }
  if (h.S.busy !== false) {
    fail('the walk route left the sitting busy — the candle would keep ' +
      'concentrating over a walk that is going nowhere');
  }

  // ---- ARM 1d: THE OPENING STRETCH — THE RESIDUAL, PINNED ----------------
  //
  // ⛔⛔ THIS ARM PINS A SENTENCE THAT IS STILL FALSE, ON PURPOSE, AND THAT
  // IS THE HONEST THING TO DO HERE.
  //
  // Before the offer beat has answered, the room is doing its OWN first
  // work — reading whether a draft is held, and fetching what is new (on
  // her own library that fetch ate most of the clock). It is NOT waiting
  // for her: there is nothing on screen she can act on. Her beat-3 ruling
  // covers `while the room is waiting for her`, and this is the one state
  // app.js named that is not that. Putting HER sentence here would tell her
  // the room is waiting for an answer she was never asked for — a NEW
  // falsehood where the old one was.
  //
  // So the librarian-blaming sentence still fires here, with no librarian
  // asked. That is recorded as HERS to rule in 26.995-OWED-TO-OWNER.md
  // § B-26, and pinned here so it cannot quietly change in either
  // direction: an agent widening her ruling fails this arm, and so does an
  // implementation that silences everything.
  h = harness(WAITED_LIT, WALK_LIT);
  openingStretch(h);
  h.tick(MS);
  if (h.state.asked !== 0) {
    fail('the counter is broken — arm 1d recorded ' + h.state.asked +
      ' calls to the librarian in the opening stretch, which makes none');
  }
  // ⛔⛔ AMENDED 2026-08-23 BY HER U-5 RULING, WHICH CLOSES § B-26. This arm
  // used to pin the librarian-blaming line here and say that any change was
  // made WITHOUT HER. She has now given words for this moment, so the pin
  // MOVES TO HER SENTENCE rather than being deleted — an agent silencing it,
  // reusing her waiting line, or putting the blaming line back all still fail.
  // ⚠ Byte-pinned from her record, NOT lifted from the source it checks.
  const OPENING = "i was still looking through what's new when time ran out"
    + '. nothing is lost.';
  if (appSrc.indexOf(OPENING) === -1) {
    fail('⛔ HER U-5 SENTENCE IS NOT IN app.js byte-for-byte — the opening ' +
      'stretch is back to saying something she did not write');
  }
  if (h.state.quiet.length !== 1 ||
      h.state.quiet[0] !== '<<opening-stretch-sentinel>>') {
    fail('⛔ THE OPENING STRETCH DOES NOT END THROUGH HER U-5 SENTENCE. ' +
      'Blaming the librarian where none was asked, or REUSING HER WAITING ' +
      'LINE (the second falsehood § B-26 refused), both land here. quiet ' +
      JSON.stringify(h.state.quiet));
  }
  if (false) {
    fail('⛔ THE OPENING STRETCH CHANGED. It is the ONE waiting state her ' +
      'ruling deliberately does not reach (§ B-26), and it still ends ' +
      'through the shipped bound line. If this was widened, it was widened ' +
      'WITHOUT HER. quiet ' + JSON.stringify(h.state.quiet) + ', words ' +
      JSON.stringify(h.state.words));
  }

  // ---- ARM 2: she answers at 30s; the librarian IS asked ------------------
  // ⚠ Under her branch B the clock is NOT restarted at her answer, so this
  // arm also MEASURES what that costs: the bound fires 45s from HER TAP,
  // which leaves the librarian whatever is left of it.
  h = harness(WAITED_LIT, WALK_LIT);
  cardOnScreen(h);
  h.tick(30000);
  h.S.consent = true;      // her tap on `yes: read what's new`
  h.ask();                 // sessionMaybePost fires: ONE call
  h.S.stage = 'reading…';
  h.tick(MS - 30000);
  if (h.state.asked !== 1) {
    fail('arm 2 did not ask the librarian exactly once (' + h.state.asked +
      ') — the two arms are not distinguishable and arm 1 proves nothing');
  }
  // ⛔⛔ HER U-3 RULING, 2026-08-23 — *`Just fix the writing half`*. A
  // librarian that is ANSWERING must not be abandoned: measured that night,
  // writing one reflection took 43-60s against a 45s bound, so the room was
  // calling its own librarian slow for finishing, and saying so in a sentence
  // that was FALSE. The stage moved after the ask, so this run has earned
  // more time and MUST NOT have ended here.
  if (h.state.quiet.length !== 0) {
    fail('⛔ a run whose stage was still MOVING was abandoned — her U-3 ' +
      'ruling says the writing is let to finish (count ' +
      h.state.quiet.length + ')');
  }
  // ⛔ AND THE GUARD IS STILL REAL. Another whole bound with the stage NOT
  // moving is a job that is not answering, and it must end exactly as before
  // — same line, once. This is strictly stronger than the single tick it
  // replaces: it pins BOTH halves rather than only the ending.
  h.tick(MS);
  if (h.state.quiet.length !== 1 || h.state.quiet[0] !== LINE) {
    fail('a run that asked the librarian and then STOPPED PROGRESSING must ' +
      'still end through the shipped bound line — count ' +
      h.state.quiet.length);
  }

  // ---- CONTROL W: the words-detector can see a string --------------------
  // A placeholder is planted in the slot and MUST reach her. If it does
  // not, arm 1's empty reading means nothing at all.
  h = harness(JSON.stringify('PLACEHOLDER — not her words'), WALK_LIT);
  cardOnScreen(h);
  h.tick(MS);
  if (h.state.words.indexOf('PLACEHOLDER — not her words') === -1) {
    fail('CONTROL W FAILED — a string planted in SESSION_WAITED_LINE did ' +
      'NOT reach her, so this file cannot see words arriving and arm 1 is ' +
      'vacuous. Words seen: ' + JSON.stringify(h.state.words));
  }

  // ---- CONTROL S: what SHIPS in the two slots is HERS --------------------
  //
  // CONTROL W proves a string in the slot reaches her. This asserts WHICH
  // string ships.
  //
  // ⚠ THIS CONTROL WAS INVERTED ON 2026-08-22 AND THE OLD FORM IS DESCRIBED
  // RATHER THAN DELETED, because the inversion is the whole event. From
  // 2026-08-21 it asserted the slot was `null` — no words existed, so any
  // string was wrong. Now her words exist, so `null` is wrong: the moment
  // would pass in silence she never asked for. What did NOT change is the
  // rule: only a sentence she has ruled may ship.
  //
  // ⛔ The membership test is what makes both halves one rule. A slot
  // holding anything at all that is not on the roster above fails, and the
  // roster only ever gains a row with her words in hand.
  function shippedString(literal) {
    // Read the literal the way app.js would, without eval of anything
    // wider: only a plain single- or double-quoted one-line string counts.
    const t = literal.trim();
    if (t === 'null') { return null; }
    const q = t[0];
    if ((q !== "'" && q !== '"') || t[t.length - 1] !== q) { return undefined; }
    return t.slice(1, -1);
  }
  [[WAITED_LIT, 'SESSION_WAITED_LINE', HER_RULED_WAITING_LINES, 'W-3',
    'the room waiting for her answer'],
   [WALK_LIT, 'SESSION_WALK_WAITED_LINE', HER_RULED_WALK_LINES, 'W-5',
     'her blessing walk']].forEach(function (row) {
    const shipped = shippedString(row[0]);
    if (shipped === undefined) {
      fail('⛔ ' + row[1] + ' ships as ' + row[0] + ', which this gate ' +
        'cannot read as a plain string literal. Her sentence must be one ' +
        'contiguous literal so the byte-pin in section 3 holds.');
      return;
    }
    if (shipped === null) {
      fail('⛔ ' + row[1] + ' ships as `null`, so ' + row[4] + ' passes in ' +
        'SILENCE. Her sentence for it (' + row[3] + ') exists as of ' +
        '2026-08-22 — 26.995-COPY.md § ' + row[3] + '. Apply it from that ' +
        'record, never retyped.');
      return;
    }
    if (row[2].indexOf(shipped) === -1) {
      fail('⛔ ' + row[1] + ' ships a sentence SHE HAS NOT RULED: ' +
        JSON.stringify(shipped) + '. Only ' + JSON.stringify(row[2]) +
        ' may reach her on that route. To change it: her words first, in ' +
        '26.995-COPY.md, then here — never the other way round.');
    }
  });

  // ---- CONTROL R: a resume is untouched ----------------------------------
  h = harness(WAITED_LIT, WALK_LIT);
  h.begin();
  h.S.view = 'thinking';
  h.S.heldIntent = 'resume';
  h.S.consent = null;
  h.S.offerChecked = true;
  h.ask();
  h.tick(MS);
  if (h.state.quiet.length !== 1 || h.state.quiet[0] !== LINE) {
    fail('CONTROL R: a resume needs no consent and must behave exactly as ' +
      'it shipped — quiet-end count ' + h.state.quiet.length);
  }

  // ---- ARM 3: THE EPOCH, ON THE WAITING ROUTE ----------------------------
  // The new route made the guard's epoch check load-bearing in a place it
  // was not before: a guard armed for a FINISHED sitting, firing while a
  // LATER sitting has her consent card on screen, would now end that later
  // sitting silently — no words, nothing to see, her tap simply gone.
  //
  // Section 7 arm (e) already drives the epoch, but it reads app.js through
  // the file-scoped `functionBody` and cannot be handed a mutated source.
  // This arm is the source-parameterised twin, so § 7c's drill can put the
  // epoch check back in the bin and watch a gate go red. It runs on the
  // unmutated source on every invocation too — it is a live gate, not drill
  // scaffolding.
  //
  // The hygiene release is DEFEATED here (noClear), which is the whole
  // point: it models a clear site that forgot the guard, leaving the epoch
  // as the only thing standing.
  h = harness(WAITED_LIT, WALK_LIT, { noClear: true });
  cardOnScreen(h);           // run 1, her card on screen
  h.tick(10000);
  h.S.busy = false;          // run 1 ends by hand; its guard is left armed
  h.tick(5000);
  cardOnScreen(h);           // run 2 begins 15s in, her card on screen again
  // ⚠ EVERY TICK BELOW IS DERIVED FROM THE LIFTED MS, never re-typed. A
  // hard-coded 30000 read as a gate here and was not one: it made this arm
  // fail on the known-negative that only changes the clock's LENGTH, which
  // is a change this section has no business seeing. Caught by the drill.
  h.tick(MS - 15000);        // run 1's guard is due here (MS from ITS arm)
  if (h.S.busy !== true) {
    fail('A GUARD OUTLIVED ITS OWN RUN AND ENDED HERS: with the epoch ' +
      'check not holding, a guard armed for a finished sitting ended the ' +
      'LATER sitting while her consent card was on screen — and on the ' +
      'waiting route that happens with NO WORDS AT ALL, so she would see ' +
      'her tap vanish and be told nothing. paints ' +
      JSON.stringify(h.state.paints) + ', words ' +
      JSON.stringify(h.state.words));
  }
  h.tick(15000);             // run 2's own bound, 45s from ITS arm
  if (h.S.busy !== false) {
    fail("run 2's own bound did not fire at its own " + MS +
      'ms — the bound has been removed on this path');
  }

  // ---- THE COUNTS IN THE LIVE COMMENT, MADE A GATE -----------------------
  // ⛔ A COUNT IN A COMMENT IS NOT A GATE. The paragraph above
  // SESSION_BOUND_MS read `set at 4 sites and cleared at 8` from the day it
  // was written until 2026-08-21; measured, it was 5 and 9. Nothing pinned
  // it, so nobody could see it drift. Both numbers are now LIFTED FROM THE
  // PROSE and counted against app.js.
  const setClaim = /it is set at (\d+) sites and cleared at (\d+), all by hand/
    .exec(appSrc);
  const auditClaim = /beats auditing all (\d+) clears/.exec(appSrc);
  if (!setClaim || !auditClaim) {
    fail('the bound comment no longer states its set/clear counts in the ' +
      'form this gate reads — it drifted once already; re-anchor this pin ' +
      'deliberately rather than deleting it');
  } else {
    const setSites = countOf(appSrc, 'sessionBusyBegin();');
    const clearSites = countOf(appSrc, 'SESSION.busy = false;');
    if (Number(setClaim[1]) !== setSites) {
      fail('the bound comment says the flag is set at ' + setClaim[1] +
        ' sites; app.js has ' + setSites);
    }
    if (Number(setClaim[2]) !== clearSites) {
      fail('the bound comment says the flag is cleared at ' + setClaim[2] +
        ' sites; app.js has ' + clearSites);
    }
    if (Number(auditClaim[1]) !== clearSites) {
      fail('the bound comment says auditing all ' + auditClaim[1] +
        ' clears; app.js has ' + clearSites + ' — the two numbers in the ' +
        'same paragraph disagree');
    }
  }
  return said;
  }

  // 26.995-28: the shipped slot literal, re-derived at DRILL scope so a
  // mutant can swap HER sentence for one no agent may choose. Lifted, never
  // re-typed — a hand-typed copy here would be her words in this file twice,
  // which is the mirror trap in its purest form.
  const WAITED_LITERAL_M =
    /var SESSION_WAITED_LINE = ([^\n]*);/.exec(appSrc);
  const WAITED_LITERAL = WAITED_LITERAL_M ? WAITED_LITERAL_M[1].trim() : 'null';

  // ---- the unmutated run, over the SHIPPED bytes -------------------------
  let said;
  try {
    said = claimTheWaitingRouteIsHonest(appSrc);
  } catch (e) {
    violations.push('[waited] ' + APP + ': the waiting-route claim THREW ' +
      'rather than reporting — ' + (e && e.message ? e.message : e));
    return;
  }
  said.forEach(function (m) { violations.push('[waited] ' + APP + ': ' + m); });
  if (said.length === 0) {
    console.log('[waited] the waiting route is honest: with the consent ' +
      'card on screen, the held-draft offer on screen, or her blessing ' +
      'walk open, 0 calls to the librarian and HER OWN SENTENCE reaching ' +
      'her each time — the walk left open and still keeping her ' +
      'blessings; with the card answered, 1 call and the shipped bound ' +
      'line; and in the opening stretch, where the room is doing its own ' +
      'work and her ruling does not reach, the shipped bound line still ' +
      '(§ B-26, hers)');
  }

  // ---- 7c. THE MUTATION DRILL, EACH MUTANT PROVEN PLANTED ----------------
  //
  // ⛔⛔ THE TRAP THIS BLOCK IS BUILT AGAINST, and it has bitten this project
  // before: A MUTATION THAT NEVER APPLIED READS EXACTLY LIKE A GATE THAT DOES
  // NOT HOLD. Both print "SURVIVED". So every mutant's anchor is counted in
  // the source FIRST and must appear EXACTLY ONCE; anything else is a hard
  // failure naming the mutant, not a verdict. A mutant with more than one
  // substitution proves NOTHING from its first — each is counted separately.
  //
  // ⛔ NOTHING ON DISK IS TOUCHED. The claim above takes its source as an
  // argument, so a mutant is a string edit to a lifted copy. This repo has
  // another live session in it and a drill that edited app.js in place could
  // not run beside one.
  //
  // ⛔ NO SCORE IS READ UNTIL THE UNMUTATED SOURCE IS CLEAN. If the shipped
  // bytes already report, every mutant would "die" for the wrong reason and
  // the count would be worthless.
  const MUTANTS = [
    {
      name: 'the-room-blames-the-librarian-for-her-own-time',
      why: 'THE SHIPPED DEFECT, EXACTLY — the fourth shape is removed from ' +
        'sessionTimedOut, so a bound that runs out with her consent card on ' +
        'screen reaches SESSION_BOUND_LINE again. This is the state her own ' +
        'UAT hit. ⚠ Her branch B did NOT move the arming point (option A ' +
        'would have and was declined), so "armed at the opener again" is ' +
        'not a mutation that exists — the arming IS at the opener. This is ' +
        'the same defect said in the shape branch B actually ships.',
      subs: [[
        '    if (sessionWaitingOnHerAnswer()) {\n' +
        '      sessionWaitedOnHer();\n' +
        '      return;\n' +
        '    }\n', '']],
      mustDie: true
    },
    {
      name: 'the-bound-cannot-tell-it-is-waiting-for-her',
      why: 'The route survives but its condition is blinded: the card is ' +
        'never reported as showing, so the bound behaves exactly as it did ' +
        'before the fourth shape existed. Kills the "a branch is present" ' +
        'reading of mutant 1 — presence is not the property.',
      subs: [[
        "    return SESSION.consent === null && SESSION.offerChecked &&\n" +
        "      SESSION.heldIntent !== 'resume';",
        "    return false && SESSION.consent === null && " +
        "SESSION.offerChecked &&\n      SESSION.heldIntent !== 'resume';"]],
      mustDie: true
    },
    {
      name: 'a-guard-outlives-its-own-run',
      why: "The epoch check goes in the bin. A guard armed for a finished " +
        'sitting then ends the LATER one — and on the waiting route that ' +
        'happens with no words at all, so her tap would simply vanish.',
      subs: [[
        '      if (run !== SESSION_RUN || SESSION.busy !== true) { return; }',
        '      if (SESSION.busy !== true) { return; }']],
      mustDie: true
    },
    {
      name: 'her-sentence-is-swapped-for-one-no-agent-may-choose',
      why: 'THE ROSTER IS A MEMBERSHIP TEST, NOT A NOT-NULL TEST. A slot ' +
        'holding SOME string is not the property — it must hold HERS. This ' +
        'plants a different sentence, of the same shape and the same ' +
        'register, and the run must still redden. Driven the other way ' +
        'too, off-drill: with her sentence shipped and the roster emptied, ' +
        'the same arms report.',
      subs: [[WAITED_LITERAL, JSON.stringify(
        'the reflection has not begun; the room is waiting on you.')]],
      mustDie: true
    },
    {
      name: 'the-walk-ending-is-removed-from-the-router',
      why: "HER BEAT-4 RULING UNDONE. Without this branch a clock that runs " +
        'out under her blessing walk falls through to the librarian-failed ' +
        'sentence again — the exact state her 2026-08-21 sitting hit, with ' +
        'no librarian ever asked.',
      subs: [[
        '    if (sessionWaitingInHerWalk()) {\n' +
        '      sessionWaitedDuringWalk();\n' +
        '      return;\n' +
        '    }\n', '']],
      mustDie: true
    },
    {
      name: 'the-walk-route-is-present-but-cannot-see-the-walk',
      why: 'The route survives and its condition is blinded, so "a branch ' +
        'exists" cannot be mistaken for "the branch fires" — the ' +
        'second-mutant shape 26.995-22 used for exactly this reason.',
      subs: [["    return SESSION.view === 'walk' && SESSION.walkActive === true &&",
        "    return false && SESSION.view === 'walk' && " +
        'SESSION.walkActive === true &&']],
      mustDie: true
    },
    {
      name: 'the-walk-ending-CLOSES-the-walk',
      why: 'OPTION 1, WHICH SHE WAS OFFERED AND DID NOT TAKE — one ending, ' +
        'not two. The sentence still reaches her, so an arm that only ' +
        'checked the words would stay green; what fails is the walk flags, ' +
        'which is the half of her ruling that is about her taps.',
      subs: [['    SESSION.busy = false;\n    SESSION.retry = false;\n' +
        "    if (typeof SESSION_WALK_WAITED_LINE === 'string' &&",
        '    SESSION.busy = false;\n    SESSION.retry = false;\n' +
        '    SESSION.walkDone = true;\n' +
        "    if (typeof SESSION_WALK_WAITED_LINE === 'string' &&"]],
      mustDie: true
    },
    {
      name: 'the-held-draft-offer-is-dropped-from-the-widening',
      why: "HER BEAT-3 RULING HALF-UNDONE. The consent card keeps its route " +
        'and the offer loses it, which is exactly what shipped before ' +
        '2026-08-22 — and it is the shape a widening regresses into, ' +
        'because the arm everyone remembers still passes.',
      subs: [["      (SESSION.view === 'offer' && SESSION.offer === true &&\n" +
        '        SESSION.posted !== true);',
        '      false;']],
      mustDie: true
    },
    {
      name: 'DEGENERATE-silence-nothing',
      why: 'THE FIRST OF THE TWO DEGENERATE IMPLEMENTATIONS. Both honest ' +
        'routes are removed from the router at once, so every run out ' +
        'blames the librarian — the pre-26.995-22 room. It is planted as ' +
        'its own mutant rather than inferred from the two single removals ' +
        'above, because "each half fails alone" is not the same claim as ' +
        '"the pair fails together".',
      subs: [[
        '    if (sessionWaitingInHerWalk()) {\n' +
        '      sessionWaitedDuringWalk();\n' +
        '      return;\n' +
        '    }\n', ''],
        ['    if (sessionWaitingOnHerAnswer()) {\n' +
         '      sessionWaitedOnHer();\n' +
         '      return;\n' +
         '    }\n', '']],
      mustDie: true
    },
    {
      name: 'DEGENERATE-silence-everything',
      why: 'THE SECOND. Every run out is routed to the walk ending, so ' +
        'NOTHING ever reaches the librarian-failed sentence — including ' +
        'the run where the librarian really was asked, which is the ' +
        'sentence she ruled `Yes, that stays` on, and including the ' +
        'opening stretch her ruling deliberately does not reach.',
      subs: [['    if (sessionWaitingInHerWalk()) {',
        '    if (true || sessionWaitingInHerWalk()) {']],
      mustDie: true
    },
    {
      name: 'KNOWN-NEGATIVE-the-clock-is-given-a-different-length',
      why: 'MUST SURVIVE. This claim is about WHICH route a run out takes ' +
        'and what reaches her on it — never how long the clock is. The ' +
        'length is pinned BY VALUE at 45000 in section 7 against the REAL ' +
        'file, so it is not a hole here; a mutant dying here would mean ' +
        'this block reddens on changes it has no business seeing.',
      subs: [['  var SESSION_BOUND_MS = 45000;',
        '  var SESSION_BOUND_MS = 60000;']],
      mustDie: false
    }
  ];

  if (violations.length !== 0 || said.length !== 0) {
    violations.push('[drill] ' + APP + ': the unmutated source did not come ' +
      'back clean, so no mutation score was read — a mutant that "dies" ' +
      'against an already-red tree proves nothing');
    return;
  }

  let planted = 0;
  let killed = 0;
  let survived = 0;
  MUTANTS.forEach(function (m) {
    let mutated = appSrc;
    // ⛔ EVERY SUBSTITUTION COUNTED SEPARATELY, BEFORE ANY VERDICT.
    for (let i = 0; i < m.subs.length; i += 1) {
      const from = m.subs[i][0];
      const hits = mutated.split(from).length - 1;
      if (hits !== 1) {
        violations.push('[drill] ' + APP + ': MUTANT NOT PLANTED — "' +
          m.name + '" substitution ' + (i + 1) + ' of ' + m.subs.length +
          ' matched ' + hits + ' time(s), expected exactly 1. Its verdict ' +
          'was NOT read: a mutation that never applied reads exactly like a ' +
          'gate that does not hold. Re-anchor it against app.js ' +
          'deliberately.');
        return;
      }
      mutated = mutated.split(from).join(m.subs[i][1]);
    }
    if (mutated === appSrc) {
      violations.push('[drill] ' + APP + ': MUTANT NOT PLANTED — "' + m.name +
        '" left the source byte-identical');
      return;
    }
    planted += 1;
    let found;
    try {
      found = claimTheWaitingRouteIsHonest(mutated);
    } catch (e) {
      found = ['the claim THREW under this mutant — ' +
        (e && e.message ? e.message : e)];
    }
    if (found.length > 0) {
      killed += 1;
      if (!m.mustDie) {
        violations.push('[drill] ' + APP + ': the KNOWN-NEGATIVE "' + m.name +
          '" was caught. This block reddened on a change it has no business ' +
          'seeing — ' + JSON.stringify(found.slice(0, 1)));
      } else {
        console.log('  [drill] KILLED  ' + m.name + ' :: ' +
          found[0].slice(0, 110));
      }
    } else {
      survived += 1;
      if (m.mustDie) {
        violations.push('[drill] ' + APP + ': MUTANT SURVIVED — "' + m.name +
          '" was PROVEN PLANTED and the claim still came back clean. ' +
          m.why);
      } else {
        console.log('  [drill] SURVIVED (as required) ' + m.name);
      }
    }
  });
  console.log('[drill] waiting-route mutants: planted ' + planted + '/' +
    MUTANTS.length + ', killed ' + killed + ', survived ' + survived +
    ' (of which ' + MUTANTS.filter(function (m) { return !m.mustDie; }).length +
    ' known-negative(s) MUST survive)');
})();

// ---- 7d. HER BLESSINGS SURVIVE A SITTING THAT HAS BEEN GIVEN UP ------------
//
// HER BEAT-4 RULING has two halves. The walk arm in § 7b drives the first —
// the walk is not dismantled and HER sentence is what she is told. This
// drives the second: that the blessings she goes on making after the clock
// ran out are STILL KEPT.
//
// ⛔ THAT CLAIM WAS TRUE BEFORE THIS PLAN AND IS THE REASON HER OWN THREE
// PHOTOGRAPHS SURVIVED 2026-08-21 — one of them carrying her own words. It
// is asserted here because her sentence now PROMISES it in so many words,
// and a promise the room makes on screen may not rest on a comment. If the
// verdict path ever starts reading the sitting's state, her sentence
// becomes a lie and this arm is what says so.
//
// ⚠ DRIVEN, NOT GREPPED. A source scan for `SESSION.` inside the verdict
// path would pass a version that read the flag through a helper — the
// signature defect of this project in a new costume. The shipped function
// is lifted and RUN with the sitting already given up.
(function () {
  function fail(msg) { violations.push('[kept] ' + APP + ': ' + msg); }

  function harness() {
    const S = { posts: [], busyFlips: [], retried: 0, advanced: 0 };
    const api = new Function('S', 'StudyCore', `
      // The sitting is OVER: the clock ran out under her walk and
      // sessionWaitedDuringWalk put the flag down. This is exactly the
      // state her three blessings landed in.
      var SESSION = { busy: false, view: 'error', posted: false,
        walkActive: true, walkDone: false, walkBlessed: [] };
      var DIEGETIC_ROOM_ENABLED = false;
      var LIBRARIAN = { pendingAck: null };
      var SHELF = { pendingOffer: null };
      var BLESS = { busy: false, index: 0, ids: ['a'], spread: false,
        items: { a: { id: 'a', state: 'unseen', history: [] } } };
      function quietError() { throw new Error('quietError must not run'); }
      function blessingNoteEl() { return null; }
      function showBlessingRetry() { S.retried += 1; }
      function reachAnswering() { return false; }
      function reachResolveAnswer() {}
      function postLibrarianAck() {}
      function advanceBlessing() { S.advanced += 1; }
      function renderFilterOffer() {}
      function apiPost(route, body) {
        S.posts.push({ route: route, body: body, busyAtPost: SESSION.busy });
        return Promise.resolve({ ok: true, data: {} });
      }
      ${functionBody('handleBlessingTap')}
      return { S: SESSION, tap: handleBlessingTap, BLESS: BLESS };`
    )(S, StudyCore);
    api.state = S;
    return api;
  }

  const h = harness();
  h.tap('a', 'safe');
  // The POST is issued synchronously inside the tap; its .then is not.
  if (h.state.posts.length !== 1) {
    fail('⛔ HER BLESSING WAS NOT SAVED after the sitting under it was ' +
      'given up. Her sentence for that moment promises `everything you ' +
      'welcome here is still kept` — POSTs seen: ' +
      JSON.stringify(h.state.posts));
  } else {
    const p = h.state.posts[0];
    if (p.route !== '/api/state') {
      fail('the blessing went somewhere other than the store — ' + p.route);
    }
    const ch = p.body && p.body.changes && p.body.changes[0];
    if (!ch || ch.id !== 'a' || ch.to !== 'blessed' || ch.via !== 'blessing') {
      fail('the blessing that was saved is not the one she made — ' +
        JSON.stringify(p.body));
    }
    if (p.busyAtPost !== false) {
      fail('CONTROL: the sitting was not actually given up when the tap ' +
        'was made, so this arm proved nothing about a dead sitting');
    }
  }
  if (h.state.retried !== 0) {
    fail('the tap fell into its own retry path — the arm did not exercise ' +
      'the save it claims to');
  }
  if (h.state.posts.length === 1) {
    console.log('[kept] her blessing still reaches the store with the ' +
      'sitting already given up (busy=false at the POST) — the promise in ' +
      'her walk sentence holds');
  }
})();

// ---- 8. THE SECOND GO, DRIVEN (map #50 / #68 ruling 3) ----------------------
//
// HER RULING: a failed generation must leave her WHERE SHE IS, keeping the
// arrivals she just welcomed, with another go available from there.
//
// ⚠ THE DEFECT WAS NOT A MISSING BUTTON, so a grep for one would prove
// nothing. It was that the failure path DROPPED THE SITTING: the only way
// to try again was the candle, which restarts the re-pull, the blessing
// walk and every why-box she filled in. What has to be true is a NEGATIVE —
// that a retry changes nothing the sitting collected — and the only honest
// way to assert a negative about state is to run the real functions and
// look at the state afterwards. So they are lifted and driven, exactly as
// the wall-clock bound above is.
(function () {
  function fail(msg) { violations.push('[retry] ' + APP + ': ' + msg); }

  function harness() {
    const S = { posted: 0, painted: 0, begun: 0, home: 0 };
    const api = new Function('S', `
      // A sitting mid-flight: her consent given, her walk done, three
      // arrivals welcomed and two whys asked for.
      var SESSION = {
        busy: true, view: 'thinking', line: '', stage: 'reading…',
        consent: true, posted: true, repullDone: true, offerChecked: true,
        offer: false, walkDone: true, heldIntent: null, retry: false,
        walkBlessed: ['a', 'b', 'c'], whyWanted: ['a', 'b'],
        turnText: null, draft: null
      };
      var SESSION_STATIC_LINE = 'the static line';
      function sessionPaintSpot() { S.painted++; }
      function sessionEnsureHome() { S.home++; }
      function sessionBusyBegin() { S.begun++; SESSION.busy = true; }
      function sessionMaybePost() { S.posted++; }
      ${functionBody('sessionQuietEnd')}
      ${functionBody('sessionGenerationFailed')}
      ${functionBody('sessionRetryGeneration')}
      return { S: SESSION, state: S,
        failed: sessionGenerationFailed,
        quiet: sessionQuietEnd,
        again: sessionRetryGeneration };`)(S);
    return api;
  }

  // (a) THE WHOLE RULING: a failed generation keeps every arrival she
  //     welcomed and every why she asked for. If any of these clear, she
  //     has to walk her own new things a second time to get back here.
  let h = harness();
  h.failed('the librarian could not finish just now');
  if (h.S.view !== 'error' || h.S.busy !== false) {
    fail('a failed generation must end the run and paint the quiet line');
  }
  if (h.S.retry !== true) {
    fail('a failed generation must leave the sitting standing — no ' +
      'second go was offered');
  }
  ['walkBlessed', 'whyWanted'].forEach(function (key) {
    if (!Array.isArray(h.S[key]) || h.S[key].length === 0) {
      fail('a failed generation cleared ' + key + ' — the arrivals she ' +
        'just welcomed are gone and the walk would run again');
    }
  });
  if (h.S.consent !== true || h.S.walkDone !== true ||
      h.S.repullDone !== true || h.S.offerChecked !== true) {
    fail('a failed generation reset a beat the sitting had already ' +
      'answered — the tap would redo it');
  }

  // (b) The second go re-enters the ONE post site, carrying the same
  //     sitting: `posted` cleared and nothing else about the walk touched.
  const before = {
    blessed: h.S.walkBlessed.slice(), whys: h.S.whyWanted.slice(),
    consent: h.S.consent
  };
  h.again();
  if (h.state.posted !== 1) {
    fail('the second go did not re-enter the post site (posted ' +
      h.state.posted + ')');
  }
  if (h.S.posted !== false) {
    fail('the post latch was not cleared, so the gate would refuse');
  }
  if (h.state.begun !== 1 || h.S.busy !== true || h.S.view !== 'thinking') {
    fail('the second go must arm the bound and paint as thinking');
  }
  if (h.S.retry !== false) {
    fail('the door must clear as it is taken — a live retry flag while ' +
      'the run is in flight can paint a second door');
  }
  if (JSON.stringify(h.S.walkBlessed) !== JSON.stringify(before.blessed) ||
      JSON.stringify(h.S.whyWanted) !== JSON.stringify(before.whys) ||
      h.S.consent !== before.consent) {
    fail('the second go changed what the sitting had collected — it must ' +
      'send the IDENTICAL body, not a rebuilt one');
  }

  // (c) A double tap posts once. ⚠ Not the real guard against a double
  //     generation — the server refuses a POST while a job runs — but a
  //     second paint from one gesture is still wrong.
  h = harness();
  h.failed('again');
  h.again();
  h.again();
  if (h.state.posted !== 1) {
    fail('a double tap on the second go posted ' + h.state.posted +
      ' times');
  }

  // (d) ⛔ THE OTHER HALF, and the one that stops this becoming a retry
  //     button on every failure: sessionQuietEnd offers NOTHING. It is the
  //     path for failures where the sitting did not survive, and a door
  //     there would be a dead end wearing a way out.
  h = harness();
  h.failed('first');
  h.quiet('then something that is not retryable');
  if (h.S.retry !== false) {
    fail('sessionQuietEnd left a second go on offer — that path has no ' +
      'sitting left to go back to');
  }

  // (e) A fresh sitting never inherits the last one's door. Read from the
  //     start function's own reset block, because that is where every
  //     other per-sitting flag is cleared and a new one is easy to forget.
  if (!/SESSION\.retry = false;/.test(functionBody(
    'startReflectionSession'))) {
    fail('a fresh sitting does not reset SESSION.retry — it would open ' +
      'carrying the last failure\'s door');
  }

  // (f) The placeholder copy is DECLARED. Front-facing wording is hers as
  //     one pass (#77); an undeclared placeholder reads as a settled
  //     decision. Same rule test_cleaning_ui.cjs holds the tidy-up to.
  if (appSrc.indexOf('var SESSION_COPY_OWED') === -1) {
    fail('SESSION_COPY_OWED must exist — the retry door\'s words were ' +
      'written by an agent for a screen she has not read yet');
  }
  if (appSrc.indexOf("'SESSION_RETRY_COPY'") === -1) {
    fail('SESSION_RETRY_COPY is not on the handover list');
  }
})();

// ---- 9. THE WALK REACHES THE REFLECTION, DRIVEN (map #50 / #99) -------------
//
// ⛔ WHY THIS GROUP EXISTS, AND WHY IT IS DRIVEN RATHER THAN GREPPED.
// 26.95-32 re-hosted the walk onto the Offer and severed both halves of the
// walk→reflection handoff: SESSION.walkIds stopped being assigned, so
// `spotlight_ids` went permanently empty, and SESSION.walkSpread stopped
// being set, so the why step's three doors never rendered and whyWanted could
// never be populated. Nothing announced it. Her verdicts still saved. AND THE
// SUITE STAYED GREEN, because the assertions of the day were amended to
// encode the RETIREMENT of the mechanism — which is a true statement about
// the mechanism and says nothing at all about the feature.
//
// So this group asserts the FEATURE: drive the shipped functions and look at
// what the session would POST. A grep cannot do that — the last one passed
// while the thing it described was dead — and the negative that matters (a
// walk that collects NOTHING) is only visible in the state afterwards.
(function () {
  function fail(msg) { violations.push('[walk-wire] ' + APP + ': ' + msg); }

  // A node stub small enough to read, with an innerHTML that parses out the
  // classes the shipped painter emits. It re-types no copy and no markup: it
  // only makes the painter's own bytes queryable.
  function mkNode(cls) {
    const n = {
      cls: cls || '', __html: '', kids: [], parentNode: null,
      attrs: {}, disabled: false, value: '', __on: {},
      setAttribute: function (k, v) { this.attrs[k] = v; },
      getAttribute: function (k) {
        return Object.prototype.hasOwnProperty.call(this.attrs, k) ?
          this.attrs[k] : null;
      },
      addEventListener: function (t, f) {
        (this.__on[t] = this.__on[t] || []).push(f);
      },
      fire: function (t, e) {
        (this.__on[t] || []).slice().forEach(function (f) { f(e || {}); });
      },
      appendChild: function (c) { this.kids.push(c); c.parentNode = this; },
      removeChild: function (c) {
        this.kids = this.kids.filter(function (k) { return k !== c; });
      },
      querySelectorAll: function (sel) {
        const want = sel.replace(/^\./, '');
        return this.kids.filter(function (k) {
          return (' ' + k.cls + ' ').indexOf(' ' + want + ' ') !== -1;
        });
      },
      querySelector: function (sel) {
        const hit = this.querySelectorAll(sel);
        return hit.length ? hit[0] : null;
      }
    };
    Object.defineProperty(n, 'innerHTML', {
      get: function () { return this.__html; },
      set: function (v) {
        this.__html = String(v);
        const kids = [];
        const re = /class="([^"]*)"/g;
        let m;
        while ((m = re.exec(this.__html)) !== null) {
          const kid = mkNode(m[1]);
          kid.parentNode = this;
          kids.push(kid);
        }
        this.kids = kids;
      }
    });
    return n;
  }

  // One Offer page: `n` picture rows, each with its answer controls and the
  // note slot 26.95-30 deliberately left standing.
  function mkPage(ids) {
    const content = mkNode('spread-content');
    const rows = {};
    ids.forEach(function (id) {
      const row = mkNode('offer-answers');
      row.setAttribute('data-offer-id', id);
      ['offer-bless', 'offer-never', 'offer-notrel', 'offer-answer-note']
        .forEach(function (c) { row.appendChild(mkNode(c)); });
      content.appendChild(row);
      rows[id] = row;
    });
    // querySelectorAll on the host must find the rows, not their children.
    content.querySelectorAll = function (sel) {
      const want = sel.replace(/^\./, '');
      return content.kids.filter(function (k) {
        return (' ' + k.cls + ' ').indexOf(' ' + want + ' ') !== -1;
      });
    };
    return { content: content, rows: rows };
  }

  function harness(door, ids, states) {
    const page = mkPage(ids);
    const rec = { posts: [], advanced: 0, popped: 0, painted: 0 };
    const api = new Function('page', 'rec', 'mkNode', 'StudyCore', `
      var SPREAD_IDS = { content: 'spread-content', bar: 'spread-bar' };
      var WHY_DEFAULT = 'felt blessed after reading it';
      var WHY = { heldId: null, resolvedId: null, pending: false,
        host: null };
      var REACH = { ids: ${JSON.stringify(ids)}, answered: {},
        pendingId: null, door: ${JSON.stringify(door)} };
      var SESSION = { walkBlessed: [], whyWanted: [] };
      var BLESS = { items: ${JSON.stringify(states)} };
      var document = { querySelector: function () { return null; } };
      function $(id) { return id === 'spread-content' ? page.content : null; }
      function escapeHtml(s) { return String(s); }
      function escapeAttr(s) { return String(s); }
      function apiPost(url, body) {
        rec.posts.push({ url: url, body: body });
        var chain = {
          then: function (ok) { if (ok) { ok({ ok: true }); } return chain; },
          catch: function () { return chain; }
        };
        return chain;
      }
      // ⛔ THE ONE THING THAT MUST NEVER RUN ON THIS PATH. An Offer is one
      // page, not a queue: an advance here would step an index into a pass
      // that is not running. Counted rather than stubbed silent, so the
      // assertion can be a positive zero.
      function advanceBlessing() { rec.advanced++; }
      // 26.95-38 (UAT F-3): THE OFFER'S ENDING, and the owner's exception to
      // it. The room comes back when the last picture is answered — but NOT
      // while a why is held, because closing over the question the room just
      // asked would delete the door she ruled back into the room the day
      // before (map #50 / #99). This harness is the only place that drives
      // that exception through the real why doors, so the pop is COUNTED
      // here exactly as the forbidden advance is: a recorder, so the
      // assertion can be a positive zero and then a positive one.
      var VIEW_TOP = { view: 'spread', id: 'offer', offerPage: true };
      function currentView() { return VIEW_TOP; }
      function popView() { rec.popped++; }
      // 26.95-39 (UAT F-2): ONE PICTURE FILLS THE WINDOW and the next arrives
      // when she answers, so the repaint is the OTHER thing an answer can
      // cause. Counted for the same reason the pop and the forbidden advance
      // are: the claim is that an answer does exactly one of three things —
      // nothing while a beat is speaking, the next picture, or the room — and
      // three counters are what let each be asserted as a positive number
      // rather than inferred from the absence of the others. The painter
      // itself belongs to tests/test_offer_render.cjs, which drives it on a
      // live page; here only the DECISION is under test.
      function paintOfferPage() { rec.painted++; }
      // 26.95-44 (UAT F-12): offerRowEl asks this where the answer row is
      // seated — the ribbon, since she chose the pinned seat over a smaller
      // photograph. Lifted rather than stubbed for the same reason the
      // lookup itself is: a stub here would decide the answer to the
      // question the lookup exists to ask.
      ${functionBody('offerRowSeat')}
      ${functionBody('offerRowEl')}
      ${functionBody('reachAllAnswered')}
      ${functionBody('reachAfterAnswer')}
      ${functionBody('reachRepaint')}
      ${functionBody('reachEndIfDone')}
      ${functionBody('reachResolveAnswer')}
      ${functionBody('reachResolveRow')}
      // 26.95-57 (UAT session 2, F-16): the set-aside beat she ruled. LIFTED,
      // NEVER STUBBED, and the reason is this phase's most expensive lesson:
      // the suite covering the Offer's own surface substitutes a chassis
      // stand-in that hardcodes the offerPage flag as true, and the one fact
      // it asserts is the one fact that was wrong — F-14 and F-15 hid behind
      // it. A stub of this function here would decide the answer to
      // the question this harness exists to ask.
      ${objectBody('OFFER_COPY')}
      ${functionBody('escapeHtml')}
      ${functionBody('reachAsideSaid')}
      ${functionBody('whyHostEl')}
      ${functionBody('whyReleaseHost')}
      ${functionBody('whyAdvance')}
      ${functionBody('whyShouldHold')}
      ${functionBody('whyResolve')}
      ${functionBody('whyFlushDefault')}
      ${functionBody('renderWhyBlock')}
      ${functionBody('whySetDisabled')}
      ${functionBody('whyKeep')}
      ${functionBody('whyKeepFailed')}
      ${functionBody('whyLibrarian')}
      ${functionBody('whyMoveOn')}
      return { S: SESSION, R: REACH, W: WHY,
        answer: reachResolveAnswer,
        allAnswered: reachAllAnswered,
        setViewTop: function (v) { VIEW_TOP = v; } };`)(page, rec, mkNode, StudyCore);
    api.rec = rec;
    api.rows = page.rows;
    api.note = function (id) {
      return page.rows[id].querySelector('.offer-answer-note');
    };
    api.doors = function (id) {
      const slot = api.note(id);
      return {
        librarian: slot.querySelector('.why-librarian'),
        moveOn: slot.querySelector('.why-move-on'),
        keep: slot.querySelector('.why-keep'),
        input: slot.querySelector('.why-input')
      };
    };
    return api;
  }

  const BLESSED = { state: 'blessed' };

  // ⚠ EVERY DOOR LOOKUP GOES THROUGH THIS. Drilled: with the collection
  // severed the way 26.95-32 severed it, an unguarded `.input.value =` threw
  // — and a THROW here is worse than a red line, because this suite reports
  // its violations at the end, so the crash swallowed the six that had
  // already been recorded and named the wrong thing as the problem.
  function needDoors(h, id, label) {
    const d = h.doors(id);
    if (!d.librarian || !d.moveOn || !d.keep || !d.input) {
      fail(label + ': the why step rendered no doors, so this case could ' +
        'not be driven at all');
      return null;
    }
    return d;
  }

  // (a) A WELCOME ON THE WALK REACHES THE REFLECTION. This is the first of
  //     the two severed halves: without it `spotlight_ids` is empty and the
  //     reflection is written knowing nothing of what she just welcomed.
  let h = harness('walk', ['a', 'b'], { a: BLESSED, b: BLESSED });
  h.answer('a', 'safe');
  if (JSON.stringify(h.S.walkBlessed) !== JSON.stringify(['a'])) {
    fail('a welcome on the walk did not reach SESSION.walkBlessed — the ' +
      'reflection would be written blind to the sitting (got ' +
      JSON.stringify(h.S.walkBlessed) + ')');
  }

  // (b) AND SHE IS OFFERED THE THREE DOORS. The second severed half: with no
  //     block rendered, whyWanted can never be populated by anything.
  let d = needDoors(h, 'a', 'a welcome on the walk');
  if (!d) {
    fail('the why step did not render its three doors into the answered ' +
      "row's note slot — the librarian door is unreachable");
  }

  // (c) THE LIBRARIAN DOOR IS THE WHOLE POINT OF #99. It must flag the row
  //     AND leave its one warm-default entry behind (no entry ever dangles),
  //     and it must not advance a pass that is not running.
  if (d) { d.librarian.fire('click'); }
  if (h.S.whyWanted.indexOf('a') === -1) {
    fail('the librarian door did not flag the row for the reflection\'s ' +
      'whys — SESSION.whyWanted is ' + JSON.stringify(h.S.whyWanted));
  }
  let blessPosts = h.rec.posts.filter(function (p) {
    return p.url === '/api/blessings';
  });
  if (blessPosts.length !== 1 || blessPosts[0].body.author !== 'default') {
    fail('the librarian door must leave exactly one warm-default entry ' +
      '(got ' + JSON.stringify(blessPosts.map(function (p) {
        return p.body.author;
      })) + ')');
  }
  if (h.rec.advanced !== 0) {
    fail('a door on the Offer advanced a blessing pass — an Offer is one ' +
      'page and never advances (26.95-30)');
  }
  if (h.note('a').innerHTML !== '') {
    fail('the doors did not go with the hold — a resolved row still ' +
      'offers a second answer');
  }

  // (d) NEGATIVE CONTROL, AND IT IS A RULING (#99 r1, HERS): the desk door
  //     opens the SAME page and must reach none of this.
  ['desk', 'album'].forEach(function (door) {
    const g = harness(door, ['a'], { a: BLESSED });
    g.answer('a', 'safe');
    if (g.S.walkBlessed.length !== 0 || g.S.whyWanted.length !== 0) {
      fail('the ' + door + ' door collected walk state — the why step is ' +
        'walk-scoped (#99 ruling 1)');
    }
    if (g.note('a').innerHTML !== '') {
      fail('the ' + door + ' door rendered the why block — that door is a ' +
        'way into the room, not a beat inside a sitting (#99 ruling 1)');
    }
  });

  // (e) A SET-ASIDE IS NOT A WELCOME. The why step is disjoint by verdict
  //     (26.8-02): no why block follows a never-show.
  //
  // ⚖️ AMENDED 2026-08-17 BY THE OWNER (UAT session 2, F-16). This case used
  // to assert the note slot was EMPTY — "nothing follows a never-show but
  // silence" — and that was true until she ruled otherwise on her own room.
  // `put it away for good` applied on ONE TAP with nothing asked and put a
  // real photograph of hers on the never-show list; she ruled a beat that
  // says one line and offers a way back. ⛔ WHAT THIS CASE WAS ACTUALLY
  // PROTECTING SURVIVES AND IS NOW STATED DIRECTLY: the WHY step is for
  // welcomes and must never follow a set-aside. Asserting emptiness said that
  // only by accident, and would have gone red on her ruling while claiming a
  // rule she never made.
  h = harness('walk', ['a'], { a: { state: 'never_show' } });
  h.answer('a', 'never');
  if (h.S.walkBlessed.length !== 0) {
    fail('a set-aside was recorded as a welcome');
  }
  const asideNote = h.note('a').innerHTML;
  if (asideNote.indexOf('why-prompt') !== -1 ||
      asideNote.indexOf('why-doors') !== -1) {
    fail('the why step rendered after a set-aside — it holds only after a ' +
      'bless verdict (26.8-02)');
  }
  // ...and the beat she DID rule is there, in her own words.
  if (asideNote.indexOf('offer-said') === -1 ||
      asideNote.indexOf('offer-aside-undo') === -1 ||
      asideNote.indexOf('offer-goon') === -1) {
    fail('the set-aside beat did not render (C-14, hers): a permanent answer ' +
      'applied and the room said nothing and offered no way back. That is ' +
      'the exact finding she raised on 2026-08-17');
  }

  // (f) TWO WELCOMES ON ONE PAGE. An Offer can carry three, so the row
  //     before must record its default and give up its doors: exactly one
  //     block stands, and every welcome leaves exactly ONE entry (Open Q3).
  h = harness('walk', ['a', 'b'], { a: BLESSED, b: BLESSED });
  h.answer('a', 'safe');
  h.answer('b', 'safe');
  if (h.note('a').innerHTML !== '') {
    fail("an earlier row's doors were left standing while a later row " +
      'held — those buttons would drive against the wrong picture');
  }
  if (!needDoors(h, 'b', 'the second welcome on a page')) {
    fail('the second welcome on a page was not offered the doors');
  }
  blessPosts = h.rec.posts.filter(function (p) {
    return p.url === '/api/blessings';
  });
  if (blessPosts.length !== 1 || blessPosts[0].body.item_id !== 'a') {
    fail('the row before did not record its one entry when the next row ' +
      'took the block (got ' + JSON.stringify(blessPosts.map(function (p) {
        return p.body.item_id;
      })) + ')');
  }
  if (JSON.stringify(h.S.walkBlessed) !== JSON.stringify(['a', 'b'])) {
    fail('both welcomes must reach the reflection (got ' +
      JSON.stringify(h.S.walkBlessed) + ')');
  }

  // (g) HER OWN WORDS STILL WORK, and they are the author of record.
  h = harness('walk', ['a'], { a: BLESSED });
  h.answer('a', 'safe');
  d = needDoors(h, 'a', 'the keep-it door');
  if (d) {
    d.input.value = 'it was the summer we moved';
    d.keep.fire('click');
  }
  blessPosts = h.rec.posts.filter(function (p) {
    return p.url === '/api/blessings';
  });
  if (blessPosts.length !== 1 || blessPosts[0].body.author !== 'user' ||
      blessPosts[0].body.why !== 'it was the summer we moved') {
    fail('the keep-it door did not record her own words as hers (got ' +
      JSON.stringify(blessPosts.map(function (p) { return p.body; })) + ')');
  }
  if (h.S.whyWanted.length !== 0) {
    fail('writing her own why must not also ask the librarian for one');
  }

  // (h) MOVE ON records the warm default, once — never a punishment (D-34).
  h = harness('walk', ['a'], { a: BLESSED });
  h.answer('a', 'safe');
  d = needDoors(h, 'a', 'the move-on door');
  if (d) { d.moveOn.fire('click'); }
  blessPosts = h.rec.posts.filter(function (p) {
    return p.url === '/api/blessings';
  });
  if (blessPosts.length !== 1 || blessPosts[0].body.author !== 'default') {
    fail('the move-on door must leave exactly one warm-default entry');
  }

  // (i) 26.95-38 — THE OFFER'S ENDING, AND THE OWNER'S EXCEPTION TO IT.
  //     UAT finding F-3, her words: «after I selected everything I feel
  //     joyful or not there is no further guidance in this UI so I won't know
  //     if I am done or not». Her ruling: the room comes back on the last
  //     answer. Her exception, taken on the collision this group is about: a
  //     held why owns the ending, because closing over the question the room
  //     has just asked would delete the door #99 put back.
  //
  //     ⚠ THIS IS THE ONLY PLACE THE EXCEPTION CAN BE DRIVEN THROUGH THE REAL
  //     DOORS. The render suite proves the ending reads the hold; only here
  //     does a real welcome open a real block and a real door close it.
  h = harness('walk', ['a', 'b'], { a: BLESSED, b: BLESSED });
  h.answer('a', 'safe');
  if (h.rec.popped !== 0) {
    fail('the room came back after the FIRST of two answers — an ending ' +
      'that fires on every answer is not an ending (F-3)');
  }
  h.answer('b', 'safe');
  if (!h.allAnswered()) {
    fail('both pictures are answered and the Offer does not know it — the ' +
      'ending can never fire');
  }
  if (h.rec.popped !== 0) {
    fail('the room came back while the why block was still holding — the ' +
      'last picture she welcomed would never have been asked about, which ' +
      'is the regression her exception exists to prevent (got ' +
      h.rec.popped + ' pops)');
  }
  d = needDoors(h, 'b', 'the last welcome on a finished Offer');
  if (d) { d.moveOn.fire('click'); }
  if (h.rec.popped !== 1) {
    fail('the room did not come back when the held why let go — the ending ' +
      'waited for it and must fire exactly once (got ' + h.rec.popped +
      ' pops)');
  }
  //     ...and every door out of the block ends the same way, because they
  //     all funnel through whyAdvance. Driven per door rather than assumed
  //     from the funnel: the funnel is the reason, not the evidence.
  [['the librarian door', function (doors) { doors.librarian.fire('click'); }],
    ['the keep-it door with her own words', function (doors) {
      doors.input.value = 'the light that afternoon';
      doors.keep.fire('click');
    }],
    ['an empty keep', function (doors) { doors.keep.fire('click'); }]]
    .forEach(function (row) {
      const g = harness('walk', ['a'], { a: BLESSED });
      g.answer('a', 'safe');
      if (g.rec.popped !== 0) {
        fail(row[0] + ': the room came back before the why was answered');
      }
      const doors = needDoors(g, 'a', row[0]);
      if (doors) { row[1](doors); }
      if (g.rec.popped !== 1) {
        fail(row[0] + ' did not bring the room back on a finished Offer ' +
          '(got ' + g.rec.popped + ' pops)');
      }
    });
  //     ...and the two doors that are NOT the walk end immediately, because
  //     no why is ever held on them (#99 ruling 1).
  ['desk', 'album'].forEach(function (door) {
    const g = harness(door, ['a'], { a: BLESSED });
    g.answer('a', 'safe');
    if (g.rec.popped !== 1) {
      fail('the ' + door + ' door did not bring the room back on its last ' +
        'answer — only the walk has a why to wait for (got ' + g.rec.popped +
        ' pops)');
    }
  });
  //     ⚠ AND A TWO-PICTURE DESK OFFER, WHICH IS THE ONLY SHAPE IN THIS
  //     GROUP THAT CAN SEE AN all-answered TEST THAT IS NOT REALLY TESTING
  //     all-answered. Found by mutation drill: with reachAllAnswered forced
  //     to true, every case above still passed — the walk cases because a
  //     held why absorbed the early close, and the desk cases because they
  //     carried ONE picture, for which "the first" and "the last" are the
  //     same answer. This one has neither excuse.
  {
    const g = harness('desk', ['a', 'b'], { a: BLESSED, b: BLESSED });
    g.answer('a', 'safe');
    if (g.rec.popped !== 0) {
      fail('the desk door brought the room back after the FIRST of two ' +
        'answers, with no why to wait for — the ending is not reading ' +
        'whether the Offer is finished (got ' + g.rec.popped + ' pops)');
    }
    // 26.95-39 (F-2): ...and what it did instead was bring the NEXT picture.
    // Asserted as a positive one rather than left as "it did not close": an
    // answer that caused nothing at all would satisfy the zero above and
    // would leave her looking at a picture she has already answered.
    if (g.rec.painted !== 1) {
      fail('the first answer did not bring the next picture — under one ' +
        'picture per window that leaves her looking at a picture she has ' +
        'already answered (got ' + g.rec.painted + ' repaints)');
    }
    g.answer('b', 'safe');
    if (g.rec.popped !== 1) {
      fail('...and then did not bring it back on the second (got ' +
        g.rec.popped + ' pops)');
    }
    if (g.rec.painted !== 1) {
      fail('the LAST answer repainted instead of closing — the room comes ' +
        'back, it does not paint an empty page first (got ' + g.rec.painted +
        ' repaints)');
    }
  }
  //     ⚠ AND THE THREE OUTCOMES ARE MUTUALLY EXCLUSIVE ON THE WALK TOO: a
  //     welcome that opens the why box must cause NEITHER. Without this, an
  //     advance that fired while the block held would tear the question off
  //     the screen and still leave every count above satisfied.
  {
    const g = harness('walk', ['a', 'b'], { a: BLESSED, b: BLESSED });
    g.answer('a', 'safe');
    if (g.rec.painted !== 0 || g.rec.popped !== 0) {
      fail('a welcome that opened the why box also moved the page — the ' +
        'question the room just asked would be gone before she could ' +
        'answer it (got ' + g.rec.painted + ' repaints, ' + g.rec.popped +
        ' pops)');
    }
    const doors = needDoors(g, 'a', 'the held why on a two-picture Offer');
    if (doors) { doors.moveOn.fire('click'); }
    if (g.rec.painted !== 1 || g.rec.popped !== 0) {
      fail('...and when the why let go it did not bring the next picture ' +
        '(got ' + g.rec.painted + ' repaints, ' + g.rec.popped + ' pops)');
    }
  }
  //     NEGATIVE CONTROL ON THE GUARD: the same finished Offer, with
  //     something else on top of the view stack, closes nothing. Without
  //     this the ending would be a function that pops an arbitrary view.
  {
    const g = harness('desk', ['a'], { a: BLESSED });
    g.setViewTop({ view: 'reader', id: 'x' });
    g.answer('a', 'safe');
    if (g.rec.popped !== 0) {
      fail('a finished Offer that is not the thing on top still popped — ' +
        'the ending closed a view it does not own');
    }
  }

  // ---- and the wiring the drive above cannot reach --------------------------

  // (i) THE BEAT MUST NOT RESOLVE BEFORE SHE HAS ANSWERED. 26.95-32's
  //     same-tap resolve fired the session's ONE POST on the tap that OPENED
  //     the page, so everything the drive above collects would have arrived
  //     too late to be sent. ⚠ And the spent-Offer guard is load-bearing the
  //     moment that resolve goes: reachDoorOpen returns on REACH.spent
  //     WITHOUT running its quiet branch, so without the guard a visit whose
  //     Offer another door already spent would wait forever.
  const begin = functionBody('sessionWalkBegin');
  if (countOf(begin, 'sessionWalkSkip();') !== 1) {
    fail('sessionWalkBegin must call sessionWalkSkip() exactly once — as ' +
      'the spent-Offer guard, never as a same-tap resolve that posts the ' +
      'session before she has answered anything (map #50 / #99)');
  }
  if (begin.indexOf('if (REACH.spent) { sessionWalkSkip(); return; }') === -1) {
    fail('sessionWalkBegin lost the spent-Offer guard — a visit whose ' +
      'Offer another door already spent would never resolve the beat');
  }

  // (j) THE PAGE IS TAGGED AS THE WALK'S, and the pop reads that tag. These
  //     are the two ends of one wire: the tag without the close, or the
  //     close without the tag, is a session that never posts.
  if (functionBody('openOfferPage').indexOf("walk: doorName === 'walk'")
      === -1) {
    fail("openOfferPage must tag the walk's own Offer (opts.walk) — " +
      'popView has no other way to know which spread closes the beat');
  }
  const pop = functionBody('popView');
  if (countOf(pop, 'sessionWalkClose();') !== 2) {
    fail('popView must close the walk stage on BOTH tagged pops — the ' +
      "shipped walk spread's and the Offer's (the Offer sets no " +
      'BLESS.spread, so the shipped branch can never reach it)');
  }

  // (k) THE CLOSE FACTS ARE RE-SOURCED. SESSION.walkIds is retired to a
  //     permanently empty list (26.95-30 forbids deleting it), so a close
  //     that still filtered it would hand the reflection nothing — which is
  //     precisely the defect this group exists for.
  const close = functionBody('sessionWalkClose');
  if (close.indexOf('SESSION.walkIds') !== -1) {
    fail('sessionWalkClose still derives its close facts from the retired ' +
      'SESSION.walkIds — that list is never assigned, so both facts would ' +
      'be empty and the reflection would learn nothing (map #50 / #99)');
  }
  if (close.indexOf('SESSION.walkBlessed = (SESSION.walkBlessed') === -1) {
    fail('sessionWalkClose must re-filter the welcomes it collected ' +
      'against the store snapshot the taps kept honest — the seam derives ' +
      'its close facts from the store, never from what the client believes');
  }
})();

// ---- THE CAMERA IS NEVER STUCK (26.95-45, UAT F-11) -------------------------
//
// ⚠⚠ THIS SECTION EXISTS BECAUSE A TEXT PIN COULD NOT SEE THE DEFECT. The
// camera already carried three gates in tests/test_diegetic_wiring.cjs — the
// duration literal, the reduced-motion block, and a pin that zoomRun's teardown
// names transitionend AND transitioncancel. All three were GREEN while the room
// could be left permanently mid-zoom, because a pin can only see what somebody
// thought to look for, and nobody had asked WHAT HAPPENS WHEN NEITHER EVENT
// ARRIVES. `thenSwap` is called from nowhere else, so the open never completes:
// the view never changes, and the visit's ONE Offer is already spent.
//
// So this drives the shipped functions instead of reading them. The claim is
// the one the section header has always made and never checked — «every path
// through these functions runs thenSwap() exactly once» — and it is asserted as
// a COUNT on every path, including the two that used to run it zero times.
(function () {
  function fail(msg) { violations.push('[camera] ' + APP + ': ' + msg); }

  // opts: { visibility, reducedMotion, top }
  function harness(opts) {
    const rec = { swaps: 0, armed: 0, sceneListeners: {}, docListeners: {} };
    const api = new Function('rec', 'opts', `
      var sceneEl = {
        // a real element reports '' for an unset inline transform, never
        // undefined — the fake says what the browser says, so "nothing is
        // resting" means the same thing here as it does in the room.
        cls: {}, style: { transform: '', transformOrigin: '' }, offsetWidth: 0,
        classList: {
          add: function (c) { sceneEl.cls[c] = true; rec.armed++; },
          remove: function (c) { delete sceneEl.cls[c]; },
          contains: function (c) { return !!sceneEl.cls[c]; }
        },
        addEventListener: function (t, fn) { rec.sceneListeners[t] = fn; }
      };
      var document = {
        visibilityState: opts.visibility,
        addEventListener: function (t, fn) { rec.docListeners[t] = fn; },
        removeEventListener: function (t) { delete rec.docListeners[t]; }
      };
      var window = {
        matchMedia: function () { return { matches: !!opts.reducedMotion }; }
      };
      // every scene id resolves to the one fake — which scene the camera
      // picks is zoomSceneFor's business and it is lifted, not restated.
      function $() { return sceneEl; }
      function currentView() { return { view: opts.top || 'room' }; }
      ${functionBody('zoomSceneFor')}
      ${functionBody('zoomMotionAllowed')}
      ${functionBody('zoomRun')}
      ${functionBody('zoomToView')}
      ${functionBody('zoomBackFromView')}
      return {
        scene: sceneEl,
        into: function () { zoomToView(null, function () { rec.swaps++; }); },
        back: function () { zoomBackFromView(function () { rec.swaps++; }); },
        // the browser stops drawing the page — the ONE thing the room could
        // not survive before this plan.
        undraw: function () {
          document.visibilityState = 'hidden';
          if (rec.docListeners.visibilitychange) {
            rec.docListeners.visibilitychange();
          }
        },
        fire: function (t) {
          if (rec.sceneListeners[t]) { rec.sceneListeners[t](); }
        }
      };
    `)(rec, opts);
    return { rec: rec, api: api };
  }

  function resting(h, where) {
    if (h.api.scene.classList.contains('view-zooming')) {
      fail(where + ': the scene still wears view-zooming after the move ' +
        'settled — nothing fractional may rest (Pitfall 5)');
    }
    if (h.api.scene.style.transform !== '') {
      fail(where + ': a transform is still resting on the scene after the ' +
        'move settled — the class and the transform leave in the SAME ' +
        'teardown');
    }
    if (h.rec.docListeners.visibilitychange) {
      fail(where + ': the in-flight watch outlived its move. It sits on the ' +
        'document, so unlike the two `once` scene listeners it does not ' +
        'retire itself, and one per open would accumulate for the session');
    }
  }

  // (a) THE SHIPPED PATH IS UNCHANGED: a drawn page with motion allowed ARMS
  //     the move and waits, and lands the swap on transitionend — once.
  let h = harness({ visibility: 'visible' });
  h.api.into();
  if (h.rec.armed !== 1) {
    fail('(a) a drawn page with motion allowed must still ARM the eased ' +
      'move — the camera is not being disabled here, only asked one ' +
      'question earlier. Armed ' + h.rec.armed + ' time(s)');
  }
  if (h.rec.swaps !== 0) {
    fail('(a) ...and must NOT have cut yet: the swap lands at transitionend ' +
      '(D-07). It ran ' + h.rec.swaps + ' time(s) before any event');
  }
  h.api.fire('transitionend');
  if (h.rec.swaps !== 1) {
    fail('(a) transitionend must land the swap exactly once. It ran ' +
      h.rec.swaps + ' time(s)');
  }
  resting(h, '(a)');
  h.api.fire('transitionend');
  if (h.rec.swaps !== 1) {
    fail('(a) a second transitionend must change nothing — the `done` latch ' +
      'is what transitioncancel has always leaned on. Swaps: ' + h.rec.swaps);
  }

  // (b) ⛔ THE MEASURED FAILURE: the page is not being drawn when the move is
  //     asked for. No transition is ever created on such a page, so the event
  //     the teardown rides can never arrive.
  h = harness({ visibility: 'hidden' });
  h.api.into();
  if (h.rec.swaps !== 1) {
    fail('(b) THE F-11 STATE: the camera was asked to move on a page the ' +
      'browser is not drawing, and the swap ran ' + h.rec.swaps + ' time(s). ' +
      'It must cut straight through, exactly as reduced motion does — no ' +
      'transition is ever created on an undrawn page, so waiting for one ' +
      'leaves the room mid-zoom with the one Offer of the visit spent');
  }
  if (h.rec.armed !== 0) {
    fail('(b) ...and nothing may be ARMED on the way: a class and a ' +
      'transform applied to a page that will never animate them is the ' +
      'stuck state itself. Armed ' + h.rec.armed + ' time(s)');
  }
  resting(h, '(b)');

  // (c) the same question on the way OUT. popView rides zoomBackFromView, so
  //     an undrawn page would strand her INSIDE a spread with no way back —
  //     worse than the way in, because every exit path funnels through it.
  h = harness({ visibility: 'hidden', top: 'spread' });
  h.api.back();
  if (h.rec.swaps !== 1) {
    fail('(c) leaving a view on an undrawn page must cut through too — all ' +
      'four exit paths (Escape, the dim edge, the scrim, the back arrow) ' +
      'funnel through this one function. Swaps: ' + h.rec.swaps);
  }
  if (h.rec.armed !== 0) {
    fail('(c) ...and arms nothing. Armed ' + h.rec.armed + ' time(s)');
  }

  // (d) THE IN-FLIGHT HALF: the move is armed on a drawn page, and the page
  //     stops being drawn before the event arrives — she put the room behind
  //     another window during the 300ms.
  h = harness({ visibility: 'visible' });
  h.api.into();
  if (h.rec.swaps !== 0) { fail('(d) precondition: the move must be waiting'); }
  h.api.undraw();
  if (h.rec.swaps !== 1) {
    fail('(d) a move whose page stopped being drawn must settle, not hang. ' +
      'Swaps: ' + h.rec.swaps);
  }
  resting(h, '(d)');
  h.api.fire('transitionend');
  if (h.rec.swaps !== 1) {
    fail('(d) ...and if the browser DOES deliver the event later, it costs ' +
      'nothing — the teardown is one teardown and the latch holds. Swaps: ' +
      h.rec.swaps);
  }

  // (e) REDUCED MOTION IS UNTOUCHED — the shipped cut, still cutting, and
  //     still arming nothing. This is a control: if the new guard had been
  //     written so broadly that it swallowed this path too, (b) would pass
  //     for the wrong reason.
  h = harness({ visibility: 'visible', reducedMotion: true });
  h.api.into();
  if (h.rec.swaps !== 1 || h.rec.armed !== 0) {
    fail('(e) reduced motion must still cut straight through and arm ' +
      'nothing (the cut IS the reduced-motion experience). Swaps: ' +
      h.rec.swaps + ', armed: ' + h.rec.armed);
  }
})();

// ---- 26.995-05 (D-06): ONE NAME, AND THE CLIENT DOES NOT DERIVE IT ---------
//
// ⛔ THE ANTI-PATTERN THIS PINS ABSENT. `sessionOpenSpread` used to pull the
// essay's first markdown heading out of the draft with a regex of its own and
// fall back to a literal of its own — a SECOND derivation of a value the
// server already computes. D-04 deletes the required heading outright, so
// that regex would have matched nothing on every letter and every fragment
// reflection and silently shown its fallback instead of the name the room
// chose for the essay.
//
// Three pins, and the third is the one that matters: the last-resort string
// the client keeps must be the SERVER'S OWN, asserted across the two files by
// value. The one thing worse than two derivations is two fallbacks that
// disagree about what an unnamed reflection is called.
(function reflectionNameIsReadNeverDerived() {
  const spreadFn = functionBody('sessionOpenSpread');

  // (a) the derivation is GONE from the reflection spread.
  if (/match\(\s*\/\^\\s\*#\{1,6\}/.test(spreadFn) ||
      spreadFn.indexOf('#{1,6}') !== -1) {
    violations.push('[name] ' + APP + ': sessionOpenSpread derives a ' +
      'reflection title from the draft\'s first heading again. D-06 ' +
      'ended that: the server sends the name, the client reads it. ' +
      'D-04 deletes the required heading, so this regex finds nothing ' +
      'on a letter and shows the fallback in silence.');
  }
  if (appSrc.indexOf('a reflection, taking shape\'') !== -1 &&
      spreadFn.indexOf('a reflection, taking shape') !== -1) {
    violations.push('[name] ' + APP + ': the spread\'s own literal ' +
      'fallback title is back — it was deleted with the derivation');
  }

  // (b) the spread reads the mirrored server value, and the mirror is fed
  //     from the readouts rather than invented.
  if (spreadFn.indexOf('SESSION.name') === -1) {
    violations.push('[name] ' + APP + ': sessionOpenSpread must title the ' +
      'spread from SESSION.name — the name the SERVER produced');
  }
  const reads = (appSrc.match(/SESSION\.name = typeof data\.name/g) || []);
  if (reads.length !== 3) {
    violations.push('[name] ' + APP + ': the session readouts must mirror ' +
      'data.name at all THREE draft-landing sites (resume, fetch-draft, ' +
      'resync) — found ' + reads.length);
  }
  const resets = (appSrc.match(/SESSION\.name = null;/g) || []);
  if (resets.length !== 2) {
    violations.push('[name] ' + APP + ': SESSION.name must reset with the ' +
      'rest of the sitting at BOTH reset sites — found ' + resets.length);
  }

  // (c) ⛔ THE CROSS-FILE PIN, BY VALUE. The client's last-resort string and
  //     the server's must be the same literal. Both are LIFTED, never
  //     re-typed here: typing either into this file would put the value in a
  //     third place and let the two real ones drift apart unnoticed — the
  //     mirror trap this project has now recorded eleven times.
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const serverFallback = (serverSrc.match(
    /def _reflection_book_title\(draft\):[\s\S]*?\n    return "([^"]+)"\n/));
  const clientFallback = (spreadFn.match(
    /title: SESSION\.name \|\| '([^']+)'/));
  if (!serverFallback) {
    violations.push('[name] server.py: _reflection_book_title\'s literal ' +
      'last resort could not be lifted — it is the value this pin ' +
      'compares against, so an unliftable one is a dead pin');
  } else if (!clientFallback) {
    violations.push('[name] ' + APP + ': sessionOpenSpread\'s last-resort ' +
      'title could not be lifted');
  } else if (serverFallback[1] !== clientFallback[1]) {
    violations.push('[name] the two last-resort titles DISAGREE: server ' +
      'says ' + JSON.stringify(serverFallback[1]) + ', client says ' +
      JSON.stringify(clientFallback[1]) + '. One name, one fallback.');
  }
})();

// ---- 26.995-12 (D-13): THE READ-WHOLE VIEW COMPOSES NO LABELLED FOOTER ------
//
// ⛔⛔ THIS GATE EXISTS BECAUSE NOTHING GUARDED THE CLIENT-SIDE PRODUCER, and
// the mutation drill is what found that out. The label had TWO independent
// producers: server.py, which built the saved artefact (the store item, the
// book, the vault file), and `sessionOpenSpread` here, which built the
// read-whole view. Neither read the other; each composed the heading itself.
//
// RESEARCH's documented warning sign for a half-done job is exactly this: A
// GREEN SUITE AFTER TOUCHING ONLY THE SERVER — because every suite that reads
// the persisted file is blind to the view. Restoring the client-side append
// alone SURVIVED the whole python tree, which is the definition of an
// unguarded surface, and the mismatch it produces surfaces to HER: a saved
// reflection without the section, a read-whole view still showing it.
//
// HER RULING: the label goes, and the librarian weaves what she added into
// the writing itself, so her addition survives in HER words rather than as
// the room's summary under a heading.
//
// ⚠ THE RETIRED HEADING IS SPELLED HERE, ONCE, INSIDE THE GATE THAT FORBIDS
// IT. That is the point: this file is not scanned by the
// zero-occurrences check over server.py and app.js, so it is a safe place for
// the literal to survive — and a literal that survives nowhere cannot be
// forbidden by name.
(function theReadWholeViewAppendsNoLabelledSection() {
  const RETIRED = '## from our conversation';
  const spreadFn = functionBody('sessionOpenSpread');

  // (a) the composition itself
  if (spreadFn.indexOf(RETIRED) !== -1) {
    violations.push('[coda] ' + APP + ': sessionOpenSpread appends the ' +
      'retired ' + JSON.stringify(RETIRED) + ' section to the full read ' +
      'again. D-13 deleted it from BOTH producers in one change — the ' +
      'saved artefact in server.py and this view — because deleting one ' +
      'alone leaves the other and the mismatch surfaces to her.');
  }
  // (b) the whole file, so the append cannot simply move to a helper
  if (appSrc.indexOf(RETIRED) !== -1) {
    violations.push('[coda] ' + APP + ': the retired labelled heading is ' +
      'back somewhere in this file. It is gone from the room\'s code, ' +
      'not merely from one function.');
  }
  // (c) the slice it fed is gone too — a field nobody prints is a field
  //     nobody checks, so the mirror must not return either.
  if (/SESSION\.coda/.test(appSrc)) {
    violations.push('[coda] ' + APP + ': SESSION.coda is back. The field ' +
      'left the WIRE in 26.995-12; a slice mirroring it would hold a ' +
      'value nothing can fill and nothing can read.');
  }
  if (/data\.coda/.test(appSrc)) {
    violations.push('[coda] ' + APP + ': a readout mirror for data.coda ' +
      'is back — the server sends no such field.');
  }
  // (d) THE UNMUTATED CONTROL, in the same gate. Without it every check
  //     above passes just as happily for a `functionBody` that returned ''
  //     and an `appSrc` that failed to load — an absence gate that examined
  //     nothing would report perfect health.
  if (spreadFn.length < 200 || appSrc.length < 100000) {
    violations.push('[coda] ' + APP + ': the source under this gate looks ' +
      'empty (spread ' + spreadFn.length + ' chars, file ' +
      appSrc.length + ') — an absence gate that examined nothing must ' +
      'not pass');
  }
  if (spreadFn.indexOf('SESSION.draft') === -1) {
    violations.push('[coda] ' + APP + ': sessionOpenSpread must still ' +
      'build the full read from the DRAFT — her words live there now, ' +
      'and a view that stopped reading it would pass every absence ' +
      'check above while showing her nothing');
  }
})();

// ---- W-6: a candle tap during a collect is ANSWERED, in HER sentence --------
//
// ⛔⛔ HER RULING 2026-08-25 (record: 26.995-OWNER-RULING-2026-08-25-skip-new-
// videos-and-the-candle-says-so.md): "we need to have a message when the user
// is tapping the candle otherwise it feels like the librarian is broken" —
// after TWO silently swallowed taps in one night. The wording was CHOSEN from
// an offered set of three; the behaviour was volunteered. Both halves are
// pinned here: the sentence byte-for-byte, and the guard arm that seats it.
(function () {
  // (a) the sentence, ONE contiguous double-quoted literal, byte-equal to
  //     her chosen line (the apostrophe in "it's" is why double quotes).
  const HER_COLLECT_BUSY_LINE = "the librarian is here. the room is still " +
    "collecting. the candle lights when it's done.";
  const litMatch = /var SESSION_COLLECT_BUSY_LINE = "([^"]*)";/.exec(appSrc);
  if (!litMatch) {
    violations.push('[W-6] ' + APP + ': SESSION_COLLECT_BUSY_LINE is ' +
      'missing or not one contiguous double-quoted literal — her ' +
      'mid-collect candle answer has no source sentence.');
  } else if (litMatch[1] !== HER_COLLECT_BUSY_LINE) {
    violations.push('[W-6] ' + APP + ': SESSION_COLLECT_BUSY_LINE ships ' +
      JSON.stringify(litMatch[1]) + ', which is NOT the sentence she chose. ' +
      'Her words first, in the ruling record, then here — never the other ' +
      'way round. The punctuation and the lowercase are hers (re-ruled 2026-08-30).');
  }
  // (b) the guard arm: the REPULL.busy swallow now sets the flag and seats
  //     the note. Absence = the silent refusal she ruled out is back.
  if (!/REPULL\.candleAsked = true;\s*\n\s*candleBusyNoteSeat\(\);/.test(
      appSrc)) {
    violations.push('[W-6] ' + APP + ': the session guard\'s REPULL.busy ' +
      'arm no longer answers her tap (candleAsked + candleBusyNoteSeat) — ' +
      'the 26.995-FINDING-2026-08-25 silent refusal is back.');
  }
  // (c) the seat builds with textContent, never an HTML sink, and re-seats
  //     from the progress renderer so the poll's repaints cannot wipe it.
  const seatFn = /function candleBusyNoteSeat\(\) \{[\s\S]*?\n  \}/.exec(
    appSrc);
  if (!seatFn) {
    violations.push('[W-6] ' + APP + ': candleBusyNoteSeat is missing.');
  } else {
    if (seatFn[0].indexOf('textContent') === -1 ||
        seatFn[0].indexOf('innerHTML') !== -1) {
      violations.push('[W-6] ' + APP + ': candleBusyNoteSeat must build ' +
        'her sentence with textContent and never an HTML sink.');
    }
  }
  if (!/if \(REPULL\.candleAsked\) \{ candleBusyNoteSeat\(\); \}/.test(
      appSrc)) {
    violations.push('[W-6] ' + APP + ': renderAdapterProgress no longer ' +
      're-seats her answer after its repaint — the note dies within one ' +
      'progress tick and the answer is a flicker, not a message.');
  }
  // (d) the unmutated control: an empty source must not pass this gate.
  if (appSrc.length < 100000) {
    violations.push('[W-6] ' + APP + ': the source under this gate looks ' +
      'empty (' + appSrc.length + ' chars) — a gate that examined nothing ' +
      'must not pass.');
  }
})();

// ---- W-7 (behaviour only): the walk doors acknowledge her press -------------
//
// ⛔ HER RULING 2026-08-25, verbatim: "I think these 2 buttons can be
// responsible right away". The begin door disables both buttons and seats the
// shipped interim word in the SAME gesture as the press — before the reach
// chain's first network read. ⚠ 'checking…' is reused shipped copy, not new
// wording; if she rules a sentence for this moment, it replaces the reuse and
// this gate's needle moves with it, citing her record.
(function () {
  const ackFn = /function walkDoorsAcknowledge\(\) \{[\s\S]*?\n    \}/.exec(
    appSrc);
  if (!ackFn) {
    violations.push('[W-7] ' + APP + ': walkDoorsAcknowledge is missing — ' +
      'the walk doors are back to answering her press with nothing.');
    return;
  }
  if (ackFn[0].indexOf('disabled = true') === -1 ||
      ackFn[0].indexOf('textContent') === -1) {
    violations.push('[W-7] ' + APP + ': the acknowledgment must disable ' +
      'both doors and seat its word via textContent.');
  }
  if (!/walkDoorsAcknowledge\(\);\s*\n\s*sessionWalkBegin\(\);/.test(
      appSrc)) {
    violations.push('[W-7] ' + APP + ': the begin door no longer ' +
      'acknowledges BEFORE it walks — the press answers first, then the ' +
      'chain runs.');
  }
})();

// ---- W-8 (behaviour only): THE REFLECTION GOES FIRST — her 2026-08-25 ruling
//
// ⛔⛔ Verbatim, volunteered: "I don't think the question to ask the user to go
// over aged photos should be listed before the reflection." Option chosen
// with the cost stated (what she welcomes reaches the NEXT reflection).
// Record: 26.995-OWNER-RULING-2026-08-25-the-reflection-before-the-aged-
// photos-question.md. This supersedes 26.95-35's placement BY HER OWN HAND.
(function () {
  const stage = /function sessionWalkStage\(\) \{[\s\S]*?\n  \}/.exec(appSrc);
  if (!stage) {
    violations.push('[W-8] ' + APP + ': sessionWalkStage is missing.');
    return;
  }
  // (a) the fresh launch REMEMBERS and resolves — it never paints the walk
  //     between her tap and the reflection any more.
  if (!/WALK_AFTER\.due = true;\s*\n\s*sessionWalkSkip\(\);/.test(stage[0])) {
    violations.push('[W-8] ' + APP + ': sessionWalkStage\'s launch arm must ' +
      'set WALK_AFTER.due and resolve via sessionWalkSkip — the ' +
      'pre-reflection walk card is back otherwise, against her ruling.');
  }
  if (stage[0].indexOf("SESSION.view = 'walk';") !== -1) {
    violations.push('[W-8] ' + APP + ': sessionWalkStage paints the walk ' +
      'view again — the question stood before the reflection for three dead ' +
      'sittings in one night and she ruled it moves after.');
  }
  // (b) the card is offered where she ruled: after the paper settles.
  const settle = /function sessionSettleAway\([\s\S]*?\n  \}/.exec(appSrc);
  if (!settle || settle[0].indexOf('sessionAfterReadingDoors();') === -1) {
    violations.push('[W-8] ' + APP + ': sessionSettleAway\'s finish must ' +
      'offer the after-reading doors — otherwise the question is simply ' +
      'GONE, which is not what she ruled.');
  }
  // (c) the after-doors function: consumes the memory once, respects the
  //     one-Offer-per-visit rule, opens the SESSION-FREE door (never the
  //     'walk'-tagged one), builds with textContent, and acknowledges the
  //     press (W-7) before the chain runs.
  const after = /function sessionAfterReadingDoors\(\) \{[\s\S]*?\n  \}/.exec(
    appSrc);
  if (!after) {
    violations.push('[W-8] ' + APP + ': sessionAfterReadingDoors is missing.');
    return;
  }
  const a = after[0];
  if (a.indexOf('WALK_AFTER.due = false;') === -1 ||
      a.indexOf('if (REACH.spent) { return; }') === -1) {
    violations.push('[W-8] ' + APP + ': the after-doors must consume ' +
      'WALK_AFTER.due exactly once and paint nothing on a spent Offer.');
  }
  if (a.indexOf("reachDoorOpen('after'") === -1 ||
      a.indexOf("reachDoorOpen('walk'") !== -1) {
    violations.push('[W-8] ' + APP + ': the after-doors must open the ' +
      "session-free 'after' door — the 'walk'-tagged spread close belongs " +
      'to the retired pre-reflection beat and must not fire on a sitting ' +
      'that is already over.');
  }
  if (a.indexOf('innerHTML') !== -1 || a.indexOf('textContent') === -1) {
    violations.push('[W-8] ' + APP + ': the card must build with ' +
      'textContent and never an HTML sink.');
  }
  if (a.indexOf('disabled = true') === -1 ||
      a.indexOf("textContent = 'checking…'") === -1) {
    violations.push('[W-8] ' + APP + ': the press must be acknowledged in ' +
      'its own gesture (W-7 — doors disable, the shipped interim word ' +
      'seats) before the reach chain runs.');
  }
})();

// ---- 26.997-03 Task 1: Don't show a walk begin the room cannot honor ------
//
// 2026-08-21: a control the room cannot act on is not drawn. While a photo
// fetch holds the door (REPULL.busy — the same narrow in-flight collect
// fact the candle busy note already uses), look-through-them cannot start
// work, so sessionPaintWalkOpen must omit that button. Idle still draws it.
// No new owner-facing sentence: absence of the control, not why-missing copy.
(function () {
  const paintSrc = functionBody('sessionPaintWalkOpen');
  if (paintSrc.indexOf('REPULL.busy') === -1) {
    violations.push('[26.997-03] ' + APP + ': sessionPaintWalkOpen must ' +
      'read REPULL.busy — the same collect-in-flight fact the candle busy ' +
      'note uses — before drawing the begin door');
  }

  function paintWalk(busy) {
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
    fn(spot,
      { walkBookend: 'BOOKEND', walkQuiet: 'not today' },
      function (s) { return String(s); },
      { busy: !!busy },
      function () {},
      function () {})(spot);
    return spot.innerHTML;
  }

  const idle = paintWalk(false);
  if (idle.indexOf('session-walk-begin') === -1 ||
      idle.indexOf('look through them') === -1) {
    violations.push('[26.997-03] ' + APP + ': idle walk open must still ' +
      'draw the begin door (session-walk-begin / look through them)');
  }
  const held = paintWalk(true);
  if (held.indexOf('session-walk-begin') !== -1 ||
      held.indexOf('look through them') !== -1) {
    violations.push('[26.997-03] ' + APP + ': walk open must omit the ' +
      'begin door while REPULL.busy — a control the room cannot honor is ' +
      'not drawn (2026-08-21)');
  }
  if (held.indexOf('BOOKEND') === -1) {
    violations.push('[26.997-03] ' + APP + ': walk open still paints the ' +
      'shipped bookend while the fetch holds — hide the undrawable door, ' +
      'not the card');
  }
})();

// ---- 26.997-03 Task 3: W-1 wired from her sitting (verbatim fragments) ----
//
// ⛔ HER WORDS, 2026-08-28. Agent does not polish. Placeholders N/M/[time]
// are filled at paint time; the fixed prose is pinned here by contiguous
// substring. Stop-import ships with COLLECT_STOP_COPY + real route (below).
(function () {
  const FRAGS = [
    'So far the librarain attempted to import ',
    ' of photos but only ',
    ' of photos are actually in the room. The librarian is trying to ',
    'finish the entire import and it will take estimated ',
    ' mins, your RAM in your computer are being used, and the librarian ',
    'is not available for any task until this is over.'
  ];
  FRAGS.forEach(function (frag) {
    if (appSrc.indexOf(frag) === -1) {
      violations.push('[26.997-03-W1] ' + APP + ': missing her W-1 fragment ' +
        JSON.stringify(frag));
    }
  });
  if (appSrc.indexOf('function longWaitW1Line(') === -1 ||
      appSrc.indexOf('function appendLongWaitW1(') === -1) {
    violations.push('[26.997-03-W1] ' + APP + ': longWaitW1Line / ' +
      'appendLongWaitW1 missing — her sentence has nowhere to land');
  }
  // Stop control ships with a real cancel path (26.997 follow-on). Her
  // words live in COLLECT_STOP_COPY; the button class is collect-stop.
  if (appSrc.indexOf("var COLLECT_STOP_COPY = 'fully stop the import'") === -1) {
    violations.push('[26.997-03-W1] ' + APP + ': COLLECT_STOP_COPY must be ' +
      'her words fully stop the import');
  }
  if (appSrc.indexOf('/api/adapter/collect/stop') === -1 ||
      appSrc.indexOf('stopCollectImport') === -1 ||
      appSrc.indexOf('collect-stop') === -1) {
    violations.push('[26.997-03-W1] ' + APP + ': stop-import control must ' +
      'reach /api/adapter/collect/stop (Don\'t show undrawable controls)');
  }
  if (appSrc.indexOf('session-long-wait-stop') !== -1) {
    violations.push('[26.997-03-W1] ' + APP + ': stray session-long-wait-stop ' +
      'class — use collect-stop with the real route');
  }
  if (!/SESSION_BOUND_MS = 45000/.test(appSrc)) {
    violations.push('[26.997-03-W1] ' + APP + ': SESSION_BOUND_MS must stay ' +
      '45000 (S1)');
  }
})();

// ---- report -----------------------------------------------------------------

if (violations.length) {
  violations.forEach(function (v) { console.error(v); });
  process.exit(1);
}
console.log('test_session_flow OK (handler ordering, seam chaining, ' +
  'busy gates, pinned copy, absence-clean, spot/spread targeting, ' +
  'seam discipline, one-offer beat, thinking flame, wall-clock bound, ' +
  'the walk wire driven end to end, the camera never stuck)');
