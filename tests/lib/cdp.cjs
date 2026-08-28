'use strict';
/* =========================================================================
   26.91-01 — A ZERO-DEPENDENCY CHROME DEVTOOLS PROTOCOL CLIENT.

   WHY THIS FILE EXISTS. `26.91-UI-SPEC.md` Open Decision #5: three of this
   phase's gates read RENDERED GEOMETRY and LIVE COMPUTED STYLE, and this repo
   has no layout engine. `tests/test_blessings_notebook.cjs` stubs
   getComputedStyle to return the string '1' at three sites (:3299, :3805,
   :5621); the one comparable measurement in the tree
   (`tests/test_reformat_wiring.cjs:1477`) was taken BY HAND by the owner.
   A live gate with no runner is a check that cannot execute — this project's
   named defect class in its purest form. This is route (ii): drive the system
   Chrome over CDP using only Node built-ins.

   NOTHING IS INSTALLED. `child_process`, `fs`, `os`, `path` are built-in
   modules; `fetch` and `WebSocket` are Node 26 globals (verified: node
   v26.3.1, `typeof WebSocket === 'function'`). There is no package.json and
   no node_modules in this repo and this file does not create either.

   THIS FILE LIVES IN tests/lib/, NOT tests/. The node sweep glob is
   `tests/*.cjs` and a library is not a suite. `ls tests/*.cjs` must not
   match this path; `test_live_render.cjs` asserts that by value.

   A MISSING RUNNER IS A FAILURE, NEVER A SILENT PASS. Every failure path
   here THROWS with a named reason. Nothing in this file returns a null
   session, degrades to a no-op, or reports success on an absent browser.

   FLAGS ARE DELIBERATELY MINIMAL (threat T-26.91-05).
   `--allow-file-access-from-files`, `--disable-web-security` and
   `--no-sandbox` are FORBIDDEN. `render-harness.cjs` inlines the stylesheet
   bytes and base64-inlines the font precisely so that none of them is needed.
   ========================================================================= */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* The system Chrome. `GSD_CHROME_BIN` exists so a mutation run can point the
   driver at a path that does not exist and observe the NON-ZERO exit (M6). An
   override can only ever make this driver fail louder — it cannot make a red
   gate green — so it is not a way around any assertion. */
const CHROME_BIN = process.env.GSD_CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Deadlines are pinned by value. A hung browser must fail on a stated budget,
   never hang the sweep. `timeout(1)` does not exist on macOS, so the budget
   lives here rather than around the process. */
const PORT_FILE_DEADLINE_MS = 20000;
const TARGET_DEADLINE_MS = 20000;
const SOCKET_DEADLINE_MS = 20000;
const EVAL_DEADLINE_MS = 20000;
const EXIT_DEADLINE_MS = 5000;
const POLL_MS = 20;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* ---------------------------------------------------------------------------
   launch({ url, chromeBin })

   Resolves a session, or THROWS. It never resolves to null and never resolves
   on a browser it could not reach.

   DEVIATION FROM THE PLAN'S LETTER, RECORDED HERE BECAUSE IT IS LOAD-BEARING.
   The plan said to obtain a page target with `GET /json/new?about:blank`.
   Chrome has rejected the GET verb on /json/new since M111 ("Using unsafe HTTP
   verb GET to invoke /json/new. This action supports only PUT verb."), and
   choosing between GET and PUT would pin this driver to a Chrome version
   range. Instead the harness URL is passed ON THE COMMAND LINE, so the page
   target already exists, and it is discovered with `GET /json/list` — a verb
   Chrome has never restricted. One browser per measured page also gives the
   concurrency property for free: two runs cannot share a profile or a port.
   --------------------------------------------------------------------------- */
async function launch(opts) {
  opts = opts || {};
  const bin = opts.chromeBin || CHROME_BIN;

  if (!fs.existsSync(bin)) {
    throw new Error(
      'cdp.launch: the Chrome binary does not exist at "' + bin + '". ' +
      'A live gate whose runner is unavailable FAILS — it does not stop ' +
      'checking. Install Google Chrome at that path, or set GSD_CHROME_BIN.');
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-2691-'));
  const session = {
    child: null,
    userDataDir: userDataDir,
    ws: null,
    port: null,
    nextId: 1,
    pending: new Map(),
    chromeBin: bin,
    exited: false
  };

  try {
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--user-data-dir=' + userDataDir
    ];
    if (opts.url) args.push(opts.url);

    const child = spawn(bin, args, { stdio: 'ignore' });
    session.child = child;
    child.on('exit', function () { session.exited = true; });
    child.on('error', function () { session.exited = true; });

    /* 1. the endpoint comes from THIS run's own profile dir, never from a
          fixed port. Two concurrent runs cannot collide. */
    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    const portDeadline = Date.now() + PORT_FILE_DEADLINE_MS;
    let port = null;
    while (Date.now() < portDeadline) {
      if (fs.existsSync(portFile)) {
        let raw = '';
        try { raw = fs.readFileSync(portFile, 'utf8'); } catch (e) { raw = ''; }
        const lines = raw.split('\n');
        if (lines.length >= 2 && lines[0].trim()) {
          const parsed = parseInt(lines[0].trim(), 10);
          if (Number.isFinite(parsed) && parsed > 0) { port = parsed; break; }
        }
      }
      if (session.exited) {
        throw new Error(
          'cdp.launch: Chrome ("' + bin + '") exited before it wrote ' +
          'DevToolsActivePort in its profile dir.');
      }
      await sleep(POLL_MS);
    }
    if (port === null) {
      throw new Error(
        'cdp.launch: Chrome ("' + bin + '") did not write DevToolsActivePort ' +
        'within ' + PORT_FILE_DEADLINE_MS + 'ms.');
    }
    session.port = port;

    /* 2. the page target. */
    const targetDeadline = Date.now() + TARGET_DEADLINE_MS;
    let wsUrl = null;
    while (Date.now() < targetDeadline) {
      let list = null;
      try {
        const res = await fetch('http://127.0.0.1:' + port + '/json/list');
        list = await res.json();
      } catch (e) { list = null; }
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          if (list[i] && list[i].type === 'page' && list[i].webSocketDebuggerUrl) {
            wsUrl = list[i].webSocketDebuggerUrl;
            break;
          }
        }
      }
      if (wsUrl) break;
      await sleep(POLL_MS);
    }
    if (!wsUrl) {
      throw new Error(
        'cdp.launch: no CDP page target appeared on 127.0.0.1:' + port +
        ' within ' + TARGET_DEADLINE_MS + 'ms.');
    }

    /* 3. the socket. */
    const ws = new WebSocket(wsUrl);
    session.ws = ws;
    await new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        reject(new Error('cdp.launch: the CDP websocket did not open within ' +
          SOCKET_DEADLINE_MS + 'ms (' + wsUrl + ').'));
      }, SOCKET_DEADLINE_MS);
      ws.addEventListener('open', function () {
        clearTimeout(timer); resolve();
      }, { once: true });
      ws.addEventListener('error', function () {
        clearTimeout(timer);
        reject(new Error('cdp.launch: the CDP websocket errored (' + wsUrl + ').'));
      }, { once: true });
    });

    ws.addEventListener('message', function (ev) {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || typeof msg.id !== 'number') return;
      const settle = session.pending.get(msg.id);
      if (!settle) return;
      session.pending.delete(msg.id);
      settle(msg);
    });

    return session;
  } catch (err) {
    /* a failed launch still reaps its child and its temp profile — the
       artifact assertion must hold on the failure path too (T-26.91-01). */
    await close(session);
    throw err;
  }
}

/* ---------------------------------------------------------------------------
   send(session, method, params)

   THE ONE PLACE A CDP MESSAGE IS WRITTEN TO THE SOCKET. Added by 26.91-23,
   which needs `Input.dispatchMouseEvent` — a TRUSTED press. A press synthesised
   with `dispatchEvent` from inside `Runtime.evaluate` runs NO DEFAULT ACTION,
   and the defect that plan measures IS a default action. So `evaluate` alone
   is structurally blind to it and a second transport was required.

   `evaluate` is re-expressed in terms of this function rather than keeping its
   own copy of the correlate-and-settle plumbing. Two spellings of one
   transport is the drift this phase keeps finding, and a driver is the worst
   place to have it: the two would agree the day they were written and diverge
   the first time either was touched.

   A PROTOCOL ERROR IS A REJECTION, never a value.
   --------------------------------------------------------------------------- */
function send(session, method, params) {
  return new Promise(function (resolve, reject) {
    if (!session || !session.ws) {
      reject(new Error('cdp.send: no open CDP session (' + method + ').'));
      return;
    }
    const id = session.nextId++;
    const timer = setTimeout(function () {
      session.pending.delete(id);
      reject(new Error('cdp.send: no reply to ' + method + ' id=' + id +
        ' within ' + EVAL_DEADLINE_MS + 'ms.'));
    }, EVAL_DEADLINE_MS);

    session.pending.set(id, function (msg) {
      clearTimeout(timer);
      if (msg.error) {
        reject(new Error('cdp.send: protocol error on ' + method + ': ' +
          JSON.stringify(msg.error)));
        return;
      }
      resolve(msg.result || {});
    });

    session.ws.send(JSON.stringify({
      id: id, method: method, params: params || {}
    }));
  });
}

/* ---------------------------------------------------------------------------
   evaluate(session, expression)

   Runtime.evaluate, correlated by id. A PAGE-SIDE EXCEPTION IS A REJECTION,
   never a value: a swallowed exception would let this gate report success on
   a page that never rendered (threat T-26.91-04).
   --------------------------------------------------------------------------- */
function evaluate(session, expression) {
  return send(session, 'Runtime.evaluate', {
    expression: expression,
    returnByValue: true,
    awaitPromise: true
  }).then(function (result) {
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      const text = (d.exception &&
          (d.exception.description || d.exception.value)) ||
        d.text || 'unknown page-side exception';
      throw new Error('cdp.evaluate: page-side exception: ' + text);
    }
    return result.result ? result.result.value : undefined;
  });
}

/* ---------------------------------------------------------------------------
   close(session)

   Closes the socket, kills the child, AWAITS its exit, and removes the temp
   profile dir. Callers wrap their run in try/finally so a thrown assertion
   still reaps (threats T-26.91-01, T-26.91-03). Safe to call twice and safe
   to call on a half-built session.
   --------------------------------------------------------------------------- */
async function close(session) {
  if (!session) return;

  try { if (session.ws) session.ws.close(); } catch (e) { /* already gone */ }
  session.ws = null;

  const child = session.child;
  if (child && child.exitCode === null && child.signalCode === null) {
    await new Promise(function (resolve) {
      const timer = setTimeout(resolve, EXIT_DEADLINE_MS);
      child.once('exit', function () { clearTimeout(timer); resolve(); });
      try { child.kill(); } catch (e) { clearTimeout(timer); resolve(); }
    });
  }
  session.child = null;

  if (session.userDataDir) {
    try {
      fs.rmSync(session.userDataDir, { recursive: true, force: true });
    } catch (e) { /* best effort; the assertion below is what judges it */ }
    session.userDataDir = null;
  }
}

module.exports = { launch: launch, evaluate: evaluate, send: send,
  close: close, CHROME_BIN: CHROME_BIN };
