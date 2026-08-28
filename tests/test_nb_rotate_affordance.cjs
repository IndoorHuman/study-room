/*
 * tests/test_nb_rotate_affordance.cjs — F-11 (Phase 26.9, owner request).
 * Zero-dep node (assert/fs/path only), path-independent.
 *
 * THE REQUESTS, IN THE OWNER'S WORDS (2026-08-06):
 *   "I found how to rotate but the UX is quite confusing for me, I want you
 *    to do something like adobe photoshop, when the user's mouse hover to the
 *    point where they can rotate the image, you will see a small arrow…
 *    otherwise I cannot know when and where I can rotate."
 *   "and also when rotating the user can press shift to rotate like 90
 *    degrees or 180 degrees"
 *
 * Rotate already WORKED — paintDecoHandles has shipped a rotate grip all
 * along. What it lacked was any way to know it was there: three identical
 * 12px squares, no labels, no cursor change. Photoshop's answer is that the
 * cursor names the verb under the mouse, and that is what this adds.
 *
 * Behaviors covered:
 *   1. THE ROTATE CURSOR EXISTS and is a real image, not a keyword — a
 *      keyword cannot draw a curved arrow, and no native CSS cursor means
 *      "rotate".
 *   2. IT HAS A CENTRED HOTSPOT — a custom cursor whose hotspot is left at
 *      the default 0,0 points a corner at the target and feels off by half
 *      its own size.
 *   3. IT FALLS BACK — a browser refusing the data: URI must still land on a
 *      keyword that means something, since the hover-grow belt was removed
 *      (see the note in tokens.css) and this is now the only channel.
 *   4. EVERY GRIP NAMES ITS OWN VERB — rotate, scale and remove must have
 *      three DIFFERENT cursors. One shared cursor would say "draggable" and
 *      leave the original complaint unanswered.
 *   5. SHIFT SNAPS, AND HITS THE ANGLES SHE NAMED — the increment must
 *      divide both 90 and 180 exactly.
 *   6. THE MODIFIER IS READ LIVE, not latched at pointerdown, so pressing or
 *      releasing Shift mid-drag changes the angle. That is the difference
 *      between a modifier and a mode.
 *   7. THE SNAP IS ABSOLUTE, not relative to where the mark happened to sit,
 *      so "90" means square to the page — the stop she can actually name.
 *   8. WITHOUT SHIFT ROTATION STAYS FREE — a snap-always implementation
 *      passes 5-7 and is wrong.
 *   9. THE GUARD THAT WAS NOT WEAKENED — (9h) forbids hover rules on
 *      .page-deco variants. The first draft of this fix added one and was
 *      reverted rather than having the guard narrowed to admit it.
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
function stripCssComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ');
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

// Pull one rule block out of the stylesheet by selector.
function ruleFor(sel) {
  const css = stripCssComments(cssSrc);
  const i = css.indexOf(sel);
  assert.notStrictEqual(i, -1, sel + ' must exist in tokens.css');
  return css.slice(i, css.indexOf('}', i) + 1);
}

// ---- 1 + 2 + 3: the rotate cursor -----------------------------------------
{
  const rot = ruleFor('.page-deco-rotate {');
  const m = /cursor:\s*([\s\S]*?);/.exec(rot);
  assert.ok(m, '1: .page-deco-rotate must set a cursor');
  const decl = m[1];

  assert.ok(/url\(/.test(decl),
    '1: it must be an IMAGE — no native CSS keyword means "rotate", which ' +
    'is the whole reason this needed drawing');
  assert.ok(/svg/i.test(decl),
    '1: drawn inline as SVG rather than a PNG in assets/room/, so it does ' +
    'not collide with the sprite work happening in parallel');

  // hotspot: url(...) <x> <y>
  const hot = /\)\s*(\d+)\s+(\d+)\s*,/.exec(decl);
  assert.ok(hot, '2: the cursor must declare a hotspot');
  assert.ok(Number(hot[1]) > 0 && Number(hot[2]) > 0,
    '2: and it must be centred, not left at the default 0,0 — a corner ' +
    'hotspot points half a cursor away from what it is pointing at');

  assert.ok(/,\s*(grab|pointer|move|crosshair|alias|all-scroll)\s*;?\s*$/
    .test(decl.trim() + ';'),
    '3: it must fall back to a MEANINGFUL keyword. The hover-grow belt was ' +
    'deliberately removed rather than weaken the (9h) guard, so if the ' +
    'data: URI is refused this fallback is the only affordance left');

  // the drawn arrow keeps a rim so it survives light AND dark backgrounds —
  // the Pixel Build Script's one exception to no-outline-under-16px.
  assert.ok(/%23fbf7ee/.test(decl) && /%232c2823/.test(decl),
    '1: the cursor is drawn with BOTH a light rim and a dark body — a ' +
    'cursor sits on unknown backgrounds (SPRITES.md 8.3)');
}

// ---- 4: three grips, three verbs ------------------------------------------
{
  const cur = (sel) => {
    const m = /cursor:\s*([\s\S]*?);/.exec(ruleFor(sel));
    return m ? m[1].trim() : null;
  };
  const rotate = cur('.page-deco-rotate {');
  const scale = cur('.page-deco-scale {');
  const remove = cur('.page-deco-remove {');
  assert.ok(rotate && scale && remove,
    '4: all three grips must declare a cursor');
  assert.notStrictEqual(rotate, scale, '4: rotate and scale must differ');
  assert.notStrictEqual(scale, remove, '4: scale and remove must differ');
  assert.notStrictEqual(rotate, remove, '4: rotate and remove must differ');
  assert.ok(/resize/.test(scale),
    '4: scale gets a RESIZE cursor — and the diagonal one, since the grip ' +
    'sits at the bottom-right corner it drags');
}

// ---- 5 + 6 + 7 + 8: the Shift constrain -----------------------------------
{
  const snapM = /var NB_ROTATE_SNAP = (\d+);/.exec(appSrc);
  assert.ok(snapM, '5: the snap increment must be a named constant');
  const snap = Number(snapM[1]);

  assert.strictEqual(90 % snap, 0,
    '5: the increment must hit 90° exactly — she named it');
  assert.strictEqual(180 % snap, 0,
    '5: and 180° exactly — she named that too');
  assert.ok(snap > 0 && snap < 90,
    '5: and be finer than 90, or Shift cannot straighten a slightly tilted ' +
    'photo, which is the common case');

  const drag = stripComments(extractFn(appSrc, 'attachPageDrag'));
  const rotBranch = drag.slice(drag.indexOf("gesture === 'rotate'"));
  const body = rotBranch.slice(0, rotBranch.indexOf('return;'));

  assert.ok(/shiftKey/.test(body),
    '6: the rotate branch must consult Shift');
  assert.ok(/ev\.shiftKey/.test(body),
    '6: read from the MOVE event (ev), so pressing or releasing Shift ' +
    'mid-drag follows. Latching it at pointerdown would make it a mode, ' +
    'not a modifier');
  assert.ok(!/e\.shiftKey/.test(body),
    '6: and NOT from the pointerdown event (e), which is the latching bug');

  assert.ok(/Math\.round\([^)]*NB_ROTATE_SNAP\)\s*\*\s*NB_ROTATE_SNAP/
    .test(body.replace(/\s+/g, ' ')),
    '7: the snap quantises the angle to the increment');
  assert.ok(/Math\.round\(\s*free\s*\//.test(body.replace(/\s+/g, ' ')),
    '7: and it quantises the ABSOLUTE angle, not the delta — 90° must mean ' +
    'square to the page, not 90° from wherever this mark was sitting');

  assert.ok(/\?[\s\S]*:\s*free/.test(body),
    '8: WITHOUT Shift the angle stays free and unquantised — a ' +
    'snap-always implementation satisfies every assertion above and is wrong');
}

// ---- 9: the guard that was not weakened -----------------------------------
{
  assert.strictEqual(/\.page-deco[^,{]*:hover/.test(stripCssComments(cssSrc)),
    false,
    '9: still NO hover rule on any .page-deco variant. The first draft of ' +
    'this fix added one as a fallback channel; it was removed rather than ' +
    'narrowing the (9h) guard to admit it. Narrowing a shipped guard to let ' +
    "one's own addition through is how guards die");
}

console.log('OK test_nb_rotate_affordance.cjs — F-11: the cursor names the ' +
  'verb under the mouse, and Shift constrains rotation to ' +
  (/var NB_ROTATE_SNAP = (\d+);/.exec(appSrc)[1]) + '° (9 groups)');
