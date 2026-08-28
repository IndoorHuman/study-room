/*
 * tests/test_seam_exports.cjs — the two seams an instrument needs, pinned
 * (Phase 26.88, Plan 16).
 *
 * WHY THIS FILE EXISTS. The blocking owner UAT found two things at once:
 *
 *   F-5  `splitFrontmatter` / `FM_RE` were closure-private to app.js, so every
 *        instrument that needed them carried its own spelling. The census in
 *        the finding said three; EXECUTING the scan below found FIVE.
 *   F-4  `app.js renderSavedBody` requires FOUR guards at TWO seams, and
 *        `tools/replan_probe.cjs` measured ONE of them at ONE seam. Over the
 *        90-note firing set the raw seam trips 0 and the clean seam trips 14,
 *        so the published coverage figure counted 90 notes reached where the
 *        app lays out 76.
 *
 * The fix for F-4 is not "add three more calls to the probe" — that creates a
 * FOURTH composition of a ladder that already had several. So the seams get
 * exported first and then the instrument calls them, and this suite is what
 * says there is exactly one of each.
 *
 * The cases:
 *   S1   the split on normal / no-fence / null / empty input        (SRM-01 empty)
 *   S2   the split is byte-identical to the shape it replaced
 *   S3   ONE SPELLING, over the whole repository, STRUCTURALLY
 *   S4   bodyGuards returns all five fields, ok is the conjunction
 *   S5   THE F-4 SHAPE: markupRaw true and markupClean false on one call
 *   S6   the four fields match an independently composed reference
 *   S7   all four are computed even when the first is false     (SRM-01 ordering)
 *   S8   the picker is stable across two constructions          (SRM-03 ordering)
 *   S9   the exports are on module.exports, so node and browser see one surface
 *   S10  NEUTRALITY over the live pool, per note                     (task 3)
 *
 * Stdlib only (assert / fs / path) plus ../core.js and
 * ../tools/pick_uat_notes.cjs — the zero-dependency law. No package manager, no
 * test framework, no new vendored byte.
 *
 * Every assertion carries a BECAUSE clause naming the decision it protects
 * (the tests/test_cleaning_writer.py convention).
 *
 * Run contract: every case name is printed as it passes, then ONE OK line, exit
 * 0. On failure every violation is listed with its case name and a reason, then
 * exit 1. Every path resolves through the CommonJS resolver relative to this
 * file, so the runner's cwd never matters.
 *
 * HONESTY LABEL: this suite proves there is ONE spelling of each seam and that
 * the shared verdict agrees with the composition it replaced. It says nothing
 * whatsoever about whether any note reads better. Only the owner's blocking
 * verdict (SC-7) is evidence for that.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const CORE = require(path.join(ROOT, 'core.js'));
const PICKER = require(path.join(ROOT, 'tools', 'pick_uat_notes.cjs'));

const passed = [];
const failures = [];

function testCase(name, fn) {
  try {
    fn();
    passed.push(name);
  } catch (err) {
    failures.push({ name: name, reason: err && err.message ? err.message :
      String(err) });
  }
}

function repeat(s, n) { return new Array(n + 1).join(s); }

// ---- S1: the split, including every empty shape ------------------------------

testCase('S1 the split on normal, fence-less, null and empty input', () => {
  const normal = '---\ntitle: x\nsource: xiaohongshu\n---\nhello\n\nworld\n';
  const got = CORE.splitFrontmatter(normal);
  // BECAUSE the 25-05 UAT: the frontmatter shows byte-exact in the collapsed
  // "how this was filed" block and the body renders as markdown. The split is
  // the only thing that decides where one ends and the other begins.
  assert.strictEqual(got.fm, 'title: x\nsource: xiaohongshu',
    'S1 the frontmatter comes back WITHOUT its fences');
  assert.strictEqual(got.body, 'hello\n\nworld\n',
    'S1 the body is everything after the closing fence line');

  const bare = 'no frontmatter here\n';
  const b = CORE.splitFrontmatter(bare);
  // BECAUSE D-19 (SRM-02 empty): a note carrying no frontmatter block is
  // PERSONAL and renders exactly as saved. `fm: null` is what that safety
  // branch reads, so this line is load-bearing on a safety gate rather than on
  // tidiness.
  assert.strictEqual(b.fm, null, 'S1 no fences means fm is null');
  assert.strictEqual(b.body, bare, 'S1 no fences means the body is the input');

  for (const empty of [null, undefined, '']) {
    const e = CORE.splitFrontmatter(empty);
    // BECAUSE SRM-01 [empty]: the split must never raise. It sits upstream of
    // every saved-body render site; an exception here is a blank reader.
    assert.strictEqual(e.fm, null,
      'S1 ' + String(empty) + ' splits to a null fm');
    assert.strictEqual(e.body, '',
      'S1 ' + String(empty) + ' splits to the empty string, not to ' +
      String(empty));
  }
});

// ---- S2: byte-identical to the shape it replaced -----------------------------
//
// Asserted against HARDCODED expected strings rather than against a second
// regex. A reference regex in this file would be the very fourth spelling S3
// exists to forbid, and a check that compares a rule to a copy of itself is the
// degenerate form of this gate.

testCase('S2 the split is byte-identical on CRLF, an inner ---, and fm-only',
  () => {
    const crlf = '---\r\ntitle: x\r\n---\r\nbody line\r\n';
    const c = CORE.splitFrontmatter(crlf);
    // BECAUSE the regex carries `\r?\n` on every newline it anchors: a note
    // saved on Windows must split identically to one saved here, or its body
    // would render with a stray `---` line she never wrote.
    assert.strictEqual(c.fm, 'title: x', 'S2 CRLF: fm without fences');
    assert.strictEqual(c.body, 'body line\r\n', 'S2 CRLF: body after the fence');

    // A `---` INSIDE a frontmatter value. The regex is LAZY, so it closes at
    // the FIRST line that is exactly `---`.
    const inner = '---\ntitle: a\n---\nb: c\n---\nreal body\n';
    const i = CORE.splitFrontmatter(inner);
    // BECAUSE the shape it replaced was lazy and this one must be too: an eager
    // match would swallow `b: c` into the frontmatter and drop it from the body,
    // which on a real note is her text vanishing from the reader.
    assert.strictEqual(i.fm, 'title: a', 'S2 inner ---: the FIRST close wins');
    assert.strictEqual(i.body, 'b: c\n---\nreal body\n',
      'S2 inner ---: everything after the first close is body');

    const only = '---\ntitle: x\n---\n';
    const o = CORE.splitFrontmatter(only);
    // BECAUSE UI-SPEC [empty]: a frontmatter-only note renders with the "how
    // this was filed" block and NOTHING else — no control, no invented text.
    assert.strictEqual(o.fm, 'title: x', 'S2 fm-only: the fm is present');
    assert.strictEqual(o.body, '', 'S2 fm-only: the body is empty');

    const noTrailingNewline = '---\ntitle: x\n---';
    const n = CORE.splitFrontmatter(noTrailingNewline);
    assert.strictEqual(n.fm, 'title: x',
      'S2 a closing fence at EOF with no newline still closes the block');
    assert.strictEqual(n.body, '', 'S2 ...and leaves an empty body');
  });

// ---- S3: ONE SPELLING, structurally -----------------------------------------
//
// THIS GATE IS STRUCTURAL AND NOT A LITERAL COMPARISON, and the difference is
// the whole point. A gate that greps for the shipped regex TEXT is defeated by
// re-spelling it — `-{3}` for `---` is enough — and the phase's signature
// failure is checks that look rigorous and measure nothing. So every regex in
// every file is EXECUTED against canonical frontmatter documents and judged by
// what it DOES: a regex that matches at index 0 and consumes a whole
// frontmatter block IS a frontmatter splitter, however it is spelled.
//
// `/^---/.test(raw)` in tests/test_reformat_fixtures.cjs is deliberately NOT
// caught by this, and that is the gate discriminating rather than a hole in it:
// it matches three characters, not a block, so it cannot be used to split a
// note. Over-tripping here would get the gate relaxed by the next person who
// hits it, which is how a real gate stops being trusted.
//
// THE EXCLUSION LIST IS SPELLED HERE AND IS EMPTY APART FROM THESE TWO.
const S3_EXCLUDED = ['core.js', 'vendor/'];

// Canonical frontmatter documents. A splitter must match at least one.
const S3_DOCS = [
  '---\ntitle: x\n---\nbody\n',
  '---\r\ntitle: x\r\n---\r\nbody\r\n'
];

// Does `m[0]` span a whole frontmatter block — an opening fence line, content,
// and a closing fence line? That is the behaviour, independent of spelling.
const S3_SPANS_BLOCK = /^-{3,}[ \t]*\r?\n[\s\S]*\r?\n-{3,}[ \t]*\r?\n?$/;

function s3Files() {
  const out = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name === '.git' || name === 'node_modules') { continue; }
      const full = path.join(dir, name);
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (fs.statSync(full).isDirectory()) {
        if (S3_EXCLUDED.indexOf(rel + '/') === -1) { walk(full); }
        continue;
      }
      if (!/\.(js|cjs)$/.test(name)) { continue; }
      if (S3_EXCLUDED.indexOf(rel) !== -1) { continue; }
      out.push(rel);
    }
  })(ROOT);
  return out;
}

// The one comment stripper, same shape as tests/test_reformat_wiring.cjs. The
// `[^:]` guard keeps a `https://` inside a string literal from swallowing the
// rest of the line.
function s3StripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Candidate regex sources in a file: every regex LITERAL, plus every string
// literal handed to `new RegExp(`. Non-regexes and innocent regexes are
// filtered out by EXECUTION below, not by this scanner, so a loose scan here is
// safe and a tight one would be the hole.
const S3_LITERAL_RE =
  /\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+)\/([gimsuy]*)/g;
const S3_NEWREGEXP_RE = /new\s+RegExp\s*\(\s*(['"])((?:[^\\]|\\.)*?)\1/g;

function s3Candidates(src) {
  const out = [];
  let m;
  S3_LITERAL_RE.lastIndex = 0;
  while ((m = S3_LITERAL_RE.exec(src)) !== null) {
    out.push({ source: m[1], flags: m[2].replace(/[gy]/g, '') });
  }
  S3_NEWREGEXP_RE.lastIndex = 0;
  while ((m = S3_NEWREGEXP_RE.exec(src)) !== null) {
    let unescaped;
    try { unescaped = JSON.parse('"' + m[2].replace(/"/g, '\\"') + '"'); }
    catch (e) { continue; }
    out.push({ source: unescaped, flags: '' });
  }
  return out;
}

function s3IsSplitter(cand) {
  let re;
  try { re = new RegExp(cand.source, cand.flags); } catch (e) { return false; }
  for (const doc of S3_DOCS) {
    let hit;
    try { hit = re.exec(doc); } catch (e) { return false; }
    if (!hit || hit.index !== 0) { continue; }
    if (S3_SPANS_BLOCK.test(hit[0])) { return true; }
  }
  return false;
}

// A splitter declared by any name: an object literal RETURNED carrying both an
// `fm` and a `body` key. Belt and braces behind the behavioural scan above — a
// splitter cannot work without a frontmatter-matching regex, so the scan above
// is the load-bearing half.
const S3_RETURNED_PAIR = [
  /\breturn\s*\{[^{}]*\bfm\s*:[^{}]*\bbody\s*:[^{}]*\}/,
  /\breturn\s*\{[^{}]*\bbody\s*:[^{}]*\bfm\s*:[^{}]*\}/
];

testCase('S3 exactly ONE frontmatter splitter in this repository', () => {
  const files = s3Files();
  // BECAUSE a scan that walked no files reports zero violations and is
  // indistinguishable from a clean repository. The floor is checked first.
  assert.ok(files.length >= 30,
    'S3 scanned only ' + files.length + ' files — the roster collapsed, and a ' +
    'zero from an empty scan is not a zero');

  const violations = [];
  for (const rel of files) {
    const src = s3StripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const cand of s3Candidates(src)) {
      if (s3IsSplitter(cand)) {
        violations.push(rel + ' carries a frontmatter-splitting regex: /' +
          cand.source + '/');
      }
    }
    for (const shape of S3_RETURNED_PAIR) {
      if (shape.test(src)) {
        violations.push(rel + ' returns an object carrying both `fm` and ' +
          '`body` — a frontmatter splitter declared under some other name');
      }
    }
  }
  // BECAUSE F-5, and BECAUSE F-1 before it: one rule with two callers that
  // disagreed cost this phase a whole UAT corpus. The split decides where a
  // note's frontmatter ends, and D-19 reads `fm: null` to decide a note is
  // PERSONAL and must render exactly as saved. Two spellings of it is two
  // answers to a safety question.
  assert.deepStrictEqual(violations, [],
    'S3 found ' + violations.length + ' spelling(s) of the frontmatter split ' +
    'outside core.js:\n    ' + violations.join('\n    '));
});

// ---- S4: the verdict's shape -------------------------------------------------

const S4_FIELDS = ['words', 'markupRaw', 'markupClean', 'headingsBound', 'ok'];

// The bodies S4/S6 run over: S1-S5's fixtures plus eight drawn from the
// existing fixture families.
const GUARD_BODIES = [
  ['empty', ''],
  ['plain prose', 'hello world\n\nsecond block\n'],
  ['crlf', 'one line\r\n\r\nsecond block\r\n'],
  ['bom', '﻿a body that opens with a byte-order mark\n'],
  ['cjk wall', repeat('这是一段没有任何标记的中文长句。', 40)],
  ['frontmatter-only remainder', ''],
  ['fenced block', '```js\nvar x = 1;\n```\n\nafter the fence\n'],
  ['table', '| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter the table\n'],
  ['blockquote run', '> **图片转录：**\n> ' + repeat('文', 60) + '\n\ntail\n'],
  ['emphasis pair', 'a *bit* of emphasis and some _more_ of it\n'],
  ['wikilink', 'see [[Some Note]] and ![[picture.jpg]] here\n'],
  ['empty heading', '## \n\nsomething under a heading bound to nothing\n']
];

testCase('S4 bodyGuards returns all five fields and ok is their conjunction',
  () => {
    for (const [label, body] of GUARD_BODIES) {
      const out = CORE.structureBody(body, []);
      const g = CORE.bodyGuards(body, out.text, out.addedHeadings);
      for (const f of S4_FIELDS) {
        // BECAUSE SRM-02 [ordering]: the probe prints all four counts on every
        // run, in a fixed order, so the block is diffable line for line. An
        // `undefined` field prints as a silently-absent count.
        assert.strictEqual(typeof g[f], 'boolean',
          'S4 [' + label + '] field ' + f + ' is ' + typeof g[f] +
          ', not a boolean');
      }
      const conj = g.words && g.markupRaw && g.markupClean && g.headingsBound;
      // BECAUSE a constant-true `ok` satisfies a naive "five fields present"
      // check while telling the app every note is safe to lay out.
      assert.strictEqual(g.ok, conj,
        'S4 [' + label + '] ok is not the conjunction of the four');
    }

    // The empty case, stated on its own because the plan states it on its own.
    const e = CORE.bodyGuards('', '', []);
    // BECAUSE SRM-01 [empty]: an empty body must not read as a guard trip. A
    // note whose body is empty or frontmatter-only renders exactly as today.
    assert.deepStrictEqual(
      [e.words, e.markupRaw, e.markupClean, e.headingsBound, e.ok],
      [true, true, true, true, true],
      'S4 an empty src and an empty out are all four green');

    // It never raises, on any malformed input.
    for (const bad of [null, undefined]) {
      const g = CORE.bodyGuards(bad, bad, bad);
      // BECAUSE the itemExcluded null-guard-first posture: every predicate this
      // composes is fail-closed already, so the composition must be too — an
      // exception here is a blank reader rather than a note shown as saved.
      assert.strictEqual(typeof g.ok, 'boolean',
        'S4 bodyGuards(' + String(bad) + ') returns a verdict, not a throw');
    }
  });

// ---- S5: THE F-4 SHAPE, INLINE ----------------------------------------------
//
// THIS IS THE ONE CASE A DEGENERATE IMPLEMENTATION CANNOT FAKE, and it is the
// case the probe has never been able to see. A bodyGuards that ran
// markupPreserved TWICE ON THE RAW PAIR satisfies "four fields present", "ok is
// the conjunction" and every reference check over ordinary bodies. It cannot
// produce markupRaw true WITH markupClean false, because on the raw pair the
// two calls are identical.
//
// The shape is F-4's: an over-threshold CJK wall whose final sentence ends with
// a full stop immediately followed by an Obsidian image embed. D-15 split at the
// `。`, the `!` was stranded at the end of one block and the `[[…]]` orphaned
// into the next. Raw: both `[[` and `]]` still sit in one block, so the pair
// count holds. Clean: `cleanVaultMarkup` leaves `![[…]]` literal (its `[^!]`
// guard) but turns the orphaned `[[…]]` into an anchor, so the pair is GONE
// from what `marked` actually receives — and that is the seam the reader lives
// at.
//
// 26.88-17: THE SHIPPED TRANSFORM NO LONGER PRODUCES THIS SHAPE, and that is
// F-4 closed at its cause. Until this plan, S5 obtained its "after" text by
// running `structureBody` and relying on D-15 to emit the defect — so the day
// the defect was fixed, the case that PROVED THE GUARD CAN SEE IT went red for
// the best possible reason and would have been read as a regression.
//
// The dependency was wrong, not the case. What S5 asserts is a property of
// `bodyGuards` — that its two markup fields are read at TWO SEAMS and not from
// one call twice — and that property must stay checkable whether or not any
// shipped rule still emits a torn image. So the "after" text is now WRITTEN
// DOWN HERE, byte for byte as the transform emitted it at `b7d7661`, and the
// case additionally pins that the transform no longer emits it. Both halves
// are load-bearing: the first keeps the degenerate implementation catchable,
// the second is F-4's own closure stated in the suite that made it visible.

const S5_BODY = repeat('这是一段没有任何标记的中文长句用来堆出一面墙。', 30) +
  '都以另一种方式折射在枯萎凋零的花园里。![[Aloma - 少女情怀总是诗_1_.jpg]]\n';

// The pre-26.88-17 output, verbatim: one break landed between the `。` and the
// `!`, stranding it. This is a RECORDED artefact, not a re-derivation — no rule
// here computes it.
const S5_TORN = repeat('这是一段没有任何标记的中文长句用来堆出一面墙。', 29) +
  '这是一段没有任何标记的中文长句用来堆出一面墙。\n\n' +
  '都以另一种方式折射在枯萎凋零的花园里。!\n\n' +
  '[[Aloma - 少女情怀总是诗_1_.jpg]]';

testCase('S5 the F-4 shape: markupRaw TRUE and markupClean FALSE on one call',
  () => {
    const shipped = CORE.structureBody(S5_BODY, []);
    // 26.88-17 (F-4, closed at its cause): the shipped rule REFUSES the break
    // in front of an image token now, so the wall splits everywhere else and
    // the embed arrives whole.
    assert.notStrictEqual(shipped.text, S5_BODY,
      'S5 the wall must still FIRE — if the transform leaves it alone the ' +
      'threshold or the wall moved and this case measures nothing');
    assert.strictEqual(/。!\s*\n/.test(shipped.text), false,
      'S5 the shipped transform no longer strands the `!` from its `[[` — ' +
      'that is F-4 closed at its cause (CORE.splitsImageToken, D-15\'s third ' +
      'refusal)');
    assert.strictEqual(CORE.bodyGuards(S5_BODY, shipped.text,
      shipped.addedHeadings).ok, true,
      'S5 ...and so the app LAYS THIS NOTE OUT instead of declining it');

    // The recorded torn output. `out` below is that artefact, so the guard is
    // asked the same question S5 has always asked it.
    const out = { text: S5_TORN, addedHeadings: [] };
    assert.ok(/。!\s*\n/.test(out.text),
      'S5 the recorded artefact must still carry the strand — without it ' +
      'this case is a wall with a picture at the end');
    assert.strictEqual(CORE.wordsPreserved(S5_BODY, out.text, []), true,
      'S5 sanity: the artefact is the same words in the same order, so the ' +
      'divergence below is about MARKUP and nothing else');

    const g = CORE.bodyGuards(S5_BODY, out.text, out.addedHeadings);
    // BECAUSE F-4: over the 90-note firing set the RAW seam trips 0 and the
    // CLEAN seam trips 14. A probe measuring the raw seam reported "no residual
    // trips" while the app declined to lay out 14 notes, and 26.88-COVERAGE.md
    // published 90 where the app lays out 76.
    assert.strictEqual(g.markupRaw, true,
      'S5 the RAW seam does not see this class — if it does, the fixture is ' +
      'not the F-4 shape');
    assert.strictEqual(g.markupClean, false,
      'S5 the CLEAN seam MUST trip. markupClean reading true means the two ' +
      'markup fields are the same call twice, which is the degenerate ' +
      'implementation this case exists to catch');
    assert.strictEqual(g.ok, false,
      'S5 a clean-seam trip means the note is shown as saved');
  });

// ---- S6: an independently composed reference ---------------------------------

testCase('S6 the four fields match the four shipped predicates, composed here',
  () => {
    const clean = CORE.cleanVaultMarkup;
    const bodies = GUARD_BODIES.concat([['F-4 shape', S5_BODY]]);
    for (const [label, body] of bodies) {
      const out = CORE.structureBody(body, []);
      const g = CORE.bodyGuards(body, out.text, out.addedHeadings);
      // The reference: the four predicates called SEPARATELY, exactly as
      // renderSavedBody composed them at 2e7f7d2.
      const ref = {
        words: CORE.wordsPreserved(body, out.text, out.addedHeadings),
        markupRaw: CORE.markupPreserved(body, out.text),
        markupClean: CORE.markupPreserved(clean(body), clean(out.text)),
        headingsBound: CORE.headingsBound(clean(out.text))
      };
      for (const f of Object.keys(ref)) {
        // BECAUSE this plan is a MOVE and a move that changes an answer is not
        // a move. A disagreement on a single field is the finding, not the
        // number.
        assert.strictEqual(g[f], ref[f],
          'S6 [' + label + '] ' + f + ': the shared verdict says ' + g[f] +
          ' and the composition it replaced says ' + ref[f]);
      }
    }
  });

// ---- S7: all four computed, never short-circuited ----------------------------

testCase('S7 all four are computed even when the first is false', () => {
  const src = 'alpha beta gamma\n';
  // Two outputs that BOTH fail `words` and DIFFER on `headingsBound`. A
  // short-circuiting implementation returns the same headingsBound for both
  // (whatever its default is) and this case goes red.
  const boundOk = 'delta epsilon\n\n## a real heading\n\nzeta\n';
  const boundBad = 'delta epsilon\n\n## \n\nzeta\n';

  const a = CORE.bodyGuards(src, boundOk, []);
  const b = CORE.bodyGuards(src, boundBad, []);

  assert.strictEqual(a.words, false, 'S7 (a) words must be false to set up');
  assert.strictEqual(b.words, false, 'S7 (b) words must be false to set up');
  // BECAUSE SRM-01 / SRM-02 [ordering]: a note that trips two guards is
  // attributed to BOTH, not to whichever ran first. That is what makes the
  // probe's four printed counts independent of each other — under a
  // short-circuit every count after the first would silently become "and
  // nothing earlier tripped".
  assert.strictEqual(a.headingsBound, true,
    'S7 headingsBound was not computed after words failed');
  assert.strictEqual(b.headingsBound, false,
    'S7 headingsBound did not see the empty heading after words failed');
  assert.notStrictEqual(a.headingsBound, b.headingsBound,
    'S7 the two cases must DIFFER, or this case is satisfied by a constant');
});

// ---- S8: the picker is stable ------------------------------------------------

testCase('S8 the picker returns the same list on two consecutive runs', () => {
  function note(id, signals, handsOff, safe) {
    return { id: id, title: id, signals: signals, handsOff: handsOff,
      safe: safe, free: 100, paragraph: 100, freeLine: 100 };
  }
  const firing = [
    note('aaaa', ['colon'], [], true),
    note('bbbb', ['marker-run'], ['quote'], true),
    note('cccc', ['colon', 'marker-run'], [], false),
    note('dddd', ['marker-run'], [], true),
    note('eeee', ['colon'], ['fence'], true)
  ];
  const first = PICKER.choosePicks(firing, 2).map((p) => p.note.id);
  const second = PICKER.choosePicks(firing, 2).map((p) => p.note.id);
  // BECAUSE SRM-03 [ordering]: the UAT corpus is chosen by this function. A
  // picker that reorders between runs means the corpus the owner is shown is
  // not the corpus the plan recorded, and the picker's stability is asserted
  // rather than assumed for exactly that reason.
  assert.deepStrictEqual(first, second,
    'S8 two constructions from the same input disagreed: ' +
    first.join(',') + ' vs ' + second.join(','));
  assert.ok(first.length > 0, 'S8 an empty pick list is stable and useless');
});

// ---- S9: one module surface --------------------------------------------------

testCase('S9 the split and the verdict are on the object core.js exports',
  () => {
    const exported = require(path.join(ROOT, 'core.js'));
    for (const name of ['FM_RE', 'splitFrontmatter', 'bodyGuards']) {
      // BECAUSE F-5: the whole point of the move is that a NODE caller (the
      // probe, the picker, this suite) and a BROWSER caller (app.js) see the
      // same surface. An export that exists only on `window.StudyCore` leaves
      // every instrument back where it started.
      assert.ok(Object.prototype.hasOwnProperty.call(exported, name),
        'S9 core.js does not export ' + name + ' on module.exports');
    }
    assert.strictEqual(typeof exported.splitFrontmatter, 'function',
      'S9 splitFrontmatter is a function');
    assert.strictEqual(typeof exported.bodyGuards, 'function',
      'S9 bodyGuards is a function');
    assert.ok(exported.FM_RE instanceof RegExp, 'S9 FM_RE is a RegExp');
    const globalCore = (typeof globalThis !== 'undefined' && globalThis.StudyCore)
      || null;
    if (globalCore) {
      assert.strictEqual(globalCore.splitFrontmatter,
        exported.splitFrontmatter,
        'S9 the global surface and module.exports are the SAME function');
      assert.strictEqual(globalCore.bodyGuards, exported.bodyGuards,
        'S9 the global verdict and module.exports are the SAME function');
    }
  });

// ---- S10: THE NEUTRALITY CASE, PER NOTE --------------------------------------
//
// AGGREGATES HIDE COMPENSATING CHANGES, and this phase has been bitten by an
// aggregate twice. The probe's figures re-printing identically says the totals
// did not move; it does not say no note moved. So this case runs the whole
// eligible pool and compares, on EVERY FIELD OF EVERY NOTE, the shared verdict
// against the four shipped predicates composed separately here — exactly as
// `renderSavedBody` composed them at 2e7f7d2, before the move. A disagreement
// on a single note is a blocking finding, named by note id.
//
// It also asserts the transform's output string against a reference computed
// in the SAME run, so a transform that had become non-deterministic could not
// hide behind two guard compositions that agreed with each other.
//
// READ-ONLY, and that is a hard requirement rather than a courtesy (threat
// T-26.88-41). `readFileSync` is its only path to disk. It holds no descriptor,
// changes no item state, blesses nothing, and touches not one byte under the
// live library — the owner's real, irreplaceable personal archive. The same
// construction `tests/test_uat_instrument.cjs` asserts over the two instruments
// under T-26.88-03, and I9's roster is extended to cover this file too.
//
// IT SKIPS WITH A PRINTED REASON when the library is absent, so the suite stays
// runnable on a machine that has no `~/StudyRoom`, and it MIRRORS the
// skip-with-reason shape rather than inventing a second one.

// The library pointer. NOT a shipped rule — a path lookup — but it is the third
// copy in this repository (tools/pick_uat_notes.cjs and tools/replan_probe.cjs
// carry the other two, deliberately identical so the instruments can never
// disagree about which library they measured). Kept in that shape for the same
// reason.
function s10LibraryRoot() {
  try {
    const doc = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'library.local.json'), 'utf8'));
    if (doc && typeof doc.library_root === 'string' && doc.library_root) {
      return doc.library_root;
    }
  } catch (e) { /* fall through to the conventional location */ }
  return path.join(os.homedir(), 'StudyRoom');
}

// The floor, and the reason it is not zero. A neutrality case that ran over 3
// notes and reported 0 disagreements is the DEGENERATE implementation of this
// gate: a zero equally consistent with "identical" and "never ran".
// ⚠ 384 WAS THE POOL'S EXACT SIZE ON THE DAY IT WAS WRITTEN, which made it a
// floor no change could survive. It fell to 362 on 2026-08-14 — not a
// collapse: the first import after the identity wire re-read 2,183 notes from
// her vault instead of from outdated copies, and 22 of them turned out to be
// PERSONAL notes the room had been holding a stale snapshot of. They left this
// pool by becoming better protected, which is the opposite of the failure this
// floor watches for. Re-set with headroom, and if it drifts again check WHICH
// bucket grew before moving it: `personal` growing is the room learning; a
// pool that fell with nothing else rising is the degenerate case.
const S10_MIN_NOTES = 330;
const S10_MAX_NOTES = 420;

testCase('S10 the move is neutral on every field of every note in the pool',
  () => {
    const lib = s10LibraryRoot();
    const storePath = path.join(lib, 'items.json');
    if (!fs.existsSync(storePath)) {
      process.stdout.write('  S10 SKIPPED — no item store at ' + storePath +
        '. The neutrality proof needs the live library and never invents a ' +
        'fixture corpus; a fixture pool would make this a claim about ' +
        'fixtures.\n');
      return;
    }
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.ok(store && store.items, 'S10 the item store carries no items');
    const items = Array.isArray(store.items)
      ? store.items
      : Object.keys(store.items).sort().map((k) => store.items[k]);

    const clean = CORE.cleanVaultMarkup;
    const disagreements = [];
    let covered = 0;

    for (const it of items) {
      if (!it || it.type !== 'text' || !it.library_path) { continue; }
      let raw;
      try {
        raw = fs.readFileSync(path.join(lib, it.library_path), 'utf8');
      } catch (e) { continue; }
      const p = CORE.splitFrontmatter(raw);
      // The eligibility ladder renderSavedBody itself applies, in its order.
      if (CORE.isPersonalNote(it, p.fm)) { continue; }
      if (CORE.hasAuthorHeading(p.body)) { continue; }
      covered++;

      const out = CORE.structureBody(p.body, []);
      const reference = CORE.structureBody(p.body, []);
      if (out.text !== reference.text) {
        disagreements.push(it.id + ' the transform is not deterministic');
        continue;
      }

      const g = CORE.bodyGuards(p.body, out.text, out.addedHeadings);
      // The composition renderSavedBody carried at 2e7f7d2, spelled out here
      // rather than called, because a reference that called the thing under
      // test would be the degenerate form of this gate.
      const ref = {
        words: CORE.wordsPreserved(p.body, out.text, out.addedHeadings),
        markupRaw: CORE.markupPreserved(p.body, out.text),
        markupClean: CORE.markupPreserved(clean(p.body), clean(out.text)),
        headingsBound: CORE.headingsBound(clean(out.text))
      };
      for (const f of Object.keys(ref)) {
        if (g[f] !== ref[f]) {
          disagreements.push(it.id + ' ' + f + ': verdict ' + g[f] +
            ', pre-move composition ' + ref[f] + '  (' + it.title + ')');
        }
      }
      const conj = ref.words && ref.markupRaw && ref.markupClean &&
        ref.headingsBound;
      if (g.ok !== conj) {
        disagreements.push(it.id + ' ok: verdict ' + g.ok + ', conjunction ' +
          conj + '  (' + it.title + ')');
      }
    }

    process.stdout.write('  S10 covered ' + covered + ' notes of the ' +
      'eligible pool (floor ' + S10_MIN_NOTES + ')\n');
    // BECAUSE a zero from a scan that never ran is indistinguishable from a
    // zero from a scan that found nothing.
    assert.ok(covered >= S10_MIN_NOTES,
      'S10 covered only ' + covered + ' notes, below the floor of ' +
      S10_MIN_NOTES + ' — the pool collapsed and its zero means nothing');
    assert.ok(covered <= S10_MAX_NOTES,
      'S10 covered ' + covered + ' notes, above ' + S10_MAX_NOTES +
      ' — the pool grew past its band and the eligibility ladder should be ' +
      're-read before this zero is trusted');
    // BECAUSE law 4 and BECAUSE this plan changes no rule: the two
    // compositions are the same four predicates in the same order over the
    // same inputs. A difference means the move was not a move.
    assert.deepStrictEqual(disagreements, [],
      'S10 found ' + disagreements.length + ' per-note disagreement(s) — the ' +
      'refactor changed behaviour:\n    ' + disagreements.join('\n    '));
  });

// ---- report -----------------------------------------------------------------

for (const name of passed) { process.stdout.write('  pass  ' + name + '\n'); }
if (failures.length) {
  process.stdout.write('\n');
  for (const f of failures) {
    process.stdout.write('  FAIL  ' + f.name + '\n        ' + f.reason + '\n');
  }
  process.stdout.write('\n' + failures.length + ' of ' +
    (passed.length + failures.length) + ' cases FAILED\n');
  process.exit(1);
}
process.stdout.write('OK  ' + passed.length +
  ' seam cases — one split, one four-guard verdict, and the F-4 shape ' +
  'visible to a node suite\n');
process.exit(0);
