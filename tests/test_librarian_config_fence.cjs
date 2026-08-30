/*
 * tests/test_librarian_config_fence.cjs — the BIDIRECTIONAL config-ask fence
 * (Phase 26.87, plan 26.87-02, Wave 0).
 *
 * RED-FIRST. These pins fail today because the config-ask channel does not
 * exist yet: there is no CONFIG_SCHEMA_JSON, no CONFIG_PROMPT, no
 * MODEL_PROPOSABLE_KEYS, no validate_config_proposal, no _config_disposition,
 * no POST /api/librarian/ask and no client card. That failure IS the
 * deliverable. Do NOT weaken a pin to go green — fix the source. 26.87-04
 * turns the consent / inbound / outbound / structural blocks green, 26.87-05
 * turns the D-21 override sub-block green, and 26.87-07 Task 2 closes the
 * ROUTING sub-block. Until then a non-zero exit is the expected state: this
 * file is ONE bare-node script accumulating ONE violations[] array with no
 * per-block scoping, so read the printed list, never the exit code alone.
 *
 * Zero dependencies. Exactly three stdlib modules and no more: fs and path
 * for the four static blocks, plus child_process for block (2)'s python
 * driver — because the INBOUND half cannot be proven by reading source text,
 * only by reading what actually crossed the ONE call seam.
 *
 * ⚠ 26.93-06/07 MOVED THAT SEAM, and this file followed it in 26.93-08. The
 * seam was a `claude` program on PATH; it is `librarian_call._transport` now.
 * So the driver installs no fake program: it IMPORTS the one money guard —
 * tests/test_server_smoke.py's `fake_claude_env`, which swaps HOME, pops both
 * key names and all three fill names, installs the RECORDING transport, and
 * runs `assert_under_temp_root` before a byte is written. The shipped
 * precedent for a .cjs fence test driving it that way is
 * tests/test_reflection_verbatim.cjs:389-665.
 *
 * Five blocks (numbering is load-bearing — 26.87-05 and 26.87-07 cite these
 * numbers, and both cite "the ROUTING block" as the one that stays red on
 * purpose until 26.87-07 Task 2):
 *
 *   (1) CONSENT INTEGRITY (criterion 1, T-27-16 / T-27-17, law 7) —
 *       structured {key, from, to} -> a human diff -> NOTHING changes without
 *       an explicit tap; the write lands through the EXISTING /api/meta (and
 *       the shipped roster route); no parallel config route exists anywhere
 *       in the tree; no auto-apply on session close. The "no book without an
 *       Allow" grammar of tests/test_insight_consent.cjs, reused as "no
 *       config write without a tap".
 *
 *   (2) THE INBOUND HALF (criterion 5, SE-1, T-26.87-01) — the one block
 *       that spawns. 27-06's fence only constrained what the model EMITS;
 *       the ask channel also leaks INBOUND, because fenced_roster's own value
 *       IS her declared-sensitive folder list (study_lib.py:125-126) and
 *       filters values are item-derived folder/tag strings. Handing the model
 *       the CURRENT VALUE of either breaks the sentence LIBRARIAN.md:78-84
 *       promises and test_disclosure_truth.cjs guards. So this block asserts
 *       on the RECORDED STDIN, by code, against FOUR sentinel classes — and
 *       states positively what the document IS.
 *
 *   (3) THE OUTBOUND HALF (T-27-18) — a rogue proposal naming an item title,
 *       a body substring, or an off-list key is refused or dropped, with
 *       store meta byte-unchanged; the sentinel scan covers EVERY emitted
 *       field, not just the change list.
 *
 *   (4) STRUCTURAL SCHEMA PINS (D-31.2, D-31.4) — CONFIG_SCHEMA_JSON's `key`
 *       enum is BUILT FROM MODEL_PROPOSABLE_KEYS by expression, never a
 *       second hand-typed copy, so the schema and the allow-list can never
 *       disagree; no minItems, no $schema declaration; the empty-change
 *       refusal is a legal output.
 *
 *   (5) ROUTING (SE-9, T-26.87-02) + the D-21 OVERRIDE. Two labelled
 *       sub-blocks, prefixed [routing] and [d21-override]. The override
 *       sub-block went green at 26.87-05. The routing sub-block was written
 *       COARSELY at 26.87-02 (a `fenced_roster` token co-occurring with a
 *       /refus|mixed/ word) because no plan had yet fixed the shape of the
 *       routing rule; 26.87-07 Task 2 REPLACED those two placeholders with
 *       the real assertions below and the block is now GREEN. It pins: the
 *       one client-side name for the roster key, a PURE router that decides
 *       the route with no network call of its own, the branch ORDER in the
 *       confirm handler (route decided and a mixed list refused BEFORE the
 *       first read or write), the roster route's own operation-and-folder
 *       shape, the always-Form-A roster card, and the byte-twin confirm
 *       labels reused from their shipped Manage buttons.
 *
 *   (6) D-04 — THE ONE UNASKED PROPOSAL (26.87-07 Task 3, T-27-18). The
 *       deterministic filter-undo card: zero model calls, the SHIPPED
 *       predicate on both sides of the comparison, one card maximum, the
 *       card ABOVE the invitation with the invitation still beneath it, no
 *       count and no digit in the copy, no vermillion, and — the pin that
 *       protects plan 04's contract — the librarian-off idle branch never
 *       reaches it at all.
 *
 *   (7) 26.91 D-07 / D-08 — LAW 1 AND LAW 7, DRIVEN. 26.91-04 retired the
 *       reading book, the last surface rendering the librarian's proposal
 *       cohort; D-07 routes it into the ask and D-08 makes it pull-only and
 *       only when she asks. This block PAINTS the shipped ask surface into a
 *       collecting fake scene in both directions (nothing before her
 *       sentence, rows after it), drives a row's click against a deep-copied
 *       store, and covers the six SRM-11-EXT-SUGGEST probe edges. It carries
 *       its own (a)/(b)/(c)/(d) anti-vacuity audit in a header comment.
 *
 *       IT EXECUTES, and that is a change of kind for this file. Block (7)
 *       requires the SHIPPED ../core.js and lifts three app.js painters
 *       verbatim through `new Function`. Nothing new is vendored — core.js
 *       is the subject, not a dependency — and the stdlib list is unchanged.
 *       26.9's law-5 audit is the reason: source order is not evaluation
 *       order, and a fence nested so it READ first but RAN second passed
 *       eight of nine groups with the fence wide open.
 *
 * Prints one OK line and exits 0 when every block holds; otherwise prints one
 * human sentence per violation and exits 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const violations = [];

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

const py = readSource('server.py');
const app = readSource('app.js');

// The forbidden parallel-route literal. It is named HERE, in the test, and
// nowhere in server.py, app.js, or any plan action — so a grep for it over
// the sources returns nothing and this file is its only home.
const FORBIDDEN_CONFIG_ROUTE = '/api/config';

// The ask channel's own names, all of which are absent today.
const ASK_ROUTE = '/api/librarian/ask';
const META_ROUTE = '/api/meta';
const ROSTER_ROUTE = '/api/librarian/roster';

// Anything that marks a stretch of app.js as config-ask code. A function
// carrying one of these is on the config path and inherits the consent,
// routing and law-2 rules below.
const CONFIG_MARKERS = ['ASK.', 'config-proposal', ASK_ROUTE, 'too_many'];

// ---------------------------------------------------------------------------
// slicing helpers (text analysis only — nothing here imports or executes)
// ---------------------------------------------------------------------------

// Lift a python `def name(...)` body by indentation: the def's own line plus
// every following line indented deeper than it.
function pyDef(name) {
  let start = py.indexOf('\ndef ' + name + '(');
  let indent = 0;
  if (start === -1) {
    start = py.indexOf('\n    def ' + name + '(');
    indent = 4;
  }
  if (start === -1) { return null; }
  const lines = py.slice(start + 1).split('\n');
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.trim() === '') { out.push(ln); continue; }
    const lead = ln.length - ln.replace(/^ */, '').length;
    if (lead <= indent) { break; }
    out.push(ln);
  }
  return out.join('\n');
}

// Lift a top-level python assignment (`NAME = ...`) including its
// continuation lines — the block ends at the next line that begins a new
// top-level statement, comment, or decorator.
function pyAssign(name) {
  const start = py.indexOf('\n' + name + ' = ');
  if (start === -1) { return null; }
  const lines = py.slice(start + 1).split('\n');
  const out = [lines[0]];
  for (let i = 1; i < lines.length && out.length < 600; i++) {
    if (/^[A-Za-z_#@]/.test(lines[i])) { break; }
    out.push(lines[i]);
  }
  return out.join('\n');
}

// app.js uses the flat 2-space module-function layout (the slicing
// convention tests/test_insight_consent.cjs already relies on).
function appFunctions() {
  const re = /\n {2}function ([A-Za-z0-9_$]+)\s*\(/g;
  const starts = [];
  let m;
  while ((m = re.exec(app)) !== null) {
    starts.push({ name: m[1], at: m.index });
  }
  return starts.map(function (s, i) {
    const end = i + 1 < starts.length ? starts[i + 1].at : app.length;
    return { name: s.name, body: app.slice(s.at, end) };
  });
}

const APP_FNS = appFunctions();

function appFn(name) {
  const hit = APP_FNS.find(function (f) { return f.name === name; });
  return hit ? hit.body : null;
}

// Every app.js module function that is on the config-ask path. The ASK state
// slice is matched on a word boundary so an unrelated TASK./MASK. token can
// never drag a foreign function into the config set.
const CONFIG_MARKER_RE =
  /\bASK\.|config-proposal|\/api\/librarian\/ask|too_many/;
const CONFIG_FNS = APP_FNS.filter(function (f) {
  return CONFIG_MARKER_RE.test(f.body);
});

// The six keys the model may NAME at all, read out of server.py so the
// schema pin and the inbound pin can never disagree with the source.
function modelProposableKeys() {
  const block = pyAssign('MODEL_PROPOSABLE_KEYS');
  if (!block) { return null; }
  const quoted = block.match(/"([a-z_]+)"/g) || [];
  return quoted.map(function (q) { return q.slice(1, -1); });
}

const PROPOSABLE_KEYS = modelProposableKeys();

// ---------------------------------------------------------------------------
// (1) CONSENT INTEGRITY — nothing changes without a tap (law 7, criterion 1)
// ---------------------------------------------------------------------------
//
// The shape is borrowed wholesale from tests/test_insight_consent.cjs: there,
// no proposal becomes a book without her Allow; here, no proposed diff becomes
// stored meta without her tap. The write target is the SHIPPED /api/meta (and,
// for the roster class, the shipped roster route) — a config channel that
// minted its own write route would bypass every per-key validator those two
// routes already run, which is the whole reason a parallel route is forbidden
// rather than merely discouraged.

(function () {
  // (1a) T-27-17: no parallel config write route anywhere in the tree.
  [['server.py', py], ['app.js', app]].forEach(function (pair) {
    if (pair[1].indexOf(FORBIDDEN_CONFIG_ROUTE) !== -1) {
      violations.push('[consent] ' + pair[0] + ': a parallel config write ' +
        'route appeared — the config ask must land through the shipped ' +
        'routes, which own every per-key validator; a new route would ' +
        'bypass all of them');
    }
  });

  // (1b) the two shipped write targets are still the only ones, and still
  // exist on both sides of the wire.
  if (py.indexOf('def handle_meta') === -1) {
    violations.push('[consent] server.py: handle_meta is missing — it is ' +
      'the one validated config write path the ask channel must reuse');
  }
  if (py.indexOf('def handle_librarian_roster') === -1) {
    violations.push('[consent] server.py: handle_librarian_roster is ' +
      'missing — the roster class has no other legal door');
  }
  if (app.indexOf("apiPost('" + META_ROUTE + "'") === -1) {
    violations.push('[consent] app.js: the shipped ' + META_ROUTE +
      ' write call disappeared');
  }
  if (app.indexOf("apiPost('" + ROSTER_ROUTE + "'") === -1) {
    violations.push('[consent] app.js: the shipped ' + ROSTER_ROUTE +
      ' write call disappeared');
  }

  // (1c) the ask channel is a GENERATION route, never a write route. RED
  // today: handle_librarian_ask does not exist.
  const askHandler = pyDef('handle_librarian_ask');
  if (!askHandler) {
    violations.push('[consent] server.py: handle_librarian_ask is missing — ' +
      'POST ' + ASK_ROUTE + ' does not exist yet (26.87-04 Task 1 adds it)');
  } else {
    ['save_store(', 'store["meta"].update(', "store['meta'].update("]
      .forEach(function (tok) {
        if (askHandler.indexOf(tok) !== -1) {
          violations.push('[consent] server.py: handle_librarian_ask ' +
            'contains "' + tok + '" — the ask route generates a proposal ' +
            'and must never itself write the store; her tap is the writer');
        }
      });
  }
  if (app.indexOf("'" + ASK_ROUTE + "'") === -1) {
    violations.push('[consent] app.js: nothing calls ' + ASK_ROUTE +
      ' — the client half of the ask channel does not exist yet ' +
      '(26.87-04 Task 2 adds it)');
  }

  // (1d) the confirmed diff is POSTed from an explicit tap handler ONLY, and
  // it goes to a SHIPPED route. RED today: no config-path function writes.
  const writers = CONFIG_FNS.filter(function (f) {
    return f.body.indexOf("apiPost('" + META_ROUTE + "'") !== -1 ||
      f.body.indexOf("apiPost('" + ROSTER_ROUTE + "'") !== -1;
  });
  if (!writers.length) {
    violations.push('[consent] app.js: no config-ask code path writes a ' +
      'proposed diff through the shipped routes yet — the confirm tap that ' +
      'POSTs {key, from, to} to ' + META_ROUTE + ' does not exist ' +
      '(26.87-04 Task 2 adds it)');
  }
  writers.forEach(function (f) {
    if (!/Tap$|^handle[A-Z]/.test(f.name)) {
      violations.push('[consent] app.js: "' + f.name + '" writes a config ' +
        'diff but is not an explicit tap handler (a *Tap or handle* name) ' +
        '— nothing may land without her own tap');
    }
  });

  // (1e) no painter, repaint, sync or settle path ever writes a config diff.
  // Vacuously true today and load-bearing the moment the card lands: the ask
  // spot is destroyed and rebuilt on every state change, so a write living in
  // a painter would apply itself on a repaint she never asked for.
  CONFIG_FNS.forEach(function (f) {
    if (!/Paint|Render|^render|Sync|Repaint|Settle|Refresh|Poll/.test(f.name)) {
      return;
    }
    if (f.body.indexOf("apiPost('" + META_ROUTE + "'") !== -1 ||
        f.body.indexOf("apiPost('" + ROSTER_ROUTE + "'") !== -1) {
      violations.push('[consent] app.js: "' + f.name + '" is a paint / ' +
        'repaint / sync path and it writes a config diff — a repaint is ' +
        'not a tap');
    }
  });

  // (1f) a session close applies NOTHING. The close path is the one place a
  // "helpfully save what we discussed" auto-apply would look natural, which
  // is exactly why it is pinned as an absence.
  ['sessionSaveTap', 'sessionPassTap', 'sessionSettleAway',
    'sessionCloseFailed'].forEach(function (name) {
    const body = appFn(name);
    if (!body) {
      violations.push('[consent] app.js: the session-close function "' +
        name + '" is missing — the no-auto-apply pin has nothing to hold');
      return;
    }
    CONFIG_MARKERS.concat(["apiPost('" + META_ROUTE + "'",
      "apiPost('" + ROSTER_ROUTE + "'"]).forEach(function (tok) {
      if (body.indexOf(tok) !== -1) {
        violations.push('[consent] app.js: "' + name + '" carries "' + tok +
          '" — closing a session must apply no config change whatsoever');
      }
    });
  });
})();

// ---------------------------------------------------------------------------
// (2) THE INBOUND HALF — asserted on the RECORDED STDIN, never by inspection
// ---------------------------------------------------------------------------
//
// WHY THIS HALF EXISTS AT ALL: fenced_roster's own default
// (study_lib.py:125-126, DEFAULT_FENCED_ROSTER) literally IS the list of
// folders she declared most sensitive, and meta.filters values are
// item-derived folder/tag strings. So handing the model the CURRENT VALUE of
// either is precisely the disclosure LIBRARIAN.md promises never happens. A
// fence test that only scanned what the model EMITS is the SE-1 hole and does
// not satisfy criterion 5 — the claim is BIDIRECTIONAL, so the test is too.
//
// WHY IT LIVES HERE rather than beside ReflectionEnvelopeStubTest in
// tests/test_librarian_fence.py: one threat's mitigation should be provable
// by ONE command in ONE file. Splitting the inbound half into the python
// suite and the outbound half into this one would leave no single command
// that proves the bidirectional claim.
//
// WHAT MAKES THIS BLOCK PROVABLE AT ALL, and it is not obvious. `config_ask`
// is the ONE row in librarian_call.JOBS carrying `permitted_local: False`
// (#28 section 1 — a 7B answering "off" where the schema wanted `false` turns
// something off she meant on). `fake_claude_env` swaps HOME and pops both key
// names, which resolves EVERY tier to her own machine — and on that machine
// the ask is ABSENT: `call_librarian` returns before a request is built, so
// nothing is sent, nothing is recorded, and this block would have nothing
// whatsoever to scan. The driver therefore hands the seam ONE `extra`: a
// throwaway OPENAI_API_KEY. That is the entire mechanism — `resolve_routing`'s
// stated default order (anthropic if its key is present, else openai, else her
// own machine) then fills cheap-cloud with the OpenAI pair, the ask is
// permitted, the request is built, and the recording transport captures it.
//
// ⚠⚠ THE PROVIDER CHOICE IS THE MONEY ARGUMENT, NOT A COIN FLIP. The owner's
// real credential is an ANTHROPIC one and it lives in her keys file rather
// than the shell, so naming OpenAI means the only credential in play anywhere
// in this run is the throwaway string this file invented. The [hermetic]
// assertions below prove that BY VALUE, from what the child resolved before it
// asked anything — never from a comment, and never from trust.
//
// ⚠ AND WHY THE ANSWER IS ALLOWED TO BE UNUSABLE. The stub answers every job
// with one Ollama-shaped envelope, which `read_openai_response` reads as
// `malformed`; the ask job therefore ends in its own quiet failure state. That
// costs this block nothing: the transport RECORDS WHAT WAS SENT before it
// answers anything, and what was sent is the whole of what this block claims.

const FENCE_BODY_SENTINEL = 'FENCE-SENTINEL-CONFIG-BODY';
const FENCE_TITLE_SENTINEL = 'FENCE-TITLE-CONFIG-ASK';
const FENCE_FILTER_SENTINEL = 'FENCE-FILTER-VALUE-CONFIG';
const FENCE_ROSTER_SENTINEL = 'FENCE-ROSTER-FOLDER-CONFIG';
const ASK_TEXT = 'stop tidying my vault';

(function () {
  // A throwaway string that is not anyone's key and never leaves this
  // process. It exists so `resolve_routing` can answer "openai" — see the
  // block comment above — and it is the ONLY credential in play in this run.
  const DUMMY_KEY = 'not-a-real-key-this-driver-invented-it';

  // The driver mirrors tests/test_reflection_verbatim.cjs:389-546: a python
  // line array, the ONE money guard entered around everything, the repo root
  // handed over in SR_REPO_ROOT, and the recorded request printed back as the
  // last stdout line.
  //
  // ⚠ IT ASSERTS ALMOST NOTHING ITSELF, ON PURPOSE. The child hard-asserts
  // exactly one thing — that the recording transport is the installed seam,
  // read BEFORE the server is built, so a run whose guard failed dies before
  // it can ask anything of anyone. Everything else is REPORTED and judged on
  // the node side, because a child that raises takes the whole record with it
  // and the suite then prints "the sentinel classes are UNPROVEN" — a true
  // sentence that names the wrong cause. That is precisely how this block
  // spent 26.93-07 red while reporting a fence problem it did not have.
  //
  // The wait is on the LOG FILE rather than on the ask's progress route,
  // deliberately: the ask parks on a polled job dict, and the seam is crossed
  // whether or not that job ends well, so this block depends on no job-shape
  // decision it does not own.
  const driver = [
    'import json, os, sys, tempfile, threading, time',
    'import http.client',
    'from pathlib import Path',
    "repo = Path(os.environ['SR_REPO_ROOT'])",
    'sys.path.insert(0, str(repo))',
    // ⚠ tests/ joins sys.path so the ONE money guard is IMPORTED rather than
    // re-spelled here. A second copy of a money guard is the drift 26.88-12
    // paid for twice with the escapers, in the worst possible place.
    "sys.path.insert(0, str(repo / 'tests'))",
    'import server, study_lib',
    'import librarian_call as L',
    'import test_server_smoke as smoke',
    'tmpdir = tempfile.TemporaryDirectory()',
    // The seam owns HOME, PATH, both key names, all three fill names, the
    // transport and the sleep for the whole of the run below, and it runs
    // `assert_under_temp_root` before anything is written — so a swap that
    // failed raises HERE rather than after the first paid request.
    'env = smoke.fake_claude_env(',
    "    Path(os.environ['SR_FAKE_LOG']),",
    "    extra={L.KEY_ENV_NAMES['openai']: os.environ['SR_DUMMY_KEY']})",
    'env.__enter__()',
    'try:',
    // 26.93-07 deleted `_reset_librarian_probe` with the probe family it
    // belonged to; `no_cached_probe` is the named no-op standing where the
    // reset stood, for the reason its own docstring gives.
    '    smoke.no_cached_probe()',
    // ---- the ONE hard assert, read before a server even exists ----------
    '    assert L._transport is smoke.stub_transport, (',
    '        "the recording transport is the installed seam")',
    // ---- what the child RESOLVED, before it asked anything ---------------
    '    routing = L.resolve_routing(L.load_settings())',
    "    ask_tier = L.JOBS['config_ask']['tier']",
    '    ask_fill = list(routing.fills[ask_tier])',
    '    home = os.path.realpath(os.environ["HOME"])',
    '    keys_under_swapped_home = os.path.realpath(',
    '        str(L.keys_path())).startswith(home + os.sep)',
    // ⚠ A BOOLEAN, NEVER A VALUE. Nothing in this driver may print, compare
    // or carry a credential — presence is the whole of what is asserted.
    '    anthropic_key_visible = bool(',
    '        (os.environ.get(L.KEY_ENV_NAMES["anthropic"]) or "").strip())',
    "    lib = Path(tmpdir.name) / 'library'",
    "    (lib / 'items').mkdir(parents=True)",
    '    store = study_lib.new_store(lib)',
    "    store['meta']['librarian_enabled'] = True",
    "    iid = 'a' * 16",
    // sentinel class 1: an item BODY (the shipped FENCE-SENTINEL class)
    "    (lib / 'items' / (iid + '.md')).write_text(",
    "        os.environ['SR_BODY_SENTINEL'], encoding='utf-8')",
    '    now_ms = int(time.time() * 1000)',
    // sentinel class 2: an item TITLE (the shipped FENCE-TITLE class)
    "    store['items'][iid] = {",
    "        'id': iid, 'content_hash': iid * 4, 'source': 'folder-drop',",
    "        'origin_path': '/src/notes/kept.md',",
    "        'library_path': 'items/' + iid + '.md', 'type': 'text',",
    "        'title': os.environ['SR_TITLE_SENTINEL'],",
    "        'created_ms': now_ms, 'saved_ms': now_ms,",
    "        'imported_ms': now_ms,",
    "        'last_opened_ms': None, 'state': 'blessed',",
    "        'resting_until_ms': None, 'tags': [], 'trigger': False,",
    "        'year': 2023, 'folder': 'notes', 'history': []}",
    // sentinel class 3: an ACTIVE meta.filters value (item-derived, SE-1)
    "    store['meta']['filters'] = [{'facet': 'folder',",
    "                                 'value':",
    "                                     os.environ['SR_FILTER_SENTINEL']}]",
    // sentinel class 4: a meta.fenced_roster ENTRY (her declared-sensitive
    // folder list — the value that must never cross the seam, SE-1)
    "    store['meta']['fenced_roster'] = [",
    "        os.environ['SR_ROSTER_SENTINEL']]",
    '    study_lib.save_store(lib, store)',
    '    with server.LIBRARIAN_LOCK:',
    "        server.LIBRARIAN_JOB.update(state='idle', total=0, done=0,",
    '                                    cost_usd=0.0, auth=None,',
    '                                    message=None,',
    '                                    unknown_id_verdicts=0,',
    '                                    started_ms=0, stage=None,',
    '                                    rejected_drafts=0,',
    '                                    rejected_why=None)',
    '    httpd = server.create_server(lib, 0)',
    '    port = httpd.server_address[1]',
    '    threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    '    def req(method, route, body=None):',
    "        conn = http.client.HTTPConnection('127.0.0.1', port,",
    '                                          timeout=30)',
    '        try:',
    '            if body is not None:',
    '                conn.request(method, route,',
    '                             json.dumps(body, ensure_ascii=False)',
    "                             .encode('utf-8'),",
    "                             {'Content-Type': 'application/json'})",
    '            else:',
    '                conn.request(method, route)',
    '            r = conn.getresponse()',
    '            return r.status, r.read().decode()',
    '        finally:',
    '            conn.close()',
    // her ask text is user-authored and therefore an already-sanctioned
    // payload class — it is asserted PRESENT below, not absent.
    "    status, reply = req('POST', os.environ['SR_ASK_ROUTE'],",
    "                        {'text': os.environ['SR_ASK_TEXT']})",
    "    log = Path(os.environ['SR_FAKE_LOG'])",
    '    deadline = time.time() + 60',
    '    while time.time() < deadline and not log.exists():',
    '        time.sleep(0.02)',
    '    rec = (json.loads(log.read_text(encoding="utf-8"))',
    '           if log.exists() else None)',
    '    httpd.shutdown()',
    '    httpd.server_close()',
    "    print(json.dumps({'status': status, 'reply': reply[:400],",
    "                      'recorded': rec is not None,",
    "                      'stdin': (rec or {}).get('stdin') or '',",
    "                      'url': (rec or {}).get('url') or '',",
    "                      'had_auth': (rec or {}).get('had_auth'),",
    "                      'lib': str(lib), 'iid': iid,",
    "                      'hermetic': {",
    "                          'transport_is_stub':",
    '                              L._transport is smoke.stub_transport,',
    "                          'ask_tier': ask_tier, 'ask_fill': ask_fill,",
    "                          'local_fill': list(L.LOCAL_FILL),",
    "                          'keys_under_swapped_home':",
    '                              keys_under_swapped_home,',
    "                          'anthropic_key_visible':",
    '                              anthropic_key_visible}},',
    '                     ensure_ascii=False))',
    'finally:',
    '    env.__exit__(None, None, None)',
    '    tmpdir.cleanup()'
  ].join('\n');

  // A temp dir under tests/ rather than the OS temp root, so the module
  // surface stays at the three stdlib modules this file is allowed.
  const tmp = fs.mkdtempSync(path.join(__dirname, '.tmp-config-fence-'));
  const logPath = path.join(tmp, 'fake.log');
  const res = spawnSync('python3', ['-c', driver], {
    encoding: 'utf8',
    timeout: 120000,
    // ⚠ THE SHELL IS PASSED THROUGH UNSCRUBBED, ON PURPOSE — the same
    // reasoning tests/test_reflection_verbatim.cjs:551-559 writes out. Popping
    // ANTHROPIC_API_KEY here as well would make the child's
    // `anthropic_key_visible: false` true whatever the seam did, and that
    // boolean is the only evidence in this file that the seam POPPED it.
    // Handing the child a dirty shell and watching it come back clean IS the
    // proof; scrubbing here would be a second guard wearing the first one's
    // evidence. Nothing is risked by it: `assert_under_temp_root` and the
    // transport install both run at `__enter__`, and the child's own
    // transport assert runs before the server is even built.
    //
    // ⚠ NO `PATH` ENTRY, AND ITS ABSENCE IS THE POINT. Prepending a fake
    // `claude` directory was the old hermetic mechanism; PATH decides nothing
    // about the librarian any more, and `fake_claude_env` owns the variable.
    // ⚠ The spawned-program site it owned it FOR — the vault tidy-up — was
    // deleted 2026-08-14 (#56); the prepend survives there as a negative
    // control. Pinning it here would fight the seam over the same variable for
    // no gain.
    env: Object.assign({}, process.env, {
      SR_FAKE_LOG: logPath,
      SR_REPO_ROOT: ROOT,
      SR_ASK_ROUTE: ASK_ROUTE,
      SR_ASK_TEXT: ASK_TEXT,
      SR_DUMMY_KEY: DUMMY_KEY,
      SR_BODY_SENTINEL: FENCE_BODY_SENTINEL,
      SR_TITLE_SENTINEL: FENCE_TITLE_SENTINEL,
      SR_FILTER_SENTINEL: FENCE_FILTER_SENTINEL,
      SR_ROSTER_SENTINEL: FENCE_ROSTER_SENTINEL
    })
  });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* */ }

  if (res.status !== 0) {
    violations.push('[inbound] the ask driver did not complete, so no ' +
      'recorded request exists to scan — stderr tail: ' +
      String(res.stderr || '').trim().slice(-600));
    violations.push('[inbound] the four sentinel classes (' +
      FENCE_BODY_SENTINEL + ', ' + FENCE_TITLE_SENTINEL + ', ' +
      FENCE_FILTER_SENTINEL + ', ' + FENCE_ROSTER_SENTINEL + ') and the ' +
      'positive shape of the ask document are therefore UNPROVEN. ⚠ THIS IS ' +
      'A BROKEN INSTRUMENT, NOT AN EXPECTED STATE: POST ' + ASK_ROUTE + ' ' +
      'has been wired since 26.87-04 and answers 200, so a driver that ' +
      'cannot run is saying nothing at all about the fence — read the stderr ' +
      'tail on the line above and fix the driver, never the fence');
    return;
  }

  let out = null;
  try {
    const lines = String(res.stdout || '').trim().split('\n');
    out = JSON.parse(lines[lines.length - 1]);
  } catch (e) {
    violations.push('[inbound] the ask driver exited clean but printed no ' +
      'parseable record of what crossed the seam');
    return;
  }

  const stdin = String(out.stdin || '');
  const url = String(out.url || '');
  const herm = out.hermetic || {};
  const askFill = (herm.ask_fill || []).join(':');
  const localFill = (herm.local_fill || []).join(':');

  // ---- [hermetic] A NEW CLAIM UNDER A NEW NAME (26.93-08) ----------------
  //
  // Nothing below this is worth anything if the recorded request was answered
  // by a real provider on the owner's real key. This group is NOT a rename of
  // anything retired: the old driver's isolation claims were about a
  // subprocess's PATH and argv, and those are gone (see the deletion note at
  // the end of this block). These are claims about ROUTING AND CUSTODY, they
  // are asserted BY VALUE from what the child resolved before it asked
  // anything, and they wear their own label so no reader can mistake one for
  // the other.
  if (herm.transport_is_stub !== true) {
    violations.push('[hermetic] the recording transport was not the installed ' +
      'seam for the whole of the run — the request this block scans may have ' +
      'been answered by a real provider, and every assertion under it is ' +
      'then evidence about a paid call rather than about the fence');
  }
  if (herm.keys_under_swapped_home !== true) {
    violations.push('[hermetic] the keys file the child could reach is NOT ' +
      "under its own temp home — the owner's real credential was in reach of " +
      'this run, which is the one thing this driver may never allow');
  }
  if (herm.anthropic_key_visible !== false) {
    violations.push('[hermetic] ANTHROPIC_API_KEY survived into the child. ' +
      'The seam is supposed to pop it, and the shell handed to the child is ' +
      'deliberately left dirty so that this boolean is evidence rather than ' +
      'a tautology — a true here means the guard did not run');
  }
  if ((herm.ask_fill || [])[0] !== 'openai') {
    violations.push("[hermetic] the ask's tier (" +
      String(herm.ask_tier) + ') resolved to ' + JSON.stringify(askFill) +
      ', not to the throwaway-keyed openai fill this driver arranged — the ' +
      'only credential that may be in play in this run is the string this ' +
      'file invented, and a different provider means a different key');
  }
  if (askFill && askFill === localFill) {
    violations.push('[hermetic] the ask resolved to her own machine (' +
      localFill + '). config_ask is the ONE `permitted_local: False` row, so ' +
      'that resolution makes the job ABSENT — no request is built, nothing ' +
      'is recorded, and the sentinel scans below would be scanning an empty ' +
      'string');
  }

  // ---- the ask ran, and it reached the recorder --------------------------
  //
  // ⚠ THIS GATE COMES BEFORE EVERY SCAN AND AFTER EVERY ROUTING CLAIM, and
  // the order is the lesson 26.93-07 taught this block: with nothing
  // recorded, the document is the empty string and EVERY ban below passes for
  // the worst possible reason. The routing claims above run first because
  // they are what DIAGNOSE a missing record; the record claims run after
  // because they have no subject without one.
  if (out.status !== 200) {
    violations.push('[inbound] POST ' + ASK_ROUTE + ' answered ' +
      String(out.status) + ' — the ask route is a generation route and ' +
      'answers 200 whether or not the librarian is available; reply: ' +
      String(out.reply || '').slice(0, 400));
  }
  if (out.recorded !== true) {
    violations.push('[inbound] the ask never reached the recording ' +
      'transport, so the four sentinel classes (' + FENCE_BODY_SENTINEL +
      ', ' + FENCE_TITLE_SENTINEL + ', ' + FENCE_FILTER_SENTINEL + ', ' +
      FENCE_ROSTER_SENTINEL + ') and the positive shape of the ask document ' +
      'are UNPROVEN. The route answered ' + String(out.status) + ' and the ' +
      "ask's tier resolved to " + JSON.stringify(askFill) + ' — an absent ' +
      'job, a refused fill or an availability gate can each land here, and ' +
      'none of them is a fence result');
    return;
  }

  // ---- [hermetic], the half that needs a record to have a subject --------
  if (/anthropic\.com/i.test(url)) {
    violations.push('[hermetic] the recorded request was addressed to ' +
      'anthropic.com — that is the company holding the one real credential ' +
      'on this machine, and no request in this run may be addressed to it');
  }
  // THE CREDENTIAL IS NOT INSIDE THE RECORD, and the positive control is what
  // makes that falsifiable: `had_auth` must be TRUE (a credential really was
  // attached to this request, so "no key in the record" is a statement about
  // where it went rather than about there having been none), while the string
  // itself appears in neither the document nor the address. That is the whole
  // reason `_send` hands the key to the transport as its own argument instead
  // of writing it into the request dict.
  if (out.had_auth !== true) {
    violations.push('[hermetic] the recorded request carried no credential ' +
      'at all (had_auth: ' + JSON.stringify(out.had_auth) + ') — then the ' +
      'ban below is vacuous, and the cloud path this block is supposed to be ' +
      'exercising was never actually a cloud path');
  }
  [[stdin, 'the ask document'], [url, 'the request address']]
    .forEach(function (pair) {
      if (pair[0].indexOf(DUMMY_KEY) !== -1) {
        violations.push('[hermetic] ' + pair[1] + ' carries the credential ' +
          'itself — a key belongs on the last hop into the socket and ' +
          'nowhere a recorder, a log line or a bug report can reach');
      }
    });

  // ---- the four sentinel classes, absent from the recorded stdin ----------
  [[FENCE_BODY_SENTINEL, 'an item BODY'],
    [FENCE_TITLE_SENTINEL, 'an item TITLE'],
    [FENCE_FILTER_SENTINEL, "an active meta.filters VALUE (item-derived)"],
    [FENCE_ROSTER_SENTINEL, 'a meta.fenced_roster ENTRY (her declared-' +
      'sensitive folder list)']].forEach(function (pair) {
    if (stdin.indexOf(pair[0]) !== -1) {
      violations.push('[inbound] the recorded stdin of the ask call carries ' +
        pair[1] + ' — "' + pair[0] + '" crossed the seam; the ask document ' +
        'may carry key names, key types and boolean values, nothing else');
    }
  });
  // the store's own path and the item id are not values either (T-26-01).
  [[String(out.lib || ''), 'the library store path'],
    [String(out.iid || ''), 'an item id']].forEach(function (pair) {
    if (pair[0] && stdin.indexOf(pair[0]) !== -1) {
      violations.push('[inbound] the recorded stdin carries ' + pair[1] +
        ' — the ask document names no item and no path');
    }
  });
  // ...AND NOT ON THE ADDRESS EITHER (26.93-08). A URL is a field the seam
  // GAINED when it stopped being a subprocess: there was no address to leak
  // into when the document rode a pipe. This is not the argv pin translated —
  // it is the SAME T-26-01 claim (no path, no item id crosses) extended to
  // the one new place a path could now ride, and test_server_smoke.py's own
  // mutation drill treats `leaked_path` on the URL as a live threat.
  [[String(out.lib || ''), 'the library store path'],
    [String(out.iid || ''), 'an item id']].forEach(function (pair) {
    if (pair[0] && url.indexOf(pair[0]) !== -1) {
      violations.push('[inbound] the recorded request URL carries ' + pair[1] +
        ' — an address is part of what crosses the seam, and it names no ' +
        'item and no path any more than the document does');
    }
  });

  // ---- and positively: what the document IS ------------------------------
  if (!PROPOSABLE_KEYS || !PROPOSABLE_KEYS.length) {
    violations.push('[inbound] MODEL_PROPOSABLE_KEYS does not exist in ' +
      'server.py, so the ask document has no defined vocabulary and the ' +
      'positive half of the inbound assertion cannot run');
  } else {
    PROPOSABLE_KEYS.forEach(function (k) {
      if (stdin.indexOf(k) === -1) {
        violations.push('[inbound] the recorded stdin omits the proposable ' +
          'key NAME "' + k + '" — names are exactly what the document is ' +
          'supposed to carry');
      }
    });
  }
  if (stdin.indexOf('boolean') === -1 && stdin.indexOf('bool') === -1) {
    violations.push('[inbound] the recorded stdin names no key TYPE — the ' +
      'document carries names AND types so the model can propose a legal ' +
      'value without ever seeing a stored one');
  }
  if (!/\b(true|false)\b/.test(stdin)) {
    violations.push('[inbound] the recorded stdin carries no boolean ' +
      'current value — booleans are the ONLY value class the document may ' +
      'carry, and it must carry them or the model cannot answer "it is ' +
      'already off"');
  }
  if (stdin.indexOf(ASK_TEXT) === -1) {
    violations.push('[inbound] the recorded stdin does not carry her own ask ' +
      'text verbatim — user-authored text is a sanctioned stdin class and ' +
      'the ask is meaningless without it');
  }
  // ---- DELETED WITH THE SUBPROCESS (26.93-08), and named here so the -----
  // ---- deletion is a decision on the record rather than a gap ------------
  //
  // TWO PINS LEFT THIS BLOCK, and neither was weakened into a live-looking
  // substitute. Both were claims about a `claude` PROCESS, and there is no
  // process:
  //
  //   * THE PATH PIN. The driver prepended tests/fixtures/fake_claude to PATH
  //     and the isolation rested on that. PATH decides nothing about the
  //     librarian now — `librarian_call` opens a socket through one module
  //     attribute — so a pin on it would assert a mechanism that no longer
  //     participates. The claim it was PROTECTING (nothing real answers this
  //     run) did not die: it is the [hermetic] group above, which asserts the
  //     installed transport, the swapped home, the popped key name and the
  //     resolved fill BY VALUE.
  //
  //   * THE ARGV / CONFIG_MODEL PIN. It read `--model <alias>` out of the
  //     recorded argv to prove the ask rode the classifier tier and not the
  //     voice model. A recorded HTTP request has no argv, and — the part that
  //     makes this a deletion rather than a port — THE ASK NO LONGER NAMES A
  //     MODEL AT ALL. `_config_ask_worker` calls
  //     `librarian_call.call_librarian("config_ask", doc, routing)`; a caller
  //     has no argument, keyword or attribute by which it can name a tier, a
  //     model, a schema or a prompt. Which model answers is decided entirely
  //     by the JOBS row's tier and the resolved routing, so "the ask must not
  //     ride the voice model" is now a property of the TABLE, not of anything
  //     this driver sends — and it is pinned where it lives, by the seam
  //     suite, not re-asserted here off a recorded field that would only look
  //     like the old one.
  //
  // ⚠ A PIN ON `rec.body.model` WAS CONSIDERED AND REJECTED. It would read as
  // the old claim wearing new clothes while proving something quite different
  // (that the request echoes the fill this very driver arranged), which is
  // exactly the translation ruling 2 forbids. The honest replacement is the
  // [hermetic] fill assertion, which says what it actually checks and carries
  // its own name.
})();

// ---------------------------------------------------------------------------
// (3) THE OUTBOUND HALF — a rogue proposal is dropped or refused, meta intact
// ---------------------------------------------------------------------------

(function () {
  const v = pyDef('validate_config_proposal');
  if (!v) {
    violations.push('[outbound] server.py: validate_config_proposal is ' +
      'missing — nothing screens what the model emits back (26.87-04 Task 1 ' +
      'adds it)');
    return;
  }

  // an off-list key is DROPPED — membership is decided against the
  // allow-list itself, never against a re-typed list.
  if (v.indexOf('MODEL_PROPOSABLE_KEYS') === -1) {
    violations.push('[outbound] validate_config_proposal never consults ' +
      'MODEL_PROPOSABLE_KEYS — a change naming an off-list key must be ' +
      'dropped, and membership must be decided against the allow-list');
  }
  // a proposal whose text names a seeded item title REFUSES WHOLE, through
  // the shipped screen rather than a second implementation of it.
  if (v.indexOf('_names_fenced_title') === -1) {
    violations.push('[outbound] validate_config_proposal never runs the ' +
      'shipped _names_fenced_title screen — a proposal whose sentence ' +
      'carries an item title must refuse the WHOLE proposal, leaving store ' +
      'meta byte-unchanged');
  }
  if (v.indexOf('_names_no_push') === -1 && v.indexOf('NO_PUSH_VOCAB') === -1) {
    violations.push('[outbound] validate_config_proposal never runs the ' +
      'no-push vocabulary screen (law 1/3 backstop) over its emitted fields');
  }
  if (v.indexOf('CLINICAL') === -1 && v.indexOf('clinical') === -1) {
    violations.push('[outbound] validate_config_proposal never runs the ' +
      'clinical-claim screen over its emitted fields');
  }
  // the scan covers EVERY emitted field, not just the change list.
  ['changes', 'says', 'disposition', 'topic'].forEach(function (field) {
    if (v.indexOf(field) === -1) {
      violations.push('[outbound] validate_config_proposal never names the ' +
        'emitted field "' + field + '" — the sentinel scan must cover every ' +
        'field the schema can produce, not just the change list');
    }
  });
  // a validator is pure: it reads nothing, writes nothing, logs nothing, and
  // never echoes rejected content (a rejected draft may quote pool text).
  // 26.93-07: the model-call token is `call_librarian(` now. The claim is
  // UNCHANGED — a validator may not reach a model — and it is the same claim
  // at the new boundary: the seam this names is the ONLY route from store
  // bytes to a model that exists any more, so naming it is naming all of them.
  ['save_store(', 'load_store(', 'call_librarian(', 'print(', 'open(']
    .forEach(function (tok) {
      if (v.indexOf(tok) !== -1) {
        violations.push('[outbound] validate_config_proposal contains "' +
          tok + '" — it must never read, write, or log; a refusal answers a ' +
          'category token, never content');
      }
    });
})();

// ---------------------------------------------------------------------------
// (4) STRUCTURAL SCHEMA PINS — the schema and the allow-list cannot disagree
// ---------------------------------------------------------------------------

(function () {
  if (py.indexOf('MODEL_PROPOSABLE_KEYS') === -1) {
    violations.push('[structural] server.py: MODEL_PROPOSABLE_KEYS is ' +
      'missing — the closed subset of keys the model may NAME at all does ' +
      'not exist yet (26.87-04 Task 1 adds it)');
  }
  if (py.indexOf('CONFIGURABLE_KEYS') === -1) {
    violations.push('[structural] server.py: CONFIGURABLE_KEYS is missing — ' +
      'the set the CHAT may reach does not exist yet');
  }
  // an allow-list must be EDITED to change: a positional slice would bind
  // membership to tuple order, so 26.87-09's voice_model insertion could
  // silently widen what the model may name without touching the defining line.
  if (/MODEL_PROPOSABLE_KEYS\s*=\s*CONFIGURABLE_KEYS\s*\[/.test(py)) {
    violations.push('[structural] server.py: MODEL_PROPOSABLE_KEYS is a ' +
      'positional slice of CONFIGURABLE_KEYS — it must be its own explicit ' +
      'tuple of string literals, so a membership change is visible in the ' +
      'diff');
  }

  const schema = pyAssign('CONFIG_SCHEMA_JSON');
  if (!schema) {
    violations.push('[structural] server.py: CONFIG_SCHEMA_JSON is missing ' +
      '— the ask has no shape contract for the CLI to validate against ' +
      '(26.87-04 Task 1 adds it)');
  } else {
    // the `key` enum is BUILT FROM the allow-list, never hand-typed twice.
    if (schema.indexOf('MODEL_PROPOSABLE_KEYS') === -1) {
      violations.push('[structural] CONFIG_SCHEMA_JSON does not build its ' +
        '`key` enum from MODEL_PROPOSABLE_KEYS — a second hand-typed list ' +
        'can drift out of step with the allow-list, and then the schema and ' +
        'the fence disagree about what the model may name');
    }
    if (PROPOSABLE_KEYS && PROPOSABLE_KEYS.length) {
      const copied = PROPOSABLE_KEYS.filter(function (k) {
        return schema.indexOf('"' + k + '"') !== -1;
      });
      if (copied.length >= 2) {
        violations.push('[structural] CONFIG_SCHEMA_JSON hand-types ' +
          copied.length + ' allow-list key literals (' + copied.join(', ') +
          ') — the enum must be an expression over MODEL_PROPOSABLE_KEYS, ' +
          'never a second copy');
      }
    }
    // draft-07 is what the CLI validates against; a newer declaration is
    // rejected outright.
    if (schema.indexOf('$schema') !== -1) {
      violations.push('[structural] CONFIG_SCHEMA_JSON declares $schema — ' +
        'validation is draft-07 and a newer declaration is rejected outright');
    }
    // changes / disposition / topic are all required, so a polite refusal is
    // a well-formed answer rather than a shape violation.
    const requireds = schema.match(/"required":\s*\[[^\]]*\]/g) || [];
    const ok = requireds.some(function (r) {
      return r.indexOf('"changes"') !== -1 &&
        r.indexOf('"disposition"') !== -1 && r.indexOf('"topic"') !== -1;
    });
    if (!ok) {
      violations.push('[structural] CONFIG_SCHEMA_JSON has no required list ' +
        'naming all of changes, disposition and topic — every answer must ' +
        'carry all three or the client cannot tell a refusal from a failure');
    }
    if (schema.indexOf('ASK_TOPICS') === -1) {
      violations.push('[structural] CONFIG_SCHEMA_JSON does not build its ' +
        '`topic` enum from ASK_TOPICS — the topic vocabulary must have one ' +
        'definition, not two');
    }
  }

  // minItems is the footgun this pin exists for: enforcement is
  // re-prompt-on-mismatch, not constrained decoding, so a schema with no
  // legal way to say "nothing to change" burns invisible CLI retries and
  // lands the static failure line instead of a refusal she can read. The
  // comment strip is `^ *#` because server.py is python — a `//` strip would
  // leave a python comment able to self-trip this gate.
  const pyCode = py.split('\n').filter(function (ln) {
    return !/^ *#/.test(ln);
  }).join('\n');
  if (pyCode.indexOf('minItems') !== -1) {
    violations.push('[structural] server.py: "minItems" appeared in a ' +
      'schema — an empty change list must be a LEGAL output, or a polite ' +
      'refusal degrades into the static failure line after burning retries ' +
      'nobody can see');
  }
  // "unmapped" and "other" must both be sayable.
  ['unmapped', 'other'].forEach(function (tok) {
    if (py.indexOf('"' + tok + '"') === -1) {
      violations.push('[structural] server.py: the closing vocabulary member ' +
        '"' + tok + '" does not exist — an ask the app cannot classify must ' +
        'still have a legal thing to answer');
    }
  });
})();

// ---------------------------------------------------------------------------
// (5) ROUTING (SE-9, T-26.87-02) + the D-21 OVERRIDE
// ---------------------------------------------------------------------------
//
// [routing] was CLOSED by 26.87-07 Task 2. The two placeholders 26.87-02
// wrote (a `fenced_roster` token co-occurring with a /refus|mixed/ word) are
// gone; what follows asserts the actual rule.
//
// WHY the roster class needs its own route at all: handle_meta validates
// fenced_roster as a list of strings and then merges it, SKIPPING
// study_lib.add_roster_folder's retroactive trigger=True stamping — and that
// stamping is what closed the 26.4-01 hole where a folder added to the roster
// left its already-imported items surfacing. A roster diff through the meta
// route would reopen that hole at exactly the place she asked for privacy.

(function () {
  const ROSTER_KEY = 'fenced_roster';

  // (5-ROUTING a) ONE client-side name for the roster key on the config
  // path. A single named constant is what lets every pin below talk about
  // the same thing, and it is why no confirm-path function needs to spell
  // the raw key beside a write.
  if (app.indexOf("ASK_ROSTER_KEY = '" + ROSTER_KEY + "'") === -1) {
    violations.push('[routing] app.js: the config path has no ' +
      'ASK_ROSTER_KEY constant — the roster key must have exactly one name ' +
      'on this path, so the router and the card can never disagree about ' +
      'which key is the fenced one');
  }

  // (5-ROUTING b) a roster-touching diff dispatches to the roster route.
  const rosterAware = CONFIG_FNS.filter(function (f) {
    return f.body.indexOf("apiPost('" + ROSTER_ROUTE + "'") !== -1;
  });
  if (!rosterAware.length) {
    violations.push('[routing] app.js: no config-ask path dispatches a ' +
      'roster-touching diff to ' + ROSTER_ROUTE + ' — the meta route skips ' +
      "add_roster_folder's retroactive stamping, so the roster class must " +
      'never travel through it');
  }

  // (5-ROUTING c) and the roster key never rides a meta POST body.
  CONFIG_FNS.forEach(function (f) {
    if (f.body.indexOf(ROSTER_KEY) !== -1 &&
        f.body.indexOf("apiPost('" + META_ROUTE + "'") !== -1) {
      violations.push('[routing] app.js: "' + f.name + '" carries both the ' +
        'roster key and a ' + META_ROUTE + ' write — a roster change through ' +
        'the meta route skips the retroactive stamping and reopens the fence');
    }
  });

  // (5-ROUTING d) THE ROUTER IS PURE. It decides which door a change list
  // takes by counting keys and returning a machine token; it must not be
  // able to reach the network itself, or "decide the route first" stops
  // being a statement about ordering.
  const router = appFn('askRouteOf');
  if (!router) {
    violations.push('[routing] app.js: askRouteOf is missing — there is no ' +
      'single place that decides which door a change list takes');
  } else {
    if (router.indexOf('ASK_ROSTER_KEY') === -1) {
      violations.push('[routing] app.js: askRouteOf never consults ' +
        'ASK_ROSTER_KEY — the route must be decided by the roster key ' +
        'itself, never by a name retyped somewhere else');
    }
    if (router.indexOf('apiPost(') !== -1 || router.indexOf('apiGet(') !== -1) {
      violations.push('[routing] app.js: askRouteOf touches the network — ' +
        'the router must be pure, or a mixed list can no longer be refused ' +
        'at zero cost');
    }
    // a roster card is ALWAYS single-change: two roster lines cannot share
    // one confirm any more than a roster line and a meta line can.
    if (!/roster > 1/.test(router)) {
      violations.push('[routing] app.js: askRouteOf does not refuse a change ' +
        'list carrying more than one roster line — a roster card is always ' +
        'a single-change card');
    }
  }

  // (5-ROUTING e) BRANCH ORDER in the confirm handler: the route is decided,
  // and a MIXED list is refused, BEFORE the first network call of any kind.
  // A mixed list must cost nothing — no read, no write, no partial.
  const confirm = appFn('askConfirmTap');
  if (!confirm) {
    violations.push('[routing] app.js: askConfirmTap is missing — the ' +
      'confirm path has no home for the routing rule');
  } else {
    const decideAt = confirm.indexOf('askRouteOf(');
    const mixedAt = confirm.indexOf('ASK_ROUTE_MIXED');
    const calls = [confirm.indexOf('apiGet('), confirm.indexOf('apiPost(')]
      .filter(function (n) { return n !== -1; });
    const firstCall = calls.length ? Math.min.apply(null, calls) : -1;
    if (decideAt === -1 || mixedAt === -1) {
      violations.push('[routing] app.js: askConfirmTap never decides a route ' +
        'and never names the mixed case — a change list mixing the roster ' +
        'key with a meta key must be REFUSED, never split across two routes: ' +
        'they cannot be atomic, and a half-applied fence change is the worst ' +
        'partial state this app can produce');
    } else if (firstCall === -1) {
      violations.push('[routing] app.js: askConfirmTap makes no request at ' +
        'all — the confirm tap is the writer, so this pin has nothing to ' +
        'hold');
    } else if (!(decideAt < firstCall && mixedAt < firstCall)) {
      violations.push('[routing] app.js: askConfirmTap reaches the network ' +
        'before it has decided the route and refused a mixed list — a mixed ' +
        'diff must be refused BEFORE any read or write, at zero cost');
    } else {
      const branch = confirm.slice(mixedAt, firstCall);
      if (branch.indexOf('askRefused(') === -1 ||
          branch.indexOf('return;') === -1) {
        violations.push('[routing] app.js: the mixed branch of ' +
          'askConfirmTap does not refuse and return — it must answer with a ' +
          'closed-vocabulary reason and stop, never fall through');
      }
    }
    // (5-ROUTING f) the roster POST carries the roster route's own
    // operation-and-folder shape — the shape whose add half runs the
    // retroactive stamping.
    if (!/apiPost\('\/api\/librarian\/roster',\s*\{\s*op:\s*'remove',\s*folder:/
        .test(confirm)) {
      violations.push('[routing] app.js: the config path does not POST the ' +
        "roster route's own {op, folder} shape — a roster change has exactly " +
        'one legal shape and one legal door');
    }
  }

  // (5-ROUTING g) a roster card ALWAYS wears the Form A consequence
  // sentence: removing a roster folder removes the strongest protection in
  // the app, so the vermillion sentence sits in the same glance as the
  // confirm. 26.87-04 shipped the protection table as a deliberately empty
  // hook; the roster is its one real member.
  if (app.indexOf('ASK_PROTECTION_COPY[ASK_ROSTER_KEY] =') === -1) {
    violations.push('[routing] app.js: the roster key has no Form A ' +
      'protection phrase — a roster removal must always carry the ' +
      'consequence sentence, because it removes the strongest protection ' +
      'in the app');
  }

  // (5-ROUTING h) the two shipped confirm labels are BYTE-TWINS of their
  // Manage buttons, and both halves are pinned so they cannot drift apart.
  // The card must not mint a second word for a consequence Manage already
  // names.
  [["ASK_LABEL_ROSTER = 'let the librarian read this'",
    'let the librarian read this</button>',
    "the roster row's own button"],
   ["ASK_LABEL_DISCONNECT = 'disconnect'",
    "escapeHtml('disconnect')",
    "the connected-apps disconnect button"]].forEach(function (pair) {
    if (app.indexOf(pair[0]) === -1 || app.indexOf(pair[1]) === -1) {
      violations.push('[routing] app.js: the config card no longer reuses ' +
        pair[2] + ' byte-exactly — one half of the twin moved, and the card ' +
        'would start speaking a second word for the same consequence');
    }
  });
  // ⚠ STRENGTHENED, NOT NARROWED (26.97-07). This used to require the
  // sentence to appear as a LITERAL at least twice — once in the Manage pane
  // and once as the card's constant — and read the pair as proof they had not
  // drifted. Two literals CAN drift: nothing but this count stopped somebody
  // editing one of them. As of 26.97-07 there is exactly ONE literal, and both
  // surfaces consume it through connectedSourceStatus, so they cannot drift at
  // all. The assertion now pins that arrangement — the byte of the constant,
  // the pane's consumption of it, and the pane composing its status through
  // the shared function rather than minting its own words. All three must
  // hold; any one of them going missing is the card starting to speak a second
  // word for a consequence Manage already names.
  if ((app.match(/': brought in\.'/g) || []).length !== 1) {
    violations.push('[routing] app.js: the shipped connected-apps ' +
      'before-state sentence must exist as exactly ONE literal ' +
      "(ASK_SOURCE_BROUGHT_IN) — a second copy is a twin that can drift");
  }
  if (app.indexOf("var ASK_SOURCE_BROUGHT_IN = ': brought in.';") === -1) {
    violations.push('[routing] app.js: the shipped connected-apps ' +
      'before-state sentence is no longer pinned byte-exactly on ' +
      'ASK_SOURCE_BROUGHT_IN — the card renders words Manage already says, ' +
      'never new ones');
  }
  if (!/function connectedSourceStatus\([\s\S]*?return ASK_SOURCE_BROUGHT_IN;/
      .test(app)) {
    violations.push('[routing] app.js: connectedSourceStatus must return ' +
      'ASK_SOURCE_BROUGHT_IN for the brought-in-once sources — that shared ' +
      'return is what makes the pane and the card the same sentence rather ' +
      'than two that happen to match today');
  }
  if (app.indexOf('connectedSourceName(s) + connectedSourceStatus(s)') === -1) {
    violations.push('[routing] app.js: the Manage row must compose its ' +
      'status through connectedSourceStatus — a row that spells the sentence ' +
      'out again is a second copy by another name');
  }

  // (5-ROUTING i) a route is machinery: it never appears inside a rendered
  // string. Making her reason about one fails the cognitive-accessibility
  // bar and the D-21 scope fence in a single move.
  CONFIG_FNS.forEach(function (f) {
    const shown = f.body.match(/escapeHtml\(([^)]*)\)/g) || [];
    shown.forEach(function (call) {
      if (call.indexOf('/api/') !== -1) {
        violations.push('[routing] app.js: "' + f.name + '" renders a route ' +
          'name into the DOM — a route is machinery and never user-facing');
      }
    });
  });

  // ---- [d21-override] — the no-analog half ------------------------------
  //
  // NOTHING SHIPPED substitutes a server verdict for a model's claim. Every
  // existing precedent is one-directional: the server validates membership
  // and DROPS what fails, or deterministic code decides alone with no model
  // in the loop. So these assertions inherit nothing and are written from
  // scratch. They go green in 26.87-05.

  const disp = pyDef('_config_disposition');
  if (!disp) {
    violations.push('[d21-override] server.py: _config_disposition is ' +
      'missing — the server has no verdict of its own to override the ' +
      "model's claim with (26.87-04 Task 1 adds it)");
  } else {
    ['MANAGE_ONLY_TOPICS', 'NOT_A_CAPABILITY'].forEach(function (t) {
      if (disp.indexOf(t) === -1) {
        violations.push('[d21-override] _config_disposition never consults ' +
          t + ' — a model claiming a capability gap for something Manage ' +
          'can already do must be overridden into the manage-only verdict');
      }
    });
    // 26.93-07: `call_librarian(` in place of the deleted seam's name. ⚠ THE
    // TWIN OF THIS LIST LIVES IN THE PYTHON DRIVER FURTHER DOWN THIS FILE
    // (the [edge/concurrency] I/O scan over the SAME function). Both name the
    // model-call token and both must move together — changing one and not the
    // other is precisely how these two drift apart.
    ['load_store(', 'save_store(', 'call_librarian(', 'open(']
      .forEach(function (tok) {
        if (disp.indexOf(tok) !== -1) {
          violations.push('[d21-override] _config_disposition contains "' +
            tok + '" — the verdict cascade must be PURE: same arguments, ' +
            'same verdict, no store read, no model call, no I/O');
        }
      });
  }
  // the re-derivation must actually be USED, not merely defined.
  if ((py.match(/_config_disposition/g) || []).length < 2) {
    violations.push('[d21-override] server.py: _config_disposition is never ' +
      "called — the ask route must re-derive the verdict and answer with " +
      "ITS verdict, not the model's claim");
  }
  if (app.indexOf('_config_disposition') !== -1) {
    violations.push('[d21-override] app.js references _config_disposition — ' +
      'the client picks a string off the server\'s verdict and authors none');
  }
  // the disagreement register is a COUNT, never content, and never rendered.
  if (py.indexOf('disposition-overridden') === -1) {
    violations.push('[d21-override] server.py: the disposition-overridden ' +
      'counter is missing — a model claim that disagrees with the server ' +
      'verdict must be observable as a count (26.87-05 adds it)');
  }
  if (app.indexOf('disposition-overridden') !== -1) {
    violations.push('[d21-override] app.js carries disposition-overridden — ' +
      'the override register is dev-side only and never surfaces in the app');
  }
  // the client never counts change lines: a client-side count that overrode
  // a server verdict IS the client authoring a disposition (law 2).
  CONFIG_FNS.forEach(function (f) {
    if (/\.length\s*(>|>=)\s*[34]/.test(f.body)) {
      violations.push('[d21-override] app.js: "' + f.name + '" counts change ' +
        'lines itself — the >3 cap lives in validate_config_proposal and the ' +
        'client only READS the too_many token');
    }
  });
  if (app.indexOf('too_many') === -1) {
    violations.push('[d21-override] app.js never reads the too_many token — ' +
      'the cap is a server verdict the client renders, not a count it makes ' +
      '(26.87-05 Task 2 adds it)');
  }

  // ---- the CLI-suggestion branch emits one of a FIXED SET of literals ----
  //
  // The capability-gap line is the phase's riskiest string: it points past
  // the app. Its scope fence is hard — no item body, no item title, no URL,
  // no install command, no file path, no vendor named inside the fiction,
  // and no interpolation of any kind, because a literal that can be built at
  // runtime is not a fixed set.
  const REFUSALS = ['CONFIG_MANAGE_ONLY_MSG', 'CONFIG_NOT_A_CAPABILITY_MSG',
    'CONFIG_UNMAPPED_MSG', 'CONFIG_TOO_MANY_MSG'];
  const literals = {};
  REFUSALS.forEach(function (name) {
    const m = py.match(new RegExp('\\n' + name + ' = "([^"]*)"'));
    if (!m) {
      violations.push('[d21-override] server.py: the refusal literal ' + name +
        ' is missing, or is not a single-line double-quoted string — the ' +
        'refusal family must be a fixed set, one message per source line so ' +
        'a byte pin can hold (26.87-05 Task 1 adds them)');
      return;
    }
    literals[name] = m[1];
    const line = py.slice(py.indexOf('\n' + name + ' = ') + 1);
    const firstLine = line.slice(0, line.indexOf('\n'));
    if (/\{|\}|%s|%r|\.format\(|^\s*f"/.test(firstLine.replace(name, ''))) {
      violations.push('[d21-override] server.py: ' + name + ' interpolates — ' +
        'a refusal that can be BUILT at runtime is not a fixed set, and free ' +
        'text in a refusal is exactly the leak this family exists to prevent');
    }
    [['http', 'a URL'], ['://', 'a URL'], ['npm ', 'an install command'],
      ['pip ', 'an install command'], ['brew ', 'an install command'],
      ['install', 'an install command'], ['/', 'a file path'],
      ['~', 'a file path'], ['.md', 'a file path'], ['.py', 'a file path'],
      [FENCE_TITLE_SENTINEL, 'an item title'],
      [FENCE_BODY_SENTINEL, 'an item body']].forEach(function (bad) {
      if (m[1].indexOf(bad[0]) !== -1) {
        violations.push('[d21-override] server.py: ' + name + ' contains ' +
          bad[1] + ' ("' + bad[0] + '") — a refusal names one door and stops; ' +
          'truthful specifics belong in LIBRARIAN.md where a builder looks');
      }
    });
    if (/claude|anthropic|openai|chatgpt|copilot|cursor|gemini/i.test(m[1])) {
      violations.push('[d21-override] server.py: ' + name + ' names a vendor ' +
        'inside the fiction — a product name in a place that is supposed to ' +
        'be a room ages badly, and the checkable statement belongs in ' +
        'LIBRARIAN.md');
    }
  });
  // the capability-gap line names ONE door...
  const gap = literals.CONFIG_NOT_A_CAPABILITY_MSG;
  if (gap !== undefined && !/terminal|assistant/i.test(gap)) {
    violations.push('[d21-override] server.py: ' +
      'CONFIG_NOT_A_CAPABILITY_MSG names no door at all — the branch exists ' +
      'to name one (an AI coding assistant in the terminal) and then stop');
  }
  // ...and an UNCLASSIFIABLE ask renders no external-tool line whatsoever:
  // not being able to classify an ask is not evidence of a capability gap.
  const unmapped = literals.CONFIG_UNMAPPED_MSG;
  if (unmapped !== undefined && /terminal|assistant|coding tool/i.test(unmapped)) {
    violations.push('[d21-override] server.py: CONFIG_UNMAPPED_MSG carries ' +
      'the external-tool line — an ask the app could not classify must get ' +
      'the plain refusal and NO signpost; a miss is not a capability gap');
  }
})();

// ---------------------------------------------------------------------------
// (6) D-04 — THE ONE UNASKED PROPOSAL (26.87-07 Task 3, T-27-18)
// ---------------------------------------------------------------------------
//
// D-04 is the ONLY unasked proposal class the phase permits, it fires only on
// a live suppression, and it costs ZERO model calls: it is a deterministic
// comparison of the surfaced set with and without her own filters, decided by
// the SHIPPED predicate rather than a second implementation of it.
//
// Two properties carry the whole safety argument and both are pinned below:
//   * the comparison is computed over FILTERS ALONE, so the never-show,
//     retired and trigger-marked classes cannot influence it and are never
//     named, counted or hinted at — they stay silent forever. A filter can be
//     named because it is HER OWN reversible choice; those classes never can.
//   * the librarian-OFF idle branch never reaches it. Costing no model call
//     does not exempt this card: it is a librarian-shaped proposal in the
//     room's voice, and 26.87-04's byte-identical contract is about what the
//     room SAYS, not about what it spends.

(function () {
  const D04_HEAD = 'a filter you set, ';
  const D04_TAIL = ', is hiding some of what you welcomed. want it off?';

  // (6a) the copy is byte-exact, carries NO number, and carries no count
  // word. A number here would be a count of hidden things, and this surface
  // has the least right to one: "some of what you welcomed", never "N".
  [["ASK_D04_HEAD = '" + D04_HEAD + "'", D04_HEAD],
   ["ASK_D04_TAIL = '" + D04_TAIL + "'", D04_TAIL]].forEach(function (pair) {
    if (app.indexOf(pair[0]) === -1) {
      violations.push('[d04] app.js: the D-04 change line is missing or has ' +
        'drifted from its audited wording — expected the literal ' +
        JSON.stringify(pair[1]));
      return;
    }
    if (/[0-9]/.test(pair[1])) {
      violations.push('[d04] app.js: the D-04 copy carries a digit — the ' +
        'card names a filter, never a count of what it is hiding');
    }
    if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|several|many|few|number|count|items|things)\b/i
        .test(pair[1])) {
      violations.push('[d04] app.js: the D-04 copy carries a count word — ' +
        '"some of what you welcomed", never a number in any spelling');
    }
  });

  // (6b) the comparison uses the SHIPPED predicate pair and implements no
  // second filter matcher of its own.
  const card = appFn('askD04Card');
  if (!card) {
    violations.push('[d04] app.js: askD04Card is missing — the one unasked ' +
      'proposal class has no deterministic look behind it');
  } else {
    if (card.indexOf('guardSurface') === -1) {
      violations.push('[d04] app.js: askD04Card does not re-resolve through ' +
        'the shipped guard — re-resolving every surface through the guard at ' +
        'render time is the P0 invariant, and a cached set is not it');
    }
    if (/facet\s*===\s*'/.test(card)) {
      violations.push('[d04] app.js: askD04Card matches facets itself — the ' +
        'ONE predicate pair decides, or two implementations of the fence ' +
        'exist and can disagree');
    }
    ['apiGet(', 'apiPost(', '/api/'].forEach(function (tok) {
      if (card.indexOf(tok) !== -1) {
        violations.push('[d04] app.js: askD04Card carries "' + tok + '" — ' +
          'the card is an OBSERVATION, not a generation: it costs zero model ' +
          'calls and makes no request of its own');
      }
    });
    // it must not read a fenced class directly either: both sides of the
    // comparison go through the guard, which is what keeps those classes
    // out of the difference entirely.
    ["'never_show'", "'retired'", '.trigger'].forEach(function (tok) {
      if (card.indexOf(tok) !== -1) {
        violations.push('[d04] app.js: askD04Card reads the fenced class ' +
          tok + ' directly — the comparison is computed over FILTERS ALONE, ' +
          'through the guard, so those classes can never influence it');
      }
    });
  }

  // (6c) AT MOST ONE CARD, EVER: exactly one call site. Two suppressing
  // filters still produce one card — a stack of unasked cards is a queue of
  // work, and at a desk that is close to a notification.
  const siteCount = (app.match(/askD04Card\(\)/g) || []).length;
  if (siteCount !== 2) {
    violations.push('[d04] app.js: askD04Card has ' + (siteCount - 1) +
      ' call site(s) — there must be exactly one, because at most one ' +
      'unasked card may ever render');
  }

  // (6d) the render site: the card sits ABOVE the invitation line and the
  // invitation still renders beneath it. A card that REPLACED the invitation
  // would make an unasked proposal a dead end.
  const paint = appFn('askPaintSpot');
  if (!paint) {
    violations.push('[d04] app.js: askPaintSpot is missing');
  } else {
    const cardAt = paint.indexOf('ask-unasked');
    const inviteAt = paint.indexOf('ASK_INVITE_COPY');
    const noteAt = paint.indexOf('ask-note');
    if (cardAt === -1 || inviteAt === -1) {
      violations.push('[d04] app.js: askPaintSpot does not render both the ' +
        'unasked card and the invitation line');
    } else if (!(cardAt < inviteAt)) {
      violations.push('[d04] app.js: the D-04 card is not rendered ABOVE ' +
        'the invitation line — the room must stay open beneath it');
    } else {
      // (6e) no vermillion. Undoing a filter is a kindness, not a warning:
      // a filter is her own reversible preference, not a protection, and
      // colouring it as one would make the kindness read as an alarm.
      const region = paint.slice(cardAt, noteAt === -1 ? paint.length : noteAt);
      ['config-warn', '--never'].forEach(function (tok) {
        if (region.indexOf(tok) !== -1) {
          violations.push('[d04] app.js: the D-04 card carries "' + tok +
            '" — a filter removal wears NO vermillion');
        }
      });
      ['never_show', 'never-show', 'retired', 'trigger'].forEach(function (t) {
        if (region.indexOf(t) !== -1) {
          violations.push('[d04] app.js: the D-04 card names the fenced ' +
            'class "' + t + '" — those classes are never named, counted, or ' +
            'hinted at on any surface, and least of all on this one');
        }
      });
    }
  }

  // (6f) THE LIBRARIAN-OFF PIN, inherited from 26.87-04 without exception:
  // the idle branch gates on librarianOn() and never reaches the D-04 work
  // itself, so with the librarian off or the CLI absent the spot renders
  // exactly what it renders today.
  const idle = appFn('sessionPaintSpot');
  if (!idle) {
    violations.push('[d04] app.js: sessionPaintSpot is missing — the ' +
      'byte-identical-when-off pin has nothing to hold');
  } else {
    if (idle.indexOf('if (librarianOn()) { askPaintSpot(spot); }') === -1) {
      violations.push('[d04] app.js: the idle branch no longer gates its ' +
        'librarian half on librarianOn() — with the librarian off this ' +
        'branch must carry zero librarian bytes');
    }
    if (idle.indexOf('askD04') !== -1) {
      violations.push('[d04] app.js: sessionPaintSpot reaches the D-04 work ' +
        'itself — it must sit behind the librarian gate, not beside it: a ' +
        'card in a room whose librarian is off would be a librarian byte in ' +
        'the one branch contracted to have none');
    }
  }
})();

// ---- [uat] 26.87 UAT F2 + F4 ----------------------------------------------
//
// Two owner-found presentation defects, pinned so they cannot creep back.
// Both are about a surface losing something its ORIGINAL context supplied.
(function () {
  const css = readSource('tokens.css');

  // F2 — the standing invitation read as STRUCK THROUGH: the quiet-button
  // register underlines, and at rest the spot had no fill, so the underline
  // was drawn over shelf-sprite detail. A struck-through invitation reads as
  // withdrawn, which is the opposite of a standing offer.
  const plate = /\.station-spot\.ask-idle\s+\.ask-invite\s*\{([^}]*)\}/
    .exec(css);
  if (!plate) {
    violations.push('[uat] tokens.css: the idle ask invitation has no ' +
      'backing plate — underlined text over sprite detail reads as struck ' +
      'through, i.e. as an offer already withdrawn (F2)');
  } else if (plate[1].indexOf('background') === -1) {
    violations.push('[uat] tokens.css: the idle invitation rule sets no ' +
      'background — the plate is the whole point of it (F2)');
  }
  // ...and the plate must hug the LINE, never the spot: a filled box at rest
  // is how the reserved spot starts reading as a search field (D-22).
  const idle = /\.station-spot\.ask-idle\s*\{([^}]*)\}/.exec(css);
  if (idle && /(^|[;\s])background\s*:/.test(idle[1])) {
    violations.push('[uat] tokens.css: .station-spot.ask-idle itself gained ' +
      'a fill — at rest the spot must stay chrome-free or it reads as a ' +
      'command line; only the invitation line may carry the plate (F2/D-22)');
  }

  // F4 — the change line named the after-state but not the SETTING: "this is
  // off" with nothing saying what "this" was. In Manage the sentence sits
  // under its own labelled toggle; on the card that referent vanishes.
  const stateBlock = /var ASK_STATE_COPY = \{([\s\S]*?)\n  \};/.exec(app);
  const nameBlock = /var ASK_SETTING_NAME = \{([\s\S]*?)\n  \};/.exec(app);
  if (!nameBlock) {
    violations.push('[uat] app.js: ASK_SETTING_NAME is missing — every ' +
      'state sentence on the card renders an orphaned "this" (F4)');
  } else if (stateBlock) {
    // EVERY mapper key must have a name. This is the part that stops a
    // FUTURE key landing with the same defect.
    const keys = (stateBlock[1].match(/^\s{4}([a-z_]+):/gm) || [])
      .map(function (s) { return s.trim().replace(':', ''); });
    keys.forEach(function (k) {
      if (nameBlock[1].indexOf(k + ':') === -1) {
        violations.push('[uat] app.js: ASK_STATE_COPY has "' + k + '" but ' +
          'ASK_SETTING_NAME does not — its card would say "this is off" ' +
          'with nothing naming which switch moved (F4)');
      }
    });
    if (!keys.length) {
      violations.push('[uat] app.js: no ASK_STATE_COPY keys were parsed — ' +
        'the F4 completeness check is vacuous and proves nothing');
    }
  }
  // F8 — the placeholder teaches by example, and every example must be REAL.
  //
  // This is the F9 lesson applied before the fact: copy that names something
  // the app cannot deliver is worse than copy that says nothing. A placeholder
  // is a promise in miniature.
  const exBlock = /var ASK_PLACEHOLDER_EXAMPLES = \[([\s\S]*?)\n  \];/
    .exec(app);
  if (!exBlock) {
    violations.push('[uat] app.js: ASK_PLACEHOLDER_EXAMPLES is missing — the ' +
      'ask teaches nothing and the only way to learn its vocabulary is the ' +
      'Manage panel the chat exists to spare her (F8)');
  } else {
    const examples = (exBlock[1].match(/'([^']+)'/g) || [])
      .map(function (s) { return s.slice(1, -1); });
    if (examples.length < 2) {
      violations.push('[uat] app.js: fewer than two placeholder examples — a ' +
        'single fixed example is a slogan, not a rotation (F8)');
    }
    // 26.91 D-07/D-08 (2026-08-07): PINNED BY VALUE AT SIX, not ">= 5".
    // D-07 made `surface_content` a real capability, so "anything for me?"
    // became a thing the room can actually do — and the invariant above ("every
    // example must be a thing the room can actually do") is what makes adding
    // the example REQUIRED rather than a copy nicety. A floor of "at least
    // five" would let the sixth vanish in silence, which is the one operation
    // that puts the sign back out of step with the door.
    if (examples.length !== 6) {
      violations.push('[uat] app.js: ASK_PLACEHOLDER_EXAMPLES holds ' +
        examples.length + ' entries — pinned BY VALUE at 6 since 26.91 D-07 ' +
        'added the surfacing ask. A count read as a floor cannot notice an ' +
        'entry leaving, and the sign silently going back out of step with ' +
        'the door is exactly what this pin exists to catch');
    }
    // ...AND EVERY ENTRY KEEPS THE SHIPPED WRAPPER. All five originals read
    // `try "…"`; askPlaceholder returns the entry VERBATIM, so a bare
    // sentence would render as the only unwrapped placeholder in the rotation
    // and read as a different kind of thing entirely.
    examples.forEach(function (ex) {
      if (!/^try "/.test(ex)) {
        violations.push('[uat] app.js: placeholder example ' +
          JSON.stringify(ex) + ' is not in the shipped `try "…"` wrapper — ' +
          'the entry is returned verbatim into the input, so an unwrapped ' +
          'one is the only bare sentence in the rotation (F8)');
      }
    });
    // Each example must exercise a capability the room really has. The set of
    // things it can do is MODEL_PROPOSABLE_KEYS + the value classes, so each
    // example is matched against a vocabulary lifted from those, never a
    // hand-typed list that could drift from them.
    const proposable = (/MODEL_PROPOSABLE_KEYS = \(([\s\S]*?)\)/.exec(py) ||
      [, ''])[1];
    const CAPS = [
      { needle: 'tidy', key: 'cleaning_enabled' },
      { needle: 'call yourself', key: 'librarian_name' },
      { needle: 'haiku', key: 'voice_model' },
      { needle: 'reflection', key: 'reflection_writeback_enabled' },
      { needle: 'turn yourself off', key: 'librarian_enabled' },
      // 26.91 D-07. This row is the causal chain in one line: the example is
      // legal here ONLY because server.py carries `surface_content` as a real
      // topic. Put it back in NOT_A_CAPABILITY and the key lookup below still
      // finds the string — which is why the D-07 block in
      // test_disclosure_truth.cjs pins WHICH TUPLE holds it, and this row
      // pins only that the room knows the word at all.
      { needle: 'anything for me', key: 'surface_content' }
    ];
    examples.forEach(function (ex) {
      const hit = CAPS.filter(function (c) {
        return ex.toLowerCase().indexOf(c.needle) !== -1;
      });
      if (!hit.length) {
        violations.push('[uat] app.js: placeholder example ' + JSON.stringify(ex) +
          ' does not map to any known capability — the ask would be ' +
          'advertising something the room cannot do (F8/F9)');
        return;
      }
      // ...and the capability it names must still exist server-side.
      hit.forEach(function (c) {
        const known = proposable.indexOf('"' + c.key + '"') !== -1 ||
          py.indexOf('"' + c.key + '"') !== -1 ||
          py.indexOf("'" + c.key + "'") !== -1;
        if (!known) {
          violations.push('[uat] app.js: placeholder example ' +
            JSON.stringify(ex) + ' names "' + c.key + '", which server.py no ' +
            'longer carries — the sign now promises a door that is gone (F8)');
        }
      });
    });
    // Publish-gate: a placeholder is in-scene copy, so no personal or
    // institutional vocabulary may ride in it (D-24), the same rule the
    // heaviness term list follows.
    ['HR', 'medical', 'University', 'Journal', 'assessment']
      .forEach(function (w) {
        if (exBlock[1].indexOf(w) !== -1) {
          violations.push('[uat] app.js: placeholder examples carry "' + w +
            '" — in-scene copy is a publish-gate surface and must stay ' +
            'generic (D-24)');
        }
      });
    // it must actually be RENDERED — the F4 dead-code lesson, again.
    if (!/placeholder="'\s*\+\s*escapeAttr\(askPlaceholder\(\)\)/.test(app)) {
      violations.push('[uat] app.js: the input still renders the fixed ' +
        'placeholder — the examples exist but nobody sees them (F8)');
    }
    // ---- 26.91 D-08: THE ROTATION, DRIVEN AND NOT READ ------------------
    //
    // Everything above this line reads source text. A roster and a rotation
    // that only ever agree in a regex is the shape this repo keeps catching:
    // the pins would hold while askPlaceholder returned the same entry every
    // time, or threw on an empty list. So the shipped function is LIFTED and
    // EXECUTED over the shipped roster.
    try {
      // eslint-disable-next-line no-new-func
      const rotate = new Function('EXAMPLES', 'FALLBACK',
        'var ASK_PLACEHOLDER_EXAMPLES = EXAMPLES;\n' +
        'var ASK_PLACEHOLDER_COPY = FALLBACK;\n' +
        'var ASK_EXAMPLE_TURN = 0;\n' +
        (/function askPlaceholder\(\) \{[\s\S]*?\n {2}\}/.exec(app) ||
          [''])[0] + '\n' +
        'return function () { ASK_EXAMPLE_TURN += 1; ' +
        'return askPlaceholder(); };');
      const fixed = (/var ASK_PLACEHOLDER_COPY = '([^']*)';/.exec(app) ||
        [, ''])[1];
      const next = rotate(examples.slice(), fixed);
      const seen = {};
      // TWICE ROUND, so a rotation that stalls on one entry cannot pass by
      // covering the set once through sheer list length.
      for (let i = 0; i < examples.length * 2; i++) {
        const got = next();
        seen[got] = (seen[got] || 0) + 1;
      }
      examples.forEach(function (ex) {
        if (seen[ex] !== 2) {
          violations.push('[uat] app.js: askPlaceholder() over two full ' +
            'turns returned ' + JSON.stringify(ex) + ' ' + (seen[ex] || 0) +
            ' time(s), not exactly 2 — the rotation is not covering the ' +
            'roster, so some example the room promises is never shown (F8)');
        }
      });
      if (Object.keys(seen).length !== examples.length) {
        violations.push('[uat] app.js: askPlaceholder() returned ' +
          Object.keys(seen).length + ' distinct strings over two turns for ' +
          'a roster of ' + examples.length + ' — driven, not derived');
      }
      // ...and the input must NEVER render with no placeholder at all.
      const emptied = rotate([], fixed);
      if (emptied() !== fixed || !fixed) {
        violations.push('[uat] app.js: with the roster emptied ' +
          'askPlaceholder() returned ' + JSON.stringify(emptied()) +
          ' instead of the shipped free-form line ' + JSON.stringify(fixed) +
          ' — an empty rotation must fall back, never render a bare box');
      }
    } catch (e) {
      violations.push('[uat] app.js: askPlaceholder could not be lifted and ' +
        'driven (' + e.message + ') — a rotation nobody executes is a ' +
        'rotation nobody has checked');
    }
  }

  // F9 — the route map may only name destinations that EXIST, and it may only
  // ride the manage_only branch. This is the pin that would have caught the
  // original defect: copy naming a place the control is not.
  const routeBlock = /var ASK_MANAGE_ROUTE = \{([\s\S]*?)\n  \};/.exec(app);
  if (!routeBlock) {
    violations.push('[uat] app.js: ASK_MANAGE_ROUTE is missing — a refusal ' +
      'that cannot act must teach where to go (F9)');
  } else {
    const routed = (routeBlock[1].match(/^\s{4}([a-z_]+):/gm) || [])
      .map(function (s) { return s.trim().replace(':', ''); });
    // The four topics with NO real destination must NOT appear. roster lives
    // on the import screen, librarian_name only in onboarding, habit_anchor
    // is a one-time card D-09 says never returns, onboarding is over.
    ['roster', 'librarian_name', 'habit_anchor', 'onboarding']
      .forEach(function (t) {
        if (routed.indexOf(t) !== -1) {
          violations.push('[uat] app.js: ASK_MANAGE_ROUTE names a route for ' +
            '"' + t + '", which has NO control in Manage — that is the F9 ' +
            'defect exactly: sending her to hunt for something not there');
        }
      });
    if (!routed.length) {
      violations.push('[uat] app.js: ASK_MANAGE_ROUTE is empty — then the ' +
        "owner's ask (teach her how to get there) is unimplemented (F9)");
    }
    // every route named must quote a REAL Manage pane label.
    const panes = /var MANAGE_PANES = \[([\s\S]*?)\n  \];/.exec(app);
    if (panes) {
      const labels = (panes[1].match(/label: '([^']+)'/g) || [])
        .map(function (s) { return s.replace("label: '", '').slice(0, -1); });
      routed.forEach(function (t) {
        const m = new RegExp(t + ":[\\s\\S]{0,120}?'([^']*)'").exec(
          routeBlock[1]);
        if (!m) { return; }
        const ok = labels.some(function (l) {
          return m[1].indexOf('“' + l + '”') !== -1;
        });
        if (!ok) {
          violations.push('[uat] app.js: the route for "' + t + '" quotes no ' +
            'shipped MANAGE_PANES label — the instruction must name the pane ' +
            'she will actually see, byte-exactly (F9)');
        }
      });
    }
  }
  // the route may only be appended on manage_only — not_a_capability already
  // names its own door, and unmapped names none ON PURPOSE (D-21).
  const refusalFn = /function askRefusalLine\(snap\) \{([\s\S]*?)\n  \}/
    .exec(app);
  if (!refusalFn) {
    violations.push('[uat] app.js: askRefusalLine is gone — the F9 route pin ' +
      'cannot see where the line is composed');
  } else {
    if (refusalFn[1].indexOf('askRouteLine') === -1) {
      violations.push('[uat] app.js: askRefusalLine never calls ' +
        'askRouteLine — a declared-but-unrendered route teaches nothing (F9)');
    }
    // ...and CALLING it is not USING it. Caught by a negative control that a
    // reference-only check let through — the same dead-code shape as the F4
    // defect, where the fix sat in a function nothing rendered from. The
    // route must actually join the line she reads.
    if (!/line\s*=\s*line\s*\+[\s\S]{0,40}route/.test(refusalFn[1])) {
      violations.push('[uat] app.js: askRefusalLine computes a route but ' +
        'never joins it to the rendered line — calling is not using, and a ' +
        'result thrown away is dead code that still reads as a fix (F9)');
    }
    if (refusalFn[1].indexOf('manage_only') === -1) {
      violations.push('[uat] app.js: askRefusalLine appends the route ' +
        'without gating on the manage_only branch — unmapped names no door ' +
        'ON PURPOSE (D-21) and not_a_capability already names its own');
    }
  }

  // THE NAME MUST BE RENDERED BY THE FUNCTION THAT ACTUALLY DRAWS THE CARD.
  //
  // Learned the hard way, live, during the UAT this pin was written for: the
  // first version of this check only read askChangeLines, which is a PARALLEL
  // copy kept "for any caller that is not a sink". askPaintCard builds the
  // card INLINE at the sink (the escape-discipline rule), so the fix was dead
  // code and the check went green anyway. A pin that reads a helper while the
  // sink renders something else measures nothing — the same reachability gap
  // SE-9 found. So BOTH are pinned, and the sink is pinned FIRST.
  const sink = /function askPaintCard\(note\) \{([\s\S]*?)\n  \}/.exec(app);
  if (!sink) {
    violations.push('[uat] app.js: askPaintCard is gone — the F4 pin can no ' +
      'longer see the function that actually renders the card');
  } else if (sink[1].indexOf('ASK_SETTING_NAME') === -1) {
    violations.push('[uat] app.js: askPaintCard — the SINK that actually ' +
      'draws the diff card — never reads ASK_SETTING_NAME, so every card ' +
      'still renders an orphaned "this" no matter what the helper does (F4)');
  }
  const lines = /function askChangeLines\(c\) \{([\s\S]*?)\n  \}/.exec(app);
  if (!lines || lines[1].indexOf('ASK_SETTING_NAME') === -1) {
    violations.push('[uat] app.js: askChangeLines never reads ' +
      'ASK_SETTING_NAME — the non-sink copy would drift from the sink (F4)');
  }
})();

// ---------------------------------------------------------------------------
// (7) 26.91 D-07 / D-08 — LAW 1 AND LAW 7, DRIVEN THROUGH THE SHIPPED SURFACE
// ---------------------------------------------------------------------------
//
// 26.91-04 retired the reading book, the last surface that rendered the
// librarian's proposal cohort. D-07 routes that cohort into the ask; D-08
// makes it PULL-ONLY and only when she asks. This block holds both, plus the
// six SRM-11-EXT-SUGGEST probe edges.
//
// THE ANTI-VACUITY AUDIT, written before the assertions and kept honest by
// the mutation log in 26.91-05-SUMMARY.md:
//
//   (a) WHAT COULD MAKE THIS GROUP PASS WHILE THE BEHAVIOUR IS WRONG?
//       Three shapes, each closed below.
//         * "Nothing was found" — a law-1 check that only looks for the
//           lead-in BEFORE she asks passes just as well when the reply is
//           broken and never renders at all. Closed by driving BOTH halves
//           of the same painted surface: absent before, present after.
//         * A harness that never parsed a button — then "the store did not
//           change when a row was clicked" is true because nothing was
//           clicked. Closed by counting the parsed buttons by value and by
//           the POSITIVE half (the click DID reach openLibrarianJoyful).
//         * A scan window that shrank to nothing — a ban over an empty
//           string passes. Closed by pinning every window non-empty FIRST.
//
//   (b) WHAT DRIVES vs WHAT READS. Everything here EXECUTES the shipped
//       functions — askPaintSpot, askPaintSuggest, renderLibrarianSuggestions
//       and the real StudyCore.selectLibrarianSuggestions — except the two
//       blocks labelled (source scan), which exist for surfaces the harness
//       cannot paint (the room painters, and the shipped no-push matcher).
//       26.9's law-5 audit is the precedent: source order is not evaluation
//       order, and only executing the seam caught a fence left wide open.
//
//   (c) POSITIVE CONTROLS. The parsed-button count, the non-empty scan
//       windows, the after half of the law-1 pair, the reached-handler half
//       of the law-7 pair, and the manageMetaLine sentinel on heavy rows.
//
//   (d) MUTATION -> ASSERTION. Recorded in the SUMMARY, one row per mutation.
//
// The harness parses the ACTUAL html the shipped painters emit. It never
// builds nodes from a table it then asserts against — wave 3 found exactly
// that shape one layer down, and it is the reason this comment exists.

(function () {
  const StudyCore = require('../core.js');
  const L = '[26.91-D-07]';
  // One frozen instant for every driven render — the suite never reads the
  // wall clock, so a run at midnight and a run at noon are the same run.
  const FROZEN_MS = 1754500000000;

  // ---- lifting ------------------------------------------------------------

  function fnSrc(name) {
    const sig = 'function ' + name + '(';
    const start = app.indexOf(sig);
    if (start === -1) { return null; }
    let i = app.indexOf('{', start);
    let depth = 0;
    for (; i < app.length; i++) {
      if (app[i] === '{') { depth++; } else if (app[i] === '}') {
        depth--; if (depth === 0) { i++; break; }
      }
    }
    return depth === 0 ? app.slice(start, i) : null;
  }

  const LIFT = ['askPaintSpot', 'askPaintSuggest', 'renderLibrarianSuggestions',
    'escapeHtml', 'escapeAttr', 'pileQuietStyle', 'manageMetaLine',
    'librarianOn'];
  const missing = LIFT.filter(function (n) { return fnSrc(n) === null; });
  if (missing.length) {
    violations.push(L + ' app.js: cannot lift ' + missing.join(', ') +
      ' — the D-07/D-08 group drives the shipped painters, and a function it ' +
      'cannot lift is a function it silently stops checking');
    return;
  }

  // ---- the collecting fake scene -----------------------------------------
  //
  // Every node made and every html string assigned is recorded, so "no
  // suggestion row exists" is a statement about what the painter PRODUCED,
  // never about what a regex over source failed to find.

  const collected = { nodes: [], html: [] };

  function mkNode(tag) {
    const n = {
      tag: tag, cls: '', text: '', __html: '', __id: '', __row: null,
      __kids: [], kids: [], parentNode: null, attrs: {},
      classList: {
        toggle: function () {}, add: function () {}, remove: function () {}
      },
      removeAttribute: function () {},
      setAttribute: function (k, v) { this.attrs[k] = v; },
      getAttribute: function (k) {
        return k === 'data-id' ? this.__id : (this.attrs[k] || null);
      },
      addEventListener: function (t, f) {
        (this.__on[t] = this.__on[t] || []).push(f);
      },
      fire: function (t, e) {
        (this.__on[t] || []).slice().forEach(function (f) { f(e || {}); });
      },
      appendChild: function (c) { this.kids.push(c); c.parentNode = this; },
      removeChild: function (c) {
        this.kids = this.kids.filter(function (k) { return k !== c; });
      },
      closest: function (sel) {
        return sel === '.librarian-row' ? this.__row : null;
      },
      querySelectorAll: function (sel) {
        const want = sel.replace(/^\./, '');
        return this.__kids.filter(function (k) {
          return (' ' + k.cls + ' ').indexOf(' ' + want + ' ') !== -1;
        });
      },
      querySelector: function (sel) {
        const hit = this.querySelectorAll(sel);
        return hit.length ? hit[0] : null;
      },
      focus: function () {}
    };
    n.__on = {};
    Object.defineProperty(n, 'className', {
      get: function () { return this.cls; },
      set: function (v) { this.cls = String(v); }
    });
    Object.defineProperty(n, 'textContent', {
      get: function () { return this.text; },
      set: function (v) { this.text = String(v); }
    });
    Object.defineProperty(n, 'innerHTML', {
      get: function () { return this.__html; },
      set: function (v) {
        this.__html = String(v);
        this.kids = [];
        collected.html.push(this.__html);
        // Parse the html the SHIPPED painter emitted. Rows first, so a
        // button knows which .librarian-row it sits inside (closest()).
        const self = this;
        self.__kids = [];
        const chunks = this.__html
          .split('<div class="card librarian-row">');
        chunks.forEach(function (chunk, ci) {
          let row = null;
          if (ci > 0) {
            row = mkNode('div');
            row.className = 'card librarian-row';
            row.parentNode = self;
            self.__kids.push(row);
          }
          const tags = chunk.match(/<(?:button|div|p|input)\b[^>]*>/g) || [];
          tags.forEach(function (t) {
            const cls = (/class="([^"]*)"/.exec(t) || [, ''])[1];
            if (!cls) { return; }
            const el = mkNode((/^<([a-z]+)/.exec(t) || [, 'div'])[1]);
            el.className = cls;
            el.__id = (/data-id="([^"]*)"/.exec(t) || [, ''])[1];
            el.__row = row;
            el.parentNode = self;
            self.__kids.push(el);
          });
        });
      }
    });
    collected.nodes.push(n);
    return n;
  }

  // Everything the painters can have put on screen, as one string.
  function painted() {
    return collected.html.join('\n') + '\n' +
      collected.nodes.map(function (n) { return n.text; }).join('\n');
  }

  // ---- the scope ----------------------------------------------------------
  //
  // The three subjects are LIFTED VERBATIM. Everything else is a stub, and
  // every stub is either inert chrome (the D-04 card, the input wiring) or a
  // recorder whose call is itself an assertion below.

  // ---- the REACH namespace, stubbed to the REAL shape ---------------------
  //
  // ⚠ 26.95-31, and it is a HARNESS GAP being closed rather than a product
  // change. Both painters lifted below now read `REACH.memory.notRelevant` —
  // the record of what she has said is not relevant, which withdraws an item
  // from EVERY librarian proposal (D-13). `REACH` is a real module-scope
  // namespace in app.js; this scope did not provide it, so the lift threw
  // `ReferenceError: REACH is not defined` and the whole group stopped at
  // its second assertion. ⛔ The repair belongs HERE and nowhere else: making
  // app.js defensive about its own namespace existing would weaken the
  // wiring to suit a test, which is the tail wagging the dog.
  //
  // THE SHAPE IS PINNED AGAINST app.js, NOT COPIED FROM IT BY EYE (group 0
  // below). A stub that carries only what today's slice happens to touch is
  // a gate that goes green while the room throws: the next person adds a
  // field to the real namespace, a painter reads it, and this harness never
  // notices. So the two rosters are asserted against the shipped declaration
  // on every run, and drift fails the suite with an instruction.
  // 26.95-35: `door` joins the roster — the door that opened the standing
  // Offer, which the walk-scoped why step turns on (map #50 / #99 r1).
  // 26.95-39: `slots` and `heldId` join it — the standing Offer's packed
  // slots, so an answer resolving outside the chassis closure can bring the
  // next picture, and the picture whose beat is still speaking (F-2, hers).
  const REACH_KEYS = ['ids', 'facet', 'seedId', 'spent', 'answered',
    'pendingId', 'memory', 'door', 'slots', 'heldId'];
  const REACH_MEMORY_KEYS = ['notRelevant', 'lastOfferMs', 'pending'];

  // Per-scope, never shared: two cases in one run must not see each other's
  // memory. `notRelevant` is settable so a case can drive the screen rather
  // than only prove the reference resolves — a stub that would pass with an
  // empty object is not evidence of anything.
  function newReach(opts) {
    return {
      ids: [],
      facet: null,
      seedId: null,
      spent: false,
      answered: {},
      pendingId: null,
      memory: {
        notRelevant: Array.isArray(opts.notRelevant) ? opts.notRelevant : [],
        lastOfferMs: typeof opts.lastOfferMs === 'number' ?
          opts.lastOfferMs : null,
        // the read itself. Never a promise in here: the harness paints
        // synchronously, and a pending read would be a clock in a suite that
        // deliberately owns none.
        pending: null
      },
      // 26.95-35: which door opened this Offer. Settable for the same reason
      // notRelevant is — a case must be able to drive the walk branch rather
      // than only prove the field resolves.
      door: typeof opts.door === 'string' ? opts.door : null,
      // 26.95-39: the page state of the standing Offer. Both default empty
      // and neither is read on any path this suite drives — they are here
      // because the roster above is asserted against the shipped declaration
      // on every run, which is the whole point of that pin.
      slots: Array.isArray(opts.slots) ? opts.slots : [],
      heldId: typeof opts.heldId === 'string' ? opts.heldId : null
    };
  }

  function makeScope(opts) {
    const calls = { joyful: [], ack: [], heavy: [] };
    const LIBRARIAN = { status: { available: opts.librarianOn !== false } };
    const ASK = Object.assign({
      open: false, text: '', busy: false, line: '', card: null,
      applying: false, suggest: null
    }, opts.ask || {});
    const REACH = newReach(opts);
    // eslint-disable-next-line no-new-func
    const build = new Function(
      'StudyCore', 'LIBRARIAN', 'ASK', 'REACH', 'document', 'Date', 'calls',
      [fnSrc('escapeHtml'), fnSrc('escapeAttr'), fnSrc('pileQuietStyle'),
        fnSrc('manageMetaLine'), fnSrc('librarianOn'),
        fnSrc('renderLibrarianSuggestions'), fnSrc('askPaintSuggest'),
        // 26.95-06 (#86 ruling 3): LIFTED VERBATIM, not stubbed. It is a
        // real dependency of both painters now — the rotation seed that
        // makes "a few per group, no show-more" rationing rather than a
        // lossy cap — and stubbing it here would mean this fence tested a
        // list that never rotates.
        fnSrc('suggestionRotation'),
        fnSrc('askPaintSpot')].join('\n') + '\n' +
      // -- the stubs, all inert or recording --------------------------------
      'function openLibrarianJoyful(id) { calls.joyful.push(id); }\n' +
      'function postLibrarianAck(id, took) { calls.ack.push([id, took]); }\n' +
      'function renderLibrarianHeavyConfirm(s, id) { calls.heavy.push(id); }\n' +
      'function readLibrarianSuggestions() {}\n' +
      'function askD04Ensure() {}\n' +
      'function askD04Card() { return null; }\n' +
      'function askD04ConfirmTap() {}\n' +
      'function askD04DeclineTap() {}\n' +
      'function askOpenTap() {}\n' +
      'function askSend() {}\n' +
      'function askCancelTap() {}\n' +
      'function askPaintCard() {}\n' +
      'function filterRowLabel() { return ""; }\n' +
      'var ASK_D04_HEAD = ""; var ASK_D04_TAIL = "";\n' +
      'var ASK_LABEL_OFF = "turn it off";\n' +
      'var ASK_DECLINE_COPY = "not now";\n' +
      'var ASK_PROMPT_COPY = "what should be different?";\n' +
      'var ASK_ARIA_COPY = "aria"; var ASK_SEND_COPY = "ask";\n' +
      'var ASK_CANCEL_COPY = "never mind";\n' +
      'var ASK_INVITE_COPY = "want the room to work differently? tell me.";\n' +
      'function askPlaceholder() { return "x"; }\n' +
      // the two subjects' own copy, LIFTED from app.js rather than retyped
      (/var SUGGEST_LEAD_IN = "[^"]*";/.exec(app) || [''])[0] + '\n' +
      (/var SUGGEST_EMPTY = "[^"]*";/.exec(app) || [''])[0] + '\n' +
      'return { paintSpot: askPaintSpot, paintSuggest: askPaintSuggest,' +
      ' renderRows: renderLibrarianSuggestions, ASK: ASK, REACH: REACH,' +
      ' calls: calls,' +
      ' LEAD: SUGGEST_LEAD_IN, EMPTY: SUGGEST_EMPTY };');
    // A FROZEN CLOCK that is still a real constructor: manageMetaLine builds
    // a Date from the item's own timestamp, so a `{ now: … }` object would
    // fail on `new Date(ms)` and the whole reply would go unrendered — which
    // several assertions here would then read as "nothing surfaced". D-02:
    // the room's clock privilege is not spent in a harness.
    function FrozenDate(ms) { return new Date(ms); }
    FrozenDate.now = function () { return FROZEN_MS; };
    // ⚠ THE ARGUMENT ORDER MIRRORS THE PARAMETER LIST ABOVE, POSITION FOR
    // POSITION. `new Function` binds by position and says nothing when the
    // two drift, so REACH sits fourth in both places or every name after it
    // silently receives the wrong value.
    return build(StudyCore, LIBRARIAN, ASK, REACH,
      { createElement: mkNode }, FrozenDate, calls);
  }

  // ---- fixtures -----------------------------------------------------------
  //
  // Ids are deliberately UNSORTED in the store so the lexicographic pin has
  // something to prove. The `why` on the heavy row carries angle brackets and
  // a quote, because that is the encoding edge.

  // THE DANGEROUS `why` GOES ON THE ROWS THAT ACTUALLY RENDER ONE. Caught by
  // driving it: the first draft put the angle brackets only on the HEAVY row,
  // which never renders a why at all — so "the why reached the DOM unescaped"
  // was unfalsifiable, and un-escaping the joyful row's why left this group
  // GREEN. The named defect class, inside the instrument built to catch it.
  const RAW_WHY = '<script>alert("x")</script>';
  // ...and the heavy row's why is a token that must appear NOWHERE, which is
  // a different claim and needs its own string to be checkable.
  const HEAVY_WHY = 'HEAVYWHYMUSTNOTRENDER';
  // THREE joyful ids, stored in the order b, c, a. Both facts are load-bearing
  // and both were learned by driving a mutation that should have failed:
  //   * with only TWO ids, `ids.sort()` and `ids.reverse()` produce the SAME
  //     array for this insertion order, so replacing the sort with a reverse
  //     left the ordering pin GREEN. Three ids in b/c/a order separate them.
  //   * `acked` needs a REAL item in the store, or the unknown-id guard
  //     excludes it and the acked assertion passes on the wrong guard —
  //     which is exactly what happened on the first driven run.
  function fixture() {
    return {
      items: {
        'b-two': { id: 'b-two', title: 'the second joyful one',
          type: 'text', state: 'blessed', source: 'notes',
          created_ms: Date.UTC(2026, 4, 2) },
        'c-three': { id: 'c-three', title: 'the third joyful one',
          type: 'text', state: 'blessed', source: 'notes',
          created_ms: Date.UTC(2026, 4, 7) },
        'a-one': { id: 'a-one', title: 'the first joyful one',
          type: 'text', state: 'blessed', source: 'notes',
          created_ms: Date.UTC(2026, 4, 1) },
        'acked': { id: 'acked', title: 'ALREADY TAKEN — MUST NOT RENDER',
          type: 'text', state: 'blessed', source: 'notes',
          created_ms: Date.UTC(2026, 4, 8) },
        'r-one': { id: 'r-one', title: 'a receipt', type: 'text',
          state: 'blessed', source: 'notes',
          created_ms: Date.UTC(2026, 4, 3) },
        'h-one': { id: 'h-one', title: 'THE HEAVY TITLE MUST NOT RENDER',
          type: 'text', state: 'blessed', source: 'notes',
          created_ms: Date.UTC(2026, 4, 4) },
        'fenced': { id: 'fenced', title: 'FENCED MUST NEVER RENDER',
          type: 'text', state: 'never_show', source: 'notes',
          created_ms: Date.UTC(2026, 4, 5) },
        'trig': { id: 'trig', title: 'TRIGGER MUST NEVER RENDER',
          type: 'text', state: 'blessed', trigger: true, source: 'notes',
          created_ms: Date.UTC(2026, 4, 6) }
      },
      filters: [],
      suggestions: { verdicts: {
        'b-two': { shelf: 'joyful', why: 'the light was good' },
        'c-three': { shelf: 'joyful', why: 'you kept this one' },
        'a-one': { shelf: 'joyful', why: RAW_WHY },
        'r-one': { shelf: 'receipts', why: RAW_WHY },
        'h-one': { shelf: 'heavy', why: HEAVY_WHY },
        'fenced': { shelf: 'joyful', why: 'must never be seen' },
        'trig': { shelf: 'joyful', why: 'must never be seen' },
        'acked': { shelf: 'joyful', why: 'done', acked: true },
        'ghost': { shelf: 'joyful', why: 'the store does not hold me' }
      } }
    };
  }

  const must = function (cond, msg) {
    if (!cond) { violations.push(L + ' ' + msg); }
    return cond;
  };

  // =========================================================================
  // 0. THE HARNESS'S REACH STUB IS PINNED TO THE SHIPPED NAMESPACE
  // =========================================================================
  //
  // Runs FIRST, deliberately: every group below paints through a scope that
  // carries this stub, so if the stub has drifted from app.js the failure
  // should be named here rather than surfacing as a puzzling absence three
  // groups later. The two rosters are read out of the shipped declaration on
  // every run — nothing here is a copy anyone has to remember to update.

  (function () {
    const at = app.indexOf('\n  var REACH = {');
    if (!must(at !== -1,
      'reach-stub: app.js no longer declares `var REACH = {` at module ' +
      'indent — the makeScope stub has nothing to be pinned against, and an ' +
      'unpinned stub drifts in silence')) { return; }
    const end = app.indexOf('\n  };', at);
    if (!must(end !== -1 && end > at,
      'reach-stub: the REACH declaration does not close at module indent — ' +
      'the lifted block would run past the namespace it claims to read')) {
      return;
    }
    const block = app.slice(at, end);
    // ⚠ COMMENTS ARE STRIPPED FIRST, AND THAT IS LOAD-BEARING. The shipped
    // declaration carries multi-line prose, and prose in this repo ends
    // clauses in colons — a key scan that read it would invent fields nobody
    // wrote and fail this group on the explanation rather than on the code.
    const code = block.split('\n')
      .filter(function (l) { return !/^\s*\/\//.test(l); })
      .map(function (l) { return l.replace(/\s\/\/.*$/, ''); })
      .join('\n');
    if (!must(code.split('\n').length > 3,
      'reach-stub: the lifted REACH declaration collapsed to ' +
      code.split('\n').length + ' line(s) — a roster comparison against a ' +
      'sliver is the degenerate that makes this whole group vacuous')) {
      return;
    }
    const real = [];
    const keyRe = /^\s{4}([A-Za-z_$][\w$]*):/gm;
    let m;
    while ((m = keyRe.exec(code)) !== null) { real.push(m[1]); }
    must(JSON.stringify(real) === JSON.stringify(REACH_KEYS),
      'reach-stub: app.js\'s REACH carries ' + JSON.stringify(real) +
      ' and the harness stub carries ' + JSON.stringify(REACH_KEYS) + '. ' +
      'Update REACH_KEYS and newReach TOGETHER and deliberately — a stub ' +
      'missing a field the painters have started reading throws in the room ' +
      'and passes here, which is the exact gap this pin closes');
    const mem = /memory:\s*\{([^}]*)\}/.exec(code);
    if (!must(!!mem,
      'reach-stub: REACH.memory is no longer a one-line object literal — ' +
      'the memory roster cannot be read, so it cannot be pinned')) { return; }
    const memKeys = (mem[1].match(/([A-Za-z_$][\w$]*)\s*:/g) || [])
      .map(function (s) { return s.replace(/\s*:$/, ''); });
    must(JSON.stringify(memKeys) === JSON.stringify(REACH_MEMORY_KEYS),
      'reach-stub: REACH.memory carries ' + JSON.stringify(memKeys) +
      ' and the stub carries ' + JSON.stringify(REACH_MEMORY_KEYS) + ' — ' +
      'the librarian\'s two memories and the read itself. Same rule as above');
  })();

  // =========================================================================
  // 0b. D-13 — THE RECORD SCREENS THE PROPOSAL, DRIVEN THROUGH BOTH PAINTERS
  // =========================================================================
  //
  // ⚠ THIS IS WHAT MAKES THE STUB ABOVE LOAD-BEARING, and it is here for
  // exactly that reason. A stub that merely EXISTS — an empty object, or a
  // `memory` with nothing in it — resolves the reference and lets every
  // other group in this file go green while the screen does nothing at all.
  // A reference that resolves is not a behaviour that works.
  //
  // So the record is DRIVEN, in both directions and through BOTH painters:
  // one id withdrawn must vanish from the rows and take nothing else with
  // it; every id withdrawn must turn the ask reply into the shipped empty
  // line. Each half carries its own CONTROL, because "b-two is absent" is
  // equally true of a fixture that rendered nothing whatsoever.

  (function () {
    const f = fixture();

    // (i) THE CONTROL — with an empty memory the row is there.
    const open = makeScope({});
    const slotA = mkNode('div');
    open.renderRows(slotA, f.items, f.filters, f.suggestions);
    if (!must(slotA.innerHTML.indexOf('b-two') !== -1,
      'd13/screen (i) CONTROL: with nothing withdrawn, the row for b-two ' +
      'did not render at all — the absence asserted below would then be ' +
      'true for the wrong reason')) { return; }

    // (ii) withdraw ONE id: it goes, and only it.
    const one = makeScope({ notRelevant: ['b-two'] });
    const slotB = mkNode('div');
    one.renderRows(slotB, f.items, f.filters, f.suggestions);
    must(slotB.innerHTML.indexOf('b-two') === -1,
      'd13/screen (ii): b-two is in the not-relevant record and its row ' +
      'rendered anyway. Saying not relevant withdraws that item from EVERY ' +
      'librarian proposal, permanently, and this list is one of the two');
    must(slotB.innerHTML.indexOf('a-one') !== -1 &&
      slotB.innerHTML.indexOf('c-three') !== -1,
      'd13/screen (ii): withdrawing b-two also took a-one or c-three — the ' +
      'screen must remove exactly what she named and nothing beside it');

    // (iii) THE OTHER PAINTER, and the other direction. This is the half
    // that threw before the stub existed.
    collected.nodes = []; collected.html = [];
    const all = makeScope({
      notRelevant: ['a-one', 'b-two', 'c-three', 'r-one', 'h-one'],
      ask: { suggest: { items: f.items, filters: f.filters,
        suggestions: f.suggestions } }
    });
    const slotC = mkNode('div');
    all.paintSuggest(slotC);
    const textsC = slotC.kids.map(function (k) { return k.text; }).join('|');
    must(textsC.indexOf(all.EMPTY) !== -1,
      'd13/screen (iii): every id the notebook holds is withdrawn and the ' +
      'ask reply did not fall to the shipped empty line — it said ' +
      JSON.stringify(textsC));
    must(textsC.indexOf(all.LEAD) === -1,
      'd13/screen (iii): the reply still leads in as though it had things ' +
      'to set out. A fully withdrawn cohort is an empty cohort');

    // ...and (iii)'s own control, through the SAME painter.
    collected.nodes = []; collected.html = [];
    const some = makeScope({ ask: { suggest: { items: f.items,
      filters: f.filters, suggestions: f.suggestions } } });
    const slotD = mkNode('div');
    some.paintSuggest(slotD);
    const textsD = slotD.kids.map(function (k) { return k.text; }).join('|');
    must(textsD.indexOf(some.LEAD) !== -1,
      'd13/screen (iii) CONTROL: with nothing withdrawn the same painter ' +
      'did not lead in — then (iii) above would pass on a painter that ' +
      'renders the empty line no matter what it is given');
  })();

  // =========================================================================
  // 1. LAW 1, POSITIVELY — the painted surface, in BOTH directions
  // =========================================================================

  (function () {
    collected.nodes = []; collected.html = [];
    const before = makeScope({});
    const spotA = mkNode('div');
    before.paintSpot(spotA);
    const paintedBefore = painted();
    must(paintedBefore.indexOf(before.LEAD) === -1,
      'law-1 BEFORE: the ask surface painted with NO sentence submitted ' +
      'already carries the lead-in "' + before.LEAD + '". Nothing may wait ' +
      'in the chat on open — law 1 is absolute and D-08 accepted the ' +
      'discoverability cost rather than soften it');
    must(paintedBefore.indexOf('librarian-joyful') === -1 &&
      paintedBefore.indexOf('librarian-row') === -1,
      'law-1 BEFORE: a suggestion row is already in the DOM with no ' +
      'sentence submitted — that is unprompted surfacing, which law 1 ' +
      'forbids outright');

    collected.nodes = []; collected.html = [];
    const f = fixture();
    const after = makeScope({ ask: { suggest: {
      items: f.items, filters: f.filters, suggestions: f.suggestions } } });
    const spotB = mkNode('div');
    after.paintSpot(spotB);
    const paintedAfter = painted();
    // THE AFTER HALF IS THE POSITIVE CONTROL. Without it, "nothing was
    // found" is equally true of a reply that never renders at all.
    must(paintedAfter.indexOf(after.LEAD) !== -1,
      'law-1 AFTER: she asked and the surface did NOT render the lead-in. ' +
      'The before half above is then vacuous — it would pass just as well ' +
      'on a reply that is simply broken');
    must(paintedAfter.indexOf('librarian-row') !== -1,
      'law-1 AFTER: she asked and no suggestion row rendered — law 7 has ' +
      'no proposing surface, which is the whole thing this plan restores');
  })();

  // =========================================================================
  // 2. LAW 1, THE CUE BAN (source scan — window stated and pinned non-empty)
  // =========================================================================
  //
  // The harness cannot paint the room, so this half is a scan. Its WINDOW is
  // comment-stripped app.js, and the window is asserted non-empty first: a
  // ban over nothing passes forever.

  (function () {
    const stripped = app
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ')
      .replace(/([^:])\/\/.*$/gm, '$1');
    /* ⚠ 26.91-35: RE-KEYED OFF COMMENT VOLUME — the SECOND instance of this
       exact proxy in the tree, and the second to trip on the same wave. It
       read `stripped.length > app.length * 0.5`. MEASURED at the head of wave
       35, before a source byte moved: raw 887,405, stripped 444,134 — ratio
       0.50049, HEADROOM 431 CHARACTERS. This repo's house style writes a
       multi-hundred-character comment block at EVERY change site, so app.js's
       comment share rises monotonically and BOTH copies of this floor were
       about one change site from tripping. Wave 35's two source comments
       consumed the headroom and took two suites down on a control that has
       nothing to say about the ban it guards.

       RE-KEYED TO WHAT IT IS FOR, AND STRICTLY STRONGER: an ABSOLUTE floor,
       plus the window must still contain `function renderStation(id) {` — the
       registry the painter lift below depends on. A stripper that ate CODE
       and kept comments leaves a LARGE window and a meaningless one, which
       passes the old ratio form and fails this one. Neither half is coupled
       to how many comments the file carries. The two stronger siblings below
       — *the stripper must actually strip* and the BY-VALUE reference count —
       are unchanged and still binding. */
    if (!must(stripped.length > 100000,
      'cue-ban: the comment-stripped window is ' + stripped.length +
      ' chars (raw ' + app.length + '); the absolute floor is 100,000 — the ' +
      'window collapsed, so every ban under it is vacuous')) { return; }
    if (!must(stripped.indexOf('function renderStation(id) {') !== -1,
      'cue-ban: the comment-stripped window no longer contains ' +
      '`function renderStation(id) {` — the registry the painter lift below ' +
      'reads. A stripper that ate CODE rather than comments leaves a large ' +
      'window and a meaningless one, which is exactly what a size-only ' +
      'floor cannot see')) { return; }
    // ...and the stripper must actually strip, or the "window" is the file.
    must(stripped.length < app.length,
      'cue-ban: the comment stripper removed nothing at all — it is not a ' +
      'window, it is the file, and a comment naming the selector would ' +
      'satisfy the ban below');

    const hits = (stripped.match(/selectLibrarianSuggestions/g) || []).length;
    must(hits === 2,
      'cue-ban: comment-stripped app.js references ' +
      'selectLibrarianSuggestions ' + hits + ' times — pinned BY VALUE at ' +
      '2 (renderLibrarianSuggestions, and the ask reply). A third live ' +
      'reference is a third surface drawing the cohort, and the one place ' +
      'it must never be drawn is anywhere she did not ask');

    // NONE of them may sit inside a room painter. The painter names are
    // LIFTED from the shipped registry, never hand-typed, so a painter added
    // later is covered without anyone remembering to add it here.
    const reg = /function renderStation\(id\) \{[\s\S]*?\n {4}\};/.exec(app);
    if (!must(!!reg, 'cue-ban: the station painter registry could not be ' +
      'read — the ban has no list of painters to check against')) { return; }
    const painters = (reg[0].match(/:\s*(render[A-Za-z]+Station)/g) || [])
      .map(function (s) { return s.replace(/^:\s*/, ''); });
    if (!must(painters.length >= 4,
      'cue-ban: only ' + painters.length + ' station painters were lifted ' +
      'out of the registry — pinned at 4 or more since 26.91-04 took it ' +
      '5 -> 4; a shorter list means the scan checks almost nothing')) {
      return;
    }
    painters.concat(['renderRoom', 'initRoom']).forEach(function (name) {
      const body = fnSrc(name);
      if (body === null) { return; }
      ['selectLibrarianSuggestions', 'SUGGEST_LEAD_IN', 'SUGGEST_EMPTY']
        .forEach(function (tok) {
          if (body.indexOf(tok) !== -1) {
            violations.push(L + ' cue-ban: "' + name + '" — a painter that ' +
              'runs without her asking — references ' + tok + '. That is a ' +
              'room-surface cue for the suggested cohort, and D-08 declined ' +
              'every one of them: no badge, no count, no dot, no hint');
          }
        });
    });
    // index.html carries no cue either — a marked-up badge needs no painter.
    const html = readSource('index.html');
    ['SUGGEST_LEAD_IN', 'SUGGEST_EMPTY', 'suggest-badge', 'ask-suggest-cue']
      .concat([(/var SUGGEST_LEAD_IN = "([^"]*)";/.exec(app) || [, 'x'])[1]])
      .forEach(function (tok) {
        if (html.indexOf(tok) !== -1) {
          violations.push(L + ' cue-ban: index.html carries "' + tok + '" — ' +
            'a cue in static markup needs no painter to appear on open');
        }
      });
  })();

  // =========================================================================
  // 3. LAW 1, THE COPY BAN — run the SHIPPED matcher, never a retyped list
  // =========================================================================

  (function () {
    const noPush = readSource('tests/test_no_push.cjs');
    const block = /const FORBIDDEN_TOKENS = \[([\s\S]*?)\n\];/.exec(noPush);
    if (!must(!!block, 'copy-ban: FORBIDDEN_TOKENS could not be lifted from ' +
      'tests/test_no_push.cjs — the ban vocabulary would have to be ' +
      'retyped, and a retyped list passes forever while the shipped one ' +
      'grows')) { return; }
    let tokens;
    try {
      // eslint-disable-next-line no-new-func
      tokens = new Function('return [' + block[1] + '];')();
    } catch (e) {
      violations.push(L + ' copy-ban: FORBIDDEN_TOKENS did not evaluate (' +
        e.message + ')');
      return;
    }
    if (!must(tokens.length >= 9, 'copy-ban: only ' + tokens.length +
      ' forbidden tokens were lifted — the shipped list carries nine, so a ' +
      'shorter one means the matcher below is checking almost nothing')) {
      return;
    }
    // POSITIVE CONTROL: the lifted matcher must actually match something.
    const control = tokens.some(function (t) {
      return t.re.test('setInterval(fn, 1000)');
    });
    must(control, 'copy-ban: the lifted matcher did not fire on an obvious ' +
      'violation ("setInterval(") — it is not a matcher, and every clean ' +
      'result under it means nothing');
    [(/var SUGGEST_LEAD_IN = "([^"]*)";/.exec(app) || [, ''])[1],
      (/var SUGGEST_EMPTY = "([^"]*)";/.exec(app) || [, ''])[1]]
      .forEach(function (s) {
        tokens.forEach(function (t) {
          if (t.re.test(s)) {
            violations.push(L + ' copy-ban: "' + s + '" carries the ' +
              'law-1 token "' + t.name + '" — the new copy is held to the ' +
              'same pull-only vocabulary as every other string in the room');
          }
        });
      });
  })();

  // =========================================================================
  // 4. LAW 7 — the click changes NOTHING, and it really did reach the handler
  // =========================================================================

  (function () {
    const f = fixture();
    const scope = makeScope({});
    const slot = mkNode('div');
    const beforeStore = JSON.stringify(f.items);
    scope.renderRows(slot, f.items, f.filters, f.suggestions);
    const joyful = slot.querySelectorAll('.librarian-joyful');
    // POSITIVE CONTROL FIRST: with no parsed button the store is trivially
    // unchanged and the law-7 assertion below proves nothing whatsoever.
    if (!must(joyful.length === 3, 'law-7: the harness parsed ' +
      joyful.length + ' joyful buttons out of the painted rows, expected 3 ' +
      '— with none parsed, "the store did not change" is true because ' +
      'nothing was clicked')) { return; }
    joyful[0].fire('click');
    must(JSON.stringify(f.items) === beforeStore,
      'law-7: opening a suggested row CHANGED the item store. The librarian ' +
      'proposes and only she promotes — a row that acks, blesses or shelves ' +
      'on open is the librarian disposing');
    // ...and the POSITIVE half: a handler wired to nothing also leaves the
    // store alone, so the click must be shown to have arrived somewhere.
    must(scope.calls.joyful.length === 1 &&
      scope.calls.joyful[0] === joyful[0].getAttribute('data-id'),
      'law-7: the click did not reach openLibrarianJoyful with the row\'s ' +
      'own id (recorded: ' + JSON.stringify(scope.calls.joyful) + '). A dead ' +
      'handler passes the no-change half of this pair for the wrong reason');
  })();

  // =========================================================================
  // 5. THE SIX PROBE EDGES (SRM-11-EXT-SUGGEST) — one named block each
  // =========================================================================

  // -- empty: three degenerate inputs, asserted SEPARATELY -----------------
  (function () {
    const f = fixture();
    // (i) an empty cohort
    collected.nodes = []; collected.html = [];
    const s1 = makeScope({ ask: { suggest: { items: f.items,
      filters: f.filters, suggestions: { verdicts: {} } } } });
    const n1 = mkNode('div');
    s1.paintSuggest(n1);
    const t1 = n1.kids.map(function (k) { return k.text; }).join('|');
    must(t1.indexOf(s1.EMPTY) !== -1,
      'edge/empty (i): an empty cohort rendered ' + JSON.stringify(t1) +
      ' instead of the shipped empty line "' + s1.EMPTY + '"');
    must(t1.indexOf(s1.LEAD) === -1,
      'edge/empty (i): an empty cohort rendered the LEAD-IN as well — the ' +
      'reply must be one line or the other, never a half-composed pair');
    must(n1.kids.length === 1,
      'edge/empty (i): the empty reply appended ' + n1.kids.length +
      ' nodes, expected exactly 1 — an empty row container is still a ' +
      'surface, and there is nothing to put in it');

    // (ii) the librarian is OFF
    collected.nodes = []; collected.html = [];
    const s2 = makeScope({ librarianOn: false, ask: { suggest: {
      items: f.items, filters: f.filters, suggestions: f.suggestions } } });
    const n2 = mkNode('div');
    s2.paintSuggest(n2);
    must(n2.kids.length === 0 && n2.innerHTML === '',
      'edge/empty (ii): with the librarian OFF the slot is not clear — it ' +
      'held ' + n2.kids.length + ' node(s) and html ' +
      JSON.stringify(n2.innerHTML) + '. The shipped librarianOn() early ' +
      'return renders NEITHER line');

    // (iii) a FAILED ask never reaches the reply at all: with no suggest
    // slice the painter clears rather than composing half a reply.
    collected.nodes = []; collected.html = [];
    const s3 = makeScope({ ask: { suggest: null } });
    const n3 = mkNode('div');
    s3.paintSuggest(n3);
    must(n3.kids.length === 0 && n3.innerHTML === '',
      'edge/empty (iii): with no reply slice (the shape a failed ask ' +
      'leaves) the painter rendered something — a failure must keep the ' +
      'shipped refusal register, never a half-composed reply');
    // the shipped failure beat clears the slice, so the two agree.
    const failed = fnSrc('askFailed');
    must(failed !== null && failed.indexOf('ASK.suggest = null') !== -1,
      'edge/empty (iii): askFailed does not clear ASK.suggest — a failed ' +
      'ask would repaint the PREVIOUS reply under the failure line');
  })();

  // -- adjacency: the three boundary verdicts, all DRIVEN -------------------
  (function () {
    const f = fixture();
    const rows = StudyCore.selectLibrarianSuggestions(
      f.items, f.filters, f.suggestions, FROZEN_MS);
    const ids = rows.map(function (r) { return r.item.id; });
    must(ids.indexOf('r-one') !== -1,
      'edge/adjacency: a verdict whose shelf EXACTLY equals a group name ' +
      '("receipts") did not join that group — got ' + JSON.stringify(ids));
    must(ids.indexOf('acked') === -1,
      'edge/adjacency: an acked verdict rendered — an acked suggestion is ' +
      'done, and re-offering it is the room asking twice');
    must(ids.indexOf('ghost') === -1,
      'edge/adjacency: a verdict naming an id the store does not hold ' +
      'rendered — a hand-edited notebook must never conjure a row');
    // the fence half, inherited: two fenced ids in the same fixture.
    must(ids.indexOf('fenced') === -1 && ids.indexOf('trig') === -1,
      'edge/adjacency: a never-show or trigger-marked item reached the ' +
      'reply (' + JSON.stringify(ids) + '). The selector\'s first move is ' +
      'surfacePool and THAT is the whole law-5 argument for D-07');
  })();

  // -- ordering: grouped, then id-lexicographic, and byte-identical twice ---
  (function () {
    const f = fixture();
    const one = StudyCore.selectLibrarianSuggestions(
      f.items, f.filters, f.suggestions, FROZEN_MS);
    const two = StudyCore.selectLibrarianSuggestions(
      f.items, f.filters, f.suggestions, FROZEN_MS);
    must(JSON.stringify(one) === JSON.stringify(two),
      'edge/ordering: two invocations over the same store were not ' +
      'byte-identical — the reply is not deterministic');
    const shelves = one.map(function (r) { return r.shelf; });
    const GROUPS = ['joyful', 'receipts', 'heavy'];
    const seen = [];
    shelves.forEach(function (s) {
      if (seen[seen.length - 1] !== s) { seen.push(s); }
    });
    must(JSON.stringify(seen) === JSON.stringify(GROUPS),
      'edge/ordering: the group order is ' + JSON.stringify(seen) +
      ' and the pin is ' + JSON.stringify(GROUPS) + ' BY VALUE — the ' +
      'joyful group leads because that is the one she is most likely to ' +
      'want, and heavy comes last because it is the one to walk past');
    const joyfulIds = one.filter(function (r) { return r.shelf === 'joyful'; })
      .map(function (r) { return r.item.id; });
    must(JSON.stringify(joyfulIds) ===
      JSON.stringify(['a-one', 'b-two', 'c-three']),
      'edge/ordering: inside a group the ids are ' +
      JSON.stringify(joyfulIds) + ', not id-lexicographic. The fixture ' +
      'stores them b/c/a on purpose: THREE ids in that order separate a ' +
      'sort from a reverse and from insertion order, so none of the three ' +
      'can pass here by coincidence (two ids could, and did)');
  })();

  // -- encoding: the model's `why` is untrusted output ----------------------
  (function () {
    const f = fixture();
    const scope = makeScope({});
    const slot = mkNode('div');
    scope.renderRows(slot, f.items, f.filters, f.suggestions);
    const html = slot.innerHTML;
    must(html.indexOf(RAW_WHY) === -1 && html.indexOf('<script>') === -1,
      'edge/encoding: the model\'s `why` reached the DOM UNESCAPED — it is ' +
      'untrusted output on a front-facing surface, and it sits on BOTH the ' +
      'joyful and the receipts row in this fixture so neither sink can be ' +
      'the one that got it wrong unnoticed');
    // POSITIVE CONTROL, and it is what makes the ban above falsifiable: the
    // dangerous why must really have been RENDERED, escaped. Placed on the
    // two row types that show a why, never only on the heavy row that
    // structurally shows none.
    const escaped = (html.match(/&lt;script&gt;/g) || []).length;
    must(escaped === 2,
      'edge/encoding: found ' + escaped + ' escaped `why` renderings, ' +
      'expected 2 (one joyful row, one receipts row). Fewer means the ban ' +
      'above is passing on a surface that renders no why at all');
    must(html.indexOf('&quot;') !== -1 || html.indexOf('&#39;') !== -1 ||
      html.indexOf('&amp;') !== -1 || escaped === 2,
      'edge/encoding: no entity escaping of any kind was found');
    // POSITIVE CONTROL: the escaper really does move angle brackets.
    must(StudyCore.escapeHtml('<b>') === '&lt;b&gt;',
      'edge/encoding: StudyCore.escapeHtml no longer escapes angle ' +
      'brackets — every escaping assertion above is then vacuous');
    // HEAVY ROWS CARRY METADATA ONLY.
    const heavyStart = html.indexOf('librarian-heavy');
    must(heavyStart !== -1,
      'edge/encoding: no heavy row rendered — the heavy assertions below ' +
      'have no subject');
    must(html.indexOf('THE HEAVY TITLE MUST NOT RENDER') === -1,
      'edge/encoding: a heavy row rendered its item TITLE. Err toward ' +
      'holding back — heavy rows carry metadata only, never the title, ' +
      'never a quote');
    must(html.indexOf(HEAVY_WHY) === -1,
      'edge/encoding: a heavy row rendered its `why` (' + HEAVY_WHY + '). ' +
      'The whole point of the heavy group is that nothing about the item ' +
      'itself is shown — metadata only, never the title, never a quote');
    // ...and the metadata line it DOES carry is the shipped one.
    must(html.indexOf('notes · ') !== -1,
      'edge/encoding: the heavy row shows no manageMetaLine metadata at ' +
      'all — then "it shows only metadata" is true of a row showing nothing');
  })();

  // -- idempotency: asking twice consumes nothing ---------------------------
  (function () {
    const f = fixture();
    const beforeItems = JSON.stringify(f.items);
    const beforeVerdicts = JSON.stringify(f.suggestions);
    const scope = makeScope({});
    const s1 = mkNode('div');
    scope.renderRows(s1, f.items, f.filters, f.suggestions);
    const s2 = mkNode('div');
    scope.renderRows(s2, f.items, f.filters, f.suggestions);
    must(s1.innerHTML === s2.innerHTML && s1.innerHTML.length > 0,
      'edge/idempotency: two asks in a row produced different rows (or no ' +
      'rows at all) — asking is a read, and a read that changes its own ' +
      'answer is a read that consumed something');
    must(JSON.stringify(f.items) === beforeItems,
      'edge/idempotency: the item store changed across two asks');
    must(JSON.stringify(f.suggestions) === beforeVerdicts,
      'edge/idempotency: the librarian\'s notebook changed across two ' +
      'asks — nothing is acked, consumed or stamped by ASKING; only her ' +
      'own tap stamps a verdict');
    must(scope.calls.ack.length === 0,
      'edge/idempotency: rendering the reply posted an ack (' +
      JSON.stringify(scope.calls.ack) + ') — painting is not taking');
  })();

  // -- concurrency: the cascade is PURE, so two asks cannot make a third ----
  (function () {
    // The I/O scan is PLAIN SUBSTRING COUNTING, not a regex threaded through
    // two escaping layers. The first draft of this driver died on its own
    // backslashes and reported "the driver did not run" — an instrument that
    // fails to execute is not an instrument that found nothing.
    const out = spawnSync('python3', ['-c',
      'import sys, json, inspect\n' +
      'sys.path.insert(0, ' + JSON.stringify(ROOT) + ')\n' +
      'import server\n' +
      'topics = list(server.ASK_TOPICS)\n' +
      'fwd = [server._config_disposition([], t) for t in topics]\n' +
      'rev = [server._config_disposition([], t) for t in reversed(topics)]\n' +
      'rev.reverse()\n' +
      'src = inspect.getsource(server._config_disposition)\n' +
      // 26.93-07: the twin of the [d21-override] list above — same function,
      // same claim, same model-call token. Moved in the same edit.
      'toks = ["load_store(", "save_store(", "call_librarian(",\n' +
      '        "open(", "time.", "datetime", "json.load", "random."]\n' +
      'io = sum(src.count(t) for t in toks)\n' +
      // the scan must be able to FIND something, or a zero means nothing
      'ctrl = ("import sys\\nopen(1)".count("open("))\n' +
      'print(json.dumps({"fwd": fwd, "rev": rev, "io": io,\n' +
      '                  "ctrl": ctrl, "n": len(topics)}))'
    ], { encoding: 'utf8' });
    if (!must(out.status === 0, 'edge/concurrency: the python driver did ' +
      'not run (' + String(out.stderr || '').slice(0, 200) + ')')) { return; }
    let r;
    try { r = JSON.parse(String(out.stdout).trim().split('\n').pop()); }
    catch (e) {
      violations.push(L + ' edge/concurrency: unreadable driver output');
      return;
    }
    if (!must(r.n >= 18, 'edge/concurrency: only ' + r.n + ' topics were ' +
      'driven through the cascade — the vocabulary collapsed and every ' +
      'comparison below is over almost nothing')) { return; }
    must(JSON.stringify(r.fwd) === JSON.stringify(r.rev),
      'edge/concurrency: the cascade gave different verdicts when the same ' +
      'topics were driven in the opposite order — it is not pure, so two ' +
      'concurrent asks could interleave into a third answer');
    must(r.io === 0,
      'edge/concurrency: _config_disposition\'s body carries ' + r.io +
      ' store/file/clock token(s). PURE BY CONTRACT means same arguments, ' +
      'same verdict — the new D-07 branch must not have spent that');
    must(r.ctrl === 1,
      'edge/concurrency: the I/O scan could not find "open(" in a string ' +
      'that plainly contains it — the zero above means nothing at all');
    must(r.fwd[r.n - 1] !== undefined,
      'edge/concurrency: the driven verdict list is short of its own count');
    // ...and the driven verdicts must actually SAY something: an all-unmapped
    // list would satisfy every comparison above.
    must(r.fwd.indexOf('surface_suggestions') !== -1,
      'edge/concurrency: no topic in the whole shipped vocabulary drove to ' +
      'surface_suggestions — the branch this plan added is unreachable');
  })();
})();

// ---------------------------------------------------------------------------
// (8) 26.95-34 (D-16) — THE ASK REACHES THE VALIDATOR, AND THE WIDENING IS
//     BOUNDED
// ---------------------------------------------------------------------------
//
// D-16 exists because "smaller blessing batches" — her own example ask,
// recorded as 26.87's D-35.4 — answered "that's past what i can change." Making
// that sentence false is not one edit but a CHAIN, and every link is silent
// when it breaks:
//
//   the key leaves NOT_A_CAPABILITY  →  the ask document describes its value
//   class  →  the schema lets the model emit one  →  validate_config_proposal
//   finds a registered validator and CONSULTS it  →  the write path refuses an
//   illegal value and stores a legal one.
//
// Miss the fourth link and `_validate is None` DROPS the change: the ask names
// the key, never reaches it, and every command in the plan still passes. That
// is the failure this block is written to make loud.
//
// ⚠ IT ASSERTS ON OBJECTS, NOT ON SOURCE TEXT. Every claim below is read off
// the imported module — memberships, validator IDENTITY, the built document,
// the parsed schema, and a real POST /api/meta against a temp store — so no
// comment, commented-out line or lookalike literal can satisfy it. The one
// exception is the two app.js pins at the end, and those strip comments first
// and say so.
//
// ⚠ NOTHING HERE CAN REACH A PROVIDER, AND THAT IS ASSERTED RATHER THAN
// ASSUMED: the child swaps HOME before importing anything, pops every name in
// librarian_call.KEY_ENV_NAMES, replaces the transport with a function that
// raises, and reports all three back as booleans. It touches localhost and the
// filesystem under a temp directory, and nothing else.
//
// ⚠ AND IT CARRIES A CONTROL. A key that is genuinely still in
// NOT_A_CAPABILITY must still receive the BYTE-IDENTICAL capability-gap
// sentence. Without that, "the line no longer fires" would also be satisfied by
// having silenced the line for everyone, which is the opposite of the ruling.

(function () {
  const KEY = 'blessing_batch_size';
  const CONTROL_TOPIC = 'room_lighting';
  const L8 = '[batch]';

  const driver = [
    'import json, os, sys, tempfile, threading',
    'import http.client',
    'from pathlib import Path',
    'repo = ' + JSON.stringify(ROOT),
    '_home = tempfile.mkdtemp()',
    // HOME moves BEFORE the app is imported, so nothing this child can reach
    // resolves to the owner's own settings or credential file.
    'os.environ["HOME"] = _home',
    'os.environ["USERPROFILE"] = _home',
    'sys.path.insert(0, repo)',
    'import librarian_call as L',
    // the key NAMES come from the seam's own table — never re-spelled here.
    'for _n in list(L.KEY_ENV_NAMES.values()):',
    '    os.environ.pop(_n, None)',
    'def _no_network(*a, **k):',
    '    raise AssertionError("this block may not reach a provider")',
    'L._transport = _no_network',
    'import server, study_lib',
    'KEY = ' + JSON.stringify(KEY),
    'out = {}',
    'out["hermetic"] = {',
    '    "transport_blocked": L._transport is _no_network,',
    '    "keys_under_temp_home": os.path.realpath(str(L.keys_path()))',
    '        .startswith(os.path.realpath(_home) + os.sep),',
    '    "keys_visible": any(bool((os.environ.get(n) or "").strip())',
    '                        for n in L.KEY_ENV_NAMES.values())}',
    '',
    '# ---- memberships, read off the module ------------------------------',
    'out["in_configurable"] = KEY in server.CONFIGURABLE_KEYS',
    'out["in_proposable"] = KEY in server.MODEL_PROPOSABLE_KEYS',
    'out["in_validators"] = KEY in server._CONFIG_KEY_VALIDATORS',
    'out["in_not_a_capability"] = KEY in server.NOT_A_CAPABILITY',
    'out["in_ask_topics"] = KEY in server.ASK_TOPICS',
    'out["validator_identity"] = (server._CONFIG_KEY_VALIDATORS.get(KEY)',
    '                             is server.validate_blessing_batch_size)',
    'out["bounds"] = [server.BLESSING_BATCH_MIN, server.BLESSING_BATCH_MAX,',
    '                 server.BLESSING_BATCH_DEFAULT]',
    '',
    '# ---- the validator is CONSULTED, not merely registered --------------',
    'seen = []',
    'real = server._CONFIG_KEY_VALIDATORS[KEY]',
    'def recorder(data):',
    '    seen.append(dict(data))',
    '    return real(data)',
    'server._CONFIG_KEY_VALIDATORS[KEY] = recorder',
    'try:',
    '    ok, cleaned, why = server.validate_config_proposal(',
    '        {"changes": [{"key": KEY, "to": 4, "says": ""}],',
    '         "disposition": "configurable", "topic": "other"})',
    '    out["consulted"] = seen',
    '    out["kept_legal"] = cleaned["changes"] if ok else None',
    'finally:',
    '    server._CONFIG_KEY_VALIDATORS[KEY] = real',
    'ok2, cleaned2, why2 = server.validate_config_proposal(',
    '    {"changes": [{"key": KEY, "to": server.BLESSING_BATCH_MAX + 1,',
    '                  "says": ""}],',
    '     "disposition": "configurable", "topic": "other"})',
    'out["kept_out_of_range"] = cleaned2["changes"] if ok2 else None',
    '',
    '# ---- the verdict cascade, and the CONTROL ---------------------------',
    'ch = [{"key": KEY, "to": 4, "says": ""}]',
    'out["disp_change_any_topic"] = server._config_disposition(ch, "other")',
    'out["disp_change_gap_topic"] = server._config_disposition(',
    '    ch, ' + JSON.stringify(CONTROL_TOPIC) + ')',
    'out["disp_control"] = server._config_disposition(',
    '    [], ' + JSON.stringify(CONTROL_TOPIC) + ')',
    'out["refusal_configurable"] = server.CONFIG_REFUSAL_MSGS.get(',
    '    "configurable")',
    'out["refusal_control"] = server.CONFIG_REFUSAL_MSGS.get(',
    '    "not_a_capability")',
    'out["gap_literal"] = server.CONFIG_NOT_A_CAPABILITY_MSG',
    '',
    '# ---- the ask document, and the bound on the widening ----------------',
    'def doc(meta):',
    '    return json.loads(server.build_config_ask_doc(meta, "smaller pass"))',
    'rows = doc({})["settings"]',
    'out["row_keys"] = [r["key"] for r in rows]',
    'out["row_fields"] = sorted({k for r in rows for k in r})',
    'out["batch_row"] = next((r for r in rows if r["key"] == KEY), None)',
    'out["now_stored"] = next(r for r in doc({KEY: 7})["settings"]',
    '                         if r["key"] == KEY)["now"]',
    'out["now_illegal"] = next(',
    '    r for r in doc({KEY: server.BLESSING_BATCH_MAX + 1})["settings"]',
    '    if r["key"] == KEY)["now"]',
    'out["boolean_rows"] = len([r for r in rows if r["type"] == "boolean"])',
    'out["classes"] = {"bool": list(server._CONFIG_BOOLEAN_KEYS),',
    '                  "enum": list(server._CONFIG_ENUM_KEYS),',
    '                  "int": list(server._CONFIG_BOUNDED_INT_KEYS),',
    '                  "device": list(server._CONFIG_DEVICE_KEYS)}',
    'out["undeclared_row"] = server._config_ask_row({}, "habit_anchor")',
    'out["effective_bool_on_int_key"] = server._config_effective_bool(',
    '    {KEY: 7}, KEY)',
    '',
    '# ---- the shape a provider has to accept -----------------------------',
    'sch = json.loads(server.CONFIG_SCHEMA_JSON)',
    'out["to_types"] = (sch["properties"]["changes"]["items"]',
    '                   ["properties"]["to"]["type"])',
    'out["root_type"] = sch.get("type")',
    'def _closed(node, acc):',
    '    if isinstance(node, dict):',
    '        if node.get("type") == "object":',
    '            acc.append(node.get("additionalProperties"))',
    '        for v in node.values():',
    '            _closed(v, acc)',
    '    elif isinstance(node, list):',
    '        for v in node:',
    '            _closed(v, acc)',
    '    return acc',
    'out["closed_objects"] = _closed(sch, [])',
    '',
    '# ---- the live write path: refused with the range, NOTHING stored -----',
    'tmp = tempfile.TemporaryDirectory()',
    'lib = Path(tmp.name) / "library"',
    '(lib / "items").mkdir(parents=True)',
    'study_lib.save_store(lib, study_lib.new_store(lib))',
    'httpd = server.create_server(lib, 0)',
    'port = httpd.server_address[1]',
    'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    'def post(body):',
    '    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)',
    '    try:',
    '        conn.request("POST", "/api/meta",',
    '                     json.dumps(body).encode("utf-8"),',
    '                     {"Content-Type": "application/json"})',
    '        r = conn.getresponse()',
    '        return r.status, r.read().decode()',
    '    finally:',
    '        conn.close()',
    'def stored():',
    '    return study_lib.load_store(lib)["meta"].get(KEY, "<<absent>>")',
    's1, b1 = post({KEY: server.BLESSING_BATCH_MAX + 1})',
    'out["over_status"] = s1',
    'out["over_body"] = b1[:300]',
    'out["over_stored"] = stored()',
    's2, b2 = post({KEY: 4})',
    'out["ok_status"] = s2',
    'out["ok_stored"] = stored()',
    's3, b3 = post({KEY: True})',
    'out["bool_status"] = s3',
    'out["bool_stored"] = stored()',
    'httpd.shutdown()',
    'httpd.server_close()',
    'tmp.cleanup()',
    'print(json.dumps(out, ensure_ascii=False, default=str))'
  ].join('\n');

  const res = spawnSync('python3', ['-c', driver], {
    encoding: 'utf8', timeout: 120000,
    env: Object.assign({}, process.env)
  });
  if (res.status !== 0) {
    violations.push(L8 + ' the batch-size driver did not complete, so NOTHING ' +
      'below was measured — this is a broken instrument, not a passing fence. ' +
      'stderr tail: ' + String(res.stderr || '').trim().slice(-700));
    return;
  }
  let o = null;
  try {
    const lines = String(res.stdout || '').trim().split('\n');
    o = JSON.parse(lines[lines.length - 1]);
  } catch (e) {
    violations.push(L8 + ' the batch-size driver exited clean but printed no ' +
      'parseable record');
    return;
  }

  function bad(cond, msg) { if (cond) { violations.push(L8 + ' ' + msg); } }

  // ---- hermetic: no provider was reachable, and it is proven by value ----
  const h = o.hermetic || {};
  bad(h.transport_blocked !== true,
    'the transport was not replaced, so a code path in this block could in ' +
    'principle have opened a socket to a provider');
  bad(h.keys_under_temp_home !== true,
    'the credential file the child could reach was NOT under its own temp ' +
    'home — this block may never be able to see the real one');
  bad(h.keys_visible !== false,
    'a provider key survived into the child; the pops did not run');

  // ---- the chain, link by link ------------------------------------------
  bad(o.in_configurable !== true,
    KEY + ' is not in CONFIGURABLE_KEYS — the chat cannot reach it at all');
  bad(o.in_proposable !== true,
    KEY + ' is not in MODEL_PROPOSABLE_KEYS — the model may not name it');
  bad(o.in_validators !== true,
    KEY + ' has no entry in _CONFIG_KEY_VALIDATORS. `_validate is None` is a ' +
    'DROP: the ask would name the key and never reach it, silently');
  bad(o.in_not_a_capability !== false,
    KEY + ' is still in NOT_A_CAPABILITY — the capability-gap sentence would ' +
    'still fire for a key the room can now actually change');
  bad(o.in_ask_topics !== false,
    KEY + ' is in ASK_TOPICS. It left with the tuple deliberately: a ' +
    'validated change wins the cascade\'s FIRST branch whatever topic the ' +
    'model named, which is how voice_model is reached too');
  bad(o.validator_identity !== true,
    'the registered validator is not validate_blessing_batch_size ITSELF — ' +
    'membership by identity, never by a lookalike');

  const bounds = o.bounds || [];
  bad(!(Number.isFinite(bounds[0]) && Number.isFinite(bounds[1]) &&
        Number.isFinite(bounds[2])),
    'the three batch-size constants did not read as numbers');
  bad(!(bounds[0] <= bounds[2] && bounds[2] <= bounds[1]),
    'the shipped default ' + bounds[2] + ' is outside its own legal range ' +
    bounds[0] + '-' + bounds[1] + ' — the ask document would then report a ' +
    'current value the validator itself would refuse');

  // ---- CONSULTED, not merely present ------------------------------------
  const consulted = o.consulted || [];
  bad(consulted.length !== 1,
    'the proposal path called the registered validator ' + consulted.length +
    ' time(s), expected exactly 1. This is the whole claim of this block: a ' +
    'message coming back is not evidence the ask reached the validator');
  bad(consulted.length === 1 &&
      JSON.stringify(consulted[0]) !== JSON.stringify({ blessing_batch_size: 4 }),
    'the validator was called with ' + JSON.stringify(consulted[0]) +
    ', not with the single-key body the write path uses');
  bad(!Array.isArray(o.kept_legal) || o.kept_legal.length !== 1 ||
      o.kept_legal[0].key !== KEY || o.kept_legal[0].to !== 4,
    'a LEGAL batch-size proposal did not survive validation: ' +
    JSON.stringify(o.kept_legal));
  bad(!Array.isArray(o.kept_out_of_range) || o.kept_out_of_range.length !== 0,
    'an out-of-range proposal survived validation (' +
    JSON.stringify(o.kept_out_of_range) + ') — the validator is registered ' +
    'but is not deciding anything');

  // ---- the sentence stops firing HERE, and still fires THERE -------------
  bad(o.disp_change_any_topic !== 'configurable',
    'a validated batch-size change did not win the cascade\'s first branch');
  // ⛔⛔ EXPECTATION INVERTED BY 26.96-19, ON THE OWNER'S RULING OF 2026-08-21.
  //
  // OLD EXPECTATION: 'configurable'. The rationale, kept verbatim because it
  // was true when written — "a validated batch-size change lost to the
  // capability-gap branch when the model happened to name a gap topic —
  // first-match-wins means the changes branch must sit above it".
  //
  // NEW EXPECTATION: 'not_a_capability'. A gap topic owns no key, so the
  // pairing refuses the change and the cascade falls to that topic's own
  // branch. She ruled the pairing across the whole vocabulary having been
  // shown that 49 of 56 topic/key combinations change answer, and that in
  // every one the room stops doing something it CAN do.
  //
  // ⚠⚠ THIS IS THE ONE PLACE HER RULING BITES A NAMED SHIPPED DECISION, AND
  // IT IS FLAGGED RATHER THAN ABSORBED. D-16 exists because "smaller blessing
  // batches" — her own example ask — used to answer "that's past what i can
  // change". On a MIS-FILED ask it now answers that again.
  //
  // ⛔ THE CAPABILITY ITSELF IS NOT LOST, and that is why this is a cost and
  // not a regression: `blessing_batch_size` has no topic of its own and is
  // reached through topic `other`, which IS paired to it — asserted directly
  // above as `disp_change_any_topic`, still 'configurable'. What is lost is
  // the path where the model names a gap topic AND proposes the batch key,
  // which is a misclassification, and losing it fails toward refusing rather
  // than toward changing something she did not ask about.
  bad(o.disp_change_gap_topic !== 'not_a_capability',
    'a validated batch-size change under a GAP topic no longer lands on the ' +
    'capability line — 26.96-19 pairs every topic, so a key that is not the ' +
    'gap topic\'s own must fall through to that topic\'s branch');
  bad(o.refusal_configurable !== null && o.refusal_configurable !== undefined,
    'the configurable verdict now carries a refusal literal (' +
    JSON.stringify(o.refusal_configurable) + ') — a change she can make is ' +
    'not a "no"');
  // THE CONTROL. A gate with no control proves nothing: this is what
  // distinguishes "the key left the tuple" from "the sentence was silenced".
  bad(o.disp_control !== 'not_a_capability',
    'the CONTROL key (' + CONTROL_TOPIC + ') no longer reaches the ' +
    'capability-gap verdict — the sentence was silenced for everyone rather ' +
    'than made false for one key, which is the opposite of the ruling');
  bad(o.refusal_control !== o.gap_literal,
    'the control verdict no longer serves CONFIG_NOT_A_CAPABILITY_MSG ' +
    'byte-identically');
  bad(String(o.gap_literal || '').indexOf('past what i can change') === -1,
    'CONFIG_NOT_A_CAPABILITY_MSG has been re-worded. It is UNCHANGED by this ' +
    'plan and still true for the four topics that remain; what moved is only ' +
    'which topics reach it');

  // ---- the ask document, and the bound on the widening ------------------
  const row = o.batch_row;
  bad(!row, 'the ask document carries no row for ' + KEY + ' — the model is ' +
    'handed a key it is told nothing about');
  if (row) {
    bad(row.type === 'boolean',
      'the ask document still describes ' + KEY + ' as a boolean — the model ' +
      'is handed a whole number as an on/off switch, and told a `now` that is ' +
      'false whatever she stored');
    bad(String(row.type).indexOf(String(bounds[0])) === -1 ||
        String(row.type).indexOf(String(bounds[1])) === -1,
      'the row\'s type (' + JSON.stringify(row.type) + ') does not name both ' +
      'bounds — it must be BUILT from the constants that enforce them, or the ' +
      'document can name a range the code does not keep');
    bad(row.now !== bounds[2],
      'an ABSENT key reports `now` as ' + JSON.stringify(row.now) +
      ' instead of the shipped default ' + bounds[2]);
  }
  bad(o.now_stored !== 7,
    'a stored legal batch size of 7 reports as ' + JSON.stringify(o.now_stored));
  bad(o.now_illegal !== bounds[2],
    'a hand-edited out-of-range stored value reports as ' +
    JSON.stringify(o.now_illegal) + ' instead of falling to the default — the ' +
    'document would then hand the model a value the write path refuses');
  bad(JSON.stringify(o.row_fields) !== JSON.stringify(['key', 'now', 'type']),
    'the ask document row grew or lost a field: ' +
    JSON.stringify(o.row_fields) + '. The three-field shape is the fence — ' +
    'the document\'s smallness is a safety property, not an efficiency one');

  // THE CLOSED SET. Every proposable key declares a value class, the
  // classes are disjoint, and their union is exactly the allow-list — so a
  // key added later cannot be silently omitted from the document, and cannot
  // be described by a fallthrough that is wrong for it. (#105 widened the
  // set to FOUR: the device class joins the union here, and its own block
  // below carries the widening's assertions.)
  const cls = o.classes || {};
  const union = []
    .concat(cls.bool || [], cls.enum || [], cls.int || [], cls.device || []);
  const proposable = PROPOSABLE_KEYS || [];
  bad(union.length !== new Set(union).size,
    'the three value-class tuples overlap: ' + JSON.stringify(union));
  bad(JSON.stringify(union.slice().sort()) !==
      JSON.stringify(proposable.slice().sort()),
    'the declared value classes ' + JSON.stringify(union.slice().sort()) +
    ' are not exactly MODEL_PROPOSABLE_KEYS ' +
    JSON.stringify(proposable.slice().sort()) + ' — a key with no declared ' +
    'class gets no row at all, so this is the difference between a fence and ' +
    'a quiet gap');
  proposable.forEach(function (k) {
    bad((o.row_keys || []).indexOf(k) === -1,
      'the ask document omits the proposable key "' + k + '" — fail-closed ' +
      'omission is correct for an undeclared class, and it is supposed to be ' +
      'LOUD: this is where it becomes loud');
  });
  bad(o.boolean_rows !== (cls.bool || []).length,
    'the document reports ' + o.boolean_rows + ' boolean rows against ' +
    (cls.bool || []).length + ' declared boolean keys — a key of another ' +
    'class is being described as a switch');
  bad(o.undeclared_row !== null,
    'a key with no declared value class still produced a row (' +
    JSON.stringify(o.undeclared_row) + ') — the fallthrough that made the ' +
    'boolean claim for everything is still there');
  bad(o.effective_bool_on_int_key !== false,
    '_config_effective_bool still answers for a non-boolean key (returned ' +
    JSON.stringify(o.effective_bool_on_int_key) + ') — that bare ' +
    '`meta.get(key) is True` tail is what reported a whole number as an off ' +
    'switch');

  // ---- the shape a PROVIDER has to accept -------------------------------
  //
  // ⚠ A GREEN HERE IS NOT PROVIDER ACCEPTANCE. A schema that was well-formed,
  // legal JSON Schema and green in every suite in this tree has been refused
  // by a provider on every call, with nothing saying why. What this group can
  // honestly check is that the shape did not acquire a NEW construct and did
  // not lose the two properties that shape is known to need: an object at the
  // root, and closed objects throughout.
  const toTypes = o.to_types || [];
  bad(toTypes.indexOf('integer') === -1,
    'CONFIG_SCHEMA_JSON\'s `to` still accepts ' + JSON.stringify(toTypes) +
    ' with no integer, so the model literally cannot emit a legal value for ' +
    KEY + ': every answer it can form is refused and dropped');
  bad(toTypes.indexOf('boolean') === -1,
    'CONFIG_SCHEMA_JSON\'s `to` lost "boolean" — the six switch keys can no ' +
    'longer be answered');
  bad(!Array.isArray(toTypes) || toTypes.length !== 4,
    '`to` carries ' + JSON.stringify(toTypes) + '. It is a union of exactly ' +
    'four: boolean, string, integer, null. A fifth member is another ' +
    'widening and wants its own reasoning');
  bad(o.root_type !== 'object',
    'CONFIG_SCHEMA_JSON\'s root type is ' + JSON.stringify(o.root_type) +
    ', not "object"');
  const closed = o.closed_objects || [];
  bad(!closed.length,
    'the schema declares no object at all — the closedness check below has ' +
    'no subject');
  bad(closed.some(function (v) { return v !== false; }),
    'an object in CONFIG_SCHEMA_JSON is not closed (' +
    JSON.stringify(closed) + ') — additionalProperties must be false ' +
    'throughout');

  // ---- and the client inch: no card the room has no words for -----------
  //
  // Source text, with comments stripped FIRST and said so: a scan that reads
  // comments finds a call that has been commented out and reports green.
  const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  function countIn(hay, needle) {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }
  bad(countIn(appCode, 'function askDescribable(') !== 1,
    'app.js: askDescribable is missing or defined twice — the predicate that ' +
    'decides whether the room has words for a change must have exactly one ' +
    'home, or the card and the confirm tap can disagree');
  bad(countIn(appCode, 'changes.every(askDescribable)') !== 2,
    'app.js: askDescribable is applied ' +
    countIn(appCode, 'changes.every(askDescribable)') + ' time(s), expected ' +
    '2 — the MINT (so a card carrying a blank sentence never paints) and the ' +
    'CONFIRM (so a card already on screen cannot be applied). Losing the ' +
    'mint check is what puts an empty claim over a live button');
  bad(countIn(appCode, '!ASK_STATE_COPY[c.key] && !ASK_VALUE_KEYS[c.key]') !== 0,
    'app.js: the inline off-list predicate is back beside askDescribable — ' +
    'one rule, one spelling');
  // POSITIVE CONTROL for this scanner, so the zero above means something.
  bad(countIn(appCode, 'ASK_VALUE_KEYS') < 2,
    'app.js: the scanner cannot find ASK_VALUE_KEYS, which plainly exists — ' +
    'the absence asserted just above is then vacuous');
})();

// ---------------------------------------------------------------------------
// (8) 26.99-08, D-16 — THE CONSENT RECORD IS NOT A SETTING THE MODEL MAY
//     PROPOSE TUNING.
// ---------------------------------------------------------------------------
//
// She flips it; the librarian may not propose flipping it. ⚠ This deliberately
// does NOT follow #12's "store it beside librarian_enabled" literally: storage
// location and proposability are two different questions and #12 settled only
// the first. A consent record governs WHERE A CREDENTIAL GOES; a setting the
// model may propose tuning is a different object, and routing one through the
// other is exactly the elevation T-26.99-37 names.
//
// ⚠ THE KEY'S NAME IS SPELLED HERE, IN THE TEST, on the FORBIDDEN_CONFIG_ROUTE
// precedent — a scanner that read the name out of the register it is scanning
// could never notice the register gaining it. The binding in the other
// direction is the last check in this block: WHEN librarian_call carries
// SETTINGS_CONSENT_KEY, its value must equal this literal, so the two cannot
// drift apart once the code lands.
//
// ⚠ AND THE ABSENCE IS ASSERTED WITH ITS OWN MUTATION (B-5). "It is not in the
// tuple" is trivially true of every string in the language; what has to be
// shown is that this scanner WOULD SEE IT if it were. So the key is planted
// into an in-memory copy of each register and the same predicate must find it
// there. The mutation IS the assertion.
//
// ⛔ Read over COMMENT-STRIPPED source (B-2): this phase writes a great deal
// of prose containing exactly the strings its gates search for, and the two
// registers both sit under some ninety lines of it.
(function () {
  const CONSENT_KEY = 'base_consent';

  // Line-count-preserving python comment strip, plus a triple-quote blanker —
  // ⚠ A PYTHON DOCSTRING IS NOT A '#' COMMENT, and prose that survived the
  // strip has turned a pin red twice on this project.
  function stripPy(src) {
    const blanked = src.replace(/("""|''')[\s\S]*?\1/g, function (m) {
      return m.replace(/[^\n]/g, ' ');
    });
    return blanked.split('\n').map(function (l) {
      return /^\s*#/.test(l) ? '' : l;
    }).join('\n');
  }

  const pyCode = stripPy(py);

  // Lift a top-level tuple assignment out of the STRIPPED source, so the
  // members read here are the ones the interpreter sees.
  function tupleMembers(name) {
    const at = pyCode.indexOf('\n' + name + ' = ');
    if (at === -1) { return null; }
    const lines = pyCode.slice(at + 1).split('\n');
    const out = [lines[0]];
    for (let i = 1; i < lines.length && out.length < 600; i++) {
      if (/^[A-Za-z_@]/.test(lines[i])) { break; }
      out.push(lines[i]);
    }
    const quoted = out.join('\n').match(/"([a-z_]+)"/g) || [];
    return quoted.map(function (q) { return q.slice(1, -1); });
  }

  // ONE predicate, used on the real register and on the planted copy. Two
  // spellings of "is it in there" would let the absence and the mutation
  // disagree about what was being asked.
  function names(register, key) {
    return Array.isArray(register) && register.indexOf(key) !== -1;
  }

  const registers = [
    ['MODEL_PROPOSABLE_KEYS', tupleMembers('MODEL_PROPOSABLE_KEYS')],
    ['CONFIGURABLE_KEYS', tupleMembers('CONFIGURABLE_KEYS')],
  ];

  registers.forEach(function (pair) {
    const label = pair[0];
    const members = pair[1];
    if (!members || !members.length) {
      violations.push('[d16] server.py: ' + label + ' could not be read out ' +
        'of the comment-stripped source, so the membership check below has ' +
        'no subject and its green means nothing');
      return;
    }
    // THE ASSERTION.
    if (names(members, CONSENT_KEY)) {
      violations.push('[d16] server.py: ' + label + ' names "' + CONSENT_KEY +
        '" — a consent record that decides where a credential is sent is not ' +
        'a setting the librarian may propose tuning (D-16, T-26.99-37)');
    }
    // THE MUTATION THAT MAKES THE ASSERTION MEAN SOMETHING: plant it, and
    // require the same predicate to find it.
    const planted = members.concat([CONSENT_KEY]);
    if (!names(planted, CONSENT_KEY)) {
      violations.push('[d16] the membership scanner cannot find "' +
        CONSENT_KEY + '" even when it is planted into a copy of ' + label +
        ' — the absence asserted above is vacuous');
    }
  });

  // The binding to the code, once the code exists. Until 26.99-08 Task 2
  // lands there is nothing to bind to, and this block is still doing its job:
  // an absence with a live mutation behind it.
  const lib = readSource('librarian_call.py');
  const assign = stripPy(lib).match(/\nSETTINGS_CONSENT_KEY\s*=\s*"([^"]*)"/);
  if (assign && assign[1] !== CONSENT_KEY) {
    violations.push('[d16] librarian_call.SETTINGS_CONSENT_KEY is "' +
      assign[1] + '" but this fence is watching for "' + CONSENT_KEY +
      '" — the two drifted apart, so the registers above were scanned for a ' +
      'key that no longer exists');
  }
})();

// ---------------------------------------------------------------------------
// 26.96-14 (G-26.96-A) — THE FAR END OF HER SENTENCE'S PATH, DRIVEN.
// ---------------------------------------------------------------------------
//
// HER RULING O, 2026-08-21, TIER 2 (approved as shown, chosen from three
// options put to her AFTER she reproduced the defect on her own machine): a
// request naming ONE folder is answered with a change to that folder's
// privacy, or with the route to the private-folders pane — never with a
// switch that changes her whole library.
//
// server.py's pairing is the fix. THIS BLOCK PROVES THE FIX REACHES HER, by
// driving the SHIPPED answer-handler on a snapshot shaped exactly like the
// readout the server now produces: a non-configurable disposition carrying a
// NON-EMPTY change list that names the master switch. That combination is the
// whole point — an empty change list would prove nothing, because the card
// was never going to be minted for one.
//
// ⛔ THE WRITES ARE COUNTED, NEVER CHECKED FOR EMPTINESS. A sentence can be
// rendered and immediately painted over, so an empty slot passes while the
// card WAS produced — this phase recorded that incident. `ASK.line` is
// therefore an ACCESSOR that records every value assigned to it, and the card
// opener is a counting double.
//
// TWO ARMS, DRIVEN SEPARATELY RATHER THAN ONE ASSERTED FROM THE OTHER:
//   pairingNoSwitch       — the manage-only verdict the roster, filters and
//                           connected_sources topics fall to. Her ruled
//                           answer: one quiet line that NAMES the
//                           private-folders pane, and no card.
//   pairingNoRouteOnName  — the unmapped verdict `librarian_name` falls to,
//                           because F9's no-redirect branch (2026-07-31) sits
//                           ABOVE manage-only: the name exists only in
//                           onboarding, so after onboarding the chat is the
//                           only route there is. Her Ruling O never reached
//                           that topic. The switch is gone there too, but the
//                           line carries NO route — and that count is a third
//                           counted quantity, because an absent route is
//                           exactly what an emptiness check cannot tell from
//                           a route that was never asked for.
(function () {
  const L = '[26.96-14]';

  function fnSrc(name) {
    const sig = 'function ' + name + '(';
    const start = app.indexOf(sig);
    if (start === -1) { return null; }
    let i = app.indexOf('{', start);
    let depth = 0;
    for (; i < app.length; i++) {
      if (app[i] === '{') { depth++; } else if (app[i] === '}') {
        depth--; if (depth === 0) { i++; break; }
      }
    }
    return depth === 0 ? app.slice(start, i) : null;
  }

  // The whole route chain is LIFTED, never re-typed — the pane label, the
  // template split around it and the registry entry all come from app.js's
  // own bytes, so this block cannot pass against a route that has drifted.
  function varSrc(re, what) {
    const m = re.exec(app);
    if (!m) {
      violations.push(L + ' app.js: cannot lift ' + what +
        ' — the driven arms below would run against a stub, and a harness ' +
        'that quietly substitutes its own copy measures nothing');
      return null;
    }
    return m[0];
  }

  const LIFT = ['askAnswered', 'askRefusalLine', 'askRouteLine',
    'askRouteFor', 'managePaneLabel'];
  const missing = LIFT.filter(function (n) { return fnSrc(n) === null; });
  if (missing.length) {
    violations.push(L + ' app.js: cannot lift ' + missing.join(', ') +
      ' — her ruled answer is asserted at the far end of the path, and a ' +
      'function this block cannot lift is a function it silently stops ' +
      'checking');
    return;
  }

  const panes = varSrc(/ {2}var MANAGE_PANES = \[[\s\S]*?\n {2}\];/,
    'MANAGE_PANES');
  const routeMap = varSrc(/ {2}var ASK_MANAGE_ROUTE = \{[\s\S]*?\n {2}\};/,
    'ASK_MANAGE_ROUTE');
  const routeTpl = varSrc(
    / {2}var ASK_ROUTE_TEMPLATE = \(function \(\) \{[\s\S]*?\n {2}\}\(\)\);/,
    'ASK_ROUTE_TEMPLATE');
  // ⚠ EVERY assignment onto the registry, not just the roster one — and this
  // paragraph is here because the first version of this block lifted ONLY
  // `ASK_MANAGE_ROUTE.roster = …` and was therefore BLIND to a route added by
  // any other line. It was caught by driving the arm that should fail: a
  // mutant that gave `librarian_name` a route by adding a second assignment
  // left arm 2 GREEN, because the route never reached this scope at all. A
  // harness that lifts a fixed list of statements silently stops measuring the
  // moment the thing it guards grows a new one — which is this project's own
  // recurring defect, found here in a check written to prevent it.
  const entryRe = / {2}ASK_MANAGE_ROUTE\.[A-Za-z_$][\w$]* = [^\n]*;/g;
  const entries = app.match(entryRe) || [];
  const rosterEntry = entries.length ? entries.join('\n') : null;
  if (!rosterEntry) {
    violations.push(L + ' app.js: no ASK_MANAGE_ROUTE.<topic> assignment ' +
      'could be lifted — the roster route is built by one, so arm 1 would ' +
      'be asserting against a registry this block populated itself');
  } else if (entries.join('\n').indexOf('.roster =') === -1) {
    violations.push(L + ' app.js: the roster route is no longer assigned ' +
      'onto ASK_MANAGE_ROUTE — her ruled answer has nothing to point at');
  }
  const fallback = varSrc(/ {2}var ASK_REFUSAL_FALLBACK = \{[\s\S]*?\n {2}\};/,
    'ASK_REFUSAL_FALLBACK');
  if (!panes || !routeMap || !routeTpl || !rosterEntry || !fallback) {
    return;
  }

  // ---- the counting harness ----------------------------------------------
  //
  // Every quantity this block reports is a COUNT taken from a double, not a
  // reading of a final slot.
  function drive(snap) {
    const counts = { card: 0, apiGet: 0, suggest: 0, refused: 0,
      failed: 0, repaint: 0, routeCalls: 0 };
    const lineWrites = [];
    // ASK.line is an ACCESSOR. Every assignment is recorded, so "written
    // exactly once" is a statement about writes and a later over-paint would
    // show up as a second entry rather than vanishing.
    const ASK = { open: true, text: 'x', busy: true, card: null,
      applying: true, suggest: null };
    Object.defineProperty(ASK, 'line', {
      get: function () {
        return lineWrites.length ? lineWrites[lineWrites.length - 1] : '';
      },
      set: function (v) { lineWrites.push(v); },
      enumerable: true, configurable: true
    });
    // eslint-disable-next-line no-new-func
    const build = new Function('ASK', 'counts', [
      panes, fnSrc('managePaneLabel'), routeMap, routeTpl,
      fnSrc('askRouteFor'), rosterEntry, fnSrc('askRouteLine'),
      fallback,
      fnSrc('askRefusalLine'), fnSrc('askAnswered')
    ].join('\n') + '\n' +
      // -- the doubles, every one of them COUNTING ------------------------
      'function askOpenCard() { counts.card++; }\n' +
      'function askSuggestReply() { counts.suggest++; }\n' +
      'function askRefused() { counts.refused++; }\n' +
      'function askFailed() { counts.failed++; }\n' +
      'function askRepaint() { counts.repaint++; }\n' +
      'function askDescribable() { return true; }\n' +
      'function apiGet() { counts.apiGet++;\n' +
      '  return { then: function () { return { catch: function () {} }; } };\n' +
      '}\n' +
      'var ASK_REASON_NOT_MINE = "not-mine";\n' +
      'return { answered: askAnswered, route: askRouteLine };');
    const api = build(ASK, counts);
    // The route helper is wrapped AFTER the build so the lifted bytes are
    // untouched; the wrapper only counts what the driven run asks for.
    const realRoute = api.route;
    return { run: function (s) { api.answered(s); },
      counts: counts, lineWrites: lineWrites, ASK: ASK,
      routeFor: realRoute, rosterRoute: realRoute('roster'), snap: snap };
  }

  function must(cond, msg) {
    if (!cond) { violations.push(L + ' ' + msg); }
    return cond;
  }

  // The change list is NON-EMPTY and names the master switch — the exact
  // shape the model produced on the day she reproduced this.
  const CROSS = [{ key: 'librarian_enabled', to: false, says: '' }];

  // ---- arm 1: pairingNoSwitch --------------------------------------------
  (function pairingNoSwitch() {
    const d = drive();
    d.run({ disposition: 'manage_only', topic: 'roster', changes: CROSS,
      refusal: "i can't change that one from here.",
      refusal_why: 'manage_only' });

    must(d.counts.card === 0,
      'pairingNoSwitch: the card opener was called ' + d.counts.card +
      ' time(s) on a manage-only verdict carrying a non-empty change list. ' +
      'HER RULING O: a sentence naming one folder is answered with no ' +
      'switch at all');
    must(d.counts.apiGet === 0,
      'pairingNoSwitch: the handler reached for /api/items ' + d.counts.apiGet +
      ' time(s) — the card path was entered even if no card was drawn');
    must(d.counts.suggest === 0 && d.counts.refused === 0 &&
      d.counts.failed === 0,
      'pairingNoSwitch: the answer took a branch other than the quiet ' +
      'refusal line (suggest=' + d.counts.suggest + ' refused=' +
      d.counts.refused + ' failed=' + d.counts.failed + ')');
    must(d.lineWrites.length === 1,
      'pairingNoSwitch: the quiet line was WRITTEN ' + d.lineWrites.length +
      ' time(s), not once. A sentence can be rendered and painted over, so ' +
      'this is counted rather than read out of the slot');
    const line = d.lineWrites[0] || '';
    must(line.indexOf("i can't change that one from here.") === 0,
      'pairingNoSwitch: the line does not open with the shipped manage-only ' +
      'sentence — it reads ' + JSON.stringify(line));
    // HER RULED ANSWER: the route to the private-folders pane, appended to
    // that same one line. The expected route is the one app.js BUILDS, so
    // this compares the driven answer against the shipped registry rather
    // than against a literal typed here.
    must(!!d.rosterRoute,
      'pairingNoSwitch: app.js builds no roster route at all, so her ruled ' +
      'answer has nothing to point at');
    must(d.rosterRoute && line.indexOf(d.rosterRoute) !== -1,
      'pairingNoSwitch: the line never names the private-folders pane. Her ' +
      'ruling is that she gets the route her other three sentences already ' +
      'get; line=' + JSON.stringify(line) + ' route=' +
      JSON.stringify(d.rosterRoute));
    must(d.ASK.card === null,
      'pairingNoSwitch: ASK.card is not null — a stale card survives the ' +
      'refusal and would still paint');
  }());

  // ---- arm 2: pairingNoRouteOnName ---------------------------------------
  //
  // ⛔ NOT ABSORBED INTO ARM 1. F9 (2026-07-31) puts `librarian_name` in
  // NO_REDIRECT_TOPICS, above the manage-only branch, because the name exists
  // only in onboarding and a redirect to Manage sends her away from the one
  // thing that could work. HER RULING O NEVER REACHED THIS TOPIC — a sentence
  // naming a folder classifies to one of the other three. So the switch is
  // gone here too, and the sentence that replaces it is F9's, not hers.
  (function pairingNoRouteOnName() {
    const d = drive();
    d.run({ disposition: 'unmapped', topic: 'librarian_name', changes: CROSS,
      refusal: "i didn't follow that one. say it another way and i'll try " +
        'again.',
      refusal_why: 'unmapped' });

    must(d.counts.card === 0,
      'pairingNoRouteOnName: the card opener was called ' + d.counts.card +
      ' time(s) on the unmapped verdict — the switch must be gone on BOTH ' +
      'arms, which is the half of this that IS her ruling');
    must(d.counts.apiGet === 0,
      'pairingNoRouteOnName: the handler reached for /api/items ' +
      d.counts.apiGet + ' time(s)');
    must(d.lineWrites.length === 1,
      'pairingNoRouteOnName: the quiet line was WRITTEN ' +
      d.lineWrites.length + ' time(s), not once');
    const line = d.lineWrites[0] || '';
    must(line.indexOf("i didn't follow that one.") === 0,
      'pairingNoRouteOnName: the line is not the retry line — it reads ' +
      JSON.stringify(line));
    // THE THIRD COUNTED QUANTITY. Counted over the SHIPPED route strings, so
    // "no route" is a statement about what was produced rather than about a
    // slot nobody filled.
    // ⛔ ASK THE SHIPPED HELPER FOR THIS TOPIC'S OWN ROUTE, never only the
    // roster's. If `librarian_name` ever gains a registry entry, this reads
    // it — which is what makes the count sensitive to the mutant that gives
    // the name a route AND ungates the append. Checking only the roster
    // string, or only a typed fragment, left this arm green under exactly
    // that mutant; the arm-that-should-fail is what found it.
    let routeHits = 0;
    [d.routeFor('librarian_name'), d.rosterRoute,
      'open “manage your library”'].forEach(function (r) {
      if (r && line.indexOf(r) !== -1) { routeHits++; }
    });
    must(routeHits === 0,
      'pairingNoRouteOnName: the line carries ' + routeHits +
      ' route fragment(s). F9: unmapped names no door ON PURPOSE — there is ' +
      'no name control in Manage, so a direction there would be a lie; ' +
      'line=' + JSON.stringify(line));
    must(d.ASK.card === null,
      'pairingNoRouteOnName: ASK.card is not null');
  }());
}());

// ---- verdict ---------------------------------------------------------------

// ---------------------------------------------------------------------------
// (9) #105 (launch map, 2026-08-25) — THE FOURTH VALUE CLASS IS DEVICE-
//     RESOLVED, AND ITS VALUE NEVER CROSSES THE SEAM IN EITHER DIRECTION.
// ---------------------------------------------------------------------------
//
// `display_fence_open` is the reflection display fence (26.4-10): its value
// lives in the browser's own storage and the shipped Manage line promises
// "this setting stays on this device". The chat may now flip it — her ruling
// of 2026-08-17 ("ALL of the features on Manage should be working while the
// user talking with librarian", scope "only the switches") — and the design
// resolved on #105 is that the server classifies and mints the card while the
// CLIENT is both the source and the sink. So this block holds the widening to
// its own reasoning, on both halves:
//
//   * the ask document hands the key with a TYPE ONLY and no `now` — the
//     server does not know the value and must not invent one (26.95-34's own
//     fail-closed reasoning), and the type string is NOT the bare "boolean",
//     because that spelling is _CONFIG_BOOLEAN_KEYS' promise of an effective
//     `now` and block (8) counts those rows against that tuple;
//   * /api/meta REFUSES the key as unknown and stores nothing — the shipped
//     protection for "stays on this device" must survive the key becoming
//     proposable;
//   * the client's device route reads and writes ONLY its own storage: the
//     before-value, the stale check, the apply and the receipt all go
//     through displayFenceOpen / setDisplayFenceOpen, never /api/meta;
//   * ⛔ HER THREE LINES ARE PINNED BYTE-EXACTLY, TYPED FROM THE #105 RECORD
//     (2026-08-25) rather than read out of app.js — a pin whose two sides
//     are the same file is the mirror trap, instance eleven. The doubled
//     "private notes" across the name and the sentences was shown to her
//     and KEPT by her ruling; a later "fix" of it must go red here.
(function () {
  const KEY = 'display_fence_open';
  const L9 = '[105-device]';
  function bad(cond, msg) { if (cond) { violations.push(L9 + ' ' + msg); } }

  // ---- the server half, driven by value ---------------------------------
  const driver = [
    'import json, threading, tempfile',
    'from pathlib import Path',
    'import http.client',
    'import server, study_lib',
    'out = {}',
    'out["device_keys"] = list(server._CONFIG_DEVICE_KEYS)',
    'out["in_meta_keys"] = "' + KEY + '" in server.META_KEYS',
    'doc = json.loads(server.build_config_ask_doc({}, "let me open them"))',
    'row = next((r for r in doc["settings"] if r["key"] == "' + KEY + '"),',
    '           None)',
    'out["row"] = row',
    'out["row_fields"] = sorted(row) if row else None',
    'ok, cleaned, why = server.validate_config_proposal(',
    '    {"changes": [{"key": "' + KEY + '", "to": True, "says": ""}],',
    '     "disposition": "configurable", "topic": "other"})',
    'out["kept_bool"] = cleaned["changes"] if ok else None',
    'ok2, cleaned2, _ = server.validate_config_proposal(',
    '    {"changes": [{"key": "' + KEY + '", "to": "yes", "says": ""}],',
    '     "disposition": "configurable", "topic": "other"})',
    'out["kept_nonbool"] = cleaned2["changes"] if ok2 else None',
    'ch = [{"key": "' + KEY + '", "to": True, "says": ""}]',
    'out["disp_other"] = server._config_disposition(ch, "other")',
    'out["disp_gap"] = server._config_disposition(ch, "room_lighting")',
    'out["prompt_names_key"] = "' + KEY + '" in server.CONFIG_PROMPT',
    'out["prompt_no_now"] = "no \'now\'" in server.CONFIG_PROMPT',
    '',
    '# the live write path: the meta door stays SHUT for this key',
    'tmp = tempfile.TemporaryDirectory()',
    'lib = Path(tmp.name) / "library"',
    '(lib / "items").mkdir(parents=True)',
    'study_lib.save_store(lib, study_lib.new_store(lib))',
    'httpd = server.create_server(lib, 0)',
    'port = httpd.server_address[1]',
    'threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    'conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)',
    'conn.request("POST", "/api/meta",',
    '             json.dumps({"' + KEY + '": True}).encode("utf-8"),',
    '             {"Content-Type": "application/json"})',
    'r = conn.getresponse()',
    'out["meta_status"] = r.status',
    'out["meta_body"] = r.read().decode()[:200]',
    'conn.close()',
    'out["meta_stored"] = study_lib.load_store(lib)["meta"].get(',
    '    "' + KEY + '", "<<absent>>")',
    'httpd.shutdown()',
    'httpd.server_close()',
    'tmp.cleanup()',
    'print(json.dumps(out, ensure_ascii=False, default=str))'
  ].join('\n');
  const res = spawnSync('python3', ['-c', driver], {
    encoding: 'utf8', timeout: 120000,
    env: Object.assign({}, process.env)
  });
  if (res.status !== 0) {
    violations.push(L9 + ' the device-class driver did not complete, so ' +
      'NOTHING in this block was measured — a broken instrument, not a ' +
      'passing fence. stderr tail: ' +
      String(res.stderr || '').trim().slice(-700));
    return;
  }
  let o = null;
  try {
    const lines = String(res.stdout || '').trim().split('\n');
    o = JSON.parse(lines[lines.length - 1]);
  } catch (e) {
    violations.push(L9 + ' the device-class driver exited clean but printed ' +
      'no parseable record');
    return;
  }

  bad(JSON.stringify(o.device_keys) !== JSON.stringify([KEY]),
    '_CONFIG_DEVICE_KEYS is ' + JSON.stringify(o.device_keys) +
    ' — expected exactly [' + KEY + ']. A second device key wants its own ' +
    'reasoning, and an empty tuple means the class quietly left');
  bad(o.in_meta_keys !== false,
    KEY + ' is in META_KEYS — the server has been given a store for a value ' +
    'whose whole promise is that it stays on her device');
  bad(!o.row, 'the ask document carries no row for ' + KEY +
    ' — the model is handed a key it is told nothing about');
  bad(JSON.stringify(o.row_fields) !== JSON.stringify(['key', 'type']),
    'the device row carries fields ' + JSON.stringify(o.row_fields) +
    ' — expected exactly [key, type]: a `now` here is a value the server ' +
    'cannot know, and any further field is the widening block (8) forbids');
  bad(o.row && o.row.type === 'boolean',
    'the device row is typed bare "boolean" — that spelling is ' +
    '_CONFIG_BOOLEAN_KEYS\' promise of an effective `now`, and block (8) ' +
    'counts those rows against that tuple');
  bad(o.row && String(o.row.type).indexOf('device') === -1,
    'the device row\'s type (' + JSON.stringify(o.row && o.row.type) +
    ') does not say the value is kept on her device — the inline ' +
    'self-documentation is the discipline the other classes follow');
  bad(!Array.isArray(o.kept_bool) || o.kept_bool.length !== 1 ||
      o.kept_bool[0].key !== KEY || o.kept_bool[0].to !== true,
    'a legal boolean proposal did not survive validation: ' +
    JSON.stringify(o.kept_bool));
  bad(!Array.isArray(o.kept_nonbool) || o.kept_nonbool.length !== 0,
    'a non-boolean proposal survived validation (' +
    JSON.stringify(o.kept_nonbool) + ') — the validator is registered but ' +
    'not deciding anything');
  bad(o.disp_other !== 'configurable',
    'a validated device change under topic `other` did not win the first ' +
    'branch — the key is unreachable, not merely unmapped');
  bad(o.disp_gap !== 'not_a_capability',
    'a device change under a gap topic returned ' +
    JSON.stringify(o.disp_gap) + ' — 26.96-19 pairs every topic, so a ' +
    'misfiled change must fall to that topic\'s own branch');
  bad(o.prompt_names_key !== true,
    'CONFIG_PROMPT never names ' + KEY + ' — the model is handed the key ' +
    'with no gloss, and the room\'s internal spelling reads as noise');
  bad(o.prompt_no_now !== true,
    'CONFIG_PROMPT does not tell the model this key is handed with no ' +
    "'now' — it will claim to know a state the document never carried");
  bad(o.meta_status !== 400,
    '/api/meta answered ' + o.meta_status + ' for ' + KEY +
    ' — expected 400: the meta door must refuse the key as unknown');
  bad(o.meta_stored !== '<<absent>>',
    '/api/meta STORED ' + JSON.stringify(o.meta_stored) + ' for ' + KEY +
    ' — the refusal must leave nothing behind');

  // ---- the client half: the device route's sink is its own storage ------
  const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  function countIn(hay, needle) {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }
  bad(countIn(appCode, "var ASK_KEY_DEVICE_FENCE = 'display_fence_open'")
      !== 1,
    'app.js: ASK_KEY_DEVICE_FENCE is missing or defined twice');
  bad(countIn(appCode, "var ASK_ROUTE_DEVICE = 'route-device'") !== 1,
    'app.js: ASK_ROUTE_DEVICE is missing or defined twice');
  bad(countIn(appCode, 'route === ASK_ROUTE_DEVICE') !== 1,
    'app.js: askConfirmTap has no device-route branch — the confirm would ' +
    'fall through to the meta POST, which the server refuses');
  bad(countIn(appCode, 'setDisplayFenceOpen(dc.to === true)') !== 1,
    'app.js: the device apply does not write through setDisplayFenceOpen — ' +
    'the one shipped writer for this device\'s own storage');
  // POSITIVE CONTROL for the scanner, so the counts above mean something.
  bad(countIn(appCode, 'setDisplayFenceOpen') < 2,
    'app.js: the scanner cannot find setDisplayFenceOpen, which plainly ' +
    'exists (Manage\'s own checkbox writes through it) — the counts above ' +
    'are then vacuous');

  // ---- her three lines, byte-exact, typed from the #105 record ----------
  const HER_NAME = 'links to your own private notes';
  const HER_ON = 'this is on: a private note named in a reflection ' +
    'becomes a door you can open, just to read, on this device only.';
  const HER_OFF = 'this is off: a private note named in a reflection ' +
    'stays plain words, and nothing opens.';
  bad(app.indexOf("display_fence_open: '" + HER_NAME + "'") === -1,
    'app.js: ASK_SETTING_NAME does not carry her card name byte-exactly ' +
    '(#105, 2026-08-25): "' + HER_NAME + '"');
  bad(app.indexOf(HER_ON) === -1,
    'app.js: her ON sentence is not present byte-exactly (#105) — no agent ' +
    'may reword, tighten or re-punctuate it');
  bad(app.indexOf(HER_OFF) === -1,
    'app.js: her OFF sentence is not present byte-exactly (#105) — no ' +
    'agent may reword, tighten or re-punctuate it');
})();

if (violations.length) {
  console.error('test_librarian_config_fence FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('OK test_librarian_config_fence — consent (nothing lands ' +
  'without a tap, no parallel config route); inbound (the recorded stdin ' +
  'carries key names, types, boolean values and her own words — and none of ' +
  'the four FENCE- sentinel classes, no store path and no item id, on the ' +
  'document or on the address); hermetic (the recording transport was the ' +
  'installed seam, the keys file was under a swapped home, ANTHROPIC_API_KEY ' +
  'did not survive into the child, the ask resolved to the throwaway-keyed ' +
  'fill, and the credential is nowhere in the record); outbound (off-list ' +
  'keys dropped, a ' +
  'title-bearing proposal refused whole, meta byte-unchanged); structural ' +
  "(the key enum is built from the allow-list; no minItems, no $schema); " +
  'routing (a pure router decides before any request; a roster diff takes ' +
  "the roster route's own {op, folder} shape and never the meta route; a " +
  'mixed diff is refused at zero cost; the roster card is single-change and ' +
  "always Form A); the D-21 override (the server's verdict wins, from a " +
  'fixed set of literals); and D-04 (zero model calls, the shipped ' +
  'predicate on both sides, one card above the invitation, no count, no ' +
  'vermillion, and nothing at all with the librarian off); and 26.91 ' +
  'D-07/D-08 DRIVEN — law 1 in both directions on the painted surface ' +
  '(no lead-in and no row before her sentence, both after it), the cue ban ' +
  'over a window pinned non-empty, the new copy run through the SHIPPED ' +
  'no-push matcher, law 7 paired with its own positive control, and all six ' +
  'probe edges: empty (three cases), adjacency, ordering, encoding, ' +
  'idempotency, concurrency); and 26.95-34 D-16 — the blessing batch size ' +
  'reaches the validator (registered BY IDENTITY and observed CONSULTED ' +
  'exactly once with the single-key body, a legal value kept, an ' +
  'out-of-range one dropped), a real POST /api/meta refuses an illegal one ' +
  'with the range in plain words and stores nothing while a legal one ' +
  'stores, the capability-gap sentence is byte-unchanged and STILL FIRES ' +
  'for its control topic while no longer reaching this key, the ask ' +
  'document describes it as a bounded integer with its real effective ' +
  'value in the unchanged three-field shape, the three value classes are ' +
  'disjoint and their union IS the allow-list so an undeclared key gets no ' +
  'row and no proposable key is omitted, the schema\'s `to` is a four-member ' +
  'union carrying integer over a closed object root, and the client mints ' +
  'no card it has no words for (askDescribable at both the mint and the ' +
  'confirm) — all of it with the transport replaced, HOME swapped and every ' +
  'provider key popped, so nothing in the block can reach a provider); and ' +
  '26.99-08 D-16 — the base-consent record is named by NEITHER ' +
  'MODEL_PROPOSABLE_KEYS nor CONFIGURABLE_KEYS, read out of ' +
  'COMMENT-STRIPPED source, with the key planted into a copy of each ' +
  'register so the absence has a live mutation behind it, and bound to ' +
  "librarian_call.SETTINGS_CONSENT_KEY's value once that constant exists; " +
  'and #105 — the FOURTH value class is device-resolved: the ask document ' +
  'hands display_fence_open as a type alone with no `now` and a type ' +
  'string that is not the bare "boolean", /api/meta refuses the key as ' +
  'unknown and stores nothing, a boolean proposal survives validation and ' +
  'a non-boolean is dropped, topic `other` reaches it and a gap topic ' +
  'falls to its own branch, CONFIG_PROMPT names the key and its missing ' +
  "'now', the client's device route applies through setDisplayFenceOpen " +
  'and never the meta POST, and her three #105 lines are pinned ' +
  'byte-exactly, typed from the ticket record');
process.exit(0);
