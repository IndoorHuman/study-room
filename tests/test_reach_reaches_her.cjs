#!/usr/bin/env node
'use strict';
/* test_reach_reaches_her — phase 26.998, verification gap 1 / security
 * T-26.998-12.
 *
 * ⛔⛔ WHY THIS FILE EXISTS, AND IT IS NOT A THEORY.
 *
 * 26.998 shipped her reach control with a gate — `test_reflection_reach.cjs` —
 * that reads `app.js` SOURCE. That gate closes with its own line:
 * `⛔ GEOMETRY AND READABILITY ARE NOT MEASURED HERE.` Nothing else in tests/
 * mentions `session-reach`; `test_live_render.cjs` does not cover the block.
 *
 * FOUR OF THIS PHASE'S SIX LIVE DEFECTS WERE GEOMETRY OR WIRING FAILURES THAT
 * EVERY AUTOMATED GATE PASSED, and the only thing that ever caught them was
 * the owner opening the room and using it:
 *   1. her reach question sat BELOW THE FOLD at her own window size
 *   2. her typed words were WIPED on a refusal
 *   3. the give-up clock ran while she typed the answer it had just asked for
 *   4. the true-date derivation had NO CALLER — a stretch returned nothing
 * Defect 1 was then found to be CLIPPED, not merely low: the session spot
 * scrolls INSIDE ITSELF (438px of content in a 348px box), so a line added at
 * the bottom is CUT OFF rather than pushed down. Her refusal sentence rendered
 * at 733..792 while the spot's own box ended at 733. She was being told to try
 * months or years by a sentence she could not see. It was fixed by hand and
 * MEASURED BY HAND on the live page — and nothing has re-measured it since.
 *
 * ⛔ SO AN IN-WINDOW CHECK ALONE IS NOT ENOUGH HERE, AND THAT IS THE WHOLE
 * POINT. The shipped defect was inside the window. It was outside the spot's
 * own clipping box. Every line below is asked three questions, not one.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES **NOT** DO. Nobody may credit it with more.
 *
 *  - IT DOES NOT PIN HER WORDING. It LIFTS her six lines out of the `app.js`
 *    it is measuring, so a reword changes both sides and passes. That is
 *    deliberate (a retyped literal that drifts by one character makes a gate
 *    assert the wrong thing — this project's named defect class in a new
 *    costume). ⭐ The byte-pin already exists and lives elsewhere:
 *    `test_reflection_reach.cjs` §1 pins all six BY VALUE against the planning
 *    record and does NOT lift them from the source it checks. The two files
 *    are a pair; neither is sufficient alone.
 *
 *  - ⛔ IT DOES NOT COVER HER T-4 SET-ASIDE LINE (`.session-reach-aside`).
 *    That line only renders UNDER A FINISHED REFLECTION, which needs a real
 *    paid model call on real material. A gate may not spend her money, so this
 *    one does not, and it does NOT pretend the line is covered. It is measured
 *    today by her own UAT (beat 7, 2026-08-23, witnessed before and after a
 *    resume) and by nothing else. ⚠ THAT IS AN OPEN HOLE AND IT IS NAMED HERE.
 *
 *  - It measures at three viewports at `scrollTop = 0`. It says nothing about
 *    a viewport it is not driven at, and nothing about what happens after she
 *    scrolls the spot by hand.
 *
 *  - It does not judge whether the words are the RIGHT words. They are hers.
 *
 * ---------------------------------------------------------------------------
 * ANTI-VACUITY — the questions this file has to answer about ITSELF.
 *
 *  (a) Can the detector ever fail? CONTROL B plants an opaque cover over her
 *      ask line and the SAME detector must report it unreadable; lifting the
 *      cover must report it readable again. A detector that cannot go red is
 *      not a detector.
 *  (b) Could it pass over a block that is not there? Every stage asserts the
 *      elements PRESENT and non-empty before any geometry is read, and the
 *      run FAILS if the reach block never renders.
 *  (c) Could it pass over a line that is always on screen anyway? CONTROL C
 *      asserts her refusal line is ABSENT before an unreadable answer is sent
 *      and PRESENT after — so the file is measuring a line the room actually
 *      produces in response to her, not decoration.
 *  (d) Is it measuring the shipped path? It drives the real `server.py` over a
 *      synthetic library through the real controls — candle, consent, her two
 *      doors, her text box. No state is set by hand.
 *
 * Exits 0/1, house convention. A Chrome that cannot launch FAILS the run —
 * a gate that quietly skips is the thing this file was written against.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fs = require('fs');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));

const APP_JS = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/* ---- her six lines, LIFTED (see the header: this is not a byte-pin) ------ */
function liftConst(name) {
  // ⚠ ONE CONTIGUOUS LITERAL ONLY. The shipped constants are written as one
  // string each precisely so a byte-pin can see them; if that ever stops
  // being true this lift must FAIL rather than quietly match half a sentence.
  const re = new RegExp(
    'var\\s+' + name + '\\s*=\\s*(?:\\r?\\n\\s*)?([\'"])((?:\\\\.|(?!\\1).)*)\\1\\s*;');
  const m = APP_JS.match(re);
  if (!m) {
    throw new Error('could not lift ' + name + ' from app.js as ONE literal — ' +
      'a gate that cannot find the sentence it measures must fail, not skip');
  }
  return m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

const LINES = {
  ask: liftConst('SESSION_REACH_ASK'),
  recent: liftConst('SESSION_REACH_RECENT_LABEL'),
  back: liftConst('SESSION_REACH_BACK_LABEL'),
  type: liftConst('SESSION_REACH_TYPE'),
  go: liftConst('SESSION_REACH_SEND_LABEL'),
  unreadable: liftConst('SESSION_REACH_UNREADABLE')
};

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

/* ---- ONE READING of one line ---------------------------------------------
 *
 * Three questions, and the second is the one the shipped defect failed:
 *   inWindow   — the box is inside the browser window
 *   inClipper  — the box is inside `.station-spot`'s OWN VISIBLE BOX. The spot
 *                scrolls inside itself, so a line can be in the window and
 *                still be cut off by its own container. THIS IS THE ONE.
 *   hitsSelf   — five points down its own height each land on the line (or a
 *                child of it) rather than on something painted over it. A
 *                centre-only hit test calls a HALF-COVERED line fine.
 */
const MEASURE = function (sel) {
  return '(function(){' +
    'var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return JSON.stringify({found:false});' +
    'var r=n.getBoundingClientRect();' +
    'var spot=n.closest(".station-spot");' +
    'var txt=(n.value!==undefined&&n.tagName==="INPUT")?String(n.value):' +
    ' String(n.textContent||"").trim();' +
    'var out={found:true,text:txt,' +
    ' top:Math.round(r.top),bottom:Math.round(r.bottom),' +
    ' left:Math.round(r.left),width:Math.round(r.width),' +
    ' height:Math.round(r.height),' +
    ' winH:window.innerHeight,winW:window.innerWidth};' +
    'out.inWindow=(r.top>=0&&r.bottom<=window.innerHeight&&' +
    ' r.left>=0&&r.right<=window.innerWidth&&r.width>0&&r.height>0);' +
    'if(spot){var cs=getComputedStyle(spot);var sr=spot.getBoundingClientRect();' +
    ' var bt=sr.top+(parseFloat(cs.borderTopWidth)||0);' +
    ' var bb=bt+spot.clientHeight;' +
    ' out.clipTop=Math.round(bt);out.clipBottom=Math.round(bb);' +
    ' out.spotScrollH=spot.scrollHeight;out.spotClientH=spot.clientHeight;' +
    ' out.inClipper=(r.top>=bt-0.5&&r.bottom<=bb+0.5);' +
    '}else{out.inClipper=null;}' +
    'var hits=0,pts=5,i;' +
    'for(i=0;i<pts;i++){' +
    ' var y=r.top+(r.height*(i+0.5)/pts);' +
    ' var x=r.left+Math.min(12,r.width/2);' +
    ' var e=document.elementFromPoint(x,y);' +
    ' if(e&&(e===n||n.contains(e)))hits++;}' +
    'out.hits=hits;out.pts=pts;out.hitsSelf=(hits===pts);' +
    'return JSON.stringify(out);})()';
};

async function measure(session, sel) {
  return JSON.parse(await cdp.evaluate(session, MEASURE(sel)));
}
function readable(m) {
  return m.found && m.inWindow && m.inClipper !== false && m.hitsSelf;
}

async function click(session, sel) {
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box || box === 'null') {
    throw new Error('cannot tap ' + sel + ' — it is not on the page. A gate ' +
      'that silently skips the control it is driving proves nothing');
  }
  const p = JSON.parse(box);
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(500);
}

async function present(session, sel) {
  const v = await cdp.evaluate(session,
    '(function(){return document.querySelector(' + JSON.stringify(sel) +
    ')?"1":"0";})()');
  return v === '1';
}

/* ---- drive to the reach block THROUGH THE SHIPPED CONTROLS --------------- */
async function openTheReach(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(3000);
  await click(session, '#room-obj-candle');
  await sleep(2200);
  // The look-back offer may or may not be there on a synthetic library; if it
  // is, decline it the way she would.
  const offer = await cdp.evaluate(session,
    '(function(){var b=[].slice.call(document.querySelectorAll("button,a"));' +
    'for(var i=0;i<b.length;i++){if((b[i].textContent||"").trim()==="not today")' +
    '{var r=b[i].getBoundingClientRect();' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});}}' +
    'return null;})()');
  if (offer && offer !== 'null') {
    const p = JSON.parse(offer);
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(1800);
  }
  if (!await present(session, '.session-consent')) {
    throw new Error('the consent card never rendered after the candle tap — ' +
      'nothing measured after this point would be a reading');
  }
  // ⛔ Her consent comes FIRST and the reach block may not render before it —
  // that ordering is a shipped gate (the reach block is a SIBLING of the
  // consent card, never a child, because the card's paragraph count is
  // counted). Assert it rather than assume it.
  if (await present(session, '.session-reach')) {
    throw new Error('the reach block rendered BEFORE consent was answered — ' +
      'that is a disclosure-ordering regression, not a geometry finding');
  }
  await click(session, '.session-consent-full');
  await sleep(2000);
  if (!await present(session, '.session-reach')) {
    throw new Error('the reach block never rendered after consent — ' +
      'nothing measured after this point would be a reading');
  }
}

(async function main() {
  const app = await appServer.start();
  let session = null;
  let planted = false;
  try {
    for (const vp of VIEWPORTS) {
      const label = vp.width + 'x' + vp.height + (vp.hers ? '  (HERS)' : '');
      console.log('\n== ' + label + ' ==');
      const record = vp.hers ? fail : backstop;

      session = await cdp.launch({ url: app.url });
      await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height, deviceScaleFactor: 1,
          mobile: false });

      await openTheReach(session, app.url);

      /* ---- STAGE A — her question and her two doors ---------------------- */
      const stageA = [
        ['.session-reach-ask', LINES.ask, 'T-1 her question'],
        ['.session-reach-recent', LINES.recent, 'T-5 stay recent'],
        ['.session-reach-back', LINES.back, 'T-5 go further back']
      ];
      for (const [sel, want, name] of stageA) {
        const m = await measure(session, sel);
        if (!m.found) { record(name + ': ' + sel + ' is not on the page'); continue; }
        if (m.text !== want) {
          record(name + ': rendered text is not the shipped constant — ' +
            'got ' + JSON.stringify(m.text));
        }
        note(name + '  ' + m.top + '..' + m.bottom +
          '  clip ' + m.clipTop + '..' + m.clipBottom +
          '  win ' + (m.inWindow ? 'in' : 'OUT') +
          '  clip ' + (m.inClipper === false ? 'CUT' : 'in') +
          '  hits ' + m.hits + '/' + m.pts);
        if (!readable(m)) {
          record(name + ' is NOT readable at ' + label + ' — ' +
            'box ' + m.top + '..' + m.bottom + ', spot box ' +
            m.clipTop + '..' + m.clipBottom + ', hits ' + m.hits + '/' + m.pts);
        }
      }

      /* ---- CONTROL C (part 1) — the refusal line is NOT there yet -------- */
      if (await present(session, '.session-reach-unreadable')) {
        record('CONTROL C: her refusal line is on screen before she has ' +
          'answered anything — this file would be measuring decoration');
      }

      /* ---- CONTROL B — the detector must be able to go RED --------------- */
      await cdp.evaluate(session,
        '(function(){var d=document.createElement("div");' +
        'd.id="__reach_cover";var n=document.querySelector(".session-reach-ask");' +
        'var r=n.getBoundingClientRect();' +
        'd.style.cssText="position:fixed;z-index:99999;background:#000;left:"+' +
        'r.left+"px;top:"+r.top+"px;width:"+r.width+"px;height:"+r.height+"px";' +
        'document.body.appendChild(d);return "1";})()');
      planted = true;
      const covered = await measure(session, '.session-reach-ask');
      if (readable(covered)) {
        fail('CONTROL B: an opaque cover over her question did NOT make the ' +
          'detector report it unreadable — the detector cannot go red, so ' +
          'every green above is worthless');
      } else {
        note('CONTROL B  covered -> unreadable (hits ' + covered.hits + '/' +
          covered.pts + ')  ✓');
      }
      await cdp.evaluate(session,
        '(function(){var d=document.getElementById("__reach_cover");' +
        'if(d)d.parentNode.removeChild(d);return "1";})()');
      planted = false;
      const lifted = await measure(session, '.session-reach-ask');
      if (!readable(lifted)) {
        fail('CONTROL B: her question did not become readable again after ' +
          'the cover was lifted — the detector is stuck red');
      }

      /* ---- STAGE B — she opens the typing row ---------------------------- */
      await click(session, '.session-reach-back');
      await sleep(900);
      const stageB = [
        ['.session-reach-type', LINES.type, 'T-2 tell me how far back'],
        ['.session-reach-input', '', 'her text box'],
        ['.session-reach-go', LINES.go, 'T-7 the send label']
      ];
      for (const [sel, want, name] of stageB) {
        const m = await measure(session, sel);
        if (!m.found) { record(name + ': ' + sel + ' is not on the page'); continue; }
        if (want !== '' && m.text !== want) {
          record(name + ': rendered text is not the shipped constant — ' +
            'got ' + JSON.stringify(m.text));
        }
        note(name + '  ' + m.top + '..' + m.bottom +
          '  clip ' + m.clipTop + '..' + m.clipBottom +
          '  win ' + (m.inWindow ? 'in' : 'OUT') +
          '  clip ' + (m.inClipper === false ? 'CUT' : 'in') +
          '  hits ' + m.hits + '/' + m.pts);
        if (!readable(m)) {
          record(name + ' is NOT readable at ' + label + ' — ' +
            'box ' + m.top + '..' + m.bottom + ', spot box ' +
            m.clipTop + '..' + m.clipBottom + ', hits ' + m.hits + '/' + m.pts);
        }
      }

      /* ---- STAGE C — she types something that is not a length ------------
       * ⛔ THIS IS DEFECT 1 AND DEFECT 2 IN ONE MOVE. The refusal line is the
       * sentence that rendered at 733..792 inside a box that ended at 733, and
       * her typed words are the ones that used to be wiped by the repaint. */
      await cdp.evaluate(session,
        '(function(){var b=document.querySelector(".session-reach-input");' +
        'var s=Object.getOwnPropertyDescriptor(' +
        'window.HTMLInputElement.prototype,"value").set;' +
        's.call(b,"a while ago");' +
        'b.dispatchEvent(new Event("input",{bubbles:true}));return "1";})()');
      await sleep(300);
      await click(session, '.session-reach-go');
      await sleep(1200);

      if (!await present(session, '.session-reach-unreadable')) {
        record('CONTROL C: an unreadable answer produced NO refusal line — ' +
          'the room either guessed a length or said nothing, and both are ' +
          'worse than asking again');
      } else {
        const m = await measure(session, '.session-reach-unreadable');
        if (m.text !== LINES.unreadable) {
          record('T-6 the refusal: rendered text is not the shipped ' +
            'constant — got ' + JSON.stringify(m.text));
        }
        note('T-6 her refusal  ' + m.top + '..' + m.bottom +
          '  clip ' + m.clipTop + '..' + m.clipBottom +
          '  win ' + (m.inWindow ? 'in' : 'OUT') +
          '  clip ' + (m.inClipper === false ? 'CUT' : 'in') +
          '  hits ' + m.hits + '/' + m.pts);
        if (!readable(m)) {
          record('T-6 her refusal line is NOT readable at ' + label +
            ' — box ' + m.top + '..' + m.bottom + ', spot box ' +
            m.clipTop + '..' + m.clipBottom + ', hits ' + m.hits + '/' +
            m.pts + '. THIS IS THE SHIPPED DEFECT SHAPE: she is told to try ' +
            'months or years by a sentence she cannot see');
        }
      }

      /* ---- her words survive the refusal (defect 2) ---------------------- */
      const box = await measure(session, '.session-reach-input');
      if (box.found && box.text !== 'a while ago') {
        record('her typed words were WIPED by the refusal — the room asked ' +
          'her to fix an answer while deleting the thing she would fix. ' +
          'Box now holds ' + JSON.stringify(box.text));
      } else if (box.found) {
        note('her words survived the refusal  ✓');
      }

      await cdp.close(session);
      session = null;
    }
  } catch (e) {
    fail('the run could not complete: ' + (e && e.message ? e.message : e));
  } finally {
    if (planted && session) {
      try {
        await cdp.evaluate(session,
          '(function(){var d=document.getElementById("__reach_cover");' +
          'if(d)d.parentNode.removeChild(d);return "1";})()');
      } catch (e) { /* the page is already gone */ }
    }
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    if (app && app.stop) { await app.stop(); }
  }

  console.log('');
  if (backstops.length) {
    console.log('BACKSTOP FINDINGS (viewports she does not use):');
    backstops.forEach(function (m) { console.log('  - ' + m); });
  }
  if (violations.length) {
    console.log('FAIL test_reach_reaches_her');
    violations.forEach(function (m) { console.log('  - ' + m); });
    process.exit(1);
  }
  console.log('test_reach_reaches_her OK — her six lines measured on the ' +
    'RENDERED page at ' + VIEWPORTS.length + ' viewports, inside the spot\'s ' +
    'own scroll box, not merely inside the window.');
  console.log('⛔ NOT COVERED HERE: her T-4 set-aside line, which needs a ' +
    'real paid reflection. Her UAT beat 7 is the only thing that has ever ' +
    'measured it.');
  process.exit(0);
})();
