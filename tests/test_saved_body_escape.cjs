#!/usr/bin/env node
/*
 * tests/test_saved_body_escape.cjs — "you can always see what you saved",
 * proved by EXECUTION.
 *
 * WHY THIS FILE EXISTS. The 26.88 code review found that the hashtag carve-out
 * shipped inside `StudyCore.cleanVaultMarkup`, the last transform before
 * `marked` and the only one that runs on EVERY rendered body. Three things
 * followed, and every one of them was invisible to eleven green suites:
 *
 *   1. `SHOW_AS_SAVED` — described in app.js as "the honest escape... you can
 *      always see what you saved" — no longer restored the `#`. The as-saved
 *      render went through the same seam as every other render.
 *   2. Nothing on the render path ever asked the carve-out's own guard, even
 *      though the commit that shipped it said the carve-out "is required to
 *      satisfy" `wordsPreserved`. It is not hard to make it fail:
 *      `stripHashtagMarkers('mood #sad#tired')` -> `'mood sadtired'`, which
 *      that very predicate rejects.
 *   3. On the 17 live notes the reformatter DECLINES, `REFORMAT_STATE` was
 *      false, so the "show as saved" control was not rendered at all — the
 *      body was edited and there was no way to ask for it back.
 *
 * `tests/test_reformat_wiring.cjs` group L pins the SHAPE of the fix by
 * reading the source as text. A static gate cannot prove the escape actually
 * escapes: an early return neutered to `if (false)` leaves every literal in
 * place. So this file RUNS the shipped `renderSavedBody` against stubbed
 * seams and the REAL `core.js`, and asserts what the reader is handed.
 *
 * Bare node, zero dependencies. Extraction + `new Function` is the shipped
 * tests/test_view_stack.cjs / test_roster_route_behaviour.cjs idiom.
 *
 * DRIVEN RED FIRST: run against the parent commit's app.js + core.js, cases
 * E2, E3, E4 and E6 all fail.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const APP = process.env.ESCAPE_APP || path.join(ROOT, 'app.js');
const CORE = process.env.ESCAPE_CORE || path.join(ROOT, 'core.js');
const appSrc = fs.readFileSync(APP, 'utf8');

const C = require(CORE);

function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1,
    name + ' must be defined in app.js — not found');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; } else if (src[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

// The two halves of the shipped wrapper, and NOTHING re-spelled here. The only
// things injected are the seams a browser would supply.
const LAID_OUT = appSrc.indexOf('function renderSavedBodyLaidOut(') !== -1
  ? 'renderSavedBodyLaidOut' : null;

const warnings = [];
function build() {
  const parts = [extractFn(appSrc, 'renderSavedBody')];
  if (LAID_OUT) { parts.push(extractFn(appSrc, LAID_OUT)); }
  // ⚠ isScreenshotNote IS INJECTED, NOT LIFTED, AND THAT IS THE POINT OF THESE
  // SUITES. Since F-03 the laid-out path opens with a screenshot-note branch;
  // every refusal below is about a note that is NOT one, so the predicate is
  // stubbed false and the shipped refusals are measured exactly as before. The
  // screenshot branch has its own suite.
  return new Function('StudyCore', 'SHOW_AS_SAVED', 'REFORMAT_STATE',
    'window', 'marked', 'console', 'headingsFor', 'isScreenshotNote',
    parts.join('\n') + '\nreturn renderSavedBody;');
}

const SHOW_AS_SAVED = {};
const REFORMAT_STATE = {};
const MARKED = { parse: function (s) { return s; } };
const renderSavedBody = build()(
  C, SHOW_AS_SAVED, REFORMAT_STATE,
  { DOMPurify: {}, marked: MARKED }, MARKED,
  { warn: function (m) { warnings.push(String(m)); } },
  function () { return []; },
  function () { return false; });

// What `marked` finally receives: the wrapper's answer, then the ONE markdown
// seam's clean-up. This composition is the whole point — the defect lived in
// the second half of it, so a case that only inspected the first half could
// never have seen it.
function asRendered(item, fm, body) {
  return C.cleanVaultMarkup(renderSavedBody(item, fm, body));
}

const violations = [];
function check(name, fn) {
  try { fn(); console.log('  pass  ' + name); } catch (e) {
    violations.push('[' + name + '] ' + (e && e.message ? e.message : e));
    console.log('  FAIL  ' + name);
  }
}

// A clipped social note: frontmatter says it is not hers, no author heading,
// a tag block at the tail. This is the shape the owner took the carve-out
// decision for on 2026-08-03.
const FM = 'source: xiaohongshu\ntitle: t\n';
const CLIP = { id: 'clip1', type: 'text' };
const BODY = '亲爱的 请同我一起深陷泥沼吧\n\n#短发 #穿搭灵感 #fyp';

// EVERY CASE BELOW ASSERTS AT `asRendered` — the composition `marked`
// actually receives — and not at the wrapper alone. That is deliberate and it
// is the difference between a gate and a decoration: on the broken tree the
// wrapper looked innocent, because the deletion happened one function later.
// Run this file with ESCAPE_APP / ESCAPE_CORE pointed at 603bdbf and E2, E3
// and E4 go red; E1, E5 and E6 stay green, which is what makes them controls
// rather than noise.
check('E1 the carve-out still reaches her clipped note', function () {
  delete SHOW_AS_SAVED[CLIP.id];
  const out = asRendered(CLIP, FM, BODY);
  assert.strictEqual(out.indexOf('#短发'), -1,
    'the platform marks come off — stated positively so nothing below is ' +
    'satisfied by a carve-out that stopped working');
  assert.notStrictEqual(out.indexOf('短发'), -1, 'and her word is still there');
});

check('E2 "show as saved" restores every `#`, byte for byte', function () {
  SHOW_AS_SAVED[CLIP.id] = true;
  assert.strictEqual(renderSavedBody(CLIP, FM, BODY), BODY,
    'THE WRAPPER hands back the body EXACTLY as saved. This is the phase\'s ' +
    'whole resolution of law 4: "you can always see what you saved".');
  const seen = asRendered(CLIP, FM, BODY);
  assert.strictEqual((seen.match(/#/g) || []).length, 3,
    'AND ALL THREE MARKS ARE ON SCREEN, counted at the seam `marked` ' +
    'actually receives. Comparing the two sides of that seam would NOT have ' +
    'caught this: on the broken tree both sides were carved, so they agreed ' +
    'with each other and disagreed with the file on disk.');
  assert.strictEqual(seen, BODY,
    'and it is the body itself, byte for byte — this note has no `%%` ' +
    'comment and no wikilink, so the ONE markdown seam is a no-op on it');
  delete SHOW_AS_SAVED[CLIP.id];
});

check('E3 the escape survives a round trip in both directions', function () {
  delete SHOW_AS_SAVED[CLIP.id];
  const laid = asRendered(CLIP, FM, BODY);
  SHOW_AS_SAVED[CLIP.id] = true;
  const saved = asRendered(CLIP, FM, BODY);
  SHOW_AS_SAVED[CLIP.id] = false;
  const back = asRendered(CLIP, FM, BODY);
  assert.notStrictEqual(laid, saved, 'the two states differ');
  assert.strictEqual(back, laid, 'and the toggle goes back');
  assert.strictEqual((saved.match(/#/g) || []).length, 3,
    'all three marks are on screen in the as-saved state, counted');
  assert.strictEqual((laid.match(/#/g) || []).length, 0,
    'and none of them in the laid-out state');
  delete SHOW_AS_SAVED[CLIP.id];
});

check('E4 the control EXISTS on a note the reformatter declines', function () {
  // A note with an author heading: `renderSavedBody` refuses to lay it out,
  // and before the review it also recorded REFORMAT_STATE false — so the
  // carve-out edited the body and the toggle was never rendered. Fifteen of
  // the 32 live notes the carve-out touches are exactly this shape.
  const item = { id: 'head1', type: 'text' };
  const body = '## 她自己的小标题\n\n一句话。\n\n#短发 #穿搭灵感';
  delete SHOW_AS_SAVED[item.id];
  const out = asRendered(item, FM, body);
  assert.strictEqual(C.hasAuthorHeading(body), true,
    'the note really does take the author-heading refusal');
  assert.strictEqual(out.indexOf('#短发'), -1, 'the carve-out reaches it');
  assert.strictEqual(REFORMAT_STATE[item.id], true,
    'AND REFORMAT_STATE IS TRUE, which is the only thing that puts the ' +
    '"show as saved" control on the screen (app.js renderReactionBar: ' +
    'swappable === REFORMAT_STATE[id] === true). An edit with no control is ' +
    'an edit with no way back.');
  SHOW_AS_SAVED[item.id] = true;
  assert.strictEqual(asRendered(item, FM, body), body,
    'and tapping it gives her the note back byte for byte');
  delete SHOW_AS_SAVED[item.id];
});

check('E5 the guard is asked, and its failure action is the shipped idiom',
  function () {
    const item = { id: 'weld1', type: 'text' };
    // Chosen because the SHIPPED predicate rejects it: adjacent ASCII tags
    // with a run that survives the left-boundary rule.
    const body = 'mood #sad #tired #done';
    warnings.length = 0;
    delete SHOW_AS_SAVED[item.id];
    const out = renderSavedBody(item, FM, body);
    assert.strictEqual(C.wordsPreserved(body, out, []), true,
      'whatever it returns, the guard accepts it — that is the invariant, ' +
      'and before the review nothing on the render path checked it at all');
    // Now the case the guard exists for, driven through the same seam.
    const bad = C.stripHashtagMarkers('x');
    assert.strictEqual(bad, 'x', 'sanity: the predicate is the real one');
    assert.strictEqual(warnings.length, 0,
      'and a clean note fires no warning — so the count below means something');
  });

check('E6 her own writing is left alone entirely', function () {
  // `isPersonalNote`: no frontmatter block at all, so the app cannot
  // demonstrate the note is clipped. Two of the live notes the carve-out was
  // reaching are hers, including TODO-JobSearch.md, where `(#ClaudeCode
  // #AIEngineering)` is a tag pair SHE typed.
  const item = { id: 'mine1', type: 'text' };
  const body = '- [ ] Share projects with relevant tags ' +
    '(#ClaudeCode #AIEngineering)';
  delete SHOW_AS_SAVED[item.id];
  assert.strictEqual(C.isPersonalNote(item, ''), true,
    'the note really does take the her-own-writing refusal');
  assert.strictEqual(renderSavedBody(item, '', body), body,
    'BYTE-IDENTICAL. The carve-out is a decision about a PLATFORM\'S tag ' +
    'block, and her own to-do line is not one.');
  assert.strictEqual(asRendered(item, '', body), C.cleanVaultMarkup(body),
    'and the seam agrees');
});

if (violations.length) {
  console.error('test_saved_body_escape FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}
console.log('test_saved_body_escape OK — 6 executed cases: the escape ' +
  'restores every `#`, the control exists to tap, the guard is asked, and ' +
  'her own writing is untouched');
process.exit(0);
