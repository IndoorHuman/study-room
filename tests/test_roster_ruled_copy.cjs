#!/usr/bin/env node
'use strict';
/* test_roster_ruled_copy — T-26.96-42, the phase's last critical threat.
 *
 * WHAT THE THREAT IS. Two sentences on the room's strongest privacy control
 * were owed to the owner and shipped as empty strings until she ruled. She
 * ruled them at the sitting of 2026-08-20 and they are now in the code. The
 * threat is an AGENT'S EDIT OF HER SENTENCES — a reword, a "tidy", a smart
 * quote, a dropped clause — landing without anyone noticing.
 *
 * ⛔⛔ THE DIRECTION OF THIS PIN IS THE WHOLE POINT. It reads her words from
 * `26.96-DECISIONS.md`, the record written in the sitting, and compares the
 * SHIPPED CONSTANT against them. A gate that read the constant and declared it
 * correct would certify whatever an agent last typed there — which is not a
 * gate, it is a mirror. This project has ~30 recorded instances of a check
 * that pins the defect as correct; the plan for this threat says in capitals
 * that the pin reads the DECISIONS record "never from the constant the
 * renderer reads", and that is what the two `readRuled` calls below do.
 *
 * ⚠ WHY THIS FILE EXISTS RATHER THAN THREE MORE CASES IN test_roster_pane.cjs.
 * That suite's own retroactive group asserts these seats are EMPTY — a write
 * count of exactly 0 — which was the correct gate while the seats were owed
 * and is the wrong gate the moment they are legitimately filled. Those cases
 * are being updated in the same commit as this file. Keeping the new pin
 * separate means the thing that proves her words are intact does not live
 * inside the thing that had to change to let them in.
 *
 * THE ANTI-VACUITY ANSWERS.
 *  (1) Can it pass before the work? No — it was driven RED against the empty
 *      constants before they were filled.
 *  (2) Can it pass over nothing? No — it fails loudly if the record cannot be
 *      read, if either row is missing, or if a lifted constant is empty.
 *  (3) Does a smart-quote tidy survive it? No — comparison is by CODEPOINT on
 *      the characters that a tidy would move: the apostrophe and the em dash.
 *  (4) Is it reading its own expectation? No — expectation comes from a file
 *      OUTSIDE the repo, written before the code was touched.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// ⛔ HER RECORD, and it deliberately lives outside this repo — in the planning
// vault, written during the sitting. If it cannot be read this file FAILS; it
// never falls back to a literal, because a fallback literal is an agent's copy
// of her words wearing the costume of a pin.
const DECISIONS = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker/' +
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases/' +
  '26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-2026-07-31/' +
  '26.96-DECISIONS.md');

const violations = [];
const notes = [];

// ⚠ THE OPTION NUMBER IS READ, NEVER ASSUMED. An earlier version hard-coded
// "1" because the first two rulings happened to be A1 and B1 — and then she
// chose N2, and the pin could not find her words at all. A gate that can only
// see the option an agent expected is a gate that quietly stops covering the
// moment she picks differently.
function readRuled(tag) {
  const src = fs.readFileSync(DECISIONS, 'utf8');
  const re = new RegExp('^\\| ' + tag + ' \\|[^|]*\\|\\s*\\*\\*' + tag +
    '(\\d+)\\*\\*\\s*—\\s*`([^`]*)`', 'm');
  const m = src.match(re);
  if (!m) {
    throw new Error('her ruling for ' + tag + ' is not in the record at ' +
      DECISIONS + ' — this pin has no expectation to compare against and ' +
      'must not invent one');
  }
  return { option: tag + m[1], text: m[2] };
}

function liftConst(name) {
  // The constant may be one literal or a concatenation across lines; take
  // everything up to the terminating semicolon and evaluate just the string
  // expression, so the pin reads what the renderer will actually hold.
  const at = APP.indexOf('var ' + name + ' =');
  if (at === -1) { throw new Error(name + ' is not declared in app.js'); }
  const end = APP.indexOf(';', at);
  const expr = APP.slice(at + ('var ' + name + ' =').length, end).trim();
  // eslint-disable-next-line no-new-func
  const value = new Function('return (' + expr + ');')();
  if (typeof value !== 'string') {
    throw new Error(name + ' did not evaluate to a string');
  }
  return value;
}

function codepoints(s) {
  return Array.from(s).map(function (c) {
    return c.codePointAt(0).toString(16).padStart(4, '0');
  }).join(' ');
}

function pin(tag, constName) {
  const record = readRuled(tag);
  const ruled = record.text;
  const shipped = liftConst(constName);

  if (!ruled.length) {
    violations.push('[' + tag + '] her record holds an EMPTY sentence — ' +
      'nothing to pin against');
    return;
  }
  if (!shipped.length) {
    violations.push('[' + tag + '] ' + constName + ' is still the empty ' +
      'string, but she ruled: ' + JSON.stringify(ruled));
    return;
  }
  if (shipped !== ruled) {
    violations.push('[' + tag + '] ' + constName + ' DOES NOT MATCH HER ' +
      'RULING.\n      she ruled: ' + JSON.stringify(ruled) +
      '\n      shipped   : ' + JSON.stringify(shipped) +
      '\n      ⛔ Her words are the truth here. Change the code, never the ' +
      'record.');
    return;
  }
  // ⛔ AND BY CODEPOINT, because a smart-quote tidy or an en-dash swap is
  // invisible to the eye in a diff and would pass a careless equality check
  // written against a re-typed expectation.
  if (codepoints(shipped) !== codepoints(ruled)) {
    violations.push('[' + tag + '] bytes differ below the glyph: ' +
      codepoints(shipped) + ' vs ' + codepoints(ruled));
    return;
  }
  notes.push(record.option + ' ships exactly as she ruled it (' +
    shipped.length + ' chars, codepoints match)');
}

try {
  pin('A', 'ROSTER_ADD_FUTURE_ONLY');
  pin('B', 'ROSTER_UNREAD_LINE');
  // ⭐ THE THIRD SEAT, ruled 2026-08-20 after the security pass surfaced F-7.
  // ⛔ Its sentence must stay true of BOTH cases the room cannot tell apart —
  // a mis-typed name and a real folder she has not filled yet. That property
  // is not checkable from a string, so it is asserted where it CAN be: the
  // negative below refuses the wording that would accuse her.
  pin('N', 'ROSTER_ADD_NAME_UNKNOWN');

  // ⛔ THE PUNCTUATION SHE ACTUALLY CHOSE, asserted by codepoint rather than
  // trusted. B1 was picked to echo a shipped line carrying a STRAIGHT
  // apostrophe; a tidy to U+2019 would break the echo she chose it for.
  const b = liftConst('ROSTER_UNREAD_LINE');
  if (b.indexOf('’') !== -1) {
    violations.push('[B] ROSTER_UNREAD_LINE carries a CURLY apostrophe ' +
      '(U+2019). She chose this line to echo the shipped failure line, which ' +
      'carries a straight one.');
  } else {
    notes.push('B1 keeps the straight apostrophe its shipped sibling uses');
  }
  // ⛔ THE ONE THING N2 MAY NEVER BECOME. The room resolves zero things under
  // the name whether she mis-typed it or the folder is simply empty, so a
  // sentence naming a mistake would accuse her on the legitimate case. This
  // refuses the accusing vocabulary outright rather than trusting review.
  const n = liftConst('ROSTER_ADD_NAME_UNKNOWN');
  const accusing = ["doesn't exist", 'does not exist', 'not found', 'no such',
    'misspell', 'mistake', 'typo', 'invalid', "couldn't find that folder"];
  const accuses = accusing.filter(function (w) {
    return n.toLowerCase().indexOf(w) !== -1;
  });
  if (accuses.length) {
    violations.push('[N] ROSTER_ADD_NAME_UNKNOWN accuses her of an error ' +
      '(' + accuses.join(', ') + '). The room CANNOT tell a mis-typed name ' +
      'from a real folder she has not put anything in yet — measured — so ' +
      'this line must describe only what the room FOUND.');
  } else {
    notes.push('N2 describes what the room found and accuses her of nothing');
  }

  const a = liftConst('ROSTER_ADD_FUTURE_ONLY');
  if (a.indexOf('—') === -1) {
    violations.push('[A] ROSTER_ADD_FUTURE_ONLY has lost its em dash ' +
      '(U+2014) — an en dash or a hyphen is not what she ruled.');
  } else {
    notes.push('A1 keeps its em dash');
  }
} catch (e) {
  violations.push('[instrument] ' + (e && e.message ? e.message : e));
}

notes.forEach(function (n) { console.log('  ok  ' + n); });
if (violations.length) {
  console.log('');
  violations.forEach(function (v) { console.log('  FAIL  ' + v); });
  console.log('');
  console.log('test_roster_ruled_copy FAILED — ' + violations.length +
    ' violation(s)');
  process.exitCode = 1;
} else {
  console.log('test_roster_ruled_copy OK — both sentences she ruled at the ' +
    'sitting ship byte-exactly, pinned against her own record and never ' +
    'against the constants themselves');
}
