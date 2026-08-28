'use strict';
/* =========================================================================
   tests/test_paragraph_runs.cjs — F-03: the wall of text, broken at DISPLAY
   TIME. Owner ruling, 2026-08-14. Zero-dep node (assert/fs/path only).

   HER FINDING: every screenshot note renders as one unbroken block. True —
   the on-device reader returns NO line breaks at all, so machine-read text
   arrives as a single run however long it is.

   ⚠ AND THE HEADLINE IS BIGGER THAN THE PROBLEM, WHICH IS WHY THE FIRST CLAIM
   BELOW IS ABOUT WHAT IS *NOT* TOUCHED. Measured over her 3,067 notes: median
   length 338 characters, p90 849, and only ~5% carry a block over 1,000. A
   338-character note IS a paragraph. Breaking it would invent a structure that
   is not in the text — the same class of mistake as the sliver thumbnail, one
   layer down. So the great majority of notes must come back BYTE-IDENTICAL,
   and a suite that only checked "long things get split" would happily pass a
   version that shredded every short note she owns.

   THE FOUR WAYS THIS GOES WRONG, EACH OF WHICH PASSES A NAIVE TEST:

     1. IT TOUCHES WHAT IT SHOULD NOT. Short notes, lists, quotes, tables and
        fenced blocks all already have a shape.
     2. IT LOSES A CHARACTER. The only thing it may drop is whitespace ALREADY
        sitting between two sentences. Every other character must survive, in
        order — checked here against the shipped `wordsPreserved`.
     3. IT CUTS WHERE IT MUST NOT. A cut is only safe after CJK sentence
        punctuation (its own token) or at latin punctuation ALREADY followed
        by whitespace. Cutting between two touching characters would fuse or
        split a word.
     4. IT WRITES. Nothing here writes; this is the display path only, and the
        note on disk keeps the bytes the reading pass gave it.

   ⚠ THE REAL LIBRARY IS NOT READ BY THIS SUITE. Every case is a fixture built
   here, so the gate runs on any machine and in any checkout. The measurements
   quoted above came from a one-off read and are recorded as prose, not as
   assertions about files that may not exist.

   Prints its counts and exits 0 on success; exits 1 on the first throw.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function loadCore(src) {
  const w = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', 'exports', src)(w, { exports: {} }, {});
  assert.ok(w.StudyCore && w.StudyCore.splitLongRuns,
    'core.js must export splitLongRuns');
  return w.StudyCore;
}

/* ---- fixtures ------------------------------------------------------------ */

function sentencesCJK(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push('这是第' + i + '句话，讲的是一件很平常的事情，没有什么特别的地方。');
  }
  return out.join('');
}
function sentencesEN(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push('This is sentence number ' + i +
      ' and it runs on for a while so the block gets long enough to matter.');
  }
  return out.join(' ');
}

/* ---- the claims ---------------------------------------------------------- */

// ---- F-02 (owner ruling 2026-08-14): "show the repeat, but quietly" -------
//
// Two screenshots of one scroll overlap, so the shared words appear twice —
// 203 of her 376 seams, 12,410 characters. She ruled that the repeat is DIMMED
// rather than removed: hiding it is truncation of resurfaced content, which
// law 4 forbids outright and which would have needed an amendment from her.
// So the claim that matters most is that NOTHING IS LOST.

function claimSeamRepeatIsFound(C) {
  const out = [];
  const shared = 'the quick brown fox jumps over the lazy dog and keeps going';
  const first = 'opening words. ' + shared;
  const second = '9:41 AM chrome debris ' + shared + ' and then new words';
  const r = C.seamRepeats([first, second]);
  if (r.length !== 1) { return ['[seam] one seam must give one answer']; }
  if (r[0].len < shared.length) {
    out.push('[seam] the whole shared run must be found — got ' + r[0].len +
      ' of ' + shared.length);
  }
  if (r[0].text.indexOf(shared) === -1) {
    out.push('[seam] the repeat TEXT must travel, not just its length: ' +
      'markdown drops syntax, so a source offset does not survive into the ' +
      'rendered note and the reader has to search for the words');
  }
  // ⚠ AND IT MUST NOT REQUIRE THE REPEAT TO START AT CHARACTER ZERO. A first
  // draft did, and matched 24 of her 203 real overlaps: the next screenshot
  // leads with its OWN status bar, so the median repeat begins 77 characters
  // in.
  if (r[0].at === 0) {
    out.push('[seam] the fixture puts chrome before the repeat on purpose; ' +
      'an offset of 0 means the search is anchored to the head again');
  }
  return out;
}

function claimHerOwnRepetitionIsLeftAlone(C) {
  const out = [];
  // The same phrase twice, but nowhere near a seam window on either side.
  // ⚠ THE FILLER MUST NOT REPEAT ITSELF. A first draft used 900 identical
  // characters, and the two windows then genuinely shared a 600-character run
  // — the detector was right and the fixture was wrong.
  // ⚠ AND THE TWO SIDES MUST NOT SHARE THEIR FILLER EITHER. A second draft
  // used ONE filler on both sides; the tail window and the head window then
  // overlapped inside it and shared 294 characters. Two distinct fillers.
  const fill = function (tag) {
    let f = '';
    for (let n = 0; f.length < 900; n++) { f += ' ' + tag + n; }
    return f;
  };
  const phrase = 'in the morning I made coffee and sat down';
  const r = C.seamRepeats([phrase + fill('alpha'), fill('bravo') + phrase]);
  if (r[0].len !== 0) {
    out.push('[seam] words repeating far from the seam are HERS twice, not a ' +
      'capture overlap, and must stay at full strength — dimmed ' +
      r[0].len + ' characters');
  }
  // and a short echo is a coincidence, not an overlap
  const short = C.seamRepeats(['aaa the end', 'the end bbb']);
  if (short[0].len !== 0) {
    out.push('[seam] a run under ' + C.SEAM_REPEAT_MIN + ' characters is as ' +
      'likely an ordinary phrase as an overlap; dimming those puts grey ' +
      'patches through her prose');
  }
  return out;
}

function claimNothingIsRemovedAtASeam(C) {
  const out = [];
  const shared = 'the quick brown fox jumps over the lazy dog and keeps going';
  const secs = ['opening words. ' + shared,
    '9:41 AM debris ' + shared + ' and then new words'];
  const r = C.seamRepeats(secs);
  // seamRepeats REPORTS; it must never return edited sections
  if (typeof r[0].len !== 'number' || typeof r[0].text !== 'string') {
    out.push('[seam] the detector must report {at, len, text} and nothing else');
  }
  const joined = secs.join('');
  if (joined.indexOf(shared) === -1 ||
      joined.indexOf(shared, joined.indexOf(shared) + 1) === -1) {
    out.push('[seam] the fixture lost a copy before the detector even ran');
  }
  return out;
}

function claimShortNotesAreUntouched(C) {
  const out = [];
  const cases = [
    ['a median-length note', sentencesCJK(6)],
    ['a note just under the threshold', sentencesEN(9)],
    ['a single sentence', '他说这是真的。'],
    ['empty', '']
  ];
  cases.forEach(function (c) {
    if (c[1].length >= C.RUN_SPLIT_MIN && c[0].indexOf('under') !== -1) {
      out.push('[runs] fixture "' + c[0] + '" is ' + c[1].length +
        ' chars, not under the ' + C.RUN_SPLIT_MIN + ' threshold — the ' +
        'fixture is wrong, not the code');
      return;
    }
    const got = C.splitLongRuns(c[1]);
    if (got !== c[1]) {
      out.push('[runs] ' + c[0] + ' (' + c[1].length + ' chars) must come ' +
        'back byte-identical — a note the length of a paragraph IS a ' +
        'paragraph, and breaking it invents a structure that is not there');
    }
  });
  return out;
}

function claimStructureIsLeftAlone(C) {
  const out = [];
  const long = sentencesEN(40);
  const cases = [
    ['a list', long.split('. ').map(function (s) { return '- ' + s; }).join('\n')],
    ['a quote', '> ' + long],
    ['a table', '| a | b |\n| - | - |\n' + long],
    ['a fence', '```\n' + long + '\n```'],
    ['a numbered list', '1. ' + long]
  ];
  cases.forEach(function (c) {
    if (c[1].length < C.RUN_SPLIT_MIN) {
      out.push('[runs] fixture "' + c[0] + '" is too short to exercise the ' +
        'rule (' + c[1].length + ' chars)');
      return;
    }
    if (C.splitLongRuns(c[1]) !== c[1]) {
      out.push('[runs] ' + c[0] + ' already has a shape and must be left ' +
        'exactly as it is');
    }
  });
  return out;
}

// ⚠ A SINGLE NEWLINE IS NOT A SHAPE, AND THIS CLAIM IS THE ONE THAT CAUGHT THE
// FIRST DRAFT. Markdown renders a lone newline as a space, so a two-line block
// of plain prose is still ONE paragraph on screen. Skipping those threw away
// 183 of the ~200 long blocks in her library — the fix looked like it worked
// and did almost nothing.
function claimALoneNewlineIsNotStructure(C) {
  const out = [];
  const half = sentencesEN(20);
  const block = half + '\n' + half;
  if (block.length < C.RUN_SPLIT_MIN) {
    return ['[runs] fixture too short (' + block.length + ')'];
  }
  const got = C.splitLongRuns(block);
  if (got === block) {
    out.push('[runs] a long block of plain prose that merely contains a lone ' +
      'newline must still be broken — markdown renders that newline as a ' +
      'space, so on screen it is exactly the wall this exists for');
  }
  return out;
}

function claimLongRunsAreBroken(C) {
  const out = [];
  [['Chinese', sentencesCJK(40)], ['English', sentencesEN(40)]].forEach(
    function (c) {
      const got = C.splitLongRuns(c[1]);
      const parts = got.split('\n\n').filter(function (x) { return x.trim(); });
      if (parts.length < 2) {
        out.push('[runs] a long ' + c[0] + ' run (' + c[1].length +
          ' chars) must be broken into paragraphs — got ' + parts.length);
        return;
      }
      const longest = Math.max.apply(null, parts.map(function (p) {
        return p.length;
      }));
      if (longest >= c[1].length) {
        out.push('[runs] the ' + c[0] + ' run was "split" without shortening ' +
          'anything — longest paragraph ' + longest + ' of ' + c[1].length);
      }
    });
  return out;
}

// The whole safety case, asked of the SHIPPED guard rather than re-derived.
function claimNotAWordIsLost(C) {
  const out = [];
  const cases = [
    ['Chinese', sentencesCJK(40)],
    ['English', sentencesEN(40)],
    ['mixed', sentencesCJK(20) + sentencesEN(20)],
    ['prose with lone newlines', sentencesEN(20) + '\n' + sentencesEN(20)]
  ];
  cases.forEach(function (c) {
    const got = C.splitLongRuns(c[1]);
    if (!C.wordsPreserved(c[1], got, [])) {
      out.push('[runs] ' + c[0] + ': the word sequence changed. The only ' +
        'thing this may drop is whitespace already sitting between two ' +
        'sentences.');
    }
    // and every non-whitespace character, in order — stricter than words
    const strip = function (s) { return s.replace(/[\s　]+/g, ''); };
    if (strip(got) !== strip(c[1])) {
      out.push('[runs] ' + c[0] + ': a non-whitespace character was added or ' +
        'lost');
    }
  });
  return out;
}

// Cutting between two touching characters would fuse or split a word. The
// only cut points are after CJK punctuation, or at latin punctuation that
// ALREADY has whitespace after it.
function claimNeverCutsBetweenTouchingCharacters(C) {
  const out = [];
  // 40 latin sentences with NO space after the full stop — every terminator
  // is glued to the next word, so there is nothing safe to cut and the block
  // must come back whole.
  const glued = sentencesEN(40).replace(/\. /g, '.');
  const got = C.splitLongRuns(glued);
  if (got !== glued) {
    const parts = got.split('\n\n');
    out.push('[runs] a run whose sentence punctuation is glued to the next ' +
      'word has no safe cut point and must come back whole — it was broken ' +
      'into ' + parts.length + ' paragraphs, which fuses or splits a word');
  }
  return out;
}

/* The wiring: the reader has to actually call it, and only for the notes it
   is meant for. Read off app.js, because every claim above would stay green
   with the call site deleted. */
function claimTheReaderIsWired(src) {
  const out = [];
  const fnStart = src.indexOf('function renderSavedBodyLaidOut(');
  if (fnStart === -1) {
    return ['[runs] renderSavedBodyLaidOut must exist in app.js'];
  }
  const fn = src.slice(fnStart, src.indexOf('\n  }\n', fnStart));
  if (fn.indexOf('StudyCore.splitLongRuns(src)') === -1) {
    out.push('[runs] the reader must call splitLongRuns — without it the ' +
      'wall is never broken and every other claim here still passes');
  }
  if (fn.indexOf('isScreenshotNote(item)') === -1) {
    out.push('[runs] the layout must be scoped to notes the ROOM made. Law ' +
      "9's fourth clause: where it cannot tell who wrote a thing, it leaves " +
      'the note alone.');
  }
  if (fn.indexOf('StudyCore.bodyGuards(src, runs, [])') === -1) {
    out.push('[runs] the shipped guard must be asked before the laid-out ' +
      'body is returned — a note whose markup would break across a new ' +
      'paragraph must render as it does today');
  }
  // and the screenshot branch must sit ABOVE the personal-note refusal, or it
  // can never be reached: isPersonalNote is true for every one of these.
  const branch = fn.indexOf('isScreenshotNote(item)');
  const personal = fn.indexOf('StudyCore.isPersonalNote(item, fm)');
  if (branch !== -1 && personal !== -1 && branch > personal) {
    out.push('[runs] the screenshot branch must come BEFORE the personal-note ' +
      'refusal — these notes carry no frontmatter, so isPersonalNote returns ' +
      'true for every one and the branch below it is unreachable');
  }
  return out;
}

/* ---- the drill ----------------------------------------------------------- */

const CORE_CLAIMS = [
  ['a seam repeat is found, wherever it starts', claimSeamRepeatIsFound],
  ['her own repetition is left alone', claimHerOwnRepetitionIsLeftAlone],
  ['nothing is removed at a seam', claimNothingIsRemovedAtASeam],
  ['short notes are untouched', claimShortNotesAreUntouched],
  ['structure is left alone', claimStructureIsLeftAlone],
  ['a lone newline is not structure', claimALoneNewlineIsNotStructure],
  ['long runs are broken', claimLongRunsAreBroken],
  ['not a word is lost', claimNotAWordIsLost],
  ['never cuts between touching characters',
    claimNeverCutsBetweenTouchingCharacters]
];

const CORE_MUTATIONS = [
  ['ANCHORED TO THE HEAD AGAIN: 24 of her 203 overlaps found',
    function (s) {
      return s.replace('      out.push(run.len >= SEAM_REPEAT_MIN',
        '      out.push(run.len >= SEAM_REPEAT_MIN && run.bAt === 0');
    },
    claimSeamRepeatIsFound],

  ['THE MINIMUM GOES: coincidences are dimmed as repeats',
    function (s) {
      return s.replace('  var SEAM_REPEAT_MIN = 20;', '  var SEAM_REPEAT_MIN = 1;');
    },
    claimHerOwnRepetitionIsLeftAlone],

  ['THE SEAM WINDOW OPENS WIDE: her own repetition is dimmed',
    function (s) {
      return s.replace('  var SEAM_WINDOW = 600;', '  var SEAM_WINDOW = 100000;');
    },
    claimHerOwnRepetitionIsLeftAlone],

  ['NO THRESHOLD: every note is shredded',
    function (s) {
      return s.replace('      if (block.length < RUN_SPLIT_MIN) { return block; }\n', '');
    },
    claimShortNotesAreUntouched],

  ['STRUCTURE IS SPLIT TOO',
    function (s) {
      return s.replace('      if (hasStructuredLine(block)) { return block; }\n', '');
    },
    claimStructureIsLeftAlone],

  ['A LONE NEWLINE COUNTS AS STRUCTURE AGAIN (the first draft)',
    function (s) {
      return s.replace('      if (hasStructuredLine(block)) { return block; }',
        "      if (block.indexOf('\\n') !== -1) { return block; }\n" +
        '      if (hasStructuredLine(block)) { return block; }');
    },
    claimALoneNewlineIsNotStructure],

  ['THE TARGET IS RAISED PAST EVERY BLOCK: nothing is ever broken',
    function (s) {
      return s.replace('  var RUN_SPLIT_TARGET = 380;',
        '  var RUN_SPLIT_TARGET = 999999;');
    },
    claimLongRunsAreBroken],

  ['IT CUTS AT ANY PUNCTUATION, WHITESPACE OR NOT',
    function (s) {
      return s.replace(
        '  var SENTENCE_CUT_RE = /[。！？][\\s\\u3000]*|[.!?][\\s\\u3000]+/g;',
        '  var SENTENCE_CUT_RE = /[。！？][\\s\\u3000]*|[.!?][\\s\\u3000]*/g;');
    },
    claimNeverCutsBetweenTouchingCharacters]
];

const WIRING_MUTATIONS = [
  ['THE READER NEVER CALLS IT',
    function (s) {
      return s.replace('      var runs = StudyCore.splitLongRuns(src);',
        '      var runs = src;');
    },
    null],

  ['THE GUARD IS NOT ASKED',
    function (s) {
      return s.replace('      var runGuards = StudyCore.bodyGuards(src, runs, []);',
        '      var runGuards = { ok: true };');
    },
    null]
];

(function main() {
  const failures = [];
  let ran = 0;
  let controlsGreen = 0;
  let caught = 0;

  const shipped = loadCore(coreSrc);

  CORE_CLAIMS.forEach(function (c) {
    ran += 1;
    const said = c[1](shipped);
    if (said.length === 0) { controlsGreen += 1; } else {
      failures.push('CONTROL RED: ' + c[0] + ' :: ' + said.join(' ;; '));
    }
  });

  ran += 1;
  const wiring = claimTheReaderIsWired(appSrc);
  if (wiring.length === 0) { controlsGreen += 1; } else {
    failures.push('CONTROL RED: the reader is wired :: ' + wiring.join(' ;; '));
  }

  CORE_MUTATIONS.forEach(function (m) {
    ran += 1;
    const mutated = m[1](coreSrc);
    if (mutated === coreSrc) {
      failures.push('MUTATION NEVER PLANTED: ' + m[0] +
        ' — a substitution that matched nothing scores as a pass, which is ' +
        'a drill measuring the repo instead of the gate');
      return;
    }
    let said;
    try { said = m[2](loadCore(mutated)); }
    catch (e) { said = ['threw: ' + (e && e.message ? e.message : e)]; }
    if (said.length > 0) { caught += 1; } else {
      failures.push('MUTATION MISSED: ' + m[0]);
    }
  });

  WIRING_MUTATIONS.forEach(function (m) {
    ran += 1;
    const mutated = m[1](appSrc);
    if (mutated === appSrc) {
      failures.push('MUTATION NEVER PLANTED: ' + m[0]);
      return;
    }
    if (claimTheReaderIsWired(mutated).length > 0) { caught += 1; } else {
      failures.push('MUTATION MISSED: ' + m[0]);
    }
  });

  console.log('CASES ' + ran);
  console.log('DRILL ' + caught + '/' +
    (CORE_MUTATIONS.length + WIRING_MUTATIONS.length) + ' mutations caught, ' +
    controlsGreen + '/' + (CORE_CLAIMS.length + 1) + ' controls green');

  assert.strictEqual(failures.length, 0, 'F-03 failures: ' + failures.join(' ;; '));
  assert.strictEqual(CORE_CLAIMS.length, 9,
    'nine core claims — a removed one must be a conscious edit');
  assert.strictEqual(CORE_MUTATIONS.length + WIRING_MUTATIONS.length, 10,
    'ten mutations — a removed one must be a conscious edit');
  assert.strictEqual(controlsGreen, 10, 'all ten controls must be green');
  assert.strictEqual(caught, 10, 'all ten mutations must be caught');
  assert.strictEqual(ran, 20,
    'CASES: ten controls plus ten mutations ran — a skipped case cannot ' +
    'hide behind a passing total');

  console.log('OK test_paragraph_runs.cjs — F-03: a long machine-read run is ' +
    'broken into paragraphs at display time, at cut points that cannot fuse ' +
    'or split a word; short notes, lists, quotes, tables and fences come ' +
    'back byte-identical, and the reader asks the shipped guard before it ' +
    'shows anything');
}());
