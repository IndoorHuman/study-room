/*
 * tests/test_candle_repull.cjs — the candle-touch re-pull (Plan 26.65-05,
 * EXTENDED by Plan 26.97-09 for OD-2: touching the candle brings in what is
 * new in her vault too, carrying her kept-out folders PER SOURCE).
 *
 * Zero-dep node (fs/path only), path-independent via __dirname.
 *
 * ⚠⚠ THIS SUITE HAS TWO HALVES AND THEY ARE NOT EQUAL IN AUTHORITY.
 *
 *   Sections 1–7 read app.js and server.py AS TEXT. They are cheap, they pin
 *   shipped conventions, and they are NOT evidence for any behavioural claim:
 *   a regex over source can be made green by editing the regex while the
 *   behaviour is still wrong. That trap is recorded on this project (nine
 *   instances) and it is the reason the second half exists.
 *
 *   Section 8 DRIVES the shipped client functions on a controllable page and
 *   reads what was actually dispatched — the POST payload the room sends to
 *   /api/adapter/collect. ⛔ SECTION 8 IS THE HALF THAT DECIDES every claim
 *   about what the candle collects and what it carries.
 *
 *   The two halves are deliberately wired to DISAGREE under a mutation: the
 *   drills below mutate the source that section 8 lifts and leave the file
 *   section 7 greps untouched, so a drilled run shows the pin green and the
 *   driven case red. That is the proof that the pin is not what carries the
 *   claim.
 *
 * Seven source-text assertion groups (26.65-05 SC + UI-SPEC Copywriting
 * Contract), unchanged except group 7:
 *
 *   1. TAP-ONLY WIRING — the candle click handler's 'nothing waits'
 *      branch calls startCandleRepull; the re-pull reaches the sources
 *      through runAdapterCollect (POST /api/adapter/collect) in room
 *      mode; nothing else in the app calls startCandleRepull.
 *   2. PULL-ONLY TOKEN BAN — the re-pull + connected-apps region carries
 *      NONE of the law-1 lint-trap tokens and no law-3 absence/time-gap
 *      language. The forbidden literals are defined in THIS file only.
 *   3. NO CORAL — the region never sets the flame that leans toward her,
 *      never spends --accent, never starts the welcome-back dim (D-25); the
 *      quicken is the ambient .playing class alone.
 *   4. ROOM VIEW INTACT — a candle re-pull never navigates: the room-mode
 *      done branch bypasses renderImportReport (no Step-inside button, so
 *      no onbGo('expect') / #screen-expect and no startBlessing); the
 *      readout targets the in-room #room-repull-readout panel inside
 *      #screen-room, never #screen-sources; the one-shot chain dies with
 *      the room view (adapterHostLive gates room mode on #screen-room).
 *   5. MANAGE ROWS — the connected-apps zero state and per-source status
 *      rows carry the verbatim UI-SPEC copy, with no timestamp and no
 *      absence language (law 3).
 *   6. DISCONNECT KEEPS ITEMS — disconnect writes ONLY connected_sources
 *      through the existing /api/meta whitelist; server-side the key is
 *      validated fail-closed against the adapter allowlist and the merge
 *      touches meta alone (items.json is never in the disconnect path).
 *   7. EXCLUSIONS ARE PER SOURCE — 26.97-09. The pin was UPDATED, never
 *      deleted: it now holds the per-source lookup shape, and it holds the
 *      client's source→meta-key map against the server's own, so the two
 *      entry points cannot disagree about what is excluded.
 *
 * Section 8 — NINE DRIVEN CASES, one machine-readable line each, at line
 * start, no prefix:  ok: <case-name>  /  FAIL: <case-name>
 * (mirroring what the Python gates read; the red-first gate asserts on those
 * lines BY VALUE, and no case carries a description that could print in place
 * of its name.)
 *
 *   1  the-candle-queue-includes-the-vault-when-it-is-connected
 *   2  the-vault-collect-on-the-candle-path-is-sent-her-kept-out-folders
 *   3  each-exclusion-taking-source-is-sent-its-own-list-by-value
 *   4  a-source-that-takes-no-exclusions-is-sent-none
 *   5  the-same-kept-out-folder-is-kept-out-on-both-entry-points
 *   6  a-candle-run-that-brought-in-nothing-paints-no-text
 *   7  the-reflection-seam-still-fires-after-a-candle-re-pull
 *   8  the-per-source-shape-is-pinned-in-source-and-does-not-decide
 *   --  control-the-candle-queue-without-the-vault-connected-is-todays-queue
 *      (shipped; green before 26.97-09 and after it — a suite-wide red proves
 *      nothing, so the gate reads this line too)
 *
 * THE MUTATION DRILLS (diagnostics, off by default). Set STUDY_CANDLE_DRILL
 * to one of the names in DRILLS below and the LIFTED source is mutated before
 * section 8 stands it up; app.js on disk is never touched and section 7 keeps
 * reading the real file. Each drill aborts unless its anchor matches EXACTLY
 * once, so a drill can never silently no-op and report a false green.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every unmet assertion listed on its own line + exit 1 on
 * failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const PY = 'server.py';
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const pySrc = fs.readFileSync(path.join(ROOT, PY), 'utf8');
// The REAL escaping core, handed to the driven page rather than stood in for.
const StudyCore = require(path.join(ROOT, 'core.js'));

const violations = [];

/* ---- the mutation drills --------------------------------------------------
   Each entry names a shape whose breakage MUST redden a named driven case.
   The `from` text is an anchor lifted verbatim out of app.js; if it does not
   appear exactly once the run aborts rather than proceeding on a drill that
   quietly did nothing. ⛔ These mutate the LIFTED copy only — app.js on disk
   is untouched, and section 7's greps read the real file, which is what makes
   a drilled run show the pin green beside a red behavioural case. */
const DRILLS = {
  // T-26.97-03: her kept-out folders dropped on the candle path.
  'empty-candle-excludes': {
    from: "      out[source] = Array.isArray(kept) ? kept : [];",
    to: "      out[source] = [];",
    reddens: 'the-same-kept-out-folder-is-kept-out-on-both-entry-points'
  },
  // T-26.97-39: one source handed the other source's list.
  'swap-source-lists': {
    from: "    'apple-notes': 'notes_excluded_folders',\n" +
      "    'obsidian-vault': 'vault_excluded_folders'",
    to: "    'apple-notes': 'vault_excluded_folders',\n" +
      "    'obsidian-vault': 'notes_excluded_folders'",
    reddens: 'each-exclusion-taking-source-is-sent-its-own-list-by-value'
  },
  // T-26.97-31: the filter narrowed back to the two shipped values.
  'narrow-candle-filter': {
    from: "          return connectedSourceName(s) !== '';\n" +
      "        });\n" +
      "      // nothing connected",
    to: "          return s === 'apple-notes' || s === 'apple-photos';\n" +
      "        });\n" +
      "      // nothing connected",
    reddens: 'the-candle-queue-includes-the-vault-when-it-is-connected'
  }
};

const DRILL = process.env.STUDY_CANDLE_DRILL || '';
let LIFT_SRC = appSrc;
if (DRILL) {
  if (!Object.prototype.hasOwnProperty.call(DRILLS, DRILL)) {
    console.error('unknown STUDY_CANDLE_DRILL: ' + DRILL + ' — known: ' +
      Object.keys(DRILLS).join(', '));
    process.exit(2);
  }
  const d = DRILLS[DRILL];
  const hits = LIFT_SRC.split(d.from).length - 1;
  if (hits !== 1) {
    console.error('DRILL_ANCHOR_NOT_UNIQUE: ' + DRILL + ' matched ' + hits +
      ' time(s) in ' + APP + ', expected exactly 1 — the drill would have ' +
      'been a no-op and its green would have meant nothing');
    process.exit(2);
  }
  LIFT_SRC = LIFT_SRC.split(d.from).join(d.to);
  console.error('DRILL ACTIVE: ' + DRILL + ' — expected to redden: ' +
    d.reddens);
}

// Slice a top-level function body: from its `function name(` keyword to the
// next module-indent function declaration (the test_adapter_sources.cjs
// convention — app.js keeps a flat layout inside its IIFE).
function functionBodyOf(src, name, tag) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) {
    violations.push('[' + tag + '] ' + APP + ": function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return '';
  }
  const end = src.indexOf('\n  function ', start + marker.length);
  const raw = src.slice(start, end === -1 ? src.length : end);
  const close = raw.lastIndexOf('\n  }');
  return close === -1 ? raw : raw.slice(0, close + 4);
}

function functionBody(name) { return functionBodyOf(appSrc, name, 'repull'); }
function lifted(name) { return functionBodyOf(LIFT_SRC, name, 'driven'); }

// ---- literal lifters (26.97-09) ---------------------------------------------
// The mirror trap: a suite that RE-TYPES a constant pins whatever this file
// happens to say rather than what the room ships. Every constant section 8
// stands up is taken BY VALUE out of the lifted source. A missing one falls
// back to a syntactically valid empty literal and records a violation, so a
// not-yet-built symbol produces an ASSERTION failure and never a crash — the
// red-first gate distinguishes those two and would reject a crash.

function objectLiteral(name) {
  const m = LIFT_SRC.match(
    new RegExp('\\bvar ' + name + ' = (\\{[\\s\\S]*?\\});'));
  if (!m) {
    violations.push('[driven] ' + APP + ": object constant '" + name +
      "' not found — update this gate deliberately");
    return '{}';
  }
  return m[1];
}

function frozenObjectLiteral(name) {
  const m = LIFT_SRC.match(new RegExp('\\bvar ' + name +
    ' = (Object\\.freeze\\(\\{[\\s\\S]*?\\}\\));'));
  if (!m) {
    violations.push('[driven] ' + APP + ": frozen map '" + name +
      "' not found as a single Object.freeze literal — it does not exist " +
      'yet, or it was renamed; update this gate deliberately');
    return 'Object.freeze({})';
  }
  return m[1];
}

function stringLiteral(name) {
  const m = LIFT_SRC.match(new RegExp('\\bvar ' + name +
    " = ('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\");"));
  if (!m) {
    violations.push('[driven] ' + APP + ": constant '" + name +
      "' not found as a single string literal — update this gate " +
      'deliberately');
    return "''";
  }
  return m[1];
}

function arrayLiteral(name) {
  const m = LIFT_SRC.match(
    new RegExp('\\bvar ' + name + ' = (\\[[\\s\\S]*?\\]);'));
  if (!m) {
    violations.push('[driven] ' + APP + ": array constant '" + name +
      "' not found — update this gate deliberately");
    return '[]';
  }
  return m[1];
}

function must(present, label) {
  if (appSrc.indexOf(present) === -1) {
    violations.push('[' + label + '] ' + APP + ": missing copy: '" +
      present + "'");
  }
}

// The region this plan owns — every function it added for the re-pull and
// the connected-apps pane. The union is what the law guards scan. 26.97-09
// adds the two per-source exclusion helpers, so the law-1 lint covers the new
// code rather than stopping at the shipped edge of it.
const REPULL_FNS = ['roomRepullBox', 'repullQuicken', 'startCandleRepull',
  'runNextRepull', 'finishRoomRepull', 'manageSourcesBox',
  'connectedSourceName', 'renderConnectedSourcesSection',
  'handleSourceDisconnect', 'repullExclusions', 'repullExcludesFor',
  'sourceExclusionKey'];
const region = REPULL_FNS.map(functionBody).join('\n');

// The candle click handler's own slice (it lives inside initRoom, so the
// functionBody helper cannot reach it): from the candle listener to a
// window past its close — wide enough to hold both branches.
const candleAt = appSrc.indexOf("$('room-obj-candle').addEventListener('click'");
const candleSlice = candleAt === -1 ? '' : appSrc.slice(candleAt, candleAt + 1600);

// ---- 1. TAP-ONLY WIRING -----------------------------------------------------

if (candleAt === -1) {
  violations.push('[wiring] ' + APP + ': the candle click handler is missing');
}
if (candleSlice.indexOf('startCandleRepull()') === -1) {
  violations.push('[wiring] ' + APP + ": the candle 'nothing waits' branch " +
    'must call startCandleRepull() — the tap IS the fetch (ADP-03, law 1)');
}
if (candleSlice.indexOf("classList.add('playing')") === -1) {
  violations.push('[wiring] ' + APP + ': the tap must ride the ambient ' +
    ".playing quicken (classList.add('playing'))");
}
// The re-pull runs each source through the ONE collect path, in room mode.
const runNext = functionBody('runNextRepull');
if (runNext.indexOf('runAdapterCollect(') === -1 ||
    !/runAdapterCollect\([\s\S]*?true\)/.test(runNext)) {
  violations.push('[wiring] ' + APP + ': runNextRepull must run each source ' +
    'through runAdapterCollect in room mode (the true flag)');
}
const startRepull = functionBody('startCandleRepull');
if (startRepull.indexOf('connected_sources') === -1 ||
    startRepull.indexOf('/api/items') === -1) {
  violations.push('[wiring] ' + APP + ': startCandleRepull must read ' +
    'meta.connected_sources from GET /api/items on the tap');
}
// ⚖️⚖️ RE-AIMED 2026-08-23 BY OWNER RULING — the tap is no longer the SOLE
// caller; the LANDING is the second, and there are exactly two.
// ⛔ A PIN IS NEVER MOVED TO MAKE A SUITE GREEN. Record:
// 26.995-OWNER-RULING-2026-08-23-gather-before-the-candle.md, and the same
// move is made in tests/test_session_flow.cjs with the same reason.
//
// ⚠ THIS IS THE PIN THAT HELD startCandleRepull's OWN LAW-1 PARAGRAPH
// ("everything below exists because the user tapped"). It did its job: it
// caught the second caller the moment it was added. Her ruling is what moves
// it — she was shown that line, and the two costs it protects against (the
// room touching Photos on every open, and a status line with no tap), and
// ruled the landing gathers anyway. A THIRD caller still fails this.
const repullCalls = (appSrc.match(/startCandleRepull\(\);/g) || []).length;
if (repullCalls !== 2) {
  violations.push('[wiring] ' + APP + ': startCandleRepull() must have ' +
    'exactly TWO call sites — the candle tap and the landing gather (her ' +
    'ruling of 2026-08-23) — found ' + repullCalls);
}

// ---- 2. PULL-ONLY TOKEN BAN -------------------------------------------------

const FORBIDDEN_LINT = ['reminder', 'sched', 'notify', 'timer',
  'interval', 'watch', 'poll', 'cron', 'daemon', 'osascript'];
const FORBIDDEN_ABSENCE = ['since you', 'days ago', "it's been",
  'last synced', 'nothing new since', 'streak', 'checkmark'];
const lowerRegion = (region + '\n' + candleSlice).toLowerCase();

FORBIDDEN_LINT.concat(FORBIDDEN_ABSENCE).forEach(function (tok) {
  if (lowerRegion.indexOf(tok) !== -1) {
    violations.push('[pull-only] ' + APP + ': the re-pull region must not ' +
      "contain the forbidden token '" + tok + "' (law 1/3)");
  }
});
// setTimeout lives ONLY in the sanctioned one-shot re-arm (armAdapterReread)
// — never in the re-pull region itself.
if (region.indexOf('setTimeout') !== -1) {
  violations.push('[pull-only] ' + APP + ': the re-pull region must not arm ' +
    'its own deferred work — the one-shot chain lives in armAdapterReread');
}

// ---- 3. NO CORAL ------------------------------------------------------------

['reaching', '--accent', 'startWelcomeBack', 'welcome-back']
  .forEach(function (tok) {
    if (region.indexOf(tok) !== -1) {
      violations.push('[no-coral] ' + APP + ': the re-pull region must not ' +
        "carry '" + tok + "' — coral and the dim stay reserved (law 2, D-25)");
    }
  });
const quicken = functionBody('repullQuicken');
if (quicken.indexOf("classList.add('playing')") === -1) {
  violations.push('[no-coral] ' + APP + ': repullQuicken must add the ' +
    'ambient .playing class and nothing else');
}

// ---- 4. ROOM VIEW INTACT ----------------------------------------------------

const finishRepull = functionBody('finishRoomRepull');
['onbGo', 'showScreen', 'startBlessing', 'renderImportReport',
  'screen-expect'].forEach(function (tok) {
  if (finishRepull.indexOf(tok) !== -1) {
    violations.push('[room-intact] ' + APP + ': finishRoomRepull must not ' +
      "carry '" + tok + "' — a re-pull never navigates and never opens " +
      'the blessing pass');
  }
});
// The room-mode done branch bypasses the shipped report BEFORE it renders.
const readProg = functionBody('readAdapterProgress');
const gateAt = readProg.indexOf(
  'if (ACTIVE_ADAPTER.room) { finishRoomRepull(report, box); return; }');
const reportAt = readProg.indexOf('renderImportReport(report, box)');
if (gateAt === -1 || reportAt === -1 || gateAt > reportAt) {
  violations.push('[room-intact] ' + APP + ': readAdapterProgress must gate ' +
    'the done branch on ACTIVE_ADAPTER.room BEFORE renderImportReport — ' +
    'the room-mode ending is finishRoomRepull, never the Step-inside report');
}
// The readout lives in the in-room panel, inside the room view.
const repullBox = functionBody('roomRepullBox');
if (repullBox.indexOf('room-repull-readout') === -1 ||
    repullBox.indexOf('screen-room') === -1) {
  violations.push('[room-intact] ' + APP + ': roomRepullBox must create ' +
    '#room-repull-readout inside #screen-room');
}
[startRepull, repullBox].forEach(function (body) {
  if (body.indexOf('screen-sources') !== -1 ||
      body.indexOf('adapter-readout') !== -1) {
    violations.push('[room-intact] ' + APP + ': the re-pull readout must ' +
      'never target #screen-sources or the sources-screen box');
  }
});
// The one-shot chain dies with the room view (the panel's lifecycle).
const hostLive = functionBody('adapterHostLive');
if (!/ACTIVE_ADAPTER\.room[\s\S]*?screen-room/.test(hostLive)) {
  violations.push('[room-intact] ' + APP + ': adapterHostLive must gate ' +
    'room mode on #screen-room being active — the readout dies with the ' +
    'room view');
}
// law 3: a zero-new re-pull paints NO text — the empty branch is literal.
if (!/box\.innerHTML = '';/.test(finishRepull)) {
  violations.push('[room-intact] ' + APP + ': finishRoomRepull must paint ' +
    'nothing at all when a re-pull adds nothing (law 3)');
}

// ---- 5. MANAGE ROWS ---------------------------------------------------------

['No apps connected yet. Connect Apple Notes or Apple Photos below.',
  ' — brought in.', 'connected apps'
].forEach(function (copy) { must(copy, 'manage-rows'); });

const renderSources = functionBody('renderConnectedSourcesSection');
if (!/escapeHtml\('disconnect'\)/.test(renderSources)) {
  violations.push('[manage-rows] ' + APP + ': each connected-source row ' +
    "must offer a plain lowercase 'disconnect' control");
}
// The rows are status only: no timestamp machinery anywhere in the pane.
['Date', 'toLocale', 'getTime'].forEach(function (tok) {
  if (renderSources.indexOf(tok) !== -1) {
    violations.push('[manage-rows] ' + APP + ': the connected-apps pane ' +
      "must not read the clock ('" + tok + "') — no last-synced stamp, " +
      'no time-gap (law 3)');
  }
});
// The pane joins the rail without a count (law 3 register).
if (!/key: 'sources', label: 'connected apps'/.test(appSrc)) {
  violations.push('[manage-rows] ' + APP + ": the MANAGE_PANES entry " +
    "{ key: 'sources', label: 'connected apps' } is missing");
}

// ---- 6. DISCONNECT KEEPS ITEMS ----------------------------------------------

const disconnect = functionBody('handleSourceDisconnect');
if (!/apiPost\('\/api\/meta',\s*\{\s*connected_sources/.test(disconnect)) {
  violations.push('[disconnect] ' + APP + ': handleSourceDisconnect must ' +
    'write ONLY connected_sources through the existing /api/meta whitelist');
}
['/api/state', '/api/import', '/api/adapter'].forEach(function (route) {
  if (disconnect.indexOf(route) !== -1) {
    violations.push('[disconnect] ' + APP + ': disconnect must never touch ' +
      route + ' — it removes the connection alone (D-02)');
  }
});
// Server side: the key is whitelisted with a fail-closed validator scoped
// to the adapter allowlist, and handle_meta runs it.
if (!/META_KEYS = \([\s\S]*?"connected_sources"\)/.test(pySrc)) {
  violations.push('[disconnect] ' + PY + ': connected_sources must join ' +
    'the META_KEYS whitelist');
}
if (pySrc.indexOf('def validate_connected_sources') === -1 ||
    !/def validate_connected_sources[\s\S]{0,900}ADAPTER_SOURCES/.test(pySrc)) {
  violations.push('[disconnect] ' + PY + ': validate_connected_sources must ' +
    'exist and check names against the ADAPTER_SOURCES allowlist');
}
if (pySrc.indexOf('connected_sources must list known app sources only.') === -1) {
  violations.push('[disconnect] ' + PY + ': the fail-closed plain-words ' +
    'refusal line is missing');
}
if (!/err = validate_connected_sources\(data\)/.test(pySrc)) {
  violations.push('[disconnect] ' + PY + ': handle_meta must run ' +
    'validate_connected_sources before the merge');
}


// ---- 7. EXCLUSIONS ARE PER SOURCE (26.97-09) --------------------------------
//
// ⚠⚠ SOURCE-TEXT, AND IT DOES NOT DECIDE. The pin below was UPDATED for the
// per-source shape rather than deleted — a pin is cheap and it catches a
// rename — but every behavioural claim about what the candle carries is
// settled in section 8, by driving. The drills prove the difference: under
// `STUDY_CANDLE_DRILL` this group stays GREEN while the driven case reddens.

// The server remembers each exclusion-taking source's confirmed skip list at
// every collect, under that source's OWN key…
['"notes_excluded_folders"', '"vault_excluded_folders"'].forEach(function (k) {
  if (pySrc.indexOf(k) === -1) {
    violations.push('[exclusion] ' + PY + ': the collect worker must persist ' +
      k + ' so a re-pull re-carries that source\'s skip list (law 5)');
  }
});
if (pySrc.indexOf('_ADAPTER_EXCLUSION_META = {') === -1) {
  violations.push('[exclusion] ' + PY + ': _ADAPTER_EXCLUSION_META — the ' +
    'server\'s per-source meta-key map — is missing; the client reads ' +
    'exactly what this writes');
}
// …and the client re-carries them through the same collect payload, per
// source. ⛔ A single shared list across two sources that exclude different
// things is a leak waiting to happen (T-26.97-39): the vault's kept-out
// folders are not the Notes list, and either one handed to the wrong source
// would let something she kept out come in.
if (startRepull.indexOf('repullExclusions(meta)') === -1) {
  violations.push('[exclusion] ' + APP + ': startCandleRepull must build the ' +
    'PER-SOURCE exclusion carry-forward from meta (repullExclusions), not ' +
    'read one shared list (law 5)');
}
// ⚠ THE PIN THIS PLAN UPDATED. It used to hold
// /'apple-notes'\s*\?\s*REPULL\.excludes/ — one list handed to one named
// source. That shape is gone; this holds the per-source lookup that replaced
// it, and the absence of any hard-coded source arm beside it.
if (!/runAdapterCollect\(source,\s*repullExcludesFor\(source\)/.test(runNext)) {
  violations.push('[exclusion] ' + APP + ': runNextRepull must hand each ' +
    'source ITS OWN kept-out folders via repullExcludesFor(source) — not a ' +
    'shared list, and not a widened ternary');
}
if (runNext.indexOf("'apple-notes'") !== -1) {
  violations.push('[exclusion] ' + APP + ': runNextRepull still names a ' +
    'source by hand — the exclusion carry-forward is a per-source lookup, ' +
    'so no arm should remain');
}
// The payload gate is per-source too. Hard-coding it to Notes silently DROPS
// the vault's kept-out folders on BOTH entry points — the server then
// defaults exclude_folders to [] and fences nothing.
const collectFn = functionBody('runAdapterCollect');
if (!/if \(sourceExclusionKey\(source\) && Array\.isArray\(excludeFolders\)\)/
    .test(collectFn)) {
  violations.push('[exclusion] ' + APP + ': runAdapterCollect must put ' +
    'exclude_folders on the payload for EVERY source that takes a skip ' +
    'list (sourceExclusionKey), never for one named source (law 5)');
}

// ---- 8. THE DRIVEN CASES (26.97-09) -----------------------------------------
//
// ⛔ THIS IS THE HALF THAT DECIDES. The shipped client functions are lifted BY
// VALUE out of app.js, stood up on a controllable page, and CALLED; every
// assertion reads what was actually dispatched — the POST payload bound for
// /api/adapter/collect — not the source that produced it.

const CONSTS = [
  'var DESIGN = false;',
  'var VAULT_SOURCE = ' + stringLiteral('VAULT_SOURCE') + ';',
  'var CONNECTED_SOURCE_NAMES = ' +
    frozenObjectLiteral('CONNECTED_SOURCE_NAMES') + ';',
  'var SOURCE_EXCLUSION_META = ' +
    frozenObjectLiteral('SOURCE_EXCLUSION_META') + ';',
  'var ADAPTER_BUTTON_IDS = ' + objectLiteral('ADAPTER_BUTTON_IDS') + ';',
  'var ACTIVE_ADAPTER = ' + objectLiteral('ACTIVE_ADAPTER') + ';',
  'var REPULL = ' + objectLiteral('REPULL') + ';',
  'var VAULT_DEFAULT_ROSTER = ' + arrayLiteral('VAULT_DEFAULT_ROSTER') + ';',
  'var VAULT_PICKER_FRAMING = ' + stringLiteral('VAULT_PICKER_FRAMING') + ';',
  'var VAULT_PICKER_INSTRUCTION = ' +
    stringLiteral('VAULT_PICKER_INSTRUCTION') + ';',
  'var VAULT_PICKER_CONFIRM = ' + stringLiteral('VAULT_PICKER_CONFIRM') + ';',
  'var VAULT_PICKER_UNREACHABLE = ' +
    stringLiteral('VAULT_PICKER_UNREACHABLE') + ';',
  'var VAULT_PICKER_EMPTY = ' + stringLiteral('VAULT_PICKER_EMPTY') + ';',
  'var VAULT_REFUSAL_TITLE = ' + stringLiteral('VAULT_REFUSAL_TITLE') + ';',
  'var VAULT_REFUSAL_WHY = ' + stringLiteral('VAULT_REFUSAL_WHY') + ';',
  'var VAULT_REFUSAL_NEXT = ' + stringLiteral('VAULT_REFUSAL_NEXT') + ';',
  'var VAULT_REFUSAL_RETRY = ' + stringLiteral('VAULT_REFUSAL_RETRY') + ';',
  'var VAULT_REFUSAL_PRIVATE = ' +
    stringLiteral('VAULT_REFUSAL_PRIVATE') + ';'
].join('\n');

const LIFTED = [
  lifted('escapeHtml'), lifted('escapeAttr'), lifted('count'),
  lifted('connectedSourceName'), lifted('sourceExclusionKey'),
  lifted('repullExclusions'), lifted('repullExcludesFor'),
  lifted('runAdapterCollect'), lifted('consumeRepullSeam'),
  lifted('roomRepullBox'), lifted('repullQuicken'),
  lifted('startCandleRepull'), lifted('runNextRepull'),
  lifted('finishRoomRepull'), lifted('rosterSegments'),
  lifted('vaultPickerRows'), lifted('renderVaultPickerError'),
  lifted('renderVaultFolderPicker'), lifted('renderVaultRefusal')
].join('\n');

function pageHarness(opts) {
  opts = opts || {};
  const rec = { posts: [], paints: [], seam: 0, errors: [], reading: 0 };
  const ELS = {};

  function byId(id) {
    return Object.prototype.hasOwnProperty.call(ELS, id) ? ELS[id] : null;
  }
  function unescapeAttr(s) {
    return String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  }
  function makeEl(tag) {
    return { tag: tag, id: '', checked: false, disabled: false, value: '',
      handlers: {},
      addEventListener: function (ev, fn) { this.handlers[ev] = fn; },
      click: function () {
        if (this.handlers.click) { this.handlers.click(); }
      },
      classList: { add: function () {}, remove: function () {} } };
  }
  // A box whose innerHTML setter PARSES what was written, so an assertion
  // reads the rendered surface rather than the source that produced it.
  function makeBox(parse) {
    // 26.97-10: a real element carries setAttribute, and the room's readout
    // panel now uses it to announce itself (role=status / aria-live=polite,
    // R5). A stand-in element without it is not an element — it made a
    // shipped attribute call throw inside eight cases of this suite.
    const box = { tag: 'div', id: '', style: {}, children: [], _html: '',
      attrs: {}, surface: { boxes: [], buttons: {} } };
    box.setAttribute = function (k, v) { box.attrs[k] = v; };
    box.getAttribute = function (k) {
      return Object.prototype.hasOwnProperty.call(box.attrs, k) ?
        box.attrs[k] : null; };
    Object.defineProperty(box, 'innerHTML', {
      get: function () { return box._html; },
      set: function (v) {
        box._html = String(v);
        rec.paints.push(box._html);
        if (!parse) { return; }
        box.surface = { boxes: [], buttons: {} };
        let m;
        const rc = /<input\b([^>]*)>/g;
        while ((m = rc.exec(box._html)) !== null) {
          if (m[1].indexOf('type="checkbox"') === -1) { continue; }
          const cb = makeEl('input');
          cb.checked = /\bchecked\b/.test(m[1]);
          cb.disabled = /\bdisabled\b/.test(m[1]);
          const val = m[1].match(/value="([^"]*)"/);
          cb.value = val ? unescapeAttr(val[1]) : '';
          box.surface.boxes.push(cb);
        }
        const rb = /<button\b([^>]*)>/g;
        while ((m = rb.exec(box._html)) !== null) {
          const idm = m[1].match(/id="([^"]*)"/);
          if (!idm) { continue; }
          const b = makeEl('button');
          b.id = idm[1];
          box.surface.buttons[idm[1]] = b;
          ELS[idm[1]] = b;
        }
      }
    });
    box.appendChild = function (c) {
      box.children.push(c);
      if (c && c.id) { ELS[c.id] = c; }
    };
    box.querySelectorAll = function (sel) {
      return sel === '.vault-folder-box' ? box.surface.boxes : [];
    };
    box.classList = { add: function () {}, remove: function () {} };
    return box;
  }

  ELS['screen-room'] = makeBox(false);
  ELS['screen-room'].id = 'screen-room';
  ELS['room-obj-candle'] = makeEl('div');

  const documentStub = { createElement: function () { return makeBox(false); } };
  const pickerBox = makeBox(true);

  const RESPONSES = {
    '/api/items': { ok: true, data: { meta: opts.meta || {} } },
    '/api/adapter/vault-folders': opts.foldersRes ||
      { ok: true, data: { folders: [], unreadable: [] } }
  };

  const api = new Function('rec', 'ELS', 'byId', 'RESPONSES', 'StudyCore',
    'document', 'REFUSE_SOURCES', `
    function $(id) { return byId(id); }
    function apiGet(url) { return Promise.resolve(RESPONSES[url]); }
    function apiPost(url, payload) {
      rec.posts.push({ url: url, payload: payload });
      // ⚠ A REFUSAL IS AN OUTCOME OF THE ROUTE, so it is injected HERE and
      // not by calling the renderer directly: the thing under test is what
      // the QUEUE does when a collect comes back refused.
      if (REFUSE_SOURCES.indexOf(payload && payload.source) !== -1) {
        return Promise.resolve({ ok: false, status: 409,
          data: { ok: false, refused: true, source: payload.source,
            reason: 'fence_unprovable' } });
      }
      return Promise.resolve({ ok: true, data: {} });
    }
    function reenableNotes() {}
    function errorText(res, fallback) { return fallback; }
    function adapterErrorCopy() { return 'the collect could not finish'; }
    function renderAdapterProgress() {}
    function readAdapterProgress() {}
    function renderAdapterError(box, copy) { rec.errors.push(copy); }
    function renderVisionLine() {}
    // The reading readout, stood in for: it hands the shipped ending its one
    // call so the panel's final words are what an assertion reads.
    function readVisionProgress(box, misses, onEnd) {
      rec.reading++;
      if (typeof onEnd === 'function') { onEnd(); }
    }
    ${CONSTS}
    ${LIFTED}
    return {
      REPULL: REPULL,
      startCandle: typeof startCandleRepull === 'function' ?
        startCandleRepull : null,
      finish: typeof finishRoomRepull === 'function' ?
        finishRoomRepull : null,
      collect: typeof runAdapterCollect === 'function' ?
        runAdapterCollect : null,
      renderPicker: typeof renderVaultFolderPicker === 'function' ?
        renderVaultFolderPicker : null,
      sourceKey: typeof sourceExclusionKey === 'function' ?
        sourceExclusionKey : null,
      excludesFor: typeof repullExcludesFor === 'function' ?
        repullExcludesFor : null,
      active: function () { return ACTIVE_ADAPTER; }
    };`)(rec, ELS, byId, RESPONSES, StudyCore, documentStub,
       (opts.refuse || []));

  api.rec = rec;
  api.byId = byId;
  api.pickerBox = pickerBox;
  api.roomBox = function () { return byId('room-repull-readout'); };
  return api;
}

// Two microtask turns is enough for the shipped chains over resolved
// promises; eight are taken, so a slower one still lands.
async function settle() {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); }
}

function collectPosts(h, from) {
  return h.rec.posts.slice(from || 0).filter(function (p) {
    return p.url === '/api/adapter/collect';
  });
}
function postSources(h, from) {
  return collectPosts(h, from).map(function (p) {
    return p.payload && p.payload.source;
  });
}
function onePostFor(h, source, from) {
  const hits = collectPosts(h, from).filter(function (p) {
    return p.payload && p.payload.source === source;
  });
  return hits.length === 1 ? hits[0].payload : null;
}
function show(a) { return JSON.stringify(a); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function visibleText(html) { return String(html).replace(/<[^>]*>/g, ''); }

// Stand the candle path up and run it to the end, exactly as the room does:
// the tap starts it, and each source's completion advances the queue.
async function driveCandle(opts) {
  const h = pageHarness(opts);
  if (!h.startCandle || !h.finish) {
    throw new Error('the candle re-pull functions are not present in ' + APP);
  }
  if (opts && typeof opts.beforeStart === 'function') { opts.beforeStart(h); }
  h.startCandle();
  await settle();
  let guard = 0;
  while (h.REPULL.busy && guard < 12) {
    guard++;
    h.finish({ imported: (opts && opts.imported) || 0 }, h.roomBox());
    await settle();
  }
  h.turns = guard;
  return h;
}

function caseAssert(cond, msg) {
  if (!cond) { throw new Error(msg); }
}

async function runCase(name, fn) {
  let failure = null;
  try { await fn(); } catch (e) {
    failure = (e && e.message) ? e.message : String(e);
  }
  if (failure === null) {
    console.log('ok: ' + name);
  } else {
    console.log('FAIL: ' + name);
    violations.push('[2697-09] ' + name + ': ' + failure);
  }
}

/* ---- the fixture ----------------------------------------------------------
   TWO DIFFERENT LISTS, deliberately. The whole point of the per-source shape
   is that these two are not interchangeable: if either arrives at the other
   source, something she kept out of one place has been let in from another.
   `Journal` is the folder that makes case 5 load-bearing — it is on her vault
   list, and it is the folder both entry points must keep out. */
const TITLE_TEXT = "Your vault wasn't brought in.";
const NOTES_KEPT = ['personnel notes', 'medical'];
const VAULT_KEPT = ['Journal', 'Clippings/journal/chatgpt'];
const VAULT_FOLDERS = ['Clippings', 'Journal', 'Journal analysis',
  '2026 archive', 'Recipes'];

function metaFor(connected) {
  return { connected_sources: connected,
    notes_excluded_folders: NOTES_KEPT,
    vault_excluded_folders: VAULT_KEPT };
}
function foldersRes(folders) {
  return { ok: true, data: { folders: folders, unreadable: [] } };
}

/* ---- her server's own map, read from the server -------------------------- */

function serverExclusionPairs() {
  const block = pySrc.match(/_ADAPTER_EXCLUSION_META = \{([\s\S]*?)\}/);
  if (!block) { return null; }
  const pairs = {};
  const re = /_(\w+)\.SOURCE:\s*"([a-z_]+)"/g;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    let src;
    try {
      const mod = fs.readFileSync(
        path.join(ROOT, 'adapters', m[1] + '.py'), 'utf8');
      const sm = mod.match(/^SOURCE = "([^"]+)"/m);
      src = sm ? sm[1] : null;
    } catch (e) { src = null; }
    if (!src) { return null; }
    pairs[src] = m[2];
  }
  return pairs;
}

/* ---- the cases ------------------------------------------------------------ */

async function main() {

  // 1 -- the vault joins the queue, by name and in order.
  await runCase('the-candle-queue-includes-the-vault-when-it-is-connected',
    async function () {
      const order = ['apple-notes', 'apple-photos', 'obsidian-vault'];
      const h = await driveCandle({ meta: metaFor(order) });
      caseAssert(same(postSources(h), order),
        'the candle collected ' + show(postSources(h)) + ', not ' +
        show(order) + ' — asserted by name AND order, never by length');
    });

  // 2 -- what the vault's collect is SENT, read off the dispatch.
  await runCase(
    'the-vault-collect-on-the-candle-path-is-sent-her-kept-out-folders',
    async function () {
      const h = await driveCandle({ meta: metaFor(['obsidian-vault']) });
      const p = onePostFor(h, 'obsidian-vault');
      caseAssert(p !== null,
        'the candle never dispatched exactly one vault collect; it sent ' +
        show(postSources(h)));
      caseAssert(same(p.exclude_folders, VAULT_KEPT),
        'the vault collect was sent ' + show(p.exclude_folders) +
        ' as its kept-out folders, not her ' + show(VAULT_KEPT) +
        ' — a folder she kept out would come in through the candle (law 5)');
    });

  // 3 -- each list reaches ITS OWN source, asserted BY VALUE. ⚠ "not the
  // other's" is not enough: two empty lists would satisfy that and fence
  // nothing.
  await runCase('each-exclusion-taking-source-is-sent-its-own-list-by-value',
    async function () {
      caseAssert(!same(NOTES_KEPT, VAULT_KEPT) && NOTES_KEPT.length > 0 &&
        VAULT_KEPT.length > 0,
        'the fixture no longer gives the two sources different, non-empty ' +
        'lists, so this case could not tell them apart');
      const h = await driveCandle(
        { meta: metaFor(['apple-notes', 'obsidian-vault']) });
      const n = onePostFor(h, 'apple-notes');
      const v = onePostFor(h, 'obsidian-vault');
      caseAssert(n !== null && v !== null,
        'both exclusion-taking sources must be collected once; the candle ' +
        'sent ' + show(postSources(h)));
      caseAssert(same(n.exclude_folders, NOTES_KEPT),
        'Apple Notes was sent ' + show(n.exclude_folders) + ', not its own ' +
        show(NOTES_KEPT));
      caseAssert(same(v.exclude_folders, VAULT_KEPT),
        'the vault was sent ' + show(v.exclude_folders) + ', not its own ' +
        show(VAULT_KEPT));
    });

  // 4 -- and the shape change does not start handing lists to sources that
  // never wanted one.
  await runCase('a-source-that-takes-no-exclusions-is-sent-none',
    async function () {
      const h = await driveCandle(
        { meta: metaFor(['apple-photos', 'obsidian-vault']) });
      const p = onePostFor(h, 'apple-photos');
      caseAssert(p !== null,
        'Apple Photos was not collected once; the candle sent ' +
        show(postSources(h)));
      caseAssert(!Object.prototype.hasOwnProperty.call(p, 'exclude_folders'),
        'Apple Photos was sent an exclusion list it never asked for: ' +
        show(p.exclude_folders) + ' (D-04 — no album picker)');
    });

  // 5 -- ⛔ THE CASE THIS PLAN EXISTS FOR. One run, one meta, both entry
  // points, the same folder. The SETTINGS path is asserted FIRST so that a
  // candle-path breakage leaves it green in the same run and the red is
  // attributable.
  await runCase('the-same-kept-out-folder-is-kept-out-on-both-entry-points',
    async function () {
      const SHARED = 'Journal';
      caseAssert(VAULT_KEPT.indexOf(SHARED) !== -1 &&
        VAULT_FOLDERS.indexOf(SHARED) !== -1,
        'the fixture no longer holds ' + show(SHARED) + ' as a folder she ' +
        'kept out that the vault also enumerates');
      const h = pageHarness({ meta: metaFor(['obsidian-vault']),
        foldersRes: foldersRes(VAULT_FOLDERS) });

      // -- entry point 1: the settings path (her picker, then confirm) ------
      caseAssert(h.renderPicker !== null,
        'the vault folder picker is not present in ' + APP);
      h.renderPicker(h.pickerBox);
      await settle();
      const go = h.byId('btn-vault-picker-go');
      caseAssert(go !== null, 'the picker rendered no confirm control');
      go.click();
      await settle();
      const settings = onePostFor(h, 'obsidian-vault');
      caseAssert(settings !== null,
        'the settings path dispatched no vault collect at all');
      caseAssert(Array.isArray(settings.exclude_folders) &&
        settings.exclude_folders.indexOf(SHARED) !== -1,
        'THE SETTINGS PATH leaked: its collect carried ' +
        show(settings.exclude_folders) + ', which does not keep ' +
        show(SHARED) + ' out');

      // -- entry point 2: the candle, on the SAME meta ----------------------
      const mark = h.rec.posts.length;
      h.startCandle();
      await settle();
      let guard = 0;
      while (h.REPULL.busy && guard < 12) {
        guard++;
        h.finish({ imported: 0 }, h.roomBox());
        await settle();
      }
      const candle = onePostFor(h, 'obsidian-vault', mark);
      // The plant-was-reached assertion: the candle dispatch RAN and recorded
      // a call. Without this, an empty exclusion list and a candle that never
      // collected at all would fail identically.
      caseAssert(candle !== null,
        'THE CANDLE never dispatched a vault collect (it sent ' +
        show(postSources(h, mark)) + '), so nothing can be said about what ' +
        'it carried — the second entry point does not reach the vault');
      caseAssert(Array.isArray(candle.exclude_folders) &&
        candle.exclude_folders.indexOf(SHARED) !== -1,
        'THE CANDLE PATH leaked: its collect carried ' +
        show(candle.exclude_folders) + ', which does not keep ' +
        show(SHARED) + ' out. She kept that folder out once, and she ' +
        'pressed nothing to bring it back (law 5)');
    });

  // 6 -- the shipped quiet zero, unchanged by this plan.
  await runCase('a-candle-run-that-brought-in-nothing-paints-no-text',
    async function () {
      const h = await driveCandle({ meta: metaFor(['obsidian-vault']),
        imported: 0 });
      const box = h.roomBox();
      caseAssert(box !== null, 'the in-room readout panel was never created');
      // ⚠ NOT VACUOUS. A candle that collected NOTHING AT ALL would also
      // leave an empty panel and pass a "paints no text" assertion. The run
      // must have happened first, and it must have brought in zero.
      caseAssert(onePostFor(h, 'obsidian-vault') !== null,
        'no collect ran, so an empty panel says nothing about the quiet ' +
        'zero; the candle sent ' + show(postSources(h)));
      caseAssert(h.REPULL.brought === 0,
        'the run brought in ' + h.REPULL.brought + ', so this is not the ' +
        'zero case at all');
      caseAssert(box.innerHTML === '',
        'a run that brought in nothing painted ' + show(box.innerHTML) +
        ' — law 3: it paints no text at all');
      caseAssert(visibleText(box.innerHTML) === '',
        'a run that brought in nothing left words on the panel: ' +
        show(visibleText(box.innerHTML)));
    });

  // 7 -- the seam is never held. A regression guard on shipped behaviour,
  // stated as such: holding it would make a tap on the candle produce a room
  // that goes dead under her hand for twenty minutes.
  await runCase('the-reflection-seam-still-fires-after-a-candle-re-pull',
    async function () {
      let fired = 0;
      const h = await driveCandle({ meta: metaFor(['obsidian-vault']),
        imported: 0,
        beforeStart: function (hh) {
          hh.REPULL.onDone = function () { fired++; };
        } });
      caseAssert(onePostFor(h, 'obsidian-vault') !== null,
        'no re-pull ran, so the seam had nothing to follow');
      caseAssert(fired === 1,
        'the reflection seam fired ' + fired + ' time(s) after a candle ' +
        're-pull that brought in nothing, expected exactly 1');
    });

  // 8 -- the source-text pin, and its own limits, in one place.
  await runCase('the-per-source-shape-is-pinned-in-source-and-does-not-decide',
    async function () {
      const srv = serverExclusionPairs();
      caseAssert(srv !== null,
        'could not read the server\'s own per-source meta-key map, so the ' +
        'two entry points cannot be shown to agree');
      const m = appSrc.match(
        /var SOURCE_EXCLUSION_META = Object\.freeze\(\{([\s\S]*?)\}\);/);
      caseAssert(m !== null,
        'the client carries no SOURCE_EXCLUSION_META map, so it cannot be ' +
        'reading the same keys the server writes');
      const client = {};
      const re = /'([a-z-]+)':\s*'([a-z_]+)'/g;
      let g;
      while ((g = re.exec(m[1])) !== null) { client[g[1]] = g[2]; }
      caseAssert(same(Object.keys(client).sort(), Object.keys(srv).sort()) &&
        Object.keys(srv).every(function (k) { return client[k] === srv[k]; }),
        'the client reads ' + show(client) + ' where the server writes ' +
        show(srv) + ' — the two entry points would disagree about what is ' +
        'excluded');
      // ⚠ AND THE POINT OF THIS CASE: it is source text, and under a drill it
      // stays green while the behaviour is wrong. Case 5 is what decides.
      caseAssert(DRILLS['empty-candle-excludes'].reddens ===
        'the-same-kept-out-folder-is-kept-out-on-both-entry-points',
        'the drill register no longer names the case that decides');
    });

  // -- the control case, green before 26.97-09 and after it -----------------
  // DRIVEN, deliberately: a stood-up page that cannot run at all would fail
  // here too, so a suite-wide red (a crash, a broken harness, a bad lift)
  // can never be mistaken for the red this plan expects.
  await runCase(
    'control-the-candle-queue-without-the-vault-connected-is-todays-queue',
    async function () {
      const today = ['apple-notes', 'apple-photos'];
      const h = await driveCandle({ meta: metaFor(today) });
      caseAssert(same(postSources(h), today),
        'with no vault connected the candle collected ' +
        show(postSources(h)) + ', not today\'s queue ' + show(today) +
        ' — the queue must not change for everyone');
      const n = onePostFor(h, 'apple-notes');
      caseAssert(n !== null && same(n.exclude_folders, NOTES_KEPT),
        'the shipped Notes re-pull no longer re-carries its confirmed skip ' +
        'list: ' + show(n && n.exclude_folders));
    });
  /* -- T-26.97-03: the exclusion default must fail CLOSED ------------------
   *
   * ADDED 2026-08-19 by /gsd-secure-phase. An absent remembered-exclusions
   * key yielded [] -- "exclude nothing" -- and the candle then ran over the
   * whole vault without her ever seeing a picker. Law 5's posture everywhere
   * else in this codebase is to refuse rather than default. The two keys can
   * desync because they have different write privileges: the connected list
   * is browser-writable through the meta route, the exclusion list is
   * written only by the collect worker.
   */

  await runCase('a-source-with-no-remembered-kept-out-list-is-not-collected',
    async function () {
      const meta = metaFor(['apple-notes', 'obsidian-vault']);
      delete meta.vault_excluded_folders;
      const h = await driveCandle({ meta: meta });
      const v = onePostFor(h, 'obsidian-vault');
      caseAssert(v === null,
        'the candle collected the vault with NO remembered kept-out list. ' +
        'It was sent ' + show(v && v.exclude_folders) + ', which fences ' +
        'nothing: her whole vault comes in, unattended, on a tap she made ' +
        'for a different reason (law 5)');
    });

  await runCase('the-other-sources-still-run-when-one-is-held-back',
    async function () {
      // THE CONTROL. Failing closed must skip the UNPROVEN source only --
      // a fix that aborted the whole re-pull would pass the case above
      // while silently killing Apple Notes, which is the very shape of
      // T-26.97-30 this audit is also closing.
      const meta = metaFor(['apple-notes', 'obsidian-vault']);
      delete meta.vault_excluded_folders;
      const h = await driveCandle({ meta: meta });
      const n = onePostFor(h, 'apple-notes');
      caseAssert(n !== null,
        'holding back the unproven vault also cancelled Apple Notes; the ' +
        'candle sent ' + show(postSources(h)));
      caseAssert(same(n.exclude_folders, NOTES_KEPT),
        'Apple Notes lost its own kept-out list in the process: ' +
        show(n.exclude_folders));
    });

  await runCase('an-explicitly-empty-kept-out-list-still-collects',
    async function () {
      // THE SECOND CONTROL, and it is the one that keeps the fix narrow.
      // "She ticked everything" is recorded as an EMPTY ARRAY and is a real
      // answer; only an ABSENT key means she was never asked. A check that
      // could not tell those apart would refuse her a collect she asked for.
      const meta = metaFor(['obsidian-vault']);
      meta.vault_excluded_folders = [];
      const h = await driveCandle({ meta: meta });
      const v = onePostFor(h, 'obsidian-vault');
      caseAssert(v !== null,
        'a vault whose kept-out list is an explicit empty array was held ' +
        'back; absent and empty are different answers and only absent ' +
        'means she was never asked');
      caseAssert(same(v.exclude_folders, []),
        'the explicitly-empty list did not reach the collect: ' +
        show(v.exclude_folders));
    });

  /* -- T-26.97-30: a refusal must not cancel the sources behind it ---------
   *
   * ADDED 2026-08-19 by /gsd-secure-phase. The refusal emptied the whole
   * re-pull queue, mirroring the shipped TRANSIENT-error path. But a refusal
   * is by construction PERSISTENT: it stays until she fixes the condition.
   * The queue is her connected sources in stored order, so a vault sitting
   * before Apple Notes meant every candle tap from then on died on the vault
   * and Notes was never re-pulled again, with no sentence saying so.
   */

  await runCase('a-refusal-does-not-cancel-the-sources-queued-behind-it',
    async function () {
      const h = await driveCandle({
        meta: metaFor(['obsidian-vault', 'apple-notes']),
        refuse: ['obsidian-vault'] });
      const n = onePostFor(h, 'apple-notes');
      caseAssert(n !== null,
        'the vault refusal cancelled Apple Notes: the candle sent ' +
        show(postSources(h)) + '. A refusal is a persistent condition, so ' +
        'this is not one lost run -- Notes is never re-pulled again while ' +
        'the vault keeps refusing, and nothing on screen says so');
      caseAssert(same(n.exclude_folders, NOTES_KEPT),
        'Apple Notes ran but lost its own kept-out list: ' +
        show(n.exclude_folders));
    });

  await runCase('the-refusal-is-still-shown-after-the-queue-drains',
    async function () {
      // THE CONTROL THAT KEEPS THE FIX FROM GOING SILENT. Continuing the
      // queue must not mean she never learns the vault refused.
      const h = await driveCandle({
        meta: metaFor(['obsidian-vault', 'apple-notes']),
        refuse: ['obsidian-vault'] });
      const painted = h.rec.paints.join('   ');
      caseAssert(painted.indexOf(TITLE_TEXT) !== -1,
        'the vault refused and she was never told: nothing painted her ' +
        'refusal card at any point in the run');
    });

  await runCase('a-refusal-with-nothing-queued-behind-it-still-paints-now',
    async function () {
      // The shipped single-source behaviour must be untouched.
      const h = await driveCandle({ meta: metaFor(['obsidian-vault']),
        refuse: ['obsidian-vault'] });
      const painted = h.rec.paints.join('   ');
      caseAssert(painted.indexOf(TITLE_TEXT) !== -1,
        'a lone vault refusal painted no card at all');
      caseAssert(h.REPULL.busy === false,
        'the re-pull never settled after a lone refusal');
    });

  await runCase('no-refusal-means-no-refusal-card',
    async function () {
      // THE INVERSE. If the card can appear on a run that was never refused,
      // the two cases above prove nothing.
      const h = await driveCandle({
        meta: metaFor(['obsidian-vault', 'apple-notes']) });
      const painted = h.rec.paints.join('   ');
      caseAssert(painted.indexOf(TITLE_TEXT) === -1,
        'a run in which NOTHING was refused painted the refusal card');
    });

  /* -- T-26.97-30 (second half): the picker must keep room mode ------------
   *
   * ADDED 2026-08-19 by /gsd-secure-phase. renderVaultFolderPicker took no
   * room flag and its confirm called the collect with three arguments, so
   * roomMode arrived undefined. On the candle path that meant a collect
   * running with room false INTO a room element: the run then reached the
   * import report, which writes a "Step inside" onboarding button into the
   * room panel and binds it to the blessing screen, and the room ending
   * never ran at all.
   */

  await runCase('the-picker-confirm-keeps-the-room-mode-it-was-opened-in',
    async function () {
      const h = pageHarness({ meta: metaFor(['obsidian-vault']),
        foldersRes: foldersRes(VAULT_FOLDERS) });
      h.renderPicker(h.pickerBox, true);
      await settle();
      const go = h.byId('btn-vault-picker-go');
      caseAssert(go, 'the picker did not render its confirm control');
      go.handlers.click();
      await settle();
      caseAssert(h.active().room === true,
        'the picker was opened IN THE ROOM and its confirm started a collect '
        + 'with room mode ' + JSON.stringify(h.active().room) + '. A collect '
        + 'that is not in room mode paints the onboarding import report into '
        + 'the room panel and skips the room ending entirely');
    });

  await runCase('the-picker-opened-from-settings-is-still-not-room-mode',
    async function () {
      // THE CONTROL. Threading the flag must not turn the settings path into
      // a room run.
      const h = pageHarness({ meta: metaFor(['obsidian-vault']),
        foldersRes: foldersRes(VAULT_FOLDERS) });
      h.renderPicker(h.pickerBox);
      await settle();
      const go = h.byId('btn-vault-picker-go');
      caseAssert(go, 'the picker did not render its confirm control');
      go.handlers.click();
      await settle();
      caseAssert(h.active().room !== true,
        'the settings picker started a ROOM-mode collect: ' +
        JSON.stringify(h.active().room));
    });

}

// ---- report -----------------------------------------------------------------

main().then(function () {
  if (violations.length) {
    violations.forEach(function (v) { console.error(v); });
    process.exit(1);
  }
  console.log('test_candle_repull OK (tap-only wiring, pull-only, no coral, ' +
    'room view intact, manage rows, disconnect keeps items, per-source ' +
    'exclusions carried on both entry points — driven)');
}, function (e) {
  console.error('test_candle_repull CRASHED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
