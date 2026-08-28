'use strict';
/* =========================================================================
   26.91-23 — THE WHOLE SHIPPED APP, ON A PORT, OVER A LIBRARY THAT IS NOT HERS.

   WHY THIS FILE EXISTS. `render-harness.cjs` builds a STATIC page: the shipped
   stylesheet inlined around a fragment of markup. That is exactly right for
   measuring geometry and computed style, and it is structurally unable to
   answer the question 26.91-23 asks — because that question is about what
   `app.js`'s own event handlers do to FOCUS when a real browser dispatches a
   real press. There is no app.js on the static harness at all.

   So this harness boots the REAL `index.html` + `app.js` against the REAL
   `server.py`, and the gate drives it with TRUSTED `Input.dispatchMouseEvent`
   presses. A press synthesised with `dispatchEvent` runs NO DEFAULT ACTION,
   and the defect this gate exists to hold IS a default action — so a synthetic
   press could not have seen it, and neither could a fake DOM, which has no
   focus model at all.

   ⚠ IT NEVER TOUCHES THE OWNER'S LIBRARY, AND IT CANNOT BE POINTED AT IT.
   The library it serves is BUILT FROM NOTHING in a fresh `os.tmpdir()` dir on
   every run: three synthetic text items and a three-entry blessings ledger,
   written through `study_lib`'s OWN store writers so the schema is the app's
   rather than a hand-typed copy. `create_server(root, 0)` is called DIRECTLY
   with that root, so `library.local.json` — which is where the real library
   root lives — is never read. Placing a text record writes `decorations.json`,
   and it writes it INSIDE the temp dir, which is removed on both the pass and
   the fail path.

   ⭐⭐ 26.96-35 — AND IT NOW SERVES A SYNTHETIC **VAULT** AS WELL, FOR THE SAME
   REASON AND UNDER THE SAME RULE. Until this change nothing here ever stamped
   `meta.vault_root`, so `adapters/obsidian_vault._vault_root` had no vault to
   read and `/api/adapter/vault-folder-paths` answered **400** under this
   harness. ⛔ THAT WAS NOT A COSMETIC GAP: the private-folder picker's whole
   offered list comes off that route, so every real-Chrome geometry figure ever
   taken of that picker measured its two prose lines and an EMPTY box — and one
   of those figures (−29 px of headroom) was put to the owner and she ruled on
   it. An instrument that cannot reach the state it claims to measure is this
   project's named defect class; this is that defect, in the instrument itself.

   ⛔ THE VAULT IS A **SIBLING** OF THE LIBRARY ROOT, NEVER A CHILD, and that is
   a requirement rather than a tidiness preference: `study_lib.validate_source_
   path` refuses a source folder that IS the library or lives INSIDE it, and the
   route runs that validator before it lists anything. A vault built under the
   library would make the route answer 400 with the moved-vault message, which
   reads exactly like the bug this change exists to end.

   ⛔ IT IS BUILT FROM NOTHING TOO, in the same fresh temp tree, and it goes with
   the library on BOTH the pass and the fail path — asserted gone rather than
   assumed gone. ⛔ Nothing here reads, resolves or names the owner's own vault.

   ⛔⛔ AND IT IS ASKED FOR — `start({ vault: true })` — RATHER THAN BEING THE
   DEFAULT. That is not timidity, and it was not the first design: stamping it
   by default was built, driven, and turned `tests/test_roster_sentence_reaches_
   her.cjs` RED, in a clean clone at the same head, with nothing else changed.
   ⛔ THE RED WAS CORRECT AND THE ROOM WAS NOT WRONG. That suite's F-2 arm pins
   the add path to one of TWO sentences, and its own comment says why it can:
   *"meta.vault_root is stamped only by a whole-vault import"*. Give the room a
   vault and it can finally tell whether anything ever came from the folder just
   typed — so it says a THIRD shipped sentence, `ROSTER_ADD_NAME_UNKNOWN`, which
   the owner ruled and which is true of that state. ⛔ Widening another plan's
   gate to accept a third sentence so that THIS change could go green would be
   re-baselining a red on somebody else's instrument. The fixture asks instead.

   ⚠ THE HAZARD OF AN OPT-IN, NAMED RATHER THAN LEFT FOR THE NEXT PERSON: a
   caller who forgets the flag gets the OLD state back — the route 400s, the
   picker's box renders empty, and a geometry figure taken over it looks exactly
   like a real one. That is this plan's whole defect. ⛔ SO THE GUARD LIVES
   WHERE THE MEASURING HAPPENS: `folders` is exported as 0 when no vault was
   asked for, and `tests/test_roster_short_viewport.cjs` asserts the rendered
   row count EQUALS it before any pixel figure is believed. A forgotten flag
   goes red on that control; it does not pass quietly.

   PORT 0 IS DELIBERATE. The kernel picks it and the child prints it back, so
   two concurrent runs cannot collide and no port is pinned in a file.

   A MISSING RUNNER IS A FAILURE, NEVER A SILENT PASS. Every failure path here
   THROWS with a named reason. Nothing returns a null server or degrades to a
   no-op — a live gate that quietly stops checking is this project's named
   defect class, and this file is one of the instruments built to catch it.
   ========================================================================= */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/* Pinned by value, like every other budget in this tree. `timeout(1)` does not
   exist on macOS, so the deadline lives here rather than around the process. */
const BOOT_DEADLINE_MS = 25000;
const EXIT_DEADLINE_MS = 5000;
const POLL_MS = 25;

/* The fixture, pinned BY VALUE so a silently shortened library is a failure
   rather than a shorter pass. Three pages on one day: enough for a spread with
   a decoratable page, which is the only thing the gate needs. */
const FIXTURE_ITEMS = 3;

/* ⛔ THE OFFERED-FOLDER FIXTURE, PINNED BY VALUE exactly as `FIXTURE_ITEMS` is,
   so a silently shortened vault is a FAILURE rather than a shorter pass. The
   bootstrap holds the folder list and refuses to run if its own length does not
   equal this number, and the drive in `26.96-35-PLAN.md` asserts the ROUTE'S
   answer length equals it too — three places, one value, no drift.

   ⚠ WHY FIFTEEN, AND WHY NESTED. The picker's box carries
   `max-height:8rem;overflow-y:auto` — 128 px — and the whole geometric question
   is what happens when a real list opens INSIDE that cap. At the picker's own
   14 px rows a list has to be well past six rows before the cap does anything
   at all, so a three- or four-row fixture would measure a box that never
   reached its own limit and would report a number that means nothing.
   ⛔ NESTED ON PURPOSE, to depth 3: her D-A ruling is EVERY folder at ANY
   depth, and a FLAT fixture makes the depth property pass either way — the
   trap `tests/test_folder_enumeration.py`'s own header already records. */
const FIXTURE_FOLDERS = 15;

/* The bootstrap runs in the child so the fixture is written by `study_lib`'s
   own writers. A hand-typed items.json would be this harness agreeing with
   itself about a schema — the same failure as a source grep, one layer down. */
const BOOTSTRAP = [
  'import sys, os, json, hashlib',
  'sys.path.insert(0, sys.argv[1])',
  'import study_lib, server',
  'root = sys.argv[2]',
  'n = int(sys.argv[3])',
  'vault = sys.argv[4]',
  'want_folders = int(sys.argv[5])',
  'os.makedirs(os.path.join(root, "items"), exist_ok=True)',
  'st = study_lib.new_store(root)',
  '# ---- the synthetic vault (26.96-35), only when it was ASKED FOR ----',
  '# An empty vault argument is the shipped-until-26.96-35 state, kept byte',
  '# for byte so every consumer that did not ask for a vault is unmoved.',
  'if vault:',
  '    # Nested to depth 3, each folder carrying a real importable note, so the',
  '    # SHIPPED walker really reaches every one of them. The enumeration answers',
  '    # the PARENTS of the files the walker found plus every ancestor of those',
  '    # parents, so a folder with no note anywhere beneath it would simply not',
  '    # appear -- which is why every entry below gets its own note.',
  '    FOLDERS = [',
  '        ("Clippings",), ("Clippings", "journal"),',
  '        ("Clippings", "journal", "chatgpt"), ("Clippings", "recipes"),',
  '        ("Journal",), ("Journal", "2024"), ("Journal", "2025"),',
  '        ("Notes",), ("Notes", "ideas"), ("Notes", "ideas", "drafts"),',
  '        ("Projects",), ("Projects", "room"),',
  '        ("Reading",), ("Reading", "books"), ("Reading", "papers")]',
  '    # A SHORTENED VAULT IS A FAILURE, NEVER A SHORTER PASS.',
  '    if len(FOLDERS) != want_folders:',
  '        raise SystemExit(',
  '            "bootstrap: the synthetic vault holds %d folders, not the %d "',
  '            "pinned as FIXTURE_FOLDERS in app-server.cjs" % (',
  '                len(FOLDERS), want_folders))',
  '    for parts in FOLDERS:',
  '        d = os.path.join(vault, *parts)',
  '        os.makedirs(d, exist_ok=True)',
  '        open(os.path.join(d, "note.md"), "wb").write(',
  '            b"a note the picker can offer\\n")',
  '    # hidden, and therefore PRUNED by the shipped walker -- never offered. It is',
  '    # here so the fixture exercises the pruning rather than merely avoiding it.',
  '    os.makedirs(os.path.join(vault, ".obsidian"), exist_ok=True)',
  '    open(os.path.join(vault, ".obsidian", "workspace.md"), "wb").write(',
  '        b"not user content\\n")',
  '    # Stamped through study_lib\'s OWN store writer below, like everything else',
  '    # in this bootstrap. A hand-typed items.json would be the harness agreeing',
  '    # with itself about a schema.',
  '    st.setdefault("meta", {})["vault_root"] = vault',
  'base = 1784000000000',
  'ids = []',
  'for i in range(n):',
  '    body = ("a page for the gate, number %d\\n" % i).encode()',
  '    h = hashlib.sha256(body).hexdigest()',
  '    iid = h[:16]',
  '    ids.append(iid)',
  '    open(os.path.join(root, "items", iid + ".md"), "wb").write(body)',
  '    st["items"][iid] = {',
  '        "id": iid, "content_hash": h, "source": "folder-drop",',
  '        "origin_path": os.path.join(root, "src", "page%d.md" % i),',
  '        "library_path": "items/%s.md" % iid, "type": "text",',
  '        "title": "gate page %d" % i,',
  '        "created_ms": base, "saved_ms": base, "imported_ms": base,',
  '        "last_opened_ms": None, "state": "blessed",',
  '        "resting_until_ms": None, "tags": [], "trigger": False,',
  '        "history": [], "year": 2026, "folder": "fixture",',
  '        "comments": []}',
  'study_lib.save_store(root, st)',
  'study_lib.save_blessings(root, [',
  '    {"item_id": iid, "ms": base + k * 1000, "why": "a gate page",',
  '     "author": "user"} for k, iid in enumerate(ids)])',
  'httpd = server.create_server(root, 0)',
  'print("GATE_PORT=%d" % httpd.server_address[1], flush=True)',
  'httpd.serve_forever()'
].join('\n');

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* ---------------------------------------------------------------------------
   start()

   Resolves { url, port, root, stop }, or THROWS. It never resolves on a server
   it could not reach and never resolves to null.
   --------------------------------------------------------------------------- */
async function start(options) {
  /* ⛔ FAIL CLOSED: anything that is not an explicit request for a vault gets
     the shipped-until-26.96-35 state, byte for byte. See the header for why
     the default is OFF and where the guard against forgetting the flag lives. */
  const wantVault = !!(options && options.vault === true);
  const python = process.env.GSD_PYTHON_BIN || 'python3';
  const indexHtml = path.join(REPO_ROOT, 'index.html');
  const serverPy = path.join(REPO_ROOT, 'server.py');
  if (!fs.existsSync(indexHtml) || !fs.existsSync(serverPy)) {
    throw new Error('app-server.start: the shipped app is not where this ' +
      'harness expects it (' + indexHtml + ' / ' + serverPy + '). A live ' +
      'gate whose subject is missing FAILS — it does not stop checking.');
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-2691-lib-'));
  /* ⛔ A SIBLING OF THE LIBRARY ROOT, NOT A CHILD — see the header. Both paths
     are DERIVED from `os.tmpdir()` (law D-19: a repair told not to write her
     folder names obeyed to the letter and wrote her home directory instead):
     the library on the `mkdtempSync` above, the vault on the one just below.

     ⛔ 26.96-42 — WHAT ACTUALLY CHECKS THAT, SEARCHED FOR RATHER THAN CREDITED.
     Until this change this comment claimed *the gate for that is a grep run
     OUTSIDE this file, deliberately*. ⛔ THERE WAS NO SUCH GATE. Every file
     under `tests/` and `tools/` was searched before this clause was rewritten:
     nothing reads this file as text, nothing greps it for its own temp-dir
     calls, and every one of the five suites that names it either `require`s
     the module or mentions it in prose. ⛔ A gate credited in a comment is not
     a gate — this project's own house rule, and this comment was breaking it.

     WHAT IS TRUE INSTEAD, and each of these was run, not read:
       · `tests/test_consent_card_reaches_her.cjs` asserts at RUNTIME that
         `app.root` resolves under `os.tmpdir()`, and records a violation if
         it does not;
       · `tests/test_roster_short_viewport.cjs` asserts the same for
         `app.root` AND — added by 26.96-42 — for `app.vault`, and STOPS the
         run rather than measuring a path anywhere else.
     ⛔ Nothing beyond those two suites is claimed. The other three consumers
     of this harness assert NEITHER handle, and one of them prints a note
     SAYING the library was under the system temp dir without checking it.
     ⛔ THAT REACH IS OPEN AND FILED, not quietly accepted:
     `.planning/todos/pending/2026-08-22-app-server-vault-containment-reach.md`
     records what is guarded, what is not, and the two shapes a fix could take
     — and chooses neither, because moving the guard in here would change what
     this file's own header says about where its guard lives.

     ⚠ THE LESSON THAT PRODUCED THE FALSE CREDIT IS KEPT, because it is the
     useful half: the first draft of this comment quoted the search pattern
     itself and became the file's only match — a count in a comment is not a
     gate, and a comment that falsifies its own claim is worse than none. */
  const vault = wantVault
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-2696-vault-'))
    : null;
  const state = { child: null, exited: false, stderr: '', stopped: false };

  const child = spawn(python,
    ['-c', BOOTSTRAP, REPO_ROOT, root, String(FIXTURE_ITEMS),
      vault || '', String(wantVault ? FIXTURE_FOLDERS : 0)],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  state.child = child;
  child.on('exit', function () { state.exited = true; });
  child.on('error', function () { state.exited = true; });

  let out = '';
  child.stdout.on('data', function (b) { out += String(b); });
  child.stderr.on('data', function (b) { state.stderr += String(b); });

  async function stop() {
    if (state.stopped) { return; }
    state.stopped = true;
    try { if (state.child) { state.child.kill('SIGKILL'); } } catch (e) { /* gone */ }
    const deadline = Date.now() + EXIT_DEADLINE_MS;
    while (!state.exited && Date.now() < deadline) { await sleep(POLL_MS); }
    /* the fixture library — decorations.json included — goes with it, and so
       does the synthetic vault beside it. */
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* gone */ }
    if (vault) {
      try { fs.rmSync(vault, { recursive: true, force: true }); } catch (e) { /* gone */ }
    }
    /* ⛔ ASSERTED GONE, NOT ASSUMED GONE. A leaked fixture tree is a leaked
       fixture tree on both the pass and the fail path, and a teardown that
       quietly stopped removing anything is exactly the silent no-op this
       file's own header refuses. */
    if (fs.existsSync(root) || (vault && fs.existsSync(vault))) {
      throw new Error('app-server.stop: the fixture tree survived teardown ' +
        '(library present: ' + fs.existsSync(root) + ', vault present: ' +
        (vault ? fs.existsSync(vault) : 'no vault was asked for') +
        '). Nothing here may leave a directory behind.');
    }
  }

  try {
    const deadline = Date.now() + BOOT_DEADLINE_MS;
    let port = null;
    while (Date.now() < deadline) {
      const m = out.match(/GATE_PORT=(\d+)/);
      if (m) { port = parseInt(m[1], 10); break; }
      if (state.exited) {
        throw new Error('app-server.start: the server child exited before it ' +
          'reported a port. stderr:\n' + state.stderr);
      }
      await sleep(POLL_MS);
    }
    if (port === null) {
      throw new Error('app-server.start: no GATE_PORT within ' +
        BOOT_DEADLINE_MS + 'ms. stderr:\n' + state.stderr);
    }

    /* the port is open when the SHIPPED page answers on it, which is a fact
       read off the server rather than a sleep. */
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
      throw new Error('app-server.start: nothing served ' + url + ' within ' +
        BOOT_DEADLINE_MS + 'ms. stderr:\n' + state.stderr);
    }

    /* ⛔ A MISSING FIXTURE IS A FAILURE, NEVER A SILENT PASS. If the bootstrap
       did not build the vault, the enumeration route would answer 400 and the
       picker would render an empty box — which is precisely the state that got
       measured and put to the owner. It fails loudly here instead. */
    if (wantVault &&
        (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory())) {
      throw new Error('app-server.start: a vault was asked for and the ' +
        'bootstrap did not build one. The enumeration route would answer 400 ' +
        'and every picker geometry figure taken against this harness would ' +
        'be a reading of an EMPTY box. stderr:\n' + state.stderr);
    }

    /* ⛔ `folders` IS 0 WHEN NO VAULT WAS ASKED FOR, and that is the guard, not
       a convenience: a measuring suite compares the rendered row count against
       this number, so a caller who forgot the flag goes RED on its own control
       instead of quietly measuring an empty box. */
    return { url: url, port: port, root: root, vault: vault,
      folders: wantVault ? FIXTURE_FOLDERS : 0, stop: stop };
  } catch (err) {
    /* ⛔ THE TEARDOWN MAY NOT REPLACE THE VERDICT. `stop()` THROWS when the
       fixture tree survives, and until 26.96-42 that throw came straight out
       of this handler in place of `err` — so a bootstrap crash whose message
       carries `state.stderr`, the only account of WHY the server died, was
       silently swapped for a housekeeping complaint. The bootstrap error is
       what the caller came for; it is re-thrown, and the teardown failure is
       ATTACHED to it rather than allowed to displace it.

       ⛔ IT IS NOT SWALLOWED, and that is the whole point: a leaked fixture
       tree is still reported, loudly, in the same message and on
       `err.teardownError`. What was removed is its power to erase the other
       finding — nothing else. A bare swallow would trade one silent failure
       for another, which is the defect class this file's own header refuses.

       ⚠ WHY THIS DIVERGES FROM THE SHIPPED ANALOG. `tests/test_consent_card_
       reaches_her.cjs` wraps its own `await app.stop()` in a try/catch with an
       EMPTY catch body — that protects its verdict, but it also throws the leak
       report away, so a tree that survived teardown there is never mentioned by
       anyone. Here the verdict is protected AND the leak is still reported. */
    try {
      await stop();
    } catch (stopErr) {
      const stopMsg = (stopErr && stopErr.message) ? stopErr.message :
        String(stopErr);
      if (err && typeof err.message === 'string') {
        err.teardownError = stopErr;
        err.message += '\n\n⛔ AND THE TEARDOWN ALSO FAILED (reported, not ' +
          'swallowed — it does not replace the error above): ' + stopMsg;
      } else {
        /* a non-Error was thrown, so there is no message to append to. Neither
           finding may be lost, so BOTH are carried on one new Error rather than
           one of them being chosen over the other. */
        const both = new Error(String(err) + '\n\n⛔ AND THE TEARDOWN ALSO ' +
          'FAILED (reported, not swallowed): ' + stopMsg);
        both.originalError = err;
        both.teardownError = stopErr;
        throw both;
      }
    }
    throw err;
  }
}

module.exports = { start: start, FIXTURE_ITEMS: FIXTURE_ITEMS,
  FIXTURE_FOLDERS: FIXTURE_FOLDERS };
