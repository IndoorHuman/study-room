/*
 * tests/test_pipeline_verbatim.cjs — byte-identical-body guard for the
 * collect-time processing stage (Phase 27-01, D-19 / law 4 / Pitfall 2).
 *
 * Zero-dep node (assert / fs / path / child_process / os only). Invokes the
 * Python stage via execFileSync('python3', ...) on a temp copy of each
 * mansfield-raw-holdout fixture. Comparison is raw code points — no
 * String.normalize() / NFC / NFD on body text.
 *
 * Shapes (from ~/mansfield-raw-holdout/ RAW-HOLDOUT.md):
 *   bare              — no frontmatter (note.md)
 *   wall              — one undifferentiated block (clipboard.md)
 *   stale-frontmatter — leftover clip-tool fields (Untitled 2.md)
 *
 * Contract: after the stage, strip leading YAML + trailing ## Related, collapse
 * runs of whitespace, require the remaining code-point sequence to equal the
 * original body's (also whitespace-collapsed). Wall may gain line breaks only.
 *
 * Prints one OK line and exits 0 on success; exits non-zero on first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HOLDOUT = path.join(os.homedir(), 'mansfield-raw-holdout');

const FIXTURES = {
  bare: 'note.md',
  wall: 'clipboard.md',
  'stale-frontmatter': 'Untitled 2.md'
};

assert.ok(fs.existsSync(path.join(ROOT, 'study_lib.py')),
  'study_lib.py resolves from __dirname — suite is cwd-independent');
assert.ok(fs.existsSync(HOLDOUT),
  'mansfield-raw-holdout must exist at ~/mansfield-raw-holdout/');

function collapseWs(s) {
  // Whitespace-collapsed code-point sequence. NO unicode normalize().
  return String(s).replace(/\s+/g, ' ').trim();
}

function stripFrontmatter(md) {
  const text = String(md);
  if (text.indexOf('---') !== 0) {
    return text;
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    return text;
  }
  const nl = text.indexOf('\n', end + 1);
  return nl !== -1 ? text.slice(nl + 1) : '';
}

function stripTrailingRelated(md) {
  // Optional trailing ## Related block (markers or bare heading). Body above
  // stays; the Related section itself is scaffolding the stage may add.
  const text = String(md);
  const re = /\n##[ \t]+Related\b[^\n]*\n[\s\S]*$/;
  const m = text.match(re);
  if (!m) {
    return text;
  }
  return text.slice(0, m.index);
}

function bodyWordSequence(md) {
  return collapseWs(stripTrailingRelated(stripFrontmatter(md)));
}

function countFrontmatterBlocks(md) {
  // Count opening --- fences at start-of-line that begin a YAML block.
  const text = String(md);
  let count = 0;
  let i = 0;
  while (i < text.length) {
    if ((i === 0 || text[i - 1] === '\n') && text.slice(i, i + 3) === '---') {
      const close = text.indexOf('\n---', i + 3);
      if (close === -1) {
        break;
      }
      count += 1;
      const nl = text.indexOf('\n', close + 1);
      i = nl !== -1 ? nl + 1 : text.length;
      continue;
    }
    i += 1;
  }
  return count;
}

function runStage(mdText, filename) {
  // Invoke the not-yet-written (then GREEN) processing entrypoint.
  // A missing symbol → non-zero exit (RED). No String.normalize anywhere.
  const driver = [
    'import sys, study_lib',
    'src = open(sys.argv[1], encoding="utf-8").read()',
    'stem = sys.argv[2]',
    'out = study_lib.process_item_markdown(src, filename_stem=stem)',
    'sys.stdout.write(out)'
  ].join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pipeline-'));
  const inPath = path.join(tmp, filename);
  try {
    fs.writeFileSync(inPath, mdText, 'utf8');
    return execFileSync('python3', ['-c', driver, inPath,
      path.basename(filename, path.extname(filename))], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* */ }
  }
}

function assertShape(shape, filename) {
  const srcPath = path.join(HOLDOUT, filename);
  assert.ok(fs.existsSync(srcPath),
    shape + ' fixture missing: ' + srcPath);
  const original = fs.readFileSync(srcPath, 'utf8');
  // Pin shape expectations so a swapped holdout file fails loudly.
  if (shape === 'bare' || shape === 'wall') {
    assert.ok(original.indexOf('---') !== 0,
      shape + ' fixture must not open with frontmatter');
  }
  if (shape === 'stale-frontmatter') {
    assert.ok(original.indexOf('---') === 0,
      'stale-frontmatter fixture must open with a YAML block');
    assert.ok(/published:\s*/.test(original) || /created:\s*/.test(original),
      'stale-frontmatter fixture must carry clip-tool leftover fields');
  }
  if (shape === 'wall') {
    const lines = original.split(/\n/).filter(function (l) {
      return l.trim().length > 0;
    });
    assert.ok(lines.length <= 3,
      'wall fixture must be nearly one undifferentiated block');
  }

  let processed;
  try {
    processed = runStage(original, filename);
  } catch (err) {
    const msg = String(err && err.stderr || err && err.message || err);
    assert.fail(
      'processing stage failed for ' + shape + ' (' + filename + '): ' +
      msg.slice(0, 800) +
      ' — expected study_lib.process_item_markdown (stage-not-implemented ' +
      'or body-mismatch)');
  }

  assert.strictEqual(typeof processed, 'string',
    shape + ': stage must return a string');
  assert.ok(processed.indexOf('---') === 0,
    shape + ': processed output must open with a v3-lite frontmatter block');

  if (shape === 'stale-frontmatter') {
    assert.strictEqual(countFrontmatterBlocks(processed), 1,
      'stale-frontmatter: stage must REPAIR in place — exactly ONE ' +
      'frontmatter block, never a second stacked block');
  }

  const before = bodyWordSequence(original);
  const after = bodyWordSequence(processed);
  // Raw code-point equality after whitespace collapse — no normalize().
  assert.strictEqual(after, before,
    shape + ' (' + filename + '): body word sequence must be byte-identical ' +
    'after stripping frontmatter + ## Related (whitespace-collapsed). ' +
    'before_len=' + before.length + ' after_len=' + after.length);

  // Defensive: prove this suite never NFC/NFD-normalizes body text.
  assert.strictEqual(typeof String.prototype.normalize, 'function',
    'String.normalize exists on this runtime (we must not call it)');
}

Object.keys(FIXTURES).forEach(function (shape) {
  assertShape(shape, FIXTURES[shape]);
});

console.log('OK test_pipeline_verbatim.cjs — bare/wall/stale-frontmatter ' +
  'byte-identical body after process_item_markdown (raw code points, no ' +
  'normalize)');
