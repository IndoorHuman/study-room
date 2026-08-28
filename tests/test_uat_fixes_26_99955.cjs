#!/usr/bin/env node
'use strict';
/* =========================================================================
   test_uat_fixes_26_99955 — THE THREE SURFACE RULINGS SHE GAVE AFTER THE
   26.99955 WALK-THROUGH, 2026-08-26. (The fourth, the model picker, is held
   by tests/test_voice_pick_reaches_the_call.py — it is a routing and money
   claim rather than a surface one.)

   HER RULINGS, and each one is a fix to something SHE found:

     G-…-01  the librarian's suggestions "need to be folded into another
             window, so on the dashboard view, this should be folded like
             other things for manage your library". Offered the two shapes
             Manage already has, she chose the counted TILE. She then chose
             the tile's name, and the line it shows when there is nothing.

     G-…-06  "we need to have back to the room button as well, at least for
             me back to self I barely used it". Offered three arrangements
             she chose "Room gets the louder look" — first, stronger, with
             `back to the shelf` keeping exactly the button it has now.

     G-…-08  the pen cup would not put the activity log away. ⚠⚠ SHE RULED
             ON THIS TWICE IN ONE NIGHT AND THE SECOND RULING REVERSED THE
             FIRST — see the arm below, which holds what survived.

   ⛔⛔ WHY G-…-08 IS DRIVEN AT THREE LOG LENGTHS AND NOT ONE. The walk's own
   note diagnosed this as an open-only click handler and proposed teaching
   the ROOM's pen cup to toggle. Measured in real Chrome, that fix would
   have changed nothing she could see: `#station-overlay` is
   `position:fixed; inset:0` above the room, so the room's cup is
   unreachable the moment the desk opens, at every length. What actually
   swallowed her second tap was the page's HEIGHT — it grows with her log,
   and past roughly a dozen entries it covers the DESK's cup.
   ⭐ THE LENGTH IS STILL THE VARIABLE, FOR A NEW REASON. Her first ruling
   ("Stop short, scroll inside") was built and gated here at 1, 13 and 40
   rows. She then looked at it in her own room, asked for the page to be
   LONGER, was shown that clearing the cup was exactly what had made it
   short — and, offered an option giving roughly THREE TIMES the height for
   almost no width, chose instead **"Let it be tall and cover the cup
   again"**, told in those words that it undid her own ruling of an hour
   before. ⛔ So the ceiling is gone and the second tap is KNOWINGLY unfixed.
   What this arm holds now is the invariant that survives both rulings and
   actually protects her: **however long her log is, there is always at
   least one REACHABLE way off the page.** With the object underneath it,
   that is the ✕ alone — so a broken ✕ no longer costs a convenience, it
   traps her.

   ⛔ IT NEVER TOUCHES HER LIBRARY. `tests/lib/app-server.cjs` builds a
   library from nothing in a temp directory on every run and is removed
   after; the activity log is served by a stub wrapped around `fetch`, so
   the row count is this suite's to choose rather than the machine's.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const appServer = require('./lib/app-server.cjs');
const cdp = require('./lib/cdp.cjs');

/* ⛔ HER SENTENCES ARE LIFTED, NEVER RETYPED HERE. A suite that retypes one
   of her sentences has created the second literal that can drift from the
   one it is checking. A sentence that cannot be lifted STOPS THE RUN: an
   arm searching for a string that exists nowhere finds nothing and passes,
   which is the emptiest green there is. */
const APP_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app.js'), 'utf8');

function liftConst(name) {
  const m = APP_SRC.match(
    new RegExp('var ' + name + " = '((?:[^'\\\\]|\\\\.)*)'"));
  if (!m || !m[1].length) {
    throw new Error('LIFT_SHORT: var ' + name + ' is missing or empty in ' +
      'app.js — it is one of HER sentences and the arms below search for ' +
      'it by value');
  }
  return m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

const violations = [];
const notes = [];
function fail(m) { violations.push(m); }
function note(m) { notes.push(m); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ⛔ POLL WITH A CEILING, NEVER A BARE SLEEP. Every card on these screens is
   painted behind async posts, and this repo has already paid once for a
   suite that lost that race and reported a perfectly correct tree as
   broken. The ceiling is the one test_pen_cup_door measured. */
const CEILING_MS = 14000;

async function waitFor(session, sel, ms) {
  const deadline = Date.now() + (ms || CEILING_MS);
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
  if (!await waitFor(session, sel, CEILING_MS)) {
    throw new Error('not clickable / not present after ' + CEILING_MS +
      'ms of asking: ' + sel);
  }
  const box = JSON.parse(await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'n.scrollIntoView({block:"center"});var r=n.getBoundingClientRect();' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
  await tapAt(session, box.x, box.y);
}

/* A press at a COORDINATE rather than at an element — because that is what
   her finger does, and because whether the intended element is what
   RECEIVES it is the entire question in arm B. */
async function tapAt(session, x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: type, x: x, y: y, button: 'left', clickCount: 1 });
  }
}

/* N planted ledger rows, so the raised page's HEIGHT is this suite's
   variable. ⛔ Keyed on the PATH: the record is read with a post carrying no
   cache-buster, and a stub keyed on a query string matches nothing and sits
   inert while the arm quietly measures the harness server's own data.
   `window.__hit` is what makes that impossible to miss. */
function plant(n) {
  return '(function(){' +
    'if(window.__uatStub){return "already";}' +
    'window.__uatStub=true;window.__origFetch=window.fetch;window.__hit=0;' +
    'var rows=[];for(var i=0;i<' + n + ';i++){rows.push({' +
    'at:1755302400000+i*60000,job:(i%2?"reflection_judge":"reflection"),' +
    'provider:"anthropic",model:"claude-opus-5",' +
    'input_tokens:1000+i,output_tokens:20+i});}' +
    'window.fetch=function(u,o){' +
    'var p=String(u).split("?")[0];' +
    'if(/\\/api\\/librarian\\/record$/.test(p)){window.__hit++;' +
    'return Promise.resolve({ok:true,status:200,json:function(){' +
    'return Promise.resolve({calls:rows});}});}' +
    'return window.__origFetch.call(window,u,o);};return "ok";})()';
}

/* ==== ARM A — the way home leads the header (G-…-06) ==================== */

/* ⛔ COMPUTED STYLE, NOT SOURCE. "the louder look" is a claim about what
   renders; an inline style, a cascade or an !important can each decide it
   and only the browser knows which won. `#manage-to-shelf` in particular
   carries an inline quiet style that a Manage-scoped !important overrides —
   reading the source would report the opposite of the truth. */
const HEADER = '(function(){' +
  'function m(sel){var n=document.querySelector(sel);if(!n)return null;' +
  ' var s=getComputedStyle(n);var r=n.getBoundingClientRect();' +
  ' return {text:(n.textContent||"").trim(),left:Math.round(r.left),' +
  '  size:parseFloat(s.fontSize)||0,shadow:s.boxShadow,' +
  '  deco:s.textDecorationLine,bw:parseFloat(s.borderTopWidth)||0};}' +
  'return JSON.stringify({room:m("#manage-to-room"),' +
  ' sections:m("#manage-sections-toggle"),shelf:m("#manage-to-shelf")});})()';

/* How far a button stands off the page: the LAST offset pair in the shadow
   list is the hard drop shadow, and its size is the app's own loudness
   grammar (the bevels before it are inset and identical on every button). */
function dropOffset(shadow) {
  const px = String(shadow || '').match(/(\d+(?:\.\d+)?)px/g) || [];
  return px.length ? parseFloat(px[px.length - 3] || px[px.length - 1]) : 0;
}

async function headerArm(session) {
  const G = 'header';
  const m = JSON.parse(await cdp.evaluate(session, HEADER));
  if (!m.room) {
    fail('[' + G + '] there is no `back to the room` control in the Manage ' +
      'header at all — her own ask of 2026-08-26, and the room is home in ' +
      'this app: every other surface is something you open on top of it');
    return;
  }
  if (m.room.text !== 'back to the room') {
    fail('[' + G + '] the header door reads ' + JSON.stringify(m.room.text) +
      '. ⛔ NOT ONE NEW WORD was owed here — it borrows the string the ' +
      'existing door already carries, so a different one is copy nobody ' +
      'wrote');
  }
  if (!m.sections || !m.shelf) {
    fail('[' + G + '] one of the two shipped header controls is missing — ' +
      'her ruling ADDS a door and takes none away');
    return;
  }
  /* FIRST, by rendered position rather than by markup order. */
  if (!(m.room.left < m.sections.left && m.room.left < m.shelf.left)) {
    fail('[' + G + '] `back to the room` does not sit first (it renders at ' +
      m.room.left + ', sections at ' + m.sections.left + ', shelf at ' +
      m.shelf.left + ') — she chose "Room gets the louder look", and first ' +
      'is half of what she chose');
  }
  /* LOUDER, in the vocabulary this app actually has. ⛔ Never by colour:
     --accent is reserved for the reaching candle under the two-reds rule. */
  const lead = dropOffset(m.room.shadow);
  const plain = dropOffset(m.sections.shadow);
  if (!(lead > plain)) {
    fail('[' + G + '] `back to the room` stands no further off the page ' +
      'than its neighbour (drop ' + lead + 'px vs ' + plain + 'px) — ' +
      'nothing renders it as the louder control');
  }
  if (!(m.room.size > m.sections.size)) {
    fail('[' + G + '] `back to the room` renders at ' + m.room.size +
      'px against its neighbour\'s ' + m.sections.size + 'px — the ' +
      'hierarchy step the 26.99955-09 pass established is not spent here');
  }
  /* ⛔ AND THE SHELF IS UNTOUCHED, which is the half she chose OVER
     quietening it — that would undo part of her own "make buttons look like
     buttons" ruling, and a suite already pins it. */
  if (m.shelf.bw < 2 || !m.shelf.shadow || m.shelf.shadow === 'none' ||
      m.shelf.deco !== 'none') {
    fail('[' + G + '] `back to the shelf` no longer renders as a full ' +
      'button (border ' + m.shelf.bw + 'px, shadow ' +
      JSON.stringify(m.shelf.shadow) + ', decoration ' + m.shelf.deco +
      ') — she was offered quietening it and chose not to');
  }
  if (dropOffset(m.shelf.shadow) !== plain) {
    fail('[' + G + '] `back to the shelf` no longer stands off the page by ' +
      'the same amount as the other plain button — the louder look was ' +
      'meant to be spent on the room door, not taken from the shelf');
  }
  if (violations.length === 0) {
    note('armA (real Chrome, computed style): `back to the room` leads the ' +
      'Manage header — first at ' + m.room.left + 'px, ' + m.room.size +
      'px over ' + m.sections.size + 'px, standing ' + lead + 'px off the ' +
      'page against ' + plain + 'px — and `back to the shelf` keeps the ' +
      'full button chrome her earlier ruling gave it');
  }
}

async function homeWorksArm(session) {
  const G = 'header-works';
  await click(session, '#manage-to-room');
  await sleep(1500);
  const screen = await cdp.evaluate(session,
    '(function(){var a=document.querySelector(".screen.active");' +
    'return a?a.id:"none";})()');
  if (screen !== 'screen-room') {
    fail('[' + G + '] pressing `back to the room` left the app on ' +
      JSON.stringify(screen) + '. ⛔ A VISIBLE BUTTON IS NOT A WORKING ONE, ' +
      'and this project\'s own lesson is that a control can fail silently');
    return;
  }
  note('armA2 (real Chrome): her header door actually arrives in the room — ' +
    'driven, because the walk-through recorded a control that was visible ' +
    'and never pressed');
}

/* ==== ARM B — the raised log never covers the cup (G-…-08) ============== */

const REACH = '(function(){' +
  'function look(id){var n=document.getElementById(id);' +
  ' if(!n){return {present:false};}' +
  ' var r=n.getBoundingClientRect();' +
  ' if(!r.width||!r.height){return {present:true,sized:false};}' +
  ' var t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);' +
  ' return {present:true,sized:true,' +
  '  x:r.left+r.width/2,y:r.top+r.height/2,' +
  '  top:Math.round(r.top),' +
  '  reachable:!!t&&n.contains(t),' +
  '  over:t?((t.id||"")+"."+(t.className&&t.className.baseVal!==undefined?' +
  '   t.className.baseVal:(t.className||""))):null};}' +
  'var c=document.getElementById("desk-activity-card");' +
  'var cr=c?c.getBoundingClientRect():null;' +
  'return JSON.stringify({card:!!c,' +
  ' cardBottom:cr?Math.round(cr.bottom):null,' +
  ' cardHeight:cr?Math.round(cr.height):null,' +
  ' desk:look("desk-pencup"),room:look("room-obj-pen-cup")});})()';

async function cupArm(rows) {
  const G = 'cup@' + rows;
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const planted = await cdp.evaluate(session, plant(rows));
    if (!planted || String(planted).indexOf('ok') === -1) {
      fail('[' + G + '] the record stub did not install (' + planted +
        ') — the page\'s height would then be the harness\'s to decide and ' +
        'this arm would prove nothing it claims to');
      return;
    }
    await click(session, '#room-obj-pen-cup');
    await sleep(1800);
    const hits = await cdp.evaluate(session, 'window.__hit');
    if (!hits) {
      fail('[' + G + '] the record stub never fired — the page was drawn ' +
        'from whatever the harness server held, not from ' + rows + ' rows');
      return;
    }
    const m = JSON.parse(await cdp.evaluate(session, REACH));
    if (!m.card) {
      fail('[' + G + '] tapping the pen cup did not raise the activity log');
      return;
    }
    if (!m.desk.present || !m.desk.sized) {
      fail('[' + G + '] the desk\'s pen cup is absent or renders at zero ' +
        'size, so there is nothing to tap');
      return;
    }
    /* ⛔⛔ THE INVARIANT, AND IT IS THE ONE THING NEITHER OF HER TWO
       RULINGS TOUCHED: she is never trapped on this page. Which door is
       reachable is hers to choose and she has now chosen twice; that at
       least one is, is not a preference. */
    const closes = await cdp.evaluate(session,
      '(function(){return document.querySelectorAll' +
      '("#desk-activity-card .desk-activity-close").length;})()');
    if (Number(closes) !== 1) {
      fail('[' + G + '] the raised page carries ' + closes + ' ✕ controls, ' +
        'pinned at exactly 1. She asked for it by name on this card\'s twin ' +
        '("need to inclde the exit button for this card"), and with the pen ' +
        'cup underneath the page it is the ONLY way off');
    }
    /* ⭐ HER SECOND RULING, ASSERTED AS THE LENGTH SHE ASKED FOR. The page
       is meant to be TALL now — at her own window the ceiling had left room
       for about two entries, and "make it longer" is what she said. So a
       long log must produce a page that really is long, or the reversal
       bought her nothing. */
    if (rows >= 13 && m.cardHeight < 300) {
      fail('[' + G + '] a log of ' + rows + ' rows raises a page only ' +
        m.cardHeight + 'px tall. She reversed her own clear-the-cup ruling ' +
        'specifically to get the length back, so a short page here means ' +
        'she paid the tap for nothing');
    }
    /* ⚠ AND THE COST IS ASSERTED RATHER THAN LEFT IMPLIED, so nobody meets
       it later as a surprise: once the page is long it DOES cover the cup,
       and the second tap there does nothing. This is not a defect any more
       — it is what she chose — but it must not become invisible. */
    const covered = m.cardBottom >= m.desk.top;
    if (covered && m.desk.reachable) {
      fail('[' + G + '] the page overlaps the pen cup and yet a tap at the ' +
        'cup\'s centre still reaches it — the two measurements disagree, so ' +
        'one of them is wrong and this arm cannot report either');
    }
    /* ⛔ THE ✕ IS DRIVEN, NEVER ASSUMED. Its presence is markup; that it
       CLOSES is behaviour, and with the object covered it is the whole
       exit. */
    await click(session, '#desk-activity-card .desk-activity-close');
    await sleep(1400);
    const shut = JSON.parse(await cdp.evaluate(session, REACH));
    if (shut.card) {
      fail('[' + G + '] the ✕ did not put the activity log away, and with ' +
        'the pen cup underneath the page there is no other way off it — ' +
        'she is trapped on the page');
    }
    note('armB (real Chrome, ' + rows + ' rows in the log): the raised page ' +
      'is ' + m.cardHeight + 'px tall (' +
      (covered ? 'over the pen cup, as she chose' : 'clear of the pen cup') +
      '), carries exactly one ✕, and the ✕ really closes it');
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== ARM C — the suggestions fold into her tile (G-…-01) =============== */

const LANDING = '(function(){' +
  'var streamed=document.querySelectorAll' +
  ' ("#screen-manage .librarian-suggestions").length;' +
  'var inPane=document.querySelectorAll' +
  ' ("#manage-sec-noticed .librarian-suggestions").length;' +
  'var tiles=[];' +
  'document.querySelectorAll("#manage-landing .manage-tile")' +
  '.forEach(function(b){var c=b.querySelector(".manage-tile-count");' +
  ' tiles.push({pane:b.getAttribute("data-pane"),' +
  '  name:((b.querySelector(".manage-tile-name")||{}).textContent||"")' +
  '   .trim(),count:c?c.textContent.trim():null});});' +
  'return JSON.stringify({streamed:streamed,inPane:inPane,tiles:tiles});})()';

async function foldArm(session) {
  const G = 'fold';
  const m = JSON.parse(await cdp.evaluate(session, LANDING));
  /* ⛔ THE DEFECT ITSELF: nothing streams down the front page. The pane's
     own host is subtracted, because it lives inside #screen-manage too and
     is exactly where the rows are SUPPOSED to be. */
  if (m.streamed - m.inPane > 0) {
    fail('[' + G + '] the librarian\'s suggestion rows still have ' +
      (m.streamed - m.inPane) + ' host(s) on the Manage page outside her ' +
      'pane — this is the surface she caught on first look, the one thing ' +
      'on that page that was neither a framed panel nor a tile');
  }
  const tile = m.tiles.filter(function (t) { return t.pane === 'noticed'; })[0];
  if (!tile) {
    fail('[' + G + '] there is no tile for the librarian\'s suggestions — ' +
      'her ruling was that they fold "like other things for manage your ' +
      'library", and she chose the counted tile over an inline panel');
    return;
  }
  if (!tile.name) {
    fail('[' + G + '] the tile renders no name');
  }
  /* ⛔ COUNTED, which is the shape she chose. A tile with no digit is the
     OTHER shape — the uncounted doors — and this one has to be told apart
     from those by more than where it sits. */
  if (tile.count === null) {
    fail('[' + G + '] her tile renders no count. She chose the COUNTED ' +
      'tile; an uncounted one is the other shape Manage offers');
  }
  /* Her ruled positions are untouched: the new tile took the END of the
     counted group rather than a seat inside it. */
  const counted = m.tiles.filter(function (t) { return t.count !== null; })
    .map(function (t) { return t.pane; });
  const ruled = ['filters', 'never', 'hidden', 'pile', 'blessed', 'retired'];
  if (counted.slice(0, ruled.length).join(',') !== ruled.join(',')) {
    fail('[' + G + '] the counted group now reads ' + counted.join(',') +
      ' — its order is HER D-09 ruling and the new tile was appended so ' +
      'that not one of her positions moved');
  }
  if (counted[counted.length - 1] !== 'noticed') {
    fail('[' + G + '] her new tile is not last in the counted group ' +
      '(the group reads ' + counted.join(',') + ')');
  }
  note('armC (real Chrome): the librarian\'s suggestions no longer stream ' +
    'down the front page; they fold behind a counted tile named ' +
    JSON.stringify(tile.name) + ', appended after her six ruled positions');
  return tile;
}

async function foldOpensArm(session) {
  const G = 'fold-opens';
  const opened = await cdp.evaluate(session,
    '(function(){var b=document.querySelector' +
    '("#manage-landing .manage-tile[data-pane=\\"noticed\\"]");' +
    'if(!b)return "no tile";b.click();return "clicked";})()');
  if (opened !== 'clicked') {
    fail('[' + G + '] her tile could not be pressed (' + opened + ')');
    return;
  }
  await sleep(2500);
  const m = JSON.parse(await cdp.evaluate(session,
    '(function(){var p=document.getElementById("manage-sec-noticed");' +
    'var r=p?p.getBoundingClientRect():null;' +
    'var land=document.getElementById("manage-landing");' +
    'var lr=land?land.getBoundingClientRect():null;' +
    'return JSON.stringify({present:!!p,' +
    ' hidden:p?p.classList.contains("manage-pane-hidden"):null,' +
    ' w:r?Math.round(r.width):0,' +
    ' landingShown:!!(lr&&lr.width&&lr.height),' +
    ' heading:p?((p.querySelector("h3")||{}).textContent||"").trim():"",' +
    ' body:p?(p.textContent||"").replace(/\\s+/g," ").trim():""});})()'));
  if (!m.present || m.hidden !== false || !(m.w > 400)) {
    fail('[' + G + '] her pane did not open full-width (present=' +
      m.present + ', hidden=' + m.hidden + ', width=' + m.w + ')');
    return;
  }
  if (m.landingShown) {
    fail('[' + G + '] the front page is still showing behind the opened ' +
      'pane — the tile shape she chose fills the width and puts the tiles ' +
      'away, which is what makes it a fold rather than one more thing on ' +
      'the page');
  }
  if (!m.heading) {
    fail('[' + G + '] the opened pane carries no heading, so nothing on it ' +
      'says what it is');
  }
  /* ⛔⛔ HER EMPTY LINE, AND IT IS NOT OPTIONAL. This walk-through proved
     that a blank card reads as damage: she cleared the activity log, met a
     card carrying nothing but a ✕, and reported a bug against behaviour
     that was working perfectly. Every other counted section already carries
     a line of hers for this. */
  const body = m.body.slice(m.heading.length).trim();
  if (!body) {
    fail('[' + G + '] with nothing on the shelf her pane renders the ' +
      'heading and NOTHING ELSE. That is the shape she reported as a bug ' +
      'on this very walk-through — a blank surface is indistinguishable ' +
      'from a broken one');
    return;
  }
  note('armC2 (real Chrome): her tile opens the pane full-width with the ' +
    'front page put away, headed ' + JSON.stringify(m.heading) + ', and an ' +
    'empty shelf says ' + JSON.stringify(body) + ' rather than nothing');
}

/* ==== ARM D — the clear asks once, and the first press destroys nothing ==
   (G-…-10, her ruling of 2026-08-26)

   ⛔⛔ WHY THE TICKET EXISTS AT ALL: she cleared her real activity log
   mid-walk-through while testing something else. That is the strongest
   evidence available that the weight did not come across — she was pressing
   a clearly-labelled button to see what it did, which is what anyone would
   do. The file it destroyed is the one thing in the room that answers "has
   my privacy been kept" with evidence rather than a promise, and the
   sentence on the button reassured her about what SURVIVES.

   ⭐ HER THREE CHANGES: the sentence names what is lost, the press asks
   once, and the record is emptied rather than removed. The third is driven
   on the server (`tests/test_spend_record.py`); this arm drives the second,
   which is the only one a person can see.

   ⚠⚠ THE CLAIM WORTH GATING IS THE NEGATIVE ONE. That her question APPEARS
   is already driven by `test_pen_cup_door`, which now has to answer it to
   reach the clear at all. What nothing yet proved is that the FIRST PRESS
   REACHES NO ROUTE — an ask that showed a question and deleted anyway would
   look identical on screen and would be the whole defect, restored. So the
   delete route is counted, and the count is asserted at every beat.

   ⛔ AND HER ROWS STAY UP WHILE SHE IS ASKED. A confirm that hid the thing
   it is asking about would be asking her to agree to something she can no
   longer see. */

/* ⛔⛔ SHOWN, NEVER MERELY PRESENT. Both faces of her line are written at
   the renderer's one sink and the ask is hidden until she presses, so
   `querySelector` finds every control at every beat and a presence probe
   would report the card as ALREADY ASKING before she touched it. Every
   claim below is therefore measured off real geometry — a zero-sized box
   is not on screen, whatever the tree says. */
const ASK = '(function(){' +
  'var c=document.getElementById("desk-activity-card");' +
  'if(!c)return JSON.stringify({card:false});' +
  'function shown(n){if(!n)return false;' +
  ' var r=n.getBoundingClientRect();return r.width>0&&r.height>0;}' +
  'var head=c.querySelector(".call-record-head");' +
  'var ask=c.querySelector(".call-record-ask");' +
  'return JSON.stringify({card:true,' +
  ' heading:shown(head),asking:shown(ask),' +
  ' headText:head?(head.textContent||"").replace(/\\s+/g," ").trim():null,' +
  ' askText:ask?(ask.textContent||"").replace(/\\s+/g," ").trim():null,' +
  ' rows:c.querySelectorAll(".call-row").length,' +
  ' clear:shown(c.querySelector(".call-record-clear")),' +
  ' goAhead:shown(c.querySelector(".call-record-clear-confirm")),' +
  ' keep:shown(c.querySelector(".call-record-keep")),' +
  ' deletes:(window.__del||0)});})()';

/* the record stub, PLUS a counter on the deletion. ⛔ The delete is
   swallowed rather than forwarded: this arm is about what the presses
   REACH, and letting one through would make every later beat a measurement
   of an emptied record instead of the ask in front of it. */
function plantWithDelete(n) {
  return '(function(){' +
    'if(window.__uatStub){return "already";}' +
    'window.__uatStub=true;window.__origFetch=window.fetch;' +
    'window.__hit=0;window.__del=0;' +
    'var rows=[];for(var i=0;i<' + n + ';i++){rows.push({' +
    'at:1755302400000+i*60000,job:(i%2?"reflection_judge":"reflection"),' +
    'provider:"anthropic",model:"claude-opus-5",' +
    'input_tokens:1000+i,output_tokens:20+i});}' +
    'window.fetch=function(u,o){' +
    'var p=String(u).split("?")[0];' +
    'if(/\\/api\\/librarian\\/record\\/delete$/.test(p)){window.__del++;' +
    'return Promise.resolve({ok:true,status:200,json:function(){' +
    'return Promise.resolve({ok:true});}});}' +
    'if(/\\/api\\/librarian\\/record$/.test(p)){window.__hit++;' +
    'return Promise.resolve({ok:true,status:200,json:function(){' +
    'return Promise.resolve({calls:rows});}});}' +
    'return window.__origFetch.call(window,u,o);};return "ok";})()';
}

async function askArm() {
  const G = 'ask';
  const ROWS = 5;
  const head = liftConst('CALL_RECORD_HEAD');
  const clearWord = liftConst('CALL_RECORD_CLEAR');
  const question = liftConst('CALL_RECORD_CONFIRM');
  const keepWord = liftConst('CALL_RECORD_KEEP');
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const planted = await cdp.evaluate(session, plantWithDelete(ROWS));
    if (!planted || String(planted).indexOf('ok') === -1) {
      fail('[' + G + '] the stub did not install (' + planted + ') — the ' +
        'deletion would then be real and the count below would measure ' +
        'the harness rather than her presses');
      return;
    }
    await click(session, '#room-obj-pen-cup');
    if (!await waitFor(session, '#desk-activity-card .call-record-clear',
      CEILING_MS)) {
      fail('[' + G + '] her control never came up, so nothing below was ' +
        'measured against a real starting state');
      return;
    }
    await sleep(600);

    const start = JSON.parse(await cdp.evaluate(session, ASK));
    if (!start.card || start.rows !== ROWS) {
      fail('[' + G + '] the card came up with ' + start.rows + ' row(s) ' +
        'instead of ' + ROWS + ' — every beat below would be a reading of ' +
        'the wrong page');
      return;
    }
    if (start.headText === null || start.headText.indexOf(head) === -1) {
      fail('[' + G + '] the card did not open on her heading');
      return;
    }
    if (start.goAhead || start.keep) {
      fail('[' + G + '] the card opened ALREADY ASKING — the question is ' +
        'raised by her press, never by the page');
    }

    /* ---- beat 1: the first press asks, and reaches nothing ---- */
    await click(session, '#desk-activity-card .call-record-clear');
    await sleep(900);
    const asked = JSON.parse(await cdp.evaluate(session, ASK));
    if (asked.deletes !== 0) {
      fail('[' + G + '] the FIRST press reached the delete route ' +
        asked.deletes + ' time(s). ⛔ Her ruling is that it asks first — a ' +
        'question drawn over a deletion that already happened is the ' +
        'defect she reported, wearing a confirm');
    }
    if (!asked.asking || !asked.askText ||
      asked.askText.indexOf(question) === -1) {
      fail('[' + G + '] the first press did not raise her question ' +
        '(shown ' + asked.asking + '). Expected ' +
        JSON.stringify(question) + '; the line reads ' +
        JSON.stringify((asked.askText || '').slice(0, 200)));
      return;
    }
    if (asked.heading) {
      fail('[' + G + '] her heading is STILL SHOWN beside the question — ' +
        'the line says two things at once, and her question is supposed to ' +
        'take its place');
    }
    if (!asked.goAhead || !asked.keep) {
      fail('[' + G + '] her question came up without both answers ' +
        '(go-ahead ' + asked.goAhead + ', way out ' + asked.keep + ') — a ' +
        'question with no way out is not an ask');
    }
    if (asked.rows !== ROWS) {
      fail('[' + G + '] the ask hid the rows it is asking about (' +
        asked.rows + ' left of ' + ROWS + ') — she is being asked to agree ' +
        'to something she can no longer see');
    }


    /* ---- beat 2: the way out puts it back, and still reaches nothing ---- */
    await click(session, '#desk-activity-card .call-record-keep');
    await sleep(900);
    const kept = JSON.parse(await cdp.evaluate(session, ASK));
    if (kept.deletes !== 0) {
      fail('[' + G + '] backing out of the question still deleted (' +
        kept.deletes + ' call(s)) — the way out is a way in');
    }
    if (!kept.heading || !kept.headText ||
      kept.headText.indexOf(head) === -1 ||
      kept.headText.indexOf(clearWord) === -1) {
      fail('[' + G + '] backing out did not put her line and her control ' +
        'back (shown ' + kept.heading + '); the line reads ' +
        JSON.stringify((kept.headText || '').slice(0, 200)));
    }
    if (kept.asking) {
      fail('[' + G + '] her question is still on screen after she backed ' +
        'out of it');
    }
    if (kept.rows !== ROWS) {
      fail('[' + G + '] backing out cost her ' + (ROWS - kept.rows) +
        ' row(s) — nothing at all should have happened');
    }
    if (kept.goAhead || kept.keep) {
      fail('[' + G + '] the answers to the question outlived the question');
    }
    if (kept.keep) {
      fail('[' + G + '] the way-out word ' + JSON.stringify(keepWord) +
        ' is still on screen on a card that is not asking anything');
    }

    /* ---- beat 3: ask again, answer yes, and EXACTLY one delete ---- */
    await click(session, '#desk-activity-card .call-record-clear');
    await sleep(900);
    await click(session, '#desk-activity-card .call-record-clear-confirm');
    await sleep(1200);
    const done = JSON.parse(await cdp.evaluate(session, ASK));
    if (done.deletes !== 1) {
      fail('[' + G + '] answering yes reached the delete route ' +
        done.deletes + ' time(s) — exactly one press, exactly one clear');
    }
    if (!done.heading || !done.headText ||
      done.headText.indexOf(head) === -1) {
      fail('[' + G + '] her line went with the lines after a clear that ' +
        'reported success');
    }
    if (done.asking) {
      fail('[' + G + '] the question is still on screen after it was ' +
        'answered');
    }
    note('armD (real Chrome): her clear ASKS once — the first press reaches ' +
      'no route at all and leaves all ' + ROWS + ' rows up beside the ' +
      'question, her way out puts her line back having deleted nothing, ' +
      'and only the answer to the question clears, exactly once');
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ==== the Manage arms share one session ================================= */

async function manageArms() {
  const app = await appServer.start({ vault: true });
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    await click(session, '#room-manage-link');
    if (!await waitFor(session, '#manage-landing .manage-tile', CEILING_MS)) {
      fail('[manage] the Manage landing never painted a tile — every ' +
        'measurement below would be a reading of nothing');
      return;
    }
    await sleep(2500);
    await headerArm(session);
    await foldArm(session);
    await foldOpensArm(session);
    await click(session, '#manage-pane-back .manage-pane-back-btn');
    await sleep(1200);
    await homeWorksArm(session);
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

(async function main() {
  await manageArms();
  /* ⚠ ONE ENTRY, THIRTEEN, AND FORTY. One is the length at which the OLD
     build passed; thirteen is what her own ledger held on the day; forty is
     a log lived with for a while. The middle one is the case that matters
     and the outer two are what make it a claim about all lengths. */
  for (const rows of [1, 13, 40]) {
    await cupArm(rows);
  }
  await askArm();

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_uat_fixes_26_99955 FAILED — ' + violations.length +
      ' violation(s), ' + notes.length + ' passed');
    process.exitCode = 1;
  } else {
    console.log('test_uat_fixes_26_99955 OK — ' + notes.length + '/' +
      notes.length + ' checks (her way home leads the header, her ' +
      'suggestions fold into a counted tile that says something when it is ' +
      'empty, and the activity log is long at her word with a ✕ that ' +
      'really closes it at every length)');
  }
})().catch(function (e) {
  console.error('test_uat_fixes_26_99955 COULD NOT BE DRIVEN: ' +
    (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
