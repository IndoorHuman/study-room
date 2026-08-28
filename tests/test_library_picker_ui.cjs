#!/usr/bin/env node
'use strict';
/* tests/test_library_picker_ui.cjs — setup screen refuses ./MyNotes in #library-note
 * (Plan 26.9996-07, UAT gap 1).
 *
 * Boots the shipped index.html + server.py on a throwaway HOME (never her
 * StudyRoom), walks onboarding to #screen-setup, types ./MyNotes, clicks
 * #btn-library, and reads what #library-note actually rendered in Chrome.
 *
 * ⛔ NEVER TOUCHES THE OWNER'S LIBRARY. HOME is a fresh os.tmpdir() tree;
 * the server library is ~/StudyRoom under that HOME only.
 *
 * Run: node tests/test_library_picker_ui.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const cdp = require(path.join(ROOT, 'tests/lib/cdp.cjs'));

// Pinned to tests/test_library_picker_refuse.py / server.OWNER_COPY_LIBRARY_REFUSAL.
const OWNER_COPY_LIBRARY_REFUSAL =
  'That path cannot be your library. Choose a folder outside the Study ' +
  'Room app so replacing the app folder never touches your notes.';

const BAD_PATH = './MyNotes';
const VIEWPORT = { width: 1100, height: 800 };
const BOOT_DEADLINE_MS = 25000;
const POLL_MS = 25;

const BOOTSTRAP = [
  'import sys, os',
  'sys.path.insert(0, sys.argv[1])',
  'import study_lib, server',
  'home = os.environ["HOME"]',
  'resolved = str(study_lib.room_config_dir())',
  'if not resolved.startswith(os.path.abspath(home) + os.sep):',
  '    raise SystemExit("config dir outside temp HOME: " + resolved)',
  'lib = os.path.join(home, "StudyRoom")',
  'os.makedirs(lib, exist_ok=True)',
  'httpd = server.create_server(lib, 0)',
  'print("GATE_PORT=%d" % httpd.server_address[1], flush=True)',
  'httpd.serve_forever()'
].join('\n');

const violations = [];

function fail(msg) { violations.push(msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function click(session, sel) {
  const box = await cdp.evaluate(session,
    '(function(){var n=document.querySelector(' + JSON.stringify(sel) + ');' +
    'if(!n)return null;n.scrollIntoView({block:"center"});' +
    'var r=n.getBoundingClientRect();' +
    'if(r.width===0||r.height===0)return null;' +
    'return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()');
  if (!box) { throw new Error('not clickable / not present: ' + sel); }
  const p = JSON.parse(box);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send(session, 'Input.dispatchMouseEvent',
      { type: type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
}

async function waitFor(session, expr, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const val = await cdp.evaluate(session, expr);
    if (val && val !== 'null' && val !== 'false' && val !== '0') { return val; }
    await sleep(POLL_MS);
  }
  throw new Error('timed out waiting for: ' + expr);
}

async function startServer(tempHome) {
  const python = process.env.GSD_PYTHON_BIN || 'python3';
  const state = { child: null, exited: false, stderr: '', stopped: false };
  const child = spawn(python, ['-c', BOOTSTRAP, ROOT],
    { cwd: ROOT, env: { ...process.env, HOME: tempHome },
      stdio: ['ignore', 'pipe', 'pipe'] });
  state.child = child;
  child.on('exit', function () { state.exited = true; });
  let out = '';
  child.stdout.on('data', function (b) { out += String(b); });
  child.stderr.on('data', function (b) { state.stderr += String(b); });

  async function stop() {
    if (state.stopped) { return; }
    state.stopped = true;
    try { if (state.child) { state.child.kill('SIGKILL'); } } catch (e) { /* gone */ }
    const deadline = Date.now() + 5000;
    while (!state.exited && Date.now() < deadline) { await sleep(POLL_MS); }
  }

  const deadline = Date.now() + BOOT_DEADLINE_MS;
  let port = null;
  while (Date.now() < deadline) {
    const m = out.match(/GATE_PORT=(\d+)/);
    if (m) { port = parseInt(m[1], 10); break; }
    if (state.exited) {
      throw new Error('server child exited before port. stderr:\n' + state.stderr);
    }
    await sleep(POLL_MS);
  }
  if (port === null) {
    throw new Error('no GATE_PORT within deadline. stderr:\n' + state.stderr);
  }

  const url = 'http://127.0.0.1:' + port + '/index.html';
  let served = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) { served = true; break; }
    } catch (e) { /* not up yet */ }
    await sleep(POLL_MS);
  }
  if (!served) {
    throw new Error('nothing served ' + url + '. stderr:\n' + state.stderr);
  }
  return { url: url, stop: stop };
}

async function reachSetup(session) {
  await waitFor(session,
    '(function(){return document.getElementById("btn-onb-step-inside")?' +
    '"1":"0";})()', 15000);
  await click(session, '#btn-onb-step-inside');
  await waitFor(session,
    '(function(){return document.getElementById("btn-onb-name-skip")?"1":"0";})()',
    10000);
  await click(session, '#btn-onb-name-skip');
  await waitFor(session,
    '(function(){return document.getElementById("btn-onb-sources-go")?"1":"0";})()',
    10000);
  await click(session, '#btn-onb-sources-go');
  await waitFor(session,
    '(function(){var s=document.getElementById("screen-setup");' +
    'return s&&s.classList.contains("active")?"1":"0";})()', 10000);
}

(async function () {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lib-picker-ui-'));
  let session = null;
  let server = null;
  try {
    server = await startServer(tempHome);
    session = await cdp.launch({ url: server.url, viewport: VIEWPORT });
    await reachSetup(session);

    await cdp.evaluate(session,
      '(function(){var el=document.getElementById("library-path-input");' +
      'if(!el)return "missing";el.value=' + JSON.stringify(BAD_PATH) + ';' +
      'return "ok";})()');

    await click(session, '#btn-library');

    const noteText = await waitFor(session,
      '(function(){var n=document.getElementById("library-note");' +
      'if(!n)return "";return (n.textContent||"").trim();})()', 10000);

    if (noteText.indexOf(OWNER_COPY_LIBRARY_REFUSAL) === -1) {
      fail('#library-note must show OWNER_COPY_LIBRARY_REFUSAL; got: ' +
        JSON.stringify(noteText));
    }
    if (noteText.indexOf('your library lives at') !== -1 &&
        noteText.indexOf(BAD_PATH) !== -1) {
      fail('#library-note must not accept ./MyNotes as library; got: ' +
        JSON.stringify(noteText));
    }

    const inputVal = await cdp.evaluate(session,
      '(function(){var el=document.getElementById("library-path-input");' +
      'return el?(el.value||"").trim():"";})()');
    if (inputVal !== BAD_PATH) {
      fail('#library-path-input should still show ./MyNotes; got: ' +
        JSON.stringify(inputVal));
    }
  } finally {
    if (session) { try { await cdp.close(session); } catch (e) { /* closing */ } }
    if (server) { try { await server.stop(); } catch (e) { /* stopping */ } }
    try { fs.rmSync(tempHome, { recursive: true, force: true }); } catch (e) { /* gone */ }
  }

  if (violations.length) {
    violations.forEach(function (v) { console.log('FAIL: ' + v); });
    process.exitCode = 1;
  } else {
    console.log('ok: library-picker-ui-refusal');
  }
})().catch(function (e) {
  console.error('test_library_picker_ui COULD NOT BE DRIVEN: ' +
    (e && e.message ? e.message : e));
  process.exitCode = 1;
});
