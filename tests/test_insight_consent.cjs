/*
 * tests/test_insight_consent.cjs — the connection AND reflection consent
 * gate (Plans 26.4-02 + 26.4-07, Wave 0). Zero-dep node
 * (fs/path/os/http/child_process/assert), path-independent via __dirname.
 *
 * The load-bearing invariant of the phase (law 2/7, I4): a proposal the
 * librarian (or the deterministic reflection source) offers lives in
 * insights.json and reaches the bookshelf ONLY when the user's own Allow tap
 * (POST /api/state promote) writes it into books.json. This suite spawns the
 * real server.py over a temp library and proves, end to end:
 *
 *   (a) a proposal present in insights.json is ABSENT from books.json until
 *       an Allow promote (books.json does not even exist yet);
 *   (b) after POST /api/state {promote:[id]} a matching book record
 *       {id, title, connected_ids, why, allowed_ts} exists in books.json and
 *       the proposal is dropped from the stack;
 *   (c) POST /api/state {pass:[id]} NEVER writes books.json (D-02: the
 *       connection is left unshelved and may re-offer later).
 *
 * Plan 26.4-07 extends the gate with the DETERMINISTIC reflection proposal
 * source (D-28): a GET /api/librarian/insights refreshes reflection proposals
 * (every is_reflection store item, a pure store read — no librarian call)
 * MERGED beside any parked connection proposals. This suite additionally
 * proves:
 *
 *   (r1) the reflection source: a GET surfaces an is_reflection item as a
 *        proposal carrying kind:"reflection" + origin_path (a pure store read
 *        — nothing shelves yet: books.json still does not exist);
 *   (r2) MERGE, not replace: a pre-existing NON-reflection (connection)
 *        proposal SURVIVES a reflection refresh (T-26.4-35b), and the
 *        refresh is idempotent (a reflection is never duplicated);
 *   (r3) a promoted reflection's book keeps kind:"reflection" + origin_path,
 *        and a shelved reflection is NOT re-proposed by a later refresh;
 *   (r4) a legacy proposal with no kind promotes as kind:"connection".
 *
 * Plan 26.7-04 extends the gate with the SESSION SAVE — the three-path
 * consent gate's keep door (D-28): her save on the candle session's paper
 * materializes the essay as a real store item (source "librarian") and
 * shelves it THROUGH the same promote verb. This suite additionally proves:
 *
 *   (s1) STATIC surface pins over app.js: the paper offers exactly the
 *        three paths ("keep it" / "add details" / "let it go"); the keep
 *        drives POST /api/librarian/session/close (never /api/state, never
 *        a promote, never any book write from the client); the Manage
 *        write-back toggle row exists with its plain-words disclosure
 *        byte-pinned and a strict-true (default OFF) read; no re-refine
 *        affordance exists anywhere (D-08 — the refine route keeps exactly
 *        one call site, the chat send);
 *   (s2) LIVE: an active session file closed with {outcome:"save"} mints
 *        one store item with source "librarian" and one kind:"reflection"
 *        book resolving to it — and a SECOND close is a refused no-op
 *        (RSF-06 idempotency: no duplicate book, no second stamp).
 *
 * Hermetic: a fresh temp library, an ephemeral port, no network, no key —
 * the promote/pass verbs touch only insights.json/books.json, never a
 * credential or the agent (the close route runs no CLI call either).
 * Prints one OK line and exits 0 on success; exits 1 with the failing
 * assertion on failure.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

// The reflection item's stable id, title, and vault-relative origin. The
// promote verb copies origin_path into the book so the shelf can resolve the
// item; is_reflection matches on source + folder + a truthy reflects facet.
const REFLECTION_ID = '0000000000002001';
const REFLECTION_TITLE = 'The Boundary Has a Name Now';
const REFLECTION_PATH =
  "Claude's observation/Journal analysis/" +
  'The Boundary Has a Name Now 2026-07-15.md';

// The python bootstrap: bind create_server on an ephemeral port, print the
// real port (so this test never races a fixed port), then serve. cwd=ROOT
// so `import server` resolves to the repo's server.py.
const BOOT =
  'import sys, server; ' +
  'httpd = server.create_server(sys.argv[1], 0); ' +
  'print(httpd.server_address[1], flush=True); ' +
  'httpd.serve_forever()';

function writeStore(libDir) {
  // A minimal schema-v3 store — create_server load_store()-validates it.
  // The promote/pass verbs read only the librarian files; the DETERMINISTIC
  // reflection source (26.4-07) reads store items via study_lib.is_reflection.
  const id1 = '0000000000001001';
  const id2 = '0000000000001002';
  const store = {
    schema_version: 3,
    meta: {
      library_root: libDir,
      filters: [],
      last_visit_ms: null,
      fenced_roster: [],
    },
    items: {
      [id1]: { id: id1, state: 'blessed', type: 'text', title: 'a page',
        tags: [], history: [] },
      [id2]: { id: id2, state: 'blessed', type: 'text', title: 'another',
        tags: [], history: [] },
      // an is_reflection item: obsidian-vault + folder=="Journal analysis"
      // + a truthy reflects facet. The deterministic source must surface it
      // as a kind:"reflection" proposal on a GET (a pure store read).
      [REFLECTION_ID]: {
        id: REFLECTION_ID, state: 'blessed', type: 'text',
        title: REFLECTION_TITLE, source: 'obsidian-vault',
        folder: 'Journal analysis', origin_path: REFLECTION_PATH,
        reflects: true, tags: [], history: [],
      },
    },
  };
  fs.writeFileSync(path.join(libDir, 'items.json'),
    JSON.stringify(store, null, 1));
  return [id1, id2];
}

function writeProposals(libDir, proposals) {
  const dir = path.join(libDir, 'librarian');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'insights.json'),
    JSON.stringify({ proposals: proposals }, null, 1));
}

function booksPath(libDir) {
  return path.join(libDir, 'librarian', 'books.json');
}

function readBooks(libDir) {
  const p = booksPath(libDir);
  if (!fs.existsSync(p)) { return null; }
  return JSON.parse(fs.readFileSync(p, 'utf8')).books;
}

function readProposals(libDir) {
  const p = path.join(libDir, 'librarian', 'insights.json');
  if (!fs.existsSync(p)) { return []; }
  return JSON.parse(fs.readFileSync(p, 'utf8')).proposals;
}

function httpJson(port, method, urlPath, body) {
  return new Promise(function (resolve, reject) {
    const payload = body === undefined ? null
      : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      host: '127.0.0.1', port: port, method: method, path: urlPath,
      headers: payload
        ? { 'Content-Type': 'application/json',
          'Content-Length': payload.length }
        : {},
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* leave null */ }
        resolve({ status: res.statusCode, json: json });
      });
    });
    req.on('error', reject);
    if (payload) { req.write(payload); }
    req.end();
  });
}

// ---- (s1) the 26.7-04 static surface pins over app.js ----------------------
// Fix the source, never this gate. Sliced with the flat-layout convention
// (function keyword to the next module-indent function declaration).

function staticSurfacePins() {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  function fnBody(name) {
    const marker = 'function ' + name + '(';
    const start = app.indexOf(marker);
    assert.notStrictEqual(start, -1,
      "(s1) app.js: function '" + name + "' missing");
    const end = app.indexOf('\n  function ', start + marker.length);
    return app.slice(start, end === -1 ? app.length : end);
  }

  function countOf(haystack, needle) {
    return haystack.split(needle).length - 1;
  }

  // the three paths — the planner's exact copy, and only these three
  // affordances in the row builder (D-28: three doors, no fourth)
  const paths = fnBody('sessionPaintPaths');
  ['keep it', 'add details', 'let it go'].forEach(function (copy) {
    assert.notStrictEqual(paths.indexOf(copy), -1,
      "(s1) the three-path row must carry '" + copy + "'");
  });
  assert.strictEqual(countOf(paths, '<button'), 3,
    '(s1) the row builds exactly three affordances — no fourth door');

  // the keep drives the close route — never a client-side shelve
  const save = fnBody('sessionSaveTap');
  assert.notStrictEqual(save.indexOf('/api/librarian/session/close'), -1,
    '(s1) keep it drives POST /api/librarian/session/close');
  assert.notStrictEqual(save.indexOf("outcome: 'save'"), -1,
    "(s1) the keep posts outcome:'save'");
  ['/api/state', 'promote', 'books'].forEach(function (tok) {
    assert.strictEqual(save.indexOf(tok), -1,
      "(s1) sessionSaveTap must never carry '" + tok +
      "' — the server's promote verb is the one writer");
  });
  const pass = fnBody('sessionPassTap');
  assert.notStrictEqual(pass.indexOf("outcome: 'pass'"), -1,
    "(s1) let it go posts outcome:'pass'");

  // the Manage write-back row: disclosure byte-pinned, strict-true read
  // (default OFF by construction), written through /api/meta
  assert.notStrictEqual(app.indexOf(
    'write kept reflections back to my vault'), -1,
    '(s1) the write-back toggle label is pinned');
  assert.notStrictEqual(app.indexOf(
    "when this is on, a reflection you keep is also written into your " +
    "vault as one NEW note in Claude's observation/Journal analysis. " +
    "nothing already there is ever touched."), -1,
    '(s1) the write-back disclosure is pinned byte-for-byte');
  assert.notStrictEqual(app.indexOf(
    'MANAGE.meta.reflection_writeback_enabled === true'), -1,
    '(s1) the toggle reads strict-true — absent means OFF');
  const toggle = fnBody('handleReflectionWritebackToggle');
  assert.notStrictEqual(toggle.indexOf('/api/meta'), -1,
    '(s1) the toggle writes through the validated /api/meta whitelist');

  // D-08: books are sealed — no re-refine affordance exists anywhere.
  // The refine route keeps exactly ONE call site (the chat send), and
  // no shelved-book surface offers a second conversation entry.
  assert.strictEqual(countOf(app, "'/api/librarian/refine'"), 1,
    '(s1) the refine route keeps exactly one call site (sessionChatSend)');
  assert.strictEqual(app.indexOf('talk about this again'), -1,
    '(s1) the deferred re-refine idea must not surface this phase');
}

function startServer(libDir) {
  return new Promise(function (resolve, reject) {
    const child = spawn('python3', ['-c', BOOT, libDir], { cwd: ROOT });
    let out = '';
    let err = '';
    const timer = setTimeout(function () {
      reject(new Error('server did not print a port in time; stderr:\n' +
        err));
    }, 15000);
    child.stdout.on('data', function (c) {
      out += c;
      const m = out.match(/(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ child: child, port: parseInt(m[1], 10) });
      }
    });
    child.stderr.on('data', function (c) { err += c; });
    child.on('exit', function (code) {
      clearTimeout(timer);
      reject(new Error('server exited early (code ' + code + '); stderr:\n' +
        err));
    });
  });
}

async function main() {
  staticSurfacePins();
  const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-consent-'));
  const [id1, id2] = writeStore(libDir);
  // A pre-existing PARKED connection proposal (kind absent) sits in the
  // stack — it must survive the reflection refresh (r2 / T-26.4-35b) and, if
  // promoted, must default to kind:"connection" (r4).
  writeProposals(libDir, [{
    id: 'conn1', title: 'a warm thread',
    connected_ids: [id1, id2],
    why: 'both are about making something by hand',
  }]);

  const started = await startServer(libDir);
  const port = started.port;
  const child = started.child;
  try {
    // (r1 + r2) a GET refreshes the deterministic reflection proposals,
    // MERGED beside the parked connection proposal — a pure store read.
    const got = await httpJson(port, 'GET', '/api/librarian/insights');
    assert.strictEqual(got.status, 200, 'insights GET should be 200');
    const props = got.json.proposals;
    assert.ok(Array.isArray(props), 'proposals is a list');
    // the parked connection proposal SURVIVES (append/merge, not replace)
    const survived = props.find(function (p) { return p.id === 'conn1'; });
    assert.ok(survived, '(r2) the pre-existing connection proposal survives '
      + 'a reflection refresh — the writer merges, never replaces');
    assert.ok(survived.kind === undefined || survived.kind === 'connection',
      '(r2) a parked connection proposal carries no reflection kind');
    // the reflection surfaces as a kind:"reflection" proposal with origin
    const refProp = props.find(function (p) { return p.id === REFLECTION_ID; });
    assert.ok(refProp, '(r1) the is_reflection item surfaces as a proposal');
    assert.strictEqual(refProp.kind, 'reflection',
      '(r1) a reflection proposal carries kind:"reflection"');
    assert.strictEqual(refProp.origin_path, REFLECTION_PATH,
      '(r1) a reflection proposal carries its origin_path');
    assert.strictEqual(refProp.title, REFLECTION_TITLE,
      '(r1) a reflection proposal carries the reflection title');
    assert.strictEqual(readBooks(libDir), null,
      '(r1) a pure store read shelves nothing — books.json must not exist');

    // (r2) idempotent: a second refresh never duplicates the reflection
    const got2 = await httpJson(port, 'GET', '/api/librarian/insights');
    const dupes = got2.json.proposals.filter(function (p) {
      return p.id === REFLECTION_ID;
    });
    assert.strictEqual(dupes.length, 1,
      '(r2) the reflection proposal is upserted by id, never duplicated');

    // (a + r3) the Allow tap promotes the reflection into a book that KEEPS
    // kind:"reflection" + origin_path (nothing shelves without this Allow)
    const allow = await httpJson(port, 'POST', '/api/state',
      { promote: [REFLECTION_ID] });
    assert.strictEqual(allow.status, 200, 'promote should be 200: ' +
      JSON.stringify(allow.json));
    assert.deepStrictEqual(allow.json.promoted, [REFLECTION_ID]);
    const books = readBooks(libDir);
    assert.ok(Array.isArray(books) && books.length === 1,
      '(a) exactly one book after the reflection Allow');
    const rbook = books[0];
    assert.strictEqual(rbook.id, REFLECTION_ID);
    assert.strictEqual(rbook.kind, 'reflection',
      '(r3) the promoted book keeps kind:"reflection"');
    assert.strictEqual(rbook.origin_path, REFLECTION_PATH,
      '(r3) the promoted book keeps origin_path so the shelf can resolve it');
    assert.strictEqual(rbook.title, REFLECTION_TITLE);
    assert.strictEqual(typeof rbook.allowed_ts, 'number',
      '(a) the book carries an allowed_ts stamp');
    assert.ok(!readProposals(libDir).some(function (p) {
      return p.id === REFLECTION_ID;
    }), '(a) the promoted reflection is dropped from the proposal stack');

    // (r3) a later refresh does NOT re-propose an already-shelved reflection
    const got3 = await httpJson(port, 'GET', '/api/librarian/insights');
    assert.ok(!got3.json.proposals.some(function (p) {
      return p.id === REFLECTION_ID;
    }), '(r3) a shelved reflection is excluded from the proposal refresh');
    assert.ok(got3.json.proposals.some(function (p) { return p.id === 'conn1'; }),
      '(r3) the still-unshelved connection proposal remains offered');

    // (r4) a legacy proposal with no kind promotes as kind:"connection"
    const allow2 = await httpJson(port, 'POST', '/api/state',
      { promote: ['conn1'] });
    assert.strictEqual(allow2.status, 200, 'connection promote should be 200');
    const books2 = readBooks(libDir);
    const cbook = books2.find(function (b) { return b.id === 'conn1'; });
    assert.ok(cbook, '(r4) the connection promotes into a book');
    assert.strictEqual(cbook.kind, 'connection',
      '(r4) a legacy proposal with no kind promotes as kind:"connection"');
    assert.deepStrictEqual(cbook.connected_ids, [id1, id2],
      '(r4) the connection book keeps its connected_ids');
    assert.strictEqual(cbook.why, 'both are about making something by hand');

    // (b/c) a Pass never writes the book store. Seed a fresh proposal and
    // Pass it — no GET in between, so no refresh interferes with the check.
    writeProposals(libDir, [{
      id: 'conn2', title: 'another thread',
      connected_ids: [id1], why: 'a lighter echo',
    }]);
    const pass = await httpJson(port, 'POST', '/api/state',
      { pass: ['conn2'] });
    assert.strictEqual(pass.status, 200, 'pass should be 200');
    const booksAfterPass = readBooks(libDir);
    assert.ok(Array.isArray(booksAfterPass) && booksAfterPass.length === 2,
      '(c) a Pass adds no book — the store holds only the two Allowed ones');
    assert.ok(!booksAfterPass.some(function (b) { return b.id === 'conn2'; }),
      '(c) a Pass never shelves the passed proposal');
    assert.ok(!readProposals(libDir).some(function (p) {
      return p.id === 'conn2';
    }), '(c) the passed proposal left the stack, unshelved');

    // (s2) the session save closes through the SAME gate: an active
    // session file + POST close {outcome:"save"} mints one "librarian"
    // item and one kind:"reflection" book — and a second close is a
    // refused no-op (no duplicate book).
    fs.writeFileSync(path.join(libDir, 'librarian', 'session.json'),
      JSON.stringify({
        state: 'active', consented: true,
        pool: { meta_rows: [], bodies: [], counts: {} },
        draft: '## a small thread\n\nit holds, quietly, on its own.',
        coda: null, question: null, chat: [], created_ms: 1,
      }, null, 1));
    const booksBeforeSave = readBooks(libDir).length;
    const closed = await httpJson(port, 'POST',
      '/api/librarian/session/close', { outcome: 'save' });
    assert.strictEqual(closed.status, 200, '(s2) the save close should ' +
      'be 200: ' + JSON.stringify(closed.json));
    assert.strictEqual(closed.json.saved, true);
    const savedId = closed.json.book_id;
    assert.ok(savedId, '(s2) the save answers the shelved book id');
    const booksAfterSave = readBooks(libDir);
    assert.strictEqual(booksAfterSave.length, booksBeforeSave + 1,
      '(s2) exactly one book appears from the save');
    const savedBook = booksAfterSave.find(function (b) {
      return b.id === savedId;
    });
    assert.ok(savedBook, '(s2) the saved book carries the answered id');
    assert.strictEqual(savedBook.kind, 'reflection',
      '(s2) the saved book carries kind:"reflection"');
    assert.strictEqual(savedBook.title, 'a small thread',
      "(s2) the spine title is the draft's first heading");
    const itemsDoc = JSON.parse(fs.readFileSync(
      path.join(libDir, 'items.json'), 'utf8'));
    const savedItem = itemsDoc.items[savedId];
    assert.ok(savedItem, '(s2) the book id resolves to a real store item');
    assert.strictEqual(savedItem.source, 'librarian',
      '(s2) the materialized item carries source "librarian" — never ' +
      'obsidian-vault');
    assert.ok(!fs.existsSync(path.join(libDir, 'librarian',
      'session.json')), '(s2) the closed session file is discarded');
    const again = await httpJson(port, 'POST',
      '/api/librarian/session/close', { outcome: 'save' });
    assert.strictEqual(again.status, 400,
      '(s2) a second close is a refused no-op');
    assert.strictEqual(readBooks(libDir).length, booksAfterSave.length,
      '(s2) a refused re-close never duplicates a book');
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(libDir, { recursive: true, force: true });
  }
}

main().then(function () {
  console.log('test_insight_consent OK (consent gate: no book without an ' +
    'Allow; a Pass never shelves; deterministic reflection source merges ' +
    'kind:"reflection" proposals and promotes them keeping kind + ' +
    'origin_path; 26.7-04 session save shelves through the same verb — ' +
    'three-path surface pinned, second close a refused no-op)');
  process.exit(0);
}).catch(function (e) {
  console.error('test_insight_consent FAILED:');
  console.error('  ' + (e && e.message ? e.message : e));
  process.exit(1);
});
