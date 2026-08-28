/*
 * tests/test_diegetic_wiring.cjs — the 26.5 diegetic-room static wiring
 * gate (Plan 26.5-01, SC-1/SC-2 wiring; the test_surface_wiring.cjs house
 * style: read the sources as TEXT, assert with regex/index pins, list every
 * offender with file and line, exit non-zero). Zero-dep (fs/path),
 * path-independent via __dirname. NOT an APP_SOURCES member of
 * test_no_push.cjs — no gate-list change there.
 *
 * Seven assertion groups:
 *
 *   1. FLAG SINGLETON — DIEGETIC_ROOM_ENABLED is declared exactly once, in
 *      app.js, and appears nowhere in core.js or server.py (the flag gates
 *      present/open sites only — never core or shared renderers).
 *   2. GATED PRESENT SITES — every roster entry (the reader present sites;
 *      later 26.5 plans append the station open sites) carries BOTH
 *      branches in its own body: the flag reference, the diegetic call,
 *      AND the legacy call textually intact (SC-1 byte-identity: flag off
 *      = the Phase-25 call, unchanged).
 *   3. RIBBON DOM SHAPE (D-03) — in index.html the spread markup exists
 *      and #spread-ribbon is a SIBLING of #spread-scroll (never a
 *      descendant, so a verdict can never scroll away — the Phase 22/23
 *      sticky lesson), while #spread-content and #spread-comments live
 *      INSIDE the scroll region, content first.
 *   4. SEAM-EVIDENT SPREAD SINK (law 4 / Pitfall 1) — the spread content
 *      container is written ONLY through the shared fillReaderInto
 *      builder: 'spread-content' appears in app.js exactly once (the
 *      SPREAD_IDS map), fillReaderInto exists, and every innerHTML
 *      assignment inside it is seam-evident at the assignment
 *      (renderMarkdown( / escapeHtml( / escapeAttr( inline) or an inert
 *      empty-string clear — the Suite-2 discipline, pinned again here at
 *      the one new sink.
 *   5. GATED OPEN SITES (26.5-02) — room-object click handlers (anonymous,
 *      lifted by brace-matching from their addEventListener anchors) that
 *      carry BOTH branches: the flag reference, the diegetic station open,
 *      AND the legacy statements textually intact. Thought experiment (the
 *      roster's teeth, verified against the pins below): delete the
 *      diegetic branch from the bookshelf handler and the `diegetic` pin
 *      exits 1; delete or reword either legacy statement
 *      (recordObjectOpen('bookshelf'); / loadReflectionShelf();) and the
 *      `legacy` pins exit 1 — removing EITHER branch fails this suite.
 *   6. STATION DOM (26.5-02, D-06) — #station-overlay exists in index.html
 *      and contains BOTH #station-back and #station-scene (source order
 *      overlay < back < scene, no </div> closing the overlay before them).
 *   7. STATION NODE-BUILDING (T-26.5-05, Suite-2 spirit) — the station
 *      painters (renderShelfStation / paintStationSpines and, since
 *      26.5-03, renderDeskStation / paintStationCandle) contain NO
 *      innerHTML assignment at all: book/item titles are untrusted text
 *      and land only via textContent / setAttribute, node-by-node.
 *   8. BLESSING RIBBON HANDLERS (26.5-03, D-15) — renderBlessingRibbon
 *      re-hosts the SHIPPED verdict flow: its body must reference
 *      handleBlessingTap, finishBlessing and currentBlessingId (the
 *      shipped handler names — never re-implemented copies), and the
 *      spread-blessing entry (deskStackOpenNext) must select through the
 *      SHIPPED picker (StudyCore.pickBlessingCandidates — law 5: no
 *      station-local selection, T-26.5-07).
 *   9. NO-COUNTS STACK (26.5-03, D-15 / law 3, T-26.5-09) — the
 *      renderDeskStation source interpolates NO length/count value into
 *      the stack markup: no `.length` read, no BLESS state read, and the
 *      stack button's label is the pinned neutral string. Counts of
 *      waiting things appear only in D-14 pile copy (plan 04) — never on
 *      or near the desk stack.
 *  10. MANAGE CONTENT-CONTROL ORDER (26.5-03, D-09) — the Phase-23
 *      content controls (filters / never show / hidden) precede the
 *      other manage sections in BOTH the MANAGE_PANES rail order
 *      (app.js) and the pane markup (index.html): one click past the
 *      desk drawer. The reorder is the one documented intentional delta
 *      from Phase-25 manage presentation — this pin keeps it deliberate.
 *  11. PILE-TAP SITES (26.5-04, D-14/D-15; RE-POINTED 26.95-32, D-08) —
 *      the diegetic pile handler (album station painters, region-lifted)
 *      references the ONE shared door entry with this container's door
 *      name (reachDoorOpen('album'), and the lifted region contains
 *      NEITHER the legacy blessing entry name, NOR the legacy
 *      screen-switch call, NOR the scoped spread-blessing entry it used
 *      to call — region-scoped so the legacy renderPileHint (which
 *      legitimately calls the first two on the flag-off panels) stays out
 *      of the scan. renderPileHint's OWN source is additionally pinned
 *      byte-for-byte against the shipped text (SC-1: the flag-off pile
 *      path is textually unchanged).
 *  12. TITLES-ONLY TOC (26.5-04, D-13 / law 5, T-26.5-13) — the journal
 *      station painters contain no renderMarkdown call and no HTML sink
 *      at all: TOC pages render titles + dates through textContent
 *      only, never body content of an un-opened note.
 *  13. CAPTION SEAM (26.5-04, D-12, T-26.5-12) — the album caption sink
 *      is escapeHtml INLINE at the assignment, and every innerHTML
 *      assignment in the album painters is seam-evident (the Suite-2
 *      discipline at the two new sinks: the /lib/ photo img and the
 *      caption — her comment text is untrusted input).
 *  14. D-07 MOTION BOUNDARY (26.5-07) — four resting-state pins on the
 *      eased camera zoom: (a) the .view-zooming duration literal in
 *      tokens.css parses within the 250-350ms band — thought experiment:
 *      rewrite the literal to 800ms and this pin exits 1 (longer moves
 *      shimmer pixel sprites, Pitfall 5); (b) a prefers-reduced-motion
 *      block covers .view-zooming (transition disabled — the cut IS the
 *      reduced-motion experience, and app.js checks the same query
 *      before arming); (c) the zoomRun teardown removes BOTH the class
 *      and the transform inside the transitionend/transitioncancel
 *      handler, so nothing fractional ever rests (the integer-at-rest
 *      rule stands; D-07's transient is its one decided exception);
 *      (d) NO tokens.css rule whose selector names a content region
 *      (the reader/spread content ids) carries a transition or
 *      animation declaration — the camera moves the scene wrap only,
 *      never the content (law 4, T-26.5-21). Motion FEEL stays a human
 *      call at the phase UAT — these pins hold only the boundary.
 *  15. NOTEBOOK TWO-LAYER REGISTRATION (26.8-05, D-15 / Pitfall 7) — the
 *      blessings notebook is a room object on BOTH roster layers
 *      (index.html button + app.js ROOM_OBJECT_IDS/FUNCTIONAL_IDS +
 *      server.py LAYOUT_OBJECTS, NOT FUNCTIONAL_OBJECTS), the room tap
 *      and the desk-spot tap run the SAME fresh-open station path (one
 *      station, two doors), the desk-spot door is UNCONDITIONAL (an
 *      owner-removed notebook never orphans the blessings), the room
 *      render hides a removed notebook gracefully (the candle
 *      precedent), and decor-books.png is the coded sprite fallback
 *      (the UI-SPEC pre-declared freeze cut). Thought experiment (the
 *      half-registration teeth): delete any ONE of the three registry
 *      entries and exactly that pin exits 1 — a half-registered
 *      notebook (drags 400 or the object vanishes with no door) can
 *      never land silently.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every violation listed with file and line + exit 1 on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const CORE = 'core.js';
const SERVER = 'server.py';
const HTML = 'index.html';
const TOKENS = 'tokens.css';

const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, CORE), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, SERVER), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, HTML), 'utf8');
const tokensSrc = fs.readFileSync(path.join(ROOT, TOKENS), 'utf8');

// The gated present sites — an explicit roster, mirroring GATED_SELECTORS
// in test_surface_wiring.cjs: A NEW GATED OPEN SITE MUST BE ADDED HERE
// DELIBERATELY to fall under the gate. Plan 26.5-01 pins the two reader
// present sites; the later 26.5 plans append the station open sites
// (bookshelf / album / journal / desk / manage) as they are gated.
const PRESENT_SITES = [
  { fn: 'renderReader', legacy: "showScreen('reader');",
    diegetic: 'openSpread(' },
  { fn: 'showReflectionVerbatim', legacy: "showScreen('reader');",
    diegetic: 'openSpread(' }
];

const violations = [];

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

// Lift a top-level `function name(...) { ... }` verbatim by brace-matching
// (the test_display_fence.cjs extractFn idiom).
function functionBody(src, file, name, group) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start === -1) {
    violations.push('[' + group + '] ' + file + ": function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return null;
  }
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) {
    violations.push('[' + group + '] ' + file + ': ' + name +
      "'s braces do not balance — cannot lift the body");
    return null;
  }
  return { text: src.slice(start, i), line: lineOf(src, start), start: start };
}

// ---- 1. FLAG SINGLETON --------------------------------------------------------

(function () {
  const decls = appSrc.match(/var\s+DIEGETIC_ROOM_ENABLED\s*=/g) || [];
  if (decls.length !== 1) {
    violations.push('[flag-singleton] ' + APP +
      ': expected exactly ONE `var DIEGETIC_ROOM_ENABLED =` declaration — ' +
      'found ' + decls.length);
  }
  if (coreSrc.indexOf('DIEGETIC_ROOM_ENABLED') !== -1) {
    violations.push('[flag-singleton] ' + CORE +
      ': DIEGETIC_ROOM_ENABLED must never appear in core.js — the flag ' +
      'gates present/open sites only, never the fence-critical core');
  }
  if (serverSrc.indexOf('DIEGETIC_ROOM_ENABLED') !== -1) {
    violations.push('[flag-singleton] ' + SERVER +
      ': DIEGETIC_ROOM_ENABLED must never appear in server.py — the flag ' +
      'is a front-end presentation gate only');
  }
})();

// ---- 2. GATED PRESENT SITES ----------------------------------------------------

PRESENT_SITES.forEach(function (site) {
  const body = functionBody(appSrc, APP, site.fn, 'present-site');
  if (!body) { return; }
  if (body.text.indexOf('DIEGETIC_ROOM_ENABLED') === -1) {
    violations.push('[present-site] ' + APP + ':' + body.line + ' ' +
      site.fn + ' never references DIEGETIC_ROOM_ENABLED — the present ' +
      'site must carry the gate in its own body (SC-1)');
  }
  if (body.text.indexOf(site.diegetic) === -1) {
    violations.push('[present-site] ' + APP + ':' + body.line + ' ' +
      site.fn + " carries no diegetic branch ('" + site.diegetic +
      "') — flag on must present in-scene");
  }
  if (body.text.indexOf(site.legacy) === -1) {
    violations.push('[present-site] ' + APP + ':' + body.line + ' ' +
      site.fn + " lost its legacy call ('" + site.legacy +
      "') — the flag-off path must be the Phase-25 statement, textually " +
      'unchanged (SC-1 byte-identity)');
  }
});

// ---- 3. RIBBON DOM SHAPE (D-03) -------------------------------------------------

(function () {
  const ids = ['spread-overlay', 'spread-frame', 'spread-back',
    'spread-title', 'spread-scroll', 'spread-content', 'spread-comments',
    'spread-ribbon'];
  const at = {};
  let missing = false;
  ids.forEach(function (id) {
    at[id] = htmlSrc.indexOf('id="' + id + '"');
    if (at[id] === -1) {
      violations.push('[ribbon-dom] ' + HTML + ': id="' + id +
        '" is missing from the spread markup');
      missing = true;
    }
  });
  if (missing) { return; }

  if (!(at['spread-scroll'] < at['spread-content'] &&
        at['spread-content'] < at['spread-comments'] &&
        at['spread-comments'] < at['spread-ribbon'])) {
    violations.push('[ribbon-dom] ' + HTML + ': expected source order ' +
      'scroll < content < comments < ribbon (content first inside the ' +
      'scroll, the ribbon after it)');
    return;
  }

  // depth accounting over <div openings/closings between two id anchors:
  // an id index sits INSIDE its own opening tag, after `<div`, so the
  // slice from anchor A to anchor B excludes A's opening tag and includes
  // B's. content INSIDE scroll => net depth >= 1; ribbon OUTSIDE (sibling)
  // => net depth <= 0 (the scroll's own </div> closed before the ribbon).
  function divDepth(a, b) {
    const seg = htmlSrc.slice(a, b);
    const opens = (seg.match(/<div\b/g) || []).length;
    const closes = (seg.match(/<\/div>/g) || []).length;
    return opens - closes;
  }
  if (divDepth(at['spread-scroll'], at['spread-content']) < 1) {
    violations.push('[ribbon-dom] ' + HTML + ':' +
      lineOf(htmlSrc, at['spread-content']) +
      ' #spread-content must sit INSIDE #spread-scroll (the ONE scroller)');
  }
  if (divDepth(at['spread-scroll'], at['spread-comments']) < 1) {
    violations.push('[ribbon-dom] ' + HTML + ':' +
      lineOf(htmlSrc, at['spread-comments']) +
      ' #spread-comments must sit INSIDE #spread-scroll, below the content');
  }
  if (divDepth(at['spread-scroll'], at['spread-ribbon']) > 0) {
    violations.push('[ribbon-dom] ' + HTML + ':' +
      lineOf(htmlSrc, at['spread-ribbon']) +
      ' #spread-ribbon must be a SIBLING of #spread-scroll, never a ' +
      'descendant — inside the scroll a verdict can scroll away (D-03)');
  }
})();

// ---- 4. SEAM-EVIDENT SPREAD SINK (law 4 / Pitfall 1) ------------------------------

(function () {
  // (a) the spread content id is named in app.js exactly once — inside the
  // SPREAD_IDS element-id map. Any second naming is a second sink path.
  const hits = appSrc.match(/spread-content/g) || [];
  if (hits.length !== 1) {
    violations.push('[spread-seam] ' + APP +
      ": expected exactly ONE 'spread-content' occurrence (the SPREAD_IDS " +
      'map) — found ' + hits.length +
      ' (a second occurrence is a second content path, law 4)');
  }
  if (!/var\s+SPREAD_IDS\s*=\s*\{[^}]*content:\s*'spread-content'/.test(appSrc)) {
    violations.push('[spread-seam] ' + APP +
      ": SPREAD_IDS must be declared with content: 'spread-content' — the " +
      'spread sink is reachable only through the shared builder');
  }
  if (!/var\s+LEGACY_READER_IDS\s*=\s*\{[^}]*content:\s*'reader-content'/
    .test(appSrc)) {
    violations.push('[spread-seam] ' + APP +
      ": LEGACY_READER_IDS must be declared with content: 'reader-content'" +
      ' — the flag-off reader fills through the SAME shared builder');
  }

  // (b) the shared builder exists and each of its innerHTML assignments is
  // seam-evident at the assignment (or an inert empty-string clear).
  const builder = functionBody(appSrc, APP, 'fillReaderInto', 'spread-seam');
  if (!builder) { return; }
  const re = /\.\s*innerHTML\s*(?:\+=|=)(?!=)/g;
  let m;
  let sinks = 0;
  while ((m = re.exec(builder.text)) !== null) {
    sinks += 1;
    const ahead = builder.text.slice(m.index, m.index + 220);
    if (/=\s*''\s*;/.test(ahead)) { continue; }   // inert clear
    if (!/\b(?:renderMarkdown|escapeHtml|escapeAttr)\s*\(/.test(ahead)) {
      violations.push('[spread-seam] ' + APP + ':' +
        lineOf(appSrc, builder.start + m.index) +
        ' fillReaderInto sink is not seam-evident at the assignment ' +
        '(renderMarkdown/escapeHtml/escapeAttr must appear inline)');
    }
  }
  if (sinks === 0) {
    violations.push('[spread-seam] ' + APP + ':' + builder.line +
      ' fillReaderInto contains no innerHTML sink — the builder must be ' +
      'the one place content lands');
  }
})();

// ---- 5. GATED OPEN SITES (26.5-02) ------------------------------------------------

// The gated room-object OPEN sites — an explicit roster like PRESENT_SITES:
// A NEW GATED OPEN SITE MUST BE ADDED HERE DELIBERATELY. Plan 26.5-02 pins
// the bookshelf; the later 26.5 plans append album / journal / desk /
// manage as they are gated. Handlers are anonymous, so each entry names
// its addEventListener anchor and the body is lifted by brace-matching
// from there (the handler closes at the anchor statement's balanced brace).
const OPEN_SITES = [
  { anchor: "$('room-obj-bookshelf').addEventListener('click'",
    legacy: ["recordObjectOpen('bookshelf');", 'loadReflectionShelf();'],
    diegetic: "openStation('shelf')" },
  // 26.5-03: the desk — the blessing home. Thought experiment: delete
  // the diegetic branch and the `diegetic` pin exits 1; delete or reword
  // ANY of the three legacy statements and the `legacy` pins exit 1.
  { anchor: "$('room-obj-desk').addEventListener('click'",
    legacy: ["recordObjectOpen('desk');", 'startBlessing();',
      'revealDeskNotes();'],
    diegetic: "openStation('desk')" },
  // 26.5-04: the two containers. Thought experiment: delete either
  // diegetic branch and its `diegetic` pin exits 1; delete or reword
  // either legacy call and the `legacy` pins exit 1.
  { anchor: "$('room-obj-album').addEventListener('click'",
    legacy: ['openAlbum();'],
    diegetic: "openStation('album')" }
  // 26.8.1-02 (D-B): the journal open site was retired — its absence is
  // asserted in group 16 below, not gated here.
];

// Lift an anonymous handler body: from the anchor, brace-match the whole
// addEventListener statement (which encloses exactly the handler function).
function handlerBody(src, file, anchor, group) {
  const start = src.indexOf(anchor);
  if (start === -1) {
    violations.push('[' + group + '] ' + file + ": anchor '" + anchor +
      "' not found — the open site moved or was renamed; update this " +
      'gate deliberately');
    return null;
  }
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) {
    violations.push('[' + group + '] ' + file + ': braces after anchor ' +
      anchor + ' do not balance — cannot lift the handler body');
    return null;
  }
  return { text: src.slice(start, i), line: lineOf(src, start) };
}

OPEN_SITES.forEach(function (site) {
  const body = handlerBody(appSrc, APP, site.anchor, 'open-site');
  if (!body) { return; }
  if (body.text.indexOf('DIEGETIC_ROOM_ENABLED') === -1) {
    violations.push('[open-site] ' + APP + ':' + body.line + ' ' +
      site.anchor + ' never references DIEGETIC_ROOM_ENABLED — the open ' +
      'site must carry the gate in its own body (SC-1)');
  }
  if (body.text.indexOf(site.diegetic) === -1) {
    violations.push('[open-site] ' + APP + ':' + body.line + ' ' +
      site.anchor + " carries no diegetic branch ('" + site.diegetic +
      "') — flag on must open the station");
  }
  site.legacy.forEach(function (call) {
    if (body.text.indexOf(call) === -1) {
      violations.push('[open-site] ' + APP + ':' + body.line + ' ' +
        site.anchor + " lost its legacy call ('" + call +
        "') — the flag-off path must be the shipped statements, " +
        'textually unchanged (SC-1 byte-identity)');
    }
  });
});

// ---- 6. STATION DOM (26.5-02, D-06) ------------------------------------------------

(function () {
  const ids = ['station-overlay', 'station-back', 'station-scene'];
  const at = {};
  let missing = false;
  ids.forEach(function (id) {
    at[id] = htmlSrc.indexOf('id="' + id + '"');
    if (at[id] === -1) {
      violations.push('[station-dom] ' + HTML + ': id="' + id +
        '" is missing from the station markup');
      missing = true;
    }
  });
  if (missing) { return; }
  if (!(at['station-overlay'] < at['station-back'] &&
        at['station-back'] < at['station-scene'])) {
    violations.push('[station-dom] ' + HTML + ': expected source order ' +
      'overlay < back < scene (the back affordance and the sub-scene ' +
      'both inside the overlay)');
    return;
  }
  // containment: no </div> may close #station-overlay before its two
  // children appear (the overlay's own opening tag sits at the anchor).
  const seg = htmlSrc.slice(at['station-overlay'], at['station-scene']);
  if (seg.indexOf('</div>') !== -1) {
    violations.push('[station-dom] ' + HTML + ':' +
      lineOf(htmlSrc, at['station-scene']) +
      ' #station-back and #station-scene must sit INSIDE ' +
      '#station-overlay — a </div> closes the overlay before them');
  }
})();

// ---- 7. STATION NODE-BUILDING (T-26.5-05, Suite-2 spirit) --------------------------

(function () {
  // 26.8.1-02 (D-B): renderMemoirStation / paintMemoirPage were retired;
  // their absence is asserted in group 16 (they no longer exist to lift).
  ['renderShelfStation', 'paintStationSpines', 'renderDeskStation',
    'paintStationCandle']
    .forEach(function (name) {
    const body = functionBody(appSrc, APP, name, 'station-nodes');
    if (!body) { return; }
    if (/\.\s*innerHTML\s*(?:\+=|=)(?!=)/.test(body.text)) {
      violations.push('[station-nodes] ' + APP + ':' + body.line + ' ' +
        name + ' assigns innerHTML — station DOM is built node-by-node ' +
        '(textContent/setAttribute only: book/item titles are untrusted ' +
        'text and must never meet an HTML sink)');
    }
  });
})();

// ---- 8. BLESSING RIBBON HANDLERS (26.5-03, D-15) -----------------------------------

(function () {
  const ribbon = functionBody(appSrc, APP, 'renderBlessingRibbon',
    'blessing-ribbon');
  if (ribbon) {
    ['handleBlessingTap(', 'finishBlessing(', 'currentBlessingId(']
      .forEach(function (name) {
        if (ribbon.text.indexOf(name) === -1) {
          violations.push('[blessing-ribbon] ' + APP + ':' + ribbon.line +
            " renderBlessingRibbon never calls '" + name +
            "' — the ribbon must re-host the SHIPPED verdict handlers, " +
            'never re-implemented copies (D-15)');
        }
      });
  }
  const entry = functionBody(appSrc, APP, 'deskStackOpenNext',
    'blessing-ribbon');
  if (entry) {
    if (entry.text.indexOf('StudyCore.pickBlessingCandidates(') === -1) {
      violations.push('[blessing-ribbon] ' + APP + ':' + entry.line +
        ' deskStackOpenNext must select through the SHIPPED picker ' +
        '(StudyCore.pickBlessingCandidates) — no station-local ' +
        'selection ever (law 5, T-26.5-07)');
    }
  }
})();

// ---- 9. NO-COUNTS STACK (26.5-03, D-15 / law 3) ------------------------------------

(function () {
  const body = functionBody(appSrc, APP, 'renderDeskStation',
    'stack-no-counts');
  if (!body) { return; }
  // No length/count value may reach the stack markup: the painter reads
  // no list length and no blessing-pass state at all. (The word "count"
  // in comments is fine — the pins below are on CODE reads.)
  if (body.text.indexOf('.length') !== -1) {
    violations.push('[stack-no-counts] ' + APP + ':' + body.line +
      ' renderDeskStation reads a .length — no count of waiting things ' +
      'may ever be computed for, or interpolated into, the desk ' +
      'station markup (D-15, law 3)');
  }
  if (/\bBLESS\s*\./.test(body.text)) {
    violations.push('[stack-no-counts] ' + APP + ':' + body.line +
      ' renderDeskStation reads BLESS state — the stack is a drawn ' +
      'pile, never a dashboard of the pass (D-15, law 3)');
  }
  // 26.999 (2026-08-25): the neutral-literal check RETIRED, deliberately.
  // It demanded the string 'a stack of papers' somewhere in the painter —
  // but that label was replaced by her F-1 ruling (C-12) long ago, and the
  // check had been quietly satisfied by a COMMENT quoting the retired
  // label, despite this group's own "pins below are on CODE reads" note.
  // Her 2026-08-25 ruling then removed the door's on-screen text entirely
  // (the album art is the render). What this pin protected — the door
  // never announcing what WAITS — is carried by the .length and BLESS
  // bans above, and the door's name now rides the aria from the one copy
  // home, asserted here on code:
  if (body.text.indexOf("stack.setAttribute('aria-label', stackLabel)")
      === -1) {
    violations.push('[stack-no-counts] ' + APP + ':' + body.line +
      ' renderDeskStation lost the stack door\'s accessible name from ' +
      'the one copy home (aria-label, OFFER_COPY.deskStack) — a door with ' +
      'no name at all is not what her remove-the-wording ruling asked for');
  }
})();

// ---- 10. MANAGE CONTENT-CONTROL ORDER (26.5-03, D-09) ------------------------------

(function () {
  // (a) app.js: in the MANAGE_PANES declaration, the three content-
  // control entries come before the pile entry (the first non-control
  // library section). Lifted from the declaration onward so unrelated
  // later mentions of the keys can never satisfy the pin.
  const declAt = appSrc.indexOf('var MANAGE_PANES');
  if (declAt === -1) {
    violations.push('[manage-order] ' + APP +
      ': var MANAGE_PANES not found — renamed or removed; update this ' +
      'gate deliberately');
  } else {
    const seg = appSrc.slice(declAt);
    const pileAt = seg.indexOf("key: 'pile'");
    ["key: 'filters'", "key: 'never'", "key: 'hidden'"]
      .forEach(function (needle) {
        const at = seg.indexOf(needle);
        if (at === -1 || pileAt === -1 || at > pileAt) {
          violations.push('[manage-order] ' + APP + ':' +
            lineOf(appSrc, declAt) + ' MANAGE_PANES must list ' + needle +
            " before key: 'pile' — the D-09 promotion keeps the " +
            'content controls one click past the drawer');
        }
      });
  }
  // (b) index.html: the content-control pane containers precede the
  // other section containers in the manage markup.
  const pileDiv = htmlSrc.indexOf('id="manage-sec-pile"');
  ['manage-sec-filters', 'manage-sec-never', 'manage-sec-hidden']
    .forEach(function (id) {
      const at = htmlSrc.indexOf('id="' + id + '"');
      if (at === -1 || pileDiv === -1 || at > pileDiv) {
        violations.push('[manage-order] ' + HTML + ': #' + id +
          ' must precede #manage-sec-pile in the manage pane markup ' +
          '(D-09 promotion)');
      }
    });
})();

// ---- 11. PILE-TAP SITES (26.5-04, D-14/D-15) ---------------------------------------

// The two diegetic pile handlers live inside the station painters; each
// region is the painter pair lifted whole, so the scan can never bleed
// into the legacy renderPileHint (which legitimately names the legacy
// entry and the screen switch for the flag-off panels).
const PILE_SITES = [
  { label: 'album', fns: ['renderAlbumStation', 'paintAlbumSpread'],
    // ⚠⚠ RE-POINTED BY 26.95-32 (D-08), AND THE PIN FOLLOWED THE ROOM
    // RATHER THAN THE RED. It read deskStackOpenNext('image') — the
    // plan-03 scoped spread blessing over this container's own type. That
    // is not what this door does any more: under D-08 the album pile is
    // one of THREE doors onto the visit's single Offer, and it opens
    // through the ONE shared entry precisely so the three can never each
    // compute a reach of their own.
    //
    // ⛔ A PIN IS NEVER MOVED TO MAKE A SUITE GREEN. It is moved when the
    // room's contract changes by ruling, and the ruling is named here so a
    // later reader can check the move instead of trusting it. What this
    // still fails on is unchanged in spirit and wider in reach than before:
    // a pile tap that stops going through the one entry.
    scoped: "reachDoorOpen('album'", pileId: 'album-pile' }
  // 26.8.1-02 (D-B): the journal pile-tap site left WITH the journal
  // station (its pile line was never re-pointed to MORE_WAITING_COPY);
  // group 16 asserts the station's absence.
  // 26.95-32: it STAYS gone, and its absence is not a gap. D-08 as amended
  // is three doors, not four — the reading-door station was retired whole
  // at 26.91-04 and a text-scoped door onto an Offer of photographs is
  // incoherent on its face. ⛔ Do not add a journal row here.
];

PILE_SITES.forEach(function (site) {
  let region = '';
  let firstLine = 0;
  site.fns.forEach(function (name) {
    const body = functionBody(appSrc, APP, name, 'pile-tap');
    if (!body) { return; }
    if (!firstLine) { firstLine = body.line; }
    region += body.text + '\n';
  });
  if (!region) { return; }
  if (region.indexOf(site.scoped) === -1) {
    violations.push('[pile-tap] ' + APP + ':' + firstLine + ' the ' +
      site.label + " station never calls the scoped entry '" +
      site.scoped + "' — the diegetic pile tap must start the plan-03 " +
      "spread blessing with this container's type scope (D-14/D-15)");
  }
  if (region.indexOf("'" + site.pileId + "'") === -1) {
    violations.push('[pile-tap] ' + APP + ':' + firstLine + ' the ' +
      site.label + ' station never assigns the #' + site.pileId +
      ' id — the pile hint element moved or was renamed; update this ' +
      'gate deliberately');
  }
  // ⚠ 26.95-32 ADDS THE THIRD BAN, and it is the other half of the
  // re-point above rather than a new idea. The positive pin alone would
  // still pass if a future edit restored the OLD call beside the new one,
  // and a door with two paths is exactly what the one shared entry exists
  // to prevent: one of them would compute a reach the other never spent.
  // So the retired call is pinned ABSENT here, the same disposition
  // test_no_push.cjs uses for a retired claim — the record that this door
  // once dealt the unjudged grind survives, and its return goes red.
  ['startBlessing', 'showScreen(',
    'deskStackOpenNext('].forEach(function (banned) {
    const at = region.indexOf(banned);
    if (at !== -1) {
      violations.push('[pile-tap] ' + APP + ':' + firstLine + ' the ' +
        site.label + " station region contains '" + banned + "' — the " +
        'diegetic pile path must never invoke the legacy blessing entry, ' +
        'switch to a legacy screen, or go back to dealing the unjudged ' +
        'pile (D-15: the spread IS the act; D-08: one entry, three doors)');
    }
  });
});

// SC-1: the pile machinery is pinned byte-for-byte against the shipped
// source. 26.8.1-02 (D-B) removed the journal branch — panelReturn is now
// always 'album' (the only remaining pile surface). A deliberate future
// edit updates this literal deliberately.
(function () {
  const body = functionBody(appSrc, APP, 'renderPileHint', 'pile-tap');
  if (!body) { return; }
  const SHIPPED = "function renderPileHint(slot, n, type) {\n    if (!s" +
    "lot) { return; }\n    if (n === 0) {\n      slot.innerHTML = '';\n" +
    "      return;\n    }\n    slot.innerHTML = '<p><button type=\"but" +
    "ton\" class=\"room-pile-hint\">' +\n      escapeHtml(pileHintCopy" +
    "(n, type)) + '</button></p>';\n    slot.querySelector('.room-pile" +
    "-hint').addEventListener('click',\n      function () {\n        R" +
    "OOM.panelReturn = 'album';\n      " +
    "  startBlessing();\n      });\n  }";
  if (body.text !== SHIPPED) {
    violations.push('[pile-tap] ' + APP + ':' + body.line +
      ' renderPileHint differs from the shipped source — the flag-off ' +
      'pile path must stay textually unchanged (SC-1); if this edit is ' +
      'deliberate, update the SHIPPED literal here deliberately');
  }
})();

// ---- 12. TITLES-ONLY TOC (26.5-04, D-13 / law 5) — RETIRED by 26.8.1-02 (D-B)
//
// This pin guarded the journal station's TOC painters (renderMemoirStation
// / paintMemoirPage) against composing note body content. D-B retired the
// journal station entirely, so the painters no longer exist — group 16
// asserts their absence. The blessings notebook's own titles-only
// discipline is owned by test_blessings_notebook.cjs, not this suite.

// ---- 13. CAPTION SEAM (26.5-04, D-12) ----------------------------------------------

(function () {
  // (a) the caption sink is escapeHtml INLINE at the assignment — her
  // comment text is untrusted input and the discipline must be visible
  // where the sink is (Suite-2 seam evidence).
  const paint = functionBody(appSrc, APP, 'paintAlbumSpread',
    'caption-seam');
  if (!paint) { return; }
  if (!/\.innerHTML\s*=\s*escapeHtml\(/.test(paint.text)) {
    violations.push('[caption-seam] ' + APP + ':' + paint.line +
      ' paintAlbumSpread has no `innerHTML = escapeHtml(` caption sink ' +
      '— the caption must escape inline at the assignment (D-12, ' +
      'T-26.5-12)');
  }
  // (b) every innerHTML assignment across the album painters is
  // seam-evident (the group-4 discipline at the two new sinks).
  ['renderAlbumStation', 'paintAlbumSpread'].forEach(function (name) {
    const body = functionBody(appSrc, APP, name, 'caption-seam');
    if (!body) { return; }
    const re = /\.\s*innerHTML\s*(?:\+=|=)(?!=)/g;
    let m;
    while ((m = re.exec(body.text)) !== null) {
      const ahead = body.text.slice(m.index, m.index + 220);
      if (/=\s*''\s*;/.test(ahead)) { continue; }   // inert clear
      if (!/\b(?:renderMarkdown|escapeHtml|escapeAttr)\s*\(/.test(ahead)) {
        violations.push('[caption-seam] ' + APP + ':' +
          lineOf(appSrc, body.start + m.index) + ' ' + name +
          ' sink is not seam-evident at the assignment (renderMarkdown/' +
          'escapeHtml/escapeAttr must appear inline)');
      }
    }
  });
})();

// ---- 14. D-07 MOTION BOUNDARY (26.5-07) --------------------------------------------

// tokens.css with its comments blanked (newlines kept, so lineOf stays
// exact): prose in comments legitimately NAMES the content ids and the
// motion vocabulary — only real selectors and declarations may satisfy
// or violate the pins below.
const tokensCss = tokensSrc.replace(/\/\*[\s\S]*?\*\//g, function (c) {
  return c.replace(/[^\n]/g, ' ');
});

// (a) the .view-zooming duration literal parses within the 250-350ms
// band. The rule carries `transition: transform <N>ms` with a HARDCODED
// literal (never a var()); the reduced-motion twin says `transition:
// none` and can never satisfy this regex, so the match is the one
// motion rule. Thought experiment (per the header): set 800ms and this
// pin exits 1.
(function () {
  const m = tokensCss.match(
    /\.view-zooming\s*\{[^}]*transition\s*:\s*transform\s+(\d+)ms/);
  if (!m) {
    violations.push('[motion-boundary] ' + TOKENS +
      ': no .view-zooming rule with a `transition: transform <N>ms` ' +
      'literal — the D-07 zoom block is missing or its duration is not ' +
      'a hardcoded ms literal');
    return;
  }
  const ms = parseInt(m[1], 10);
  if (!(ms >= 250 && ms <= 350)) {
    violations.push('[motion-boundary] ' + TOKENS + ':' +
      lineOf(tokensCss, m.index) + ' .view-zooming duration ' + ms +
      'ms is outside the decided 250-350ms band — longer transforms ' +
      'shimmer pixel sprites (D-07, Pitfall 5)');
  }
})();

// (b) a prefers-reduced-motion block covers .view-zooming and disables
// the transition — the shipped candle-block pattern.
(function () {
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m;
  let covered = false;
  while ((m = re.exec(tokensCss)) !== null) {
    let i = m.index + m[0].length - 1; // the block's opening brace
    let depth = 0;
    for (; i < tokensCss.length; i++) {
      if (tokensCss[i] === '{') { depth++; }
      else if (tokensCss[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const block = tokensCss.slice(m.index, i);
    if (block.indexOf('.view-zooming') !== -1 &&
        /\.view-zooming\s*\{[^}]*transition\s*:\s*none/.test(block)) {
      covered = true;
      break;
    }
  }
  if (!covered) {
    violations.push('[motion-boundary] ' + TOKENS +
      ': no prefers-reduced-motion block sets .view-zooming ' +
      '{ transition: none } — reduced motion must skip the zoom ' +
      'entirely (the cut IS the reduced-motion experience)');
  }
})();

// (c) the teardown lives INSIDE the transition-event handler: zoomRun's
// settle removes the class AND resets the transform in the same body,
// and both once-listeners (transitionend + transitioncancel) are armed —
// nothing fractional may rest after the move (integer-at-rest).
(function () {
  const body = functionBody(appSrc, APP, 'zoomRun', 'motion-boundary');
  if (!body) { return; }
  [
    { needle: "classList.remove('view-zooming')",
      why: 'the class must come off in the teardown' },
    { needle: ".style.transform = ''",
      why: 'the transform must reset in the SAME teardown — a resting ' +
        'transform is a resting fractional scale (Pitfall 5)' },
    { needle: "addEventListener('transitionend'",
      why: 'the teardown must ride transitionend (class-off convention, ' +
        'no timer API ever)' },
    { needle: "addEventListener('transitioncancel'",
      why: 'an interrupted move must land the same teardown ' +
        '(never-stuck, T-26.5-22)' }
  ].forEach(function (pin) {
    if (body.text.indexOf(pin.needle) === -1) {
      violations.push('[motion-boundary] ' + APP + ':' + body.line +
        " zoomRun lost '" + pin.needle + "' — " + pin.why);
    }
  });
})();

// (d) the law-4 camera-not-content boundary: no tokens.css rule whose
// selector names a content region may declare a transition or an
// animation. Innermost `selector { declarations }` pairs are scanned,
// so rules inside media blocks are covered too.
(function () {
  const CONTENT_IDS = ['reader-content', 'spread-content',
    'reader-title', 'spread-title', 'reader-comments', 'spread-comments'];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(tokensCss)) !== null) {
    const selector = m[1];
    const decls = m[2];
    const named = CONTENT_IDS.some(function (id) {
      return selector.indexOf(id) !== -1;
    });
    if (!named) { continue; }
    if (/(?:^|[;\s])(?:transition|animation)(?:-[a-z]+)?\s*:/.test(decls)) {
      violations.push('[motion-boundary] ' + TOKENS + ':' +
        lineOf(tokensCss, m.index) +
        ' a content-region rule (' + selector.trim().slice(0, 60) +
        ') declares transition/animation — the camera moves the scene ' +
        'wrap ONLY, never the content (law 4, T-26.5-21)');
    }
  }
})();

// ---- 15. NOTEBOOK TWO-LAYER REGISTRATION (26.8-05, D-15 / Pitfall 7) ---------

(function () {
  // (a) index.html: the room-object button in the shipped markup pattern.
  const at = htmlSrc.indexOf('id="room-obj-notebook"');
  if (at === -1) {
    violations.push('[notebook-registration] ' + HTML +
      ': no id="room-obj-notebook" button — the notebook is not a room ' +
      'object (D-15)');
  } else {
    const end = htmlSrc.indexOf('</button>', at);
    const btn = htmlSrc.slice(at, end === -1 ? at + 600 : end);
    [
      { needle: 'aria-label="the blessings notebook"',
        why: 'the pinned accessible name' },
      { needle: 'data-cls="surface"',
        why: 'the notebook seats on a surface (the desk) like the candle' },
      { needle: 'src="assets/room/notebook.png"',
        why: 'the contracted sprite src (decor-books.png is the CODED ' +
          'fallback, swapped by app.js when the art is absent)' }
    ].forEach(function (pin) {
      if (btn.indexOf(pin.needle) === -1) {
        violations.push('[notebook-registration] ' + HTML + ':' +
          lineOf(htmlSrc, at) + ' the notebook button lost ' +
          pin.needle + ' — ' + pin.why);
      }
    });
  }
  // (b) app.js client rosters: arrangeable + move-but-not-remove; no
  // remove handle may ever reach it (never in SHIPPED_DECOR_IDS).
  const roomIds = appSrc.match(/var ROOM_OBJECT_IDS = \[([^\]]*)\]/);
  if (!roomIds || roomIds[1].indexOf("'notebook'") === -1) {
    violations.push('[notebook-registration] ' + APP +
      ": ROOM_OBJECT_IDS must include 'notebook' — otherwise the " +
      'shared drag pipeline never picks it up');
  }
  const funcIds = appSrc.match(/var FUNCTIONAL_IDS = \[([^\]]*)\]/);
  if (!funcIds || funcIds[1].indexOf("'notebook'") === -1) {
    violations.push('[notebook-registration] ' + APP +
      ": FUNCTIONAL_IDS must include 'notebook' — move-but-not-remove " +
      'is the client posture (D-15, the candle model)');
  }
  const decorIds = appSrc.match(/var SHIPPED_DECOR_IDS = \[([^\]]*)\]/);
  if (decorIds && decorIds[1].indexOf("'notebook'") !== -1) {
    violations.push('[notebook-registration] ' + APP +
      ": SHIPPED_DECOR_IDS must NOT include 'notebook' — no client " +
      'remove handle may ever reach it');
  }
  // (c) server.py: the LAYOUT_OBJECTS row exists; FUNCTIONAL_OBJECTS
  // does NOT gain the notebook (server-side removable, candle model).
  if (!/"notebook":\s*\(28,\s*22,\s*"surface"\)/.test(serverSrc)) {
    violations.push('[notebook-registration] ' + SERVER +
      ': LAYOUT_OBJECTS must carry "notebook": (28, 22, "surface") — ' +
      'without it every notebook drag 400s (Pitfall 7)');
  }
  const funcObjs = serverSrc.match(/FUNCTIONAL_OBJECTS = \(([^)]*)\)/);
  if (!funcObjs || funcObjs[1].indexOf('notebook') !== -1) {
    violations.push('[notebook-registration] ' + SERVER +
      ': FUNCTIONAL_OBJECTS must NOT contain the notebook — its ' +
      'removal stays server-acceptable with the desk-spot door as the ' +
      'graceful fallback (D-15)');
  }
  // (d) one station, two doors: the room tap runs the desk-spot door's
  // exact fresh-open path (view-0 + newest-month reset, then
  // openStation('notebook')).
  const door = handlerBody(appSrc, APP,
    "$('room-obj-notebook').addEventListener('click'",
    'notebook-registration');
  if (door) {
    ['if (DESIGN) { return; }', 'STATION_NOTEBOOK.view = 0;',
      "STATION_NOTEBOOK.month = '';", "openStation('notebook')"]
      .forEach(function (needle) {
        if (door.text.indexOf(needle) === -1) {
          violations.push('[notebook-registration] ' + APP + ':' +
            door.line + " the notebook room tap lost '" + needle +
            "' — both doors must run the SAME fresh-open station path");
        }
      });
  }
  const deskBody = functionBody(appSrc, APP, 'renderDeskStation',
    'notebook-registration');
  if (deskBody) {
    if (deskBody.text.indexOf("openStation('notebook')") === -1 ||
        deskBody.text.indexOf("'desk-spot-notebook'") === -1) {
      violations.push('[notebook-registration] ' + APP + ':' +
        deskBody.line + ' renderDeskStation lost the desk-spot ' +
        'notebook door — the station must stay reachable from the desk');
    }
    if (deskBody.text.indexOf('LAYOUT.removed') !== -1) {
      violations.push('[notebook-registration] ' + APP + ':' +
        deskBody.line + ' renderDeskStation reads LAYOUT.removed — ' +
        'the desk-spot door is UNCONDITIONAL: an owner-removed ' +
        'notebook must never orphan the blessings (D-15)');
    }
  }
  // (e) the owner-removed graceful fallback: the room render hides a
  // removed notebook through the design-owned mechanism and restores it
  // when the removal is undone (the candle precedent).
  const applyBody = functionBody(appSrc, APP, 'applyAccessoryState',
    'notebook-registration');
  if (applyBody && applyBody.text.indexOf("'notebook'") === -1) {
    violations.push('[notebook-registration] ' + APP + ':' +
      applyBody.line + ' applyAccessoryState never names the notebook ' +
      '— an owner-removed notebook must skip the room render ' +
      'gracefully (the candle precedent, D-15)');
  }
  // (f) the coded sprite fallback: notebook.png may trail the build
  // (art-last); decor-books.png is the UI-SPEC pre-declared fallback.
  if (!/ROOM_SPRITE_FALLBACKS\s*=\s*\{[\s\S]{0,400}?notebook:\s*'assets\/room\/decor-books\.png'/
    .test(appSrc)) {
    violations.push('[notebook-registration] ' + APP +
      ": no ROOM_SPRITE_FALLBACKS entry notebook: 'assets/room/" +
      "decor-books.png' — the desk object's coded art fallback is " +
      'the pre-declared freeze cut (UI-SPEC sprite contract)');
  }
})();

// ---- 16. D-B BROWSE PANEL ABSENT — A PRESERVATION PIN (26.8.1-02) ------------
//
// ⚠ THIS GROUP CANNOT PROVE 26.9's WORK AND MUST NEVER BE COUNTED AS
// EVIDENCE OF IT. Every assertion below passes today and passed before
// 26.9 began; it can only ever go red because a FUTURE edit brings the
// retired BROWSE PANEL back. That is its whole job.
//
// 26.9 (D-18/D-22, 2026-08-04) SPLIT the original group 16 in two rather
// than deleting it. D-B retired two different things under one heading:
//   (a) the journal BROWSE PANEL — a screen-and-list of every text note,
//       the "container of all notes" read the owner rejected. STILL DEAD,
//       and these are the only automated guard D-21 has that it stays dead.
//   (b) the journal ROOM OBJECT + STATION. 26.9 brings THAT half back as
//       the reading door — those bans are inverted into group 16b below.
// DELIBERATELY NOT checked here (preserved per RESEARCH D-B Table 2/3):
// the kept pure cores packMemoirToc / pickMemoirItems, and the
// reflection-fence `Memoir/` vault-folder references — none are
// user-facing journal surfaces.

(function () {
  const GONE_APP = [
    { pat: 'function openMemoir(', why: 'the journal browse entry' },
    { pat: 'function renderMemoir(',
      why: 'the journal browse-list renderer' },
    { pat: "ROOM.panelReturn === 'journal'",
      why: 'a journal panel-return route' },
    { pat: "ROOM.panelReturn = 'journal'",
      why: 'a journal panel-return stamp' }
  ];
  GONE_APP.forEach(function (g) {
    const at = appSrc.indexOf(g.pat);
    if (at !== -1) {
      violations.push('[journal-panel-absent] ' + APP + ':' +
        lineOf(appSrc, at) + " still carries '" + g.pat + "' — " + g.why +
        ' must stay removed (D-B: the journal BROWSE PANEL is retired;' +
        ' 26.9 restored the station, never the panel)');
    }
  });
  // SCREEN_NAMES stays a ban: the reading door is a STATION, and a
  // station is not a screen. 26.9 makes no SCREEN_NAMES edit.
  (function () {
    const m = appSrc.match(/var SCREEN_NAMES = \[([\s\S]*?)\]/);
    if (m && m[1].indexOf("'journal'") !== -1) {
      violations.push('[journal-panel-absent] ' + APP + ': SCREEN_NAMES' +
        " must not list 'journal' — the browse panel is retired (D-B);" +
        ' the 26.9 reading door is a station, never a screen');
    }
  })();
  // index.html: the browse panel and its slots are gone. (The room
  // object button is NOT here any more — 26.9 requires it, group 16b.)
  [
    { pat: 'id="screen-journal"', why: 'the journal browse panel' },
    { pat: 'id="journal-list"', why: 'the journal list container' },
    { pat: 'id="journal-hint"', why: 'the journal pile-hint slot' }
  ].forEach(function (g) {
    const at = htmlSrc.indexOf(g.pat);
    if (at !== -1) {
      violations.push('[journal-panel-absent] ' + HTML + ':' +
        lineOf(htmlSrc, at) + ' still carries ' + g.pat + ' — ' + g.why +
        ' must stay removed (D-B)');
    }
  });
})();

// ---- 16b. THE READING DOOR IS RETIRED --------------------------------------
// ---- RE-INVERTED 26.91-04 (D-06, 2026-08-07) — wired -> ABSENT -------------
//
// DISPOSITION: re-inverted, not deleted. 26.8.1 D-B banned this surface;
// 26.9-01 D-18 inverted the bans into requirements and authored this group to
// prove the reading door WAS wired; 26.91 D-06 retires it again and this
// group flips back to bans. The whole arc is stated rather than erased — the
// group exists precisely so a later phase can read which way it pointed when.
//
// Owner, 2026-08-07: "the reading book is too redundant, it almost shares the
// same function as the journal book" / "it is too much for me to read and I
// feel the easier the better."
//
// The five app.js bans + the two rosters + the DOM id are asserted TOGETHER
// on purpose, and that conjunction is now load-bearing in a way it was not
// before: A RENAME SATISFIES ANY ONE OF THEM ALONE. Renaming
// renderMemoirStation to renderReadingStation clears the painter ban while
// leaving the surface fully alive; only the conjunction with the roster
// count, the registry count and the DOM absence closes it.
//
// Every app.js scan here runs over COMMENT-STRIPPED source. app.js's own
// 26.91-04 disposition notes discuss the retired object by name, and a raw
// scan would be self-invalidating — the exact shape this repo has shipped
// before (a control satisfied by a comment).

// Comment-stripped app.js / index.html, shared by 16b..16e below.
const appCode = appSrc.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
  .join('\n');
const htmlCode = htmlSrc.replace(/<!--[\s\S]*?-->/g, '');

(function () {
  // The stripper is DRIVEN before anything trusts it: it must remove a
  // comment occurrence and must NOT remove a live-code occurrence. Without
  // this, a stripper that ate everything would make all eight bans below
  // pass on an empty string — an instrument that cannot go red.
  const probe = ['  // sentinel_probe_token', '  var x = "sentinel_probe_token";']
    .join('\n');
  const probeStripped = probe.split('\n')
    .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
    .join('\n');
  if ((probeStripped.match(/sentinel_probe_token/g) || []).length !== 1) {
    violations.push('[reading-door-retired] the comment stripper used by ' +
      'groups 16b-16e does not leave exactly one live occurrence of a ' +
      'token that appears once in a comment and once in code — every ban ' +
      'below is structurally unable to go red');
  }

  const RETIRED_APP = [
    { pat: 'function renderMemoirStation(',
      why: 'the reading-door station painter' },
    { pat: 'function paintMemoirPage(',
      why: 'the reading-door page painter' },
    { pat: "openStation('journal')",
      why: 'the reading-door station open route' },
    { pat: 'journal: renderMemoirStation',
      why: 'the painter-registry key' },
    { pat: "journal: 'room-obj-journal'",
      why: 'the station origin-object key' }
  ];
  // BY VALUE: the roster is consumed by a bare .forEach, so a vanished entry
  // would drop a ban with nothing going red.
  if (RETIRED_APP.length !== 5) {
    violations.push('[reading-door-retired] the retired-wiring roster holds ' +
      RETIRED_APP.length + ' entries — pinned at exactly 5 (two painters, ' +
      'the open route, the registry key, the origin key)');
  }
  RETIRED_APP.forEach(function (g) {
    const at = appCode.indexOf(g.pat);
    if (at !== -1) {
      violations.push('[reading-door-retired] ' + APP + ':' +
        lineOf(appCode, at) + " still carries '" + g.pat + "' — " + g.why +
        ' must stay removed (26.91 D-06: the reading book is retired; ' +
        'the blessings notebook is the single book)');
    }
  });
  // Neither client roster may LIST the journal object any more. Both are
  // asserted, not one: 26.9-01 added it to both, so a half-revert that left
  // it in FUNCTIONAL_IDS would leave a move-but-not-remove entry for an
  // object that does not exist.
  [
    { re: /var ROOM_OBJECT_IDS = \[([^\]]*)\]/, name: 'ROOM_OBJECT_IDS' },
    { re: /var FUNCTIONAL_IDS = \[([^\]]*)\]/, name: 'FUNCTIONAL_IDS' }
  ].forEach(function (roster) {
    const m = appCode.match(roster.re);
    if (!m) {
      violations.push('[reading-door-retired] ' + APP + ': ' + roster.name +
        ' roster not found — update this pin deliberately');
      return;
    }
    if (m[1].indexOf("'journal'") !== -1) {
      violations.push('[reading-door-retired] ' + APP + ': ' + roster.name +
        " must not list 'journal' — the reading book is retired (26.91 " +
        'D-06). This was a REQUIREMENT under 26.9 D-18 and is now a BAN.');
    }
  });
  // index.html: the room object button is gone from the bench.
  const at = htmlCode.indexOf('id="room-obj-journal"');
  if (at !== -1) {
    violations.push('[reading-door-retired] ' + HTML + ':' +
      lineOf(htmlCode, at) + ' still carries id="room-obj-journal" — the ' +
      'reading book must not exist as a room object button (26.91 D-06)');
  }
})();

// ---- 16c. THE ROSTER COUNTS MOVE TOGETHER (26.9-01, boundary edge) ----------
// ---- PINS MOVED 26.91-04 (D-06, 2026-08-07): 10 -> 9, 5 -> 4, 5 -> 4 -------
//
// Four counts that must agree, asserted IN THE SAME RUN. A count alone is
// satisfied by a stray attribute and an identity alone is satisfied by a
// half-wired roster, so each count is asserted beside the identity it
// counts. If a later phase adds a tenth object it must move all four.
//
// DISPOSITION: pins moved, deliberately. The `data-cls === EXPECT` check
// here is the SECOND, INDEPENDENT copy of the count also pinned at
// test_no_push.cjs's `[layout]` check. That redundancy was DRIVEN this plan
// rather than assumed: with the removal landed and only test_no_push's pin
// moved to 9, THIS suite was still red on its own data-cls pin. Recorded in
// 26.91-04-SUMMARY.md.
//
// The `'journal'`-in-the-roster check is RE-INVERTED, not deleted: 26.9 D-18
// REQUIRED it, 26.91 D-06 BANS it. Same assertion site, opposite direction,
// arc stated.

(function () {
  // 26.999 (2026-08-25): 9 -> 10, deliberately — the card box (the
  // librarian's memory of you) joined the room by her design sitting, as
  // the trailing entry. The comment block above says a tenth object must
  // move all four counts; this is that move.
  // 26.99955-08 (2026-08-26): 10 -> 11, deliberately — the pen cup joined
  // the room by her ruling, as the trailing entry. It is the ONE door to
  // the activity log, which she ruled off the Manage dashboard and into the
  // room ("Only in the room"), and it takes the card box's fixture posture:
  // arrangeable, never removable.
  const EXPECT = 11;
  // The roster IN ITS SHIPPED ORDER. Deep-equal, not a length: a
  // rename or a reorder passes a count and fails here.
  const SURVIVORS = ['bookshelf', 'album', 'desk', 'candle', 'plant',
    'window', 'bench', 'chair', 'notebook', 'cardbox', 'pen-cup'];
  if (SURVIVORS.length !== EXPECT) {
    violations.push('[roster-counts] the SURVIVORS table holds ' +
      SURVIVORS.length + ' names but EXPECT is ' + EXPECT +
      ' — the two halves of this pin have drifted apart');
  }
  const roster = appCode.match(/var ROOM_OBJECT_IDS = \[([^\]]*)\]/);
  if (!roster) {
    violations.push('[roster-counts] ' + APP +
      ': ROOM_OBJECT_IDS not found — update this pin deliberately');
  } else {
    const ids = roster[1].match(/'[^']+'/g) || [];
    if (ids.length !== EXPECT) {
      violations.push('[roster-counts] ' + APP + ': ROOM_OBJECT_IDS holds ' +
        ids.length + ' ids — expected exactly ' + EXPECT +
        ' (the reading book was retired, 26.91 D-06)');
    }
    const plain = ids.map(function (s) { return s.slice(1, -1); });
    if (JSON.stringify(plain) !== JSON.stringify(SURVIVORS)) {
      violations.push('[roster-counts] ' + APP + ': ROOM_OBJECT_IDS is ' +
        JSON.stringify(plain) + ' — expected exactly ' +
        JSON.stringify(SURVIVORS) + '. The surviving nine keep their ' +
        'SHIPPED relative order; only the trailing entry was dropped.');
    }
    if (ids.indexOf("'journal'") !== -1) {
      violations.push('[roster-counts] ' + APP +
        ": ROOM_OBJECT_IDS must not include 'journal' — this assertion was " +
        'a REQUIREMENT under 26.9 D-18 and is a BAN under 26.91 D-06');
    }
  }
  const cls = htmlCode.match(/data-cls=/g) || [];
  if (cls.length !== EXPECT) {
    violations.push('[roster-counts] ' + HTML + ': ' + cls.length +
      ' data-cls attributes — expected exactly ' + EXPECT);
  }
  const reg = appCode.match(/var painters = \{[\s\S]*?\};/);
  const painters = reg ? (reg[0].match(/render\w+Station/g) || []) : [];
  if (painters.length !== 4) {
    violations.push('[roster-counts] ' + APP + ': the painter registry ' +
      'holds ' + painters.length + ' painters — expected exactly 4 ' +
      '(shelf, desk, album, notebook — the reading door left with 26.91 D-06)');
  }
  const origins = appCode.match(/var STATION_ORIGIN_OBJECTS = \{[\s\S]*?\};/);
  const originKeys = origins ? (origins[0].match(/^\s{4}\w+:/gm) || []) : [];
  if (originKeys.length !== 4) {
    violations.push('[roster-counts] ' + APP + ': STATION_ORIGIN_OBJECTS ' +
      'holds ' + originKeys.length + ' entries — expected exactly 4');
  }
})();

// ---- 16d. THE READING DOOR'S GEOMETRY IS GONE; THE NOTEBOOK'S SURVIVES -----
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) ---------------------------------
//
// DISPOSITION: rewritten, not deleted. 26.9-01 authored this group to pin
// (a) STATION_JOURNAL_GEOM.empty byte-identical to the SHIPPED
// STATION_NOTEBOOK_GEOM.invite, and (b) the recovered-but-dead `pile` rect.
// 26.91 D-06 removed the whole geometry table with the station, so both
// original assertions have no subject left.
//
// The group's real value SURVIVES the removal and is what it now asserts:
// the empty/invite box was SHARED, and the notebook still needs its half.
// A removal that took the notebook's invite slot with it — or moved it —
// would break a surface this plan never meant to touch. That is exactly the
// blast-radius question a removal has to answer, so this group answers it:
//   * STATION_JOURNAL_GEOM is ABSENT;
//   * STATION_NOTEBOOK_GEOM.invite is PRESENT and still {96,92,192,32};
//   * paintMemoirPage is ABSENT (so the dead-`pile` pin has no subject and
//     is retired WITH its reason stated, not silently dropped);
//   * STATION_SURFACES still has no `journal` key — now trivially true, and
//     LABELLED as trivially true rather than counted as evidence.

(function () {
  function geomBlock(name) {
    const m = appCode.match(
      new RegExp('var ' + name + ' = \\{[\\s\\S]*?\\n  \\};'));
    return m ? m[0] : null;
  }
  function slot(block, key) {
    if (!block) { return null; }
    const m = block.match(new RegExp(
      '\\n\\s*' + key + ':\\s*\\{([^}]*)\\}'));
    if (!m) { return null; }
    const out = {};
    (m[1].match(/(\w+):\s*(-?\d+)/g) || []).forEach(function (pair) {
      const kv = pair.split(':');
      out[kv[0].trim()] = Number(kv[1]);
    });
    return out;
  }
  if (geomBlock('STATION_JOURNAL_GEOM') !== null) {
    violations.push('[reading-door-geom] ' + APP +
      ': STATION_JOURNAL_GEOM still exists — the reading door was retired ' +
      'whole (26.91 D-06); its geometry table is not carried forward');
  }
  // The SURVIVING half of the shared box. This is the blast-radius pin: the
  // notebook's invite slot must not have been taken or moved by the removal.
  const invite = slot(geomBlock('STATION_NOTEBOOK_GEOM'), 'invite');
  if (!invite) {
    violations.push('[reading-door-geom] ' + APP +
      ': STATION_NOTEBOOK_GEOM.invite not found — the reading book\'s ' +
      'removal took the NOTEBOOK\'s invite slot with it, which is a ' +
      'surface 26.91-04 never meant to touch');
  } else if (JSON.stringify(invite) !== '{"x":96,"y":92,"w":192,"h":32}') {
    violations.push('[reading-door-geom] ' + APP +
      ': STATION_NOTEBOOK_GEOM.invite moved to ' + JSON.stringify(invite) +
      ' — the shipped invite box is unchanged by a removal elsewhere');
  }
  // The dead-`pile` pin is retired with its subject; stated, not dropped.
  if (appCode.indexOf('function paintMemoirPage(') !== -1) {
    violations.push('[reading-door-geom] ' + APP +
      ': paintMemoirPage still exists — 26.9-01\'s dead-`pile` pin was ' +
      'scoped to this painter and 26.91 D-06 removed it. If the painter is ' +
      'back, restore that pin deliberately rather than leaving it unguarded.');
  }
  // PRESERVATION PIN, labelled: this passed before 26.91 did anything and
  // passes now for a second reason. It cannot prove any of this plan's work.
  const surf = appCode.match(/var STATION_SURFACES = \{[^}]*\}/);
  if (!surf) {
    violations.push('[reading-door-geom] ' + APP +
      ': STATION_SURFACES not found');
  } else if (surf[0].indexOf('journal') !== -1) {
    violations.push('[reading-door-geom] ' + APP + ': STATION_SURFACES ' +
      'names journal — station candle slots exist where the librarian ' +
      'works (the shelf and the desk), and there is no reading-door ' +
      'station at all as of 26.91 D-06');
  }
})();

// ---- 16e. THE ONE-BOOK CONTRACT --------------------------------------------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) from the D-21 TWO-BOOK pin ------
//
// DISPOSITION: rewritten, not deleted. 26.9-02 authored this group around the
// sentence "the notebook remembers; the reading book is where you are reading
// right now." 26.91 D-06 collapses that to ONE book: there is no reading book,
// so there is no distinctness to keep. The group keeps its identity and now
// asserts the one-book state — which is the SAME question (which book is
// which) with the answer the owner gave on 2026-08-07.
//
// Four pins, each checked INDEPENDENTLY and each an EQUALITY where it counts
// a thing — `=== 1`, `=== 2`, never a floor. A floor here is a zone so broad
// nothing fires.
//
// HONESTY ABOUT WHAT EACH ONE CAN PROVE:
//   (1) BINDS. The two retired painters must be absent, and — the part a bare
//       absence ban cannot do — the DECO tokens they were fenced from must
//       still be fenced out of every SURVIVING station painter except the
//       notebook's. Deleting a function is not the same as proving nothing
//       else picked its job up.
//   (2) BINDS, re-inverted. The reading book's room object and BOTH its
//       reader-facing strings are gone from index.html.
//   (3) BINDS, unchanged from 26.9-02. renderRoomObjects still holds exactly
//       ONE hidden predicate and it is the album's. Unrelated to the removal
//       and deliberately left alone — a removal must not quietly widen a
//       neighbouring guard.
//   (4) PRESERVATION PIN, labelled: STATION_SURFACES === 2 passed before this
//       plan and passes after. It cannot prove any of 26.91-04's work.

(function () {
  function fnBody(name) {
    const sig = 'function ' + name + '(';
    const start = appCode.indexOf(sig);
    if (start === -1) { return null; }
    let i = appCode.indexOf('{', start);
    let depth = 0;
    for (; i < appCode.length; i++) {
      if (appCode[i] === '{') { depth++; }
      else if (appCode[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return appCode.slice(start, i);
  }

  // (1) The two retired painters are gone — AND their decoration fence did
  //     not migrate to a surviving painter. 26.9's editor is the NOTEBOOK's
  //     alone (D-21 / D-35), and that stays true with the reading book gone.
  const DECO_TOKENS = ['page-deco', 'deco-entry', 'design-entry',
    'sticker-tin', 'station-tin'];
  ['renderMemoirStation', 'paintMemoirPage'].forEach(function (fn) {
    if (fnBody(fn) !== null) {
      violations.push('[one-book] ' + APP + ': ' + fn + ' still exists — ' +
        '26.91 D-06 retired the reading book and both its painters');
    }
  });
  // The fence the deleted painters carried, re-asserted on what SURVIVES.
  // renderNotebookStation is the ONE painter allowed to touch these tokens.
  ['renderShelfStation', 'renderDeskStation', 'renderAlbumStation']
    .forEach(function (fn) {
      const body = fnBody(fn);
      if (body === null) {
        violations.push('[one-book] ' + APP + ': ' + fn + ' not found — the ' +
          'four-painter registry and this roster have drifted apart');
        return;
      }
      DECO_TOKENS.forEach(function (tok) {
        if (body.indexOf(tok) !== -1) {
          violations.push('[one-book] ' + APP + ': ' + fn + ' references `' +
            tok + '` — decoration is the NOTEBOOK\'s alone (D-21/D-35), and ' +
            'retiring the reading book does not release that fence to the ' +
            'other stations');
        }
      });
    });
  // ...and that fence is not vacuous. A ban roster whose tokens name nothing
  // in the file cannot go red for anyone — this repo's named defect class.
  // So the roster is split, BY VALUE, into the tokens that are real in app.js
  // and the tokens that are not.
  //
  // ⚠ INHERITED FINDING, recorded rather than quietly dropped: of the five
  // tokens 26.9-02 wrote, only `page-deco` and `station-tin` have ever
  // appeared in app.js. `deco-entry`, `design-entry` and `sticker-tin` named
  // nothing when that group was written and name nothing now. All five stay
  // in the ban (a ban may be broader than today's vocabulary), but only the
  // real two can carry the anti-vacuity argument, and pretending otherwise
  // would be exactly the "stated count nobody executed" shape 26.91-04 is
  // fixing elsewhere in this sweep.
  const DECO_TOKENS_REAL = ['page-deco', 'station-tin'];
  const reallyPresent = DECO_TOKENS.filter(function (t) {
    return appCode.indexOf(t) !== -1;
  });
  if (JSON.stringify(reallyPresent) !== JSON.stringify(DECO_TOKENS_REAL)) {
    violations.push('[one-book] ' + APP + ': the decoration tokens present ' +
      'in app.js are ' + JSON.stringify(reallyPresent) + ' — pinned BY ' +
      'VALUE at ' + JSON.stringify(DECO_TOKENS_REAL) + '. If a real token ' +
      'vanished, the fence above just lost the only teeth it had; if a ' +
      'dormant one became real, move this pin deliberately.');
  }
  if (!DECO_TOKENS_REAL.length) {
    violations.push('[one-book] ' + APP + ': no decoration token is real — ' +
      'the fence above cannot go red for any painter');
  }

  // (2) RE-INVERTED. 26.9-02 required #room-obj-journal to carry the
  //     reader-facing strings `the reading book` / `reading book` (naming
  //     route A: change the label, never the id). 26.91 D-06 bans the whole
  //     object, so all three assertions flip together. Comment-stripped:
  //     index.html's own 26.91-04 retirement note discusses this object.
  const bookTag = htmlCode.match(
    /<button[^>]*id="room-obj-journal"[\s\S]{0,400}?<\/button>/);
  if (bookTag) {
    violations.push('[one-book] ' + HTML +
      ': #room-obj-journal still exists — the reading book is retired');
  }
  ['aria-label="the reading book"',
    '<span class="room-label">reading book</span>'].forEach(function (s) {
    if (htmlCode.indexOf(s) !== -1) {
      violations.push('[one-book] ' + HTML + ': the reader-facing string ' +
        JSON.stringify(s) + ' survives — 26.9-02 REQUIRED it; 26.91 D-06 ' +
        'BANS it. Nothing in the room is named `reading book` any more.');
    }
  });

  // (3) UNCHANGED from 26.9-02, deliberately. `renderRoomObjects` owns every
  //     hidden flag and holds EXACTLY ONE predicate — the album's. A removal
  //     must never widen or narrow a neighbouring guard to accommodate
  //     itself, so this is left exactly as it was.
  const rro = fnBody('renderRoomObjects');
  if (rro === null) {
    violations.push('[one-book] ' + APP + ': renderRoomObjects not found');
  } else {
    const hiddenWrites = rro.match(/\.hidden\s*=/g) || [];
    if (hiddenWrites.length !== 1) {
      violations.push('[one-book] ' + APP + ': renderRoomObjects holds ' +
        hiddenWrites.length + ' `hidden` predicates — expected EXACTLY 1 ' +
        '(the album\'s consolidationOn && hasImage)');
    }
    if (rro.indexOf('room-obj-album') === -1) {
      violations.push('[one-book] ' + APP + ': the one `hidden` ' +
        'predicate in renderRoomObjects is not the ALBUM\'s — the count ' +
        'and the identity move together or this group fails');
    }
    if (rro.indexOf('room-obj-journal') !== -1) {
      violations.push('[one-book] ' + APP + ': renderRoomObjects names ' +
        'the retired reading-book object');
    }
  }

  // (2b) THE EMPTY BENCH IS THE DESIGN — asserted POSITIVELY as well as
  //      negatively, because "the book node is gone" is equally true of a
  //      room that lost the bench with it. The cushion still paints and its
  //      surface span is byte-unchanged; the reading book seated on it
  //      (--y:138 + --h:14 = 152 = the cushion top), so a removal that
  //      disturbed the seat would be invisible to every ban above.
  //
  //      NO PLACEHOLDER, NO MARKER. This is the room state that shipped for
  //      every phase before 26.9 — nothing says something used to be here.
  const bench = htmlCode.match(
    /<button[^>]*id="room-obj-bench"[\s\S]{0,500}?<\/button>/);
  if (!bench) {
    violations.push('[one-book] ' + HTML + ': #room-obj-bench is missing — ' +
      'retiring the book that SAT on the bench must not take the bench');
  } else {
    if (bench[0].indexOf('style="--x:124;--y:152;--w:88;--h:16"') === -1) {
      violations.push('[one-book] ' + HTML + ': the bench moved — its ' +
        'shipped position is pinned BY VALUE because the reading book was ' +
        'seated on its cushion, and a removal may only ever free space');
    }
    if (bench[0].indexOf('<span class="room-label">bench</span>') === -1) {
      violations.push('[one-book] ' + HTML + ': the bench lost its label');
    }
  }
  if (!/\{ x0: 124, x1: 212, y: 152 \}/.test(appCode)) {
    violations.push('[one-book] ' + APP + ': the bench cushion surface span ' +
      '{x0:124, x1:212, y:152} is gone from SCENE.surfaces — the seat the ' +
      'reading book rested on is unchanged by its removal (APPEND-ONLY, ' +
      'Pitfall 3: entries are never reordered or dropped)');
  }
  // ...and nothing marks the absence. Banned over LIVE markup only.
  //
  // ⚠ THE ROSTER IS UNAMBIGUOUS READER-FACING PROSE, AND NOTHING ELSE.
  // The first draft of this ban listed the bare word `placeholder` and went
  // RED ON SHIPPED, CORRECT MARKUP: index.html carries three legitimate
  // `placeholder="..."` input attributes. That is the same over-broad-ban
  // failure the `set out` / `set out for you` pair guards against, caught
  // here by driving the ban rather than reading it. So the roster carries
  // only phrases that can only ever be copy narrating an absence, and the
  // legitimate attribute is asserted ALLOWED below.
  const ABSENCE_COPY = ['used to be here', 'coming soon',
    'no longer available', 'nothing here any more'];
  if (ABSENCE_COPY.length !== 4) {
    violations.push('[one-book] the absence-copy roster holds ' +
      ABSENCE_COPY.length + ' phrases — pinned BY VALUE at 4');
  }
  const lowerHtml = htmlCode.toLowerCase();
  ABSENCE_COPY.forEach(function (s) {
    // driven: the matcher must find the phrase in a fixture containing it
    if (('x ' + s + ' y').indexOf(s) === -1) {
      violations.push('[one-book] the matcher for ' + JSON.stringify(s) +
        ' cannot match a fixture that contains it');
    }
    if (lowerHtml.indexOf(s) !== -1) {
      violations.push('[one-book] ' + HTML + ': the LIVE markup says ' +
        JSON.stringify(s) + ' — the empty bench IS the design. A room that ' +
        'narrates what it lost is a room state that got WORSE (law 3).');
    }
  });
  // THE POSITIVE CONTROL: the shipped `placeholder="` input attribute is
  // present in live markup and is NOT matched by any ban above.
  // ⚠ FLOOR LOWERED 3 → 2 by 26.96-02, deliberately and with the reason
  // recorded. The roster add field left index.html for app.js's shared
  // roster renderer (two hosts cannot share a global id), taking its
  // placeholder with it. ⛔ This is a FIXTURE INVENTORY recalibration, not a
  // relaxation of any ban above: the bans are unchanged, and 2 live
  // placeholder attributes prove the scan is running over real markup
  // exactly as 3 did. The floor's stated job is to refuse a drop to 0.
  const attrHits = htmlCode.split('placeholder="').length - 1;
  if (attrHits < 2) {
    violations.push('[one-book] ' + HTML + ': found ' + attrHits +
      ' shipped `placeholder="` input attributes — at least 2 are expected. ' +
      'If this drops to 0 the control below still passes while proving ' +
      'nothing about real markup.');
  }
  ABSENCE_COPY.forEach(function (s) {
    if ('placeholder="'.toLowerCase().indexOf(s) !== -1) {
      violations.push('[one-book] the absence-copy ban ' + JSON.stringify(s) +
        ' matches the shipped `placeholder="` attribute — the ban has been ' +
        'broadened past reader-facing prose and now fails correct markup');
    }
  });

  // (4) PRESERVATION PIN, labelled — see the header. Counts, so a THIRD
  //     station quietly acquiring a candle slot is caught.
  const surf2 = appCode.match(/var STATION_SURFACES = \{([^}]*)\}/);
  if (!surf2) {
    violations.push('[one-book] ' + APP + ': STATION_SURFACES not found');
  } else {
    const keys = surf2[1].match(/(\w+)\s*:/g) || [];
    if (keys.length !== 2) {
      violations.push('[one-book] ' + APP + ': STATION_SURFACES holds ' +
        keys.length + ' keys — expected EXACTLY 2 (shelf, desk). Station ' +
        'candle slots exist where the librarian works.');
    }
  }
})();

// ---- 16f. (G-A1) + (G-A2): THE REMOVAL, AS ONE CONJUNCTION -----------------
// ---- NEW in 26.91-04 (D-06, 2026-08-07) ------------------------------------
//
// G-A1 (the room lost the object) and G-A2 (the code lost the surface) are
// authored as ONE named group because separately they are both satisfiable
// by a rename.
//
// THE ATTACK THIS CLOSES, stated concretely and DRIVEN this plan: rename
// `renderMemoirStation` to `renderReadingStation`, restore it elsewhere, and
// re-add `journal: renderReadingStation` to the painter registry. Every bare
// ban on the OLD NAME is now satisfied — `grep -c 'function
// renderMemoirStation('` reads 0 — while the surface is fully alive again.
// Only the CONJUNCTION closes it: the painter COUNT moves from 4 to 5 even
// though no banned name appears. Driven and recorded in 26.91-04-SUMMARY.md:
// with the rename applied, this group's member 5 was the sole member to fire.
//
// So the members are asserted together, each reported by id, and the roster
// is pinned by value — a conjunction consumed by a bare .forEach would lose a
// member exactly the way a bare ban loses to a rename.
//
// Member 7 is a CROSS-FILE pin: it reads test_no_push.cjs's own data-cls
// literal, so "the count is pinned in two independent files" is a MEASURED
// fact rather than a claim. A future half-move that changes one pin and not
// the other fails here, in the file that did move.

(function () {
  const noPushSrc = fs.readFileSync(
    path.join(ROOT, 'tests', 'test_no_push.cjs'), 'utf8');
  const roster = appCode.match(/var ROOM_OBJECT_IDS = \[([^\]]*)\]/);
  const rosterIds = roster ? (roster[1].match(/'[^']+'/g) || []) : null;
  const reg = appCode.match(/var painters = \{[\s\S]*?\};/);
  const origins = appCode.match(/var STATION_ORIGIN_OBJECTS = \{[\s\S]*?\};/);
  const npPin = noPushSrc.match(/if \(cls\.length !== (\d+)\)/);

  const MEMBERS = [
    // 26.999 (2026-08-25): 9 -> 10 across G-A1.1/G-A1.3/G-A1.4 and the
    // SC-8 tables below, deliberately — the card box (the librarian's
    // memory of you) joined the room by her design sitting.
    // 26.99955-08 (2026-08-26): 10 -> 11 across the same three members and
    // the SC-8 tables — the pen cup, the activity log's one door, joined
    // the room by her ruling.
    { id: 'G-A1.1', what: 'ROOM_OBJECT_IDS holds exactly 11 ids',
      ok: rosterIds !== null && rosterIds.length === 11 },
    { id: 'G-A1.2', what: "'journal' is absent from ROOM_OBJECT_IDS",
      ok: rosterIds !== null && rosterIds.indexOf("'journal'") === -1 },
    { id: 'G-A1.3', what: 'index.html carries exactly 11 data-cls attributes',
      ok: (htmlCode.match(/data-cls=/g) || []).length === 11 },
    { id: 'G-A2.1', what: 'the painter registry holds exactly 4 painters',
      ok: reg !== null && (reg[0].match(/render\w+Station/g) || []).length === 4 },
    { id: 'G-A2.2',
      what: 'the painter registry holds NO `journal` key under ANY painter ' +
        'name — this is the member a rename cannot escape',
      ok: reg !== null && !/^\s*journal\s*:/m.test(reg[0]) },
    { id: 'G-A2.3',
      what: 'STATION_ORIGIN_OBJECTS holds exactly 4 entries and no `journal`',
      ok: origins !== null &&
        (origins[0].match(/^\s{4}\w+:/gm) || []).length === 4 &&
        !/^\s*journal\s*:/m.test(origins[0]) },
    { id: 'G-A2.4', what: "openStation('journal') is absent from live code",
      ok: !/openStation\(\s*['"]journal['"]\s*\)/.test(appCode) },
    { id: 'G-A1.4',
      what: 'the SECOND, independent data-cls pin (tests/test_no_push.cjs) ' +
        'also reads 11 — the redundancy is measured, not assumed',
      ok: npPin !== null && npPin[1] === '11' }
  ];

  if (MEMBERS.length !== 8) {
    violations.push('[G-A1/G-A2] the conjunction holds ' + MEMBERS.length +
      ' members — pinned BY VALUE at 8. It is consumed by a bare .forEach, ' +
      'so a dropped member would weaken the conjunction silently, which is ' +
      'the same failure mode the conjunction exists to prevent.');
  }
  const failed = MEMBERS.filter(function (m) { return !m.ok; });
  if (failed.length) {
    violations.push('[G-A1/G-A2] the reading book is not fully retired — ' +
      failed.length + ' of ' + MEMBERS.length + ' members failed: ' +
      failed.map(function (m) { return m.id + ' (' + m.what + ')'; })
        .join('; ') + '. These are asserted TOGETHER on purpose: a RENAME ' +
      'satisfies every bare ban on `renderMemoirStation` while leaving the ' +
      'surface alive, and only the conjunction — counts beside identities, ' +
      'across two files — closes that.');
  }
})();

// ---- 21. SC-8: NOTHING MOVED (26.98-07) ---------------------------------------
//
// Phase 26.98's SC-8: "every pinned coordinate, place(), the nine hotspots and
// the station board lines at y 56/104/152/200 are byte-unchanged from the
// phase's baseline." That stability is the ONLY reason a whole-room repaint
// could be contemplated this late — so it deserves a gate rather than a habit.
//
// COVERAGE BEFORE THIS GROUP, MEASURED not assumed: TWO of the nine room
// objects were pinned anywhere in the suites — the bench, in this file (the
// one-book group above, line ~1415) and in tests/test_sprite_geometry.py, and
// the chair, in test_sprite_geometry.py alone. SEVEN were pinned NOWHERE.
//
// ⛔ THIS PIN IS ADDITIVE. The two Python pins are deliberately NOT removed to
// "de-duplicate": a redundant pin across two suites is cheap, and a deleted pin
// is a silently widened gate. The consequence is intended — after this group a
// coordinate change must be updated in THREE files: index.html (the source),
// tests/test_sprite_geometry.py (the bench and chair pins), and this file (the
// nine-object table). Changing a coordinate and updating only one of the three
// now fails here.
//
// THE FIVE ANTI-VACUITY ANSWERS:
//
//  1. CAN IT PASS BEFORE THE WORK? No — seven of the nine objects were pinned
//     nowhere, so seven of these nine rows did not exist to be satisfied.
//  2. CAN IT PASS AFTER A DELIBERATE BREAK? No. Driven RED three ways this
//     wave and recorded verbatim in 26.98-07-SUMMARY.md: (a) one coordinate
//     moved by ONE pixel on an object that was NOT already pinned in
//     test_sprite_geometry.py — the plant — so the red proves the NEW table
//     rather than a pre-existing pin; (b) one board-line number changed in the
//     GENERATOR ONLY, leaving the app's array alone, which only the cross-file
//     AGREEMENT assertion can catch; (c) a stray declaration added to the
//     welcome-back block, which the hash comparison catches by name.
//  3. WOULD A DEGENERATE IMPLEMENTATION PASS? No. The table's length is pinned
//     BY VALUE at 9 and the count of room-object buttons in the markup is
//     pinned BY VALUE at 9, both BEFORE any row is read, so an extractor that
//     matched nothing fails instead of comparing nothing. The keyframe and
//     welcome-back comparisons pin their found-counts before hashing, the same
//     way test_session_flow.cjs does.
//  4. DOES IT READ EVALUATION OR SOURCE? Evaluation, in the sense that matters
//     here: every value is PARSED OUT OF THE SHIPPED FILE — index.html, app.js,
//     tools/gen_room_sprites.py, tokens.css — rather than restated from a
//     document. Nothing here trusts a plan, a summary or a comment.
//  5. COULD A COMMENT SATISFY IT? No. Every comparison is an equality against a
//     literal, and the app.js and generator scans run over COMMENT-STRIPPED
//     source (the generator's own line 777 comment restates the four board
//     numbers verbatim — a raw scan would be self-satisfying).
//
// ⚠ THE BOARD LINES ARE PINNED IN BOTH PLACES THEY EXIST, AND AGAINST EACH
// OTHER. A pin on the app's array alone passes a phase that moved the
// generator's tuple, silently desynchronising the DRAWN board from the SEATED
// spine; a pin on the generator alone has the same hole facing the other way.
// The invariant is their AGREEMENT, so that is what is asserted.
(function () {
  const cp = require('child_process');
  const crypto = require('crypto');
  const G = 'SC-8';
  function fail(msg) { violations.push('[' + G + '] ' + msg); }

  // ---- (a) the nine room-object coordinates, as one name-to-literal table ----
  //
  // Measured verbatim out of index.html this wave. The tenth object — the
  // reading book — was RETIRED by 26.91-04; its return would be a regression,
  // not a restoration, which is why the button count is pinned at 9 too.
  const COORDS = [
    ['bookshelf', '--x:16;--y:56;--w:72;--h:112'],
    ['album', '--x:140;--y:140;--w:40;--h:28'],
    ['desk', '--x:216;--y:112;--w:120;--h:56'],
    ['notebook', '--x:264;--y:94;--w:28;--h:22'],
    // 26.999 (2026-08-25): the card box — her design sitting's spot and
    // object, seated on the desk line (88 + 28 = 116) beside the notebook.
    ['cardbox', '--x:226;--y:88;--w:30;--h:28'],
    // 26.99955-08 (2026-08-26, her ruling): the pen cup — the ONE door to
    // the activity log, seated on the desk line (94 + 22 = 116) immediately
    // right of the candle (300-310), which is her spot: "On the desk, near
    // the candle."
    ['pen-cup', '--x:314;--y:94;--w:14;--h:22'],
    ['chair', '--x:250;--y:90;--w:52;--h:78'],
    ['candle', '--x:300;--y:94;--w:10;--h:22'],
    ['plant', '--x:348;--y:124;--w:26;--h:44'],
    ['window', '--x:124;--y:44;--w:88;--h:88'],
    ['bench', '--x:124;--y:152;--w:88;--h:16']
  ];

  // ⛔ PINNED BY VALUE BEFORE A SINGLE ROW IS READ. A table that lost rows
  // would otherwise iterate over what remained and report a clean pass.
  if (COORDS.length !== 11) {
    fail('the coordinate table holds ' + COORDS.length + ' rows — pinned BY ' +
      'VALUE at 11 (26.999: + the card box; 26.99955-08: + the pen cup), ' +
      'one per shipped room object. A dropped row is a silently ' +
      'widened gate, which is the failure this whole group exists to stop.');
  }
  const roomButtons = htmlCode.match(/<button[^>]*id="room-obj-[a-z-]+"/g) || [];
  if (roomButtons.length !== 11) {
    fail(HTML + ': the markup carries ' + roomButtons.length + ' room-object ' +
      'buttons — pinned BY VALUE at 11 (26.999: + the card box, her design ' +
      'sitting; 26.99955-08: + the pen cup, her activity-log ruling). A ' +
      'twelfth is an object nobody decided (the retired ' +
      'reading book\'s return would be one); an eleventh missing is an ' +
      'object that left without a decision.');
  }
  COORDS.forEach(function (row) {
    const name = row[0];
    const want = row[1];
    const tag = htmlCode.match(
      new RegExp('<button[^>]*id="room-obj-' + name + '"[^>]*>'));
    if (!tag) {
      fail(HTML + ': #room-obj-' + name + ' is missing from the markup — ' +
        'SC-8 says every hotspot is byte-unchanged from the phase baseline');
      return;
    }
    if (tag[0].indexOf('style="' + want + '"') === -1) {
      fail(HTML + ': #room-obj-' + name + ' MOVED. SC-8 pins it BY VALUE at ' +
        'style="' + want + '" and the shipped tag does not carry that exact ' +
        'attribute. A coordinate change is a three-file change: ' + HTML +
        ', tests/test_sprite_geometry.py and this suite — deliberately, so ' +
        'moving a hotspot cannot be a one-line accident.');
    }
  });

  // ---- (b) the station board lines, in BOTH tables, and their agreement -----
  const BOARD_YS = [56, 104, 152, 200];
  if (BOARD_YS.length !== 4) {
    fail('the board-line literal holds ' + BOARD_YS.length + ' entries — ' +
      'pinned BY VALUE at 4');
  }
  const genPath = path.join(ROOT, 'tools', 'gen_room_sprites.py');
  let genCode = null;
  try {
    // COMMENT-STRIPPED: the generator's own header comment (line ~777)
    // restates "STATION_BOARD_YS = [56,104,152,200]" verbatim, so a raw scan
    // would be satisfied by prose describing the very thing it must measure.
    genCode = fs.readFileSync(genPath, 'utf8')
      .split('\n')
      .map(function (l) { return l.replace(/^(\s*)#.*$/, '$1'); })
      .join('\n');
  } catch (e) {
    fail('tools/gen_room_sprites.py could not be read, so the cross-file ' +
      'board-line agreement cannot be measured (' + e.message + ')');
  }
  const appBoard = appCode.match(/var STATION_BOARD_YS = \[([^\]]*)\]/);
  const genBoard = genCode === null ? null
    : genCode.match(/for j,by in enumerate\(\(([^)]*)\)\)/);
  function ints(m) {
    return m === null ? null
      : (m[1].match(/-?\d+/g) || []).map(function (s) { return parseInt(s, 10); });
  }
  const appYs = ints(appBoard);
  const genYs = ints(genBoard);
  if (appYs === null) {
    fail(APP + ': STATION_BOARD_YS not found in live code — the DOM rail ' +
      'lines the drawn boards must coincide with have no definition to pin');
  }
  if (genYs === null) {
    fail('tools/gen_room_sprites.py: the drawn board loop ' +
      '`for j,by in enumerate((...))` not found in live code — the generator ' +
      'side of the agreement has nothing to compare');
  }
  function sameInts(a, b) {
    return a !== null && b !== null && a.length === b.length &&
      a.every(function (v, i) { return v === b[i]; });
  }
  if (appYs !== null && !sameInts(appYs, BOARD_YS)) {
    fail(APP + ': STATION_BOARD_YS reads [' + appYs.join(', ') + '] — SC-8 ' +
      'pins it BY VALUE at [' + BOARD_YS.join(', ') + ']');
  }
  if (genYs !== null && !sameInts(genYs, BOARD_YS)) {
    fail('tools/gen_room_sprites.py: the drawn board tops read [' +
      genYs.join(', ') + '] — SC-8 pins them BY VALUE at [' +
      BOARD_YS.join(', ') + ']');
  }
  if (appYs !== null && genYs !== null && !sameInts(appYs, genYs)) {
    fail('THE DRAWN BOARD AND THE SEATED SPINE HAVE DESYNCHRONISED — ' +
      APP + ' says [' + appYs.join(', ') + '] and ' +
      'tools/gen_room_sprites.py draws to [' + genYs.join(', ') + ']. This ' +
      'is the assertion no single-file pin can make: the GEOMETRY CONTRACT ' +
      'is that the .station-board divs and the drawn boards coincide, so ' +
      'agreement between the two tables IS the invariant.');
  }

  // ---- (c) place() — the station-layout helper and the album-spread helper --
  //
  // SC-8's "place()" does NOT mean the room's layout: room objects are
  // positioned by pure CSS from the --x/--y/--w/--h custom properties pinned
  // above. It means the two local layout helpers — renderDeskStation's and
  // paintAlbumSpread's. Both the DEFINITION and the CALL-SITE COUNT are
  // pinned: a rename or a deleted call site is exactly the quiet change SC-8
  // exists to catch, and a definition that survives with its calls removed is
  // a layout that stopped being applied.
  const PLACE_HOSTS = [
    // 26.999 same evening: 7 -> 6 — the album art moved INSIDE the stack
    // door (an img child, no place() of its own), by her seen-not-read
    // ruling. The six: stack, drawer, session, notebook, first-look, cardbox.
    // 26.99955-08 (2026-08-26): 6 -> 7 — the pen cup, the activity log's
    // one door, seated in the zoom too because her 26.9995-06 ruling says
    // the two windows agree about what is on the desk.
    { fn: 'renderDeskStation', calls: 7,
      what: 'the desk station layout (stack, drawer, session, notebook, ' +
        'the #150 first-look door, the 26.999 card box, the 26.99955-08 ' +
        'pen cup)' },
    { fn: 'paintAlbumSpread', calls: 5,
      what: 'the album spread layout (photo, caption, prev, next, pile)' }
  ];
  if (PLACE_HOSTS.length !== 2) {
    fail('the place() host table holds ' + PLACE_HOSTS.length +
      ' entries — pinned BY VALUE at 2');
  }
  PLACE_HOSTS.forEach(function (h) {
    const b = functionBody(appCode, APP, h.fn, G);
    if (b === null) { return; }   // functionBody already recorded the failure
    const defs = (b.text.match(/function place\(/g) || []).length;
    const all = (b.text.match(/(^|[^.A-Za-z0-9_$])place\(/g) || []).length;
    const calls = all - defs;
    if (defs !== 1) {
      fail(APP + ': ' + h.fn + ' declares ' + defs + ' local place() ' +
        'helpers — pinned BY VALUE at 1 (' + h.what + ')');
    }
    if (calls !== h.calls) {
      fail(APP + ': ' + h.fn + ' calls place() ' + calls + ' times — pinned ' +
        'BY VALUE at ' + h.calls + ' (' + h.what + '). A lost call site is a ' +
        'piece of the station that stopped being positioned, which renders ' +
        'as art drifting off its contract rather than as an error.');
    }
  });
  const placeDefs = (appCode.match(/function place\(/g) || []).length;
  if (placeDefs !== 9) {
    fail(APP + ' declares ' + placeDefs + ' place() helpers repo-wide — ' +
      'pinned BY VALUE at 9 this wave. This is the roster-level pin beneath ' +
      'the two named hosts: a helper appearing or vanishing elsewhere is a ' +
      'layout contract moving without a decision.');
  }

  // ---- (c2) the desk station's four fixture rects (26.9995-06) --------------
  //
  // STATION_DESK, pinned BY VALUE for the FIRST time. Measured at planning
  // time and RE-measured at execution (26.9995-06-GEOMETRY.md §6): before
  // this section STATION_DESK was pinned by value in NO test — the
  // desk-decor group parsed the four rects dynamically and pinned only
  // their COUNT, so a one-pixel fixture move that stayed disjoint from
  // everything passed every suite in the repo. Ruling 3 (2026-08-25) made
  // fixture moves a deliberate act; a pin that follows whatever the code
  // says is not a pin — it is the defect this project has paid for five
  // times.
  //
  // THE FIVE ANTI-VACUITY ANSWERS, for this section:
  //  1. CAN IT PASS BEFORE THE WORK? No — STATION_DESK was pinned nowhere
  //     (grep measured and recorded in 26.9995-06-GEOMETRY.md §6).
  //  2. CAN IT PASS AFTER A DELIBERATE BREAK? No — driven RED twice in
  //     26.9995-06: (a) stack.x moved 80 -> 81 in app.js alone; (b) the
  //     generator's geometry-contract comment moved drawer 240 -> 241 with
  //     app.js untouched, which ONLY the cross-file agreement below can
  //     catch. Both failures recorded verbatim in 26.9995-06-SUMMARY.md.
  //  3. WOULD A DEGENERATE IMPLEMENTATION PASS? No — the pin table's length
  //     AND the parsed-row count are both pinned BY VALUE at 4 before a
  //     single rect is compared, so an extractor that matched nothing fails
  //     instead of comparing nothing.
  //  4. DOES IT READ EVALUATION OR SOURCE? The found values are PARSED OUT
  //     OF THE SHIPPED app.js — never restated from a plan or a summary.
  //  5. COULD A COMMENT SATISFY IT? No — the app.js scan is
  //     comment-stripped, and that matters HERE specifically: 26.9995-06's
  //     retained-predecessor comment beside the relocated desk decor
  //     restates rect literals in prose, and a raw scan could read those.
  //     The GENERATOR side is prose BY DESIGN (its geometry contract is a
  //     comment), so it is read RAW — but it is only ever compared AGAINST
  //     the stripped app.js values: prose can FAIL the agreement, never
  //     satisfy the app.js pin.
  //
  // ⚠ THE CONTRACT IS PINNED IN BOTH PLACES IT EXISTS, AND AGAINST EACH
  // OTHER — the board-line posture above, in the same shape. The
  // generator's desk-station header states the drawn affordances in
  // 384-space (drawer face, session mat, notebook blank, slab top line);
  // app.js seats DOM rects over that art. A pin on app.js alone passes a
  // phase that redrew the plate somewhere else, silently desynchronising
  // the DRAWN affordance from the SEATED element; the agreement IS the
  // invariant, exactly as SC-8 already asserts for the shelf boards.
  const DESK_RECTS = [
    ['stack', { x: 80, y: 96, w: 56, h: 26 }],
    ['drawer', { x: 240, y: 150, w: 84, h: 44 }],
    ['session', { x: 12, y: 96, w: 60, h: 24 }],
    // 26.999 (2026-08-25 night, her desk pass): the notebook seat GREW to
    // wear the room's own notebook.png at the station's 2x (28x22 room
    // units -> 56x44), bottom on the slab line 120 — "the blessing
    // journal is not matched with the journal in the room looks werid".
    // The plate's drawn blank mat (160..200 x 106..120) stays in the art,
    // fully covered by the seated sprite. Predecessor, retained:
    // { x: 160, y: 100, w: 40, h: 20 } (the blank-mat seat).
    ['notebook', { x: 146, y: 76, w: 56, h: 44 }],
    // #150 (2026-08-25, her ruling): the guided first pass's one door — a
    // label-only seat on the wall above the slab. WIDENED deliberately,
    // the three-file change this pin exists to force (app.js, this row,
    // the generator's geometry-contract comment).
    // 26.999 (2026-08-25, her ruling from the built room): the first-look
    // door MOVED to the desk line as the paper-stack visual. Predecessor,
    // retained: { x: 112, y: 24, w: 160, h: 24 } (wall seat, label-only).
    ['firstlook', { x: 316, y: 92, w: 48, h: 28 }],
    // 26.999 (2026-08-25): the card box — the librarian's memory of you,
    // her design sitting. The same deliberate three-file widening as
    // #150's row (app.js, this row, the generator's contract comment).
    ['cardbox', { x: 204, y: 64, w: 60, h: 56 }],
    // 26.99955-08 (2026-08-26, her ruling): the pen cup — the activity
    // log's one door, in the zoom as well as the room (her 26.9995-06
    // two-windows ruling). Seated in the gap between the card box (ends
    // 264) and the hosted candle slot (starts 300), bottom on the slab
    // line 120. The same deliberate three-file widening as the card box's
    // row (app.js, this row, the generator's contract comment).
    //
    // ⚠⚠ THIS ROW EXPOSED A REAL HOLE IN THIS GROUP, AND THE HOLE IS FIXED
    // BELOW. When app.js gained `pencup:` and this table had not, the
    // extractor's name alternation did not match the new key — so `sdCount`
    // stayed 6, the count pin compared 6 against 6, and THE WHOLE GROUP
    // PASSED OVER A FIXTURE IT HAD NEVER SEEN. Measured, not theorised: the
    // suite was run in exactly that state during 26.99955-08 and reported
    // no STATION_DESK violation at all. That is the narrowed-lift lesson
    // firing in the direction nobody was watching — a lift that comes up
    // SHORT printing a clean count — so the alternation is now derived from
    // this table rather than hand-kept beside it.
    ['pencup', { x: 268, y: 76, w: 28, h: 44 }]
  ];
  // ⛔ PINNED BY VALUE BEFORE A SINGLE ROW IS READ (the COORDS posture).
  if (DESK_RECTS.length !== 7) {
    fail('the STATION_DESK pin table holds ' + DESK_RECTS.length +
      ' rows — pinned BY VALUE at 7 (stack, drawer, session, notebook, ' +
      'firstlook — the fifth added by #150 — cardbox, the sixth added ' +
      'by 26.999, 2026-08-25, and pencup, the seventh added by ' +
      '26.99955-08, 2026-08-26). A dropped row is a silently widened gate.');
  }
  const sdAnchor = appCode.indexOf('var STATION_DESK = {');
  let sdBlock = null;
  if (sdAnchor !== -1) {
    let si = appCode.indexOf('{', sdAnchor);
    const sStart = si;
    let sDepth = 0;
    for (; si < appCode.length; si++) {
      if (appCode[si] === '{') { sDepth++; }
      else if (appCode[si] === '}') {
        sDepth--;
        if (sDepth === 0) { si++; break; }
      }
    }
    sdBlock = sDepth === 0 ? appCode.slice(sStart, si) : null;
  }
  const sdParsed = {};
  let sdCount = 0;
  if (sdBlock === null) {
    fail(APP + ': var STATION_DESK not found in comment-stripped source — ' +
      'the four fixture rects this pin exists to hold have no definition');
  } else {
    // ⛔ THE NAME IS A WILDCARD, NEVER A HAND-KEPT ALTERNATION (26.99955-08).
    // This used to read `(stack|drawer|session|notebook|firstlook|cardbox)`,
    // and a seventh fixture added to app.js simply did not match: the
    // extractor found the same six, the count pin compared 6 against 6, and
    // the group passed over a fixture nobody had pinned. Matching ANY key
    // and reconciling the SET against the pin table below is what makes an
    // unpinned fixture LOUD instead of invisible.
    const sdRe =
      /(\w+):\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)\s*\}/g;
    let sm;
    while ((sm = sdRe.exec(sdBlock)) !== null) {
      sdParsed[sm[1]] = { x: +sm[2], y: +sm[3], w: +sm[4], h: +sm[5] };
      sdCount++;
    }
    if (sdCount !== 7) {
      fail(APP + ': parsed ' + sdCount + ' STATION_DESK rects — pinned BY ' +
        'VALUE at 7 (26.999: + cardbox; 26.99955-08: + pencup). An ' +
        'extractor that matched fewer would compare fewer ' +
        'and pass over the fixture it missed (the narrowed-lift arm).');
    }
    // The SET reconciliation, both directions — a fixture app.js seats but
    // this table does not pin is exactly as bad as a row pinned for a
    // fixture that no longer exists.
    const sdSeen = Object.keys(sdParsed).sort();
    const sdWant = DESK_RECTS.map(function (r) { return r[0]; }).sort();
    if (sdSeen.join(',') !== sdWant.join(',')) {
      fail(APP + ': STATION_DESK seats [' + sdSeen.join(', ') + '] but this ' +
        'suite pins [' + sdWant.join(', ') + ']. Every desk fixture is ' +
        'pinned BY VALUE or it is not gated at all — an unpinned fixture ' +
        'can be moved a pixel at a time by anyone, which is the exact ' +
        'failure 26.9995-06 wrote this group to end.');
    }
    DESK_RECTS.forEach(function (row) {
      const name = row[0];
      const want = row[1];
      const got = sdParsed[name];
      if (!got) { return; } // the count pin above already went red
      if (got.x !== want.x || got.y !== want.y ||
          got.w !== want.w || got.h !== want.h) {
        fail(APP + ': STATION_DESK.' + name + ' MOVED — found {x: ' +
          got.x + ', y: ' + got.y + ', w: ' + got.w + ', h: ' + got.h +
          '}, pinned BY VALUE at {x: ' + want.x + ', y: ' + want.y +
          ', w: ' + want.w + ', h: ' + want.h + '}. Changing a desk ' +
          'fixture coordinate is now a THREE-FILE change — app.js, this ' +
          'suite, and the generator\'s geometry-contract comment ' +
          '(tools/gen_room_sprites.py, the desk-station header) — ' +
          'deliberately, so a moved working spot is a decision with its ' +
          'predecessor retained, never a one-line accident (26.9995-06).');
      }
    });
  }
  // The generator's stated contract, read RAW (it is prose by design) and
  // compared against the PARSED app.js values — the cross-file agreement
  // no single-file pin can make.
  let genRawSd = null;
  try {
    genRawSd = fs.readFileSync(genPath, 'utf8');
  } catch (e) {
    fail('tools/gen_room_sprites.py could not be read RAW, so the ' +
      'desk-station geometry contract cannot be compared (' + e.message +
      ')');
  }
  if (genRawSd !== null && sdCount === 7) {
    const gSlab = genRawSd.match(/slab top line y=(\d+)/);
    const gDrawer = genRawSd.match(
      /drawer face x (\d+)-(\d+) \/ y (\d+)-(\d+)/);
    const gSession = genRawSd.match(/session mat[\s#]+x (\d+)-(\d+)/);
    // 26.999 (night): the notebook is a sprite-seat now — the room's
    // notebook.png at 2x over the retained drawn mat — so its contract
    // line states x AND y, the cardbox's shape, no longer the drawn
    // blank's x-span alone.
    const gNotebook = genRawSd.match(
      /notebook seat x (\d+)-(\d+) \/ y (\d+)-(\d+)/);
    // #150: the first-look seat, stated in the same contract — label-only,
    // nothing drawn, but the SEAT is agreed between the two files exactly
    // like the drawn four (x and y both, since no slab line anchors it).
    const gFirstlook = genRawSd.match(
      /first-look seat x (\d+)-(\d+) \/ y (\d+)-(\d+)/);
    // 26.999: the card-box seat, stated in the same contract — the sprite
    // is its own render, but the SEAT is agreed between the two files
    // exactly like the first-look's (x and y both).
    const gCardbox = genRawSd.match(
      /card-box seat x (\d+)-(\d+) \/ y (\d+)-(\d+)/);
    // 26.99955-08: the pen-cup seat, stated in the same contract — the
    // sprite is its own render, so nothing is drawn for it, but the SEAT is
    // agreed between the two files exactly like the card box's.
    const gPencup = genRawSd.match(
      /pen-cup seat x (\d+)-(\d+) \/ y (\d+)-(\d+)/);
    // ⛔ A CONTRACT LINE THAT CANNOT BE FOUND FAILS — it never skips. A
    // reworded contract is a contract that quietly stopped being true
    // (26.98-07's own finding about the shelf boards).
    if (!gSlab || !gDrawer || !gSession || !gNotebook || !gFirstlook ||
        !gCardbox || !gPencup) {
      fail('tools/gen_room_sprites.py: the desk-station geometry-contract ' +
        'comment could not be parsed (slab ' + !!gSlab + ', drawer ' +
        !!gDrawer + ', session ' + !!gSession + ', notebook ' +
        !!gNotebook + ', firstlook ' + !!gFirstlook + ', cardbox ' +
        !!gCardbox + ', pencup ' + !!gPencup +
        ') — a contract that cannot be read cannot be ' +
        'agreed with, and a comparison of nothing passes');
    } else {
      const agree = [
        ['drawer x0', +gDrawer[1], sdParsed.drawer.x],
        ['drawer x1', +gDrawer[2], sdParsed.drawer.x + sdParsed.drawer.w],
        ['drawer y0', +gDrawer[3], sdParsed.drawer.y],
        ['drawer y1', +gDrawer[4], sdParsed.drawer.y + sdParsed.drawer.h],
        ['session x0', +gSession[1], sdParsed.session.x],
        ['session x1', +gSession[2], sdParsed.session.x + sdParsed.session.w],
        ['notebook x0', +gNotebook[1], sdParsed.notebook.x],
        ['notebook x1', +gNotebook[2],
          sdParsed.notebook.x + sdParsed.notebook.w],
        ['notebook y0', +gNotebook[3], sdParsed.notebook.y],
        ['notebook y1', +gNotebook[4],
          sdParsed.notebook.y + sdParsed.notebook.h],
        ['slab line = session bottom', +gSlab[1],
          sdParsed.session.y + sdParsed.session.h],
        ['slab line = notebook bottom', +gSlab[1],
          sdParsed.notebook.y + sdParsed.notebook.h],
        ['firstlook x0', +gFirstlook[1], sdParsed.firstlook.x],
        ['firstlook x1', +gFirstlook[2],
          sdParsed.firstlook.x + sdParsed.firstlook.w],
        ['firstlook y0', +gFirstlook[3], sdParsed.firstlook.y],
        ['firstlook y1', +gFirstlook[4],
          sdParsed.firstlook.y + sdParsed.firstlook.h],
        ['cardbox x0', +gCardbox[1], sdParsed.cardbox.x],
        ['cardbox x1', +gCardbox[2],
          sdParsed.cardbox.x + sdParsed.cardbox.w],
        ['cardbox y0', +gCardbox[3], sdParsed.cardbox.y],
        ['cardbox y1', +gCardbox[4],
          sdParsed.cardbox.y + sdParsed.cardbox.h],
        ['pencup x0', +gPencup[1], sdParsed.pencup.x],
        ['pencup x1', +gPencup[2],
          sdParsed.pencup.x + sdParsed.pencup.w],
        ['pencup y0', +gPencup[3], sdParsed.pencup.y],
        ['pencup y1', +gPencup[4],
          sdParsed.pencup.y + sdParsed.pencup.h]
      ];
      if (agree.length !== 24) {
        fail('the desk-station agreement table holds ' + agree.length +
          ' comparisons — pinned BY VALUE at 24 (10 + the #150 first-look ' +
          'seat\'s four + the 26.999 card-box seat\'s four + the notebook ' +
          'seat\'s y pair, added 26.999 night when the notebook became a ' +
          'sprite-seat + the 26.99955-08 pen-cup seat\'s four)');
      }
      agree.forEach(function (a) {
        if (a[1] !== a[2]) {
          fail('THE DRAWN DESK AND THE SEATED FIXTURES HAVE ' +
            'DESYNCHRONISED — ' + a[0] + ': tools/gen_room_sprites.py ' +
            'states ' + a[1] + ' and app.js seats ' + a[2] + '. The ' +
            'GEOMETRY CONTRACT is that the DOM rects and the drawn ' +
            'affordances coincide (26.9995-06-GEOMETRY.md §3 measured ' +
            'them coinciding), so agreement between the two files IS the ' +
            'invariant — the assertion no single-file pin can make.');
        }
      });
    }
  }

  // ---- (d) the Phase 25 welcome-back, hashed against the phase baseline ----
  //
  // ⛔ THE BASELINE COMMIT IS RESOLVED FROM THE PHASE RECORD — never HEAD~n,
  // never a merge-base, never a guess. ANOTHER LIVE SESSION COMMITS TO THIS
  // TREE, so a relative reference resolves to a different commit on a
  // different day and the comparison silently measures nothing. Missing line
  // or unresolvable SHA fails LOUDLY naming the file. There is no fallback.
  //
  // WHY THIS BLOCK AND NOT ANOTHER: §04 of the handoff argues for deleting the
  // vignette, and that argument is about STEADY-STATE lighting. This radial
  // gradient is the shipped SRM-07 / D-01 welcome-back feature, and removing
  // it is a separate owner call — not a side effect of a lighting phase.
  const SUMMARY = path.join(
    process.env.HOME || '',
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker',
    'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases',
    '26.98-the-room-reads-as-lit-art-motion-handoff/26.98-01-SUMMARY.md');
  let record = '';
  let BASE = null;
  try {
    record = fs.readFileSync(SUMMARY, 'utf8');
  } catch (e) {
    fail('the phase record could not be read, so "baseline" has no ' +
      'definition here and nothing below would be a measurement — ' +
      SUMMARY + ' (' + e.message + ')');
  }
  if (record) {
    const shaM = /PHASE BASELINE COMMIT:\s*`?([0-9a-f]{40})`?/.exec(record);
    if (!shaM) {
      fail('no `PHASE BASELINE COMMIT:` line in ' + SUMMARY + ' — plan 01 is ' +
        "this gate's declared dependency precisely because it cannot define " +
        '"baseline" on its own');
    } else {
      BASE = shaM[1];
    }
  }

  let baseCss = null;
  if (BASE) {
    // Read the command's OUTPUT, not its exit code: a status code cannot tell
    // an empty file from an unresolved commit, and both would pass a hash
    // comparison of nothing against nothing.
    try {
      baseCss = cp.execFileSync('git',
        ['-C', ROOT, 'show', BASE + ':' + TOKENS],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    } catch (e) {
      fail('the phase baseline commit ' + BASE + ' does not resolve in this ' +
        "repo's history, so there is nothing to compare against — git said: " +
        String((e && e.stderr) || e.message).trim());
    }
    if (baseCss !== null && (typeof baseCss !== 'string' || baseCss.length === 0)) {
      fail('git returned no bytes for ' + TOKENS + ' at ' + BASE);
      baseCss = null;
    }
  }

  if (baseCss !== null) {
    const BLOCKS = [
      { name: 'the welcome-back glow layer (#room-tint::after)',
        from: '#room-tint::after {', to: '\n}' },
      { name: 'the one sanctioned scene-light motion ' +
          '(body.welcome-back #room-tint::after)',
        from: 'body.welcome-back #room-tint::after {', to: '\n}' },
      { name: 'the dim-to-bright keyframe (@keyframes room-welcome-dim)',
        from: '@keyframes room-welcome-dim {', to: '\n}' }
    ];
    function span(src, b) {
      const i = src.indexOf(b.from);
      if (i === -1) { return null; }
      const j = src.indexOf(b.to, i);
      if (j === -1) { return null; }
      return src.slice(i, j + b.to.length);
    }
    function hash(t) {
      return crypto.createHash('sha256').update(t, 'utf8').digest('hex');
    }
    // ⛔ THE FOUND-COUNT IS PINNED BEFORE A SINGLE HASH IS COMPUTED. An
    // extractor that matched nothing would otherwise compare zero blocks and
    // report a clean pass — the vacuous instrument, again.
    const headSpans = BLOCKS.map(function (b) { return span(tokensSrc, b); });
    const baseSpans = BLOCKS.map(function (b) { return span(baseCss, b); });
    const headFound = headSpans.filter(function (t) { return t !== null; });
    const baseFound = baseSpans.filter(function (t) { return t !== null; });
    if (headFound.length !== 3) {
      fail(TOKENS + ': the extractor found ' + headFound.length + ' of the 3 ' +
        'welcome-back blocks at HEAD — a block that cannot be found cannot ' +
        'be compared, and a comparison of nothing passes. Missing: ' +
        BLOCKS.filter(function (b, i) { return headSpans[i] === null; })
          .map(function (b) { return b.name; }).join('; '));
    } else if (baseFound.length !== 3) {
      fail(TOKENS + ': the extractor found ' + baseFound.length + ' of the 3 ' +
        'welcome-back blocks at the phase baseline ' + BASE + ' — the two ' +
        'sides are not being read the same way, so no equality below would ' +
        'mean anything');
    } else {
      for (let i = 0; i < BLOCKS.length; i++) {
        const hh = hash(headSpans[i]);
        const bh = hash(baseSpans[i]);
        if (hh !== bh) {
          fail('THE PHASE 25 WELCOME-BACK CHANGED — ' + BLOCKS[i].name +
            '\n        baseline ' + BASE.slice(0, 12) + ' sha256 ' +
            bh.slice(0, 16) + '\n        HEAD                 sha256 ' +
            hh.slice(0, 16) + '\n        This is the shipped SRM-07 / D-01 ' +
            'feature. §04 of the handoff argues about STEADY-STATE lighting; ' +
            'this radial gradient is a separate owner call and a lighting ' +
            'phase may not take it as a side effect.');
        }
      }
    }

    // ---- (e) the keyframe-name set, so a declined trap cannot arrive -------
    //
    // M5's four declined traps: no swaying trees, no swaying plant, no
    // fluttering notebook pages, no rain on the glass. Rung E (art-dependent
    // motion) is CUT this phase, so the honest gate is that the set of
    // animations tokens.css declares has not grown at all.
    function kfNames(css) {
      return (css.match(/@keyframes\s+[A-Za-z0-9_-]+/g) || [])
        .map(function (s) { return s.replace(/@keyframes\s+/, ''); })
        .sort();
    }
    // DRIVEN before it is trusted: the extractor must find a name in a
    // fixture that contains one, and must find none in a fixture that has none.
    if (kfNames('@keyframes probe-kf {\n  from { opacity: 0; }\n}')
      .join(',') !== 'probe-kf') {
      fail('the @keyframes extractor cannot find a keyframe in a fixture ' +
        'that contains one — every set comparison below would be vacuous');
    }
    if (kfNames('.a { color: red; }').length !== 0) {
      fail('the @keyframes extractor invents names in a fixture with none');
    }
    const headKf = kfNames(tokensSrc);
    const baseKf = kfNames(baseCss);
    if (baseKf.length !== 8) {
      fail(TOKENS + ': the phase baseline ' + BASE + ' declares ' +
        baseKf.length + ' keyframes — pinned BY VALUE at 8. A baseline read ' +
        'that came back short would make every set comparison below weaker ' +
        'than it looks.');
    }
    // ⚠ ALLOWED_NEW IS EMPTY, AND THAT IS A MEASUREMENT, NOT AN OVERSIGHT.
    // The plan anticipated new keyframe names from plan 06's feeling-mark
    // work. Measured this wave: 26.98-06 shipped the symmetric chosen state
    // CLASS-BASED (so it can carry a media query) and added NO keyframe at
    // all. So the sanctioned difference is the empty set, which is the
    // strongest form this assertion can take — anything appearing here is
    // unaccounted-for motion.
    const ALLOWED_NEW = [];
    if (ALLOWED_NEW.length !== 0) {
      fail('the sanctioned-new-keyframe list holds ' + ALLOWED_NEW.length +
        ' names — pinned BY VALUE at 0 for this phase');
    }
    const added = headKf.filter(function (n) {
      return baseKf.indexOf(n) === -1 && ALLOWED_NEW.indexOf(n) === -1;
    });
    const removed = baseKf.filter(function (n) { return headKf.indexOf(n) === -1; });
    if (added.length) {
      fail(TOKENS + ' GAINED ANIMATION THIS PHASE: ' + added.join(', ') +
        '. Rung E — the art-dependent motion — is CUT and RECORDED as the ' +
        "next phase's ladder, and M5's four declined traps (swaying trees, " +
        'a swaying plant, fluttering notebook pages, rain on the glass) stay ' +
        'declined. A new keyframe arriving unnoticed is exactly how a cut ' +
        'rung gets climbed anyway.');
    }
    if (removed.length) {
      fail(TOKENS + ' LOST ANIMATION THIS PHASE: ' + removed.join(', ') +
        '. SC-8 is byte-unchanged in both directions; a deleted keyframe is ' +
        'a shipped behaviour leaving without a decision.');
    }
    // The declined subjects, named directly as well as counted — a rename
    // that dodged the set comparison still cannot dodge its own vocabulary.
    const DECLINED = [/tree/i, /sway/i, /flutter/i, /rain/i];
    if (DECLINED.length !== 4) {
      fail("M5's declined-trap vocabulary holds " + DECLINED.length +
        ' patterns — pinned BY VALUE at 4');
    }
    headKf.forEach(function (n) {
      DECLINED.forEach(function (re) {
        if (re.test(n)) {
          fail(TOKENS + ': @keyframes ' + n + ' names one of M5\'s four ' +
            'DECLINED motion traps. They were declined by decision, not by ' +
            'omission.');
        }
      });
    });
  }
})();

// ---- 22. DESK DECOR — RELOCATED TO THE CATALOG (26.9995-06) -------------------
//
// 26.9995-05 furnished the desk ZOOM with the ten 26.9995-04 sprites as
// always-on scenery. Her ruling, 2026-08-25 (AskUserQuestion, her own
// typed words, then confirmed on a two-item read-back, "Yes, exactly
// that"), verbatim:
//   "Don't leave htem on the desk, the desk has the same item but these
//    newly added item can be find in the design mode"
// And the same day, mid-implementation, with a screenshot of the zoomed
// desk open, verbatim:
//   "And also when the user zoomed in the desk the item they saw from the
//    zoom in window should be the same they saw from the entire room
//    window"
// So the truth this group pins is the RELOCATED one:
//   (a) ZERO default-placed desk decor — no DESK_DECOR table, no
//       placeDecor placer, and renderDeskStation paints only the plate
//       and its working fixtures, so the zoom and the room-wide view
//       AGREE by default (the room-wide view never showed the ten);
//       app.js's dated relocation comment RETAINS the 26.9995-05 table
//       verbatim (a coordinate whose history is gone cannot be reviewed);
//   (b) TEN catalog entries — one per sprite, pinned BY VALUE in CATALOG
//       (id, name, sprite, cls, room-scale w/h) through the Phase 24.1
//       design-mode path, never a parallel mechanism;
//   (c) the client sprite fence CAT_SPRITES carries the ten at the same
//       room-scale dims, and each PNG on disk is EXACTLY 2x those dims
//       (the ten ship at desk-zoom 2x; the room seats them halved — the
//       one derivation rule, carried into the new home);
//   (d) the SERVER's ACCESSORY_SPRITES roster agrees with the client —
//       the cross-file assertion without which a placement she makes is
//       refused at POST time and silently lost on reload;
//   (e) .station-decor stays shipped in tokens.css (pointer-inert, seated
//       at ladder 0, the four pinned numbers unrenumbered) — the seat the
//       zoom-view half of her second ruling will need when placed items
//       paint into the station scene (deferred, named in
//       26.9995-06-SUMMARY.md).
//
// ⛔ THE 26.9995-05 GATE WAS REWORKED, NEVER JUST DELETED (its old pins —
// ten rows by value, fixture disjointness, standing lines, the 2x rect
// rule, placeDecor inertness — pinned a table that no longer exists; the
// old table's values survive in app.js's dated comment and in the plan
// record). STATION_DESK's protection did not leave with it: SC-8 (c2)
// above pins all four fixture rects by value, stronger than the count
// pin this group used to carry.
//
// THE FIVE ANTI-VACUITY ANSWERS:
//  1. CAN IT PASS BEFORE THE WORK? No — run against the pre-relocation
//     tree it fails on every leg (DESK_DECOR present, placeDecor present,
//     zero catalog entries, server roster at 9); recorded verbatim in
//     26.9995-06-SUMMARY.md.
//  2. CAN IT PASS AFTER A DELIBERATE BREAK? No — dropping any catalog row
//     breaks the 19-entry count pin AND that row's by-value pin; see the
//     recorded red.
//  3. WOULD A DEGENERATE IMPLEMENTATION PASS? No — every roster count is
//     pinned BY VALUE before a single row is read (10 pin rows, 19
//     CATALOG entries, 21 CAT_SPRITES entries, 19 server names), with
//     declared-vs-parsed arms so a short lift fails instead of comparing
//     less (the narrowed-lift rule).
//  4. DOES IT READ EVALUATION OR SOURCE? Parsed out of the shipped
//     app.js, server.py and the PNG bytes on disk — never restated from
//     a plan.
//  5. COULD A COMMENT SATISFY IT? No — the app.js scans run over
//     COMMENT-STRIPPED source (the retained 26.9995-05 table in the
//     relocation comment restates ten rects in prose, so this hazard is
//     live); the server tuple is parsed with # lines stripped; the
//     PRESENCE of the predecessor comment is asserted on the raw source
//     but satisfies no value pin.
(function () {
  const G = 'desk-decor';
  function fail(msg) { violations.push('[' + G + '] ' + msg); }

  // Lift a `var NAME = {...}` block out of the COMMENT-STRIPPED source by
  // bracket-matching (the functionBody idiom, for declarations).
  function liftBlock(anchor, open, close) {
    const at = appCode.indexOf(anchor);
    if (at === -1) { return null; }
    let i = appCode.indexOf(open, at);
    if (i === -1) { return null; }
    const start = i;
    let depth = 0;
    for (; i < appCode.length; i++) {
      if (appCode[i] === open) { depth++; }
      else if (appCode[i] === close) {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    return depth === 0 ? appCode.slice(start, i) : null;
  }

  // ---- (a) zero default-placed decor; the zoom agrees with the room ---------
  if (appCode.indexOf('var DESK_DECOR') !== -1) {
    fail(APP + ': var DESK_DECOR is still declared — her ruling ' +
      '(2026-08-25) took the ten OFF the default desk: "Don\'t leave ' +
      'htem on the desk". The zoom must show only what the room-wide ' +
      'view shows.');
  }
  if (/function placeDecor\(/.test(appCode)) {
    fail(APP + ': function placeDecor is still declared — the always-on ' +
      'placer left with the table it drove (26.9995-06); the catalog ' +
      'path (buildAddedNode) is the one way decor enters a scene now');
  }
  const rds = functionBody(appCode, APP, 'renderDeskStation', G);
  if (rds !== null) {
    ['DESK_DECOR', 'placeDecor'].forEach(function (bad) {
      if (rds.text.indexOf(bad) !== -1) {
        fail(APP + ': renderDeskStation still references ' + bad + ' — ' +
          'the default desk paints the plate and its working fixtures ' +
          'only, so the zoom and the room-wide window agree (her second ' +
          'ruling, 2026-08-25)');
      }
    });
  }
  // The predecessor record is RETAINED (raw source, comments included):
  // presence is pinned; its numbers satisfy nothing above or below.
  if (appSrc.indexOf('THE PREDECESSOR RECORD (26.9995-05') === -1) {
    fail(APP + ': the dated relocation comment no longer carries "THE ' +
      'PREDECESSOR RECORD (26.9995-05" — the shipped table\'s values ' +
      'must survive beside the change that removed them (the standing ' +
      'rule; a coordinate whose history is gone cannot be reviewed)');
  }

  // ---- (b) the nine catalog entries, pinned by value ------------------------
  // id, display name, sprite, cls, room-scale w, room-scale h.
  //
  // ⛔ 26.99955-08: TEN -> NINE. The pen cup LEFT this roster by her ruling
  // of 2026-08-26, verbatim: "treat the pen cup as the same items like
  // journal, album, the user can move them but cannot delete them through
  // the design mode". It became the activity log's one door — a FIXTURE, in
  // ROOM_OBJECT_IDS + FUNCTIONAL_IDS — and a catalogue entry beside it would
  // have put two identical pen cups in the room, one a door and one decor,
  // indistinguishable by sight and colliding on `$('room-obj-' + entryId)`
  // in `addCatalogItem`'s restore path. Its absence here is pinned in (b2)
  // below, because an entry silently returning is how the twin comes back.
  const CAT_ROWS = [
    ['budvase', 'bud vase', 'plant-budvase', 'surface', 12, 28],
    ['desk-lamp', 'desk lamp', 'lamp-desk', 'surface', 24, 32],
    ['mug', 'mug', 'mug', 'surface', 14, 13],
    ['cutting', 'cutting jar', 'plant-cutting', 'surface', 14, 26],
    ['cactus', 'cactus', 'plant-cactus', 'surface', 20, 30],
    ['snake-plant', 'snake plant', 'plant-snake', 'floor', 20, 46],
    ['pothos', 'pothos', 'plant-pothos', 'floor', 26, 36],
    ['succulent', 'succulent', 'plant-succulent', 'floor', 20, 16],
    ['watering-can', 'watering can', 'watering-can', 'floor', 24, 17]
  ];
  // ⛔ PINNED BY VALUE BEFORE A SINGLE ROW IS READ. Six stood on the desk
  // line, four on the floor (26.9995-05's layout) — so six seat as
  // 'surface' (they rest ON things) and four as 'floor'.
  if (CAT_ROWS.length !== 9) {
    fail('the catalog pin table holds ' + CAT_ROWS.length + ' rows — ' +
      'pinned BY VALUE at 9 (the ten 26.9995-04 sprites less the pen cup, ' +
      'which her 26.99955-08 ruling made a fixture). A dropped row ' +
      'is a sprite she can no longer find in design mode; a tenth ' +
      'is furniture nobody ruled on.');
  }
  const catBlock = liftBlock('var CATALOG = {', '{', '}');
  if (catBlock === null) {
    fail(APP + ': var CATALOG not found — the design-mode roster the ' +
      'ten relocated into has no definition to read');
    return;
  }
  // Anti-vacuity both ways: entry count pinned BY VALUE (9 pre-existing
  // 24.1/26.5 entries + the ten), and counted with the same `name:` probe
  // every entry shape carries.
  const catEntries = (catBlock.match(/name:\s*'/g) || []).length;
  if (catEntries !== 18) {
    fail(APP + ': CATALOG holds ' + catEntries + ' entries — pinned BY ' +
      'VALUE at 18 (the nine shipped 24.1/26.5-era entries plus the ten ' +
      'desk sprites her ruling relocated here, LESS the pen cup, which ' +
      'her 26.99955-08 ruling made a fixture). A count that drifted is ' +
      'a roster that changed without a decision.');
  }
  CAT_ROWS.forEach(function (row) {
    const re = new RegExp("'?" + row[0] + "'?:\\s*\\{\\s*name:\\s*'" +
      row[1] + "',\\s*sprite:\\s*'" + row[2] + "',\\s*cls:\\s*'" +
      row[3] + "',\\s*w:\\s*" + row[4] + ",\\s*h:\\s*" + row[5] +
      '\\s*\\}');
    if (!re.test(catBlock)) {
      fail(APP + ': CATALOG.' + row[0] + ' is missing or off its pin — ' +
        "pinned BY VALUE at { name: '" + row[1] + "', sprite: '" +
        row[2] + "', cls: '" + row[3] + "', w: " + row[4] + ', h: ' +
        row[5] + ' }. These are the ten she ruled into design mode ' +
        '(2026-08-25): each must stay findable and placeable through ' +
        'the 24.1 path at room scale.');
    }
  });

  // ---- (b2) 26.99955-08: THE PEN CUP HAS ONE NATURE, AND IT IS A FIXTURE ---
  //
  // HER RULING, 2026-08-26, verbatim: "treat the pen cup as the same items
  // like journal, album, the user can move them but cannot delete them
  // through the design mode".
  //
  // ⛔ WHY EACH HALF IS PINNED SEPARATELY. The ruling is TWO facts that fail
  // in opposite directions, and a single check would hold neither:
  //   * ABSENT from CATALOG — the moment an entry returns, she can place a
  //     SECOND pen cup, identical to the door by sight, and `addCatalogItem`
  //     keys its restore path on `$('room-obj-' + entryId)`, so the two
  //     natures collide on one id. This is an ABSENCE pin, and an absence
  //     that nothing asserts does not survive a helpful editor.
  //   * PRESENT in FUNCTIONAL_IDS — this is the only thing that makes
  //     `removeAccessory` return early, which is literally "cannot delete
  //     them through the design mode". Without it she can delete the door
  //     to the activity log with a stray tap and it is gone.
  //   * PRESENT in ROOM_OBJECT_IDS — without it `attachDesignDrag` is never
  //     bound and it does not MOVE, which is the other half of her sentence.
  //   * PRESENT in CAT_SPRITES and in the server's ACCESSORY_SPRITES —
  //     ⭐ THE DECISION RECORDED IN BOTH FILES, HELD HERE. `buildAddedNode`
  //     drops a record whose sprite this fence lacks SILENTLY (the layout
  //     keeps it, the room stops drawing it, nobody is told), and the server
  //     would REFUSE THE WHOLE LAYOUT POST of anyone with one already
  //     placed. Zero pen cups are placed in her room today — and a rule
  //     whose safety depends on a count staying zero is the wrong rule to
  //     leave behind. Keeping both names costs nothing: no client path can
  //     create a new one now that the CATALOG entry is gone.
  if (/'pen-cup':\s*\{\s*name:/.test(catBlock)) {
    fail(APP + ': CATALOG still holds a pen-cup entry — her 26.99955-08 ' +
      'ruling made the pen cup a FIXTURE ("the user can move them but ' +
      'cannot delete them through the design mode"), and a catalogue entry ' +
      'beside the fixture puts TWO identical pen cups in the room, one a ' +
      'door to the activity log and one decor, indistinguishable by sight ' +
      'and colliding on one id in addCatalogItem\'s restore path');
  }
  [['ROOM_OBJECT_IDS', 'it would not MOVE in design mode — attachDesignDrag ' +
    'is bound from this roster and nowhere else'],
   ['FUNCTIONAL_IDS', 'it could be DELETED by a stray design-mode tap — ' +
     'removeAccessory returns early for this roster and nothing else ' +
     'protects it, and deleting it deletes the only door to the ' +
     'activity log']].forEach(function (row) {
    const m = appCode.match(new RegExp('var ' + row[0] + ' = \\[([^\\]]*)\\]'));
    if (!m) {
      fail(APP + ': ' + row[0] + ' not found — the pen cup\'s nature ' +
        'cannot be read, and a comparison against nothing passes');
      return;
    }
    if (m[1].indexOf("'pen-cup'") === -1) {
      fail(APP + ': ' + row[0] + " does not hold 'pen-cup' — " + row[1] +
        '. Her ruling of 2026-08-26 is that it moves and never deletes, ' +
        'and BOTH halves live in these two rosters.');
    }
  });
  if (!/'pen-cup':\s*\{\s*w:\s*14,\s*h:\s*22\s*\}/.test(appCode)) {
    fail(APP + ": CAT_SPRITES no longer holds 'pen-cup' at { w: 14, h: 22 } " +
      '— it left CATALOG but it must NOT leave the sprite fence: ' +
      'buildAddedNode returns early on a sprite this table lacks, so any ' +
      'pen cup already placed in a layout would stop being drawn with ' +
      'nobody told. That is the silence this project has already paid for.');
  }

  // ---- (c) the client sprite fence + the PNGs on disk at exactly 2x ---------
  const fenceBlock = liftBlock('var CAT_SPRITES = {', '{', '}');
  if (fenceBlock === null) {
    fail(APP + ': var CAT_SPRITES not found — the client sprite fence ' +
      'the catalog resolves through has no definition to read');
    return;
  }
  const fenceEntries = (fenceBlock.match(/'[a-z-]+':\s*\{/g) || []).length;
  if (fenceEntries !== 21) {
    fail(APP + ': CAT_SPRITES holds ' + fenceEntries + ' entries — ' +
      'pinned BY VALUE at 21 (the eleven shipped sprite names plus the ' +
      'ten desk sprites)');
  }
  function pngSize(file) {
    try {
      const buf = fs.readFileSync(file);
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    } catch (e) { return null; }
  }
  CAT_ROWS.forEach(function (row) {
    const re = new RegExp("'" + row[2] + "':\\s*\\{\\s*w:\\s*" + row[4] +
      ',\\s*h:\\s*' + row[5] + '\\s*\\}');
    if (!re.test(fenceBlock)) {
      fail(APP + ": CAT_SPRITES['" + row[2] + "'] is missing or off its " +
        'pin — pinned BY VALUE at { w: ' + row[4] + ', h: ' + row[5] +
        ' } (room scale). A fence entry at the PNG\'s 2x dims would ' +
        'seat the sprite desk-zoom sized in the room.');
    }
    const png = path.join(ROOT, 'assets', 'room', row[2] + '.png');
    const size = pngSize(png);
    if (size === null) {
      fail('assets/room/' + row[2] + '.png does not exist or is not a ' +
        'PNG — the catalog names a sprite that is not on disk');
    } else if (size.w !== 2 * row[4] || size.h !== 2 * row[5]) {
      fail('assets/room/' + row[2] + '.png is ' + size.w + 'x' + size.h +
        ' — the ten desk sprites ship at EXACTLY 2x their authored ' +
        'room-scale canvas (' + (2 * row[4]) + 'x' + (2 * row[5]) +
        ' expected for ' + row[4] + 'x' + row[5] + '): the one 2x ' +
        'derivation rule, carried from the zoom into the catalog');
    }
  });

  // ---- (d) the server roster agrees with the client -------------------------
  // Parsed from server.py with # comment lines stripped (a name stated
  // in prose must never satisfy the fence that must refuse it).
  const srvStripped = serverSrc.split('\n')
    .map(function (l) { return l.replace(/^(\s*)#.*$/, '$1'); })
    .join('\n');
  const srvM = srvStripped.match(/ACCESSORY_SPRITES = \(([\s\S]*?)\)/);
  if (!srvM) {
    fail(SERVER + ': ACCESSORY_SPRITES tuple not found — the server-side ' +
      'fence the client roster must agree with has no definition');
  } else {
    const srvNames = (srvM[1].match(/"[a-z-]+"/g) || [])
      .map(function (s) { return s.slice(1, -1); });
    // The full roster, pinned BY VALUE: nine shipped + the ten relocated.
    // ⭐ 26.99955-08: 'pen-cup' STAYS at 19 though it left the client's
    // CATALOG. This tuple is checked against EVERY posted `added` record,
    // so dropping the name would make the server refuse the whole layout
    // POST of anyone who has a pen cup already placed — she would lose the
    // ability to save any arrangement, and the refusal reaches her as a
    // room that stopped remembering. The client cannot create a new one
    // (no CATALOG entry), so the widened name grants nothing.
    const SRV_ROSTER = ['decor-candle', 'decor-plant', 'decor-window',
      'decor-rug', 'decor-rug-b', 'decor-books', 'decor-art',
      'decor-art-b', 'decor-plant-b', 'plant-budvase', 'lamp-desk',
      'pen-cup', 'mug', 'plant-cutting', 'plant-cactus', 'plant-snake',
      'plant-pothos', 'plant-succulent', 'watering-can'];
    if (SRV_ROSTER.length !== 19) {
      fail('the server roster pin holds ' + SRV_ROSTER.length +
        ' names — pinned BY VALUE at 19');
    }
    if (srvNames.length !== 19 ||
        srvNames.slice().sort().join(',') !==
        SRV_ROSTER.slice().sort().join(',')) {
      fail(SERVER + ': ACCESSORY_SPRITES reads [' + srvNames.join(', ') +
        '] — pinned BY VALUE at the nine shipped names plus the ten ' +
        'relocated desk sprites. A client catalog entry the server ' +
        'refuses is a placement she makes that is silently lost at ' +
        'POST time — the two rosters AGREEING is the invariant.');
    }
  }

  // ---- (e) the decor seat stays shipped, the ladder unrenumbered ------------
  if (!/\.station-scene img\.station-decor\s*\{[^}]*pointer-events:\s*none/
    .test(tokensSrc)) {
    fail(TOKENS + ': the .station-scene img.station-decor rule with ' +
      'pointer-events: none is missing — the seat is retained for the ' +
      'zoom half of her second ruling (placed items painting into the ' +
      'station scene), and it must stay pointer-inert so a decoration ' +
      'can never intercept taps meant for doors');
  }
  // The pinned ladder, unrenumbered (26.5-09 UAT F14): the decor seat
  // stays at 0 and the four shipped numbers stand.
  if (!/\.station-bg\s*\{\s*z-index:\s*0;\s*\}/.test(tokensSrc) ||
    !/\.station-decor\s*\{\s*z-index:\s*0;\s*\}/.test(tokensSrc) ||
    !/\.station-photo\s*\{\s*z-index:\s*1;\s*\}/.test(tokensSrc) ||
    !/\.station-caption,\s*\n?\s*\.station-toc-line\s*\{\s*z-index:\s*2;\s*\}/
      .test(tokensSrc)) {
    fail(TOKENS + ': the station z-ladder is not exactly ' +
      '.station-bg 0 / .station-decor 0 / .station-photo 1 / ' +
      '.station-caption+.station-toc-line 2 — the four shipped numbers ' +
      'are pinned by 26.5-09 UAT F14 and the decor seat stays at 0, ' +
      'never renumbered (T-26.9995-24)');
  }
})();

// ---- #150 (2026-08-25): THE GUIDED FIRST PASS HAS A DOOR AGAIN -------------
//
// Four owner reports preceded this ticket, and on the fourth the door was
// found GONE: two flags (DIEGETIC_ROOM_ENABLED, PHOTOS_ONE_CLICK), each
// defensible alone, had between them removed EVERY entrance to the guided
// first pass while every suite stayed green — because nothing anywhere
// pinned that a door EXISTS. This group is that pin. Her four rulings
// (2026-08-25, one beat at a time): the home is the DESK, visibly; setup's
// last screen names it; the label is her chosen sentence; the setup line is
// hers too.
//
// THE FIVE ANTI-VACUITY ANSWERS:
//  1. CAN IT PASS BEFORE THE WORK? No — desk-firstlook existed nowhere.
//  2. CAN IT PASS AFTER A DELIBERATE BREAK? Deleting the fixture, dropping
//     its startBlessing call, or renaming the id each goes red (driven).
//  3. WOULD A DEGENERATE IMPLEMENTATION PASS? A fixture with no call path
//     into the pass fails (c); a label drifted from the screen fails (d).
//  4. READS SOURCE — both files, values parsed out of code and markup,
//     never restated from a plan.
//  5. COULD A COMMENT SATISFY IT? (a) and (c) demand code tokens (an id
//     assignment, a call with parens) that renderDeskStation's comments do
//     not spell; (d) compares parsed VALUES, which prose cannot supply.
(function () {
  const G = 'first-look-door';
  const body = functionBody(appSrc, APP, 'renderDeskStation', G);
  if (!body) { return; }
  // (a) the fixture exists and is seated through the pinned rect.
  ["firstlook.id = 'desk-firstlook';",
    'place(firstlook, STATION_DESK.firstlook);'].forEach(function (tok) {
    if (body.text.indexOf(tok) === -1) {
      violations.push('[' + G + '] ' + APP + ':' + body.line +
        " renderDeskStation lost '" + tok + "' — the guided first pass's " +
        'ONE door (#150). Four owner reports preceded this pin; a fifth ' +
        'pointer is not the answer, and neither is a quietly dead door.');
    }
  });
  // (b) the door dims, never vanishes: presence is decided at paint time by
  // the core boolean (the F-8 register — visible before she reaches for it).
  if (body.text.indexOf('StudyCore.firstLookWaiting(') === -1) {
    violations.push('[' + G + '] ' + APP + ':' + body.line +
      ' renderDeskStation no longer asks StudyCore.firstLookWaiting — the ' +
      'first-look door decides its presence blind, and an empty pass falls ' +
      'silently back to the room: the exact tap-and-nothing-happened shape ' +
      'F-8 closed for the stack');
  }
  // (c) the door OPENS the pass — exactly ONE startBlessing() call in the
  // painter. Zero is the doorless drift #150 closed; two is a second door
  // to the same act (her 26-05 ruling).
  const flCalls = (body.text.match(/startBlessing\(\)/g) || []).length;
  if (flCalls !== 1) {
    violations.push('[' + G + '] ' + APP + ':' + body.line +
      ' renderDeskStation calls startBlessing() ' + flCalls +
      ' time(s) — pinned BY VALUE at exactly 1');
  }
  // (d) DOOR AND ROOM SAY ONE THING: OFFER_COPY.firstLook must equal the
  // blessing screen's own <h2> — compared as VALUES parsed from each file,
  // the cross-file agreement neither file can fake alone. ⚠ Both sentences
  // are HERS (2026-08-25): they change together, by her, or not at all.
  const flLabel = appSrc.match(/firstLook:\s*'([^']*)'/);
  const flH2 = htmlSrc.match(
    /<section id="screen-blessing"[^>]*>\s*<h2>([^<]*)<\/h2>/);
  if (!flLabel || !flH2) {
    violations.push('[' + G + '] the label agreement could not be read ' +
      '(OFFER_COPY.firstLook ' + !!flLabel + ', #screen-blessing h2 ' +
      !!flH2 + ') — a comparison of nothing passes');
  } else if (flLabel[1] !== flH2[1].replace(/\s+/g, ' ').trim()) {
    violations.push('[' + G + '] the desk door says ' +
      JSON.stringify(flLabel[1]) + ' and the screen it opens is headed ' +
      JSON.stringify(flH2[1].replace(/\s+/g, ' ').trim()) +
      ' — door and room must say ONE thing (her rule from the tidy-up ' +
      'switch)');
  }
  // (e) the probe is HOISTED above every fixture (the P-8 posture the Offer
  // probe already keeps — a probe reachable only from a tap is not a
  // presence rule).
  const flProbeAt = body.text.indexOf('StudyCore.firstLookWaiting(');
  const flRegAt = body.text.indexOf('addEventListener(');
  if (flProbeAt !== -1 && flRegAt !== -1 && flProbeAt > flRegAt) {
    violations.push('[' + G + '] ' + APP + ':' + body.line +
      ' the first-look presence probe sits after a listener registration ' +
      'in renderDeskStation — hoist it above every fixture (P-8)');
  }
})();

// ---- 26.999 close: THE CARD BOX KEEPS ITS SPOKEN NAME ---------------------
//
// ⛔ THIS PIN EXISTS BECAUSE THE DEFECT IT GUARDS WAS ABOUT TO BE SHIPPED,
// and nothing would have said so. The card box is the ONE door to the
// librarian's memory page (her design sitting), and it renders no words —
// the sprite is the whole visible door — so its accessible name is the
// only thing that says what it is. That name was sourced from the Manage
// pane row for `memory`; she has since ruled the page becomes ROOM-ONLY
// and that row RETIRES, and managePaneLabel returns the EMPTY STRING for a
// key it no longer holds. The removal would therefore have left a door
// with no name at all, silently — the "defect is the silence" shape this
// project has been bitten by before. Checked at the time: NO suite pinned
// this name.
//
// So: the name is sourced from the page's own heading (the words she
// chose, and the source that survives the retirement), and the two are
// asserted to AGREE — a cross-check neither constant can satisfy alone.
// ⚠ It is asserted NON-EMPTY first and separately, because an agreement
// between two empty strings is a green gate over a nameless door.
(function () {
  const G = 'cardbox-name';
  const heading = appSrc.match(/var HER_MEMORY_HEADING = '((?:[^'\\]|\\.)*)'/);
  if (!heading) {
    violations.push('[' + G + '] ' + APP + ': HER_MEMORY_HEADING not found ' +
      '— the memory page heading is the card box\'s one naming source and ' +
      'a comparison against nothing passes');
    return;
  }
  if (!heading[1].length) {
    violations.push('[' + G + '] ' + APP + ': HER_MEMORY_HEADING is EMPTY ' +
      '— the card box shows no words, so an empty name is a door that ' +
      'announces nothing');
  }
  // the assignment itself, read out of comment-stripped source so a
  // comment quoting the old call cannot satisfy it (the prose-satisfied
  // pin this phase already retired once)
  if (!/cardbox\.setAttribute\('aria-label',\s*HER_MEMORY_HEADING\)/
      .test(appCode)) {
    violations.push('[' + G + '] ' + APP + ': the card box no longer takes ' +
      'its accessible name from HER_MEMORY_HEADING. ⛔ It must NOT be read ' +
      'from the Manage pane roster: her ruling retires that row, and ' +
      'managePaneLabel returns "" for a key it does not hold — which would ' +
      'blank this door\'s only name with no gate going red');
  }
  // and the page it opens is headed with those same words
  if (!/head\.textContent = HER_MEMORY_HEADING;/.test(appCode)) {
    violations.push('[' + G + '] ' + APP + ': the memory page no longer ' +
      'renders HER_MEMORY_HEADING as its heading — door and page must say ' +
      'ONE thing (her rule from the tidy-up switch), and this pin is what ' +
      'makes them one source rather than two copies');
  }
})();

// ---- 26.999 night: the candle-first sentence on the blessing screen -------
//
// HER RULING (chosen from an offered set, AskUserQuestion, 2026-08-25):
// blessing reached without the candle says the sitting is recommended
// first. The sentence is HERS by selection and is pinned BYTE-EXACTLY —
// an agent may not reword, tighten or re-punctuate it. It lives on the
// blessing screen itself (both non-candle doors land there; the candle
// sitting's own walk never does), as a quiet ink-soft line under the
// intro, ABOVE the controls.
(function () {
  const HER_CANDLE_FIRST = 'the librarian recommends a sitting at the ' +
    'candle first — it looks through what\'s new with you before you bless.';
  const pAt = htmlSrc.indexOf('id="blessing-candle-first"');
  if (pAt === -1) {
    violations.push('[candle-first] ' + HTML + ': no ' +
      'id="blessing-candle-first" element — her recommendation sentence ' +
      'has no home on the blessing screen');
    return;
  }
  const sentenceAt = htmlSrc.indexOf(HER_CANDLE_FIRST);
  if (sentenceAt === -1) {
    violations.push('[candle-first] ' + HTML + ': her sentence is not ' +
      'present byte-exactly — the words are hers (2026-08-25 selection) ' +
      'and change only by her hand');
    return;
  }
  // it sits on the blessing screen, above the controls
  const screenAt = htmlSrc.indexOf('id="screen-blessing"');
  const controlsAt = htmlSrc.indexOf('id="blessing-controls"');
  if (!(screenAt !== -1 && controlsAt !== -1 &&
        screenAt < pAt && pAt < controlsAt)) {
    violations.push('[candle-first] ' + HTML + ': the candle-first line ' +
      'is not between the blessing screen\'s opening and its controls — ' +
      'a recommendation shown after the judging began is not a ' +
      'recommendation');
  }
})();

// ---- verdict --------------------------------------------------------------------

if (violations.length) {
  console.error('test_diegetic_wiring FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_diegetic_wiring OK (flag singleton, gated present sites, ' +
  'ribbon-sibling DOM, seam-evident spread sink, gated open sites, ' +
  'station DOM, station node-building, blessing-ribbon handlers, ' +
  'no-counts stack, D-09 manage order, pile-tap sites, ' +
  'caption seam, D-07 motion boundary, 26.8-05 notebook two-layer ' +
  'registration, 26.8.1-02 D-B browse panel absent, 26.91-04 D-06 reading ' +
  'door RETIRED + roster counts 9/9/4/4 + the notebook\'s invite slot ' +
  'survives, 26.91-04 one-book contract: both painters gone + decoration ' +
  'still the notebook\'s + no reading-book labels + exactly one hidden ' +
  'predicate + exactly two candle surfaces, G-A1/G-A2 the removal as one ' +
  '8-member conjunction a rename cannot satisfy, 26.98-07 SC-8 nothing ' +
  'moved: all nine room-object coordinates + the 9-button count + the ' +
  'station board lines pinned in BOTH tables and against each other + ' +
  'both place() hosts by definition and call-site count + the Phase 25 ' +
  'welcome-back hashed against the phase baseline + the keyframe-name set ' +
  'unchanged so a declined trap cannot arrive while rung E is cut, ' +
  '26.9995-06 STATION_DESK pinned by value inside SC-8 + the drawn desk ' +
  'and the seated fixtures agreeing across app.js and the generator, ' +
  '26.9995-06 desk decor relocated: zero default-placed (the zoom agrees ' +
  'with the room) + the predecessor record retained + ten catalog entries ' +
  'pinned by value at room scale + the client fence and the PNGs at ' +
  'exactly 2x + the server roster agreeing with the client + the decor ' +
  'seat shipped and the z-ladder unrenumbered, ' +
  '#150 first-look door: fixture seated + presence probe hoisted + exactly ' +
  'one startBlessing call + the label agreeing with the blessing screen\'s ' +
  'own heading across app.js and index.html)');
process.exit(0);
