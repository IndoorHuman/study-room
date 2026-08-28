#!/usr/bin/env node
'use strict';
/* test_roster_removal_scope_reaches_her — phase 26.995, her sentence W-7.
 *
 * ⛔⛔ WHAT THIS EXISTS FOR. The room has an ASYMMETRY on the one surface that
 * governs its strongest protection, and it was found on 2026-08-22 while she
 * was being asked — twice — whether her `Journal` comes off her private list:
 *
 *   she ADDS a folder    -> the room says plainly that it is FUTURE-ONLY
 *                           (ROSTER_ADD_FUTURE_ONLY, hers, ruled 2026-08-20)
 *   she REMOVES a folder -> the room warns her she is turning off a
 *                           protection and says NOTHING ABOUT SCOPE AT ALL
 *
 * The behaviour was always future-only. The room simply never said so, and
 * that silence is what nearly made her answer the opposite way. Her sentence
 * (`26.995-COPY.md` § W-7) closes it. This file is what makes it stay closed.
 *
 * ⛔ IT PINS HER RECORD AGAINST THE CODE, NEVER THE CODE AGAINST ITSELF. The
 * expectation is read from the planning vault — the file written before a byte
 * of code moved. A gate that read the shipped constant and declared it correct
 * would certify whatever an agent last typed there; that is not a gate, it is
 * a mirror, and this project has recorded ELEVEN instances of exactly that,
 * the newest created inside the fix for the previous one.
 *
 * ⛔⛔ AND IT READS THE SENTENCE OUT OF THE RENDERED CARD, NOT OUT OF THE FILE.
 * A gate asserting the string exists somewhere in app.js would pass a version
 * that never reaches her eyes — a constant declared and never rendered, or
 * rendered into a slot that is not on the card. So the removal path is DRIVEN
 * in real Chrome, through the shipped controls, and the sentence is read back
 * out of the DOM that is actually on screen. That mutant is planted and killed
 * in the plan's record.
 *
 * ⛔ THE EXISTING WARNING IS ADDED TO, NEVER REPLACED. Its frame is HERS
 * (Form A, locked by 26.87-CONTEXT, owner-decided OQ-2 2026-07-30); its fill
 * (`the fence around `) is an agent's, and that is NOT a licence to reword it.
 * Both halves are pinned BY VALUE below, and the two sentences are asserted to
 * be SEPARATE elements in a fixed order — so a "tidy" that merges them, drops
 * one, or swaps their order goes red.
 *
 * ⛔⛔ 26.995-31 (§ B-27, HER RULING OF 2026-08-22: `Yes, put it there too`):
 * THIS FILE NOW COVERS **EVERY DOOR SHE CAN REMOVE A FOLDER BY**, not one.
 * There are two client doors onto the one server route, and 26.995-30 closed
 * only the first:
 *
 *   DOOR 1  the librarian's ask card  (askApply -> /api/librarian/roster)
 *   DOOR 2  the private-folders list  (editVaultRoster('remove', ...)), which
 *           the shipped renderer draws into TWO HOSTS — the Manage pane and
 *           the whole-vault import screen's fence card
 *
 * ⚠ DOOR 2 IS THE ONE SHE WOULD ACTUALLY REACH FOR, and until 26.995-31 it
 * said nothing about scope either. A gate that pinned door 1 alone would have
 * reported "she is told" while the door she uses stayed silent — which is this
 * project's named defect class wearing a new coat. So the pane is DRIVEN
 * through its own real per-row control, and her sentence is read out of the
 * rendered pane.
 *
 * ⛔ THE PANE'S OWN RECEIPT IS ADDED TO, NEVER REPLACED. It is a DIFFERENT
 * sentence of hers, already approved and already shipped, and it is pinned
 * BY VALUE and asserted to render FIRST, in its own element, byte-exact.
 *
 * THE ANTI-VACUITY ANSWERS.
 *  (1) Can it pass before the work? No — driven RED at ec2310f's bytes: the
 *      rendered card carried exactly two paragraphs and neither said anything
 *      about scope. The red is quoted in the plan's SUMMARY.
 *  (2) Could it pass over NOTHING? No. CONTROL A requires the detector to
 *      report a known-present sentence on screen before any arm is believed,
 *      and every arm pins TEXT byte-exactly before it measures geometry — so
 *      an empty card, a missing card or a truncated string fails as a missing
 *      positive control rather than sliding through.
 *  (3) Is the detector always-pass? No — CONTROL B requires it to report a
 *      sentinel string ABSENT from the same card in the same run.
 *  (4) Does a degenerate fix satisfy it? No. Deleting the existing warning and
 *      putting her sentence in its place fails [alongside]. Declaring the
 *      constant without rendering it fails [rendered]. Rendering it above the
 *      warning fails [order].
 *  (5) Does it change what removal DOES? Nothing here touches behaviour, and
 *      [behaviour] pins the four shipped strings on the removal path BY VALUE
 *      so this file cannot be read as licence to move them.
 *  (6) Could the PANE arms pass over nothing? No. [pane-control] requires the
 *      pane's own framing sentence to be found and visible, and [pane-receipt]
 *      requires her existing receipt on screen byte-exact, before any verdict
 *      about her scope sentence is believed. An empty slot fails as a missing
 *      positive control.
 *  (7) Do the PANE arms read the source? No. They read the rendered pane after
 *      a real press of the row's own control, in the same browser.
 *
 * ⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY. tests/lib/app-server.cjs builds a
 * synthetic library under os.tmpdir() and serves that; library.local.json is
 * never read.
 *
 * ⛔ AND IT SPENDS NO MONEY AND SENDS NOTHING ANYWHERE. The one route that
 * would reach a model — POST /api/librarian/ask — is answered by an in-page
 * shim, and the run FAILS if the shim did not intercept. See [no-model].
 *
 * ⛔ A MISSING RUNNER IS A FAILURE, NEVER A QUIET STOP. Every failure path
 * below throws or records a violation; nothing degrades to a no-op.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));

// ⛔ HER RECORDS. Both live OUTSIDE this repo, in the planning vault, written
// before the code was touched. If either cannot be read this file FAILS — it
// never falls back to a literal, because a fallback literal is an agent's copy
// of her words wearing the costume of a pin.
const VAULT = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker/' +
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases');
const W7_RECORD = path.join(VAULT,
  '26.995-what-may-vary-in-a-reflection/26.995-COPY.md');
const A1_RECORD = path.join(VAULT,
  '26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-2026-07-31/' +
  '26.96-DECISIONS.md');

// The folder the card is driven about. Her own first fenced entry, so the
// arms read the words she would actually be looking at.
const FOLDER = 'Journal';

// ⛔ THE EXISTING WARNING, PINNED BY VALUE — the three shipped pieces it is
// built from. This is the "provably untouched" assertion: a reword, a
// re-order, a dropped clause or a deletion of any of them turns this red.
// ⚠ Pinned, NOT lifted from app.js: lifting would make the gate agree with
// whatever the file last said, which is the defect class named above.
const WARN_HEAD = 'this turns off ';
const WARN_STEM = 'the fence around ';
const WARN_TAIL = '. tap to confirm.';
const EXISTING_WARN = WARN_HEAD + WARN_STEM + FOLDER + WARN_TAIL;
// The card's own change line, used as CONTROL A's known-good.
const CHANGE_LINE = FOLDER + " stays off the librarian's reach.";
// The pane's removal receipt — a DIFFERENT sentence of hers, on a DIFFERENT
// surface (§ B-27). Pinned here only so this file cannot be read as licence
// to move it while working next door.
const PANE_REMOVE_LINE = 'The librarian can read that folder again. Things ' +
  'already set aside stay set aside — you can bring any of them back ' +
  'yourself, one at a time.';
// CONTROL B's known-absent: a sentence no surface in the room says.
const SENTINEL = 'this gate is looking at a string that is not on the card';

// ---- DOOR 2's fixtures (26.995-31) --------------------------------------
// The pane's own framing sentence — [pane-control]'s known-good, so the pane
// reader has to prove it can say PRESENT before any pane verdict is read.
const PANE_FRAMING_OPENS = 'These folders stay private.';
// Long enough that the list scrolls inside its own 10rem box, which is the
// condition F-4 lived in. Acting on the LAST row is the reproduction.
const PANE_SEED = ['Journal', 'personnel notes', 'billing & insurance notes',
  'appraisal record', 'Clippings/journal/chatgpt', 'Clippings/journal',
  'tax and bank statements', 'therapy notes'];
const PANE_ROW_CONTROL = 'let the librarian read this';

const VIEWPORT = { width: 1400, height: 900 };

const violations = [];
const notes = [];
function fail(m) { violations.push(m); }
function note(m) { notes.push(m); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function codepoints(s) {
  return Array.from(s).map(function (c) {
    return c.codePointAt(0).toString(16).padStart(4, '0');
  }).join(' ');
}

/* ---------------------------------------------------------------------------
   Reading her records. Both throw rather than return a fallback.
   ------------------------------------------------------------------------- */

function readW7() {
  const src = fs.readFileSync(W7_RECORD, 'utf8');
  const at = src.indexOf('## W-7 —');
  if (at === -1) {
    throw new Error('§ W-7 is not in her record at ' + W7_RECORD +
      ' — this pin has no expectation to compare against and must not ' +
      'invent one');
  }
  const seg = src.slice(at);
  const m = seg.match(
    /HER ANSWER, 2026-08-22, verbatim, unbroken:\*\*\n\n```\n([^\n]*)\n```/);
  if (!m) {
    throw new Error('§ W-7 exists but carries no verbatim answer block — ' +
      'her sentence is what this gate compares against and it cannot be ' +
      'guessed');
  }
  return m[1];
}

// The same reader test_roster_ruled_copy.cjs uses, and for the same reason:
// the option number is READ, never assumed.
function readRuled(tag) {
  const src = fs.readFileSync(A1_RECORD, 'utf8');
  const re = new RegExp('^\\| ' + tag + ' \\|[^|]*\\|\\s*\\*\\*' + tag +
    '(\\d+)\\*\\*\\s*—\\s*`([^`]*)`', 'm');
  const m = src.match(re);
  if (!m) {
    throw new Error('her ruling for ' + tag + ' is not in the record at ' +
      A1_RECORD);
  }
  return m[2];
}

function liftConst(name) {
  const at = APP.indexOf('var ' + name + ' =');
  if (at === -1) { throw new Error(name + ' is not declared in app.js'); }
  const end = APP.indexOf(';', at);
  const expr = APP.slice(at + ('var ' + name + ' =').length, end).trim();
  // eslint-disable-next-line no-new-func
  const value = new Function('return (' + expr + ');')();
  if (typeof value !== 'string') {
    throw new Error(name + ' did not evaluate to a string');
  }
  return value;
}

/* ---------------------------------------------------------------------------
   The browser half.
   ------------------------------------------------------------------------- */

function shimSource(folder) {
  // ⛔ THE ONE SEAM THAT IS STUBBED, AND IT IS STUBBED SO NOTHING IS SENT.
  // The librarian classifies her sentence; that call costs money and would
  // put her words on a wire in a test run. The change list it would return
  // for a roster removal is SERVER-RESOLVED by contract (26.87-07: the value
  // classes never round-trip through the model), so the shape below is the
  // server's, not an invention — and the run FAILS if it was not used.
  return '(function(){\n' +
    '  var real = window.fetch;\n' +
    '  window.__askShim = { posts: 0, polls: 0 };\n' +
    '  window.fetch = function(input, init){\n' +
    '    var url = (typeof input === "string") ? input :' +
    ' ((input && input.url) || "");\n' +
    '    var method = ((init && init.method) ||' +
    ' (input && input.method) || "GET").toUpperCase();\n' +
    '    function J(o){ return Promise.resolve(new Response(' +
    'JSON.stringify(o), {status:200,' +
    ' headers:{"Content-Type":"application/json"}})); }\n' +
    '    if (url.indexOf("/api/librarian/ask") === 0) {\n' +
    '      if (method === "POST") { window.__askShim.posts += 1;\n' +
    '        return J({ok:true, available:true, running:true}); }\n' +
    '      window.__askShim.polls += 1;\n' +
    '      return J({ok:true, state:"done", disposition:"configurable",\n' +
    '        changes:[{key:"fenced_roster", from:null, to:null, value:' +
    JSON.stringify(folder) + '}],\n' +
    '        message:null, refusal:null, refusal_why:null, topic:null});\n' +
    '    }\n' +
    '    return real.apply(this, arguments);\n' +
    '  };\n' +
    '})();';
}

async function click(session, sel) {
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;n.scrollIntoView({block:"center"});' +
    'var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box) {
    throw new Error('not clickable / not present: ' + sel +
      ' — nothing measured after this point would be a reading');
  }
  const p = JSON.parse(box);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
}

// ONE reader for the whole card, so no two arms can drift apart: every
// paragraph, its class, its exact text, and its live box.
const READ_CARD =
  '(function(){' +
  ' var c=document.querySelector(".config-proposal");' +
  ' if(!c){return JSON.stringify({found:false,' +
  '   shim:window.__askShim||null});}' +
  ' var out=[];var n=c.querySelectorAll("p");' +
  ' for(var i=0;i<n.length;i++){' +
  '  var r=n[i].getBoundingClientRect();' +
  '  out.push({cls:n[i].className, text:n[i].textContent,' +
  '   top:Math.round(r.top), bottom:Math.round(r.bottom),' +
  '   nonZero:(r.width>0&&r.height>0),' +
  '   onScreen:(r.top>=0&&r.bottom<=window.innerHeight),' +
  '   clientW:n[i].clientWidth, scrollW:n[i].scrollWidth,' +
  '   clientH:n[i].clientHeight, scrollH:n[i].scrollHeight});}' +
  ' var btn=c.querySelector(".config-acts");' +
  ' var br=btn?btn.getBoundingClientRect():null;' +
  ' return JSON.stringify({found:true, ps:out,' +
  '  actsTop:br?Math.round(br.top):null,' +
  '  cardText:c.textContent,' +
  '  shim:window.__askShim||null});})()';

async function driveTheRemovalCard(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(2800);
  await click(session, '#room-obj-desk');
  await sleep(1500);
  await click(session, '.ask-open');
  await sleep(600);
  const seeded = await cdp.evaluate(session,
    '(function(){var i=document.querySelector(".ask-input");' +
    'if(!i)return "0";' +
    'i.value="stop the librarian reading my journal folder";' +
    'i.dispatchEvent(new Event("input",{bubbles:true}));return "1";})()');
  if (seeded !== '1') {
    throw new Error('the ask input never rendered on the desk station — ' +
      'the removal card cannot be reached and nothing below is a reading');
  }
  await sleep(300);
  await click(session, '.ask-send');
  await sleep(2500);
  const raw = await cdp.evaluate(session, READ_CARD);
  const card = JSON.parse(raw);
  if (!card.found) {
    throw new Error('the removal card never rendered after the ask — ' +
      'shim ' + JSON.stringify(card.shim) + '. A gate whose subject is ' +
      'missing FAILS; it does not stop checking.');
  }
  return card;
}

/* ---------------------------------------------------------------------------
   DOOR 2 — the private-folders list. 26.995-31, her ruling of 2026-08-22.
   ------------------------------------------------------------------------- */

// ONE reader for the pane's consequence slot, so no pane arm can drift from
// another: every paragraph in the slot, in DOM order, with its exact text and
// its live box — plus the nearest ancestor that actually CLIPS, because F-4
// was a sentence drawn outside its own scroll box and this pane is where that
// happened.
const READ_PANE =
  '(function(){' +
  ' var pane=document.getElementById("manage-sec-roster");' +
  ' if(!pane){return JSON.stringify({pane:false});}' +
  ' var slot=pane.querySelector(".vault-roster-consequence");' +
  ' if(!slot){return JSON.stringify({pane:true,slot:false,' +
  '   paneText:pane.textContent});}' +
  ' function box(el){' +
  '  var r=el.getBoundingClientRect();' +
  '  var clipper=null,walk=el.parentElement;' +
  '  while(walk&&walk!==document.body){var cs=getComputedStyle(walk);' +
  '   if((cs.overflowY==="auto"||cs.overflowY==="scroll"||' +
  '       cs.overflowY==="hidden")&&walk.scrollHeight>walk.clientHeight+1){' +
  '    clipper=walk;break;}walk=walk.parentElement;}' +
  '  var cr=clipper?clipper.getBoundingClientRect():null;' +
  '  return {text:(el.textContent||""), cls:el.className,' +
  '   top:Math.round(r.top), bottom:Math.round(r.bottom),' +
  '   nonZero:(r.width>0&&r.height>0),' +
  '   onScreen:(r.top>=0&&r.bottom<=window.innerHeight),' +
  '   clientW:el.clientWidth, scrollW:el.scrollWidth,' +
  '   clientH:el.clientHeight, scrollH:el.scrollHeight,' +
  '   hasClipper:!!clipper,' +
  '   clipTop:cr?Math.round(cr.top):null,' +
  '   clipBottom:cr?Math.round(cr.bottom):null,' +
  '   insideClipper:cr?(r.top>=cr.top-1&&r.bottom<=cr.bottom+1):true};}' +
  ' var out=[];var n=slot.querySelectorAll("p");' +
  ' for(var i=0;i<n.length;i++){out.push(box(n[i]));}' +
  ' var framing=null;var all=pane.querySelectorAll("p,div,span");' +
  ' for(var j=0;j<all.length;j++){if(all[j].children.length)continue;' +
  '  var t=(all[j].textContent||"").trim();' +
  '  if(t.indexOf(' + JSON.stringify(PANE_FRAMING_OPENS) + ')===0){' +
  '   framing=box(all[j]);break;}}' +
  ' return JSON.stringify({pane:true,slot:true,ps:out,framing:framing,' +
  '  paneText:pane.textContent});})()';

async function openRosterPane(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(2800);
  await click(session, '#room-manage-link');
  await sleep(1400);
  // 26.99955-04: THE DRIVE MOVED WITH THE DOOR — the side rail is gone
  // from the page (her 2026-08-21 ruling; it survives only inside the ☰
  // sections overlay), so this suite now opens the pane the way she does:
  // the landing door tile. ⛔ Every assertion below is unchanged — only
  // the route to the pane moved; a tile that cannot be clicked still
  // throws here rather than measuring nothing.
  await click(session, '#manage-landing .manage-tile[data-pane="roster"]');
  await sleep(1600);
  let vis = await cdp.evaluate(session,
    '(function(){var p=document.getElementById("manage-sec-roster");' +
    'return !!p && p.getBoundingClientRect().height>0 ? "1":"0";})()');
  if (vis !== '1') {
    await click(session, '#manage-landing .manage-tile[data-pane="roster"]');
    await sleep(1600);
    vis = await cdp.evaluate(session,
      '(function(){var p=document.getElementById("manage-sec-roster");' +
      'return !!p && p.getBoundingClientRect().height>0 ? "1":"0";})()');
  }
  if (vis !== '1') {
    throw new Error('the private-folders pane never rendered at a non-zero ' +
      'size — nothing measured after this point would be a reading');
  }
}

// Presses the LAST row's own control, deliberately: the sentence renders in
// the position of the row she acted on, so acting near the top would place it
// where the fold cannot reach it and the arm would pass over the very case
// the owner hit.
async function driveTheRosterPane(session, url) {
  await openRosterPane(session, url);
  const pressed = await cdp.evaluate(session,
    '(function(){var all=document.querySelectorAll(' +
    '"#manage-sec-roster .vault-roster-list button,' +
    ' #manage-sec-roster .vault-roster-list a");' +
    'var hits=[];for(var i=0;i<all.length;i++){' +
    ' if((all[i].textContent||"").trim()===' +
    JSON.stringify(PANE_ROW_CONTROL) + ')hits.push(all[i]);}' +
    'if(!hits.length)return "0";' +
    'hits[hits.length-1].click();return String(hits.length);})()');
  if (pressed === '0') {
    throw new Error('no per-row removal control found in the private-folders ' +
      'pane — DOOR 2 was never driven and nothing below is a reading');
  }
  await sleep(1600);
  const raw = await cdp.evaluate(session, READ_PANE);
  const pane = JSON.parse(raw);
  pane.rows = Number(pressed);
  if (!pane.pane) {
    throw new Error('the private-folders pane vanished after the press');
  }
  return pane;
}

/* ---------------------------------------------------------------------------
   main
   ------------------------------------------------------------------------- */

(async function main() {
  let HER;
  let ADD;
  try {
    HER = readW7();
    ADD = readRuled('A');
  } catch (e) {
    console.log('  FAIL  [instrument] ' + (e && e.message ? e.message : e));
    console.log('');
    console.log('test_roster_removal_scope_reaches_her FAILED — her record ' +
      'could not be read, and this gate never invents an expectation');
    process.exitCode = 1;
    return;
  }

  // ---- [record] the shipped constant IS her sentence --------------------
  let shipped = null;
  try {
    shipped = liftConst('ROSTER_REMOVE_FUTURE_ONLY');
  } catch (e) {
    fail('[record] app.js: ⛔ THE ROOM STILL SAYS NOTHING ABOUT SCOPE WHEN ' +
      'SHE REMOVES A FOLDER. ROSTER_REMOVE_FUTURE_ONLY is not declared (' +
      (e && e.message ? e.message : e) + '). She ruled the sentence on ' +
      '2026-08-22 and it is recorded at ' + W7_RECORD + ' § W-7:\n      ' +
      JSON.stringify(HER) + '\n      Her words first, in the record, then ' +
      'here — never the other way round.');
  }
  if (shipped !== null) {
    if (!shipped.length) {
      fail('[record] ROSTER_REMOVE_FUTURE_ONLY is the empty string, but ' +
        'she ruled: ' + JSON.stringify(HER));
    } else if (shipped !== HER) {
      fail('[record] ROSTER_REMOVE_FUTURE_ONLY DOES NOT MATCH HER RULING.' +
        '\n      she ruled: ' + JSON.stringify(HER) +
        '\n      shipped  : ' + JSON.stringify(shipped) +
        '\n      ⛔ Her words are the truth here. Change the code, never ' +
        'the record.');
    } else if (codepoints(shipped) !== codepoints(HER)) {
      fail('[record] bytes differ below the glyph: ' + codepoints(shipped) +
        ' vs ' + codepoints(HER));
    } else {
      note('W-7 ships exactly as she ruled it (' + shipped.length +
        ' chars, codepoints match her record)');
    }
    // ⛔ The two characters a "tidy" moves without showing in a diff.
    if (shipped.indexOf('—') === -1) {
      fail('[record] ROSTER_REMOVE_FUTURE_ONLY has lost its EM DASH ' +
        '(U+2014) — an en dash or a hyphen is not what she ruled.');
    } else { note('W-7 keeps its em dash'); }
    if (shipped && shipped[0] !== shipped[0].toUpperCase()) {
      fail('[record] ROSTER_REMOVE_FUTURE_ONLY has been LOWERCASED. This ' +
        'surface capitalises — unlike the room\'s lowercase session copy — ' +
        'and she ruled it in sentence case.');
    } else { note('W-7 keeps its sentence case'); }
  }

  // ---- [add-unchanged] the add direction must not drift -----------------
  try {
    const add = liftConst('ROSTER_ADD_FUTURE_ONLY');
    if (add !== ADD) {
      fail('[add-unchanged] ⛔ ROSTER_ADD_FUTURE_ONLY MOVED while work ' +
        'happened next to it.\n      she ruled: ' + JSON.stringify(ADD) +
        '\n      shipped  : ' + JSON.stringify(add));
    } else if (codepoints(add) !== codepoints(ADD)) {
      fail('[add-unchanged] ROSTER_ADD_FUTURE_ONLY differs below the glyph');
    } else {
      note('ROSTER_ADD_FUTURE_ONLY is byte-unchanged against her own ' +
        '26.96 record (the add direction did not drift)');
    }
    // ---- [parallel] the symmetry SHE chose -----------------------------
    // Her removal sentence was picked because it is her add sentence with
    // its first three words swapped. That parallel is the reason she took
    // it, so an agent "improving" either half is caught here.
    if (shipped) {
      const tail = ADD.split(' ').slice(3).join(' ');
      if (shipped.indexOf(tail) === -1 ||
          shipped.slice(shipped.length - tail.length) !== tail) {
        fail('[parallel] ⛔ THE SYMMETRY SHE CHOSE IS BROKEN. Her removal ' +
          'sentence is her ADD sentence with only its first three words ' +
          'changed, and that is why she took it.\n      add tail   : ' +
          JSON.stringify(tail) + '\n      remove line: ' +
          JSON.stringify(shipped));
      } else {
        note('the add/remove parallel she chose is intact — only the first ' +
          'three words differ');
      }
    }
  } catch (e) {
    fail('[add-unchanged] ' + (e && e.message ? e.message : e));
  }

  // ---- [behaviour] the shipped strings on the removal path, pinned ------
  // ⛔ This plan changes what the room SAYS, never what removal DOES. These
  // four pins are what stop a later reader treating the new sentence as
  // licence to move anything else on the path.
  [['ASK_FORM_A_HEAD', WARN_HEAD], ['ASK_CONFIRM_PHRASE', WARN_TAIL]]
    .forEach(function (row) {
      try {
        const v = liftConst(row[0]);
        if (v !== row[1]) {
          fail('[behaviour] ' + row[0] + ' MOVED — the existing removal ' +
            'warning is HERS in its frame (Form A, owner-decided OQ-2) and ' +
            'may not be reworded.\n      pinned : ' + JSON.stringify(row[1]) +
            '\n      shipped: ' + JSON.stringify(v));
        } else { note(row[0] + ' is byte-unchanged'); }
      } catch (e) {
        fail('[behaviour] ' + (e && e.message ? e.message : e));
      }
    });
  if (APP.indexOf("ASK_PROTECTION_COPY[ASK_ROSTER_KEY] = '" + WARN_STEM +
      "'") === -1) {
    fail('[behaviour] ⛔ THE EXISTING REMOVAL WARNING\'S STEM MOVED. It is ' +
      'pinned as ' + JSON.stringify(WARN_STEM) + '. It is an AGENT\'S words, ' +
      'not hers — and that is NOT a licence to reword it into something ' +
      'better. Her sentence goes ALONGSIDE it, never instead of it.');
  } else { note('ASK_PROTECTION_COPY[ASK_ROSTER_KEY] is byte-unchanged'); }
  if (APP.indexOf(PANE_REMOVE_LINE.slice(0, 40)) === -1) {
    fail('[behaviour] the private-folders pane\'s own removal receipt — a ' +
      'DIFFERENT sentence of hers, on a different surface (§ B-27) — is no ' +
      'longer in app.js. Nothing in this plan may touch it.');
  } else { note('the pane\'s own removal receipt is untouched (§ B-27)'); }

  // ---- the browser half --------------------------------------------------
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: VIEWPORT.width, height: VIEWPORT.height,
        deviceScaleFactor: 1, mobile: false });
    // ⛔ Page.enable BEFORE addScriptToEvaluateOnNewDocument. Page.navigate
    // works without the domain enabled and this does not, so the shim would
    // silently fail to install — the 26.995-28 finding, reused.
    await cdp.send(session, 'Page.enable', {});
    await cdp.send(session, 'Page.addScriptToEvaluateOnNewDocument',
      { source: shimSource(FOLDER) });
    await sleep(500);

    const card = await driveTheRemovalCard(session, app.url);

    // ---- [no-model] the artifact is checked for EFFECT ------------------
    // ⚠ 26.995-28's finding, applied here: an artifact that never fired
    // reads exactly like one that did. If the shim did not intercept, the
    // run either sent her sentence to a model or measured a different page.
    const shim = card.shim || {};
    if (!(shim.posts >= 1 && shim.polls >= 1)) {
      fail('[no-model] ⛔ THE ASK SHIM DID NOT INTERCEPT (' +
        JSON.stringify(shim) + '). Either a real librarian call was made — ' +
        'money, and her sentence on a wire — or this card came from ' +
        'somewhere else. Its verdict is NOT read.');
    } else {
      note('no model was called: the ask route was intercepted ' +
        shim.posts + ' post / ' + shim.polls + ' poll, and the library ' +
        'served was the synthetic one under os.tmpdir()');
    }

    const find = function (text) {
      return card.ps.filter(function (p) {
        return (p.text || '').trim() === text;
      });
    };

    // ---- CONTROL A: the detector can say PRESENT and ON SCREEN ---------
    const ctrlA = find(CHANGE_LINE);
    if (ctrlA.length !== 1) {
      fail('[control A] the card\'s own change line ' +
        JSON.stringify(CHANGE_LINE) + ' was not found exactly once (' +
        ctrlA.length + '). The detector was never shown a known-good case, ' +
        'so nothing below is a reading. Card said: ' +
        JSON.stringify(card.cardText));
    } else if (!ctrlA[0].nonZero || !ctrlA[0].onScreen) {
      fail('[control A] THE DETECTOR IS ALWAYS-FAIL: it reports the card\'s ' +
        'own change line as not visible (' + JSON.stringify(ctrlA[0]) + ')');
    } else {
      note('control A: the card\'s change line IS on screen (top ' +
        ctrlA[0].top + ' bottom ' + ctrlA[0].bottom + ')');
    }

    // ---- CONTROL B: the detector can say ABSENT ------------------------
    if (find(SENTINEL).length !== 0 ||
        (card.cardText || '').indexOf(SENTINEL) !== -1) {
      fail('[control B] THE DETECTOR IS ALWAYS-PASS: it reports a sentinel ' +
        'string as present on the card');
    } else {
      note('control B: the detector reports a known-absent sentence as absent');
    }

    // ---- ARM 1: HER SENTENCE REACHES THE RENDERED CARD -----------------
    const hers = find(HER);
    if (hers.length === 0) {
      fail('[rendered] ⛔⛔ SHE IS STILL NOT TOLD THAT REMOVING A FOLDER IS ' +
        'FUTURE-ONLY. Her sentence is not on the rendered removal card.\n' +
        '      she ruled: ' + JSON.stringify(HER) + '\n' +
        '      the card actually said: ' + JSON.stringify(card.cardText) +
        '\n      ⛔ The room says the future-only fact when she ADDS a ' +
        'folder and NOT when she removes one. That asymmetry is what ' +
        'nearly changed her answer, and it is the whole reason this gate ' +
        'exists. A constant declared and never rendered does not close it.');
    } else if (hers.length > 1) {
      fail('[rendered] her sentence renders ' + hers.length + ' times on ' +
        'one card. It is said once or not at all.');
    } else if (!hers[0].nonZero) {
      fail('[rendered] her sentence is in the DOM at ZERO SIZE — present ' +
        'to a source read, invisible to her');
    } else if (!hers[0].onScreen) {
      fail('[rendered] her sentence is drawn OFF SCREEN (top ' +
        hers[0].top + ', bottom ' + hers[0].bottom + ', window ' +
        VIEWPORT.height + '). This is F-4 in a new place: the sentence ' +
        'exists and she never sees it.');
    } else if (hers[0].scrollW > hers[0].clientW + 1 ||
               hers[0].scrollH > hers[0].clientH + 1) {
      fail('[rendered] her sentence is CLIPPED (content ' + hers[0].scrollW +
        'x' + hers[0].scrollH + ' in a box ' + hers[0].clientW + 'x' +
        hers[0].clientH + '). This is F-2 in a new place — and the half ' +
        'that goes is the half that carries the meaning.');
    } else {
      note('HER SENTENCE IS ON THE RENDERED CARD, whole and on screen: ' +
        JSON.stringify(HER));
    }

    // ---- ARM 2: ALONGSIDE — the existing warning is still there --------
    const warn = find(EXISTING_WARN);
    if (warn.length !== 1) {
      fail('[alongside] ⛔ THE EXISTING WARNING IS GONE OR CHANGED. It must ' +
        'be added to, never replaced: its frame is HERS (Form A, ' +
        'owner-decided OQ-2 2026-07-30).\n      expected: ' +
        JSON.stringify(EXISTING_WARN) + '\n      the card said: ' +
        JSON.stringify(card.cardText));
    } else if (!warn[0].nonZero || !warn[0].onScreen) {
      fail('[alongside] the existing warning is no longer visible on the ' +
        'card (' + JSON.stringify(warn[0]) + ')');
    } else {
      note('the existing warning is still on the card, byte-exact and on ' +
        'screen');
    }
    if (hers.length === 1 && warn.length === 1) {
      if (hers[0] === warn[0] || hers[0].cls === undefined) {
        fail('[alongside] her sentence and the warning are the SAME ' +
          'element — they were merged, not added alongside');
      }
      // ---- ARM 3: ORDER — warning, then scope, then the confirm -------
      if (!(warn[0].top < hers[0].top)) {
        fail('[order] her scope sentence renders ABOVE the warning (scope ' +
          'top ' + hers[0].top + ', warning top ' + warn[0].top + '). The ' +
          'consequence leads; the scope answers it.');
      } else if (card.actsTop === null) {
        fail('[order] the card has no acts row — the confirm is gone');
      } else if (!(hers[0].bottom <= card.actsTop + 1)) {
        fail('[order] her sentence is drawn BELOW the confirm row (bottom ' +
          hers[0].bottom + ', acts top ' + card.actsTop + '). The whole ' +
          'point is that the consequence and its scope are in the SAME ' +
          'GLANCE as the tap.');
      } else {
        note('order holds: the warning, then her scope sentence, then the ' +
          'confirm — one glance');
      }
    }

    /* ===================================================================
       DOOR 2 — the private-folders list (§ B-27, her ruling 2026-08-22)
       =================================================================== */

    // Seeded through the shipped route, so the pane is driven against a list
    // long enough to scroll in its own box.
    for (const f of PANE_SEED) {
      await cdp.evaluate(session,
        'fetch("/api/librarian/roster",{method:"POST",' +
        'headers:{"Content-Type":"application/json"},' +
        'body:JSON.stringify({op:"add",folder:' + JSON.stringify(f) + '})})' +
        '.then(r=>r.text())');
    }
    await sleep(900);

    const pane = await driveTheRosterPane(session, app.url);

    // ---- [pane-control]: the pane reader can say PRESENT and VISIBLE ----
    if (!pane.framing) {
      fail('[pane-control] the private-folders pane\'s own framing sentence ' +
        JSON.stringify(PANE_FRAMING_OPENS) + ' was not found, so the pane ' +
        'reader was never shown a known-good case and nothing below is a ' +
        'reading. Pane said: ' + JSON.stringify(pane.paneText));
    } else if (!pane.framing.nonZero) {
      fail('[pane-control] THE PANE READER IS ALWAYS-FAIL: the pane\'s own ' +
        'framing sentence measured at zero size');
    } else {
      note('pane control: the pane\'s framing sentence is present and ' +
        'visible, and the row control was pressed on the LAST of ' +
        pane.rows + ' rows');
    }
    // ---- [pane-control] the reader can also say ABSENT ------------------
    if ((pane.paneText || '').indexOf(SENTINEL) !== -1) {
      fail('[pane-control] THE PANE READER IS ALWAYS-PASS: it reports a ' +
        'sentinel string as present in the pane');
    } else {
      note('pane control: the reader reports a known-absent sentence as ' +
        'absent in the pane');
    }

    const paneP = (pane.slot && Array.isArray(pane.ps)) ? pane.ps : [];
    const paneText = function (i) {
      return (paneP[i] && (paneP[i].text || '').trim()) || '';
    };
    const paneClipped = function (b) {
      return (b.scrollW > b.clientW + 1) || (b.scrollH > b.clientH + 1);
    };

    // ---- [pane-receipt]: HER EXISTING RECEIPT IS UNTOUCHED AND FIRST ----
    // ⛔ It is a different sentence of hers, on a different question, already
    // approved and already shipped. This plan adds beside it and may not
    // reword, reorder, merge or drop it.
    if (!pane.slot) {
      fail('[pane-receipt] after pressing the row\'s own removal control ' +
        'there is no consequence slot in the pane at all — positive control ' +
        'failed, and every verdict below is vacuous. Pane said: ' +
        JSON.stringify(pane.paneText));
    } else if (!paneP.length) {
      fail('[pane-receipt] the pane\'s consequence slot rendered EMPTY after ' +
        'a removal — her approved receipt is gone');
    } else if (paneText(0) !== PANE_REMOVE_LINE) {
      fail('[pane-receipt] ⛔ THE PANE\'S OWN REMOVAL RECEIPT IS NOT FIRST, ' +
        'OR HAS CHANGED. It is HERS, approved, and this plan adds BESIDE it.' +
        '\n      expected first: ' + JSON.stringify(PANE_REMOVE_LINE) +
        '\n      actually first: ' + JSON.stringify(paneText(0)));
    } else if (!paneP[0].nonZero || !paneP[0].onScreen ||
               !paneP[0].insideClipper || paneClipped(paneP[0])) {
      fail('[pane-receipt] her existing receipt is no longer readable on ' +
        'screen after the change beside it (' + JSON.stringify(paneP[0]) + ')');
    } else {
      note('the pane\'s own receipt is byte-exact, FIRST, whole and on ' +
        'screen — added beside, never replaced');
    }

    // ---- [pane-rendered]: HER W-7 SENTENCE REACHES THE RENDERED PANE ----
    const paneHers = paneP.filter(function (b) {
      return (b.text || '').trim() === HER;
    });
    if (paneHers.length === 0) {
      fail('[pane-rendered] ⛔⛔ THE DOOR SHE WOULD ACTUALLY USE STILL DOES ' +
        'NOT TELL HER THAT REMOVING A FOLDER IS FUTURE-ONLY.\n' +
        '      she ruled the sentence: ' + JSON.stringify(HER) + '\n' +
        '      she ruled it goes here too, 2026-08-22: "Yes, put it there ' +
        'too." (§ B-27)\n' +
        '      the pane actually said: ' + JSON.stringify(
        paneP.map(function (b) { return (b.text || '').trim(); })) + '\n' +
        '      ⛔ Her sentence is on the librarian\'s ask card and NOT on the ' +
        'private-folders list. One removal door tells her and the other does ' +
        'not, and the silent one is the one with a control under her thumb.');
    } else if (paneHers.length > 1) {
      fail('[pane-rendered] her sentence renders ' + paneHers.length +
        ' times in the pane. It is said once or not at all.');
    } else if (!paneHers[0].nonZero) {
      fail('[pane-rendered] her sentence is in the pane\'s DOM at ZERO SIZE ' +
        '— present to a source read, invisible to her');
    } else if (!paneHers[0].insideClipper) {
      fail('[pane-rendered] ⛔ HER SENTENCE IS DRAWN OUTSIDE THE BOX THAT ' +
        'CLIPS IT — this is F-4 happening again, in the pane where it was ' +
        'found. It sits at ' + paneHers[0].top + '–' + paneHers[0].bottom +
        ' and its scrolling box shows only ' + paneHers[0].clipTop + '–' +
        paneHers[0].clipBottom + '.');
    } else if (!paneHers[0].onScreen) {
      fail('[pane-rendered] her sentence is drawn OFF SCREEN in the pane ' +
        '(top ' + paneHers[0].top + ', bottom ' + paneHers[0].bottom +
        ', window ' + VIEWPORT.height + ')');
    } else if (paneClipped(paneHers[0])) {
      fail('[pane-rendered] HER SENTENCE IS CLIPPED IN THE PANE (content ' +
        paneHers[0].scrollW + 'x' + paneHers[0].scrollH + ' in a box ' +
        paneHers[0].clientW + 'x' + paneHers[0].clientH + '). This is F-2 ' +
        'happening again — and the half that goes is the half that carries ' +
        'the meaning.');
    } else {
      note('HER SENTENCE IS ON THE RENDERED PANE, whole, inside its box and ' +
        'on screen: ' + JSON.stringify(HER));
    }

    // ---- [pane-alongside] + [pane-order] --------------------------------
    if (paneHers.length === 1 && paneText(0) === PANE_REMOVE_LINE) {
      if (paneP.length !== 2) {
        fail('[pane-alongside] the pane\'s consequence slot holds ' +
          paneP.length + ' paragraphs after a removal; it must hold exactly ' +
          'two — her receipt and her scope sentence, separate elements. ' +
          'Merging them into one would let a later "tidy" reword either half ' +
          'without a diff showing which.');
      } else if (!(paneP[0].top < paneHers[0].top)) {
        fail('[pane-order] her scope sentence renders ABOVE the pane\'s own ' +
          'receipt (scope top ' + paneHers[0].top + ', receipt top ' +
          paneP[0].top + '). The receipt names the act; the scope qualifies ' +
          'an act already named — the same order the removal card ships.');
      } else {
        note('pane order holds: her receipt names the act, then her scope ' +
          'sentence qualifies it — the same order as the removal card');
      }
    }

    // ---- [both-doors] the thing this whole item exists for ---------------
    // ⭐ Stated as its own assertion rather than left to be inferred from two
    // green arms above, because "every door tells her" is the claim, and a
    // claim nobody asserts is a claim nobody can see break.
    if (hers.length === 1 && paneHers.length === 1) {
      note('⭐ BOTH REMOVAL DOORS TELL HER: the librarian\'s ask card AND ' +
        'the private-folders list each carry her W-7 sentence, read out of ' +
        'the rendered surface in this same browser run');
    } else {
      fail('[both-doors] ⛔ SHE IS NOT TOLD AT EVERY DOOR. card: ' +
        hers.length + ' occurrence(s); private-folders list: ' +
        paneHers.length + '. A removal door that stays silent about scope is ' +
        'the defect this whole item exists to close.');
    }
  } catch (e) {
    fail('[instrument] ' + (e && e.message ? e.message : e));
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_roster_removal_scope_reaches_her FAILED — ' +
      violations.length + ' violation(s)');
    process.exitCode = 1;
  } else {
    console.log('test_roster_removal_scope_reaches_her OK — she is told, at ' +
      'EVERY door she can remove a folder by and in her own words, that ' +
      'removing one is future-only: the librarian\'s ask card AND the ' +
      'private-folders list, both read out of the rendered surface, with the ' +
      'sentence already on each surface untouched beside it');
  }
})().catch(function (e) {
  console.log('  FAIL  [instrument] ' + (e && e.stack ? e.stack : e));
  console.log('');
  console.log('test_roster_removal_scope_reaches_her FAILED — the runner ' +
    'itself did not complete. A missing runner is a FAILURE, never a quiet ' +
    'pass.');
  process.exitCode = 1;
});
