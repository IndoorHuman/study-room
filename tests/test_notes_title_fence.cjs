/*
 * tests/test_notes_title_fence.cjs — the Notes-folder exclusion picker +
 * title-fence framing (Plan 26.65-04, Task 1 — law 5, owner decision
 * 2026-07-25).
 *
 * Zero-dep node (fs/path only), path-independent via __dirname, in the
 * read-source-as-TEXT style of tests/test_adapter_sources.cjs. It reads
 * app.js, server.py, and adapters/apple_notes.py as text — no browser, no
 * DOM library, no new dependency (law 8) — and holds the exclusion picker's
 * contract statically. It is NOT an APP_SOURCES member of test_no_push.cjs;
 * this suite is the plan-scoped complement for the picker surface only.
 *
 * Six assertion groups (26.65-04 SC + UI-SPEC Copywriting Contract):
 *
 *   1. FRAMING COPY — the title-fence framing and the picker line render
 *      byte-exact (UI-SPEC Copywriting Contract rows, verbatim).
 *   2. INCLUDE-ALL DEFAULT — the per-folder rows are plain checkboxes,
 *      checked (= included) by default; the calm 'checking…' interim paints
 *      while the folder list loads (the S1-loading backstop discipline).
 *   3. EXCLUDE FLOW — the confirm collects the UNCHECKED-to-exclude set and
 *      passes it into the collect payload as exclude_folders; the Notes
 *      button opens the picker (never a bare collect); a retry re-carries
 *      the same exclude set.
 *   4. NO COUNT-SHAMING — no 'you excluded N' / skipped-count string is
 *      ever rendered from the picker (law 3, law 7); the exclude list's
 *      length is never interpolated into copy.
 *   5. MANAGE REVERSIBLE — the picker re-opens from the Manage home, so
 *      skipping a folder is never a wall (law 3).
 *   6. SERVER + ADAPTER SEAM — server.py carries the host-guarded folder
 *      list GET and validates exclude_folders before the worker runs;
 *      adapters/apple_notes.py lists folders through the one constant-script
 *      seam with NO argument (a folder name is never formatted into any
 *      script — T-26.65-14) and keeps the exclude compare in python.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every unmet assertion listed on its own line + exit 1 on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const pySrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const adapterSrc = fs.readFileSync(
  path.join(ROOT, 'adapters', 'apple_notes.py'), 'utf8');

const violations = [];

// Slice a top-level function body: from its `function name(` keyword to the
// next module-indent function declaration (the test_adapter_sources.cjs
// convention — app.js keeps a flat layout inside its IIFE).
function functionBody(name) {
  const marker = 'function ' + name + '(';
  const start = appSrc.indexOf(marker);
  if (start === -1) {
    violations.push("[picker] app.js: function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return '';
  }
  const end = appSrc.indexOf('\n  function ', start + marker.length);
  const raw = appSrc.slice(start, end === -1 ? appSrc.length : end);
  const close = raw.lastIndexOf('\n  }');
  return close === -1 ? raw : raw.slice(0, close + 4);
}

function must(src, name, present, label) {
  if (src.indexOf(present) === -1) {
    violations.push('[' + label + '] ' + name + ": missing: '" +
      present + "'");
  }
}

// ---- 1. FRAMING COPY (UI-SPEC Copywriting Contract, verbatim) ---------------

const FRAMING =
  'Some notes carry private things right in the title. Until you bless a ' +
  "note, the room keeps its title out of the librarian's reach. " +
  'Nothing here is read by the librarian before you say so.';
const PICKER_LINE =
  'Keep any Notes folder out of the room: pick the ones to skip.';

must(appSrc, 'app.js', FRAMING, 'framing-copy');
must(appSrc, 'app.js', PICKER_LINE, 'framing-copy');

const picker = functionBody('renderNotesFolderPicker');
if (picker.indexOf('escapeHtml(') === -1) {
  violations.push('[framing-copy] app.js: renderNotesFolderPicker must ' +
    'route its copy through escapeHtml (the index.html sink gate is total)');
}

// ---- 2. INCLUDE-ALL DEFAULT + calm interim ----------------------------------

if (picker.indexOf('type="checkbox"') === -1) {
  violations.push('[include-all] app.js: the picker rows must be plain ' +
    'per-folder checkboxes (type="checkbox")');
}
if (!/type="checkbox"[^>]*\bchecked\b/.test(picker)) {
  violations.push('[include-all] app.js: every folder row must render ' +
    'checked (= included) by default — include-all, never opt-in');
}
if (picker.indexOf('checking…') === -1) {
  violations.push("[include-all] app.js: the picker must paint the calm " +
    "'checking…' interim while the folder list loads");
}

// ---- 3. EXCLUDE FLOW --------------------------------------------------------

// The confirm collects the UNCHECKED set (unchecked -> excluded).
if (!/!\s*[A-Za-z_$][\w$]*\.checked/.test(picker)) {
  violations.push('[exclude-flow] app.js: the picker confirm must collect ' +
    'the UNCHECKED-to-exclude set (a `!box.checked` test)');
}
// The exclude set rides the collect payload as exclude_folders.
const runCollect = functionBody('runAdapterCollect');
if (runCollect.indexOf('exclude_folders') === -1) {
  violations.push('[exclude-flow] app.js: runAdapterCollect must pass the ' +
    'chosen exclude list to POST /api/adapter/collect as exclude_folders');
}
// The Notes button opens the picker — a bare Notes collect (no picker)
// would skip the fence framing entirely.
const onbSources = functionBody('renderOnbSources');
if (onbSources.indexOf('renderNotesFolderPicker') === -1) {
  violations.push('[exclude-flow] app.js: the Apple Notes connect must open ' +
    'the exclusion picker (renderNotesFolderPicker) — never a bare collect');
}
if (/runAdapterCollect\s*\(\s*'apple-notes'\s*\)/.test(onbSources)) {
  violations.push('[exclude-flow] app.js: renderOnbSources still fires a ' +
    'bare runAdapterCollect(\'apple-notes\') — the picker must front it');
}
// A retry re-carries the same exclude set (never silently widening).
const errRender = functionBody('renderAdapterError');
if (!/runAdapterCollect\s*\(\s*ACTIVE_ADAPTER\.source\s*,\s*ACTIVE_ADAPTER\.exclude/.test(errRender)) {
  violations.push('[exclude-flow] app.js: the retry must re-carry ' +
    'ACTIVE_ADAPTER.exclude — a retry must never widen the exclusion');
}

// ---- 4. NO COUNT-SHAMING (law 3, law 7) -------------------------------------

['you excluded', 'you skipped', 'folders excluded', 'folders skipped',
  'excluded folder', 'skipped folder'
].forEach(function (tok) {
  if (appSrc.toLowerCase().indexOf(tok) !== -1) {
    violations.push("[no-count] app.js: the forbidden count-shaming " +
      "phrase '" + tok + "' must never render (law 3/7)");
  }
});
// The exclude list's size is never interpolated into copy.
if (/exclud\w*[^\n]*\.length[^\n]*escapeHtml|escapeHtml[^\n]*exclud\w*[^\n]*\.length/.test(appSrc)) {
  violations.push('[no-count] app.js: an exclude-list length must never be ' +
    'rendered into copy (law 3/7 — no counts of what was kept out)');
}

// ---- 5. MANAGE REVERSIBLE ---------------------------------------------------

const manageSummary = functionBody('renderManageSummary');
if (manageSummary.indexOf('renderNotesFolderPicker') === -1) {
  violations.push('[manage] app.js: the picker must re-open from the Manage ' +
    'home (renderManageSummary) — exclusion is reversible, never a wall');
}

// ---- 6. SERVER + ADAPTER SEAM -----------------------------------------------

// The folder-list GET exists and dispatches inside do_GET (which host-guards
// every /api/ route before the try block).
must(pySrc, 'server.py', '/api/adapter/notes-folders', 'server');
must(pySrc, 'server.py', 'def handle_notes_folders', 'server');

// exclude_folders is read + validated in handle_adapter_collect BEFORE the
// worker runs, and passed into the adapter's collect.
const collectStart = pySrc.indexOf('def handle_adapter_collect');
const collectEnd = pySrc.indexOf('\n    def ', collectStart + 1);
const collectRoute = collectStart === -1 ? '' :
  pySrc.slice(collectStart, collectEnd === -1 ? pySrc.length : collectEnd);
if (collectRoute.indexOf('exclude_folders') === -1) {
  violations.push('[server] server.py: handle_adapter_collect must read + ' +
    'validate exclude_folders before the worker runs');
}
if (!/isinstance\s*\(/.test(collectRoute)) {
  violations.push('[server] server.py: handle_adapter_collect must ' +
    'shape-check exclude_folders (a validated list of strings, fail-closed)');
}

// The adapter lists folders through the ONE constant-script seam with no
// argument — a folder name is never formatted into any script (T-26.65-14).
must(adapterSrc, 'adapters/apple_notes.py', 'def list_folders',
  'adapter');
must(adapterSrc, 'adapters/apple_notes.py', '_LIST_FOLDERS_SCRIPT',
  'adapter');
if (adapterSrc.indexOf('_run_osascript(_LIST_FOLDERS_SCRIPT)') === -1) {
  violations.push('[adapter] adapters/apple_notes.py: list_folders must ' +
    'run the constant script with NO argument — nothing user-typed may ' +
    'ride into the script seam');
}
// The exclude compare stays python-side inside collect (server-side match).
const collectFn = adapterSrc.slice(adapterSrc.indexOf('def collect('));
if (collectFn.indexOf('exclude') === -1) {
  violations.push('[adapter] adapters/apple_notes.py: collect must keep the ' +
    'exclude_folders compare python-side (folder names never enter a script)');
}

// ---- verdict ----------------------------------------------------------------

if (violations.length) {
  console.error('test_notes_title_fence FAILED — ' + violations.length +
    ' assertion(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_notes_title_fence OK');
process.exit(0);
