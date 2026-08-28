/*
 * tests/test_reformat_wiring.cjs — the reading-first reformatter's static
 * wiring gate (Phase 26.88 — Plan 01 Task 2, extended by Plan 02 Task 3 and
 * Plan 04 Task 3).
 *
 * Port of tests/test_surface_wiring.cjs: read the sources as TEXT, slice the
 * regions that matter, assert the wiring with regexes, and exit non-zero
 * listing every offender with file and line. Zero-dep (fs/path),
 * path-independent via __dirname. This file lives in tests/ — it is NOT an
 * APP_SOURCES member of test_no_push.cjs and needs no gate-list change there.
 *
 * THIS GATE SHIPPED IN TWO HALVES, and BOTH HALVES ARE NOW HERE. Groups
 * D / E / G / H / K landed in plan 01, which wired exactly ONE of the six
 * saved-body render sites. Groups A / B / C / F — the six-site roster, the
 * librarian exclusions, the call-site count and the guard-topology
 * assertions — land in plan 02, now that all six sites exist. A roster group
 * written before its sites existed would have been RED ON ARRIVAL for a
 * reason that has nothing to do with this phase, which is the one thing a
 * gate must never be. The letters are a phase-wide namespace: I is plan 04's
 * toggle group (now here) and J is plan 06's heading path, so this file's
 * fence group is K.
 *
 *   A. SAVED-SITE ROSTER — each of the six functions that renders a saved
 *      item's body hands that body to the one wrapper, and no raw body
 *      reaches the markdown seam at any of them.
 *   B. LIBRARIAN EXEMPTION — the three librarian-prose functions render
 *      through the markdown seam and NEVER through the wrapper; plus the
 *      fourth exclusion, which is a BRANCH rather than a function and is
 *      held by a branch-order assertion here and a runtime refusal there.
 *   C. GLOBAL COUNT — exactly six raw seam calls and exactly six wrapper
 *      call sites in the whole file. THE ONE GROUP THAT FAILS ON ADDITION.
 *   F. GUARD TOPOLOGY (law 5) — the REAL shipped topology: three sites
 *      guard in-body, textually before the wrapper; three are guarded
 *      upstream and carry no in-body guard at all; the two upstream guard
 *      call sites are pinned by enclosing function and guarded expression;
 *      and the repo-wide guard count is pinned so a silent addition or
 *      removal anywhere fails here.
 *   D. GUARD WIRED — renderSavedBody's own body calls
 *      StudyCore.wordsPreserved( and carries the exact console-warning
 *      string from the approved copy contract.
 *   E. NO SPINNER (SC-3) — renderSavedBody's body contains none of the four
 *      asynchronous constructs. Structure renders instantly and always, so a
 *      reading surface has no boundary at which a spinner could appear.
 *   G. CONTENT TYPOGRAPHY — tokens.css carries the 1.7 body line-height, the
 *      32px-above / 8px-below heading rhythm, the 24px list indent and the
 *      overflow-wrap declaration; and the block that adds them declares no
 *      motion, no accent, and none of the three deliberately-unset text
 *      properties.
 *   H. NEGATIVE VAULT-WRITE GATE (SC-6 / D-11) — no filesystem-write or
 *      network-mutation construct appears in any of the new function bodies,
 *      and the shipped writer's entry-point names appear in none of the
 *      display-side files this phase touches.
 *   I. THE ONE INTERACTION (D-08, SC-4) — the "show as saved" control is
 *      one control, on two surfaces, with two labels, gated on the per-open
 *      differs flag, with no persistence, no pressed state, no accent, and
 *      an explicitly wired focus ring. The group says out loud, in its own
 *      header, which parts of SC-4 only the owner can verify.
 *   J. THE HEADING PATH (D-01 / D-02 / SC-3) — the model-named heading
 *      reaches the reader from MEMORY, is declared to the guard by the
 *      transform that added it, and is decorated nowhere.
 *   K. FENCE COVERS ALL SIX — every one of the six wired saved-body
 *      containers is inside tokens.css's content fence, so the same note
 *      body reads the SAME wherever she meets it.
 *
 * COMMENT HYGIENE (binding on this gate and every gate that follows it):
 * before testing any region for the ABSENCE of a token, comments are
 * stripped from that region. A gate whose own documentation — or the
 * documentation of the code it guards — can trip it is self-invalidating:
 * the shipped `grep -c` trap in a different coat. There is exactly ONE
 * stripper in this file (stripComments) and every negative assertion routes
 * through the one helper (absent) that calls it. Positive assertions read
 * the raw text — with ONE deliberate exception added in plan 04: group I's
 * css rule reads strip first as well, because a rule is only proven by the
 * DECLARATION, and a block that merely described its own rules in prose
 * would otherwise satisfy the positive check without shipping anything.
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
const CSS = 'tokens.css';
const FIXTURES = 'tests/test_reformat_fixtures.cjs';
const PROPERTY = 'tests/test_reformat_property.cjs';

const coreSrc = fs.readFileSync(path.join(ROOT, CORE), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, CSS), 'utf8');
const fixturesSrc = fs.readFileSync(
  path.join(ROOT, 'tests', 'test_reformat_fixtures.cjs'), 'utf8');
const propertySrc = fs.readFileSync(
  path.join(ROOT, 'tests', 'test_reformat_property.cjs'), 'utf8');

const violations = [];
let negativeAssertions = 0;

// ---- helpers (ported from test_surface_wiring.cjs) --------------------------

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

// Slice a top-level function body: from its `function name(` keyword to the
// next function declaration at the module's two-space indent. Both files
// keep a flat, stable layout inside their IIFEs — nested callbacks are
// always indented deeper (or start mid-line), so the boundary holds. A
// rename or a removal is reported as a violation, which is a FEATURE: this
// gate must be updated deliberately, never silently outgrown.
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

// THE ONE COMMENT STRIPPER. Line and block comments in both JS and CSS. The
// `[^:]` guard in front of the line-comment rule keeps a `https://` inside a
// string literal from swallowing the rest of the line.
function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// EVERY negative assertion in this file goes through here — and nowhere else
// calls stripComments. `where` is a {text, line} region.
//
// `token` is a plain substring, EXCEPT when it is a RegExp: a few banned
// tokens are short uppercase words that also occur legitimately inside longer
// identifiers, and a substring ban on those is a false-positive generator
// rather than a gate. A gate that cries wolf gets relaxed by the next person
// who trips it, which is how a real one stops being trusted — so the fix is
// to make the pattern say what it means, not to widen the exception list.
function absent(where, token, group, file, why) {
  negativeAssertions += 1;
  if (!where) { return; }
  const stripped = stripComments(where.text);
  const hit = token instanceof RegExp
    ? token.test(stripped)
    : stripped.indexOf(token) !== -1;
  if (hit) {
    violations.push('[' + group + '] ' + file + ':' + where.line + ' names ' +
      JSON.stringify(String(token)) + ' — ' + why);
  }
}

// Adjacent single-quoted string-literal concatenations joined back into one
// string, so a shipped promise that had to be hard-wrapped across two source
// lines is still searchable as the ONE string it actually is at run time.
function joinConcats(text) {
  return String(text).replace(/'\s*\+\s*'/g, '');
}

// How many times a plain substring occurs. The exact-count group leans on
// this and nothing else does — a count is the only assertion shape that can
// notice something that was ADDED.
function countOccurrences(text, token) {
  var n = 0;
  var from = 0;
  for (;;) {
    var hit = String(text).indexOf(token, from);
    if (hit === -1) { return n; }
    n += 1;
    from = hit + token.length;
  }
}

// The balanced-paren argument span opening at `openIdx` (which must be the
// '(' itself) — the test_surface_wiring argSpan shape. Returns the text
// BETWEEN the parens, or null when they never balance. The expressions this
// gate reads carry no string literals inside their argument lists, so a
// plain depth count is exact here rather than merely close.
function argSpan(src, openIdx) {
  if (String(src).charAt(openIdx) !== '(') { return null; }
  var depth = 0;
  for (var i = openIdx; i < src.length; i++) {
    var ch = src.charAt(i);
    if (ch === '(') { depth += 1; }
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) { return src.slice(openIdx + 1, i); }
    }
  }
  return null;
}

// THE raw seam: the shipped expression that hands a body to the app's one
// markdown sink. THE WRAPPER: the one function allowed to prepare a
// saved-item body for it.
const REWRITE_SEAM = 'renderMarkdown(StudyCore.rewriteAttachmentRefs';
const WRAPPER_CALL = 'renderSavedBody(';

// Every seam occurrence in `text`, paired with the argument list
// rewriteAttachmentRefs was actually handed.
function seamCalls(text) {
  const src = String(text);
  const out = [];
  let from = 0;
  for (;;) {
    const hit = src.indexOf(REWRITE_SEAM, from);
    if (hit === -1) { return out; }
    const open = hit + REWRITE_SEAM.length;
    out.push({ index: hit, args: argSpan(src, open) });
    from = open;
  }
}

// ---- A. SAVED-SITE ROSTER (D-05, SC-2) --------------------------------------
//
// The six functions that render a SAVED ITEM's body. A NEW SAVED-BODY SITE
// MUST BE ADDED HERE DELIBERATELY: this roster and group K's container
// roster describe the SAME six sites from two angles — wiring and typography
// — so a seventh site has to be added to both or the gate goes red twice,
// which is the intent rather than an oversight. A rename or a removal is
// itself reported (functionBody says so), and that too is a feature.
const SAVED_SITES = [
  'renderBlessingCard',    // the blessing card
  'fillReaderInto',        // the shared reader / diegetic spread builder
  'renderRevealSnapshot',  // the never-show reveal snapshot
  'fillProposalPieces',    // the desk proposal stack
  'fillInsightPieces',     // the insight gallery
  'openInsightItem'        // the notebook item resurfaced in place
];

SAVED_SITES.forEach(function (name) {
  const body = functionBody(appSrc, APP, name, 'saved-roster');
  if (!body) { return; }
  if (body.text.indexOf(WRAPPER_CALL) === -1) {
    violations.push('[saved-roster] ' + APP + ':' + body.line + " '" + name +
      "' never hands its body to the one saved-body wrapper — a saved-item " +
      'body that skips the wrapper skips the D-04 word-preservation guard, ' +
      'the D-06 personal-note branch and the D-07.4a author-heading branch ' +
      'all at once, and the SAME note then reads two different ways ' +
      'depending on which surface she met it on (D-05, SC-2). NOTE WHAT ' +
      'THIS GATE DOES AND DOES NOT ASSERT: it pins that the site CALLS the ' +
      'wrapper. That those two branches still REFUSE inside the wrapper is ' +
      'pinned by execution in tests/test_saved_body_refusals.cjs (R4, R5) — ' +
      'until that file existed, both were deletable with the whole sweep ' +
      'green, because naming a branch in a message is not asserting it');
  }
  seamCalls(body.text).forEach(function (call) {
    if (call.args === null || call.args.indexOf(WRAPPER_CALL) === -1) {
      violations.push('[saved-roster] ' + APP + ':' +
        lineOf(appSrc, body.start + call.index) + " '" + name +
        "' hands a RAW body to the markdown seam — the body argument to " +
        'rewriteAttachmentRefs has to be the wrapper call, so the ' +
        'reformatter runs FIRST and the shipped attachment rewrite second ' +
        '(an image line the transform copied byte-identically still has to ' +
        'resolve inline)');
    }
  });
});

// ---- B. LIBRARIAN EXEMPTION (D-05) ------------------------------------------
//
// THE LINE THIS PHASE DRAWS: the transform touches the owner's words, never
// the librarian's. Three of the four exclusions are whole functions and live
// in this roster. A NEW LIBRARIAN-PROSE SITE MUST BE ADDED HERE
// DELIBERATELY.
//
// THE FOURTH EXCLUSION IS DELIBERATELY NOT IN THIS ROSTER AND THE COUNT OF
// THREE IS NOT WRONG. It is a BRANCH inside a function that is also a saved
// site — the shared reader/spread builder serves two kinds of text from one
// body — so it can never be a roster entry. It is enforced by the
// branch-order assertion directly below, plus the wrapper's own runtime
// fail-closed refusal for a librarian-authored item. Do not "fix" this
// roster to four.
const LIBRARIAN_SITES = [
  'openDeskNote',            // the note the librarian left on the desk
  'showReflectionVerbatim',  // the legacy reflection verbatim path
  'sessionPaintReveal'       // the session reveal painter
];

LIBRARIAN_SITES.forEach(function (name) {
  const body = functionBody(appSrc, APP, name, 'librarian-exemption');
  if (!body) { return; }
  if (!/renderMarkdown\s*\(/.test(body.text)) {
    violations.push('[librarian-exemption] ' + APP + ':' + body.line + " '" +
      name + "' no longer renders through renderMarkdown( — this roster " +
      'exists to pin that these sites go through the ONE markdown seam and ' +
      'NOT through the reformatter. If the render moved, the exemption is ' +
      'pinned against a function that no longer does the thing, and the ' +
      'real render is unguarded');
  }
  absent(body, WRAPPER_CALL, 'librarian-exemption', APP,
    "the librarian's own prose is NEVER reformatted (D-05). 26.87 spent a " +
    'whole phase getting that voice right and it is already written ' +
    'well-structured; laying it out again would be the app rewriting its ' +
    'own words back at her');
});

{
  const reader = functionBody(appSrc, APP, 'fillReaderInto',
    'librarian-exemption');
  if (reader) {
    // Anchor on the BRANCH, not on the bare token. `opts.reflection` also
    // appears earlier in this function in a title ternary, so an indexOf on
    // the token pins THAT occurrence: the branch could be neutered to
    // `else if (false)` — or deleted outright — and the order assertion would
    // still hold, green, while the message below claimed the branch was
    // checked. That is the 26.87 dead-code lesson (a fix whose test passed
    // with the fix removed) in this gate's own house. Proven by orchestrator
    // mutation at wave 2: `} else if (opts.reflection) {` -> `} else if
    // (false) {` left this suite green before this line was tightened.
    const BRANCH_RE = /else\s+if\s*\(\s*opts\.reflection\s*\)/;
    const branchHit = BRANCH_RE.exec(reader.text);
    const branchAt = branchHit ? branchHit.index : -1;
    const wrapperAt = reader.text.indexOf(WRAPPER_CALL);
    if (branchAt === -1 || wrapperAt === -1 || branchAt > wrapperAt) {
      violations.push('[librarian-exemption] ' + APP + ':' + reader.line +
        ' the reflection branch no longer precedes the saved-body wrapper ' +
        'inside fillReaderInto. THIS IS THE FOURTH D-05 EXCLUSION: it is a ' +
        'BRANCH inside a hooked function, not a function of its own, so it ' +
        'can never be a roster entry — one function serves two kinds of ' +
        "text and only the else branch carries the owner's. The wrapper's " +
        'runtime refusal for a librarian-authored item is the second, ' +
        'independent defence — pinned by execution in ' +
        'tests/test_saved_body_refusals.cjs (R1), NOT here; this group only ' +
        'asserts the ORDER of the first defence, and for a while that ' +
        'sentence was the only place the second one was mentioned at all. ' +
        'This order is the first defence, and a comment alone would hold ' +
        'neither');
    }
  }
}

// ---- C. GLOBAL COUNT (SC-2) -------------------------------------------------
//
// THE ONE GROUP THAT FAILS ON ADDITION, and the reason it matters more than
// the roster above: a roster test can only check the sites it already knows
// about. A SEVENTH saved-body render site added tomorrow would pass group A
// untouched — group A would simply never look at it. This group counts, so a
// seventh site cannot appear silently in either direction, and the only way
// past it is to add that site to SAVED_SITES deliberately.
const EXPECTED_SEAM_CALLS = 6;

// The wrapper's own declaration is not a call site. A HARNESS EXPORT would
// not be one either: the shipped export idiom is the BARE IDENTIFIER
// (window.renderMarkdown = renderMarkdown; at the foot of app.js), which
// carries no call paren and so cannot inflate this count — the carve-out is
// structural rather than a line exemption. Measured 2026-07-31: no export of
// the wrapper exists at all. The third assertion below is what keeps that
// honest, by refusing a CALL-form export that WOULD inflate the count.
const WRAPPER_DECLARATION = 'function renderSavedBody(';
const WRAPPER_EXPORT_CALL = 'window.renderSavedBody(';

{
  const seamCount = countOccurrences(appSrc, REWRITE_SEAM);
  if (seamCount !== EXPECTED_SEAM_CALLS) {
    violations.push('[saved-count] ' + APP + ': found ' + seamCount +
      ' raw markdown-seam calls, expected exactly ' + EXPECTED_SEAM_CALLS +
      '. A SEVENTH SAVED-BODY RENDER SITE MUST BE ADDED TO SAVED_SITES ' +
      'DELIBERATELY (and to group K\'s container roster, and to this ' +
      'count) — a new surface that shows a saved note must not be able to ' +
      'opt out of the reformatter, or into it, without anyone deciding');
  }
  const wrapperTotal = countOccurrences(appSrc, WRAPPER_CALL);
  const declarations = countOccurrences(appSrc, WRAPPER_DECLARATION);
  const callSites = wrapperTotal - declarations;
  if (callSites !== EXPECTED_SEAM_CALLS) {
    violations.push('[saved-count] ' + APP + ': found ' + callSites +
      ' saved-body wrapper call sites (' + wrapperTotal + ' occurrences ' +
      'less ' + declarations + ' declaration), expected exactly ' +
      EXPECTED_SEAM_CALLS + '. A SEVENTH SAVED-BODY RENDER SITE MUST BE ' +
      'ADDED TO SAVED_SITES DELIBERATELY');
  }
  if (appSrc.indexOf(WRAPPER_EXPORT_CALL) !== -1) {
    violations.push('[saved-count] ' + APP + ': the saved-body wrapper is ' +
      'exported in CALL form, which inflates the count above and blinds ' +
      'this group. Export the bare identifier the way the shipped exports ' +
      'do, and record the carve-out in the comment beside ' +
      'WRAPPER_EXPORT_CALL');
  }
  seamCalls(appSrc).forEach(function (call) {
    if (call.args === null || call.args.indexOf(WRAPPER_CALL) === -1) {
      violations.push('[saved-count] ' + APP + ':' +
        lineOf(appSrc, call.index) + ' a markdown-seam call hands a RAW ' +
        'body to rewriteAttachmentRefs. Every one of the six has to carry ' +
        'the wrapper as its body argument — this is the whole-file half of ' +
        'group A, so a raw call in a function nobody rostered is caught too');
    }
  });
}

// ---- D. GUARDS WIRED --------------------------------------------------------
//
// THIS GROUP NOW PINS TWO GUARDS, SIX THINGS, and the second guard is here
// because the first was blind to three defects in a row.
//
// wordsPreserved (D-04) is the shipped word-sequence guard. F-1's empty
// headings, F-3's split italic caption and the parenthetical shred ALL passed
// it — every word survived in all three, which is the only thing it can see.
// Word preservation is necessary and nowhere near sufficient.
//
// markupPreserved + headingsBound (D-14, 26.88-12) are the second. They assert
// that INLINE MARKUP survives: emphasis pairs, brackets, parentheses, wikilink
// and comment syntax, counted per blank-line-delimited block so a pair that
// merely MOVED across an emitted boundary is caught. headingsBound states F-1's
// visible symptom directly — no emitted ATX heading may be bound to nothing.
//
// Both guards take the SAME failure action, and that is the thing to preserve
// if this group is ever re-cut: one console.warn, REFORMAT_STATE false, the
// source returned, and NOTHING in the UI. A visible fallback marker is
// decoration on a reading surface and was rejected outright (CONTEXT
// <deferred>, law 4). Group J is the gate that keeps the UI silent; this group
// keeps the console honest.

// The exact copy from the approved copywriting contract. The em dash is
// built from its codepoint so the pin is unambiguous in review.
const GUARD_WARNING = 'reformat guard tripped: word sequence changed ' +
  String.fromCharCode(0x2014) + ' showing the note as saved';

// 26.88-12: the markup guard's own string. Deliberately parallel to the one
// above and deliberately NOT the same — a console reader has to be able to
// tell which of the two guards fired without opening the file.
const MARKUP_WARNING = 'reformat guard tripped: inline markup changed ' +
  String.fromCharCode(0x2014) + ' showing the note as saved';

// 26.88 code review CR-02: the carve-out's own string. A THIRD one, again
// deliberately distinct, and again saying what it actually did — the carve-out
// falls back to leaving the `#` marks alone, not to un-laying-out the note.
const CARVE_WARNING = 'hashtag carve-out guard tripped: word sequence ' +
  'changed ' + String.fromCharCode(0x2014) + ' leaving the `#` marks as saved';

// 26.88 code review CR-02: THE D-04 LADDER MOVED ONE FUNCTION DOWN, and this
// slice follows it rather than being loosened. `renderSavedBody` is now a
// two-part wrapper — the carve-out decision, and `renderSavedBodyLaidOut`,
// which is the ladder this group has always pinned, byte for byte. Every
// assertion below still runs over the ladder; the wrapper gets its OWN group
// (L) further down, because the two answer different questions and a slice
// covering both would let either one satisfy the other's pins.
const savedBody = functionBody(appSrc, APP, 'renderSavedBodyLaidOut',
  'guard-wired');

// The carve-out wrapper. It is the OUTER function, so `functionBody`'s
// "up to the next `\n  function `" boundary gives exactly it and not the
// ladder below it.
const carveOutWrapper = functionBody(appSrc, APP, 'renderSavedBody',
  'carve-out');

if (savedBody) {
  if (!/console\.warn\s*\(/.test(savedBody.text)) {
    violations.push('[guard-wired] ' + APP + ':' + savedBody.line +
      ' renderSavedBody never calls console.warn( — the guard falls back ' +
      'SILENTLY in the UI, so the console is the only place a trip is ' +
      'visible at all');
  }
  if (joinConcats(savedBody.text).indexOf(GUARD_WARNING) === -1) {
    violations.push('[guard-wired] ' + APP + ':' + savedBody.line +
      ' renderSavedBody does not carry the shipped guard warning ' +
      JSON.stringify(GUARD_WARNING) + ' — copy is a shipped promise and is ' +
      'grep-pinned like every other string in this app');
  }
  // 26.88-16 (F-5): THESE THREE PINS ARE RE-CUT, DELIBERATELY AND NOT AS A
  // SIDE-EFFECT. Until now they grepped this function's body for
  // `StudyCore.wordsPreserved(`, `StudyCore.markupPreserved(` and
  // `StudyCore.headingsBound(`. THE FOUR BOOLEAN COMPUTATIONS HAVE MOVED into
  // `CORE.bodyGuards`, so ALL THREE literals are gone from this function — and
  // the group would have gone red for a reason having nothing to do with a
  // defect, which is the one thing a gate must never do. Plan 12's precedent is
  // explicit that a call-count change belongs in the plan text rather than in a
  // diff nobody was warned about.
  //
  // (An earlier cut of this replacement kept the `wordsPreserved(` pin, on a
  // written-down claim that the literal survived the delegation. It does not.
  // The claim was a derivation nobody had executed, this suite executed it, and
  // it went red — which is the phase's own rule working as intended.)
  //
  // What is pinned INSTEAD is stronger, not weaker: (a) the function calls the
  // ONE shared verdict; (b) it reads the word field and the three markup fields
  // on SEPARATE branches, so the two warnings stay distinguishable; (c) it
  // calls NONE of the four predicates directly any more, so a second
  // composition of the ladder cannot grow back here unnoticed; and (d) the two
  // shipped warning strings and the silent-UI discipline, unchanged below.
  if (!/StudyCore\.bodyGuards\s*\(/.test(savedBody.text)) {
    violations.push('[guard-wired] ' + APP + ':' + savedBody.line +
      ' renderSavedBody never calls StudyCore.bodyGuards( — the four-guard ' +
      'verdict has ONE implementation (26.88-16, F-5). Composing the four ' +
      'predicates here again is the one-rule-two-callers drift that let the ' +
      'probe measure ONE guard at ONE seam and publish 90 where the app ' +
      'lays out 76');
  }
  if (!/\bguards\s*\.\s*words\b/.test(savedBody.text)) {
    violations.push('[guard-wired] ' + APP + ':' + savedBody.line +
      ' renderSavedBody never reads the verdict\'s `words` field — D-04\'s ' +
      'word-sequence trip has its OWN console warning, so it has to be its ' +
      'own branch rather than folded into the markup one');
  }
  ['markupRaw', 'markupClean', 'headingsBound'].forEach(function (field) {
    if (!new RegExp('\\bguards\\s*\\.\\s*' + field + '\\b')
      .test(savedBody.text)) {
      violations.push('[guard-wired] ' + APP + ':' + savedBody.line +
        ' renderSavedBody never reads the verdict\'s `' + field + '` field ' +
        '— all THREE of the markup fields gate the second warning. Dropping ' +
        'markupClean is F-4 exactly: the raw seam trips 0 on the live ' +
        'library and the clean seam trips 14, so a check that reads only the ' +
        'raw one measures something narrower than what ships');
    }
  });
  // (c) NO SECOND COMPOSITION HERE. Routed through `absent`, so it reads
  // comment-stripped source and the prose above cannot satisfy or trip it.
  ['StudyCore.wordsPreserved(', 'StudyCore.markupPreserved(',
    'StudyCore.headingsBound('].forEach(function (token) {
    absent(savedBody, token, 'guard-wired', APP,
      'the four-guard verdict has ONE implementation, CORE.bodyGuards ' +
      '(26.88-16, F-5). A direct predicate call back inside renderSavedBody ' +
      'is a SECOND composition of the ladder, and the app and the instrument ' +
      'would once again be able to disagree about what a laid-out note is — ' +
      'which is what published 90 where the app lays out 76');
  });
  if (joinConcats(savedBody.text).indexOf(MARKUP_WARNING) === -1) {
    violations.push('[guard-wired] ' + APP + ':' + savedBody.line +
      ' renderSavedBody does not carry the shipped markup-guard warning ' +
      JSON.stringify(MARKUP_WARNING) + ' — copy is a shipped promise, and a ' +
      'console reader must be able to tell the two guards apart');
  }
}

// ---- E. NO SPINNER (SC-3 / D-02) -------------------------------------------
//
// A spinner must never appear in a reading surface — that is the exact
// moment this phase exists to protect. renderSavedBody is synchronous BY
// CONSTRUCTION, and this is the gate that keeps it that way.

const ASYNC_TOKENS = ['fetch(', '.then(', 'await ', 'setTimeout('];

ASYNC_TOKENS.forEach(function (token) {
  absent(savedBody, token, 'no-spinner', APP,
    'renderSavedBody must be synchronous by construction: with no ' +
    'asynchronous boundary there is no state at which a spinner, skeleton, ' +
    'or progress line could ever be rendered into a note body (SC-3, D-02)');
});

// ---- F. GUARD TOPOLOGY (law 5, SC-2), pinned as it ACTUALLY SHIPS -----------
//
// ⛔ RESEARCH WAS WRONG HERE, and the correction is recorded IN THE GATE
// rather than only in a plan document, because the gate is the thing a
// future reader will actually run. 26.88-RESEARCH.md §Pattern 1 asserted
// that StudyCore.guardSurface runs in-body at ALL SIX saved-body sites.
// That was verified FALSE by reading each function: three of the six guard
// in-body, and three are guarded UPSTREAM in the caller chain.
//
// THE OWNER'S CALL, locked at plan time: pin the REAL topology rather than
// add in-body guards to the other three. Adding one would be a behaviour
// change inside the P0 never-list fence during a legibility phase, and it
// would need its own UAT beat. The fence is not weakened by that choice —
// it is the same fence, described accurately. Written as a six-name in-body
// roster, this group would have been RED ON ARRIVAL for a reason that has
// nothing to do with this phase, which is the one thing a gate must never
// be.
//
// Both halves are pinned, so the gate goes red if the in-body ORDER changes,
// if the in-body ABSENCE changes, or if an upstream guard disappears.

// (i) the three that guard in-body: the guard must sit textually BEFORE the
// wrapper, so a flagged item is dropped before any body is prepared for it.
const IN_BODY_GUARD_SITES = [
  'fillProposalPieces',   // app.js — the desk proposal stack
  'fillInsightPieces',    // app.js — the insight gallery
  'openInsightItem'       // app.js — the notebook item resurfaced in place
];

// (ii) the three guarded upstream: these carry NO in-body guard, and that
// absence is the pinned fact. A NEW SITE MUST BE ADDED TO ONE OF THESE TWO
// ROSTERS DELIBERATELY — never to both, and never to neither.
const UPSTREAM_GUARDED_SITES = [
  'renderBlessingCard',   // guarded in the shelf/cover caller chain
  'fillReaderInto',       // guarded in the shelf/cover caller chain
  'renderRevealSnapshot'  // guarded in the cover caller chain
];

// ...and the upstream guards themselves, pinned by enclosing function AND
// guarded expression, so "guarded upstream" is a checked claim rather than a
// comforting sentence. These are the two call sites the correction block
// above names.
const UPSTREAM_GUARDS = [
  { fn: 'renderShelf',
    expr: 'StudyCore.guardSurface(SHELF.items[id], SHELF.filters)' },
  { fn: 'renderCover',
    expr: 'StudyCore.guardSurface(item, SHELF.filters)' }
];

const GUARD_TOKEN = 'StudyCore.guardSurface(';

// The repo-wide count, measured over the whole of app.js on 2026-07-31 (this
// plan adds none, moves none, and removes none). Pinned so a guard added or
// deleted ANYWHERE in the file fails here, not only inside the eleven
// functions the two rosters above happen to name.
//
// 26.9-01 (D-18, 2026-08-04): 17 -> 18, deliberately, and RE-MEASURED
// rather than incremented to clear a red suite. The whole delta is ONE
// call, inside renderJournalStation: the reading door's per-id
// StudyCore.guardSurface re-check, which drops a fenced id before any row
// is packed and records an incident against the 'journal' surface. It is
// an ADDED guard, never a moved or removed one — the count went UP, which
// is the direction that cannot weaken the fence.
//
// It joins NEITHER roster above, and that is the deliberate half of this
// decision rather than an oversight: both rosters describe sites that
// prepare a BODY for display, and the reading door prepares none — its
// pack structurally cannot carry one (law 5). So only the repo-wide count
// moves, which is exactly the case this constant exists to catch.
// 26.9-04 (D-04/D-12, 2026-08-04): 18 -> 19, deliberately, and RE-MEASURED
// over the whole file rather than incremented to clear a red suite (`grep -c
// "StudyCore.guardSurface(" app.js` reads 19). The whole delta is ONE call
// site: paintNotebookSpread hands StudyCore.guardSurface DOWN as an argument
// to paintBlessingPage -> paintPageDecorations, where every stored image
// reference re-resolves through it on EVERY render. The picker's own
// per-thumbnail re-check inside renderTinTray is the second half of the same
// pattern and is written as `StudyCore.guardSurface(store[id], filters)`.
//
// It is an ADDED guard, never a moved or removed one — the count went UP,
// the only direction that cannot weaken the fence. It joins neither roster
// above for the same reason 26.9-01's did: both rosters describe sites that
// prepare a BODY for display, and a decoration carries none.
//
// 26.91-04 (D-06, 2026-08-07): 19 -> 18, deliberately, and RE-MEASURED over
// the whole file rather than decremented to clear a red suite. THIS IS THE
// DANGEROUS DIRECTION — the count going DOWN is the only move that can
// weaken the fence — so it is measured three ways and the answer is stated:
//   total occurrences of the token in app.js .......... 18
//   occurrences in LIVE CODE (comments stripped) ...... 18
//   the same measure over pre-plan app.js ............. 19
// The whole delta is ONE call site and it is the exact one 26.9-01 added:
// the reading door's per-id re-check inside renderJournalStation, which
// recorded incidents against the 'journal' surface. D-06 removed that
// painter whole, so the guard left WITH the code it guarded — no surviving
// surface lost a guard, and neither roster above changed.
//
// 26.95-30 (2026-08-15): 18 -> 19, deliberately, and THE DIRECTION WAS
// ESTABLISHED BEFORE THE NUMBER MOVED rather than inferred from a red suite.
// This gate exists to catch a guard being silently REMOVED, so the only
// question that matters is which way the delta ran. It ran UP, and the whole
// delta is ONE call site: inside `openOfferPage`, the reach back's Offer page
// filters its ids through
//
//   StudyCore.guardSurface(ROOM.items[id], filters)
//
// before anything is painted, dropping every id the predicate refuses and
// recording an incident against the door it came through. It is the
// INDEPENDENT RENDER-BOUNDARY RE-CHECK the album station already ships: the
// selector drew through surfacePool in its own body, the server screened the
// same ids, and this asks the deliberately re-typed straight-line predicate a
// third time, so a bug in the gate cannot hide itself at the point of display
// (law 5, the one property this project treats as P0).
//
// It is legitimately a FAIL-CLOSED guard and not merely a call that matches
// the token: its refusal path drops the item and returns, it never falls
// through to a display, and `openOfferPage` returns false when the filter
// empties the list — a screened-out Offer opens nothing rather than opening
// short.
//
// NOTHING MOVED AND NOTHING WAS REMOVED. Every call site the pinned 18
// covered is still present; this one is new source in a function that did not
// exist before 26.95-30. It joins NEITHER roster above, for exactly the
// reason 26.9-01's and 26.9-04's did not: both rosters describe sites that
// prepare a saved BODY for display, and the Offer page paints photographs and
// prepares no body at all. So only the repo-wide count moves — which is
// precisely the case these two constants exist to catch.
//
// ⚠ THIS FILE IS IN NO 26.95 PLAN'S FILE LIST. The pin was moved as a
// deliberate out-of-plan touch, because the alternative is a gate pinned to a
// number the shipped file can no longer produce — a permanently red suite,
// which is the state in which someone eventually deletes a guard instead of
// reading it.
//
// The comment/code split is pinned in BOTH directions below, because a
// guard commented OUT would leave the total at 19 while the fence lost a
// site — the difference a bare `grep -c` cannot see.
const PINNED_GUARD_COUNT = 19;
const PINNED_GUARD_COUNT_IN_LIVE_CODE = 19;

IN_BODY_GUARD_SITES.forEach(function (name) {
  const body = functionBody(appSrc, APP, name, 'guard-topology');
  if (!body) { return; }
  const guardAt = body.text.indexOf(GUARD_TOKEN);
  const wrapperAt = body.text.indexOf(WRAPPER_CALL);
  if (guardAt === -1) {
    violations.push('[guard-topology] ' + APP + ':' + body.line + " '" +
      name + "' lost its in-body fail-closed guard — never-list integrity " +
      'is absolute (law 5) and a leak is a P0 incident. If the guard really ' +
      'moved upstream, move this name to UPSTREAM_GUARDED_SITES and pin the ' +
      'new call site, deliberately');
    return;
  }
  if (wrapperAt !== -1 && guardAt > wrapperAt) {
    violations.push('[guard-topology] ' + APP + ':' + body.line + " '" +
      name + "' prepares a body BEFORE its fail-closed guard runs. The " +
      'wrapper is never inserted above an existing guard: the guard decides ' +
      'whether this item may be seen at all, and that question is settled ' +
      'before any question about how it is laid out');
  }
});

UPSTREAM_GUARDED_SITES.forEach(function (name) {
  const body = functionBody(appSrc, APP, name, 'guard-topology');
  absent(body, GUARD_TOKEN, 'guard-topology', APP,
    'this site is guarded UPSTREAM in its caller chain, and that is the ' +
    'pinned shipped topology. An in-body guard appearing here is a ' +
    'behaviour change inside the P0 never-list fence — it may well be the ' +
    'right change, but it needs its own UAT beat and its own decision, not ' +
    'a quiet arrival inside a legibility phase');
});

UPSTREAM_GUARDS.forEach(function (pin) {
  const body = functionBody(appSrc, APP, pin.fn, 'guard-topology');
  if (body && body.text.indexOf(pin.expr) === -1) {
    violations.push('[guard-topology] ' + APP + ':' + body.line +
      ' the upstream guard ' + JSON.stringify(pin.expr) + ' is gone from ' +
      pin.fn + ' — three saved-body sites carry no in-body guard BECAUSE ' +
      'this one runs for them. Remove it and those three render unguarded, ' +
      'with nothing anywhere saying so');
  }
});

{
  const guards = countOccurrences(appSrc, GUARD_TOKEN);
  if (guards !== PINNED_GUARD_COUNT) {
    violations.push('[guard-topology] ' + APP + ': found ' + guards +
      ' fail-closed guard calls, expected the pinned ' + PINNED_GUARD_COUNT +
      '. A guard was added, moved, or removed somewhere in this file. ' +
      'Re-measure, decide deliberately, and update PINNED_GUARD_COUNT with ' +
      'the reason — never to make a red suite go green');
  }
  // 26.91-04 (D-06): the COMMENT/CODE split, pinned in both directions. A
  // guard commented out leaves the total above untouched while the fence
  // loses a site; a guard that exists only inside a comment inflates the
  // total while guarding nothing. Neither is visible to a bare count.
  const appCode = appSrc.split('\n')
    .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
    .join('\n');
  const liveGuards = countOccurrences(appCode, GUARD_TOKEN);
  if (liveGuards !== PINNED_GUARD_COUNT_IN_LIVE_CODE) {
    violations.push('[guard-topology] ' + APP + ': found ' + liveGuards +
      ' fail-closed guard calls in LIVE CODE, expected the pinned ' +
      PINNED_GUARD_COUNT_IN_LIVE_CODE + '. If this differs from the total (' +
      guards + ') a guard has been commented out — the fence lost a site ' +
      'while the file-wide count still reads right.');
  }
  if (guards !== liveGuards) {
    violations.push('[guard-topology] ' + APP + ': the total guard count (' +
      guards + ') and the live-code guard count (' + liveGuards +
      ') disagree — some `StudyCore.guardSurface(` occurrence lives in a ' +
      'comment. Every guard must be executable.');
  }
}

// ---- G. CONTENT TYPOGRAPHY --------------------------------------------------

const CSS_BLOCK_START = '26.88-01 CONTENT TYPOGRAPHY (start)';
const CSS_BLOCK_END = '26.88-01 CONTENT TYPOGRAPHY (end)';

let cssBlock = null;
{
  const s = cssSrc.indexOf(CSS_BLOCK_START);
  const e = cssSrc.indexOf(CSS_BLOCK_END);
  if (s === -1 || e === -1 || e < s) {
    violations.push('[content-typography] ' + CSS + ': the sentinel pair ' +
      JSON.stringify(CSS_BLOCK_START) + ' / ' + JSON.stringify(CSS_BLOCK_END) +
      ' is missing — this gate slices the block it guards by those ' +
      'sentinels, so removing one blinds the gate');
  } else {
    // Slice from the OPENING `/*` and past the closing `*/`, so the block's
    // own documentation is a well-formed comment inside the region and the
    // stripper can actually remove it. Slicing from the sentinel text alone
    // would leave a comment with no opener, which the stripper cannot see —
    // and a gate its own documentation can trip is self-invalidating.
    const open = cssSrc.lastIndexOf('/*', s);
    const close = cssSrc.indexOf('*/', e);
    cssBlock = {
      text: cssSrc.slice(open === -1 ? s : open,
        close === -1 ? e : close + 2),
      line: lineOf(cssSrc, open === -1 ? s : open)
    };
  }
}

// positive: the four numbers the design contract declares
[
  { token: 'line-height: 1.7',
    why: 'the CJK corpus reads as a solid block at the chrome 1.5; this is ' +
      'the single highest-leverage legibility change of the phase' },
  { token: 'margin-top: 32px',
    why: 'a heading must bind to the run BELOW it, not float between two ' +
      'equal gaps' },
  { token: 'margin-bottom: 8px',
    why: 'the other half of the 32/8 heading rhythm' },
  { token: 'padding-left: 24px',
    why: 'the UA 40px list indent wastes measure inside the spread rect' },
  { token: 'overflow-wrap: break-word',
    why: 'a pasted URL or a long unbroken run must wrap inside the content ' +
      'column and never scroll the page body sideways' }
].forEach(function (rule) {
  if (cssSrc.indexOf(rule.token) === -1) {
    violations.push('[content-typography] ' + CSS +
      (cssBlock ? ':' + cssBlock.line : '') + ' does not declare ' +
      JSON.stringify(rule.token) + ' — ' + rule.why);
  }
});

// negative: nothing decorative, nothing animated, nothing accented, and none
// of the three text properties this phase deliberately leaves unset.
[
  ['--accent', 'the accent color is reserved chrome and never touches a ' +
    'content body — the ink/ink-soft step IS the whole decoration budget'],
  ['transition', 'no motion ever applies to a content region (law 4)'],
  ['animation', 'no motion ever applies to a content region (law 4)'],
  ['transform:', 'no motion ever applies to a content region (law 4)'],
  ['image-rendering', 'pixelation is station-sprite chrome, never content'],
  ['word-break', 'breaking Latin words mid-word damages English and buys ' +
    'nothing for CJK, which already breaks between characters'],
  ['text-align', 'justified CJK opens rivers; this app never justifies'],
  ['letter-spacing', 'tracking on CJK is decoration, which law 4 forbids']
].forEach(function (pair) {
  absent(cssBlock, pair[0], 'content-typography', CSS, pair[1]);
});

// ---- K. FENCE COVERS ALL SIX (owner decision, 2026-07-31) -------------------
//
// The six saved-body CONTAINERS and the render site each one serves. A NEW
// SAVED-BODY SITE MUST BE ADDED HERE DELIBERATELY: without its container in
// the content fence, a note body renders at the chrome's line-height on that
// surface and the same text reads two different ways depending on where she
// met it. This is the gate that would have caught the original gap.
const SAVED_BODY_CONTAINERS = [
  ['#blessing-card', 'renderBlessingCard — the blessing card'],
  ['#reader-content', 'fillReaderInto (legacy reader) and openInsightItem'],
  ['#spread-content', 'fillReaderInto — the diegetic spread'],
  ['.reveal-snap', 'renderRevealSnapshot — the never-show reveal snapshot'],
  ['.proposal-piece', 'fillProposalPieces — the desk-proposal stack'],
  ['.insight-piece', 'fillInsightPieces — the insight gallery']
];

{
  const commentIdx = cssSrc.indexOf('THE CONTENT FENCE');
  const commentEnd = cssSrc.indexOf('*/', commentIdx);
  const brace = cssSrc.indexOf('{', commentEnd);
  if (commentIdx === -1 || commentEnd === -1 || brace === -1) {
    violations.push('[fence-coverage] ' + CSS + ': THE CONTENT FENCE block ' +
      'could not be located — it is the rule that keeps every rendered note ' +
      'body in the readable serif, and this gate has nothing to check ' +
      'without it');
  } else {
    // the SELECTOR LIST only, never the fence's own comment (which names
    // some of these selectors in prose)
    const fenceList = cssSrc.slice(commentEnd + 2, brace);
    const fenceLine = lineOf(cssSrc, commentIdx);
    SAVED_BODY_CONTAINERS.forEach(function (pair) {
      const escaped = pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|[\\s,])' + escaped + '($|[\\s,])');
      if (!re.test(fenceList)) {
        violations.push('[fence-coverage] ' + CSS + ':' + fenceLine +
          ' the content fence does not cover ' + pair[0] + ' (the body ' +
          'container for ' + pair[1] + ') — a saved-body surface outside ' +
          'the fence reads at the chrome line-height, so the SAME note ' +
          'would read two different ways depending on where she met it');
      }
    });
  }
}

// ---- K2. F-6 — A PLAIN LINK IN A BODY IS PROSE, NOT CHROME ------------------
//
// Raised by the owner live in the D-17 UAT: a plain markdown link inside a
// note body had no rule in tokens.css at all and fell through to the UA
// stylesheet as #0000EE underlined. 347 of 2,949 notes carry one (3,956
// links). The fix gives it `color: inherit` on all six body surfaces.
//
// WHY THIS GATE EXISTS RATHER THAN A COMMENT. The fix's selectors are
// ID-scoped: `#reader-content a` scores (1,0,1) and BEATS `a.wikilink`'s
// (0,1,1); `.insight-piece a` ties it and wins on source order. So without
// `:not(.wikilink):not(.pathref)` on every selector, the F-6 rule silently
// flattens the wikilink accent and the path-ref door everywhere. The natural
// assumption — "the classed rules are more specific, they will survive" — is
// exactly backwards, which is why this is asserted and not reasoned about.
//
// This gate is RED before the fix (the rule does not exist -> the six
// selectors are not found), and RED again if any one `:not()` is dropped.
(function () {
  const marker = '26.88-15 F-6';
  const at = cssSrc.indexOf(marker);
  if (at === -1) {
    violations.push('[f6-link] ' + CSS + ': no ' + JSON.stringify(marker) +
      ' rule — a plain link inside a note body falls through to the UA ' +
      'stylesheet (#0000EE underlined), a colour outside the Gallery ' +
      '(warm) palette that nobody chose');
    return;
  }
  const line = lineOf(cssSrc, at);
  // the two selector lists that follow the marker comment, up to the end of
  // the :hover rule — sliced from the CSS, never from the comment prose
  const close = cssSrc.indexOf('*/', at);
  const region = cssSrc.slice(close === -1 ? at : close + 2,
    (close === -1 ? at : close + 2) + 1400);

  SAVED_BODY_CONTAINERS.forEach(function (pair) {
    const escaped = pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The base (non-hover) selector must exclude BOTH classed link kinds.
    //
    // THE TRAILING [,{] IS THE WHOLE ASSERTION. Without it this regex is
    // satisfied by the :hover rule below, whose selectors contain the base
    // selector as a literal prefix — so dropping `:not()` from the base rule
    // left the gate GREEN when it was first written, and the mutation run is
    // the only reason that was caught. Anchoring on the character that ENDS
    // a selector (a comma in the list, or the opening brace on the last one)
    // means only the base rule can satisfy it: every hover selector has
    // `:hover` in that position instead.
    const re = new RegExp(escaped +
      '\\s+a:not\\(\\.wikilink\\):not\\(\\.pathref\\)\\s*[,{]');
    if (!re.test(region)) {
      violations.push('[f6-link] ' + CSS + ':' + line + ' ' + pair[0] +
        ' is missing an `a:not(.wikilink):not(.pathref)` selector — an ' +
        'ID-scoped bare `a` outscores a.wikilink (1,0,1 vs 0,1,1) and a ' +
        'class-scoped one ties and wins on order, so the accent link and ' +
        'the path-ref door would be flattened on ' + pair[1]);
    }
  });

  if (!/color:\s*inherit/.test(region)) {
    violations.push('[f6-link] ' + CSS + ':' + line + ' the F-6 rule does ' +
      'not declare `color: inherit` — the whole point is that an inline ' +
      'citation reads as the prose around it');
  }
  if (/--accent/.test(region)) {
    violations.push('[f6-link] ' + CSS + ':' + line + ' the F-6 rule names ' +
      '--accent — the accent is reserved chrome and never touches a ' +
      'content body');
  }

  // the counterpart the exclusions protect: a.wikilink must still be the
  // accent. If a future edit flattens it, THIS is what goes red.
  const wl = cssSrc.indexOf('a.wikilink');
  const wlEnd = wl === -1 ? -1 : cssSrc.indexOf('}', wl);
  if (wl === -1 || wlEnd === -1 ||
      !/color:\s*var\(--accent\)/.test(cssSrc.slice(wl, wlEnd))) {
    violations.push('[f6-link] ' + CSS + ': a.wikilink no longer resolves ' +
      'to var(--accent) — F-6\'s exclusions exist precisely to preserve it');
  }
})();

// ---- H. NEGATIVE VAULT-WRITE GATE (SC-6 / D-11) -----------------------------
//
// This phase ships DISPLAY-TIME reformatting only. The vault file is never
// written, so 26.85's byte-identity promise stays fully intact and nothing
// needs undoing. That claim is worth exactly as much as the gate under it.

// The shipped tier-1 writer's entry points (study_lib). These are Python
// names; they have no business anywhere on the display side. A NEW WRITER
// ENTRY POINT MUST BE ADDED HERE DELIBERATELY.
const VAULT_WRITER_ENTRY_POINTS = [
  'apply_cleaning_frontmatter',
  'restore_frontmatter_block'
];

// Constructs that write a file or mutate something over the network. A NEW
// TOKEN MUST BE ADDED HERE DELIBERATELY.
// POST is the HTTP METHOD, and it is matched with identifier boundaries on
// both sides rather than as a bare substring. Plan 03 named a domain constant
// SHORT_POST_LINES — vault reformatting rule 10, "don't add headers if the
// post is short", where "post" means a 小红书 post — and a substring ban
// flagged it as a network mutation. That is a false positive: the constant is
// an integer, and the correct answer is a pattern that distinguishes the verb
// from the noun, not a renamed constant that loses the domain word.
const HTTP_POST_RE = /(^|[^A-Za-z0-9_])POST([^A-Za-z0-9_]|$)/;

const WRITE_TOKENS = ['writeFileSync', 'appendFileSync', 'unlinkSync',
  'renameSync', 'mkdirSync', 'createWriteStream', 'sendBeacon',
  'XMLHttpRequest', HTTP_POST_RE].concat(VAULT_WRITER_ENTRY_POINTS);

// The pure functions this phase added to core.js, plus the one wrapper in
// app.js. Widened in plan 06 with the three that place a model-named
// heading — the newest code on the display path is exactly the code that
// most needs to be provably unable to touch a file.
const NEW_CORE_FUNCTIONS = ['normalizeWords', 'wordsPreserved',
  'hasAuthorHeading', 'fmSource', 'isPersonalNote', 'structureBody',
  'headingRecordOk', 'handsOffSpans', 'placeHeadings'];

const writeRegions = [{ file: APP, body: savedBody }];
NEW_CORE_FUNCTIONS.forEach(function (name) {
  writeRegions.push({
    file: CORE,
    body: functionBody(coreSrc, CORE, name, 'no-vault-write')
  });
});

writeRegions.forEach(function (region) {
  WRITE_TOKENS.forEach(function (token) {
    absent(region.body, token, 'no-vault-write', region.file,
      'reading-first reformatting is DISPLAY-TIME ONLY: the note on disk ' +
      'stays byte for byte the note she saved (SC-6 / D-11), so nothing on ' +
      'this path may write a file or mutate anything over the network');
  });
});

// The display-side files this phase touches must not name the writer at all.
//
// WIDENED IN PLAN 02, as plan 01 said it would be. Plan 01 scoped this list
// to the three files it had authored or read in full, because an unmeasured
// roster would have been red on arrival for a reason unrelated to the phase.
// app.js was then read END TO END at plan-02 time (all 14,000+ lines, the
// same pass that measured PINNED_GUARD_COUNT) and names NEITHER writer entry
// point anywhere — so it joins the list as a measured fact rather than an
// assumption, and the new property suite joins it as an authored file.
//
// TWO DELIBERATE ABSENCES, so nobody "completes" this list by accident:
//   * THIS FILE cannot be a member. It names both entry points as string
//     literals — they are the roster — and stripComments does not strip
//     string literals, so adding it would make the gate fail on its own
//     definition of what it is looking for.
//   * server.py and study_lib.py cannot be members. The writer LIVES there;
//     that is the whole point of the display side not naming it.
[
  { file: CORE, text: coreSrc },
  { file: APP, text: appSrc },
  { file: CSS, text: cssSrc },
  { file: FIXTURES, text: fixturesSrc },
  { file: PROPERTY, text: propertySrc }
].forEach(function (entry) {
  VAULT_WRITER_ENTRY_POINTS.forEach(function (name) {
    absent({ text: entry.text, line: 1 }, name, 'no-vault-write', entry.file,
      'the tier-1 vault writer lives in python and is reachable only ' +
      'through the server; naming it on the display side would be a new ' +
      'write path, which this phase does not have and must never grow');
  });
});

// ---- I. THE ONE INTERACTION (D-08, SC-4) ------------------------------------
//
// WHAT THIS GROUP CANNOT PROVE — said out loud, so a green line here is never
// mistaken for evidence that the escape works:
//   * that toggling twice returns the IDENTICAL DOM as the first render.
//     This gate reads source as text; it never builds a document.
//   * that the scroll region does not jump when the body is swapped.
//   * that the control READS AS A DOOR AND NOT A DIAL — whether a depleted
//     reader finds it without hunting, and whether one lowercase line at the
//     end of a row she already knows is the right register at all.
// All three are the blocking owner UAT beat in plan 08. A green group I means
// the control is WIRED the way D-08 and the UI-SPEC describe. It says nothing
// whatsoever about how the control feels, and it must never be quoted as if
// it did.

const TOGGLE_ID = 'btn-show-as-saved';
// The two labels from the approved copywriting contract, byte for byte,
// including case: the doc's register is lowercase prose.
const TOGGLE_LABEL_LAID_OUT = 'show as saved';
const TOGGLE_LABEL_ORIGINAL = 'show it laid out again';

// The shipped quiet-link recipe, written the way it reads at RUN time (the
// source hard-wraps it across two literals, which joinConcats folds back).
// The blessing ribbon's two links carry exactly this; so must the escape —
// not a .btn, not the accent, just a quiet underline in the soft ink.
const QUIET_LINK_STYLE = 'style="background:none;border:none;' +
  'color:var(--ink-soft);cursor:pointer;font:inherit;' +
  'text-decoration:underline"';

const reactionBar = functionBody(appSrc, APP, 'renderReactionBar',
  'one-interaction');
const readerFill = functionBody(appSrc, APP, 'fillReaderInto',
  'one-interaction');

if (reactionBar) {
  [[TOGGLE_LABEL_LAID_OUT, 'the laid-out-view label — the one word she ' +
    'reads when the room has laid a note out'],
   [TOGGLE_LABEL_ORIGINAL, 'the original-view label — the way back']
  ].forEach(function (pair) {
    if (reactionBar.text.indexOf(pair[0]) === -1) {
      violations.push('[one-interaction] ' + APP + ':' + reactionBar.line +
        ' renderReactionBar does not carry ' + JSON.stringify(pair[0]) +
        ' — ' + pair[1] + '. Copy is a shipped promise and is grep-pinned ' +
        'like every other string in this app');
    }
  });

  const BUTTON_TAG = '<button id="' + TOGGLE_ID + '" type="button" ';
  if (reactionBar.text.indexOf(BUTTON_TAG) === -1) {
    violations.push('[one-interaction] ' + APP + ':' + reactionBar.line +
      ' the escape is not built as ' + JSON.stringify(BUTTON_TAG) + ' — it ' +
      'has to be a REAL button with an explicit type and a stable id, so it ' +
      'lands in natural tab order after the three judgments and can be ' +
      'given a focus ring by selector. A div with a click handler is not ' +
      'reachable from the keyboard at all');
  }

  const barJoined = joinConcats(reactionBar.text);
  if (barJoined.indexOf(QUIET_LINK_STYLE) === -1) {
    violations.push('[one-interaction] ' + APP + ':' + reactionBar.line +
      ' the escape does not carry the shipped quiet-link recipe ' +
      JSON.stringify(QUIET_LINK_STYLE) + ' — the register IS the meaning ' +
      'here: a fourth button in the judgment style would read as a fourth ' +
      'judgment, and the accent would make an exit shout');
  }

  // ...and the recipe is pinned to its SOURCE, so a change to the shipped
  // links can never leave this one quietly diverged.
  const blessRibbon = functionBody(appSrc, APP, 'renderBlessingRibbon',
    'one-interaction');
  if (blessRibbon &&
      joinConcats(blessRibbon.text).indexOf(QUIET_LINK_STYLE) === -1) {
    violations.push('[one-interaction] ' + APP + ':' + blessRibbon.line +
      ' the blessing ribbon no longer carries the quiet-link recipe this ' +
      'gate pins the escape against. The two are meant to be the SAME ' +
      'register; if the shipped one moved, decide deliberately whether the ' +
      'escape follows it and update QUIET_LINK_STYLE with the reason');
  }

  if (reactionBar.text.indexOf('REFORMAT_STATE') === -1) {
    violations.push('[one-interaction] ' + APP + ':' + reactionBar.line +
      ' renderReactionBar never reads REFORMAT_STATE — the control is ' +
      'rendered IF AND ONLY IF this open\'s render actually differed from ' +
      'the saved body. Rendered unconditionally it becomes a dial on every ' +
      'note, present-but-inert on the ones it cannot do anything for, and ' +
      'its absence stops meaning anything at all');
  }

  // the opening tag itself, so the ban is on THE CONTROL rather than on the
  // row (the three judgments legitimately carry the button class).
  const tagAt = reactionBar.text.indexOf('<button id="' + TOGGLE_ID + '"');
  if (tagAt !== -1) {
    const tagEnd = reactionBar.text.indexOf('>', tagAt);
    absent({ text: reactionBar.text.slice(tagAt,
      tagEnd === -1 ? tagAt : tagEnd),
      line: lineOf(appSrc, reactionBar.start + tagAt) },
      'class=', 'one-interaction', APP,
      'the escape wears no class at all: the quiet-link recipe rides ' +
      'inline exactly as the shipped ribbon links do. A class here is how ' +
      'it starts looking like a fourth judgment');
  }

  // ⛔⛔ NARROWED 2026-08-24 (26.98-06), THE SAME WAY AND FOR THE SAME REASON
  // AS THE `class=` BAN TWENTY LINES ABOVE. This ban belongs to THE ESCAPE
  // CONTROL, and its own sentence says so: "this is not a persistent mode ...
  // a pressed state would announce a setting that does not exist". It was
  // written over the whole renderReactionBar body, which was harmless only for
  // as long as nothing else on the row had a state. Handoff §M7 (26.98-06) put
  // a REAL persistent chosen state on the two feeling-marks — HER ruling of
  // 2026-08-24 — so the row now legitimately carries aria-pressed twice, and a
  // body-wide ban would have forced her ruling to be un-shipped to keep a gate
  // about a different control green.
  //
  // ⛔ THE BAN IS NOT WEAKENED — IT IS AIMED. The escape still may not be a
  // mode, and this now says exactly that: the check reads the escape's OWN
  // opening tag, so `aria-pressed` on btn-show-as-saved still fails, while the
  // judgments beside it are none of this gate's business. The precedent is
  // this file's own: "the ban is on THE CONTROL rather than on the row (the
  // three judgments legitimately carry the button class)".
  if (tagAt !== -1) {
    const modeEnd = reactionBar.text.indexOf('>', tagAt);
    absent({ text: reactionBar.text.slice(tagAt,
      modeEnd === -1 ? tagAt : modeEnd),
      line: lineOf(appSrc, reactionBar.start + tagAt) },
      'aria-pressed', 'one-interaction', APP,
      'this is not a persistent mode. The label states the next action — ' +
      'the shipped convention across this app\'s quiet links — and a ' +
      'pressed state would announce a setting that does not exist');
  }

  [['localStorage', 'the toggle is PER-OPEN. A remembered preference is a ' +
    'setting, and a setting is a decision she has to keep making (D-08, ' +
    "26.87's config-stress principle)"],
   ['sessionStorage', 'same rule: nothing about this control survives the ' +
     'note being closed'],
   ['document.cookie', 'same rule, and a cookie would additionally leave ' +
     'the machine on any future request'],
   ['fetch(', 'the swap re-renders from the per-open memory recorded at ' +
     'fill time. A re-read of the note would make an instant swap an ' +
     'async one, and an async boundary in a reading surface is where a ' +
     'spinner comes from (SC-3, D-02)'],
   ['accesskey', 'no shortcut is registered: one control at the end of a ' +
     'row she already knows is the whole interaction'],
   ['--accent', 'the accent is reserved chrome (the masthead, the reaching ' +
     'candle, the catalog swatch, a wikilink, the fixture ring). An exit ' +
     'never shouts'],
   ['--never', 'the vermillion belongs to the irreversible judgment beside ' +
     'this control. Wearing it would make a reversible, consequence-free ' +
     'swap look like the one button in the room that cannot be undone']
  ].forEach(function (pair) {
    absent(reactionBar, pair[0], 'one-interaction', APP, pair[1]);
  });
}

// ONE control, on the two reading surfaces, and nowhere else. Counted over
// the RAW file on purpose: this id is long and unique, so there is no
// substring accident to guard against, and naming it anywhere else in app.js
// — a comment included — is itself the thing worth noticing, because the
// control exists on exactly one row.
{
  const idTotal = countOccurrences(appSrc, TOGGLE_ID);
  const idInBar = reactionBar
    ? countOccurrences(reactionBar.text, TOGGLE_ID) : 0;
  if (idInBar === 0) {
    violations.push('[one-interaction] ' + APP + ': the control id ' +
      JSON.stringify(TOGGLE_ID) + ' is not built inside renderReactionBar ' +
      'at all — that ONE function serves both the legacy reader and the ' +
      'in-scene spread, which is exactly why D-08 needs no second ' +
      'implementation and no new chrome band');
  }
  if (idTotal !== idInBar) {
    violations.push('[one-interaction] ' + APP + ': the control id ' +
      JSON.stringify(TOGGLE_ID) + ' occurs ' + idTotal + ' time(s) in the ' +
      'file but only ' + idInBar + ' inside renderReactionBar. The escape ' +
      'belongs to the READING surfaces only — the blessing card, the reveal ' +
      'snapshot, the gallery and the notebook are glance surfaces, they ' +
      'reformat with no toggle, and D-08 says one control in the reader');
  }
}

// ...and the four glance surfaces named one by one, so a failure says WHICH
// surface grew a control rather than only that the count moved.
['renderBlessingCard', 'renderRevealSnapshot', 'fillInsightPieces',
  'openInsightItem'].forEach(function (name) {
  absent(functionBody(appSrc, APP, name, 'one-interaction'), TOGGLE_ID,
    'one-interaction', APP,
    'a glance surface never carries the escape: it is somewhere she LOOKS, ' +
    'not somewhere she reads, and a control there is chrome on a card ' +
    '(D-08, UI-SPEC "Surfaces")');
});

// NOTHING PERSISTS — and the mechanism is that both per-open maps are
// emptied exactly once, in the one function that owns filling a note into
// the reader or the spread. The declaration is subtracted the same way the
// wrapper's own declaration is subtracted in group C.
[['SHOW_AS_SAVED', 'the per-open toggle state'],
  ['REFORMAT_STATE', 'the per-open differs flag']].forEach(function (pair) {
  const clear = pair[0] + ' = {}';
  const decl = 'var ' + clear;
  const clears = countOccurrences(appSrc, clear) -
    countOccurrences(appSrc, decl);
  if (clears !== 1) {
    violations.push('[one-interaction] ' + APP + ': found ' + clears +
      ' assignment(s) emptying ' + pair[0] + ' (' + pair[1] + '), expected ' +
      'exactly 1. Two clears means two lifetimes and neither is the stated ' +
      'one; none means the toggle survives the note being closed, which is ' +
      'a remembered preference by another name (D-08)');
  }
  if (readerFill && readerFill.text.indexOf(clear) === -1) {
    violations.push('[one-interaction] ' + APP + ':' + readerFill.line +
      ' fillReaderInto does not empty ' + pair[0] + '. BOTH maps are ' +
      'cleared in this ONE function on purpose: it is the shared builder ' +
      'for the legacy reader and the in-scene spread, so clearing here is ' +
      'what makes "every open of every note starts in the laid-out view" ' +
      'true on both surfaces at once');
  }
});

// The state map never comes within ten lines of a browser-storage call
// anywhere in the file — the leak this would be is quiet and permanent, and
// it would not change a single thing on screen the day it happened.
{
  const STORAGE_TOKENS = ['localStorage', 'sessionStorage', 'document.cookie'];
  const appLines = appSrc.split('\n');
  appLines.forEach(function (line, i) {
    if (line.indexOf('SHOW_AS_SAVED') === -1) { return; }
    const region = {
      text: appLines.slice(Math.max(0, i - 10),
        Math.min(appLines.length, i + 11)).join('\n'),
      line: i + 1
    };
    STORAGE_TOKENS.forEach(function (token) {
      absent(region, token, 'one-interaction', APP,
        'the per-open toggle state sits within ten lines of a persistence ' +
        'call. D-08 forbids remembering this preference anywhere: no ' +
        'storage key, no cookie, no server round-trip, no Manage entry');
    });
  });
}

// Group E again, because task 1 EDITED renderSavedBody. A gate that only
// checked the shape a function had before it was touched is a gate that
// checks nothing.
ASYNC_TOKENS.forEach(function (token) {
  absent(savedBody, token, 'one-interaction', APP,
    'renderSavedBody gained the toggle branch in plan 04 and must still be ' +
    'synchronous by construction — with no asynchronous boundary there is ' +
    'no state at which a spinner could ever be rendered into a note body ' +
    '(SC-3, D-02)');
});

// ---- I (css) — the three rules the control needs ----------------------------

const CSS_BLOCK04_START = '26.88-04 THE ONE INTERACTION (start)';
const CSS_BLOCK04_END = '26.88-04 THE ONE INTERACTION (end)';

let cssBlock04 = null;
{
  const s = cssSrc.indexOf(CSS_BLOCK04_START);
  const e = cssSrc.indexOf(CSS_BLOCK04_END);
  if (s === -1 || e === -1 || e < s) {
    violations.push('[one-interaction] ' + CSS + ': the sentinel pair ' +
      JSON.stringify(CSS_BLOCK04_START) + ' / ' +
      JSON.stringify(CSS_BLOCK04_END) + ' is missing — this gate slices ' +
      'the block it guards by those sentinels, so removing one blinds it');
  } else {
    // From the OPENING `/*` to past the closing `*/`, the group-G shape:
    // the block's own documentation is then a well-formed comment inside
    // the region and the stripper can actually remove it.
    const open = cssSrc.lastIndexOf('/*', s);
    const close = cssSrc.indexOf('*/', e);
    cssBlock04 = {
      text: cssSrc.slice(open === -1 ? s : open, close === -1 ? e : close + 2),
      line: lineOf(cssSrc, open === -1 ? s : open)
    };
  }
}

if (cssBlock04) {
  // Rule-by-rule, over the comment-stripped block: a declaration only
  // counts when it sits in a rule that actually selects the control.
  const rules = stripComments(cssBlock04.text).split('}');
  function ruleWith(selector, decl) {
    return rules.some(function (rule) {
      return rule.indexOf(selector) !== -1 && rule.indexOf(decl) !== -1;
    });
  }
  if (!ruleWith('#' + TOGGLE_ID, 'margin-left: auto')) {
    violations.push('[one-interaction] ' + CSS + ':' + cssBlock04.line +
      ' no rule gives #' + TOGGLE_ID + ' the automatic left margin — this ' +
      'is the shipped #btn-ribbon-bless-enough pattern verbatim, and it is ' +
      'what makes the escape read as a quiet exit at the end of the row ' +
      'rather than as a fourth judgment');
  }
  if (!ruleWith('#' + TOGGLE_ID + ':focus-visible', 'outline:')) {
    violations.push('[one-interaction] ' + CSS + ':' + cssBlock04.line +
      ' no focus-visible rule names #' + TOGGLE_ID + '. THIS STYLESHEET ' +
      'HAS NO GLOBAL FOCUS RULE (checker-verified): the outline lives only ' +
      'under element-scoped selectors, so a bare button in the row inherits ' +
      'NOTHING and falls to the browser default ring on the paper fill');
  }
  if (stripComments(cssBlock04.text).indexOf('flex-wrap: wrap') === -1) {
    violations.push('[one-interaction] ' + CSS + ':' + cssBlock04.line +
      ' the row is not declared to wrap. At a narrow window the row holds ' +
      'four controls and the judgment labels are already long; wrapping is ' +
      'what keeps the escape from being squeezed against the irreversible ' +
      'judgment at the moment she reaches for it (owner call, UI probe)');
  }

  // the focus ring is the INK, deliberately not the accent — the third
  // shipped focus precedent (.station-fixture) uses the accent and is the
  // one this must NOT copy.
  const focusRule = rules.filter(function (rule) {
    return rule.indexOf('#' + TOGGLE_ID + ':focus-visible') !== -1;
  }).join('\n');
  absent({ text: focusRule, line: cssBlock04.line }, '--accent',
    'one-interaction', CSS,
    "the control's focus ring uses the ink token. The accent is reserved " +
    'chrome and this phase adds nothing to that list');

  [['transition', 'no motion ever applies to this control or to the swap ' +
    '(law 4) — the swap is an instant re-render, not an effect'],
   ['animation', 'no motion ever applies to this control or to the swap ' +
     '(law 4)'],
   ['transform:', 'no motion ever applies to this control or to the swap ' +
     '(law 4)'],
   ['--accent', 'the accent is reserved chrome and this phase adds nothing ' +
     'to that list'],
   ['--never', 'the vermillion belongs to the irreversible judgment beside ' +
     'this control, never to a reversible one'],
   ['text-overflow', 'no label is ever clipped: truncating a control she ' +
     'is reaching for is how an escape stops being findable'],
   ['white-space: nowrap', 'the row wraps instead — nothing is held on one ' +
     'line at the cost of the label'],
   ['font-size', 'nothing shrinks to make the row fit. Small text is the ' +
     'very problem this phase exists to fix']
  ].forEach(function (pair) {
    absent(cssBlock04, pair[0], 'one-interaction', CSS, pair[1]);
  });
}

// ---- J. THE HEADING PATH (D-01 / D-02 / SC-3) -------------------------------
//
// PROVENANCE IS INVISIBLE BY DESIGN, and that is the frame for this whole
// group. A heading the librarian NAMED and a heading PROMOTED out of the
// author's own words render identically — no badge, no tint, no italic, no
// icon, no marker — because any such mark is decoration on a reading surface
// and law 4 forbids it (UI-SPEC § "The two heading provenances", both design
// consequences binding). The asymmetry is real, so it is discharged the only
// honest way left: in WORDS, through the LIBRARIAN.md disclosure copy that
// plan 07 pins. This group asserts the decoration does not exist. Plan 07's
// copy gate asserts the words do. Neither is optional and neither substitutes
// for the other.
//
// WHAT THIS GROUP CANNOT PROVE, said out loud: that a heading actually lands
// where the anchor is. That is behavioural and belongs to the two suites that
// execute the transform — tests/test_reformat_fixtures.cjs (the worked
// example, byte for byte) and tests/test_reformat_property.cjs (P7, the
// undeclared-heading counter-test across 300 seeded bodies). A green group J
// means the heading path is WIRED as D-01/D-02 describe. It says nothing
// about where a heading ends up.

const HEADINGS_LOOKUP = 'headingsFor(';
// The tidy-up's run-state route, as a string, because the count below is the
// whole point of the assertion. IT IS DELIBERATELY NOT WRITTEN IN ANY COMMENT
// IN app.js — the count reads the raw file (the group-C convention), so a
// route path quoted in prose over there would inflate it and blind this gate.
const PROGRESS_ROUTE = '/api/librarian/clean/progress';
// Measured by reading app.js at plan-06 time: ONE shipped read inside
// readCleaningProgress, plus the load-time read that plan added.
//
// ⚠ RE-MEASURED TWICE, AND BOTH TIMES THE REASON WAS A DELETION rather than
// a refactor. 2026-08-14 (26.95-05): 2 -> 1, when the tidy-up surface's
// poller of its own model run went, because #89 ruled the shipped tidy-up
// sends nothing to any model and so has no run to poll. 2026-08-17: 1 -> 0,
// when the labelling pass's two model jobs were deleted (#95) and the route
// itself went with them — the load-time population had nothing left to read.
//
// ⛔ ZERO IS THE STRONGEST FORM THIS GATE HAS EVER HAD, and it is still the
// same claim: NO NETWORK ROUND-TRIP ON THE READ PATH (SC-3, D-02,
// T-26.88-19). At zero it also says the deleted route is not quietly named
// again. Each lowering followed a call site being deleted — deliberately,
// per this comment's own instruction — and never to make a red suite green.
const EXPECTED_PROGRESS_CALL_SITES = 0;

// ⛔ CHECKS (i), (ii) AND (iv) WERE DELETED 2026-08-17. They guarded the
// client's in-memory headings map: that `renderSavedBody` read the lookup
// exactly once, that the lookup itself reached no network/storage, and that
// the load-time population drew nothing when it failed. #95 deleted the job
// that filled the map, the route that served it, and the map itself — so
// `headingsFor` and `loadHeadingsAtBoot` no longer exist and a gate naming
// them fails on absence rather than on a defect.
//
// ⚠ WHAT THEY PROTECTED IS NOW PROTECTED BY (iii) AT ZERO: the property was
// always "no request at the moment she opens a note", and the strongest form
// of that is a read path with no route to call. ⛔ A heading pass returning
// must re-arm (i), (ii) and (iv) with it — the map is where the spinner risk
// lived, not the job.
//
// The synchronous-shape guard below is KEPT and is not about headings: it is
// group E re-run over `renderSavedBody`, because this plan edited that
// function and a gate that only checks the shape a function had before it was
// touched checks nothing.
ASYNC_TOKENS.forEach(function (token) {
  absent(savedBody, token, 'heading-path', APP,
    'renderSavedBody must be synchronous BY CONSTRUCTION. It lost its ' +
    'headings argument in the #95 deletion, which removes an input rather ' +
    'than a constraint: the reason a reading surface may not await anything ' +
    'is that she must never wait to open a note (SC-3, D-02)');
});

// (iii) NO read of the run-state route, from anywhere. This is the assertion
// that makes a spinner in a reading surface structurally impossible rather
// than a code-review question.
{
  const sites = countOccurrences(appSrc, PROGRESS_ROUTE);
  if (sites !== EXPECTED_PROGRESS_CALL_SITES) {
    violations.push('[heading-path] ' + APP + ': the tidy-up run-state ' +
      'route is named ' + sites + ' time(s), expected exactly ' +
      EXPECTED_PROGRESS_CALL_SITES + ' — THE ROUTE IS DELETED (#95), so any ' +
      'call site is either a resurrected read or a stale one, and either ' +
      'PUTS A NETWORK ROUND-TRIP ON THE READ PATH the moment a render path ' +
      'reaches it (SC-3, D-02, T-26.88-19). If a heading pass genuinely ' +
      'returns, add its read deliberately and update this count with the ' +
      'reason — and re-arm checks (i), (ii) and (iv) with it');
  }
  SAVED_SITES.concat(['renderReactionBar']).forEach(function (name) {
    absent(functionBody(appSrc, APP, name, 'heading-path'), PROGRESS_ROUTE,
      'heading-path', APP,
      'A RENDER PATH NEVER FETCHES A HEADING. This function draws a saved ' +
      'body (or the row beside one), so a read here happens at the exact ' +
      'moment she opens a note — which is the one moment SC-3 says she must ' +
      'never wait. The records are already in memory by then');
  });
}

// (v) core.js never emits a model-named heading without declaring it.
//
// A PURELY TEXTUAL ASSERTION CANNOT EXPRESS "every emission is accompanied by
// an append" safely, so this asserts the two occur the SAME NUMBER OF TIMES
// inside the one function that places a heading — and says plainly that the
// BEHAVIOURAL proof is elsewhere: the undeclared-heading counter-test in
// tests/test_reformat_property.cjs (P7) and case H5 in
// tests/test_reformat_fixtures.cjs. Those execute the transform; this only
// reads it.
{
  const place = functionBody(coreSrc, CORE, 'placeHeadings', 'heading-path');
  const structure = functionBody(coreSrc, CORE, 'structureBody',
    'heading-path');
  if (place) {
    const emits = countOccurrences(place.text, "'## ' + rec.heading");
    const declares = countOccurrences(place.text, 'declared.push(');
    if (emits !== 1 || declares !== 1 || emits !== declares) {
      violations.push('[heading-path] ' + CORE + ':' + place.line +
        ' placeHeadings emits a model-named heading ' + emits +
        ' time(s) and appends to the declared list ' + declares +
        ' time(s); both must be exactly 1. THE DECLARED LIST IS THE ' +
        "GUARD'S ENTIRE ALLOWANCE: an emission with no append is a word " +
        'the transform put on her screen that the guard was never told ' +
        'about, and a second emission path is a second place that can ' +
        'forget');
    }
  }
  if (structure) {
    const calls = countOccurrences(structure.text, 'placeHeadings(');
    if (calls !== 1) {
      violations.push('[heading-path] ' + CORE + ':' + structure.line +
        ' structureBody calls placeHeadings ' + calls +
        ' time(s), expected exactly 1 — placement runs ONCE, before the ' +
        'signal rules, so a promoted heading and a model-named one compose ' +
        'without either knowing about the other');
    }
    absent(structure, 'addedHeadings.push(', 'heading-path', CORE,
      'structureBody itself never declares a heading. Every entry on the ' +
      'declared list is put there by placeHeadings, on a heading it ' +
      'actually emitted — if the transform could append from a second place, ' +
      "the guard's allowance would stop being an exact record of what was " +
      'added and become an assertion about it');
  }
}

// (vi) NOTHING distinguishes a model-named heading from a promoted one.
//
// An explicit roster rather than a pattern, because a pattern here would be a
// false-positive generator over two files this phase deliberately commented
// heavily — and every entry routes through stripComments for the same reason.
// A NEW DECORATION TOKEN MUST BE ADDED HERE DELIBERATELY; the right response
// to a new way of marking provenance is to delete the marking, not to widen
// this list.
const PROVENANCE_DECORATION = [
  'data-heading-source', 'data-provenance', 'data-model-heading',
  'heading-provenance', 'model-heading', 'named-heading', 'heading-source',
  'librarian-heading', 'ai-heading', 'suggested-heading', 'heading-badge',
  'heading-marker'
];

[{ file: CORE, text: coreSrc }, { file: APP, text: appSrc }]
  .forEach(function (entry) {
    PROVENANCE_DECORATION.forEach(function (token) {
      absent({ text: entry.text, line: 1 }, token, 'heading-path', entry.file,
        'PROVENANCE IS INVISIBLE BY DESIGN (law 4). A badge, tint, italic, ' +
        'icon, class or attribute that says "the room named this one" is ' +
        'decoration on a reading surface, and it was rejected outright — ' +
        'the asymmetry is disclosed in WORDS in LIBRARIAN.md instead (D-09, ' +
        'pinned by plan 07), which is the honest resolution of "verbatim & ' +
        'undecorated" under a reformatter');
    });
  });

// ---- K3. PICTURES FIT THE PAGE, ON EVERY SURFACE THAT RENDERS A BODY --------
//
// Raised by the owner live on 2026-08-03, reading a note in the room: "the
// image is too big to read." Measured in the live page at her 1680x659: six
// images, natural width 1080, RENDERED width 1080, inside a #spread-scroll
// whose clientWidth is 622 — scrollWidth 1096, horizontal overflow, the
// picture running off the right edge of the book.
//
// The rule was not missing. `#blessing-card img, #reader-content img {
// max-width: 100% }` has been in tokens.css since 22-uat, with a comment
// saying in words that a full-resolution page "must scale to the card, never
// force sideways scrolling." It stopped APPLYING when 26.5 moved reading out
// of #reader-content and into the diegetic spread's #spread-content. The
// guarantee was never revoked; its caller moved and the selector did not.
//
// WHY THIS GATE, AND WHY IT IS NOT A GREP FOR '#spread-content img'. That
// grep is the vacuous kind this phase keeps catching: it passes the moment
// the string appears, says nothing about the OTHER five body surfaces, and
// goes stale the next time a surface is added. This gate reads the SAME
// SAVED_BODY_CONTAINERS roster the content fence answers to (K1 above) and
// requires the picture rule to cover every entry. Add a seventh reading
// surface and this fails until pictures fit there too — which is the only
// property worth asserting.
//
// Ask the three questions of it:
//   - can it pass BEFORE the work? No — it was RED on arrival, naming
//     #spread-content, .reveal-snap, .proposal-piece and .insight-piece.
//   - can it still pass AFTER the previous task? Yes — it is independent of
//     every other group and reads only tokens.css.
//   - does a degenerate implementation satisfy it? A rule with the selectors
//     but no max-width does not: the declaration block is checked too. A rule
//     that sets max-width to a length rather than 100% does not.
{
  const markerIdx = cssSrc.indexOf('PICTURES FIT THE PAGE');
  const commentEnd = cssSrc.indexOf('*/', markerIdx);
  const brace = cssSrc.indexOf('{', commentEnd);
  const close = cssSrc.indexOf('}', brace);
  if (markerIdx === -1 || commentEnd === -1 || brace === -1 || close === -1) {
    violations.push('[picture-fit] ' + CSS + ': the PICTURES FIT THE PAGE ' +
      'block could not be located — it is the rule that keeps a ' +
      'full-resolution screenshot inside the page it is rendered on, and ' +
      'this gate has nothing to check without it');
  } else {
    // the SELECTOR LIST only, never the comment (which names these
    // selectors in prose, and would satisfy a naive search on its own)
    const ruleList = cssSrc.slice(commentEnd + 2, brace);
    const ruleBody = cssSrc.slice(brace, close);
    const ruleLine = lineOf(cssSrc, markerIdx);
    SAVED_BODY_CONTAINERS.forEach(function (pair) {
      const escaped = (pair[0] + ' img').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|[\\s,])' + escaped + '($|[\\s,{])');
      if (!re.test(ruleList)) {
        violations.push('[picture-fit] ' + CSS + ':' + ruleLine +
          ' pictures are not made to fit on ' + pair[0] + ' (the body ' +
          'container for ' + pair[1] + ') — an image wider than that ' +
          'surface renders at its natural width and runs off the edge, ' +
          'which is what the owner met on 2026-08-03 in the diegetic ' +
          'spread. 22-uat already decided this: a picture scales to the ' +
          'card, always');
      }
    });
    if (!/max-width:\s*100%/.test(ruleBody)) {
      violations.push('[picture-fit] ' + CSS + ':' + ruleLine +
        ' the picture-fit rule does not set max-width: 100% — the selector ' +
        'list alone guarantees nothing, and a fixed length would clip or ' +
        'stretch instead of fitting');
    }
    if (!/height:\s*auto/.test(ruleBody)) {
      violations.push('[picture-fit] ' + CSS + ':' + ruleLine +
        ' the picture-fit rule does not set height: auto — without it a ' +
        'width-constrained image keeps its original height and distorts');
    }
    // 26.65-10: the HEIGHT bound. Width alone was the shipped guarantee and
    // it was enough only while image items were rare — 13,606 photographs
    // arrived on 2026-08-11 and a 4:3 phone picture rendered ~970px tall in a
    // ~1290px card, taller than the page, running into the decision bar.
    if (!/max-height:\s*var\(--picture-page-max-h\)/.test(ruleBody)) {
      violations.push('[picture-fit] ' + CSS + ':' + ruleLine +
        ' the picture-fit rule does not bound HEIGHT to ' +
        '--picture-page-max-h — a picture bounded only in width takes ' +
        'whatever height its aspect ratio forces and eats the page, which ' +
        'is what the owner met on 2026-08-11 with her first photo import');
    }
  }
}

// ---- K3b. AND THEY SIT IN THE MIDDLE OF IT ---------------------------------
//
// Owner, 2026-08-11, immediately after the height bound landed: "can you move
// the images in the middle?" A bounded picture no longer fills the width, so
// it was left flush left with the empty page beside it. K3 created that; the
// two are one change and are checked against the SAME roster.
//
// WHY THE CHILD COMBINATOR IS CHECKED AND NOT JUST THE CENTRING. `> img` means
// an item whose OWN content is a picture (renderBlessingCard, fillReaderInto —
// both write the img as a direct child). A descendant selector would also
// match a picture inside a note's prose, where display:block breaks the line
// it sits in. Dropping the `>` is a silent, plausible "simplification", which
// is exactly the kind this file exists to refuse.
{
  const midIdx = cssSrc.indexOf('PICTURES SIT IN THE MIDDLE');
  const midEnd = cssSrc.indexOf('*/', midIdx);
  const midBrace = cssSrc.indexOf('{', midEnd);
  const midClose = cssSrc.indexOf('}', midBrace);
  if (midIdx === -1 || midEnd === -1 || midBrace === -1) {
    violations.push('[picture-mid] ' + CSS + ': the PICTURES SIT IN THE ' +
      'MIDDLE block could not be located — it is what keeps a height-bounded ' +
      'picture from sitting flush left with the empty page beside it');
  } else {
    const midList = cssSrc.slice(midEnd + 2, midBrace);
    const midBody = cssSrc.slice(midBrace, midClose);
    const midLine = lineOf(cssSrc, midIdx);
    SAVED_BODY_CONTAINERS.forEach(function (pair) {
      const escaped = (pair[0] + ' > img').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp('(^|[\\s,])' + escaped + '($|[\\s,{])').test(midList)) {
        violations.push('[picture-mid] ' + CSS + ':' + midLine +
          ' pictures are not centred on ' + pair[0] + ' (the body container ' +
          'for ' + pair[1] + ') — it inherits the height bound from K3 and ' +
          'so inherits the flush-left gap the owner raised, with no rule ' +
          'here to close it');
      }
    });
    if (/(^|[\s,])[.#][\w-]+\s+img($|[\s,{])/.test(midList)) {
      violations.push('[picture-mid] ' + CSS + ':' + midLine +
        ' this rule matches a DESCENDANT img, not a direct child — that ' +
        'catches pictures inside a note\'s prose too, where display: block ' +
        'breaks the line the picture sits in. The `>` is the whole ' +
        'distinction between an item that IS a picture and a picture ' +
        'inside someone\'s writing');
    }
    if (!/display:\s*block/.test(midBody) ||
        !/margin-left:\s*auto/.test(midBody) ||
        !/margin-right:\s*auto/.test(midBody)) {
      violations.push('[picture-mid] ' + CSS + ':' + midLine +
        ' the centring rule needs display: block with margin-left and ' +
        'margin-right auto — an inline image ignores auto margins entirely, ' +
        'so the selector list alone centres nothing');
    }
  }
}

// ---- K4. PICTURES ZOOM ON CLICK, AND THE ZOOM MOVES NO GEOMETRY ------------
//
// Asked for by the owner live on 2026-08-03, in the same breath as the fit
// bug: "the app need to be able to scale the image so that the image can fit
// into the window, and then the user can click the image to zoom in or out."
//
// FOUR PROPERTIES, EACH OF WHICH CAN BREAK SILENTLY:
//
// 1. THE ZOOM LAYER IS FIXED TO THE VIEWPORT. This is the property that keeps
//    plan 20 beat 10 honest. Wave 18 measured #spread-scroll's clientHeight,
//    kFrame and kInterior at the owner's 1680x659, and beat 10 takes a verdict
//    on those numbers. An in-flow or absolutely-positioned zoom layer inside
//    the spread would change them the moment a picture opened, and the verdict
//    would be taken on geometry that no longer matched the measurement.
//
// 2. NO TRANSITION AND NO ANIMATION ON THE ZOOMED PICTURE. Law 4: "no
//    animations on the content itself." Scaling to fit is display fit — 22-uat
//    settled that in words — but a fade or a spring is decoration ON her file.
//    This is the property most likely to be "improved" back in by someone
//    making it feel nicer, which is exactly why it is a gate and not a comment.
//
// 3. THE CURSOR ROSTER AND THE WIRED ROSTER ARE THE SAME SET. app.js decides
//    what zooms (ZOOM_SURFACES); tokens.css decides what LOOKS like it zooms
//    (cursor: zoom-in). If they drift, a surface either lies about being
//    zoomable or hides that it is — the one-rule-two-callers shape this whole
//    arc exists to close, and the shape that produced F-1, F-5 and K3.
//
// 4. BOTH LISTENERS ARE CAPTURE PHASE. The spread carries pointer handlers and
//    the room's Escape branch pops the view stack (app.js). Bubble-phase
//    listeners would let a click reach a drag handler first, and would let
//    Escape close the NOTE out from under the zoomed picture instead of
//    closing the zoom. Losing `true` is a one-character regression with no
//    visible symptom until someone presses Escape.
//
// Ask the three questions of it: it cannot pass before the work (nothing it
// names existed); it is independent of every other group; and a degenerate
// implementation does not satisfy it — a layer with the right selectors but
// position:absolute fails 1, and a roster that lists a surface app.js does not
// wire fails 3.
{
  const zoomLine = lineOf(cssSrc, cssSrc.indexOf('PICTURES ZOOM ON CLICK'));

  // -- the app-side roster, read from the ZOOM_SURFACES array literal
  const rosterM = appSrc.match(/var\s+ZOOM_SURFACES\s*=\s*\[([^\]]*)\]/);
  let wired = null;
  if (!rosterM) {
    violations.push('[picture-zoom] ' + APP + ': ZOOM_SURFACES could not be ' +
      'located — it is the single roster that decides which reading ' +
      'surfaces zoom, and this gate cannot compare rosters without it');
  } else {
    // Entries are EXPRESSIONS, not literals — `'#' + SPREAD_IDS.content` —
    // because test_diegetic_wiring.cjs permits exactly one occurrence of a
    // reader's content id in app.js. So the gate resolves them the same way
    // the app does: by reading the id maps. A literal is taken as itself; a
    // '#' + MAP.key form is looked up in that map. Anything else is refused
    // rather than silently skipped, so a future entry this gate cannot
    // resolve fails loudly instead of dropping out of the comparison.
    function idFromMap(mapName, key) {
      const m = appSrc.match(new RegExp('var\\s+' + mapName + '\\s*=\\s*\\{([\\s\\S]*?)\\}'));
      if (!m) { return null; }
      const kv = m[1].match(new RegExp('(^|[\\s,])' + key + '\\s*:\\s*\'([^\']+)\''));
      return kv ? kv[2] : null;
    }
    wired = rosterM[1].split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(function (expr) {
        const lit = expr.match(/^'([^']+)'$/);
        if (lit) { return lit[1]; }
        const built = expr.match(/^'#'\s*\+\s*([A-Z_]+)\.([a-zA-Z]+)$/);
        if (built) {
          const id = idFromMap(built[1], built[2]);
          if (id) { return '#' + id; }
          violations.push('[picture-zoom] ' + APP + ': ZOOM_SURFACES entry ' +
            expr + ' names ' + built[1] + '.' + built[2] + ', which this ' +
            'gate could not resolve from the id maps — the roster and the ' +
            'cursor rule cannot be compared, so neither is being checked');
          return null;
        }
        violations.push('[picture-zoom] ' + APP + ': ZOOM_SURFACES entry ' +
          expr + ' is neither a selector literal nor a \'#\' + MAP.key ' +
          'lookup — this gate cannot resolve it, and an unresolvable entry ' +
          'would silently drop out of the roster comparison');
        return null;
      })
      .filter(Boolean);
    // the doors stay doors: a surface whose CARD is the click target must
    // never be wired for zoom, or the zoom eats the door
    ['.insight-piece', '.proposal-piece'].forEach(function (door) {
      if (wired.indexOf(door) !== -1) {
        violations.push('[picture-zoom] ' + APP + ': ZOOM_SURFACES wires ' +
          door + ', but that card is itself a door (openInsightItem) — ' +
          'zooming on the image would swallow the click that opens the ' +
          'item, which trades a working door for an enlargeable picture');
      }
    });
  }

  // -- the css-side roster, read from the cursor: zoom-in rule's selectors
  const curIdx = cssSrc.indexOf('cursor: zoom-in');
  if (curIdx === -1) {
    violations.push('[picture-zoom] ' + CSS + ': no `cursor: zoom-in` rule — ' +
      'a picture that zooms with no affordance is a feature nobody finds');
  } else if (wired) {
    const openBrace = cssSrc.lastIndexOf('{', curIdx);
    const prevClose = cssSrc.lastIndexOf('}', openBrace);
    // strip comments: the rule is introduced by a comment that NAMES
    // ZOOM_SURFACES in prose, and a naive slice would read that prose as
    // selectors — the same trap K1 documents for the content fence
    const selectorList = stripComments(cssSrc.slice(prevClose + 1, openBrace));
    wired.forEach(function (sel) {
      const escaped = (sel + ' img').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp('(^|[\\s,])' + escaped + '($|[\\s,{])').test(selectorList)) {
        violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
          ' app.js wires ' + sel + ' for zoom but the `cursor: zoom-in` ' +
          'rule does not cover ' + sel + ' img — the surface zooms and ' +
          'gives no sign that it does');
      }
    });
    const cssSels = selectorList.split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return /\simg$/.test(s); })
      .map(function (s) { return s.replace(/\s+img$/, ''); });
    cssSels.forEach(function (sel) {
      if (wired.indexOf(sel) === -1) {
        violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
          ' the `cursor: zoom-in` rule promises ' + sel + ' zooms, but ' +
          'ZOOM_SURFACES in ' + APP + ' does not wire it — the surface ' +
          'lies about being zoomable');
      }
    });
  }

  // -- the layer is fixed, and carries no motion on the picture
  const layerIdx = cssSrc.indexOf('#picture-zoom {');
  if (layerIdx === -1) {
    violations.push('[picture-zoom] ' + CSS + ': no #picture-zoom layer rule');
  } else {
    const layerBody = cssSrc.slice(layerIdx, cssSrc.indexOf('}', layerIdx));
    if (!/position:\s*fixed/.test(layerBody)) {
      violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
        ' the zoom layer is not position: fixed — anything else puts it in ' +
        'the spread\'s own layout, which moves #spread-scroll\'s height and ' +
        'silently invalidates the geometry plan 20 beat 10 takes a verdict on');
    }
  }
  const imgIdx = cssSrc.indexOf('#picture-zoom img {');
  if (imgIdx === -1) {
    violations.push('[picture-zoom] ' + CSS + ': no #picture-zoom img rule');
  } else {
    const zImg = stripComments(cssSrc.slice(imgIdx, cssSrc.indexOf('}', imgIdx)));
    // MOTION MUST BE SWITCHED OFF, NOT MERELY UNDECLARED. The first draft of
    // this gate banned the PROPERTY, and passed while the computed style read
    // `transition-property: all` inherited from elsewhere in the sheet — safe
    // only because that rule's duration happened to be 0s. Absence of a
    // declaration says nothing about the cascade; `none` does.
    ['transition', 'animation'].forEach(function (prop) {
      const m = zImg.match(new RegExp('(^|[\\s;{])' + prop + '\\s*:([^;]*);'));
      if (!m) {
        violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
          ' the zoomed picture does not set ' + prop + ': none — law 4 is ' +
          '"no animations on the content itself" and the picture IS her ' +
          'content, so the motion has to be switched OFF here rather than ' +
          'left to whatever the rest of the sheet happens to cascade');
      } else if (m[2].trim() !== 'none') {
        violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
          ' the zoomed picture sets ' + prop + ':' + m[2] + ' — law 4 ' +
          'refuses motion on her content; scaling is display fit, a fade ' +
          'is decoration');
      }
    });
    // ZOOM MEANS BIGGER — ⚠ AMENDED 2026-08-11 ON THE OWNER'S RULING. The
    // PROPERTY is unchanged and still gated; what changed is which mechanism
    // guarantees it, and the old mechanism's premise is what expired.
    //
    // ORIGINAL (2026-08-03): a bound here was FORBIDDEN. Measured live —
    // bounded to the layer, the in-page picture rendered at 590px and the
    // "zoomed" one at 489px, because the page is wider than the window is
    // tall. That measurement rested entirely on the IN-PAGE picture being
    // 590px tall, which was true only while a page picture had no height
    // bound at all.
    //
    // 26.65-10 gave page pictures one (--picture-page-max-h, 395px on her
    // 1680x659), so a window-fitted pop-up is now strictly LARGER than the
    // page. Her ruling: "fit the whole pop up window but gives the feature to
    // user zoom in and out a image" — and it is her SECOND ask for it; this
    // gate's own header records the same request on 2026-08-03, delivered as
    // fit-to-CARD plus open-and-close.
    //
    // SO THE GATE NOW ASSERTS BOTH HALVES, because either alone is a
    // regression: fitted-open WITHOUT a control that exceeds it is the 489px
    // bug returning, and a control WITHOUT the page bound is the old
    // inversion. THE TWO RULES ARE PINNED TOGETHER HERE ON PURPOSE — this is
    // the only place that knows they depend on each other.
    if (!/max-width:\s*100%/.test(zImg) || !/max-height:\s*100%/.test(zImg)) {
      violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
        ' the zoomed picture does not open FITTED to the layer — the owner ' +
        'ruled 2026-08-11 that the pop-up shows the whole picture and + / - ' +
        'drive it from there. Without the fit she meets a picture cropped ' +
        'by the window on open, which is what she raised');
    }
    // the page bound this fit DEPENDS on: without it, fitted-open is smaller
    // than the page and 2026-08-03's 489-vs-590 inversion is back
    if (!/--picture-page-max-h\s*:/.test(cssSrc) ||
        !/max-height:\s*var\(--picture-page-max-h\)/.test(cssSrc)) {
      violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
        ' the zoomed picture opens fitted, but page pictures are no longer ' +
        'bounded by --picture-page-max-h — those two rules only work ' +
        'together. Unbound the page and the "zoom" renders SMALLER than the ' +
        'page did (measured 489px vs 590px, 2026-08-03), which is the exact ' +
        'bug the original form of this gate existed to prevent');
    }
    // ZOOM MEANS BIGGER, mechanically: a control must be able to exceed fit
    {
      const stepsM = appSrc.match(/var\s+ZOOM_STEPS\s*=\s*\[([^\]]*)\]/);
      if (!stepsM) {
        violations.push('[picture-zoom] ' + APP + ': ZOOM_STEPS could not be ' +
          'located — the pop-up now opens fitted, so the ONLY thing making ' +
          'zoom mean bigger is the step roster, and this gate cannot ' +
          'confirm it exists');
      } else {
        const steps = stepsM[1].split(',').map(Number).filter(function (n) {
          return !isNaN(n);
        });
        if (!steps.some(function (n) { return n > 1; })) {
          violations.push('[picture-zoom] ' + APP + ': no ZOOM_STEPS entry ' +
            'exceeds 1 (natural size) — every step at or below natural size ' +
            'means the "+" button can never show her MORE of the picture ' +
            'than the file itself holds, and a zoom that cannot magnify is ' +
            'not a zoom');
        }
      }
      ['picture-zoom-in', 'picture-zoom-out', 'picture-zoom-fit']
        .forEach(function (id) {
          if (appSrc.indexOf(id) === -1) {
            violations.push('[picture-zoom] ' + APP + ': the ' + id +
              ' control is absent — she ruled for VISIBLE labelled buttons ' +
              'over a scroll-only gesture, because F-6 was a control she ' +
              'could not find at all. A zoom nobody can see is that bug');
          }
        });
    }
    const layerBody2 = cssSrc.slice(layerIdx, cssSrc.indexOf('}', layerIdx));
    if (!/overflow:\s*auto/.test(layerBody2)) {
      violations.push('[picture-zoom] ' + CSS + ':' + zoomLine +
        ' the zoom layer does not scroll — a picture opened at natural ' +
        'size that is larger than the window would have no way to reach ' +
        'the part of it that is off screen');
    }
  }

  // -- both listeners capture-phase.
  // Anchored on a token unique to each handler's BODY, then read forward to
  // that registration's own closing `}, <flag>);`. Matching the whole handler
  // with one regex was the first draft and it was brittle enough to report a
  // false red on correct code — the anchor-then-scan form is checked against
  // the handler it actually names.
  // Scans forward from the anchor for the FIRST listener terminator — either
  // `}, true);` / `}, false);` (a flag was passed) or a bare `});` (none was,
  // which is bubble phase). Draft two looked for `});` alone and ran straight
  // past a capture-phase registration, because `}, true);` does not contain
  // it — a false red on correct code, caught by running it.
  function captureFlag(anchor) {
    const at = appSrc.indexOf(anchor);
    if (at === -1) { return null; }
    const m = appSrc.slice(at, at + 1200)
      .match(/\}\s*,\s*(true|false)\s*\)\s*;|\}\s*\)\s*;/);
    if (!m) { return null; }
    return m[1] || 'false';
  }
  if (captureFlag('var img = zoomableImage(e.target);') !== 'true') {
    violations.push('[picture-zoom] ' + APP + ': the zoom click listener is ' +
      'not registered in the CAPTURE phase — the spread carries its own ' +
      'pointer handlers, and a bubble-phase listener lets them consume the ' +
      'click before the picture ever opens');
  }
  if (captureFlag("if (e.key !== 'Escape' || !zoomOpen())") !== 'true') {
    violations.push('[picture-zoom] ' + APP + ': the zoom Escape listener is ' +
      'not registered in the CAPTURE phase — the room\'s own Escape branch ' +
      'pops the view stack, so a bubble-phase listener would close the NOTE ' +
      'out from under the zoomed picture instead of closing the zoom');
  }
}

// ---- L. THE HASHTAG CARVE-OUT'S SEAM (26.88 code review CR-02 / WR-01) ------
//
// The carve-out shipped inside `StudyCore.cleanVaultMarkup`, and three
// findings followed from that one placement: nothing on the render path ever
// asked its guard, "show as saved" stopped restoring the `#`, and on the 17
// notes the reformatter declines the toggle was not even rendered. This group
// pins the seam it moved to, in the four directions that would un-fix any of
// the three.
{
  // (i) core.js no longer carves inside the comparison seam. `bodyGuards`
  //     puts BOTH sides through `cleanVaultMarkup`, and `marked` receives its
  //     output — a carve-out there is downstream of every guard by
  //     construction, which is the defect.
  const clean = functionBody(coreSrc, CORE, 'cleanVaultMarkup', 'carve-out');
  absent(clean, 'stripHashtagMarkers(', 'carve-out', CORE,
    'cleanVaultMarkup carves again. That seam runs AFTER bodyGuards, AFTER ' +
    "every one of renderSavedBody's early returns and AFTER the toggle, so " +
    'a carve-out there has no guard and no off switch. It belongs in ' +
    'renderSavedBody');

  if (carveOutWrapper) {
    // (ii) the toggle is honoured, and it is honoured BEFORE the strip. The
    //      order is the assertion: a SHOW_AS_SAVED check placed after the
    //      strip would read as an opt-out and do nothing.
    const shown = carveOutWrapper.text.indexOf('SHOW_AS_SAVED[id]');
    const strip = carveOutWrapper.text.indexOf('stripHashtagMarkers(');
    if (shown === -1 || strip === -1 || shown > strip) {
      violations.push('[carve-out] ' + APP + ':' + carveOutWrapper.line +
        ' renderSavedBody does not return early on SHOW_AS_SAVED[id] ' +
        'BEFORE it calls stripHashtagMarkers. "The honest escape... you can ' +
        'always see what you saved" is this phase\'s whole resolution of ' +
        'law 4, and an escape that does not escape one of the edits is ' +
        'worse than no escape');
    }
    // (iii) the guard the F-6b commit message claimed was load-bearing is
    //       actually consulted, and its failure action is the shipped idiom:
    //       one console warning, the un-carved text back, nothing in the UI.
    if (!/StudyCore\.wordsPreserved\s*\(/.test(carveOutWrapper.text)) {
      violations.push('[carve-out] ' + APP + ':' + carveOutWrapper.line +
        ' the carve-out is not guarded. `stripHashtagMarkers` DOES emit ' +
        'output wordsPreserved rejects — `mood #sad#tired` -> ' +
        '`mood sadtired` — and every other transform in this module that ' +
        'fails that check falls the note back. This one used to render it');
    }
    if (joinConcats(carveOutWrapper.text).indexOf(CARVE_WARNING) === -1) {
      violations.push('[carve-out] ' + APP + ':' + carveOutWrapper.line +
        ' the carve-out guard does not carry its own console warning ' +
        JSON.stringify(CARVE_WARNING) + ' — a console reader has to be able ' +
        'to tell which of the three guards fired without opening the file');
    }
    // (iv) the UI stays silent on a trip, exactly as the other two guards do,
    //      and the wrapper is still synchronous by construction (group E's
    //      question, re-asked of the function that now sits above the ladder).
    ['innerHTML', 'classList', 'textContent', 'alert(']
      .forEach(function (token) {
        absent(carveOutWrapper, token, 'carve-out', APP,
          'the carve-out guard must fail SILENTLY in the UI. A visible ' +
          'fallback marker is decoration on a reading surface (law 4) and ' +
          'was rejected outright for the other two guards');
      });
    ASYNC_TOKENS.forEach(function (token) {
      absent(carveOutWrapper, token, 'carve-out', APP,
        'the carve-out wrapper now sits above the ladder and must be ' +
        'synchronous by construction too — with no asynchronous boundary ' +
        'there is no state at which a spinner could be rendered into a note ' +
        'body (SC-3, D-02)');
    });
  }
}

// ---- verdict ----------------------------------------------------------------

if (violations.length) {
  console.error('test_reformat_wiring FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_reformat_wiring OK — groups A/B/C/D/E/F/G/H/I/J/K/L — ' +
  negativeAssertions + ' negative assertions routed through stripComments');
process.exit(0);
