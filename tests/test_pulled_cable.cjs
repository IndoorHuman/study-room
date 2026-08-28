#!/usr/bin/env node
'use strict';
/* tests/test_pulled_cable.cjs — Handoff §M6 / SC-5, phase 26.98-07.
 *
 * ⛔⛔ WHAT THIS FILE IS FOR, IN THE HANDOFF'S OWN WORDS:
 *
 *     "Start a reflection. Pull the network cable out. Whatever the room does
 *      next is the real answer to 'can users tell if something is working'."
 *
 * The 45-second bound that guarantees recovery shipped on 2026-08-07 and is
 * mutation-verified against a FAKE CLOCK. Until this file, NOBODY HAD EVER
 * DROPPED A REAL CONNECTION AND WATCHED. This is the machine half of that
 * beat, so the recovery path cannot rot between the phases that touch it.
 *
 * ---------------------------------------------------------------------------
 * ⛔⛔ THIS FILE DOES NOT SETTLE SC-5, AND NOBODY MAY QUOTE IT AS IF IT DID.
 *
 * SC-5 says the beat is "watched live, not asserted from source". A green line
 * here is evidence that the path still works; it is NOT the owner having
 * watched her own room recover from her own network going away. That half is
 * OWED, and it is deliberately OUTSTANDING rather than skipped — see
 * 26.98-07-SUMMARY.md and 26.98-VALIDATION.md's Manual-Only Verifications row,
 * both of which name the reason it was held rather than put to her.
 *
 * ---------------------------------------------------------------------------
 * ⛔⛔ THE COST RULE THAT GOVERNS THIS WHOLE FILE. READ BEFORE EDITING.
 *
 * MEASURED, NOT ASSUMED: with this harness running, GET /api/librarian/status
 * answers {"available":true,"auth":"api-key"}. THE LIBRARIAN IS REACHABLE AND
 * A REAL CREDENTIAL IS IN SCOPE. Answering the consent card — `just titles and
 * dates` or `yes — read what's new` — WOULD SPEND HER MONEY, on every run of
 * this suite, forever.
 *
 * ⛔ SO THE CABLE IS PULLED **BEFORE** THE CONSENT CARD IS EVER ANSWERED, and
 * this suite NEVER taps either consent door. That ordering is not a
 * convenience — it is the reason this gate is free to run. An agent
 * "improving" this beat by answering the card to reach a richer failure shape
 * would be charging her for every CI run and would not find out from a test.
 *
 * ⚠ THE CONSEQUENCE IS STATED RATHER THAN HIDDEN. The run shape this suite
 * reaches is the WAITING-ON-HER route (26.995-22 branch B): the clock ran out
 * with her consent card still on screen, the librarian was never asked, and
 * the room says HER OWN sentence. The other route — a turn in flight, where
 * "the paper keeps its draft" — cannot be reached without a paid call, so the
 * draft-preservation half of §M6 is NOT measured here and is recorded as not
 * measured. What IS measured is that nothing already PAINTED is rolled back.
 *
 * ---------------------------------------------------------------------------
 * THE FIVE ANTI-VACUITY ANSWERS.
 *
 * 1. CAN IT PASS BEFORE THE WORK? No. Nothing in the suite dropped a
 *    connection before this file existed: `grep -l emulateNetworkConditions
 *    tests/*.cjs` returned nothing. There was no measurement to be satisfied.
 *
 * 2. CAN IT PASS AFTER A DELIBERATE BREAK? No — proven, not asserted. Three
 *    mutations were planted one at a time in app.js and each reddened the
 *    assertion it was aimed at; every failure message is recorded verbatim in
 *    26.98-07-SUMMARY.md, and every restore was performed by WRITING held
 *    bytes back with the sha256 confirmed (never a git-side restore — app.js
 *    is 1.09 MB and another session edits it).
 *
 * 3. WOULD A DEGENERATE PAGE PASS? No. The pre-drop text-node count is pinned
 *    BY VALUE at 7 and asserted BEFORE the cable is pulled, and the room
 *    scene's objects are pinned BY VALUE (10 since 26.999's card box — see
 *    the ROOM_OBJECTS note below) in the same breath. A page
 *    that rendered nothing fails at the first measurement instead of sailing
 *    into a recovery test that an empty document satisfies trivially.
 *
 * 4. DOES IT READ EVALUATION OR SOURCE? Evaluation. Every fact comes off a
 *    live page in a real browser driving the SHIPPED app under the SHIPPED
 *    server, after a REAL network event delivered by the runner's own
 *    emulation command. The ONE thing read as text is the ending sentence's
 *    CONSTANT, lifted out of the served app.js so the equality is against
 *    what ships rather than against a string retyped here — and the drop
 *    itself is verified by reading navigator.onLine off the page, so "the
 *    cable was pulled" is a measurement too.
 *
 * 5. COULD A COMMENT SATISFY IT? The only file read is app.js, and only to
 *    lift a quoted constant by name; a comment cannot supply the running
 *    room's rendered sentence, its cleared consent card, or a click that
 *    starts a new sitting.
 *
 * ---------------------------------------------------------------------------
 * ⛔ NO SECOND CDP RUNNER. 26.91 built tests/lib/cdp.cjs alongside
 * app-server.cjs and render-harness.cjs; this file requires all three and adds
 * NOTHING under tests/lib/. T-26.98-46: if Chrome cannot launch this suite
 * exits NON-ZERO NAMING THE BINARY PATH. No skip, no soft pass — a live gate
 * whose runner is unavailable FAILS, it does not stop checking.
 *
 * ⛔ THE PORT IS THE HARNESS'S OWN, OS-ASSIGNED AND EPHEMERAL. This suite
 * never names a port, never binds one, and never contacts 8747.
 */

const fs = require('fs');
const path = require('path');
const cdp = require('./lib/cdp.cjs');
const appServer = require('./lib/app-server.cjs');
const renderHarness = require('./lib/render-harness.cjs');

const ROOT = path.join(__dirname, '..');

/* ---- the pins, all BY VALUE ---------------------------------------------- */

/* Non-empty text nodes under the session spot the moment the consent card has
   painted, measured on a live page this wave. This is the DEGENERATE-PAGE
   GUARD: it is asserted BEFORE the cable is pulled, so a blank document fails
   here rather than passing a recovery assertion vacuously. */
const PRE_DROP_TEXT_NODES = 7;
/* The room objects painted before the drop — the SC-8 pins.
   ⚠ MOVED 9 → 10 by 26.99955-04 (2026-08-26): 26.999's `bca345b` ("the card
   box is on the desk — her sitting, executed") added `#room-obj-cardbox`
   (class room-object) per HER 2026-08-25 design-sitting ruling — the spot ON
   THE DESK, the object a SMALL CARD BOX — and moved test_diegetic_wiring's
   and test_no_push's pins in the same commit but not this one. Verified by
   bisect in a clean clone (green at 64eae85, red at bca345b) and by the
   commit's own diff: the tenth object IS her ruled card box. */
const ROOM_OBJECTS = 10;
/* The shipped clock, asserted off the SERVED source before the run starts. */
const SHIPPED_BOUND_MS = 45000;
/* How long the recovery is watched. Past the bound, deliberately: a beat that
   stopped watching AT the bound could not tell "recovered late" from "never". */
const WATCH_MS = 70000;
const POLL_MS = 1500;
/* The ending's ONE door. */
const AGAIN_DOOR = '.session-waited-again';
const SPOT = '#desk-spot-session';
const CONSENT = '.session-consent';
/* The candle at rest: the base ambient breath and NOTHING else. `reaching`,
   `settle` and `playing` are the three classes that can be left orphaned by a
   run that ended badly, which is exactly what "no orphaned glow" means. */
const CANDLE_RESTING = 'room-object room-decor has-sprite';
const ORPHAN_CLASSES = ['reaching', 'settle', 'playing'];

const violations = [];
function ok(cond, tag, msg) {
  if (!cond) { violations.push('[' + tag + '] ' + msg); }
  return !!cond;
}
function note(s) { console.log('  · ' + s); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---- reading the live page ----------------------------------------------- */

const READ_SPOT =
  '(function(){var h=document.querySelector(' + JSON.stringify(SPOT) + ');' +
  'function tn(n){if(!n)return 0;var w=document.createTreeWalker(' +
  'n,NodeFilter.SHOW_TEXT,null);var k=0;while(w.nextNode()){' +
  'if((w.currentNode.nodeValue||"").trim())k++;}return k;}' +
  'return JSON.stringify({found:!!h,' +
  'text:h?(h.textContent||"").replace(/\\s+/g," ").trim():"",' +
  'textNodes:tn(h),' +
  'consent:!!document.querySelector(' + JSON.stringify(CONSENT) + '),' +
  'again:!!document.querySelector(' + JSON.stringify(AGAIN_DOOR) + '),' +
  'online:navigator.onLine});})()';

const READ_SCENE =
  '(function(){var s=document.querySelector("#room-scene-el");' +
  'var objs=[].slice.call(document.querySelectorAll(".room-object")).map(' +
  'function(n){return n.id+"|"+((n.querySelector(".room-label")||{})' +
  '.textContent||"");});' +
  'var c=document.querySelector("#room-obj-candle");' +
  'return JSON.stringify({sceneText:s?(s.textContent||"")' +
  '.replace(/\\s+/g," ").trim():null,objs:objs,' +
  'candle:c?c.className:null});})()';

async function readSpot(session) {
  return JSON.parse(await cdp.evaluate(session, READ_SPOT));
}
async function readScene(session) {
  return JSON.parse(await cdp.evaluate(session, READ_SCENE));
}

/* A REAL dispatched mouse event at the control's own centre — never a call to
   a handler. A handler called directly proves the function runs; it proves
   nothing about whether the control is reachable, on top, or enabled, and
   "her tap is free again" is a claim about the control, not the function. */
async function click(session, sel) {
  const raw = await cdp.evaluate(session,
    '(function(){var a=[].slice.call(document.querySelectorAll(' +
    JSON.stringify(sel) + '));for(var i=0;i<a.length;i++){' +
    'var r=a[i].getBoundingClientRect();' +
    'if(r.width>0&&r.height>0)return JSON.stringify(' +
    '{x:r.left+r.width/2,y:r.top+r.height/2});}return "null";})()');
  if (!raw || raw === 'null') {
    throw new Error('cannot tap ' + sel + ' — it is not on the page, or it ' +
      'has no box. A gate that silently skips the control it is driving ' +
      'proves nothing.');
  }
  const p = JSON.parse(raw);
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(800);
}

/* Lift a quoted `var NAME = '...';` literal out of the SERVED source, so the
   equality below is against the sentence that ships rather than one retyped
   into a test — the retyped copy is how a reworded sentence passes its own
   gate. ⚠ This cannot detect a REWORD; the anti-reword pin is the byte-pin in
   tests/test_session_flow.cjs § 3, and that limit is stated, not papered over. */
function liftLit(src, name) {
  const m = new RegExp('var ' + name + ' =\\s*([^\\n]*)\\n?\\s*([^\\n]*);')
    .exec(src);
  if (!m) { return null; }
  let t = (m[1].trim().endsWith(';') ? m[1].trim().slice(0, -1) : null);
  if (t === null) {
    t = (m[1].trim() === '' ? m[2].trim() : m[1].trim());
    if (t.endsWith(';')) { t = t.slice(0, -1); }
  }
  t = t.trim();
  const q = t[0];
  if ((q !== "'" && q !== '"') || t[t.length - 1] !== q) { return null; }
  return t.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
}

/* ========================================================================== */

(async function main() {
  let app = null;
  let session = null;

  /* ⛔ THE SHIPPED CLOCK IS READ, NEVER MODIFIED. This beat only means
     something at 45000; a run at a raised clock is the artifact that made a
     reflection look reachable once already (26.995-28). */
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const msM = /var SESSION_BOUND_MS = (\d+);/.exec(appSrc);
  const servedMs = msM ? Number(msM[1]) : -1;
  const HER_WAITED = liftLit(appSrc, 'SESSION_WAITED_LINE');

  try {
    app = await appServer.start();
  } catch (e) {
    console.error('[runner] the shipped app could not be started, so this ' +
      'live gate has no subject. It FAILS rather than stopping checking: ' +
      String((e && e.stack) || e));
    process.exit(1);
  }

  try {
    /* ⛔ T-26.98-46. cdp.launch THROWS with the binary path when Chrome is
       not where it expects, and that throw is NOT caught into a skip
       anywhere in this file. */
    note('runner: ' + cdp.CHROME_BIN);
    note('harness page builder present: ' +
      (typeof renderHarness.buildHarness === 'function'));

    ok(servedMs === SHIPPED_BOUND_MS, '0/clock',
      'the served app.js carries SESSION_BOUND_MS = ' + servedMs + '. This ' +
      'beat only means anything at the SHIPPED ' + SHIPPED_BOUND_MS + 'ms; a ' +
      'run at a raised clock proves the clock, not the recovery.');
    ok(typeof HER_WAITED === 'string' && HER_WAITED.length > 0, '0/sentence',
      'SESSION_WAITED_LINE could not be lifted from the served source, so ' +
      'there is no shipped sentence to compare the ending against and every ' +
      'equality below would be a comparison with null');
    if (violations.length) {
      throw new Error('the run cannot be armed — refusing to measure');
    }
    note('the clock this run uses: ' + servedMs + 'ms, read out of the ' +
      'served app.js and NOT modified');

    session = await cdp.launch({ url: app.url });
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send(session, 'Page.navigate', { url: app.url });
    await sleep(3000);

    /* ---- §1. BEGIN A REFLECTION ----------------------------------------- */
    /* The candle IS the librarian (26.4-06): a deliberate tap starts the
       sitting. Law 1 holds — only her tap ever starts one, never a clock. */
    await click(session, '#room-obj-candle');
    await sleep(2500);

    const pre = await readSpot(session);
    const preScene = await readScene(session);

    ok(pre.found, '1/session',
      'the session surface never appeared after the candle tap — there is no ' +
      'reflection in flight to interrupt, so nothing below would be a reading');
    ok(pre.consent === true, '1/session',
      'the sitting did not reach the point where the room is waiting on her. ' +
      'This beat drops the connection at THAT moment on purpose: it is the ' +
      'only shape reachable without asking the librarian, and asking costs ' +
      'real money on every run (the harness reports the librarian available ' +
      'with a real credential).');
    /* ⛔ PINNED BY VALUE, BEFORE THE CABLE IS PULLED. A blank page satisfies
       every recovery assertion ever written; this is what stops that. */
    ok(pre.textNodes === PRE_DROP_TEXT_NODES, '1/pre-drop-count',
      'the session surface carries ' + pre.textNodes + ' non-empty text ' +
      'node(s) before the drop; this gate is pinned BY VALUE at ' +
      PRE_DROP_TEXT_NODES + '. Asserted BEFORE the cable is pulled, because ' +
      'a page that rendered nothing would pass everything after it.');
    ok(Array.isArray(preScene.objs) && preScene.objs.length === ROOM_OBJECTS,
      '1/pre-drop-room',
      'the room scene carries ' + (preScene.objs || []).length + ' objects ' +
      'before the drop — pinned BY VALUE at ' + ROOM_OBJECTS);
    if (violations.length) {
      throw new Error('the pre-drop state is not what this beat interrupts — ' +
        'refusing to pull the cable and report on it');
    }
    note('§1 the sitting is open and the room is waiting on her: ' +
      pre.textNodes + ' text node(s), ' + preScene.objs.length +
      ' room objects, both pinned by value');

    /* ---- §2. PULL THE CABLE --------------------------------------------- */
    /* ⛔ THROUGH THE RUNNER'S OWN NETWORK EMULATION, NOT BY STUBBING INSIDE
       THE PAGE. The whole point of §M6 is that the failure arrives from
       OUTSIDE: a page that has been taught to fail is a page agreeing with
       the test about how it fails. */
    await cdp.send(session, 'Network.enable', {});
    await cdp.send(session, 'Network.emulateNetworkConditions',
      { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const dropT = Date.now();

    /* THE DROP IS VERIFIED, NOT ASSUMED — an emulation command that silently
       did nothing would leave this suite reporting a healthy room as a
       recovery. */
    const offline = await cdp.evaluate(session,
      '(function(){return String(navigator.onLine);})()');
    if (!ok(offline === 'false', '2/drop',
      'the page still reports itself online after the runner was told to go ' +
      'offline (navigator.onLine = ' + offline + '). The cable was not ' +
      'pulled, so everything below would be a reading of an ordinary room.')) {
      throw new Error('the drop did not take — refusing to report a recovery');
    }
    note('§2 the connection is down — verified on the page itself, not assumed');

    /* ---- §3. WITHIN THE BOUND: A RESTING ROOM AND ONE PLAIN SENTENCE ----- */
    let ended = null;
    let endedAt = -1;
    while (Date.now() - dropT < WATCH_MS) {
      await sleep(POLL_MS);
      const s = await readSpot(session);
      if (s.text && s.text.indexOf(HER_WAITED) !== -1) {
        ended = s;
        endedAt = Date.now() - dropT;
        break;
      }
    }

    if (!ok(ended !== null, '3/bound',
      'the room never reached a resting ending within ' + WATCH_MS + 'ms of ' +
      'the connection going away, and the shipped bound is ' + servedMs +
      'ms. A room that stays busy forever after the cable is pulled is ' +
      'exactly the state §M6 named: the user cannot tell whether anything is ' +
      'working.')) {
      throw new Error('no ending within the watch — refusing to report on a ' +
        'recovery that did not happen');
    }
    note('§3 the room came to rest ' + Math.round(endedAt / 1000) + 's after ' +
      'the drop (shipped bound ' + servedMs + 'ms)');

    /* THE BUSY PRESENTATION IS GONE. */
    ok(ended.consent === false, '3/busy',
      'the consent card is still on screen after the ending — the sitting ' +
      'did not actually close, so the room is showing her a question it can ' +
      'no longer answer');

    /* EXACTLY ONE PLAIN SENTENCE, EQUAL TO THE SHIPPED CONSTANT. */
    const hits = ended.text.split(HER_WAITED).length - 1;
    ok(hits === 1, '3/sentence',
      'the ending sentence appears ' + hits + ' time(s) on the surface — ' +
      'pinned BY VALUE at exactly 1. Two copies of the same apology is the ' +
      'room saying the same thing twice, which reads as a second failure.');
    /* ⛔ HER SENTENCE, AND ITS IDENTITY MATTERS AS MUCH AS ITS PRESENCE.
       26.995-22 branch B: the librarian was NEVER ASKED here, so
       SESSION_BOUND_LINE ("it was taking too long") would blame a librarian
       nobody spoke to. THAT falsehood is the defect this route exists to
       remove, and a gate that accepted either sentence would let it back. */
    const BOUND_LINE = liftLit(appSrc, 'SESSION_BOUND_LINE');
    if (BOUND_LINE) {
      ok(ended.text.indexOf(BOUND_LINE) === -1, '3/no-falsehood',
        'the room said the LIBRARIAN-WAS-SLOW sentence on a route where the ' +
        'librarian was never asked. Nothing was sent, nothing was spent and ' +
        'nothing was slow — 26.995-22 branch B removed exactly this ' +
        'falsehood and this assertion is what keeps it removed.');
    }
    note('§3 the ending is HER sentence, once: ' + JSON.stringify(HER_WAITED));

    /* ---- §4. THE CANDLE IS BACK AT REST, NO ORPHANED GLOW ---------------- */
    const postScene = await readScene(session);
    ok(postScene.candle === CANDLE_RESTING, '4/candle',
      'the candle carries class "' + postScene.candle + '" after the failure ' +
      'ending; its resting derivation is exactly "' + CANDLE_RESTING + '". ' +
      'A flame left reaching or mid-settle after the room gave up is an ' +
      'orphaned glow — the room still LOOKING while it has stopped.');
    ORPHAN_CLASSES.forEach(function (c) {
      ok(String(postScene.candle || '').split(/\s+/).indexOf(c) === -1,
        '4/candle',
        'the candle still wears `' + c + '` after the ending');
    });

    /* ---- §5. NOTHING ALREADY PAINTED IS ROLLED BACK ---------------------- */
    /* ⚠ WHAT THIS MEASURES AND WHAT IT DOES NOT. app.js's own comment on this
       route says "Nothing is rolled back", and this is the assertion that
       makes that a measurement. It compares what had ALREADY BEEN PAINTED
       before the drop with what stands after the ending.
       ⛔ IT IS NOT the draft-preservation half of §M6 — "the paper keeps its
       draft" belongs to a turn in flight, and reaching a turn requires a real
       paid librarian call. That half is NOT measured here, and 26.98-07's
       SUMMARY records it as not measured rather than letting a green line
       imply it. */
    ok(postScene.sceneText === preScene.sceneText, '5/preserved',
      'the room scene lost text across the failure. Before the drop it read ' +
      JSON.stringify(preScene.sceneText) + ' and after the ending it reads ' +
      JSON.stringify(postScene.sceneText) + '. Whatever had already arrived ' +
      'is hers and a failure may only ever stop something — never take ' +
      'something back.');
    ok(Array.isArray(postScene.objs) &&
      postScene.objs.join('§') === (preScene.objs || []).join('§'),
      '5/preserved',
      'the room lost or renamed objects across the failure: before [' +
      (preScene.objs || []).join(', ') + '] after [' +
      (postScene.objs || []).join(', ') + ']');
    note('§5 everything painted before the drop is still standing after it');

    /* ---- §6. HER TAP IS FREE AGAIN — DISPATCHED, NOT READ ---------------- */
    /* ⛔ BEHAVIOURAL. Reading `disabled` or `aria-disabled` proves an
       attribute; it does not prove that tapping starts a sitting. So this
       dispatches a REAL click and requires a NEW run to begin — on a page
       that is STILL OFFLINE, which is the actual promise: she does not have
       to reload anything. */
    ok(ended.again === true, '6/door',
      'the ending offers no door back. Her tap being free is the difference ' +
      'between a room that stopped and a room that is stuck.');
    if (ended.again) {
      await click(session, AGAIN_DOOR);
      await sleep(2500);
      const re = await readSpot(session);
      ok(re.consent === true, '6/tap-free',
        'tapping the ending\'s door did not start a new sitting — the room ' +
        'is stuck behind its own apology, and she would have to reload to ' +
        'get out of it. The door rendering is not the same as the door ' +
        'working, which is why this is a dispatched click and not an ' +
        'attribute read.');
      ok(re.textNodes === PRE_DROP_TEXT_NODES, '6/tap-free',
        'the new sitting painted ' + re.textNodes + ' text node(s); the ' +
        'first one painted ' + PRE_DROP_TEXT_NODES + '. A door that opens ' +
        'onto a thinner room has not given her back what she had.');
      ok(re.online === false, '6/tap-free',
        'the page came back online during the recovery, so the second ' +
        'sitting was not started under the same pulled cable as the first ' +
        'and this assertion would be measuring a reconnection');
      note('§6 a real dispatched tap started a new sitting — still offline, ' +
        'nothing reloaded');
    }
  } catch (e) {
    violations.push('[runner] the beat could not be completed: ' +
      String((e && e.stack) || e));
  } finally {
    if (session) { await cdp.close(session); }
    if (app) { await app.stop(); }
  }

  if (violations.length) {
    console.error('test_pulled_cable FAILED — ' + violations.length +
      ' violation(s):');
    violations.forEach(function (v) { console.error('  ' + v); });
    console.error('');
    console.error('⛔ SC-5 IS NOT SETTLED BY THIS FILE EITHER WAY. Its ' +
      'watched half is owed to the owner and is recorded as OUTSTANDING in ' +
      '26.98-07-SUMMARY.md.');
    process.exit(1);
  }

  console.log('test_pulled_cable OK (a real reflection begun, the connection ' +
    'dropped from OUTSIDE through the runner\'s network emulation and the ' +
    'drop verified on the page, the room at rest inside the shipped bound ' +
    'with exactly one of HER sentences and never the librarian-was-slow ' +
    'falsehood, the candle back at its resting derivation with no orphaned ' +
    'glow, everything already painted still standing, and a REAL dispatched ' +
    'tap starting a new sitting while still offline)');
  console.log('⛔ THIS DOES NOT SETTLE SC-5. The watched half — her own ' +
    'network, her own room — is OWED and is recorded as outstanding rather ' +
    'than skipped. See 26.98-07-SUMMARY.md and 26.98-VALIDATION.md.');
  process.exit(0);
})();
