/*
 * tests/test_display_fence.cjs — the DISPLAY-fence toggle (Plan 26.4-10,
 * Change B). Zero-dep node (assert/fs/path only), path-independent.
 *
 * The governing decision of record: the fence is TWO layers.
 *   • The CLOUD fence (what is SENT to the librarian) is ABSOLUTE and is
 *     computed SERVER-SIDE from item state/trigger/filters — it never sees any
 *     display flag. (Proven by test_librarian_fence.py, green with the toggle
 *     in EITHER state, because the server never receives the flag at all.)
 *   • The SURFACING fence (shelf / spines / any auto-surface) is likewise
 *     independent of the toggle.
 *   • The DISPLAY fence — what the OWNER may click LOCALLY — is the ONLY thing
 *     this toggle affects. Default OFF, local-only (localStorage).
 *
 * This test pins the DISPLAY layer's pure decisions and the ARCHITECTURAL
 * separation (the flag lives only in app.js; the cloud + surfacing paths do
 * not reference it), so a future edit cannot quietly wire the toggle into the
 * librarian scope or the shelf.
 *
 * Behaviors covered:
 *   1. TOGGLE OFF (default) — a fenced door in the reflection body/Related is
 *      de-linked (no clickable anchor resolves to it).
 *   2. TOGGLE ON — the SAME fenced door survives as a live wikilink the owner
 *      can click; a non-fenced link is a live anchor in BOTH states.
 *   3. CLICK DECISION — wikilinkClickAction: non-fenced → 'open'; fenced+OFF →
 *      'inert'; fenced+ON → 'open-verbatim'; null → 'inert'.
 *   4. SEPARATION — the display flag (DISPLAY_FENCE_KEY / displayFenceOpen /
 *      setDisplayFenceOpen) appears in app.js but NOT in server.py or
 *      study_lib.py (the cloud path is computed without it), and the surfacing
 *      builders (buildReflectionShelf / buildInsightBooks / renderReflection-
 *      Spines) never consult it.
 *   5. LINKIFIED PATH-REFS (26.5-05, D-05) — linkifyLibraryPaths turns a
 *      SAFE (in-library, non-fenced) code-span / Returns-list path-ref into
 *      exactly one quiet anchor (class "pathref", data-path-key = the
 *      resolvable basename, the unmodified path string as its text), while a
 *      FENCED ref stays BYTE-IDENTICAL plain text with the toggle OFF —
 *      zero anchors, zero classes, zero markup delta (Pitfall 6 / law 5) —
 *      and is never even RESOLVED when its top folder sits under the fenced
 *      roster (the 26.4-09 no-resolution rule). Toggle ON follows the
 *      shipped 'open-verbatim' wikilink behavior (group 3). Every decision
 *      flows through the SAME pure wikilinkClickAction; an unresolvable
 *      path or a throwing resolver renders plain text (fail-closed,
 *      matching delinkifyFencedWikilinks).
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const libSrc = fs.readFileSync(path.join(ROOT, 'study_lib.py'), 'utf8');

const FENCED_ROSTER = ['Memoir', 'personnel notes',
  'billing & insurance notes', 'appraisal record'];

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Lift a top-level `function name(...) { ... }` verbatim by brace-matching.
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1, name + ' must be defined in app.js');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

// reflectionBodyForDisplay composes delinkifyFencedWikilinks +
// collectFencedBasenames; lift all three with the injected roster free var.
// 26.91-39 (A-27): the roster is no longer read from the constant — the three
// fence sites resolve it through reflectionActiveRoster, which prefers her
// stored meta.fenced_roster and falls back to the shipped EXAMPLE list. So the
// two resolvers are lifted here too and ROOM is injected. ONE binding, in one
// place, because after this there is no way to express forgetting it.
//   ROOM.meta = {}                       -> the example list (today's default)
//   ROOM.meta = { fenced_roster: [...] } -> HER list wins
//   ROOM.meta = null                     -> UNKNOWN, and it FAILS CLOSED
function rosterRoom(opts) {
  opts = opts || {};
  if (opts.noMeta === true) { return { meta: null }; }
  return { meta: opts.stored ? { fenced_roster: opts.stored } : {} };
}
// ⚠ `rosterSegments` joined this list 2026-08-14 when a roster entry
// gained the right to name a NESTED folder. It is the shared rule the
// fence now turns on, so a harness that lifted its caller and not it
// crashes rather than quietly fencing nothing — which is how it was
// found. Lift the rule, not just the verdict.
const ROSTER_LIFTS = ['rosterSegments', 'reflectionActiveRoster',
                      'reflectionRosterFences'];
function liftRoster(src) {
  return ROSTER_LIFTS.map(function (n) { return extractFn(src, n); })
    .join('\n') + '\n';
}

function loadBodyForDisplay(opts) {
  const src = liftRoster(appSrc) +
    extractFn(appSrc, 'delinkifyFencedWikilinks') + '\n' +
    extractFn(appSrc, 'collectFencedBasenames') + '\n' +
    extractFn(appSrc, 'reflectionBodyForDisplay');
  // eslint-disable-next-line no-new-func
  return new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
    src + '\nreturn reflectionBodyForDisplay;')(FENCED_ROSTER, rosterRoom(opts));
}
// 26.88-12 (Q4): cleanVaultMarkup MOVED INTO core.js and is required here
// directly. Do NOT re-lift it out of app.js source text — app.js no longer
// declares it, and the whole point of the move is that a node suite can now
// assert on what `marked` actually receives. Every assertion below is
// unchanged; only this loader is.
function loadCleanVault() {
  return require(path.join(__dirname, '..', 'core.js')).cleanVaultMarkup;
}
function loadClickAction() {
  // eslint-disable-next-line no-new-func
  return new Function(extractFn(appSrc, 'wikilinkClickAction') +
    '\nreturn wikilinkClickAction;')();
}

// A reflection referencing a raw Memoir entry the ## Related block links by
// BARE basename, plus a non-fenced sibling reflection.
const FULL = [
  '---',
  'reflects:',
  '  - Memoir/日记 26年7月14日.md',
  '---',
  '## What surfaced',
  '',
  'A boundary, held.',
  '',
  '## Related',
  '',
  '%% auto-links:start %%',
  '- [[日记 26年7月14日|July 14 entry]]',
  '- [[Kudos for Myself 2026-07-17]]',
  '%% auto-links:end %%'
].join('\n');
// 26.88-16 (F-5): this line used to carry its OWN copy of the frontmatter
// regex — a FIFTH in-repo spelling, found by executing the one-spelling scan
// rather than by reading the census, which had counted three. It calls the
// shipped split now.
const BODY = require(path.join(__dirname, '..', 'core.js'))
  .splitFrontmatter(FULL).body;
// production-shape resolver: the journal is NOT a judged-away library hit, so
// the seal for the OFF path comes from collectFencedBasenames alone.
function isFencedProd() { return false; }

// ---- 1 + 2: OFF de-links, ON leaves live ----------------------------------

(function () {
  const bodyForDisplay = loadBodyForDisplay();
  const clean = loadCleanVault();

  // OFF (default): the fenced Memoir door is de-linked; the sibling is live.
  const off = clean(bodyForDisplay(FULL, BODY, isFencedProd, false));
  assert.ok(off.indexOf('data-wiki="日记 26年7月14日"') === -1,
    '(1) toggle OFF: the fenced Memoir door is inert (no clickable anchor)');
  assert.ok(off.indexOf('July 14 entry') !== -1,
    '(1) toggle OFF: the de-linked door keeps its display text (verbatim)');
  assert.ok(off.indexOf('data-wiki="Kudos for Myself 2026-07-17"') !== -1,
    '(1) toggle OFF: a non-fenced link is still a live anchor (selective)');

  // ON (owner opts in): the SAME fenced door becomes a live wikilink.
  const on = clean(bodyForDisplay(FULL, BODY, isFencedProd, true));
  assert.ok(on.indexOf('data-wiki="日记 26年7月14日"') !== -1,
    '(2) toggle ON: the fenced Memoir door is a live anchor for the owner');
  assert.ok(on.indexOf('data-wiki="Kudos for Myself 2026-07-17"') !== -1,
    '(2) toggle ON: the non-fenced link stays a live anchor');
})();

// ---- 3: the click decision -------------------------------------------------

(function () {
  const action = loadClickAction();
  const plain = { state: 'blessed', trigger: false };
  const trig = { state: 'blessed', trigger: true };
  const never = { state: 'never_show' };
  const retired = { state: 'retired' };

  assert.strictEqual(action(plain, false), 'open',
    '(3) a non-fenced target opens normally regardless of the toggle');
  assert.strictEqual(action(plain, true), 'open',
    '(3) a non-fenced target opens normally with the toggle ON too');

  [trig, never, retired].forEach(function (it) {
    assert.strictEqual(action(it, false), 'inert',
      '(3) a fenced target with the toggle OFF is inert (shipped fence)');
    assert.strictEqual(action(it, true), 'open-verbatim',
      '(3) a fenced target with the toggle ON opens VERBATIM (owner action)');
  });
  assert.strictEqual(action(null, true), 'inert',
    '(3) nothing in the library is inert even with the toggle ON');
})();

// ---- 4: the cloud + surfacing paths never consult the display flag ---------

(function () {
  // the flag exists in app.js only.
  ['DISPLAY_FENCE_KEY', 'displayFenceOpen', 'setDisplayFenceOpen',
    'studyroom.displayFenceOpen'].forEach(function (token) {
    assert.ok(appSrc.indexOf(token) !== -1,
      '(4) "' + token + '" is defined in app.js');
    assert.ok(serverSrc.indexOf(token) === -1,
      '(4) the librarian/cloud path (server.py) never references "' +
      token + '"');
    assert.ok(libSrc.indexOf(token) === -1,
      '(4) the librarian/cloud path (study_lib.py) never references "' +
      token + '"');
  });

  // the surfacing builders never consult the display flag — the shelf and the
  // spines stay fully fenced regardless of the toggle.
  ['buildReflectionShelf', 'buildInsightBooks', 'renderReflectionSpines',
    'buildInsightShelfModel'].forEach(function (name) {
    if (appSrc.indexOf('function ' + name + '(') === -1) { return; }
    const body = extractFn(appSrc, name);
    ['displayFenceOpen', 'DISPLAY_FENCE_KEY', 'ownerOverride'].forEach(
      function (token) {
        assert.ok(body.indexOf(token) === -1,
          '(4) the surfacing builder ' + name + ' never consults "' +
          token + '"');
      });
  });
})();

// ---- 4b: DECORATIONS NEVER ENTER THE LIBRARIAN PAYLOAD (26.9-03) ----------
//
// T-26.9-13, severity CRITICAL, law 8. Group 4 above makes exactly this
// separation argument for the display flag; this is its analogue for the
// page editor's store, and it is modelled on group 4 deliberately rather
// than invented.
//
// WHAT IS BEING FENCED, said plainly. A decoration is PAGE CHROME SHE MADE.
// It is not content, it is not a note, it is not something the librarian
// has any business reading, and there is no scope under which sending it
// would be correct. build_librarian_payload is "the ONE byte source for the
// librarian's agent subprocess" (its own docstring) — so the fence is
// precisely: that function's reachable surface must never touch the
// decoration store.
//
// TWO ASSERTIONS, AND THEY ARE NOT EQUALLY STRONG. Said out loud because
// this phase's named defect class is a check that looks rigorous and
// measures less than it claims:
//
//   (a) THE LOAD-BEARING ONE — the payload builder never names the store's
//       IO trio or its module lock. Reading the store is the ONLY way a
//       decoration record can reach the payload at all, since the records
//       exist nowhere else in the Python process. Close this and the class
//       of leak is closed, not narrowed.
//
//   (b) THE WEAKER NET — the payload builder never names the decoration
//       vocabulary either. This catches a hand-rolled re-read (someone
//       opening decorations.json directly instead of calling the loader).
//
// WHAT NEITHER CAN SEE, STATED RATHER THAN GLOSSED: a decoration record's
// GEOMETRY fields are `x`, `y`, `a`, `s`, `page`, `kind`. Those are English
// words and generic identifiers; grepping a 5,700-line module for `x` would
// fire on everything and measure nothing. They are DELIBERATELY NOT in the
// token list. The fence here is the STORE, not the field names — which is
// why (a) is the assertion that carries the weight and (b) is labelled as
// the net it is.

(function () {
  // Region-scope a top-level Python def: from its `def name(` to the next
  // line that starts a new top-level definition (column 0). The brace
  // matcher used elsewhere in this file cannot work on Python; indentation
  // is the language's own bracket. A file-wide grep is REJECTED here — the
  // store IO legitimately lives in study_lib.py (that is where D-23 put
  // it), so only a region-scoped check can say anything true at all.
  function extractPyDef(src, name) {
    const sig = '\ndef ' + name + '(';
    const start = src.indexOf(sig);
    assert.notStrictEqual(start, -1,
      '(4b) ' + name + ' must be defined in study_lib.py');
    const rest = src.slice(start + 1);
    const next = rest.search(/\n(?=(def |class |@))/);
    return next === -1 ? rest : rest.slice(0, next);
  }

  const payload = extractPyDef(libSrc, 'build_librarian_payload');
  // sanity: the extraction actually captured the function, not a sliver.
  // Without this the whole group could pass on an empty string — the
  // degenerate that makes a negative grep meaningless.
  assert.ok(payload.length > 2000,
    '(4b) the extracted build_librarian_payload body must be substantial ' +
    '(' + payload.length + ' chars) — a negative grep over an empty or ' +
    'truncated region proves nothing at all');
  assert.ok(payload.indexOf('scope') !== -1 &&
    payload.indexOf('consent') !== -1,
    '(4b) the extracted region must be the real payload builder — it has ' +
    'to mention its own scope and consent parameters');

  // (a) THE LOAD-BEARING ASSERTION: the payload builder cannot reach the
  // decoration store. These are the only doors into it in the process.
  ['load_decorations', 'save_decorations', 'decorations_file_path',
    '_DECORATIONS_LOCK', 'validate_decorations'].forEach(function (token) {
    assert.strictEqual(payload.indexOf(token), -1,
      '(4b) build_librarian_payload must never reach the decoration ' +
      'store — it names "' + token + '". Decorations are page chrome she ' +
      'made; they are not content and must never leave the machine ' +
      'through the librarian path (law 8, T-26.9-13)');
  });

  // (b) the weaker net: no hand-rolled re-read of the file either.
  ['decorations.json', '"decorations"', "'decorations'", 'page-deco',
    'DECOR_KINDS', 'DECOR_SPRITES', 'DECOR_CAP'].forEach(function (token) {
    assert.strictEqual(payload.indexOf(token), -1,
      '(4b) build_librarian_payload must not name the decoration ' +
      'vocabulary either ("' + token + '") — this is the net that catches ' +
      'a hand-rolled read that bypasses the loader');
  });

  // The POSITIVE half — without it this whole group is satisfied by the
  // decoration store not existing. Group 4 makes the same pairing above,
  // and for the same reason: a negative assertion with no subject is the
  // purest form of this project's named defect class.
  assert.ok(libSrc.indexOf('def load_decorations(') !== -1 &&
    libSrc.indexOf('def save_decorations(') !== -1 &&
    libSrc.indexOf('def decorations_file_path(') !== -1,
    '(4b) the decoration store IO trio must EXIST in study_lib.py — ' +
    'otherwise the negative assertions above have no subject and this ' +
    'group passes by measuring nothing');
  assert.ok(serverSrc.indexOf('def validate_decorations(') !== -1 &&
    serverSrc.indexOf('_DECORATIONS_LOCK') !== -1,
    '(4b) the validator and its dedicated lock must EXIST in server.py');
  // NOTE ON WHAT IS *NOT* ASSERTED HERE. The client half
  // (loadDecorations / postDecorations in app.js) is deliberately NOT
  // pinned in this group, because it does not exist when this group first
  // ships — it lands one task later, in the same plan. Pinning it here
  // would make this suite RED at its own commit, and a gate that is red
  // for a scheduling reason teaches everyone to ignore red. The client
  // pin lives in tests/test_blessings_notebook.cjs, where its subject is.

  // D-23's location, asserted from the source of truth rather than trusted
  // from a comment. The path helper is the ONE place the location is
  // spelled, so this is the whole decision in one line.
  const pathFn = extractPyDef(libSrc, 'decorations_file_path');
  assert.ok(/Path\(library_root\)\s*\/\s*["']decorations\.json["']/
    .test(pathFn),
    '(4b) D-23: decorations.json is a SIBLING of librarian/ — the path ' +
    'helper must join it directly to the library root. Owner-decided ' +
    '2026-08-04: the root is the irreplaceable tier, librarian/ is the ' +
    'rebuildable one whose deletion is a documented factory reset');
  assert.strictEqual(pathFn.indexOf('"librarian"'), -1,
    '(4b) D-23: the decoration path helper must NOT name the librarian ' +
    'folder. rm -rf librarian/ is a supported operation and it must ' +
    'leave her decorating untouched');
})();

// ---- 5: linkified path-refs (26.5-05, D-05) --------------------------------

// Lift the linkifier with its pure decision fn; inject the roster and the
// escape helpers (the same free-var injection shape as loadBodyForDisplay).
function loadLinkify(opts) {
  // eslint-disable-next-line no-new-func
  return new Function('REFLECTION_FENCED_ROSTER', 'ROOM', 'escapeHtml',
    'escapeAttr',
    liftRoster(appSrc) +
    extractFn(appSrc, 'linkifyLibraryPaths') + '\n' +
    extractFn(appSrc, 'wikilinkClickAction') +
    '\nreturn linkifyLibraryPaths;')(FENCED_ROSTER, rosterRoom(opts),
    escapeHtml, escapeAttr);
}

(function () {
  const linkify = loadLinkify();

  const SAFE = 'Clippings/knowledge-learning/literature/白痴 notes.md';
  const SAFE2 = 'Clippings/personal-development/reading/slow mornings.md';
  const FENCED_PATH = 'Memoir/日记 26年7月14日.md';   // roster folder
  const JUDGED = 'Clippings/emotional-management/heavy one.md'; // never_show
  const GHOST = 'Clippings/style/never imported.md';  // resolves to nothing

  // production-shape resolver: full-path keyed for the fixture; the app
  // passes the shipped resolveWikilink family instead.
  const ITEMS = {};
  ITEMS[SAFE] = { state: 'blessed', trigger: false };
  ITEMS[SAFE2] = { state: 'blessed', trigger: false };
  ITEMS[FENCED_PATH] = { state: 'never_show' };
  ITEMS[JUDGED] = { state: 'never_show' };
  function resolver(p) { return ITEMS[p] || null; }

  // (5a) a SAFE code-span ref → exactly one quiet anchor: class pathref,
  // data-path-key carries the resolvable basename, text = the unmodified
  // path string.
  const safeIn = 'It sits beside `' + SAFE + '` on the shelf.';
  const safeOut = linkify(safeIn, resolver, false);
  assert.strictEqual((safeOut.match(/<a\b/g) || []).length, 1,
    '(5) a safe code-span ref emits exactly one anchor');
  assert.ok(safeOut.indexOf('class="pathref"') !== -1,
    '(5) the safe anchor carries the pathref class (the quiet-link style)');
  assert.ok(safeOut.indexOf('data-path-key="白痴 notes.md"') !== -1,
    '(5) the safe anchor carries the resolvable basename as data-path-key');
  assert.ok(safeOut.indexOf('>' + SAFE + '</a>') !== -1,
    '(5) the anchor text is the unmodified path string');

  // (5b) a FENCED-ROSTER ref with the toggle OFF → BYTE-IDENTICAL plain
  // text (zero anchors, zero classes, zero markup delta — Pitfall 6), and
  // the resolver is never even consulted for it (26.4-09 no-resolution).
  const asked = [];
  function spyResolver(p) { asked.push(p); return ITEMS[p] || null; }
  const fencedIn = 'and `' + FENCED_PATH + '` said it first.';
  const fencedOff = linkify(fencedIn, spyResolver, false);
  assert.strictEqual(fencedOff, fencedIn,
    '(5) toggle OFF: a fenced-roster ref is byte-identical plain text — ' +
    'no anchor, no class, no icon, no markup delta (Pitfall 6 / law 5)');
  assert.strictEqual(asked.length, 0,
    '(5) toggle OFF: a fenced-roster ref is never even resolved ' +
    '(the 26.4-09 no-resolution rule)');

  // (5b′) a NON-roster ref that resolves to a judged-away item (never_show)
  // with the toggle OFF → byte-identical plain too (wikilinkClickAction
  // says inert — the same pure decision the shipped wikilinks use).
  const judgedIn = 'kept but `' + JUDGED + '` never shows.';
  assert.strictEqual(linkify(judgedIn, resolver, false), judgedIn,
    '(5) toggle OFF: a judged-away target renders byte-identical plain ' +
    'text (inert through the shipped click decision)');

  // (5c) FENCED + toggle ON → follows the shipped open-verbatim wikilink
  // behavior (group 3): the ref becomes a live anchor the OWNER can click.
  const fencedOn = linkify(fencedIn, resolver, true);
  assert.ok(fencedOn.indexOf('class="pathref"') !== -1 &&
    fencedOn.indexOf('data-path-key="日记 26年7月14日.md"') !== -1,
    '(5) toggle ON: a fenced door is a live pathref anchor for the owner');
  const judgedOn = linkify(judgedIn, resolver, true);
  assert.ok(judgedOn.indexOf('class="pathref"') !== -1,
    '(5) toggle ON: a judged-away target is a live anchor too ' +
    '(open-verbatim, the group-3 decision)');

  // (5d) unresolvable, or a resolver that throws → plain text, fail-closed
  // (matching delinkifyFencedWikilinks' throw treatment).
  const ghostIn = 'once saved as `' + GHOST + '` maybe.';
  assert.strictEqual(linkify(ghostIn, resolver, false), ghostIn,
    '(5) a path resolving to nothing stays byte-identical plain text');
  function throwing() { throw new Error('lookup exploded'); }
  assert.strictEqual(linkify(safeIn, throwing, false), safeIn,
    '(5) a throwing resolver renders plain text (fail-closed)');
  assert.strictEqual(linkify(safeIn, throwing, true), safeIn,
    '(5) a throwing resolver is fail-closed with the toggle ON too');

  // (5e) the Returns-list shape: a bare `- Folder/….md` line linkifies when
  // safe and stays byte-identical when fenced — in the same body.
  const listIn = [
    'Returns worth making:',
    '',
    '- ' + SAFE2,
    '- ' + FENCED_PATH,
    ''
  ].join('\n');
  const listOut = linkify(listIn, resolver, false);
  assert.strictEqual((listOut.match(/<a\b/g) || []).length, 1,
    '(5) a safe Returns-list path linkifies; the fenced one does not');
  assert.ok(listOut.indexOf('data-path-key="slow mornings.md"') !== -1,
    '(5) the list anchor carries the resolvable basename');
  assert.ok(listOut.indexOf('- ' + FENCED_PATH) !== -1,
    '(5) the fenced list line is byte-identical plain text in place');
  // non-list lines and prose are untouched
  assert.ok(listOut.indexOf('Returns worth making:') !== -1,
    '(5) surrounding prose is untouched');
})();

// ---- 5f: resolvable in-library wikilinks OPEN (26.5-09 UAT F2) -------------
//
// The regression: on the diegetic path SHELF.items sat EMPTY (only
// enterShelf hydrated it), so a safe Related link in a reflection resolved
// to null and fell to the inert branch — a dead door to her own library.
// Pin the composed pure decision: given the FULL item index, the shipped
// resolveWikilink (title fold, .md trimmed) finds the item and the SAME
// wikilinkClickAction says OPEN; a judged-away sibling still resolves but
// stays INERT (the second belt, untouched); an empty index — the exact
// regression shape — resolves nothing. Plus the wiring pin: the reflection
// loaders hydrate the index (hydrateWikilinkIndex) before any spread.

function loadResolve(items) {
  // eslint-disable-next-line no-new-func
  return new Function('SHELF',
    extractFn(appSrc, 'resolveWikilink') +
    '\nreturn resolveWikilink;')({ items: items });
}

(function () {
  const action = loadClickAction();
  const ITEMS = {
    a8e420832ea05b2a: {
      title: 'The Boundary Has a Name Now 2026-07-15.md',
      state: 'blessed', trigger: false
    },
    ffff000011112222: { title: 'Heavy Thing.md', state: 'never_show' }
  };
  const resolve = loadResolve(ITEMS);

  // the exact UAT repro shape: the data-wiki key is the title sans .md.
  const id = resolve('The Boundary Has a Name Now 2026-07-15');
  assert.strictEqual(id, 'a8e420832ea05b2a',
    '(5f) a safe in-library wikilink resolves through the title fold');
  assert.strictEqual(action(ITEMS[id], false), 'open',
    '(5f) and the SAME pure click decision OPENS it (toggle irrelevant)');

  // the fenced-inert belt is untouched: a judged-away target resolves
  // but stays inert with the toggle OFF.
  const fid = resolve('Heavy Thing');
  assert.strictEqual(action(ITEMS[fid], false), 'inert',
    '(5f) a judged-away target still resolves to INERT (second belt)');

  // the regression shape itself: an EMPTY index resolves nothing — which
  // is why the loaders below must hydrate it before any spread renders.
  assert.strictEqual(loadResolve({})(
    'The Boundary Has a Name Now 2026-07-15'), null,
    '(5f) an empty index resolves nothing — the diegetic-path regression');

  // wiring: both reflection loaders hydrate the resolver index from the
  // full /api/items map they already hold.
  assert.ok(appSrc.indexOf('function hydrateWikilinkIndex(') !== -1,
    '(5f) hydrateWikilinkIndex is defined in app.js');
  ['loadReflectionShelf', 'renderShelfStation'].forEach(function (name) {
    assert.ok(extractFn(appSrc, name)
      .indexOf('hydrateWikilinkIndex(') !== -1,
      '(5f) ' + name + ' hydrates the wikilink index before any ' +
      'reflection spread can render (26.5-09 F2)');
  });
})();

// ===========================================================================
// ---- (6) 26.91-08 — THE TWO FENCE LAYERS STAY TWO LAYERS ------------------
//
// The trace-scoped never-name list is a PRODUCT POLICY on top of the law-5
// guard. The owner answered UI-SPEC Open Decision #1 `trace-scoped` on
// 2026-08-07, and the alternative — writing `processed jd` into the GLOBAL
// `fenced_roster` via `POST /api/librarian/roster` — was NOT taken.
//
// ⚠ EVERY SCAN BELOW RUNS OVER COMMENT-STRIPPED SOURCE, and that is
// load-bearing rather than stylistic: the `TRACE_NEVER_NAME` site comment
// explains at length WHY the global route was not used, and names the route
// to do it. A raw grep would be matching the fix's own explanation of itself
// and would report a call site that does not exist.
(function twoLayersStayTwo() {
  function strip(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(function (l) {
        return /^\s*\/\//.test(l) ? '' : l;
      }).join('\n');
  }
  const cleanApp = strip(appSrc);

  // (a) THIS PLAN ADDED NO CALL SITE. The two that exist are the shipped
  //     import-screen wiring (add / remove), measured on the pre-plan tree
  //     at exactly 2 and pinned here BY VALUE — a `<= n` bound would survive
  //     a third being added.
  const routeHits = cleanApp.match(/api\/librarian\/roster/g) || [];
  assert.strictEqual(routeHits.length, 2,
    '(6) `api/librarian/roster` appears EXACTLY TWICE in comment-stripped ' +
    'app.js — the pre-existing import-screen add/remove wiring, measured ' +
    'at 2 on the pre-plan tree. 26.91-08 adds NO call site: the never-name ' +
    'list is trace-scoped, and the global route is never called from the ' +
    'client, from a test, or once. A THIRD occurrence means someone wired ' +
    'a product preference into the route whose `add` mutates her live ' +
    'library');

  // (b) THE TWO LAYERS ARE SEPARATE. The never-name list must not be
  //     reachable from the guard, and the guard must not consult it —
  //     collapsing them would put a product preference on the same footing
  //     as a P0 fence.
  const coreSrc = strip(fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8'));
  assert.strictEqual(coreSrc.indexOf('TRACE_NEVER_NAME'), -1,
    '(6) the never-name list does NOT appear in core.js. `guardSurface` is ' +
    'the law-5 P0 fence and decides FIRST and silently; it must never ' +
    'consult a product preference');
  assert.strictEqual(coreSrc.indexOf('fenced_roster'), -1,
    '(6) ...and `fenced_roster` does not reach the client fence either. ' +
    'guardSurface reads state / trigger / filters ONLY — which is WHY the ' +
    'global-roster mechanism would have been INERT on the trace, and is ' +
    'the measured reason the owner\'s answer was implemented trace-scoped');

  // (c) THE GUARD STILL DECIDES FIRST INSIDE THE PACKER. Source ORDER is
  //     not evaluation order in general, but here the two are the same
  //     statement sequence in one loop body, and the DRIVEN proof lives in
  //     test_blessings_notebook.cjs (G-B2). This pins the ORDER so a later
  //     edit cannot move the librarian filter above the fence.
  const packer = strip(extractFn(appSrc, 'packArrivalDays'));
  const guardAt = packer.indexOf("typeof guard !== 'function'");
  const libAt = packer.indexOf("=== 'librarian'");
  assert.notStrictEqual(guardAt, -1,
    '(6) packArrivalDays still opens its rejection test with the ' +
    'fail-closed `typeof guard !== \'function\'` disjunct');
  assert.notStrictEqual(libAt, -1,
    '(6) ...and still carries the librarian-arrival exclusion');
  assert.ok(guardAt < libAt,
    '(6) ...and THE FENCE COMES FIRST. The librarian filter is a product ' +
    'rule and runs AFTER the guard, never instead of it');
})();

// ===========================================================================
// ---- (7) 26.93-11 — THE COST LINE IS QUIET, AND THIS GATE HAS BEEN RED ----
//
// WHAT IS BEING PINNED. Both librarian cost readouts — the live one during a
// run (renderLibrarianProgress) and the standing one under Manage's last-sort
// record (renderLibrarianRunState) — used to print a dollar figure built from
// a `cost_usd` field and then BRANCH on an `auth` field: one sentence for an
// api-key room, another for a subscription room. After 26.93-06 the seam
// returns the provider's own token counts and no price at all, and after
// 26.93-07 there is no `auth` field either, because `detect_librarian_auth` is
// deleted. A branch on a field that stops arriving reads `undefined`, takes
// the included-in-your-plan arm EVERY time, and tells her that a room which
// may be billing her key is free (T-26.93-33). The owner's recorded ruling on
// what stands in its place is `quiet-until-34`: nothing does, until map ticket
// #34 decides how spend is measured and shown.
//
// WHY A DRILL AND NOT A GREP. A grep that returns zero passes just as happily
// when the file is empty, when the function was renamed, and when the check
// itself was quietly broken. Roughly thirty defects of this project's class
// have landed INSIDE the measuring instrument rather than in the code under
// test. So the claim is expressed as a FUNCTION over source text that returns
// a list of violations; it is fed the real source (empty list expected) and
// then four MUTATED COPIES OF THAT TEXT, each asserted to come back naming the
// violation it re-introduced. A gate never seen red is not evidence.
//
// ⚠ EVERY MUTATION IS A STRING IN MEMORY. Nothing here writes app.js, writes
// any file, arms an interceptor, or touches a page she may be using. The only
// filesystem call in this whole file is the readFileSync at the top.
//
// ⚠ ONE CONTROL IS DELIBERATELY A NON-DETECTION: a currency format injected
// into a NEIGHBOURING function (librarianEtaLine) must NOT be reported. A
// file-wide grep would fail that control, which is precisely the point — the
// claim is about these two renders, and a check that cannot tell the
// difference is not measuring the claim it prints.

(function costLineDrill() {
  // ---- the claim, as a function over source text ----
  const RULES = [
    { name: 'reads the auth path', re: /\.\s*auth\b/ },
    { name: 'formats a currency value', re: /toFixed\s*\(/ },
    { name: 'carries a dollar-sign literal', re: /['"]\s*\$/ },
    { name: 'reads a price the seam no longer sends', re: /cost_usd/ },
    {
      name: 'claims usage is included in a plan',
      re: /included usage|charges you money|api-key/
    }
  ];
  const RENDERS = ['renderLibrarianProgress', 'renderLibrarianRunState'];

  function costSurfaceViolations(src) {
    const out = [];
    RENDERS.forEach(function (name) {
      let body;
      try {
        body = extractFn(src, name);
      } catch (e) {
        out.push(name + ': not present in the source at all');
        return;
      }
      // the degenerate guard, inline: a negative scan over an empty or
      // truncated region proves nothing, so say so as a violation rather
      // than pass quietly.
      if (body.length < 150) {
        out.push(name + ': the lifted body is too small to measure (' +
          body.length + ' chars)');
      }
      RULES.forEach(function (rule) {
        if (rule.re.test(body)) { out.push(name + ': ' + rule.name); }
      });
    });
    return out;
  }

  // ---- mutation plumbing: pure string surgery, never a file write ----
  function injectAtTopOf(src, fnName, snippet) {
    const at = src.indexOf('function ' + fnName + '(');
    assert.notStrictEqual(at, -1,
      '(7) the drill needs ' + fnName + ' to exist before it can mutate it');
    const brace = src.indexOf('{', at);
    assert.notStrictEqual(brace, -1,
      '(7) ' + fnName + ' must have a body for the mutation to land in');
    return src.slice(0, brace + 1) + '\n' + snippet + src.slice(brace + 1);
  }

  const MUTATIONS = [
    {
      name: 'restore the auth branch in the live readout',
      fn: 'renderLibrarianProgress',
      snippet: "    var costLine = snap.auth === 'api-key' ? 'a' : 'b';",
      expect: /renderLibrarianProgress: reads the auth path/
    },
    {
      name: 'restore the auth branch in the last-sort line',
      fn: 'renderLibrarianRunState',
      snippet: "    var costLine = run.auth === 'api-key' ? 'a' : 'b';",
      expect: /renderLibrarianRunState: reads the auth path/
    },
    {
      name: 'restore the dollar render',
      fn: 'renderLibrarianProgress',
      snippet:
        "    var amount = '$' + Number(snap.cost_usd || 0).toFixed(2);",
      expect: /renderLibrarianProgress: formats a currency value/
    },
    {
      name: 'restore the subscription sentence',
      fn: 'renderLibrarianRunState',
      snippet: "    var claim = ' of included usage — this never charges" +
        " you money';",
      expect: /renderLibrarianRunState: claims usage is included in a plan/
    }
  ];

  // ---- the runner: every case runs, a catch NEVER ends the loop ----
  let ran = 0;
  let caught = 0;
  let controlsGreen = 0;
  const failures = [];

  function runCase(label, thunk) {
    ran++;
    try {
      thunk();
    } catch (e) {
      // deliberately swallowed HERE and re-raised as a counted total
      // below: a harness that stops at the first catch reports one
      // failure where there may be four.
      failures.push(label + ' -> ' + e.message);
    }
  }

  // CONTROL 1 — the real source is clean.
  runCase('control: the shipped source', function () {
    const live = costSurfaceViolations(appSrc);
    assert.deepStrictEqual(live, [],
      '(7) neither render may branch on the auth path or format a ' +
      'currency value. Found: ' + live.join(' | '));
    controlsGreen++;
  });

  // CONTROL 2 — the checker has a real subject. Without this the group
  // is satisfied by the two functions not existing.
  runCase('control: the subject exists', function () {
    const prog = extractFn(appSrc, 'renderLibrarianProgress');
    const runState = extractFn(appSrc, 'renderLibrarianRunState');
    assert.ok(prog.length > 150 && runState.length > 150,
      '(7) both render bodies must be substantial (' + prog.length +
      ' / ' + runState.length + ' chars) — a negative scan over a sliver ' +
      'measures nothing');
    assert.ok(prog.indexOf('sorting — batch ') !== -1,
      '(7) the lifted live readout is the real one (it still says the ' +
      'batch fraction, which the ruling left untouched)');
    assert.ok(runState.indexOf('last sort: titles and dates only.') !== -1,
      '(7) the lifted last-sort line is the real one (it still carries ' +
      'the consent fact, which the ruling left untouched)');
    controlsGreen++;
  });

  // CONTROL 3 — the check is SCOPED. A currency format in a neighbouring
  // function is not this claim's business, and a file-wide grep would
  // report it.
  runCase('control: a neighbour is out of scope', function () {
    const neighbour = injectAtTopOf(appSrc, 'librarianEtaLine',
      "    var stray = '$' + Number(0).toFixed(2);");
    assert.deepStrictEqual(costSurfaceViolations(neighbour), [],
      '(7) the check is scoped to the two renders — a dollar format in ' +
      'librarianEtaLine is not what this gate claims to measure');
    controlsGreen++;
  });

  // THE MUTATIONS — each one is the exact regression this plan removed.
  MUTATIONS.forEach(function (m) {
    runCase('mutation: ' + m.name, function () {
      const mutated = injectAtTopOf(appSrc, m.fn, m.snippet);
      assert.notStrictEqual(mutated, appSrc,
        '(7) the mutation must actually change the source text');
      const found = costSurfaceViolations(mutated).join(' | ');
      assert.ok(found.length > 0,
        '(7) MUTATION NOT CAUGHT (' + m.name + ') — the check returned an ' +
        'empty list on a source that re-introduces the defect');
      assert.ok(m.expect.test(found),
        '(7) the mutation was caught but named wrongly (' + m.name +
        '). Expected ' + m.expect + ', got: ' + found);
      caught++;
    });
  });

  // ---- counts printed as integers, then asserted BY VALUE ----
  console.log('CASES ' + ran);
  console.log('DRILL ' + caught + '/' + MUTATIONS.length +
    ' mutations caught, ' + controlsGreen + ' controls green');

  assert.strictEqual(failures.length, 0,
    '(7) drill failures: ' + failures.join(' ;; '));
  assert.strictEqual(MUTATIONS.length, 4,
    '(7) the drill carries FOUR mutations — a fifth or a fourth removed ' +
    'must be a conscious edit of this literal');
  assert.strictEqual(caught, 4,
    '(7) all four mutations must be caught');
  assert.strictEqual(controlsGreen, 3,
    '(7) all three controls must be green in the same run');
  assert.strictEqual(ran, 7,
    '(7) CASES: three controls plus four mutations ran — a skipped case ' +
    'cannot hide behind a passing total');
})();

// ---- 8: a roster entry may name a NESTED folder ---------------------------
//
// ⚠ THE HALF THAT WOULD HAVE STAYED OPEN. When the owner asked (2026-08-14)
// for one folder INSIDE another to be private, fixing only the server would
// have fenced the notes while leaving every wikilink that points into that
// folder LIVE on the reflection surface — the one failure this file's own
// header calls a live door that does not heal itself. The client matcher
// used to see only the target's FIRST segment, so it could not tell
// `Clippings/journal/chatgpt` from `Clippings/recipes`.
//
// Asserted on the de-linkifier itself rather than through the whole display
// pipeline: what is under test is the ROSTER'S VERDICT, and a renderer in
// the way would only add ways for this to go green for the wrong reason.

(function () {
  function loadDelinkify(stored) {
    const src = liftRoster(appSrc) +
      extractFn(appSrc, 'delinkifyFencedWikilinks');
    // eslint-disable-next-line no-new-func
    return new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
      src + '\nreturn delinkifyFencedWikilinks;')(
        FENCED_ROSTER, rosterRoom({ stored: stored }));
  }
  const never = function () { return false; };

  const nested = loadDelinkify(['Clippings/journal/chatgpt']);
  const out = nested(
    '- [[Clippings/journal/chatgpt/2024-11-02 — hard day|that evening]]\n' +
    '- [[Clippings/recipes/congee|congee]]\n' +
    '- [[Clippings/journalism/press ethics|press ethics]]', never);

  assert.ok(out.indexOf('[[Clippings/journal/chatgpt/') === -1,
    '(8) a link pointing INTO the nested private folder is de-linkified');
  assert.ok(out.indexOf('that evening') !== -1,
    '(8) and it keeps its words, verbatim (law 4)');
  assert.ok(out.indexOf('[[Clippings/recipes/congee|congee]]') !== -1,
    '(8) a sibling folder under the same parent stays live — the fence ' +
    'covers what she named, not its whole parent');
  assert.ok(out.indexOf('[[Clippings/journalism/press ethics') !== -1,
    '(8) ⚠ `Clippings/journal` and `Clippings/journalism` are two different ' +
    'places: whole segments, never a string prefix');

  // the shipped top-level entries still behave exactly as they did
  const top = loadDelinkify(['Memoir']);
  assert.ok(top('- [[Memoir/2026/jan|jan]]', never).indexOf('[[') === -1,
    '(8) a top-level entry still fences everything beneath it');
  assert.ok(top('- [[Memoirs of a Cat|cat]]', never).indexOf('[[') !== -1,
    '(8) and still does not catch a DIFFERENT folder that merely starts ' +
    'with the same letters');

  // fail-closed is unchanged: no snapshot yet -> any foldered ref is fenced
  const unknown = new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
    liftRoster(appSrc) + extractFn(appSrc, 'delinkifyFencedWikilinks') +
    '\nreturn delinkifyFencedWikilinks;')(FENCED_ROSTER,
                                          rosterRoom({ noMeta: true }));
  assert.ok(unknown('- [[anything/at all|x]]', never).indexOf('[[') === -1,
    '(8) an unknown roster still fences every foldered reference');
})();

// ===========================================================================
// ---- (9) 26.95-31 — THE OFFER'S ANSWER ROW, AND THE ONE SURFACE THE -------
//         NOT-RELEVANT RECORD DELIBERATELY DOES NOT REACH
//
// G-3    the answer row is exactly FOUR answers: two `.btn` controls, one
//        quiet link, and NO control for silence. It sheds `not now`, `skip`
//        and `that's enough for today`, and it carries no position counter —
//        under the one-page shape there is no position to count.
// G-3b   renderBlessingRibbon is untouched and still renders all FIVE for its
//        own callers (the desk pass, the album pass, the guided pass). A
//        file-wide negative grep would be unsatisfiable against correct code,
//        which is why every scan below is region-scoped.
// G-3d   nothing follows `not relevant` but one quiet beat: no timer call, no
//        second control, and no way back offered on that path. Nothing in
//        this room is on a clock (OD-3, ruled by the owner 2026-08-14).
// D-13   the guided first pass is NOT screened against the record, and the
//        glossary says exactly why: such an item *"stays `unseen`, stays in
//        Manage, stays findable"*. Screening her own deliberate walk through
//        her own pile would hide her own material from her — the opposite of
//        what the answer means. This case exists so that the omission reads
//        as a decision and cannot be "fixed" later by accident.
//
// ⚠ EVERY SCAN BELOW READS COMMENTS ON PURPOSE. That is not an oversight and
// it is not laziness: the orchestrator's acceptance sweep runs the SAME
// unstripped regions, so this suite and that sweep agree by construction. A
// comment-stripped scan here would go green on a comment the sweep fails,
// which is the same class of defect as a gate that cannot go red. The
// consequence is carried on the OTHER side: the app.js comments in these
// regions are written in prose, without spelling the identifiers, and each
// one says so. ⚠ The case comments in THIS file may quote them freely —
// nothing greps this file.

(function offerAnswerRow() {
  let ran = 0;
  const failures = [];
  /* ⚠⚠ 26.95-46: THE ROSTER, ADDED BECAUSE THE COUNT'S OWN MESSAGE WAS
     CLAIMING SOMETHING THE COUNT COULD NOT DELIVER. The total below has always
     said "a renamed one cannot hide behind a count alone" — and a rename was
     driven, and it hid. `ran` is incremented per call, so renaming a case
     leaves the total at ten and the suite green while the case that was
     specified stops existing. Found by driving the registry row rather than by
     reading it (the plant is the mutation register's own T9).
     The shape is not invented here: `tests/test_offer_render.cjs` already pins
     its cases BY NAME AND ORDER beside its count, for this exact reason, and
     this is that shape ported one suite across. */
  const ranNames = [];
  const CASE_ROSTER = [
    'g3-row-shape',
    'g3-shed',
    'g3-no-fourth-size',
    'g3b-ribbon-keeps-its-five',
    'g3d-nothing-on-a-clock',
    'g3e-set-aside-holds-and-offers-a-way-back',
    'f1-the-door-says-what-it-is',
    'f1-manage-points-home-without-a-door',
    'save-failure-is-loud',
    'guided-pass-stays-unscreened',
    'record-reaches-every-proposal-surface',
    'heavy-naming-seam-126',
    'heavy-naming-filled-warning',
    'heavy-five-doors-from-code',
    'heavy-guided-pass-untouched',
    'heavy-import-proposal-not-forever',
    'heavy-group-shot-once-three',
    'heavy-group-shot-filled-prompt',
    'heavy-group-shot-no-name-field',
    'heavy-group-shot-no-clock',
    'for-now-forever-manage-labels',
    'aside-desk-sentence-filled',
    'aside-desk-local-no-markdown',
    'aside-desk-quiet-not-sent-file'
  ];

  function runCase(label, thunk) {
    ran++;
    ranNames.push(label);
    try {
      thunk();
    } catch (e) {
      // swallowed here and re-raised as a counted total below: a harness
      // that stops at the first catch reports one failure where there may
      // be eight.
      failures.push(label + ' -> ' + e.message);
    }
  }

  // Lift a region AND prove it is a real one before anything negative is
  // asserted over it. A negative scan over an empty string, a sliver, or a
  // region that begins somewhere other than its own declaration is the
  // purest form of this project's named defect class.
  function region(name) {
    const body = extractFn(appSrc, name);
    const lines = body.split('\n').length;
    assert.ok(body.length > 120 && lines > 3,
      '(9) the lifted ' + name + ' region must be substantial (' +
      body.length + ' chars, ' + lines + ' lines) — a negative scan over ' +
      'a sliver proves nothing at all');
    assert.strictEqual(body.indexOf('function ' + name + '('), 0,
      '(9) the lifted region must BEGIN at ' + name + "'s own declaration; " +
      'it begins "' + body.slice(0, 24) + '"');
    return body;
  }

  function hits(src, re) { return (src.match(re) || []).length; }

  // ---- G-3: the row is four answers, one of which has no control ---------
  runCase('g3-row-shape', function () {
    const row = region('renderOfferAnswerRow');
    // counted as MATCHES, never as lines: the shipped style emits more than
    // one control per source line, and grep -c would pass correct code for
    // the wrong reason.
    assert.strictEqual(hits(row, /<button/g), 3,
      '(9) G-3: three buttons in the innerHTML build — bless, never, notrel');
    assert.ok(row.indexOf('wireHeavyQuietLink') !== -1,
      '(9) G-3: the fourth control is the quiet heavy link, appended by the ' +
      'one shared builder (#118)');
    assert.strictEqual(hits(row, /type="button"/g), 3,
      '(9) G-3: every one of the four is a real <button type="button"> — ' +
      'no inline handler, no delegation, natural tab order');
    assert.strictEqual(hits(row, /class="btn\b/g), 2,
      '(9) G-3: exactly TWO of the four are in the .btn register; the ' +
      'other two are quiet links');
    assert.strictEqual(hits(row, /class="offer-notrel"/g), 1,
      '(9) G-3: one quiet link is the not-relevant one');
    assert.strictEqual(hits(row, /wireHeavyQuietLink/g), 1,
      '(9) G-3: the heavy link is wired through the one shared builder');
    assert.ok(row.indexOf('text-decoration:underline') !== -1 &&
      row.indexOf('color:var(--ink-soft)') !== -1,
      '(9) G-3: the quiet link uses the SHIPPED quiet-link recipe verbatim ' +
      '(--ink-soft, underlined, font:inherit), not a new register');
    assert.strictEqual(hits(row, /OFFER_COPY\./g), 3,
      '(9) G-3: exactly THREE front-facing OFFER_COPY strings reach this row, ' +
      'one per bless/never/notrel control — heavy rides HEAVY_COPY');
    assert.ok(row.indexOf('offer-answer-note') !== -1,
      '(9) G-3: the note slot survives — it is where the quiet beat lands ' +
      'and where a failed save reports');
  });

  // ---- G-3: the shed controls, and the counter that disappeared ----------
  runCase('g3-shed', function () {
    const row = region('renderOfferAnswerRow');
    ['notnow', 'not now', 'skip', "that's enough for today",
      'ribbon-bless', 'blessing-ribbon-progress'].forEach(function (token) {
      assert.strictEqual(row.indexOf(token), -1,
        '(9) G-3: the Offer\'s answer row must not name "' + token + '". ' +
        'D-13 forbids a not-now control and the amendment did not touch ' +
        'that clause; skip and enough-for-today are PASS-level controls and ' +
        'an Offer is not a pass; and under the one-page shape (OD-1) there ' +
        'is no position to count');
    });
  });

  // ---- three sizes, and this phase adds none ------------------------------
  runCase('g3-no-fourth-size', function () {
    const row = region('renderOfferAnswerRow');
    assert.strictEqual(hits(row, /font-size/g), 0,
      '(9) nothing in this phase may set a font-size on a control: the ' +
      'shipped cascade already resolves these at 16px/1.5 (body line-height ' +
      '1.5, no body font-size, .btn font:inherit), and a size here would be ' +
      'a FOURTH size in a three-size contract');
  });

  // ---- G-3b: the shipped ribbon is untouched ------------------------------
  runCase('g3b-ribbon-keeps-its-five', function () {
    const ribbon = region('renderBlessingRibbon');
    assert.strictEqual(hits(ribbon, /type="button"/g), 5,
      '(9) G-3b: renderBlessingRibbon still builds FIVE controls for its own ' +
      'callers. The Offer got a NEW renderer precisely so this one could ' +
      'stay byte-identical (F-3, A4)');
    ['btn-ribbon-bless-safe', 'btn-ribbon-bless-never',
      'btn-ribbon-bless-notnow', 'btn-ribbon-bless-skip',
      'btn-ribbon-bless-enough', 'blessing-ribbon-progress'
    ].forEach(function (token) {
      assert.notStrictEqual(ribbon.indexOf(token), -1,
        '(9) G-3b: the shipped ribbon still carries "' + token + '"');
    });
    assert.strictEqual(ribbon.indexOf('offer-notrel'), -1,
      '(9) G-3b: ...and the Offer\'s quiet link never leaks into it. The ' +
      'not-relevant answer belongs to the Offer, not to the unjudged pile');
  });

  // ---- G-3d: nothing in this room is on a clock --------------------------
  runCase('g3d-nothing-on-a-clock', function () {
    const post = region('postNotRelevant');
    /* ⚖️ AMENDED BY THE OWNER, 2026-08-17/18. Her words at the beat-4 verdict:
       "it reads as a button someone forgot to build and now I feel it is
       necessary to build a undo button for not revelent", confirmed the next
       day: "yes we need to undo button for this".

       ⛔ THIS MOVES ONE HALF OF OD-3 AND NOT THE OTHER, and the distinction is
       hers rather than a convenience. What she refused on 2026-08-14 was an
       undo on a TIMER — the reason recorded is "nothing in this room is on a
       clock" — and a button is not a clock. So the timer ban below is UNMOVED
       and is still absolute; only the word `undo` leaves the banned set,
       because the thing it names is now something she asked for.

       ⚠ AND THE HANDBOOK MOVED FIRST. The LIBRARIAN.md paragraph that said
       "there is no button anywhere that takes the answer back, and that is on
       purpose" was hers and approved hours earlier; the build was gated on her
       replacement, she wrote it, and it shipped in the same commit. A gate
       amended while the sentence it protects stays false would be this
       project's own named failure — a shipped sentence that rotted. */
    assert.strictEqual(
      hits(post, /setTimeout|setInterval|requestAnimationFrame/g), 0,
      '(9) G-3d (OD-3, hers, UNMOVED): no timer and no countdown may follow ' +
      '`not relevant`. An undo with a deadline attached is exactly what she ' +
      'refused on 2026-08-14, and it is what a way back must never become — ' +
      'law 1\'s whole posture is that nothing here is urgent');
    /* ⚖️ THIS HALF WAS AMENDED BY THE OWNER, 2026-08-16 (UAT F-2), AND THE
       OTHER HALF ABOVE WAS NOT. It read `hits(post, /<button/g) === 0` — no
       second control at all — which was right while the Offer showed three
       pictures at once: the answered row went quiet and the page stayed, so
       the line could be read at leisure. Under one picture per window every
       other answer brings the next picture straight away, which would have
       made this line the one thing in the Offer nobody could ever read — and
       it is where C-7's reassurance lives (the librarian stops suggesting
       it; it stays in her album). She ruled the beat HOLDS and gets one
       quiet way on.

       ⛔ THE COUNT IS REPLACED BY AN IDENTITY, WHICH IS STRICTLY STRONGER.
       A count of zero could only ever say "nothing"; a count of one would
       pass for an undo, a dismissal, or a countdown's cancel button. So the
       one control is pinned by WHAT IT IS: the way-on class, wired to the
       one advance funnel, releasing the hold and doing nothing else.
       ⛔ AND THE TIMER HALF ABOVE IS UNTOUCHED — it is the clause OD-3 was
       actually taken for, and this amendment does not reach it. */
    assert.strictEqual(hits(post, /<button/g), 2,
      '(9) G-3d as amended twice (F-2 then her undo ruling): EXACTLY TWO ' +
      'controls follow `not relevant` — the way back and the way on. Zero ' +
      'would leave the line unreadable under one picture per window; one ' +
      'would drop whichever of the two she has ruled for; three would be a ' +
      'second answer on a picture already answered');
    assert.ok(post.indexOf('offer-goon') !== -1,
      '(9) G-3d: ...and the way on is there BY CLASS. A count of two could ' +
      'pass for an undo beside a second verdict; the identity cannot');
    assert.ok(post.indexOf('offer-notrel-undo') !== -1,
      '(9) G-3d: ...and so is the way back she ruled for. ⛔ Its absence is ' +
      'not a tidier room — it is the room telling her, in a paragraph she ' +
      'rewrote herself, that she can take this back, and then not letting her');
    assert.ok(post.indexOf('REACH.heldId = null') !== -1 &&
      post.indexOf('reachAfterAnswer()') !== -1,
      '(9) G-3d: ...which releases the beat and hands to the ONE place that ' +
      'decides what follows an answer — never its own advance, never its ' +
      'own close');
    ['revert', 'restore', 'cancel', 'take it back', 'bring it back',
      'dismiss'].forEach(function (word) {
      assert.strictEqual(post.toLowerCase().indexOf(word), -1,
        '(9) G-3d: the way on must not read as taking the answer back — ' +
        'this path must not name "' + word + '". The reversal is a plain ' +
        'file she can open and delete, said in LIBRARIAN.md, never a button');
    });
    assert.strictEqual(hits(post, /font-size:14px/g), 1,
      '(9) OD-3: the acknowledgement lands in the shipped 14px meta-line ' +
      'register, exactly once');
    assert.ok(post.indexOf('var(--ink-soft)') !== -1,
      '(9) OD-3: ...and in the quiet ink, never the accent — an offer that ' +
      'answers back in coral reads as an alert');
    assert.ok(post.indexOf('escapeHtml(') !== -1,
      '(9) every rendered string on this path passes through escapeHtml');
    // D-14: it is a librarian memory, never an item state. No sixth state.
    ['/api/state', 'applyTransition', 'never_show', 'unseen']
      .forEach(function (token) {
        assert.strictEqual(post.indexOf(token), -1,
          '(9) D-14: `not relevant` changes NO item state and creates no ' +
          'sixth one — this path must not name "' + token + '". The ' +
          'photograph stays unseen, stays in Manage, stays findable');
      });
  });

  /* ---- F-1: the two signposts, and what neither may become --------------
     UAT finding F-1, her words: «lack of the guideance for users, it is hard
     to know I need to press the stack of paper in order to find bless of
     photos». She ruled BOTH — the desk stack says what it is, and Manage
     points back to the room. */
  // ---- G-3e: the set-aside beat holds, and its way back is not a clock -----
  //
  // 26.95-57, UAT session 2 F-16. ⚠ THIS IS A NEW GUARANTEE, NOT A RESTORED
  // ONE. `put it away for good` never asked, on any of its three call sites,
  // and the confirm that exists in this room belongs to a different answer
  // (retire, from the shelf and the reader). She was shown that, offered three
  // confirm cards, rejected all three, and ruled a beat that asks NOTHING:
  // the answer applies, one line is said, and a way back is offered.
  //
  // ⛔ OD-3 IS UNTOUCHED AND IS WHAT THE FIRST ASSERTION HOLDS. She refused an
  // undo on a TIMER — "nothing in this room is on a clock" — and a button is
  // not a clock. A countdown here would be the thing she actually refused,
  // wearing the thing she actually asked for.
  runCase('g3e-set-aside-holds-and-offers-a-way-back', function () {
    const said = region('reachAsideSaid');
    assert.strictEqual(
      hits(said, /setTimeout|setInterval|requestAnimationFrame/g), 0,
      '(9) G-3e (OD-3, hers, unchanged): the way back she asked for is a ' +
      'BUTTON. Nothing in this room is on a clock, and an undo that expires ' +
      'is the decision-with-a-deadline she refused on 2026-08-14');
    assert.strictEqual(hits(said, /<button/g), 2,
      '(9) G-3e: EXACTLY TWO controls follow `put it away for good` — the ' +
      'way back and the way on. One would strand her on a permanent answer ' +
      '(the F-15 shape); three would be an answer on a picture already ' +
      'answered');
    assert.ok(said.indexOf('offer-aside-undo') !== -1 &&
      said.indexOf('offer-goon') !== -1,
      '(9) G-3e: ...and they are those two BY CLASS. A count of two could ' +
      'pass for an undo beside a second verdict; the identity cannot');
    /* ⛔ THE ORDERING, WHICH IS THE WHOLE BEHAVIOUR AND HAS BEEN GOT WRONG
       ONCE ALREADY ON THE `not relevant` path: the hold is read by the one
       funnel that decides what follows an answer, and that funnel runs the
       moment this function returns. A hold set after the slot guard is a hold
       set too late — the page brings the next picture and the line she was
       meant to read goes with the one before it. */
    const hold = said.indexOf('REACH.heldId = id');
    const guard = said.indexOf('if (!slot)');
    assert.ok(hold !== -1 && guard !== -1 && hold < guard,
      '(9) G-3e: the hold must be set BEFORE the note-slot guard and ' +
      'unconditionally (hold at ' + hold + ', guard at ' + guard + '). A ' +
      'page whose note slot has gone missing must not silently become a page ' +
      'that advances past a permanent answer');
    /* the way back is a real state change, read off the hop the answer just
       wrote — never a guess at `unseen`, which would un-say the wrong thing
       the day a door deals anything else. */
    const undo = region('reachAsideUndo');
    assert.ok(undo.indexOf('last.from') !== -1,
      '(9) G-3e: the undo restores the state the item CAME FROM, read off ' +
      'its own history, never a hardcoded one');
    assert.ok(undo.indexOf("StudyCore.applyTransition") !== -1,
      '(9) G-3e: ...through core.js, which owns the transition rules. A ' +
      'second spelling of them here is the one-rule-two-callers drift this ' +
      'codebase keeps paying for');
  });

  runCase('f1-the-door-says-what-it-is', function () {
    const desk = region('renderDeskStation');
    // ONE expression feeds the screen and the screen reader (OD-6): a door
    // that says one thing aloud and another on screen is two doors.
    assert.ok(desk.indexOf('var stackLabel = OFFER_COPY.deskStack;') !== -1,
      '(9) F-1: the desk stack takes its name from the ONE copy home, by ' +
      'key — a literal here would be a front-facing sentence no register ' +
      'can pin and no gate can find');
    // 26.999 (HER RULING, 2026-08-25, from the built room): the door is
    // SEEN, not read — the album art is the whole visible render and the
    // on-screen text is REMOVED: "I think it is better to use a viusal way
    // to make the user to press this albumn not using the wording". This
    // supersedes F-1's on-screen half BY HER OWN HAND; her C-12 sentence
    // stays as the accessible name from the one copy home. So: aria set,
    // textContent NOT set, the album img inside the button.
    assert.ok(desk.indexOf("stack.setAttribute('aria-label', stackLabel)")
      !== -1,
      '(9) F-1/26.999: her C-12 sentence still names the door for a screen ' +
      'reader, from the ONE copy home');
    assert.strictEqual(desk.indexOf('stack.textContent = stackLabel'), -1,
      '(9) 26.999: the on-screen wording is gone BY HER RULING — its ' +
      'return would re-cover the album with text she called hard to read');
    assert.ok(desk.indexOf("stackArt.src = 'assets/room/album.png'") !== -1,
      '(9) 26.999: the album art IS the door\'s visible render — inside ' +
      'the button, so the F-8 spent-dim reaches it');
    /* ⚠ THIS ONE READS CODE, NOT PROSE, AND IT LEARNED THAT THE HARD WAY.
       Written as a scan over the raw region it went red on the comment in
       app.js that QUOTES the retired label to explain why it went — a check
       that cannot tell a ban from an instance, which is this phase's own
       recurring defect and which G-3d had already caught me on once today.
       The fix is the region, never the prose: strip the comments and assert
       about what actually runs. ⚠ A stripper that silently failed would make
       this vacuous, so the strip is asserted non-empty first. */
    const deskCode = desk.replace(/\/\/[^\n]*/g, '');
    // 26.999: the non-vacuity token moved with the ruling — textContent is
    // gone from this door BY HER HAND, so the strip is proven live on the
    // aria assignment that remains.
    assert.ok(deskCode.length > 200 &&
      deskCode.indexOf('stack.setAttribute') !== -1,
      '(9) F-1: the comment-stripped desk region must still hold its code — ' +
      'a strip that took everything would make the scan below vacuous');
    assert.strictEqual(deskCode.indexOf("'a stack of papers'"), -1,
      '(9) F-1: the neutral label is gone FROM THE CODE. It said what the ' +
      'OBJECT was and nothing about what it opens, which is precisely what ' +
      'she could not work out');
  });

  runCase('f1-manage-points-home-without-a-door', function () {
    const manage = region('initManage');
    assert.ok(manage.indexOf('OFFER_COPY.manageBlessWhere') !== -1,
      '(9) F-1: the Manage signpost comes from the ONE copy home, by key');
    assert.ok(manage.indexOf('blessWhere.textContent') !== -1,
      '(9) F-1: ...as TEXT. Her copy goes onto a screen through textContent, ' +
      'never through an HTML string');
    // ⛔ THE LOAD-BEARING PROHIBITION. 26-05 removed the blessing entry from
    // Manage on her own UAT ruling — two doors to one act read as a
    // duplicate. This says where the door IS; it must never become one.
    const at = manage.indexOf('manage-bless-where');
    assert.notStrictEqual(at, -1, '(9) F-1: the signpost region is missing');
    const near = manage.slice(at, at + 700);
    ['createElement(\'button\'', '<button', 'addEventListener',
      'startBlessing('].forEach(function (token) {
      assert.strictEqual(near.indexOf(token), -1,
        '(9) F-1: the signpost must not name "' + token + '" — 26-05 removed ' +
        'the SECOND blessing door from Manage on her own ruling, and a ' +
        'control here would put it back while calling itself guidance');
    });
  });

  // ---- the asymmetry: a read miss is quiet, a save failure is loud -------
  runCase('save-failure-is-loud', function () {
    const retry = region('showNotRelevantRetry');
    assert.ok(retry.indexOf('quiet-error') !== -1,
      '(9) a verdict save failure is LOUD — the shipped quiet-error line, ' +
      'not silence. The asymmetry is the shipped posture: an open that ' +
      'misses opens nothing quietly; a thing she said that did not save ' +
      'must say so');
    assert.strictEqual(hits(retry, /<button/g), 1,
      '(9) ...with exactly ONE control on it: a retry, and nothing else');
    assert.ok(retry.indexOf('postNotRelevant(') !== -1,
      '(9) ...and the retry re-issues the SAME single write, never a ' +
      'second or a different one');
  });

  // ---- D-13: the guided first pass is deliberately unscreened ------------
  runCase('guided-pass-stays-unscreened', function () {
    // TWO STAGES, FUNCTION FIRST, and the reason is measured rather than
    // asserted: app.js holds TWO `StudyCore.pickBlessingCandidates(` call
    // sites — the live one inside startBlessing and the retired-but-retained
    // one inside deskStackOpenNext. A single-stage range over the bare call
    // token spans BOTH, and its meaning then depends on how the two happen
    // to be line-wrapped. Anchor on the function, then on the call.
    assert.strictEqual(hits(appSrc, /StudyCore\.pickBlessingCandidates\(/g), 2,
      '(9) app.js holds exactly TWO pickBlessingCandidates call sites — ' +
      'this is WHY the region below is anchored on the function first. A ' +
      'third means the two-stage anchor needs re-deciding, not widening');

    const start = region('startBlessing');
    const at = start.indexOf('StudyCore.pickBlessingCandidates(');
    assert.notStrictEqual(at, -1,
      '(9) the LIVE guided-pass call must sit inside startBlessing');
    const close = start.indexOf(');', at);
    assert.notStrictEqual(close, -1,
      '(9) the call must close inside the lifted region');
    const span = start.slice(at, close + 2);
    assert.ok(span.length > 40 && span.split('\n').length >= 2,
      '(9) the argument span must be real (' + span.length + ' chars, ' +
      span.split('\n').length + ' lines) — a collapsed span would make the ' +
      'negative assertion below meaningless');
    assert.strictEqual(span.indexOf('notRelevant'), -1,
      '(9) D-13, NARROWED WITH ITS REASON: the guided first pass is NOT ' +
      'screened against the not-relevant record. The glossary requires that ' +
      'such an item "stays unseen, stays in Manage, stays findable", so ' +
      'screening her own deliberate pass would hide her own material from ' +
      'her — the opposite of what the answer means');
    assert.strictEqual(start.indexOf('notRelevant'), -1,
      '(9) ...and the whole function is clean of the identifier, which ' +
      'proves the reason comment above the call did not ECHO the token this ' +
      'gate forbids. That is the comment-text trap this phase has sprung ' +
      'four times, and it is why the app-side comment is written in prose');
    assert.ok(start.indexOf('stays findable') !== -1,
      '(9) ...and the glossary\'s own reason IS written beside the call, in ' +
      'prose, so the omission reads as a decision rather than an oversight');
  });

  // ---- D-13's word "every": both proposal surfaces are screened ----------
  runCase('record-reaches-every-proposal-surface', function () {
    const sites = [];
    let i = appSrc.indexOf('StudyCore.selectLibrarianSuggestions(');
    while (i !== -1) {
      sites.push(i);
      i = appSrc.indexOf('StudyCore.selectLibrarianSuggestions(', i + 1);
    }
    assert.strictEqual(sites.length, 2,
      '(9) the librarian-suggestions selector has exactly TWO call sites — ' +
      'the Manage review surface and the desk ask\'s reply. Both are live ' +
      'librarian PROPOSAL surfaces, and D-13 says every one of them');
    sites.forEach(function (at) {
      const close = appSrc.indexOf(');', at);
      assert.notStrictEqual(close, -1, '(9) each call must close');
      const span = appSrc.slice(at, close + 2);
      assert.ok(span.split('\n').length >= 2,
        '(9) the argument span at ' + at + ' must be real');
      assert.ok(span.indexOf('REACH.memory.notRelevant') !== -1,
        '(9) D-13: the call site at offset ' + at + ' must pass the record ' +
        'as the sixth argument. Wiring it into the Offer alone would leave ' +
        'the ruling broader than the work');
    });
    assert.strictEqual(hits(appSrc, /api\/librarian\/memory/g), 1,
      '(9) ONE read site for the librarian memory — read once per visit and ' +
      'shared, never once per surface');
    /* ⚠ 26.95-63: the prefix is no longer unique, so the count is taken with a
       lookahead rather than loosened. `/api/librarian/not-relevant/undo` is a
       DIFFERENT route for a different act, and a substring count that lumped
       them together would have gone quietly to two and then to three — a gate
       that stops distinguishing what it counts has stopped checking. */
    assert.strictEqual(hits(appSrc, /api\/librarian\/not-relevant(?!\/)/g), 1,
      '(9) ONE write site for the answer — one tap, one write');
    assert.strictEqual(hits(appSrc, /api\/librarian\/not-relevant\/undo/g), 1,
      '(9) ...and ONE site that takes it back, hers, ruled 2026-08-17. Two ' +
      'would mean a second path she has not seen; zero would mean the ' +
      'handbook paragraph she rewrote is false again');
  });

  runCase('heavy-naming-seam-126', function () {
    const submit = region('heavyNamingSubmit');
    assert.ok(submit.indexOf('SEAM-126') !== -1,
      '(9) SEAM-126: neither box is recorded beside the branch');
    assert.ok(submit.indexOf('if (!routing) { return; }') !== -1,
      '(9) SEAM-126: neither tick-box means return before any post');
    assert.ok(submit.indexOf('if (!name) { return; }') !== -1,
      '(9) required name: empty name means return before any post');
    const norm = region('heavyNameNormalized');
    assert.ok(norm.indexOf(".normalize('NFC')") !== -1,
      '(9) names are compared in one Unicode normalization form');
  });

  runCase('heavy-naming-filled-warning', function () {
    const naming = region('renderHeavyNaming');
    assert.ok(naming.indexOf('HEAVY_COPY.warningOnce') !== -1,
      '(9) the warning slot is conditional on her words being present');
    assert.strictEqual(hits(appSrc, /heavy-warning-once/g), 1,
      '(9) exactly ONE warning slot class — rendered only when filled');
    const s3 =
      'The name stays here for hiding. The reflection ritual you run still ' +
      'sends it out with your writing, about three times a month, whether or ' +
      'not anything is noticed.';
    assert.ok(appSrc.indexOf("warningOnce: '" + s3 + "'") !== -1,
      '(9) 26.996-11: naming warning is her S-3, byte-identical');
  });

  runCase('heavy-five-doors-from-code', function () {
    const sites = [];
    let i = appSrc.indexOf('wireHeavyQuietLink(');
    while (i !== -1) {
      if (appSrc.slice(i - 12, i).indexOf('function ') === -1) {
        sites.push(i);
      }
      i = appSrc.indexOf('wireHeavyQuietLink(', i + 1);
    }
    assert.strictEqual(sites.length, 4,
      '(9) FIVE doors from FOUR call sites + one builder: Offer row ' +
      '(desk/album/journal/shelf via paintOfferPage), fillReaderInto spread ' +
      'reader, legacy reader, insight reader — counted ' + sites.length);
    const builder = region('wireHeavyQuietLink');
    assert.strictEqual(hits(builder, /function wireHeavyQuietLink/g), 1,
      '(9) exactly ONE builder implements the quiet link');
  });

  runCase('heavy-guided-pass-untouched', function () {
    const ribbon = region('renderBlessingRibbon');
    assert.strictEqual(ribbon.indexOf('wireHeavyQuietLink'), -1,
      '(9) D-13 DECISION NOT OVERSIGHT: her guided first pass reaches no ' +
      'heavy naming — the ribbon stays one tap with no gate per picture');
    const start = region('startBlessing');
    assert.strictEqual(start.indexOf('wireHeavyQuietLink'), -1,
      '(9) ...and the guided pass entry does not wire the fourth answer');
    assert.strictEqual(start.indexOf('renderHeavyNaming'), -1,
      '(9) ...nor open the naming prompt from the guided pass');
  });

  runCase('heavy-import-proposal-not-forever', function () {
    const presort = region('renderLibrarianSuggestions');
    assert.strictEqual(presort.indexOf('confirmLibrarianHeavy'), -1,
      '(9) 26.996-05 (#110): import proposal must not reach ' +
      'confirmLibrarianHeavy (the never_show path)');
    assert.ok(presort.indexOf('renderHeavyNaming') !== -1,
      '(9) ...it opens the fourth-answer naming prompt instead');
    assert.strictEqual(
      hits(presort, /setTimeout|setInterval|requestAnimationFrame/g), 0,
      '(9) ...and nothing on this path gains a clock');
  });

  runCase('heavy-group-shot-once-three', function () {
    const q = region('renderGroupShotQuestion');
    assert.ok(q.indexOf('heavy-group-shot-strip') !== -1,
      '(9) #113: group-shot question shows real photographs');
    assert.strictEqual(hits(q, /\.slice\(0, 3\)/g), 1,
      '(9) #113: capped at three photographs by value');
    assert.ok(q.indexOf('renderGroupShotQuestion') !== -1,
      '(9) one builder for the class question');
    const after = region('maybeGroupShotAfterLikeness');
    assert.ok(after.indexOf('renderGroupShotQuestion') !== -1,
      '(9) asked once after likeness, not from a second tap site');
    assert.strictEqual(hits(q, /heavy-group-shot-accept|heavy-group-reject/g), 0,
      '(9) no per-picture accept or reject control');
  });

  runCase('heavy-group-shot-filled-prompt', function () {
    const f1 =
      'a few of these look like the same gathering — set those aside too?';
    assert.ok(appSrc.indexOf("groupShotPrompt: '" + f1 + "'") !== -1,
      '(9) 26.996-11: group-shot prompt is her F1, byte-identical');
    const q = region('renderGroupShotQuestion');
    assert.ok(q.indexOf('HEAVY_COPY.groupShotPrompt') !== -1,
      '(9) prompt is conditional like plan 03 warning slot');
    assert.strictEqual(hits(q, /heavy-group-shot-prompt/g), 1,
      '(9) exactly one prompt element class');
  });

  runCase('heavy-group-shot-no-name-field', function () {
    const q = region('renderGroupShotQuestion');
    assert.strictEqual(hits(q, /heavy-name-input|type="text"/g), 0,
      '(9) #113: no second name field — name carries forward');
    const submit = region('heavyGroupShotSubmit');
    assert.strictEqual(hits(submit, /heavy-name-input|type="text"/g), 0,
      '(9) submit path also renders no name field');
  });

  runCase('heavy-group-shot-no-clock', function () {
    const q = region('renderGroupShotQuestion');
    const submit = region('heavyGroupShotSubmit');
    const after = region('maybeGroupShotAfterLikeness');
    assert.strictEqual(
      hits(q + submit + after,
        /setTimeout|setInterval|requestAnimationFrame/g), 0,
      '(9) group-shot path gains no clock');
    assert.ok(q.indexOf('escapeHtml') !== -1,
      '(9) rendered strings pass through escapeHtml');
    assert.ok(q.indexOf('escapeAttr') !== -1,
      '(9) photograph ids pass through escapeAttr');
  });

  runCase('for-now-forever-manage-labels', function () {
    const declAt = appSrc.indexOf('var MANAGE_PANES');
    assert.notStrictEqual(declAt, -1,
      '(9) 26.996-09: MANAGE_PANES must exist to pin the two list names');
    const seg = appSrc.slice(declAt, declAt + 6000);
    const forNow = "label: 'Set aside — for now'";
    const forever = "label: 'You put these away for good'";
    assert.ok(seg.indexOf(forNow) !== -1,
      '(9) 26.996-09 (#121): the for-now pane reads her ruling verbatim');
    assert.ok(seg.indexOf(forever) !== -1,
      '(9) 26.996-09 (#121 r6): the forever pane reads her ruling verbatim');
    assert.strictEqual(seg.indexOf("label: 'never show'"), -1,
      '(9) 26.996-09: the forever rail must not still read `never show`');
    assert.strictEqual(seg.indexOf("label: 'set aside'"), -1,
      '(9) 26.996-09: the for-now rail must not still read bare `set aside`');
    assert.notStrictEqual(forNow, forever,
      '(9) 26.996-09: the two list names must differ by value');
  });

  runCase('aside-desk-sentence-filled', function () {
    const s2 = 'what you wrote at the end of {when} reads differently now';
    assert.ok(appSrc.indexOf(s2) !== -1,
      '(9) 26.996-11: desk sentence is her S-2, byte-identical');
    assert.ok(appSrc.indexOf('var DESK_ASIDE_SENTENCE') !== -1 &&
      appSrc.indexOf("DESK_ASIDE_SENTENCE = ''") === -1,
      '(9) 26.996-11: DESK_ASIDE_SENTENCE is no longer the empty literal');
    const reveal = region('revealDeskAsideAsk');
    assert.ok(reveal.indexOf('if (!DESK_ASIDE_SENTENCE)') !== -1,
      '(9) empty sentence still returns before any paint');
    assert.strictEqual(hits(reveal, /setTimeout|setInterval|requestAnimationFrame/g), 0,
      '(9) aside desk path gains no clock');
  });

  runCase('aside-desk-local-no-markdown', function () {
    const render = region('renderDeskAsideAsk');
    assert.strictEqual(hits(render, /\brenderMarkdown\s*\(/g), 0,
      '(9) local card must not call the model body seam');
    assert.ok(render.indexOf('escapeHtml') !== -1,
      '(9) local sentence passes through escapeHtml');
    assert.strictEqual(hits(render, /<button/g), 2,
      '(9) exactly two actions, asserted as an integer');
    assert.ok(render.indexOf("not this — don't ask again") !== -1 &&
      render.indexOf("yes — I'll set that up") !== -1,
      '(9) both action lines stay one source literal each');
  });

  runCase('aside-desk-quiet-not-sent-file', function () {
    const render = region('renderDeskAsideAsk');
    assert.strictEqual(render.indexOf('/api/librarian/dismiss'), -1,
      '(9) 26.996-10 near-miss: quiet must not post to the sent-file route');
    assert.ok(render.indexOf('/api/librarian/aside-ask/quiet') !== -1,
      '(9) quiet lands on the not-sent neighbourhood route');
    const compose = serverSrc;
    const at = compose.indexOf('def _record_aside_quiet');
    assert.notStrictEqual(at, -1, '(9) quiet writer must exist');
    const body = compose.slice(at, at + 1200);
    assert.strictEqual(body.indexOf('dismissed.json'), -1,
      '(9) quiet writer must not name the sent neighbour');
    assert.ok(body.indexOf('aside-quiet.json') !== -1,
      '(9) quiet writer names its own not-sent file');
  });

  console.log('OFFER-ROW CASES ' + ran);
  assert.strictEqual(failures.length, 0,
    '(9) failures: ' + failures.join(' ;; '));
  // ⚖️ 8 -> 10 on 2026-08-16: UAT finding F-1 added the two signpost cases
  // (the desk stack's own name, and Manage pointing home without becoming a
  // door). Moved deliberately, in the same commit as the cases.
  /* ⚖️ THE ROSTER IS ASSERTED BEFORE THE COUNT, because it is the stronger
     statement and the count is what it degrades to. A deletion moves both; a
     RENAME moves only this one, which is the whole reason it exists. */
  assert.deepStrictEqual(ranNames, CASE_ROSTER,
    '(9) the case ROSTER must match BY NAME AND ORDER. Ran: ' +
    JSON.stringify(ranNames));
  /* ⚖️ 10 -> 11 on 2026-08-17 (UAT session 2, F-16): G-3e, the set-aside
     beat she ruled. Moved in the same commit as the case and the roster. */
  /* ⚖️ 11 -> 15 on 2026-08-28 (26.996-03): heavy naming prompt, five doors,
     SEAM-126 neither-box, guided-pass negative. */
  /* ⚖️ 15 -> 16 on 2026-08-28 (26.996-05): import proposal not forever. */
  /* ⚖️ 16 -> 20 on 2026-08-28 (26.996-07): group-shot question cases. */
  /* ⚖️ 20 -> 21 on 2026-08-28 (26.996-09): for-now vs forever Manage labels. */
  /* ⚖️ 21 -> 24 on 2026-08-28 (26.996-10): local aside desk card. */
  /* ⚖️ 24 stays 24 on 2026-08-28 (26.996-11): three empty-slot cases renamed
     to filled-sentence pins; roster names moved, count unchanged. */
  assert.strictEqual(ran, 24,
    '(9) SIXTEEN cases ran — a skipped case cannot hide behind a passing ' +
    'total, and a renamed one cannot hide behind a count alone (the roster ' +
    'above is what makes that second clause TRUE; until 26.95-46 this ' +
    'message claimed it and the count could not deliver it, and a driven ' +
    'rename passed)');
})();

/* ---------------------------------------------------------------------------
   THE READER'S ROSTER MUST BE THE FENCE'S ROSTER (2026-08-20, map #62 / #77)

   ⚠ FOUND BY DRIVING, NOT BY READING. The owner's new "Kept private" card
   NAMES the roster to a stranger before they hand the room a folder, and it
   reads the names off app.js's own copy rather than typing them — which fixes
   the hard-typed half of the old false sentence. But a fifth name added to
   that copy left ALL 50 node and 38 python suites GREEN: nothing anywhere
   held the reader's copy to study_lib.DEFAULT_FENCED_ROSTER, which is what
   the fence actually enforces. So the card could promise protection for a
   folder the fence does not hold — the exact rot the derivation was meant to
   end, one level up.

   ⚠ app.js keeps TWO copies and BOTH are pinned here. VAULT_DEFAULT_ROSTER
   feeds the card; REFLECTION_FENCED_ROSTER feeds the reader's de-linking.
   Whichever drifts, a stranger is told something the fence will not do.

   ⛔ THIS IS A SYNC PIN, NOT A FENCE. It does not make the reader's copy
   authoritative and it does not touch precedence — a STORED meta.fenced_roster
   still wins at every site (26.91-39, A-27). It says only that the shipped
   DEFAULT the two sides fall back to is one list spelled twice.

   ⚠ tests/test_reflection_verbatim.cjs's own FENCED_ROSTER is deliberately
   NOT pinned here: it is a Memoir-path FIXTURE, and its comment claiming a
   drift between it and the constant "is caught by this test" is FALSE — it
   already reads 'Memoir' where the constant reads 'Journal'. Recorded, not
   quietly repaired: correcting a claim in another suite is a decision, and
   this one belongs to whoever owns that fixture.
--------------------------------------------------------------------------- */
(function () {
  function listAfter(src, decl) {
    const at = src.indexOf(decl);
    assert.ok(at !== -1, '(10) ' + decl + ' must exist to be pinned');
    const open = src.indexOf('[', at);
    const close = src.indexOf(']', open);
    assert.ok(open !== -1 && close > open, '(10) ' + decl + ' must be a list');
    return (src.slice(open + 1, close).match(/(['"])(.*?)\1/g) || [])
      .map(function (q) { return q.slice(1, -1); });
  }

  const fence = listAfter(libSrc, 'DEFAULT_FENCED_ROSTER = [');
  assert.ok(fence.length >= 1,
    '(10) the fence roster must not read as empty — an empty parse would ' +
    'make every comparison below vacuously true');

  [['VAULT_DEFAULT_ROSTER', 'the "Kept private" card'],
   ['REFLECTION_FENCED_ROSTER', "the reader's de-linking"]
  ].forEach(function (pair) {
    assert.deepStrictEqual(listAfter(appSrc, 'var ' + pair[0] + ' = ['), fence,
      '(10) app.js ' + pair[0] + ' (' + pair[1] + ') must match ' +
      'study_lib.DEFAULT_FENCED_ROSTER BY NAME AND ORDER — the reader may ' +
      'not name a folder the fence does not hold, nor omit one it does');
  });

  console.log('ROSTER-SYNC CASES 3');
})();

console.log('OK test_display_fence.cjs — DISPLAY toggle: OFF de-links / ON ' +
  'opens for the owner; click decision; cloud + surfacing fences never see ' +
  'the flag (librarian scope byte-identical both states); path-refs: safe → ' +
  'quiet pathref anchor, fenced → byte-identical plain (fail-closed)');
