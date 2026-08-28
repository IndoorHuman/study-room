/*
 * tests/test_reformat_fixtures.cjs — the D-04 word-preservation fixture
 * suite for the reading-first reformatter (Phase 26.88, Plan 01, Tasks 1
 * and 3).
 *
 * What it pins:
 *   T1-T11  the spine — the phase's headline worked example, the guard's
 *           four negatives, the D-06 provenance branch, the D-07.4a
 *           author-heading reading, and the D-07 hands-off zones.
 *   E1-E10  the 26.85 encoding family (tests/test_cleaning_writer.py:244-295)
 *           ported CROSS-LANGUAGE: LF, CRLF, no-trailing-newline, UTF-8 BOM,
 *           a multi-KB wall of text, a file with no frontmatter at all, and
 *           a CJK body — each run through the transform TWICE, once
 *           asserting the positive and once asserting that a deliberate
 *           mutation of the output makes the guard go RED. A suite of only
 *           positives would pass with a do-nothing transform; a suite of
 *           only negatives would pass with a trip-on-everything guard.
 *           Plus the third-script case and the empty / frontmatter-only
 *           cases.
 *   H0-H9   (plan 06) D-01's SECOND heading provenance — the heading the
 *           librarian NAMED, which reaches the reader by being LOCATED and
 *           never by being trusted. The full worked example against the
 *           UI-SPEC AFTER block; the roster and anchor band mirrored against
 *           study_lib.py at run time; anchor-absent, stale-anchor,
 *           hands-off-zone, duplicate-anchor, two-heading, and eleven
 *           unusable-record refusals; and the undeclared-heading
 *           counter-test that makes the whole promise checkable.
 *
 * FIXTURES ARE INLINE. Nothing here reads the live library, the vault, or
 * any holdout at run time — every fixture is a JavaScript string literal in
 * this file, so the suite is hermetic and cannot drift out from under
 * itself. Every path is resolved through the CommonJS module resolver
 * relative to this file, so the runner's cwd never matters.
 *
 * Stdlib only (assert / fs / path) plus ../core.js — the zero-dependency
 * law. No package manager, no test framework, no new vendored byte.
 *
 * Every assertion carries a BECAUSE clause naming the decision it protects
 * (the tests/test_cleaning_writer.py convention).
 *
 * Run contract: every case name is printed as it passes, then ONE OK line,
 * exit 0. On failure every violation is listed with its case name and a
 * reason, then exit 1. (The per-case lines are deliberate: the plan's
 * acceptance criterion counts the cases this suite names.)
 *
 * HONESTY LABEL: word-preservation is machine-checkable and this suite
 * checks it. Whether the reformatted note is actually EASIER TO READ is not
 * covered here by anything. A green run does not mean the phase worked —
 * only the owner's blocking verdict (SC-7, plan 08) is evidence for that.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const C = require('../core.js');

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

// ---- helpers ---------------------------------------------------------------

// U+FEFF, written through fromCharCode so it is visible in review.
const BOM = String.fromCharCode(0xFEFF);
assert.strictEqual(BOM.length, 1, 'the BOM fixture is exactly one codepoint');

// The bytes strictly BELOW the frontmatter block — the .cjs mirror of
// tests/test_cleaning_writer.py::_body_after_frontmatter, BOM-aware on its
// own. The shipped app.js FM_RE is NOT BOM-tolerant; that is a PRE-EXISTING
// gap (invisible today because zero live notes carry a BOM) and this phase
// deliberately does not "fix" it — doing so would change display for a whole
// class of notes and is out of scope (RESEARCH Pitfall 9).
function bodyAfterFrontmatter(raw) {
  const data = raw.indexOf(BOM) === 0 ? raw.slice(BOM.length) : raw;
  if (data.indexOf('---') === 0) {
    const end = data.indexOf('\n---', 3);
    if (end !== -1) {
      const nl = data.indexOf('\n', end + 1);
      return nl !== -1 ? data.slice(nl + 1) : '';
    }
  }
  return data;
}

// Remove the FIRST word character — a letter, a digit, or a CJK ideograph —
// so the mutation is always a real WORD change and never a scaffolding
// change. This is what makes each encoding shape's counter-assertion honest:
// the guard has to notice a lost word, not a lost dash.
const WORD_CHAR_RE = new RegExp('[0-9A-Za-z\\u4E00-\\u9FFF\\u0400-\\u04FF]', 'g');

// A digit inside a line-leading ordinal marker is NOT a word: D-03 treats the
// ordinal as scaffolding and the normalizer drops it on BOTH sides, so
// deleting it is a no-op the guard is designed not to see. Skipping those
// positions is what keeps this helper's contract true — without it, S1's
// counter-assertion deletes the `1` of "1. 先烧水" and then asks the guard to
// notice a change that by design is not one, which reads as guard blindness
// and is not. (Consequence worth stating plainly: renumbering an ordered list
// IS invisible to the guard. That is exactly why plan 03 never renumbers —
// every item keeps the marker the author typed.)
const ORDINAL_MARKER_RE = /(^|\n)[ \t]*\d{1,3}[.)](?=[ \t])/g;

function dropAWord(text) {
  const skip = [];
  let om;
  ORDINAL_MARKER_RE.lastIndex = 0;
  while ((om = ORDINAL_MARKER_RE.exec(text)) !== null) {
    skip.push([om.index, om.index + om[0].length]);
  }
  const inMarker = function (i) {
    return skip.some(function (r) { return i >= r[0] && i < r[1]; });
  };

  let m;
  WORD_CHAR_RE.lastIndex = 0;
  while ((m = WORD_CHAR_RE.exec(text)) !== null) {
    if (!inMarker(m.index)) {
      return text.slice(0, m.index) + text.slice(m.index + 1);
    }
  }
  assert.fail('the fixture carries at least one non-scaffolding word ' +
    'character to drop');
}

// ---- T1-T11: the spine ------------------------------------------------------

const WORKED_BEFORE = '🍝食材（一人份）： 5-7朵菜花 - 21g帕玛森芝士' +
  ' - 21g Pecorino芝士 然后全部用搅拌机搅拌成可以拌面的酱，放上你的煎鸡胸，开造吧！';

const WORKED_AFTER = [
  '## 食材（一人份）',
  '',
  '- 5-7朵菜花',
  '- 21g帕玛森芝士',
  '- 21g Pecorino芝士 然后全部用搅拌机搅拌成可以拌面的酱，放上你的煎鸡胸，开造吧！'
].join('\n');

testCase('T1 the worked example, structure-only', function () {
  const out = C.structureBody(WORKED_BEFORE, null);
  assert.strictEqual(out.text, WORKED_AFTER,
    'the label the author wrote before the colon becomes a heading and the ' +
    'separator run becomes a list — because D-03 surfaces the structure the ' +
    'author already implied, and never splits running prose on a guess. The ' +
    'trailing method sentence rides on the LAST bullet: ending the run ' +
    'earlier would be a guess (the model-named "## 做法" heading is ' +
    'provenance 2 and arrives in plan 06, not here).');
  assert.deepStrictEqual(out.addedHeadings, [],
    'a PROMOTED heading is never an added heading — its words came from ' +
    'the source, so D-01\'s "the model never authors prose" is untouched');
  assert.strictEqual(C.wordsPreserved(WORKED_BEFORE, out.text, []), true,
    'every word survives in order across the phase\'s headline transform — ' +
    'because D-04 is unconditional and this is the case it exists for');
});

// ---- the D-03a specimen, written in escapes ---------------------------------
//
// The owner amendment's poster case (26.88-norm-prototype.cjs case 2, the
// shape of a real 小红书 restaurant post). EVERY non-ASCII codepoint that the
// rule's boundary depends on is written as an escape, because the label
// boundary is a codepoint count and a silently re-normalised Vietnamese
// diacritic would move it: `Hạnh` is four codepoints precomposed and six
// decomposed, and the second spelling would push this label past
// LABEL_MAX_CHARS and change what the transform does.
const PIN = C.PIN_MARKERS[0];              // U+1F4CD, the round pushpin
const BAR = C.LABEL_BAR;                   // U+FF5C, the fullwidth bar
const EN_DASH = '–';
const SEC1_LABEL = 'P2' + EN_DASH + '5' + BAR + 'Saigon Kitchen';   // 19 cp
const SEC1_TEXT = '芝士焗生蚝 很推荐';
// The Vietnamese place name is NFC-normalised AT CONSTRUCTION rather than
// trusted to the file's bytes. Every diacritic here has both a precomposed
// and a decomposed spelling, and the two differ in CODEPOINT COUNT — four
// versus six for `Hanh`. The label boundary this case pins is a codepoint
// count, so an editor that saved this file as NFD would silently move the
// boundary and the fixture would be testing a different rule. normalize()
// is stdlib, so this costs nothing and closes the whole class.
const SEC2_LABEL = ('P6' + EN_DASH + '8' + BAR +
  'Bánh Cuốn Hồng Hạnh').normalize('NFC');    // 24 cp
const SEC2_TEXT = '年糕好吃';

const PIN_BEFORE = PIN + SEC1_LABEL + ' ' + SEC1_TEXT + ' ' +
  PIN + SEC2_LABEL + ' ' + SEC2_TEXT;
const PIN_AFTER = '## ' + SEC1_LABEL + '\n\n' + SEC1_TEXT + '\n\n' +
  '## ' + SEC2_LABEL + '\n\n' + SEC2_TEXT;

testCase('T2 the D-03a pin + fullwidth-bar specimen becomes sections',
  function () {
    assert.strictEqual(Array.from(SEC1_LABEL).length, 19,
      'sanity: the first label is 19 codepoints, comfortably inside ' +
      'LABEL_MAX_CHARS — if this is not 19 the source was re-normalised ' +
      'and every boundary assertion below is measuring something else');
    assert.strictEqual(Array.from(SEC2_LABEL).length,
      C.LABEL_MAX_CHARS,
      'sanity: the second label sits EXACTLY on LABEL_MAX_CHARS — the ' +
      'poster case is the tightest real label in the corpus, which is why ' +
      'the bound is "longer than" and not "as long as"');

    const out = C.structureBody(PIN_BEFORE, null);
    assert.strictEqual(out.text, PIN_AFTER,
      'a run of pin-marked sections becomes one heading per section, each ' +
      'heading a VERBATIM slice of the label the author wrote after the ' +
      'marker, with the section\'s own text under it — because D-03a (owner ' +
      'amendment, 2026-07-31) adds the pin class to D-03 as the SAME rule ' +
      'shape, and 35 real notes are walls until it fires. The fullwidth bar ' +
      'stays INSIDE the heading: the position label on its left and the ' +
      'place name on its right are both her words, and the bar never splits ' +
      'a section.');
    assert.deepStrictEqual(out.addedHeadings, [],
      'both headings are PROMOTED, so no allowance is needed — their words ' +
      'came from the source and D-01\'s "the model never authors prose" is ' +
      'untouched');
    assert.strictEqual(C.wordsPreserved(PIN_BEFORE, out.text, []), true,
      'and every word survives in order across the D-03a transform (D-04)');
    assert.strictEqual(
      C.wordsPreserved(PIN_BEFORE, dropAWord(out.text), []), false,
      '...with the paired counter-assertion, so a do-nothing transform ' +
      'could not pass the positive above');
  });

testCase('T3 a dropped CJK character trips the guard', function () {
  assert.strictEqual(
    C.wordsPreserved('一二三四五 six seven', '## x\n\n一二三四 six seven', ['x']),
    false,
    'a lost ideograph is a lost word — because CJK is tokenised PER ' +
    'CODEPOINT, a run-length token would hide exactly this');
});

testCase('T4 reordered words trip the guard', function () {
  assert.strictEqual(
    C.wordsPreserved('alpha beta gamma', 'gamma alpha beta', []), false,
    'D-04 is a word-SEQUENCE invariant, not a word-set one — the ' +
    'disclosure says "in the order you saved it" and that is checked');
});

testCase('T5 an UNDECLARED injected heading trips the guard', function () {
  assert.strictEqual(
    C.wordsPreserved('全部用搅拌机搅拌', '## 做法\n\n全部用搅拌机搅拌', []),
    false,
    'this is the pin that makes D-01\'s "the model never authors prose" a ' +
    'CHECKED claim: prose that reaches the screen without being declared ' +
    'as an added heading fails, every time');
  assert.strictEqual(
    C.wordsPreserved('全部用搅拌机搅拌', '## 做法\n\n全部用搅拌机搅拌', ['做法']),
    true,
    '...and the SAME heading, declared, is allowed — the allowance is a ' +
    'token-run subtraction of one left-to-right occurrence, never a ' +
    'string removal');
});

testCase('T6 a character changed inside a fenced block trips the guard',
  function () {
    assert.strictEqual(
      C.wordsPreserved('```js\nvar x = 1;\n```', '```js\nvar y = 1;\n```', []),
      false,
      'the CONTENT of a hands-off zone is compared as words like everything ' +
      'else — only the zone\'s line MARKERS are scaffolding (D-07)');
  });

testCase('T7 a dropped numeric measurement trips the guard', function () {
  assert.strictEqual(C.wordsPreserved('1.5 cups flour', 'cups flour', []),
    false,
    'protects the ordinal rule\'s whitespace lookahead: "1." is scaffolding ' +
    'only when a space follows it, so "1.5 cups" must stay two tokens');
  assert.strictEqual(
    C.wordsPreserved('- 1.5 cups flour\n- 2 eggs',
      '- 1.5 cups flour\n- eggs', []), false,
    '...and the same holds inside a list, where the ordinal rule is live');
});

testCase('T8 a null side returns false and throws nothing', function () {
  assert.doesNotThrow(function () { C.wordsPreserved(null, 'x', []); },
    'the guard is fail-CLOSED on malformed input, never fail-loud — the ' +
    'core.js:169 null-guard-first posture');
  assert.strictEqual(C.wordsPreserved(null, 'x', []), false,
    'a null before side can never certify a transform');
  assert.strictEqual(C.wordsPreserved('x', null, []), false,
    'and neither can a null after side');
  assert.strictEqual(C.wordsPreserved(null, null, null), false,
    'nor both, and the missing addedHeadings list does not throw');
});

testCase('T9 D-06 provenance reads the note\'s OWN frontmatter', function () {
  assert.strictEqual(C.fmSource(null), null,
    'no frontmatter is no source — fmTitle\'s shape, byte for byte');
  assert.strictEqual(C.fmSource('title: x\nsource: personal\ntags: []'),
    'personal', 'the source line is read line-anchored out of the raw block');
  assert.strictEqual(C.fmSource('source: "personal"'), 'personal',
    'quotes are stripped, exactly as fmTitle strips them');
  assert.strictEqual(C.fmSource(BOM + 'source: personal'), 'personal',
    'fmSource is BOM-tolerant ON ITS OWN, because the shipped FM_RE is not ' +
    'and this phase does not touch FM_RE');
  assert.strictEqual(C.fmSource('source: personal-notes'), 'personal-notes',
    'the value is returned verbatim — no prefix matching anywhere');

  assert.strictEqual(C.isPersonalNote({}, 'source: personal'), true,
    'her own writing renders exactly as saved, always (D-06)');
  assert.strictEqual(C.isPersonalNote({}, 'source: personal-notes'), false,
    'EXACT equality, never a prefix or a substring — the live corpus\'s ' +
    'source field holds raw URLs and even a wikilink in the wild');
  assert.strictEqual(C.isPersonalNote({ folder: 'Journal' }, null), true,
    'the folder roster is the SECOND signal beside the note\'s own ' +
    '`source:` value, and after D-19 that is all it is: the roster covers ' +
    'notes that DO carry frontmatter but name no personal source. The ' +
    'absent-frontmatter case is no longer the roster\'s job — it is the ' +
    'D-19 branch\'s');
  assert.strictEqual(C.isPersonalNote({ folder: 'JOURNAL' }, null), true,
    'the folder compare is case-folded');
  assert.strictEqual(C.isPersonalNote({ folder: 'Clippings' }, null), true,
    'D-19 (owner call 2026-08-01, post-research): a note with NO ' +
    'frontmatter block at all is HERS until the app can show otherwise, and ' +
    'a folder name is not that showing. 152 of the 536 eligible notes carry ' +
    'no frontmatter, 143 of them in the adapter folder ' +
    'studyroom-collect-k2ks84n7, 28 firing on the reading surface today — ' +
    'private correspondence, personal paperwork, official-process notes, hobby ' +
    'notes, an autobiography. THE RULE: if the app cannot demonstrate a ' +
    'note is clipped, it renders it exactly as saved');
  assert.strictEqual(C.isPersonalNote({}, null), true,
    'the no-frontmatter, no-folder shape takes the same D-19 road — there ' +
    'is even less evidence here that the note was clipped, not more');
  assert.strictEqual(C.isPersonalNote(null, null), true,
    'and a missing item with no frontmatter is fail-CLOSED under law 4 ' +
    '(render as saved), not fail-open — malformed input must never be the ' +
    'road by which her own words get laid out. It still does not throw');
  assert.strictEqual(C.isPersonalNote({ folder: 'Clippings' }, 'title: x'),
    false,
    'THE RESIDUAL, and it is deliberate: a note that HAS a frontmatter ' +
    'block but carries no `source:` value still takes the permissive road. ' +
    'That population is UNMEASURED, and widening to it is a separate ' +
    'decision with its own measurement — D-19 does not speculate past what ' +
    'was measured');
});

testCase('T13 D-19 — an adapter import with no frontmatter is never laid out',
  function () {
    // The shape the StudyRoom collect adapter actually produces: a stored
    // item whose folder facet is the adapter's own folder (NOT in
    // FOLDER_PERSONAL), and a raw file with no `---` block, so the caller's
    // frontmatter split yields fm === null.
    const raw = '我今天写下这些，是想记住这段时间发生了什么。\n' +
      '给HR的请假信还没写完。\n';
    assert.strictEqual(/^---/.test(raw), false,
      'sanity: the fixture really is the no-frontmatter shape — if a future ' +
      'adapter starts writing a block, this case is measuring the wrong thing');

    const item = { folder: 'studyroom-collect-k2ks84n7', type: 'text' };
    assert.strictEqual(C.isPersonalNote(item, null), true,
      'D-19: 143 of the 152 un-frontmattered eligible notes sit in this one ' +
      'adapter folder, and they are her own phone/Apple-Notes captures — ' +
      'private correspondence, personal paperwork, official-process notes, ' +
      'knitting notes, a 2,962-character autobiography. The reading surface ' +
      'branches on this predicate (app.js:1958) and lays out only what it ' +
      'returns false for, so a true here IS "structureBody is never reached"');
    assert.strictEqual(C.hasFrontmatterBlock(null), false,
      'and the named predicate the branch is written in terms of agrees — ' +
      'one grep-able home, so a future reader finds every caller at once');
    assert.strictEqual(C.hasFrontmatterBlock('   \n  '), false,
      'a whitespace-only block is no block: an adapter that emits an empty ' +
      '--- --- pair must not thereby unlock the reformatter');
    assert.strictEqual(C.hasFrontmatterBlock('title: x'), true,
      'while a block with any content at all IS a block — the residual, and ' +
      'not covered by D-19');

    // The point of the whole change, stated as a comparison rather than as
    // an isolated boolean: a NEW adapter, with a folder nobody has added to
    // any roster, is protected by construction rather than by anyone
    // remembering to add it (T-26.88-29).
    assert.strictEqual(
      C.isPersonalNote({ folder: 'some-future-adapter-9xk2' }, null), true,
      'the default is now fail-closed, so the next import cannot silently ' +
      're-open the hole; a prefix match on studyroom-collect-* would have ' +
      'plugged this one adapter and left the next one exposed');
    assert.strictEqual(
      C.isPersonalNote({ folder: 'some-future-adapter-9xk2' },
        'source: xiaohongshu'), false,
      '...while the same adapter\'s notes that DO demonstrate they were ' +
      'clipped are still laid out. The change narrows the reformatter to ' +
      'demonstrated clippings; it does not switch it off');
  });

testCase('T10 D-07.4a — tooling headings never disqualify a note',
  function () {
    const related = [
      '一些内容。',
      '',
      '%% auto-links:start %%',
      '## Related',
      '- [[something else]]',
      '%% auto-links:end %%',
      ''
    ].join('\n');
    assert.strictEqual(C.hasAuthorHeading(related), false,
      'the `## Related` block vault_linker.py writes between its ' +
      '%% auto-links %% markers is TOOLING, not author structure. IF A ' +
      'FUTURE CHANGE TO THE MARKER SHAPE BREAKS THIS, THIS CASE MUST FAIL ' +
      'LOUDLY: read literally, D-07.4 leaves 71 of 2,945 live notes ' +
      'eligible and the whole phase ships inert.');

    const comments = ['一些内容。', '', '## Comments', ''].join('\n');
    assert.strictEqual(C.hasAuthorHeading(comments), false,
      'a TRAILING boilerplate comments heading is clippings-processor ' +
      'talking, not the author (D-07.4a)');

    const both = [
      '一些内容。', '',
      '%% auto-links:start %%', '## Related', '%% auto-links:end %%', '',
      '## Comments', ''
    ].join('\n');
    assert.strictEqual(C.hasAuthorHeading(both), false,
      'both tooling blocks together still leave a note eligible');

    assert.strictEqual(C.hasAuthorHeading('## 食材\n\n- a\n- b\n'), true,
      'any OTHER heading is the author\'s, and D-07.4 then leaves the whole ' +
      'note entirely alone rather than layering a second pass');

    assert.strictEqual(
      C.hasAuthorHeading('```\n## not a heading\n```\n'), false,
      'a hash line inside a fenced block is code, never a heading');

    assert.strictEqual(C.hasAuthorHeading('#hashtag is not a heading\n'),
      false, 'ATX requires a space after the hashes');

    assert.strictEqual(C.hasAuthorHeading(''), false,
      'an empty body carries no heading and does not throw');
  });

testCase('T11 D-07 hands-off zones are byte-identical across the transform',
  function () {
    const src = [
      '一段引言：菜花、芝士、面条',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '> author commentary here',
      '> and a second quoted line',
      '',
      '![[photo_1.jpg]]',
      '',
      '```js',
      'var x = 1;',
      '```',
      ''
    ].join('\n');
    const out = C.structureBody(src, null);

    assert.strictEqual(out.text.indexOf('## 一段引言'), 0,
      'the free-prose line still promotes — the zone map must not make the ' +
      'whole note inert');

    ['| a | b |\n|---|---|\n| 1 | 2 |',
      '> author commentary here\n> and a second quoted line',
      '![[photo_1.jpg]]',
      '```js\nvar x = 1;\n```'].forEach(function (span) {
      assert.ok(out.text.indexOf(span) !== -1,
        'the hands-off span ' + JSON.stringify(span.slice(0, 20)) + '… is ' +
        'byte-identical across the transform — because D-07 says a fenced ' +
        'block, a table, a blockquote run and an image line are never ' +
        'restructured, reordered, split, joined, or re-marked');
    });

    assert.strictEqual(/^\s*##[^\n]*\n?\s*\|/m.test(out.text), false,
      'no heading is emitted INSIDE a hands-off span — a heading may sit ' +
      'immediately before one, never within it');
    assert.strictEqual(/^\s*##/m.test(out.text.slice(
      out.text.indexOf('| a | b |'))), false,
      'and nothing is inserted anywhere below the first hands-off span');

    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true,
      'and the whole mixed body still preserves every word in order (D-04)');
  });

// T12 is a REGRESSION pin, and it is worth saying what it caught, because a
// green suite is exactly what hid it. Plan 08's UAT picker ran the shipped
// transform over the 2,945 live notes and found that
// `%% auto-links:start %%` — the vault_linker marker every clipping carries —
// was reaching the colon rule as ordinary prose and promoting to
// `## %% auto-links` / `start %%`. renderMarkdown's cleanVaultMarkup then
// strips `%%…%%`, so what rendered was an EMPTY `## ` heading, twice per note,
// in effectively every eligible clipping. 156 of the 417 firing notes fired on
// nothing else, which also lit the "show as saved" control on notes nothing
// had been done to.
//
// Nothing already in this file could have caught it. wordsPreserved stays true
// (every word survives a promotion), and no fixture carried a `%%` line —
// hasAuthorHeading's own tests exercise the span, but hasAuthorHeading was
// never the caller that was wrong. One rule, two callers, disagreeing.
testCase('T12 an Obsidian %% comment is a hands-off zone (26.88-08 F-1)',
  function () {
    const src = [
      '食材：鸡蛋、牛奶、面粉',
      '',
      '%% auto-links:start %%',
      '## Related',
      '- Hub: [[Hubs/ai-skills|ai-skills]]',
      '%% auto-links:end %%',
      ''
    ].join('\n');
    const out = C.structureBody(src, null);

    assert.strictEqual(out.text.indexOf('## 食材'), 0,
      'the free-prose line still promotes — the comment zone must not make ' +
      'the whole note inert');

    ['%% auto-links:start %%', '%% auto-links:end %%'].forEach(function (mark) {
      assert.ok(out.text.indexOf(mark) !== -1,
        'the marker line ' + JSON.stringify(mark) + ' survives byte-identical ' +
        '— because a %% comment is scaffolding the renderer deletes, so ' +
        'anything structured out of one is debris by construction');
    });

    assert.strictEqual(/^##[ \t]*$/m.test(out.text), false,
      'NO EMPTY HEADING is emitted anywhere — this is the exact rendered ' +
      'symptom F-1 produced, and the reason the phase could not be closed ' +
      'on its green suites');

    assert.strictEqual(out.text.indexOf('## %%'), -1,
      'and no heading is promoted OUT of a comment marker (D-07.4a says that ' +
      'span is tooling, not the author; hasAuthorHeading already agreed)');

    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true,
      'and every word still survives in order (D-04) — which is precisely ' +
      'why the guard could not catch this one');
  });

// A multi-line %% comment closes on a LATER line, so the zone must consume
// until the closing marker rather than stopping at the opening one.
testCase('T12b a multi-line %% comment is consumed whole (26.88-08 F-1)',
  function () {
    // Six non-blank lines, so rule 10's short-post suppressor is OFF and the
    // heading assertions below are actually about the comment zone rather
    // than about post length (SHORT_POST_LINES).
    const src = [
      '这是一段普通的正文，用来让这条笔记不算短帖。',
      '',
      '%% a note to self',
      '提醒：这段不要显示',
      'still inside the comment %%',
      '',
      '做法：先煮水',
      '另外还有一句普通的正文。'
    ].join('\n');
    const out = C.structureBody(src, null);

    assert.ok(out.text.indexOf(
      '%% a note to self\n提醒：这段不要显示\nstill inside the comment %%') !== -1,
      'every line between the open and close markers is byte-identical — ' +
      'because a colon inside a comment is not a section label');

    assert.strictEqual(out.text.indexOf('## 提醒'), -1,
      'the colon line INSIDE the comment is never promoted');
    assert.ok(out.text.indexOf('## 做法') !== -1,
      'while the colon line AFTER the comment closes still promotes — the ' +
      'zone ends where the author ended it');

    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true, 'and every word survives in order (D-04)');
  });

// ---- T14 + Z1/Z2: the D-13 caption zone, and the two callers agreeing -------
//
// T14 is the F-3 regression pin, and like T12 it is worth saying what it
// caught, because a green suite is exactly what hid it. Plan 08's UAT drove
// the six picks through the app's own render path on the live library and
// found the same thing on EVERY ONE of the six: the only line the transform
// changed was an italic image caption, and it broke it.
//
//     CONSUMED   *图：CAT SCARF 封面照——黄灰条纹钩织围巾…*
//     EMITTED    ## *图
//                CAT SCARF 封面照——黄灰条纹钩织围巾…*
//
// The colon rule fires on the caption's `图：` label; `stripLeadingMarkers`
// cannot remove the `*` (U+002A is in none of MARKER_GLYPH_RE's ranges), so
// the promoted label is `*图` and the closing `*` is stranded at the end of
// the following paragraph — the markdown emphasis pair split across a heading
// boundary. `*图：…*` is the caption convention the clippings-processor skill
// writes into every image-bearing clipping in this vault: 687 `*图` lines
// across the eligible pool. Measured post-F-1, 207 of 261 firing notes (79%)
// emitted a broken-italic `## *` heading and 176 (67%) fired on NOTHING BUT
// caption lines.
//
// Nothing already in this file could have caught it. wordsPreserved stays true
// (every word survives a promotion, and normalizeWords drops `*` on BOTH
// sides by design), and no fixture carried a wholly-emphasis-wrapped line.
// That is the third defect in a row invisible to the D-04 guard.
//
// Z1/Z2 are a different failure of the SAME shape and were found by reading
// rather than by measuring: the F-1 fix added the `%%` comment zone to
// structureBody and never added it to handsOffSpans, whose own comment still
// claimed parity at four. One rule, two callers, disagreeing — in the
// placement path this time.

// Long enough on its own that rule 10's short-post suppressor is OFF in every
// fixture below (a line over ITEM_MAX_CHARS makes isShortPost false), so a
// green assertion about the caption zone is never secretly an assertion about
// post length. T14c is the paired control that proves it.
const D13_PROSE =
  '这是一段没有任何信号的普通正文，用来占位，并且长度足够长，所以短帖抑制器不会生效。';

// The live shape, from 26.88-08-FINDINGS § F-3, verbatim.
const D13_CAPTION =
  '*图：CAT SCARF 封面照——黄灰条纹钩织围巾，一端做成趴着的黑猫头*';

testCase('T14 a wholly-emphasis-wrapped caption is a hands-off zone (F-3, D-13)',
  function () {
    const src = [D13_PROSE, '', D13_CAPTION, ''].join('\n');
    const out = C.structureBody(src, null);

    assert.strictEqual(out.text, src,
      'a note whose only signal-bearing line is an image caption comes back ' +
      'BYTE-IDENTICAL — because D-13 makes a line whose whole job is one ' +
      'construct hands-off, exactly as D-07 already does for an image line ' +
      'and a fence line');

    assert.strictEqual(out.text.indexOf('## *'), -1,
      'NO `## *图` heading is emitted — this is the exact rendered symptom ' +
      'F-3 produced on 207 of the 261 firing notes, and the reason the ' +
      'owner verdict was stopped rather than taken on a green suite');

    assert.ok(out.text.indexOf(D13_CAPTION) !== -1,
      'and the emphasis pair is never split across a heading boundary: the ' +
      'closing `*` is still on the same line as the opener that made it a pair');

    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true,
      'every word still survives in order (D-04) — which is precisely why ' +
      'the guard could not catch this one either');
  });

testCase('T14c the caption zone does not make the whole note inert',
  function () {
    const src = [D13_PROSE, '', D13_CAPTION, '', '食材：菜花、芝士', '']
      .join('\n');
    const out = C.structureBody(src, null);

    assert.ok(out.text.indexOf(D13_CAPTION) !== -1,
      'the caption survives byte-identically...');

    assert.ok(out.text.indexOf('## 食材') !== -1,
      '...AND an ordinary colon label on the SAME note still promotes. ' +
      'BECAUSE "zero caption-only firers" is equally satisfied by a zone so ' +
      'broad that NOTHING fires — a fix that quietly disables the feature it ' +
      'was fixing is the F-1 shape again. This is also the control proving ' +
      'rule 10\'s short-post suppressor is not what makes T14/T14d/T14f pass.');

    assert.strictEqual(out.text.indexOf('## *'), -1,
      'and still no broken-italic heading anywhere');

    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true, 'word-preserving throughout (D-04)');
  });

// F-3's note 4, verbatim: the same caption ALSO hit a run rule, which split
// the parenthetical on `、` into four list items and broke the fullwidth
// parenthesis across them. The zone claims the line before any run rule sees
// it, which is why one branch closes both symptoms.
const D13_SHRED_CAPTION =
  '*图：CLOUDUNT 多拿滋店，店员从展示柜取出一盒四种口味多拿滋' +
  '（芒果、抹茶配树莓、巧克力、开心果撒糖粉）*';

testCase('T14d the caption zone runs BEFORE any run rule (F-3, note 4)',
  function () {
    const src = [D13_PROSE, '', D13_SHRED_CAPTION, ''].join('\n');
    const out = C.structureBody(src, null);

    assert.strictEqual(out.text, src,
      'byte-identical — because the zone map runs first, so the `、` run rule ' +
      'never sees the line at all');

    assert.strictEqual(out.text.indexOf('- 抹茶配树莓'), -1,
      'the four-bullet shred F-3 recorded verbatim never appears again');

    assert.ok(out.text.indexOf(
      '（芒果、抹茶配树莓、巧克力、开心果撒糖粉）') !== -1,
      'and the fullwidth parenthesis is intact on ONE line rather than broken ' +
      'across four list items — the defect class D-14 will guard in plan 12, ' +
      'closed here at its cause');
  });

testCase('T14e the zone requires the SAME delimiter at BOTH ends',
  function () {
    const RE = C.WHOLLY_EMPHASIZED_RE;

    assert.strictEqual(RE.test(D13_CAPTION), true,
      'THE CONTROL: a `*…*` caption IS a zone. Without it every refusal below ' +
      'would pass just as happily against a regex that matches nothing.');

    assert.strictEqual(RE.test('*图：一张封面照，但是没有收尾的星号'), false,
      'a line that OPENS with emphasis and never closes it is NOT a zone — ' +
      'the delimiter must appear at BOTH ends, and a half-open line is ' +
      'ordinary prose that the other rules may still refuse on their own terms');

    assert.strictEqual(RE.test('**食材：**菜花、芝士'), false,
      'a line whose bold pair closes MID-LINE is not WHOLLY wrapped — the ' +
      'closer must sit at the end of the line');

    assert.strictEqual(RE.test('_图：混用了两种强调符号*'), false,
      'and the opener and the closer must be the SAME delimiter');

    assert.strictEqual(RE.test('* 图：这是一个普通的列表项，以星号结尾 *'),
      false,
      'whitespace immediately after the opener means a bullet list item, ' +
      'never a caption');

    assert.strictEqual(RE.test('这里没有任何强调符号'), false,
      'and an ordinary prose line is not a zone');
  });

testCase('T14f the measured COST of D-13, stated as a test rather than found',
  function () {
    const bold = '**食材：菜花、芝士、面条、鸡蛋、牛奶、面粉、黄油、白糖**';
    const src = [D13_PROSE, '', bold, ''].join('\n');
    const out = C.structureBody(src, null);

    assert.strictEqual(out.text, src,
      'a WHOLLY BOLD-WRAPPED label line is now hands-off and NO LONGER ' +
      'PROMOTES. BECAUSE D-13 chose the smallest possible diff — one regex, ' +
      'one branch — over a special case for `**`, and the price is measured: ' +
      'the caption-shape survey found 687 `*图` lines, exactly 3 ' +
      'bold-wrapped lines and 0 underscore-wrapped lines across the eligible ' +
      'pool. Three lines stop being promotable. That is the whole cost, and ' +
      'it is on the record here rather than turning up later as a surprise.');

    assert.strictEqual(out.text.indexOf('## **食材'), -1,
      'specifically: the `## **食材` heading it used to emit is gone');
  });

testCase('Z2 handsOffSpans covers a %% comment block (the F-1 caller drift)',
  function () {
    const src = [
      D13_PROSE,
      '%% a note to self',
      '提醒：这段不要显示',
      'still inside the comment %%',
      '结尾一行。'
    ].join('\n');
    const spans = C.handsOffSpans(src);

    ['%% a note to self', '提醒：这段不要显示', 'still inside the comment %%']
      .forEach(function (line) {
        const at = src.indexOf(line);
        assert.ok(spans.some(function (s) { return at >= s[0] && at < s[1]; }),
          JSON.stringify(line) + ' is INSIDE a hands-off span. BECAUSE the ' +
          'F-1 fix (26.88-08) added the %% comment zone to structureBody and ' +
          'never added it to handsOffSpans, whose own comment went on ' +
          'claiming the predicates were "the SAME four the transform\'s own ' +
          'zone map uses". placeHeadings is handsOffSpans\'s only caller, so ' +
          'an anchor landing inside a comment would have emitted a ' +
          'model-named heading bound to text cleanVaultMarkup then deletes — ' +
          'F-1\'s exact symptom class on the OTHER heading provenance. THIS ' +
          'ASSERTION WAS RUN RED AGAINST THE SHIPPED handsOffSpans BEFORE ' +
          'THE FIX; it is the proof the drift was real and not a theory.');
      });

    const prose = src.indexOf(D13_PROSE);
    assert.strictEqual(
      spans.some(function (s) { return prose >= s[0] && prose < s[1]; }),
      false,
      'and free prose is still not a span — a handsOffSpans that returned one ' +
      'range over the whole body would satisfy every assertion above and ' +
      'silently forbid every heading placement in the library');
  });

testCase('Z1 structureBody and handsOffSpans agree on all six hands-off zones',
  function () {
    const lines = [
      D13_PROSE,                     // 0  free prose
      '%% auto-links:start %%',      // 1  ZONE: an Obsidian %% comment
      D13_CAPTION,                   // 2  ZONE: an emphasis-wrapped caption
      '```js',                       // 3  ZONE: a fenced block
      'var x = 1;',                  // 4
      '```',                         // 5
      '| a | b |',                   // 6  ZONE: a table
      '|---|---|',                   // 7
      '| 1 | 2 |',                   // 8
      '> author commentary here',    // 9  ZONE: a blockquote run
      '![[photo_1.jpg]]',            // 10 ZONE: an image line
      '食材：菜花、芝士'              // 11 free prose, and it must still promote
    ];
    const src = lines.join('\n');

    const offsets = [];
    let at = 0;
    lines.forEach(function (l) { offsets.push(at); at += l.length + 1; });

    const spans = C.handsOffSpans(src);
    function inSpan(n) {
      return spans.some(function (s) {
        return offsets[n] >= s[0] && offsets[n] < s[1];
      });
    }
    const out = C.structureBody(src, null);

    [[1, 'a %% comment'], [2, 'an emphasis-wrapped caption'],
      [3, 'a fenced block'], [4, 'a fenced block'], [5, 'a fenced block'],
      [6, 'a table'], [7, 'a table'], [8, 'a table'],
      [9, 'a blockquote run'], [10, 'an image line']].forEach(function (z) {
      assert.ok(out.text.indexOf(lines[z[0]]) !== -1,
        'structureBody copied ' + z[1] + ' line ' + z[0] + ' byte-identically');
      assert.ok(inSpan(z[0]),
        '...and handsOffSpans covers it too. BECAUSE these are TWO CALLERS OF ' +
        'ONE RULE and they disagreed for the whole of plan 08-10: the ' +
        'agreement is asserted as a cross-check between the two functions ' +
        'rather than as two separate expectations that could drift apart ' +
        'again the next time a zone is added to only one of them.');
    });

    assert.strictEqual(inSpan(0), false,
      'free prose is not a span...');
    assert.strictEqual(inSpan(11), false,
      '...and neither is the colon-label line...');
    assert.ok(out.text.indexOf('## 食材') !== -1,
      '...which still promotes: six zones must not weld the note shut, and a ' +
      'handsOffSpans returning one range over everything would otherwise ' +
      'satisfy every assertion above');

    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true, 'and the whole six-zone body still preserves every word (D-04)');
  });

// ---- E1-E10: the 26.85 encoding family, ported ------------------------------
//
// Ported from tests/test_cleaning_writer.py:244-295. The SHAPES and their
// assertion prose are ported; the Python code is not. Each shape is run
// twice — positive, then a deliberate mutation that must make the guard go
// red. If any of these fail, the defect is in core.js and not in the
// fixture: the prototype these functions carry measured 0 false trips across
// all 2,945 live notes.

const PLAIN_FM = '---\ntitle: A real title\ntags: []\n---\n';

function encodingPair(label, body, extraPositive) {
  testCase(label + ' (positive)', function () {
    const out = C.structureBody(body, null);
    assert.strictEqual(C.wordsPreserved(body, out.text, out.addedHeadings),
      true, 'every word of the ' + label + ' fixture survives in order ' +
      'across the transform — 26.85 proved this shape for the WRITER as ' +
      'byte-identity; this is the same shape proved for the TRANSFORM as ' +
      'word-preservation (law 4)');
    if (extraPositive) { extraPositive(out); }
  });
  testCase(label + ' (mutation counter-assertion)', function () {
    const out = C.structureBody(body, null);
    const mutated = dropAWord(out.text);
    assert.notStrictEqual(mutated, out.text,
      'the mutation really changed the output — the test is tested');
    assert.strictEqual(C.wordsPreserved(body, mutated, out.addedHeadings),
      false,
      'a single dropped word in the ' + label + ' output makes the guard ' +
      'go RED — without this pair a do-nothing transform would pass the ' +
      'positive above (D-04, the "guard twice" discipline)');
  });
}

encodingPair('E1 LF body',
  bodyAfterFrontmatter(PLAIN_FM + '# Title\n\nbody line one.\n'),
  function (out) {
    assert.strictEqual(out.text, '# Title\n\nbody line one.\n',
      'an LF body with no D-03 signal comes back untouched');
  });

encodingPair('E2 CRLF body',
  bodyAfterFrontmatter('---\r\ntitle: A real title\r\ntags: []\r\n---\r\n' +
    '\r\n# Title\r\n\r\nbody line.\r\n'),
  function (out) {
    assert.ok(out.text.indexOf('\r') !== -1,
      'the CARRIAGE-RETURN BYTES ride through the transform untouched — a ' +
      'Windows-exported note must never have its line endings folded');
    assert.ok(out.text.indexOf('\r\n\r\nbody line.\r\n') !== -1,
      'and the CRLF body bytes are still contiguous and in place');
  });

encodingPair('E3 no trailing newline',
  bodyAfterFrontmatter(PLAIN_FM + 'a note with no final newline'),
  function (out) {
    assert.strictEqual(out.text.slice(-1) === '\n', false,
      'the missing final newline is not invented — the transform adds no ' +
      'byte the author did not write');
  });

encodingPair('E4 UTF-8 BOM file',
  bodyAfterFrontmatter(BOM + PLAIN_FM + '\nbody after a BOM.\n'),
  function (out) {
    assert.strictEqual(out.text, '\nbody after a BOM.\n',
      'the BOM is held aside by this suite\'s own BOM-aware slicer. The ' +
      'shipped app.js FM_RE is NOT BOM-tolerant, so a BOM-prefixed note ' +
      'reads there as having no frontmatter at all — a PRE-EXISTING gap, ' +
      'invisible today because zero live notes carry a BOM, and DELIBERATELY ' +
      'NOT FIXED here: changing FM_RE would change display for a whole class ' +
      'of notes and is out of this phase\'s scope');
    assert.strictEqual(C.fmSource(BOM + 'source: personal'), 'personal',
      'fmSource, by contrast, IS BOM-tolerant on its own — the D-06 branch ' +
      'must not silently miss a personal note because of a byte-order mark');
  });

const WALL_SENTENCE = '这是一段很长的正文没有任何标点提示就这样一直写下去。';
const WALL_BODY = new Array(81).join(WALL_SENTENCE) + '\n';

encodingPair('E5 multi-KB wall of text', WALL_BODY, function (out) {
  assert.ok(WALL_BODY.length > 2048,
    'sanity: the wall fixture really is multi-KB');
  // 26.88-13 RE-CUT, and the plan did not know this case existed. The research
  // asked whether any shipped NEGATIVE assertion forbids what D-15 requires and
  // answered "one does, S6". TWO do. S6 does not even go red (its body is one
  // ~107-character block, an order of magnitude under the threshold); THIS one
  // went red on the first run after the rule landed, because an 80-sentence
  // multi-KB wall is precisely the shape D-15 exists for.
  //
  // WHAT STILL HOLDS, and it is the larger half: NOTHING IS RE-WRAPPED. No line
  // is re-flowed to a width, no sentence is merged with its neighbour, no
  // heading and no bullet is emitted, and no word moves. The wall is cut at
  // boundaries THE AUTHOR TYPED and nowhere else — which is why the equality
  // below is against the sentences of the original rather than against a new
  // string.
  //
  // WHAT CHANGED: D-15 (owner call 2026-08-01) activated the CONTEXT
  // `<deferred>` entry on its own stated trigger — "revisit only if the real
  // corpus turns out to be mostly unsignalled walls" — which the live
  // measurement fired. Sentence-final punctuation IS author signal, so this
  // body is no longer unsignalled; it is signalled by the only marker it
  // carries.
  //
  // AND THE "RESTRUCTURES HER OWN WRITING" OBJECTION IS RESOLVED, ACCURATELY:
  // not by D-06, which did NOT cover it — 152 eligible notes carried no
  // frontmatter block at all and 143 of those were her own phone captures,
  // including the two largest walls in the pool. Plan 10 (D-19) closed that
  // gap, and this rule ships strictly behind that close.
  const wallParts = WALL_BODY.replace(/\n$/, '').split('。')
    .filter(Boolean).map(function (x) { return x + '。'; });
  assert.strictEqual(out.text, wallParts.join('\n\n') + '\n',
    'an over-threshold wall is cut at the author\'s own sentence ends and ' +
    'NOWHERE else: 80 sentences, 80 blocks, same order, same words, nothing ' +
    're-wrapped (D-15)');
  assert.strictEqual(out.text.indexOf('## '), -1,
    'and still no heading and no bullet — a blank line is the entire ' +
    'intervention');
  assert.strictEqual(out.text.replace(/\s+/g, ''),
    WALL_BODY.replace(/\s+/g, ''),
    'stripped of whitespace the two sides are IDENTICAL, which is law 4 ' +
    'stated as an equality');
  assert.strictEqual(C.markupPreserved(WALL_BODY, out.text), true,
    'and plan 12\'s inline-markup invariant is untouched by the cut');
});

encodingPair('E6 no frontmatter at all',
  bodyAfterFrontmatter('# Just a body\n\nno frontmatter here at all.\n'),
  function (out) {
    assert.strictEqual(out.text,
      '# Just a body\n\nno frontmatter here at all.\n',
      'the whole file is body when there is no block');
    assert.strictEqual(C.isPersonalNote({ folder: 'Clippings' }, null), true,
      'and the provenance branch handles fm === null under D-19: no ' +
      'frontmatter block means the app cannot demonstrate the note was ' +
      'clipped, so it renders exactly as saved and the transform never ' +
      'runs. This is the 152-note case (143 in ' +
      'studyroom-collect-k2ks84n7, 28 firing today) — the folder facet does ' +
      'not rescue it, because a folder name is not a demonstration');
  });

encodingPair('E7 CJK body',
  bodyAfterFrontmatter(PLAIN_FM + '\n一页手记，记忆的盒子。\n'),
  function (out) {
    assert.strictEqual(out.text, '\n一页手记，记忆的盒子。\n',
      'a CJK body with no colon label is untouched, and the fullwidth ' +
      'prose comma is NEVER a list separator — it was measured at 75,400 ' +
      'occurrences across the corpus and splitting on it would shred prose');
  });

testCase('E8 a third script with no signal is skipped, not guessed at',
  function () {
    const body = 'Это обычный текст без списков и без заголовков.\n';
    let out = null;
    assert.doesNotThrow(function () { out = C.structureBody(body, null); },
      'an unknown language throws nothing — the honest behaviour is "skip ' +
      'the heading, keep the structure", not an exception');
    assert.strictEqual(out.addedHeadings.length, 0,
      'no heading is invented for a language the rules cannot read');
    assert.strictEqual(out.text, body,
      'and the body comes back unchanged');
    assert.strictEqual(C.wordsPreserved(body, out.text, []), true,
      'which is trivially word-preserving');
    assert.strictEqual(C.wordsPreserved(body, dropAWord(out.text), []), false,
      'and the guard still bites on Cyrillic — the tokenizer is not ' +
      'Latin-or-CJK only');
  });

testCase('E9 an empty body invents nothing', function () {
  const out = C.structureBody('', null);
  assert.strictEqual(out.text, '',
    'an empty body renders exactly as today — the "how this was filed" ' +
    'block and nothing else; NO HEADING IS INVENTED FOR AN EMPTY BODY');
  assert.deepStrictEqual(out.addedHeadings, [],
    'and nothing is declared as added, because nothing was added');
  assert.strictEqual(C.wordsPreserved('', '', []), true,
    'the empty compare is preserved, not a failure');
  assert.strictEqual(C.structureBody(null, null).text, '',
    'a null body is the empty string and throws nothing');
});

testCase('E10 a frontmatter-only note invents nothing', function () {
  const raw = '---\ntitle: A real title\ntags: []\n---\n';
  const body = bodyAfterFrontmatter(raw);
  const out = C.structureBody(body, null);
  assert.strictEqual(out.text.indexOf('#'), -1,
    'no heading is invented for a frontmatter-only note (law 4: the app ' +
    'never writes a word she did not)');
  assert.strictEqual(out.text, body,
    'and the empty body comes back exactly as it went in');
});

// ---- E11 — CRLF must not let a line-anchored rule cross a line boundary ----
//
// Found by tests/test_reformat_property.cjs at seed 20260884, plan 02.
//
// normalizeWords strips ZONE LINE MARKERS and nothing else — its own comment
// says so: "the CONTENT of a fenced block or a blockquote is compared as words
// like everything else". Every one of those rules is written `^...` with the
// `m` flag, so each is a promise about ONE line.
//
// `\s` matches \r AND \n. On a CRLF document the blank line before a blockquote
// is exactly three whitespace characters (\n\r\n), so `^\s{0,3}>` reaches BACK
// across it, welds the quote onto the line above, and the fence rule then
// deletes the whole welded line — carrying the author's words out of the token
// stream with it. Downstream, wordsPreserved cannot see a change it never has
// tokens for: the guard goes BLIND on every CRLF note with a fenced block.
//
// This is the machine-checkable half of law 4 failing silently, which is worse
// than failing loudly. The pin is the LF/CRLF pair: the two spellings of the
// same document must tokenize identically, because a line ending is not a word.
testCase('E11 CRLF line-anchored rules stay on their own line', function () {
  const lf = '```\nR1 code\n```\n\n> alpha beta gamma';
  const crlf = lf.replace(/\n/g, '\r\n');

  assert.deepStrictEqual(
    C.normalizeWords(lf), ['r1', 'code', 'alpha', 'beta', 'gamma'],
    'the LF spelling tokenizes to every author word (BECAUSE stage 2 strips ' +
    'zone MARKERS only — fence and blockquote CONTENT are compared as words)');

  assert.deepStrictEqual(
    C.normalizeWords(crlf), C.normalizeWords(lf),
    'CRLF and LF spellings of the SAME document must tokenize identically ' +
    '(BECAUSE a line ending is not a word — if they differ, a line-anchored ' +
    'rule crossed a line boundary and ate content)');

  // the consequence, stated as the guard sees it: a dropped word must trip.
  const mutated = crlf.replace('alpha beta gamma', 'alpha gamma');
  assert.strictEqual(
    C.wordsPreserved(crlf, mutated, []), false,
    'dropping a word after a CRLF fence must make the guard go RED ' +
    '(BECAUSE D-04 says EVERY reformat is verified before it is shown, and a ' +
    'guard blind to a whole region of the document verifies nothing there)');
});

// ---- S1-S7: the rest of D-03's signal set (plan 03, task 1) ----------------
//
// ONE POSITIVE PER SIGNAL, each asserting BOTH an output shape AND
// wordsPreserved === true. A suite of negatives alone would pass with a
// trip-on-everything guard; the positives are what make that impossible
// (T-26.88-10).
//
// Vault rule 10 suppresses HEADERS on a short post, so every fixture below
// that expects a heading is padded past the threshold first. The pad is
// ordinary prose carrying no signal, so it rides through untouched and the
// case still reads as one note.
const PAD_LINE = '这是一句普通的说明文字。';
const PAD = new Array(C.SHORT_POST_LINES + 1).join(PAD_LINE + '\n');
assert.strictEqual(PAD.split('\n').length - 1, C.SHORT_POST_LINES,
  'the pad is exactly SHORT_POST_LINES non-blank lines, referenced through ' +
  'the exported constant so moving the threshold moves the pad with it');

// A keycap emoji-numeral, built from its codepoints: a digit, the variation
// selector, and the combining enclosing keycap. Written this way rather than
// pasted so the two invisible codepoints are visible in review and cannot be
// silently normalised out of the fixture by an editor.
function keycap(digit) {
  return String(digit) + String.fromCharCode(0xFE0F) +
    String.fromCharCode(0x20E3);
}
assert.strictEqual(keycap(1).length, 3,
  'sanity: a keycap really is three UTF-16 units — digit, VS16, U+20E3');

testCase('S1 an emoji-numeral run becomes an ordered list', function () {
  const src = keycap(1) + ' 先烧水 ' + keycap(2) + ' 下面 ' + keycap(3) + ' 捞出';
  const out = C.structureBody(src, null);
  assert.strictEqual(out.text, '1. 先烧水\n2. 下面\n3. 捞出',
    'a run of keycap emoji numerals is the author numbering her own steps, ' +
    'so it becomes a real ordered list, one step per item (D-03). The ' +
    'marker is scaffolding and is dropped on the OUTPUT side exactly as the ' +
    'normalizer drops it on the COMPARE side — which is why the keycap ' +
    'never leaves a stray digit token behind on either side.');
  assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings), true,
    'and every word survives in order (D-04)');
  assert.deepStrictEqual(out.addedHeadings, [],
    'no heading is invented by a list conversion');
  assert.strictEqual(C.wordsPreserved(src, dropAWord(out.text), []), false,
    'the paired counter-assertion: a dropped word still makes the guard red');
});

testCase('S2 a checkmark run becomes a bulleted list', function () {
  const src = '✅高蛋白 ✅低卡 ✅好吃';
  const out = C.structureBody(src, null);
  assert.strictEqual(out.text, '- 高蛋白\n- 低卡\n- 好吃',
    'a repeated checkmark is the author marking points, not writing prose ' +
    '(D-03) — one point per item');
  assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings), true,
    'and every word survives in order (D-04)');
});

testCase('S3 a bullet-character run becomes a bulleted list', function () {
  const inline = '・毛线 ・棒针 ・花样';
  const outInline = C.structureBody(inline, null);
  assert.strictEqual(outInline.text, '- 毛线\n- 棒针\n- 花样',
    'the katakana middle dot used as a repeated item marker is a list ' +
    '(D-03), whether the author crammed the run onto one line...');
  assert.strictEqual(
    C.wordsPreserved(inline, outInline.text, outInline.addedHeadings), true,
    'and it is word-preserving (D-04)');

  const across = '・毛线\n・棒针\n・花样';
  const outAcross = C.structureBody(across, null);
  assert.strictEqual(outAcross.text, '- 毛线\n- 棒针\n- 花样',
    '...or spread it across consecutive lines — the same signal, the same ' +
    'answer');
  assert.strictEqual(
    C.wordsPreserved(across, outAcross.text, outAcross.addedHeadings), true,
    'and that spelling is word-preserving too');

  const already = '- 毛线\n- 棒针\n- 花样';
  assert.strictEqual(C.structureBody(already, null).text, already,
    'A SINGLE LEADING HYPHEN ON ITS OWN LINE IS ALREADY A MARKDOWN LIST ' +
    'ITEM AND IS LEFT ALONE — re-marking it would be layering a second pass');
});

testCase('S4 an inline ordinal run becomes an ordered list', function () {
  const line = '做法：1. 先把水烧开备用 2. 下面煮三分钟捞出 3. 过冷水沥干装盘 ' +
    '4. 拌上酱汁开吃';
  const src = PAD + line;
  const out = C.structureBody(src, null);
  assert.strictEqual(out.text, PAD + '## 做法\n\n1. 先把水烧开备用\n' +
    '2. 下面煮三分钟捞出\n3. 过冷水沥干装盘\n4. 拌上酱汁开吃',
    'ordinals appearing MID-LINE are a real ordered list the author already ' +
    'numbered (D-03), and markdown would otherwise render the whole run as ' +
    'ONE list item — a wall wearing a list item\'s clothes');
  assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings), true,
    'and every word survives in order (D-04)');

  const measure = '1.5 cups flour and 2.5 cups milk and a pinch of salt';
  assert.strictEqual(C.structureBody(measure, null).text, measure,
    'THE PAIRED NEGATIVE, AND IT MUST STAY RED: a numeric measurement is ' +
    'NOT an ordinal marker. The ordinal only counts when whitespace or end ' +
    'of line follows it, and without that lookahead "1.5 cups" is eaten. ' +
    'T7 asserts the guard side of the same trap; this asserts the transform ' +
    'side.');
});

testCase('S5 the enumeration comma splits a run; the PROSE comma never does',
  function () {
    const src = PAD + '食材：菜花、芝士、面条、橄榄油';
    const out = C.structureBody(src, null);
    assert.strictEqual(out.text,
      PAD + '## 食材\n\n- 菜花\n- 芝士\n- 面条\n- 橄榄油',
      'the Chinese ENUMERATION comma is a list separator after a colon ' +
      'label — it is what the author uses to enumerate (D-03)');
    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true, 'and every word survives in order (D-04)');

    const prose = PAD + '食材：今天买了菜花，芝士，还有面条，都很新鲜';
    const outProse = C.structureBody(prose, null);
    assert.strictEqual(outProse.text,
      PAD + '## 食材\n\n今天买了菜花，芝士，还有面条，都很新鲜',
      'THE FULLWIDTH PROSE COMMA IS NEVER A LIST SEPARATOR. It was measured ' +
      'at 75,400 occurrences across the live corpus as ordinary sentence ' +
      'punctuation; splitting on it would shred running prose, which D-03 ' +
      'forbids. The label still promotes — the sentence under it does not ' +
      'become items.');
    assert.strictEqual(outProse.text.indexOf('- 芝士'), -1,
      'stated the other way round, so a future edit to the separator set ' +
      'fails here loudly rather than quietly re-cutting her sentences');
    assert.strictEqual(C.RUN_SEPARATORS.indexOf('，'), -1,
      'and the omission is pinned in the constant itself — measured, not ' +
      'overlooked');
  });

// The one paragraph S6 and S6b share. Factored out so "the SAME paragraph"
// is a fact about the file rather than a claim in a comment.
const S6_PARAGRAPH = '这是一段完全没有任何信号的普通文字只是记录一下当时的心情和' +
  '想法以及那天下午窗外的样子。';

testCase('S6 an unsignalled paragraph UNDER the threshold is byte-identical',
  function () {
    const src = PAD + S6_PARAGRAPH;
    const out = C.structureBody(src, null);
    assert.strictEqual(out.text, src,
      // ---- RATIONALE RE-CUT BY 26.88-13 -------------------------------------
      // WHAT STILL HOLDS, and it is most of what this case was ever for: no
      // SIGNAL is present. No colon label, no marker run, no ordinal, no pin.
      // So no heading is emitted, no bullet is emitted, and nothing is
      // restructured. D-03's marker-run, colon and ordinal rules are unchanged
      // and this body still does not fire one of them.
      //
      // WHAT CHANGED: D-15 (owner call, 2026-08-01) activated the CONTEXT
      // <deferred> entry "Breaking up long unsignalled prose paragraphs" on
      // its OWN stated trigger — "revisit only if the real corpus turns out to
      // be mostly unsignalled walls" — which the live measurement fired.
      // Sentence-final punctuation IS author signal, thinner than the others
      // but real, so this body no longer proves "NEVER SPLIT RUNNING PROSE" in
      // general. It proves it BELOW THE THRESHOLD. The suppressor here is
      // SENTENCE_BREAK_MIN, and S6b is what makes that checkable rather than
      // assertable — without the twin, this case alone is equally satisfied by
      // a rule that never fires at all.
      //
      // AND THE "RESTRUCTURES HER OWN WRITING" OBJECTION IS RESOLVED,
      // ACCURATELY. CONTEXT credits D-06 with foreclosing it. D-06 did NOT:
      // `source: personal` was measured to miss her own writing entirely —
      // 152 of the 536 eligible notes carried no frontmatter block at all,
      // 143 of them phone captures in the adapter folder, including the two
      // largest walls in the whole pool (her autobiography and her
      // workplace-case reflection). PLAN 10 (D-19) closed that gap by
      // defaulting an absent frontmatter block to PERSONAL, and D-15 ships
      // strictly behind that close and never in front of it. Naming D-06 as
      // the foreclosure would be the convenient answer, and it is the wrong
      // one.
      'THIS IS THE CASE THAT PROVES "NEVER SPLIT RUNNING PROSE ON A GUESS" — ' +
      'BELOW THE THRESHOLD. No D-03 signal is present, so no heading and no ' +
      'bullet is emitted; and the block is under SENTENCE_BREAK_MIN, so D-15 ' +
      'declines it too. The suppressor here is the THRESHOLD, and S6b below ' +
      'is what proves that rather than asserting it. D-15 activated the ' +
      'CONTEXT-deferred idea on its own stated trigger; its "restructures her ' +
      'OWN writing" objection was closed by plan 10 (D-19), NOT by D-06 — ' +
      'D-06 was measured to miss 152 no-frontmatter notes, 143 of them her ' +
      'own phone captures.');
    assert.strictEqual(out.addedHeadings.length, 0,
      'and nothing is declared as added, because nothing was added');
    assert.ok((PAD + S6_PARAGRAPH).length < C.SENTENCE_BREAK_MIN,
      'and the reason is stated as arithmetic, from the exported constant: ' +
      'the whole body is one block of ' + (PAD + S6_PARAGRAPH).length +
      ' characters');
  });

testCase('S6b THE POSITIVE TWIN: the same paragraph, over the threshold',
  function () {
    // Sized from the exported constant, never from the literal 600 — the same
    // discipline PAD takes with SHORT_POST_LINES at :1044.
    let line = '';
    while ((PAD + line).length <= C.SENTENCE_BREAK_MIN) { line += S6_PARAGRAPH; }
    const copies = line.length / S6_PARAGRAPH.length;
    assert.ok(copies > 1 && copies === Math.round(copies),
      'sanity: the body is a whole number of copies of S6\'s own paragraph (' +
      copies + ')');

    const src = PAD + line;
    const out = C.structureBody(src, null);
    assert.strictEqual(out.text,
      PAD + new Array(copies + 1).join(S6_PARAGRAPH + '\n\n').replace(/\n\n$/, ''),
      'BECAUSE WITHOUT THIS CASE, S6 ALONE IS CONSISTENT WITH A RULE THAT ' +
      'NEVER FIRES AT ALL. The same prose, the same absence of any D-03 ' +
      'signal, the same sentence punctuation — and over ' +
      'SENTENCE_BREAK_MIN it DOES break, at the ends the author typed. That ' +
      'is what makes the suppressor in S6 the THRESHOLD rather than the ' +
      'absence of a signal (D-15/D-20).');
    assert.strictEqual(out.addedHeadings.length, 0,
      'still no heading — a blank line is the entire intervention');
    assert.strictEqual(out.text.indexOf('- '), -1, 'and still no bullet');
    assert.strictEqual(out.text.replace(/\s+/g, ''), src.replace(/\s+/g, ''),
      'and stripped of whitespace the two sides are identical (law 4)');
    assert.strictEqual(C.wordsPreserved(src, out.text, []), true,
      'every word survives in order (D-04)');
  });

// ---- A1-A3: D-03a at real density, and its two negatives (task 2) ----------

testCase('A1 the 2,044-character single-line specimen, at real density',
  function () {
    const DENSE_LABELS = [
      'P1' + EN_DASH + '3' + BAR + 'Alpha Cafe',
      'P4' + EN_DASH + '6' + BAR + 'Beta Bistro',
      'P7' + EN_DASH + '9' + BAR + 'Gamma Grill',
      'P10' + EN_DASH + '12' + BAR + 'Delta Diner'
    ];
    const CHUNK = '很好吃的一家店环境安静服务也不错价格合理下次还会再来';
    const DENSE_TEXT = new Array(16).join(CHUNK);

    const src = DENSE_LABELS.map(function (label) {
      return PIN + label + ' ' + DENSE_TEXT;
    }).join(' ');
    const want = DENSE_LABELS.map(function (label) {
      return '## ' + label + '\n\n' + DENSE_TEXT;
    }).join('\n\n');

    assert.strictEqual(src.indexOf('\n'), -1,
      'the specimen is ONE line, which is exactly what makes it a wall');
    assert.ok(Array.from(src).length >= 1500,
      'sanity: the fixture really is at the density of the verified ' +
      '2,044-character live specimen (built inline from its SHAPE — nothing ' +
      'here reads the live library)');

    const out = C.structureBody(src, null);
    assert.strictEqual(out.text, want,
      'four pin-marked sections on one line become four headings and four ' +
      'paragraphs, each heading the author\'s own label (D-03a)');
    assert.strictEqual(out.text.split('## ').length - 1, 4,
      'exactly four headings — not three, not five');
    assert.strictEqual(out.addedHeadings.length, 0,
      'ALL FOUR ARE PROMOTED, so no allowance is needed and the guard runs ' +
      'with an empty added list');
    assert.strictEqual(C.wordsPreserved(src, out.text, []), true,
      'no word is lost or reordered at this density (D-04)');
    assert.strictEqual(C.wordsPreserved(src, dropAWord(out.text), []), false,
      'and the paired counter-assertion still bites');
  });

testCase('A2 a lone pin marker is not a signal', function () {
  let line = '今天路过';
  for (let i = 0; i < C.MARKER_RUN_MIN - 1; i++) {
    line += PIN + 'Alpha Cafe 坐了一会儿喝了一杯茶看了看窗外的行人和树木很安静很舒服';
  }
  assert.ok(Array.from(line).length > C.ITEM_MAX_CHARS,
    'sanity: the line is long enough that rule 10\'s short-post suppressor ' +
    'is NOT what is keeping it intact — this case must be about the run ' +
    'threshold and nothing else');
  const out = C.structureBody(line, null);
  assert.strictEqual(out.text, line,
    'A RUN NEEDS AT LEAST MARKER_RUN_MIN MARKERS. This case carries ' +
    'MARKER_RUN_MIN minus one — referenced through the exported constant, ' +
    'so moving the threshold moves this fixture with it instead of leaving ' +
    'a stale number that passes for the wrong reason. One decorative pin ' +
    'mid-sentence must never split running prose (D-03).');
  assert.strictEqual(out.addedHeadings.length, 0,
    'and nothing is added');
});

testCase('A3 a fullwidth bar inside a table row is untouched', function () {
  const tbl = [
    '| 位置 | 店名 |',
    '| --- | --- |',
    '| ' + PIN + 'P2' + EN_DASH + '5' + BAR + 'Alpha | Saigon |',
    '| ' + PIN + 'P6' + EN_DASH + '8' + BAR + 'Beta | Hanh |'
  ].join('\n');
  const src = PAD + tbl + '\n';
  const out = C.structureBody(src, null);
  assert.ok(out.text.indexOf(tbl) !== -1,
    'the table span is BYTE-IDENTICAL across the transform — the zone map ' +
    'runs before every signal rule, so neither the pin rule nor the bar ' +
    'rule can fire inside a hands-off zone (D-07). This matters more for ' +
    'the bar than for anything else in the phase: after Unicode ' +
    'compatibility normalisation the fullwidth bar folds to the ASCII pipe, ' +
    'which IS table structure.');
  assert.strictEqual(out.text.split('## ').length - 1, 0,
    'and no heading is emitted anywhere in this body');
  assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings), true,
    'and the whole body still preserves every word in order (D-04)');
});

// ---- B1-B3: the two safety bounds (task 3) ----------------------------------

testCase('B1 vault rule 10 — a short post gets no heading', function () {
  const short = '食材：菜花、芝士、面条';
  const outShort = C.structureBody(short, null);
  assert.strictEqual(outShort.text.split('## ').length - 1, 0,
    'ZERO headings on a short post — the vault spec\'s own suppressor, ' +
    'rule 10 verbatim: "Don\'t add headers if the post is short — for posts ' +
    'under ~5 short lines, skip the headers, just clean up line breaks."');
  assert.strictEqual(outShort.text, short,
    'and with no marker run present there is nothing else to do, so the ' +
    'body comes back exactly as saved');

  const long = PAD + short;
  const outLong = C.structureBody(long, null);
  assert.ok(outLong.text.indexOf('## 食材') !== -1,
    'THE SAME LINE promotes once the post is no longer short — which is ' +
    'what proves the suppressor is doing the work above, and not the ' +
    'absence of a signal');

  const bullets = '・毛线 ・棒针 ・花样';
  assert.strictEqual(C.structureBody(bullets, null).text,
    '- 毛线\n- 棒针\n- 花样',
    'and bullet conversion STILL APPLIES on a short post, because rule 10 ' +
    'suppresses headers, not line breaks');
});

testCase('B2 a body above the ceiling renders exactly as saved', function () {
  const unit = 'a b c 一二三 ';
  let big = '';
  while (big.length <= C.MAX_REFORMAT_BYTES) { big += unit; }
  assert.ok(big.length > C.MAX_REFORMAT_BYTES,
    'sanity: the fixture really is over the ceiling');

  let out = null;
  assert.doesNotThrow(function () { out = C.structureBody(big, null); },
    'the oversize path throws NOTHING — law-4-safe by construction, ' +
    'because rendering the note as saved is always a valid answer');
  assert.strictEqual(out.text, big,
    'a body above MAX_REFORMAT_BYTES is returned BYTE-IDENTICAL — this is ' +
    'the answer to the single-long-line denial-of-service row ' +
    '(T-26.88-04): an unbounded input is the only way a linear-time ' +
    'transform still becomes a stall in a reading surface');
  assert.strictEqual(out.addedHeadings.length, 0,
    'and the added-headings list is empty, so the guard has nothing to ' +
    'subtract on a path where nothing was added');
});

testCase('B3 a 10 KB single-line CJK paragraph completes inside its budget',
  function () {
    // Generous over the measured 66 ms worst single note in the live
    // library. The assertion is about ALGORITHMIC CLASS, not machine speed:
    // a linear implementation passes this anywhere, a quadratic one cannot.
    const TIME_BUDGET_MS = 1000;
    const SENTENCE = '这是一段很长的正文没有任何标点提示就这样一直写下去。';
    let one = '';
    while (one.length < 10000) { one += SENTENCE; }
    assert.ok(one.length >= 10000,
      'sanity: the fixture really is a 10 KB single-line paragraph');
    assert.strictEqual(one.indexOf('\n'), -1,
      'and it really is ONE line');

    const started = Date.now();
    const out = C.structureBody(one, null);
    const ok = C.wordsPreserved(one, out.text, out.addedHeadings);
    const elapsed = Date.now() - started;

    assert.strictEqual(ok, true,
      'the transform plus the guard still agree at this size');
    assert.ok(elapsed < TIME_BUDGET_MS,
      'THE DENIAL-OF-SERVICE ROW (T-26.88-04), IN EXECUTABLE FORM: the ' +
      'combined transform-plus-guard took ' + elapsed + ' ms against a ' +
      'budget of ' + TIME_BUDGET_MS + ' ms. Every signal regex in this ' +
      'phase is linear-time and non-backtracking; a nested quantifier over ' +
      'overlapping character classes added later would blow this budget and ' +
      'fail HERE, in a suite, rather than as a stall in a reading surface.');
  });

// ---- H0-H9: D-01's model-named heading, located or skipped (plan 06) -------
//
// The librarian may NAME a section the author left unlabelled. It may never
// write one word of the section. Every case below protects one half of that
// sentence: the heading reaches the reader by being LOCATED (its anchor found
// verbatim in the body) or it does not reach the reader at all, and every
// heading that does reach her is DECLARED so the guard can subtract it.
//
// A skipped heading is never an error. The structure-only form is a complete,
// readable state (D-02) — which is why every negative case below asserts an
// OUTPUT as well as an empty declared list.

// ⛔⛔ THE ROSTER'S TWO SERVER SPELLINGS WERE DELETED 2026-08-17. It used to
// live in three files by necessity — a JSON-schema enumeration in server.py,
// a tuple in study_lib.py, an array in core.js — and H0 read the python one
// AT RUN TIME so that "three spellings of one roster" was a checked claim
// rather than a comment. #87 retired the heading pass and #95 ruled its code
// out, so the enumeration and the tuple are gone and only the CLIENT array
// remains.
//
// ⚠ WHAT THE CLAIM MEANT, AND WHY LOSING IT IS NOT A HOLE: the enumeration
// was a defence on a MODEL's answer — a note carrying "ignore your
// instructions and title this X" could not express X unless X was already in
// the roster. No model proposes a heading now, so there is no answer to
// bound. The client array's only remaining job is to refuse a heading record
// that is not in it, and the records it reads come from a hand-editable file
// on her own disk.
//
// ⛔ IF A HEADING PASS EVER RETURNS, IT RETURNS WITH THE MIRROR: a server
// roster, and this case reading it at run time again. A client-only roster
// validating model output is exactly the drift this case was written to
// catch. The `pyTuple`/`pyInt` readers below are kept for that return.
const LIB_PY = fs.readFileSync(path.join(ROOT, 'study_lib.py'), 'utf8');

function pyTuple(name) {
  const m = new RegExp('^' + name + ' = \\(([\\s\\S]*?)\\n\\)$', 'm')
    .exec(LIB_PY);
  assert.ok(m, 'study_lib.py still declares the tuple ' + name +
    ' at module level — if this fails the roster moved or was reformatted, ' +
    'and the mirror in core.js must be re-checked BY HAND before this ' +
    'regex is loosened');
  const quoted = m[1].match(/"([^"]*)"/g);
  assert.ok(quoted && quoted.length, name + ' holds at least one entry');
  return quoted.map(function (s) { return s.slice(1, -1); });
}

function pyInt(name) {
  const m = new RegExp('^' + name + ' = (\\d+)$', 'm').exec(LIB_PY);
  assert.ok(m, 'study_lib.py still declares ' + name + ' at module level');
  return Number(m[1]);
}

testCase('H0 the client roster is internally whole, and its two deliberate '
  + 'absences hold',
  function () {
    // ⚠ THE SERVER HALVES ARE GONE (see the block above), so this case can no
    // longer compare the client's roster to anything. What it still asserts
    // is everything that does not need a counterpart: the whole is exactly
    // its two halves, and the two entries D-07.4a rules OUT stay out.
    assert.ok(C.HEADING_VOCAB_CHINESE.length > 0
      && C.HEADING_VOCAB_ENGLISH.length > 0,
      'both halves of the client roster still carry entries');
    assert.deepStrictEqual(C.HEADING_VOCAB,
      C.HEADING_VOCAB_CHINESE.concat(C.HEADING_VOCAB_ENGLISH),
      'the whole roster is exactly its two halves, concatenated');
    assert.strictEqual(C.HEADING_VOCAB.indexOf('Comments'), -1,
      '`Comments` is DELIBERATELY ABSENT: it is written into notes by the ' +
      'owner\'s own tooling, not by an author, and D-07.4a turns on that ' +
      'distinction — proposing it would be the app naming a section it wrote');
    assert.strictEqual(C.HEADING_VOCAB.indexOf('Related'), -1,
      '...and the same for `Related`, which vault_linker.py writes');
    assert.ok(C.ANCHOR_MIN_CHARS < C.ANCHOR_MAX_CHARS,
      'sanity: the anchor band is a band');
  });

// The phase's normative before/after (26.88-UI-SPEC § "The Reformatted
// Body"), now WITH provenance 2. The anchor is the method sentence's opening
// characters — a quote the author wrote, copied character for character.
const WORKED_ANCHOR = '然后全部用搅拌机搅拌';
const WORKED_RECORD = { heading: '做法', anchor: WORKED_ANCHOR };
const WORKED_HEADED = [
  '## 食材（一人份）',
  '',
  '- 5-7朵菜花',
  '- 21g帕玛森芝士',
  '- 21g Pecorino芝士',
  '',
  '## 做法',
  '',
  '然后全部用搅拌机搅拌成可以拌面的酱，放上你的煎鸡胸，开造吧！'
].join('\n');

testCase('H1 the FULL worked example — promoted heading, list, named heading',
  function () {
    assert.ok(Array.from(WORKED_ANCHOR).length >= C.ANCHOR_MIN_CHARS &&
      Array.from(WORKED_ANCHOR).length <= C.ANCHOR_MAX_CHARS,
      'sanity: the anchor sits inside the band both sides re-check');
    assert.strictEqual(WORKED_BEFORE.split(WORKED_ANCHOR).length - 1, 1,
      'sanity: the anchor occurs EXACTLY once, which is the only case the ' +
      'server ever forwards (anchor_unique != 1 drops, invented or ambiguous)');

    const out = C.structureBody(WORKED_BEFORE, [WORKED_RECORD]);
    assert.strictEqual(out.text, WORKED_HEADED,
      'THIS IS THE PHASE\'S NORMATIVE BEFORE/AFTER, byte for byte against ' +
      'the UI-SPEC AFTER block: the label the author wrote before the colon ' +
      'is PROMOTED, the separator run under it becomes three bullets, and ' +
      'the method section — which the author never labelled — gets the ' +
      'model-named heading placed exactly where the anchor is. Breaking the ' +
      'line AT the anchor is what terminates the ingredient run and starts ' +
      'the method section; without that break the method sentence rides on ' +
      'the last bullet, which is the structure-only form T1 pins.');
    assert.deepStrictEqual(out.addedHeadings, ['做法'],
      'EXACTLY ONE declared heading: the model-named one. The promoted ' +
      '`## 食材（一人份）` is absent from the list because its words came ' +
      'from the source — and that asymmetry is what makes a transform that ' +
      'quietly promoted invented text fail its own guard.');
    assert.strictEqual(
      C.wordsPreserved(WORKED_BEFORE, out.text, out.addedHeadings), true,
      'and every word she saved survives, in order, once the ONE declared ' +
      'heading run is subtracted (D-04)');
    assert.strictEqual(out.text.split('## ').length - 1, 2,
      'two headings in the output and not a third — the transform adds one ' +
      'and promotes one');
  });

testCase('H2 an anchor that is not in the body yields no heading', function () {
  let out = null;
  assert.doesNotThrow(function () {
    out = C.structureBody(WORKED_BEFORE,
      [{ heading: '做法', anchor: '不存在的一段引文' }]);
  }, 'a heading that cannot be located throws NOTHING — the failure mode of ' +
    'every uncertainty on this path is no heading, never an error');
  assert.strictEqual(out.text, WORKED_AFTER,
    'the output is the STRUCTURE-ONLY form, which is a complete readable ' +
    'state and not a degraded one (D-02) — the deterministic half of the ' +
    'transform never depends on the model half');
  assert.deepStrictEqual(out.addedHeadings, [],
    'and nothing is declared, because nothing was added');
  assert.strictEqual(
    C.wordsPreserved(WORKED_BEFORE, out.text, out.addedHeadings), true,
    'and the guard is green on the skip path, so a missing heading never ' +
    'costs her the structure');
});

// THE CAP-BOUNDARY BRANCH, stated honestly. A plain prefix cut can never on
// its own orphan an anchor: every substring of body[:CAP] is a substring of
// body. What orphans it is THE NOTE CHANGING between the scan and the read —
// she edited the tail after the librarian read it — and that is the branch
// this case builds. Skipping is the correct answer, and it is silent.
const H3_SCANNED = PAD + '做法是这样的：先把菜花洗干净然后全部用搅拌机搅拌成酱汁备用';
const H3_CAP = Array.from(H3_SCANNED).length - 3;
const H3_EXCERPT = Array.from(H3_SCANNED).slice(0, H3_CAP).join('');
const H3_ANCHOR = Array.from(H3_EXCERPT).slice(-12).join('');
const H3_NOW = Array.from(H3_SCANNED).slice(0, H3_CAP - 8).join('') +
  '改成了另一种写法。';

testCase('H3 an anchor verified at the excerpt cap no longer matches',
  function () {
    assert.strictEqual(H3_EXCERPT.split(H3_ANCHOR).length - 1, 1,
      'sanity: the anchor was UNIQUE in the excerpt the model was actually ' +
      'sent — this is the state the server certified before it stored the ' +
      'record, and it is why the record exists at all');
    assert.strictEqual(H3_NOW.indexOf(H3_ANCHOR), -1,
      'sanity: and it is simply not in the note any more');

    let out = null;
    assert.doesNotThrow(function () {
      out = C.structureBody(H3_NOW, [{ heading: '做法', anchor: H3_ANCHOR }]);
    }, 'a stale anchor is not an exception — the note changed since the ' +
      'scan, which is ordinary, and the reader must never see a consequence');
    assert.deepStrictEqual(out.addedHeadings, [],
      'no heading is placed on a stale anchor. The alternative — placing it ' +
      'somewhere approximate — is the one thing D-01 forbids outright: a ' +
      'heading over the wrong words.');
    assert.ok(out.text.indexOf('## 做法是这样的') !== -1,
      'and the PROMOTED half still fires, so the note is still laid out — ' +
      'the two provenances are independent by construction');
    assert.strictEqual(C.wordsPreserved(H3_NOW, out.text, out.addedHeadings),
      true, 'and the guard is green (D-04)');
  });

// One anchor per hands-off kind, each landing INSIDE the zone. A heading may
// be emitted immediately BEFORE such a block; it is never emitted inside one,
// because the zone's own bytes are already structured and a `##` line dropped
// into the middle of a fence, a table, a quote run or an image line destroys
// exactly what D-07 exists to protect.
const H4_ANCHOR = '蓑衣黄瓜凤梨酥';
const H4_ZONES = [
  ['a fenced block', PAD + '```js\nvar ' + H4_ANCHOR + ' = 1;\n```\n后面还有一句普通的说明。',
    'var ' + H4_ANCHOR],
  ['a markdown table',
    PAD + '| 位置 | 店名 |\n| --- | --- |\n| ' + H4_ANCHOR + ' | Saigon |\n',
    H4_ANCHOR],
  ['a blockquote run', PAD + '> ' + H4_ANCHOR + '真的很好吃\n', H4_ANCHOR],
  ['an image line', PAD + '![[' + H4_ANCHOR + '.jpg]]\n', H4_ANCHOR]
];

testCase('H4 an anchor inside a hands-off zone yields no heading', function () {
  assert.ok(Array.from(H4_ANCHOR).length >= C.ANCHOR_MIN_CHARS,
    'sanity: the shared anchor is inside the band, so this case is about ' +
    'the ZONE and nothing else');
  H4_ZONES.forEach(function (zone) {
    const label = zone[0];
    const src = zone[1];
    const anchor = zone[2];
    assert.ok(src.indexOf(anchor) !== -1,
      'sanity: the anchor really is present in ' + label + ' — this case ' +
      'must fail for the zone reason, never because the anchor was missing');
    let out = null;
    assert.doesNotThrow(function () {
      out = C.structureBody(src, [{ heading: '技巧', anchor: anchor }]);
    }, 'refusing a placement inside ' + label + ' throws nothing');
    assert.deepStrictEqual(out.addedHeadings, [],
      'no heading is placed when the anchor falls inside ' + label +
      ' (D-07 / T-26.88-18) — the zone map runs before placement precisely ' +
      'so a heading can never be inserted into an already-structured block');
    assert.strictEqual(out.text.split('## ').length - 1, 0,
      'and no heading line appears anywhere in the output for ' + label);
    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true, 'and the body still preserves every word in order (D-04)');
  });
});

testCase('H5 the SAME heading, undeclared, trips the guard', function () {
  const out = C.structureBody(WORKED_BEFORE, [WORKED_RECORD]);
  assert.strictEqual(out.addedHeadings.length, 1,
    'sanity: a heading really was placed, so the counter-assertion below is ' +
    'testing something');
  assert.strictEqual(
    C.wordsPreserved(WORKED_BEFORE, out.text, out.addedHeadings), true,
    'declared, it passes...');
  assert.strictEqual(C.wordsPreserved(WORKED_BEFORE, out.text, []), false,
    '...and UNDECLARED, the identical output makes the guard go RED. THIS ' +
    'IS THE PIN THAT MAKES D-01 CHECKABLE: the allowance is not a rubber ' +
    'stamp on anything that looks like a heading — it is the exact list the ' +
    'transform produced, so a transform that emitted a word it did not ' +
    'declare fails its own guard and the note renders as saved.');
});

testCase('H6 a duplicate anchor places at the FIRST occurrence', function () {
  const src = PAD + '凤梨酥樟脑丸讲的是准备工作\n中间一句普通的说明文字\n' +
    '凤梨酥樟脑丸讲的是收尾工作';
  assert.strictEqual(src.split('凤梨酥樟脑丸').length - 1, 2,
    'sanity: the anchor occurs twice in the FULL body. The server only ever ' +
    'certified uniqueness in the capped excerpt it sent, so this case is ' +
    'real: ambiguous here, unambiguous there.');
  const out = C.structureBody(src, [{ heading: '用具', anchor: '凤梨酥樟脑丸' }]);
  assert.deepStrictEqual(out.addedHeadings, ['用具'],
    'one heading is placed and declared');
  assert.strictEqual(out.text.split('## 用具').length - 1, 1,
    'exactly ONE heading line — never one per occurrence');
  const at = out.text.indexOf('## 用具');
  const first = out.text.indexOf('凤梨酥樟脑丸');
  assert.ok(at !== -1 && at < first,
    'and it sits before the FIRST occurrence — the client must be ' +
    'DETERMINISTIC about the case that is ambiguous only in the full body, ' +
    'not clever about it');
  assert.strictEqual(out.text.slice(at + '## 用具'.length, first).trim(), '',
    '...with nothing but whitespace between the heading and the words it ' +
    'names, so "immediately before" is a checked claim');
  assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings), true,
    'and every word survives in order (D-04)');
});

testCase('H7 two anchored headings are both placed, in document order',
  function () {
    const src = PAD + '凤梨酥樟脑丸讲的是准备工作\n琉璃盏苜蓿草讲的是收尾工作';
    // Handed over in REVERSE document order on purpose: placing one must not
    // shift the other's match, and the OUTPUT order is the document's, never
    // the payload's.
    const out = C.structureBody(src, [
      { heading: '配色', anchor: '琉璃盏苜蓿草' },
      { heading: '用具', anchor: '凤梨酥樟脑丸' }
    ]);
    assert.strictEqual(out.addedHeadings.length, 2,
      'both headings are declared — the allowance list is what the guard ' +
      'subtracts, so a heading that reached the page and not the list would ' +
      'trip it');
    assert.ok(out.addedHeadings.indexOf('用具') !== -1 &&
      out.addedHeadings.indexOf('配色') !== -1,
      '...and it is these two');
    const firstAt = out.text.indexOf('## 用具');
    const secondAt = out.text.indexOf('## 配色');
    assert.ok(firstAt !== -1 && secondAt !== -1,
      'both reach the output');
    assert.ok(firstAt < secondAt,
      'IN DOCUMENT ORDER, not payload order — each anchor is re-located in ' +
      'the text as it stands, so an earlier insertion cannot move a later ' +
      'anchor out from under itself');
    assert.strictEqual(C.wordsPreserved(src, out.text, out.addedHeadings),
      true, 'and both declared runs subtract cleanly (D-04)');
    assert.strictEqual(C.wordsPreserved(src, out.text, ['用具']), false,
      'while declaring only ONE of the two makes the guard red — the ' +
      'allowance is exact, never approximate');
  });

// The client's own two refusals, mirroring the server's. FAIL-CLOSED TWICE
// is the point: a heading outside the roster or an anchor outside the band
// never reaches here because the server already refused it — and if a
// hand-edited or corrupted notebook produces one anyway, it is dropped again.
let H8_LINE = '凤梨酥樟脑丸这一段讲的是准备工作';
while (Array.from(H8_LINE).length <= C.ANCHOR_MAX_CHARS) {
  H8_LINE += '接着还有一些别的说明文字';
}
const H8_SRC = PAD + H8_LINE;
const H8_STRUCTURE_ONLY = C.structureBody(H8_SRC, null).text;
const H8_SHORT_ANCHOR = Array.from('凤梨酥樟脑丸')
  .slice(0, C.ANCHOR_MIN_CHARS - 1).join('');
const H8_LONG_ANCHOR = Array.from(H8_LINE)
  .slice(0, C.ANCHOR_MAX_CHARS + 1).join('');

testCase('H8 an unusable record is dropped, and the structure still renders',
  function () {
    assert.strictEqual(H8_SRC.indexOf(H8_SHORT_ANCHOR) !== -1, true,
      'sanity: the under-band anchor IS present in the body, so the band is ' +
      'what refuses it and not its absence');
    assert.strictEqual(H8_SRC.indexOf(H8_LONG_ANCHOR) !== -1, true,
      'sanity: and so is the over-band one');

    [[null, 'a null record'],
      [undefined, 'a missing record'],
      ['做法', 'a bare string where a record was expected'],
      [{ heading: '做点什么再说吧', anchor: '凤梨酥樟脑丸' },
        'a heading outside the roster — the injection case: prose cannot ' +
        'reach the page through this field because the field only accepts ' +
        'roster members'],
      [{ heading: '## 做法', anchor: '凤梨酥樟脑丸' },
        'a roster word carrying its own markdown marker — membership is ' +
        'EXACT, never a prefix and never stripped'],
      [{ heading: '', anchor: '凤梨酥樟脑丸' }, 'an empty heading'],
      [{ anchor: '凤梨酥樟脑丸' }, 'a record with no heading at all'],
      [{ heading: '技巧' }, 'a record with no anchor at all'],
      [{ heading: '技巧', anchor: null }, 'a null anchor'],
      [{ heading: '技巧', anchor: H8_SHORT_ANCHOR },
        'an anchor under ANCHOR_MIN_CHARS — too short to mean anything, so ' +
        'placement would be a guess'],
      [{ heading: '技巧', anchor: H8_LONG_ANCHOR },
        'an anchor over ANCHOR_MAX_CHARS — a paragraph, not a quote']
    ].forEach(function (pair) {
      let out = null;
      assert.doesNotThrow(function () {
        out = C.structureBody(H8_SRC, [pair[0]]);
      }, 'refusing ' + pair[1] + ' throws nothing');
      assert.deepStrictEqual(out.addedHeadings, [],
        'no heading is declared for ' + pair[1]);
      assert.strictEqual(out.text, H8_STRUCTURE_ONLY,
        'and the output is byte-identical to the structure-only form for ' +
        pair[1] + ' — a refused record costs her nothing');
    });

    // ...and the positive control, so the loop above cannot be passing
    // because nothing in this fixture could ever place a heading.
    const good = C.structureBody(H8_SRC,
      [{ heading: '技巧', anchor: '凤梨酥樟脑丸' }]);
    assert.deepStrictEqual(good.addedHeadings, ['技巧'],
      'THE POSITIVE CONTROL: the same body, the same anchor, a roster ' +
      'heading — and it places. Without this the eleven refusals above ' +
      'would pass just as happily against a transform that never placed ' +
      'anything at all.');
    assert.strictEqual(
      C.wordsPreserved(H8_SRC, good.text, good.addedHeadings), true,
      'and it is word-preserving (D-04)');
  });

testCase('H9 a null or empty heading list is the ordinary structure-only path',
  function () {
    assert.strictEqual(C.structureBody(WORKED_BEFORE, null).text, WORKED_AFTER,
      'null means STRUCTURE-ONLY — the untidied path, and the common one');
    assert.strictEqual(C.structureBody(WORKED_BEFORE, []).text, WORKED_AFTER,
      '...and so does an empty list: a library with no librarian, a note ' +
      'that was never tidied, and a progress read that failed all render ' +
      'exactly the same, which is why no loading state exists (D-02)');
    assert.strictEqual(C.structureBody(WORKED_BEFORE, 'nonsense').text,
      WORKED_AFTER,
      '...and so does a value that is not a list at all — fail-closed on ' +
      'malformed input, the itemExcluded null-guard-first posture');
    assert.deepStrictEqual(C.structureBody(WORKED_BEFORE, []).addedHeadings,
      [], 'and nothing is declared on any of those paths');
  });

// ---- Q5/Q6: the open-span refusal, and the fullwidth comma ------------------
//
// D-14 (plan 12) will make a transform that splits inline markup FALL BACK and
// render the note as saved. That is correct, and on its own it is also a
// coverage loss: the seven live breaks the research inspected include
// `b4ead431896578e3`, the phase's own showcase note and the best free-prose
// wall reduction in the library. A guard alone would drop it out of the
// reformatted set entirely.
//
// Q5 closes all seven at their CAUSE instead: every one of them is a colon
// sitting inside an OPEN inline span, so promoteColonLabel simply refuses that
// promotion and every other promotion on the note still lands.
//
//   f752be221899dc4a / 5e33900d02961a8c  `## Logger.log('NOTE`   ()
//   b4ead431896578e3                     `## 正式开火（烹饪时间`  （）
//   43a109e00ef803c8                     `## 纪录片叫《地平线`    《》
//   eaff9a31b11c6a86 / 9d0911cc105f8805  kaomoji `_(:з」∠)_`     _ ()
//   be4c130e18a88359                     `## lazyweb_search {"query"`  {}
//
// `openSpanAt` is ONE helper serving TWO rules — this refusal, and D-15's
// split refusal in plan 13. It is written once and consumes NAMED rosters, so
// the guard in plan 12 and the refusal here can never read different sets.
//
// Q6 is one character in one character class: the sentence test rejected
// `。．！？!?；;…` but not the fullwidth comma `，`, which is how a
// 24-character prose sentence got promoted as a heading on 43a109e00ef803c8.

testCase('Q5-1a openSpanAt: the SYMMETRIC delimiters, one per roster member',
  function () {
    C.INLINE_MARKS.forEach(function (m) {
      const open = 'ab' + m + 'cd:ef' + m + 'gh';
      assert.strictEqual(C.openSpanAt(open, open.indexOf(':')), true,
        'a colon between an unclosed ' + JSON.stringify(m) + ' and its closer ' +
        'is INSIDE an open span. BECAUSE promoting there emits a heading that ' +
        'splits the pair across a block boundary, and a markdown pair cannot ' +
        'span a blank line — so it provably stops being a pair.');
    });
    assert.ok(C.INLINE_MARKS.indexOf('%%') !== -1,
      '`%%` is load-bearing in this roster and must NOT be dropped as "the ' +
      'renderer deletes it anyway": it is the only construct that catches F-1 ' +
      'at the structureBody seam, and dropping it regresses plan 12\'s ' +
      'invariant to catching two defects of three');
    assert.ok(C.INLINE_MARKS.indexOf('**') < C.INLINE_MARKS.indexOf('*'),
      'and the roster is LONGEST FIRST within a family, so a `**` is never ' +
      'counted as two `*`');
    assert.ok(C.INLINE_MARKS.indexOf('__') < C.INLINE_MARKS.indexOf('_'),
      '...same for `__` before `_`');
  });

testCase('Q5-1b openSpanAt: the ASYMMETRIC pairs, one per roster member',
  function () {
    C.INLINE_PAIRS.concat(C.SPAN_ONLY_PAIRS).forEach(function (p) {
      const open = 'ab' + p[0] + 'cd:ef' + p[1] + 'gh';
      assert.strictEqual(C.openSpanAt(open, open.indexOf(':')), true,
        'a colon inside an unclosed ' + JSON.stringify(p[0] + p[1]) +
        ' is INSIDE an open span (the （）, 《》 and () live breaks)');
    });

    assert.strictEqual(
      C.SPAN_ONLY_PAIRS.some(function (p) { return p[0] === '!['; }), true,
      '`![ ]` is SPAN-DETECTION ONLY and never pair counting, because `![x]` ' +
      'nests inside `[x]` and counting both would double-count it — and ' +
      'inline `![[…]]` image embeds mid-paragraph are exactly what ' +
      'structureBody\'s LINE-ANCHORED image branch does not cover (30 ' +
      'measured D-15 split points sit inside them)');
    assert.strictEqual(
      C.SPAN_ONLY_PAIRS.some(function (p) { return p[0] === '“'; }), true,
      '...and the curly quotes are not markdown constructs at all: they are ' +
      'span-like only for refusing a promotion or a split inside Chinese ' +
      'quoted speech (11 measured D-15 split points)');
    assert.strictEqual(
      C.INLINE_PAIRS.some(function (p) { return p[0] === '!['; }), false,
      'so `![ ]` must NOT be in INLINE_PAIRS, which plan 12\'s markupPreserved ' +
      'counts with');
  });

testCase('Q5-2 a CLOSED pair before the index does not make it "inside"',
  function () {
    // NOT the research's full `Experiment_Planning_Worksheet`: that label is 29
    // codepoints and LABEL_MAX_CHARS already refuses it, so the case would
    // have passed without openSpanAt existing. Shortened to 22 so the ONLY
    // thing it can be testing is the open-span question.
    const line = 'Exp_Planning_Worksheet：说明文档在这里';
    assert.ok(Array.from(line.split('：')[0]).length <= C.LABEL_MAX_CHARS,
      'the label is inside LABEL_MAX_CHARS, so a green result below cannot be ' +
      'the length bound answering for openSpanAt');
    assert.strictEqual(C.openSpanAt(line, line.indexOf('：')), false,
      'both underscores CLOSED before the colon, so nothing is open. BECAUSE ' +
      'a refuse-on-any-delimiter rule would refuse the 69 measured ' +
      'intraword-underscore cases and quietly disable the colon rule on every ' +
      'note carrying a filename');
    const src = [D13_PROSE, '', line, ''].join('\n');
    assert.ok(C.structureBody(src, null).text.indexOf(
      '## Exp_Planning_Worksheet') !== -1,
      '...and end to end it still promotes');
  });

testCase('Q5-3 an index before any opener is not inside a span',
  function () {
    const line = '食材：菜花（一份）';
    assert.strictEqual(C.openSpanAt(line, line.indexOf('：')), false,
      'the parenthesis opens AFTER the colon, so the colon is not inside it');
    assert.strictEqual(C.openSpanAt('没有任何标记的一行', 3), false,
      'and a line with no delimiter at all is never inside a span');
    assert.strictEqual(C.openSpanAt('', 0), false,
      'an empty string does not throw');
  });

testCase('Q5-4 every one of the live inline-markup breaks is refused',
  function () {
    // Each row: the live line, and the exact broken heading it emitted.
    [['正式开火（烹饪时间：约1小时），然后转小火慢炖一会儿',
      '## 正式开火（烹饪时间',
      'b4ead431896578e3 — the phase\'s own showcase note, （） 9->8'],
    ['纪录片叫《地平线：走进自闭症》，很值得一看',
      '## 纪录片叫《地平线',
      '43a109e00ef803c8 — a book title split in half, 《》 1->0'],
    ['  Logger.log(\'NOTE: this row was skipped\');',
      '## Logger.log(\'NOTE',
      'f752be221899dc4a / 5e33900d02961a8c — the colon rule firing inside ' +
        'unfenced JS string literals, () 226->223'],
    ['lazyweb_search {"query": "crisis"} 即可',
      '## lazyweb_search {"query"',
      'be4c130e18a88359 — a JSON payload split, {} 1->0'],
    ['织完第一组花样就被迷倒_(:з」∠)_，配色真的太好看了',
      '## 织完第一组花样就被迷倒_(',
      'eaff9a31b11c6a86 — a kaomoji split, _ 12->11'],
    ['最后发现还是钩好多 Y 字连接起来最薄最简单_(:з」∠)_，就这样吧',
      '## 最后发现还是钩好多 Y 字连接起来最薄最简单_(',
      '9d0911cc105f8805 — a kaomoji split, () 1->0']].forEach(function (row) {
      const src = [D13_PROSE, '', row[0], ''].join('\n');
      const out = C.structureBody(src, null);
      // THE ANTI-VACUITY CHECK, and it is not decoration: three of the six
      // rows were first written with a heading string the transform never
      // emitted, or with a label already over LABEL_MAX_CHARS, and passed
      // GREEN against the unfixed core.js. A refusal case whose heading was
      // never emitted in the first place measures nothing at all.
      assert.strictEqual(
        row[1].slice(3).indexOf(row[0].trim().slice(0, 3)), 0,
        'the expected heading really is the head of the fixture line, so ' +
        JSON.stringify(row[1]) + ' is a heading this line could actually emit');
      assert.strictEqual(out.text.indexOf(row[1]), -1,
        'the heading ' + JSON.stringify(row[1]) + ' is never emitted again. ' +
        'BECAUSE Q5 refuses a label whose colon sits inside an OPEN inline ' +
        'span, closing this break at its CAUSE rather than letting D-14\'s ' +
        'guard fall the whole note back to as-saved. Live case: ' + row[2]);
      assert.strictEqual(out.text, src,
        '...and with no other signal on the line the note comes back ' +
        'byte-identical rather than half-restructured');
    });
  });

testCase('Q5-5 the paired positive: an ordinary label still promotes',
  function () {
    const src = [D13_PROSE, '', '食材：菜花、芝士、面条', ''].join('\n');
    assert.ok(C.structureBody(src, null).text.indexOf('## 食材') !== -1,
      'AN ORDINARY LABEL STILL PROMOTES. BECAUSE a suite of refusals alone ' +
      'passes just as happily against a refuse-everything guard, and a ' +
      'refuse-everything guard would silently disable the whole phase while ' +
      'every D-14 trip count read zero — the F-1 shape, once more.');

    assert.strictEqual(C.structureBody(WORKED_BEFORE, null).text, WORKED_AFTER,
      'and the phase\'s headline worked example is BYTE-UNCHANGED by Q5: its ' +
      'colon sits after a CLOSED `（一人份）`, which is precisely the ' +
      'distinction openSpanAt draws (T1 asserts the same thing and must stay ' +
      'green alongside this)');
  });

testCase('Q5-6 openSpanAt is a pure predicate over named rosters',
  function () {
    ['openSpanAt', 'INLINE_MARKS', 'INLINE_PAIRS', 'SPAN_ONLY_PAIRS',
      'WHOLLY_EMPHASIZED_RE'].forEach(function (k) {
      assert.notStrictEqual(C[k], undefined,
        k + ' is exported BY NAME — plan 12\'s markupPreserved and plan 13\'s ' +
        'split refusal must read the SAME rosters as this refusal, or the ' +
        'guard trips on exactly what the refusal permits');
    });
    assert.strictEqual(typeof C.openSpanAt, 'function', 'it is a function');
    const line = 'ab(cd:ef)gh';
    assert.strictEqual(C.openSpanAt(line, 5), C.openSpanAt(line, 5),
      'pure: same input, same answer, no clock and no state');
    assert.strictEqual(C.openSpanAt(line, -5), false,
      'an index below the string does not throw');
    assert.strictEqual(C.openSpanAt(line, 9999), false,
      'and neither does one beyond it');
  });

testCase('Q6-1 a prose sentence carrying a fullwidth comma is not a label',
  function () {
    const line = '最近从自闭症纪录片中看到了一个实验，让我很触动：具体是这样的';
    const src = [D13_PROSE, '', line, ''].join('\n');
    assert.strictEqual(
      C.structureBody(src, null).text.indexOf('## 最近从自闭症'), -1,
      'a 24-character PROSE SENTENCE is refused as a label. BECAUSE the ' +
      'sentence test rejected `。．！？!?；;…` and not the fullwidth comma ' +
      '`，`, which is how 43a109e00ef803c8 emitted ' +
      '`## 最近从自闭症纪录片中看到了一个实验，让我很触动` — a heading bound ' +
      'to nothing, UI-SPEC check 2.');
  });

testCase('Q6-2 the paired positive: the ENUMERATION comma still promotes',
  function () {
    const src = [D13_PROSE, '', '食材：菜花、芝士', ''].join('\n');
    assert.ok(C.structureBody(src, null).text.indexOf('## 食材') !== -1,
      'a label is unaffected by `、` anywhere in the line...');

    const line = '主料、辅料：菜花、芝士、面条';
    assert.ok(C.structureBody([D13_PROSE, '', line, ''].join('\n'), null)
      .text.indexOf('## 主料、辅料') !== -1,
      '...and a label CONTAINING `、` still promotes. BECAUSE `、` is the ' +
      'ENUMERATION comma and a list separator (it is in RUN_SEPARATORS), ' +
      'while `，` is the prose sentence comma measured at 75,400 occurrences ' +
      'across the corpus. The two must never be confused, and this case is ' +
      'what stops a future edit confusing them.');
    assert.ok(C.RUN_SEPARATORS.indexOf('、') !== -1,
      'and `、` really is the separator this case claims it is');
  });

// ---- M1-M9: the inline-markup invariant (26.88-12, D-14) --------------------
//
// READ THIS BEFORE DEBUGGING ANYTHING BELOW, so nobody wastes an hour on it.
//
// F-1 and F-3 are FIXED in core.js by the time this section runs — F-1 by the
// %% hands-off zone (T12/T12b), F-3 by the caption zone (T14) and the Q5 span
// refusal. `structureBody` CANNOT reproduce them any more, and that is the
// point. These are GUARD FIXTURES, NOT TRANSFORM FIXTURES: the three defect
// shapes are fed to `markupPreserved` DIRECTLY as (before, after) string pairs.
// Do not try to make the transform emit them.
//
// The "after" strings are not retyped from prose. Each was REPLAYED out of git
// history against the code that actually shipped the defect:
//
//   F-1   core.js @ 34be66d^   (before the %% zone)      -> `## %% auto-links`
//   F-3   core.js @ 237d0a5    (before the caption zone) -> `## *图`
//   F-3b  core.js @ 237d0a5                              -> `## *图` + 4 items
//
// M5 is the shape that carries this phase's lesson, and it is why each defect
// asserts wordsPreserved and markupPreserved ON ADJACENT LINES rather than in
// separate cases: a reader should SEE the blindness, not be told about it.

// F-1, replayed at 34be66d^ on a realistic clipping carrying the marker span.
const M_F1_BEFORE = [
  '这是一段很长的正文，讲的是钩针编织的整体思路和每一步要注意的细节，读起来像一堵墙。',
  '', '%% auto-links:start %%', '', '## Related', '', '- [[另一篇笔记]]', '',
  '%% auto-links:end %%'
].join('\n');
const M_F1_AFTER = [
  '这是一段很长的正文，讲的是钩针编织的整体思路和每一步要注意的细节，读起来像一堵墙。',
  '', '## %% auto-links', '', 'start %%', '', '## Related', '',
  '- [[另一篇笔记]]', '', '## %% auto-links', '', 'end %%'
].join('\n');

// F-3, replayed at 237d0a5 on the full-length CAT SCARF caption.
const M_F3_BEFORE = '*图：CAT SCARF 封面照——黄灰条纹钩织围巾，一端做成趴着的黑猫头，' +
  '配同色系流苏，平铺在浅木色桌面上，旁边放着钩针和线团*';
const M_F3_AFTER = '## *图\n\nCAT SCARF 封面照——黄灰条纹钩织围巾，一端做成趴着的黑猫头，' +
  '配同色系流苏，平铺在浅木色桌面上，旁边放着钩针和线团*';

// F-3b, replayed at 237d0a5 on the CLOUDUNT caption — 26.88-08-FINDINGS F-3.
const M_F3B_BEFORE = '*图：CLOUDUNT 多拿滋店，店员从展示柜取出一盒四种口味多拿滋' +
  '（芒果、抹茶配树莓、巧克力、开心果撒糖粉）*';
const M_F3B_AFTER = '## *图\n\n- CLOUDUNT 多拿滋店，店员从展示柜取出一盒四种口味多拿滋（芒果\n' +
  '- 抹茶配树莓\n- 巧克力\n- 开心果撒糖粉）*';

testCase('M1 the benign case: only whitespace and scaffolding added',
  function () {
    assert.strictEqual(C.markupPreserved(
      '食材：面粉、鸡蛋\n做法：搅拌',
      '## 食材\n\n面粉、鸡蛋\n\n## 做法\n\n搅拌'), true,
      'a transform that only adds headings and blank lines preserves every ' +
      'pair. BECAUSE without this the whole section is satisfied by a guard ' +
      'that returns false for everything, which would silently disable ' +
      'reformatting on the entire library (T-26.88-39)');

    assert.strictEqual(C.markupPreserved('*一句话*', '- *一句话*'), true,
      'and a pair that survives inside a new bullet is not a decrease');
  });

testCase('M2/M5 F-1: a %% pair split across an emitted block boundary',
  function () {
    assert.strictEqual(C.wordsPreserved(M_F1_BEFORE, M_F1_AFTER, []), true,
      'the SHIPPED word guard sees nothing wrong — every word survives');
    assert.strictEqual(C.markupPreserved(M_F1_BEFORE, M_F1_AFTER), false,
      '...and the inline-markup guard trips. BECAUSE word preservation is ' +
      'necessary and nowhere near sufficient: the note carried TWO %% pairs ' +
      'and the transform left it with NONE, having promoted each opening ' +
      'marker into a heading and stranded each closer in the paragraph below');
  });

testCase('M3/M5 F-3: an italic image caption split across a heading boundary',
  function () {
    assert.strictEqual(C.wordsPreserved(M_F3_BEFORE, M_F3_AFTER, []), true,
      'the SHIPPED word guard sees nothing wrong');
    assert.strictEqual(C.markupPreserved(M_F3_BEFORE, M_F3_AFTER), false,
      '...and the inline-markup guard trips. BECAUSE the `*` pair went 1 -> ' +
      '0: the opener was promoted into `## *图` and the closer stranded at ' +
      'the end of the paragraph, so the caption renders with literal ' +
      'asterisks and the wrong emphasis');
  });

testCase('M4/M5 F-3b: the same caption additionally shredded into list items',
  function () {
    assert.strictEqual(C.wordsPreserved(M_F3B_BEFORE, M_F3B_AFTER, []), true,
      'the SHIPPED word guard sees nothing wrong here either — the third ' +
      'defect in a row that is invisible to it');
    assert.strictEqual(C.markupPreserved(M_F3B_BEFORE, M_F3B_AFTER), false,
      '...and the inline-markup guard trips, on the `*` pair 1 -> 0');
  });

// M4b: THE KNOWN GAP IS CLOSED AT THE CAUSE (26.88-13). RE-CUT, NOT DELETED.
//
// 26.88-12-SUMMARY says "if plan 13 closes it, delete M4b and say so". It is
// closed, and the case is KEPT — because the thing M4b actually pins is still
// exactly true: `markupPreserved` compares per BLANK-LINE-delimited block and
// STILL cannot see a pair split across two list items. What changed is that no
// rule in this phase can EMIT that shape any more, which is a fact about the
// transform and not about the guard. Deleting the case would delete the pinned
// boundary of D-14's guarantee along with the defect, and the boundary has not
// moved. The third assertion below is the closure.
//
// Measured over the live pool at the moment of the fix: the per-block-PLUS-
// list-item-boundary variant plan 12 measured at exactly 1 trip now trips 0,
// exactly one note's output changed (`7290c7f718776f1b`), and the firing count
// did not move.
//
// The original record, unchanged:
//
// 26.88-12-PLAN's must_haves claim F-3b is caught on BOTH `*` 1->0 AND `（）`
// 1->0. MEASURED, THE SECOND HALF IS FALSE. D-14 fixes the comparison unit as
// the BLANK-LINE-DELIMITED BLOCK, and F-3b's four list items sit inside ONE
// such block, so the fullwidth parenthesis counts 1 on both sides. F-3b trips
// only because of the caption's `*`. Strip the caption and the guard passes.
//
// This is not academic. `7290c7f718776f1b` (Marni 菱格钩织包) is a LIVE note in
// the library today whose `（03、09各一卷）` is split across two emitted list
// items, and all three guards return true on it.
//
// The CAUSE fix is plan 13's, and it landed: `openSpanAt` — plan 11's helper —
// answers TRUE at that `、`, so `splitSeparatorRun` now REFUSES it, the same
// gesture Q5 makes for the colon rule. The parenthesis is never broken in the
// first place.
testCase('M4b the guard boundary, and the CAUSE that used to cross it',
  function () {
    // THE WHOLE LIVE LINE, not the head of it. 26.88-13 found that the
    // shipped M4b fixture used a TRUNCATION carrying one `、`, and
    // splitSeparatorRun needs at least two — so that `before` could never
    // have produced that `after`, and the case pinned a shape the transform
    // did not emit. The line below is the live note's shape in full: two
    // enumeration commas, one of them inside `（…）`.
    const before = '线材：苏苏姐家（03、09各一卷） 钩针：包身4.5mm，' +
      '收口&提手3.5mm 容量：手机、雨伞、钥匙等。包包硬挺不易变形';
    const after = '## 线材\n\n- 苏苏姐家（03\n- 09各一卷） 钩针：包身4.5mm，' +
      '收口&提手3.5mm 容量：手机\n- 雨伞\n- 钥匙等。包包硬挺不易变形';
    assert.strictEqual(C.markupPreserved(before, after), true,
      'the shipped guard does NOT see a parenthesis broken across two list ' +
      'items, and that is STILL TRUE. BECAUSE D-14 compares per ' +
      'BLANK-LINE-delimited block and both items live in one. This assertion ' +
      'records the boundary of the guarantee, which has not moved.');
    assert.strictEqual(C.openSpanAt(before, before.indexOf('、')), true,
      'openSpanAt answers true at that separator — one predicate, and this ' +
      'is its fourth caller');
    // THE CLOSURE, and it is the assertion that makes this case load-bearing
    // rather than a museum piece: the shape above can no longer be EMITTED.
    // PAD past SHORT_POST_LINES first: vault rule 10 suppresses HEADERS on a
    // short post, and the live note is a long one.
    const out = C.structureBody(PAD + before, []);
    assert.strictEqual(out.text,
      PAD + '## 线材\n\n- 苏苏姐家（03、09各一卷） 钩针：包身4.5mm，' +
      '收口&提手3.5mm 容量：手机\n- 雨伞\n- 钥匙等。\n\n包包硬挺不易变形',
      'BECAUSE a separator inside an OPEN inline span is not a list ' +
      'separator (26.88-13). `（03、09各一卷）` stays whole. This was a LIVE ' +
      'defect on `7290c7f718776f1b` that all three plan-12 guards passed — ' +
      'the guard could not see it, so it was the SPLIT that had to stop, not ' +
      'the guard that had to widen.\n' +
      '26.88-17 (F-7): THE LAST BULLET NO LONGER CARRIES THE TAIL. This case ' +
      'expected `- 钥匙等。包包硬挺不易变形` until this plan; the run is now ' +
      'bounded to the sentence carrying its first separator, so ' +
      '`包包硬挺不易变形` is emitted as its own block. THE MEANING OF THIS ' +
      'CASE DID NOT CHANGE — the open-span refusal it pins is untouched, and ' +
      'the assertion below still states it the other way round. Only the ' +
      'recorded output moved, for the reason this plan exists.');
    assert.ok(out.text.indexOf('- 苏苏姐家（03\n') === -1,
      'stated the other way round: the shred is gone');
    assert.strictEqual(C.markupPreserved(PAD + before, out.text), true,
      'and the invariant still holds on what actually ships');
  });

testCase('M4c splitSeparatorRun refuses a separator inside an open span',
  function () {
    assert.deepStrictEqual(
      C.structureBody(PAD + '配料：菜花（甲、乙）、芝士、面条', []).text,
      PAD + '## 配料\n\n- 菜花（甲、乙）\n- 芝士\n- 面条',
      'the separators OUTSIDE the parenthesis still split — the refusal is ' +
      'surgical, one separator, not a retreat from the rule (D-03)');
    assert.strictEqual(
      C.structureBody(PAD + '配料：菜花（甲、乙）面条', []).text,
      PAD + '## 配料\n\n菜花（甲、乙）面条',
      'and with only the guarded separator left there is no run at all, so ' +
      'the remainder is emitted whole rather than as a one-item list');
  });

testCase('M6 decrease-only, never equality — the anti-false-trip property',
  function () {
    [['lazyweb_search {"query": "x"}', 'an unclosed identifier underscore'],
      ['被迷倒_(:з」∠)_ 了', 'a kaomoji'],
      ['the flag is x_x today', 'an x_x identifier']
    ].forEach(function (row) {
      assert.strictEqual(C.markupPreserved(row[0], row[0]), true,
        row[1] + ' contributes zero pairs on BOTH sides and cannot ' +
        'false-trip. BECAUSE a guard that false-trips on her own corpus ' +
        'silently disables the feature, which is worse than no guard');
    });

    assert.strictEqual(
      C.markupPreserved('*一句话\n\n另一句*', '*一句话 另一句*'), true,
      'AN INCREASE IS NOT A DECREASE. BECAUSE the prohibition is that this ' +
      'is never an EQUALITY test, and the three rows above do not discharge ' +
      'it — they are equal on both sides, so an equality implementation ' +
      'passes every one of them. This row is the only case in the file that ' +
      'tells the two apart: a transform that JOINS a source-broken pair back ' +
      'together has lost no markup, and falling the note back for it would ' +
      'be a false trip');
  });

testCase('M7 the per-block property — this is what catches all three defects',
  function () {
    assert.strictEqual(C.markupPreserved('*一句话*', '*一句话\n\n*'), false,
      'a pair that SURVIVES in the document but moves ACROSS a blank line ' +
      'is FALSE. BECAUSE a markdown emphasis pair cannot span a blank line, ' +
      'so counting per block is the same rule the renderer applies');

    assert.strictEqual(C.markupPreserved('*一句话*', '- *一句话*'), true,
      'and a pair that stays inside its block is TRUE');

    // The counter-demonstration, stated as a test rather than as a claim:
    // counted WHOLE-DOCUMENT, every occurrence still exists on both sides of
    // all three defects, so a whole-document guard returns true on all three.
    // The per-block choice is not a detail — it is the entire mechanism.
    [[M_F1_BEFORE, M_F1_AFTER, '%%'], [M_F3_BEFORE, M_F3_AFTER, '*'],
      [M_F3B_BEFORE, M_F3B_AFTER, '*']].forEach(function (row) {
      const count = function (s, d) {
        let n = 0, i = 0, a;
        for (;;) { a = s.indexOf(d, i); if (a === -1) { return n; }
          n++; i = a + d.length; }
      };
      assert.strictEqual(count(row[0], row[2]), count(row[1], row[2]),
        'the ' + row[2] + ' delimiters are all still PRESENT after the ' +
        'defect — whole-document counting sees no change at all, and would ' +
        'return true. Every one of the three defects is a pair that MOVED, ' +
        'never one that vanished');
    });
  });

testCase('M8 headingsBound: no emitted ATX heading may be bound to nothing',
  function () {
    assert.strictEqual(C.headingsBound('## %% x %%'), false,
      'a heading whose whole text is an Obsidian comment span is EMPTY once ' +
      'the renderer strips it — UI-SPEC check 2 stated as code');
    assert.strictEqual(C.headingsBound('## %% auto-links\n\nstart %%'), false,
      "F-1's VISIBLE symptom, exactly as the reader met it. BECAUSE the pair " +
      'count catches the CAUSE and not the symptom, and the symptom is what ' +
      'she actually saw: an empty `## ` heading, twice, on every clipping');
    assert.strictEqual(C.headingsBound('前言\n\n##\n\n正文'), false,
      'a bare `##` with no text at all is equally bound to nothing');
    assert.strictEqual(C.headingsBound(null), false,
      'and it is fail-closed on a null input, throwing nothing');
  });

testCase('M9 headingsBound: an ordinary promoted heading is fine',
  function () {
    assert.strictEqual(C.headingsBound('## 食材\n\n- 菜花'), true,
      'the ordinary case — otherwise the guard trips on every note and ' +
      'silently disables reformatting');
    assert.strictEqual(C.headingsBound('## [[目标]]'), true,
      'a heading carrying a wikilink survives cleanVaultMarkup as an anchor');
    assert.strictEqual(C.headingsBound(C.cleanVaultMarkup('## [[目标]]')), true,
      '...and is still bound AFTER that stripping, which is the form the ' +
      'wrapper actually passes it');
    assert.strictEqual(C.headingsBound('## *图片*'), true,
      'and a heading carrying emphasis is bound to its own text');
    assert.strictEqual(C.headingsBound('```\n## %% x %%\n```'), true,
      'a hash line inside a FENCED block is code, never a heading — the ' +
      'same reading hasAuthorHeading takes. Over-tripping here would fall a ' +
      'note back to as-saved for a line no renderer treats as a heading');
  });

// ---- S8-S21: D-15, sentence-boundary breaks (plan 13, tasks 1-2) -----------
//
// The ONLY rule in this phase that acts on a wall carrying no explicit author
// marker. Sentence-final punctuation IS the signal, and it is thinner than
// every other one D-03 uses — so every measured false-positive class below
// gets its own refusal case, and S20 re-runs all three shipped guards over
// every body the section builds.
//
// D-20 fixes the threshold at 600 characters. NOTHING BELOW HARDCODES IT.
// Every fixture sizes itself from `C.SENTENCE_BREAK_MIN`, on the
// PAD / SHORT_POST_LINES precedent at :1044-1048 — a fixture that hardcodes a
// threshold goes stale silently the day the threshold moves, and then reports
// a pass for a rule it is no longer testing.

// Every body this section feeds to structureBody, registered as it is built,
// so S20 can re-check the three guards over ALL of them. Registration happens
// in ONE helper rather than case by case: a case that does not call d15Body()
// is a case whose body never reaches structureBody at all, which is the
// vacuity S20 exists to make impossible.
// `verbatim` says whether D-15 is the ONLY rule that acts on this body. When
// it is, S20 can assert the strongest form of law 4 there is — the two sides
// are identical once whitespace is stripped. When an earlier D-03 rule also
// fires (S19), that is FALSE and correctly so: promoting a colon label drops
// the colon and bulleting a checkmark run drops the checkmark, because those
// glyphs are scaffolding and dropping them is what those rules DO.
const D15_BODIES = [];
function d15Body(name, src, verbatim) {
  D15_BODIES.push({ name: name, src: src,
    verbatim: verbatim === undefined ? true : verbatim });
  return src;
}

// Whitespace removed. D-15's whole promise is that a blank line is the ENTIRE
// intervention: no word moved, added, removed or changed. Comparing the two
// sides with all whitespace stripped is that promise stated as one equality,
// and it is stronger than wordsPreserved (which normalises punctuation away).
function d15NoSpace(s) {
  return String(s).replace(/[\s　]+/g, '');
}

// A neutral filler clause. It carries NO colon, no RUN_SEPARATORS member, no
// marker glyph, no ordinal and no inline pair — anything an earlier signal
// rule could claim would make these cases measure a different rule than the
// one they name.
const D15_FILL = '只是记录一下当时的心情和想法以及那天下午窗外的样子';

// One signal-free sentence, `fills` filler clauses long, ended by a fullwidth
// full stop. `n` keeps the sentences distinguishable, so ORDER is asserted
// rather than assumed — "every word survives IN ORDER" is half of law 4.
function d15Sentence(n, fills) {
  let s = '这是第' + n + '段完全没有任何信号的普通叙述文字';
  for (let k = 0; k < fills; k++) { s += D15_FILL; }
  return s + '。';
}

function d15Sentences(count, fills) {
  const out = [];
  for (let n = 1; n <= count; n++) { out.push(d15Sentence(n, fills)); }
  return out;
}

testCase('S8 an over-threshold wall of eight sentences becomes eight blocks',
  function () {
    const parts = d15Sentences(8, 4);
    const src = d15Body('S8', parts.join(''));
    assert.strictEqual(src.indexOf('\n'), -1,
      'the specimen is ONE line, which is exactly what makes it a wall');
    assert.ok(src.length >= 900,
      'sanity: the fixture really is the ~900-character shape D-15 was ' +
      'measured on (got ' + src.length + ')');
    assert.ok(src.length > C.SENTENCE_BREAK_MIN,
      'and it is over the threshold, sized from the exported constant and ' +
      'never from a literal');

    const out = C.structureBody(src, []);
    assert.strictEqual(out.text, parts.join('\n\n'),
      'BECAUSE D-15: inside a run over SENTENCE_BREAK_MIN, a paragraph break ' +
      'is inserted between sentences at sentence-final punctuation. Eight ' +
      'sentences, eight blocks, IN THE SAME ORDER, every word intact.');
    assert.strictEqual(out.text.indexOf('## '), -1,
      'NO HEADING is emitted by this rule — a blank line is the entire ' +
      'intervention (D-15 prohibition)');
    assert.strictEqual(out.text.indexOf('- '), -1,
      'and NO bullet either');
    assert.deepStrictEqual(out.addedHeadings, [],
      'nothing is declared as added, because nothing was added');
    assert.strictEqual(d15NoSpace(out.text), d15NoSpace(src),
      'and stripped of whitespace the two sides are IDENTICAL — the only ' +
      'thing the rule ever emits is a blank line');
    assert.strictEqual(C.wordsPreserved(src, out.text, []), true,
      'every word survives in order (D-04)');
    assert.strictEqual(C.wordsPreserved(src, dropAWord(out.text), []), false,
      'and the paired counter-assertion still bites, so the green above is ' +
      'not a guard that returns true for everything');
  });

testCase('S9 the same paragraph UNDER the threshold is byte-identical',
  function () {
    const parts = d15Sentences(4, 4);
    const src = d15Body('S9', parts.join(''));
    assert.ok(src.length > 400 && src.length < C.SENTENCE_BREAK_MIN,
      'sanity: the fixture sits BETWEEN 400 and SENTENCE_BREAK_MIN (got ' +
      src.length + '), so it is the block D-20 deliberately declined to ' +
      'touch when it measured T=400 and chose 600');

    const out = C.structureBody(src, []);
    assert.strictEqual(out.text, src,
      'THE SUPPRESSOR IS THE THRESHOLD, and this is the case that says so. ' +
      'The same prose, the same sentence punctuation, the same absence of ' +
      'any other signal — and nothing happens, because the block is not a ' +
      'wall. D-20 chose 600 precisely so a reader never sees a block broken ' +
      'that she never experienced as a wall.');
    assert.strictEqual(out.addedHeadings.length, 0,
      'and nothing is declared as added, because nothing was added');
  });

testCase('S10 the gate is the BLOCK, not the line', function () {
  // Six consecutive lines with no blank line between them are ONE rendered
  // paragraph, because `marked` joins single newlines. Gating on line length
  // would be honest about the source and dishonest about what the reader sees.
  const wide = [];
  const widePairs = [];
  for (let n = 1; n <= 6; n++) {
    widePairs.push([d15Sentence(2 * n - 1, 2), d15Sentence(2 * n, 2)]);
    wide.push(widePairs[n - 1][0] + widePairs[n - 1][1]);
  }
  const wideSrc = d15Body('S10-wide', wide.join('\n'));
  assert.ok(wideSrc.split('\n').length === 6,
    'sanity: six lines');
  wide.forEach(function (l) {
    assert.ok(l.length < C.SENTENCE_BREAK_MIN,
      'sanity: NO SINGLE LINE reaches the threshold (' + l.length + ') — a ' +
      'line gate would leave this body untouched');
  });
  assert.ok(wideSrc.length > C.SENTENCE_BREAK_MIN,
    'but the BLOCK they form does (' + wideSrc.length + ')');

  const wideOut = C.structureBody(wideSrc, []);
  const wantWide = widePairs.map(function (p) { return p.join('\n\n'); })
    .join('\n');
  assert.strictEqual(wideOut.text, wantWide,
    'BECAUSE the threshold is a property of the BLOCK and structureBody ' +
    'iterates LINES: `blockLengths` is what carries the block figure onto ' +
    'each line, so a six-line wall with no blank line in it is treated as ' +
    'the one paragraph the reader actually meets');

  // ...and the same shape, short enough that the block does NOT reach the
  // threshold, is untouched. Without this half, S10 is satisfied by a rule
  // that fires on every multi-line body.
  const narrow = [];
  for (let n = 1; n <= 6; n++) {
    narrow.push(d15Sentence(2 * n - 1, 0) + d15Sentence(2 * n, 0));
  }
  const narrowSrc = d15Body('S10-narrow', narrow.join('\n'));
  assert.ok(narrowSrc.length < C.SENTENCE_BREAK_MIN,
    'sanity: six SHORT lines do not add up to a wall (' + narrowSrc.length +
    ')');
  assert.strictEqual(C.structureBody(narrowSrc, []).text, narrowSrc,
    'and so nothing happens to them');
});

// The ASCII half of SENTENCE_ENDERS. It roughly DOUBLES the rule's reach —
// about a third of the eligible pool is English — which is the measured
// reason `.!?` are in the set at all.
function d15English(n, term) {
  return 'This is sentence number ' + n + ' of an ordinary English ' +
    'paragraph that carries no signal at all and nothing that any other ' +
    'rule in this phase could ever promote' + term;
}

testCase('S11 an English wall splits at `. ` / `! ` / `? `', function () {
  const parts = [
    d15English(1, '.'), d15English(2, '!'), d15English(3, '?'),
    d15English(4, '.'), d15English(5, '!'), d15English(6, '.')
  ];
  const src = d15Body('S11', parts.join(' '));
  assert.ok(src.length > C.SENTENCE_BREAK_MIN,
    'sanity: over the threshold (' + src.length + ')');

  const out = C.structureBody(src, []);
  assert.strictEqual(out.text, parts.join('\n\n'),
    'BECAUSE ASCII terminators are in SENTENCE_ENDERS on measurement: a ' +
    'third of this pool is English, and leaving `.!?` out would roughly ' +
    'halve the rule. The single space that joined two sentences is the only ' +
    'character the split consumes.');
  assert.strictEqual(d15NoSpace(out.text), d15NoSpace(src),
    'and stripped of whitespace the two sides are identical — WHITESPACE IS ' +
    'THE ONLY THING A SPLIT EVER DROPS, stated as an equality rather than ' +
    'as a claim');
  assert.strictEqual(C.wordsPreserved(src, out.text, []), true,
    'every word survives in order (D-04)');
});

testCase('S12 a RUN of terminators is one boundary, not three', function () {
  const parts = [
    d15Sentence(1, 4).replace(/。$/, '！！！'),
    d15Sentence(2, 4).replace(/。$/, '？！'),
    d15Sentence(3, 4), d15Sentence(4, 4), d15Sentence(5, 4),
    d15Sentence(6, 4)
  ];
  const src = d15Body('S12', parts.join(''));
  assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

  const out = C.structureBody(src, []);
  assert.strictEqual(out.text, parts.join('\n\n'),
    'BECAUSE `！！！` is one person raising her voice once, not three ' +
    'sentences. The terminator run is consumed as a single boundary and ' +
    'rides WITH the sentence it ends.');
  assert.strictEqual(out.text.indexOf('！\n\n！'), -1,
    'stated the other way round: no break may ever land BETWEEN two ' +
    'terminators');
  assert.ok(out.text.indexOf('！！！\n\n') !== -1,
    'and the whole run stays at the end of its own block');
});

// ---- the false-positive guards, one case per measured class ----------------

testCase('S13 whitespace-required: a filename, an attribute and a URL',
  function () {
    const hazard = '这是第3段里面提到了附件 file.pdf 还有一个标签 src="x.png" ' +
      '以及链接 https://a.b/c.d这些都不可以被切开' + D15_FILL + D15_FILL + '。';
    const parts = [d15Sentence(1, 4), d15Sentence(2, 4), hazard,
      d15Sentence(4, 4), d15Sentence(5, 4), d15Sentence(6, 4)];
    const src = d15Body('S13', parts.join(''));
    assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

    const out = C.structureBody(src, []);
    assert.strictEqual(out.text, parts.join('\n\n'),
      'BECAUSE an ASCII terminator must be followed by whitespace or the end ' +
      'of the block. This is the single highest-value guard in the set: 310 ' +
      'of the 1,304 candidate split points in the live library (23.8%) are ' +
      'this shape, and without it every filename, every HTML attribute and ' +
      'every dotted URL path becomes a paragraph break.');
    ['file.pdf', 'src="x.png"', 'https://a.b/c.d'].forEach(function (frag) {
      assert.ok(out.text.indexOf(frag) !== -1,
        'and `' + frag + '` survives intact, un-split, character for ' +
        'character');
    });
  });

testCase('S14 a decimal is not a sentence end', function () {
    const dec = '这是第3段里面写着钩针 2.5mm 钩针和 3.25mm 钩针这些数字都不可以被切开' +
      D15_FILL + D15_FILL + '。';
    const parts = [d15Sentence(1, 4), d15Sentence(2, 4), dec,
      d15Sentence(4, 4), d15Sentence(5, 4), d15Sentence(6, 4)];
    const src = d15Body('S14', parts.join(''));
    assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

    const out = C.structureBody(src, []);
    assert.strictEqual(out.text, parts.join('\n\n'),
      'BECAUSE a terminator between two digits is a decimal point. Her ' +
      'knitting notes are full of hook sizes (`2.5mm`, `3.25mm`) and a break ' +
      'inside one is a break in the middle of a measurement.');
    ['2.5mm', '3.25mm'].forEach(function (frag) {
      assert.ok(out.text.indexOf(frag) !== -1,
        '`' + frag + '` survives intact');
    });
    // HONEST LABEL, and it is the phase's own defect class turned on this
    // very fixture. Both shapes above are refused by the WHITESPACE guard
    // (the char after the dot is a digit, not whitespace) before the digit
    // guard is ever consulted. The digit guard is reachable only when the
    // terminator is also at the end of the block, and at the end of a block
    // there is no s[i+1] to be a digit — so on the rule as it ships the digit
    // clause is SUBSUMED and decides nothing. It is kept because D-15's
    // must_haves name it and because relaxing the whitespace clause (e.g. to
    // let a CJK character follow an ASCII terminator) would make it live
    // again — but it is labelled here rather than presented as load-bearing.
    assert.strictEqual(C.splitSentences('钩针 2.5mm'), null,
      'and directly: a bare decimal offers no surviving split point at all');
  });

testCase('S15 a listed abbreviation is not a sentence end', function () {
  const abbr = 'Dr. Smith and Mrs. Jones met vs. the others at Acme Ltd. ' +
    'to talk about hooks etc. before anything else happened that afternoon.';
  const parts = [d15English(1, '.'), d15English(2, '.'), abbr,
    d15English(4, '.'), d15English(5, '.')];
  const src = d15Body('S15', parts.join(' '));
  assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

  const out = C.structureBody(src, []);
  assert.strictEqual(out.text, parts.join('\n\n'),
    'BECAUSE `Dr.`, `Mrs.`, `vs.`, `Ltd.` and `etc.` are followed by ' +
    'whitespace and would otherwise pass every other guard. A small CLOSED ' +
    'roster, measured at 6 occurrences of the 1,304 candidate points — ' +
    'SENTENCE_ABBREVIATIONS is add-me-deliberately for exactly that reason.');
  ['Dr. Smith', 'Mrs. Jones', 'vs. the', 'Ltd. to', 'etc. before']
    .forEach(function (frag) {
      assert.ok(out.text.indexOf(frag) !== -1,
        '`' + frag + '` is not broken across a paragraph boundary');
    });
});

testCase('S16 no split inside an unclosed inline span', function () {
  // One specimen per pair family, each with a sentence terminator INSIDE the
  // span. `[[…]]` and `![[…]]` are the critical two: they are inline image
  // embeds MID-PARAGRAPH, which structureBody's LINE-ANCHORED `/^\s*!\[/`
  // image branch does not cover at all.
  const specimens = [
    '注意（第一句。第二句）后面',
    '注意(first. second)后面',
    '注意[first. second]后面',
    '注意[[图片。名字]]后面',
    '注意![[图片。封面]]后面',
    '注意《书名。副题》后面',
    '注意「引文。续句」后面',
    '注意“他说。她说”后面',
    '注意_强调。续句_后面'
  ];
  const parts = [d15Sentence(1, 4), d15Sentence(2, 4),
    '这是第3段' + specimens.join('') + D15_FILL + D15_FILL + '。',
    d15Sentence(4, 4), d15Sentence(5, 4), d15Sentence(6, 4)];
  const src = d15Body('S16', parts.join(''));
  assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

  const out = C.structureBody(src, []);
  assert.strictEqual(out.text, parts.join('\n\n'),
    'BECAUSE a markdown pair cannot span a blank line, so a break inside an ' +
    'OPEN span provably stops it being a pair. `openSpanAt` is the same ' +
    'helper plan 11 built for Q5 — ONE predicate, and now a third caller, so ' +
    'the refusals can never disagree with each other.');
  specimens.forEach(function (spec) {
    assert.ok(out.text.indexOf(spec) !== -1,
      '`' + spec + '` survives whole — no break landed inside the span');
  });
  assert.strictEqual(C.markupPreserved(src, out.text), true,
    'and the plan-12 invariant agrees: not one pair was lost');
});

testCase('S17 the rednote link-soup block comes back essentially unchanged',
  function () {
    const link = '[#多拿滋](https://xhslink.com/aBcDeF)';
    const soup = new Array(31).join(link + ' ').trim();
    const lead = [d15Sentence(1, 1), d15Sentence(2, 1)];
    const src = d15Body('S17', lead.join('') + soup);
    assert.ok(soup.length > C.SENTENCE_BREAK_MIN,
      'sanity: the link run ALONE is over the threshold (' + soup.length +
      ') — this is the shape of the live 1,398-character note');

    const out = C.structureBody(src, []);
    const blocks = out.text.split('\n\n');
    assert.deepStrictEqual(blocks, lead.concat([soup]),
      'BECAUSE 89% of that block is `[#tag](url)` runs and not one split ' +
      'point inside a link survives the guards. The two prose sentences in ' +
      'front of it break; the soup does not. Measured on the live note as ' +
      '1,398 -> 1,290, AND THAT IS THE CORRECT ANSWER — a block that offers ' +
      'no legal boundary is left as saved rather than broken on a guess.');
    assert.strictEqual(out.text.split(link).length - 1, 30,
      'all thirty links survive intact, character for character');
    assert.ok(blocks[blocks.length - 1].length > C.SENTENCE_BREAK_MIN,
      'THE HONEST CEILING, as a test: this note keeps a block over the ' +
      'threshold after the rule, and D-15 does not pretend otherwise');
  });

// ---- the hands-off ordering ------------------------------------------------

testCase('S18 an over-threshold hands-off zone is untouched', function () {
  const wall = d15Sentences(6, 4).join('');
  assert.ok(wall.length > C.SENTENCE_BREAK_MIN,
    'sanity: the payload really is over the threshold');
  const zones = [
    ['a fenced block', '```\n' + wall + '\n```'],
    ['a table', '| 说明 |\n| --- |\n| ' + wall + ' |'],
    ['a blockquote run', '> ' + wall],
    ['a caption line', '*' + wall + '*'],
    ['an Obsidian comment', '%% ' + wall + ' %%'],
    ['an image line', '![[' + wall + '.jpg]]']
  ];
  zones.forEach(function (row) {
    const src = d15Body('S18 ' + row[0], row[1]);
    assert.ok(src.length > C.SENTENCE_BREAK_MIN,
      'sanity: ' + row[0] + ' is over the threshold');
    assert.strictEqual(C.structureBody(src, []).text, src,
      'BECAUSE D-15 runs LAST, after the zone map — which is what keeps ' +
      "D-07's six hands-off zones ABSOLUTE. " + row[0] + ' is never prose, ' +
      'however long it is.');
  });
});

testCase('S19 a line an earlier signal rule claimed never reaches D-15',
  function () {
    const label = '食材：' + d15Sentence(9, 0) + d15Sentence(10, 0);
    const marks = '✅' + d15Sentence(11, 0) + ' ✅' + d15Sentence(12, 0);
    const wall = d15Sentences(6, 4).join('');
    const src = d15Body('S19', label + '\n' + marks + '\n' + wall, false);
    assert.ok(src.length > C.SENTENCE_BREAK_MIN,
      'sanity: all three lines sit in ONE over-threshold block, so D-15 ' +
      'would reach every one of them if the ordering were wrong');

    const out = C.structureBody(src, []);
    const want = '## 食材\n\n' + d15Sentence(9, 0) + d15Sentence(10, 0) +
      '\n- ' + d15Sentence(11, 0) + '\n- ' + d15Sentence(12, 0) +
      '\n' + d15Sentences(6, 4).join('\n\n');
    assert.strictEqual(out.text, want,
      'BECAUSE ordering is what makes D-15 NON-COMPETING: it runs last, ' +
      'after the zone map and after every D-03/D-03a signal rule has DECLINED ' +
      'the line. The colon label promotes and its remainder keeps BOTH its ' +
      'sentences on one line; the checkmark run bullets and each item keeps ' +
      'its own sentences; only the signal-less wall splits. No ordering ' +
      'conflict with D-03 can arise, because a claimed line never arrives.');
    assert.strictEqual(out.text.indexOf('## 食材\n\n' + d15Sentence(9, 0) +
      d15Sentence(10, 0)), 0,
      'stated sharply: the promoted remainder is NOT split, even though its ' +
      'block is over the threshold');
  });

// ---- the guards agree ------------------------------------------------------

testCase('S20 every body in this section satisfies all three shipped guards',
  function () {
    assert.ok(D15_BODIES.length >= 14,
      'sanity: the loop is not vacuous — it covers every body S8-S19 built (' +
      D15_BODIES.length + ')');
    D15_BODIES.forEach(function (row) {
      const out = C.structureBody(row.src, []);
      assert.strictEqual(
        C.wordsPreserved(row.src, out.text, out.addedHeadings), true,
        '[' + row.name + '] wordsPreserved (D-04)');
      assert.strictEqual(C.markupPreserved(row.src, out.text), true,
        '[' + row.name + '] markupPreserved (D-14) — the rule and the ' +
        'invariant plan 12 shipped do not fight');
      assert.strictEqual(C.headingsBound(out.text), true,
        '[' + row.name + '] headingsBound (D-14)');
      assert.strictEqual(C.headingsBound(C.cleanVaultMarkup(out.text)), true,
        '[' + row.name + '] ...and still bound in the form marked receives');
      if (row.verbatim) {
        assert.strictEqual(d15NoSpace(out.text), d15NoSpace(row.src),
          '[' + row.name + '] and whitespace is the ONLY thing that ever ' +
          'changed — asserted in a loop so a case added later inherits it');
      }
    });
  });

// ---- the measurement seam --------------------------------------------------

testCase('S21 opts.sentenceBreakMin: the default is pinned, the override live',
  function () {
    const parts = d15Sentences(4, 4);
    const src = d15Body('S21', parts.join(''));
    assert.ok(src.length > 400 && src.length < C.SENTENCE_BREAK_MIN,
      'sanity: sized from the exported constant, the body sits BETWEEN 400 ' +
      'and SENTENCE_BREAK_MIN (' + src.length + ')');

    assert.strictEqual(C.structureBody(src, []).text, src,
      'the DEFAULT is the constant and nothing else: two arguments, no ' +
      'split');
    assert.strictEqual(C.structureBody(src, [], {}).text, src,
      '...and an EMPTY opts object cannot lower it');
    assert.strictEqual(C.structureBody(src, [], { sentenceBreakMin: 400 }).text,
      parts.join('\n\n'),
      'BECAUSE D-20 is on the record that widening the threshold later is ' +
      '"a one-line change plus a re-measure", and after plan 13 deletes the ' +
      "probe's own splitSentences the re-measure half is only demonstrable " +
      'through this seam: root.StudyCore is a VALUE COPY of the module\'s ' +
      'closure vars (LABEL_MAX_CHARS is declared once and read directly by ' +
      'every internal caller, never through the export), so assigning ' +
      'CORE.SENTENCE_BREAK_MIN from outside changes nothing and `T=400` ' +
      'would silently print the T=600 figures. It is a MEASUREMENT SEAM and ' +
      'never a feature: no UI, no config key, no persisted setting, and the ' +
      "app's single call site never passes it.");
    assert.strictEqual(
      C.structureBody(src, [], { sentenceBreakMin: 0 }).text, src,
      'a non-positive override falls back to the constant rather than ' +
      'splitting everything');
    assert.strictEqual(
      C.structureBody(src, [], { sentenceBreakMin: Infinity }).text, src,
      'and so does a non-finite one — the resolver takes a positive FINITE ' +
      'number or nothing');
  });

// ---- F4-1..F4-4: 26.88-17, F-4 — `!` and `[` are ONE token ------------------
//
// D-15 breaks a paragraph at a full stop, and the `!` of an inline
// `![[picture.jpg]]` sits right after it. The `!` is consumed into the
// sentence-ender RUN, the break lands after it, and the embed is torn in half:
// `!` stranded at the end of one block, `[[…]]` orphaned into the next. The rule
// knew where the sentence ended; it did not know that the token it was cutting
// through extended past it.
//
// MEASURED ON THE LIVE LIBRARY BEFORE THE FIX (26.88-15-FINDINGS.md § F-4, and
// re-measured at `b7d7661` by `tools/replan_probe.cjs`): FOURTEEN notes, every
// one breaking the same construct `[[]] n->n-1`, every one declined by
// `renderSavedBody` and rendered exactly as saved. The published reach of 90 was
// really 76.
//
// THE ASYMMETRY THAT LET IT SURVIVE A 48-SUITE SWEEP AND A PUBLISHED COVERAGE
// FIGURE, recorded here because it is the whole reason this fixture exists:
// at the RAW seam `markupPreserved` reads TRUE (the orphaned `[[…]]` still
// counts its pair inside its own block), and only after `cleanVaultMarkup` does
// it read FALSE. The probe measured ONE guard at ONE seam, so it could not see
// this class at all. Measured on F4-1's exact body at `b7d7661`:
//   {"words":true,"markupRaw":true,"markupClean":false,"headingsBound":true}
// F4-1 asserts BOTH seams after the fix, and that pre-fix pair is what the RED
// run printed.
const F4_EMBED = '![[Aloma - 少女情怀总是诗_1_来自小红书网页版.jpg]]';
const F4_IMAGE = '![](pictures/plov.png)';

// The four guards renderSavedBody requires, asserted through the SHIPPED
// verdict rather than composed here — a second composition of that ladder is
// the one-rule-two-callers drift plan 16 spent a task deleting.
function f4Guards(name, src) {
  const r = C.structureBody(src, []);
  const g = C.bodyGuards(src, r.text, r.addedHeadings);
  assert.strictEqual(g.words, true, '[' + name + '] wordsPreserved');
  assert.strictEqual(g.markupRaw, true, '[' + name + '] markup at the RAW seam');
  assert.strictEqual(g.markupClean, true,
    '[' + name + '] markup at the CLEAN seam — what `marked` ACTUALLY ' +
    'receives, and the ONLY seam that could see F-4. Before the fix this read ' +
    'FALSE while markupRaw read TRUE, on this exact body.');
  assert.strictEqual(g.headingsBound, true, '[' + name + '] headingsBound');
  assert.strictEqual(g.ok, true,
    '[' + name + '] ...so the app LAYS THE NOTE OUT instead of silently ' +
    'declining it and rendering as saved');
  return r;
}

testCase('F4-1 a break never separates the `!` of an inline `![[…]]` embed',
  function () {
    const parts = d15Sentences(8, 4);
    const src = d15Body('F4-1', parts.join('') + F4_EMBED);
    assert.strictEqual(src.indexOf('\n'), -1,
      'the specimen is ONE line — which is exactly why D-07 does not protect ' +
      'it. The image zone is LINE-ANCHORED, and this embed sits at character ' +
      src.indexOf(F4_EMBED) + ' with that many characters of prose ahead of ' +
      'it on the same line.');
    assert.ok(src.length > C.SENTENCE_BREAK_MIN,
      'and the block is over the threshold, sized from the exported constant');
    assert.deepStrictEqual(C.handsOffSpans(src), [],
      'stated as a measurement rather than as an argument: the zone map ' +
      'claims NOTHING here, so D-15 does reach this line and the refusal has ' +
      'to live inside the split');

    const out = f4Guards('F4-1', src);
    assert.strictEqual(out.text, parts.join('\n\n') + F4_EMBED,
      'BECAUSE `!` immediately followed by `[` is ONE TOKEN: the break at the ' +
      'full stop in front of it is REFUSED, so the embed arrives whole in the ' +
      'same block as the sentence that precedes it. Every OTHER full stop in ' +
      'the wall still splits — the refusal is about one token, not about the ' +
      'rule.');
    assert.strictEqual(out.text.indexOf('。!\n'), -1,
      'stated sharply: no block ever ends `。!` again');
    assert.strictEqual(out.text.indexOf('\n[['), -1,
      'and no block ever begins with an orphaned `[[`');
  });

testCase('F4-2 the markdown image `![](path)` is the same one token',
  function () {
    const parts = d15Sentences(8, 4);
    const src = d15Body('F4-2', parts.join('') + F4_IMAGE);
    assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

    const out = f4Guards('F4-2', src);
    assert.strictEqual(out.text, parts.join('\n\n') + F4_IMAGE,
      'BECAUSE both markdown image syntaxes begin with the SAME two ' +
      'characters, one test covers both. THIS HALF IS THE ONE THE GUARDS ' +
      'NEVER CAUGHT: measured at `b7d7661` the split `。!` / `[](path)` left ' +
      'markupClean TRUE, because `[]` and `()` each still pair inside their ' +
      'own block — so a broken image reached the reader with every guard ' +
      'green. Word preservation was necessary and nowhere near sufficient for ' +
      'the fifth time in this phase.');
  });

testCase('F4-3 the counter-case: an embed on its OWN line still splits the wall',
  function () {
    const parts = d15Sentences(8, 4);
    const src = d15Body('F4-3', parts.join('') + '\n\n' + F4_EMBED + '\n');
    assert.ok(parts.join('').length > C.SENTENCE_BREAK_MIN,
      'sanity: the wall is over the threshold');

    const out = f4Guards('F4-3', src);
    const blocks = out.text.split(/\n[ \t]*\n/);
    assert.strictEqual(blocks.length, 9,
      'ASSERTED BY NUMBER, and that is the whole point of this case. F4-1 ' +
      'alone is satisfied by a refusal that refuses EVERY split — which would ' +
      'emit 2 blocks here (the untouched wall, and the image line). Eight ' +
      'sentences plus one hands-off image line is NINE, and a ' +
      'refuse-everything implementation cannot reach it.');
    assert.strictEqual(out.text, parts.join('\n\n') + '\n\n' + F4_EMBED + '\n',
      'and byte for byte: the image line is a D-07 hands-off zone, copied ' +
      'exactly, while every full stop in the wall in front of it splits');
  });

testCase('F4-4 an ordinary `!` with no bracket after it still splits',
  function () {
    const parts = d15Sentences(7, 4)
      .concat(['这是最后一句普通的话！', d15Sentence(9, 4)]);
    const src = d15Body('F4-4', parts.join(''));
    assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

    const out = f4Guards('F4-4', src);
    assert.strictEqual(out.text, parts.join('\n\n'),
      'BECAUSE THE REFUSAL IS ABOUT THE TOKEN, NOT ABOUT THE CHARACTER. An ' +
      'exclamation mark is one person raising her voice once and it ends a ' +
      'sentence like any other terminator; only an exclamation mark with an ' +
      'opening bracket glued to its right is half of an image.');
  });

testCase('F4-5 splitsImageToken, the predicate itself, at its edges',
  function () {
    assert.strictEqual(typeof C.splitsImageToken, 'function',
      'exported BY NAME, like every other predicate this phase has shipped');
    assert.strictEqual(C.splitsImageToken('a。![[x]]', 2), true,
      'the `!` sits at index 2 and an opening bracket is glued to its right');
    assert.strictEqual(C.splitsImageToken('a。![](x)', 2), true,
      '...and the markdown image spelling answers the same, because the two ' +
      'characters it tests are the two both syntaxes share');
    assert.strictEqual(C.splitsImageToken('a。! [[x]]', 2), false,
      'a space between them is two tokens, not one');
    assert.strictEqual(C.splitsImageToken('a。b', 2), false,
      'an ordinary character is not an exclamation mark');
    assert.strictEqual(C.splitsImageToken('结束了！[[x]]', 3), false,
      'THE FULLWIDTH `！` IS NOT THE SAME CHARACTER and is not part of any ' +
      'image syntax. Refusing there would refuse an ordinary CJK sentence end ' +
      'in front of a plain wiki link, which is a link and not a picture.');
    assert.strictEqual(C.splitsImageToken('', 0), false,
      'SRM-01 [empty]: an empty string raises nothing and answers false');
    assert.strictEqual(C.splitsImageToken('abc!', 3), false,
      'an index at the LAST character has nothing to its right — false, not ' +
      'a read past the end');
    assert.strictEqual(C.splitsImageToken('abc', 99), false,
      'an index past the end answers false rather than raising');
    assert.strictEqual(C.splitsImageToken(null, 0), false,
      'and so does a null body — the same never-raises posture openSpanAt takes');
  });

// ---- F6b-1..F6b-9: 26.88-20, F-6b — the hashtag carve-out -------------------
//
// THE ONE PLACE IN THIS MODULE THAT DELETES A CHARACTER FROM HER RENDERED
// BODY. Everywhere else the rules only move whitespace. So this block is not
// only a set of positives; it is the FENCE around a named exception to law 4,
// and its job is to make widening the exception impossible to do quietly.
//
// OWNER DECISION OF RECORD, live on 2026-08-03 during the plan-20 UAT: *"this
// hashtag is still really bother me, I think the original note is the
// hyperlink or something similar, can you please remove it?"* She was shown
// both halves and their costs and chose BOTH.
//
// MEASURED OVER ALL 2,945 LIVE TEXT NOTES with the SHIPPED predicate, re-run
// 2026-08-04 after the code review's CR-01 and WR-02 (the figures the earlier
// run published are kept beside them, because a moved number with no before is
// not a measurement):
//   HALF 1  27 link labels across  9 notes  (27/9 before CR-01's fence — no
//           rednote search link sits in a hands-off zone on today's corpus)
//   HALF 2 102 bare `#`  across   23 notes  (111 across 25 before WR-02's
//           left boundary; the nine lost are the welding class)
//   32 notes touched in total (34 before); wordsPreserved trips 0, heading
//   lines moved 0, hands-off zone bytes moved 0.
//
// THE FOUR-CLAUSE GATE BELOW IS THE POINT. Each clause fails on a DIFFERENT
// widening, and every case in this block runs all four, so a case added later
// inherits the fence rather than having to remember it.

// The gate. Named, narrow, and applied to EXACTLY this predicate — it is not a
// loosening of wordsPreserved, it is wordsPreserved held over the carve-out.
function hashtagCarveOut(name, src) {
  const after = C.stripHashtagMarkers(src);

  // CLAUSE 1 — the word-preservation guard, unmodified, over the carve-out.
  // `#` is already folded away by normalizeWords, so removing ONLY the `#`
  // leaves the token sequence identical. A widening that ate the WORD would
  // trip this on its first note.
  assert.strictEqual(C.wordsPreserved(src, after, []), true,
    '[' + name + '] CLAUSE 1: every word survives. The carve-out removes the ' +
    'platform\'s `#` and NOTHING else — the word after it is hers. ' +
    JSON.stringify(src) + ' -> ' + JSON.stringify(after));

  // CLAUSE 2 — no ATX heading line moves. wordsPreserved CANNOT see this
  // (normalizeWords strips heading markers on both sides), which is exactly
  // why it is a separate clause: a widening to `# ` would be invisible to
  // clause 1 and would turn every heading in the library into plain text.
  const heads = (s) => s.split('\n')
    .filter((l) => /^[ \t]{0,3}#{1,6}([ \t]|$)/.test(l.replace(/\r$/, '')));
  assert.deepStrictEqual(heads(after), heads(src),
    '[' + name + '] CLAUSE 2: not one ATX heading line moves. `# ` followed ' +
    'by a space is a heading and is never a hashtag.');

  // CLAUSE 3 — no hands-off zone byte moves, asserted through the SHIPPED
  // `CORE.handsOffSpans` rather than a re-spelling of the six zones.
  const zones = (s) => C.handsOffSpans(s).map((sp) => s.slice(sp[0], sp[1]));
  assert.deepStrictEqual(zones(after), zones(src),
    '[' + name + '] CLAUSE 3: fenced code, tables, blockquotes, image lines, ' +
    'captions and `%%` comments stay byte-identical.');

  // CLAUSE 4 — the reach is EXACTLY the offsets the carve-out reports, and
  // each one is a `#`. An independent straight-line reconstruction: strip
  // half 1, then delete precisely the reported offsets. A count with no
  // offset list is not accepted anywhere in this phase.
  // 26.88 code review CR-01: BOTH halves now report their reach as an offset
  // list, so the reconstruction below asks each of them WHERE it fired instead
  // of re-spelling HALF 1's bracket shape. A HALF 1 that edited a byte it did
  // not report can no longer satisfy this clause.
  const linkCuts = C.hashtagLinkCuts(src);
  let linked = '';
  let linkAt = 0;
  linkCuts.forEach(function (c) {
    assert.strictEqual(String(src).charAt(c), '#',
      '[' + name + '] CLAUSE 4: every HALF 1 offset points at a `#`');
    linked += String(src).slice(linkAt, c);
    linkAt = c + 1;
  });
  linked += String(src).slice(linkAt);
  const cuts = C.hashtagRunSpans(linked);
  let rebuilt = '';
  let at = 0;
  cuts.forEach(function (c) {
    assert.strictEqual(linked.charAt(c), '#',
      '[' + name + '] CLAUSE 4: every reported offset points at a `#`');
    rebuilt += linked.slice(at, c);
    at = c + 1;
  });
  rebuilt += linked.slice(at);
  assert.strictEqual(after, rebuilt,
    '[' + name + '] CLAUSE 4: the output is the source with exactly those ' +
    '`#` characters removed and nothing else — no word, no space, no ' +
    'punctuation, nothing re-joined, reordered or re-worded.');
  return after;
}

const F6B_HREF = 'https://www.rednote.com/search_result' +
  '?keyword=sanjose&type=54&source=web_note_detail_r10';

testCase('F6b-1 HALF 1: a hashtag-SEARCH link label loses its `#`, keeps its word',
  function () {
    const src = '越南城旁边的水果摊 [#sanjose](' + F6B_HREF + ') 很值得去。';
    const out = hashtagCarveOut('F6b-1', src);
    assert.strictEqual(out, '越南城旁边的水果摊 [sanjose](' + F6B_HREF + ') 很值得去。',
      'THE LINK STAYS A LINK, the href is untouched, and only the label\'s ' +
      'leading `#` is gone. Measured 2026-08-03: 27 such links across 9 live ' +
      'notes, every href a rednote hashtag-search url.');
  });

testCase('F6b-2 HALF 1 counter-case: an anchor link keeps its `#`',
  function () {
    const src = '3. [死者的巴黎](#死者的巴黎-巴黎地下墓穴游记) and [#x](https://example.com/a).';
    const out = hashtagCarveOut('F6b-2', src);
    assert.strictEqual(out, src,
      'BECAUSE THE HREF DECIDES, NOT THE LABEL. A table-of-contents anchor ' +
      'and an ordinary link whose label happens to start with `#` are both ' +
      'left exactly as written; only a hashtag-SEARCH url on the two hosts ' +
      'that emit them qualifies. `CORE.HASHTAG_SEARCH_HREF_RE` is the whole ' +
      'test and it is exported so this fixture asks it by name.');
    assert.strictEqual(C.HASHTAG_SEARCH_HREF_RE.test(F6B_HREF), true,
      'and stated positively so this case cannot pass by the predicate ' +
      'matching nothing at all');
  });

testCase('F6b-3 HALF 2: a RUN of two or more tags on one line loses its marks',
  function () {
    const src = '亲爱的 请同我一起深陷泥沼吧\n\n#短发 #穿搭灵感 #fyp #中性风 #古早';
    const out = hashtagCarveOut('F6b-3', src);
    assert.strictEqual(out, '亲爱的 请同我一起深陷泥沼吧\n\n短发 穿搭灵感 fyp 中性风 古早',
      'A PLATFORM HASHTAG NEVER TRAVELS ALONE — it arrives in the tag block ' +
      'at the tail of a post. Every word she saved is still there; only the ' +
      'platform\'s five `#` marks are gone.');
    assert.strictEqual(C.HASHTAG_RUN_MIN, 2,
      'and the run minimum is exported, so this fixture asserts the contract ' +
      'against the CONSTANT rather than against a literal 2');
  });

testCase('F6b-4 HALF 2 the load-bearing counter-cases, each named',
  function () {
    // Every one of these is a REAL shape from her live library, and every one
    // of them is a place the naive predicate would have struck.
    const cases = [
      ['- [[Channel - bugs (C05G8HM6LCD)|Slack Channel #bugs — Aug 2024]]',
        'a SLACK CHANNEL NAME in her HR evidence. 49 of the 214 hits the ' +
        'run rule rejects are these; stripping there corrupts a legal record.'],
      ['# 新疆西辣蛋', 'an ATX heading — `# ` followed by a space is never a tag'],
      ['### 做法', 'and a deeper one'],
      ['# Todo #urgent #work', '26.88 code review IN-01: A HEADING THAT ' +
        'CONTAINS A RUN. The `# ` shape was already refused, so `LIBRARIAN.md` ' +
        'read "never to a heading" and this line came out `# Todo urgent ' +
        'work`. The heading survived AS a heading, so clause 2 above could ' +
        'not see it either — it compares heading LINES, and one moved rather ' +
        'than disappearing. 0 live sites, which is exactly why it stayed ' +
        'invisible; the code is corrected rather than the promise'],
      ['### 做法 #窍门 #小贴士', 'and a deeper heading likewise'],
      ['You can absolutely start with #1, nail mapping, and #2 next.',
        'ISSUE / RANK REFS. A digit may not open a tag.'],
      ['[[编织灵感 玛丽珍袜子|The Knitter #266]] and The Knitter #266 again',
        'a magazine issue number, twice'],
      ['that "tender" gallery-light #fbf7ee). The eye that loved #e8503a.',
        'HEX COLOURS in prose'],
      ['`#applications-team` | C05GBC986N7 | Greg',
        'a channel name inside an INLINE CODE span'],
      ['<a href="content/3/XPROD235_All_Slides.pdf#nameddest=Metrics">PDF</a>',
        'a URL FRAGMENT — 962 of the naive predicate\'s hits are these'],
      ['3CE Tinted Eyebrow Mascara #Brown and Kiss Me 染眉膏 #03',
        'a COSMETICS SHADE CODE, single in prose'],
      ['Sanchez asking for cage adds (#splitwean-requests) today',
        'a single channel name inside parentheses'],
      ['#短发', 'RESIDUAL R1, PINNED AS A RESIDUAL: a genuine LONE social ' +
        'hashtag keeps its mark. Five live notes carry one. The run rule ' +
        'cannot tell it from `Slack Channel #bugs`, and refusing is the safe ' +
        'side of that boundary.']
    ];
    cases.forEach(function (pair) {
      const out = hashtagCarveOut('F6b-4', pair[0]);
      assert.strictEqual(out, pair[0],
        'UNTOUCHED, and this is why the predicate is a RUN rather than "a ' +
        '`#` glued to a word": ' + pair[1] + ' — ' + JSON.stringify(pair[0]));
    });
  });

testCase('F6b-5 HALF 2: a run inside a hands-off zone is untouched',
  function () {
    const src = '正文一句话。\n\n```\n#短发 #穿搭灵感\n```\n\n> #艺术 #创意 #设计\n\n' +
      '%% #tag1 #tag2 %%\n\n*#插画 #板绘*\n\n#真的 #会 #被 #处理';
    const out = hashtagCarveOut('F6b-5', src);
    assert.notStrictEqual(out.indexOf('```\n#短发 #穿搭灵感\n```'), -1,
      'a fenced block is copied exactly');
    assert.notStrictEqual(out.indexOf('> #艺术 #创意 #设计'), -1,
      'and a blockquote run');
    assert.notStrictEqual(out.indexOf('%% #tag1 #tag2 %%'), -1,
      'and an Obsidian comment — which is why the carve-out runs BEFORE the ' +
      '`%%` strip in cleanVaultMarkup: it must see the document she wrote');
    assert.notStrictEqual(out.indexOf('*#插画 #板绘*'), -1,
      'and a D-13 wholly-emphasised caption line');
    assert.notStrictEqual(out.indexOf('\n真的 会 被 处理'), -1,
      'THE COUNTER-CASE, stated positively so this case is not satisfied by ' +
      'a carve-out that does nothing at all: the one run OUTSIDE every zone ' +
      'is stripped.');
  });

// 26.88 code review CR-01: F6b-5 above covers all six zones and every case in
// it is a BARE run, so it fences HALF 2 and nothing else. HALF 1 shipped with
// no zone check at all — an unconditional global replace — and the gauntlet
// stayed green because no fixture ever put the LINK form inside a zone, and
// because no rednote search link happens to sit in one on today's corpus. That
// is a fact about the corpus, not about the fence. Executed at 603bdbf:
//
//   in : "> [#sanjose](https://www.rednote.com/search_result?keyword=sanjose)"
//   out: "> [sanjose](https://www.rednote.com/search_result?keyword=sanjose)"
//
// A `#` deleted from inside a blockquote, and the same inside a fenced block
// and an inline code span. So the LINK form is now placed in EVERY zone, one
// case per zone, each asserted byte-identical, and the counter-case below
// keeps a link OUTSIDE every zone so a HALF 1 that refused everything cannot
// satisfy this block either.
testCase('F6b-5b HALF 1: the LINK form inside a hands-off zone is untouched',
  function () {
    const L = '[#sanjose](' + F6B_HREF + ')';
    const zones = [
      ['a FENCED CODE BLOCK', '```\n' + L + '\n```'],
      ['a BLOCKQUOTE run', '> ' + L],
      ['an OBSIDIAN %% COMMENT', '%% ' + L + ' %%'],
      ['a D-13 WHOLLY-EMPHASISED CAPTION line', '*' + L + '*'],
      ['a TABLE', '| a | b |\n| --- | --- |\n| ' + L + ' | x |'],
      ['an IMAGE / attachment line', '![[pic.jpg]] ' + L],
      ['an INLINE CODE span', '`' + L + '`'],
      ['a BARE URL carrying the shape',
        'https://example.com/x?q=' + encodeURIComponent(L)]
    ];
    zones.forEach(function (pair) {
      const src = '正文一句话。\n\n' + pair[1] + '\n\n收尾一句话。';
      assert.strictEqual(hashtagCarveOut('F6b-5b', src), src,
        'BYTE-IDENTICAL inside ' + pair[0] + '. HALF 1 answers to the same ' +
        'fence HALF 2 does, so a zone this module gains later is a zone BOTH ' +
        'halves lose the same day. ' + JSON.stringify(src));
    });
    const outside = '越南城旁边 ' + L + ' 很值得去。';
    assert.strictEqual(hashtagCarveOut('F6b-5b-out', outside),
      '越南城旁边 [sanjose](' + F6B_HREF + ') 很值得去。',
      'THE COUNTER-CASE, stated positively so this case is not satisfied by ' +
      'a HALF 1 that fires nowhere: the one link OUTSIDE every zone still ' +
      'loses its `#` and stays a link. (The obvious fix — routing HALF 1 ' +
      'through `hashtagProtectedSpans` — would fail exactly here, because ' +
      'that map lists a markdown link as a protected kind and would refuse ' +
      'every one of HALF 1\'s own hits.)');
  });

testCase('F6b-6 the run MINIMUM is the rule, asserted from both sides',
  function () {
    const one = '感受一下 #灵感 而已';
    assert.strictEqual(hashtagCarveOut('F6b-6a', one), one,
      'MIN - 1 tags: untouched');
    const two = '感受一下 #灵感 #艺术 而已';
    assert.strictEqual(hashtagCarveOut('F6b-6b', two), '感受一下 灵感 艺术 而已',
      'MIN tags: stripped. The boundary is asserted at exactly MIN and ' +
      'MIN - 1 so a rule that fired on everything, and a rule that fired on ' +
      'nothing, both fail.');
    // 26.88 code review WR-02 — THIS ASSERTION WAS REVERSED, DELIBERATELY, AND
    // IT IS THE ONE PINNED DECISION THIS PASS OVERTURNS. It used to read
    //   '啦#哈利波特分院帽#钩织图解#今日快乐今日发' -> '啦哈利波特分院帽钩织图解今日快乐今日发'
    // and it cited this same live note as evidence that a directly-adjacent
    // run is a run. It is — the RUN rule is unchanged and still sees three
    // tags here. What changed is which of their marks may be CUT. Read the old
    // output aloud: her sentence and three separate tags become one unbroken
    // run of Chinese characters with no separator anywhere. As saved, the `#`
    // WAS the separator that made them readable, so the carve-out was landing
    // on the wrong side of F-12's own floor — "that reads WORSE than as-saved,
    // which is a floor this phase cannot ship under". `wordsPreserved` cannot
    // see it: `normalizeWords` tokenizes CJK per codepoint and is structurally
    // blind to a weld, which is why a guard alone would not have caught it.
    //
    // THE RULE NOW: a `#` glued to the previous WORD is a separator she is
    // relying on, not a platform sigil. A tag block starts at the start of the
    // document, after whitespace, or after punctuation.
    //
    // MEASURED over all 2,945 live text notes, before and after:
    //   `#` marks the run half cuts                111 -> 102
    //   of those, cuts whose `#` was glued to a letter or a digit   9 -> 0
    //   notes the carve-out touches                 34 -> 34
    // The nine are the welding class and nothing else is lost.
    const glued = '啦#哈利波特分院帽#钩织图解#今日快乐今日发';
    assert.strictEqual(hashtagCarveOut('F6b-6c', glued), glued,
      'BYTE-IDENTICAL. `da5444ca2c71f64a` writes its tags with no space and ' +
      'a CJK character glued to the front of the first; deleting those marks ' +
      'welds her sentence into her tag block.');
    const mixed = '玩的丰臣秀吉#太阁立志传5 #光荣游戏 #日本战国史';
    assert.strictEqual(hashtagCarveOut('F6b-6d', mixed),
      '玩的丰臣秀吉#太阁立志传5 光荣游戏 日本战国史',
      'AND THE RULE IS PER MARK, NOT PER RUN, stated positively so it is not ' +
      'satisfied by a carve-out that gave up on the whole line: the one `#` ' +
      'glued to `秀吉` keeps her separator; the two that follow a space are ' +
      'still the platform\'s and still come off. Live note `6974a936b85f361a`.');
    const punct = '关键词：#汉密尔顿myshot #王安石 和 （#横田海军领 #织女）';
    assert.strictEqual(hashtagCarveOut('F6b-6e', punct),
      '关键词：汉密尔顿myshot 王安石 和 （横田海军领 织女）',
      'PUNCTUATION IS A BOUNDARY, not a weld — a `#` after `：`, `（` or `(` ' +
      'is opening a tag block, and refusing there would cost the carve-out ' +
      'four of its live sites for nothing. Live notes `003df1af1d47c865` and ' +
      '`52b0991542c5c4a1`.');
  });

// 26.88 code review CR-02 — THIS CASE WAS REVERSED. It asserted that
// `cleanVaultMarkup` performs the carve-out, and that placement is exactly
// what the review found: downstream of `bodyGuards`, downstream of
// `renderSavedBody`'s early returns, and downstream of the "show as saved"
// toggle, so the one transform in this module that DELETES characters was the
// one with no runtime guard and no off switch. The carve-out moved up into
// `app.js renderSavedBody`; `cleanVaultMarkup` is byte-faithful on `#` again,
// and this case now fences that in the direction that matters — a
// `cleanVaultMarkup` that quietly regained the carve-out would fail here,
// which is the regression that would silently un-fix all three findings.
testCase('F6b-7 cleanVaultMarkup does NOT carve, at the seam bodyGuards uses',
  function () {
    const src = '一句话。\n\n#短发 #穿搭灵感';
    assert.strictEqual(C.cleanVaultMarkup(src), src,
      'BYTE-IDENTICAL. `cleanVaultMarkup` is the comparison seam ' +
      '`bodyGuards` puts BOTH sides through, and it is what `marked` finally ' +
      'receives. A carve-out here runs after every guard, after every one of ' +
      '`renderSavedBody`\'s early returns, and after the toggle — which is ' +
      'how "show as saved" stopped showing what she saved.');
    assert.notStrictEqual(C.stripHashtagMarkers(src), src,
      'stated positively so this case is not satisfied by a carve-out that ' +
      'no longer works at all: the predicate itself still fires on this body.');
    assert.strictEqual(C.cleanVaultMarkup('%% x %%\n\n[[a|b]]'),
      '\n\n<a href="#" class="wikilink" data-wiki="a">b</a>',
      'and the two things it DOES do — the `%%` strip and the wikilink — are ' +
      'untouched by the move');
  });

testCase('F6b-8 the full ladder stays green with the carve-out in it',
  function () {
    const parts = d15Sentences(8, 4);
    const src = d15Body('F6b-8',
      parts.join('') + '\n\n#短发 #穿搭灵感 #fyp\n', false);
    const out = f4Guards('F6b-8', src);
    assert.notStrictEqual(out.text.indexOf('#短发 #穿搭灵感 #fyp'), -1,
      'THE TRANSFORM DOES NOT DO THIS, and the separation matters: ' +
      '`structureBody` copies the tag line byte-identically, so all four ' +
      'guards see the words unchanged and the note is LAID OUT.');
    const carved = C.stripHashtagMarkers(out.text);
    assert.strictEqual(carved.indexOf('#短发'), -1,
      '...and the carve-out, applied ONE LAYER UP where `renderSavedBody` ' +
      'now applies it, takes the marks off');
    assert.strictEqual(C.wordsPreserved(out.text, carved, []), true,
      'AND THE GUARD renderSavedBody NOW ASKS IS ASKED HERE TOO, over the ' +
      'same two strings it asks about at run time. Before the review nothing ' +
      'asked it on the render path at all: `mood #sad#tired` -> ' +
      '`mood sadtired` is output this very predicate rejects, and it ' +
      'rendered.');
  });

testCase('F6b-9 the carve-out at its edges',
  function () {
    assert.strictEqual(typeof C.stripHashtagMarkers, 'function',
      'exported BY NAME — the one character-deleting rule in this module is ' +
      'not allowed to be anonymous');
    assert.strictEqual(C.stripHashtagMarkers(''), '',
      'SRM-01 [empty]: an empty string raises nothing');
    assert.strictEqual(C.stripHashtagMarkers(null), '',
      'and a null body is the empty string, never an exception');
    assert.deepStrictEqual(C.hashtagRunSpans(null), [],
      'and the reach of a null body is the empty list');
    assert.deepStrictEqual(C.hashtagRunSpans('#a #b'), [0, 3],
      'THE REACH IS CHECKABLE BY OFFSET, not only by output');
    assert.deepStrictEqual(C.hashtagRunSpans('#a\n#b'), [],
      'and a run may never cross a line ending: two tags on two lines are ' +
      'two lone tags, not a run');

    // THE TWO CLAUSES THE OUTPUT CASES ABOVE COULD NOT FENCE, asserted at the
    // PREDICATE instead. Recorded honestly rather than quietly: the first
    // widening gauntlet run for this carve-out found that mutating either of
    // these left every output case GREEN, because the RUN rule was already
    // refusing the same shapes for a different reason. Two false holes, in a
    // gate written to catch exactly that — the phase's own defect class, in
    // its own fence, for the third time. These two assertions close them.
    assert.deepStrictEqual(C.hashtagRunSpans('Try #1 #2 #3 in order.'), [],
      'A DIGIT MAY NOT OPEN A TAG, and this is the only case that fences it. ' +
      'A rank list is a RUN by shape — three marks, one line, whitespace ' +
      'between — so the run rule alone permits it and only the first-' +
      'character clause refuses. HONEST LABEL: measured over the live ' +
      'library, widening that clause to admit digits changes the carve-out\'s ' +
      'reach on ZERO notes today. It is kept, and fenced here, because the ' +
      'shape exists and the corpus simply has not met it yet.');
    assert.deepStrictEqual(C.hashtagRunSpans('### 做法'), [],
      'AN ATX HEADING IS NEVER A TAG, asserted on the run of hashes that ' +
      'opens one. Two independent clauses refuse it — a `#` cannot be a tag\'s ' +
      'first character, and a tag\'s body may not be empty — which is why no ' +
      'single-clause mutation could turn this red through the output cases.');
    assert.deepStrictEqual(C.hashtagRunSpans('# a # b'), [],
      '...and the same for a space-led `# `, twice on one line, which is a ' +
      'RUN by every measure except the one that matters');
  });

// ---- F12-1..F12-6: 26.88-20, F-12 — an enumerator's dot is not a full stop --
//
// F-4's family, one punctuation mark over. D-15 broke a paragraph at every
// ASCII period followed by whitespace, and an ordered-list enumerator's `1.`
// IS a period followed by whitespace — so the numeral was cut off from the
// sentence it numbers and left alone in its own block.
//
// REPRODUCED BEFORE THE FIX, at `0a4a221`, on the exact string:
//   CORE.splitSentences('我的几点感受： 1. 费曼父亲对他的引导非常重要。' +
//                       ' 2. 费曼很有自己的主见。')
//     -> ["我的几点感受： 1.", "费曼父亲对他的引导非常重要。",
//         "2.", "费曼很有自己的主见。"]
// Live note `703412c23a752cf6` (观后感 — 费曼采访的几点感受) therefore laid its
// five numbered points out as TEN blocks, five of them a bare numeral. All
// four guards were GREEN on it — every word survived, no markup pair moved,
// no heading was bound to nothing — which is the SIXTH time in this phase
// that word preservation has been necessary and nowhere near sufficient.
//
// THE OWNER SAW IT during the plan-20 UAT (2026-08-03) and said the sentences
// after 1./2./3. "should be connected together". It reads WORSE than as-saved,
// which is the floor this phase cannot ship under.
//
// BOTH DIRECTIONS ARE ASSERTED, and F12-3 is the load-bearing one: a refusal
// that fires on ANY period preceded by a digit would satisfy F12-1 and F12-2
// and would silently stop every English sentence that ends on a number from
// splitting. `…in 1999. The next…` must still split, and it is asserted by the
// emitted block COUNT so a refuse-everything implementation cannot reach it.

// The enumerated wall, as one line, in the owner's own shape: a colon-led lead
// clause, then numbered points whose sentences end in `。`.
const F12_ENUM_LEAD = '我的几点感受：';
const F12_ENUM_ITEMS = [
  ' 1. 费曼父亲对他的引导非常重要。',
  ' 2. 费曼很有自己的主见。',
  ' 3. 他的谈吐举止谦虚而自信，言之有物、言之有理。',
  ' 4. 他的说话很有条理性。',
  ' 5. 他能理解别人的观点以及对方输出该观点的原因，也不把自己的观点强加于人。'
];

testCase('F12-1 the splitter never ends a sentence on an enumerator\'s period',
  function () {
    const src = F12_ENUM_LEAD + F12_ENUM_ITEMS.join('');
    const segs = C.splitSentences(src);
    assert.notStrictEqual(segs, null, 'sanity: this wall does offer splits');
    segs.forEach(function (s) {
      assert.strictEqual(/^\d{1,3}\.$/.test(s), false,
        'NO SEGMENT IS A BARE NUMERAL. Before the fix this exact string ' +
        'produced the segments "我的几点感受： 1." and "2." — the numeral cut ' +
        'off from the sentence it numbers. Offending segment: ' +
        JSON.stringify(s));
      assert.strictEqual(/\s\d{1,3}\.$/.test(s), false,
        '...and no segment ENDS on one either, which is the other half of ' +
        'the same orphaning: ' + JSON.stringify(s));
    });
    assert.deepStrictEqual(segs, [
      F12_ENUM_LEAD + F12_ENUM_ITEMS[0],
      F12_ENUM_ITEMS[1].trim(), F12_ENUM_ITEMS[2].trim(),
      F12_ENUM_ITEMS[3].trim(), F12_ENUM_ITEMS[4].trim()
    ], 'BYTE FOR BYTE: five segments, each numeral riding with its own ' +
      'sentence, and the lead clause riding with the first item exactly as ' +
      'she typed it. The `。` at the end of each point still splits — the ' +
      'refusal is about the enumerator\'s dot and about nothing else.');
  });

testCase('F12-2 the enumerated wall lays out with no orphaned numeral',
  function () {
    const filler = d15Sentences(6, 4).join('');
    const src = d15Body('F12-2',
      filler + F12_ENUM_LEAD + F12_ENUM_ITEMS.join(''));
    assert.strictEqual(src.indexOf('\n'), -1, 'the specimen is ONE line');
    assert.ok(src.length > C.SENTENCE_BREAK_MIN,
      'and over the threshold, sized from the exported constant');

    const out = f4Guards('F12-2', src);
    out.text.split(/\n[ \t]*\n/).forEach(function (b) {
      assert.strictEqual(/^\d{1,3}\.$/.test(b.trim()), false,
        'NO EMITTED BLOCK IS A BARE NUMERAL — asserted on the emitted ' +
        'markdown, which is what the reader sees, and not on the splitter ' +
        'alone. Live note 703412c23a752cf6 emitted five of these. Block: ' +
        JSON.stringify(b));
    });
    assert.notStrictEqual(out.text.indexOf('\n\n2. 费曼很有自己的主见。\n'), -1,
      'and stated positively so a rule that DROPPED the numerals would also ' +
      'fail: the numeral and its sentence arrive as ONE block, together');
    assert.strictEqual(d15NoSpace(out.text), d15NoSpace(src),
      'and a blank line is still the ENTIRE intervention — no word moved, ' +
      'added, removed or changed (the S8/S11 equality, stronger than ' +
      'wordsPreserved because it never normalises punctuation away)');
  });

testCase('F12-3 the counter-case: a sentence ending on a number STILL splits',
  function () {
    const parts = ['He was born in 1999. ', 'The next year everything changed. ',
      'It rained for a week. ', 'Then the summer came. ',
      'She scored 12345 points. ', 'Nothing else happened. '];
    const src = d15Body('F12-3',
      parts.join('') + d15Sentences(4, 4).join(''));
    assert.ok(src.length > C.SENTENCE_BREAK_MIN, 'sanity: over the threshold');

    const out = f4Guards('F12-3', src);
    const blocks = out.text.split(/\n[ \t]*\n/);
    assert.strictEqual(blocks.length, parts.length + 4,
      'ASSERTED BY NUMBER, and this is the case that makes the fix ' +
      'non-degenerate. A refusal keyed on "a period with a digit in front of ' +
      'it" would satisfy F12-1 and F12-2 and would collapse this to ONE ' +
      'block — every English sentence that ends on a year, a count or a page ' +
      'number would stop splitting. `1999` is FOUR digits, so the backward ' +
      'scan walks three and finds a digit in front of them, which is not a ' +
      'boundary. Got ' + blocks.length + ' blocks: ' + JSON.stringify(blocks));
    assert.strictEqual(blocks[0], 'He was born in 1999.',
      'stated sharply on the sentence itself');
  });

testCase('F12-5 splitsOrdinalEnumerator, the predicate itself, at its edges',
  function () {
    assert.strictEqual(typeof C.splitsOrdinalEnumerator, 'function',
      'exported BY NAME, like every other predicate this phase has shipped');
    assert.strictEqual(C.ORDINAL_ENUMERATOR_MAX_DIGITS, 3,
      'and the bound is exported beside it, so this fixture asserts the ' +
      '1-3-digit contract against the CONSTANT rather than against a literal ' +
      '3 typed a fourth time in this repository');
    // 26.88 code review WR-03 — THIS CASE WAS `'x 1. y'` -> true, AND IT WAS
    // THE OVER-BROAD RULE STATED AS A FIXTURE. `x 1. y` is a lone numeral in
    // prose with a word in front of it: it is the same shape as `Not step 5.`
    // and `by December 4.`, which the review measured as breaks the rule was
    // WRONGLY refusing. An enumerator is one of a SEQUENCE, or it opens a
    // clause; a numeral that is neither is a number.
    assert.strictEqual(C.splitsOrdinalEnumerator('x 1. y 2. z', 3), true,
      'a one-digit enumerator with a space in front, a space behind, and ITS ' +
      'SUCCESSOR later in the block');
    assert.strictEqual(C.splitsOrdinalEnumerator('x 1. y', 3), false,
      '...and the SAME string without the `2.` is a number in her prose. ' +
      'This is `Not step 5.` exactly, and refusing it glued nine real ' +
      'sentences to the next one on the live library.');
    assert.strictEqual(C.splitsOrdinalEnumerator('：12. y', 3), true,
      '...and fullwidth punctuation in front OPENS a clause, so it is an ' +
      'enumerator with no sequence needed — `我的几点感受：1.` is her shape');
    assert.strictEqual(C.splitsOrdinalEnumerator('until 12:30. I', 11), false,
      'BUT A COLON WITH A DIGIT IN FRONT OF IT IS A CLOCK, not a clause ' +
      'opener. Live note `78bbe62cf57a4b89`: "…until 12:30." stopped ' +
      'breaking from "I understand how important…".');
    assert.strictEqual(C.splitsOrdinalEnumerator('123. y', 3), true,
      'THE BOUND ITSELF, from the other side: three digits at the very start ' +
      'of the block is still an enumerator');
    assert.strictEqual(C.splitsOrdinalEnumerator('in 1999. The', 7), false,
      'FOUR digits is a number in prose, not an enumerator — the one case ' +
      'this rule must never refuse');
    assert.strictEqual(C.splitsOrdinalEnumerator('v1. Then', 2), false,
      'a letter glued to the digit is a version, not an item marker');
    assert.strictEqual(C.splitsOrdinalEnumerator('2.5mm', 1), false,
      'a digit behind the dot is a decimal — already refused a clause ' +
      'earlier by the terminator guard, and stated locally so the predicate ' +
      'is honest read on its own');
    assert.strictEqual(C.splitsOrdinalEnumerator('结束了1。 x', 4), false,
      'THE FULLWIDTH `。` IS NOT AN ENUMERATOR\'S MARK. Refusing there would ' +
      'refuse the entire CJK half of D-15\'s rule.');
    assert.strictEqual(C.splitsOrdinalEnumerator('abc. x', 3), false,
      'no digit run at all');
    assert.strictEqual(C.splitsOrdinalEnumerator('', 0), false,
      'SRM-01 [empty]: an empty string raises nothing and answers false');
    assert.strictEqual(C.splitsOrdinalEnumerator('abc', 99), false,
      'an index past the end answers false rather than raising');
    assert.strictEqual(C.splitsOrdinalEnumerator('abc', -1), false,
      'and so does a negative index');
    assert.strictEqual(C.splitsOrdinalEnumerator(null, 0), false,
      'and so does a null body — the never-raises posture openSpanAt takes');
  });

// 26.88 code review WR-03 — THE COUNTERWEIGHT F-12 SHIPPED WITHOUT.
//
// F12-1/2/3 all ask "does the rule stop an enumerator being orphaned?" and one
// of them asks "does a four-digit year still split?". None of them asks the
// question the review found: DOES A ONE-TO-THREE-DIGIT NUMBER ENDING A REAL
// SENTENCE STILL SPLIT? It did not. Measured over the live library with the
// shipped seam toggled: 34 notes changed shape, and the guard refused 102 more
// block boundaries than it allowed — most of them genuine enumerators, and at
// least nine of them plain full stops.
//
// EVERY STRING BELOW IS FROM THE REVIEW'S OWN TABLE, from a named live note.
// Each one returned `null` from `splitSentences` — no legal split point in the
// whole passage — before this fix.
const F12_FALSE_REFUSALS = [
  ['5fb4da8e7303fa4b',
    'They only want an **update** by December 4. So you can safely reply:'],
  ['5fb4da8e7303fa4b', 'You are somewhere between step 1 and 2. Not step 5. ' +
    'Your nervous system is jumping to step 5 already.'],
  ['1eada79e74963cb6', 'I have read it three times, at ages 10, 18, and 28. ' +
    'Each reading brought new insights.'],
  ['1eada79e74963cb6', 'I have read over 3 times, the first time I was 10, ' +
    'and then 18 and 28. I think everytime when I read this book, I always ' +
    'have different takeaways.'],
  ['e6c0c5e06affdc9c', 'He said I throw the money away for this $800. ' +
    'Of course, he could not understand that.'],
  ['e6c0c5e06affdc9c', 'He did not buy any gift for 2/14. Now I know, ' +
    'because he wants to divorce.'],
  ['78bbe62cf57a4b89', 'I did not realize I had missed your message until ' +
    '12:30. I understand how important it is to you.'],
  ['(constructed)',
    'I walked 100. Then I slept for a very long time and woke up better.']
];

testCase('F12-7 a real full stop after a small number STILL breaks',
  function () {
    F12_FALSE_REFUSALS.forEach(function (pair) {
      const segs = C.splitSentences(pair[1]);
      assert.notStrictEqual(segs, null,
        'THE PASSAGE OFFERS A LEGAL SPLIT. Before this fix `splitSentences` ' +
        'returned null here — not one boundary in the whole passage — so ' +
        'her sentence and the next arrived glued together on the reading ' +
        'surface. From live note ' + pair[0] + ': ' + JSON.stringify(pair[1]));
      assert.ok(segs.length >= 2, 'and it is split, not merely non-null');
      assert.strictEqual(segs.join('').replace(/[\s　]+/g, ''),
        pair[1].replace(/[\s　]+/g, ''),
        'and the S8/S11 promise holds on every one of them: slices of the ' +
        'source, in source order, only whitespace moved');
    });
  });

testCase('F12-8 the three ways a numeral earns its refusal, and no fourth',
  function () {
    // (a) IT OPENS ITS LINE. The overwhelming majority of live enumerators.
    assert.strictEqual(C.splitsOrdinalEnumerator('a b\n1. first', 5), true,
      'a line-opening numeral is an enumerator with nothing else needed');
    assert.strictEqual(C.splitsOrdinalEnumerator('a b\n- 1. first', 7), true,
      '...through a list marker, and through indentation');
    // (b) IT OPENS A CLAUSE — a full stop or a colon, then whitespace.
    assert.strictEqual(
      C.splitsOrdinalEnumerator('keep his ego up. 3. When I was there', 18),
      true,
      'live note `e6c0c5e06affdc9c` writes its third item this way, INLINE, ' +
      'after a full stop — and its `1.` and `2.` are in an earlier block, so ' +
      'the sequence test alone cannot see it');
    // (c) IT IS ONE OF A SEQUENCE — a predecessor behind or a successor ahead.
    assert.strictEqual(
      C.splitsOrdinalEnumerator('this program has two parts 1. submit a ' +
        'form 2. the vet reviews it', 28), true,
      'live note `3cde743bb305353b`: no line start and no clause opener, ' +
      'but the `2.` ahead makes the `1.` an enumerator');
    assert.strictEqual(
      C.splitsOrdinalEnumerator('1. a 2. b 3. this is the third', 11), true,
      '...and a predecessor behind does the same, which is what keeps the ' +
      'LAST item of a run from being orphaned (that omission cost five bare ' +
      'numerals on the live corpus when it was measured)');
    // AND NO FOURTH WAY. Every one of these has a small digit run with a
    // non-alphanumeric in front and whitespace behind — the whole of the
    // shipped rule — and not one of them is an enumerator.
    [['ages 10, 18, and 28. Each reading', 19],
      ['an update by December 4. So you can', 23],
      ['for this $800. Of course', 13],
      ['any gift for 2/14. Now I know', 17],
      ['message until 12:30. I understand', 19],
      ['Sonnet 4.6. If using Cursor', 10],
      ['leave through 6/19. You have', 18]
    ].forEach(function (pair) {
      assert.strictEqual(C.splitsOrdinalEnumerator(pair[0], pair[1]), false,
        'A NUMBER IN HER PROSE, and the review found every one of these on a ' +
        'live note: ' + JSON.stringify(pair[0]));
    });
  });

testCase('F12-6 the refusal is a REFUSAL, never a rewrite',
  function () {
    const src = F12_ENUM_LEAD + F12_ENUM_ITEMS.join('');
    const segs = C.splitSentences(src);
    assert.strictEqual(segs.join('').replace(/[\s　]+/g, ''),
      src.replace(/[\s　]+/g, ''),
      'EVERY SEGMENT IS A SLICE OF THE SOURCE, in source order, with only ' +
      'surrounding whitespace removed — the S8/S11 promise, restated for this ' +
      'rule. Nothing is re-joined, renumbered, normalised or re-worded: the ' +
      'author\'s own `1.` `2.` `3.` are the characters she typed.');
    segs.forEach(function (s) {
      assert.notStrictEqual(src.indexOf(s), -1,
        'and each one occurs verbatim in the source: ' + JSON.stringify(s));
    });
  });

// ---- F7-*: 26.88-17, F-7 — the separator run gets two ends ------------------
//
// `splitSeparatorRun` built its FIRST segment from the start of the promoted
// rest and its LAST from whatever followed the final separator. The code said so
// out loud: *"The FINAL segment may be any length and carries whatever follows
// it — ending the run earlier would be a guess, which D-03 forbids."* So the run
// had no ends. On the owner's essay it swallowed a clause into bullet one and a
// whole following sentence into the last bullet; on a recipe it swallowed the
// cooking steps. ALL FOUR GUARDS PASSED IT, because every word survived — the
// fifth time in this phase that word preservation has been necessary and nowhere
// near sufficient.
//
// THE RULE NOW: the run is bounded to THE SENTENCE THAT CONTAINS ITS FIRST
// SEPARATOR, at both ends. Everything before that sentence is emitted as its own
// preceding block; everything after it as its own following block. Both ends
// come from `CORE.runSentenceSpan`, derived from `CORE.splitSentences` — the
// SHIPPED sentence-boundary rule, a fourth caller of one predicate and never a
// second spelling of it. There is no head predicate; see the register of four
// rejected designs in core.js above `splitSeparatorRun`, and the dated amendment
// block in `26.88-17-PLAN.md`.
//
// THE OWNER, live at beat 7 (2026-08-03): *"I still feel the bullet points rule
// is too much like this one 是一个普通人突然碰上完全超出经验范围的事情，会怎么想、
// 怎么怕、怎么判断、怎么失控，或者怎么撑住。 this is the whole sentence, no need to
// break off the sentence as bullet points."* F7-OWNER is that sentence.

// Her exact sentence, as she quoted it. Never edited to suit a fixture.
const F7_OWNER_SENTENCE = '是一个普通人突然碰上完全超出经验范围的事情，' +
  '会怎么想、怎么怕、怎么判断、怎么失控，或者怎么撑住。';

// The live shape of `4e5a6de26cd44d47` 斯蒂芬·金不写怪物, reduced to the two
// sentences that matter. THE SHAPE IS LOAD-BEARING: her sentence is NOT the one
// carrying the run's first separator, and that is exactly why bounding the run
// to the first separator's sentence leaves her sentence alone. A fixture built
// from her sentence ALONE would be one sentence, would carry the first separator
// itself, and would measure nothing.
const F7_ESSAY = '定义：很多人以为他最擅长的是制造怪物、异象、血腥和诡异气氛。' +
  '可按他自己的说法，怪事只是把人物逼到墙角的装置；他真正反复观察的，' +
  F7_OWNER_SENTENCE;

// Shaped on `504c356cb318ac4a` 新疆羊肉抓饭 — the phase's own worked example from
// CONTEXT `<specifics>`, and THE COUNTERWEIGHT. F7-OWNER and F7-PIN cannot both
// be satisfied by any degenerate rule: a splitSeparatorRun that returns null
// unconditionally satisfies F7-OWNER and fails this.
const F7_RECIPE = '学到的新知识：新疆羊肉抓饭，也是乌兹别克斯坦的plov！真的很好吃，' +
  '但认证好吃！！ 🛒 配料比例 • 肉多饭少： 420g羊腿肉 • 主料： • 羊腿肉： 420g (切块) ' +
  '• Jasmine Rice： 315g • 蔬菜： 土豆 4 个 (切丁)、胡萝卜 3 根 (切条)';

const F7_BODIES = [];

// Every emitted line, stripped of the ONE piece of scaffolding its rule adds,
// must occur VERBATIM in the source. Asserted directly and in a loop, in the
// S8/S11 style, so "only whitespace and scaffolding ever move" stays a test
// rather than a claim — and so a case added later inherits it.
function f7Emit(name, src) {
  F7_BODIES.push({ name: name, src: src });
  const r = C.structureBody(src, []);
  const g = C.bodyGuards(src, r.text, r.addedHeadings);
  assert.strictEqual(g.ok, true,
    '[' + name + '] all four guards green: ' + JSON.stringify(g));
  r.text.split('\n').forEach(function (line) {
    const seg = line.replace(/^(## |- )/, '').trim();
    if (!seg) { return; }
    assert.notStrictEqual(src.indexOf(seg), -1,
      '[' + name + '] every emitted segment is a VERBATIM SLICE of the ' +
      'source — nothing re-joined, normalised, reordered or re-worded ' +
      '(law 4). This line is not in the source: ' + JSON.stringify(seg));
  });
  return r.text;
}

testCase('F7-OWNER the sentence the owner pointed at renders as she wrote it',
  function () {
    const out = f7Emit('F7-OWNER', F7_ESSAY);
    assert.notStrictEqual(out.indexOf(F7_OWNER_SENTENCE), -1,
      'HER SENTENCE, VERBATIM AND WHOLE, in the emitted markdown. Before this ' +
      'plan it came out as four bullets: `会怎么想` / `怎么怕` / `怎么判断` / ' +
      '`怎么失控，或者怎么撑住。`');
    const bullets = out.split('\n').filter(function (l) {
      return /^- /.test(l);
    });
    bullets.forEach(function (b) {
      assert.strictEqual(F7_OWNER_SENTENCE.indexOf(b.slice(2)), -1,
        'ZERO LIST MARKERS anywhere inside her sentence, asserted on the ' +
        'EMITTED MARKDOWN and not on a rendered string. This bullet is a ' +
        'fragment of it: ' + JSON.stringify(b));
    });
    assert.strictEqual(out.indexOf('- 怎么怕'), -1,
      'stated sharply on the orphan she saw: `怎么怕` is never an item');
    assert.strictEqual(out, '## 定义\n\n' +
      '- 很多人以为他最擅长的是制造怪物\n- 异象\n- 血腥和诡异气氛。\n\n' +
      '可按他自己的说法，怪事只是把人物逼到墙角的装置；他真正反复观察的，' +
      F7_OWNER_SENTENCE,
      'BECAUSE the run is bounded to the sentence carrying its FIRST ' +
      'separator: `很多人以为…诡异气氛。` is the list, and everything after ' +
      'that sentence — including hers — is emitted as its own block, ' +
      'untouched. The last-separator anchor the plan first specified would ' +
      'have run the list all the way to the end and left her sentence ' +
      'bulleted; that is measured in the plan amendment, row 1.');
  });

testCase('F7-PIN the counterweight: the ingredient block is byte-identical',
  function () {
    const out = f7Emit('F7-PIN', F7_RECIPE);
    const INGREDIENTS = '- 🛒 配料比例\n- 肉多饭少： 420g羊腿肉\n- 主料：\n' +
      '- 羊腿肉： 420g (切块)\n- Jasmine Rice： 315g\n- 蔬菜： 土豆 4 个 (切丁)\n' +
      '- 胡萝卜 3 根 (切条)';
    assert.notStrictEqual(out.indexOf(INGREDIENTS), -1,
      'THE LIST IS STILL EMITTED, AND THAT IS THIS CASE\'S WHOLE JOB. ' +
      '`504c356cb318ac4a`\'s ingredient block is the best output in the ' +
      'corpus and the phase\'s own worked example. THREE candidate F-7 ' +
      'designs — the sentence-final-punctuation predicate, the clause-bound ' +
      'variant, and the plan\'s own headReadsAsItem — each destroy it, ' +
      'measured; all three are recorded as rejected in core.js so none is ' +
      'rediscovered. A fix that deletes the best output in the corpus is not ' +
      'a fix.');
    assert.strictEqual(out, '## 学到的新知识\n\n' +
      '新疆羊肉抓饭，也是乌兹别克斯坦的plov！真的很好吃，但认证好吃！！\n\n' +
      INGREDIENTS,
      'and the ONE movement, stated rather than folded into a pass: the ' +
      'prose intro LEAVES BULLET ONE and becomes its own paragraph. It was ' +
      'never an ingredient; the clippings-processor flattened it onto the ' +
      'same line and the unbounded run swallowed it.');
  });

testCase('F12-4 the pinned recipe: every ingredient bullet is byte-identical',
  function () {
    const out = f7Emit('F12-4', F7_RECIPE);
    assert.notStrictEqual(out.indexOf(
      '- 🛒 配料比例\n- 肉多饭少： 420g羊腿肉\n- 主料：\n' +
      '- 羊腿肉： 420g (切块)\n- Jasmine Rice： 315g\n' +
      '- 蔬菜： 土豆 4 个 (切丁)\n- 胡萝卜 3 根 (切条)'), -1,
      'THE PIN, RE-ASSERTED AT THIS SEAM. `504c356cb318ac4a` 新疆羊肉抓饭 is ' +
      'the phase\'s worked example and the counterweight that makes every ' +
      'F-7 and F-12 gate non-degenerate: a rule that refuses more than it ' +
      'should destroys this block. It was measured byte-identical on the ' +
      'LIVE note before and after F-12 — thirteen ingredient bullets, ' +
      'unchanged. The one line that moved is the F-7 residual R1 tail ' +
      'already stuck to the last bullet, and it moved in this fix\'s own ' +
      'direction (it stopped ending on a bare `1.`); that mover is named in ' +
      '26.88-20-FINDINGS.md rather than absorbed into this pass.');
  });


testCase('F7-HEAD prose in front of the run stays prose, as its own block',
  function () {
    const out = f7Emit('F7-HEAD',
      '工具：这是一段普通的说明文字，出门之前先把要带的东西都摆在桌上。手机、雨伞、钥匙。');
    assert.strictEqual(out, '## 工具\n\n' +
      '这是一段普通的说明文字，出门之前先把要带的东西都摆在桌上。\n\n' +
      '- 手机\n- 雨伞\n- 钥匙。',
      'BECAUSE THE LEFT END IS A BOUND, NOT A REFUSAL. `splitInlineMarks` ' +
      'already enforces "prose in front of a marker is prose, not a list" by ' +
      'requiring an EMPTY head; the separator family cannot require that, ' +
      'because its first item legitimately precedes the first separator. So ' +
      'the run starts where the first separator\'s SENTENCE starts, and the ' +
      'prose in front of that sentence is emitted as prose. Refusing the ' +
      'whole run instead — the plan\'s original headReadsAsItem — would ' +
      'collapse this to one paragraph AND destroy two real ingredient lists ' +
      '(measured; see the plan amendment).');
  });

testCase('F7-TAIL the tail is EMITTED, as its own block, never dropped',
  function () {
    const TAIL = '然后下锅翻炒五分钟，最后加水焖煮到收汁为止。';
    const src = '调料：一点生抽、老抽、料酒，再准备一小勺盐和半勺白糖备用。' + TAIL;
    const out = f7Emit('F7-TAIL', src);
    assert.strictEqual(out, '## 调料\n\n' +
      '- 一点生抽\n- 老抽\n- 料酒，再准备一小勺盐和半勺白糖备用。\n\n' + TAIL,
      'BECAUSE the run ends where the author\'s sentence ends. Before this ' +
      'plan the cooking steps rode inside the last bullet.');
    assert.notStrictEqual(out.indexOf('\n\n' + TAIL), -1,
      'THE TAIL IS EMITTED, as its own block, BYTE-IDENTICAL to its source ' +
      'slice. Asserted positively and not as "the tail is not in the ' +
      'bullet": a rule that DROPPED the tail would satisfy that phrasing, ' +
      'and dropping her words is the one failure this bound could introduce ' +
      '(T-26.88-45).');
    assert.strictEqual(C.wordsPreserved(src, out, []), true,
      'and the independent word check agrees the tail did not go missing');
  });

testCase('F7-DASH the ASCII ` - ` family bounds identically', function () {
    const out = f7Emit('F7-DASH',
      'Ingredients: flour - sugar - butter, and a pinch of salt. ' +
      'Then bake it for twenty minutes.');
    assert.strictEqual(out, '## Ingredients\n\n' +
      '- flour\n- sugar\n- butter, and a pinch of salt.\n\n' +
      'Then bake it for twenty minutes.',
      'THE RULE IS NOT CJK-SPECIFIC. The bound comes from splitSentences, ' +
      'whose ASCII half carries its own terminator guard, so ` - ` runs bound ' +
      'at `. ` exactly as `、` runs bound at `。`');

    // The plan named the string `flour - sugar - butter, then bake.` here. It
    // is ONE SENTENCE, so it offers no boundary after its last separator and
    // the bound is the end of the paragraph — which is exactly today's
    // behaviour. Kept as the half that says so, because "bounds the same way"
    // has to include the case where there is nothing to bound at.
    assert.strictEqual(f7Emit('F7-DASH-nobound',
      'Ingredients: flour - sugar - butter, then bake it all for about twenty minutes.'),
      '## Ingredients\n\n- flour\n- sugar\n' +
      '- butter, then bake it all for about twenty minutes.',
      'a paragraph offering NO sentence boundary is bounded at its end, ' +
      'which is precisely the shipped behaviour — so a body with no ' +
      'boundaries is provably unaffected by this change');
  });

testCase('F7-R1 residual, PINNED AS A RESIDUAL: no boundary, no bound',
  function () {
    const out = f7Emit('F7-R1',
      '包里：手机、雨伞、钥匙等等，装进这个包刚刚好，出门的时候拿了就走真的很方便，一样都不会落下。');
    assert.strictEqual(out, '## 包里\n\n- 手机\n- 雨伞\n' +
      '- 钥匙等等，装进这个包刚刚好，出门的时候拿了就走真的很方便，一样都不会落下。',
      'THIS ASSERTS TODAY\'S KNOWINGLY-IMPERFECT OUTPUT, ON PURPOSE. R1 is ' +
      '`7290c7f718776f1b` 007 钩织 Marni: no sentence boundary lies between ' +
      'the last separator and the end of the paragraph, so there is nothing ' +
      'for the bound to bind to and the tail stays in the last bullet. The ' +
      'only predicate that closes it is the CLAUSE-BOUND variant, which was ' +
      'measured and REJECTED — it re-admits the owner\'s exact quoted ' +
      'sentence as a four-bullet list. A future change that closes R1 fails ' +
      'HERE, loudly, and is read rather than absorbed.');
  });

testCase('F7-R2 residual, PINNED AS A RESIDUAL: a clause head reads as an item',
  function () {
    const out = C.structureBody(F7_ESSAY, []).text;
    assert.notStrictEqual(out.indexOf('- 很多人以为他最擅长的是制造怪物'), -1,
      'THIS ASSERTS TODAY\'S KNOWINGLY-IMPERFECT OUTPUT, ON PURPOSE. R2: a ' +
      'head that is a SHORT CLAUSE carrying no internal punctuation still ' +
      'reads as an item — no author signal separates `很多人以为他最擅长的是' +
      '制造怪物` from a genuine first item, and inventing one would be the ' +
      'guess D-03 forbids. R2 is the residual the plan predicted by name.');
    assert.notStrictEqual(out.indexOf('。\n\n可按他自己的说法'), -1,
      '...BUT ITS TAIL NOW SEPARATES, which is the half this plan closed: ' +
      '`可按他自己的说法…` used to ride inside the third bullet, dragging her ' +
      'sentence in with it.');
  });

// ---- S22-S23: 26.88-17's two new measurement seams, and their fence ---------

testCase('S22 opts.separatorBounds / opts.imageTokenGuard: default is SHIPPED',
  function () {
    const bounded = '调料：一点生抽、老抽、料酒，再准备一小勺盐和半勺白糖备用。' +
      '然后下锅翻炒五分钟，最后加水焖煮到收汁为止。';
    const live = C.structureBody(bounded, []).text;
    const off = C.structureBody(bounded, [],
      { separatorBounds: false }).text;
    assert.notStrictEqual(live, off,
      'THE SEAM MUST ACTUALLY MOVE SOMETHING. An unwired seam prints an ' +
      'IDENTICAL column and makes the measurement that reads it meaningless — ' +
      'the failure plan 13 named explicitly, and the reason `D15_OFF` is a ' +
      'finite number rather than Infinity.');
    assert.strictEqual(off,
      '## 调料\n\n- 一点生抽\n- 老抽\n' +
      '- 料酒，再准备一小勺盐和半勺白糖备用。然后下锅翻炒五分钟，最后加水焖煮到收汁为止。',
      '...and `false` restores the PRE-26.88-17 behaviour exactly, which is ' +
      'what makes the probe\'s twin run attributable to this change and ' +
      'nothing else');

    [undefined, {}, { separatorBounds: true }, { separatorBounds: 'no' },
      { separatorBounds: 0 }, { separatorBounds: null }
    ].forEach(function (opts) {
      assert.strictEqual(C.structureBody(bounded, [], opts).text, live,
        'ONLY the exact value `false` turns the bounds off. Absent, empty, ' +
        'true, a string, 0 and null all leave the SHIPPED behaviour in force, ' +
        'so a typo can never silently measure the wrong transform: ' +
        JSON.stringify(opts));
    });

    const wall = d15Sentences(8, 4).join('') + F4_EMBED;
    const gLive = C.structureBody(wall, []).text;
    const gOff = C.structureBody(wall, [], { imageTokenGuard: false }).text;
    assert.notStrictEqual(gLive, gOff,
      'the image-token seam moves something too');
    assert.strictEqual(/。!\s*\n/.test(gOff), true,
      '`imageTokenGuard: false` restores the PRE-F-4 break — the `!` stranded ' +
      'at the end of a block. That is what lets the probe count the notes F-4 ' +
      'RECOVERED as a difference between two runs of the shipped transform, ' +
      'rather than against a list of fourteen ids somebody typed in.');
    assert.strictEqual(/。!\s*\n/.test(gLive), false,
      '...and the default does not');
    [undefined, {}, { imageTokenGuard: true }, { imageTokenGuard: 'off' }
    ].forEach(function (opts) {
      assert.strictEqual(C.structureBody(wall, [], opts).text, gLive,
        'same resolver discipline on this key: ' + JSON.stringify(opts));
    });

    // 26.88-20 (F-12): THE FOURTH SEAM. Shaped like the live note it was
    // measured on — the enumerated points come at the END of a long wall, not
    // at its head, because a line that OPENS on `1.` is claimed by D-03's
    // ordinal-run rule and never reaches D-15 at all. A fixture built the
    // other way round would test a path the defect does not live on.
    const enumWall = d15Sentences(6, 4).join('') + F12_ENUM_LEAD +
      F12_ENUM_ITEMS.join('');
    const eLive = C.structureBody(enumWall, []).text;
    const eOff = C.structureBody(enumWall, [],
      { ordinalEnumeratorGuard: false }).text;
    const bare = function (t) {
      return t.split(/\n[ \t]*\n/).filter(function (b) {
        return /^\d{1,3}\.$/.test(b.trim());
      }).length;
    };
    assert.notStrictEqual(eLive, eOff,
      'THE SEAM MUST ACTUALLY MOVE SOMETHING, and this one is the reason the ' +
      'key exists: re-running `tools/replan_probe.cjs` across the F-12 fix ' +
      'with no seam produced a BYTE-IDENTICAL output — same sha256 — because ' +
      'not one of its figures counts a block. A re-run that cannot move is ' +
      'not evidence that nothing moved.');
    assert.strictEqual(bare(eOff), F12_ENUM_ITEMS.length - 1,
      '`ordinalEnumeratorGuard: false` restores the PRE-F-12 break, and the ' +
      'count is asserted BY NUMBER: four bare numerals for five points, ' +
      'because the first one rides with the lead clause. That is what lets ' +
      'the probe count F-12 as a difference between two runs of the shipped ' +
      'transform rather than against a note id somebody typed in.');
    assert.strictEqual(bare(eLive), 0, '...and the default emits none');
    [undefined, {}, { ordinalEnumeratorGuard: true },
      { ordinalEnumeratorGuard: 'off' }, { ordinalEnumeratorGuard: 0 },
      { ordinalEnumeratorGuard: null }
    ].forEach(function (opts) {
      assert.strictEqual(C.structureBody(enumWall, [], opts).text, eLive,
        'same resolver discipline on this key: ' + JSON.stringify(opts));
    });

    // AND THE SEAM REACHES **BOTH** CALLERS OF THE REFUSAL. F-12's rule is
    // consulted by D-15's own split AND by `runSentenceSpan`, F-7's bound.
    // A seam wired to only the first prints a mover list short by every note
    // whose shape moves through the second — measured on the live library at
    // exactly one note, `504c356cb318ac4a`, the phase's own pinned recipe.
    // A column that quietly omitted it would be a number that reads rigorous
    // and is wrong, which is the defect class this phase keeps finding.
    assert.deepStrictEqual(
      C.runSentenceSpan('感受： 1. 第一点。 2. 第二点。', 0),
      C.runSentenceSpan('感受： 1. 第一点。 2. 第二点。', 0, true),
      'the default and an explicit true agree');
    assert.notDeepStrictEqual(
      C.runSentenceSpan('感受： 1. 第一点。 2. 第二点。', 0),
      C.runSentenceSpan('感受： 1. 第一点。 2. 第二点。', 0, false),
      'THE THIRD ARGUMENT MUST ACTUALLY MOVE THE BOUND. With the refusal off, ' +
      'the first sentence ends at the enumerator\'s dot; with it on, the ' +
      'bound runs to the end of the sentence the numeral belongs to. An ' +
      'unwired parameter here would leave the probe\'s F-12 mover list short ' +
      'by one and silent about it.');
  });

// app.js, read whole. The three measurement seams are the ONLY way to run the
// shipped transform at a setting `LIBRARIAN.md` does not disclose, so the one
// thing that must stay true of them is that THE ROOM CANNOT REACH THEM.
const APP_SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

testCase('S23 the measurement seams are fenced OUT of app.js', function () {
  // 26.95-04 (#90) adds `breaksOnly` to this list. It is NOT a measurement
  // seam — it is the mode the tidy-up writes files in — but it earns the same
  // fence for a sharper reason: reached by passing options, it would let the
  // room render a body at a setting nobody consented to; reached by NAME
  // (`StudyCore.sentenceBreaksOnly`), the call site says what it is doing. The
  // named door is asserted separately below.
  ['sentenceBreakMin', 'separatorBounds', 'imageTokenGuard',
    'ordinalEnumeratorGuard', 'breaksOnly'].forEach(
    function (key) {
      assert.strictEqual(APP_SRC.indexOf(key), -1,
        'THE SEAM KEY `' + key + '` APPEARS NOWHERE IN app.js. A third ' +
        'argument at the shipped call site means the room could run at a ' +
        'setting LIBRARIAN.md does not disclose — a config surface nobody ' +
        'consented to, on the rule that decides how her sentences are cut ' +
        '(T-26.88-48). The fence is stated on the WHOLE FILE, comments ' +
        'included, because a commented-out third argument is a call site ' +
        'waiting to be uncommented.');
    });
  // 26.88-13 claimed this fence existed for `sentenceBreakMin` and it did NOT
  // — no such fixture was in the repository at `b7d7661`. It does now, and it
  // covers all FOUR keys. Recorded rather than quietly added.
  assert.notStrictEqual(APP_SRC.indexOf('StudyCore.structureBody('), -1,
    'sanity: this case is looking at the file that actually carries the ' +
    'shipped call site, so a green result is not a green result about the ' +
    'wrong file');
  assert.strictEqual(
    /StudyCore\.structureBody\([^)]*,[^)]*,/.test(APP_SRC), false,
    'and stated structurally as well as by name: the shipped call site passes ' +
    'TWO arguments, never three');
});

// 26.95-04 (#90): THE WRITE MODE. Everything above this line is about what the
// room SHOWS. This case is about what it WRITES INTO SOMEBODY'S FILE, which is
// a different bar and gets its own fixtures.
testCase('S24 sentenceBreaksOnly changes whitespace and nothing else',
  function () {
    const ws = (s) => s.replace(/\s+/g, '');
    // Each string below is a wall over SENTENCE_BREAK_MIN carrying ONE of the
    // five non-whitespace rules. Sized from the constant, never from 600.
    const pad = 'This is an ordinary sentence that carries the block over the '
      + 'threshold and says nothing in particular. ';
    const filler = pad.repeat(Math.ceil((C.SENTENCE_BREAK_MIN + 120)
      / pad.length));
    const cases = {
      'colon label': 'State plainly: which install you completed. ' + filler,
      'pin run': '📌 你的餐食总热量 303g 三文鱼配沙拉。 ' + filler,
      'inline ordinals': '1. **Boris Cherny** Manual(~30) → Assisted(~10) → '
        + 'Parallel(~10) → Autonomous(~5). ' + filler,
      'bullet run': 'Ingredients - flour - water - salt - yeast. ' + filler,
      'plain wall': filler
    };
    Object.keys(cases).forEach(function (name) {
      const src = cases[name];
      const out = C.sentenceBreaksOnly(src);
      assert.strictEqual(ws(out), ws(src),
        'THE WRITE MODE IS WHITESPACE-ONLY, and `' + name + '` must not be '
        + 'the exception. Every non-whitespace character of the note survives '
        + 'in its original order; only spacing moves. This is the promise the '
        + 'owner approved at #90 — write the sentence breaks ONLY — and the '
        + 'two rules this fixture exists for (the pin run and the inline '
        + 'ordinal split) were found by measuring her real vault AFTER #90 '
        + 'had named only the colon promotion. Reading the code did not find '
        + 'them.');
    });
    // and the display transform is UNCHANGED — the point of the mode is that
    // one of the two behaviours is withheld from the file, not that the screen
    // changed too.
    const colon = cases['colon label'];
    assert.notStrictEqual(ws(C.structureBody(colon, []).text), ws(colon),
      'sanity: on this same input the DISPLAY rule is still not '
      + 'whitespace-only — it still promotes the colon label. If this ever '
      + 'goes green the fixture has stopped testing the difference it exists '
      + 'to test.');
    assert.notStrictEqual(C.sentenceBreaksOnly(filler), filler,
      'sanity: the mode still BREAKS a plain wall. A mode that changed '
      + 'nothing would pass every whitespace assertion above and be useless.');
  });

testCase('S25 the write mode has exactly one door, and app.js uses it',
  function () {
    assert.strictEqual(typeof C.sentenceBreaksOnly, 'function',
      'the named door is exported');
    assert.strictEqual(C.sentenceBreaksOnly(''), '',
      'an empty body is an empty body, not a throw');
    assert.strictEqual(C.sentenceBreaksOnly(null), '',
      'and a missing body is not a throw either — the writer calls this on '
      + 'whatever a file held');
  });

// ---- verdict ----------------------------------------------------------------

passed.forEach(function (name) { console.log('  case ' + name); });

if (failures.length) {
  console.error('test_reformat_fixtures FAILED — ' + failures.length +
    ' violation(s):');
  failures.forEach(function (f) {
    console.error('  [' + f.name + '] ' + f.reason);
  });
  process.exit(1);
}

console.log('test_reformat_fixtures OK — ' + passed.length + ' cases');
process.exit(0);
