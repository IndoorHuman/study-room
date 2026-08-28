/*
 * tests/test_reflection_verbatim.cjs — the verbatim reflection reader's
 * Memoir-link NON-resolution gate (Plan 26.4-09, Task 1).
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * This is the ONE genuinely new safety property of the phase (Pitfall 1,
 * SRM-13 defense-in-depth): a reflection quotes the raw diary VERBATIM by
 * design (D-29) and carries [[Memoir/…]] wikilinks + a "Returns worth
 * making" list of Memoir/ paths. The reader shows that quotation verbatim
 * (law 4) but must NEVER turn an embedded fenced-roster link/path into an
 * openable door back to the raw journal.
 *
 * delinkifyFencedWikilinks(md, isFenced) is a PURE function inside app.js —
 * it de-linkifies (renders as INERT plain text) any [[wikilink]] whose
 * target sits under the fenced roster (Memoir/, personnel notes/, …) OR whose
 * basename the optional resolver maps to a judged-away item (the bare
 * [[Memoir 26 July 15|…]] the ## Related tail carries), while leaving a
 * NON-fenced wikilink for the shipped linkifier (cleanVaultMarkup). Both
 * functions are lifted from app.js by brace-matching (app.js is a browser
 * IIFE that touches `document` at load, so it can't be require()'d under
 * node) — the repo's text-extraction idiom (mirrors test_reflection_shelf).
 *
 * Behaviors covered:
 *   1. VERBATIM — the quoted raw-journal passage survives byte-for-byte.
 *   2. JOURNAL/ WIKILINK — a [[Memoir/2026-07-15|…]] renders as inert text
 *      (its display text kept, the [[…]] markup gone) so the downstream
 *      linkifier can never make it an anchor.
 *   3. BARE-BASENAME JOURNAL — a [[Memoir 26 July 15|…]] with no folder
 *      prefix, which RESOLVES to a fenced item, is de-linked via the
 *      resolver (the ## Related door back to the raw journal).
 *   4. RETURNS / PATHS — a "Returns worth making" Memoir/ path stays plain
 *      text (never a link).
 *   5. SELECTIVE — a NON-fenced wikilink is left for the shipped linkifier
 *      (proves the de-link fences the roster, not "all links").
 *   6. END-TO-END — composing with the shipped cleanVaultMarkup, NO wikilink
 *      anchor (data-wiki) ever resolves to a Memoir basename; the verbatim
 *      quote still survives; the non-fenced link DID become an anchor.
 *
 * 26.7-03 extension (D-07 — the chat-refine verbatim mechanical floor):
 *   7. REFINE VERBATIM — a REAL server (spawned python child, temp
 *      library, the hermetic fake_claude ECHO envelope) runs one session
 *      + three refine turns; every user contribution — ASCII, CJK, and
 *      an NFD-DECOMPOSED accent — survives as an EXACT raw substring
 *      into the revised draft, the recorded per-turn stdin, and the
 *      session file's own text. Raw code-point comparisons, no
 *      normalization on either side; the NFC-composed variant must
 *      appear NOWHERE (her bytes are the contract).
 *
 *      ⛔⛔ 26.995-12 (D-13) — THE ASSERTIONS MOVED; NOT ONE WAS DELETED.
 *      This list read "into the revised draft, THE CODA, the recorded
 *      per-turn stdin…". The coda field left the wire when the labelled
 *      footer was deleted, and the temptation at that moment is to strike
 *      the assertion that names it and call the deletion green. THAT IS
 *      FORBIDDEN HERE: this suite is the strongest evidence in the repo
 *      that her chat words survive a save, and D-13 exists to make her
 *      words survive MORE faithfully, not less. So the claim moved to the
 *      DRAFT — which is where the weaving (26.995-07) now puts them — and
 *      a new assertion says the retired key reaches the session file
 *      nowhere at all. This suite was GREEN before this plan and is GREEN
 *      after it; that is what makes it a move rather than a loss.
 *
 * 26.8-03 extension (D-10 — the whys-carrying end-to-end turn, riding
 * the same driver):
 *   8. WHYS ROUND-TRIP — the session POST carries the walk's results
 *      ({blessed, why_wanted} — her own taps, client-sent); the stub's
 *      envelope carries a whys map holding the requested id AND a
 *      deliberately-unrequested id. The requested why survives
 *      validation VERBATIM into session.json (still present after all
 *      three refine turns — the refine path re-validates and keeps it);
 *      the unrequested entry is stripped fail-closed and appears
 *      nowhere in the persisted file.
 *
 * 26.93-07 extension (the seam moved from PATH to the transport):
 *   9. HERMETIC BY VALUE — the child reports, BEFORE it asks anything, that
 *      every tier resolved to her own machine, that neither cloud key name
 *      survived into it, and that the keys file it could reach sits under its
 *      own temp home; the recorded request carried no credential and was
 *      addressed to the loopback. Behaviors 7 and 8 are worth nothing without
 *      this: until 26.93-07 this file's child inherited the real HOME, found
 *      the owner's real Anthropic key, and asserted her characters against
 *      four paid Opus answers.
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// Lift a top-level `function name(...) { ... }` verbatim from source by
// brace-matching from the signature to the matching close brace.
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1,
    name + ' must be defined in app.js — not found');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

// The fenced roster mirrors study_lib.DEFAULT_FENCED_ROSTER — declared here
// so a drift between the reader's roster and the fence's is caught by this
// test (the reader's roster is a free var injected into the lifted function).
const FENCED_ROSTER = ['Memoir', 'personnel notes',
  'billing & insurance notes', 'appraisal record'];

// 26.88-12 (Q4): the two escapers used to be BYTE-COPIED from app.js here, so
// the lifted cleanVaultMarkup linkifier could be given them as free vars. Both
// now live in core.js beside cleanVaultMarkup itself and are injected by the
// module, so the copies are gone — a third spelling of an escaper in a test
// file is the same drift this phase has now paid for twice.

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

function loadDelink(opts) {
  const fnSrc = liftRoster(appSrc) + extractFn(appSrc, 'delinkifyFencedWikilinks');
  // eslint-disable-next-line no-new-func
  const factory = new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
    fnSrc + '\nreturn delinkifyFencedWikilinks;');
  return factory(FENCED_ROSTER, rosterRoom(opts));
}

// 26.88-12 (Q4): cleanVaultMarkup MOVED INTO core.js and is required here
// directly. Do NOT re-lift it out of app.js source text — app.js no longer
// declares it. This is a law-5-adjacent fence suite: every assertion below is
// byte-identical to what it was before the move; only this loader changed.
function loadCleanVault() {
  return require(path.join(__dirname, '..', 'core.js')).cleanVaultMarkup;
}

// 26.4-10 (Change A): the reflection's OWN fenced-roster references, harvested
// from the FULL markdown. Lifted with the same roster free-var the app injects.
function loadCollectFenced(opts) {
  const fnSrc = liftRoster(appSrc) + extractFn(appSrc, 'collectFencedBasenames');
  // eslint-disable-next-line no-new-func
  const factory = new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
    fnSrc + '\nreturn collectFencedBasenames;');
  return factory(FENCED_ROSTER, rosterRoom(opts));
}

// A reflection body of the verified real shape: a verbatim journal quote, an
// explicit [[Memoir/…]] wikilink, a "Returns worth making" list of Memoir/
// paths, a ## Related tail with a NON-fenced sibling-reflection link and a
// bare-basename [[Memoir …|…]] door. (The reader splits off frontmatter
// upstream via splitFrontmatter, so `reflects: [Memoir/…]` never even
// reaches this render — a stronger guarantee than "renders as text".)
const VERBATIM_QUOTE =
  'I was not happy with that, I turned the light back on and also start knitting.';
const BODY = [
  '## What surfaced',
  '',
  'Three days before the course gave you "feel cannot say," you wrote: "' +
    VERBATIM_QUOTE + '." A boundary, held, in your own house.',
  '',
  'You return to it in [[Memoir/2026-07-15|the July 15 entry]].',
  '',
  '## Returns worth making',
  '',
  '- `Memoir/Memoir 26 July 15.md` — a boundary, held, in real time.',
  '- Memoir/日记 26年7月14日.md — the night you turned the light back on.',
  '',
  '## Related',
  '',
  '- [[Kudos for Myself 2026-07-17|Kudos for Myself]]',
  '- [[Memoir 26 July 15|Memoir 2026-07-15]]'
].join('\n');

// The resolver the app injects: a wikilink whose basename resolves to a
// judged-away / born-fenced library item is a door back to the raw journal.
// Here the bare-basename ## Related link resolves to a fenced Memoir item.
function isFenced(target) {
  const base = String(target).split('/').pop().toLowerCase();
  return base.indexOf('memoir 26 july 15') !== -1;
}

// ---- pure de-link layer ----------------------------------------------------

(function () {
  const delink = loadDelink();
  const out = delink(BODY, isFenced);

  // 1. VERBATIM
  assert.ok(out.indexOf(VERBATIM_QUOTE) !== -1,
    '(1) the verbatim journal quote survives the de-link byte-for-byte');

  // 2. JOURNAL/ WIKILINK de-linked, display text kept
  assert.ok(out.indexOf('[[Memoir/2026-07-15') === -1,
    '(2) the [[Memoir/…]] wikilink markup is gone (de-linked)');
  assert.ok(out.indexOf('the July 15 entry') !== -1,
    '(2) the wikilink display text is preserved as inert plain text');

  // 3. BARE-BASENAME JOURNAL door de-linked via the resolver
  assert.ok(out.indexOf('[[Memoir 26 July 15') === -1,
    '(3) the bare-basename Memoir wikilink is de-linked via the resolver');
  assert.ok(out.indexOf('Memoir 2026-07-15') !== -1,
    "(3) its display text is preserved as inert plain text");

  // 4. RETURNS / PATHS stay plain text (never wikilink markup)
  assert.ok(out.indexOf('Memoir/Memoir 26 July 15.md') !== -1,
    '(4) the "Returns" Memoir/ path stays plain text, untouched');

  // 5. SELECTIVE — a non-fenced wikilink is left for the shipped linkifier
  assert.ok(out.indexOf('[[Kudos for Myself 2026-07-17|Kudos for Myself]]') !== -1,
    '(5) a NON-fenced wikilink is left untouched for the shipped linkifier');

  // defensive: a null/empty body fails safe to a string, never throws
  assert.strictEqual(delink(null, isFenced), '',
    '(5) a null body fails safe to empty');
})();

// ---- end-to-end through the shipped linkifier ------------------------------

(function () {
  const delink = loadDelink();
  const cleanVault = loadCleanVault();
  const html = cleanVault(delink(BODY, isFenced));

  // 6. NO wikilink anchor resolves to a Memoir basename. cleanVaultMarkup
  // stamps data-wiki with the target's basename; a de-linked Memoir target
  // can never appear there.
  ['2026-07-15', 'Memoir 26 July 15'].forEach(function (base) {
    assert.ok(html.indexOf('data-wiki="' + base + '"') === -1,
      '(6) no wikilink anchor resolves to the Memoir basename "' + base +
      '" — no door back to the raw journal');
  });
  // stronger: NO anchor's data-wiki mentions a journal at all.
  assert.ok(!/data-wiki="[^"]*[Jj]ournal[^"]*"/.test(html),
    '(6) no wikilink anchor targets anything under Memoir');

  // the verbatim quote still survives the full clean.
  assert.ok(html.indexOf(VERBATIM_QUOTE) !== -1,
    '(6) the verbatim quote survives the full render clean');

  // and the de-link is SELECTIVE: the non-fenced sibling link DID linkify
  // (so the gate proves the fence, not a blanket "no links").
  assert.ok(/class="wikilink"/.test(html) &&
    html.indexOf('data-wiki="Kudos for Myself 2026-07-17"') !== -1,
    '(6) a non-fenced wikilink still becomes an anchor (selective de-link)');
})();

// ---- CHANGE A held-out: the ## Related-block leak is sealed by DEFAULT ------
//
// The real Pitfall-1 gap 26.4-10 closes: the auto-generated ## Related block
// links a Memoir note by BARE basename ([[日记 26年7月20日]], no folder prefix)
// that was NEVER imported into the library — so resolveWikilink returns null,
// reflectionWikilinkFenced returns false, and (before the fix) the roster
// de-link left it a live wikilink door back to the raw journal. The reflection
// DECLARES that note in its own frontmatter (reflects: [Memoir/…md]) and its
// Returns list, so collectFencedBasenames (over the FULL md) seals it.
//
// This case is HELD OUT from the pure-layer block above: there the resolver
// (isFenced) is a mock that returns true; here the resolver returns FALSE for
// the un-imported journal, proving the seal comes from collectFencedBasenames
// alone — not from a library hit.
(function () {
  const delink = loadDelink();
  const cleanVault = loadCleanVault();
  const collectFenced = loadCollectFenced();

  // A full reflection: frontmatter names the raw entries (one imported, one
  // NOT), a Returns list, and a ## Related tail whose BARE links point at both
  // journals plus a non-fenced sibling reflection.
  const FULL = [
    '---',
    'reflects:',
    '  - Memoir/日记 26年7月14日.md',
    '  - Memoir/日记 26年7月20日.md',
    'handwritten: true',
    '---',
    '## What surfaced',
    '',
    'A boundary, held, in your own house.',
    '',
    '## Returns worth making',
    '',
    '- Memoir/日记 26年7月20日.md — the night you turned the light back on.',
    '',
    '## Related',
    '',
    '%% auto-links:start %%',
    '- [[Memoir analysis (Hub)]]',
    '- [[日记 26年7月14日]]',
    '- [[日记 26年7月20日|July 20 entry]]',
    '- [[Kudos for Myself 2026-07-17]]',
    '%% auto-links:end %%'
  ].join('\n');

  // Strip frontmatter the way the app does upstream (body-only render).
  // 26.88-16 (F-5): this line used to carry its OWN copy of the frontmatter
  // regex — a FOURTH in-repo spelling, found by executing the one-spelling scan
  // rather than by reading the census, which had counted three. It calls the
  // shipped split now, so a change to the split moves this fixture with it
  // instead of leaving the suite silently asserting against the old shape.
  const body = require(path.join(__dirname, '..', 'core.js'))
    .splitFrontmatter(FULL).body;

  // the PRODUCTION-shape resolver for THIS scenario: neither journal is a
  // judged-away library hit (they were never imported), so it returns false —
  // the seal must come from collectFencedBasenames, not the resolver.
  function isFencedProd() { return false; }

  const bases = collectFenced(FULL);
  const out = delink(body, function (target) {
    const base = String(target).split('/').pop().trim()
      .toLowerCase().replace(/\.md$/, '');
    return bases[base] === true || isFencedProd(target);
  });
  const html = cleanVault(out);

  // the two Memoir doors in the Related block are INERT — no anchor resolves
  // to either journal basename (with the toggle OFF / default path).
  ['日记 26年7月14日', '日记 26年7月20日'].forEach(function (base) {
    assert.ok(html.indexOf('data-wiki="' + base + '"') === -1,
      '(A) Related-block Memoir door "' + base +
      '" is inert by default — no clickable anchor resolves to it');
  });
  // stronger: no anchor targets anything a fenced roster path named.
  assert.ok(!/data-wiki="[^"]*日记[^"]*"/.test(html),
    '(A) no wikilink anchor targets any referenced raw-journal entry');
  // the display text of the de-linked door survives as inert plain text.
  assert.ok(html.indexOf('July 20 entry') !== -1,
    '(A) the de-linked door keeps its display text as inert plain text');
  // SELECTIVE: the non-fenced sibling reflection link STILL becomes an anchor
  // (proves the seal fences the roster, not "every Related link").
  assert.ok(html.indexOf('data-wiki="Kudos for Myself 2026-07-17"') !== -1,
    '(A) a non-fenced Related link still becomes an anchor (selective seal)');

  // and collectFencedBasenames itself: a null md is an empty set, never throws.
  assert.deepStrictEqual(Object.keys(collectFenced(null)), [],
    '(A) collectFencedBasenames(null) is an empty set (fails safe)');
})();

// ---- 26.7-03: chat-refine verbatim survival (D-07, SRM-11 encoding edge) ----
//
// The refine loop end-to-end: the python child below seeds a temp library,
// binds the real server on an ephemeral port with the hermetic seam installed
// (ECHO mode: the envelope QUOTES every user chat line from the handed
// payload), runs one session + one refine turn per text, then hands back the
// persisted draft/transcript, the raw session.json text, whether the retired
// coda key is present at all, and the last recorded per-turn stdin. Every comparison here is a raw exact-substring
// check over code points — no trim, no case fold, no unicode normalization of
// any kind.
//
// ⚠⚠ 26.93-07 — THE HERMETIC SEAM MOVED FROM PATH TO THE TRANSPORT, AND UNTIL
// THIS FILE FOLLOWED IT, ONE RUN SPENT THE OWNER'S MONEY.
//
// Until 26.93-06 the child was made hermetic by prepending a fake `claude`
// program to PATH. Plan 26.93-06 moved seven librarian jobs — `reflection`
// among them — onto HTTP, which consults PATH for nothing at all. The stub
// therefore stopped intercepting anything while still LOOKING installed: the
// child inherited the real HOME, `librarian_call._credential` found the
// owner's real Anthropic key under it, the `good-cloud` tier resolved to
// `claude-opus-5`, and a run of this file bought four real Opus answers and
// then asserted her own characters against them. The interception point is now
// `librarian_call._transport`, the module attribute that is the seam's ONE
// injection point.
//
// ⚠ THE SEAM IS IMPORTED, NOT RE-SPELLED. `tests/test_server_smoke.py`'s
// `fake_claude_env` already does all four load-bearing things — swaps HOME to
// a fresh temp root so `key_present` answers False for both companies, pops
// both key names and all three fill names, installs the recording transport,
// and runs `assert_under_temp_root` BEFORE anything is written. Writing a
// second copy of a money guard into this driver is exactly the drift 26.88-12
// (Q4) paid for twice with the escapers, and a money guard is the worst place
// in the repo to keep two spellings. So the child imports it. The two stub
// toggles this scenario needs are handed in as `extra=`, because the seam
// clears every toggle on the way in.
//
// ⚠ THE PATH PREPEND IS GONE FROM THE NODE SIDE AND KEPT INSIDE THE SEAM.
// `fake_claude_env` still prepends the fake program. It did so because a
// spawned-program site survived in `server.py`; that site — the vault tidy-up —
// was DELETED 2026-08-14 (#56), and the prepend is kept as a negative control
// so a re-introduced spawn cannot reach a real binary from inside a sweep.
// Nothing in THIS driver reaches it, but pinning PATH here would fight the seam
// over the same variable for no gain.

(function () {
  const { spawnSync } = require('child_process');
  const os = require('os');

  // NFD_CAFE = 'cafe' + U+0301 COMBINING ACUTE (decomposed, the turn
  // text); NFC_CAFE = 'caf' + U+00E9 (composed — must appear NOWHERE).
  const NFD_CAFE = 'caf' + String.fromCharCode(0x65, 0x0301);
  const NFC_CAFE = 'caf' + String.fromCharCode(0xE9);
  const TEXTS = [
    'the selvedge held, plain and steady',                    // ASCII
    '毛线团滚到了窗台下', // CJK
    // the NFD accent case — CONSTRUCTED from code points below so no
    // editor/toolchain normalization of THIS source file can ever
    // collapse the two forms into one:
    'a page about the ' + NFD_CAFE + ' notebook'
  ];

  // 26.8-03 (behavior 8): the whys round-trip rides this same driver.
  // WHY_IID is the seeded item; UNREQ_ID is deliberately never in the
  // walk's why_wanted — its entry must strip. The why text quotes her
  // CJK line so verbatim survival is byte-assertable.
  const WHY_IID = 'e'.repeat(16);
  const UNREQ_ID = 'f'.repeat(16);
  const WHY_TEXT = 'the loom line held — “毛线团滚到了窗台下” stays hers';

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-verbatim-'));
  const logPath = path.join(tmp, 'fake.log');
  const driver = [
    'import json, os, sys, tempfile, threading, time',
    'import http.client',
    'from pathlib import Path',
    "repo = Path(os.environ['SR_REPO_ROOT'])",
    'sys.path.insert(0, str(repo))',
    // ⚠ tests/ joins sys.path so the ONE hermetic seam can be IMPORTED rather
    // than re-spelled here. See the block above this driver.
    "sys.path.insert(0, str(repo / 'tests'))",
    'import server, study_lib',
    'import librarian_call as L',
    'import test_server_smoke as smoke',
    "texts = json.loads(os.environ['SR_CHAT_TEXTS'])",
    'tmpdir = tempfile.TemporaryDirectory()',
    // The seam owns HOME, PATH, both key names, all three fill names, the
    // transport and the sleep — for the whole of the run below. It runs
    // `assert_under_temp_root` before anything is written, so a swap that
    // failed raises HERE rather than after the first paid request.
    'env = smoke.fake_claude_env(',
    "    Path(os.environ['SR_FAKE_LOG']),",
    "    extra={'FAKE_CLAUDE_REFLECTION_ECHO': '1',",
    "           'FAKE_CLAUDE_REFLECTION': os.environ['SR_WHYS_ENVELOPE']})",
    'env.__enter__()',
    'try:',
    // ---- (9) the hermeticity proof, read BEFORE a single call is made -----
    '    assert L._transport is smoke.stub_transport, (',
    '        "the recording transport is the installed seam")',
    '    routing = L.resolve_routing(L.load_settings())',
    '    fills = dict((t, list(routing.fills[t])) for t in L.TIERS)',
    '    home = os.path.realpath(os.environ["HOME"])',
    '    keys_under_swapped_home = os.path.realpath(',
    '        str(L.keys_path())).startswith(home + os.sep)',
    // ⚠ A BOOLEAN, NEVER A VALUE. Nothing in this driver may print, compare or
    // carry a credential — presence is the whole of what is asserted.
    '    cloud_key_visible = any(',
    '        bool((os.environ.get(n) or "").strip())',
    '        for n in L.KEY_ENV_NAMES.values())',
    "    lib = Path(tmpdir.name) / 'library'",
    "    (lib / 'items').mkdir(parents=True)",
    '    store = study_lib.new_store(lib)',
    "    store['meta']['librarian_enabled'] = True",
    "    iid = 'e' * 16",
    "    (lib / 'items' / (iid + '.md')).write_text(",
    "        'a kept note about the loom', encoding='utf-8')",
    // 26.7-uat: the route windows a first session to the recent past —
    // the seed stamp rides one hour back so the pool is live.
    '    fresh_ms = int(time.time() * 1000) - 3600 * 1000',
    "    store['items'][iid] = {",
    "        'id': iid, 'content_hash': iid * 4, 'source': 'folder-drop',",
    "        'origin_path': '/src/loom/kept.md',",
    "        'library_path': 'items/' + iid + '.md', 'type': 'text',",
    "        'title': 'kept.md', 'created_ms': fresh_ms,",
    "        'saved_ms': fresh_ms, 'imported_ms': fresh_ms,",
    "        'last_opened_ms': None, 'state': 'blessed',",
    "        'resting_until_ms': None, 'tags': [], 'trigger': False,",
    "        'year': 2023, 'folder': 'loom', 'history': []}",
    '    study_lib.save_store(lib, store)',
    '    with server.LIBRARIAN_LOCK:',
    "        server.LIBRARIAN_JOB.update(state='idle', total=0, done=0,",
    '                                    cost_usd=0.0, auth=None,',
    '                                    message=None,',
    '                                    unknown_id_verdicts=0,',
    '                                    started_ms=0, stage=None,',
    '                                    rejected_drafts=0,',
    '                                    rejected_why=None)',
    // 26.93-07: the per-process program look-up is gone; the named no-op
    // stands where the reset stood, for the reason its docstring gives.
    '    smoke.no_cached_probe()',
    '    httpd = server.create_server(lib, 0)',
    '    port = httpd.server_address[1]',
    '    threading.Thread(target=httpd.serve_forever, daemon=True).start()',
    '    def req(method, path, body=None):',
    "        conn = http.client.HTTPConnection('127.0.0.1', port,",
    '                                          timeout=30)',
    '        try:',
    '            if body is not None:',
    '                conn.request(method, path,',
    '                             json.dumps(body, ensure_ascii=False)',
    "                             .encode('utf-8'),",
    "                             {'Content-Type': 'application/json'})",
    '            else:',
    '                conn.request(method, path)',
    '            r = conn.getresponse()',
    '            return r.status, json.loads(r.read())',
    '        finally:',
    '            conn.close()',
    '    def wait_done():',
    '        deadline = time.time() + 60',
    '        while time.time() < deadline:',
    "            s, snap = req('GET', '/api/librarian/progress')",
    "            if snap['state'] in ('done', 'error', 'paused', 'stopped'):",
    '                return snap',
    '            time.sleep(0.01)',
    "        raise SystemExit('job never finished')",
    "    status, data = req('POST', '/api/librarian/session',",
    "                       {'consent': True,",
    "                        'walk': {'blessed': [iid],",
    "                                 'why_wanted': [iid]}})",
    "    assert status == 200 and data.get('running') is True, data",
    '    snap = wait_done()',
    "    assert snap['state'] == 'done', snap",
    '    for text in texts:',
    "        status, data = req('POST', '/api/librarian/refine',",
    "                           {'text': text})",
    "        assert status == 200 and data.get('running') is True, data",
    '        snap = wait_done()',
    "        assert snap['state'] == 'done', snap",
    "    raw = (lib / 'librarian' / 'session.json').read_text(",
    "        encoding='utf-8')",
    '    sess = json.loads(raw)',
    "    rec = json.loads(Path(os.environ['FAKE_CLAUDE_LOG'])",
    "                     .read_text(encoding='utf-8'))",
    '    httpd.shutdown()',
    '    httpd.server_close()',
    "    print(json.dumps({'draft': sess['draft'],",
    "                      'coda_key_present': 'coda' in sess,",
    "                      'chat': sess['chat'], 'raw': raw,",
    "                      'whys': sess.get('whys'),",
    "                      'stdin': rec['stdin'],",
    "                      'had_auth': rec['had_auth'],",
    "                      'url': rec['url'],",
    "                      'hermetic': {'fills': fills,",
    "                                   'local_fill': list(L.LOCAL_FILL),",
    "                                   'keys_under_swapped_home':",
    '                                       keys_under_swapped_home,',
    "                                   'cloud_key_visible':",
    '                                       cloud_key_visible}},',
    '                     ensure_ascii=False))',
    'finally:',
    '    env.__exit__(None, None, None)',
    '    tmpdir.cleanup()'
  ].join('\n');

  const res = spawnSync('python3', ['-c', driver], {
    encoding: 'utf8',
    timeout: 120000,
    // ⚠ THE SHELL IS PASSED THROUGH UNSCRUBBED, ON PURPOSE. Popping the key
    // names here as well would make the child's `cloud_key_visible: false`
    // true whatever the seam did, and that boolean is the only evidence in
    // this file that the seam POPPED them. Handing the child a dirty shell and
    // watching it come back clean is the proof; scrubbing here would be a
    // second guard wearing the first one's evidence. Nothing is risked by it:
    // the seam's `assert_under_temp_root` and the transport install both run
    // at `__enter__`, and the fills assertion runs before the first request,
    // so a seam that failed raises before anything could be sent anywhere.
    env: Object.assign({}, process.env, {
      SR_FAKE_LOG: logPath,
      // 26.8-03: the whys rides FAKE_CLAUDE_REFLECTION (the echo
      // builder attaches its whys key) — one requested id, one
      // deliberately-unrequested id (the strip probe). Handed in as the
      // seam's `extra=` because the seam clears every stub toggle on entry.
      // ⚠ #68 ruling 1: a LIST of {id, reason} pairs, not a map — the map
      // spelling is the one Anthropic refuses outright, and it is what
      // killed the whole candle session on her own key.
      SR_WHYS_ENVELOPE: JSON.stringify({
        whys: [
          { id: WHY_IID, reason: WHY_TEXT },
          { id: UNREQ_ID,
            reason: 'uninvited — this id was never requested' }
        ]
      }),
      SR_REPO_ROOT: ROOT,
      SR_CHAT_TEXTS: JSON.stringify(TEXTS)
    })
  });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  assert.strictEqual(res.status, 0,
    '(7) the refine driver must exit clean — stderr: ' +
    String(res.stderr || '').slice(-2000));
  const lines = String(res.stdout || '').trim().split('\n');
  const out = JSON.parse(lines[lines.length - 1]);

  TEXTS.forEach(function (text, i) {
    // ⛔⛔ 26.995-12 (D-13) — THE MOVED ASSERTION, AND ITS TOMBSTONE.
    //
    // WHAT WAS HERE:
    //     assert.ok(out.coda.indexOf(text) !== -1,
    //       '(7) turn text #' + i + ' is named in the coda verbatim');
    //
    // WHY IT MOVED: the coda field carried the room's own NAMING of what
    // she added, under a fixed heading appended to the saved body by the
    // room's own code. Her ruling deleted the label and the field with it —
    // the librarian weaves what she added into the writing itself, so her
    // addition survives in HER words rather than as the room's summary.
    //
    // WHAT STILL HOLDS ABOVE: her turn survives verbatim into the REVISED
    // DRAFT, which is now the only place it survives — and therefore the
    // whole of the claim rather than half of it.
    //
    // WHAT STILL HOLDS BELOW: the same turn rides session.json's own text
    // and the recorded per-turn stdin, both unchanged, plus a NEW
    // assertion that the retired key reaches the session file nowhere.
    assert.ok(out.draft.indexOf(text) !== -1,
      '(7) turn text #' + i + ' survives into the revised draft as an ' +
      'exact raw substring — the WEAVING, which is where her words live ' +
      'now that no field names them separately (D-13)');
    assert.ok(out.raw.indexOf(text) !== -1,
      '(7) turn text #' + i + ' sits verbatim in session.json');
    assert.ok(out.stdin.indexOf(text) !== -1,
      '(7) turn text #' + i + ' rode the recorded per-turn stdin');
  });

  // the persisted transcript carries her exact lines, in order
  const userLines = out.chat.filter(function (t) {
    return t && t.who === 'user';
  }).map(function (t) { return t.text; });
  assert.deepStrictEqual(userLines, TEXTS,
    '(7) the persisted transcript holds her exact lines, in order');

  // NO normalization anywhere: the NFD accent stays DECOMPOSED — the
  // NFC-composed variant appears in none of the four surfaces (an NFC
  // step on any side would have put it there).
  // ⛔ 26.995-12 (D-13): this list named 'coda' between 'draft' and
  // 'raw'. The field is gone from the wire; 'draft' is where her bytes are,
  // and the no-normalization claim over it is unchanged.
  ['draft', 'raw', 'stdin'].forEach(function (k) {
    assert.ok(String(out[k]).indexOf(NFC_CAFE) === -1,
      '(7) no NFC-composed variant in ' + k +
      ' — nothing normalized her bytes');
    assert.ok(String(out[k]).indexOf(NFD_CAFE) !== -1,
      '(7) the NFD-decomposed form is present in ' + k +
      ' exactly as she typed it');
  });

  // ⛔⛔ 26.995-12 (D-13) — THE ASSERTION THAT CLOSES THE LOOP, BY VALUE.
  //
  // Three turns of hers went through a REAL server, a REAL generation and
  // three REAL refine turns. The retired field reaches the session file
  // nowhere, and the retired heading appears in none of the surfaces this
  // suite already holds — while every one of her turns is still found in
  // the draft above. Absence and survival asserted together: an absence
  // assertion alone would pass just as happily for a run that lost her
  // words entirely, which is the failure D-13 must never be allowed to
  // cause.
  assert.strictEqual(out.coda_key_present, false,
    '(7d) the retired coda key is not in session.json at all — after a ' +
    'generation and three refine turns, on a real server');
  ['draft', 'raw', 'stdin'].forEach(function (k) {
    assert.strictEqual(
      String(out[k]).indexOf('## from our conversation'), -1,
      '(7d) the retired labelled heading appears nowhere in ' + k +
      ' — the label is gone from what is written, not merely from what ' +
      'is shown');
  });

  // 8. WHYS ROUND-TRIP (26.8-03, D-10): the requested why survived
  // validation verbatim — still present after all three refine turns —
  // and the unrequested entry stripped fail-closed.
  assert.ok(out.whys && typeof out.whys === 'object',
    '(8) session.json carries the validated whys map beside the draft');
  assert.strictEqual(out.whys[WHY_IID], WHY_TEXT,
    '(8) the requested why survives validation VERBATIM into ' +
    'session.json, refine turns included');
  assert.ok(!(UNREQ_ID in out.whys),
    '(8) the unrequested whys entry is stripped fail-closed');
  assert.ok(out.raw.indexOf('uninvited — this id was never requested')
    === -1,
    '(8) the stripped why content persists NOWHERE in the session file');

  // 9. HERMETIC BY VALUE (26.93-07) — A NEW CLAIM UNDER A NEW NAME, because
  // nothing above it is worth anything if the four surfaces were filled by a
  // real provider answering on the owner's real key. The child reports what it
  // RESOLVED before it asked anything, and each fact is asserted by value here
  // rather than trusted to a comment.
  //
  // ⚠ The local fill's model id is read back from the child rather than
  // spelled here: `librarian_call.LOCAL_FILL` is the one place that tag lives,
  // and a copy of it in this file would be a second spelling that drifts
  // silently. The PROVIDER half is asserted literally, because "ollama" is the
  // whole of the claim — her own machine, no company, nothing to authenticate
  // with.
  assert.strictEqual(out.hermetic.local_fill[0], 'ollama',
    '(9) the local rung is her own machine');
  ['local', 'cheap-cloud', 'good-cloud'].forEach(function (tier) {
    assert.deepStrictEqual(out.hermetic.fills[tier], out.hermetic.local_fill,
      '(9) tier "' + tier + '" resolved to her own machine — with HOME ' +
      'swapped and both key names popped there is no cloud fill anywhere ' +
      'to reach, so no request in this run could be addressed to a company');
  });
  assert.strictEqual(out.hermetic.cloud_key_visible, false,
    '(9) neither cloud key name survived into the child — the seam popped ' +
    'them, and the shell it was handed was deliberately left dirty so that ' +
    'this boolean is evidence rather than a tautology');
  assert.strictEqual(out.hermetic.keys_under_swapped_home, true,
    '(9) the only keys file the child could reach is under its own temp ' +
    'home, never under the real one');
  assert.strictEqual(out.had_auth, false,
    '(9) the recorded request carried no credential — the local rung needs ' +
    'none, and none was attached');
  assert.ok(out.url.indexOf('127.0.0.1') !== -1,
    '(9) the recorded request was addressed to the loopback local rung, ' +
    'decided by RESOLVED ADDRESS and not by a provider name — got: ' +
    String(out.url));
})();

console.log('OK test_reflection_verbatim.cjs — verbatim body + Memoir-link ' +
  'non-resolution (Memoir/ prefix + bare-basename resolver + Returns paths) ' +
  '+ Change-A ## Related bare-basename leak sealed by default + chat-refine ' +
  'verbatim survival (ASCII/CJK/NFD end-to-end, no normalization) ' +
  '+ hermetic by value (every tier her own machine, no key visible, no ' +
  'credential on the recorded request)');
