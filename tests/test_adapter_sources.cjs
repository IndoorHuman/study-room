/*
 * tests/test_adapter_sources.cjs — the sources-screen adapter UI (Plan 26.65-02).
 *
 * Zero-dep node (fs/path only), path-independent via __dirname, in the
 * read-source-as-TEXT style of tests/test_onboarding_gate.cjs. It reads
 * app.js as text — no browser, no DOM library, no new dependency (law 8) —
 * and holds the Apple Notes adapter's UI-logic contract statically. It is
 * NOT an APP_SOURCES member of test_no_push.cjs (the pull-only forbidden-token
 * gate over the five app files); this suite is the plan-scoped complement,
 * scoped to the adapter functions only.
 *
 * Five assertion groups (26.65-02 SC + UI-SPEC Copywriting Contract):
 *
 *   1. BUTTON + COPY — renderOnbSources renders the Apple Notes button, the
 *      'Bring in from an app on this Mac' group label, and the never-changed
 *      sublabel, byte-exact.
 *   2. TWO-PHASE READOUT — runAdapterCollect renders the TCC one-time consent
 *      line (with the single bolded `once`), and renderAdapterProgress uses
 *      the 'reading your notes — N of M.' export phrasing distinct from the
 *      shipped copy bar.
 *   3. CALM ERRORS — the -1743 permission copy and the unreachable copy both
 *      exist, mapped from the route's plain message, each with a lowercase
 *      'try again' quiet link (never a wall).
 *   4. SEAM — every adapter render function that writes innerHTML routes its
 *      copy through escapeHtml (the index.html sink gate is total).
 *   5. LAW GUARDS — the adapter source region carries NONE of the law-1
 *      lint-trap tokens (reminder/schedule/notify/timer/interval/watch/poll/
 *      cron/osascript) and NO law-3/law-7 absence/streak language, and spends
 *      NO --accent on the source buttons (coral stays reserved). The forbidden
 *      literals are defined in THIS file only.
 *   6. PHOTOS (26.65-03) — the Apple Photos vertical: the one-click button +
 *      sublabel (flag on) and the manual-export fallback card (flag off), both
 *      gated on the single PHOTOS_ONE_CLICK flip (D-07); the 'collecting your
 *      photos — N of M.' export readout; and the Photos TCC + error copy that
 *      swap the noun while the shipped Notes lines stay byte-exact.
 *   8. THREE OUTCOMES IN WORDS (26.65-07) — the third error branch (Photos
 *      answered, nothing came back) pinned by its exact string and keyed on
 *      the adapter's own token; the honest partial line, singular and plural;
 *      silence on a zero-skip run; and renderImportReport asserted to carry
 *      none of it (the folder-drop path shares that function).
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; every unmet assertion listed on its own line + exit 1 on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
// 26.97-07: the REAL escaping core, handed to the driven harness rather
// than stood in for. A stand-in escaper in a suite about what the room
// SAYS would sit between her sentence and the assertion.
const StudyCore = require(path.join(ROOT, 'core.js'));

const violations = [];

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

// Slice a top-level function body: from its `function name(` keyword to the
// next module-indent function declaration. app.js keeps a flat layout inside
// its IIFE (the test_onboarding_gate.cjs convention), so the boundary holds.
function functionBody(name) {
  const marker = 'function ' + name + '(';
  const start = appSrc.indexOf(marker);
  if (start === -1) {
    violations.push('[adapter] ' + APP + ": function '" + name +
      "' not found — renamed or removed; update this gate deliberately");
    return '';
  }
  const end = appSrc.indexOf('\n  function ', start + marker.length);
  const raw = appSrc.slice(start, end === -1 ? appSrc.length : end);
  // Trim any trailing doc-comment that belongs to the NEXT function: cut at
  // this function's own closing brace (the last indent-2 `}` in the slice),
  // so a foreign comment can never leak into the law-guard region scan.
  const close = raw.lastIndexOf('\n  }');
  return close === -1 ? raw : raw.slice(0, close + 4);
}

// The adapter surface this plan owns — every function it added or touched on
// the sources screen. The union is the region the law guards scan.
const ADAPTER_FNS = ['renderOnbSources', 'reenableNotes', 'runAdapterCollect',
  'renderAdapterProgress', 'renderAdapterError', 'adapterErrorCopy',
  'readAdapterProgress', 'armAdapterReread',
  // 26.65-07: the two new copy surfaces join the law-guard region — a line
  // written for her is exactly where an absence/streak word would do harm.
  'adapterPartialLine', 'paintAdapterPartial',
  // 26.65-08: the video line is written for her too, and joins the region.
  'adapterVideoLine'];
const region = ADAPTER_FNS.map(functionBody).join('\n');

function must(present, label) {
  if (appSrc.indexOf(present) === -1) {
    violations.push('[' + label + "] " + APP + ": missing copy: '" +
      present + "'");
  }
}

// ---- 1. BUTTON + COPY -------------------------------------------------------

['Bring in from an app on this Mac', 'Apple Notes',
  'your notes, brought in once — nothing in Notes is ever changed.'
].forEach(function (copy) { must(copy, 'button-copy'); });

if (region.indexOf('id="btn-onb-source-notes"') === -1) {
  violations.push('[button-copy] ' + APP + ': the Apple Notes button ' +
    '(id="btn-onb-source-notes") is missing from renderOnbSources');
}
if (region.indexOf('id="adapter-readout"') === -1) {
  violations.push('[button-copy] ' + APP + ': the escapeHtml-seam readout ' +
    'container (id="adapter-readout") is missing from renderOnbSources');
}

// ---- 2. TWO-PHASE READOUT ---------------------------------------------------

// The TCC one-time consent line, framed as care, with the SINGLE bolded
// `once` (UI-SPEC — used sparingly). Rendered in pieces around <strong>.
['macOS will ask ',
  ' to let the room reach your Notes — say OK. The room only ever reads; ' +
  'it never changes a thing.'
].forEach(function (copy) { must(copy, 'tcc'); });

const runCollect = functionBody('runAdapterCollect');
if (!/escapeHtml\('once'\)/.test(runCollect) ||
    runCollect.indexOf('<strong>') === -1) {
  violations.push('[tcc] ' + APP + ': runAdapterCollect must bold the ' +
    "single word 'once' (escapeHtml('once') inside <strong>)");
}
if (runCollect.indexOf('checking…') === -1) {
  violations.push('[tcc] ' + APP + ': runAdapterCollect must paint the calm ' +
    "'checking…' interim first (the S1-loading backstop)");
}

// The NEW export readout phrasing — distinct from the shipped copy bar
// ('copying your things in — N of M.'), law 6.
must('reading your notes — ', 'export-readout');
const renderProg = functionBody('renderAdapterProgress');
if (!/reading your notes — '[\s\S]*\bof\b/.test(renderProg) ||
    renderProg.indexOf('snap.done') === -1 ||
    renderProg.indexOf('snap.total') === -1) {
  violations.push('[export-readout] ' + APP + ': renderAdapterProgress must ' +
    "build the honest 'reading your notes — N of M.' fraction from " +
    'snap.done / snap.total');
}
// The copy phase reuses the shipped bar + the pinned close-line verbatim.
if (runCollect.indexOf('renderAdapterProgress') === -1 ||
    functionBody('readAdapterProgress').indexOf('renderImportProgress') === -1) {
  violations.push('[export-readout] ' + APP + ': the readout chain must reuse ' +
    'the shipped renderImportProgress for the copy phase (law 6)');
}
must('you can close this; the room will be ready.', 'export-readout');

// ---- 3. CALM ERRORS ---------------------------------------------------------

["macOS hasn't given the room permission to reach Notes yet. Open Notes " +
  'once and say OK, then try again.',
  "Couldn't reach Notes just now — nothing was lost. Try again in a moment."
].forEach(function (copy) { must(copy, 'error-copy'); });

// The mapping keys off the route's plain message (permission vs unreachable).
const errCopy = functionBody('adapterErrorCopy');
if (!/allow|permission/.test(errCopy)) {
  violations.push('[error-copy] ' + APP + ': adapterErrorCopy must map the ' +
    "route's plain message to the -1743 vs unreachable copy");
}
// A lowercase 'try again' quiet link accompanies the error (never a wall).
const errRender = functionBody('renderAdapterError');
if (!/escapeHtml\('try again'\)/.test(errRender) ||
    errRender.indexOf('quiet-error') === -1) {
  violations.push('[error-copy] ' + APP + ': renderAdapterError must render ' +
    "a .quiet-error line plus a lowercase 'try again' quiet link");
}

// ---- 4. SEAM ----------------------------------------------------------------
//
// Every adapter render function that writes innerHTML must route its copy
// through escapeHtml (the total index.html sink gate; Suite 2 of
// test_no_push.cjs is the authoritative global check — this is the
// plan-scoped positive assertion).

['runAdapterCollect', 'renderAdapterProgress', 'renderAdapterError']
  .forEach(function (name) {
    const body = functionBody(name);
    if (body.indexOf('.innerHTML') !== -1 &&
        !/escapeHtml\(/.test(body)) {
      violations.push('[seam] ' + APP + ': ' + name + ' writes innerHTML ' +
        'without routing copy through escapeHtml');
    }
  });

// ---- 5. LAW GUARDS ----------------------------------------------------------
//
// The adapter region carries none of the law-1 lint-trap tokens and no
// law-3/law-7 absence/streak language, and spends no --accent. Forbidden
// literals defined HERE only (case-insensitive).

const FORBIDDEN_LINT = ['reminder', 'schedule', 'sched', 'notify', 'timer',
  'interval', 'watch', 'poll', 'cron', 'osascript'];
const FORBIDDEN_ABSENCE = ['since you', 'days ago', "it's been", 'streak',
  'checkmark', 'day-count'];
const lowerRegion = region.toLowerCase();

FORBIDDEN_LINT.concat(FORBIDDEN_ABSENCE).forEach(function (tok) {
  if (lowerRegion.indexOf(tok) !== -1) {
    violations.push('[law-guard] ' + APP + ": the adapter region must not " +
      "contain the forbidden token '" + tok + "' (law 1/3/7)");
  }
});

if (region.indexOf('--accent') !== -1) {
  violations.push('[law-guard] ' + APP + ': the source buttons must not ' +
    'spend --accent — coral stays reserved (UI-SPEC color contract)');
}

// ---- 6. PHOTOS (26.65-03) ---------------------------------------------------
//
// The Apple Photos vertical is flag-gated behind PHOTOS_ONE_CLICK so Plan 06's
// ship/defer is a flag flip, not new work. Both branches must render legibly:
// the one-click button+sublabel (flag on) and the manual-export fallback card
// (flag off). The export readout + TCC + error copy swap the noun to Photos
// while the shipped Notes lines stay byte-exact (checked in groups 1-3).

const onbSources = functionBody('renderOnbSources');

// The single client flag that gates the vertical (the D-07 ship/defer flip).
if (appSrc.indexOf('PHOTOS_ONE_CLICK') === -1) {
  violations.push('[photos] ' + APP + ': the PHOTOS_ONE_CLICK client flag ' +
    '(the D-07 ship/defer flip) is missing');
}
if (!/PHOTOS_ONE_CLICK\s*\?/.test(onbSources)) {
  violations.push('[photos] ' + APP + ': the Photos button/fallback must be ' +
    'gated on PHOTOS_ONE_CLICK so Plan 06 is a flag flip, not new work');
}

// Button branch (flag on): the Apple Photos button + never-changed sublabel.
['Apple Photos',
  'your photos, brought in once — nothing in Photos is ever changed.'
].forEach(function (copy) { must(copy, 'photos-button'); });
if (onbSources.indexOf('id="btn-onb-source-photos"') === -1) {
  violations.push('[photos-button] ' + APP + ': the one-click Apple Photos ' +
    'button (id="btn-onb-source-photos") is missing from renderOnbSources');
}

// Fallback branch (flag off): the manual-export card heading + authored fixed
// steps (one contiguous literal) + the shipped folder-import link.
['Bringing in Apple Photos by hand',
  'A one-click Photos button is coming. For now: in Photos, select the ' +
  'pictures you want, choose File → Export, and save them to a folder — ' +
  'then bring that folder in below. Nothing in Photos is changed.',
  'bring that folder in'
].forEach(function (copy) { must(copy, 'photos-fallback'); });
if (onbSources.indexOf('id="btn-photos-fallback-import"') === -1) {
  violations.push('[photos-fallback] ' + APP + ': the manual-export fallback ' +
    'link (id="btn-photos-fallback-import") is missing from renderOnbSources');
}

// The export-phase readout noun follows the tapped source (law 6): Photos are
// 'collected', distinct from the Notes 'reading' line and the shipped copy bar.
must('collecting your photos — ', 'photos-readout');
if (!/collecting your photos — '[\s\S]*\bof\b/.test(renderProg) ||
    renderProg.indexOf('ACTIVE_ADAPTER') === -1) {
  violations.push('[photos-readout] ' + APP + ': renderAdapterProgress must ' +
    "build the honest 'collecting your photos — N of M.' fraction for the " +
    'Photos source (keyed on ACTIVE_ADAPTER.source)');
}

// The TCC one-time note + both error lines swap the noun to Photos.
must(' to let the room reach your Photos — say OK. The room only ever reads; ' +
  'it never changes a thing.', 'photos-tcc');
["macOS hasn't given the room permission to reach Photos yet. Open Photos " +
  'once and say OK, then try again.',
  "Couldn't reach Photos just now — nothing was lost. Try again in a moment."
].forEach(function (copy) { must(copy, 'photos-error'); });

// ---- 7. PICKER REMEMBERS THE KEPT-OUT FOLDERS (cross-AI review HIGH-2) ------
// A Manage re-open of the folder picker must render previously kept-out
// folders UNCHECKED — otherwise one "bring these in" tap silently un-makes
// the user's privacy choice AND the collect worker persists the emptied
// list (law 5: an exclusion, once made, never dissolves by accident).
const pickerBody = functionBody('renderNotesFolderPicker');
if (pickerBody.indexOf('notes_excluded_folders') === -1) {
  violations.push('[picker-memory] ' + APP + ': renderNotesFolderPicker ' +
    'never reads the persisted notes_excluded_folders — a Manage re-open ' +
    'forgets which folders the user kept out');
}
if (/class="notes-folder-box" checked /.test(pickerBody)) {
  violations.push('[picker-memory] ' + APP + ': every folder box renders ' +
    'hard-checked — checked must be conditional on the persisted skip ' +
    'list, so a kept-out folder re-opens unchecked');
}

// ---- 8. THE THREE OUTCOMES, IN WORDS (26.65-07) -----------------------------
//
// The adapter now keeps three outcomes apart server-side: a legitimate zero
// (nothing new to bring in — quiet), a total failure (it tried N and brought
// back none — loud, no ledger written, the source not claimed as connected),
// and an honest partial. The client must match, and the FAILURE case is the
// one that had no true words: on 2026-08-11 a collect asked Photos for 14,016
// pictures, was answered 14,016 times, and got not one file back. Both
// existing branches would have lied about that — the permission line points
// at a setting that is already correct, the fallback claims Photos could not
// be reached. Hence a THIRD branch, pinned here by its exact string.

// ⛔ RE-RULED 2026-08-25 (26.995-OWNER-RULING-2026-08-25-the-red-line-says-
// finished.md): the old sentence never said whether the run was over — her
// own report: "always confused … is that mean the upload is completed or
// not?" — and its "nothing in your library changed" was proven false by a
// run that durably set 19 videos aside. Her chosen line leads with the
// ending. The branch's TOKEN key is unchanged below.
const TOTAL_FAILURE_LINE = 'The room finished — but the pictures it went ' +
  "for couldn't be brought in this time. They aren't lost, and it will try " +
  'them again the next time you bring photos in.';
must(TOTAL_FAILURE_LINE, 'photos-total-failure');

// The branch keys on the SAME stable token the adapter raises with
// (adapters/apple_photos.py TOTAL_FAILURE_TOKEN). Pinned on both sides so a
// rename on either cannot silently drop her back onto the false fallback.
const TOTAL_FAILURE_TOKEN = 'none of your photos came back';
if (errCopy.indexOf(TOTAL_FAILURE_TOKEN) === -1) {
  violations.push('[photos-total-failure] ' + APP + ': adapterErrorCopy must ' +
    "key its third branch on the adapter's stable token '" +
    TOTAL_FAILURE_TOKEN + "' — without it a total failure falls to the " +
    'fallback and tells her the room could not reach Photos, which is false');
}
const adapterPy = path.join(ROOT, 'adapters', 'apple_photos.py');
if (fs.existsSync(adapterPy) &&
    fs.readFileSync(adapterPy, 'utf8').indexOf(TOTAL_FAILURE_TOKEN) === -1) {
  violations.push('[photos-total-failure] adapters/apple_photos.py: the ' +
    "total-failure token '" + TOTAL_FAILURE_TOKEN + "' is gone — the " +
    'client branch it feeds can no longer fire');
}
// The third branch must be its own line, never mapped onto either shipped
// one. Both shipped strings stay byte-exact (groups 3 and 6 pin them).
if (errCopy.indexOf(TOTAL_FAILURE_LINE) === -1) {
  violations.push('[photos-total-failure] ' + APP + ': the total-failure ' +
    'copy must live inside adapterErrorCopy, beside the other two branches');
}

// The honest partial: one calm line, singular and plural, carrying only what
// THIS run could not bring back — never a count of what is still outside the
// room (the owner's standing veto on backlog numbers).
const PARTIAL_SINGULAR = "1 picture couldn't be brought in this time — it " +
  "isn't lost, and the room will try it again the next time you bring " +
  'photos in.';
const PARTIAL_PLURAL = " pictures couldn't be brought in this time — they " +
  "aren't lost, and the room will try them again the next time you bring " +
  'photos in.';
[PARTIAL_SINGULAR, PARTIAL_PLURAL].forEach(function (copy) {
  must(copy, 'photos-partial');
});

const partialLine = functionBody('adapterPartialLine');
// Silence is the default: no skips, no line. This is what keeps the calm
// nothing-new zero from growing a sentence it must not have (law 3).
if (!/n\s*<=\s*0/.test(partialLine) || partialLine.indexOf("return ''") === -1) {
  violations.push('[photos-partial] ' + APP + ': adapterPartialLine must ' +
    'return the empty string when nothing was skipped — a zero-skip run ' +
    'must paint no line at all');
}
// It reads the EXPORT report, which is the only place the per-reason skip
// counts exist; the import report cannot know about them.
if (partialLine.indexOf('skipped') === -1) {
  violations.push('[photos-partial] ' + APP + ': adapterPartialLine must ' +
    "read the export report's per-reason skipped counts");
}

const paintPartial = functionBody('paintAdapterPartial');
// renderImportReport owns box.innerHTML outright and is SHARED with the
// folder-drop path, so it stays byte-unchanged: the line is inserted as a
// first child afterwards, via textContent (it never reaches the HTML sink).
if (paintPartial.indexOf('insertBefore') === -1 ||
    paintPartial.indexOf('textContent') === -1) {
  violations.push('[photos-partial] ' + APP + ': paintAdapterPartial must ' +
    'insert its line as a first child via textContent — never by rewriting ' +
    'the shipped import report');
}
if (paintPartial.indexOf('.innerHTML') !== -1) {
  violations.push('[photos-partial] ' + APP + ': paintAdapterPartial must ' +
    'not write innerHTML');
}
// Photos-only: the Notes collect carries no per-reason skip counts, and the
// line speaks of pictures.
if (paintPartial.indexOf("'apple-photos'") === -1) {
  violations.push('[photos-partial] ' + APP + ': paintAdapterPartial must ' +
    'paint only for the Photos source');
}

// ---- 9. VIDEOS ARE SKIPPED, NOT FAILED (26.65-08) ---------------------------
// Her library holds 594 videos among 14,019 items. They used to be renamed to
// .jpg and imported as unshowable pictures; they are now skipped under their
// own reason. The one thing said out loud is a fact about the room, never a
// fault of hers (law 3) — and a video must NEVER be counted as a picture that
// could not be brought in.

const VIDEO_SINGULAR = 'The room shows pictures and writing, not video yet — ' +
  'so 1 video stayed in Photos, right where it is.';
const VIDEO_PLURAL = ' videos stayed in Photos, right where they are.';
[VIDEO_SINGULAR, VIDEO_PLURAL].forEach(function (copy) {
  must(copy, 'photos-video');
});

const videoLine = functionBody('adapterVideoLine');
// Silence is the default here too — a run with no video says nothing at all.
if (!/n\s*<=\s*0/.test(videoLine) || videoLine.indexOf("return ''") === -1) {
  violations.push('[photos-video] ' + APP + ': adapterVideoLine must return ' +
    'the empty string when no video was skipped');
}
if (videoLine.indexOf('skipped.video') === -1) {
  violations.push('[photos-video] ' + APP + ': adapterVideoLine must read ' +
    "the export report's own `video` skip bucket");
}
// It is not a failure line and must never read as one (law 3).
["couldn't", 'failed', 'sorry', 'error', 'problem', 'try again']
  .forEach(function (tok) {
    if (videoLine.toLowerCase().indexOf(tok) !== -1) {
      violations.push('[photos-video] ' + APP + ": adapterVideoLine must not " +
        "contain '" + tok + "' — a skipped video is not a failure and must " +
        'not read as one');
    }
  });

// THE LOAD-BEARING ONE: video is excluded from the count of what could not be
// brought in. Left in that sum, a perfect 594-video import would have said
// "594 pictures couldn't be brought in this time — the room will try them
// again", which is false twice over. Driven: removing this line renders
// exactly that sentence.
if (partialLine.indexOf("k === 'video'") === -1 ||
    partialLine.indexOf('continue') === -1) {
  violations.push('[photos-video] ' + APP + ': adapterPartialLine must skip ' +
    'the `video` bucket when counting what could not be brought in — a video ' +
    'is not a picture that failed');
}

// Both lines are painted, each independently silent.
if (paintPartial.indexOf('adapterVideoLine') === -1) {
  violations.push('[photos-video] ' + APP + ': paintAdapterPartial must ' +
    'paint the video line as well as the failure line');
}

// ---- 10. OVERSIZE PICTURES ARE MADE SMALLER, NOT REFUSED (26.65-09) --------
// Her ruling of 2026-08-11, verbatim: "Resize oversize ones instead."
// A rendition over the import size ceiling used to be exported, staged, and
// then silently refused by the importer — she never saw why, the picture
// simply was not there. It is now made smaller so it fits. That is a photo
// that ARRIVED, and it must never be counted among the ones that did not.

const RESIZED_SINGULAR = 'The room keeps pictures small enough to open ' +
  'quickly — so 1 picture was made smaller on the way in. Nothing else was ' +
  'changed.';
const RESIZED_PLURAL = ' pictures were made smaller on the way in. Nothing ' +
  'else was changed.';
[RESIZED_SINGULAR, RESIZED_PLURAL].forEach(function (copy) {
  must(copy, 'photos-resized');
});

const resizedLine = functionBody('adapterResizedLine');
// Silence is the default here too — a run that resized nothing says nothing.
if (!/n\s*<=\s*0/.test(resizedLine) || resizedLine.indexOf("return ''") === -1) {
  violations.push('[photos-resized] ' + APP + ': adapterResizedLine must ' +
    'return the empty string when nothing was resized');
}

// THE LOAD-BEARING ONE, and it is the mirror of the video exclusion above.
// `resized` is reported BESIDE `skipped`, never inside it, so that
// adapterPartialLine's sum cannot reach it. Driven in-session: folding it in
// makes a run that resized 3 pictures say "3 pictures couldn't be brought in
// this time" — about three pictures sitting in her room right now.
if (resizedLine.indexOf('expReport.resized') === -1) {
  violations.push('[photos-resized] ' + APP + ': adapterResizedLine must read ' +
    '`resized` from the export report — never a bucket of `skipped`');
}
if (resizedLine.indexOf('skipped') !== -1) {
  violations.push('[photos-resized] ' + APP + ': adapterResizedLine must NOT ' +
    'read `skipped` — a resized photo arrived, and building this line from ' +
    'the failure counters is exactly the mistake it exists to prevent');
}

// Law 3: no blame, no apology, no instruction. It is not her fault that a
// camera makes big files, and the sentence must not read as though it is.
["couldn't", 'failed', 'sorry', 'error', 'problem', 'try again']
  .forEach(function (tok) {
    if (resizedLine.toLowerCase().indexOf(tok) !== -1) {
      violations.push('[photos-resized] ' + APP + ": adapterResizedLine must " +
        "not contain '" + tok + "' — a picture that was made smaller arrived, " +
        'and nothing about it is a failure or a fault of hers');
    }
  });

// All three lines are painted, each independently silent.
if (paintPartial.indexOf('adapterResizedLine') === -1) {
  violations.push('[photos-resized] ' + APP + ': paintAdapterPartial must ' +
    'paint the resize line as well as the failure and video lines');
}

// The shipped import report is untouched — it must carry none of the new
// copy and must not know the partial exists (the folder-drop path shares it).
const importReport = functionBody('renderImportReport');
['paintAdapterPartial', 'adapterPartialLine', "couldn't be brought in",
 'adapterVideoLine', 'stayed in Photos',
 'adapterResizedLine', 'was made smaller', 'were made smaller']
  .forEach(function (tok) {
    if (importReport.indexOf(tok) !== -1) {
      violations.push('[photos-partial] ' + APP + ': renderImportReport must ' +
        "stay byte-unchanged — it carries '" + tok + "', which belongs to " +
        'the adapter path alone (the folder-drop path shares this function)');
    }
  });

// The chain calls the partial AFTER the shipped report has rendered.
const readProg = functionBody('readAdapterProgress');
const iReport = readProg.indexOf('renderImportReport(report, box)');
const iPartial = readProg.indexOf('paintAdapterPartial(');
if (iReport === -1 || iPartial === -1 || iPartial < iReport) {
  violations.push('[photos-partial] ' + APP + ': readAdapterProgress must ' +
    'call paintAdapterPartial AFTER renderImportReport — before it, the ' +
    "report's own innerHTML write would erase the line");
}

// ---- 9. THE OBSIDIAN ROW (26.97-07) ----------------------------------------
//
// Seven cases, each reported on its own machine-readable line at line start:
//   ok: <case-name>   /   FAIL: <case-name>
//
// ⚠⚠ EVERY BEHAVIOURAL CLAIM BELOW IS **DRIVEN** — it stands the pane (or the
// ask-and-confirm card, or the last-import line) up on a controllable page,
// calls the SHIPPED function, and reads what came out. The source-text
// assertions in the suites above stay where they are and are useful; they
// cannot see evaluation order, cannot see a cascade, and cannot see a call
// site they do not name. A regex asserting the row filter mentions the vault
// source can be made green by editing the regex while the behaviour is still
// wrong — that trap is recorded on this project and it is why the driven half
// exists. The per-case driven/source-text split is listed in the SUMMARY.

const os = require('os');

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
    violations.push('[2697-07] ' + name + ': ' + failure);
  }
}

// A module-level `var NAME = '<literal>';` lifted from app.js BY VALUE, so the
// harness never re-types a shipped constant into this file (the mirror trap: a
// suite that restates the code pins whatever the code happens to say).
function varLiteral(name, fallback) {
  const re = new RegExp('\\bvar ' + name +
    " = ('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\");");
  const m = appSrc.match(re);
  if (!m) {
    violations.push('[2697-07] ' + APP + ": constant '" + name +
      "' not found as a single string literal — update this gate " +
      'deliberately');
    return JSON.stringify(fallback);
  }
  return m[1];
}

function arrayLiteral(name) {
  const m = appSrc.match(new RegExp('\\bvar ' + name + ' = (\\[[\\s\\S]*?\\]);'));
  return m ? m[1] : '[]';
}

// The frozen name map, LIFTED rather than re-typed. ⛔ Hand-copying it into
// this file would put the map in two places, and a silent edit in app.js would
// then still pass here — the mirror trap this project keeps paying for.
function frozenObjectLiteral(name) {
  const m = appSrc.match(new RegExp(
    '\\bvar ' + name + ' = (Object\\.freeze\\(\\{[\\s\\S]*?\\}\\));'));
  if (!m) {
    violations.push('[2697-07] ' + APP + ": frozen object '" + name +
      "' not found — update this gate deliberately");
    return 'Object.freeze({})';
  }
  return m[1];
}

// ---- her record ------------------------------------------------------------
//
// The five sentences this surface ships are asserted BY VALUE against her
// recorded rows — never against a sentence typed into this file.
//
// ⛔ THE RECORD CANNOT BE NAMED HERE BY PATH. It lives in the planning vault,
// and tools/stage_public.py's DENY gate refuses a home-directory path in any
// tracked file — a hard publish failure, correctly. So the rows are kept as a
// tracked VERBATIM EXTRACT beside this suite, and whenever the record itself
// is reachable (STUDY_COPY_RECORD, or the vault at its usual place, resolved
// at run time from the home directory and never spelled out) the extract is
// additionally asserted EQUAL to the record — so the extract cannot drift
// away from what she chose without this case going red.
const COPY_EXTRACT = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'copy-2697-rows.json'), 'utf8'));

function copyRecordPath() {
  if (process.env.STUDY_COPY_RECORD) { return process.env.STUDY_COPY_RECORD; }
  return path.join(os.homedir(), 'Library', 'Mobile Documents',
    'iCloud~md~obsidian', 'Documents', 'Project Tracker', 'Project Tracker',
    'Claude Project', 'Obsidian Visual House', '.planning', 'phases',
    '26.97-the-obsidian-vault-adapter-liveness-not-import-added-2026-08',
    '26.97-COPY.md');
}

// Parse the record's own table: one row per sentence, her wording the last
// backtick-quoted cell. Returns null when the record is not reachable.
function readCopyRecord() {
  let src;
  try { src = fs.readFileSync(copyRecordPath(), 'utf8'); }
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

// ---- the controllable page -------------------------------------------------
//
// One fake box, one fake `$`, one synchronous `apiGet`. Every function whose
// BEHAVIOUR is under test is LIFTED from app.js; only the surrounding
// machinery (the container lookup, the navigation, the collect itself) is
// stubbed, and each stub is a RECORDER so an assertion can be a positive
// number rather than an inference from silence.
function paneHarness(meta) {
  const rec = { collects: [], vaultScreens: 0, pickers: 0, disconnects: [],
    vaultPickers: 0 };
  const api = new Function('rec', 'META', 'StudyCore', `
    var box = { innerHTML: '', querySelectorAll: function () { return []; } };
    var MANAGE = { meta: META };
    var PHOTOS_ONE_CLICK = true;
    var ASK_KEY_SOURCES = ${varLiteral('ASK_KEY_SOURCES', 'connected_sources')};
    // Distinct sentinels: the sources branch is the one under test, and the
    // other branches must simply never match it.
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
    // The fall-through sentinel: when the card refuses to name an unknown
    // source, the receipt must reach the SHIPPED effective-state mapper, and
    // this is how the assertion sees that it did.
    var FELL_THROUGH = '\\u0000fell-through';
    function askStateLine() { return FELL_THROUGH; }
    function askEffectiveOn() { return false; }
    // #105: askReceiptLine gained a device branch; the lifted body needs its
    // two collaborators in scope. The key here is deliberately NOT a case
    // any group drives — it only keeps the lift from throwing.
    var ASK_KEY_DEVICE_FENCE = 'display_fence_open';
    function displayFenceOpen() { return false; }
    function askValueText() { return ''; }
    function askNameLine() { return ''; }
    function filterRowLabel() { return ''; }
    function manageSourcesBox() { return box; }
    function $(id) { return null; }
    function enterVaultImport() { rec.vaultScreens++; }
    function renderNotesFolderPicker() { rec.pickers++; }
    // 26.97-08: the vault tap now opens its own SEEDED picker before any
    // collect (law 5), so the harness records that too.
    function renderVaultFolderPicker() { rec.vaultPickers++; }
    function handleSourceDisconnect(s) { rec.disconnects.push(s); }
    function showScreen() {}
    function runAdapterCollect(source, excludeFolders, b, roomMode) {
      rec.collects.push({ source: source, exclude: excludeFolders,
        room: roomMode === true });
    }
    function apiGet(url) {
      return { then: function (ok) {
        ok({ ok: true, data: { meta: META } });
        return { catch: function () {} };
      } };
    }
    ${functionBody('escapeHtml')}
    ${functionBody('escapeAttr')}
    ${functionBody('connectedSourceName')}
    ${functionBody('connectedSourceStatus')}
    ${functionBody('renderConnectedSourcesSection')}
    ${functionBody('startVaultCollect')}
    ${functionBody('askValueLines')}
    ${functionBody('askReceiptLine')}
    return {
      box: box,
      askKeySources: ASK_KEY_SOURCES,
      FELL_THROUGH: FELL_THROUGH,
      renderPane: renderConnectedSourcesSection,
      name: connectedSourceName,
      status: typeof connectedSourceStatus === 'function' ?
        connectedSourceStatus : null,
      startVaultCollect: typeof startVaultCollect === 'function' ?
        startVaultCollect : null,
      valueLines: askValueLines,
      receipt: askReceiptLine
    };`)(rec, meta, StudyCore);
  api.rec = rec;
  return api;
}

// renderImportReportLine looks its own box up through $, so it gets its own
// tiny page rather than sharing the pane's.
function reportHarness() {
  return new Function('StudyCore', `
    var box = { innerHTML: '' };
    function $(id) { return id === 'manage-import-report' ? box : null; }
    function importIdentityClause() { return ''; }
    function attachedImportLine() { return ''; }
    function skipLines() { return []; }
    var IMPORT_MONTHS = ${arrayLiteral('IMPORT_MONTHS')};
    ${functionBody('escapeHtml')}
    ${functionBody('count')}
    ${functionBody('importWhenPhrase')}
    ${functionBody('renderImportReportLine')}
    return { box: box, render: renderImportReportLine,
             when: typeof importWhenPhrase === 'function' ?
               importWhenPhrase : null };`)(StudyCore);
}

// Row count is an INTEGER equality, never a falsy check: "zero rows" means the
// number 0, and a truthiness test would accept undefined from a render that
// never ran at all.
function rowCount(html) {
  return String(html).split('class="manage-source-row"').length - 1;
}
function ctrlCount(html) {
  return String(html).split('id="btn-manage-vault-collect"').length - 1;
}

const UNKNOWN_SOURCE = 'made-up-source-that-no-adapter-publishes';
const VAULT = 'obsidian-vault';

// --- case 1: naming call site 1 — the pane's row rendering -------------------
runCase('naming-site-1-pane-render-drops-an-unknown-source', function () {
  const h = paneHarness({ vault_root: '/somewhere/vault',
    connected_sources: [VAULT, UNKNOWN_SOURCE] });
  h.renderPane();
  const rows = rowCount(h.box.innerHTML);
  caseAssert(rows === 1, 'the pane rendered ' + rows + ' row(s) for a ' +
    'connected list of [the vault source, an unknown source]; exactly 1 is ' +
    'required — the unknown source must render NO row rather than a row ' +
    "under another source's name, and the vault source must render one");
  caseAssert(h.box.innerHTML.indexOf(COPY_EXTRACT.C1) !== -1,
    'the one row does not carry her recorded name for the vault source');
});

// --- case 2: naming call site 2 — the ask-and-confirm card's change lines ----
runCase('naming-site-2-ask-card-change-lines-drop-an-unknown-source',
  function () {
    const h = paneHarness({ connected_sources: [] });
    const unknown = h.valueLines({ key: h.askKeySources,
      value: UNKNOWN_SOURCE });
    caseAssert(Array.isArray(unknown) && unknown.length === 0,
      'the card composed ' + (unknown || []).length + ' change line(s) for ' +
      'an unknown source; 0 are required — this card states back what a ' +
      'change will do, and a wrong name here is a false sentence about her ' +
      'own data');
    const known = h.valueLines({ key: h.askKeySources, value: VAULT });
    caseAssert(Array.isArray(known) && known.length === 2,
      'the card composed ' + (known || []).length + ' change line(s) for ' +
      'the vault source; 2 are required (the before state, then the ' +
      'removal) — a card that says nothing for everything is not a fix');
    caseAssert(known[0] === COPY_EXTRACT.C3, "the card's before-state line " +
      'is ' + JSON.stringify(known[0]) + ', which is not byte-identical to ' +
      'her recorded status line ' + JSON.stringify(COPY_EXTRACT.C3));
  });

// --- case 3: naming call site 3 — the ask-and-confirm card's receipt ---------
runCase('naming-site-3-ask-card-receipt-drops-an-unknown-source', function () {
  const h = paneHarness({ connected_sources: [] });
  const unknown = h.receipt({ key: h.askKeySources,
    value: UNKNOWN_SOURCE }, {});
  caseAssert(unknown === h.FELL_THROUGH, 'the receipt for an unknown source ' +
    'is ' + JSON.stringify(unknown) + '; it must name no source at all and ' +
    'fall through to the shipped effective-state mapper');
  const known = h.receipt({ key: h.askKeySources, value: VAULT }, {});
  caseAssert(known !== h.FELL_THROUGH &&
    String(known).indexOf(COPY_EXTRACT.C1) === 0,
    'the receipt for the vault source is ' + JSON.stringify(known) + '; it ' +
    'must lead with her recorded name');
});

// --- case 4: the vault source renders exactly one row, in her word ----------
runCase('the-vault-source-renders-exactly-one-obsidian-row', function () {
  const h = paneHarness({ vault_root: '/somewhere/vault',
    connected_sources: [VAULT] });
  h.renderPane();
  const rows = rowCount(h.box.innerHTML);
  caseAssert(rows === 1, 'the pane rendered ' + rows + ' row(s) for a ' +
    'connected vault source; exactly 1 is required — a connected source ' +
    'that is invisible is the worst version of the stranding problem');
  const composed = h.name(VAULT) + h.status(VAULT);
  caseAssert(composed === COPY_EXTRACT.C3, 'the composed status line is ' +
    JSON.stringify(composed) + ', which is not byte-identical to her ' +
    'recorded row ' + JSON.stringify(COPY_EXTRACT.C3));
  caseAssert(h.box.innerHTML.indexOf(COPY_EXTRACT.C3) !== -1,
    'the rendered row does not carry her recorded status line verbatim');
});

// --- case 5: the collect control, in BOTH states, never on the list ---------
runCase('the-collect-control-renders-in-both-states-and-ignores-the-' +
  'connected-list', function () {
  [
    { label: 'connected, with a vault root',
      meta: { vault_root: '/v', connected_sources: [VAULT] } },
    { label: 'NOT connected, with a vault root',
      meta: { vault_root: '/v', connected_sources: [] } },
    { label: 'connected, with NO vault root',
      meta: { connected_sources: [VAULT] } },
    { label: 'NOT connected, with NO vault root',
      meta: { connected_sources: [] } }
  ].forEach(function (state) {
    const h = paneHarness(state.meta);
    h.renderPane();
    const n = ctrlCount(h.box.innerHTML);
    caseAssert(n === 1, 'with the pane ' + state.label + ' the control that ' +
      'starts a collect rendered ' + n + ' time(s); exactly 1 is required. ' +
      'Conditioning it on the connected list is the stranding trap: it ' +
      'leaves a connected source showing a disconnect control and no way ' +
      'to bring anything in.');
    caseAssert(h.box.innerHTML.indexOf(COPY_EXTRACT.C4) !== -1,
      'with the pane ' + state.label + ' the control does not carry her ' +
      'recorded label ' + JSON.stringify(COPY_EXTRACT.C4));
  });
  // The control's ACTION is what the vault root governs — never the list.
  const withRoot = paneHarness({ vault_root: '/v', connected_sources: [] });
  withRoot.startVaultCollect(null);
  // ⚠ CHANGED BY 26.97-08, deliberately and in the same commit as the
  // behaviour. With a vault root stored the tap no longer starts a bare
  // collect: it opens the SEEDED exclusion picker, and the collect runs from
  // that picker's own confirm. She is shown her own folders BEFORE the first
  // note is read (law 5) — a bare collect here would be the room reading her
  // vault before she had ever been offered the choice.
  caseAssert(withRoot.rec.collects.length === 0 &&
    withRoot.rec.vaultPickers === 1,
    'with a vault root stored and NOTHING connected, the control started ' +
    JSON.stringify(withRoot.rec.collects) + ' collect(s) and opened the ' +
    'exclusion picker ' + withRoot.rec.vaultPickers + ' time(s); exactly ' +
    'zero collects and one picker are required');
  const noRoot = paneHarness({ connected_sources: [VAULT] });
  noRoot.startVaultCollect(null);
  caseAssert(noRoot.rec.collects.length === 0 &&
    noRoot.rec.vaultScreens === 1,
    'with NO vault root stored the control must surface the shipped ' +
    'vault-path field rather than start a collect or dead-end; it made ' +
    noRoot.rec.collects.length + ' collect(s) and surfaced the field ' +
    noRoot.rec.vaultScreens + ' time(s)');
});

// --- case 6: the last-import line says WHEN, from the server's record -------
runCase('the-last-import-line-says-when-from-the-stored-timestamp',
  function () {
    // Her recorded row is the SHAPE, split structurally so no sentence is
    // typed into this suite: `last import — {when} — brought in …`.
    const parts = COPY_EXTRACT.C12.split(' — ');
    caseAssert(parts.length === 3, 'her recorded last-import row does not ' +
      'have the three-part shape this assertion derives from: ' +
      JSON.stringify(COPY_EXTRACT.C12));
    const head = parts[0] + ' — ';
    const mid = ' — ' + parts[2].replace('…', '');
    const h = reportHarness();
    // A timestamp a browser clock can never produce: it is in the past and it
    // is not today. Reading Date.now() instead of the stored value reddens
    // this immediately.
    const stored = new Date(2026, 2, 2, 11, 0, 0).getTime();
    h.render({ imported: 3, finished_ms: stored });
    const withStamp = String(h.box.innerHTML);
    caseAssert(withStamp.indexOf(head) !== -1, 'the line does not open with ' +
      'her recorded when-carrying head ' + JSON.stringify(head) +
      '; rendered: ' + JSON.stringify(withStamp));
    caseAssert(withStamp.indexOf('2 March') !== -1, 'the line does not carry ' +
      'the date of the STORED timestamp (2 March); rendered: ' +
      JSON.stringify(withStamp) + ' — a date read from the browser clock is ' +
      'the paint time, not the import time, and that is the defect being ' +
      'removed');
    caseAssert(withStamp.indexOf(mid) !== -1, 'the line does not carry her ' +
      'recorded tail ' + JSON.stringify(mid));
    // A report saved BEFORE the server carried the field renders sensibly: it
    // still renders, and it says nothing at all about when.
    h.render({ imported: 3 });
    const old = String(h.box.innerHTML);
    caseAssert(old.indexOf('brought in') !== -1, 'a report with no stored ' +
      'timestamp rendered nothing at all; it must still render');
    caseAssert(old.indexOf(head) === -1, 'a report with no stored timestamp ' +
      'rendered a when-clause anyway: ' + JSON.stringify(old));
    // The words are hers (OD-5: words plus the date), taken against the
    // stored value alone — the phrase function reads no clock of its own.
    const day = 86400000;
    caseAssert(String(h.when(stored, stored)).indexOf('earlier today, ') === 0,
      'a same-day import does not carry her recorded same-day word; got ' +
      JSON.stringify(h.when(stored, stored)));
    caseAssert(String(h.when(stored, stored + day)).indexOf('yesterday, ') === 0,
      'a previous-day import does not carry her recorded previous-day word');
    caseAssert(h.when(stored, stored + 9 * day) === '2 March',
      'an older import must carry the date alone — no day count, no ' +
      'time-gap language (law 3); got ' +
      JSON.stringify(h.when(stored, stored + 9 * day)));
    caseAssert(h.when(undefined, stored) === '',
      'a missing stored timestamp must yield no when-clause at all');
  });

// --- case 7: every shipped sentence equals her recorded row -----------------
runCase('every-shipped-sentence-equals-her-recorded-row', function () {
  const record = readCopyRecord();
  if (record) {
    ['C1', 'C2', 'C3', 'C4', 'C12'].forEach(function (k) {
      caseAssert(record[k] === COPY_EXTRACT[k], 'the tracked extract of row ' +
        k + ' has drifted from her record: extract ' +
        JSON.stringify(COPY_EXTRACT[k]) + ' vs record ' +
        JSON.stringify(record[k]));
    });
  }
  // ⚠ C4 carries NO terminal punctuation and ships exactly as written.
  caseAssert(!/[.!?;:,]$/.test(COPY_EXTRACT.C4), 'her recorded button label ' +
    'has gained terminal punctuation: ' + JSON.stringify(COPY_EXTRACT.C4));
  const h = paneHarness({ vault_root: '/v', connected_sources: [VAULT] });
  caseAssert(h.name(VAULT) === COPY_EXTRACT.C1, 'the shipped name is ' +
    JSON.stringify(h.name(VAULT)) + ', not her recorded ' +
    JSON.stringify(COPY_EXTRACT.C1));
  caseAssert(h.name(VAULT) + h.status(VAULT) === COPY_EXTRACT.C3,
    'the shipped status line is not byte-identical to her recorded row');
  [COPY_EXTRACT.C2, COPY_EXTRACT.C4].forEach(function (sentence) {
    caseAssert(appSrc.indexOf(sentence) !== -1, 'a sentence she chose is not ' +
      'in the client byte-for-byte: ' + JSON.stringify(sentence));
  });
  // ⛔ The brought-in-once wording is NOT reused for this source — liveness is
  // the whole point of the phase and that sentence would be false here.
  caseAssert(COPY_EXTRACT.C2.indexOf('brought in once') === -1,
    'her recorded sublabel must not carry the brought-in-once wording');
  const pane = functionBody('renderConnectedSourcesSection');
  [['your notes, brought in once', 1], ['your photos, brought in once', 1]]
    .forEach(function (pair) {
      const n = pane.split(pair[0]).length - 1;
      caseAssert(n === pair[1], 'the pane carries ' + JSON.stringify(pair[0]) +
        ' ' + n + ' time(s); exactly ' + pair[1] + ' is required — the ' +
        'brought-in-once wording belongs to the two brought-in-once sources ' +
        'and to nothing else');
    });
  // Nothing on this surface counts anything back at her (law 3).
  ['days ago', 'since you', "it's been", 'last synced', 'streak', 'checkmark']
    .forEach(function (tok) {
      caseAssert(pane.toLowerCase().indexOf(tok) === -1,
        "the pane must not carry '" + tok + "' (law 3)");
    });
});

// --- the shipped control case, green before and after this plan -------------
runCase('control-shipped-notes-sublabel-byte-present', function () {
  caseAssert(appSrc.indexOf(
    'your notes, brought in once — nothing in Notes is ever changed.') !== -1,
    'the shipped Apple Notes sublabel is missing from the client');
});

// ---- verdict ----------------------------------------------------------------

if (violations.length) {
  console.error('test_adapter_sources FAILED — ' + violations.length +
    ' assertion(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_adapter_sources OK');
process.exit(0);
