/*
 * tests/test_layout_books.cjs — the layout `books` position map (Plan
 * 26.4-07, Wave 2). Zero-dep node (fs/path/os/http/child_process/assert),
 * path-independent via __dirname; mirrors the harness of
 * test_insight_consent.cjs (spawn the real server.py over a temp library on
 * an ephemeral port, drive /api/layout over HTTP).
 *
 * D-27 persistence seam: reflection-book spines drag inside the shipped
 * design-mode/undo/postLayout machinery, so the layout schema gains a
 * validated `books` map (opaque book id -> {x,y}). The validator rejects
 * unknown top-level keys (server.py), so `books` must be whitelisted AND
 * validated or every spine drag silently 400s (Pitfall 3). This suite proves:
 *
 *   (1) a valid books map is accepted and ROUND-TRIPS on the next GET;
 *   (2) each malformed variant is REFUSED 400 (non-dict, over-cap, off-grid,
 *       out-of-bounds, empty id, a position missing y) — the layout trust
 *       boundary (T-26.4-33);
 *   (3) an old layout with NO books key still validates + loads (back-compat;
 *       spines auto-pack client-side).
 *
 * Book ids are OPAQUE store ids used only as map keys — never resolved as
 * filesystem paths (T-26.4-36). SCENE_W=384, SCENE_H=216, LAYOUT_GRID=12,
 * ADDED_CAP=64 mirror server.py. Prints one OK line and exits 0 on success;
 * exits 1 with the failing assertion on failure.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

const SCENE_W = 384;
const SCENE_H = 216;
const GRID = 12;
const ADDED_CAP = 64;

const BOOT =
  'import sys, server; ' +
  'httpd = server.create_server(sys.argv[1], 0); ' +
  'print(httpd.server_address[1], flush=True); ' +
  'httpd.serve_forever()';

function writeStore(libDir) {
  // A minimal schema-v3 store so startup is clean; /api/layout never reads
  // the store (layout.json is a separate file by design).
  const store = {
    schema_version: 3,
    meta: { library_root: libDir, filters: [], last_visit_ms: null,
      fenced_roster: [] },
    items: {},
  };
  fs.writeFileSync(path.join(libDir, 'items.json'),
    JSON.stringify(store, null, 1));
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

async function post(port, layout) {
  return httpJson(port, 'POST', '/api/layout', layout);
}

async function main() {
  const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-books-'));
  writeStore(libDir);
  const started = await startServer(libDir);
  const port = started.port;
  const child = started.child;
  try {
    // (1) a valid books map is accepted and round-trips
    const validBooks = {
      'refbook-0000000000002001': { x: 24, y: 100 },
      'refbook-0000000000002002': { x: 372, y: 0 },   // x on the far grid edge
    };
    const ok = await post(port, { version: 1, books: validBooks });
    assert.strictEqual(ok.status, 200,
      '(1) a valid books map is accepted: ' + JSON.stringify(ok.json));
    const got = await httpJson(port, 'GET', '/api/layout');
    assert.strictEqual(got.status, 200, '(1) layout GET is 200');
    assert.ok(got.json.layout && got.json.layout.books,
      '(1) the persisted layout carries the books map');
    assert.deepStrictEqual(got.json.layout.books, validBooks,
      '(1) the books map round-trips byte-for-byte on the next GET');

    // (2) every malformed variant is refused 400
    const bad = [
      ['non-dict books', { version: 1, books: [] }],
      ['a position missing y', { version: 1, books: { b: { x: 12 } } }],
      ['off-grid x', { version: 1, books: { b: { x: 13, y: 0 } } }],
      ['out-of-bounds x', { version: 1, books: { b: { x: SCENE_W, y: 0 } } }],
      ['out-of-bounds y',
        { version: 1, books: { b: { x: 0, y: SCENE_H } } }],
      ['empty id', { version: 1, books: { '': { x: 12, y: 12 } } }],
      ['non-numeric x',
        { version: 1, books: { b: { x: 'left', y: 0 } } }],
      ['a position with an extra key',
        { version: 1, books: { b: { x: 12, y: 12, z: 1 } } }],
    ];
    for (const pair of bad) {
      const label = pair[0];
      const res = await post(port, pair[1]);
      assert.strictEqual(res.status, 400,
        '(2) ' + label + ' must be refused 400 (got ' + res.status + ')');
    }
    // over-cap: ADDED_CAP + 1 spines
    const over = {};
    for (let i = 0; i <= ADDED_CAP; i++) { over['b' + i] = { x: 0, y: 0 }; }
    const overRes = await post(port, { version: 1, books: over });
    assert.strictEqual(overRes.status, 400,
      '(2) more than ADDED_CAP spines is refused 400');

    // a refused write never disturbs the persisted valid layout
    const still = await httpJson(port, 'GET', '/api/layout');
    assert.deepStrictEqual(still.json.layout.books, validBooks,
      '(2) a refused malformed POST leaves the persisted books map intact');

    // (3) an old layout with NO books key still validates + loads
    const noBooks = await post(port,
      { version: 1, objects: { desk: { x: 0, y: 0 } } });
    assert.strictEqual(noBooks.status, 200,
      '(3) a books-less layout still validates (back-compat)');
    const gotNoBooks = await httpJson(port, 'GET', '/api/layout');
    assert.strictEqual(gotNoBooks.status, 200,
      '(3) a books-less layout loads');
    assert.ok(!('books' in gotNoBooks.json.layout),
      '(3) the reloaded layout carries no books key — nothing is invented');
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(libDir, { recursive: true, force: true });
  }
}

main().then(function () {
  console.log('test_layout_books OK (valid books map round-trips; malformed ' +
    'maps 400; a books-less layout still loads)');
  process.exit(0);
}).catch(function (e) {
  console.error('test_layout_books FAILED:');
  console.error('  ' + (e && e.message ? e.message : e));
  process.exit(1);
});
