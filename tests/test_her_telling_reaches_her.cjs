#!/usr/bin/env node
'use strict';
/* test_her_telling_reaches_her — 26.998-10.
 *
 * ⛔⛔ WHY THIS FILE EXISTS, AND IT IS NOT A THEORY. IT IS WHAT HAPPENED TO
 * HER ON 2026-08-24.
 *
 * She sat down, read the first reflection ever built under her own ranking,
 * and liked it. Her ranking had left 12,476 rows out of it. Her W-2 ruling is
 * *leave out, AND TELL ME*, and her sentence for that moment — chosen, in her
 * own lowercase — was recorded and wired. She was never told.
 *
 * MEASURED AFTERWARDS ON A RENDERED PAGE, not reasoned about:
 *   - the card holds 2,684px of content in a 348px visible box;
 *   - her line rendered at 2817..2876 against a card ending at 704 — ⛔ over
 *     2,100px below the fold, inside a container that CLIPS;
 *   - and the SPREAD — the expanded view anyone reads a long reflection in —
 *     did not paint it AT ALL.
 *
 * ⛔ HER T-4 UNDATED LINE HAD THE SAME DEFECT AND HAD SHIPPED WITH IT. The
 * ranking lines did not regress anything; they inherited it. The reason
 * nobody caught it is the reason this file is shaped the way it is: seeing
 * these lines needs a FINISHED reflection, a finished reflection needs a paid
 * model call, and a gate may not spend her money — so the gate was never
 * written and the defect lived behind that gap.
 *
 * ⭐ THIS FILE SPENDS NOTHING. It PLANTS a session document and RESUMES it,
 * which the server answers out of the file. No model call, no key, no cost.
 *
 * ⛔ HER RULING, 2026-08-24, chosen from an offered set:
 *     `At the end, but in both views`
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES **NOT** DO.
 *  - It does not judge her words. They are hers.
 *  - It does not check the CARD's own geometry. The card clips by design and
 *    her ruling put the telling at the END; the spread is the surface she
 *    reads on and the surface this measures. ⚠ NAMED, not silently skipped.
 *  - It measures one viewport. It says nothing about any other.
 *
 * ANTI-VACUITY — the questions it must answer about ITSELF:
 *  (a) Could it pass with no lines on the page? Every assertion is preceded
 *      by a presence check that FAILS the run if the box is absent.
 *  (b) Can the detector go red? CONTROL B plants an opaque cover over the
 *      line and the SAME reading must report it unreadable.
 *  (c) Could it pass on a page where nothing was left out? CONTROL A drives a
 *      second sitting with `ranking_shed: 0` and asserts her G-1 line is
 *      ABSENT — the zero rule, which is her own T-3 precedent.
 *
 * Exits 0/1, house convention. A Chrome that cannot launch FAILS the run.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fs = require('fs');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ok   ' + msg); }
  else { console.log('  FAIL ' + msg); failures++; }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ⛔ PINNED BY VALUE against the planning record — NOT lifted from the app.js
 * being measured. A lift makes a reword change both sides and pass; this file
 * is the one that would notice her words being "tidied". Her lowercase `i` is
 * hers and both dashes are EM DASHES (U+2014). */
const T4 = 'some things here have no date i can trust; i left those out.';
const G1 = 'there was more than i could hold; i kept what\'s yours.';

function longDraft() {
  const paras = [];
  for (let i = 0; i < 14; i++) {
    paras.push('This is paragraph ' + (i + 1) + ' of a reflection as long as ' +
      'the one she actually read, so the aside lines sit exactly where they ' +
      'sat for her: at the very end of a long scroll.');
  }
  return paras.join('\n\n');
}

function plant(root, counts) {
  const doc = Object.assign({
    state: 'active', draft: longDraft(), name: 'the gate',
    consented: true, created_ms: 1787000000000,
    chat: [], pool: {}, whys: [], why_wanted: []
  }, counts);
  const dir = path.join(root, 'librarian');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(doc), 'utf8');
}

async function tapAt(session, x, y) {
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mousePressed', x: x, y: y, button: 'left', clickCount: 1 });
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: x, y: y, button: 'left', clickCount: 1 });
  await sleep(700);
}

async function tapSel(session, sel) {
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box || box === 'null') {
    throw new Error('cannot tap ' + sel + ' — a gate that silently skips the ' +
      'control it drives proves nothing');
  }
  const p = JSON.parse(box);
  await tapAt(session, p.x, p.y);
}

async function tapByText(session, re) {
  const box = await cdp.evaluate(session,
    '(function(){var b=[].slice.call(document.querySelectorAll("button"));' +
    'var t=b.filter(function(x){return ' + re + '.test((x.textContent||"").trim());});' +
    'if(!t.length)return null;var r=t[0].getBoundingClientRect();' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box || box === 'null') { return false; }
  const p = JSON.parse(box);
  await tapAt(session, p.x, p.y);
  return true;
}

/* ⚠ NOT the element centre: the paper is thousands of px tall, so its centre
 * is off-screen and a dispatch there lands nowhere — the first version of this
 * drive silently opened nothing and measured the card instead. */
async function openTheSpread(session) {
  const pt = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(".session-paper");' +
    'if(!n)return null;var sp=n.closest(".station-spot");' +
    'var r=n.getBoundingClientRect();var sr=sp?sp.getBoundingClientRect():r;' +
    'var y=Math.max(r.top,sr.top)+20;' +
    'return JSON.stringify({x:r.left+Math.min(60,r.width/2),y:y});})()');
  if (!pt || pt === 'null') { return false; }
  const q = JSON.parse(pt);
  await tapAt(session, q.x, q.y);
  await sleep(1200);
  const open = await cdp.evaluate(session,
    '(function(){var sc=document.getElementById("spread-scroll");' +
    'return sc && getComputedStyle(sc).display !== "none" ? "1" : "0";})()');
  return open === '1';
}

const READ_END = '(function(){' +
  'var sc=document.getElementById("spread-scroll");' +
  'if(sc){sc.scrollTop=sc.scrollHeight;}' +
  'var b=document.getElementById("spread-session-aside");' +
  'var c=document.getElementById("spread-content");' +
  'if(!b)return JSON.stringify({found:false,insideContent:null,rows:[]});' +
  'var sr=sc.getBoundingClientRect();' +
  'var ps=[].slice.call(b.querySelectorAll("p"));' +
  'return JSON.stringify({found:true,' +
  ' insideContent: !!(c&&c.contains(b)),' +
  ' rows: ps.map(function(n){var r=n.getBoundingClientRect();' +
  '  var hits=0;for(var i=0;i<5;i++){var y=r.top+(r.height*(i+0.5)/5);' +
  '   var e=document.elementFromPoint(r.left+Math.min(12,r.width/2),y);' +
  '   if(e&&(e===n||n.contains(e)))hits++;}' +
  '  return {text:(n.textContent||"").trim(),' +
  '   inWindow:(r.top>=0&&r.bottom<=window.innerHeight&&r.height>0),' +
  '   inReader:(r.top>=sr.top-0.5&&r.bottom<=sr.bottom+0.5),' +
  '   hitsSelf:(hits===5)};})});})()';

async function driveToEnd(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(2600);
  await tapSel(session, '#room-obj-candle');
  await sleep(1300);
  await tapByText(session, '/pick it up/i');
  await sleep(2400);
  const opened = await openTheSpread(session);
  if (!opened) {
    throw new Error('the spread never opened — nothing below measures the ' +
      'surface she reads on, so this run FAILS rather than reporting on the card');
  }
  await sleep(400);
  return JSON.parse(await cdp.evaluate(session, READ_END));
}

(async () => {
  console.log('\n-- her telling, on the surface she reads on ------------------');
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1400, height: 782, deviceScaleFactor: 1, mobile: false });

    /* ---- 1. the real case: something WAS left out ---------------------- */
    plant(app.root, { reach_set_aside: 7, ranking_shed: 12476,
      own_kept: 2, saved_kept: 572 });
    const seen = await driveToEnd(session, app.url);

    ok(seen.found, '⭐ her telling EXISTS on the spread — the expanded view ' +
      'she actually reads a long reflection in (it did not, on 2026-08-24)');
    ok(seen.rows.length >= 2, 'and both owed lines are there, not one');
    ok(seen.insideContent === false,
      '⛔ and it is NOT inside #spread-content — the verbatim law (SRM-03) ' +
      'keeps her writing untouched; this is the ROOM speaking about what it did');

    const g1 = seen.rows.filter(function (r) { return r.text === G1; })[0];
    const t4 = seen.rows.filter(function (r) { return r.text === T4; })[0];
    ok(!!g1, 'her G-1 line is present VERBATIM — lowercase i, semicolon, ' +
      'untrimmed (pinned by value against the record, never lifted)');
    ok(!!t4, 'and her T-4 undated line too — it had the SAME defect and had ' +
      'shipped with it');
    ok(!!g1 && g1.inWindow && g1.inReader && g1.hitsSelf,
      '⭐⭐ AND IT IS READABLE WHEN SHE REACHES THE END — in the window, ' +
      'inside the reader, and not covered by anything');
    ok(!!t4 && t4.inWindow && t4.inReader && t4.hitsSelf,
      'and so is her T-4 line');

    /* ---- 2. CONTROL B: the reading can go red ------------------------- */
    const covered = await cdp.evaluate(session,
      '(function(){var b=document.getElementById("spread-session-aside");' +
      'if(!b)return "0";var p=b.querySelector("p");if(!p)return "0";' +
      'var r=p.getBoundingClientRect();var d=document.createElement("div");' +
      'd.id="gate-cover";d.style.cssText="position:fixed;z-index:99999;' +
      'background:#000;left:"+r.left+"px;top:"+r.top+"px;width:"+r.width+' +
      '"px;height:"+r.height+"px";document.body.appendChild(d);return "1";})()');
    if (covered === '1') {
      const after = JSON.parse(await cdp.evaluate(session, READ_END));
      const first = after.rows[0];
      ok(!!first && first.hitsSelf === false,
        '⭐ CONTROL B: an opaque cover over the line makes the SAME reading ' +
        'report it unreadable — a detector that cannot go red is not a detector');
      await cdp.evaluate(session,
        '(function(){var d=document.getElementById("gate-cover");' +
        'if(d&&d.parentNode)d.parentNode.removeChild(d);return "1";})()');
    } else {
      ok(false, 'CONTROL B could not be planted — the control is the proof ' +
        'this file can fail, so its absence is a failure');
    }

    /* ---- 3. CONTROL A: the zero rule, which is HER precedent ---------- */
    plant(app.root, { reach_set_aside: 0, ranking_shed: 0,
      own_kept: 2, saved_kept: 572 });
    const quiet = await driveToEnd(session, app.url);
    const anyG1 = quiet.found &&
      quiet.rows.some(function (r) { return r.text === G1; });
    ok(!anyG1,
      '⭐ CONTROL A (the zero rule, her own T-3 precedent): nothing was left ' +
      'out, so the room says NOTHING — a zero is not a sentence');
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }

  console.log('');
  if (failures) {
    console.log('FAIL test_her_telling_reaches_her — ' + failures + ' check(s)');
    process.exit(1);
  }
  console.log('test_her_telling_reaches_her OK — her W-2 telling reaches the ' +
    'surface she reads on, verbatim, readable at the end, outside her own ' +
    'writing, and silent when there is nothing to say.');
  process.exit(0);
})().catch(function (e) {
  console.log('  FAIL ' + (e && e.message ? e.message : String(e)));
  console.log('FAIL test_her_telling_reaches_her — the run could not complete');
  process.exit(1);
});
