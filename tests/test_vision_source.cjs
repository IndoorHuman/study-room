/*
 * tests/test_vision_source.cjs — the language order, held statically over
 * every tracked Swift source (Phase 26.94-02, V3; D-02).
 *
 * Zero-dep node (fs/path/child_process only), path-independent via __dirname,
 * in the read-source-as-TEXT style of tests/test_no_push.cjs. It holds three
 * claims over EVERY tracked `.swift` file — not over one named path, because
 * the defect this exists to stop is a SECOND reader arriving later with the
 * probe's configuration copied into it:
 *
 *   1. GUARD PRESENT — `#available(macOS 13.0` appears. Without it,
 *      `automaticallyDetectsLanguage` is set unconditionally, which does not
 *      compile at an older deployment target and, written the probe's way
 *      (with no else arm), silently leaves an older Mac on Vision's default.
 *   2. ORDER — no array literal anywhere places `en-US` before `zh-Hans`, in
 *      EITHER arm of that branch. `recognitionLanguages` is a PRIORITY ORDER,
 *      not a set: `en-US` first forces a Latin reading, and measured over 300
 *      of the owner's screenshots it returned Chinese in 0.0% of them against
 *      84.0% / 87.3% for the two correct configurations. 87% of her
 *      screenshots had their Chinese destroyed by that one line.
 *   3. THE PIPE — `contentsOfFile` does not appear in CODE. That idiom reads
 *      NOTHING when standard input is a pipe, which is what subprocess hands
 *      over, and it exits 0 having done so.
 *
 * ⚠⚠ COMMENT HYGIENE, AND IT IS LOAD-BEARING RATHER THAN TIDY. The shipped
 * program NAMES the idiom it must never use, in prose, on purpose — that
 * sentence is the thing that stops it coming back. A gate that grepped the
 * raw text would therefore be red on a correct program, and the obvious
 * "fix" would be to delete the warning. So comments are stripped before every
 * negative assertion, by a scanner that tracks string literals rather than by
 * a line regex. Two independent proofs that the strip really happens: the
 * CONTROL below is green on the real source, which contains the token in a
 * comment today; and the IMMUNITY drill plants both forbidden shapes inside a
 * comment and asserts the gate stays green, while the mutations plant the
 * same shapes in code and assert it goes red.
 *
 * ⚠ TWO INDEPENDENT INSTRUMENTS. This one reads the source text. The other is
 * tests/test_vision_program.py, which drives the real program and would
 * notice a wrong answer. Neither is redundant; do not delete either as
 * duplication.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every unmet assertion listed on its own line + exit 1 on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const violations = [];

// ---- the comment stripper --------------------------------------------------
//
// Character scanner, not a line regex: it tracks double-quoted strings (with
// backslash escapes) so a `//` inside a string literal is never mistaken for
// a comment, and it handles both comment forms Swift has.
function stripSwiftComments(src) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inString) {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '"') { inString = false; }
      out += c;
      i += 1;
      continue;
    }
    if (c === '"') { inString = true; out += c; i += 1; continue; }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') { out += '\n'; }
        i += 1;
      }
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// ---- the checker -----------------------------------------------------------

function swiftSourceViolations(name, src) {
  const out = [];
  const code = stripSwiftComments(src);

  if (code.indexOf('#available(macOS 13.0') === -1) {
    out.push('[vision] ' + name + ': no #available(macOS 13.0 guard — ' +
      'automaticallyDetectsLanguage is macOS 13.0+, and without the guard ' +
      'this source does not build at an older deployment target and leaves ' +
      'an older Mac on Vision\'s Latin-first default');
  }

  if (code.indexOf('contentsOfFile') !== -1) {
    out.push('[vision] ' + name + ': reads standard input by NAME ' +
      '(contentsOfFile) — that idiom reads NOTHING through a pipe, which is ' +
      'what subprocess hands over, and exits 0 having read nothing');
  }

  // Every array literal, non-nested — which is every shape a language list
  // takes. The backstop below refuses to stay silent if an `en-US` mention
  // turns up somewhere this pattern cannot judge.
  const arrays = code.match(/\[[^[\]]*\]/g) || [];
  let seenInArrays = 0;
  arrays.forEach(function (literal) {
    if (literal.indexOf('en-US') === -1) { return; }
    seenInArrays += (literal.match(/en-US/g) || []).length;
    const zh = literal.indexOf('zh-Hans');
    if (zh === -1) {
      out.push('[vision] ' + name + ': a language array names en-US and ' +
        'not zh-Hans — ' + literal.trim());
      return;
    }
    if (zh > literal.indexOf('en-US')) {
      out.push('[vision] ' + name + ': a language array places en-US ' +
        'BEFORE zh-Hans — ' + literal.trim() + '. recognitionLanguages is a ' +
        'priority order, not a set: this is the line that destroyed the ' +
        'Chinese in 87% of her screenshots, and no arm of the #available ' +
        'branch may lead with en-US');
    }
  });
  const total = (code.match(/en-US/g) || []).length;
  if (total !== seenInArrays) {
    out.push('[vision] ' + name + ': ' + (total - seenInArrays) + ' en-US ' +
      'mention(s) sit outside any array literal, where this gate cannot ' +
      'judge the order — say it plainly rather than passing');
  }
  return out;
}

// ---- the live call ---------------------------------------------------------

let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files', '*.swift'], { cwd: ROOT })
    .toString().split('\n').filter(function (n) { return n.trim() !== ''; });
} catch (err) {
  violations.push('[vision] git ls-files could not run, so this gate does ' +
    'not know which Swift sources ship: ' + err.message);
}

// ⚠ A GATE THAT FINDS NOTHING AND PASSES IS NOT A GATE. The phase that
// introduced this file introduced the repo's first .swift; if the glob ever
// answers zero, the reason is a rename or a deletion, not compliance.
if (tracked.length === 0) {
  violations.push('[vision] no tracked .swift files — the on-device reader ' +
    'is gone or was renamed; this gate has nothing to hold');
}

const sources = {};
tracked.forEach(function (rel) {
  sources[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  swiftSourceViolations(rel, sources[rel]).forEach(function (v) {
    violations.push(v);
  });
});

// ---- THE MUTATION DRILL ----------------------------------------------------
//
// ⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE. Every mutation is a STRING IN
// MEMORY — nothing here opens a source file for writing. Each asserts it
// actually CHANGED the text first, because a substitution that matched
// nothing is a mutation that was never planted, and a checker asked nothing
// at all would otherwise score as a pass. The loop cannot exit early on a
// catch. Both counts are asserted BY VALUE against literals in this file.
//
// The IMMUNITIES are the other half and the reason this drill exists in this
// shape: they plant the same two forbidden shapes inside a COMMENT and
// require the gate to stay GREEN. Without them, a gate that had quietly
// stopped stripping comments would still catch every mutation and would
// simply be red on the shipped program forever.

const DRILL_MUTATIONS_EXPECTED = 4;
const DRILL_IMMUNITIES_EXPECTED = 2;
const DRILL_CONTROLS_EXPECTED = 1;

(function () {
  const NAME = 'tools/vision_read.swift';
  const src = sources[NAME];
  if (src === undefined) {
    violations.push('[drill] ' + NAME + ' is not tracked, so the drill has ' +
      'no subject and every count below would be measuring nothing');
    return;
  }

  // ---- the control: the checker green on the REAL source -----------------
  //
  // ⚠ This control is itself the production proof of the comment strip: the
  // real source contains `contentsOfFile` in its warning comment TODAY, so a
  // stripper that stopped working turns this control red immediately.
  let controls = 0;
  if (swiftSourceViolations(NAME, src).length === 0) {
    controls += 1;
  } else {
    violations.push('[drill] CONTROL RED: the checker does not hold on the ' +
      'real source, so every mutation scored against it is measuring the ' +
      'repo rather than the gate');
  }

  const MUTATIONS = [
    ['the fallback array flips to en-US first',
      src.split('let fallbackLanguages = ["zh-Hans", "en-US"]')
        .join('let fallbackLanguages = ["en-US", "zh-Hans"]')],
    ['the fallback array loses zh-Hans entirely',
      src.split('let fallbackLanguages = ["zh-Hans", "en-US"]')
        .join('let fallbackLanguages = ["en-US"]')],
    ['the #available guard is removed',
      src.split('if #available(macOS 13.0, *) {').join('if true {')],
    ['the probe stdin idiom returns, in code',
      src.split('let stdinData = FileHandle.standardInput.readDataToEndOfFile()')
        .join('let stdinData = Data((try? String(contentsOfFile: ' +
              '"/dev/stdin", encoding: .utf8))?.utf8 ?? "".utf8)')]
  ];

  const IMMUNITIES = [
    ['the forbidden array, planted inside a comment',
      src + '\n// for the record, the broken shape was ["en-US", "zh-Hans"]\n'],
    ['the forbidden idiom, planted inside a comment',
      src + '\n// and it was read with String(contentsOfFile: "/dev/stdin")\n']
  ];

  let caught = 0;
  MUTATIONS.forEach(function (m) {
    if (m[1] === src) {
      violations.push('[drill] the mutation "' + m[0] + '" matched nothing, ' +
        'so it was never planted');
      return;
    }
    if (swiftSourceViolations(NAME, m[1]).length > 0) { caught += 1; return; }
    violations.push('[drill] NOT CAUGHT: ' + m[0]);
  });

  let immune = 0;
  IMMUNITIES.forEach(function (m) {
    if (m[1] === src) {
      violations.push('[drill] the immunity "' + m[0] + '" changed nothing');
      return;
    }
    if (swiftSourceViolations(NAME, m[1]).length === 0) { immune += 1; return; }
    violations.push('[drill] FALSE POSITIVE: ' + m[0] + ' — the gate read a ' +
      'comment as code, which would make the program\'s own warning ' +
      'sentence unwritable');
  });

  if (MUTATIONS.length !== DRILL_MUTATIONS_EXPECTED) {
    violations.push('[drill] the roster holds ' + MUTATIONS.length +
      ' mutations, ' + DRILL_MUTATIONS_EXPECTED + ' expected');
  }
  if (IMMUNITIES.length !== DRILL_IMMUNITIES_EXPECTED) {
    violations.push('[drill] the roster holds ' + IMMUNITIES.length +
      ' immunities, ' + DRILL_IMMUNITIES_EXPECTED + ' expected');
  }
  if (caught !== DRILL_MUTATIONS_EXPECTED) {
    violations.push('[drill] ' + caught + ' of ' + DRILL_MUTATIONS_EXPECTED +
      ' mutations caught — the count is asserted by value so a drill that ' +
      'quietly stopped drilling moves the number');
  }
  if (immune !== DRILL_IMMUNITIES_EXPECTED) {
    violations.push('[drill] ' + immune + ' of ' + DRILL_IMMUNITIES_EXPECTED +
      ' immunities green');
  }
  if (controls !== DRILL_CONTROLS_EXPECTED) {
    violations.push('[drill] ' + controls + ' of ' + DRILL_CONTROLS_EXPECTED +
      ' controls green');
  }

  console.log('SOURCES ' + tracked.length);
  console.log('DRILL ' + caught + '/' + MUTATIONS.length +
    ' mutations caught, ' + immune + '/' + IMMUNITIES.length +
    ' immunities green, ' + controls + ' controls green');
}());

// ---- verdict ---------------------------------------------------------------

if (violations.length) {
  console.error('test_vision_source FAILED — ' + violations.length +
    ' assertion(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_vision_source OK (the guard is present, no arm leads with ' +
  'en-US, and standard input is never read by name)');
process.exit(0);
