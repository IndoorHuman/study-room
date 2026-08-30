/*
 * tests/test_surface_wiring.cjs — the D-11 static wiring gate (Plan 23-05).
 *
 * Port of the house's tests/test_backissue_wiring.cjs pattern: read the
 * sources as TEXT, isolate the sentinel-bounded exempt region, assert the
 * choke-point wiring with regexes, and exit non-zero listing every offender
 * with file and line. Zero-dep (fs/path), path-independent via __dirname.
 * This file lives in tests/ — it is NOT an APP_SOURCES member of
 * test_no_push.cjs and needs no gate-list change there.
 *
 * Six assertion groups (23-PATTERNS §14):
 *
 *   1. GATE CONSUMPTION — every selector in the GATED_SELECTORS roster
 *      draws from surfacePool inside its OWN body (D-11: the gate lives
 *      inside the selectors, never at call sites — a future surface that
 *      skips it fails here by construction).
 *   2. GATE COMPLETENESS — the surfacePool/itemExcluded bodies name all
 *      four exclusion classes and call matchesFilter. Textually weak by
 *      design: the property suite proves the behavior — gutting the gate
 *      must fail two independent suites.
 *   3. CALL-SITE FILTERS — every StudyCore.<selector>( occurrence in
 *      app.js textually passes a filters argument within its argument
 *      span (and each selector has at least one call site).
 *   4. EXEMPTION BOUNDARY — the SURFACE-EXEMPT MANAGE VIEW sentinel pair
 *      exists exactly once each; raw-state listing (itemsInState) lives
 *      ONLY inside it; the region carries the three excluded-section
 *      labels (D-10's labeling rule: Hidden / Never show / Retired).
 *   5. GUARD WIRED — guardSurface is exported from core.js and appears in
 *      app.js OUTSIDE the exempt region at least twice (the shelf and
 *      cover render paths both re-check, D-13).
 *   6. COVER DISCIPLINE — the renderCover body never references the
 *      item's name property, never touches the content route, and never
 *      renders markdown: the D-02 no-ambush contract as a static
 *      negative, scoped to the ONE function so the rest of app.js may use
 *      all three freely.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every violation listed with file and line + exit 1 on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = 'core.js';
const APP = 'app.js';

const coreSrc = fs.readFileSync(path.join(ROOT, CORE), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');

// The gated surface selectors — an explicit roster, mirroring APP_SOURCES
// in test_no_push.cjs: A NEW SELECTOR MUST BE ADDED HERE DELIBERATELY to
// fall under the gate. Anything in core.js that picks items for an
// unprompted surface belongs on this list — only the manage view is
// exempt (D-10), and that exemption is the sentinel region below.
const GATED_SELECTORS = ['selectShelf', 'pickBlessingCandidates',
  'pickCoverCandidate', 'pickAlbumItems',
  // 26.8.1-02 (D-B): pickJournalItems retired from the roster — the journal
  // surface was removed (the blessings notebook is the single book). The pure
  // core remains in core.js but is no longer a wired surface, so it no longer
  // has a call site to gate.
  // 26.9-01 (D-18, 2026-08-04): STILL TRUE, and deliberately so. The
  // reading door does NOT re-wire pickJournalItems — it draws through the
  // new pickSessionReading below. pickJournalItems lost its call site with
  // D-B and never regained one, so it stays OFF this roster.
  'countPileByType', 'selectLibrarianSuggestions',
  // 26.8-01 added the blessing walk's arrivals selector here — unseen +
  // strict-after-boundary, recent-first — as a gated surface drawing through
  // the choke point like every other.
  //
  // 26.95-32 (D-08, 2026-08-15): RETIRED FROM THIS ROSTER, AND ITS BODY IS
  // NOT DELETED. The session walk no longer picks arrivals: it opens the
  // visit's ONE Offer through the shared door entry, which draws through
  // pickOfferCandidates below. This is the shipped rule for the third time of
  // asking (pickJournalItems above, 26.8.1-02; pickSessionReading below,
  // 26.91-04): a selector with no call site has nothing to gate, so it leaves
  // this roster — while its pure core stays in core.js AND on the export
  // table. Section 14 pins BOTH halves by name: zero call sites in app.js is
  // the retirement, and a body plus an export entry still standing is the
  // promise that nothing was quietly tidied away.
  // ⛔ Do NOT delete that body to make a count look right.
  // 26.9-01 deliberate addition (D-18, 2026-08-04): the reading door's
  // session-reading selector (the librarian's proposals + the room's
  // arrivals, as two id cohorts) joined this roster here.
  // 26.91-04 (D-06, 2026-08-07): pickSessionReading retired from the roster
  // — the reading door was removed (the blessings notebook is the single
  // book), so the selector lost its call site, and unlike pickJournalItems
  // the pure core went with it: `StudyCore.pickSessionReading` is gone from
  // core.js and from the export table. A selector with neither a call site
  // nor a body has nothing to gate.
  // 26.9-04 deliberate addition (D-04/D-12, 2026-08-04): the notebook
  // picker's image selector. A NEW gated surface — its first move inside
  // its own body is surfacePool(, and every id it returns is re-checked
  // through guardSurface independently at render, on EVERY render, with
  // the guard passed in as an argument.
  //
  // It is NOT a resurfacing surface and does not need to be gated for law
  // 1's sake — law 1 is satisfied by user initiation (four deliberate
  // acts: notebook, design mode, tin, pictures tab). It is on this roster
  // for LAW 5: a never-listed, retired or trigger-flagged image must not
  // appear in a grid she opened deliberately any more than in one she did
  // not.
  'pickPickerImages',
  // 26.95-30 deliberate addition (D-01/D-05/D-12; P-1/P-9, 2026-08-15): the
  // reach back's fortnight selector — the pure half of the Offer. A NEW gated
  // surface: its FIRST move inside its own body is surfacePool(, and every id
  // it returns is re-checked independently through guardSurface at the render
  // boundary (openOfferPage), on every render.
  //
  // It is on this roster for LAW 5, exactly as pickPickerImages is: a
  // never-listed, retired or trigger-flagged photograph must not appear on a
  // surface the room PROPOSED any more than on one she went looking for. And
  // being on the roster is what puts it under section 3 as well, so the
  // fortnight/year bounds gate in group 13 sits beside a filters gate the
  // shipped machinery already applies.
  'pickOfferCandidates'];

// ---- THE PIN THAT DID NOT EXIST (new in 26.91-04, D-06, 2026-08-07) --------
//
// GATED_SELECTORS held NINE entries and had NO `.length` assertion of any
// kind. It is consumed by two bare `.forEach` loops below — section 1 (gate
// consumption) and section 3 (call-site filters) — neither of which checks
// the roster's size. So a selector silently vanishing from this list silently
// shrank BOTH gates, and nothing anywhere went red: the sweep's coverage and
// the roster's own count fell together, which is the `p === n` shape this
// repo has named as its recurring defect class.
//
// That is precisely the operation this plan performs (9 -> 8), and precisely
// the operation an ACCIDENTAL deletion would have hidden. So the roster's
// size is made a MEASURED FACT here, by value, before the removal is trusted.
//
// PRE-STATE CONTRAST, driven and recorded in 26.91-04-SUMMARY.md: before this
// pin existed, deleting any single entry from GATED_SELECTORS left the whole
// suite GREEN. After it, the same mutation is RED.
//
// The contents are pinned too, deep-equal and in order — a count alone is
// satisfied by a RENAME, and a renamed selector is an ungated surface with a
// roster that still says nine.
const GATED_SELECTORS_EXPECTED = ['selectShelf', 'pickBlessingCandidates',
  'pickCoverCandidate', 'pickAlbumItems', 'countPileByType',
  // 26.95-32 (D-08, 2026-08-15): the walk's arrivals selector left this list
  // with the roster above — 9 -> 8. Its name is deliberately NOT spelled in
  // this single-quoted register a second time, so a grep for the roster
  // spelling reads zero and means what it says; section 14 refers to it in
  // double quotes for exactly that reason.
  'selectLibrarianSuggestions', 'pickPickerImages',
  // 26.95-30 (2026-08-15): the reach back's fortnight selector, added
  // deliberately — 8 -> 9. 26.95-32 then took the walk's arrivals selector
  // out, 9 -> 8; this entry is untouched by that and ⛔ must not be removed.
  'pickOfferCandidates'];

const violations = [];

// The suite's own measured case counts, named by section, so the OK line can
// state a number the run actually produced rather than a number a comment
// claims. Section 14 pins its own count BY VALUE before writing here.
const CASE_COUNT = { section14: 0 };

if (GATED_SELECTORS.length !== 8) {
  violations.push('[gate-roster] ' + CORE + ': GATED_SELECTORS holds ' +
    GATED_SELECTORS.length + ' entries — pinned BY VALUE at exactly 8 ' +
    '(26.91-04 D-06 moved it 9 -> 8 with pickSessionReading; 26.95-30 moved ' +
    'it 8 -> 9 with pickOfferCandidates; 26.95-32 D-08 moved it 9 -> 8 by ' +
    "retiring the walk's arrivals selector, whose body and export STAY). " +
    'This roster ' +
    'is consumed by two bare .forEach loops with no length check, so a ' +
    'vanished entry lowers both a gate\'s coverage and the roster\'s own ' +
    'count and nothing goes red. This pin is what makes the roster\'s size ' +
    'a measured fact rather than an assumption.');
}
if (JSON.stringify(GATED_SELECTORS) !==
    JSON.stringify(GATED_SELECTORS_EXPECTED)) {
  violations.push('[gate-roster] ' + CORE + ': GATED_SELECTORS is ' +
    JSON.stringify(GATED_SELECTORS) + ' — expected exactly ' +
    JSON.stringify(GATED_SELECTORS_EXPECTED) + '. Contents are pinned as ' +
    'well as count because a RENAME passes a count: the renamed selector ' +
    'stops being gated while the roster still reports the same size.');
}
if (GATED_SELECTORS.indexOf('pickSessionReading') !== -1) {
  violations.push('[gate-roster] ' + CORE + ': GATED_SELECTORS still lists ' +
    "'pickSessionReading' — 26.91 D-06 retired the reading door and " +
    'core.js no longer defines or exports that selector, so this roster ' +
    'entry would make section 1 assert over a function that does not exist');
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

// Slice a top-level function body: from its `function name(` keyword to
// the next function declaration at the module's two-space indent. Both
// files keep a flat, stable layout inside their IIFEs — nested callbacks
// are always indented deeper (or start mid-line), so the boundary holds.
function functionBody(src, file, name, group) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) {
    violations.push('[' + group + '] ' + file + ": function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return null;
  }
  const end = src.indexOf('\n  function ', start + marker.length);
  return {
    text: src.slice(start, end === -1 ? src.length : end),
    line: lineOf(src, start),
    start: start
  };
}

// Balanced-paren argument span starting at an open paren. A static
// heuristic: none of the gated call sites carry parens inside string
// arguments, so plain depth counting is exact here.
function argSpan(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') {
      depth += 1;
    } else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) { return src.slice(openIdx, i + 1); }
    }
  }
  return src.slice(openIdx);
}

// A TIGHT function body: from `function NAME(` to the first line that is
// exactly two spaces and a closing brace — the module-flat close every
// top-level function in these two files uses.
//
// ⚠ DELIBERATELY TIGHTER THAN functionBody ABOVE, and the difference is the
// whole reason it exists. functionBody runs to the NEXT function declaration,
// so it swallows the comment block that introduces that next function. Every
// NEGATIVE scan in section 14 below asks "does this body contain X" — and a
// negative scan that reads a following comment measures prose, not code. That
// trap has been sprung six times in this phase, twice where a prohibition
// written in a comment supplied the very token a negative scan was hunting.
//
// ⚠ IT ASSERTS ITS REGION IS REAL BEFORE ANYTHING IS MEASURED ON IT: the
// marker exists, the marker is UNIQUE, the close exists, the slice begins at
// the named symbol, and it spans more than one line. Two ranges earlier in
// this phase matched their own end pattern on line one and measured nothing
// at all, passing in silence.
function tightBody(src, file, name, group) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) {
    violations.push('[' + group + '] ' + file + ": function '" + name +
      "' not found — renamed or REMOVED. ⛔ Nothing in 26.95-32 may delete " +
      'one of these bodies: a retirement is RECORDED in the dated register, ' +
      'never tidied away to make a count look right (26.95-30 forbids ' +
      'deleting deskStackOpenNext by name)');
    return null;
  }
  if (src.indexOf(marker, start + marker.length) !== -1) {
    violations.push('[' + group + '] ' + file + ": function '" + name +
      "' is declared more than once — the region this gate measures would " +
      'be ambiguous, so nothing is measured');
    return null;
  }
  const close = src.indexOf('\n  }\n', start);
  if (close === -1) {
    violations.push('[' + group + '] ' + file + ": function '" + name +
      "' has no module-indent close — the body could not be bounded, so no " +
      'assertion below it means anything');
    return null;
  }
  const text = src.slice(start, close + 4);
  if (text.indexOf(marker) !== 0 || text.split('\n').length < 2) {
    violations.push('[' + group + '] ' + file + ": the '" + name +
      "' region is empty, one line, or does not begin at the symbol — a " +
      'range that matches its own end on line 1 measures nothing');
    return null;
  }
  return { text: text, line: lineOf(src, start), start: start };
}

// The nearest ENCLOSING top-level function for a source offset: the last
// module-indent `function NAME(` declaration before it. Both files keep a
// flat layout inside their IIFEs — a nested callback is indented deeper or
// starts mid-line — so this is exact rather than a heuristic. Returns
// {name, prefix} where prefix is everything from that declaration up to the
// offset, or null when the offset sits outside any top-level function.
function enclosingTopLevelFn(src, index) {
  const DECL = '\n  function ';
  const at = src.lastIndexOf(DECL, index);
  if (at === -1) { return null; }
  const open = src.indexOf('(', at);
  if (open === -1 || open > index) { return null; }
  return {
    name: src.slice(at + DECL.length, open).trim(),
    prefix: src.slice(at, index)
  };
}

// ---- 1. GATE CONSUMPTION ----------------------------------------------------

GATED_SELECTORS.forEach(function (name) {
  const body = functionBody(coreSrc, CORE, name, 'gate-consumption');
  if (body && !/surfacePool\s*\(/.test(body.text)) {
    violations.push('[gate-consumption] ' + CORE + ':' + body.line +
      " selector '" + name + "' never calls surfacePool( — every surface " +
      'selector must draw from the choke point internally (D-11)');
  }
});

// ---- 2. GATE COMPLETENESS ---------------------------------------------------

const gateBodies = ['surfacePool', 'itemExcluded'].map(function (name) {
  const body = functionBody(coreSrc, CORE, name, 'gate-completeness');
  return body ? body.text : '';
}).join('\n');

[
  { name: 'never_show', re: /never_show/ },
  { name: 'retired', re: /retired/ },
  { name: 'trigger', re: /trigger/ },
  { name: 'matchesFilter(', re: /matchesFilter\s*\(/ }
].forEach(function (tok) {
  if (!tok.re.test(gateBodies)) {
    violations.push('[gate-completeness] ' + CORE +
      ': the surfacePool/itemExcluded bodies never mention ' + tok.name +
      ' — an exclusion class fell out of the gate (D-10: never_show + ' +
      'retired + trigger + filter matches, all four)');
  }
});

// ---- 3. CALL-SITE FILTERS ---------------------------------------------------

GATED_SELECTORS.forEach(function (name) {
  const re = new RegExp('StudyCore\\.' + name + '\\s*\\(', 'g');
  let m;
  let found = 0;
  while ((m = re.exec(appSrc)) !== null) {
    found += 1;
    const open = m.index + m[0].length - 1;
    const span = argSpan(appSrc, open);
    if (!/\bfilters\b/i.test(span)) {
      violations.push('[call-site-filters] ' + APP + ':' +
        lineOf(appSrc, m.index) + ' StudyCore.' + name +
        '( passes no filters argument — offending call: ' +
        span.replace(/\s+/g, ' ').slice(0, 120));
    }
  }
  if (found === 0) {
    violations.push('[call-site-filters] ' + APP + ': no StudyCore.' + name +
      '( call site found — the surface is not wired to the gated selector');
  }
});

// ---- 4. EXEMPTION BOUNDARY --------------------------------------------------

const START = 'SURFACE-EXEMPT: MANAGE VIEW START';
const END = 'SURFACE-EXEMPT: MANAGE VIEW END';
const si = appSrc.indexOf(START);
const ei = appSrc.indexOf(END);
const regionOk = si !== -1 && ei !== -1 && ei > si;

if (si === -1) {
  violations.push('[exemption-boundary] ' + APP + ": the '" + START +
    "' sentinel is missing — the manage exemption must be declared in " +
    'the source (D-10)');
} else if (!regionOk) {
  violations.push('[exemption-boundary] ' + APP + ": the '" + END +
    "' sentinel is missing or precedes START");
}

if (regionOk) {
  if (appSrc.indexOf(START, si + 1) !== -1) {
    violations.push('[exemption-boundary] ' + APP +
      ': more than one START sentinel — the exemption must be ONE region');
  }
  if (appSrc.indexOf(END, ei + 1) !== -1) {
    violations.push('[exemption-boundary] ' + APP +
      ': more than one END sentinel — the exemption must be ONE region');
  }
  const region = appSrc.slice(si, ei);
  if (!/itemsInState\s*\(/.test(region)) {
    violations.push('[exemption-boundary] ' + APP +
      ': itemsInState( not found inside the exempt region — the ' +
      'raw-state lister moved or was renamed; update this gate ' +
      'deliberately');
  }
  ['Hidden (', 'You put these away for good (', 'Retired ('].forEach(function (label) {
    if (region.indexOf(label) === -1) {
      violations.push('[exemption-boundary] ' + APP +
        ": the exempt region is missing the excluded-section label '" +
        label + "' (D-10: the one deliberate reveal place must be " +
        'explicitly labeled)');
    }
  });
}

// Everything OUTSIDE the exempt region — the surface where raw-state
// listing is a leak path, wherever the sentinels stand.
const scanOutside = regionOk ?
  appSrc.slice(0, si) + appSrc.slice(ei) : appSrc;

{
  const re = /itemsInState\s*\(/g;
  let m;
  while ((m = re.exec(scanOutside)) !== null) {
    const realIdx = regionOk && m.index >= si ? m.index + (ei - si) : m.index;
    violations.push('[exemption-boundary] ' + APP + ':' +
      lineOf(appSrc, realIdx) + ' itemsInState( outside the ' +
      'SURFACE-EXEMPT region — raw-state listing is legal only inside ' +
      'the manage view (D-10)');
  }
}

// ---- 5. GUARD WIRED ---------------------------------------------------------

if (!/guardSurface\s*:\s*guardSurface/.test(coreSrc)) {
  violations.push('[guard-wired] ' + CORE +
    ': guardSurface is not exported from StudyCore — the render layer ' +
    'cannot re-check without it (D-13)');
}

const guardHits = (scanOutside.match(/guardSurface\s*\(/g) || []).length;
if (guardHits < 4) {
  violations.push('[guard-wired] ' + APP + ': guardSurface( appears ' +
    guardHits + ' time(s) outside the exempt region — the shelf, cover, ' +
    'album, and journal render paths must all re-check immediately ' +
    'before display (D-13, expected >= 4)');
}

// ---- 6. COVER DISCIPLINE ----------------------------------------------------

const cover = functionBody(appSrc, APP, 'renderCover', 'cover-discipline');
if (cover) {
  [
    { name: "the item's name property (dot-title)", re: /\.title\b/ },
    { name: 'the content route (slash-lib-slash)', re: /\/lib\// },
    { name: 'renderMarkdown(', re: /renderMarkdown\s*\(/ }
  ].forEach(function (tok) {
    const m = cover.text.match(tok.re);
    if (m) {
      violations.push('[cover-discipline] ' + APP + ':' +
        lineOf(appSrc, cover.start + m.index) +
        ' renderCover references ' + tok.name +
        ' — a cover shows source · date · type ONLY and fetches nothing ' +
        'before the verdict (D-02)');
    }
  });
}

// ---- 7. VAULT IMPORT FENCE (26.4-01, D-06/SC3) ------------------------------
//
// The whole-vault import + fence-disclosure screen must (a) list the ACTIVE
// roster before any read — renderVaultImportScreen reads meta.fenced_roster
// and must NOT fire the vault read; (b) write every roster edit through the
// SAME roster route the born-flag reads; (c) fire the vault-root import ONLY
// from the confirm action. Static text scan, mirroring the groups above.

(function () {
  const render = functionBody(appSrc, APP, 'renderVaultImportScreen',
    'vault-fence');
  if (render) {
    if (!/fenced_roster/.test(render.text)) {
      violations.push('[vault-fence] ' + APP + ':' + render.line +
        ' renderVaultImportScreen never reads fenced_roster — the fence ' +
        'screen must list the ACTIVE roster before any read (SC3, D-06)');
    }
    if (/\/api\/import\b/.test(render.text)) {
      violations.push('[vault-fence] ' + APP + ':' + render.line +
        ' renderVaultImportScreen references /api/import — the vault read ' +
        'must NOT fire while the disclosure renders (only on confirm, SC3)');
    }
  }
  const edit = functionBody(appSrc, APP, 'editVaultRoster', 'vault-fence');
  if (edit && !/\/api\/librarian\/roster/.test(edit.text)) {
    violations.push('[vault-fence] ' + APP + ':' + edit.line +
      ' editVaultRoster must write through the /api/librarian/roster route ' +
      "— a roster edit uses the SAME operation the born-flag reads (D-06)");
  }
  const confirmFn = functionBody(appSrc, APP, 'confirmVaultImport',
    'vault-fence');
  if (confirmFn && !/\/api\/import\b/.test(confirmFn.text)) {
    violations.push('[vault-fence] ' + APP + ':' + confirmFn.line +
      ' confirmVaultImport must fire the vault-root import (/api/import) — ' +
      'the read starts ONLY on confirm (SC3)');
  }
  // ⚠⚠ 26.95-03 (#92): AND IT MUST ARM THE READER. The pin above proves the
  // import STARTS; nothing proved anyone ever looked at it again. For the
  // whole life of this screen `doVaultImport` painted the first progress
  // frame and never polled — "copying your things in: 0 of N" for ever,
  // while the import completed correctly underneath — and every suite in
  // this repo was green throughout, this group included.
  //
  // ⚠ THE FIRST FRAME IS NOT THE EVIDENCE, so this deliberately does not
  // match `renderImportProgress`: that call is what SURVIVED the defect.
  // What was missing is the chain, so the chain is what is pinned.
  if (confirmFn && !/readImportProgress\s*\(/.test(confirmFn.text)) {
    violations.push('[vault-fence] ' + APP + ':' + confirmFn.line +
      ' confirmVaultImport paints the import progress but never calls ' +
      'readImportProgress — the whole-vault screen would sit at "0 of N" ' +
      'for ever while the import finished underneath (#92). The call site ' +
      'IS the repair');
  }
  // And it must hand the reader THIS screen, not the folder path's. With the
  // default context the chain's own active-screen guard reads #screen-setup,
  // which is not showing — so it would return on the very first read and the
  // bug would look fixed while behaving exactly as before.
  // ⚠ MATCHED ON THE DECLARATION, NOT ON THE STRING ANYWHERE IN THE FILE.
  // The first spelling of this pin scanned the whole source for
  // 'screen-vault-import' and passed while the context was gutted, because a
  // COMMENT elsewhere mentions the same id. A pin a mutation cannot turn red
  // is a pin that measures prose.
  if (!/VAULT_IMPORT_READ\s*=\s*\{[^}]*screen:\s*'screen-vault-import'/
      .test(appSrc)) {
    violations.push('[vault-fence] ' + APP + ': VAULT_IMPORT_READ must name ' +
      "screen-vault-import — the shared reader's active-screen guard would " +
      'otherwise ask about the folder path\'s screen, which is not showing, ' +
      'and end the chain on its very first read (#92). The bug would look ' +
      'fixed and behave exactly as before');
  }
  if (confirmFn && !/readImportProgress\s*\([^)]*VAULT_IMPORT_READ/
      .test(confirmFn.text)) {
    violations.push('[vault-fence] ' + APP + ':' + confirmFn.line +
      ' the vault reader is armed without its own context — see above (#92)');
  }
})();

// ---- 8. DESK PROPOSAL ALLOW / PASS (26.4-03, T-26.4-09, D-02) ----------------
//
// The consent gate made textual: Allow promotes the current proposal ONLY
// through the shipped /api/state path (the 26.4-02 promote verb it invokes
// is the ONLY writer of the shelf, books.json — the UI writes no store);
// Pass drops the proposal from today's stack and NEVER writes the shelf (no
// promote, no book). Static text scan over the two named handlers, mirroring
// the groups above. NOTE: the word that names the shelf-write verb must not
// appear in passProposal at all (comments included) — a Pass that mentioned
// it would blur the one-writer discipline this gate protects.

(function () {
  const allow = functionBody(appSrc, APP, 'allowProposal',
    'proposal-consent');
  if (allow) {
    if (!/apiPost\(\s*['"]\/api\/state['"]/.test(allow.text)) {
      violations.push('[proposal-consent] ' + APP + ':' + allow.line +
        ' allowProposal must promote through the shipped /api/state path ' +
        '(the ONLY shelf writer, T-26.4-09)');
    }
    if (!/\bpromote\b/.test(allow.text)) {
      violations.push('[proposal-consent] ' + APP + ':' + allow.line +
        ' allowProposal must carry the promote verb in its /api/state ' +
        'write (law 2/7: Allow is the sole promote action)');
    }
  }
  const pass = functionBody(appSrc, APP, 'passProposal', 'proposal-consent');
  if (pass) {
    if (/\bpromote\b/.test(pass.text)) {
      violations.push('[proposal-consent] ' + APP + ':' + pass.line +
        ' passProposal must NOT reference the promote verb — a Pass leaves ' +
        'the proposal unshelved and writes no book (D-02)');
    }
    if (/\/api\/state/.test(pass.text) && !/\bpass\b/.test(pass.text)) {
      violations.push('[proposal-consent] ' + APP + ':' + pass.line +
        ' passProposal must carry the pass verb, never a state change that ' +
        'writes the shelf (D-02)');
    }
  }
})();

// ---- 9. INSIGHT BOOKSHELF (26.4-04, UNIFY, D-14/D-19, law 2/7) ---------------
//
// The bookshelf IS the insight library. This group pins the load-bearing
// disciplines of the shelf payoff as static text facts:
//   (a) READ-ONLY SHELF — nothing auto-shelves (law 2/7): the whole insight
//       render family writes NO store. Not one apiPost( appears in any of
//       the six functions; the /api/state promote (the ONLY shelf writer) is
//       the desk's Allow, tested in group 8, never the shelf.
//   (b) FENCE THROUGH THE CHOKE POINT (D-19) — buildInsightBooks draws every
//       item from StudyCore.surfacePool BEFORE grouping, so a fenced / never
//       / retired / born-flagged item is absent from every count and surface.
//   (c) BOOKS-STORE READ — openInsightLibrary reads the allowed-connection
//       store /api/librarian/books (the read companion to the promote verb).
//   (d) D-14 FALLBACK — the Manage "about your library" row uses the SAME
//       buildInsightBooks source of truth, so the insights are never hostage
//       to the shelf sprite.
//   (e) COPY PINS — the empty-shelf heading + body and the three
//       deterministic insight-book titles are byte-exact (UI-SPEC).

(function () {
  var READONLY_FNS = ['buildInsightBooks', 'openInsightLibrary',
    'openInsightBook', 'renderInsightShelf', 'openInsightItem',
    'fillInsightPieces', 'renderLibrarySection'];
  READONLY_FNS.forEach(function (name) {
    var body = functionBody(appSrc, APP, name, 'insight-shelf');
    if (body && /apiPost\s*\(/.test(body.text)) {
      violations.push('[insight-shelf] ' + APP + ':' + body.line +
        " insight fn '" + name + "' calls apiPost( — the shelf is READ-ONLY " +
        '(law 2/7: nothing auto-shelves; only the desk Allow promotes)');
    }
  });

  var build = functionBody(appSrc, APP, 'buildInsightBooks', 'insight-shelf');
  if (build && !/surfacePool\s*\(/.test(build.text)) {
    violations.push('[insight-shelf] ' + APP + ':' + build.line +
      ' buildInsightBooks never calls surfacePool( — every insight must ' +
      'draw from the shipped fence choke point first (D-19)');
  }

  var lib = functionBody(appSrc, APP, 'openInsightLibrary', 'insight-shelf');
  if (lib && !/\/api\/librarian\/books/.test(lib.text)) {
    violations.push('[insight-shelf] ' + APP + ':' + lib.line +
      ' openInsightLibrary must read /api/librarian/books — the shelf reads ' +
      'the allowed-connection store (the read side of the promote verb)');
  }

  var fallback = functionBody(appSrc, APP, 'renderLibrarySection',
    'insight-shelf');
  if (fallback && !/buildInsightBooks\s*\(/.test(fallback.text)) {
    violations.push('[insight-shelf] ' + APP + ':' + fallback.line +
      ' the D-14 Manage fallback must render from buildInsightBooks — the ' +
      'insights are never hostage to the shelf sprite (D-14)');
  }

  [
    'An empty shelf, waiting.',
    'Things you saved and never opened.',
    'What your library is made of.',
    'What you were drawn to, season by season.'
  ].forEach(function (lit) {
    if (appSrc.indexOf(lit) === -1) {
      violations.push('[insight-shelf] ' + APP + ": the byte-pinned copy '" +
        lit + "' is missing — the UI-SPEC insight copy is a contract");
    }
  });
})();

// ---- group 9: connection surfaces re-guard the connected TITLE (CR-1) --------
//   The desk proposal stack (renderProposalTop) and the thread insight book
//   (openInsightBook) each render a connected item's TITLE. Law 5 forbids a
//   fenced / never / retired / born-flagged item's title from appearing on ANY
//   surface — the app promises "not even their titles". Both renderers MUST
//   re-apply StudyCore.guardSurface to the connected item BEFORE its title is
//   emitted (the belt to the server's generation-time braces): a connection
//   whose item is fenced AFTER the proposal/allow must render nothing, exactly
//   as the never-book path already guards. Cross-AI review finding CR-1.
(function () {
  [['renderProposalTop', 'desk proposal'],
   ['openInsightBook', 'thread insight book']].forEach(function (pair) {
    var name = pair[0], label = pair[1];
    var fn = functionBody(appSrc, APP, name, 'connection-title-fence');
    if (!fn) {
      violations.push('[connection-title-fence] ' + APP + ': ' + name +
        ' not found — cannot verify the CR-1 connected-title guard');
      return;
    }
    var gi = fn.text.indexOf('guardSurface(');
    var ti = fn.text.indexOf('card-title');
    if (gi === -1) {
      violations.push('[connection-title-fence] ' + APP + ':' + fn.line +
        ' ' + name + ' (' + label + ') renders a connected title but never ' +
        'calls StudyCore.guardSurface — a since-fenced item title can leak ' +
        '(law 5: not even their titles)');
    } else if (ti !== -1 && gi > ti) {
      violations.push('[connection-title-fence] ' + APP + ':' + fn.line +
        ' ' + name + ' (' + label + ') calls guardSurface AFTER emitting the ' +
        'connected title — the guard must gate the whole piece, title included');
    }
  });
})();

// ---- group 10: the connection run is actually TRIGGERED by the client --------
//   The whole "Librarian at the Desk" mechanic is dead unless SOMETHING in the
//   client POSTs /api/librarian/connect — the run that fills insights.json (→
//   desk proposals → candle reaching → Allow → books). The server route +
//   generator existed from wave 2, and the desk/candle READ the result from
//   wave 3, but for a while nothing wired the TRIGGER between them (the desk was
//   permanently empty, the candle never reached). This guards that wire.
//   Chosen trigger: a deliberate candle tap (askCandleForConnections).
(function () {
  if (!/apiPost\(\s*['"]\/api\/librarian\/connect['"]/.test(appSrc)) {
    violations.push('[connect-trigger] ' + APP + ': nothing POSTs ' +
      '/api/librarian/connect — the connection run is never triggered, so ' +
      'the desk proposal stack is permanently empty and the candle never ' +
      'reaches (the phase mechanic is dead). Wire a user-initiated trigger.');
  }
  var ask = functionBody(appSrc, APP, 'askCandleForConnections',
    'connect-trigger');
  if (!ask) {
    violations.push('[connect-trigger] ' + APP + ': askCandleForConnections ' +
      '(the deliberate-tap trigger) is missing');
  } else if (!/apiPost\(\s*['"]\/api\/librarian\/connect['"]/.test(ask.text)) {
    violations.push('[connect-trigger] ' + APP + ':' + ask.line +
      ' askCandleForConnections must POST /api/librarian/connect');
  }
})();

// ---- 11. ONBOARDING SOURCES ENTRY (26.6-05, SC4, T-26.6-06 fence-bypass) -----
//
// The first-run sources step (renderOnbSources) frames the sources and hands
// the whole-vault path to the SHIPPED #screen-vault-import through
// enterVaultImport — it must NEVER fire /api/import itself. The vault read
// starts ONLY on confirmVaultImport (group 7 already pins that renderVault-
// ImportScreen and enterVaultImport never import). This group extends the
// invariant to the ONBOARDING entry: the sources step never imports at render,
// and it reaches the vault fence through enterVaultImport, so the shipped
// confirm-gated fence is the only door to the read (import never fires
// before confirm).

(function () {
  // The read is a POST to /api/import; match the actual call (apiPost),
  // never a mere comment mention of the route.
  const IMPORT_POST = /apiPost\(\s*['"]\/api\/import['"]/;
  const sources = functionBody(appSrc, APP, 'renderOnbSources', 'onb-sources');
  if (sources) {
    if (IMPORT_POST.test(sources.text)) {
      violations.push('[onb-sources] ' + APP + ':' + sources.line +
        ' renderOnbSources fires /api/import — the onboarding sources ' +
        'step must never fire the read; it hands off to the shipped ' +
        'confirm-gated vault import (T-26.6-06)');
    }
    if (!/enterVaultImport\b/.test(sources.text)) {
      violations.push('[onb-sources] ' + APP + ':' + sources.line +
        ' renderOnbSources must expose the whole-vault path via ' +
        'enterVaultImport (the shipped #screen-vault-import fence roster), ' +
        'never a parallel roster path (SC4)');
    }
  }
  // enterVaultImport is the onboarding entry point to the fence screen: it
  // reads the ACTIVE roster and shows the disclosure, and must NOT import.
  const enter = functionBody(appSrc, APP, 'enterVaultImport', 'onb-sources');
  if (enter && IMPORT_POST.test(enter.text)) {
    violations.push('[onb-sources] ' + APP + ':' + enter.line +
      ' enterVaultImport fires /api/import — entering the fence screen ' +
      '(the onboarding whole-vault entry) must never fire the vault read; ' +
      'only confirmVaultImport does (SC4)');
  }
})();

// ---- 12. WALK BOUNDARY MIRROR (26.8-01 Open Q1; REWRITTEN 26.95-32 D-03) ----
//
// The walk's first-session window is a CLIENT constant
// (WALK_FIRST_WINDOW_MS, app.js) mirroring the server's
// REFLECTION_FIRST_WINDOW_MS (server.py). A duplicated constant WILL
// drift, so both files are read as text and the two value expressions
// compared byte-for-byte (whitespace-normalized): change one and this
// gate fails until the other follows deliberately.
//
// ⚠ 26.95-32 (D-03) CHANGED THIS PIN'S SUBJECT, AND THE PIN IS REWRITTEN
// RATHER THAN DELETED — a deleted pin is drift that fails nothing.
//
// WHAT CHANGED. The walk's boundary used to be read off the marker the
// librarian writes when it finishes a reflection; it is now read off the
// marker the room writes when she opens it, because the reach and the date it
// reaches from must not be measured from two different days. So the SOURCE of
// the boundary moved.
//
// WHAT DID NOT, AND WHY THE PIN STILL HOLDS. This gate was never about which
// marker is read. It is about the two FILES AGREEING ON HOW WIDE A ROOM WITH
// NO MARKER AT ALL CONSIDERS — the fallback window, and nothing else. A client
// that considered a different span from the server would offer out of a pool
// the server never screened, which is a law-5 surface, not a cosmetic drift.
// That claim is exactly as true after D-03 as before it, so the comparison
// below is unchanged and only its stated subject is restated here.
//
// ⚠ THE OTHER HALF OF THE REWRITE LIVES IN SECTION 14 (D), and it is what
// makes this a fresh instrument rather than a re-worded old one: this section
// proves the two NUMBERS still match, and section 14 proves the client
// constant is actually READ by the walk stage and that the stage measures from
// the visit marker. Two files agreeing about a constant nobody consumes is a
// pin that cannot fail for the reason it claims to exist.

(function () {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const srvM = srvSrc.match(
    /^REFLECTION_FIRST_WINDOW_MS\s*=\s*([^#\n]+)/m);
  const appM = appSrc.match(/var WALK_FIRST_WINDOW_MS\s*=\s*([^;]+);/);
  if (!srvM) {
    violations.push('[walk-boundary] server.py: ' +
      'REFLECTION_FIRST_WINDOW_MS not found — the walk boundary mirror ' +
      'has nothing to pin against');
  }
  if (!appM) {
    violations.push('[walk-boundary] ' + APP + ': WALK_FIRST_WINDOW_MS ' +
      'not declared — the walk needs the mirrored first-session window');
  }
  if (srvM && appM) {
    const norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };
    if (norm(srvM[1]) !== norm(appM[1])) {
      violations.push('[walk-boundary] the two window constants ' +
        'diverge — server.py REFLECTION_FIRST_WINDOW_MS = ' +
        norm(srvM[1]) + ' vs app.js WALK_FIRST_WINDOW_MS = ' +
        norm(appM[1]) + ' (mirror + pin: change both together, ' +
        'deliberately)');
    }
  }
})();

// ---- 13. THE REACH BACK'S TWO CROSS-FILE PINS (26.95-30; P-9 and W-6) -------
//
// (a) THE P-9 CALL-SITE GATE. pickOfferCandidates takes its fortnight in opts
//     and its clock as an argument, and A COMPARISON AGAINST undefined IS
//     FALSE — so an unsupplied bound drops EVERY candidate, silently, on
//     exactly the path that most needs to work. There are two guards because
//     one is not enough: core.js treats a missing or non-finite bound as a
//     programming error and returns [] (pinned by
//     tests/test_offer_selector.cjs, whose case drives the difference with a
//     poisoned item map because asserting [] alone cannot fail when the guard
//     is deleted), and THIS gate makes that branch unreachable in production
//     by asserting every call site textually passes both inside its argument
//     span. Group 3 above already proves the same call sites pass `filters`;
//     this is that idiom, one plan later.
//
//     ⛔ AND IT NOW GATES THE OTHER WAY TOO (D-05 amendment, 2026-08-16, UAT
//     finding F-5). `beforeYear` used to be the second key and every caller
//     filled it from the SEED's own capture date, so welcoming an old
//     photograph dropped the ceiling to its year and one Offer narrowed the
//     next — 332 photographs reachable on the owner's library before her first
//     Offer, 0 after it. The year bound is derived from the clock INSIDE the
//     selector now and is nobody's to pass. A call site that passes it anyway
//     would be SILENTLY IGNORED, which is the worst of both: it reads like a
//     bound and does nothing. So the key is banned at the call site rather
//     than merely unused, and this gate is what makes the ban visible.
//
// (b) THE W-6 CROSS-LANGUAGE CAP PIN. server.py caps the Offer at
//     OFFER_MOMENT_CAP Moments and app.js packs OFFER_SLOTS_PER_PAGE slots
//     onto the page. A duplicated constant WILL drift, and the drift is
//     SILENT: the server would hand back three while the page laid out two,
//     or the page would hold four slots the server never fills. Both files are
//     read as text and the two value expressions compared byte-for-byte
//     (whitespace-normalised) — exactly the register group 12 uses for
//     WALK_FIRST_WINDOW_MS <-> REFLECTION_FIRST_WINDOW_MS. Change one and this
//     gate fails until the other follows, deliberately.

(function () {
  // (a) --------------------------------------------------------------------
  const re = /StudyCore\.pickOfferCandidates\s*\(/g;
  let m;
  let found = 0;
  while ((m = re.exec(appSrc)) !== null) {
    found += 1;
    const open = m.index + m[0].length - 1;
    const span = argSpan(appSrc, open);
    [['fortnight', /\bfortnight\b/], ['nowMs', /\bnowMs\b/]]
      .forEach(function (pair) {
        if (!pair[1].test(span)) {
          violations.push('[offer-bounds] ' + APP + ':' +
            lineOf(appSrc, m.index) + ' StudyCore.pickOfferCandidates( ' +
            'passes no ' + pair[0] + ' — an absent bound compares against ' +
            'undefined and empties the Offer in silence (P-9). Offending ' +
            'call: ' + span.replace(/\s+/g, ' ').slice(0, 160));
        }
      });
    // ⛔ THE RETIRED KEY, BANNED RATHER THAN IGNORED (D-05 amendment). See the
    // block above: a call site passing it would read like a ceiling and do
    // nothing at all.
    if (/\bbeforeYear\b/.test(span)) {
      violations.push('[offer-bounds] ' + APP + ':' +
        lineOf(appSrc, m.index) + ' StudyCore.pickOfferCandidates( passes ' +
        'beforeYear — the year bound is derived from the clock inside the ' +
        'selector and is not a call site\'s to supply. Passing it is silently ' +
        'ignored, and filling it from the Seed is UAT finding F-5, the ' +
        'ratchet that shut the door after one Offer. Offending call: ' +
        span.replace(/\s+/g, ' ').slice(0, 160));
    }
  }
  if (found === 0) {
    violations.push('[offer-bounds] ' + APP + ': no ' +
      'StudyCore.pickOfferCandidates( call site found — the Offer is not ' +
      'wired to the gated selector, and this gate would pass over a dead ' +
      'surface');
  }

  // (b) --------------------------------------------------------------------
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const srvM = srvSrc.match(/^OFFER_MOMENT_CAP\s*=\s*([^#\n]+)/m);
  const appM = appSrc.match(/var OFFER_SLOTS_PER_PAGE\s*=\s*([^;]+);/);
  if (!srvM) {
    violations.push('[offer-cap] server.py: OFFER_MOMENT_CAP not declared at ' +
      'module level — the cross-language cap pin has nothing to pin against');
  }
  if (!appM) {
    violations.push('[offer-cap] ' + APP + ': OFFER_SLOTS_PER_PAGE not ' +
      'declared — the Offer page needs the mirrored slot count');
  }
  if (srvM && appM) {
    const norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };
    if (norm(srvM[1]) !== norm(appM[1])) {
      violations.push('[offer-cap] the two Offer constants diverge — ' +
        'server.py OFFER_MOMENT_CAP = ' + norm(srvM[1]) + ' vs app.js ' +
        'OFFER_SLOTS_PER_PAGE = ' + norm(appM[1]) + '. The server would cap ' +
        'at one number while the page packed another, silently (W-6). ' +
        'Mirror + pin: change both together, deliberately');
    }
  }
})();

// ---- 14. THE RETIREMENT REGISTER AND THE NARROWING (26.95-32; G-9, P-8) -----
//
// ⚠ THE DATED RETIREMENT REGISTER. Three plans in this repository have now
// taken a caller away from a shipped function, and the shipped answer every
// time is the same: KEEP THE BODY, DROP IT FROM THE GATE ROSTER, WRITE THE
// DATE AND THE REASON BESIDE IT. Deleting a body to make a count look right is
// precisely the move this register exists to catch. What 26.95-32 retired:
//
//   pickWalkArrivals   core.js  · 2026-08-15 · 26.95-32, D-08 · the session
//       walk stopped picking arrivals and now opens the visit's one Offer, so
//       the selector lost its last call site. Body and export table entry both
//       RETAINED and pinned by name in (A) below. Off GATED_SELECTORS.
//   deskStackOpenNext  app.js   · 2026-08-15 · 26.95-32, D-08 · the album pile
//       was its last caller and is now a door onto the Offer. ⛔ 26.95-30
//       FORBIDS DELETING THIS FUNCTION BY NAME. Body RETAINED, and the second
//       (retired) pickBlessingCandidates occurrence lives inside it — pinned
//       by region in (B) so a later reader cannot "fix" the count by removing
//       a function a ruling protects.
//   sessionWalkClose   app.js   · 2026-08-15 · 26.95-32, D-08 · ⚠ THIS ONE IS
//       NOT IN THE PLAN. It lost its caller as a side effect of the walk
//       opening the Offer and resolving on the same tap. Recorded here so the
//       loss is deliberate rather than discovered later as a stray; retained,
//       and its retention pinned in (A) alongside the other bodies.
//   SESSION.walkIds    app.js   · 2026-08-15 · 26.95-32, D-08 · the walk no
//       longer carries a list of arrival ids. The slot is still reset with the
//       rest of the session's beat flags and is RETAINED deliberately — the
//       walk chassis is retained, never re-implemented (D-08).
//
// ⚠ WHAT G-9's WORDING MEANS, STATED IN FULL BECAUSE TWO DOCUMENTS SAY IT TWO
// WAYS AND A LATER READER WILL OTHERWISE "FIX" A CORRECT GATE FROM ONE SIDE OR
// DELETE A PROTECTED FUNCTION FROM THE OTHER.
//   · UI-SPEC G-9 says pickBlessingCandidates "has exactly two". D-10 says
//     "exactly two callers": the guided first pass, and the deliberate grind
//     in Manage.
//   · Those TWO CALLERS both reach the selector through startBlessing ALONE.
//     They are two entry points into ONE function, not two call sites. D-10's
//     substance is therefore UNAFFECTED by anything in this plan.
//   · The FILE-WIDE count of `StudyCore.pickBlessingCandidates(` is TWO, and
//     the second one is not a second live caller: it is the retired-but-
//     retained occurrence inside deskStackOpenNext. That is why (B) asserts
//     BY REGION — one inside startBlessing, one inside deskStackOpenNext, and
//     none anywhere else — instead of asserting a bare total that cannot say
//     which is which.
//
// (E) is the STATIC half of P-8; the live half (painting the album scene
// leaves the visit's Offer unspent) belongs to the session-flow suite.

(function () {
  let G14 = 0;
  function check(ok, message) {
    G14 += 1;
    if (!ok) { violations.push(message); }
  }
  function countOf(src, needle) {
    let n = 0;
    let at = src.indexOf(needle);
    while (at !== -1) { n += 1; at = src.indexOf(needle, at + needle.length); }
    return n;
  }

  // (A) THE RETIREMENT, AND THE PROMISE THAT NOTHING WAS DELETED ------------
  //
  // Both halves matter and neither is sufficient alone. Zero call sites is the
  // retirement; a body and an export entry still standing is the promise.
  // ⚠ The name is written in DOUBLE quotes throughout this section, on
  // purpose: the single-quoted spelling is reserved for GATED_SELECTORS
  // membership, so a grep for the roster spelling reads zero and means it.
  const WALK_SELECTOR = "pickWalkArrivals";

  check(countOf(appSrc, 'StudyCore.' + WALK_SELECTOR) === 0,
    '[retired-selector] ' + APP + ': StudyCore.' + WALK_SELECTOR +
    ' still has ' + countOf(appSrc, 'StudyCore.' + WALK_SELECTOR) +
    ' call site(s) — 26.95-32 (D-08) retired it: the walk opens the visit ' +
    "Offer through the shared door entry and picks no arrivals of its own");
  check(coreSrc.indexOf('function ' + WALK_SELECTOR + '(') !== -1,
    '[retired-selector] ' + CORE + ': the pure ' + WALK_SELECTOR + ' body is ' +
    'GONE. ⛔ A retirement keeps the body and records the date beside it ' +
    '(the pickJournalItems precedent, 26.8.1-02). Losing a caller is not ' +
    'permission to delete a function');
  check(coreSrc.indexOf(WALK_SELECTOR + ': ' + WALK_SELECTOR) !== -1,
    '[retired-selector] ' + CORE + ': ' + WALK_SELECTOR + ' left the export ' +
    'table. The roster entry went deliberately; the EXPORT did not, and a ' +
    'body no caller can reach is a body that gets deleted next');

  // The two app.js bodies that lost their callers in this plan. Asserted only
  // for EXISTENCE here — callerlessness is recorded in the register above and
  // is not re-measured, because a count nobody verified is worse than no
  // count. What must not happen is deletion, and that is what this catches.
  ['deskStackOpenNext', 'sessionWalkClose'].forEach(function (name) {
    tightBody(appSrc, APP, name, 'retired-body');
  });

  // (B) THE NARROWING, BY REGION ---------------------------------------------

  const BLESS_CALL = 'StudyCore.pickBlessingCandidates(';
  const blessTotal = countOf(appSrc, BLESS_CALL);
  check(blessTotal === 2,
    '[bless-narrowing] ' + APP + ': ' + BLESS_CALL + ' appears ' + blessTotal +
    ' time(s) — pinned BY VALUE at exactly 2 after 26.95-32 (D-08/D-10). ONE ' +
    'is LIVE (inside startBlessing, serving both of D-10\'s ruled callers ' +
    'through one function) and ONE is RETIRED-BUT-RETAINED (inside ' +
    'deskStackOpenNext, which 26.95-30 forbids deleting). A THIRD site is a ' +
    'new ungoverned entry into the guided pass');

  [['startBlessing', 'the LIVE call site — the guided first pass and the ' +
    'Manage grind both reach the selector through this one function (D-10)'],
   ['deskStackOpenNext', 'the RETIRED-BUT-RETAINED occurrence. ⛔ Do not ' +
    'delete this function to make the total read 1: 26.95-30 forbids it by ' +
    'name, and the retirement is recorded in the register above']
  ].forEach(function (pair) {
    const body = tightBody(appSrc, APP, pair[0], 'bless-narrowing');
    if (!body) { return; }
    const n = countOf(body.text, BLESS_CALL);
    check(n === 1,
      '[bless-narrowing] ' + APP + ':' + body.line + ' ' + pair[0] +
      ' holds ' + n + ' ' + BLESS_CALL + ' occurrence(s), expected 1 — ' +
      pair[1]);
  });

  // (C) THE ROUND-ROBIN, BYTE-IDENTICAL --------------------------------------
  //
  // CONTEXT D-10 pins the folder/type round-robin explicitly: it exists so
  // folders mix instead of one pile front-loading the guided pass. This plan
  // REMOVES CALLERS from the function that owns it, which is exactly the
  // change that invites an incidental edit while someone is "in there anyway".
  //
  // ⚠ THE COMPARISON IS BYTE-EXACT EXCEPT FOR TRAILING WHITESPACE, and the
  // exception is stated rather than hidden. Every visible character —
  // indentation, punctuation, identifier, comment — is pinned line for line.
  // Only invisible run-off at the end of a line is tolerated, because this
  // expectation was transcribed by reading the file and trailing whitespace
  // cannot be read; pinning it would risk a gate that is red on correct code,
  // which is worse than a gate blind to a space nobody can see.
  const ROUND_ROBIN = [
    "    var prefixLen = commonDirPrefixLen(unseen);",
    "    // Group into buckets; bucket order = order of each bucket's oldest",
    "    // member (first appearance in the globally sorted list), so the very",
    "    // first card is the oldest thing the user owns.",
    "    var bucketKeys = [];",
    "    var buckets = {};",
    "    unseen.forEach(function (it) {",
    "      var segs = dirSegments(it.origin_path);",
    "      var folder = segs.length > prefixLen ? segs[prefixLen] : '(root)';",
    "      var key = (it.type || '') + '|' + folder;",
    "      if (!buckets[key]) {",
    "        buckets[key] = [];",
    "        bucketKeys.push(key);",
    "      }",
    "      buckets[key].push(it);",
    "    });",
    "    // Round-robin: one item per bucket per round, skipping exhausted",
    "    // buckets, until the count is reached or everything is taken.",
    "    var picks = [];",
    "    var round = 0;",
    "    while (picks.length < count) {",
    "      var took = false;",
    "      for (var i = 0; i < bucketKeys.length && picks.length < count; i++) {",
    "        var bucket = buckets[bucketKeys[i]];",
    "        if (round < bucket.length) {",
    "          picks.push(bucket[round].id);",
    "          took = true;",
    "        }",
    "      }",
    "      if (!took) { break; }",
    "      round++;",
    "    }",
    "    return picks;"
  ];
  const rr = (function () {
    const body = tightBody(coreSrc, CORE, 'pickBlessingCandidates',
      'round-robin');
    if (!body) { return null; }
    const head = ROUND_ROBIN[0];
    const tail = ROUND_ROBIN[ROUND_ROBIN.length - 1];
    const si = body.text.indexOf(head);
    if (si === -1 || body.text.indexOf(head, si + head.length) !== -1) {
      violations.push('[round-robin] ' + CORE + ':' + body.line +
        ' the round-robin start anchor is missing or not unique inside ' +
        'pickBlessingCandidates — the region cannot be bounded, so nothing ' +
        'below it is measured');
      return null;
    }
    const ei = body.text.indexOf(tail, si + head.length);
    if (ei === -1) {
      violations.push('[round-robin] ' + CORE + ':' + body.line +
        ' the round-robin end anchor is missing — the region cannot be ' +
        'bounded');
      return null;
    }
    return body.text.slice(si, ei + tail.length).split('\n');
  })();
  const rtrim = function (s) { return s.replace(/[ \t]+$/, ''); };
  check(!!rr && rr.length === ROUND_ROBIN.length,
    '[round-robin] ' + CORE + ': the round-robin region spans ' +
    (rr ? rr.length : 0) + ' line(s), expected exactly ' + ROUND_ROBIN.length +
    ' — a line was added or removed inside the folder/type interleave that ' +
    'CONTEXT D-10 pins by name');
  check(!!rr && rr.length === ROUND_ROBIN.length &&
    rr.every(function (line, i) {
      return rtrim(line) === rtrim(ROUND_ROBIN[i]);
    }),
    '[round-robin] ' + CORE + ': the round-robin body differs from its pinned ' +
    'text. First difference: ' + (function () {
      if (!rr) { return '(region not bounded)'; }
      for (let i = 0; i < Math.max(rr.length, ROUND_ROBIN.length); i++) {
        if (rtrim(rr[i] || '') !== rtrim(ROUND_ROBIN[i] || '')) {
          return 'line ' + (i + 1) + ' — found ' +
            JSON.stringify(rr[i] === undefined ? null : rr[i]) +
            ', expected ' + JSON.stringify(
              ROUND_ROBIN[i] === undefined ? null : ROUND_ROBIN[i]);
        }
      }
      return '(none)';
    })() + '. ⛔ D-10: the round-robin exists so folders MIX instead of one ' +
    'pile front-loading the guided pass, and this plan removes callers from ' +
    'the function that owns it — which is exactly when an incidental edit ' +
    'happens. Change it only deliberately, and re-pin this text in the same ' +
    'commit');

  // (D) THE VALUE PIN'S NEW SUBJECT (D-03) -----------------------------------
  //
  // Section 12 proves the client and the server still agree on the fallback
  // window's NUMBER. These three prove the number is CONSUMED, and consumed
  // off the right marker — without them section 12 could go on passing over a
  // constant the walk no longer reads, which is a pin that cannot fail for the
  // reason it claims to exist.
  //
  // ⚠ THE TWO MARKERS ARE NAMED HERE AND NOWHERE IN app.js's PROSE. The
  // negative below matches on the text of a region that includes that region's
  // own comments, so a comment in the walk stage that spelled the retired
  // marker would redden this gate on the comment instead of on a regression —
  // the trap this phase has sprung on repeatedly. app.js describes the two
  // markers in words instead; ⛔ keep it that way.
  (function () {
    const stage = tightBody(appSrc, APP, 'sessionWalkStage', 'walk-boundary');
    if (!stage) { return; }
    check(stage.text.indexOf('WALK_FIRST_WINDOW_MS') !== -1,
      '[walk-boundary] ' + APP + ':' + stage.line + ' sessionWalkStage no ' +
      'longer reads WALK_FIRST_WINDOW_MS — the mirrored fallback window has ' +
      'no consumer, so section 12 would compare two numbers nothing uses');
    check(stage.text.indexOf('meta.last_visit_ms') !== -1,
      '[walk-boundary] ' + APP + ':' + stage.line + ' sessionWalkStage does ' +
      'not read the marker the ROOM writes when she opens it — D-03: the ' +
      'reach and the date it reaches from must be measured from ONE day');
    check(stage.text.indexOf('last_reflection_ms') === -1,
      '[walk-boundary] ' + APP + ':' + stage.line + ' sessionWalkStage still ' +
      'reads the marker the LIBRARIAN writes when it finishes a reflection — ' +
      'D-03 moved this boundary off it deliberately, and reading both would ' +
      'measure the reach and its date from two different days');
  })();

  // (E) THE PRESENCE PROBE IS PURE AND SILENT (P-8, law 1) -------------------
  //
  // The album scene's pile and the walk stage's own bookend both decide
  // whether to appear by asking StudyCore.offerLikely. That decision runs ON
  // EVERY VISIT WITH NO TAP, so anything it does is unprompted by definition.
  // Deriving the real Offer there would spend the visit's Offer before a door
  // was touched AND fire a cloud call on a scene paint — a law-1 violation
  // wearing a presence rule.
  //
  // ⚠ BOTH CALL SITES ARE COVERED, not one. 26.95-32 wired the probe into the
  // walk stage as well as the album scene, and a gate that asserted over "the
  // album-scene call" alone would silently be asserting over whichever one it
  // happened to find first.
  (function () {
    const probe = tightBody(coreSrc, CORE, 'offerLikely', 'probe-silence');
    if (probe) {
      [['fetch(', 'issues a request'],
       ['apiGet', 'issues a request'],
       ['apiPost', 'issues a request'],
       ['XMLHttpRequest', 'issues a request'],
       ['/api/', 'names a route'],
       ['REACH', "touches the visit's Offer state"],
       ['Date.now(', 'reads the clock']
      ].forEach(function (pair) {
        check(probe.text.indexOf(pair[0]) === -1,
          '[probe-silence] ' + CORE + ':' + probe.line + ' offerLikely ' +
          pair[1] + ' (found ' + JSON.stringify(pair[0]) + ') — the probe ' +
          'runs at scene paint with no tap, so it must issue no request, ' +
          'reach no model, read no clock and never touch REACH. nowMs is ' +
          'injected; the visit Offer is spent by a door, never by a paint ' +
          '(P-8, law 1)');
      });
    }

    // ...and neither call site may sit inside a tap handler. A handler is
    // registered by passing a function to the DOM's own listener-registration
    // method, so moving the probe into one necessarily puts that registration
    // textually between the enclosing top-level function's declaration and the
    // call. That is what is measured: the prefix, not a paren span, because
    // paren counting over source that contains parens inside string literals
    // is a guess and this is not.
    // ⚠ KNOWN FRAGILITY, STATED: the prefix scan reads comments too. If a
    // comment inside renderAlbumStation or sessionWalkStage ever spells the
    // registration method's name, this gate reddens on the comment. Neither
    // function's comments do today; ⛔ describe it in words there if you must.
    // ⚖️ WIDENED 2026-08-16 (UAT F-8, hers): renderDeskStation joins them, and
    // the widening is the POINT of this pin rather than a defeat of it — the
    // gate said "a third surface started probing without a gate", and this is
    // that third surface being given one. Her complaint was «after I pressed
    // the stack of paper nothing happened»: the album pile has had a presence
    // rule since 26.95-32 and never produced it, while the desk stack was
    // always drawn and always tappable. It is a door onto the same one Offer
    // and it now decides the same way.
    // ⚠ The desk's probe is HOISTED ABOVE EVERY FIXTURE so the tap-handler
    // rule above holds without being loosened — it was written after the
    // stack's listener first, refused here, and moved.
    const PROBE_HOSTS = ['renderAlbumStation', 'sessionWalkStage',
      'renderDeskStation'];
    const REGISTRATION = ['addEventListener(', 'onclick'];
    const probeRe = /StudyCore\.offerLikely\s*\(/g;
    const hosts = [];
    let pm;
    while ((pm = probeRe.exec(appSrc)) !== null) {
      const where = enclosingTopLevelFn(appSrc, pm.index);
      const at = APP + ':' + lineOf(appSrc, pm.index);
      hosts.push(where ? where.name : '(no enclosing top-level function)');
      check(!!where && REGISTRATION.every(function (tok) {
        return where.prefix.indexOf(tok) === -1;
      }),
        '[probe-silence] ' + at + ' StudyCore.offerLikely( sits inside a tap ' +
        "handler in '" + (where ? where.name : '?') + "' — a listener is " +
        'registered before it in the same function. The probe decides ' +
        'PRESENCE at paint time; a probe that only runs on a tap is not a ' +
        'presence rule, and a probe that runs inside one has been moved ' +
        'somewhere it can spend what it must not (P-8)');
    }
    check(hosts.length === PROBE_HOSTS.length,
      '[probe-silence] ' + APP + ': StudyCore.offerLikely( has ' +
      hosts.length + ' call site(s), pinned BY VALUE at exactly ' +
      PROBE_HOSTS.length + " — the album scene's pile, the walk stage's " +
      "bookend, and (since 26.95-40) the desk station's stack. Zero means a " +
      'door decides its presence some other way; more means a FOURTH ' +
      'surface started probing without a gate');
    check(hosts.slice().sort().join(',') === PROBE_HOSTS.slice().sort().join(','),
      '[probe-silence] ' + APP + ': the probe is hosted by [' +
      hosts.slice().sort().join(', ') + '], expected exactly [' +
      PROBE_HOSTS.slice().sort().join(', ') + ']. Matched as a SET, never by ' +
      'position: one host appearing twice while the other loses its probe ' +
      'would keep a count of two and leave a door deciding blind');
  })();

  // (F) C-5 — THE ALBUM PILE'S LABEL, PINNED BY KEY AND BY VALUE -------------
  //
  // ⚠ THE VALUE BELOW IS PROVISIONAL AND UNAPPROVED. `copy_approved: false`
  // is the gate and it stays false. Front-facing wording is the OWNER's,
  // written in ONE pass — no agent may reword this string, and this pin exists
  // precisely so none can: the sentence is candidate C-5 in 26.95-COPY.md,
  // which is the live register, and it is pinned here BY KEY TOGETHER WITH ITS
  // VALUE because a value pinned alone survives a key rename and a key pinned
  // alone survives a silent reword. Its two siblings (the walk's bookend and
  // its quiet door) already carry this protection elsewhere; this one had
  // none. ⚠ When she does her pass, update this literal in the SAME commit as
  // the constant and the register row.
  (function () {
    const OPEN = 'var OFFER_COPY = {';
    const si = appSrc.indexOf(OPEN);
    if (si === -1 || appSrc.indexOf(OPEN, si + OPEN.length) !== -1) {
      violations.push('[offer-copy] ' + APP + ': ' + OPEN + ' is missing or ' +
        'declared more than once — the Offer\'s front-facing words must have ' +
        'exactly ONE home, and this gate has no region without it');
      return;
    }
    const ei = appSrc.indexOf('\n  };\n', si);
    if (ei === -1 || ei <= si) {
      violations.push('[offer-copy] ' + APP + ': the OFFER_COPY object has no ' +
        'module-indent close — the region could not be bounded');
      return;
    }
    const region = appSrc.slice(si, ei);
    const PINNED =
      'albumPile: "something from a while back, if you\'d like."';
    check(region.indexOf(PINNED) !== -1,
      '[offer-copy] ' + APP + ':' + lineOf(appSrc, si) + ' OFFER_COPY no ' +
      'longer carries the OWNER-WORDED C-5 entry ' + JSON.stringify(PINNED) +
      '. ⚠ This is no longer provisional: she ran the copy pass on ' +
      '2026-08-17 and copy_approved is true, so the pin now holds HER ' +
      'settled wording rather than a placeholder — ⛔ no agent may reword it');
    const valM = region.match(/albumPile:\s*"([^"]*)"/);
    check(!!valM && !/[0-9]/.test(valM[1]),
      '[offer-copy] ' + APP + ': the album pile\'s label carries a digit (' +
      (valM ? JSON.stringify(valM[1]) : 'label not found') + '). ⛔ Under the ' +
      'Offer this door names a few chosen things; a count of things not ' +
      'judged is what law 3 forbids on a front-facing surface, and she vetoed ' +
      'exactly that on 2026-07-27. This survives her wording pass on purpose');

    /* 26.95-41 (UAT F-1, hers): TWO MORE CANDIDATES, SAME PROTECTION. C-12
       is the desk stack's own name and C-13 is the Manage signpost, and both
       are pinned BY KEY TOGETHER WITH THEIR VALUE for the reason the block
       above gives — a value pinned alone survives a key rename, a key pinned
       alone survives a silent reword, and no agent may reword either.
       ⛔ C-12 IS A NAME AND NOT AN ANNOUNCEMENT, which is what lets it stand
       on a day with nothing to offer: it must never claim that there IS
       something (that is the pile's sentence and a different one), and it
       must never carry a count. Both survive her wording pass on purpose. */
    [['deskStack', 'C-12', "'where photographs come back'"],
      ['manageBlessWhere', 'C-13',
        "'photographs come back in the room, at the desk.'"]]
      .forEach(function (row) {
        const key = row[0], id = row[1], lit = row[2];
        check(region.indexOf(key + ': ' + lit) !== -1,
          '[offer-copy] ' + APP + ': OFFER_COPY no longer carries the pinned ' +
          id + ' entry ' + key + ': ' + lit + '. This is a PROVISIONAL ' +
          'candidate awaiting the owner\'s one pass — ⛔ no agent may reword ' +
          'it. If she has now worded it, re-pin this literal, the constant ' +
          'and the 26.95-COPY.md row in ONE commit');
        const m = region.match(new RegExp(key + ":\\s*'([^']*)'"));
        check(!!m && !/[0-9]/.test(m[1]),
          '[offer-copy] ' + APP + ': ' + id + ' carries a digit (' +
          (m ? JSON.stringify(m[1]) : 'not found') + '). ⛔ A count of things ' +
          'not judged is what law 3 forbids on a front-facing surface, and ' +
          'she vetoed exactly that on 2026-07-27');
      });

    /* 26.95-57 (UAT session 2 F-16, HERS): C-14 — the set-aside beat's line
       and its way back. ⛔ NOT provisional: she wrote the line cold on
       2026-08-17 after rejecting three offered candidates, and confirmed her
       own typo, the lowercase `ok` and the word `undo` one at a time. Pinned
       by key WITH value like every other row here. ⚠ The double-quoted form is
       the shipped one — the sentence carries an apostrophe. */
    [['asideSaid', 'C-14',
      '"ok, this photo won\'t show up in your room again."'],
      ['undo', 'C-14', "'undo'"]]
      .forEach(function (row) {
        const key = row[0], id = row[1], lit = row[2];
        check(region.indexOf(key + ': ' + lit) !== -1,
          '[offer-copy] ' + APP + ': OFFER_COPY no longer carries the ' +
          'OWNER-WORDED ' + id + ' entry ' + key + ': ' + lit + '. She wrote ' +
          'it on 2026-08-17 and copy_approved is true — ⛔ no agent may ' +
          'reword it. ⚠ Her line is the ONE sentence in this room that ' +
          'follows a permanent act, so a silent reword here changes what she ' +
          'is told about something she cannot see the consequence of');
      });

    const PILE_OPEN = "pile.id = 'album-pile';";
    const pi = appSrc.indexOf(PILE_OPEN);
    if (pi === -1 || appSrc.indexOf(PILE_OPEN, pi + PILE_OPEN.length) !== -1) {
      violations.push('[offer-copy] ' + APP + ': the album pile\'s id ' +
        'assignment is missing or not unique — the call-site region cannot ' +
        'be bounded, so nothing about the pile\'s label is measured');
      return;
    }
    const PILE_CLOSE = 'scene.appendChild(pile);';
    const pe = appSrc.indexOf(PILE_CLOSE, pi);
    if (pe === -1) {
      violations.push('[offer-copy] ' + APP + ': the album pile region has no ' +
        'end anchor — the region cannot be bounded');
      return;
    }
    const pile = appSrc.slice(pi, pe + PILE_CLOSE.length);
    if (pile.split('\n').length < 2) {
      violations.push('[offer-copy] ' + APP + ': the album pile region is one ' +
        'line — a range that matches its own end immediately measures nothing');
      return;
    }
    check(pile.indexOf('OFFER_COPY.albumPile') !== -1,
      '[offer-copy] ' + APP + ':' + lineOf(appSrc, pi) + ' the album pile ' +
      'does not take its label from OFFER_COPY.albumPile — the Offer\'s ' +
      'front-facing words have ONE home, and a string inlined at this call ' +
      'site is a sentence the register cannot see and she cannot reword');
    check(pile.indexOf('pileHintCopy') === -1,
      '[offer-copy] ' + APP + ':' + lineOf(appSrc, pi) + ' the album pile ' +
      'still builds its label through the count-bearing hint. ⛔ pileHintCopy ' +
      'names a quantity of things still waiting; under the Offer this door ' +
      'names a few chosen things and takes a boolean, not an n (law 3). This ' +
      'was a law-3 improvement that fell out of the presence rule');
    check(pile.indexOf('MORE_WAITING_COPY') === -1,
      '[offer-copy] ' + APP + ':' + lineOf(appSrc, pi) + ' the album pile ' +
      'renders MORE_WAITING_COPY. OD-6 → A: that shipped string stays ' +
      'BYTE-IDENTICAL and keeps rendering at the walk-close site, where it is ' +
      'still true; the pile takes its own sentence at this call site alone. ' +
      'The two places now make two different claims, and one sentence for ' +
      'both would make one of them false');
  })();

  // ---- the case count, BY VALUE ---------------------------------------------
  //
  // 3 (A: retirement + body + export) + 3 (B: total + two regions) +
  // 2 (C: round-robin span + text) + 3 (D: the value pin's new subject) +
  // 11 (E: seven silence negatives + site count + host set + one
  //     tap-handler check per site) + 5 (F: C-5 key/value, no digit, the
  //     pile's source, and the two strings it must not reach for) = 27.
  //
  // ⚠ A CASE THAT DID NOT RUN IS A CASE THAT PASSED, and that is the failure
  // this counter exists to make impossible. Every early return above skips its
  // dependent checks; each one already pushes its own violation, and this
  // number going short is the second, independent signal that a region could
  // not be bounded and a whole block of assertions quietly evaporated.
  // ⚖️ 27 -> 28 on 2026-08-16 (UAT F-8): the probe's tap-handler check runs
  // ONCE PER CALL SITE, and the desk station became a third. The number moved
  // because the roster above moved, deliberately and in the same commit —
  // which is exactly the coupling this pin exists to force.
  // ⚖️ 32 -> 34 on 2026-08-17 (UAT session 2, F-16): C-14's two strings, one
  // check each — the line and the way back. Counted, not guessed at.
  // ⚖️ 28 -> 32 on 2026-08-16 (UAT F-1): C-12 and C-13 each carry TWO checks
  // — the key-with-value pin and the no-digit rule — and both run for both
  // candidates. Four, counted rather than guessed at.
  const G14_EXPECTED = 34;
  if (G14 !== G14_EXPECTED) {
    violations.push('[case-count] section 14 ran ' + G14 + ' case(s), pinned ' +
      'BY VALUE at ' + G14_EXPECTED + ' — a region failed to bind and its ' +
      'assertions never executed, or a case was added without re-pinning ' +
      'this number');
  }
  CASE_COUNT.section14 = G14;
})();

// ---- section 15 (26.95-55, UAT session 2 F-14/F-15) ---------------------------
//
// EVERY TAG `openSpread` PUTS ON ITS ENTRY MUST BE RE-ATTACHED BY `pushView`.
//
// ⚠ THIS IS A CLASS GATE ON PURPOSE, AND THE REASON IS THE DEFECT'S OWN
// HISTORY. `pushView` rebuilds the stack entry field-by-field through the pure
// core, which copies `view`, `id` and `scrollTop` and NOTHING else; every other
// tag has to be re-attached by hand afterwards. That has now been got wrong
// TWICE — once for `sessionSpread` (whose fix left a comment in `pushView`
// saying "a dropped tag made every session guard silently reject the spread")
// and again for `offerPage`, two tags later, which silently disarmed BOTH the
// Offer's advance and its ending. A gate pinning the missing line would have
// caught the second instance and not the third.
//
// ⛔ It reads the two functions out of `app.js` and compares SETS. It does not
// know the name `offerPage`, so it cannot pass by agreeing with the fix.
(function () {
  let G15 = 0;
  function check(cond, msg) { G15++; if (!cond) { violations.push(msg); } }

  function bodyOf(name) {
    const at = appSrc.indexOf('function ' + name + '(');
    if (at === -1) { return null; }
    const open = appSrc.indexOf('{', at);
    if (open === -1) { return null; }
    let depth = 0;
    for (let i = open; i < appSrc.length; i++) {
      const c = appSrc[i];
      if (c === '{') { depth++; }
      else if (c === '}') { depth--; if (depth === 0) { return appSrc.slice(open, i + 1); } }
    }
    return null;
  }
  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }

  const openSpreadBody = bodyOf('openSpread');
  const pushViewBody = bodyOf('pushView');
  check(!!openSpreadBody, '[stack-tags] app.js: openSpread could not be bounded — ' +
    'this gate cannot run and that is a FAILURE, never a quiet pass');
  check(!!pushViewBody, '[stack-tags] app.js: pushView could not be bounded — ' +
    'this gate cannot run and that is a FAILURE, never a quiet pass');
  if (!openSpreadBody || !pushViewBody) { CASE_COUNT.section15 = G15; return; }

  // the entry literal openSpread hands to pushView, read as its own region
  const entryAt = stripComments(openSpreadBody).indexOf('var entry = {');
  check(entryAt !== -1, '[stack-tags] app.js: openSpread no longer builds a ' +
    '`var entry = {` literal — the shape this gate reads has moved');
  if (entryAt === -1) { CASE_COUNT.section15 = G15; return; }
  const clean = stripComments(openSpreadBody);
  let depth = 0, end = -1;
  for (let i = clean.indexOf('{', entryAt); i < clean.length; i++) {
    if (clean[i] === '{') { depth++; }
    else if (clean[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const entryRegion = clean.slice(entryAt, end + 1);

  // top-level keys only: nested object/array values are skipped by depth
  const keys = [];
  let d = 0;
  entryRegion.replace(/[{}[\]]|([A-Za-z_$][\w$]*)\s*:/g, function (m, key, off) {
    if (m === '{' || m === '[') { d++; return m; }
    if (m === '}' || m === ']') { d--; return m; }
    if (key && d === 1) { keys.push(key); }
    return m;
  });
  check(keys.length >= 5, '[stack-tags] app.js: openSpread\'s entry literal ' +
    'yielded only ' + keys.length + ' top-level key(s) (' + keys.join(', ') +
    ') — the parse is wrong, and a gate that reads nothing passes everything');

  // `view` and `id` are what the pure core itself copies; `refill` has its own
  // re-attach and is included in the sweep like any other.
  const CORE_COPIES = ['view', 'id'];
  const mustRide = keys.filter(function (k) { return CORE_COPIES.indexOf(k) === -1; });
  check(mustRide.length >= 3, '[stack-tags] app.js: only ' + mustRide.length +
    ' tag(s) beyond view/id were found on openSpread\'s entry — expected the ' +
    'walk, session, offer and refill tags at least');

  const push = stripComments(pushViewBody);
  mustRide.forEach(function (tag) {
    const re = new RegExp('r\\.stack\\[[^\\]]*\\]\\.' + tag + '\\s*=');
    check(re.test(push),
      '[stack-tags] app.js: openSpread tags the view entry with `' + tag +
      '` and pushView NEVER RE-ATTACHES IT. pushView rebuilds the stack entry ' +
      'field-by-field through the pure core (view/id/scrollTop only), so a tag ' +
      'made here and not re-attached there is `undefined` on every entry — and ' +
      'every guard reading it fails CLOSED, in silence. That is exactly how ' +
      '`sessionSpread` broke once and `offerPage` broke again: the Offer could ' +
      'not bring its next picture, `go on` did nothing, and a finished Offer ' +
      'never closed itself. ⛔ Re-attach it in pushView, do not weaken the guard');
  });

  const G15_EXPECTED = 5 + mustRide.length;
  if (G15 !== G15_EXPECTED) {
    violations.push('[case-count] section 15 ran ' + G15 + ' case(s), derived ' +
      'as 5 + ' + mustRide.length + ' tag(s) — a region failed to bind and its ' +
      'assertions never executed');
  }
  CASE_COUNT.section15 = G15;
})();

// ---- section 16 (26.95-60, UAT session 2 F-13) --------------------------------
//
// THE OFFER'S PICTURE IS BOUNDED BY ITS PANEL, AND THE BOUND CANNOT LEAK.
//
// ⚠ THIS GATE IS STATIC AND SAYS SO, BECAUSE THE LIVE ONE CANNOT EXIST WHERE IT
// BELONGS. test_offer_render drives a real page, but its harness overrides
// `#spread-scroll` to `height:auto; overflow:visible` — it FLATTENS the scroll
// region, which is the exact thing this defect lives in. A geometry case added
// there would measure a page with the defect's habitat removed. The geometry was
// driven instead by a rig against the real chassis at three window heights
// (600/790/1000), tall and wide photographs, overflow 111/65/158 -> 0/0/0, and
// that measurement is recorded in tokens.css beside the rule.
//
// So what is pinned here is what a static reader CAN own: that the rule exists,
// that it is scoped by the caption's PRESENCE rather than by a class an agent
// must remember to remove, and that the six-surface window bound it sits beside
// is untouched.
(function () {
  let G16 = 0;
  function check(cond, msg) { G16++; if (!cond) { violations.push(msg); } }

  const css = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const SCOPE = '#spread-content:has(> .offer-caption)';

  check(css.indexOf(SCOPE + ' > img') !== -1,
    '[offer-picture] tokens.css: the Offer picture rule ' + SCOPE + ' > img is ' +
    'GONE. Without it the photograph is bounded by 60% of the WINDOW while it ' +
    'lives in a panel measuring 56-67% of the window, so its bottom sits below ' +
    'the fold — measured at 111px, 65px and 158px on three window heights. ' +
    '⛔ She reversed her own F-12 ruling to get this; do not reverse it back');

  const imgRule = css.slice(css.indexOf(SCOPE + ' > img'));
  const body = imgRule.slice(0, imgRule.indexOf('}') + 1);
  check(/max-height:\s*none/.test(body),
    '[offer-picture] tokens.css: the Offer picture no longer neutralises the ' +
    'shared window bound (max-height: none). Leaving the shared max-height in ' +
    'force is what put the photograph over the panel in the first place');
  check(/min-height:\s*0/.test(body),
    '[offer-picture] tokens.css: without min-height: 0 a flex item refuses to ' +
    'shrink below its content, which is the whole mechanism here');

  // ⛔ THE SCOPING IS THE SAFETY PROPERTY, NOT A STYLE CHOICE. A class would
  // have to be added by the painter and removed by every other caller; the
  // caption's presence is true exactly while an Offer is on screen.
  check(css.indexOf('.offer-page') === -1,
    '[offer-picture] tokens.css: the Offer picture bound is scoped by a CLASS. ' +
    'A class has to be removed by every other surface that reuses ' +
    '#spread-content — the reader, the album, the blessing card, the walk — ' +
    'and the one that forgets inherits a bound nobody wrote for it. Scope it ' +
    'by the caption\'s presence instead');

  // the six-surface window bound is NOT this phase's to move
  const shared = css.indexOf('max-height: var(--picture-page-max-h)');
  check(shared !== -1,
    '[offer-picture] tokens.css: the SHARED picture bound (' +
    'max-height: var(--picture-page-max-h)) is gone. Six surfaces inherit it ' +
    'and this phase changed the Offer only — a seventh surface must inherit ' +
    'the height bound the same way it inherits the width');
  check(/--picture-page-max-h:\s*60vh/.test(css),
    '[offer-picture] tokens.css: --picture-page-max-h moved off 60vh. ⛔ ' +
    'RETUNING IT CANNOT FIX F-13 AND WILL BREAK SIX OTHER SURFACES: the panel ' +
    'measured 66%, 67% and 56% of the window at three sizes, so no single vh ' +
    'value fits it — that non-constant ratio is why the overflow was WORST at ' +
    'the largest window');

  /* 26.95-61 (hers): AND THE OFFER RESERVES NOTHING FOR THE RIBBON. On a
     reading spread the ribbon is pinned OVER the bottom of the scroll region
     and the reserve is what lets the last line clear it — right there, and not
     weakened. On the Offer 26.95-60 bounded the picture to the panel, so there
     is nothing left to scroll and the reserve was a strip of empty page under
     the photograph: 13px above the caption, 67px below the picture, on her own
     window. She ringed it in a screenshot and asked for the two to be
     identical. */
  const pad = (function () {
    const at = appSrc.indexOf('function fitSpreadRibbonPad(');
    if (at === -1) { return ''; }
    return appSrc.slice(at, appSrc.indexOf('\n  }', at) + 4);
  })();
  check(pad.indexOf(".querySelector('.offer-caption')") !== -1,
    '[offer-picture] ' + APP + ': fitSpreadRibbonPad no longer branches on the ' +
    'Offer. Without that branch the reading spread\'s ribbon reserve is applied ' +
    'to a page that cannot scroll, and it renders as empty page under the ' +
    'photograph — the gap she ringed and asked to have removed');
  check(/paddingBottom\s*=\s*getComputedStyle\([^)]*\)\.paddingTop/.test(pad),
    '[offer-picture] ' + APP + ': the Offer\'s bottom gap is no longer taken ' +
    'from the region\'s OWN computed padding-top. ⛔ Her words were "identical ' +
    'like the top gap" — a literal here would be identical only until the top ' +
    'padding moves, and nothing would say so');

  const G16_EXPECTED = 8;
  if (G16 !== G16_EXPECTED) {
    violations.push('[case-count] section 16 ran ' + G16 + ' case(s), pinned ' +
      'BY VALUE at ' + G16_EXPECTED);
  }
  CASE_COUNT.section16 = G16;
})();

// ---- section 17 (26.95-64, C-10) ---------------------------------------------
//
// THE LIBRARIAN'S CONFIRM CARD FOR "HOW MANY AT A TIME" — her two strings, and
// the refusal that keeps a blank card off her screen while the third is owed.
//
// ⚠ THE REGISTER CALLS C-10 "TWO SHORT STRINGS INTO TWO MAPS". Measured, the
// card needs THREE: a name, a sentence, and the confirm button's own label.
// Every other value class has one; without it this key falls through to the
// boolean mirror and the button reads "turn it on" under a sentence about how
// many photographs a pass sets out. That is why the third is owed rather than
// guessed, and why this section pins the REFUSAL as hard as it pins her words.
(function () {
  let G17 = 0;
  function check(cond, msg) { G17++; if (!cond) { violations.push(msg); } }

  check(appSrc.indexOf("blessing_batch_size: 'how many at a time'") !== -1,
    '[batch-card] ' + APP + ': ASK_SETTING_NAME no longer carries C-10\'s name ' +
    "`blessing_batch_size: 'how many at a time'`. ⚠ She chose it AFTER being " +
    'shown the name and the sentence as the card actually renders them — her ' +
    'first pick made "blessing pass" land twice — so this wording is a second ' +
    'decision, not a default. ⛔ No agent may reword it');

  check(appSrc.indexOf("'a blessing pass sets out '") !== -1 &&
        appSrc.indexOf("' things at a time.'") !== -1,
    '[batch-card] ' + APP + ": C-10's sentence is missing or reworded. Hers, " +
    'chosen from four offered on 2026-08-17: `a blessing pass sets out {n} ' +
    'things at a time.` ⛔ It counts the PASS and never the pool — a count of ' +
    'things not judged is what law 3 forbids on a front-facing surface, and ' +
    'this card is the one place in the room a number about the pass appears');

  // the guard is what makes an unwritten label safe, and it must survive her
  // writing one — so the ASSERTION IS THE CONDITIONAL, never the emptiness.
  const desc = (function () {
    const at = appSrc.indexOf('function askDescribable(');
    return at === -1 ? '' : appSrc.slice(at, appSrc.indexOf('\n  }', at) + 4);
  })();
  check(/ASK_KEY_BATCH\s*&&\s*!ASK_LABEL_BATCH/.test(desc),
    '[batch-card] ' + APP + ': askDescribable no longer refuses the batch key ' +
    'while its confirm label is empty. ⛔ WITHOUT THAT GUARD THE ROOM DRAWS A ' +
    'CARD IT HAS NO WORDS FOR: a real button under a real sentence, labelled ' +
    'with the boolean mirror\'s "turn it on". The room already has an honest ' +
    'branch for a change it cannot describe — it declines to draw the card and ' +
    'answers with a line she has seen before — and this is what routes to it');

  check(appSrc.indexOf("var ASK_LABEL_BATCH = 'set it to that';") !== -1,
    '[batch-card] ' + APP + ": C-10's confirm label is missing or reworded. " +
    "Hers, 2026-08-18, chosen from four offered: `set it to that`. It is the " +
    'third of three strings the card needs, and the one the register forgot ' +
    'to count. ⛔ No agent may reword it');

  check(appSrc.indexOf('ASK_VALUE_KEYS[ASK_KEY_BATCH]') !== -1,
    '[batch-card] ' + APP + ': the batch key is no longer a value class. It is ' +
    'the first NUMBER on this card; the boolean maps cannot describe it, and ' +
    'without this row askDescribable falls through and the ask is refused for ' +
    'the wrong reason');

  const G17_EXPECTED = 5;
  if (G17 !== G17_EXPECTED) {
    violations.push('[case-count] section 17 ran ' + G17 + ' case(s), pinned ' +
      'BY VALUE at ' + G17_EXPECTED);
  }
  CASE_COUNT.section17 = G17;
})();

// ---- verdict ------------------------------------------------------------------

if (violations.length) {
  console.error('test_surface_wiring FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_surface_wiring OK — section 14 (26.95-32 retirement + ' +
  'narrowing): ' + CASE_COUNT.section14 + ' cases; section 15 (26.95-55 ' +
  'view-stack tags): ' + CASE_COUNT.section15 + ' cases; section 16 ' +
  '(26.95-60 the Offer picture is bounded by its panel): ' +
  CASE_COUNT.section16 + ' cases; section 17 (26.95-64 C-10, the ' +
  'confirm card): ' + CASE_COUNT.section17 + ' cases');
process.exit(0);
