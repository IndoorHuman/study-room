#!/usr/bin/env node
/*
 * replan_probe.cjs — the before/after measuring probe for phase 26.88's
 * corrective arc (plans 09-15).
 *
 * Every acceptance number in plans 10-14 is reproduced from this one command.
 * A wrong probe is a wrong phase, so what it measures and what it only
 * SIMULATES are kept strictly apart below.
 *
 * READ-ONLY, and that is a hard requirement rather than a courtesy (threat
 * T-26.88-03). It opens the item store and the per-item snapshots for READING
 * and nothing else. It never changes anything under the live library: no item
 * state moves, nothing is opened, nothing is blessed, no file is touched. It
 * holds no descriptor — `readFileSync` is its only path to disk. The
 * acceptance check in 26.88-09-PLAN.md counts the tokens that could break
 * that, over this whole file INCLUDING its comments, which is why the
 * paragraph you are reading says "it never changes anything" in prose rather
 * than naming the calls it does not make.
 *
 * ------------------------------------------------------------------------
 * THE DELETION CONTRACT — DISCHARGED. THIS FILE RE-DERIVES ZERO RULES.
 *
 * Every rule it once simulated has shipped, and each simulation was deleted
 * and re-pointed at `StudyCore` in the plan that shipped it. Nothing below is
 * this file's opinion about what the app does; every column is the app's own
 * behaviour judged by the app's own code.
 *
 *   D-15  guarded sentence-boundary paragraph breaks over a threshold.
 *         SHIPPED IN PLAN 13 (26.88-13). ITS SIMULATION IS GONE FROM THIS
 *         FILE — `CJK_END`, `ASCII_END`, `CLOSERS`, `PAIRS`, `EMPH`, `ABBR`,
 *         the local `openSpanAt` and the local `splitSentences` were all
 *         removed. The D-15 column below is now a DIFFERENCE BETWEEN TWO RUNS
 *         OF THE SHIPPED TRANSFORM, one with the rule disabled and one with it
 *         live, which is the only way to attribute a change to D-15 and to
 *         nothing else.
 *
 *         THE SECOND `openSpanAt` WENT WITH IT. That block carried its own
 *         D-15-flavoured copy over different rosters (`PAIRS` merged `![` and
 *         the curly quotes; `EMPH` was a shorter set) while plan 11 had
 *         already shipped `CORE.openSpanAt` over three named ones — two
 *         spellings of a shipped predicate, which is the F-1 drift in
 *         miniature. Plan 11 left it deliberately so the D-15 figures would
 *         not move mid-arc, and plan 13 closed it.
 *
 *         THE ONE THING THIS FILE STILL SUPPLIES IS THE THRESHOLD, and it
 *         supplies it TO THE SHIPPED TRANSFORM through
 *         `structureBody`'s `opts.sentenceBreakMin` measurement seam rather
 *         than to a copy of the rule. That seam exists because
 *         `root.StudyCore` is a VALUE COPY of core.js's closure vars, so
 *         assigning `CORE.SENTENCE_BREAK_MIN` from here would change nothing
 *         and `T=400` would silently print the `T=600` figures.
 *
 *   D-14  matched inline markup must survive the transform, per blank-line
 *         block. SHIPPED IN PLAN 12 (26.88-12). ITS SIMULATION IS GONE FROM
 *         THIS FILE — the `SYM`/`ASYM` rosters, the local `pairsOf` and the
 *         local `markupPreserved` were all removed, and both the counter and
 *         the residual-naming helper now read the SHIPPED
 *         `CORE.markupPreserved` / `CORE.markupPairs`. The count did not move
 *         (0 before the re-point, 0 after), which is the only evidence that
 *         the shipped rule and the reference this arc was measured against
 *         actually agree. Had they disagreed, the disagreement — not the
 *         number — would have been the finding.
 *
 *   D-13  a wholly-emphasis-wrapped line is a caption, and is hands-off.
 *         SHIPPED IN PLAN 11 (26.88-11). ITS SIMULATION IS GONE FROM THIS
 *         FILE — the `vm` sandbox, the patched copy of core.js, the source
 *         anchor and the probe's own caption regex were all removed, and the
 *         caption-only counter now reads the SHIPPED predicate
 *         `CORE.WHOLLY_EMPHASIZED_RE`. That deletion landed BEFORE plan 11
 *         quoted a single figure out of this file, and deliberately so: while
 *         the sandbox was here, "caption-only firers = 0" and "unbalanced
 *         marker headings <= 3" would both have been satisfied by the
 *         simulation's own regex before a line of core.js was written. A
 *         criterion that passes before the work measures nothing.
 *
 * The probe must never carry a second spelling of a shipped rule — that is
 * the one-rule-two-callers drift F-1 was, and the whole reason plan 09
 * exists. Plan 14's acceptance criterion is that this file ends the arc
 * carrying ZERO re-derived TRANSFORM RULES. It does.
 *
 * THE QUALIFICATION THIS HEADER CARRIED FOR FOUR PLANS IS NOW CLOSED (plan
 * 14). `freeProseBlocks` used to re-spell the D-07 ZONE SHAPES here to compute
 * the free-prose measure — a THIRD spelling, after core.js and after
 * `tools/pick_uat_notes.cjs`, and `.planning/WINDOWS.md` row 2. Plans 10-13
 * left it deliberately, because `e.free` is the denominator of every wall
 * figure they quote and moving the measure mid-arc would have moved numbers
 * for a reason having nothing to do with the rule under measurement. Plan 14
 * is where the arc's figures are stated, so it is the one wave in which
 * correcting the denominator costs nothing and hiding it would cost
 * everything. `maxFree` below now calls `CORE.handsOffSpans`. The stale
 * spelling never gained D-13's caption zone, so it counted an
 * emphasis-wrapped caption as free prose: 74 of the 384 notes measure
 * differently, and exactly one published figure moved — the D-15 median
 * remaining share, 17% -> 15%. Recorded in 26.88-COVERAGE.md, with the
 * command that prints it.
 * ------------------------------------------------------------------------
 *
 * It does not re-implement the app's shipped reading rules. It `require`s
 * core.js and calls the shipped `isPersonalNote`, `hasAuthorHeading`,
 * `structureBody`, `wordsPreserved`, `WHOLLY_EMPHASIZED_RE`,
 * `markupPreserved`, `markupPairs`, `SENTENCE_BREAK_MIN` and `itemExcluded`,
 * so every column is the app's own behaviour judged by the app's own code.
 *
 * Usage:  node tools/replan_probe.cjs [library-root]
 *         T=<chars>  the D-15 threshold in force; the default is read from
 *                    `CORE.SENTENCE_BREAK_MIN`, so this file carries no second
 *                    spelling of 600 either.
 *                    `T=400 node tools/replan_probe.cjs` is the owner-visible
 *                    alternative D-20 names and rejected, and it re-measures
 *                    the SHIPPED transform at 400 rather than a copy of it.
 *         library-root default: library.local.json's library_root, else
 *                    $HOME/StudyRoom. No absolute path is hardcoded here.
 *
 * Zero dependencies. Stdlib fs/os/path and ../core.js only. Works from any
 * working directory.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.dirname(__dirname);
const CORE = require(path.join(REPO, 'core.js'));

// The adapter folder the D-06 gap lives in (D-19). Named once, here.
const ADAPTER_FOLDER = 'studyroom-collect-k2ks84n7';

// ---------------------------------------------------------------------------
// Locating the library. An argument beats the repo's own pointer file, which
// beats the conventional home-directory location. Same shape as
// tools/pick_uat_notes.cjs — the two instruments must never disagree about
// which library they measured.
// ---------------------------------------------------------------------------

function defaultLibraryRoot() {
  const pointer = path.join(REPO, 'library.local.json');
  try {
    const doc = JSON.parse(fs.readFileSync(pointer, 'utf8'));
    if (doc && typeof doc.library_root === 'string' && doc.library_root) {
      return doc.library_root;
    }
  } catch (e) { /* fall through to the conventional location */ }
  return path.join(os.homedir(), 'StudyRoom');
}

function halt(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

const ROOT = process.argv[2] || defaultLibraryRoot();

// ---------------------------------------------------------------------------
// Frontmatter split. 26.88-16 (F-5): THE THIRD SPELLING WAS HERE, AND IT IS
// GONE. This file declared its own `FM_RE` and its own `splitFm` — the same
// regex under a shorter name — under a comment saying the byte-shaped mirror
// existed "for the same reason: app.js has no module surface". THAT REASON IS
// NOW FALSE and the comment went with the code. The deletion contract above
// forbids a second spelling of a shipped rule; this one had escaped it because
// the split is not a TRANSFORM rule, and the contract said "transform rules".
// It is discharged here and it stays discharged.
// ---------------------------------------------------------------------------

const splitFm = CORE.splitFrontmatter;

function authorProse(body) {
  const s = String(body || '')
    .replace(/%%\s*auto-links:start\s*%%[\s\S]*?%%\s*auto-links:end\s*%%/g, '\n')
    .replace(/%%\s*auto-links:start\s*%%[\s\S]*$/, '\n');
  const lines = s.split('\n');
  const H = /^[ \t]{0,3}#{1,6}(?:[ \t]+([^\n]*?))?[ \t]*$/;
  for (;;) {
    let cut = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = H.exec(lines[i].replace(/\r$/, ''));
      if (!m) continue;
      const t = String(m[1] || '').replace(/[#\s]+$/, '').trim().toLowerCase();
      cut = CORE.TOOLING_HEADINGS.indexOf(t) !== -1 ? i : -1;
      break;
    }
    if (cut === -1) break;
    lines.length = cut;
  }
  return lines.join('\n');
}

function maxPara(t) {
  let m = 0;
  for (const b of String(t).split(/\r?\n[ \t]*\r?\n/)) {
    const x = b.replace(/\r/g, '').trim();
    if (x.length > m) m = x.length;
  }
  return m;
}

// FREE-PROSE: the longest blank-line-delimited block of text a rule is
// actually PERMITTED to change. It is the measure plan 09 corrected the picker
// to sort rule 4 on, and it is the denominator of every wall figure this arc
// quotes.
//
// 26.88-14: THIS WAS THE LAST RE-DERIVED THING IN THE FILE, AND IT IS GONE.
// Until now the D-07 zone shapes were spelled out here a THIRD time — after
// core.js and after `tools/pick_uat_notes.cjs` — which is `.planning/WINDOWS.md`
// row 2. The spans now come from `CORE.handsOffSpans`, the same predicates
// `structureBody` itself keys on, by the identical construction the picker uses
// at `longestFreeProseBlock`. The two instruments can no longer disagree about
// what a wall is, and a zone the transform gains in a later plan is a zone this
// measure strips the same day with no edit here.
//
// IT MOVED A PUBLISHED FIGURE, WHICH IS WHY THE ROW WAS WORTH CLOSING RATHER
// THAN WAIVING. The third spelling predated D-13 and never gained the caption
// zone, so an emphasis-wrapped caption still counted as free prose here.
// Measured over the 384-note pool: 74 notes' free-prose measure changes, and
// EVERY published figure is unchanged except the D-15 median remaining share,
// which reads 15% rather than the 17% plan 13 recorded. The old spelling also
// blanked heading lines, which `handsOffSpans` does not; that difference was
// measured at ZERO notes on this pool, before and after the transform, so
// dropping it keeps one spelling instead of retaining a fourth. Both
// measurements are in 26.88-COVERAGE.md.
//
// Each span's characters become newlines rather than being cut out, so two
// free blocks either side of a removed zone can never be welded into one false
// wall.
function maxFree(body) {
  const text = String(body == null ? '' : body);
  const chars = text.split('');
  for (const span of CORE.handsOffSpans(text)) {
    const end = Math.min(span[1], chars.length);
    for (let i = Math.max(0, span[0]); i < end; i++) {
      if (chars[i] !== '\n') chars[i] = '\n';
    }
  }
  return maxPara(chars.join(''));
}

// ---- D-13: SHIPPED IN PLAN 11 — nothing is simulated here any more ---------
// The caption predicate is `CORE.WHOLLY_EMPHASIZED_RE`, read straight off the
// shipped module. The caption-only counter below tests THAT, which is what
// makes it an end-to-end check of the branch rather than a restatement of this
// file's own opinion: if the shipped branch failed to claim a caption line,
// that line lands in `changed` and the count goes above zero.

// ---- D-14: SHIPPED IN PLAN 12 — nothing is simulated here any more ---------
// The rosters, the per-block pair counting and the predicate are all gone from
// this file. The invariant is `CORE.markupPreserved`, read straight off the
// shipped module, and the counter below tests THAT — so if the shipped guard
// and the reference the arc was measured against ever disagreed, the trip count
// would move rather than stay silently agreeable. It did not: 0 before, 0 after.

// Which construct dropped, so a residual trip can be reported with the thing
// that broke rather than as a bare count (26.88-11 deviation 3). Reads the
// SHIPPED counting via CORE.markupPairs — the probe carries no second spelling.
function brokenConstructs(before, after) {
  const b = CORE.markupPairs(before), a = CORE.markupPairs(after);
  const out = [];
  for (const k of Object.keys(b)) {
    if (a[k] < b[k]) out.push(k + ' ' + b[k] + '->' + a[k]);
  }
  return out;
}

// ---- 26.88-16 (F-4's instrument half): FOUR GUARDS, TWO SEAMS -------------
//
// WHAT THIS FILE MEASURED UNTIL NOW, AND WHY IT WAS WRONG. It ran ONE guard —
// `markupPreserved` at the RAW seam — and printed "trips over the measured
// firing set 0 … no residual trips". `app.js renderSavedBody` requires FOUR,
// at TWO seams: wordsPreserved, markupPreserved(raw), markupPreserved(clean),
// headingsBound(clean). Over the 90-note firing set the raw seam trips 0 and
// THE CLEAN SEAM TRIPS 14, so that line was true of the raw seam and FALSE as
// a statement about shipped behaviour — and 26.88-COVERAGE.md published 90
// notes reached where the app lays out 76. The divergence exists ONLY after
// `cleanVaultMarkup`, which is why one seam could never see it.
//
// The fix is NOT four calls composed here. Four calls here would be a SECOND
// composition of a ladder app.js already composes — the one-rule-two-callers
// drift F-1 was, and the exact shape the deletion contract at the head of this
// file forbids. So the ladder was exported (plan 16 task 1) and this file
// CALLS it: `CORE.bodyGuards`, once per firing note, the same function
// `renderSavedBody` reads. The instrument and the app now answer the same
// question with the same code.
//
// THE ID LIST IS NOT DECORATION. A count of 14 is equally satisfied by a
// hardcoded 14; an id set is checkable against F-4's recorded fourteen. A gate
// whose only evidence is a number a degenerate implementation could print is
// this phase's signature defect, and this is its thirteenth recorded instance.
//
// THE PROBE SUPPLIES THE REAL `addedHeadings`. It used to hand `[]` into
// wordsPreserved and discard the transform's second return value. That is
// correct only while the probe supplies no heading records, and it is a trap
// the moment anyone gives it some — the guard would read a heading the
// transform added as a word she never wrote.

// ---- D-15: SHIPPED IN PLAN 13 — nothing is simulated here any more ---------
// The rule, its threshold, its terminator set, its abbreviation roster, its
// closer roster and its span guard are all inside core.js. The reach figures
// below are computed by running the SHIPPED transform twice per note and
// differencing, which is described where they are computed.

// D-15 DISABLED, expressed as a threshold no block can reach.
//
// FINITE ON PURPOSE, and this is the trap the number exists to avoid: the
// seam resolves "a positive FINITE number wins, anything else falls back to
// SENTENCE_BREAK_MIN", so `Infinity` would fall back to 600 and the
// comparison below would silently become a no-op printing `reached = 0`.
const D15_OFF = Number.MAX_SAFE_INTEGER;

// ---- 26.88-17: F-4 RECOVERED and F-7 OUTPUT MOVERS ------------------------
//
// Both are built the way the D-15 column is built — THE SAME SHIPPED TRANSFORM,
// RUN TWICE, DIFFERING IN ONE ARGUMENT — because that is the only construction
// in this repository that can attribute a change to one rule and to nothing
// else. Neither figure is a simulation of the fix it asserts, and neither is
// read off a list of note ids somebody typed in: a count of 14 is equally
// satisfied by a hardcoded 14, which is this phase's signature defect.
//
//   F-4 recovered   = clean-seam TRIPPED with `imageTokenGuard: false`
//                     AND clean-seam GREEN with the rule live.
//                     Not "is in F-4's recorded fourteen" — the recorded set is
//                     printed BESIDE this one and compared, so a difference is
//                     a finding rather than a silently satisfied gate.
//   F-7 movers      = live.text !== the same transform with
//                     `separatorBounds: false`.
//
// THE SHRED PREDICATE below is F-7's own EXACT one (26.88-15-FINDINGS.md § F-7),
// reused rather than re-invented: for each maximal run of emitted `- ` lines,
// rejoin the item texts with each separator and test whether that exact string
// occurs in the SOURCE body. A genuine authored list cannot satisfy it — its
// items are already `- ` lines in the source and are not separator-joined.
//
// WHAT THE SHRED PREDICATE IS NOT, stated because F-7's own table says so and a
// reader of this number will otherwise over-read it: it CANNOT tell an
// enumeration the owner wants bulleted from one she does not. F-7 verdicted two
// of its four hits as reading BETTER (`b4ead431896578e3`, `cb676cc240495106` —
// both ingredient lists). Those two are shred hits and GOOD OUTPUT at the same
// time. The count is a population, never a defect count.
//
// And the measurement error this construction exists to avoid: F-7's FIRST
// scale attempt reported 2,514 against a true 4, because it ran the transform
// on raw files past the eligibility gate with the wrong argument in the heading
// position, and counted any bullet not ending in sentence punctuation. Every
// figure here is built from THIS FILE'S OWN POOL and that exact predicate.
function shredRuns(body, out) {
  const lines = String(out).split('\n');
  const hits = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^- /.test(lines[i])) { i++; continue; }
    const run = [];
    while (i < lines.length && /^- /.test(lines[i])) {
      run.push(lines[i].slice(2)); i++;
    }
    if (run.length < 2) continue;
    for (const sep of CORE.RUN_SEPARATORS) {
      const rejoined = run.join(sep);
      if (String(body).indexOf(rejoined) !== -1) { hits.push(sep); break; }
    }
  }
  return hits;
}

// F-4's fourteen, RECORDED at `2e7f7d2` and verified individually there
// (26.88-15-FINDINGS.md § "The 14 notes"). It is printed BESIDE the measured
// recovered set and differenced — never used to produce it.
const F4_RECORDED = ['2d3e437b1c80d4c2', '4c603374439832fc', '5383a74fd3714f83',
  '63008ec8aa51ec41', '634da04afc0c7931', '772fd20e081d30a9',
  '7d40ec13288f0bcb', '7fce85b64c8cb23d', '848ac01447259dec',
  '9c2fa3eb03c31ccd', '9ea6029030f3913c', 'b4e358558cbcd365',
  'bf58bba6fa91652f', 'd0d751039f129c0a'];

// The phase's worked example from CONTEXT `<specifics>`. Its INGREDIENT BLOCK is
// the must-not-regress contract (26.88-17-PLAN.md, amendment 2026-08-03 §4); the
// note itself DOES move, in exactly one way, and that movement is named in the
// SUMMARY rather than folded into a pass.
const PIN_ID = '504c356cb318ac4a';

// ---- the sweep --------------------------------------------------------------

function readStore(libraryRoot) {
  const storePath = path.join(libraryRoot, 'items.json');
  let text;
  try {
    text = fs.readFileSync(storePath, 'utf8');
  } catch (e) {
    halt('Cannot read the item store at ' + storePath + ' (' + e.message +
      ').\nThe probe reads the LIVE library and never invents a fallback ' +
      'corpus — a fixture corpus would make every number in plans 10-14 a ' +
      'fiction.\nUsage: node tools/replan_probe.cjs [library-root]');
  }
  let store;
  try {
    store = JSON.parse(text);
  } catch (e) {
    halt('The item store at ' + storePath + ' is not readable JSON (' +
      e.message + '). Refusing to guess.');
  }
  if (!store || !store.items) {
    halt('The item store at ' + storePath + ' has no items. Refusing to guess.');
  }
  return store;
}

const store = readStore(ROOT);
const items = Array.isArray(store.items)
  ? store.items
  : Object.keys(store.items).sort().map((k) => store.items[k]);
const filters = (store.meta && store.meta.filters) || [];

let text = 0, unreadable = 0;
// 26.88-20 (F-6b): the carve-out's live population and its three gates.
let h6bScanned = 0, h6bLink = 0, h6bRun = 0, h6bExempt = 0;
// 26.88 verification IN-02: THE PER-HALF NOTE COUNTS, PRINTED RATHER THAN
// DERIVED. `26.88-COVERAGE.md` published "27 across 9 notes" and "111 across
// 25 notes" against the command `node tools/replan_probe.cjs`. The probe
// printed the 27, the 111 and the union (34) — it did NOT print the 9 or the
// 25. Arithmetically consistent (9 + 25 = 34) and materially harmless, and
// still a third category in a file whose stated discipline is "every figure
// carries the command that printed it or is labelled RECORDED — there is no
// third category". A figure whose stated source does not produce it is what
// this phase exists to stop, so the source is made to produce it.
//
// These are NOT the union. A note can be touched by both halves, so
// h6bLinkNotes + h6bRunNotes >= h6bNotes.length, and the day it is strictly
// greater is a real fact about the corpus rather than an arithmetic error.
let h6bLinkNotes = 0, h6bRunNotes = 0;
const h6bNotes = [], h6bWordFail = [], h6bHeadFail = [], h6bZoneFail = [];
// 26.88 code review WR-02: the welding sites, BY NOTE AND OFFSET. A count with
// no offset list is not accepted anywhere in this phase, and this one has to
// carry offsets because the same note can hold both a weld and a legitimate
// cut (`6974a936b85f361a` holds one of each).
function emittedBlocks(text) {
  return String(text).split(/\r?\n[ \t]*\r?\n/).filter((b) => b.trim()).length;
}
const h6bWeld = [];
// ...and the SAME question over every text note rather than over the pool.
// The pool is what the app lays out; the PREDICATE acts wherever
// `splitSentences` is asked. Every one of the nine sentence pairs the code
// review named sits on a note that carries an author heading and is therefore
// NOT in the pool — the app renders all seven of them exactly as saved — so a
// pool-only counter would still be unable to see the class it was added for.
// Both populations are printed, and which is which is stated, because that
// difference is itself a finding.
let f12AllOff = 0;
let f12AllLive = 0;
let f12AllMovers = 0;


// The LINK half's hit count. 26.88 code review CR-01: it used to spell the
// bracket shape here and ask `CORE.HASHTAG_SEARCH_HREF_RE` for the href — a
// SECOND SPELLING of HALF 1, and one that could not see the fence HALF 1 was
// missing, so this file would have kept printing 27 no matter what the shipped
// half did inside a hands-off zone. HALF 1 now reports its reach as an offset
// list, exactly as HALF 2 does, and this file asks it by name.
function hashtagLinkHits(body) {
  return CORE.hashtagLinkCuts(body).length;
}

// The two independent re-checks the carve-out's gates need. Both are
// STRAIGHT-LINE and read the SHIPPED zone map rather than re-spelling it.
function atxLines(s) {
  return String(s).split('\n')
    .filter((l) => /^[ \t]{0,3}#{1,6}([ \t]|$)/.test(l.replace(/\r$/, '')))
    .join('\u0000');
}
function zoneBytes(s) {
  const t = String(s);
  return CORE.handsOffSpans(t).map((sp) => t.slice(sp[0], sp[1])).join('\u0000');
}

const pool = [];
for (const it of items) {
  if (!it || it.type !== 'text' || !it.library_path) continue;
  text++;
  let raw;
  try {
    raw = fs.readFileSync(path.join(ROOT, it.library_path), 'utf8');
  } catch (e) { unreadable++; continue; }
  const p = splitFm(raw);
  // 26.88-20 (F-6b): THE HASHTAG CARVE-OUT, MEASURED OVER EVERY TEXT NOTE AND
  // NOT OVER THE POOL, and the placement is the whole point of the figure.
  //
  // 26.88 CODE REVIEW CR-02: THE PLACEMENT MOVED, AND SO DID THIS COMMENT.
  // It used to say the carve-out "lives in `cleanVaultMarkup`, the LAST
  // transform before `marked` and the ONLY one that runs on every rendered
  // body" — which was true, and was the defect: it ran downstream of
  // `bodyGuards`, downstream of `renderSavedBody`'s early returns, and
  // downstream of the "show as saved" toggle, so the one transform that
  // deletes characters was the one with no guard and no off switch. It now
  // runs in `renderSavedBody`, ABOVE the toggle, and honours four of that
  // function's refusals: the toggle, the librarian's own prose, a reflection,
  // and HER OWN WRITING.
  //
  // So the population is still every text note, but the THREE REFUSALS THE
  // APP MAKES ARE SUBTRACTED HERE RATHER THAN LEFT OUT OF THE PROSE — a
  // figure that counted notes the app declines would be a figure about a
  // function nobody calls. `hasAuthorHeading` is deliberately NOT subtracted:
  // the carve-out reaches those notes, and they are 15 of the 32.
  //
  // ALL THREE GATE COUNTS HAVE A FLOOR OF ZERO AND A STOP. A carve-out that
  // ate a word, moved a heading, or reached into a hands-off zone is a law-4
  // breach on a decision the owner took on the promise that it would not.
  h6bScanned++;
  const carveExempt = it.source === 'librarian' || it.reflects != null ||
    /^reflects:/m.test(String(p.fm || '')) || CORE.isPersonalNote(it, p.fm);
  if (carveExempt) { h6bExempt++; }
  const linkCuts = carveExempt ? 0 : hashtagLinkHits(p.body);
  const runCuts = carveExempt ? 0 : CORE.hashtagRunSpans(p.body).length;
  if (linkCuts || runCuts) {
    h6bLink += linkCuts;
    h6bRun += runCuts;
    if (linkCuts) { h6bLinkNotes++; }
    if (runCuts) { h6bRunNotes++; }
    h6bNotes.push(it.id);
    const stripped = CORE.stripHashtagMarkers(p.body);
    /* --- 26.88-20 F-6b CARVE-OUT GATE: BEGIN NAMED EXEMPTION --- */
    if (CORE.wordsPreserved(p.body, stripped, []) !== true) {
      h6bWordFail.push(it.id);
    }
    /* --- 26.88-20 F-6b CARVE-OUT GATE: END NAMED EXEMPTION --- */
    if (atxLines(stripped) !== atxLines(p.body)) { h6bHeadFail.push(it.id); }
    if (zoneBytes(stripped) !== zoneBytes(p.body)) { h6bZoneFail.push(it.id); }
    // 26.88 code review WR-02: the welding class, counted where it is
    // decided. A `#` whose left neighbour is a word character is a separator
    // she is relying on, and this line is what would notice the left boundary
    // being loosened again — the three gates above cannot: `wordsPreserved`
    // returns TRUE on a CJK weld, no heading moves, no zone byte moves. It
    // needs NO exemption: it calls no shipped guard, only the shipped reach.
    for (const c of CORE.hashtagRunSpans(p.body)) {
      if (c > 0 && /[\p{L}\p{N}_]/u.test(p.body.charAt(c - 1))) {
        h6bWeld.push(it.id + '@' + c);
      }
    }
  }
  // 26.88 code review WR-03: F-12's twin run over EVERY TEXT NOTE. Same two
  // calls, same one differing argument, wider population. See the counter
  // declarations for why both populations are printed.
  {
    const aLive = CORE.structureBody(p.body, []).text;
    const aOff = CORE.structureBody(p.body, [],
      { ordinalEnumeratorGuard: false }).text;
    f12AllLive += emittedBlocks(aLive);
    f12AllOff += emittedBlocks(aOff);
    if (aLive !== aOff) { f12AllMovers++; }
  }
  if (CORE.isPersonalNote(it, p.fm)) continue;
  if (CORE.hasAuthorHeading(p.body)) continue;
  const prose = authorProse(p.body);
  pool.push({
    id: it.id, title: String(it.title || ''), folder: String(it.folder || ''),
    fm: p.fm, body: p.body, prose, para: maxPara(prose), free: maxFree(prose),
    safe: !CORE.itemExcluded(it, filters)
  });
}
if (!pool.length) {
  halt('No eligible note in ' + ROOT + '. Refusing to report an empty corpus ' +
    'as a measurement.');
}

const T = Number(process.env.T || CORE.SENTENCE_BREAK_MIN);
if (!Number.isFinite(T) || T < 1) {
  halt('T must be a positive integer number of characters (got ' +
    String(process.env.T) + ').');
}

// 26.88-11: ONE MEASURED COLUMN. Until plan 11 shipped D-13 there were two —
// the shipped transform, and a `vm` copy of it patched with this file's own
// caption regex. There is now no second spelling of the caption rule anywhere,
// so every figure below is the app's own behaviour judged by the app's own
// code. The pre-D-13 baseline is not re-derived here; it is RECORDED, in
// 26.88-09-SUMMARY.md and 26.88-10-SUMMARY.md, and quoted from there.
let firing = 0, firingSafe = 0, brokenHead = 0, captionOnly = 0;
let ncShorten = 0, ncHalve = 0, bestBefore = 0, bestAfter = 0;
let invTrip = 0, wordFail = 0;
// 26.88-16: the four-guard trip counts and the count of notes the app actually
// LAYS OUT. `invTrip` and `wordFail` above are now read off the same verdict
// rather than from separate predicate calls, so the D-14 block below and this
// block can never disagree about the raw seam.
let gCleanFail = 0, gBoundFail = 0, gLaidOut = 0;
// The clean-seam trips, BY NOTE. `cleanTripIds` is the checkable set; the
// residue carries the construct that broke, on the same footing as the raw
// seam's (26.88-11 deviation 3: a bare count cannot be named).
const cleanTripIds = [];
const cleanResidue = [];
let d15 = 0, d15New = 0, d15Halve = 0, d15OverT = 0, d15Unsafe = 0;
let noFm = 0, noFmAdapter = 0, noFmFiring = 0, noFmD15 = 0;
// 26.88-10 (D-19): THE RESIDUAL. A note that HAS a frontmatter block but
// carries no `source:` value still takes the permissive road and may be laid
// out. D-19 deliberately does NOT cover it — that population was never
// measured, and widening to it is a separate decision with its own
// measurement. It prints on its own labelled line so the closed gap is never
// read as covering more than it does (threat T-26.88-30).
let hasFmNoSource = 0;
const unionIds = new Set();
const residue = [];
// 26.88-11: the unbalanced-marker heading residual, by note and by the heading
// line that produced it. D-13 drives this count to a ceiling rather than to
// zero (plan 12's Q5 refusal takes it the rest of the way), so the criterion
// is "every residual NAMED" — and a bare count cannot be named. Printed here
// for the same reason plan 10 printed the two largest walls: a figure derived
// in a throwaway script is a figure nobody can reproduce.
const headResidue = [];
const d15Shares = [];
// 26.88-13: THE HONEST CEILING, BY NAME. Some notes D-15 reaches still keep a
// block over the threshold afterwards, and a bare count of them cannot be
// checked, argued with or reproduced (26.88-11 deviation 3 established that
// for the unbalanced-heading residual). Printed by note id, title and the
// size of the block that is left.
const d15Ceiling = [];
// 26.88-17: the two new measured sets, BY NOTE. A count with no id list is not
// accepted anywhere in plan 17.
const f4Recovered = [];
// 26.88-20 (F-12): the notes whose LAID-OUT SHAPE the fourth refusal changed,
// built the way the F-4 column is built — the SAME shipped transform, run
// twice, differing in one argument. The seam exists BECAUSE this file could
// not otherwise see the fix: re-run across F-12 with no seam, every figure
// below was byte-identical, sha256 included. A re-run that cannot move is not
// evidence that nothing moved, and that is this phase's own defect class.
const f12Movers = [];
let f12OrphansOff = 0;
let f12OrphansLive = 0;
// 26.88 code review WR-03: the losing direction, as a number.
let f12BlocksOff = 0;
let f12BlocksLive = 0;
const f7Movers = [];
const shredBefore = [];
const shredAfter = [];

// 26.88 code review WR-03: THE COUNTER THAT CAN GO THE OTHER WAY.
//
// `bareNumeralBlocks` below counts the shape the F-12 fix ADDS. A break the
// rule WRONGLY SUPPRESSES produces no bare-numeral block in either column, so
// every one of the nine sentence pairs the review found scored 0 vs 0 here and
// read green against a floor of 0. A counter that cannot go up is not a
// counter, and this file's own header says the probe must be able to see the
// thing it is re-run for.
//
// So the twin run also prints SUPPRESSED BREAKS: the blocks the OFF run emits
// minus the blocks the LIVE run emits, summed, with the movers named. It has
// no floor of zero and it never will — F-12 legitimately suppresses most of
// what it suppresses. It is a MAGNITUDE the owner reads beside the mover list,
// and its job is to be able to MOVE: when this counter was first run against
// the shipped rule it printed a number, and against the corrected rule it
// prints a smaller one. A gate whose only metric counts the shape a fix adds
// cannot detect the shape it removes.

// 26.88-20 (F-12): emitted blocks that are NOTHING BUT an ordered-list
// enumerator — `1.` alone, cut off from the sentence it numbers. The reader's
// symptom, counted directly on the emitted markdown rather than inferred from
// the predicate, so a rule that stopped firing and a rule that fired correctly
// cannot print the same number (the movers list beside it is what separates
// them).
function bareNumeralBlocks(text) {
  return String(text).split(/\r?\n[ \t]*\r?\n/)
    .filter((b) => /^\d{1,3}\.$/.test(b.trim())).length;
}

// The offending heading lines, or an empty list. Returning the LINES rather
// than a boolean is what lets the residual be named instead of counted.
function unbalancedHeadings(out) {
  const hit = [];
  for (const l of out.split('\n')) {
    if (!/^[ \t]{0,3}#{1,6}[ \t]/.test(l)) continue;
    if ((l.match(/\*/g) || []).length % 2 || (l.match(/_/g) || []).length % 2) {
      hit.push(l.trim());
    }
  }
  return hit;
}

for (const e of pool) {
  if (!CORE.hasFrontmatterBlock(e.fm)) {
    noFm++;
    if (e.folder === ADAPTER_FOLDER) noFmAdapter++;
  } else if (CORE.fmSource(e.fm) === null) {
    hasFmNoSource++;
  }

  // --- the MEASURED column: core.js as it stands, no simulation -------------
  // The threshold is passed THROUGH THE SEAM on every call that measures the
  // after column. Defaulting it here instead would pin every figure at 600 and
  // make the `T=400` run a copy of the `T=600` one — which is exactly the
  // failure the deletion creates and the seam exists to prevent.
  // 26.88-16: the WHOLE result object, not just `.text`. `addedHeadings` is the
  // second return value this file used to discard.
  const outRes = CORE.structureBody(e.body, [], { sentenceBreakMin: T });
  const out = outRes.text;
  const isFiring = out !== e.body;
  if (isFiring) {
    // ONE call to the SHIPPED four-guard verdict — the same function
    // renderSavedBody reads. Every guard figure below comes off this object;
    // nothing here composes a guard of its own.
    const g = CORE.bodyGuards(e.body, out, outRes.addedHeadings);
    if (g.ok) gLaidOut++;
    if (!g.markupClean) {
      gCleanFail++;
      cleanTripIds.push(e.id);
      cleanResidue.push({ id: e.id, title: e.title,
        broke: brokenConstructs(CORE.cleanVaultMarkup(e.body),
          CORE.cleanVaultMarkup(out)).join(', ') });
    }
    if (!g.headingsBound) gBoundFail++;
    firing++; unionIds.add(e.id);
    if (e.safe) firingSafe++;
    if (!e.fm) noFmFiring++;
    const heads = unbalancedHeadings(out);
    if (heads.length) {
      brokenHead++;
      headResidue.push({ id: e.id, title: e.title, heads: heads });
    }
    const a = maxFree(out);
    if (a < e.free) { ncShorten++; if (a <= e.free / 2) ncHalve++; }
    if (e.free - a > bestBefore - bestAfter) { bestBefore = e.free; bestAfter = a; }
    if (!g.markupRaw) {
      invTrip++;
      residue.push({ id: e.id, title: e.title,
        broke: brokenConstructs(e.body, out).join(', ') });
    }
    if (!g.words) wordFail++;
    // Every line the transform CONSUMED, and whether the shipped caption
    // predicate claims all of them. `CORE.WHOLLY_EMPHASIZED_RE` is the branch
    // itself, so a caption the branch failed to claim shows up here as a
    // non-zero count rather than being masked by a second spelling.
    const surv = new Map();
    for (const l of out.split('\n')) surv.set(l, (surv.get(l) || 0) + 1);
    const changed = [];
    for (const r of e.body.split('\n')) {
      const n = surv.get(r) || 0;
      if (n > 0) { surv.set(r, n - 1); continue; }
      if (!r.replace(/\r$/, '').trim()) continue;
      changed.push(r.replace(/\r$/, ''));
    }
    if (changed.length &&
        changed.every((l) => CORE.WHOLLY_EMPHASIZED_RE.test(l))) captionOnly++;
  }

  // --- the D-15 column: THE SHIPPED TRANSFORM, RUN TWICE --------------------
  //
  // HOW `reached` AND `new` ARE COMPUTED, named rather than left to be
  // inferred. Once the local simulation was deleted this file could no longer
  // isolate "reached by D-15" from "changed by any rule" by inspecting its own
  // loop, and this figure lands in 26.88-COVERAGE.md where the owner reads it.
  // So the seam is used in BOTH directions:
  //
  //   off  = the shipped transform with D-15 DISABLED — every other rule
  //          exactly as it ships, the zone map and the signal rules included.
  //   live = the shipped transform with D-15 at the threshold in force.
  //
  //   reached = live !== off. That difference is D-15's contribution and
  //             NOTHING else's, because the two runs differ in one argument.
  //   new     = live !== off AND off === body — reached, and not firing at all
  //             before D-15. Self-contained: `off` IS the pre-D-15 firing
  //             test, so this needs no recorded number from an earlier wave.
  //
  // What it deliberately is NOT: `CORE.blockLengths` composed with
  // `CORE.splitSentences` and a local `>`. That would pass the deletion gate on
  // a technicality and re-introduce a second spelling of the D-15 gate — one
  // running behind neither the zone map nor the signal rules — so it would
  // OVER-REPORT reach on the exact number the owner is shown in order to
  // decide between 600 and 400.
  // --- 26.88-17: F-4 recovered, and F-7's output movers --------------------
  // Both twin runs hold the threshold at T, so a moved figure here is this
  // plan's and never the threshold's.
  const offImg = CORE.structureBody(e.body, [],
    { sentenceBreakMin: T, imageTokenGuard: false });
  if (offImg.text !== e.body) {
    const gImg = CORE.bodyGuards(e.body, offImg.text, offImg.addedHeadings);
    if (!gImg.markupClean && isFiring) {
      const gNow = CORE.bodyGuards(e.body, out, outRes.addedHeadings);
      if (gNow.markupClean) { f4Recovered.push(e.id); }
    }
  }
  // --- 26.88-20: F-12's own twin run, one argument apart ------------------
  const offOrd = CORE.structureBody(e.body, [],
    { sentenceBreakMin: T, ordinalEnumeratorGuard: false }).text;
  if (isFiring || offOrd !== e.body) {
    const oOff = bareNumeralBlocks(offOrd);
    const oLive = bareNumeralBlocks(out);
    f12OrphansOff += oOff;
    f12OrphansLive += oLive;
    const bOff = emittedBlocks(offOrd);
    const bLive = emittedBlocks(out);
    f12BlocksOff += bOff;
    f12BlocksLive += bLive;
    if (out !== offOrd) {
      f12Movers.push({ id: e.id, title: e.title, off: oOff, live: oLive,
        blocksOff: bOff, blocksLive: bLive });
    }
  }
  const offSep = CORE.structureBody(e.body, [],
    { sentenceBreakMin: T, separatorBounds: false }).text;
  if (isFiring || offSep !== e.body) {
    if (out !== offSep) { f7Movers.push({ id: e.id, title: e.title }); }
    if (offSep !== e.body && shredRuns(e.body, offSep).length) {
      shredBefore.push(e.id);
    }
    if (isFiring && shredRuns(e.body, out).length) { shredAfter.push(e.id); }
  }

  const off = CORE.structureBody(e.body, [], { sentenceBreakMin: D15_OFF }).text;
  const firesFixed = off !== e.body;
  const touched = out !== off;
  // MEASURED ON THE SAME FOOTING AS `e.free`, and that is not a detail:
  // `e.free` is maxFree(authorProse(body)), so the "after" figure has to run
  // the SAME reduction over the output or the two numbers are not comparable.
  // Measured: without authorProse the median remaining share prints 29%
  // instead of 15%, because the vault_linker `## Related` link list survives
  // the zone map (a link line is not a hands-off zone) and becomes the largest
  // surviving "block" on notes D-15 shortened. That would be a figure
  // describing the tooling footer rather than the wall.
  const after = maxFree(authorProse(out));
  if (touched) {
    d15++; unionIds.add(e.id);
    if (!firesFixed) d15New++;
    if (after <= e.free / 2) d15Halve++;
    if (after > T) {
      d15OverT++;
      d15Ceiling.push({ id: e.id, title: e.title, before: e.free, after: after });
    }
    if (!e.safe) d15Unsafe++;
    if (!e.fm) noFmD15++;
    if (e.free > 0) d15Shares.push(after / e.free);
  }
}

const P = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '0%');

// The two biggest free-prose walls still in the eligible pool. Before D-19
// the top two were her own writing (2,974 and 2,962 chars — the diary and the
// autobiography); the point of the change is that they are no longer reachable
// by any rule in this phase. Ordered by the D-21-corrected measure, with the
// same `id` ascending tiebreak the picker uses so two runs never disagree.
const topWalls = pool.slice()
  .sort((a, b) => (b.free - a.free) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .slice(0, 2);

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const say = (l) => process.stdout.write(l + '\n');

say('library                       ' + ROOT);
say('D-15 threshold in force  T =  ' + T + ' chars' +
  (T === CORE.SENTENCE_BREAK_MIN ? '   (D-20 default)'
    : '   (non-default; D-20 chose ' + CORE.SENTENCE_BREAK_MIN + ')'));
say('text items                    ' + text +
  (unreadable ? '  (unreadable ' + unreadable + ')' : ''));
say('eligible pool                 ' + pool.length + '  ' + P(pool.length, text));
say('');
say('SHIPPED — MEASURED (D-13 landed in plan 11; nothing below is simulated)');
say('  firing at least one signal  ' + firing + '  ' + P(firing, text) +
  ' of text, ' + P(firing, pool.length) + ' of pool  (law-5 safe: ' +
  firingSafe + ')');
say('  emit an unbalanced-emphasis heading ' + brokenHead + '  ' +
  P(brokenHead, firing) + ' of firing');
for (const h of headResidue) {
  say('    ' + h.id + '  ' + h.heads.join('  |  '));
  say('      ' + h.title);
}
say('  fire on NOTHING BUT emphasis-wrapped caption lines ' + captionOnly +
  '  ' + P(captionOnly, firing));
say('  biggest FREE-PROSE block shortened ' + ncShorten + '  halved ' + ncHalve);
say('  best free-prose wall reduction ' + bestBefore + ' -> ' + bestAfter);
say('  word-preservation failures   ' + wordFail);
say('  RECORDED BASELINE, pre-D-13, same 384-note pool (26.88-10-SUMMARY):');
say('    firing 232 with the caption zone absent; 58 with it simulated.');
say('    Both are RECORDED, not re-derived here — there is no second');
say('    spelling of the caption rule left in this file to re-derive them');
say('    from, which is the point of the deletion contract above.');
say('');
say('D-14 INLINE-MARKUP INVARIANT (SHIPPED in plan 12 — CORE.markupPreserved)');
// 26.88-16: THIS LABEL USED TO OVERSTATE, and the probe's comments are read as
// evidence in this phase — 26.88-COVERAGE.md quotes them — so a label that
// overstates is the same defect class as a check that under-measures. It read
// "trips over the measured firing set", which sounds absolute and is true only
// of the RAW seam. It now names the seam it measures, and the clean seam is
// stated beside it rather than left absent.
say('  trips at the RAW seam over the firing set ' + invTrip + '  ' +
  P(invTrip, firing) + '  (genuine residue)');
say('  ...and at the CLEAN seam — what `marked` ACTUALLY receives  ' +
  gCleanFail + '  ' + P(gCleanFail, firing));
if (residue.length) {
  say('  the residual RAW-seam trips, with the construct that broke:');
  for (const r of residue) {
    say('    ' + r.id + '  ' + r.broke);
    say('      ' + r.title);
  }
} else {
  say('  no residual RAW-seam trips. THIS IS NOT A STATEMENT ABOUT SHIPPED');
  say('  BEHAVIOUR: renderSavedBody requires FOUR guards at TWO seams, and');
  say('  the clean-seam count above is the one that decides what she sees.');
}
say('');
// 26.88-16 (F-4's instrument half): the four guards renderSavedBody requires,
// counted off ONE call to the SHIPPED CORE.bodyGuards. Printed in a FIXED
// order on every run, so the block is diffable line for line between runs.
say('THE FOUR GUARDS renderSavedBody REQUIRES (SHIPPED — CORE.bodyGuards)');
say('  guard trips over the firing set');
say('    wordsPreserved                 ' + wordFail);
say('    markupPreserved (raw seam)     ' + invTrip);
say('    markupPreserved (clean seam)   ' + gCleanFail);
say('    headingsBound                  ' + gBoundFail);
say('    laid out (all four green)      ' + gLaidOut);
// THE IDS, not just the count. A hardcoded number has no id set, so this line
// is what a degenerate implementation of the gate above cannot satisfy.
say('  clean-seam trip ids              ' + cleanTripIds.join(' '));
if (cleanResidue.length) {
  say('  the clean-seam trips, with the construct that broke:');
  for (const r of cleanResidue) {
    say('    ' + r.id + '  ' + r.broke);
    say('      ' + r.title);
  }
}
say('  firing ' + firing + ' - clean-seam trips ' + gCleanFail + ' = laid out ' +
  (firing - gCleanFail) + '   (declined, rendered exactly as saved: ' +
  (firing - gLaidOut) + ')');
say('');
// 26.88-17: both figures are DIFFERENCES BETWEEN TWO RUNS of the shipped
// transform, one argument apart — the same construction the D-15 column below
// uses, and the only one that attributes a change to a single rule.
say('26.88-17 F-4 / F-7 (MEASURED — the shipped transform, run twice)');
say('  F-4 recovered               ' + f4Recovered.length +
  '   (clean-seam trip with imageTokenGuard off, green with it on)');
say('    ' + (f4Recovered.slice().sort().join(' ') || '(none)'));
const recSet = new Set(f4Recovered);
const missing = F4_RECORDED.filter((x) => !recSet.has(x));
const extra = f4Recovered.filter((x) => F4_RECORDED.indexOf(x) === -1);
say('  ...vs F-4\'s RECORDED fourteen: ' +
  (missing.length || extra.length
    ? 'DIFFERS — recorded-not-recovered [' + missing.join(' ') +
      ']  recovered-not-recorded [' + extra.join(' ') + ']'
    : 'IDENTICAL, 0 differences'));
say('  F-7 output movers           ' + f7Movers.length +
  '   (live vs separatorBounds:false)');
for (const m of f7Movers) {
  say('    ' + m.id + '  ' + m.title);
}
say('  ' + PIN_ID + ' in the mover list: ' +
  (f7Movers.some((m) => m.id === PIN_ID) ? 'YES' : 'no') +
  '   (the binding contract is its INGREDIENT BLOCK, not its absence here —');
say('   26.88-17-PLAN.md amendment 2026-08-03 §4. Its one movement is named in');
say('   the SUMMARY: the prose intro leaves bullet one.)');
say('  inline-enumeration shred, F-7\'s own exact rejoin predicate:');
say('    before (separatorBounds off)  ' + shredBefore.length + '   ' +
  shredBefore.slice().sort().join(' '));
say('    after  (shipped)              ' + shredAfter.length + '   ' +
  shredAfter.slice().sort().join(' '));
say('    A POPULATION, NEVER A DEFECT COUNT. F-7 verdicted two of its four');
say('    hits as reading BETTER (b4ead431896578e3, cb676cc240495106 — both');
say('    ingredient lists), so a hit here is not by itself a defect and this');
say('    number is not by itself a score.');
say('');
// 26.88-20: THE TWO FIXES THE PLAN-20 UAT PRODUCED. F-12 is a twin run, one
// argument apart, exactly like F-4 above. F-6b is not — it is not a transform
// rule and has no twin; it is counted where it actually acts, over EVERY text
// note, with three gates that each have a floor of zero.
say('26.88-20 F-12 (MEASURED — the shipped transform, run twice)');
say('  bare-numeral blocks emitted, ordinalEnumeratorGuard OFF  ' +
  f12OrphansOff);
say('  ...and with the shipped rule in force                    ' +
  f12OrphansLive + '   FLOOR: 0');
say('  laid-out shape movers       ' + f12Movers.length +
  '   (live vs ordinalEnumeratorGuard:false)');
for (const m of f12Movers) {
  say('    ' + m.id + '  blocks ' + m.blocksOff + ' -> ' + m.blocksLive +
    '   bare numerals ' + m.off + ' -> ' + m.live);
  say('           ' + m.title);
}
say('  SUPPRESSED BREAKS — blocks the OFF run emits, less the LIVE run');
say('    over the eligible pool  ' + (f12BlocksOff - f12BlocksLive) +
  '   (off ' + f12BlocksOff + ', live ' + f12BlocksLive + ')');
say('    over ALL text notes     ' + (f12AllOff - f12AllLive) +
  '   (off ' + f12AllOff + ', live ' + f12AllLive + '), movers ' +
  f12AllMovers);
say('  THE WIDER ROW IS NOT DECORATION. All seven notes the code review');
say('  named carry an AUTHOR HEADING, so renderSavedBody declines them and');
say('  the reader never saw the glued sentences at all — the defect was');
say('  real in the predicate and invisible on the reading surface. A');
say('  pool-only counter cannot see that class, which is why both rows are');
say('  here and why each says which population it is.');
say('  NO FLOOR, AND IT IS THE POINT. The line above counts what the rule');
say('  ADDS; this one counts what it REMOVES. A break the rule wrongly');
say('  refuses produces no bare-numeral block in EITHER column, so before');
say('  this line the nine real sentence pairs the code review found each');
say('  scored 0 vs 0 and read green against a floor of 0. Most of this');
say('  number is the fix working; the mover list beside it is where a');
say('  reader checks which. A counter that cannot go up is not a counter.');
say('  A COUNT WITH NO ID LIST IS NOT ACCEPTED, and the two columns are not');
say('  interchangeable: the orphan count says the DEFECT is gone, and the');
say('  mover list says the RULE is what removed it. A rule that stopped');
say('  firing entirely would print 0 orphans and 0 movers, which is why both');
say('  are printed and why the mover floor is 1, not 0.');
say('');
say('26.88-20 F-6b THE HASHTAG CARVE-OUT (owner decision, 2026-08-03)');
say('  measured over ALL text notes     ' + h6bScanned +
  '   (not the pool — it acts in renderSavedBody, above the toggle)');
say('  ...the app exempts, and so does this   ' + h6bExempt +
  '   (librarian prose, a reflection, her own writing)');
say('  HALF 1 link labels stripped      ' + h6bLink +
  '   across ' + h6bLinkNotes + ' notes');
say('  HALF 2 bare `#` stripped         ' + h6bRun +
  '   across ' + h6bRunNotes + ' notes');
say('  notes the carve-out touches      ' + h6bNotes.length +
  '   (the UNION — a note either half touches, counted once)');
say('    ' + (h6bNotes.slice().sort().join(' ') || '(none)'));
say('  THE FOUR GATES ON THE CARVE-OUT, each with a floor of ZERO:');
say('    wordsPreserved trips           ' + h6bWordFail.length + '   ' +
  h6bWordFail.join(' '));
say('    ATX heading lines moved        ' + h6bHeadFail.length + '   ' +
  h6bHeadFail.join(' '));
say('    hands-off zone bytes moved     ' + h6bZoneFail.length + '   ' +
  h6bZoneFail.join(' '));
say('    WELDS — a `#` cut from between two word characters  ' +
  h6bWeld.length + '   ' + h6bWeld.join(' '));
say('    THE FOURTH GATE IS NEW (26.88 code review WR-02) AND THE OTHER');
say('    THREE ARE STRUCTURALLY BLIND TO WHAT IT COUNTS. On 13 live sites');
say('    the deleted `#` had a non-whitespace character in front of it,');
say('    and on 9 of those it welded two of her tokens into one — while');
say('    wordsPreserved answered TRUE, because normalizeWords tokenizes');
say('    CJK per codepoint. No heading moved. No zone byte moved. Three');
say('    gates at a floor of zero, all three green, the defect underneath.');
say('    The carve-out is REQUIRED TO SATISFY wordsPreserved rather than');
say('    excused from it — and renderSavedBody now actually asks.');
say('');
say('D-15 GUARDED SENTENCE BREAKS (SHIPPED in plan 13 — MEASURED, not ' +
  'simulated), T=' + T);
say('  computed as live !== off, two runs of CORE.structureBody differing in');
say('  one argument, so the difference is D-15\'s and nothing else\'s.');
say('  notes reached               ' + d15);
say('  ...new, not firing post-D-13 ' + d15New);
say('  biggest free-prose block halves ' + d15Halve);
say('  left with a block over ' + T + '   ' + d15OverT);
for (const c of d15Ceiling.sort((a, b) => b.after - a.after)) {
  say('    ' + String(c.before).padStart(5) + ' -> ' +
    String(c.after).padStart(5) + '  ' + c.id);
  say('           ' + c.title);
}
say('  median remaining share      ' +
  (d15Shares.length ? (100 * median(d15Shares)).toFixed(0) + '%' : 'n/a'));
say('  law-5-excluded among them   ' + d15Unsafe);
say('');
say('D-06 GAP / ELIGIBLE-POOL COMPOSITION (plan 10 reads its numbers here)');
say('  eligible pool                       ' + pool.length);
say('  ...with NO frontmatter block at all ' + noFm + '  ' +
  P(noFm, pool.length) + ' of pool');
say('  ......of those, in ' + ADAPTER_FOLDER + '  ' + noFmAdapter);
say('  ......already firing today          ' + noFmFiring);
say('  ......reached by D-15 at T=' + T + '       ' + noFmD15);
say('  NOT COVERED BY D-19 — has frontmatter, no `source:` value  ' +
  hasFmNoSource + '  ' + P(hasFmNoSource, pool.length) + ' of pool');
say('    (the residual. D-19 covers the ABSENT-BLOCK case only; this');
say('     population is UNMEASURED and widening to it is a separate');
say('     decision with its own measurement.)');
say('  the two largest FREE-PROSE walls left in the pool:');
for (const e of topWalls) {
  say('    ' + String(e.free).padStart(5) + '  ' + e.id + '  ' + e.folder);
  say('           ' + e.title);
}
say('');
say('UNION (D-13-fixed firing OR D-15 reached)  ' + unionIds.size + '  ' +
  P(unionIds.size, text) + ' of text items');
