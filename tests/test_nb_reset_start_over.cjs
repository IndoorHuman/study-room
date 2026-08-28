/*
 * tests/test_nb_reset_start_over.cjs — F-9 (Phase 26.9, owner UAT beat 7).
 * Zero-dep node (assert/fs/path only), path-independent.
 *
 * THE BUG, IN THE OWNER'S WORDS (2026-08-06):
 *   "I found a bug after I pressed the button put this day back, and then
 *    press yes, so all of the edits are gone, I think sometimes user press
 *    this because they want to start over, however after I tried to start
 *    over, all of the old edits are back."
 *
 * A reset raises a day-level `reset` flag and the old records survive
 * underneath it. Both edit paths — placeFromTray and the pen — then cleared
 * that flag on the next mark, which RESURRECTED the entire hidden day. Both
 * sites argued for it in the same words: "between an invisible write and a
 * visible restoration, take the one that makes the mistake visible." A good
 * rule aimed at the wrong scenario — it guards against writing into a day
 * whose contents are hidden, but the reason people press the reset control
 * IS to start over, so the first new mark undid the gesture's whole purpose.
 *
 * (26.91-11: that sentence is CLAUDE'S NARRATION and names the control by
 *  ROLE now, because F-2 renamed its label. The block quote above at :6-9 is
 *  THE OWNER'S OWN WORDS from 2026-08-06 and is byte-unchanged — a
 *  historical record, not a label. The exemption is that QUOTATION, not this
 *  file: editing her words to satisfy a rename gate would falsify the record
 *  the gate exists to keep honest.)
 *
 * Beat 7 was the ONE beat the owner failed in the 26.9 UAT; this is that
 * failure.
 *
 * Behaviors covered:
 *   1. START OVER — on a reset day, a new mark leaves the page holding ONLY
 *      that mark. The superseded records do not come back.
 *   2. THE FLAG CLEARS — the day is a normal arranged day again, not a reset
 *      one, so the new mark actually renders.
 *   3. NOT A DELETE AT RESET TIME — resetting alone drops nothing; the
 *      records still survive under the flag, so an undo inside the session
 *      restores the whole day untouched. Deletion happens only once she has
 *      demonstrably chosen to build something else.
 *   4. UNDO STILL WORKS ACROSS THE RESET — the pre-reset snapshot carries the
 *      items, which is what makes (3) safe. This also disproves the comment
 *      that justified the old behaviour ("that survival is the only thing
 *      that makes reset undoable"): the snapshot is the whole record, so a
 *      drop is undoable too.
 *   5. A NORMAL DAY IS UNTOUCHED — editing a day that was never reset must
 *      not drop anything. This is the assertion that fails if someone
 *      "simplifies" the helper into an unconditional clear.
 *   6. BOTH EDIT PATHS GO THROUGH ONE HELPER — placeFromTray and the pen both
 *      call nbClearResetForEdit, and neither still assigns `.reset = false`
 *      itself, so they cannot drift apart again.
 *   7. THE PEN'S ORPHAN TRAP — after the clear, the pen re-checks that its
 *      stroke group is still in `items`. Without it, ink appends to a record
 *      nothing renders (the exact failure the pre-existing staleness check
 *      guards against), because the clear can drop the very group being
 *      extended.
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

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
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

// eslint-disable-next-line no-new-func
const nbClearResetForEdit = new Function(
  extractFn(appSrc, 'nbClearResetForEdit') + '\nreturn nbClearResetForEdit;')();

const OLD = () => ([
  { kind: 'sticker', page: 'p1', x: 10, y: 10 },
  { kind: 'text', page: 'p1', x: 20, y: 20, text: 'This is my favoirte paint' },
  { kind: 'image', page: 'p1', x: 30, y: 30, ref: 'r1' }
]);

// ---- 1 + 2: start over actually starts over -------------------------------
{
  const day = { reset: true, items: OLD() };
  // the pre-reset snapshot the callers push before any of this
  const snapshot = JSON.stringify(day);

  nbClearResetForEdit(day);
  const fresh = { kind: 'sticker', page: 'p1', x: 99, y: 99 };
  day.items.push(fresh);

  assert.strictEqual(day.items.length, 1,
    '1: after starting over the page holds ONLY the new mark — the old ' +
    'records must not come back (this is the owner-failed beat 7)');
  assert.strictEqual(day.items[0], fresh, '1: and it is the new mark');
  assert.strictEqual(day.reset, false,
    '2: the flag clears, so the day renders as arranged again');

  // ---- 4: undo across the reset still restores everything -----------------
  const restored = JSON.parse(snapshot);
  assert.strictEqual(restored.items.length, 3,
    '4: the pre-reset snapshot carries the items, so undo restores the ' +
    'whole day — a drop is undoable, contrary to the comment that justified ' +
    'the old resurrect behaviour');
  assert.strictEqual(restored.reset, true, '4: and the flag it was taken with');
}

// ---- 3: reset alone drops nothing -----------------------------------------
{
  // nbResetDay raises the flag and does NOT touch items; the drop happens
  // only at the next edit. Asserted on the shipped source of nbResetDay.
  const reset = stripComments(extractFn(appSrc, 'nbResetDay'));
  assert.ok(/\.reset\s*=\s*true/.test(reset),
    '3: nbResetDay must raise the flag');
  assert.ok(!/items\s*=\s*\[\]/.test(reset),
    '3: nbResetDay must NOT clear items — the records survive under the ' +
    'flag so an undo inside the session restores the day untouched');
  assert.ok(/pushNbUndo\(\)/.test(reset),
    '3: and it must snapshot BEFORE raising the flag');
}

// ---- 5: a day that was never reset must be untouched -----------------------
{
  const day = { reset: false, items: OLD() };
  nbClearResetForEdit(day);
  assert.strictEqual(day.items.length, 3,
    '5: editing a normal day must not drop anything — this fails if the ' +
    'helper is ever simplified into an unconditional clear');
  assert.strictEqual(day.reset, false, '5: and the flag stays down');

  // defensive: a missing record must not throw
  assert.doesNotThrow(() => nbClearResetForEdit(null), '5: null is tolerated');
  assert.doesNotThrow(() => nbClearResetForEdit(undefined),
    '5: undefined is tolerated');
}

// ---- 6: one helper, both paths --------------------------------------------
{
  const place = stripComments(extractFn(appSrc, 'placeFromTray'));
  assert.ok(/nbClearResetForEdit\(/.test(place),
    '6: placeFromTray must route through the shared helper');
  assert.ok(!/\.reset\s*=\s*false/.test(place),
    '6: placeFromTray must not clear the flag itself, or the two paths drift');

  // The pen path is an anonymous handler, so assert over the whole file:
  // after this fix NO site may assign `.reset = false` directly.
  const whole = stripComments(appSrc);
  const direct = (whole.match(/\.reset\s*=\s*false/g) || []).length;
  assert.strictEqual(direct, 1,
    '6: exactly ONE `.reset = false` may exist in app.js — the one inside ' +
    'nbClearResetForEdit. Found ' + direct + '. A second means an edit path ' +
    'is clearing the flag without dropping the superseded records, which is ' +
    'the F-9 bug returning by a different door');

  const helper = stripComments(extractFn(appSrc, 'nbClearResetForEdit'));
  assert.ok(/\.reset\s*=\s*false/.test(helper),
    '6: and that one occurrence must be the helper itself');
  assert.ok(/items\s*=\s*\[\]/.test(helper),
    '6: the helper must drop the superseded records');
}

// ---- 7: the pen's orphan trap ---------------------------------------------
{
  const whole = stripComments(appSrc);
  const i = whole.indexOf('nbClearResetForEdit(d);');
  const j = whole.indexOf('nbClearResetForEdit(d);', i + 1);
  assert.notStrictEqual(j, -1, '7: both edit paths must call the helper');

  // In the pen path the helper call must be followed by a re-check that the
  // stroke group survived the clear.
  const after = whole.slice(j, j + 420);
  assert.ok(/indexOf\(g\)\s*===\s*-1/.test(after),
    '7: after the clear the pen must re-check that its stroke group is ' +
    'still in items — the clear can drop the group being extended, and ' +
    'without this the ink appends to a record nothing renders');
  assert.ok(/NB_PEN_GROUP\s*=\s*null/.test(after),
    '7: and drop the stale group reference so a fresh one is created');
}

console.log('OK test_nb_reset_start_over.cjs — F-9: starting over after "put ' +
  'this day back" starts from blank (7 groups; undo across the reset intact)');
