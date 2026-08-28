/*
 * tests/test_reflection_shelf.cjs — the reflections-only shelf model gate
 * (Plan 26.4-08, Task 1).
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * Proves the D-27 redefinition of the bookshelf: the ROOM shelf renders one
 * spine per ALLOWED reflection (a books.json record with kind:"reflection"),
 * and NOTHING else. The three deterministic observation books (never-opened
 * / themes / seasons) are cut from the shelf; a parked connection-book never
 * becomes a spine; an allowed reflection later fenced/never/retired renders
 * nothing (the law-5 belt).
 *
 * buildReflectionShelf(itemsMap, filters, books) is a PURE function inside
 * app.js. app.js is a browser IIFE that touches `document` at load, so it
 * can't be require()'d under node; this suite lifts the one pure function by
 * brace-matching its source and evaluates it with StudyCore injected — the
 * repo's text-extraction idiom (mirrors the source-text gates in
 * test_surface_wiring.cjs). The function is thereby "exported for the test"
 * without loading the whole browser bundle.
 *
 * Behaviors covered:
 *   1. KIND FILTER — a books list mixing kind:"reflection", kind:"connection"
 *      and one legacy no-kind record yields spines ONLY for the reflections.
 *   2. LAW-5 BELT — a reflection whose item is missing, OR whose item fails
 *      StudyCore.guardSurface (never_show / retired / fenced → non-null),
 *      yields NO spine.
 *   3. EMPTY — zero reflection books → an empty list (the shelf is simply
 *      empty; there is no popup and no count).
 *   4. TITLE — the spine title comes from the book; it falls back to the
 *      item's title when the book carries none.
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
    "buildReflectionShelf must be defined in app.js (the reflections-only " +
    "shelf model) — not found");
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, 'buildReflectionShelf braces must balance');
  return src.slice(start, i);
}

// Build the pure function with a stubbed StudyCore in scope. The stub's
// guardSurface returns null for a clean item and a short reason string for a
// fenced one — exactly the shipped guardSurface contract (core.js:195).
function loadShelf(guardSurface) {
  const fnSrc = extractFn(appSrc, 'buildReflectionShelf');
  // eslint-disable-next-line no-new-func
  const factory = new Function('StudyCore',
    fnSrc + '\nreturn buildReflectionShelf;');
  return factory({ guardSurface: guardSurface });
}

// A guardSurface stub that fences exactly the ids in `fenced` (returns a
// reason), and clears everything else (returns null) — a missing item is the
// function's own concern, never reaches the guard.
function guardExcept(fenced) {
  return function (item, _filters) {
    if (!item) { return 'missing'; }
    if (fenced.indexOf(item.id) !== -1) { return 'never_show'; }
    return null;
  };
}

// ---- 1. KIND FILTER --------------------------------------------------------

(function () {
  const items = {
    r1: { id: 'r1', title: 'a reflection', state: 'blessed' },
    r2: { id: 'r2', title: 'another reflection', state: 'blessed' },
    c1: { id: 'c1', title: 'a connection', state: 'blessed' },
    x1: { id: 'x1', title: 'a legacy book', state: 'blessed' }
  };
  const books = [
    { id: 'r1', kind: 'reflection', title: 'a reflection' },
    { id: 'c1', kind: 'connection', title: 'a connection' },
    { id: 'r2', kind: 'reflection', title: 'another reflection' },
    { id: 'x1', title: 'a legacy book' } // no kind → treated as connection
  ];
  const shelf = loadShelf(guardExcept([]))(items, [], books);
  const ids = shelf.map(function (s) { return s.id; });
  assert.deepStrictEqual(ids, ['r1', 'r2'],
    '(1) only kind:"reflection" books become spines — connection + legacy ' +
    'no-kind are excluded, in book order');
  shelf.forEach(function (s) {
    assert.strictEqual(s.kind, 'reflection',
      '(1) every spine is a reflection');
  });
})();

// ---- 2. LAW-5 BELT ---------------------------------------------------------

(function () {
  const items = {
    r1: { id: 'r1', title: 'clean reflection', state: 'blessed' },
    r2: { id: 'r2', title: 'later fenced', state: 'never_show' }
    // r3's item is intentionally absent from the store
  };
  const books = [
    { id: 'r1', kind: 'reflection', title: 'clean reflection' },
    { id: 'r2', kind: 'reflection', title: 'later fenced' },
    { id: 'r3', kind: 'reflection', title: 'orphaned reflection' }
  ];
  const shelf = loadShelf(guardExcept(['r2']))(items, [], books);
  const ids = shelf.map(function (s) { return s.id; });
  assert.deepStrictEqual(ids, ['r1'],
    '(2) a reflection whose item is missing (r3) OR guarded non-null (r2 — ' +
    'fenced/never/retired) renders NO spine (the law-5 belt)');
})();

// ---- 3. EMPTY --------------------------------------------------------------

(function () {
  // No books at all.
  assert.deepStrictEqual(loadShelf(guardExcept([]))({}, [], []), [],
    '(3a) zero books → an empty shelf');
  // Books present, but none are reflections.
  const items = { c1: { id: 'c1', title: 'c', state: 'blessed' } };
  const books = [{ id: 'c1', kind: 'connection', title: 'c' }];
  assert.deepStrictEqual(loadShelf(guardExcept([]))(items, [], books), [],
    '(3b) only connection books → still an empty shelf (no popup, no count)');
  // Defensive: null books argument must not throw.
  assert.deepStrictEqual(loadShelf(guardExcept([]))({}, [], null), [],
    '(3c) a null books argument fails safe to empty');
})();

// ---- 4. TITLE --------------------------------------------------------------

(function () {
  const items = {
    r1: { id: 'r1', title: 'the item title', state: 'blessed' },
    r2: { id: 'r2', title: 'the item title 2', state: 'blessed' }
  };
  const books = [
    { id: 'r1', kind: 'reflection', title: 'the book title' },
    { id: 'r2', kind: 'reflection' } // no title on the book → fall back
  ];
  const shelf = loadShelf(guardExcept([]))(items, [], books);
  assert.strictEqual(shelf[0].title, 'the book title',
    "(4) the spine title comes from the book when present");
  assert.strictEqual(shelf[1].title, 'the item title 2',
    "(4) the spine title falls back to the item's title");
})();

// ---- 5. IN-SHELF AUTO-PACK (packSpineSlots) --------------------------------
//
// 26.4-08 UAT (the owner): the auto-pack default fills the FOUR bookshelf
// recesses, top row first, left→right, wrapping down — NOT the top surface
// (the candle's home). packSpineSlots is a pure function; lift it with the
// shipped SCENE + spine + shelf constants injected and assert the geometry.

// The shipped scene contract (app.js SCENE + SPINE_W/SPINE_H + SHELF_*). Mirror
// them here so the packing LOGIC is asserted independently of the DOM.
const SCENE_FIXTURE = {
  floorY: 168, ceilingY: 24, grid: 12,
  // 26.5-06 (SC-3): the bench cushion top joined as APPENDED index [2];
  // entries [0]/[1] byte-unchanged (Pitfall 3) — a DELIBERATE fixture
  // change mirroring the shipped three-entry surfaces verbatim.
  surfaces: [{ x0: 16, x1: 88, y: 56 }, { x0: 216, x1: 336, y: 116 },
    { x0: 124, x1: 212, y: 152 }]
};
// The four shelf BOARD lines a book bottoms out on (derived: bookshelf top
// surface y=56, base on floorY=168 → scale 2; recess tops [2,15,28,41] + 12
// board rows, ×2, +56). A book's slot.y + slot.h must equal one of these.
const BOARD_LINES = [84, 110, 136, 162];
// The interior x span (sprite interior [2..34] → room 20..84).
const INTERIOR_X0 = 20;
const INTERIOR_X1 = 84;
// A book packed onto the TOP surface would bottom at y=56 — the OLD (wrong)
// behavior we must never regress to.
const TOP_SURFACE_Y = SCENE_FIXTURE.surfaces[0].y; // 56

// The shipped reflection-book sprite variants (gen_reflection_books /
// REFLECT_BOOK_H): 12px-wide pixel books, per-variant on-screen heights.
const REFLECT_BOOK_H = [24, 20, 22, 18, 24, 20];
const REFLECT_BOOK_W = 12;
// The grid columns inside the interior — pitch 12 (= the book width), so narrow
// spines pack TIGHT edge-to-edge (no gaps): five books per shelf.
const GRID_COLS = [24, 36, 48, 60, 72];

// Lift the shared shelfBoardYs helper with the fixture scene injected.
function loadBoards() {
  const fnSrc = extractFn(appSrc, 'shelfBoardYs');
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'SCENE', 'SHELF_SPRITE_H', 'SHELF_RECESS_Y', 'SHELF_RECESS_H',
    fnSrc + '\nreturn shelfBoardYs;');
  return factory(SCENE_FIXTURE, 56, [2, 15, 28, 41], 12);
}

// Lift shelfGridCols (needs the scene, shelf interior consts, and book width).
function loadCols() {
  const fnSrc = extractFn(appSrc, 'shelfGridCols');
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'SCENE', 'SHELF_SPRITE_H', 'SHELF_INTERIOR_X0', 'SHELF_INTERIOR_X1',
    'REFLECT_BOOK_W',
    fnSrc + '\nreturn shelfGridCols;');
  return factory(SCENE_FIXTURE, 56, 2, 34, REFLECT_BOOK_W);
}

// Lift bookVariant (deterministic id → variant index).
function loadVariant() {
  const fnSrc = extractFn(appSrc, 'bookVariant');
  // eslint-disable-next-line no-new-func
  const factory = new Function('REFLECT_BOOK_H',
    fnSrc + '\nreturn bookVariant;');
  return factory(REFLECT_BOOK_H);
}

function loadPacker() {
  const fnSrc = extractFn(appSrc, 'packSpineSlots');
  // packSpineSlots calls shelfBoardYs / shelfGridCols / bookVariant and reads
  // REFLECT_BOOK_* — inject the lifted helpers + constants.
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'shelfBoardYs', 'shelfGridCols', 'bookVariant', 'REFLECT_BOOK_H',
    'REFLECT_BOOK_W',
    fnSrc + '\nreturn packSpineSlots;');
  return factory(loadBoards(), loadCols(), loadVariant(), REFLECT_BOOK_H,
    REFLECT_BOOK_W);
}

// A list of {id} books.
function books(n) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ id: 'r' + i }); }
  return out;
}
// A slot's unique key = its column x AND the board it bottoms on (y+h). Two
// books sharing a key would overlap — the thing this pack must prevent.
function slotKey(s) { return s.x + '@' + (s.y + s.h); }

(function () {
  const packSpineSlots = loadPacker();
  const bookVariant = loadVariant();

  // Grid geometry sanity (matches the shipped scene).
  assert.deepStrictEqual(loadBoards()(), BOARD_LINES,
    '(5) four shelf boards [84,110,136,162]');
  assert.deepStrictEqual(loadCols()(), GRID_COLS,
    '(5) five grid columns [24,36,48,60,72] inside the interior');

  // Empty + single.
  assert.deepStrictEqual(packSpineSlots([]), [],
    '(5) zero books → zero slots (law 3: an empty shelf is silent)');
  assert.deepStrictEqual(packSpineSlots(null), [],
    '(5) a null list fails safe to empty');
  const one = packSpineSlots(books(1));
  assert.strictEqual(one.length, 1, '(5) one book → one slot');
  assert.strictEqual(one[0].y + one[0].h, BOARD_LINES[0],
    '(5) the first book BOTTOMS on the TOP shelf board, not the surface');
  assert.strictEqual(one[0].x, GRID_COLS[0],
    '(5) the first book takes the first grid column');
  assert.notStrictEqual(one[0].y + one[0].h, TOP_SURFACE_Y,
    '(5) a book must NOT sit on the bookshelf top (the candle lives there)');

  // Deterministic by id.
  assert.deepStrictEqual(packSpineSlots(books(6)), packSpineSlots(books(6)),
    '(5) packing is deterministic by id (stable across re-pulls)');

  // A full fill (8 slots = 2 cols × 4 boards) — every book is a real pixel-book
  // variant, and NO two books overlap (each holds its own grid slot).
  const many = packSpineSlots(books(8));
  const seen = {};
  many.forEach(function (slot, i) {
    assert.ok(BOARD_LINES.indexOf(slot.y + slot.h) !== -1,
      '(5) book ' + i + ' bottoms on a shelf board — got y+h=' +
      (slot.y + slot.h));
    assert.notStrictEqual(slot.y + slot.h, TOP_SURFACE_Y,
      '(5) no book sits on the top surface, book ' + i);
    assert.strictEqual(slot.w, REFLECT_BOOK_W,
      '(5) every book is one grid column wide');
    assert.ok(slot.variant >= 0 && slot.variant < REFLECT_BOOK_H.length,
      '(5) book ' + i + ' has a real sprite variant, got ' + slot.variant);
    assert.strictEqual(slot.h, REFLECT_BOOK_H[slot.variant],
      '(5) book height matches its sprite variant');
    assert.ok(GRID_COLS.indexOf(slot.x) !== -1,
      '(5) book ' + i + ' sits on a grid column');
    // THE OVERLAP GUARANTEE: no two books share a slot.
    const key = slotKey(slot);
    assert.ok(!seen[key],
      '(5) OVERLAP: book ' + i + ' shares a slot with another (' + key + ')');
    seen[key] = true;
  });

  // Sprite variants actually vary across the shelf.
  assert.ok(new Set(many.map(function (s) { return s.variant; })).size > 1,
    '(5) book sprite variants vary');

  // TOP SHELF FILLS FIRST: the first five (one per column) bottom on board 0.
  for (let i = 0; i < GRID_COLS.length; i++) {
    assert.strictEqual(many[i].y + many[i].h, BOARD_LINES[0],
      '(5) the top shelf fills first — book ' + i + ' is on the top board');
  }
  assert.strictEqual(many[GRID_COLS.length].y + many[GRID_COLS.length].h,
    BOARD_LINES[1],
    '(5) the pack wraps DOWN to the second board only after the top fills');
})();

// ---- 5b. STORED (DRAGGED) BOOKS REFLOW WITHOUT OVERLAP ----------------------

(function () {
  const packSpineSlots = loadPacker();
  const bookVariant = loadVariant();

  // Three books; drag book 'r1' onto the SECOND column of the top shelf.
  const list = books(3);
  const vh = REFLECT_BOOK_H[bookVariant('r1')];
  const stored = { r1: { x: GRID_COLS[1], y: BOARD_LINES[0] - vh } };
  const out = packSpineSlots(list, stored);

  // r1 (index 1) lands exactly on the slot it was dropped on.
  assert.strictEqual(out[1].x, GRID_COLS[1],
    '(5b) a dragged book keeps the column it was dropped on');
  assert.strictEqual(out[1].y + out[1].h, BOARD_LINES[0],
    '(5b) a dragged book keeps the shelf row it was dropped on');

  // The other two reflow around it — every book in its own slot, no overlap.
  const keys = out.map(slotKey);
  assert.strictEqual(new Set(keys).size, keys.length,
    '(5b) after a drag, no two books overlap (each in its own slot)');
  assert.ok(keys.indexOf(GRID_COLS[1] + '@' + BOARD_LINES[0]) !== -1,
    '(5b) the dropped slot is occupied by exactly the dragged book');

  // Two books dragged onto the SAME slot must NOT stack — the second nudges to
  // a different free slot.
  const two = packSpineSlots(books(2), {
    r0: { x: GRID_COLS[0], y: BOARD_LINES[0] - REFLECT_BOOK_H[bookVariant('r0')] },
    r1: { x: GRID_COLS[0], y: BOARD_LINES[0] - REFLECT_BOOK_H[bookVariant('r1')] }
  });
  assert.notStrictEqual(slotKey(two[0]), slotKey(two[1]),
    '(5b) two books dropped on the same slot never overlap — one nudges away');
})();

// ---- 6. WIRING: renderReflectionSpines + live-populate (source gates) -------
//
// These are text gates on app.js (the source-extraction idiom): the DOM paths
// touch `document`, so we assert the wiring survives rather than executing it.

(function () {
  const render = extractFn(appSrc, 'renderReflectionSpines');
  // render packs the whole shelf LIST WITH the stored map, so books reflow
  // into their own slots (overlap-free) with dragged books honoured.
  assert.ok(
    /packSpineSlots\s*\(\s*SHELF_REFLECT\.list\s*,\s*LAYOUT\.books\s*\)/
      .test(render),
    '(6) render packs the shelf LIST with stored LAYOUT.books (reflow)');
  assert.ok(!/snapY\(\s*'surface'/.test(render),
    '(6) the pack no longer snaps spines onto the bookshelf TOP surface');
  // the book is a pixel SPRITE (variant by id), not a CSS colour block.
  assert.ok(/createElement\(['"]img['"]\)/.test(render) &&
    /reflection-book-['"]?\s*\+\s*slot\.variant/.test(render),
    '(6) each book renders its reflection-book sprite variant as an <img> ' +
    '(matching the desk/decor books)');
  assert.ok(!/slot\.color/.test(render) && !/\.background\s*=/.test(render),
    '(6) no CSS colour block — the sprite carries the colour');
  // per-book slot width/height still drive the hotspot size.
  assert.ok(/slot\.w/.test(render) && /slot\.h/.test(render),
    '(6) the hotspot takes its width/height from the pack slot');
  // 26.4-10 (Change C): the spine carries a readable title label built with
  // textContent (no HTML sink), and the click still opens the spine.
  assert.ok(/className\s*=\s*'spine-label'/.test(render) &&
    /label\.textContent\s*=\s*book\.title/.test(render),
    '(6) the spine builds a .spine-label from the title via textContent (no ' +
    'HTML sink) so it is readable on hover/focus');
  assert.ok(/openReflectionSpine\(book\.id\)/.test(render),
    '(6) the spine still opens on click (label is not the click target)');
})();

// ---- 6a. REFLOW ON DROP (drag core) ----------------------------------------

(function () {
  // a dropped reflection book re-renders the shelf so the others reflow around
  // it (overlap-free), guarded on data-book-id so normal objects are untouched.
  const drag = extractFn(appSrc, 'attachDesignDrag');
  assert.ok(/data-book-id[\s\S]*renderReflectionSpines\s*\(/.test(drag),
    '(6a) dropping a reflection book reflows the shelf ' +
    '(renderReflectionSpines) so books never overlap');
})();

// ---- 6b. Change C CSS: the label is revealed on hover/focus, not clickable --

(function () {
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'tokens.css'), 'utf8');
  assert.ok(/\.reflection-spine \.spine-label\s*\{[\s\S]*?pointer-events:\s*none/
    .test(css),
    '(6b) .spine-label is pointer-events:none so the spine stays the target');
  assert.ok(/\.spine-label\s*\{[\s\S]*?display:\s*none/.test(css) &&
    /:hover \.spine-label[\s\S]*?display:\s*block/.test(css),
    '(6b) the label is hidden at rest and revealed on hover/focus');
})();

// ---- 7. WIRING: allowReflection live-populate (Fix 3, source gate) ----------

(function () {
  // allowReflection live-refreshes the in-room shelf on a successful promote,
  // guarded so it fails open when the room scene is not mounted.
  const allow = extractFn(appSrc, 'allowReflection');
  assert.ok(/loadReflectionShelf\s*\(/.test(allow),
    '(7) allowReflection live-refreshes the shelf (loadReflectionShelf) so ' +
    'the new spine appears on Approve without a bookshelf click');
  assert.ok(/room-scene-el/.test(allow),
    '(7) the live shelf refresh is guarded on the room scene being mounted ' +
    '(fail open in Manage)');
})();

// ---- 8. DRAG SNAPS TO SHELF ROWS (not the bookshelf top) -------------------
//
// 26.4-10 UAT (the owner): dragging a reflection book must keep it INSIDE the
// bookshelf — snapping to the nearest shelf ROW — never onto the top surface
// where the candle lives. shelfBoardYs is the shared board geometry both the
// auto-pack and the drag snap read; assert it, then gate the wiring.

(function () {
  const shelfBoardYs = loadBoards();
  assert.deepStrictEqual(shelfBoardYs(), BOARD_LINES,
    '(8) shelfBoardYs derives the four shelf boards [84,110,136,162]');
  // none of the boards is the bookshelf TOP surface (56) — books never bottom
  // where the candle sits.
  shelfBoardYs().forEach(function (b) {
    assert.notStrictEqual(b, TOP_SURFACE_Y,
      '(8) a shelf board is never the bookshelf top surface');
  });

  // snapY has a 'shelf' branch that snaps a book's bottom to a board.
  const snapY = extractFn(appSrc, 'snapY');
  assert.ok(/cls === 'shelf'/.test(snapY),
    "(8) snapY handles the 'shelf' class (books snap to a shelf row)");
  assert.ok(/shelfBoardYs\s*\(/.test(snapY),
    '(8) the shelf snap uses the shared board geometry');
  assert.ok(!/return\s*\(best !== null \? best : SCENE\.floorY\) - h;[\s\S]*cls === 'shelf'/
    .test(snapY),
    '(8) the shelf branch precedes the surface branch (books never reach ' +
    'the top-surface snap)');

  // renderReflectionSpines tags spines data-cls="shelf" (so the drag core
  // routes them to the shelf snap), and the drag core clamps their x to the
  // interior.
  const render = extractFn(appSrc, 'renderReflectionSpines');
  assert.ok(/data-cls['"]?\s*,\s*['"]shelf['"]/.test(render),
    '(8) spines are tagged data-cls="shelf" (not "surface")');
  assert.ok(!/data-cls['"]?\s*,\s*['"]surface['"]/.test(render),
    '(8) spines no longer snap to the bookshelf top surface on drag');
  assert.ok(/clampShelfX\s*\(/.test(appSrc),
    '(8) a dragged book is clamped into the shelf interior horizontally');
})();

console.log('OK test_reflection_shelf.cjs — kind filter + law-5 belt + ' +
  'empty + title fallback + pixel-book fill + live-populate + shelf-row drag');
