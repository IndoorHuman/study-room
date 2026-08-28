/*
 * tests/test_disclosure_truth.cjs — the D-03 disclosure gate
 * (Phase 26.85, plan 06).
 *
 * Tier-1 tidying is the app's FIRST in-place edit of a file the owner
 * already had. LIBRARIAN.md is where the room tells the truth about what
 * leaves this machine and what gets touched on it, so the disclosure of
 * that single consented, metadata-only exception is a SHIPPED PROMISE —
 * not prose. This gate reads LIBRARIAN.md and app.js as TEXT and holds
 * three things:
 *
 *   1. THE DISCLOSURE EXISTS AND SAYS THE LOAD-BEARING THINGS. Every
 *      promise the tidy-up actually keeps (two switches that both arrive
 *      ON and can each be turned off, nothing written unasked, nothing
 *      written until Apply, frontmatter-and-dates only, the body
 *      byte-identical, the last-edited date put back, no move, undo in one
 *      tap, an applied batch not re-offered, the fence first) must be
 *      present. Each one maps 1:1 to a passing test — the audit table lives
 *      in 26.85-06-SUMMARY.md.
 *
 *      RE-CUT 2026-07-30 (owner, mid-UAT): the tidy-up used to be off by
 *      default behind two switches, and that was the FIRST thing this gate
 *      required. Both switches now default on, so the sentence became a
 *      lie and the pin moved with the truth — the protection was never
 *      "the app cannot write", it was "the app never writes unasked, and
 *      everything it writes comes back". The retired phrasings are
 *      FORBIDDEN in section 2 so they cannot creep back.
 *
 *   2. NO OVERCLAIM, AND NO STALE HEDGE. A disclosure that promises MORE
 *      than the writer keeps breaks the trust contract exactly as badly as
 *      one that hides the write — and a disclosure that still apologises
 *      for behaviour that was REMOVED is just as untrue. Three shapes are
 *      grep-gated out:
 *        (a) the old absolute line "nothing already in your vault is ever
 *            opened, edited, or touched" — true of the reflection writer
 *            only, and now false read as a claim about the app;
 *        (b) any "no part of your note" / "your words never leave" shape.
 *            The write does edit the note's own `---` block, and a capped
 *            excerpt does go to Claude for the run, so the honest scope
 *            stays "frontmatter and dates";
 *        (c) the RETIRED body-derived-title hedge ("first real line", "the
 *            single label that can come from your own text"). Until
 *            2026-07-30 a blank title was filled from the note's own first
 *            body line, and the disclosure had to say so. The owner
 *            removed that behaviour mid-UAT: the title is now the note's
 *            own FILENAME, or a numbered placeholder. So the hedge must be
 *            gone AND the stronger promise it blocked — nothing from your
 *            writing is ever copied into the block — must be present.
 *            Both directions are pinned, so neither can creep back.
 *
 *   3. ONE PROMISE, ONE WORDING, TWO SURFACES. The in-app consent copy
 *      (CLEAN_DISCLOSURE_COPY / CLEAN_WRITEBACK_DISCLOSURE /
 *      CLEAN_APPLY_COPY, pinned byte-exactly by test_cleaning_ui.cjs) and
 *      this document must not drift apart. The shared clauses are LIFTED
 *      OUT OF app.js at run time and required in LIBRARIAN.md, so editing
 *      the shipped copy without editing the disclosure fails here. Note
 *      the shipped constants carry CURLY apostrophes (’) — comparison is
 *      normalised rather than re-typed, because a straight-quote paste is
 *      exactly the silent mismatch this gate exists to catch.
 *
 * AMENDED 2026-07-31 (26.88-07, D-09/D-10) — THE DISPLAY TIER. Until this
 * phase every promise in here was about a WRITE. 26.88 re-lays-out a
 * clipped note ON THE SCREEN: a run becomes a list, a label the author
 * wrote becomes a heading, and on a note the tidy-up has read the librarian
 * may supply one short heading word from a closed 24-entry roster. Not one
 * byte of the file moves — which is exactly the trap. Every sentence the
 * write tier promises stayed true, so this could have gone undisclosed
 * while what she SEES changed. "Nothing is written" is not the same as
 * "nothing is changed" (T-26.88-06). Three things follow, all held above:
 *   (a) the document carries a display-tier section of its own, with nine
 *       required clauses — and because two of them are sentences the
 *       tidy-up section also uses, a SECTION-SCOPED block requires all nine
 *       inside that section, not merely somewhere in the file;
 *   (b) the shipped body promise is one word sharper on BOTH surfaces
 *       (WORDING, not WORDS), and the retired phrasing is forbidden on the
 *       NORMALISED path so a re-wrapped revert cannot slip past;
 *   (c) a model-named heading and a promoted one render IDENTICALLY by
 *       design — any mark would be decoration on a reading surface (law 4)
 *       — so the ONLY place that asymmetry is legible is the clause "those
 *       few heading words are the room's". That clause is not prose; it is
 *       the whole discharge of an invisible-provenance risk.
 *
 * Comparison is whitespace-collapsed (LIBRARIAN.md is hard-wrapped, so
 * every phrase spans a newline somewhere), lower-cased (the document is
 * lowercase-leaning house voice; app.js sentences are capitalised), and
 * normalised over curly quotes/dashes and markdown backticks.
 *
 * Run contract, identical to the sibling suites: one OK line + exit 0 on
 * success; every violation listed + exit 1 on failure.
 *
 * Fix the SOURCE (LIBRARIAN.md / app.js), never this gate.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOC = 'LIBRARIAN.md';
const APP = 'app.js';
const docSrc = fs.readFileSync(path.join(ROOT, DOC), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');

const violations = [];

// Curly punctuation, markdown backticks, hard wrapping and sentence case
// are all presentation. Normalise them away so a pin is about the PROMISE.
function norm(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const doc = norm(docSrc);

// Section 6 builds the overclaim shapes; section 7's drill re-uses THE SAME
// ARRAY OBJECT to prove they still catch what they claim to. It is exported
// through this binding rather than re-typed, because a re-typed pattern
// passes its own drill forever while the shipped one walks away from it —
// which is the drift this whole file exists to catch. ⚠ 26.93-09 moved no
// pattern: the shapes are byte-identical to the base commit, and only the
// stated REASON of the last one changed, because the claim it forbids is
// still false while what makes it false is now the rebuilt librarian rather
// than a sign-in.
let DELTA_FORBIDDEN_SHAPES = null;

// The first LINE of LIBRARIAN.md a pattern hits (raw, un-normalised) —
// so a failure names a place in the file, not just a missing string.
function firstHitLine(src, re) {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) { return (i + 1) + ': ' + lines[i].trim(); }
  }
  return null;
}

// Lift a shipped copy constant's VALUE out of app.js. Single-quoted, with
// \' tolerated; the values themselves use curly apostrophes.
function appConst(name) {
  const re = new RegExp(
    'var\\s+' + name + "\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*;");
  const m = appSrc.match(re);
  if (!m) {
    violations.push('[consistency] ' + APP + ': the ' + name +
      ' constant is missing or no longer a single-quoted literal — the ' +
      'in-app consent copy and this disclosure must stay one wording');
    return null;
  }
  return m[1].replace(/\\'/g, "'");
}

// ---- 1. THE DISCLOSURE EXISTS AND SAYS THE LOAD-BEARING THINGS -----------

(function () {
  const SECTIONS = [
    ['## tidying: long notes made easier to read',
      'the D-03 tidy-up disclosure section'],
    ['## a note you leave, written back into the file it came from',
      'the comments write-back disclosure section']
  ];
  SECTIONS.forEach(function (pair) {
    if (doc.indexOf(norm(pair[0])) === -1) {
      violations.push('[disclosure] ' + DOC + ': ' + pair[1] +
        ' is missing — expected the heading "' + pair[0] + '"');
    }
  });

  // Every clause below is a promise a passing test makes true. The map
  // from clause -> test is the copy-truth audit table in 26.85-06-SUMMARY.
  const REQUIRED = [
    // DECISION-PIN, re-decided 2026-07-30 (owner, mid-UAT). "off by
    // default" used to be pinned here. Both tidy-up switches now default
    // ON (server.cleaning_flag_on: absent = on), so pinning that sentence
    // would pin a LIE. The strength moved: it is not that the app cannot
    // write, it is that the app never writes unasked and everything it
    // writes comes back. Those are the clauses pinned below, and each is
    // still machine-proven. The retired sentence is FORBIDDEN in section 2
    // so it cannot creep back.
    ['nothing is sent anywhere',
      '⚠ THE BIGGEST CHANGE IN THE WHOLE SECTION, and it must lead. This ' +
      'pass reaches no model at all (#89) — where a sentence ends is not a ' +
      'judgement — so there is no excerpt, no consent-to-send and no cost. ' +
      'It replaces "never writes unasked", which was written when the ' +
      'tidy-up was a thing that could arrive at her'],
    ['arrives on',
      'the DEFAULT must be disclosed honestly. Absent = on, server-side ' +
      '(test_server_smoke CleaningRouteTest.test_cleaning_defaults_on_' +
      'and_explicit_false_is_off)'],
    // ⚠ RE-CUT 2026-08-14 (26.95-05): 'two switches' / 'turn either one
    // off' are GONE. The second switch meant "may the tidy-up write to my
    // files", and once the labelling pass was retired (#87) writing became
    // ALL the tidy-up does — so its off-position meant "do nothing", which
    // is the config-stress trap (#86 ruling 5). One switch now, and a
    // disclosure describing two would send her looking for one that is not
    // there.
    ['one switch',
      'the ONE switch must be disclosed, and disclosed as the whole of the ' +
      'permission — there is no second one to find'],
    ['until you go to it and ask',
      '⚠ ON IS NOT RUNNING, and this is the sentence that carries it now ' +
      'that the post-import offer is deleted (#91). The switch arrives on, ' +
      'so what protects her is that nothing happens until she opens it ' +
      'herself'],
    ['tidy your vault',
      'the Manage doorway must be named so the owner can find the switch'],
    ['before and after',
      'THE CONSENT MECHANISM, replacing "nothing is written until you tap ' +
      'Apply on a batch you have looked at, note by note" (#86 ruling 2, ' +
      'amending #52). She sees the three worst notes in scope changed, and ' +
      'approves the run — the safety argument intact, with the CHANGE in ' +
      'front of her instead of a list of her own filenames'],
    ['the spacing below',
      '⚠ THE HONEST SCOPE OF THE WRITE, and it MOVED. It used to be ' +
      '"frontmatter and dates" — the --- block only. #88 ruled the ' +
      'readability pass writes into the body itself, so the doc must say ' +
      'that plainly rather than keep a narrower claim that reads safer'],
    ['your wording is never changed',
      'the load-bearing body promise, in the same words as ' +
      'CLEAN_DISCLOSURE_COPY (test_cleaning_writer TestBodyByteIdentity). ' +
      'Reworded 2026-07-30 from "it never changes your words" — the owner ' +
      'rewrote the in-app line, and the two surfaces say it the same way. ' +
      'Sharpened again 2026-07-31 (26.88 D-10) by ONE word — WORDS became ' +
      'WORDING — because the app now re-lays-out a clipped note for ' +
      'READING: a promise about her words reads as a promise about what is ' +
      'on the screen and is no longer exactly true, while a promise about ' +
      'her wording is true of the vault write today, of display-time ' +
      'reformatting now, and of write-time reformatting later, because ' +
      'layout is not wording. The retired phrasing is FORBIDDEN in section ' +
      '2 (on the NORMALISED path) so it cannot creep back'],
    ['not one word changes',
      '⚠ THE BODY PROMISE, RESTATED. It used to be "byte for byte" — and ' +
      'that is no longer true of the body, because the pass changes ' +
      'spacing in it (#88/#90). What IS true, and is the stronger claim ' +
      'because it is checked against her own file at the moment of every ' +
      'write, is that nothing but spacing moves ' +
      '(study_lib.apply_readability_body; test_cleaning_writer ' +
      'TestReadabilityBodyWriter)'],
    ['refuses',
      'AND THE FAIL-CLOSED HALF SAID OUT LOUD. A promise checked at run ' +
      'time is only worth more than a promise checked in tests if the ' +
      'reader is told it refuses rather than guesses'],
    ['last edited',
      'the mtime promise (test_cleaning_writer TestMtimeRestore)'],
    ['put back',
      'the mtime is RESTORED after the write, not merely left alone'],
    ['never moves a file',
      'no file is ever moved or renamed (D-02)'],
    ['goes back in one tap',
      'undo, in the same words as CLEAN_DISCLOSURE_COPY ' +
      '(test_cleaning_writer TestUndoRoundTrip)'],
    ['counted and said out loud',
      '⚠ PRODUCT LAW 9, VERBATIM: "every note the room declines to touch is ' +
      'counted and said out loud". This replaces the retired "left ' +
      'untouched" (an unsure LABEL, which no longer exists) and it is a ' +
      'wider promise, not a narrower one — the pre-sort reporting success ' +
      'while abandoning 18 of 60 notes is the defect it exists to forbid'],
    ['never-show',
      'the fence holds FIRST — a fenced note is never listed, sent, or ' +
      'tidied (test_cleaning_fence)'],
    ['## comments',
      'the comments write-back names the section it appends under'],
    ['only ever added',
      'the comments write-back is append-only — it never edits a line ' +
      'the owner wrote (test_comment_syncback)'],

    // ---- THE DISPLAY TIER (26.88-07, D-09) --------------------------------
    //
    // "nothing is written" is NOT the same as "nothing is changed". 26.88
    // re-lays-out a clipped note ON THE SCREEN — a list where the author
    // wrote a run, a heading where the author wrote a label, and, on a note
    // the tidy-up has read, a short heading word the ROOM supplied. No byte
    // of the file moves, which is exactly why this could have gone
    // undisclosed: every promise the write tier makes is still true. What
    // changed is what she SEES, and a disclosure that only covers the writer
    // is an omission in the same way an overclaim is a lie (T-26.88-06).
    //
    // The SEVENTEEN clauses below are the section's contract — nine from
    // 26.88-07, plus the three the re-plan owes (26.88-14), plus the two F-6b
    // owes (26.88-20), plus the three the 26.88 CODE REVIEW owes (at the
    // tail: the left boundary, her own tag rows, and the widened escape —
    // each correcting a sentence that was FALSE the day it shipped). Two
    // of them — "your wording is never changed" and "byte for byte" — are
    // deliberately the SAME words the tidy-up section already uses, so a
    // doc.indexOf hit here does not prove the display section carries them.
    // That is what the SECTION-SCOPED block immediately after this loop is
    // for; these seventeen entries are the document-wide requirement, and each
    // failure names the behaviour the missing sentence was disclosing.
    ['how a saved note is laid out for reading',
      'the display-tier section exists and is findable. It is the ONLY ' +
      'place in the app or this document where the reader learns that the ' +
      'page she is looking at is not the shape of the file'],
    ['every word on the screen is yours',
      'WHAT REPLACED THE HONEST HALF OF D-01, in HER words (owner ' +
      '2026-08-17, #77). The retired clause was "those few heading words ' +
      'are the room\'s" — T-26.88-22\'s discharge of an invisible-provenance ' +
      'risk: a heading the librarian NAMED and one promoted out of her own ' +
      'text render IDENTICALLY by design (no badge, tint, italic or marker, ' +
      'because any of those is decoration on a reading surface, law 4 — ' +
      'test_reformat_wiring group J pins that none exists), so that ' +
      'sentence was the only place the asymmetry was legible at all. ' +
      '⛔ #95 DELETED THE JOB THAT NAMED SECTIONS, so the asymmetry itself ' +
      'is gone: every heading word on the screen is now promoted out of ' +
      'what she already wrote, and placeHeadings is reached with an empty ' +
      'list on every path. The risk being discharged CHANGED, so the ' +
      'clause changed with it — this pins the STRONGER claim the deletion ' +
      'earned rather than dropping the row. ' +
      '⚠ IT IS STILL A PROVENANCE PIN, and it is the sharper one: it goes ' +
      'red the day anything puts a word on a reading surface that she did ' +
      'not write, which is exactly the change that must never land ' +
      'silently. ⛔ Her sentence, chosen by her from options; no agent may ' +
      'reword it (#77)'],
    ['your wording is never changed',
      'D-10, one wording across every surface — the same sentence the ' +
      'tidy-up section and CLEAN_DISCLOSURE_COPY carry, restated for the ' +
      'display tier because layout is not wording. Doc-wide here; pinned ' +
      'to THIS section by the section-scoped block below'],
    ['in the order you saved it',
      'the word-SEQUENCE invariant, not merely the word set (D-04). ' +
      'core.js wordsPreserved compares the token SEQUENCE of the source ' +
      'against the transformed text, minus the headings the transform ' +
      'itself declared, and on ANY mismatch the ORIGINAL body renders ' +
      '(test_reformat_property P1; test_reformat_fixtures H5 is the green ' +
      'counter-test)'],
    ['code blocks, tables, quotes',
      'the D-07 hands-off zones. structureBody copies each of the SIX byte ' +
      'for byte, never splitting, joining, reordering or re-marking one, and ' +
      'handsOffSpans refuses to place a heading inside any of them (fixtures ' +
      'H4, property P3). The roster is a fenced block, a markdown table, a ' +
      'blockquote run, an image/attachment line, an Obsidian `%%` comment ' +
      '(the F-1 fix, T12/T12b) and an emphasis-wrapped picture caption (D-13, ' +
      'T14/T14c-T14f, Z1/Z2) — the last two were added AFTER this rationale ' +
      'was first written, and a rationale that names four of six zones ' +
      'understates the promise the clause is making'],
    ['nothing is written to the file',
      'THE SHAPE-A SCOPE FENCE (D-11) — the sentence that keeps this ' +
      "section from reading as a second writer. The transform is display " +
      'time only: no filesystem API is reachable from anything on the ' +
      'render path (test_reformat_wiring group H), which is the whole ' +
      "reason 26.85's byte-identity promise survives this phase intact " +
      '(test_cleaning_writer TestBodyByteIdentity)'],
    // ⚠ RE-CUT 2026-08-14 (26.95-05). This pin required the phrase "byte
    // for byte" in the display-tier section, on the reasoning that one
    // vocabulary should carry one promise across both tiers. THE PROMISE
    // ITSELF CHANGED. "byte for byte" was a claim about the note ON DISK
    // matching what she saved, and #88 ruled that the tidy-up may now
    // change spacing inside the body — so on the tidy-up side the phrase
    // became false, and a shared vocabulary that is false on one side is
    // not a shared vocabulary.
    //
    // The one-vocabulary rule is KEPT and re-pointed at the words that are
    // true on both sides: nothing but spacing moves, and nothing here is
    // written to a file at all.
    ['only the spacing',
      'the display tier and the tidy-up now describe their limit the same ' +
      'way — spacing moves, nothing else does. This replaces "byte for ' +
      'byte", which stopped being true of the tidy-up at #88'],
    ['nothing is written to the file',
      'AND the display tier keeps the stronger claim that is still exactly ' +
      'true of IT: this transform touches no file at all, which is what ' +
      'keeps the reading surface from reading as a second writer (D-11)'],
    ['shown exactly as you wrote them',
      'D-06, the personal-source exception: a note that came from her own ' +
      'writing is never reformatted at all. The wall-of-text problem is a ' +
      'clipped-post problem, and her own prose is already the shape she ' +
      'meant it to be'],
    ['show as saved',
      "D-08, and the document's label is pinned to the BUTTON's label — " +
      "app.js renderReactionBar's swapLabel() is the only place that " +
      'string is written, and test_reformat_wiring group I holds it byte ' +
      'for byte. If the control is ever renamed, this clause goes red and ' +
      'the document moves with it'],

    // ---- THE THREE CLAUSES THE RE-PLAN OWES (26.88-14) --------------------
    //
    // Plans 11, 13 and 10 each changed what the reader SEES, and D-09's whole
    // discipline is that this document leads the behaviour rather than
    // catching up to it. Appended to the TAIL on purpose: the tail is what
    // `REQUIRED.slice(headAt + 1)` scopes to the display section, so each of
    // these is required doc-wide AND inside the section, and the two cannot
    // drift.
    ["sentences on separate lines, at its own writer's full stops and " +
      'nowhere else',
      'D-15/D-20. The room now breaks a block of running prose that no ' +
      'marker signals, which the section did not previously describe at all ' +
      '- its "the way its own writer already implied" framing covered the ' +
      'D-03 signal rules and nothing else. core.js SENTENCE_BREAK_MIN (600, ' +
      'D-20) is the gate and splitSentences is the rule; it returns VERBATIM ' +
      'SLICES behind an abbreviation guard, a whitespace guard and ' +
      "openSpanAt's inline-span refusal, and it runs LAST, behind the zone " +
      'map and behind every D-03 rule (fixtures S8-S21, property ' +
      'WALL_SHAPE_FLOOR). The "nowhere else" half is the load-bearing one: a ' +
      'break lands only where the writer already ended a sentence'],
    ['if the room cannot tell where a note came from, it treats it as yours',
      'D-19, and this makes an EXISTING promise stronger rather than adding ' +
      'a new one. core.js isPersonalNote now reads hasFrontmatterBlock: an ' +
      'item with no frontmatter block at all is personal, so it is never ' +
      'laid out. That closed a live law-4 exposure over 152 of her own ' +
      'un-frontmattered notes - 143 phone captures in one adapter folder, ' +
      'including the two largest walls in the pool, both her diary. A ' +
      'permissive absent-source default was right for an Obsidian vault and ' +
      'wrong for the adapter, and the disclosure has to say which way the ' +
      'app now errs'],
    ['picture captions',
      'D-13. A wholly-emphasis-wrapped line is a caption, not a section ' +
      'label: core.js WHOLLY_EMPHASIZED_RE, wired as a hands-off span in ' +
      'handsOffSpans and as a zone branch in structureBody (fixtures ' +
      'T14/T14c-T14f, Z1/Z2). This was the phase-blocking F-3 defect - the ' +
      'colon rule fired on the `*图：...*` caption the vault\'s own ' +
      'clippings-processor writes into every image-bearing clipping, emitted ' +
      '`## *图` and split the emphasis pair across a heading boundary. On ' +
      'two thirds of the notes it touched, mangling a caption was the only ' +
      'thing the transform did. 677 real captions across the eligible pool ' +
      'are now left exactly as written, so the hands-off roster in this ' +
      'section has to name them'],

    // ---- THE CLAUSE 26.88-17 OWES (26.88-19, F-7) -------------------------
    //
    // The run rule became NARROWER, not wider, so nothing new is being
    // disclosed in the sense of a new capability. The clause is here because
    // the document's ONLY sentence about the run rule - "a run of ingredients
    // becomes a list" - described a rule that no longer exists, and D-09's
    // whole posture is keeping the disclosure ahead of the behaviour rather
    // than catching up to it. It is also the one rule in this section the
    // owner has a RECORDED opinion about, in her own words at the 26.88-15
    // UAT: "this is the whole sentence, no need to break off the sentence as
    // bullet points."
    //
    // Deliberately at the TAIL, inside the display-tier group, so it is
    // required doc-wide AND inside the section - see the scoped block below.
    // A doc-wide-only pin passes with the clause pasted anywhere in the file,
    // which is the F-6 failure mode in a different document.
    ["stops where its own writer's sentence stops",
      'F-7 (26.88-17). splitSeparatorRun had no notion of where a list ENDS: ' +
      'it built its first segment from the top of the paragraph and its last ' +
      'from everything after the final separator, so a `、` run swallowed a ' +
      'clause at one end and a following sentence at the other. It is now ' +
      'bounded to the sentence carrying its first separator, at BOTH ends, ' +
      'via CORE.runSentenceSpan derived from CORE.splitSentences - so the ' +
      'bound inherits the terminator guard, the span guard and the ' +
      'image-token guard whole rather than being a second spelling of a ' +
      'boundary rule. The prefix and the remainder are emitted as their own ' +
      'blocks, byte-identical to their source slices (fixtures F7-OWNER, ' +
      'F7-HEAD, F7-TAIL, F7-DASH, counterweighted by F7-PIN). This sentence ' +
      'mirrors the shape of the D-15 clause beside it - "at its own ' +
      "writer's full stops and nowhere else\" - because it is the same " +
      'promise about a different rule: the room stops where her writer ' +
      'stopped, and never guesses at a boundary the writer did not write'],
    // Deliberately at the TAIL, inside the display-tier group, for the same
    // reason the F-7 clause above is: a doc-wide-only pin passes with the
    // sentence pasted anywhere in the file.
    ['the hash is the only thing removed and the word always stays',
      'F-6b (26.88-20), and it is the ONE clause in this document that ' +
      'discloses a REMOVAL rather than a move. Owner decision of record, ' +
      'live on 2026-08-03: the rednote hashtag row is stripped of its `#` ' +
      'marks on the reading page. Until this landed the section said "only ' +
      'the spacing around your words moves", which the carve-out made ' +
      'FALSE — an overclaim by omission is the same defect as an overclaim ' +
      'in words (T-26.88-06), and it would have been the exact shape of the ' +
      'disclosure drift plan 14 spent a task closing. The sentence is ' +
      'paired in the doc with the two bounds that make it safe: the word ' +
      'survives, and it fires only on a RUN'],
    ['two or more of them sit together on one line',
      'F-6b\'s NARROWNESS, disclosed rather than merely implemented. The ' +
      'run rule is what keeps the carve-out off a Slack channel name in her ' +
      'HR evidence, a shade code, an issue ref and a hex colour — 49, 18 and ' +
      'a hundred-odd live occurrences respectively, measured 2026-08-03 — ' +
      'and a reader who is told a `#` is removed deserves to be told where ' +
      'it is not. Fixtures F6b-4 and F6b-6 are this sentence as code'],

    // ---- THE THREE CLAUSES THE 26.88 CODE REVIEW OWES ---------------------
    //
    // The review found three sentences in this section that were FALSE as
    // written on the day they shipped, and the same discipline applies to
    // their corrections: a promise with no pin is a promise that drifts.
    ['stuck to the end of your own word',
      "WR-02. The carve-out welded her sentence into her tag block on 13 " +
      'live sites — "…玩的丰臣秀吉#太阁立志传5" came out "…玩的丰臣秀吉太阁立志传5", ' +
      'one unbroken run of Chinese with no separator anywhere, which reads ' +
      'WORSE than as-saved. A `#` glued to the previous word is now left ' +
      'alone, and the reader is told so rather than left to notice. ' +
      'core.js HASHTAG_GLUED_RE is the rule; F6b-6c/6d/6e are the fixtures; ' +
      "the probe's fourth carve-out gate is the live count, floor 0"],
    ['a tag row you typed in your own note keeps its marks',
      'WR-01. "notes you wrote yourself are shown exactly as you wrote them, ' +
      'always" was FALSE the day the carve-out shipped: it ran in ' +
      'cleanVaultMarkup, downstream of every one of renderSavedBody\'s ' +
      'refusals, and reached two of her own notes including TODO-JobSearch.md ' +
      'where "(#ClaudeCode #AIEngineering)" is a tag pair SHE typed. The ' +
      'carve-out now honours that refusal, and this clause is what keeps the ' +
      'sentence above it honest instead of merely broad'],
    ['or only with a hash taken off',
      'THE ESCAPE, WIDENED TO WHAT IT NOW COVERS. "on any note the room did ' +
      'lay out" was too narrow twice over: the carve-out edited notes the ' +
      'room DECLINES to lay out, and on those the control was not rendered ' +
      'at all (REFORMAT_STATE false), so there was an edit with no way back. ' +
      'The strip moved above the toggle and REFORMAT_STATE is computed over ' +
      'the final text. tests/test_saved_body_escape.cjs E2/E3/E4 are this ' +
      'clause executed, and they go red against 603bdbf']
  ];
  REQUIRED.forEach(function (pair) {
    if (doc.indexOf(norm(pair[0])) === -1) {
      violations.push('[disclosure] ' + DOC + ': missing disclosed promise "' +
        pair[0] + '" — ' + pair[1]);
    }
  });

  // ---- THE DISPLAY-TIER SECTION, SCOPED (26.88-07, D-09) ------------------
  //
  // The loop above is document-wide, and two of the seventeen display-tier
  // clauses ("your wording is never changed", "byte for byte") are sentences
  // the TIDY-UP section also carries. So the whole display section could be
  // deleted and those two would still be found — a pin that cannot fail is
  // not a pin. This block slices the section out of the NORMALISED document
  // — its own heading to the next heading — and requires all seventeen INSIDE
  // it, so deleting any one of them from the new section fails here and
  // names it.
  //
  // Normalised rather than line by line, for the reason section 2's RETIRED
  // list already states: LIBRARIAN.md is hard-wrapped, so every one of these
  // sentences straddles a newline somewhere.
  //
  // THE GROUP IS THE TAIL OF `REQUIRED`, from the clause AFTER the heading
  // onward, so the two lists cannot drift apart. Append any NON-display
  // clause ABOVE the display-tier group, never after it.
  //
  // The heading clause itself is deliberately NOT a member of the scoped
  // group: `section` is sliced to start immediately AFTER the heading text,
  // so searching the section for its own anchor can never succeed. That the
  // heading exists at all is already proven twice over — once by the
  // doc-wide REQUIRED loop above, and once by `secAt !== -1` here.
  const DISPLAY_HEAD = 'how a saved note is laid out for reading';
  const TIDY_HEAD = '## tidying: long notes made easier to read';
  const headAt = REQUIRED.map(function (p) { return p[0]; })
    .indexOf(DISPLAY_HEAD);
  if (headAt === -1) {
    violations.push('[disclosure] this gate no longer requires "' +
      DISPLAY_HEAD + '" — that clause is the anchor of the display-tier ' +
      'group, and without it nothing scopes the other eight to the section ' +
      'they belong to (26.88 D-09)');
  } else {
    const secAt = doc.indexOf(norm('## ' + DISPLAY_HEAD));
    if (secAt !== -1) {
      const after = doc.slice(secAt + norm('## ' + DISPLAY_HEAD).length);
      const nextHead = after.indexOf('## ');
      const section = nextHead === -1 ? after : after.slice(0, nextHead);
      REQUIRED.slice(headAt + 1).forEach(function (pair) {
        if (section.indexOf(norm(pair[0])) === -1) {
          violations.push('[disclosure] ' + DOC + ': the display-tier ' +
            'section does not carry "' + pair[0] + '" — the clause may ' +
            'still appear elsewhere in the document, but the section that ' +
            'discloses the reading surface has to say it itself. ' + pair[1]);
        }
      });
      // PLACEMENT (D-09, and the reason the section sits where it does):
      // reading comes before writing in her experience, and the display
      // tier standing immediately next to the write tier is what makes
      // "nothing is written" is not the same as "nothing is changed"
      // legible on the page rather than argued for.
      if (nextHead === -1 ||
        after.slice(nextHead).indexOf(norm(TIDY_HEAD)) !== 0) {
        violations.push('[disclosure] ' + DOC + ': the display-tier ' +
          'section is no longer immediately before "' + TIDY_HEAD + '". ' +
          'Put it back, or re-cut this pin with the reason — the adjacency ' +
          'is what makes the two tiers readable against each other');
      }
    }
  }
})();

// ---- 2. NO OVERCLAIM ------------------------------------------------------

(function () {
  const FORBIDDEN = [
    { re: /nothing already in your vault is ever opened, edited, or touched/i,
      why: 'the OLD absolute line. True of the reflection writer alone, and ' +
        'false read as a claim about the app: tidying edits an existing ' +
        "note's frontmatter and comments append to one (D-03). Scope it to " +
        'the writer it describes.' },
    { re: /no part of your note/i,
      why: 'an overclaim — the `---` block IS part of the note, and tidying ' +
        'edits it (labels in, stale dates folded). The body is what is ' +
        'untouched. Say "frontmatter and dates".' },
    // ⚠ 26.93-09 — THE PATTERN IS BYTE-UNCHANGED AND THE BAN STAYS
    // ABSOLUTE. Only this rationale moved, and it moved because the world
    // under it did: the local rung is no longer parked, it is the SHIPPED
    // DEFAULT, so for the first time there is a place where this sentence
    // would be literally true. That is exactly when a gate like this one
    // gets "improved" into a scoped version — and scoping it is refused.
    // This regex is applied PER RAW LINE (firstHitLine), and LIBRARIAN.md is
    // hard-wrapped: the qualifier that would make the sentence honest sits
    // on the line ABOVE it and the cloud-crossing warning five lines BELOW,
    // so any predicate able to see the scoping must span the wrap — and a
    // predicate that spans the wrap also spans an UNSCOPED sentence sitting
    // near the word "rung". It would fail OPEN, on the one subject the
    // product may never be wrong about. A blunt ban cannot fail open.
    // The honest scoped fact still gets said: LIBRARIAN.md's "who answers"
    // bullet says it the long way round, and carries its own warning not to
    // be tidied back into this phrasing.
    { re: /your words never leave/i,
      why: 'an overclaim wherever it appears unqualified — a capped excerpt ' +
        'of the notes you ticked goes to a company for that one run, and a ' +
        'cloud tier may be the one answering. The local rung is the only ' +
        'place it could be literally true, and it is STILL banned there: ' +
        'say it the long way round (see the "who answers" bullet), because ' +
        'a reader skimming one hard-wrapped line cannot see a qualifier ' +
        'that lives on the line above it.' },
    { re: /never writes to your vault/i,
      why: 'an overclaim — three switches can write to the vault, and the ' +
        'honest framing is that each is off until turned on' },
    // RE-CUT 2026-07-31 (26.88-07). The two regexes below are BYTE-UNCHANGED
    // and must stay that way — they are about the tier-1 WRITER, which still
    // reformats nothing and still never decodes a body. Their RATIONALES had
    // gone stale: both used to say body reformatting is not shipped, and as
    // of 26.88 it IS shipped — for DISPLAY, on the screen, with no byte of
    // the file touched (see the "how a saved note is laid out for reading"
    // section in the document). A stale reason is how a future phase talks
    // itself into deleting a live pin, so the reasons move and the pins do
    // not.
    { re: /\breformats?\s+your\s+(?:notes?|words|body)\b/i,
      why: 'a promise the tier-1 WRITER does not keep — it edits the ' +
        "note's `---` block and slices the body out as raw bytes it never " +
        'decodes, so nothing it writes back is reformatted (D-02). The ' +
        'DISPLAY tier does lay a clipped note out for reading, but it ' +
        'writes nothing at all, and this document discloses it in its own ' +
        'section rather than by loosening what the writer promises. Neither ' +
        'tier may say it reformats her notes' },
    { re: /\brewrites?\s+your\s+(?:notes?|words|body)\b/i,
      why: 'a promise NEITHER tier keeps — the tier-1 writer never touches ' +
        'the body at all (D-02 / law 4), and the display tier only ever ' +
        're-emits slices of the source, guarded by a word-sequence compare ' +
        'that renders the ORIGINAL on any mismatch (core.js wordsPreserved, ' +
        'D-04). "rewrites your notes" would be false about both, which is ' +
        'why this regex survives a phase that ships reformatting' },
    { re: /\bmoves?\s+your\s+(?:files?|notes?)\s+(?:into|to)\b/i,
      why: 'a promise the tier-1 writer does not keep — no file is ever ' +
        'moved (D-02)' },
    // THE RETIRED DEFAULT (owner's call, mid-UAT 2026-07-30). The tidy-up
    // used to be off until turned on, twice over, and the disclosure led
    // with it. Both switches now default ON (server.cleaning_flag_on), so
    // every one of these sentences is FALSE about the shipped app. They are
    // scoped narrowly to the tidy-up's own phrasings on purpose: "off by
    // default" on its own is still TRUE of the reflection write-back and of
    // comments, and those two sections must keep saying it.
    { re: /off by default,\s*behind two switches/i,
      why: 'the RETIRED tidy-up default. Both switches default ON now — ' +
        'absent = on (server.cleaning_flag_on). Say what ships: it arrives ' +
        'on, either half turns off, and nothing is written unasked.' },
    { re: /neither one is on until you turn it on/i,
      why: 'the RETIRED tidy-up default, verbatim — both switches are on ' +
        'until she turns one off' },
    { re: /turning the tidy-?up on does not buy permission/i,
      why: 'the RETIRED write-consent framing. The write switch is no ' +
        'longer a second deliberate tap she must make; it is a second ' +
        'deliberate tap she can UNDO. Separate, still — but on.' },
    { re: /both are off until you turn them on/i,
      why: 'false of the pair (comments, tidying) since 2026-07-30 — ' +
        'comments is off until turned on, tidying arrives on' }
  ];
  FORBIDDEN.forEach(function (f) {
    const hit = firstHitLine(docSrc, f.re);
    if (hit !== null) {
      violations.push('[overclaim] ' + DOC + ':' + hit + ' — ' + f.why);
    }
  });

  // THE RETIRED BODY PROMISE (26.88-07, D-10), matched against the
  // NORMALISED document rather than line by line — the same path the RETIRED
  // list below uses, and for the same stated reason: LIBRARIAN.md is
  // hard-wrapped, so a re-wrapped revert of this sentence straddles a
  // newline and slips a per-line regex entirely. That is not hypothetical.
  // The 26.88 executor found this exact sentence living in
  // tests/test_cleaning_ui.cjs, split across a JS concatenation so its two
  // halves sat on different source lines — a sixth site, where the phase's
  // own per-line survey had counted five.
  //
  // The line hint is still reported when the sentence happens to fit on one
  // line, because a failure should name a place when it can.
  const FORBIDDEN_NORMALISED = [
    { re: /your words are never changed/i,
      why: 'retired 2026-07-31 (26.88 D-10) in favour of "your wording is ' +
        'never changed" — one word, and the reason is load-bearing: the app ' +
        'now re-lays-out a clipped note for READING, so "your words" reads ' +
        'as a promise about what is on the screen and is no longer exactly ' +
        'true. "your wording" is true of the vault write today, of ' +
        'display-time reformatting now, and of write-time reformatting ' +
        'later — shape B changes layout, not wording.' }
  ];
  FORBIDDEN_NORMALISED.forEach(function (f) {
    if (!f.re.test(doc)) { return; }
    const hit = firstHitLine(docSrc, f.re);
    violations.push('[overclaim] ' + DOC + (hit === null ? '' : ':' + hit) +
      ' — ' + f.why);
  });

  // (c) THE RETIRED HEDGE. The body-derived title was removed on
  //     2026-07-30 (owner's call, mid-UAT). The paragraph that disclosed it
  //     described real behaviour then and describes nothing now, so its
  //     shapes are forbidden outright — a copy-paste revert of the old
  //     paragraph, or a quiet re-derivation dressed in the old words, both
  //     fail here.
  //     Matched against the NORMALISED doc, not line by line: LIBRARIAN.md
  //     is hard-wrapped, so the old paragraph's phrases each straddle a
  //     newline and a per-line regex would miss a verbatim revert.
  const RETIRED = [
    ['first real line',
      'the RETIRED body-derived title. A blank title is filled from the ' +
      "note's own FILENAME now, never a line of its text " +
      '(study_lib.derive_cleaning_titles). If this wording is back, either ' +
      'the doc regressed or the behaviour did.'],
    ['first body line',
      'same — no title is derived from a body any more'],
    ['single label that can come from your own text',
      "the retired hedge's framing. There is no such label now: nothing " +
      "in the block comes from the owner's writing."],
    ['so a phrase you wrote can end up copied up into',
      'the retired hedge, verbatim — this sentence describes behaviour ' +
      'that was removed on 2026-07-30']
  ];
  RETIRED.forEach(function (pair) {
    const at = doc.indexOf(norm(pair[0]));
    if (at !== -1) {
      violations.push('[stale-hedge] ' + DOC + ': "' + pair[0] +
        '" is still in the disclosure — ' + pair[1]);
    }
  });

  // ⚠ THE TITLE DISCLOSURE PINS WERE REMOVED 2026-08-14 (26.95-05), and
  // this comment is here instead of them so the removal is a decision
  // somebody can argue with rather than a gap.
  //
  // They required LIBRARIAN.md to state where a filled-in title comes
  // from: a blank title only, from the note's own filename, with a
  // deterministic numbered placeholder as the last resort. Every one of
  // those sentences was TRUE and is still true of `study_lib`'s code.
  //
  // What changed is that no person can reach it. #87 retired the labelling
  // pass — it spent hours to add one guessed word to notes in a key
  // nothing in the app reads — and 26.95-05 removed every surface that
  // could start one. A disclosure exists to tell somebody what the room
  // will do to their files; documenting a feature they cannot invoke is
  // not honesty, it is noise, and it would send a reader hunting Manage
  // for a switch that is not there.
  //
  // ⚠ THE LABELLING BACKEND IS STILL IN THE TREE and its deletion is owed
  // (#87). Until it goes, `test_cleaning_writer` keeps proving these rules
  // — so the guarantees are still machine-checked; they are simply no
  // longer PROMISED to anyone, because they are no longer offered to
  // anyone. If a labelling pass is ever reachable again, these pins come
  // back in the same commit that makes it reachable.
})();

// ---- 3. ONE PROMISE, ONE WORDING, TWO SURFACES ---------------------------

(function () {
  // ⚠ RE-CUT 2026-08-14 (26.95-05). This section used to pair FIVE app.js
  // constants with LIBRARIAN.md: the two labelling disclosures, the
  // apply-time line, and the two Manage switch labels. Four of the five
  // described the labelling pass or its second switch, and both are gone
  // (#87, #86 ruling 5). Pairing a document against a constant that no
  // longer exists reports a drift that is really a deletion, which is how
  // a suite trains its reader to ignore it.
  //
  // What survives is the rule itself, applied to what actually ships: the
  // ONE switch's label and its one-line disclosure must be the words the
  // app really renders, and the promises they make must be the promises
  // the document makes.
  const disclosure = appConst('CLEAN_DISCLOSURE_COPY');
  const startCopy = appConst('CLEAN_START_COPY');

  // (a) the Manage doorway label the disclosure tells her to look for must
  //     be the label the app actually renders.
  if (startCopy !== null && doc.indexOf(norm(startCopy)) === -1) {
    violations.push('[consistency] ' + DOC + ': the Manage doorway label ' +
      'has drifted — CLEAN_START_COPY is "' + startCopy + '" and the ' +
      'disclosure must name what the app actually shows');
  }

  // (b) ⚠ AND THE PROMISE THAT MUST NOT DRIFT AGAIN. The tidy-up now
  //     writes INSIDE the body (#88), so "your wording is never changed"
  //     is the whole of what protects her writing — it is no longer
  //     backed up by "and nothing below the --- block is touched at all",
  //     because that sentence stopped being true. It must appear in the
  //     shipped switch copy AND in the document.
  const SHARED = [
    [disclosure, 'CLEAN_DISCLOSURE_COPY', 'your wording is never changed']
  ];
  SHARED.forEach(function (triple) {
    const value = triple[0];
    const name = triple[1];
    const clause = norm(triple[2]);
    if (value === null) { return; }
    if (norm(value).indexOf(clause) === -1) {
      violations.push('[consistency] ' + APP + ': ' + name +
        ' no longer contains the shared clause "' + triple[2] + '" — the ' +
        'in-app copy was reworded. Update LIBRARIAN.md and this gate ' +
        'together, or the two surfaces promise different things.');
      return;
    }
    if (doc.indexOf(clause) === -1) {
      violations.push('[consistency] ' + DOC +
        ': the shipped ' + name + ' promises "' + triple[2] +
        '" and the disclosure does not — one promise, one wording, two ' +
        'surfaces');
    }
  });

  // (c) the retired constants must be GONE, not merely unpaired — a
  //     sentence left in app.js is a sentence that can be rendered again.
  ['CLEAN_WRITEBACK_DISCLOSURE', 'CLEAN_WRITEBACK_LABEL', 'CLEAN_APPLY_COPY']
    .forEach(function (name) {
      if (appSrc.indexOf(name) !== -1) {
        violations.push('[consistency] ' + APP + ': ' + name + ' is still ' +
          'present — it belongs to the retired labelling pass and its ' +
          'second switch (#87, #86 ruling 5)');
      }
    });
})();

// ---- 4. THE DISCLOSED BEHAVIOUR STILL HAS A SOURCE -----------------------
//
// Three sentences in the disclosure describe real behaviour that no
// dedicated unit test asserts (see the copy-truth audit in
// 26.85-06-SUMMARY.md — GAP-1/GAP-2/GAP-3). Each is true of the shipped
// code, verified by reading it; each could silently stop being true under a
// refactor with the whole suite still green. A disclosure regresses just as
// badly when the CODE moves out from under it as when the words change, so
// these are pinned in the repo's own static-gate idiom until real unit
// coverage lands.

(function () {
  const libSrc = fs.readFileSync(path.join(ROOT, 'study_lib.py'), 'utf8');
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

  // Lift one top-level python def body: from its `def` line to the next
  // line that starts a top-level def/class (study_lib.py is flat).
  function pyBody(src, name, tag) {
    const lines = src.split('\n');
    let at = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('def ' + name + '(') === 0) { at = i; break; }
    }
    if (at === -1) {
      violations.push('[source] ' + tag + ': def ' + name +
        ' is missing — the disclosure describes behaviour that no longer ' +
        'has a source');
      return null;
    }
    for (let j = at + 1; j < lines.length; j++) {
      if (/^(def |class )/.test(lines[j])) {
        return { text: lines.slice(at, j).join('\n'), line: at + 1 };
      }
    }
    return { text: lines.slice(at).join('\n'), line: at + 1 };
  }

  // (a) GAP-1, RE-DECIDED 2026-07-30 — "nothing from your writing is ever
  //     copied up into that block". This one flipped: it used to pin that
  //     the body deriver existed and read bodies. It now pins that the
  //     deriver is GONE and that the surviving builder cannot reach a body
  //     at all. Behaviour coverage is real (test_cleaning_writer
  //     TestNoTitleIsEverDrawnFromABody); this is the static half, because
  //     a body read could be reintroduced in a helper the unit test's
  //     fixtures happen not to exercise.
  if (/^def derive_note_title\s*\(/m.test(libSrc)) {
    violations.push('[source] study_lib.py: derive_note_title is back — the ' +
      'title must never be derived from a note body again. The disclosure ' +
      'promises the filename, or a numbered placeholder, and nothing else.');
  }
  // ⚠ THE SECOND HALF OF GAP-1 IS NOW KEPT BY ABSENCE (2026-08-17). It used
  // to walk `derive_cleaning_titles` and forbid it reaching a body, then
  // require it to use the filename rule and the numbered fallback. #87 found
  // a title could never be written at all — the label schema did not permit
  // one — and #95 deleted the pass, so there is no title derivation left in
  // the tree. The promise "nothing from your writing is ever copied up into
  // that block" is now kept by there being no code that could.
  if (/^def derive_cleaning_titles\s*\(/m.test(libSrc)) {
    violations.push('[source] study_lib.py: derive_cleaning_titles is back ' +
      '— it belonged to the deleted labelling pass (#95). If a title path ' +
      'is genuinely returning, it returns with the two pins this block used ' +
      'to hold: no body read, and the filename-then-number order');
  }

  // (b) "a title you already wrote is never replaced by a guess" — gated by
  //     test_cleaning_writer.test_a_real_title_is_never_overwritten; the
  //     policy guard itself is pinned here so the reason stays visible.
  const reconcile = pyBody(libSrc, 'reconcile_frontmatter_updates',
    'study_lib.py');
  if (reconcile && !/if not str\(current\)\.strip\(\):/.test(reconcile.text)) {
    violations.push('[source] study_lib.py:' + reconcile.line +
      ' the blank-title-only guard is gone — a machine guess must never ' +
      'overwrite a title the owner wrote');
  }

  // (c) GAP-2 — "the notes the librarian was not sure about are left
  //     untouched" — RETIRED AS A CODE CLAIM 2026-08-17, and the reason is
  //     that its subject is gone. The sentence disclosed the LABELLING flow:
  //     a model returned `unsure` on a note it could not file, and
  //     `clean_write_set`'s triple intersection held that record back before
  //     the writer. #95 deleted the model job, the apply route and the
  //     intersection with them. Nothing in the shipped tidy-up has an
  //     opinion to be unsure about — it puts a line break at a full stop —
  //     so this is pinned as an absence, the same way GAP-1's half above is.
  if (/^def clean_write_set\s*\(/m.test(srvSrc)) {
    violations.push('[source] server.py: clean_write_set is back — the ' +
      'triple intersection guarded a labelling apply that no longer exists ' +
      '(#95). A pass that proposes anything again needs this gate AND the ' +
      'unsure hold-back restored together, never one of the two');
  }

  // (d) GAP-3 — "it never moves a file and never renames one". Only ever
  //     covered incidentally (the jail + undo read the same path back), so
  //     forbid the shapes outright in the two writer bodies. The atomic
  //     same-dir os.replace lives in atomic_write_bytes, deliberately not
  //     in scope here.
  [['apply_cleaning_frontmatter', libSrc, 'study_lib.py'],
    ['undo_cleaning_batch', libSrc, 'study_lib.py']]
    .forEach(function (triple) {
      const body = pyBody(triple[1], triple[0], triple[2]);
      if (!body) { return; }
      [/shutil\.move/, /\.rename\(/, /os\.replace\(/].forEach(function (re) {
        if (re.test(body.text)) {
          violations.push('[source] ' + triple[2] + ':' + body.line + ' ' +
            triple[0] + ' contains ' + re.source + ' — the disclosure ' +
            'promises no file is ever moved or renamed (D-02)');
        }
      });
    });
})();

// ---- 5. NO VENDOR NAMED INSIDE THE FICTION (26.87-05, D-21) --------------
//
// The config-ask refusal family is the app's first copy that points PAST
// itself. The capability-gap branch names ONE door — an AI coding assistant
// in the terminal — and then stops. It must never name the VENDOR in-scene,
// even though the librarian is built on that CLI.
//
// Two live grounds, and NEITHER is the retired "never require coding or a
// paid key" clause that law 8's 2026-07-21 amendment superseded when the app
// became AI-native:
//   (a) FICTION INTEGRITY — a product name in a place that is supposed to be
//       a room is a seam in the fiction, and vendor-coupled in-scene copy
//       ages badly.
//   (b) COPY HELD TO TRUTH — this gate's whole job. The honest, checkable
//       statement about which service the librarian calls belongs in
//       LIBRARIAN.md, where a builder looks. So the fact is RELOCATED, never
//       deleted, and BOTH directions are pinned: absent from the refusals,
//       present in the document. A vendor-free room that also stopped
//       telling the truth anywhere would pass half this gate and fail the
//       disclosure contract entirely.

(function () {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
  const VENDOR =
    /claude|anthropic|openai|chatgpt|copilot|cursor|gemini|llama|mistral/i;
  const REFUSALS = ['CONFIG_MANAGE_ONLY_MSG', 'CONFIG_NOT_A_CAPABILITY_MSG',
    'CONFIG_UNMAPPED_MSG', 'CONFIG_TOO_MANY_MSG'];

  REFUSALS.forEach(function (name) {
    const m = srvSrc.match(new RegExp('\\n' + name + ' = "([^"]*)"'));
    if (!m) {
      violations.push('[in-scene] server.py: ' + name + ' is missing, or is ' +
        'no longer a single-line double-quoted literal — the refusal family ' +
        'is a fixed set, one message per source line, so this gate can read ' +
        'each string whole');
      return;
    }
    if (VENDOR.test(m[1])) {
      violations.push('[in-scene] server.py: ' + name + ' names a vendor ' +
        'inside the fiction — the room may name one door and then stop; the ' +
        'checkable statement about the service belongs in ' + DOC);
    }
  });

  // The client's local literal fallback is in-scene copy too, and it is the
  // string that actually renders if the server's own words ever go missing.
  const fallback = appSrc.match(
    /var ASK_REFUSAL_FALLBACK = \{[\s\S]*?\n {2}\};/);
  if (!fallback) {
    violations.push('[in-scene] ' + APP + ': ASK_REFUSAL_FALLBACK is missing ' +
      '— the refusal render has no local literal fallback, so a response ' +
      'stripped of its string would render nothing at all');
  } else if (VENDOR.test(fallback[0])) {
    violations.push('[in-scene] ' + APP + ': ASK_REFUSAL_FALLBACK names a ' +
      'vendor inside the fiction — the fallback is what renders when the ' +
      "server's own words are absent, so it is held to the same fence");
  }

  // ...and the truth the fence relocates is REQUIRED to live in the
  // builder-facing document, so this is a relocation and not a deletion.
  if (doc.indexOf('claude code') === -1) {
    violations.push('[in-scene] ' + DOC + ': the disclosure no longer names ' +
      'the service the librarian actually calls — the in-scene copy is ' +
      'allowed to be vendor-free ONLY because the honest specifics live here');
  }
})();

// ---- 6. THE 26.87 CAPABILITY DELTA (SRM-13, D-06/D-17/D-19/D-21) ---------
//
// Three capabilities opened in 26.87, and each one changes what the owner
// should be able to READ about her own tool: a place to ask for a change in
// her own words, a derived page of what the room has noticed about her, and
// a model she picks herself. A disclosure that omits a capability is untrue
// in exactly the way an overclaim is (T-26.87-19), so the delta is gated in
// the shipped three-part grammar rather than trusted to prose.
//
// THREE ASSERTION GROUPS, and each carries its own INVERSE so a regression
// cannot pass by editing one side:
//
//   (a) REQUIRED + FORBIDDEN, per capability. Every disclosed clause names
//       the code that makes it true; every forbidden shape is a sentence
//       that would be FALSE about the shipped app — a sentence claiming her
//       typed ask stays on this machine, a sentence claiming the identity
//       page is never sent anywhere, a sentence ranking one model above
//       another.
//
//   (b) SHARED CLAUSES LIFTED AT RUN TIME, the section-3 discipline widened
//       past app.js. Five strings now exist in TWO places — the room's own
//       invitation line, the capability-gap refusal, the two voice-picker
//       lines, and the two derived files' own in-file headers — so each is
//       read out of its source at run time and required in the disclosure.
//       Editing the shipped copy without editing the document fails here,
//       which is the whole contract; re-typing any of them into this gate
//       would silently break it.
//
//   (c) THE DISCLOSED FACTS STILL HAVE A SOURCE, the section-4 idiom applied
//       to the delta. The alias list, the default alias, the change cap and
//       the fence call are all read out of the code and compared against
//       what the document SAYS — so "there are three: opus, sonnet and
//       haiku" stops being true the moment a fourth alias ships, and the
//       gate says so instead of the document quietly lying.
//
// PAIRED WITH SECTION 5, NEVER REPLACING IT. Section 5 forbids a vendor
// in-scene. This section requires the relocated specifics HERE, and adds the
// byte-twin check the refusal family's own comments claim but nothing
// asserted: the server owns the string, the client fallback is its twin, and
// a drifted twin is a second voice for the same refusal.

(function () {
  const libSrc = fs.readFileSync(path.join(ROOT, 'study_lib.py'), 'utf8');
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

  // ---- lifters ------------------------------------------------------------

  // A single-line double-quoted python literal (the CONFIG_*_MSG shape).
  function pyLiteral(src, name, tag) {
    const m = src.match(
      new RegExp('\\n' + name + ' = "((?:[^"\\\\]|\\\\.)*)"'));
    if (!m) {
      violations.push('[delta] ' + tag + ': ' + name + ' is missing, or is ' +
        'no longer a single-line double-quoted literal — ' + DOC + ' quotes ' +
        'it verbatim, and a shape this gate cannot read is a promise it ' +
        'cannot hold');
      return null;
    }
    return m[1];
  }

  // A parenthesised multi-line python string: the implicit-concatenation
  // shape the two derived files' headers use. Segments are joined and the
  // escaped newlines flattened, because the FILE renders them wrapped and
  // the document quotes the sentence.
  function pyParen(src, name, tag) {
    const m = src.match(new RegExp('\\n' + name + ' = \\(([\\s\\S]*?)\\)\\n'));
    if (!m) {
      violations.push('[delta] ' + tag + ': ' + name + ' is missing, or is ' +
        'no longer a parenthesised string literal — ' + DOC + ' quotes this ' +
        "file's own header word for word");
      return null;
    }
    const segs = m[1].match(/"(?:[^"\\]|\\.)*"/g) || [];
    if (!segs.length) {
      violations.push('[delta] ' + tag + ': ' + name +
        ' no longer contains a string literal at all');
      return null;
    }
    return segs.map(function (s) { return s.slice(1, -1); })
      .join('').replace(/\\n/g, ' ');
  }

  // One top-level python def body — the section-4 helper, local to this
  // section so neither owns the other.
  function pyBody(src, name, tag) {
    const lines = src.split('\n');
    let at = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('def ' + name + '(') === 0) { at = i; break; }
    }
    if (at === -1) {
      violations.push('[delta] ' + tag + ': def ' + name + ' is missing — ' +
        DOC + ' describes behaviour that no longer has a source');
      return null;
    }
    for (let j = at + 1; j < lines.length; j++) {
      if (/^(def |class )/.test(lines[j])) {
        return { text: lines.slice(at, j).join('\n'), line: at + 1 };
      }
    }
    return { text: lines.slice(at).join('\n'), line: at + 1 };
  }

  // One member of the client's refusal fallback object, scoped to the object
  // itself rather than grepped loose out of a 600 KB file.
  function askFallback(key) {
    const block = appSrc.match(/var ASK_REFUSAL_FALLBACK = \{[\s\S]*?\n {2}\};/);
    if (!block) { return null; }   // section 5 already reports the absence
    const m = block[0].match(
      new RegExp(key + ': "((?:[^"\\\\]|\\\\.)*)"'));
    if (!m) {
      violations.push('[delta] ' + APP + ': ASK_REFUSAL_FALLBACK has no ' +
        key + ' branch — the four-branch set is the fence, not a lookup ' +
        'table, and a missing branch renders nothing at all');
      return null;
    }
    return m[1];
  }

  function need(phrase, why, kind) {
    if (doc.indexOf(norm(phrase)) === -1) {
      violations.push('[' + (kind || 'delta') + '] ' + DOC +
        ': missing disclosed promise "' + phrase + '" — ' + why);
    }
  }

  // ---- (a) THE ASK SURFACE (26.87-04..07, D-01/D-21/D-22, SE-1) -----------

  [['want the room to work differently',
    'the ask must be disclosed as a place she can find — the invitation ' +
    'line is lifted from ASK_INVITE_COPY below, and this is the plain ' +
    'requirement that the surface is named at all'],
    ['the librarian only ever proposes',
      'law 7 / D-01: the ask route is a GENERATION route ' +
      '(server.handle_librarian_ask writes nothing), so the disclosure must ' +
      'not leave her thinking a sentence can change her room'],
    ['nothing changes until you tap the card',
      'her tap is the only writer, and it lands through the shipped ' +
      '/api/meta validators (app.js applyAskCard -> apiPost(\'/api/meta\'))'],
    ['it sends no item title, no item body, no filter value, and no folder ' +
      'from your roster',
      'THE INBOUND FENCE IN PLAIN WORDS (build_config_ask_doc, SE-1). ' +
      'Asserted against four sentinel classes on the RECORDED STDIN by ' +
      'tests/test_librarian_config_fence.cjs — this sentence is what that ' +
      'suite makes true, and the two must not drift apart'],
    ['names one door',
      'the capability-gap branch names ONE door and then stops (D-21) — no ' +
      'how-to, no drafted prompt, no link, no command, no file path'],
    ['that door is Claude Code',
      'THE RELOCATION, and the exact inverse of section 5. The room is ' +
      'allowed to be vendor-free ONLY because the specific lives here, ' +
      'where a builder looks. Deleting this sentence turns a relocation ' +
      'into a deletion and the disclosure into an omission']
  ].forEach(function (p) { need(p[0], p[1]); });

  // ---- (b) THE DERIVED IDENTITY PAGE (26.87-08, D-06/D-07/D-32, SE-11) ----

  [['librarian/identity.md',
    'the page is a FILE under the visible librarian folder, named so she ' +
    'can open it (study_lib.identity_file_path)'],
    ['four signals and only four',
      'D-07: blessed state, her own comments, own-voice authorship and a ' +
      'glad reaction — and a not_really is an ABSENCE and never a signal ' +
      '(study_lib._identity_item_weight)'],
    ['contributes nothing at all',
      'the fence: a never-show, retired, trigger-marked or filter-excluded ' +
      'item feeds no token, and the derivation CALLS the shipped ' +
      '_librarian_fenced rather than re-implementing it (pinned below)'],
    ['no model writes this page',
      'the derivation is deterministic code — zero model calls, zero new ' +
      'fence surface, and it cannot hallucinate a self for her'],
    ['also leans what the librarian reaches for',
      'THE OMISSION THIS CLOSES. The anchors do not merely sit in a file ' +
      'she can read: they ride the per-turn reflection document and lean ' +
      'the pool (server._reflection_turn_doc). A page described as private ' +
      'notes-to-self would be true about the file and false about its ' +
      'effect'],
    ['never counts what is missing',
      'D-32 / law 3: the evidence floor is never surfaced — no meter, no ' +
      'percentage, no "still getting to know you" state']
  ].forEach(function (p) { need(p[0], p[1]); });

  // ---- (c) THE SETTABLE MODEL (26.87-09, D-17/D-19, T-26.87-03) -----------

  [['you choose which model writes',
    'the picker is hers (app.js voice picker -> /api/meta voice_model)'],
    ['refused at the moment it would be saved',
      'validate_voice_model is fail-closed AT THE WRITE, because this is ' +
      "the one meta key that becomes the CLI's --model argument"],
    ['wins over the pick stored in the room',
      'resolve_voice_model precedence: a LEGAL shell value beats her stored ' +
      'pick, which is the compatibility promise 26.87-01 made to a shell ' +
      'that already worked'],
    ['a shell value that is not one of the six is refused the same way',
      'the env_rejected branch — fail-closed is correct, but INVISIBLE is ' +
      'not, so the pane says so rather than pretending the shell was silent']
  ].forEach(function (p) { need(p[0], p[1]); });

  // ---- (d) THE INVERSES: sentences that would be FALSE about the app ------

  const DELTA_FORBIDDEN = [
    { re: /your sentence never leaves this machine/i,
      why: 'FALSE of the ask — her own sentence is the one user-authored ' +
        'field the ask document carries, and it is passed verbatim ' +
        '(build_config_ask_doc). The honest scope is what it does NOT send' },
    { re: /nothing you type is (?:ever )?sent/i,
      why: 'same overclaim, the other phrasing — the ask sends her sentence' },
    { re: /the librarian (?:applies|makes|saves) the change (?:itself|for you)/i,
      why: 'FALSE and the most dangerous direction to be wrong in: the ask ' +
        'route writes nothing at all, and her tap on the card is the only ' +
        'writer (law 7 / D-01)' },
    { re: /(?:this page|that page|nothing on it) (?:never leaves|is never sent|stays on this machine)/i,
      why: 'FALSE of the identity page — its anchors ride the per-turn ' +
        'reflection document. It is a file she can correct, not a file ' +
        'that stays put' },
    { re: /\b(?:opus|sonnet|haiku) is (?:the )?(?:best|better|smartest|most accurate)\b/i,
      why: 'a quality ranking the app does not make and cannot support. ' +
        'The shipped orienting line describes reading depth and speed, ' +
        'never rank (VOICE_ORIENTING_COPY)' },
    { re: /your shell setting is ignored/i,
      why: 'FALSE — a legal shell value WINS over her stored pick ' +
        '(resolve_voice_model)' },
    // 26.87-12 follow-up (owner-approved 2026-07-30). This one is not a
    // hypothetical: the sentence "nothing is required." shipped in the
    // built-for-self-use paragraph and survived every gate until this
    // phase read the doc for truth. It sat between two sentences that ARE
    // still true ("no account is bundled. no key ships with the app."),
    // which is exactly why it stayed invisible — and it contradicted the
    // file's own AI-native banner eleven lines above it. Laws 7 and 8 as
    // amended 2026-07-21: the room REQUIRES the librarian; there is no
    // no-AI build. Pinned as a shape, not the one string, so the claim
    // cannot return in a near-paraphrase.
    { re: /nothing (?:at all )?is required|no (?:sign-?in|login|account|key) is required|requires nothing/i,
      why: 'FALSE since the AI-native amendment (laws 7/8, 2026-07-21), and ' +
        'still false after the 26.93 rebuild — only the REASON moved. The ' +
        'room requires a librarian; what a librarian IS changed (a key she ' +
        'brings, or a model on her own machine) and that it is required did ' +
        'not. There is no no-AI build. The true neighbours are "no account ' +
        'is bundled" and "no key ships with the app" — the app bundles ' +
        'nothing, which is NOT the same as needing nothing' }
  ];
  DELTA_FORBIDDEN_SHAPES = DELTA_FORBIDDEN;
  // Matched against the NORMALISED doc, not line by line: LIBRARIAN.md is
  // hard-wrapped, so an overclaim written across a wrap would slip a per-line
  // regex entirely. The line hint is still reported when the sentence happens
  // to fit on one line, because a failure should name a place when it can.
  DELTA_FORBIDDEN.forEach(function (f) {
    if (!f.re.test(doc)) { return; }
    const hit = firstHitLine(docSrc, f.re);
    violations.push('[overclaim] ' + DOC + (hit === null ? '' : ':' + hit) +
      ' — ' + f.why);
  });

  // ---- (e) THE SHARED CLAUSES, LIFTED AT RUN TIME -------------------------
  //
  // Never re-typed here. A re-typed clause passes this gate forever while the
  // shipped copy walks away from it, which is precisely the silent drift
  // section 3 exists to catch.

  [[appConst('ASK_INVITE_COPY'), APP, 'ASK_INVITE_COPY',
    'the room\'s own invitation line — the disclosure tells her what to ' +
    'look for, so it must be what the room actually shows'],
    [appConst('VOICE_LABEL_COPY'), APP, 'VOICE_LABEL_COPY',
      'the Manage doorway label for the picker, held exactly as ' +
      'CLEAN_START_COPY is in section 3'],
    [appConst('VOICE_ORIENTING_COPY'), APP, 'VOICE_ORIENTING_COPY',
      'the ONE orienting sentence the app offers about the three models. ' +
      'Quoting it verbatim is what keeps the disclosure from inventing a ' +
      'ranking of its own'],
    [askFallback('not_a_capability'), APP,
      'ASK_REFUSAL_FALLBACK.not_a_capability',
      'the capability-gap line itself. The disclosure quotes the in-scene ' +
      'words and THEN names the vendor — the pairing section 5 requires ' +
      'only works if the quoted half is the shipped half'],
    [pyParen(libSrc, 'IDENTITY_PAGE_NOTE', 'study_lib.py'), 'study_lib.py',
      'IDENTITY_PAGE_NOTE',
      "the identity page's own in-file header. She reads the file and this " +
      'document on the same afternoon; two wordings of one promise is one ' +
      'wording too many'],
    [pyLiteral(libSrc, 'REFLECTIONS_FILE_NOTE', 'study_lib.py'),
      'study_lib.py', 'REFLECTIONS_FILE_NOTE',
      "the variation ledger's own in-file header — including the " +
      'surprising half (it records passed drafts too), which is exactly ' +
      'the part a reader would otherwise trip over']
  ].forEach(function (row) {
    let value = row[0];
    if (value === null || value === undefined) { return; }
    value = String(value).replace(/<!--/g, ' ').replace(/-->/g, ' ');
    if (doc.indexOf(norm(value)) === -1) {
      violations.push('[consistency] ' + DOC + ': the shipped ' + row[1] +
        ' ' + row[2] + ' is "' + norm(value) + '" and the disclosure does ' +
        'not carry it word for word — ' + row[3]);
    }
  });

  // The below-the-floor page: the disclosure quotes its opening clause, so
  // the clause must still OPEN it. Both directions, so neither side can move
  // alone.
  const THIN_LEAD = "there isn't much here yet";
  const thin = pyParen(libSrc, 'IDENTITY_THIN_BODY', 'study_lib.py');
  if (thin !== null && norm(thin).indexOf(norm(THIN_LEAD)) !== 0) {
    violations.push('[delta] study_lib.py: IDENTITY_THIN_BODY no longer ' +
      'opens with "' + THIN_LEAD + '" — the disclosure quotes that clause ' +
      'as what the page says when the room has not seen enough (D-32)');
  }
  need(THIN_LEAD, 'the honest below-the-floor page is disclosed in its own ' +
    'words: the page is STILL WRITTEN and says plainly that the room does ' +
    'not know much yet, rather than guessing (render_identity_page)');

  // ---- (f) THE BYTE-TWIN CHECK (pairs with section 5) ---------------------
  //
  // The client's fallback calls itself the byte-twin of the server's literal.
  // Nothing asserted it. A drifted twin is a SECOND VOICE for one refusal —
  // and the one that renders is the one that shows up when the server's own
  // words go missing, which is exactly when nobody is watching.

  [['manage_only', 'CONFIG_MANAGE_ONLY_MSG'],
    ['not_a_capability', 'CONFIG_NOT_A_CAPABILITY_MSG'],
    ['unmapped', 'CONFIG_UNMAPPED_MSG'],
    ['too_many', 'CONFIG_TOO_MANY_MSG']
  ].forEach(function (pair) {
    const client = askFallback(pair[0]);
    const server = pyLiteral(srvSrc, pair[1], 'server.py');
    if (client === null || server === null) { return; }
    if (norm(client) !== norm(server)) {
      violations.push('[in-scene] ' + APP + ': ASK_REFUSAL_FALLBACK.' +
        pair[0] + ' has drifted from server.py ' + pair[1] + ' — the ' +
        'server owns the string and the fallback is its twin, so a drifted ' +
        'twin is a second voice for one refusal, rendering exactly when ' +
        "the server's own words are absent");
    }
  });

  // ---- (g) THE DISCLOSED FACTS STILL HAVE A SOURCE ------------------------

  // The alias list. "there are three: opus, sonnet and haiku" is a CLAIM
  // about a tuple in server.py, and it stops being true the moment a fourth
  // alias ships.
  const modelsM = srvSrc.match(/\nVOICE_MODELS = \(([^)]*)\)/);
  if (!modelsM) {
    violations.push('[delta] server.py: VOICE_MODELS is missing or is no ' +
      'longer a flat tuple literal — the disclosure names its members');
  } else {
    const aliases = (modelsM[1].match(/"([^"]*)"/g) || [])
      .map(function (s) { return s.slice(1, -1); });
    // ⚠⚠ THE EXPECTED COUNT MOVED 3 -> 2 ON 2026-08-26, HER RULING
    // (26.99955 UAT, G-…-04), and the gate is doing exactly its job by
    // having gone red first: her document said "there are three" and named
    // them, and dropping `sonnet` from VOICE_MODELS made that untrue. She
    // approved the correction — four counts and one name, nothing else in
    // the page touched — so the document moved WITH the allow-list, which is
    // the contract this block exists to enforce.
    // ⛔ THE STRUCTURE IS UNTOUCHED, and that is what keeps this a moved pin
    // rather than a weakened one: the count is still LIFTED from the tuple
    // and still compared, the members are still named one by one in the
    // tuple's own order, and a fourth alias still fails here.
    // ⭐⭐ BACK TO THREE 2026-08-27, HER RULING THE NEXT DAY. The removal work
    // moved this pin to two with the document; she then reversed the ruling
    // and sonnet returned, so the pin and the document move back together —
    // which is exactly the discipline the paragraph above describes, applied
    // in the other direction. ⛔ The number stays HARD-CODED rather than
    // lifted from the tuple: a count derived from the thing it checks cannot
    // fail, and this pin exists to make a membership change visible.
    // ⭐⭐ AND PER PROVIDER FROM 2026-08-27, HER RULING (26.99955 UAT,
    // G-…-OPENAI). A room whose librarian answers from OpenAI now gets a
    // picker too, so `VOICE_MODELS` holds SIX and no room is ever offered
    // all six — you see the three your key can reach. Her document says
    // exactly that, and she chose it over one flat list of six precisely
    // because a flat list reads as a choice of six that nobody has.
    // ⛔ THE STRUCTURE IS STILL UNTOUCHED, which is what keeps this a moved
    // pin and not a weakened one: each roster's count is still LIFTED and
    // still compared, each roster's members are still named one by one in
    // that roster's own order, and a fourth alias on EITHER side still
    // fails here. What changed is that there are two rosters to say it of.
    const byProvM = srvSrc.match(
      /\nVOICE_MODELS_BY_PROVIDER = \{([\s\S]*?)\n\}/);
    if (!byProvM) {
      violations.push('[delta] server.py: VOICE_MODELS_BY_PROVIDER is ' +
        'missing or is no longer a flat dict literal — the disclosure ' +
        'names which readers each kind of room is offered');
    } else {
      const rosters = [];
      const rowRe = /"([^"]+)":\s*\(([^)]*)\)/g;
      let row;
      while ((row = rowRe.exec(byProvM[1])) !== null) {
        rosters.push({
          provider: row[1],
          aliases: (row[2].match(/"([^"]*)"/g) || [])
            .map(function (t) { return t.slice(1, -1); }),
        });
      }
      if (!rosters.length) {
        violations.push('[delta] server.py: VOICE_MODELS_BY_PROVIDER ' +
          'parsed to zero rosters, so nothing below was checked');
      }
      let named = 0;
      rosters.forEach(function (r) {
        named += r.aliases.length;
        if (r.aliases.length !== 3) {
          violations.push('[delta] server.py: the ' + r.provider +
            ' roster now has ' + r.aliases.length + ' members — ' + DOC +
            ' says "there are three" of each. Move the document with the ' +
            'allow-list.');
        }
        if (r.aliases.length > 1) {
          need(r.aliases.slice(0, -1).join(', ') + ' and ' +
            r.aliases[r.aliases.length - 1],
          'every alias a ' + r.provider + ' room may pick is named, in ' +
          'the order the allow-list carries them');
        }
      });
      if (named !== aliases.length) {
        violations.push('[delta] server.py: the rosters name ' + named +
          ' readers and VOICE_MODELS holds ' + aliases.length +
          ' — one of them can be stored and offered to nobody, or offered ' +
          'and never stored');
      }
    }
    need('there are three', 'the count is stated, and it is a claim about ' +
      'the rosters rather than a habit of phrasing');
    need('depends on who is answering', 'the document says the choice is ' +
      'not the same for every room — she chose this over a flat list of ' +
      'six, because a flat list reads as a choice nobody has');
  }

  // The default. Named twice in the document — where the room starts, and
  // where an illegal shell value lands — and both are lifted from the same
  // literal so a changed default fails loudly instead of aging quietly.
  const dflt = pyLiteral(srvSrc, 'LIBRARIAN_VOICE_MODEL_DEFAULT', 'server.py');
  if (dflt !== null) {
    need('the room starts with ' + dflt,
      'LIBRARIAN_VOICE_MODEL_DEFAULT is "' + dflt + '" — the disclosure ' +
      'names the starting model, and a changed default must move this line');
    need('the room falls back to ' + dflt,
      'an ILLEGAL shell value falls to the DEFAULT, never to her stored ' +
      'pick (resolve_voice_model) — the disclosure names which model that is');
  }

  // The change cap. "more than three changes at once is a considered no" is
  // a claim about CONFIG_CHANGE_CAP.
  const capM = srvSrc.match(/\nCONFIG_CHANGE_CAP = (\d+)/);
  if (!capM) {
    violations.push('[delta] server.py: CONFIG_CHANGE_CAP is missing — the ' +
      'disclosure states the cap in words');
  } else {
    const WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
    const word = WORDS[capM[1]];
    if (!word) {
      violations.push('[delta] server.py: CONFIG_CHANGE_CAP is ' + capM[1] +
        ', which this gate has no word for — say the new cap in ' + DOC +
        ' and add the word here');
    } else {
      need('more than ' + word + ' changes at once',
        'the cap is a CONSIDERED NO, not a failure, and the disclosure ' +
        'says so in the same number the code enforces (CONFIG_CHANGE_CAP)');
    }
  }

  // The fence is CALLED, not re-implemented — the inverse of "contributes
  // nothing at all". A second fence implementation drifts, and drift is a
  // leak (T-27-18).
  const derive = pyBody(libSrc, 'derive_identity_anchors', 'study_lib.py');
  if (derive) {
    [['_librarian_fenced(',
      'the identity derivation no longer calls the SHIPPED fence — the ' +
      'disclosure promises a fenced item contributes nothing, through the ' +
      'same one gate rather than a second copy of it'],
      ['_identity_self_authored(',
        "the SE-11 exclusion is gone — without it the room derives her " +
        'identity from its own prose, and the disclosure says a reflection ' +
        'the librarian made is not her voice']
    ].forEach(function (p) {
      if (derive.text.indexOf(p[0]) === -1) {
        violations.push('[source] study_lib.py:' + derive.line + ' ' + p[1]);
      }
    });
  }

  // The write-time gate behind "refused at the moment it would be saved".
  const vval = pyBody(srvSrc, 'validate_voice_model', 'server.py');
  if (vval && vval.text.indexOf('v not in VOICE_MODELS') === -1) {
    violations.push('[source] server.py:' + vval.line + ' ' +
      'validate_voice_model no longer tests membership of VOICE_MODELS — ' +
      'this is the one meta key that becomes a subprocess argument, so an ' +
      'unknown alias must be refused at the write and never stored');
  }

  // The shell precedence behind "wins over the pick stored in the room".
  const rvm = pyBody(srvSrc, 'resolve_voice_model', 'server.py');
  if (rvm) {
    [['VOICE_MODEL_ENV_NAMES',
      'the shell names are no longer read — the disclosure promises a ' +
      'setting you already made in your shell still works'],
      ['VOICE_SOURCE_ENV_REJECTED',
        'the refused-override token is gone — fail-closed is correct, but ' +
        'the disclosure promises the pane SAYS SO, and it cannot say what ' +
        'it cannot tell apart']
    ].forEach(function (p) {
      if (rvm.text.indexOf(p[0]) === -1) {
        violations.push('[source] server.py:' + rvm.line + ' ' + p[1]);
      }
    });
  }

  // The ask document is built from the NAME list, which is what makes
  // "it sends no item title, no item body, no filter value, and no folder
  // from your roster" structurally true rather than remembered.
  const askDoc = pyBody(srvSrc, 'build_config_ask_doc', 'server.py');
  if (askDoc && askDoc.text.indexOf('MODEL_PROPOSABLE_KEYS') === -1) {
    violations.push('[source] server.py:' + askDoc.line + ' ' +
      'build_config_ask_doc no longer builds from MODEL_PROPOSABLE_KEYS — ' +
      'the document is names, types and effective values BY CONSTRUCTION, ' +
      'and that construction is what the disclosed fence sentence rests on');
  }

  // The two derived files the factory-reset promise now names by name. If
  // either path moves, "delete the folder" stops being a complete sentence.
  [['identity_file_path', 'librarian/identity.md', libSrc, 'study_lib.py'],
    ['reflections_file_path', 'librarian/reflections.json', libSrc,
      'study_lib.py']
  ].forEach(function (row) {
    const body = pyBody(row[2], row[0], row[3]);
    if (!body) { return; }
    const parts = row[1].split('/');
    if (body.text.indexOf('"' + parts[0] + '"') === -1 ||
      body.text.indexOf('"' + parts[1] + '"') === -1) {
      violations.push('[source] ' + row[3] + ':' + body.line + ' ' + row[0] +
        ' no longer resolves ' + row[1] + ' — the factory-reset promise ' +
        'names that file by name, so "delete the folder" must keep being ' +
        'the whole story');
    }
    need(row[1], 'the factory-reset section names this file, so deleting ' +
      'the librarian folder stays a complete and true sentence');
  });

  // ---- (h) 26.91 D-07 (2026-08-07) — THE LITERAL THAT BECAME FALSE -------
  //
  // DISPOSITION, DATED. Until this commit `surface_content` sat in
  // NOT_A_CAPABILITY, so asking the librarian to set something out answered
  // with CONFIG_NOT_A_CAPABILITY_MSG — "that's past what i can change." That
  // sentence was TRUE right up to the commit these assertions ship in, and
  // this commit is what made it false: 26.91-04 retired the reading book, the
  // last surface rendering the librarian's proposal cohort, and D-07 gives
  // law 7 its proposing path back through the ask.
  //
  // So this block is the INVERSE of the pin the old truth would have carried.
  // It is written as a conjunction of a MEMBERSHIP fact, two BY-VALUE counts
  // and a DRIVEN verdict, because any one of them alone is satisfiable by a
  // rename: dropping the topic entirely would satisfy "not in
  // NOT_A_CAPABILITY" while leaving the ask with no answer at all.
  //
  // The message itself is UNCHANGED and is asserted so — only which topics
  // reach it moved. A block that also let the literal drift would be reading
  // its own edit back.
  const notCap = srvSrc.match(/\nNOT_A_CAPABILITY = \(([\s\S]*?)\)\n/);
  const surfaceT = srvSrc.match(/\nSURFACE_TOPICS = \(([\s\S]*?)\)\n/);
  if (!notCap) {
    violations.push('[26.91-D-07] server.py: NOT_A_CAPABILITY is missing or ' +
      'is no longer a flat tuple literal — the topic that moved out of it ' +
      'cannot be counted, so the move cannot be a measured fact');
  }
  if (!surfaceT) {
    violations.push('[26.91-D-07] server.py: SURFACE_TOPICS is missing — ' +
      'D-07 gives the surfacing ask its own topic tuple, and without it the ' +
      'ask falls back through the cascade to a refusal and law 7 ships dark');
  }
  const members = function (m) {
    return m === null ? [] : (m[1].match(/"([^"]*)"/g) || [])
      .map(function (s) { return s.slice(1, -1); });
  };
  const capMembers = members(notCap);
  const surfMembers = members(surfaceT);
  // ⚠ 26.95-34 (D-16) MOVED IT AGAIN, 5 -> 4. `blessing_batch_size` left
  // NOT_A_CAPABILITY when how many things one blessing pass sets out became a
  // real, validated, bounded setting — so "that's past what i can change"
  // stopped being true for it, exactly as it stopped being true for
  // surface_content in D-07. THIS PIN DID ITS JOB: it is what noticed.
  // The count is RE-POINTED, never relaxed, and it stays a bare literal for
  // the reason D-07 wrote it as one — "one fewer than before" is not a pin,
  // and a third topic leaving unnoticed has to be a failure rather than a
  // silent shrink.
  if (notCap && capMembers.length !== 4) {
    violations.push('[26.91-D-07] server.py: NOT_A_CAPABILITY holds ' +
      capMembers.length + ' topics — D-07 moved it 6 -> 5, 26.95-34 D-16 ' +
      'moved it 5 -> 4, and this count is pinned BY VALUE, never as "one ' +
      'fewer than before", so a further topic leaving unnoticed is a failure ' +
      'rather than a silent shrink');
  }
  if (surfaceT && surfMembers.length !== 1) {
    violations.push('[26.91-D-07] server.py: SURFACE_TOPICS holds ' +
      surfMembers.length + ' topics — pinned BY VALUE at 1. D-08 is ' +
      'pull-only and only when she asks; a second surfacing topic is a ' +
      'second door and belongs in a plan, not in a tuple');
  }
  if (capMembers.indexOf('surface_content') !== -1) {
    violations.push('[26.91-D-07] server.py: surface_content is back in ' +
      'NOT_A_CAPABILITY — asking the librarian to set something out would ' +
      'answer "that\'s past what i can change", which stopped being true ' +
      'on 2026-08-07. Law 7 would have no proposing surface at all');
  }
  // The twin of the line above, in the same shape and for the same reason
  // (26.95-34, D-16): pin the RETIRED membership ABSENT, so the count alone is
  // not carrying the claim. A count can be satisfied by the wrong four.
  if (capMembers.indexOf('blessing_batch_size') !== -1) {
    violations.push('[26.91-D-07] server.py: blessing_batch_size is back in ' +
      'NOT_A_CAPABILITY — asking for a smaller blessing pass would answer ' +
      '"that\'s past what i can change", which stopped being true on ' +
      '2026-08-15. It is a validated, bounded meta key now, and the sentence ' +
      'would be the room saying it cannot do something it just did');
  }
  if (surfMembers.indexOf('surface_content') === -1) {
    violations.push('[26.91-D-07] server.py: SURFACE_TOPICS does not carry ' +
      'surface_content — the topic exists in the vocabulary but reaches no ' +
      'branch, so the ask falls through to the plain "i didn\'t follow ' +
      'that" and D-07 is dark without saying so');
  }
  // THE VERDICT ITSELF, driven through the shipped cascade rather than read
  // off the tuples. A branch declared and never reached is this repo's named
  // defect class, and the tuple checks above cannot see the branch order.
  const cascade = pyBody(srvSrc, '_config_disposition', 'server.py');
  if (!cascade) {
    violations.push('[26.91-D-07] server.py: _config_disposition is gone — ' +
      'the verdict for a surfacing ask has nowhere to come from');
  } else {
    // READ THE BRANCHES, NEVER THE PROSE. The docstring names both tuples in
    // sentences, so an indexOf over the whole body finds the COMMENTARY and
    // orders that instead of the code. Caught by driving it: a mutation that
    // moved the branch BELOW the capability gap left this block GREEN,
    // because the docstring still mentioned SURFACE_TOPICS first — and a
    // lazy `if changes:[\s\S]{0,120}?SURFACE_TOPICS` proximity regex spanned
    // the whole re-ordered pair inside its own window. Both are this repo's
    // named defect class, landing inside the instrument built to catch it.
    // So: strip the docstring, then read the `if` lines AS AN ORDERED LIST
    // and pin positions, not distances.
    const quoted = cascade.text.indexOf('"""');
    const closing = quoted === -1 ? -1 :
      cascade.text.indexOf('"""', quoted + 3);
    const code = closing === -1 ? cascade.text :
      cascade.text.slice(closing + 3);
    if (closing === -1) {
      violations.push('[26.91-D-07] server.py:' + cascade.line + ' ' +
        '_config_disposition has no docstring to strip — this block reads ' +
        'the code AFTER it, so with no marker it would be reading prose');
    }
    const branches = code.split('\n')
      .filter(function (l) { return /^ {4}if .*:\s*$/.test(l); })
      .map(function (l) { return l.trim(); });
    // POSITIVE CONTROL, FIRST. A window that shrank to nothing would pass
    // every ordering test below on an empty list.
    if (branches.length < 4) {
      violations.push('[26.91-D-07] server.py:' + cascade.line + ' only ' +
        branches.length + ' branch lines were read out of the cascade — ' +
        'the scan window collapsed, so every ordering pin under it is ' +
        'vacuous and proves nothing about the order');
    } else {
      if (branches[0].indexOf('if changes:') !== 0) {
        violations.push('[26.91-D-07] server.py:' + cascade.line + ' the ' +
          'FIRST branch is "' + branches[0] + '" and not "if changes:" — a ' +
          'validated change she also asked for must win over everything, ' +
          'and first-match-wins makes position the whole design');
      }
      if (branches[1].indexOf('SURFACE_TOPICS') === -1) {
        violations.push('[26.91-D-07] server.py:' + cascade.line + ' the ' +
          'branch directly under "if changes:" is "' + branches[1] + '" — ' +
          'D-07 requires SURFACE_TOPICS there. Anywhere lower and a ' +
          'stricter branch masks it: below NOT_A_CAPABILITY it is ' +
          'unreachable for exactly the topic it was added for');
      }
      const surfAt = branches.findIndex(function (b) {
        return b.indexOf('SURFACE_TOPICS') !== -1;
      });
      const capAt = branches.findIndex(function (b) {
        return b.indexOf('NOT_A_CAPABILITY') !== -1;
      });
      if (surfAt === -1) {
        violations.push('[26.91-D-07] server.py:' + cascade.line + ' no ' +
          'executable branch consults SURFACE_TOPICS — the tuple exists, the ' +
          'docstring may still describe it, and nothing reads it, so ' +
          'surface_content lands on a refusal and D-07 ships dark');
      }
      if (capAt === -1) {
        violations.push('[26.91-D-07] server.py:' + cascade.line + ' no ' +
          'executable branch consults NOT_A_CAPABILITY — the ordering pin ' +
          'above has nothing to be ordered against');
      }
      if (surfAt !== -1 && capAt !== -1 && surfAt > capAt) {
        violations.push('[26.91-D-07] server.py:' + cascade.line + ' the ' +
          'SURFACE_TOPICS branch (position ' + surfAt + ') sits BELOW the ' +
          'NOT_A_CAPABILITY branch (position ' + capAt + ') — first match ' +
          'wins, so the old refusal keeps firing for surface_content');
      }
    }
  }
  // ...and the client renders the reply rather than the refusal line.
  //
  // READ WITH A LOCAL DOUBLE-QUOTE LIFTER, not appConst. Both lines carry a
  // straight apostrophe ("i'd"), so they ship double-quoted — the same house
  // form as ASK_FAIL_COPY and VOICE_FAIL_COPY, and the form that keeps the
  // literal greppable as itself (a \' escape would make a raw grep for the
  // shipped sentence read 0). appConst is deliberately NOT widened to admit
  // them: a gate relaxed to fit its newest subject stops meaning its name.
  const appDq = function (name) {
    const m = appSrc.match(new RegExp(
      'var\\s+' + name + '\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;'));
    if (!m) {
      violations.push('[26.91-D-07] ' + APP + ': ' + name + ' is missing, ' +
        'or is no longer a single-line double-quoted literal — the server ' +
        'names a disposition and stops, so a client carrying no line for it ' +
        'answers a proposing verdict with silence');
      return null;
    }
    return m[1];
  };
  const lead = appDq('SUGGEST_LEAD_IN');
  if (lead !== null && !/\bi'd\b/.test(lead)) {
    violations.push('[26.91-D-07] ' + APP + ': SUGGEST_LEAD_IN is "' + lead +
      '" — the lead-in must stay CONDITIONAL. Law 7 is propose-never-' +
      'dispose, and "here are yours" is a disposal announced as a courtesy');
  }
  const emptyLine = appDq('SUGGEST_EMPTY');
  if (emptyLine !== null && /\byou\b|\byour\b/.test(emptyLine)) {
    violations.push('[26.91-D-07] ' + APP + ': SUGGEST_EMPTY is "' +
      emptyLine + '" — the empty line names the LIBRARIAN, never her. An ' +
      'empty cohort is the room having nothing to offer, not her having ' +
      'failed to do something (law 3)');
  }
  [lead, emptyLine].forEach(function (s) {
    if (s !== null && /\d/.test(s)) {
      violations.push('[26.91-D-07] ' + APP + ': "' + s + '" carries a ' +
        'digit — no count of what is waiting reaches a front-facing ' +
        'surface. The owner vetoed a tally on 2026-07-27 (law 3)');
    }
  });
  // The disclosure moved with the truth, in this same commit.
  [['anything for me?',
    'the document names the sentence that reaches the new branch — a ' +
    'capability disclosed nowhere is a capability she cannot find, and D-08 ' +
    'already accepted the discoverability cost without adding a second one'],
    ["nothing i'd set out just now",
      'the empty answer is disclosed in the words the room actually uses'],
    ['no shelf, badge, dot or mark',
      'D-08 in the document: pull-only, and only when she asks. Law 1 is ' +
      'absolute, and a disclosure that left the ambient-cue question open ' +
      'would be the one place a future cue could hide'],
    ['the SAME fence, not a second one',
      'the law-5 argument is INHERITED, not re-implemented — the reply ' +
      'draws through the one guarded selector, which is the whole reason ' +
      'D-07 is safe by construction rather than by a second review']
  ].forEach(function (p) { need(p[0], p[1]); });
})();

// ---- 7. THE REBUILT LIBRARIAN (26.93-09, F-02/#28) ------------------------
//
// The librarian used to reach a model by starting a signed-in program on
// this machine. It does not any more: one function makes one plain request,
// and three things can answer it — her own machine, Anthropic, or OpenAI.
// Every sentence in the document that described the old arrangement stopped
// being true in the same wave.
//
// ⚠ THE DELETION IS A RELOCATION, NEVER AN OMISSION. A disclosure that
// merely drops a vendor's name is not more honest than one that names the
// wrong vendor — it is less. So this section is written as a PAIR, exactly
// like section 5 and section 6(d) before it: the retired claims are
// forbidden, and the facts that replaced them are REQUIRED, by name. Deleting
// a specific without replacing it turns the disclosure into an omission, and
// that would pass a gate that only forbade.
//
// ⚠ AND THE CLOUD DISCLOSURE SURVIVES THE EDIT, WHICH IS THE TRAP. Taking
// "Claude Code" out of the document is the easy half; taking the sentence
// about what crosses the internet out with it would be a silent, enormous
// weakening dressed as a cleanup. It is required here explicitly.
//
// CASES below counts THIS section only. The older sections carry roughly a
// hundred and thirty assertions between them and were never counted; a
// number this plan reconstructed by eye would be a guess wearing a pinned
// count's authority, which is the defect class this repo keeps producing.

const REBUILT_REQUIRED = [
  ['python3 server.py --setup',
    'THE ONE COMMAND that gives the room a key. A document that says a key ' +
    'is one of the two ways to have a librarian, and never says how one is ' +
    'given, has disclosed nothing actionable'],
  ['a key you bring',
    'half of what a librarian now IS. The room requires one; it no longer ' +
    'requires any particular program to be installed and signed in'],
  ['your own machine',
    'the other half, and the one that must be said plainly: a model running ' +
    'here is a complete room, not a lesser tier'],
  ['the shipped default',
    'her own machine is what a stranger gets without doing anything, and ' +
    'the document says so rather than nudging toward a key'],
  ['anthropic',
    'THE RELOCATED SPECIFIC, first of three. The room is allowed to be ' +
    'vendor-free in-scene ONLY because the specifics live here (section 5). ' +
    'After the rebuild there are three answerers, so naming one by ' +
    'assumption is no longer the honest form — all three are named'],
  ['openai',
    'the second answerer. It is unwitnessed on this machine and disclosed ' +
    'anyway: a provider the room would route to, named before it does'],
  ['ollama',
    'the third — what "your own machine" actually is, named so a builder ' +
    'can find the thing to start'],
  ['cross the internet to that company',
    '⚠ THE CLOUD DISCLOSURE. This is the sentence the vendor rename could ' +
    'have quietly taken with it. When a company is answering, allowed parts ' +
    'of her library leave this machine — that fact did not change in the ' +
    'rebuild and may never be softened by an edit whose subject was auth'],
  ['not even their titles are sent',
    'the fence, in the words it has always used. #31/#32 own what the fence ' +
    'promises; this gate only holds that a rewrite of the auth prose did ' +
    'not take a fence sentence out with it'],
  // 26.996-11 / #131 — animals-only branch (faces bar). REQUIRED while the
  // guess ships for animals; if the branch flips to faces AND animals, this
  // row MOVES to REBUILT_RETIRED and the people-shaped wording becomes
  // required in its place.
  ['When it guesses which animal photographs go together, it will sometimes ' +
    'set aside pictures of a different animal. You will not be told when ' +
    'that happens.',
    'the over-reach disclosure (#124 r3 / #131). Required only while the ' +
    'guess ships for animals; a faces-and-animals flip retires this wording']
];

const REBUILT_RETIRED = [
  [/sign(?:ed)?\s+in\s+to\s+claude\s+code/,
    'the room no longer asks anyone to sign in to Claude Code — the ' +
    'librarian does not run through it (F-02). A stranger sent to install ' +
    'and sign in to a tool the product stopped using is being told to fix ' +
    'a room that already works'],
  [/never charges you money/,
    'the free-usage claim. #28 removed the subscription path, and a real ' +
    'paid key exists on the owner\'s machine — this sentence is now a false ' +
    'statement about her money (T-26.93-33). The same claim was deleted ' +
    'from the two prominent app surfaces in this wave'],
  [/included allowance|per-use bill/,
    'the same claim in its other two phrasings, from the retired ' +
    'subscription path. Pinned as shapes so it cannot return in a ' +
    'near-paraphrase, which is how the last one survived every gate'],
  [/install claude code|update claude code/,
    'the version-floor and install instructions. There is no floor to meet ' +
    'and nothing to install: the seam speaks HTTP to whichever of the three ' +
    'is answering'],
  // 26.996-11: people-shaped over-reach must not survive an animals-only
  // ship. Shape-based so a near-miss rewording cannot slip past.
  [/pictures of someone else|someone else's (?:picture|photo|photograph)s?|picture of someone else/,
    'animals-only ship (faces bar): people-shaped over-reach wording is ' +
    'false here. #124 ruling 5 is the branch; this pattern makes taking it ' +
    'visible']
];

// THE CHECKER, over TEXT — so the drill can hand it a mutated copy held in
// memory. Reads nothing from disk and writes nothing anywhere.
// `includeShapes` runs section 6's own overclaim array: it is applied live
// up there, so the live call here leaves it off and only the drill turns it
// on, proving those patterns still bite.
function rebuiltLibrarianViolations(rawDoc, includeShapes) {
  const d = norm(rawDoc);
  const out = [];
  REBUILT_REQUIRED.forEach(function (p) {
    if (d.indexOf(norm(p[0])) === -1) {
      out.push('[rebuilt] ' + DOC + ': missing disclosed fact "' + p[0] +
        '" — ' + p[1]);
    }
  });
  REBUILT_RETIRED.forEach(function (p) {
    if (p[0].test(d)) {
      out.push('[rebuilt] ' + DOC + ': "' + p[0].source + '" is still in ' +
        'the disclosure — ' + p[1]);
    }
  });
  if (includeShapes && DELTA_FORBIDDEN_SHAPES) {
    DELTA_FORBIDDEN_SHAPES.forEach(function (f) {
      if (f.re.test(d)) {
        out.push('[rebuilt] ' + DOC + ': overclaim shape ' + f.re.source +
          ' — ' + f.why);
      }
    });
  }
  return out;
}

rebuiltLibrarianViolations(docSrc, false).forEach(function (v) {
  violations.push(v);
});

// ---- THE MUTATION DRILL FOR SECTION 7 ---------------------------------------
//
// ⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE, and every pin above is NEW. Each
// is driven red on a planted violation, with unmutated controls counted in
// the same run. ⚠ EVERY MUTATION IS A STRING SUBSTITUTION IN MEMORY —
// nothing writes LIBRARIAN.md, app.js or anything else — and each one
// asserts it actually CHANGED the text first, because a substitution that
// matched nothing is a mutation that was never planted.

// ⚠ WHAT SECTION 7 DOES AND DOES NOT DO (26.996-08). It holds two literal
// lists and a mutation drill. It has NO generic staleness detector — a
// sentence that has gone false stays green unless someone wrote its pin.
// The roster-read invariant lives in test_live_render.cjs; any new pin
// lands in plan 11, in the same commit as the sentence it guards.

const REBUILT_MUTATIONS = [
  ['the one setup command is dropped',
    function () {
      // ⚠ Substituted on the SHORTER span deliberately. The document is
      // hard-wrapped and one of the three occurrences breaks the line right
      // after `python3`, so a substitution on the full command would leave
      // that one standing — and the normalised comparison would still find
      // it. A mutation that plants only some of a fact is a mutation the
      // pin is right not to catch, and it would have been scored as a
      // failure of the pin rather than of the drill.
      return docSrc.split('server.py --setup').join('the setup step');
    }],
  ['the relocated specific is removed — the provider goes unnamed',
    function () { return docSrc.replace(/anthropic/gi, 'the provider'); }],
  ['the cloud disclosure is quietly taken out with the vendor rename',
    function () {
      return docSrc.split('cross the internet to that company')
        .join('are read');
    }],
  ['the sign-in instruction comes back',
    function () {
      return docSrc + '\n\nsign in to Claude Code to wake the librarian.\n';
    }],
  ['the free-usage claim comes back',
    function () {
      return docSrc + '\n\nlibrarian use is included in your Claude plan — ' +
        'this never charges you money.\n';
    }],
  ['a claim that nothing is required comes back',
    function () { return docSrc + '\n\nnothing at all is required.\n'; }],
  // 26.996-11: plant the branch that did NOT ship (people-shaped). Required
  // animals sentence must go red. Asserted by SHA below, never by length.
  ['people-shaped over-reach replaces the animals sentence',
    function () {
      return docSrc.split(
        'When it guesses which animal photographs go together, it will ' +
        'sometimes set aside pictures of a different animal. You will not ' +
        'be told when that happens.'
      ).join(
        'When it guesses which photographs go together, it will sometimes ' +
        'set aside pictures of someone else. You will not be told when ' +
        'that happens.');
    }]
];

const REBUILT_DRILL_EXPECTED = 7;
const REBUILT_CONTROLS_EXPECTED = 2;
const REBUILT_CASES_EXPECTED = 15;

const crypto = require('crypto');
function rebuiltSha(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
const rebuiltDocSha = rebuiltSha(docSrc);

// Shape-based retired pattern: three near-miss people-shaped rewordings.
const PEOPLE_OVERREACH_NEAR_MISSES = [
  'it will sometimes set aside pictures of someone else',
  'sometimes sets aside someone else\'s photograph',
  'a picture of someone else may be put aside'
];
const peopleRetired = REBUILT_RETIRED[REBUILT_RETIRED.length - 1][0];
PEOPLE_OVERREACH_NEAR_MISSES.forEach(function (line) {
  if (!peopleRetired.test(line)) {
    violations.push('[pin] people-shaped near-miss not caught: "' + line +
      '" — the retired pattern must be shape-based, not one exact string');
  }
});

let rebuiltCaught = 0;
REBUILT_MUTATIONS.forEach(function (m) {
  const mutated = m[1]();
  // ⛔ Assert by SHA: a same-length mutant that matched nothing once read
  // as survived (#77). Equality of hashes is the planted-change proof.
  if (rebuiltSha(mutated) === rebuiltDocSha) {
    violations.push('[drill] the mutation "' + m[0] + '" changed nothing — ' +
      'SHA identical to the unmutated document, so nothing was planted and ' +
      'a catch would be meaningless');
    return;
  }
  const reds = rebuiltLibrarianViolations(mutated, true);
  if (reds.length > 0) {
    rebuiltCaught += 1;
    return;
  }
  violations.push('[drill] the mutation "' + m[0] + '" was NOT caught — the ' +
    'pin it targets does not hold, and a green run of this section would be ' +
    'evidence of nothing');
});

let rebuiltControls = 0;
for (let rc = 0; rc < REBUILT_CONTROLS_EXPECTED; rc++) {
  if (rebuiltLibrarianViolations(docSrc, true).length === 0) {
    rebuiltControls += 1;
  }
}

if (rebuiltCaught !== REBUILT_DRILL_EXPECTED) {
  violations.push('[drill] ' + rebuiltCaught + ' of ' +
    REBUILT_DRILL_EXPECTED + ' mutations caught — the count is asserted by ' +
    'value so a drill that stopped at its first catch cannot report a pass');
}
if (rebuiltControls !== REBUILT_CONTROLS_EXPECTED) {
  violations.push('[drill] ' + rebuiltControls + ' of ' +
    REBUILT_CONTROLS_EXPECTED + ' unmutated controls came back green — a ' +
    'drill whose control is red is measuring the document, not the pin ' +
    '(and the second control runs AFTER every mutation, so a mutation that ' +
    'leaked state shows up here)');
}
const rebuiltCases = REBUILT_REQUIRED.length + REBUILT_RETIRED.length;
if (rebuiltCases !== REBUILT_CASES_EXPECTED) {
  violations.push('[cases] section 7 executed ' + rebuiltCases + ' cases, ' +
    REBUILT_CASES_EXPECTED + ' expected — a pin was added or lost without ' +
    'moving the literal');
}

console.log('CASES ' + rebuiltCases);
console.log('DRILL ' + rebuiltCaught + '/' + REBUILT_MUTATIONS.length +
  ' mutations caught, ' + rebuiltControls + ' controls green');

// ---- 26.996-11: SAME SENTENCE AT EVERY SITE (byte-equality) --------------
(function () {
  const S1 =
    'Photographs are also read here for the words printed in them, any ' +
    'faces, and where they were taken.';
  const S4 =
    'When it guesses which animal photographs go together, it will ' +
    'sometimes set aside pictures of a different animal. You will not be ' +
    'told when that happens.';
  const TOKEN =
    'Photo-reading is built inside the Apple Vision, which means no ' +
    'tokens will be consumed';

  // Runtime words from server (source may wrap string literals).
  let serverRows;
  try {
    serverRows = JSON.parse(execSync(
      'python3 -c "import server, json; print(json.dumps(' +
      '[r[\\"words\\"] for r in server.ON_DEVICE_DISCLOSURE_ROWS]))"',
      { cwd: ROOT, encoding: 'utf8' }).trim());
  } catch (e) {
    violations.push('[26.996-11] could not read ON_DEVICE_DISCLOSURE_ROWS: ' +
      e.message);
    return;
  }
  if (!Array.isArray(serverRows) || serverRows.length !== 3) {
    violations.push('[26.996-11] expected 3 on-device rows; got ' +
      (serverRows && serverRows.length));
    return;
  }
  if (serverRows[0] !== TOKEN) {
    violations.push('[26.996-11] token-cost line drifted from its HEAD value');
  }
  if (serverRows[1] !== S1) {
    violations.push('[26.996-11] privacy-list S-1 not byte-equal to ledger');
  }
  if (serverRows[2] !== S4) {
    violations.push('[26.996-11] privacy-list S-4 not byte-equal to ledger');
  }
  if (docSrc.indexOf(S4) === -1) {
    violations.push('[26.996-11] LIBRARIAN.md missing over-reach sentence');
  }
  let n = 0;
  let i = docSrc.indexOf(S4);
  while (i !== -1) {
    n += 1;
    i = docSrc.indexOf(S4, i + S4.length);
  }
  if (n !== 1) {
    violations.push('[26.996-11] LIBRARIAN.md must carry exactly 1 over-reach ' +
      'promise; found ' + n);
  }
  const keptAt = appSrc.indexOf("escapeHtml('Kept private')");
  if (keptAt === -1) {
    violations.push('[26.996-11] Kept private card missing');
  } else {
    const slice = appSrc.slice(keptAt, keptAt + 1200);
    // Literals live in named constants; the card must reference both photo
    // lines (token + S-1) plus the over-reach constant — two photograph
    // disclosures, asserted as an integer, not one.
    const refs = [
      'PHOTO_READ_TOKEN_LINE',
      'PHOTO_READ_WHAT_LINE',
      'LIKENESS_OVERREACH_LINE'
    ].filter(function (name) {
      return slice.indexOf(name) !== -1;
    });
    if (refs.indexOf('PHOTO_READ_TOKEN_LINE') === -1 ||
        refs.indexOf('PHOTO_READ_WHAT_LINE') === -1) {
      violations.push('[26.996-11] setup Kept private must carry exactly 2 ' +
        'photograph lines via PHOTO_READ_*; found refs ' + refs.join(','));
    }
    if (refs.indexOf('LIKENESS_OVERREACH_LINE') === -1) {
      violations.push('[26.996-11] setup Kept private missing over-reach line');
    }
  }
  // Named constants must be byte-identical to the ledger sentences.
  if (appSrc.indexOf("PHOTO_READ_TOKEN_LINE =\n    '" + TOKEN + "'") === -1 &&
      appSrc.indexOf("PHOTO_READ_TOKEN_LINE =\n    '" + TOKEN + "';") === -1 &&
      appSrc.indexOf("'" + TOKEN + "'") === -1) {
    violations.push('[26.996-11] PHOTO_READ_TOKEN_LINE drifted');
  }
  if (appSrc.indexOf(S1) === -1) {
    violations.push('[26.996-11] PHOTO_READ_WHAT_LINE / S-1 missing in app.js');
  }
  if (appSrc.indexOf(S4) === -1) {
    violations.push('[26.996-11] LIKENESS_OVERREACH_LINE / S-4 missing in app.js');
  }
})();

if (violations.length) {
  console.error('test_disclosure_truth FAILED (' + violations.length +
    ' violation' + (violations.length === 1 ? '' : 's') + ')');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}
console.log('test_disclosure_truth OK (LIBRARIAN.md discloses the D-03 ' +
  'consented metadata-only exception + the comments append; the old ' +
  'absolute "nothing already in your vault" line is reconciled; the ' +
  'retired body-derived-title hedge is gone and the stronger promise it ' +
  'blocked — a filled title is the filename or a stable numbered ' +
  'placeholder, and nothing from your writing is copied into the block — ' +
  'is stated and has a source; the shared promises match the shipped ' +
  'CLEAN_* copy word for word; the config-ask refusal family names one ' +
  'door and no vendor in-scene, with the checkable specifics kept here; ' +
  'and the display tier is disclosed in a section of its own — seventeen ' +
  'clauses, all seventeen inside that section, sitting immediately before the ' +
  'write tier, saying that every word on the screen is hers, that every ' +
  'word survives in the order it was saved, that a wall of running prose ' +
  'may have its sentences put on separate lines at its own writer\'s full ' +
  'stops and nowhere else, that picture captions join the hands-off list, ' +
  'that a note the room cannot place is treated as hers, that nothing is ' +
  'written to the file, and that one tap shows the note as saved — with the ' +
  'retired "words" phrasing forbidden on the normalised path)');
process.exit(0);
