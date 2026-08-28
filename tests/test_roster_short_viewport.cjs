#!/usr/bin/env node
'use strict';
/* test_roster_short_viewport — phase 26.96, VERIFICATION truth 19.
 *
 * WHAT WAS OWED. Truth 19 was recorded PRESENT_BEHAVIOR_UNVERIFIED: the roster
 * list carries `max-height:10rem;overflow-y:auto`, the declaration is wired on
 * the pane, and NOBODY EVER DROVE IT. Presence does not qualify — a style that
 * is present can be overridden, can sit on the wrong element, or can be
 * satisfied while the thing it exists to protect is still off screen. The human
 * check it was routed to was never run.
 *
 * WHAT THE CAP EXISTS FOR. Her private-folder list is unbounded — she may fence
 * twenty folders. The add field ("keep this private too") sits BELOW the list.
 * Without the cap, every folder she fences pushes that field further down the
 * pane, and on a short window she can no longer reach the control that adds the
 * next one. The cap's whole job is: PAST TEN REMS, MORE ROWS MUST NOT MOVE THE
 * ADD FIELD AT ALL. That is a measurable property, and it is what arm 1 drives.
 *
 * ⛔ WHY REAL CHROME AND NOT A SOURCE READ. This is layout. A grep for
 * "max-height:10rem" is exactly the check truth 19 already had, and truth 19 is
 * the gap. Everything below is measured off live boxes in a real browser at a
 * deliberately short viewport, on a roster long enough to overflow.
 *
 * ⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY. tests/lib/app-server.cjs builds a
 * synthetic library under os.tmpdir(); library.local.json is never read.
 *
 * THE ANTI-VACUITY ANSWERS (26.96-VALIDATION.md's contract).
 *  1. Can it pass BEFORE the work? No — driven RED in a scratch clone with the
 *     cap deleted from the list's style; md5-confirmed; output in the return.
 *  2. Can it STILL pass once broken? No — arm 1 compares two live measurements
 *     taken at DIFFERENT roster lengths; removing the cap makes the second one
 *     move by roughly one row per extra folder, which is the failure.
 *  3. Does a DEGENERATE implementation satisfy it? No. A pane that rendered no
 *     add field, no rows, or a list that did not actually overflow fails as a
 *     missing positive control BEFORE any geometry is believed — and a list
 *     pinned to zero height would fail the "the field is visible" arm.
 *  4. Evaluation order or source order? EVALUATION — bounding boxes read after
 *     the pane really rendered, twice, at two roster lengths.
 *  5. Does it match THE FIX'S OWN COMMENT? There is no grep here at all.
 *
 * ⚠⚠ AMENDED 2026-08-22 BY PLAN 26.96-24, AND THE PARAGRAPHS ABOVE ARE LEFT
 * STANDING BECAUSE THEY ARE TRUE OF WHAT THEY DESCRIBE. Everything above
 * measures the pane AT REST — the roster is seeded by POSTing to the route
 * and the geometry is then read. ⛔ THAT IS ONLY HALF THE DIMENSION: her
 * Beat 6 ruling made the pane TALLER AFTER AN ADD (the receipt AND the
 * returning add row where only the receipt used to render), and no arm here
 * ever pressed the shipped control. Arms 4, 5 and 6 below drive that state,
 * with their own anti-vacuity answers written beside their helpers.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));
// 26.96-24: the fixture library's path is ASSERTED, not trusted. See main().
const os = require('os');
const fs = require('fs');

// Deliberately SHORT. This is the window the gap is about: a laptop screen
// with the browser not maximised.
const VIEWPORT = { width: 1100, height: 420 };

// ⚠ TWO lengths, and BOTH are past the 10rem cap. The property being measured
// is "past the cap, more rows move nothing" — comparing a short roster with a
// long one would only measure the cap's own height and would still pass on a
// pane that grew without limit after it.
function names(n, tag) {
  const out = [];
  for (let i = 0; i < n; i += 1) { out.push(tag + ' folder ' + (i + 1)); }
  return out;
}
const FIRST = names(12, 'first');
const MORE = names(12, 'second');   // added on top of FIRST → 24 rows

const violations = [];
const notes = [];
function fail(m) { violations.push(m); }
function note(m) { notes.push(m); }
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

async function openPane(session, url) {
  await cdp.send(session, 'Page.navigate', { url: url });
  await sleep(2500);
  await click(session, '#room-manage-link');
  await sleep(1200);
  // 26.99955-03: THE DRIVE MOVED WITH THE DOOR — the side rail is gone
  // from the page (her 2026-08-21 ruling; it survives only inside the ☰
  // sections overlay), so this suite now opens the pane the way she does:
  // the landing door tile. ⛔ Every assertion below is unchanged — only
  // the route to the pane moved, and a tile that cannot be clicked at
  // this viewport still throws here rather than measuring nothing.
  await click(session, '#manage-landing .manage-tile[data-pane="roster"]');
  await sleep(1500);
  const vis = await cdp.evaluate(session,
    '(function(){var p=document.getElementById("manage-sec-roster");' +
    'return !!p && p.getBoundingClientRect().height>0 ? "1":"0";})()');
  if (vis !== '1') {
    throw new Error('the pane never rendered at a non-zero size — nothing ' +
      'measured after this point would be a reading');
  }
}

// ONE reading, used for both drives so they cannot drift apart.
const READ = '(function(){' +
  'var pane=document.getElementById("manage-sec-roster");' +
  'if(!pane)return JSON.stringify({pane:false});' +
  'var list=pane.querySelector(".vault-roster-list");' +
  'var add=pane.querySelector(".vault-roster-add-input");' +
  'var rows=pane.querySelectorAll(".vault-roster-remove").length;' +
  'var pr=pane.getBoundingClientRect();' +
  'var out={pane:true,rows:rows,' +
  ' paneScrollW:pane.scrollWidth,paneClientW:pane.clientWidth,' +
  ' docScrollW:document.documentElement.scrollWidth,' +
  ' winW:window.innerWidth,winH:window.innerHeight};' +
  'if(!list){out.list=false;}else{var lr=list.getBoundingClientRect();' +
  ' out.list=true;out.listH=Math.round(lr.height);' +
  ' out.listClientH=list.clientHeight;out.listScrollH=list.scrollHeight;' +
  ' out.listOverflows=(list.scrollHeight>list.clientHeight+1);' +
  ' var cs=getComputedStyle(list);out.listOverflowY=cs.overflowY;}' +
  // ⚠ 26.96-28: THE PICKER'S OWN BOX, ADDED AS NEW KEYS ONLY. Nothing above
  // is read differently; the three at-rest arms compute from the same fields
  // they always did, so their figures stay comparable by value.
  'var pick=pane.querySelector(".vault-roster-picker");' +
  'if(!pick){out.picker=false;}else{var kr=pick.getBoundingClientRect();' +
  ' out.picker=true;out.pickerH=Math.round(kr.height);' +
  ' out.pickerW=Math.round(kr.width);' +
  ' out.pickerFromPaneTop=Math.round(kr.top-pr.top);' +
  ' out.pickerRows=pick.querySelectorAll(".vault-roster-choice").length;' +
  ' out.pickerNoMatch=!!pick.querySelector(".vault-roster-nomatch");}' +
  'if(!add){out.add=false;}else{var ar=add.getBoundingClientRect();' +
  ' out.add=true;out.addNonZero=(ar.width>0&&ar.height>0);' +
  ' out.addTop=Math.round(ar.top);out.addBottom=Math.round(ar.bottom);' +
  ' out.addFromPaneTop=Math.round(ar.top-pr.top);' +
  ' out.addInViewport=(ar.top>=0&&ar.bottom<=window.innerHeight);}' +
  'return JSON.stringify(out);})()';

async function read(session) {
  return JSON.parse(await cdp.evaluate(session, READ));
}

async function seed(session, list) {
  for (const f of list) {
    await cdp.evaluate(session,
      'fetch("/api/librarian/roster",{method:"POST",' +
      'headers:{"Content-Type":"application/json"},' +
      'body:JSON.stringify({op:"add",folder:' + JSON.stringify(f) + '})})' +
      '.then(r=>r.text())');
  }
  await sleep(800);
}

/* ===========================================================================
   26.96-24 — THE HALF THE THREE ARMS ABOVE CANNOT SEE: THE PANE AFTER A UI ADD.

   ⛔ WHAT WAS STILL OWED AFTER THE ARMS ABOVE SHIPPED. Everything above
   measures the pane AT REST. `seed` POSTs to the roster route and the pane is
   then read; nothing above ever presses the shipped add control. Her Beat 6
   ruling of the 2026-08-20 sitting — `Yes this box should come straight back` —
   made the pane TALLER after an add: the receipt AND the returning add row now
   render where only the receipt used to. That state was driven by nothing, so
   a cap that holds at rest was standing in for a cap that holds after an add.
   ⛔ THE EARLIER CONTRACT (the receipt REPLACED the box) WAS ALSO HERS. She
   revisited it with the consequence in front of her; both stay on the record.

   THE ANTI-VACUITY ANSWERS FOR THE POST-ADD ARMS.
    1. Can they pass BEFORE the work? No — arm 4 was driven RED by reverting her
       Beat 6 ruling in a scratch tree (the returning add row removed), and arm 5
       by deleting the list cap. md5 asserted moved both times, and the page was
       asked what it actually looked like BEFORE either verdict was read.
    2. Can they STILL pass once broken? No — arm 4 reads the pane AFTER the tap,
       where a reverted Beat 6 leaves no add field at all; arm 5 compares the
       list's own box across the tap and asks whether it still overflows.
    3. Does a DEGENERATE implementation satisfy them? No. The tap is proven to
       have landed BEFORE any post-add geometry is believed: the typed name is
       read back out of the shipped field, the route's own receipt sentence must
       have appeared, and the roster must have grown by EXACTLY one row. A
       post-add measurement taken on a pane where nothing was added is a vacuous
       pass and those three controls refuse it.
    4. Evaluation order or source order? EVALUATION — boxes read off a real
       browser after a trusted press ran the shipped handler.
    5. Does it match THE FIX'S OWN COMMENT? There is no grep here at all.

   ⛔⛔ THE TWO PLANTS, DRIVEN 2026-08-22 IN A SCRATCH TREE AT 9f0c51f, WITH THE
   PAGE ASKED WHAT IT LOOKED LIKE BEFORE ANY VERDICT WAS READ. A mutation that
   never applied reads exactly like a gate that does not hold, so the md5 is
   asserted MOVED first; and a red on the wrong reason is not a red for this
   arm, so the browser is asked what changed before the suite is believed.

   PLANT 1 — HER BEAT 6 RULING REVERTED. The returning add row wrapped in
   `(inAdd ? '' : …)`, so the receipt REPLACES the box, which is what shipped
   before 2026-08-20. app.js md5 837fd283… -> 668c7251…, asserted moved, the two
   planted lines printed from disk. THE PAGE, BEFORE THE VERDICT: `rows=29  add
   FIELD present after the tap=false  add BUTTON present after the tap=false`,
   where the unplanted tree reads `true` / `true` for the same probe. THEN the
   verdict: rc=1, ONE violation, `[truth-19/arm4]`. Arms 1–3 and 5 stayed green,
   which is the point — the at-rest half cannot see this at all.

   PLANT 2 — THE LIST CAP DELETED. `style="max-height:10rem;overflow-y:auto"`
   removed from the shipped list. app.js md5 837fd283… -> 7fc44647…, asserted
   moved. THE PAGE, BEFORE THE VERDICT: `content(scrollHeight)=888px
   box(clientHeight)=888px  overflows=false  overflow-y=visible` before the tap
   and `920px in 920px` after it — the box grew to fit rather than scrolling.
   THEN the verdict: rc=1, THREE violations — the at-rest `[control]`,
   `[truth-19/arm1]` AND `[truth-19/arm5]`. ⛔ Arm 5 fires on its own
   measurement (the list's own box across the tap, 888px -> 920px) rather than
   riding arm 1's red.

   RESTORED: app.js md5 back to 837fd283…, byte-identical to HEAD, and this
   suite green 10/10. The three at-rest arms' note lines are byte-identical to
   the run taken before this section existed (md5 48cd77d2… over those 5 lines,
   both runs). ⛔ NEITHER PLANT WAS EVER APPLIED TO THE LIVE TREE.

   ⚠ WHY THE POST-ADD REACH MEASUREMENT IS WRITTEN OUT AGAIN RATHER THAN SHARED
   WITH ARM 2. Plan 26.96-24 forbids touching the three arms above — their note
   figures are compared BY VALUE before and after this file grew, and a shared
   helper would have edited arm 2 to build them. The two are also not the same
   measurement: this one has to answer "is there an add field at all", which is
   the shape a reverted Beat 6 takes and which arm 2 can never see, because at
   rest the field is always there. ⚠ The divergence risk is real and is named
   here rather than left for a later reader to discover.
   =========================================================================== */

const PANE_SEL = '#manage-sec-roster';
const ADD_FIELD_SEL = PANE_SEL + ' .vault-roster-add-input';
const ADD_BUTTON_SEL = PANE_SEL + ' .vault-roster-add';
const SAID_SEL = PANE_SEL + ' .vault-roster-consequence p';

/* Pinned by value, like every other budget in this tree. `timeout(1)` does not
   exist on this machine, so the deadline lives here rather than around the
   process — and the wait is a POLL OF THE PAGE, never a fixed sleep: a sleep
   long enough to be safe is also long enough to hide a render that never came. */
const SETTLE_DEADLINE_MS = 15000;
const SETTLE_POLL_MS = 50;

/* Deliberately unlike every seeded name, so "the roster grew by one" cannot be
   satisfied by a duplicate of something already on the list. */
const TYPED = 'a folder the gate typed';

/* ===========================================================================
   26.96-35 — THE EMPTY-BOX PREDECESSORS, PINNED BY VALUE.

   ⛔ THESE ARE NOT TARGETS AND NOTHING IS ASSERTED AGAINST THEM. They are the
   figures every run of arms 7–9 produced from 26.96-28 until this plan, and
   they are pinned here so the new numbers can be printed BESIDE them rather
   than OVER them. ⛔ A corrected figure written over the figure it corrects
   destroys the only evidence that the correction was needed.

   ⛔⛔ AND THESE PARTICULAR NUMBERS REACHED THE OWNER. Ruling P (2026-08-22)
   re-put the picker's placement on `−29 px` and she HELD her answer — but the
   harness had no vault root, the enumeration route answered 400, and what was
   measured was the picker's two prose lines over an EMPTY box. The height of a
   full offered list opening had never been measured. That is what this plan
   measures, and the record of it is `26.96-35-MEASUREMENTS.md`.
   =========================================================================== */
const EMPTY_ROWS = 0;                 // rows in the picker's box
const EMPTY_PICKER_H = 67;            // px — its own box, prose only
const EMPTY_PANE_TOP_TO_ADD = 410;    // px — post-add, 29 folders fenced
const EMPTY_REMAINING = -29;          // px = 420 − 410 − 39

/* A string no folder in any fixture can contain, used to drive the picker's
   box back to EMPTY on the same viewport in the same run — see arm 10. */
const NO_SUCH_FOLDER = 'zzqq-no-folder-has-this-in-its-name-zzqq';

/* ---------------------------------------------------------------------------
   uiAdd(session, folder)

   PRESSES HER OWN CONTROL. ⛔ It does not POST to the route: the whole point is
   the state her tap produces, and a write to the route produces a DIFFERENT
   render — one with no receipt in it at all.

   A trusted mouse press focuses the field (a press synthesised inside the page
   runs no default action, which is why this harness boots the real app), then
   `Input.insertText` types. The typed name is read back out of the shipped
   field before the button is pressed, so "I typed it" is a fact rather than an
   assumption.

   Settles by asking the page for the receipt. The consequence slot DOES NOT
   EXIST until the render that carries it, and a write the route refused paints
   the note slot instead — so a receipt with words in it means the route
   accepted the write. Returns that sentence, or '' if it never came.
   --------------------------------------------------------------------------- */
async function uiAdd(session, folder) {
  await click(session, ADD_FIELD_SEL);
  await cdp.send(session, 'Input.insertText', { text: folder });
  const typed = await cdp.evaluate(session,
    '(function(){var f=document.querySelector(' +
    JSON.stringify(ADD_FIELD_SEL) + ');return f?String(f.value):"";})()');
  if (typed !== folder) {
    throw new Error('uiAdd: the folder name never reached the shipped field ' +
      '(it holds ' + JSON.stringify(typed) + ', not ' + JSON.stringify(folder) +
      '). Nothing measured after this point would be a reading of an add.');
  }
  await click(session, ADD_BUTTON_SEL);
  const deadline = Date.now() + SETTLE_DEADLINE_MS;
  let said = '';
  while (Date.now() < deadline) {
    said = await cdp.evaluate(session,
      '(function(){var p=document.querySelector(' + JSON.stringify(SAID_SEL) +
      ');return p?String(p.textContent):"";})()');
    if (said) { break; }
    await sleep(SETTLE_POLL_MS);
  }
  return said;
}

/* ---------------------------------------------------------------------------
   reachAddAfter(session)

   Scrolls the way she would and re-measures. ⛔ ABSENCE IS A READING HERE, not
   an exception: after a reverted Beat 6 there is simply no add field once the
   receipt has been said, and that is the failure arm 4 exists to name.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   settleChoices(session, expected)   — 26.96-35

   ⛔ WHY THIS EXISTS. Every picker figure this file has ever recorded was taken
   over an EMPTY box. `tests/lib/app-server.cjs` never stamped `meta.vault_root`,
   so `/api/adapter/vault-folder-paths` answered 400 under this harness and the
   offered list could not fill — and the number that came out of that
   (−29 px of headroom) was put to the owner, who ruled on it. The harness now
   serves a synthetic vault, so the list really fills; this waits for it.

   ⛔ IT IS A POLL OF THE PAGE, NEVER A FIXED SLEEP, for the reason written over
   SETTLE_DEADLINE_MS: a sleep long enough to be safe is also long enough to
   hide a render that never came. It returns the row count it actually saw —
   including a count that never reached `expected` — because ⛔ THE COUNT IS THE
   ASSERTION THAT THE FIXTURE TOOK. A geometry figure read off a box that never
   filled is a different number, and this file has already produced one.
   --------------------------------------------------------------------------- */
async function settleChoices(session, expected) {
  const deadline = Date.now() + SETTLE_DEADLINE_MS;
  let seen = -1;
  while (Date.now() < deadline) {
    seen = parseInt(await cdp.evaluate(session,
      '(function(){var p=document.getElementById("manage-sec-roster");' +
      'var k=p&&p.querySelector(".vault-roster-picker");' +
      'return String(k?k.querySelectorAll(".vault-roster-choice").length:-1);' +
      '})()'), 10);
    if (seen === expected) { return seen; }
    await sleep(SETTLE_POLL_MS);
  }
  return seen;
}

async function reachAddAfter(session) {
  return JSON.parse(await cdp.evaluate(session,
    '(function(){var pane=document.querySelector(' +
    JSON.stringify(PANE_SEL) + ');' +
    'if(!pane)return JSON.stringify({pane:false,add:false});' +
    'var add=pane.querySelector(".vault-roster-add-input");' +
    'if(!add)return JSON.stringify({pane:true,add:false,' +
    ' winH:window.innerHeight});' +
    'add.scrollIntoView({block:"center"});' +
    'var r=add.getBoundingClientRect();' +
    'return JSON.stringify({pane:true,add:true,' +
    ' top:Math.round(r.top),bottom:Math.round(r.bottom),' +
    ' w:Math.round(r.width),h:Math.round(r.height),' +
    ' winH:window.innerHeight,' +
    ' inViewport:(r.top>=0&&r.bottom<=window.innerHeight),' +
    ' hit:(function(){var e=document.elementFromPoint(' +
    '   r.left+r.width/2,r.top+r.height/2);' +
    '  return e===add?"self":(e&&e.className?String(e.className):"none");' +
    ' })()});})()'));
}

(async function main() {
  /* ⛔ 26.96-35 — THE VAULT IS ASKED FOR, and this suite is the reason the
     harness can serve one. Without it `/api/adapter/vault-folder-paths`
     answers 400, the picker's box renders EMPTY, and arms 7–9 report
     real-looking geometry for a control with nothing in it — which is what
     every run of this file did from 26.96-28 until now, and the figure that
     came out of it was put to the owner at Ruling P.
     ⚠ The flag is not trusted to have worked: `app.folders` is 0 when no
     vault was asked for, and the row-count control below asserts the RENDERED
     count equals it before any pixel figure is believed. */
  const app = await appServer.start({ vault: true });

  /* ⛔ 26.96-42 — ONE SHAPE FOR EVERY TEARDOWN IN THIS FILE, BECAUSE A FAILING
     TEARDOWN MAY NOT ERASE WHAT THE RUN FOUND. `app.stop()` THROWS when the
     fixture tree survives, and this file awaited it bare in two places: inside
     the containment assertion below and inside the `finally` at the end. A
     throw from either escaped to the top-level catch, printed COULD NOT BE
     DRIVEN, and took every real violation off the screen with it — a run that
     found N product defects reported none of them.

     ⛔ THIS DOES NOT SWALLOW. It returns '' when the teardown was clean and the
     failure's own words when it was not, and EVERY caller below is required to
     report what it returns. A leaked fixture tree is still a violation of this
     run; what it may no longer do is displace the finding beside it.

     ⚠ WHY THIS DIVERGES FROM THE SHIPPED ANALOG. `tests/test_consent_card_
     reaches_her.cjs` wraps its own stop in a try/catch with an EMPTY catch
     body. That protects its verdict but throws the leak report away — nobody
     ever hears that a tree survived. Here the verdict is protected AND the
     leak is reported, which is the whole of the difference. */
  async function stopReportingFailure() {
    try { await app.stop(); return ''; } catch (e) {
      return (e && e.message) ? e.message : String(e);
    }
  }

  /* ⛔ 26.96-24 — THE LIBRARY THIS RUNS AGAINST IS PROVEN SYNTHETIC BEFORE
     ANYTHING IS DRIVEN. app-server builds it from nothing under os.tmpdir()
     on every run; this asserts that rather than trusting it, and prints the
     path so the claim is checkable from the output alone. A path anywhere
     else STOPS the run — it is never measured and then mentioned. */
  const libReal = fs.realpathSync(app.root);
  const tmpReal = fs.realpathSync(os.tmpdir());
  console.log('  --  library under test: ' + libReal +
    ' (os.tmpdir() is ' + tmpReal + ')');
  if (libReal !== tmpReal &&
      libReal.indexOf(tmpReal + path.sep) !== 0) {
    const teardown = await stopReportingFailure();
    throw new Error('the fixture library is NOT under the OS temp ' +
      'directory (' + libReal + '). This gate never touches a real ' +
      'library and stops rather than measuring one.' +
      (teardown ? '\n\n⛔ AND THE TEARDOWN ALSO FAILED (reported, not ' +
        'swallowed — it does not replace the containment failure above): ' +
        teardown : ''));
  }
  /* ⛔ 26.96-42 — AND THE VAULT, IN THE SAME SHAPE AND FOR THE SAME REASON.
     `26.96-35` gave this harness a SECOND fixture root — a synthetic vault, so
     the enumeration route answers and the picker's box is not measured empty —
     and until now NOTHING anywhere asserted where that root lives. The library
     had this guard in two suites; the vault it introduced had none in any, and
     the round-4 report flagged exactly that (WR-06, and the one test-tier
     prohibition it left PARTIAL).

     ⛔ SAME SHAPE, DELIBERATELY: realpath both, print both, and STOP the run —
     never measure a path anywhere else and mention it afterwards. A fixture
     that reached her real vault would be read by the shipped walker, and this
     suite drives a real browser over whatever it is handed. */
  if (!app.vault) {
    const teardown = await stopReportingFailure();
    throw new Error('a vault was asked for and the harness handed back no ' +
      'vault path. Nothing below may be measured over a picker whose ' +
      'offered list came from somewhere this gate cannot name.' +
      (teardown ? '\n\n⛔ AND THE TEARDOWN ALSO FAILED (reported, not ' +
        'swallowed): ' + teardown : ''));
  }
  const vaultReal = fs.realpathSync(app.vault);
  console.log('  --  vault under test:   ' + vaultReal +
    ' (os.tmpdir() is ' + tmpReal + ')');
  if (vaultReal !== tmpReal &&
      vaultReal.indexOf(tmpReal + path.sep) !== 0) {
    const teardown = await stopReportingFailure();
    throw new Error('the synthetic vault is NOT under the OS temp ' +
      'directory (' + vaultReal + '). This gate never touches a real ' +
      'vault and stops rather than measuring one.' +
      (teardown ? '\n\n⛔ AND THE TEARDOWN ALSO FAILED (reported, not ' +
        'swallowed — it does not replace the containment failure above): ' +
        teardown : ''));
  }

  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: VIEWPORT.width, height: VIEWPORT.height,
        deviceScaleFactor: 1, mobile: false });

    await seed(session, FIRST);
    await openPane(session, app.url);
    // 26.96-35: the offered list is waited for BEFORE any box is measured.
    const aRows = await settleChoices(session, app.folders);
    const a = await read(session);

    await seed(session, MORE);
    await openPane(session, app.url);
    const bRows = await settleChoices(session, app.folders);
    const b = await read(session);

    // -----------------------------------------------------------------
    // POSITIVE CONTROLS FIRST — nothing below is believed without them.
    // -----------------------------------------------------------------
    if (!a.pane || !b.pane) {
      fail('[control] the pane was absent on one of the two drives');
    }
    if (!a.list || !b.list) {
      fail('[control] the roster list element was not found — this file ' +
        'measured something other than the list');
    }
    if (!a.add || !b.add || !a.addNonZero || !b.addNonZero) {
      fail('[control] the add field ("keep this private too") was absent or ' +
        'zero-sized, so "reachable" would be a claim about nothing');
    }
    if (!(b.rows > a.rows)) {
      fail('[control] the second drive did not render MORE rows than the ' +
        'first (' + a.rows + ' then ' + b.rows + '), so arm 1 compared two ' +
        'identical panes and would pass on anything');
    } else {
      note('control: the roster really grew, ' + a.rows + ' rows then ' +
        b.rows + ' rows, both past the 10rem cap');
    }
    // -----------------------------------------------------------------
    // 26.96-35 — ⛔ THE OFFERED LIST IS PROVED NON-EMPTY BY COUNT BEFORE
    // ANY PICKER GEOMETRY BELOW IS BELIEVED.
    //
    // ⛔ THIS IS THE CONTROL THE PICKER ARMS NEVER HAD, and its absence is
    // not hypothetical: arms 7–9 measured a box holding ZERO rows on every
    // run from 26.96-28 until this one, and the −29 px that came out of
    // that was put to the owner at Ruling P and she ruled on it. The count
    // is checked against the harness's OWN pinned fixture size rather than
    // against "more than nothing", so a vault that quietly shortened is a
    // failure here rather than a shorter pass.
    // -----------------------------------------------------------------
    if (!(aRows === app.folders && bRows === app.folders)) {
      fail('[control/picker-rows] ⛔ THE OFFERED LIST DID NOT FILL: the ' +
        'harness pins its synthetic vault at ' + app.folders + ' offerable ' +
        'folders and the picker rendered ' + aRows + ' row(s) on the first ' +
        'drive and ' + bRows + ' on the second. Every picker figure below ' +
        'would be a measurement of a box that never filled — which is the ' +
        'exact defect 26.96-35 exists to end, reproduced.');
    } else {
      note('control (26.96-35): the offered list really filled — ' + aRows +
        ' row(s) at rest on the first drive and ' + bRows + ' on the second, ' +
        'both equal to the ' + app.folders + ' folders the harness pins by ' +
        'value. ⛔ Every picker figure below is measured over a FILLED box; ' +
        'every one before 26.96-35 was measured over an empty one.');
    }
    // ⚠ THE ARMS ARE STILL DRIVEN IF THE OVERFLOW CONTROL FAILS, and that is
    // deliberate: "the list no longer overflows its own box" is one of the
    // SHAPES a removed cap takes (the box simply grows to fit), so skipping the
    // arms there would hide the very measurement that names the defect. Only a
    // structurally absent pane stops the run.
    if (!b.listOverflows) {
      fail('[control] with ' + b.rows + ' folders the list does NOT overflow ' +
        'its own box (content ' + b.listScrollH + 'px in ' + b.listClientH +
        'px) — the condition truth 19 is about was never reached, so a green ' +
        'here would prove nothing');
    } else {
      note('control: the list really overflows its box (' + b.listScrollH +
        'px of rows in a ' + b.listClientH + 'px box, overflow-y: ' +
        b.listOverflowY + ')');
    }

    // Only a structurally absent pane stops the arms; a failed OVERFLOW
    // control does not, for the reason written above it.
    if (a.pane && b.pane && a.list && b.list && a.add && b.add) {
      // ---------------------------------------------------------------
      // ARM 1 — PAST THE CAP, MORE FOLDERS DO NOT MOVE THE ADD FIELD.
      // This is the cap's actual job, measured rather than asserted.
      // The slack absorbs sub-pixel rounding and a one-line reflow; a
      // missing cap moves the field by ~one row per added folder, which
      // on this fixture is an order of magnitude more.
      // ---------------------------------------------------------------
      const SLACK = 24;
      const moved = Math.abs(b.addFromPaneTop - a.addFromPaneTop);
      if (moved > SLACK) {
        fail('[truth-19/arm1] ⛔ THE LIST IS NOT CAPPED IN PRACTICE: adding ' +
          (b.rows - a.rows) + ' more private folders pushed the add field ' +
          moved + 'px further down the pane (' + a.addFromPaneTop + 'px → ' +
          b.addFromPaneTop + 'px from the pane top). The control she needs to ' +
          'fence the NEXT folder walks off the bottom as she fences more, ' +
          'which is exactly what max-height:10rem exists to prevent.');
      } else {
        note('truth 19, arm 1: past the cap the add field does not move — ' +
          a.addFromPaneTop + 'px from the pane top at ' + a.rows + ' rows, ' +
          b.addFromPaneTop + 'px at ' + b.rows + ' rows (' + moved + 'px)');
      }

      // ---------------------------------------------------------------
      // ARM 2 — AND IT IS ACTUALLY REACHABLE at this short viewport with
      // the long roster loaded.
      //
      // ⚠⚠ WHAT "REACHABLE" MEANS HERE, AND WHY IT IS NOT "VISIBLE AT
      // REST". MEASURED at 1100×420 with 28 folders fenced: the add field
      // sits at 488–527px in a 420px window, i.e. BELOW THE FOLD at rest.
      // That is not the defect — the Manage surface is a scrolling page and
      // a 420px window is shorter than the pane's own heading and framing
      // sentence. Demanding at-rest visibility would be demanding something
      // stricter than the requirement, and would go red on a correct pane.
      // The requirement is that she can GET TO the control: it is in the
      // scrollable flow and nothing clips it away. So this arm SCROLLS —
      // the way she would — and then re-measures. ⛔ It is not weakened
      // into a presence check: a field that is present but clipped, zero
      // sized, or parked outside every scroll container still fails here,
      // because the reading is taken AFTER the scroll and asks for a real
      // box inside the window.
      // ---------------------------------------------------------------
      const reached = JSON.parse(await cdp.evaluate(session,
        '(function(){var pane=document.getElementById("manage-sec-roster");' +
        'var add=pane&&pane.querySelector(".vault-roster-add-input");' +
        'if(!add)return JSON.stringify({add:false});' +
        'add.scrollIntoView({block:"center"});' +
        'var r=add.getBoundingClientRect();' +
        'return JSON.stringify({add:true,' +
        ' top:Math.round(r.top),bottom:Math.round(r.bottom),' +
        ' w:Math.round(r.width),h:Math.round(r.height),' +
        ' inViewport:(r.top>=0&&r.bottom<=window.innerHeight),' +
        // the element the browser hands back at the field's own centre: if
        // something covers or clips it, this is not the field.
        ' hit:(function(){var e=document.elementFromPoint(' +
        '   r.left+r.width/2,r.top+r.height/2);' +
        '  return e===add?"self":(e&&e.className?String(e.className):"none");' +
        ' })()});})()'));
      await sleep(200);
      if (!reached.add) {
        fail('[truth-19/arm2] the add field is not in the pane at all after ' +
          'the long roster loaded');
      } else if (!(reached.w > 0 && reached.h > 0)) {
        fail('[truth-19/arm2] the add field measures ' + reached.w + '×' +
          reached.h + ' — it is present but has no box, so it cannot be used');
      } else if (!reached.inViewport) {
        fail('[truth-19/arm2] ⛔ THE ADD FIELD CANNOT BE SCROLLED INTO VIEW ' +
          'at ' + VIEWPORT.width + '×' + VIEWPORT.height + ' with ' + b.rows +
          ' folders fenced: after scrolling it still sits at ' + reached.top +
          '–' + reached.bottom + 'px in a ' + b.winH + 'px window. She cannot ' +
          'fence another folder.');
      } else if (reached.hit !== 'self') {
        fail('[truth-19/arm2] the add field is in view but something else ' +
          'answers at its own centre (' + reached.hit + ') — it is covered or ' +
          'clipped, so it is on screen without being usable');
      } else {
        note('truth 19, arm 2: with ' + b.rows + ' folders fenced the add ' +
          'field scrolls into view (' + reached.top + '–' + reached.bottom +
          'px in a ' + b.winH + 'px window, ' + reached.w + '×' + reached.h +
          'px, and it is the element the browser hands back at its own ' +
          'centre). ⚠ At rest it sits at ' + b.addTop + '–' + b.addBottom +
          'px, i.e. below the fold on a window this short — recorded, not ' +
          'asserted away.');
      }

      // ---------------------------------------------------------------
      // ARM 3 — AND THE PANE DOES NOT SCROLL SIDEWAYS. The cap turns a
      // vertical overflow into a scroll box; the cheap way to get that
      // wrong is to leak a horizontal one, which reads as broken.
      // ---------------------------------------------------------------
      if (b.paneScrollW > b.paneClientW + 1) {
        fail('[truth-19/arm3] the pane scrolls HORIZONTALLY with the long ' +
          'roster: ' + b.paneScrollW + 'px of content in ' + b.paneClientW +
          'px. A privacy list she has to scroll sideways to read is a ' +
          'privacy list she will not read.');
      } else if (b.docScrollW > b.winW + 1) {
        fail('[truth-19/arm3] the PAGE scrolls horizontally with the pane ' +
          'open: ' + b.docScrollW + 'px of content in a ' + b.winW +
          'px window.');
      } else {
        note('truth 19, arm 3: no horizontal scroll — pane ' + b.paneScrollW +
          'px in ' + b.paneClientW + 'px, page ' + b.docScrollW + 'px in ' +
          b.winW + 'px');
      }

      // ===============================================================
      // 26.96-24 — ARMS 4, 5 AND 6: THE PANE AFTER SHE PRESSES ADD.
      //
      // ⛔ THE THREE ARMS ABOVE HAVE ALREADY TAKEN THEIR READINGS (`a` and
      // `b` were read before this line), so nothing below can perturb
      // them. Their figures are compared BY VALUE against the run before
      // this section existed; a moved at-rest number would mean this
      // section changed the fixture and is wrong, not that the baseline is.
      // ===============================================================
      const rowsBefore = b.rows;
      const said = await uiAdd(session, TYPED);
      const post = await read(session);

      // ---------------------------------------------------------------
      // POSITIVE CONTROLS FOR THE TAP — nothing below is believed
      // without them. A post-add measurement taken on a pane where
      // nothing was added is a vacuous pass.
      // ---------------------------------------------------------------
      let tapLanded = true;
      if (!said) {
        tapLanded = false;
        fail('[control/post-add] the receipt sentence never appeared after ' +
          'the tap, so the route did not accept the write — every post-add ' +
          'figure below would be a reading of a pane nothing happened to');
      } else {
        note('control (post-add): the room answered the tap in its own ' +
          'words — "' + said + '"');
      }
      if (!post.pane) {
        tapLanded = false;
        fail('[control/post-add] the pane was gone after the tap');
      } else if (post.rows !== rowsBefore + 1) {
        tapLanded = false;
        fail('[control/post-add] ⛔ THE ADD DID NOT LAND: the roster held ' +
          rowsBefore + ' rows before the tap and ' + post.rows + ' after it, ' +
          'and one folder was typed. Exactly one more row is the only shape ' +
          'a landed add takes, so nothing below would be a post-add reading.');
      } else {
        note('control (post-add): the add really landed — ' + rowsBefore +
          ' rows before the tap, ' + post.rows + ' rows after it, one folder ' +
          'typed into the shipped field and the shipped button pressed');
      }

      if (tapLanded) {
        const after = await reachAddAfter(session);

        // -------------------------------------------------------------
        // ARM 4 — AFTER AN ADD, THE BOX IS STILL THERE AND SHE CAN STILL
        // GET TO IT. This is her Beat 6 ruling as a measurable property:
        // the receipt is said in the box's own place AND the box comes
        // straight back beneath it, so a second folder is one gesture.
        // ⛔ "Reachable" means the same thing it means in arm 2 — in the
        // scrollable flow, a real box, and the element the browser hands
        // back at its own centre — NOT visible at rest. The pane is
        // taller after an add, not shorter.
        // -------------------------------------------------------------
        if (!after.add) {
          fail('[truth-19/arm4] ⛔ AFTER ADDING A FOLDER THERE IS NO ADD ' +
            'FIELD LEFT IN THE PANE. The receipt was said (' + post.rows +
            ' rows now stand) and the control she used to say it is gone, ' +
            'so fencing a second folder is not one gesture — it waits for ' +
            'the pane to render again. That is the behaviour her Beat 6 ' +
            'ruling of 2026-08-20 retired: `Yes this box should come ' +
            'straight back`.');
        } else if (!(after.w > 0 && after.h > 0)) {
          fail('[truth-19/arm4] after the add the returning add field ' +
            'measures ' + after.w + '×' + after.h + ' — it is present but ' +
            'has no box, so it cannot be used for the next folder');
        } else if (!after.inViewport) {
          fail('[truth-19/arm4] ⛔ AFTER ADDING A FOLDER THE ADD FIELD ' +
            'CANNOT BE SCROLLED BACK INTO VIEW at ' + VIEWPORT.width + '×' +
            VIEWPORT.height + ' with ' + post.rows + ' folders fenced: ' +
            'after scrolling it still sits at ' + after.top + '–' +
            after.bottom + 'px in a ' + after.winH + 'px window. She ' +
            'cannot fence the next one.');
        } else if (after.hit !== 'self') {
          fail('[truth-19/arm4] after the add the field is in view but ' +
            'something else answers at its own centre (' + after.hit +
            ') — it is covered or clipped, so it is on screen without ' +
            'being usable');
        } else {
          note('truth 19, arm 4 (post-add): after adding a folder through ' +
            'the shipped control, with ' + post.rows + ' folders fenced, ' +
            'the add field comes back and scrolls into view (' + after.top +
            '–' + after.bottom + 'px in a ' + after.winH + 'px window, ' +
            after.w + '×' + after.h + 'px, and it is the element the ' +
            'browser hands back at its own centre)');
        }

        // -------------------------------------------------------------
        // ARM 5 — AND THE PANE STAYED BOUNDED ACROSS THE TAP. A cap that
        // holds at rest is not a cap that holds after an add: the render
        // that carries the receipt is a DIFFERENT render, and it is the
        // one her Beat 6 ruling changed. Two prongs and a sideways check,
        // all three read off the same post-add pane:
        //   (i)  the list's own box did not grow to swallow the new row;
        //   (ii) the rows still overflow that box, so the cap is doing
        //        something rather than being satisfied by a short list;
        //   (iii) nothing leaked sideways.
        // -------------------------------------------------------------
        const CAP_SLACK = 4;
        const grew = post.listClientH - b.listClientH;
        if (!post.list) {
          fail('[truth-19/arm5] the roster list element was not in the pane ' +
            'after the add');
        } else if (grew > CAP_SLACK) {
          fail('[truth-19/arm5] ⛔ THE LIST IS NOT CAPPED AFTER A UI ADD: ' +
            'the list box was ' + b.listClientH + 'px before the tap and ' +
            post.listClientH + 'px after it (' + grew + 'px), so the one ' +
            'row she just added pushed everything below the list further ' +
            'down the pane. The cap exists precisely so that fencing the ' +
            'next folder never moves the control that fences it.');
        } else if (!post.listOverflows) {
          fail('[truth-19/arm5] ⛔ AFTER THE ADD THE LIST NO LONGER ' +
            'OVERFLOWS ITS OWN BOX (' + post.listScrollH + 'px of rows in ' +
            post.listClientH + 'px): the box grew to fit the content, which ' +
            'is the OTHER shape a missing cap takes. With ' + post.rows +
            ' folders fenced the condition truth 19 is about was reached ' +
            'and the cap did not hold it.');
        } else if (post.paneScrollW > post.paneClientW + 1) {
          fail('[truth-19/arm5] the post-add render leaks a HORIZONTAL ' +
            'scroll into the pane: ' + post.paneScrollW + 'px of content in ' +
            post.paneClientW + 'px.');
        } else if (post.docScrollW > post.winW + 1) {
          fail('[truth-19/arm5] the post-add render leaks a HORIZONTAL ' +
            'scroll into the PAGE: ' + post.docScrollW + 'px of content in ' +
            'a ' + post.winW + 'px window.');
        } else {
          note('truth 19, arm 5 (post-add cap): after the add the list box ' +
            'is still ' + post.listClientH + 'px (it was ' + b.listClientH +
            'px before the tap, ' + grew + 'px), it still overflows with ' +
            post.listScrollH + 'px of rows in it at ' + post.rows +
            ' folders, and nothing leaks sideways (pane ' + post.paneScrollW +
            'px in ' + post.paneClientW + 'px, page ' + post.docScrollW +
            'px in ' + post.winW + 'px)');
        }

        // -------------------------------------------------------------
        // ARM 6 — THE HEADROOM FIGURE. ⛔ A MEASUREMENT, NOT A VERDICT.
        // It is an input to an owner decision in plan 26.96-25 — where a
        // folder picker would sit — and this file draws no conclusion
        // from it and recommends no layout.
        //
        // ⛔ THE DEFINITION EACH NUMBER IS TRUE UNDER, stated so the
        // number cannot be quoted loose:
        //   paneTopToAdd — the add field's top minus the pane's top, in
        //     the post-add render. Independent of where the page is
        //     scrolled to.
        //   addH — the add field's own height.
        //   winH — the window this was driven at (the short one).
        //   remaining — winH − paneTopToAdd − addH. That is: if the top
        //     of the pane sits at the top of the window, this is how
        //     much room is left over once everything above the add field
        //     and the add field itself have been placed. A control taller
        //     than `remaining`, inserted above the add field, means the
        //     pane's top and the add field can no longer be on screen at
        //     the same moment on a window this short.
        // ⛔ No ratio is reported. Every number is printed beside the
        // others it was derived from.
        // -------------------------------------------------------------
        // ⛔ NO ADD FIELD MEANS NO MEASUREMENT, AND THE ARM SAYS SO RATHER
        // THAN SUBTRACTING ONE ABSENCE FROM ANOTHER. Driven: under plant 1
        // (her Beat 6 ruling reverted) this note printed
        // "pane-top-to-add-field undefinedpx ... remaining space NaNpx" —
        // an arithmetic artefact wearing the word `px`, in a file whose
        // whole discipline is that a recorded number survives the run. A
        // later reader could have quoted it. Caught 2026-08-22 while
        // watching plant 1 fail, and fixed rather than left in the output.
        if (!post.add) {
          note('truth 19, arm 6 (post-add headroom): NOT MEASURED — there ' +
            'is no add field in the pane after the tap, so there is no ' +
            'distance to it and no headroom to report. Arm 4 above names ' +
            'the reason.');
        } else {
          const paneTopToAdd = post.addFromPaneTop;
          const addH = post.addBottom - post.addTop;
          const remaining = post.winH - paneTopToAdd - addH;
          const receiptCost = post.addFromPaneTop - b.addFromPaneTop;
          note('truth 19, arm 6 (post-add headroom): after a UI add at ' +
            VIEWPORT.width + '×' + VIEWPORT.height + ' with ' + post.rows +
            ' folders fenced — pane-top-to-add-field ' + paneTopToAdd +
            'px, add field height ' + addH + 'px, window height ' +
            post.winH + 'px, remaining space ' + remaining + 'px ' +
            '(remaining = window − pane-top-to-add-field − add field ' +
            'height). ⚠ At rest before the tap the same distance was ' +
            b.addFromPaneTop + 'px, so the receipt her Beat 6 ruling keeps ' +
            'costs ' + receiptCost + 'px. ⛔ Recorded as a measurement: no ' +
            'layout is argued for or against here.');
        }

        /* =============================================================
           26.96-28 — ARMS 7, 8 AND 9: THE PICKER IS ON THE SCREEN NOW.

           Her D-B ruling of 2026-08-22 (TIER 2 — approved as shown: an
           orchestrator wrote every option label and she picked one) put a
           folder picker on this pane, WHERE THE TYPING BOX IS TODAY. She
           answered that stop having been told the measured headroom —
           331px from the pane top to the "keep this private too" box in a
           420px window, about 50px left, of which the receipt her Beat 6
           ruling keeps costs 42px — AND having been told its two limits
           out loud: it was measured with 29 folders private while her own
           list holds six, and the height of the opening list had never
           been measured at all.

           ⛔ SO THE PICKER IS MEASURED, NOT ASSUMED. Every figure is a
           note so it survives a green run, and the comparison against
           what she was told is stated in one sentence. A material
           difference is RECORDED AS OWED TO HER — ⛔ never adjusted away,
           and ⛔ never turned into a verdict here: she was told a number
           and the number moved, and only she can say what to do about it.
           ============================================================= */

        // ---------------------------------------------------------------
        // ARM 7 — THE PICKER REALLY RENDERED. ⛔ A geometry measurement on
        // a pane with no picker in it is a vacuous pass, and everything in
        // arms 8 and 9 would be a reading of the pane as it was BEFORE her
        // ruling. This runs before either of them and stops them.
        // ---------------------------------------------------------------
        const pickerHere = !!(post.picker && b.picker);
        if (!pickerHere) {
          fail('[truth-19/arm7] ⛔ THE PICKER IS NOT IN THE PANE AT ALL ' +
            '(at rest: ' + (b.picker ? 'present' : 'ABSENT') + ', after ' +
            'the add: ' + (post.picker ? 'present' : 'ABSENT') + '). Her ' +
            'D-B ruling put it here, and every picker figure below would ' +
            'be a measurement of the pane as it was before she ruled.');
        } else if (!(post.pickerW > 0 && post.pickerH > 0)) {
          fail('[truth-19/arm7] the picker is in the pane but measures ' +
            post.pickerW + '×' + post.pickerH + ' — it has no box, so it ' +
            'is on screen without being usable and nothing below is a ' +
            'reading of a control she can reach.');
        } else {
          note('truth 19, arm 7 (the picker really rendered): rows=' +
            post.pickerRows + ' — its own box is ' + post.pickerW + '×' +
            post.pickerH + 'px, sitting ' + post.pickerFromPaneTop +
            'px below the pane top after the add (rows=' + b.pickerRows +
            ', ' + b.pickerFromPaneTop + 'px at rest). ⭐ 26.96-35: THE BOX ' +
            'IS FILLED NOW. Every earlier run of this arm reported rows=' +
            EMPTY_ROWS + ' and a ' + EMPTY_PICKER_H + 'px box — the ' +
            'picker\'s two prose lines over nothing — because the harness ' +
            'never stamped a vault root and the enumeration route answered ' +
            '400. ⚠ THE ROW COUNT IS STILL A LIMIT ON EVERY FIGURE BELOW, ' +
            'and the limit has only CHANGED SHAPE rather than gone: this is ' +
            'a SYNTHETIC vault of ' + post.pickerRows + ' folders built ' +
            'under the OS temp directory, ⛔ not her own vault, which holds ' +
            '194 folders of which 192 are actionable. The box carries its ' +
            'own max-height:8rem cap, so past that cap her folder count ' +
            'cannot make it any taller than this.');
        }

        if (pickerHere && post.pickerW > 0 && post.pickerH > 0) {
          // -------------------------------------------------------------
          // ARM 8 — WHAT THE PICKER COSTS, AT REST AND AFTER AN ADD.
          // ⛔ A MEASUREMENT, NOT A VERDICT. Every number printed beside
          // the ones it was derived from, and no ratio anywhere.
          // -------------------------------------------------------------
          note('truth 19, arm 8 (the picker on a short screen): at ' +
            VIEWPORT.width + '×' + VIEWPORT.height + ' — at rest with ' +
            b.rows + ' folders fenced, rows=' + b.pickerRows +
            ', the picker box is ' + b.pickerH +
            'px tall and the add field sits ' + b.addFromPaneTop + 'px ' +
            'below the pane top; after a UI add with ' + post.rows +
            ' folders fenced, rows=' + post.pickerRows +
            ', the picker box is ' + post.pickerH + 'px ' +
            'and the add field sits ' + post.addFromPaneTop + 'px below ' +
            'the pane top. The list still overflows its own 10rem box (' +
            post.listScrollH + 'px of rows in ' + post.listClientH +
            'px) and nothing leaks sideways.');
          // ⛔ 26.96-35 — THE EMPTY-BOX PREDECESSOR, PRINTED BESIDE THE NEW
          // NUMBER AND NEVER INSTEAD OF IT. A corrected figure written over
          // the figure it corrects destroys the only evidence that the
          // correction was needed, and this particular predecessor is the
          // one the owner was re-put on at Ruling P.
          note('truth 19, arm 8 — ⛔ SIDE BY SIDE, BOTH LABELLED. ' +
            'EMPTY BOX (rows=' + EMPTY_ROWS + ', 26.96-28, the figures ' +
            'Ruling P was re-put on): picker box ' + EMPTY_PICKER_H +
            'px, add field ' + EMPTY_PANE_TOP_TO_ADD + 'px below the pane ' +
            'top, ' + EMPTY_REMAINING + 'px left over. FILLED BOX (rows=' +
            post.pickerRows + ', this run): picker box ' + post.pickerH +
            'px, add field ' + post.addFromPaneTop + 'px below the pane ' +
            'top. ⛔ Neither number replaces the other.');

          // -------------------------------------------------------------
          // ARM 9 — THE COMPARISON AGAINST WHAT SHE WAS TOLD AT THE D-B
          // STOP. ⛔ THE FIGURES SHE SAW ARE PINNED HERE BY VALUE, from
          // 26.96-24-SUMMARY.md § arm 6 and quoted back to her in
          // 26.96-DECISIONS.md § "D-B, second half".
          // -------------------------------------------------------------
          const TOLD_PANE_TOP_TO_ADD = 331;   // px, post-add, 29 folders
          const TOLD_ADD_H = 39;              // px
          const TOLD_WINDOW = 420;            // px
          const TOLD_REMAINING = 50;          // px = 420 − 331 − 39
          const nowRemaining = post.winH - post.addFromPaneTop -
            (post.addBottom - post.addTop);
          const moved = post.addFromPaneTop - TOLD_PANE_TOP_TO_ADD;
          const remainingMoved = nowRemaining - TOLD_REMAINING;
          note('truth 19, arm 9 (against what she was told at the D-B ' +
            'stop): rows=' + post.pickerRows + ' — she was told ' +
            TOLD_PANE_TOP_TO_ADD + 'px from the ' +
            'pane top to the add field, ' + TOLD_ADD_H + 'px tall, in a ' +
            TOLD_WINDOW + 'px window, leaving ' + TOLD_REMAINING + 'px; ' +
            'with the picker on screen the same measurement reads ' +
            post.addFromPaneTop + 'px / ' + (post.addBottom - post.addTop) +
            'px / ' + post.winH + 'px, leaving ' + nowRemaining + 'px — ' +
            'so the picker moved the add field ' + moved + 'px further ' +
            'down and changed the room left over by ' + remainingMoved +
            'px. ⛔ THE THREE NUMBERS SIDE BY SIDE, EACH WITH THE ROW COUNT ' +
            'IT WAS TAKEN AT: ' + TOLD_PANE_TOP_TO_ADD + 'px / ' +
            TOLD_REMAINING + 'px left (rows=' + EMPTY_ROWS + ', no picker ' +
            'on screen at all — the D-B stop) → ' + EMPTY_PANE_TOP_TO_ADD +
            'px / ' + EMPTY_REMAINING + 'px left (rows=' + EMPTY_ROWS +
            ', picker on screen but its box EMPTY — the figure Ruling P was ' +
            're-put on and HELD) → ' + post.addFromPaneTop + 'px / ' +
            nowRemaining + 'px left (rows=' + post.pickerRows + ', the box ' +
            'FILLED — this run). ⛔ No earlier figure is overwritten.');
          // ⛔ 26.96-35 — THE BRANCH REPORTS ITS OWN STATE, ALWAYS. Reading a
          // green run and inferring which way a branch went is how a note
          // that never printed gets mistaken for a condition that never
          // held. ⚠ AND THE PREMISE THIS PLAN WAS WRITTEN ON WAS WRONG:
          // 26.96-VERIFICATION recorded that this branch "cannot fire under
          // its own fixture". It DID fire, at rows=0, at −29px — that is
          // exactly the number that reached the owner. What the empty box
          // hid was not whether the branch fires but HOW FAR NEGATIVE the
          // figure goes. Stated here rather than left as a green.
          note('truth 19, arm 9 — the `nowRemaining < 0` branch: ' +
            (nowRemaining < 0 ? 'TAKEN' : 'NOT TAKEN') + ' at rows=' +
            post.pickerRows + ' (nowRemaining=' + nowRemaining + 'px). ' +
            'For comparison it was ALSO TAKEN at rows=' + EMPTY_ROWS +
            ' (nowRemaining=' + EMPTY_REMAINING + 'px), so this run widens ' +
            'a known-negative figure rather than reaching the branch for ' +
            'the first time.');
          if (nowRemaining < 0) {
            note('⛔ OWED TO HER (26.96-28, T-26.96-102): the room left ' +
              'over is now NEGATIVE (' + nowRemaining + 'px). She accepted ' +
              'this placement having been told about ' + TOLD_REMAINING +
              'px remained; with the picker on screen the top of the pane ' +
              'and the "keep this private too" box can no longer be ' +
              'visible at the same moment on a ' + post.winH + 'px window. ' +
              '⛔ NOT ADJUSTED AWAY and ⛔ NOT decided here — the control ' +
              'is still reachable by scrolling (arm 4 measured that), and ' +
              'what to do about the difference is hers.');
          } else if (Math.abs(remainingMoved) > 0) {
            note('⚠ the room left over moved by ' + remainingMoved + 'px ' +
              'against what she was told. Recorded, not adjusted.');
          }

          // -------------------------------------------------------------
          // ARM 10 — ⛔⛔ THE ARM BUILT TO FAIL. 26.96-35.
          //
          // Everything in arms 7–9 now rests on one claim: that this file
          // can tell a picker with rows in it from a picker with none. ⛔ A
          // unanimous green with no failing arm proves nothing — and this
          // suite has already produced exactly that failure once, reporting
          // real-looking geometry for four plans while the box it was
          // measuring was empty and nothing anywhere went red.
          //
          // So the SAME picker, on the SAME viewport, in the SAME run, is
          // driven back to an EMPTY box by typing a string no folder can
          // match, and the two figures must DIFFER. If a filled box and an
          // empty box measure the same, the instrument is not seeing the
          // picker at all and every number above is worthless.
          //
          // ⛔ TYPED THROUGH THE SHIPPED FIELD WITH A TRUSTED PRESS, not by
          // reaching into the page's state: the narrowing is the shipped
          // `input` handler's own work, and a synthetic assignment would
          // prove the gate can drive a variable rather than the control.
          // ⛔ THE TYPING IS ALSO ASSERTED TO HAVE LANDED before the verdict
          // is read — a mutation that never applied reads exactly like a
          // gate that does not hold.
          // -------------------------------------------------------------
          const filledPickerH = post.pickerH;
          const filledAddTop = post.addFromPaneTop;
          const filledRows = post.pickerRows;
          await click(session, ADD_FIELD_SEL);
          await cdp.send(session, 'Input.insertText',
            { text: NO_SUCH_FOLDER });
          const typedBack = await cdp.evaluate(session,
            '(function(){var f=document.querySelector(' +
            JSON.stringify(ADD_FIELD_SEL) + ');return f?String(f.value):"";' +
            '})()');
          const emptied = await settleChoices(session, 0);
          const control = await read(session);
          if (typedBack !== NO_SUCH_FOLDER) {
            fail('[truth-19/arm10] ⛔ THE CONTROL COULD NOT BE DRIVEN: the ' +
              'filter string never reached the shipped field (it holds ' +
              JSON.stringify(typedBack) + '). The comparison below would be ' +
              'two readings of the same state, which is the shape of a ' +
              'control that cannot fail.');
          } else if (emptied !== 0) {
            fail('[truth-19/arm10] ⛔ THE OFFERED LIST DID NOT EMPTY: with ' +
              'a string no folder can match typed into the shipped field, ' +
              'the picker still renders ' + emptied + ' row(s). Either the ' +
              'narrowing is not running or this file is counting something ' +
              'other than the offered rows — and in both cases the row ' +
              'counts printed beside every figure above mean nothing.');
          } else if (control.pickerH === filledPickerH &&
                     control.addFromPaneTop === filledAddTop) {
            fail('[truth-19/arm10] ⛔⛔ THE INSTRUMENT CANNOT TELL A FILLED ' +
              'BOX FROM AN EMPTY ONE: at rows=' + filledRows + ' the picker ' +
              'box measured ' + filledPickerH + 'px with the add field ' +
              filledAddTop + 'px below the pane top, and at rows=' + emptied +
              ' it measures exactly the same. Every figure in arms 7, 8 and ' +
              '9 is therefore a reading of something that is not the ' +
              'offered list, and none of them may be recorded.');
          } else {
            note('truth 19, arm 10 (⛔ THE ARM BUILT TO FAIL — the ' +
              'instrument really sees the offered list): same run, same ' +
              VIEWPORT.width + '×' + VIEWPORT.height + ' viewport, same ' +
              'pane. FILLED rows=' + filledRows + ' → picker box ' +
              filledPickerH + 'px, add field ' + filledAddTop + 'px below ' +
              'the pane top. EMPTIED rows=' + emptied + ' → picker box ' +
              control.pickerH + 'px, add field ' + control.addFromPaneTop +
              'px below the pane top. The offered list is worth ' +
              (filledPickerH - control.pickerH) + 'px of picker box and ' +
              (filledAddTop - control.addFromPaneTop) + 'px of distance to ' +
              'the control she uses. ⛔ A measurement, not a verdict.');
          }
        }
      }
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* closing */ } }
    /* ⛔ A NAMED VIOLATION, NOT AN ESCAPING EXCEPTION. See
       stopReportingFailure() above for why: a throw here used to reach the
       top-level catch and print COULD NOT BE DRIVEN over every real finding
       this run had already made. It is reported as its own violation instead,
       so the run fails on the product's account AND on the teardown's, with
       both printed. */
    const teardown = await stopReportingFailure();
    if (teardown) {
      fail('[teardown] ⛔ THE FIXTURE TREE SURVIVED TEARDOWN — reported, not ' +
        'swallowed, and it no longer erases the findings above: ' + teardown);
    }
  }

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_roster_short_viewport FAILED — ' + violations.length +
      ' violation(s), ' + notes.length + ' passed');
    process.exitCode = 1;
  } else {
    console.log('test_roster_short_viewport OK — ' + notes.length + '/' +
      notes.length + ' checks (truth 19, driven in real Chrome at ' +
      VIEWPORT.width + '×' + VIEWPORT.height + ')');
  }
})().catch(function (e) {
  console.error('test_roster_short_viewport COULD NOT BE DRIVEN: ' +
    (e && e.message ? e.message : e));
  process.exitCode = 1;
});
