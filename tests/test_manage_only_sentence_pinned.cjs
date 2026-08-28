#!/usr/bin/env node
'use strict';
/* test_manage_only_sentence_pinned — phase 26.96, gap WR-15 (residual).
 *
 * WHAT THE GAP IS, AS MEASURED. `CONFIG_MANAGE_ONLY_MSG` — the sentence the
 * room says to her when she asks the chat for something only Manage can
 * change — ships in TWO places (server.py, and app.js's ASK_REFUSAL_FALLBACK).
 * A drill reworded BOTH homes consistently to "nope, do it yourself.", md5
 * confirmed applied, and NOTHING went red: test_disclosure_truth.cjs rc=0,
 * test_librarian_config_fence.cjs rc=0, test_librarian_fence.py rc=0.
 *
 * ⛔⛔ WHY THE ONE GATE THAT LOOKS LIKE IT SHOULD FIRE DOES NOT.
 * tests/test_librarian_config_fence.cjs FEEDS the sentence in as a stub answer
 * (`refusal: "i can't change that one from here."`) and then asserts the driven
 * line STARTS WITH the same literal the test itself typed. It never reads
 * either production constant. The input is the expectation — this project's own
 * recorded defect class, a test that mirrors itself. ⛔ That file is not
 * touched here: its ROUTE half is genuine evidence and still is.
 *
 * WHAT THIS FILE ADDS, and the direction is the whole point: it pins the two
 * shipped homes against HER RULED RECORD in the planning vault — the same
 * direction tests/test_roster_ruled_copy.cjs pins B1 and N2 — never against the
 * constant a renderer reads, and never against a literal typed inside this
 * file. If the record cannot be read this file FAILS; it has no fallback
 * literal, because a fallback literal is an agent's copy of her words wearing
 * the costume of a pin.
 *
 * ⚠ HER FRONT-FACING WORDING IS HERS. If the shipped bytes and her record ever
 * disagree, HER RECORD IS THE TRUTH: change the code, never the record, and
 * never this file's expectation.
 *
 * ⛔ COMPLEMENTARY, NOT DUPLICATIVE. test_disclosure_truth.cjs already catches
 * INTER-HOME DRIFT (rewording server.py alone turns it red, driven). What it
 * cannot see is both homes reworded together. That is what this file sees.
 *
 * THE ANTI-VACUITY ANSWERS (26.96-VALIDATION.md's contract).
 *  1. Can it pass BEFORE the work is done? No — driven RED in a scratch clone
 *     with BOTH homes reworded, md5-confirmed, with the output in the return.
 *  2. Can it STILL pass once broken? No — comparison is by EQUALITY and then
 *     by CODEPOINT against a string this file did not author.
 *  3. Does a DEGENERATE implementation satisfy it? No — an empty constant, a
 *     missing constant, a missing record row and an unreadable record each
 *     fail loudly rather than passing over nothing.
 *  4. Evaluation order or source order? It reads VALUES: the python literal and
 *     the evaluated javascript object the renderer holds. It asserts nothing
 *     about where in either file they sit.
 *  5. Does it match THE FIX'S OWN COMMENT? No. It never greps a comment; the
 *     expectation comes from a file outside this repo, written at her sitting.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// ⛔ HER RECORD — deliberately outside this repo, written during the sitting.
const DECISIONS = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker/' +
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases/' +
  '26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-2026-07-31/' +
  '26.96-DECISIONS.md');

const violations = [];
const notes = [];

function codepoints(s) {
  return Array.from(s).map(function (c) {
    return c.codePointAt(0).toString(16).padStart(4, '0');
  }).join(' ');
}

// THE EXPECTATION, DERIVED FROM HER RECORD AND FROM NOTHING ELSE.
//
// Her ruling records the WHOLE line she reads — the refusal the server picks
// plus the route the client appends. The refusal is its first sentence. The
// split is made from the record's own punctuation, so no literal of this
// file's ever enters the expectation.
//
// ⚠ The row is located by a property of HER SENTENCE ("from here."), not by a
// line number and not by an option letter — the sitting recorded this ruling as
// prose, not as a lettered option row, and a pin that assumed the table shape
// would simply stop covering.
function ruledRefusal() {
  const src = fs.readFileSync(DECISIONS, 'utf8');
  const re = /`([^`\n]*from here\.[^`\n]*)`/g;
  const seen = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    if (seen.indexOf(m[1]) === -1) { seen.push(m[1]); }
  }
  if (seen.length === 0) {
    throw new Error('her ruling for the manage-only sentence is not in the ' +
      'record at ' + DECISIONS + ' — this pin has no expectation to compare ' +
      'against and must not invent one');
  }
  if (seen.length > 1) {
    throw new Error('the record holds ' + seen.length + ' DIFFERENT versions ' +
      'of her manage-only line — ' + JSON.stringify(seen) + '. A pin cannot ' +
      'choose between two of her sentences; a human must reconcile the record.');
  }
  const whole = seen[0];
  const cut = whole.indexOf('.');
  if (cut === -1) {
    throw new Error('her recorded line carries no sentence break, so the ' +
      'refusal half cannot be taken from it: ' + JSON.stringify(whole));
  }
  return { whole: whole, refusal: whole.slice(0, cut + 1) };
}

// The python home, read as a VALUE (the literal is evaluated, not matched).
function pyConst(name) {
  const re = new RegExp('^' + name + ' = ("(?:[^"\\\\]|\\\\.)*")', 'm');
  const m = SERVER.match(re);
  if (!m) { throw new Error(name + ' is not declared in server.py'); }
  return JSON.parse(m[1]);
}

// The javascript home, read as a VALUE: the object the renderer really holds.
function fallbackMap() {
  const at = APP.indexOf('var ASK_REFUSAL_FALLBACK = {');
  if (at === -1) {
    throw new Error('ASK_REFUSAL_FALLBACK is not declared in app.js');
  }
  const open = APP.indexOf('{', at);
  const close = APP.indexOf('\n  };', open);
  if (close === -1) { throw new Error('ASK_REFUSAL_FALLBACK is unterminated'); }
  const expr = APP.slice(open, close + 4).replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func
  const value = new Function('return (' + expr + ');')();
  if (!value || typeof value !== 'object') {
    throw new Error('ASK_REFUSAL_FALLBACK did not evaluate to an object');
  }
  return value;
}

function pin(where, shipped, ruled) {
  if (typeof shipped !== 'string' || !shipped.length) {
    violations.push('[' + where + '] the shipped sentence is missing or ' +
      'empty, but she ruled: ' + JSON.stringify(ruled));
    return;
  }
  if (shipped !== ruled) {
    violations.push('[' + where + '] DOES NOT MATCH HER RULING.\n' +
      '      she ruled: ' + JSON.stringify(ruled) + '\n' +
      '      shipped  : ' + JSON.stringify(shipped) + '\n' +
      '      ⛔ Her words are the truth here. Change the code, never the ' +
      'record, and never this pin.');
    return;
  }
  if (codepoints(shipped) !== codepoints(ruled)) {
    violations.push('[' + where + '] bytes differ below the glyph: ' +
      codepoints(shipped) + ' vs ' + codepoints(ruled));
    return;
  }
  notes.push(where + ' ships exactly as she ruled it (' + shipped.length +
    ' chars, codepoints match)');
}

try {
  const ruled = ruledRefusal();

  // POSITIVE CONTROL on the derivation itself: the record must have yielded a
  // real refusal AND a real route half. A split that produced an empty string,
  // or swallowed the whole line, would make the two pins below vacuous.
  const route = ruled.whole.slice(ruled.refusal.length).trim();
  if (!ruled.refusal.length || !route.length) {
    violations.push('[record] the refusal/route split of her recorded line ' +
      'produced ' + JSON.stringify(ruled.refusal) + ' and ' +
      JSON.stringify(route) + ' — one half is empty, so nothing below is a ' +
      'reading');
  } else {
    notes.push('her record yields the refusal ' + JSON.stringify(ruled.refusal) +
      ' followed by a route of ' + route.length + ' chars');
  }

  pin('server.py CONFIG_MANAGE_ONLY_MSG',
    pyConst('CONFIG_MANAGE_ONLY_MSG'), ruled.refusal);
  const fb = fallbackMap();
  pin('app.js ASK_REFUSAL_FALLBACK.manage_only',
    fb.manage_only, ruled.refusal);

  // ⛔ THE UNMUTATED CONTROL, IN THE SAME RUN, and it must be a DIFFERENT
  // sentence: the unmapped twin's two homes still agree. A rewording of the
  // manage-only sentence leaves this green, so a red here means the instrument
  // moved rather than the sentence — and an always-fail pin would show up here.
  const pyUnmapped = pyConst('CONFIG_UNMAPPED_MSG');
  if (!pyUnmapped.length || !fb.unmapped || !fb.unmapped.length) {
    violations.push('[control] one home of the UNMAPPED twin is empty, so ' +
      'the control proves nothing');
  } else if (pyUnmapped !== fb.unmapped) {
    violations.push('[control] the UNMAPPED twin has drifted between its two ' +
      'homes: ' + JSON.stringify(pyUnmapped) + ' vs ' +
      JSON.stringify(fb.unmapped) + ' — this file did not move that sentence, ' +
      'so the instrument is reading the wrong things');
  } else {
    notes.push('control: the unmapped twin agrees across both homes (' +
      pyUnmapped.length + ' chars) and is untouched by this pin');
  }
} catch (e) {
  violations.push('[fatal] ' + (e && e.message ? e.message : e));
}

notes.forEach(function (n) { console.log('  ok  ' + n); });
if (violations.length) {
  console.log('');
  violations.forEach(function (v) { console.log('  FAIL  ' + v); });
  console.log('');
  console.log('test_manage_only_sentence_pinned FAILED — ' +
    violations.length + ' violation(s), ' + notes.length + ' passed');
  process.exitCode = 1;
} else {
  console.log('test_manage_only_sentence_pinned OK — ' + notes.length + '/' +
    notes.length + ' checks (WR-15: both shipped homes pinned to her ruled ' +
    'record, not to each other and not to a literal typed here)');
}
