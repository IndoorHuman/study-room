/*
 * tests/test_design_release_snap.cjs — the F12 release-snap seam
 * (26.5-09 UAT, the owner: "drag feels static, point A to B").
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * The 2026-07-18 design-mode amendment's LOCKED 12px law binds the
 * RESTING position, not the ride: from F12 the drag preview follows the
 * raw pointer freely and the snap pipeline runs ONCE, at release,
 * through releaseSnap(cls, nx, ny, w, h). This suite lifts that seam —
 * with the exact SCENE geometry + shelf constants + snap functions it
 * rides on — straight out of app.js (the repo's brace-matching
 * text-extraction idiom; app.js is a browser IIFE and can't be
 * require()'d) and drives it per class.
 *
 * Behaviors covered:
 *   1. GRID X — released x rides the 12px grid, clamped inside the room
 *      ([0 .. largest fitting grid step]); shelf spines additionally
 *      clamp into the bookshelf recess interior.
 *   2. SEATING (the penetration clamp) — a released rect never floats
 *      just above nor sinks into its resting plane:
 *      floor → bottom FLUSH on floorY; surface → bottom FLUSH on the
 *      surface under center-x (else the floor); shelf → bottom FLUSH on
 *      the nearest board; a release point past the floor resolves
 *      upward to seated-on-top, never below.
 *   3. FLOORWALL (the F9 bench) — released within the near-floor band
 *      it SEATS on the floor; released higher it wall-floats (BY
 *      DESIGN), whole-px, clamped inside [ceilingY, floorY - h].
 *   4. WALL/CEILING — unchanged: wall free-Y rounds + clamps inside
 *      [ceilingY, floorY - h]; ceiling pins to ceilingY.
 *   5. FREE-FOLLOW STRUCTURE — attachDesignDrag's onMove carries NO
 *      snap call (no snapY/gridClampX/clampShelfX mid-drag: the preview
 *      is free), and its onUp seats through releaseSnap before
 *      recording/posting — nothing unsnapped is ever persisted (W-3).
 *   6. SURFACE FOLLOW (26.5-09 UAT F14) — surfaceSpanFor reproduces the
 *      shipped literals from the shipped default positions (bookshelf/
 *      bench flush at row 0, desk slab +4 — the 116-vs-112 lesson), and
 *      after a simulated bench move the runtime span follows: a release
 *      over the moved span seats ON it, where the stale shipped span
 *      would have seated at the old spot (the exact F14 bug, pinned).
 *      syncSurfacesToLayout mutates the shipped entries IN PLACE (never
 *      reassigns SCENE.surfaces — the geometry suite's source pins
 *      stand) and is wired at the landing, the release, the nudge, and
 *      the undo/redo snapshot path.
 *   7. SEATED Z (F14) — seatedOnSurface is true exactly when a rect's
 *      bottom rests on a live span with center-x inside it; syncSeatedZ
 *      assigns seated surface-class items z '1' (hosts stay z auto —
 *      level 0 — so seated ALWAYS exceeds its host) and clears the rest;
 *      onUp re-runs it after releaseSnap on BOTH paths; the scene
 *      isolates its z ladder and the tint rides above it (tokens.css).
 *   8. NOTEBOOK ROSTERS + ROUND-TRIP (26.8-05, D-15 / Pitfall 7) — the
 *      blessings notebook is registered on BOTH layers: client
 *      ROOM_OBJECT_IDS + FUNCTIONAL_IDS (move-but-not-remove posture)
 *      and server LAYOUT_OBJECTS as (28, 22, "surface") — NOT in
 *      FUNCTIONAL_OBJECTS (server-side removable, the candle model).
 *      Its shipped default seats on the desk, a design release seats it
 *      through the shared snap pipeline, and validate_layout (driven
 *      functionally via a python one-shot) accepts a notebook placement
 *      + a notebook removal while still refusing unknown objects and
 *      functional-object removals.
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

// Lift a `var NAME = { ... };` object declaration by brace-matching.
function extractObjVar(src, name) {
  const sig = 'var ' + name + ' = {';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1,
    name + ' must be declared in app.js — not found');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i) + ';';
}

// Lift a single-line `var NAME = <literal>;` declaration.
function extractLineVar(src, name) {
  const m = src.match(new RegExp('var ' + name + ' = [^;\\n]*;'));
  assert.ok(m, name + ' must be declared in app.js — not found');
  return m[0];
}

// Compose the seam EXACTLY as app.js ships it: the scene geometry, the
// shelf constants, and the snap functions releaseSnap calls through.
// The composition injects NOTHING else — a stray free variable in any
// of them is itself a failure (purity over SCENE by construction).
const seamSrc = [
  extractObjVar(appSrc, 'SCENE'),
  extractLineVar(appSrc, 'SHELF_SPRITE_H'),
  extractLineVar(appSrc, 'SHELF_RECESS_Y'),
  extractLineVar(appSrc, 'SHELF_RECESS_H'),
  extractLineVar(appSrc, 'SHELF_INTERIOR_X0'),
  extractLineVar(appSrc, 'SHELF_INTERIOR_X1'),
  extractLineVar(appSrc, 'SURFACE_HOSTS'),
  extractLineVar(appSrc, 'SURFACE_TOP_OFFSET'),
  extractFn(appSrc, 'shelfBoardYs'),
  extractFn(appSrc, 'clampShelfX'),
  extractFn(appSrc, 'gridClampX'),
  extractFn(appSrc, 'snapY'),
  extractFn(appSrc, 'releaseSnap'),
  extractFn(appSrc, 'surfaceSpanFor'),
  extractFn(appSrc, 'seatedOnSurface')
].join('\n');
// eslint-disable-next-line no-new-func
const seam = new Function(seamSrc +
  '\nreturn { releaseSnap: releaseSnap, SCENE: SCENE, ' +
  'shelfBoardYs: shelfBoardYs, SURFACE_HOSTS: SURFACE_HOSTS, ' +
  'surfaceSpanFor: surfaceSpanFor, seatedOnSurface: seatedOnSurface };')();
const releaseSnap = seam.releaseSnap;
const SCENE = seam.SCENE;

// ---- 1. grid X + room clamp ---------------------------------------------------

(function () {
  const r = releaseSnap('floor', 100.7, 50, 24, 24);
  assert.strictEqual(r.x % SCENE.grid, 0,
    'released x rides the 12px grid');
  assert.strictEqual(r.x, 96, '100.7 releases onto grid step 96');
  const lo = releaseSnap('floor', -500, 50, 24, 24);
  assert.strictEqual(lo.x, 0, 'x clamps at the left room edge');
  const hi = releaseSnap('floor', 500, 50, 24, 24);
  assert.strictEqual(hi.x, Math.floor((384 - 24) / 12) * 12,
    'x clamps at the largest grid step that still fits (W-3)');
})();

// ---- 2. seating: floor / surface / shelf (the penetration clamp) ---------------

(function () {
  // floor: bottom FLUSH on the floor line — released mid-air OR past
  // the floor, the rect resolves to seated-on-top, never intersecting.
  [50, 300, 500].forEach(function (ny) {
    const r = releaseSnap('floor', 100, ny, 24, 24);
    assert.strictEqual(r.y + 24, SCENE.floorY,
      'floor class seats bottom-flush on floorY (release ny=' + ny + ')');
  });
  // surface: bottom FLUSH on the surface under center-x — the candle
  // released over the desk span seats ON the desk top, never sunk in.
  const desk = SCENE.surfaces[1];
  const onDesk = releaseSnap('surface', 288, 60, 10, 22);
  assert.ok(288 + 5 >= desk.x0 && 288 + 5 <= desk.x1,
    'fixture center-x sits inside the desk span');
  assert.strictEqual(onDesk.y + 22, desk.y,
    'surface class seats bottom-flush on the desk top');
  // released past the surface (ny below it) still resolves UP onto it.
  const sunk = releaseSnap('surface', 288, 200, 10, 22);
  assert.strictEqual(sunk.y + 22, desk.y,
    'a release point inside/below the desk resolves up to seated-on-top');
  // off every surface span: falls back to the floor, seated flush.
  const off = releaseSnap('surface', 96, 60, 10, 22);
  assert.strictEqual(off.y + 22, SCENE.floorY,
    'off-surface release seats on the floor');
  // shelf: bottom FLUSH on the nearest board; x clamped into the recess
  // interior (grid-aligned).
  const boards = seam.shelfBoardYs();
  const book = releaseSnap('shelf', 0, boards[1] - 10 - 20, 8, 20);
  assert.ok(boards.indexOf(book.y + 20) !== -1,
    'shelf class seats bottom-flush on a board');
  assert.strictEqual(book.y + 20, boards[1],
    'and it is the NEAREST board to the release point');
  assert.ok(book.x >= 24 && book.x % SCENE.grid === 0,
    'spine x clamps into the recess interior, still on the grid');
})();

// ---- 3. floorwall (the F9 bench): seat near the floor, float higher ------------

(function () {
  const w = 88, h = 16;
  // released within the near-floor band (bottom within 24px of the
  // floor line) → classic seat, bottom flush.
  const seat = releaseSnap('floorwall', 120, SCENE.floorY - h - 10, w, h);
  assert.strictEqual(seat.y + h, SCENE.floorY,
    'floorwall seats bottom-flush when released near the floor');
  // released past the floor → resolves up to seated, never below.
  const past = releaseSnap('floorwall', 120, 300, w, h);
  assert.strictEqual(past.y + h, SCENE.floorY,
    'floorwall released past the floor resolves up to the seat');
  // released high → wall-float (BY DESIGN, F9), whole-px, clamped.
  const float_ = releaseSnap('floorwall', 120, 60.6, w, h);
  assert.strictEqual(float_.y, 61, 'the float y is whole-px (rounded)');
  const sky = releaseSnap('floorwall', 120, -400, w, h);
  assert.strictEqual(sky.y, SCENE.ceilingY,
    'the float clamps at the ceiling');
})();

// ---- 4. wall / ceiling unchanged ------------------------------------------------

(function () {
  const r = releaseSnap('wall', 120, 77.4, 40, 30);
  assert.strictEqual(r.y, 77, 'wall free-Y rounds to whole px');
  assert.strictEqual(releaseSnap('wall', 120, 500, 40, 30).y,
    SCENE.floorY - 30, 'wall y clamps above the floor (no penetration)');
  assert.strictEqual(releaseSnap('wall', 120, -500, 40, 30).y,
    SCENE.ceilingY, 'wall y clamps below the ceiling');
  assert.strictEqual(releaseSnap('ceiling', 120, 90, 20, 20).y,
    SCENE.ceilingY, 'ceiling class pins to ceilingY');
})();

// ---- 5. free-follow structure: no snap mid-drag, one snap at release ------------

(function () {
  const drag = extractFn(appSrc, 'attachDesignDrag');
  const moveStart = drag.indexOf('function onMove');
  const upStart = drag.indexOf('function onUp');
  assert.ok(moveStart !== -1 && upStart !== -1 && moveStart < upStart,
    'attachDesignDrag keeps its onMove/onUp shape');
  const moveBody = drag.slice(moveStart, upStart);
  ['snapY(', 'gridClampX(', 'clampShelfX(', 'releaseSnap(']
    .forEach(function (call) {
      assert.strictEqual(moveBody.indexOf(call), -1,
        'onMove must not call ' + call +
        ' — the drag preview follows the pointer FREELY (F12)');
    });
  const upBody = drag.slice(upStart);
  assert.ok(upBody.indexOf('releaseSnap(') !== -1,
    'onUp must seat the drop through releaseSnap');
  assert.ok(upBody.indexOf('releaseSnap(') < upBody.indexOf(
    'recordDesignPosition('),
    'the seat happens BEFORE the position is recorded/posted (W-3: ' +
    'nothing unsnapped is ever persisted)');
})();

// ---- 6. F14: the surface spans FOLLOW the arranged hosts ------------------------

(function () {
  const surfaceSpanFor = seam.surfaceSpanFor;
  assert.deepStrictEqual(seam.SURFACE_HOSTS, ['bookshelf', 'desk', 'bench'],
    'SURFACE_HOSTS stays index-aligned with SCENE.surfaces (Pitfall 3: ' +
    'append-only order)');
  // the shipped literals REPRODUCE from the shipped default positions —
  // the derivation and the geometry suite\'s source pins agree exactly.
  assert.deepStrictEqual(surfaceSpanFor('bookshelf', 16, 56, 72),
    { x0: 16, x1: 88, y: 56 },
    'bookshelf span derives flush at sprite row 0');
  assert.deepStrictEqual(surfaceSpanFor('desk', 216, 112, 120),
    { x0: 216, x1: 336, y: 116 },
    'desk span derives +4 below its sprite top (the 116-vs-112 lesson)');
  assert.deepStrictEqual(surfaceSpanFor('bench', 124, 152, 88),
    { x0: 124, x1: 212, y: 152 },
    'bench span derives flush at sprite row 0');
  // THE F14 BUG, pinned: the journal released over the wall-floated
  // bench. Against the STALE shipped span it seats at the old spot —
  const bench = SCENE.surfaces[2];
  const shipped = { x0: bench.x0, x1: bench.x1, y: bench.y };
  const stale = releaseSnap('surface', 120, 40, 30, 14);
  assert.strictEqual(stale.y + 14, shipped.y,
    'against the stale shipped span the item seats at the OLD bench spot');
  // — after the sync (the in-place mutation contract) the span follows
  // the moved bench and the same release seats ON the floated cushion.
  const moved = surfaceSpanFor('bench', 96, 60, 88);
  assert.deepStrictEqual(moved, { x0: 96, x1: 184, y: 60 },
    'a simulated bench move recomputes the span from the live position');
  bench.x0 = moved.x0; bench.x1 = moved.x1; bench.y = moved.y;
  const seated = releaseSnap('surface', 120, 40, 30, 14);
  assert.strictEqual(seated.y + 14, moved.y,
    'the runtime span FOLLOWS: the release seats on the floated bench');
  bench.x0 = shipped.x0; bench.x1 = shipped.x1; bench.y = shipped.y;
  // structure: the sync mutates the shipped entries IN PLACE — never
  // reassigns the array (the geometry suite pins the source literals).
  const syncBody = extractFn(appSrc, 'syncSurfacesToLayout');
  assert.ok(syncBody.indexOf('surfaceSpanFor(') !== -1,
    'syncSurfacesToLayout derives each span through surfaceSpanFor');
  assert.strictEqual(syncBody.indexOf('SCENE.surfaces ='), -1,
    'syncSurfacesToLayout must never REASSIGN SCENE.surfaces — it ' +
    'mutates the shipped entries in place (same array, same indexes)');
  ['s.x0 =', 's.x1 =', 's.y ='].forEach(function (assign) {
    assert.ok(syncBody.indexOf(assign) !== -1,
      'syncSurfacesToLayout writes the span fields in place (' +
      assign.trim() + ')');
  });
  // wiring: the sync runs at the landing, the release, the nudge, and
  // the undo/redo snapshot path — four call sites minimum.
  const calls = appSrc.split('syncSurfacesToLayout();').length - 1;
  assert.ok(calls >= 4,
    'syncSurfacesToLayout() must be wired at the landing, the release, ' +
    'the nudge, and the snapshot path — found ' + calls + ' call sites');
  const nudge = extractFn(appSrc, 'nudgeDesignObject');
  assert.ok(nudge.indexOf('syncSurfacesToLayout(') !== -1,
    'the keyboard nudge carries a moved host\'s span (R6 parity)');
  const snapBody = extractFn(appSrc, 'applyDesignSnapshot');
  assert.ok(snapBody.indexOf('syncSurfacesToLayout(') !== -1 &&
    snapBody.indexOf('syncSurfacesToLayout(') <
    snapBody.indexOf('renderReflectionSpines('),
    'undo/redo re-syncs the spans BEFORE the spines re-pack against them');
})();

// ---- 7. F14: a seated item renders IN FRONT of its host --------------------------

(function () {
  const seatedOnSurface = seam.seatedOnSurface;
  const desk = SCENE.surfaces[1];
  // seated: bottom ON the span line, center-x inside it (the shipped
  // candle default: 300,94,10,22 rests on the desk\'s drawn slab).
  assert.strictEqual(seatedOnSurface(300, 94, 10, 22), true,
    'the shipped candle default reads as seated on the desk');
  assert.strictEqual(seatedOnSurface(300, 93, 10, 22), false,
    'a rect floating 1px above the span line is NOT seated');
  assert.strictEqual(seatedOnSurface(desk.x1 + 10, desk.y - 22, 10, 22),
    false, 'a rect past the span\'s right edge is NOT seated');
  // and against a MOVED span (the floating bench), the released item
  // from group 6 reads as seated — the z rule keys off the live spans.
  const bench = SCENE.surfaces[2];
  const shipped = { x0: bench.x0, x1: bench.x1, y: bench.y };
  bench.x0 = 96; bench.x1 = 184; bench.y = 60;
  assert.strictEqual(seatedOnSurface(120, 46, 30, 14), true,
    'an item seated on the FLOATED bench reads seated on the live span');
  bench.x0 = shipped.x0; bench.x1 = shipped.x1; bench.y = shipped.y;
  // structure: the z rule — seated surface-class items get z \'1\';
  // hosts carry NO inline z (level 0), so seated ALWAYS exceeds host.
  const zBody = extractFn(appSrc, 'syncSeatedZ');
  assert.ok(zBody.indexOf('[data-cls="surface"]') !== -1,
    'syncSeatedZ touches surface-class items ONLY — hosts (floor/' +
    'floorwall) and shelf spines keep their own stacking');
  assert.ok(zBody.indexOf("seated ? '1' : ''") !== -1,
    "syncSeatedZ assigns seated items z '1' (host auto + 1) and CLEARS " +
    'the rest — a host never carries an inline z to outrank');
  assert.ok(zBody.indexOf('seatedOnSurface(') !== -1,
    'syncSeatedZ decides through the one seated predicate');
  // onUp re-applies the rule on BOTH paths (drop and twitch-click),
  // after the seat — and the grab lift (z 3) ends with the drag.
  const drag = extractFn(appSrc, 'attachDesignDrag');
  const upBody = drag.slice(drag.indexOf('function onUp'));
  assert.ok(upBody.indexOf('releaseSnap(') !== -1 &&
    upBody.indexOf('releaseSnap(') < upBody.lastIndexOf('syncSeatedZ('),
    'onUp seats first, then recomputes the seated z');
  assert.ok(drag.indexOf("zIndex = '3'") !== -1 &&
    upBody.indexOf("zIndex = ''") !== -1,
    'the grabbed piece rides above the ladder (z 3) and the lift ends ' +
    'at release');
  // the scene contains its ladder; the tint stays above it (tokens.css).
  const cssSrc = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
  const sceneBlock = cssSrc.slice(cssSrc.indexOf('.room-scene {'),
    cssSrc.indexOf('}', cssSrc.indexOf('.room-scene {')));
  assert.ok(sceneBlock.indexOf('isolation: isolate') !== -1,
    '.room-scene isolates the z ladder — seated/grabbed z never escapes ' +
    'over the body-level scrim or an open panel');
  const tintBlock = cssSrc.slice(cssSrc.indexOf('#room-tint {'),
    cssSrc.indexOf('}', cssSrc.indexOf('#room-tint {')));
  assert.ok(tintBlock.indexOf('z-index: 4') !== -1,
    '#room-tint rides above the arranged ladder (z 4) — seated and ' +
    'grabbed pieces stay tinted');
})();

// ---- 8. 26.8-05: the notebook joins the rosters (D-15 / Pitfall 7) -------------

(function () {
  // client rosters: the notebook is arrangeable (ROOM_OBJECT_IDS) and
  // move-but-not-remove (FUNCTIONAL_IDS) — the candle's client class.
  const roomIds = appSrc.match(/var ROOM_OBJECT_IDS = \[([^\]]*)\]/);
  assert.ok(roomIds, 'app.js must declare ROOM_OBJECT_IDS');
  assert.ok(roomIds[1].indexOf("'notebook'") !== -1,
    "ROOM_OBJECT_IDS must include 'notebook' — the notebook is a " +
    'first-class arrangeable room object (D-15)');
  const funcIds = appSrc.match(/var FUNCTIONAL_IDS = \[([^\]]*)\]/);
  assert.ok(funcIds, 'app.js must declare FUNCTIONAL_IDS');
  assert.ok(funcIds[1].indexOf("'notebook'") !== -1,
    "FUNCTIONAL_IDS must include 'notebook' — move-but-not-remove is " +
    'the CLIENT posture (the candle model)');
  // server roster: LAYOUT_OBJECTS carries the notebook at 28x22 as a
  // surface-class object (F2 26.8.1-04 grew it from 22x16 for desk-scale
  // legibility); FUNCTIONAL_OBJECTS must NOT gain it (server-side
  // removability with graceful fallback — the candle precedent).
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  assert.ok(/"notebook":\s*\(28,\s*22,\s*"surface"\)/.test(serverSrc),
    'server.py LAYOUT_OBJECTS must carry "notebook": (28, 22, "surface")');
  const funcObjs = serverSrc.match(/FUNCTIONAL_OBJECTS = \(([^)]*)\)/);
  assert.ok(funcObjs, 'server.py must declare FUNCTIONAL_OBJECTS');
  assert.strictEqual(funcObjs[1].indexOf('notebook'), -1,
    'FUNCTIONAL_OBJECTS must NOT contain the notebook — server-side ' +
    'removal stays possible; the desk-spot door is the fallback (D-15)');
  // seating: the shipped default (264, 94, 28, 22) rests bottom-flush
  // on the desk span (94 + 22 = 116), and a design-mode release over the
  // desk seats the 28x22 rect through the same pipeline that seats the
  // candle. (F2 26.8.1-04: footprint grew 22x16 -> 28x22, y 100 -> 94.)
  const desk = SCENE.surfaces[1];
  assert.strictEqual(seam.seatedOnSurface(264, 94, 28, 22), true,
    'the shipped notebook default reads as seated on the desk');
  const drop = releaseSnap('surface', 264, 60, 28, 22);
  assert.strictEqual(drop.y + 22, desk.y,
    'a notebook release over the desk seats bottom-flush on the slab');
  assert.strictEqual(drop.x % SCENE.grid, 0,
    'the released notebook x rides the 12px grid');
  const offNb = releaseSnap('surface', 96, 60, 28, 22);
  assert.strictEqual(offNb.y + 22, SCENE.floorY,
    'an off-surface notebook release falls back to the floor seat');
  // the server round-trip, FUNCTIONALLY (the test_sprite_geometry
  // posture, driven from node): a notebook placement validates, an
  // unknown object still refuses, a removed notebook is accepted
  // (candle model) while a removed functional object still refuses.
  const py = require('child_process').spawnSync('python3', ['-c', [
    'import sys, json',
    'sys.path.insert(0, ' + JSON.stringify(ROOT) + ')',
    'import server',
    'print(json.dumps({',
    '  "ok": server.validate_layout({"version": 1, "objects":',
    '    {"notebook": {"x": 264, "y": 94}}}),',
    '  "unknown": server.validate_layout({"version": 1, "objects":',
    '    {"mystery": {"x": 24, "y": 100}}}),',
    '  "removed_nb": server.validate_layout({"version": 1,',
    '    "removed": ["notebook"]}),',
    '  "removed_desk": server.validate_layout({"version": 1,',
    '    "removed": ["desk"]})',
    '}))'
  ].join('\n')], { encoding: 'utf8' });
  assert.strictEqual(py.status, 0,
    'the validate_layout probe must run: ' + (py.stderr || ''));
  const verdicts = JSON.parse(py.stdout);
  assert.strictEqual(verdicts.ok, null,
    'a notebook layout doc must round-trip validate_layout with no ' +
    'refusal (half-registration = 400s on drags, Pitfall 7): ' +
    verdicts.ok);
  assert.ok(typeof verdicts.unknown === 'string' && verdicts.unknown,
    'an unknown-object doc must still refuse');
  assert.strictEqual(verdicts.removed_nb, null,
    'a removed notebook must validate — server-side removability IS ' +
    'the candle model (D-15)');
  assert.ok(typeof verdicts.removed_desk === 'string' &&
    verdicts.removed_desk,
    'a removed functional object must still refuse (D-05)');
})();

console.log('test_design_release_snap OK (grid x, floor/surface/shelf ' +
  'seating + penetration clamp, floorwall seat/float, wall/ceiling, ' +
  'free-follow preview with one release snap, F14 surface follow + ' +
  'seated z above host, 26.8-05 notebook rosters + validate round-trip)');
