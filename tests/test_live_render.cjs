#!/usr/bin/env node
'use strict';
/* =========================================================================
   26.91-01 — THE LIVE RENDER GATE.

   WHY THIS SUITE EXISTS, AND WHY IT IS NOT A GREP.
   `tokens.css:2524` shipped `linear-gradient(var(--wood-deep) 0 30%,
   var(--wood) 30% 100%)`. `--wood` had ONE reference and ZERO definitions in
   the entire served tree, so the declaration was invalid at computed-value
   time, `background` fell to its initial value, and the notebook's sticker
   tin rendered as a bordered, bevelled, EMPTY box. That is the owner's F-6
   complaint, mechanically — "an empty-looking thin rectangle outline", "she
   could not find the sticker tray at all".

   `grep -c 'linear-gradient' tokens.css` passes on that build. It passes on
   ANY build where the string is present, including a deliberately broken one.
   A source assertion structurally cannot see this defect. That is why this
   file drives a real render engine and reads a real computed style.

   ASK THE ANTI-VACUITY QUESTIONS OF IT (26.91-VALIDATION.md):
     1. Can it pass before the work? NO — it was RED at HEAD on the tin.
     2. Can it pass after the work is deliberately broken? NO — six planted
        mutations were driven and each went red on its intended assertion
        (recorded in 26.91-01-SUMMARY.md).
     3. Does a degenerate implementation satisfy it? NO — the node count is
        pinned BY VALUE and asserted BEFORE any style is read, so a blank page
        fails on the count rather than passing through a zero-iteration loop.
     4. Evaluation order or source order? EVALUATION — every value here comes
        off a live page, none of it off a file.
     5. Does it match the fix's own comment? NO — it never reads the file.

   NO RUNNER MEANS FAILURE, NEVER A QUIET STOP. If Chrome cannot be launched
   this suite exits NON-ZERO with the binary path in the message.

   IT NEVER TOUCHES THE OWNER'S LIBRARY. The only files read are `tokens.css`
   and the vendored pixel font; the only files written live in a fresh
   `os.tmpdir()/gsd-2691-*` dir removed on both the pass and the fail path.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cdp = require('./lib/cdp.cjs');
const harness = require('./lib/render-harness.cjs');
const appServer = require('./lib/app-server.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const KS = harness.KS;

/* ---- 26.91-03: THE LIFT (G-C5) -----------------------------------------
   Every slot number and every label string below comes out of app.js. A
   hand-copied slot table or a hand-copied label would be the harness
   agreeing with itself — the same failure as a source grep, one layer down,
   and the exact reason the stylesheet is inlined as literal bytes rather
   than restated. */
const appSrc = fs.readFileSync(path.join(REPO_ROOT, 'app.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(REPO_ROOT, 'core.js'), 'utf8');

/* 26.91-15: the shipped stylesheet and the shipped page markup, read as
   BYTES for the same reason app.js is. The palace recipe's own declared
   values and the chrome fields that must keep matching it are LIFTED out of
   them; a hand-typed `2px` or a hand-typed `<input>` would be the harness
   agreeing with itself. */
const tokensSrc = fs.readFileSync(path.join(REPO_ROOT, 'tokens.css'), 'utf8');
const indexSrc = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map(function (l) { return l.replace(/^\s*\/\/.*$/, ''); }).join('\n');
}

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) {
    throw new Error('G-C5 lift: ' + name + ' is not defined in app.js.');
  }
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

/* a `var NAME = <literal>;` declaration, by balanced-delimiter scan over
   comment-stripped source. */
function declOf(name) {
  const src = stripComments(appSrc);
  const at = src.search(new RegExp('\\n\\s*var ' + name + '\\s*='));
  if (at === -1) { throw new Error('G-C5 lift: no declaration for ' + name); }
  const from = src.indexOf('=', at) + 1;
  let d = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '[' || c === '(') { d++; }
    else if (c === '}' || c === ']' || c === ')') { d--; }
    else if (c === ';' && d === 0) {
      return 'var ' + name + ' =' + src.slice(from, i) + ';';
    }
  }
  throw new Error('G-C5 lift: unterminated declaration for ' + name);
}

/* NB_TRACE_GEOM is lifted AFTER STATION_NOTEBOOK_GEOM and that order is
   load-bearing, not stylistic: its two members are BY-REFERENCE reads of
   that object, so a lift in the other order is a ReferenceError. */
const SLOT_NAMES = ['STATION_NOTEBOOK_GEOM', 'NB_TRACE_GEOM', 'NB_TIN',
  'NB_ENTRY_ROW', 'NB_BAND', 'NB_RESET_COPY', 'NB_TEXT_BOX'];
// eslint-disable-next-line no-new-func
const SRC = new Function(SLOT_NAMES.map(declOf).join('\n') +
  '\nreturn { ' + SLOT_NAMES.map(function (n) { return n + ': ' + n; })
    .join(', ') + ' };')();

/* Each label is pulled out of the painter that writes it. `pick` fails loudly
   rather than yielding undefined: a lift that silently returned nothing would
   make assertion 1 compare undefined to undefined and pass. */
function pick(src, re, what) {
  const m = src.match(re);
  if (!m || !m[1]) {
    throw new Error('G-C5 lift: could not read ' + what + ' from app.js.');
  }
  return m[1];
}
const BAND_SRC = extractFn(appSrc, 'renderNotebookBand');
const TIN_SRC = extractFn(appSrc, 'renderTinTray');
const SPREAD_SRC = extractFn(appSrc, 'paintNotebookSpread');

const STACK_PAIR = BAND_SRC.match(
  /\[\['([a-z]+)', NB_UNDO, doNbUndo\],\s*\['([a-z]+)', NB_REDO, doNbRedo\]\]/);
if (!STACK_PAIR) {
  throw new Error('G-C5 lift: could not read the undo/redo labels from ' +
    'renderNotebookBand.');
}

const LABELS = {
  tin: pick(TIN_SRC, /tin\.textContent = '([^']+)'/, "the tin's label"),
  undo: STACK_PAIR[1],
  redo: STACK_PAIR[2],
  pen: pick(BAND_SRC, /pen\.textContent = '([^']+)'/, "the pen's label"),
  write: pick(BAND_SRC, /write\.textContent = '([^']+)'/, "write's label"),
  reset: pick(declOf('NB_RESET_COPY'), /'([^']+)'/, 'NB_RESET_COPY'),
  exit: pick(SPREAD_SRC, /NBDESIGN \? '([^']+)' : '[^']+'/, 'the exit label'),
  entry: pick(SPREAD_SRC, /NBDESIGN \? '[^']+' : '([^']+)'/, 'the entry label')
};

/* THE BAND PROBE TABLE. class lists are the SHIPPED ones; every slot is the
   real declaration's object, never a re-typed number.

   `reset` is modelled as the painter builds it — a <div> row carrying a
   `.station-nb-word` <button> child — because that is where its label
   actually lives. A bare text node would have measured a different box. */
const BAND = [
  { name: 'tin', cls: 'station-tin', tag: 'button', slot: SRC.NB_TIN },
  { name: 'undo', cls: 'station-caption-add station-nb-row', tag: 'button',
    slot: SRC.NB_BAND.undo },
  { name: 'redo', cls: 'station-caption-add station-nb-row', tag: 'button',
    slot: SRC.NB_BAND.redo },
  { name: 'reset', cls: 'station-caption-add station-nb-row station-nb-reset',
    tag: 'div', slot: SRC.NB_BAND.reset, innerCls: 'station-nb-word' },
  { name: 'exit',
    cls: 'station-caption-add station-nb-row station-arrange-row',
    tag: 'button', slot: SRC.NB_BAND.exit },
  { name: 'pen', cls: 'station-caption-add station-nb-row station-nb-pen',
    tag: 'button', slot: SRC.NB_BAND.pen },
  { name: 'write', cls: 'station-caption-add station-nb-row station-nb-write',
    tag: 'button', slot: SRC.NB_BAND.write },
  { name: 'entry',
    cls: 'station-caption-add station-nb-row station-arrange-row',
    tag: 'button', slot: SRC.NB_ENTRY_ROW }
].map(function (c) { c.label = LABELS[c.name]; return c; });

/* ---- (91f) G-B-trace — THE TRACE BACKSTOP, because the slot clips SILENTLY
   ------------------------------------------------------------------------
   `.station-caption` carries `overflow: hidden`, so a too-long trace clips
   with NO SYMPTOM. Every number below is measured on the live page.

   THE COMPOSED STRING IS LIFTED FROM THE SHIPPED COMPOSER, never re-typed.
   A harness that wrote the very string it then asserted would be the harness
   agreeing with itself — the failure M-R2 found one wave ago, where changing
   the tin's label in app.js left assertion 1 green. */
const composeArrivalTrace = (function () {
  /* 26.91-08: the composer now reads three MODULE-SCOPE policy tables
     (TRACE_NEVER_NAME, TRACE_SOURCE_PHRASE, TRACE_FOLDER_CAP), which are free
     variables inside this lift. They are co-lifted BY NAME from the shipped
     source through the same `declOf` scan the geometry slots use — never
     retyped here, so the 24-character cap this gate measures at is the
     SHIPPED cap and not a copy of it. */
  const consts = ['TRACE_NEVER_NAME', 'TRACE_SOURCE_PHRASE',
    'TRACE_FOLDER_CAP'].map(declOf).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(consts + '\n' +
    extractFn(appSrc, 'composeArrivalTrace') +
    '\nreturn composeArrivalTrace;')();
})();

/* Folder names AT THE 24-CHARACTER CAP, one no-space Latin and one all-CJK.
   Both are 24 JS string units and both compose the same 118-unit line; their
   RENDERED widths differ (Pixelify Sans has no CJK coverage and falls back at
   about 1 em per character), which is the whole reason this is measured live
   rather than counted. */
const TRACE_LATIN24 = 'mmmmmmmmmmmmmmmmmmmmmmmm';
const TRACE_CJK24 = '文文文文文文文文文文文文文文文文文文文文文文文文';

function traceEntries(folder) {
  /* the worst composable shape: BOTH kinds (so `{kinds}` is the longest of
     the three) and a second folder (so the tail is present). */
  return [
    { ms: 1, dayLabel: '07/19/2026', monthKey: '2026-07', kind: 'notes',
      folder: folder, source: 'folder-drop' },
    { ms: 2, dayLabel: '07/19/2026', monthKey: '2026-07',
      kind: 'photographs', folder: folder, source: 'folder-drop' },
    { ms: 3, dayLabel: '07/19/2026', monthKey: '2026-07', kind: 'notes',
      folder: 'chinese', source: 'folder-drop' }
  ];
}

const TRACES = [
  { name: 'trace-latin', text: composeArrivalTrace(traceEntries(TRACE_LATIN24)) },
  { name: 'trace-cjk', text: composeArrivalTrace(traceEntries(TRACE_CJK24)) },
  /* the TYPICAL line too, so the gate is not measured only at its worst. */
  { name: 'trace-typical', text: composeArrivalTrace([
    { ms: 1, dayLabel: '07/19/2026', monthKey: '2026-07', kind: 'notes',
      folder: 'chinese', source: 'folder-drop' }
  ]) }
];
const TRACE_COUNT = 3;
/* The longest composable line, pinned BY VALUE in JS string units — 57 of
   frame + 24 of capped folder + 37 of tail. Pinned here as well as in
   test_blessings_notebook.cjs on purpose: this suite must fail if the copy
   grows, and a length it computed from the string it is measuring would
   move with it. */
const TRACE_LONGEST = 118;
/* The trace's own slot, taken from the REAL declaration. `--x` is
   page-relative exactly as the painter computes it: pageX.left + dx. */
const TRACE_SLOT = {
  x: SRC.STATION_NOTEBOOK_GEOM.pageX.left + SRC.NB_TRACE_GEOM.line.dx,
  y: SRC.NB_TRACE_GEOM.line.y,
  w: SRC.NB_TRACE_GEOM.line.w,
  h: SRC.NB_TRACE_GEOM.line.h
};
/* THE SECOND, INDEPENDENT COPY, pinned BY VALUE — the same posture
   EXPECTED_W takes, and for the same measured reason: a harness that BUILDS
   from the lifted slot and then compares the rendered box against that same
   lifted number moves both sides together, so no slot change can redden it. */
const TRACE_EXPECTED_W = 144;
const TRACE_EXPECTED_H = 108;

/* pinned BY VALUE — not BAND.length compared to itself, which a vanished
   control satisfies by lowering both sides. */
const BAND_COUNT = 8;
const BAND_HEIGHT = 16; // every band control shares the one baseline height

/* ---- THE SECOND, INDEPENDENT COPY OF THE GEOMETRY AND THE COPY ---------
   MEASURED, NOT REASONED ABOUT. Mutation M-R3 shrank `NB_BAND.undo` from 28
   to 24 in app.js and this suite exited 0. The reason is the `p === n` shape
   the sweep pin was written to avoid, one layer down: the harness BUILDS
   each node from the lifted slot and then compares the rendered box against
   that same lifted number, so both sides move together and no slot change
   can ever redden it. The same held for the labels — M-R2 changed the tin's
   label in app.js and assertion 1 stayed green, because the harness wrote
   the very string it then asserted.

   Lifting is still right: it is what stops the harness re-typing geometry it
   is checking. But a lift ALONE cannot notice a deliberate change. So these
   two tables are a SECOND, INDEPENDENT copy, pinned by value — the same
   posture `NODE_SUITES` takes, and for the same reason: whoever moves a slot
   or rewrites a label moves these lines in the SAME COMMIT, which is the
   point rather than an inconvenience.

   `marks` is 32 and MAY NOT BE NARROWED to buy space for anything else — it
   names the entire sticker library the owner could not find (F-6), it is the
   thinnest margin on the band (5.08 CSS px at k=1, measured), and the owner's
   answer to Open Decision #4 fences it explicitly.

   `reset` at 76 is likewise not on the recovery ladder, and 26.91-11 (F-2)
   CHANGED THE REASON WITHOUT CHANGING THE NUMBER. It used to be excluded
   because the label it carried had no margin left at 72. The label was
   renamed to a SHORTER one, so that is no longer true: under the
   pessimistic integer-rounded model the current label needs 57 px against
   68 px of content box, 11 px of margin where the retired one had 4.
   The slot stays 76 anyway, and the freed 4 px is NOT reclaimed — the
   exclusion now rests on Open Decision #4's answer
   (`pre-authorize-ladder-only`) and on D-09's rule that this band is
   re-laid at most once, which it already has been. A shorter label buys
   MARGIN here; it does not release width for anything else. */
const EXPECTED_W = { tin: 32, undo: 28, redo: 28, reset: 76, exit: 76,
  pen: 24, write: 32, entry: 104 };
const EXPECTED_LABEL = { tin: 'marks', undo: 'undo', redo: 'redo',
  reset: 'undo everything', exit: 'done arranging', pen: 'pen',
  write: 'write', entry: 'arrange this day' };

/* ---- assertion plumbing -------------------------------------------------
   Every assertion is NAMED. Failures print to stderr so a passing run's
   stdout stays byte-identical between invocations (the idempotency edge). */
let PASSED = 0;
let FAILED = 0;

function ok(cond, name, detail) {
  if (cond) { PASSED++; return true; }
  FAILED++;
  console.error('FAIL [' + name + '] ' + detail);
  return false;
}

/* THE PROBE TABLE — the source of truth for what is on the page and what each
   node's pinned scene-px size is. Every assertion is keyed by NAME and
   resolved with `[data-probe="..."]`, never by node index: a painter that
   reordered its appendChild calls could otherwise move an assertion onto a
   different control. */
const PROBES = [
  /* `role` decides which contract a probe answers to. The ENABLED path must
     not be the only path measured — 26.91-UI-SPEC consideration `partial/E2`
     names that explicitly — so the disabled treatment is a probe of its own
     rather than an inference from the enabled one. */
  { name: 'tin-enabled', cls: 'station-tin', tag: 'button', role: 'raised',
    focusable: true, x: 28, y: 196, w: 32, h: 16 },
  { name: 'nb-row', cls: 'station-caption-add station-nb-row', tag: 'button',
    role: 'raised', focusable: true, x: 128, y: 196, w: 64, h: 16 },
  { name: 'tin-disabled', cls: 'station-tin station-nb-off', tag: 'button',
    role: 'disabled', focusable: false, x: 88, y: 196, w: 32, h: 16 }
];

/* The node count, pinned BY VALUE. Not `PROBES.length` compared to itself —
   that is the `p === n` shape which a vanished probe satisfies by lowering
   both sides. */
const PROBE_COUNT = 3;

/* The shipped disabled treatment, quoted from tokens.css:2906-2909 —
   `opacity: 0.45; pointer-events: none`. DISABLED, NEVER HIDDEN: a band whose
   control count changed with history would reflow the row and move the reset
   and exit targets under her finger. */
const DISABLED_OPACITY = '0.45';
const DISABLED_POINTER_EVENTS = 'none';

/* THE NODE SWEEP TOTAL, PINNED BY VALUE. 38 shipped suites + this one.
   Moved 38 -> 39 by 26.91-12, in the SAME COMMIT that added
   `tests/test_leak_scan.cjs` — which is what the paragraph below demands of
   whoever adds a suite. `tests/lib/leak-scan.cjs` landed in the same commit
   and does NOT move this number: it is a library, and the glob below does
   not match `tests/lib/`.
   A stale number here is a PERMANENTLY UNMEETABLE GATE, not a discrepancy to
   reconcile later: whoever adds suite 39 must move this line in the same
   commit, which is the point. `p === n` would not do that job — a vanished
   suite lowers both sides and the equality still holds.

   26.94-02 moved it to 40: `tests/test_vision_source.cjs`, the static gate
   over every tracked `.swift` source (no arm of the language branch may lead
   with `en-US`). 26.94-06 moved it to 41: `tests/test_vision_progress.cjs`,
   V22 — the reading phase's readout counts every ATTEMPT and refuses to
   forecast below 5 items AND below 3 seconds. 26.94-11 moved it to 42:
   `tests/test_vision_hold.cjs`, the owner's 2026-08-14 placement ruling —
   the import report is HELD while the photographs are read and released on
   every one of the five endings. F-04 moved it to 43:
   `tests/test_shot_thumbnails.cjs`, the owner's other 2026-08-14 ruling —
   a screenshot note's kept pictures open as a row of thumbnails above the
   text, measured in a real DOM over the same CDP runner this suite uses.
   F-03 moved it to 44: `tests/test_paragraph_runs.cjs`, the wall of text
   broken into paragraphs at display time — and the claim that matters most
   there is what is NOT touched.

   26.95-30 moved it to 45: `tests/test_offer_selector.cjs`, the pure-core
   pins for the reach back's fortnight lookup — the gated pool draw, the
   oldest-first ordering, the Seed and the silent presence probe. Its
   companion `tests/test_offer_records.py` is PYTHON: it moves the python
   total and the two rosters in `tests/test_stage_public.py`, and it never
   moves this one.
   ⚠ THIS LINE WAS MOVED FROM OUTSIDE 26.95-30'S OWN FILE LIST, deliberately,
   because this gate's whole point is that it cannot be left for later: the
   suite that adds the 45th `.cjs` and does not move this constant ships a
   PERMANENTLY UNMEETABLE GATE, which is worse than an out-of-plan touch.
   The number is the one the gate itself measured (45), not an increment
   chosen to clear a red suite.

   26.95-35 moved it to 46: `tests/test_offer_render.cjs`, the five held-out
   UI-state checks read as COMPUTED STYLES off a live page — the answer row
   reaching a new row at a narrow width, the caption wrapping rather than
   truncating, the not-relevant beat leaving no residue, a picture whose file
   cannot be read, and a second door in one visit. It rides the same CDP
   runner and the same `render-harness.cjs` this suite does, for the same
   reason this suite exists: four of those five claims are invisible to a
   source grep, exactly as the `--wood` reference was.
   ⚠ IT MOVED THE PIN ON ITS FIRST RUN RATHER THAN LEAVING IT, on the
   precedent 26.95-30 set two paragraphs up. The number is the one the glob
   measured (`ls tests/*.cjs | wc -l` = 46), not an increment chosen to clear
   a red suite.

   26.99-01 moved it to 47: `tests/test_2699_pins.cjs`, phase 26.99's pin
   inventory — one row per pin this phase's changes can falsify, naming the
   gate it lives in, the one plan authorised to move it and the ruling that
   authorises the move, each proved by a grep AND by a planted violation the
   pin must reject. ⚠ THAT SUITE WAS NOT IN 26.99-01'S FILE LIST EITHER, and
   this constant is why it was touched anyway: the paragraph two above says
   what happens to the plan that adds the Nth `.cjs` and leaves this behind,
   and Wave 0 of a phase whose whole purpose is that a red can be READ is the
   last place to ship a permanently unmeetable gate. The number is the one the
   glob measured (`ls tests/*.cjs | wc -l` = 47), not an increment chosen to
   clear a red suite.

   ⚠ THERE ARE TWO NODE-SUITE
   PINS AND THEY ARE NOT
   DUPLICATION — `tests/test_stage_public.py` carries the other, alongside
   the python total and the added/removed rosters that name which plan moved
   it. This one is the in-suite reminder that fires without running python;
   that one is the arithmetic. Move both, in the same commit.

   The python total is 30 (`tests/test_*.py`; `eval_reflection.py` and
   `make_album_fixture.py` are not suites and the glob excludes them
   structurally). It is stated HERE AS A COMMENT ONLY — this suite must not
   shell out to python, and a number it cannot check is a number it must not
   claim to have checked.
   ⚠ THIS LINE READ 19 FOR SEVERAL PHASES, AND THAT IS THE COST OF THE
   SENTENCE ABOVE. A number no gate checks is a number that drifts silently:
   the python side had moved to 28 by the close of 26.94 while this said 19,
   and nothing anywhere went red. Corrected to the measured 29 on 2026-08-15
   (`ls tests/test_*.py | wc -l`), and moved to 30 the same day when
   26.95-32 added `test_provider_schema_shape.py` — the pin that would have
   caught the reflection schema Anthropic refused. It stays prose, because
   the alternative is this suite shelling out to python — but whoever reads
   it next should treat it as a signpost, never as evidence. The CHECKED
   python total lives in `tests/test_stage_public.py`. */
/* 26.97-08b: 47 -> 49. Two commits added a suite without moving this
   constant in the same commit, which is exactly what the assertion below
   asks for: 366765f added tests/test_roster_pane.cjs (26.96-01) and
   0f83518 added tests/test_obsidian_picker.cjs (26.97-08). Both are this
   session's work, so this is the maintenance the gate exists to demand,
   not a reconciliation of someone else's drift. Ledger 51 + 57.
   26.97-10: 49 -> 50. tests/test_vault_refusal.cjs is added by this same
   commit (the refusal's face, on both surfaces), so the constant moves with
   it rather than being left for a later reconciliation. Measured, not
   assumed: `ls tests/*.cjs | wc -l` read 49 at HEAD 6f63bd6 and the file
   was absent from both the tree and the index. */
// 50 -> 52, and BOTH movers are named because this constant has been stale
// once already and a stale gate is unmeetable rather than merely wrong:
//   +1  tests/test_tree_snapshot.cjs             (26.96-08, 984770c)
//   +1  tests/test_roster_sentence_reaches_her.cjs (26.96, F-2 / F-4)
//   +1  tests/test_roster_ruled_copy.cjs            (26.96, T-26.96-42 —
//       her two ruled sentences pinned against 26.96-DECISIONS.md)
// ⚠ 26.96-08 added its suite without moving this, which is what left the
// gate red — and waves 08, 09, 10 and 11 each recorded the node sweep as
// all-green while it was not, because $? was read after a pipe. The number
// below was taken by counting the glob, not by trusting any of those runs.
// 53 -> 55, moved in the same commit as the two suites, and both are named:
//   +1  tests/test_manage_only_sentence_pinned.cjs (26.96 gap WR-15 residual —
//       CONFIG_MANAGE_ONLY_MSG's two shipped homes pinned to her ruled record)
//   +1  tests/test_roster_short_viewport.cjs       (26.96 truth 19 — the
//       10rem cap DRIVEN in real Chrome at a short viewport)
// 55 -> 56, moved in the same commit as the suite it counts:
//   +1  tests/test_consent_card_reaches_her.cjs   (26.995 gap G-26.995-2 —
//       the consent card's three controls measured in real Chrome at HER
//       OWN 1400x782, plus two backstop viewports and a tab-order arm)
// 56 -> 57, moved in the same commit as the suite it counts:
//   +1  tests/test_roster_removal_scope_reaches_her.cjs  (26.995 W-7 — HER
//       sentence for the moment she REMOVES a folder from her private list,
//       read out of the RENDERED removal card in real Chrome, beside the
//       existing warning it is added to and never replaces)
// 57 -> 58, moved LATE and that is recorded rather than tidied away: the
// suite landed in 26.998-04 (`a4671b8`) and this pin was NOT bumped with it,
// so the gate stood UNMEETABLE from that commit until the phase's regression
// sweep caught it. Exactly the failure this comment block exists to prevent.
//   +1  tests/test_reflection_reach.cjs  (26.998-04 — HER reach control:
//       the six lines she chose pinned BY VALUE against the planning record,
//       the parser driven, and no default span anywhere in the signature)
// 58 -> 59, moved in the same commit as the suite it counts — deliberately,
// one commit after the LATE bump above taught what a stale number costs:
//   +1  tests/test_reach_reaches_her.cjs  (26.998 verification gap 1 /
//       security T-26.998-12 — her six lines measured on the RENDERED page in
//       real Chrome at her own 1400x782 plus two backstops, and measured
//       inside the session spot's OWN SCROLL BOX rather than merely inside
//       the window, because the shipped defect was in-window and clipped)
// 59 -> 60, moved in the same commit as the suite it counts:
//   +1  tests/test_call_cost.cjs  (FINDING F10 — the arithmetic half: what a
//       call ACTUALLY cost, priced on what was SENT as well as what came
//       back, refusing rather than reporting a false zero. Her consent
//       sentence is pinned BYTE-UNCHANGED there on purpose: fixing the
//       arithmetic is not permission to reword what she agreed to)
// 60 -> 61, moved in the same commit as the suite it counts:
//   +1  tests/test_her_ranking.cjs  (26.998-07 — HER ranking IS the cut:
//       strict order, clippings tied with screenshots, words before wordless,
//       and her 50-photo slice. Every line of it hers; the gate also PINS
//       that her two sentences reach no screen, so wiring them without her
//       words goes red)
// 62 -> 63, moved in the same commit as the suite it counts:
//   +1  tests/test_pulled_cable.cjs  (26.98-07 / SC-5 — the handoff's own
//       named beat, run by a machine for the first time: a real reflection
//       begun, the connection dropped from OUTSIDE through the runner's
//       network emulation, and the room measured back to rest inside the
//       shipped 45s bound with one of HER sentences, a candle at its resting
//       derivation, everything already painted still standing and a real
//       dispatched tap starting a new sitting. ⛔ It does NOT settle SC-5:
//       the WATCHED half is owed to the owner and is recorded outstanding)
// 64 -> 66, moved by 26.99955-01 — TWO steps, and the double step is itself
// a finding, not a convenience:
//   +1  tests/test_subject_aside.cjs (26.9985-b) landed WITHOUT moving this
//       line — the exact failure the paragraph above names. 26.99955-01's
//       precondition re-verified this constant from disk and found the gate
//       already red at HEAD, 65 files against a declared 64, attributed by
//       `git log --diff-filter=A` to 6fa5a5b. On the 26.95-30 / 26.99-01
//       precedent the number set here is the one the glob measures, with the
//       causing suite named — never an increment chosen blind.
//   +1  tests/test_manage_landing.cjs (26.99955-01) — the F-9 reachability
//       + count-discipline pin for the Manage landing page: every live
//       MANAGE_PANES key must have a landing tile at non-zero rendered size
//       in real Chrome, the round-trip (tile → full-width pane → back) is
//       driven end to end, and the static arm pins the roster derivation
//       itself (no hand-kept key list; the law-3 null-count guard; a
//       narrowed lift that fails LOUDLY when it comes up short). Driven RED
//       on a planted defect (a filter dropping `subjects`) before being
//       believed; the plant was reverted, never committed.
//       MEASURED at the moment of this commit: `ls tests/*.cjs | wc -l` = 66.
// 66 -> 67, moved by 26.999 (night of 2026-08-25) — ONE step, and it is the
// same class of miss the paragraph above exists to catch, caught the same
// way: tests/test_related_blessings.cjs (the pass that leads with what she
// recently welcomed) landed in df95d6b WITHOUT moving this line, and the
// gate went red at HEAD. It was found by the 26.99955 sweep and relayed,
// not by the session that caused it — which is the whole argument for
// keeping this pin BY VALUE. The number set here is the one the glob
// measures, with the causing suite named.
//       MEASURED at the moment of this commit: `ls tests/*.cjs | wc -l` = 67.
// 67 -> 68, moved by 26.99955-08 (2026-08-26) — ONE step, in the SAME
// COMMIT as the suite that caused it, which is what the paragraph above
// asks of whoever adds one: tests/test_pen_cup_door.cjs, the gate on the
// activity log's one door after her ruling took it off Manage and into the
// room. ⛔ Moved because a suite was added, never to make a red gate green.
//       MEASURED at the moment of this commit: `ls tests/*.cjs | wc -l` = 68.
// 68 -> 69, moved by 26.99955-09 (2026-08-26) — ONE step, in the SAME COMMIT
// as the suite that caused it: tests/test_librarian_card.cjs, the gate on her
// ruling that the librarian's details leave the Manage dashboard for a
// floating card, and on the button chrome that makes the page's pressable
// parts legible. ⛔ Moved because a suite was added, never to make a red gate
// green — the suite it counts was RED 20 times at its own commit and is green
// at the one that moves this number.
//       MEASURED at the moment of this commit: `ls tests/*.cjs | wc -l` = 69.
// 69 -> 70, moved by the 26.99955 UAT fix work (2026-08-26) — ONE step, in
// the SAME COMMIT as the suite that caused it: tests/test_uat_fixes_26_99955
// .cjs, the gate on the three SURFACE rulings she gave after walking the
// phase in her own room (her way home leads the Manage header; the
// librarian's suggestions fold into a counted tile that says something when
// it is empty; the activity log never covers the pen cup that raised it, at
// any length of her log). ⛔ Moved because a suite was added, never to make a
// red gate green — that suite's three deliberate reverts each turn it red,
// and it is green at the commit that moves this number.
//       MEASURED at the moment of this commit: `ls tests/*.cjs | wc -l` = 70.
// 70 -> 71, moved by 26.9996-01 (2026-08-27) — ONE step, in the SAME COMMIT
// as the suite that caused it: tests/test_update_quiet_line.cjs (UPD-05),
// and twin-moved with EXPECTED_NODE_SUITES in test_stage_public.py. ⛔ Moved
// because a suite was added (Wave-0 Nyquist instrument), never to make a red
// gate green. MEASURED: `ls tests/*.cjs | wc -l` = 71.
const NODE_SUITES = 74;

/* The subpixel-layout allowance, pinned BY VALUE. Scene-px recovery is
   half-up (`Math.round`); this epsilon is the CSS-px slack allowed on the
   raw border-box width before rounding. */
const EPS = 0.5;


/* ---- 26.91-30 (F-26): THE DRAWN LEGAL REGION, MEASURED ON A LIVE PAGE ----

   WHAT A SOURCE ASSERTION CANNOT SEE HERE. `.page-deco-region` is positioned
   entirely by `calc(var(--N) * var(--k) * 1px)`, so whether the hairline lands
   where a mark actually stops is a question about COMPUTED GEOMETRY at a
   given `--k` and not about any string in any file. The retired inset
   hairline was a valid, well-formed CSS rule that drew in the wrong place for
   two phases; every grep over it passed.

   THE PLANT IS CARRIED ON ITS OWN PROBE, on the error row's precedent, so the
   arming is PART OF THE GATE rather than a note in a SUMMARY nobody re-runs:
   `region-plant` is a second `.page-deco-region` sized to the OLD CANVAS BOX
   — the 384 edge — and the delta between the two is asserted NON-ZERO and
   reported in screen px at every `--k`.

   THE EXPECTATION IS BUILT TWO WAYS ON PURPOSE. The scene-px values are
   LIFTED from app.js (so a region change moves the drawn node), and the four
   evaluated numbers are ALSO pinned BY VALUE below (so a region change does
   NOT move the expectation with it). A probe built entirely from the lifted
   source moves both sides together and can never redden — the
   `ERR_EXPECTED_SLOT` posture, which exists because M-R3 proved exactly that
   failure. */
function liveDeclOf(name) {
  const src = stripComments(appSrc);
  const at = src.search(new RegExp('\\n\\s*var ' + name + '\\s*='));
  if (at === -1) {
    throw new Error('G-27/live lift: no declaration for ' + name +
      ' in app.js.');
  }
  const from = src.indexOf('=', at) + 1;
  let d = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '[' || c === '(') { d++; }
    else if (c === '}' || c === ']' || c === ')') { d--; }
    else if (c === ';' && d === 0) {
      return 'var ' + name + ' =' + src.slice(from, i) + ';';
    }
  }
  throw new Error('G-27/live lift: unterminated declaration for ' + name);
}
const LIVE_REGION = (function () {
  // eslint-disable-next-line no-new-func
  return new Function(['NB_BOUNDS', 'NB_GUTTER_X', 'NB_MARK_BOUNDS',
    'NB_DECOR_X_MIN', 'NB_DECOR_X_MAX', 'NB_DECOR_Y_MIN', 'NB_DECOR_Y_MAX',
    'NB_MARK_REGION'].map(liveDeclOf).join('\n') +
    '\nreturn NB_MARK_REGION;')();
}());
/* THE FOUR VALUES, PINNED BY VALUE — the other side of the comparison, which
   must NOT come from the lift. */
const LIVE_REGION_PINNED = { x0: 192, x1: 379, y0: 4, y1: 189 };
/* the OLD canvas box, where the retired hairline was drawn. Pinned by value
   for the same reason: the plant must not follow the fix. */
const LIVE_OLD_BOX = { x: 192, y: 4, w: 192, h: 186 };

function regionHtml() {
  const R = LIVE_REGION;
  const w = R.x1 - R.x0 + 1;
  const h = R.y1 - R.y0 + 1;
  const B = LIVE_OLD_BOX;
  const box = function (x, y, ww, hh) {
    return '--x:' + x + ';--y:' + y + ';--w:' + ww + ';--h:' + hh;
  };
  return [
    '<div class="page-deco-region" data-reg="region-true" style="' +
      box(R.x0, R.y0, w, h) + '"></div>',
    /* THE PLANT — the 384 edge, deliberately sized to the OLD canvas box. */
    '<div class="page-deco-region" data-reg="region-plant" style="' +
      box(B.x, B.y, B.w, B.h) + '"></div>',
    /* THE LOCALISATION PROBE — correct box, WRONG inertness. An instrument
       that reddens everything at once has not localised anything. */
    '<div class="page-deco-region" data-reg="region-inert-broken" style="' +
      box(R.x0, R.y0, w, h) + ';pointer-events:auto"></div>',
    '<div class="page-deco-canvas" data-reg="canvas-live" style="' +
      box(B.x, B.y, B.w, B.h) + '"></div>',
    '<div class="page-deco-inkbox" data-reg="inkbox-live" style="' +
      box(250, 60, 72, 24) + '"></div>',
    '<button type="button" class="page-deco" data-reg="deco-live" style="' +
      box(250, 60, 72, 24) + ';--i:0"></button>'
  ].join('\n');
}

/* ---- 26.91-35 (F-28): THE DASHED BOX AGAINST THE MARK IT DESCRIBES -------

   HER REPORT, IN HER OWN WORDS: *"when I was moving this item on the image,
   the things from the boxes are not moving with it. I think this curve is
   definiately buggy because the edge is way bigger than the image itself"* —
   then, correcting the driver, *"only the thing I selected is too big, other
   things the grey line is correct"* and *"the organe line is way more smaller
   than the thin grey line"*.

   WHAT A SOURCE ASSERTION CANNOT SEE. `.page-deco` carries `rotate() scale()`
   about its centre; `.page-deco-inkbox` at HEAD carries `left/top/width/height`
   and NO transform at all, and `placeInkBox` fills those four in RAW RECORD
   UNITS. Whether the dashed line lands on the mark is therefore a question
   about COMPUTED GEOMETRY at a given `--k`, exactly as F-26's region was —
   and this phase already has the receipt that a grep cannot see that class of
   defect: on the state where the wave-1 live gate was red,
   `grep -c 'linear-gradient' tokens.css` printed 3, green, and printed 3
   under mutation too.

   THE CRITERION IS A RATIO ACROSS THREE MARKS, NOT ONE. A single-mark check
   of the form *the box got smaller* is satisfied by hard-coding the box to any
   fixed size. So the dashed-box-to-coral ratio is measured on three records
   that differ ONLY in `s`, in the same run, at every pinned `--k`: at HEAD
   they stand in `1 : 1/0.5 : 1/2` proportion, and after the fix they must be
   EQUAL. Their common value R is the span-versus-count residual — `F-23`'s
   seam — and is NOT closed here.

   ⚠ THE PLAN'S THIRD SCALE POINT WAS UNREACHABLE AND THE MEASUREMENT SAYS SO.
   26.91-35-PLAN names `s = 0.25` as "the scale floor, if reachable".
   `NB_S_MIN` is **0.5** (app.js:12167), so 0.25 is not reachable through
   `clampDecoScale` at all and 0.5 IS the floor — the same value the plan's
   second point already uses. The third distinct point is therefore the
   CEILING `NB_S_MAX` = 2.0, which is equally a bound and genuinely a third
   point on the line. Both bounds are LIFTED, never typed.

   THE ROTATED CASE'S EXPECTATION IS COMPUTED FROM THE RECORD, NEVER TYPED.
   Her flower is `s ≈ 0.675, a = 328`, and rotation NEARLY CANCELS the error
   on screen — which is why only one mark showed the defect, and why she was
   right and the driver was wrong when it predicted the flower would read
   wrong too. A typed constant would agree today and drift the first time the
   box definition moved.

   THE ROTATION ORIGIN IS THE MARK'S CENTRE, NOT THE INK BOX'S.
   `.page-deco-handles` may use `transform-origin: center` because its box IS
   the mark's box and the two centres coincide. The ink box is a SUB-box whose
   centre generally does NOT coincide with the mark's, so two of the five
   shapes below carry an ink extent with a non-zero minimum — `transform-origin:
   center` walks those off the mark under rotation, and nothing else here can
   see that.

   NOTHING IS RETYPED. `decoPointExtent`, `decoBox`, `strokeBox`, `strokeList`,
   `clampDecoScale`, `placeInkBox` and `previewDecoTransform` are all LIFTED
   from app.js and EVALUATED; the stylesheet is the shipped bytes, inlined by
   the harness. Every lift throws loudly when its subject is missing. */

/* the pure geometry helpers a stroke record needs, lifted and evaluated. The
   sticker / image / photo branches of `decoBox` short-circuit before their
   identifiers are ever referenced on a `kind === 'stroke'` record, which is
   why this lift needs no geometry table. */
const INK_FNS = (function () {
  const src = stripComments(appSrc);
  // eslint-disable-next-line no-new-func
  return new Function(
    extractFn(src, 'strokeList') + '\n' +
    extractFn(src, 'strokeBox') + '\n' +
    extractFn(src, 'decoBox') + '\n' +
    extractFn(src, 'decoPointExtent') + '\n' +
    extractFn(src, 'clampDecoScale') + '\n' +
    declOf('NB_S_MIN') + '\n' + declOf('NB_S_MAX') + '\n' +
    declOf('NB_S_DEFAULT') + '\n' +
    'return { decoBox: decoBox, decoPointExtent: decoPointExtent,' +
    ' clampDecoScale: clampDecoScale,' +
    ' NB_S_MIN: NB_S_MIN, NB_S_MAX: NB_S_MAX };')();
}());

/* THE SHIPPED EMITTER, lifted out of the drag closure and driven against a
   recording sink. This is what makes the gate a measurement of `placeInkBox`
   rather than of a copy of it: the same lift resolves at HEAD (four
   properties, no scale) and after the fix, so the RED run and the GREEN run
   are the same instrument pointed at two builds. The extra parameters are
   inert at HEAD — an unreferenced name costs nothing — and load-bearing
   after. */
const PLACE_INK_SRC = extractFn(
  extractFn(stripComments(appSrc), 'attachPageDrag'), 'placeInkBox');
function emitInkBox(rec, ox, oy, w, h, startS, startA) {
  const props = {};
  const sink = { style: { setProperty: function (n, v) { props[n] = v; } } };
  // eslint-disable-next-line no-new-func
  const f = new Function('inkbox', 'rec', 'w', 'h', 'startS', 'startA',
    'decoPointExtent', PLACE_INK_SRC + '\nreturn placeInkBox;')(
    sink, rec, w, h, startS, startA, INK_FNS.decoPointExtent);
  f(ox, oy);
  if (Object.keys(props).length === 0) {
    throw new Error('G-28/live lift: the shipped placeInkBox emitted NO ' +
      'custom properties. The lift resolved the wrong function, or the ' +
      'emitter stopped emitting — either way this gate must REFUSE rather ' +
      'than measure an empty style attribute.');
  }
  return props;
}

/* the coral wrapper, placed by `previewDecoTransform`'s OWN arithmetic — the
   idiom this fix copies. Self-contained over its parameters, so the lift is
   the whole function. */
const PREVIEW_INK = (function () {
  // eslint-disable-next-line no-new-func
  return new Function(extractFn(stripComments(appSrc), 'previewDecoTransform') +
    '\nreturn previewDecoTransform;')();
}());
function emitWrap(rec, w, h, a, s) {
  const props = {};
  const sink = { style: { setProperty: function (n, v) { props[n] = v; } } };
  PREVIEW_INK({ wrap: sink }, rec, w, h, a, s);
  if (Object.keys(props).length === 0) {
    throw new Error('G-28/live lift: previewDecoTransform emitted nothing ' +
      'for the wrapper.');
  }
  return props;
}

/* THE INK BOX'S SHIPPED DECLARATION, lifted from tokens.css by the existing
   `cssBlock` helper rather than retyped — a retyped rule measures the test's
   copy and not the stylesheet. `cssBlock` throws on a missing or empty
   block. */
const INKBOX_BLOCK = cssBlock('.page-deco-inkbox');

/* TWO STROKE SHAPES.
   FULL — its ink spans the whole box from the origin, so R is the pure
   span-versus-count residual and sits just above 1 (47/46 and 39/38).
   OFFSET — its ink starts at (10, 6), so the ink box is a genuine SUB-box
   whose centre is 5.5 / 3 record px away from the mark's. That gap is what
   `transform-origin: center` gets wrong, and it is invisible at a = 0. */
const INK_PTS_FULL = [[0, 0, 46, 0, 46, 38, 0, 38]];
const INK_PTS_OFFSET = [[10, 6, 46, 6, 46, 38, 10, 38]];

/* the five records. The three `full-*` shapes differ ONLY in `s` — that is
   what makes their ratios comparable at all. Both scale bounds are LIFTED. */
const INK_SHAPES = [
  { name: 'full-s1', pts: INK_PTS_FULL, s: 1, a: 0, x: 200, y: 8,
    scaleRow: true },
  { name: 'full-sfloor', pts: INK_PTS_FULL, s: INK_FNS.NB_S_MIN, a: 0,
    x: 200, y: 60, scaleRow: true },
  { name: 'full-sceil', pts: INK_PTS_FULL, s: INK_FNS.NB_S_MAX, a: 0,
    x: 200, y: 112, scaleRow: true },
  /* her flower's own shape: scaled AND rotated, where the two errors nearly
     cancel on screen. */
  { name: 'off-flower', pts: INK_PTS_OFFSET, s: 0.675, a: 328, x: 200,
    y: 164, scaleRow: false },
  /* a quarter turn on the offset ink — exact trig, and the sharpest reading
     of a wrong rotation origin. */
  { name: 'off-turn', pts: INK_PTS_OFFSET, s: 1, a: 90, x: 200, y: 216,
    scaleRow: false },
  /* ⚠ ADDED AFTER MUTATION M-2 LANDED ON THE WRONG ASSERTION, and that is
     recorded here rather than quietly fixed. M-2 drops the scale from the
     emitted ORIGIN, whose error is `ie.x0 * (1 - s)`. Every shape above with
     `a === 0` is a `full-*` row whose ink starts at (0, 0), so that error is
     IDENTICALLY ZERO on all three and `origin-follows-the-scale` was
     asserting `0 === 0` — a vacuous row inside the instrument built to catch
     a vacuous row, which is this phase's recurring defect class landing for
     about the twenty-sixth time. The two shapes that DO carry an offset ink
     were both rotated, and the origin assertion is scoped to `a === 0`.
     This row is offset ink, UNROTATED, at the scale FLOOR: M-2 moves it by
     `10 * (1 - 0.5) = 5` record px, and it is red on its intended assertion.
     `scaleRow: false` because its geometry differs from the `full-*` set, so
     it must not join a cross-scale equality it cannot satisfy. */
  { name: 'off-shrunk', pts: INK_PTS_OFFSET, s: INK_FNS.NB_S_MIN, a: 0,
    x: 200, y: 268, scaleRow: false }
];
const INK_NODE_COUNT = INK_SHAPES.length * 3;

/* every shape's geometry, derived ONCE from the lifted functions and reused
   by both the HTML builder and the assertions. */
const INK_GEOM = INK_SHAPES.map(function (sh) {
  const rec = { kind: 'stroke', x: sh.x, y: sh.y, s: sh.s, a: sh.a,
    pts: sh.pts };
  const box = INK_FNS.decoBox(rec);
  const ie = INK_FNS.decoPointExtent(rec);
  const s = INK_FNS.clampDecoScale(sh.s);
  return { sh: sh, rec: rec, w: box.w, h: box.h, ie: ie, s: s, a: sh.a,
    iw: ie.x1 - ie.x0 + 1, ih: ie.y1 - ie.y0 + 1,
    ink: emitInkBox(rec, sh.x, sh.y, box.w, box.h, s, sh.a),
    wrap: emitWrap(rec, box.w, box.h, sh.a, s) };
});

function inkStyle(props) {
  return Object.keys(props).map(function (n) {
    return n + ':' + props[n];
  }).join(';');
}

function inkHtml() {
  return INK_GEOM.map(function (g) {
    const n = g.sh.name;
    return [
      /* the MARK, placed exactly as the shipped painter places it: raw record
         origin and unscaled box, with the transform on the element. */
      '<button type="button" class="page-deco" data-ink="' + n + '-deco" ' +
        'style="--x:' + g.rec.x + ';--y:' + g.rec.y + ';--w:' + g.w +
        ';--h:' + g.h + ';--a:' + g.a + ';--s:' + g.s + ';--i:0"></button>',
      /* the CORAL WRAPPER, placed by previewDecoTransform's own emission. */
      '<div class="page-deco-handles" data-ink="' + n + '-wrap" style="' +
        inkStyle(g.wrap) + '"></div>',
      /* the DASHED BOX, placed by the shipped placeInkBox's own emission. */
      '<div class="page-deco-inkbox" data-ink="' + n + '-ink" ' +
        'aria-hidden="true" style="' + inkStyle(g.ink) + '"></div>'
    ].join('\n');
  }).join('\n');
}

/* ONE page-side pass. Raw rects only — every interpretation happens in the
   assertions, never in the probe. `getBoundingClientRect` on a transformed
   element returns the AXIS-ALIGNED bounding box of the transformed border
   box, which is exactly the quantity the rotated expectations below compute.
   `outline` does not participate in layout, so the dashed line drawn to
   describe the box never changes the box. */
const MEASURE_INK_EXPR = `(async function () {
  await document.fonts.ready;
  var out = { nodes: {}, count: 0 };
  document.body.classList.add('nb-design');
  var all = document.querySelectorAll('[data-ink]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    var b = n.getBoundingClientRect();
    out.nodes[n.getAttribute('data-ink')] = {
      left: b.left, top: b.top, right: b.right, bottom: b.bottom,
      width: b.width, height: b.height,
      transform: cs.transform, transformOrigin: cs.transformOrigin,
      outlineStyle: cs.outlineStyle, pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex
    };
  }
  document.body.classList.remove('nb-design');
  return out;
})()`;

/* ONE page-side pass, run TWICE — once with `nb-design` on the body and once
   with it off — and EVERY handle is RE-QUERIED after the class change.
   Elements detach across a repaint and a stale handle makes getComputedStyle
   return "", which reads exactly like a passing measurement. */
const MEASURE_REGION_EXPR = `(async function () {
  await document.fonts.ready;
  function read() {
    var out = { nodes: {}, count: 0 };
    var all = document.querySelectorAll('[data-reg]');
    out.count = all.length;
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var cs = getComputedStyle(n);
      var b = n.getBoundingClientRect();
      out.nodes[n.getAttribute('data-reg')] = {
        left: b.left, top: b.top, right: b.right, bottom: b.bottom,
        width: b.width, height: b.height,
        pointerEvents: cs.pointerEvents, zIndex: cs.zIndex,
        outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow,
        ariaHidden: n.getAttribute('aria-hidden'),
        tabIndex: n.getAttribute('tabindex')
      };
    }
    return out;
  }
  document.body.classList.add('nb-design');
  var arranging = read();
  document.body.classList.remove('nb-design');
  var reading = read();
  document.body.classList.remove('nb-design');
  return { arranging: arranging, reading: reading };
})()`;

/* ---- (G-29/live) 26.91-36 (F-24 / D-11): THE GREYED TIN, ON THE GLASS ----

   WHY THIS GROUP EXISTS AND WHY THE NODE SUITE CANNOT REPLACE IT. A source
   assertion cannot see a cascade. `tests/test_blessings_notebook.cjs` proves
   the SHIPPED PAINTER puts `station-nb-off` on the tin and sets the native
   attribute — over a synthetic document with no layout engine and no style
   engine at all. A class that no rule matches, a rule outranked by a later
   selector, or a `pointer-events` that some other declaration wins back
   satisfies every one of those assertions while the tin still takes presses.
   This phase's own receipt: at 26.91-01 a grep printed the same green number
   on a build where the tin rendered as an empty box.

   BOTH HALVES, MEASURED TOGETHER, BECAUSE NEITHER IS SUFFICIENT AND THAT WAS
   MEASURED RATHER THAN ARGUED. On this very harness, at HEAD:
     - `.station-tin` alone            -> opacity 1,    pointer-events auto,
                                          disabled null
     - `.station-tin.station-nb-off`   -> opacity 0.45, pointer-events none,
                                          disabled null  (KEYBOARD ROUTE OPEN)
     - `.station-tin[disabled]` alone  -> opacity 1,    pointer-events auto,
                                          disabled ""    (PAINTS NOTHING)
   `.station-tin` is not a `.btn`, so it has no `:disabled` rule of its own.
   Her word was UNPRESSABLE, so both routes close and both are read here.

   THE PROBE IS NOT HAND-TYPED. Its base class, its disabled token, its word
   and WHETHER IT CARRIES THE NATIVE ATTRIBUTE are all lifted out of
   `renderTinTray`. The last of those is the load-bearing one: a build that
   dropped `tin.disabled = tinOff` produces an armed probe with NO attribute,
   so `armed-differs-on-all-three` goes red rather than measuring a probe that
   is truer than the code.

   THE GUARD RUNS FIRST. Both nodes must resolve AND carry the shipped word
   before any style is read, so a missing node fails on presence rather than
   reading as a passing measurement.

   ASK THE ANTI-VACUITY QUESTIONS OF IT (26.91-VALIDATION.md):
     1. Can it pass before the work? NO — at HEAD `renderTinTray` neither
        applies the class nor sets the attribute, so `TIN29_NATIVE` lifts
        false, the armed probe carries no attribute, and both
        `native-attribute-is-set-by-the-painter` and
        `armed-differs-on-all-three` are red.
     2. Can it pass after the work is deliberately broken? NO — the mutations
        that drop the class, drop the native line, invert the condition or
        read only one armed flag each redden a named assertion here or in
        `G-29` (recorded by name in 26.91-36-SUMMARY.md).
     3. Does a degenerate implementation satisfy it? NO — the node count is
        pinned BY VALUE and the presence/word/non-zero-box guard runs BEFORE
        any style is read, so a blank page fails on the count and a collapsed
        node fails on the box rather than reading as greyed. A tin greyed
        UNCONDITIONALLY fails `unarmed-reads-available`.
     4. Evaluation order or source order? EVALUATION — every opacity,
        pointer-events and disabled reading comes off a live page in real
        Chrome. The only source read is the LIFT that builds the probe, and it
        exists so the probe cannot be truer than the code.
     5. Does it match the fix's own comment? The comment CLAIMS both halves
        are needed; this group does not read that claim, it measures the three
        properties in both states and requires them to differ on all three. */
const TIN29_BASE = pick(TIN_SRC, /tin\.className = '([a-z-]+)'/,
  "the tin's base class");
const TIN29_OFF = pick(TIN_SRC, /\(tinOff \? ' ([a-z-]+)' : ''\)/,
  "the tin's disabled class token");
const TIN29_WORD = pick(TIN_SRC, /tin\.textContent = '([a-z]+)'/,
  "the tin's visible word");
/* LIFTED, NOT ASSUMED: the probe carries the native attribute only if the
   painter sets it. Comment-stripped, so prose cannot answer for code. */
const TIN29_NATIVE = /tin\.disabled = tinOff;/.test(stripComments(TIN_SRC));

function tin29Html() {
  return '<button type="button" class="' + TIN29_BASE + ' ' + TIN29_OFF +
    '" data-tin29="armed"' + (TIN29_NATIVE ? ' disabled' : '') +
    ' style="--x:208;--y:196;--w:32;--h:16">' + TIN29_WORD + '</button>\n' +
    '<button type="button" class="' + TIN29_BASE + '" data-tin29="unarmed"' +
    ' style="--x:248;--y:196;--w:32;--h:16">' + TIN29_WORD + '</button>';
}

const TIN29_COUNT = 2; // armed + unarmed, pinned BY VALUE

const MEASURE_TIN29_EXPR = `(async function () {
  await document.fonts.ready;
  var out = { count: 0, nodes: {} };
  var all = document.querySelectorAll('[data-tin29]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    out.nodes[n.getAttribute('data-tin29')] = {
      text: n.textContent,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      disabledAttr: n.getAttribute('disabled'),
      disabledProp: n.disabled,
      /* the box, so a probe collapsed to nothing cannot read as greyed */
      width: n.getBoundingClientRect().width,
      height: n.getBoundingClientRect().height
    };
  }
  return out;
})()`;

function bodyHtml() {
  return PROBES.map(function (p) {
    return '<' + p.tag + ' class="' + p.cls + '" data-probe="' + p.name + '"' +
      (p.focusable ? ' data-focus="' + p.name + '"' : '') +
      ' style="--x:' + p.x + ';--y:' + p.y + ';--w:' + p.w + ';--h:' + p.h +
      '"></' + p.tag + '>';
  }).join('\n') + '\n' + bandHtml() + '\n' + traceHtml() + '\n' + calHtml() +
    '\n' + chromeHtml() + '\n' + w1Html() + '\n' + flipHtml() +
    '\n' + armedHtml() + '\n' + errHtml() +
    '\n' + regionHtml() + '\n' + inkHtml() + '\n' + tin29Html();
}

/* ---- 26.91-27 (F-23 b): THE ERROR ROW'S FIT, AND THE AXIS G-C5's FORM
   IS BLIND TO ------------------------------------------------------------

   THE TRAP THIS BLOCK WALKED INTO BEFORE IT CLEARED IT, recorded because
   `overflow | E4` names it BY NAME and the first draft did it anyway:
   G-C5's form measures a `Range`'s WIDTH, which is right for the band's
   labels because every one of them is a single unwrappable word. A refusal
   reason is a SENTENCE WITH SPACES. On this centred flex row it therefore
   WRAPS, and once it wraps the Range's bounding rect reports the widest
   LINE — so the width saturates and a width-only assertion CAN NEVER GO RED
   no matter how long the reason gets. MEASURED at k=1 before the slot moved:
   60, 65, 70 and 72 characters all reported exactly 170.44 px, while the box
   HEIGHT went 8.00 -> 14.00 against a 10 px content box. The overflow was
   real, vertical, and structurally invisible to the borrowed form.

   SO THIS BLOCK MEASURES BOTH AXES, and the height is the one that binds.

   THE STRINGS ARE THE SERVER'S OWN, LIFTED AND EVALUATED FROM
   `validate_decorations` rather than re-typed here — a harness that typed
   the sentences it then measured would be agreeing with itself. The two
   refusals that interpolate POSTED KEY NAMES are excluded from the "renders
   whole" claim by construction: they are unbounded, which is why the painter
   caps at all. What is asserted about them is the cap. */
const SERVER_PY = fs.readFileSync(path.join(REPO_ROOT, 'server.py'), 'utf8');

/* A deliberately small f-string evaluator, scoped to ONE function's return
   statements. It resolves `{NAME}` and `{', '.join(NAME)}` against constants
   parsed out of server.py, and it FAILS LOUDLY on anything else — a silent
   pass-through would leave a brace in a string this gate then measured. */
function serverRefusals() {
  const from = SERVER_PY.indexOf('def validate_decorations(');
  if (from === -1) {
    throw new Error('G-C5 lift: validate_decorations is not in server.py.');
  }
  const region = SERVER_PY.slice(from,
    SERVER_PY.indexOf('\n    return None', from));
  /* `unknown` and `extra` are the two RUNTIME placeholders — the names taken
     from the request body. They resolve to EMPTY here on purpose: that gives
     each of those two refusals its FIXED SHELL, which is the only part of
     them that has a length at all. The interpolation itself is unbounded,
     which is why the painter caps and why these two are excluded from the
     "renders whole" claim by name. */
  const consts = { unknown: '', extra: '' };
  let m;
  /* ⚠ `^` WITH THE m FLAG AND A LOOKAHEAD TERMINATOR, not a leading and a
     trailing \n. MEASURED: the first form consumed the newline SHARED by two
     adjacent declarations, so DECOR_KEYS — which follows DECOR_SPRITES' close
     immediately — was silently dropped and its refusal came out carrying a
     raw brace. Found by driving the evaluator's own loud failure, which is
     the only reason it was not a silently short register. */
  const NUM = /^(DECOR_[A-Z_]+)(?:, (DECOR_[A-Z_]+))? = ([0-9.]+)(?:, ([0-9.]+))?/gm;
  while ((m = NUM.exec(SERVER_PY)) !== null) {
    consts[m[1]] = m[3];
    if (m[2]) { consts[m[2]] = m[4]; }
  }
  const TUP = /^(DECOR_[A-Z_]+) = \(([\s\S]*?)\)(?=\n)/gm;
  while ((m = TUP.exec(SERVER_PY)) !== null) {
    consts[m[1]] = (m[2].match(/"([^"]+)"/g) || [])
      .map(function (q) { return q.slice(1, -1); }).join(', ');
  }
  /* every `return (...)` / `return "..."`, with its adjacent literal chunks
     concatenated exactly as Python concatenates them. */
  const out = [];
  const RET = /return \(?((?:\s*f?"[^"]*"\s*)+)\)?/g;
  while ((m = RET.exec(region)) !== null) {
    const joined = (m[1].match(/"[^"]*"/g) || [])
      .map(function (q) { return q.slice(1, -1); }).join('');
    const filled = joined.replace(/\{([^}]*)\}/g, function (whole, expr) {
      const j = /^', '\.join\(([A-Za-z_][A-Za-z0-9_]*)\)$/.exec(expr.trim());
      const name = j ? j[1] : expr.trim();
      if (!Object.prototype.hasOwnProperty.call(consts, name)) {
        throw new Error('G-C5 lift: unresolved placeholder ' + whole +
          ' in a refusal string — the evaluator must not pass a brace ' +
          'through into a string this gate measures.');
      }
      return consts[name];
    });
    if (filled && out.indexOf(filled) === -1) { out.push(filled); }
  }
  return out;
}
const REFUSALS = serverRefusals();
/* the two that echo names from the request body — excluded from the
   "renders whole" claim BY NAME, never by a length heuristic. */
const UNBOUNDED_PREFIX = 'unknown decoration ';
const BOUNDED_REFUSALS = REFUSALS.filter(function (s) {
  return s.indexOf(UNBOUNDED_PREFIX) !== 0;
});
/* 26.91-31 (F-27/A-24): 33 -> 30 and 31 -> 28, MEASURED after the change and
   moved in the SAME COMMIT as the strings. Her one sentence replaces all four
   page-bounds returns, and the lift DEDUPES, so four distinct entries collapse
   to one. Both were watched RED at 30-vs-33 and 28-vs-31 before they moved. */
const REFUSAL_COUNT = 30;          // pinned BY VALUE — a shrunken register
const BOUNDED_COUNT = 28;          // must fail here, not pass over a subset
/* the cap and the slot, LIFTED from app.js. The slot is ALSO pinned by value
   below — the EXPECTED_W posture, and for the same measured reason: a probe
   built from the lifted slot moves both sides together and can never redden
   on a slot change. */
const ERR_CAP = (function () {
  const c = /\n\s*var NB_SAVE_REASON_CAP = (\d+);/.exec(appSrc);
  if (!c) { throw new Error('G-C5 lift: NB_SAVE_REASON_CAP is not in app.js.'); }
  return Number(c[1]);
})();
const ERR_SLOT = SRC.NB_BAND.error;
const ERR_EXPECTED_SLOT = { x: 64, y: 184, w: 316, h: 12 };
const ERR_HOUSE_LINE = pick(BAND_SRC,
  /var says = NB_SAVE_REASON \|\| "([^"]+)"/, 'the house save-failure line');
const ERR_CLS = pick(BAND_SRC,
  /err\.className = '([^']+)'/, "the error row's class list");
/* THE PLANT. A reason the slot cannot hold, carried on its own probe so the
   arming is PART OF THE GATE rather than a note in a SUMMARY nobody re-runs.
   It is a sentence WITH SPACES on purpose: that is the shape that wraps, and
   wrapping is the failure a width-only form cannot see. */
const ERR_PLANT = new Array(19).join('overflow ') + 'overflow.';
/* 26.91-31: THE SECOND PLANT, and it is not a spare. It exists to carry the
   SATURATION demonstration inside the gate rather than in a SUMMARY nobody
   re-runs: it is DOUBLE the first plant's length, so if the width form could
   see length at all, its width would grow. It does not — a wrapped Range
   reports the widest LINE, which is bounded by the container. The pair is
   asserted below as "twice the text, more height, no more width". */
const ERR_PLANT2 = ERR_PLANT + ' ' + ERR_PLANT;
const ERR_PROBES = [
  { name: 'err-house', text: ERR_HOUSE_LINE },
  { name: 'err-longest', text: BOUNDED_REFUSALS.slice().sort(function (a, b) {
    return b.length - a.length; })[0] },
  /* 26.91-31 (F-27/A-24): RE-KEYED AND RENAMED IN THE SAME COMMIT AS THE
     STRING. The old key was `/^a stroke's points must sit on the page/` under
     the name `err-f23`; her sentence no longer distinguishes strokes from
     origins — one sentence answers all four page-bounds refusals — so the old
     selector resolves to `undefined` (watched RED at all five --k) and the old
     NAME points at a closed finding while selecting a sentence that no longer
     says what it said. Selected BY EXACT VALUE, not by a prefix: there is no
     longer any family to select the head of. */
  { name: 'err-f27', text: BOUNDED_REFUSALS.filter(function (s) {
    return s === 'move that mark inside the page outline.'; })[0] },
  { name: 'err-plant', text: ERR_PLANT },
  { name: 'err-plant2', text: ERR_PLANT2 }
].concat(BOUNDED_REFUSALS.map(function (s, i) {
  return { name: 'err-b' + i, text: s };
}));
function errHtml() {
  return ERR_PROBES.map(function (p) {
    return '<button type="button" class="' + ERR_CLS + '" data-err="' +
      p.name + '" style="--x:' + ERR_SLOT.x + ';--y:' + ERR_SLOT.y +
      ';--w:' + ERR_SLOT.w + ';--h:' + ERR_SLOT.h + '">' +
      String(p.text).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
      '</button>';
  }).join('\n');
}

/* ONE page-side pass. BOTH axes, both bounds read LIVE per node — never
   derived from the token and never copied from the UI-SPEC, for the two
   reasons G-C5's own header gives. */
const MEASURE_ERR_EXPR = `(async function () {
  await document.fonts.ready;
  var out = { nodes: {}, count: 0 };
  var all = document.querySelectorAll('[data-err]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    var r = document.createRange();
    r.selectNodeContents(n);
    var box = r.getBoundingClientRect();
    var padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    var padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom);
    out.nodes[n.getAttribute('data-err')] = {
      text: n.textContent, len: n.textContent.length,
      boxWidth: box.width, boxHeight: box.height,
      clientWidth: n.clientWidth, clientHeight: n.clientHeight,
      widthBound: n.clientWidth - padL - padR,
      heightBound: n.clientHeight - padT - padB,
      scrollWidth: n.scrollWidth, display: cs.display,
      whiteSpace: cs.whiteSpace, boxSizing: cs.boxSizing
    };
  }
  return out;
})()`;

/* The trace probes ride the SAME page as everything else, so measuring at all
   five `--k` costs no additional browser launches. They carry `data-trace`
   and never `data-probe`/`data-band`, so the by-value counts those groups pin
   are untouched.

   The class list is the SHIPPED one, read off paintTracePage rather than
   re-typed: `caption-hand station-caption`. That is what makes this a
   measurement of the shipped stylesheet and not of a class the test invented.

   ⚠ 26.91-10 (F-3) — ONE LINE CHANGED HERE, AND THE REASON IS THAT PLAN
   26.91-10's OWN CLAIM ABOUT THIS BLOCK WAS FALSE.

   That plan required this block to be left BYTE-UNCHANGED, on the stated
   ground that it "does not depend on the app rendering that line".
   MEASURED: it did. The anchor below read `line.className` out of
   paintTracePage, and F-3 removes exactly that node — so the lift threw
   `G-C5 lift: could not read the trace line's class list from app.js` and
   took the whole live-render suite down. Correcting the claim at source
   beats repeating it.

   WHAT CHANGED: the anchor only. It now reads the DAY node's class list,
   which paintTracePage still writes. WHAT DID NOT CHANGE: the string, and
   therefore every number this block measures. Both nodes were written with
   the SAME class list — `caption-hand station-caption` — so the probe wears
   byte-identical classes to the ones it wore before, against the same
   TRACE_SLOT, at the same five `--k`.

   WHAT THIS BLOCK NOW MEASURES, STATED PLAINLY SO IT IS NOT MISREAD: the
   RETAINED composer's worst-case line against the RETAINED slot, for Phase
   26.95. It is not measuring a live surface — no composed sentence renders
   anywhere after F-3 — and it is the instrument 26.95 inherits. */
const TRACE_CLS = pick(extractFn(appSrc, 'paintTracePage'),
  /day\.className = '([^']+)'/, "the trace page's class list");

function traceHtml() {
  return TRACES.map(function (t) {
    return '<div class="' + TRACE_CLS + '" data-trace="' + t.name +
      '" style="--x:' + TRACE_SLOT.x + ';--y:' + TRACE_SLOT.y +
      ';--w:' + TRACE_SLOT.w + ';--h:' + TRACE_SLOT.h + '">' + t.text +
      '</div>';
  }).join('\n');
}

/* The band nodes ride the SAME page as the (91a)/(91b) probes, so measuring
   the label fit at all five `--k` costs no additional browser launches. They
   carry `data-band` and never `data-probe`/`data-focus`, so the by-value
   counts those two groups pin are untouched. */
function bandHtml() {
  return BAND.map(function (c) {
    const s = c.slot;
    const open = '<' + c.tag + ' class="' + c.cls + '" data-band="' +
      c.name + '" style="--x:' + s.x + ';--y:' + s.y + ';--w:' + s.w +
      ';--h:' + s.h + '">';
    const body = c.innerCls
      ? '<button type="button" class="' + c.innerCls + '">' + c.label +
        '</button>'
      : c.label;
    return open + body + '</' + c.tag + '>';
  }).join('\n');
}

/* ---- (G-17-live) 26.91-17 (F-15) — THE TWO DOORS, MEASURED LIVE ---------

   WHY THIS GROUP EXISTS, AND WHAT IT DOES *NOT* CLAIM. Her ruling of
   2026-08-09 changes WHEN the two page-turn doors render; it changes nothing
   about WHERE they render or what they look like. That is easy to assert and
   worthless to assert in source, because the node-level suite builds its
   nodes from the same table it then checks. So the claim is measured on the
   glass: at every pinned `--k`, each door resolves to a NON-ZERO box at its
   own declared slot, in the shipped `.station-flip` face.

   THIS IS THE ONE THING THE NODE SUITE CANNOT SEE. `test_blessings_notebook`
   proves the doors are PAINTED at the right indices and ABSENT at a day
   boundary — over a synthetic document with no layout engine. A door painted
   at zero size, collapsed by a rule that stopped consuming `--w`, or pushed
   off-scene satisfies every one of those assertions while being invisible.
   Working and findable are different claims, and this phase keeps relearning
   it.

   WHAT IT CANNOT PROVE, STATED: that the door's ABSENCE at a day's last page
   reads to her as *this is the last page of this day*. No automated proxy
   exists for that; it is a seal-UAT beat, and the backward door in
   particular is a behaviour she has not yet seen.

   The doors ride the SAME page as every other group and carry `data-flip`
   and NEVER `data-probe` / `data-band` / `data-trace` / `data-cal`, so every
   by-value count those groups pin is untouched.

   Both classes and both glyphs are LIFTED off paintNotebookSpread by `pick`,
   which throws rather than yielding undefined: a harness that retyped the
   class it then asserts would be agreeing with itself. */
const FLIP_CLS = pick(SPREAD_SRC, /prev\.className = '([^']+)'/,
  "the backward door's class list");
const FLIP_CLS_NEXT = pick(SPREAD_SRC, /next\.className = '([^']+)'/,
  "the forward door's class list");
const FLIP_GLYPH = {
  prev: pick(SPREAD_SRC, /prev\.textContent = '([^']+)'/, "the backward glyph"),
  next: pick(SPREAD_SRC, /next\.textContent = '([^']+)'/, "the forward glyph")
};
/* THE DAY-SCOPED PREDICATE, RE-MEASURED ON EVERY RUN rather than quoted.
   Each door's guard must compare the NEIGHBOUR's day to the OPEN spread's
   day. A source read is the right instrument for this one specific claim
   because it is a claim about the CONDITION, which no rendered box can
   show — and it is stated as a source read rather than smuggled in beside
   the measurements. */
const FLIP_SCOPED = {
  back: /if \(v > 0 && spreads\[v - 1\]\.day === spread\.day\)/.test(SPREAD_SRC),
  fwd: /if \(v \+ 1 < spreads\.length && spreads\[v \+ 1\]\.day === spread\.day\)/
    .test(SPREAD_SRC)
};
const FLIP = [
  { name: 'prev', cls: FLIP_CLS, slot: SRC.STATION_NOTEBOOK_GEOM.prev,
    glyph: FLIP_GLYPH.prev },
  { name: 'next', cls: FLIP_CLS_NEXT, slot: SRC.STATION_NOTEBOOK_GEOM.next,
    glyph: FLIP_GLYPH.next }
];
function flipHtml() {
  return FLIP.map(function (c) {
    const s = c.slot;
    return '<button type="button" class="' + c.cls + '" data-flip="' +
      c.name + '" style="--x:' + s.x + ';--y:' + s.y + ';--w:' + s.w +
      ';--h:' + s.h + '">' + c.glyph + '</button>';
  }).join('\n');
}
/* ---- (G-18-live) 26.91-18 (F-17) — THE ARMED TOOL, MEASURED AT HER HAND --

   WHY THIS GROUP EXISTS. Her ruling: *"when pen is armed it is hard to notice
   i am starting to use pen, so i think we need to change the cursor when the
   pen is armed."* A cursor is a COMPUTED STYLE that only exists on the glass,
   so no source grep and no synthetic document can speak to it at all.

   IT IS MEASURED AS A DIFFERENCE, NEVER AS A VALUE. A rule that set the same
   cursor armed and disarmed would satisfy a one-sided assertion completely.
   So every node below is read TWICE — once disarmed, once armed — and both
   values are asserted, plus their inequality.

   AND IT IS MEASURED AT TWO NODES, WHICH IS THE WHOLE POINT OF THE GROUP.
   `.page-deco-canvas` is the bare page surface; `.page-deco` is a placed
   mark. Measured in tokens.css: a mark sits at `z-index: calc(3 + var(--i))`
   and declares its OWN `cursor: pointer`, while the canvas is at `z-index: 2`
   — so the mark is stacked ABOVE the canvas and overrides it, and `cursor`
   inheritance cannot rescue a canvas-only rule because a direct declaration
   always beats an inherited value. F-17 IS BY DEFINITION THE POINTER OVER A
   MARK: the shipped guard's own words are that a stroke begun over a mark
   draws instead of moving it, and her ruling came from trying to drag a
   stamp. A gate that stopped at the canvas would go green on a fix that never
   reaches the gesture she complained about.

   THE ARMED STATE IS DRIVEN THROUGH THE SHIPPED SETTERS, not by planting the
   class this file happens to know the name of. `setNotebookPen` and
   `setNotebookWrite` are lifted from app.js and executed in the page, so a
   setter that stopped setting the hook reddens here — which a planted class
   could never see.

   TWO NEGATIVES FIX THE SUBJECT IN PLACE, POINTING IN OPPOSITE DIRECTIONS:
   the band CHIP's cursor must be the SAME armed and disarmed (so the gate can
   never be satisfied at the surface her ruling excludes), and a GRIP's cursor
   must be the SAME armed and disarmed (so the armed cursor cannot bleed onto
   a control whose gesture is not the armed tool's — promising drawing where a
   resize or a delete happens is the INVERSION of F-17, not its fix).

   WHAT THIS GROUP DOES NOT PROVE, stated so it is not over-read:
     1. It does NOT prove the cursor READS to her as *the pen is live*. That
        is her eye, and it is a seal-UAT beat.
     2. It measures the shipped stylesheet against the shipped markup SHAPE
        re-emitted from lifted class names — this suite's established idiom —
        not the painter's own output. The node suite owns the painter.
     3. It cannot see a cursor overridden by something outside this scene.

   These nodes carry `data-arm` and NEVER `data-probe` / `data-band` /
   `data-trace` / `data-cal` / `data-flip`, so every by-value count those
   groups pin is untouched.

   ---- REWRITTEN 26.91-22 (F-20 + A-15 ruling 2) --------------------------

   THIS GROUP IS THE GATE THAT ACTUALLY BLOCKED THE TWO-CURSOR WORK, and the
   round's own brief named a different one. Plan 22's brief pointed at the
   `9o` armed-tool group in test_blessings_notebook.cjs; measurement found
   that that group's assertion is about the band CHIP and stays green through
   this change, while TWO assertions HERE went red the moment the cursors
   differed. A plan that had reworded only `9o` would have shipped a red
   suite. Recorded so the next reader does not re-derive it.

   KEPT VERBATIM, because they are all still true and widening a gate to
   admit a new claim is where guards die: `node-count` pinned by value;
   `rest-clean`; `no-stale-state`; `{node}/pen-diff` and `{node}/write-diff`
   at both nodes; `{node}/restored`; `chip-unchanged`; `grip-unchanged`;
   `measured-count`. WAVE 18'S THREE NEGATIVES ARE NOT TRADED AWAY FOR THE
   NEW CLAIM.

   CHANGED, and only these:
     - `{node}/equal` -> `{node}/distinct`. The retired claim's antecedent
       was false in the shipped app; its message records why.
     - `one-state` -> THREE parts: `shared-state` (the surviving idiom and
       the fallback), `own-state` (the instances), `state-differs` (her
       ruling). The token names are LIFTED out of nbSyncArmedClass's source,
       never hand-typed.
     - `one-rule` EXTENDED to `write` as well as the pen.

   A NOTE ON THE RUNNER, BY CONCEPT RATHER THAN BY ITS USUAL NAME, because
   this file's count of the two stand-down words is pinned at 0 by wave 17
   and this plan edits the file: when no browser can be launched, this suite
   FAILS with a named reason. It does not stand down quietly and report
   success. That property is shipped and is re-confirmed here, not
   re-invented. */
const ARM_MARK_CLS = pick(appSrc, /'(page-deco page-deco-text[^']*)'/,
  "a placed mark's class list");
const ARM_GRIP_CLS = pick(appSrc, /kill\.className = '([^']+)'/,
  "a mark's grip class list");
const ARM_CANVAS_CLS = pick(appSrc, /canvas\.className = '([^']+)'/,
  "the placement canvas's class list");
const ARM_ON_CLS = pick(appSrc, /NB_PEN \? ' ([a-z-]+)' : ''/,
  "the band chip's armed hook");
/* the two shipped setters and the hook they drive, lifted as REAL SOURCE */
const ARM_SETTER_SRC = ['nbSyncArmedClass', 'setNotebookPen',
  'setNotebookWrite'].map(function (n) { return extractFn(appSrc, n); })
  .join('\n');
/* 26.91-22: THE THREE BODY TOKENS, LIFTED OUT OF nbSyncArmedClass BY THE
   FLAG EACH IS DERIVED FROM — never hand-typed. This suite's established
   idiom, and the only form that catches a hook renamed in app.js: a
   hand-typed name agrees with itself forever. The shared token is keyed to
   the DISJUNCTION and the two per-tool tokens each to their own flag, so a
   per-tool hook accidentally derived from the disjunction fails to lift
   here rather than putting both cursors on the body at once. */
const ARM_SHARED_CLS = pick(ARM_SETTER_SRC,
  /toggle\('([a-z-]+)', !!\(NB_PEN \|\| NB_WRITE\)\)/,
  'the SHARED armed body token, derived from both flags');
const ARM_PEN_CLS = pick(ARM_SETTER_SRC, /toggle\('([a-z-]+)', !!NB_PEN\)/,
  "the PEN's own armed body token");
const ARM_WRITE_CLS = pick(ARM_SETTER_SRC, /toggle\('([a-z-]+)', !!NB_WRITE\)/,
  "`write`'s own armed body token");

function armedHtml() {
  return '<div class="' + ARM_CANVAS_CLS + '" data-arm="canvas" ' +
    'style="--x:192;--y:4;--w:192;--h:186"></div>\n' +
    '<button type="button" class="' + ARM_MARK_CLS + '" data-arm="mark" ' +
    'style="--x:200;--y:100;--w:72;--h:24;--i:0"></button>\n' +
    '<button type="button" class="station-caption-add station-nb-row ' +
    'station-nb-pen ' + ARM_ON_CLS + '" data-arm="chip" ' +
    'style="--x:0;--y:0;--w:24;--h:16">pen</button>\n' +
    '<button type="button" class="' + ARM_GRIP_CLS + '" data-arm="grip" ' +
    'style="--x:0;--y:0"></button>';
}

const ARM_NODE_COUNT = 4; // canvas + mark + chip + grip, pinned BY VALUE

const MEASURE_ARMED_EXPR = `(async function () {
  await document.fonts.ready;
  /* the shipped setters, running in the page over their real free variables.
     26.91-36: NB_TIN_OPEN joins them because nbSyncArmedClass now READS it —
     arming a tool puts the marks tray away — and a read of an undeclared
     identifier THROWS. Found by driving: this suite died with
     "NB_TIN_OPEN is not defined" the moment that line shipped. */
  var NBDESIGN = true, NB_PEN = false, NB_WRITE = false;
  var NB_PEN_GROUP = null, NB_REPAINT = null, NB_TIN_OPEN = false;
  ${ARM_SETTER_SRC}
  var all = document.querySelectorAll('[data-arm]');
  var out = { count: all.length, states: {} };
  /* THE CHIP'S ARMED HOOK IS DRIVEN IN STEP WITH THE TOOLS, exactly as the
     band painter drives it (\`(NB_PEN ? ' is-on' : '')\`).

     THIS IS NOT COSMETIC — IT IS WHAT MAKES THE CHIP NEGATIVE ABLE TO FIRE,
     and it was found by driving the chip-only mutation and watching that
     negative stay GREEN. With \`is-on\` baked into the probe's static markup,
     a cursor rule keyed on \`.station-nb-pen.is-on\` matches the node in BOTH
     states, so "the chip's cursor is the same armed and disarmed" was
     satisfied by the very fix it exists to reject. Toggling the hook makes
     the probe faithful to the painter and makes the negative discriminating.
     The phase's own defect class, landing inside this plan's new instrument. */
  var chip = document.querySelector('[data-arm="chip"]');
  var ON = ${JSON.stringify(ARM_ON_CLS)};
  function read() {
    if (chip) { chip.classList.toggle(ON, !!(NB_PEN || NB_WRITE)); }
    var o = { bodyClass: document.body.className };
    for (var i = 0; i < all.length; i++) {
      o[all[i].getAttribute('data-arm')] = getComputedStyle(all[i]).cursor;
    }
    return o;
  }
  out.states.disarmed = read();
  setNotebookPen(true);    out.states.penArmed = read();
  setNotebookPen(false);   out.states.penOff = read();
  setNotebookWrite(true);  out.states.writeArmed = read();
  setNotebookWrite(false); out.states.bothOff = read();
  return out;
})()`;

const MEASURE_FLIP_EXPR = `(async function () {
  await document.fonts.ready;
  var out = { nodes: {}, count: 0 };
  var all = document.querySelectorAll('[data-flip]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    out.nodes[n.getAttribute('data-flip')] = {
      text: n.textContent,
      offsetWidth: n.offsetWidth,
      offsetHeight: n.offsetHeight,
      display: cs.display,
      visibility: cs.visibility,
      fontWeight: cs.fontWeight
    };
  }
  return out;
})()`;

/* ==== (G-F1-live) F-1's VISIBILITY HALF ===================================

   WHY THIS GROUP EXISTS. Plan 26.91-10's `G-F1` closes F-1's FIRST claim —
   the calendar is PAINTED at every spread index — over the executed render.
   It cannot close the second — AND IT IS VISIBLE — because its driver is
   `mkdoc`, a synthetic document with NO LAYOUT ENGINE. A calendar painted at
   zero size, hidden by a stylesheet rule that stopped consuming `--w`, pushed
   off-scene, or reaching under the right page satisfies every one of plan
   10's assertions while being invisible on the glass. That is this phase's
   standing lesson landing again: WORKING AND FINDABLE ARE DIFFERENT CLAIMS,
   and 26.9 only ever measured the first. F-1 is a findability fix; shipping
   it with the owner's eye as the only visibility detector would repeat the
   exact pattern the fix exists to end.

   THE ONCE-PER-`--k` SCOPING IS EARNED BY MEASUREMENT, NOT ASSUMED.
   `paintNotebookCalendar` places every node it emits from
   `STATION_NOTEBOOK_GEOM` and reads NO spread index at all. Measured over its
   109-line body at this commit: `spread.` = 0, `di ` = 0, and
   `STATION_NOTEBOOK.view` occurs exactly ONCE — at `app.js:14176`, where it
   is a WRITE inside the lit-cell click handler, never a read that steers
   geometry. The calendar's geometry is therefore INDEX-INDEPENDENT, so
   measuring it once per `--k` measures it at every index.
   ⚠ IF THAT COUNT EVER CHANGES, THIS SCOPING IS VOID and the group must be
   re-scoped rather than trusted. `CAL_INDEX_FREE` below re-runs the count on
   every invocation so the condition is enforced, not merely written down.

   WHAT THIS GROUP DOES NOT PROVE — three bounds, stated here so no later
   reader can over-read the gate:
     1. It does NOT prove the painter ran at spread index N. That is plan
        10's `G-F1` over the executed render. The two are COMPLEMENTARY
        HALVES of one claim, not substitutes.
     2. It measures the calendar's SHIPPED MARKUP SHAPE, re-emitted from the
        shipped geometry constants and the shipped class names lifted out of
        the painter — NOT the painter's own output. That is this suite's
        established idiom (`TRACE_CLS`, `bandHtml`, `traceHtml` all work
        exactly this way); the alternative, lifting the painter's entire
        transitive free-variable set into the browser a second time, buys a
        strictly smaller increment than it costs. NAMED rather than glossed.
     3. It cannot see an occluder painted by something OUTSIDE the notebook
        scene. For that, and for how the page actually reads to her, owner
        beats R1/R2 at plan 14 remain the detector — a division of labour,
        recorded, not a gap.

   The calendar probes ride the SAME page as the `data-probe` / `data-band` /
   `data-trace` groups, so measuring at all five `--k` costs no additional
   browser launches. They carry `data-cal` and NEVER those three attributes,
   so every by-value count those groups pin is untouched. */
const CAL_SRC = extractFn(appSrc, 'paintNotebookCalendar');

/* The index-independence condition, RE-MEASURED on every run rather than
   quoted from the plan. `STATION_NOTEBOOK.view` is allowed exactly one
   occurrence and it must be the WRITE in the click handler. */
const CAL_INDEX_FREE = {
  spread: (CAL_SRC.match(/spread\./g) || []).length,
  di: (CAL_SRC.match(/\bdi /g) || []).length,
  view: (CAL_SRC.match(/STATION_NOTEBOOK\.view/g) || []).length,
  viewIsWrite: /STATION_NOTEBOOK\.view = /.test(CAL_SRC)
};

/* Every class list is LIFTED off the painter by `pick` (which throws rather
   than yielding undefined) and every coordinate is read off
   `SRC.STATION_NOTEBOOK_GEOM`. ZERO re-typed class names, ZERO re-typed
   numbers — a harness that wrote the class it then asserted would be the
   harness agreeing with itself. */
const CAL_CLS = {
  monthLabel: pick(CAL_SRC, /label\.className = '([^']+)'/,
    "the month label's class list"),
  nav: pick(CAL_SRC, /earlier\.className = '([^']+)'/,
    "the month-nav door's class list"),
  litDay: pick(CAL_SRC, /day\.className = '([^']+)'/,
    "the lit day cell's class list")
};

/* BOTH PLACEMENT MECHANISMS ARE MEASURED, BECAUSE THEY FAIL DIFFERENTLY.
   A LIT day cell, the month label and the two nav doors are placed by
   `place()` through `--x/--y/--w/--h` consumed by a stylesheet rule. An
   UNLIT day cell is placed by `placeNotebookInert` (app.js) through inline
   `position:absolute` + `calc(N * var(--k) * 1px)` and carries NO CLASS AT
   ALL. Only the lit kind can be zeroed by a stylesheet rule that stops
   consuming `--w`; both can be zeroed by a geometry change. A group
   measuring one kind is blind to one of the two failure shapes, so the
   unlit cell below is emitted through the OTHER mechanism verbatim —
   emitting it as a `.station-fixture` would be the harness measuring a node
   the app never builds. */
const CAL_G = SRC.STATION_NOTEBOOK_GEOM;
/* the WORST-CASE column, computed from the grid rather than hard-coded */
const CAL_WORST_COL = {
  x: CAL_G.grid.x0 + 6 * CAL_G.grid.pitchX,
  y: CAL_G.grid.y0,
  w: CAL_G.grid.cellW,
  h: CAL_G.grid.cellH
};
const CAL_NODE_COUNT = 5; // monthLabel + navPrev + navNext + lit + unlit

/* The right page's LEFTMOST painted origin, DERIVED from source exactly as
   `paintBlessingPage`/`paintTracePage` derive it (`g.pageX[side]` with
   `side === 'right'`, plus the date node's `dx`). Neither side of the
   separation assertion is typed. */
const CAL_PAGE_ORIGIN = CAL_G.pageX.right + CAL_G.date.dx;

function calHtml() {
  const slot = function (r) {
    return 'style="--x:' + r.x + ';--y:' + r.y + ';--w:' + r.w +
      ';--h:' + r.h + '"';
  };
  const fixture = [
    ['month-label', 'div', CAL_CLS.monthLabel, CAL_G.monthLabel, 'August 2026'],
    ['nav-prev', 'button', CAL_CLS.nav, CAL_G.navPrev, '‹'],
    ['nav-next', 'button', CAL_CLS.nav, CAL_G.navNext, '›'],
    ['day-lit', 'button', CAL_CLS.litDay, CAL_WORST_COL, '28']
  ].map(function (n) {
    return '<' + n[1] + ' class="' + n[2] + '" data-cal="' + n[0] + '" ' +
      slot(n[3]) + '>' + n[4] + '</' + n[1] + '>';
  }).join('\n');
  /* the UNLIT cell, through placeNotebookInert's mechanism and with NO class */
  const c = CAL_WORST_COL;
  const inert = '<span data-cal="day-unlit" style="position:absolute;' +
    'left:calc(' + c.x + ' * var(--k) * 1px);' +
    'top:calc(' + (c.y + CAL_G.grid.pitchY) + ' * var(--k) * 1px);' +
    'width:calc(' + c.w + ' * var(--k) * 1px);' +
    'height:calc(' + c.h + ' * var(--k) * 1px);">27</span>';
  return fixture + '\n' + inert;
}

/* ==== (91g) 26.91-15 — THE PALACE RECIPE STILL REACHES ITS OWN CHROME ====

   THE POSITIVE CONTROL OVER A NARROWING. 26.91-15 measured the matched
   cascade on the notebook's in-scene typing surface and found ONE rule —
   the 24.1-01 palace input recipe, a type-plus-attribute selector at
   (0,0,1,1) — winning `width`, `font-family`, `font-style`, `font-size`,
   `border`, `padding` and `box-sizing` over the two class rules written for
   that element at (0,0,1,0). The fix takes the typing surface out of that
   rule's reach AT THE SELECTOR.

   A NARROWING WITH NO CONTROL OVER WHAT MUST SURVIVE IT IS INDISTINGUISHABLE
   FROM A DELETION THAT HAPPENS TO LOOK GREEN. This group is that control:
   every `type="text"` field shipped in `index.html` is re-emitted VERBATIM
   from the page's own bytes and measured live, and the values it is measured
   against are LIFTED from the recipe's own declaration block rather than
   typed. If the recipe were deleted outright, or narrowed one step too far,
   these assertions go red — which is exactly what was driven before this
   group was believed.

   WHAT IT DOES NOT PROVE: it does not prove the typing surface is now
   correct. That is `G-W1`'s claim, and the two are complementary halves of
   one change — this half watches what must NOT move, that half watches what
   must. */
function cssStrip(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }

/* the rule block for a selector, by balanced-brace scan over comment-stripped
   stylesheet bytes. It THROWS on an empty or missing region: a region gate
   armed at a selector that does not exist must refuse, never pass. */
function cssBlock(sel) {
  const src = cssStrip(tokensSrc);
  const at = src.indexOf('\n' + sel + ' {');
  if (at === -1) {
    throw new Error('91g lift: no rule block for the selector `' + sel +
      '` in tokens.css. A region gate armed at a selector that does not ' +
      'exist must REFUSE rather than report a clean zero.');
  }
  const from = src.indexOf('{', at) + 1;
  const to = src.indexOf('}', from);
  if (to === -1) { throw new Error('91g lift: unterminated block for ' + sel); }
  const body = src.slice(from, to);
  if (body.trim().length === 0) {
    throw new Error('91g lift: the rule block for `' + sel + '` is EMPTY.');
  }
  return body;
}

/* the recipe, narrowed. The exclusion token is part of the selector this
   lift searches for, so a fix silently reverted cannot be measured against
   the narrowed recipe's values — the lift throws instead. */
const PALACE_SEL = 'input[type="text"]:not(.page-deco-input)';
const PALACE_BLOCK = cssBlock(PALACE_SEL);
const PALACE = {
  border: pick(PALACE_BLOCK, /border:\s*([0-9.]+px)\s+/,
    "the palace recipe's border width"),
  boxSizing: pick(PALACE_BLOCK, /box-sizing:\s*([a-z-]+)/,
    "the palace recipe's box model"),
  width: pick(PALACE_BLOCK, /width:\s*([0-9]+%)/,
    "the palace recipe's width rule")
};

/* Every shipped `type="text"` field in the served page, lifted VERBATIM as
   bytes. `data-chrome` is the only thing added; nothing is re-typed. */
const CHROME_TAGS = (indexSrc.match(/<input\b[^>]*type="text"[^>]*>/g) || []);
// pinned BY VALUE — a vanished field must fail here.
//
// ⚠ RE-PINNED 5 → 4 by 26.96-02, and the coverage this LOST is named rather
// than quietly absorbed. The roster add field moved out of index.html into
// app.js's shared roster renderer, because the Manage pane and the
// pre-import screen both render that editor and two hosts cannot share a
// global id. The field itself is NOT unstyled: this group scrapes
// index.html's BYTES, while the palace recipe is a type-plus-attribute
// selector that matches the LIVE DOM wherever the element was emitted from.
// ⛔ But it is no longer measured HERE, and that is a real reduction in this
// group's reach — recorded in 26.96-02-SUMMARY.md and in .planning/WINDOWS.md
// rather than left for someone to rediscover from a number that once said 5.
const CHROME_COUNT = 4;
function chromeHtml() {
  return CHROME_TAGS.map(function (tag, i) {
    return tag.replace(/^<input\b/, '<input data-chrome="' + i + '"');
  }).join('\n');
}

const MEASURE_CHROME_EXPR = `(async function () {
  await document.fonts.ready;
  var scene = document.getElementById('harness-scene');
  var out = { count: 0, sceneWidth: scene.clientWidth, nodes: {} };
  var all = document.querySelectorAll('[data-chrome]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    out.nodes[n.getAttribute('data-chrome')] = {
      offsetWidth: n.offsetWidth,
      borderTopWidth: cs.borderTopWidth,
      borderLeftWidth: cs.borderLeftWidth,
      boxSizing: cs.boxSizing
    };
  }
  return out;
})()`;

/* ==== (G-W1) 26.91-15 — THE TYPING SURFACE, MEASURED AGAINST THE MARK ====

   TWO CLAIMS, EACH IN BOTH FORMS, AND NEITHER FORM ALONE IS SUFFICIENT.

     RELATIONAL alone passes when both sides are equally wrong. Before this
     wave the typing surface and the committed mark could both have been
     rendered by the same broken rule and agreed with each other perfectly.

     BY-VALUE alone passes when only one side is measured. A typing surface
     that computes to the lifted constant times the scale tells you nothing
     about whether the mark she is about to make will sit in that same box.

   So the box is asserted BOTH as "equal to the committed mark's box" AND as
   "equal to the lifted box constant times the scene's scale", and the face
   BOTH as "the same family and slant as the committed mark's" AND as "the
   shipped serif token's own resolved value". `NB_TEXT_BOX` is literally the
   same declaration both consumers read, which is what makes the relational
   half honest rather than a coincidence.

   THE POSITION IS A THIRD ASSERTION, NOT A COROLLARY. F-18 reported the book
   moving under her while she typed. It was written up as a rescale; the
   arithmetic in the record refutes that (two spans of equal width, 360 apart)
   and the three-state reading here answers it by measurement: the scale delta
   and the position delta across open → focus → remove are both pinned at
   zero, so a future change that re-introduces the pan reddens HERE rather
   than at her hand.

   WHAT THIS GROUP DOES NOT PROVE — its bounds, stated the way `G-F1-live`
   states its three:
     1. It does NOT prove the painter ran, or that a double-click reaches it.
        That is `91d`/`G-C3` in tests/test_blessings_notebook.cjs, driven
        through the real canvas. The two are complementary halves.
     2. It measures the SHIPPED MARKUP SHAPE — the class list and the four
        inline custom properties lifted out of the painters that emit them,
        re-emitted here — not the painters' own output. Same idiom as
        `TRACE_CLS`, `bandHtml`, `calHtml`; named rather than glossed.
     3. It cannot see an occluder painted outside the station scene, and it
        cannot say whether the box READS as the size of the mark she is
        making. That is the owner's eye at the seal UAT.

   ZERO RE-TYPED CLASS NAMES AND ZERO RE-TYPED NUMBERS. The class lists come
   off both painters, the box comes off `NB_TEXT_BOX`, the face comes off the
   her-layer rule's own block in the shipped stylesheet, and the fixture
   origin is derived from `STATION_NOTEBOOK_GEOM` rather than chosen. */
const EDITOR_SRC = extractFn(appSrc, 'openHandTextEditor');
const DECO_SRC = extractFn(appSrc, 'paintPageDecorations');

const W1_INPUT_TYPE = pick(EDITOR_SRC, /input\.type = '([^']+)'/,
  "the typing surface's input type");
const W1_INPUT_CLS = pick(EDITOR_SRC, /input\.className = '([^']+)'/,
  "the typing surface's class list");
const W1_MARK_CLS = pick(DECO_SRC,
  /btn\.className = '(page-deco page-deco-text[^']*)'/,
  "the committed mark's class list");

/* the four inline custom properties, lifted as a SET with the expression each
   one carries. `--w`/`--h` must read the box constant; a re-typed number on
   either side would make the relational half a coincidence. */
const W1_PROPS = (function () {
  const out = {};
  const re = /input\.style\.setProperty\('(--[a-z])',\s*String\(([^)]+)\)\)/g;
  let m;
  while ((m = re.exec(EDITOR_SRC)) !== null) { out[m[1]] = m[2].trim(); }
  return out;
})();
const W1_PROP_COUNT = 4; // pinned BY VALUE

/* the face, lifted from the her-layer rule's own block in the shipped
   stylesheet — the ONE place it is allowed to come from. */
const HAND_BLOCK = cssBlock('.caption-hand');
const W1_FACE = {
  familyToken: pick(HAND_BLOCK, /font-family:\s*var\((--[a-z-]+)\)/,
    "the her-layer class's font-family token"),
  slant: pick(HAND_BLOCK, /font-style:\s*([a-z]+)/,
    "the her-layer class's slant")
};

/* the fixture origin, DERIVED. The right page's own painted origin and the
   line below its date row — where a mark actually goes. */
const W1_AT = {
  x: SRC.STATION_NOTEBOOK_GEOM.pageX.right + SRC.STATION_NOTEBOOK_GEOM.date.dx,
  y: SRC.STATION_NOTEBOOK_GEOM.date.y + SRC.STATION_NOTEBOOK_GEOM.date.h
};
const W1_BOX = SRC.NB_TEXT_BOX;
const W1_NODE_COUNT = 2; // the committed mark + the typing surface

function w1Html() {
  return '<button type="button" class="' + W1_MARK_CLS + '" data-w1="mark" ' +
    'style="--x:' + W1_AT.x + ';--y:' + W1_AT.y + ';--w:' + W1_BOX.w +
    ';--h:' + W1_BOX.h + ';--i:0;--a:0;--s:1">write something</button>';
}

/* ONE page-side pass per `--k`. The typing surface is CREATED, FOCUSED and
   REMOVED inside this pass — create-focus-remove is the sequence the reported
   defect lives in, and the pass leaves the page exactly as it found it. */
const MEASURE_W1_EXPR = `(async function () {
  await document.fonts.ready;
  var scene = document.getElementById('harness-scene');
  var se = document.scrollingElement || document.documentElement;
  /* THE POSITION IS TAKEN DOCUMENT-RELATIVE, ON PURPOSE. A viewport-relative
     rect moves whenever the document scrolls, and this harness drives every
     pinned --k regardless of fit — so at k>=2 the scene is wider than the
     harness window and the browser's own scroll-into-view on focus would
     read as a pan. That condition does not exist in the app (fitStationScale
     takes the largest FITTING integer). Adding the scroll offset back makes
     these numbers say whether the scene MOVED IN THE LAYOUT, which is the
     claim; the pan's actual CAUSE is gated separately and by its mechanism. */
  function snap() {
    var r = scene.getBoundingClientRect();
    return { left: r.left + se.scrollLeft, top: r.top + se.scrollTop,
      width: r.width, height: r.height,
      k: parseFloat(getComputedStyle(scene).getPropertyValue('--k')) };
  }
  var sceneK = parseFloat(getComputedStyle(scene).getPropertyValue('--k'));
  function box(n) {
    var cs = getComputedStyle(n);
    var r = n.getBoundingClientRect();
    var sr = scene.getBoundingClientRect();
    return { offsetWidth: n.offsetWidth, offsetHeight: n.offsetHeight,
      fontFamily: cs.fontFamily, fontStyle: cs.fontStyle,
      fontSize: cs.fontSize,
      /* the node's own box, recovered to scene px against the scene's rect
         and the scene's OWN --k, both read in this same layout. Nothing is
         typed: not the scene's internal units, not the scale. */
      sceneLeft: (r.left - sr.left) / sceneK,
      sceneRight: (r.right - sr.left) / sceneK,
      sceneTop: (r.top - sr.top) / sceneK,
      sceneBottom: (r.bottom - sr.top) / sceneK,
      /* ...and the scene's own extent in the same units, so the containment
         comparison below has both sides off one layout. */
      sceneW: sr.width / sceneK,
      sceneH: sr.height / sceneK };
  }

  /* the shipped serif token run through the browser's OWN serializer, in
     this same run, so no font stack is ever typed into a test. */
  var conv = document.createElement('div');
  document.body.appendChild(conv);
  conv.style.fontFamily =
    getComputedStyle(document.documentElement)
      .getPropertyValue(${JSON.stringify(W1_FACE.familyToken)}).trim();
  var serialFamily = getComputedStyle(conv).fontFamily;
  conv.remove();

  var before = snap();

  var input = document.createElement('input');
  input.type = ${JSON.stringify(W1_INPUT_TYPE)};
  input.className = ${JSON.stringify(W1_INPUT_CLS)};
  input.setAttribute('data-w1', 'input');
  input.style.setProperty('--x', ${JSON.stringify(String(W1_AT.x))});
  input.style.setProperty('--y', ${JSON.stringify(String(W1_AT.y))});
  input.style.setProperty('--w', ${JSON.stringify(String(W1_BOX.w))});
  input.style.setProperty('--h', ${JSON.stringify(String(W1_BOX.h))});
  scene.appendChild(input);
  input.focus();
  input.select();

  var out = { count: 0, nodes: {}, serialFamily: serialFamily,
    before: before, during: null, after: null };
  var all = document.querySelectorAll('[data-w1]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    out.nodes[all[i].getAttribute('data-w1')] = box(all[i]);
  }
  out.during = snap();

  input.blur();
  input.parentNode.removeChild(input);
  out.after = snap();
  return out;
})()`;

/* ONE page-side pass per `--k`, in the same style as MEASURE_EXPR. The scene's
   own rect is taken once so every box can be converted back to scene px, and
   the node COUNT rides along so a page that emitted nothing cannot read as a
   clean pass. */
const MEASURE_CAL_EXPR = `(async function () {
  await document.fonts.ready;
  var scene = document.getElementById('harness-scene');
  var sr = scene.getBoundingClientRect();
  var out = {
    count: 0,
    scene: { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom,
      width: sr.width, height: sr.height },
    k: parseFloat(getComputedStyle(scene).getPropertyValue('--k')),
    nodes: {}
  };
  var all = document.querySelectorAll('[data-cal]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var r = n.getBoundingClientRect();
    out.nodes[n.getAttribute('data-cal')] = {
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height,
      display: getComputedStyle(n).display
    };
  }
  return out;
})()`;

/* The measurement, taken in ONE page-side pass so every number for a given
   node comes from the same layout. */
const MEASURE_EXPR = `(async function () {
  await document.fonts.ready;
  var probe = document.createElement('div');
  document.body.appendChild(probe);
  var initial = getComputedStyle(probe);
  /* Chrome's OWN serializations, captured live in this same run. Comparing
     against a hand-typed 'rgba(0, 0, 0, 0)' would be defeated silently by a
     serializer change; these cannot be. */
  var serial = {
    transparent: initial.backgroundColor,
    noImage: initial.backgroundImage,
    opaque: getComputedStyle(document.documentElement).opacity
  };
  probe.remove();
  var out = { serial: serial, nodes: {}, count: 0 };
  var all = document.querySelectorAll('[data-probe]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    out.nodes[n.getAttribute('data-probe')] = {
      clientWidth: n.clientWidth,
      clientHeight: n.clientHeight,
      offsetWidth: n.offsetWidth,
      offsetHeight: n.offsetHeight,
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      borderTopWidth: cs.borderTopWidth,
      borderRightWidth: cs.borderRightWidth,
      borderBottomWidth: cs.borderBottomWidth,
      borderLeftWidth: cs.borderLeftWidth
    };
  }
  return out;
})()`;

/* THE ACCENT-BUDGET PASS. Both token values are read off the LIVE `:root` and
   run through the browser's own colour serializer (by assigning them to a real
   element's `color`), so neither `#2c2823` nor `#e8503a` is ever typed into a
   test. A future retint of either token moves both sides together, which is
   what makes the "is ink, is NOT accent" pair meaningful rather than decorative. */
const FOCUS_EXPR = `(function () {
  var root = getComputedStyle(document.documentElement);
  var inkRaw = root.getPropertyValue('--ink').trim();
  var accentRaw = root.getPropertyValue('--accent').trim();
  var conv = document.createElement('div');
  document.body.appendChild(conv);
  conv.style.color = inkRaw;
  var ink = getComputedStyle(conv).color;
  conv.style.color = accentRaw;
  var accent = getComputedStyle(conv).color;
  conv.remove();
  var out = { ink: ink, accent: accent, inkRaw: inkRaw, accentRaw: accentRaw,
    nodes: {}, count: 0 };
  var all = document.querySelectorAll('[data-focus]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    n.focus();
    var cs = getComputedStyle(n);
    out.nodes[n.getAttribute('data-focus')] = {
      focusVisible: n.matches(':focus-visible'),
      isActive: document.activeElement === n,
      outlineColor: cs.outlineColor,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth
    };
    n.blur();
  }
  return out;
})()`;

/* ---- (91e) G-C5: THE MEASURED LABEL FIT --------------------------------
   ONE page-side pass per `--k`, so every number for a node comes from the
   same layout.

   THE PADDING IS READ LIVE, PER NODE, IN THIS SAME RUN — never hand-typed,
   never derived from the token, never copied from the UI-SPEC. Two reasons,
   and the second is the one that makes a single formula impossible:
     1. the token is exactly what a live gate exists NOT to trust;
     2. `.station-tin`'s border is an UNSCALED 1px while the band rows carry
        `calc(1px * var(--k))`, so the tin's content is `w*k - 2 - <its own
        padding>` and the rows' is `w*k - 2k - <theirs>`. No single written
        expression is correct for both. Reading per node makes the ONE form
        below correct for every node it measures, whatever ships. */
const MEASURE_BAND_EXPR = `(async function () {
  await document.fonts.ready;
  var out = { nodes: {}, count: 0 };
  var all = document.querySelectorAll('[data-band]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    var cs = getComputedStyle(n);
    /* THE TEXT'S OWN BOX, not the container's scroll box. */
    var r = document.createRange();
    r.selectNodeContents(n);
    var box = r.getBoundingClientRect();
    out.nodes[n.getAttribute('data-band')] = {
      text: n.textContent,
      clientWidth: n.clientWidth, clientHeight: n.clientHeight,
      offsetWidth: n.offsetWidth, offsetHeight: n.offsetHeight,
      boxWidth: box.width, boxHeight: box.height,
      padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight),
      padT: parseFloat(cs.paddingTop), padB: parseFloat(cs.paddingBottom),
      boxSizing: cs.boxSizing
    };
  }
  return out;
})()`;

/* THE ARMING PASS. It runs at `--k = 1` (the tin's worst case, because its
   rim is unscaled) inside the SAME session as the measurement above, so
   every number below is comparable to every number above.

   THIS IS PART OF THE GATE, NOT A NICETY. The observations are returned and
   ASSERTED, so the day G-C5 stops being able to catch a planted overflow,
   this suite goes red — rather than the arming being a one-off note in a
   SUMMARY that nobody re-runs. A gate that has only ever been seen green
   has not been tested; it has been watched. */
const ARM_EXPR = `(async function () {
  await document.fonts.ready;
  var EPS = ${JSON.stringify(EPS)};
  var tin = document.querySelector('[data-band="tin"]');
  if (!tin) { throw new Error('arming: the tin probe is missing'); }
  var shipped = tin.textContent;
  var cs = getComputedStyle(tin);
  var padL = parseFloat(cs.paddingLeft);
  var padR = parseFloat(cs.paddingRight);
  function boxOf(node) {
    var r = document.createRange();
    r.selectNodeContents(node);
    return r.getBoundingClientRect();
  }
  var borderL = parseFloat(cs.borderLeftWidth);
  function state(label) {
    tin.textContent = label;
    var b = boxOf(tin);
    var cw = tin.clientWidth;
    var nodeBox = tin.getBoundingClientRect();
    /* THE SYMMETRY, MEASURED RATHER THAN ARGUED. The content box's own two
       edges, and how far the text's box pokes past each of them. On a
       centred flex row an over-wide label intrudes on BOTH — and LTR
       scrollWidth can only ever see the end-edge half. */
    var contentLeft = nodeBox.left + borderL + padL;
    var contentRight = contentLeft + (cw - padL - padR);
    return {
      label: label, boxWidth: b.width, boxHeight: b.height, clientWidth: cw,
      padL: padL, padR: padR, contentBound: cw - padL - padR,
      scrollWidth: tin.scrollWidth, scrollHeight: tin.scrollHeight,
      startIntrusion: contentLeft - b.left,
      endIntrusion: (b.left + b.width) - contentRight,
      /* the SHIPPED bound (content box) and the two cheap substitutes,
         evaluated on the SAME state so the disagreement is a measurement
         rather than an argument. */
      shippedHolds: b.width <= cw - padL - padR + EPS,
      retiredClientWidthHolds: b.width <= cw + EPS,
      scrollHolds: tin.scrollWidth <= tin.clientWidth
    };
  }

  /* ARMING 1 — the gross overflow, and the scrollWidth rejection. */
  var arm1 = state('marksmarksmarks');

  /* ARMING 2 — THE BAND THE RETIRED BOUND LET THROUGH.
     Grow the label ONE CHARACTER AT A TIME and SELECT BY MEASUREMENT. The
     string is NOT predicted: Pixelify Sans is proportional, so a predicted
     string would be the harness agreeing with itself. 'i' is the growth
     character because it is the font's narrowest non-space glyph, which
     makes the steps fine enough to land inside a window only 6*k px wide. */
  var arm2 = null;
  var steps = [];
  for (var i = 1; i <= 60 && !arm2; i++) {
    var s = shipped + new Array(i + 1).join('i');
    var st = state(s);
    steps.push({ label: s, boxWidth: st.boxWidth });
    /* strictly inside the band between the CONTENT edge and the PADDING
       edge, and past EPS — a label inside the band but within EPS of the
       content bound would not redden the shipped bound, so selecting it
       would arm nothing. */
    if (st.boxWidth > st.contentBound + EPS && st.boxWidth <= st.clientWidth) {
      arm2 = st;
    }
  }

  /* ARMING 3 — the collapsed Range. An empty label yields a zero-width box,
     which satisfies every <= comparison trivially. */
  var arm3 = state('');

  /* REVERT, then re-measure EVERY shipped label under the new bound in this
     SAME run. A bound that also reddens the shipped labels is a BROKEN gate,
     not a stricter one, and this is the only thing that tells the two
     apart. */
  tin.textContent = shipped;
  var after = {};
  var all = document.querySelectorAll('[data-band]');
  for (var j = 0; j < all.length; j++) {
    var n = all[j];
    var c2 = getComputedStyle(n);
    var pl = parseFloat(c2.paddingLeft), pr = parseFloat(c2.paddingRight);
    var b2 = boxOf(n);
    after[n.getAttribute('data-band')] = {
      text: n.textContent, boxWidth: b2.width, clientWidth: n.clientWidth,
      contentBound: n.clientWidth - pl - pr,
      holds: b2.width <= n.clientWidth - pl - pr + EPS
    };
  }
  return { arm1: arm1, arm2: arm2, arm3: arm3, after: after,
    stepCount: steps.length, restored: tin.textContent === shipped };
})()`;

/* ---- (91f) THE TRACE MEASUREMENT PASS ------------------------------------
   ONE page-side pass, so every number for a node comes from the same layout.

   ⚠ WHY `scrollHeight` IS LEGITIMATE HERE AND NOWHERE NEAR THE BAND, written
   down because it CONTRADICTS what (91e)/G-C5 does a few hundred lines away
   and a reader will otherwise "harmonise" them.

   `.station-caption` (tokens.css) is a BLOCK box with `line-height: 1.3` and
   `overflow: hidden`. An over-long trace therefore WRAPS and grows DOWNWARD —
   vertical overflow, which the scroll box reports faithfully. It needs no
   width assertion: the composed line wraps rather than running off the side.

   THIS FORM MUST NOT BE COPIED ONTO A FLEX OR CENTRED SURFACE. There the
   overflow is SYMMETRIC and the scroll box is structurally blind to the start
   edge — which is exactly what (91e)'s ARMING 2 measured, and precisely why
   G-C5 measures a `Range` instead. G-C5's form is the SAFE DEFAULT; this one
   is the special case, and it is the special case for a stated reason. */
const MEASURE_TRACE_EXPR = `(async function () {
  await document.fonts.ready;
  var out = { nodes: {}, count: 0 };
  var all = document.querySelectorAll('[data-trace]');
  out.count = all.length;
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    out.nodes[n.getAttribute('data-trace')] = {
      text: n.textContent,
      clientWidth: n.clientWidth,
      clientHeight: n.clientHeight,
      scrollHeight: n.scrollHeight,
      overflowY: getComputedStyle(n).overflowY,
      display: getComputedStyle(n).display
    };
  }
  return out;
})()`;

async function waitForPage(session, token) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    let ready = false;
    try {
      ready = await cdp.evaluate(session,
        "document.readyState === 'complete' && " +
        "document.documentElement.getAttribute('data-harness') === " +
        JSON.stringify(token));
    } catch (e) { ready = false; }
    if (ready === true) return;
    await new Promise(function (r) { setTimeout(r, 20); });
  }
  throw new Error('test_live_render: the harness page never reached ' +
    'readyState "complete" with token ' + token + ' within 20000ms.');
}

/* One browser per `--k`: the harness URL is passed on the command line, so
   the page target already exists and no navigation race can be misread as a
   measurement. */
async function measureAt(k) {
  const page = harness.buildHarness({ bodyHtml: bodyHtml(), k: k });
  let session = null;
  try {
    session = await cdp.launch({ url: page.url });
    await waitForPage(session, page.token);
    /* the style pass runs BEFORE the focus pass on purpose: focusing a node
       is a state change, and the raised-key contract is about the resting
       state every visit begins in. */
    const styles = await cdp.evaluate(session, MEASURE_EXPR);
    const focus = await cdp.evaluate(session, FOCUS_EXPR);
    /* the band pass runs BEFORE the arming pass, which mutates a label and
       puts it back: measuring first means the shipped numbers can never be
       taken off a planted state. */
    const band = await cdp.evaluate(session, MEASURE_BAND_EXPR);
    /* the trace pass runs BEFORE the arming pass for the same reason the
       band pass does: arming plants a label and puts it back, and no shipped
       number may be taken off a planted state. */
    const trace = await cdp.evaluate(session, MEASURE_TRACE_EXPR);
    /* the calendar pass runs BEFORE the arming pass for the same reason the
       band and trace passes do: arming plants a label and puts it back, and
       no shipped number may be taken off a planted state. */
    const cal = await cdp.evaluate(session, MEASURE_CAL_EXPR);
    /* the chrome pass runs BEFORE the arming pass for the reason the three
       above it do: arming plants a label and puts it back, and no shipped
       number may be taken off a planted state. */
    const chrome = await cdp.evaluate(session, MEASURE_CHROME_EXPR);
    /* G-W1 runs LAST of the shipped-state passes and before the arming pass.
       It is the only pass that mutates the DOM, and it puts the page back:
       it creates the typing surface, focuses it, measures, then blurs and
       removes it. Every pass above it therefore reads a page the typing
       surface has never touched. */
    const w1 = await cdp.evaluate(session, MEASURE_W1_EXPR);
    /* the flip pass runs with the other shipped-state passes and BEFORE the
       arming pass, for the reason every one of them does: arming plants a
       label and puts it back, and no shipped number may be taken off a
       planted state. */
    const flip = await cdp.evaluate(session, MEASURE_FLIP_EXPR);
    /* (G-18-live) runs with the shipped-state passes and BEFORE the arming
       pass, for the reason every one of them does. It DOES mutate the body's
       class list — through the shipped setters — and it puts the page back:
       its last act disarms both tools, and the assertions check that the body
       returned to carrying no armed class at all. */
    const armed = await cdp.evaluate(session, MEASURE_ARMED_EXPR);
    /* 26.91-27: the error-row pass runs with the shipped-state passes and
       BEFORE the arming pass, for the reason every one of them does. It
       mutates nothing at all — the plant is a probe of its own, so no
       shipped number is ever taken off a planted state. */
    const err = await cdp.evaluate(session, MEASURE_ERR_EXPR);
    /* 26.91-30 (F-26): the region pass runs with the shipped-state passes.
       It DOES toggle body.nb-design — through the real class the shipped
       setter writes — and it puts the page back, RE-QUERYING every handle
       after the change rather than reading a detached one. */
    const region = await cdp.evaluate(session, MEASURE_REGION_EXPR);
    /* 26.91-35 (F-28): the ink pass runs LAST of the shipped-state passes and
       before the arming pass. It adds `nb-design` and removes it again — the
       ink box and the handles are arranging-mode chrome — and it mutates
       nothing else. Every node it reads carries `data-ink` and never
       `data-probe`/`data-reg`, so the by-value counts those groups pin are
       untouched. */
    const ink = await cdp.evaluate(session, MEASURE_INK_EXPR);
    /* 26.91-36 (F-24): the tin pass runs with the shipped-state passes and
       BEFORE the arming pass, for the reason every one of them does. It
       mutates NOTHING — both states are probes of their own, so no reading is
       ever taken off a planted state, and the two differ in exactly the class
       token and the attribute the painter derives. */
    const tin29 = await cdp.evaluate(session, MEASURE_TIN29_EXPR);
    const arm = k === 1 ? await cdp.evaluate(session, ARM_EXPR) : null;
    return { styles: styles, focus: focus, band: band, trace: trace,
      cal: cal, chrome: chrome, w1: w1, flip: flip, armed: armed, err: err,
      region: region, ink: ink, tin29: tin29, arm: arm };
  } finally {
    await cdp.close(session);
    try { fs.rmSync(page.dir, { recursive: true, force: true }); } catch (e) {}
  }
}

/* Every assertion below is keyed by control NAME resolved out of the lifted
   probe table, never by node index — a painter reordering its appendChild
   calls cannot move an assertion onto a different control. */
function probeByRole(role) {
  return PROBES.filter(function (p) { return p.role === role; });
}

const FOCUSABLE_COUNT = 2; // tin-enabled + nb-row, pinned BY VALUE

/* =========================================================================
   (G-23) 26.91-23 (F-22 / A-20): ARM `write`, THEN TAP, AND TYPING LANDS.

   WHAT THIS HOLDS, IN HER WORDS. A-20: *arming `write` shows a short prompt on
   the page; the first tap goes straight into typing. Nothing is created until
   she chooses where.* She picked that over the LITERAL reading of her own F-22
   sentence (a box the moment you arm) once she was shown that the app
   deliberately never mints a mark she did not ask for, and that by UI-SPEC E5
   an untyped element persists as a REAL element.

   WHY IT IS LIVE AND CANNOT BE ANYTHING ELSE. M-23 measured the defect: the
   editor DOES open and DOES take focus — and it lives 0.9 ms. `focus()` is
   called inside the `pointerdown` handler; the default action of the
   `mousedown` that follows moves focus off the input; `blur` is wired to
   `commit`; `commit` removes the input. Every layer of that is invisible to
   the two cheaper instruments:
     - a SOURCE GREP sees `input.focus()` present and passes on a build where
       focus is torn away a millisecond later;
     - the FAKE DOM in `tests/test_blessings_notebook.cjs` cannot see it either,
       and not by accident: its `writeRig` STUBS `openHandTextEditor` and its
       `scene.querySelector` returns `null` unconditionally. A synthetic
       document has no focus model at all, so `focus()` being CALLED and focus
       being HELD are different claims and it can only ever check the first.
     - a press synthesised with `dispatchEvent` runs NO DEFAULT ACTION, and the
       defect IS a default action.
   So the press below is a TRUSTED `Input.dispatchMouseEvent` in real Chrome.

   ASK THE ANTI-VACUITY QUESTIONS OF IT (26.91-VALIDATION.md):
     1. Can it pass before the work? NO. Recorded live at HEAD before the fix:
        `one-focused-input` RED (inputs=0, activeElement=<body>),
        `prompt-while-armed` RED (0 prompt nodes), `typing-lands` RED
        (value=null). Those three names are what reddened, and they are named
        here rather than described.
     2. Can it pass on a deliberately broken build? NO — five mutations were
        driven and each reddened its intended assertion (26.91-23-SUMMARY.md).
     3. Does a degenerate implementation satisfy it? NO. `nothing-at-arm-time`
        pins that arming creates NOTHING, and `prompt-absent-when-disarmed` is
        a negative control, so "always show an input" and "always show the
        prompt" both fail.
     4. Evaluation or source order? EVALUATION — every value comes off a live
        page driven through the shipped band, and none of it off a file.
     5. Does it match the fix's own comment? NO — it never reads app.js.

   ⚠ THE ONE ASSERTION THIS GATE MAY NOT BE BUILT ON.
   M-23's pre-flight found `nothing-at-arm-time` ALREADY GREEN at HEAD. It is
   kept, because it is the invariant's guard — it is what stops a later change
   minting a mark at arm time — but a gate assembled only from an already-green
   negative is VACUOUS, and that is this project's defect class in its purest
   form. The assertions that had to redden are `one-focused-input` and
   `prompt-while-armed`, and they did.

   IT NEVER TOUCHES THE OWNER'S LIBRARY. See `tests/lib/app-server.cjs`: the
   library is built from nothing in a temp dir on every run and removed after.
   ========================================================================= */

/* HER WORDS, PINNED BY VALUE. A-20 part 2: she chose this string over `tap the
   page to write` and over `choose a spot`, and over delegating the wording.

   THIS IS DELIBERATELY NOT LIFTED OUT OF app.js. Every other constant in this
   suite is lifted precisely so the harness cannot agree with itself — but this
   one is an OWNER RULING, not an implementation detail, and a gate that read
   the string out of the source would go green on a build where somebody had
   re-worded her copy. That is the whole failure this pin exists to prevent.
   No leading capital, no trailing period: the literal bytes she chose. */
const PROMPT_COPY = 'tap where you want to write';

/* find a point inside `sel` that actually HIT-TESTS to it. The band rows sit
   under a full-bleed overlay for most of their box, so a naive centre-point
   press lands on the overlay and the gate would report a control that "did
   nothing" when in truth it was never pressed. Scanning the whole box makes a
   genuinely unreachable control an explicit BLOCKED failure instead. */
const HIT_EXPR = function (sel) {
  return '(function(){var e=document.querySelector(' + JSON.stringify(sel) +
    ');if(!e)return null;var b=e.getBoundingClientRect();' +
    'for(var fy=0.5;fy<=0.98;fy+=0.04){var ys=[fy,1-fy];' +
    'for(var s=0;s<2;s++){var yy=ys[s];if(yy<0.02||yy>0.98)continue;' +
    'for(var fx=0.1;fx<0.95;fx+=0.05){var x=b.left+b.width*fx,' +
    'y=b.top+b.height*yy;var t=document.elementFromPoint(x,y);' +
    'if(t&&(t===e||e.contains(t)))return JSON.stringify([x,y]);}}}' +
    'var c=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);' +
    'return JSON.stringify(["BLOCKED",c?c.tagName:"null"]);})()';
};

/* ONE READING OF THE PAGE. Raw values only — every interpretation happens in
   the assertions, never in the probe. */
const G23_PROBE =
  'JSON.stringify({' +
  'texts:document.querySelectorAll(".page-deco-text").length,' +
  'inputs:document.querySelectorAll(".page-deco-input").length,' +
  'activeIsInput:!!(document.activeElement&&document.activeElement.classList&&' +
  'document.activeElement.classList.contains("page-deco-input")),' +
  'prompts:document.querySelectorAll(".page-deco-prompt").length,' +
  'promptText:(document.querySelector(".page-deco-prompt")||{}).textContent||null,' +
  'canvas:document.querySelectorAll(".page-deco-canvas").length,' +
  'value:(document.querySelector(".page-deco-input")||{}).value})';

async function g23Press(session, x, y) {
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mousePressed', x: x, y: y, button: 'left', clickCount: 1,
      buttons: 1 });
  await cdp.send(session, 'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: x, y: y, button: 'left', clickCount: 1,
      buttons: 0 });
  await new Promise(function (r) { setTimeout(r, 450); });
}

async function g23Click(session, sel) {
  const raw = await cdp.evaluate(session, HIT_EXPR(sel));
  if (!raw) {
    throw new Error('(G-23) the control "' + sel + '" is not on the page at ' +
      'all. A live gate whose subject is missing FAILS.');
  }
  const at = JSON.parse(raw);
  if (at[0] === 'BLOCKED') {
    throw new Error('(G-23) the control "' + sel + '" is on the page but no ' +
      'point inside it is reachable — every press lands on <' + at[1] + '>. ' +
      'A control that cannot be pressed is not a control.');
  }
  await g23Press(session, at[0], at[1]);
  return at;
}

/* ---- G-31/live-app (26.91-38, D-13): THE FIVE ANTI-VACUITY QUESTIONS -----
   Answered in writing, for the two groups this wave adds to gate23 — the
   arranging sweep and the reading sweep.

   (a) CAN IT PASS BEFORE THE WORK? The arranging rows CAN: exactly one
       region while arranging is the SHIPPED invariant from wave 30, and it
       was green at HEAD. THEY ARE DECLARED AS GUARDS, NOT DETECTORS, and
       that is the whole point of them — wave 38 gives the region a SECOND
       call site, and these rows are what say the second site did not break
       the first. The rows that could not pass before the work are in the
       fake-DOM group `G-31`, driven RED at HEAD, seven by name.
   (b) CAN IT PASS ONCE THE WORK IS BROKEN? Yes it can fail: dropping the
       fallback's zero-count guard makes the band append a second region on
       an ordinary arranging day, and `one-region-at-every-k` measures 2.
       That mutation is driven in this plan's SUMMARY.
   (c) WHAT DEGENERATE INPUT SATISFIES IT? Two, and both are closed. A page
       that painted no decoration layer gives five reading-mode zeroes for
       free — closed by `reading-zeroes-are-earned`, which requires the
       arranging sweep on the SAME session to have measured a real region
       first. And a region node rendered at zero size satisfies a pure count
       — closed by `region-box-nonzero-at-every-k`.
   (d) SOURCE READ OR EXECUTION? EXECUTION, on the shipped app in real
       Chrome, after a mode change driven through the SHIPPED controls. The
       one source-shaped row is `refusal-state-is-not-exported`, which reads
       app.js's window-export block — and it is a source question by nature
       (what does this file expose?), stated as such.
   (e) WHAT WOULD MAKE IT VACUOUS LATER? A `--k` that silently stopped
       applying would turn a five-scale sweep into one reading repeated five
       times. Closed by `k-really-applied`, which reads the scene's COMPUTED
       --k back after setting it and skips the round if it did not take, and
       by `measured-count`, which fails if fewer than KS.length rounds
       completed.

   ⚠ AND THE LIMIT, STATED HERE RATHER THAN DISCOVERED LATER: this group
   does NOT measure the REFUSAL state on the real app. It cannot, read-only:
   app.js is a closed IIFE and its window-export block does not carry the
   notebook's refusal state, so the only route to a live refusal is the app's
   own post path — a gesture that posts a day. That is measured by
   `refusal-state-is-not-exported` and the refusal behaviour is driven end to
   end against a FIXTURE day in `G-31` instead. Named, not narrowed. */
async function gate23() {
  const app = await appServer.start();
  let session = null;
  try {
    session = await cdp.launch({ url: app.url });
    /* the room is laid out for a desk window; at the default headless size the
       band rows overlap each other and nothing is pressable. */
    await cdp.send(session, 'Emulation.setDeviceMetricsOverride',
      { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise(function (r) { setTimeout(r, 2500); });

    /* ---- into arranging, through the SHIPPED controls ------------------- */
    await g23Click(session, '#room-obj-notebook');
    await new Promise(function (r) { setTimeout(r, 900); });
    await g23Click(session, '.station-arrange-row');
    const rowText = await cdp.evaluate(session,
      '(document.querySelector(".station-arrange-row")||{}).textContent||""');
    if (String(rowText).indexOf('done') === -1) {
      throw new Error('(G-23) pressing the arrange row did not enter ' +
        'arranging — it still reads ' + JSON.stringify(rowText) + '. Every ' +
        'assertion below would then be measuring the reading view.');
    }

    /* ---- G-27/live-app: 26.91-30 (F-26) — THE REGION ON THE REAL APP ---
       The fake-DOM group proves the PAINTER creates one region while
       arranging and none while reading. This proves it on the shipped app,
       after a REAL mode change driven through the shipped controls — not on
       a page that never entered arranging. */
    const G27_COUNT =
      '(function(){return JSON.stringify([' +
      'document.querySelectorAll(".page-deco-region").length,' +
      'document.querySelectorAll(".page-deco-inkbox").length,' +
      'document.querySelectorAll(".page-deco-canvas").length]);})()';
    const g27Arranging = JSON.parse(await cdp.evaluate(session, G27_COUNT));
    ok(g27Arranging[0] === 1, 'G-27/live-app/one-region-while-arranging',
      'the arranging notebook carries ' + g27Arranging[0] + ' ' +
      '.page-deco-region node(s); expected exactly 1. Zero means the line ' +
      'she asked for is not on the real page at all — "the edge of the ' +
      'page should be visible, otherwise it is too confusing" — and two ' +
      'means the page makes two claims about where a mark may go.');
    ok(g27Arranging[1] === 0, 'G-27/live-app/no-inkbox-without-a-drag',
      'the arranging notebook carries ' + g27Arranging[1] + ' ' +
      '.page-deco-inkbox node(s) with no drag in progress; expected 0. The ' +
      'ink box explains a GESTURE, so a selected mark she is not moving ' +
      'gets none.');
    ok(g27Arranging[2] === 1, 'G-27/live-app/canvas-still-there',
      'and the placement canvas is present exactly once (measured ' +
      g27Arranging[2] + '). POSITIVE CONTROL: without it, the counts above ' +
      'could be taken on a page that painted no decoration layer at all.');

    /* ---- G-31/live-app: 26.91-38 (D-13 / F-26) — READ-ONLY, COUNT-ONLY ---

       WHAT THIS ADDS THAT THE SHIPPED COUNT COULD NOT SAY. The reading above
       is taken at whatever `--k` this session happens to be at. Wave 38 gives
       the region a SECOND call site, and `one-region-while-arranging` is the
       invariant that second site could break — so the count is re-measured
       across the whole pinned `--k` sweep rather than at one scale.

       AND IT IS NOT A COUNT ALONE. A region node that exists but renders at
       zero size is not an outline she can point at, and a pure count passes
       for it. The box is measured at every scale on the same
       "box before colour" discipline (91a) this file already uses, so the
       sweep is a real measurement rather than an invariance check over a
       number that structurally cannot move.

       ⚠ NO GESTURE, NO DRAG, NO POST IS DRIVEN HERE AND NONE MAY BE. Setting
       a CSS custom property and reading counts is the whole of it; the
       original `--k` is restored afterwards so no assertion below inherits
       this block's state.

       ⚠ AND THE LIMIT, MEASURED RATHER THAN GLOSSED: this group does NOT
       assert the region count in the REFUSAL state, and it cannot. See
       `G-31/live-app/refusal-state-is-not-exported` below for the measured
       reason. The refusal state is driven end to end in the fake-DOM group
       `G-31` instead, against a fixture day, which is where it belongs. */
    const G31_AT_K = function (k) {
      return '(function(){var s=document.getElementById("station-scene");' +
        'if(!s)return null;' +
        's.style.setProperty("--k",' + JSON.stringify(String(k)) + ');' +
        'var rs=document.querySelectorAll(".page-deco-region");' +
        'var b=rs.length?rs[0].getBoundingClientRect():null;' +
        'return JSON.stringify([rs.length,b?b.width:0,b?b.height:0,' +
        'String(getComputedStyle(s).getPropertyValue("--k")).trim()]);})()';
    };
    const g31K0 = await cdp.evaluate(session,
      '(function(){var s=document.getElementById("station-scene");' +
      'return s?String(s.style.getPropertyValue("--k")):"";})()');

    let g31Measured = 0;
    const g31Rows = [];
    for (let i = 0; i < KS.length; i++) {
      const k = KS[i];
      const raw = await cdp.evaluate(session, G31_AT_K(k));
      if (!ok(raw, 'G-31/live-app/scene-present',
        'k=' + k + ': there is no #station-scene on the page, so the ' +
        'counts below would be taken on nothing.')) { continue; }
      const m = JSON.parse(raw);
      /* THE SCALE REALLY TOOK. Without this the sweep is five readings at
         one scale wearing five different labels. */
      if (!ok(m[3] === String(k), 'G-31/live-app/k-really-applied',
        'k=' + k + ': the scene\'s computed --k reads ' +
        JSON.stringify(m[3]) + ' after being set. A sweep whose scale never ' +
        'changed is one measurement repeated five times.')) { continue; }
      ok(m[0] === 1, 'G-31/live-app/one-region-at-every-k',
        'k=' + k + ': the arranging notebook carries ' + m[0] + ' ' +
        '.page-deco-region node(s); expected exactly 1 at EVERY pinned ' +
        'scale. 26.91-38 gives the region a second call site (the band\'s ' +
        'refusal fallback), and TWO regions would mean the page makes two ' +
        'claims about where a mark may go. The zero-count guard is what ' +
        'keeps this at 1, and it is guarded here on the real app rather ' +
        'than only in the fake-DOM rig.');
      ok(m[1] > 0 && m[2] > 0, 'G-31/live-app/region-box-nonzero-at-every-k',
        'k=' + k + ': the region\'s box measures ' + m[1] + ' x ' + m[2] +
        ' CSS px; both must be > 0. A node that exists at zero size is not ' +
        'an outline she can point at, and a pure count passes for it — ' +
        'this is the half that makes the sweep a measurement rather than an ' +
        'invariance check over a number that structurally cannot move.');
      g31Rows.push([k, m[0], m[1], m[2]]);
      g31Measured++;
    }
    ok(g31Measured === KS.length, 'G-31/live-app/measured-count',
      'expected ' + KS.length + ' arranging measurement round(s) (one per ' +
      'pinned --k), completed ' + g31Measured + '. A loop that never ran ' +
      'passes every assertion inside it.');
    console.log('  G-31/live-app arranging: ' +
      g31Rows.map(function (r) {
        return 'k=' + r[0] + ' regions=' + r[1] + ' box=' +
          Math.round(r[2]) + 'x' + Math.round(r[3]);
      }).join('  '));
    /* restore the scale this session arrived at, so nothing below inherits
       a scale this block chose. */
    await cdp.evaluate(session,
      '(function(){var s=document.getElementById("station-scene");' +
      'if(s){if(' + JSON.stringify(String(g31K0)) + '){s.style.setProperty(' +
      '"--k",' + JSON.stringify(String(g31K0)) + ');}' +
      'else{s.style.removeProperty("--k");}}return 1;})()');

    /* THE LIMIT, MEASURED. app.js is a closed IIFE whose entire export
       surface is the `window.<name> = <name>` block at its foot. The
       notebook's refusal state is not on that list, so a live gate cannot
       raise a refusal without driving the app's own post path — which this
       group is forbidden to do, and which on the real app would write a
       library. That is the reason the refusal-state rows live in the
       fake-DOM group instead, and it is asserted rather than asserted-about. */
    /* `appSrc` is the module-level read of app.js this file already does. */
    const exported = (appSrc.match(/\n\s*window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/g)
      || []).map(function (s) { return s.trim().slice(7).replace(/\s*=$/, ''); });
    ok(exported.length > 0, 'G-31/live-app/export-list-really-found',
      'POSITIVE CONTROL: the window export block must be findable, or the ' +
      'absence check below is an absence over nothing. Found ' +
      exported.length + ' export(s).');
    const refusalNames = ['nbSaveFailed', 'NB_SAVE_FAILED', 'NB_SAVE_REASON',
      'postDecorations', 'renderNotebookBand', 'nbResetDay'];
    const leaked = refusalNames.filter(function (n) {
      return exported.indexOf(n) !== -1;
    });
    ok(leaked.length === 0, 'G-31/live-app/refusal-state-is-not-exported',
      'app.js exports ' + JSON.stringify(exported) + ' onto window, and ' +
      JSON.stringify(leaked) + ' of the notebook\'s refusal names are among ' +
      'them; expected none. THIS IS THE MEASURED REASON THE REFUSAL STATE ' +
      'IS NOT DRIVEN HERE: with no handle on it from outside, the only way ' +
      'to raise a refusal on the real app is the app\'s own post path — a ' +
      'gesture that posts a day — and this group is deliberately read-only ' +
      'and count-only. The refusal rows are driven end to end against a ' +
      'FIXTURE day in `G-31` (tests/test_blessings_notebook.cjs) instead. ' +
      'Recorded as a limit rather than narrowed away. ⚠ If this ever ' +
      'reddens because a handle was exported, the live group can and should ' +
      'take the refusal reading directly.');

    const disarmed = JSON.parse(await cdp.evaluate(session, G23_PROBE));

    /* NEGATIVE CONTROL, taken BEFORE the prompt can exist: while `write` is
       NOT armed there is no prompt on the page. Without this, "paint the
       prompt unconditionally" would satisfy `prompt-while-armed`. */
    ok(disarmed.prompts === 0, 'G-23/first-tap/prompt-absent-when-disarmed',
      'arranging with `write` DISARMED shows ' + disarmed.prompts + ' prompt ' +
      'node(s); expected 0. The prompt is the armed tool saying what it is ' +
      'for. A prompt that is always on the page says nothing, and would make ' +
      'the armed assertion below satisfiable by a constant.');

    /* ---- ARM `write` ---------------------------------------------------- */
    await g23Click(session, '.station-nb-write');
    const armed = JSON.parse(await cdp.evaluate(session, G23_PROBE));

    /* THE INVARIANT'S GUARD. Already GREEN at HEAD (M-23) and kept anyway —
       it is what stops a later change minting a mark at arm time, which is the
       exact cost she declined when she passed over `arm-opens`. It is NOT the
       assertion this gate was built to redden, and saying so here is what
       keeps the next reader from mistaking it for one. */
    ok(armed.texts === disarmed.texts && armed.inputs === 0,
      'G-23/first-tap/nothing-at-arm-time',
      'arming `write` changed the page: records ' + disarmed.texts + ' -> ' +
      armed.texts + ', inputs ' + armed.inputs + '. Arming must create ' +
      'NOTHING. app.js:12634-12641 records the rule in the app\'s own words ' +
      '— it never mints a mark she did not ask for — and UI-SPEC E5 makes an ' +
      'untyped element a REAL element, so a mark minted here would be litter ' +
      'she has to undo. This is A-20\'s stated reason for choosing ' +
      '`first-tap` over `arm-opens`.');

    /* RED AT HEAD (1 of 2). */
    ok(armed.prompts === 1, 'G-23/first-tap/prompt-while-armed',
      'with `write` armed the page carries ' + armed.prompts + ' prompt ' +
      'node(s); expected exactly 1. F-22 is her report that a user cannot ' +
      'work out how to proceed; the prompt is the half of A-20 that answers ' +
      'it. Measured 0 at HEAD before the fix.');

    ok(armed.promptText === PROMPT_COPY, 'G-23/first-tap/prompt-verbatim',
      'the prompt reads ' + JSON.stringify(armed.promptText) + '; A-20 part ' +
      '2 chose ' + JSON.stringify(PROMPT_COPY) + ' VERBATIM, over `tap the ' +
      'page to write`, over `choose a spot`, and over letting the driver ' +
      'word it. This is pinned BY VALUE rather than lifted from app.js on ' +
      'purpose: a gate that read the string out of the source would go green ' +
      'on a build where her copy had been re-worded.');

    /* LAW 3 AND LAW 4, READ OFF THE SHIPPED STRING rather than off the pin —
       so a future re-wording is checked against the laws, not just against
       A-20. No count, and nothing about what she has not done. */
    /* the non-empty check is part of BOTH law reads, not decoration: an absent
       prompt is an empty string, and an empty string satisfies "contains no
       digit" and "names no absence" for free. Without it these two would go
       green at HEAD, on a build with no prompt at all — a law read that passes
       hardest when the surface it governs does not exist. */
    const shipped = String(armed.promptText || '');
    ok(shipped.length > 0 && !/\d/.test(shipped),
      'G-23/first-tap/prompt-carries-no-count',
      'the prompt ' + JSON.stringify(shipped) + ' is empty or contains a ' +
      'digit. Law 3: reward presence, never punish absence — no count, no ' +
      'tally.');
    ok(shipped.length > 0 &&
      !/\b(no|none|nothing|yet|haven'?t|hasn'?t|still|empty|missing)\b/i
        .test(shipped), 'G-23/first-tap/prompt-carries-no-absence',
      'the prompt ' + JSON.stringify(shipped) + ' is empty or references ' +
      'absence. Law 3: a prompt invites; it never nudges, and it never names ' +
      'what she has not done.');

    /* ---- ONE TAP ON THE PAGE -------------------------------------------- */
    const canvasRaw = await cdp.evaluate(session,
      '(function(){var e=document.querySelector(".page-deco-canvas");' +
      'if(!e)return null;var b=e.getBoundingClientRect();' +
      'return JSON.stringify([b.left+b.width*0.4,b.top+b.height*0.4]);})()');
    if (!canvasRaw) {
      throw new Error('(G-23) there is no `.page-deco-canvas` while `write` ' +
        'is armed, so the tap she was promised has nowhere to land.');
    }
    const cp = JSON.parse(canvasRaw);
    await g23Press(session, cp[0], cp[1]);
    const tapped = JSON.parse(await cdp.evaluate(session, G23_PROBE));

    ok(tapped.texts === armed.texts + 1, 'G-23/first-tap/one-record',
      'the first tap produced ' + (tapped.texts - armed.texts) + ' record(s); ' +
      'expected exactly 1. "Nothing is created until she chooses where" (A-20) ' +
      'means the tap is the choosing, and it makes ONE mark, not two.');

    /* RED AT HEAD (2 of 2) — THE ASSERTION THIS GATE EXISTS FOR. */
    ok(tapped.inputs === 1 && tapped.activeIsInput === true,
      'G-23/first-tap/one-focused-input',
      'after the first tap the page carries ' + tapped.inputs + ' editor ' +
      'input(s) and the focused element ' + (tapped.activeIsInput ? 'is' :
        'is NOT') + ' one. Expected exactly 1, focused. Measured 0 / not ' +
      'focused at HEAD: the editor opened, took focus, and was gone in 0.9 ms ' +
      'because the default action of the `mousedown` that follows the ' +
      'creating `pointerdown` moved focus away and `blur` is wired to ' +
      '`commit`. THIS IS THE ASSERTION THE GATE WAS BUILT TO REDDEN — the ' +
      'arm-time negative above was already green at HEAD and could not be.');

    /* ---- AND TYPING LANDS, WITHOUT A SECOND PRESS ------------------------ */
    await cdp.send(session, 'Input.insertText', { text: 'PROBE' });
    await new Promise(function (r) { setTimeout(r, 300); });
    const typed = JSON.parse(await cdp.evaluate(session, G23_PROBE));

    ok(typed.inputs === 1 && typed.value === 'PROBE',
      'G-23/first-tap/typing-lands',
      'after the first tap, typing produced value ' +
      JSON.stringify(typed.value) + ' across ' + typed.inputs + ' input(s); ' +
      'expected "PROBE" in exactly 1. This is the whole of F-22 in one ' +
      'reading: *the first tap goes straight into typing* (A-20). Measured ' +
      'null at HEAD — the text went nowhere, and while `write` was armed ' +
      'there was NO route to typing at all, because plan 20\'s widened ' +
      '`attachPageDrag` guard also stopped a placed box reopening.');

    /* ---- G-28/live-app: 26.91-35 (F-28) — COUNT-ONLY, READ-ONLY --------
       ⚠ NO GESTURE IS DRIVEN HERE AND NONE MAY BE. A drag posts the day, and
       on the real app that writes a library. This harness serves a SYNTHETIC
       library built from nothing in a fresh temp dir (see
       tests/lib/app-server.cjs) so the owner's own store is unreachable by
       construction — and even so, the shipped `G-27/live-app` shape is
       count-only and this extension keeps it.

       WHAT IT ADDS THAT THE SHIPPED COUNT COULD NOT SAY. The arranging count
       above is taken on a page carrying ZERO marks, so "zero ink boxes" is
       true there for a second, weaker reason: there is nothing to press. This
       reading is taken after the first tap has minted a real mark, so the
       zero is about the GESTURE and not about an empty page. */
    const G28_COUNT =
      '(function(){return JSON.stringify([' +
      'document.querySelectorAll(".page-deco-inkbox").length,' +
      'document.querySelectorAll(".page-deco").length]);})()';
    const g28Marked = JSON.parse(await cdp.evaluate(session, G28_COUNT));
    ok(g28Marked[1] > 0, 'G-28/live-app/a-mark-is-on-the-page',
      'the arranging notebook carries ' + g28Marked[1] + ' .page-deco ' +
      'node(s) after the first tap; expected at least 1. POSITIVE CONTROL ' +
      'for the assertion below: without it, "zero ink boxes" would be ' +
      'satisfied by a page that painted no marks at all.');
    ok(g28Marked[0] === 0, 'G-28/live-app/no-inkbox-with-a-mark-and-no-drag',
      'with ' + g28Marked[1] + ' mark(s) on the arranging page and NO drag ' +
      'in progress, the page carries ' + g28Marked[0] + ' ' +
      '.page-deco-inkbox node(s); expected 0. UI-SPEC `empty | E8` binds ' +
      'unchanged through F-28: the ink box is an ARRANGING-mode, ' +
      'GESTURE-scoped affordance. Giving it the mark\'s transform did not ' +
      'give it a longer life.');

    /* ---- G-27/live-app: LEAVE ARRANGING, THROUGH THE SHIPPED CONTROL ----
       Measured AFTER a real mode change and with every handle RE-QUERIED,
       because a count taken on a page that never entered arranging proves
       nothing about law 4. Run LAST so no assertion above is taken on a
       page this step has touched. */
    /* DISARM `write` and commit the live editor FIRST. The tap above left
       an <input> focused and the tool armed; both are mode state, and a
       press on the arrange row while they are up is swallowed. Measured, not
       assumed: without this the row still read "done arranging" after the
       press. */
    await g23Click(session, '.station-nb-write');
    await new Promise(function (r) { setTimeout(r, 400); });
    await cdp.evaluate(session,
      '(function(){var i=document.querySelector(".page-deco-input");' +
      'if(i&&i.blur)i.blur();return 1;})()');
    await new Promise(function (r) { setTimeout(r, 600); });
    await g23Click(session, '.station-arrange-row');
    await new Promise(function (r) { setTimeout(r, 900); });
    const backText = await cdp.evaluate(session,
      '(document.querySelector(".station-arrange-row")||{}).textContent||""');
    if (String(backText).indexOf('done') !== -1) {
      throw new Error('(G-27/live-app) pressing the arrange row did not ' +
        'LEAVE arranging — it still reads ' + JSON.stringify(backText) +
        '. The reading-mode counts below would then be a second reading of ' +
        'the arranging page.');
    }
    const g27Reading = JSON.parse(await cdp.evaluate(session, G27_COUNT));
    ok(g27Reading[0] === 0 && g27Reading[1] === 0,
      'G-27/live-app/reading-mode-carries-none',
      'after a REAL mode change back to reading the page carries ' +
      g27Reading[0] + ' region node(s) and ' + g27Reading[1] + ' ink-box ' +
      'node(s); both must be 0. Law 4: the region is chrome BESIDE her ' +
      'marks in arranging mode only, and reading mode is byte-identical to ' +
      'what it was before F-26 was answered.');

    /* ---- G-31/live-app: READING MODE, AT EVERY PINNED --k ---------------
       UI-SPEC `empty | E8` sets the arranging-only boundary, and 26.91-38
       binds the NEW call site by it exactly as it binds the original: a page
       she has not decorated must not acquire a box in reading mode, at any
       scale. renderNotebookBand returns at `if (!NBDESIGN)` before the
       fallback can be reached — this is that claim measured on the real app
       rather than read off the source. */
    let g31ReadMeasured = 0;
    const g31ReadRows = [];
    for (let i = 0; i < KS.length; i++) {
      const k = KS[i];
      const raw = await cdp.evaluate(session, G31_AT_K(k));
      if (!ok(raw, 'G-31/live-app/scene-present-reading',
        'k=' + k + ': there is no #station-scene, so the zero below would ' +
        'be a zero over nothing.')) { continue; }
      const m = JSON.parse(raw);
      if (!ok(m[3] === String(k), 'G-31/live-app/k-really-applied-reading',
        'k=' + k + ': the scene\'s computed --k reads ' +
        JSON.stringify(m[3]) + ' after being set.')) { continue; }
      ok(m[0] === 0, 'G-31/live-app/reading-mode-none-at-every-k',
        'k=' + k + ': after a REAL mode change back to reading the page ' +
        'carries ' + m[0] + ' region node(s); expected 0 at EVERY pinned ' +
        'scale. The outline is arranging-mode chrome and the refusal ' +
        'fallback does not change that — it sits INSIDE renderNotebookBand, ' +
        'which returns on !NBDESIGN before reaching it.');
      g31ReadRows.push([k, m[0]]);
      g31ReadMeasured++;
    }
    ok(g31ReadMeasured === KS.length, 'G-31/live-app/measured-count-reading',
      'expected ' + KS.length + ' reading-mode measurement round(s) (one ' +
      'per pinned --k), completed ' + g31ReadMeasured + '. A loop that ' +
      'never ran passes every assertion inside it.');
    console.log('  G-31/live-app reading:   ' +
      g31ReadRows.map(function (r) {
        return 'k=' + r[0] + ' regions=' + r[1];
      }).join('  '));
    /* POSITIVE CONTROL FOR THE WHOLE READING SWEEP. Five zeroes are also
       what a page that painted nothing at all would give, so the arranging
       sweep above having measured a NON-ZERO count on this same session is
       what makes these zeroes mean something. Asserted by value rather than
       left to the reader to notice. */
    ok(g31Measured === KS.length, 'G-31/live-app/reading-zeroes-are-earned',
      'the arranging sweep completed ' + g31Measured + ' of ' + KS.length +
      ' rounds on this same session, each measuring exactly one region on a ' +
      'non-zero box. Without that, the ' + g31ReadMeasured + ' reading-mode ' +
      'zeroes above would be equally satisfied by a page that never painted ' +
      'a decoration layer at all — which is the degenerate this whole ' +
      'reading half has to close.');
  } finally {
    if (session) { await cdp.close(session); }
    await app.stop();
  }
}

/* ---- 26.996-08: THE PRIVACY LIST — roster read, empty rows, one renderer -
   Sync gate: no browser required. The roster is read from server.py at test
   time; it is never restated as literals in this block. */
function loadOnDeviceDisclosureRoster() {
  const out = execSync(
    'python3 -c "import server, json; print(json.dumps(' +
    '[r[\\"job\\"] for r in server.ON_DEVICE_DISCLOSURE_ROWS]))"',
    { cwd: REPO_ROOT, encoding: 'utf8' });
  return JSON.parse(out.trim());
}

function runDisclosurePrivacyGate() {
  console.log('(08) privacy list — roster read, empty rows, one renderer');
  const rowFn = extractFn(appSrc, 'renderDisclosureJobRow');
  const hostFn = extractFn(appSrc, 'renderJobDisclosure');
  const escFn = extractFn(coreSrc, 'escapeHtml');
  const renderRow = new Function(
    escFn + '\n' + rowFn + '\nreturn renderDisclosureJobRow;')();
  const roster = loadOnDeviceDisclosureRoster();
  ok(Array.isArray(roster) && roster.length === 3,
    '08/roster-length',
    'ON_DEVICE_DISCLOSURE_ROWS has length 3 by value; got ' + roster.length);

  const shipped = 'Photo-reading is built inside the Apple Vision, which ' +
    'means no tokens will be consumed';
  const preRebuild = [{ words: shipped }];
  const withEmpty = [
    { words: shipped },
    { job: roster[1], words: '' },
    { job: roster[2], words: '' }
  ];
  const oldHtml = preRebuild.map(renderRow).join('');
  const newHtml = withEmpty.map(renderRow).join('');
  ok(oldHtml === newHtml && oldHtml !== '',
    '08/byte-identical-empty-rows',
    'two empty non-model rows must paint nothing — any extra node fails');

  ok(hostFn.indexOf('.concat(deviceRows).map(renderDisclosureJobRow)') !== -1,
    '08/one-row-renderer',
    'exactly one row-rendering function must serve both halves');

  ok(hostFn.indexOf('Non-model rows render AFTER') !== -1,
    '08/ordering-once',
    'derived rows first, non-model after — stated in one place');

  const filled = roster.map(function (job) {
    return { job: job, words: 'fixture-' + job };
  });
  const filledHtml = filled.map(renderRow).join('');
  roster.forEach(function (job) {
    ok(filledHtml.indexOf('fixture-' + job) !== -1,
      '08/roster-member-' + job,
      'roster member ' + job + ' must appear the moment it has words');
  });

  const partial = filled.slice(0, 2);
  const missing = roster.find(function (job) {
    return partial.every(function (row) { return row.job !== job; });
  });
  ok(typeof missing === 'string',
    '08/roster-drill-control',
    'the drill needs a roster member absent from a partial fixture');
  ok(partial.map(renderRow).join('').indexOf('fixture-' + missing) === -1,
    '08/roster-drill-red',
    'a roster member with words must not render when absent from fixture');

  const markupRow = { words: '<b>on-device</b>', name: 'x' };
  const markupHtml = renderRow(markupRow);
  ok(markupHtml.indexOf('<b>') === -1 && markupHtml.indexOf('&lt;b&gt;') !== -1,
    '08/escaped-markup',
    'row words pass through escapeHtml');
}

function loadSubjectSignpost() {
  const out = execSync(
    'python3 -c "import server, json; print(json.dumps(' +
    'server.SUBJECT_WORDS[\\"signpost\\"]))"',
    { cwd: REPO_ROOT, encoding: 'utf8' });
  return JSON.parse(out.trim());
}

function runForNowForeverLabelGate() {
  console.log('(09) for-now vs forever — Manage labels and signpost');
  const declAt = appSrc.indexOf('var MANAGE_PANES');
  ok(declAt !== -1, '09/panes-exist', 'MANAGE_PANES must exist');
  const seg = appSrc.slice(declAt, declAt + 6000);
  const forNow = 'Set aside, for now';
  const forever = 'You put these away for good';
  ok(seg.indexOf("label: '" + forNow + "'") !== -1,
    '09/for-now-label',
    'subjects pane must read her #121 ruling verbatim');
  ok(seg.indexOf("label: '" + forever + "'") !== -1,
    '09/forever-label',
    'never pane must read her #121 r6 ruling verbatim');
  ok(forNow !== forever, '09/distinct', 'the two list names must differ');
  const signpost = loadSubjectSignpost();
  ok(signpost.indexOf(forNow) !== -1,
    '09/signpost-names-pane',
    '§ H signpost must name the same pane the rail shows');
  ok(signpost.indexOf('never show') === -1,
    '09/signpost-not-forever',
    'signpost must not use the old forever rail wording');
}

async function main() {
  runDisclosurePrivacyGate();
  if (FAILED > 0) return;
  runForNowForeverLabelGate();
  if (FAILED > 0) return;
  /* The sweep shape is asserted BEFORE anything renders. A shortened sweep
     must be a failure, not a shorter pass. */
  ok(KS.length === 5, '91a/ks-pinned',
    'the --k sweep is pinned BY VALUE at [1,2,3,4,5]; KS.length is ' +
    KS.length + ', not 5. A silently shortened sweep is a failure, not a ' +
    'shorter pass.');
  ok(PROBES.length === PROBE_COUNT, '91a/probes-pinned',
    'the probe table holds ' + PROBES.length + ' probe(s), pinned BY VALUE ' +
    'at ' + PROBE_COUNT + '. Comparing the table to itself would let a ' +
    'vanished probe lower both sides and still pass.');
  ok(probeByRole('raised').length === 2 && probeByRole('disabled').length === 1,
    '91a/roles-pinned',
    'expected 2 raised probes and 1 disabled probe, got ' +
    probeByRole('raised').length + ' and ' + probeByRole('disabled').length +
    '. The enabled path must not be the only path measured.');
  if (FAILED > 0) return;

  /* Measure every `--k` first, then assert. Measurement is data collection;
     the ORDER THAT MATTERS is the order of the assertions below (count, then
     box, then colour), which is what the M4 mutation demonstrated. */
  const runs = [];
  for (let i = 0; i < KS.length; i++) {
    runs.push({ k: KS[i], data: await measureAt(KS[i]) });
  }

  let nodesMeasured = 0;

  /* ---- (91a) THE LIVE COMPUTED-STYLE TIN FILL (UI-SPEC G-C1b) ----------- */
  console.log('(91a) live computed style — the tin has a fill');

  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.styles;
    const S = m.serial;

    /* EMPTY FIRST. The node count is pinned BY VALUE and asserted BEFORE any
       style is read: a blank page yields zero nodes and fails HERE, rather
       than passing vacuously through a loop that never runs. */
    if (!ok(m.count === PROBE_COUNT, '91a/node-count',
      'k=' + k + ': expected exactly ' + PROBE_COUNT + ' node(s) matching ' +
      '[data-probe] (' + PROBES.map(function (p) { return p.name; }).join(', ') +
      '), measured ' + m.count + '. The selector ".station-tin" carries ' +
      'data-probe="tin-enabled".')) {
      continue;
    }

    const p = PROBES[0]; // tin-enabled, resolved by name below
    const n = m.nodes['tin-enabled'];

    if (!ok(n, '91a/node-present',
      'k=' + k + ': no node resolved for [data-probe="tin-enabled"].')) {
      continue;
    }

    /* BOX BEFORE COLOUR, DELIBERATELY. An unrendered node satisfies a
       transparency test trivially, so a zero-size box must trip HERE and
       not on the fill assertion below. */
    if (!ok(n.clientWidth > 0 && n.clientHeight > 0, '91a/box-nonzero',
      'k=' + k + ' [tin-enabled]: clientWidth=' + n.clientWidth +
      ' clientHeight=' + n.clientHeight + '; both must be > 0 before any ' +
      'colour is judged, because an unrendered node passes a transparency ' +
      'test trivially.')) {
      continue;
    }

    ok(n.backgroundImage !== S.noImage || n.backgroundColor !== S.transparent,
      '91a/tin-background-filled',
      'k=' + k + ' [tin-enabled]: THE TIN HAS NO FILL. computed ' +
      'background-image=' + JSON.stringify(n.backgroundImage) +
      ' and background-color=' + JSON.stringify(n.backgroundColor) +
      ', which are exactly this run\'s live serializations of "none" (' +
      JSON.stringify(S.noImage) + ') and "transparent" (' +
      JSON.stringify(S.transparent) + '). A raised key must have a ' +
      'non-transparent background; a bordered empty box is F-6\'s ' +
      '"empty-looking outline".');

    /* OPACITY, against this run's OWN serialization of the initial value
       (read off <html>), never a hand-typed '1'. A control at opacity 0 is
       not findable, and a filled box at opacity 0 passes the fill test. */
    ok(n.opacity === S.opaque, '91a/tin-opacity-enabled',
      'k=' + k + ' [tin-enabled]: computed opacity=' +
      JSON.stringify(n.opacity) + ', expected this run\'s live ' +
      'serialization of the initial value (' + JSON.stringify(S.opaque) +
      '). An enabled band control must be fully opaque.');

    /* SCALE. `offsetWidth`, not `clientWidth`: `.station-tin` is
       border-box with a 1px ink rim, so clientWidth EXCLUDES that rim and
       recovers 30 scene px, not 32. offsetWidth is the border box and
       recovers the pinned width exactly. (Recorded as a deviation — the
       plan's letter said clientWidth; the live measurement says otherwise,
       and the measurement wins.) */
    ok(Math.abs(n.offsetWidth - p.w * k) <= EPS &&
      Math.round(n.offsetWidth / k) === p.w,
      '91a/scale-width',
      'k=' + k + ' [tin-enabled]: offsetWidth=' + n.offsetWidth +
      ' recovers ' + Math.round(n.offsetWidth / k) + ' scene px, pinned ' +
      p.w + ' (allowance EPS=' + EPS + ' CSS px for subpixel layout).');

    ok(Math.abs(n.offsetHeight - p.h * k) <= EPS &&
      Math.round(n.offsetHeight / k) === p.h,
      '91a/scale-height',
      'k=' + k + ' [tin-enabled]: offsetHeight=' + n.offsetHeight +
      ' recovers ' + Math.round(n.offsetHeight / k) + ' scene px, pinned ' +
      p.h + ' (allowance EPS=' + EPS + ' CSS px for subpixel layout).');
  }

  /* ---- (91b) THE RAISED-KEY CONTRACT + THE DISABLED TREATMENT ------------
     26.91-UI-SPEC "The raised-key contract": a word that renders at zero size,
     at opacity 0, or on an unfilled box is still not findable. All four
     properties are asserted as SEPARATE NAMED assertions so a break lands on
     the property that broke. */
  console.log('(91b) the raised-key contract, the disabled treatment, the ring');

  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.styles;
    const f = runs[i].data.focus;
    const S = m.serial;

    if (m.count !== PROBE_COUNT) continue; // already failed in (91a)

    /* --- the raised keys --- */
    const raised = probeByRole('raised');
    for (let j = 0; j < raised.length; j++) {
      const p = raised[j];
      const n = m.nodes[p.name];
      if (!ok(n, '91b/node-present',
        'k=' + k + ': no node resolved for [data-probe="' + p.name + '"].')) {
        continue;
      }
      nodesMeasured++;

      if (!ok(n.clientWidth > 0 && n.clientHeight > 0, '91b/raised-box-nonzero',
        'k=' + k + ' [' + p.name + ']: clientWidth=' + n.clientWidth +
        ' clientHeight=' + n.clientHeight + '; a control with no box is not ' +
        'findable however it is coloured.')) {
        continue;
      }

      ok(n.backgroundImage !== S.noImage || n.backgroundColor !== S.transparent,
        '91b/raised-background',
        'k=' + k + ' [' + p.name + ']: raised-key property 1 (non-transparent ' +
        'background) FAILS. background-image=' +
        JSON.stringify(n.backgroundImage) + ' background-color=' +
        JSON.stringify(n.backgroundColor) + ' against this run\'s live ' +
        'serializations ' + JSON.stringify(S.noImage) + ' / ' +
        JSON.stringify(S.transparent) + '.');

      const sides = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
        'borderLeftWidth'];
      for (let s = 0; s < sides.length; s++) {
        ok(parseFloat(n[sides[s]]) > 0, '91b/raised-border-' + sides[s],
          'k=' + k + ' [' + p.name + ']: raised-key property 2 FAILS — ' +
          sides[s] + '=' + JSON.stringify(n[sides[s]]) + ', must parse > 0 ' +
          'on all four sides.');
      }

      ok(n.opacity === S.opaque, '91b/raised-opacity',
        'k=' + k + ' [' + p.name + ']: raised-key property 3 FAILS — ' +
        'computed opacity=' + JSON.stringify(n.opacity) + ', expected this ' +
        'run\'s live initial value ' + JSON.stringify(S.opaque) + '.');

      ok(Math.abs(n.offsetWidth - p.w * k) <= EPS &&
        Math.round(n.offsetWidth / k) === p.w,
        '91b/raised-scale',
        'k=' + k + ' [' + p.name + ']: raised-key property 4 FAILS — ' +
        'offsetWidth=' + n.offsetWidth + ' recovers ' +
        Math.round(n.offsetWidth / k) + ' scene px, pinned ' + p.w +
        ' (allowance EPS=' + EPS + ' CSS px for subpixel layout).');
    }

    /* --- the disabled treatment, measured SEPARATELY (partial/E2) --- */
    const dis = probeByRole('disabled');
    for (let j = 0; j < dis.length; j++) {
      const p = dis[j];
      const n = m.nodes[p.name];
      if (!ok(n, '91b/disabled-present',
        'k=' + k + ': no node resolved for [data-probe="' + p.name + '"].')) {
        continue;
      }
      nodesMeasured++;

      ok(n.opacity === DISABLED_OPACITY, '91b/disabled-opacity',
        'k=' + k + ' [' + p.name + ']: computed opacity=' +
        JSON.stringify(n.opacity) + ', pinned at exactly ' +
        JSON.stringify(DISABLED_OPACITY) + ' — the shipped .btn:disabled ' +
        'value .station-nb-off reuses. DISABLED, NEVER HIDDEN: hiding would ' +
        'change the band\'s control count and move the reset and exit ' +
        'targets under her finger.');

      ok(n.pointerEvents === DISABLED_POINTER_EVENTS,
        '91b/disabled-pointer-events',
        'k=' + k + ' [' + p.name + ']: computed pointer-events=' +
        JSON.stringify(n.pointerEvents) + ', pinned at ' +
        JSON.stringify(DISABLED_POINTER_EVENTS) + '.');

      ok(n.clientWidth > 0 && n.clientHeight > 0, '91b/disabled-still-boxed',
        'k=' + k + ' [' + p.name + ']: clientWidth=' + n.clientWidth +
        ' clientHeight=' + n.clientHeight + '; a disabled control keeps its ' +
        'box — that is what "disabled, never hidden" means.');
    }

    /* --- the focus ring, and the accent budget --- */
    ok(f.count === FOCUSABLE_COUNT, '91b/focusable-count',
      'k=' + k + ': expected exactly ' + FOCUSABLE_COUNT + ' node(s) ' +
      'matching [data-focus], measured ' + f.count + '. Pinned BY VALUE so a ' +
      'vanished focus probe cannot lower both sides of an equality.');

    /* THE ANTI-VACUITY GUARD FOR THE PAIR BELOW: if --ink and --accent ever
       resolved to the same colour, "is ink AND is not accent" would be
       unsatisfiable, and if the accent read came back empty the "not accent"
       half would pass against anything. Both are checked before either is
       used as evidence. */
    ok(f.ink && f.accent && f.ink !== f.accent, '91b/tokens-distinct',
      'k=' + k + ': the live --ink (' + JSON.stringify(f.inkRaw) + ' -> ' +
      JSON.stringify(f.ink) + ') and --accent (' +
      JSON.stringify(f.accentRaw) + ' -> ' + JSON.stringify(f.accent) +
      ') must both resolve and must differ, or the accent-budget assertion ' +
      'below measures nothing.');

    const focusable = PROBES.filter(function (p) { return p.focusable; });
    for (let j = 0; j < focusable.length; j++) {
      const p = focusable[j];
      const fn = f.nodes[p.name];
      if (!ok(fn, '91b/focus-node-present',
        'k=' + k + ': no node resolved for [data-focus="' + p.name + '"].')) {
        continue;
      }

      if (!ok(fn.isActive && fn.focusVisible, '91b/focus-visible-matches',
        'k=' + k + ' [' + p.name + ']: the node did not enter the ' +
        ':focus-visible state (activeElement=' + fn.isActive +
        ', matches=' + fn.focusVisible + '), so nothing below is a ' +
        'measurement of the ring.')) {
        continue;
      }

      ok(fn.outlineStyle === 'solid', '91b/focus-ring-drawn',
        'k=' + k + ' [' + p.name + ']: computed outline-style=' +
        JSON.stringify(fn.outlineStyle) + ', expected "solid". The two ' +
        'shipped band text rows had NO focus ring at all before 26.91.');

      /* THE NEW RULE MUST WIN. Both `.station-tin:focus-visible` rules carry
         the same specificity, so source order decides; a ring that measured
         1px would mean the 26.91 rule landed ABOVE the shipped one and is
         being overridden. */
      ok(fn.outlineWidth === (2 * k) + 'px', '91b/focus-ring-scales',
        'k=' + k + ' [' + p.name + ']: computed outline-width=' +
        JSON.stringify(fn.outlineWidth) + ', expected ' +
        JSON.stringify((2 * k) + 'px') + ' from calc(2px * var(--k)). A ' +
        '1px reading means the 26.91 rule sits ABOVE the shipped ' +
        '.station-tin:focus-visible and loses the cascade.');

      ok(fn.outlineColor === f.ink, '91b/focus-ring-is-ink',
        'k=' + k + ' [' + p.name + ']: computed outline-color=' +
        JSON.stringify(fn.outlineColor) + ', expected the live --ink value ' +
        JSON.stringify(f.ink) + ' read off :root in this same run.');

      ok(fn.outlineColor !== f.accent, '91b/focus-ring-not-accent',
        'k=' + k + ' [' + p.name + ']: computed outline-color=' +
        JSON.stringify(fn.outlineColor) + ' EQUALS the live --accent value ' +
        JSON.stringify(f.accent) + '. The accent list is closed at two ' +
        'entries and a band control is on neither (26.9-05, 26.88-04).');
    }
  }

  console.log('NODES=' + nodesMeasured + ' KS=' + KS.length);

  /* ---- (91e) G-C5 — THE MEASURED LABEL FIT ------------------------------
     WHY THE `Range`, AND WHY NOT `scrollWidth`. The band rows are
     `display: flex; justify-content: center` and each label is a BARE TEXT
     NODE, so it becomes an anonymous flex item with `min-width: auto` and
     will not shrink. Every new label is a single unwrappable word. An
     over-wide label therefore overflows SYMMETRICALLY, and in LTR
     `scrollWidth` does not report overflow past the START edge — so
     `scrollWidth <= clientWidth` can hold while the label is visibly
     clipped at BOTH ends, with assertions 1, 2 and 4 all passing in exactly
     that state. That is this phase's named defect class landing inside the
     instrument built to catch it. It is not "simplified" back; the arming
     block below records `scrollWidth` GREEN on a state where the Range is
     RED, so the replacement is evidenced rather than preferred.

     WHY THE CONTENT BOX, AND NOT `clientWidth`. On a border-box element
     `clientWidth` excludes the border but INCLUDES the padding. The band
     rows budget against the `w - 8` CONTENT box, so a label needing `w - 4`
     renders INTO the horizontal padding, violates the shipped budget, and
     leaves a `clientWidth`-budgeted gate GREEN over a window `6*k` px wide.
     Same defect class as the `scrollWidth` form, arriving by a different
     route — and it matters more here than the arithmetic being separately
     right upstream, because THIS GATE EXISTS PRECISELY TO BE THE THING THAT
     DOES NOT DEPEND ON THE ARITHMETIC BEING RIGHT.

     THE ANTI-VACUITY AUDIT:
       (a) before the work? No — five of these eight labels did not exist
           before 26.91-02; assertion 1 fails on their absence.
       (b) once broken? No — driven on three planted states (gross overflow,
           in-band overflow, collapsed Range) and one source mutation
           (a pinned `w` shrunk by 4), each red on its own assertion.
       (c) degenerate? Assertion 2 exists solely for the unrendered node,
           which has every metric at 0 and satisfies 3 trivially; the
           collapsed-Range guard closes the empty-label form.
       (d) evaluation or source order? EVALUATION — every number is measured
           on a live page over the shipped stylesheet and the vendored font.
  */
  console.log('(91e) the measured label fit — CONTENT box, live padding');

  ok(BAND.length === BAND_COUNT, '91e/band-pinned',
    'the band probe table holds ' + BAND.length + ' control(s), pinned BY ' +
    'VALUE at ' + BAND_COUNT + '. Comparing the table to itself would let a ' +
    'vanished control lower both sides and still pass.');

  /* the lift itself must have produced real strings, asserted BEFORE they
     are used as expected values — an empty label would make assertion 1
     compare '' to '' and pass while measuring nothing. */
  BAND.forEach(function (c) {
    ok(typeof c.label === 'string' && c.label.length >= 3, '91e/label-lifted',
      '[' + c.name + ']: the label lifted from app.js is ' +
      JSON.stringify(c.label) + '. Every expected string in this group is ' +
      'READ OUT OF THE PAINTER that writes it; a lift that silently yielded ' +
      'an empty string would make assertion 1 vacuous.');
  });

  /* THE LIFT MEETS THE INDEPENDENT PIN. This is the assertion a slot change
     or a copy rewrite in app.js actually trips — the rendered-box assertions
     below cannot, because the harness builds those nodes FROM the lift. */
  ok(Object.keys(EXPECTED_W).length === BAND_COUNT &&
     Object.keys(EXPECTED_LABEL).length === BAND_COUNT, '91e/pins-complete',
    'the by-value width and label tables must each hold exactly ' +
    BAND_COUNT + ' entries; found ' + Object.keys(EXPECTED_W).length +
    ' and ' + Object.keys(EXPECTED_LABEL).length + '.');
  BAND.forEach(function (c) {
    ok(c.slot.w === EXPECTED_W[c.name], '91e/slot-pinned',
      '[' + c.name + ']: app.js declares w=' + c.slot.w + '; this gate pins ' +
      'it BY VALUE at ' + EXPECTED_W[c.name] + '. This is a SECOND, ' +
      'INDEPENDENT copy of the geometry and it is the ONLY assertion here ' +
      'that a slot change can trip: the rendered-box assertions build their ' +
      'nodes from the lifted slot, so both sides move together (mutation ' +
      'M-R3 proved exactly that — it exited 0). If you meant to move this ' +
      'width, move this line in the same commit. `marks` (32) may NOT be ' +
      'narrowed, and `reset` (76) is not on the recovery ladder.');
    ok(c.label === EXPECTED_LABEL[c.name], '91e/label-pinned',
      '[' + c.name + ']: app.js paints ' + JSON.stringify(c.label) +
      '; this gate pins it BY VALUE at ' +
      JSON.stringify(EXPECTED_LABEL[c.name]) + '. Same reasoning as the ' +
      'width pin: the harness writes the string it then asserts, so only an ' +
      'independent copy can notice a rename (mutation M-R2 changed the tin\'s ' +
      'label and assertion 1 stayed green). These are the words the owner ' +
      'could not find; a silent rewrite of one is exactly the change that ' +
      'should require a deliberate edit here.');
  });

  let fitMeasured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const b = runs[i].data.band;

    if (!ok(b.count === BAND_COUNT, '91e/band-count',
      'k=' + k + ': expected exactly ' + BAND_COUNT + ' node(s) matching ' +
      '[data-band], measured ' + b.count + '. Asserted before any geometry ' +
      'is read, so a blank page fails HERE rather than passing vacuously ' +
      'through a loop that never runs.')) {
      continue;
    }

    for (let j = 0; j < BAND.length; j++) {
      const c = BAND[j];
      const n = b.nodes[c.name];
      if (!ok(n, '91e/band-present',
        'k=' + k + ': no node resolved for [data-band="' + c.name + '"].')) {
        continue;
      }

      /* --- 1: the label itself --- */
      ok(n.text === c.label, '91e/label-text',
        'k=' + k + ' [' + c.name + ']: textContent=' +
        JSON.stringify(n.text) + ', expected ' + JSON.stringify(c.label) +
        ' lifted from app.js. Catches a rename, a truncation upstream, or a ' +
        'placeholder that never got replaced.');

      /* --- 2: the degenerate pass --- */
      if (!ok(n.clientWidth > 0 && n.clientHeight > 0, '91e/box-nonzero',
        'k=' + k + ' [' + c.name + ']: clientWidth=' + n.clientWidth +
        ' clientHeight=' + n.clientHeight + '. An unrendered node has every ' +
        'metric at 0 and satisfies the fit assertion trivially, so this must ' +
        'trip first.')) {
        continue;
      }

      /* --- 3: the TEXT's own box against the CONTENT box --- */
      const pads = [n.padL, n.padR, n.padT, n.padB];
      if (!ok(pads.every(function (v) { return Number.isFinite(v); }),
        '91e/padding-finite',
        'k=' + k + ' [' + c.name + ']: getComputedStyle returned a padding ' +
        'that does not parse — [' + pads.join(', ') + ']. A miss yields NaN, ' +
        'every comparison against NaN is false, and the fit assertion below ' +
        'would then fail closed with an unreadable message instead of ' +
        'naming what went wrong.')) {
        continue;
      }

      if (!ok(n.boxWidth > 0 && n.boxHeight > 0, '91e/range-nonzero',
        'k=' + k + ' [' + c.name + ']: the Range over this node\'s contents ' +
        'measured ' + n.boxWidth + 'x' + n.boxHeight + '. A COLLAPSED Range ' +
        'has zero width and satisfies every <= bound trivially — this guard ' +
        'is what stops an empty label passing the fit assertion below.')) {
        continue;
      }

      const boundW = n.clientWidth - n.padL - n.padR;
      const boundH = n.clientHeight - n.padT - n.padB;
      ok(n.boxWidth <= boundW + EPS, '91e/fit-width',
        'k=' + k + ' [' + c.name + '] ' + JSON.stringify(n.text) +
        ': THE LABEL DOES NOT FIT ITS CONTENT BOX. text box.width=' +
        n.boxWidth + ', clientWidth (the PADDING box)=' + n.clientWidth +
        ', padding L/R=' + n.padL + '/' + n.padR + ', CONTENT bound=' +
        boundW + ' (+EPS=' + EPS + ' CSS px, the subpixel-layout ' +
        'allowance). The budget is the CONTENT box: clientWidth includes ' +
        'the padding, and budgeting against it would leave ' +
        (n.padL + n.padR) + ' px of the shipped budget unmeasured. ' +
        'box-sizing=' + JSON.stringify(n.boxSizing) + '.');

      ok(n.boxHeight <= boundH + EPS, '91e/fit-height',
        'k=' + k + ' [' + c.name + ']: text box.height=' + n.boxHeight +
        ', content bound=' + boundH + ' (+EPS=' + EPS + ').');

      /* --- 4: the BOX pinned to its slot ---
         `offsetWidth`, NOT `clientWidth`. This is the correction the live
         measurement forced in 26.91-01 and forced again in 26.91-02, and
         the UI-SPEC's raised-key contract property 4 has now been fixed at
         source to match: `.station-tin` is border-box with a 1px rim, so
         clientWidth recovers 30 at k=1, not the pinned 32. offsetWidth IS
         the border box and recovers `w` exactly.

         3 AND 4 ARE INDEPENDENT AND NEITHER IMPLIES THE OTHER: 4 pins the
         BOX to its slot, 3 pins the TEXT inside that box's content area. A
         label that overflows a correctly-sized box reddens 3 and not 4
         (driven: arming 1); a slot quietly shrunk reddens 4. */
      ok(Math.round(n.offsetWidth / k) === c.slot.w, '91e/slot-width',
        'k=' + k + ' [' + c.name + ']: offsetWidth=' + n.offsetWidth +
        ' recovers ' + Math.round(n.offsetWidth / k) + ' scene px, pinned ' +
        c.slot.w + ' from the real slot declaration. offsetWidth (the ' +
        'BORDER box), never clientWidth (the PADDING box), is what recovers ' +
        'the pinned width.');
      ok(Math.round(n.offsetHeight / k) === BAND_HEIGHT, '91e/slot-height',
        'k=' + k + ' [' + c.name + ']: offsetHeight=' + n.offsetHeight +
        ' recovers ' + Math.round(n.offsetHeight / k) + ' scene px, pinned ' +
        BAND_HEIGHT + ' — the band\'s one baseline height.');

      fitMeasured++;
      /* the three numbers, printed so a future reader can SEE which bound
         was used rather than infer it from the source. */
      console.log('  91e k=' + k + ' ' + c.name + ' box=' +
        n.boxWidth.toFixed(2) + ' client=' + n.clientWidth + ' content=' +
        boundW.toFixed(2) + ' margin=' + (boundW - n.boxWidth).toFixed(2));
    }
  }

  console.log('FIT_MEASURED=' + fitMeasured);
  ok(fitMeasured === BAND_COUNT * KS.length, '91e/fit-count',
    'expected ' + (BAND_COUNT * KS.length) + ' fit measurements (' +
    BAND_COUNT + ' controls x ' + KS.length + ' scales), completed ' +
    fitMeasured + '. Pinned BY VALUE so a loop that silently stopped early ' +
    'is a failure rather than a shorter pass.');

  /* ---- (91e) G-C5/error-row — 26.91-27 (F-23 b): THE REFUSAL'S FIT ------
     Both axes, at every `--k`, with a `Range`, over the SERVER's own
     sentences. The height is the axis that binds and the one G-C5's
     borrowed form is structurally blind to; the plant below proves that
     claim inside the gate rather than in a SUMMARY nobody re-runs. */
  console.log('(91e) G-C5/error-row — the refusal reason, BOTH axes');

  ok(REFUSALS.length === REFUSAL_COUNT, 'G-C5/error-row/register-pinned',
    'validate_decorations yields ' + REFUSALS.length + ' distinct refusal ' +
    'string(s); pinned BY VALUE at ' + REFUSAL_COUNT + '. Comparing the ' +
    'lifted register to itself would let a shrunken register lower both ' +
    'sides and still pass.');
  ok(BOUNDED_REFUSALS.length === BOUNDED_COUNT,
    'G-C5/error-row/bounded-pinned',
    BOUNDED_REFUSALS.length + ' of them carry no untrusted interpolation; ' +
    'pinned BY VALUE at ' + BOUNDED_COUNT + '. The other two echo names ' +
    'from the request body and are excluded BY NAME (the "' +
    UNBOUNDED_PREFIX + '" prefix), never by a length heuristic.');
  const longestBounded = ERR_PROBES.filter(function (p) {
    return p.name === 'err-longest'; })[0].text;
  ok(ERR_CAP === longestBounded.length, 'G-C5/error-row/cap-covers-register',
    'NB_SAVE_REASON_CAP is ' + ERR_CAP + ' and the register\'s longest ' +
    'BOUNDED refusal is ' + longestBounded.length + ' characters (' +
    JSON.stringify(longestBounded) + '). They must be EQUAL: a smaller cap ' +
    'truncates a sentence she needs whole, and a larger one is a number ' +
    'nothing measured. Both are lifted — the cap from app.js, the sentence ' +
    'from server.py — so neither side is re-typed here.');
  ok(ERR_SLOT.x === ERR_EXPECTED_SLOT.x && ERR_SLOT.y === ERR_EXPECTED_SLOT.y &&
     ERR_SLOT.w === ERR_EXPECTED_SLOT.w && ERR_SLOT.h === ERR_EXPECTED_SLOT.h,
    'G-C5/error-row/slot-pinned',
    'app.js declares the error slot ' + JSON.stringify(ERR_SLOT) + '; this ' +
    'gate pins it BY VALUE at ' + JSON.stringify(ERR_EXPECTED_SLOT) + '. A ' +
    'SECOND, INDEPENDENT copy, and the ONLY assertion here a slot change ' +
    'can trip — every measurement below builds its probe FROM the lifted ' +
    'slot, so both sides move together (M-R3 proved exactly that).');

  let errMeasured = 0;
  let plantSeenRed = 0;
  let plant2SeenRed = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const e = runs[i].data.err;
    if (!ok(e && e.count === ERR_PROBES.length, 'G-C5/error-row/node-count',
      'k=' + k + ': expected exactly ' + ERR_PROBES.length + ' node(s) ' +
      'matching [data-err], measured ' + (e ? e.count : 'none') + '. ' +
      'Asserted before any geometry is read, so a blank page fails HERE ' +
      'rather than passing vacuously through a loop that never runs.')) {
      continue;
    }
    /* THE CONTAINER IS CHECKED BEFORE THE FORM IS BORROWED. `overflow | E4`
       names copying G-C5's form onto another element as a trap; this is the
       check that makes the borrowing evidenced rather than assumed. */
    const house = e.nodes['err-house'];
    if (!ok(house && house.display === 'flex' &&
            house.whiteSpace !== 'pre' && house.whiteSpace !== 'nowrap',
      'G-C5/error-row/container-checked',
      'k=' + k + ': the error row computes display=' +
      JSON.stringify(house && house.display) + ' white-space=' +
      JSON.stringify(house && house.whiteSpace) + '. It is a CENTRED FLEX ' +
      'surface that WRAPS, which is why (a) scrollWidth is blind to the ' +
      'start edge and a Range is used, and (b) the Range\'s WIDTH ' +
      'saturates at the widest line once wrapping starts, so the HEIGHT ' +
      'must be measured too. If this element ever stops wrapping, this ' +
      'block\'s reasoning changes and this assertion is where that is ' +
      'noticed.')) {
      continue;
    }
    for (let j = 0; j < ERR_PROBES.length; j++) {
      const p = ERR_PROBES[j];
      const n = e.nodes[p.name];
      if (!ok(n, 'G-C5/error-row/present',
        'k=' + k + ': no node resolved for [data-err="' + p.name + '"].')) {
        continue;
      }
      if (!ok(n.text === p.text, 'G-C5/error-row/text',
        'k=' + k + ' [' + p.name + ']: textContent=' +
        JSON.stringify(n.text) + ', expected ' + JSON.stringify(p.text) +
        '. Catches a truncation upstream or a placeholder never replaced.')) {
        continue;
      }
      if (!ok(n.boxWidth > 0 && n.boxHeight > 0 && n.clientWidth > 0,
        'G-C5/error-row/box-nonzero',
        'k=' + k + ' [' + p.name + ']: box ' + n.boxWidth + 'x' +
        n.boxHeight + ', clientWidth ' + n.clientWidth + '. An unrendered ' +
        'node has every metric at 0 and satisfies both bounds below ' +
        'trivially, so it must trip HERE.')) {
        continue;
      }
      if (p.name === 'err-plant2') {
        /* 26.91-31: THE SATURATION DEMONSTRATION, ASSERTED. Twice the first
           plant's text. If the width form could see length, this would be
           wider; it is not, and that is the whole reason the height
           assertion exists. Stated as a RELATION between the two plants
           rather than as an exact pixel value, so it measures the property
           instead of a font metric that a rebuild could nudge. */
        const p1 = e.nodes['err-plant'];
        ok(n.boxWidth <= n.widthBound + EPS, 'G-C5/error-row/plant2-width-green',
          'k=' + k + ': the DOUBLE plant (' + n.len + ' chars) still ' +
          'measures box.width=' + n.boxWidth.toFixed(2) + ' inside the ' +
          'content bound ' + n.widthBound.toFixed(2) + '.');
        ok(n.boxHeight > n.heightBound + EPS, 'G-C5/error-row/plant2-red',
          'k=' + k + ': the DOUBLE plant must OVERFLOW on height — ' +
          'measured box.height=' + n.boxHeight.toFixed(2) + ' against ' +
          n.heightBound.toFixed(2) + '.');
        ok(p1 && n.len > p1.len && n.boxHeight > p1.boxHeight &&
           (n.boxWidth - p1.boxWidth) <= (n.boxHeight - p1.boxHeight) &&
           n.boxWidth <= n.widthBound + EPS,
          'G-C5/error-row/plant-saturates',
          'k=' + k + ': DOUBLE THE TEXT AND THE LENGTH GOES INTO HEIGHT, ' +
          'NOT WIDTH — ' + (p1 ? p1.len : '?') + ' chars measured ' +
          (p1 ? p1.boxWidth.toFixed(2) + 'x' + p1.boxHeight.toFixed(2) : '?') +
          ' and ' + n.len + ' chars measured ' + n.boxWidth.toFixed(2) + 'x' +
          n.boxHeight.toFixed(2) + ', a width delta of ' +
          (p1 ? (n.boxWidth - p1.boxWidth).toFixed(2) : '?') +
          ' px against a height delta of ' +
          (p1 ? (n.boxHeight - p1.boxHeight).toFixed(2) : '?') + ' px, with ' +
          'the width STILL inside its ' + n.widthBound.toFixed(2) +
          ' px bound. THE FORM OF THIS CLAIM WAS CORRECTED WHERE IT WAS ' +
          'MEASURED: the first draft asserted the doubled plant was no ' +
          'WIDER than the single one, and that is false — 291.39 -> 292.72 ' +
          'at k=1, because two texts wrap at different points and the Range ' +
          'reports the widest LINE, not the container. Asserting it would ' +
          'have been measuring a wrap artifact. What is TRUE, and what ' +
          'makes a width-only assertion vacuous here, is that the width is ' +
          'CAPPED BY THE CONTAINER while the height is not: length spends ' +
          'itself on height. Independently confirmed off this gate at the ' +
          'same 308 px content box — 200, 400 and 800 characters all report ' +
          '307.95 px of width, inside the bound, while the height goes ' +
          '14.00 -> 26.00 -> 50.00 against 10.00.');
        plant2SeenRed++;
        errMeasured++;
        continue;
      }
      if (p.name === 'err-plant') {
        /* THE PLANT. It is here to be RED on the height and GREEN on the
           width — which is the whole claim of this block, asserted rather
           than described. A gate that has only ever been seen green has
           not been tested; it has been watched. */
        ok(n.boxHeight > n.heightBound + EPS, 'G-C5/error-row/plant-red',
          'k=' + k + ': THE PLANT FAILED TO ARM. ' +
          JSON.stringify(ERR_PLANT.slice(0, 40) + '…') + ' (' +
          ERR_PLANT.length + ' chars) measured box.height=' +
          n.boxHeight.toFixed(2) + ' against content height ' +
          n.heightBound.toFixed(2) + ' — it must OVERFLOW. If it fits, ' +
          'every "fits" below is being measured by a bound nothing can ' +
          'exceed, and this group proves nothing.');
        ok(n.boxWidth <= n.widthBound + EPS, 'G-C5/error-row/plant-width-green',
          'k=' + k + ': AND THE PLANT PASSES THE WIDTH TEST — box.width=' +
          n.boxWidth.toFixed(2) + ' within content bound ' +
          n.widthBound.toFixed(2) + ' while the height above is RED. This ' +
          'is the evidence, not the argument: a width-only Range (G-C5\'s ' +
          'own form, borrowed onto this element) is GREEN on a state that ' +
          'is visibly broken, because a wrapped Range reports the widest ' +
          'LINE. That is `overflow | E4`\'s named trap, measured.');
        plantSeenRed++;
        errMeasured++;
        continue;
      }
      ok(n.boxWidth <= n.widthBound + EPS, 'G-C5/error-row/fits-width',
        'k=' + k + ' [' + p.name + ']: box.width=' + n.boxWidth.toFixed(2) +
        ' against content bound ' + n.widthBound.toFixed(2) + ' (' +
        n.len + ' chars). The CONTENT box, not clientWidth: on a ' +
        'border-box element clientWidth includes the padding.');
      ok(n.boxHeight <= n.heightBound + EPS, 'G-C5/error-row/fits-height',
        'k=' + k + ' [' + p.name + ']: box.height=' + n.boxHeight.toFixed(2) +
        ' against content height ' + n.heightBound.toFixed(2) + ' — ONE ' +
        'LINE. THIS IS THE BINDING AXIS and the one a borrowed width-only ' +
        'form cannot see. 26.91-31 RE-MEASURED THE CLAIM RATHER THAN ' +
        'CARRYING IT FORWARD: the slot is no longer 180 wide (wave 27 ' +
        're-laid it to w:316, a 308 px CONTENT box) and the four refusals ' +
        'that wrapped here are gone, collapsed into her one sentence. What ' +
        'survives is stronger, not weaker — at THIS box the Range width ' +
        'saturates at 307.95 px for 200, 400 and 800 characters alike, ' +
        'under the 308.00 bound, so the width form is vacuous at EVERY ' +
        'length rather than merely at four of them. err-plant2 asserts ' +
        'that. Text: ' + JSON.stringify(n.text));
      errMeasured++;
    }
    ['err-house', 'err-f27', 'err-longest', 'err-plant',
      'err-plant2'].forEach(function (nm) {
      const n = e.nodes[nm];
      if (!n) { return; }
      console.log('  G-C5/error-row k=' + k + ' ' + nm + ' len=' + n.len +
        ' box=' + n.boxWidth.toFixed(2) + 'x' + n.boxHeight.toFixed(2) +
        ' bound=' + n.widthBound.toFixed(2) + 'x' + n.heightBound.toFixed(2) +
        ' w=' + (n.boxWidth <= n.widthBound + EPS ? 'fits' : 'OVER') +
        ' h=' + (n.boxHeight <= n.heightBound + EPS ? 'fits' : 'OVER'));
    });
  }
  console.log('ERR_MEASURED=' + errMeasured + ' PLANT_RED_AT=' + plantSeenRed);
  ok(errMeasured === ERR_PROBES.length * KS.length,
    'G-C5/error-row/measured-count',
    'expected ' + (ERR_PROBES.length * KS.length) + ' error-row ' +
    'measurements (' + ERR_PROBES.length + ' probes x ' + KS.length +
    ' scales), completed ' + errMeasured + '. Pinned BY VALUE so a loop ' +
    'that silently stopped early is a failure rather than a shorter pass.');
  ok(plantSeenRed === KS.length, 'G-C5/error-row/plant-count',
    'the plant must be measured overflowing at ALL ' + KS.length +
    ' scales; it was measured at ' + plantSeenRed + '. An arming that ' +
    'happened at one scale and silently not at the others is an arming ' +
    'nobody can rely on.');
  ok(plant2SeenRed === KS.length, 'G-C5/error-row/plant2-count',
    'and the SATURATION plant likewise, at ALL ' + KS.length + ' scales; ' +
    'it was measured at ' + plant2SeenRed + '. Pinned separately from the ' +
    'first plant so a demonstration that quietly ran at one scale is a ' +
    'failure rather than a shorter pass.');

  /* ---- (91e) THE ARMING — the gate shown RED before it is trusted ------ */
  const armRun = runs.filter(function (r) { return r.k === 1; })[0];
  const A = armRun && armRun.data.arm;
  if (ok(A, '91e/arm-present',
    'the arming pass did not run at k=1. G-C5 is not armed until it has ' +
    'been seen red on a planted label, and an arming pass that silently did ' +
    'not happen is the defect class this whole group is written against.')) {

    /* -- ARMING 1: the gross overflow, and the scrollWidth rejection -- */
    ok(A.arm1.shippedHolds === false, '91e/arm1-range-red',
      'ARMING 1 FAILED TO ARM: the planted label ' +
      JSON.stringify(A.arm1.label) + ' measured box.width=' +
      A.arm1.boxWidth + ' against content bound ' + A.arm1.contentBound +
      ' and the shipped bound still HELD. A gate that cannot go red on a ' +
      'grossly over-long label is measuring nothing.');
    /* A MEASURED CORRECTION TO THE UI-SPEC'S OWN ARMING RECIPE.
       The spec prescribes `marksmarksmarks` and states that `scrollWidth`
       stays GREEN on it. IT DOES NOT, and that line was a derivation nobody
       had executed — the same class of error as the spec's raised-key
       property 4. At 3x the slot the overflow is so gross that the END-edge
       half alone exceeds the padding box, so scrollWidth goes red too and
       proves nothing about its blindness. scrollWidth's blindness lives in
       the MODERATE band, and it is demonstrated on the arming-2 state
       below, where the Range is RED and BOTH cheap substitutes are GREEN.
       Pinned here in the direction actually measured, so the correction
       cannot quietly revert. */
    ok(A.arm1.scrollHolds === false, '91e/arm1-scrollwidth-red',
      'ARMING 1: a 3x-overlong label was measured to push scrollWidth(' +
      A.arm1.scrollWidth + ') past clientWidth(' + A.arm1.clientWidth +
      '). If this ever flips, the UI-SPEC\'s original claim (scrollWidth ' +
      'GREEN on marksmarksmarks) has become true and the correction ' +
      'recorded here needs revisiting.');
    console.log('  91e ARM1 ' + JSON.stringify(A.arm1.label) + ' box=' +
      A.arm1.boxWidth.toFixed(2) + ' content=' + A.arm1.contentBound +
      ' client=' + A.arm1.clientWidth + ' -> shipped=' +
      (A.arm1.shippedHolds ? 'GREEN' : 'RED') + ' scrollWidth=' +
      (A.arm1.scrollHolds ? 'GREEN' : 'RED') + ' (spec predicted GREEN — ' +
      'corrected at source)');

    /* -- ARMING 2: the band the retired bound let through -- */
    if (ok(A.arm2, '91e/arm2-selected',
      'ARMING 2 found no label inside the ' + '6*k' + ' px band between the ' +
      'content edge and the padding edge after ' + A.stepCount + ' ' +
      'single-character growth steps. The gate is NOT armed until it has ' +
      'been seen red on a label inside that band — widen the search to the ' +
      'narrowest other named slot rather than declaring it armed.')) {
      ok(A.arm2.shippedHolds === false, '91e/arm2-content-red',
        'ARMING 2: the selected in-band label ' +
        JSON.stringify(A.arm2.label) + ' (box.width=' + A.arm2.boxWidth +
        ', content bound=' + A.arm2.contentBound + ', clientWidth=' +
        A.arm2.clientWidth + ') did NOT redden the shipped content-box ' +
        'bound. That bound is the entire reason this gate was tightened.');
      ok(A.arm2.retiredClientWidthHolds === true, '91e/arm2-clientwidth-green',
        'ARMING 2, THE OTHER HALF: on that SAME state the RETIRED ' +
        'clientWidth-only bound was expected to stay GREEN and did not. ' +
        'This is the evidence that the bound moved FOR A REASON — the same ' +
        'shape of proof the UI-SPEC already demands for scrollWidth, ' +
        'applied to the second wrong bound. Without it the tightening is an ' +
        'unevidenced preference.');
      ok(A.arm2.boxWidth > A.arm2.contentBound &&
         A.arm2.boxWidth <= A.arm2.clientWidth, '91e/arm2-in-band',
        'ARMING 2: the selected label must lie STRICTLY INSIDE the band ' +
        'between the content edge (' + A.arm2.contentBound + ') and the ' +
        'padding edge (' + A.arm2.clientWidth + '); measured ' +
        A.arm2.boxWidth + '. Outside that window it proves nothing about ' +
        'the difference between the two bounds.');

      /* THE SYMMETRY, AND THE scrollWidth REJECTION, ON ONE MEASURED STATE.
         This is the whole reason the Range replaced the scroll box, and it
         is asserted rather than argued. */
      ok(A.arm2.startIntrusion > 0 && A.arm2.endIntrusion > 0,
        '91e/arm2-symmetric',
        'ARMING 2: the over-wide label must intrude on BOTH content edges ' +
        '(centred flex, bare text node, min-width:auto — it cannot shrink). ' +
        'Measured startIntrusion=' + A.arm2.startIntrusion.toFixed(3) +
        ' endIntrusion=' + A.arm2.endIntrusion.toFixed(3) + '. If the ' +
        'overflow were one-sided, the scroll box could see it and the ' +
        'assertion below would prove nothing.');
      ok(A.arm2.scrollHolds === true, '91e/arm2-scrollwidth-green',
        'ARMING 2, THE scrollWidth REJECTION: on this SAME state — where ' +
        'the label overflows the content box on BOTH sides and the Range ' +
        'bound is RED — scrollWidth(' + A.arm2.scrollWidth + ') <= ' +
        'clientWidth(' + A.arm2.clientWidth + ') was expected to stay GREEN ' +
        'and did not. In LTR the scroll box cannot report overflow past the ' +
        'START edge, so it is structurally blind to exactly half of a ' +
        'symmetric overflow. This half is what proves the Range form was ' +
        'NECESSARY rather than merely different.');
      console.log('  91e ARM2 ' + JSON.stringify(A.arm2.label) + ' box=' +
        A.arm2.boxWidth.toFixed(3) + ' content=' + A.arm2.contentBound +
        ' client=' + A.arm2.clientWidth + ' start+' +
        A.arm2.startIntrusion.toFixed(3) + ' end+' +
        A.arm2.endIntrusion.toFixed(3) + ' -> Range=' +
        (A.arm2.shippedHolds ? 'GREEN' : 'RED') + ' retired(clientWidth)=' +
        (A.arm2.retiredClientWidthHolds ? 'GREEN' : 'RED') + ' scrollWidth=' +
        (A.arm2.scrollHolds ? 'GREEN' : 'RED'));
    }

    /* -- ARMING 3: the collapsed Range -- */
    ok(A.arm3.boxWidth === 0, '91e/arm3-collapsed',
      'ARMING 3: an EMPTY label was expected to yield a zero-width Range ' +
      '(measured ' + A.arm3.boxWidth + '), which is what the ' +
      '91e/range-nonzero guard exists to catch. If this is ever non-zero ' +
      'that guard is measuring something else.');
    ok(A.arm3.retiredClientWidthHolds === true &&
       A.arm3.shippedHolds === true, '91e/arm3-bounds-blind',
      'ARMING 3, THE POINT OF IT: a collapsed Range satisfies BOTH bounds ' +
      '(shipped=' + A.arm3.shippedHolds + ', retired=' +
      A.arm3.retiredClientWidthHolds + '). Neither bound can see an empty ' +
      'label, which is exactly why 91e/range-nonzero is asserted BEFORE ' +
      'them and must never be removed as redundant.');

    /* -- AND THE SHIPPED LABELS ARE GREEN IN THE SAME RUN -- */
    ok(A.restored === true, '91e/arm-restored',
      'the planted label was not put back after arming, so the ' +
      'measurements below are of a mutated page.');
    Object.keys(A.after).forEach(function (name) {
      const a = A.after[name];
      ok(a.holds, '91e/after-arming-green',
        '[' + name + '] ' + JSON.stringify(a.text) + ': with the plant ' +
        'REVERTED, this shipped label FAILS the new content-box bound — ' +
        'box.width=' + a.boxWidth + ' against content bound ' +
        a.contentBound + ' (clientWidth=' + a.clientWidth + '). This is the ' +
        'assertion that distinguishes a STRICTER gate from a BROKEN one. If ' +
        'it fires, the owner\'s 16-px recovery ladder applies: step 1 spends ' +
        'the two 8-px gaps, step 2 shrinks `exit` 76->68. `marks` may NOT be ' +
        'narrowed and `reset` is not on the ladder. Beyond 16 px is a HARD ' +
        'HALT — option C3 moves the decoration clamp under existing marks ' +
        'and is the owner\'s call, not an executor\'s.');
    });
  }

  /* ---- (91f) G-B-trace — THE TRACE BACKSTOP, AT EVERY `--k` ------------- */
  console.log('(91f) G-B-trace — the trace slot, measured at every --k');

  ok(KS.length === 5, '91f/ks-pinned',
    'G-B-trace sweeps the pinned `--k` list and KS.length is ' + KS.length +
    ', not 5. Asserted BEFORE anything is measured, so a silently shortened ' +
    'sweep is a failure rather than a shorter pass.');
  ok(TRACES.length === TRACE_COUNT, '91f/trace-count-pinned',
    'the trace probe table holds ' + TRACES.length + ' entries against a ' +
    'BY-VALUE pin of ' + TRACE_COUNT + '. Comparing the table to itself ' +
    'would let a vanished probe lower both sides and still pass.');

  /* THE COPY LENGTH, IN JS STRING UNITS, BEFORE ANY PIXEL IS READ. Both
     capped names are 24 units and both compose the pinned longest line; the
     typical line must be shorter. If the copy grows, this fails HERE with a
     legible reason rather than as a mysterious overflow four assertions
     later. */
  ok(TRACE_LATIN24.length === 24 && TRACE_CJK24.length === 24,
    '91f/cap-probes',
    'the two folder probes must be exactly 24 JS string units (the pinned ' +
    'cap); measured ' + TRACE_LATIN24.length + ' and ' + TRACE_CJK24.length +
    '.');
  ['trace-latin', 'trace-cjk'].forEach(function (name) {
    const t = TRACES.filter(function (x) { return x.name === name; })[0];
    ok(t && t.text.length === TRACE_LONGEST, '91f/longest-composable',
      '[' + name + '] the composed line is ' + (t ? t.text.length : 'n/a') +
      ' JS string units against a BY-VALUE pin of ' + TRACE_LONGEST +
      '. That is 57 of frame + 24 of capped folder + 37 of tail. Whoever ' +
      'changes the copy moves this constant in the SAME COMMIT — that is ' +
      'the point, not an inconvenience. Line: ' + JSON.stringify(t && t.text));
  });
  ok(TRACES.every(function (t) { return !/[0-9]/.test(t.text); }),
    '91f/no-digit',
    'LAW 3: no digit may reach the trace. One of the composed lines carries ' +
    'one: ' + JSON.stringify(TRACES.map(function (t) { return t.text; })));

  let traceMeasured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.trace;

    /* EMPTY FIRST, as everywhere else in this file: a blank page yields zero
       nodes and fails HERE rather than passing vacuously through a loop that
       never runs. */
    if (!ok(m.count === TRACE_COUNT, '91f/node-count',
      'k=' + k + ': expected exactly ' + TRACE_COUNT + ' node(s) matching ' +
      '[data-trace], measured ' + m.count + '.')) {
      continue;
    }

    for (let j = 0; j < TRACES.length; j++) {
      const spec = TRACES[j];
      const n = m.nodes[spec.name];
      if (!ok(n, '91f/node-present',
        'k=' + k + ': no node resolved for [data-trace="' + spec.name +
        '"].')) { continue; }

      /* 1. THE TEXT IS THE COMPOSER'S OWN OUTPUT, unchanged by the page. */
      ok(n.text === spec.text, '91f/text',
        'k=' + k + ' [' + spec.name + ']: the rendered textContent is ' +
        JSON.stringify(n.text) + ', not the composer\'s output ' +
        JSON.stringify(spec.text) + '. This string is LIFTED from ' +
        'composeArrivalTrace, never re-typed here.');

      /* 2. THE NODE EXISTS AND HAS A BOX. THIS ASSERTION EXISTS SOLELY TO
            CLOSE THE DEGENERATE PASS — with no node rendered, assertion 3
            reads 0 <= 0 and assertion 4's rounding of 0 fails for a
            DIFFERENT reason than the one it is written to catch.
            DO NOT REMOVE IT. Its removal was demonstrated GREEN over an
            empty page; see 26.91-07-SUMMARY.md. */
      if (!ok(n.clientHeight > 0 && n.clientWidth > 0, '91f/has-box',
        'k=' + k + ' [' + spec.name + ']: the trace node has no box ' +
        '(clientWidth=' + n.clientWidth + ', clientHeight=' +
        n.clientHeight + '). This is the no-node degenerate pass and this ' +
        'assertion is the only thing that closes it.')) { continue; }

      /* 3. IT DOES NOT CLIP. `.station-caption` is `overflow: hidden`, so
            this is the only symptom an over-long trace ever produces. */
      ok(n.scrollHeight <= n.clientHeight, '91f/no-clip',
        'k=' + k + ' [' + spec.name + ']: THE TRACE IS CLIPPED. ' +
        'scrollHeight=' + n.scrollHeight + ' exceeds clientHeight=' +
        n.clientHeight + ', and `.station-caption` carries ' +
        '`overflow: hidden` so NOTHING ON SCREEN SAYS SO. Either the copy ' +
        'grew or the slot shrank. Line: ' + JSON.stringify(n.text));

      /* 3b. and the box really is the block scroll box this form depends
             on — read live, so the justification above is checked rather
             than trusted. */
      ok(n.display === 'block', '91f/block-box',
        'k=' + k + ' [' + spec.name + ']: the trace box computes ' +
        '`display: ' + n.display + '`, not `block`. The `scrollHeight` form ' +
        'used here is valid ONLY on a block box that wraps downward; on a ' +
        'flex or centred surface the overflow is symmetric and the scroll ' +
        'box is blind to half of it, which is why G-C5 measures a Range.');
      ok(n.overflowY === 'hidden', '91f/overflow-hidden',
        'k=' + k + ' [' + spec.name + ']: the trace box computes ' +
        '`overflow-y: ' + n.overflowY + '`, not `hidden`. If the slot ever ' +
        'stops clipping, assertion 3 is measuring a box that cannot clip — ' +
        'a gate that cannot go red.');

      /* 4. AND THE SLOT IS THE SHIPPED ONE, recovered to scene px. */
      ok(Math.round(n.clientHeight / k) === TRACE_EXPECTED_H, '91f/slot-h',
        'k=' + k + ' [' + spec.name + ']: clientHeight=' + n.clientHeight +
        ' recovers to ' + Math.round(n.clientHeight / k) + ' scene px, not ' +
        'the pinned ' + TRACE_EXPECTED_H + '. NB_TRACE_GEOM.line is ' +
        'STATION_NOTEBOOK_GEOM.whyText BY REFERENCE; this constant is a ' +
        'SECOND, INDEPENDENT copy so that moving the slot fails here rather ' +
        'than moving both sides together.');
      ok(Math.round(n.clientWidth / k) === TRACE_EXPECTED_W, '91f/slot-w',
        'k=' + k + ' [' + spec.name + ']: clientWidth=' + n.clientWidth +
        ' recovers to ' + Math.round(n.clientWidth / k) + ' scene px, not ' +
        'the pinned ' + TRACE_EXPECTED_W + '.');
      traceMeasured++;
    }
  }
  ok(traceMeasured === TRACE_COUNT * KS.length, '91f/measured-count',
    'expected ' + (TRACE_COUNT * KS.length) + ' trace measurements (' +
    TRACE_COUNT + ' probes x ' + KS.length + ' scales), completed ' +
    traceMeasured + '. A loop that silently measured fewer nodes than it ' +
    'claims is the defect class this whole file is written against.');
  console.log('  91f traces=' + TRACE_COUNT + ' scales=' + KS.length +
    ' measurements=' + traceMeasured);

  /* ---- (G-F1-live) THE CALENDAR IS VISIBLE, NOT MERELY PAINTED ---------
     Its three bounds are stated at the emitter above and repeated in the
     SUMMARY: it does NOT prove the painter ran at index N (plan 10's G-F1
     does), it measures the SHIPPED MARKUP SHAPE re-emitted from shipped
     constants rather than the painter's output, and it cannot see an
     occluder painted outside the notebook scene (owner beats R1/R2). */
  console.log('(G-F1-live) the calendar has a real box on the glass');

  /* THE SCOPING CONDITION, ENFORCED RATHER THAN QUOTED. The once-per-`--k`
     argument is only valid while the painter reads no spread index. */
  ok(CAL_INDEX_FREE.spread === 0 && CAL_INDEX_FREE.di === 0 &&
     CAL_INDEX_FREE.view === 1 && CAL_INDEX_FREE.viewIsWrite,
    'G-F1-live/index-free',
    'paintNotebookCalendar was measured as INDEX-INDEPENDENT (`spread.`=0, ' +
    '`di `=0, `STATION_NOTEBOOK.view`=1 and that one a WRITE in the ' +
    'lit-cell click handler), which is the ENTIRE justification for ' +
    'measuring the calendar once per `--k` rather than once per spread ' +
    'index. Measured now: spread.=' + CAL_INDEX_FREE.spread + ' di =' +
    CAL_INDEX_FREE.di + ' view=' + CAL_INDEX_FREE.view + ' viewIsWrite=' +
    CAL_INDEX_FREE.viewIsWrite + '. IF THIS FIRED, THE SCOPING IS VOID: the ' +
    'painter now reads an index, so this group must be RE-SCOPED to run per ' +
    'index rather than trusted as it stands.');

  let calMeasured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.cal;

    /* 4. THE NODE COUNT IS PINNED BY VALUE, and asserted FIRST. Comparing
          the count to its own emitter's length is vacuous here for exactly
          the reason it is vacuous in the sweep: a vanished node would lower
          both sides and still pass. Empty first, as everywhere in this file. */
    if (!ok(m.count === CAL_NODE_COUNT, 'G-F1-live/node-count',
      'k=' + k + ': expected exactly ' + CAL_NODE_COUNT + ' node(s) ' +
      'matching [data-cal], measured ' + m.count + '. A page that emitted ' +
      'nothing must fail HERE rather than passing vacuously through a loop ' +
      'that never runs.')) {
      continue;
    }

    const names = Object.keys(m.nodes);
    let rightMost = -Infinity;

    for (let j = 0; j < names.length; j++) {
      const name = names[j];
      const n = m.nodes[name];

      /* 1. NON-ZERO BOX. THIS IS THE ASSERTION THAT KILLS *STRUCTURALLY
            PRESENT, VISUALLY ABSENT* — the shape `mkdoc` cannot see, because
            it has no layout engine. A calendar painted at zero size or
            hidden by a stylesheet rule that stopped consuming `--w`
            satisfies every one of plan 10's assertions and is invisible on
            the glass. */
      if (!ok(n.width > 0 && n.height > 0, 'G-F1-live/non-zero-box',
        'k=' + k + ' [' + name + ']: THE CALENDAR NODE HAS NO BOX ' +
        '(width=' + n.width + ', height=' + n.height + ', display=' +
        n.display + '). It is structurally present and visually ABSENT — ' +
        'painted, and not findable. This is the half of F-1 that plan 10\'s ' +
        'G-F1 is blind to, and this assertion is the whole reason this ' +
        'group exists.')) { continue; }

      /* 3. NOTHING ESCAPES THE SCENE. A node pushed off-canvas is invisible
            in a way a non-zero box does not catch. */
      ok(n.left >= m.scene.left - 0.5 && n.right <= m.scene.right + 0.5 &&
         n.top >= m.scene.top - 0.5 && n.bottom <= m.scene.bottom + 0.5,
        'G-F1-live/inside-scene',
        'k=' + k + ' [' + name + ']: the node escapes the scene box. node ' +
        '[' + n.left.toFixed(2) + ',' + n.top.toFixed(2) + ',' +
        n.right.toFixed(2) + ',' + n.bottom.toFixed(2) + '] vs scene [' +
        m.scene.left.toFixed(2) + ',' + m.scene.top.toFixed(2) + ',' +
        m.scene.right.toFixed(2) + ',' + m.scene.bottom.toFixed(2) + ']. A ' +
        'node with a real box that sits off-canvas is invisible in a way ' +
        'assertion 1 cannot catch.');

      if (n.right > rightMost) { rightMost = n.right; }
      calMeasured++;
    }

    /* 2. THE CALENDAR NEVER REACHES UNDER THE RIGHT PAGE. Converted back to
          scene px against the scene's own rect, and compared against the
          right page's leftmost painted origin DERIVED FROM SOURCE
          (`pageX.right + date.dx`). Neither side is typed.
          THIS IS NEW RISK: before F-1 a page and the calendar shared a
          spread only at index 0; after it they share EVERY spread. */
    const rightScene = (rightMost - m.scene.left) / k;
    ok(rightScene < CAL_PAGE_ORIGIN, 'G-F1-live/clear-of-page',
      'k=' + k + ': THE CALENDAR REACHES UNDER THE RIGHT PAGE. Its ' +
      'rightmost measured edge recovers to ' + rightScene.toFixed(2) +
      ' scene px, which is not strictly less than the right page\'s ' +
      'leftmost painted origin ' + CAL_PAGE_ORIGIN + ' (derived as ' +
      'pageX.right ' + CAL_G.pageX.right + ' + date.dx ' + CAL_G.date.dx +
      '). Both sides are derived from source, neither typed. This is the ' +
      'OCCLUSION half of the F-1 risk and it is risk F-1 itself created.');
    console.log('  G-F1-live k=' + k + ' nodes=' + m.count +
      ' rightmost=' + rightScene.toFixed(2) + ' scene px vs page origin ' +
      CAL_PAGE_ORIGIN + ' (clear by ' +
      (CAL_PAGE_ORIGIN - rightScene).toFixed(2) + ')');
  }
  ok(calMeasured === CAL_NODE_COUNT * KS.length, 'G-F1-live/measured-count',
    'expected ' + (CAL_NODE_COUNT * KS.length) + ' calendar measurements (' +
    CAL_NODE_COUNT + ' nodes x ' + KS.length + ' scales), completed ' +
    calMeasured + '. A loop that silently measured fewer nodes than it ' +
    'claims is the defect class this whole file is written against.');

  /* ---- (91g) THE NARROWED RECIPE STILL REACHES ITS OWN CHROME -----------
     The positive control over 26.91-15's selector-level narrowing. Its
     bounds are stated at the emitter above: it watches what must NOT move.
     `G-W1` watches what must. */
  console.log('(91g) the palace recipe still reaches every shipped chrome field');

  ok(CHROME_TAGS.length === CHROME_COUNT, '91g/chrome-roster',
    'index.html ships ' + CHROME_TAGS.length + ' `type="text"` field(s); ' +
    'this control is pinned BY VALUE at ' + CHROME_COUNT + '. Comparing the ' +
    'roster to its own length would let a vanished field lower both sides ' +
    'and still pass, which is how a narrowing that quietly unstyled ' +
    'something would go unnoticed.');

  let chromeMeasured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.chrome;

    /* EMPTY FIRST, as everywhere in this file. */
    if (!ok(m.count === CHROME_COUNT, '91g/node-count',
      'k=' + k + ': expected exactly ' + CHROME_COUNT + ' node(s) matching ' +
      '[data-chrome], measured ' + m.count + '. A page that emitted nothing ' +
      'must fail HERE rather than passing vacuously through a loop that ' +
      'never runs.')) {
      continue;
    }

    const names = Object.keys(m.nodes);
    for (let j = 0; j < names.length; j++) {
      const n = m.nodes[names[j]];

      /* 1. THE FULL-WIDTH RULE STILL REACHES IT. `width: 100%` against a
            containing block whose content box the page reports in the same
            pass — so the two sides come from one layout and neither is
            typed. An input that lost the recipe falls to the UA's intrinsic
            size, which is nothing like the scene's width. */
      ok(n.offsetWidth === m.sceneWidth, '91g/full-width',
        'k=' + k + ' [field ' + names[j] + ']: the palace recipe declares ' +
        'width: ' + PALACE.width + ' and this field measured ' +
        n.offsetWidth + 'px against a containing block of ' + m.sceneWidth +
        'px. THIS IS THE NARROWING\'S POSITIVE CONTROL: 26.91-15 excluded ' +
        'ONE class from that recipe, and every chrome field must still ' +
        'match it. A narrowing with no control over what must survive it ' +
        'is indistinguishable from a deletion that happens to look green.');

      /* 2. THE RIM IS THE RECIPE'S OWN, AND IT IS LIFTED. The one other rule
            that reaches a chrome field declares a DIFFERENT width, so this
            is a real discriminator rather than a restatement. */
      ok(n.borderTopWidth === PALACE.border &&
         n.borderLeftWidth === PALACE.border, '91g/rim',
        'k=' + k + ' [field ' + names[j] + ']: expected the recipe\'s own ' +
        'rim, lifted from its declaration block as ' + PALACE.border +
        ', measured top=' + n.borderTopWidth + ' left=' + n.borderLeftWidth +
        '.');

      /* 3. THE BOX MODEL IS THE RECIPE'S OWN, LIFTED THE SAME WAY. */
      ok(n.boxSizing === PALACE.boxSizing, '91g/box-model',
        'k=' + k + ' [field ' + names[j] + ']: expected the recipe\'s box ' +
        'model, lifted as ' + PALACE.boxSizing + ', measured ' +
        n.boxSizing + '.');

      chromeMeasured++;
    }
  }
  ok(chromeMeasured === CHROME_COUNT * KS.length, '91g/measured-count',
    'expected ' + (CHROME_COUNT * KS.length) + ' chrome measurements (' +
    CHROME_COUNT + ' fields x ' + KS.length + ' scales), completed ' +
    chromeMeasured + '. A loop that silently measured fewer nodes than it ' +
    'claims is the defect class this whole file is written against.');
  console.log('  91g fields=' + CHROME_COUNT + ' scales=' + KS.length +
    ' measurements=' + chromeMeasured + ' rim=' + PALACE.border +
    ' box=' + PALACE.boxSizing + ' width=' + PALACE.width);

  /* ---- (G-W1) THE TYPING SURFACE AGAINST THE COMMITTED MARK -------------
     Three bounds at the emitter above. Two claims, each in BOTH forms,
     because either form alone is satisfiable by a degenerate pass; plus the
     position, which is a third assertion and not a corollary of either. */
  console.log('(G-W1) the typing surface is the size and the face of the mark');

  /* the lifted SET is pinned BY VALUE before anything is measured. A painter
     that stopped setting one of the four would otherwise take a whole
     dimension out of measurement while every assertion below stayed green. */
  ok(Object.keys(W1_PROPS).length === W1_PROP_COUNT, 'G-W1/props-pinned',
    'openHandTextEditor sets ' + Object.keys(W1_PROPS).length + ' inline ' +
    'custom propert(ies); this gate is pinned BY VALUE at ' + W1_PROP_COUNT +
    ' (' + JSON.stringify(W1_PROPS) + '). Comparing the set to its own size ' +
    'would let a vanished property lower both sides and still pass.');
  ok(W1_PROPS['--w'] === 'NB_TEXT_BOX.w' && W1_PROPS['--h'] === 'NB_TEXT_BOX.h',
    'G-W1/one-constant',
    'the typing surface must take its box from the SAME declaration the ' +
    'committed mark takes its box from — lifted --w=' + W1_PROPS['--w'] +
    ' --h=' + W1_PROPS['--h'] + '. That shared constant is what makes the ' +
    'relational half below honest instead of a coincidence.');

  let w1Measured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.w1;

    /* EMPTY FIRST. Both nodes, pinned BY VALUE, before a single style is
       read: a page that emitted neither must fail HERE. */
    if (!ok(m.count === W1_NODE_COUNT, 'G-W1/node-count',
      'k=' + k + ': expected exactly ' + W1_NODE_COUNT + ' node(s) matching ' +
      '[data-w1] (the committed mark and the typing surface), measured ' +
      m.count + '. A page that emitted nothing must fail HERE rather than ' +
      'passing vacuously through a loop that never runs.')) {
      continue;
    }
    const input = m.nodes.input;
    const mark = m.nodes.mark;

    /* 1. THE BOX, RELATIONALLY. She must be typing into the box the mark
          will occupy. */
    ok(input.offsetWidth === mark.offsetWidth &&
       input.offsetHeight === mark.offsetHeight, 'G-W1/box-relational',
      'k=' + k + ': the typing surface measures ' + input.offsetWidth + 'x' +
      input.offsetHeight + ' CSS px and the committed mark measures ' +
      mark.offsetWidth + 'x' + mark.offsetHeight + '. She must be typing ' +
      'into the box the mark will occupy. THIS HALF ALONE IS NOT ENOUGH: ' +
      'two equally wrong boxes agree with each other perfectly.');

    /* 2. THE BOX, BY VALUE. The lifted constant times the scene's own scale. */
    ok(input.offsetWidth === W1_BOX.w * k &&
       input.offsetHeight === W1_BOX.h * k, 'G-W1/box-by-value',
      'k=' + k + ': the typing surface measures ' + input.offsetWidth + 'x' +
      input.offsetHeight + ' CSS px; the lifted box constant times the ' +
      'scene scale is ' + (W1_BOX.w * k) + 'x' + (W1_BOX.h * k) + '. THIS ' +
      'HALF ALONE IS NOT ENOUGH EITHER: it measures one side and says ' +
      'nothing about the mark she is about to make. Both halves, or the ' +
      'gate is satisfiable by a degenerate pass.');

    /* 3. THE FACE, RELATIONALLY. The face must not change under her hand
          between typing and committing — F-19 in one assertion. */
    ok(input.fontFamily === mark.fontFamily &&
       input.fontStyle === mark.fontStyle, 'G-W1/face-relational',
      'k=' + k + ': the typing face is [' + input.fontFamily + ' / ' +
      input.fontStyle + '] and the committed face is [' + mark.fontFamily +
      ' / ' + mark.fontStyle + ']. The face must not change under her hand ' +
      'between typing and committing.');

    /* 4. THE FACE, BY VALUE, against the shipped token run through the
          browser's own serializer in this same run. A retint or a restack of
          the token moves both sides together, which is what keeps this
          meaningful rather than decorative. */
    ok(input.fontFamily === m.serialFamily &&
       input.fontStyle === W1_FACE.slant, 'G-W1/face-by-value',
      'k=' + k + ': the typing face is [' + input.fontFamily + ' / ' +
      input.fontStyle + ']; the shipped token ' + W1_FACE.familyToken +
      ' serializes to [' + m.serialFamily + '] and the her-layer rule ' +
      'declares the slant as [' + W1_FACE.slant + '], both LIFTED. Same ' +
      'reason as the box: relational alone passes when both sides are ' +
      'equally wrong.');

    /* 5. THE PAN, GATED AT ITS CAUSE. THE THIRD CLAIM, NOT A COROLLARY.
          F-18 reported the book moving while she typed. The mechanism is
          measured here rather than inferred: the typing surface must lie
          INSIDE the station scene. A surface that escapes the scene grows
          the scrollable region, and focusing it is then what moves the book
          — which is exactly what the pre-fix reading showed, and what the
          record's own arithmetic said (two spans of EQUAL WIDTH, 360 apart:
          a translation, never a rescale).

          WHY THE CAUSE AND NOT THE SCROLL ITSELF: this harness drives every
          pinned --k regardless of fit, so from k=2 up the scene is wider
          than the harness window and the browser's own scroll-into-view on
          focus would redden this assertion for a reason that has nothing to
          do with the defect. `fitStationScale` takes the largest FITTING
          integer, so that condition is the harness's and not the app's.
          Gating the artifact would be a gate that fails for the wrong
          reason; gating the cause is viewport-independent and is RED on the
          pre-fix stylesheet. Stated, not glossed. */
    ok(input.sceneLeft >= -0.5 && input.sceneTop >= -0.5 &&
       input.sceneRight <= input.sceneW + 0.5 &&
       input.sceneBottom <= input.sceneH + 0.5, 'G-W1/stays-in-scene',
      'k=' + k + ': THE TYPING SURFACE ESCAPES THE STATION SCENE. Its box ' +
      'recovers to [' + input.sceneLeft.toFixed(2) + ',' +
      input.sceneTop.toFixed(2) + ' -> ' + input.sceneRight.toFixed(2) + ',' +
      input.sceneBottom.toFixed(2) + '] scene px against a scene of ' +
      input.sceneW.toFixed(2) + 'x' + input.sceneH.toFixed(2) + '. This is ' +
      'the PAN\'S CAUSE: a surface that reaches past the scene grows the ' +
      'scrollable region, and focusing it is what moves the book under her ' +
      'hand. It also runs over the room behind the book, which is what she ' +
      'reported seeing.');

    /* 6. THE SCALE AND THE POSITION HOLD, DOCUMENT-RELATIVE. Both deltas
          pinned at zero BY VALUE across open → focus → remove, so a change
          that really rescales or really moves the scene in the layout
          reddens here. */
    const dScale = m.during.width - m.before.width;
    const dPos = m.during.left - m.before.left;
    const dK = m.during.k - m.before.k;
    ok(dScale === 0 && dK === 0, 'G-W1/scale-holds',
      'k=' + k + ': opening and focusing the typing surface changed the ' +
      'station SCALE — scene width ' + m.before.width + ' -> ' +
      m.during.width + ' (delta ' + dScale + '), --k ' + m.before.k +
      ' -> ' + m.during.k + '. It must change by zero. The record described ' +
      'F-18 as a rescale; its own two spans were equal in width, so this ' +
      'assertion exists to keep that answer honest in both directions.');
    ok(dPos === 0, 'G-W1/position-holds',
      'k=' + k + ': the station MOVED IN THE LAYOUT while she typed — ' +
      'document-relative scene left ' + m.before.left + ' -> ' +
      m.during.left + ' (delta ' + dPos + '). It must be zero.');

    /* 7. AND IT PUTS THE PAGE BACK. */
    ok(m.after.left === m.before.left && m.after.width === m.before.width &&
       m.after.k === m.before.k, 'G-W1/restores',
      'k=' + k + ': removing the typing surface did not return the station ' +
      'to where it was. before [left ' + m.before.left + ' w ' +
      m.before.width + ' k ' + m.before.k + '] vs after [left ' +
      m.after.left + ' w ' + m.after.width + ' k ' + m.after.k + '].');

    w1Measured++;
    console.log('  G-W1 k=' + k + ' input=' + input.offsetWidth + 'x' +
      input.offsetHeight + ' mark=' + mark.offsetWidth + 'x' +
      mark.offsetHeight + ' by-value=' + (W1_BOX.w * k) + 'x' +
      (W1_BOX.h * k) + ' face=[' + input.fontStyle + '] inScene=[' +
      input.sceneLeft.toFixed(0) + '..' + input.sceneRight.toFixed(0) +
      '/' + input.sceneW.toFixed(0) + '] move=' + dPos + ' scale=' + dScale);
  }
  ok(w1Measured === KS.length, 'G-W1/measured-count',
    'expected ' + KS.length + ' G-W1 measurement rounds (one per pinned ' +
    'scale), completed ' + w1Measured + '. A loop that silently measured ' +
    'fewer than it claims is the defect class this whole file is written ' +
    'against.');

  /* ---- (G-17-live) 26.91-17: THE TWO DOORS, ON THE GLASS ---------------
     The predicate is a SOURCE claim and is stated as one; the boxes are a
     RENDERED claim and are measured. Neither is presented as the other. */
  ok(FLIP_SCOPED.back && FLIP_SCOPED.fwd, 'G-17/day-scoped',
    'SOURCE CLAIM, LABELLED AS SUCH (no rendered box can show a ' +
    'condition): BOTH doors in paintNotebookSpread guard on the ' +
    'NEIGHBOUR\'s day equalling the OPEN spread\'s day. Her ruling of ' +
    '2026-08-09 — remove the arrow when it is the last page of the day. ' +
    'Measured: backward=' + FLIP_SCOPED.back + ' forward=' +
    FLIP_SCOPED.fwd + '. BOTH are required: scoping only the forward door ' +
    'would leave the backward one able to walk her onto a different date, ' +
    'the same defect facing the other way. The DRIVEN half of this claim ' +
    'is (G-17/doors) in test_blessings_notebook.cjs; this line pins the ' +
    'shape, and the two are stated separately on purpose.');
  FLIP.forEach(function (c) {
    ok(typeof c.glyph === 'string' && c.glyph.length > 0 &&
       c.cls.indexOf('station-flip') !== -1, 'G-17/lifted',
      '[' + c.name + ']: the glyph and class list are LIFTED off ' +
      'paintNotebookSpread — glyph ' + JSON.stringify(c.glyph) + ', class ' +
      JSON.stringify(c.cls) + '. A lift that silently yielded an empty ' +
      'string would make every measurement below vacuous.');
  });
  let flipMeasured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const f = runs[i].data.flip;
    if (!ok(f.count === FLIP.length, 'G-17/flip-count',
      'k=' + k + ': expected exactly ' + FLIP.length + ' node(s) matching ' +
      '[data-flip], measured ' + f.count + '. Asserted BEFORE any geometry ' +
      'is read, so a blank page fails HERE rather than passing vacuously ' +
      'through a loop that never runs.')) {
      continue;
    }
    let perK = 0;
    for (let j = 0; j < FLIP.length; j++) {
      const c = FLIP[j];
      const n = f.nodes[c.name];
      if (!ok(n, 'G-17/flip-present',
        'k=' + k + ': no node resolved for [data-flip="' + c.name + '"].')) {
        continue;
      }
      ok(n.text === c.glyph, 'G-17/flip-face',
        'k=' + k + ' [' + c.name + ']: the door renders ' +
        JSON.stringify(n.text) + '; app.js paints ' +
        JSON.stringify(c.glyph) + '. 26.91-17 changed WHEN these render, ' +
        'never WHAT they say — no disabled control, no end-of-book copy, ' +
        'no replacement for the door that is absent at a day boundary.');
      ok(n.offsetWidth > 0 && n.offsetHeight > 0, 'G-17/flip-visible',
        'k=' + k + ' [' + c.name + ']: the door must resolve to a NON-ZERO ' +
        'box; measured ' + n.offsetWidth + 'x' + n.offsetHeight + '. This ' +
        'is the assertion the node suite cannot make: a door painted at ' +
        'zero size satisfies every structural check while being invisible.');
      ok(n.display !== 'none' && n.visibility !== 'hidden', 'G-17/flip-shown',
        'k=' + k + ' [' + c.name + ']: display=' + n.display +
        ' visibility=' + n.visibility + '. A door hidden by the cascade is ' +
        'a different bug wearing the same non-zero box.');
      ok(Math.round(n.offsetWidth / k) === c.slot.w &&
         Math.round(n.offsetHeight / k) === c.slot.h, 'G-17/flip-slot',
        'k=' + k + ' [' + c.name + ']: the door occupies its OWN declared ' +
        'slot — measured ' + n.offsetWidth + 'x' + n.offsetHeight +
        ', expected ' + (c.slot.w * k) + 'x' + (c.slot.h * k) + ' from ' +
        'STATION_NOTEBOOK_GEOM.' + c.name + '. This plan moved no slot; ' +
        'this is the line that says so on the glass rather than in prose.');
      perK++;
    }
    ok(perK === FLIP.length, 'G-17/per-k-complete',
      'k=' + k + ': measured ' + perK + ' of ' + FLIP.length + ' doors. A ' +
      'loop that silently measured fewer than it claims is the defect class ' +
      'this whole file is written against.');
    flipMeasured++;
  }
  ok(flipMeasured === KS.length, 'G-17/measured-count',
    'expected ' + KS.length + ' G-17 measurement rounds (one per pinned ' +
    'scale), completed ' + flipMeasured + '. Asserted so the per-k loop ' +
    'cannot pass by never running.');

  /* ---- (G-18-live) 26.91-18: THE ARMED CURSOR, AS A DIFFERENCE ---------- */
  console.log('(G-18-live) the armed tool changes the pointer at her hand');

  let armedMeasured = 0;
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.armed;
    const S = m.states;

    /* EMPTY FIRST — the node count pinned BY VALUE, before any style is read.
       A blank page yields zero nodes and must fail HERE rather than pass
       vacuously through a loop that never runs. */
    if (!ok(m.count === ARM_NODE_COUNT, 'G-18/node-count',
      'k=' + k + ': expected exactly ' + ARM_NODE_COUNT + ' [data-arm] ' +
      'node(s) (canvas, mark, chip, grip), measured ' + m.count + '.')) {
      continue;
    }

    /* THE HOOK IS REALLY DRIVEN BY THE SHIPPED SETTERS. If these are wrong,
       every cursor assertion below is measuring a page in the wrong state. */
    ok(S.disarmed.bodyClass === '', 'G-18/rest-clean',
      'k=' + k + ': with no tool armed the body must carry NO armed class; ' +
      'it carries ' + JSON.stringify(S.disarmed.bodyClass) + '.');
    /* 26.91-22: REWRITTEN INTO THREE PARTS. The retired form asserted that
       both tools drive the SAME body state, which A-15 ruling 2 retires —
       she asked for the two armed tools to look DIFFERENT. What survives is
       the idiom: both still reach the SHARED token (which is what the
       fallback rule hangs off), each additionally sets its OWN, and the two
       states therefore DIFFER. All three parts are load-bearing — the
       shared half alone would pass the wave-18 design this plan replaces,
       and the difference alone would pass a build that dropped the shared
       token and with it the keyword fallback. */
    ok(S.penArmed.bodyClass.split(' ').indexOf(ARM_SHARED_CLS) !== -1 &&
       S.writeArmed.bodyClass.split(' ').indexOf(ARM_SHARED_CLS) !== -1,
      'G-18/shared-state',
      'k=' + k + ': BOTH armed tools must drive the SHARED body token ' +
      JSON.stringify(ARM_SHARED_CLS) + ' — the pen set ' +
      JSON.stringify(S.penArmed.bodyClass) + ' and `write` set ' +
      JSON.stringify(S.writeArmed.bodyClass) + '. This is the surviving ' +
      'half of one-idiom-two-instances: the shared rule is what states that ' +
      'the armed page is a drawing surface AND what carries the keyword ' +
      'fallback, so a tool that reached only its own token would show the ' +
      'default arrow wherever its image cannot load.');
    ok(S.penArmed.bodyClass.split(' ').indexOf(ARM_PEN_CLS) !== -1 &&
       S.writeArmed.bodyClass.split(' ').indexOf(ARM_WRITE_CLS) !== -1,
      'G-18/own-state',
      'k=' + k + ': and each armed tool must ALSO drive its OWN token — the ' +
      'pen ' + JSON.stringify(ARM_PEN_CLS) + ', `write` ' +
      JSON.stringify(ARM_WRITE_CLS) + '. Measured: pen ' +
      JSON.stringify(S.penArmed.bodyClass) + ', write ' +
      JSON.stringify(S.writeArmed.bodyClass) + '. A token set by one setter ' +
      'and hoped for in the other is right in whichever direction somebody ' +
      'drove it and silently wrong in the other.');
    ok(S.penArmed.bodyClass !== S.writeArmed.bodyClass, 'G-18/state-differs',
      'k=' + k + ': AND THE TWO STATES MUST DIFFER. Her ruling at beat S5, ' +
      'verbatim: "i need pen and write\'s curor should look different, like ' +
      'pen is a inkpen and write is a pencil." Two identical body states ' +
      'cannot carry two different cursors, so this is the assertion that ' +
      'stops the shared cursor quietly coming back. Measured pen ' +
      JSON.stringify(S.penArmed.bodyClass) + ' vs write ' +
      JSON.stringify(S.writeArmed.bodyClass) + '.');
    ok(S.bothOff.bodyClass === '', 'G-18/no-stale-state',
      'k=' + k + ': disarming must LEAVE NO armed class behind; the body ' +
      'still carries ' + JSON.stringify(S.bothOff.bodyClass) + '. A hook ' +
      'that outlives its mode is a drawing cursor stranded on the room.');

    /* THE DIFFERENCE, AT BOTH NODES, FOR BOTH ARMED TOOLS. */
    ['canvas', 'mark'].forEach(function (node) {
      ok(S.disarmed[node] !== S.penArmed[node], 'G-18/' + node + '/pen-diff',
        'k=' + k + ' [' + node + ']: the PEN must CHANGE the cursor here. ' +
        'Disarmed it is ' + JSON.stringify(S.disarmed[node]) + ' and armed ' +
        'it is ' + JSON.stringify(S.penArmed[node]) + ' — identical, so the ' +
        'armed state is invisible at this surface. For [mark] this is the ' +
        'canvas-only failure: a mark is stacked ABOVE the canvas and ' +
        'declares its own cursor, and F-17 is by definition the pointer ' +
        'OVER A MARK. For [canvas] this is the chip-only failure: a cursor ' +
        'hung off the band changes nothing where she is looking.');
      ok(S.disarmed[node] !== S.writeArmed[node],
        'G-18/' + node + '/write-diff',
        'k=' + k + ' [' + node + ']: `write` must change it too. Disarmed ' +
        JSON.stringify(S.disarmed[node]) + ', armed ' +
        JSON.stringify(S.writeArmed[node]) + '. Giving one armed tool a ' +
        'cursor and not the other falsifies the one-idiom invariant the ' +
        'shipped stylesheet states in its own words.');
      /* 26.91-22: `equal` BECAME `distinct`, AND THE RETIRED CLAIM'S REASON
         IS RECORDED RATHER THAN JUST DROPPED. The old assertion required
         the two armed tools to read IDENTICALLY. It rested on an antecedent
         — *these two tools behave identically* — that was FALSE in the
         shipped app, which is the finding her seal-UAT beat S5 produced:
         `attachPageDrag`'s pointerdown guard tested NB_PEN only, so the pen
         locked a placed mark and `write` did not. Wave 20 aligned the
         mark-lock property, and MEASURED that even then the two are not
         behaviourally equal (`write` over a mark still makes nothing while
         the pen draws — deferred-items D-9). So the premise never became
         true, and she had meanwhile ruled for the opposite conclusion. This
         is the assertion whose reddening actually blocked the two-cursor
         work; it is rewritten to the claim that is true. */
      ok(S.penArmed[node] !== S.writeArmed[node],
        'G-18/' + node + '/distinct',
        'k=' + k + ' [' + node + ']: the two armed tools must read ' +
        'DIFFERENTLY here — the armed pointer has to say WHICH tool is ' +
        'armed, on the surface she is looking at while she draws. Measured ' +
        'pen ' + JSON.stringify(S.penArmed[node]) + ' vs write ' +
        JSON.stringify(S.writeArmed[node]) + '.');
      ok(S.disarmed[node] === S.bothOff[node], 'G-18/' + node + '/restored',
        'k=' + k + ' [' + node + ']: disarming must RESTORE the resting ' +
        'cursor — was ' + JSON.stringify(S.disarmed[node]) + ', ended ' +
        JSON.stringify(S.bothOff[node]) + '.');
      armedMeasured++;
    });

    /* THE ONE-RULE INVARIANT, made mechanical in the other direction.
       26.91-22: EXTENDED TO `write`. It previously asserted this for the pen
       alone, so a per-tool rule that reached only ONE of the two subjects —
       the bare page but not a placed mark, which is by definition the
       gesture F-17 is about — would have passed for `write`. Both tools are
       now checked, and neither loop is a substitute for the other. */
    ['penArmed', 'writeArmed'].forEach(function (state) {
      ok(S[state].canvas === S[state].mark, 'G-18/one-rule',
        'k=' + k + ' [' + state + ']: the canvas and a placed mark must ' +
        'carry the SAME armed cursor — canvas ' +
        JSON.stringify(S[state].canvas) + ', mark ' +
        JSON.stringify(S[state].mark) + '. They come from ONE rule naming ' +
        'both; two values means two rules, and two rules drift.');
    });

    /* NEGATIVE 1 — THE BAND. The gate must not be satisfiable at the chip. */
    ok(S.disarmed.chip === S.penArmed.chip &&
       S.disarmed.chip === S.writeArmed.chip, 'G-18/chip-unchanged',
      'k=' + k + ': the band chip\'s cursor must be the SAME armed and ' +
      'disarmed — measured ' + JSON.stringify(S.disarmed.chip) + ' / ' +
      JSON.stringify(S.penArmed.chip) + '. She looks at the PAGE while she ' +
      'draws, so a cursor that moved onto the band would be a fix she can ' +
      'never see. This assertion is what stops the gate\'s subject drifting ' +
      'back to the surface her ruling excludes.');

    /* NEGATIVE 2 — THE MARK'S CHROME. The exclusion is a DECISION, pinned. */
    ok(S.disarmed.grip === S.penArmed.grip &&
       S.disarmed.grip === S.writeArmed.grip, 'G-18/grip-unchanged',
      'k=' + k + ': a mark\'s grip must keep its OWN cursor while a tool is ' +
      'armed — measured ' + JSON.stringify(S.disarmed.grip) + ' / ' +
      JSON.stringify(S.penArmed.grip) + '. The grips are the one place ' +
      'inside a mark\'s footprint where the gesture is NOT the armed ' +
      'tool\'s, so an armed cursor there would promise DRAWING where a ' +
      'resize or a delete actually happens — the inversion of F-17, not its ' +
      'fix. The exclusion is a decision and this is what makes it one.');
  }
  ok(armedMeasured === KS.length * 2, 'G-18/measured-count',
    'expected ' + (KS.length * 2) + ' armed-cursor node measurements (two ' +
    'nodes at each of ' + KS.length + ' pinned scales), completed ' +
    armedMeasured + '. Asserted so the per-k loop cannot pass by never ' +
    'running.');


  /* ---- G-27/live — 26.91-30 (F-26): THE DRAWN REGION, MEASURED --------- */
  console.log('(G-27/live) the drawn legal region — live geometry at every --k');

  ok(LIVE_REGION.x0 === LIVE_REGION_PINNED.x0 &&
    LIVE_REGION.x1 === LIVE_REGION_PINNED.x1 &&
    LIVE_REGION.y0 === LIVE_REGION_PINNED.y0 &&
    LIVE_REGION.y1 === LIVE_REGION_PINNED.y1, 'G-27/live/region-pinned',
  'NB_MARK_REGION lifted from app.js evaluates to ' +
    JSON.stringify(LIVE_REGION) + ' against the BY-VALUE pin ' +
    JSON.stringify(LIVE_REGION_PINNED) + '. The two sides of every ' +
    'comparison below must not come from the same place.');

  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const R = runs[i].data.region;

    if (!ok(R && R.arranging && R.arranging.count === 6,
      'G-27/live/node-count',
      'k=' + k + ': expected exactly 6 [data-reg] node(s), measured ' +
      ((R && R.arranging && R.arranging.count) || 0) + '. A blank page ' +
      'fails HERE rather than passing through a zero-iteration loop.')) {
      continue;
    }

    const A = R.arranging.nodes;
    const D = R.reading.nodes;
    const truth = A['region-true'];
    const plant = A['region-plant'];
    const broken = A['region-inert-broken'];
    const canvas = A['canvas-live'];
    const inkbox = A['inkbox-live'];
    const deco = A['deco-live'];

    /* ---- (1) THE BOX, ON ALL FOUR EDGES, WITHIN ONE DEVICE PIXEL ------- */
    const scene = { left: truth.left - LIVE_REGION_PINNED.x0 * k,
      top: truth.top - LIVE_REGION_PINNED.y0 * k };
    const expW = (LIVE_REGION_PINNED.x1 - LIVE_REGION_PINNED.x0 + 1) * k;
    const expH = (LIVE_REGION_PINNED.y1 - LIVE_REGION_PINNED.y0 + 1) * k;
    ok(Math.abs(truth.width - expW) <= 1 && Math.abs(truth.height - expH) <= 1,
      'G-27/live/region-box',
      'k=' + k + ': the drawn region measured ' + truth.width.toFixed(2) +
      ' x ' + truth.height.toFixed(2) + ' px against the BY-VALUE ' +
      'expectation ' + expW + ' x ' + expH + ' (the INCLUSIVE region ' +
      JSON.stringify(LIVE_REGION_PINNED) + ' sized as a COUNT, scaled by ' +
      '--k=' + k + '). The bounds are inclusive because server.py compares ' +
      'with <=, so a mark whose ink lands exactly ON x1 is ACCEPTED.');

    /* ---- (2) THE PLANT, PROVEN ABLE TO FIRE, AND ITS DELTA REPORTED ---- */
    const dRight = plant.right - truth.right;
    const dBottom = plant.bottom - truth.bottom;
    console.log('  G-27/live k=' + k + ' PLANT DELTA right=' +
      dRight.toFixed(2) + ' px  bottom=' + dBottom.toFixed(2) + ' px ' +
      '(the retired hairline sat on the OLD canvas box ' +
      JSON.stringify(LIVE_OLD_BOX) + ')');
    ok(Math.abs(dRight - 4 * k) <= 1, 'G-27/live/plant-fires',
      'k=' + k + ': the plant — a region sized to the OLD canvas box, the ' +
      '384 edge — must sit measurably to the RIGHT of the honest one. ' +
      'Measured a right-edge delta of ' + dRight.toFixed(2) + ' px against ' +
      'the expected ' + (4 * k) + ' (4 scene px x --k). A zero delta would ' +
      'mean the fix drew the same rectangle it replaced, and this gate ' +
      'would be about a rectangle rather than about F-26.');
    ok(Math.abs(dBottom) <= 1, 'G-27/live/plant-bottom-measured',
      'k=' + k + ': and the BOTTOM delta measured ' + dBottom.toFixed(2) +
      ' px. THIS IS A FINDING, MEASURED RATHER THAN QUOTED: the phase ' +
      'record carries the asymmetry as 5 page px right / 1 bottom (15 / 3 ' +
      'screen px at k=3), which compares the CONSTANTS (384 vs 379, 190 vs ' +
      '189). Edge to edge, the numbers a user can actually see, the drawn ' +
      'line moves 4 scene px on the right and ZERO on the bottom — the ' +
      'canvas box already ended at 190 and the inclusive region ends at ' +
      '190 too. At k=3 that is 12 screen px against 0, not 15 against 3.');

    /* ---- (3) INERTNESS, READ LIVE IN BOTH MODES, HANDLES RE-QUERIED ---- */
    ok(truth.pointerEvents === 'none', 'G-27/live/region-inert',
      'k=' + k + ': the drawn region computes pointer-events=' +
      JSON.stringify(truth.pointerEvents) + ' while arranging; it must be ' +
      '"none". The hairline is a drawing, never a target.');
    ok(D['region-true'] && D['region-true'].pointerEvents === 'none',
      'G-27/live/region-inert-both-modes',
      'k=' + k + ': and reading mode computes ' +
      JSON.stringify(D['region-true'] && D['region-true'].pointerEvents) +
      '. RE-QUERIED after the real class change — a stale handle returns ' +
      '"" and reads exactly like a pass.');
    ok(canvas.pointerEvents === 'auto', 'G-27/live/canvas-live-while-arranging',
      'k=' + k + ': .page-deco-canvas computes pointer-events=' +
      JSON.stringify(canvas.pointerEvents) + ' under body.nb-design; it ' +
      'must be "auto". This is the placement and pen target and F-26 must ' +
      'not have moved it.');
    ok(D['canvas-live'] && D['canvas-live'].pointerEvents === 'none',
      'G-27/live/canvas-inert-while-reading',
      'k=' + k + ': and with nb-design removed it computes ' +
      JSON.stringify(D['canvas-live'] && D['canvas-live'].pointerEvents) +
      '. This is the POSITIVE CONTROL for the mode change itself: without ' +
      'it, every reading-mode reading above could be a re-read of the ' +
      'arranging page.');

    /* ---- (4) THE LOCALISATION CHECK ----------------------------------- */
    ok(Math.abs(broken.right - truth.right) <= 1 &&
      Math.abs(broken.bottom - truth.bottom) <= 1 &&
      broken.pointerEvents === 'auto',
    'G-27/live/localisation',
    'k=' + k + ': the localisation probe must have the CORRECT box and the ' +
      'WRONG inertness, so exactly one assertion can see it. Measured box ' +
      'delta (' + (broken.right - truth.right).toFixed(2) + ',' +
      (broken.bottom - truth.bottom).toFixed(2) + ') and pointer-events=' +
      JSON.stringify(broken.pointerEvents) + '. An instrument that reddens ' +
      'everything at once has not localised anything.');

    /* ---- (5) Z-ORDER — the region under her marks, the ink box over ---- */
    ok(parseInt(truth.zIndex, 10) < parseInt(deco.zIndex, 10),
      'G-27/live/region-under-her-marks',
      'k=' + k + ': the region computes z-index ' + truth.zIndex +
      ' against .page-deco\'s ' + deco.zIndex + '. Law 4: chrome is painted ' +
      'BESIDE her content, never over it.');
    ok(parseInt(inkbox.zIndex, 10) > parseInt(truth.zIndex, 10) &&
      inkbox.pointerEvents === 'none' && inkbox.outlineStyle === 'dashed',
    'G-27/live/inkbox-register',
    'k=' + k + ': the ink box computes z-index ' + inkbox.zIndex +
      ' (must exceed the region\'s ' + truth.zIndex + '), pointer-events=' +
      JSON.stringify(inkbox.pointerEvents) + ' and outline-style=' +
      JSON.stringify(inkbox.outlineStyle) + '. The two hairlines are told ' +
      'apart by PATTERN in the same var(--paper-shadow) — no second hex, ' +
      'so the palette register stays at 13 (A-17).');
  }

  /* ---- G-28/live — 26.91-35 (F-28): THE DASHED BOX, MEASURED ----------
     THE FIVE ANTI-VACUITY QUESTIONS (26.91-VALIDATION.md), ANSWERED IN
     WRITING FOR THIS GROUP:

     1. CAN IT PASS BEFORE THE WORK? NO. Driven RED at HEAD before a source
        byte moved: `G-28/live/cross-scale-equal` failed at every one of the
        five pinned `--k`, with the three measured width ratios standing in
        the `1 : 1/0.5 : 1/2` proportion the defect predicts.
     2. CAN IT STILL PASS ONCE THE WORK IS BROKEN? NO. Five mutations were
        driven, each sha256-verified as LANDED before its exit code was
        believed, each red on its INTENDED named assertion — drop the scale
        from the emitted width; drop it from the emitted origin (the box
        shrinks but walks off the mark); drop the rotation from the CSS rule;
        set the rotation origin to `center`; break the `cssBlock` lift's
        target so it finds no declaration.
     3. DOES A DEGENERATE IMPLEMENTATION SATISFY IT? NO. That is the whole
        reason the criterion is a ratio across THREE records differing only in
        `s`, compared to each other in one run. A box hard-coded to any single
        size passes a *the box got smaller* check and fails here. The node
        count is pinned BY VALUE and asserted BEFORE any geometry is read, so
        a blank page fails on the count rather than passing through a
        zero-iteration loop.
     4. IS IT READING EVALUATION ORDER OR SOURCE ORDER? EVALUATION. Every
        number compared below comes off `getBoundingClientRect` and
        `getComputedStyle` on a live page. The two source-shape assertions at
        the end are declared BACKSTOPS and are named as such — they exist to
        pin `rotation only, never scale`, which is a statement about the rule
        rather than about a rendering.
     5. DOES THE GREP MATCH THE FIX'S OWN COMMENT RATHER THAN THE FIX? NO. The
        stylesheet lift is `cssBlock`, which is a balanced-brace scan over
        COMMENT-STRIPPED bytes and returns only the declaration body. The fix's
        prose is stripped before anything is matched.

     WHAT THIS GROUP DOES NOT PROVE: it cannot say whether the corrected box
     READS to her as describing the mark she is holding. That is beat U1 of
     the seventh seal at plan 41, where it is routed rather than absorbed. */
  console.log('(G-28/live) the dashed box against the mark it describes');

  /* the subpixel allowance, pinned BY VALUE and in CSS px. The error this
     group exists to catch is a FACTOR of 1/s — a doubling at the floor — so
     no tolerance in this neighbourhood can hide it. */
  const INK_EPS = 1.0;

  /* the axis-aligned bounding box the shipped rules must produce, DERIVED
     from the record's own `a` and `s` and the lifted extent. Nothing on the
     expected side is typed. The scene's origin is recovered from the CORAL
     WRAPPER's own measured rect rather than assumed, so this comparison never
     depends on where the harness happened to lay the scene out. */
  function inkExpect(g, k, wrapNode) {
    const rad = g.a * Math.PI / 180;
    const co = Math.cos(rad);
    const si = Math.sin(rad);
    const ac = Math.abs(co);
    const as = Math.abs(si);
    const Wh = g.w * g.s;
    const Hh = g.h * g.s;
    const Wi = g.iw * g.s;
    const Hi = g.ih * g.s;
    /* THE MARK'S CENTRE — the point `.page-deco` scales and turns about, and
       therefore the point the dashed box must turn about too. */
    const Cx = g.rec.x + g.w / 2;
    const Cy = g.rec.y + g.h / 2;
    /* previewDecoTransform's centring idiom, applied to a SUB-box. With
       `ie.x0 === 0` these two lines reduce EXACTLY to `rec.x + (w - w*s)/2`. */
    const bx = g.rec.x + g.ie.x0 * g.s + (g.w - Wh) / 2;
    const by = g.rec.y + g.ie.y0 * g.s + (g.h - Hh) / 2;
    const dx = bx + Wi / 2 - Cx;
    const dy = by + Hi / 2 - Cy;
    const rx = dx * co - dy * si;
    const ry = dx * si + dy * co;
    const wW = Wh * ac + Hh * as;
    const wH = Wh * as + Hh * ac;
    const sceneLeft = wrapNode.left - (Cx - wW / 2) * k;
    const sceneTop = wrapNode.top - (Cy - wH / 2) * k;
    const iW = Wi * ac + Hi * as;
    const iH = Wi * as + Hi * ac;
    return {
      left: sceneLeft + (Cx + rx - iW / 2) * k,
      top: sceneTop + (Cy + ry - iH / 2) * k,
      width: iW * k, height: iH * k,
      wrapWidth: wW * k, wrapHeight: wH * k,
      originX: (g.w / 2 - g.ie.x0) * g.s * k,
      originY: (g.h / 2 - g.ie.y0) * g.s * k
    };
  }

  ok(INK_FNS.NB_S_MIN === 0.5 && INK_FNS.NB_S_MAX === 2,
    'G-28/live/scale-bounds-lifted',
    'the scale bounds LIFTED from app.js evaluate to [' + INK_FNS.NB_S_MIN +
    ', ' + INK_FNS.NB_S_MAX + ']. Pinned BY VALUE at [0.5, 2] because the ' +
    'three-scale criterion needs three genuinely distinct, genuinely ' +
    'REACHABLE points: 26.91-35-PLAN names 0.25 as "the floor", and 0.25 is ' +
    'not reachable through clampDecoScale at all. Both sides of this ' +
    'comparison must not come from the same place.');

  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const M = runs[i].data.ink;

    if (!ok(M && M.count === INK_NODE_COUNT, 'G-28/live/node-count',
      'k=' + k + ': expected exactly ' + INK_NODE_COUNT + ' [data-ink] ' +
      'node(s) (' + INK_SHAPES.length + ' record shapes x 3: the mark, the ' +
      'coral wrapper, the dashed box), measured ' +
      ((M && M.count) || 0) + '. A blank page fails HERE rather than ' +
      'passing through a zero-iteration loop.')) {
      continue;
    }

    const ratios = [];
    for (let j = 0; j < INK_GEOM.length; j++) {
      const g = INK_GEOM[j];
      const nm = g.sh.name;
      const inkN = M.nodes[nm + '-ink'];
      const wrapN = M.nodes[nm + '-wrap'];
      const decoN = M.nodes[nm + '-deco'];

      if (!ok(inkN && wrapN && decoN, 'G-28/live/nodes-present',
        'k=' + k + ' [' + nm + ']: one of the three nodes did not resolve.')) {
        continue;
      }
      if (!ok(inkN.width > 0 && wrapN.width > 0 && decoN.width > 0,
        'G-28/live/boxes-nonzero',
        'k=' + k + ' [' + nm + ']: measured widths ink=' + inkN.width +
        ' wrap=' + wrapN.width + ' deco=' + decoN.width + '; all three must ' +
        'be > 0 before any ratio is judged. A zero-size box makes every ' +
        'ratio below NaN, and NaN comparisons read exactly like a pass.')) {
        continue;
      }

      const E = inkExpect(g, k, wrapN);

      /* --- (1) THE POSITIVE CONTROL: the coral wrapper really is the mark.
         Independent of this fix — it is what proves the harness placed the
         wrapper by previewDecoTransform's own arithmetic rather than by a
         copy of it, and therefore that the ratios below are measured against
         the mark and not against a rectangle the test invented. */
      ok(Math.abs(wrapN.width - decoN.width) <= INK_EPS &&
        Math.abs(wrapN.height - decoN.height) <= INK_EPS &&
        Math.abs(wrapN.left - decoN.left) <= INK_EPS &&
        Math.abs(wrapN.top - decoN.top) <= INK_EPS,
      'G-28/live/wrapper-is-the-mark',
      'k=' + k + ' [' + nm + ']: the coral wrapper measured ' +
        wrapN.width.toFixed(2) + 'x' + wrapN.height.toFixed(2) + ' at (' +
        wrapN.left.toFixed(2) + ',' + wrapN.top.toFixed(2) + ') against the ' +
        'mark\'s own ' + decoN.width.toFixed(2) + 'x' +
        decoN.height.toFixed(2) + ' at (' + decoN.left.toFixed(2) + ',' +
        decoN.top.toFixed(2) + '). previewDecoTransform sizes the wrapper to ' +
        'the ALREADY-SCALED box and gives it the rotation only, so the two ' +
        'must coincide. Without this the ratios below could be taken ' +
        'against a rectangle this test invented.');

      const ratioW = inkN.width / wrapN.width;
      const ratioH = inkN.height / wrapN.height;
      if (g.sh.scaleRow) { ratios.push({ g: g, w: ratioW, h: ratioH }); }
      console.log('  G-28/live k=' + k + ' [' + nm + '] s=' + g.s + ' a=' +
        g.a + '  dashed/coral = ' + ratioW.toFixed(4) + ' x ' +
        ratioH.toFixed(4) + '  (ink ' + inkN.width.toFixed(2) + 'x' +
        inkN.height.toFixed(2) + ', coral ' + wrapN.width.toFixed(2) + 'x' +
        wrapN.height.toFixed(2) + ')');

      /* --- (2) THE RATIO IS THE COUNT RESIDUAL AND NOTHING ELSE ---------
         For an UNROTATED record the ratio is `iw / w` — the span-versus-count
         seam — and it must not be a function of `s`. At HEAD it is `iw/w/s`. */
      if (g.a === 0) {
        ok(Math.abs(ratioW - g.iw / g.w) <= INK_EPS / wrapN.width &&
          Math.abs(ratioH - g.ih / g.h) <= INK_EPS / wrapN.height,
        'G-28/live/ratio-is-the-count-residual',
        'k=' + k + ' [' + nm + ', s=' + g.s + ']: the dashed-box-to-coral ' +
          'ratio measured ' + ratioW.toFixed(4) + ' x ' + ratioH.toFixed(4) +
          ' against the expectation ' + (g.iw / g.w).toFixed(4) + ' x ' +
          (g.ih / g.h).toFixed(4) + ' — the record\'s own ink COUNT (' +
          g.iw + 'x' + g.ih + ', from decoPointExtent) over its box SPAN (' +
          g.w + 'x' + g.h + ', from decoBox/strokeBox). THE EXPECTATION ' +
          'CARRIES NO `s` AT ALL: that is the whole of F-28. At HEAD this ' +
          'measures the expectation divided by ' + g.s + '.');

        /* --- (3) AND THE ORIGIN FOLLOWS THE SCALE TOO --------------------
           A fix that scaled the SIZE but left the origin raw gives a box of
           the right size sitting in the wrong place. Scene-independent: both
           lefts carry the same scene origin, so it cancels. */
        ok(Math.abs((inkN.left - wrapN.left) - g.ie.x0 * g.s * k) <= INK_EPS &&
          Math.abs((inkN.top - wrapN.top) - g.ie.y0 * g.s * k) <= INK_EPS,
        'G-28/live/origin-follows-the-scale',
        'k=' + k + ' [' + nm + ', s=' + g.s + ']: the dashed box sits (' +
          (inkN.left - wrapN.left).toFixed(2) + ',' +
          (inkN.top - wrapN.top).toFixed(2) + ') px inside the coral ' +
          'wrapper; the record\'s ink starts at (' + g.ie.x0 + ',' +
          g.ie.y0 + ') so at s=' + g.s + ' and --k=' + k + ' that must be (' +
          (g.ie.x0 * g.s * k).toFixed(2) + ',' +
          (g.ie.y0 * g.s * k).toFixed(2) + '). A box of the right SIZE in ' +
          'the wrong PLACE is still a line that lies about the mark.');
      }

      /* --- (4) THE ROTATED CASE, AGAINST A DIFFERENCE COMPUTED FROM THE
         RECORD. Both rectangles turn, so their axis-aligned rects differ by a
         quantity derived from this record's own `a` and `s`. No typed
         constant appears on the expected side. */
      if (g.a !== 0) {
        ok(Math.abs(inkN.width - E.width) <= INK_EPS &&
          Math.abs(inkN.height - E.height) <= INK_EPS,
        'G-28/live/rotated-extent-from-the-record',
        'k=' + k + ' [' + nm + ', s=' + g.s + ', a=' + g.a + ']: the dashed ' +
          'box\'s axis-aligned rect measured ' + inkN.width.toFixed(2) + 'x' +
          inkN.height.toFixed(2) + ' against ' + E.width.toFixed(2) + 'x' +
          E.height.toFixed(2) + ', COMPUTED from this record as ' +
          '(iw*s)|cos a| + (ih*s)|sin a| with iw=' + g.iw + ' ih=' + g.ih +
          ' s=' + g.s + ' a=' + g.a + '. The coral wrapper measured ' +
          wrapN.width.toFixed(2) + 'x' + wrapN.height.toFixed(2) +
          ' against its own computed ' + E.wrapWidth.toFixed(2) + 'x' +
          E.wrapHeight.toFixed(2) + '. Her flower is s≈0.675 a=328, where ' +
          'the rotation NEARLY CANCELS the error on screen — which is why ' +
          'only one mark showed F-28 and why she was right and the driver ' +
          'was wrong when it predicted this one would read wrong too.');

        ok(Math.abs(inkN.left - E.left) <= INK_EPS &&
          Math.abs(inkN.top - E.top) <= INK_EPS,
        'G-28/live/rotated-origin-is-the-marks-centre',
        'k=' + k + ' [' + nm + ', a=' + g.a + ']: the dashed box\'s ' +
          'axis-aligned rect starts at (' + inkN.left.toFixed(2) + ',' +
          inkN.top.toFixed(2) + ') against the computed (' +
          E.left.toFixed(2) + ',' + E.top.toFixed(2) + '). The ink box is a ' +
          'SUB-box: its centre sits (' +
          (g.ie.x0 + g.iw / 2 - g.w / 2).toFixed(2) + ',' +
          (g.ie.y0 + g.ih / 2 - g.h / 2).toFixed(2) + ') record px from the ' +
          'MARK\'s centre, so `transform-origin: center` — correct for ' +
          '.page-deco-handles, whose box IS the mark\'s box — turns this one ' +
          'about the wrong point and walks it off the mark.');
      }

      /* --- (5) AND THE ORIGIN READ LIVE, NOT INFERRED FROM THE POSITION --
         The rect assertions above would also pass on a build that got the
         origin wrong and the placement compensatingly wrong. This reads the
         computed property itself. */
      const om = /^(-?[0-9.]+)px (-?[0-9.]+)px/.exec(
        String(inkN.transformOrigin || ''));
      ok(om && Math.abs(Number(om[1]) - E.originX) <= INK_EPS &&
        Math.abs(Number(om[2]) - E.originY) <= INK_EPS,
      'G-28/live/origin-computed-at-the-marks-centre',
      'k=' + k + ' [' + nm + ']: computed transform-origin is ' +
        JSON.stringify(inkN.transformOrigin) + '; expected ' +
        E.originX.toFixed(2) + 'px ' + E.originY.toFixed(2) + 'px — the ' +
        'offset from THIS box\'s own top-left to the MARK\'s centre, ' +
        '(w/2 - ie.x0)*s and (h/2 - ie.y0)*s, multiplied by --k=' + k +
        ' exactly as left/top/width/height already are. Read off the ' +
        'computed property rather than inferred from the rect, because a ' +
        'wrong origin plus a compensatingly wrong placement satisfies a ' +
        'rect-only check.');

      /* --- (6) THE REGISTER DID NOT MOVE. Still dashed, still inert, still
         above the region — F-26's contract, unweakened by F-28's fix. */
      ok(inkN.outlineStyle === 'dashed' && inkN.pointerEvents === 'none' &&
        parseInt(inkN.zIndex, 10) === 54,
      'G-28/live/register-unmoved',
      'k=' + k + ' [' + nm + ']: the dashed box computes outline-style=' +
        JSON.stringify(inkN.outlineStyle) + ' pointer-events=' +
        JSON.stringify(inkN.pointerEvents) + ' z-index=' + inkN.zIndex +
        '. F-28 changes only what is DRAWN about a gesture: no new colour, ' +
        'no new token, and the two hairlines are still told apart by ' +
        'PATTERN in the same var(--paper-shadow).');
    }

    /* --- (7) THE CRITERION. THREE SCALES, ONE RUN, EQUAL RATIOS. ---------
       This is the assertion this gate was built to redden. A single-scale
       check of the form *the box got smaller* is satisfied by hard-coding
       the box to any fixed size; this one is not. */
    if (ok(ratios.length === 3, 'G-28/live/three-scales-measured',
      'k=' + k + ': expected 3 unrotated scale rows, collected ' +
      ratios.length + '. The cross-scale criterion cannot be evaluated on ' +
      'fewer, and a short loop must fail here rather than skip it.')) {
      const ws = ratios.map(function (r) { return r.w; });
      const hs = ratios.map(function (r) { return r.h; });
      const spreadW = Math.max.apply(null, ws) - Math.min.apply(null, ws);
      const spreadH = Math.max.apply(null, hs) - Math.min.apply(null, hs);
      console.log('  G-28/live k=' + k + ' CROSS-SCALE ratios W=[' +
        ws.map(function (v) { return v.toFixed(4); }).join(', ') + '] H=[' +
        hs.map(function (v) { return v.toFixed(4); }).join(', ') +
        ']  spread ' + spreadW.toFixed(4) + ' / ' + spreadH.toFixed(4));
      ok(spreadW <= 0.02 && spreadH <= 0.02, 'G-28/live/cross-scale-equal',
        'k=' + k + ': the dashed-box-to-coral ratio measured [' +
        ratios.map(function (r) {
          return 's=' + r.g.s + ' -> ' + r.w.toFixed(4);
        }).join(', ') + '] across three records that differ ONLY in `s`. ' +
        'They must be EQUAL — width spread measured ' + spreadW.toFixed(4) +
        ', height spread ' + spreadH.toFixed(4) + '. AT HEAD THEY STAND IN ' +
        '1 : 1/0.5 : 1/2 PROPORTION, because placeInkBox emitted raw record ' +
        'units while .page-deco carried scale(--s): the error factor is ' +
        'exactly 1/s, and on her most scaled mark that is twice too big. ' +
        'THIS IS THE ASSERTION THE GATE EXISTS FOR — a gate that measured ' +
        'ONE scale would pass on a box hard-coded to any single size.');
    }
  }

  /* --- (8) TWO SOURCE-SHAPE BACKSTOPS, DECLARED AS SUCH -----------------
     Everything above is a rendering. These two are statements about the RULE,
     lifted from tokens.css by `cssBlock` over comment-stripped bytes: the
     transform is rotation ONLY — the scale is already inside the emitted
     width, height and origin, and applying it twice would reintroduce the
     same class of error in the opposite direction — and both new custom
     properties carry a `var()` default, so a record written before this wave
     reads as an unrotated box and is byte-identically the drawing it was. */
  const tf = /transform:\s*([^;]+);/.exec(INKBOX_BLOCK);
  ok(tf && /rotate\(/.test(tf[1]) && !/scale\(/.test(tf[1]),
    'G-28/live/inkbox-rotation-only',
    '.page-deco-inkbox\'s transform declaration lifted from tokens.css is ' +
    JSON.stringify(tf && tf[1]) + '. It must carry rotate( and must NOT ' +
    'carry scale(: the scale is already in the emitted width, height and ' +
    'origin, so a scale() here would apply it twice.');
  ok(/var\(--a,\s*0\)/.test(INKBOX_BLOCK) &&
    /var\(--ox,\s*0\)/.test(INKBOX_BLOCK) &&
    /var\(--oy,\s*0\)/.test(INKBOX_BLOCK),
  'G-28/live/inkbox-var-defaults',
  'the three new custom properties on .page-deco-inkbox must each carry a ' +
    'var() DEFAULT, so a box placed without them reads as unrotated at its ' +
    'own top-left. Lifted block:\n' + INKBOX_BLOCK);
  ok(/transform-origin:[^;]*var\(--ox,\s*0\)\s*\*\s*var\(--k\)[^;]*var\(--oy,\s*0\)\s*\*\s*var\(--k\)/
    .test(INKBOX_BLOCK.replace(/\s+/g, ' ')),
  'G-28/live/inkbox-origin-rides-k',
  'the rotation origin must be multiplied by --k exactly as left, top, ' +
    'width and height already are — an origin in raw record px would drift ' +
    'from the box at every scale but 1. Lifted block:\n' + INKBOX_BLOCK);

  /* ---- (G-29/live) 26.91-36 (F-24 / D-11) — THE GREYED TIN, EVERY --k --- */
  console.log('(G-29/live) the marks tin, armed and unarmed, at computed ' +
    'style at every pinned --k');
  ok(TIN29_NATIVE, 'G-29/live/native-attribute-is-set-by-the-painter',
    "renderTinTray must set the NATIVE disabled attribute (`tin.disabled = " +
    "tinOff;`), lifted comment-stripped from app.js. The shipped class closes " +
    'the POINTER route only: measured on this harness, `.station-nb-off` ' +
    'alone leaves the node `disabled` null and keyboard-activatable. Her ' +
    'word was UNPRESSABLE. This lift also decides whether the armed probe ' +
    'below carries the attribute at all, so a build that drops the line ' +
    'cannot be measured as though it kept it.');
  for (let i = 0; i < runs.length; i++) {
    const k = runs[i].k;
    const m = runs[i].data.tin29;

    /* EMPTY FIRST, and BY VALUE. A blank page yields zero nodes and fails
       HERE rather than passing vacuously through a loop that never runs. */
    if (!ok(m.count === TIN29_COUNT, 'G-29/live/node-count',
      'k=' + k + ': expected exactly ' + TIN29_COUNT + ' node(s) matching ' +
      '[data-tin29] (armed, unarmed), measured ' + m.count + '.')) {
      continue;
    }
    const a = m.nodes.armed;
    const u = m.nodes.unarmed;

    /* THE GUARD. Both nodes exist AND carry the shipped word, BEFORE any
       style is read — a missing or blank node must fail on presence, never
       read as a passing measurement of a greyed control. */
    if (!ok(a && u && a.text === TIN29_WORD && u.text === TIN29_WORD,
      'G-29/live/present-and-named',
      'k=' + k + ': both tin probes must resolve and carry the shipped word ' +
      JSON.stringify(TIN29_WORD) + '; read ' +
      JSON.stringify(a && a.text) + ' / ' + JSON.stringify(u && u.text) +
      '. A DISABLED CONTROL KEEPS ITS NAME.')) {
      continue;
    }
    if (!ok(a.width > 0 && a.height > 0 && u.width > 0 && u.height > 0,
      'G-29/live/present-and-named',
      'k=' + k + ': and both must occupy a NON-ZERO box; armed ' +
      a.width.toFixed(2) + 'x' + a.height.toFixed(2) + ', unarmed ' +
      u.width.toFixed(2) + 'x' + u.height.toFixed(2) +
      '. A collapsed node is greyed for the wrong reason.')) {
      continue;
    }

    console.log('  G-29/live k=' + k +
      ' armed[opacity=' + a.opacity + ' pointer-events=' + a.pointerEvents +
      ' disabled=' + JSON.stringify(a.disabledAttr) + ']' +
      '  unarmed[opacity=' + u.opacity + ' pointer-events=' + u.pointerEvents +
      ' disabled=' + JSON.stringify(u.disabledAttr) + ']');

    /* THE ARMED READING — all three properties, together, in one assertion,
       because a control that is greyed but pressable and a control that is
       pressable but greyed are the same defect wearing two faces. */
    ok(a.opacity === DISABLED_OPACITY &&
       a.pointerEvents === DISABLED_POINTER_EVENTS &&
       a.disabledProp === true,
    'G-29/live/armed-reads-disabled',
    'k=' + k + ': with a tool armed the tin must compute opacity ' +
      DISABLED_OPACITY + ', pointer-events ' + DISABLED_POINTER_EVENTS +
      ' and carry the native disabled attribute — TOGETHER. Measured ' +
      'opacity ' + a.opacity + ', pointer-events ' + a.pointerEvents +
      ', disabled ' + JSON.stringify(a.disabledAttr) + '. The class is the ' +
      "band's shipped `" + TIN29_OFF + '` (the `.btn:disabled` opacity ' +
      'reused verbatim), never a second treatment authored here.');

    /* THE UNARMED READING — the positive half, without which "always ' +
       disabled" passes every row above. */
    ok(u.opacity !== DISABLED_OPACITY &&
       u.pointerEvents !== DISABLED_POINTER_EVENTS &&
       u.disabledProp !== true,
    'G-29/live/unarmed-reads-available',
    'k=' + k + ': and with NO tool armed the tin must read AVAILABLE on all ' +
      'three: measured opacity ' + u.opacity + ', pointer-events ' +
      u.pointerEvents + ', disabled ' + JSON.stringify(u.disabledAttr) +
      '. A tin greyed unconditionally satisfies every armed row and is a ' +
      'worse defect than the one being fixed.');

    /* AND THE TWO READINGS DIFFER ON ALL THREE, IN THE SAME RUN. A
       single-property difference is not this claim: it would be satisfied by
       a build that greys without disabling, or disables without greying. */
    ok(a.opacity !== u.opacity &&
       a.pointerEvents !== u.pointerEvents &&
       a.disabledProp !== u.disabledProp,
    'G-29/live/armed-differs-on-all-three',
    'k=' + k + ': the armed and unarmed readings must differ on ALL THREE ' +
      'properties in the same run. Measured opacity ' + a.opacity + ' vs ' +
      u.opacity + ', pointer-events ' + a.pointerEvents + ' vs ' +
      u.pointerEvents + ', disabled ' + JSON.stringify(a.disabledProp) +
      ' vs ' + JSON.stringify(u.disabledProp) + '. Two of three is the ' +
      'shape of a fix that shipped one half.');
  }

  await gate23();

  /* ---- (91b) THE SWEEP TOTAL, PINNED BY VALUE --------------------------- */
  const cjs = fs.readdirSync(path.join(REPO_ROOT, 'tests'))
    .filter(function (f) { return f.endsWith('.cjs'); });
  ok(cjs.length === NODE_SUITES, '91b/node-suite-count',
    'tests/*.cjs holds ' + cjs.length + ' suite(s); this gate is pinned BY ' +
    'VALUE at ' + NODE_SUITES + '. This is NOT a discrepancy to reconcile ' +
    'later — a stale number here is a PERMANENTLY UNMEETABLE GATE. Whoever ' +
    'adds or removes a suite moves this constant in the same commit. ' +
    '(tests/lib/*.cjs is a library, not a suite, and is not matched by this ' +
    'glob.)');

  console.log('NODE_SUITES=' + NODE_SUITES);
}

main().then(function () {
  if (FAILED > 0) {
    console.error('test_live_render: ' + FAILED + ' assertion(s) FAILED (' +
      PASSED + ' passed).');
    process.exitCode = 1;
  } else {
    console.log('PASS assertions=' + PASSED + ' failures=0');
  }
}).catch(function (err) {
  console.error('test_live_render: FATAL — ' + (err && err.stack || err));
  process.exitCode = 1;
});
