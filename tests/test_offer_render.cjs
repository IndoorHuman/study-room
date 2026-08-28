'use strict';
/* =========================================================================
   tests/test_offer_render.cjs — 26.95-35 Task 1.

   THE FIVE HELD-OUT UI-STATE CHECKS, PLUS G-3c, G-3e, G-7 AND G-10,
   READ AS COMPUTED STYLES OFF A LIVE PAGE.

   WHY THIS FILE EXISTS. `26.95-UI-SPEC.md` resolves fifteen UI
   considerations as covered and FIVE as backstop — held-out tests the
   executor must be able to fail. Four of the five cannot be seen by a
   source grep at all: a `flex-wrap` declared BY ID does not reach a new
   element, a truncation only exists at a width, a residue is a node that
   is still there afterwards, and a transition is a computed value. The
   `--wood` lesson is the shipped precedent — a token reference with no
   definition passed every grep and rendered an empty box.

   HOW IT MEASURES. The shipped `tests/lib/render-harness.cjs` writes a page
   that inlines the LITERAL BYTES of `tokens.css` and base64-inlines the
   vendored pixel font; `tests/lib/cdp.cjs` drives the system Chrome over
   the DevTools protocol using only Node built-ins. Neither is re-typed
   here. The markup is the SHIPPED spread chassis, lifted verbatim out of
   `index.html`, and the page is painted by the SHIPPED Offer renderers,
   lifted verbatim out of `app.js`. Nothing about the room's own rules is
   restated in this file — a harness that restated the rule it is checking
   would be the harness agreeing with itself.

   ⚠ NOTHING HERE READS OR WRITES THE OWNER'S LIBRARY, AND NOTHING HERE CAN
   REACH A NETWORK. The only files read are `app.js`, `core.js`,
   `index.html`, plus whatever the two shipped helpers read (`tokens.css`
   and the vendored font), all resolved relative to this file. The only
   files written live in a fresh `os.tmpdir()` tree that is removed on BOTH
   the pass and the fail path. `window.fetch` is replaced on the harness
   page by a function that RECORDS AND THROWS, so no code path on that page
   can issue a request even by accident; the suite asserts the recorder
   stayed empty. That replacement lives on a throwaway page in a headless
   browser and never on any page a person is using.

   ⚠ A MISSING RUNNER IS A FAILURE, NEVER A SILENT PASS. The launch is
   deliberately OUTSIDE the case runner, so an unavailable browser
   propagates and this file exits NON-ZERO with the binary path in the
   message — it does not stop checking.

   ⚠ EVERY SOURCE SCAN IN THIS FILE RUNS OVER COMMENT-STRIPPED TEXT, AND IT
   IS SAID HERE BECAUSE IT HAS BEEN GOT WRONG NINE TIMES ON THIS PHASE. The
   Offer's own comments in `app.js` explain at length why there is no reason
   line, why the caption may not wear the exclusion row's look, and why the
   guard cannot hide itself — prose that names the very shapes the negative
   scans below forbid. `stripComments` is string-aware and removes block
   comments and line comments wherever they sit, including at the end of a
   line of code.

   ---------------------------------------------------------------------
   THE FIVE ANTI-VACUITY QUESTIONS, ANSWERED IN THE REGISTER
   `tests/test_live_render.cjs` USES.
   ---------------------------------------------------------------------

   1. CAN IT PASS BEFORE THE WORK? No. Every live case paints through the
      shipped `paintOfferPage` and reads a computed style or a node count
      off the result. Before 26.95-30 there was no `paintOfferPage`, no
      `#offer-caption` rule and no `.offer-answers` rule, so the lift fails
      at boot and `boot` reports it by name.

   2. CAN IT PASS AFTER THE WORK IS DELIBERATELY BROKEN? No, and it is not
      claimed on trust: four cases carry a MUTATION CONTROL that re-measures
      the same probe against a deliberately broken copy — `flex-wrap` forced
      to `nowrap` on a clone, the focus rule deleted from the live
      stylesheet, the shipped `#spread-title` (which really does truncate)
      measured by the same three properties as the caption, and G-6's own
      claim fed an accent planted in a RULE and an accent planted in a
      COMMENT with only the first required to be reported. Each control
      asserts the probe REPORTS the difference. A probe that cannot see its
      own opposite is not measuring anything.

   3. DOES A DEGENERATE IMPLEMENTATION SATISFY IT? No. Node counts are
      pinned BY VALUE and asserted BEFORE any text is read; every lifted
      region is proven real (present, beginning at its own declaration,
      more than one line) before any negative scan reads it; the replaced
      collaborators are pinned as a roster BY VALUE and the driven ones are
      each asserted to have RECORDED a call, so none of them is decoration;
      and the harness's own style overrides are pinned as a roster and
      asserted DISJOINT from the roster of properties under measurement, so
      the harness cannot be what makes a case pass.

   4. IS IT EVALUATION ORDER OR SOURCE ORDER? Evaluation order, for
      everything that matters. The wrap, the truncation, the residue, the
      motion and the focus ring are all read back off a rendered page after
      the shipped code ran. Four cases are deliberately SOURCE order and say
      so in their own names and messages — the reason-line, chip, place and
      accent screens are region-scoped text scans, because those claims are
      about what the renderer may contain rather than about what a browser
      computes.

   5. DOES IT MATCH THE FIX'S OWN COMMENT? Yes, and the match is asserted
      rather than assumed. `tokens.css`'s own 26.95-30 block says the answer
      row gets its own wrap "because the shipped one does not reach it", and
      `harness-seam-pins` re-reads the two `app.js` statements this file's
      harness stands in for, so the seam is a pinned fact rather than a
      convenience.

   ---------------------------------------------------------------------
   WHAT THIS SUITE FOUND ON ITS FIRST REAL RUN — BOTH RECORDED, BECAUSE ONE
   WAS A DEFECT IN THE ROOM AND THE OTHER WAS A DEFECT IN THIS FILE
   ---------------------------------------------------------------------

   `g10-quiet-link-focus-ring` measured the `not relevant` control's
   `:focus-visible` outline and read `rgb(0, 95, 204)` — the browser's own
   ring — where the contract asks for `--ink`. `tokens.css` declared
   `.offer-answers .btn:focus-visible`, and the quiet link is deliberately
   NOT in the `.btn` register, because that is what makes it quiet; so the
   rule reached past it. A control the room made quiet had also been made
   hard to find with a keyboard. **The gate was written to UI-SPEC G-10
   rather than to the tree, which is the only reason it found this** — a gate
   written to match current behaviour would have passed forever. Repaired in
   `tokens.css` by one ADDITIVE rule beside the shipped one, same two values,
   no new token and no new colour.

   `g6-no-accent` went red on `tokens.css`'s own sentence declaring that
   nothing in that block touches the accent — and then went red AGAIN, on the
   same prose, after a repair that stripped comments correctly but sliced the
   region out by its COMMENT HEADER: that index lands inside a `/* … *­/`, so
   the slice began mid-comment and the stripper scanned for an opener it could
   never see. Both failures were in this file. The room was right both times.

   THE LESSON IS NOT "STRIP HARDER", IT IS **ANCHOR ON CODE**. The JavaScript
   half of this file never had the bug, because `extractFn` anchors on
   `function NAME(`. The CSS half now anchors on SELECTORS: the sheet is
   stripped WHOLE, from byte zero where a stripper is always correct, and each
   Offer rule is found by its own selector, so a comment is not merely removed
   but structurally out of scope. That deleted more scaffolding than it added
   — the comment anchors, the sub-slice strip, the size assertion and the
   two-sided prose control all went with it, and the degenerate guard is now
   intrinsic (a rule that cannot be found IS a violation).

   Prints its case count and its case-name roster by value, then one OK
   line, and exits 0 only when every case passed.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(__dirname, 'lib', 'cdp.cjs'));
const renderHarness = require(path.join(__dirname, 'lib', 'render-harness.cjs'));

const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const tokensSrc = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');

/* The comment-free stylesheet, computed ONCE (stripCssComments is a hoisted
   declaration). Every CSS scan below reads this and never `tokensSrc` — see
   the note above stripComments. The case `comment-strip-is-real` proves
   this text is neither raw nor blank, with a plant that must be caught. */
const tokensClean = stripCssComments(tokensSrc);

/* ⚠ NO INDENT IS HARD-CODED ANYWHERE IN THIS FILE. app.js is one IIFE, so
   everything inside it sits at a module indent — and plan 26.95-30 shipped a
   region slicer that spelled that indent three separate times, drifted by two
   characters, and silently threw three scans before they ever ran. Both
   lifters below anchor on the SYMBOL and step over whatever whitespace
   precedes it, so there is no indent for a later re-format to break. */

/* THE TOKEN VALUES, RESOLVED ONCE, AND DERIVED FROM THE SHEET RATHER THAN
   TYPED. A hard-typed rgb() here would be this file's opinion about
   --ink; read out of tokens.css it is the sheet's. ⚠ Read out of the
   COMMENT-STRIPPED sheet, so a token named in a comment can never become
   this file's idea of a colour. */
function tokenRgb(name) {
  const re = new RegExp('--' + name + ':\\s*#([0-9a-fA-F]{6})');
  const m = re.exec(tokensClean);
  assert.ok(m, 'tokens.css must declare --' + name + ' as a six-digit hex');
  const h = m[1];
  return 'rgb(' + parseInt(h.slice(0, 2), 16) + ', ' +
    parseInt(h.slice(2, 4), 16) + ', ' + parseInt(h.slice(4, 6), 16) + ')';
}

// ---------------------------------------------------------------------------
// SOURCE SURGERY — a string-aware scanner, used for every lift and every strip
// ---------------------------------------------------------------------------

/* Walk forward from `from`, honouring string literals and comments, and
   return the index just past the `;` that closes the statement at depth
   zero. Returns -1 when there is none. A naive indexOf(';') would stop
   inside `"done — this one won't come round again."` the day a copy
   candidate gains one. */
function endOfStatement(src, from) {
  let i = from;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close === -1) { return -1; }
      i = close + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
    if (c === ';' && depth === 0) { return i + 1; }
    i++;
  }
  return -1;
}

/* ⚠ EVERY SCAN IN THIS FILE READS STRIPPED TEXT, AND THIS IS THE TENTH TIME
   THIS PHASE HAS PAID FOR THAT LESSON — the ninth landed inside a gate
   written after the warning, and the tenth landed inside THIS ONE. `g6`
   scanned the shipped stylesheet for `--accent` and went red on
   `tokens.css`'s own sentence *declaring* that nothing there touches it. A
   scan over prose cannot tell a ban from an instance, and the fix is never
   to soften the ban — it is to stop reading the explanation.

   TWO STRIPPERS, BECAUSE THE TWO LANGUAGES DIFFER. JavaScript has line
   comments and template literals; CSS has neither, and a CSS stripper that
   removed `//` would eat the middle of a `url(https://…)`.

   ⚠ A STRIPPER IS ONLY AS GOOD AS ITS PARSER, so `stripComments` REFUSES
   text it could not read safely rather than guessing: an unbalanced template
   literal would make the scanner run past a real comment and emit it — the
   same false red, one layer down.

   ⚠⚠ THE REFUSAL IS TESTED ON THE OUTPUT, NOT THE INPUT, AND THE FIRST DRAFT
   HAD IT THE OTHER WAY ROUND. Guarding the input refuses a backtick ANYWHERE,
   including inside a line comment — and `renderOfferAnswerRow` has exactly
   that: its body explains the quiet-link recipe and quotes `font: inherit` in
   prose. That draft would have thrown on five cases at once, over a comment
   the scanner consumes correctly BEFORE its string logic ever sees it. Which
   is to say the blunt version of this guard reproduced, one more time, the
   very mistake the guard exists to prevent: reading an explanation as an
   instance. A backtick surviving the strip is in CODE, and that is the only
   one worth refusing. */
function stripComments(src, label) {
  const out = stripJs(String(src));
  assert.strictEqual(out.indexOf('`'), -1,
    'stripComments REFUSES ' + (label || 'this region') + ': a template ' +
    'literal SURVIVED the strip, so it is in code rather than in prose and ' +
    'this scanner cannot promise it read the region correctly. A stripper ' +
    'that guessed would emit a comment it should have removed, which is the ' +
    'defect it exists to prevent. Narrow the region or teach the parser — ' +
    'do not scan it raw');
  return out;
}

function stripJs(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      const close = src.indexOf('*/', i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < src.length) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1] || ''; i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* THE CSS STRIPPER. Block comments only, string-aware. CSS has no line
   comment, and treating `//` as one would cut a `url(https://…)` in half. */
function stripCssComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      out += c;
      i++;
      while (i < src.length) {
        out += src[i];
        if (src[i] === '\\') { out += src[i + 1] || ''; i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* Lift a top-level `function name(...) { ... }` verbatim by brace-matching.
   The same shape `tests/test_display_fence.cjs` uses. It is restated here
   rather than imported because that file is a SUITE, not a library, and the
   node sweep glob is `tests/*.cjs` — a suite that required another suite
   would run it twice and count it once. */
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
  assert.strictEqual(depth, 0, name + "'s braces must balance");
  return src.slice(start, i);
}

/* Lift a `var|const|let NAME = …;` declaration verbatim.

   ⚠ THE ANCHOR IS ASSERTED UNIQUE RATHER THAN NARROWED TO ONE INDENT. A
   narrow anchor breaks on a re-indent and a wide one can pick up the wrong
   symbol; asserting the declaration occurs EXACTLY ONCE in the file removes
   both failures at the same time, and a second declaration of a module
   constant is a finding in its own right. The lift is a whole-line match,
   so a same-named property or local inside an expression cannot be it. */
function extractDecl(src, name) {
  const re = new RegExp('^[ \\t]*(?:var|const|let)[ \\t]+' + name +
    '[ \\t]*=[ \\t]', 'gm');
  const found = [];
  let m;
  while ((m = re.exec(src)) !== null) { found.push(m.index); }
  assert.strictEqual(found.length, 1,
    'app.js must declare `' + name + '` exactly ONCE at module level — this ' +
    'lift takes the shipped declaration verbatim, and it found ' +
    found.length + ' of them. Zero means the symbol moved or was renamed ' +
    '(re-decide the lift, do not widen it); two means the constant has a ' +
    'second spelling, which is a finding rather than a harness problem');
  // step past the leading indent so the region begins at its own keyword.
  const from = found[0] + /^[ \t]*/.exec(src.slice(found[0]))[0].length;
  const end = endOfStatement(src, from);
  assert.notStrictEqual(end, -1,
    'the declaration of ' + name + ' must close with a semicolon');
  return src.slice(from, end);
}

/* REGION REALITY, ASSERTED BEFORE ANYTHING NEGATIVE IS READ OVER IT. A
   negative scan over an empty string, a sliver, or a region that begins
   somewhere other than its own declaration is the purest form of this
   project's named defect class, and it has landed on this phase more than
   once. */
function region(name) {
  const body = extractFn(appSrc, name);
  const lines = body.split('\n').length;
  assert.ok(body.length > 120 && lines > 3,
    'the lifted ' + name + ' region must be substantial (' + body.length +
    ' chars, ' + lines + ' lines) — a negative scan over a sliver proves ' +
    'nothing at all');
  assert.strictEqual(body.indexOf('function ' + name + '('), 0,
    'the lifted region must BEGIN at ' + name + "'s own declaration; it " +
    'begins "' + body.slice(0, 24) + '"');
  return body;
}

function declRegion(name) {
  const text = extractDecl(appSrc, name);
  assert.strictEqual(
    /^(?:var|const|let)[ \t]+/.test(text) &&
      text.slice(0, 40).indexOf(name) !== -1, true,
    'the lifted declaration must BEGIN at ' + name + "'s own keyword; it " +
    'begins "' + text.slice(0, 32) + '"');
  assert.strictEqual(text[text.length - 1], ';',
    'the lifted declaration of ' + name + ' must end at its semicolon');
  return text;
}

function hits(src, re) { return (src.match(re) || []).length; }

/* THE FOUR RULES THE OFFER OWNS, BY SELECTOR. This roster IS the region:
   G-6's claim is about these declarations and about nothing else. */
const OFFER_RULES = ['#offer-caption', '.offer-answers',
  '.offer-answers .btn:focus-visible',
  '.offer-answers .offer-notrel:focus-visible',
  /* 26.95-44 (UAT F-12): the row is seated in the ribbon now, and it brought
     two rules with it. They join the ROSTER rather than sitting outside it —
     the comment above says this roster IS the region, so a rule the Offer
     owns and the roster does not name would be a hole in G-6's claim rather
     than a rule exempt from it. */
  '#spread-ribbon .offer-answers',
  '#spread-ribbon .offer-answers .offer-answer-note'];

/* G-6'S CLAIM, AS A FUNCTION OVER SOURCE TEXT — the `costLineDrill` shape
   `tests/test_display_fence.cjs` already uses, so the SAME function can be
   fed a deliberately broken copy and asked to name the violation it
   re-introduced.

   ⚠⚠ THIS IS THE SECOND SHAPE, AND THE FIRST ONE'S FAILURE IS THE WHOLE
   REASON TO READ THIS COMMENT. The first version sliced the Offer's block
   out of `tokens.css` BY ITS COMMENT HEADER — `indexOf("26.95-30 — THE
   OFFER'S PAGE")` — and then stripped the slice. That index lands INSIDE a
   `/* … *­/`, so the slice began mid-comment and the stripper scanned
   forward for an opener it could never see: the entire header survived, its
   own sentence declaring that nothing there touches the accent was counted
   as a violation, and a token planted into that prose was reported as a
   defect. Every guard added on top of that was scaffolding around a problem
   the anchor had created.

   THE REPAIR IS TO ANCHOR ON CODE, NOT ON PROSE — which is exactly why the
   JavaScript half of this file never had the bug: `extractFn` anchors on
   `function NAME(`. So the sheet is stripped WHOLE, from byte zero, where a
   stripper is always correct; then each rule is found BY ITS SELECTOR and
   only its declaration block is read. A comment is now not merely stripped
   but structurally out of scope, and there is exactly ONE strip site.

   IT CARRIES ITS OWN DEGENERATE GUARD, and it is no longer a bolted-on
   layer: a rule that cannot be found IS a violation, so a blanked or
   mis-parsed sheet reports itself instead of returning a comfortable zero. */
function offerRuleViolations(cssSource) {
  const clean = stripCssComments(cssSource);
  const out = [];
  OFFER_RULES.forEach(function (sel) {
    const at = clean.indexOf('\n' + sel + ' {');
    if (at === -1) {
      out.push('the Offer rule `' + sel + '` is not in the stripped sheet — ' +
        'a scan that cannot find its subject measures nothing');
      return;
    }
    const close = clean.indexOf('}', at);
    if (close === -1) {
      out.push('the Offer rule `' + sel + '` never closes');
      return;
    }
    const body = clean.slice(at, close + 1);
    const n = hits(body, /--accent/g);
    if (n > 0) {
      out.push(sel + ' names --accent ' + n + ' time(s)');
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// WHAT IS LIFTED, WHAT IS REPLACED, AND WHAT IS OVERRIDDEN — three rosters,
// each pinned BY VALUE, because "the harness provides whatever today's slice
// happens to touch" is exactly the drift that made a shipped scope stub go
// green while the room threw.
// ---------------------------------------------------------------------------

/* Every one of these is the SHIPPED function, lifted verbatim. Nothing in
   this list is re-typed, approximated or simplified. */
const LIFT_FNS = [
  '$',
  'escapeHtml',
  'escapeAttr',
  'offerCaptionPhrase',
  'packOfferPage',
  'renderOfferCaption',
  'renderOfferAnswerRow',
  /* 26.95-44 (F-12): the ONE spelling of where the answer row is seated. It
     is LIFTED rather than replaced because the seat is the finding — a
     harness that supplied its own would be choosing the answer to the
     question this file now asks. */
  'offerRowSeat',
  'offerRowEl',
  'offerCurrentSlot',
  'reachAnswering',
  'reachAllAnswered',
  'reachAfterAnswer',
  'reachRepaint',
  'reachEndIfDone',
  'markDoorSpent',
  'reachResolveAnswer',
  'reachResolveRow',
  // 26.95-57/58: the set-aside beat she ruled, and the caption's year span.
  // Lifted, never stubbed — this phase already paid for a stand-in that
  // hardcoded the one fact that was wrong.
  'reachAsideSaid',
  'reachAsideUndo',
  'showAsideUndoRetry',
  'offerCaptionYears',
  // 26.95-61: paintOfferPage now asks for the pad directly, so the harness has
  // to provide the real one. ⚠ It is lifted, not stubbed — but note that this
  // harness flattens #spread-scroll to height:auto/overflow:visible, so what it
  // proves here is only that the call resolves; the PADDING itself was measured
  // by a rig against the real chassis and is pinned statically in
  // test_surface_wiring section 16.
  'fitSpreadRibbonPad',
  'postNotRelevant',
  'showNotRelevantRetry',
  'paintOfferPage',
  'openOfferPage',
  'reachLoadMemory',
  'reachDoorOpen',
  'reachDoorRead',
  'albumCaptionText',
  'paintAlbumSpread'
];

/* Every one of these is the SHIPPED declaration, lifted verbatim — the
   constants ARE the identity of what is being measured. Pinning a rendered
   string by loose substring is how a copy pin passed a key rename while the
   room rendered `undefined`, so the values below are read out of these
   objects rather than typed into an assertion. */
const LIFT_DECLS = [
  'SPREAD_IDS',
  'REACH',
  /* 26.95-38 (F-3): the ending asks whether a why is still held before it
     closes anything, so the real WHY object is lifted rather than stubbed —
     a stubbed hold is a stubbed exception, and the exception is the owner's
     own ruling. */
  'WHY',
  'OFFER_SLOTS_PER_PAGE',
  'OFFER_COPY',
  'OFFER_CAPTION_YEAR',
  'OFFER_MONTHS',
  'STATION_ALBUM',
  'STATION_ALBUM_GEOM'
];

/* THE COLLABORATORS THE HARNESS SUPPLIES INSTEAD OF LIFTING, AND WHY EACH
   ONE IS NOT A LIFT. Pinned by value. A roster that grew silently would be a
   harness quietly taking over more of the room than it admits to. */
const REPLACED = [
  'apiGet',              // transport — recorded, never issued
  'apiPost',             // transport — recorded, never issued
  'handleBlessingTap',   // the shipped verdict path; out of this claim's scope
  'openSpread',          // the spread CHASSIS; gated by its own suites
  'recordIncident',      // a law-5 incident sink; out of this claim's scope
  'openContainerItem',   // the album photo open; out of this claim's scope
  'ROOM',                // fixture holder: only ROOM.items is read here
  'SHELF',               // fixture holder: only SHELF.filters is read here
  'BLESS',               // fixture holder, unread on the paths driven here
  'SPREAD_FOCUS_NOTES',  // a module flag written only by a click not driven
  /* 26.95-38 (F-3). The ending closes through the SHIPPED pop, and the view
     stack it pops belongs to the chassis and to its own suites — so the pop
     is RECORDED here, not performed. Recording is the whole measurement: the
     claim is that the room comes back on the last answer and on no other,
     and a count answers that exactly. currentView is supplied for the same
     reason — there is no view stack on this page to read a top off. */
  'currentView',
  'popView'
];

/* Of those, the ones a case DRIVES and therefore asserts a recorded call
   for. A replacement that is never exercised is decoration, and the
   distinction is stated rather than glossed. */
const REPLACED_DRIVEN = ['apiGet', 'apiPost', 'handleBlessingTap',
  'openSpread', 'ROOM', 'SHELF', 'currentView', 'popView'];

/* THE ONLY CSS THE HARNESS OVERRIDES. `app.js`'s spread fitter sets the
   frame's geometry at run time and is not present on a static page, so the
   absolutely-positioned chassis would collapse to nothing measurable. These
   are the properties the harness takes over — and the case below asserts
   this roster is DISJOINT from the roster of properties under measurement,
   so the harness can never be the thing that makes a case pass. */
const OVERRIDDEN_PROPS = ['position', 'display', 'background', 'width',
  'height', 'inset', 'top', 'left', 'z-index', 'padding', 'margin'];

/* THE PROPERTIES ANY CASE ACTUALLY MEASURES. */
const MEASURED_PROPS = ['flex-wrap', 'text-overflow', 'white-space',
  'transition-property', 'transition-duration', 'animation-name',
  'animation-duration', 'outline-color', 'outline-width', 'outline-style',
  'overflow-wrap', 'font-size', 'color',
  /* 26.95-40 (F-8): a spent door is DISABLED, NOT HIDDEN, and both halves
     of that are computed style. Neither is in OVERRIDDEN_PROPS, so the
     harness cannot be the reason either one reads the way it does. */
  'opacity', 'pointer-events'];

// ---------------------------------------------------------------------------
// THE PAGE
// ---------------------------------------------------------------------------

/* The shipped spread chassis, lifted verbatim out of index.html. Every id on
   the page below is therefore the room's own id and not one typed here — the
   `SPREAD_IDS.content` spelling rule holds on the harness for the same
   reason it holds in `app.js`. */
function liftSpreadMarkup() {
  const open = '<div id="spread-overlay" hidden>';
  const at = indexSrc.indexOf(open);
  assert.notStrictEqual(at, -1,
    'index.html must still carry the in-scene spread overlay markup — this ' +
    'harness renders the SHIPPED chassis, never a hand-typed copy of it');
  const close = indexSrc.indexOf('\n  </div>', at);
  assert.notStrictEqual(close, -1,
    'the spread overlay block must close at the module indent');
  const block = indexSrc.slice(at, close + '\n  </div>'.length);
  assert.ok(block.length > 400 && block.split('\n').length > 8,
    'the lifted spread markup must be substantial (' + block.length +
    ' chars) — a sliver would render nothing to measure');
  ['spread-stage', 'spread-title', 'spread-scroll', 'spread-content',
    'spread-comments', 'spread-ribbon'].forEach(function (id) {
    assert.notStrictEqual(block.indexOf('id="' + id + '"'), -1,
      'the lifted spread markup must carry #' + id);
  });
  // the overlay ships hidden and app.js raises it; the harness raises it by
  // dropping that one attribute and nothing else.
  return block.replace(open, '<div id="spread-overlay">');
}

const HARNESS_STYLE = [
  '#spread-overlay{position:static;display:block;background:none;',
  'inset:auto;width:auto;height:auto;z-index:auto;overflow:visible}',
  '#spread-stage{position:static;width:auto;height:auto}',
  '#spread-frame,#spread-back{display:none}',
  '#spread-title{position:static}',
  '#spread-scroll{position:static;width:100%;height:auto;overflow:visible;',
  'padding:0}',
  '#spread-ribbon{position:static}'
].join('');

/* THE FIXTURE. Three photographs that exist only in memory: no file is
   written, no library is read, and nothing here resembles a path on this
   machine. `openOfferPage` re-checks each one through the real
   `StudyCore.guardSurface`, and `boot` asserts that check passes BEFORE any
   case depends on it — so a fixture mistake reports itself as a fixture
   mistake rather than as a room defect. */
const FIXTURE_IDS = ['a1b2c3d4e5f60001', 'a1b2c3d4e5f60002',
  'a1b2c3d4e5f60003'];

function fixtureItemsLiteral() {
  const obj = {};
  FIXTURE_IDS.forEach(function (id, i) {
    obj[id] = {
      id: id,
      type: 'image',
      state: 'unseen',
      trigger: false,
      title: 'a photograph ' + i,
      tags: [],
      comments: [],
      history: [],
      created_ms: 1000000000000 + i,
      saved_ms: 1000000000000 + i,
      imported_ms: 1000000000000 + i
    };
  });
  return JSON.stringify(obj);
}

/* The whole page scope, assembled once. It is wrapped in a try/catch that
   records the failure on `window` rather than letting a boot error cascade
   into a page full of ReferenceErrors — a synthetic scope that breaks
   loudly in the wrong place has aborted two suites on this phase, and the
   `boot` case exists to make the break land where it belongs. */
function buildScopeScript() {
  const decls = LIFT_DECLS.map(declRegion).join('\n');
  const fns = LIFT_FNS.map(function (n) { return extractFn(appSrc, n); })
    .join('\n');

  const collaborators = [
    "var calls = { apiGet: [], apiPost: [], fetch: [], bless: [],",
    "  openSpread: [], incident: [], containerItem: [], popView: [] };",
    // ⚠ `calls` is CLEARED by cases that need a fresh window on one action.
    // `seen` never is: it answers "was this replacement ever exercised at
    // all", which is the question that decides whether a stub is a
    // collaborator or a decoration. Two counters because one of them cannot
    // answer both questions.
    "var seen = { apiGet: 0, apiPost: 0, fetch: 0, bless: 0,",
    "  openSpread: 0, incident: 0, containerItem: 0, popView: 0,",
    "  currentView: 0 };",
    "window.fetch = function (u) {",
    "  calls.fetch.push(String(u)); seen.fetch++;",
    // a recorder that REFUSES, so no path on this page can reach a network
    // even by accident. It is not a swallower: it never returns a value that
    // could be mistaken for a served answer.
    "  throw new Error('the harness forbids a request');",
    "};",
    "var ROOM = { items: " + fixtureItemsLiteral() + ", meta: {} };",
    "var SHELF = { filters: [], items: {} };",
    "var BLESS = { items: {}, ids: [], index: 0 };",
    "var SPREAD_FOCUS_NOTES = false;",
    "var API_GET_RESULT = { ok: false };",
    "var API_POST_RESULT = { ok: false };",
    "function apiGet(p) { calls.apiGet.push(String(p)); seen.apiGet++;",
    "  return Promise.resolve(API_GET_RESULT); }",
    "function apiPost(p, b) { calls.apiPost.push({ path: String(p), body: b });",
    "  seen.apiPost++; return Promise.resolve(API_POST_RESULT); }",
    "function handleBlessingTap(id, verdict) { seen.bless++;",
    "  calls.bless.push({ id: String(id), verdict: String(verdict) }); }",
    "function recordIncident(id, door, reason) { seen.incident++;",
    "  calls.incident.push({ id: String(id), door: String(door),",
    "    reason: String(reason) }); }",
    "function openContainerItem(id) { seen.containerItem++;",
    "  calls.containerItem.push(String(id)); }",
    // 26.95-38 (F-3): the view stack stand-in. VIEW_TOP defaults to what an
    // open Offer puts there, and a case may set it to anything else to prove
    // the ending refuses to close a view that is not the Offer.
    "var VIEW_TOP = { view: 'spread', id: 'a', offerPage: true };",
    "function currentView() { seen.currentView++; return VIEW_TOP; }",
    "function popView() { seen.popView++;",
    "  calls.popView.push(JSON.parse(JSON.stringify(VIEW_TOP))); }",
    // the chassis stand-in: it does the ONE thing openOfferPage asks of it —
    // run the page renderer. Everything else about openSpread (the view
    // stack, the camera push, the frame skin) belongs to its own suites.
    "function openSpread(item, content, opts) { seen.openSpread++;",
    "  calls.openSpread.push({ hasItem: !!item, content: content,",
    "    hasPage: !!(opts && typeof opts.page === 'function') });",
    "  if (opts && typeof opts.page === 'function') { opts.page(); } }"
  ].join('\n');

  const exposeReach = [
    "var REACH_INITIAL = JSON.stringify(REACH);",
    "function harnessResetReach() {",
    "  var fresh = JSON.parse(REACH_INITIAL);",
    "  Object.keys(REACH).forEach(function (k) { delete REACH[k]; });",
    "  Object.keys(fresh).forEach(function (k) { REACH[k] = fresh[k]; }); }"
  ].join('\n');

  const expose = [
    "window.__OFFER = {",
    "  calls: calls, seen: seen, REACH: REACH, ROOM: ROOM, SHELF: SHELF,",
    "  OFFER_COPY: OFFER_COPY, SPREAD_IDS: SPREAD_IDS,",
    "  OFFER_SLOTS_PER_PAGE: OFFER_SLOTS_PER_PAGE,",
    "  packOfferPage: packOfferPage, paintOfferPage: paintOfferPage,",
    "  offerCaptionYears: offerCaptionYears,",
    "  offerCaptionPhrase: offerCaptionPhrase,",
    "  renderOfferAnswerRow: renderOfferAnswerRow,",
    "  postNotRelevant: postNotRelevant, openOfferPage: openOfferPage,",
    "  reachDoorOpen: reachDoorOpen, paintAlbumSpread: paintAlbumSpread,",
    "  resetReach: harnessResetReach,",
    "  WHY: WHY,",
    "  setViewTop: function (v) { VIEW_TOP = v; },",
    "  reachAllAnswered: reachAllAnswered,",
    "  reachRepaint: reachRepaint,",
    "  reachEndIfDone: reachEndIfDone,",
    "  markDoorSpent: markDoorSpent,",
    "  setApiGet: function (v) { API_GET_RESULT = v; },",
    "  setApiPost: function (v) { API_POST_RESULT = v; },",
    "  guard: function (id) {",
    "    return StudyCore.guardSurface(ROOM.items[id], SHELF.filters); },",
    "  paintThree: function (facet) {",
    // the five assignments openOfferPage makes, mirrored here so a case can
    // paint without the chassis. `harness-seam-pins` re-reads those five out
    // of app.js so this mirror is a pinned fact rather than a convenience.
    "    harnessResetReach();",
    "    REACH.ids = " + JSON.stringify(FIXTURE_IDS) + ";",
    "    REACH.facet = facet;",
    "    REACH.seedId = 'seed';",
    "    REACH.answered = {};",
    "    REACH.pendingId = null;",
    "    var slots = packOfferPage(REACH.ids.map(function (id) {",
    "      return ROOM.items[id]; }), OFFER_SLOTS_PER_PAGE);",
    // 26.95-39: openOfferPage keeps the packed slots on REACH so an answer
    // resolving outside the chassis closure can bring the next picture. The
    // mirror has to keep them too, or every repaint here paints an empty
    // page and the layout cases pass for the wrong reason.
    "    REACH.slots = slots;",
    "    paintOfferPage(slots);",
    "    return slots.length; }",
    "};"
  ].join('\n');

  const body = [
    "'use strict';",
    'window.__OFFER_BOOT_ERROR = null;',
    'try {',
    collaborators,
    decls,
    fns,
    exposeReach,
    expose,
    '} catch (e) {',
    '  window.__OFFER_BOOT_ERROR = String((e && e.stack) || e);',
    '}'
  ].join('\n');

  const script = '(function () {\n' + body + '\n})();';
  assert.strictEqual(script.toLowerCase().indexOf('</script'), -1,
    'the assembled page scope must not contain a script close tag — it is ' +
    'embedded in an inline script on the harness page');
  return script;
}

function buildBodyHtml() {
  assert.strictEqual(coreSrc.toLowerCase().indexOf('</script'), -1,
    'core.js is inlined into the harness page and must not contain a ' +
    'script close tag');
  return [
    '<style>' + HARNESS_STYLE + '</style>',
    '<button type="button" id="harness-focus-anchor">anchor</button>',
    '<div id="offer-stage" style="width:1600px">',
    liftSpreadMarkup(),
    '</div>',
    '<div class="station-scene" id="album-stage" style="--k:1"></div>',
    '<div class="view-zooming" id="motion-control"></div>',
    '<script>' + coreSrc + '</script>',
    '<script>' + buildScopeScript() + '</script>'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// THE RUNNER — every case runs; a throw becomes a counted violation and never
// ends the file. Hard-won: a lifted scope that gained a collaborator it was
// not given threw ReferenceError twice on this phase and ABORTED the whole
// suite, so later groups never ran and earlier ones never reported.
// ---------------------------------------------------------------------------

const ran = [];
const failures = [];

async function runCase(label, thunk) {
  ran.push(label);
  try {
    await thunk();
  } catch (e) {
    failures.push(label + ' -> ' + ((e && e.message) || String(e)));
  }
}

const CASE_ROSTER = [
  'boot',
  'roster',
  'comment-strip-is-real',
  'harness-seam-pins',
  'g4-no-reason-line',
  'g5-caption-is-not-a-chip',
  'g5b-caption-names-no-place',
  'g6-no-accent',
  'g3c-title-empty',
  'g3e-one-caption',
  'f12-answers-outside-the-scroller',
  'g7-no-motion-on-content',
  'g10-btn-focus-ring',
  'g10-quiet-link-focus-ring',
  'heldout-1-answer-row-wraps',
  'heldout-2-caption-wraps-never-truncates',
  'heldout-3-acknowledgement-leaves-no-residue',
  'heldout-4-missing-picture-file',
  'heldout-5-one-offer-two-doors',
  'f3-the-room-comes-back-on-the-last-answer',
  'f8-a-spent-door-shows-it',
  'p8-paint-spends-nothing',
  'g2-pile-always-shows-its-line',
  'row-wiring-reaches-the-shipped-handler'
];

// ---------------------------------------------------------------------------

async function main() {
  const INK = tokenRgb('ink');
  const ACCENT = tokenRgb('accent');
  const INK_SOFT = tokenRgb('ink-soft');

  const harness = renderHarness.buildHarness({ bodyHtml: buildBodyHtml(), k: 1 });
  let session = null;

  try {
    /* ⛔ OUTSIDE the case runner ON PURPOSE. An unavailable browser is a
       gate that could not execute, and this project's named defect class is
       a check that quietly stops checking. cdp.launch throws with the binary
       path in the message; nothing here catches it. */
    session = await cdp.launch({ url: harness.url });

    const ev = function (expr) { return cdp.evaluate(session, expr); };

    /* THE PAGE IS READY WHEN THE PAGE SAYS SO. The harness stamps a
       per-run token on <html> and the scope stamps __OFFER once its
       scripts have run, so "loaded" is a fact POLLED off the page rather
       than a delay guessed at from here. The budget is bounded and a
       miss is a stated failure, never a quiet pass. */
    let token = null;
    for (let i = 0; i < 400 && token !== harness.token; i++) {
      token = await ev('(function(){return (document.documentElement && ' +
        'document.documentElement.dataset.harness) || null;})()');
      if (token !== harness.token) {
        await ev('new Promise(function(r){setTimeout(r,25);})');
      }
    }
    assert.strictEqual(token, harness.token,
      'the measured page must be the harness page this run wrote; it ' +
      'reported "' + token + '"');
    let booted = false;
    for (let i = 0; i < 400 && !booted; i++) {
      booted = await ev('(function(){return typeof window.__OFFER_BOOT_ERROR ' +
        '!== "undefined";})()') === true;
      if (!booted) {
        await ev('new Promise(function(r){setTimeout(r,25);})');
      }
    }
    assert.strictEqual(booted, true,
      'the page scope script must have RUN before anything is measured. It ' +
      'never reported in — the inline scripts on the harness page did not ' +
      'execute, and a live gate whose subject never loaded FAILS');

    async function tab() {
      await cdp.send(session, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
        key: 'Tab', code: 'Tab'
      });
      await cdp.send(session, 'Input.dispatchKeyEvent', {
        type: 'keyUp', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
        key: 'Tab', code: 'Tab'
      });
    }

    /* Focus a control the way a person does — a TRUSTED Tab press. A
       programmatic .focus() does NOT put a <button> into :focus-visible, so
       a gate that used it would read the browser's resting state and call it
       the room's focus ring. The previous sibling is focused first so the
       one Tab lands deterministically. */
    async function keyboardFocus(prevSel, wantSel) {
      await ev('(function(){var p=document.querySelector(' +
        JSON.stringify(prevSel) + ');if(!p){throw new Error(' +
        '"no element for " + ' + JSON.stringify(prevSel) + ');}p.focus();' +
        'return true;})()');
      await tab();
      const hit = await ev('(function(){var w=document.querySelector(' +
        JSON.stringify(wantSel) + ');return !!(w && document.activeElement===w);' +
        '})()');
      assert.strictEqual(hit, true,
        'a trusted Tab from ' + prevSel + ' must land on ' + wantSel +
        ' — without a real keyboard focus there is no :focus-visible state ' +
        'to measure and this gate cannot run');
    }

    function styleOf(sel, props) {
      return ev('(function(){var e=document.querySelector(' +
        JSON.stringify(sel) + ');if(!e){return null;}var s=getComputedStyle(e);' +
        'var o={};' + JSON.stringify(props) +
        '.forEach(function(p){o[p]=s.getPropertyValue(p);});return o;})()');
    }

    async function paintThree() {
      const n = await ev('window.__OFFER.paintThree({fortnight:5})');
      assert.strictEqual(n, 3,
        'the shipped packer must lay all three Moments on the one page ' +
        '(OD-1) — it packed ' + n);
    }

    async function stageWidth(px) {
      await ev('(function(){document.getElementById("offer-stage")' +
        '.style.width=' + JSON.stringify(px + 'px') + ';return true;})()');
    }

    // ---- boot ------------------------------------------------------------
    await runCase('boot', async function () {
      const err = await ev('window.__OFFER_BOOT_ERROR');
      assert.strictEqual(err, null,
        'the page scope must build cleanly. A lifted region that gained a ' +
        'collaborator the scope does not provide is a HARNESS gap, not a ' +
        'room defect, and it is reported here rather than as twenty ' +
        'unrelated failures. Boot said: ' + err);
      const ok = await ev('!!(window.__OFFER && window.StudyCore)');
      assert.strictEqual(ok, true,
        'the page must hold both the lifted Offer scope and the real core');
      // the fixture proves itself against the REAL law-5 render guard before
      // any case leans on it.
      for (const id of FIXTURE_IDS) {
        const reason = await ev('window.__OFFER.guard(' + JSON.stringify(id) + ')');
        assert.strictEqual(reason, null,
          'THE FIXTURE IS WRONG, NOT THE ROOM: guardSurface held back ' +
          'fixture ' + id + ' with reason "' + reason + '". Fix the fixture ' +
          'shape here; do not loosen the guard');
      }
      // the content container the whole page hangs off is the chassis map's,
      // and the harness page carries that exact id.
      const contentId = await ev('window.__OFFER.SPREAD_IDS.content');
      const present = await ev('!!document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content)');
      assert.strictEqual(present, true,
        'the harness page must carry the chassis map\'s own content id (' +
        contentId + ')');
    });

    // ---- roster ----------------------------------------------------------
    await runCase('roster', async function () {
      /* ⚖️ 27 -> 31 on 2026-08-17: the set-aside beat she ruled
         (reachAsideSaid, reachAsideUndo, showAsideUndoRetry) and the
         caption's year span (offerCaptionYears). Moved deliberately, in the
         same commit as the lift. */
      assert.strictEqual(LIFT_FNS.length, 32,
        'THIRTY-TWO shipped functions are lifted verbatim — one more or ' +
        'one fewer must be a conscious edit of this literal, not a silent ' +
        'widening of what the harness stands in for. It was 26 until F-12 ' +
        'gave the answer row a seat with one spelling');
      assert.strictEqual(LIFT_DECLS.length, 9,
        'NINE shipped declarations are lifted verbatim');
      assert.strictEqual(REPLACED.length, 12,
        'TWELVE collaborators are supplied by the harness rather than ' +
        'lifted');
      // the harness may not be the reason anything passes: what it overrides
      // and what it measures must not intersect.
      const overlap = OVERRIDDEN_PROPS.filter(function (p) {
        return MEASURED_PROPS.indexOf(p) !== -1;
      });
      assert.deepStrictEqual(overlap, [],
        'the harness style override roster must be DISJOINT from the ' +
        'properties under measurement. It overlaps on: ' + overlap.join(', '));
      // every declared prohibition on this file, checked against this file.
      // ⚠ THE BANNED TOKEN IS ASSEMBLED FROM PIECES ON PURPOSE. Spelling it
      // whole here would make this file its own first violation, and would
      // also fail the acceptance sweep that greps this file for it — a
      // self-referential gate that can only ever be red.
      const self = fs.readFileSync(__filename, 'utf8');
      const banned = new RegExp('\\bt' + 'imeout ', 'g');
      assert.strictEqual(hits(self, banned), 0,
        'no suite in this repository may be wrapped in the shell deadline ' +
        'wrapper — it does not exist on this platform and once produced a ' +
        'whole false green sweep at exit 127');
      assert.ok(hits(self, /render-harness/g) > 0,
        'this suite must read computed styles off a live page through the ' +
        'shipped harness, never off a file');
      assert.strictEqual(hits(self, /StudyRo{2}m/g), 0,
        'no suite may name the owner\'s real library');
      assert.strictEqual(hits(self, new RegExp('/Us' + 'ers/', 'g')), 0,
        'no suite may spell an absolute home path — derive it');
    });

    /* ---- comment-strip-is-real -------------------------------------------
       ⚠ THIS CASE EXISTS BECAUSE G-6 WENT RED ON PROSE TWICE — first on
       `tokens.css`'s own sentence declaring the prohibition, and then again
       after a repair that stripped comments but sliced the region out BY ITS
       COMMENT HEADER, so the slice began mid-comment and the stripper had no
       opener to find. Both failures were in the instrument; the room was
       right both times. The strip is therefore not trusted, it is DRIVEN —
       and the region is now anchored on SELECTORS rather than on prose, which
       is what actually closed it.

       ⚠ EVERY PLANT BELOW IS A STRING IN MEMORY. Nothing here writes a file,
       arms anything, or touches the shipped bytes. */
    await runCase('comment-strip-is-real', function () {
      // (a) the CSS stripper removes a comment and keeps the rule beside it.
      const sample = '/* nothing here touches --accent, ever */\n' +
        '.x { color: var(--ink); }\n';
      const stripped = stripCssComments(sample);
      assert.strictEqual(stripped.indexOf('--accent'), -1,
        '(a) the CSS stripper removes a block comment');
      assert.notStrictEqual(stripped.indexOf('.x { color: var(--ink); }'), -1,
        '(a) ...and keeps the rule that sat beside it — a stripper that ' +
        'blanked the input would satisfy the line above and measure nothing');

      /* (b) THE TWO PLANTS, TOLD APART — the whole discrimination the gate
         needs, and neither half is worth anything without the other. BOTH
         are planted into the WHOLE SHEET and both go through the one strip
         site inside offerRuleViolations, so no path can bypass it. */
      const inRule = tokensSrc.replace('.offer-answers {\n  display: flex;',
        '.offer-answers {\n  outline-color: var(--accent);\n  display: flex;');
      assert.notStrictEqual(inRule, tokensSrc,
        '(b) the rule plant must actually change the text');
      const caught = offerRuleViolations(inRule);
      assert.ok(caught.some(function (v) {
        return /^\.offer-answers names --accent/.test(v);
      }),
        '(b) PLANT IN A RULE — an accent reference inside a real declaration ' +
        'MUST be reported, and reported against the rule that carries it. ' +
        'Got: ' + JSON.stringify(caught));

      const inComment = tokensSrc.replace('THREE RULES, AND NO TOKEN.',
        'THREE RULES, AND NO TOKEN. Never write --accent here.');
      assert.notStrictEqual(inComment, tokensSrc,
        '(b) the comment plant must actually change the text');
      assert.deepStrictEqual(offerRuleViolations(inComment), [],
        '(b) PLANT IN A COMMENT — the SAME token written into the block\'s ' +
        'own prose must NOT be reported. This is the false red this gate ' +
        'produced twice, reproduced and now refused. A checker that cannot ' +
        'tell a ban from an instance is not measuring the claim it prints');

      /* (b3) THE PLANT THAT KEEPS THE STRIP LOAD-BEARING, and it is here
         because the repair above would otherwise have made the strip
         decorative: with the region anchored on a SELECTOR, a comment
         sitting outside a rule is already out of scope, so deleting the
         strip would redden nothing and the drill row aimed at it would have
         been theatre. A comment INSIDE a declaration block is legal CSS,
         reachable, and the one shape where the strip is the only thing
         standing between this gate and a third false red. Driven, so it
         stays true. */
      const inRuleComment = tokensSrc.replace(
        '.offer-answers {\n  display: flex;',
        '.offer-answers {\n  /* never var(--accent) here */\n  display: flex;');
      assert.notStrictEqual(inRuleComment, tokensSrc,
        '(b3) the in-rule comment plant must actually change the text');
      assert.deepStrictEqual(offerRuleViolations(inRuleComment), [],
        '(b3) PLANT IN A COMMENT INSIDE A RULE — a ban written where the ' +
        'declarations live must still NOT be reported. Remove the strip from ' +
        'offerRuleViolations and this is the assertion that goes red, which ' +
        'is what makes the strip a mechanism rather than an ornament');

      // (c) the strip did not blank the shipped sheet — stated as a ratio,
      //     because "not empty" is satisfied by one surviving byte.
      assert.ok(tokensClean.length > tokensSrc.length * 0.25,
        '(c) the stripped stylesheet retains a substantial fraction of the ' +
        'sheet (' + tokensClean.length + ' of ' + tokensSrc.length +
        ' chars). This file is heavily commented, so the ratio is the ' +
        'honest check and "non-empty" is not');
      assert.ok(tokensClean.length < tokensSrc.length,
        '(c) ...and it is strictly SHORTER than the raw sheet, so the strip ' +
        'is doing something rather than returning its input');
      [':root {', '--ink: #', '.offer-answers {', '#spread-ribbon {']
        .forEach(function (landmark) {
          assert.notStrictEqual(tokensClean.indexOf(landmark), -1,
            '(c) the stripped sheet still carries "' + landmark + '"');
        });

      /* (d) the JS stripper, on the region a scan actually reads — and this
         region is the one that PROVES the refusal belongs on the output. Its
         body quotes `font: inherit` in a line comment, so an input-side
         backtick guard would refuse a region whose backticks the scanner
         consumes correctly, and five cases would have thrown at once over a
         comment. */
      const rowRaw = extractFn(appSrc, 'renderOfferAnswerRow');
      assert.notStrictEqual(rowRaw.indexOf('`'), -1,
        '(d) the answer-row region really does carry a backtick in its own ' +
        'prose — if it stopped, this half of the control is vacuous and the ' +
        'input-vs-output distinction below proves nothing');
      const rowClean = stripComments(rowRaw, 'renderOfferAnswerRow');
      assert.strictEqual(rowClean.indexOf('`'), -1,
        '(d) ...and the strip removed it along with the comment that held ' +
        'it, so the refusal never fires on prose');
      assert.ok(rowClean.length < rowRaw.length,
        '(d) the JS stripper shortened the answer-row region (' +
        rowClean.length + ' of ' + rowRaw.length + ' chars)');
      assert.notStrictEqual(rowClean.indexOf('offer-notrel'), -1,
        '(d) ...and kept its markup, so the negative scans over it have a ' +
        'subject');
      assert.strictEqual(rowClean.indexOf('the shipped quiet-link recipe'), -1,
        '(d) ...and removed its prose, including the trailing comments that ' +
        'sit at the end of a line of code. A stripper that only removed ' +
        'whole comment LINES would leave those, and they are where this ' +
        'file\'s own scans would trip next');

      // (e) the parser REFUSES what it cannot read, rather than guessing.
      let refused = false;
      try { stripComments('var s = `a ${b} c`;', 'synthetic'); }
      catch (e) { refused = /REFUSES/.test(String(e.message)); }
      assert.strictEqual(refused, true,
        '(e) a region carrying a template literal is REFUSED by name. An ' +
        'unbalanced one would make the scanner run past a real comment and ' +
        'emit it — the same false red, one layer down');
    });

    // ---- harness-seam-pins ----------------------------------------------
    await runCase('harness-seam-pins', function () {
      const read = stripComments(region('reachDoorRead'));
      const spentAt = read.indexOf('REACH.spent = true;');
      const openAt = read.indexOf('openOfferPage(');
      assert.notStrictEqual(spentAt, -1,
        'reachDoorRead must still be the place the visit\'s Offer is spent ' +
        '— the harness stands in for that one assignment and the stand-in ' +
        'is only honest while the shipped one is there');
      assert.notStrictEqual(openAt, -1,
        'reachDoorRead must still open the Offer page');
      assert.ok(spentAt < openAt,
        'the Offer is spent BEFORE it is opened, so a second door that ' +
        'arrives mid-open finds it spent. Order matters here and the two ' +
        'statements are one sequence in one function body');
      // the five assignments the harness mirrors in paintThree.
      const open = stripComments(region('openOfferPage'));
      ['REACH.ids = ', 'REACH.facet = ', 'REACH.seedId = ',
        'REACH.answered = {}', 'REACH.pendingId = null'].forEach(function (t) {
        assert.notStrictEqual(open.indexOf(t), -1,
          'openOfferPage must still set `' + t + '` — the harness mirrors ' +
          'exactly these five and a sixth would make the mirror a fiction');
      });
    });

    // ---- G-4 -------------------------------------------------------------
    await runCase('g4-no-reason-line', function () {
      // ⚠ COMMENT-STRIPPED, and this is the case that most needs it: the
      // prose above these three functions explains at length what a reason
      // line is and why the room may not write one.
      ['renderOfferCaption', 'renderOfferAnswerRow', 'paintOfferPage']
        .forEach(function (name) {
          const body = stripComments(region(name));
          [/\bbecause\b/i, /vision\//, /\.ocr\b/, /\bthemes\b/,
            /machine reading/i].forEach(function (re) {
            assert.strictEqual(hits(body, new RegExp(re.source, 'gi')), 0,
              'G-4 (D-12, law 4): the Offer renders no sentence about a ' +
              'photograph carrying a causal connective, and no text drawn ' +
              'from a picture\'s own machine reading. ' + name + ' matched ' +
              re + ' after comments were stripped');
          });
        });
    });

    // ---- G-5 -------------------------------------------------------------
    await runCase('g5-caption-is-not-a-chip', function () {
      const cap = stripComments(region('renderOfferCaption'));
      assert.strictEqual(hits(cap, /also:/g), 0,
        'G-5 (F-1): the caption must not reuse the exclusion row\'s leading ' +
        'word. In this room `also:` means "tap me and something stops ' +
        'coming back", and a caption that explains an offer must never read ' +
        'as a control that suppresses one');
      ['filter-chip', 'filter-offer'].forEach(function (cls) {
        assert.strictEqual(cap.indexOf(cls), -1,
          'G-5: the caption must not wear the exclusion row\'s look ("' +
          cls + '")');
      });
      // the positive half, without which this whole case is satisfied by
      // renderOfferCaption not existing.
      assert.notStrictEqual(cap.indexOf("'offer-caption'"), -1,
        'G-5: ...and the caption DOES carry its own class, so the negative ' +
        'assertions above have a subject');
    });

    // ---- G-5b ------------------------------------------------------------
    await runCase('g5b-caption-names-no-place', async function () {
      // the caption's ONLY word sources are these two declarations, so
      // pinning them by identity pins the whole vocabulary.
      const monthList = JSON.parse(
        new Function(declRegion('OFFER_MONTHS') + '\nreturn JSON.stringify(OFFER_MONTHS);')());
      assert.deepStrictEqual(monthList,
        ['january', 'february', 'march', 'april', 'may', 'june', 'july',
          'august', 'september', 'october', 'november', 'december'],
        'G-5b (F-2): the caption\'s entire vocabulary is twelve month names ' +
        'plus early/mid/late. There is no location data anywhere in the ' +
        'product, so a place name here could only be invented');
      const tmpl = await ev('window.__OFFER.OFFER_COPY.captionTemplate');
      // ✅ HERS, 2026-08-17. C-1 is settled and `copy_approved` is true: she
      // asked for the real years in place of "other years". Still pinned BY
      // KEY AND BY VALUE — the pin's job inverted rather than ended, from
      // holding a placeholder still to stopping her wording drifting.
      assert.strictEqual(tmpl, 'around {when}, {years}',
        'G-5b / C-1 (HERS — 26.95-COPY.md, copy_approved: true): the caption ' +
        'template is pinned by key and by value so no agent rewords it');
      assert.strictEqual(/\{when\}/.test(tmpl), true,
        'C-1 carries a time-of-year slot');
      assert.strictEqual(/\{years\}/.test(tmpl), true,
        'C-1 carries a years slot — the change she asked for. ⛔ She also ' +
        'asked for a THEME and it was declined at the source: nothing in ' +
        'this product says what a photograph is OF');
      // and the LIVE line, read off the painted page.
      await paintThree();
      const line = await ev('(function(){var e=document.getElementById(' +
        '"offer-caption");return e?e.textContent:null;})()');
      assert.strictEqual(
        /^around (early|mid|late)-[a-z]+, \d{4}( ~ \d{4})?$/
          .test(String(line)), true,
        'G-5b: the rendered caption names a time of year and the years the ' +
        'photographs come from, and nothing else — no reason, no place, no ' +
        'count. It read: "' + line + '"');
      /* ⛔ HER TWO RULES ON THE SPAN, DRIVEN AS ARITHMETIC RATHER THAN
         ASSERTED AS PROSE. A span is written with `~`; and when every
         photograph is from one year it COLLAPSES to that year — never
         `2019 ~ 2019`, which is the shape a naive min/max prints and the one
         she named unprompted. */
      const span = await ev(
        'JSON.stringify([[2019, 2021, 2023], [2021, 2021, 2021], []]' +
        '.map(function (ys) {' +
        '  var items = {}, ids = [];' +
        '  ys.forEach(function (y, i) {' +
        '    var id = "y" + i;' +
        '    ids.push(id);' +
        '    items[id] = { id: id, created_ms: Date.UTC(y, 7, 15) };' +
        '  });' +
        '  return window.__OFFER.offerCaptionYears(items, ids); }))');
      assert.deepStrictEqual(JSON.parse(span), ['2019 ~ 2023', '2021', ''],
        'C-1 (hers): three years span low to high with `~`; one year alone ' +
        'collapses to that year; and no dates at all yields the empty ' +
        'string, which means SAY NOTHING rather than render half a sentence');
      /* ⛔ ...AND THE SILENCE IS DRIVEN, NOT ASSUMED. The empty string above
         only means "say nothing" if something downstream honours it. Written
         because the mutation that made the caption render WITHOUT years — the
         half-sentence "around mid-august, " on her screen — passed every case
         in this suite. A rule no gate can fail on is not a rule. */
      const silent = await ev(
        'JSON.stringify([window.__OFFER.offerCaptionPhrase(16, ""),' +
        ' window.__OFFER.offerCaptionPhrase(16, null),' +
        ' window.__OFFER.offerCaptionPhrase(16, "2021")])');
      const phrases = JSON.parse(silent);
      assert.strictEqual(phrases[0], '',
        'C-1: no years means NO LINE. A caption rendered with an empty slot ' +
        'is a sentence she did not write');
      assert.strictEqual(phrases[1], '',
        'C-1: ...and a missing years argument is the same silence, not a ' +
        'literal "null" on her screen');
      assert.ok(/^around (early|mid|late)-[a-z]+, 2021$/.test(phrases[2]),
        'C-1: ...while a real year fills the slot. It read: "' +
        phrases[2] + '"');
    });

    // ---- G-6 -------------------------------------------------------------
    await runCase('g6-no-accent', function () {
      ['renderOfferCaption', 'renderOfferAnswerRow', 'paintOfferPage',
        'postNotRelevant', 'showNotRelevantRetry', 'openOfferPage']
        .forEach(function (name) {
          const body = stripComments(region(name));
          assert.strictEqual(hits(body, /--accent/g), 0,
            'G-6: no --accent reference is added by this phase. ' + name +
            ' names it. An offer that arrives in coral reads as an alert, ' +
            'and law 1\'s whole posture is that nothing here is urgent');
        });
      /* THE STYLESHEET HALF. The whole sheet goes in; the function strips it
         from byte zero and reads the four Offer rules BY SELECTOR. Nothing
         here anchors on a comment, which is the entire repair — see the note
         above offerRuleViolations. The same function is driven by the plant
         case, so the thing proven able to fail is the thing that runs here. */
      const live = offerRuleViolations(tokensSrc);
      assert.deepStrictEqual(live, [],
        'G-6: the Offer\'s own stylesheet RULES name no accent. An offer ' +
        'that arrives in coral reads as an alert, and law 1\'s whole ' +
        'posture is that nothing here is urgent. Found: ' + live.join(' | '));
      // WHAT THIS CANNOT SEE, stated rather than glossed: G-6's claim is
      // over the whole phase diff, and a diff needs git. This is the
      // rule-scoped half; the diff-wide half belongs to the drill.
    });

    // ---- G-3c ------------------------------------------------------------
    await runCase('g3c-title-empty', async function () {
      await paintThree();
      const t = await ev('(function(){var e=document.getElementById(' +
        '"spread-title");return {html:e.innerHTML,text:e.textContent,' +
        'kids:e.children.length};})()');
      assert.strictEqual(t.kids, 0,
        'G-3c (OD-4): the title slot holds no node on an Offer');
      assert.strictEqual(t.html, '',
        'G-3c (OD-4): the title slot is EMPTY on an Offer. A photograph\'s ' +
        'title is a UUID and twenty pixels of machine noise across the ' +
        'room\'s calmest surface is worse than nothing');
      assert.strictEqual(t.text, '',
        'G-3c: ...and no text was promoted into it either. The caption ' +
        'must not move up into the title slot — the room\'s own sentence ' +
        'sitting where a name goes is a step toward captioning a picture');
    });

    // ---- G-3e ------------------------------------------------------------
    await runCase('g3e-one-caption', async function () {
      await paintThree();
      // counts first, BY VALUE, before any text is read.
      const n = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);return {caps:' +
        'h.querySelectorAll(".offer-caption").length,ids:' +
        'h.querySelectorAll("#offer-caption").length,rows:' +
        'h.querySelectorAll(".offer-answers").length,imgs:' +
        'h.querySelectorAll("img").length};})()');
      assert.strictEqual(n.caps, 1,
        'G-3e (OD-1): a three-Moment page carries ONE caption for the whole ' +
        'page, not one per picture. Found ' + n.caps);
      assert.strictEqual(n.ids, 1,
        'G-3e: ...and exactly one element wears the caption id, so the id ' +
        'stays a handle rather than a duplicate');
      /* ⚖️ AMENDED 2026-08-16 (UAT F-2, hers): ONE picture, not three. It read
         `rows === 3` / `imgs === 3` under OD-1 → B; she overturned that
         layout at the UAT — «I don't like the scrolling layout, this should
         be one image per window» — after it measured as a 1,446px column in
         a 437px window with no picture ever on screen beside its own answer
         buttons. The row-belongs-to-the-picture claim is UNCHANGED and is
         what the pairing below still asserts.

         ⚖️ AMENDED AGAIN 2026-08-16 (UAT F-12, hers), and the second
         amendment is the first one's unfinished half. F-2 moved to one
         picture per window BECAUSE no picture was ever on screen beside its
         own buttons — and driving the real path afterwards showed the row
         still sat 40px BELOW the fold, so the property F-2 was taken for was
         STILL not delivered. She chose the seat over a smaller photograph.
         So the count here moves out of the scroll region rather than
         changing: the content region carries NO row now, and the ribbon
         carries the one. ⚠ The count is asserted in BOTH places, because
         "zero rows in the scroller" alone is satisfied by a page that
         renders no answer controls at all. */
      assert.strictEqual(n.rows, 0,
        'G-3e as amended (F-12): the answer row is NOT in the scroll ' +
        'region any more — it is seated in the pinned ribbon, so it cannot ' +
        'scroll away from the picture it belongs to. Found ' + n.rows +
        ' in the content region');
      const seated = await ev('(function(){var b=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.bar);return {rows:' +
        'b.querySelectorAll(".offer-answers").length,id:(b.querySelector(' +
        '".offer-answers")||{getAttribute:function(){return null;}})' +
        '.getAttribute("data-offer-id")};})()');
      assert.strictEqual(seated.rows, 1,
        'G-3e as amended (F-12): ...and it is EXACTLY ONE row, in the ' +
        'ribbon. Found ' + seated.rows);
      /* THE PAIRING CLAIM, UNCHANGED IN SUBSTANCE AND NOW WORTH MORE. While
         the row sat directly beneath its picture, "this row belongs to that
         photograph" was carried by position. Seated one container away it is
         carried ONLY by the id the row stamps on itself — so the id is
         checked against the picture actually on screen rather than assumed.
         A row pinned to the wrong photograph would send her verdict to a
         picture she never saw, which is the one mistake this surface must
         never make. */
      const shown = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var i=h.querySelector("img");' +
        'return i?decodeURIComponent(i.getAttribute("src").replace(' +
        '"/lib/","")):null;})()');
      assert.strictEqual(seated.id, shown,
        'G-3e (F-12): the pinned row names the photograph that is actually ' +
        'on screen. The row says "' + seated.id + '" and the window is ' +
        'showing "' + shown + '"');
      /* ⚠⚠ AND IT IS CHECKED AGAIN ONCE THE PAGE HAS MOVED ON, WHICH IS THE
         ONLY PLACE IT BITES. The check above passed a mutation that stamped
         the row with `REACH.ids[0]` instead of the showing picture — on the
         FIRST paint those two are the same value, so the assertion agreed
         with a defect. That is the mutation-that-stays-green shape this
         phase keeps meeting, and the answer is a new case rather than a
         smaller mutation. The pairing only means anything after an answer
         has brought the NEXT photograph. */
      await ev('window.__OFFER.setApiPost({ok:true,data:{}})');
      await ev('(function(){document.querySelector(".offer-answers")' +
        '.querySelector(".offer-notrel").click();return true;})()');
      await ev('new Promise(function(r){setTimeout(r,0);})');
      await ev('(function(){var g=document.querySelector(".offer-goon");' +
        'if(g){g.click();}return true;})()');
      const moved = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.bar);var i=h.querySelector("img");' +
        'var r=b.querySelector(".offer-answers");return {' +
        'src:i?decodeURIComponent(i.getAttribute("src").replace(' +
        '"/lib/","")):null,id:r?r.getAttribute("data-offer-id"):null};})()');
      assert.notStrictEqual(moved.src, shown,
        'the page must actually have moved on before the pairing is ' +
        're-read — a check that re-measures the same picture is the ' +
        'vacuous one all over again');
      assert.strictEqual(moved.id, moved.src,
        'G-3e (F-12): the pinned row FOLLOWS the picture. It says "' +
        moved.id + '" while the window shows "' + moved.src + '" — a row ' +
        'that kept naming the first photograph would send her verdict to a ' +
        'picture she is no longer looking at, which is the one mistake a ' +
        'row seated away from its picture can make');
      await ev('window.__OFFER.resetReach()');
      await ev('window.__OFFER.setApiPost({ok:false})');
      await paintThree();
      assert.strictEqual(n.imgs, 1,
        'G-3e as amended (F-2): ...and exactly one picture is on it. Found ' +
        n.imgs);
      // ordering: the caption sits ABOVE the picture.
      const first = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);return h.firstElementChild.id;})()');
      assert.strictEqual(first, 'offer-caption',
        'the caption is the first thing in the scroll region, above the ' +
        'picture, and belongs to it');

      /* ---- F-4, WHICH DIES WITH THE LAYOUT AND IS PINNED SO IT STAYS DEAD
         The caption used to be painted ONCE at the top of a three-picture
         scroll, so the line that says WHY these pictures was visible for the
         first and gone by the second — absent for two of the three. It is
         painted with whichever picture is showing. Driven across all three
         rather than reasoned from the code, because "it is inside the
         painter" is exactly the kind of claim that survives a refactor while
         the room stops doing it. */
      await ev('window.__OFFER.setApiPost({ok:true,data:{}})');
      for (let i = 0; i < 2; i++) {
        const seen = await ev('(function(){var h=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.content);return {caps:' +
          'h.querySelectorAll(".offer-caption").length,imgs:' +
          'h.querySelectorAll("img").length,' +
          'text:(h.querySelector(".offer-caption")||{}).textContent||"",' +
          'src:h.querySelector("img")?h.querySelector("img")' +
          '.getAttribute("src"):null};})()');
        assert.strictEqual(seen.caps, 1,
          'F-4: picture ' + (i + 1) + ' of three is on screen WITH its ' +
          'caption — the line that explains the offer is never absent while ' +
          'a picture is showing');
        assert.ok(seen.text.length > 0,
          'F-4: ...and the caption actually says something on picture ' +
          (i + 1));
        // answer it and let the next arrive
        await ev('(function(){document.querySelector(".offer-answers")' +
          '.querySelector(".offer-notrel").click();return true;})()');
        await ev('new Promise(function(r){setTimeout(r,0);})');
        await ev('(function(){var g=document.querySelector(".offer-goon");' +
          'if(g){g.click();}return true;})()');
        const moved = await ev('(function(){var h=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.content);var i=h.querySelector("img");' +
          'return i?i.getAttribute("src"):null;})()');
        assert.notStrictEqual(moved, seen.src,
          'F-2: answering brought the NEXT picture — the window is showing ' +
          'a different photograph than it was before the answer');
      }
      await ev('window.__OFFER.resetReach()');
    });

    // ---- F-12 ------------------------------------------------------------
    /* THE ANSWER ROW IS OUTSIDE THE ONE SCROLLER, AND THAT IS THE WHOLE
       CLAIM OF THIS CASE.

       ⚠⚠ IT IS A CONTAINMENT CHECK AND DELIBERATELY NOT A GEOMETRY ONE, and
       the restraint is the point. The property she actually bought is "the
       three controls are there without scrolling to them" — and THIS HARNESS
       CANNOT HONESTLY MEASURE THAT. It flattens the chassis to static/auto
       (OVERRIDDEN_PROPS carries position, inset, top, height AND padding)
       because `app.js`'s spread fitter is not present on a static page, so
       every fold on this page is the harness's fold and not the room's. A
       case that measured it here would be measuring its own scaffolding and
       reporting the room — which is this phase's most expensive recurring
       mistake, now at five instances, and F-11 was the sixth in another
       dress: a suite that drove the painter through a harness holding the
       thing the real path builds.

       WHAT SURVIVES THE FLATTENING IS THE TREE, and the tree is lifted out
       of `index.html` rather than typed here. In it the ribbon is a SIBLING
       of the scroll region — that is D-03's own arrangement, and it is the
       fact that MAKES the pinning possible. So this case asserts the two
       structural things a fold cannot be built without: the row is not in
       the scroller, and the ribbon it is in is not in the scroller either.
       The pinning itself is `#spread-ribbon`'s own position rule and belongs
       to the chassis suites; the fold belongs to a live room, and the live
       drive is what found F-12 in the first place. */
    await runCase('f12-answers-outside-the-scroller', async function () {
      await paintThree();
      /* THE SCROLLER IS REACHED AS THE CONTENT REGION'S OWN PARENT, never by
         re-spelling its id — the same discipline `offerRowEl` follows, and
         the derivation is CHECKED rather than trusted so a chassis that
         re-nested the content region reports itself here instead of quietly
         making the claim vacuous. */
      const anchor = await ev('(function(){var c=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);return c.parentElement?' +
        'c.parentElement.id:null;})()');
      assert.strictEqual(anchor, 'spread-scroll',
        'the one scroller is the content region\'s own parent (D-01: scroll ' +
        'inside the drawn frame). It resolved to "' + anchor + '" — if the ' +
        'chassis re-nested, re-decide this derivation rather than pinning a ' +
        'literal id beside it');

      /* THE PROBE, WRITTEN ONCE so the mutation control below re-measures
         with the SAME instrument. A control that runs a different probe
         proves nothing about the probe that guards the room. */
      const PROBE = '(function(){var row=document.querySelector(' +
        '".offer-answers");var c=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var scroll=c.parentElement;' +
        'var bar=document.getElementById(window.__OFFER.SPREAD_IDS.bar);' +
        'return {found:!!row,inScroller:!!(row&&scroll.contains(row)),' +
        'inRibbon:!!(row&&bar&&bar.contains(row)),' +
        'ribbonInScroller:!!(bar&&scroll.contains(bar)),' +
        'siblings:!!(bar&&bar.parentElement===scroll.parentElement)};})()';

      const seen = await ev(PROBE);
      assert.strictEqual(seen.found, true,
        'F-12: there must BE an answer row to place. "Not in the scroller" ' +
        'is satisfied trivially by a page with no controls at all, so its ' +
        'existence is asserted before its seat');
      assert.strictEqual(seen.inScroller, false,
        'F-12 (hers): the answer row must NOT be inside the one scroller. ' +
        'This is the second time this property has been claimed: F-2 ' +
        'replaced the three-picture column precisely because no picture was ' +
        'ever on screen beside its own buttons, and the row still measured ' +
        '40px below the fold on her real library afterwards');
      assert.strictEqual(seen.inRibbon, true,
        'F-12: ...and it is seated in the ribbon, which D-03 built as the ' +
        'thing that "can never scroll away"');
      assert.strictEqual(seen.ribbonInScroller, false,
        'F-12: the ribbon itself must not be inside the scroller either — a ' +
        'pinned bar nested in the thing it is pinned over scrolls with it, ' +
        'and the row would travel with it');
      assert.strictEqual(seen.siblings, true,
        'F-12: the ribbon and the scroll region are SIBLINGS (D-03). That ' +
        'arrangement is what makes the pinning expressible at all');

      /* ---- THE MUTATION CONTROL -------------------------------------------
         Seat the row back where it shipped until now — inside the scroller,
         directly beneath its picture — and require the SAME probe to report
         the difference. A probe that cannot see its own opposite is not
         measuring anything, and on this phase two drills have already come
         back green and turned out to be gaps in the test rather than
         confirmations of it. */
      const moved = await ev('(function(){var row=document.querySelector(' +
        '".offer-answers");var c=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);c.appendChild(row);' +
        'return c.contains(row);})()');
      assert.strictEqual(moved, true,
        'the control must actually re-seat the row before the probe is ' +
        'asked about it — a control that failed to break anything would ' +
        'read as a probe that works');
      const broken = await ev(PROBE);
      assert.strictEqual(broken.found, true,
        'the control must leave a row on the page — otherwise it is testing ' +
        'a missing node rather than a misplaced one');
      assert.strictEqual(broken.inScroller, true,
        'THE PROBE IS BLIND: the row was moved back into the scroller and ' +
        'the probe still reported it outside. Every assertion above is ' +
        'vacuous until this control fails the way it is written to');
      assert.strictEqual(broken.inRibbon, false,
        'THE PROBE IS BLIND: the row left the ribbon and the probe did not ' +
        'notice');

      // repaint puts the page back the way the room paints it, so no later
      // case inherits the control's damage.
      await paintThree();
      const restored = await ev(PROBE);
      assert.strictEqual(restored.inScroller, false,
        'the repaint must restore the shipped seat — a control that leaks ' +
        'into the cases after it is a control that breaks them');
      assert.strictEqual(restored.inRibbon, true,
        'the repaint must put the row back in the ribbon');
      await ev('window.__OFFER.resetReach()');
    });

    // ---- G-7 -------------------------------------------------------------
    await runCase('g7-no-motion-on-content', async function () {
      await paintThree();
      const s = await styleOf('#spread-content',
        ['transition-duration', 'animation-name', 'animation-duration',
          'transition-property']);
      assert.ok(s, '#spread-content must exist on the page');
      assert.strictEqual(/^0s(,\s*0s)*$/.test(s['transition-duration'].trim()),
        true,
        'G-7 (law 4): no transition reaches the content region on an Offer. ' +
        'transition-duration computed to "' + s['transition-duration'] + '"');
      assert.strictEqual(s['animation-name'].trim(), 'none',
        'G-7: and no animation is named on it. animation-name computed to "' +
        s['animation-name'] + '"');
      assert.strictEqual(/^0s(,\s*0s)*$/.test(s['animation-duration'].trim()),
        true,
        'G-7: and no animation runs on it. animation-duration computed to "' +
        s['animation-duration'] + '"');
      /* THE CONTROL — the same probe against something that DOES move.
         Without it, this case passes just as happily on a page where
         getComputedStyle returns nothing useful at all.

         ⚠ The preferred control is the SHIPPED `.view-zooming` rule, which
         really does declare a 300ms transform. That rule is deliberately
         switched off under `prefers-reduced-motion: reduce`, and a headless
         browser may report that preference — so the preference is READ off
         the page and the control falls back to an inline declaration when
         the shipped one is not available. A control that went missing on a
         machine setting would make this case flaky for a reason that has
         nothing to do with the claim. */
      const reduced = await ev('window.matchMedia("(prefers-reduced-motion: ' +
        'reduce)").matches');
      const moving = reduced
        ? await ev('(function(){var e=document.getElementById(' +
          '"motion-control");e.style.transition="opacity 300ms ease-out";' +
          'var v=getComputedStyle(e).getPropertyValue("transition-duration");' +
          'e.style.transition="";return {"transition-duration":v};})()')
        : await styleOf('#motion-control', ['transition-duration']);
      assert.notStrictEqual(moving['transition-duration'].trim(), '0s',
        'CONTROL: a declared transition must be VISIBLE to this probe ' +
        '(reduced-motion preference on this browser: ' + reduced + '). It ' +
        'read "' + moving['transition-duration'] + '" — if that is 0s the ' +
        'probe is blind and the assertions above measured nothing');
    });

    // ---- G-10, the .btn register ----------------------------------------
    await runCase('g10-btn-focus-ring', async function () {
      await paintThree();
      await keyboardFocus('#harness-focus-anchor',
        '.offer-answers .offer-bless');
      let s = await styleOf('.offer-answers .offer-bless',
        ['outline-color', 'outline-width', 'outline-style']);
      assert.strictEqual(s['outline-color'], INK,
        'G-10: the bring-it-back control\'s focus ring is --ink (' + INK +
        '), never --accent (' + ACCENT + '). It computed "' +
        s['outline-color'] + '"');
      assert.strictEqual(s['outline-width'], '2px',
        'G-10: ...two pixels, the shipped 26.88 precedent verbatim');
      assert.strictEqual(s['outline-style'], 'solid',
        'G-10: ...solid, the shipped 26.88 precedent verbatim');

      await keyboardFocus('.offer-answers .offer-bless',
        '.offer-answers .offer-never');
      s = await styleOf('.offer-answers .offer-never',
        ['outline-color', 'outline-width']);
      assert.strictEqual(s['outline-color'], INK,
        'G-10: the set-it-aside control\'s focus ring is --ink too. It ' +
        'computed "' + s['outline-color'] + '"');

      // THE IN-PAGE MUTATION CONTROL. A gate never seen red is not
      // evidence — so the shipped rule is disabled in the LIVE stylesheet
      // and the same probe must report the difference. Nothing is written to
      // any file; the change lives in this throwaway page and is undone
      // immediately below.
      const RING = ['outline-color', 'outline-width', 'outline-style'];
      const clean = await styleOf('.offer-answers .offer-never', RING);
      const disabled = await ev('(function(){var found=0;' +
        'for (var i=0;i<document.styleSheets.length;i++){var sh;' +
        'try{sh=document.styleSheets[i].cssRules;}catch(e){continue;}' +
        'for (var j=0;j<sh.length;j++){' +
        'if (sh[j].selectorText === ".offer-answers .btn:focus-visible"){' +
        'window.__MUT={sheet:i,index:j,text:sh[j].cssText};' +
        'document.styleSheets[i].deleteRule(j);found++;j--;}}}' +
        'return found;})()');
      assert.strictEqual(disabled, 1,
        'the mutation control must find and remove exactly ONE shipped ' +
        '.offer-answers .btn:focus-visible rule; it found ' + disabled);
      const after = await styleOf('.offer-answers .offer-never', RING);
      // ⚠ COMPARED AS A TRIPLE, NOT ON COLOUR ALONE. --btn and --ink are the
      // SAME hex in this sheet, so a browser that fell back to currentcolor
      // would hand back the ink value and a colour-only control would report
      // no difference while measuring nothing.
      assert.notDeepStrictEqual(after, clean,
        'MUTATION NOT CAUGHT: with the shipped focus rule removed from the ' +
        'live stylesheet the probe reported the same ring (' +
        JSON.stringify(after) + '), which means this gate is not measuring ' +
        'the rule it names');
      await ev('(function(){var m=window.__MUT;' +
        'document.styleSheets[m.sheet].insertRule(m.text,m.index);' +
        'return true;})()');
      const restored = await styleOf('.offer-answers .offer-never', RING);
      assert.deepStrictEqual(restored, clean,
        'the mutation must be reverted exactly — the page is shared by the ' +
        'cases that follow');
    });

    // ---- G-10, the quiet link -------------------------------------------
    await runCase('g10-quiet-link-focus-ring', async function () {
      await paintThree();
      await keyboardFocus('.offer-answers .offer-never',
        '.offer-answers .offer-notrel');
      const s = await styleOf('.offer-answers .offer-notrel',
        ['outline-color', 'outline-width', 'outline-style', 'color']);
      assert.strictEqual(s.color, INK_SOFT,
        'the quiet link is in the shipped quiet ink (' + INK_SOFT +
        '); it computed "' + s.color + '"');
      assert.strictEqual(s['outline-color'], INK,
        'G-10 says EVERY new control carries an explicit focus-visible ' +
        'outline and it is --ink (' + INK + '), never --accent. The quiet ' +
        '`not relevant` control computed "' + s['outline-color'] + '". ' +
        'tokens.css declares `.offer-answers .btn:focus-visible`, and this ' +
        'control is deliberately NOT in the .btn register — which is what ' +
        'makes it quiet — so it matches nothing and falls to the browser\'s ' +
        'own ring on the paper fill. The sheet has no global focus-visible ' +
        'rule and says so in its own words. THE FIX IS ONE ADDITIVE RULE ' +
        'BESIDE THE SHIPPED ONE, with the same two values and no new token: ' +
        '`.offer-answers .offer-notrel:focus-visible { outline: 2px solid ' +
        'var(--ink); outline-offset: 2px; }`');
      assert.strictEqual(s['outline-width'], '2px',
        'G-10: ...two pixels, the shipped precedent verbatim. It computed "' +
        s['outline-width'] + '"');
    });

    // ---- HELD OUT 1: the answer row wraps -------------------------------
    await runCase('heldout-1-answer-row-wraps', async function () {
      await paintThree();
      // the declared guarantee first — the shipped one is declared BY ID on
      // two elements and reaches neither of these rows, which is exactly why
      // this check is held out.
      const idScoped = /#reaction-bar,\s*\n#spread-ribbon\s*\{\s*\n\s*flex-wrap: wrap;/;
      assert.strictEqual(idScoped.test(tokensClean), true,
        'the shipped wrap really is declared BY ID on #reaction-bar and ' +
        '#spread-ribbon — without that fact this whole case has no reason ' +
        'to exist');
      const s = await styleOf('.offer-answers', ['flex-wrap', 'display']);
      assert.strictEqual(s.display, 'flex',
        'the answer row is a flex row');
      assert.strictEqual(s['flex-wrap'], 'wrap',
        'G-3f: each picture\'s answer row must declare its OWN wrap. The ' +
        'shipped guarantee is id-scoped and does not reach a new row, so a ' +
        'narrow window would crowd or clip the row at the moment she reaches ' +
        'for the never-show control. It computed "' + s['flex-wrap'] + '"');

      function tops() {
        return ev('(function(){var r=document.querySelector(".offer-answers");' +
          'var out=[];[".offer-bless",".offer-never",".offer-notrel"]' +
          '.forEach(function(sel){var e=r.querySelector(sel);' +
          'out.push(e?Math.round(e.getBoundingClientRect().top):null);});' +
          'return out;})()');
      }

      await stageWidth(1600);
      const wide = await tops();
      assert.strictEqual(wide.indexOf(null), -1,
        'all three controls must be on the page before anything is measured');
      assert.strictEqual(new Set(wide).size, 1,
        'at a generous width the three controls sit on ONE line. Measured ' +
        'tops: ' + JSON.stringify(wide) + ' — if they already wrap here the ' +
        'narrow measurement below proves nothing');

      await stageWidth(200);
      const narrow = await tops();
      assert.ok(new Set(narrow).size > 1,
        'G-3f: at a width where the controls can no longer share a line the ' +
        'row REACHES A NEW ROW. Nothing shrinks and no label is clipped — ' +
        'it simply wraps. Measured tops at 200px: ' + JSON.stringify(narrow));

      // nothing is clipped: every control still renders its whole label.
      const clipped = await ev('(function(){var out=[];' +
        'document.querySelectorAll(".offer-answers button").forEach(' +
        'function(b){if(b.scrollWidth>b.clientWidth+1){out.push(' +
        'b.className+":"+b.scrollWidth+">"+b.clientWidth);}});return out;})()');
      assert.deepStrictEqual(clipped, [],
        'G-3f: no label is clipped at the narrow width. Clipped: ' +
        clipped.join(' | '));

      // THE CONTROL — the same measurement against a clone forced to
      // nowrap. If the clone does not stay on one line the measurement is
      // not sensitive to wrapping and the assertion above means nothing.
      const cloneTops = await ev('(function(){' +
        'var r=document.querySelector(".offer-answers");' +
        'var c=r.cloneNode(true);c.className="offer-answers harness-clone";' +
        'c.style.flexWrap="nowrap";r.parentNode.appendChild(c);' +
        'var out=[];[".offer-bless",".offer-never",".offer-notrel"]' +
        '.forEach(function(sel){var e=c.querySelector(sel);' +
        'out.push(e?Math.round(e.getBoundingClientRect().top):null);});' +
        'c.parentNode.removeChild(c);return out;})()');
      assert.strictEqual(new Set(cloneTops).size, 1,
        'CONTROL: a clone of the same row forced to nowrap must stay on ONE ' +
        'line at the same width. It measured ' + JSON.stringify(cloneTops) +
        ' — if it also wrapped, the assertion above is reading something ' +
        'other than the wrap');
      await stageWidth(1600);
    });

    // ---- HELD OUT 2: the caption wraps and never truncates ---------------
    await runCase('heldout-2-caption-wraps-never-truncates', async function () {
      await paintThree();

      function capProbe() {
        return ev('(function(){var e=document.getElementById(' +
          '"offer-caption");var s=getComputedStyle(e);return {' +
          'textOverflow:s.getPropertyValue("text-overflow"),' +
          'whiteSpace:s.getPropertyValue("white-space"),' +
          'overflowWrap:s.getPropertyValue("overflow-wrap"),' +
          'scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,' +
          'height:Math.round(e.getBoundingClientRect().height),' +
          'text:e.textContent};})()');
      }

      // the one-line height, measured rather than assumed, so the narrow
      // measurement below can say "more than one line" as a fact about this
      // page's own metrics instead of as a guess about a font.
      await stageWidth(1600);
      const oneLine = await capProbe();
      await stageWidth(140);
      const cap = await capProbe();
      assert.notStrictEqual(cap.textOverflow, 'ellipsis',
        'the caption must never truncate — truncating the line that ' +
        'explains a proposal leaves the proposal unexplained. text-overflow ' +
        'computed "' + cap.textOverflow + '"');
      assert.strictEqual(/nowrap|\bpre\b/.test(cap.whiteSpace), false,
        'the caption must WRAP. white-space computed "' + cap.whiteSpace + '"');
      assert.ok(cap.scrollWidth <= cap.clientWidth + 1,
        'the caption fits its column rather than running past it: ' +
        'scrollWidth ' + cap.scrollWidth + ' vs clientWidth ' +
        cap.clientWidth);
      assert.ok(cap.height > oneLine.height,
        'at this width the caption really did take more than one line (' +
        cap.height + 'px against ' + oneLine.height + 'px at a generous ' +
        'width) — if it still fitted on one, this case measured a wrap that ' +
        'never had to happen');

      // THE CONTROL — the shipped #spread-title genuinely DOES truncate, and
      // the same three measurements must say so. A real element with the
      // opposite property is a stronger control than a synthetic one.
      const ctl = await ev('(function(){var e=document.getElementById(' +
        '"spread-title");e.textContent="a very long machine name that has ' +
        'no business being read by anybody at all";e.style.width="120px";' +
        'e.style.display="block";var s=getComputedStyle(e);var out={' +
        'textOverflow:s.getPropertyValue("text-overflow"),' +
        'whiteSpace:s.getPropertyValue("white-space"),' +
        'scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};' +
        'e.textContent="";e.style.width="";e.style.display="";return out;})()');
      assert.strictEqual(ctl.textOverflow, 'ellipsis',
        'CONTROL: the shipped title slot DOES truncate, and this probe must ' +
        'be able to see it. It read "' + ctl.textOverflow + '"');
      assert.ok(ctl.scrollWidth > ctl.clientWidth,
        'CONTROL: ...and its content really does overrun its box (' +
        ctl.scrollWidth + ' vs ' + ctl.clientWidth + '). If it did not, the ' +
        'scrollWidth half of the assertion above proves nothing');
      await stageWidth(1600);
    });

    // ---- HELD OUT 3: the acknowledgement leaves no residue ---------------
    await runCase('heldout-3-acknowledgement-leaves-no-residue',
      async function () {
        await paintThree();
        await ev('window.__OFFER.setApiPost({ok:true,data:{}})');

        // COUNTS FIRST, BY VALUE, BEFORE ANY TEXT IS READ.
        /* ⚖️ RE-AIMED 2026-08-16 (UAT F-2, hers). It read three rows, nine
           controls and three note slots, and compared the two untouched rows
           node for node — the "resolves in place, nothing else moves" claim
           of the three-picture page. One picture fills the window now, so
           "nothing else moves" becomes something stronger and more direct:
           THE PICTURE ITSELF DOES NOT MOVE. `not relevant` is the one answer
           that HOLDS the page (her ruling), because its line carries C-7's
           reassurance and every other answer would replace it with the next
           picture. So the residue claim is unchanged and its neighbours are
           now the beat's own before/after. */
        /* ⚖️ AMENDED 2026-08-16 (UAT F-12, hers): THE OFFER PAGE IS NOW TWO
           CONTAINERS. The picture stays in the scroll region and the answer
           row is seated in the pinned ribbon, so a residue claim that read
           only the content region would stop seeing the very nodes it
           exists to count — and would go GREEN by looking away. Every count
           below therefore spans BOTH, and the picture is still read from
           the region that holds it. */
        const before = await ev('(function(){var h=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.bar);var rows=b.querySelectorAll(' +
          '".offer-answers");var im=h.querySelector("img");' +
          'return {all:h.querySelectorAll("*").length+' +
          'b.querySelectorAll("*").length,' +
          'rows:rows.length,buttons:b.querySelectorAll("button").length,' +
          'notes:b.querySelectorAll(".offer-answer-note").length,' +
          'src:im?im.getAttribute("src"):null};})()');
        assert.strictEqual(before.rows, 1, 'one row before the tap');
        assert.strictEqual(before.buttons, 3,
          'three controls before the tap — asserted by value so a missing ' +
          'control cannot hide in a delta');
        assert.strictEqual(before.notes, 1, 'one note slot before the tap');
        assert.ok(before.src, 'a picture is on screen before the tap');

        await ev('(function(){document.querySelector(".offer-answers")' +
          '.querySelector(".offer-notrel").click();return true;})()');
        // let the resolved promise settle; the fake transport resolves on the
        // microtask queue, so one turn is enough and no delay is used.
        await ev('new Promise(function(r){setTimeout(r,0);})');

        const after = await ev('(function(){var h=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.bar);var rows=b.querySelectorAll(' +
          '".offer-answers");var note=rows[0].querySelector(' +
          '".offer-answer-note");return {all:h.querySelectorAll("*").length+' +
          'b.querySelectorAll("*").length,' +
          'rows:rows.length,buttons:b.querySelectorAll("button").length,' +
          'noteKids:note.children.length,' +
          'noteButtons:note.querySelectorAll("button").length,' +
          'noteHtml:note.innerHTML,' +
          'timerish:note.querySelectorAll("[data-timeout],[data-countdown],' +
          '[data-undo],[data-expires]").length,' +
          'src:(function(){var i=h.querySelector("img");' +
          'return i?i.getAttribute("src"):null;})(),' +
          'errors:h.querySelectorAll(".quiet-error").length+' +
          'b.querySelectorAll(".quiet-error").length};})()');

        assert.strictEqual(after.rows, 1,
          'the page still holds its one row — the answered picture resolves ' +
          'IN PLACE');
        assert.strictEqual(after.src, before.src,
          'F-2 (hers): THE PICTURE HAS NOT MOVED. `not relevant` is the one ' +
          'answer that holds the page, because its line is where C-7\'s ' +
          'reassurance lives and the next picture arriving would take it ' +
          'away unread');
        /* ⚖️ AMENDED BY HER, 2026-08-17/18: "yes we need to undo button for
           this". The acknowledgement now carries TWO controls — the way back
           and the way on. ⛔ The clock half of OD-3 is UNMOVED and is asserted
           three lines down; what she refused was an undo on a TIMER, and a
           button is not a clock. */
        assert.strictEqual(after.buttons, 2,
          'the answered row\'s three controls are gone, and exactly TWO are ' +
          'left: the way back and the way on. Counted ' + after.buttons);
        assert.strictEqual(after.noteKids, 2,
          'TWO nodes land in that picture\'s note slot — the line, and the ' +
          'row holding both quiet doors. Counted ' + after.noteKids);
        assert.strictEqual(after.noteButtons, 2,
          'G-3d as amended twice (F-2, then her undo ruling): the ' +
          'acknowledgement carries the way back AND the way on. ⛔ The ' +
          'handbook paragraph she rewrote herself now tells her she can undo ' +
          'it straight away — a surface that does not offer it makes her own ' +
          'sentence false');
        assert.strictEqual(after.timerish, 0,
          'G-3d: ...and nothing on it is on a clock. A decision with a ' +
          'deadline attached is what OD-3 refused, and the way on is the ' +
          'control INSTEAD of a timer, never as well as one');
        assert.strictEqual(after.errors, 0,
          'a saved answer says nothing about errors');

        // only now is any text read.
        const said = await ev('window.__OFFER.OFFER_COPY.notRelevantSaid');
        assert.ok(after.noteHtml.indexOf(said) !== -1,
          'the one beat says what the shipped constant says — PROVISIONAL ' +
          'copy, 26.95-COPY.md candidate C-7 (the UI-SPEC numbers it C-8; ' +
          'the register carries the map). copy_approved is false and the ' +
          'wording is the owner\'s, in ONE pass. Pinned BY KEY here so no ' +
          'agent can reword it and no rename can pass');
        assert.ok(after.noteHtml.indexOf('font-size:14px') !== -1 &&
          after.noteHtml.indexOf('var(--ink-soft)') !== -1,
          'and it lands in the shipped 14px / quiet-ink meta register, ' +
          'never the accent');

        // and it settles there: a second turn changes nothing.
        await ev('new Promise(function(r){setTimeout(r,0);})');
        const settled = await ev('(function(){var h=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
          'window.__OFFER.SPREAD_IDS.bar);return {all:' +
          'h.querySelectorAll("*").length+b.querySelectorAll("*").length,' +
          'buttons:b.querySelectorAll("button").length};})()');
        assert.strictEqual(settled.all, after.all,
          'after the page settles nothing further appeared or disappeared');
        assert.strictEqual(settled.buttons, after.buttons,
          'and no control came back');
        await ev('window.__OFFER.setApiPost({ok:false})');
      });

    // ---- HELD OUT 4: a picture whose file cannot be fetched --------------
    await runCase('heldout-4-missing-picture-file', async function () {
      await paintThree();
      // A picture load is asynchronous, so the shape is read only once every
      // element has SETTLED — a fact polled off the page, never a delay.
      const settled = await ev('new Promise(function(res){var n=0;' +
        '(function tick(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var im=h.querySelectorAll("img");' +
        'var all=im.length>0;for(var i=0;i<im.length;i++){' +
        'if(!im[i].complete){all=false;}}' +
        'if(all){res(true);}else if(n>100){res(false);}' +
        'else{n++;setTimeout(tick,20);}})();})');
      assert.strictEqual(settled, true,
        'every picture element must reach a settled state before its shape ' +
        'is read — an unsettled element would let this case report whatever ' +
        'the browser happened to be doing');
      // every picture on this page points at a library path that does not
      // resolve here, so all three are the missing-file shape at once — and
      // the page must still render all three rows regardless.
      /* ⚖️ AMENDED 2026-08-16 (UAT F-12, hers): the row is read from the
         ribbon it is seated in. The claim this case exists for is that a
         photograph whose file has gone is STILL ANSWERABLE, so the row must
         be counted where the room actually puts it — counting it where it
         used to be would answer "no row" and call the page broken, or
         worse, be quietly relaxed until it passed. */
      const shape = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.bar);var imgs=h.querySelectorAll("img");' +
        'var broken=0;for(var i=0;i<imgs.length;i++){' +
        'if(imgs[i].complete && imgs[i].naturalWidth===0){broken++;}}' +
        'return {imgs:imgs.length,broken:broken,' +
        'rows:b.querySelectorAll(".offer-answers").length,' +
        'text:h.textContent+b.textContent,' +
        'errors:h.querySelectorAll(".quiet-error").length+' +
        'b.querySelectorAll(".quiet-error").length};})()');
      // ⚖️ AMENDED 2026-08-16 (F-2): ONE picture is on the page now, so the
      // "and the page carries on" claim below is about the picture SHOWING
      // rather than about its neighbours. The measurement it exists for —
      // that the painter's plain <img> makes a missing file a BROKEN
      // ELEMENT rather than the desk pass's quiet line — is unchanged.
      assert.strictEqual(shape.imgs, 1, 'one picture element was painted');
      assert.strictEqual(shape.broken, 1,
        'MEASURED, NOT GUESSED: the Offer\'s painter emits a plain <img> and ' +
        'never fetches the file itself, so a picture whose file cannot be ' +
        'read is a BROKEN IMG ELEMENT — not the shipped quiet line. That ' +
        'line lives in the desk pass, which the Offer does not use. This is ' +
        'the one real gap the UI-SPEC named, and it is now a measurement');
      assert.strictEqual(shape.rows, 1,
        'and the page carries on: the picture that cannot be read still ' +
        'renders WITH ITS ANSWER ROW, so a photograph whose file has gone ' +
        'is still answerable and the Offer does not dead-end on it');
      assert.strictEqual(shape.errors, 0,
        'a picture that cannot be opened is not an error she needs to hear ' +
        'about (D-09 fail-open)');
      // NO SECOND EMPTY-STATE STRING IS WRITTEN. The shipped quiet line is
      // the room's one sentence for this; the Offer must not invent another.
      const painter = stripComments(region('paintOfferPage'));
      assert.strictEqual(hits(painter, /fetch\(/g), 0,
        'the painter issues no request of its own — which is WHY the shape ' +
        'above is a broken element rather than the quiet line');
      assert.strictEqual(hits(painter, /could not be/gi), 0,
        'and it writes no empty-state sentence of its own. A second string ' +
        'for the same fact is a second claim about the same thing');
      /* THE POSITIVE HALF — and it is REGION-SCOPED to the pass that owns
         the line, not a file-wide count. Two reasons, both measured: the
         same sentence legitimately appears in `fillProposalPieces` too, so
         a file-wide count was never going to be 1; and a file-wide count
         over RAW text would be satisfied by a comment quoting it. Scoped
         and stripped, this says the thing it means — the desk pass really
         does still say it, in code. */
      const quiet = 'this one could not be opened.';
      const deskPass = stripComments(region('deskSpreadPresent'),
        'deskSpreadPresent');
      assert.notStrictEqual(deskPass.indexOf(quiet), -1,
        'the shipped quiet line still exists IN CODE in the desk pass — the ' +
        'positive half, without which the negative scan above has no ' +
        'subject. The Offer reuses this pass for nothing, which is why the ' +
        'shape it shows is a broken element instead');
      assert.strictEqual(shape.text.indexOf(quiet), -1,
        'and it is not on the Offer page, because the Offer never reaches ' +
        'the pass that says it');
    });

    // ---- HELD OUT 5: one Offer, two doors, live --------------------------
    await runCase('heldout-5-one-offer-two-doors', async function () {
      await ev('window.__OFFER.resetReach()');
      await ev('window.__OFFER.setApiGet({ok:false})');
      await ev('window.__OFFER.setApiPost({ok:false})');
      await ev('window.__OFFER.calls.apiGet.length=0');
      await ev('window.__OFFER.calls.apiPost.length=0');

      // the first door OPENS the Offer through the shipped chassis entry.
      const opened = await ev('(function(){' +
        'return window.__OFFER.openOfferPage({ids:' +
        JSON.stringify(FIXTURE_IDS) + ',facet:{fortnight:5},seed_id:"seed"},' +
        '"desk");})()');
      assert.strictEqual(opened, true,
        'the first door opens the visit\'s Offer');
      // ⚖️ AMENDED 2026-08-16 (UAT F-12, hers): the row is counted in the
      // ribbon it is seated in; the caption stays in the scroll region.
      const one = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.bar);return {caps:' +
        'h.querySelectorAll(".offer-caption").length,rows:' +
        'b.querySelectorAll(".offer-answers").length,openSpread:' +
        'window.__OFFER.calls.openSpread.length};})()');
      assert.strictEqual(one.caps, 1, 'one page, one caption');
      // ⚖️ AMENDED 2026-08-16 (F-2): one picture fills the window.
      assert.strictEqual(one.rows, 1, 'one page, one picture, one row');
      assert.strictEqual(one.openSpread, 1,
        'the Offer is hosted by the shipped chassis exactly once — the ' +
        'chassis is re-hosted, never re-implemented (D-08)');

      // the visit's Offer is now spent — the assignment reachDoorRead makes,
      // mirrored here and pinned in harness-seam-pins.
      await ev('window.__OFFER.REACH.spent = true');
      await ev('window.__OFFER.calls.apiGet.length=0');

      const quietCalls = await ev('(function(){window.__QUIET=0;' +
        'window.__OFFER.reachDoorOpen("album",function(){window.__QUIET++;});' +
        'return true;})()');
      assert.strictEqual(quietCalls, true, 'the second door was touched');
      await ev('new Promise(function(r){setTimeout(r,0);})');

      const second = await ev('(function(){var h=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.content);var b=document.getElementById(' +
        'window.__OFFER.SPREAD_IDS.bar);return {caps:' +
        'h.querySelectorAll(".offer-caption").length,rows:' +
        'b.querySelectorAll(".offer-answers").length,' +
        'gets:window.__OFFER.calls.apiGet.length,' +
        'posts:window.__OFFER.calls.apiPost.length,' +
        'openSpread:window.__OFFER.calls.openSpread.length,' +
        'errors:document.querySelectorAll(".quiet-error").length,' +
        'quiet:window.__QUIET};})()');
      assert.strictEqual(second.caps, 1,
        'G-8: touching a SECOND door in one visit produces ONE Offer, not ' +
        'two. Captions on the page: ' + second.caps);
      assert.strictEqual(second.rows, 1,
        'G-8: ...and the page she is already looking at is untouched — one ' +
        'picture, one row, the same one (F-2)');
      assert.strictEqual(second.openSpread, 1,
        'G-8: ...and the chassis was not asked to host a second one');
      assert.strictEqual(second.gets, 0,
        'G-8: a second door finds the Offer spent and returns BEFORE any ' +
        'request is issued, so it records nothing and shows nothing. It ' +
        'issued ' + second.gets);
      assert.strictEqual(second.posts, 0,
        'G-8: ...and posts nothing either');
      assert.strictEqual(second.errors, 0,
        'G-8: ...and no error surface appeared. An offer that was already ' +
        'made is not a failure she needs to hear about');
      assert.strictEqual(second.quiet, 0,
        'the spent guard returns without even taking the door\'s quiet ' +
        'branch — the branch is for a door that reached and found nothing');

      // THE CONTROL — with the Offer unspent, the SAME call does proceed.
      // Without this the case above passes just as happily against a door
      // that never worked at all.
      await ev('window.__OFFER.REACH.spent = false');
      await ev('window.__OFFER.calls.apiGet.length=0');
      await ev('(function(){window.__QUIET=0;' +
        'window.__OFFER.reachDoorOpen("album",function(){window.__QUIET++;});' +
        'return true;})()');
      await ev('new Promise(function(r){setTimeout(r,0);})');
      const control = await ev('(function(){return {gets:' +
        'window.__OFFER.calls.apiGet.length,quiet:window.__QUIET};})()');
      assert.ok(control.gets > 0,
        'CONTROL: with the visit\'s Offer UNSPENT the same door does reach ' +
        'for one. It issued ' + control.gets + ' reads — if this is zero the ' +
        'assertion above proved only that the door is dead');
      assert.strictEqual(control.quiet, 1,
        'CONTROL: ...and a read that comes back empty resolves to the ' +
        'door\'s own quiet branch, exactly once');
      await ev('window.__OFFER.resetReach()');
    });

    /* ---- F-3: the room comes back on the LAST answer ----------------------
       UAT finding F-3, in her words: «after I selected everything I feel
       joyful or not there is no further guidance in this UI so I won't know
       if I am done or not». Her ruling, 2026-08-16: the room comes back by
       itself when the last picture is answered.

       ⚠ DRIVEN THROUGH REAL CLICKS ON THE PAINTED PAGE, never by calling the
       ending directly. The claim is about what happens when SHE answers, and
       a case that calls reachEndIfDone() would prove only that the function
       runs when it is run.

       ⚠ AND THE NEGATIVE HALF IS THE LOAD-BEARING ONE. "It closes when all
       three are answered" is satisfied by a room that closes on every answer,
       which is a different and much worse room. Every intermediate answer is
       asserted at ZERO pops before the last is asserted at one. */
    await runCase('f3-the-room-comes-back-on-the-last-answer',
      async function () {
        await paintThree();
        await ev('window.__OFFER.setApiPost({ok:true,data:{}})');
        await ev('(function(){window.__OFFER.calls.popView.length=0;' +
          'window.__OFFER.seen.popView=0;return true;})()');

        /* the quiet link is the one answer this harness can drive end to end
           by itself: the verdict path deliberately stands in as a recorder
           (handleBlessingTap is REPLACED), so it never reaches the resolve.
           ⚖️ RE-AIMED 2026-08-16 (F-2): the three answers used to land on
           three rows painted at once. One picture fills the window, so each
           answer is given to WHATEVER IS SHOWING — which is the real
           sequence she performs — and `not relevant` holds the beat, so the
           way on is what brings the next picture. Both halves of her ruling
           are therefore on the same path here. */
        async function answerShowing() {
          await ev('(function(){document.querySelector(".offer-answers")' +
            '.querySelector(".offer-notrel").click();return true;})()');
          await ev('new Promise(function(r){setTimeout(r,0);})');
          const held = await ev('(function(){return {pops:' +
            'window.__OFFER.seen.popView,' +
            'goOn:document.querySelectorAll(".offer-goon").length};})()');
          assert.strictEqual(held.goOn, 1,
            'F-2 (hers): `not relevant` holds the page and offers exactly ' +
            'one way on');
          assert.strictEqual(held.pops, expectedPops,
            'F-2: ...and the room does not come back while that line is ' +
            'still being held');
          await ev('(function(){document.querySelector(".offer-goon")' +
            '.click();return true;})()');
          return ev('(function(){return {pops:window.__OFFER.seen.popView,' +
            'done:window.__OFFER.reachAllAnswered()};})()');
        }
        let expectedPops = 0;

        const first = await answerShowing();
        assert.strictEqual(first.done, false, 'one of three is not finished');
        assert.strictEqual(first.pops, 0,
          'the room does NOT come back after the first answer — an ending ' +
          'that fires on every answer is not an ending');
        const second = await answerShowing();
        assert.strictEqual(second.done, false, 'two of three is not finished');
        assert.strictEqual(second.pops, 0,
          'nor after the second');

        const last = await answerShowing();
        assert.strictEqual(last.done, true, 'all three are answered');
        assert.strictEqual(last.pops, 1,
          'the room comes back on the last answer — ONCE, through the ' +
          'shipped pop (her ruling, 2026-08-16). Counted ' + last.pops);

        // ...and it popped the OFFER, not whatever happened to be open.
        expectedPops = 1;
        const popped = await ev('window.__OFFER.calls.popView[0]');
        assert.strictEqual(popped.offerPage, true,
          'the thing it closed is the Offer page itself');

        /* THE GUARD, DRIVEN: with something else on top of the view stack the
           same finished Offer closes NOTHING. Without this the ending would
           be a function that pops an arbitrary view from a resolve that
           happened underneath it. */
        await ev("window.__OFFER.setViewTop({view:'reader',id:'x'})");
        const guarded = await ev('(function(){var n=' +
          'window.__OFFER.seen.popView;window.__OFFER.reachEndIfDone();' +
          'return window.__OFFER.seen.popView-n;})()');
        assert.strictEqual(guarded, 0,
          'a finished Offer that is not the thing on top closes nothing');

        /* ...and the owner\'s EXCEPTION: a held why owns the ending. Set the
           hold by hand — the walk\'s own path is driven by
           tests/test_session_flow.cjs, and what is asserted here is only that
           the ending reads the hold. */
        await ev("window.__OFFER.setViewTop({view:'spread',id:'a'," +
          'offerPage:true})');
        const held = await ev('(function(){window.__OFFER.WHY.heldId=' +
          "'a';var n=window.__OFFER.seen.popView;" +
          'window.__OFFER.reachEndIfDone();var d=window.__OFFER.seen.popView' +
          '-n;window.__OFFER.WHY.heldId=null;return d;})()');
        assert.strictEqual(held, 0,
          'a held why owns the ending until it lets go — closing over the ' +
          'question the room just asked is the regression her exception ' +
          'exists to prevent (map #50 / #99)');
        // CONTROL: with the hold released the very same call does close, so
        // the zero above is caused by the hold and not by an exhausted state.
        const released = await ev('(function(){var n=' +
          'window.__OFFER.seen.popView;window.__OFFER.reachEndIfDone();' +
          'return window.__OFFER.seen.popView-n;})()');
        assert.strictEqual(released, 1,
          'CONTROL: released, the same finished Offer closes');

        await ev('window.__OFFER.resetReach()');
      });


    /* ---- F-8: a door that would open nothing SHOWS it ---------------------
       Her words at the UAT: «after I pressed the stack of paper nothing
       happened». The room was silent in three situations and all three read
       as a broken button. She ruled the door LOOKS SPENT AND STAYS PUT —
       faded and not tappable — so the state is visible BEFORE she reaches
       for it. ⛔ No words anywhere in it: D-09 forbids empty-state copy, and
       this is why none was needed.

       ⚠ DRIVEN AS COMPUTED STYLE ON A LIVE ELEMENT, never read off the CSS
       file. The claim is that the treatment REACHES THE SCREEN; a rule that
       exists in tokens.css and is overridden by anything later would satisfy
       a file read and fail her. Both halves are asserted — the look and the
       fact that a pointer cannot reach it — plus `disabled`, which is what a
       keyboard and a screen reader actually go by and which no opacity
       carries. */
    await runCase('f8-a-spent-door-shows-it', async function () {
      const live = await ev('(function(){var b=document.createElement(' +
        '"button");b.type="button";b.id="harness-door";' +
        'b.className="station-fixture";b.textContent="a stack of papers";' +
        'document.body.appendChild(b);var c=getComputedStyle(b);' +
        'return {opacity:c.opacity,pointer:c.pointerEvents,' +
        'disabled:b.disabled};})()');
      assert.strictEqual(live.disabled, false,
        'CONTROL: a door that CAN open something is a live control');
      assert.notStrictEqual(live.opacity, '0.45',
        'CONTROL: ...and is not already wearing the spent look, or the ' +
        'assertion below would pass without the treatment doing anything');
      assert.strictEqual(live.pointer, 'auto',
        'CONTROL: ...and a pointer reaches it');

      const spent = await ev('(function(){var b=document.getElementById(' +
        '"harness-door");window.__OFFER.markDoorSpent(b);' +
        'var c=getComputedStyle(b);return {opacity:c.opacity,' +
        'pointer:c.pointerEvents,disabled:b.disabled,' +
        'display:c.display,visibility:c.visibility,' +
        'text:b.textContent};})()');
      assert.strictEqual(spent.opacity, '0.45',
        'F-8: a spent door wears the shipped disabled opacity — the ' +
        '.btn:disabled value reused, never a second spelling of it');
      assert.strictEqual(spent.pointer, 'none',
        'F-8: ...and a pointer cannot reach it, so the tap that produced ' +
        'her complaint cannot happen');
      assert.strictEqual(spent.disabled, true,
        'F-8: ...and it is genuinely disabled, which is what a keyboard and ' +
        'a screen reader go by. An opacity is not an announcement');
      assert.notStrictEqual(spent.display, 'none',
        'F-8 (hers): DISABLED, NOT HIDDEN. She ruled the papers STAY PUT — ' +
        'furniture vanishing off the desk mid-visit was the option she did ' +
        'not take');
      assert.notStrictEqual(spent.visibility, 'hidden',
        'F-8: ...by visibility either');
      assert.strictEqual(spent.text, 'a stack of papers',
        'F-8: ⛔ AND NOTHING IS SAID. D-09 forbids empty-state copy outright ' +
        'and the label is untouched — the door shows its state, it does not ' +
        'announce it');
      await ev('(function(){var b=document.getElementById("harness-door");' +
        'if(b){b.parentNode.removeChild(b);}return true;})()');
    });

    // ---- P-8 live: painting the album spends nothing --------------------
    await runCase('p8-paint-spends-nothing', async function () {
      await ev('window.__OFFER.resetReach()');
      await ev('window.__OFFER.calls.apiGet.length=0');
      await ev('window.__OFFER.calls.apiPost.length=0');
      const painted = await ev('(function(){' +
        'window.__OFFER.paintAlbumSpread(document.getElementById(' +
        '"album-stage"),[],true);var p=document.getElementById("album-pile");' +
        'return {pile:!!p,label:p?p.textContent:null,' +
        'aria:p?p.getAttribute("aria-label"):null,' +
        'spent:window.__OFFER.REACH.spent,' +
        'gets:window.__OFFER.calls.apiGet.length,' +
        'posts:window.__OFFER.calls.apiPost.length,' +
        'fetches:window.__OFFER.calls.fetch.length};})()');
      assert.strictEqual(painted.pile, true,
        'the pile renders when the probe says there is something to offer');
      assert.strictEqual(painted.spent, false,
        'P-8, LIVE: painting the album scene must NOT spend the visit\'s ' +
        'Offer. A scene that merely painted has computed nothing and spent ' +
        'nothing, and the Offer is still hers when she taps. The static half ' +
        'of this probe was written by plan 26.95-32; this is the half a ' +
        'source read cannot take');
      assert.strictEqual(painted.gets, 0,
        'P-8, LIVE: ...and it issues no read');
      assert.strictEqual(painted.posts, 0,
        'P-8, LIVE: ...and no write');
      assert.strictEqual(painted.fetches, 0,
        'P-8, LIVE: ...and reaches no model and no network at all. Deriving ' +
        'the real Offer here would be a pull-only violation wearing a ' +
        'presence rule');
      const label = await ev('window.__OFFER.OFFER_COPY.albumPile');
      assert.strictEqual(painted.label, label,
        'the door\'s visible label is the one constant — PROVISIONAL copy, ' +
        '26.95-COPY.md candidate C-5, copy_approved: false. Pinned BY KEY ' +
        'so a rename cannot pass and no agent rewords it');
      assert.strictEqual(painted.aria, label,
        'ONE expression feeds both the label and the aria-label, so a ' +
        'screen reader and the screen can never make different claims about ' +
        'the same door (OD-6)');
      assert.strictEqual(/\d/.test(String(painted.label)), false,
        'law 3: no count reaches this door. Under the Offer it names a few ' +
        'chosen things, never a quantity still waiting');
    });

    // ---- G-2: the pile is ALWAYS THERE, and always shows its line -------
    //
    // ⚖️ RE-AIMED 2026-08-23 BY OWNER RULING (UAT session 2, Beat 9 → A).
    // ⛔ A PIN IS NEVER MOVED TO MAKE A SUITE GREEN. This one is moved because
    // the room's contract changed by ruling, and the ruling is quoted here so a
    // later reader checks the move instead of trusting it:
    //
    //   "A. Always shows its line. The album always says 'something from a
    //    while back, if you'd like.' — the sentence you picked tonight.
    //    Sometimes you tap it and there's nothing, so that sentence would
    //    sometimes be a lie."
    //
    // ⚠ SHE WAS TOLD THE COST IN THOSE WORDS BEFORE SHE CHOSE, including that
    // it sits against the principle she herself applied to the desk stack's
    // name ninety minutes earlier (C-12, which may not promise there IS
    // something). ⛔ "It is not a misunderstanding and no agent may reverse it."
    //
    // ⚠ SO THIS CASE NOW ASSERTS THE OPPOSITE OF WHAT IT USED TO, and what it
    // gave up is named rather than dropped: the OLD property was G-2/D-09's
    // "absent, never present-but-inert" plus G-1's "the quiet path says
    // NOTHING". The quiet path now says her one line. What survives untouched
    // is that NOTHING ELSE is added on an empty day — no empty-state copy, no
    // placeholder, no "if you prefer", and no count.
    await runCase('g2-pile-always-shows-its-line', async function () {
      const quiet = await ev('(function(){' +
        'window.__OFFER.paintAlbumSpread(document.getElementById(' +
        '"album-stage"),[],false);var scene=document.getElementById(' +
        '"album-stage");var p=document.getElementById("album-pile");' +
        'return {pile:!!p,label:p?p.textContent:null,' +
        'aria:p?p.getAttribute("aria-label"):null,' +
        'kids:scene.children.length,text:scene.textContent};})()');
      assert.strictEqual(quiet.pile, true,
        'Beat 9 → A: the album door is present on a visit with nothing ' +
        'behind it. The guessing stops; the album is constant');
      assert.strictEqual(quiet.label, quiet.aria,
        'OD-6 still holds on the quiet path: one expression feeds both, so a ' +
        'screen reader and the screen cannot make different claims');
      assert.ok(quiet.label && quiet.label.length > 0,
        'and it shows HER line — the album is not present-but-nameless, ' +
        'which was option B and is not what she chose');
      assert.ok(!/[0-9]/.test(quiet.label),
        'law 3 survives the ruling: her line carries no count. It is the ' +
        'one thing Beat 9 did NOT move. The label read: "' + quiet.label + '"');
      assert.strictEqual(quiet.text, quiet.label,
        'G-1, NARROWED not dropped: the quiet path says her line AND NOTHING ' +
        'ELSE. No empty-state copy, no placeholder, no "if you prefer". The ' +
        'scene read: "' + quiet.text + '"');
      assert.strictEqual(quiet.kids, 1,
        'and it leaves exactly one node — the door itself. Counted ' +
        quiet.kids);
    });

    // ---- the row's wiring reaches the shipped handler --------------------
    await runCase('row-wiring-reaches-the-shipped-handler', async function () {
      await paintThree();
      await ev('window.__OFFER.calls.bless.length=0');
      /* ⚖️ RE-AIMED 2026-08-16 (F-2): the two taps used to land on two rows
         painted at once. One picture fills the window, so the page has to be
         ADVANCED between them — and the resolve that normally advances it
         cannot run here, because handleBlessingTap is a RECORDER in this
         harness and never comes back ok. So the advance is driven by hand
         between the taps, which is also what makes the claim sharper: the
         second control was built by a SECOND paint and still binds to its
         own picture, rather than to whatever the first paint happened to
         close over. */
      const rec = await ev('(function(){' +
        'document.querySelector(".offer-answers")' +
        '.querySelector(".offer-bless").click();' +
        'window.__OFFER.REACH.answered[' +
        JSON.stringify(FIXTURE_IDS[0]) + ']=true;' +
        'window.__OFFER.reachRepaint();' +
        'document.querySelector(".offer-answers")' +
        '.querySelector(".offer-never").click();' +
        'return window.__OFFER.calls.bless.slice();})()');
      assert.deepStrictEqual(rec, [
        { id: FIXTURE_IDS[0], verdict: 'safe' },
        { id: FIXTURE_IDS[1], verdict: 'never' }
      ], 'the two .btn answers call the SHIPPED verdict handler with this ' +
        'picture\'s own id — every control is a real button wired after one ' +
        'innerHTML build, and each row binds to its own picture rather than ' +
        'to a duplicated inner id. Recorded: ' + JSON.stringify(rec));
      const pending = await ev('window.__OFFER.REACH.pendingId');
      assert.strictEqual(pending, FIXTURE_IDS[1],
        'and the verdict in flight is stamped on the row that was tapped');
      // the replaced collaborators that a case DRIVES have each recorded a
      // call, so none of them is decoration.
      const driven = await ev('(function(){var s=window.__OFFER.seen;' +
        'return {apiGet:s.apiGet>0,apiPost:s.apiPost>0,' +
        'bless:s.bless>0,openSpread:s.openSpread>0,' +
        'room:Object.keys(window.__OFFER.ROOM.items).length>0,' +
        'shelf:Array.isArray(window.__OFFER.SHELF.filters),' +
        // 26.95-38 (F-3): the ending's two collaborators. Both are driven by
        // the f3 case above, which is what makes them collaborators rather
        // than decoration — and this roster is where that is stated.
        'currentView:s.currentView>0,popView:s.popView>0,' +
        'fetch:s.fetch};})()');
      assert.strictEqual(driven.fetch, 0,
        'NO REQUEST WAS ISSUED FROM THIS PAGE AT ANY POINT. The recorder ' +
        'that stands in for fetch never fired once');
      REPLACED_DRIVEN.forEach(function (name) {
        const key = name === 'ROOM' ? 'room' : (name === 'SHELF' ? 'shelf'
          : (name === 'handleBlessingTap' ? 'bless' : name));
        assert.strictEqual(driven[key], true,
          'the replaced collaborator "' + name + '" must actually be ' +
          'exercised by some case — a replacement nothing drives is ' +
          'decoration, and a decorative stub is how a scope goes green ' +
          'while the room throws');
      });
    });

  } finally {
    /* THE ARTIFACT ASSERTION HOLDS ON THE FAILURE PATH TOO (T-26.95-28).
       The result is RECORDED rather than thrown: a throw from a finally
       block replaces the original error, and an executor debugging a real
       failure would be handed a cleanup message instead of the failure. */
    await cdp.close(session);
    try {
      fs.rmSync(harness.dir, { recursive: true, force: true });
    } catch (e) { /* best effort; the check below judges it */ }
    if (fs.existsSync(harness.dir)) {
      failures.push('cleanup -> the harness temp tree survived the run. ' +
        'Nothing this suite writes may outlive it');
    }
  }

  // ---- counts printed as integers, then asserted BY VALUE -----------------
  console.log('OFFER-RENDER CASES ' + ran.length);
  assert.deepStrictEqual(ran, CASE_ROSTER,
    'the case ROSTER must match by name and by order — a count alone is ' +
    'satisfied by a rename, and a roster alone is satisfied by a case that ' +
    'registers and never runs. Ran: ' + JSON.stringify(ran));
  assert.strictEqual(ran.length, 24,
    'TWENTY-FOUR cases ran — a skipped case cannot hide behind a passing ' +
    'total. It was 20 until `comment-strip-is-real` was added, after G-6 ' +
    'went red on a comment on this suite\'s first real run, 21 until ' +
    'UAT finding F-3 gave the Offer an ending, and 23 until F-12 moved the ' +
    'answer row out of the scroller');
  assert.strictEqual(failures.length, 0,
    'failures (' + failures.length + '/' + ran.length + '):\n  ' +
    failures.join('\n  '));

  // ⚠ THE COUNT IS READ, NOT TYPED. A hand-typed total in the line that
  // reports success is a sentence that goes stale the moment a case is
  // added — this one shipped saying 21 while 22 ran, which is a suite
  // misreporting its own coverage in the one line anybody reads.
  console.log('OK test_offer_render.cjs — ' + ran.length + '/' + ran.length +
    ' cases: the five held-out ' +
    'UI-state checks (the answer row reaches a new row at a narrow width; ' +
    'the caption wraps and never truncates; the not-relevant beat leaves no ' +
    'residue; a picture whose file cannot be read is a broken element and ' +
    'the page carries on; a second door in one visit makes no second Offer ' +
    'and no error), plus the Offer\'s ending (the room comes back on the ' +
    'last answer and on no other), plus the live half of the presence probe ' +
    'and G-2, G-3c, G-3e, G-4, G-5, G-5b, G-6, G-7 and G-10 — read as ' +
    'computed styles and node counts off a live page, never off a file');
}

main().then(function () {
  process.exitCode = 0;
}, function (err) {
  console.error(String((err && err.stack) || err));
  process.exitCode = 1;
});
