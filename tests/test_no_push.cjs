/*
 * tests/test_no_push.cjs — the Study Room's static trust gates (Plan 22-05).
 *
 * Zero-dep node (fs/path only), path-independent via __dirname. Four
 * suites over the FIVE app source files (never the tests or tools dirs —
 * future app files must be added to APP_SOURCES deliberately):
 *
 *   Suite 1 — pull-only prohibition (SRM-01, product law 1): none of the
 *     app sources may contain any FORBIDDEN_TOKENS entry. Nothing is
 *     stripped first — comments and user-facing copy count too; the law
 *     bans the vocabulary as well as the code path. If this suite ever
 *     fails, FIX THE SOURCE (rename, rephrase, or reroute) — never weaken
 *     the gate.
 *
 *   Suite 2 — seam integrity (SRM-03): every HTML sink in app.js
 *     (innerHTML/outerHTML assignment, insertAdjacentHTML, document.write)
 *     must be seam-evident AT THE ASSIGNMENT: each depth-0 concatenation
 *     segment of the right-hand side is either a plain string literal or
 *     an expression that itself contains renderMarkdown( / escapeHtml( /
 *     escapeAttr(. Bare accumulator variables do not pass — build the
 *     string inline so the discipline is visible where the sink is.
 *     index.html must contain no sink token at all (script lives in
 *     app.js).
 *
 *   Suite 3 — frozen-time discipline (D-02): core.js never reads the wall
 *     clock (no Date.now call, no zero-argument new Date) — app.js is the
 *     only clock reader. Duplicated from test_core.cjs so ALL static gates
 *     live in one runner for the wave gate.
 *
 *   Suite 4 — UAT layout invariants (22-uat, second self-test round): the
 *     blessing judgment must be reachable without scrolling (H9 energy
 *     budget) — decision bar above the content in the DOM, controls
 *     sticky, the card content in its own scroll region — and the exact
 *     D-11/D-12 copy must survive any re-layout. And the shelf must say
 *     how it opens: a quiet subtitle, an explicit open link per card, a
 *     photo preview on photo cards, Q2 + the pile link above the cards.
 *     Static, like the rest. Plan 23-04 extends this suite with the
 *     manage home's pins: the six section header label prefixes and the
 *     exact reveal-confirm copy.
 *
 * Prints one OK line and exits 0 on success; exits 1 with every violation
 * listed (file, token/segment, line) on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// The five app source files — an explicit list, so a sixth file must be
// added here deliberately to fall under the gate.
// 26.93-01: librarian_call.py joins the list DELIBERATELY — it is the new call
// seam, so the pull-only prohibition scan must cover it exactly as it covers
// server.py. Six files now, not five.
const APP_SOURCES = ['server.py', 'study_lib.py', 'index.html', 'core.js',
  'app.js', 'librarian_call.py'];

// SRM-01 / product law 1 forbidden vocabulary + APIs (22-RESEARCH
// Validation Architecture row). Case-insensitive everywhere — every token
// is safe to lowercase.
const FORBIDDEN_TOKENS = [
  { name: 'Notification(', re: /notification\s*\(/i },
  { name: 'navigator.serviceWorker', re: /navigator\s*\.\s*serviceworker/i },
  { name: 'PushManager', re: /pushmanager/i },
  { name: 'showNotification', re: /shownotification/i },
  { name: 'setInterval(', re: /setinterval\s*\(/i },
  { name: 'sched', re: /sched/i },
  { name: 'cron', re: /cron/i },
  { name: 'reminder', re: /reminder/i },
  { name: 'osascript', re: /osascript/i },
  // UPD-09 / map #141 #143 (D-01/D-02): room never phones home for updates
  // and never ships a built-in updater. Fix the source if these trip —
  // never weaken the gate. Tokens name mechanisms, not owner UI copy.
  { name: 'check for updates', re: /check\s+for\s+updates?/i },
  { name: 'checkForUpdates', re: /checkforupdates/i },
  { name: 'auto-update', re: /auto[-\s]?update/i },
  { name: 'autoUpdater', re: /autoupdater/i },
  { name: 'electron-updater', re: /electron[-\s]?updater/i },
  { name: 'GitHub Releases API',
    re: /api\.github\.com\/repos\/[^/\s]+\/[^/\s]+\/releases/i },
  { name: 'downloadUpdate', re: /downloadupdate/i },
  { name: 'updateAvailable', re: /updateavailable/i }
];

const SEAM_RE = /\b(?:renderMarkdown|escapeHtml|escapeAttr)\s*\(/;

const violations = [];

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

// ---- Suite 1: pull-only prohibition ---------------------------------------

APP_SOURCES.forEach(function (name) {
  const src = readSource(name);
  const lines = src.split('\n');
  FORBIDDEN_TOKENS.forEach(function (tok) {
    lines.forEach(function (line, i) {
      if (tok.re.test(line)) {
        violations.push('[pull-only] ' + name + ':' + (i + 1) +
          " forbidden token '" + tok.name + "': " + line.trim());
      }
    });
  });
});

// ---- Suite 2: seam integrity ----------------------------------------------

// Build a per-character mask of a JS source: 'c' = code, 's' = string /
// template / regex-literal content (delimiters included), 'm' = comment.
// Template interpolation code is treated as string content too (a static
// heuristic — the interpolation check below is textual).
function jsMask(src) {
  const n = src.length;
  const mask = new Array(n).fill('c');
  let i = 0;
  let state = 'code';
  // Chars after which a '/' starts a regex literal rather than division.
  const REGEX_PREFIX = '(,=:[!&|?{};+-*%~^<>';
  let lastCode = ''; // last non-whitespace code char seen
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        while (i < n && src[i] !== '\n') { mask[i] = 'm'; i++; }
        continue;
      }
      if (ch === '/' && next === '*') {
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          mask[i] = 'm'; i++;
        }
        if (i < n) { mask[i] = 'm'; mask[i + 1] = 'm'; i += 2; }
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        mask[i] = 's'; i++;
        while (i < n) {
          if (src[i] === '\\') { mask[i] = 's'; mask[i + 1] = 's'; i += 2; continue; }
          mask[i] = 's';
          if (src[i] === quote) { i++; break; }
          i++;
        }
        lastCode = quote; // a closed literal reads like a value
        continue;
      }
      if (ch === '/' && (lastCode === '' ||
          REGEX_PREFIX.indexOf(lastCode) !== -1)) {
        // regex literal — consume to the unescaped closing '/', honoring
        // character classes where '/' does not terminate.
        mask[i] = 's'; i++;
        let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { mask[i] = 's'; mask[i + 1] = 's'; i += 2; continue; }
          mask[i] = 's';
          if (src[i] === '[') { inClass = true; }
          else if (src[i] === ']') { inClass = false; }
          else if (src[i] === '/' && !inClass) { i++; break; }
          i++;
        }
        lastCode = '/';
        continue;
      }
      if (!/\s/.test(ch)) { lastCode = ch; }
      i++;
      continue;
    }
  }
  return mask.join('');
}

function codeOnly(src, mask) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    out += mask[i] === 'c' ? src[i] : (src[i] === '\n' ? '\n' : ' ');
  }
  return out;
}

// Walk forward from `start` over code chars, returning the index of the
// first depth-0 occurrence of `stopCh` (code positions only).
function findAtDepthZero(src, mask, start, stopCh) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (mask[i] !== 'c') { continue; }
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') { depth++; }
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0 && ch === stopCh) { return i; }
      depth--;
    } else if (depth === 0 && ch === stopCh) { return i; }
  }
  return -1;
}

// Split the range [start, end) into depth-0 '+'-concatenation segments.
function splitSegments(src, mask, start, end) {
  const segments = [];
  let depth = 0;
  let segStart = start;
  for (let i = start; i < end; i++) {
    if (mask[i] !== 'c') { continue; }
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') { depth++; }
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; }
    else if (ch === '+' && depth === 0) {
      segments.push([segStart, i]);
      segStart = i + 1;
    }
  }
  segments.push([segStart, end]);
  return segments;
}

function checkSegment(file, src, mask, seg, sinkLine) {
  const a = seg[0], b = seg[1];
  const raw = src.slice(a, b);
  const code = codeOnly(src, mask).slice(a, b);
  // Template interpolations must each carry the seam (textual heuristic).
  const interps = raw.match(/\$\{[^}]*\}/g) || [];
  for (let k = 0; k < interps.length; k++) {
    if (!SEAM_RE.test(interps[k])) {
      violations.push('[seam] ' + file + ':' + sinkLine +
        ' interpolation without escapeHtml/escapeAttr/renderMarkdown: ' +
        interps[k].trim());
      return;
    }
  }
  if (SEAM_RE.test(code)) { return; }            // seam-evident expression
  if (code.replace(/[\s]/g, '') === '') { return; } // pure string literal(s)
  violations.push('[seam] ' + file + ':' + sinkLine +
    ' sink segment is neither a literal nor seam-evident: ' +
    raw.replace(/\s+/g, ' ').trim());
}

function checkRange(file, src, mask, start, end, sinkLine) {
  splitSegments(src, mask, start, end).forEach(function (seg) {
    checkSegment(file, src, mask, seg, sinkLine);
  });
}

function scanJsSinks(file) {
  const src = readSource(file);
  const mask = jsMask(src);
  const code = codeOnly(src, mask);

  // innerHTML / outerHTML assignments (= and +=).
  const assignRe = /\.\s*(?:inner|outer)HTML\s*(?:\+=|=)(?!=)/g;
  let m;
  while ((m = assignRe.exec(code)) !== null) {
    const rhsStart = m.index + m[0].length;
    const semi = findAtDepthZero(src, mask, rhsStart, ';');
    const sinkLine = lineOf(src, m.index);
    if (semi === -1) {
      violations.push('[seam] ' + file + ':' + sinkLine +
        ' unterminated sink assignment');
      continue;
    }
    checkRange(file, src, mask, rhsStart, semi, sinkLine);
  }

  // insertAdjacentHTML(position, html) — check the html argument.
  const adjRe = /\binsertAdjacentHTML\s*\(/g;
  while ((m = adjRe.exec(code)) !== null) {
    const argStart = m.index + m[0].length;
    const close = findAtDepthZero(src, mask, argStart, ')');
    const comma = findAtDepthZero(src, mask, argStart, ',');
    const sinkLine = lineOf(src, m.index);
    if (close === -1 || comma === -1 || comma > close) {
      violations.push('[seam] ' + file + ':' + sinkLine +
        ' unparseable insertAdjacentHTML call');
      continue;
    }
    checkRange(file, src, mask, comma + 1, close, sinkLine);
  }

  // document.write / document.writeln — check every argument.
  const writeRe = /\bdocument\s*\.\s*write(?:ln)?\s*\(/g;
  while ((m = writeRe.exec(code)) !== null) {
    const argStart = m.index + m[0].length;
    const close = findAtDepthZero(src, mask, argStart, ')');
    const sinkLine = lineOf(src, m.index);
    if (close === -1) {
      violations.push('[seam] ' + file + ':' + sinkLine +
        ' unparseable document.write call');
      continue;
    }
    checkRange(file, src, mask, argStart, close, sinkLine);
  }
}

scanJsSinks('app.js');

// index.html carries no script logic of its own — it must contain no sink
// token at all (inline sinks cannot be statically verified; DOM writing
// lives in app.js behind the seam).
(function () {
  const src = readSource('index.html');
  const sinkRe = /innerHTML|outerHTML|insertAdjacentHTML|document\s*\.\s*write/i;
  src.split('\n').forEach(function (line, i) {
    if (sinkRe.test(line)) {
      violations.push('[seam] index.html:' + (i + 1) +
        ' sink token in markup — keep DOM writing in app.js: ' + line.trim());
    }
  });
})();

// ---- Suite 3: frozen-time discipline (core.js, D-02) -----------------------

(function () {
  const src = readSource('core.js');
  const lines = src.split('\n');
  const wallClock = [
    { name: 'Date.now call', re: /Date\s*\.\s*now\s*\(/ },
    { name: 'zero-argument new Date', re: /new\s+Date\s*\(\s*\)/ }
  ];
  wallClock.forEach(function (tok) {
    lines.forEach(function (line, i) {
      if (tok.re.test(line)) {
        violations.push('[frozen-time] core.js:' + (i + 1) + ' ' +
          tok.name + ': ' + line.trim());
      }
    });
  });
})();

// ---- Suite 4: UAT layout invariants (22-uat) --------------------------------

// A source-order helper: `earlier` must appear in `src` before `later`.
function orderCheck(file, src, earlier, later, why) {
  const a = src.indexOf(earlier);
  const b = src.indexOf(later);
  if (a === -1 || b === -1 || a > b) {
    violations.push('[layout] ' + file + ": '" + earlier +
      "' must appear before '" + later + "' — " + why);
  }
}

(function () {
  const html = readSource('index.html');
  const css = readSource('tokens.css');

  // The blessing decision bar lives ABOVE the content in the DOM, so a
  // long note can never bury the judgment below a scroll (H9).
  orderCheck('index.html', html, 'id="blessing-verdicts"',
    'id="blessing-card"', 'the judgment stays above the content (H9)');

  // The controls stay put while the content scrolls in its own region.
  const controlsRule = css.match(/#blessing-controls\s*\{[^}]*\}/);
  if (!controlsRule || !/position:\s*sticky/.test(controlsRule[0])) {
    violations.push('[layout] tokens.css: #blessing-controls must be ' +
      'position: sticky so the judgment stays in reach');
  }
  // 26-05 UAT (the owner, supersedes the 22-uat spelling of this pin): the
  // H9 guarantee is "the judgment is always in reach", and the STICKY
  // control bars above deliver it. Requiring the card to be its own
  // scroller ALSO produced three nested scrollers in the room panel —
  // the wheel moved the wrong one. The card's base rule keeps its
  // region for the standalone (non-room) layout; inside room-home
  // tokens.css releases it and the panel scrolls. Pin what H9 needs:
  // the card region exists in the base rule, and the release is scoped
  // to room-home only.
  const cardRule = css.match(/#blessing-card\s*\{[^}]*\}/);
  if (!cardRule || !/overflow-y:\s*auto/.test(cardRule[0]) ||
      !/max-height:/.test(cardRule[0])) {
    violations.push('[layout] tokens.css: #blessing-card needs its own ' +
      'scroll region (max-height + overflow-y: auto)');
  }
  // 26-05 UAT (the owner, supersedes the "panel is the scroller" spelling):
  // making the PANEL the scroller left card content bleeding up into the
  // panel's 16px top-padding band, above the sticky bar ("I can see words
  // above 2 of 10"). The panel is now a flex COLUMN — its header holds the
  // top and the CARD is the sole scroller. Still one scrollbar (page locked,
  // panel overflow:hidden), judgment pinned, nothing bleeds above it.
  if (!/body\.room-home #screen-blessing\.active[\s\S]{0,240}overflow:\s*hidden/
    .test(css)) {
    violations.push('[layout] tokens.css: inside room-home the blessing ' +
      'panel must be a flex column with overflow:hidden (the card scrolls, ' +
      'not the panel) so nothing bleeds above the judgment bar');
  }
  if (!/body\.room-home #blessing-card[\s\S]{0,200}overflow-y:\s*auto/
    .test(css)) {
    violations.push('[layout] tokens.css: inside room-home #blessing-card ' +
      'must be the ONE scroller (flex:1; min-height:0; overflow-y:auto)');
  }
  if (!/body\.panel-open\s*\{[^}]*overflow:\s*hidden/.test(css)) {
    violations.push('[layout] tokens.css: body.panel-open must lock the ' +
      'page scroll while a panel is open');
  }

  // The exact D-11/D-12 blessing copy survives the re-layout.
  // 26-05 UAT (the owner, supersedes the D-11/D-12 spelling): the blessing
  // verbs now borrow the librarian's plain words — 'joyful' / 'heavy' —
  // with the CONSEQUENCE kept in the label ('bring it back' / 'set it
  // aside') so a mood word can never hide what the tap actually does.
  // The underlying states are unchanged (blessed / never_show).
  // 26.996-05 (#110): the forever tap now reads her ruling verbatim —
  // `put it away for good` — at all three visible sites and in Manage.
  ['joyful — bring it back', 'put it away for good', 'not now',
    "that's enough for today"].forEach(function (copy) {
    if (html.indexOf(copy) === -1) {
      violations.push("[layout] index.html: blessing copy missing: '" +
        copy + "'");
    }
  });

  // 23-uat: the reader's reaction line obeys the same H9 rule as the
  // blessing bar — the judgment sits ABOVE the content in the DOM and
  // stays put while a long note scrolls in its own region below.
  orderCheck('index.html', html, 'id="reaction-bar"',
    'id="reader-content"', 'the judgment stays above the content (H9)');
  const reactionRule = css.match(/#reaction-bar\s*\{[^}]*\}/);
  if (!reactionRule || !/position:\s*sticky/.test(reactionRule[0])) {
    violations.push('[layout] tokens.css: #reaction-bar must be ' +
      'position: sticky so the judgment stays in reach');
  }
  const readerRule = css.match(/#reader-content\s*\{[^}]*\}/);
  if (!readerRule || !/overflow-y:\s*auto/.test(readerRule[0]) ||
      !/max-height:/.test(readerRule[0])) {
    violations.push('[layout] tokens.css: #reader-content needs its own ' +
      'scroll region (max-height + overflow-y: auto)');
  }

  // The shelf says what it is and how it opens: one quiet subtitle line
  // under the h2, in the room's register.
  if (html.indexOf('a few things you chose to meet again — open one, ' +
      'or just look.') === -1) {
    violations.push('[layout] index.html: the shelf subtitle line is ' +
      'missing');
  }

  // Q2 and the pile link sit ABOVE the shelf cards — visible without
  // scrolling on a 4–5 card shelf.
  orderCheck('index.html', html, 'id="q2-habit-anchor"',
    'id="shelf-cards"', 'Q2 above the shelf cards');
  orderCheck('index.html', html, 'id="shelf-pile-link"',
    'id="shelf-cards"', 'the pile link above the shelf cards');

  const app = readSource('app.js');

  // Photo cards show the photo itself — a plain inline img over the same
  // /lib/ route the reader uses (escaping enforced by Suite 2 at the sink).
  if (app.indexOf('img class="shelf-photo" src="/lib/') === -1) {
    violations.push('[layout] app.js: shelf photo cards must carry an ' +
      'inline /lib/ preview (img class="shelf-photo")');
  }

  // Every shelf card carries an explicit underlined "open" control
  // besides the clickable title (two shelf-open builders in the card
  // template: the title button and the open link).
  const opens = app.match(/class="shelf-open"/g) || [];
  if (opens.length < 2) {
    violations.push('[layout] app.js: each shelf card needs an explicit ' +
      "underlined 'open' control besides the clickable title");
  }

  // A note's attached pictures ARE its content for image-post clippings
  // (22-uat): both note sinks — the reader AND the blessing card — must
  // route the body through the attachment rewrite (wikilinks inline) and
  // trail the unreferenced pictures. Two call sites each, or one path is
  // showing the caption without the comic.
  ['rewriteAttachmentRefs', 'unreferencedAttachments'].forEach(function (fn) {
    const uses = app.match(new RegExp('StudyCore\\.' + fn + '\\(', 'g')) || [];
    if (uses.length < 2) {
      violations.push('[layout] app.js: StudyCore.' + fn + '( must run at ' +
        'both note sinks (reader + blessing card) — found ' + uses.length);
    }
  });
})();

// ---- Suite 4 extension (23-04): the manage home's labeled sections ----------
//
// The six section headers and the reveal-confirm copy are load-bearing
// product surface (D-10/D-14/D-16): the labels ARE the never-list's
// user-facing accounting — the one deliberate, clearly-labeled place
// excluded things are listed — and the confirm is the only door to their
// content. Pinned byte-exactly over app.js. Fix the source, never this
// gate.

(function () {
  const app = readSource('app.js');

  ['Pile (', 'Blessed (', 'Hidden (', 'You put these away for good (',
    'Retired (',
    'Active filters (', 'Stats (',
    // 26-04 (additive, the 25-04 precedent): the librarian settings
    // section joins the labeled manage sections — the original seven
    // entries above are byte-identical.
    'the librarian',
    // 26.94-03, 2026-08-13 (additive, the same 25-04 / 26-04 precedent):
    // the librarian section's one sentence about what the room CANNOT do
    // without the Apple toolchain. The eight entries above are
    // byte-identical. Owner-approved wording (#35), pinned here so it
    // cannot drift; the SEPARATE 26.94-03 block far below pins that it is
    // rendered only when the server says the toolchain is absent, and
    // that the browser is handed a boolean rather than a path.
    'Reading photos — needs Xcode Command Line Tools — xcode-select --install'
  ].forEach(function (label) {
    if (app.indexOf(label) === -1) {
      violations.push("[layout] app.js: manage section string missing: '" +
        label + "'");
    }
  });

  if (app.indexOf('You chose not to see this. Open it?') === -1) {
    violations.push('[layout] app.js: the reveal confirm must carry the ' +
      "exact copy 'You chose not to see this. Open it?'");
  }

  // CR-01 (law 5): the reader's reaction line renders only for items the
  // room legitimately surfaced — app.js must consult
  // StudyCore.reactionAllowed before showing the bar (core's applyReaction
  // throws as the hard fence either way; this pin keeps the UI honest).
  if (!/reactionAllowed/.test(app)) {
    violations.push('[layout] app.js: the reader must gate the reaction ' +
      'bar on StudyCore.reactionAllowed (CR-01, law 5)');
  }

  // 23-uat (D-16 amended by the user at UAT): excluded rows carry the
  // item's TITLE — her own filename, the recall handle for "why did I
  // judge this?" — while the reveal confirm stays the only door to the
  // content. The title is identifying metadata; a content excerpt in
  // the row would be the ambush D-16 exists to prevent.
  const revealAt = app.indexOf('class="manage-reveal"');
  if (revealAt === -1) {
    violations.push('[layout] app.js: the excluded-row reveal control ' +
      '(class="manage-reveal") is missing');
  } else {
    const rowTpl = app.slice(Math.max(0, revealAt - 800), revealAt + 800);
    if (!/item\.title/.test(rowTpl)) {
      violations.push('[layout] app.js: excluded rows must show ' +
        "item.title as the recall handle (D-16 as amended at 23-uat)");
    }
  }
})();

// ---- Suite 4 extension (24-01): the room's pinned copy + markup --------------
//
// The room-home slice's chrome copy and scene markup are load-bearing
// product surface (D-07/D-08/D-09): the panel close link and the manage
// entry link are pinned byte-exactly, #screen-room must exist with the
// Phase 25 lighting seam (#room-tint), and the H10 counter plumbing must
// live in app.js. Fix the source, never this gate.

(function () {
  const html = readSource('index.html');
  const app = readSource('app.js');

  // The two chrome links, byte-exact (UI-SPEC Copywriting Contract).
  ['back to the room', 'manage your library'].forEach(function (copy) {
    if (html.indexOf(copy) === -1) {
      violations.push("[layout] index.html: room chrome copy missing: '" +
        copy + "'");
    }
  });

  // The room section ships with the Phase 25 lighting seam in place.
  ['id="screen-room"', 'id="room-tint"'].forEach(function (marker) {
    if (html.indexOf(marker) === -1) {
      violations.push('[layout] index.html: room markup missing: ' +
        marker);
    }
  });

  // The H10 counter plumbing exists in app.js (D-17): landings and
  // object opens are recorded to store meta, never rendered in the room.
  ['room_entries', 'object_opens'].forEach(function (key) {
    if (app.indexOf(key) === -1) {
      violations.push('[layout] app.js: the H10 counter plumbing must ' +
        'carry ' + key);
    }
  });
})();

// ---- Suite 4 extension (24-02): the containers' pinned copy + lifecycle -----
//
// The album/journal browse panels' copy is load-bearing product surface
// (D-11/D-12/D-13): the two headings, the pile-hint count lines (a count,
// never content), and the two-tier empty states are pinned byte-exactly.
// The RV-1/RV-4 lifecycle pins keep each container entry hydrating the
// shelf cycle from freshly fetched meta BEFORE any render (a
// container-first open must never overwrite the stored cycle with the
// boot default) and the reaction completion honoring the container
// return target. Fix the source, never this gate.

(function () {
  const html = readSource('index.html');
  const app = readSource('app.js');

  // The album panel heading, byte-exact (UI-SPEC Copywriting Contract).
  // (26.8.1 D-B retired the journal browse panel — 'Your notes' is gone.)
  ['Your photos'].forEach(function (copy) {
    if (html.indexOf(copy) === -1) {
      violations.push("[layout] index.html: container heading missing: '" +
        copy + "'");
    }
  });

  // The two-tier container empty states (D-13, knock-not-barge — silence
  // at zero). The pile-hint count copy was removed in D-A (26.8.1-01); the
  // count-free MORE_WAITING_COPY line is covered by test_refinements_grep +
  // test_surface_property.
  ['nothing blessed here yet.', 'nothing here right now.'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[layout] app.js: container copy missing: '" +
        copy + "'");
    }
  });

  // RV-1: each container entry hydrates SHELF.cycle from the freshly
  // fetched meta before rendering — openItem's recordOpen writes through
  // SHELF.cycle.shown_ids and POSTs the whole cycle, so dropping this
  // hydration would let a container-first open clobber the stored cycle.
  // 26.8.1 D-B retired openJournal with the journal browse panel; the
  // album entry is the surviving container that must still hydrate RV-1.
  ['openAlbum'].forEach(function (fn) {
    const re = new RegExp('function ' + fn +
      '[\\s\\S]{0,1200}?SHELF\\.cycle');
    if (!re.test(app)) {
      violations.push('[layout] app.js: ' + fn + ' must hydrate ' +
        'SHELF.cycle from the fetched meta before rendering (RV-1)');
    }
  });

  // RV-4: reaction completion reads the container return target so a
  // container-opened reader returns to its container, never the shelf.
  if (!/function handleReaction[\s\S]*?panelReturn/.test(app)) {
    violations.push('[layout] app.js: handleReaction must branch on the ' +
      'panel return target so a container-opened reader returns to its ' +
      'container (RV-4)');
  }
})();

// ---- Suite 4 extension (24-03): the consolidation row's pinned copy ----------
//
// The manage home's `the room` section is the one labeled administrative
// place the D-11 smart default becomes editable (D-14): the two
// stored-truth behavior lines, the two lowercase toggle links, and the
// quiet write-failure line are load-bearing product surface, pinned
// byte-exactly over app.js (UI-SPEC §8 + Copywriting Contract). The row
// renders the STORED truth only — on a failed write the user sees the
// failure line, never an optimistic flip. Fix the source, never this
// gate.

(function () {
  const app = readSource('app.js');

  // 26.8.1 D-B: the consolidation "on" copy dropped its journal clause
  // (notes no longer consolidate into a room object). The "off" copy is
  // unchanged (it never named the journal).
  ['photos gather into an album.',
    'photos and notes stay in the pile and shelf only.',
    'turn this off', 'turn this on',
    "couldn't save — try again."
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[layout] app.js: consolidation row copy missing: '" +
        copy + "'");
    }
  });
})();

// ---- Suite 4 extension (24.1-03): design mode's pinned copy + guards ---------
//
// The design-mode entry and exit copy is load-bearing product surface
// (D-01/D-07), and the OFF-mode guard skeleton is the D-02 byte-identity
// contract made textual: seven click guards early-return with the exact
// one-line literal at the top of their handlers, every room object
// carries its snap class, and the mode-only chrome exists in the markup.
// Pinned byte-exactly. Fix the source, never this gate.

(function () {
  const html = readSource('index.html');
  const app = readSource('app.js');

  // The entry row renders from app.js (the manage row is JS-built);
  // the exit button is static markup — each pinned in its home file.
  if (app.indexOf('arrange your room') === -1) {
    violations.push("[layout] app.js: design-mode entry copy missing: " +
      "'arrange your room'");
  }
  if (html.indexOf('done arranging') === -1) {
    violations.push("[layout] index.html: design-mode exit copy " +
      "missing: 'done arranging'");
  }

  // The engine's toggle exists in app.js.
  if (app.indexOf('setDesign') === -1) {
    violations.push('[layout] app.js: the design engine must carry ' +
      'setDesign');
  }

  // The seven OFF-mode click guards (D-02): each an early return with
  // the exact one-line literal at the top of its handler.
  const guards = app.match(/if \(DESIGN\) \{ return; \}/g) || [];
  if (guards.length < 7) {
    violations.push('[layout] app.js: expected at least 7 OFF-mode ' +
      'click guards (if (DESIGN) { return; }) — found ' + guards.length);
  }

  // The mode-only chrome and the snap classes exist in the markup.
  ['design-grid', 'design-bar'].forEach(function (marker) {
    if (html.indexOf(marker) === -1) {
      violations.push('[layout] index.html: design markup missing: ' +
        marker);
    }
  });
  // 26.5-06 (SC-3): 7 -> 8, deliberately — the bench (the window seat
  // split out of the window sprite) joined the arrangeable roster.
  // 26.5-09 UAT F16 (the owner's decision): 8 -> 9, deliberately — the
  // office chair promoted from fixed scenery to an arrangeable object.
  // 26.8-05 (D-15): 9 -> 10, deliberately — the blessings notebook
  // joined as a surface-class desk resident (move-but-not-remove
  // client-side, the candle model; two-layer registration pinned in
  // test_diegetic_wiring group 15).
  // 26.8.1-02 (D-B): 10 -> 9, deliberately — the journal room object was
  // retired so the blessings notebook is the single book (note DATA kept;
  // surface removal only).
  // 26.9-01 (D-18/D-22, 2026-08-04): 9 -> 10, deliberately — the journal
  // returns as the READING BOOK, a bench-seated surface-class object that
  // opens a contents station (never the retired browse panel). Plan
  // 26.88-14 printed this roster BY VALUE as "roster unchanged: 9
  // stations"; that pin has been moved on purpose and the move is written
  // down in .planning/DEV-JOURNAL.md rather than back-edited into
  // 26.88-14-PLAN.md, which stays byte-unchanged as a closed record.
  // 26.91-04 (D-06, 2026-08-07): 10 -> 9, deliberately — the reading book
  // was retired; the blessings notebook is the single book again. The pin
  // 26.9-01 moved 9 -> 10 is moved back on purpose, and the move is
  // written down in .planning/DEV-JOURNAL.md rather than back-edited into
  // 26.9-01-PLAN.md, which stays byte-unchanged as a closed record.
  // 26.999 (2026-08-25): 9 -> 10, deliberately — the card box (the
  // librarian's memory of you) joined the room by her design sitting
  // (record: 26.999-DESIGN-SITTING-2026-08-25.md). Written down in
  // .planning/DEV-JOURNAL.md per this pin's own convention.
  // 26.99955-08 (2026-08-26): 10 -> 11, deliberately — the pen cup joined
  // the room by her ruling, as the ONE door to the activity log after she
  // ruled it off the Manage dashboard ("Only in the room"). Written down in
  // .planning/DEV-JOURNAL.md per this pin's own convention.
  const cls = html.match(/data-cls=/g) || [];
  if (cls.length !== 11) {
    violations.push('[layout] index.html: expected exactly 11 data-cls ' +
      'attributes — found ' + cls.length);
  }
})();

// ---- Suite 4 extension (24.1-04): the catalog dock's pinned copy -------------
//
// The accessory catalog is design-mode-only chrome (D-05): the dock
// markup and its lowercase copy are pinned in index.html, and the
// engine's entry points must exist in app.js. Functional objects never
// gain catalog cards — the roster is structural, backed by the server
// fence. Fix the source, never this gate.

(function () {
  const html = readSource('index.html');
  const app = readSource('app.js');

  ['catalog-panel', 'duplicate last', 'accessories'].forEach(function (t) {
    if (html.indexOf(t) === -1) {
      violations.push('[layout] index.html: catalog markup/copy ' +
        "missing: '" + t + "'");
    }
  });

  ['renderCatalog', 'ASSET_VER', 'room-added'].forEach(function (t) {
    if (app.indexOf(t) === -1) {
      violations.push("[layout] app.js: catalog engine missing: '" +
        t + "'");
    }
  });
})();

// ---- Suite 4 extension (25-01): light & time contract pins -------------------
//
// Contract pins ADDED by Plan 25-01 (they did not exist before — Phase
// 25 RESEARCH Finding 3.4): the three room-*-play keyframe NAMES are
// the 24-03 film-strip contract ("swap bodies, keep names"); the
// candle's ambient and .playing flutter animation lines each carry a
// literal steps( integer count, never a var(); the reduced-motion
// block hands the still sprite back; and the 25-01 welcome/time-band
// class names plus the app.js wiring must exist. Fix the source, never
// this gate.

(function () {
  const css = readSource('tokens.css');
  const app = readSource('app.js');

  // The pinned keyframe names (D-04a: swap bodies, keep names).
  ['room-candle-play', 'room-plant-play', 'room-window-play']
    .forEach(function (name) {
      if (css.indexOf('@keyframes ' + name) === -1) {
        violations.push('[light] tokens.css: pinned keyframe missing: ' +
          name);
      }
    });

  // The candle's ambient AND flutter animation lines each carry a
  // literal steps( with an integer count — never a var().
  const candleAnims = css.match(/animation:\s*room-candle-play[^;]*;/g) || [];
  if (candleAnims.length < 2) {
    violations.push('[light] tokens.css: expected the candle ambient ' +
      'AND .playing flutter animation lines (room-candle-play) — ' +
      'found ' + candleAnims.length);
  }
  candleAnims.forEach(function (line) {
    if (!/steps\(\s*\d+\s*\)/.test(line)) {
      violations.push('[light] tokens.css: candle animation line must ' +
        'carry a literal steps(N), never a var(): ' + line);
    }
  });

  // The reduced-motion candle restore: the loop stops and the still
  // sprite returns.
  if (!/prefers-reduced-motion[\s\S]*?#room-obj-candle[\s\S]*?visibility:\s*visible/
    .test(css)) {
    violations.push('[light] tokens.css: the reduced-motion candle ' +
      'still-sprite restore block is missing');
  }

  // The 25-01 welcome sequence + time-band surface in tokens.css.
  ['room-welcome-dim', 'welcome-back',
    'time-day', 'time-dusk', 'time-night'].forEach(function (name) {
    if (css.indexOf(name) === -1) {
      violations.push('[light] tokens.css: 25-01 class/keyframe ' +
        'missing: ' + name);
    }
  });

  // The wiring's presence in app.js (the band/variant chooser and the
  // welcome class), plus the sequence's one invisible-but-accessible
  // label — no absence framing, ever.
  ['welcome-back', 'applyTimeOfDay', 'the room is waking']
    .forEach(function (t) {
      if (app.indexOf(t) === -1) {
        violations.push("[light] app.js: light & time wiring missing: '" +
          t + "'");
      }
    });
})();

// ---- Suite 4 extension (25-03): the import readout's pinned promise ----------
//
// The close-line is SC-3's promise made textual — the copying runs in a
// server-side worker, so leaving costs nothing — and it is pinned
// byte-exactly over app.js together with the honest-readout wiring: the
// progress-route read and the still-counting floor that stands in before
// the ETA's denominator exists. Fix the source, never this gate.

(function () {
  const app = readSource('app.js');

  if (app.indexOf('you can close this; the room will be ready.') === -1) {
    violations.push("[import] app.js: the pinned close-line is missing: " +
      "'you can close this; the room will be ready.'");
  }

  ['import-progress', 'still counting…'].forEach(function (t) {
    if (app.indexOf(t) === -1) {
      violations.push("[import] app.js: import readout wiring missing: '" +
        t + "'");
    }
  });
})();

// ---- Suite 4 extension (25-04): the stats section's pinned disclosure --------
//
// The 7th manage section is the self-test's instrument (SRM-09, D-03):
// counts and rates only, on this device only — the header's
// parenthetical IS the privacy disclosure, pinned byte-exactly over
// app.js together with the neutral row copy (the blessed-with-resting
// form and the em-dash zero-open rows — never a divide by zero). The
// six section header pins above gained 'Stats (' ADDITIVELY — the
// original six entries are byte-identical — and the room itself renders
// none of these numbers (the desk stays an entry with a promise, never
// a dashboard). Fix the source, never this gate.

(function () {
  const app = readSource('app.js');

  if (app.indexOf('Stats (on this device only)') === -1) {
    violations.push('[stats] app.js: the pinned stats disclosure is ' +
      "missing: 'Stats (on this device only)'");
  }

  ['visits: ', 'glad: ', 'never again: ', '(resting ', '(no opens yet)']
    .forEach(function (t) {
      if (app.indexOf(t) === -1) {
        violations.push("[stats] app.js: stats row copy missing: '" +
          t + "'");
      }
    });
})();

// ---------------------------------------------------------------------------
// ---- 26.93-10: the call seam's checkers, and the numbers they assert -------
//
// ⚠⚠ WHY THESE ARE FUNCTIONS AND NOT INLINE `if`s. Every pin in the block
// below was REWRITTEN in Phase 26.93, and a rewritten pin is a fresh
// instrument wearing an old name. Roughly thirty defects of this project's
// class have landed INSIDE the measuring instrument rather than in the code
// under test — a checker held in a shell variable that never ran while three
// of four cases printed "RED, as required"; a mutation harness that stopped at
// its first catch and reported one failure where there were four. F-01 is
// another: two separate tickets described THIS FILE as asserting two
// subprocess sites while the shipped code asserted three, and that is how the
// whole review came about.
//
// So each claim is a FUNCTION OVER SOURCE TEXT returning a list of violation
// strings. The live calls hand it the real sources; the drill at the foot of
// this file hands it copies with exactly one thing wrong each, counts the
// catches and the unmutated controls BY VALUE, and cannot exit early on a
// catch. ⚠ EVERY MUTATION IS A STRING IN MEMORY — nothing here writes a file.
// ---------------------------------------------------------------------------

// ⚠⚠ THE SUBPROCESS-SITE COUNT — A NAMED CONSTANT, ASSERTED BY EQUALITY.
//
// The whole history lives here so the next phase finds the reason already
// written instead of re-deriving it as an argument. This is the shipped
// comment's own 2->3 discipline, kept:
//
//   SHIPPED (26-01 .. 26.93-06): 3 — the version probe inside
//     `_librarian_probe`, the hermetic agent call inside `run_librarian_call`,
//     and the vault tidy-up call inside `run_vault_processor`.
//
//   NOW (26.93-07, at this phase's close): 1.
//     * the version probe left WITH THE PROGRAM IT WAS ASKING ABOUT. Nothing
//       behind the librarian is an installed binary any more, so there is no
//       floor to meet and nothing to ask.
//     * the hermetic agent call left WITH THE SEAM ITSELF. Store bytes reach a
//       model through `librarian_call.call_librarian` and one plain request,
//       so the fence's central claim stopped being an argument about which of
//       two routes is wired and became this count.
//     * `run_vault_processor` SURVIVES, deliberately. It runs the owner's own
//       process-vault skill over her own vault with tools and permissions on:
//       a DIFFERENT TRUST TIER, out of the call seam's scope by name (map
//       ticket #44).
//
//   NOW (26.94-02, at this plan's close): 2.
//     * `run_vision_pass` JOINED. It spawns `swift tools/vision_read.swift`
//       ONCE per import to read her photographs with macOS Vision. The
//       branch 26.93 wrote down was taken: it is invoked from `server.py`,
//       so this pin's SUBJECT is unchanged and this phase edited ONE number
//       rather than re-opening the argument, and no second pin over
//       `adapters/` is owed.
//     * ⚠ IT IS NOT A CALL-SEAM SITE, and that is why the seam's own gates
//       do not grow. There is no request body, no provider, no model, no
//       tokens and no schema on this path — it is a framework call on her
//       own machine. `librarian_call.py`'s TIERS comment asks this phase
//       whether `on-device` joins the tier table; the answer, written at
//       that site, is no: a Vision row would be null in every column that
//       tuple's consumers read.
//
//   NOW (26.95-01, copy pass #77): 1.
//     * ⛔ `run_vault_processor` IS DELETED, on the owner's application of
//       #56's ruling. The repo ships zero skill files, so on any machine but
//       the author's the CLI was handed a `process-vault` skill that does not
//       exist and did nothing, silently — a tidy-up that reported success and
//       changed no file. Owner-gating it, hiding it and making it explain
//       itself were all rejected: each keeps a permission-bypassed agent, a
//       sandbox profile and a spawned call site alive in a published codebase
//       for one person who can run the same chain in her own terminal.
//     * ⚠ WHAT THIS DOES TO THE GATES BELOW. Pin (1b) — that the privileged
//       tier is wrapped in a sandbox — is REWRITTEN, not deleted: with the
//       privileged tier gone there is no second tier to separate, so what it
//       now asserts is the ABSENCE of the whole shape (no sandbox wrapper, no
//       bypassed permissions, no skills) rather than its correct wrapping.
//       Deleting it would erase the record that a privileged tier ever needed
//       walling off, and a deletion-shaped fix cannot be told from lost
//       coverage.
//     * The one surviving site is `run_vision_pass` — `swift` over her own
//       photographs, on her own machine, no network and no prompt.
//
//   NEXT (whoever follows) — the two shapes this number moves in:
//     * another spawn from `server.py` -> 3, and the reason belongs in this
//       block BEFORE the number changes, not in a summary nobody re-reads.
//     * a spawn from `adapters/` or any other file -> this constant does NOT
//       move (its subject is `server.py`, that file alone) and a SECOND pin
//       is owed over that file, which sits outside every gate this applies.
//
// ⚠ EQUALITY AGAINST THE CONSTANT — never a range, never a set. A pin that
// accepts one-or-two accepts a fourth site arriving as a third. Both
// directions are drilled at the foot of this file.
//
// ⚠ THE COUNT IS TAKEN OVER `#`-COMMENT-STRIPPED SOURCE, AND A PYTHON
// DOCSTRING IS NOT A `#` COMMENT. Prose that spells the call shape therefore
// counts as a call site: 26.94-02 turned this pin red twice from a docstring
// explaining why a second spawn was refused. Write "spawned call site" in
// prose; never the shape.
  // 26.996-07: +1 spawned site — run_likeness_pass beside run_vision_pass.
  // 26.996-07 task 3: +1 — run_place_pass beside run_likeness_pass.
  const SERVER_SUBPROCESS_SITES = 3;

// The three request builders, one per provider. Each must carry the payload
// verbatim and place the job row's prompt as an explicit field.
const SEAM_BUILDERS = [
  { fn: 'build_ollama_request', provider: 'ollama' },
  { fn: 'build_anthropic_request', provider: 'anthropic' },
  { fn: 'build_openai_request', provider: 'openai' }
];

// job -> the schema literal its JOBS row must name. ⚠ THE ROW'S IDENTITY, not
// merely its existence: a row pointing at the wrong literal passes any
// existence check and would put a cleaning schema on a config ask.
// ⛔ THE `cleaning_labels` ROW LEFT THIS ROSTER 2026-08-17 with the labelling
// pass it belonged to (#87 retired the pass, #95 ruled the code out). Its
// claim was that the tidy-up inherited the fence by feeding the one choke
// point a named schema — the tidy-up now feeds no choke point at all, so
// there is no inheritance left to pin. ⚠ The roster is down to one row and
// that is not a weakening: the property is per-row identity, and a row that
// does not exist cannot point at the wrong literal.
const JOB_ROWS = [
  ['config_ask', 'CONFIG_SCHEMA_JSON',
    'the config ask inherits the same fence the same way (26.87-02), and it ' +
    'is the one row whose permitted_local is False']
];

// ⚠ CLAIMS THIS BLOCK USED TO ASSERT AS PRESENT, NOW ASSERTED AS ABSENT.
// A test that pinned copy the owner later removed gets REWRITTEN, never
// deleted: deleting it erases the record that these exact words were once
// required, and a deletion-shaped fix is indistinguishable from losing
// coverage. Matched over COMMENT-STRIPPED source, because this repo writes
// long disposition notes and a raw scan tripped by its own prose is the
// FORBIDDEN_TOKENS defect one suite up.
const RETIRED_CLAIMS = [
  { file: 'app.js',
    s: 'included in your Claude plan — this never charges you money.',
    why: 'the free-usage claim. #28 removed the subscription path and ' +
      '`detect_librarian_auth` is gone, so the branch that guarded this ' +
      'would read `undefined` and render the free arm on a machine holding ' +
      'a real paid key (T-26.93-33)' },
  { file: 'app.js',
    s: ' of included usage — this never charges you money',
    why: 'the same claim on the pre-sort cost readout, deleted under the ' +
      'quiet-until-#34 ruling — the room says nothing about money at all ' +
      'until #34 decides how spend is measured' },
  { file: 'app.js',
    s: ' of usage so far',
    why: 'the other half of that readout. The seam returns token counts and ' +
      'no dollar figure, and no price table enters this repo' },
  { file: 'app.js',
    s: 'using your Claude login',
    why: 'there is no login behind the librarian any more: every cloud rung ' +
      'authenticates with a key she brings and the local rung with nothing' },
  { file: 'app.js',
    s: 'librarian use is included in your Claude plan — this never charges ' +
      'you money.',
    why: 'the always-on Manage pane\'s copy of the free-usage claim — the ' +
      'more prominent of the two sites, and false in the same way' },
  { file: 'app.js',
    s: "Claude Code isn't set up yet — sign in to Claude Code to wake the " +
      'librarian and open the room.',
    why: 'the sign-in instruction. A stranger sent to install and sign in to ' +
      'a tool the product stopped using is being told to fix a room that ' +
      'already works (F-02)' },
  { file: 'app.js',
    s: 'Your librarian works through Claude',
    why: "onboarding's ai-check step is deleted — the librarian may be " +
      'Ollama or OpenAI, so a heading that names one company is a false ' +
      'statement about who answers' },
  { file: 'server.py',
    s: "Claude Code isn't set up yet — sign in to Claude Code to wake the " +
      'librarian and open the room.',
    why: 'the server half of the same sentence. The two constants that ' +
      'answered "is it set up" and "is it new enough" were deleted with the ' +
      'questions themselves (26.93-07); availability is asked of routing now' },
  { file: 'app.js',
    s: 'the librarian sends allowed parts of your library to Claude, ' +
      "Anthropic's AI service, over the internet. everything else about " +
      'the room stays on this machine.',
    why: 'the Manage disclosure, retired on the owner\'s ruling (#77 site ' +
      '2). ⚠ THE FIRST BAN IN THIS LIST THAT IS NOT ABOUT MONEY — the ' +
      'distinction was put to her explicitly and she ruled the ban warranted ' +
      'on the same argument as the other three: this pane is the most ' +
      'prominent place in the room a false statement can stand, and this one ' +
      'is false about WHO READS HER THINGS. Two ways: it frames the fact as ' +
      'a thing of hers travelling, when the item never leaves her disk and ' +
      'only a copy of the text is read; and it names one company on a pane ' +
      'that Ollama or OpenAI may be answering. #48\'s governing line, pinned ' +
      'above, replaces it' },
  { file: 'server.py',
    s: 'stopped at the cost limit — everything sorted so far is saved.',
    why: 'the import loop\'s ceiling sentence, retired by 26.99-06 under ' +
      'D-18. ⚠ IT WAS FALSE ABOUT HER MONEY: it told her the pass had ' +
      'stopped at a COST limit, and D-18 rules the stop is counted in WORK ' +
      'on a pass that costs nothing — there is no price table in this repo ' +
      'and no figure the room could have meant. Banned rather than merely ' +
      'replaced, because the surface it stood on is one she meets at the ' +
      'exact moment she is being told why the librarian stopped, and a ' +
      'false reason there is the most expensive place in the room to be ' +
      'wrong. Her own sentence, pinned below, replaces it' },
  { file: 'server.py',
    s: 'stopped at the cost limit — every label found so far is saved.',
    why: 'the tidy-up loop\'s half of the same false claim, retired under ' +
      'the same ruling. ⚠ THIS ONE HAD NEVER BEEN PINNED AT ALL, so it ' +
      'could have drifted in silence; the ban and the new identity pin ' +
      'below close that asymmetry together. Its replacement is not a ' +
      'second sentence but the SAME constant — her ruling was "same line ' +
      'both" (26.99-COPY.md §S-01a/S-01b)' },
  { file: 'LIBRARIAN.md',
    s: 'the room does not put a dollar figure on your screen, because it ' +
      'has no honest way to price three providers\' tokens without ' +
      'inventing a rate table that would age badly.',
    why: 'the document\'s billing sentence, retired by 26.99-10 under ' +
      'D-22. ⚠ IT WAS NOT STALE — IT WAS FALSIFIED BY A THING THIS PHASE ' +
      'BUILT: D-04\'s forecast is exactly the rate table the sentence ' +
      'swore the room would never invent, and the room now shows one ' +
      'rounded-up bound before the expensive action. Its second clause is ' +
      'the more dangerous half: it promised the reason the room would ' +
      'never price anything, so a reader meeting it would take the ' +
      'forecast for a defect. Banned rather than merely replaced, because ' +
      'a document is the one surface nobody re-reads — a false sentence ' +
      'there can stand for years. ⚠ THIS IS THE FIRST BAN IN THIS LIST ' +
      'WHOSE FILE IS A DOCUMENT, so the source it is checked against is ' +
      'the WHITESPACE-FLATTENED document, the same normalisation ' +
      'DOC_ANCHORS uses and for the same reason: LIBRARIAN.md is ' +
      'hard-wrapped and this sentence straddles three lines. Her ' +
      'replacement is pinned below' }
];

// LIBRARIAN.md's anchors, REWRITTEN to what Plan 09 left true. The retired
// pair was `ANTHROPIC_API_KEY` (the shell instruction, deleted here because it
// teaches a shell-history leak) and `included` (the retired billing-truth
// word). ⚠ NEITHER FACT WENT AWAY — both MOVED, and the anchors move with
// them: the supported way to give the room a key is the setup command, and
// the billing truth is that the room shows no figure at all.
//
// Matched over a WHITESPACE-FLATTENED document, because LIBRARIAN.md is
// hard-wrapped and every phrase longer than a few words straddles a newline
// somewhere — the same normalisation tests/test_disclosure_truth.cjs uses,
// and for the same stated reason.
const DOC_ANCHORS = [
  ['python3 server.py --setup',
    'THE ONE COMMAND that gives the room a key. A document that says a key ' +
    'is one of the two ways to have a librarian and never says how one is ' +
    'given has disclosed nothing actionable'],
  ['## who answers',
    'the section that replaced the sign-in framing — three can answer, and ' +
    'the room names which one before anything is asked of it'],
  // ⚠ RE-CUT BY 26.99-10 UNDER D-22, IN ITS OWN COMMIT. What stood here
  // pinned the sentence "the room does not put a dollar figure on your
  // screen". D-04's forecast FALSIFIED it — the room now says one
  // rounded-up bound, once, immediately before the expensive action — so
  // the pin holds the OWNER'S REPLACEMENT instead, byte-for-byte from
  // 26.99-COPY.md §S-02 (#77). ⛔ No agent wrote a word of it. The
  // superseded sentence is BANNED in RETIRED_CLAIMS above rather than
  // merely unpinned, so it cannot creep back into the document later.
  // ⚠ The anchor is the half of her sentence that carries BOTH new facts —
  // that an estimate is shown ahead of time, and that it is not a bill —
  // because those two together are what D-04 made true.
  ['this app will show you the estimate ahead of time, please note this is not a bill provided by your AI service provider',
    'THE BILLING TRUTH, IN HER WORDS (D-22, #77 §S-02). The room DOES put ' +
    'a figure on her screen now — one rounded-up bound, once, before the ' +
    'expensive action — and the same sentence says in her own register ' +
    'that it is not the bill. The provider\'s own usage page remains the ' +
    'authority, and the clause naming it survives above this one']
];

// ---- the small readers the checkers share ---------------------------------

// One top-level python def body: from its `def` line to the next line that
// starts a top-level def/class. librarian_call.py's builders are all
// top-level, so this is exact rather than heuristic.
function pyDefBody(src, name) {
  const lines = src.split('\n');
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('def ' + name + '(') === 0) { at = i; break; }
  }
  if (at === -1) { return null; }
  for (let j = at + 1; j < lines.length; j++) {
    if (/^(def |class )/.test(lines[j])) {
      return lines.slice(at, j).join('\n');
    }
  }
  return lines.slice(at).join('\n');
}

// Comment-strippers that PRESERVE LINE COUNT (blanked, never removed), so a
// violation can still name a real line in the real file.
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) {
      return m.replace(/[^\n]/g, ' ');
    })
    .split('\n')
    .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
    .join('\n');
}

function stripPyComments(src) {
  return src.split('\n')
    .map(function (l) { return /^\s*#/.test(l) ? '' : l; })
    .join('\n');
}

// ⚠ A PYTHON DOCSTRING IS NOT A `#` COMMENT, and 26.94-02 turned the spawned
// -site pin red TWICE from prose that survived the comment strip. Any checker
// that reads python source for a CALL must strip both, or it is measuring
// prose about code. Blanks the span, preserving line count, so a violation can
// still name a real line.
//   NARROW BY CHOICE: a naive triple-quote span walker, no string-literal
//   state machine. It is applied to product source that holds no triple-quoted
//   data literals, and widening it would buy nothing but a second thing to be
//   wrong. Its work is PROVED by a mutation, not asserted here.
function stripPyDocstrings(src) {
  return src.replace(/("""|''')[\s\S]*?\1/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

function flattenDoc(src) {
  return String(src).replace(/\s+/g, ' ');
}

// ---- the checkers ----------------------------------------------------------

function subprocessSiteViolations(py) {
  const out = [];
  const calls = py.match(/subprocess\.(?:run|Popen)\s*\(/g) || [];
  if (calls.length !== SERVER_SUBPROCESS_SITES) {
    out.push('[librarian] server.py: expected exactly ' +
      SERVER_SUBPROCESS_SITES + ' spawned call site(s) — the on-device ' +
      'reader inside run_vision_pass (26.94), that one and no others; the ' +
      'vault tidy-up that used to be the other was DELETED (#56) — found ' +
      calls.length + '. See the constant\'s comment for the number this ' +
      'becomes next and why.');
  }
  return out;
}

// (26.94-04, V9) THE VISION DERIVATION CALLS THE FENCE — IT DOES NOT COPY IT.
//
// `study_lib.vision_path_list` decides which of her photographs a spawned
// program is allowed to open. `_librarian_fenced`'s union carries FIVE classes
// — a missing item, an unknown state (fail-closed), never_show/retired, the
// trigger overlay, and the keys-file path class — plus the active-filter
// match. A copy would drift from it the first time one of those moved, and law
// 5 calls a drift in the never-list a P0. So the requirement is not "the
// derivation excludes fenced items", which a copy also satisfies on the day it
// is written; it is that there is ONE implementation.
//
// ⚠ TWO INDEPENDENT INSTRUMENTS, AND NEITHER IS REDUNDANT — the same standing
// rule as the seam pin above. THIS one reads the source text and asserts the
// predicate is CALLED. `tests/test_vision_fence.py` drives the real derivation
// over a real store and asserts the fenced ids are ABSENT, and carries a
// permanent drill that patches a hand-rolled copy missing one class at a time
// over the module global. A source read cannot prove behaviour; a behaviour
// test cannot tell a call from a faithful copy. Do not delete either as
// duplication.
//
// ⚠ HOW THIS FIRES, since it is not obvious: like every other checker in this
// file, it is invoked as one of the drill's UNMUTATED CONTROLS at the foot of
// the file, so a red pin surfaces as `[drill] CONTROL RED: the vision
// derivation calls the fence …` alongside the line below. Observed, not
// assumed — the removal was planted in the shipped study_lib.py three ways and
// each turned this suite red (26.94-04).
//
// ⚠ SLICED BY NAME, NEVER BY LINE NUMBER — study_lib.py has moved repeatedly.
// And read over source with BOTH `#` comments and docstrings stripped: the
// shipped function names the predicate in prose on purpose (that sentence is
// what stops the copy coming back), so a checker reading raw text would be
// green on a function that had stopped calling it. Both strips are drilled.
// The one call site, by its two-line shape. Only vision_path_list counts a
// `fenced` reason, so this is exact rather than heuristic — see the drill.
const VISION_FENCE_SITE =
  '        if _librarian_fenced(item, filters):\n' +
  '            report["fenced"] += 1';

function visionFenceCallViolations(lib) {
  const out = [];
  const code = stripPyDocstrings(stripPyComments(lib));
  const body = pyDefBody(code, 'vision_path_list');
  if (body === null) {
    out.push('[librarian] study_lib.py: def vision_path_list is gone — the ' +
      'one place the Vision pass decides which photographs may be opened. ' +
      'If it moved, move this pin with it (SRM-13, D-05).');
    return out;
  }
  if (body.indexOf('_librarian_fenced(') === -1) {
    out.push('[librarian] study_lib.py: vision_path_list no longer CALLS ' +
      '_librarian_fenced — the derivation that decides which of her ' +
      'photographs a spawned program may open must use the shipped fence ' +
      'predicate, never a copy of its classes. A copy drifts, and law 5 ' +
      'calls a drift in the never-list a P0 (D-05, SRM-13).');
  }
  return out;
}

// ---- (26.94-03, V6 static half) WHAT THE ROOM SAYS ABOUT PHOTOGRAPHS -------
//
// D-03: a stranger with no Command Line Tools gets a complete room, no photo
// reading, and IS TOLD SO — in Manage as well as at the front door. Three
// claims, and the third is the one nobody would think to write down:
//
//   1. the Manage sentence exists, BYTE-EXACT (#35's already-resolved
//      wording, approved verbatim by the owner on 2026-08-13);
//   2. it is rendered ONLY behind the server's boolean — an unconditional
//      line passes claim 1 perfectly and then tells every user of a healthy
//      machine that their room is broken;
//   3. the browser is handed a BOOLEAN and NOTHING ELSE (T-26.94-16): no
//      toolchain path, no version, no which-of-the-two-candidates. The
//      sentence Manage renders is identical in every absent case anyway, so
//      the detail buys nothing and a screenshot would carry it away.
//
// ⚠ READ OVER COMMENT-STRIPPED SOURCE, BOTH LANGUAGES. app.js names the
// wording decision in prose beside the constant (that comment is what stops a
// later reader "fixing" photos/photographs), and server.py's own docstring
// names the path helpers it must not hand over. A checker reading raw text
// would be green on a render that had been deleted and on a handler that had
// started leaking. Both strips are drilled below.
//
// ⚠ THE FOURTH-STAGE LINE IS PINNED THOUGH NOTHING RENDERS IT YET. The owner
// declined deferring it; the surface is a later plan's. Pinning it now is
// what stops the value drifting between approval and use.
const CLT_MANAGE_COPY =
  'Reading photos — needs Xcode Command Line Tools — xcode-select --install';
const CLT_STAGE_COPY = 'reading your photographs — ';

// `pyDefBody` anchors on column 0, and this one is a METHOD. Same shape,
// sliced at its own indent so a sibling method ends it.
function pyMethodBody(src, name) {
  const lines = src.split('\n');
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s+def /.test(lines[i]) &&
        lines[i].indexOf('def ' + name + '(') !== -1) { at = i; break; }
  }
  if (at === -1) { return null; }
  const indent = lines[at].match(/^\s*/)[0];
  for (let j = at + 1; j < lines.length; j++) {
    if (lines[j].indexOf(indent + 'def ') === 0 ||
        /^(def |class )/.test(lines[j])) {
      return lines.slice(at, j).join('\n');
    }
  }
  return lines.slice(at).join('\n');
}

function cltCopyViolations(app, py) {
  const out = [];
  const code = stripJsComments(app);
  const pycode = stripPyDocstrings(stripPyComments(py));

  if (code.indexOf(CLT_MANAGE_COPY) === -1) {
    out.push("[layout] app.js: the librarian section's Command Line Tools " +
      "sentence is gone or reworded — it is #35's resolved wording, " +
      'approved verbatim by the owner, and it is the ONLY place in the room ' +
      'a stranger learns why photo reading is missing (D-03). Fix the ' +
      'source, never this gate.');
  }

  if (!/librarian\.photo_reading_ok\s*===\s*false\s*\?[\s\S]{0,400}CLT_MISSING_COPY/
    .test(code)) {
    out.push('[layout] app.js: the Command Line Tools sentence must render ' +
      'ONLY behind librarian.photo_reading_ok === false. Unconditional, it ' +
      'tells every user whose machine is perfectly healthy that their room ' +
      'is broken; on a falsy test, an older server that omits the field ' +
      'produces the same false alarm. Absent means SILENCE.');
  }

  if (code.indexOf(CLT_STAGE_COPY) === -1) {
    out.push("[layout] app.js: the reading pass's stage line is gone or " +
      'reworded — the owner approved it on 2026-08-13 in the same ruling as ' +
      'the other two, and it is the sentence she reads for about twenty ' +
      'minutes while the pass runs.');
  }

  if (!/"photo_reading_ok":\s*photo_reading_available\(\)/.test(pycode)) {
    out.push('[librarian] server.py: the librarian status answer must carry ' +
      'photo_reading_ok, and its value must be photo_reading_available() — ' +
      'ONE origin for the boolean, so no surface re-derives presence from a ' +
      'path (T-26.94-16).');
  }

  const body = pyMethodBody(pycode, 'handle_librarian_status');
  if (body === null) {
    out.push('[librarian] server.py: def handle_librarian_status is gone — ' +
      'the one route that feeds the Manage librarian section. If it moved, ' +
      'move this pin with it.');
  } else if (/_swiftc_path\s*\(|_vision_swift_path\s*\(|_CLT_TOOLCHAIN_SWIFTC/
    .test(body)) {
    out.push('[librarian] server.py: handle_librarian_status names a ' +
      'TOOLCHAIN PATH. A boolean crosses to the browser and nothing else — ' +
      'no path, no version, no which-candidate-matched. The sentence the ' +
      'page renders is the same in every absent case, so the detail buys ' +
      'nothing and a screenshot carries it away (T-26.94-16).');
  }

  return out;
}

// (W3) THE WIRING CLAIM, TRANSLATED FROM A STDIN FEED TO A REQUEST BODY.
//
// The shipped pin asserted that the seam's standard input was textually the
// fence builder's return. There is no standard input. The SAME chain is
// asserted at its new shape, in two halves: server.py still assigns the
// builder's return and still names the one choke point, and the choke point's
// `payload_text` rides the user message VERBATIM in all three builders — the
// `[,}]` boundary is what refuses a wrapper sentence, a prefix or a suffix.
//
// ⚠ THE HONEST CAVEAT, in this suite's own voice: THIS PROVES WHAT THE APP
// SENDS, NOT WHAT THE PROVIDER DOES WITH IT AFTERWARD (#24). That second half
// is a contractual fact no test in any repo can observe, and the sentence
// belongs here rather than in a summary nobody re-reads.
//
// ⚠ THE OTHER HALF OF THIS CLAIM lives in tests/test_call_seam.py
// (`seam_violations` / `request_violations`), which asserts the same thing on
// a RECORDED REQUEST BODY through an injected fake transport. TWO INDEPENDENT
// INSTRUMENTS: this one reads the source text, that one drives the real
// builders. Neither is redundant; do not delete either as duplication.
function seamWiringViolations(py, seam) {
  const out = [];
  if (!/payload\s*=\s*study_lib\.build_librarian_payload\s*\(/.test(py)) {
    out.push('[librarian] server.py: the builder wiring is ' +
      'missing (payload = study_lib.build_librarian_payload(...))');
  }
  if (!/librarian_call\.call_librarian\s*\(/.test(py)) {
    out.push('[librarian] server.py: no call site names the choke point ' +
      'librarian_call.call_librarian( — store bytes reach a model through ' +
      'that one function and nowhere else (SRM-13)');
  }
  if (!/def call_librarian\(job, payload_text, routing\)/.test(seam)) {
    out.push('[librarian] librarian_call.py: call_librarian must take ' +
      'exactly (job, payload_text, routing) — a caller may name a job and ' +
      'nothing else (D-01), and the middle parameter is the builder\'s return');
  }
  SEAM_BUILDERS.forEach(function (b) {
    const body = pyDefBody(seam, b.fn);
    if (body === null) {
      out.push('[librarian] librarian_call.py: def ' + b.fn + ' is missing — ' +
        'the ' + b.provider + ' adapter has no request builder, so nothing ' +
        'carries the payload for it');
      return;
    }
    if (!/"content":\s*payload_text\s*[,}]/.test(body)) {
      out.push('[librarian] librarian_call.py: ' + b.fn + ' does not carry ' +
        'payload_text verbatim as the user message ("content": payload_text) ' +
        '— the W3 wiring claim, carried across to the request body');
    }
  });
  return out;
}

// (2) WHAT REPLACED THE ARGV-ISOLATION ROSTER.
//
// Three of the five guarantees the old command line gave are VACUOUS on a
// plain request: there is no built-in tool roster to empty, no ambient local
// configuration to refuse and no interactive approval loop to switch off.
// Pinning their absence would be pinning nothing. ⚠ REMOVING THEM WITH NO
// REPLACEMENT WOULD LOSE A LAYER OF THE FENCE, so #24 names what stands in
// their place and it is asserted here, each naming the pin it replaces:
//   * the job row's prompt is placed as an EXPLICIT request field by every
//     adapter (replaces the retired replaced-prompt argv pin);
//   * the OpenAI body carries `store: false` (replaces the retired
//     no-session-persistence argv pin — without it the exchange is kept
//     server-side for 30 days, retrievable by id);
//   * exactly ONE function opens a connection (replaces the retired binary
//     look-up, which asked whether a program existed at all).
//
// ⚠ SCOPE, SAID OUT LOUD: the connection-opener count is asserted over
// `librarian_call.py`, which is where the seam lives. The whole-app form of
// that claim belongs to tests/test_librarian_fence.py and to
// tests/test_call_seam.py, and a count asserted over a file this gate has not
// read would be a claim the gate cannot keep.
function seamIsolationViolations(seam) {
  const out = [];
  SEAM_BUILDERS.forEach(function (b) {
    const body = pyDefBody(seam, b.fn);
    if (body === null) { return; }   // already named by the wiring checker
    if (body.indexOf('job_row["prompt"]') === -1) {
      out.push('[librarian] librarian_call.py: ' + b.fn + ' does not place ' +
        'the job row\'s prompt as an explicit request field — nothing ' +
        'populates it for you, so the app owns 100 percent of what goes ' +
        'there and must set it unconditionally (#24)');
    }
  });
  const openai = pyDefBody(seam, 'build_openai_request');
  if (openai !== null && !/"store":\s*False/.test(openai)) {
    out.push('[librarian] librarian_call.py: the OpenAI body does not carry ' +
      'store: false — without it her fenced payloads sit on someone else\'s ' +
      'server for 30 days, retrievable by id (#24)');
  }
  const opens = seam.match(/urlopen\s*\(/g) || [];
  if (opens.length !== 1) {
    out.push('[librarian] librarian_call.py: expected exactly 1 ' +
      'connection-opening call in the seam — found ' + opens.length);
  }
  const transport = pyDefBody(seam, '_real_transport');
  if (transport === null || transport.indexOf('urlopen(') === -1) {
    out.push('[librarian] librarian_call.py: the one connection-opener must ' +
      'live inside _real_transport — a second opener anywhere else is a ' +
      'second path out of this machine');
  }
  return out;
}

// (JOBS) THE TWO SCHEMA CLAIMS, MOVED FROM A CALL-SITE REGEX TO THE TABLE.
//
// Their claim was never "this regex matches" — it was THIS SCHEMA REACHES THE
// CHOKE POINT, so this path inherits the fence rather than re-implementing it.
// The old shape proved it by matching a call-site signature; the signature
// changed by decision (a caller now names a JOB and nothing else, D-01). The
// new shape proves it AT THE TABLE, and is stronger than the regex it
// replaces: the row's IDENTITY is asserted — which schema, for which job — so
// a row pointing at the wrong literal fails here instead of passing an
// existence check the shipped comment already called too weak.
function jobRowViolations(py, seam) {
  const out = [];
  const bound = {};
  const re =
    /bind_job_literals\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(py)) !== null) { bound[m[1]] = m[2]; }
  JOB_ROWS.forEach(function (row) {
    const job = row[0];
    const schema = row[1];
    if (!(new RegExp('"' + job + '":\\s*\\{')).test(seam)) {
      out.push('[librarian] librarian_call.py: the JOBS table has no row for ' +
        'the job "' + job + '" — the schema it is meant to inherit has no ' +
        'home, and the tier it sits in cannot be data any more');
    }
    if (bound[job] === undefined) {
      out.push('[librarian] server.py: the job "' + job + '" is never bound ' +
        'to a schema (bind_job_literals) — an unbound row is refused loudly ' +
        'at the seam, so this path would never reach the choke point at ' +
        'all. ' + row[2]);
    } else if (bound[job] !== schema) {
      out.push('[librarian] server.py: the "' + job + '" row names ' +
        bound[job] + ' where ' + schema + ' is owed — a row pointing at the ' +
        'wrong literal would put one job\'s schema on another job\'s call. ' +
        row[2]);
    }
  });
  return out;
}

function retiredClaimViolations(sources) {
  const out = [];
  RETIRED_CLAIMS.forEach(function (c) {
    const src = sources[c.file];
    const at = src.indexOf(c.s);
    if (at !== -1) {
      out.push('[librarian] ' + c.file + ':' + lineOf(src, at) +
        ' still carries the RETIRED claim ' +
        JSON.stringify(c.s.slice(0, 46)) + '… in live code — ' + c.why);
    }
  });
  return out;
}

function docAnchorViolations(docFlat) {
  const out = [];
  DOC_ANCHORS.forEach(function (pair) {
    if (docFlat.indexOf(pair[0]) === -1) {
      out.push('[librarian] LIBRARIAN.md: doc anchor missing: "' + pair[0] +
        '" — ' + pair[1]);
    }
  });
  return out;
}

// ---- Suite extension (26-01, REWRITTEN 26.93-10): the call seam -------------
//
// Contract pins — fix the source, never the gate. This block was authored in
// 26-01 to pin the librarian's ONE agent subprocess seam. Phase 26.93 replaced
// that seam: the room no longer starts a program to do its reading — one
// function makes one plain request, through three provider adapters, over one
// transport. Seven pins here asserted the shape of a command line that no
// longer exists; they are rewritten ONCE, at the end of the phase, when
// nothing else moves underneath them.
//
// ⚠ THE CLAIMS SURVIVE; ONLY THE EVIDENCE MOVES. Where a claim genuinely went
// away with the mechanism it is deleted WITH ITS REASON NAMED, and the
// guarantee it stood for is named too — a retired claim wearing a new body
// reads as coverage that is not there.
//
// Held redundantly with tests/test_librarian_fence.py (the property suite) and
// tests/test_call_seam.py (the serialized-request gate, through an injected
// fake transport): gutting the fence must fail at least two independent
// suites. Additive only: nothing above this block changed.

(function () {
  const py = readSource('server.py');
  const lib = readSource('study_lib.py');
  const seam = readSource('librarian_call.py');

  // (1) THE SPAWNED-SITE COUNT, asserted by equality against the named
  // constant above — whose comment carries the whole history, the reason each
  // removed site left, the one that survives, and the number the NEXT phase
  // makes it. Rewritten 3 -> 1 by 26.93-10.
  subprocessSiteViolations(py).forEach(function (v) { violations.push(v); });

  // (1b) the two trust tiers stay provably SEPARATE. The privileged vault
  // site is the ONLY place permissions are bypassed — losing this pin means
  // the tiers blurred. Fix the source, never the gate.
  //
  // ⚠ ITS TWIN DIED WITH THE SUBPROCESS (26.93-10), AND THE DELETION IS
  // RECORDED RATHER THAN SILENT. A second half asserted that the hermetic
  // librarian's command line still carried its empty tool roster and its
  // empty setting-source list. A plain request has neither — there is no
  // built-in tool roster to empty and no ambient local configuration to
  // refuse — so pinning their absence would be pinning nothing. ⚠ THE
  // GUARANTEE THEY STOOD FOR DID NOT DIE: it moved, and it is asserted at (2)
  // below and in tests/test_call_seam.py's serialized-request gate.
  // ⚠⚠ REWRITTEN 26.95-01, NOT DELETED — AND THE ASSERTION IS INVERTED.
  // #56's ruling deleted the privileged tier itself, so there is no longer a
  // second tier to separate from the hermetic one. What was "bypassed exactly
  // once, and only there" is now "never, anywhere". Deleting the pin would
  // erase the record that a permission-bypassed agent was once in this file
  // and needed walling off, and a deletion-shaped fix cannot be told apart
  // from lost coverage — the same convention RETIRED_CLAIMS follows for copy.
  // ⚠ IT ALSO GUARDS THE RETURN: re-introducing the shape now trips this, so
  // a future agent cannot quietly re-add what the owner ruled out.
  if ((py.match(/bypassPermissions/g) || []).length !== 0) {
    violations.push('[librarian] server.py: "bypassPermissions" must not ' +
      'appear at all — the privileged vault tidy-up was DELETED (#56), and ' +
      'the only spawned site left reads her own photographs with no network, ' +
      'no prompt and no elevated permission');
  }

  // (1c) ⚠⚠ REWRITTEN THE SAME WAY, AND FOR THE SAME REASON. It used to
  // require the privileged site to be wrapped in sandbox-exec and to fail
  // closed without it. With that site gone there is nothing left in the
  // shipped app that needs confining — so the pin now asserts the sandbox
  // machinery is ABSENT. ⚠ THE GUARANTEE DID NOT DIE, IT WAS SATISFIED
  // STRUCTURALLY: a permission-bypass agent over untrusted web-clipping
  // content may never run unconfined, and it can no longer run at all.
  if (py.indexOf('sandbox-exec') !== -1 ||
      py.indexOf('_vault_sandbox_profile') !== -1) {
    violations.push('[librarian] server.py: the sandbox wrapper must be ' +
      'GONE — it existed only to confine the deleted vault tidy-up, and its ' +
      'return would mean a permission-bypass agent came back with it');
  }

  // (2) THE ISOLATION CLAIMS, MOVED FROM AN ARGV ROSTER TO THE REQUEST.
  //
  // The roster this replaces named seven literals — a permission mode, an
  // empty tool list, a replaced prompt, a turn cap, an empty setting-source
  // list, a no-persistence switch and a binary look-up — and every one of them
  // asserted the shape of a command line. There is no command line. Three
  // properties of the SERIALIZED REQUEST stand in their place; the checker's
  // own comment names which retired pin each one replaces, and says plainly
  // which of the seven were vacuous on a plain request rather than lost.
  seamIsolationViolations(seam).forEach(function (v) { violations.push(v); });

  // (3) WIRING pin (checker W3 — presence alone is too weak): what the choke
  // point sends is textually the fence builder's return. Rewritten by
  // 26.93-10 from a standard-input feed to the request body; the claim is
  // unchanged and the checker's own comment carries the caveat and names the
  // second instrument.
  //
  // Variables pinned BY NAME: `payload` (assigned only from
  // study_lib.build_librarian_payload in librarian_payload_text) and
  // `payload_text` (the choke point's own parameter) — renaming either
  // consciously edits this pin. Sanctioned NON-builder payload classes
  // (AI-SPEC checker W2 — exactly FIVE, consciously extended 2->4 by
  // 26.7-01 and 4->5 by 26.87-10): (1) the notebook digest (aggregate
  // counts + shelf words only, never item ids/titles/bodies; 26-03),
  // (2) the dismissed-topics list (the user's own phrasings; 26-03),
  // (3) the model's own prior structured output, re-entrant — the prior
  // draft (26.7) and, WIDENED by 26.87-10, the TITLES and derived
  // opening-SHAPE TOKENS of prior drafts (the variation memory: still
  // the model's own prior output handed back, so this is a widening of
  // an existing class, not a new one; an opening rides as a five-token
  // label, never as a sentence), (4) her chat messages (user-authored by
  // definition; 26.7), and (5) NEW with 26.87-10 — the IDENTITY ANCHORS:
  // store-derived theme and folder tokens plus her own verbatim comment
  // phrases. That fifth one IS a new class, and its fence argument is
  // this: the anchors are built through the SAME shipped _librarian_fenced
  // predicate the builder uses (called, never copied), so no fenced item
  // can contribute a token; tokens come from tags / folder facet / topic
  // slug and NEVER from a title or a body; and the phrases are her own
  // words, already sanctioned. NOTE — this count line is a COMMENT, not
  // an executed assertion, which is exactly why it must be edited on
  // purpose rather than noticed later. All five are composed into the
  // caller's own document, so they ride the ONE recorded request body and
  // every fence scan sees them. Anything else in that body is a leak.
  seamWiringViolations(py, seam).forEach(function (v) { violations.push(v); });
  if (lib.indexOf('def build_librarian_payload') === -1) {
    violations.push('[librarian] study_lib.py: def ' +
      'build_librarian_payload is missing — the fence builder must exist');
  }

  // (3b) FAIL-OPEN render pin (checker W4 — cheap client-side hardening).
  // 2026-07-19: 26-01 ships NO client-side librarian surface (app.js is
  // deliberately untouched); the status-gated render block arrives with
  // 26-02's suggestions UI. Pinning against absent code would pin a lie,
  // so today's pin is the honest inverse: the moment app.js gains ANY
  // librarian code, it must also carry the `librarian.available` gate —
  // and 26-02 MUST extend this into per-entry-point ordered-index pins
  // when the DOM-writing functions land. No browser harness exists; this
  // static pin + the 26-05 human walk are the two layers.
  const appSrc = readSource('app.js');
  if (/librarian/i.test(appSrc) &&
      appSrc.indexOf('librarian.available') === -1) {
    violations.push('[librarian] app.js: librarian code appeared without ' +
      'the librarian.available fail-open gate — extend the 26-01 W4 pin ' +
      'with the real render entry points');
  }

  // (4) copy pins (the Suite-4 style, additive): the plain-words fail-open
  // line, byte-exact, on ONE source line in server.py.
  //
  // ⚠ THIS ROSTER WAS TWO AND IS NOW ONE (26.93-10). Its second member was
  // the sign-in sentence, and it is gone from server.py on purpose: the two
  // constants that answered "is the program set up" and "is it new enough"
  // were deleted with the questions themselves (26.93-07), because nothing
  // behind the librarian is an installed program any more. Availability is
  // asked of the routing object instead. ⚠ THE SENTENCE IS NOT MERELY
  // UNPINNED — it is BANNED, in RETIRED_CLAIMS above, so it cannot creep
  // back: a stranger sent to install and sign in to a tool the product
  // stopped using is being told to fix a room that already works.
  //
  // ⚠ REWRITTEN TO THE OWNER'S OWN SENTENCE, WRITTEN ON COPY PASS #77
  // (2026-08-14). The survivor pinned here had been literally true where it
  // was used — the deleted vault tidy-up really did call a `claude` binary —
  // and #56's deletion removed that site, leaving the word "Claude" naming
  // the wrong company on a line the room raises when its OWN code faults and
  // the answerer may be Ollama or OpenAI. She named the model instead of a
  // company, which matches her approved setup disclosure's own vocabulary,
  // and she dropped "try again in a moment": a code fault is not a passing
  // condition, so the remedy was a promise nobody could keep.
  ["the librarian couldn't reach the model just now — nothing was lost."
  ].forEach(function (copy) {
    if (py.indexOf(copy) === -1) {
      violations.push("[librarian] server.py: pinned fail-open copy " +
        "missing: '" + copy + "'");
    }
  });

  // (5) one-shot only: the session-resuming command-line spellings must not
  // appear anywhere in server.py (they have no other legitimate use there —
  // pinned as ABSENCE over the whole file).
  //
  // ⚠ ITS SUBJECT NARROWED WITH THE PHASE (26.93-10), AND THE PIN IS KEPT
  // RATHER THAN DELETED BECAUSE IT STILL NAMES A FAILURE IT PREVENTS. The
  // librarian half became vacuous — there is no command line behind the
  // librarian to hand a session flag to, and its no-persistence twin at (2)
  // is now a field on the request body instead. What remains is real: the ONE
  // surviving spawned site is the vault tidy-up (#44), and a resumable
  // session there would let a permission-bypassed agent over untrusted
  // web-clipping content carry state between runs.
  ['--continue', '--resume', '--session-id'].forEach(function (t) {
    if (py.indexOf(t) !== -1) {
      violations.push("[librarian] server.py: one-shot only — the " +
        "session-resuming spelling '" + t + "' must not appear anywhere");
    }
  });
})();

// ---- Suite extension (26.93-10): the claims that were RETIRED, as bans -----
//
// ⚠ A TEST THAT PINNED COPY THE OWNER LATER REMOVED GETS REWRITTEN, NEVER
// DELETED — the 26.91-04 disposition, applied again. Deleting these pins would
// erase the record that these exact words were once REQUIRED, and a
// deletion-shaped fix is indistinguishable from losing coverage. So the eight
// sentences this phase removed keep their identity here and now pin the
// OPPOSITE: absent, by exact literal, over comment-stripped source.
//
// ⚠ WHY THE ABSENCE IS THE PROPERTY THAT NOW MATTERS. #28 removed the
// subscription path and `detect_librarian_auth` with it, so the branch that
// used to guard the free-usage arm would read `undefined` and take it — on a
// machine holding a real paid key. Pinning these strings as PRESENT would pin
// a false statement about her money; pinning them ABSENT is what keeps it from
// coming back in the next paraphrase.
//
// ⚠ COMMENT-STRIPPED, DELIBERATELY. This repo writes long dated disposition
// notes beside every removal, and a raw scan tripped by its own prose is the
// FORBIDDEN_TOKENS defect one suite up — a text search that fails in both
// directions at once. Line numbers survive the stripping (comments are blanked
// in place, never removed), so a violation still names a real line.

(function () {
  retiredClaimViolations({
    'app.js': stripJsComments(readSource('app.js')),
    'server.py': stripPyComments(readSource('server.py')),
    // 26.99-10 (D-22): the first BANNED sentence whose file is a document.
    // ⚠ FLATTENED, NOT STRIPPED — a document has no code comments to blank,
    // and it IS hard-wrapped, so the banned sentence straddles three lines
    // and a raw indexOf would miss it. Same normalisation DOC_ANCHORS uses.
    'LIBRARIAN.md': flattenDoc(readSource('LIBRARIAN.md'))
  }).forEach(function (v) { violations.push(v); });
})();

// ---- Suite extension (26-02): librarian pre-sort copy + wiring pins ----------
//
// Contract pins — fix the source, never the gate. The pre-sort surface's
// locked copy (the D-02 consent card, the D-07 billing truth, the three
// shelf-card headings), the server's guardrail lines, the wiring
// markers, and the per-entry-point fail-open gates the 26-01 W4 inverse
// pin promised. Additive only: nothing above this block changed.

(function () {
  const app = readSource('app.js');
  const py = readSource('server.py');

  // (1) the locked surface copy, byte-exact over app.js — each string
  // lives as ONE contiguous source literal.
  // ⚠ THREE MEMBERS LEFT THIS ROSTER IN 26.93-10, and none of them is simply
  // gone: the free-usage sentence and the two cost-readout fragments are
  // BANNED in RETIRED_CLAIMS above, for the reason written there. Removing a
  // presence pin without adding the ban is how a deleted claim comes back.
  ["this reads what's newly arrived, on your own computer. nothing is sent anywhere and nothing is charged.",
    "your never-show, retired and trigger-marked things aren't read at all.",
    'the librarian can pre-sort what just arrived — want suggestions?',
    'sort by titles and dates', 'read and sort everything',
    'just titles and dates', 'yes — read and sort', 'sort the pile',
    'the librarian',
    'these look joyful — worth a look?',
    'these look like receipts and paperwork.',
    'these might be heavy — set aside unshown?',
    'set this aside without showing it?', 'set it aside',
    'set aside unshown', 'noted',
    'sorting — batch ',
    'look back in a little while.'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[librarian] app.js: pinned pre-sort copy " +
        "missing: '" + copy + "'");
    }
  });

  // (2) the server's guardrail lines, byte-exact, each on ONE source
  // line in server.py (busy / ceiling / usage-window — D-07's two
  // directions read from these).
  // ⚠⚠ THE CEILING SENTENCE IN THIS ROSTER WAS RE-CUT BY 26.99-06, UNDER
  // D-18, IN ITS OWN COMMIT. The one it replaced said the pass had stopped
  // at a cost limit. D-18 rules that the stop stays but is counted in WORK,
  // and the pass costs nothing — so that sentence was FALSE ABOUT HER MONEY,
  // on a surface she meets, and it is BANNED in RETIRED_CLAIMS above rather
  // than merely unpinned. The replacement is the OWNER'S OWN WORDS, from
  // #77's 26.99 slice (26.99-COPY.md §S-01a/S-01b): ⛔ no agent wrote,
  // completed, tidied or punctuated a character of it.
  ['the librarian is already sorting — let it finish first.',
    'The librarian has done enough to understand you. Nothing was lost.',
    "your Claude plan's usage window may be full — nothing is lost; run the librarian again and it picks up where it left off."
  ].forEach(function (copy) {
    if (py.indexOf(copy) === -1) {
      violations.push("[librarian] server.py: pinned guardrail line " +
        "missing: '" + copy + "'");
    }
  });

  // ⚠⚠ THE SECOND CEILING SITE, PINNED FOR THE FIRST TIME — the asymmetry
  // 26.99-01's pin inventory recorded is closed here. MEASURED before this
  // commit: LIBRARIAN_CEILING_MSG was byte-pinned and CLEAN_CEILING_MSG had
  // NO PIN AT ALL, so a change to the tidy-up's ceiling sentence was silent
  // — and the silent one is the one that drifts.
  //
  // It is pinned as an IDENTITY rather than as a second copy of the
  // sentence, and that is the whole point. Her explicit ruling on these two
  // slots was "same line both", and 26.99-COPY.md rule 3 says a sentence
  // needed in two places is applied from ONE constant, never typed twice. So
  // this asserts (a) the tidy-up's name IS the import loop's constant, and
  // (b) her sentence occurs EXACTLY ONCE as a literal in server.py —
  // because a second literal equal to the first is precisely the place the
  // two surfaces drift apart, and a presence pin alone cannot see one
  // arrive.
  (function () {
    // ⚠ THE SECOND SITE IS GONE, SO THE ALIAS IS TOO (2026-08-17). Her
    // ruling was "same line both" and the alias was how one constant served
    // two readers; #95 deleted the tidy-up's runaway loop, which was the
    // second reader. ⛔ What her ruling actually forbids — a SECOND LITERAL
    // equal to hers — is asserted below and is untouched by the deletion,
    // which is why that half is the half that had to survive. If a second
    // site ever returns, it returns as an alias of this constant and this
    // pin returns with it.
    const alias = 'CLEAN_CEILING_MSG';
    if (stripPyComments(py).indexOf(alias) !== -1) {
      violations.push('[librarian] server.py: CLEAN_CEILING_MSG is back in ' +
        'live code — the loop it spoke for was deleted (#95). A second ' +
        'ceiling name with no second loop is a sentence nothing can keep ' +
        'honest (26.99-06, D-18)');
    }
    // ⚠ THE TEST IS "MORE THAN ONE", NOT "EXACTLY ONE", AND THE DIFFERENCE
    // IS DELIBERATE. Zero occurrences is already the presence pin's own
    // claim, three lines up; asserting it a second time here would mean one
    // edit turning TWO pins red, and a drill can no longer tell which pin
    // it proved. What only this pin can see is a SECOND literal arriving —
    // the exact shape her "same line both" ruling forbids.
    const occurrences = py.split(
      'The librarian has done enough to understand you. Nothing was lost.').length - 1;
    if (occurrences > 1) {
      violations.push('[librarian] server.py: the ceiling sentence appears ' +
        occurrences + ' times as a literal — two literals are two chances ' +
        'for the two ceiling surfaces to disagree');
    }
  })();

  // (3) wiring markers: the three routes + the confirm via label ride
  // app.js; the membership-drop counter rides server.py; and the client
  // poll is the chained ONE-SHOT re-arm (a single deferred re-read
  // armed inside armLibrarianReread — nothing self-repeating exists).
  ['librarian/presort', 'librarian/progress', 'librarian/ack',
    'armLibrarianReread', 'librarian-suggestion-confirmed',
    'selectLibrarianSuggestions'
  ].forEach(function (marker) {
    if (app.indexOf(marker) === -1) {
      violations.push('[librarian] app.js: pre-sort wiring marker ' +
        "missing: '" + marker + "'");
    }
  });
  if (py.indexOf('unknown_id_verdicts') === -1) {
    violations.push('[librarian] server.py: the fail-visible ' +
      'membership-drop counter (unknown_id_verdicts) is missing');
  }
  if (!/function armLibrarianReread[\s\S]{0,700}setTimeout\s*\(/
    .test(app)) {
    violations.push('[librarian] app.js: armLibrarianReread must arm ' +
      'exactly one deferred one-shot re-read (setTimeout)');
  }

  // (4) per-entry-point fail-open pins — the 26-01 W4 inverse pin,
  // extended as promised: every librarian DOM writer gates on
  // librarian availability at its own top, so the no-AI room renders
  // zero librarian bytes by construction.
  ['refreshLibrarianArea', 'offerLibrarianAfterImport',
    'renderLibrarianOffer', 'renderLibrarianConsentCard',
    'startLibrarianPresort', 'readLibrarianProgress',
    'renderLibrarianProgress', 'readLibrarianSuggestions',
    'renderLibrarianSuggestions',
    // 26-04 (additive): the settings surface's writers join the
    // roster — the nine entries above are byte-identical.
    // refreshLibrarianSettings/renderLibrarianSettings render the
    // informed-consent card itself (disclosure + toggle — the ONE
    // sanctioned always-on librarian surface, T-26-17) and reference
    // the status gate at their tops; the run-state pair gates
    // run-flavored bytes on librarianOn exactly like the 26-02
    // writers; handleLibrarianToggle's librarian-flavored repaint
    // rides the gated refreshers (its failure line is neutral copy —
    // the toggle must work with the flag off).
    'refreshLibrarianSettings', 'renderLibrarianSettings',
    'readLibrarianRunState', 'renderLibrarianRunState',
    'handleLibrarianToggle'
  ].forEach(function (name) {
    const at = app.indexOf('function ' + name + '(');
    if (at === -1) {
      violations.push('[librarian] app.js: pre-sort entry point ' +
        'missing: ' + name);
      return;
    }
    const head = app.slice(at, at + 700);
    if (!/librarianOn\s*\(|librarian\.available/.test(head)) {
      violations.push('[librarian] app.js: ' + name + ' must gate on ' +
        'librarian availability at its top (the 26-01 W4 pin, ' +
        'extended)');
    }
  });
  // the gate helper itself reads the status answer's available flag
  if (!/function librarianOn[\s\S]{0,300}librarian\.available/
    .test(app)) {
    violations.push('[librarian] app.js: librarianOn must read ' +
      'librarian.available — the one availability gate');
  }
})();

// ---- Suite extension (26-04): librarian disclosure + settings pins -----------
//
// Contract pins — fix the source, never the gate. The disclosure IS the
// enable gate's legitimacy (T-26-17): the cloud sentence, the D-02
// local-line (copy-of-record here for the manage surface, shared with
// 26-02's consent card), the three auth lines, the D-07 billing truth,
// the toggle copy, and the run-state readout are pinned byte-exactly
// over app.js — each string ONE contiguous source literal. LIBRARIAN.md
// is the doc half of the same honesty: subscription = the self-use
// path, API key = the documented path for forks, and the app never
// touches a credential (T-26-18: no in-app credential entry exists —
// pinned as absence below). Additive only: nothing above this block
// changed.

(function () {
  const app = readSource('app.js');
  const html = readSource('index.html');

  // (1) the disclosure + settings copy, byte-exact over app.js.
  ['nothing here ever leaves this computer. when a job needs a big model, a copy of the text is sent to be read and the answer comes back — the thing itself stays where it is, and stays yours.',
    'your never-show, retired, and trigger-marked items stay on this machine — not even their titles are sent.',
    // ⚠ THREE MEMBERS LEFT THIS ROSTER IN 26.93-10 — the login line, the
    // free-usage line and the sign-in line. All three are BANNED in
    // RETIRED_CLAIMS above rather than merely unpinned: this pane is the
    // always-on Manage surface, which is the most prominent place in the room
    // a false statement about her money could stand.
    'using your API key — usage is billed to that key.',
    'let the librarian in',
    'the librarian is off — the room is fully yours alone.',
    'the librarian is in — it suggests, you decide.',
    'last sort: titles and dates only.',
    'last sort: full reading, by your ok that time.'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[librarian] app.js: pinned settings copy " +
        "missing: '" + copy + "'");
    }
  });

  // (2) toggle wiring: {librarian_enabled} rides the EXISTING /api/meta
  // POST (the 26-01 validator's one write path) — never a new route.
  if (!/apiPost\('\/api\/meta',\s*\{\s*librarian_enabled/.test(app)) {
    violations.push('[librarian] app.js: the toggle must POST ' +
      'librarian_enabled through the existing /api/meta discipline');
  }

  // (3) zero credential custody (D-01, T-26-18): the client and the
  // markup never name the key env var and carry no credential input —
  // auth setup lives in LIBRARIAN.md prose only.
  if (app.indexOf('ANTHROPIC_API_KEY') !== -1) {
    violations.push('[librarian] app.js: ANTHROPIC_API_KEY must not ' +
      'appear — auth setup lives in LIBRARIAN.md prose only (D-01)');
  }
  if (html.indexOf('ANTHROPIC_API_KEY') !== -1) {
    violations.push('[librarian] index.html: ANTHROPIC_API_KEY must ' +
      'not appear — auth setup lives in LIBRARIAN.md prose only (D-01)');
  }

  // (4) LIBRARIAN.md exists at the repo root and carries the doc's anchors.
  //
  // ⚠ THE ANCHORS MOVED WITH THE FACTS THEY NAMED (26.93-10), and neither
  // fact went away. The retired pair was the API-key path's environment
  // variable and the billing-truth word `included`. The first is gone from
  // the document because the instruction around it taught a shell-history
  // leak and `python3 server.py --setup` is the supported path now — the
  // shell override itself is still real, still true, and still described
  // there in words. The second is gone because #28 removed the subscription
  // path, and what is true in its place is that the room prices nothing at
  // all. An anchor may be UPDATED when the fact relocated; it may never be
  // dropped when a fact went away, and neither of these did.
  const docPath = path.join(ROOT, 'LIBRARIAN.md');
  if (!fs.existsSync(docPath)) {
    violations.push('[librarian] LIBRARIAN.md is missing — the ' +
      'auth/cost doc must exist at the repo root');
  } else {
    docAnchorViolations(flattenDoc(fs.readFileSync(docPath, 'utf8')))
      .forEach(function (v) { violations.push(v); });
  }
})();

// ---- Suite extension (26-03): desk note etiquette pins ------------------------
//
// Contract pins — fix the source, never the gate. The librarian's note is
// a gift the desk REVEALS, never generates (SRM-12, pull-only): the
// reveal copy, the two question actions, the ask affordance, and the
// wiring markers are pinned byte-exactly — each string ONE contiguous
// source literal. Server-side, the notes routes, the dismissal
// permanence file, and the note model constant are pinned as presence.
// Additive only: nothing above this block changed.

(function () {
  const app = readSource('app.js');
  const py = readSource('server.py');

  // (1) the desk reveal + check-in copy, byte-exact over app.js.
  ["there's a note on the desk.",
    "not this — don't ask again",
    "yes — I'll set that up",
    'ask for a note',
    'writing…',
    'the librarian left a note on the desk.',
    'no note this time.',
    'the librarian could not write just now.'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[librarian] app.js: pinned desk-note copy " +
        "missing: '" + copy + "'");
    }
  });

  // (2) wiring markers: the reveal list/read/dismiss routes and the
  // desk slot ride app.js — the reveal is READ-only by construction
  // (the desk path holds no presort/note POST; generation lives inside
  // user-initiated runs server-side).
  ['librarian/notes', 'librarian/read', 'librarian/dismiss',
    'revealDeskNotes', 'desk-note-slot'
  ].forEach(function (marker) {
    if (app.indexOf(marker) === -1) {
      violations.push('[librarian] app.js: desk-note wiring marker ' +
        "missing: '" + marker + "'");
    }
  });

  // (3) server pins: the notes-list route, the permanence file, the
  // note model constant, and the file-borne digest wiring.
  ['/api/librarian/notes', 'dismissed.json', 'LIBRARIAN_NOTE_MODEL',
    'notebook_digest'
  ].forEach(function (marker) {
    if (py.indexOf(marker) === -1) {
      violations.push('[librarian] server.py: note/check-in wiring ' +
        "missing: '" + marker + "'");
    }
  });

  // (4) the server's pinned plain-words lines, each ONE source line.
  ['the librarian is already writing — give it a moment.',
    'nothing blessed to draw from yet — the note comes from what you call safe.'
  ].forEach(function (copy) {
    if (py.indexOf(copy) === -1) {
      violations.push("[librarian] server.py: pinned note line " +
        "missing: '" + copy + "'");
    }
  });

  // (5) per-entry-point fail-open pins — the 26-02 roster, extended
  // additively: every desk-note DOM writer gates on librarian
  // availability at its own top, so the no-AI room renders zero
  // librarian bytes by construction.
  ['revealDeskNotes', 'renderDeskNoteCard', 'openDeskNote',
    'renderDeskQuestion', 'askLibrarianNote'
  ].forEach(function (name) {
    const at = app.indexOf('function ' + name + '(');
    if (at === -1) {
      violations.push('[librarian] app.js: desk-note entry point ' +
        'missing: ' + name);
      return;
    }
    const head = app.slice(at, at + 700);
    if (!/librarianOn\s*\(|librarian\.available/.test(head)) {
      violations.push('[librarian] app.js: ' + name + ' must gate on ' +
        'librarian availability at its top (the 26-01 W4 pin, ' +
        'extended)');
    }
  });
})();

// ---- Suite 5 (26.4-03): the no-absence-vocabulary gate (I2, law 3) ----------
//
// The shipped Suite 1 bans the SCHEDULER vocabulary (reminder/sched/cron/
// setInterval/...). This suite closes the OTHER law-3 half the byte-pins
// alone never cover: any NEW client copy that leaks a time-gap, an
// absence, a streak, or a quota fails here even if no one pinned the exact
// string. Product law 3 — "reward presence, never punish absence" — bans
// the vocabulary as well as the mechanism: no "N days ago", no "since your
// last visit", no "you were away", no "day streak", no "N left".
//
// SCAN SET = the CLIENT user-copy sources (index.html + app.js) — where
// every new candle/desk/insight string lands. server.py and study_lib.py
// are deliberately NOT scanned here: they carry the librarian's RUNTIME
// no-push ban-list (`_names_no_push`) as DATA — the very phrases below,
// listed so the agent's output is scanned for them — plus the law-3
// comments that NAME the prohibition to explain it. A static duplicate
// there would fail on its own definition. The server output is fenced at
// runtime by that list; this suite fences the source of the client copy.
//
// ⚠⚠ 26.95 (owner ruling, 2026-08-15): THIS SCAN NOW READS COMMENT-STRIPPED
// SOURCE, AND THE PARAGRAPH IT REPLACES IS KEPT BELOW SO THE CHANGE READS AS A
// CHANGE. What stood here said the patterns were LEAK-SHAPED on purpose —
// quantified ("N days ago", "N left") or copy-exact ("since your last visit",
// "day streak") — so that a law-3 NEGATION in a comment ("never a streak", "no
// counts of time away") passed while a positive surfacing failed.
//
// That reasoning holds for a NEGATION and fails for a QUOTATION. The way this
// repo writes a prohibition down is to QUOTE AN EXAMPLE of the thing it
// forbids, and a quoted example is leak-shaped by construction — it has to be,
// or it would not be an example. So the gate flagged its own documentation as
// though the product had shipped that copy. It cost THREE REWORKS IN ONE
// PHASE, in this phase, which is the evidence that the old shape was wrong
// rather than merely unlucky. A gate that cries wolf gets relaxed by the next
// person who trips it, which is how a real one stops being trusted.
//
// ⚠ THIS DOES NOT WEAKEN THE SCAN, AND THE REASON IS STRUCTURAL RATHER THAN A
// PROMISE: shipped copy is never in a comment. Every string this suite exists
// to catch is a string literal on its way to a DOM sink, or attribute/text
// content in the markup, and BOTH SURVIVE THE STRIP UNTOUCHED. The JS rule
// only blanks a line whose FIRST non-space characters are a double slash, so a
// double slash INSIDE a string literal is never touched; the HTML rule only
// blanks an HTML comment span. Neither rule can reach a shipped string.
//
// ⚠ AND BOTH FACTS ARE DRIVEN, NOT ASSERTED. Two instruments below, and
// neither is redundant: the STRIPPER PROBE proves the strippers' mechanics on
// a sample (remove the comment occurrence, keep the live one, keep the line
// count), and the SHIPPED-COPY CANARY proves them harmless on the REAL files
// by requiring real pinned copy to survive the real strip. A stripper that ate
// everything would make every pattern below pass on blank text — an instrument
// that cannot go red — and that is the failure this pair exists to make
// impossible. It is the worse outcome of the two by a wide margin: a false
// positive is an argument, a blind gate is a silence.
//
// ⚠ PRECEDENT FOLLOWED: tests/test_diegetic_wiring.cjs's `appCode` / `htmlCode`
// preparation (its groups 16b-16e), including its sentinel probe and for the
// same stated reason — it is the precedent that covers BOTH languages in this
// scan set, and the only one of the two that ships a probe. NOT
// tests/test_reformat_wiring.cjs's `stripComments`, DELIBERATELY AND FOR A
// NAMED REASON: that one strips a double slash ANYWHERE on a line (carving out
// only the `://` of a URL), so it cannot tell a double slash inside a string
// literal from a real comment and would truncate any shipped string carrying
// one — the exact blinding this ruling forbids. It also deletes rather than
// blanks, which would drift every line number this suite prints. Line numbers
// are load-bearing here (the violation names `file + ':' + (i + 1)`), so both
// strippers below BLANK IN PLACE and the reported line stays a real line in
// the real file.
//
// ⚠ THE ONE RESIDUAL, SAID OUT LOUD RATHER THAN LEFT TO BE DISCOVERED: a line
// whose first non-space characters are a double slash INSIDE a multi-line
// template literal would be blanked. This app writes its copy as single-quoted
// concatenated literals, so no such line exists today; the canary is what
// notices if one ever does. A per-character lexer that answers this exactly
// already exists in this file (`jsMask`/`codeOnly`, Suite 2) and is the
// available upgrade if that day comes — it was not taken now because it is a
// third shape, not one of the two precedents, and the residual it closes is
// currently empty.
//
// Fix the source (rephrase to "now" / present-tense), never weaken this gate.

// The HTML twin of `stripJsComments` above — an HTML comment span blanked in
// place, newlines kept, so a violation still names a real line in index.html.
// (test_diegetic_wiring.cjs's `htmlCode` REMOVES the span; it recomputes its
// own line through `lineOf` and can afford the drift. This suite reports the
// split index, so blanking is the shape that keeps its numbers true.)
function stripHtmlComments(src) {
  return String(src).replace(/<!--[\s\S]*?-->/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

(function () {
  // Per-file comment strip: app.js is JavaScript, index.html is markup. A NEW
  // SCAN SOURCE MUST BE GIVEN ITS OWN STRIPPER DELIBERATELY — the pairing is
  // the roster, so a file cannot be added and then scanned raw, which is
  // precisely the defect this block repairs.
  var ABSENCE_SOURCES = [
    { file: 'index.html', strip: stripHtmlComments },
    { file: 'app.js', strip: stripJsComments }
  ];

  var stripped = {};
  ABSENCE_SOURCES.forEach(function (src) {
    stripped[src.file] = src.strip(readSource(src.file));
  });

  // (i) THE STRIPPER PROBE (the test_diegetic_wiring 16b precedent). Each
  // stripper is DRIVEN before anything trusts it: it must remove a token that
  // sits in a comment and KEEP the one that sits in live source, and it must
  // not change the line count. The block-comment delimiters are BUILT from
  // their characters rather than written out, so this file never carries a
  // stray block-comment opener inside its own prose.
  [
    { name: 'stripJsComments', strip: stripJsComments,
      probe: ['  ' + '/' + '* sentinel_probe_token ' + '*' + '/',
        '  // sentinel_probe_token',
        '  var x = "sentinel_probe_token";'].join('\n') },
    { name: 'stripHtmlComments', strip: stripHtmlComments,
      probe: ['  <!-- sentinel_probe_token -->',
        '  <p>sentinel_probe_token</p>'].join('\n') }
  ].forEach(function (p) {
    var out = p.strip(p.probe);
    var hits = (out.match(/sentinel_probe_token/g) || []).length;
    if (hits !== 1) {
      violations.push('[no-absence] ' + p.name + ' left ' + hits +
        ' occurrence(s) of a token planted once in a comment and once in ' +
        'live source — expected exactly 1. Too many and this suite is still ' +
        'reading comments (the defect this strip repairs); too few and every ' +
        'law-3 pattern below is structurally unable to go red.');
    }
    if (out.split('\n').length !== p.probe.split('\n').length) {
      violations.push('[no-absence] ' + p.name + ' changed the line count — ' +
        'this suite reports a violation by split index, so a stripper that ' +
        'adds or removes lines makes every line number it prints a lie.');
    }
  });

  // (ii) THE SHIPPED-COPY CANARY. The probe proves the strippers' mechanics on
  // a sample; this proves them harmless on the REAL files. Every string below
  // is pinned as PRESENT in RAW source by another block in this same file, so
  // it is independently known to be there — what is asserted here is that it
  // is STILL there after the strip.
  //
  // ⚠ IF ONE OF THESE GOES RED, READ THE MESSAGE BEFORE EDITING ANYTHING.
  // There are exactly two causes and they need OPPOSITE fixes: either the copy
  // was removed or reworded (fix the source, and this roster, deliberately),
  // or the stripper is eating shipped strings (fix the stripper). NEVER delete
  // a canary to clear this — the canary is the only thing standing between
  // this suite and a permanently green blind spot.
  var COPY_CANARIES = [
    // app.js. The first two are additionally proven to survive THIS EXACT
    // stripper by cltCopyViolations above, which already asserts them over
    // stripJsComments(app) — they are the zero-risk anchors of this roster.
    { file: 'app.js', s: CLT_MANAGE_COPY },
    { file: 'app.js', s: CLT_STAGE_COPY },
    { file: 'app.js', s: 'you can close this; the room will be ready.' },
    { file: 'app.js', s: 'Stats (on this device only)' },
    { file: 'app.js', s: "there's a note on the desk." },
    // index.html — the two room chrome links, a blessing verb, a heading.
    { file: 'index.html', s: 'back to the room' },
    { file: 'index.html', s: 'manage your library' },
    { file: 'index.html', s: 'joyful — bring it back' },
    { file: 'index.html', s: 'Your photos' }
  ];

  COPY_CANARIES.forEach(function (c) {
    if (stripped[c.file].indexOf(c.s) === -1) {
      violations.push('[no-absence] ' + c.file + ': the shipped-copy canary ' +
        JSON.stringify(c.s.slice(0, 46)) + ' does not survive the comment ' +
        'strip. EITHER that copy was removed or reworded (fix the source and ' +
        'this roster, deliberately) OR the stripper is eating shipped ' +
        'strings — in which case every law-3 pattern below is reading less ' +
        'than the product actually ships, and is green because it is blind. ' +
        'Never delete the canary to clear this.');
    }
  });

  var ABSENCE_TOKENS = [
    { name: 'time-gap "N <unit> ago"',
      re: /\b\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i },
    { name: 'time-gap "N <unit> since"',
      re: /\b\d+\s*(?:days?|weeks?|months?|years?)\s+since\b/i },
    { name: 'time-gap "it\'s been N <unit>"',
      re: /\b(?:it'?s|it\s+has|its)\s+been\s+\d+\s*(?:days?|weeks?|months?|years?)\b/i },
    { name: 'absence "it\'s been a while"',
      re: /\b(?:it'?s|it\s+has|its)\s+been\s+a\s+while\b/i },
    { name: 'absence "your last visit"',
      re: /\byour\s+last\s+visit(?:ed)?\b/i },
    { name: 'absence "since your last …"',
      re: /\bsince\s+you(?:r)?\s+last\s+(?:visit|time|stopped|came|opened)/i },
    { name: 'streak "day streak"', re: /\bday[\s-]*streak\b/i },
    { name: 'streak "streak of N"', re: /\bstreak\s+of\s+\d+/i },
    { name: 'streak "N day streak"', re: /\b\d+[\s-]*day[\s-]*streak\b/i },
    { name: 'absence "last seen"', re: /\blast\s+seen\b/i },
    { name: 'time-gap "N <unit> away"',
      re: /\b\d+\s*(?:days?|weeks?|months?|years?)\s+away\b/i },
    { name: 'absence "you were away/gone"',
      re: /\byou\s+were\s+(?:away|gone)\b/i },
    { name: 'absence "while you were away"',
      re: /\bwhile\s+you\s+were\s+(?:away|gone|out)\b/i },
    { name: 'absence "you\'ve been away/gone"',
      re: /\byou(?:'?ve|\s+have)\s+been\s+(?:away|gone)\b/i },
    { name: 'absence "you haven\'t been …"',
      re: /\byou\s+haven'?t\s+been\s+(?:here|back|around)\b/i },
    { name: 'absence "haven\'t visited/come back"',
      re: /\bhaven'?t\s+(?:visited|been\s+here|been\s+back|seen\s+you|stopped\s+by|come\s+back)\b/i },
    { name: 'quota "N left/remaining/un-judged"',
      re: /\b\d+\s+(?:left|remaining|un-?judged)\b/i },
    { name: 'absence "welcome back" (text)', re: /\bwelcome\s+back\b/i },
    { name: 'absence "your time away"', re: /\byour\s+time\s+away\b/i },
    { name: 'time-gap "days away since"', re: /\bdays?\s+away\s+since\b/i }
  ];
  // (iii) THE SCAN, over the COMMENT-STRIPPED text of each source. Comments
  // are blanked in place, never removed, so `(i + 1)` is still the real line
  // in the real file and a violation stays actionable.
  ABSENCE_SOURCES.forEach(function (src) {
    var lines = stripped[src.file].split('\n');
    ABSENCE_TOKENS.forEach(function (tok) {
      lines.forEach(function (line, i) {
        if (tok.re.test(line)) {
          violations.push('[no-absence] ' + src.file + ':' + (i + 1) +
            ' law-3 time-gap/absence/streak/quota copy — ' + tok.name +
            ': ' + line.trim());
        }
      });
    });
  });
})();

// ---- Suite 4 extension (26.4-05): comments + vault sync-back pinned copy -----
//
// The comment layer's four user-facing strings are pinned byte-exactly over
// app.js (UI-SPEC Copywriting Contract): the "your notes" heading + its
// add-box placeholder, the sync-back toggle label, and the disclosure that
// states EXACTLY what is and isn't touched before the switch flips. The
// disclosure is the informed-consent surface for the ONE new byte path into
// the vault — its wording is load-bearing, so it is pinned like every other
// consent line. The wiring symbols must also exist (the reader field, the
// save path, the Manage section, the /api/comment route). Fix the source,
// never this gate.

(function () {
  const app = readSource('app.js');

  [
    // the reader "your notes" field (D-09/D-10)
    'your notes',
    'a note to yourself…',
    // the Manage sync-back toggle label + its plain disclosure (D-11/D-12)
    'write my notes back to my vault files',
    'a note you leave here is added under `## Comments` in the original ' +
      'file, timestamped. Nothing else is touched — every line above it ' +
      'stays exactly as you wrote it.'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[comments] app.js: pinned copy missing: '" +
        copy + "'");
    }
  });

  // The wiring must exist: the reader field renderer, the local-always save
  // path, the Manage sync section, and the one comment route.
  ['renderReaderComments', 'saveComment', 'renderCommentsSyncSection',
    '/api/comment'].forEach(function (t) {
    if (app.indexOf(t) === -1) {
      violations.push("[comments] app.js: comment wiring missing: '" +
        t + "'");
    }
  });
})();

// ---- Suite extension (26.4-09): the parked connection engine ----------------
//
// D-30 / Pitfall 5: the connection engine (26.4-02/03) is PARKED behind ONE
// front-end flag — CONNECTION_ENGINE_ENABLED = false — that gates BOTH parked
// callers so a candle tap runs no /api/librarian/connect and the flame never
// reaches FROM connection proposals. The server routes stay registered and
// their suites still pass; only the UI call is gone. This suite proves the
// gate STATICALLY (there is no browser harness): the flag is declared false,
// both callers are flag-guarded, and the flag is the guard on every call site
// of askCandleForConnections. If the engine is ever un-parked, flip the flag
// AND consciously update this suite. Fix the source, never the gate.

(function () {
  const app = readSource('app.js');

  // (1) the flag is declared, and declared FALSE (the parked default).
  if (!/var\s+CONNECTION_ENGINE_ENABLED\s*=\s*false\s*;/.test(app)) {
    violations.push('[parked-engine] app.js: CONNECTION_ENGINE_ENABLED must ' +
      'be declared = false (the parked connection engine, D-30)');
  }

  // (2) the candle click handler's connect call is flag-guarded — a tap runs
  // no connect while the flag is false.
  if (!/CONNECTION_ENGINE_ENABLED\s*&&\s*librarianOn\(\)\s*\)\s*\{\s*askCandleForConnections/
    .test(app)) {
    violations.push('[parked-engine] app.js: the candle click handler must ' +
      'gate askCandleForConnections behind CONNECTION_ENGINE_ENABLED ' +
      '(Pitfall 5)');
  }

  // (3) the reaching branch of refreshCandleState is skipped when parked —
  // the flag guard returns steady BEFORE any /api/librarian/insights read,
  // so the candle never reaches from connection proposals.
  if (!/function refreshCandleState[\s\S]*?if \(!CONNECTION_ENGINE_ENABLED\) \{ setCandleFlame\('steady'\); return; \}/
    .test(app)) {
    violations.push('[parked-engine] app.js: refreshCandleState must ' +
      'early-return steady when !CONNECTION_ENGINE_ENABLED, before the ' +
      'insights read (Pitfall 5)');
  }

  // (4) the ONLY invocation of askCandleForConnections( is flag-guarded: every
  // occurrence that is not the function DEFINITION sits on a line carrying
  // CONNECTION_ENGINE_ENABLED. A future un-guarded caller fails here.
  const lines = app.split('\n');
  lines.forEach(function (line, i) {
    if (line.indexOf('askCandleForConnections(') === -1) { return; }
    if (/function\s+askCandleForConnections\s*\(/.test(line)) { return; }
    // the guard may sit on the call's own line or open the block just above
    // it — inspect a 3-line window (the call + the two preceding lines).
    const window = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
    if (window.indexOf('CONNECTION_ENGINE_ENABLED') === -1) {
      violations.push('[parked-engine] app.js:' + (i + 1) +
        ' a call to askCandleForConnections must be guarded by ' +
        'CONNECTION_ENGINE_ENABLED: ' + line.trim());
    }
  });

  // (5) D-31 (never regress): the parked-engine work introduces no new coral.
  // The candle's reaching state is the ONE --accent user in the room; the new
  // 26.4-09 Manage affordance is calm paper + warm wood. Assert the reflection-
  // proposals card style carries no --accent (coral stays reserved for the
  // candle alone).
  const css = readSource('tokens.css');
  const cardBlock = css.match(/\.reflection-proposal[^{]*\{[^}]*\}/g) || [];
  cardBlock.forEach(function (block) {
    if (block.indexOf('--accent') !== -1) {
      violations.push('[parked-engine] tokens.css: the reflection-proposal ' +
        'card must not use --accent — coral stays reserved for the candle ' +
        '(D-31)');
    }
  });
})();

// ---- Suite 4 extension (26.6-05): onboarding copy + no-third-question --------
//
// The first-run onboarding flow's key copy is load-bearing product surface
// (UI-SPEC Screens 1–5): the framing/name-candle/AI-check/sources/what-to-
// expect headings + CTAs, the Notion "one-time copy" label (framing only, no
// adapter — D-08), and the plain-words fence statement (D-05) are pinned
// byte-exactly over app.js so a later edit is deliberate. And setup law 6
// (SRM-06, SC6): the onboarding introduces NO third yes/no — the shipped
// q1-consolidation group stays exactly three radios and no name="q3" group
// appears (the candle name is free-text optional, not a question). Fix the
// source, never this gate.

(function () {
  const app = readSource('app.js');
  const html = readSource('index.html');

  // (1) the pinned onboarding copy — each string ONE contiguous source
  // literal in app.js (the onboarding screens render from app.js behind the
  // escape seam).
  ['The Study Room',                        // Screen 1 framing heading
    'Meet the one who keeps your room',      // Screen 2 heading
    'name the candle',                       // Screen 2 CTA
    // ⚠ SCREEN 3'S AI-CHECK HEADING LEFT THIS ROSTER IN 26.93-10. The step
    // itself is deleted: the librarian may be Ollama or OpenAI, so a heading
    // naming one company is a false statement about who answers. The literal
    // is BANNED in RETIRED_CLAIMS above rather than merely unpinned.
    'Point the librarian at your things',    // Screen 4 sources heading
    'bring them in',                         // Screen 4 CTA
    'Notion comes in once',                  // Screen 4 Notion label (D-08)
    'anything that looks like HR, medical, or your journal',  // fence (D-05)
    'What to expect'                         // Screen 5 heading
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[onboarding] app.js: pinned onboarding copy " +
        "missing: '" + copy + "'");
    }
  });

  // (2) no third yes/no (SRM-06, SC6): the shipped q1-consolidation group is
  // exactly three radios and no q3 group is introduced by the onboarding.
  const q1 = (html.match(/name="q1"/g) || []).length;
  if (q1 !== 3) {
    violations.push('[onboarding] index.html: the shipped q1-consolidation ' +
      'radio group must stay exactly 3 radios (name="q1") — found ' + q1 +
      ' (setup law 6: the onboarding adds no question)');
  }
  if (/name="q3"/.test(html)) {
    violations.push('[onboarding] index.html: a name="q3" radio group ' +
      'appeared — the onboarding must introduce no third yes/no question ' +
      '(setup law 6: max 2)');
  }
  // The sources step reuses the shipped Q1 rather than rendering its own
  // radios: renderOnbSources must carry no radio input of its own.
  const at = app.indexOf('function renderOnbSources(');
  if (at !== -1) {
    const end = app.indexOf('\n  function ', at + 1);
    const body = app.slice(at, end === -1 ? app.length : end);
    if (/type="radio"/.test(body)) {
      violations.push('[onboarding] app.js: renderOnbSources introduces a ' +
        'radio input — the sources step reuses the shipped Q1 card, it adds ' +
        'no third yes/no (SRM-06)');
    }
  }
})();

// ---- Suite 4 extension (26.7-05): the reflection session's pinned copy ------
//
// The phase-wide copy audit (law 3): every string the session speaks is
// byte-pinned here so any drift is deliberate. The A3-honest consent
// line is the audited pool contract — "what's newly arrived + your
// comments" — the pin freezes that framing (an in-place edit to an
// already-imported vault file never joins the pool, and the copy must
// never imply it does). The three stage labels live in server.py and
// render verbatim client-side; their byte-pins stand in for the
// deliberate Suite-5 server exclusion above. Fix the source, never this
// gate.

(function () {
  const app = readSource('app.js');
  const srv = readSource('server.py');

  [
    // the D-10 warm nothing-new line + the one static failure line
    'the library is settled — nothing waiting today.',
    'the librarian could not finish just now — nothing is lost; the ' +
      'desk is as it was.',
    // the D-03 held-draft offer (26.7-05) — once, ever
    'pick up where we left off?',
    // the A3-honest session consent framing (26.7-02, audited here)
    "the librarian reads what's newly arrived + your comments to " +
      'shape one reflection.',
    // the D-06 write-back disclosure (26.7-04)
    'when this is on, a reflection you keep is also written into ' +
      "your vault as one NEW note in Claude's observation/Journal " +
      'analysis — nothing already there is ever touched.'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[session-copy] app.js: pinned session copy " +
        "missing: '" + copy.slice(0, 58) + "…'");
    }
  });

  // the three stage labels — server truth, rendered verbatim by the
  // client (the choreographed walk's whole vocabulary)
  ["gathering what's new…", 'reading…', 'writing…'].forEach(
    function (label) {
      if (srv.indexOf(label) === -1) {
        violations.push("[session-copy] server.py: pinned stage label " +
          "missing: '" + label + "'");
      }
    });
})();

// ---- Suite 4 extension (26.8-01, RE-POINTED 26.95-32): the walk's copy -------
//
// The walk that OPENS the candle session (D-01) speaks exactly these strings.
// ⛔ THIS PIN'S REAL JOB IS UNCHANGED AND WORTH SAYING PLAINLY: NO AGENT MAY
// REWORD THE WORDS THE ROOM SAYS. It is not a taste check — it is the thing
// that makes a silent paraphrase impossible.
//
// ⚠⚠ TWO OF THE FIVE MOVED IN 26.95-32, AND THE ROSTER MOVED WITH THE ROOM
// RATHER THAN TO QUIET A RED SUITE. D-08 re-pointed the walk: it used to deal
// things that had just arrived, and it now opens the Offer — OLD material,
// reached back through something she blessed. So:
//
//   RETIRED FROM THIS ROSTER, recorded here rather than dropped:
//     'some new things arrived. look through them — say how each one lands.'
//       — the open bookend. Nothing arrives on this path (D-02), so the
//         sentence has no path left on which it could be true.
//     'straight to the reflection'
//       — the quiet door. It named the walk's old destination, and the walk
//         no longer goes there first.
//
//   ⛔ NEITHER IS BANNED, AND THAT IS A DELIBERATE ASYMMETRY. This file bans a
//   retired sentence (RETIRED_CLAIMS) when the sentence is FALSE ABOUT A FACT
//   and must not creep back. These two are not that: they are COPY, and the
//   OWNER'S SINGLE PASS OWNS THEM. A ban written by an agent over words she
//   has not ruled on would be this file making a wording decision — the exact
//   thing the pin below exists to prevent. Recorded, not forbidden.
//
// ⚠⚠ THE TWO REPLACEMENTS ARE PROVISIONAL, AND THIS PIN SAYS SO INSTEAD OF
// PRETENDING OTHERWISE. They are candidates in the phase's copy register,
// 26.95-COPY.md — row C-2 (the walk's open bookend) and row C-6 (the walk's
// quiet door) — copied verbatim from that phase's UI-SPEC and standing in so
// the code runs. `copy_approved: false` is the gate in that file and it is
// still false.
//   ⛔ An agent may not reword them. That is this pin.
//   ⛔ An agent may not mark them settled either. WHEN THE OWNER'S SINGLE COPY
//      PASS LANDS AND `copy_approved` BECOMES TRUE, THIS ROSTER IS UPDATED TO
//      HER SENTENCES AND THIS WHOLE WARNING COMES OUT WITH THEM.
// Until that day a green run here means "no agent changed the placeholder" —
// it never means "these are the words".
//
// Each provisional string is pinned WITH ITS KEY rather than as a loose
// substring: the key binds the sentence to the one place it lives, so
// renaming the key and rewording the value both go red, and a chance match
// elsewhere in the file cannot make the pin vacuously green.
//
// The rest is unchanged. Her begin door is the SHIPPED label and never
// entered the register. The close bookend's count moment is shipped,
// law-3-audited copy (counts of things in hand only, present tense, never a
// ratio, never a boundary date), with its fragments pinned around the
// interpolated count. The per-item verdict set is the SHIPPED ribbon copy,
// already pinned above — the walk adds no verdict vocabulary of its own
// (D-08). Fix the source, never this gate.

(function () {
  const app = readSource('app.js');

  [
    // her begin door — SHIPPED, unchanged by 26.95-32, not a candidate
    'look through them',
    // the close bookend: the count moment (celebration-shaped, absent
    // at zero) — the singular whole, the plural's fragments
    'you welcomed 1 thing back.',
    'you welcomed ',
    ' things back.'
    // the pile-hint count copy was removed in D-A (26.8.1-01); the count-free
    // MORE_WAITING_COPY line is covered by test_refinements_grep
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[walk-copy] app.js: pinned walk copy missing: '" +
        copy + "'");
    }
  });

  // ✅ NO LONGER PROVISIONAL — 2026-08-17, the owner's copy pass RAN and
  // `copy_approved` in 26.95-COPY.md is `true`. Both strings below are HERS:
  // C-2 she chose from candidates offered to her (the shipped line it
  // replaces claimed things had ARRIVED, which is false on a path where
  // nothing arrives), and C-6 she was read and KEPT — a keep is an answer,
  // so `not today` is pinned as a decision now, not as a placeholder.
  //
  // ⚠ THE PIN'S JOB DID NOT GO AWAY, IT INVERTED. It used to hold a
  // placeholder still so no agent could settle it; it now holds HER settled
  // wording so no agent can drift it. This gate went RED on the day her
  // words landed and that is the whole reason it exists — the message below
  // is what a later agent reads if these sentences move again.
  [
    ['C-2', 'walkBookend',
      "walkBookend: 'something you brought back led here — a " +
      "few from the same weeks, other years.'"],
    ['C-6', 'walkQuiet', "walkQuiet: 'not today'"]
  ].forEach(function (row) {
    if (app.indexOf(row[2]) === -1) {
      violations.push('[walk-copy] app.js: the OWNER-WORDED walk string ' +
        'OFFER_COPY.' + row[1] + ' is missing or was reworded. It is ' +
        'candidate ' + row[0] + ' in 26.95-COPY.md, which she answered on ' +
        '2026-08-17 with copy_approved: true — so no agent may change it. ' +
        'Expected, verbatim: ' + JSON.stringify(row[2]));
    }
  });
})();

// ---- Suite 4 extension (26.8-02): the why step's pinned copy -----------------
//
// Right after a joyful verdict the held spread offers the inline why
// block (D-09) — a prompt line, the one-line input, and three quiet
// doors; never a popup, never a textarea, never blank-shamed. Every
// string it speaks is byte-pinned, the D-34 default why included (its
// wording is decided, not draftable — the warm floor recorded on any
// skip or advance). The failure line + retry link are the loud register
// for a why-save miss: the blessing itself already persisted per tap,
// and a judgment is never dropped silently. Fix the source, never this
// gate. Additive only: nothing above this block changed.

(function () {
  const app = readSource('app.js');

  [
    // the prompt line + the input's placeholder
    'want to say why?',
    'in your own words',
    // the three doors
    'keep it',
    'let the librarian write it',
    'move on',
    // the D-34 default why (byte-exact, recorded on skip/advance)
    'felt blessed after reading it',
    // the why-save failure register: the quiet line + its retry link
    "that didn't save.",
    'try again'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[why-copy] app.js: pinned why-step copy " +
        "missing: '" + copy + "'");
    }
  });
})();

// ---- Suite 4 extension (26.8-04): the blessings notebook's pinned copy -------
//
// The notebook speaks almost nothing — that near-silence IS the design
// (D-13/D-35: unmarked means unmarked). What it does say is pinned
// byte-exactly: the empty-book invite (must invite, never guilt), the
// librarian's quiet attribution suffix (user and default whys carry NO
// attribution), the two law-3-neutral month-nav accessible names (never
// a gap or a distance — just earlier/later), and the desk object's
// accessible name. Fix the source, never this gate. Additive only:
// nothing above this block changed.

(function () {
  const app = readSource('app.js');

  [
    // the empty-book invite (zero blessings; no calendar grid paints)
    'a book for what you welcome. bless something, and it will keep a page here.',
    // the librarian-authored why's quiet suffix
    '— the librarian',
    // the month nav's accessible names (populated months only)
    'earlier month',
    'later month',
    // the desk object's accessible name
    'the blessings notebook'
  ].forEach(function (copy) {
    if (app.indexOf(copy) === -1) {
      violations.push("[notebook-copy] app.js: pinned notebook copy " +
        "missing: '" + copy + "'");
    }
  });
})();

// ---- Suite extension (26.85-01): tier-1 cleaning reuses the choke point ------
//
// RED-FIRST (Wave 0). These three pins fail until Wave 3 (26.85-03) adds
// the cleaning classifier's constants and wires its worker; that failure
// IS the deliverable. Do NOT weaken them to go green.
//
// The tier-1 cleaning classify is a NEW SCHEMA + NEW PROMPT fed to the
// EXISTING hermetic call (D-01) — not a new subprocess site. That is the
// whole safety argument: the isolation code is neither forked nor
// duplicated, so the fence proven above covers cleaning by construction.
// Two consequences are pinned here as POSITIVE presence, complementing
// the count/absence pins in the 26-01 block above. ⚠ AMENDED 26.93-10: the
// spawned-site count now reads 1, not 3 — the two the librarian used to own
// went with the seam, and the constant's own comment carries why and what
// comes next. "bypassPermissions" still stays at exactly one occurrence: the
// vault site, never the cleaning one. If a future refactor gives cleaning its
// own spawn, the count pin above breaks FIRST — that is the intended tripwire.

(function () {
  const py = readSource('server.py');
  const seam = readSource('librarian_call.py');

  // (1)+(2) ⚠ INVERTED 2026-08-17, NOT DELETED. These two pins asserted the
  // cleaning classifier's schema and prompt were PRESENT and named, so the
  // hermetic call was never handed an inline literal. #95 deleted the
  // classifier, so the honest claim is the opposite one: they must not come
  // back. A pin rewritten this way keeps the record that these constants
  // once existed and why — a deletion-shaped fix is indistinguishable from
  // lost coverage, which is this file's own standing rule for retired
  // claims.
  //
  // ⛔ IF A LABELLING PASS EVER RETURNS it returns as a JOBS row with its
  // literals bound in server.py, and this pin flips back to presence — and
  // `JOB_ROWS` above regains its row, which is where the identity claim
  // lives.
  ['CLEAN_SCHEMA_JSON', 'CLEAN_PROMPT', 'HEADING_SCHEMA_JSON',
    'HEADING_PROMPT'].forEach(function (t) {
    if (stripPyComments(py).indexOf(t) !== -1) {
      violations.push('[cleaning] server.py: the retired labelling ' +
        "constant '" + t + "' is back in live code — the pass was retired " +
        '(#87) and its code deleted (#95). If it is genuinely returning, it ' +
        'returns as a bound JOBS row and this pin flips back to a presence ' +
        'check, deliberately');
    }
  });

  // (3) WIRING pin — REWRITTEN 26.93-10, AND STRONGER THAN THE REGEX IT
  // REPLACES. The claim was never "this regex matches": it was THIS SCHEMA
  // REACHES THE CHOKE POINT, so the cleaning path inherits the fence rather
  // than re-implementing it. The old shape proved that by matching the call
  // site's signature; the signature changed by decision — a caller now names
  // a JOB and can name neither a schema nor a prompt nor a model (D-01). So
  // the claim moved to the table, where it is now asserted as the ROW'S
  // IDENTITY: which schema, for which job. The shipped comment said in as
  // many words that presence of the constants alone is too weak, and that
  // judgement stands — an existence check would pass a row pointing at the
  // wrong literal, which is how a cleaning schema ends up on a config ask.
  //
  // ⚠ ONE CALL, BOTH ROWS. The config ask's twin claim (26.87-02 below) rides
  // this same roster, because both are the same sentence about two rows and
  // splitting them would give the two halves two places to drift apart.
  jobRowViolations(py, seam).forEach(function (v) { violations.push(v); });
})();

// ---- Suite extension (26.87-02): the config ask reuses the choke point ------
//
// RED-FIRST (Wave 0). These three pins fail until 26.87-04 adds the config
// ask's constants and wires its worker; that failure IS the deliverable. Do
// NOT weaken them to go green.
//
// The config ask is a NEW SCHEMA + NEW PROMPT fed to the EXISTING choke
// point — not a call path of its own. That single sentence is the whole
// safety argument: everything the one seam guarantees is INHERITED rather
// than re-implemented, so the fence the suites above already guard covers the
// ask by construction. ⚠ AMENDED 26.93-10: what is inherited is no longer a
// fixed command line but a built request — the explicit system field, the
// job row's own output cap, the tier's timeout and the one transport. The
// count pin in the 26-01 block is still the tripwire; it now reads 1 rather
// than 3, and "bypassPermissions" still stays at exactly one occurrence (the
// vault site, never the ask). If a future refactor gives the ask its own
// spawn, the count pin breaks FIRST, by design.
//
// The bidirectional half of this contract — what the ask document is HANDED
// as well as what it emits — lives in tests/test_librarian_config_fence.cjs.

(function () {
  const py = readSource('server.py');

  // (1)+(2) the config ask's constants exist (the schema and the prompt the
  // hermetic call is handed).
  ['CONFIG_SCHEMA_JSON', 'CONFIG_PROMPT'].forEach(function (t) {
    if (py.indexOf(t) === -1) {
      violations.push('[config-ask] server.py: the config ask constant ' +
        "'" + t + "' is missing — the ask must feed the hermetic call a " +
        'named schema + prompt, never an inline literal');
    }
  });

  // (3) WIRING pin — REWRITTEN 26.93-10, and it is the cleaning pin's twin in
  // its new shape as it was in its old one. The claim is unchanged (THIS
  // SCHEMA REACHES THE CHOKE POINT, so the ask inherits the fence rather than
  // re-implementing it); only the evidence moved, from a call-site signature
  // to the JOBS row's identity. ⚠ THE ASSERTION ITSELF LIVES IN THE 26.85-01
  // BLOCK ABOVE, over the shared JOB_ROWS roster — one sentence about two
  // rows, asserted in one place, so the two halves cannot drift apart. It
  // names `config_ask` -> CONFIG_SCHEMA_JSON by value, and a row pointing at
  // the wrong literal fails there rather than passing an existence check.
})();

// ---- Suite 4 extension: the reading door's pinned copy ----------------------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) — presence -> ABSENCE ------------
//
// DISPOSITION: rewritten, not deleted. 26.9-02 authored this group to pin
// four reading-door strings PRESENT in app.js by byte-equality. 26.91 D-06
// retired the reading book, so all four strings are gone and the group's
// original assertions can no longer hold. The group keeps its identity and
// now pins the OPPOSITE — the same four strings, by the same byte-equality,
// asserted ABSENT. A test that pinned behaviour the owner later changed gets
// rewritten, never deleted: deleting it would erase the record that these
// exact words were once required, and a deletion-shaped fix is
// indistinguishable from losing coverage.
//
// WHAT THIS GROUP CAN AND CANNOT PROVE, stated so neither half is mistaken
// for the other:
//
//   (1) ABSENCE BY EXACT LITERAL, over COMMENT-STRIPPED source, is the
//       load-bearing half. Comment-stripping is not optional here: the
//       26.91-04 disposition notes in app.js and this file's own header
//       discuss the retired surface, and a raw scan would be
//       self-invalidating.
//   (2) THE POSITIVE CONTROL is the half that stops this group becoming a
//       trap for a CORRECT future feature. The ban is on the two EXACT
//       retired literals and never on the phrase `set out`, because plan
//       05's librarian ask reply says `set out for you`. A loose ban would
//       make a correct feature fail a check written for a removed surface —
//       so the allowed near-miss is asserted ALLOWED, in the same matcher,
//       right here. Written now, before plan 05 ships the copy.
//   (3) THE MATCHER ITSELF IS DRIVEN. A ban whose matcher never matches
//       anything is this repo's named defect class (an instrument that
//       cannot go red), so the matcher is run against a fixture that DOES
//       contain each banned literal and must report it. Without this, all
//       four bans would pass on an empty string.
//
// For the record, the reason the strings existed: `new in the room`
// deliberately did not say `since you were last here`, because law 3 is
// reward-presence-never-punish-absence. That reasoning is preserved because
// the wording may return on another surface; the BAN is on these words
// living in app.js as reading-door copy, which they no longer do.

(function () {
  var app = readSource('app.js');
  // Comment-stripped app.js: block comments removed, then any line whose
  // first non-space characters are `//` reduced to its indent. app.js has no
  // trailing `//` comments after code on the lines that matter here, and the
  // driven-matcher check below proves the stripper does not eat live code.
  var appCode = app.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
    .join('\n');

  var RETIRED_269 = [
    { what: 'provenance heading 1',
      s: 'the librarian set these out' },
    { what: 'provenance heading 2 (count-free, absence-free)',
      s: 'new in the room' },
    { what: 'reading-book empty line',
      s: 'nothing set out just now. what you welcome keeps its page in ' +
         'the notebook.', len: 74 },
    { what: 'reading-book empty line, pinned fallback',
      s: 'nothing set out just now. blessings keep their pages in the ' +
         'notebook.', len: 69 }
  ];

  // (0) THE ROSTER IS PINNED BY VALUE. It is consumed by a bare .forEach
  //     below; a vanished entry would silently shrink the ban with nothing
  //     going red — the operation an accidental deletion would hide.
  if (RETIRED_269.length !== 4) {
    violations.push('[reading-door-copy] the retired-copy roster holds ' +
      RETIRED_269.length + ' entries — pinned at exactly 4 (two provenance ' +
      'headings + two empty lines). It is consumed by a bare .forEach, so ' +
      'without this pin a dropped entry drops a ban silently.');
  }

  // (3) DRIVE THE MATCHER FIRST, so a vacuous matcher cannot make the four
  //     bans below pass by never matching anything.
  RETIRED_269.forEach(function (p) {
    var fixture = 'x ' + p.s + ' y';
    if (fixture.indexOf(p.s) === -1) {
      violations.push('[reading-door-copy] the exact-literal matcher for ' +
        'the ' + p.what + ' does not match a fixture that CONTAINS it — the ' +
        'ban below is structurally unable to go red');
    }
    // the two empty lines keep their measured lengths as identity, so a
    // silently-reworded ban target is caught rather than quietly widened.
    if (p.len && p.s.length !== p.len) {
      violations.push('[reading-door-copy] the ' + p.what + ' is ' +
        p.s.length + ' characters — the retired string is identified at ' +
        'exactly ' + p.len + '; a different length means this ban now ' +
        'names a different string than the one 26.9-02 pinned');
    }
  });

  // (1) THE BANS: each retired literal is absent from comment-stripped app.js.
  RETIRED_269.forEach(function (p) {
    var at = appCode.indexOf(p.s);
    if (at !== -1) {
      violations.push('[reading-door-copy] app.js:' + lineOf(appCode, at) +
        ' still carries the RETIRED ' + p.what + ' ' + JSON.stringify(p.s) +
        ' in live code — 26.91 D-06 retired the reading book and its copy ' +
        'with it (26.9-02 required this string; that requirement is now a ban)');
    }
  });

  // (2) THE POSITIVE CONTROL: the near-miss the librarian legitimately
  //     ships must NOT be caught by any of the four bans.
  //
  //     ⚠ NOT HYPOTHETICAL. Verified in source 2026-08-07: app.js's LIVE
  //     code already says `set out for you` TWICE (the librarian's shipped
  //     suggestion copy), and plan 05 adds a third in the ask reply. A ban
  //     broadened from `the librarian set these out` to `set out` would
  //     fail SHIPPED, CORRECT code today — a check written for a removed
  //     surface failing a working one, which is the worst shape a removal
  //     gate can take.
  var ALLOWED_NEAR_MISS = 'set out for you';
  var allowedHits = appCode.split(ALLOWED_NEAR_MISS).length - 1;
  if (allowedHits < 2) {
    violations.push('[reading-door-copy] app.js live code contains ' +
      allowedHits + ' occurrences of the allowed near-miss ' +
      JSON.stringify(ALLOWED_NEAR_MISS) + ' — at least 2 are expected (the ' +
      'librarian\'s shipped suggestion copy). If this drops to 0 the ' +
      'control below still passes while proving nothing about real code.');
  }
  RETIRED_269.forEach(function (p) {
    if (ALLOWED_NEAR_MISS.indexOf(p.s) !== -1) {
      violations.push('[reading-door-copy] the ban on the ' + p.what +
        ' MATCHES the allowed near-miss ' + JSON.stringify(ALLOWED_NEAR_MISS) +
        ', which app.js ships in LIVE CODE today — the ban has been ' +
        'broadened past its exact literal and now fails correct, working ' +
        'copy. The ban is on `the librarian set these out`, never `set out`.');
    }
  });
  // ...and the control is not vacuous: it really does contain the shorter
  // phrase a careless ban would have used.
  if (ALLOWED_NEAR_MISS.indexOf('set out') === -1) {
    violations.push('[reading-door-copy] the positive control no longer ' +
      'contains `set out` — it can no longer detect an over-broad ban, ' +
      'which is the only thing it exists to do');
  }
})();

// ---- THE MUTATION DRILL FOR THE REWRITTEN SEAM PINS (26.93-10) --------------
//
// ⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE, and every pin this plan rewrote is
// a fresh instrument wearing an old name. Each is driven RED on a planted
// violation, with UNMUTATED CONTROLS counted in the same run, and both counts
// asserted BY VALUE against literals written into this file. The loop cannot
// exit early on a catch: a harness that stopped at its first catch and
// reported one failure where there were four is one of this project's own
// recorded defects, and it landed inside the measuring instrument exactly like
// this one.
//
// ⚠ EVERY MUTATION IS A STRING IN MEMORY. No source file is opened for writing
// anywhere in this suite, and nothing here touches a page she may be using.
// Each mutation asserts it actually CHANGED the text first, because a
// substitution that matched nothing is a mutation that was never planted — and
// a checker asked nothing at all would otherwise score as a pass.
//
// The counts are stated as integers rather than as the word "green": CASES is
// the number of claims the rewritten block makes, computed from the rosters
// themselves so a dropped entry moves the number rather than shrinking the
// gate in silence.

(function () {
  const py = readSource('server.py');
  const seam = readSource('librarian_call.py');
  const slib = readSource('study_lib.py');
  const docRaw = fs.readFileSync(path.join(ROOT, 'LIBRARIAN.md'), 'utf8');
  const realSources = {
    'app.js': stripJsComments(readSource('app.js')),
    'server.py': stripPyComments(py),
    // 26.99-10 (D-22): flattened, for the reason written at the other
    // source map — the document is hard-wrapped and its ban straddles lines.
    'LIBRARIAN.md': flattenDoc(docRaw)
  };

  // ---- the controls: every checker green on the REAL sources --------------
  const CONTROLS = [
    ['the spawned-site count',
      function () { return subprocessSiteViolations(py); }],
    ['the vision derivation calls the fence',
      function () { return visionFenceCallViolations(slib); }],
    ['what the room says about photographs',
      function () { return cltCopyViolations(readSource('app.js'), py); }],
    ['the wiring claim',
      function () { return seamWiringViolations(py, seam); }],
    ['the isolation properties',
      function () { return seamIsolationViolations(seam); }],
    ['the two JOBS rows',
      function () { return jobRowViolations(py, seam); }],
    ['the retired claims',
      function () { return retiredClaimViolations(realSources); }],
    ['the doc anchors',
      function () { return docAnchorViolations(flattenDoc(docRaw)); }]
  ];

  let controls = 0;
  CONTROLS.forEach(function (c) {
    const said = c[1]();
    if (said.length === 0) { controls += 1; return; }
    violations.push('[drill] CONTROL RED: ' + c[0] + ' does not hold on the ' +
      'real source, so every mutation scored against it is measuring the ' +
      'repo rather than the pin');
    // ⚠ 26.94-03: THE CHECKER'S OWN WORDS TRAVEL WITH THE VERDICT. 26.94-04
    // named the gap as a scope boundary and left it: a red pin surfaced as
    // `CONTROL RED: <name>` and nothing more, so the operator learned WHICH
    // INSTRUMENT failed and never WHICH CLAIM — and for a checker making five
    // claims that is most of the diagnosis missing. Every checker here already
    // returns plain-words violations; carrying them out costs nothing and adds
    // NO second calling convention (they are still invoked only here, which is
    // the property 26.94-04 was protecting).
    said.forEach(function (v) { violations.push('[drill]   said: ' + v); });
  });

  // ---- the mutations: one thing wrong each --------------------------------
  //
  // These and not others because they are the ways each rewritten claim
  // realistically dies: the count moves in EITHER direction (a range would
  // accept a fourth site arriving as a third), the payload stops being
  // verbatim, the request stops carrying a guarantee the retired argv pins
  // used to give, a row points at the wrong literal or at nothing, and the
  // document loses the one command it now has to name.
  const MUTATIONS = [
    ['the spawned-site count drops to zero',
      function () {
        // ⚠ BOTH SHAPES, since 26.94-02: with only `run` renamed this
        // mutation left the reader's `Popen` behind and dropped the count to
        // ONE — still caught, but no longer the mutation its own name
        // describes, and a mutation whose label has drifted from what it
        // plants is the first step toward a drill that measures nothing.
        const m = py.split('subprocess.run(').join('SPAWN(')
          .split('subprocess.Popen(').join('SPAWN(');
        return [m !== py, subprocessSiteViolations(m)];
      }],
    ['a second spawned site appears',
      function () {
        const m = py + '\nsubprocess.run(["anything"])\n';
        return [m !== py, subprocessSiteViolations(m)];
      }],
    // ⚠ ANCHORED ON THE TWO-LINE SHAPE, NOT ON THE CALL ALONE. study_lib.py
    // holds THREE textual `if _librarian_fenced(item, filters):` lines, in
    // three different functions; a substitution on the bare call would mutate
    // all three and the label would no longer describe what it plants.
    // `report["fenced"] += 1` belongs to this derivation and to nothing else.
    ['the vision derivation stops calling the fence',
      function () {
        const m = slib.split(VISION_FENCE_SITE)
          .join('        if _some_local_copy(item, filters):\n' +
                '            report["fenced"] += 1');
        return [m !== slib, visionFenceCallViolations(m)];
      }],
    ['the fence call leaves only a COMMENT behind',
      function () {
        // ⚠ THE COMMENT STRIP, PROVED. The shipped function names the
        // predicate in prose deliberately; a checker that grepped raw text
        // would be green here, on a derivation that fences nothing.
        const m = slib.split(VISION_FENCE_SITE)
          .join('        # was: _librarian_fenced(item, filters)\n' +
                '        if _some_local_copy(item, filters):\n' +
                '            report["fenced"] += 1');
        return [m !== slib, visionFenceCallViolations(m)];
      }],
    ['the fence call leaves only a DOCSTRING mention behind',
      function () {
        // ⚠ THE DOCSTRING STRIP, PROVED — and this is the one that has
        // actually bitten this repo: 26.94-02 turned the spawned-site pin
        // red twice from a docstring, because a python docstring is not a
        // `#` comment and survives the comment strip untouched.
        const m = slib
          .split(VISION_FENCE_SITE)
          .join('        if _some_local_copy(item, filters):\n' +
                '            report["fenced"] += 1')
          .split('    """(targets, report) — the photographs')
          .join('    """(targets, report) — calls _librarian_fenced(it, f).' +
                ' The photographs');
        return [m !== slib, visionFenceCallViolations(m)];
      }],
    // ---- 26.94-03 (V6, static half) — the three sentences, four ways ------
    ['the Command Line Tools sentence is deleted from app.js',
      function () {
        const raw = readSource('app.js');
        const m = raw.split(CLT_MANAGE_COPY).join('reading is unavailable');
        return [m !== raw, cltCopyViolations(m, py)];
      }],
    ['the Command Line Tools sentence renders UNCONDITIONALLY',
      function () {
        // ⚠ THE MUTATION THAT CLAIM 1 CANNOT SEE. The sentence is still
        // there, byte-exact — it is simply told to everybody, including
        // every user whose toolchain is fine.
        const raw = readSource('app.js');
        const m = raw
          .split('(librarian.photo_reading_ok === false ?')
          .join('(true ?');
        return [m !== raw, cltCopyViolations(m, py)];
      }],
    ['the fourth stage\'s line is reworded before anything renders it',
      function () {
        const raw = readSource('app.js');
        const m = raw.split(CLT_STAGE_COPY).join('reading your photos — ');
        return [m !== raw, cltCopyViolations(m, py)];
      }],
    ['the browser is handed the TOOLCHAIN PATH instead of a boolean',
      function () {
        // The leak in its most natural form: somebody wanted the field to be
        // "more useful" and sent what it was derived from.
        const m = py
          .split('"photo_reading_ok":\n' +
                 '                                       ' +
                 'photo_reading_available(),')
          .join('"photo_reading_ok": _swiftc_path(),');
        return [m !== py, cltCopyViolations(readSource('app.js'), m)];
      }],
    ['the fence builder stops feeding the payload',
      function () {
        const m = py.split('payload = study_lib.build_librarian_payload(')
          .join('payload = _some_other_builder(');
        return [m !== py, seamWiringViolations(m, seam)];
      }],
    ['the payload arrives wrapped instead of verbatim',
      function () {
        const m = seam.split('"content": payload_text')
          .join('"content": "here is what she saved: " + payload_text');
        return [m !== seam, seamWiringViolations(py, m)];
      }],
    ['the OpenAI body stops refusing server-side retention',
      function () {
        const m = seam.split('"store": False').join('"store": True');
        return [m !== seam, seamIsolationViolations(m)];
      }],
    ['an adapter stops placing the job row\'s prompt explicitly',
      function () {
        const m = seam.split('"system": job_row["prompt"],')
          .join('"system": "a different prompt entirely",');
        return [m !== seam, seamIsolationViolations(m)];
      }],
    ['a second function opens a connection',
      function () {
        const m = seam + '\n\ndef _second_opener(url):\n' +
          '    return urllib.request.urlopen(url)\n';
        return [m !== seam, seamIsolationViolations(m)];
      }],
    // ⚠ RE-ANCHORED 2026-08-17: this planted a wrong schema on the
    // labelling row, and #95 deleted that row. `config_ask` is the roster's
    // remaining row, so the mutation plants the same defect where the claim
    // still lives. ⛔ Left on the old anchor it would have matched no text,
    // planted nothing, and scored a meaningless catch.
    ['a JOBS row is pointed at the WRONG schema literal',
      function () {
        const m = py.split('"config_ask", CONFIG_SCHEMA_JSON')
          .join('"config_ask", VERDICT_SCHEMA_JSON');
        return [m !== py, jobRowViolations(m, seam)];
      }],
    ['a JOBS row is never bound to a schema at all',
      function () {
        // The bind is renamed rather than deleted, so the OTHER branch of the
        // same checker is exercised: a job with no binding at all, which would
        // be refused loudly at the seam and never reach the choke point.
        const m = py.split('"config_ask", CONFIG_SCHEMA_JSON')
          .join('"config_ask_disabled", CONFIG_SCHEMA_JSON');
        return [m !== py, jobRowViolations(m, seam)];
      }],
    ['the document loses the one setup command',
      function () {
        // ⚠ Substituted on the SHORTER span deliberately: LIBRARIAN.md is
        // hard-wrapped and one occurrence breaks the line right after
        // `python3`, so a substitution on the full command would leave that
        // one standing and the flattened comparison would still find it. A
        // mutation that plants only half a fact would be scored as a failure
        // of the pin rather than of the drill.
        const m = docRaw.split('server.py --setup').join('the setup step');
        return [m !== docRaw, docAnchorViolations(flattenDoc(m))];
      }]
  ];

  // ...and one per retired claim, so no ban can be vacuous: each is planted
  // back into the file it was removed from and asserted caught.
  RETIRED_CLAIMS.forEach(function (c) {
    MUTATIONS.push(['the retired claim ' +
      JSON.stringify(c.s.slice(0, 30)) + '… comes back in ' + c.file,
    function () {
      const copy = {
        'app.js': realSources['app.js'],
        'server.py': realSources['server.py'],
        'LIBRARIAN.md': realSources['LIBRARIAN.md']
      };
      copy[c.file] = copy[c.file] + '\n' + c.s + '\n';
      return [copy[c.file] !== realSources[c.file],
        retiredClaimViolations(copy)];
    }]);
  });

  let caught = 0;
  MUTATIONS.forEach(function (mu) {
    const r = mu[1]();
    if (!r[0]) {
      violations.push('[drill] the mutation "' + mu[0] + '" changed nothing ' +
        '— the substitution matched no text, so nothing was planted and a ' +
        'catch would be meaningless');
      return;
    }
    if (r[1].length > 0) { caught += 1; return; }
    violations.push('[drill] the mutation "' + mu[0] + '" was NOT caught — ' +
      'the pin it targets does not hold, and a green run of this block would ' +
      'be evidence of nothing');
  });

  // ---- the numbers, asserted by value -------------------------------------
  // 26.94-04 moved all three: +1 control and +3 mutations for V9 (the call
  // itself, then the same removal hiding behind a comment and behind a
  // docstring — the two strips are what the last two prove), and +1 case.
  // 26.94-03 moves all three again: +1 control and +4 mutations for V6's
  // static half (the sentence deleted, the sentence rendered
  // unconditionally, the fourth-stage line reworded, the toolchain PATH
  // handed to the browser), and +5 cases — one per claim cltCopyViolations
  // makes, counted from the checker rather than guessed.
  // 26.95-01 (#77 site 2): +1 mutation — each RETIRED_CLAIMS member is
  // drilled by planting its banned sentence back into the source, so a new
  // ban brings its own mutation with it.
  // 26.99-06 (D-18): +2 mutations — the two ceiling sentences join
  // RETIRED_CLAIMS as bans, and each ban brings its own planted mutation
  // with it on the rule above.
  // 26.99-10 (D-22): +1 mutation — the document's superseded billing
  // sentence joins RETIRED_CLAIMS as a ban, and every ban brings its own
  // planted mutation with it on the rule above.
  const DRILL_MUTATIONS_EXPECTED = 29;
  const DRILL_CONTROLS_EXPECTED = 8;
  // 26.95-01 (#77 site 2): +1 case — the retired Manage disclosure joins
  // RETIRED_CLAIMS as a ban, so the ban count this sum reads moves with it.
  // 26.99-06 (D-18): +2 cases — the same two bans, counted through
  // RETIRED_CLAIMS.length in the sum below.
  // 26.99-10 (D-22): +1 case — the same ban, counted through
  // RETIRED_CLAIMS.length in the sum below. ⚠ DOC_ANCHORS.length does NOT
  // move: the billing anchor was RE-CUT to her sentence, not added to.
  // 2026-08-17 (#95, the labelling deletion): −2 cases, and the arithmetic
  // is the whole reason this literal exists. `JOB_ROWS` lost its
  // `cleaning_labels` row and the sum reads that roster at two claims per
  // row (the row exists + the row's identity). ⛔ LOWERED BECAUSE A ROW WAS
  // DELETED, never to make a red suite green — and the count is still
  // asserted by value, so the next accidental loss still fails here.
  const REWRITTEN_CASES_EXPECTED = 36;

  const rewrittenCases =
    1 +                              // the spawned-site count
    1 +                              // vision_path_list CALLS the fence (V9)
    5 +                              // 26.94-03: the Manage sentence exists,
                                     // renders only behind the boolean, the
                                     // stage line exists, the field is the
                                     // named boolean, and the handler names
                                     // no toolchain path
    3 +                              // two server-side wiring facts + the signature
    SEAM_BUILDERS.length * 2 +       // payload verbatim + explicit prompt, per adapter
    3 +                              // store:false, one opener, the opener's home
    JOB_ROWS.length * 2 +            // the row exists + the row's identity
    RETIRED_CLAIMS.length +          // the retired claims, as bans
    DOC_ANCHORS.length;              // the document's anchors

  if (MUTATIONS.length !== DRILL_MUTATIONS_EXPECTED) {
    violations.push('[drill] the drill holds ' + MUTATIONS.length +
      ' mutations, ' + DRILL_MUTATIONS_EXPECTED + ' expected — a mutation ' +
      'was added or lost without moving the literal');
  }
  if (caught !== MUTATIONS.length) {
    violations.push('[drill] ' + caught + ' of ' + MUTATIONS.length +
      ' mutations caught — the count is asserted by value so a drill that ' +
      'stopped at its first catch cannot report a pass');
  }
  if (controls !== DRILL_CONTROLS_EXPECTED) {
    violations.push('[drill] ' + controls + ' of ' + DRILL_CONTROLS_EXPECTED +
      ' unmutated controls came back green — a drill whose control is red is ' +
      'measuring the repo, not the pin');
  }
  if (rewrittenCases !== REWRITTEN_CASES_EXPECTED) {
    violations.push('[cases] the rewritten block makes ' + rewrittenCases +
      ' claims, ' + REWRITTEN_CASES_EXPECTED + ' expected — a claim was ' +
      'added or lost without moving the literal');
  }

  console.log('CASES ' + rewrittenCases);
  console.log('DRILL ' + caught + '/' + MUTATIONS.length +
    ' mutations caught, ' + controls + ' controls green');
})();

// ---- Suite extension (26.996-05): saved-state key decoupled from visible word
//
// #110: the visible forever tap reads "put it away for good"; the saved-state
// shelf key keeps "heavy" for the model schema, membership checks, and counters
// over her stored verdicts. Making the two agree would silently migrate answers
// she already gave — this block asserts they share no constant reference.

(function () {
  const server = readSource('server.py');
  const app = readSource('app.js');
  const DECOUPLE_CLAIMS_EXPECTED = 4;
  let claims = 0;

  const shelvesMatch = server.match(
    /LIBRARIAN_SHELVES\s*=\s*\([^)]+\)/);
  if (!shelvesMatch) {
    violations.push('[26.996-05] LIBRARIAN_SHELVES tuple missing in ' +
      'server.py');
  } else {
    claims += 1;
    const shelvesDef = shelvesMatch[0];
    if (app.indexOf('put it away for good') === -1) {
      violations.push('[26.996-05] visible forever string missing from app.js');
    } else {
      claims += 1;
    }
    if (shelvesDef.indexOf('put it away for good') !== -1) {
      violations.push('[26.996-05] saved-state key must not derive from the ' +
        'visible word — tidying them into one constant would silently migrate ' +
        'her stored verdicts');
    } else {
      claims += 1;
    }
    if (app.indexOf('LIBRARIAN_SHELVES') !== -1) {
      violations.push('[26.996-05] app.js must not reference LIBRARIAN_SHELVES');
    } else {
      claims += 1;
    }
  }

  const keyIdx = server.indexOf('LIBRARIAN_SHELVES');
  const commentWindow = server.slice(Math.max(0, keyIdx - 600), keyIdx + 120);
  const commentLines = commentWindow.split('\n').filter(function (l) {
    return /^\s*#/.test(l);
  });
  const commentText = commentLines.join('\n');
  if (commentText.indexOf('migrate') === -1 &&
      commentText.indexOf('schema') === -1) {
    violations.push('[26.996-05] explanatory comment missing beside ' +
      'LIBRARIAN_SHELVES in server.py');
  }

  if (claims !== DECOUPLE_CLAIMS_EXPECTED) {
    violations.push('[26.996-05] decoupling block makes ' + claims +
      ' claims, ' + DECOUPLE_CLAIMS_EXPECTED + ' expected');
  }
})();

// ---- verdict ----------------------------------------------------------------

if (violations.length) {
  console.error('test_no_push FAILED — ' + violations.length +
    ' violation(s):');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}

console.log('test_no_push OK (pull-only prohibition, seam integrity, ' +
  'frozen-time discipline)');
process.exit(0);
