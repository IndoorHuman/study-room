#!/usr/bin/env node
'use strict';
/* test_consent_card_reaches_her — phase 26.995, gaps G-26.995-2 and
 * G-26.995-9.
 *
 * ⛔⛔ 26.995-27 — THE ELEVENTH INSTANCE OF THIS PROJECT'S NAMED DEFECT CLASS
 * WAS CREATED IN THIS FILE, AND THIS BLOCK IS WHERE IT IS WRITTEN DOWN.
 *
 * The version of this file shipped by 26.995-22 asserted that the three
 * CONSENT CONTROLS were on screen — and they were. IT NEVER ASSERTED THAT THE
 * TEXT ABOVE THEM WAS STILL READABLE. Its `DOORS` list was exactly the three
 * button selectors, and the only sentence it measured was the card's OPENING
 * line, used as the detector's known-good control. The second and third
 * paragraphs — WHAT IS SENT TO CLAUDE, and WHAT IT COSTS — were measured by
 * nothing at all. The fix it shipped (an opaque row pinned to the paper's
 * bottom edge, "and the sentences scroll behind it") is what hid them.
 * ⛔ THE FIX AND THE DEFECT WERE THE SAME COMMIT — the second instance of this
 * class created INSIDE a correction written to end the class.
 *
 * ⛔ AND HERE IS WHAT THIS VERSION STILL CANNOT SEE. Nobody may credit it with
 * more than it does:
 *   - It measures GEOMETRY, at three fixed viewports, at `scrollTop = 0`. It
 *     says nothing about any viewport it is not driven at, and nothing about
 *     what happens after she scrolls.
 *   - IT CANNOT DETECT A REWORD OF THE THREE SENTENCES. It LIFTS them from the
 *     shipped source it is measuring (`app.js`, and `server.py` for the cost
 *     line), so a changed sentence changes both sides of the comparison and
 *     passes. That is deliberate — a retyped literal that drifts by one
 *     character makes a gate assert the wrong thing, which is this very class
 *     in a new costume — but it is a REAL HOLE and it is named here rather
 *     than left for a reader to assume otherwise. The three BUTTON LABELS are
 *     the exception: they stay pinned byte-exactly below, so a label reword IS
 *     caught. Byte-equality of the sentences is asserted separately, by diff
 *     against HEAD, in the plan that ships alongside this file.
 *   - It does not judge whether the words are the RIGHT words. They are hers.
 *
 * THE READABILITY ARM'S OWN ANTI-VACUITY ANSWERS (26.995-27):
 *  (6) Can it pass before the fix? No — driven against HEAD's bytes it is RED
 *      at 1400x782 on the cost sentence, which sits entirely underneath the
 *      opaque control row, and RED as a backstop at the other two viewports.
 *  (7) Could it pass over a card with the cost line missing? No. The card's
 *      paragraph count is asserted as the literal FOUR and the cost paragraph
 *      is asserted PRESENT and non-empty — matched against `server.py`'s own
 *      `FORECAST_MSG` with a `$d.dd` figure in its slot — BEFORE any geometry
 *      is read. `forecastLineHtml()` renders NOTHING when the room cannot
 *      price the model, and a gate that measured two readable paragraphs in
 *      that state and went green would be the TWELFTH instance, not the fix
 *      for the eleventh.
 *  (8) Is the readability detector always-pass? CONTROL C plants an opaque
 *      cover over the card's first sentence and the SAME detector must report
 *      it unreadable; control A must still report that sentence readable once
 *      the cover is lifted.
 *  (9) Does it only ask about the window? No. Each sentence is asked four
 *      questions: inside the window, inside the paper's own visible box, NOT
 *      overlapping the pinned control row, and reaching itself at five points
 *      down its own height. THE SHIPPED DEFECT PASSED THE FIRST TWO — the cost
 *      sentence lies INSIDE the box at 1400x782 and is simply painted over.
 *      An in-window check alone would have called it fine.
 *
 * WHAT THIS EXISTS FOR. The consent card is where she says yes, just titles,
 * or not now. It is the tap the room's give-up clock is counting down on. In
 * her own UAT at 1400x782 the sitting sat on that card until the clock ran
 * out and the room then told her the librarian had been too slow — when no
 * model had been called at all.
 *
 * MEASURED IN A REAL CHROME AT HER OWN WINDOW SIZE, BEFORE ANY FIX:
 *
 *   session-consent-meta   top=693 bottom=739  winH=782  spotBottom=705
 *   session-consent-full   top=739 bottom=785  winH=782  spotBottom=705
 *   session-consent-later  top=739 bottom=785  winH=782  spotBottom=705
 *
 * All three sat BELOW the paper's own scroll box (which ends at 705), two of
 * them below the window itself, and `document.elementFromPoint` at each
 * control's own centre reached a DIV and never the button:
 *
 *   reachable=false  reachable=false  reachable=false
 *
 * It was not "she has to scroll". THE PAGE DOES NOT SCROLL — document height
 * equals window height. The only way to the three controls was scrolling
 * INSIDE a small paper box that gives no sign it holds anything more. And the
 * same three read `inSpot=false, reachable=false` at 1280x800 and 1100x800
 * too, so this was never a quirk of one window.
 *
 * ⛔ WHY THIS IS A REAL BROWSER AND NOT A SOURCE READ. Every fact above is
 * LAYOUT. A suite that greps app.js for a class name would pass over a card
 * drawn entirely off screen, and this project's most-repeated defect is a
 * check that confirms a mechanism is well-formed without confirming it works.
 * The model for this file is tests/test_roster_sentence_reaches_her.cjs,
 * written for the same class after 26.96's F-2.
 *
 * ⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY. tests/lib/app-server.cjs builds a
 * synthetic library under os.tmpdir() and serves that; library.local.json is
 * never read. Asserted by value at the end of this file.
 *
 * ⛔ NO RUNNER MEANS FAILURE, NEVER A QUIET STOP. Every failure path here
 * exits non-zero with a named reason, including a Chrome that cannot launch —
 * the posture tests/lib/cdp.cjs already takes. A live gate whose runner is
 * unavailable fails; it does not stop checking.
 *
 * THE ANTI-VACUITY ANSWERS.
 *  (1) Can it pass before the fix? No — the RED above was recorded on the
 *      shipped bytes, on all three viewports, and is quoted in the commit.
 *  (2) Could it pass over NOTHING? No. Each control's LABEL is pinned
 *      byte-exactly before its geometry is believed, so an empty card, a
 *      renamed control or a missing button fails as a missing positive
 *      control rather than sliding through as "nothing was clipped".
 *  (3) Is the in-view detector always-pass? CONTROL A measures the card's
 *      first sentence — known in view on the shipped bytes and on the fix —
 *      and CONTROL B measures a deliberately out-of-view probe and asserts
 *      the SAME detector calls it out of view. A detector that answered
 *      "in view" for everything fails at B.
 *  (4) Does it only ask about the window? No. Each control is asked three
 *      questions: inside the window, inside every clipping ancestor, and
 *      HIT-TESTABLE at its own centre. The shipped defect passed the first
 *      at two of the three viewports and failed the other two everywhere.
 *  (5) Does a degenerate fix satisfy it? Deleting the controls fails (2).
 *      Scrolling the paper to the bottom on paint would put the card's own
 *      sentences out of view, and CONTROL A fails on that.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));
const fs = require('fs');
const os = require('os');

// ⛔ HER CARD'S THREE BUTTON LABELS, pinned byte-exactly. These are the
// POSITIVE CONTROLS: geometry is believed only once the right control is on
// screen. They are HERS and settled — this file measures WHERE they are and
// never what they say.
const DOORS = [
  ['.session-consent-meta', 'just titles and dates'],
  ['.session-consent-full', "yes: read what's new"],
  ['.session-consent-later', 'not now']
];
// ---- HER THREE SENTENCES, LIFTED FROM THE SHIPPED SOURCE ------------------
//
// ⛔ NOT RETYPED. `grep -v '^\s*//' tests/test_consent_card_reaches_her.cjs |
// grep -c '<any card sentence>'` answers 0 by construction: the only copies of
// her sentences in this process are the ones read off `app.js` and `server.py`
// at run time. A retyped literal that drifts by one character makes this gate
// assert the wrong thing — this project's signature defect wearing a new coat.
// The cost is stated in the header: THIS FILE CANNOT DETECT A REWORD.
//
// ⛔ A SOURCE THAT NO LONGER HAS THE SHAPE THIS READS IS A HARD FAILURE, never
// a skip. Two sentences, exactly; one FORECAST_MSG, exactly; anything else and
// the run stops with the count it found, because a lifter that silently lifts
// nothing measures nothing.
function liftCardSentences() {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const open = src.indexOf('\'<div class="session-consent">\'');
  const shut = src.indexOf('session-consent-doors"', open);
  if (open === -1 || shut === -1 || shut < open) {
    throw new Error('the consent block could not be located in app.js — ' +
      'this gate lifts her sentences from the shipped source and will not ' +
      'fall back to a retyped copy');
  }
  const block = src.slice(open, shut);
  const re = /escapeHtml\((["'])((?:\\.|(?!\1).)*)\1\)/g;
  const found = [];
  let m;
  while ((m = re.exec(block)) !== null) { found.push(m[2]); }
  if (found.length !== 2) {
    throw new Error('expected exactly 2 escapeHtml sentence literals inside ' +
      'the consent block of app.js and found ' + found.length +
      ' — the card\'s shape changed and this gate would be measuring ' +
      'something other than what it names');
  }
  return found;
}

// The cost sentence lives in server.py and reaches the page over the wire with
// a dollar figure substituted into its ONE slot, so it is matched as
// prefix + $d.dd + suffix rather than pinned whole.
function liftForecastMessage() {
  const src = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const m = src.match(/^FORECAST_MSG = "((?:\\.|[^"])*)"/m);
  if (!m) {
    throw new Error('FORECAST_MSG could not be located in server.py — the ' +
      'cost sentence has no pinned source and this gate will not invent one');
  }
  const slot = /(?<![A-Za-z0-9])x(?![A-Za-z0-9])/;
  const parts = m[1].split(slot);
  if (parts.length !== 2) {
    throw new Error('the owner\'s forecast sentence must carry exactly one ' +
      'slot; splitting on it gave ' + parts.length + ' part(s)');
  }
  return { whole: m[1], head: parts[0], tail: parts[1] };
}

const SENTENCES = liftCardSentences();
const FORECAST = liftForecastMessage();
// The card's first sentence — known in view, the detector's known-good case.
const FIRST_SENTENCE = SENTENCES[0];

// HER OWN UAT WINDOW first, then the two the roster suite already drives.
const VIEWPORTS = [
  { width: 1400, height: 782, hers: true },
  { width: 1280, height: 800, hers: false },
  { width: 1100, height: 800, hers: false }
];

const violations = [];
const backstops = [];
function fail(msg) { violations.push(msg); }
function backstop(msg) { backstops.push(msg); }
function note(msg) { console.log('  ' + msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function click(session, sel) {
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box) { throw new Error('not clickable / not present: ' + sel); }
  const p = JSON.parse(box);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
}

// ONE measurement helper for every arm and every control, so no two readings
// can drift apart. It answers THREE questions, not one:
//   inWindow  — the box lies inside the viewport
//   inClipper — the box lies inside every scrolling/clipping ancestor's
//               visible box (the shipped defect passed inWindow at two
//               viewports and failed this at all three)
//   reachable — document.elementFromPoint at the control's OWN centre lands
//               on it. A control drawn where a tap cannot reach it is not on
//               screen in any sense she would recognise.
const MEASURE = function (sel) {
  return '(function(){' +
    'var el=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!el)return JSON.stringify({found:false});' +
    'var r=el.getBoundingClientRect();' +
    'var clipper=null,walk=el.parentElement;' +
    'while(walk&&walk!==document.body){var cs=getComputedStyle(walk);' +
    ' if((cs.overflowY==="auto"||cs.overflowY==="scroll"||' +
    '     cs.overflowY==="hidden")&&walk.scrollHeight>walk.clientHeight+1){' +
    '  clipper=walk;break;}walk=walk.parentElement;}' +
    'var cr=clipper?clipper.getBoundingClientRect():null;' +
    'var x=r.left+r.width/2,y=r.top+r.height/2;' +
    'var hit=(x>=0&&y>=0&&x<=window.innerWidth&&y<=window.innerHeight)?' +
    ' document.elementFromPoint(x,y):null;' +
    'return JSON.stringify({found:true,' +
    ' text:(el.textContent||"").trim(),' +
    ' nonZero:(r.width>0&&r.height>0),' +
    ' top:Math.round(r.top),bottom:Math.round(r.bottom),' +
    ' winH:window.innerHeight,' +
    ' inWindow:(r.top>=0&&r.bottom<=window.innerHeight),' +
    ' hasClipper:!!clipper,' +
    ' clipTop:cr?Math.round(cr.top):null,' +
    ' clipBottom:cr?Math.round(cr.bottom):null,' +
    ' inClipper:cr?(r.top>=cr.top-1&&r.bottom<=cr.bottom+1):true,' +
    ' reachable:!!hit&&(hit===el||el.contains(hit)),' +
    ' docScrolls:(document.documentElement.scrollHeight>' +
    '   window.innerHeight+1)});})()';
};

async function measure(session, sel) {
  return JSON.parse(await cdp.evaluate(session, MEASURE(sel)));
}

function onScreen(m) { return m.inWindow && m.inClipper && m.reachable; }

// ---- 26.995-27: ONE READING OF THE WHOLE CARD, sentences included ---------
//
// ⛔ WHY THIS IS NOT `MEASURE`. `MEASURE` answers the question the CONTROLS
// need — is this box inside the window, inside its clipper, and does a tap at
// its centre reach it. The shipped defect PASSES all three for the cost
// sentence: at 1400x782 that paragraph lies at 599..687 INSIDE a paper box
// that runs 355..705. It is hidden because an OPAQUE ROW IS PAINTED OVER IT.
// So readability asks two more questions the control reading never did:
//   overlapsDoors — the sentence's own rectangle intersects the pinned row's
//   hitsSelf      — five points down the sentence's own height each reach the
//                   sentence and not something painted above it (a CENTRE-only
//                   hit test would call a HALF-COVERED paragraph fine, which is
//                   exactly the shape her own UAT recorded for the what-is-sent
//                   sentence)
//
// It also returns the box's own numbers — clientHeight, scrollHeight, the
// card's height, and the height of everything in the box that is NOT the card
// — so the run PRINTS the arithmetic instead of asserting over it silently.
const READ_CARD = '(function(){' +
  'var card=document.querySelector(".session-consent");' +
  'if(!card)return JSON.stringify({found:false});' +
  'var spot=card.closest(".station-spot");' +
  'if(!spot)return JSON.stringify({found:false,noSpot:true});' +
  'var scs=getComputedStyle(spot);' +
  'var sr=spot.getBoundingClientRect();' +
  'var bandTop=sr.top+(parseFloat(scs.borderTopWidth)||0);' +
  'var bandBottom=bandTop+spot.clientHeight;' +
  'var doors=card.querySelector(".session-consent-doors");' +
  'var dr=doors?doors.getBoundingClientRect():null;' +
  'var kids=[],i;for(i=0;i<card.children.length;i++){' +
  ' kids.push(card.children[i].tagName);}' +
  'var cr=card.getBoundingClientRect();' +
  'var out={found:true,winH:window.innerHeight,winW:window.innerWidth,' +
  ' k:parseInt(scs.getPropertyValue("--k"),10)||null,' +
  ' childCount:card.children.length,childTags:kids,' +
  ' spotTop:Math.round(sr.top),spotBottom:Math.round(sr.bottom),' +
  ' bandTop:Math.round(bandTop),bandBottom:Math.round(bandBottom),' +
  ' clientHeight:spot.clientHeight,scrollHeight:spot.scrollHeight,' +
  ' scrollTop:Math.round(spot.scrollTop),' +
  ' cardHeight:Math.round(cr.height),' +
  ' nonCardInBox:Math.round(spot.scrollHeight-cr.height),' +
  ' doorsTop:dr?Math.round(dr.top):null,' +
  ' doorsBottom:dr?Math.round(dr.bottom):null,' +
  ' doorsPosition:doors?getComputedStyle(doors).position:null,' +
  ' sentences:[]};' +
  'var ps=card.querySelectorAll(":scope > p");' +
  'for(i=0;i<ps.length;i++){' +
  ' var p=ps[i];' +
  ' if(p.classList.contains("session-consent-doors")){continue;}' +
  ' var r=p.getBoundingClientRect();' +
  ' var x=Math.round(r.left+Math.min(12,r.width/2));' +
  ' var pts=[r.top+2,r.top+r.height*0.25,r.top+r.height*0.5,' +
  '   r.top+r.height*0.75,r.bottom-2];' +
  ' var hits=0,miss=[];' +
  ' for(var j=0;j<pts.length;j++){' +
  '  var y=pts[j];' +
  '  if(x<0||y<0||x>window.innerWidth||y>window.innerHeight){' +
  '   miss.push(Math.round(y)+":offwindow");continue;}' +
  '  var h=document.elementFromPoint(x,y);' +
  '  if(h&&(h===p||p.contains(h))){hits+=1;}' +
  '  else{miss.push(Math.round(y)+":"+(h?(h.className||h.tagName):"null"));}}' +
  ' out.sentences.push({index:i,' +
  '  text:(p.textContent||"").trim(),' +
  '  nonZero:(r.width>0&&r.height>0),' +
  '  top:Math.round(r.top),bottom:Math.round(r.bottom),' +
  '  height:Math.round(r.height),' +
  '  inWindow:(r.top>=0&&r.bottom<=window.innerHeight),' +
  '  inBox:(r.top>=bandTop-1&&r.bottom<=bandBottom+1),' +
  '  overlapsDoors:dr?!(r.bottom<=dr.top+1||r.top>=dr.bottom-1):false,' +
  '  hits:hits,of:pts.length,miss:miss.join(",")});}' +
  'return JSON.stringify(out);})()';

async function readCard(session) {
  return JSON.parse(await cdp.evaluate(session, READ_CARD));
}

// READABLE = in the window, inside the paper's own visible box, not under the
// pinned control row, and reaching itself all the way down. All four, by value.
function readable(s) {
  return s.nonZero && s.inWindow && s.inBox && !s.overlapsDoors &&
    s.hits === s.of;
}

function whyNot(s) {
  const bad = [];
  if (!s.nonZero) { bad.push('zero-sized'); }
  if (!s.inWindow) { bad.push('outside the window'); }
  if (!s.inBox) { bad.push('outside the paper\'s visible box'); }
  if (s.overlapsDoors) { bad.push('OVERLAPPED BY THE PINNED CONTROL ROW'); }
  if (s.hits !== s.of) {
    bad.push('covered at ' + (s.of - s.hits) + ' of ' + s.of +
      ' points down its own height [' + s.miss + ']');
  }
  return bad.join('; ');
}

async function openTheCard(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(2800);
  await click(session, '#room-obj-candle');
  await sleep(1600);
  const there = await cdp.evaluate(session,
    '(function(){return document.querySelector(".session-consent")?"1":"0";})()');
  if (there !== '1') {
    throw new Error('the consent card never rendered after the candle tap — ' +
      'nothing measured after this point would be a reading');
  }
}

(async function main() {
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);

    for (const vp of VIEWPORTS) {
      const at = vp.width + 'x' + vp.height + (vp.hers ? ' (HER WINDOW)' : '');
      const tag = vp.hers ? fail : backstop;
      await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height,
          deviceScaleFactor: 1, mobile: false });
      await openTheCard(session, app.url);
      console.log('--- ' + at + ' ---');

      // ---- CONTROL A: the detector can say IN VIEW ----------------------
      // Measured BEFORE any of the three controls. If the detector cannot
      // say "in view" about the card's own opening sentence, which plainly
      // is, nothing below means anything.
      const first = await measure(session, '.session-consent p');
      if (!first.found || !first.nonZero) {
        tag('[control A] ' + at + ': the card\'s first sentence was not ' +
          'found at a non-zero size — the detector was never shown a ' +
          'known-good case');
      } else if (first.text.indexOf(FIRST_SENTENCE) !== 0) {
        tag('[control A] ' + at + ': the card\'s first sentence is not the ' +
          'pinned one — measured "' + first.text.slice(0, 60) + '"');
      } else if (!onScreen(first)) {
        tag('[control A] THE DETECTOR IS ALWAYS-FAIL at ' + at + ': it ' +
          'reports the card\'s own opening sentence as off screen ' +
          '(top ' + first.top + ', bottom ' + first.bottom + ', window ' +
          first.winH + ', inWindow ' + first.inWindow + ', inClipper ' +
          first.inClipper + ', reachable ' + first.reachable + ')');
      } else {
        note('control A: the card\'s opening sentence IS on screen ' +
          '(top ' + first.top + ' bottom ' + first.bottom +
          ' window ' + first.winH + ')');
      }

      // ---- CONTROL B: the detector can say OUT OF VIEW -------------------
      // A probe is planted one window below the fold. The SAME detector must
      // call it out of view, or a detector that answers "on screen" for
      // everything would carry the three arms below.
      await cdp.evaluate(session,
        '(function(){var d=document.getElementById("gate-offscreen-probe");' +
        'if(!d){d=document.createElement("div");d.id="gate-offscreen-probe";' +
        'd.textContent="probe";d.style.position="fixed";' +
        'd.style.left="10px";d.style.width="40px";d.style.height="20px";' +
        'd.style.top=(window.innerHeight+200)+"px";' +
        'document.body.appendChild(d);}return "1";})()');
      const probe = await measure(session, '#gate-offscreen-probe');
      if (!probe.found) {
        tag('[control B] ' + at + ': the out-of-view probe was not planted, ' +
          'so the detector was never shown a known-bad case');
      } else if (onScreen(probe)) {
        tag('[control B] THE DETECTOR IS ALWAYS-PASS at ' + at + ': it ' +
          'reports a probe planted ' + (probe.top - probe.winH) + 'px below ' +
          'the window as on screen. Every arm below is vacuous.');
      } else {
        note('control B: a probe below the fold IS reported off screen ' +
          '(top ' + probe.top + ', window ' + probe.winH + ')');
      }
      await cdp.evaluate(session,
        '(function(){var d=document.getElementById("gate-offscreen-probe");' +
        'if(d)d.remove();return "1";})()');

      // ---- 26.995-27: CAN SHE READ WHAT THE CARD SAYS? -------------------
      //
      // ⛔ THE COUNT AND THE COST LINE ARE ASSERTED BEFORE ONE PIXEL IS
      // JUDGED. `forecastLineHtml()` returns the empty string when the room
      // cannot price the model, and a run that opened the card in that state
      // would find two readable paragraphs, go green, and never notice that
      // the cost disclosure was not on screen at all.
      const card = await readCard(session);
      if (!card.found) {
        tag('[card] ' + at + ': the consent card was not found for the ' +
          'readability arm' + (card.noSpot ? ' (no .station-spot ancestor)' :
            ''));
      } else {
        note('the paper box: ' + card.spotTop + '..' + card.spotBottom +
          ' clientHeight=' + card.clientHeight +
          ' scrollHeight=' + card.scrollHeight +
          ' (overflow ' + (card.scrollHeight - card.clientHeight) + ')' +
          ' scrollTop=' + card.scrollTop +
          ' :: .session-consent height=' + card.cardHeight +
          ', everything else in the box=' + card.nonCardInBox +
          ' :: window ' + card.winW + 'x' + card.winH + ' --k=' + card.k);
        note('the control row: ' + card.doorsTop + '..' + card.doorsBottom +
          ' (position: ' + card.doorsPosition + ')');

        if (card.childCount !== 4) {
          tag('[card] ' + at + ': .session-consent holds ' + card.childCount +
            ' children [' + card.childTags.join(',') + '] and the card is ' +
            'FOUR paragraphs — three sentences and the control row. A ' +
            'paragraph silently lost or gained is not a smaller card, it is ' +
            'a disclosure that stopped being made.');
        } else {
          note('the card holds the literal 4 paragraphs it is meant to');
        }

        const said = card.sentences.map(function (s) { return s.text; });
        // sentence 1 and 2, byte-compared against what app.js ships.
        for (let i = 0; i < 2; i++) {
          if (said[i] !== SENTENCES[i]) {
            tag('[card] ' + at + ': the card\'s sentence ' + (i + 1) +
              ' reads "' + String(said[i]).slice(0, 70) + '" and app.js ' +
              'ships "' + SENTENCES[i].slice(0, 70) + '". This gate lifts ' +
              'her words from the source it measures; a mismatch means the ' +
              'page and the source disagree, and neither is trusted after ' +
              'that.');
          }
        }
        // ⛔ THE COST LINE, PRESENT AND NON-EMPTY, BY VALUE.
        const cost = said[2];
        const okCost = typeof cost === 'string' && cost.length > 0 &&
          cost.indexOf(FORECAST.head) === 0 &&
          cost.slice(FORECAST.head.length).endsWith(FORECAST.tail) &&
          /^\$\d+\.\d{2}$/.test(cost.slice(FORECAST.head.length,
            cost.length - FORECAST.tail.length));
        if (!okCost) {
          tag('[cost] ' + at + ': THE COST SENTENCE IS NOT ON THE CARD. It ' +
            'read ' + JSON.stringify(String(cost).slice(0, 90)) + ' and the ' +
            'owner\'s sentence in server.py is ' +
            JSON.stringify(FORECAST.whole) + ' with a $d.dd figure in its ' +
            'slot. forecastLineHtml() renders NOTHING when the room cannot ' +
            'price the model — a readability verdict taken in that state ' +
            'would be measuring two paragraphs and calling it three.');
        } else {
          note('the cost sentence is present and non-empty: "' +
            cost.slice(0, 62) + '…"');
        }

        // ---- CONTROL C: the readability detector can say NOT READABLE ----
        // An opaque cover is planted over the card's FIRST sentence — the one
        // control A has just reported in view. The same detector must call it
        // unreadable, or every sentence verdict below is vacuous.
        await cdp.evaluate(session,
          '(function(){var p=document.querySelector(".session-consent p");' +
          'if(!p)return "0";var r=p.getBoundingClientRect();' +
          'var d=document.getElementById("gate-cover-probe");' +
          'if(!d){d=document.createElement("div");d.id="gate-cover-probe";' +
          'document.body.appendChild(d);}' +
          'd.style.cssText="position:fixed;z-index:99999;background:#fff;"+' +
          '"left:"+r.left+"px;top:"+r.top+"px;width:"+r.width+"px;height:"+' +
          'r.height+"px";return "1";})()');
        const covered = await readCard(session);
        const c0 = covered.found ? covered.sentences[0] : null;
        await cdp.evaluate(session,
          '(function(){var d=document.getElementById("gate-cover-probe");' +
          'if(d)d.remove();return "1";})()');
        if (!c0) {
          tag('[control C] ' + at + ': the card vanished while the cover ' +
            'probe was planted — the readability detector was never shown a ' +
            'known-bad case');
        } else if (readable(c0)) {
          tag('[control C] THE READABILITY DETECTOR IS ALWAYS-PASS at ' + at +
            ': an opaque cover was laid exactly over the card\'s first ' +
            'sentence and the detector still calls it readable (' + c0.hits +
            ' of ' + c0.of + ' points reached it). Every sentence verdict ' +
            'below is vacuous.');
        } else {
          note('control C: a sentence under an opaque cover IS reported ' +
            'unreadable (' + c0.hits + ' of ' + c0.of + ' points reached it)');
        }

        // ---- THE VERDICT, one sentence at a time, every number printed ---
        const after = await readCard(session);
        (after.found ? after.sentences : []).forEach(function (s, i) {
          note('sentence ' + (i + 1) + ': top=' + s.top + ' bottom=' +
            s.bottom + ' height=' + s.height + ' box=' + after.bandTop + '..' +
            after.bandBottom + ' window=' + s.top + '..' + after.winH +
            ' row=' + after.doorsTop + '..' + after.doorsBottom +
            ' :: inWindow=' + s.inWindow + ' inBox=' + s.inBox +
            ' underTheRow=' + s.overlapsDoors + ' reachesItself=' + s.hits +
            '/' + s.of + ' :: "' + s.text.slice(0, 46) + '…"');
          if (!readable(s)) {
            const short = s.top >= after.doorsTop ?
              (s.bottom - after.doorsTop) :
              (s.bottom - Math.min(after.bandBottom, after.doorsTop));
            tag('[sentence] ' + at + ': SENTENCE ' + (i + 1) + ' CANNOT BE ' +
              'READ AT REST — ' + whyNot(s) + '. It runs ' + s.top + '..' +
              s.bottom + '; the paper shows ' + after.bandTop + '..' +
              after.bandBottom + ' and the control row is pinned over ' +
              after.doorsTop + '..' + after.doorsBottom + ', so ' +
              Math.max(0, short) + 'px of it is behind something. ' +
              (after.scrollHeight > after.clientHeight ?
                'The only way to it is scrolling INSIDE this paper box, ' +
                'which carries no sign that it holds anything more' :
                'Nothing scrolls here at all') + '. The sentence reads "' +
              s.text.slice(0, 64) + '…"');
          }
        });
      }

      // ---- THE THREE CONTROLS -------------------------------------------
      for (const [sel, label] of DOORS) {
        const m = await measure(session, sel);
        if (!m.found || !m.nonZero) {
          tag('[door] ' + at + ': ' + sel + ' is absent or zero-sized — a ' +
            'missing positive control, not a clean measurement');
          continue;
        }
        if (m.text !== label) {
          tag('[door] ' + at + ': ' + sel + ' reads "' + m.text + '" and ' +
            'the pinned label is "' + label + '". This file measures WHERE ' +
            'her three controls are and never what they say; a changed ' +
            'label is a copy change and is hers.');
          continue;
        }
        // ⚠ READ `inPaper` HONESTLY. `MEASURE` only names an ancestor as a
        // clipper while it actually overflows; once 26.995-27 removed the
        // overflow there is NO clipping ancestor, `paperBottom` reads null and
        // `inPaper` is true because nothing can clip. That is the right
        // semantics and it is a WEAKER statement than it was under 26.995-22 —
        // written down here so nobody credits it with more. What holds the
        // controls on screen now is `inWindow` plus the content fitting, and
        // the drill's `the-paper-grows-past-her-window-instead-of-widening`
        // mutant is what proves it.
        note(sel + ': top=' + m.top + ' bottom=' + m.bottom +
          ' window=' + m.winH + ' paperBottom=' + m.clipBottom +
          (m.hasClipper ? '' : ' (no clipping ancestor — nothing overflows)') +
          ' inWindow=' + m.inWindow + ' inPaper=' + m.inClipper +
          ' reachable=' + m.reachable);
        if (!onScreen(m)) {
          tag('[door] ' + at + ': "' + label + '" is NOT on screen — ' +
            'top ' + m.top + ', bottom ' + m.bottom + ', window ' + m.winH +
            ', paper box ' + m.clipTop + '..' + m.clipBottom +
            ' :: inWindow ' + m.inWindow + ', inPaper ' + m.inClipper +
            ', reachable ' + m.reachable + '. The page itself ' +
            (m.docScrolls ? 'scrolls' : 'DOES NOT SCROLL') + '.');
        }
      }

      // ---- THE TAB ORDER, and where focus lands after she answers -------
      // A backstop at every size (26.995-UI-SPEC § 11). It reports rather
      // than blocks: a keyboard finding is real and is not this gap.
      const order = await cdp.evaluate(session,
        '(function(){var d=document.querySelectorAll(".session-consent ' +
        'button");var out=[];for(var i=0;i<d.length;i++){' +
        'out.push((d[i].textContent||"").trim());}return out.join("|");})()');
      const want = DOORS.map(function (d) { return d[1]; }).join('|');
      if (order !== want) {
        backstop('[tab] ' + at + ': the card\'s controls are in document ' +
          'order "' + order + '" and the natural order is "' + want + '"');
      } else {
        note('tab order: the three controls stand in natural order');
      }
      let reached = 0;
      await cdp.evaluate(session,
        '(function(){document.querySelector(".session-stage").' +
        'setAttribute("tabindex","-1");' +
        'document.querySelector(".session-stage").focus();return "1";})()');
      for (let i = 0; i < 12; i++) {
        await cdp.send(session, 'Input.dispatchKeyEvent',
          { type: 'keyDown', key: 'Tab', code: 'Tab',
            windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
        await cdp.send(session, 'Input.dispatchKeyEvent',
          { type: 'keyUp', key: 'Tab', code: 'Tab',
            windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
        const cls = await cdp.evaluate(session,
          '(function(){var a=document.activeElement;' +
          'return a?(a.className||a.tagName):"none";})()');
        if (cls.indexOf('session-consent-') !== -1) { reached += 1; }
        if (reached === 3) { break; }
      }
      if (reached !== 3) {
        backstop('[tab] ' + at + ': only ' + reached + ' of the three ' +
          'controls were reached by tabbing from the card');
      } else {
        note('tab: all three controls reached by keyboard');
      }
      await click(session, '.session-consent-later');
      await sleep(600);
      const settled = await cdp.evaluate(session,
        '(function(){var a=document.activeElement;' +
        'return a&&a!==document.body?"1":"0";})()');
      if (settled !== '1') {
        backstop('[tab] ' + at + ': after the card is answered focus fell ' +
          'to the document body — a screen reader is left with no place');
      } else {
        note('tab: focus lands somewhere stable once the card is answered');
      }
    }

    // ---- THE MUTATION DRILL, EACH MUTANT PROVEN PLANTED ----------------
    //
    // ⛔⛔ A MUTATION THAT NEVER APPLIED READS EXACTLY LIKE A GATE THAT DOES
    // NOT HOLD — both print "SURVIVED". So each mutant here is proven to
    // have CHANGED THE LIVE PAGE before its verdict is read, by reading the
    // computed property back out of Chrome and asserting it moved. An
    // unplanted mutant is a hard failure naming itself, never a verdict.
    //
    // ⛔ NOTHING ON DISK IS TOUCHED. The mutants are stylesheet overrides
    // injected into the running page and removed again; tokens.css is never
    // written. Another live session holds uncommitted work in this repo.
    //
    // ⛔ NO SCORE IS READ UNTIL THE UNMUTATED PAGE IS CLEAN.
    if (violations.length === 0) {
      await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
        { width: 1400, height: 782, deviceScaleFactor: 1, mobile: false });
      await openTheCard(session, app.url);
      console.log('--- mutation drill @ 1400x782 (HER WINDOW) ---');

      const plant = async function (css) {
        await cdp.evaluate(session,
          '(function(){var s=document.getElementById("gate-mutant");' +
          'if(!s){s=document.createElement("style");s.id="gate-mutant";' +
          'document.head.appendChild(s);}s.textContent=' +
          JSON.stringify(css) + ';return "1";})()');
      };
      const lift = async function () {
        await cdp.evaluate(session,
          '(function(){var s=document.getElementById("gate-mutant");' +
          'if(s)s.remove();return "1";})()');
      };
      const prop = async function (sel, name) {
        return await cdp.evaluate(session,
          '(function(){var n=document.querySelector(' + JSON.stringify(sel) +
          ');if(!n)return "MISSING";return getComputedStyle(n)[' +
          JSON.stringify(name) + '];})()');
      };
      const doorsOnScreen = async function () {
        let n = 0;
        for (const [sel] of DOORS) {
          const m = await measure(session, sel);
          if (m.found && m.nonZero && onScreen(m)) { n += 1; }
        }
        return n;
      };
      // 26.995-27: the second arm's score — how many of her three sentences
      // can be READ at rest. A mutant declares which arm it must kill.
      const sentencesReadable = async function () {
        const c = await readCard(session);
        if (!c.found) { return -1; }
        return c.sentences.filter(readable).length;
      };

      const SPOT = '.station-spot.session-live';
      const DOORS_ROW = '.session-consent-doors';
      const MUTANTS = [
        { name: 'the-overlap-is-restored-exactly-as-it-shipped',
          css: SPOT + ':has(.session-consent){' +
            'max-height:calc(110 * var(--k) * 1px) !important;' +
            'width:calc(150 * var(--k) * 1px) !important;}',
          sel: SPOT, prop: 'maxHeight', was: 'none',
          arm: 'sentences',
          why: 'THE SHIPPED DEFECT, EXACTLY — the paper goes back to a 348px ' +
            'box holding 450px of card, and the opaque control row is pinned ' +
            'over the cost sentence again. If this survives, the readability ' +
            'arm is not measuring whether her disclosures can be read.',
          mustDie: true },
        { name: 'the-cap-comes-back-and-the-row-pins-again',
          css: SPOT + ':has(.session-consent){' +
            'max-height:calc(110 * var(--k) * 1px) !important;}',
          sel: SPOT, prop: 'maxHeight', was: 'none',
          arm: 'sentences',
          why: 'THE OTHER HALF OF THE FIX, ON ITS OWN. The widening is left in ' +
            'place and only the cap comes back: 391px of card in a 348px box, ' +
            'so the row pins again and eats the bottom of the cost sentence. ' +
            'It is a DIFFERENT mechanism from the mutant above, which restores ' +
            'the width too — and it is here because a gate that only ever ' +
            'saw both halves reverted together could not say which half is ' +
            'load-bearing for her sentences. If this survives, releasing the ' +
            'cap is doing nothing and the rule should lose it.',
          mustDie: true },
        { name: 'the-paper-grows-past-her-window-instead-of-widening',
          css: SPOT + ':has(.session-consent){' +
            'width:calc(150 * var(--k) * 1px) !important;}',
          sel: SPOT, prop: 'width', was: '480px',
          arm: 'doors',
          why: 'THE REGRESSION THIS FIX MUST NOT CAUSE. With the cap released ' +
            'but the paper left at its old width the box runs 355..807 and ' +
            'the control row lands at 693..791 — past a 782px window. That is ' +
            'the defect 26.995-22 was written to fix, and it proves the WIDTH ' +
            'is load-bearing for the controls and not only for the text. ' +
            '⚠ The width is pinned as 480px because this drill runs at one ' +
            'viewport, 1400x782, where --k is 3; a reverted fix reads 450px ' +
            'and fails here as NOT PLANTED, naming itself.',
          mustDie: true },
        { name: 'KNOWN-NEGATIVE-the-row-is-given-a-different-backdrop',
          css: DOORS_ROW + '{background:transparent !important;}',
          sel: DOORS_ROW, prop: 'backgroundColor', was: null,
          arm: 'doors',
          why: 'MUST SURVIVE. This file measures WHERE her three controls ' +
            'are and whether a tap reaches them — never how they are ' +
            'painted. A mutant dying here would mean the gate reddens on ' +
            'any stylesheet change at all, which is not a measurement.',
          mustDie: false },
        { name: 'KNOWN-NEGATIVE-her-sentences-are-given-a-different-ink',
          css: '.session-consent p{color:#7a5c3a !important;}',
          sel: '.session-consent p', prop: 'color', was: null,
          arm: 'sentences',
          why: 'MUST SURVIVE, and it is the sentence arm\'s OWN known-negative ' +
            'rather than a borrowed one. The readability arm measures WHERE ' +
            'her sentences are and whether anything is painted over them — ' +
            'never what colour they are set in. A gate that reddened here ' +
            'would redden on any stylesheet change at all.',
          mustDie: false },
        { name: 'KNOWN-NEGATIVE-RECLASSIFIED-the-control-row-stops-being-pinned',
          css: DOORS_ROW + '{position:static !important;}',
          sel: DOORS_ROW, prop: 'position', was: 'sticky',
          arm: 'doors',
          why: '⚠⚠ THIS WAS A MUST-DIE MUTANT UNDER 26.995-22 AND IT IS NOW A ' +
            'KNOWN-NEGATIVE. ⛔ THAT IS A MEASURED RECLASSIFICATION, NOT A RED ' +
            'FLIPPED TO GREEN FOR CONVENIENCE, and the measurement is this: ' +
            "once 26.995-27 removed the overflow (scrollHeight == clientHeight " +
            'at all three viewports this file drives), the sticky pin has ' +
            'NOTHING LEFT TO PIN. Driven with the pin removed, all three ' +
            'controls still measure on screen — so the pin is no longer what ' +
            'holds them there; the content fitting the paper is. The rule ' +
            'stays in tokens.css as a backstop for any state this file does ' +
            'not drive, and the mutant stays here, surviving on purpose, ' +
            'as the standing proof that it is inert. ⛔ If the pin ever ' +
            'becomes load-bearing again it will be because something ' +
            'overflows again — and THAT is caught by the sentence arm above, ' +
            'not by this mutant.',
          mustDie: false }
      ];

      const baseline = await doorsOnScreen();
      const baseRead = await sentencesReadable();
      if (baseline !== 3 || baseRead !== 3) {
        fail('[drill] the drill opened on a page where ' + baseline +
          ' of the three controls were on screen and ' + baseRead +
          ' of her three sentences were readable — no verdict below would ' +
          'mean anything');
      } else {
        let planted = 0; let killed = 0; let survived = 0;
        for (const m of MUTANTS) {
          const before = await prop(m.sel, m.prop);
          if (m.was !== null && before !== m.was) {
            fail('[drill] MUTANT NOT PLANTED — "' + m.name + '" expected to ' +
              'change ' + m.prop + ' on ' + m.sel + ' from "' + m.was +
              '" but the shipped page already reads "' + before + '". Its ' +
              'verdict was NOT read: re-anchor it against tokens.css ' +
              'deliberately.');
            continue;
          }
          await plant(m.css);
          const after = await prop(m.sel, m.prop);
          if (after === before) {
            await lift();
            fail('[drill] MUTANT NOT PLANTED — "' + m.name + '" left ' +
              m.prop + ' on ' + m.sel + ' at "' + after + '". A mutation ' +
              'that never applied reads exactly like a gate that does not ' +
              'hold, so no verdict was read.');
            continue;
          }
          planted += 1;
          note('[drill] planted ' + m.name + ' :: ' + m.prop + ' "' + before +
            '" -> "' + after + '"');
          // BOTH arms are scored for every mutant; the mutant declares which
          // one it is aimed at, so a mutant that happens to break the other
          // arm cannot be mistaken for a hit on its own.
          const stillDoors = await doorsOnScreen();
          const stillRead = await sentencesReadable();
          const still = m.arm === 'sentences' ? stillRead : stillDoors;
          const what = m.arm === 'sentences' ?
            'of her 3 sentences readable' : 'of 3 controls on screen';
          await lift();
          const backDoors = await doorsOnScreen();
          const backRead = await sentencesReadable();
          if (backDoors !== 3 || backRead !== 3) {
            fail('[drill] the page did not come back after "' + m.name +
              '" was lifted — ' + backDoors + ' of 3 controls on screen and ' +
              backRead + ' of 3 sentences readable, so every later reading ' +
              'is contaminated');
          }
          if (still < 3) {
            killed += 1;
            if (!m.mustDie) {
              fail('[drill] the KNOWN-NEGATIVE "' + m.name + '" was caught ' +
                '(' + still + ' ' + what + '). This gate reddened on a ' +
                'change it has no business seeing.');
            } else {
              note('[drill] KILLED   ' + m.name + ' :: ' + still + ' ' +
                what + ' (other arm: ' +
                (m.arm === 'sentences' ? stillDoors + ' of 3 controls' :
                  stillRead + ' of 3 sentences') + ')');
            }
          } else {
            survived += 1;
            if (m.mustDie) {
              fail('[drill] MUTANT SURVIVED — "' + m.name + '" was PROVEN ' +
                'PLANTED (' + m.prop + ' "' + before + '" -> "' + after +
                '") and all three still measured good on its own arm (' +
                still + ' ' + what + '). ' + m.why);
            } else {
              note('[drill] SURVIVED (as required) ' + m.name + ' :: ' +
                stillDoors + ' of 3 controls on screen, ' + stillRead +
                ' of 3 sentences readable');
            }
          }
        }
        console.log('[drill] consent-card mutants: planted ' + planted +
          '/' + MUTANTS.length + ', killed ' + killed + ', survived ' +
          survived + ' (of which ' +
          MUTANTS.filter(function (m) { return !m.mustDie; }).length +
          ' known-negative(s) MUST survive; ' +
          MUTANTS.filter(function (m) { return m.arm === 'sentences'; }).length +
          ' aimed at the sentence arm, ' +
          MUTANTS.filter(function (m) { return m.arm === 'doors'; }).length +
          ' at the controls)');
      }
    }


    // ---- 26.995-28: CAN A PERSON FINISH A SITTING AT THE SHIPPED CLOCK? ---
    //
    // ⛔⛔ THE POINT OF THIS BLOCK, AND WHY ITS ANSWER IS ALLOWED TO BE "NO".
    //
    // A fake-clock arm is not evidence that a person can finish a sitting.
    // The only run that has ever reached a reflection in this phase did so
    // at a clock SIXTEEN TIMES the shipped one, in a throwaway export. So
    // this drives a real browser at HER window, at the SHIPPED, UNMODIFIED
    // 45-second clock, from the candle tap to whatever ending arrives — and
    // prints the wall-clock time of every stage.
    //
    // ⚠ THE TRAP THAT WOULD MAKE IT WORTHLESS: this harness serves a
    // three-item synthetic library in a temp dir. Its re-pull returns in
    // well under a second, so the run would sail through and prove nothing
    // about HER evening. ⛔ SO THE RE-PULL IS DELAYED to the duration
    // measured off her own log — 27 seconds between her tap and the first
    // thing she could act on. That delay is a TESTING ARTIFACT, it is
    // stated by value here, it is written into the artifacts file, and it
    // is attached to every finding this block produces.
    //
    // ⛔ THE SHIPPED CLOCK IS NOT TOUCHED. app.js keeps SESSION_BOUND_MS at
    // 45000; that value is pinned by value in tests/test_session_flow.cjs
    // § 7 and is asserted here off the served source before the run starts.
    //
    // ⛔ HER BEAT-3 ANSWER (`Just stop the wrong words`) DOES NOT MAKE AN
    // EVENING FINISHABLE, AND SHE WAS TOLD SO BEFORE SHE CHOSE IT. This run
    // is the honest record of that: it is EXPECTED to end without a
    // reflection. What it asserts is that the ending is no longer a
    // falsehood — the room does not blame a librarian it never asked, and
    // what it says instead is one of HER OWN two sentences.
    if (violations.length === 0) {
      const HER_FETCH_DELAY_MS = 27000;   // artifact, stated by value
      const WATCH_MS = 62000;             // past the shipped 45s bound
      const LIVE_CHECK_MS = 30000;        // before it, to prove no crash

      // Her two sentences, LIFTED from the source this run serves. ⚠ THIS
      // BLOCK CANNOT DETECT A REWORD — same limitation the rest of this
      // file carries and states. The anti-reword gate is the byte-pin in
      // tests/test_session_flow.cjs § 3, which holds both sentences against
      // 26.995-COPY.md's own record.
      const appSrcE2E = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
      const liftLit = function (name) {
        const m = new RegExp('var ' + name + ' = ([^\\n]*);').exec(appSrcE2E);
        if (!m) { return null; }
        const t = m[1].trim();
        if (t === 'null') { return null; }
        const q = t[0];
        if ((q !== "'" && q !== '"') || t[t.length - 1] !== q) { return null; }
        return t.slice(1, -1);
      };
      const HER_WAITED = liftLit('SESSION_WAITED_LINE');
      const HER_WALK = liftLit('SESSION_WALK_WAITED_LINE');
      const BLAMING = liftLit('SESSION_BOUND_LINE');
      const msM = /var SESSION_BOUND_MS = (\d+);/.exec(appSrcE2E);
      const SHIPPED_MS = msM ? Number(msM[1]) : -1;

      console.log('--- the shipped clock, end to end @ 1400x782 (HER ' +
        'WINDOW) ---');
      console.log('  the clock this run uses: ' + SHIPPED_MS + 'ms, read ' +
        'out of the served app.js and NOT modified');
      console.log('  ⚠ TESTING ARTIFACT: the re-pull is delayed by ' +
        HER_FETCH_DELAY_MS + 'ms to stand in for the ~27s her own library ' +
        'took. ⛔ Its EFFECT is counted below, not assumed: on a harness ' +
        'with no connected source there is no re-pull to slow, and the ' +
        'run then proves something narrower — which it says.');

      if (SHIPPED_MS !== 45000) {
        fail('[e2e] the served app.js carries SESSION_BOUND_MS = ' +
          SHIPPED_MS + '. This block only means anything at the SHIPPED ' +
          'value; a run at a raised clock is the artifact that made a ' +
          'reflection look reachable once already.');
      }
      if (!HER_WAITED || !HER_WALK || !BLAMING) {
        fail('[e2e] one of the three sentences could not be lifted from ' +
          'the served source (waiting ' + JSON.stringify(HER_WAITED) +
          ', walk ' + JSON.stringify(HER_WALK) + ', bound ' +
          JSON.stringify(BLAMING) + ') — nothing below would be a reading');
      } else {
        await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
          { width: 1400, height: 782, deviceScaleFactor: 1, mobile: false });

        // The delay rides the page's own fetch, installed before the
        // document exists so the very first call is covered.
        const DELAY_SCRIPT =
          '(function(){var orig=window.fetch;window.__gsdDelayed=[];' +
          'window.fetch=function(input,init){var u=(typeof input==="string")' +
          '?input:((input&&input.url)||"");' +
          'if(u.indexOf("/api/adapter/collect")!==-1){' +
          'window.__gsdDelayed.push(u);' +
          'return new Promise(function(res,rej){setTimeout(function(){' +
          'orig.call(window,input,init).then(res,rej);},' +
          HER_FETCH_DELAY_MS + ');});}' +
          'return orig.apply(window,arguments);};})();';
        // ⚠ Page.enable FIRST. Page.navigate happens to work without it and
        // Page.addScriptToEvaluateOnNewDocument does not — measured, not
        // assumed: the first cut of this block reported the delay as not
        // installed, which is exactly the refusal it is built to make.
        await cdp.send(session, 'Page.enable', {});
        const installed = await cdp.send(session,
          'Page.addScriptToEvaluateOnNewDocument', { source: DELAY_SCRIPT });

        await cdp.send(session, 'Page.navigate', { url: app.url });
        await sleep(3000);

        // ⛔ THE ARTIFACT IS PROVEN INSTALLED BEFORE ITS RUN IS READ. A
        // delay that never applied reads exactly like a fetch that was
        // fast — and this whole block would then be a run over the
        // harness's own tiny library, reported as hers.
        const patched = await cdp.evaluate(session,
          '(function(){return (window.fetch+"").indexOf("__gsdDelayed")' +
          '!==-1?"1":"0";})()');
        if (patched !== '1') {
          fail('[e2e] THE DELAY WAS NOT INSTALLED (identifier ' +
            (installed && installed.identifier) + '). The run below would ' +
            "be over this harness's three-item library at full speed and " +
            'would say nothing about her evening — refusing to report it.');
        } else {
          const t0 = Date.now();
          await click(session, '#room-obj-candle');
          const el = function (ms) { return ((Date.now() - t0 - ms) / 1000); };
          const stages = [];
          const seen = {};
          let liveAt30 = null;
          let ending = null;
          let reflection = false;
          const READ = '(function(){' +
            'var q=document.querySelector(".session-quiet");' +
            'return JSON.stringify({' +
            'card:!!document.querySelector(".session-consent"),' +
            'walk:!!document.querySelector(".session-walk-open"),' +
            'walkClose:!!document.querySelector(".session-walk-close"),' +
            'paper:!!document.querySelector(".session-paper"),' +
            'quiet:q?q.textContent:null,' +
            'delayed:(window.__gsdDelayed||[]).length});})()';
          while (Date.now() - t0 < WATCH_MS) {
            const raw = await cdp.evaluate(session, READ);
            let s = null;
            try { s = JSON.parse(raw); } catch (e) { s = null; }
            if (s) {
              ['card', 'walk', 'walkClose', 'paper'].forEach(function (k) {
                if (s[k] && !seen[k]) {
                  seen[k] = true;
                  stages.push(k + ' @ +' +
                    ((Date.now() - t0) / 1000).toFixed(1) + 's');
                }
              });
              if (s.paper) { reflection = true; }
              if (s.quiet && !ending) {
                ending = s.quiet;
                stages.push('an ending @ +' +
                  ((Date.now() - t0) / 1000).toFixed(1) + 's');
              }
            }
            if (liveAt30 === null && Date.now() - t0 >= LIVE_CHECK_MS) {
              liveAt30 = { quiet: s ? s.quiet : 'UNREADABLE',
                at: ((Date.now() - t0) / 1000).toFixed(1) };
            }
            if (ending) { break; }
            await sleep(500);
          }
          const delayedCount = await cdp.evaluate(session,
            '(function(){return String((window.__gsdDelayed||[]).length);})()');

          console.log('  the sitting, stage by stage: ' +
            (stages.length ? stages.join(' | ') : 'nothing painted at all'));
          console.log('  re-pull calls that took the delay: ' + delayedCount);

          // ⛔⛔ THE ARTIFACT IS CHECKED FOR EFFECT, NOT ONLY FOR
          // INSTALLATION — and this is the finding, not a detail.
          //
          // MEASURED 2026-08-22: this count comes back ZERO. The harness's
          // synthetic library has no connected source, so the room makes NO
          // re-pull call at all and the 27-second delay never applies to
          // anything. ⛔ SO THIS RUN DOES NOT REPRODUCE HER ARITHMETIC, and
          // it says so out loud rather than letting the delay's presence in
          // the log read as its effect. A delay that never fired reads
          // exactly like a fetch that was fast.
          //
          // ⛔ WHAT THE RUN DOES PROVE, NARROWLY AND FOR REAL: at the
          // SHIPPED 45-second clock, in a real browser at her own window
          // size, a sitting sitting on the consent card ends at the bound
          // with HER OWN SENTENCE and not with the librarian blamed. That
          // is the moment 26.995-22 built a route for and left wordless,
          // and it is now driven end to end.
          //
          // ⛔ WHAT IT DOES NOT REACH: her blessing walk. This harness
          // never opens one, so beat 4 has FUNCTION-LEVEL evidence only
          // (tests/test_session_flow.cjs § 7b ARM 1c and § 7d). The two
          // kinds of evidence are kept apart deliberately — a fake-clock
          // arm is not evidence that a person can finish a sitting.
          if (Number(delayedCount) === 0) {
            backstop('[e2e] THE 27s ARTIFACT NEVER APPLIED: this harness ' +
              'made 0 re-pull calls, so this run does NOT reproduce her ' +
              'measured fetch. It is a real reading of the SHIPPED clock ' +
              'on the consent-card moment, and nothing more. Reproducing ' +
              'her arithmetic needs a fixture with a connected source, ' +
              'which this harness does not build.');
          } else {
            note('the 27s artifact applied to ' + delayedCount +
              ' re-pull call(s) — this run reproduces her fetch duration');
          }

          // CONTROL: the sitting was still LIVE before the bound. Without
          // this, an ending seen at +45s could be a crash at +2s that
          // nobody watched arrive.
          if (!liveAt30 || liveAt30.quiet) {
            fail('[e2e] CONTROL: at +' +
              (liveAt30 ? liveAt30.at : '?') + 's — BEFORE the ' +
              SHIPPED_MS + 'ms bound — the sitting had already ended (' +
              JSON.stringify(liveAt30 && liveAt30.quiet) + '). The ending ' +
              'this block reports would not be the clock, so nothing below ' +
              'is a reading of the clock.');
          } else {
            note('control: at +' + liveAt30.at + 's the sitting was still ' +
              'live — the ending below is the clock, not a crash');
          }

          if (!ending) {
            fail('[e2e] no ending arrived within ' + (WATCH_MS / 1000) +
              's of the tap. The bound is ' + SHIPPED_MS + 'ms, so the ' +
              'sitting should have ended one way or another — either the ' +
              'clock did not fire or the room said nothing at all.');
          } else {
            console.log('  what the room said: ' + JSON.stringify(ending));

            // (1) ⛔ THE FALSEHOOD IS GONE.
            if (ending.indexOf(BLAMING) !== -1) {
              fail('[e2e] ⛔⛔ THE ROOM BLAMED THE LIBRARIAN AT THE SHIPPED ' +
                'CLOCK, IN A REAL BROWSER, ON A PATH WHERE NO LIBRARIAN WAS ' +
                'ASKED. This is the sentence her own sitting got on ' +
                '2026-08-21.');
            }
            // (2) ⛔ WHAT IT SAYS INSTEAD IS ONE OF HER OWN TWO SENTENCES.
            const hers = (ending.indexOf(HER_WAITED) !== -1) ? 'W-3 (the ' +
              'room was waiting for her answer)' :
              (ending.indexOf(HER_WALK) !== -1) ? 'W-5 (she was in her ' +
                'blessing walk)' : null;
            if (!hers) {
              fail('[e2e] ⛔ THE ENDING IS NOT ONE OF HER SENTENCES: ' +
                JSON.stringify(ending) + '. Only W-3 and W-5 may end a ' +
                'sitting the room gave up on while waiting for her, and no ' +
                'agent may write, choose or reuse another.');
            } else {
              note('the ending is HERS — ' + hers);
            }
          }

          // (3) ⛔ AND THE ANSWER TO THE QUESTION IN THE HEADING IS NO —
          //     ASSERTED, NOT GLOSSED.
          if (reflection) {
            fail('[e2e] a reflection ARRIVED at the shipped clock with the ' +
              're-pull delayed to her measured ' +
              (HER_FETCH_DELAY_MS / 1000) + 's. That contradicts the ' +
              'arithmetic this plan was built on, and it would mean her ' +
              'beat-3 cost was stated to her wrongly — do not accept it as ' +
              'good news; re-measure before believing it.');
          } else {
            console.log('  ⛔ NO REFLECTION ARRIVED, AND THAT IS THE ' +
              'EXPECTED RESULT. Her beat-3 answer stops the room saying a ' +
              'false thing; it does not make an evening finishable, and ' +
              'she was told that before she chose it. The option that ' +
              'would have — pausing the clock while the room waits on her ' +
              '— she declined, for the third time.');
          }

          // The artifact is lifted again so nothing after this block runs
          // over a delayed fetch.
          if (installed && installed.identifier) {
            try {
              await cdp.send(session,
                'Page.removeScriptToEvaluateOnNewDocument',
                { identifier: installed.identifier });
            } catch (e) { /* the run is over either way */ }
          }
        }
      }
    }

    // ---- IT NEVER TOUCHES HER LIBRARY ----------------------------------
    // ⛔ ASSERTED BY VALUE, NOT BY GREP. A first cut of this block searched
    // tests/lib/app-server.cjs for the string 'library.local.json' and went
    // RED — on the harness's own COMMENT saying it never reads that file.
    // A check that cannot tell a mention from a use is exactly the class of
    // instrument this repo keeps paying for, so it was replaced with the
    // fact itself: the root this run served is a fresh directory under the
    // system temp dir, and her library lives nowhere near it.
    const served = fs.realpathSync(app.root);
    const tmp = fs.realpathSync(os.tmpdir());
    if (served !== tmp && served.indexOf(tmp + path.sep) !== 0) {
      fail('[library] the server was driven over ' + served + ', which is ' +
        'not under ' + tmp + ' — this run may have touched a real library');
    } else {
      note('library: served from ' + served + ' (under the system temp dir)');
    }
  } catch (e) {
    fail('[runner] the gate could not be driven: ' +
      (e && e.message ? e.message : e));
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* */ } }
    try { await app.stop(); } catch (e) { /* */ }
  }

  backstops.forEach(function (b) { console.log('BACKSTOP: ' + b); });
  if (violations.length) {
    violations.forEach(function (v) { console.error(v); });
    console.error('test_consent_card_reaches_her FAILED (' +
      violations.length + ' violation(s), ' + backstops.length +
      ' backstop finding(s))');
    process.exit(1);
  }
  console.log('test_consent_card_reaches_her OK — all THREE of her sentences ' +
    'are readable at rest (in the window, inside the paper\'s own box, not ' +
    'under the control row, reaching themselves at five points each) and the ' +
    'three controls are on screen and hit-testable, at 1400x782 and at two ' +
    'backstop viewports — after controls proved the detector can say in ' +
    'view, out of view AND covered, and after the card was checked for its ' +
    'literal four paragraphs with the cost line present (' + backstops.length +
    ' backstop finding(s)). ⛔ THIS MEASURES GEOMETRY: it cannot detect a ' +
    'reword, because it lifts her sentences from the source it measures.');
})();
