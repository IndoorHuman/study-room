#!/usr/bin/env node
/*
 * tests/test_saved_body_refusals.cjs — the SIX REFUSALS above the guard
 * ladder, pinned by EXECUTION at the seam that renders.
 *
 * WHY THIS FILE EXISTS. The 26.88 verification copied the repo to a scratch
 * tree and deleted, one at a time, each early return that sits ABOVE the
 * four-guard ladder in the one saved-body wrapper. Re-running all fifty
 * suites after each deletion, SIX DELETIONS LEFT THE WHOLE SWEEP GREEN:
 *
 *   1. the librarian-source refusal      (D-05)
 *   2. the `item.reflects` refusal       (D-05)
 *   3. the `reflects:` frontmatter refusal (D-05)
 *   4. `StudyCore.isPersonalNote`        (D-06 / D-19)
 *   5. `StudyCore.hasAuthorHeading`      (D-07.4a)
 *   6. the `SHOW_AS_SAVED` swap          (SC-4)
 *
 * The PREDICATES behind them are fixtured exhaustively in core.js — force
 * `isPersonalNote` to return false and the sweep goes red immediately. What
 * nothing asserted is their WIRING at the seam that actually renders. That is
 * this phase's own named defect class — a check that reads as enforced and is
 * not — found one layer above where the phase was looking.
 *
 * Number 4 is the one that matters most in her life rather than in the
 * architecture. It is what stops the owner's own private correspondence, personal
 * paperwork, official-process material and long-form drafts from being reformatted
 * on a reading surface — the exposure plan 10 was written to close. It must
 * not be possible to delete it silently.
 *
 * HOW THIS FILE DIFFERS FROM ITS NEIGHBOURS, and why a seventh static gate
 * would not have closed the gap:
 *
 *   - `test_core.cjs` / `test_reformat_fixtures.cjs` fixture the PREDICATES.
 *     A predicate can be perfect while nobody calls it.
 *   - `test_reformat_wiring.cjs` reads app.js AS TEXT. It pins that the six
 *     render sites call the wrapper and that the reflection branch precedes
 *     it. Its own violation messages NAME two of these branches — "the D-06
 *     personal-note branch and the D-07.4a author-heading branch" — while
 *     asserting only that a site calls the wrapper. Naming is not asserting.
 *   - A grep for `StudyCore.isPersonalNote(` would pass against
 *     `if (false && StudyCore.isPersonalNote(item, fm))`. Mentioning a
 *     function is not calling it: this phase has hit that trap twice.
 *
 * So every case below RUNS the shipped wrapper and asserts WHAT THE READER IS
 * HANDED. Each refusal is paired with a TWIN that differs ONLY in the thing
 * that triggers the refusal and that is asserted to come back CHANGED. Without
 * the twin, a case that asserts "unchanged" is satisfied by a transform that
 * stopped working — which is how a green suite measures nothing.
 *
 * THE WRAPPER IS TWO FUNCTIONS AS OF CR-02 (commit 020e7ce): the hashtag
 * carve-out moved up into `renderSavedBody`, which now delegates the layout to
 * `renderSavedBodyLaidOut`. Refusals 1, 2, 3, 4 and 6 therefore exist TWICE —
 * once in each half — and refusal 5 exists only in the layout half (by the
 * documented decision at app.js: the carve-out deliberately does not honour
 * `hasAuthorHeading`). The byte-identity assertions below are written to catch
 * a deletion in EITHER half: delete it from the layout half and the note comes
 * back restructured; delete it from the carve-out half and the note comes back
 * with her `#` marks stripped. Both are `!== body`, both are RED.
 *
 * Bare node, zero dependencies. Extraction + `new Function` is the shipped
 * tests/test_saved_body_escape.cjs / test_view_stack.cjs idiom.
 *
 * DRIVEN RED FIRST: every case below was proven to fail against a scratch copy
 * with its own branch deleted, and to pass again when the branch was restored.
 * The deletion was verified to have changed the file before the result was
 * believed — a mutation that matches nothing is a green suite lying twice.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const APP = process.env.REFUSAL_APP || path.join(ROOT, 'app.js');
const CORE = process.env.REFUSAL_CORE || path.join(ROOT, 'core.js');
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

// Both halves of the shipped wrapper if the split is there, one function if a
// future refactor undoes it. NOTHING is re-spelled here; the only things
// injected are the seams a browser would supply.
const LAID_OUT = appSrc.indexOf('function renderSavedBodyLaidOut(') !== -1
  ? 'renderSavedBodyLaidOut' : null;

const warnings = [];
const SHOW_AS_SAVED = {};
const REFORMAT_STATE = {};
const MARKED = { parse: function (s) { return s; } };

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

const renderSavedBody = build()(
  C, SHOW_AS_SAVED, REFORMAT_STATE,
  { DOMPurify: {}, marked: MARKED }, MARKED,
  { warn: function (m) { warnings.push(String(m)); } },
  function () { return []; },
  function () { return false; });

// What `marked` finally receives: the wrapper's answer, then the ONE markdown
// seam's clean-up. Asserting here rather than at the wrapper alone is the
// difference between a gate and a decoration — CR-02's defect lived in the
// second half of exactly this composition.
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

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------
//
// CLIP_FM is a clipped note's frontmatter: a frontmatter block exists and its
// source is not `personal`, so `isPersonalNote` is false and every refusal
// below has to come from the thing the case is actually testing.
const CLIP_FM = 'source: xiaohongshu\ntitle: t\n';

// A dense recipe-shaped body with a colon label the transform promotes to a
// heading AND a platform tag block the carve-out strips. ONE fixture exercises
// BOTH halves of the wrapper, which is what lets a single byte-identity
// assertion catch a deletion in either half.
const DENSE = '食材：鸡蛋2个 面粉100g 糖30g 做法：1️⃣ 打散鸡蛋 2️⃣ 加入面粉 ' +
  '3️⃣ 搅拌均匀\n\n#烘焙 #家常菜';

function fresh(id) { delete SHOW_AS_SAVED[id]; delete REFORMAT_STATE[id]; }

// The twin. Every refusal case calls this with a note that differs ONLY in
// the refusal trigger, and it must come back CHANGED IN BOTH WAYS — laid out
// and carved. If this ever stops holding, the "unchanged" assertions above it
// are being satisfied by a dead transform rather than by a live refusal, and
// the whole file is decoration.
function twinIsTransformed(label, item, fm, body) {
  fresh(item.id);
  const out = renderSavedBody(item, fm, body);
  assert.notStrictEqual(out, body,
    label + ': THE TWIN CONTROL FAILED. A note identical to the refused one ' +
    'except for the refusal trigger came back byte-identical, so this case ' +
    'proves nothing — "unchanged" is not evidence of a refusal when nothing ' +
    'was going to change anyway.');
  assert.notStrictEqual(out.indexOf('## '), -1,
    label + ': the twin must be LAID OUT (the layout half ran)');
  assert.strictEqual(out.indexOf('#烘焙'), -1,
    label + ': and CARVED (the carve-out half ran) — both halves are live on ' +
    'this fixture, which is why one byte-identity assertion covers both');
  return out;
}

// ---------------------------------------------------------------------------
// R0 — the fixture is capable of showing a difference (master control)
// ---------------------------------------------------------------------------
check('R0 a clipped note IS restructured and IS carved', function () {
  const item = { id: 'r0', type: 'text' };
  const out = twinIsTransformed('R0', item, CLIP_FM, DENSE);
  assert.notStrictEqual(out.indexOf('烘焙'), -1,
    'her word survives the carve-out; only the platform mark comes off');
  assert.strictEqual(REFORMAT_STATE[item.id], true,
    'and the note records as swappable, so the escape control is on screen');
  assert.strictEqual(C.bodyGuards(DENSE, out, []).words, true,
    'word preservation holds on the transformed output — law 4 is not ' +
    'suspended for the sake of a test fixture');
});

// ---------------------------------------------------------------------------
// R1 — the librarian's own prose (D-05)
// ---------------------------------------------------------------------------
check('R1 the librarian-source refusal holds at the seam', function () {
  const item = { id: 'r1-lib', type: 'text', source: 'librarian' };
  fresh(item.id);
  assert.strictEqual(renderSavedBody(item, CLIP_FM, DENSE), DENSE,
    'BYTE-IDENTICAL. 26.87 spent a whole phase getting the librarian\'s ' +
    'voice right and it is already written well-structured; laying it out ' +
    'again would be the app rewriting its own words back at her (D-05).');
  assert.strictEqual(asRendered(item, CLIP_FM, DENSE),
    C.cleanVaultMarkup(DENSE), 'and the seam `marked` receives agrees');
  assert.strictEqual(REFORMAT_STATE[item.id], false,
    'and it records as not swappable — a body nothing changed must not ' +
    'offer a control that swaps it back to itself (D-08)');
  twinIsTransformed('R1', { id: 'r1-twin', type: 'text',
    source: 'obsidian-vault' }, CLIP_FM, DENSE);
});

// ---------------------------------------------------------------------------
// R2 — a reflection, by the item's own field (D-05)
// ---------------------------------------------------------------------------
check('R2 the item.reflects refusal holds at the seam', function () {
  const item = { id: 'r2-ref', type: 'text', reflects: 'note-42' };
  fresh(item.id);
  assert.strictEqual(renderSavedBody(item, CLIP_FM, DENSE), DENSE,
    'BYTE-IDENTICAL. A reflection is the librarian\'s prose wearing a ' +
    'different field name; it is refused for the same reason (D-05).');
  assert.strictEqual(REFORMAT_STATE[item.id], false,
    'and it records as not swappable');
  twinIsTransformed('R2', { id: 'r2-twin', type: 'text' }, CLIP_FM, DENSE);
});

// ---------------------------------------------------------------------------
// R3 — a reflection, by its frontmatter (D-05)
// ---------------------------------------------------------------------------
check('R3 the `reflects:` frontmatter refusal holds at the seam', function () {
  // THE SECOND, INDEPENDENT SPELLING, and it is not redundant: a reflection
  // read off disk carries the key in its frontmatter and may reach the reader
  // as an item with no `reflects` field at all. Deleting either refusal alone
  // leaves the other looking sufficient, which is exactly why both need a case.
  const item = { id: 'r3-fm', type: 'text' };
  const fm = 'reflects: note-42\nsource: xiaohongshu\ntitle: t\n';
  fresh(item.id);
  assert.strictEqual(renderSavedBody(item, fm, DENSE), DENSE,
    'BYTE-IDENTICAL — the frontmatter says reflection even though the item ' +
    'object does not (D-05)');
  assert.strictEqual(REFORMAT_STATE[item.id], false,
    'and it records as not swappable');
  twinIsTransformed('R3', { id: 'r3-twin', type: 'text' }, CLIP_FM, DENSE);
});

// ---------------------------------------------------------------------------
// R4 — HER OWN WRITING, AND ANYTHING WHOSE PROVENANCE THE APP CANNOT
//      DEMONSTRATE (D-06 / D-19)
// ---------------------------------------------------------------------------
//
// This is the branch the verification singled out. The four bodies below are
// shaped like the real notes it protects: a private correspondence log, a
// personal-paperwork file, an official-process checklist, a long-form draft. All four are dense
// enough that the transform WOULD restructure them — proven note by note by
// the twin, so "unchanged" here is a refusal and not a coincidence.
//
// EVERY ONE OF THEM ENDS IN A TAG PAIR SHE TYPED HERSELF, and that is not
// decoration either. Both halves of the wrapper carry this refusal, and a body
// with no `#` in it cannot tell them apart: delete the carve-out half's copy
// and a hashtag-free fixture comes back byte-identical anyway, green. Her real
// notes are not hashtag-free — `TODO-JobSearch.md` carries
// `(#ClaudeCode #AIEngineering)`, a tag pair that is HER WORDING and not a
// platform's tag block. So the fixtures carry marks, and R4 asserts they
// survive.
const OWN_WRITING = [
  ['a private correspondence log',
    '2026-03-04 记录：今天又被叫去开会。上午 9 点收到电话 ' +
    '下午 2 点收到邮件 晚上睡不着 记录如下：1️⃣ 会议没有议程 ' +
    '2️⃣ 我要求书面确认 3️⃣ 对方没有回复\n\n#记录 #待办'],
  ['a personal-paperwork file',
    '材料笔记：清单 截图 三份 语音留言 一条 证明人 两位 ' +
    '时间线：1️⃣ 一月收到第一份通知 2️⃣ 三月提交材料 3️⃣ 五月约谈' +
    '\n\n#材料 #时间线'],
  ['an official-process checklist',
    '材料清单：账单 租约 保险 报税单 照片 ' +
    '步骤：1️⃣ 收集证据 2️⃣ 填表 3️⃣ 寄出并留底\n\n#清单 #步骤'],
  ['a long-form draft',
    '草稿 第三章：我记得那年冬天 城里下了很大的雪 厨房的灯还亮着 ' +
    '门还没有开 我坐在窗边 想着以后 要点：1️⃣ 冬天 2️⃣ 厨房 3️⃣ 窗边' +
    '\n\n#草稿 #第三章']
];

check('R4 her own writing is refused — no frontmatter at all (D-19)',
  function () {
    OWN_WRITING.forEach(function (pair, n) {
      const label = pair[0];
      const body = pair[1];
      const item = { id: 'r4-own-' + n, type: 'text' };
      assert.strictEqual(C.isPersonalNote(item, ''), true,
        label + ': the fixture really does take the D-19 refusal — a note ' +
        'with NO frontmatter block is hers until the app can demonstrate ' +
        'otherwise, which is a decision and not a fallback');
      fresh(item.id);
      assert.strictEqual(renderSavedBody(item, '', body), body,
        label + ': BYTE-IDENTICAL. This is the branch that stops the ' +
        'reformatter reaching 28 of her own notes on a reading surface.');
      assert.strictEqual((renderSavedBody(item, '', body).match(/#/g) || [])
        .length, 2,
        label + ': BOTH `#` MARKS SHE TYPED ARE STILL THERE, counted. The ' +
        'refusal lives in BOTH halves of the wrapper and this is the ' +
        'assertion that can tell them apart — a body with no `#` in it comes ' +
        'back identical whether the carve-out half honours her provenance or ' +
        'not, which is a case that measures nothing.');
      assert.strictEqual(REFORMAT_STATE[item.id], false,
        label + ': and it records as not swappable');

      // The twin: the SAME body, clipped provenance. It comes back changed,
      // so the byte-identity above is a refusal rather than an inert note.
      const twin = { id: 'r4-twin-' + n, type: 'text' };
      fresh(twin.id);
      const out = renderSavedBody(twin, CLIP_FM, body);
      assert.notStrictEqual(out, body,
        label + ': THE TWIN CONTROL FAILED — the same body with clipped ' +
        'provenance came back unchanged, so nothing was ever going to ' +
        'happen to it and the refusal above measured nothing');
      assert.notStrictEqual(out.indexOf('## '), -1,
        label + ': and the twin is genuinely LAID OUT');
    });
  });

check('R4b the two other provenance routes are refused at the seam too',
  function () {
    // `source: personal` stated outright, and the owner-owned folder roster.
    // Three routes into one predicate; the seam has to honour the predicate,
    // not one of its three reasons.
    const stated = { id: 'r4-stated', type: 'text' };
    const statedFm = 'source: personal\ntitle: t\n';
    assert.strictEqual(C.isPersonalNote(stated, statedFm), true,
      'sanity: `source: personal` is the stated route');
    fresh(stated.id);
    assert.strictEqual(renderSavedBody(stated, statedFm, DENSE), DENSE,
      'BYTE-IDENTICAL — she said it is hers');

    const foldered = { id: 'r4-folder', type: 'text', folder: 'Journal' };
    assert.strictEqual(C.isPersonalNote(foldered, CLIP_FM), true,
      'sanity: the owner-owned folder roster is the third route');
    fresh(foldered.id);
    assert.strictEqual(renderSavedBody(foldered, CLIP_FM, DENSE), DENSE,
      'BYTE-IDENTICAL — a journal entry is hers whatever its frontmatter says');

    twinIsTransformed('R4b', { id: 'r4b-twin', type: 'text' }, CLIP_FM, DENSE);
  });

// ---------------------------------------------------------------------------
// R5 — an already-structured note: never layer a second pass (D-07.4a)
// ---------------------------------------------------------------------------
check('R5 the author-heading refusal holds at the seam', function () {
  // No tag block on this fixture ON PURPOSE. The carve-out deliberately does
  // NOT honour `hasAuthorHeading` (app.js records why: honouring it there
  // would silently delete the owner's 2026-08-03 decision on 15 of her 32
  // hashtag notes), so a hashtag-free body is the one that isolates THIS
  // refusal instead of testing the carve-out's opt-out list a second time.
  const headed = '## 我的做法\n\n食材：鸡蛋2个 面粉100g 糖30g ' +
    '做法：1️⃣ 打散鸡蛋 2️⃣ 加入面粉 3️⃣ 搅拌均匀';
  const item = { id: 'r5-head', type: 'text' };
  assert.strictEqual(C.hasAuthorHeading(headed), true,
    'the fixture really does take the author-heading refusal');
  fresh(item.id);
  assert.strictEqual(renderSavedBody(item, CLIP_FM, headed), headed,
    'BYTE-IDENTICAL. She already gave this note its structure; a second pass ' +
    'lays the app\'s headings UNDER hers and the note reads as written twice ' +
    '(D-07.4a).');
  assert.strictEqual(REFORMAT_STATE[item.id], false,
    'and it records as not swappable');

  // The twin: the same note with her heading removed. It comes back with a
  // heading the transform added — which is precisely what the refusal above
  // is preventing from being layered on top of hers.
  const plain = headed.replace('## 我的做法\n\n', '');
  const twin = { id: 'r5-twin', type: 'text' };
  assert.strictEqual(C.hasAuthorHeading(plain), false, 'sanity: no heading');
  fresh(twin.id);
  const out = renderSavedBody(twin, CLIP_FM, plain);
  assert.notStrictEqual(out, plain,
    'R5: THE TWIN CONTROL FAILED — an unheaded copy of the same body came ' +
    'back unchanged, so the refusal measured nothing');
  assert.notStrictEqual(out.indexOf('## '), -1,
    'R5: and the heading the transform adds is the one that would have been ' +
    'layered under hers');
});

// ---------------------------------------------------------------------------
// R6 — the escape control's swap (SC-4)
// ---------------------------------------------------------------------------
check('R6 "show as saved" swaps to the untransformed body', function () {
  const item = { id: 'r6-swap', type: 'text' };
  fresh(item.id);
  const laid = renderSavedBody(item, CLIP_FM, DENSE);
  assert.notStrictEqual(laid, DENSE, 'sanity: this note IS transformed');

  SHOW_AS_SAVED[item.id] = true;
  assert.strictEqual(renderSavedBody(item, CLIP_FM, DENSE), DENSE,
    'BYTE-IDENTICAL — "you can always see what you saved". This is SC-4\'s ' +
    'escape, and the verification found it deletable with fifty suites green.');
  assert.strictEqual(asRendered(item, CLIP_FM, DENSE), C.cleanVaultMarkup(DENSE),
    'and every `#` she saved is on screen at the seam `marked` receives');
  assert.strictEqual(REFORMAT_STATE[item.id], true,
    'AND the control stays on screen after the tap — recording false here ' +
    'would make it vanish on the first tap with no way back (D-08)');

  SHOW_AS_SAVED[item.id] = false;
  assert.strictEqual(renderSavedBody(item, CLIP_FM, DENSE), laid,
    'and the toggle goes back the other way');
  fresh(item.id);
});

// ---------------------------------------------------------------------------
// R7 — the refusals are ABOVE the ladder, not beside it
// ---------------------------------------------------------------------------
check('R7 a refusal wins even when the transform would have succeeded',
  function () {
    // The point of ORDER: every fixture above is a note the guard ladder
    // would have waved through. If a refusal were moved BELOW the ladder it
    // would still be "present" and every grep would still find it, while the
    // note it protects had already been rewritten. Stated as a measurement:
    // the guards pass on all of these, and they are refused anyway.
    OWN_WRITING.concat([['the dense clip', DENSE]]).forEach(function (pair) {
      const body = pair[1];
      const out = C.structureBody(body, []);
      const g = C.bodyGuards(body, out.text, out.addedHeadings);
      assert.strictEqual(g.ok, true,
        pair[0] + ': the ladder would have passed this note — so the ' +
        'refusals above are the only thing standing between it and the ' +
        'reformatter');
      assert.notStrictEqual(out.text, body,
        pair[0] + ': and the transform genuinely wanted to change it');
    });
  });

if (violations.length) {
  console.error('test_saved_body_refusals FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}
console.log('test_saved_body_refusals OK — 8 executed cases covering the six ' +
  'refusals above the guard ladder, each paired with a twin that comes back ' +
  'changed');
process.exit(0);
