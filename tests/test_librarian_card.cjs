#!/usr/bin/env node
'use strict';
/* =========================================================================
   test_librarian_card — 26.99955-09: THE LIBRARIAN'S DETAILS LEAVE THE
   DASHBOARD, AND THE MANAGE PAGE STOPS READING FLAT.

   HER RULINGS, 2026-08-26, verbatim (her own typed words, and the branches
   she ticked; every one of them is what this suite exists to hold):

     1. the complaint — "now the biggest problem is the librarian part is
        too long, only the important info should be put in here and also
        all of the font is the same, it is hard to tell which part i can
        press or which part is important for me"
     2. correcting the first reading — "No i meant the entire details of
        the librarain can be placed in another window instad of taking too
        much place in this dashboard"
     3. which window — "A floating card over the page"
     4. what opens it — "The librarian's tile" (its row in the ☰ sections
        list). ⛔ NOT the candle: she was offered it and did not take it.
     5. what stays — "Still keep the librarian but only keeps the most
        important things for the libraian to save the space", and she then
        ticked exactly THREE: the on/off switch · which model is answering ·
        the model picker.
     6. on the flatness — "Keep pixel, make buttons look like buttons".
     7. ⭐ 26.99955-11, after she approved the rest — "everything looks good
        but I guess my biggest concern is the readability issue, like on
        this, it looks like all of the text are all mixed together, it is
        hard to read and overwhelming, can you try to improve the
        readability on this, other things are approved". Held by armG.

   ⛔⛔ WHY EVERY LIVE ARM MEASURES A BOX. The round immediately before this
   one shipped a Manage page she rejected on sight while arms 1-5 of
   test_manage_landing were all GREEN — because not one of them ever
   measured a rendered box. Her complaint here is HEIGHT and CONTRAST: both
   are properties of pixels on a screen, and a source assertion is
   structurally unable to see either. So arms A, B, C and D drive a real
   Chrome over the real app and read real geometry and real computed style.

   THE ANTI-VACUITY ANSWERS.
    (1) CAN IT PASS BEFORE THE WORK? No. Every arm was run against the tree
        with the change reverted and each failed by name — the run is
        recorded in 26.99955-09-SUMMARY.md.
    (2) COULD IT PASS OVER NOTHING? No. Every text scan searches for a
        sentence LIFTED OUT OF app.js, so a deleted sentence stops the run
        instead of matching nothing; and every live arm asserts its surface
        is POPULATED before it scans it for an absence. An absence measured
        before the thing that would contain it has rendered is not an
        absence — 26.99955-08's arm D learned that the hard way, having
        passed once with the surface deliberately restored.

   ⛔ THE ONE STUB IS THE DATA AND ONLY THE DATA (arm C): `window.fetch` is
   wrapped for `/api/librarian/status` alone, to reach the one state a
   harness cannot otherwise produce — a librarian that is UNAVAILABLE. The
   door, the renderer, the card and the stylesheet are all real.
   ========================================================================= */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const APP = 'app.js';
const cdp = require('./lib/cdp.cjs');
const appServer = require('./lib/app-server.cjs');

const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');

const violations = [];
const notes = [];
function fail(m) { violations.push(m); }
function note(m) { notes.push(m); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ⛔ THE NARROWED LIFT. A text scan for a sentence that no longer exists
   anywhere finds nothing and passes — the emptiest green there is. Every
   sentence these arms look for is lifted from app.js by an anchor, and a
   lift that comes up short STOPS THE RUN rather than printing a clean
   count. (The derivation-needs-a-narrowed-arm lesson, applied.) */
function liftSentence(anchor, why) {
  const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = appSrc.match(new RegExp("'(" + esc + "[^']*)'"));
  if (!m || !m[1] || m[1].length < anchor.length + 10) {
    throw new Error('LIFT_SHORT: ' + APP + ' no longer carries the sentence ' +
      'beginning ' + JSON.stringify(anchor) + ' — ' + why + '. Every scan ' +
      'below searches for it BY VALUE, so a search for nothing would find ' +
      'nothing and pass. This stops the run instead.');
  }
  return m[1];
}

/* ==== ARM E — ONE RENDERER, NOT TWO (source) ===========================
   ⛔ THE HARD CONSTRAINT OF THIS ROUND. Two copies of this panel WOULD
   drift; this project has a recorded history of exactly that. The renderer
   takes a SCOPE, on the host-parameter pattern renderCallRecord and
   renderLibrarianSettings already used. */
function oneRendererArm(cloud, never) {
  const G = 'libcard-one-renderer';

  const defs = appSrc.match(/function renderLibrarianSettings\s*\(/g) || [];
  if (defs.length !== 1) {
    fail('[' + G + '] ' + APP + ': found ' + defs.length + ' definitions of ' +
      'renderLibrarianSettings — the dashboard and the card must paint from ' +
      'ONE function with a scope parameter. A forked copy is what this arm ' +
      'exists to stop.');
  } else if (!/function renderLibrarianSettings\s*\(\s*box\s*,\s*librarian\s*,\s*scope\s*\)/
    .test(appSrc)) {
    fail('[' + G + '] ' + APP + ': renderLibrarianSettings does not take a ' +
      '`scope` parameter — the two homes must be chosen by an argument, ' +
      'never by a second function');
  }

  /* Her sentences must each exist EXACTLY ONCE in the client. A second
     literal is a second thing to keep true, and it is precisely how a
     forked render would announce itself. */
  [[cloud, 'the cloud disclosure'], [never, 'the never-show disclosure']]
    .forEach(function (pair) {
      const n = appSrc.split(pair[0]).length - 1;
      if (n !== 1) {
        fail('[' + G + '] ' + APP + ': ' + pair[1] + ' appears ' + n +
          ' times — it must be ONE contiguous source literal at ONE site. ' +
          'Two copies means the panel was forked, not scoped.');
      }
    });

  /* The two slot-fillers must each be called from exactly one place.

     ⚠ COUNTED IN CODE ONLY, AND LINE-LOCALLY. This project's standing
     convention is that a moved call is RETAINED IN A COMMENT at its old
     site so the surface's history survives the change — so a raw count over
     the file finds three and reports a fork that is not there (it did, on
     the first run of this arm). ⛔ AND THE STRIPPING IS DELIBERATELY
     LINE-LOCAL rather than a whole-file `strip_js`: D-05-D measured a
     stripper desynchronising on one quote and going blind for the REST OF
     THE FILE. Truncating each line at its own `//` cannot desync past that
     line, and neither needle below ever appears inside a string. */
  const codeLines = appSrc.split('\n').map(function (l) {
    const c = l.indexOf('//');
    return c === -1 ? l : l.slice(0, c);
  }).join('\n');
  ['renderJobDisclosure(', 'readLibrarianRunState('].forEach(function (call) {
    const n = codeLines.split(call).length - 1;
    /* one definition + one call site = two occurrences */
    if (n !== 2) {
      fail('[' + G + '] ' + APP + ': `' + call + '` occurs ' + n + ' times ' +
        'in CODE (expected 2 — its definition and its ONE call site). The ' +
        'slot and its painter travel together, from one place');
    }
  });

  /* ⛔ THE T-26-17 COMMENT IS AMENDED, NOT DELETED — and the toggle keeps
     the original rule. Her ruling moved the DISCLOSURE behind a tap; the
     record of why the exception existed, and of the fact she was given
     before she ruled, must survive in the source. */
  /* ⚠ SEARCHED OVER A FLATTENED COMMENT STREAM. The sentence is wrapped
     across comment lines in both of its sites, so a raw substring search
     finds it in neither — the first run of this arm reported the record
     "deleted" while it was sitting right there, re-wrapped. */
  const flat = appSrc.replace(/\n\s*\/\/ ?/g, ' ');
  ['T-26-17', 'cannot consent to a thing you cannot see'].forEach(function (n) {
    if (flat.indexOf(n) === -1) {
      fail('[' + G + '] ' + APP + ': the T-26-17 informed-consent record no ' +
        'longer carries ' + JSON.stringify(n) + ' — that comment is to be ' +
        'AMENDED, never deleted: it is the reason the exception exists and ' +
        'the record that she was told what she was trading');
    }
  });

  /* The card's CSS must not have been invented from scratch — it reuses the
     shipped .card frame and the shipped .btn recipe. */
  if (cssSrc.indexOf('.manage-librarian-card') === -1) {
    fail('[' + G + '] tokens.css: the floating card has no rule — it must ' +
      'be styled from the shipped card/button vocabulary, not inline');
  }
  if (violations.length === 0) {
    note('armE (source): ONE renderer with a scope parameter; each of her ' +
      'two disclosure sentences is a single literal; each moved slot has ' +
      'exactly one painter; the T-26-17 record survives');
  }
}

async function click(session, sel) {
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;n.scrollIntoView({block:"center"});' +
    'var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box) throw new Error('not clickable / not present: ' + sel);
  const p = JSON.parse(box);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
}

/* ⛔ POPULATED BEFORE SCANNED. The dashboard box is filled by an ASYNC
   status read; a scan that runs first finds an empty box and every absence
   below would be an absence of everything. The h3 is the box's own first
   byte, so its presence is the honest "this painted" signal — and it is
   asserted rather than assumed. */
const DASH = '(function(){' +
  'var lb=document.getElementById("manage-sec-librarian-settings");' +
  'if(!lb)return JSON.stringify({found:false});' +
  'var r=lb.getBoundingClientRect();' +
  'function box(sel){var n=lb.querySelector(sel);if(!n)return {n:0};' +
  ' var q=n.getBoundingClientRect();' +
  ' return {n:1,w:Math.round(q.width),h:Math.round(q.height),' +
  '  text:(n.textContent||"").replace(/\\s+/g," ").trim()};}' +
  'return JSON.stringify({found:true,' +
  'h:Math.round(r.height),w:Math.round(r.width),' +
  'heads:lb.querySelectorAll("h3").length,' +
  'text:(lb.textContent||"").replace(/\\s+/g," ").trim(),' +
  'jobHosts:lb.querySelectorAll(".librarian-job-list").length,' +
  'runHosts:lb.querySelectorAll(".librarian-run-state").length,' +
  'status:box(".librarian-status"),' +
  'toggle:box(".librarian-toggle"),' +
  'picker:box(".librarian-voice-picker")});})()';

/* ⛔ THE PRE-RULING HEIGHT, MEASURED ON THIS HARNESS AT THIS VIEWPORT AND
   WRITTEN DOWN: 1007px, of which the per-job list alone was 600. Her
   complaint was that the block is "too long", so the bound below is a
   MEASURED FACT rather than a taste: anything at or above it is the shape
   she rejected. The shipped block measures 365px. */
const HEIGHT_BEFORE = 1007;
const HEIGHT_BOUND = 520;

/* ==== ARM A — the dashboard holds her three things and nothing else ==== */
async function dashboardArm(cloud, never, billing) {
  const G = 'libcard-dash';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');

    let m = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      m = JSON.parse(await cdp.evaluate(session, DASH));
      if (m.found && m.h > 0 && m.heads > 0) { break; }
    }
    if (!m || !m.found || m.h <= 0 || m.heads === 0) {
      fail('[' + G + '] the Manage librarian block never painted (found=' +
        (m && m.found) + ', height=' + (m && m.h) + ', headings=' +
        (m && m.heads) + ') — every absence below would then be an absence ' +
        'of everything, which proves nothing');
      return;
    }

    /* (1) THE THREE RULED THINGS ARE THERE, AT A SIZE A PERSON COULD PRESS.
       Measured as boxes, never as source text. */
    [['status', 'the status panel — where "which model is answering" lives'],
      ['toggle', 'the on/off switch'],
      ['picker', 'the model picker']].forEach(function (pair) {
      const b = m[pair[0]];
      if (!b.n || b.w <= 0 || b.h <= 0) {
        fail('[' + G + '] ' + pair[1] + ' is missing or renders at zero ' +
          'size (present=' + b.n + ', ' + b.w + 'x' + b.h + '). She ticked ' +
          'exactly three things to keep on this dashboard and this is one ' +
          'of them');
      }
    });

    /* (2) AND NOTHING SHE DID NOT TICK. The two hosts leave WITH their
       painters — a host left behind is somewhere the detail can be painted
       back without a decision (26.99955-08's own rule). */
    if (m.jobHosts !== 0) {
      fail('[' + G + '] the dashboard still carries ' + m.jobHosts +
        ' .librarian-job-list host(s) — the per-job list moved into the ' +
        'floating card WITH its slot, by her ruling');
    }
    if (m.runHosts !== 0) {
      fail('[' + G + '] the dashboard still carries ' + m.runHosts +
        ' .librarian-run-state host(s) — the run state moved into the card');
    }
    [[cloud, 'the cloud disclosure sentence'],
      [never, 'the never-show disclosure sentence']].forEach(function (p) {
      if (m.text.indexOf(p[0]) !== -1) {
        fail('[' + G + '] ' + p[1] + ' is STILL on the Manage dashboard. ' +
          'She ticked the switch, the model line and the picker — and, told ' +
          'first that this sentence is her informed consent, did not tick ' +
          'it. It belongs in the card now');
      }
    });
    /* ⭐⭐ 26.99955-10 (D-09-C) — HER SECOND RULING ON THIS BLOCK, and it is
       held APART from the two above because it is a different fact. The
       billing line survived her first tick only because it shared one
       bordered box with the model line she DID keep; she read that and ruled
       "Move it into the card". ⛔ Its SIBLING ARM — `librarian.why` on a
       machine that cannot answer — is NOT covered by this and must stay on
       the dashboard; armC drives that half. */
    if (m.text.indexOf(billing) !== -1) {
      fail('[' + G + '] the billing line is STILL on the Manage dashboard. ' +
        'She ticked exactly three things and this was never one of them — ' +
        'it stayed only because it shared a box with the model line, and ' +
        'her ruling was "Move it into the card"');
    }
    /* ⛔ AND THE BOX SHE DID TICK IS STILL A BOX WITH SOMETHING IN IT. The
       move takes a line OUT of `.librarian-status`; a frame left behind
       holding nothing is a 2px border and 8px of padding announcing an
       empty fact. */
    if (m.status.n && m.status.text === '') {
      fail('[' + G + '] the dashboard status panel renders as an EMPTY ' +
        'bordered frame (' + m.status.w + 'x' + m.status.h + '). With the ' +
        'billing line moved to the card, a box with no line left in it must ' +
        'not render at all');
    }

    /* (3) THE HEIGHT — her actual complaint, as a number. */
    if (m.h >= HEIGHT_BOUND) {
      fail('[' + G + '] the dashboard librarian block measures ' + m.h +
        'px at 1280x900. It measured ' + HEIGHT_BEFORE + 'px before her ' +
        'ruling and must come in under ' + HEIGHT_BOUND + 'px — "the ' +
        'librarian part is too long" is a claim about pixels, so this arm ' +
        'is a measurement and not a taste');
    }
    if (violations.length === before) {
      note('armA (real Chrome): the dashboard librarian block measures ' +
        m.h + 'px (was ' + HEIGHT_BEFORE + 'px) and holds her three ruled ' +
        'things — the status panel, the switch and the picker — with the ' +
        'job list, the run state and both disclosure sentences gone');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* the card, measured BOTH ways — a present-but-hidden card fails by name
   here rather than passing as markup (the 26.99955-02 lesson) */
const CARD = '(function(){' +
  'var c=document.getElementById("manage-librarian-card");' +
  'var lb=document.getElementById("manage-sec-librarian-settings");' +
  'var lt=document.getElementById("manage-landing");' +
  'var r=c?c.getBoundingClientRect():null;' +
  'var q=lt?lt.getBoundingClientRect():null;' +
  'var behind=null;' +
  /* ⛔ "the page stays visible BEHIND it" is a claim about the screen, so
     it is read off the screen: a point on the landing page well outside the
     card's own rectangle must still hand back a page element. */
  'if(r){var px=Math.max(8,r.left/2),py=Math.min(window.innerHeight-8,' +
  ' r.top+r.height/2);var e=document.elementFromPoint(px,py);' +
  ' behind=e?(e.closest("#manage-landing")?"landing":e.tagName):null;}' +
  'return JSON.stringify({present:!!c,' +
  'offW:c?c.offsetWidth:0,offH:c?c.offsetHeight:0,' +
  'rectW:r?Math.round(r.width):0,rectH:r?Math.round(r.height):0,' +
  'closes:c?c.querySelectorAll(".manage-librarian-card-close").length:0,' +
  'text:c?(c.textContent||"").replace(/\\s+/g," ").trim():"",' +
  'jobRows:c?c.querySelectorAll(".librarian-job-list p").length:0,' +
  'landingH:q?Math.round(q.height):0,behind:behind,' +
  'dashH:lb?Math.round(lb.getBoundingClientRect().height):0});})()';

/* ==== ARM B — the tile opens the card; the ✕ puts it away ============== */
async function cardArm(cloud, billing) {
  const G = 'libcard-door';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      const d = JSON.parse(await cdp.evaluate(session, DASH));
      if (d.found && d.h > 0 && d.heads > 0) { break; }
    }

    /* nothing is raised until she opens it (law 1: pull-only) */
    let m = JSON.parse(await cdp.evaluate(session, CARD));
    if (m.present) {
      fail('[' + G + '] the librarian card is already raised on arrival — ' +
        'it opens on her tap and never on its own');
    }

    /* ⛔ HER DOOR: the librarian's row in the ☰ sections list. */
    await click(session, '#manage-sections-toggle');
    await sleep(600);
    await click(session, '.manage-rail-item[data-pane="librarian"]');
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      m = JSON.parse(await cdp.evaluate(session, CARD));
      if (m.present && m.jobRows > 0) { break; }
    }

    if (!m.present || m.offW <= 0 || m.offH <= 0 ||
        m.rectW <= 0 || m.rectH <= 0) {
      fail('[' + G + "] her tile did not raise the librarian card " +
        '(present=' + m.present + ', offset ' + m.offW + 'x' + m.offH +
        ', rect ' + m.rectW + 'x' + m.rectH + '). Measured BOTH ways: a ' +
        'card in the markup at zero size is a card she cannot read');
      return;
    }
    if (m.closes !== 1) {
      fail('[' + G + '] the card carries ' + m.closes + ' close controls ' +
        '(expected exactly 1). She asked for the ✕ by name on the card ' +
        "box's card and this idiom is that one");
    }
    if (m.text.indexOf(cloud) === -1) {
      fail('[' + G + '] the card does not carry the cloud disclosure — the ' +
        'details moved here, and the disclosure is the first of them');
    }
    if (m.jobRows <= 0) {
      fail('[' + G + '] the card carries no per-job rows — the list moved ' +
        'here with its slot and its painter');
    }
    /* ⭐⭐ 26.99955-10 (D-09-C): THE OTHER HALF OF THE MOVE. armA proves the
       line left the dashboard; a line that left and arrived NOWHERE would
       satisfy that absence perfectly, and would have deleted a fact about
       her money off the one surface that states it. It has to BE here.
       ⚠ The harness librarian answers `auth: "api-key"`, so this arm reads
       the arm that actually moved. */
    if (m.text.indexOf(billing) === -1) {
      fail('[' + G + '] the billing line is not on the card either. Her ' +
        'ruling was "Move it into the card" — a line removed from the ' +
        'dashboard and landing nowhere is a deletion, not a move, and this ' +
        'one is about who pays for the librarian');
    }
    /* ⛔ "A floating card OVER THE PAGE" — the page is still there. */
    if (m.landingH <= 0 || m.dashH <= 0) {
      fail('[' + G + '] the Manage page went away behind the card ' +
        '(landing ' + m.landingH + 'px, librarian block ' + m.dashH +
        'px). She chose a floating card precisely so the page stays');
    }
    if (m.behind !== 'landing') {
      fail('[' + G + '] a point beside the card does not hand back the ' +
        'landing page (got ' + JSON.stringify(m.behind) + ') — the page ' +
        'must remain visible, and reachable, behind the card');
    }

    /* the ✕ — driven, not assumed */
    await click(session, '.manage-librarian-card-close');
    await sleep(600);
    const gone = JSON.parse(await cdp.evaluate(session, CARD));
    if (gone.present) {
      fail('[' + G + '] the ✕ did not put the card away');
    }
    if (gone.landingH <= 0 || gone.dashH <= 0) {
      fail('[' + G + '] closing the card took the page with it (landing ' +
        gone.landingH + 'px, librarian block ' + gone.dashH + 'px)');
    }

    /* ⛔ THE STALE-CARD DEFECT, DRIVEN. 26.99955-08 measured it on the
       desk: leaving only HIDES a card, so the next visit finds it and
       re-shows the previous visit's render. Raise it, walk out, walk back. */
    await click(session, '#manage-sections-toggle');
    await sleep(600);
    await click(session, '.manage-rail-item[data-pane="librarian"]');
    await sleep(1200);
    const up = JSON.parse(await cdp.evaluate(session, CARD));
    if (!up.present) {
      fail('[' + G + '] the card would not raise a second time');
    }
    await click(session, '#room-panel-back');
    await sleep(1500);
    await click(session, '#room-manage-link');
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      m = JSON.parse(await cdp.evaluate(session, CARD));
      if (m.dashH > 0) { break; }
    }
    if (m.present) {
      fail('[' + G + '] a raised card SURVIVED leaving and re-entering ' +
        'Manage — that is the stale-card defect 26.99955-08 measured on ' +
        'the desk, where a hidden card came back holding the previous ' +
        "visit's render");
    }
    if (violations.length === before) {
      note('armB (real Chrome): her tile raises the card over a page that ' +
        'stays visible behind it, the card carries the disclosure and the ' +
        'per-job rows, the ✕ puts it away, and it does not survive leaving ' +
        'Manage');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ⛔ THE DATA, AND ONLY THE DATA. The harness serves a working librarian,
   so the one state that matters most for T-26-17 — UNAVAILABLE — cannot be
   reached otherwise. Every other route, and the whole render path, is real.
   `window.__hit` makes a stub that never fires impossible to miss: a first
   draft of 26.99955-08's stub keyed on the wrong path, sat inert, and its
   arm passed on whatever the harness happened to hold. */
const PLANT = '(function(){' +
  'if(window.__libStub){return "already";}' +
  'window.__libStub=true;window.__origFetch=window.fetch;window.__hit=0;' +
  'window.fetch=function(u,o){' +
  'var p=String(u).split("?")[0];' +
  'if(/\\/api\\/librarian\\/status$/.test(p)){window.__hit++;' +
  'return Promise.resolve({ok:true,status:200,json:function(){' +
  'return Promise.resolve({available:false,enabled:false,version_ok:false,' +
  'why:"nothing can answer yet.",photo_reading_ok:true});}});}' +
  'return window.__origFetch.call(window,u,o);};return "ok";})()';

/* ==== ARM C — the disclosure still reaches her while UNAVAILABLE ======= */
async function unavailableArm(cloud, never) {
  const G = 'libcard-unavailable';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2000);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(session, PLANT);
    await sleep(500);
    await click(session, '#room-manage-link');
    let dash = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      dash = JSON.parse(await cdp.evaluate(session, DASH));
      if (dash.found && dash.h > 0 && dash.heads > 0) { break; }
    }
    const hits = await cdp.evaluate(session, 'String(window.__hit||0)');
    if (parseInt(hits, 10) <= 0) {
      fail('[' + G + '] the status stub never fired (' + hits + ' hits) — ' +
        'the arm below would then be measuring an AVAILABLE librarian and ' +
        'proving nothing. A stub that never fires is a fixture that is ' +
        'not there');
      return;
    }

    /* ⭐⭐ 26.99955-10 (D-09-C) — THE SIBLING ARM, DRIVEN RATHER THAN
       ASSUMED. `authLine` and the billing line used to be one variable and
       therefore one home. Only the billing half moved. THIS half — the
       server's own words on a machine that cannot answer — is the reason
       there is no switch to press, and it must keep behaving exactly as it
       did: on the dashboard, inside the same panel, in her words. Split the
       two and lose this and the dashboard holds a heading and nothing else
       on precisely the machine that needs telling. */
    if (!dash || !dash.status.n || dash.status.h <= 0) {
      fail('[' + G + '] with the librarian unavailable the dashboard has no ' +
        'status panel at all (present=' + (dash && dash.status.n) + '). ' +
        '⛔ The billing line moved to the card; its SIBLING ARM did not, ' +
        'and this is the machine where that arm is the whole answer');
    } else if (dash.status.text.indexOf('nothing can answer yet.') === -1) {
      fail('[' + G + '] the dashboard status panel does not carry the ' +
        "server's own reason on a machine that cannot answer (it reads " +
        JSON.stringify(dash.status.text) + ')');
    }

    await click(session, '#manage-sections-toggle');
    await sleep(600);
    await click(session, '.manage-rail-item[data-pane="librarian"]');
    let m = null;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      m = JSON.parse(await cdp.evaluate(session, CARD));
      if (m.present && m.text.length > 50) { break; }
    }
    if (!m || !m.present || m.rectH <= 0) {
      fail('[' + G + '] the card did not raise while the librarian is ' +
        'unavailable — an unagreed address is EXACTLY when available is ' +
        'false, and a disclosure that only appeared once the librarian ' +
        'already worked would be one nobody could reach (T-26-17)');
      return;
    }
    [[cloud, 'the cloud disclosure'],
      [never, 'the never-show disclosure']].forEach(function (p) {
      if (m.text.indexOf(p[0]) === -1) {
        fail('[' + G + '] ' + p[1] + ' is ABSENT from the card while ' +
          '`librarian.available` is false. ⛔ HER RULING MOVED THE ' +
          'DISCLOSURE BEHIND A TAP; it did NOT permit it to disappear. ' +
          'The card half of the renderer carries no availability gate for ' +
          'exactly this reason');
      }
    });
    if (violations.length === before) {
      note('armC (real Chrome, one stubbed route): with the librarian ' +
        'UNAVAILABLE the card still carries both of her disclosure ' +
        'sentences — T-26-17\'s surviving half, driven rather than assumed');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ⛔ COMPUTED STYLE, NOT SOURCE. "make buttons look like buttons" is a
   claim about what renders — an inline style, a stylesheet cascade or an
   !important can each decide it, and only the browser knows which won. */
const CHROME = '(function(){' +
  'function read(sel){var n=document.querySelector(sel);if(!n)return {n:0};' +
  ' var s=getComputedStyle(n);var r=n.getBoundingClientRect();' +
  ' return {n:1,bw:parseFloat(s.borderTopWidth)||0,' +
  '  shadow:s.boxShadow,deco:s.textDecorationLine,' +
  '  size:parseFloat(s.fontSize)||0,color:s.color,' +
  '  w:Math.round(r.width),h:Math.round(r.height)};}' +
  'return JSON.stringify({' +
  'toggle:read("#manage-sec-librarian-settings .librarian-toggle"),' +
  'pick:read("#manage-sec-librarian-settings .librarian-voice-pick"),' +
  'shelf:read("#manage-to-shelf"),' +
  'current:read("#manage-sec-librarian-settings .librarian-voice-current"),' +
  'head:read("#manage-sec-librarian-settings h3"),' +
  'state:read("#manage-sec-librarian-settings .librarian-state-line"),' +
  'prose:read("#manage-sec-librarian-settings .librarian-voice-model p")});})()';

/* ==== ARM D — pressable reads as pressable; the tiers differ ========== */
async function hierarchyArm() {
  const G = 'libcard-hierarchy';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');
    let m = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      m = JSON.parse(await cdp.evaluate(session, CHROME));
      if (m.toggle.n && m.head.n) { break; }
    }
    if (!m || !m.toggle.n || !m.head.n) {
      fail('[' + G + '] the librarian block never painted its switch and ' +
        'heading — every style reading below would be a reading of nothing');
      return;
    }

    /* (1) PRESSABLE READS AS PRESSABLE. */
    [['toggle', 'the on/off switch'], ['pick', 'a model the picker offers'],
      ['shelf', 'the back-to-the-shelf control']].forEach(function (pair) {
      const b = m[pair[0]];
      if (!b.n) {
        fail('[' + G + '] ' + pair[1] + ' is not on the page to measure');
        return;
      }
      if (b.bw < 2) {
        fail('[' + G + '] ' + pair[1] + ' renders a ' + b.bw + 'px border — ' +
          'her ruling is "make buttons look like buttons", and the app\'s ' +
          'own button vocabulary is a 2px ink border with a bevel');
      }
      if (!b.shadow || b.shadow === 'none') {
        fail('[' + G + '] ' + pair[1] + ' renders no box-shadow — the ' +
          'shipped .btn recipe carries the bevel pair and the hard offset ' +
          'shadow, and that chrome is what makes it read as pressable');
      }
      if (b.deco !== 'none') {
        fail('[' + G + '] ' + pair[1] + ' still renders as underlined text ' +
          '(' + b.deco + ') — an underline is the register she said she ' +
          'cannot tell apart from the prose around it');
      }
    });

    /* (2) ⛔ AND THE ONE CONTROL THAT MUST NOT. The picker's CURRENT alias
       is where she already is, not a door (26.87-09: state by weight of
       affordance, because coral is reserved). Giving it button chrome would
       destroy the distinction this whole pass exists to create. */
    if (m.current.n && m.current.bw >= 2) {
      fail('[' + G + '] the picker\'s CURRENT alias grew a button border. ' +
        'It is where she already is, not something to press — 26.87-09 ' +
        'marks it plain on purpose, and the chrome beside it is what makes ' +
        'that legible');
    }

    /* (3) THE TIERS DIFFER, MEASURABLY. "all of the font is the same" is a
       claim about size and colour, so it is answered in size and colour. */
    if (!m.prose.n) {
      fail('[' + G + '] no plain explanatory prose on the block to compare ' +
        'against — the tier comparison below would be vacuous');
    } else {
      if (!(m.head.size >= m.prose.size * 1.4)) {
        fail('[' + G + '] the heading (' + m.head.size + 'px) does not ' +
          'carry weight over the plain prose (' + m.prose.size + 'px)');
      }
      if (m.head.color === m.prose.color) {
        fail('[' + G + '] the heading and the plain prose render the SAME ' +
          'colour (' + m.head.color + ') — "all of the font is the same"');
      }
      if (m.state.n) {
        if (!(m.state.size > m.prose.size)) {
          fail('[' + G + "] the switch's live state line (" + m.state.size +
            'px) does not read larger than the explanatory prose beside it ' +
            '(' + m.prose.size + 'px) — the live facts are the part she ' +
            'said she cannot pick out');
        }
        if (m.state.color === m.prose.color) {
          fail('[' + G + "] the switch's live state line and the plain " +
            'prose render the same colour (' + m.state.color + ')');
        }
      } else {
        fail('[' + G + '] the switch has no state line to measure');
      }
    }
    if (violations.length === before) {
      note('armD (real Chrome, computed style): the switch, a picker ' +
        'alias and the shelf control all render 2px-bordered, bevelled and ' +
        'un-underlined; the picker\'s current alias stays plain; heading ' +
        m.head.size + 'px / live state ' + m.state.size + 'px / prose ' +
        m.prose.size + 'px, in three colours');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM F — the narrow window still lays out ========================= */
async function narrowArm() {
  const G = 'libcard-narrow';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      const d = JSON.parse(await cdp.evaluate(session, DASH));
      if (d.found && d.h > 0 && d.heads > 0) { break; }
    }
    await click(session, '#manage-sections-toggle');
    await sleep(600);
    await click(session, '.manage-rail-item[data-pane="librarian"]');
    let m = null;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      m = JSON.parse(await cdp.evaluate(session, CARD));
      if (m.present && m.rectH > 0) { break; }
    }
    if (!m || !m.present || m.rectW <= 0) {
      fail('[' + G + '] the card does not reach the screen at a 600px ' +
        'window');
      return;
    }
    const over = JSON.parse(await cdp.evaluate(session,
      '(function(){var c=document.getElementById("manage-librarian-card");' +
      'var r=c.getBoundingClientRect();' +
      'return JSON.stringify({left:Math.round(r.left),' +
      'right:Math.round(r.right),vw:window.innerWidth,' +
      'sw:c.scrollWidth,cw:c.clientWidth});})()'));
    if (over.left < 0 || over.right > over.vw) {
      fail('[' + G + '] the card runs off a ' + over.vw + 'px window (' +
        over.left + ' … ' + over.right + ') — it must fold, not overflow');
    }
    if (over.sw > over.cw + 1) {
      fail('[' + G + '] the card scrolls sideways at 600px (scrollWidth ' +
        over.sw + ' vs clientWidth ' + over.cw + ')');
    }
    if (violations.length === before) {
      note('armF (real Chrome at 600x900): the card folds to the narrow ' +
        'window — on screen, inside the viewport, no sideways scroll');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM G — 26.99955-11: THE CARD'S CONTENT STOPS READING AS ONE WALL ==
   ⛔ AND THIS ARM STATES NO LENGTH. D-17 / #74's rule — a surface that names
   its own count goes stale the day a job is added — applies to the
   INSTRUMENT as much as to the list: the expected number of rows is taken
   from the live route in the same session, never written here.

   HER COMPLAINT, 2026-08-26, verbatim and in full:

     "everything looks good but I guess my biggest concern is the readability
      issue, like on this, it looks like all of the text are all mixed
      together, it is hard to read and overwhelming, can you try to improve
      the readability on this, other things are approved"

   ⛔ THE SECOND TIME SHE HAS RAISED SAMENESS. The first was "all of the font
   is the same, it is hard to tell which part i can press or which part is
   important for me", and her branch was "Keep pixel, make buttons look like
   buttons". 26.99955-09 applied that to the Manage page and NOT to the
   card's own content — this arm is the half that was missed.

   ⛔ THE PIXEL TYPEFACE MAY NOT MOVE (she has declined the sans mix twice),
   so every check below is about SIZE, WEIGHT, COLOUR, SPACING and RULES.
   Arm (5) drives the font FAMILY too, so a "fix" that reached for a second
   typeface fails here rather than in front of her.

   ⛔⛔ AND ARM (6) IS THE ONE THAT MATTERS MOST. Her words are hers. The
   route's own `name` / `words` / `who_reads` are read back from the server
   in this same session and each must still be present, BY VALUE, in the row
   that carries them. A presentation change that drops, truncates or
   re-punctuates a character of hers fails here — which is the only honest
   way to say "nothing of hers moved".

   THE ANTI-VACUITY ANSWERS, for this arm specifically.
    (1) CAN IT PASS BEFORE THE WORK? No. Driven against the shipped flat
        shape it failed at (1) — the rows carry no name element at all,
        because `jobDisclosureLine` had joined her three fields into one
        string with ' — ' before the renderer ever saw them.
    (2) COULD IT PASS OVER NOTHING? No. It asserts a row COUNT taken from
        the live route before it measures anything, so an empty list stops
        the arm instead of satisfying every "no violation found" below. */
const ROWS = '(function(){' +
  'var c=document.getElementById("manage-librarian-card");' +
  'if(!c)return JSON.stringify({present:false});' +
  'var body=document.getElementById("manage-librarian-card-body");' +
  'var list=c.querySelector(".librarian-job-list");' +
  'function m(n){if(!n)return null;var s=getComputedStyle(n);' +
  ' var r=n.getBoundingClientRect();' +
  ' return {size:Math.round((parseFloat(s.fontSize)||0)*10)/10,' +
  '  weight:String(s.fontWeight),color:s.color,family:s.fontFamily,' +
  '  bt:Math.round((parseFloat(s.borderTopWidth)||0)*10)/10,' +
  '  btStyle:s.borderTopStyle,btColor:s.borderTopColor,' +
  '  top:Math.round(r.top),bottom:Math.round(r.bottom),' +
  '  left:Math.round(r.left),right:Math.round(r.right),' +
  '  w:Math.round(r.width),h:Math.round(r.height),' +
  '  text:(n.textContent||"").replace(/\\s+/g," ").trim()};}' +
  'var kids=list?[].slice.call(list.children):[];' +
  'var rows=kids.map(function(el){return {box:m(el),' +
  ' name:m(el.querySelector(".job-row-name")),' +
  ' words:m(el.querySelector(".job-row-words")),' +
  ' who:m(el.querySelector(".job-row-who")),' +
  ' text:(el.textContent||"").replace(/\\s+/g," ").trim()};});' +
  'var outside=body?[].slice.call(body.querySelectorAll("p"))' +
  ' .filter(function(p){return !list||!list.contains(p);}):[];' +
  'return JSON.stringify({present:true,listPresent:!!list,rows:rows,' +
  ' disclosure:outside.length?m(outside[0]):null,' +
  ' cardW:Math.round(c.getBoundingClientRect().width),' +
  ' scrollW:c.scrollWidth,clientW:c.clientWidth});})()';

/* the SAME route the render reads, asked again in the same page, so arm (6)
   compares what she sees against what the server actually said rather than
   against a copy this file keeps */
const JOBS = 'fetch("/api/librarian/jobs",{method:"POST",' +
  'headers:{"Content-Type":"application/json"},body:"{}"})' +
  '.then(function(r){return r.json();})' +
  '.then(function(j){return JSON.stringify(j);})';

async function readabilityArm() {
  const G = 'libcard-readable';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      const d = JSON.parse(await cdp.evaluate(session, DASH));
      if (d.found && d.h > 0 && d.heads > 0) { break; }
    }
    await click(session, '#manage-sections-toggle');
    await sleep(600);
    await click(session, '.manage-rail-item[data-pane="librarian"]');

    let m = null;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      m = JSON.parse(await cdp.evaluate(session, ROWS));
      if (m.present && m.rows.length > 1) { break; }
    }
    /* ⛔ SETTLE ON AN OBSERVED FACT, NOT A SLEEP — and this one is a real
       hazard rather than a precaution. The job name is the FIRST thing on
       this page to ask for weight 700, so the vendored PixelifySans-Bold
       woff2 only starts loading when the card first paints; every name box
       is measured in the regular face until it lands, and then the row
       reflows. A read taken across that reflow reported a name whose bottom
       sat BELOW the description that follows it — a geometry that never
       renders, seen once in a planted run before this wait existed. */
    await cdp.evaluate(session,
      'document.fonts.ready.then(function(){return "ready";})');
    await sleep(400);
    m = JSON.parse(await cdp.evaluate(session, ROWS));

    /* ⛔ THE ROUTE'S OWN ANSWER, FIRST. Everything below is measured against
       it, so a list that painted nothing stops the arm instead of passing
       every "no violation" check in it. */
    const served = JSON.parse(await cdp.evaluate(session, JOBS));
    const jobs = (served && served.jobs) ? served.jobs.filter(function (r) {
      return r && r.job && r.name && r.words;
    }) : [];
    const device = (served && served.on_device &&
      typeof served.on_device.words === 'string') ? served.on_device.words : '';
    const expected = jobs.length + (device === '' ? 0 : 1);
    if (!expected) {
      fail('[' + G + '] /api/librarian/jobs served no rows in this session — ' +
        'every measurement below would then be a measurement of nothing');
      return;
    }
    if (!m || !m.present || !m.listPresent) {
      fail('[' + G + '] the card did not raise with its job list (present=' +
        (m && m.present) + ', list=' + (m && m.listPresent) + ')');
      return;
    }
    if (m.rows.length !== expected) {
      fail('[' + G + '] the card paints ' + m.rows.length + ' row element(s) ' +
        'for ' + expected + ' served row(s). Her complaint is that the rows ' +
        '"are all mixed together" — the answer is one element per job, so ' +
        'the count of elements IS the count of things, and a column of ' +
        'sentences inside a single paragraph is the shape she rejected');
      return;
    }

    const named = m.rows.filter(function (r) { return r.name; });

    /* (1) EACH JOB IS ITS OWN ROW, AND THE NAME LEADS IT. */
    if (named.length !== jobs.length) {
      fail('[' + G + '] ' + named.length + ' of ' + m.rows.length +
        ' rows carry a .job-row-name element (expected ' + jobs.length +
        ' — every derived row has a name from the route). The renderer used ' +
        'to JOIN name, words and who-reads into ONE string with " — ", ' +
        'which is why she reads them as one wall: three separate facts ' +
        'painted as one sentence at one size');
      return;
    }

    /* (2) NAME AND DESCRIPTION ARE MEASURABLY DIFFERENT THINGS. "all of the
       text are all mixed together" is a claim about pixels, so it is
       answered in pixels: size, weight and colour, read off the browser. */
    named.forEach(function (r, i) {
      if (!r.words) {
        fail('[' + G + '] row ' + (i + 1) + ' carries a name but no ' +
          '.job-row-words element — the description must be its own element ' +
          'so it can carry its own weight');
        return;
      }
      const axes = [];
      if (r.name.size !== r.words.size) { axes.push('size'); }
      if (r.name.weight !== r.words.weight) { axes.push('weight'); }
      if (r.name.color !== r.words.color) { axes.push('colour'); }
      if (axes.length < 2) {
        fail('[' + G + '] row ' + (i + 1) + ' renders its name and its ' +
          'description in the same register (name ' + r.name.size + 'px/' +
          r.name.weight + '/' + r.name.color + ' vs description ' +
          r.words.size + 'px/' + r.words.weight + '/' + r.words.color +
          '). They differ on ' + (axes.length ? axes.join(' + ') : 'nothing') +
          ' — the pixel face stays, so the hierarchy has to come from at ' +
          'least two of size, weight and colour');
      }
      if (!(r.name.size >= r.words.size)) {
        fail('[' + G + '] row ' + (i + 1) + ' paints its name SMALLER than ' +
          'its description (' + r.name.size + 'px vs ' + r.words.size +
          'px) — the name leads, so the eye can run down the names alone');
      }
      /* the name sits ABOVE the description rather than beside it: a row
         whose two halves share a line is the wall again, with classes */
      if (!(r.name.bottom <= r.words.top + 1)) {
        fail('[' + G + '] row ' + (i + 1) + " does not stack: the name's " +
          'bottom is ' + r.name.bottom + ' and the description starts at ' +
          r.words.top);
      }
    });

    /* (3) THE ROWS ARE SEPARATED — measured as a gap, and as a rule. */
    /* ⚠ THE LOWEST INK OF ONE ROW TO THE HIGHEST INK OF THE NEXT, and the
       order matters: a row's parts do not stack in DOM order (the who-reads
       tag rides the name's line), so taking "the last element" would have
       measured from the tag and reported a gap that is really the height of
       the sentence beneath it. Max of the bottoms, min of the tops. */
    function inkBoxes(r) {
      return [r.name, r.words, r.who].filter(Boolean);
    }
    function lowestInk(r) {
      return Math.max.apply(null, inkBoxes(r).map(function (b) {
        return b.bottom;
      }));
    }
    function highestInk(r) {
      return Math.min.apply(null, inkBoxes(r).map(function (b) {
        return b.top;
      }));
    }
    for (let i = 1; i < m.rows.length; i++) {
      const prev = m.rows[i - 1];
      const cur = m.rows[i];
      const gap = highestInk(cur) - lowestInk(prev);
      if (gap < 12) {
        fail('[' + G + '] rows ' + i + ' and ' + (i + 1) + ' are ' + gap +
          'px apart at their nearest text (the flat list was ~6px). ' +
          'Separate things six pixels apart read as one paragraph');
      }
      if (!(cur.box.bt >= 1) || cur.box.btStyle === 'none') {
        fail('[' + G + '] row ' + (i + 1) + ' carries no hairline above it ' +
          '(border-top ' + cur.box.bt + 'px ' + cur.box.btStyle + ') — ' +
          'spacing alone is what a paragraph break looks like; a rule is ' +
          'what a list of separate things looks like');
      }
    }

    /* (4) `who_reads` IS PRESENT ON EVERY ROW THAT HAS ONE, AND DEMOTED.
       ⛔ IT IS A DISCLOSURE: demoted, never deleted. It repeats on nearly
       every row, and repeated identical text at full weight is pure noise —
       but absent it is a fact about who reads her things that the room
       stopped saying. */
    const withWho = jobs.filter(function (r) {
      return typeof r.who_reads === 'string' && r.who_reads !== '';
    }).length;
    const painted = m.rows.filter(function (r) { return r.who; }).length;
    if (painted !== withWho) {
      fail('[' + G + '] ' + painted + ' row(s) paint a .job-row-who tag but ' +
        withWho + ' served row(s) carry a who_reads value. ⛔ It is a ' +
        'DISCLOSURE — this round demotes it, and demoting is not deleting');
    }
    m.rows.forEach(function (r, i) {
      if (!r.who || !r.name) { return; }
      const axes = [];
      if (r.who.size < r.name.size) { axes.push('size'); }
      if (r.who.weight !== r.name.weight) { axes.push('weight'); }
      if (r.who.color !== r.name.color) { axes.push('colour'); }
      if (axes.length < 2) {
        fail('[' + G + '] row ' + (i + 1) + "'s who-reads tag (" + r.who.size +
          'px/' + r.who.weight + '/' + r.who.color + ') does not read ' +
          'quieter than its name (' + r.name.size + 'px/' + r.name.weight +
          '/' + r.name.color + ') — it differs on ' +
          (axes.length ? axes.join(' + ') : 'nothing'));
      }
      if (r.who.size < 11) {
        fail('[' + G + "] row " + (i + 1) + "'s who-reads tag renders at " +
          r.who.size + 'px. It is a disclosure she has to be able to READ; ' +
          'quiet is the instruction, invisible is not');
      }
    });

    /* (5) ⛔ THE PIXEL FACE, APP-WIDE, UNCHANGED. She declined the sans mix
       twice. Every part of a row speaks in the same family as the card. */
    const families = {};
    m.rows.forEach(function (r) {
      [r.name, r.words, r.who].forEach(function (b) {
        if (b) { families[b.family] = true; }
      });
    });
    const fam = Object.keys(families);
    if (fam.length !== 1) {
      fail('[' + G + '] the card renders ' + fam.length + ' font families in ' +
        'its rows (' + JSON.stringify(fam) + '). ⛔ The pixel typeface stays: ' +
        'hierarchy comes from size, weight, colour and spacing, never from a ' +
        'second face');
    } else if (fam[0].indexOf('Pixelify') === -1) {
      fail('[' + G + '] the rows render in ' + JSON.stringify(fam[0]) +
        ' — the shipped pixel face is Pixelify Sans and it does not move');
    }

    /* (6) ⛔⛔ NOT ONE CHARACTER OF HERS MOVED. Compared against what the
       server said in THIS session, by value. */
    jobs.forEach(function (row, i) {
      const shown = m.rows[i];
      if (!shown) { return; }
      const fields = [['name', String(row.name)],
        ['words', String(row.words)]];
      if (typeof row.who_reads === 'string' && row.who_reads !== '') {
        fields.push(['who_reads', row.who_reads]);
      }
      fields.forEach(function (p) {
        if (shown.text.indexOf(p[1]) === -1) {
          fail('[' + G + '] row ' + (i + 1) + " LOST HER WORDS: the served " +
            p[0] + ' ' + JSON.stringify(p[1]) + ' is not present, verbatim, ' +
            'in the rendered row ' + JSON.stringify(shown.text) + '. ⛔ ' +
            'This round changes PRESENTATION ONLY — order, grouping, size, ' +
            'weight, colour, spacing and element. Never the characters');
        }
      });
    });
    if (device !== '') {
      const tail = m.rows[m.rows.length - 1];
      if (!tail || tail.text.indexOf(device) === -1) {
        fail('[' + G + '] the hand-added on-device row LOST HER WORDS — ' +
          JSON.stringify(device) + ' is not in the last row ' +
          JSON.stringify(tail ? tail.text : null));
      }
    }
    /* ⛔ AND THE JOIN ITSELF IS GONE FROM WHAT SHE READS. The renderer's own
       ' — ' was never one of her sentences; it was the composition that made
       three facts read as one. */
    m.rows.forEach(function (r, i) {
      if (r.name && r.text.indexOf(' — ') !== -1 &&
          r.name.text.indexOf(' — ') === -1 &&
          (!r.words || r.words.text.indexOf(' — ') === -1)) {
        fail('[' + G + '] row ' + (i + 1) + ' still welds its fields ' +
          'together with " — " outside her own sentences: ' +
          JSON.stringify(r.text));
      }
    });

    /* (7) THE DISCLOSURE PARAGRAPH IS NOT ROW ZERO. It is a different kind
       of thing — her informed consent — and it must not read as the first
       item of the list underneath it. */
    if (!m.disclosure) {
      fail('[' + G + '] the card carries no paragraph outside the job list ' +
        'to compare against — her cloud disclosure opens this card');
    } else if (named.length) {
      const n0 = named[0].name;
      const sep = (named[0].box.top) - m.disclosure.bottom;
      if (sep < 14) {
        fail('[' + G + '] her disclosure paragraph sits ' + sep + 'px above ' +
          'the first job row — at that distance it reads as row zero, and ' +
          'it is a different kind of thing from a job');
      }
      if (m.disclosure.size === n0.size && m.disclosure.weight === n0.weight &&
          m.disclosure.color === n0.color) {
        fail('[' + G + '] her disclosure paragraph renders in exactly the ' +
          "job-name register (" + n0.size + 'px/' + n0.weight + '/' +
          n0.color + ') — it would read as the list\'s first heading');
      }
    }

    /* (8) A COMFORTABLE MEASURE. A 14px line running the full width of the
       card is a line the eye loses its place on, which is half of "hard to
       read and overwhelming".
       ⛔ MEASURED AGAINST THE ROW'S OWN COLUMN, NOT THE CARD'S OUTER WIDTH.
       The first draft of this check compared the description against
       `cardW - 40`; the card is 720px outside and 665px inside, so a
       description running the FULL column measured 665 against a bound of
       680 and the check could not fire in either direction. It was green
       over nothing — driven, caught, and re-derived from the thing it
       guards. It now fires when the running text fills its own column. */
    named.forEach(function (r, i) {
      if (r.words && r.words.w > r.box.w - 80) {
        fail('[' + G + '] row ' + (i + 1) + "'s description runs " +
          r.words.w + 'px wide in a ' + r.box.w + 'px column — running text ' +
          'needs a measure it can be read across, and this one has none');
      }
    });

    /* (9) ⛔ AND ALL OF IT AT HER NARROW WINDOW TOO. */
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(session,
      'document.fonts.ready.then(function(){return "ready";})');
    await sleep(900);
    const n = JSON.parse(await cdp.evaluate(session, ROWS));
    if (!n.present || n.rows.length !== expected) {
      fail('[' + G + '] at a 600px window the card paints ' +
        (n.present ? n.rows.length : 'no') + ' row(s) instead of ' + expected);
    } else {
      if (n.scrollW > n.clientW + 1) {
        fail('[' + G + '] the card scrolls sideways at 600px (scrollWidth ' +
          n.scrollW + ' vs clientWidth ' + n.clientW + ')');
      }
      n.rows.forEach(function (r, i) {
        if (r.name && r.words && !(r.name.bottom <= r.words.top + 1)) {
          fail('[' + G + '] at 600px row ' + (i + 1) + ' stops stacking its ' +
            'name above its description');
        }
        if (r.words && r.words.right > n.clientW + 1) {
          fail('[' + G + '] at 600px row ' + (i + 1) + "'s description runs " +
            'past the card edge (' + r.words.right + ' vs ' + n.clientW + ')');
        }
      });
    }

    if (violations.length === before) {
      const r0 = named[0];
      note('armG (real Chrome, computed style, at 1280 and 600): the card ' +
        'paints ' + m.rows.length + ' separate rows — name ' + r0.name.size +
        'px/' + r0.name.weight + ' in ' + r0.name.color + ', description ' +
        r0.words.size + 'px/' + r0.words.weight + ' in ' + r0.words.color +
        ', who-reads ' + (r0.who ? r0.who.size + 'px' : 'n/a') + ' — one ' +
        'typeface throughout, and every served name, sentence and ' +
        'who-reads value still present verbatim');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

(async function main() {
  const cloud = liftSentence('nothing here ever leaves this computer.',
    'it is her cloud disclosure and the first of the details the card now ' +
    'holds');
  const never = liftSentence('your never-show, retired,',
    'it is her never-show disclosure and the second of them');
  /* ⭐ 26.99955-10 (D-09-C), HER RULING: "Move it into the card". Lifted by
     anchor like her other two, so a scan for a sentence that has been edited
     out stops the run rather than passing on an absence of everything. */
  const billing = liftSentence('using your API key',
    'it is the billing line she ruled off the dashboard and into the card, ' +
    'and both halves of that ruling are searched for BY VALUE below');

  oneRendererArm(cloud, never);
  await dashboardArm(cloud, never, billing);
  await cardArm(cloud, billing);
  await unavailableArm(cloud, never);
  await hierarchyArm();
  await narrowArm();
  await readabilityArm();

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_librarian_card FAILED — ' + violations.length +
      ' violation(s), ' + notes.length + ' passed');
    process.exitCode = 1;
  } else {
    console.log('test_librarian_card OK — ' + notes.length + '/' +
      notes.length + ' checks (her three things on the dashboard, the ' +
      'details on a floating card behind her tile, and a page you can ' +
      'tell the pressable parts of)');
  }
})().catch(function (e) {
  console.error('test_librarian_card COULD NOT BE DRIVEN: ' +
    (e && e.message ? e.message : e));
  process.exitCode = 1;
});
