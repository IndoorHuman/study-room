#!/usr/bin/env node
/*
 * pick_uat_notes.cjs — the deterministic UAT note picker for phase 26.88.
 *
 * D-12 puts the legibility question in front of the owner, on the densest real
 * clipped notes in her live library — notes SHE DID NOT PICK. This script is
 * that mechanism. Neither the executor nor the owner chooses the notes: a rule
 * chooses them, the rule is stated below, and the same library produces the
 * same list on every run.
 *
 * READ-ONLY, and that is a hard requirement rather than a courtesy (threat
 * T-26.88-03). It opens the item store and the per-item snapshots for READING
 * and nothing else. It has no filesystem call capable of changing anything —
 * see the acceptance check in 26.88-08-PLAN.md, which counts the tokens.
 *
 * It does not re-implement the app's reading rules. It `require`s core.js and
 * calls the shipped `hasAuthorHeading`, `isPersonalNote`, `structureBody` and
 * `itemExcluded`, so the notes it lists are exactly the notes the app itself
 * would reformat, judged by the app's own code.
 *
 * THE PICK RULE, stated so nobody has to trust the output:
 *   1. Pool  = text items whose snapshot is readable, that are NOT her own
 *              writing (isPersonalNote) and carry NO author heading
 *              (hasAuthorHeading) — the D-07.4a reading, under which a
 *              vault_linker `## Related` block and a trailing boilerplate
 *              `## Comments` are tooling, not author structure.
 *   2. Firing = structureBody(body, []) returns something other than the body.
 *              core.js alone decides this. Nothing here second-guesses it.
 *   3. Safe  = itemExcluded(item, meta.filters) is false. never_show, retired,
 *              trigger-flagged and filtered items can never be offered to the
 *              owner, in a UAT or anywhere else (law 5).
 *   4. Order = longest FREE-PROSE BLOCK descending, then item id ascending.
 *              The free-prose block is the longest blank-line-delimited block
 *              left after the D-07 hands-off spans are removed — the text a
 *              rule is actually PERMITTED to change. The id tiebreak is why
 *              two runs cannot reorder.
 *   5. Top-up = if the top N miss a category the UAT must exercise (a colon
 *              promotion, a marker run, a hands-off zone), the densest firing
 *              note in each missing category is appended, in the fixed order
 *              listed in REQUIRED. Still a rule, still nobody's choice — and
 *              every top-up is labelled as one in the output.
 *
 * WHY RULE 4 MOVED (D-21, 2026-08-01). It used to sort on `longestParagraph`,
 * which counts quoted runs, fenced blocks, tables and image lines — text no
 * rule is permitted to touch. NINE OF THE ELEVEN notes this file has selected
 * so far were `> **图片转录：**` image-transcription blocks written by the
 * clippings-processor skill; their free-prose wall is 24-102 characters. There
 * was no wall to break. That defect produced F-2's headline finding — *"every
 * wall survives at its exact original character count"* — which on those notes
 * is the transform CORRECTLY obeying D-07.2 on a hands-off span, and it
 * falsified the follow-on conclusion that the walls are run-on prose with no
 * usable sentence punctuation. A whole UAT corpus was selected by a number
 * that measured nothing a rule could change.
 *
 * The fix is not to swap one number for another silently. ALL THREE MEASURES
 * ARE PRINTED ON EVERY PICK, so the gap between what looks like a wall and
 * what IS a wall stays visible to whoever reads the output, rather than being
 * corrected away where nobody can see it.
 *
 * Usage:  node tools/pick_uat_notes.cjs [count] [library-root]
 *         count        default 6
 *         library-root default: library.local.json's library_root, else
 *                      $HOME/StudyRoom. No absolute path is hardcoded here.
 *
 * Zero dependencies. Works from any working directory.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.dirname(__dirname);
const CORE = require(path.join(REPO, 'core.js'));

const DEFAULT_COUNT = 6;

// The categories the eight UI-SPEC checks need between them, in the fixed
// order a top-up is appended. 'hands-off' is check 5's material; 'colon' is
// the dominant promotion (460 of 469 firing notes); 'marker-run' is every
// other D-03/D-03a family.
const REQUIRED = ['colon', 'marker-run', 'hands-off'];

// The four cut points the re-plan addendum's distribution table uses. Counted
// for BOTH density measures so the two columns are directly comparable —
// that comparison IS the D-21 finding, and burying it would repeat the defect.
const CUTS = [400, 600, 800, 1200];

// ---------------------------------------------------------------------------
// Locating the library. An argument beats the repo's own pointer file, which
// beats the conventional home-directory location.
// ---------------------------------------------------------------------------

function defaultLibraryRoot() {
  const pointer = path.join(REPO, 'library.local.json');
  try {
    const doc = JSON.parse(fs.readFileSync(pointer, 'utf8'));
    if (doc && typeof doc.library_root === 'string' && doc.library_root) {
      return doc.library_root;
    }
  } catch (e) { /* fall through to the conventional location */ }
  return path.join(os.homedir(), 'StudyRoom');
}

function halt(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Frontmatter. 26.88-16 (F-5): THE BYTE-SHAPED MIRROR IS GONE. This file used
// to carry its own FM_RE and its own splitFrontmatter, under a comment saying
// app.js "is a browser file with no module surface, so it cannot be required".
// That was true and it was irrelevant: core.js can be, and this file already
// requires it for isPersonalNote and hasAuthorHeading. The split now comes from
// there, so the picker and the app can no longer disagree about where a note's
// frontmatter ends — which is the SAME disagreement F-1 was, and F-1 cost this
// phase a UAT corpus.
// ---------------------------------------------------------------------------

const splitFrontmatter = CORE.splitFrontmatter;

// ---------------------------------------------------------------------------
// The author's own prose. The density measures below describe how hard the
// NOTE is to read, so they must not measure her tooling. Two spans are
// discounted, exactly the two hasAuthorHeading discounts: the vault_linker
// `%% auto-links %%` block, and a trailing boilerplate section under a
// TOOLING_HEADINGS heading. Without this, the longest free line of most
// clippings is the `## Comments` boilerplate sentence rather than any wall.
//
// This trim applies to the DENSITY MEASURES ONLY. Eligibility and firing are
// judged by core.js on the whole body, because the whole body is what the
// reader reformats.
// ---------------------------------------------------------------------------

function authorProse(body) {
  let s = String(body == null ? '' : body);
  s = s.replace(
    /%%\s*auto-links:start\s*%%[\s\S]*?%%\s*auto-links:end\s*%%/g, '\n');
  s = s.replace(/%%\s*auto-links:start\s*%%[\s\S]*$/, '\n');
  const lines = s.split('\n');
  const HEAD_RE = /^[ \t]{0,3}#{1,6}(?:[ \t]+([^\n]*?))?[ \t]*$/;
  for (;;) {
    let cut = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = HEAD_RE.exec(lines[i].replace(/\r$/, ''));
      if (!m) { continue; }
      const text = String(m[1] == null ? '' : m[1])
        .replace(/[#\s]+$/, '').trim().toLowerCase();
      cut = CORE.TOOLING_HEADINGS.indexOf(text) !== -1 ? i : -1;
      break;
    }
    if (cut === -1) { break; }
    lines.length = cut;
  }
  return lines.join('\n');
}

// A paragraph is a blank-line-delimited block, measured in characters.
function longestParagraph(body) {
  const blocks = String(body).split(/\r?\n[ \t]*\r?\n/);
  let max = 0;
  for (const b of blocks) {
    const t = b.replace(/\r/g, '').trim();
    if (t.length > max) { max = t.length; }
  }
  return max;
}

// The longest single line of free prose — blockquote and image lines excluded,
// because neither is a wall the reader has to push through.
function longestFreeLine(body) {
  let max = 0;
  for (const raw of String(body).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^\s{0,3}>/.test(line)) { continue; }
    if (/^\s*!\[/.test(line)) { continue; }
    if (line.trim().length > max) { max = line.trim().length; }
  }
  return max;
}

// A hands-off zone: a fenced block, a markdown table, a blockquote run, or an
// image line — the four spans D-07 requires to survive byte-identically. The
// shapes are the ones structureBody itself keys on.
function handsOffZones(body) {
  const lines = String(body).split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (/^\s{0,3}(```|~~~)/.test(line)) { found.push('code'); continue; }
    if (/^\s{0,3}>/.test(line)) { found.push('quote'); continue; }
    if (/^\s*!\[/.test(line)) { found.push('image'); continue; }
    if (line.indexOf('|') !== -1 && i + 1 < lines.length) {
      const sep = lines[i + 1].replace(/\r$/, '');
      if (/^[ \t]{0,3}\|?[\s:|-]{3,}\|?[ \t]*$/.test(sep) &&
          sep.indexOf('-') !== -1) {
        found.push('table');
      }
    }
  }
  return Array.from(new Set(found)).sort();
}

// THE RULE-4 MEASURE (D-21). The longest blank-line-delimited block of text a
// rule is actually PERMITTED to change. It sits here, directly beneath the
// zone reporter, because the two are the same idea read two ways: that one
// NAMES the spans for the output, this one REMOVES them before measuring.
//
// Three things make this the right number and the previous one wrong:
//
//   1. It STRIPS WHAT A RULE MAY NOT TOUCH. The D-07 hands-off spans are
//      removed before the blocks are measured, so a 7,584-character
//      transcription span stops being reported as a wall the reformatter
//      failed to break. It was never a wall; it was a zone.
//   2. It CALLS core.js RATHER THAN RE-DERIVING THE ZONE SHAPES. The spans
//      come from CORE.handsOffSpans — the same predicates structureBody keys
//      on. Restating those shapes here is the one-rule-two-callers drift that
//      F-1 was, and this instrument exists because of what that drift cost.
//   3. It MOVES AUTOMATICALLY. A zone the transform gains in a later plan is
//      a zone this measure strips the same day, with no edit here.
//
// Each span's characters are replaced with newlines rather than deleted, so
// line and block structure survive and two free blocks either side of a
// removed span can never be welded into one false wall.
function longestFreeProseBlock(body) {
  const text = String(body == null ? '' : body);
  const spans = CORE.handsOffSpans(text);
  if (!spans.length) { return longestParagraph(text); }
  const chars = text.split('');
  for (const span of spans) {
    const end = Math.min(span[1], chars.length);
    for (let i = Math.max(0, span[0]); i < end; i++) { chars[i] = '\n'; }
  }
  return longestParagraph(chars.join(''));
}

// ---------------------------------------------------------------------------
// Which signals fired.
//
// WHETHER a note fires is decided by core.js and by nothing here: a note fires
// when structureBody returns text that differs from the body.
//
// WHICH BRANCH fired on a given line is also decided by core.js, by asking it
// — the line is handed back to structureBody on its own and the shape of what
// comes out is read. A heading came out, or a list came out, or nothing did.
// An earlier draft of this file guessed the branch from the line's own shape
// and got it wrong in exactly the way that matters: it read the `https:` in a
// wikilink as a colon label and reported the whole library as one signal.
// core.js does not promote that colon. Never re-derive a rule you can call.
//
// Only the FAMILY NAME of a list run is descriptive, and it is named against
// core.js's own exported marker sets and MARKER_RUN_MIN rather than numbers
// restated here.
// ---------------------------------------------------------------------------

// A line long enough that isShortPost is false on its own (it returns false as
// soon as any non-blank line exceeds ITEM_MAX_CHARS), carrying no colon, no
// marker and no bullet, so it passes through untouched and cannot merge with
// the probed line across the blank line between them.
const SENTINEL = '\n\n' + 'x'.repeat(CORE.ITEM_MAX_CHARS + 20);
const KEYCAP_RE = /[0-9][️]?[⃣]/g;
const ORDINAL_RE = /(?:^|[\s　])\d{1,3}[.)]/g;
const HEADING_OUT_RE = /^[ \t]{0,3}#{1,6}[ \t]/;

function countOccurrences(line, needles) {
  let n = 0;
  for (const needle of needles) {
    let from = 0;
    for (;;) {
      const at = line.indexOf(needle, from);
      if (at === -1) { break; }
      n++;
      from = at + needle.length;
    }
  }
  return n;
}

function countMatches(line, re) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(line) !== null) { n++; }
  return n;
}

// Name the marker family behind a list run. Descriptive only — core.js has
// already decided that a run fired.
function runFamily(line) {
  if (countOccurrences(line, CORE.CHECK_MARKS) >= CORE.MARKER_RUN_MIN) {
    return 'checkmark';
  }
  if (countMatches(line, KEYCAP_RE) >= CORE.MARKER_RUN_MIN) {
    return 'emoji-numeral';
  }
  if (countOccurrences(line, CORE.BULLET_GLYPHS) >= CORE.MARKER_RUN_MIN) {
    return 'bullet-char';
  }
  if (countOccurrences(line, [' - ', ' – ']) >= CORE.MARKER_RUN_MIN) {
    return 'dash-run';
  }
  if (countMatches(line, ORDINAL_RE) >= CORE.MARKER_RUN_MIN) {
    return 'ordered-run';
  }
  return 'run';
}

const probeCache = new Map();

function leadsWithPin(line) {
  const trimmed = line.replace(/^[\s　]+/, '');
  return CORE.PIN_MARKERS.some((p) => trimmed.indexOf(p) === 0) ||
    countOccurrences(line, CORE.PIN_MARKERS) >= CORE.MARKER_RUN_MIN;
}

// A line may fire two things at once: the colon rule promotes the label to a
// heading and then a run rule bullets what was left of the same line. Both are
// reported, so the breakdown separates a bare promotion from a promotion that
// also broke a wall into a list.
function labelChangedLine(line) {
  if (probeCache.has(line)) { return probeCache.get(line); }
  const labels = [];
  const out = CORE.structureBody(line + SENTINEL, []).text;
  const head = out.endsWith(SENTINEL) ? out.slice(0, -SENTINEL.length) : out;
  const emitted = head.split('\n');
  if (head === line) {
    // core.js leaves this line alone in isolation, so it was consumed by a
    // rule that spans lines — a pin-led section run or a multi-line list run.
    labels.push(leadsWithPin(line) ? 'pin' : 'multi-line ' + runFamily(line));
  } else if (HEADING_OUT_RE.test(emitted[0])) {
    labels.push(leadsWithPin(line) ? 'pin' : 'colon');
    const items = emitted.slice(1).filter(
      (l) => /^- /.test(l) || /^\d{1,3}[.)] /.test(l));
    if (items.length >= CORE.MARKER_RUN_MIN) { labels.push(runFamily(line)); }
  } else {
    labels.push(runFamily(line));
  }
  probeCache.set(line, labels);
  return labels;
}

// A source line "changed" when it does not survive as a whole line in the
// output. Counted as a multiset so a repeated line is not mistaken for a
// consumed one.
function signalsFired(body, after) {
  const surviving = new Map();
  for (const line of String(after).split('\n')) {
    surviving.set(line, (surviving.get(line) || 0) + 1);
  }
  const labels = new Set();
  for (const raw of String(body).split('\n')) {
    const n = surviving.get(raw) || 0;
    if (n > 0) { surviving.set(raw, n - 1); continue; }
    if (!raw.replace(/\r$/, '').trim()) { continue; }
    for (const l of labelChangedLine(raw.replace(/\r$/, ''))) { labels.add(l); }
  }
  return Array.from(labels).sort();
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

function readStore(libraryRoot) {
  const storePath = path.join(libraryRoot, 'items.json');
  let text;
  try {
    text = fs.readFileSync(storePath, 'utf8');
  } catch (e) {
    halt('Cannot read the item store at ' + storePath + ' (' + e.message +
      ').\nThe picker reads the LIVE library and never invents a fallback ' +
      'corpus — fixtures would defeat the point of D-12.\n' +
      'Usage: node tools/pick_uat_notes.cjs [count] [library-root]');
  }
  let store;
  try {
    store = JSON.parse(text);
  } catch (e) {
    halt('The item store at ' + storePath + ' is not readable JSON (' +
      e.message + '). Refusing to guess.');
  }
  if (!store || !store.items) {
    halt('The item store at ' + storePath + ' has no items. Refusing to guess.');
  }
  return store;
}

function analyse(store, libraryRoot) {
  const items = Array.isArray(store.items)
    ? store.items
    : Object.keys(store.items).sort().map((k) => store.items[k]);
  const filters = (store.meta && store.meta.filters) || [];

  // The distribution is counted for BOTH measures at the same four cut points,
  // so the gap between them is legible side by side rather than by inference.
  const totals = {
    text: 0, unreadable: 0, eligible: 0, firing: 0,
    paraOver: [0, 0, 0, 0], freeOver: [0, 0, 0, 0], bySignal: new Map()
  };
  const firing = [];

  for (const item of items) {
    if (!item || item.type !== 'text' || !item.library_path) { continue; }
    totals.text++;
    let raw;
    try {
      raw = fs.readFileSync(path.join(libraryRoot, item.library_path), 'utf8');
    } catch (e) {
      totals.unreadable++;
      continue;
    }
    const parts = splitFrontmatter(raw);
    if (CORE.isPersonalNote(item, parts.fm)) { continue; }
    if (CORE.hasAuthorHeading(parts.body)) { continue; }
    totals.eligible++;

    // Density is measured over the eligible pool, which is the pool
    // 26.88-RESEARCH.md § The Coverage Question measured, so the two figures
    // are comparable.
    const prose = authorProse(parts.body);
    const para = longestParagraph(prose);
    const freeProse = longestFreeProseBlock(prose);
    for (let k = 0; k < CUTS.length; k++) {
      if (para > CUTS[k]) { totals.paraOver[k]++; }
      if (freeProse > CUTS[k]) { totals.freeOver[k]++; }
    }

    const after = CORE.structureBody(parts.body, []).text;
    if (after === parts.body) { continue; }
    totals.firing++;

    const signals = signalsFired(parts.body, after);
    for (const s of signals) {
      totals.bySignal.set(s, (totals.bySignal.get(s) || 0) + 1);
    }
    firing.push({
      id: item.id,
      title: item.title == null ? '' : String(item.title),
      source: CORE.fmSource(parts.fm),
      folder: item.folder == null ? '' : String(item.folder),
      paragraph: para,
      freeLine: longestFreeLine(prose),
      freeProse: freeProse,
      signals: signals,
      handsOff: handsOffZones(prose),
      safe: !CORE.itemExcluded(item, filters)
    });
  }

  // Rule 4: longest FREE-PROSE BLOCK descending, item id ascending on a tie.
  // The tiebreak byte is unchanged from the paragraph-sorted version — it is
  // the reason two runs cannot reorder, and the measure moving is no reason to
  // touch it.
  firing.sort((a, b) =>
    (b.freeProse - a.freeProse) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { totals: totals, firing: firing };
}

function categoriesOf(note) {
  const cats = [];
  if (note.signals.indexOf('colon') !== -1) { cats.push('colon'); }
  if (note.signals.some((s) => s !== 'colon')) { cats.push('marker-run'); }
  if (note.handsOff.length) { cats.push('hands-off'); }
  return cats;
}

// Rule 4 then rule 5. Every top-up carries the category that pulled it in, so
// the output never looks like a choice.
function choosePicks(firing, count) {
  const safe = firing.filter((n) => n.safe);
  const picks = safe.slice(0, count).map((n) => ({ note: n, why: null }));
  const covered = new Set();
  for (const p of picks) { for (const c of categoriesOf(p.note)) { covered.add(c); } }
  const taken = new Set(picks.map((p) => p.note.id));
  for (const need of REQUIRED) {
    if (covered.has(need)) { continue; }
    const extra = safe.find(
      (n) => !taken.has(n.id) && categoriesOf(n).indexOf(need) !== -1);
    if (!extra) { continue; }
    picks.push({ note: extra, why: need });
    taken.add(extra.id);
    for (const c of categoriesOf(extra)) { covered.add(c); }
  }
  return picks;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function say(line) { process.stdout.write(line + '\n'); }

function report(picks, totals, firingCount, libraryRoot) {
  say('THE PICKS — the densest real notes in ' + libraryRoot + ', in the');
  say('order the rule produced. Take them in this order. An awkward one is a');
  say('finding, not a reason to skip it.');
  say('');
  let n = 0;
  for (const p of picks) {
    n++;
    const note = p.note;
    say(String(n) + '. ' + note.title);
    say('   id            ' + note.id);
    say('   source        ' + (note.source == null ? '(none)' : note.source));
    say('   folder        ' + (note.folder || '(none)'));
    // All three, every time. The gap between the first and the third is the
    // D-21 defect made visible instead of corrected away.
    say('   longest para             ' + note.paragraph + ' chars');
    say('   longest free line        ' + note.freeLine + ' chars');
    say('   longest FREE-PROSE block ' + note.freeProse +
      ' chars   <- rule 4 sorts on this');
    say('   signals       ' + (note.signals.join(', ') || '(none)'));
    say('   hands-off     ' + (note.handsOff.join(', ') || '(none)'));
    if (p.why) {
      say('   why appended  rule 5 top-up: the top ' + (picks.length - 1) +
        ' carried no "' + p.why + '" case, and the eight UI-SPEC checks need one.');
    }
    say('   open at       /reader?item=' + note.id);
    say('');
  }
  say('Signal labels describe the shape of the lines core.js reshaped. Whether');
  say('a note fires at all is decided by structureBody and by nothing else.');
  say('');
  say('---------------------------------------------------------------------');
  say('COVERAGE — CONTEXT FOR THE CONVERSATION, NOT THE PASS BAR. The owner');
  say('declined a coverage figure as a pass criterion and asked for it to be');
  say('surfaced anyway. It says how much of the library the conservative rules');
  say('restructure. It says nothing about whether a note is easier to read —');
  say('only her verdict says that.');
  say('---------------------------------------------------------------------');
  say('  text items in the library      ' + totals.text);
  if (totals.unreadable) {
    say('  snapshots unreadable           ' + totals.unreadable);
  }
  say('  eligible pool (not hers, no author heading)  ' + totals.eligible +
    '  (' + pct(totals.eligible, totals.text) + ' of text items)');
  say('  firing at least one signal     ' + totals.firing +
    '  (' + pct(totals.firing, totals.text) + ' of text items, ' +
    pct(totals.firing, totals.eligible) + ' of the eligible pool)');
  say('  eligible-pool density, BOTH measures side by side. The left column');
  say('  is what rule 4 used to sort on; the right is what a rule may change.');
  say('    over        paragraph   FREE-PROSE block');
  for (let k = 0; k < CUTS.length; k++) {
    say('    ' + String(CUTS[k]).padStart(5) + '     ' +
      String(totals.paraOver[k]).padStart(9) + '   ' +
      String(totals.freeOver[k]).padStart(16));
  }
  say('  per-signal breakdown (a note may fire more than one):');
  const rows = Array.from(totals.bySignal.entries())
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  for (const [name, c] of rows) {
    say('    ' + name.padEnd(16) + String(c).padStart(5));
  }
  say('');
  say('Picked ' + picks.length + ' of ' + firingCount +
    ' firing notes from a ' + totals.eligible + '-note eligible pool.');
}

function pct(a, b) {
  if (!b) { return '0%'; }
  return (Math.round((a / b) * 1000) / 10).toFixed(1) + '%';
}

function main() {
  const countArg = process.argv[2];
  const count = countArg ? parseInt(countArg, 10) : DEFAULT_COUNT;
  if (!Number.isFinite(count) || count < 1) {
    halt('count must be a positive integer.\n' +
      'Usage: node tools/pick_uat_notes.cjs [count] [library-root]');
  }
  const libraryRoot = process.argv[3] || defaultLibraryRoot();
  const store = readStore(libraryRoot);
  const result = analyse(store, libraryRoot);
  if (!result.firing.length) {
    halt('No eligible note in ' + libraryRoot + ' fires a signal. ' +
      'Nothing to put in front of the owner.');
  }
  const picks = choosePicks(result.firing, count);
  report(picks, result.totals, result.firing.length, libraryRoot);
  process.exit(0);
}

// THE MODULE SURFACE. The guard exists so the instrument can be pinned by a
// hermetic test (tests/test_uat_instrument.cjs) WITHOUT touching the live
// library: `require`ing this file yields the measures and nothing runs. Run
// directly, the CLI behaviour is exactly what it was before the guard.
if (require.main === module) { main(); }

module.exports = {
  splitFrontmatter: splitFrontmatter,
  authorProse: authorProse,
  longestParagraph: longestParagraph,
  longestFreeLine: longestFreeLine,
  longestFreeProseBlock: longestFreeProseBlock,
  handsOffZones: handsOffZones,
  analyse: analyse,
  choosePicks: choosePicks
};
