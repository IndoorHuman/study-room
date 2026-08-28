/*
 * tests/test_render_seam_fence.cjs — F-8 (Phase 26.9, beat 10).
 * Zero-dep node (assert/fs/path only), path-independent.
 *
 * WHAT THIS PINS, AND WHY IT EXISTS
 *
 * Beat 10 of the 26.9 owner UAT walked every surface for a never-list leak and
 * found none — no fenced CONTENT is anywhere. What it did find is that a fenced
 * item's NAME rendered as a live-looking link inside ORDINARY note bodies: the
 * vault-linker writes `## Related` blocks containing `[[<a fenced note>]]`, and
 * `cleanVaultMarkup` turned that into the same underlined, pointer-cursor
 * anchor it gives a safe target. The click was already fenced
 * (`wikilinkClickAction` ⇒ 'inert'), so nothing opened and nothing was written
 * — but app.js's own rule is that "drawing attention to a hidden thing is
 * itself a leak" (Pitfall 6 / law 5), and REFLECTION bodies already de-linkify
 * exactly this case. Ordinary note bodies did not.
 *
 * the owner's call (2026-08-06): if it is fenced, it should not be a live link
 * anywhere — give note bodies the same treatment reflections get.
 *
 * The fix lives at the SINGLE markdown render seam (`renderMarkdown`), so it
 * covers every rendered surface at once.
 *
 * Behaviors covered:
 *   1. FENCED target in an ordinary note body -> de-linked. No `[[`, no
 *      anchor, and after cleanVaultMarkup no `class="wikilink"` resolving to
 *      it.
 *   2. LAW 4 — the display text is KEPT byte-for-byte (only the brackets go),
 *      so a verbatim body is still verbatim. A fix that deleted the line would
 *      trade a law-5 nit for a law-4 breach.
 *   3. SAFE target in the SAME body is untouched and still becomes a live
 *      anchor — the fix must not de-link the whole Related block.
 *   4. UNRESOLVABLE target is untouched (not in the library = not fenced;
 *      silently editing text that names nothing would be an edit to her own
 *      writing).
 *   5. OWNER OVERRIDE — display toggle ON leaves the fenced door live, exactly
 *      as reflections honour it.
 *   6. FAIL-CLOSED — a resolver that throws is treated as fenced.
 *   7. ONE JUDGE — renderFenceIsFenced routes through the shipped
 *      wikilinkClickAction rather than testing item.state itself, so the thing
 *      deciding how a link DRAWS is the thing deciding what a click DOES.
 *   8. THE WIRING — `renderMarkdown` actually passes its input through
 *      delinkifyFencedWikilinks BEFORE cleanVaultMarkup. Without this
 *      assertion the seven above are vacuous: every one of them would still
 *      pass with the call deleted from renderMarkdown, because they exercise
 *      the pure functions directly. This is the assertion that fails if the
 *      fence is disconnected, and it is the whole point of the file.
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const cleanVaultMarkup = require(path.join(ROOT, 'core.js')).cleanVaultMarkup;

const FENCED_ROSTER = ['Memoir', 'personnel notes',
  'billing & insurance notes', 'appraisal record'];

// Strip comments before any source-level grep. This phase's standing rule,
// and it caught this very file: the fix's own comment says the word
// "cleanVaultMarkup" while EXPLAINING the bug, so an order check run over raw
// text found the comment instead of the call and failed a correct fix. A
// source assertion that can be satisfied — or broken — by prose is measuring
// prose.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Lift a top-level `function name(...) { ... }` verbatim by brace-matching.
// (Same loader shape as test_display_fence.cjs.)
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

// The library the seam sees. One fenced note, one safe note — the exact shape
// beat 10 met in the wild (a Related block naming both).
const ITEMS = {
  aaaa000000000001: { id: 'aaaa000000000001', title: 'Claude Code Notes.md',
    state: 'never_show' },
  aaaa000000000002: { id: 'aaaa000000000002', title: 'Claude API.md',
    state: 'blessed' },
  aaaa000000000003: { id: 'aaaa000000000003', title: 'Retired Thing.md',
    state: 'retired' },
  aaaa000000000004: { id: 'aaaa000000000004', title: 'Flagged Thing.md',
    state: 'blessed', trigger: true }
};

// Build the seam predicate with its free variables injected, so the SHIPPED
// source of renderFenceIsFenced + wikilinkClickAction is what runs.
function loadIsFenced(opts) {
  opts = opts || {};
  const src = extractFn(appSrc, 'wikilinkClickAction') + '\n' +
    extractFn(appSrc, 'renderFenceIsFenced');
  // eslint-disable-next-line no-new-func
  return new Function('SHELF', 'resolveWikilink', 'displayFenceOpen',
    src + '\nreturn renderFenceIsFenced;')(
    opts.noShelf ? undefined : { items: ITEMS },
    opts.throwingResolver
      ? function () { throw new Error('resolver blew up'); }
      : function (key) {
        const want = String(key).toLowerCase().replace(/\.md$/, '');
        return Object.keys(ITEMS).find(function (id) {
          return String(ITEMS[id].title).toLowerCase()
            .replace(/\.md$/, '') === want;
        }) || null;
      },
    function () { return opts.displayOpen === true; });
}

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

function loadDelinkify(opts) {
  // eslint-disable-next-line no-new-func
  return new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
    liftRoster(appSrc) + extractFn(appSrc, 'delinkifyFencedWikilinks') +
    '\nreturn delinkifyFencedWikilinks;')(FENCED_ROSTER, rosterRoom(opts));
}

const delinkify = loadDelinkify();

// The body shape the vault-linker actually writes.
const BODY = [
  'Some of my own writing, kept exactly as I typed it.',
  '',
  '## Related',
  '',
  '- [[Claude Code Notes]]',
  '- [[Claude API]]',
  '- [[Nothing In My Library]]',
  ''
].join('\n');

// ---- 1 + 2 + 3 + 4: the default (toggle OFF) pass -------------------------
{
  const out = delinkify(BODY, loadIsFenced());

  // 1 — the fenced door is gone as a door.
  assert.ok(!/\[\[Claude Code Notes\]\]/.test(out),
    '1: the fenced target must not survive as a wikilink');
  const html = cleanVaultMarkup(out);
  assert.ok(!/data-wiki="Claude Code Notes"/.test(html),
    '1: no anchor may resolve to the fenced target after the render seam');

  // 2 — law 4: the display text survives byte-for-byte.
  assert.ok(/- Claude Code Notes\n/.test(out),
    '2: the display text must be KEPT — only the link-ness goes');
  assert.strictEqual(out.replace(/\[\[|\]\]/g, ''), BODY.replace(/\[\[|\]\]/g, ''),
    '2: apart from the brackets the body must be unchanged (law 4)');

  // 3 — the safe sibling in the same block is untouched and still live.
  assert.ok(/\[\[Claude API\]\]/.test(out),
    '3: a safe target must not be de-linked');
  assert.ok(/data-wiki="Claude API"/.test(html),
    '3: the safe target must still render as a live anchor');

  // 4 — a target that is in no library at all is left alone.
  assert.ok(/\[\[Nothing In My Library\]\]/.test(out),
    '4: an unresolvable target must be left exactly as written');
}

// ---- 5: the owner override ------------------------------------------------
{
  const out = delinkify(BODY, loadIsFenced({ displayOpen: true }));
  assert.ok(/\[\[Claude Code Notes\]\]/.test(out),
    '5: with the display toggle ON the fenced door stays live for the owner');
}

// ---- 6: fail-closed -------------------------------------------------------
{
  const out = delinkify('see [[Claude API]] here',
    loadIsFenced({ throwingResolver: true }));
  assert.ok(!/\[\[/.test(out),
    '6: a resolver that throws must be treated as fenced (fail-closed)');
  const noShelf = delinkify('see [[Claude API]] here',
    loadIsFenced({ noShelf: true }));
  assert.ok(!/\[\[/.test(noShelf),
    '6: an unavailable library must be treated as fenced (fail-closed)');
}

// ---- 7: one judge, and it covers every fenced class ------------------------
{
  const isFenced = loadIsFenced();
  assert.strictEqual(isFenced('Claude Code Notes'), true, '7: never_show');
  assert.strictEqual(isFenced('Retired Thing'), true, '7: retired');
  assert.strictEqual(isFenced('Flagged Thing'), true, '7: trigger-flagged');
  assert.strictEqual(isFenced('Claude API'), false, '7: blessed is not fenced');

  // The predicate must DELEGATE, not re-implement. If someone replaces the
  // wikilinkClickAction call with its own state check, the two judges can
  // drift — which is exactly what the 26.5-05 note forbids.
  const src = stripComments(extractFn(appSrc, 'renderFenceIsFenced'));
  assert.ok(/wikilinkClickAction\(/.test(src),
    '7: renderFenceIsFenced must route through wikilinkClickAction');
  assert.ok(!/state\s*===/.test(src),
    '7: renderFenceIsFenced must not re-implement the fence predicate');
}

// ---- 8: THE WIRING — without this, 1–7 are vacuous ------------------------
{
  const render = stripComments(extractFn(appSrc, 'renderMarkdown'));

  assert.ok(/delinkifyFencedWikilinks\s*\(/.test(render),
    '8: renderMarkdown must run the de-linkifier — with this call deleted, ' +
    'every assertion above still passes and the fence is disconnected');
  assert.ok(/renderFenceIsFenced/.test(render),
    '8: renderMarkdown must pass the seam predicate to the de-linkifier');

  assert.notStrictEqual(render.indexOf('cleanVaultMarkup'), -1,
    '8: renderMarkdown must call cleanVaultMarkup');

  // The fallback path (marked/DOMPurify unavailable) must show the DE-LINKED
  // text too — a degraded render is still a render.
  assert.ok(/md\s*=\s*src/.test(render) || /escapeHtml\(src\)/.test(render),
    '8: the no-marked fallback must render the de-linked text, not the raw input');
}

// ---- 9: EVALUATION ORDER — run the real renderMarkdown ---------------------
//
// Group 8 greps source, and source order is NOT evaluation order. A mutation
// that nests the call —
//     marked.parse(delinkifyFencedWikilinks(cleanVaultMarkup(src), …))
// — reads "de-linkify first" textually while actually running SECOND, by which
// point the anchor already exists and stripping `[[` finds nothing. That
// mutation passed groups 1–8 and the fence was wide open. The only assertion
// that catches it is executing the seam and looking at what comes out.
{
  const src = extractFn(appSrc, 'wikilinkClickAction') + '\n' +
    extractFn(appSrc, 'renderFenceIsFenced') + '\n' +
    extractFn(appSrc, 'delinkifyFencedWikilinks') + '\n' +
    extractFn(appSrc, 'renderMarkdown');

  // Transparent stand-ins: marked and DOMPurify pass the string through
  // untouched, so what this asserts on is exactly what the seam produced.
  const win = {
    marked: { parse: function (s) { return s; } },
    DOMPurify: { sanitize: function (s) { return s; } }
  };
  win.marked.parse.toString();

  // eslint-disable-next-line no-new-func
  const renderMarkdown = new Function(
    'window', 'marked', 'DOMPurify', 'StudyCore', 'SHELF', 'resolveWikilink',
    'displayFenceOpen', 'escapeHtml', 'console', 'REFLECTION_FENCED_ROSTER',
    'ROOM',
    liftRoster(appSrc) + src + '\nreturn renderMarkdown;')(
    win, win.marked, win.DOMPurify,
    { cleanVaultMarkup: cleanVaultMarkup },
    { items: ITEMS },
    function (key) {
      const want = String(key).toLowerCase().replace(/\.md$/, '');
      return Object.keys(ITEMS).find(function (id) {
        return String(ITEMS[id].title).toLowerCase()
          .replace(/\.md$/, '') === want;
      }) || null;
    },
    function () { return false; },
    function (s) { return String(s); },
    { warn: function () {} },
    FENCED_ROSTER, rosterRoom());

  const html = renderMarkdown(BODY);

  assert.ok(!/data-wiki="Claude Code Notes"/.test(html),
    '9: THE REAL SEAM must not emit an anchor for the fenced target ' +
    '(source order is not evaluation order)');
  assert.ok(/data-wiki="Claude API"/.test(html),
    '9: the real seam must still emit the safe anchor');
  assert.ok(/Claude Code Notes/.test(html),
    '9: the fenced display text must survive (law 4)');
}

console.log('OK test_render_seam_fence.cjs — F-8: a fenced target is not a ' +
  'live link on ANY rendered surface (9 groups; seam executed, law 4 text ' +
  'preserved)');
