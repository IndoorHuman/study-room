#!/usr/bin/env node
'use strict';
/* tests/test_feeling_mark_symmetry.cjs — Handoff §M7 / SC-6, phase 26.98-06.
 *
 * ⛔⛔ WHAT THIS FILE IS FOR, IN ONE SENTENCE FROM THE HANDOFF ITSELF:
 *
 *     "If 'joyful' gets a warm bloom and 'not joyful' gets a shrug, you have
 *      told the user which answer you hoped for — and their answers will drift
 *      over months. For a self-reflection tool that is a failure of the entire
 *      premise. Both answers must be met with identical generosity."
 *
 * HER RULING, 2026-08-24: the feeling-marks are the READING answers — `glad`
 * and `not really` — chosen over the blessing ribbon and the offer rows, each
 * put to her with its downside named as plainly as its upside. And her second
 * ruling the same day: `never show me this again` STAYS PLAIN. Two of these are
 * how it landed; the third is a decision. That plainness is DELIBERATE, and
 * §5 below is the gate that keeps it from being "fixed" by a later tidy-up —
 * because a comment saying so does not survive one.
 *
 * ---------------------------------------------------------------------------
 * THE FIVE ANTI-VACUITY ANSWERS.
 *
 * 1. CAN IT PASS BEFORE THE WORK? No. At the phase baseline no chosen state
 *    existed anywhere in the app: all three candidate surfaces were terminal
 *    and tokens.css carried ZERO pressed-state selectors. The node query in §2
 *    returns nothing, and §2 asserts the count BY VALUE before anything else
 *    runs, so the suite fails at its first measurement rather than sailing past
 *    an empty set.
 *
 * 2. CAN IT PASS AFTER A DELIBERATE BREAK? No — proven, not asserted. Six
 *    mutations were planted one at a time and each reddened the assertion it
 *    was aimed at; every failure message is recorded verbatim in
 *    26.98-06-SUMMARY.md, and every restore was performed by writing held
 *    bytes back with the sha256 confirmed.
 *
 * 3. DOES A DEGENERATE PAGE SATISFY IT? No. The probe count is pinned BY VALUE
 *    at 2 and asserted BEFORE any style is read; each button's bounding box is
 *    asserted non-zero BEFORE its colour is read. An unrendered node satisfies
 *    a transparency test trivially, and that ordering is what stops it.
 *
 * 4. DOES IT READ EVALUATION OR SOURCE? Evaluation, entirely. Every number
 *    comes off getComputedStyle on a live page in a real browser, driving the
 *    SHIPPED app served by the SHIPPED server. It never reads app.js or
 *    tokens.css as text, so it cannot be satisfied by a comment, and it cannot
 *    be satisfied by a rule that exists in source and never takes effect —
 *    which is exactly how `.station-nb-pen.is-on` shipped inert for two phases.
 *
 * 5. CAN IT MATCH A COMMENT? It never opens a file. There is nothing to match.
 *
 * ---------------------------------------------------------------------------
 * ⛔ WHAT THIS FILE DOES **NOT** DO. Nobody may credit it with more.
 *
 *  - IT DOES NOT SETTLE SC-6's HUMAN HALF. Whether the chosen state is still
 *    *obvious to a person* with animation off is a judgement no instrument
 *    makes. This measures that the distinction SURVIVES; it cannot measure
 *    that it READS. That beat is plan 07's, and a green line here must never
 *    be quoted as if it had been answered.
 *  - It says nothing about the first-answer flow, which is unchanged and
 *    belongs to 24-02 RV-4 and 26.5-01 D-10.
 *  - It measures one viewport. Geometry at other widths is not its subject.
 *
 * ⛔ NO SECOND CDP RUNNER. 26.91 built tests/lib/cdp.cjs with app-server.cjs
 * and render-harness.cjs beside it, and they are reused here rather than
 * reimplemented — the same reason a second compositor is forbidden: the first
 * one already works and was already proven. NOTHING is added under tests/lib/.
 *
 * ⛔ IF CHROME CANNOT LAUNCH THIS SUITE EXITS NON-ZERO WITH THE BINARY PATH.
 * A live gate whose runner is unavailable FAILS; it does not stop checking.
 * There is no skip, no soft pass and no fallback to a source assertion.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');

const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));
const renderHarness = require(path.join(ROOT, 'tests/lib/render-harness.cjs'));

/* ---- everything pinned BY VALUE, before anything is measured -------------- */

/* Two marks. Not "at least two", not "however many were found": §M7 governs a
   PAIR, and a page that grew a third feeling-mark is a change to her ruling. */
const PROBE_COUNT = 2;

/* §M7: "settle into a chosen state over exactly 200ms". */
const EXPECTED_DURATION_S = 0.2;

/* §M7: "background and border only, no transform, no scale". Two, exactly. */
const EXPECTED_PROP_COUNT = 2;

/* THE LUMINANCE EPSILON, AND WHY IT IS THIS NUMBER.
   The two chosen backgrounds resolve to rgb(205, 168, 110) and
   color(srgb 0.822784 0.649686 0.479686). Their WCAG relative luminances
   differ by 0.00129. One 8-bit step of the GREEN channel at this level —
   165 -> 166 — moves relative luminance by 0.00362. So the two marks are equal
   in brightness to FINER THAN THE sRGB GRID CAN EXPRESS, and the epsilon is
   set just ABOVE one such step: anything inside it is a difference no display
   can render and no eye can see, and anything outside it is a real step
   somebody took. Their contrast ratio against each other is 1.0027, where 1.0
   is identity. ⛔ It is NOT set to the measured gap: an epsilon tightened onto
   today's number stops being a threshold and becomes a second copy of the
   value, red on the next legitimate re-tune and silent about what changed. */
const LUM_EPSILON = 0.004;

/* THE MINIMUM HUE DIFFERENCE, AND WHY IT EXISTS AT ALL.
   Without it "identical brightness" is satisfied perfectly by making the two
   marks THE SAME COLOUR, which would erase the distinction §M7 is protecting
   rather than balance it. Measured gap: 6.63°. The floor is set at half that,
   so a real narrowing fails while ordinary sub-degree drift does not. */
const MIN_HUE_DELTA = 3.0;

/* The reserved coral, by value. §M7 forbids it on either mark outright, and
   the palette table reserves it for chrome. */
const ACCENT_RGB = [232, 80, 58];

const GLAD = '#btn-react-glad';
const NOT_REALLY = '#btn-react-notreally';
const NEVER = '#btn-react-never';
const GROUP = '.feeling-marks';

/* Nodes that would mean the room SAID SOMETHING. §M7: the librarian says
   nothing on an individual mark — a response every time turns reflection into
   surveillance and teaches people to mark what they want said back. Counted
   before and after every click and asserted EQUAL, so a pre-existing live
   region on the page cannot make this vacuous. */
const MESSAGE_SELECTOR = 'dialog, [role="alert"], [role="status"], ' +
  '[aria-live], .quiet-error, .toast, #reaction-note *, #never-confirm *';

const violations = [];
function fail(tag, msg) { violations.push('[' + tag + '] ' + msg); }
function ok(cond, tag, msg) { if (!cond) { fail(tag, msg); } return !!cond; }
function note(msg) { console.log('  ' + msg); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---- colour arithmetic, in node, over what the PAGE resolved -------------- */

/* ⛔ TWO NOTATIONS, ONE COLOUR SPACE — AND COMPARING THE STRINGS WOULD BE
   MEANINGLESS. Chrome resolves a plain token to `rgb(205, 168, 110)` and a
   `color-mix(in srgb, …)` to `color(srgb 0.822784 0.649686 0.479686)` — the
   same space at float precision, spelled differently. A gate that compared
   computed-style TEXT would call two identical colours different and two
   different colours identical depending only on how each was written.
   Everything below is normalised to 0–255 floats and compared as numbers.
   ⛔ AND IT IS NOT ROUNDED TO 8 BITS. Rounding would throw away precision the
   engine kept and would move the answer — see the percentage note in
   tokens.css, where rounding picks a different mix by a factor of two. */
function parseRgb(s) {
  const t = String(s);
  const fn = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(t);
  if (fn) { return [Number(fn[1]), Number(fn[2]), Number(fn[3])]; }
  const c = /color\(\s*srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/
    .exec(t);
  if (c) {
    return [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255];
  }
  return null;
}
function luminance(rgb) {
  const f = rgb.map(function (v) {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
function hue(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) { return 0; }
  let h;
  if (mx === r) { h = 60 * (((g - b) / d) % 6); }
  else if (mx === g) { h = 60 * ((b - r) / d + 2); }
  else { h = 60 * ((r - g) / d + 4); }
  return (h + 360) % 360;
}
function sameRgb(a, b) {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/* ---- reading the live page ------------------------------------------------ */

/* One evaluate per probe, returning everything about one control at once, so
   the button cannot change between two reads of it. */
const PROBE = function (sel) {
  return '(function(){var n=document.querySelector(' + JSON.stringify(sel) +
    ');if(!n)return JSON.stringify({found:false});' +
    'var cs=getComputedStyle(n),r=n.getBoundingClientRect();' +
    'return JSON.stringify({found:true,' +
    'w:r.width,h:r.height,' +
    'bg:cs.backgroundColor,border:cs.borderTopColor,' +
    'durations:cs.transitionDuration,props:cs.transitionProperty,' +
    'pressed:n.getAttribute("aria-pressed"),' +
    'cls:n.className,' +
    'disabled:!!n.disabled,ariaDisabled:n.getAttribute("aria-disabled"),' +
    'pointerEvents:cs.pointerEvents,' +
    'inGroup:!!n.closest(' + JSON.stringify(GROUP) + '),' +
    'mark:n.getAttribute("data-mark")});})()';
};

async function probe(session, sel) {
  return JSON.parse(await cdp.evaluate(session, PROBE(sel)));
}
async function countNodes(session, sel) {
  return Number(await cdp.evaluate(session,
    '(function(){return String(document.querySelectorAll(' +
    JSON.stringify(sel) + ').length);})()'));
}
async function textOf(session, sel) {
  return String(await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) +
    ');return n?(n.textContent||"").trim():"";})()'));
}
async function groupClass(session) {
  return String(await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(GROUP) +
    ');return n?n.className:"";})()'));
}

/* A REAL dispatched mouse event at the control's own centre — never a call to
   a handler. A handler called directly proves the function runs; it proves
   nothing about whether the button is reachable, on top, or enabled. */
/* ⛔ THE FIRST VISIBLE MATCH, NOT THE FIRST MATCH. The shelf renders into more
 than one host (the screen and the in-room station), so `querySelector` can
 hand back a node in a hidden screen with a zero box — and a gate that tapped
 a control nobody can see would be measuring the wrong page. */
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
  await sleep(700);
}

/* ---- driving the SHIPPED app to a reader that already carries a mark ------ */

/* ⛔ THE ORIGIN, NOT app.url. app-server resolves `url` as the PAGE
   (…/index.html); concatenating a route onto it asks the server for
   /index.html/api/items and gets a 404, which would read as "the app is
   broken" rather than "the caller built the wrong address". Built from
   app.port, so there is exactly one spelling of the origin in this file. */
async function api(port, route, body) {
  const res = await fetch('http://127.0.0.1:' + port + route,
    body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error('the shipped route ' + route + ' answered ' + res.status +
      ' — the app under this gate is not serving, so nothing below would be ' +
      'a measurement');
  }
  return res.json();
}

/* The first mark is planted THROUGH THE APP'S OWN WRITER — the same
   POST /api/state the client itself calls, with the same `reaction:glad` via.
   ⛔ Not a hand-written items.json: that would be this harness agreeing with
   itself about a schema, which is the source-grep failure one layer down.
   `glad` is a SAME-STATE transition, so every planted item stays blessed and
   stays on the shelf — which is what makes the drive below deterministic
   instead of a lottery over which card the shelf deals. */
async function plantFirstMarks(port) {
  const store = await api(port, '/api/items');
  const items = (store && store.items) || {};
  const ids = Object.keys(items).filter(function (id) {
    return items[id] && items[id].state === 'blessed';
  });
  if (ids.length === 0) {
    throw new Error('the fixture library holds no blessed item, so no reader ' +
      'can carry a feeling-mark and there is nothing to measure');
  }
  await api(port, '/api/state', {
    changes: ids.map(function (id) {
      return { id: id, to: items[id].state, via: 'reaction:glad' };
    })
  });
  return ids;
}

/* ⛔ THE ROUTE IS THE SHIPPED ONE, TAP BY TAP, AND IT IS NOT THE OBVIOUS ONE.
   `#room-obj-bookshelf` opens the REFLECTIONS station — in-room spines — not
   the blessed-item working loop this reaction line belongs to. That loop is
   reached through `manage your library` and its `to the shelf` control, which
   is where `enterShelf` is actually wired. Measured on the live page rather
   than assumed: the bookshelf tap leaves the room screen active and deals no
   card at all. */
async function openAReader(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(3000);
  await click(session, '#room-manage-link');
  await sleep(900);
  await click(session, '#manage-to-shelf');
  await sleep(1500);
  const opens = await countNodes(session, '.shelf-open');
  if (opens === 0) {
    throw new Error('the shelf dealt no openable card, so no reaction line ' +
      'can render — nothing measured after this point would be a reading');
  }
  await click(session, '.shelf-open');
  await sleep(1500);
  if (await countNodes(session, GROUP) === 0) {
    throw new Error('the reader opened but the feeling-mark group never ' +
      'rendered. Before 26.98-06 that was the whole state of the app; if it ' +
      'is the state again, the chosen state has been un-shipped.');
  }
}

/* ========================================================================== */

(async function main() {
  let app = null;
  let session = null;
  try {
    app = await appServer.start();
  } catch (e) {
    console.error("[runner] the shipped app could not be started, so this " +
      "live gate has no subject. It FAILS rather than stopping checking: " +
      String((e && e.stack) || e));
    process.exit(1);
  }
  try {
    /* ⛔ THE RUNNER IS 26.91's, AND ITS ABSENCE IS A FAILURE. cdp.launch
       throws with the binary path when Chrome is not where it expects. It is
       not caught into a skip anywhere in this file. */
    note('runner: ' + cdp.CHROME_BIN);
    note('harness page builder present: ' +
      (typeof renderHarness.buildHarness === 'function'));

    const planted = await plantFirstMarks(app.port);
    note('planted `reaction:glad` on ' + planted.length +
      ' blessed fixture item(s) through POST /api/state');

    session = await cdp.launch({ url: app.url });
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await openAReader(session, app.url);

    /* ---- §1. THE COUNT, PINNED BY VALUE, BEFORE ANY STYLE IS READ -------- */
    const found = await countNodes(session, '.feeling-mark');
    if (!ok(found === PROBE_COUNT, '1/count',
      'the page carries ' + found + ' feeling-mark control(s); this gate is ' +
      'pinned BY VALUE at ' + PROBE_COUNT + '. §M7 governs a PAIR — a third ' +
      'one is a change to her 2026-08-24 ruling and not a discrepancy to ' +
      'reconcile here. ⛔ Nothing below is read until this holds, because a ' +
      'measurement of zero nodes passes every colour test ever written.')) {
      throw new Error('probe count wrong — refusing to measure further');
    }
    note('§1 probe count = ' + found + ' (pinned by value)');

    /* ---- §2. NON-ZERO BOXES, BEFORE ANY COLOUR IS READ ------------------- */
    const g0 = await probe(session, GLAD);
    const n0 = await probe(session, NOT_REALLY);
    [[GLAD, g0], [NOT_REALLY, n0]].forEach(function (pair) {
      ok(pair[1].found && pair[1].w > 0 && pair[1].h > 0, '2/box',
        pair[0] + ' has no rendered box (' + pair[1].w + 'x' + pair[1].h +
        '). An unrendered node satisfies every colour assertion trivially, ' +
        'so this is asserted BEFORE a single colour is read.');
    });
    if (violations.length) { throw new Error('boxes not renderable'); }
    note('§2 both boxes non-zero: ' + Math.round(g0.w) + 'x' +
      Math.round(g0.h) + ' / ' + Math.round(n0.w) + 'x' + Math.round(n0.h));

    /* ---- §3. HER RULING ON THE THIRD CONTROL, GATED --------------------- */
    /* ⛔ HER RULING, 2026-08-24. `never show me this again` gets NO feeling
       mark. Two of these are how it landed; the third is a decision. This is
       a DELIBERATE DISTINCTION, and it is gated rather than merely commented
       because a comment does not survive somebody "fixing the inconsistency"
       by warming the third control. */
    const nev = await probe(session, NEVER);
    ok(nev.found, '3/third-control',
      'the third control is gone from the row entirely. Her ruling was that ' +
      'it stays PLAIN, not that it stops existing.');
    if (nev.found) {
      ok(nev.inGroup === false, '3/third-control',
        '`never show me this again` is inside the feeling-mark group. HER ' +
        'RULING, 2026-08-24: it gets no mark — two of these are how it ' +
        'landed; the third is a DECISION. Take it back out of the group.');
      ok(String(nev.cls).indexOf('feeling-mark') === -1, '3/third-control',
        '`never show me this again` wears the feeling-mark class ("' +
        nev.cls + '"). Her ruling is that it stays plain. This is not an ' +
        'inconsistency to fix — the plainness IS the ruling.');
      ok(nev.pressed === null, '3/third-control',
        '`never show me this again` declares aria-pressed="' + nev.pressed +
        '". A permanent decision is not a mark that can be pressed and ' +
        'un-pressed, and announcing it as one says something nobody decided.');
      note('§3 the third control is plain: no group, no class, no pressed ' +
        'attribute — her ruling, gated');
    }

    /* ---- §4. THE MARK THAT STAYED --------------------------------------- */
    ok(String(await groupClass(session)).indexOf('mark-set') !== -1,
      '4/persistent',
      'the group is not marked as answered on an item that carries a ' +
      '`reaction:glad` in its own history. A mark that does not survive the ' +
      'surface being re-rendered is not persistent, and D-2\'s shelf has ' +
      'nothing to picture.');
    ok(g0.pressed === 'true' && n0.pressed === 'false', '4/persistent',
      'the planted mark did not reach the pair: glad=' + g0.pressed +
      ', not really=' + n0.pressed + '. The state is read off the item\'s ' +
      'own history and must render it.');
    note('§4 the planted mark rendered: glad pressed=' + g0.pressed);

    const chosenGlad = parseRgb(g0.bg);
    const unchosen = parseRgb(n0.bg);
    const chosenGladBorder = parseRgb(g0.border);

    /* ---- §5. SWITCHING, WITH REAL EVENTS, AND IN SILENCE ----------------- */
    const msgBefore = await countNodes(session, MESSAGE_SELECTOR);
    const bodyBefore = await textOf(session, '#reader-body');

    await click(session, NOT_REALLY);
    const g1 = await probe(session, GLAD);
    const n1 = await probe(session, NOT_REALLY);
    ok(n1.found && g1.found, '5/switch',
      'the pair left the page when the mark was switched. §M7: "switching ' +
      'plays the same transition in reverse" — a pair that navigated away ' +
      'has no transition to play and no state to show.');
    ok(n1.pressed === 'true' && g1.pressed === 'false', '5/switch',
      'the pressed attributes did not swap on a real dispatched click ' +
      '(glad=' + g1.pressed + ', not really=' + n1.pressed + ')');
    const msgAfter = await countNodes(session, MESSAGE_SELECTOR);
    ok(msgAfter === msgBefore, '5/silence',
      'marking said something: message/dialog/live-region nodes went from ' +
      msgBefore + ' to ' + msgAfter + '. §M7 is explicit — THE LIBRARIAN ' +
      'SAYS NOTHING on an individual mark. A response every time turns ' +
      'reflection into surveillance and teaches people to mark what they ' +
      'want said back.');
    ok(await textOf(session, '#reader-body') === bodyBefore, '5/content',
      'the note\'s own content changed when a mark was set. Law 4: the ' +
      'content is verbatim and undecorated, and a mark is not an event that ' +
      'happens to it.');
    note('§5 the mark switched in place, in silence, with the content ' +
      'untouched');

    const chosenNot = parseRgb(n1.bg);
    const chosenNotBorder = parseRgb(n1.border);

    /* ---- §6. AND BACK AGAIN, PLUS THE LEGAL NO-OP ------------------------ */
    await click(session, GLAD);
    const g2 = await probe(session, GLAD);
    const n2 = await probe(session, NOT_REALLY);
    ok(g2.pressed === 'true' && n2.pressed === 'false', '6/reverse',
      'the mark did not switch BACK (glad=' + g2.pressed + ', not really=' +
      n2.pressed + '). §M7 requires the reverse to be as available as the ' +
      'forward — a mark you cannot take back is a verdict.');
    /* The currently-chosen button, tapped again: a LEGAL NO-OP, never a
       disabled control. The shipped voice picker gets this wrong — its
       current option carries no handler at all — so it is asserted here. */
    await click(session, GLAD);
    const g3 = await probe(session, GLAD);
    const n3 = await probe(session, NOT_REALLY);
    ok(g3.pressed === 'true' && n3.pressed === 'false', '6/noop',
      'tapping the already-chosen mark changed the state (glad=' +
      g3.pressed + ', not really=' + n3.pressed + '). It must be a legal ' +
      'no-op.');
    note('§6 the reverse works, and the chosen mark is a legal no-op');

    /* ---- §7. NEITHER IS EVER DISABLED OR POINTER-SUPPRESSED -------------- */
    [['start', g0, n0], ['after switch', g1, n1], ['after reverse', g2, n2],
      ['after the no-op', g3, n3]].forEach(function (row) {
      [[GLAD, row[1]], [NOT_REALLY, row[2]]].forEach(function (p) {
        ok(p[1].disabled === false, '7/clickable',
          p[0] + ' reports itself DISABLED (' + row[0] + '). §M7: the ' +
          'unchosen option "stays fully clickable". A disabled control is ' +
          'the one shape that cannot satisfy that.');
        ok(p[1].ariaDisabled === null, '7/clickable',
          p[0] + ' declares aria-disabled="' + p[1].ariaDisabled + '" (' +
          row[0] + ') — announced as dead while still being tappable is ' +
          'worse than either.');
        ok(p[1].pointerEvents !== 'none', '7/clickable',
          p[0] + ' has pointer-events:none (' + row[0] + ') — unclickable ' +
          'without ever saying so.');
      });
    });
    note('§7 neither mark is ever disabled, aria-disabled or ' +
      'pointer-suppressed, at four points in the interaction');

    /* ---- §8. THE SYMMETRY, IN COMPUTED STYLE ----------------------------- */
    const durG = String(g0.durations).split(',').map(function (s) {
      return parseFloat(s);
    });
    const durN = String(n0.durations).split(',').map(function (s) {
      return parseFloat(s);
    });
    const propG = String(g0.props).split(',').map(function (s) {
      return s.trim();
    });
    const propN = String(n0.props).split(',').map(function (s) {
      return s.trim();
    });

    durG.concat(durN).forEach(function (d) {
      ok(Math.abs(d - EXPECTED_DURATION_S) < 1e-6, '8/duration',
        'a transition duration resolved to ' + d + 's, not the ' +
        EXPECTED_DURATION_S + 's §M7 pins by value ("settle into a chosen ' +
        'state over exactly 200ms"). glad=[' + g0.durations + '] not ' +
        'really=[' + n0.durations + ']');
    });
    ok(g0.durations === n0.durations, '8/duration',
      'THE TWO MARKS DO NOT SETTLE OVER THE SAME TIME — glad "' +
      g0.durations + '" vs not really "' + n0.durations + '". Asserted as ' +
      'an equality BETWEEN them as well as against the literal, because ' +
      'both being wrong in the same way is a different failure from one ' +
      'being slower, and only one of them is drift.');

    ok(propG.length === EXPECTED_PROP_COUNT, '8/props',
      'glad transitions ' + propG.length + ' propert(ies) [' + g0.props +
      '] — §M7 pins exactly ' + EXPECTED_PROP_COUNT + ': "background and ' +
      'border only, no transform, no scale".');
    ok(propN.length === EXPECTED_PROP_COUNT, '8/props',
      'not really transitions ' + propN.length + ' propert(ies) [' + n0.props +
      '] — §M7 pins exactly ' + EXPECTED_PROP_COUNT + '.');
    ok(propG.length === propN.length, '8/props',
      'THE TWO MARKS ANIMATE DIFFERENT NUMBERS OF PROPERTIES — glad [' +
      g0.props + '] vs not really [' + n0.props + ']. One mark with an ' +
      'extra property is the "warm bloom" §M7 exists to prevent, arriving ' +
      'as a technicality.');
    ['transform', 'scale', 'box-shadow', 'opacity', 'all'].forEach(function (p) {
      ok(propG.indexOf(p) === -1 && propN.indexOf(p) === -1, '8/props',
        '"' + p + '" is transitioned on a feeling-mark [' + g0.props + ' | ' +
        n0.props + ']. §M7 names background and border and nothing else; ' +
        '`all` additionally makes the property count unpinnable.');
    });
    note('§8 duration ' + g0.durations + ' both sides; properties [' +
      g0.props + '] both sides');

    /* ---- §9. IDENTICAL BRIGHTNESS, DIFFERENT HUE, NO CORAL --------------- */
    if (!ok(!!chosenGlad && !!chosenNot, '9/colour',
      'a chosen background did not resolve to a colour (glad "' + g0.bg +
      '", not really "' + n1.bg + '")')) {
      throw new Error('cannot compare colours that did not resolve');
    }
    const lg = luminance(chosenGlad), ln = luminance(chosenNot);
    const dl = Math.abs(lg - ln);
    ok(dl <= LUM_EPSILON, '9/brightness',
      'ONE MARK IS BRIGHTER THAN THE OTHER. glad rgb(' + chosenGlad.join(',') +
      ') L=' + lg.toFixed(6) + ' vs not really rgb(' + chosenNot.join(',') +
      ') L=' + ln.toFixed(6) + ' — ΔL ' + dl.toFixed(6) + ' exceeds the ' +
      LUM_EPSILON + ' epsilon (one 8-bit green-channel step at this level ' +
      'is 0.0036). ⛔ THIS IS THE ASSERTION THE WHOLE PLAN IS FOR: a ' +
      'brighter "glad" tells her which answer the room hoped for, and her ' +
      'answers drift over months.');
    const dh = Math.abs(hue(chosenGlad) - hue(chosenNot));
    ok(dh >= MIN_HUE_DELTA, '9/hue',
      'the two marks differ in hue by only ' + dh.toFixed(2) + '° (minimum ' +
      MIN_HUE_DELTA + '°): glad ' + hue(chosenGlad).toFixed(2) + '° vs not ' +
      'really ' + hue(chosenNot).toFixed(2) + '°. Identical brightness must ' +
      'not be bought by making the two marks THE SAME COLOUR — that erases ' +
      'the distinction instead of balancing it.');
    [['glad background', chosenGlad], ['glad border', chosenGladBorder],
      ['not really background', chosenNot],
      ['not really border', chosenNotBorder]].forEach(function (row) {
      ok(!sameRgb(row[1], ACCENT_RGB), '9/accent',
        'the ' + row[0] + ' resolved to the coral accent rgb(' +
        ACCENT_RGB.join(',') + '). §M7: "Neither uses --accent." Coral is ' +
        'reserved chrome and means exactly one thing in this app.');
    });
    note('§9 ΔL ' + dl.toFixed(6) + ' (epsilon ' + LUM_EPSILON + '), Δhue ' +
      dh.toFixed(2) + '° (floor ' + MIN_HUE_DELTA + '°), no coral on either');

    /* ---- §10. WITH MOTION OFF ENTIRELY ----------------------------------- */
    /* §M7's own acceptance test: turn the animation off. If the chosen state
       is still obvious the motion was doing its proper job. The machine can
       settle the first half — that the distinction SURVIVES. It cannot settle
       whether it READS, and this file does not pretend to. */
    await cdp.send(session, 'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(400);
    const gR = await probe(session, GLAD);
    const nR = await probe(session, NOT_REALLY);
    String(gR.durations + ',' + nR.durations).split(',')
      .forEach(function (d) {
        ok(parseFloat(d) === 0, '10/reduced-motion',
          'under a reduced-motion preference a transition still lasts ' +
          d.trim() + ' (glad "' + gR.durations + '", not really "' +
          nR.durations + '"). The state must apply with NO transition.');
      });
    const cR = parseRgb(gR.bg), uR = parseRgb(nR.bg);
    if (ok(!!cR && !!uR, '10/reduced-motion',
      'the backgrounds did not resolve under reduced motion')) {
      const dhR = Math.abs(hue(cR) - hue(uR));
      const dlR = Math.abs(luminance(cR) - luminance(uR));
      ok(!sameRgb(cR, uR) && (dhR >= MIN_HUE_DELTA || dlR > LUM_EPSILON),
        '10/reduced-motion',
        '⛔ THE DISTINCTION DIED WITH THE MOTION. Chosen rgb(' +
        cR.join(',') + ') and unchosen rgb(' + uR.join(',') + ') are no ' +
        'longer separable (Δhue ' + dhR.toFixed(2) + '°, ΔL ' +
        dlR.toFixed(6) + '). A branch that zeroes the duration AND erases ' +
        'the difference passes a naive duration check while destroying ' +
        'exactly what §M7\'s criterion protects: the static design has to ' +
        'carry the information the motion was only decorating.');
      note('§10 durations ' + gR.durations + ' / ' + nR.durations +
        ', and the chosen/unchosen distinction survives (Δhue ' +
        dhR.toFixed(2) + '°, ΔL ' + dlR.toFixed(6) + ')');
    }

    /* the unchosen state, recorded so a reader of the log can see the
       separation SC-6's obviousness actually rests on */
    if (unchosen) {
      note('    unchosen rgb(' + unchosen.join(',') + ') L=' +
        luminance(unchosen).toFixed(6) + ' against chosen L=' +
        lg.toFixed(6));
    }
  } catch (e) {
    fail('runner', String((e && e.stack) || e));
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    /* ⛔ THE TEARDOWN MAY NOT BE SWALLOWED. app-server.stop() THROWS when the
       fixture tree survives, and a gate that quietly ignored that would leave
       a temp library on disk and say nothing. It is REPORTED as a violation of
       its own, and it never replaces the verdict above. */
    if (app && app.stop) {
      try { await app.stop(); } catch (e) {
        fail("teardown", "the fixture library was not removed: " +
          String((e && e.message) || e));
      }
    }
  }

  if (violations.length) {
    violations.forEach(function (v) { console.error(v); });
    process.exit(1);
  }
  console.log('test_feeling_mark_symmetry OK (probe count and boxes pinned ' +
    'before any style; her third-control ruling gated; the mark persists, ' +
    'switches both ways in silence and is a legal no-op when chosen; ' +
    'identical duration and property count; identical brightness within ' +
    'one 8-bit step; measurably different hue; no coral; and the ' +
    'distinction survives with motion off)');
}());
