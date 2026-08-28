#!/usr/bin/env node
'use strict';
/* test_call_cost — FINDING F10, the arithmetic half.
 *
 * ⛔⛔ WHAT F10 IS. The figure on her consent card prices THE REPLY and
 * nothing else. Measured on two real sittings the same night, both on her own
 * library:
 *
 *     test run      42,238 sent   2,406 replied   quoted $0.40   really $0.27
 *     her real run 228,155 sent   1,933 replied   quoted $0.40   really $1.19
 *
 * ⭐ THE QUOTE IS WRONG IN BOTH DIRECTIONS, which is worse than merely low: it
 * cannot move, so it is not an estimate of anything. She named it herself —
 * *"sounds like we put the 40 cents is not good on this app"*.
 *
 * ⛔ THIS FILE GATES THE ARITHMETIC ONLY. `forecast_usd` and `FORECAST_MSG`
 * are asserted BYTE-UNCHANGED below, because the sentence she agrees to is
 * HERS and is undrafted. A later commit that "fixes" the consent card by
 * wiring this number into it, without her words, turns this file RED on
 * purpose.
 *
 * ⚠ WHY A .cjs FILE FOR PYTHON ARITHMETIC: this is the house's source-and-
 * behaviour pin shape (see test_reflection_reach.cjs). It drives the real
 * `server.py` through `python3 -c` for the behaviour, and reads the file for
 * the pins that are about what the source must and must not say.
 *
 * Exits 0/1, house convention.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fs = require('fs');
const { execFileSync } = require('child_process');

const SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const PY = process.env.GSD_PYTHON_BIN || 'python3';

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ok   ' + msg); }
  else { console.log('  FAIL ' + msg); failures++; }
}
function py(expr) {
  return execFileSync(PY, ['-c',
    'import sys; sys.path.insert(0, ' + JSON.stringify(ROOT) + ');\n' +
    'import server\n' + expr], { encoding: 'utf8' }).trim();
}

console.log('\n-- 1. the two real sittings, priced --------------------------');
// ⛔ THESE ARE HER OWN MEASURED CALLS, from ~/.study-room/call-record.json on
// 2026-08-23. They are the reason this file exists and they are pinned BY
// VALUE so a rate-table edit that changes what her sittings cost goes red.
const her = Number(py(
  'print(server.call_usd(("anthropic","claude-opus-5"), 228155, 1933))'));
const test = Number(py(
  'print(server.call_usd(("anthropic","claude-opus-5"), 42238, 2406))'));
// 228,155 x $5/1M + 1,933 x $25/1M = 1,140,775 + 48,325 = $1.1891
ok(Math.abs(her - 1.1891) < 1e-9,
  'her real sitting prices at $1.1891 (quoted $0.40 — UNDER by ~3x)');
//  42,238 x $5/1M + 2,406 x $25/1M =   211,190 + 60,150 = $0.27134
ok(Math.abs(test - 0.27134) < 1e-9,
  'the test sitting prices at $0.27134 (quoted $0.40 — OVER)');
ok(her > test,
  'a larger sitting costs more than a smaller one — the thing the quoted ' +
  'figure structurally cannot express');

console.log('\n-- 2. it refuses rather than lies ---------------------------');
// ⛔ NONE, NEVER ZERO. A recorded 0.0 reads as "this call was free", and a
// call that cost something recorded as free is F10 in a new costume.
ok(py('print(server.call_usd(("anthropic","claude-nope"), 10, 10))') === 'None',
  'an unpriced model returns None, not 0.0');
ok(py('print(server.call_usd(("nobody","claude-opus-5"), 10, 10))') === 'None',
  'an unwitnessed provider returns None, not 0.0');
ok(py('print(server.call_usd(None, 10, 10))') === 'None',
  'an unknown fill returns None');
ok(py('print(server.call_usd(("anthropic","claude-opus-5"), None, 10))') === 'None',
  'an unreported input count returns None, not a half-priced call');
ok(py('print(server.call_usd(("anthropic","claude-opus-5"), 10, None))') === 'None',
  'an unreported output count returns None');
ok(py('print(server.call_usd(("anthropic","claude-opus-5"), -1, 10))') === 'None',
  'a negative count returns None');
// ⚠ BOTH POSITIONS, AND THE SECOND ONE IS HERE BECAUSE IT WAS MISSING. The
// first version of this file asked the bool question of the INPUT argument
// only, and a mutation that dropped the bool guard from the OUTPUT argument
// SURVIVED the whole drill. Recorded rather than quietly corrected: a gate
// that checks one side of a symmetric guard is a gate with a hole in it.
ok(py('print(server.call_usd(("anthropic","claude-opus-5"), True, 10))') === 'None',
  'a bool input is not a token count — True must not price as 1');
ok(py('print(server.call_usd(("anthropic","claude-opus-5"), 10, True))') === 'None',
  'a bool OUTPUT is not a token count either — the arm a mutant walked ' +
  'straight through on the first drill');
ok(py('print(server.call_usd(("anthropic","claude-opus-5"), 0, 0))') === '0.0',
  'a genuinely zero-token call IS 0.0 — that is a measurement, not a refusal');

console.log('\n-- 3. the input side actually participates -------------------');
// ⛔ THE ANTI-VACUITY ARM. If input were still ignored — the shipped defect —
// these two would be EQUAL. They must not be.
const inputMatters = py(
  'a=server.call_usd(("anthropic","claude-opus-5"), 1000000, 0)\n' +
  'b=server.call_usd(("anthropic","claude-opus-5"), 0, 0)\n' +
  'print("%.6f %.6f" % (a, b))').split(' ');
ok(Number(inputMatters[0]) > 0,
  'a million input tokens with no reply costs something (input is priced ' +
  'at all — this is the whole defect)');
ok(Math.abs(Number(inputMatters[0]) - 5.0) < 1e-9,
  '1M opus-5 input tokens = $5.00, the first-party rate');
ok(Math.abs(Number(py(
  'print(server.call_usd(("anthropic","claude-opus-5"), 0, 1000000))')) - 25.0) < 1e-9,
  '1M opus-5 output tokens = $25.00, matching the shipped output table');

console.log('\n-- 4. every priced model is priced on BOTH sides -------------');
// ⚠ A model with an output rate and no input rate would silently return None
// for every call it answers — a whole tier recording nothing, which reads as
// a tier that costs nothing.
const bothSides = py(
  'out=set(server.LIBRARIAN_PRICES)\n' +
  'inp=set(server.LIBRARIAN_INPUT_PRICES)\n' +
  'print("MISMATCH" if out != inp else "SAME")');
ok(bothSides === 'SAME',
  'the input and output tables cover exactly the same fills');

console.log('\n-- 5. HER CONSENT SENTENCE IS UNTOUCHED ----------------------');
// ⛔⛔ THE POINT OF THE WHOLE FILE. Fixing the arithmetic is not permission to
// change what she agreed to. The wording is hers and F10 records it undrafted.
ok(/FORECAST_MSG = "This task may consume a good amount power for librarian's brain, the estimate will be x\."/
  .test(SERVER),
  'FORECAST_MSG is byte-unchanged — her sentence was not quietly reworded');
ok(/the job's own `max_tokens`/.test(SERVER),
  'forecast_usd still documents itself as the answer-ceiling bound — it was ' +
  'not silently converted into a payload estimate');
ok(!/call_usd\(/.test(SERVER.slice(SERVER.indexOf('def forecast_line'),
                                   SERVER.indexOf('def forecast_block'))),
  'the consent line does NOT call call_usd — wiring it there needs her words');

console.log('\n-- 6. ⛔ IT MUST NOT BE IN THE CALL RECORD --------------------');
// ⛔⛔ THE FIRST VERSION OF THIS FILE ASSERTED THE OPPOSITE. It wired call_usd
// into the call-record writer to give it "a real caller", and
// tests/test_spend_record.py caught it the same night. That suite is right and
// this one was wrong: the call record is a PRIVACY LEDGER (D-01/D-02) — read
// one way a bill, read the other everything this app has ever sent and to
// whom, and the only thing in the room that answers *has my privacy been
// kept* with evidence. Its six fields are a CEILING; a seventh key fails by
// design; money is banned outright because a record that reads as a bill
// stops being read as a privacy record.
//
// ⚠ SO call_usd HAS NO CALLER, ON PURPOSE — the same standing derive_handwritten
// and journal_tier carry. Its number belongs in the figure she agrees to
// before a sitting, and THAT SENTENCE IS HERS AND UNDRAFTED (F10, debt 2).
const writer = SERVER.slice(SERVER.indexOf('def record_call('),
                            SERVER.indexOf('def record_call(') + 2600);
ok(!/call_usd\(/.test(writer),
  'call_usd is NOT wired into the call-record writer — D-01 bans money there');
ok(!/"usd"/.test(writer) && !/\busd\b/.test(writer.replace(/#.*$/gm, '')),
  'no cost key reaches the record file');
ok(/NOTHING CALLS THIS, AND THAT IS A DECISION/.test(SERVER),
  'and the absence is RECORDED rather than left to look like an oversight — ' +
  'this phase already shipped two built-but-never-called defects');

console.log('');
if (failures) {
  console.log('FAIL test_call_cost — ' + failures + ' check(s)');
  process.exit(1);
}
console.log('test_call_cost OK — the arithmetic prices what was SENT as well ' +
  'as what came back, refuses rather than reporting a false zero, and her ' +
  'consent sentence is byte-unchanged.');
console.log('⛔ NOT FIXED HERE: the sentence she agrees to still promises an ' +
  'estimate it cannot make. That wording is hers (F10), and until she writes ' +
  'it this function correctly has nowhere to go.');
process.exit(0);
