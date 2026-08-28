/*
 * tests/test_uat_instrument.cjs — the measuring instrument, pinned
 * (Phase 26.88, Plan 09, Task 3).
 *
 * What it pins:
 *   I1      the D-21 DEFECT, stated as a test: on a body that is one long
 *           transcription quote run, `longestFreeProseBlock` and
 *           `longestParagraph` must DISAGREE. The two measures agreeing on
 *           that shape is precisely how a whole UAT corpus came to be chosen
 *           by a number that measured nothing a rule could change.
 *   I2-I4   each of the remaining hands-off shapes contributes ZERO to the
 *           free-prose measure: a fenced block, a table, a run of image lines.
 *   I5      a genuine free-prose wall of N characters measures N — the
 *           measure does not under-report the thing it exists to find. (I1-I4
 *           alone would pass with a measure that always returned 0.)
 *   I6      a wall followed by a quote measures the WALL, not the quote and
 *           not their sum — blanking a zone must not weld two blocks together.
 *   I7      RULE 4 ITSELF: `analyse` orders by free-prose block descending
 *           with an id ascending tiebreak, demonstrated on a hand-built corpus
 *           where the paragraph order and the free-prose order DISAGREE. A
 *           picker that still sorted on `paragraph` returns the other order.
 *   I8      the measure and the zone reporter agree on what a zone IS: for
 *           each of the four shapes, a body carrying only that shape measures
 *           zero free prose AND is reported under that zone's name.
 *   I9      the READ-ONLY assertion over BOTH tools' source text, and the one
 *           place the write-capable roster lives after plan 09.
 *
 * FIXTURES ARE INLINE. Nothing here reads the live library, the item store, or
 * any note on disk — every fixture is a JavaScript string literal in this
 * file, and I7 serves its four fixture bodies through a temporarily swapped
 * `fs.readFileSync` so the real sort can be exercised without a single byte
 * being read from `~/StudyRoom`. That is exactly why plan 09 task 1 added the
 * `require.main === module` guard to the picker: requiring the instrument must
 * not run its live sweep. The suite is hermetic and cannot drift out from
 * under itself. Every path is resolved through the CommonJS module resolver
 * relative to this file, so the runner's cwd never matters.
 *
 * Stdlib only (assert / fs / path) plus ../tools/pick_uat_notes.cjs and
 * ../core.js — the zero-dependency law. No package manager, no test
 * framework, no new vendored byte.
 *
 * Every assertion carries a BECAUSE clause naming the decision it protects
 * (the tests/test_cleaning_writer.py convention).
 *
 * Run contract: every case name is printed as it passes, then ONE OK line,
 * exit 0. On failure every violation is listed with its case name and a
 * reason, then exit 1.
 *
 * HONESTY LABEL: this suite proves the INSTRUMENT measures the right thing.
 * It says nothing whatsoever about whether any note is easier to read. A green
 * run means the numbers the phase quotes are numbers about text a rule may
 * actually change — not that changing it helped. Only the owner's blocking
 * verdict (SC-7) is evidence for that.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PICKER_PATH = require.resolve('../tools/pick_uat_notes.cjs');
const PROBE_PATH = require.resolve('../tools/replan_probe.cjs');
const P = require(PICKER_PATH);

const ROOT = path.join(__dirname, '..');
assert.ok(fs.existsSync(path.join(ROOT, 'core.js')),
  'core.js resolves from __dirname — the suite is cwd-independent');

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

// ---- fixture builders -------------------------------------------------------

function repeat(s, n) { return new Array(n + 1).join(s); }

// A transcription quote run of the shape clippings-processor writes into every
// image-bearing clipping in this vault. NO blank lines inside it, so
// longestParagraph reads the whole run as one enormous "paragraph".
function quoteRun(lines, perLine) {
  const out = ['> **图片转录：**'];
  for (let i = 0; i < lines; i++) { out.push('> ' + repeat('文', perLine)); }
  return out.join('\n');
}

// ---- I1: the defect, stated as a test ---------------------------------------

testCase('I1 a transcription quote run makes the two measures DISAGREE', () => {
  const free = '材料：毛线一团';
  const body = quoteRun(40, 60) + '\n\n' + free + '\n';

  const para = P.longestParagraph(body);
  const prose = P.longestFreeProseBlock(body);

  // BECAUSE D-21: rule 4 sorted on longestParagraph, which counts quote runs,
  // fenced blocks, tables and image lines — text NO rule is permitted to
  // touch. NINE OF THE ELEVEN notes the picker selected for the 26.88 UAT
  // were `> **图片转录：**` transcription blocks whose free-prose wall is
  // 24-102 characters. That defect produced F-2's headline finding —
  // "every wall survives at its exact original character count" — which on
  // those notes is the transform CORRECTLY obeying D-07.2 on a hands-off
  // span. There was no wall to break. If these two measures ever agree on
  // this shape again, the instrument is back to selecting a UAT corpus by a
  // number that measures nothing a rule can change.
  assert.ok(para > 2000,
    'the quote run reads as a huge paragraph (got ' + para + ')');
  assert.strictEqual(prose, free.length,
    'the free-prose measure sees ONLY the free prose (got ' + prose + ', ' +
    'expected ' + free.length + ')');
  assert.ok(prose * 10 < para,
    'the two measures must DISAGREE by an order of magnitude on this shape ' +
    '— they returned ' + prose + ' and ' + para);
});

// ---- I2-I4: the remaining hands-off shapes contribute zero ------------------

testCase('I2 a 2,000-char fenced block contributes zero', () => {
  const fence = repeat('`', 3);
  const free = '做法：先烧水';
  const body = fence + 'js\n' + repeat('x', 2000) + '\n' + fence + '\n\n' +
    free + '\n';

  // BECAUSE D-07.1 makes a fenced block hands-off: the transform copies it
  // byte-identically, so counting it as a wall the reformatter "failed to
  // break" measures the spec, not a defect.
  assert.ok(P.longestParagraph(body) > 2000,
    'the fence reads as a huge paragraph');
  assert.strictEqual(P.longestFreeProseBlock(body), free.length,
    'the fenced block contributes zero to the free-prose measure');
});

testCase('I3 a markdown table contributes zero', () => {
  const rows = ['| 名称 | 用量 |', '| --- | --- |'];
  for (let i = 0; i < 30; i++) {
    rows.push('| ' + repeat('材', 40) + ' | ' + repeat('量', 40) + ' |');
  }
  const free = '尺寸：40 厘米';
  const body = rows.join('\n') + '\n\n' + free + '\n';

  // BECAUSE D-07.3 makes a table hands-off — a table is already structure,
  // and its cell text is not prose a reader pushes through.
  assert.ok(P.longestParagraph(body) > 2000, 'the table reads as a huge block');
  assert.strictEqual(P.longestFreeProseBlock(body), free.length,
    'the table contributes zero to the free-prose measure');
});

testCase('I4 a run of image lines contributes zero', () => {
  const imgs = [];
  for (let i = 0; i < 12; i++) {
    imgs.push('![' + repeat('图', 80) + '](attachments/' + i + '.jpg)');
  }
  const free = '小贴士：钩针要松';
  const body = imgs.join('\n') + '\n\n' + free + '\n';

  // BECAUSE D-07.4 makes an image/attachment line hands-off. An attachment
  // reference is a pointer, not prose; its character count is an artefact of
  // the filename.
  assert.ok(P.longestParagraph(body) > 1000,
    'the image run reads as a large block');
  assert.strictEqual(P.longestFreeProseBlock(body), free.length,
    'the image run contributes zero to the free-prose measure');
});

// ---- I5: the measure does not under-report ----------------------------------

testCase('I5 a genuine free-prose wall of N characters measures N', () => {
  const wall = repeat('这是一段真正的散文墙', 90);   // 900 characters
  assert.strictEqual(wall.length, 900, 'the fixture wall is exactly 900 chars');
  const body = wall + '\n';

  // BECAUSE I1-I4 would ALL pass with a measure that always returned zero,
  // and a measure that always returns zero would order the UAT corpus by the
  // id tiebreak alone. This case is what makes the other four load-bearing:
  // the measure has to FIND the wall it exists to find.
  assert.strictEqual(P.longestFreeProseBlock(body), 900,
    'the wall measures its own length');
  assert.strictEqual(P.longestParagraph(body), 900,
    'on a body with no hands-off span the two measures agree — the D-21 fix ' +
    'is not "always report less", it is "report what a rule may change"');
});

// ---- I6: blanking a zone must not weld two blocks together ------------------

testCase('I6 a wall followed by a quote measures the wall, not the sum', () => {
  const wall = repeat('墙', 500);
  const quote = quoteRun(20, 60);
  // NO blank line between them: to longestParagraph this is a single block.
  const body = wall + '\n' + quote + '\n';

  const para = P.longestParagraph(body);
  const prose = P.longestFreeProseBlock(body);

  // BECAUSE the zone characters are replaced with NEWLINES rather than
  // deleted. Deleting them would join the free prose either side of a removed
  // span into one block and report a wall that does not exist — the same
  // class of error as D-21 itself, arriving from the opposite direction.
  assert.strictEqual(prose, 500, 'the wall measures 500 (got ' + prose + ')');
  assert.ok(para > prose + 1000,
    'longestParagraph welds the wall and the quote into one block (' + para +
    '), which is exactly what the free-prose measure must not do');
});

testCase('I6b a zone BETWEEN two walls does not weld them together', () => {
  const a = repeat('甲', 300);
  const b = repeat('乙', 400);
  const body = a + '\n' + quoteRun(10, 50) + '\n' + b + '\n';

  // BECAUSE this is the shape that would silently manufacture a 700-char
  // wall out of two smaller ones. The measure must report the LARGER of the
  // two, never their sum.
  assert.strictEqual(P.longestFreeProseBlock(body), 400,
    'the larger of the two walls, never 700');
});

// ---- I7: rule 4 itself, on a corpus where the two orders disagree -----------

testCase('I7 rule 4 orders by free-prose descending, id ascending on a tie',
  () => {
    // Four hand-built notes. Under the OLD paragraph sort the quote-heavy
    // note leads; under rule 4 as corrected it comes LAST. Every fixture
    // carries a colon label so core.js fires on it — a note that does not
    // fire never reaches the ordering at all.
    //
    // Every fixture also carries a frontmatter block naming a CLIPPED source,
    // and since 26.88-10 (D-19) that is load-bearing rather than decorative:
    // a note with no frontmatter block at all is HER OWN WRITING and is never
    // laid out, so it never enters the eligible pool and never reaches rule 4.
    // These four are clipped notes, which is what this case is about; saying
    // so in the fixture is what makes them eligible for the RIGHT reason. The
    // length-4 assertion below is the guard that caught this when D-19 landed.
    const FM = '---\nsource: xiaohongshu\n---\n';
    const label = '材料：毛线\n';
    const bodies = {
      'items/a1.md': FM + label + '\n' + quoteRun(30, 60) + '\n',
      'items/b2.md': FM + label + '\n' + repeat('墙', 600) + '\n',
      'items/c3.md': FM + label + '\n' + repeat('丙', 300) + '\n',
      'items/d4.md': FM + label + '\n' + repeat('丁', 300) + '\n'
    };
    const store = {
      meta: { filters: [] },
      items: [
        { id: 'a1', type: 'text', library_path: 'items/a1.md',
          title: 'quote-heavy', folder: 'fixtures' },
        { id: 'b2', type: 'text', library_path: 'items/b2.md',
          title: 'real wall', folder: 'fixtures' },
        // d4 is offered to analyse BEFORE c3, so a stable sort that did
        // nothing would leave d4 ahead of c3 and the tiebreak assertion
        // below would catch it.
        { id: 'd4', type: 'text', library_path: 'items/d4.md',
          title: 'tie two', folder: 'fixtures' },
        { id: 'c3', type: 'text', library_path: 'items/c3.md',
          title: 'tie one', folder: 'fixtures' }
      ]
    };

    // Serve the inline fixtures in place of the live library. Nothing is
    // read from disk and nothing is created on it.
    const realRead = fs.readFileSync;
    let result;
    try {
      fs.readFileSync = function (p, enc) {
        const key = String(p).split(path.sep).slice(-2).join('/');
        if (Object.prototype.hasOwnProperty.call(bodies, key)) {
          return bodies[key];
        }
        return realRead.apply(fs, arguments);
      };
      result = P.analyse(store, '/nonexistent-fixture-root');
    } finally {
      fs.readFileSync = realRead;
    }

    const order = result.firing.map((n) => n.id);
    assert.strictEqual(result.firing.length, 4,
      'all four fixtures are eligible and fire (got ' +
      result.firing.length + ': ' + order.join(', ') + ')');

    // BECAUSE D-21: rule 4 must sort on the number a rule may actually
    // change. Under the shipped-before-plan-09 sort the quote-heavy note a1
    // led this corpus by paragraph count and would have been handed to the
    // owner as the densest wall in the library. It has no wall.
    assert.deepStrictEqual(order, ['b2', 'c3', 'd4', 'a1'],
      'free-prose descending, id ascending on the tie (got ' +
      order.join(', ') + ')');

    const byParagraph = result.firing.slice()
      .sort((x, y) => y.paragraph - x.paragraph).map((n) => n.id);
    assert.notDeepStrictEqual(order, byParagraph,
      'the fixture corpus is only meaningful if the two orders DISAGREE — ' +
      'paragraph order is ' + byParagraph.join(', '));

    // BECAUSE rule 5 appends top-ups but never reorders rule 4's result:
    // the owner is handed the notes in the order the rule produced.
    const picks = P.choosePicks(result.firing, 4).map((p) => p.note.id);
    assert.deepStrictEqual(picks, ['b2', 'c3', 'd4', 'a1'],
      'choosePicks preserves rule 4 order (got ' + picks.join(', ') + ')');
  });

// ---- I8: the measure and the zone reporter agree on what a zone IS ----------

testCase('I8 all four zone shapes measure zero free prose and are named',
  () => {
    const fence = repeat('`', 3);
    const shapes = [
      ['code', fence + 'js\n' + repeat('x', 400) + '\n' + fence + '\n'],
      ['quote', quoteRun(8, 50) + '\n'],
      ['image', '![' + repeat('图', 60) + '](attachments/a.jpg)\n'],
      ['table', ['| 甲 | 乙 |', '| --- | --- |',
        '| ' + repeat('丙', 60) + ' | ' + repeat('丁', 60) + ' |'].join('\n') + '\n']
    ];

    for (const [name, body] of shapes) {
      // BECAUSE `longestFreeProseBlock` calls CORE.handsOffSpans rather than
      // re-deriving the zone shapes (T-26.88-26). If the measure and the
      // reporter ever disagree about what a zone is, the picker prints one
      // note's zone list beside another note's wall figure — which is the
      // one-rule-two-callers drift F-1 was, arriving in the instrument.
      assert.strictEqual(P.longestFreeProseBlock(body), 0,
        'a body that is only a ' + name + ' zone has zero free prose (got ' +
        P.longestFreeProseBlock(body) + ')');
      assert.deepStrictEqual(P.handsOffZones(body), [name],
        'the zone reporter names it "' + name + '" (got ' +
        JSON.stringify(P.handsOffZones(body)) + ')');
      assert.ok(P.longestParagraph(body) > 50,
        'and longestParagraph would have counted it (' +
        P.longestParagraph(body) + ') — which is the whole point');
    }
  });

// ---- I9: the read-only assertion, and the roster's one home -----------------

// THE WRITE-CAPABLE ROSTER. Both `tools/pick_uat_notes.cjs` and
// `tools/replan_probe.cjs` read the owner's real personal archive, and
// READ-ONLY is a hard requirement rather than a courtesy (T-26.88-03). Plan 08
// performed this check by hand; from plan 09 onward it is mechanised here, and
// THIS IS THE ONE PLACE THE ROSTER LIVES. Every later plan that needs it reads
// this constant.
//
// Two things about its shape are deliberate:
//
//   * THE LEADING DOT ON '.rm(' AND '.cp(' IS LOAD-BEARING. The plan-08 form
//     carried a bare `rm(`, which is a substring of `confirm(`, `form(`,
//     `perform(` and `norm(`. That fails SAFE — it cannot let a write through
//     — but it CAN red a correct file, and a red on a correct file is how a
//     roster gets quietly shortened. The anchored form cannot match those.
//   * 'openSync' IS FORBIDDEN OUTRIGHT rather than flag-inspected. A read-only
//     tool has no reason to hold a descriptor at all: `readFileSync` is its
//     only path to disk. "No descriptor" is a simpler and STRICTER rule than
//     "no descriptor opened for writing", and it needs no argument parsing to
//     enforce.
//
// ADD ME DELIBERATELY: widening this roster is a deliberate act, on the
// core.js roster discipline. Add the token, re-run, and read every new red
// before changing anything else — a red here is either a genuine write path
// (stop) or a COMMENT that spells a roster word (rewrite the comment; the
// check reads the whole file including its comments, by design, so a tool
// cannot document a capability it then claims not to have). NEVER shorten the
// roster to get to green.
const WRITE_CAPABLE_TOKENS = ['writeFile', 'writeSync', 'writev', 'appendFile',
  'mkdir', 'mkdtemp', 'rmdir', 'unlink', 'rename', 'copyFile',
  'createWriteStream', 'truncate', 'chmod', 'chown', 'utimes', 'symlink',
  'openSync', '.rm(', '.cp('];

// 26.88-16 (T-26.88-41): tests/test_seam_exports.cjs S10 joins the roster.
// It is a SUITE rather than an instrument, but it reads the same live library
// the two instruments do — the owner's real, irreplaceable personal archive —
// so it is bound by the same read-only contract, and binding it by hand once
// is how a contract quietly stops applying.
const SEAM_SUITE_PATH = require.resolve('./test_seam_exports.cjs');

testCase('I9 neither instrument carries a write-capable filesystem token',
  () => {
    for (const file of [PICKER_PATH, PROBE_PATH, SEAM_SUITE_PATH]) {
      const src = fs.readFileSync(file, 'utf8');
      const hit = WRITE_CAPABLE_TOKENS.filter((t) => src.indexOf(t) !== -1);
      // BECAUSE T-26.88-03: both tools read `~/StudyRoom`, the owner's real
      // personal archive. Neither may change an item's state, open anything,
      // bless anything, or touch a byte on disk. This is the mechanised form
      // of the check plan 08 ran by hand over the picker, now covering the
      // probe too and running on every suite sweep.
      assert.deepStrictEqual(hit, [],
        path.basename(file) + ' carries write-capable token(s): ' +
        hit.join(', '));
    }
  });

// ---- I10: the probe CALLS the shipped verdict and declares no guard of its own
//
// 26.88-16 (F-4's instrument half). The probe used to measure ONE of the four
// guards `renderSavedBody` requires, at ONE of the two seams: a bare
// `CORE.markupPreserved(e.body, out)` at the raw seam. Over the 90-note firing
// set the raw seam trips 0 and the CLEAN seam trips 14, so the probe reported
// "no residual trips" while the app silently declined to lay out 14 notes, and
// 26.88-COVERAGE.md published 90 where the app lays out 76.
//
// THE FIX IS NOT FOUR CALLS HERE, and this case is what stops that fix from
// being made. Composing the four predicates inside the probe is a SECOND
// spelling of a ladder app.js already composes — the one-rule-two-callers
// drift F-1 was, and exactly what the deletion contract at the head of
// tools/replan_probe.cjs forbids. It is also the shape a well-meaning future
// edit would take, which is why it is mechanised rather than left to review.
//
// Over COMMENT-STRIPPED source, so the file's own prose (which names all four
// predicates while explaining why it does not call them) can neither satisfy
// this case nor trip it.

function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const GUARD_PREDICATES = ['CORE.wordsPreserved(', 'CORE.markupPreserved(',
  'CORE.headingsBound('];

testCase('I10 the probe calls CORE.bodyGuards and composes no guard itself',
  () => {
    const src = stripComments(fs.readFileSync(PROBE_PATH, 'utf8'));
    // BECAUSE F-4: an instrument that measures a narrower thing than the app
    // does publishes a number for behaviour that does not ship. The probe and
    // renderSavedBody must answer the same question with the same code.
    assert.ok(src.indexOf('CORE.bodyGuards(') !== -1,
      'replan_probe.cjs never calls CORE.bodyGuards( — it is measuring some ' +
      'other ladder than the one renderSavedBody requires');
    // 26.88-20 (F-6b): ONE NAMED EXEMPTION, AND IT IS FENCED THREE WAYS.
    //
    // The hashtag carve-out is NOT the four-guard verdict and `bodyGuards` is
    // the wrong instrument for it: the question is whether ONE transform
    // (`CORE.stripHashtagMarkers`) preserves her words, asked at the RENDER
    // seam, over EVERY text note rather than over the firing set. Running the
    // whole ladder there would answer a different question about a different
    // population and would publish it as if it were this one.
    //
    // So the probe is allowed exactly `CORE.wordsPreserved(`, exactly inside
    // the sentinel-delimited block, exactly once. It may NEVER call
    // `markupPreserved` or `headingsBound` — those two are what would turn the
    // exemption back into a second four-guard ladder, which is the drift this
    // case exists to stop. And the block is LENGTH-CAPPED, so the exemption
    // cannot be widened by moving the closing sentinel down the file.
    const raw = fs.readFileSync(PROBE_PATH, 'utf8');
    const OPEN = '/* --- 26.88-20 F-6b CARVE-OUT GATE: BEGIN NAMED ' +
      'EXEMPTION --- */';
    const CLOSE = '/* --- 26.88-20 F-6b CARVE-OUT GATE: END NAMED ' +
      'EXEMPTION --- */';
    const a0 = raw.indexOf(OPEN);
    const b0 = raw.indexOf(CLOSE);
    assert.ok(a0 !== -1 && b0 > a0,
      'the F-6b exemption sentinels are present and in order — without them ' +
      'the exemption below has no boundary and this case would silently ' +
      'exempt the whole file');
    const exempt = raw.slice(a0, b0 + CLOSE.length);
    assert.ok(exempt.length <= 800,
      'THE EXEMPTION IS LENGTH-CAPPED at 800 characters and is currently ' +
      exempt.length + '. The cap is the block\'s real size plus a small ' +
      'margin, ON PURPOSE: it stops the closing sentinel being walked down ' +
      'the file until the whole probe is exempt — the way a narrow carve-out ' +
      'becomes a wide one without anybody deciding to widen it. A LOOSE CAP ' +
      'IS THE SAME DEFECT AS NO CAP: the first cap written here was 1,400, ' +
      'and the mutation that walks the sentinel past the pool loop lands at ' +
      '1,148 — under it, green, a false hole. Raising this number is a ' +
      'deliberate act and needs a re-read of everything it now covers.');
    const inside = stripComments(exempt);
    const outside = stripComments(raw.slice(0, a0) +
      raw.slice(b0 + CLOSE.length));

    const outsideHit = GUARD_PREDICATES.filter((t) => outside.indexOf(t) !== -1);
    // BECAUSE the deletion contract: this file re-derives ZERO shipped rules.
    // A guard predicate called directly here is a second composition of the
    // four-guard verdict, and the instrument and the app become able to
    // disagree again — which is how 90 got published.
    assert.deepStrictEqual(outsideHit, [],
      'replan_probe.cjs composes guard predicate(s) of its own OUTSIDE the ' +
      'named F-6b exemption: ' + outsideHit.join(', ') + '. The verdict has ' +
      'ONE implementation, CORE.bodyGuards');

    const forbiddenInside = ['CORE.markupPreserved(', 'CORE.headingsBound(']
      .filter((t) => inside.indexOf(t) !== -1);
    assert.deepStrictEqual(forbiddenInside, [],
      'the F-6b exemption calls ' + forbiddenInside.join(', ') + '. It is an ' +
      'exemption for ONE predicate on ONE transform, not a licence to ' +
      'rebuild the four-guard ladder inside a comment fence');
    assert.strictEqual(inside.split('CORE.wordsPreserved(').length - 1, 1,
      'and it calls CORE.wordsPreserved exactly ONCE — a count, not a ' +
      'presence test, so the exemption cannot quietly acquire more callers');

    // The whole-file check the case originally made, kept as the OUTER bound:
    // the union of the two regions is the file, so a predicate that is in
    // neither is impossible and the split above cannot lose one.
    const allHit = GUARD_PREDICATES.filter((t) => src.indexOf(t) !== -1);
    assert.deepStrictEqual(
      allHit.filter((t) => t !== 'CORE.wordsPreserved('), [],
      'and nothing but wordsPreserved is called anywhere in the file: ' +
      allHit.join(', '));
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
  ' instrument cases (I1-I10) — the measure, the order, the four-guard ' +
  'ladder, and the read-only contract\n');
process.exit(0);
