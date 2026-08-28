/*
 * tests/test_reformat_property.cjs — the D-04 seeded property suite
 * (Phase 26.88, Plan 02, Task 1).
 *
 * 300 randomized note bodies — CJK and Latin prose, fullwidth-colon label
 * lines, emoji-numeral and checkmark and separator runs, the 📍-class
 * marker and the fullwidth bar, wikilinks and markdown links, blockquotes,
 * fenced blocks, tables, image lines, CRLF and LF, non-breaking spaces and
 * fullwidth digits — proving that the display-time transform never changes
 * a word, checked against an INDEPENDENT coarse oracle re-implemented in
 * this file (asserting the guard against itself would prove only
 * self-consistency — RESEARCH Pitfall 10, threat T-26.88-09).
 *
 * Every element of the grammar below was measured in the live library, so a
 * generated body looks like a real note rather than like a fixture.
 *
 * Fully deterministic: mulberry32 (integer-ops-only, identical stream on
 * every platform), a fixed BASE_SEED, iteration i runs seed BASE_SEED + i,
 * the failing seed prints on any failure, and
 *   node tests/test_reformat_property.cjs <seed>
 * replays exactly that one body. There is NO wall-clock read and NO
 * unseeded randomness source anywhere in this file, so two runs produce
 * byte-identical output. The suite reads no fixture and opens no file at
 * all: the corpus is generated, never loaded, so nothing under the live
 * library is ever touched.
 *
 * Properties per iteration:
 *   P1 — the false-trip property: the D-04 guard is TRUE for every
 *        generated body. This is the one that would have caught all three
 *        normalizer traps research found by execution rather than by
 *        reasoning (keycap emoji-numerals, inline ordinal runs, CJK
 *        per-codepoint tokenisation).
 *   P2 — the independent coarse oracle AGREES with P1. Strip everything
 *        but CJK ideographs, kana, hangul and ASCII alphanumerics from
 *        both sides, lowercase, concatenate, subtract the injected heading
 *        text, compare byte-for-byte. A disagreement prints BOTH results
 *        and fails — a disagreement between the guard and its oracle is
 *        itself a finding, never a rounding error.
 *   P3 — hands-off spans are byte-identical: every fenced block, table,
 *        blockquote run and image line present in the input appears
 *        byte-for-byte in the output, at least as many times.
 *   P4 — THE TEST IS TESTED. A deliberately mutated output — one token
 *        dropped, two swapped, or one word injected (picked per iteration)
 *        — makes the guard return FALSE. Without P4 a trip-on-everything
 *        guard would pass this whole suite.
 *   P5 — determinism: the same input transformed twice yields an identical
 *        output string and an identical addedHeadings array, so the
 *        transform is pure and order-independent.
 *   P6 — the two safety bounds (26.88-03): a body above MAX_REFORMAT_BYTES
 *        comes back BYTE-IDENTICAL with an empty added-headings list, and a
 *        body under the vault spec's short-post threshold gets NO heading.
 *        Which iteration takes which branch is derived from the SEED, not
 *        from a coin flip, so both branches are guaranteed rather than
 *        likely; the OK line prints how many of each actually ran.
 *   P7 — THE UNDECLARED-HEADING COUNTER-TEST (26.88-06). On every iteration
 *        where a model-named heading was actually PLACED, re-running the
 *        guard with the declared list EMPTIED must return false. This is the
 *        behavioural proof that the allowance is doing work and is not a
 *        rubber stamp: without it, a guard that ignored addedHeadings
 *        entirely — or a transform that declared things it never emitted —
 *        would pass every other property in this file, and D-01's "the model
 *        never authors prose" would rest on nothing. A fraction of bodies
 *        carry a heading whose anchor IS in the text (placed) and a fraction
 *        one whose anchor is not (skipped silently), both derived from the
 *        SEED, and the OK line prints both counts.
 *   P8 — the INLINE-MARKUP invariant (26.88-12, D-14), and it is an exact
 *        mirror of P1 + P4 because either half alone proves nothing. The
 *        invariant half: markupPreserved is TRUE for every generated body,
 *        so a trip-on-everything guard cannot hide here. The P4-shaped
 *        half: one delimiter of a MATCHED pair is deleted from the output —
 *        a construct the body ACTUALLY CONTAINS, chosen deterministically
 *        WITHOUT consulting the predicate under test — and the guard must
 *        go red. The OK line prints how many iterations carried a real
 *        mutation, and a floor fails LOUDLY if the generator stops
 *        producing pairs, so coverage is observed rather than claimed.
 *        headingsBound is asserted per iteration beside P3: no emitted ATX
 *        heading may be bound to nothing, and the generator produces
 *        headings from two provenances.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; the failing iteration's seed, the property that failed, the
 * offending before/after window, and a one-argument replay command + exit 1
 * on failure.
 *
 * If a property fails, fix core.js — not the property. A P1 failure is a
 * normalizer defect; a P3 failure is a zone-map defect; a P5 failure means
 * state leaked into a function the module contract says is pure.
 */
'use strict';

const assert = require('assert');
const path = require('path');

const REPO = path.join(__dirname, '..');
const C = require(path.join(REPO, 'core.js'));

// ---- deterministic randomness ------------------------------------------------

// mulberry32 (public domain, RESEARCH Pattern 6 verbatim): 32-bit integer
// ops only — no float-precision hazards, so the stream is identical on
// every machine. JS has no seedable stdlib PRNG; this is the zero-dep
// standard answer.
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_SEED = 20260731;
const ITERATIONS = 300;

function pickOne(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
function randInt(rand, lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }

// ---- the independent coarse oracle (RESEARCH Pitfall 10, T-26.88-09) --------
//
// A plain straight-line re-implementation of the word-preservation
// invariant, IN THIS FILE. It never calls the module under test, imports
// none of its character classes, and knows nothing of its zone map — a bug
// shared between the guard and its oracle would certify a false safety
// claim, so the two may share no code at all. Keep these two functions
// boring and obvious: one character filter, one string compare.
//
// THREE DEFINITIONAL ALIGNMENTS, stated rather than hidden. An oracle has to
// agree with the thing it checks about what a WORD IS, or it is measuring a
// different property and its disagreement means nothing:
//
//   1. A keycap emoji-numeral (a digit, an optional variation selector, and
//      the combining enclosing keycap) is a BULLET, never a word. The
//      transform strips such a marker from in front of a promoted label, so
//      an oracle that counted its ASCII digit as a word would disagree on
//      every 1️⃣-led line in the corpus. Re-derived here in one line.
//   2. U+30FB, the katakana middle dot, is a LIST SEPARATOR in this corpus,
//      not a letter — it sits inside the kana block but the transform
//      consumes it when it splits a run. It is excluded from the kept set
//      for that reason and no other.
//   (the third is stated beside its own regex, below.)
//
// No alignment is a shortcut into the module under test: all three are
// re-stated here in this file's own few lines of code.

// Written through the constructor so the two invisible codepoints — the
// variation selector and the combining enclosing keycap — are readable in
// review rather than being a blank space in the source.
const ORACLE_KEYCAP_RE = new RegExp('[0-9#*][\\uFE0F]?[\\u20E3]', 'g');

//   3. AN ORDINAL RUN MARKER IS SCAFFOLDING, NOT A WORD (added 26.88-03).
//      D-03 turns an inline `1. … 2. …` run into a real ordered list and a
//      keycap run into the same shape, so a "1." travels between the two
//      sides as list furniture. An oracle that counted its ASCII digit as a
//      word would report a phantom insertion on every converted run and its
//      disagreement would mean nothing. The whitespace lookahead is the same
//      idea the transform uses and is what keeps `1.5 cups` a measurement —
//      re-derived here in this file's own line, never imported.
const ORACLE_ORDINAL_RE = new RegExp('\\d{1,3}[.)](?=[\\s\\u3000]|$)', 'g');

function oracleString(md) {
  var s = String(md == null ? '' : md);
  s = s.replace(ORACLE_KEYCAP_RE, '');   // alignment 1: a keycap is a bullet
  s = s.replace(ORACLE_ORDINAL_RE, ' '); // alignment 3: an ordinal is furniture
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var cp = s.charCodeAt(i);
    if ((cp >= 48 && cp <= 57) || (cp >= 65 && cp <= 90) ||
        (cp >= 97 && cp <= 122)) {
      out += String.fromCharCode(cp >= 65 && cp <= 90 ? cp + 32 : cp);
      continue;
    }
    if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0xAC00 && cp <= 0xD7AF) ||
        (cp >= 0x3041 && cp <= 0x30FF && cp !== 0x30FB)) {  // alignment 2
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

function oracleAgrees(before, after, addedHeadings) {
  var b = oracleString(before);
  var a = oracleString(after);
  var added = Array.isArray(addedHeadings) ? addedHeadings : [];
  for (var i = 0; i < added.length; i++) {
    var h = oracleString(added[i]);
    if (!h) { continue; }
    var at = a.indexOf(h);
    if (at !== -1) { a = a.slice(0, at) + a.slice(at + h.length); }
  }
  return { agrees: a === b, before: b, after: a };
}

// ---- the grammar (measured against the live corpus) --------------------------

const CJK_WORDS = ['菜花', '芝士', '搅拌机', '鸡胸', '酱汁', '记忆', '盒子',
  '手帐', '窗台', '书桌', '台灯', '毛线', '棒针', '花样', '春天', '午后'];
const LATIN_WORDS = ['sourdough', 'pecorino', 'risotto', 'notebook',
  'window', 'lamp', 'table', 'memory', 'autumn', 'ink', 'shelf', 'candle'];
const CJK_LABELS = ['食材', '做法', '小贴士', '材料', '织法', '尺寸',
  '推荐菜', '体验', '信息'];
const LATIN_LABELS = ['ingredients', 'method', 'notes', 'gauge', 'sizes'];

// D-03's separator set, and D-03a's two marker families. The bar and the
// 📍-class marker are NOT separators today — plan 03 teaches the transform
// to read them; until then they must simply ride through without tripping
// the guard, which is exactly what this grammar checks.
const SEPARATORS = ['、', '・', '•', ' - ', ' – '];
const SECTION_MARKERS = ['📍', '🍝', '✅', '•', '🌿'];
const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣'];

function cjkRun(rand, lo, hi) {
  var n = randInt(rand, lo, hi);
  var out = '';
  for (var i = 0; i < n; i++) { out += pickOne(rand, CJK_WORDS); }
  return out;
}

function latinRun(rand, lo, hi) {
  var n = randInt(rand, lo, hi);
  var parts = [];
  for (var i = 0; i < n; i++) { parts.push(pickOne(rand, LATIN_WORDS)); }
  return parts.join(' ');
}

// A non-breaking space, as an escape: the codepoint is invisible in source,
// and this phase's whole promise is about characters nobody can see.
const NBSP = ' ';
// ...and re-derived from its codepoint here, in ASCII source only, so this
// file never depends on an invisible character surviving a copy-paste.
const NBSP_CP = String.fromCharCode(0x00A0);

function sentence(rand) {
  var body = rand() < 0.55 ? cjkRun(rand, 3, 7) : latinRun(rand, 3, 8);
  // Roughly one sentence in five carries non-plain whitespace rather than a
  // plain space — the shape the live corpus's pasted prose actually has.
  // BOTH spellings are exercised on purpose: NBSP_CP is U+00A0 by
  // construction, and NBSP is the raw literal, so whichever invisible space
  // this file's source actually holds ends up IN the corpus rather than
  // sitting unused beside it. Neither is a word to the normalizer or to the
  // oracle, which is the whole point of generating them.
  if (rand() >= 0.2) { return body; }
  return body.replace(' ', rand() < 0.5 ? NBSP_CP : NBSP);
}

// A short segment for a separator run, or for the tail of a label line.
// DELIBERATE GENERATOR INVARIANT: a segment never begins with a backtick,
// tilde, hash, angle bracket, pipe, dash, or an ordinal marker. Those
// characters make a line into a WHOLE-LINE construct (a fence marker, a
// heading, a blockquote, a table separator) once the transform re-emits it
// at the start of its own line, and comparing a body against itself across
// that re-classification is a different question from word preservation.
// Fenced blocks, tables, blockquotes and image lines are generated as their
// OWN lines below, where the zone map is what P3 checks.
function segment(rand) {
  return rand() < 0.5 ? cjkRun(rand, 1, 2) : pickOne(rand, LATIN_WORDS);
}

// 26.88-11 (D-13): AN IMAGE CAPTION, on its OWN line, because the zone map is
// what P3 checks. `*图：…*` is the caption convention the clippings-processor
// skill writes into every image-bearing clipping in this vault — 687 such
// lines across the eligible pool — and until this plan the generator emitted
// NONE, so P3's newest hands-off shape would have gone through 300 seeded
// bodies without once being exercised. A property suite that never generates
// the shape it claims to cover is the same kind of check this phase has now
// found four times: rigorous-looking, and measuring nothing.
function captionLine(rand) {
  return '*图：' + cjkRun(rand, 2, 6) + '*';
}

// 26.88-13 (D-15): AN OVER-THRESHOLD FREE-PROSE WALL, on its own line, so its
// enclosing block is over SENTENCE_BREAK_MIN whatever its neighbours are.
//
// Without this shape the 300-body suite never once exercises the rule: every
// other generated line is far under the threshold, so P1/P2/P4/P5/P8 would all
// pass while the newest rule in the phase went untouched — the same
// rigorous-looking-and-measuring-nothing failure D-13's caption shape was.
//
// SIZED FROM THE EXPORTED CONSTANT, never from 600, so it tracks the threshold
// if D-20 is ever revisited. Built from BOTH halves of SENTENCE_ENDERS — CJK
// clauses ended by `。！？` and Latin clauses ended by `. ! ?` — because the
// ASCII half roughly doubles the rule's reach on the live library and a
// CJK-only wall would leave it unexercised.
function wallLine(rand) {
  var out = '';
  var CJK_END = ['。', '！', '？'];
  var ASCII_END = ['.', '!', '?'];
  while (out.length <= C.SENTENCE_BREAK_MIN) {
    out += rand() < 0.5
      ? cjkRun(rand, 6, 12) + pickOne(rand, CJK_END)
      : latinRun(rand, 6, 12) + pickOne(rand, ASCII_END) + ' ';
  }
  return out.replace(/ $/, '');
}

function separatorRun(rand) {
  var sep = pickOne(rand, SEPARATORS);
  var n = randInt(rand, 2, 4);
  var segs = [];
  for (var i = 0; i < n; i++) { segs.push(segment(rand)); }
  return segs.join(sep);
}

function ordinalRun(rand) {
  var n = randInt(rand, 2, 3);
  var parts = [];
  for (var i = 0; i < n; i++) {
    parts.push(String(i + 1) + '. ' + segment(rand));
  }
  return parts.join(' ');
}

function keycapRun(rand) {
  var n = randInt(rand, 2, 3);
  var parts = [];
  for (var i = 0; i < n; i++) {
    parts.push(KEYCAPS[i % KEYCAPS.length] + segment(rand));
  }
  return parts.join(' ');
}

function checkRun(rand) {
  var n = randInt(rand, 2, 3);
  var parts = [];
  for (var i = 0; i < n; i++) { parts.push('✅' + segment(rand)); }
  return parts.join(' ');
}

function barRun(rand) {
  var n = randInt(rand, 2, 3);
  var parts = [];
  for (var i = 0; i < n; i++) { parts.push(segment(rand)); }
  return parts.join('｜');
}

function wikilink(rand) {
  var target = pickOne(rand, CJK_LABELS);
  return rand() < 0.5 ? '[[' + target + ']]'
    : '[[' + target + '|' + pickOne(rand, LATIN_WORDS) + ']]';
}

function markdownLink(rand) {
  return '[' + pickOne(rand, LATIN_WORDS) + '](https://example.test/' +
    pickOne(rand, LATIN_WORDS) + ')';
}

// The D-03 dominant signal: a short label in front of a colon (460 of 469
// firing candidates in the live corpus), optionally led by a marker glyph
// or a keycap the transform strips off the promoted heading.
function labelLine(rand) {
  var lead = '';
  var roll = rand();
  if (roll < 0.25) { lead = pickOne(rand, SECTION_MARKERS); }
  else if (roll < 0.4) { lead = pickOne(rand, KEYCAPS); }
  var label = rand() < 0.6 ? pickOne(rand, CJK_LABELS)
    : pickOne(rand, LATIN_LABELS);
  var colon = rand() < 0.7 ? '：' : ': ';
  var restRoll = rand();
  var rest;
  if (restRoll < 0.34) { rest = separatorRun(rand); }
  else if (restRoll < 0.47) { rest = ordinalRun(rand); }
  else if (restRoll < 0.58) { rest = keycapRun(rand); }
  else if (restRoll < 0.68) { rest = checkRun(rand); }
  else if (restRoll < 0.76) { rest = barRun(rand); }
  else if (restRoll < 0.84) { rest = sentence(rand) + ' ' + wikilink(rand); }
  else if (restRoll < 0.92) { rest = sentence(rand) + ' ' + markdownLink(rand); }
  else { rest = sentence(rand); }
  return lead + label + colon + rest;
}

function proseLine(rand) {
  var roll = rand();
  if (roll < 0.16) {
    // non-plain whitespace inside ordinary prose. Whitespace to the
    // normalizer, dropped by the oracle — never a word, either way.
    // The GUARANTEED U+00A0 case rides sentence() below, written as an
    // escape so review can see the codepoint it is talking about.
    return sentence(rand) + ' ' + pickOne(rand, LATIN_WORDS);
  }
  if (roll < 0.3) {
    // a fullwidth digit run — NFKC folds it to ASCII on both sides
    return cjkRun(rand, 1, 2) + ' １２３ ' + cjkRun(rand, 1, 2);
  }
  if (roll < 0.42) { return pickOne(rand, SECTION_MARKERS) + ' ' + sentence(rand); }
  if (roll < 0.52) { return barRun(rand); }
  if (roll < 0.62) { return sentence(rand) + ' ' + wikilink(rand); }
  if (roll < 0.72) { return sentence(rand) + ' ' + markdownLink(rand); }
  return sentence(rand);
}

// ---- the body generator --------------------------------------------------------
//
// Returns { lines, handsOffIdx } — the logical lines and the indexes of the
// lines the zone map must copy byte-identically (D-07). The generator, not
// the transform, is the source of truth for which lines those are: P3 would
// be circular if it asked the module under test where its own zones are.

function genLines(rand, wantWall) {
  var lines = [];
  var handsOffIdx = [];
  // Counted so the caption shape's coverage is OBSERVED rather than claimed —
  // the same discipline as P6's branch counts and P7's heading floor.
  var captions = 0;
  var walls = 0;
  function push(text, handsOff) {
    if (handsOff) { handsOffIdx.push(lines.length); }
    lines.push(text);
  }
  // Every body opens with prose, so a mutation candidate always exists
  // outside a link URL and the P4 fallback is never the one doing the work.
  push(proseLine(rand), false);
  // 26.88-13 (D-15): the over-threshold wall, on its own line and surrounded
  // by blank lines so its block is the wall and nothing else. Inclusion is
  // SEED-DERIVED (see wallKind below), never a coin flip, so the coverage is
  // GUARANTEED rather than probable — the same reason bodyKind is seed-derived.
  if (wantWall) {
    push('', false);
    push(wallLine(rand), false);
    push('', false);
    walls += 1;
  }
  var blocks = randInt(rand, 3, 11);
  for (var i = 0; i < blocks; i++) {
    var roll = rand();
    if (roll < 0.26) {
      push(labelLine(rand), false);
    } else if (roll < 0.40) {
      push(proseLine(rand), false);
    } else if (roll < 0.44) {
      captions += 1;
      push(captionLine(rand), true);
    } else if (roll < 0.53) {
      push('', false);
    } else if (roll < 0.61) {
      push('## ' + pickOne(rand, CJK_LABELS), false);
    } else if (roll < 0.70) {
      var quotes = randInt(rand, 1, 3);
      for (var q = 0; q < quotes; q++) { push('> ' + sentence(rand), true); }
    } else if (roll < 0.79) {
      // NO INFO STRING, deliberately. The normalizer erases a fence MARKER
      // line whole, info string included, on both sides of the compare — so
      // a word there is not a word, and a P4 mutation landing on it would
      // leave the guard honestly green and fail the counter-test for a
      // reason that is not a defect. The fence CONTENT below is compared
      // like any other text, which is where the zone map earns its keep.
      push('```', true);
      var fenced = randInt(rand, 1, 3);
      for (var f = 0; f < fenced; f++) {
        push('R' + (f + 1) + ' ch3 ' + pickOne(rand, LATIN_WORDS), true);
      }
      push('```', true);
    } else if (roll < 0.88) {
      push('| ' + pickOne(rand, CJK_LABELS) + ' | ' +
        pickOne(rand, LATIN_LABELS) + ' |', true);
      push('| --- | --- |', true);
      var rows = randInt(rand, 1, 2);
      for (var r = 0; r < rows; r++) {
        push('| ' + segment(rand) + ' | ' + segment(rand) + ' |', true);
      }
    } else if (roll < 0.95) {
      push(rand() < 0.5
        ? '![](attachments/note/pic_' + randInt(rand, 1, 9) + '.jpg)'
        : '![[pic_' + randInt(rand, 1, 9) + '.jpg]]', true);
    } else {
      push('- ' + segment(rand), false);
    }
  }
  return { lines: lines, handsOffIdx: handsOffIdx, captions: captions,
    walls: walls };
}

// ---- the two safety-bound branches (26.88-03) -------------------------------
//
// structureBody's two early returns — rule 10's short-post suppressor and the
// MAX_REFORMAT_BYTES ceiling — are BRANCHES, and a branch outside this
// suite's coverage is a branch nothing checks. A fraction of bodies therefore
// fall below the short-post threshold and a fraction exceed the ceiling, so
// both paths face the same five properties as everything else.
//
// Which iteration takes which branch is derived from the SEED, not from a
// coin flip: a probabilistic split could deal zero of either branch on some
// run and the suite would then claim coverage it did not have. 300
// consecutive seeds contain at least three multiples of 97 and at least
// forty-two multiples of 7, so both branches are guaranteed, and the counts
// are printed on the OK line so the claim is observed rather than assumed.
function bodyKind(seed) {
  if (seed % 97 === 0) { return 'oversize'; }
  if (seed % 7 === 0) { return 'short'; }
  return 'normal';
}

// 26.88-13 (D-15): which iterations carry an over-threshold free-prose wall.
// SEED-DERIVED on the plan-03 model rather than rolled, so the coverage is
// GUARANTEED rather than probable: 300 consecutive seeds contain exactly 100
// multiples of 3, and the ones that also land on the short-post or
// over-ceiling branch drop out (both of those return early, so a wall there
// would be asserting the suppressors rather than the rule). What is left is
// counted and floored on the OK line — observed, never claimed.
function wallKind(seed) { return seed % 3 === 0; }

// Fewer than SHORT_POST_LINES lines, every one of them short — BOTH halves of
// the vault rule, because a count alone would suppress the phase's own
// headline case (one line, 79 characters). The first line always carries a
// colon label, so there is always something for the suppressor to suppress.
function genShortLines(rand) {
  var n = randInt(rand, 1, C.SHORT_POST_LINES - 1);
  var lines = [pickOne(rand, CJK_LABELS) + '：' + segment(rand)];
  for (var i = 1; i < n; i++) {
    lines.push(rand() < 0.5
      ? pickOne(rand, CJK_LABELS) + '：' + segment(rand)
      : segment(rand));
  }
  return lines;
}

// Just over the ceiling. Latin-only on purpose: the body is returned
// unchanged, so its only job is to be big, and a CJK filling would give P4's
// candidate scan a quarter of a million single-character candidates to build
// for no added coverage.
function genOversizeText(rand) {
  var unit = latinRun(rand, 3, 5) + ' ';
  var text = '';
  while (text.length <= C.MAX_REFORMAT_BYTES) { text += unit; }
  return text;
}

// ---- the model-named heading (26.88-06, D-01) --------------------------------
//
// Which iteration carries a heading, and of which shape, is derived from the
// SEED for exactly the reason bodyKind is: a probabilistic split could deal
// zero of a branch on some run and the OK line would then claim coverage the
// run did not have. Over 300 consecutive seeds each residue class holds 75.
//
//   'at-line-start' — the anchor opens its own line, so the heading is
//                     emitted above it and NO line is broken
//   'mid-line'      — the anchor sits inside a line, so placement BREAKS
//                     that line: the shape the phase's worked example needs,
//                     and the one where a bug would cost a word
//   'unanchored'    — the anchor is nowhere in the body, so the record is
//                     skipped in silence and the structure still renders
//   'none'          — no heading records at all: the untidied path, and the
//                     common one in the real library
function headingKind(seed) {
  var r = seed % 4;
  if (r === 1) { return 'at-line-start'; }
  if (r === 2) { return 'mid-line'; }
  if (r === 3) { return 'unanchored'; }
  return 'none';
}

// A private word list that appears NOWHERE ELSE in the grammar, so a planted
// anchor is unique in its body by construction rather than by luck — and an
// UNPLANTED one is guaranteed absent, which is what makes the skip branch a
// real branch instead of a hopeful one.
const ANCHOR_WORDS = ['凤梨酥', '樟脑丸', '琉璃盏', '苜蓿草', '琥珀糖',
  '蓑衣黄瓜'];

// Two of them, so the phrase clears ANCHOR_MIN_CHARS from the shortest pair
// (three plus three) and stays far under ANCHOR_MAX_CHARS.
function anchorPhrase(rand) {
  return pickOne(rand, ANCHOR_WORDS) + pickOne(rand, ANCHOR_WORDS);
}

// The line the anchor is planted in. Both spellings are plain CJK prose
// carrying no signal at all, on purpose: this suite is measuring PLACEMENT,
// so the line must not also be exercising a list rule. The mid-line spelling
// puts a full stop before the phrase, so the break lands between two
// self-contained prose fragments.
function plantedAnchorLine(rand, phrase, midLine) {
  return midLine
    ? cjkRun(rand, 3, 5) + '。' + phrase + cjkRun(rand, 2, 3)
    : phrase + cjkRun(rand, 2, 4);
}

// THE GENERATOR INVARIANT THAT KEEPS P1 HONEST: the heading text must not
// already appear in the body. wordsPreserved subtracts ONE LEFT-TO-RIGHT
// occurrence of each declared run, so a heading word that also occurs in her
// prose BEFORE the insertion point has the WRONG occurrence removed and the
// guard trips. That trip is correct and fail-safe in production — the note
// simply renders as saved — but it is not the property this suite measures,
// and generating it would make P1 red for a reason that is not a defect.
//
// The filter does real work: nine of the twelve Chinese roster entries are
// also grammar labels. 用具 / 配色 / 技巧 are never generated, so a free
// heading always exists. The comparison runs through THIS FILE'S OWN oracle
// fold and never through the module under test.
function pickHeading(rand, bodyText) {
  var folded = oracleString(bodyText);
  var lower = String(bodyText).toLowerCase();
  var free = C.HEADING_VOCAB.filter(function (h) {
    return folded.indexOf(oracleString(h)) === -1 &&
      lower.indexOf(h.toLowerCase()) === -1;
  });
  return free.length ? pickOne(rand, free) : null;
}

function genBody(rand, kind, headingShape, wantWall) {
  if (kind === 'oversize') {
    return { text: genOversizeText(rand), crlf: false, handsOff: [],
      kind: kind, headings: [], headingsAsked: 0, captions: 0, walls: 0 };
  }
  var built = kind === 'short'
    ? { lines: genShortLines(rand), handsOffIdx: [], captions: 0, walls: 0 }
    : genLines(rand, wantWall);
  // The anchor line is APPENDED, never spliced: appending leaves every
  // handsOffIdx above it valid, and the end of the body is the one place no
  // generated hands-off zone can reach.
  var headings = [];
  var headingsAsked = 0;
  if (headingShape !== 'none') {
    var phrase = anchorPhrase(rand);
    if (headingShape !== 'unanchored') {
      built.lines.push('');
      built.lines.push(plantedAnchorLine(rand, phrase,
        headingShape === 'mid-line'));
    }
    var heading = pickHeading(rand, built.lines.join('\n'));
    if (heading) {
      headings.push({ heading: heading, anchor: phrase });
      headingsAsked = 1;
    }
  }
  var crlf = rand() < 0.35;
  var raw = built.lines.map(function (line) {
    return crlf ? line + '\r' : line;
  });
  var text = raw.join('\n');
  if (rand() < 0.6) { text += crlf ? '\r\n' : '\n'; }
  return {
    text: text,
    crlf: crlf,
    kind: kind,
    headings: headings,
    headingsAsked: headingsAsked,
    captions: built.captions,
    walls: built.walls,
    handsOff: built.handsOffIdx.map(function (i) { return raw[i]; })
  };
}

// ---- P4's mutation machinery -----------------------------------------------
//
// A mutation only proves anything when it lands on a real WORD. Two classes
// of ASCII digit are scaffolding on BOTH sides of the compare — a keycap's
// digit and an ordinal marker — and the text inside a link URL is dropped
// on both sides too, so mutating any of them would leave the guard honestly
// green and P4 would fail for a reason that is not a defect. Candidates are
// therefore restricted to Latin letter runs of length 2+ and CJK ideographs,
// outside every link URL.

// ---- P8's markup-mutation machinery (26.88-12) ------------------------------
//
// The same care P4's exclusions take, for the same reason: a mutation only
// proves something when it lands somewhere that GENUINELY reduces a pair count.
//
// The construct and the block are chosen DETERMINISTICALLY AND WITHOUT EVER
// CONSULTING markupPreserved. Choosing by "delete things until the guard goes
// red" would be circular — the mutation would be defined by the predicate under
// test and could not fail. Instead the rule is arithmetic: inside one
// blank-line-delimited block, find a delimiter whose occurrence count is EVEN
// and at least 2, and delete ONE of them. n even means floor(n / 2) pairs
// becomes floor((n - 1) / 2) = n / 2 - 1 — a decrease of exactly one, by
// construction, whatever the guard happens to think.
//
// The rosters are READ FROM THE MODULE (C.INLINE_MARKS) rather than re-spelled
// here: a second spelling of a roster in a test file is the one-rule-many-
// callers drift this phase has already paid for twice. The COUNTING is this
// file's own, which is where the independence has to live.
//
// THE INTRAWORD UNDERSCORE RULE IS APPLIED HERE TOO, and it has to be. It is
// the RENDERER's rule, not core.js's opinion: CommonMark lets `*` open emphasis
// inside a word and does not let `_`, so `pic_4.jpg` is plain text. A mutation
// chooser that ignored that would pick two filename underscores, delete one,
// and demand the guard go red over a "pair" no renderer ever saw — a test
// failing for a reason that is not a defect, which is exactly what P4's
// exclusion list exists to prevent. Found by execution at seed 20260833.

var P8_WORD_CHAR = new RegExp('[\\p{L}\\p{N}]', 'u');

// Every index at which `needle` is a delimiter the RENDERER would see.
function p8Indices(s, needle) {
  var intraword = needle.charAt(0) === '_';
  var hits = [], f = 0, a, end, before, after;
  for (;;) {
    a = s.indexOf(needle, f);
    if (a === -1) { return hits; }
    end = a + needle.length;
    f = end;
    if (intraword) {
      before = a > 0 ? s.charAt(a - 1) : '';
      after = end < s.length ? s.charAt(end) : '';
      if (before && after &&
          P8_WORD_CHAR.test(before) && P8_WORD_CHAR.test(after)) { continue; }
    }
    hits.push(a);
  }
}

// Returns the mutated text and the construct mutated, or null when this body
// carries no even-count delimiter run anywhere (a legitimate skip, counted).
function mutateMarkup(text) {
  var blocks = String(text).split(/\r?\n[ \t]*\r?\n/);
  var seps = String(text).match(/\r?\n[ \t]*\r?\n/g) || [];
  for (var b = 0; b < blocks.length; b++) {
    for (var m = 0; m < C.INLINE_MARKS.length; m++) {
      var d = C.INLINE_MARKS[m];
      var hits = p8Indices(blocks[b], d);
      var n = hits.length;
      if (n < 2 || n % 2 !== 0) { continue; }
      var at = hits[0];
      var copy = blocks.slice();
      copy[b] = blocks[b].slice(0, at) + blocks[b].slice(at + d.length);
      var out = '';
      for (var i = 0; i < copy.length; i++) {
        out += copy[i] + (i < seps.length ? seps[i] : '');
      }
      return { text: out, mark: d, block: b, before: n, after: n - 1 };
    }
  }
  return null;
}

const CANDIDATE_RE = /[A-Za-z]{2,}|[一-鿿]/g;
const MD_LINK_RE = /!?\[[^\]]*\]\(([^)]*)\)/g;
const AUTOLINK_RE = /<https?:\/\/[^>]*>/g;
// ...and, since 26.88-06, every HEADING LINE. A model-named heading's tokens
// are subtracted from the after side by the declared list, so dropping a word
// there can be invisible to the guard BY DESIGN rather than by defect —
// exactly the reasoning behind the link-URL exclusion above, and P4 would
// then fail for a reason that is not a defect. The rule is on the LINE SHAPE
// and not on provenance: a promoted heading line is protected too, because
// this file cannot tell the two apart from the output alone and must not
// pretend it can. Every body opens with prose, so a candidate always remains.
const HEADING_LINE_RE = /(^|\n)[ \t]{0,3}#{1,6}[^\n]*/g;

function protectedSpans(text) {
  var spans = [];
  var m;
  MD_LINK_RE.lastIndex = 0;
  while ((m = MD_LINK_RE.exec(text)) !== null) {
    var urlStart = m.index + m[0].indexOf('](') + 2;
    spans.push([urlStart, urlStart + m[1].length]);
  }
  AUTOLINK_RE.lastIndex = 0;
  while ((m = AUTOLINK_RE.exec(text)) !== null) {
    spans.push([m.index, m.index + m[0].length]);
  }
  HEADING_LINE_RE.lastIndex = 0;
  while ((m = HEADING_LINE_RE.exec(text)) !== null) {
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

function candidates(text) {
  var spans = protectedSpans(text);
  var out = [];
  var m;
  CANDIDATE_RE.lastIndex = 0;
  while ((m = CANDIDATE_RE.exec(text)) !== null) {
    var start = m.index;
    var end = start + m[0].length;
    var safe = true;
    for (var s = 0; s < spans.length; s++) {
      if (start < spans[s][1] && end > spans[s][0]) { safe = false; break; }
    }
    if (safe) { out.push({ start: start, end: end, text: m[0] }); }
  }
  return out;
}

const MUTATIONS = ['drop', 'swap', 'inject'];

function mutate(rand, text) {
  var list = candidates(text);
  var kind = pickOne(rand, MUTATIONS);
  if (!list.length) {
    return { kind: 'inject', text: ' zzqmutant ' + text };
  }
  if (kind === 'swap') {
    var a = null;
    var b = null;
    for (var i = 0; i < list.length && b === null; i++) {
      for (var j = i + 1; j < list.length; j++) {
        if (list[i].text !== list[j].text) { a = list[i]; b = list[j]; break; }
      }
    }
    if (a !== null && b !== null) {
      // apply the later replacement first so the earlier index stays valid
      var swapped = text.slice(0, b.start) + a.text + text.slice(b.end);
      swapped = swapped.slice(0, a.start) + b.text + swapped.slice(a.end);
      return { kind: 'swap', text: swapped };
    }
    kind = 'drop';   // every candidate is the same word: dropping still works
  }
  var hit = list[randInt(rand, 0, list.length - 1)];
  if (kind === 'drop') {
    return { kind: 'drop',
      text: text.slice(0, hit.start) + text.slice(hit.end) };
  }
  return { kind: 'inject',
    text: text.slice(0, hit.start) + ' zzqmutant ' + text.slice(hit.start) };
}

// ---- the failure report -------------------------------------------------------

var report = { seed: null, property: 'setup', before: '', after: '',
  detail: '' };

function readableWindow(text) {
  var s = String(text == null ? '' : text);
  return s.length <= 240 ? s : s.slice(0, 240) + ' …[truncated]';
}

function countIn(list, value) {
  var n = 0;
  for (var i = 0; i < list.length; i++) { if (list[i] === value) { n += 1; } }
  return n;
}

// ---- one iteration ------------------------------------------------------------

var branchSeen = { normal: 0, short: 0, oversize: 0 };
// 26.88-06: how many iterations actually PLACED a model-named heading, and
// how many exercised the SKIP branch. A branch nobody entered is a branch
// nobody checked, so both are printed on the OK line and both are asserted
// non-trivial at the end — the difference between having the coverage and
// claiming it.
var headingSeen = { placed: 0, skipped: 0 };
// 26.88-11 (D-13): iterations whose generated body carried at least one
// emphasis-wrapped caption line. Counted from the GENERATOR, never from the
// transform — asking the module under test whether it saw its own zone would
// be circular, which is the same reason handsOffIdx is generator-owned.
var captionSeen = 0;
// 26.88-12 (D-14): iterations where P8b's markup mutation actually landed —
// i.e. the output carried an even-count delimiter run somewhere. Printed on the
// OK line and floored at the end, on the same discipline as captionSeen: a
// mutation half that silently stopped mutating would leave P8's invariant half
// alone in the file, and the header already says what a lone invariant half is
// worth.
var markupMutated = 0;
// 26.88-13 (D-15): iterations whose generated body carried an over-threshold
// free-prose wall. Counted from the GENERATOR, never from the transform —
// asking the module under test whether it saw its own threshold would be
// circular, the same reason handsOffIdx and captions are generator-owned.
var wallSeen = 0;

function runIteration(seed) {
  var rand = mulberry32(seed);
  var kind = bodyKind(seed);
  // The two safety-bound branches deliberately carry NO headings: rule 10
  // suppresses headers on a short post and the ceiling returns the body
  // untouched, so a heading there would be asserting the suppressors rather
  // than the placement.
  var shape = kind === 'normal' ? headingKind(seed) : 'none';
  var body = genBody(rand, kind, shape, kind === 'normal' && wallKind(seed));
  branchSeen[kind] += 1;
  if (body.captions > 0) { captionSeen += 1; }
  if (body.walls > 0) { wallSeen += 1; }
  report.seed = seed;
  report.before = body.text;
  report.after = '';
  report.detail = '';

  var out = C.structureBody(body.text, body.headings);
  report.after = out ? out.text : '';
  assert.ok(out && typeof out.text === 'string' &&
    Array.isArray(out.addedHeadings),
    'the transform must always answer {text, addedHeadings}');

  // ---- P1 — the false-trip property ------------------------------------
  report.property = 'P1 (the guard must not trip on a real note)';
  assert.strictEqual(
    C.wordsPreserved(body.text, out.text, out.addedHeadings), true,
    'P1: the D-04 guard tripped on a generated body — every word of the ' +
    'source must survive, in order, once the declared heading runs are ' +
    'subtracted (D-04). A trip here means the normalizer lost or invented ' +
    'a token, and the reader would silently see the note as saved.');

  // ---- P6 — the two safety bounds behave as declared --------------------
  // Runs right after P1 so a branch failure is reported as a branch failure
  // rather than as a mysterious P2 disagreement further down.
  if (kind === 'oversize') {
    report.property = 'P6 (a body above the ceiling renders exactly as saved)';
    assert.ok(body.text.length > C.MAX_REFORMAT_BYTES,
      'P6: the oversize fixture is not actually over MAX_REFORMAT_BYTES — ' +
      'the branch under test was never entered.');
    assert.strictEqual(out.text, body.text,
      'P6: a body above MAX_REFORMAT_BYTES must be returned BYTE-IDENTICAL. ' +
      'Rendering the note as saved is always a valid answer, which is what ' +
      'makes the ceiling law-4-safe by construction (T-26.88-04).');
    assert.strictEqual(out.addedHeadings.length, 0,
      'P6: nothing was added on the oversize path, so nothing may be ' +
      'declared as added.');
  } else if (kind === 'short') {
    report.property = 'P6 (rule 10 suppresses headers on a short post)';
    assert.strictEqual(out.text.split('## ').length - 1, 0,
      'P6: a post under the vault spec\'s own short-post threshold must get ' +
      'NO heading — rule 10 verbatim: "Don\'t add headers if the post is ' +
      'short". Bullet conversion may still apply; a header may not.');
  }

  // ---- P2 — the independent coarse oracle agrees ------------------------
  report.property = 'P2 (the independent oracle must agree with the guard)';
  var oracle = oracleAgrees(body.text, out.text, out.addedHeadings);
  if (!oracle.agrees) {
    report.detail = 'oracle before: ' + readableWindow(oracle.before) + '\n' +
      '  oracle after:  ' + readableWindow(oracle.after);
  }
  assert.strictEqual(oracle.agrees, true,
    'P2: the guard says the words are preserved and the INDEPENDENT ' +
    'oracle disagrees. The two share no code by design, so a disagreement ' +
    'is itself the finding — one of them is wrong and the safety claim is ' +
    'unproven until it is settled (T-26.88-09).');

  // ---- P3 — hands-off spans are byte-identical --------------------------
  report.property = 'P3 (hands-off zones must be copied byte for byte)';
  var inLines = body.text.split('\n');
  var outLines = out.text.split('\n');
  for (var h = 0; h < body.handsOff.length; h++) {
    var line = body.handsOff[h];
    report.detail = 'hands-off line: ' + JSON.stringify(readableWindow(line));
    assert.ok(countIn(outLines, line) >= countIn(inLines, line),
      'P3: a hands-off line did not survive byte for byte. Fenced blocks, ' +
      'markdown tables, blockquote runs and image lines are the four ' +
      'original D-07 zones, and 26.88-11 added a fifth generated shape — ' +
      'the emphasis-wrapped image caption (D-13). All of them are already ' +
      'structured, and line-level rewriting destroys them: a knitting ' +
      'abbreviation, a vocabulary table, the author commentary she ' +
      'deliberately put in a quote, an image at the point in the flow where ' +
      'she put it, or the caption underneath it.');
  }
  report.detail = '';

  // ---- P8 — the inline-markup invariant, both halves (26.88-12, D-14) -----
  report.property = 'P8 (inline markup must survive the transform)';
  assert.strictEqual(C.markupPreserved(body.text, out.text), true,
    'P8: the transform DECREASED a matched inline-markup pair count in some ' +
    'block. An emphasis pair, a bracket, a parenthesis, a wikilink or an ' +
    'Obsidian comment was split across an emitted block boundary — the ' +
    'exact class of defect F-1, F-3 and the parenthetical shred all were, ' +
    'and the exact class wordsPreserved is blind to because every word ' +
    'survives it.');

  // ...and the same check at the seam the renderer actually reads.
  assert.strictEqual(C.markupPreserved(C.cleanVaultMarkup(body.text),
    C.cleanVaultMarkup(out.text)), true,
    'P8: markup survived structureBody and then did NOT survive the ' +
    'renderer\'s own scaffolding stripping. This is the seam 26.88-12 Q4 ' +
    'opened, and it is the one no suite could see while cleanVaultMarkup ' +
    'lived in app.js.');

  report.property = 'P8b (a markup mutation must make the guard go red)';
  var markupMutation = mutateMarkup(out.text);
  if (markupMutation) {
    markupMutated += 1;
    report.detail = 'deleted one ' + JSON.stringify(markupMutation.mark) +
      ' from block ' + markupMutation.block + ' (' + markupMutation.before +
      ' -> ' + markupMutation.after + ' occurrences)';
    assert.strictEqual(
      C.markupPreserved(body.text, markupMutation.text), false,
      'P8b: one delimiter of a MATCHED pair was deleted from a single ' +
      'block — an even occurrence count made that a decrease of exactly one ' +
      'pair, by arithmetic rather than by asking the guard — and the guard ' +
      'stayed green. Without this half a trip-on-nothing guard would pass ' +
      'the invariant half unconditionally, exactly as the header already ' +
      'says of P4.');
    report.detail = '';
  }

  // ---- headingsBound, beside P3 (26.88-12) -------------------------------
  report.property = 'P8c (no emitted ATX heading may be bound to nothing)';
  assert.strictEqual(C.headingsBound(C.cleanVaultMarkup(out.text)), true,
    'P8c: the transform emitted an ATX heading that is EMPTY once the ' +
    'renderer strips %% spans and whitespace — F-1\'s visible symptom, ' +
    'UI-SPEC check 2. The generator produces headings from BOTH provenances ' +
    '(promoted from the author\'s own label, and model-named), so this ' +
    'covers both.');

  // ---- P7 — the undeclared-heading counter-test (26.88-06) ---------------
  report.property = 'P7 (an UNDECLARED heading must make the guard go red)';
  if (out.addedHeadings.length > 0) {
    headingSeen.placed += 1;
    report.detail = 'declared: ' + JSON.stringify(out.addedHeadings);
    assert.strictEqual(C.wordsPreserved(body.text, out.text, []), false,
      'P7: a model-named heading REACHED THE OUTPUT and the guard was still ' +
      'green with the declared list emptied. That means the allowance is a ' +
      'rubber stamp: either the guard is not really subtracting the list, or ' +
      'the transform declared something it never emitted. Either way D-01\'s ' +
      '"the model never authors prose" would be resting on nothing, because ' +
      'the whole promise is that a word the transform did NOT declare makes ' +
      'the guard trip and the note render as saved.');
    report.detail = '';
  } else if (body.headingsAsked > 0) {
    headingSeen.skipped += 1;
    assert.strictEqual(out.addedHeadings.length, 0,
      'P7: a record whose anchor is nowhere in the body declares NOTHING — ' +
      'the skip is silent and total, never a heading placed approximately');
  }

  // ---- P4 — the test is tested ------------------------------------------
  report.property = 'P4 (a planted mutation must make the guard go red)';
  var mutated = mutate(rand, out.text);
  report.detail = 'mutation kind: ' + mutated.kind;
  assert.strictEqual(
    C.wordsPreserved(body.text, mutated.text, out.addedHeadings), false,
    'P4: a deliberately mutated output did NOT make the guard go red. ' +
    'Without this counter-test a guard that returned true unconditionally ' +
    'would pass every other property in this file, and the whole ' +
    'word-preservation promise would rest on nothing.');
  report.detail = '';

  // ---- P5 — determinism --------------------------------------------------
  report.property = 'P5 (the transform must be pure and order-independent)';
  var again = C.structureBody(body.text, body.headings);
  assert.strictEqual(again.text, out.text,
    'P5: the same input transformed twice produced two different outputs ' +
    '— state leaked into a function the module contract says is pure.');
  assert.deepStrictEqual(again.addedHeadings, out.addedHeadings,
    'P5: the same input produced two different addedHeadings arrays — the ' +
    'heading allowance the guard subtracts must be a function of the ' +
    'input alone.');
}

// ---- main ------------------------------------------------------------------------

const replaySeed = process.argv[2] != null ? Number(process.argv[2]) : null;
if (replaySeed !== null && !Number.isInteger(replaySeed)) {
  console.error('usage: node tests/test_reformat_property.cjs [seed]');
  process.exit(1);
}

try {
  if (replaySeed !== null) {
    runIteration(replaySeed);
    console.log('test_reformat_property OK (replayed seed ' + replaySeed +
      ')');
    process.exit(0);
  }
  for (let i = 0; i < ITERATIONS; i++) {
    runIteration(BASE_SEED + i);
  }
  // A branch nobody entered is a branch nobody checked. These two counts are
  // the difference between having the coverage and claiming it.
  report.property = 'P6 (both safety-bound branches must be exercised)';
  assert.ok(branchSeen.short > 0,
    'the short-post branch was never generated across ' + ITERATIONS +
    ' seeds — the suppressor is untested and the OK line would be lying');
  assert.ok(branchSeen.oversize > 0,
    'the over-ceiling branch was never generated across ' + ITERATIONS +
    ' seeds — the ceiling is untested and the OK line would be lying');
  // ...and the same discipline for the heading path. THIRTY is the floor
  // because a handful of iterations is an anecdote: P7 is the only
  // behavioural proof in this suite that the guard's allowance does real
  // work, and the skip branch is the only proof that an unlocatable heading
  // costs her nothing.
  const HEADING_BRANCH_FLOOR = 30;
  report.property = 'P7 (both heading branches must be exercised)';
  assert.ok(headingSeen.placed > HEADING_BRANCH_FLOOR,
    'only ' + headingSeen.placed + ' of ' + ITERATIONS + ' iterations ' +
    'actually PLACED a model-named heading, which is at or under the floor ' +
    'of ' + HEADING_BRANCH_FLOOR + ' — P7 asserted almost nothing, and the ' +
    'OK line would be claiming coverage this run did not have');
  assert.ok(headingSeen.skipped > HEADING_BRANCH_FLOOR,
    'only ' + headingSeen.skipped + ' of ' + ITERATIONS + ' iterations ' +
    'exercised the SKIP branch (a record whose anchor is not in the body), ' +
    'which is at or under the floor of ' + HEADING_BRANCH_FLOOR +
    ' — anchor-or-skip is half of D-01 and the skip half would be untested');
  // ...and the same discipline for D-13's caption zone. Before 26.88-11 the
  // generator emitted NO wholly-emphasis-wrapped line at all, so P3 would have
  // reported coverage of a zone it never once produced. THIRTY is the floor
  // for the same reason the heading floor is thirty: a handful of iterations
  // is an anecdote, and this shape is 79% of what the transform was doing
  // wrong on the live library.
  const CAPTION_SHAPE_FLOOR = 30;
  report.property = 'P3 (the caption zone must actually be generated)';
  assert.ok(captionSeen > CAPTION_SHAPE_FLOOR,
    'only ' + captionSeen + ' of ' + ITERATIONS + ' iterations generated an ' +
    'emphasis-wrapped caption line, which is at or under the floor of ' +
    CAPTION_SHAPE_FLOOR + ' — P3 would be claiming coverage of D-13\'s zone ' +
    'that this run did not have, and a generator that silently stopped ' +
    'producing the shape must fail LOUDLY rather than quietly proving nothing');
  const MARKUP_MUTATION_FLOOR = 30;
  report.property = 'P8b (the markup mutation must actually be landing)';
  assert.ok(markupMutated > MARKUP_MUTATION_FLOOR,
    'only ' + markupMutated + ' of ' + ITERATIONS + ' iterations carried a ' +
    'markup mutation, which is at or under the floor of ' +
    MARKUP_MUTATION_FLOOR + ' — P8 would then be the invariant half alone, ' +
    'and a trip-on-nothing guard passes that unconditionally. A generator ' +
    'that stopped producing matched pairs must fail LOUDLY rather than ' +
    'quietly proving nothing');
  // ...and the same discipline for D-15's over-threshold wall. Before 26.88-13
  // the generator's longest line was far under SENTENCE_BREAK_MIN, so 300
  // bodies would have exercised every property against a rule that never once
  // fired. THIRTY is the floor for the same reason the other three are thirty:
  // a handful of iterations is an anecdote, and this is the only rule in the
  // phase that acts without an explicit author marker.
  const WALL_SHAPE_FLOOR = 30;
  report.property = 'P1/P2/P5/P8 (the D-15 wall shape must be generated)';
  assert.ok(wallSeen > WALL_SHAPE_FLOOR,
    'only ' + wallSeen + ' of ' + ITERATIONS + ' iterations generated a ' +
    'free-prose block over SENTENCE_BREAK_MIN, which is at or under the ' +
    'floor of ' + WALL_SHAPE_FLOOR + ' — every property in this suite would ' +
    'then be passing over a rule that never fired, and a generator that ' +
    'silently stopped producing the shape must fail LOUDLY rather than ' +
    'quietly proving nothing');
  console.log('test_reformat_property OK (' + ITERATIONS +
    ' seeded bodies, base seed ' + BASE_SEED + '; P6 branches exercised: ' +
    branchSeen.normal + ' normal, ' + branchSeen.short + ' short-post, ' +
    branchSeen.oversize + ' over-ceiling; P7 headings: ' +
    headingSeen.placed + ' placed, ' + headingSeen.skipped + ' skipped; ' +
    'P3 caption-zone bodies: ' + captionSeen + '; P8 markup mutations: ' +
    markupMutated + '; D-15 over-threshold walls: ' + wallSeen + ')');
  process.exit(0);
} catch (e) {
  console.error('test_reformat_property FAILED');
  console.error('  seed:     ' + report.seed);
  console.error('  property: ' + report.property);
  console.error('  ' + (e && e.message ? e.message : String(e)));
  if (report.detail) { console.error('  ' + report.detail); }
  console.error('  before:   ' + JSON.stringify(readableWindow(report.before)));
  console.error('  after:    ' + JSON.stringify(readableWindow(report.after)));
  console.error('  replay:   node tests/test_reformat_property.cjs ' +
    report.seed);
  process.exit(1);
}
