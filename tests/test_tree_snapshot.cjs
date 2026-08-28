#!/usr/bin/env node
/* test_tree_snapshot — the INSTRUMENT'S OWN SUITE (26.96-08, closing WR-06,
 * WR-07, WR-08).
 *
 * WHAT IS UNDER TEST. `tests/lib/tree_snapshot.cjs` is the gate every later
 * wave of this phase reads when it claims "this file is untouched". Its own
 * header states the stakes: the repair an executor reaches for when such a
 * gate is red is `git restore`, which in THIS tree would destroy another live
 * session's uncommitted work — so "a gate must never be able to trigger the
 * catastrophe it exists to prevent." Until this file existed the instrument
 * had no automated suite at all: its two arms were driven by hand once, in
 * 26.96-01, and never again.
 *
 * ⛔ IT DRIVES THE REAL CLI AS A CHILD PROCESS AND NEVER `require()`s IT.
 * All four findings are about the CLI's own edges — the argv that becomes a
 * path, the bytes that become a record, the exit path that carries the
 * evidence, and the working directory the verdict is computed against. A unit
 * test that reached past the process boundary and called an internal would
 * prove nothing about any of the four.
 *
 * THE FIVE ANTI-VACUITY ANSWERS.
 *  (1) Can it pass BEFORE the work is done? No — and this was MEASURED, not
 *      asserted. Run against the unfixed instrument, `labelRefused`,
 *      `newlineRoundTrip`, `pipedComplete` and `wrongCwdDistinct` are each
 *      named in a violation, with the return code and full output recorded
 *      verbatim in 26.96-08-SUMMARY.md.
 *  (2) Can it still pass once deliberately broken? No — the three controls
 *      (`oldFormatReadBack`, `scratchGreen`, `scratchRed`) are green in the
 *      SAME red run, so the red is a statement about four properties rather
 *      than about a suite that cannot be satisfied.
 *  (3) Does a degenerate implementation satisfy it? No. A validator that
 *      refused every label would break `scratchGreen`; a serializer that
 *      quoted everything would break `oldFormatReadBack`; a wrong-directory
 *      verdict that fired on any cwd mismatch would break `scratchGreen` and
 *      `scratchRed`, which run against copies in a directory that is
 *      deliberately NOT the recorded root.
 *  (4) Is it reading evaluation order or source order? Behaviour only. Every
 *      assertion here reads a return code, a byte count, a directory listing
 *      or the CLI's own stdout. Nothing greps the implementation.
 *  (5) Could a grep match the fix's own comment? There is no grep in this
 *      file, so no comment can satisfy any case in it.
 *
 * ⛔⛔ THE SANDBOX RULES, WHICH ARE THE LOAD-BEARING PART OF THIS FILE.
 * `~/.2696-snapshots/` holds this phase's ATTRIBUTION TRAIL — `wave0` and
 * `wave0-postplan` above all. A self-test that swept that directory would
 * destroy the evidence the phase is built on.
 *   - Every label this suite creates is `selftest-<pid>-<n>`.
 *   - Every write is CLAIMED BY EXACT ABSOLUTE PATH before it happens, and at
 *     the end ONLY those exact claimed paths are removed, and only if this run
 *     created them. No pattern, no glob, no directory sweep, ever.
 *   - `wave0` and `wave0-postplan` are named nowhere in this file as a write
 *     target. Nothing here reads them either; the old-format regression is
 *     driven against a snapshot this suite writes BY HAND in the old shape.
 *   - Scratch trees live under the OS temp directory with a fixed prefix, and
 *     the recursive remove asserts BOTH facts about the exact path before it
 *     runs.
 *
 * ⛔ AND IT NEVER TOUCHES THE CONTENDED TREE. The only git write commands in
 * this file run inside scratch repositories this run created, and `git()`
 * asserts that before executing one.
 *
 * Bare node, zero dependencies (fs/path/os/assert/child_process only), the
 * tests/*.cjs violations[] grammar and exit convention.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'tests', 'lib', 'tree_snapshot.cjs');
const SNAP_DIR = path.join(os.homedir(), '.2696-snapshots');
const SNAP_PARENT = path.dirname(SNAP_DIR);
const SCRATCH_PREFIX = '2696-ts-';
const TMP_REAL = fs.realpathSync(os.tmpdir());

const violations = [];

// ⚠ EVERY GROUP IS WRAPPED. This suite spawns processes and builds scratch
// trees; a throw in one lift would otherwise take every later proof with it
// while the output blamed a single undefined name. A throw becomes a LOUD
// violation and execution continues.
function guarded(label, fn, sink) {
  try {
    fn();
  } catch (e) {
    sink.push('[harness] group ' + label + ' THREW and therefore proved ' +
      'nothing: ' + (e && e.message ? e.message : String(e)) +
      '. ⚠ This is a broken instrument, not a product failure — fix the ' +
      'harness, never the fence, and check what else stopped running.');
  }
}

function group(label, fn) { guarded(label, fn, violations); }

// ---------------------------------------------------------------------------
// The write ledger. Nothing is ever removed that was not claimed here first.
// ---------------------------------------------------------------------------

const CLAIMED = [];      // exact absolute paths this run may remove at the end
const SCRATCHES = [];    // exact absolute scratch directories this run created
let LABEL_N = 0;

function newLabel() {
  LABEL_N++;
  return 'selftest-' + process.pid + '-' + LABEL_N;
}

// Claim the exact path a write is expected to land at, BEFORE the write runs.
function claim(p) {
  const abs = path.resolve(p);
  if (CLAIMED.indexOf(abs) === -1) { CLAIMED.push(abs); }
  return abs;
}

function removeClaimed() {
  const stuck = [];
  CLAIMED.forEach(function (p) {
    try {
      if (!fs.existsSync(p)) { return; }
      if (!fs.lstatSync(p).isFile()) { stuck.push(p); return; }
      fs.unlinkSync(p);
    } catch (e) {
      stuck.push(p + ' (' + (e && e.message ? e.message : String(e)) + ')');
    }
  });
  return stuck;
}

function mkScratch() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),
    SCRATCH_PREFIX)));
  SCRATCHES.push(d);
  return d;
}

// ⛔ The recursive remove asserts, by exact path, that the target is a scratch
// directory this run created under the OS temp directory. It is never given a
// pattern and it is never pointed at SNAP_DIR.
function removeScratch(d) {
  assert.ok(SCRATCHES.indexOf(d) !== -1,
    'refusing to remove a directory this run did not create: ' + d);
  assert.ok(d.indexOf(TMP_REAL + path.sep) === 0,
    'refusing to remove a directory outside the OS temp directory: ' + d);
  assert.ok(path.basename(d).indexOf(SCRATCH_PREFIX) === 0,
    'refusing to remove a directory without the scratch prefix: ' + d);
  fs.rmSync(d, { recursive: true, force: true });
}

function removeAllScratches() {
  SCRATCHES.slice().forEach(function (d) {
    try { if (fs.existsSync(d)) { removeScratch(d); } } catch (e) { /* below */ }
  });
}

// ---------------------------------------------------------------------------
// Process drivers.
// ---------------------------------------------------------------------------

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    cwd: cwd, encoding: 'utf8', maxBuffer: 1 << 28
  });
}

const GIT_WRITES = ['init', 'add', 'commit'];

// ⛔ A git command that WRITES may only run inside a scratch tree this run
// created. The contended repository is never a legal cwd for one.
function git(args, cwd) {
  if (GIT_WRITES.indexOf(args[0]) !== -1 ||
      (args[0] === '-c' && GIT_WRITES.indexOf(args[2]) !== -1)) {
    assert.ok(SCRATCHES.indexOf(cwd) !== -1,
      'refusing to run a writing git command outside a scratch tree: ' +
      args.join(' ') + ' in ' + cwd);
  }
  return spawnSync('git', args, {
    cwd: cwd, encoding: 'utf8', maxBuffer: 1 << 28
  });
}

function mkRepo() {
  const d = mkScratch();
  git(['-c', 'init.defaultBranch=main', 'init', '-q', '.'], d);
  fs.writeFileSync(path.join(d, '.keep'), 'scratch\n', 'utf8');
  git(['add', '--', '.keep'], d);
  // ⛔ NO `@` IN THIS IDENTITY, AND THAT IS DELIBERATE. git accepts any string
  // for user.email; tools/stage_public.py's privacy gate denies anything that
  // looks like an email address in a tracked file, and it fails toward noise on
  // purpose. An address-shaped token here was denying the WHOLE staging run
  // (test_stage_public.py::test_the_real_tracked_tree_stages_with_zero_denied),
  // i.e. this test file alone could block publishing. Fixed on the TEST side —
  // ⛔ never by widening the gate.
  git(['-c', 'user.email=selftest',
    '-c', 'user.name=selftest', '-c', 'commit.gpgsign=false',
    'commit', '-q', '-m', 'scratch base'], d);
  return d;
}

// Takes a snapshot from `cwd` under a fresh selftest label, claiming the exact
// path first and asserting the file arrived.
function takeSnapshot(cwd) {
  const label = newLabel();
  const p = claim(path.join(SNAP_DIR, label + '.snapshot'));
  const r = run(['snapshot', label], cwd);
  assert.strictEqual(r.status, 0,
    'snapshot ' + label + ' must succeed in ' + cwd + ' — rc=' + r.status +
    ' stderr=' + r.stderr);
  assert.ok(fs.existsSync(p), 'snapshot ' + label + ' must land at ' + p);
  return { label: label, file: p };
}

function listDir(d) {
  try { return fs.readdirSync(d).sort(); } catch (e) { return ['<unreadable>']; }
}

function setDiff(a, b) {
  const inA = a.filter(function (x) { return b.indexOf(x) === -1; });
  const inB = b.filter(function (x) { return a.indexOf(x) === -1; });
  return { onlyBefore: inA, onlyAfter: inB };
}

// Splits a snapshot file into its header lines and its RECORD lines. A record
// line is any non-empty line that is not a comment and not one of the six
// header keys — so a record that was split across two lines by an unescaped
// newline shows up here as TWO records, which is exactly the WR-07 defect.
const HEADER_KEYS = ['label ', 'taken ', 'root ', 'head ', 'branch ', 'counts '];

function splitSnapshotFile(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const records = [];
  let counts = null;
  raw.split('\n').forEach(function (line) {
    if (!line.length) { return; }
    if (line[0] === '#') { return; }
    if (line.slice(0, 7) === 'counts ') { counts = line; return; }
    let isHeader = false;
    HEADER_KEYS.forEach(function (k) {
      if (line.slice(0, k.length) === k) { isHeader = true; }
    });
    if (isHeader) { return; }
    records.push(line);
  });
  let tracked = -1;
  let untracked = -1;
  if (counts) {
    const mT = counts.match(/tracked=(\d+)/);
    const mU = counts.match(/untracked=(\d+)/);
    if (mT) { tracked = parseInt(mT[1], 10); }
    if (mU) { untracked = parseInt(mU[1], 10); }
  }
  return { records: records, counts: counts, tracked: tracked,
    untracked: untracked };
}

function hashObject(file, cwd) {
  const r = spawnSync('git', ['hash-object', '--', file], {
    cwd: cwd, encoding: 'utf8'
  });
  assert.strictEqual(r.status, 0, 'git hash-object failed for ' + file +
    ': ' + r.stderr);
  return r.stdout.trim();
}

// ===========================================================================
// (A) labelRefused — WR-06. A label is argv, and argv becomes a path.
// ===========================================================================
//
// ⚠ THE EXIT CODE IS NOT THE ASSERTION. An implementation could return 2 and
// still have written the file. What proves nothing escaped is a listing of
// BOTH the snapshot directory and its PARENT, captured before and after and
// compared BY VALUE — the parent, because `../<name>` is precisely where an
// unguarded `path.join` sends the write.

group('labelRefused', function () {
  const escapeLabel = '../selftest-escape-' + process.pid;
  const escaped = path.resolve(path.join(SNAP_DIR, escapeLabel + '.snapshot'));
  const escapedName = path.basename(escaped);

  const beforeSnap = listDir(SNAP_DIR);
  const beforeParent = listDir(SNAP_PARENT);

  const r = run(['snapshot', escapeLabel], ROOT);

  const afterSnap = listDir(SNAP_DIR);
  const afterParent = listDir(SNAP_PARENT);

  // If it escaped, claim it NOW so the ledger can take it back — and only
  // because this run is the thing that created it.
  if (beforeParent.indexOf(escapedName) === -1 &&
      afterParent.indexOf(escapedName) !== -1) {
    claim(escaped);
  }

  const dSnap = setDiff(beforeSnap, afterSnap);
  const dParent = setDiff(beforeParent, afterParent);

  if (dParent.onlyBefore.length || dParent.onlyAfter.length) {
    violations.push('[labelRefused] ⛔ A SNAPSHOT LABEL BUILT A PATH OUTSIDE ' +
      'THE SNAPSHOT DIRECTORY. Listing ' + SNAP_PARENT + ' before and after ' +
      '`snapshot ' + JSON.stringify(escapeLabel) + '` differs BY VALUE: ' +
      'appeared=' + JSON.stringify(dParent.onlyAfter) + ' vanished=' +
      JSON.stringify(dParent.onlyBefore) + '. argv[1] is joined straight ' +
      'onto the snapshot directory, so the instrument writes wherever the ' +
      'label points.');
  }
  if (dSnap.onlyBefore.length || dSnap.onlyAfter.length) {
    violations.push('[labelRefused] ⛔ THE SNAPSHOT DIRECTORY ITSELF MOVED ' +
      'on a refused label: appeared=' + JSON.stringify(dSnap.onlyAfter) +
      ' vanished=' + JSON.stringify(dSnap.onlyBefore) + '.');
  }
  if (fs.existsSync(escaped)) {
    violations.push('[labelRefused] ⛔ THE ESCAPED FILE EXISTS AT ' + escaped +
      ' — a refused label must write NOTHING, anywhere.');
  }
  if (r.status !== 2) {
    violations.push('[labelRefused] a label outside [A-Za-z0-9._-]+ must be ' +
      'refused with exit 2 — got rc=' + r.status + '.');
  }
  const said = String(r.stderr || '') + String(r.stdout || '');
  if (said.indexOf('selftest-escape-' + process.pid) === -1) {
    violations.push('[labelRefused] the refusal must NAME the label it ' +
      'received so an invisible character is visible — nothing in the ' +
      'output carries it. Got: ' + JSON.stringify(said.slice(0, 300)));
  }
});

// ===========================================================================
// (B) newlineRoundTrip — WR-07. The property the header claims, driven.
// ===========================================================================
//
// The instrument uses `git ls-files -z` and says why: "so a filename
// containing a space or a newline cannot split a record." It then writes one
// record per '\n'. This group is the sentence in the header, executed.

group('newlineRoundTrip', function () {
  const d = mkRepo();
  const nlName = 'nl-' + process.pid + '-a\nb.txt';
  const nlAbs = path.join(d, nlName);

  try {
    fs.writeFileSync(nlAbs, 'a path whose name carries a newline\n', 'utf8');
  } catch (e) {
    violations.push('[newlineRoundTrip] ⚠ SKIPPED-WITH-REASON, WHICH IS A ' +
      'VIOLATION AND NOT A PASS: this platform refused to create a file ' +
      'whose name contains a newline (' + (e && e.message) + '), so WR-07\'s ' +
      'property was NOT exercised. A property that cannot be exercised has ' +
      'not been proven.');
    return;
  }

  git(['add', '--', nlName], d);
  const ls = spawnSync('git', ['ls-files', '-z'], {
    cwd: d, encoding: 'utf8'
  }).stdout.split('\0');
  if (ls.indexOf(nlName) === -1) {
    violations.push('[newlineRoundTrip] ⚠ SKIPPED-WITH-REASON, WHICH IS A ' +
      'VIOLATION AND NOT A PASS: git did not track the newline path in the ' +
      'scratch repository, so the round trip was never driven. Tracked: ' +
      JSON.stringify(ls.filter(function (s) { return s.length; })));
    return;
  }

  const snap = takeSnapshot(d);
  const parsed = splitSnapshotFile(snap.file);
  const want = parsed.tracked + parsed.untracked;

  if (parsed.records.length !== want) {
    violations.push('[newlineRoundTrip] ⛔ A NEWLINE IN A PATH SPLIT ITS OWN ' +
      'RECORD. The counts line says ' + parsed.counts + ' (' + want +
      ' entries) but the file carries ' + parsed.records.length +
      ' record line(s) BY VALUE. The instrument chose `-z` for exactly this ' +
      'reason and then wrote one record per newline, so the reader either ' +
      'drops the tail or records a phantom. Records: ' +
      JSON.stringify(parsed.records));
  }

  const r = run(['unchanged', snap.label, nlName], d);
  if (r.status !== 0) {
    violations.push('[newlineRoundTrip] ⛔ THE NEWLINE PATH DID NOT ROUND ' +
      'TRIP. `unchanged` over the very path the snapshot just recorded ' +
      'returned rc=' + r.status + ' — the record does not survive its own ' +
      'serialization. Output: ' + JSON.stringify(String(r.stdout).slice(0, 400)));
  }

  removeScratch(d);
});

// ===========================================================================
// (C) oldFormatReadBack — the CONTROL that protects the attribution trail.
// ===========================================================================
//
// ⛔ SNAPSHOTS ALREADY ON DISK ARE WRITTEN IN THE BARE-PATH FORM, and they are
// this phase's evidence. This case is written BEFORE the serialization changes
// and must be green on BOTH sides of it. It builds a snapshot file by hand in
// the old shape rather than reading one of the real ones, so the regression is
// pinned without any existing snapshot being opened, moved or re-pinned.

group('oldFormatReadBack', function () {
  const d = mkRepo();
  fs.writeFileSync(path.join(d, 'f1.txt'), 'first payload\n', 'utf8');
  fs.writeFileSync(path.join(d, 'f2.txt'), 'second payload\n', 'utf8');
  const h1 = hashObject('f1.txt', d);
  const h2 = hashObject('f2.txt', d);

  const label = newLabel();
  const p = claim(path.join(SNAP_DIR, label + '.snapshot'));
  const lines = [
    '# 26.96 tree snapshot — content hashes, git blob construction',
    'label ' + label,
    'taken ' + new Date().toISOString(),
    'root ' + d,
    'head <none>',
    'branch main',
    'tracked ' + h1 + ' f1.txt',
    'tracked ' + h2 + ' f2.txt',
    'counts tracked=2 untracked=0'
  ];
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');

  const r = run(['unchanged', label, 'f1.txt', 'f2.txt'], d);
  const out = String(r.stdout || '');
  if (r.status !== 0) {
    violations.push('[oldFormatReadBack] ⛔ A SNAPSHOT IN THE SHIPPED ' +
      'BARE-PATH FORM NO LONGER PARSES. rc=' + r.status + '. Every snapshot ' +
      'already in ~/.2696-snapshots/ is written this way and they are this ' +
      'phase\'s attribution trail. Output: ' + JSON.stringify(out.slice(0, 400)));
  }
  if (out.indexOf('f1.txt ' + label + '=' + h1 + ' now=' + h1 + ' OK') === -1) {
    violations.push('[oldFormatReadBack] the recorded hash must be read back ' +
      'BY VALUE from the old form — expected "f1.txt ' + label + '=' + h1 +
      ' now=' + h1 + ' OK" in the output, got ' +
      JSON.stringify(out.slice(0, 400)));
  }
  if (out.indexOf('f2.txt ' + label + '=' + h2 + ' now=' + h2 + ' OK') === -1) {
    violations.push('[oldFormatReadBack] the SECOND old-form record must read ' +
      'back by value too — expected "f2.txt ' + label + '=' + h2 + ' now=' +
      h2 + ' OK", got ' + JSON.stringify(out.slice(0, 400)));
  }

  removeScratch(d);
});

// ===========================================================================
// (D) pipedComplete — WR-08a. The output IS the evidence.
// ===========================================================================
//
// ⚠ THE READER HAS TO BE SLOWER THAN THE WRITER, and that is not a contrivance
// — it is the only way to observe the defect. `process.exit()` discards writes
// still queued on an asynchronous stdout. A reader that drains instantly keeps
// the pipe empty and nothing is ever queued; a reader that pauses lets the
// kernel pipe buffer fill, and every line after it is lost. That is exactly
// what happens when this tool's output is piped into anything that does work
// per line — which is how its output reaches a SUMMARY.
//
// The count is asserted BY VALUE: N path lines plus exactly one summary line.

group('pipedComplete', function () {
  const d = mkRepo();
  const N = 600;
  const names = [];
  for (let i = 0; i < N; i++) {
    const nm = 'piped-' + String(i + 1000) + '-aaaaaaaaaaaaaaaaaaaaaaaaaaaa.txt';
    fs.writeFileSync(path.join(d, nm), 'payload ' + i + '\n', 'utf8');
    names.push(nm);
  }
  git(['add', '--', '.'], d);
  const snap = takeSnapshot(d);

  const outFile = path.join(d, 'piped.out');
  const script =
    'CLI=$1; LBL=$2; OUT=$3; shift 3; ' +
    '"$SELFTEST_NODE" "$CLI" unchanged "$LBL" "$@" | ( sleep 1; cat ) > "$OUT"';
  const shArgs = ['-c', script, 'sh', CLI, snap.label, outFile].concat(names);
  const env = Object.assign({}, process.env,
    { SELFTEST_NODE: process.execPath });
  spawnSync('/bin/sh', shArgs, { cwd: d, encoding: 'utf8', env: env,
    maxBuffer: 1 << 28 });

  const got = fs.readFileSync(outFile, 'utf8')
    .split('\n').filter(function (s) { return s.length > 0; });
  const wantLines = N + 1;
  if (got.length !== wantLines) {
    violations.push('[pipedComplete] ⛔ THE GATE TRUNCATED ITS OWN EVIDENCE. ' +
      'Over ' + N + ' named paths with stdout on a pipe, ' + got.length +
      ' line(s) arrived where ' + wantLines + ' were written (' + N +
      ' path lines + 1 summary). `process.exit()` does not drain an ' +
      'asynchronous stdout, so the tool whose header says "EVERY PATH ' +
      'PRINTS, PASS OR FAIL" loses ' + (wantLines - got.length) + ' of them ' +
      'in the very place the output IS the evidence. Last line kept: ' +
      JSON.stringify(got.length ? got[got.length - 1] : '<nothing>'));
  }
  if (got.length && got[got.length - 1].slice(0, 13) !== '-- unchanged[') {
    violations.push('[pipedComplete] the summary line must be the LAST line ' +
      'to arrive — got ' + JSON.stringify(got[got.length - 1]) + '.');
  }

  removeScratch(d);
});

// ===========================================================================
// (E) wrongCwdDistinct — WR-08b. A wrong place is not a changed tree.
// ===========================================================================
//
// ⚠ RATED THE MOST SERIOUS OF THE FOUR. Standing in the wrong directory makes
// every named path report `<absent> → CHANGED`: a FULL RED, in the one gate
// whose red output an executor acts on, and whose reflex repair is destructive.
//
// The assertions are behavioural on purpose: a DISTINCT return code, both
// directories NAMED, and the red-response block ABSENT — because there is no
// delta to attribute and telling the reader to attribute one is the lie.

group('wrongCwdDistinct', function () {
  const d = mkRepo();
  fs.writeFileSync(path.join(d, 'a.txt'), 'alpha\n', 'utf8');
  fs.writeFileSync(path.join(d, 'b.txt'), 'beta\n', 'utf8');
  git(['add', '--', '.'], d);
  const snap = takeSnapshot(d);

  const sub = path.join(d, 'sub');
  fs.mkdirSync(sub);
  const r = run(['unchanged', snap.label, 'a.txt', 'b.txt'], sub);
  const out = String(r.stdout || '') + String(r.stderr || '');

  if (r.status !== 3) {
    violations.push('[wrongCwdDistinct] ⛔ A WRONG WORKING DIRECTORY WORE THE ' +
      'COSTUME OF A CHANGED TREE. Run from ' + sub + ' against a snapshot ' +
      'whose recorded root is ' + d + ', with NONE of the named paths ' +
      'present here, the instrument returned rc=' + r.status + ' — the same ' +
      'verdict it gives a real delta — instead of a distinct one. Output: ' +
      JSON.stringify(out.slice(0, 500)));
  }
  if (out.indexOf(d) === -1) {
    violations.push('[wrongCwdDistinct] the verdict must NAME the recorded ' +
      'root (' + d + '); nothing in the output carries it.');
  }
  if (out.indexOf(sub) === -1) {
    violations.push('[wrongCwdDistinct] the verdict must NAME the current ' +
      'directory (' + sub + '); nothing in the output carries it.');
  }
  if (out.indexOf('git restore') !== -1) {
    violations.push('[wrongCwdDistinct] ⛔ THE RED-RESPONSE BLOCK FIRED ON A ' +
      'WRONG DIRECTORY. That block exists to tell a reader how to attribute ' +
      'a DELTA. There is no delta here, so printing it points the reader at ' +
      'the one reflex this whole instrument exists to prevent.');
  }

  removeScratch(d);
});

// ===========================================================================
// (E2) partialPresenceCompares — the arm that SHOULD fail, and does.
// ===========================================================================
//
// ⚠⚠ THE DANGEROUS DIRECTION OF WR-08b IS NOT A FALSE RED, IT IS A SILENCED
// ONE. The wrong-directory verdict returns early and compares nothing. Write
// its condition as "not ALL the named paths are here" instead of "not ONE of
// them is here" and a run where one named path has genuinely MOVED, beside a
// second that simply is not in this directory, stops reporting the delta at
// all and reports a tidy "you are in the wrong place" instead. The gate goes
// quiet in exactly the case it exists for.
//
// Nothing else in this file catches that: `scratchGreen` and `scratchRed`
// both name three paths that all exist, so under either condition they take
// the same branch. This group names two paths and provides ONE of them —
// mutated — from a directory that is not the recorded root.

group('partialPresenceCompares', function () {
  const a = mkRepo();
  fs.writeFileSync(path.join(a, 'p.txt'), 'present and about to move\n', 'utf8');
  fs.writeFileSync(path.join(a, 'q.txt'), 'not copied anywhere\n', 'utf8');
  git(['add', '--', '.'], a);
  const snap = takeSnapshot(a);

  const b = mkScratch();
  fs.copyFileSync(path.join(a, 'p.txt'), path.join(b, 'p.txt'));
  const before = fs.statSync(path.join(b, 'p.txt')).size;
  fs.appendFileSync(path.join(b, 'p.txt'), ' ');
  const after = fs.statSync(path.join(b, 'p.txt')).size;
  if (after - before !== 1) {
    violations.push('[partialPresenceCompares] ⚠ THE PLANT DID NOT APPLY: ' +
      'p.txt went from ' + before + ' to ' + after + ' bytes, a delta of ' +
      (after - before) + ' and not 1. No verdict below this line means ' +
      'anything.');
    return;
  }

  const r = run(['unchanged', snap.label, 'p.txt', 'q.txt'], b);
  const out = String(r.stdout || '');
  if (r.status === 3) {
    violations.push('[partialPresenceCompares] ⛔ A REAL DELTA WAS SILENCED ' +
      'BY THE WRONG-DIRECTORY VERDICT. p.txt is right here and its bytes ' +
      'MOVED; only q.txt is absent. Returning the wrong-directory verdict ' +
      'means the run compared nothing and said so calmly — the gate going ' +
      'quiet in precisely the case it exists for. The condition must be ' +
      '"NOT ONE of the named paths is here", never "not all of them are". ' +
      'Output: ' + JSON.stringify(out.slice(0, 500)));
    return;
  }
  if (r.status !== 1) {
    violations.push('[partialPresenceCompares] one named path present and ' +
      'CHANGED must still be a real delta — rc=' + r.status + ' instead of ' +
      '1. Output: ' + JSON.stringify(out.slice(0, 500)));
  }
  if (out.indexOf('p.txt ') === -1 || out.indexOf('CHANGED') === -1) {
    violations.push('[partialPresenceCompares] the moved path must be named ' +
      'and reported CHANGED — got ' + JSON.stringify(out.slice(0, 500)));
  }
  if (out.indexOf('git restore / checkout / stash / clean / reset are ' +
      'FORBIDDEN here.') === -1) {
    violations.push('[partialPresenceCompares] a real delta must carry the ' +
      'red-response block — this is the case where the reader genuinely has ' +
      'something to attribute.');
  }

  removeScratch(b);
  removeScratch(a);
});

// ===========================================================================
// (F) scratchGreen / scratchRed — the property that MAKES this evidence.
// ===========================================================================
//
// 26.96-01 recorded exactly this and nothing has re-driven it since: the
// instrument runs in a directory that is NOT a git repository, is green
// against untouched copies, and is red against ONE planted space with its
// siblings green in the SAME run. These two groups are also the control that
// keeps WR-08b honest — both run with a current directory that DIFFERS from
// the recorded root, so a wrong-directory check written as a cwd equality
// assertion would delete the property the gate's own evidence rests on.

const COPY_SOURCES = ['tests/lib/tree_snapshot.cjs', 'index.html', 'tokens.css'];
const SCRATCH_COPIES = { ready: false };

function prepareScratchCopies() {
  if (SCRATCH_COPIES.ready) { return SCRATCH_COPIES; }
  // A: a scratch REPOSITORY holding copies of three real files. Snapshotting
  // here rather than in the contended tree removes the only race there was —
  // the other live session cannot edit these copies between the snapshot and
  // the drive.
  const a = mkRepo();
  COPY_SOURCES.forEach(function (rel) {
    fs.copyFileSync(path.join(ROOT, rel), path.join(a, path.basename(rel)));
  });
  git(['add', '--', '.'], a);
  const snap = takeSnapshot(a);
  // B: a PLAIN directory — not a repository — holding the same bytes.
  const b = mkScratch();
  COPY_SOURCES.forEach(function (rel) {
    fs.copyFileSync(path.join(a, path.basename(rel)),
      path.join(b, path.basename(rel)));
  });
  SCRATCH_COPIES.ready = true;
  SCRATCH_COPIES.repo = a;
  SCRATCH_COPIES.plain = b;
  SCRATCH_COPIES.label = snap.label;
  SCRATCH_COPIES.names = COPY_SOURCES.map(function (rel) {
    return path.basename(rel);
  });
  return SCRATCH_COPIES;
}

group('scratchGreen', function () {
  const s = prepareScratchCopies();
  const r = run(['unchanged', s.label].concat(s.names), s.plain);
  const out = String(r.stdout || '');
  if (r.status !== 0) {
    violations.push('[scratchGreen] ⛔ THE INSTRUMENT LOST ITS PORTABILITY. ' +
      '`unchanged` against untouched copies in ' + s.plain + ' — a directory ' +
      'that is NOT a git repository and is NOT the recorded root — returned ' +
      'rc=' + r.status + ' instead of 0. That green arm is what makes this ' +
      'gate drivable RED, and 26.96-01 recorded both arms on it. Output: ' +
      JSON.stringify(out.slice(0, 500)));
  }
  s.names.forEach(function (nm) {
    if (out.indexOf(nm + ' ') === -1) {
      violations.push('[scratchGreen] every named path must PRINT, pass or ' +
        'fail — ' + nm + ' is missing from the output.');
    }
  });
});

group('scratchRed', function () {
  const s = prepareScratchCopies();
  const victim = s.names[1];
  const vp = path.join(s.plain, victim);
  const before = fs.statSync(vp).size;
  fs.appendFileSync(vp, ' ');
  const after = fs.statSync(vp).size;

  // ⚠ THE MUTATION IS PROVEN APPLIED BEFORE ITS VERDICT IS READ. This phase
  // has already recorded a plant that never applied and read exactly like a
  // gate that does not hold.
  if (after - before !== 1) {
    violations.push('[scratchRed] ⚠ THE PLANT DID NOT APPLY: ' + victim +
      ' went from ' + before + ' to ' + after + ' bytes, a delta of ' +
      (after - before) + ' and not 1. No verdict below this line means ' +
      'anything.');
    return;
  }

  const r = run(['unchanged', s.label].concat(s.names), s.plain);
  const out = String(r.stdout || '');
  const lines = out.split('\n');
  const verdictFor = function (nm) {
    let v = null;
    lines.forEach(function (ln) {
      if (ln.slice(0, nm.length + 1) === nm + ' ') {
        v = ln.slice(-7).trim() === 'CHANGED' ? 'CHANGED' :
          (ln.slice(-2) === 'OK' ? 'OK' : ln);
      }
    });
    return v;
  };

  if (r.status !== 1) {
    violations.push('[scratchRed] one planted space must turn the gate RED — ' +
      'rc=' + r.status + ' instead of 1. Output: ' +
      JSON.stringify(out.slice(0, 500)));
  }
  if (verdictFor(victim) !== 'CHANGED') {
    violations.push('[scratchRed] the planted file (' + victim + ') must be ' +
      'named CHANGED — got ' + JSON.stringify(verdictFor(victim)) + '.');
  }
  s.names.forEach(function (nm) {
    if (nm === victim) { return; }
    if (verdictFor(nm) !== 'OK') {
      violations.push('[scratchRed] the unmutated sibling ' + nm + ' must be ' +
        'OK in the SAME run — got ' + JSON.stringify(verdictFor(nm)) +
        '. Without a green sibling the red says only "something is wrong ' +
        'here", which is not attribution.');
    }
  });
  if (out.indexOf('git restore / checkout / stash / clean / reset are ' +
      'FORBIDDEN here.') === -1) {
    violations.push('[scratchRed] a REAL delta must still carry the ' +
      'red-response block — the instruction not to restore is the whole ' +
      'reason this gate is safe to be red.');
  }
});

// ---------------------------------------------------------------------------
// Close out: take back exactly what was claimed, then report.
// ---------------------------------------------------------------------------

removeAllScratches();
const stuck = removeClaimed();
if (stuck.length) {
  violations.push('[cleanup] ⛔ THIS RUN LEFT FILES BEHIND IN THE EVIDENCE ' +
    'DIRECTORY: ' + JSON.stringify(stuck) + '. Remove them by exact path.');
}
CLAIMED.forEach(function (p) {
  if (fs.existsSync(p)) {
    violations.push('[cleanup] ⛔ ' + p + ' still exists after cleanup.');
  }
});

if (violations.length) {
  console.log('test_tree_snapshot FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.log('  ' + v); });
  process.exit(1);
}
console.log('test_tree_snapshot OK — the instrument\'s own suite: ' +
  'labelRefused (a label outside [A-Za-z0-9._-]+ is refused with exit 2 and ' +
  'writes NOTHING — proven by listing the snapshot directory AND ITS PARENT ' +
  'before and after and comparing BY VALUE, not by the exit code, which a ' +
  'broken implementation could return while still writing), ' +
  'newlineRoundTrip (a tracked path whose name carries a newline round-trips ' +
  'through snapshot and unchanged, with the file\'s record-line count ' +
  'asserted BY VALUE against its own counts line — the property the header ' +
  'chose -z for and the serializer then gave away), oldFormatReadBack (a ' +
  'snapshot written BY HAND in the shipped bare-path form still parses and ' +
  'its hashes read back by value — the control that protects the snapshots ' +
  'already on disk, green on both sides of the format change, and driven ' +
  'without opening any of them), pipedComplete (600 named paths with stdout ' +
  'on a pipe and a reader that pauses: exactly 601 lines arrive, counted BY ' +
  'VALUE — MEASURED at 436 of 601 arriving before the fix, so process.exit() ' +
  'discarded 165 of them), ' +
  'wrongCwdDistinct (run where the named paths do not exist, the verdict is ' +
  'a DISTINCT return code naming both directories, and the red-response ' +
  'block does NOT fire, because there is no delta to attribute), ' +
  'partialPresenceCompares (the arm that SHOULD fail: one named path here ' +
  'and MOVED beside one that is absent, from a directory that is not the ' +
  'recorded root, still reports the delta — because the dangerous direction ' +
  'of that verdict is a SILENCED red, and "not all of them are here" would ' +
  'buy it), and ' +
  'scratchGreen / scratchRed (26.96-01\'s recorded property, re-driven: ' +
  'green against untouched copies in a directory that is neither a git ' +
  'repository nor the recorded root, red on ONE planted space with both ' +
  'siblings OK in the same run, the plant proven applied by a byte-length ' +
  'delta of exactly 1 before its verdict is read — and together the control ' +
  'that keeps the wrong-directory check narrow) — 8 groups, each wrapped, ' +
  'every write claimed by exact path and taken back by exact path.');
