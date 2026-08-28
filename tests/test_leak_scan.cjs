'use strict';
/* =========================================================================
   26.91-12 — THE FIVE-CHANNEL LEAK SCAN, ARMED BY ITS OWN SUITE.

   WHAT THIS FILE IS FOR. `tests/lib/leak-scan.cjs` is the instrument that
   answers law-5's only interesting question: DID A FENCED NAME REACH A
   SURFACE? Until this wave that scan was an expression retyped into a
   browser console at each UAT. A scanner that has only ever been seen clean
   has not been TESTED; it has been WATCHED. So arming is part of the
   instrument here, not a ritual performed around it: this suite plants a
   leak in each of the five channels in a REAL Chrome, asserts the scan fires
   on all five, removes the probe, and asserts the same page then scans clean
   BESIDE A NON-ZERO NODE COUNT.

   THE 2026-08-07 OWNER UAT, BEAT 8, IS WHY THIS EXISTS. The ad-hoc scan was
   armed first and fired on all five channels (12 hits), and the clean rescan
   found no fenced term on any live surface — so the PASS stands. But three
   of the markup hits were SUBSTRING FALSE POSITIVES, and all three are
   reproduced below as named fixtures rather than as invented lookalikes.

   ---------------------------------------------------------------------
   THE WRITTEN ANTI-VACUITY AUDIT
   ---------------------------------------------------------------------
   1. CAN IT PASS BEFORE THE WORK? No. `findFencedHits` did not exist; the
      lift at the top of this file rethrows by NAME if the library is absent,
      rather than letting a module-resolution error read as an unrelated
      crash. Driven: the library was moved aside and this suite exited
      non-zero with that named reason.
   2. CAN IT PASS ONCE THE WORK IS BROKEN? No. Six mutations are driven
      against the matcher, each with a NAMED victim assertion, and each is
      recorded with the assertion it actually reddened — including the two
      that reddened a DIFFERENT assertion than the plan predicted, which is a
      finding and not a pass.
   3. WHAT DEGENERATE INPUT SATISFIES IT? An empty page: a scan over a page
      that failed to load returns zero hits and would read as clean. That is
      closed by the collector returning its own NODE COUNT and by every
      zero-hit assertion in the live group asserting that count NON-ZERO in
      the same run. An empty roster is closed the same way — the roster is
      pinned by value and by length before any scan is believed.
   4. IS THE CHECK A SOURCE READ OR AN EXECUTION? An execution, both halves.
      The pure half runs the shipped matcher over real snapshot objects; the
      live half runs it over a snapshot collected out of a real browser by
      the shipped page-side expression. Nothing here greps a source file for
      a string and calls that a measurement.

   ---------------------------------------------------------------------
   THE SILENT-BYPASS BAN, STATED BY CONCEPT — AND WHY IT IS STATED THAT WAY
   ---------------------------------------------------------------------
   A live gate whose runner is unavailable must FAIL, never quietly stand
   down. The two spellings of the verb that names that quiet stand-down — the
   lower-case one and the upper-case one — are GREP-BANNED FROM THIS FILE,
   and the gate that enforces the ban counts them at zero.

   NEITHER LITERAL IS WRITTEN ANYWHERE IN THIS FILE, INCLUDING IN THIS
   PARAGRAPH, AND THAT IS DELIBERATE. This project's convention is to write a
   gate's reason at its site; followed literally here, that convention would
   make the gate PERMANENTLY UNMEETABLE — the explanation would itself be the
   only violation. Measured on three variants of this very header: written
   with the literals the gate counts 1 and is RED with no defect present;
   written by concept it counts 0 and is GREEN; and with a real bypass
   planted on top of the concept form it counts 1 and is RED for the right
   reason. Plan 26.91-11 defused this identical trap for the retired reset
   label by rewriting three sites by concept; this is the same move.

   The enforcement is the gate, not this paragraph. There is no conditional
   early return anywhere below: if the browser is absent, `cdp.launch`
   throws by name and this process exits non-zero.

   ---------------------------------------------------------------------
   THE GREP BINARY IS PINNED, AND `\b` IS KEPT ON A MEASUREMENT
   ---------------------------------------------------------------------
   Two grep implementations are reachable on this machine and they do NOT
   agree. `/usr/bin/grep` is BSD grep 2.6.0-FreeBSD, a real Mach-O binary.
   `grep` on PATH is a SHELL FUNCTION installed by a Claude shell snapshot
   that re-execs the CLI under ARGV0=ugrep. Measured 2026-08-08 on one probe
   file holding the banned verb in both spellings, the lower-case spelling
   again mid-sentence, and two near misses formed by suffixing and prefixing
   it with letters:

     form                                          /usr/bin/grep   PATH grep
     \b<lower>\b|<UPPER>                                 3              3
     (^|[^A-Za-z0-9_])<lower>([^A-Za-z0-9_]|$)           2              0

   THE MEASUREMENT ABOVE IS WRITTEN BY CONCEPT FOR THE SAME REASON THE BAN
   IS. Its first draft spelled the two forms out and the gate immediately
   read 1 and went RED with no defect present — the trap closing on the
   paragraph that describes it. Recorded as driven, not as a near miss.

   The word-boundary form AGREES across both. The explicit-character-class
   alternative — recommended elsewhere "for portability" — DIVERGES, and
   under the PATH grep it matches NOTHING AT ALL, which would have left the
   ban green while banning nothing. So `\b` is KEPT and the BINARY is pinned
   by absolute path in every clause of the gate. That is a measurement, not
   an argument from POSIX memory. (The near-miss tokens above are written
   here only as descriptions, never as literals.)

   ---------------------------------------------------------------------
   THE MUTATION CAMPAIGN — 8 driven, each verified LANDED by sha256 before
   its exit code was believed, each reverted to a matching sha256
   ---------------------------------------------------------------------
     # target                                    reddened
     1 union -> INTERSECTION                     12c/word-spaces, 12c/word-
                                                 fullstop, 12c/word-comma,
                                                 12c/word-whole-string,
                                                 12d/processed-jd-hit,
                                                 12L/tracer-* (all 5), +21
     2 word rule removed (segment only)          the same set, plus
                                                 12g/segment-subset-of-word
     3 segment rule removed (word only)          12c/seg-*-rule (x3),
                                                 12b/fp-memoirs-positive-
                                                 rules, 12d/processed-jd-
                                                 segment-rule, 12g/segment-
                                                 fires, 12h/items-as-
                                                 directory-rule, 12L/both-
                                                 rules-live
     4 boundary relaxed to allow a trailing      12b/fp-memoirs-filename,
       letter                                    12c/neg-strict-prefix,
                                                 12c/neg-multiword-suffix
     5 toLowerCase() fold on the segment         12c/neg-case-segment,
       comparison                                12g/segment-subset-of-word
     6 the stable sort removed                   12f/stable-order
     7 COLLECTOR: own-text -> subtree text       12L/tracer-one-text-hit,
                                                 12L/tracer-path
     8 COLLECTOR: the `title` channel dropped    12L/five-channels

   MUTATION 1 IS THE ONE THAT PROVES PRECISION DID NOT COST DETECTION. With
   the union replaced by the intersection, the prose string
   "she opened her Memoir and read it again" yields ZERO hits, and so does
   "we pulled these from processed jd this morning". A sentence has no path
   separators, so under an AND the segment rule vetoes every prose leak. The
   union is what keeps a prose leak catchable.

   ⚠ TWO MUTATIONS REDDENED A DIFFERENT ASSERTION THAN THE PLAN PREDICTED.
   Both are FINDINGS, recorded rather than absorbed.

     • MUTATION 3 was predicted to make "the filename case yield a false hit
       again, reproducing the 2026-08-07 defect exactly". IT DID NOT.
       Measured: 12b/fp-memoirs-filename and 12c/neg-strict-prefix both
       stayed GREEN. The WORD rule alone already refuses "Memoirs" — `s` is
       a word character — so removing the segment rule cannot resurrect that
       defect. What went red instead was every SEGMENT-CLASSIFICATION
       assertion. This is the containment property of group (G) confirmed by
       driving: on the DETECTION axis the segment rule adds nothing, and its
       real contribution is telling a triager that a hit is a real directory
       name rather than a mention. The rule is NOT dead code — eight
       assertions die without it — but any claim that it is what closed the
       2026-08-07 false positive would be FALSE.

     • MUTATION 6 was predicted to redden "the idempotency assertion". IT DID
       NOT: 12f/idempotent stayed GREEN, because insertion order is ITSELF
       deterministic — two runs over one snapshot agree with or without the
       sort. What caught it was 12f/stable-order, which asserts the emitted
       ORDER by value. Without that assertion mutation 6 would have been
       GREEN across the board and the sort could have been deleted with
       nothing going red.

   MUTATIONS 7 AND 8 WERE ADDED BECAUSE THE PLAN'S SIX ALL TARGET THE
   MATCHER AND NONE TOUCHES THE COLLECTOR, WHICH IS HALF THE INSTRUMENT.
   Mutation 8 in particular is the mechanical enforcement of this plan's
   own prohibition: narrowing the channel set makes 12L/five-channels go
   red, so "do not narrow the channels" is a gate here and not a wish.

   ZERO DEPENDENCIES. Node built-ins plus the Node 26 globals `fetch` and
   `WebSocket` (used inside tests/lib/cdp.cjs). No package.json, no
   node_modules (law 8).
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* THE LIFT. A missing library must fail with a reason a reader can act on,
   never as a bare module-resolution stack trace two files away from the
   cause. */
let LS = null;
let cdp = null;
try {
  LS = require('./lib/leak-scan.cjs');
} catch (e) {
  throw new Error('test_leak_scan: could not load tests/lib/leak-scan.cjs — ' +
    'the leak scanner this suite exists to arm is ABSENT. Original: ' +
    e.message);
}
try {
  cdp = require('./lib/cdp.cjs');
} catch (e) {
  throw new Error('test_leak_scan: could not load tests/lib/cdp.cjs — the ' +
    'live half of this suite has no runner. A live gate whose runner is ' +
    'unavailable FAILS. Original: ' + e.message);
}

const { SCAN_EXPR, findFencedHits, SCAN_ROSTER, LAW5_FENCED_ROSTER,
  TRACE_NEVER_NAME_TERMS, CHANNELS } = LS;

let PASSED = 0;
const FAILURES = [];

function ok(cond, id, msg) {
  if (cond) { PASSED++; return; }
  FAILURES.push(id + ': ' + msg);
  console.error('FAIL ' + id + ' — ' + msg);
}

function eq(actual, expected, id, msg) {
  ok(actual === expected, id,
    msg + ' [expected ' + JSON.stringify(expected) + ', got ' +
    JSON.stringify(actual) + ']');
}

function deep(actual, expected, id, msg) {
  let same = true;
  try { assert.deepStrictEqual(actual, expected); } catch (e) { same = false; }
  ok(same, id, msg + ' [expected ' + JSON.stringify(expected) + ', got ' +
    JSON.stringify(actual) + ']');
}

function throwsNamed(fn, re, id, msg) {
  let threw = false;
  let text = '';
  try { fn(); } catch (e) { threw = true; text = String(e && e.message); }
  ok(threw && re.test(text), id,
    msg + ' [threw=' + threw + ', message=' + JSON.stringify(text) + ']');
}

/* ---- fixture helpers ---------------------------------------------------- */

function node(o) {
  return {
    path: o.path || 'html[1]>body[1]>div[1]',
    text: o.text || '',
    innerHTML: o.innerHTML || '',
    ariaLabel: o.ariaLabel || '',
    title: o.title || '',
    data: o.data || {}
  };
}

function snap(nodes) {
  return { count: nodes.length, bytes: 0, nodes: nodes };
}

function rulesOf(hits) { return hits.map(function (h) { return h.rule; }); }
function termsOf(hits) { return hits.map(function (h) { return h.term; }); }
function chansOf(hits) { return hits.map(function (h) { return h.channel; }); }

/* Every fixture built below is also pushed here, so group (G) can drive the
   segment-subset-of-word containment over the WHOLE corpus rather than over
   a case chosen to make it true. */
const CORPUS = [];
function fixture(nodes) {
  const s = snap(nodes);
  CORPUS.push(s);
  return s;
}

/* =========================================================================
   (A) THE CONSTANTS, PINNED BY VALUE
   ========================================================================= */
(function constants() {
  eq(CHANNELS.length, 5, '12a/channel-count',
    'THE FIVE CHANNELS ARE PINNED BY VALUE. Narrowing the channel set to ' +
    'make a scan quiet is forbidden: the 2026-08-07 finding was that the ' +
    'scan fired too BROADLY, not that it fired in the wrong places.');
  deep(Array.from(CHANNELS),
    ['textContent', 'innerHTML', 'aria-label', 'title', 'data-*'],
    '12a/channel-identity',
    'the five channels BY IDENTITY, in the order that decides stable hit ' +
    'ordering. A count alone would be satisfied by swapping one channel for ' +
    'another.');

  deep(Array.from(LAW5_FENCED_ROSTER),
    ['Memoir', 'personnel notes', 'billing & insurance notes', 'appraisal record'],
    '12a/law5-roster',
    'the law-5 fenced roster, matching tests/test_display_fence.cjs ' +
    'FENCED_ROSTER by value.');
  deep(Array.from(TRACE_NEVER_NAME_TERMS), ['processed jd', 'items'],
    '12a/never-name-terms',
    'the TRACE_NEVER_NAME string rules (app.js). Its third rule is a REGEXP ' +
    '(/^studyroom-collect-/) and is out of this roster\'s SHAPE by ' +
    'construction, not dropped by preference.');
  eq(SCAN_ROSTER.length, 6, '12a/scan-roster-count',
    'SCAN_ROSTER is the MERGE of both lists — 4 law-5 terms plus 2 ' +
    'never-name terms. Pinned by value: a vanished entry is a name that ' +
    'became scannable-for again without anyone deciding it should.');
  deep(Array.from(SCAN_ROSTER),
    ['Memoir', 'personnel notes', 'billing & insurance notes', 'appraisal record',
      'processed jd', 'items'],
    '12a/scan-roster-identity',
    'SCAN_ROSTER by identity and in order — roster order is the last ' +
    'tie-break in the stable hit ordering, so it is part of the contract.');
})();

/* =========================================================================
   (B) THE THREE 2026-08-07 FALSE POSITIVES, EACH BY NAME

   Reproduced from the UAT evidence report (beat 8), not invented. Each
   negative is PAIRED with a positive control on the SAME shape, because a
   matcher that found nothing at all would satisfy every negative here.
   ========================================================================= */
(function falsePositives() {
  /* --- FP 1 and 2: ONE reflection spine, TWO channels carrying the same
     filename. The UAT counted it twice for that reason. The filename
     contains `Memoirs`; the fenced folder is `Memoir`. ----------------- */
  const spineLabel = 'Memoirs and what they hold — a reflection 2026-07-14.md';
  const spine = fixture([node({
    path: 'html[1]>body[1]>div[1]>button[3]',
    ariaLabel: spineLabel,
    title: spineLabel
  })]);
  const spineHits = findFencedHits(spine, SCAN_ROSTER);
  eq(spineHits.length, 0, '12b/fp-memoirs-filename',
    'THE 2026-08-07 FALSE POSITIVE, FIRST AND SECOND HITS. A reflection ' +
    'spine whose aria-label AND title are the same FILENAME containing ' +
    '"Memoirs" must yield ZERO hits for the roster term "Memoir". It is a ' +
    'Claude-authored reflection on the reflections shelf, not the fenced ' +
    'Memoir/ folder. The ad-hoc scan used SUBSTRING matching and fired ' +
    'twice — once per channel carrying the string. Got: ' +
    JSON.stringify(spineHits));

  /* the positive control, on the SAME element shape — otherwise the
     assertion above is satisfied by a matcher that finds nothing at all. */
  const spineReal = fixture([node({
    path: 'html[1]>body[1]>div[1]>button[3]',
    ariaLabel: 'Memoir/2026-07-14.md',
    title: 'she wrote it in her Memoir that week'
  })]);
  const spineRealHits = findFencedHits(spineReal, SCAN_ROSTER);
  eq(spineRealHits.length, 2, '12b/fp-memoirs-positive-control',
    'POSITIVE CONTROL for the assertion above, on the same element shape: a ' +
    'REAL leak in those same two channels must still be caught. Got: ' +
    JSON.stringify(spineRealHits));
  deep(rulesOf(spineRealHits), ['segment', 'word'],
    '12b/fp-memoirs-positive-rules',
    'and each names the rule that saw it — aria-label is a PATH whose ' +
    'segment equals the term (segment), title is PROSE naming it (word). ' +
    'Channel order decides which comes first.');

  /* --- FP 3: the bare `record` hit, carried by no element attribute and
     appearing in no visible text — it lived only inside markup, inside
     longer words. The roster term is the two-word `appraisal record`. --- */
  const recordish = fixture([node({
    path: 'html[1]>body[1]>section[2]>p[1]',
    innerHTML: '<b class="recordbook">a recording of the week</b>'
  })]);
  const recordHits = findFencedHits(recordish, SCAN_ROSTER);
  eq(recordHits.length, 0, '12b/fp-bare-record',
    'THE 2026-08-07 FALSE POSITIVE, THIRD HIT. A node whose innerHTML ' +
    'carries "record" only INSIDE longer tokens ("recordbook", ' +
    '"recording"), with no element attribute carrying it and no visible ' +
    'text showing it, must yield ZERO hits. The roster term is the TWO-WORD ' +
    '"appraisal record"; the ad-hoc scan evidently matched a TOKEN of it. ' +
    'The shipped matcher treats a multi-word term as ONE literal. Got: ' +
    JSON.stringify(recordHits));

  const recordReal = fixture([node({
    path: 'html[1]>body[1]>section[2]>p[1]',
    innerHTML: '<b class="recordbook">from the appraisal record, 2026</b>'
  })]);
  const recordRealHits = findFencedHits(recordReal, SCAN_ROSTER);
  eq(recordRealHits.length, 1, '12b/fp-record-positive-control',
    'POSITIVE CONTROL for the assertion above: the FULL two-word term, ' +
    'flanked by a space and a comma inside the same markup, IS caught. ' +
    'Without this the negative above is satisfied by a matcher that finds ' +
    'nothing. Got: ' + JSON.stringify(recordRealHits));
  deep(rulesOf(recordRealHits), ['word'], '12b/fp-record-positive-rule',
    'and it is the WORD rule that saw it — the string holds no path ' +
    'separator, so the segment rule has nothing to say about it.');
})();

/* =========================================================================
   (C) THE BOUNDARY CASES — one step either side of BOTH rules

   This is where a substring implementation and a too-narrow implementation
   each betray themselves. Every case is a separately-messaged assertion.
   ========================================================================= */
(function boundaries() {
  function hitsForLabel(label) {
    return findFencedHits(fixture([node({ ariaLabel: label })]), SCAN_ROSTER);
  }
  function hitsForText(text) {
    return findFencedHits(fixture([node({ text: text })]), SCAN_ROSTER);
  }

  /* ---- POSITIVE: the path rule, at all three positions ---------------- */
  let h = hitsForLabel('vault/Memoir/2026-07-14.md');
  eq(h.length, 1, '12c/seg-middle',
    'an exact path segment with a separator on EACH side is a hit.');
  eq(h[0] && h[0].rule, 'segment', '12c/seg-middle-rule',
    'and it is classified as a SEGMENT hit — the shipped fence key: ' +
    'item["folder"] is the immediate parent name (study_lib.py:349) and ' +
    '_origin_under_roster compares the first vault-relative segment ' +
    '(:1559-1586).');

  h = hitsForLabel('Memoir/2026-07-14.md');
  eq(h.length, 1, '12c/seg-start',
    'the term at the START of a path, with a separator only AFTER it, is a ' +
    'hit. A rule that required a leading separator would miss every ' +
    'vault-relative path, which is the exact shape _origin_under_roster ' +
    'matches on.');
  eq(h[0] && h[0].rule, 'segment', '12c/seg-start-rule', 'classified segment.');

  h = hitsForLabel('Claude notes/personnel notes');
  eq(h.length, 1, '12c/seg-end',
    'the term at the END of a path, with a separator only BEFORE it, is a ' +
    'hit — and it is a MULTI-WORD term, which is why the boundary test is ' +
    'written as an explicit character test rather than a \\b regex.');
  eq(h[0] && h[0].rule, 'segment', '12c/seg-end-rule', 'classified segment.');

  /* ---- POSITIVE: the prose rule, flanked three different ways --------- */
  h = hitsForText('she opened her Memoir and read it again');
  eq(h.length, 1, '12c/word-spaces',
    'the term in prose flanked by SPACES is a hit.');
  eq(h[0] && h[0].rule, 'word', '12c/word-spaces-rule', 'classified word.');

  h = hitsForText('and then she closed the Memoir.');
  eq(h.length, 1, '12c/word-fullstop',
    'the term in prose flanked by a space and a FULL STOP is a hit. Per ' +
    'D-04 the fence suppresses whole folders and some of those folder names ' +
    'are ordinary English words: a rule precise on "Memoirs" and blind on ' +
    '"Memoir." at the end of a sentence would have traded one defect for ' +
    'another.');
  eq(h[0] && h[0].rule, 'word', '12c/word-fullstop-rule', 'classified word.');

  h = hitsForText('Memoir, and some notes from elsewhere');
  eq(h.length, 1, '12c/word-comma',
    'the term at the start of a string flanked by a COMMA is a hit.');
  eq(h[0] && h[0].rule, 'word', '12c/word-comma-rule', 'classified word.');

  h = hitsForText('Memoir');
  eq(h.length, 1, '12c/word-whole-string',
    'the term as the WHOLE string, with no flanking characters at all, is a ' +
    'hit. Both string edges count as boundaries; an implementation that ' +
    'read charAt(-1) or charAt(len) as a word character would lose this.');
  eq(h[0] && h[0].rule, 'word', '12c/word-whole-string-rule',
    'classified word — no separator in the string, so no segment claim.');

  /* ---- NEGATIVE: one step over the line, both directions -------------- */
  h = hitsForLabel('vault/Memoirs/2026-07-14.md');
  eq(h.length, 0, '12c/neg-strict-prefix',
    'the term as a strict PREFIX of a longer path segment is NOT a hit. ' +
    'This is the 2026-08-07 defect in its path form.');

  h = hitsForLabel('vault/MyMemoir/2026-07-14.md');
  eq(h.length, 0, '12c/neg-strict-suffix',
    'the term as a strict SUFFIX of a longer path segment is NOT a hit.');

  h = hitsForText('memoir');
  eq(h.length, 0, '12c/neg-case-lower',
    'a term differing only in CASE is NOT a hit. Comparison is exact and ' +
    'case-sensitive with no normalisation, trimming or Unicode folding, so ' +
    'a future fold that merged two roster terms\' fates goes red here.');

  h = hitsForLabel('vault/memoir/2026-07-14.md');
  eq(h.length, 0, '12c/neg-case-segment',
    'the segment rule is case-sensitive too — a lower-cased directory name ' +
    'is not the fenced one.');

  h = hitsForText('personnel notesness is not the folder');
  eq(h.length, 0, '12c/neg-multiword-suffix',
    'a MULTI-WORD term as a strict prefix of a longer token is NOT a hit. ' +
    'This is the case a \\b regex around a term containing a space handles ' +
    'least intuitively, and the reason the boundary test is explicit.');

  h = hitsForText('unMemoir');
  eq(h.length, 0, '12c/neg-prose-prefix-char',
    'a word character immediately BEFORE the term blocks the word rule.');
})();

/* =========================================================================
   (D) `processed jd`, PER D-10 — and the proof the WIDER roster is
       load-bearing rather than decorative
   ========================================================================= */
(function neverName() {
  const f = fixture([node({
    text: 'we pulled these from processed jd this morning'
  })]);

  const wide = findFencedHits(f, SCAN_ROSTER);
  eq(wide.length, 1, '12d/processed-jd-hit',
    'D-10 (OWNER RULING, 2026-08-06): "processed jd" is NEVER NAMED on a ' +
    'surface. The law-5 fence PERMITS that folder — it holds nothing fenced ' +
    '— which is exactly why the scanner needs the wider roster. A-11 ' +
    'records what happens when a control is assumed rather than measured; ' +
    'this assertion is what stops the never-name list being a policy nobody ' +
    'checks. Got: ' + JSON.stringify(wide));
  eq(wide[0] && wide[0].term, 'processed jd', '12d/processed-jd-term',
    'and the hit names the term, so a report can be audited.');

  eq(LAW5_FENCED_ROSTER.indexOf('processed jd'), -1, '12d/not-in-law5',
    '"processed jd" is NOT in the law-5 roster — stated by measurement, ' +
    'because the whole argument for merging the two lists rests on it.');
  const narrow = findFencedHits(f, LAW5_FENCED_ROSTER);
  eq(narrow.length, 0, '12d/law5-alone-misses-it',
    'DRIVEN: the SAME snapshot scanned against the law-5 roster ALONE ' +
    'returns ZERO hits. A scanner checking only that roster would report ' +
    'this surface CLEAN while speaking a term she ruled must never be ' +
    'spoken. This is the assertion that makes the merge load-bearing ' +
    'instead of decorative.');

  const p = findFencedHits(fixture([node({
    ariaLabel: 'Job Application Tracker/processed jd/Anthropic — TS.md'
  })]), SCAN_ROSTER);
  eq(p.length, 1, '12d/processed-jd-segment',
    'and it is caught as a real directory name too.');
  eq(p[0] && p[0].rule, 'segment', '12d/processed-jd-segment-rule',
    'classified segment — the folder lives under Job Application Tracker/, ' +
    'which is why _origin_under_roster (first-segment) and this folder ' +
    'never meet, and why the never-name list had to be trace-scoped.');
})();

/* =========================================================================
   (E) DEGENERATE INPUT — an empty page must never read as a clean page
   ========================================================================= */
(function degenerate() {
  const populated = snap([node({ text: 'she opened her Memoir' })]);

  let empty = null;
  let threw = false;
  try { empty = findFencedHits(populated, []); } catch (e) { threw = true; }
  ok(!threw && Array.isArray(empty) && empty.length === 0,
    '12e/empty-roster',
    'an EMPTY roster yields zero hits and does NOT throw. Combined with the ' +
    'by-value roster pin in (A), a silently emptied roster is a failure ' +
    'there rather than a quiet clean scan here.');

  let none = null;
  threw = false;
  try {
    none = findFencedHits({ count: 0, bytes: 0, nodes: [] }, SCAN_ROSTER);
  } catch (e) { threw = true; }
  ok(!threw && Array.isArray(none) && none.length === 0,
    '12e/empty-snapshot',
    'an EMPTY node snapshot yields zero hits and does NOT throw — but the ' +
    'snapshot carries its own COUNT, and every live zero-hit assertion ' +
    'asserts that count NON-ZERO in the same run. That pairing is what ' +
    'stops a page that failed to load reading as a page with nothing on it.');

  throwsNamed(function () { findFencedHits(null, SCAN_ROSTER); },
    /snapshot must be an object/, '12e/throws-null-snapshot',
    'a MISSING snapshot throws with a named reason — it never returns an ' +
    'empty hit list, which would report a page clean that was never read.');

  throwsNamed(function () { findFencedHits({ count: 1 }, SCAN_ROSTER); },
    /snapshot\.nodes must be an array/, '12e/throws-no-nodes',
    'a snapshot without a nodes array throws by name.');

  throwsNamed(function () {
    findFencedHits({ nodes: [], bytes: 0 }, SCAN_ROSTER);
  }, /snapshot\.count must be a finite number/, '12e/throws-no-count',
    'a snapshot without a node COUNT is REFUSED rather than scanned — the ' +
    'count is the only thing distinguishing an empty page from a clean one.');

  throwsNamed(function () { findFencedHits(populated, null); },
    /roster must be an array/, '12e/throws-null-roster',
    'an ABSENT roster is refused, never treated as an empty one. Silently ' +
    'scanning for nothing is the purest form of a gate that cannot fail.');

  throwsNamed(function () { findFencedHits(populated, [/^Memoir/]); },
    /is not a string/, '12e/throws-regexp-roster',
    'a RegExp roster rule throws by name rather than being silently ' +
    'ignored. TRACE_NEVER_NAME\'s /^studyroom-collect-/ has no ' +
    'word-boundary or path-segment meaning here, and dropping it QUIETLY ' +
    'is how a rule stops being enforced without anyone deciding it should.');
})();

/* =========================================================================
   (F) IDEMPOTENCY, ORDER, AND PURITY
   ========================================================================= */
(function stability() {
  const s = fixture([
    node({ path: 'a[1]', text: 'her Memoir and the items on the desk',
      ariaLabel: 'vault/personnel notes/x.md',
      data: { 'data-zeta': 'processed jd', 'data-alpha': 'Memoir' } }),
    node({ path: 'a[2]', title: 'billing & insurance notes',
      text: 'the appraisal record' })
  ]);

  const first = findFencedHits(s, SCAN_ROSTER);
  const second = findFencedHits(s, SCAN_ROSTER);
  ok(JSON.stringify(first) === JSON.stringify(second), '12f/idempotent',
    'two calls over the SAME snapshot return a BYTE-IDENTICAL hit list. The ' +
    'scanner holds no state between calls, so a diff between two runs means ' +
    'the PAGE changed.');
  ok(first.length > 0, '12f/idempotent-non-vacuous',
    'and the list is non-empty, so the equality above is not the trivial ' +
    'agreement of two empty arrays. Got ' + first.length + ' hits.');

  /* the STABLE ORDER, asserted as the emitted sequence rather than
     described. Document order, then channel order, then data-* attribute
     name, then roster order. */
  deep(first.map(function (h) {
    return [h.path, h.channel, String(h.attr), h.term].join('|');
  }), [
    'a[1]|textContent|null|Memoir',
    'a[1]|textContent|null|items',
    'a[1]|aria-label|null|personnel notes',
    'a[1]|data-*|data-alpha|Memoir',
    'a[1]|data-*|data-zeta|processed jd',
    'a[2]|textContent|null|appraisal record',
    'a[2]|title|null|billing & insurance notes'
  ], '12f/stable-order',
    'THE STABLE ORDER, BY VALUE. Document order first (a[1] before a[2]), ' +
    'then CHANNEL order (textContent before aria-label before data-*), then ' +
    'data-* ATTRIBUTE NAME (data-alpha before data-zeta, though data-zeta ' +
    'was declared first), then ROSTER order (Memoir before items). Hits ' +
    'are COLLECTED roster-outer — which is how the ad-hoc 2026-08-07 scan ' +
    'was written, one pass per term — so the final sort is doing real work ' +
    'and is not decoration.');

  const before = JSON.stringify(s);
  findFencedHits(s, SCAN_ROSTER);
  eq(JSON.stringify(s), before, '12f/pure',
    'the matcher is a PURE function of (snapshot, roster): the snapshot is ' +
    'byte-unchanged after a call. It reads no clock, no store and no ' +
    'global, so two scans cannot observe a partially-built roster.');
})();

/* =========================================================================
   (G) THE CONTAINMENT PROPERTY, DRIVEN OVER THE WHOLE CORPUS

   ⚠ THIS GROUP EXISTS BECAUSE A MESSAGE MUST NOT OVER-CLAIM WHAT IT
   MEASURES. On the DETECTION axis the segment rule is a strict SUBSET of
   the word rule, by construction: a segment match is flanked by `/` or by a
   string edge, both outside [A-Za-z0-9_], so the word rule fires at the
   same index. The union's HIT SET therefore equals the word rule's hit set,
   and the segment rule's real contribution is CLASSIFICATION. Saying
   otherwise — claiming the segment rule is what refuses "Memoirs" — would
   be false: the WORD rule already refuses it. That is driven here rather
   than argued, over every fixture built above, so a future edit that breaks
   the relationship is visible instead of assumed.
   ========================================================================= */
(function containment() {
  let total = 0;
  let withSegment = 0;
  let wordOnly = 0;
  let missingWord = 0;
  for (let i = 0; i < CORPUS.length; i++) {
    const hits = findFencedHits(CORPUS[i], SCAN_ROSTER);
    for (let j = 0; j < hits.length; j++) {
      total++;
      const r = hits[j].rules;
      if (r.indexOf('word') === -1) missingWord++;
      if (r.indexOf('segment') !== -1) withSegment++;
      else wordOnly++;
    }
  }
  ok(total > 0, '12g/corpus-non-empty',
    'the corpus produced hits at all — otherwise every claim below is ' +
    'vacuous. Fixtures: ' + CORPUS.length + ', hits: ' + total + '.');
  eq(missingWord, 0, '12g/segment-subset-of-word',
    'EVERY hit in the corpus has the WORD rule among the rules that fired ' +
    '(' + total + ' hits checked). This is the containment property stated ' +
    'in leak-scan.cjs, MEASURED: the segment rule never detects anything ' +
    'the word rule missed. If this ever reads non-zero the relationship has ' +
    'changed and the header must change with it.');
  ok(withSegment > 0, '12g/segment-fires',
    'and the segment rule DOES fire somewhere in the corpus (' + withSegment +
    ' hits), so the containment above is not the vacuous truth of a rule ' +
    'that never runs.');
  ok(wordOnly > 0, '12g/word-only-exists',
    'and some hits fired on the word rule ALONE (' + wordOnly + '), so the ' +
    'two rules are genuinely distinct rather than two names for one check.');
})();

/* =========================================================================
   (H) THE `items` NOISE PROPERTY, DRIVEN RATHER THAN REDISCOVERED

   `items` is in TRACE_NEVER_NAME because it is the store's own directory
   name. As a prose word it is ordinary English, and under the word rule it
   matches inside `align-items` — the hyphen is not a word character on
   either side. Measured 2026-08-08: the shipped tokens.css carries 15
   word-boundary occurrences of `items`, 13 of them `align-items`. On the
   REAL app page those bytes never enter the DOM (index.html:7 loads the
   stylesheet with <link rel="stylesheet">), which is why this is a property
   to KNOW rather than a leak to fix. Narrowing `items` to the path rule
   alone would make the scan quieter, and that is an OWNER decision, not a
   tidy-up — routed to deferred-items.md.
   ========================================================================= */
(function itemsNoise() {
  const h = findFencedHits(fixture([node({
    text: '.row{display:flex;align-items:center;}'
  })]), SCAN_ROSTER);
  eq(h.length, 1, '12h/align-items-fires',
    'the roster term "items" DOES match inside "align-items" under the word ' +
    'rule, because the hyphens flanking it are not word characters. Stated ' +
    'as a driven property so it is known, not discovered at a UAT.');
  eq(h[0] && h[0].term, 'items', '12h/align-items-term',
    'and the hit names the term, so the report is triageable.');
  eq(h[0] && h[0].rule, 'word', '12h/align-items-rule',
    'classified word, not segment — it is a mention, not a directory name.');

  const seg = findFencedHits(fixture([node({
    ariaLabel: 'library/items/3f9a.json'
  })]), SCAN_ROSTER);
  eq(seg.length, 1, '12h/items-as-directory',
    'and the leak shape the never-name rule actually exists for — "items" ' +
    'as a real directory segment — is caught and classified differently.');
  eq(seg[0] && seg[0].rule, 'segment', '12h/items-as-directory-rule',
    'classified segment. THIS is what the rule field buys: two hits on the ' +
    'same term that a triager must treat differently.');
})();

console.log('test_leak_scan: pure matcher groups (A)-(H) complete with NO ' +
  'browser — ' + PASSED + ' assertions so far. Collection and matching are ' +
  'genuinely separable; the matcher\'s unit coverage does not depend on ' +
  'Chrome being installed.');

/* =========================================================================
   (M) 26.91-42 — THE DERIVED UNION, AND THE VACUITY GATE THAT GUARDS IT.

   ⚠ THE DEFECT BEING REPAIRED IS A CHECKER THAT RETURNED A COMFORTABLE ZERO.
   A FIX THAT PRODUCES ANOTHER COMFORTABLE ZERO IS INDISTINGUISHABLE FROM THE
   BUG. So the four cases below each print a MEASURED NUMBER and never a
   verdict word, and the number of cases actually executed is asserted BY
   VALUE — because at 26.91-37 a checker living in a shell variable never ran
   while three of four cases still printed "RED, as required".

   THE FOUR CASES:
     (a) a planted real folder name under the SHIPPED roster alone  -> 0
         (the defect, REPRODUCED — this is the zero that must be explained)
     (b) the same plant under the DERIVED UNION -> non-zero on every channel,
         with word-boundary and path-segment counts reported SEPARATELY
     (c) THE CONTROL — a shipped EXAMPLE term under the shipped roster alone
         -> non-zero. This is what makes (a)'s zero a real zero rather than a
         broken rig. Without it, a matcher that returned [] for everything
         would pass (a) and (d) and look healthy.
     (d) the plant removed, under the union -> 0

   ⚠ HER REAL FOLDER NAMES ARE NEVER WRITTEN INTO THIS FILE. The plant term is
   read from her store at runtime, used, and never printed. If her store is not
   readable this group FAILS — it does not skip. A gate that quietly stops
   checking is the whole defect class this phase has been chasing.
   ========================================================================= */
(function unionGate() {
  // 26.91-42: DERIVED, never written down. An absolute home path in a tracked
  // file ships the owner's name and home directory — the publish gate caught
  // exactly that here, on the same run that repaired the blind scanner. The
  // default library root is <home>/StudyRoom; resolve it rather than spell it.
  const STORE = path.join(os.homedir(), 'StudyRoom', 'items.json');

  let store = null;
  let storeErr = '';
  try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch (e) { storeErr = (e && e.message) ? e.message : String(e); }

  ok(store !== null, '12m/store-readable',
    'her store is readable, so this group can plant one of her REAL folder ' +
    'names rather than a stand-in. A skip here would leave the union ' +
    'untested against the only names it exists for. Error: ' + storeErr);
  if (store === null) return;

  const stored = store.meta && store.meta[LS.STORE_ROSTER_KEY];
  ok(Array.isArray(stored) && stored.length > 0, '12m/store-roster-present',
    'and it carries a non-empty ' + LS.STORE_ROSTER_KEY + '.');
  if (!Array.isArray(stored) || stored.length === 0) return;

  const multi = stored.filter(function (t) { return String(t).indexOf(' ') !== -1; });
  ok(multi.length > 0, '12m/store-has-multiword',
    'at least one stored term is multi-word. The multi-word terms are the ' +
    'unambiguous ones to plant: the single-word term is an ordinary English ' +
    'word and would confound a plant with ambient noise.');
  if (multi.length === 0) return;

  const PLANT = multi[0];

  /* the derived union, and its provenance */
  const derived = LS.deriveScanRoster(SCAN_ROSTER, store);

  ok(Array.isArray(derived.terms), '12m/derive-shape',
    'deriveScanRoster returns a terms array ready for findFencedHits.');
  ok(derived.terms.length >= SCAN_ROSTER.length, '12m/union-never-shorter',
    'the union term list is NEVER shorter than the shipped roster. Got ' +
    derived.terms.length + ' vs shipped ' + SCAN_ROSTER.length + '.');
  eq(derived.provenance.length, derived.terms.length, '12m/provenance-parallel',
    'every term carries provenance — a scan that cannot say what it was ' +
    'looking for, and where each term came from, is not evidence.');
  ok(derived.provenance.every(function (p) {
    return LS.PROVENANCE.indexOf(p.origin) !== -1;
  }), '12m/provenance-vocabulary',
    'and every provenance value is one of the declared vocabulary.');

  /* the plant, on all five channels */
  function plantedSnapshot(term) {
    return {
      count: 2,
      bytes: 400,
      nodes: [
        { path: 'html[1]>body[1]>div[1]',
          text: 'a note filed under ' + term + ' today',
          innerHTML: '<span>' + term + '</span>',
          ariaLabel: 'open ' + term,
          title: term,
          data: { 'data-folder': 'vault/' + term + '/notes.md' } },
        { path: 'html[1]>body[1]>div[2]',
          text: '', innerHTML: '', ariaLabel: '', title: '', data: {} }
      ]
    };
  }

  const CASES = [];
  const planted = plantedSnapshot(PLANT);

  /* ---- CASE (a): THE DEFECT, REPRODUCED ---- */
  const caseA = findFencedHits(planted, SCAN_ROSTER).length;
  CASES.push({ id: 'a', label: 'plant / SHIPPED roster alone', measured: caseA });
  eq(caseA, 0, '12m/case-a-defect-reproduced',
    'CASE (a): a planted REAL folder name scores ' + caseA + ' hits under the ' +
    'shipped roster alone. That zero IS the defect — the instrument whose job ' +
    'is finding her folder names cannot see them. It is reproduced here so ' +
    'the green that follows is evidence rather than a comfortable zero.');

  /* ---- CASE (b): THE UNION SEES IT, ON EVERY CHANNEL ---- */
  const hitsB = findFencedHits(planted, derived.terms);
  const caseB = hitsB.length;
  const chanB = Array.from(new Set(hitsB.map(function (h) { return h.channel; }))).sort();
  const wordB = hitsB.filter(function (h) { return h.rules.indexOf('word') !== -1; }).length;
  const segB = hitsB.filter(function (h) { return h.rules.indexOf('segment') !== -1; }).length;
  CASES.push({ id: 'b', label: 'plant / DERIVED UNION', measured: caseB });
  ok(caseB > 0, '12m/case-b-union-sees',
    'CASE (b): the same plant scores ' + caseB + ' hits under the derived ' +
    'union. Non-zero is the whole point.');
  eq(chanB.length, CHANNELS.length, '12m/case-b-every-channel',
    'and it fires on ALL ' + CHANNELS.length + ' channels, not just the easy ' +
    'one. Lit: ' + JSON.stringify(chanB));
  ok(wordB > 0, '12m/case-b-word-count',
    'word-boundary rule fired on ' + wordB + ' of them (reported separately ' +
    'from segment, because one number hides which rule is doing the work).');
  ok(segB > 0, '12m/case-b-segment-count',
    'path-segment rule fired on ' + segB + ' of them — the plant includes a ' +
    'real directory-shaped string, so the classifying rule must fire too.');

  /* ---- CASE (c): THE CONTROL, UNMUTATED, IN THE SAME RUN ---- */
  const controlTerm = LAW5_FENCED_ROSTER[1];
  const controlSnap = plantedSnapshot(controlTerm);
  const caseC = findFencedHits(controlSnap, SCAN_ROSTER).length;
  CASES.push({ id: 'c', label: 'CONTROL: shipped example term / shipped roster', measured: caseC });
  ok(caseC > 0, '12m/case-c-control-alive',
    'CASE (c) THE CONTROL: a SHIPPED EXAMPLE term, scanned with the SHIPPED ' +
    'roster alone, scores ' + caseC + ' hits. This is what makes case (a)\'s ' +
    'zero mean something. A matcher that returned [] for every input would ' +
    'pass (a) and (d) and look perfectly healthy; it dies here. 26.91-37 is ' +
    'the precedent — a mutation harness aborted early and reported 1 failure ' +
    'where there were 4, caught only by an unmutated control.');

  /* ---- CASE (d): PLANT REMOVED ---- */
  const cleanSnap = {
    count: 2, bytes: 40,
    nodes: [
      { path: 'html[1]>body[1]>div[1]', text: 'a note filed under something else today',
        innerHTML: '<span>ordinary</span>', ariaLabel: 'open a note',
        title: 'a note', data: { 'data-folder': 'vault/elsewhere/notes.md' } },
      { path: 'html[1]>body[1]>div[2]', text: '', innerHTML: '', ariaLabel: '', title: '', data: {} }
    ]
  };
  const caseD = findFencedHits(cleanSnap, derived.terms).length;
  CASES.push({ id: 'd', label: 'plant REMOVED / union', measured: caseD });
  eq(caseD, 0, '12m/case-d-clean',
    'CASE (d): with the plant removed the same union scans clean — ' + caseD +
    ' hits. Paired with (c) this is a real zero: the rig was demonstrably ' +
    'alive in the same run.');
  ok(cleanSnap.count > 0, '12m/case-d-non-vacuous',
    'and the clean snapshot carries a NON-ZERO node count, so an empty page ' +
    'cannot be mistaken for a clean page.');

  /* ---- THE CASE COUNT, ASSERTED BY VALUE (26.91-37) ---- */
  eq(CASES.length, 4, '12m/case-count-by-value',
    'FOUR cases actually EXECUTED and recorded their measured numbers. This ' +
    'is asserted BY VALUE because at 26.91-37 a checker in a shell variable ' +
    'never ran while three of four cases still printed a verdict word. A run ' +
    'that prints four verdicts and executed two must FAIL here.');
  console.log('  12m FOUR-CASE VACUITY GATE (measured numbers, no verdict words):');
  CASES.forEach(function (c) {
    console.log('    (' + c.id + ') ' + c.label + ' -> ' + c.measured + ' hits');
  });
  console.log('    cases executed = ' + CASES.length +
    ' | case (b) channels lit = ' + chanB.length + '/' + CHANNELS.length +
    ' | word=' + wordB + ' segment=' + segB);

  /* ---- REQUIRED STORE: ABSENT AND MALFORMED BOTH THROW ---- */
  throwsNamed(function () { LS.deriveScanRoster(SCAN_ROSTER, undefined); },
    /REQUIRED/, '12m/absent-store-throws',
    'an ABSENT store THROWS with a named reason rather than falling back to ' +
    'the shipped roster. A fallback here would let a caller whose store read ' +
    'failed scan blind and report CLEAN — this file\'s own stated law, ' +
    'applied to the new function.');
  throwsNamed(function () { LS.deriveScanRoster(SCAN_ROSTER, null); },
    /REQUIRED/, '12m/null-store-throws',
    'and null is refused on the same grounds.');
  throwsNamed(function () {
    LS.deriveScanRoster(SCAN_ROSTER, { meta: { fenced_roster: 'Memoir' } });
  }, /must be an array/, '12m/non-list-roster-throws',
    'a roster key holding a NON-LIST throws — a string would otherwise be ' +
    'iterated character by character and scan for nothing.');
  throwsNamed(function () {
    LS.deriveScanRoster(SCAN_ROSTER, { meta: { fenced_roster: ['ok', 7] } });
  }, /not a string/, '12m/non-string-entry-throws',
    'and a non-string ENTRY throws rather than being silently ignored.');
  throwsNamed(function () { LS.deriveScanRoster(SCAN_ROSTER, { }); },
    /an absent roster is REFUSED|must be an object/i, '12m/absent-meta-throws',
    'a store with no meta at all is refused, never treated as empty.');

  /* ---- THE ASYMMETRY: EMPTY STORED LIST WIDENS, NEVER NARROWS ---- */
  const emptyStored = LS.deriveScanRoster(SCAN_ROSTER, { meta: { fenced_roster: [] } });
  eq(emptyStored.terms.length, SCAN_ROSTER.length, '12m/empty-widens-not-narrows',
    'A PRESENT-BUT-EMPTY stored list yields the SHIPPED ROSTER (' +
    emptyStored.terms.length + ' terms), never nothing. This is the single ' +
    'place where copying _active_roster\'s empty-list branch — right for a ' +
    'FENCE, which acts on what it is told to hide — would put the whole ' +
    'defect back through the front door. A CHECKER may never be made blinder ' +
    'by a value in her store.');
  const emptyHits = findFencedHits(controlSnap, emptyStored.terms).length;
  ok(emptyHits > 0, '12m/empty-widens-still-fires',
    'and that roster still FIRES (' + emptyHits + ' hits on the control) — ' +
    'the previous assertion would also pass if both were zero-length.');

  /* ---- LAW 5: THE UNION ONLY WIDENS, PROVEN OVER THE WHOLE CORPUS ---- */
  /* THE WHOLE EXISTING FIXTURE CORPUS — every snapshot groups (A)-(H)
     built via fixture() — plus this group's three. Using the real CORPUS
     is the point: a hand-rolled list would prove the union widens only on
     cases chosen to make it widen. */
  const corpus = CORPUS.concat([planted, controlSnap, cleanSnap]);
  let supersetHolds = 0;
  let widened = 0;
  corpus.forEach(function (snap, i) {
    const base = findFencedHits(snap, SCAN_ROSTER);
    const uni = findFencedHits(snap, derived.terms);
    const key = function (h) {
      return h.path + '|' + h.channel + '|' + (h.attr || '') + '|' + h.term;
    };
    const uniKeys = new Set(uni.map(key));
    const contained = base.every(function (h) { return uniKeys.has(key(h)); });
    if (contained) supersetHolds++;
    if (uni.length > base.length) widened++;
    ok(contained, '12m/superset-fixture-' + i,
      'fixture ' + i + ': every hit the SHIPPED roster finds (' + base.length +
      ') is also found by the UNION (' + uni.length + '). LAW 5 IS ABSOLUTE: ' +
      'the union WIDENS and narrows NOTHING. Driven over the corpus, never ' +
      'asserted in prose.');
  });
  eq(supersetHolds, corpus.length, '12m/superset-corpus-by-value',
    'and the superset property held on ALL ' + corpus.length + ' fixtures ' +
    'actually driven — the count asserted by value so a loop that silently ' +
    'stopped early cannot read as a pass.');
  ok(widened > 0, '12m/superset-non-vacuous',
    'and on ' + widened + ' of them the union found STRICTLY MORE than the ' +
    'shipped roster. Without this, a union identical to the shipped roster ' +
    'would satisfy every superset assertion above and change nothing.');

  /* ---- THE MEASURED NOISE, NAMED AND KEPT — THE `items` TRADITION ---- */
  const singles = stored.filter(function (t) { return String(t).indexOf(' ') === -1; });
  if (singles.length > 0) {
    const NOISY = singles[0];
    const noiseSnap = snap([node({
      text: 'filed in ' + NOISY + ' analysis for later'
    })]);
    const noiseHits = findFencedHits(noiseSnap, derived.terms);
    ok(noiseHits.length > 0, '12m/single-word-noise-measured',
      'MEASURED NOISE, NAMED AND KEPT: her single-word stored term is an ' +
      'ordinary English word, so under the word-boundary rule it fires on ' +
      'ordinary phrases like "<term> analysis" — ' + noiseHits.length +
      ' hit(s) here. THIS IS DRIVEN AS A FIXTURE RATHER THAN LEFT TO BE ' +
      'REDISCOVERED AT A UAT, exactly as `items` is at group (H). NARROWING ' +
      'IT WOULD MAKE THE SCAN QUIETER AND THAT IS AN OWNER DECISION, NOT A ' +
      'TIDY-UP. Routed to deferred-items.md. NO TERM IS DROPPED.');
    eq(derived.terms.length, new Set(derived.terms).size, '12m/union-deduplicated',
      'and the union is deduplicated — a term in both lists appears once, ' +
      'with provenance "both", rather than being scanned for twice.');
  }

  /* ---- THE ROSTER REPORT: A SCAN THAT CANNOT SAY WHAT IT LOOKED FOR ---- */
  const report = LS.formatRosterReport(derived, { redact: true });
  ok(report.indexOf(PLANT) === -1, '12m/report-redaction-works',
    'the redacted roster report does NOT contain her real folder name, so a ' +
    'scan report can be pasted into a record that must never carry it.');
  ok(/roster actually scanned: \d+ terms/.test(report), '12m/report-states-shape',
    'and it still states its own SHAPE in counts — a redacted report that ' +
    'also hid its shape would be no evidence at all.');
  ok(LS.formatRosterReport(derived).indexOf('from-her-settings') !== -1,
    '12m/report-names-provenance',
    'and the unredacted report labels every term with where it came from.');
  console.log('  12m roster report (redacted):');
  report.split('\n').forEach(function (l) { console.log('    ' + l); });
})();

/* =========================================================================
   (L) THE LIVE FIVE-CHANNEL ARMING PASS — ONE Chrome session

   ONE session, five channels. Five sessions would multiply the sweep's
   slowest cost by five for no additional signal.

   ⚠ THE PROBE PAGE IS BUILT HERE AND DOES NOT USE render-harness.cjs, AND
   THAT IS A MEASUREMENT, NOT A PREFERENCE. render-harness inlines the
   LITERAL BYTES of tokens.css into a <style> element so that COMPUTED STYLE
   matches the shipped stylesheet — exactly right for a geometry gate and
   exactly wrong here. A leak scan reads TEXT AND ATTRIBUTES, and tokens.css
   carries 15 word-boundary occurrences of the roster term `items` (13
   `align-items`), so the probe-removed rescan could never reach zero. Those
   bytes are an artifact of the harness and not of the product: the real page
   loads the stylesheet with <link rel="stylesheet"> (index.html:7), so they
   never enter the DOM. cdp.cjs — the zero-dependency driver — IS reused.
   ========================================================================= */

function buildProbePage() {
  const html =
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n' +
    '<title>leak scan probe</title>\n</head>\n<body>\n' +
    '<main id="surface"><p id="quiet">a plain line of copy</p></main>\n' +
    '</body></html>\n';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-2691-leak-'));
  const file = path.join(dir, 'probe.html');
  fs.writeFileSync(file, html, 'utf8');
  return { url: 'file://' + file, dir: dir };
}

const PLANT_ONE = [
  'var m = document.getElementById("surface");',
  'var p = document.createElement("p");',
  'p.id = "probe-text";',
  'p.textContent = "she filed it under Memoir that week";',
  'm.appendChild(p);',
  '"planted"'
].join('\n');

const PLANT_REST = [
  'var m = document.getElementById("surface");',
  'var wrap = document.createElement("div");',
  'wrap.id = "probe-rest";',
  'var img = document.createElement("img");',
  'img.setAttribute("alt", "Memoir");',
  'img.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");',
  'wrap.appendChild(img);',
  'var b = document.createElement("button");',
  'b.id = "probe-aria";',
  'b.setAttribute("aria-label", "Memoir/2026-07-14.md");',
  'wrap.appendChild(b);',
  'var t = document.createElement("span");',
  't.id = "probe-title";',
  't.setAttribute("title", "billing & insurance notes");',
  'wrap.appendChild(t);',
  'var d = document.createElement("span");',
  'd.id = "probe-data";',
  'd.setAttribute("data-source", "processed jd");',
  'wrap.appendChild(d);',
  'm.appendChild(wrap);',
  '"planted"'
].join('\n');

const REMOVE_PROBE = [
  'var a = document.getElementById("probe-text");',
  'if (a) a.parentNode.removeChild(a);',
  'var b = document.getElementById("probe-rest");',
  'if (b) b.parentNode.removeChild(b);',
  '(document.getElementById("probe-text") ? "still-there" : "removed")'
].join('\n');

async function live() {
  const page = buildProbePage();
  let session = null;
  try {
    session = await cdp.launch({ url: page.url });

    /* "the page finished loading" is a FACT READ OFF THE PAGE, never a
       sleep. The deadline is pinned by value so a page that never loads
       fails on a stated budget instead of hanging the sweep — `timeout(1)`
       does not exist on macOS. */
    const READY_DEADLINE_MS = 20000;
    const readyBy = Date.now() + READY_DEADLINE_MS;
    let ready = '';
    while (Date.now() < readyBy) {
      ready = await cdp.evaluate(session,
        '(function(){return document.readyState + "|" + ' +
        '(document.getElementById("quiet") ? "1" : "0");})()');
      if (ready === 'complete|1') break;
      await new Promise(function (r) { setTimeout(r, 20); });
    }
    eq(ready, 'complete|1', '12L/page-ready',
      'the probe page reached readyState "complete" WITH its own marker ' +
      'element present, within ' + READY_DEADLINE_MS + 'ms. Everything ' +
      'below measures a real render, not a blank tab mid-load.');

    /* ---- the CLEAN baseline, BEFORE anything is planted -------------- */
    const clean0 = await cdp.evaluate(session, SCAN_EXPR);
    const clean0Hits = findFencedHits(clean0, SCAN_ROSTER);
    ok(clean0.count > 0, '12L/baseline-nodes',
      'the baseline snapshot carries a NON-ZERO node count (' + clean0.count +
      '). Asserted BEFORE the zero-hit claim below, because a page that ' +
      'failed to load also scans clean.');
    eq(clean0Hits.length, 0, '12L/baseline-clean',
      'and the unplanted probe page scans clean. Got: ' +
      JSON.stringify(clean0Hits));

    /* ---- THE TRACER: one leak, one channel, one named hit ------------ */
    const planted1 = await cdp.evaluate(session, PLANT_ONE);
    eq(planted1, 'planted', '12L/tracer-planted',
      'the tracer probe was planted in the live DOM.');

    const snap1 = await cdp.evaluate(session, SCAN_EXPR);
    ok(snap1.count > clean0.count, '12L/tracer-node-count',
      'the snapshot grew when the probe was added (' + clean0.count + ' -> ' +
      snap1.count + '), so the collector is reading THIS page and not a ' +
      'cached one.');
    const hits1 = findFencedHits(snap1, SCAN_ROSTER);
    const textHits = hits1.filter(function (h) {
      return h.channel === 'textContent';
    });
    eq(textHits.length, 1, '12L/tracer-one-text-hit',
      'THE TRACER. ONE leak planted in ONE channel in a real Chrome, ' +
      'collected through the shipped page-side expression, matched by the ' +
      'shipped pure matcher — exactly one textContent hit comes back. That ' +
      'is page, protocol, collector, matcher and report on one path. Got: ' +
      JSON.stringify(hits1));
    eq(textHits[0] && textHits[0].term, 'Memoir', '12L/tracer-term',
      'and the hit NAMES THE TERM.');
    eq(textHits[0] && textHits[0].rule, 'word', '12L/tracer-rule',
      'and NAMES THE RULE THAT FIRED. A scan that reported a count without ' +
      'saying which rule fired could not be audited.');
    ok(!!(textHits[0] && /probe-text|p\[/.test(textHits[0].path)),
      '12L/tracer-path',
      'and NAMES THE ELEMENT PATH it was found at: ' +
      JSON.stringify(textHits[0] && textHits[0].path));
    ok(!!(textHits[0] &&
          textHits[0].context.indexOf('Memoir') !== -1),
      '12L/tracer-context',
      'and carries the surrounding string: ' +
      JSON.stringify(textHits[0] && textHits[0].context));

    /* ---- ALL FIVE CHANNELS, SAME SESSION ----------------------------- */
    const planted2 = await cdp.evaluate(session, PLANT_REST);
    eq(planted2, 'planted', '12L/five-planted',
      'the remaining four channels were planted in the SAME session.');

    const snap2 = await cdp.evaluate(session, SCAN_EXPR);
    const hits2 = findFencedHits(snap2, SCAN_ROSTER);
    const seen = [];
    for (let i = 0; i < hits2.length; i++) {
      if (seen.indexOf(hits2[i].channel) === -1) seen.push(hits2[i].channel);
    }
    seen.sort();
    const expected = Array.from(CHANNELS).slice().sort();
    deep(seen, expected, '12L/five-channels',
      'ALL FIVE CHANNELS APPEAR IN THE RESULT, recorded as a CHANNEL LIST ' +
      'and never as a count — a count of 5 is satisfiable by five hits in ' +
      'one channel. Total hits: ' + hits2.length + '.');
    console.log('  12L five-channel arming: ' + hits2.length +
      ' hits across channels ' + JSON.stringify(seen) +
      ' over ' + snap2.count + ' nodes (' + snap2.bytes + ' snapshot bytes)');

    const byRule = { word: 0, segment: 0 };
    for (let i = 0; i < hits2.length; i++) byRule[hits2[i].rule]++;
    ok(byRule.word > 0 && byRule.segment > 0, '12L/both-rules-live',
      'and BOTH rules fired in the live pass (word=' + byRule.word +
      ', segment=' + byRule.segment + '), so the union is exercised end to ' +
      'end and not only over hand-built snapshots.');

    /* ---- PROBE REMOVED: zero hits BESIDE a non-zero node count ------- */
    const removed = await cdp.evaluate(session, REMOVE_PROBE);
    eq(removed, 'removed', '12L/probe-removed',
      'the probe was removed from the live DOM.');

    const snap3 = await cdp.evaluate(session, SCAN_EXPR);
    const hits3 = findFencedHits(snap3, SCAN_ROSTER);
    ok(snap3.count > 0, '12L/rescan-nodes-nonzero',
      'THE RESCAN\'S NODE COUNT IS NON-ZERO (' + snap3.count + '), asserted ' +
      'IN THE SAME RUN as the zero-hit assertion below. Two numbers, not ' +
      'one: without this pair an empty page and a clean page are the same ' +
      'measurement.');
    eq(hits3.length, 0, '12L/rescan-clean',
      'and with the probe removed the SAME page scans CLEAN. Got: ' +
      JSON.stringify(hits3));
    eq(snap3.count, clean0.count, '12L/rescan-restored',
      'and the node count returned to its pre-probe value, so the page was ' +
      'genuinely restored rather than merely emptied.');
    console.log('  12L probe-removed rescan: hits=' + hits3.length +
      ' nodes=' + snap3.count);
  } finally {
    await cdp.close(session);
    try { fs.rmSync(page.dir, { recursive: true, force: true }); }
    catch (e) { /* the assertion set above is what judges the run */ }
  }
}

live().then(function () {
  if (FAILURES.length > 0) {
    console.error('test_leak_scan: ' + FAILURES.length +
      ' assertion(s) FAILED (' + PASSED + ' passed).');
    process.exitCode = 1;
    return;
  }
  console.log('OK test_leak_scan — ' + PASSED +
    ' assertions passed, 0 failures.');
}, function (err) {
  console.error('test_leak_scan: the live arming pass could not run: ' +
    (err && err.message ? err.message : String(err)));
  console.error('A live gate whose runner is unavailable FAILS — it does ' +
    'not stop checking.');
  process.exitCode = 1;
});
