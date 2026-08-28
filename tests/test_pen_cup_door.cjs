#!/usr/bin/env node
'use strict';
/* =========================================================================
   test_pen_cup_door — 26.99955-08: THE ACTIVITY LOG'S ONE DOOR.

   HER RULINGS, 2026-08-26, verbatim (taken by option selection or her own
   typed words; every one of them is what this suite exists to hold):
     1. the activity log "should not be listed 100% on the manage your
        library dashboard"
     2. where it stays reachable: "Only in the room"
     3. the object and the spot: the pen cup, "On the desk, near the candle."
     4. its nature, typed by her after she was told a pen cup is also a
        design-mode catalogue item — so there would be two identical pen
        cups, one a door and one decor, indistinguishable by sight:
        "treat the pen cup as the same items like journal, album, the user
        can move them but cannot delete them through the design mode"

   WHY THIS SUITE IS NOT A GREP. The pen cup renders NO WORDS — the sprite
   is the whole affordance — so every claim in her rulings is a claim about
   a CONTROL: is it there, is it reachable, does the page actually arrive on
   screen at a size a person could read, does a second tap put it away, does
   it move, does it refuse to be deleted. A source assertion structurally
   cannot see any of that. Arms B and C therefore drive a real Chrome over
   the real app and read real geometry off the page.

   ⛔ ARM A IS THE `4617dd5` CLASS, PINNED AT BIRTH THIS TIME. The card box
   — the door shipped hours before this one — took its accessible name from
   a Manage pane row. She ruled that row retires, and `managePaneLabel`
   answers the EMPTY STRING for a key it no longer holds, so the removal
   would have left a wordless door with NO SPOKEN NAME AT ALL, silently,
   with nothing red. The activity log is making that same journey off Manage
   in the very next commit, so its door's name is sourced from
   `CALL_RECORD_HEAD` — her own heading, on the page itself, the one source
   that survives the removal — and that sourcing is pinned here BEFORE the
   removal lands, together with the blank it must never be.

   THE ANTI-VACUITY ANSWERS.
    (1) CAN IT PASS BEFORE THE WORK? No — every arm was run against the tree
        with the door absent and each failed by name (recorded in
        26.99955-08-SUMMARY.md).
    (2) CAN IT PASS AFTER A DELIBERATE BREAK? No — each arm was driven RED
        on a planted mutation and each failed on its own assertion, naming
        it: the door's name reverted to `managePaneLabel('memory')`;
        `CALL_RECORD_HEAD` blanked; the toggle made one-way; the ✕ unwired;
        `pen-cup` put back into `CATALOG`; `pen-cup` taken out of
        `FUNCTIONAL_IDS`. Every plant was reverted, never committed.
    (3) WOULD A DEGENERATE IMPLEMENTATION PASS? No — the name is asserted
        NON-EMPTY first and SEPARATELY, because an agreement between two
        empty strings is a green gate over a nameless door; and the raised
        card is measured at NON-ZERO size both ways (offset* and
        getBoundingClientRect) before its text is ever read, so a
        present-but-hidden card fails by name rather than passing as markup.
    (4) EVALUATION OR SOURCE ORDER? Arms B and C are EVALUATION — every
        value comes off a live page. Arm A is source, and it is
        COMMENT-STRIPPED, so prose quoting the banned call cannot satisfy
        the pin that must refuse it (the prose-satisfied pin this phase
        already retired once).

   ⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY. tests/lib/app-server.cjs builds a
   synthetic library under os.tmpdir() and serves that; library.local.json is
   never read, and neither is ~/StudyRoom. ⛔ FULLY OFFLINE: the only sockets
   are 127.0.0.1 (the harness server and Chrome's own DevTools pipe).
   ⛔ THE ONE STUB IS THE DATA AND ONLY THE DATA: `window.fetch` is wrapped
   so `/api/librarian/record` answers one planted call. The door, the
   renderer, the layout and the geometry are all real — a stub of the
   renderer would be the harness agreeing with itself.
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));

const APP = 'app.js';
const HTML = 'index.html';
const violations = [];
const notes = [];
function fail(msg) { violations.push(msg); }
function note(msg) { notes.push(msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, HTML), 'utf8');
/* comment-stripped, so a comment quoting a banned call cannot satisfy a pin
   that exists to refuse it */
const appCode = appSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
  .join('\n');
const htmlCode = htmlSrc.replace(/<!--[\s\S]*?-->/g, '');

/* ---- the narrowed lift --------------------------------------------------
   A derivation is only as honest as its lift. This THROWS on a short read
   rather than returning something a comparison would pass over. */
function liftHeading() {
  const m = appSrc.match(/var CALL_RECORD_HEAD = '((?:[^'\\]|\\.)*)'/);
  if (!m) {
    throw new Error('LIFT_SHORT: var CALL_RECORD_HEAD was not found in ' +
      APP + ' — it is the activity log page\'s own heading, it is HER ' +
      'sentence, and it is the pen cup\'s one naming source. A comparison ' +
      'against nothing passes, so this stops the run instead.');
  }
  return m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/* The same discipline for the other two of HER sentences these arms search
   for. ⛔ A sentence that cannot be lifted STOPS THE RUN: an absence pin
   searching for a string that no longer exists anywhere is the emptiest
   green there is. */
function liftConst(name) {
  const m = appSrc.match(
    new RegExp('var ' + name + " = '((?:[^'\\\\]|\\\\.)*)'"));
  if (!m) {
    throw new Error('LIFT_SHORT: var ' + name + ' was not found in ' + APP +
      ' — it is one of HER sentences and these arms search for it by ' +
      'value. A search for nothing finds nothing and passes.');
  }
  if (!m[1].length) {
    throw new Error('LIFT_SHORT: var ' + name + ' is EMPTY in ' + APP +
      ' — every text scan below would then look for the empty string, ' +
      'which is present in every page ever rendered.');
  }
  return m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/* ==== ARM A — the door's name has ONE source, and it is her heading ==== */
function nameArm() {
  const G = 'pencup-name';
  const raw = appSrc.match(/var CALL_RECORD_HEAD = '((?:[^'\\]|\\.)*)'/);
  if (!raw) {
    fail('[' + G + '] ' + APP + ': CALL_RECORD_HEAD not found — the ' +
      'activity log\'s heading is the pen cup\'s one naming source and a ' +
      'comparison against nothing passes');
    return;
  }
  /* ⚠ NON-EMPTY FIRST AND SEPARATELY. Every check below is an AGREEMENT,
     and two empty strings agree perfectly — that is a green gate over a
     door that announces nothing, which is exactly the defect `4617dd5`
     caught on the card box. */
  if (!raw[1].length) {
    fail('[' + G + '] ' + APP + ': CALL_RECORD_HEAD is EMPTY — the pen cup ' +
      'shows no words at all, so an empty name is a door that announces ' +
      'nothing to anyone who cannot see the sprite');
  }
  /* the ROOM door (index.html button, named in app.js at wiring time) */
  if (!/pencupBtn\.setAttribute\('aria-label',\s*CALL_RECORD_HEAD\)/
    .test(appCode)) {
    fail('[' + G + '] ' + APP + ': the room-view pen cup no longer takes ' +
      'its accessible name from CALL_RECORD_HEAD. ⛔ It must NOT be read ' +
      'from the Manage pane roster: her ruling takes the activity log OFF ' +
      'Manage, and managePaneLabel returns "" for a key it does not hold — ' +
      'which would blank this door\'s only name with no gate going red ' +
      '(the card box\'s own near-miss, 4617dd5)');
  }
  /* the DESK-ZOOM door (the station fixture) */
  if (!/pencup\.setAttribute\('aria-label',\s*CALL_RECORD_HEAD\)/
    .test(appCode)) {
    fail('[' + G + '] ' + APP + ': the desk-station pen cup no longer ' +
      'takes its accessible name from CALL_RECORD_HEAD — both windows show ' +
      'this door (her 26.9995-06 two-windows ruling) and both must name it ' +
      'from the one source');
  }
  /* ⛔ THE ABSENCE THAT KEEPS THE SOURCE SINGLE. A literal in the markup
     would be a SECOND copy, free to drift the day her sentence is edited —
     and a drifted door says one thing while the page it opens says another. */
  const tag = htmlCode.match(/<button[^>]*id="room-obj-pen-cup"[^>]*>/);
  if (!tag) {
    fail('[' + G + '] ' + HTML + ': #room-obj-pen-cup is missing from the ' +
      'markup — the activity log has no door in the room at all, which is ' +
      'the one place her ruling leaves it reachable');
  } else if (/aria-label\s*=/.test(tag[0])) {
    fail('[' + G + '] ' + HTML + ': #room-obj-pen-cup carries a literal ' +
      'aria-label. ⛔ The name is assigned in ' + APP + ' from ' +
      'CALL_RECORD_HEAD so a wordless door has exactly ONE naming source; ' +
      'a literal here is a second copy that can drift away from her ' +
      'sentence with nothing going red. Found: ' + tag[0]);
  }
  /* ⛔ AND THE BANNED SOURCE, NAMED. This is the assertion that would have
     caught the card box's defect before it shipped. */
  if (/pencup(Btn)?\.setAttribute\('aria-label',\s*managePaneLabel/
    .test(appCode)) {
    fail('[' + G + '] ' + APP + ': a pen cup door reads its name from ' +
      'managePaneLabel. ⛔ BANNED: that function answers the EMPTY STRING ' +
      'for a retired key, and the activity log is being retired from Manage ' +
      'in the very next commit — this is the exact shape of 4617dd5');
  }
  if (violations.length === 0) {
    note('armA: the pen cup\'s spoken name has ONE source — her own ' +
      'CALL_RECORD_HEAD — in both windows, with no literal in the markup ' +
      'to drift from it and no read of the retiring Manage row');
  }
}

/* ==== ARM A2 — her nature ruling, in the rosters that enforce it ==== */
function natureArm() {
  const G = 'pencup-nature';
  const before = violations.length;
  const cat = appCode.match(/var CATALOG = \{[\s\S]*?\n  \};/);
  if (!cat) {
    fail('[' + G + '] ' + APP + ': var CATALOG not found — whether a second ' +
      'pen cup can be placed cannot be read, and a check against nothing ' +
      'passes');
  } else if (/'pen-cup':\s*\{\s*name:/.test(cat[0])) {
    fail('[' + G + '] ' + APP + ': CATALOG still holds a pen-cup entry. ' +
      'Her ruling makes it a FIXTURE ("the user can move them but cannot ' +
      'delete them through the design mode"); an entry beside the fixture ' +
      'puts TWO identical pen cups in the room, one a door and one decor, ' +
      'indistinguishable by sight and colliding on one id in ' +
      "addCatalogItem's restore path ($('room-obj-' + entryId))");
  }
  [['ROOM_OBJECT_IDS', 'it would not MOVE in design mode — attachDesignDrag ' +
    'is bound from this roster and nowhere else, and "the user can move ' +
    'them" is half her sentence'],
  ['FUNCTIONAL_IDS', 'it could be DELETED — removeAccessory returns early ' +
    'for this roster and nothing else protects it, and deleting it deletes ' +
    'the only door her ruling leaves the activity log']]
    .forEach(function (row) {
      const m = appCode.match(
        new RegExp('var ' + row[0] + ' = \\[([^\\]]*)\\]'));
      if (!m) {
        fail('[' + G + '] ' + APP + ': ' + row[0] + ' not found — the pen ' +
          'cup\'s nature cannot be read');
        return;
      }
      if (m[1].indexOf("'pen-cup'") === -1) {
        fail('[' + G + '] ' + APP + ': ' + row[0] + " does not hold " +
          "'pen-cup' — " + row[1]);
      }
    });
  /* ⛔⛔ THE THIRD ROSTER, AND IT IS PINNED BECAUSE DRIVING M5 SHOWED THE
     LIVE ARM COULD NOT SEE IT. "Cannot delete" is protected TWICE, by two
     different rosters, and they fail in different places:
       · SHIPPED_DECOR_IDS decides whether a delete HANDLE is injected at
         all — this is what the live arm below actually measures when it
         finds no ✕ on the pen cup;
       · FUNCTIONAL_IDS decides whether `removeAccessory` REFUSES once a
         handle is somehow pressed — the deeper refusal.
     Taking the pen cup out of FUNCTIONAL_IDS alone was driven as a mutant:
     the source arm went red and THE LIVE ARM STAYED GREEN, because no
     handle appears either way. A suite that pinned only the visible half
     would have called that build fine. Both halves are held here. */
  const decor = appCode.match(/var SHIPPED_DECOR_IDS = \[([^\]]*)\]/);
  if (!decor) {
    fail('[' + G + '] ' + APP + ': SHIPPED_DECOR_IDS not found — whether ' +
      'the pen cup is given a delete handle cannot be read');
  } else if (decor[1].indexOf("'pen-cup'") !== -1) {
    fail('[' + G + '] ' + APP + ": SHIPPED_DECOR_IDS holds 'pen-cup' — " +
      'that roster is what injects the one delete affordance, so the door ' +
      'to the activity log would wear a ✕ she can press. Her ruling is ' +
      '"cannot delete them through the design mode"');
  }
  if (violations.length === before) {
    note('armA2: one id, one nature — the pen cup moves (ROOM_OBJECT_IDS), ' +
      'never deletes (FUNCTIONAL_IDS), and has no catalogue twin');
  }
}

/* ==== the live harness ==== */

/* ⛔⛔ WAIT FOR THE CONTROL, NEVER SLEEP AND HOPE. Every card here is
   painted behind TWO async posts (`/api/librarian/record` and
   `/api/librarian/jobs`), so a fixed sleep is a race — and this suite lost
   it once, aborting the whole run with "COULD NOT BE DRIVEN: not clickable
   /  not present: .call-record-clear" on a tree that was perfectly correct.
   ⚠ A FLAKY GATE IS WORSE THAN NO GATE: it teaches whoever meets it to
   re-run until green, which is exactly how a real red gets waved through.
   So the wait is a POLL with a ceiling, and a control that never arrives
   fails on a STATED BUDGET rather than on one look.
   ⚠⚠ 26.99955-10 CORRECTS THIS PARAGRAPH'S OWN CLAIM. It used to end "fails
   BY NAME through the normal violation path instead of throwing" — and
   `click` has always thrown, which aborts the whole suite through main's
   catch and prints ONE line with no arm named. The claim is replaced by what
   the code does, and the throw now carries the ceiling and the selector so
   the report says which control, in which suite, waited how long. */
async function waitFor(session, sel, ms) {
  const deadline = Date.now() + (ms || 8000);
  for (;;) {
    const there = await cdp.evaluate(session,
      '(function(){var n=document.querySelector(' + JSON.stringify(sel) +
      ');if(!n)return false;var r=n.getBoundingClientRect();' +
      'return r.width>0&&r.height>0;})()');
    if (there) { return true; }
    if (Date.now() > deadline) { return false; }
    await sleep(200);
  }
}

async function click(session, sel) {
  /* ⛔ EVERY click WAITS FIRST — the one change that de-flakes this whole
     suite. Each card is painted behind two async posts, so a control is
     routinely absent for a few hundred milliseconds after the tap that
     summons it; a bare querySelector here made the run a coin toss. The
     ceiling is real, so a control that genuinely never appears still fails
     — just after the ceiling of asking rather than after one look.
     ⚠ 26.99955-10: THE CEILING WAS 8000ms, AND THAT WAS BELOW THE MEASURED
     WORST CASE. A driven page's loads were measured held for 9.5-11.7s (see
     RENDER_CEILING_MS below for the measurement and what it is), so an 8s
     ceiling could expire while the room was behaving perfectly. */
  await waitFor(session, sel, RENDER_CEILING_MS);
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;n.scrollIntoView({block:"center"});' +
    'var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box) {
    throw new Error('not clickable / not present after ' +
      RENDER_CEILING_MS + 'ms of asking: ' + sel);
  }
  const p = JSON.parse(box);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
}

/* ⛔ THE DATA, AND ONLY THE DATA. `renderCallRecord` paints ABSENCE over an
   empty record — correct behaviour, and useless for measuring whether her
   heading reaches the screen. One planted call is wrapped around the real
   `fetch`; every other route, and the whole of the render path, stays real. */
const PLANT = '(function(){' +
  'if(window.__penStub){return "already";}' +
  'window.__penStub=true;window.__origFetch=window.fetch;window.__hit=0;' +
  /* ⛔ MATCH THE PATH, NOT A QUERY STRING. The record is read with
     `apiPost`, not `apiGet`, so the URL carries NO `?t=` cache-buster — a
     first draft of this stub keyed on "/api/librarian/record?" and matched
     NOTHING, sat inert, and the arm passed on whatever the harness server
     happened to hold. A stub that never fires is a fixture that is not
     there, and `window.__hit` below is what makes that impossible to miss. */
  'window.fetch=function(u,o){' +
  'var p=String(u).split("?")[0];' +
  'if(/\\/api\\/librarian\\/record$/.test(p)){window.__hit++;' +
  'return Promise.resolve({ok:true,status:200,json:function(){' +
  'return Promise.resolve({calls:[{at:1755302400000,job:"reflection",' +
  'provider:"anthropic",model:"claude-opus-5",input_tokens:10,' +
  'output_tokens:20}]});}});}' +
  'return window.__origFetch.call(window,u,o);};return "ok";})()';

/* measured BOTH ways — a present-but-hidden card fails by name here rather
   than passing as markup (the 26.99955-02 lesson) */
const CARD_PROBE = '(function(){' +
  'var c=document.getElementById("desk-activity-card");' +
  'var d=document.getElementById("room-obj-pen-cup");' +
  'var z=document.getElementById("desk-pencup");' +
  'var r=c?c.getBoundingClientRect():null;' +
  'return JSON.stringify({' +
  'present:!!c,' +
  'offW:c?c.offsetWidth:0,offH:c?c.offsetHeight:0,' +
  'rectW:r?r.width:0,rectH:r?r.height:0,' +
  'text:c?(c.textContent||"").replace(/\\s+/g," ").trim():"",' +
  'closes:c?c.querySelectorAll(".desk-activity-close").length:0,' +
  'roomName:d?(d.getAttribute("aria-label")||""):null,' +
  'zoomName:z?(z.getAttribute("aria-label")||""):null,' +
  'zoomW:z?z.getBoundingClientRect().width:0,' +
  'zoomH:z?z.getBoundingClientRect().height:0,' +
  /* is the OBJECT itself what a tap at its own centre would land on?
     `contains` rather than identity, because the tap legitimately lands on
     the sprite <img> inside the button */
  'zoomReachable:(function(){if(!z)return false;' +
  'var r=z.getBoundingClientRect();if(!r.width||!r.height)return false;' +
  'var t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);' +
  'return !!t&&z.contains(t);})()});})()';

async function liveArm(head) {
  const G = 'pencup-live';
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const planted = await cdp.evaluate(session, PLANT);
    if (!planted || String(planted).indexOf('ok') === -1) {
      fail('[' + G + '] the record stub did not install (' + planted +
        ') — every measurement below would then be of an absent page ' +
        'rather than of her heading, so this stops rather than reporting');
      return;
    }

    /* ---- beat 1: her tap on the pen cup, in the ROOM ---- */
    await click(session, '#room-obj-pen-cup');
    await sleep(1600);
    const open = JSON.parse(await cdp.evaluate(session, CARD_PROBE));
    /* ⛔ THE FIXTURE MUST HAVE BEEN USED. This caught a real inert stub:
       keyed on a query string the record read does not carry, it matched
       nothing and the arm quietly measured the harness server's own data
       instead of the planted call. */
    const hits = await cdp.evaluate(session, 'window.__hit');
    if (!hits) {
      fail('[' + G + '] the record stub never fired (' + hits + ' hits) — ' +
        'everything below was measured against whatever the harness ' +
        'server happened to hold, not against the planted call, so this ' +
        'arm proves nothing it claims to');
    }

    if (!open.present) {
      fail('[' + G + '] beat 1: tapping the pen cup in the room did NOT ' +
        'raise the activity log. Her ruling leaves this door as the ONLY ' +
        'way to the log ("Only in the room"), so a tap that opens nothing ' +
        'is the surface reachable from NOWHERE');
    } else {
      /* ⛔ SIZE BEFORE TEXT, BOTH WAYS. A card in the DOM at zero size is
         not a card she can read, and `textContent` cannot tell the two
         apart. */
      if (!(open.offW > 0 && open.offH > 0 &&
        open.rectW > 0 && open.rectH > 0)) {
        fail('[' + G + '] beat 1: the activity log card is in the DOM but ' +
          'renders at zero size (offset ' + open.offW + 'x' + open.offH +
          ', rect ' + open.rectW + 'x' + open.rectH + ') — present-but-' +
          'invisible is the same loss to her as absent');
      } else if (open.text.indexOf(head) === -1) {
        fail('[' + G + '] beat 1: the raised card does not carry her ' +
          'heading. Expected to find ' + JSON.stringify(head) + ' — the ' +
          'card reads ' + JSON.stringify(open.text.slice(0, 160)) + '. The ' +
          'door opened something, but not the activity log');
      }
      if (open.closes !== 1) {
        fail('[' + G + '] beat 1: the card carries ' + open.closes +
          ' ✕ controls — pinned at exactly 1. She asked for one by name on ' +
          'the card box\'s card ("need to inclde the exit button for this ' +
          'card") and this card is that card\'s idiom');
      }
    }
    /* the spoken name, live off the page — not off the source */
    if (open.roomName === null) {
      fail('[' + G + '] beat 1: #room-obj-pen-cup is absent from the live ' +
        'page — the door does not exist where her ruling put it');
    } else if (!open.roomName.length) {
      fail('[' + G + '] beat 1: the room pen cup\'s accessible name is ' +
        'EMPTY on the live page. It renders no words, so this name is the ' +
        'only thing that says what it is — a blank one is a nameless door ' +
        '(4617dd5)');
    } else if (open.roomName !== head) {
      fail('[' + G + '] beat 1: the room pen cup is named ' +
        JSON.stringify(open.roomName) + ' but the page it opens is headed ' +
        JSON.stringify(head) + '. The door and the page must say ONE ' +
        'thing, from ONE source');
    }
    if (open.zoomName === null) {
      fail('[' + G + '] beat 1: #desk-pencup is absent from the desk zoom — ' +
        'her 26.9995-06 ruling is that the two windows agree about what is ' +
        'on the desk ("when the user zoomed in the desk the item they saw ' +
        'from the zoom in window should be the same they saw from the ' +
        'entire room window")');
    } else {
      if (!open.zoomName.length || open.zoomName !== head) {
        fail('[' + G + '] beat 1: the desk-zoom pen cup is named ' +
          JSON.stringify(open.zoomName) + ' — expected her heading ' +
          JSON.stringify(head));
      }
      if (!(open.zoomW > 0 && open.zoomH > 0)) {
        fail('[' + G + '] beat 1: the desk-zoom pen cup renders at zero ' +
          'size (' + open.zoomW + 'x' + open.zoomH + ') — the sprite IS ' +
          'the affordance, so a zero-size one is no door at all');
      }
    }

    /* ---- beat 2: putting it away ----------------------------------------
       ⚠⚠ A MEASURED FINDING LIVES HERE, AND IT IS NOT PAPERED OVER. The
       shipped grammar is "a second tap on the object puts the page away".
       Driven at 1280x900, THE RAISED CARD COVERS THE PEN CUP COMPLETELY —
       card (320,106)-(960,738) over pen cup (868,354)-(952,486), with
       `elementFromPoint` at the pen cup's own centre returning the card's
       body. So while the page is up, a tap CANNOT land on the object that
       would put it away. ⛔ This is NOT introduced here: the card box ships
       the identical card at the identical coordinates, and it is very
       probably why she asked for the ✕ by name on it ("need to inclde the
       exit button for this card"). Filed in deferred-items.md; the card's
       geometry is hers to rule on, not an executor's to quietly change.

       So this beat pins THE INVARIANT THAT ACTUALLY PROTECTS HER — there is
       always at least one REACHABLE way out — and drives the second tap for
       real whenever the object is reachable, rather than asserting a tap
       that provably cannot land. */
    if (open.present && open.zoomReachable) {
      await click(session, '#desk-pencup');
      await sleep(1000);
      const shut = JSON.parse(await cdp.evaluate(session, CARD_PROBE));
      if (shut.present) {
        fail('[' + G + '] beat 2: the pen cup was reachable under the ' +
          'raised card, and a second tap on it did NOT put the activity ' +
          'log away. The toggle is the card box\'s shipped grammar and it ' +
          'is half of what makes the object a door rather than a one-way ' +
          'trip');
      } else {
        note('armB beat 2: the object was reachable and a second tap on it ' +
          'put the page away — the shipped toggle grammar, driven');
      }
    } else if (open.present) {
      note('armB beat 2: ⚠ the raised card COVERS the pen cup, so the ' +
        '"second tap on the object" route cannot be tapped while the page ' +
        'is up (measured, not assumed: elementFromPoint at the object\'s ' +
        'own centre lands on the card). The card box has this identically. ' +
        'The ✕ below is therefore the ONLY reachable way out, and beat 3 ' +
        'drives it — which is exactly why it is asserted rather than ' +
        'trusted. Filed for her in deferred-items.md');
      /* ⛔ AND THE INVARIANT, HELD HARD: if the object cannot be tapped,
         a working ✕ is not a nicety, it is the whole exit. */
      if (open.closes !== 1) {
        fail('[' + G + '] beat 2: the pen cup is covered by the page it ' +
          'raised AND the card carries ' + open.closes + ' ✕ controls — ' +
          'that is a page with NO reachable way out at all, which traps ' +
          'her on it');
      }
      /* put it away through the one reachable route so beat 3 starts clean */
      await click(session, '#desk-activity-card .desk-activity-close');
      await sleep(1000);
      const shut = JSON.parse(await cdp.evaluate(session, CARD_PROBE));
      if (shut.present) {
        fail('[' + G + '] beat 2: the ✕ did not close the card, and the ' +
          'object underneath it cannot be tapped — she is trapped on the ' +
          'page with no way back to the desk');
      }
    }

    /* ---- beat 3: re-open, and her ✕ closes it ---- */
    await click(session, '#desk-pencup');
    await sleep(1200);
    const again = JSON.parse(await cdp.evaluate(session, CARD_PROBE));
    if (!again.present) {
      fail('[' + G + '] beat 3: the pen cup would not re-open the log after ' +
        'it had been put away once — the door works exactly one time, ' +
        'which is a door that broke');
    } else {
      await click(session, '#desk-activity-card .desk-activity-close');
      await sleep(1000);
      const closed = JSON.parse(await cdp.evaluate(session, CARD_PROBE));
      if (closed.present) {
        fail('[' + G + '] beat 3: the card\'s own ✕ did not close it. She ' +
          'asked for that control by name on this card\'s idiom ("need to ' +
          'inclde the exit button for this card"), so an unwired ✕ is a ' +
          'control that lies about what it does');
      }
    }
    if (violations.length === 0) {
      /* ⛔ THIS NOTE SAYS ONLY WHAT WAS DRIVEN. It used to claim "a second
         tap puts it away" unconditionally; beat 2 measures whether that
         route is reachable at all and says so in its own note, so this one
         must not restate it as a fact. A green line that overstates what
         ran is how a suite starts lying quietly. */
      note('armB (real Chrome): her tap on the pen cup raises the activity ' +
        'log over the desk at non-zero size carrying her own heading; it ' +
        're-opens after being put away; its ✕ closes it; and both ' +
        'windows\' doors are named from her heading, read live off the page');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM C — her nature ruling, DRIVEN in design mode ==== */
const DESIGN_PROBE = '(function(){' +
  'var p=document.getElementById("room-obj-pen-cup");' +
  'var d=document.getElementById("room-obj-plant");' +
  'return JSON.stringify({' +
  'designOn:document.body.className.indexOf("design")!==-1,' +
  'penHandles:p?p.querySelectorAll(".room-added-x").length:-1,' +
  'decorHandles:d?d.querySelectorAll(".room-added-x").length:-1,' +
  'penX:p?p.style.getPropertyValue("--x"):null,' +
  'penY:p?p.style.getPropertyValue("--y"):null,' +
  /* ⛔ a drag aimed at a covered object proves NOTHING — the press lands on
     whatever is on top and the object never moves, which is
     indistinguishable from a fixture that refuses to move */
  'penReachable:(function(){if(!p)return false;' +
  'var r=p.getBoundingClientRect();if(!r.width||!r.height)return false;' +
  'var t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);' +
  'return !!t&&p.contains(t);})(),' +
  'catPen:document.querySelectorAll(' +
  '".cat-card[data-entry=\\"pen-cup\\"]").length,' +
  'catCards:document.querySelectorAll(".cat-card").length});})()';

async function designArm() {
  const G = 'pencup-design';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    /* ⚠ 1600, NOT 1280, AND THE REASON IS MEASURED. At 1280 the design-mode
       catalogue dock overlays the right edge of the room and covers the pen
       cup — `elementFromPoint` at its centre returns a `cat-card`. ⛔ That
       is PRE-EXISTING and NOT about this door: at 1280 the dock covers the
       shipped `#room-obj-plant` too, a decor piece that has been draggable
       since 24.1. Filed in deferred-items.md rather than fixed here. This
       arm is about her ruling on the pen cup's NATURE, so it measures at a
       width where the object is actually reachable — and asserts that
       reachability below rather than assuming it. */
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await click(session, '#room-toolbar-arrange');
    await sleep(1200);
    const st = JSON.parse(await cdp.evaluate(session, DESIGN_PROBE));
    /* ⛔ THE MODE IS ASSERTED BEFORE ANYTHING IN IT IS MEASURED. Every check
       below is about what design mode offers; a run that never entered it
       would find no handles anywhere and print a clean pass. */
    if (!st.designOn) {
      fail('[' + G + '] design mode never came on, so nothing below was ' +
        'measured in the mode her ruling is about — this stops rather ' +
        'than reporting a clean pass over a mode that was never entered');
      return;
    }
    if (st.penHandles === -1) {
      fail('[' + G + '] #room-obj-pen-cup is absent in design mode');
      return;
    }
    /* "cannot delete them through the design mode" — measured as the
       ABSENCE of the one delete affordance, BESIDE a shipped decor piece
       that has one. ⛔ The contrast is the point: an absence measured alone
       would also pass on a build where the handles stopped being injected
       at all, and then everything would be undeletable for the wrong
       reason and nobody would know. */
    if (st.decorHandles !== 1) {
      fail('[' + G + '] the control this arm measures by contrast is ' +
        'missing: #room-obj-plant carries ' + st.decorHandles + ' delete ' +
        'handles in design mode, expected 1. Without a piece that CAN be ' +
        'deleted, the pen cup having no handle proves nothing');
    } else if (st.penHandles !== 0) {
      fail('[' + G + '] the pen cup carries ' + st.penHandles + ' delete ' +
        'handle(s) in design mode. ⛔ HER RULING, verbatim: "the user can ' +
        'move them but cannot delete them through the design mode" — and ' +
        'deleting this one deletes the only door to the activity log');
    }
    if (st.catPen !== 0) {
      fail('[' + G + '] the design-mode catalogue still offers a pen cup ' +
        '(' + st.catPen + ' card(s)) — she could place a SECOND one, ' +
        'identical to the door by sight, which is the twin her ruling ' +
        'dissolved');
    }
    if (st.catCards === 0) {
      fail('[' + G + '] the catalogue rendered NO cards at all, so the ' +
        'pen-cup absence above was measured over an empty dock and proves ' +
        'nothing (the narrowed-lift discipline, applied to a live probe)');
    }

    /* "the user can move them" — a REAL drag, and the position is read
       back off the element afterwards. */
    if (!st.penReachable) {
      fail('[' + G + '] the pen cup is COVERED at its own centre in design ' +
        'mode, so a drag aimed at it would land on whatever is on top and ' +
        'the object would not move — indistinguishable from a fixture that ' +
        'refuses to move. ⛔ This arm refuses to report either way over a ' +
        'press that cannot reach its target');
      return;
    }
    const at = await cdp.evaluate(session,
      '(function(){var n=document.getElementById("room-obj-pen-cup");' +
      'var r=n.getBoundingClientRect();' +
      'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
    const p0 = JSON.parse(at);
    /* ⚠ `buttons: 1` ON EVERY MOVE. Without the pressed-button bitmask
       Chrome delivers a hover, the drag never arms, and the object sits
       still — a false RED that reads exactly like a broken fixture. */
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: p0.x, y: p0.y, button: 'left',
        clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 8; i++) {
      await cdp.send(session, 'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: p0.x - i * 12, y: p0.y - i * 6,
          button: 'left', buttons: 1 });
      await sleep(50);
    }
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: p0.x - 96, y: p0.y - 48, button: 'left',
        clickCount: 1, buttons: 0 });
    await sleep(1500);
    const after = JSON.parse(await cdp.evaluate(session, DESIGN_PROBE));
    if (after.penX === st.penX && after.penY === st.penY) {
      fail('[' + G + '] the pen cup did NOT move under a real drag in ' +
        'design mode — it stayed at --x ' + st.penX + ' / --y ' + st.penY +
        '. ⛔ HER RULING, verbatim: "the user can move them but cannot ' +
        'delete them through the design mode"');
    }
    /* ⛔⛔ AND THE MOVE MUST HAVE BEEN ACCEPTED BY THE SERVER, WHICH IS A
       DIFFERENT FACT FROM THE SPRITE HAVING SLID. `postLayout` only
       `console.warn`s on a refusal: the piece looks moved for the rest of
       the visit and is back where it started on the next open. A server
       that does not carry the id in LAYOUT_OBJECTS refuses the whole
       document ("objects may name only the room's own things"), and that
       reaches her as a fixture that silently will not stay put — a real
       UAT finding on the card box hours before this door was built. This
       is why the server row lands in the SAME COMMIT as the client rosters.
       ⚠ AND WHY HER OWN ROOM MUST BE RESTARTED before the pen cup will
       move: her running server predates the row. */
    const stored = JSON.parse(await cdp.evaluate(session,
      '(function(){return fetch("/api/layout").then(function(r){' +
      'return r.json();}).then(function(j){return JSON.stringify({' +
      'ok:!!(j&&j.ok),' +
      'pen:(j&&j.layout&&j.layout.objects)?j.layout.objects["pen-cup"]:null' +
      '});});})()'));
    if (!stored.pen) {
      fail('[' + G + '] the pen cup moved on screen but the server did NOT ' +
        'store its position (/api/layout carries no "pen-cup" entry). ⛔ ' +
        'THE MOVE IS A LIE THAT LASTS ONE VISIT: postLayout only warns to ' +
        'the console on a refusal, so the piece looks moved now and is ' +
        'back at its default the next time she opens the room. Check ' +
        'server.py LAYOUT_OBJECTS holds "pen-cup" — a posted document ' +
        'naming an id the server does not know is refused whole');
    } else {
      note('armC: the drag ROUND-TRIPPED — the server stored pen-cup at ' +
        'x ' + stored.pen.x + ' / y ' + stored.pen.y + ', so its ' +
        'LAYOUT_OBJECTS row is real and the move survives the visit');
    }
    if (violations.length === before) {
      note('armC (real Chrome): in design mode the pen cup MOVES under a ' +
        'real drag, carries NO delete handle where a decor piece carries ' +
        'one, and the catalogue offers no twin — her 2026-08-26 sentence, ' +
        'driven rather than asserted');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM D — the log is GONE from Manage, by BOTH routes ================
   HER RULING, 2026-08-26: the activity log "should not be listed 100% on
   the manage your library dashboard", and it stays reachable "Only in the
   room" — which she was explicit means NOT in the ☰ sections list either.

   ⛔ AN ABSENCE PIN, AND THEY ARE THE EASIEST KIND TO WRITE VACUOUSLY. Two
   things could make this pass over nothing: a Manage screen that never
   painted, and a search for a sentence that no longer exists anywhere. So
   the sentence is LIFTED from app.js (if her heading were deleted this
   would find nothing and prove nothing — which is why the lift throws on a
   short read), and the Manage page is asserted PRESENT and populated
   BEFORE its text is scanned for her words. */
async function manageAbsenceArm(head, clearWord) {
  const G = 'pencup-manage-gone';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');

    const SCAN = '(function(){' +
      'var s=document.getElementById("screen-manage")||' +
      ' document.getElementById("manage");' +
      'var lit=document.getElementById("manage-landing");' +
      'var lb=document.getElementById("manage-sec-librarian-settings");' +
      'return JSON.stringify({' +
      'painted:!!s,' +
      'landingH:lit?lit.getBoundingClientRect().height:0,' +
      'chars:s?(s.textContent||"").length:0,' +
      /* ⛔⛔ THE LIBRARIAN PANE'S OWN BOX, MEASURED SEPARATELY. This arm is
         an absence pin over the pane the activity log used to live IN, and
         that box is filled by an ASYNC status read. A first draft scanned
         the Manage screen 1.8s after entering and found 6,314 characters —
         the landing page before the librarian box had painted at all — and
         it PASSED with the log deliberately restored. The populated screen
         is 16,645 characters. An absence measured before the thing that
         would contain it has rendered is not an absence, so this is polled
         to a real value and FAILS if it never arrives.

         ⭐⭐ 26.99955-09 — THE THRESHOLD MOVED WITH THE PANE, AND THE ARC IS
         STATED RATHER THAN THE GATE DELETED. Her ruling of 2026-08-26 took
         the librarian's DETAILS off this dashboard and onto a floating card
         ("the entire details of the librarain can be placed in another
         window instad of taking too much place in this dashboard"), leaving
         only the switch, the model line and the picker. The box that used
         to hold 2,373 characters now holds 303 — so a 500-character floor
         became permanently unmeetable, and lowering it alone would have
         weakened the very check that closed the hole.

         ⛔ SO IT IS RE-POINTED AT STRUCTURE INSTEAD OF LENGTH. `libHeads`
         counts the box's own h3, which is written in the SAME single
         innerHTML assignment as every other byte of the pane — so it is
         present exactly when the async status read has landed and the box
         has painted, and it cannot be satisfied by a box that is merely
         present-and-empty. The character floor is kept as a second,
         weaker check at a value the shipped pane clears with room
         (303 against 100). A count that can only ever go down is a worse
         gate than a fact that is either there or not. */
      'libChars:lb?(lb.textContent||"").length:0,' +
      'libHeads:lb?lb.querySelectorAll("h3").length:0,' +
      'text:s?(s.textContent||"").replace(/\\s+/g," "):"",' +
      'hosts:document.querySelectorAll(".librarian-call-record").length});})()';

    let m = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      m = JSON.parse(await cdp.evaluate(session, SCAN));
      if (m.painted && m.libHeads > 0 && m.libChars > 100) { break; }
    }
    /* ⛔ POPULATED FIRST. A Manage screen that never painted contains her
       sentence exactly as reliably as one that correctly dropped it. */
    if (!m || !m.painted || m.chars < 200) {
      fail('[' + G + '] the Manage screen did not paint (present=' +
        (m && m.painted) + ', ' + (m && m.chars) + ' characters) — every ' +
        'absence below would then be an absence of everything, which ' +
        'proves nothing');
      return;
    }
    if (m.libHeads === 0 || m.libChars <= 100) {
      fail('[' + G + '] the Manage librarian pane never painted its ' +
        'settings box (' + m.libHeads + ' heading(s), ' + m.libChars +
        ' characters after 10s) — that box is where the activity log used ' +
        'to live, so an absence measured without it is an absence of the ' +
        'whole pane and proves nothing. ⛔ THIS EXACT HOLE let a restored ' +
        'log pass once: the scan ran before the async status read had ' +
        'filled the box');
      return;
    }
    if (m.landingH <= 0) {
      fail('[' + G + '] the Manage landing page rendered at zero height, ' +
        'so the scan below ran over a page nobody could read');
    }
    if (m.hosts !== 0) {
      fail('[' + G + '] Manage still carries ' + m.hosts +
        ' .librarian-call-record host(s). ⛔ The slot and its painter leave ' +
        'TOGETHER: a host left behind is somewhere the log can be painted ' +
        'back without a decision');
    }
    if (m.text.indexOf(head) !== -1) {
      fail('[' + G + '] her activity-log heading is STILL on the Manage ' +
        'landing route — ' + JSON.stringify(head) + '. Her ruling is that ' +
        'it "should not be listed 100% on the manage your library ' +
        'dashboard"');
    }
    if (m.text.indexOf(clearWord) !== -1) {
      fail('[' + G + '] her clear control (' + JSON.stringify(clearWord) +
        ') is still on the Manage landing route — the log left, so its ' +
        'control cannot have stayed behind');
    }

    /* ---- the SECOND route: the ☰ sections list, opened live ---- */
    await click(session, '#manage-sections-toggle');
    await sleep(1000);
    const ov = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var o=document.getElementById("manage-sections-overlay");' +
      'var p=document.getElementById("manage-sections-panel");' +
      'var pr=p?p.getBoundingClientRect():null;' +
      'return JSON.stringify({hidden:o?o.hidden:null,' +
      'w:pr?pr.width:0,h:pr?pr.height:0,' +
      'rows:document.querySelectorAll(' +
      '"#manage-sections-overlay .manage-rail-item").length,' +
      'text:o?(o.textContent||"").replace(/\\s+/g," "):""});})()'));
    /* ⛔ THE OVERLAY IS ASSERTED OPEN AND POPULATED BEFORE ITS TEXT IS
       SEARCHED — the narrowed-lift discipline applied to an absence. */
    if (ov.hidden !== false || !(ov.w > 0 && ov.h > 0) || ov.rows < 2) {
      fail('[' + G + '] the ☰ sections overlay never opened at non-zero ' +
        'size with rows (hidden=' + ov.hidden + ', panel ' + ov.w + 'x' +
        ov.h + ', ' + ov.rows + ' rows) — an absence measured inside a ' +
        'closed overlay is an absence of everything');
    } else if (ov.text.indexOf(head) !== -1) {
      fail('[' + G + '] her activity-log heading is in the ☰ sections ' +
        'list. ⛔ She was asked where it stays reachable and answered ' +
        '"Only in the room" — NOT on Manage, and NOT in the sections list ' +
        'either');
    }
    if (violations.length === before) {
      note('armD (real Chrome): the activity log is GONE from Manage by ' +
        'BOTH routes — her heading and her control appear nowhere on a ' +
        'populated page (' + m.chars + ' characters scanned, of which the ' +
        'librarian pane itself is ' + m.libChars + '), the host element is ' +
        'gone, and the ☰ list (' + ov.rows + ' rows, opened live) does not ' +
        'name it either');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM E — her clear, and how long the room remembers it ==============
   HER RULING (26.99-16, chosen at a checkpoint from two options with no
   recommendation), verbatim: "Remember while the panel is open".

   ⛔ THE PANEL MOVED, SO THIS ARM MOVED WITH IT. Four facts used to be held
   by lifted-and-run cases over `refreshLibrarianSettings` in
   tests/test_spend_record.py. That function no longer paints the log —
   26.99955-08 took it off Manage — so those cases were retired there and
   their SUBJECT is held here instead, driven in a real browser over the
   real card rather than over a lifted function and a fake host. The four:
     (1) a clear survives the card being put away and raised again;
     (2) a raise with NO clear renders ABSENCE — the fact is "she cleared
         it", ⛔ never "the list is empty";
     (3) a REFUSED delete is not remembered as a clear, and its sentence
         belongs to the press, not to the surface;
     (4) leaving the desk forgets — that is what "while" means.

   ⛔ THE STUB IS STATEFUL ON PURPOSE: the record answers one call until the
   delete route is asked, and answers empty afterwards. A stub that kept
   answering one call could never show absence, and one that always answered
   empty could never show the clear standing over it. */
const CLEAR_STUB = '(function(){' +
  'if(window.__penStub2){return "already";}' +
  'window.__penStub2=true;window.__deleted=false;' +
  'window.__origFetch2=window.fetch;window.__hit=0;window.__jobsDone=0;' +
  /* ⛔ PATH-EXACT, and the delete tested FIRST — "/api/librarian/record" is
     a PREFIX of "/api/librarian/record/delete", so a loose match would
     answer the deletion with a list of calls and this arm would measure
     nothing it claims to. */
  'window.fetch=function(u,o){var p=String(u).split("?")[0];' +
  /* ⛔⛔ 26.99955-10 (D-09-B), AND IT IS A COUNTER RATHER THAN A STUB. The
     labels read passes through to the REAL server untouched — same request,
     same answer, same bytes — and only its COMPLETION is recorded. That is
     what makes `settled` below a fact rather than a hope: `renderCallRecord`
     paints inside `Promise.all([record, jobs])`, so the paint cannot have
     happened until this counter has moved, and it must happen once it has.
     ⛔ Never widen this into an answer of its own: the job NAMES this arm
     renders come from the room, and a harness that supplied them would be
     agreeing with itself about the surface it is measuring. */
  'if(/\\/api\\/librarian\\/jobs$/.test(p)){' +
  'return window.__origFetch2.call(window,u,o).then(function(r){' +
  'window.__jobsDone++;return r;});}' +
  'if(/\\/api\\/librarian\\/record\\/delete$/.test(p)){' +
  'if(window.__refuse){return Promise.resolve({ok:false,status:500,' +
  'json:function(){return Promise.resolve({error:"no"});}});}' +
  'window.__deleted=true;' +
  'return Promise.resolve({ok:true,status:200,json:function(){' +
  'return Promise.resolve({ok:true});}});}' +
  'if(/\\/api\\/librarian\\/record$/.test(p)){window.__hit++;' +
  'var calls=window.__deleted?[]:[{at:1755302400000,job:"reflection",' +
  'provider:"anthropic",model:"claude-opus-5",input_tokens:10,' +
  'output_tokens:20}];' +
  'return Promise.resolve({ok:true,status:200,json:function(){' +
  'return Promise.resolve({calls:calls});}});}' +
  'return window.__origFetch2.call(window,u,o);};return "ok";})()';

const TEXT = '(function(){var c=document.getElementById(' +
  '"desk-activity-card");return JSON.stringify({present:!!c,' +
  'text:c?(c.textContent||"").replace(/\\s+/g," ").trim():""});})()';

/* ==== 26.99955-10 (D-09-B): WHY THIS ARM WAS A COIN TOSS, AND WHAT IT WAS ==

   ⛔⛔ THE CAUSE IS THE ESCAPE KEY, AND IT IS THE INSTRUMENT'S, NOT THE ROOM'S.
   Diagnosed before one byte was changed. Driven under instrumentation on
   2026-08-26 this arm failed 5 runs out of 5, always at the same beat: the
   card sat on screen carrying nothing but its ✕ while FOUR of the page's own
   `fetch` calls stayed UNSENT — `/api/librarian/jobs` among them, which is
   half of what `renderCallRecord` waits on before it paints anything.

   The four measurements that name the culprit, each taken at the stall:
     · the harness server answered the SAME route from node in 1-3ms;
     · `netstat` showed the port holding a LISTEN, ~50 TIME_WAITs, and NOT ONE
       connection from Chrome — so the requests never left the browser;
     · a FRESH request issued from the page 20 seconds later hung too, so it
       was not four wedged requests, it was the whole origin;
     · `Page.bringToFront` released every one of them in the same instant,
       after they had been pending 31 seconds.
   And the discriminating experiment: leaving the desk with a SYNTHETIC
   Escape instead of a driven one — everything else identical — went 6 runs
   for 6 clean, and so did leaving it by the shipped back control.

   ⛔ SO: `Input.dispatchKeyEvent` with Escape is a TRUSTED press, and Escape
   is the browser's own STOP command. The driven Escape this arm used to leave
   the desk stopped the page's loading, and the renderer then held every
   subsequent load to that origin — for 9.5s, 10.6s, 11.4s, 11.7s, and in two
   runs for longer than half a minute. The room, the desk, the record path and
   the server were innocent throughout, which is exactly why 26.99955-09 could
   measure the same failure rate on a commit whose diff never touched them.

   ⚠ THIS IS THIS PROJECT'S OWN RECORDED CLASS, ONE LAYER OUT: 26.95-45 (UAT
   F-11) measured a driven Chrome that never fires `transitionend` because the
   page is not being drawn, and app.js carries that fix and its reasoning. The
   same fact reaches this suite through the network stack instead of the
   compositor.

   ⛔ THE FIX IS THE SHIPPED DOOR, NOT A SLEEP AND NOT A RETRY. `leaveTheDesk`
   presses `#station-back` — the back control index.html already ships, wired
   to the same `popView` the Escape reached — with the same trusted mouse
   press every other beat of this suite uses. It is strictly MORE faithful to
   what she does than a keystroke the browser also acts on, and it removes the
   browser's Stop command from the harness entirely.

   ⛔ AND THE FIXED SLEEPS GO WITH IT, because they were the second half. Every
   read below now waits for a FACT it can observe:
     · `settled` — the render cycle this raise started has COMPLETED, proven
       by both of `renderCallRecord`'s reads having answered. That is what
       lets an ABSENCE be asserted honestly: an absence read off a surface
       that has not painted yet is an absence of everything.
     · `waitForText` — her sentence is actually on the card.
     · `waitGone` / `waitLeftDesk` — the previous card is really gone, and
       the desk visit is really over, rather than "800ms have passed".
   Each is a POLL WITH A CEILING that fails BY NAME when the ceiling passes,
   so a defect that removes her line still turns this arm red — it just does
   so after a stated budget instead of on a coin toss.

   ⛔ THE CEILING IS 20s BECAUSE THAT IS `tests/lib/cdp.cjs`'s OWN PINNED
   per-evaluate budget — no wait here can outlive the driver it rides on. It
   is not a tolerance widened to make anything pass: with the Escape gone
   every wait below completes in milliseconds, and the ceiling exists only so
   that a control which genuinely never arrives fails on a stated budget
   rather than hanging the sweep. */
const RENDER_CEILING_MS = 20000;

const CYCLE = '(function(){return JSON.stringify({hit:window.__hit,' +
  'jobs:window.__jobsDone});})()';

async function renderCycle(session) {
  return JSON.parse(await cdp.evaluate(session, CYCLE));
}

/* Both counters must move: the record read is the stub's, the labels read is
   the real server's, and `renderCallRecord` paints only when BOTH have
   answered. Returns true on a completed cycle; records a NAMED violation and
   returns false when the ceiling passes. */
/* ⛔ LIFTED AT MODULE SCOPE, so a build that has LOST her question stops the
   whole run at load with LIFT_SHORT rather than failing one arm halfway
   through — the same discipline `liftConst`'s own comment states. */
const confirmWord = liftConst('CALL_RECORD_CONFIRM');

/* ⭐⭐ 26.99955 UAT G-…-10 — HER ASK, DRIVEN RATHER THAN STEPPED PAST.
   Two presses now: the control opens a question, and the affirmative under
   that question performs the clear.

   ⛔ IT REPORTS THE ASK'S OWN ABSENCE AS A FAILURE rather than falling
   through to the old one-press path. A helper that quietly clicked whatever
   was there would keep every arm below it green on a build where her ask had
   been removed — and her ask is the ticket. So the sentence must be on
   screen and the affirmative must be pressable, or this arm says so and
   stops.

   ⚠ The words are LIFTED, never retyped: the question is
   `CALL_RECORD_CONFIRM` out of app.js. This suite does not own a copy of a
   sentence of hers. */
async function answerTheClearAsk(session, G, what) {
  await click(session, '#desk-activity-card .call-record-clear');
  const asked = await waitForText(session, confirmWord);
  if (!asked.present || asked.text.indexOf(confirmWord) === -1) {
    fail('[' + G + '] ' + what + ': the first press did not raise her ' +
      'question. ⛔ 26.99955 UAT G-…-10 — the clear asks once before it ' +
      'destroys the one file that answers "has my privacy been kept" with ' +
      'evidence. Expected ' + JSON.stringify(confirmWord) + '; the card ' +
      'reads ' + JSON.stringify((asked.text || '').slice(0, 200)));
    return false;
  }
  try {
    await click(session, '#desk-activity-card .call-record-clear-confirm');
  } catch (e) {
    fail('[' + G + '] ' + what + ': her question appeared with no way to ' +
      'answer yes — the affirmative was not pressable (' + e.message + ')');
    return false;
  }
  return true;
}

async function settled(session, before, G, what) {
  const deadline = Date.now() + RENDER_CEILING_MS;
  for (;;) {
    const now = await renderCycle(session);
    if (now.hit > before.hit && now.jobs > before.jobs) { return true; }
    if (Date.now() > deadline) {
      fail('[' + G + '] ' + what + ' never completed its render within ' +
        RENDER_CEILING_MS + 'ms (record reads ' + before.hit + '->' +
        now.hit + ', labels reads ' + before.jobs + '->' + now.jobs +
        '). ⛔ Nothing below this point may be measured: a fact read off a ' +
        'surface that has not painted is a fact about the harness');
      return false;
    }
    await sleep(100);
  }
}

async function waitForText(session, needle, ms) {
  const deadline = Date.now() + (ms || RENDER_CEILING_MS);
  for (;;) {
    const t = JSON.parse(await cdp.evaluate(session, TEXT));
    if (t.present && t.text.indexOf(needle) !== -1) { return t; }
    if (Date.now() > deadline) { return t; }
    await sleep(100);
  }
}

async function waitGone(session, sel, ms) {
  const deadline = Date.now() + (ms || RENDER_CEILING_MS);
  for (;;) {
    const there = await cdp.evaluate(session,
      '(function(){return !!document.querySelector(' + JSON.stringify(sel) +
      ');})()');
    if (!there) { return true; }
    if (Date.now() > deadline) { return false; }
    await sleep(100);
  }
}

/* ⛔ THE ONE WAY OUT OF THE DESK IN THIS SUITE, and it is a MOUSE PRESS on
   the shipped back control rather than a driven Escape. See the block above
   for the measurement: a trusted Escape is the browser's Stop command and it
   wedged the page's loads for tens of seconds. `#station-back` is wired to
   the same `popView` Escape reached, so the beat being measured — she leaves
   the desk — is unchanged; only the key that also talks to Chrome is gone. */
async function leaveTheDesk(session, G) {
  await click(session, '#station-back');
  if (!await waitLeftDesk(session)) {
    fail('[' + G + '] the back control never took her off the desk (the ' +
      'station layer still holds the floor after ' + RENDER_CEILING_MS +
      'ms), so nothing below would have been a NEW desk visit at all');
    return false;
  }
  return true;
}

/* The desk visit is over when the station layer has given up the floor —
   the app's own signal for it, read rather than waited out. */
async function waitLeftDesk(session, ms) {
  const deadline = Date.now() + (ms || RENDER_CEILING_MS);
  for (;;) {
    const open = await cdp.evaluate(session,
      '(function(){return document.body.classList.contains("station-open");' +
      '})()');
    if (!open) { return true; }
    if (Date.now() > deadline) { return false; }
    await sleep(100);
  }
}

async function clearArm(head, clearWord, refusalWord) {
  const G = 'pencup-clear';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const ok = await cdp.evaluate(session, CLEAR_STUB);
    if (!ok || String(ok).indexOf('ok') === -1) {
      fail('[' + G + '] the record stub did not install (' + ok + ')');
      return;
    }

    /* ---- fact 2 FIRST: a raise with no clear renders absence ---- */
    await cdp.evaluate(session, 'window.__deleted=true;');
    let mark = await renderCycle(session);
    await click(session, '#room-obj-pen-cup');
    if (!await settled(session, mark, G, 'the first raise, from the room')) {
      return;
    }
    const virgin = JSON.parse(await cdp.evaluate(session, TEXT));
    const hits = await cdp.evaluate(session, 'window.__hit');
    if (!hits) {
      fail('[' + G + '] the record stub never fired (' + hits + ' hits), so ' +
        'every fact below was measured against the harness server\'s own ' +
        'record instead of the planted one — an inert fixture is a fixture ' +
        'that is not there');
      return;
    }
    if (virgin.present && virgin.text.indexOf(head) !== -1) {
      fail('[' + G + '] fact 2: a card that was NEVER cleared announced an ' +
        'empty state she never asked for. ⛔ Her ruling is about the EVENT ' +
        'of having cleared, never about emptiness in general — a first ' +
        'raise over an empty record must render absence');
    }
    /* back to a populated record for the clear itself */
    await cdp.evaluate(session, 'window.__deleted=false;');
    await click(session, '#desk-activity-card .desk-activity-close');
    await waitGone(session, '#desk-activity-card');

    /* ---- fact 1: clear, put away, raise again — her line stands ---- */
    mark = await renderCycle(session);
    await click(session, '#desk-pencup');
    if (!await settled(session, mark, G, 'the raise before the clear')) {
      return;
    }
    const loaded = await waitForText(session, head);
    if (!loaded.present || loaded.text.indexOf(head) === -1) {
      fail('[' + G + '] the card did not come up carrying her heading ' +
        'before the clear was pressed, so nothing below was measured ' +
        'against a real starting state');
      return;
    }
    mark = await renderCycle(session);
    /* ⭐⭐ 26.99955 UAT G-…-10: THE FIRST PRESS NO LONGER CLEARS ANYTHING.
       Her ruling of 2026-08-26 put an ask in front of this control — the
       one control in the room that destroys the room's own evidence, and
       the only thing in the room that asks twice. So the drive gains a
       second press, and ⛔ the second press is asserted to be REACHABLE
       rather than assumed: `answerTheClearAsk` fails the arm if the ask
       did not appear or its affirmative was not there to press, which is
       the difference between driving her new behaviour and driving past
       it. */
    if (!await answerTheClearAsk(session, G, 'her clear')) { return; }
    if (!await settled(session, mark, G, 'the re-read her clear asks for')) {
      return;
    }
    const cleared = await waitForText(session, clearWord);
    if (cleared.text.indexOf(head) === -1 ||
      cleared.text.indexOf(clearWord) === -1) {
      fail('[' + G + '] the clear itself did not leave her line and her ' +
        'control standing — that is the defect she reported, on the new ' +
        'surface. The card reads ' +
        JSON.stringify(cleared.text.slice(0, 160)));
    }
    await click(session, '#desk-activity-card .desk-activity-close');
    await waitGone(session, '#desk-activity-card');
    mark = await renderCycle(session);
    await click(session, '#desk-pencup');
    if (!await settled(session, mark, G, 'the raise after the clear')) {
      return;
    }
    const reraised = await waitForText(session, head);
    if (reraised.text.indexOf(head) === -1) {
      fail('[' + G + '] fact 1: her line VANISHED when the card was put ' +
        'away and raised again in the same desk visit. ⛔ HER RULING: ' +
        '"Remember while the panel is open" — the panel is the desk now, ' +
        'and a clear that survives exactly one paint is the defect she ' +
        'reported against Manage, reproduced on the surface it moved to');
    }

    /* ---- fact 4: leaving the desk forgets ---- */
    if (!await leaveTheDesk(session, G)) { return; }
    mark = await renderCycle(session);
    await click(session, '#room-obj-pen-cup');
    if (!await settled(session, mark, G, 'the raise on the second visit')) {
      return;
    }
    const revisit = JSON.parse(await cdp.evaluate(session, TEXT));
    if (revisit.text.indexOf(head) !== -1) {
      fail('[' + G + '] fact 4: the clear was still remembered after she ' +
        'left the desk and came back. ⛔ Nothing about a clear is ' +
        'persisted, and "while the panel is open" has to end somewhere — ' +
        'the desk visit is that somewhere');
    }

    /* ---- fact 3: a refused delete is not a clear, and is not carried ---- */
    await cdp.evaluate(session,
      'window.__deleted=false;window.__refuse=true;');
    await click(session, '#desk-activity-card .desk-activity-close');
    await waitGone(session, '#desk-activity-card');
    mark = await renderCycle(session);
    await click(session, '#desk-pencup');
    if (!await settled(session, mark, G, 'the raise before the refused ' +
      'delete')) {
      return;
    }
    mark = await renderCycle(session);
    /* the ask stands in front of the refused delete too — same two
       presses, and the refusal is what the SECOND one meets */
    if (!await answerTheClearAsk(session, G, 'the refused delete')) {
      return;
    }
    if (!await settled(session, mark, G, 'the repaint a refused delete ' +
      'asks for')) {
      return;
    }
    const refused = await waitForText(session, refusalWord);
    if (refused.text.indexOf(refusalWord) === -1) {
      fail('[' + G + '] fact 3: a delete the room could NOT perform said ' +
        'nothing at all (G-26.99-7). Expected her sentence ' +
        JSON.stringify(refusalWord) + '; the card reads ' +
        JSON.stringify(refused.text.slice(0, 200)));
    }
    await click(session, '#desk-activity-card .desk-activity-close');
    await waitGone(session, '#desk-activity-card');
    mark = await renderCycle(session);
    await click(session, '#desk-pencup');
    if (!await settled(session, mark, G, 'the raise after the refusal')) {
      return;
    }
    const afterRefusal = JSON.parse(await cdp.evaluate(session, TEXT));
    if (afterRefusal.text.indexOf(refusalWord) !== -1) {
      fail('[' + G + '] fact 3: her refusal sentence was CARRIED into the ' +
        'next raise. ⛔ It belongs to the PRESS, not to the surface — a ' +
        'room that repeats "your computer refused" every time she opens ' +
        'the log is a room repeating itself about a moment that has passed');
    }
    if (violations.length === before) {
      note('armE (real Chrome): her clear stands on the card, SURVIVES the ' +
        'card being put away and raised again in the same desk visit, is ' +
        'forgotten when she leaves the desk, is never announced on a card ' +
        'she did not clear, and a REFUSED delete says so in her words ' +
        'without being remembered as a clear — her 26.99-16 ruling, ' +
        'carried onto the surface it moved to');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM F — the raised card dies with the desk it was raised over ====== */
async function lingerArm() {
  const G = 'pencup-linger';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await click(session, '#room-obj-pen-cup');
    await sleep(1500);
    const up = JSON.parse(await cdp.evaluate(session, TEXT));
    if (!up.present) {
      fail('[' + G + '] the card never came up, so nothing below was ' +
        'measured');
      return;
    }
    /* ⛔ 26.99955-10: THE SAME DRIVEN ESCAPE STOOD HERE, and it is the same
       hazard — see RENDER_CEILING_MS's block. This arm never happened to lose
       on it, which is worse rather than better: an instrument that carries a
       known wedge and has not tripped on it yet is one edit away from being
       the next flaky gate. It leaves the desk by the shipped back control. */
    if (!await leaveTheDesk(session, G)) { return; }
    await click(session, '#room-obj-notebook');
    await sleep(1600);
    const over = JSON.parse(await cdp.evaluate(session,
      '(function(){var c=document.getElementById("desk-activity-card");' +
      'var o=document.getElementById("station-overlay");' +
      'var shown=!!c&&!!o&&!o.hidden&&' +
      ' getComputedStyle(o).display!=="none";' +
      'return JSON.stringify({shown:shown,' +
      'station:document.body.className});})()'));
    /* ⛔ MEASURED BEFORE IT WAS FIXED, AND THAT IS WHY THIS ARM EXISTS. The
       raised activity log was left ON SCREEN over the blessings-notebook
       station while the card box beside it was correctly torn down — the
       note-slot defect renderStation's sibling branch already existed to
       stop, reintroduced by adding a second raised card and not wiring it
       in. Nothing in the repo caught it. */
    if (over.shown) {
      fail('[' + G + '] the raised activity log is STILL ON SCREEN over a ' +
        'sibling station (body: ' + over.station + '). ⛔ A card raised ' +
        'over the desk must die when another station paints — it is the ' +
        'desk\'s card, and a page floating over the notebook is the ' +
        'note-slot defect renderStation already guards the card box against');
    } else {
      note('armF (real Chrome): the raised activity log is torn down when a ' +
        'sibling station paints — driven by raising it, leaving to the ' +
        'room, and opening the notebook. It lingered before this was wired');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM G — 26.99955-12: THE LOG'S ROWS UN-JOIN, AND HER CLEAR MOVES ====

   HER RULING, 2026-08-26, verbatim:

     "can you also improve the readability on the activity log too? And also
      the clear log need to placed on the top of the activity log?"

   and, asked where exactly the control should go given that it currently
   sits at the END of her heading sentence, underlined, reading like part of
   the sentence rather than a button, she selected:

     "Top right, across from the heading"

   ⭐⭐ AND THE "ACROSS FROM" HALF WAS SUPERSEDED BY HER ON 2026-08-27 —
   BY HER OWN LATER WORDING RULING, NOT BY AN AGENT. 26.99955 UAT G-…-10
   extended the control's label, and the extension does not fit beside her
   sentence on this card: measured in real Chrome, her sentence needs
   381px, the control 403px, the gap 16, the content box 582. She was shown
   both ways out drawn out — squeeze her sentence into a three-line column
   to keep them level, or let the control drop to its own line — and chose
   **let it drop below**.
   ⛔ WHAT SURVIVED BOTH RULINGS, and what check (6) now holds: it is hard
   right, and it is ABOVE EVERY ROW IT CAN CLEAR, which is her typed
   sentence above. ⛔ Do not restore the level line by narrowing her words:
   that arm was measured, drawn, and refused.

   ⛔ THE SAME FLATTENING BUG 26.99955-11 FIXED ON THE SIBLING CARD.
   `callRecordLine` joined FOUR separate fields with ' — ' — the date, the
   job's room-word, the provider and model, and the two token counts — and
   `renderCallRecord` then painted every row identically: one <p>, one
   <span>, the same quiet style, 6px apart. ⛔ THAT EM DASH IS THE
   RENDERER'S COMPOSITION AND NEVER ONE OF HER SENTENCES.

   ⛔ WHICH FIELD LEADS, AND WHY IT IS THE JOB NAME. Two candidates, and the
   choice is deliberate rather than aesthetic:
     · this surface exists to answer "has my privacy been kept", so what she
       is scanning for is WHAT RAN. The date is the axis the list is ordered
       on, and order already carries it — a date does not need weight to be
       an axis, it needs a column;
     · she has already ruled on this exact slot. 26.99-13 (G-3): the log
       printed the machine's own job key and she named it "the exact thing
       her room-words exist to prevent". The row's identifying fact is the
       job's room-word, from her;
     · and 26.99955-11's sibling card leads with the name. Two cards in one
       system read as one system;
     · a long date string repeats across consecutive rows, and repeated text
       at full weight is the same noise the who-reads tag was demoted for.
   So: NAME leads (up in size, weight and colour), DATE is the right-hand
   axis column, and the machine's own detail — who answered, what it cost —
   is demoted to a quiet second line.

   THE ANTI-VACUITY ANSWERS, for this arm specifically.
    (1) CAN IT PASS BEFORE THE WORK? No. Driven against the shipped flat
        shape it fails at (1): there is no `.call-row` element at all,
        because the four fields were joined into one string before the
        renderer saw them. The "before" numbers it printed are in
        26.99955-12-SUMMARY.md.
    (2) COULD IT PASS OVER NOTHING? No. The expected row count comes from
        the calls this arm planted, and the planted calls' JOB KEYS come
        from the live `/api/librarian/jobs` route in the same session — so
        an empty list, or a list of the wrong length, stops the arm before
        a single "no violation found" below it can be reached.
    (3) DOES IT AGREE WITH ITSELF? The job NAMES are never written here:
        they are read off the room's own route and asserted to be present,
        verbatim, in the row that carries them. Same for the date, which is
        compared against the browser's own rendering of the planted
        timestamp rather than against a format this file keeps a copy of.
    (4) EVALUATION, NOT SOURCE. Every number below is a computed style or a
        bounding rect read off a live page in real Chrome. A source-text
        assertion cannot see readability.

   ⛔ AND IT DRIVES 600px TOO, because the heading sentence and the control
   now share a line and a narrow window is where they would collide. */

function rowStub(jobKeys) {
  return '(function(jobs){' +
    'if(window.__penStub3){return "already";}' +
    'window.__penStub3=true;window.__origFetch3=window.fetch;' +
    'window.__hit=0;window.__jobsDone=0;' +
    /* ⛔ THE JOB KEYS ARE THE ROOM'S OWN, passed in from the live route.
       Everything else about a planted call is machine detail — a timestamp,
       a provider, a model, two counts — and it is varied per row on purpose
       so a renderer that painted one row and repeated it could not pass. */
    'window.__calls=jobs.map(function(j,i){return {' +
    'at:1755302400000+i*86400000,job:j,' +
    'provider:["anthropic","openai","anthropic"][i%3],' +
    'model:["claude-opus-5","gpt-5","claude-haiku-5"][i%3],' +
    'input_tokens:1000+i,output_tokens:2000+i};});' +
    'window.fetch=function(u,o){var p=String(u).split("?")[0];' +
    /* the labels read passes through to the REAL server untouched and only
       its COMPLETION is counted — `settled` is then a fact about the render
       cycle rather than a hope, exactly as arm E's counter is */
    'if(/\\/api\\/librarian\\/jobs$/.test(p)){' +
    'return window.__origFetch3.call(window,u,o).then(function(r){' +
    'window.__jobsDone++;return r;});}' +
    'if(/\\/api\\/librarian\\/record$/.test(p)){window.__hit++;' +
    'return Promise.resolve({ok:true,status:200,json:function(){' +
    'return Promise.resolve({calls:window.__calls});}});}' +
    'return window.__origFetch3.call(window,u,o);};return "ok";})(' +
    JSON.stringify(jobKeys) + ')';
}

/* what the ROOM said, and what the BROWSER makes of the planted timestamps —
   never a copy of either kept in this file */
const EXPECT = '(function(){return JSON.stringify(window.__calls.map(' +
  'function(c){return {job:c.job,' +
  'when:new Date(c.at).toLocaleDateString(undefined,' +
  '{year:"numeric",month:"long",day:"numeric"}),' +
  'provider:c.provider,model:c.model,' +
  'tin:String(c.input_tokens)+" tokens in",' +
  'tout:String(c.output_tokens)+" tokens out"};}));})()';

const JOBS_ROUTE = 'fetch("/api/librarian/jobs",{method:"POST",' +
  'headers:{"Content-Type":"application/json"},body:"{}"})' +
  '.then(function(r){return r.json();})' +
  '.then(function(j){return JSON.stringify(j);})';

const LOG = '(function(){' +
  'var c=document.getElementById("desk-activity-card");' +
  'if(!c)return JSON.stringify({present:false});' +
  'function m(n){if(!n)return null;var s=getComputedStyle(n);' +
  ' var r=n.getBoundingClientRect();' +
  ' return {size:Math.round((parseFloat(s.fontSize)||0)*10)/10,' +
  '  weight:String(s.fontWeight),color:s.color,family:s.fontFamily,' +
  '  deco:String(s.textDecorationLine||s.textDecoration||""),' +
  '  bg:s.backgroundColor,shadow:s.boxShadow,' +
  '  bw:Math.round((parseFloat(s.borderTopWidth)||0)*10)/10,' +
  '  bs:s.borderTopStyle,bc:s.borderTopColor,' +
  '  padL:Math.round(parseFloat(s.paddingLeft)||0),' +
  '  top:Math.round(r.top),bottom:Math.round(r.bottom),' +
  '  left:Math.round(r.left),right:Math.round(r.right),' +
  '  cy:Math.round(r.top+r.height/2),' +
  '  w:Math.round(r.width),h:Math.round(r.height),' +
  '  text:(n.textContent||"").replace(/\\s+/g," ").trim()};}' +
  /* ⛔ THE HEADING'S FIRST LINE, NOT ITS BLOCK. Her sentence is 57
     characters of pixel face and it WRAPS inside this card — measured, two
     lines at 604px — so the block's own centre sits between its two lines
     and comparing a control against it would report "not on the heading's
     line" for a control sitting exactly where she asked. A Range over the
     text node gives the real first line box. */
  'function line1(n){if(!n)return null;var g=document.createRange();' +
  ' g.selectNodeContents(n);var rs=g.getClientRects();' +
  ' if(!rs.length)return null;var r=rs[0];' +
  ' return {top:Math.round(r.top),bottom:Math.round(r.bottom),' +
  '  left:Math.round(r.left),right:Math.round(r.right),' +
  '  cy:Math.round(r.top+r.height/2)};}' +
  'var headP=c.querySelector(".call-record-head");' +
  'var headT=c.querySelector(".call-record-head-text");' +
  'var btn=c.querySelector(".call-record-clear");' +
  'var list=c.querySelector(".call-record-list");' +
  'var kids=list?[].slice.call(list.children):[];' +
  'var rows=kids.map(function(el){return {box:m(el),' +
  ' name:m(el.querySelector(".call-row-name")),' +
  ' when:m(el.querySelector(".call-row-when")),' +
  ' who:m(el.querySelector(".call-row-who")),' +
  ' count:m(el.querySelector(".call-row-cost")),' +
  ' text:(el.textContent||"").replace(/\\s+/g," ").trim()};});' +
  /* the SHIPPED FLAT SHAPE, measured too — this is what makes the red run
     report her "before" rather than only the absence of the new classes */
  'var flat=[].slice.call(c.querySelectorAll("p")).map(m);' +
  'return JSON.stringify({present:true,listPresent:!!list,' +
  ' headP:m(headP),headT:m(headT),head1:line1(headT),btn:m(btn),' +
  ' rows:rows,flat:flat,' +
  ' cardText:(c.textContent||"").replace(/\\s+/g," ").trim(),' +
  ' cardRight:Math.round(c.getBoundingClientRect().right),' +
  ' scrollW:c.scrollWidth,clientW:c.clientWidth});})()';

async function readabilityArm(head, clearWord) {
  const G = 'pencup-readable';
  const before = violations.length;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);

    /* ---- the room's own words FIRST, so nothing below is this file's ---- */
    const served = JSON.parse(await cdp.evaluate(session, JOBS_ROUTE));
    const jobs = ((served && served.jobs) || []).filter(function (r) {
      return r && typeof r.job === 'string' && r.job !== '' &&
        typeof r.name === 'string' && r.name !== '';
    });
    if (jobs.length < 3) {
      fail('[' + G + '] /api/librarian/jobs served ' + jobs.length +
        ' usable row(s) in this session — this arm needs several rows to ' +
        'measure separation between them, so every check below would be a ' +
        'measurement of nothing');
      return;
    }
    const keys = jobs.slice(0, 4).map(function (r) { return r.job; });
    const nameOf = {};
    jobs.forEach(function (r) { nameOf[r.job] = r.name; });

    const planted = await cdp.evaluate(session, rowStub(keys));
    if (!planted || String(planted).indexOf('ok') === -1) {
      fail('[' + G + '] the record stub did not install (' + planted + ')');
      return;
    }
    const expect = JSON.parse(await cdp.evaluate(session, EXPECT));

    const mark = await renderCycle(session);
    await click(session, '#room-obj-pen-cup');
    if (!await settled(session, mark, G, 'the raise from the room')) { return; }
    await waitForText(session, head);
    /* ⛔ SETTLE ON THE FONT, NOT ON A SLEEP — 26.99955-11's measured hazard.
       A leading field asking for weight 700 is a woff2 that only starts
       loading when this card first paints; every name box measured before it
       lands is measured in the regular face, and the row then reflows. */
    await cdp.evaluate(session,
      'document.fonts.ready.then(function(){return "ready";})');
    await sleep(400);
    const m = JSON.parse(await cdp.evaluate(session, LOG));
    if (!m.present) {
      fail('[' + G + '] the card never came up');
      return;
    }
    const hits = await cdp.evaluate(session, 'window.__hit');
    if (!hits) {
      fail('[' + G + '] the record stub never fired (' + hits + ' hits) — ' +
        'everything below was measured against the harness server\'s own ' +
        'record rather than the planted calls');
      return;
    }

    /* (1) ONE ELEMENT PER CALL. Her complaint is that the rows read as one
       thing; the answer is that each row IS one thing. */
    if (!m.listPresent || m.rows.length !== expect.length) {
      fail('[' + G + '] the log paints ' +
        (m.listPresent ? m.rows.length : 'no') + ' row element(s) for ' +
        expect.length + ' planted call(s). ⛔ The shipped renderer JOINED ' +
        'the date, the job name, the provider+model and the two token ' +
        'counts into ONE string with " — " and painted every row ' +
        'identically — measured on this run, the flat shape was: ' +
        JSON.stringify(m.flat.slice(0, 4).map(function (p) {
          return p ? (p.size + 'px/' + p.weight + '/' + p.color) : null;
        })));
      return;
    }
    /* the rows paint newest-first (`calls.slice().reverse()`), so the
       planted call at index i is the row at length-1-i */
    function rowFor(i) { return m.rows[expect.length - 1 - i]; }

    /* (2) THE LEADING FIELD AND THE SUPPORTING FIELDS ARE MEASURABLY
       DIFFERENT THINGS. "hard to read" is a claim about pixels, answered in
       pixels: size, weight and colour, read off the browser. */
    m.rows.forEach(function (r, i) {
      if (!r.name || !r.when) {
        fail('[' + G + '] row ' + (i + 1) + ' is missing its ' +
          (!r.name ? 'name' : 'date') + ' element — each field must be its ' +
          'own element before it can carry its own weight');
        return;
      }
      [['date', r.when], ['who answered', r.who], ['cost', r.count]]
        .forEach(function (pair) {
          const b = pair[1];
          if (!b) { return; }
          const axes = [];
          if (r.name.size !== b.size) { axes.push('size'); }
          if (r.name.weight !== b.weight) { axes.push('weight'); }
          if (r.name.color !== b.color) { axes.push('colour'); }
          if (axes.length < 2) {
            fail('[' + G + '] row ' + (i + 1) + ' renders its name and its ' +
              pair[0] + ' in the same register (name ' + r.name.size + 'px/' +
              r.name.weight + '/' + r.name.color + ' vs ' + b.size + 'px/' +
              b.weight + '/' + b.color + ') — they differ on ' +
              (axes.length ? axes.join(' + ') : 'nothing') + ', and the ' +
              'pixel face stays, so the hierarchy has to come from at least ' +
              'two of size, weight and colour');
          }
          if (b.size > r.name.size) {
            fail('[' + G + '] row ' + (i + 1) + ' paints its ' + pair[0] +
              ' LARGER than the name that leads it (' + b.size + 'px vs ' +
              r.name.size + 'px)');
          }
          if (b.size < 11) {
            fail('[' + G + '] row ' + (i + 1) + "'s " + pair[0] +
              ' renders at ' + b.size + 'px — this is evidence she has to ' +
              'be able to READ; quiet is the instruction, invisible is not');
          }
        });
      /* the machine's own detail sits BELOW the name's line rather than
         welded onto it with a dash */
      if (r.count && !(r.name.bottom <= r.count.top + 1)) {
        fail('[' + G + '] row ' + (i + 1) + ' does not stack: the name\'s ' +
          'bottom is ' + r.name.bottom + ' and the cost starts at ' +
          r.count.top + ' — a row whose parts share one line is the wall ' +
          'again, with classes');
      }
      /* the date is the AXIS: right-aligned into a column of its own, and
         on the name's own line */
      if (Math.abs(r.when.cy - r.name.cy) > 10) {
        fail('[' + G + '] row ' + (i + 1) + "'s date does not ride the " +
          "name's line (date centre " + r.when.cy + ' vs name centre ' +
          r.name.cy + ') — the date is the axis this list is ordered on, ' +
          'and an axis is a column');
      }
      if (r.when.left < r.name.right) {
        fail('[' + G + '] row ' + (i + 1) + "'s date (left " + r.when.left +
          ') overlaps the name it should sit across from (right ' +
          r.name.right + ')');
      }
    });

    /* (3) THE ROWS ARE SEPARATED — measured as a gap AND as a rule. */
    function inkBoxes(r) {
      return [r.name, r.when, r.who, r.count].filter(Boolean);
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
      const gap = highestInk(m.rows[i]) - lowestInk(m.rows[i - 1]);
      if (gap < 12) {
        fail('[' + G + '] rows ' + i + ' and ' + (i + 1) + ' are ' + gap +
          'px apart at their nearest text (the flat list was ~6px). ' +
          'Separate things six pixels apart read as one paragraph');
      }
      if (!(m.rows[i].box.bw >= 1) || m.rows[i].box.bs === 'none') {
        fail('[' + G + '] row ' + (i + 1) + ' carries no hairline above it ' +
          '(border-top ' + m.rows[i].box.bw + 'px ' + m.rows[i].box.bs +
          ') — spacing alone is what a paragraph break looks like; a rule ' +
          'is what a list of separate things looks like');
      }
    }

    /* (4) ⛔ THE PIXEL FACE, UNCHANGED. She declined the sans mix twice. */
    const families = {};
    m.rows.forEach(function (r) {
      inkBoxes(r).forEach(function (b) { families[b.family] = true; });
    });
    if (m.headT) { families[m.headT.family] = true; }
    if (m.btn) { families[m.btn.family] = true; }
    const fam = Object.keys(families);
    if (fam.length !== 1) {
      fail('[' + G + '] the log renders ' + fam.length + ' font families (' +
        JSON.stringify(fam) + '). ⛔ The pixel typeface stays: hierarchy ' +
        'comes from size, weight, colour and spacing, never a second face');
    } else if (fam[0].indexOf('Pixelify') === -1) {
      fail('[' + G + '] the log renders in ' + JSON.stringify(fam[0]) +
        ' — the shipped pixel face is Pixelify Sans and it does not move');
    }

    /* (5) ⛔⛔ NOT ONE CHARACTER MOVED. THE GATE THAT PROVES THE
       PRESENTATION CHANGE KEPT THE EVIDENCE INTACT — every field the server
       served is still present, verbatim, in the row that carries it. */
    expect.forEach(function (e, i) {
      const r = rowFor(i);
      if (!r) { return; }
      const fields = [
        ['date', e.when],
        ['job name', nameOf[e.job]],
        ['provider', e.provider],
        ['model', e.model],
        ['tokens in', e.tin],
        ['tokens out', e.tout]];
      fields.forEach(function (p) {
        if (r.text.indexOf(p[1]) === -1) {
          fail('[' + G + '] the row for ' + JSON.stringify(e.job) +
            ' LOST CHARACTERS: the served ' + p[0] + ' ' +
            JSON.stringify(p[1]) + ' is not present, verbatim, in the ' +
            'rendered row ' + JSON.stringify(r.text) + '. ⛔ This round ' +
            'changes PRESENTATION ONLY — order, grouping, size, weight, ' +
            'colour, spacing, element and position. Never the characters');
        }
      });
      /* and the join itself is GONE from what she reads */
      if (r.text.indexOf(' — ') !== -1) {
        fail('[' + G + '] the row for ' + JSON.stringify(e.job) + ' still ' +
          'welds its fields together with " — ": ' + JSON.stringify(r.text) +
          '. That dash was the renderer\'s composition and never one of ' +
          'her sentences');
      }
    });

    /* (6) HER CLEAR CONTROL: TOP RIGHT, ACROSS FROM THE HEADING, AND IT
       READS AS A BUTTON. Her selected branch, driven in geometry. */
    if (!m.headP || !m.headT || !m.btn) {
      fail('[' + G + '] the heading line is not built for her ruling ' +
        '(heading paragraph ' + !!m.headP + ', heading text ' + !!m.headT +
        ', control ' + !!m.btn + '). ⛔ The control used to sit INSIDE her ' +
        'heading sentence, underlined, at the end of it — reading as part ' +
        'of the sentence rather than as a button');
    } else {
      if (m.btn.text !== clearWord) {
        fail('[' + G + '] the control reads ' + JSON.stringify(m.btn.text) +
          ' — her label is ' + JSON.stringify(clearWord) + ', byte-exact');
      }
      if (m.headT.text !== head) {
        fail('[' + G + '] the heading reads ' + JSON.stringify(m.headT.text) +
          ' — her sentence is ' + JSON.stringify(head) + ', byte-exact');
      }
      /* ⭐⭐ HER RULING OF 2026-08-27 REPLACES THE ONE THAT STOOD HERE, and
         it is replaced rather than relaxed. What stood here required the
         control to sit on the heading's FIRST LINE, level with it — her
         2026-08-26 branch, "Top right, across from the heading".

         ⛔ THAT BECAME UNSATISFIABLE BY HER OWN LATER RULING, and the
         conflict was measured before she was asked: on this card her
         sentence needs 381px, her extended label needs 403px, the gap is
         16, and the content box is 582. The only way to keep both on one
         line was to press her sentence into a 163px column of three short
         lines. ⭐ She was shown both drawn out and chose: LET THE CONTROL
         DROP BELOW. Her sentence keeps its line; the control takes its
         own, hard right, directly beneath.

         ⛔ THE TEETH MOVE WITH IT RATHER THAN COMING OUT. Three facts are
         asserted, and each one is a way the new arrangement can be lost:
         it is BELOW her sentence (not beside it, not above it), it is
         still HARD RIGHT (the "top right" half of her original ruling,
         which survived), and it is still ABOVE EVERY ROW IT CAN CLEAR —
         which is the substance of the ruling that put it at the top in the
         first place, and the one thing neither of her rulings ever gave
         up. */
      if (!m.head1) {
        fail('[' + G + '] her heading text has no line box at all — there ' +
          'is nothing to place the control under');
      } else {
        if (m.btn.top < m.headT.bottom - 2) {
          fail('[' + G + '] the control (top ' + m.btn.top + ') is not ' +
            'below her sentence (which ends at ' + m.headT.bottom +
            '). ⛔ Her ruling of 2026-08-27 is that it drops to its own ' +
            'line under her sentence — the alternative she was shown and ' +
            'REFUSED was keeping it level by squeezing her words into a ' +
            'narrow column');
        }
        if (m.btn.left < m.head1.left) {
          fail('[' + G + '] the control (left ' + m.btn.left + ') starts ' +
            'left of where her sentence starts (' + m.head1.left + ') — ' +
            'it has spread across the card instead of staying a control ' +
            'pushed to the right');
        }
      }
      /* ⛔ AND ABOVE EVERY ROW IT CAN CLEAR. Her words for the placement
         ruling this survives: "the clear log need to placed on the top of
         the activity log". A control that drifted under the first row
         would have lost the only part of that ruling both of her later
         answers kept. */
      if (m.rows.length && m.rows[0].box) {
        if (m.btn.bottom > m.rows[0].box.top + 1) {
          fail('[' + G + '] the control (bottom ' + m.btn.bottom + ') is ' +
            'not above the rows it clears (the first row starts at ' +
            m.rows[0].box.top + ') — "on the top of the activity log" is ' +
            'the half of her placement ruling that survived the move');
        }
      } else {
        fail('[' + G + '] no row was measured, so "the control sits above ' +
          'every row" was checked against nothing');
      }
      if (m.headP.right - m.btn.right > 4) {
        fail('[' + G + '] the control stops ' + (m.headP.right - m.btn.right) +
          'px short of the heading line\'s right edge — "top right" is an ' +
          'edge, not a drift');
      }
      /* and it READS AS A BUTTON — chrome the heading text does not have */
      const chrome = [];
      if (m.btn.bw >= 1 && m.btn.bs !== 'none') { chrome.push('border'); }
      if (m.btn.bg !== m.headT.bg && m.btn.bg !== 'rgba(0, 0, 0, 0)') {
        chrome.push('background');
      }
      if (m.btn.shadow && m.btn.shadow !== 'none') { chrome.push('shadow'); }
      if (m.btn.padL < 4) {
        fail('[' + G + '] the control has ' + m.btn.padL + 'px of left ' +
          'padding — a button with no padding is a word');
      }
      if (chrome.length < 2) {
        fail('[' + G + '] the control does not read as a button: border ' +
          m.btn.bw + 'px ' + m.btn.bs + ', background ' + m.btn.bg +
          ', shadow ' + JSON.stringify(m.btn.shadow) + ' — it carries ' +
          (chrome.length ? chrome.join(' + ') : 'no chrome at all') + '. ' +
          'Her earlier ruling on this exact complaint was "Keep pixel, ' +
          'make buttons look like buttons"');
      }
      if (/underline/.test(m.btn.deco)) {
        fail('[' + G + '] the control is still UNDERLINED (' + m.btn.deco +
          ') — an underline inside a sentence is what made it read as part ' +
          'of the sentence');
      }
    }

    /* (7) ⛔ AND ALL OF IT AT HER NARROW WINDOW. The heading and the
       control now share a line, and 600px is where they would collide. */
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(session,
      'document.fonts.ready.then(function(){return "ready";})');
    await sleep(900);
    const n = JSON.parse(await cdp.evaluate(session, LOG));
    if (!n.present || n.rows.length !== expect.length) {
      fail('[' + G + '] at a 600px window the log paints ' +
        (n.present ? n.rows.length : 'no') + ' row(s) instead of ' +
        expect.length);
    } else {
      if (n.scrollW > n.clientW + 1) {
        fail('[' + G + '] the card scrolls sideways at 600px (scrollWidth ' +
          n.scrollW + ' vs clientWidth ' + n.clientW + ')');
      }
      if (n.headT && n.btn) {
        /* ⛔ NO COLLISION AND NO OVERFLOW — the two facts her ruling can
           actually lose at this width. They may WRAP (the control drops to
           its own right-aligned line); they may never overlap. */
        const overlapX = n.btn.left < n.headT.right &&
          n.headT.left < n.btn.right;
        const overlapY = n.btn.top < n.headT.bottom &&
          n.headT.top < n.btn.bottom;
        if (overlapX && overlapY) {
          fail('[' + G + '] at 600px her heading (' + n.headT.left + '-' +
            n.headT.right + ' x ' + n.headT.top + '-' + n.headT.bottom +
            ') and her control (' + n.btn.left + '-' + n.btn.right + ' x ' +
            n.btn.top + '-' + n.btn.bottom + ') OVERLAP — her words are ' +
            'printed under a button');
        }
        if (n.btn.right > n.cardRight + 1) {
          fail('[' + G + '] at 600px the control runs ' +
            (n.btn.right - n.cardRight) + 'px past the card edge');
        }
      }
      n.rows.forEach(function (r, i) {
        /* ⛔ AGAINST THE CARD'S OWN RIGHT EDGE IN VIEWPORT COORDINATES, not
           against its WIDTH. The first draft of this check compared a
           rect.right (a viewport x) against clientWidth (a length) and
           called a date sitting comfortably inside a centred card an
           overflow — a check that was red over nothing. Re-derived from the
           thing it guards. */
        if (r.when && r.when.right > n.cardRight + 1) {
          fail('[' + G + '] at 600px row ' + (i + 1) + "'s date runs past " +
            'the card edge (' + r.when.right + ' vs ' + n.cardRight + ')');
        }
        if (r.name && r.count && !(r.name.bottom <= r.count.top + 1)) {
          fail('[' + G + '] at 600px row ' + (i + 1) + ' stops stacking');
        }
      });
    }

    if (violations.length === before) {
      const r0 = m.rows[0];
      note('armG (real Chrome, computed style, at 1280 and 600): the log ' +
        'paints ' + m.rows.length + ' separate rows — name ' + r0.name.size +
        'px/' + r0.name.weight + ' in ' + r0.name.color + ', date ' +
        r0.when.size + 'px in ' + r0.when.color + ', who-answered ' +
        (r0.who ? r0.who.size + 'px tag' : 'n/a') + ', cost ' +
        (r0.count ? r0.count.size + 'px' : 'n/a') + ', rows ' +
        (highestInk(m.rows[1]) - lowestInk(m.rows[0])) + 'px apart over a ' +
        m.rows[1].box.bw + 'px rule; her clear sits hard right on its OWN ' +
        'line beneath her sentence and above every row it clears — her ' +
        '2026-08-27 ruling (control ' + m.btn.left + '-' + m.btn.right +
        ' at y ' + m.btn.top + '-' + m.btn.bottom + ', her sentence ends ' +
        'at y ' + m.headT.bottom + ', the first row starts at y ' +
        (m.rows[0].box ? m.rows[0].box.top : 'n/a') + ', line ends ' +
        m.headP.right + ') wearing real button chrome; one typeface ' +
        'throughout; and every ' +
        'served date, job name, provider, model and token count is still ' +
        'present verbatim');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

(async function main() {
  const head = liftHeading();
  const clearWord = liftConst('CALL_RECORD_CLEAR');
  const refusalWord = liftConst('RECORD_DELETE_REFUSED');
  nameArm();
  natureArm();
  await liveArm(head);
  await designArm();
  await manageAbsenceArm(head, clearWord);
  await clearArm(head, clearWord, refusalWord);
  await lingerArm();
  await readabilityArm(head, clearWord);

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_pen_cup_door FAILED — ' + violations.length +
      ' violation(s), ' + notes.length + ' passed');
    process.exitCode = 1;
  } else {
    console.log('test_pen_cup_door OK — ' + notes.length + '/' + notes.length +
      ' checks (the activity log\'s one door: named from her heading, ' +
      'raised and put away in real Chrome, moves but never deletes)');
  }
})().catch(function (e) {
  console.error('test_pen_cup_door COULD NOT BE DRIVEN: ' +
    (e && e.message ? e.message : e));
  process.exitCode = 1;
});
