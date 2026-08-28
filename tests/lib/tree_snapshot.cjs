#!/usr/bin/env node
'use strict';
/* =========================================================================
   26.96-01 — THE TREE-DISCIPLINE INSTRUMENT.

   WHY THIS FILE EXISTS. Phase 26.96 makes claims of the form "this file is
   untouched". The obvious instrument for that claim is
   `git diff HEAD -- <file>` emptiness — and in THIS tree that instrument is
   RED ON ARRIVAL and always will be. A second live session holds uncommitted
   work here and moves HEAD several times a day; on 2026-08-17 alone HEAD
   moved four times during planning and three more during review. A gate built
   on diff-emptiness therefore fails for reasons that have nothing to do with
   this phase.

   THAT IS WORSE THAN A GATE THAT CANNOT FAIL. The repair an executor reaches
   for when a "this file must be unchanged" gate is red is `git restore` —
   which would destroy the other session's uncommitted work. A gate must never
   be able to trigger the catastrophe it exists to prevent.

   SO THE MECHANISM IS A CONTENT-HASH CAPTURE, COMPARED AS A DELTA.

     snapshot <label>          record every tracked file's content hash, every
                               untracked file's content hash, and HEAD
     unchanged <label> <path>… is each named file byte-identical to what
                               <label> recorded?           exit 0 iff all are
     expect <label> <path>…    is the delta between <label> and the tree right
                               now EXACTLY the named set?  exit 0 iff it is
     delta <labelA> <labelB>   what moved between two snapshots — INFORMATIONAL.
                               ⛔ ALWAYS EXITS 0. Attribution is a reading, not
                               a verdict: at the phase gate the delta
                               legitimately holds both this phase's files and
                               the other session's, so a version that demanded
                               emptiness would be red on arrival for the third
                               time in this phase's history.

   WHY IT IS CAPABLE OF BOTH OUTCOMES — the property that makes it evidence.
   `unchanged` hashes files relative to the CURRENT WORKING DIRECTORY and never
   asks git anything. So it runs unmodified inside a scratch directory that is
   not a repository: point it at untouched copies and it is green; plant one
   space in one copy and it is red, naming that file and printing both hashes,
   with the unmutated siblings green in the SAME run. Neither drive touches the
   contended tree. Both arms are recorded in 26.96-01-SUMMARY.md.

   ⛔ THIS HELPER NEVER CALLS A GIT COMMAND THAT WRITES. It reads a file list
   (`git ls-files`) and it reads bytes. No add, no stash, no checkout, no
   reset, no clean — those are forbidden in this tree under every circumstance,
   and most of all when a gate is red.

   ⛔ IT DOES NOT SHELL OUT TO `git hash-object` EITHER. The hash is computed
   in Node from the file's own bytes, using git's blob construction
   (sha1 over "blob <byte-length>\0" followed by the bytes) so the values are
   recognisable against `git hash-object`. Computing it here is precisely what
   lets the helper run in a scratch directory that is not a repository, and
   that portability is what makes it drivable RED.

   ⚠ HOW A PATH IS WRITTEN INTO A SNAPSHOT, AND WHY THIS PARAGRAPH WAS
   WRONG UNTIL 2026-08-20. This file reads its file lists with `git ls-files
   -z` and said, right above `gitZ`, that it did so "so a filename containing
   a space or a newline cannot split a record" — and then wrote the records
   one per '\n' and parsed them with split('\n'). A tracked path containing a
   newline was written as two lines and the reader dropped the tail (or, if
   the tail happened to begin with `tracked `, recorded a phantom). The
   comment was true about the INPUT and false about the FILE, which on this
   project is the recurring defect: a false comment standing beside true code
   certifies the wrong thing. 26.96's verification found it (WR-07) and
   26.96-08 fixed it: the path field is now written with JSON.stringify, so a
   newline is escaped and one record is one line.

   ⛔ AND THE READER TAKES BOTH SHAPES, PERMANENTLY. Twelve snapshots were
   already on disk when that changed — `wave0` and `wave0-postplan` among
   them — and they are this phase's attribution trail. They stay exactly as
   written; `readSnapshot` accepts a quoted field OR a bare one. That branch
   is load-bearing, not tidy-uppable.

   ⚠ STATUS IS PART OF THE RECORD. A path that moves from untracked to tracked
   has moved, and `expect` reports it as CHANGED. Otherwise a file created and
   then committed inside one wave would vanish from its own wave's delta.

   THIS FILE LIVES IN tests/lib/, NOT tests/. It is a library, not a suite: the
   node sweep glob is `tests/test_*.cjs` and this path must not match it.

   Zero dependencies — node builtins only (fs/path/os/crypto/child_process).
   There is no package.json in this repo and this file does not create one.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SNAP_DIR = path.join(os.homedir(), '.2696-snapshots');
const BIG = 1 << 28;

// --- hashing -------------------------------------------------------------

function blobHash(bytes) {
  const h = crypto.createHash('sha1');
  h.update('blob ' + bytes.length + '\0');
  h.update(bytes);
  return h.digest('hex');
}

// Returns null when the path does not exist or is not a regular file. A null
// is never silently treated as "matches"; every caller turns it into CHANGED.
function hashFile(p) {
  try {
    const st = fs.lstatSync(p);
    if (!st.isFile()) { return null; }
    return blobHash(fs.readFileSync(p));
  } catch (e) {
    return null;
  }
}

// Resolves symlinks when it can and hands the input back untouched when it
// cannot — used only to compare two directory names, never to open anything.
function realOrSelf(p) {
  try { return fs.realpathSync(p); } catch (e) { return p; }
}

// --- git reads (never writes) --------------------------------------------

function gitOut(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: BIG });
}

// -z so a filename containing a space or a newline cannot split a record ON
// THE WAY IN. ⚠ See the header: until 2026-08-20 that was only half true,
// because the record was then written back out one per '\n'.
function gitZ(args) {
  return gitOut(args).split('\0').filter(function (s) { return s.length > 0; });
}

function enumerateTree() {
  const root = gitOut(['rev-parse', '--show-toplevel']).trim();
  process.chdir(root);
  let head = '';
  let branch = '';
  try { head = gitOut(['rev-parse', 'HEAD']).trim(); } catch (e) { head = '<none>'; }
  try {
    branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  } catch (e) { branch = '<none>'; }
  const entries = new Map();
  gitZ(['ls-files', '-z']).forEach(function (p) {
    const h = hashFile(p);
    // A tracked path with no file on disk is skipped, not recorded as a
    // phantom: a deleted-but-still-tracked path would otherwise inflate the
    // tracked count and break the by-value count assertion.
    if (h === null) { return; }
    entries.set(p, { status: 'tracked', hash: h });
  });
  gitZ(['ls-files', '-z', '--others', '--exclude-standard']).forEach(function (p) {
    const h = hashFile(p);
    if (h === null) { return; }
    entries.set(p, { status: 'untracked', hash: h });
  });
  return { root: root, head: head, branch: branch, entries: entries };
}

// --- snapshot file I/O ---------------------------------------------------

// ⛔ A LABEL IS argv, AND argv BECOMES A PATH. Without this test
// `snapshot ../../.ssh/config` writes outside SNAP_DIR entirely. The guard
// fires HERE rather than at the call site so every path in this file — the
// writer and both readers — is behind it, and callers invoke it BEFORE
// creating any directory so a refused label cannot leave a footprint either.
// (26.96-08, WR-06. Driven by tests/test_tree_snapshot.cjs#labelRefused,
// which asserts the surrounding directories are byte-for-byte unchanged
// rather than trusting the exit code — a broken implementation could return
// the right code and still have written the file.)
function snapPath(label) {
  if (!/^[A-Za-z0-9._-]+$/.test(label)) {
    console.error('tree_snapshot: a label must be [A-Za-z0-9._-]+ — got ' +
      JSON.stringify(label) + '. Nothing was written.');
    process.exit(2);
  }
  return path.join(SNAP_DIR, label + '.snapshot');
}

function readSnapshot(label) {
  const p = snapPath(label);
  if (!fs.existsSync(p)) {
    console.error('tree_snapshot: no snapshot named "' + label + '" at ' + p +
      ' — take one first with: node tests/lib/tree_snapshot.cjs snapshot ' +
      label);
    process.exit(2);
  }
  const rec = { label: label, file: p, head: '', root: '', taken: '',
    entries: new Map() };
  fs.readFileSync(p, 'utf8').split('\n').forEach(function (line) {
    if (!line) { return; }
    if (line.slice(0, 5) === 'head ') { rec.head = line.slice(5).trim(); return; }
    if (line.slice(0, 5) === 'root ') { rec.root = line.slice(5).trim(); return; }
    if (line.slice(0, 6) === 'taken ') { rec.taken = line.slice(6).trim(); return; }
    let status = null;
    let rest = null;
    if (line.slice(0, 8) === 'tracked ') { status = 'tracked'; rest = line.slice(8); }
    else if (line.slice(0, 10) === 'untracked ') { status = 'untracked'; rest = line.slice(10); }
    if (rest === null) { return; }
    const sp = rest.indexOf(' ');
    if (sp === -1) { return; }
    let p2 = rest.slice(sp + 1);
    // ⛔ THE DUAL FORM IS NOT A NICETY AND MUST NOT BE "SIMPLIFIED" AWAY.
    // Twelve snapshots were already on disk when the path field started
    // being JSON-quoted (26.96-08) — wave0 and wave0-postplan among them,
    // and they are phase 26.96's ATTRIBUTION TRAIL. They are written in the
    // bare form and they are never re-pinned, so this reader has to accept
    // both shapes forever: a field that begins with '"' is JSON; anything
    // else is the path itself, exactly as it always was. Deleting this
    // branch orphans the baseline every untouched-ness gate in the phase
    // reads. Pinned by tests/test_tree_snapshot.cjs#oldFormatReadBack.
    if (p2.length && p2[0] === '"') {
      try { p2 = JSON.parse(p2); } catch (e) { /* keep the literal field */ }
    }
    rec.entries.set(p2, { status: status, hash: rest.slice(0, sp) });
  });
  return rec;
}

// --- subcommands ---------------------------------------------------------

function cmdSnapshot(label) {
  // ⚠ VALIDATE FIRST. This call is the label guard, and it must run before
  // fs.mkdirSync below — otherwise a refused label would still have created
  // a directory somewhere on the way to being refused.
  const out = snapPath(label);
  const tree = enumerateTree();
  const lines = [];
  lines.push('# 26.96 tree snapshot — content hashes, git blob construction');
  lines.push('# (sha1 over "blob <byte-length>\\0" + bytes; matches git hash-object)');
  lines.push('label ' + label);
  lines.push('taken ' + new Date().toISOString());
  lines.push('root ' + tree.root);
  lines.push('head ' + tree.head);
  lines.push('branch ' + tree.branch);
  let nT = 0;
  let nU = 0;
  const paths = Array.from(tree.entries.keys()).sort();
  paths.forEach(function (p) {
    const e = tree.entries.get(p);
    // JSON-quoted so a newline inside a path cannot split its own record.
    lines.push(e.status + ' ' + e.hash + ' ' + JSON.stringify(p));
    if (e.status === 'tracked') { nT++; } else { nU++; }
  });
  lines.push('counts tracked=' + nT + ' untracked=' + nU);
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  console.log('tree_snapshot: wrote ' + out);
  console.log('  head=' + tree.head + ' branch=' + tree.branch);
  console.log('  tracked=' + nT + ' untracked=' + nU);
  return 0;
}

function cmdUnchanged(label, paths) {
  if (!paths.length) {
    console.error('tree_snapshot: unchanged needs at least one path');
    return 2;
  }
  const snap = readSnapshot(label);

  // ⛔ A WRONG WORKING DIRECTORY IS NOT A CHANGED TREE (26.96-08, WR-08b).
  // This command hashes relative to the CURRENT directory. Run from the wrong
  // one, every named path is <absent> and every verdict is CHANGED — a FULL
  // RED in the one gate whose red an executor acts on, and whose reflex
  // repair (`git restore`) is the catastrophe this whole file exists to
  // prevent. So that case gets its own verdict and its own exit code, and it
  // does NOT print the red-response block below: there is no delta here, and
  // telling the reader to go attribute one is the lie.
  //
  // ⛔ THE NARROWNESS IS THE WHOLE DESIGN, AND IT IS NOT A cwd ASSERTION.
  // `unchanged` legitimately runs against untouched COPIES in a scratch
  // directory that is not the recorded root and is not even a repository —
  // that portability is exactly what makes this instrument drivable RED, and
  // 26.96-01 recorded both arms on it. The named paths EXISTING is what
  // separates "a legitimate scratch drive" from "you are standing in the
  // wrong place", so this fires only when the root differs AND not one of
  // the named paths is here.
  const here = realOrSelf(process.cwd());
  const anyHere = paths.some(function (p) { return fs.existsSync(p); });
  if (snap.root && !anyHere && realOrSelf(snap.root) !== here) {
    console.log('-- unchanged[' + label + ']: WRONG DIRECTORY — NOT a ' +
      'changed tree, and nothing has been attributed.');
    console.log('   snapshot "' + label + '" recorded root: ' + snap.root);
    console.log('   this run is in:                 ' + process.cwd());
    console.log('   and NOT ONE of the ' + paths.length + ' named path(s) ' +
      'exists here: ' + JSON.stringify(paths));
    console.log('   Nothing was compared. cd to the recorded root — or to a ' +
      'directory that actually holds these paths — and run it again. This ' +
      'is deliberately a DIFFERENT verdict, with a different exit code, from ' +
      'a real delta.');
    return 3;
  }

  let changed = 0;
  paths.forEach(function (p) {
    const rec = snap.entries.get(p);
    const was = rec ? rec.hash : null;
    const now = hashFile(p);
    let verdict;
    if (was === null) { verdict = 'CHANGED'; }
    else if (now === null) { verdict = 'CHANGED'; }
    else { verdict = (now === was) ? 'OK' : 'CHANGED'; }
    if (verdict !== 'OK') { changed++; }
    // ⚠ EVERY PATH PRINTS, PASS OR FAIL. A gate that speaks only when it is
    // red cannot be read as evidence when it is green.
    console.log(p + ' ' + label + '=' + (was === null ? '<absent>' : was) +
      ' now=' + (now === null ? '<absent>' : now) + ' ' + verdict);
  });
  console.log('-- unchanged[' + label + ']: ' + (paths.length - changed) +
    ' identical, ' + changed + ' differing, of ' + paths.length + ' named' +
    ' (cwd ' + process.cwd() + ')');
  if (changed) {
    console.log('⛔ THE RESPONSE TO RED IS RE-MEASURE AND ATTRIBUTE, NEVER ' +
      'RESTORE. Read the two hashes above, then run the span gate ' +
      '(node tests/test_roster_route_behaviour.cjs) to learn whether a ' +
      'function this phase promised not to touch actually moved. If none ' +
      'did, the change belongs to the other live session in this tree: ' +
      'RECORD it in the SUMMARY with both hashes and carry on. ' +
      'git restore / checkout / stash / clean / reset are FORBIDDEN here.');
  }
  return changed ? 1 : 0;
}

function computeDelta(snap, nowEntries) {
  const delta = [];
  snap.entries.forEach(function (v, k) {
    if (!nowEntries.has(k)) {
      delta.push({ kind: 'REMOVED', path: k, from: v.hash + '/' + v.status,
        to: '<absent>' });
      return;
    }
    const n = nowEntries.get(k);
    if (n.hash !== v.hash || n.status !== v.status) {
      delta.push({ kind: 'CHANGED', path: k, from: v.hash + '/' + v.status,
        to: n.hash + '/' + n.status });
    }
  });
  nowEntries.forEach(function (v, k) {
    if (!snap.entries.has(k)) {
      delta.push({ kind: 'ADDED', path: k, from: '<absent>',
        to: v.hash + '/' + v.status });
    }
  });
  delta.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });
  return delta;
}

function cmdExpect(label, paths) {
  const snap = readSnapshot(label);
  const tree = enumerateTree();
  const delta = computeDelta(snap, tree.entries);
  // ⚠ THE ACTUAL DELTA ALWAYS PRINTS, whatever the verdict.
  console.log('-- delta[' + label + ' -> now] (' + delta.length + ' path(s)); ' +
    'snapshot head=' + snap.head + ' current head=' + tree.head);
  delta.forEach(function (d) {
    console.log('  ' + d.kind + ' ' + d.path + ' ' + label + '=' + d.from +
      ' now=' + d.to);
  });
  const got = delta.map(function (d) { return d.path; }).sort();
  const want = paths.slice().sort();
  const gotSet = new Set(got);
  const wantSet = new Set(want);
  const unexpected = got.filter(function (p) { return !wantSet.has(p); });
  const missing = want.filter(function (p) { return !gotSet.has(p); });
  if (!unexpected.length && !missing.length) {
    console.log('-- expect[' + label + ']: OK — the delta is EXACTLY the ' +
      want.length + ' named path(s)');
    return 0;
  }
  if (unexpected.length) {
    console.log('-- expect[' + label + ']: UNEXPECTED (' + unexpected.length +
      '): ' + JSON.stringify(unexpected));
  }
  if (missing.length) {
    console.log('-- expect[' + label + ']: NAMED BUT UNCHANGED (' +
      missing.length + '): ' + JSON.stringify(missing));
  }
  console.log('⛔ RE-MEASURE AND ATTRIBUTE, NEVER RESTORE. An UNEXPECTED path ' +
    'is either this phase breaking its own promise — check the span gate — ' +
    'or the other live session\'s uncommitted work, which gets RECORDED in ' +
    'the SUMMARY and left exactly where it is.');
  return 1;
}

function cmdDelta(a, b) {
  const A = readSnapshot(a);
  const B = readSnapshot(b);
  const delta = computeDelta(A, B.entries);
  console.log('-- delta[' + a + ' -> ' + b + '] (' + delta.length + ' path(s))');
  console.log('   ' + a + ' head=' + A.head + ' taken=' + A.taken);
  console.log('   ' + b + ' head=' + B.head + ' taken=' + B.taken);
  delta.forEach(function (d) {
    console.log('  ' + d.kind + ' ' + d.path + ' ' + a + '=' + d.from +
      ' ' + b + '=' + d.to);
  });
  // ⛔ ALWAYS 0. Attribution is a reading, not a verdict — see the header.
  return 0;
}

// --- entry point ---------------------------------------------------------

function usage() {
  console.error('usage:');
  console.error('  tree_snapshot.cjs snapshot  <label>');
  console.error('  tree_snapshot.cjs unchanged <label> <path>...');
  console.error('  tree_snapshot.cjs expect    <label> [<path>...]');
  console.error('  tree_snapshot.cjs delta     <labelA> <labelB>   (always exit 0)');
  return 2;
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'snapshot') {
    if (!argv[1]) { return usage(); }
    return cmdSnapshot(argv[1]);
  }
  if (cmd === 'unchanged') {
    if (!argv[1]) { return usage(); }
    return cmdUnchanged(argv[1], argv.slice(2));
  }
  if (cmd === 'expect') {
    if (!argv[1]) { return usage(); }
    return cmdExpect(argv[1], argv.slice(2));
  }
  if (cmd === 'delta') {
    if (!argv[1] || !argv[2]) { return usage(); }
    return cmdDelta(argv[1], argv[2]);
  }
  return usage();
}

// ⛔ THE RESULT OF main IS ASSIGNED, NEVER PASSED STRAIGHT TO AN IMMEDIATE
// EXIT. An immediate exit throws away whatever is still queued on an
// asynchronous stdout, and this tool's stdout IS its evidence:
// piped into anything that does work per line, a run over a few hundred paths
// loses every line after the pipe buffer fills. Measured at 436 of 601 before
// this changed. Setting exitCode and returning lets the process drain and
// then exit with the same code, so the header's rule — "EVERY PATH PRINTS,
// PASS OR FAIL" — is a property of the exit path and not just of the loop.
// (26.96-08, WR-08a. Driven by tests/test_tree_snapshot.cjs#pipedComplete.)
process.exitCode = main(process.argv.slice(2));
