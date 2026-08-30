/*
 * tests/test_vault_refusal.cjs — the refusal's FACE, on both surfaces
 * (Plan 26.97-10).
 *
 * The server already refuses (plan 04) and writes nothing when it does:
 * the wire carries `{ok:false, refused:true, source, reason}` at 409 and
 * NO `error` key at all. This suite is about what she SEES.
 *
 * ⚠⚠ EVERY CASE BELOW IS **DRIVEN**. It stands the readout region (or the
 * room's panel, or the connected-apps pane) up on a controllable page,
 * calls the SHIPPED function, and reads what actually rendered. ⛔ NOT ONE
 * assertion in this file is a regex over app.js offered as behavioural
 * evidence. The refusal is this phase's headline behaviour; a source-text
 * check can be made green by editing the regex while the card is still red,
 * still beside a progress bar, or still a dead end. That trap is recorded on
 * this project and it is why this suite drives.
 *
 * Fourteen behaviours, fifteen named cases (behaviour 14 is split into its
 * CONTROL half — an ordinary failure still paints the shipped quiet-error
 * line — and its POSITIVE half — a refusal outcome paints the card):
 *
 *   1  the settings readout holds the refusal card and NOTHING else
 *   2  the room's existing panel holds it too, wearing the card recipe
 *   3  neither surface spends the room's red
 *   4  exactly two controls, in her recorded order, real focusable buttons
 *   5  each control reaches its own destination
 *   6  the connect control survives a refusal
 *   7  the readout containers are announced (role=status + aria-live=polite)
 *   8  the room refusal interrupts nothing — no navigation, no overlay
 *   9  the reflection beat still fires after a room refusal
 *   10 exactly one refusal card, ever — never a list of reasons
 *   11 no folder name can widen the card
 *   12 no digit, no absence and no time-gap language in the refusal
 *   13 every sentence is byte-identical to her recorded choice
 *   14 an ordinary failure still paints the shipped quiet-error line
 *   15 a refusal outcome paints the card and NOT that line
 *
 * Run contract: exactly one machine-readable line per case, at line start,
 * no prefix — `ok: <case-name>` or `FAIL: <case-name>` — then the violation
 * detail, then exit 1 if anything failed. ⛔ No case carries a description
 * string that could print in place of its name.
 *
 * Zero-dep node (fs/path/os only), path-independent via __dirname.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
// The REAL escaping core, handed to the harness rather than stood in for: an
// escaper stand-in in a suite about what the room SAYS would sit between her
// sentence and the assertion.
const StudyCore = require(path.join(ROOT, 'core.js'));

const violations = [];

/* ---- lifting, never re-typing --------------------------------------------
 *
 * The harness NEVER re-types a shipped constant or a shipped function body
 * into this file. A suite that restates the code pins whatever the code
 * happens to say — the mirror trap this project keeps paying for.
 */

// Slice a top-level function body: from its `function name(` keyword to the
// next module-indent function declaration, trimmed at its own closing brace.
function functionBody(name) {
  const marker = 'function ' + name + '(';
  const start = appSrc.indexOf(marker);
  if (start === -1) {
    violations.push('[2697-10] ' + APP + ": function '" + name +
      "' not found — renamed, removed, or not yet written; update this " +
      'gate deliberately');
    return '';
  }
  const end = appSrc.indexOf('\n  function ', start + marker.length);
  const raw = appSrc.slice(start, end === -1 ? appSrc.length : end);
  const close = raw.lastIndexOf('\n  }');
  return close === -1 ? raw : raw.slice(0, close + 4);
}

function varLiteral(name, fallback) {
  const re = new RegExp('\\bvar ' + name +
    " = ('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\");");
  const m = appSrc.match(re);
  if (!m) {
    violations.push('[2697-10] ' + APP + ": constant '" + name +
      "' not found as a single string literal — update this gate " +
      'deliberately');
    return JSON.stringify(fallback);
  }
  return m[1];
}

// varLiteral returns the LITERAL SOURCE (quotes and escapes intact) because
// its job is to be injected into generated code. A byte pin needs the VALUE,
// so this evaluates the literal once. Returns null when the constant is not a
// plain string literal, so a pin can say so rather than compare undefined.
function varValue(name) {
  const raw = varLiteral(name, null);
  if (raw === 'null') { return null; }
  try { return new Function('return (' + raw + ');')(); }
  catch (e) { return null; }
}

function frozenObjectLiteral(name) {
  const m = appSrc.match(new RegExp(
    '\\bvar ' + name + ' = (Object\\.freeze\\(\\{[\\s\\S]*?\\}\\));'));
  if (!m) {
    violations.push('[2697-10] ' + APP + ": frozen object '" + name +
      "' not found — update this gate deliberately");
    return 'Object.freeze({})';
  }
  return m[1];
}

function objectLiteral(name) {
  const m = appSrc.match(new RegExp(
    '\\bvar ' + name + ' = (\\{[\\s\\S]*?\\});'));
  if (!m) {
    violations.push('[2697-10] ' + APP + ": object '" + name +
      "' not found — update this gate deliberately");
    return '{}';
  }
  return m[1];
}

/* ---- her record -----------------------------------------------------------
 *
 * ⛔ THE RECORD CANNOT BE NAMED HERE BY PATH: it lives in the planning vault,
 * and tools/stage_public.py's DENY gate refuses a home-directory path in any
 * tracked file. So the rows are kept as a tracked VERBATIM EXTRACT beside
 * this suite, and whenever the record itself is reachable the extract is
 * additionally asserted EQUAL to it — so the extract cannot drift away from
 * what she chose without case 13 going red.
 */
const COPY_EXTRACT = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'copy-2697-rows.json'), 'utf8'));

function planningPhaseFile(basename) {
  if (process.env.STUDY_COPY_RECORD && basename.indexOf('COPY') !== -1) {
    return process.env.STUDY_COPY_RECORD;
  }
  if (process.env.STUDY_UI_SPEC && basename.indexOf('UI-SPEC') !== -1) {
    return process.env.STUDY_UI_SPEC;
  }
  return path.join(os.homedir(), 'Library', 'Mobile Documents',
    'iCloud~md~obsidian', 'Documents', 'Project Tracker', 'Project Tracker',
    'Claude Project', 'Obsidian Visual House', '.planning', 'phases',
    '26.97-the-obsidian-vault-adapter-liveness-not-import-added-2026-08',
    basename);
}

// Parse the record's own table: her wording is the LAST backtick-quoted cell.
function readCopyRecord() {
  let src;
  try { src = fs.readFileSync(planningPhaseFile('26.97-COPY.md'), 'utf8'); }
  catch (e) { return null; }
  const rows = {};
  src.split('\n').forEach(function (line) {
    const m = line.match(/^\|\s*(C\d+)\s*\|(.*)\|\s*$/);
    if (!m) { return; }
    const cells = m[2].split('|').map(function (s) { return s.trim(); });
    const q = cells[cells.length - 1].match(/^`([\s\S]*)`$/);
    if (q && !Object.prototype.hasOwnProperty.call(rows, m[1])) {
      rows[m[1]] = q[1];
    }
  });
  return rows;
}

// C11's recorded answer is "both controls, `try again` first" — a CHOICE
// between the candidates, not a sentence. The two labels themselves are the
// A and B candidates she was shown for that row, and they live in the spec's
// candidate table. Read them from there so the labels in the code are
// likewise hers and cannot drift from what she was offered.
function readC11Candidates() {
  let src;
  try { src = fs.readFileSync(planningPhaseFile('26.97-UI-SPEC.md'), 'utf8'); }
  catch (e) { return null; }
  let found = null;
  src.split('\n').forEach(function (line) {
    if (found) { return; }
    const m = line.match(/^\|\s*C11\s*\|(.*)\|\s*$/);
    if (!m) { return; }
    const cells = m[1].split('|').map(function (s) { return s.trim(); });
    // cells = [description, A, B, C]
    const a = (cells[1] || '').match(/^`([\s\S]*)`$/);
    const b = (cells[2] || '').match(/^`([\s\S]*)`$/);
    if (a && b) { found = { A: a[1], B: b[1] }; }
  });
  return found;
}

/* ---- the controllable page ------------------------------------------------
 *
 * One settings readout, one room panel, one fake `$`, one synchronous
 * `apiPost` scripted with the outcome under test. Every function whose
 * BEHAVIOUR is under test is LIFTED from app.js; only the surrounding
 * machinery is stubbed, and every stub is a RECORDER so an assertion can be
 * a positive number rather than an inference from silence.
 */
function refusalHarness(opts) {
  opts = opts || {};
  const rec = { collects: [], pickers: [], screens: [], views: [],
    created: [], progressReads: 0, reenabled: 0, seam: 0, posts: [],
    els: {}, roomEl: null };
  const response = opts.response ||
    { ok: true, status: 200, data: { ok: true, running: true } };
  const api = new Function('rec', 'StudyCore', 'RESPONSE', `
    function makeEl(id) {
      return { id: id, disabled: false, listeners: {}, attrs: {},
        style: {}, children: [],
        setAttribute: function (k, v) { this.attrs[k] = v; },
        getAttribute: function (k) {
          return Object.prototype.hasOwnProperty.call(this.attrs, k) ?
            this.attrs[k] : null; },
        appendChild: function (c) { this.children.push(c); return c; },
        addEventListener: function (ev, fn) {
          if (!this.listeners[ev]) { this.listeners[ev] = []; }
          this.listeners[ev].push(fn); },
        click: function () {
          (this.listeners.click || []).forEach(function (f) { f(); }); } };
    }
    // ⚠ A REAL PAGE DESTROYS THE OLD NODES WHEN innerHTML IS REPLACED, so a
    // later lookup of the same id returns a NEW element with no listeners on
    // it. The first cut of this harness cached its stubs across a
    // replacement, so a re-render appeared to wire the SAME control twice —
    // an artifact of the stand-in, not of the room. Modelled properly here:
    // setting innerHTML drops every stub whose id was in the OLD markup.
    function makeBox(id) {
      var b = makeEl(id);
      var html = '';
      b.querySelectorAll = function () {
        return { forEach: function () {} }; };
      Object.defineProperty(b, 'innerHTML', {
        get: function () { return html; },
        set: function (v) {
          // ⚠ DOUBLE BACKSLASH ON PURPOSE. This regex lives inside a
          // TEMPLATE LITERAL, which eats one level of backslash before the
          // generated source is ever parsed. Written with a single one it
          // silently became a pattern matching the letters s-i-d, matched
          // nothing, and this invalidation quietly did NOTHING while its
          // own comment said otherwise — the mirror trap wearing a new hat.
          // ⛔ No backtick may appear in this comment either: one would
          // close the template literal the whole harness is written in.
          var re = /\\sid="([^"]*)"/g, m;
          while ((m = re.exec(String(html))) !== null) {
            delete rec.els[m[1]];
          }
          html = String(v);
        }
      });
      return b;
    }
    var settingsBox = makeBox('manage-sources-readout');
    var roomHost = makeEl('screen-room');
    rec.settingsBox = settingsBox;
    rec.roomHost = roomHost;
    var document = { createElement: function (tag) {
      rec.created.push(tag); return makeBox(''); } };
    function $(id) {
      if (id === 'manage-sources-readout') { return settingsBox; }
      if (id === 'screen-room') { return roomHost; }
      if (id === 'room-repull-readout') { return rec.roomEl; }
      var html = String(settingsBox.innerHTML) +
        (rec.roomEl ? String(rec.roomEl.innerHTML) : '');
      if (html.indexOf('id="' + id + '"') === -1) { return null; }
      if (!rec.els[id]) { rec.els[id] = makeEl(id); }
      return rec.els[id];
    }
    var DESIGN = false;
    var ADAPTER_BUTTON_IDS = ${objectLiteral('ADAPTER_BUTTON_IDS')};
    var ACTIVE_ADAPTER = { source: 'apple-notes',
      btnId: 'btn-onb-source-notes' };
    var VAULT_SOURCE = ${varLiteral('VAULT_SOURCE', 'obsidian-vault')};
    var SOURCE_EXCLUSION_META = ${frozenObjectLiteral('SOURCE_EXCLUSION_META')};
    var VAULT_PICKER_UNREACHABLE = ${varLiteral('VAULT_PICKER_UNREACHABLE', '?')};
    var VAULT_REFUSAL_TITLE = ${varLiteral('VAULT_REFUSAL_TITLE', '?')};
    var VAULT_REFUSAL_WHY = ${varLiteral('VAULT_REFUSAL_WHY', '?')};
    var VAULT_REFUSAL_NEXT = ${varLiteral('VAULT_REFUSAL_NEXT', '?')};
    var VAULT_REFUSAL_RETRY = ${varLiteral('VAULT_REFUSAL_RETRY', '?')};
    var VAULT_REFUSAL_PRIVATE = ${varLiteral('VAULT_REFUSAL_PRIVATE', '?')};
    var REPULL = { busy: false, queue: [], excludes: {}, brought: 0,
      onDone: null, holding: null };
    REPULL.onDone = function () { rec.seam++; };
    function reenableNotes() { rec.reenabled++; }
    function readAdapterProgress() { rec.progressReads++; }
    function renderVaultFolderPicker(box) {
      rec.pickers.push(box === settingsBox ? 'settings' :
        (box === rec.roomEl ? 'room' : 'other')); }
    function showScreen(s) { rec.screens.push(s); }
    function pushView(v) { rec.views.push(v); }
    function apiPost(pathname, body) {
      rec.posts.push({ path: pathname, body: body });
      return { then: function (okFn) {
        okFn(RESPONSE);
        return { catch: function () { return null; } };
      } };
    }
    ${functionBody('escapeHtml')}
    ${functionBody('count')}
    ${functionBody('importEtaLine')}
    ${functionBody('errorText')}
    ${functionBody('sourceExclusionKey')}
    ${functionBody('consumeRepullSeam')}
    ${functionBody('roomRepullBox')}
    ${functionBody('adapterErrorCopy')}
    ${functionBody('renderAdapterProgress')}
    ${functionBody('renderAdapterError')}
    ${functionBody('renderVaultRefusal')}
    ${functionBody('runAdapterCollect')}
    return {
      settingsBox: settingsBox,
      roomHost: roomHost,
      roomBox: function () {
        rec.roomEl = (typeof roomRepullBox === 'function') ?
          roomRepullBox() : null;
        return rec.roomEl; },
      refuse: function (box, reason) {
        if (typeof renderVaultRefusal !== 'function') {
          throw new Error('renderVaultRefusal is not defined in app.js — ' +
            'the single refusal renderer this plan builds does not exist ' +
            'yet, so nothing can replace the readout region');
        }
        return renderVaultRefusal(box, reason); },
      errorCopy: function (m) { return adapterErrorCopy(m); },
      progress: renderAdapterProgress,
      error: renderAdapterError,
      collect: runAdapterCollect,
      el: function (id) { return rec.els[id] || null; },
      setActive: function (a) { ACTIVE_ADAPTER = a; },
      active: function () { return ACTIVE_ADAPTER; },
      repull: REPULL
    };`)(rec, StudyCore, response);
  api.rec = rec;
  return api;
}

// The connected-apps pane gets its own tiny page — it looks its own boxes up
// and the refusal never renders into it, only into the readout it contains.
function paneHarness(meta) {
  const rec = { collects: [], vaultPickers: 0, pickers: 0, disconnects: [] };
  const api = new Function('rec', 'META', 'StudyCore', `
    var box = { innerHTML: '',
      querySelectorAll: function () {
        return { forEach: function () {} }; } };
    var MANAGE = { meta: META };
    var PHOTOS_ONE_CLICK = true;
    var ASK_KEY_SOURCES = ${varLiteral('ASK_KEY_SOURCES', 'connected_sources')};
    var ASK_KEY_FILTERS = '\\u0000f', ASK_ROSTER_KEY = '\\u0000r',
        ASK_KEY_NAME = '\\u0000n', ASK_KEY_BATCH = '\\u0000b',
        ASK_KEY_VOICE = '\\u0000v';
    var ASK_SOURCE_BROUGHT_IN = ${varLiteral('ASK_SOURCE_BROUGHT_IN', '?')};
    var ASK_SOURCE_STOPS = ${varLiteral('ASK_SOURCE_STOPS', '?')};
    var ASK_VALUE_LINE_STYLE = '';
    var CONNECTED_SOURCE_NAMES = ${frozenObjectLiteral(
      'CONNECTED_SOURCE_NAMES')};
    var VAULT_SOURCE = ${varLiteral('VAULT_SOURCE', 'obsidian-vault')};
    var VAULT_STATUS_TAIL = ${varLiteral('VAULT_STATUS_TAIL', '?')};
    var VAULT_CONNECT_SUBLABEL = ${varLiteral('VAULT_CONNECT_SUBLABEL', '?')};
    var VAULT_COLLECT_LABEL = ${varLiteral('VAULT_COLLECT_LABEL', '?')};
    function askStateLine() { return ''; }
    function askEffectiveOn() { return false; }
    function askValueText() { return ''; }
    function askNameLine() { return ''; }
    function filterRowLabel() { return ''; }
    function manageSourcesBox() { return box; }
    function $() { return null; }
    function enterVaultImport() {}
    function renderNotesFolderPicker() { rec.pickers++; }
    function renderVaultFolderPicker() { rec.vaultPickers++; }
    function handleSourceDisconnect(s) { rec.disconnects.push(s); }
    function showScreen() {}
    function runAdapterCollect(source) { rec.collects.push(source); }
    function apiGet() {
      return { then: function (okFn) {
        okFn({ ok: true, data: { meta: META } });
        return { catch: function () {} };
      } };
    }
    ${functionBody('escapeHtml')}
    ${functionBody('escapeAttr')}
    ${functionBody('connectedSourceName')}
    ${functionBody('connectedSourceStatus')}
    ${functionBody('renderConnectedSourcesSection')}
    return { box: box, renderPane: renderConnectedSourcesSection };`)(
    rec, meta, StudyCore);
  api.rec = rec;
  return api;
}

/* ---- reading what rendered, BY VALUE -------------------------------------- */

const VOID_TAGS = ['input', 'br', 'hr', 'img', 'meta', 'link', 'source'];

// The region's DIRECT children, each named by tag + class + id. ⚠ This is
// what carries the loudness: a check that only asked whether the card is
// PRESENT would pass while it sat beside a progress bar, which is precisely
// what the contract forbids.
function topLevelChildren(html) {
  const out = [];
  let depth = 0;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let m;
  while ((m = re.exec(String(html))) !== null) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (closing) { depth -= 1; continue; }
    if (depth === 0) {
      const cls = (attrs.match(/class="([^"]*)"/) || [null, ''])[1];
      const id = (attrs.match(/\sid="([^"]*)"/) || [null, ''])[1];
      out.push(tag +
        (cls ? '.' + cls.trim().split(/\s+/).join('.') : '') +
        (id ? '#' + id : ''));
    }
    if (VOID_TAGS.indexOf(tag) === -1 && !/\/\s*$/.test(attrs)) {
      depth += 1;
    }
  }
  return out;
}

// Every `<button ...>` in the rendered subtree, with its own label text.
function buttons(html) {
  const out = [];
  const re = /<button([^>]*)>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(String(html))) !== null) {
    const attrs = m[1] || '';
    out.push({
      id: (attrs.match(/\sid="([^"]*)"/) || [null, ''])[1],
      type: (attrs.match(/\stype="([^"]*)"/) || [null, ''])[1],
      style: (attrs.match(/\sstyle="([^"]*)"/) || [null, ''])[1],
      cls: (attrs.match(/\sclass="([^"]*)"/) || [null, ''])[1],
      label: m[2]
    });
  }
  return out;
}

function textOf(html) {
  return String(html).replace(/<[^>]*>/g, ' ');
}

/* ---- the two detectors, each proven able to fire -------------------------- */

// The room's red, spelled every way it can reach a subtree: the token by
// name, the raw hex behind it, the shipped class that carries it, and the
// never-register button class. ⚠ A check that looked at only one of these
// would pass while the card was red.
const RED_MARKERS = ['--never', '#9a2828', 'quiet-error', 'btn-never',
  '--accent', '#e8503a'];

function redHits(html) {
  const lower = String(html).toLowerCase();
  return RED_MARKERS.filter(function (tok) {
    return lower.indexOf(tok) !== -1;
  });
}

const FORBIDDEN_ABSENCE = ['since you', 'days ago', "it's been", 'streak',
  'checkmark', 'day-count', 'last synced', 'nothing new since', 'still no',
  'haven’t', 'hasn’t been', 'a while since', 'ago'];

function absenceHits(text) {
  const lower = String(text).toLowerCase();
  return FORBIDDEN_ABSENCE.filter(function (tok) {
    return lower.indexOf(tok) !== -1;
  });
}

function digitHits(text) {
  const m = String(text).match(/[0-9]/g);
  return m === null ? [] : m;
}

/* ---- the run harness ------------------------------------------------------ */

function caseAssert(cond, msg) {
  if (!cond) { throw new Error(msg); }
}

function runCase(name, fn) {
  let failure = null;
  try { fn(); } catch (e) {
    failure = (e && e.message) ? e.message : String(e);
  }
  if (failure === null) {
    console.log('ok: ' + name);
  } else {
    console.log('FAIL: ' + name);
    violations.push('[2697-10] ' + name + ': ' + failure);
  }
}

const REFUSED_409 = { ok: false, status: 409,
  data: { ok: false, refused: true, source: 'obsidian-vault',
    reason: 'fence_not_applicable' } };
const ORDINARY_500 = { ok: false, status: 500,
  data: { ok: false, error: 'the collect could not finish' } };

const PROGRESS_SNAP = { state: 'running', done: 4, total: 11,
  started_ms: Date.now() };

/* ---- 1. the refusal REPLACES the settings readout ------------------------- */

runCase('settings-refusal-replaces-the-region', function () {
  const h = refusalHarness();
  // A progress readout FIRST, so "the card is present" cannot pass for
  // "the card is the region".
  h.progress(h.settingsBox, PROGRESS_SNAP);
  const before = topLevelChildren(h.settingsBox.innerHTML);
  caseAssert(before.length === 3, 'the shipped progress readout rendered ' +
    before.length + ' top-level child element(s) into the settings ' +
    'readout; exactly 3 are expected, so this case is measuring the real ' +
    'thing it is meant to replace');
  h.refuse(h.settingsBox);
  const after = topLevelChildren(h.settingsBox.innerHTML);
  caseAssert(after.length === 1, 'after the refusal the settings readout ' +
    'holds ' + after.length + ' top-level child element(s): ' +
    JSON.stringify(after) + '. Exactly 1 is required — the refusal ' +
    'REPLACES the region and is its sole occupant. That is how it is loud.');
  caseAssert(after[0] === 'div.card', 'the one child is ' +
    JSON.stringify(after[0]) + ', not "div.card" — the refusal must wear ' +
    'the shipped card recipe');
  const html = String(h.settingsBox.innerHTML);
  caseAssert(html.indexOf('copying your things in') === -1 &&
    html.indexOf(' of ' + PROGRESS_SNAP.total) === -1,
    'the progress readout survived beside the refusal; no progress bar, ' +
    'no partial report and no half-success line may share the region');
  caseAssert(h.rec.created.length === 0, 'the refusal created ' +
    h.rec.created.length + ' element(s) outside the region it was given; ' +
    'nothing may rest after the render');
});

/* ---- 2. and it replaces the room's own panel too -------------------------- */

runCase('room-refusal-replaces-the-panel-and-wears-the-card', function () {
  const h = refusalHarness();
  const panel = h.roomBox();
  caseAssert(panel !== null && panel !== undefined,
    "the room's shipped readout panel could not be stood up; the refusal " +
    'has no in-room home and this plan may not build one');
  // The panel's own shipped last word first, so replacement is measured.
  panel.innerHTML = '<p>brought in 3 things.</p>';
  h.setActive({ source: 'obsidian-vault', btnId: null, exclude: [],
    box: panel, room: true });
  h.refuse(panel);
  const after = topLevelChildren(panel.innerHTML);
  caseAssert(after.length === 1, "the room's panel holds " + after.length +
    ' top-level child element(s) after the refusal: ' +
    JSON.stringify(after) + '. Exactly 1 is required.');
  caseAssert(after[0] === 'div.card', 'the in-room refusal rendered ' +
    JSON.stringify(after[0]) + ' rather than "div.card" — the panel is a ' +
    'plain container, so the refusal must supply the card recipe there');
  caseAssert(String(panel.innerHTML).indexOf('brought in 3 things') === -1,
    "the panel's previous line survived beside the refusal");
});

/* ---- 3. no red, on either surface ----------------------------------------- */

runCase('refusal-spends-no-red-on-either-surface', function () {
  // The detector is proven able to fire BEFORE it is trusted: the shipped
  // quiet-error line is red by construction, and it must trip every arm.
  const control = refusalHarness();
  control.error(control.settingsBox, 'a control line');
  const controlHits = redHits(control.settingsBox.innerHTML);
  caseAssert(controlHits.length > 0, 'the no-red detector did not fire on ' +
    'the SHIPPED quiet-error line, which carries the room’s red by ' +
    'construction — a detector that cannot fire proves nothing');

  const h = refusalHarness();
  h.refuse(h.settingsBox);
  const settingsHits = redHits(h.settingsBox.innerHTML);
  caseAssert(settingsHits.length === 0, 'the settings refusal spends the ' +
    "room's reserved colours: " + JSON.stringify(settingsHits) + '. Red ' +
    'here already means it failed or never show this; a refusal means the ' +
    'room protected her, and painting it red would teach her that a ' +
    'working protection looks like a fault.');
  const panel = h.roomBox();
  h.refuse(panel);
  const roomHits = redHits(panel.innerHTML);
  caseAssert(roomHits.length === 0, 'the in-room refusal spends the ' +
    "room's reserved colours: " + JSON.stringify(roomHits));
  // Non-vacuous: something actually rendered into both.
  caseAssert(topLevelChildren(h.settingsBox.innerHTML).length === 1 &&
    topLevelChildren(panel.innerHTML).length === 1,
    'nothing rendered, so the absence of red is vacuous');
  caseAssert(String(h.settingsBox.innerHTML).indexOf('transition') === -1 &&
    String(h.settingsBox.innerHTML).indexOf('animation') === -1,
    'the refusal added motion; the motion fence binds this surface');
});

/* ---- 4. both controls, in her order --------------------------------------- */

runCase('refusal-carries-both-controls-in-her-order', function () {
  const h = refusalHarness();
  h.refuse(h.settingsBox);
  const btns = buttons(h.settingsBox.innerHTML);
  caseAssert(btns.length === 2, 'the refusal rendered ' + btns.length +
    ' control(s); exactly 2 are required (OD-3) — a refusal is never a ' +
    'dead end, and the way back to her private folders is usually the ' +
    'thing that needs changing');
  btns.forEach(function (b, i) {
    caseAssert(b.type === 'button', 'control ' + (i + 1) + ' has type ' +
      JSON.stringify(b.type) + '; a real focusable button is required');
    caseAssert(b.id !== '', 'control ' + (i + 1) + ' has no id, so it can ' +
      'never be reached and wired');
  });
  const rows = readC11Candidates();
  const first = rows ? rows.A : COPY_EXTRACT.C11A;
  const second = rows ? rows.B : COPY_EXTRACT.C11B;
  caseAssert(btns[0].label === first, 'the FIRST control reads ' +
    JSON.stringify(btns[0].label) + ', not her recorded ' +
    JSON.stringify(first) + ' — C11 records both controls with try-again ' +
    'first');
  caseAssert(btns[1].label === second, 'the SECOND control reads ' +
    JSON.stringify(btns[1].label) + ', not her recorded ' +
    JSON.stringify(second));
});

/* ---- 5. each control reaches its own destination -------------------------- */

runCase('each-control-reaches-its-own-destination', function () {
  const h = refusalHarness({ response: REFUSED_409 });
  h.setActive({ source: 'obsidian-vault', btnId: null,
    exclude: ['Journal'], box: h.settingsBox, room: false });
  h.refuse(h.settingsBox);
  const btns = buttons(h.settingsBox.innerHTML);
  caseAssert(btns.length === 2, 'expected 2 controls, found ' + btns.length);

  const retry = h.el(btns[0].id);
  const back = h.el(btns[1].id);
  caseAssert(retry !== null, 'the first control was never wired');
  caseAssert(back !== null, 'the second control was never wired');
  caseAssert((retry.listeners.click || []).length === 1,
    'the first control carries ' + (retry.listeners.click || []).length +
    ' click listener(s); exactly 1 — a leaked listener is a rest');
  caseAssert((back.listeners.click || []).length === 1,
    'the second control carries ' + (back.listeners.click || []).length +
    ' click listener(s); exactly 1');

  const postsBefore = h.rec.posts.length;
  retry.click();
  caseAssert(h.rec.posts.length === postsBefore + 1,
    'the first control ran ' + (h.rec.posts.length - postsBefore) +
    ' collect(s); exactly 1 re-attempt is required');
  const sent = h.rec.posts[h.rec.posts.length - 1];
  caseAssert(sent.path === '/api/adapter/collect',
    'the retry went to ' + JSON.stringify(sent.path) +
    ' rather than the collect route');
  caseAssert(sent.body.source === 'obsidian-vault',
    'the retry re-ran ' + JSON.stringify(sent.body.source) +
    ' rather than the source that refused — a retry never changes what ' +
    'is being brought in');
  caseAssert(JSON.stringify(sent.body.exclude_folders) ===
    JSON.stringify(['Journal']),
    'the retry sent ' + JSON.stringify(sent.body.exclude_folders) +
    ' as the kept-out folders rather than the SAME list; a retry never ' +
    'silently widens what comes in (law 5)');

  const pickersBefore = h.rec.pickers.length;
  back.click();
  caseAssert(h.rec.pickers.length === pickersBefore + 1,
    'the second control opened ' + (h.rec.pickers.length - pickersBefore) +
    ' folder list(s); exactly 1 is required — this is the way back to the ' +
    'folders she keeps private');
  caseAssert(h.rec.pickers[h.rec.pickers.length - 1] === 'settings',
    'the second control opened the folder list somewhere other than the ' +
    'region the refusal was rendered into (' +
    h.rec.pickers[h.rec.pickers.length - 1] + ')');
  caseAssert(h.rec.posts.length === postsBefore + 1,
    'the second control also ran a collect; the two controls must reach ' +
    'DIFFERENT destinations — two buttons doing the same thing would pass ' +
    'a count and fail her');
  caseAssert(h.rec.screens.length === 0 && h.rec.views.length === 0,
    'a control navigated away; both routes stay in the region');
});

/* ---- 6. the connect control survives a refusal ---------------------------- */

runCase('connect-control-survives-a-refusal', function () {
  const pane = paneHarness({ vault_root: '/somewhere/vault',
    connected_sources: [] });
  pane.renderPane();
  const paneHtml = String(pane.box.innerHTML);
  caseAssert(paneHtml.indexOf('id="btn-manage-vault-collect"') !== -1,
    'the pane rendered no control that can start a vault collect, so this ' +
    'case cannot see one survive');
  caseAssert(paneHtml.indexOf('id="manage-sources-readout"') !== -1,
    'the pane holds no readout region for the refusal to replace');

  // The refusal writes into the readout the pane CONTAINS, never into the
  // pane itself: the pane's own markup must be byte-identical afterwards.
  const h = refusalHarness();
  h.refuse(h.settingsBox);
  caseAssert(String(pane.box.innerHTML) === paneHtml,
    "the pane's own markup moved when the refusal rendered; a refusal must " +
    'never be able to remove the control she needs next');
  caseAssert(String(pane.box.innerHTML)
    .indexOf('id="btn-manage-vault-collect"') !== -1,
    'the connect control is gone after a refusal — she would be left with ' +
    'a disconnect control and nothing else, which is the 26.65 stranding ' +
    'trap and must not repeat');
});

/* ---- 7. the readout containers are announced ------------------------------ */

runCase('readout-containers-are-announced', function () {
  const pane = paneHarness({ vault_root: '/somewhere/vault',
    connected_sources: [] });
  pane.renderPane();
  const html = String(pane.box.innerHTML);
  const m = html.match(/<div id="manage-sources-readout"([^>]*)>/);
  caseAssert(m !== null, 'the settings readout container was not rendered');
  caseAssert(/role="status"/.test(m[1]), 'the settings readout container ' +
    'carries no role="status"; the refusal is the single message in this ' +
    'phase that must not be missed');
  caseAssert(/aria-live="polite"/.test(m[1]), 'the settings readout ' +
    'container carries no aria-live="polite"');

  const h = refusalHarness();
  const panel = h.roomBox();
  caseAssert(panel !== null, "the room's panel could not be stood up");
  caseAssert(panel.getAttribute('role') === 'status',
    "the room's readout panel carries role " +
    JSON.stringify(panel.getAttribute('role')) + ', not "status"');
  caseAssert(panel.getAttribute('aria-live') === 'polite',
    "the room's readout panel carries aria-live " +
    JSON.stringify(panel.getAttribute('aria-live')) + ', not "polite"');
});

/* ---- 8. the room refusal interrupts nothing ------------------------------- */

runCase('room-refusal-does-not-interrupt-her', function () {
  const h = refusalHarness({ response: REFUSED_409 });
  const panel = h.roomBox();
  const createdAfterPanel = h.rec.created.length;
  h.repull.busy = true;
  h.repull.queue = [];
  h.collect('obsidian-vault', ['Journal'], panel, true);
  caseAssert(h.rec.screens.length === 0, 'the in-room refusal navigated ' +
    'to ' + JSON.stringify(h.rec.screens) + '. She pressed nothing.');
  caseAssert(h.rec.views.length === 0, 'the in-room refusal pushed a view ' +
    '(' + JSON.stringify(h.rec.views) + '); no popup, no modal, no ' +
    'navigation');
  caseAssert(h.rec.created.length === createdAfterPanel,
    'the in-room refusal created ' +
    (h.rec.created.length - createdAfterPanel) + ' new element(s) — an ' +
    'overlay. The panel already ships and is the only home.');
  caseAssert(h.rec.els['room-obj-candle'] === undefined,
    'the in-room refusal touched the candle body; the candle shows ' +
    'motion, the panel shows words');
  caseAssert(topLevelChildren(panel.innerHTML).length === 1,
    'the in-room refusal did not land as the sole occupant of the panel');
  caseAssert(h.repull.busy === false,
    'the re-pull was left marked busy after a refusal, so her next candle ' +
    'tap would do nothing');
});

/* ---- 9. the reflection beat still fires ----------------------------------- */

runCase('reflection-beat-still-fires-after-a-room-refusal', function () {
  const h = refusalHarness({ response: REFUSED_409 });
  const panel = h.roomBox();
  caseAssert(h.rec.seam === 0, 'the completion seam had already fired ' +
    'before the refusal, so this case cannot see it fire because of one');
  h.repull.busy = true;
  h.collect('obsidian-vault', [], panel, true);
  caseAssert(h.rec.seam === 1, 'the reflection beat fired ' + h.rec.seam +
    ' time(s) after an in-room refusal; exactly 1 is required. Holding it ' +
    'would mean a tap on the candle produced no reflection session for ' +
    'twenty minutes — that is not a readout being honest, it is the room ' +
    'going dead under her hand.');
});

/* ---- 10. exactly one card, ever ------------------------------------------- */

runCase('exactly-one-refusal-card-renders', function () {
  const h = refusalHarness();
  h.refuse(h.settingsBox);
  h.refuse(h.settingsBox);
  const cards = String(h.settingsBox.innerHTML)
    .split('class="card"').length - 1;
  caseAssert(cards === 1, 'two refusals left ' + cards + ' card(s) in the ' +
    'region; exactly 1 — S3 zero-one-many, never a list of reasons and ' +
    'never a second card');
  const titles = String(h.settingsBox.innerHTML)
    .split('class="card-title"').length - 1;
  caseAssert(titles === 1, 'the region holds ' + titles + ' card title(s); ' +
    'exactly 1');
});

/* ---- 11. no folder name can widen the card -------------------------------- */

runCase('no-folder-name-can-widen-the-refusal-card', function () {
  const long = 'Clippings/journal/chatgpt/' + 'a'.repeat(400);
  const plain = refusalHarness();
  plain.setActive({ source: 'obsidian-vault', btnId: null, exclude: [],
    box: plain.settingsBox, room: false });
  plain.refuse(plain.settingsBox);

  const loaded = refusalHarness();
  loaded.setActive({ source: 'obsidian-vault', btnId: null,
    exclude: [long, 'Journal'], box: loaded.settingsBox, room: false });
  loaded.refuse(loaded.settingsBox);

  caseAssert(String(loaded.settingsBox.innerHTML) ===
    String(plain.settingsBox.innerHTML),
    'the refusal card changed when a very long folder name was in play, ' +
    'so her data reaches the card and can widen it. Her recorded wording ' +
    'places no folder name in the refusal, so the card must be built from ' +
    'her three sentences and two labels alone.');
  caseAssert(String(loaded.settingsBox.innerHTML).indexOf(long) === -1,
    'a folder name reached the refusal card');
  // Whatever the card contains, its own text is single-line by construction:
  // no element inside it is wider than her longest recorded sentence.
  const lines = textOf(loaded.settingsBox.innerHTML)
    .split(/\s{2,}/).filter(function (s) { return s.trim() !== ''; });
  lines.forEach(function (line) {
    caseAssert(line.trim().length <= 200, 'the refusal carries a ' +
      line.trim().length + '-character run, which would widen the card');
  });
});

/* ---- 12. nothing counted, nothing about absence --------------------------- */

runCase('no-digit-and-no-absence-language-in-the-refusal', function () {
  // Both detectors proven able to fire before they are trusted.
  const plantedCount = 'we kept 3 folders out for you';
  const plantedGap = "it's been a while since you brought anything in";
  caseAssert(digitHits(plantedCount).length > 0,
    'the digit detector did not fire on a planted count');
  caseAssert(absenceHits(plantedGap).length > 0,
    'the absence/time-gap detector did not fire on a planted line');

  const h = refusalHarness();
  h.refuse(h.settingsBox);
  const text = textOf(h.settingsBox.innerHTML);
  caseAssert(text.trim() !== '', 'nothing rendered, so both absences are ' +
    'vacuous');
  const digits = digitHits(text);
  caseAssert(digits.length === 0, "the refusal's own copy carries the " +
    'digit(s) ' + JSON.stringify(digits) + '; nothing kept out may ever be ' +
    'counted back at her (law 3 / law 7)');
  const gaps = absenceHits(text);
  caseAssert(gaps.length === 0, 'the refusal carries absence or time-gap ' +
    'language: ' + JSON.stringify(gaps));
  caseAssert(text.indexOf('/') === -1, 'the refusal carries a path ' +
    'separator; plain words only — no path, no error code, no stack trace');
  caseAssert(!/\b(Error|Traceback|status|409|500|refused_)\b/.test(text),
    'the refusal carries an error code or trace fragment');
  caseAssert(text.indexOf('fence_not_applicable') === -1,
    "the server's outcome TOKEN reached her screen; it is a wire value the " +
    'client maps to her sentences, never rendered');
});

/* ---- 13. her words, byte-identical ---------------------------------------- */

runCase('every-refusal-sentence-is-byte-identical-to-her-record', function () {
  const record = readCopyRecord();
  const spec = readC11Candidates();
  const needed = ['C8', 'C9', 'C10'];
  needed.forEach(function (row) {
    caseAssert(Object.prototype.hasOwnProperty.call(COPY_EXTRACT, row) &&
      COPY_EXTRACT[row] !== '' && COPY_EXTRACT[row] !== null,
      'refusal row ' + row + ' is UNANSWERED in the tracked extract. ' +
      '⛔ STOP: no agent-authored sentence may ship on this surface.');
  });
  ['C11A', 'C11B'].forEach(function (row) {
    caseAssert(Object.prototype.hasOwnProperty.call(COPY_EXTRACT, row) &&
      COPY_EXTRACT[row] !== '', 'control label ' + row + ' is UNANSWERED ' +
      'in the tracked extract. ⛔ STOP.');
  });
  // The extract cannot drift away from the record itself.
  if (record !== null) {
    needed.forEach(function (row) {
      caseAssert(record[row] === COPY_EXTRACT[row],
        'the tracked extract for ' + row + ' is ' +
        JSON.stringify(COPY_EXTRACT[row]) + ' but her record says ' +
        JSON.stringify(record[row]));
    });
  }
  if (spec !== null) {
    caseAssert(spec.A === COPY_EXTRACT.C11A && spec.B === COPY_EXTRACT.C11B,
      'the tracked extract for C11 is ' +
      JSON.stringify([COPY_EXTRACT.C11A, COPY_EXTRACT.C11B]) +
      ' but the candidates she chose between are ' +
      JSON.stringify([spec.A, spec.B]));
  }

  const h = refusalHarness();
  h.refuse(h.settingsBox);
  const html = String(h.settingsBox.innerHTML);
  const paras = [];
  const re = /<p([^>]*)>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (String(m[2]).indexOf('<button') === -1) { paras.push(m[2]); }
  }
  caseAssert(paras.length === 3, 'the refusal rendered ' + paras.length +
    ' sentence paragraph(s); exactly 3 are recorded (C8, C9, C10)');
  // — BYTE equality, never "contains" and never "starts with": her
  // punctuation, and its absence, is part of what she chose.
  caseAssert(paras[0] === StudyCore.escapeHtml(COPY_EXTRACT.C8),
    'the first line is ' + JSON.stringify(paras[0]) +
    ', not her recorded C8 ' + JSON.stringify(COPY_EXTRACT.C8));
  caseAssert(paras[1] === StudyCore.escapeHtml(COPY_EXTRACT.C9),
    'the why line is ' + JSON.stringify(paras[1]) +
    ', not her recorded C9 ' + JSON.stringify(COPY_EXTRACT.C9));
  caseAssert(paras[2] === StudyCore.escapeHtml(COPY_EXTRACT.C10),
    'the what-next line is ' + JSON.stringify(paras[2]) +
    ', not her recorded C10 ' + JSON.stringify(COPY_EXTRACT.C10));
  const btns = buttons(html);
  caseAssert(btns.length === 2 &&
    btns[0].label === StudyCore.escapeHtml(COPY_EXTRACT.C11A) &&
    btns[1].label === StudyCore.escapeHtml(COPY_EXTRACT.C11B),
    'the control labels are ' +
    JSON.stringify(btns.map(function (b) { return b.label; })) +
    ', not her recorded ' +
    JSON.stringify([COPY_EXTRACT.C11A, COPY_EXTRACT.C11B]) +
    ' — neither carries terminal punctuation and an agent may not add ' +
    'a full stop');
});

/* ---- 14. THE CONTROL: an ordinary failure is still an ordinary failure ---- */

runCase('an-ordinary-failure-still-paints-the-shipped-quiet-error',
  function () {
    const h = refusalHarness({ response: ORDINARY_500 });
    h.collect('obsidian-vault', [], h.settingsBox, false);
    const html = String(h.settingsBox.innerHTML);
    caseAssert(html.indexOf('class="quiet-error"') !== -1,
      'an ordinary collect failure did not paint the shipped quiet-error ' +
      'line; it rendered ' + JSON.stringify(html.slice(0, 160)));
    caseAssert(html.indexOf('id="btn-adapter-retry"') !== -1,
      "the shipped error line's retry control is gone");
    caseAssert(html.indexOf('class="card-title"') === -1,
      'an ordinary collect failure painted a refusal card. The two must ' +
      'stay apart: the refusal wording on a failure retrying CAN fix would ' +
      'be a false sentence, and the failure wording on a refusal sends her ' +
      'into a retry loop against a condition retrying cannot change.');
    caseAssert(h.rec.reenabled === 1, 'the source control was re-enabled ' +
      h.rec.reenabled + ' time(s) on an ordinary failure; exactly 1');
  });

/* ---- 15. and a refusal outcome is not an ordinary failure ----------------- */

runCase('a-refusal-outcome-renders-the-refusal-not-the-quiet-error',
  function () {
    const h = refusalHarness({ response: REFUSED_409 });
    h.collect('obsidian-vault', ['Journal'], h.settingsBox, false);
    const html = String(h.settingsBox.innerHTML);
    caseAssert(html.indexOf('class="quiet-error"') === -1,
      'the refusal fell through to the shipped could-not-finish line');
    const kids = topLevelChildren(html);
    caseAssert(kids.length === 1 && kids[0] === 'div.card',
      'the refusal outcome rendered ' + JSON.stringify(kids) +
      ' rather than exactly one refusal card');
    caseAssert(h.rec.progressReads === 0,
      'a refusal started the progress chain (' + h.rec.progressReads +
      ' read(s)); nothing was staged, so there is nothing to read');
  });

/* ---- T-26.97-43 / T-26.97-29: the room may not state a false cause -------
 *
 * ADDED 2026-08-19 by /gsd-secure-phase. The server distinguishes three
 * refusal outcomes and ships them; the client read only the boolean, so a
 * vault the room could not FIND was told it had been stopped to protect her
 * private folders. Her recorded row for that case existed and was wired only
 * to the picker. Each case below has a control that keeps the fix from
 * being widened into saying the same thing every time.
 */

runCase('a-moved-vault-is-not-told-it-was-a-privacy-stop', function () {
  const h = refusalHarness();
  h.refuse(h.settingsBox, 'vault_missing');
  const text = textOf(h.settingsBox.innerHTML);
  caseAssert(text.indexOf('folders you keep private') === -1,
    'a vault the room could not FIND was told it was stopped to protect ' +
    'her private folders. That is a false statement of cause: ' +
    JSON.stringify(text));
  caseAssert(text.indexOf('reach your vault just now') !== -1,
    'the moved-vault refusal did not carry her recorded sentence for this ' +
    'exact case: ' + JSON.stringify(text));
});

runCase('an-unrecorded-vault-root-gets-the-same-recorded-sentence', function () {
  const h = refusalHarness();
  h.refuse(h.settingsBox, 'no_vault_root');
  const text = textOf(h.settingsBox.innerHTML);
  caseAssert(text.indexOf('folders you keep private') === -1,
    'no vault root recorded was reported as a privacy stop: ' +
    JSON.stringify(text));
  caseAssert(text.indexOf('reach your vault just now') !== -1,
    'her recorded sentence for an unreachable vault is missing: ' +
    JSON.stringify(text));
});

runCase('the-privacy-refusal-still-says-the-privacy-sentence', function () {
  // THE CONTROL. A fix routing EVERY refusal to the unreachable line would
  // pass both cases above while deleting the phase's headline behaviour.
  const h = refusalHarness();
  h.refuse(h.settingsBox, 'fence_unprovable');
  const text = textOf(h.settingsBox.innerHTML);
  caseAssert(text.indexOf('folders you keep private') !== -1,
    'the REAL privacy refusal lost her privacy sentence — the dispatch has ' +
    'been widened until it says the same thing every time: ' +
    JSON.stringify(text));
  caseAssert(text.indexOf('reach your vault just now') === -1,
    'the privacy refusal also carried the unreachable line: ' +
    JSON.stringify(text));
});

runCase('an-unknown-reason-keeps-the-shipped-privacy-wording', function () {
  const h = refusalHarness();
  h.refuse(h.settingsBox, undefined);
  const text = textOf(h.settingsBox.innerHTML);
  caseAssert(text.indexOf('folders you keep private') !== -1,
    'an unknown refusal reason changed the shipped wording: ' +
    JSON.stringify(text));
});

runCase('the-reason-actually-reaches-the-renderer-from-the-wire', function () {
  // ⚠ The card being ABLE to dispatch is not the same as the collect HANDING
  // it the reason. This drives the real response path.
  const h = refusalHarness({ response: { ok: false, status: 409,
    data: { ok: false, refused: true, source: 'obsidian-vault',
      reason: 'vault_missing' } } });
  h.setActive({ source: 'obsidian-vault', btnId: null, exclude: [],
    box: h.settingsBox, room: false });
  h.collect('obsidian-vault', [], h.settingsBox, false);
  const text = textOf(h.settingsBox.innerHTML);
  caseAssert(text.indexOf('reach your vault just now') !== -1,
    'the collect painted the refusal without passing the reason through, ' +
    'so the card cannot tell a moved vault from a privacy stop no matter ' +
    'what it would do with the token: ' + JSON.stringify(text));
});

runCase('a-vault-failure-does-not-say-Notes', function () {
  const h = refusalHarness();
  h.setActive({ source: 'obsidian-vault', btnId: null, exclude: [],
    box: h.settingsBox, room: false });
  const line = h.errorCopy('the collect could not finish');
  caseAssert(line.indexOf('Notes') === -1,
    'a VAULT failure rendered a sentence about her Notes: ' +
    JSON.stringify(line) + '. A wrong name here is a false sentence about ' +
    'her own data, which she has no way to check');
  caseAssert(line.indexOf('your vault') !== -1,
    'the vault failure line does not name the vault: ' + JSON.stringify(line));
});

runCase('the-two-Apple-sources-keep-their-byte-exact-lines', function () {
  // THE CONTROL for the case above: "no longer says Notes" must not be
  // reachable by breaking the sources that legitimately say it.
  const h = refusalHarness();
  h.setActive({ source: 'apple-notes', btnId: null });
  caseAssert(h.errorCopy('boom') ===
    "Couldn't reach Notes just now. Nothing was lost. Try again in a moment.",
    'the shipped Notes line changed: ' + JSON.stringify(h.errorCopy('boom')));
  h.setActive({ source: 'apple-photos', btnId: null });
  caseAssert(h.errorCopy('boom') ===
    "Couldn't reach Photos just now. Nothing was lost. Try again in a moment.",
    'the shipped Photos line changed: ' + JSON.stringify(h.errorCopy('boom')));
  caseAssert(h.errorCopy('please allow permission').indexOf('permission') !== -1,
    'the Photos permission branch was lost');
});

runCase('the-four-unpinned-picker-strings-are-pinned-to-her-record',
  function () {
    // T-26.97-14, /gsd-secure-phase 2026-08-19. The extract held C1-C4 and
    // C8-C12 only, so the four strings the code claims are byte-identical to
    // rows C5 / C6 / C7 / C14 had NOTHING holding them. They were correct on
    // the day they were checked by hand; nothing stopped them drifting, and
    // a hand check is not a pin.
    const record = readCopyRecord();
    const rows = ['C5', 'C6', 'C7', 'C14'];
    rows.forEach(function (row) {
      caseAssert(Object.prototype.hasOwnProperty.call(COPY_EXTRACT, row) &&
        COPY_EXTRACT[row] !== '' && COPY_EXTRACT[row] !== null,
        'row ' + row + ' is UNANSWERED in the tracked extract. ' +
        'STOP: no agent-authored sentence may ship on this surface.');
    });
    if (record !== null) {
      rows.forEach(function (row) {
        caseAssert(record[row] === COPY_EXTRACT[row],
          'the tracked extract for ' + row + ' is ' +
          JSON.stringify(COPY_EXTRACT[row]) + ' but her record says ' +
          JSON.stringify(record[row]));
      });
    }
    // ...and the SHIPPED constants are those bytes. Read out of app.js, so
    // this reddens if either side moves.
    const shipped = {
      C5: varValue('VAULT_PICKER_FRAMING'),
      C6: varValue('VAULT_PICKER_INSTRUCTION'),
      C7: varValue('VAULT_PICKER_CONFIRM'),
      C14: varValue('VAULT_PICKER_UNREACHABLE')
    };
    rows.forEach(function (row) {
      caseAssert(shipped[row] !== null,
        'the shipped constant for row ' + row + ' could not be read out of ' +
        'app.js, so this pin would silently hold nothing');
      caseAssert(shipped[row] === COPY_EXTRACT[row],
        'the shipped string for ' + row + ' is ' +
        JSON.stringify(shipped[row]) + ' but her recorded row is ' +
        JSON.stringify(COPY_EXTRACT[row]) + '. Her punctuation, and its ' +
        'absence, is part of what she chose');
    });
  });

runCase('the-pin-can-actually-fail', function () {
  // THE INVERSE DRILL. A pin that cannot redden is not a pin. This is the
  // recurring trap on this project: a check that mirrors what it checks.
  const real = varValue('VAULT_PICKER_CONFIRM');
  caseAssert(real !== null, 'the confirm constant could not be read at all');
  caseAssert(real !== real + ' ',
    'string comparison in this file is not distinguishing two different ' +
    'values, so every byte pin above is worthless');
  caseAssert(COPY_EXTRACT.C7 !== COPY_EXTRACT.C6,
    'two different recorded rows compare equal, so the pins cannot tell ' +
    'one sentence from another');
});

/* ---- T-26.97-14: row C13, shipped on her placement ruling ----------------
 *
 * She chose this sentence during the copy sitting and it was never put into
 * the app; the state it was written for counted zero at her instead. On
 * 2026-08-19 she ruled it belongs on the settings surface for ALL THREE
 * sources, and NOT in first-run. Driven on a real report object, because a
 * grep would only prove the string exists somewhere.
 */

function reportHarness() {
  const rec = { blessing: 0, onb: [] };
  return new Function('rec', 'StudyCore', `
    var ONB = { active: false };
    function makeBox(id) {
      return { id: id, innerHTML: '', children: [],
        appendChild: function (c) { this.children.push(c); return c; },
        addEventListener: function () {} };
    }
    var hosts = { 'import-report': makeBox('import-report'),
      'btn-continue': makeBox('btn-continue') };
    function $(id) {
      if (!hosts[id]) { hosts[id] = makeBox(id); }
      return hosts[id];
    }
    var document = { createElement: function () { return makeBox(''); } };
    function offerLibrarianAfterImport() {}
    function startBlessing() { rec.blessing++; }
    function onbGo(s) { rec.onb.push(s); }
    ${functionBody('escapeHtml')}
    ${functionBody('count')}
    ${functionBody('skipLines')}
    ${functionBody('importIdentityClause')}
    ${functionBody('attachedImportLine')}
    ${functionBody('renderImportReport')}
    var COPY_NOTHING_NEW = ${varLiteral('COPY_NOTHING_NEW', '?')};
    return {
      render: renderImportReport,
      makeBox: makeBox,
      onboarding: function (v) { ONB.active = v; },
      defaultHost: hosts['import-report'],
      C13: COPY_NOTHING_NEW
    };`)(rec, StudyCore);
}

runCase('a-settings-check-that-found-nothing-says-her-sentence', function () {
  const h = reportHarness();
  const box = h.makeBox('manage-sources-readout');
  h.render({ imported: 0, items: 12, skipped: null }, box);
  const text = textOf(box.innerHTML);
  caseAssert(text.indexOf(COPY_EXTRACT.C13) !== -1,
    'a check that brought in nothing did NOT say her recorded sentence. ' +
    'Rendered: ' + JSON.stringify(text));
  caseAssert(text.indexOf('brought in 0 things') === -1,
    'the room counted zero at her beside her own sentence: ' +
    JSON.stringify(text));
});

runCase('first-run-keeps-its-own-zero-state', function () {
  // THE CONTROL. Her ruling was the SETTINGS surface. The guided first
  // import is a different flow with its own hand-off, and widening C13 into
  // it would change onboarding without her asking.
  const h = reportHarness();
  h.onboarding(true);
  const box = h.makeBox('manage-sources-readout');
  h.render({ imported: 0, items: 12, skipped: null }, box);
  const text = textOf(box.innerHTML);
  caseAssert(text.indexOf('brought in 0 things') !== -1,
    'first-run lost its shipped zero-state: ' + JSON.stringify(text));
});

runCase('the-folder-import-host-keeps-its-own-zero-state', function () {
  // THE SECOND CONTROL: no box passed means the folder-drop path, which
  // shares this renderer and was not part of her ruling.
  const h = reportHarness();
  h.render({ imported: 0, items: 12, skipped: null });
  const text = textOf(h.defaultHost.innerHTML);
  caseAssert(text.indexOf('brought in 0 things') !== -1,
    'the shared folder-import path lost its zero-state: ' +
    JSON.stringify(text));
});

runCase('a-run-that-brought-things-in-still-counts-them', function () {
  // THE THIRD CONTROL, and the one that matters most: C13 must fire ONLY on
  // nothing-new. A fix that painted it always would pass the first case
  // while deleting every count in the app.
  const h = reportHarness();
  const box = h.makeBox('manage-sources-readout');
  h.render({ imported: 3, items: 12, skipped: null }, box);
  const text = textOf(box.innerHTML);
  caseAssert(text.indexOf('brought in 3 things') !== -1,
    'a run that brought in three things did not say so: ' +
    JSON.stringify(text));
  caseAssert(text.indexOf(COPY_EXTRACT.C13) === -1,
    'her nothing-new sentence painted on a run that DID bring things in: ' +
    JSON.stringify(text));
});

runCase('C13-is-byte-identical-to-her-record', function () {
  const record = readCopyRecord();
  caseAssert(Object.prototype.hasOwnProperty.call(COPY_EXTRACT, 'C13') &&
    COPY_EXTRACT.C13, 'row C13 is UNANSWERED in the tracked extract');
  if (record !== null) {
    caseAssert(record.C13 === COPY_EXTRACT.C13,
      'the tracked extract for C13 is ' + JSON.stringify(COPY_EXTRACT.C13) +
      ' but her record says ' + JSON.stringify(record.C13));
  }
  caseAssert(varValue('COPY_NOTHING_NEW') === COPY_EXTRACT.C13,
    'the shipped C13 constant is ' +
    JSON.stringify(varValue('COPY_NOTHING_NEW')) + ' but her recorded row ' +
    'is ' + JSON.stringify(COPY_EXTRACT.C13));
});

/* ---- report --------------------------------------------------------------- */

if (violations.length > 0) {
  console.error('\ntest_vault_refusal: ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  - ' + v); });
  process.exitCode = 1;
} else {
  console.log('\nOK test_vault_refusal: 29 case(s), both surfaces driven.');
}
