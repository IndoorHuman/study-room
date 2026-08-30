/*
 * tests/test_obsidian_picker.cjs — the SEEDED vault-folder exclusion picker
 * (Plan 26.97-08, law 5).
 *
 * Zero-dep node (fs/path/os only), path-independent via __dirname. It stands
 * the SHIPPED client functions up on a controllable page, calls them, and
 * reads what rendered.
 *
 * EVERY BEHAVIOURAL CLAIM HERE IS **DRIVEN**. A regex over app.js can be made
 * green by editing the regex while the behaviour is still wrong — that trap is
 * recorded on this project (nine instances) and it is why the driven half
 * exists. The claims that are source-text are LABELLED as such in their own
 * comments and in the SUMMARY.
 *
 * THIRTEEN CASES, one machine-readable line each, at line start, no prefix:
 *   ok: <case-name>   /   FAIL: <case-name>
 * (mirroring what the Python gates read; the red-first gate asserts on those
 * lines BY VALUE, and no case carries a description that could print in place
 * of its name.)
 *
 *   1  the-seed-unticks-her-private-folders-by-name
 *   2  a-nested-private-entry-does-not-untick-its-ancestor
 *   3  a-private-entry-absent-from-the-enumeration-is-surfaced-not-dropped
 *   4  a-private-entry-never-catches-a-longer-folder-by-prefix
 *   5  re-opening-shows-her-remembered-choices
 *   6  confirming-sends-the-unticked-folders-and-counts-nothing
 *   7  an-empty-enumeration-keeps-the-confirm-control
 *   8  the-calm-interim-paints-before-the-call-returns
 *   9  an-unreadable-vault-shows-the-quiet-error-and-a-retry-that-reopens-the-list
 *  10  an-unreadable-folder-renders-kept-out-and-non-toggleable
 *  11  many-folders-scroll-inside-the-card
 *  12  a-long-folder-name-is-clipped-to-one-line
 *  13  every-shipped-sentence-equals-her-recorded-row
 *  --  control-shipped-notes-picker-keeps-unticked-folders-out  (shipped;
 *      green before this plan and after it — a suite-wide red proves nothing)
 *
 * Run contract: one OK line + exit 0 on success; every unmet assertion on its
 * own line + exit 1 on failure.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
// The REAL escaping core, handed to the driven page rather than stood in for.
// A stand-in escaper in a suite about what the room SAYS would sit between
// her sentence and the assertion.
const StudyCore = require(path.join(ROOT, 'core.js'));

const violations = [];

/* ---- lifting from app.js, never re-typing into this file ------------------
   The mirror trap: a suite that restates the code pins whatever the code
   happens to say. Every constant and every function body under test is taken
   BY VALUE out of app.js. */

function functionBody(name) {
  const marker = 'function ' + name + '(';
  const start = appSrc.indexOf(marker);
  if (start === -1) {
    violations.push('[picker] ' + APP + ": function '" + name +
      "' not found — it does not exist yet, or it was renamed; update this " +
      'gate deliberately');
    return '';
  }
  const end = appSrc.indexOf('\n  function ', start + marker.length);
  const raw = appSrc.slice(start, end === -1 ? appSrc.length : end);
  const close = raw.lastIndexOf('\n  }');
  return close === -1 ? raw : raw.slice(0, close + 4);
}

const MISSING = ' missing';

function varLiteral(name) {
  const re = new RegExp('\\bvar ' + name +
    " = ('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\");");
  const m = appSrc.match(re);
  if (!m) {
    violations.push('[picker] ' + APP + ": constant '" + name +
      "' not found as a single string literal — update this gate " +
      'deliberately');
    return JSON.stringify(MISSING);
  }
  return m[1];
}

function arrayLiteral(name) {
  const m = appSrc.match(new RegExp('\\bvar ' + name + ' = (\\[[\\s\\S]*?\\]);'));
  if (!m) {
    violations.push('[picker] ' + APP + ": array constant '" + name +
      "' not found — update this gate deliberately");
    return '[]';
  }
  return m[1];
}

/* ---- her record -----------------------------------------------------------
   THE RECORD CANNOT BE NAMED HERE BY PATH: it lives in the planning vault, and
   tools/stage_public.py's DENY gate refuses a home-directory path in any
   tracked file. So the four rows are kept as a tracked VERBATIM EXTRACT, and
   whenever the record itself is reachable (STUDY_COPY_RECORD, or the vault at
   its usual place, resolved at run time from the home directory and never
   spelled out) the extract is additionally asserted EQUAL to the record — so
   the extract cannot drift away from what she chose without case 13 reddening.

   C7 carries NO terminal punctuation and ships exactly as written. */
// ⚠⚠ READ FROM THE SHARED TRACKED EXTRACT, NOT RE-TYPED HERE (changed
// 2026-08-19). These four rows used to be spelled out again in this file. A
// suite that restates the strings it is checking pins whatever the code says
// as correct — the mirror trap this file's own header warns about, and it had
// it. Ten other rows were already pinned through
// tests/fixtures/copy-2697-rows.json; these now use the same one source, so a
// drift shows up once instead of being hand-verified in two places.
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

/* ---- the controllable page ------------------------------------------------
   A tiny DOM: one box whose innerHTML setter PARSES what was written, so an
   assertion reads the rendered surface rather than the source that produced
   it. Buttons become clickable elements; the tick boxes become real checkbox
   objects carrying `checked`, `disabled` and `value`. */

function unescapeAttr(s) {
  return String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function makeEl(tag) {
  return {
    tag: tag, checked: false, disabled: false, value: '', handlers: {},
    addEventListener: function (ev, fn) {
      (this.handlers[ev] = this.handlers[ev] || []).push(fn);
    },
    click: function () {
      (this.handlers.click || []).forEach(function (f) { f(); });
    }
  };
}

function parseSurface(html) {
  const boxes = [];
  const buttons = {};
  let m;
  const ri = /<input\b([^>]*)>/g;
  while ((m = ri.exec(html)) !== null) {
    const attrs = m[1];
    if (attrs.indexOf('class="vault-folder-box"') === -1) { continue; }
    const cb = makeEl('input');
    cb.checked = /(^|\s)checked(\s|$|=)/.test(attrs);
    cb.disabled = /(^|\s)disabled(\s|$|=)/.test(attrs);
    const v = attrs.match(/value="([^"]*)"/);
    cb.value = v ? unescapeAttr(v[1]) : '';
    boxes.push(cb);
  }
  const rb = /<button\b([^>]*)>/g;
  while ((m = rb.exec(html)) !== null) {
    const idm = m[1].match(/id="([^"]*)"/);
    if (idm) { buttons[idm[1]] = makeEl('button'); }
  }
  return { boxes: boxes, buttons: buttons };
}

// Lifted ONCE — so a missing function reports one violation, not one per case.
const LIFTED = [
  functionBody('escapeHtml'),
  functionBody('escapeAttr'),
  functionBody('rosterSegments'),
  functionBody('vaultPickerRows'),
  functionBody('renderVaultPickerError'),
  functionBody('renderVaultFolderPicker'),
  functionBody('startVaultCollect')
].join('\n');

const CONSTS = [
  'var VAULT_SOURCE = ' + varLiteral('VAULT_SOURCE') + ';',
  'var VAULT_DEFAULT_ROSTER = ' + arrayLiteral('VAULT_DEFAULT_ROSTER') + ';',
  'var VAULT_PICKER_FRAMING = ' + varLiteral('VAULT_PICKER_FRAMING') + ';',
  'var VAULT_PICKER_INSTRUCTION = ' +
    varLiteral('VAULT_PICKER_INSTRUCTION') + ';',
  'var VAULT_PICKER_CONFIRM = ' + varLiteral('VAULT_PICKER_CONFIRM') + ';',
  'var VAULT_PICKER_UNREACHABLE = ' +
    varLiteral('VAULT_PICKER_UNREACHABLE') + ';',
  'var VAULT_PICKER_EMPTY = ' + varLiteral('VAULT_PICKER_EMPTY') + ';'
].join('\n');

function pageHarness(opts) {
  opts = opts || {};
  const rec = { collects: [], paints: [], vaultScreens: 0 };
  const surface = { boxes: [], buttons: {} };
  const box = { _html: '' };
  Object.defineProperty(box, 'innerHTML', {
    get: function () { return box._html; },
    set: function (v) {
      box._html = String(v);
      const p = parseSurface(box._html);
      surface.boxes = p.boxes;
      surface.buttons = p.buttons;
      rec.paints.push(box._html);
    }
  });
  box.style = {};
  box.querySelectorAll = function (sel) {
    return sel === '.vault-folder-box' ? surface.boxes : [];
  };
  function byId(id) {
    return Object.prototype.hasOwnProperty.call(surface.buttons, id) ?
      surface.buttons[id] : null;
  }
  const RESPONSES = {
    '/api/adapter/vault-folders': opts.foldersRes ||
      { ok: true, data: { folders: [], unreadable: [] } },
    '/api/items': opts.itemsRes ||
      { ok: true, data: { meta: opts.meta || {} } }
  };
  const pending = [];
  const api = new Function('rec', 'box', 'byId', 'RESPONSES', 'pending',
    'DEFER', 'StudyCore', 'MANAGE_META', `
    function $(id) { return byId(id); }
    function apiGet(url) {
      if (DEFER) {
        return new Promise(function (resolve) {
          pending.push(function () { resolve(RESPONSES[url]); });
        });
      }
      return Promise.resolve(RESPONSES[url]);
    }
    var MANAGE = { meta: MANAGE_META };
    function enterVaultImport() { rec.vaultScreens++; }
    function runAdapterCollect(source, excludeFolders, b, roomMode) {
      rec.collects.push({ source: source, exclude: excludeFolders,
        room: roomMode === true });
    }
    ${CONSTS}
    ${LIFTED}
    return {
      render: typeof renderVaultFolderPicker === 'function' ?
        renderVaultFolderPicker : null,
      rows: typeof vaultPickerRows === 'function' ? vaultPickerRows : null,
      start: typeof startVaultCollect === 'function' ?
        startVaultCollect : null,
      framing: typeof VAULT_PICKER_FRAMING === 'string' ?
        VAULT_PICKER_FRAMING : null,
      instruction: typeof VAULT_PICKER_INSTRUCTION === 'string' ?
        VAULT_PICKER_INSTRUCTION : null,
      confirm: typeof VAULT_PICKER_CONFIRM === 'string' ?
        VAULT_PICKER_CONFIRM : null,
      unreachable: typeof VAULT_PICKER_UNREACHABLE === 'string' ?
        VAULT_PICKER_UNREACHABLE : null
    };`)(rec, box, byId, RESPONSES, pending, opts.defer === true, StudyCore,
    opts.manageMeta || {});
  api.rec = rec;
  api.box = box;
  api.byId = byId;
  api.surface = surface;
  api.flush = function () {
    const q = pending.splice(0, pending.length);
    q.forEach(function (f) { f(); });
  };
  return api;
}

// Two microtask turns is enough for Promise.all + .then over resolved
// promises; six are taken, so a slower chain still lands.
async function settle() {
  for (let i = 0; i < 6; i++) { await Promise.resolve(); }
}

// Paint the picker and wait for the render that follows the two calls.
async function paint(opts) {
  const h = pageHarness(opts);
  if (!h.render) {
    throw new Error('renderVaultFolderPicker is not present in ' + APP +
      ' — the seeded picker does not exist yet, so nothing can be driven');
  }
  h.render(h.box);
  await settle();
  return h;
}

/* ---- reading the rendered surface ---------------------------------------- */

function untickedNames(h) {
  return h.surface.boxes.filter(function (b) { return !b.checked; })
    .map(function (b) { return b.value; }).sort();
}
function tickedNames(h) {
  return h.surface.boxes.filter(function (b) { return b.checked; })
    .map(function (b) { return b.value; }).sort();
}
function allNames(h) {
  return h.surface.boxes.map(function (b) { return b.value; }).sort();
}
function show(a) { return JSON.stringify(a); }

// THE NO-COUNT DETECTOR, and its exemption stated precisely.
//
// It reads the surface's TEXT — everything outside a tag — so an inline style
// (`margin:0.2em`, `max-height:10rem`) can never make it falsely red: a style
// is not something she reads. Inside that text the ONE exemption is a folder
// NAME SHE TYPED: her own `2026 archive` must not redden a rule about the room
// counting. Each rendered name is removed from the text once per occurrence,
// and then NO digit may remain.
//
// Not vacuous: case 6 asserts the same detector FIRES on a surface carrying a
// count, and asserts the tick boxes rendered by name in the same breath, so an
// empty surface cannot pass it.
function visibleText(html) {
  return String(html).replace(/<[^>]*>/g, '');
}
function digitsOutsideNames(html, names) {
  let text = visibleText(html);
  (names || []).forEach(function (n) {
    const esc = StudyCore.escapeHtml(String(n));
    if (!esc) { return; }
    let i;
    while ((i = text.indexOf(esc)) !== -1) {
      text = text.slice(0, i) + text.slice(i + esc.length);
    }
  });
  return text.match(/[0-9]/g) || [];
}

/* ---- assertion plumbing --------------------------------------------------- */

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
    violations.push('[2697-08] ' + name + ': ' + failure);
  }
}

/* ---- the fixture ----------------------------------------------------------
   Its shapes mirror her real private-folders list, which was MEASURED for this
   plan: not all of it is top-level, one entry names a folder nested two deep,
   and one folder name is a strict prefix of another real folder.

   `Journal analysis` is the folder that makes the prefix case load-bearing: it
   is a real folder holding the room's own writing about her diary, and a
   string-prefix match on `Journal` would fence it by accident.
   `2026 archive` carries a digit, so the no-count exemption is exercised
   rather than merely declared. */
const FOLDERS = ['Clippings', 'Journal', 'Journal analysis', '2026 archive',
  'Recipes'];
const PRIVATE = ['Journal', 'Clippings/journal/chatgpt', 'personnel notes'];

function foldersRes(folders, unreadable) {
  return { ok: true,
    data: { folders: folders, unreadable: unreadable || [] } };
}
function itemsRes(meta) {
  return { ok: true, data: { meta: meta || {} } };
}

/* ---- the cases ------------------------------------------------------------ */

async function main() {

  // 1 — DRIVEN. The seed, asserted BY NAME in both directions: the private
  // folders come back unticked AND the others come back ticked. Asserting only
  // the unticked set would be passed by a picker that unticked everything.
  await runCase('the-seed-unticks-her-private-folders-by-name',
    async function () {
      const h = await paint({ foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      caseAssert(h.surface.boxes.length === FOLDERS.length + 2,
        'the picker rendered ' + h.surface.boxes.length + ' tick box(es) ' +
        'for ' + FOLDERS.length + ' enumerated folder(s) and 2 private ' +
        'entries no folder claims; ' + (FOLDERS.length + 2) + ' are ' +
        'required. Rendered: ' + show(allNames(h)));
      caseAssert(show(untickedNames(h)) ===
        show(['Clippings/journal/chatgpt', 'personnel notes', 'Journal']),
        'the unticked set is ' + show(untickedNames(h)) + '; her private ' +
        'folders and only her private folders must start out unticked');
      caseAssert(show(tickedNames(h)) ===
        show(['2026 archive', 'Clippings', 'Journal analysis', 'Recipes']),
        'the ticked set is ' + show(tickedNames(h)) + '; every folder she ' +
        'has NOT kept private must start out ticked — a picker that unticked ' +
        'everything would pass a one-sided seed assertion');
    });

  // 2 — DRIVEN. `Clippings/journal/chatgpt` is private; `Clippings` is not.
  await runCase('a-nested-private-entry-does-not-untick-its-ancestor',
    async function () {
      const h = await paint({ foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      const ticked = tickedNames(h);
      caseAssert(ticked.indexOf('Clippings') !== -1,
        'the folder that merely CONTAINS a private folder came back ' +
        'unticked; ticked set: ' + show(ticked) + '. She kept ' +
        '`Clippings/journal/chatgpt` private, not the whole of `Clippings` ' +
        '— reading the entry as its first segment alone once fenced 1,921 ' +
        'things instead of 344');
      caseAssert(untickedNames(h).indexOf('Clippings/journal/chatgpt') !== -1,
        'the nested private entry itself is not unticked anywhere on the ' +
        'surface; unticked set: ' + show(untickedNames(h)));
    });

  // 3 — DRIVEN. An entry naming a folder the enumeration does not carry.
  await runCase(
    'a-private-entry-absent-from-the-enumeration-is-surfaced-not-dropped',
    async function () {
      const h = await paint({ foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      const names = allNames(h);
      caseAssert(names.indexOf('personnel notes') !== -1,
        'a private-folder entry the enumeration does not carry VANISHED ' +
        'from the picker; rendered names: ' + show(names) + '. A fence she ' +
        'has to rebuild from memory is not a fence');
      caseAssert(untickedNames(h).indexOf('personnel notes') !== -1,
        'the surfaced entry rendered TICKED — surfacing it and then quietly ' +
        'letting it back in is the same silent shrink wearing a costume');
      caseAssert(names.indexOf('Clippings/journal/chatgpt') !== -1,
        'the nested private entry, which the top-level enumeration also ' +
        'does not carry, vanished; rendered names: ' + show(names));
    });

  // 4 — DRIVEN. The prefix pair. Substituting a string-prefix test reddens it.
  await runCase('a-private-entry-never-catches-a-longer-folder-by-prefix',
    async function () {
      const h = await paint({ foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: ['Journal'] }) });
      caseAssert(untickedNames(h).indexOf('Journal') !== -1,
        'the folder she actually named came back ticked; unticked set: ' +
        show(untickedNames(h)));
      caseAssert(tickedNames(h).indexOf('Journal analysis') !== -1,
        '`Journal` caught `Journal analysis`; unticked set: ' +
        show(untickedNames(h)) + '. Matching is segment-wise and WHOLE, ' +
        'never a string prefix — `Journal analysis` is a real, different ' +
        'folder holding the room\'s own writing about her diary');
    });

  // 5 — DRIVEN. Presence, not truthiness: an ABSENT remembered list falls to
  // her private folders; a PRESENT one wins, even when it is empty.
  await runCase('re-opening-shows-her-remembered-choices', async function () {
    const first = await paint({ foldersRes: foldersRes(FOLDERS),
      itemsRes: itemsRes({ fenced_roster: ['Journal'] }) });
    caseAssert(show(untickedNames(first)) === show(['Journal']),
      'the FIRST open did not seed from her private folders; unticked set: ' +
      show(untickedNames(first)));
    const again = await paint({ foldersRes: foldersRes(FOLDERS),
      itemsRes: itemsRes({ fenced_roster: ['Journal'],
        vault_excluded_folders: ['Recipes', '2026 archive'] }) });
    caseAssert(show(untickedNames(again)) ===
      show(['2026 archive', 'Recipes']),
      'a re-open showed ' + show(untickedNames(again)) + ' rather than the ' +
      'choices she confirmed last time. Re-opening the list may never ' +
      'silently un-make a privacy choice with one tap');
    const cleared = await paint({ foldersRes: foldersRes(FOLDERS),
      itemsRes: itemsRes({ fenced_roster: ['Journal'],
        vault_excluded_folders: [] }) });
    caseAssert(show(untickedNames(cleared)) === show([]),
      'an explicitly EMPTY remembered list must be honoured as her ' +
      'deliberate clear, not read as absent; unticked set: ' +
      show(untickedNames(cleared)));
  });

  // 6 — DRIVEN. The confirm, the tick boxes by name, and the no-count rule —
  // in ONE case, so an empty surface cannot pass any half of it.
  await runCase('confirming-sends-the-unticked-folders-and-counts-nothing',
    async function () {
      const h = await paint({ foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      caseAssert(show(allNames(h)) === show(['2026 archive', 'Clippings',
        'Clippings/journal/chatgpt', 'personnel notes', 'Journal',
        'Journal analysis', 'Recipes']),
        'the tick boxes are not the ones expected, by name: ' +
        show(allNames(h)));
      const go = h.byId('btn-vault-picker-go');
      caseAssert(go !== null,
        'the confirm control is absent from the surface');
      go.click();
      caseAssert(h.rec.collects.length === 1,
        'the confirm started ' + h.rec.collects.length + ' collect(s); ' +
        'exactly 1 is required');
      caseAssert(h.rec.collects[0].source === 'obsidian-vault',
        'the confirm started a collect of ' +
        show(h.rec.collects[0].source) + ' rather than the vault source');
      caseAssert(show(h.rec.collects[0].exclude.slice().sort()) ===
        show(['Clippings/journal/chatgpt', 'personnel notes', 'Journal']),
        'the confirm sent ' + show(h.rec.collects[0].exclude) + ' as the ' +
        'kept-out list; the unticked folders and only those are required');
      // NO COUNT ANYWHERE — not of what was kept out, not of what came in.
      const digits = digitsOutsideNames(h.box.innerHTML, allNames(h));
      caseAssert(digits.length === 0,
        'the surface renders ' + show(digits) + ' outside a folder name she ' +
        'typed. Nothing may be counted back at her: the tick boxes are the ' +
        'whole state');
      // the exemption is EXERCISED, not merely declared
      caseAssert(allNames(h).indexOf('2026 archive') !== -1,
        'the digit-bearing folder name is not on the surface, so the ' +
        'no-count exemption was never exercised and the check above is ' +
        'weaker than it looks');
      // and the detector FIRES — this check is not vacuous
      caseAssert(
        digitsOutsideNames('<p>3 folders kept out</p>', []).length === 1,
        'the no-count detector does not fire on a surface that plainly ' +
        'carries a count; it would pass anything');
    });

  // 7 — DRIVEN. S2 empty.
  await runCase('an-empty-enumeration-keeps-the-confirm-control',
    async function () {
      const h = await paint({ foldersRes: foldersRes([]),
        itemsRes: itemsRes({ fenced_roster: [] }) });
      caseAssert(h.surface.boxes.length === 0,
        'an empty vault rendered ' + h.surface.boxes.length +
        ' tick box(es)');
      caseAssert(h.byId('btn-vault-picker-go') !== null,
        'the confirm control disappeared with the last folder; it must ' +
        'still render');
      // ⚠⚠ THIS ASSERTION WAS CHANGED 2026-08-19, AND NOT TO GO GREEN.
      // It used to require the empty state to BORROW the fence screen's
      // sentence ('nothing flagged yet. add a folder to keep private') --
      // so it pinned the defect as correct, which is this project's
      // recurring trap. On the fence screen that line is true. HERE it fires
      // when the vault returned no top-level folders at all: it invited her
      // to add a private folder on a screen with no control for doing so,
      // directly above a button that would collect the whole vault root.
      // /gsd-secure-phase raised it as the last surviving ground of
      // T-26.97-14; she was shown three candidates and picked this one,
      // recorded as row C15. The string is READ FROM THE EXTRACT, never
      // re-typed here.
      caseAssert(h.box.innerHTML.indexOf(COPY_EXTRACT.C15) !== -1,
        'the empty state does not carry her recorded row C15; rendered: ' +
        show(h.box.innerHTML));
      caseAssert(h.box.innerHTML.indexOf('nothing flagged yet') === -1,
        'the picker is still borrowing the fence screen sentence, which is ' +
        'false on this surface; rendered: ' + show(h.box.innerHTML));
    });

  // 8 — DRIVEN. S2 loading: the calm interim paints BEFORE the call returns,
  // so no error wording can appear first.
  await runCase('the-calm-interim-paints-before-the-call-returns',
    async function () {
      const h = pageHarness({ defer: true, foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      caseAssert(h.render !== null,
        'renderVaultFolderPicker is not present in ' + APP);
      h.render(h.box);
      const first = h.box.innerHTML;
      caseAssert(first.indexOf('checking…') !== -1,
        'the first paint is ' + show(first) + '; the shipped calm interim ' +
        'must paint first');
      caseAssert(first.indexOf(COPY_EXTRACT.C14) === -1 &&
        first.indexOf('quiet-error') === -1,
        'error wording appeared BEFORE the call returned: ' + show(first));
      h.flush();
      await settle();
      caseAssert(h.surface.boxes.length > 0,
        'the list never rendered after the call returned');
    });

  // 9 — DRIVEN. S2 error: the quiet shape, her recorded line, and a retry that
  // re-opens the LIST (there is no collect to retry yet).
  await runCase(
    'an-unreadable-vault-shows-the-quiet-error-and-a-retry-that-reopens-the-list',
    async function () {
      const h = await paint({
        foldersRes: { ok: false, error: 'the room could not read the vault' },
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      const html = h.box.innerHTML;
      caseAssert(html.indexOf('quiet-error') !== -1,
        'the error does not reuse the shipped quiet shape; rendered: ' +
        show(html));
      caseAssert(html.indexOf(COPY_EXTRACT.C14) !== -1,
        'the error does not carry her recorded vault-not-found line ' +
        'byte-for-byte; rendered: ' + show(html));
      const retry = h.byId('btn-vault-picker-retry');
      caseAssert(retry !== null, 'there is no retry control on the error');
      caseAssert(html.indexOf('try again') !== -1,
        'the retry is not the shipped lowercase quiet link; rendered: ' +
        show(html));
      caseAssert(h.rec.collects.length === 0,
        'the error path started ' + h.rec.collects.length + ' collect(s); ' +
        'there is no collect to retry yet');
      retry.click();
      caseAssert(h.box.innerHTML.indexOf('checking…') !== -1,
        'the retry did not re-open the LIST; it painted ' +
        show(h.box.innerHTML));
      caseAssert(h.rec.collects.length === 0,
        'the retry started a collect rather than re-opening the list');
    });

  // 10 — DRIVEN. S2 partial.
  await runCase('an-unreadable-folder-renders-kept-out-and-non-toggleable',
    async function () {
      const h = await paint({
        foldersRes: foldersRes(FOLDERS, ['Recipes']),
        itemsRes: itemsRes({ fenced_roster: [] }) });
      caseAssert(allNames(h).indexOf('Recipes') !== -1,
        'a folder that cannot be read is SILENTLY ABSENT from the list; ' +
        'rendered names: ' + show(allNames(h)) + '. The list may never ' +
        'quietly shrink the fence');
      const row = h.surface.boxes.filter(function (b) {
        return b.value === 'Recipes';
      })[0];
      caseAssert(row.checked === false,
        'the unreadable folder rendered ticked; it must render kept out');
      caseAssert(row.disabled === true,
        'the unreadable folder is toggleable; it must be non-toggleable');
    });

  // 11 — DRIVEN. S2 overflow: the list scrolls inside its card at the shipped
  // fixed height, and the confirm control sits OUTSIDE the scrolling box.
  await runCase('many-folders-scroll-inside-the-card', async function () {
    const many = [];
    for (let i = 0; i < 40; i++) { many.push('folder-' + i); }
    const h = await paint({ foldersRes: foldersRes(many),
      itemsRes: itemsRes({ fenced_roster: [] }) });
    const html = h.box.innerHTML;
    caseAssert(h.surface.boxes.length === 40,
      'the picker rendered ' + h.surface.boxes.length + ' of 40 folders');
    caseAssert(html.indexOf('max-height:10rem') !== -1 &&
      html.indexOf('overflow-y:auto') !== -1,
      'the list does not scroll inside its card at the shipped fixed height ' +
      '(max-height:10rem; overflow-y:auto)');
    caseAssert(
      html.indexOf('</div><p><button id="btn-vault-picker-go"') !== -1,
      'the confirm control is not immediately outside the scrolling box, so ' +
      'a long list can push it off-screen');
  });

  // 12 — DRIVEN. S2 long-text.
  await runCase('a-long-folder-name-is-clipped-to-one-line', async function () {
    const long = 'a-very-long-folder-name-' + 'x'.repeat(240);
    const h = await paint({ foldersRes: foldersRes([long]),
      itemsRes: itemsRes({ fenced_roster: [] }) });
    const html = h.box.innerHTML;
    caseAssert(allNames(h).indexOf(long) !== -1,
      'the long folder name was altered or dropped rather than rendered ' +
      'whole and clipped by presentation');
    caseAssert(html.indexOf('white-space:nowrap') !== -1 &&
      html.indexOf('text-overflow:ellipsis') !== -1 &&
      html.indexOf('overflow:hidden') !== -1,
      'the row does not clip to a single line; a long name would wrap or ' +
      'widen the card');
  });

  // 13 — her four rows. The record comparison and the punctuation check are
  // SOURCE-TEXT by nature (they are string-equality claims); the rest is
  // DRIVEN — the sentences are read off the rendered surface, and the tap is
  // driven to prove the picker comes BEFORE the first collect.
  await runCase('every-shipped-sentence-equals-her-recorded-row',
    async function () {
      const record = readCopyRecord();
      if (record) {
        ['C5', 'C6', 'C7', 'C14'].forEach(function (k) {
          caseAssert(record[k] === COPY_EXTRACT[k],
            'the tracked extract of row ' + k + ' has drifted from her ' +
            'record: extract ' + show(COPY_EXTRACT[k]) + ' vs record ' +
            show(record[k]));
        });
      }
      // C7 carries NO terminal punctuation and ships exactly as written.
      caseAssert(!/[.!?;:,]$/.test(COPY_EXTRACT.C7),
        'her recorded confirm label has gained terminal punctuation: ' +
        show(COPY_EXTRACT.C7));
      const h = await paint({ foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      caseAssert(h.framing === COPY_EXTRACT.C5,
        'the shipped framing line is ' + show(h.framing) + ', not her ' +
        'recorded row ' + show(COPY_EXTRACT.C5));
      caseAssert(h.instruction === COPY_EXTRACT.C6,
        'the shipped instruction line is ' + show(h.instruction) +
        ', not her recorded row ' + show(COPY_EXTRACT.C6));
      caseAssert(h.confirm === COPY_EXTRACT.C7,
        'the shipped confirm label is ' + show(h.confirm) + ', not her ' +
        'recorded row ' + show(COPY_EXTRACT.C7));
      caseAssert(h.unreachable === COPY_EXTRACT.C14,
        'the shipped vault-not-found line is ' + show(h.unreachable) +
        ', not her recorded row ' + show(COPY_EXTRACT.C14));
      const html = h.box.innerHTML;
      [COPY_EXTRACT.C5, COPY_EXTRACT.C6, COPY_EXTRACT.C7].forEach(
        function (s) {
          caseAssert(html.indexOf(s) !== -1,
            'a sentence she chose is not on the rendered surface ' +
            'byte-for-byte: ' + show(s));
        });
      // The two mechanisms stay APART in words: kept out of the room entirely
      // is not the same guarantee as the librarian may never read it.
      caseAssert(COPY_EXTRACT.C5.indexOf('keep private') !== -1 &&
        COPY_EXTRACT.C5.indexOf('leave out') !== -1,
        'her framing row no longer holds both mechanisms apart: ' +
        show(COPY_EXTRACT.C5));
      // and the tap opens the picker BEFORE any collect (law 5)
      caseAssert(h.start !== null,
        'startVaultCollect is not present in ' + APP);
      const t = pageHarness({ manageMeta: { vault_root: '/somewhere/vault' },
        foldersRes: foldersRes(FOLDERS),
        itemsRes: itemsRes({ fenced_roster: PRIVATE }) });
      t.start(t.box);
      await settle();
      caseAssert(t.rec.collects.length === 0,
        'the tap started ' + t.rec.collects.length + ' collect(s) before ' +
        'she was ever shown the list; the picker is offered BEFORE the ' +
        'first collect');
      caseAssert(t.surface.boxes.length > 0,
        'the tap did not open the picker at all');
    });

  // -- the shipped control case, green before this plan and after it ---------
  // SOURCE-TEXT, deliberately: it pins a shipped convention that exists at
  // HEAD, so a suite-wide red (a crash, a bad require, a broken harness)
  // cannot be mistaken for the red this plan expects.
  await runCase('control-shipped-notes-picker-keeps-unticked-folders-out',
    async function () {
      const body = functionBody('renderNotesFolderPicker');
      caseAssert(body.length > 0,
        'the shipped Notes folder picker is missing from ' + APP);
      caseAssert(
        body.indexOf('if (!cb.checked) { excluded.push(cb.value); }') !== -1,
        'the shipped unticked-means-kept-out convention is missing from the ' +
        'Notes picker');
    });
}

main().then(function () {
  if (violations.length) {
    console.error('test_obsidian_picker FAILED — ' + violations.length +
      ' assertion(s):');
    violations.forEach(function (v) { console.error('  ' + v); });
    process.exit(1);
  }
  console.log('test_obsidian_picker OK');
  process.exit(0);
});
