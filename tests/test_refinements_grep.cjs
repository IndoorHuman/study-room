/*
 * tests/test_refinements_grep.cjs — the D-A count-free grep-gate
 * (Phase 26.8.1, plan 01).
 *
 * A text-level gate over app.js: the front-facing browse + session chrome
 * must NOT emit an exact "un-reviewed pile" count. Knowing the exact count
 * of un-reviewed things is a backlog / absence signal (law 3), so it is
 * removed from every browsed surface and replaced by ONE shared, count-free
 * constant — MORE_WAITING_COPY — rendered only when something is actually
 * waiting (n > 0). The exact number survives ONLY in Manage
 * (manageRailCount / manageStatCounts), which uses a "(N)" rail format and
 * never the pile-hint phrasing below; the Memoir/ vault-folder fence copy
 * never uses it either. The forbidden patterns are therefore self-scoping —
 * matching one anywhere in app.js is a D-A leak.
 *
 * The forbidden literal patterns live ONLY in this file's regex definitions
 * (never pasted into app.js prose, per the plan).
 *
 * Extended by plan 02 for D-B — a targeted front-facing "journal" surface
 * sweep over app.js AND index.html (Manage copy, room object, browse
 * panel), scoped so the preserved reflection-fence `Memoir/` folder
 * strings and the kept pure cores are never matched.
 *
 * Run contract (identical to the other suites): one OK line + exit 0 on
 * success; the offending pattern + line + exit 1 on failure.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(REPO, 'app.js'), 'utf8');

// The canonical count-free line (26.8.1 UI-SPEC § Copywriting Contract).
// Matched tolerant of JS quote-escaping (a raw ' or an escaped \').
const CANON =
  /There('|\\')s more still waiting, whenever you('|\\')d like\./;

// Forbidden front-facing pile-count phrasing. The distinctive tail
// "await(s) in the pile" appears ONLY in the album panel / album desk-
// station / session walk-close pile-hint copy — never in Manage counts,
// never in the Memoir/ vault-folder fence. A literal "N more photos/notes"
// is the same count in its expanded form. Either one on a browsed surface
// is the leak this gate forbids.
const FORBIDDEN = [
  {
    re: /awaits?\s+in\s+the\s+pile/i,
    why: 'an exact "N more ... await(s) in the pile" count on a ' +
      'front-facing browse/session surface (D-A / law 3)'
  },
  {
    re: /\b\d+\s+more\s+(?:photos?|notes?)\b/i,
    why: 'a literal "N more photos/notes" pile count on a browsed surface'
  }
];

function firstHit(re) {
  return firstHitIn(app, re);
}

// Same first-matching-line scan over an arbitrary source (D-B reads
// index.html too, not only app.js).
function firstHitIn(text, re) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) { return (i + 1) + ': ' + lines[i].trim(); }
  }
  return null;
}

let current = 'forbidden pile-count phrasing absent from browse+session chrome';
try {
  FORBIDDEN.forEach(function (f) {
    const hit = firstHit(f.re);
    assert.strictEqual(hit, null,
      'D-A grep-gate: app.js still emits ' + f.why +
      (hit ? ' — app.js:' + hit : ''));
  });

  current = 'MORE_WAITING_COPY constant declared';
  assert.ok(/(?:var|let|const)\s+MORE_WAITING_COPY\s*=/.test(app),
    'D-A grep-gate: the shared MORE_WAITING_COPY constant must be declared ' +
    'in app.js (one shared count-free line, one voice)');

  current = 'MORE_WAITING_COPY carries the canonical UI-SPEC value';
  assert.ok(CANON.test(app),
    'D-A grep-gate: MORE_WAITING_COPY must hold the canonical ' +
    'Copywriting-Contract value — "There\'s more still waiting, whenever ' +
    'you\'d like."');

  // ---- D-B: the front-facing "journal" surface sweep (26.8.1-02) ----------
  //
  // D-B retires the Phase-24 journal cleanly. No user-facing affordance or
  // copy may still say or open "journal": not the Manage consolidation
  // copy, not the browse panel. This is a TARGETED sweep of the
  // front-facing surfaces D-B removes — NOT a bare whole-file
  // 'journal' count. DELIBERATELY preserved and never matched here
  // (RESEARCH D-B Table 2/3): the reflection-fence `Memoir/` vault-folder
  // roster + fence strings, the vault-sync consent copy, the librarian
  // scope copy ("HR, medical, or your journal"), the blessingDayLabel /
  // notebook lineage comments, and the kept pure cores packMemoirToc /
  // pickMemoirItems. None of those match the patterns below.
  //
  // ⚠ PRESERVATION PIN — 26.9 (D-18/D-22, 2026-08-04) SPLIT this sweep.
  // The kept bans pass today and passed before 26.9 began; they cannot
  // go red from this phase doing nothing, and they must never be quoted as
  // evidence that the reading door was built.
  //
  // ⚠ COUNTING CORRECTION (26.91-04, 2026-08-07). The prose that stood here
  // stated a count of four against a real five: the roster below has held
  // FIVE kept entries since 26.8.1-02, and no one ever executed the stated
  // number. A stated count nobody ran, sitting in the comment of the very
  // removal pattern this phase inherits, is this repo's named defect class
  // in its purest form. The prose is corrected AND the count is now pinned
  // BY VALUE below, so the next drift fails instead of reading wrong.
  //
  // The split, restated correctly: FIVE KEPT, TWO INVERTED into DB_REQUIRED
  // by 26.9 D-18 and RE-INVERTED back into this roster by 26.91 D-06, ONE
  // ANCHORING FIX:
  //   * the function alternation kept openMemoir + renderMemoir (the
  //     BROWSE PANEL) and dropped paintMemoirPage (the STATION). It is
  //     anchored with \s*\( so `renderMemoir` cannot swallow
  //     `renderMemoirStation` by prefix. That anchoring is PRESERVED and
  //     re-verified by 26.91-04 rather than inherited on trust: with the
  //     station gone the two names no longer coexist, so the anchor is not
  //     load-bearing today — but a bare prefix would silently start
  //     swallowing again the moment any `renderMemoir*` name returns.
  //   * `class="room-label">journal<` STAYS BANNED. Under 26.9 route (A) it
  //     guarded the PRODUCT rule while the object existed; under 26.91 D-06
  //     the object is gone, so it is now a preservation pin — labelled as
  //     such rather than counted as evidence.
  current = 'no front-facing "journal" affordance or copy remains (D-B)';
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

  // Comment-stripped sources, LINE-COUNT PRESERVING so firstHitIn still
  // reports true line numbers. Used ONLY by the entries added or
  // re-inverted in 26.91-04: the five inherited bans keep scanning RAW
  // source exactly as they always have. A removal must never narrow an
  // existing guard to make room for its own addition.
  const appCode = app.split('\n')
    .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
    .join('\n');
  const htmlCode = html.replace(/<!--[\s\S]*?-->/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
  // DRIVE THE STRIPPERS. A stripper that ate live code would make every
  // 26.91-04 ban below pass on nothing — an instrument that cannot go red.
  assert.ok(/var ROOM_OBJECT_IDS/.test(appCode) &&
    !/26\.91-04 \(D-06, 2026-08-07\): 10 -> 9/.test(appCode),
    '26.91-04 grep-gate: the app.js comment stripper must remove comment ' +
    'text and keep live code — it did not');
  assert.ok(/data-cls=/.test(htmlCode) &&
    !/THE READING BOOK IS RETIRED/.test(htmlCode),
    '26.91-04 grep-gate: the index.html comment stripper must remove ' +
    'comment text and keep live markup — it did not');
  assert.strictEqual(appCode.split('\n').length, app.split('\n').length,
    '26.91-04 grep-gate: the app.js stripper changed the line count, so ' +
    'reported line numbers would be wrong');
  assert.strictEqual(htmlCode.split('\n').length, html.split('\n').length,
    '26.91-04 grep-gate: the index.html stripper changed the line count');

  const DB_FORBIDDEN = [
    // ---- the five KEPT since 26.8.1-02 D-B, over RAW source ----
    { src: 'app.js', text: app, re: /notes into a journal/i,
      why: 'the Manage consolidation copy still names a journal — front-' +
        'facing Manage text must not name a removed surface (Pitfall 4)' },
    { src: 'app.js', text: app,
      re: /function\s+(?:openMemoir|renderMemoir)\s*\(/,
      why: 'app.js still defines a journal BROWSE surface ' +
        '(openMemoir / renderMemoir) — the browse panel stays retired' },
    { src: 'index.html', text: html, re: /into a journal/i,
      why: 'a front-facing setup/consolidation question in index.html ' +
        'still names a journal (the notes-consolidation surface D-B removed)' },
    { src: 'index.html', text: html, re: /id=["']screen-journal["']/,
      why: 'the journal browse panel survives in index.html' },
    { src: 'index.html', text: html, re: /class="room-label">journal</,
      why: 'the journal room label survives in index.html — a preservation ' +
        'pin since 26.91 D-06 retired the object that wore any label at all' },
    // ---- the two RE-INVERTED by 26.91-04 (D-06, 2026-08-07) ----
    //
    // THE FULL ARC, stated rather than erased: 26.8.1-02 D-B BANNED these
    // two; 26.9 D-18 INVERTED them into DB_REQUIRED because the reading
    // door had to exist; 26.91 D-06 RE-INVERTS them to bans because the
    // owner retired the reading book ("it is too much for me to read and I
    // feel the easier the better"). Same two assertion sites, third
    // direction, nothing deleted — the record of what was decided when is
    // the reason these entries exist at all.
    //
    // Comment-stripped, because app.js's and index.html's own 26.91-04
    // retirement notes discuss this object and a raw scan of a ban written
    // for a removal is self-invalidating.
    { src: 'app.js', text: appCode,
      re: /openStation\(\s*['"]journal['"]\s*\)/,
      why: "app.js still opens the reading-door station " +
        "(openStation('journal')) — 26.9 D-18 REQUIRED this; 26.91 D-06 " +
        'BANS it' },
    { src: 'index.html', text: htmlCode, re: /id=["']room-obj-journal["']/,
      why: 'the reading book still exists as a room object in index.html ' +
        '— 26.9 D-18 REQUIRED this; 26.91 D-06 BANS it' }
  ];
  // BY VALUE. The roster is consumed by a bare .forEach, so before this pin
  // a dropped entry dropped a ban with nothing going red — which is exactly
  // how the miscount above survived for two phases.
  assert.strictEqual(DB_FORBIDDEN.length, 7,
    'D-B grep-gate: the DB_FORBIDDEN roster holds ' + DB_FORBIDDEN.length +
    ' entries — pinned BY VALUE at 7 (the five kept since 26.8.1-02 plus ' +
    'the two 26.91-04 re-inverted from DB_REQUIRED). Counting convention: ' +
    'one entry per regex, across both source files. The prose above this ' +
    'roster previously stated a count of four against a real five, which ' +
    'is why the number is now executed instead of asserted in a comment.');
  DB_FORBIDDEN.forEach(function (f) {
    const hit = firstHitIn(f.text, f.re);
    assert.strictEqual(hit, null,
      'D-B grep-gate: ' + f.why + (hit ? ' — ' + f.src + ':' + hit : ''));
  });

  // ---- 26.91-04 (D-06): the two RETIRED COPY LITERALS + a positive control
  //
  // The reading door's two provenance headings were the only strings that
  // named it in rendered copy. They are banned from app.js as EXACT
  // literals, case-sensitively, over comment-stripped source.
  //
  // ⚠ THE BAN IS ON THE EXACT LITERALS AND NEVER ON THE PHRASE `set out`.
  // This is not hypothetical. VERIFIED IN SOURCE 2026-08-07: app.js's LIVE
  // code already says `set out for you` TWICE — the librarian's shipped
  // suggestion copy — and plan 05 adds a third in the ask reply. A ban
  // broadened to `set out` would therefore fail SHIPPED, CORRECT code
  // today, not merely a future feature. That is the worst shape a removal
  // gate can take: a check written for a removed surface failing a working
  // one.
  //
  // ORDERING IS LOAD-BEARING. The positive control runs FIRST. `assert`
  // throws on the first failure, so with the bans first a broadened ban
  // would fire on the BAN's message and the control would never execute —
  // a structurally unreachable assertion, this repo's named defect class.
  // Driven: with the control first, broadening a ban to `set out` fails
  // HERE, on the assertion that names the actual danger.
  current = 'the retired reading-door copy bans are not over-broad (26.91)';
  const RETIRED_COPY = ['the librarian set these out', 'new in the room'];
  assert.strictEqual(RETIRED_COPY.length, 2,
    '26.91-04 grep-gate: the retired-copy roster is pinned BY VALUE at 2');

  // THE POSITIVE CONTROL, first. Two halves:
  //   (a) the shipped near-miss really is in app.js's live code — so this
  //       control is a LIVE regression guard, not a fixture-only argument;
  //   (b) no retired literal is a substring of it.
  const ALLOWED = 'set out for you';
  const allowedHits = appCode.split(ALLOWED).length - 1;
  assert.ok(allowedHits >= 2,
    '26.91-04 grep-gate: app.js live code contains ' + allowedHits +
    ' occurrences of the ALLOWED near-miss ' + JSON.stringify(ALLOWED) +
    ' — at least 2 are expected (the librarian\'s shipped suggestion copy). ' +
    'If this dropped to 0 the positive control below would still pass while ' +
    'proving nothing about real code.');
  assert.ok(ALLOWED.indexOf('set out') !== -1,
    '26.91-04 grep-gate: the positive control no longer contains `set out` ' +
    '— it can no longer detect an over-broad ban, which is its only job');
  RETIRED_COPY.forEach(function (lit) {
    assert.strictEqual(ALLOWED.indexOf(lit), -1,
      '26.91-04 grep-gate: the ban on ' + JSON.stringify(lit) + ' matches ' +
      'the ALLOWED near-miss ' + JSON.stringify(ALLOWED) + ', which app.js ' +
      'ships in live code TODAY — the ban has been broadened past its ' +
      'exact literal and now fails correct, working copy');
  });

  current = 'the retired reading-door copy literals are gone (26.91 D-06)';
  RETIRED_COPY.forEach(function (lit) {
    // the matcher is DRIVEN: it must find the literal in a fixture that
    // contains it, or the ban below is structurally unable to go red.
    assert.ok(('x ' + lit + ' y').indexOf(lit) !== -1,
      '26.91-04 grep-gate: the exact-literal matcher for ' +
      JSON.stringify(lit) + ' cannot match a fixture that contains it');
    assert.strictEqual(appCode.indexOf(lit), -1,
      '26.91-04 grep-gate: app.js still carries the retired reading-door ' +
      'copy ' + JSON.stringify(lit) + ' in live code — the surface that ' +
      'rendered it was removed by D-06');
  });

  console.log('test_refinements_grep OK (D-A count-free browse+session ' +
    'chrome; D-B browse panel absent; 26.91-04 D-06 reading door retired ' +
    '— 7 bans pinned by value, 2 retired copy literals, 1 positive control)');
  process.exit(0);
} catch (e) {
  console.error('test_refinements_grep FAILED at ' + current);
  console.error('  ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
}
