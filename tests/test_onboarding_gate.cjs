/*
 * tests/test_onboarding_gate.cjs — the first-run gate (Phase 26.6 Plan 01,
 * re-pinned at FOUR steps by Phase 26.93 Plan 09).
 *
 * Zero-dep node (fs/path only), path-independent via __dirname, in the
 * read-source-as-TEXT style of tests/test_surface_wiring.cjs. It reads
 * app.js + index.html as text — no browser, no DOM library, no new
 * dependency. It is NOT an APP_SOURCES member of test_no_push.cjs and is
 * DELIBERATELY EXCLUDED from the per-commit quick gate: it runs only in
 * the full suite.
 *
 * ⚠⚠ 26.93-09 — FOUR FIRST-RUN STEPS, AND THERE WERE FIVE. The removed
 * step shelled a version probe at a program on this machine and reported
 * whether it was signed in. The librarian no longer reaches a model that
 * way, so the field that step branched on stopped arriving — the step
 * would have told every stranger, at the first thing they ever saw, that a
 * working room was not set up. It was removed WHOLE: the roster name, the
 * dispatch branch, the two navigation calls, its six functions and its
 * section.
 *
 * ⚠ THE FAILURE THIS FILE EXISTS TO CATCH IS NOT "A STEP IS MISSING". It
 * is "the step list and the section list DISAGREE" — a name with no
 * section is a blank screen a stranger cannot leave, and a section with no
 * name is dead markup the next reader re-wires. So the two halves are
 * pinned separately, in both directions, and the drill at the bottom
 * proves each half is caught ON ITS OWN. A drill that only removes both
 * together proves nothing about the invariant.
 *
 * Six invariant groups:
 *
 *   1. ONBOARDING SECTIONS — index.html carries the FOUR onboarding
 *      sections, each as an id="screen-…" section: screen-welcome,
 *      screen-name-candle, screen-sources, screen-expect.
 *   2. SCREEN NAMES — app.js SCREEN_NAMES contains those four step names
 *      so showScreen can route to each; and the retired step's name, its
 *      section and its six functions appear NOWHERE.
 *   3. GATE FORK — initSetup's fresh-store branch routes into the
 *      onboarding sequence (the welcome step) rather than bare
 *      showScreen('setup'); the returning branch (items>=1 OR
 *      onboarding_complete) still reaches enterRoom.
 *   4. NAME PERSISTS — the candle-naming step persists the chosen name via
 *      apiPost('/api/meta', { librarian_name … }).
 *   5. TERMINAL STEP — the terminal onboarding step writes
 *      onboarding_complete (through the /api/meta discipline) and calls
 *      enterRoom.
 *   6. NO THIRD QUESTION — the onboarding introduces no third yes/no radio
 *      group beyond the shipped q1-consolidation (setup law 6: max 2).
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every unmet invariant listed on its own line + exit 1 on
 * failure. It takes no argument and writes nothing.
 *
 * Fix the SOURCE (app.js / index.html), never this gate.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const HTML = 'index.html';

const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, HTML), 'utf8');

const violations = [];

// Cases actually executed, counted as they run and asserted against a
// literal at the bottom. A gate whose case count is not pinned can lose an
// assertion silently and still print OK — this project has ~30 recorded
// defects that lived inside the measuring instrument.
let cases = 0;

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

// Slice a top-level function body: from its `function name(` keyword to the
// next module-indent function declaration. app.js keeps a flat layout
// inside its IIFE (the test_surface_wiring.cjs convention), so the boundary
// holds.
function functionBody(src, file, name, group) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) {
    violations.push('[' + group + '] ' + file + ": function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return null;
  }
  const end = src.indexOf('\n  function ', start + marker.length);
  return {
    text: src.slice(start, end === -1 ? src.length : end),
    line: lineOf(src, start)
  };
}

// ---- 1 + 2. THE FOUR STEPS, BOTH HALVES, BOTH DIRECTIONS -------------------

const ONBOARDING_STEPS = ['welcome', 'name-candle', 'sources', 'expect'];

// The step 26.93-09 removed, and the six functions that rendered it. Held as
// DATA rather than as prose in a comment, because this is the half of the
// invariant that has to be checkable: a name that comes back without its
// section, or a section that comes back without its name, is the exact
// failure mode, and neither is visible by looking only at what survives.
const RETIRED_STEP = 'ai-check';
const RETIRED_FUNCTIONS = ['renderOnbAiCheck', 'aiCheckProbe', 'aiCheckReady',
  'aiCheckAbsent', 'aiCheckError', 'wireAiCheckAgain'];

// The SCREEN_NAMES array literal, as text. Null when the declaration is
// gone at all — a different failure, reported by the caller.
function screenRoster(app) {
  const declStart = app.indexOf('SCREEN_NAMES');
  if (declStart === -1) { return null; }
  const open = app.indexOf('[', declStart);
  const close = app.indexOf(']', open);
  return (open !== -1 && close !== -1) ? app.slice(open, close + 1) : '';
}

// THE CHECKER, over TEXT rather than over the files — so the drill at the
// bottom can hand it a mutated copy held in memory. Nothing here reads the
// filesystem and nothing here writes anything.
//
// `tally` counts the cases; the drill passes null so a planted violation
// never inflates the live count.
function firstRunViolations(app, html, tally) {
  const out = [];
  const roster = screenRoster(app);
  if (roster === null) {
    out.push('[screen-names] ' + APP +
      ': SCREEN_NAMES is missing — the screen roster must exist');
    return out;
  }

  ONBOARDING_STEPS.forEach(function (step) {
    if (tally) { tally.n += 2; }
    if (html.indexOf('id="screen-' + step + '"') === -1) {
      out.push('[onboarding-sections] ' + HTML + ': the onboarding section ' +
        'id="screen-' + step + '" is missing — each first-run step must ' +
        'exist as an id="screen-…" section, and a step name with no ' +
        'section is a blank screen a stranger cannot leave (SC1)');
    }
    if (!new RegExp("['\"]" + step + "['\"]").test(roster)) {
      out.push('[screen-names] ' + APP + ": SCREEN_NAMES is missing the " +
        "onboarding step '" + step + "' — showScreen cannot route to it, " +
        'and a section with no step name is markup nothing reaches (SC1)');
    }
  });

  // The retired step, in all three places it could come back.
  if (tally) { tally.n += 3; }
  if (roster.indexOf(RETIRED_STEP) !== -1) {
    out.push('[retired-step] ' + APP + ": SCREEN_NAMES names '" +
      RETIRED_STEP + "' again — first run is FOUR steps (26.93-09). A " +
      'roster name whose renderer and section are gone routes a stranger ' +
      'to a screen that cannot paint and cannot be left');
  }
  if (html.indexOf('screen-' + RETIRED_STEP) !== -1) {
    out.push('[retired-step] ' + HTML + ': the screen-' + RETIRED_STEP +
      ' section is back — index.html carries FOUR first-run sections ' +
      '(26.93-09). A section with no step name in the roster is dead ' +
      'markup, and dead markup is what gets re-wired');
  }
  if (app.indexOf(RETIRED_STEP) !== -1) {
    out.push('[retired-step] ' + APP + ": '" + RETIRED_STEP + "' appears in " +
      'app.js — the removed first-run step left nothing behind, comments ' +
      'included (26.93-09). Describe it, never spell it');
  }

  RETIRED_FUNCTIONS.forEach(function (fn) {
    if (tally) { tally.n += 1; }
    if (app.indexOf(fn) !== -1) {
      out.push('[retired-step] ' + APP + ': ' + fn + ' is back — the six ' +
        'functions behind the removed first-run step went with it. The ' +
        'librarian no longer reaches a model through a program on this ' +
        'machine, so there is nothing for a version probe to ask (26.93-09)');
    }
  });

  return out;
}

(function () {
  const tally = { n: 0 };
  firstRunViolations(appSrc, htmlSrc, tally).forEach(function (v) {
    violations.push(v);
  });
  cases += tally.n;
})();

// ---- 3. GATE FORK -----------------------------------------------------------

(function () {
  const init = functionBody(appSrc, APP, 'initSetup', 'gate-fork');
  if (!init) { return; }
  cases += 3;
  // The fresh-store branch routes into the onboarding sequence (the welcome
  // step), not bare showScreen('setup'): initSetup must reference the
  // welcome step directly or an onboarding entry point that leads there.
  if (!/showScreen\(\s*['"]welcome['"]/.test(init.text) &&
      !/startOnboarding\s*\(/.test(init.text) &&
      init.text.indexOf('welcome') === -1) {
    violations.push('[gate-fork] ' + APP + ':' + init.line +
      " initSetup's fresh-store branch must route into the onboarding " +
      "sequence (the welcome step), not bare showScreen('setup') (SC1)");
  }
  // The returning branch still reaches enterRoom, gated on the populated
  // store OR the onboarding_complete flag.
  if (!/enterRoom\s*\(/.test(init.text)) {
    violations.push('[gate-fork] ' + APP + ':' + init.line +
      ' initSetup must still reach enterRoom on the returning path (SC1)');
  }
  if (init.text.indexOf('onboarding_complete') === -1) {
    violations.push('[gate-fork] ' + APP + ':' + init.line +
      ' initSetup must consult onboarding_complete so a finished ' +
      'first-run returns straight to the room (SC1)');
  }
})();

// ---- 4. NAME PERSISTS -------------------------------------------------------

cases += 1;
if (!/apiPost\(\s*['"]\/api\/meta['"]\s*,\s*\{[^}]*librarian_name/
  .test(appSrc)) {
  violations.push('[name-persists] ' + APP + ': the candle-naming step must ' +
    "persist the chosen name via apiPost('/api/meta', { librarian_name … }) " +
    '(SC1)');
}

// ---- 5. TERMINAL STEP -------------------------------------------------------

cases += 2;
if (!/apiPost\(\s*['"]\/api\/meta['"]\s*,\s*\{[^}]*onboarding_complete/
  .test(appSrc)) {
  violations.push('[terminal-step] ' + APP + ': the terminal onboarding step ' +
    "must write onboarding_complete through the /api/meta discipline (SC1)");
}
if (appSrc.indexOf('onboarding_complete') !== -1 &&
    !/enterRoom\s*\(/.test(appSrc)) {
  violations.push('[terminal-step] ' + APP + ': the terminal onboarding step ' +
    'must call enterRoom after writing onboarding_complete (SC1)');
}

// ---- 6. NO THIRD QUESTION ---------------------------------------------------
//
// Setup law 6 caps the room at two yes/no questions. The shipped
// q1-consolidation group is three radios (yes / no / skip); the onboarding
// must not introduce a third radio group. Pin the shipped q1 count as
// unchanged and forbid a q3 group. ⚠ 26.93-09 removed a step and added
// none: the room's default answers the question the removed step asked, so
// nothing new is asked of a stranger.

(function () {
  cases += 2;
  const q1 = (htmlSrc.match(/name="q1"/g) || []).length;
  if (q1 !== 3) {
    violations.push('[no-third-question] ' + HTML + ': the shipped ' +
      'q1-consolidation radio group must stay exactly 3 radios (name="q1") ' +
      '— found ' + q1 + ' (setup law 6: the onboarding adds no question)');
  }
  if (/name="q3"/.test(htmlSrc)) {
    violations.push('[no-third-question] ' + HTML + ': a name="q3" radio ' +
      'group appeared — the onboarding must introduce no third yes/no ' +
      'question (setup law 6: max 2)');
  }
})();

// ---- THE MUTATION DRILL -----------------------------------------------------
//
// ⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE, and the four-step pins above are
// NEW gates wearing an old name — their expected values changed this wave.
// So each one is driven red on a planted violation, with unmutated controls
// counted in the same run.
//
// ⚠ EVERY MUTATION IS A STRING SUBSTITUTION IN MEMORY. Nothing here writes a
// source file, and every mutation asserts it actually CHANGED the text
// first: a substitution that silently matched nothing is a mutation that
// was never planted, and a drill that counts it as caught is precisely the
// instrument-side defect this project keeps producing.
//
// The two that matter are the two halves SEPARATELY — a name with no
// section, and a section with no name. Removing both together would prove
// nothing about the invariant.

const MUTATIONS = [
  ['a retired step name returns to the roster WITHOUT its section',
    function () {
      return [appSrc.replace("'name-candle', 'sources'",
        "'name-candle', '" + RETIRED_STEP + "', 'sources'"), htmlSrc];
    }],
  ['the retired section returns WITHOUT its step name',
    function () {
      return [appSrc, htmlSrc.replace(
        '<section id="screen-sources" class="screen"></section>',
        '<section id="screen-' + RETIRED_STEP + '" class="screen"></section>' +
        '\n  <section id="screen-sources" class="screen"></section>')];
    }],
  ['a surviving step loses its section',
    function () {
      return [appSrc, htmlSrc.replace('id="screen-expect"',
        'id="screen-expect-renamed"')];
    }],
  ['a surviving step loses its roster name',
    function () {
      return [appSrc.replace("'sources', 'expect']", "'expect']"), htmlSrc];
    }],
  ['one of the six retired functions comes back',
    function () {
      return [appSrc.replace('function onbGo(',
        'function ' + RETIRED_FUNCTIONS[1] + '() { return null; }\n' +
        '  function onbGo('), htmlSrc];
    }]
];

const DRILL_EXPECTED = 5;
const CONTROLS_EXPECTED = 2;
const CASES_EXPECTED = 25;

let caught = 0;
MUTATIONS.forEach(function (m) {
  const pair = m[1]();
  if (pair[0] === appSrc && pair[1] === htmlSrc) {
    violations.push('[drill] the mutation "' + m[0] + '" changed nothing — ' +
      'the substitution matched no text, so nothing was planted and a ' +
      'catch would be meaningless');
    return;
  }
  if (firstRunViolations(pair[0], pair[1], null).length > 0) {
    caught += 1;
    return;
  }
  violations.push('[drill] the mutation "' + m[0] + '" was NOT caught — the ' +
    'pin it targets does not hold, and a green run of this suite would be ' +
    'evidence of nothing');
});

let controlsGreen = 0;
for (let c = 0; c < CONTROLS_EXPECTED; c++) {
  const control = firstRunViolations(appSrc, htmlSrc, null);
  if (control.length === 0) { controlsGreen += 1; }
}

if (caught !== DRILL_EXPECTED) {
  violations.push('[drill] ' + caught + ' of ' + DRILL_EXPECTED +
    ' mutations caught — the count is asserted by value so a drill that ' +
    'stopped early cannot report a pass');
}
if (controlsGreen !== CONTROLS_EXPECTED) {
  violations.push('[drill] ' + controlsGreen + ' of ' + CONTROLS_EXPECTED +
    ' unmutated controls came back green — a drill whose control is red is ' +
    'measuring the source, not the pin (and the run order must not leave ' +
    'state behind: the second control runs AFTER every mutation)');
}
if (cases !== CASES_EXPECTED) {
  violations.push('[cases] ' + cases + ' cases executed, ' + CASES_EXPECTED +
    ' expected — an assertion was added or lost without moving the literal');
}

console.log('CASES ' + cases);
console.log('DRILL ' + caught + '/' + MUTATIONS.length +
  ' mutations caught, ' + controlsGreen + ' controls green');

// ---- verdict ----------------------------------------------------------------

if (violations.length) {
  console.error('test_onboarding_gate FAILED — ' + violations.length +
    ' invariant(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_onboarding_gate OK');
process.exit(0);
