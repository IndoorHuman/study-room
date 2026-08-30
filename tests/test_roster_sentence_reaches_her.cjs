#!/usr/bin/env node
'use strict';
/* test_roster_sentence_reaches_her — phase 26.96, findings F-2 and F-4.
 *
 * WHAT THIS EXISTS FOR. The private-folders pane says one short sentence
 * after she adds a folder and a different one after she lets a folder be
 * read again. Both sentences are HERS, both are already approved, and both
 * ship in the code byte-exactly. The owner sitting of 2026-08-20 found that
 * neither of them reaches her eyes:
 *
 *   F-2  the sentence is written into a ONE-LINE paragraph carrying
 *        white-space:nowrap + overflow:hidden + text-overflow:ellipsis, so
 *        it is cut with a "…" at ordinary widths. She saw
 *        "Kept private from now on, and anything already here from that fol…"
 *
 *   F-4  the REMOVE sentence renders into the slot at the acted-on row's
 *        position, which sits inside the list's own 10rem scroll box. With a
 *        list longer than that box and the box scrolled to the top, the
 *        sentence is below the fold and she never sees it at all. Nothing
 *        scrolls it into view and nothing says it is there.
 *
 * The two compound, and the half that is lost is the half that carries the
 * meaning: the remove sentence exists to tell her that things already set
 * aside do NOT come back, and that is precisely the clause that goes.
 *
 * ⛔ WHY THIS IS A REAL BROWSER AND NOT A SOURCE READ. Both findings are
 * LAYOUT. A suite that greps app.js for "nowrap" would pass the moment the
 * declaration moved to a stylesheet, and would say nothing at all about
 * whether the sentence is on screen. This project's most-repeated defect is a
 * check that confirms a mechanism is well-formed without confirming it works,
 * and it has already landed once inside this very pane's instrument — the
 * staging backstop drove three viewports, asked whether the list scrolls in
 * its own box and whether the add field is reachable, passed both, and never
 * asked whether the sentence the pane exists to say lands in view.
 *
 * ⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY. tests/lib/app-server.cjs builds a
 * synthetic library under os.tmpdir() and serves that; library.local.json is
 * never read.
 *
 * THE ANTI-VACUITY ANSWERS.
 *  (1) Can it pass before the fix? No — recorded RED on 823e235, both arms,
 *      with the measured numbers printed.
 *  (2) Could it pass over NOTHING? No. Each arm pins the sentence's TEXT
 *      byte-exactly before it measures geometry, so an empty slot, a missing
 *      slot or a truncated string fails as a missing positive control rather
 *      than sliding through as "nothing was clipped".
 *  (3) Is the clipping detector always-fail? No — CONTROL C asserts the
 *      pane's framing paragraph, which wraps normally, is NOT clipped by the
 *      same detector in the same run. A detector that answered "clipped" for
 *      everything would fail there.
 *  (4) Is arm 2 reading source order? No. It compares the slot's own
 *      bounding box against the visible box of its scrolling ancestor, both
 *      measured live after the act.
 *  (5) Does a degenerate fix satisfy it? Removing the sentence entirely
 *      fails (2). Making the list not scroll fails nothing here but is
 *      caught by the shipped backstop's own list-scrolls assertion.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));

// Her two approved sentences, pinned here byte-exactly. ⛔ These are the
// POSITIVE CONTROLS: geometry is only believed once the right string is on
// screen, so no arm can pass over an empty or truncated slot.
const C3_ADD = 'Kept private from now on, and anything already here from ' +
  'that folder is set aside too.';
const C4_REMOVE = 'The librarian can read that folder again. Things already ' +
  'set aside stay set aside; you can bring any of them back yourself, one ' +
  'at a time.';
const FRAMING_OPENS = 'These folders stay private.';
// ⭐ HER FUTURE-ONLY SENTENCE, ruled at the sitting on 2026-08-20 and applied
// to the code the same day. It is what the add path says when the server
// answers that its backward-reaching pass did not apply — which is exactly
// this fixture, because meta.vault_root is stamped only by a whole-vault
// import. ⛔ THIS FILE MEASURES GEOMETRY, NOT PROVENANCE: that the constant
// still matches HER RECORD is tests/test_roster_ruled_copy.cjs's job, pinned
// against 26.96-DECISIONS.md rather than against this literal.
const A1_FUTURE_ONLY = 'Kept private from now on. Anything already here ' +
  'from that folder stays where it is.';

// Long enough that the list must scroll inside its own box — which is the
// condition F-4 needs to show itself at all.
const SEED_ROSTER = ['Journal', 'personnel notes', 'billing & insurance notes',
  'appraisal record', 'Clippings/journal/chatgpt', 'Clippings/journal',
  'tax and bank statements', 'therapy notes'];

const VIEWPORT = { width: 1100, height: 800 };

const violations = [];
const notes = [];
function fail(msg) { violations.push(msg); }
function note(msg) { notes.push(msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

async function clickByText(session, text) {
  const ok = await cdp.evaluate(session,
    '(function(){var want=' + JSON.stringify(text) + ';' +
    'var all=document.querySelectorAll("#manage-sec-roster button,' +
    ' #manage-sec-roster a");' +
    'for(var i=0;i<all.length;i++){' +
    ' if((all[i].textContent||"").trim()===want){all[i].click();return "1";}}' +
    'return "0";})()');
  if (ok !== '1') { throw new Error('no control in the pane reading: ' + text); }
}

// ONE measurement helper, used by every arm and by the control, so the three
// readings cannot drift apart. Returns null when the element is absent.
const MEASURE = function (selectorOrText, byText) {
  return '(function(){' +
    'var pane=document.getElementById("manage-sec-roster");' +
    'if(!pane)return JSON.stringify({pane:false});' +
    'var el=null;' +
    (byText
      ? 'var all=pane.querySelectorAll("p,div,span");' +
        'for(var i=0;i<all.length;i++){if(all[i].children.length)continue;' +
        ' var t=(all[i].textContent||"").trim();' +
        ' if(t.indexOf(' + JSON.stringify(selectorOrText) + ')===0){el=all[i];break;}}'
      : 'var slot=pane.querySelector(' + JSON.stringify(selectorOrText) + ');' +
        'if(slot){el=slot.querySelector("p")||slot;}') +
    'if(!el)return JSON.stringify({pane:true,found:false});' +
    'var r=el.getBoundingClientRect();' +
    // the nearest ancestor that actually clips, so arm 2 asks the right box
    'var clipper=null,walk=el.parentElement;' +
    'while(walk&&walk!==document.body){var cs2=getComputedStyle(walk);' +
    ' if((cs2.overflowY==="auto"||cs2.overflowY==="scroll"||' +
    '     cs2.overflowY==="hidden")&&walk.scrollHeight>walk.clientHeight+1){' +
    '  clipper=walk;break;}walk=walk.parentElement;}' +
    'var cr=clipper?clipper.getBoundingClientRect():null;' +
    'return JSON.stringify({pane:true,found:true,' +
    ' text:(el.textContent||"").trim(),' +
    ' clientW:el.clientWidth, scrollW:el.scrollWidth,' +
    ' clientH:el.clientHeight, scrollH:el.scrollHeight,' +
    ' nonZero:(r.width>0&&r.height>0),' +
    ' top:Math.round(r.top), bottom:Math.round(r.bottom),' +
    ' inViewport:(r.top>=0&&r.bottom<=window.innerHeight),' +
    ' hasClipper:!!clipper,' +
    ' clipTop:cr?Math.round(cr.top):null,' +
    ' clipBottom:cr?Math.round(cr.bottom):null,' +
    ' insideClipper:cr?(r.top>=cr.top-1&&r.bottom<=cr.bottom+1):true});})()';
};

async function measure(session, selectorOrText, byText) {
  const raw = await cdp.evaluate(session, MEASURE(selectorOrText, byText));
  return JSON.parse(raw);
}

// A sentence is CLIPPED when its own content is wider or taller than the box
// it is drawn in — the ellipsis case and the hidden-overflow case at once.
function clipped(m) {
  return (m.scrollW > m.clientW + 1) || (m.scrollH > m.clientH + 1);
}

async function openPane(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(2500);
  await click(session, '#room-manage-link');
  await sleep(1200);
  // 26.99955-04: THE DRIVE MOVED WITH THE DOOR — the side rail is gone
  // from the page (her 2026-08-21 ruling; it survives only inside the ☰
  // sections overlay), so this suite now opens the pane the way she does:
  // the landing door tile. ⛔ Every assertion below is unchanged — only
  // the route to the pane moved; a tile that cannot be clicked still
  // throws here rather than measuring nothing.
  await click(session, '#manage-landing .manage-tile[data-pane="roster"]');
  await sleep(1500);
  let vis = await cdp.evaluate(session,
    '(function(){var p=document.getElementById("manage-sec-roster");' +
    'return !!p && p.getBoundingClientRect().height>0 ? "1":"0";})()');
  if (vis !== '1') {
    await click(session, '#manage-landing .manage-tile[data-pane="roster"]');
    await sleep(1500);
    vis = await cdp.evaluate(session,
      '(function(){var p=document.getElementById("manage-sec-roster");' +
      'return !!p && p.getBoundingClientRect().height>0 ? "1":"0";})()');
  }
  if (vis !== '1') {
    throw new Error('the pane never rendered at a non-zero size — nothing ' +
      'measured after this point would be a reading');
  }
}

(async function main() {
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: VIEWPORT.width, height: VIEWPORT.height,
        deviceScaleFactor: 1, mobile: false });

    for (const f of SEED_ROSTER) {
      await cdp.evaluate(session,
        'fetch("/api/librarian/roster",{method:"POST",' +
        'headers:{"Content-Type":"application/json"},' +
        'body:JSON.stringify({op:"add",folder:' + JSON.stringify(f) + '})})' +
        '.then(r=>r.text())');
    }
    await sleep(700);

    // ---------------------------------------------------------------
    // CONTROL C — the detector can say "not clipped"
    // ---------------------------------------------------------------
    await openPane(session, app.url);
    const framing = await measure(session, FRAMING_OPENS, true);
    if (!framing.found) {
      fail('[control] the pane\'s framing sentence was not found at all, so ' +
        'the clipping detector was never shown a known-good case');
    } else if (!framing.nonZero) {
      fail('[control] the framing sentence measured at zero size — vacuous');
    } else if (clipped(framing)) {
      fail('[control] THE DETECTOR IS ALWAYS-FAIL: it reports the pane\'s own ' +
        'wrapping framing sentence as clipped (' + framing.scrollW + 'px of ' +
        'content in ' + framing.clientW + 'px, ' + framing.scrollH + 'px tall ' +
        'in ' + framing.clientH + 'px). Nothing else in this file would mean ' +
        'anything.');
    } else {
      note('control: the framing sentence wraps and is NOT clipped ' +
        '(content ' + framing.scrollW + 'px in ' + framing.clientW + 'px box)');
    }

    // ---------------------------------------------------------------
    // ARM 1 (F-2) — the ADD sentence is readable in full
    //
    // ⚠ WHY THIS ARM DRIVES THE RENDERER RATHER THAN THE ADD BUTTON, and it
    // is a real limit rather than a convenience. On this fixture the add path
    // is CORRECTLY SILENT: `rosterSentence('add', retroactive)` says her C3
    // only when the server answers that the backward-reaching pass applied,
    // and that answer is gated on meta.vault_root, which ONLY a whole-vault
    // import stamps and which is deliberately not browser-writable. So a
    // button press here would measure the empty seat, not the sentence.
    // What F-2 lives in is `rosterConsequence` — the one function that writes
    // BOTH sentences into the pane — so this arm hands it her exact C3 bytes
    // and measures the box it draws them in, in the pane's own real slot, at
    // a real width. ⛔ It is NOT a mirror: the bytes are pinned from the copy
    // record above, the function is the shipped one lifted from the page, and
    // arm 2 drives the same defect end-to-end through a real button.
    // First, the honest end-to-end observation: press the real control and
    // record what this fixture really does.
    await cdp.evaluate(session,
      '(function(){var i=document.querySelector(".vault-roster-add-input");' +
      'if(!i)return "0";i.value="Content Studio";' +
      'i.dispatchEvent(new Event("input",{bubbles:true}));return "1";})()');
    await clickByText(session, 'keep this private too');
    await sleep(1400);
    const addSaid = await measure(session, '.vault-roster-consequence', false);
    // ⭐ THE LIMIT THIS ARM CARRIED IS GONE, and that is her ruling's doing.
    // Until 2026-08-20 the add path on this fixture was CORRECTLY SILENT — the
    // future-only seat shipped empty because the sentence was owed to her — so
    // the geometry could not be driven end-to-end here at all. She ruled A1
    // and it was applied, so the add path now speaks and this arm measures the
    // real thing through the real button.
    const addIsSilent = !addSaid.found || !(addSaid.text || '').length;
    if (addIsSilent) {
      fail('[F-2] the add path said NOTHING. Since her ruling the future-only ' +
        'seat is filled, so silence here means the seat regressed to empty — ' +
        'or the route stopped answering. Expected ' +
        JSON.stringify(A1_FUTURE_ONLY));
    } else if (addSaid.text !== A1_FUTURE_ONLY && addSaid.text !== C3_ADD) {
      fail('[F-2] the add path said something that is neither of her two ' +
        'approved sentences: ' + JSON.stringify(addSaid.text));
    } else if (clipped(addSaid)) {
      fail('[F-2] HER APPROVED ADD SENTENCE IS CUT OFF ON SCREEN: it needs ' +
        addSaid.scrollW + 'px and the box gives it ' + addSaid.clientW + 'px.');
    } else {
      note('F-2 arm, end-to-end: the add sentence is whole and on screen ' +
        '(content ' + addSaid.scrollW + 'px in ' + addSaid.clientW + 'px box) ' +
        '— and it is HER RULED SENTENCE, ' +
        (addSaid.text === A1_FUTURE_ONLY ? 'A1 (future-only)' : 'C3'));
    }

    // SECONDARY GUARD, and labelled as one. ⛔ This reads source text, so on
    // its own it would be exactly the weak check this file's header warns
    // about — it cannot tell whether anything is on screen. It earns its
    // place only as the ADD path's stand-in while the geometry above is
    // undrivable, and it is pinned to the ONE function that writes BOTH
    // sentences, so arm 2's real-browser failure and this share a cause.
    const fs = require('fs');
    const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const at = appSrc.indexOf('function rosterConsequence(');
    if (at === -1) {
      fail('[F-2 guard] rosterConsequence is gone from app.js — this guard ' +
        'has nothing to read and cannot be believed either way');
    } else {
      const body = appSrc.slice(at, appSrc.indexOf('\n  }', at));
      const banned = ['white-space:nowrap', 'text-overflow:ellipsis'];
      const still = banned.filter(function (b) { return body.indexOf(b) !== -1; });
      if (still.length) {
        fail('[F-2 guard] the one function that writes BOTH of her sentences ' +
          'still forces them onto a single clipped line: ' + still.join(' + ') +
          '. Her sentence cannot fit and is cut with an ellipsis.');
      } else {
        note('F-2 guard: rosterConsequence no longer forces her sentence onto ' +
          'one clipped line');
      }
    }

    // ---------------------------------------------------------------
    // ARM 2 (F-4) — the REMOVE sentence actually reaches her
    // ---------------------------------------------------------------
    await openPane(session, app.url);
    // ⛔ THE **LAST** ROW, DELIBERATELY. The sentence renders in the position
    // of the row she acted on, so acting on a row near the top would place it
    // where the fold cannot reach it and the arm would pass over the very
    // case the owner hit — she acted on the folder she had just added, which
    // was last. Acting last is the reproduction, not a harsher variant.
    const pressed = await cdp.evaluate(session,
      '(function(){var all=document.querySelectorAll(' +
      '"#manage-sec-roster .vault-roster-list button,' +
      ' #manage-sec-roster .vault-roster-list a");' +
      'var hits=[];for(var i=0;i<all.length;i++){' +
      ' if((all[i].textContent||"").trim()==="let the librarian read this")' +
      '  hits.push(all[i]);}' +
      'if(!hits.length)return "0";' +
      'hits[hits.length-1].click();return String(hits.length);})()');
    if (pressed === '0') {
      throw new Error('no row control found in the list — arm 2 measured nothing');
    }
    note('arm 2 acted on the LAST of ' + pressed + ' rows, which is the ' +
      'position the owner acted on');
    await sleep(1400);

    const rem = await measure(session, '.vault-roster-consequence', false);
    if (!rem.found) {
      fail('[F-4] after letting a folder be read again there is no ' +
        'consequence sentence in the pane at all — positive control failed');
    } else if (!rem.nonZero) {
      fail('[F-4] the remove sentence measured at zero size — vacuous');
    } else if (rem.text !== C4_REMOVE) {
      fail('[F-4] the remove sentence on screen is not her approved ' +
        'sentence. expected ' + JSON.stringify(C4_REMOVE) +
        ' but the element holds ' + JSON.stringify(rem.text));
    } else {
      if (!rem.insideClipper) {
        fail('[F-4] THE REMOVE SENTENCE IS DRAWN OUTSIDE THE BOX THAT CLIPS ' +
          'IT, so she never sees it: the sentence sits at ' + rem.top + '–' +
          rem.bottom + ' and its scrolling box shows only ' + rem.clipTop +
          '–' + rem.clipBottom + '.');
      }
      if (!rem.inViewport) {
        fail('[F-4] the remove sentence is off screen: top ' + rem.top +
          ', bottom ' + rem.bottom + ', window ' + VIEWPORT.height + 'px');
      }
      if (clipped(rem)) {
        fail('[F-4] HER APPROVED REMOVE SENTENCE IS CUT OFF ON SCREEN: it ' +
          'needs ' + rem.scrollW + 'px and the box gives it ' + rem.clientW +
          'px. ⛔ The clause that is lost is the one the sentence exists for ' +
          '— that things already set aside stay set aside.');
      }
      if (rem.insideClipper && rem.inViewport && !clipped(rem)) {
        note('F-4 arm: the remove sentence is whole, inside its box and on ' +
          'screen (content ' + rem.scrollW + 'px in ' + rem.clientW + 'px)');
      }
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* closing */ } }
    await app.stop();
  }

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_roster_sentence_reaches_her FAILED — ' +
      violations.length + ' violation(s), ' + notes.length + ' passed');
    process.exitCode = 1;
  } else {
    console.log('test_roster_sentence_reaches_her OK — ' + notes.length +
      '/' + notes.length + ' checks (F-2 and F-4, driven in real Chrome)');
  }
})().catch(function (e) {
  console.error('test_roster_sentence_reaches_her COULD NOT BE DRIVEN: ' +
    (e && e.message ? e.message : e));
  process.exitCode = 1;
});
