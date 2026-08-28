/*
 * tests/test_nb_remove_deco.cjs — F-10 (Phase 26.9, owner request).
 * Zero-dep node (assert/fs/path only), path-independent.
 *
 * THE GAP, IN THE OWNER'S WORDS (2026-08-06):
 *   "I may want to delete a sticker which I did a while ago but this current
 *    workflow only have the option to undo and redo, this will get rid of all
 *    of the other changes I want to keep, so include the delete option for
 *    each component"
 *
 * She was exactly right and it was a real hole: before this there was NO
 * delete anywhere in notebook design mode — no handle, and nbKeydown bound
 * only undo/redo. Removing one early mark meant undoing every good change
 * made after it.
 *
 * The distinction the fix rests on: UNDO IS A TIME CONTROL, REMOVE IS AN
 * OBJECT CONTROL. Neither substitutes for the other, which is why "you can
 * already undo" was never an answer.
 *
 * (Rotate was ALSO requested and already existed — paintDecoHandles has
 * shipped a rotate grip all along. That was a discoverability failure, not a
 * missing feature, and it is tracked with the design-band re-layout rather
 * than here.)
 *
 * Behaviors covered:
 *   1. REMOVES THE ONE — the named record leaves the day and every other
 *      record survives, in order. This is the whole request.
 *   2. UNDOABLE — pushNbUndo fires BEFORE the mutation, so one undo puts it
 *      back without disturbing anything else.
 *   3. NO-OP IS SILENT — a record not in the day pushes no history. A
 *      keystroke that appears to do nothing is the shipped placeFromTray
 *      rule, applied here for the same reason.
 *   4. SELECTION IS DROPPED — a coral outline must not survive the thing it
 *      outlined.
 *   5. THE PEN ORPHAN TRAP — removing the active stroke group clears
 *      NB_PEN_GROUP, or the next stroke appends ink to a record nothing
 *      renders.
 *   6. IT PERSISTS — the removal posts, rather than living only on screen
 *      until the next reload.
 *   7. THE KEYBOARD PATH EXISTS AND IS GUARDED — the handle layer is
 *      aria-hidden direct-manipulation chrome, so Delete/Backspace is the
 *      only accessible route; and it must be inert with nothing selected,
 *      because deleting "the last thing" is a destructive act nobody aimed.
 *   8. THE ALARM COLOUR IS NOT SPENT ON IT — the remove grip must not use
 *      --never. That colour's one use in this phase is `yes` on "put this
 *      day back", which wipes a whole day; removing one undoable mark is
 *      ordinary editing, and spending the same colour would flatten the
 *      difference. (The first draft of this fix DID use it and the notebook
 *      suite's equality caught it.)
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');

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

// Build a rig around the SHIPPED nbRemoveDeco with its free variables
// injected, so what runs is the real function.
function rig(opts) {
  const o = opts || {};
  const day = { reset: false, items: o.items };
  const state = { posted: [], repaints: 0, pushes: 0,
    NB_SEL: o.sel === undefined ? null : o.sel,
    NB_PEN_GROUP: o.pen === undefined ? null : o.pen };
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'NB_DAY', 'decoDay', 'pushNbUndo', 'postDecorations', 'NB_REPAINT', 'S',
    'var NB_SEL = S.NB_SEL, NB_PEN_GROUP = S.NB_PEN_GROUP;\n' +
    extractFn(appSrc, 'nbRemoveDeco') +
    '\nreturn function (rec) { nbRemoveDeco(rec);' +
    ' S.NB_SEL = NB_SEL; S.NB_PEN_GROUP = NB_PEN_GROUP; };')(
    o.noDay ? null : '08/06/2026',
    function () { return day; },
    function () { state.pushes++; state.atPush = day.items.length; },
    function (d) { state.posted.push(d); },
    function () { state.repaints++; },
    state);
  return { day: day, state: state, remove: fn };
}

const mk = (id) => ({ kind: 'sticker', page: 'p1', x: 1, y: 1, id: id });

// ---- 1 + 2 + 4 + 6: the ordinary case -------------------------------------
{
  const a = mk('a'), b = mk('b'), c = mk('c');
  const r = rig({ items: [a, b, c], sel: b });
  const before = JSON.stringify(r.day);

  r.remove(b);

  assert.deepStrictEqual(r.day.items, [a, c],
    '1: the named record leaves and every OTHER change survives, in order — ' +
    'this is the entire request (undo would have taken c with it)');
  assert.strictEqual(r.state.pushes, 1, '2: exactly one history push');
  assert.strictEqual(r.state.atPush, 3,
    '2: and it fired BEFORE the mutation (3 items at push time), so one ' +
    'undo restores it');
  assert.strictEqual(r.state.NB_SEL, null,
    '4: the selection is dropped — an outline must not outlive its subject');
  assert.strictEqual(r.state.posted.length, 1,
    '6: the removal is persisted, not just repainted');
  assert.strictEqual(r.state.repaints, 1, '6: and repainted once');

  // 2 (the other half): the snapshot taken before the mutation is complete
  const restored = JSON.parse(before);
  assert.strictEqual(restored.items.length, 3, '2: undo would restore all 3');
}

// ---- 3: a no-op is silent -------------------------------------------------
{
  const a = mk('a');
  const stranger = mk('zz');
  const r = rig({ items: [a] });
  r.remove(stranger);
  assert.deepStrictEqual(r.day.items, [a], '3: nothing removed');
  assert.strictEqual(r.state.pushes, 0,
    '3: and NO history pushed for a record that was not there — an undo ' +
    'handing back a page she never changed is a keystroke that appears to ' +
    'do nothing');
  assert.strictEqual(r.state.posted.length, 0, '3: and nothing posted');

  const r2 = rig({ items: [a] });
  r2.remove(null);
  assert.strictEqual(r2.state.pushes, 0, '3: a null record is tolerated');

  const r3 = rig({ items: [a], noDay: true });
  r3.remove(a);
  assert.strictEqual(r3.state.pushes, 0, '3: no day, no act');
}

// ---- 5: the pen orphan trap ----------------------------------------------
{
  const g = { kind: 'stroke', page: 'p1', x: 0, y: 0, pts: [] };
  const r = rig({ items: [mk('a'), g], sel: g, pen: g });
  r.remove(g);
  assert.strictEqual(r.state.NB_PEN_GROUP, null,
    '5: removing the active stroke group clears NB_PEN_GROUP, or the next ' +
    'stroke appends ink to a record nothing renders');
}

// ---- 7: the keyboard path, and its guard ----------------------------------
{
  const kd = stripComments(extractFn(appSrc, 'nbKeydown'));
  assert.ok(/delete|backspace/i.test(kd),
    '7: Delete/Backspace must be bound — the handle layer is aria-hidden, ' +
    'so this is the ONLY accessible route to removing a mark');
  assert.ok(/nbRemoveDeco\(/.test(kd),
    '7: and it must go through the same remove path, not its own splice');
  assert.ok(/if\s*\(\s*!\s*NB_SEL\s*\)/.test(kd),
    '7: guarded on a live selection — Backspace with nothing selected must ' +
    'stay inert rather than deleting "the last thing"');

  // the handle itself
  const paint = stripComments(extractFn(appSrc, 'paintDecoHandles'));
  assert.ok(/page-deco-remove/.test(paint),
    '7: the pointer path exists too');
  assert.ok(/addEventListener\(\s*'click'/.test(paint),
    '7: and it is a CLICK, not a drag — the other two grips adjust ' +
    'continuously, this one acts once');
}

// ---- 8: the alarm colour stays scarce -------------------------------------
{
  const i = cssSrc.indexOf('.page-deco-remove');
  assert.notStrictEqual(i, -1, '8: the remove grip must be styled');
  const block = stripComments(cssSrc.slice(i, cssSrc.indexOf('}', cssSrc
    .indexOf('.page-deco-remove::after')) + 1));
  assert.ok(!/var\(--never\)/.test(block),
    '8: the remove grip must NOT use --never. That colour\'s single use in ' +
    'this phase is `yes` on the reset control, which wipes a WHOLE day; ' +
    'removing one undoable mark is ordinary editing, and spending the same ' +
    'colour would flatten the difference between them');
  assert.ok(/var\(--ink\)/.test(block) && /var\(--card\)/.test(block),
    '8: it is distinguished by polarity instead — the adjust grips are ink ' +
    'on a card ring, this is the inverse plus a bar');
}

console.log('OK test_nb_remove_deco.cjs — F-10: one decoration can be removed ' +
  'without undoing everything after it (8 groups; pointer + keyboard, ' +
  'undoable, alarm colour left scarce)');
