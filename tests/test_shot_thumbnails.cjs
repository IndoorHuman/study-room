'use strict';
/* =========================================================================
   tests/test_shot_thumbnails.cjs — F-04: the screenshot's picture, as a
   THUMBNAIL YOU TAP. Owner ruling, 26.94 UAT, 2026-08-14.

   HER RULING, VERBATIM: "a thumbnail you tap to open the original", so the
   note keeps reading as text and the picture is there when wanted —
   explicitly NOT the image embedded in the note body.

   ⚠ WHAT WAS ACTUALLY WRONG IS NARROWER THAN THE FINDING'S HEADLINE, AND IT
   DECIDES WHAT THIS SUITE MEASURES. Every one of her 3,067 notes keeps its
   picture as an attachment, and the note body references none of them, so
   `StudyCore.unreferencedAttachments` returns them all and the three shipped
   note sinks ALREADY trail them at full size under the text. The UAT judged a
   rendering copied out of the app that called the saved-body wrapper and the
   attachment REWRITE but never the trail, and so emitted zero images. The
   shipped defect is therefore PLACEMENT AND SIZE, not absence — which is why
   the first claim below asserts the picture COUNT IS UNCHANGED. A "fix" that
   showed her thumbnails while losing or duplicating a photograph would be a
   worse bug than the one it replaced.

   ⚠ THE TAP IS NOT NEW AND THIS SUITE PROVES IT RATHER THAN ASSUMING IT.
   `zoomableImage` + its capture-phase listener already open ANY <img> inside
   the spread, the legacy reader or the blessing card into the fitted
   full-screen zoom, on her own 2026-08-11 ruling. Claim 6 runs the SHIPPED
   `zoomableImage` against a folded thumbnail in each of those three surfaces:
   if it stops accepting them, "tap to open the original" is silently gone
   while every other claim here still passes.

   ⚠ A REAL DOM, NOT A STUB. The fold is nothing but DOM moves, so a fake
   document would be this harness agreeing with itself. The page is built by
   the shipped `tests/lib/render-harness.cjs` (real tokens.css) and driven by
   `tests/lib/cdp.cjs` over the system Chrome — the same runner
   test_live_render.cjs uses. A missing runner FAILS; it never degrades to a
   silent pass.

   ⚠ THE FUNCTIONS ARE SLICED BY NAME OUT OF THE SHIPPED app.js and evaluated
   in that page — never retyped here.

   Prints its counts and exits 0 on success; exits 1 on the first throw.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const cdp = require('./lib/cdp.cjs');
const harness = require('./lib/render-harness.cjs');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/* ---- lifting the shipped bytes ------------------------------------------ */

function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1, name + ' must be defined in app.js');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

/* `var NAME = <expr>;` lifted whole — the terminating semicolon is found at
   bracket depth 0 and outside quotes, so a ';' inside one of the style
   strings cannot end the lift early. */
function extractVar(src, name) {
  const sig = 'var ' + name + ' =';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1, name + ' must be defined in app.js');
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; } else if (ch === quote) { quote = null; }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; }
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; }
    else if (ch === ';' && depth === 0) { return src.slice(start, i + 1); }
  }
  throw new Error(name + ' had no terminating semicolon at depth 0');
}

/* Everything the page needs, lifted from app.js. `$` is stubbed only because
   ZOOM_SURFACES is built from the two id maps and zoomableImage never calls
   it — nothing measured here goes through the stub. */
function pageProgram(src) {
  return [
    extractVar(src, 'LEGACY_READER_IDS'),
    extractVar(src, 'SPREAD_IDS'),
    extractVar(src, 'ZOOM_SURFACES'),
    extractVar(src, 'SHOT_THUMB_STYLE'),
    extractFn(src, 'isScreenshotNote'),
    extractFn(src, 'foldShotsIntoStrip'),
    extractFn(src, 'zoomableImage')
  ].join('\n');
}

/* ---- the page ------------------------------------------------------------ */

// A 1x1 transparent PNG, so the pictures genuinely load and the measured
// geometry is real rather than a broken-image placeholder's.
const PIX_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk' +
  'YAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/* ⚠ WRITTEN AS REAL FILES BESIDE THE HARNESS PAGE, NOT INLINED AS data: URIs.
   The row's ORDER is matched by attachment BASENAME, and a data: URI has no
   basename — inlined, every picture would look the same to the matcher and the
   order claim could not fail. These load from the page's own directory, so the
   geometry stays real too. */
const PIC_NAMES = ['p0.png', 'p1.png', 'p2.png'];

function writePictures(dir) {
  PIC_NAMES.forEach(function (n) {
    fs.writeFileSync(path.join(dir, n), Buffer.from(PIX_B64, 'base64'));
  });
}

/* The trail EXACTLY as the three shipped sinks emit it: the att-sep rule,
   then one att-pic img per attachment, after the body. Built here as the
   INPUT to the fold — what the sinks produce is pinned separately, by the
   source-level wiring claim, so neither half can drift alone. */
function trailHtml(n) {
  let out = '<p>her words, read off the picture</p>';
  for (let i = 0; i < n; i++) {
    out += (i === 0
      ? '<hr class="att-sep" style="border:none;border-top:1px solid ' +
        'var(--paper-shadow);margin:1.5em 0">'
      : '') +
      '<img class="att-pic" data-probe="p' + i + '" src="' + PIC_NAMES[i] +
      '" alt="" style="max-width:100%;height:auto;display:block;' +
      'margin:0 0 1em">';
  }
  return out;
}

function bodyHtml() {
  return '<div id="reader-content">' + trailHtml(3) + '</div>' +
    '<div id="spread-content">' + trailHtml(2) + '</div>' +
    '<div id="blessing-card">' + trailHtml(1) + '</div>' +
    '<div id="clipping-box">' + trailHtml(2) + '</div>' +
    '<div id="outside-box">' + trailHtml(1) + '</div>';
}

// ⚠ THE ORDER HERE IS DELIBERATELY NOT ALPHABETICAL. p2 first, then p0, then
// p1 — so a row that came out p0,p1,p2 would be filename order (the defect the
// owner found on her own note) and a row that came out p2,p0,p1 is the note's
// own order (what the note pass wrote, and what the body's sections follow).
const SHOT = '{id:"aa", type:"text", tags:["screenshots"], ' +
  'attachments:["attachments/aa/p2.png","attachments/aa/p0.png",' +
  '"attachments/aa/p1.png"]}';
const CLIP = '{id:"bb", type:"text", tags:["clippings"], ' +
  'attachments:["attachments/bb/1.jpeg"]}';

/* ---- the measurement, taken in one page-side pass ------------------------ */
//
// One expression, one round trip: every claim reads the SAME rendered page,
// so no two claims can be measuring different states of it.

function measureExpr(src) {
  return '(function () {\n' + pageProgram(src) + '\n' +
    'var out = {};\n' +
    'function box(id) { return document.getElementById(id); }\n' +
    'function shot(id) { return ' + SHOT + '; }\n' +
    'function snap(id) {\n' +
    '  var b = box(id);\n' +
    '  var strip = b.querySelector(".shot-strip");\n' +
    '  var all = b.querySelectorAll("img");\n' +
    '  var inStrip = strip ? strip.querySelectorAll("img") : [];\n' +
    '  return {\n' +
    '    pictures: all.length,\n' +
    '    inStrip: inStrip.length,\n' +
    '    strips: b.querySelectorAll(".shot-strip").length,\n' +
    '    stripIsFirst: !!(strip && b.firstChild === strip),\n' +
    '    seps: b.querySelectorAll("hr.att-sep").length,\n' +
    '    probes: Array.prototype.map.call(all, function (i) {\n' +
    '      return i.getAttribute("data-probe"); }).join(","),\n' +
    // The COMPUTED height, not the bounding rect: the rect adds the 1px hair
    // border on each side, so a rect assertion would pin a number that is
    // really "88 plus whatever the border happens to be" and would go red on
    // a purely cosmetic change. `rects` is kept beside it only to prove the
    // fold shrank something, which is a comparison and needs no constant.
    '    heights: Array.prototype.map.call(all, function (i) {\n' +
    '      return getComputedStyle(i).height; }).join(","),\n' +
    '    widths: Array.prototype.map.call(all, function (i) {\n' +
    '      return getComputedStyle(i).width; }).join(","),\n' +
    '    fits: Array.prototype.map.call(all, function (i) {\n' +
    '      return getComputedStyle(i).objectFit; }).join(","),\n' +
    // ⚠ THE COMPUTED VALUE, WHICH IS NOT THE KEYWORD. A browser normalises
    // `object-position: top` to "50% 0%" — the vertical 0% IS top-anchored.
    // Asserting the word "top" would go red against correct code.
    '    anchors: Array.prototype.map.call(all, function (i) {\n' +
    '      return getComputedStyle(i).objectPosition; }).join("|"),\n' +
    '    rects: Array.prototype.map.call(all, function (i) {\n' +
    '      return Math.round(i.getBoundingClientRect().height); }).join(",")\n' +
    '  };\n' +
    '}\n' +
    // BEFORE, on the reader: the shipped full-size trail, measured so the
    // "it shrank" claim is a comparison and not a bare constant.
    'out.readerBefore = snap("reader-content");\n' +
    'foldShotsIntoStrip(' + SHOT + ', box("reader-content"));\n' +
    'foldShotsIntoStrip(' + SHOT + ', box("spread-content"));\n' +
    'foldShotsIntoStrip(' + SHOT + ', box("blessing-card"));\n' +
    // a note that is NOT a screenshot note: must come through untouched
    'foldShotsIntoStrip(' + CLIP + ', box("clipping-box"));\n' +
    'out.reader = snap("reader-content");\n' +
    'out.spread = snap("spread-content");\n' +
    'out.blessing = snap("blessing-card");\n' +
    'out.clipping = snap("clipping-box");\n' +
    // folding twice is what a "show as saved" toggle does
    'foldShotsIntoStrip(' + SHOT + ', box("reader-content"));\n' +
    'out.readerTwice = snap("reader-content");\n' +
    // the tap: the SHIPPED zoom predicate over a folded thumbnail
    'out.zoom = {\n' +
    '  reader: !!zoomableImage(box("reader-content")' +
    '    .querySelector("img.shot-thumb")),\n' +
    '  spread: !!zoomableImage(box("spread-content")' +
    '    .querySelector("img.shot-thumb")),\n' +
    '  blessing: !!zoomableImage(box("blessing-card")' +
    '    .querySelector("img.shot-thumb")),\n' +
    '  outside: !!zoomableImage(box("outside-box").querySelector("img"))\n' +
    '};\n' +
    'out.shotOfClip = isScreenshotNote(' + CLIP + ');\n' +
    'out.shotOfShot = isScreenshotNote(' + SHOT + ');\n' +
    'return out;\n' +
    '}())';
}

/* ---- the claims ---------------------------------------------------------- */
//
// Each takes the one measurement and returns plain-words violations.

function claimFoldsAndKeepsEveryPicture(m) {
  const out = [];
  const r = m.reader;
  if (r.pictures !== 3 || r.inStrip !== 3) {
    out.push('[F-04] a screenshot note must show EVERY picture it kept and ' +
      'no more — the note had 3 and the reader ended with ' + r.pictures +
      ' of which ' + r.inStrip + ' are in the row. Placement was the defect; ' +
      'losing or duplicating a photograph would be a worse one.');
  }
  if (r.probes !== 'p2,p0,p1') {
    out.push('[F-04] the row must follow the NOTE\'S own order — the one the ' +
      'note pass wrote, and the one the body\'s sections are in — not the ' +
      'filename order the shipped attachment sort produces. Expected ' +
      'p2,p0,p1; got ' + r.probes + '. On the owner\'s own three-shot note ' +
      'filename order came out exactly backwards, with the first section\'s ' +
      'picture last.');
  }
  if (!r.stripIsFirst) {
    out.push('[F-04] the row must sit ABOVE the machine-read text — the eye ' +
      'needs somewhere to go before the wall of text, and that is most of ' +
      'what this finding was for.');
  }
  if (r.seps !== 0) {
    out.push('[F-04] the trail\'s separator rule must go with the trail — a ' +
      'rule belongs before a run of full-size pictures, not above a row of ' +
      'thumbnails; ' + r.seps + ' left behind.');
  }
  return out;
}

function claimTheSameNodesMoved(m) {
  const out = [];
  // ⚠ THE SET, NOT THE SEQUENCE. The fold deliberately REORDERS the row into
  // the note's own sequence, so a positional comparison would go red against
  // correct code. What identity means here is that the same pictures come out
  // as went in — none cloned, none lost. A clone leaves the original in place
  // too, so the multiset grows and this catches it.
  const sortProbes = function (csv) { return csv.split(',').sort().join(','); };
  if (sortProbes(m.readerBefore.probes) !== sortProbes(m.reader.probes)) {
    out.push('[F-04] the folded pictures must be the SAME nodes the shipped ' +
      'sink already made (probes went ' + m.readerBefore.probes + ' -> ' +
      m.reader.probes + '). Cloning them would mean a second place a ' +
      'picture URL is assembled, and the two could then disagree.');
  }
  return out;
}

// Her 2026-08-14 size choice, pinned BY VALUE: a FIXED WINDOW, 170 x 200,
// anchored to the top. Both dimensions matter and the first shipped shape got
// it wrong by fixing only the height — a scrolling screenshot then came out a
// median 41 px wide (76.7% under 50, narrowest 5). The width assertion is what
// makes a return to that shape a failure rather than a silent regression.
function claimThumbnailIsHerWindow(m) {
  const out = [];
  const before = m.readerBefore.rects.split(',').map(Number);
  const after = m.reader.rects.split(',').map(Number);
  if (m.reader.heights.split(',').some(function (h) { return h !== '200px'; })) {
    out.push('[F-04] every thumbnail must be her chosen height — got ' +
      m.reader.heights);
  }
  if (m.reader.widths.split(',').some(function (w) { return w !== '170px'; })) {
    out.push('[F-04] every thumbnail must be her chosen WIDTH too — a free ' +
      'width is what turned a scrolling screenshot into a sliver she could ' +
      'not recognise; got ' + m.reader.widths);
  }
  if (m.reader.fits.split(',').some(function (f) { return f !== 'cover'; }) ||
      m.reader.anchors.split('|').some(function (a) { return a !== '50% 0%'; })) {
    out.push('[F-04] the window must show the TOP of the screenshot, where ' +
      'the app and the title are — got fit=' + m.reader.fits + ' anchor=' +
      m.reader.anchors);
  }
  if (!before.some(function (h, i) { return h > after[i]; })) {
    out.push('[F-04] the fold did not actually shrink anything (' +
      m.readerBefore.rects + ' -> ' + m.reader.rects + '), so the note ' +
      'still opens behind a full-size picture');
  }
  return out;
}

function claimOtherNotesAreUntouched(m) {
  const out = [];
  const c = m.clipping;
  if (c.strips !== 0 || c.seps !== 1 || c.pictures !== 2) {
    out.push('[F-04] a clipped image-post\'s pictures ARE its content (the ' +
      '22-uat contract) and must still arrive full size after the body — ' +
      'strips=' + c.strips + ' separators=' + c.seps + ' pictures=' +
      c.pictures);
  }
  if (m.shotOfClip !== false || m.shotOfShot !== true) {
    out.push('[F-04] the fold must apply to the note pass\'s own population ' +
      'and nothing else — isScreenshotNote said ' + m.shotOfShot +
      ' for a screenshot note and ' + m.shotOfClip + ' for a clipping');
  }
  return out;
}

function claimFoldingTwiceIsSafe(m) {
  const out = [];
  const t = m.readerTwice;
  if (t.strips !== 1 || t.pictures !== 3 || t.inStrip !== 3) {
    out.push('[F-04] the "show as saved" control re-runs the whole ' +
      'composition, so folding twice must leave one row and the same three ' +
      'pictures — strips=' + t.strips + ' pictures=' + t.pictures +
      ' inStrip=' + t.inStrip);
  }
  return out;
}

function claimTapOpensTheOriginal(m) {
  const out = [];
  if (!m.zoom.reader || !m.zoom.spread || !m.zoom.blessing) {
    out.push('[F-04] a thumbnail must be TAPPABLE on all three note ' +
      'surfaces — the shipped zoom predicate accepted reader=' +
      m.zoom.reader + ' spread=' + m.zoom.spread + ' blessing=' +
      m.zoom.blessing + '. Her ruling was "a thumbnail you tap to open the ' +
      'original"; a thumbnail that does not open is the finding made worse.');
  }
  if (m.zoom.outside) {
    out.push('[F-04] the zoom predicate accepted a picture outside every ' +
      'note surface, so this claim would pass with the surfaces wrong');
  }
  return out;
}

/* The wiring, read off the source: the fold is only reachable if all three
   sinks tag their pictures and then call it. A behaviour suite alone would
   stay green with the call site deleted. */
function claimEverySinkIsWired(src) {
  const out = [];
  const tagged = (src.match(/<img class="att-pic" src="/g) || []).length;
  if (tagged !== 3) {
    out.push('[F-04] all three note sinks must tag their trailed pictures ' +
      'so the fold can find them — found ' + tagged + ' of 3');
  }
  // CALL SITES ONLY — `foldShotsIntoStrip(item, ` without the terminator
  // also matches the function's own definition, and a claim that counted 4
  // would have to be loosened to 3-or-more, which is how a wiring gate stops
  // noticing a deleted call site.
  const folds = (src.match(/foldShotsIntoStrip\(item, (?:box|card)\);/g) ||
    []).length;
  if (folds !== 3) {
    out.push('[F-04] all three note sinks must call the fold — found ' +
      folds + ' of 3. A sink that skips it opens her notes behind a ' +
      'full-size picture again.');
  }
  if (src.indexOf('<hr class="att-sep"') === -1) {
    out.push('[F-04] the shipped separator must carry its hook, or the fold ' +
      'cannot take the rule away with the trail');
  }
  return out;
}

const DOM_CLAIMS = [
  ['folds every kept picture into a row above the text',
    claimFoldsAndKeepsEveryPicture],
  ['moves the shipped nodes rather than rebuilding them', claimTheSameNodesMoved],
  ['the thumbnail is her fixed window', claimThumbnailIsHerWindow],
  ['every other kind of note is untouched', claimOtherNotesAreUntouched],
  ['folding twice is safe', claimFoldingTwiceIsSafe],
  ['the tap opens the original on all three surfaces', claimTapOpensTheOriginal]
];

/* ---- the drill ----------------------------------------------------------- */
//
// Source mutations, each of which must be caught by the named claim. A
// substitution that matches nothing is a FAILURE, not a pass: that would be a
// drill measuring the repo instead of the gate.

const DOM_MUTATIONS = [
  ['NO SCOPE: every note with attachments gets folded',
    function (s) {
      return s.replace('    if (!box || !isScreenshotNote(item)) { return; }',
        '    if (!box) { return; }');
    },
    claimOtherNotesAreUntouched],

  ['THE RULE SURVIVES: the trail separator is left above the row',
    function (s) {
      return s.replace(
        "    Array.prototype.forEach.call(box.querySelectorAll('hr.att-sep'),\n" +
        '      function (hr) {\n' +
        '        if (hr.parentNode) { hr.parentNode.removeChild(hr); }\n' +
        '      });\n', '');
    },
    claimFoldsAndKeepsEveryPicture],

  ['CLONED, NOT MOVED: a second place a picture is made',
    function (s) {
      return s.replace('      strip.appendChild(r.img);',
        '      strip.appendChild(r.img.cloneNode(true));');
    },
    claimTheSameNodesMoved],

  ['FILENAME ORDER RETURNS: the note\'s own sequence is ignored',
    function (s) {
      return s.replace(
        '    ranked.sort(function (a, b) { return a.k - b.k; });\n', '');
    },
    claimFoldsAndKeepsEveryPicture],

  ['THE ROW LANDS UNDER THE TEXT INSTEAD OF ABOVE IT',
    function (s) {
      return s.replace(
        '    if (box.firstChild !== strip) ' +
        '{ box.insertBefore(strip, box.firstChild); }',
        '    box.appendChild(strip);');
    },
    claimFoldsAndKeepsEveryPicture],

  ['NOT ACTUALLY A THUMBNAIL: the fixed height goes',
    function (s) {
      return s.replace("  var SHOT_THUMB_STYLE = 'height:200px;",
        "  var SHOT_THUMB_STYLE = 'height:auto;");
    },
    claimThumbnailIsHerWindow],

  ['BACK TO SLIVERS: the width is freed again (the 26.94-12 shape)',
    function (s) {
      return s.replace("'height:200px;width:170px;object-fit:cover;' +",
        "'height:200px;width:auto;object-fit:cover;' +");
    },
    claimThumbnailIsHerWindow],

  ['THE WINDOW DRIFTS OFF THE TOP OF THE SCREENSHOT',
    function (s) {
      return s.replace("    'object-position:top;display:block;cursor:zoom-in;' +",
        "    'object-position:center;display:block;cursor:zoom-in;' +");
    },
    claimThumbnailIsHerWindow]
];

const WIRING_MUTATIONS = [
  ['ONE SINK STOPS TAGGING ITS PICTURES',
    function (s) {
      return s.replace('<img class="att-pic" src="', '<img src="');
    },
    claimEverySinkIsWired],

  ['THE READER STOPS CALLING THE FOLD',
    function (s) {
      return s.replace('          foldShotsIntoStrip(item, box);\n', '');
    },
    claimEverySinkIsWired]
];

/* ------------------------------------------------------------------------- */

(async function main() {
  const failures = [];
  let controlsGreen = 0;
  let caught = 0;
  let ran = 0;

  // ---- the wiring half: source only, no browser needed ----
  DOM_CLAIMS.length;                       // (kept honest by the counts below)
  ran += 1;
  const wiringSaid = claimEverySinkIsWired(appSrc);
  if (wiringSaid.length === 0) { controlsGreen += 1; } else {
    failures.push('CONTROL RED: every sink is wired :: ' +
      wiringSaid.join(' ;; '));
  }
  WIRING_MUTATIONS.forEach(function (m) {
    ran += 1;
    const mutated = m[1](appSrc);
    if (mutated === appSrc) {
      failures.push('MUTATION NEVER PLANTED: ' + m[0] +
        ' — a substitution that matched nothing scores as a pass, which is ' +
        'a drill measuring the repo instead of the gate');
      return;
    }
    if (m[2](mutated).length > 0) { caught += 1; } else {
      failures.push('MUTATION MISSED: ' + m[0]);
    }
  });

  // ---- the DOM half: one page per source variant ----
  async function measure(src) {
    const page = harness.buildHarness({ bodyHtml: bodyHtml(), k: 1 });
    writePictures(page.dir);
    let session = null;
    try {
      session = await cdp.launch({ url: page.url });
      // The page target already exists when Chrome is handed the URL, so a
      // measurement taken too early would read an empty document rather than
      // fail. Polled to `complete` AND to this page's own token — the same
      // wait test_live_render.cjs takes, for the same reason.
      const deadline = Date.now() + 20000;
      let ready = false;
      while (!ready && Date.now() < deadline) {
        try {
          ready = await cdp.evaluate(session,
            "document.readyState === 'complete' && " +
            "document.documentElement.getAttribute('data-harness') === " +
            JSON.stringify(page.token));
        } catch (e) { ready = false; }
        if (!ready) {
          await new Promise(function (r) { setTimeout(r, 20); });
        }
      }
      assert.ok(ready, 'the harness page never finished loading — a live ' +
        'gate whose runner cannot start FAILS, it does not skip');
      return await cdp.evaluate(session, measureExpr(src));
    } finally {
      await cdp.close(session);
      try { fs.rmSync(page.dir, { recursive: true, force: true }); }
      catch (e) { /* best effort */ }
    }
  }

  const shipped = await measure(appSrc);
  for (const c of DOM_CLAIMS) {
    ran += 1;
    const said = c[1](shipped);
    if (said.length === 0) { controlsGreen += 1; } else {
      failures.push('CONTROL RED: ' + c[0] + ' :: ' + said.join(' ;; '));
    }
  }

  for (const m of DOM_MUTATIONS) {
    ran += 1;
    const mutated = m[1](appSrc);
    if (mutated === appSrc) {
      failures.push('MUTATION NEVER PLANTED: ' + m[0] +
        ' — a substitution that matched nothing scores as a pass, which is ' +
        'a drill measuring the repo instead of the gate');
      continue;
    }
    let said;
    try { said = m[2](await measure(mutated)); }
    catch (e) { said = ['threw: ' + (e && e.message ? e.message : e)]; }
    if (said.length > 0) { caught += 1; } else {
      failures.push('MUTATION MISSED: ' + m[0]);
    }
  }

  console.log('CASES ' + ran);
  console.log('DRILL ' + caught + '/' +
    (DOM_MUTATIONS.length + WIRING_MUTATIONS.length) + ' mutations caught, ' +
    controlsGreen + '/' + (DOM_CLAIMS.length + 1) + ' controls green');

  assert.strictEqual(failures.length, 0,
    'F-04 failures: ' + failures.join(' ;; '));
  assert.strictEqual(DOM_CLAIMS.length, 6,
    'six DOM claims — a removed one must be a conscious edit');
  assert.strictEqual(DOM_MUTATIONS.length + WIRING_MUTATIONS.length, 10,
    'ten mutations — a removed one must be a conscious edit');
  assert.strictEqual(controlsGreen, 7, 'all seven controls must be green');
  assert.strictEqual(caught, 10, 'all ten mutations must be caught');
  assert.strictEqual(ran, 17,
    'CASES: seven controls plus ten mutations ran — a skipped case cannot ' +
    'hide behind a passing total');

  console.log('OK test_shot_thumbnails.cjs — F-04: a screenshot note opens ' +
    'with its pictures as a row of thumbnails above the text, every picture ' +
    'kept and in order, the same nodes the shipped sink made, every other ' +
    'note untouched, and each thumbnail taps open through the shipped zoom');
}()).catch(function (e) {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
