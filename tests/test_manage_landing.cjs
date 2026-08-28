#!/usr/bin/env node
'use strict';
/* test_manage_landing — 26.99955-01: the F-9 reachability + count-discipline
 * pin for the Manage landing page.
 *
 * WHAT THIS EXISTS FOR. Her 2026-08-21 ruling removed the Manage side panel:
 * every pane surfaces on the main page as tiles in three groups, and tapping
 * a tile opens that section full-width. The named defect class this suite
 * fences is F-9 — a pane silently unreachable in a new layout. The mockups
 * this phase builds from predate the `subjects` ("set aside") pane and list
 * SIXTEEN panes; the shipped registry holds SEVENTEEN. A landing page built
 * from any hand-kept list drops a pane the day the registry grows, so this
 * suite pins the derivation itself AND drives reachability in a real Chrome.
 *
 * ARM 1 — static source pins over app.js:
 *   - `renderManageTiles` exists and its body region references MANAGE_PANES
 *     (the ONE registry) and contains NO array literal enumerating keys;
 *   - `manageLandingGroup` ends on its default branch (`return 'uncounted';`)
 *     so an unmapped future key lands in a group instead of vanishing;
 *   - the tile template renders the count span ONLY under the null check
 *     (law 3: null-count panes carry no digit) — the guard is pinned as
 *     source text.
 *   ⛔ THE LIFT IS NARROWED (the derivation-needs-a-narrowed-arm lesson): a
 *   lift that comes up SHORT — function missing, region empty or truncated —
 *   THROWS a named LIFT_SHORT error. It never prints a clean count over a
 *   failed lift.
 *
 * ARM 2 — CDP live reachability in real Chrome over the app harness:
 *   - every pane key lifted from the MANAGE_PANES source region (seventeen
 *     or more, `subjects` among them — asserted, so a shrunken lift fails
 *     loudly) has a landing tile with that data-pane at NON-ZERO rendered
 *     size. The one conditional (`cleaning`, D-06: absent until
 *     CLEAN.present) is respected by asking the shipped rail — the same
 *     filter through a DIFFERENT renderer — whether cleaning is present in
 *     this fixture; absent there, the tile must be absent too (never greyed).
 *     ⭐ 26.99955-03: `librarian` is the ONE key whose landing surface is
 *     not a tile — the candle card (#manage-candle-card) plus the pane's
 *     own Row A containers replaced its plan-01 provisional door tile (her
 *     option-B ruling: the landing page IS that pane), so its reachability
 *     is measured on the card, live, the same non-zero-size way.
 *   - one full round-trip is driven: pile tile → #manage-sec-pile at
 *     non-zero height AND #manage-landing hidden → the back control →
 *     #manage-landing visible again.
 *
 * ARM 3 — 26.99955-03, the SECOND route to every pane (her "at least make
 *   it hideable" fallback): the ☰ sections overlay is opened live and
 *   every key lifted from the MANAGE_PANES source region must have a rail
 *   row at NON-ZERO rendered size inside the OPEN overlay (the cleaning
 *   D-06 conditional respected the same way as arm 2), and Escape must
 *   close the overlay while popping EXACTLY one layer (the landing stays).
 *   ⛔ Narrowed-lift discipline: the overlay's own panel is asserted at
 *   non-zero size BEFORE any row is counted — an overlay that never
 *   reached the screen fails loudly rather than iterating zero rows and
 *   printing a clean count.
 *
 * ARM 2b — 26.99955-02, the ruled-homes visibility pins (her 2026-08-25
 *   rulings on the non-pane surfaces):
 *   - #manage-bless-where — her F-1 signpost — renders on the LANDING page
 *     at non-zero laid-out size, measured BOTH ways (offsetWidth/offsetHeight
 *     AND getBoundingClientRect), so a present-but-hidden signpost fails
 *     here by name rather than passing as markup;
 *   - #manage-search — ruled into the opened section — renders at non-zero
 *     laid-out size while a pane is open (measured during the round-trip's
 *     pane-open step, both ways).
 *
 * ⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY. tests/lib/app-server.cjs builds a
 * synthetic library under os.tmpdir() and serves that; library.local.json is
 * never read. ⛔ FULLY OFFLINE: the only sockets are 127.0.0.1 (the harness
 * server and Chrome's own DevTools pipe). Nothing here can reach a network,
 * a CDN, or the paid key on this machine.
 *
 * THE ANTI-VACUITY ANSWERS.
 *  (1) Driven RED on a planted defect before being believed: a temporary
 *      filter excluding `subjects` from renderManageTiles made arm 2 fail
 *      NAMING `subjects` (evidence in 26.99955-01-SUMMARY.md); the plant was
 *      reverted, never committed. Arm 2b was likewise driven RED twice
 *      before being believed — a display:none plant on the signpost and
 *      then on the search wrapper each failed naming exactly the hidden
 *      surface (evidence in 26.99955-02-SUMMARY.md); both plants reverted,
 *      never committed. Arm 3 was driven RED on a scratch CSS rule hiding
 *      one overlay row — it failed naming exactly that key (evidence in
 *      26.99955-03-SUMMARY.md); the plant was reverted, never committed.
 *  (2) Could it pass over NOTHING? No — arm 2 requires ≥17 keys from the
 *      source lift and a non-zero-size tile per key; an empty landing page
 *      fails every key by name.
 *  (3) Could the lift silently shorten? No — LIFT_SHORT throws, and the key
 *      lift additionally asserts `subjects` is among the lifted keys.
 *      Arm 4's two markup lifts throw the same way when their region is
 *      unreadable, so an absence pin never passes over an unread file.
 *  (4) Arm 4 was driven RED on a planted one-character deviation in one of
 *      her ruled sentences before it was believed — it failed naming the
 *      verdict and printing the expected bytes (evidence in
 *      26.99955-05-SUMMARY.md); the plant was reverted, never committed.
 *
 * ARM 4 — 26.99955-05, her copy sitting: every sentence she chose pinned as
 *   byte-exact source text, AND every surface she declined a sentence for
 *   pinned as an absence (ten `no caption` verdicts, two `no heading`, the
 *   overlay's `no heading / no footer`). A `no` at a copy sitting is a
 *   verdict, and an unpinned absence does not survive a helpful editor.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));
const appServer = require(path.join(ROOT, 'tests/lib/app-server.cjs'));

const violations = [];
const notes = [];
function fail(msg) { violations.push(msg); }
function note(msg) { notes.push(msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---- the narrowed lift ---------------------------------------------------
   A derivation is only as honest as its lift. Each extractor THROWS a named
   LIFT_SHORT error on a missing function or an empty/truncated region —
   never a clean pass over a short read. */
function liftFnBody(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at === -1) {
    throw new Error('LIFT_SHORT: function ' + name + ' was not found in ' +
      'app.js — a lift that comes up short must fail LOUDLY, never print a ' +
      'clean count over a failed extraction.');
  }
  const end = src.indexOf('\n  }', at);
  if (end === -1 || end - at < 40) {
    throw new Error('LIFT_SHORT: the body region of ' + name + ' is empty ' +
      'or truncated (' + Math.max(0, end - at) + ' chars) — nothing ' +
      'pinned after this point would be a reading.');
  }
  return src.slice(at, end);
}

function liftPaneKeys(src) {
  const at = src.indexOf('var MANAGE_PANES = [');
  if (at === -1) {
    throw new Error('LIFT_SHORT: the MANAGE_PANES registry literal was not ' +
      'found in app.js — the roster lift failed and no reachability claim ' +
      'below could be a reading.');
  }
  const end = src.indexOf('\n  ];', at);
  if (end === -1) {
    throw new Error('LIFT_SHORT: the MANAGE_PANES region never closes — ' +
      'truncated lift, failing loudly.');
  }
  const region = src.slice(at, end);
  const keys = [];
  const re = /key:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(region)) !== null) { keys.push(m[1]); }
  if (keys.length < 17) {
    throw new Error('LIFT_SHORT: the MANAGE_PANES lift found only ' +
      keys.length + ' keys where the shipped registry holds seventeen — a ' +
      'shortened lift would quietly shrink the reachability claim, so it ' +
      'fails here instead.');
  }
  if (keys.indexOf('subjects') === -1) {
    throw new Error('LIFT_SHORT: the lifted key set is missing `subjects` — ' +
      'the exact pane the F-9 mockup gap dropped. The lift cannot be ' +
      'believed.');
  }
  return keys;
}

/* ---- ARM 1: static source pins ---- */
function staticArm(appSrc) {
  const tiles = liftFnBody(appSrc, 'renderManageTiles');
  if (tiles.indexOf('MANAGE_PANES') === -1) {
    fail('[arm1] renderManageTiles does not reference MANAGE_PANES — the ' +
      'tiles are no longer derived from the ONE registry (F-9 reopens the ' +
      'day the registry grows).');
  } else {
    note('arm1: renderManageTiles derives from MANAGE_PANES');
  }
  const tilesNoComments = tiles.replace(/\/\/[^\n]*/g, '');
  if (/\[\s*['"]/.test(tilesNoComments)) {
    fail('[arm1] renderManageTiles contains an array literal of strings — ' +
      'a second hand-kept pane list is how F-9 recurs.');
  } else {
    note('arm1: no hand-kept key list inside renderManageTiles');
  }
  const group = liftFnBody(appSrc, 'manageLandingGroup');
  if (!/return 'uncounted';\s*$/.test(group.trimEnd())) {
    fail('[arm1] manageLandingGroup does not end on its default branch ' +
      "(return 'uncounted';) — an unmapped future key would vanish " +
      'instead of landing in a group.');
  } else {
    note('arm1: manageLandingGroup carries the default (uncounted) branch');
  }
  // Law 3: the count span renders ONLY under the null check. Pinned as the
  // exact source text of the guard at the sink.
  const NULL_GUARD = "(n === null ? '' : ' <span class=\"manage-tile-count\">'";
  if (tiles.indexOf(NULL_GUARD) === -1) {
    fail('[arm1] the tile template no longer guards the count span behind ' +
      'the null check — a null-count pane would grow a digit (law 3). ' +
      'Expected the source text ' + JSON.stringify(NULL_GUARD));
  } else {
    note('arm1: the count span is guarded by the null check (law 3)');
  }
}

/* ---- ARM 4: her ruled copy (26.99955-05) ---------------------------------
   THE COPY SITTING'S PINS. On 2026-08-26 she went through the whole audited
   string list in one pass. This arm pins the outcome — BOTH halves of it,
   because at a copy sitting a `no` is as much a verdict as a sentence:

     the PRESENT pins — every sentence she chose, as source text, byte-exact.
       A reworded, re-punctuated or "tidied" string fails here by name.
     the ABSENT pins — the surfaces she was offered a sentence for and
       declined. Ten separate `no caption` verdicts and two `no heading`
       verdicts are the reason the landing page is bare, and without a pin
       the next well-meaning agent reads that bareness as an unfinished slot
       and fills it. An absence nobody pinned is an absence that does not
       survive contact with a helpful editor.

   ⛔ EQUALITY OF BYTES, NOT A MATCH ON MEANING. Her words are applied
   verbatim and undecorated (law 4); an agent may apply them and may never
   choose them, so every expectation below is the literal string.

   ⭐ Q1, the chip row, is pinned on BOTH axes: her three words (verbatim,
   in her order, roster closed at three) AND the fence around them — a
   readout on the derivations that already exist, never a fourth state, no
   digits, no control. Her sheet's applier note is what the second half
   defends, and it is the half an agent would erode first. */
function copyArm(appSrc, indexSrc) {
  // Adjacent string literals split across source lines are joined, so a
  // sentence wrapped for the 80-column rule still reads as one string.
  const flat = appSrc.replace(/'\s*\+\s*\n\s*'/g, '');

  const RULED = [
    { q: 'Q2', where: 'the candle card',
      s: 'the candle is the librarian. its flame carries what she is ' +
         'doing — never the time of day.' },
    { q: 'Q22', where: 'the front-page numbers card',
      s: 'these numbers are kept on this computer and go nowhere.' },
    { q: 'Q28', where: 'the private-folders page',
      s: 'the same list the room shows you before an import — edited ' +
         'here, it is edited there.' },
    { q: 'Q29', where: 'the private-folders page',
      s: 'this list is her boundary, so it stays next to her.' }
  ];
  RULED.forEach(function (r) {
    if (flat.indexOf(r.s) === -1) {
      fail('[arm4] ' + r.q + ': her ruled sentence for ' + r.where + ' is ' +
        'not in app.js byte-for-byte. Expected ' + JSON.stringify(r.s) +
        ' — she chose these words at the 2026-08-26 copy sitting and law 4 ' +
        'says they ship verbatim and undecorated. If this went red because ' +
        'the sentence was improved, the improvement is the defect.');
    } else {
      note('arm4: ' + r.q + ' — her ruled sentence lives on ' + r.where);
    }
  });

  // Q21: four short labels, each over its own number, `resting` split out
  // standalone. Pinned as the four label literals inside the card.
  const numbers = liftFnBody(appSrc, 'renderNumbersCard');
  ['visits', 'glad', 'never again', 'resting'].forEach(function (label) {
    if (numbers.indexOf("'" + label + "'") === -1) {
      fail('[arm4] Q21: the numbers card has no `' + label + '` label — ' +
        'she chose four short labels each over its own number, with ' +
        '`resting` standalone.');
    }
  });
  if (violations.length === 0) { note('arm4: Q21 — the four labels stand'); }

  // Q20: the card REUSES the shipped pane heading. The one-literal rule
  // applied to copy she kept: the bytes are typed ONCE and both surfaces
  // read that one source, so a reword can never move one and leave the
  // other behind (this is exactly how already-approved copy rots).
  const HEADING = 'Stats (on this device only)';
  const heads = appSrc.split(HEADING).length - 1;
  if (heads !== 1) {
    fail('[arm4] Q20: the shipped stats heading is typed ' + heads +
      ' times in app.js, expected exactly once (the STATS_HEADING ' +
      'constant). She ruled the front-page card REUSES the pane heading; ' +
      'two literals that happen to match today are how that reuse rots.');
  } else if (!/var STATS_HEADING = '/.test(appSrc)) {
    fail('[arm4] Q20: STATS_HEADING is no longer the declared one source ' +
      'for the shipped stats heading.');
  } else {
    note('arm4: Q20 — the stats heading is typed exactly once and reused');
  }

  // D-03 / UPD-03: publish-only date stamp — no hand-edited semver.
  // Manage reads status.release_date via APP.releaseDate and renders
  // stamp-or-omit in 'about your library' (she kept the word "version").
  const library = liftFnBody(appSrc, 'renderLibrarySection');
  if (/var APP_VERSION = '/.test(appSrc)) {
    fail('[arm4] hand-edited APP_VERSION must be retired (D-03); Manage ' +
      'reads the publish stamp via status.release_date / APP.releaseDate');
  } else if (library.indexOf('APP.releaseDate') === -1) {
    fail("[arm4] 'about your library' does not read APP.releaseDate — " +
      'one stamp reader, stamp-or-absent (UPD-03/04)');
  } else if (library.indexOf('version ') === -1) {
    fail("[arm4] when a stamp is present the section must still say " +
      "'version' beside the date — she ruled Keep 'version' (26.99955-06)");
  } else {
    note('arm4: stamp-or-absent via APP.releaseDate; no APP_VERSION');
  }

  // Q28/Q29 belong to the PANE, not the shared editor: renderRosterEditor
  // serves the import screen too, and her first sentence names the import
  // screen from the outside — true in the pane, false on the screen it
  // names. A future move into the shared renderer is caught here.
  const editor = liftFnBody(appSrc, 'renderRosterEditor');
  const editorFlat = editor.replace(/'\s*\+\s*\n\s*'/g, '');
  if (editorFlat.indexOf('the same list the room shows you') !== -1) {
    fail('[arm4] Q28: her private-folders sentence moved into ' +
      'renderRosterEditor, which BOTH hosts use — on the import screen ' +
      'that sentence names the screen it is standing on.');
  } else {
    note('arm4: Q28/Q29 stay on the pane, out of the shared editor');
  }

  /* ---- the ABSENT pins: verdicts that were `no` ---- */

  // Q8/Q9/Q10 + Q14–Q19 — ten `no caption` verdicts. A tile is a label and
  // a count; the template is pinned as source text so a caption sink
  // cannot be added without this going red.
  const tiles = liftFnBody(appSrc, 'renderManageTiles');
  const tileBody = tiles.replace(/\/\/[^\n]*/g, '');
  const escapes = (tileBody.match(/escapeHtml\(/g) || []).length;
  if (escapes !== 2) {
    fail('[arm4] the tile template now has ' + escapes + ' escapeHtml ' +
      'sinks, expected exactly 2 (the label and the count). She was ' +
      'offered a caption on the memory door, the tidy door, the set-aside ' +
      'door and all six quiet tiles — TEN verdicts — and took `no ' +
      'caption` on every one. A third sink is a caption nobody ruled.');
  } else {
    note('arm4: the tiles stay label-and-count — her ten `no caption` ' +
      'verdicts hold');
  }

  // Q11/Q12 — no heading over the counted group, none over the last one.
  // Read from the markup between the landing grids.
  const landingAt = indexSrc.indexOf('<div id="manage-landing">');
  const landingEnd = indexSrc.indexOf('<div id="manage-pane-view">');
  if (landingAt === -1 || landingEnd === -1 || landingEnd <= landingAt) {
    throw new Error('LIFT_SHORT: the #manage-landing region could not be ' +
      'read out of index.html — a heading claim over an unread region ' +
      'would not be a reading.');
  }
  const landingRegion = indexSrc.slice(landingAt, landingEnd)
    .replace(/<!--[\s\S]*?-->/g, '');
  const headings = (landingRegion.match(/<h[1-6][\s>]/g) || []).length;
  if (headings !== 0) {
    fail('[arm4] Q11/Q12: the landing page grew ' + headings + ' heading ' +
      'element(s). She was offered a heading over the six counted tiles ' +
      'and a heading over the last group and chose NEITHER — the bare ' +
      'page is her ruling, not an unfinished slot.');
  } else {
    note('arm4: Q11/Q12 — the groups stay headingless by her ruling');
  }

  // Q24/Q25 — no heading and no footer inside the sections overlay panel.
  const panelAt = indexSrc.indexOf('<div id="manage-sections-panel">');
  if (panelAt === -1) {
    throw new Error('LIFT_SHORT: #manage-sections-panel was not found in ' +
      'index.html — the overlay absence pins have nothing to read.');
  }
  const panelEnd = indexSrc.indexOf('</div>', indexSrc.indexOf('<nav ' +
    'id="manage-rail"></nav>', panelAt));
  const panel = indexSrc.slice(panelAt, panelEnd)
    .replace(/<!--[\s\S]*?-->/g, '');
  if (/<h[1-6][\s>]/.test(panel) || /<p[\s>]/.test(panel)) {
    fail('[arm4] Q24/Q25: the sections overlay grew a heading or a footer ' +
      'line. She was offered both and took neither.');
  } else {
    note('arm4: Q24/Q25 — the overlay panel stays the close control and ' +
      'the list');
  }

  // Q1 — her three state words on the candle card, approved-as-shown.
  // Each word is pinned as a literal, and the ROSTER is pinned closed at
  // three: "three states maximum" is her sheet's own applier note, and a
  // fourth chip is the law-3 failure this row's fence exists for.
  const chipsAt = appSrc.indexOf('var CANDLE_CHIPS = [');
  if (chipsAt === -1) {
    fail('[arm4] Q1: CANDLE_CHIPS is gone — her three state words ' +
      '(`lit`, `reaching`, `thinking`) ship on the candle card by her ' +
      '2026-08-26 verdict, approved as shown.');
  } else {
    const chipRegion = appSrc.slice(chipsAt, appSrc.indexOf('];', chipsAt));
    const words = [];
    const wordRe = /word: '([^']+)'/g;
    let wm;
    while ((wm = wordRe.exec(chipRegion)) !== null) { words.push(wm[1]); }
    const HERS = ['lit', 'reaching', 'thinking'];
    if (words.join('|') !== HERS.join('|')) {
      fail('[arm4] Q1: the chip words read ' + JSON.stringify(words) +
        ' but she chose ' + JSON.stringify(HERS) + ', in that order, at ' +
        'the 2026-08-26 sitting. Her words ship verbatim and undecorated ' +
        '(law 4) — a fourth chip, a dropped chip or a reworded one all ' +
        'fail here.');
    } else {
      note('arm4: Q1 — her three state words ship, in her order, and the ' +
        'roster is closed at three');
    }
  }

  // ⛔ THE CHIP ROW IS A READOUT AND NOTHING MORE. Her sheet's applier
  // note is explicit: display only, driven by the derivations that already
  // exist, never a fourth state, no digits, no time, no absence. The two
  // inputs are pinned by name, and a THIRD state input would mean the
  // chips had grown a derivation of their own.
  const chipSync = liftFnBody(appSrc, 'candleChipSync');
  if (chipSync.indexOf('CANDLE.reaching') === -1) {
    fail('[arm4] Q1: candleChipSync no longer reads the EXISTING ' +
      'CANDLE.reaching derivation — the chips must ride what the candle ' +
      'already rides, never a state of their own.');
  }
  if (/\d/.test(chipSync.replace(/\/\/[^\n]*/g, ''))) {
    fail('[arm4] Q1: a digit appeared in the chip derivation — the chips ' +
      'say what she is doing, never how many or how long (law 3).');
  }
  // The row is built inline in renderCandleCard (the seam gate wants
  // literal or seam-evident segments at an innerHTML sink), so the render
  // pins read that function's body.
  const chipRender = liftFnBody(appSrc, 'renderCandleCard');
  // ⚠ THE SINK READS THE ROSTER THROUGH `shownCandleChips()` SINCE
  // 2026-08-26, and this check follows it rather than being relaxed. HER
  // RULING G-…-02: while the connection engine is parked, the card shows TWO
  // of her three words, because the middle one names a state no user action
  // can reach and her own caption says the flame carries what the librarian
  // is doing. ⛔ WHAT THIS GATE PROTECTS IS UNCHANGED and is still checked
  // below: her words are typed exactly ONCE, in the roster, and read back at
  // the sink — never retyped there. The filter reads that same roster and
  // hands its own rows through, so a word can still only come from her list.
  // ⚠ Both spellings are accepted so the gate does not simply move with
  // whatever the sink happens to say: the sink must name the roster, or the
  // one function that is allowed to narrow it.
  if (chipRender.indexOf('CANDLE_CHIPS') === -1 &&
      chipRender.indexOf('shownCandleChips()') === -1) {
    fail('[arm4] Q1: the candle card no longer renders from the ' +
      'CANDLE_CHIPS roster — her words must be typed exactly once and ' +
      'read back, never retyped at the sink.');
  }
  // ⛔ AND THE ONE PERMITTED NARROWING IS ITSELF PINNED, because "the sink
  // may call a function" is only safe while that function can only ever
  // SUBTRACT from her roster. It must read the roster, and it must decide by
  // the SAME flag the parked state is gated by — a second copy of that
  // decision could disagree with the room the day the park is lifted.
  if (appSrc.indexOf('function shownCandleChips') !== -1) {
    const shown = liftFnBody(appSrc, 'shownCandleChips');
    if (shown.indexOf('CANDLE_CHIPS') === -1) {
      fail('[arm4] Q1: shownCandleChips no longer reads the roster — the ' +
        'only thing it may do is leave one of her words out, and it cannot ' +
        'do that to a list it does not read.');
    }
    if (shown.indexOf('CONNECTION_ENGINE_ENABLED') === -1) {
      fail('[arm4] Q1: shownCandleChips no longer decides by the flag the ' +
        'parked state is gated by — her word must come back on the day the ' +
        'state it names can happen, and a second copy of that decision is ' +
        'how the card and the room start disagreeing.');
    }
  }
  if (/manage-candle-chip[\s\S]*?(addEventListener|onclick|<button)/
    .test(chipRender)) {
    fail('[arm4] Q1: the chip row grew a control. It is display only — ' +
      'a chip that can be pressed implies a state she can set by hand, ' +
      'which is not what she approved.');
  }
  if (violations.length === 0) {
    note('arm4: Q1 — the chips stay a readout on the existing derivations ' +
      '(no fourth state, no digits, no control)');
  }
}

/* ---- ARM 2: CDP live reachability ---- */
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

async function liveArm(keys) {
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await click(session, '#room-manage-link');
    await sleep(1500);

    /* the landing tiles, measured live */
    const raw = await cdp.evaluate(session, '(function(){' +
      'var out={tiles:{},railHasCleaning:false,landingH:0,' +
      ' blessOffW:0,blessOffH:0,blessRectW:0,blessRectH:0,' +
      ' candleW:0,candleH:0};' +
      'var landing=document.getElementById("manage-landing");' +
      'if(landing){out.landingH=landing.getBoundingClientRect().height;}' +
      'var cc=document.getElementById("manage-candle-card");' +
      'if(cc){var ccr=cc.getBoundingClientRect();' +
      ' out.candleW=ccr.width;out.candleH=ccr.height;}' +
      'var bw=document.getElementById("manage-bless-where");' +
      'if(bw){var br=bw.getBoundingClientRect();' +
      ' out.blessOffW=bw.offsetWidth;out.blessOffH=bw.offsetHeight;' +
      ' out.blessRectW=br.width;out.blessRectH=br.height;}' +
      'document.querySelectorAll("#manage-landing .manage-tile")' +
      '.forEach(function(t){var r=t.getBoundingClientRect();' +
      ' out.tiles[t.getAttribute("data-pane")]=(r.width>0&&r.height>0);});' +
      'out.railHasCleaning=!!document.querySelector(' +
      '".manage-rail-item[data-pane=\\"cleaning\\"]");' +
      'return JSON.stringify(out);})()');
    const live = JSON.parse(raw);
    if (!(live.landingH > 0)) {
      fail('[arm2] #manage-landing rendered at zero height on entry — the ' +
        'landing page is not the landing state.');
    }
    keys.forEach(function (key) {
      if (key === 'librarian') {
        // 26.99955-03: the candle card replaced the plan-01 provisional
        // door tile — the landing page IS this pane (her option-B
        // ruling), so its landing surface is the card, measured live at
        // non-zero rendered size like every tile.
        if (!(live.candleW > 0 && live.candleH > 0)) {
          fail('[arm2] F-9: pane key `librarian` has no landing surface ' +
            'at non-zero rendered size — #manage-candle-card measured ' +
            live.candleW + 'x' + live.candleH + '. The candle card is ' +
            'this pane\'s one landing surface since 26.99955-03.');
        } else {
          note('arm2: `librarian` reachable as the candle card (' +
            Math.round(live.candleW) + 'x' + Math.round(live.candleH) +
            ')');
        }
        return;
      }
      if (key === 'cleaning' && !live.railHasCleaning) {
        // D-06: absent until CLEAN.present — the tile must be absent too,
        // never greyed. The shipped rail (same filter, different renderer)
        // is the in-page witness for this fixture's CLEAN state.
        if (Object.prototype.hasOwnProperty.call(live.tiles, 'cleaning')) {
          fail('[arm2] `cleaning` has a landing tile while the tier is ' +
            'absent — D-06 says absent, never greyed.');
        } else {
          note('arm2: `cleaning` correctly absent with the tier absent ' +
            '(D-06)');
        }
        return;
      }
      if (live.tiles[key] !== true) {
        fail('[arm2] F-9: pane key `' + key + '` has no landing tile at ' +
          'non-zero rendered size — a pane the side panel reached is ' +
          'unreachable in the new layout.');
      }
    });
    if (violations.length === 0) {
      note('arm2: every registry key has a live landing tile at non-zero ' +
        'size (' + keys.length + ' keys, cleaning conditional respected)');
    }

    /* ARM 2b — her ruled landing surface: the F-1 signpost renders on the
       landing page at non-zero laid-out size, both measures. A signpost
       present in markup but laid out at zero is exactly the
       present-but-hidden failure this arm exists to name. */
    if (!(live.blessOffW > 0 && live.blessOffH > 0 &&
          live.blessRectW > 0 && live.blessRectH > 0)) {
      fail('[arm2b] #manage-bless-where — her F-1 signpost, ruled onto the ' +
        'landing page (26.99955-02) — is not at non-zero laid-out size on ' +
        'the landing (offset ' + live.blessOffW + 'x' + live.blessOffH +
        ', rect ' + live.blessRectW + 'x' + live.blessRectH + ').');
    } else {
      note('arm2b: the bless-where signpost renders on the landing page ' +
        '(offset ' + live.blessOffW + 'x' + live.blessOffH + ', rect ' +
        Math.round(live.blessRectW) + 'x' + Math.round(live.blessRectH) +
        ')');
    }

    /* the round-trip: pile → full-width pane → back → landing */
    await click(session, '#manage-landing .manage-tile[data-pane="pile"]');
    await sleep(1200);
    const open = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var landing=document.getElementById("manage-landing");' +
      'var pile=document.getElementById("manage-sec-pile");' +
      'var s=document.getElementById("manage-search");' +
      'var sr=s?s.getBoundingClientRect():{width:0,height:0};' +
      'return JSON.stringify({' +
      ' landingH: landing?landing.getBoundingClientRect().height:0,' +
      ' pileH: pile?pile.getBoundingClientRect().height:0,' +
      ' searchOffW: s?s.offsetWidth:0, searchOffH: s?s.offsetHeight:0,' +
      ' searchRectW: sr.width, searchRectH: sr.height});})()'));
    if (!(open.pileH > 0)) {
      fail('[arm2] the pile tile did not open the pile section at non-zero ' +
        'height (measured ' + open.pileH + ').');
    }
    if (open.landingH !== 0) {
      fail('[arm2] the landing page is still visible with a pane open ' +
        '(height ' + open.landingH + ') — the mode did not switch.');
    }
    /* ARM 2b — her ruled pane-view surface: the title search lives inside
       an opened section (26.99955-02), so with a pane open it must be at
       non-zero laid-out size, both measures. */
    if (!(open.searchOffW > 0 && open.searchOffH > 0 &&
          open.searchRectW > 0 && open.searchRectH > 0)) {
      fail('[arm2b] #manage-search — ruled into the opened section ' +
        '(26.99955-02) — is not at non-zero laid-out size with a pane ' +
        'open (offset ' + open.searchOffW + 'x' + open.searchOffH +
        ', rect ' + open.searchRectW + 'x' + open.searchRectH + ').');
    } else {
      note('arm2b: the title search renders inside the opened section ' +
        '(offset ' + open.searchOffW + 'x' + open.searchOffH + ')');
    }
    await click(session, '#manage-pane-back button');
    await sleep(1200);
    const back = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var landing=document.getElementById("manage-landing");' +
      'return JSON.stringify({' +
      ' landingH: landing?landing.getBoundingClientRect().height:0});})()'));
    if (!(back.landingH > 0)) {
      fail('[arm2] the back control did not return to the landing page ' +
        '(landing height ' + back.landingH + ').');
    }
    if (open.pileH > 0 && open.landingH === 0 && back.landingH > 0) {
      note('arm2: round-trip proven — pile full-width (' +
        Math.round(open.pileH) + 'px), landing hidden, back returns ' +
        '(landing ' + Math.round(back.landingH) + 'px)');
    }

    /* ARM 3 — 26.99955-03: the overlay route. Open the ☰ overlay, prove
       the panel itself reached the screen at non-zero size FIRST (the
       narrowed-lift discipline — zero-row iteration over an unopened
       overlay is impossible), then require a rail row per live key, then
       Escape-close and prove exactly one layer popped. */
    await click(session, '#manage-sections-toggle');
    await sleep(800);
    const ov = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var out={panelW:0,panelH:0,hidden:null,rows:{}};' +
      'var overlay=document.getElementById("manage-sections-overlay");' +
      'out.hidden=overlay?overlay.hidden:null;' +
      'var panel=document.getElementById("manage-sections-panel");' +
      'if(panel){var pr=panel.getBoundingClientRect();' +
      ' out.panelW=pr.width;out.panelH=pr.height;}' +
      'document.querySelectorAll(' +
      '"#manage-sections-overlay .manage-rail-item")' +
      '.forEach(function(t){var r=t.getBoundingClientRect();' +
      ' out.rows[t.getAttribute("data-pane")]=(r.width>0&&r.height>0);});' +
      'return JSON.stringify(out);})()'));
    if (ov.hidden !== false || !(ov.panelW > 0 && ov.panelH > 0)) {
      fail('[arm3] the ☰ overlay never opened at non-zero size (hidden=' +
        ov.hidden + ', panel ' + ov.panelW + 'x' + ov.panelH + ') — no ' +
        'row reading after this point would be a reading, so this fails ' +
        'LOUDLY instead of iterating zero rows into a clean count.');
    } else {
      let arm3Bad = 0;
      keys.forEach(function (key) {
        if (key === 'cleaning' && !live.railHasCleaning) {
          if (Object.prototype.hasOwnProperty.call(ov.rows, 'cleaning')) {
            arm3Bad += 1;
            fail('[arm3] `cleaning` has an overlay row while the tier is ' +
              'absent — D-06 says absent, never greyed.');
          }
          return;
        }
        if (ov.rows[key] !== true) {
          arm3Bad += 1;
          fail('[arm3] F-9 (overlay route): pane key `' + key + '` has ' +
            'no rail row at non-zero rendered size inside the open ☰ ' +
            'overlay — a pane the old side panel reached is unreachable ' +
            'on her fallback route.');
        }
      });
      if (arm3Bad === 0) {
        note('arm3: every registry key has a live overlay row at ' +
          'non-zero size (panel ' + Math.round(ov.panelW) + 'x' +
          Math.round(ov.panelH) + ', cleaning conditional respected)');
      }
      /* Escape closes the overlay — and ONLY the overlay (one layer). */
      for (const type of ['rawKeyDown', 'keyUp']) {
        await cdp.send(session, 'Input.dispatchKeyEvent', {
          type: type, key: 'Escape', code: 'Escape',
          windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
        });
      }
      await sleep(600);
      const esc = JSON.parse(await cdp.evaluate(session, '(function(){' +
        'var o=document.getElementById("manage-sections-overlay");' +
        'var landing=document.getElementById("manage-landing");' +
        'return JSON.stringify({hidden:o?o.hidden:null,' +
        ' landingH:landing?landing.getBoundingClientRect().height:0});' +
        '})()'));
      if (esc.hidden !== true) {
        fail('[arm3] Escape did not close the ☰ overlay (hidden=' +
          esc.hidden + ') — a dismiss path outside the one close funnel.');
      } else if (!(esc.landingH > 0)) {
        fail('[arm3] Escape closed MORE than the overlay — the landing ' +
          'page is gone too (height ' + esc.landingH + '); one press ' +
          'must pop exactly one layer.');
      } else {
        note('arm3: Escape closes the overlay and pops exactly one ' +
          'layer (landing still ' + Math.round(esc.landingH) + 'px)');
      }
    }

    /* ARM 5 — 26.99955-06 (F-01 / WR-05): a re-entry whose library read
       FAILS lands on the front page, never on the pane the previous visit
       left open.

       ⛔ WHAT THIS FENCES. This phase introduced `manage-pane-open` as the
       class that hides the landing wholesale (tokens.css). Both of
       enterManage's failure exits called showScreen('manage') and nothing
       else, and showScreen never touches that class — so re-entering
       against a server that could not answer showed the PREVIOUS visit's
       pane, full-width, carrying the previous visit's counts, with the
       front page gone. That is this project's own "the defect is the
       silence" class, and it was NEW this phase, so it is this phase's.

       BOTH failure exits are driven, because both carried it: the
       rejected-promise exit (.catch) and the non-ok-response exit.

       ⛔ RED-DRIVEN BEFORE IT WAS BELIEVED: run against the unfixed
       enterManage this arm failed on both exits, naming the landing at
       height 0 and `manage-sec-never` still on screen (evidence in
       26.99955-06-SUMMARY.md). A pin that never went red is worth
       nothing. */
    const PROBE = '(function(){' +
      'var s=document.getElementById("screen-manage");' +
      'var r=document.getElementById("screen-room");' +
      'var landing=document.getElementById("manage-landing");' +
      'var pane=document.getElementById("manage-sec-never");' +
      'return JSON.stringify({' +
      ' manageActive: s?s.classList.contains("active"):null,' +
      ' roomActive: r?r.classList.contains("active"):null,' +
      ' paneOpen: s?s.classList.contains("manage-pane-open"):null,' +
      ' landingH: landing?landing.getBoundingClientRect().height:0,' +
      ' paneH: pane?pane.getBoundingClientRect().height:0});})()';
    const UNSTUB = '(function(){if(window.__gsdFetch){' +
      'window.fetch=window.__gsdFetch;window.__gsdFetch=null;}' +
      'return "ok";})()';
    function stubFor(mode) {
      return '(function(){' +
        'if(!window.__gsdFetch){window.__gsdFetch=window.fetch;}' +
        'window.fetch=function(u,o){' +
        ' if(String(u).indexOf("/api/items")!==-1){' +
        (mode === 'reject'
          ? '  return Promise.reject(new Error("forced: unreachable"));'
          : '  return Promise.resolve({ok:false,status:503,' +
            '   json:function(){return Promise.resolve({});}});') +
        ' }' +
        ' return window.__gsdFetch.call(window,u,o);};' +
        'return "ok";})()';
    }
    /* The landing is the starting state of every sub-arm; if a previous
       sub-arm left a pane open (which is exactly what the defect does),
       come back through the shipped back control rather than iterating
       from an unknown state. */
    async function ensureLanding() {
      const st = JSON.parse(await cdp.evaluate(session, PROBE));
      if (st.paneOpen === true) {
        await click(session, '#manage-pane-back button');
        await sleep(900);
      }
    }
    async function failedReEntry(label, mode) {
      await ensureLanding();
      await click(session, '#manage-landing .manage-tile[data-pane="never"]');
      await sleep(1000);
      const opened = JSON.parse(await cdp.evaluate(session, PROBE));
      if (!(opened.paneH > 0 && opened.landingH === 0 &&
            opened.paneOpen === true)) {
        fail('[arm5/' + label + '] the PRECONDITION never held — a pane ' +
          'was not open before the re-entry (pane ' + opened.paneH +
          'px, landing ' + opened.landingH + 'px, mode class ' +
          opened.paneOpen + '). Nothing after this would be a reading, ' +
          'so this fails LOUDLY rather than passing over a state it ' +
          'never reached.');
        return;
      }
      await click(session, '#room-panel-back');
      await sleep(900);
      const inRoom = JSON.parse(await cdp.evaluate(session, PROBE));
      if (inRoom.roomActive !== true) {
        fail('[arm5/' + label + '] the walk back to the room never ' +
          'landed (room active ' + inRoom.roomActive + ') — the re-entry ' +
          'below would not be a re-entry.');
        return;
      }
      await cdp.evaluate(session, stubFor(mode));
      await click(session, '#room-manage-link');
      await sleep(1800);
      const after = JSON.parse(await cdp.evaluate(session, PROBE));
      await cdp.evaluate(session, UNSTUB);
      if (after.manageActive !== true) {
        fail('[arm5/' + label + '] the failed re-entry did not reach the ' +
          'manage screen at all (active ' + after.manageActive + ').');
        return;
      }
      let bad = 0;
      if (after.paneOpen !== false) {
        bad += 1;
        fail('[arm5/' + label + '] a re-entry that could not read the ' +
          'library left `manage-pane-open` on #screen-manage — the mode ' +
          'that hides the front page wholesale survived a read that ' +
          'never happened.');
      }
      if (!(after.landingH > 0)) {
        bad += 1;
        fail('[arm5/' + label + '] the front page is HIDDEN after a ' +
          'failed re-entry (landing height ' + after.landingH + '). The ' +
          'landing must be reachable whether or not the read succeeded.');
      }
      if (after.paneH !== 0) {
        bad += 1;
        fail('[arm5/' + label + '] the PREVIOUS visit\'s pane is still on ' +
          'screen after a failed re-entry (manage-sec-never at ' +
          Math.round(after.paneH) + 'px) — a pane held open by a read ' +
          'that failed shows the last snapshot it could read as if it ' +
          'were this visit\'s.');
      }
      if (bad === 0) {
        note('arm5: a failed re-entry (' + label + ') lands on the front ' +
          'page — landing ' + Math.round(after.landingH) + 'px, mode ' +
          'class off, the previous pane at 0px');
      }
    }
    await failedReEntry('rejected read', 'reject');
    await failedReEntry('non-ok response', 'notok');
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

/* ---- ARM 6: 26.99955-07 — THE SHAPE SHE CHOSE ---------------------------
   WHY THIS ARM EXISTS. She reviewed the shipped Manage page against the
   mockup she had approved and said: "I still feel it is not quite what I
   want, I like how it is look like on the mock up." The comparison found the
   page had shipped as loose wrapping buttons inside the app's 42rem column
   while the drawing is a 1440px page of framed panels. Arms 1–5 above pin
   REACHABILITY and COPY — every one of them passes on the shape she
   rejected, because none of them ever measured a box. This arm measures the
   boxes.

   ⛔ EVERY CLAIM HERE IS A LIVE MEASUREMENT IN REAL CHROME, never a grep. A
   source read for `display:grid` is satisfied by a rule that never wins the
   cascade, and "the numbers card sits beside the last group" is not a fact
   about a stylesheet at all — it is a fact about two rectangles.

   ⛔ ITS OWN SESSION. It runs a fresh server + Chrome rather than riding
   liveArm's, because arm 5 deliberately leaves the page having survived a
   FAILED library read: geometry measured after that would be geometry over a
   snapshot that never arrived.

   WHAT IS PINNED (each was driven RED on the pre-fix shape first —
   evidence in 26.99955-07-SUMMARY.md):
     6a WIDTH, MANAGE ONLY — the manage panel is wide, and a second hosted
        screen is STILL 42rem in the same page. Two-sided on purpose: a
        global widening satisfies half of her ruling and violates the other
        half ("only Manage"), and only the second measurement can tell them
        apart.
     6b PANEL FRAMES — the five drawn panels carry a real border and a card
        background, read off computed style.
     6c EVEN GRIDS — each tile group lays out as a grid whose tiles share ONE
        width. Wrapping flex sizes tiles to their words; that is the ragged
        page she was looking at.
     6d TWO-WEIGHT TILES — the doors beside the candle wear the ink border
        and the quiet tiles wear the thin wood one. Pinned against colours
        resolved from the shipped tokens through a live probe, so the claim
        cannot drift into "some two colours".
     6e NUMBER-LED COUNTED TILES — the number sits ABOVE its word and is
        drawn larger. Both halves matter: same-size-but-stacked is not the
        drawing.
     6f ROW C — the numbers card shares the bottom row with the last tile
        group (beside it, vertically overlapping), not stacked underneath.
     6g ROW A — the candle card holds the DRAWN PROPORTION (a ~360x470
        portrait column), the two columns START level, and the doors sit at
        the FOOT of the librarian column. ⚠ THE DRAWN ROW HEIGHT IS NOT
        PINNED AND MUST NOT BE. The artboard fixes the row at 470px because
        it abridges the librarian panel to a key line and two paragraphs;
        the REAL panel measures ~6,800px in this very harness (a call record
        and a job list live in it). Pinning "the two columns end level"
        would force either a 6,800px-tall candle card or a nested scroll
        region clipping another plan's content. So this arm pins the half of
        the drawn intent that survives contact with the real panel — the
        drawn candle proportion, a level top edge, and the doors at the foot
        — and deliberately leaves the bottom edges free.
        ⭐⭐ AMENDED 2026-08-27 ON HER RULING, and the paragraph above is kept
        rather than rewritten because its reasoning is still exactly right.
        She saw the uneven bottoms in her own room and asked for them to end
        level. She was told this had been decided against, and why — that the
        real panel measures ~6,800px, so binding the two forces either a
        6,800px candle card or a nested scroll region. She chose to match WITH
        A LIMIT: the card may now stretch to meet its neighbour, and tokens.css
        caps it at 2x its own width so the bad case above cannot happen.
        ⛔ So the UPPER bound here moved 485 -> 725 (the 720px cap plus slack)
        and NOTHING ELSE DID. The lower bound is untouched and still catches
        the 150px sliver this card used to be; width is still pinned; tops must
        still be level. ⛔ This arm still does NOT pin "the two columns end
        level" — that is CSS's job now, and pinning it here would re-create the
        6,800px trap the paragraph above describes.
     6h THE OPEN SECTION — the librarian is the drawn LEFT CARD (her ruling
        2, 2026-08-26), wide enough to be a card and to the LEFT of the pane
        content, carrying its nameplate. A 30x66 flame in the top-right
        corner fails every clause.
     6i THE OVERLAY — no scrim behind the sections list, and the list is
        broken into its three groups with the counts right-aligned.
     6j NARROW — the wide page degrades: nothing overflows a 600px window.

   ANTI-VACUITY. Could this pass over nothing? No: every sub-arm asserts its
   subject was FOUND and non-zero before it believes any relation between
   boxes, and a missing element fails by name. Could it pass on the pre-fix
   shape? No — it was run against it, and 6a/6b/6c/6d/6e/6f/6h/6i all
   failed. */
const INK = 'var(--ink)';
const WOOD = 'var(--wood-deep)';

/* Resolve two design tokens to the rgb() strings computed style reports, by
   painting them on a live probe. A colour claim compared against a
   hand-typed rgb triple is a claim about a number an agent chose; this makes
   it a claim about the shipped token. */
const PROBE_TOKENS =
  '(function(){var d=document.createElement("div");' +
  'd.style.position="absolute";d.style.left="-9999px";' +
  'document.body.appendChild(d);' +
  'd.style.color=' + JSON.stringify(INK) + ';' +
  'var ink=getComputedStyle(d).color;' +
  'd.style.color=' + JSON.stringify(WOOD) + ';' +
  'var wood=getComputedStyle(d).color;' +
  'd.remove();return JSON.stringify({ink:ink,wood:wood});})()';

const LANDING_PROBE = '(function(){' +
  'function box(el){if(!el)return null;var r=el.getBoundingClientRect();' +
  ' return {w:r.width,h:r.height,top:r.top,left:r.left,right:r.right,' +
  '  bottom:r.bottom};}' +
  'function frame(id){var el=document.getElementById(id);' +
  ' if(!el)return null;var cs=getComputedStyle(el);' +
  ' return {w:el.getBoundingClientRect().width,' +
  '  borderW:parseFloat(cs.borderTopWidth)||0,borderStyle:cs.borderTopStyle,' +
  '  bg:cs.backgroundColor,display:cs.display};}' +
  'function gridOf(id){var g=document.getElementById(id);' +
  ' if(!g)return null;var cs=getComputedStyle(g);' +
  ' var widths=[];var tiles=g.querySelectorAll(".manage-tile");' +
  ' tiles.forEach(function(t){widths.push(Math.round(' +
  '  t.getBoundingClientRect().width));});' +
  ' var uniq=[];widths.forEach(function(w){' +
  '  if(uniq.indexOf(w)===-1)uniq.push(w);});' +
  ' return {display:cs.display,cols:cs.gridTemplateColumns,' +
  '  n:tiles.length,widths:uniq};}' +
  'var out={};' +
  'out.manage=box(document.getElementById("screen-manage"));' +
  'out.rowAPane=box(document.querySelector(".manage-row-a-pane"));' +
  'out.candleCard=box(document.getElementById("manage-candle-card"));' +
  'out.doorsBox=box(document.getElementById("manage-doors-grid"));' +
  'out.uncountedBox=box(document.getElementById("manage-uncounted-grid"));' +
  'out.numbersBox=box(document.getElementById("manage-numbers-card"));' +
  'out.frames={' +
  ' counted:frame("manage-counted-grid"),' +
  ' uncounted:frame("manage-uncounted-grid"),' +
  ' numbers:frame("manage-numbers-card"),' +
  ' candle:frame("manage-candle-card")};' +
  'var pane=document.querySelector(".manage-row-a-pane");' +
  'if(pane){var pcs=getComputedStyle(pane);' +
  ' out.frames.rowAPane={w:pane.getBoundingClientRect().width,' +
  '  borderW:parseFloat(pcs.borderTopWidth)||0,' +
  '  borderStyle:pcs.borderTopStyle,bg:pcs.backgroundColor,' +
  '  display:pcs.display};}' +
  'out.grids={doors:gridOf("manage-doors-grid"),' +
  ' counted:gridOf("manage-counted-grid"),' +
  ' uncounted:gridOf("manage-uncounted-grid")};' +
  'var door=document.querySelector("#manage-doors-grid .manage-tile");' +
  'out.doorBorder=door?getComputedStyle(door).borderTopColor:null;' +
  'var quiet=document.querySelector("#manage-counted-grid .manage-tile:' +
  'not(.manage-tile-never)");' +
  'out.quietBorder=quiet?getComputedStyle(quiet).borderTopColor:null;' +
  'out.quietShadow=quiet?getComputedStyle(quiet).boxShadow:null;' +
  'var counted=null;' +
  'document.querySelectorAll("#manage-counted-grid .manage-tile")' +
  '.forEach(function(t){if(!counted&&t.querySelector(".manage-tile-count"))' +
  ' counted=t;});' +
  'if(counted){var cn=counted.querySelector(".manage-tile-count");' +
  ' var nm=counted.querySelector(".manage-tile-name");' +
  ' out.counted={count:box(cn),name:box(nm),' +
  '  countSize:cn?parseFloat(getComputedStyle(cn).fontSize):0,' +
  '  nameSize:nm?parseFloat(getComputedStyle(nm).fontSize):0,' +
  '  hasName:!!nm};}' +
  'return JSON.stringify(out);})()';

async function mockupArm() {
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    await sleep(2500);
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);

    /* 6a — the OTHER screens' measure, read from the shipped cascade before
       Manage is ever opened. #screen-reader is activated for the reading and
       put straight back: this is the app's own rule being measured, not a
       guess about it. */
    const other = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var r=document.getElementById("screen-reader");' +
      'if(!r)return JSON.stringify({found:false});' +
      'var had=r.classList.contains("active");' +
      'if(!had)r.classList.add("active");' +
      'var w=r.getBoundingClientRect().width;' +
      'if(!had)r.classList.remove("active");' +
      'return JSON.stringify({found:true,w:w});})()'));
    if (!other.found) {
      fail('[arm6a] #screen-reader was not found — the "only Manage" half ' +
        'of her ruling has nothing to be measured against, so this fails ' +
        'LOUDLY rather than pinning one side of a two-sided ruling.');
    }

    await click(session, '#room-manage-link');
    await sleep(1600);

    const tokens = JSON.parse(await cdp.evaluate(session, PROBE_TOKENS));
    const L = JSON.parse(await cdp.evaluate(session, LANDING_PROBE));

    /* ---- 6a: the wide measure, Manage ONLY ---- */
    if (!L.manage || !(L.manage.w > 0)) {
      fail('[arm6a] #screen-manage measured at zero width — nothing below ' +
        'would be a reading.');
    } else if (!(L.manage.w >= 900)) {
      fail('[arm6a] the Manage screen is ' + Math.round(L.manage.w) +
        'px wide at a 1280px viewport. Her ruling ("Only Manage") makes ' +
        'this the wide page she drew — the 1440px mockup arrangements ' +
        'cannot exist inside the app\'s 42rem column, and that column is ' +
        'the root cause of the page she rejected.');
    } else if (other.found && other.w > 760) {
      // 42rem of content plus the shipped panel's padding and border
      // measures ~710px; anything materially past that is the SHARED rule
      // having been widened, which is the half of her ruling that a global
      // change would break.
      fail('[arm6a] a second hosted screen (#screen-reader) measured ' +
        Math.round(other.w) + 'px — the app was widened GLOBALLY. Her ' +
        'ruling was "Only Manage": every other screen keeps its current ' +
        'width.');
    } else {
      note('arm6a: Manage is the wide page (' + Math.round(L.manage.w) +
        'px) and the other screens keep their measure (' +
        Math.round(other.w) + 'px)');
    }

    /* ---- 6b: the five framed panels ---- */
    const PANELS = [
      ['candle', 'the candle card'],
      ['rowAPane', 'the librarian panel beside the candle'],
      ['counted', 'the counted tiles panel'],
      ['uncounted', 'the last tile group panel'],
      ['numbers', 'the numbers card']
    ];
    let framesBad = 0;
    PANELS.forEach(function (p) {
      const f = L.frames[p[0]];
      if (!f) {
        framesBad += 1;
        fail('[arm6b] ' + p[1] + ' was not found on the landing page — a ' +
          'frame claim over a missing element is not a reading.');
        return;
      }
      if (!(f.borderW >= 2) || f.borderStyle === 'none' ||
          f.bg === 'rgba(0, 0, 0, 0)' || f.bg === 'transparent') {
        framesBad += 1;
        fail('[arm6b] ' + p[1] + ' is not a framed panel (border ' +
          f.borderW + 'px ' + f.borderStyle + ', background ' + f.bg +
          '). The mockup composes five framed panels; without them the ' +
          'page reads as loose buttons on bare paper, which is what she ' +
          'was looking at when she said it was not what she wanted.');
      }
    });
    if (framesBad === 0) { note('arm6b: all five drawn panels are framed'); }

    /* ---- 6c: even grids ---- */
    let gridsBad = 0;
    ['doors', 'counted', 'uncounted'].forEach(function (g) {
      const grid = L.grids[g];
      if (!grid) {
        gridsBad += 1;
        fail('[arm6c] the `' + g + '` grid was not found.');
        return;
      }
      if (!(grid.n > 0)) {
        gridsBad += 1;
        fail('[arm6c] the `' + g + '` grid rendered ZERO tiles — an ' +
          'evenness claim over an empty grid would pass vacuously, so it ' +
          'fails here instead.');
        return;
      }
      if (grid.display !== 'grid') {
        gridsBad += 1;
        fail('[arm6c] the `' + g + '` group lays out as `' + grid.display +
          '`, not a grid. Wrapping flex sizes every tile to its own words ' +
          'and wraps raggedly; the drawing is equal tiles in even columns.');
        return;
      }
      if (grid.widths.length !== 1) {
        gridsBad += 1;
        fail('[arm6c] the `' + g + '` group\'s tiles have ' +
          grid.widths.length + ' different widths (' +
          JSON.stringify(grid.widths) + ') — the drawn grid is equal-width ' +
          'columns.');
      }
    });
    if (gridsBad === 0) {
      note('arm6c: all three groups lay out as even grids (' +
        L.grids.doors.n + '/' + L.grids.counted.n + '/' +
        L.grids.uncounted.n + ' tiles)');
    }

    /* ---- 6d: the two-weight tile system ---- */
    if (!L.doorBorder || !L.quietBorder) {
      fail('[arm6d] a door tile or a quiet counted tile was not found — ' +
        'the two-weight claim has nothing to read.');
    } else if (L.doorBorder !== tokens.ink) {
      fail('[arm6d] the door tiles beside the candle carry ' + L.doorBorder +
        ' where the drawing gives them the ink border (' + tokens.ink +
        '). Only the doors take the heavy weight.');
    } else if (L.quietBorder !== tokens.wood) {
      fail('[arm6d] a quiet counted tile carries ' + L.quietBorder +
        ' where the drawing gives it the thin wood border (' + tokens.wood +
        '). Shipped, EVERY tile wore the heavy ink treatment — so the ' +
        'doors stopped reading as different and no quiet layer survived.');
    } else {
      note('arm6d: two weights — doors in ink, quiet tiles in wood');
    }

    /* ---- 6e: the counted tiles lead with their number ---- */
    if (!L.counted || !L.counted.count || !L.counted.name) {
      fail('[arm6e] no counted tile with both a number and a named label ' +
        'was found — the number-led claim has nothing to read (the tile ' +
        'renders its label as a bare text node if this is the pre-fix ' +
        'shape).');
    } else if (!(L.counted.count.bottom <= L.counted.name.top + 1)) {
      fail('[arm6e] the number does not sit ABOVE its word (number bottom ' +
        Math.round(L.counted.count.bottom) + ', word top ' +
        Math.round(L.counted.name.top) + ') — shipped it trailed the ' +
        'label inline; the drawing leads with a large numeral on its own ' +
        'line.');
    } else if (!(L.counted.countSize > L.counted.nameSize)) {
      fail('[arm6e] the number is drawn at ' + L.counted.countSize +
        'px and its word at ' + L.counted.nameSize + 'px — the drawing ' +
        'makes the numeral the big thing and the word the small one.');
    } else {
      note('arm6e: counted tiles lead with the number (' +
        L.counted.countSize + 'px over ' + L.counted.nameSize + 'px)');
    }

    /* ---- 6f: the numbers card shares the bottom row ---- */
    if (!L.numbersBox || !L.uncountedBox ||
        !(L.numbersBox.w > 0) || !(L.uncountedBox.w > 0)) {
      fail('[arm6f] the numbers card or the last tile group measured at ' +
        'zero width — no side-by-side claim could be a reading.');
    } else if (!(L.numbersBox.left >= L.uncountedBox.right - 2)) {
      fail('[arm6f] the numbers card is not BESIDE the last tile group ' +
        '(card left ' + Math.round(L.numbersBox.left) + ', group right ' +
        Math.round(L.uncountedBox.right) + ') — shipped it sat full-width ' +
        'underneath everything.');
    } else if (!(L.numbersBox.top < L.uncountedBox.bottom - 10)) {
      fail('[arm6f] the numbers card does not share the row vertically ' +
        '(card top ' + Math.round(L.numbersBox.top) + ', group bottom ' +
        Math.round(L.uncountedBox.bottom) + ').');
    } else {
      note('arm6f: the numbers card shares the bottom row with the last ' +
        'tile group');
    }

    /* ---- 6g: Row A — the drawn proportion, level tops, doors at the foot */
    if (!L.candleCard || !L.rowAPane || !L.doorsBox ||
        !(L.candleCard.h > 0) || !(L.rowAPane.h > 0)) {
      fail('[arm6g] Row A\'s two columns could not both be measured.');
    } else if (!(L.candleCard.w >= 345 && L.candleCard.w <= 375) ||
               !(L.candleCard.h >= 455 && L.candleCard.h <= 725)) {
      fail('[arm6g] the candle card measures ' + Math.round(L.candleCard.w) +
        'x' + Math.round(L.candleCard.h) + ' where the drawing gives it a ' +
        '360x470 portrait column (a framed picture well, a nameplate ' +
        'plaque, the state words and her sentence). Shipped it was a ' +
        '150px sliver with a bare flame on the card background.');
    } else if (Math.abs(L.candleCard.top - L.rowAPane.top) > 3) {
      fail('[arm6g] Row A\'s two columns do not START level (candle top ' +
        Math.round(L.candleCard.top) + ', pane top ' +
        Math.round(L.rowAPane.top) + ').');
    } else if (!(L.doorsBox.bottom >= L.rowAPane.bottom - 40)) {
      fail('[arm6g] the door tiles do not sit at the FOOT of the ' +
        'librarian column (doors bottom ' + Math.round(L.doorsBox.bottom) +
        ', column bottom ' + Math.round(L.rowAPane.bottom) + ') — the ' +
        'drawing pushes them down with a spacer so the two columns end ' +
        'level.');
    } else {
      note('arm6g: the candle card holds the drawn proportion (' +
        Math.round(L.candleCard.w) + 'x' + Math.round(L.candleCard.h) +
        '), tops are level, doors at the foot of the librarian column');
    }

    /* ---- 6i: the overlay — no scrim, grouped list, counts right ---- */
    await click(session, '#manage-sections-toggle');
    await sleep(800);
    const ov = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var o=document.getElementById("manage-sections-overlay");' +
      'var p=document.getElementById("manage-sections-panel");' +
      'var out={bg:o?getComputedStyle(o).backgroundColor:null,' +
      ' panelW:p?p.getBoundingClientRect().width:0,' +
      ' seps:document.querySelectorAll("#manage-rail .manage-rail-sep")' +
      '  .length,rows:0,countGap:null};' +
      'var row=null;' +
      'document.querySelectorAll("#manage-rail .manage-rail-item")' +
      '.forEach(function(r){out.rows+=1;' +
      ' if(!row&&r.querySelector(".manage-rail-count"))row=r;});' +
      'if(row){var rr=row.getBoundingClientRect();' +
      ' var c=row.querySelector(".manage-rail-count")' +
      '  .getBoundingClientRect();' +
      ' out.countGap=rr.right-c.right;out.rowW=rr.width;out.countW=c.width;}' +
      'return JSON.stringify(out);})()'));
    if (!(ov.panelW > 0) || !(ov.rows > 0)) {
      fail('[arm6i] the ☰ overlay never reached the screen (panel ' +
        ov.panelW + 'px, ' + ov.rows + ' rows) — every claim below would ' +
        'be a claim about nothing.');
    } else {
      if (ov.bg !== 'rgba(0, 0, 0, 0)') {
        fail('[arm6i] the sections overlay still darkens the window ' +
          '(background ' + ov.bg + '). In the drawing the list simply ' +
          'appears over the page and the page stays fully visible behind ' +
          'it — there is no scrim anywhere in the artboard.');
      }
      if (ov.seps !== 2) {
        fail('[arm6i] the sections list has ' + ov.seps + ' group ' +
          'separator(s), expected 2. The drawing breaks the list into its ' +
          'three groups with two faint dashed rules; shipped it is one ' +
          'flat run.');
      }
      if (ov.countGap === null) {
        fail('[arm6i] no rail row with a count was found — the ' +
          'right-alignment claim has nothing to read.');
      } else if (!(ov.countGap <= 12)) {
        fail('[arm6i] the rail counts are not right-aligned (' +
          Math.round(ov.countGap) + 'px of row left over to the right of ' +
          'the count) — the drawing pushes them to the right edge.');
      }
      note('arm6i: overlay measured (bg ' + ov.bg + ', ' + ov.seps +
        ' separators, count gap ' + Math.round(ov.countGap) + 'px)');
    }
    for (const type of ['rawKeyDown', 'keyUp']) {
      await cdp.send(session, 'Input.dispatchKeyEvent', {
        type: type, key: 'Escape', code: 'Escape',
        windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
      });
    }
    await sleep(500);

    /* ---- 6h: the open section shows the drawn LEFT card ---- */
    await click(session, '#manage-landing .manage-tile[data-pane="pile"]');
    await sleep(1200);
    const pane = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'function box(el){if(!el)return null;' +
      ' var r=el.getBoundingClientRect();' +
      ' return {w:r.width,h:r.height,top:r.top,left:r.left,right:r.right};}' +
      'var small=document.getElementById("manage-candle-small");' +
      'return JSON.stringify({' +
      ' card:box(small),' +
      ' plate:box(small?small.querySelector(".manage-candle-name"):null),' +
      ' main:box(document.getElementById("manage-layout"))});})()'));
    if (!pane.card || !(pane.card.w > 0)) {
      fail('[arm6h] the librarian has no surface at all in the open ' +
        'section (#manage-candle-small measured ' +
        (pane.card ? pane.card.w : 'absent') + ') — her ruling 2 keeps ' +
        'her on this page.');
    } else if (!(pane.card.w >= 200)) {
      fail('[arm6h] the open-section librarian is ' +
        Math.round(pane.card.w) + 'x' + Math.round(pane.card.h) +
        ' — a bare corner flame, not the card. ⭐ HER RULING 2 ' +
        '(2026-08-26, "The small card, as drawn"): shown both the tiny ' +
        'corner candle and the drawn left-hand card, she chose the CARD. ' +
        'That supersedes the earlier "shrinks into the corner" wording.');
    } else if (!pane.plate || !(pane.plate.w > 0)) {
      fail('[arm6h] the open-section card has no nameplate at non-zero ' +
        'size — the drawn card is a framed portrait, a nameplate and a ' +
        'caption line.');
    } else if (!pane.main || !(pane.main.left >= pane.card.right - 2)) {
      fail('[arm6h] the section content is not to the RIGHT of the ' +
        'librarian card (card right ' + Math.round(pane.card.right) +
        ', content left ' + (pane.main ? Math.round(pane.main.left) :
          'absent') + ') — the drawing seats her in a left column beside ' +
        'the open section.');
    } else {
      note('arm6h: the open section shows the drawn left card (' +
        Math.round(pane.card.w) + 'x' + Math.round(pane.card.h) +
        '), content beside it');
    }
    await click(session, '#manage-pane-back button');
    await sleep(1000);

    /* ---- 6j: the wide page degrades on a small window ---- */
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(900);
    const narrow = JSON.parse(await cdp.evaluate(session, '(function(){' +
      'var out={vw:window.innerWidth,over:[],manageW:0,tiles:0};' +
      'var m=document.getElementById("screen-manage");' +
      'if(m)out.manageW=m.getBoundingClientRect().width;' +
      '["manage-doors-grid","manage-counted-grid","manage-uncounted-grid",' +
      ' "manage-numbers-card","manage-candle-card"].forEach(function(id){' +
      ' var el=document.getElementById(id);if(!el)return;' +
      ' var r=el.getBoundingClientRect();' +
      ' if(r.right>window.innerWidth+1||r.width<=0)' +
      '  out.over.push(id+"@"+Math.round(r.right)+"/"+Math.round(r.width));' +
      '});' +
      'document.querySelectorAll("#manage-landing .manage-tile")' +
      '.forEach(function(t){var r=t.getBoundingClientRect();' +
      ' if(r.width>0&&r.height>0)out.tiles+=1;' +
      ' if(r.right>window.innerWidth+1)out.over.push("tile:"+' +
      ' t.getAttribute("data-pane"));});' +
      'return JSON.stringify(out);})()'));
    if (!(narrow.tiles > 0)) {
      fail('[arm6j] no landing tile survived the narrow viewport — the ' +
        'overflow claim below would pass over an empty page.');
    } else if (narrow.over.length) {
      fail('[arm6j] the wide Manage page does not degrade on a ' +
        narrow.vw + 'px window — these overflow it: ' +
        narrow.over.join(', ') + '. A wide measure that cannot fold is a ' +
        'page she cannot use on a small window.');
    } else if (!(narrow.manageW <= narrow.vw)) {
      fail('[arm6j] the Manage panel itself is wider than the ' +
        narrow.vw + 'px window (' + Math.round(narrow.manageW) + 'px).');
    } else {
      note('arm6j: the wide page folds on a ' + narrow.vw + 'px window (' +
        narrow.tiles + ' tiles, nothing overflows)');
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* gone */ } }
    await app.stop();
  }
}

(async function main() {
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  staticArm(appSrc);
  copyArm(appSrc, indexSrc);
  const keys = liftPaneKeys(appSrc);
  await liveArm(keys);
  await mockupArm();

  notes.forEach(function (n) { console.log('  ok  ' + n); });
  if (violations.length) {
    console.log('');
    violations.forEach(function (v) { console.log('  FAIL  ' + v); });
    console.log('');
    console.log('test_manage_landing FAILED — ' + violations.length +
      ' violation(s), ' + notes.length + ' passed');
    process.exitCode = 1;
  } else {
    console.log('test_manage_landing OK — ' + notes.length + '/' +
      notes.length + ' checks (F-9 reachability + count discipline, arm 2 ' +
      'in real Chrome)');
  }
})().catch(function (e) {
  console.error('test_manage_landing COULD NOT BE DRIVEN: ' +
    (e && e.message ? e.message : e));
  process.exitCode = 1;
});
