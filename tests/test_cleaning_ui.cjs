/*
 * tests/test_cleaning_ui.cjs — the tidy-up surface's static wiring pins
 * (Phase 26.85, plan 05; D-04 / D-05 / D-09.1 / D-06 / D-10).
 *
 * There is no browser harness in this repo, so the loveability surface is
 * pinned the way every other client surface is: by reading app.js and
 * index.html as TEXT and asserting the wiring, the order, and the
 * load-bearing consent copy. The mirror of test_diegetic_wiring.cjs /
 * test_refinements_grep.cjs — zero deps, path-independent, one OK line and
 * exit 0 on success, every violation listed and exit 1 on failure.
 *
 * ⚠ REWRITTEN 2026-08-14 (26.95-05). Sections 1-7 previously pinned a
 * DIFFERENT FEATURE — two doorways, two switches, a per-note tick screen, a
 * model run and a batch summary of proposed filing labels. The owner retired
 * every one of those surfaces across #86 / #87 / #89 / #90 / #91, so the
 * pins are INVERTED rather than deleted: several now assert that a thing is
 * ABSENT. A retirement with a live call site is how a decision half-lands,
 * and this file is where that gets caught.
 *
 * What is pinned, and why each pin is load-bearing:
 *
 *   1. ONE DOORWAY, IN MANAGE (#91). The pane exists and is rendered from
 *      both manage paths — and offerCleaningAfterImport does NOT exist and
 *      is NOT called. The tidy-up edits inside somebody's own writing, so it
 *      is gone to rather than caught on the way out of an import.
 *
 *   2. ONE SWITCH (#86 ruling 5). The write-permission switch is collapsed:
 *      a tidy-up that may not write does nothing, because writing is all it
 *      does, and an off-position meaning "do nothing" is the config-stress
 *      trap.
 *
 *   3. A SCOPE IS A PLACE (#86 ruling 2, amending #52). The picker offers
 *      folders, never files, and carries no checkbox at all. Nothing in the
 *      whole flow reaches a model (#89).
 *
 *   4. THE PREVIEW IS THE CONSENT. Three notes, the WORST three, before and
 *      after — and the layout rule has exactly ONE home: the client reaches
 *      it by name through StudyCore.sentenceBreaksOnly and never by passing
 *      a third argument to structureBody.
 *
 *   5. ONE BATCH, ONE TAP BACK, REFUSALS SAID OUT LOUD. A run split across
 *      pages stays ONE undo target, and product law 9's "every note the room
 *      declines to touch is counted and said out loud" is a pin, not a hope.
 *
 *   6. THE COPY IS TRUE AND ITS DEBT IS DECLARED. Retired sentences must be
 *      gone from the file, the two claims #88 falsified must never return,
 *      and CLEAN_COPY_OWED must list what the owner's copy pass (#77) still
 *      owns. The guilt-copy gate reads the copy constants' VALUES, so every
 *      string is checked rather than only the first match in the file.
 *
 *   7. NO SELF-REPEATING READER. There is no model run left to poll, so the
 *      pin is that no timer comes back (law 1).
 *
 *   8. THE VOICE-MODEL PICKER — unchanged, and documented at its own header.
 *
 * Fix the SOURCE, never this gate.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = 'app.js';
const HTML = 'index.html';
const appSrc = fs.readFileSync(path.join(ROOT, APP), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, HTML), 'utf8');

const violations = [];

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function firstHitIn(src, re) {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) { return (i + 1) + ': ' + lines[i].trim(); }
  }
  return null;
}

// Lift one function body by brace matching (the test_candle_repull idiom —
// app.js keeps a flat layout inside its IIFE).
function functionBody(name, tag) {
  const at = appSrc.indexOf('function ' + name + '(');
  if (at === -1) {
    violations.push('[' + tag + '] ' + APP + ': function ' + name +
      ' is missing — renamed or removed');
    return null;
  }
  const open = appSrc.indexOf('{', at);
  if (open === -1) {
    violations.push('[' + tag + '] ' + APP + ': function ' + name +
      ' has no body');
    return null;
  }
  let depth = 0;
  for (let i = open; i < appSrc.length; i++) {
    const ch = appSrc[i];
    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { text: appSrc.slice(open, i + 1), line: lineOf(appSrc, at) };
      }
    }
  }
  violations.push('[' + tag + '] ' + APP + ': function ' + name +
    ' body is unterminated');
  return null;
}

function mustContain(body, needle, tag, why) {
  if (!body) { return; }
  if (body.text.indexOf(needle) === -1) {
    violations.push('[' + tag + '] ' + APP + ':' + body.line + ' ' + why +
      " — expected '" + needle + "'");
  }
}

function mustNotContain(body, needle, tag, why) {
  if (!body) { return; }
  if (body.text.indexOf(needle) !== -1) {
    violations.push('[' + tag + '] ' + APP + ':' + body.line + ' ' + why +
      " — forbidden '" + needle + "'");
  }
}

// ---- 1. ONE DOORWAY, IN MANAGE, AND IT IS GONE TO (#91) -------------------
//
// ⚠ THIS SECTION USED TO PIN THE OPPOSITE. It required TWO doorways and
// failed if the post-import offer was missing. The owner deleted that offer
// at #91: it existed for "the moment the pile is messiest", which is an
// argument about FILING a pile, and filing was retired at #87. A wall of
// text is hard to read whenever it was written. The stronger reason is that
// this pass now edits INSIDE somebody's own writing (#88), which deserves
// being gone to rather than caught on the way out of an import.
//
// So the pin is inverted: the offer must NOT exist, and the import report
// must not call it. A deleted surface with a live call site is how a
// retirement half-lands.

(function () {
  // (a) the Manage pane joins MANAGE_PANES with its label and its container.
  if (!/\{\s*key:\s*'cleaning',\s*label:\s*'tidy your vault'/.test(appSrc)) {
    violations.push('[doorways] ' + APP + ": the MANAGE_PANES entry " +
      "{ key: 'cleaning', label: 'tidy your vault' } is missing — the " +
      'one doorway');
  }
  if (appSrc.indexOf("els: ['manage-sec-cleaning']") === -1) {
    violations.push('[doorways] ' + APP + ": the 'cleaning' pane must name " +
      "its container ['manage-sec-cleaning']");
  }
  if (htmlSrc.indexOf('id="manage-sec-cleaning"') === -1) {
    violations.push('[doorways] ' + HTML +
      ': the #manage-sec-cleaning pane shell is missing');
  }
  // The pane carries NO count on the rail (law 3 — a backlog number is an
  // absence signal, and Manage's own "(N)" format is for content sections).
  if (!/key === 'cleaning'/.test(appSrc)) {
    violations.push('[doorways] ' + APP + ": manageRailCount must return " +
      "null for 'cleaning' — no count on the rail (law 3)");
  }

  // (b) the pane renderer is called from BOTH manage render paths.
  ['renderManageHome', 'showManagePane'].forEach(function (name) {
    const body = functionBody(name, 'doorways');
    mustContain(body, 'renderCleaningSection()', 'doorways',
      name + ' must render the tidy-up pane');
  });

  // (c) THE POST-IMPORT DOORWAY IS GONE — function and call site both.
  if (appSrc.indexOf('function offerCleaningAfterImport(') !== -1) {
    violations.push('[doorways] ' + APP +
      ': offerCleaningAfterImport is still defined — #91 DELETED the ' +
      'post-import offer; the tidy-up is gone to, in Manage');
  }
  const report = functionBody('renderImportReport', 'doorways');
  mustNotContain(report, 'offerCleaningAfterImport(', 'doorways',
    'the import report must not offer the tidy-up (#91)');
  mustNotContain(report, 'tidy your vault first?', 'doorways',
    'the "tidy your vault FIRST?" framing died with the offer');

  // (d) and the "what just arrived" scope went with it — it is only
  //     meaningful in the seconds after an import, and there is no surface
  //     there any more.
  if (appSrc.indexOf('latestImportOnly') !== -1) {
    violations.push('[doorways] ' + APP + ': latestImportOnly is still ' +
      'present — the "what just arrived" scope goes with the doorway (#91)');
  }
})();

// ---- 2. ONE SWITCH, NOT TWO (#86 ruling 5) --------------------------------
//
// ⚠ ALSO INVERTED. This section used to require BOTH cleaning_enabled and
// cleaning_writeback_enabled. The second switch meant "may the tidy-up write
// to my files" — and once the labelling pass was retired (#87), writing is
// ALL the tidy-up does, so its off-position means "do nothing". A switch
// whose off-position is "do nothing" is the config-stress trap the standing
// motto names, and ruling 2's before-and-after already gives
// preview-before-writing on every single run.

(function () {
  const pane = functionBody('renderCleaningSettings', 'consent');
  mustContain(pane, 'cleaning-toggle', 'consent',
    'the pane must render the one feature switch');
  mustNotContain(pane, 'cleaning-writeback-toggle', 'consent',
    'THE SECOND SWITCH IS COLLAPSED (#86 ruling 5) — a tidy-up that may ' +
    'not write does nothing, because writing is all it does');
  if (appSrc.indexOf('function handleCleaningWritebackToggle(') !== -1) {
    violations.push('[consent] ' + APP +
      ': handleCleaningWritebackToggle is still defined — the second ' +
      'switch was collapsed, not hidden');
  }
  if (appSrc.indexOf('CLEAN_WRITEBACK') !== -1) {
    violations.push('[consent] ' + APP + ': the CLEAN_WRITEBACK_* copy is ' +
      'still present — a sentence left in the file is a sentence that can ' +
      'be rendered again by accident');
  }
  // the one switch still writes through the shipped whitelist and re-reads
  // the server's own answer rather than trusting an optimistic flip.
  const toggle = functionBody('handleCleaningToggle', 'consent');
  mustContain(toggle, "apiPost('/api/meta'", 'consent',
    'the switch writes through the /api/meta whitelist');
  mustContain(toggle, 'cleaning_enabled', 'consent',
    'and writes exactly that flag');
  mustContain(toggle, 'renderCleaningSection()', 'consent',
    'on success the pane RE-READS the server rather than flipping itself');
})();

// ---- 3. A SCOPE IS A PLACE, NEVER A LIST OF FILES (#86 ruling 2) ----------
//
// ⚠ THE THIRD INVERSION, and the load-bearing one. This section used to pin
// the per-note tick screen — the ticks that are ON became chosen_ids. #86
// replaced that mechanism outright, AMENDING #52: she picks a place, sees
// the three worst notes in it before and after, and approves the run. The
// safety argument is preserved whole; what she looks at is THE CHANGE, not
// a list of names she has no way to judge. That is how she judged it herself
// at #90 — three of her own journal entries, before and after.

(function () {
  const pick = functionBody('renderCleaningScopePick', 'scope');
  mustContain(pick, 'cleaning-scope', 'scope',
    'the scope step offers PLACES as tappable rows');
  mustNotContain(pick, 'type="checkbox"', 'scope',
    'THE PER-NOTE TICK IS GONE (#86 ruling 2, amending #52) — a picker ' +
    'that still offered one would let the retired mechanism back in');
  mustNotContain(pick, 'cleaning-scope-tick', 'scope',
    'and its control class with it');

  // the targets route is read-only and is the only thing the look step calls
  const look = functionBody('cleaningLookPage', 'scope');
  mustContain(look, "apiPost('/api/librarian/clean/targets'", 'scope',
    'the look step reads the notes in scope');
  mustNotContain(look, "apiPost('/api/librarian/clean/write'", 'scope',
    'looking must never write — the write happens only after she approves');

  // ⚠ NOTHING IS SENT TO ANY MODEL BY THIS PASS (#89). The whole feature is
  // mechanical, so there is no scan, no excerpt, no consent-to-send card.
  ['renderCleaningScopePick', 'cleaningLookPage', 'renderCleaningPreview',
    'startCleaningWrite'].forEach(function (name) {
    const body = functionBody(name, 'scope');
    mustNotContain(body, "apiPost('/api/librarian/clean/scan'", 'scope',
      name + ' must not start a model run — this pass sends nothing (#89)');
  });
})();

// ---- 4. THE PREVIEW IS THE CONSENT (#86 ruling 2) -------------------------

(function () {
  const preview = functionBody('renderCleaningPreview', 'preview');
  mustContain(preview, 'CLEAN_PREVIEW_N', 'preview',
    'the preview shows a fixed few — three, because one example is a ' +
    'sample of size one');
  // ⚠ RE-POINTED 2026-08-17, NOT WEAKENED. The before/after pair and the
  // worst-first sort moved out of this function into `cleaningPane` and
  // `cleaningPreviewPick` when the date repair joined the run (#88's ruling):
  // a note's change can now be above the body as well as in it, so what the
  // panes render had to become a decision rather than a field read. The gate
  // follows the behaviour to where it lives instead of pinning the old
  // spelling — every guarantee below is the same one, asserted at its
  // new address.
  mustContain(preview, 'cleaningPane(row, false)', 'preview',
    'BEFORE is shown');
  mustContain(preview, 'cleaningPane(row, true)', 'preview',
    'and AFTER beside it — the change is what she judges');
  const pane = functionBody('cleaningPane', 'preview');
  mustContain(pane, 'row.before', 'preview',
    'and the before pane really renders the note as it is now');
  mustContain(pane, 'row.after', 'preview',
    'and the after pane the note as it would be');
  mustContain(pane, 'row.dates', 'preview',
    'INCLUDING THE TOP OF THE NOTE when the run would change it — a date ' +
    'rewritten above the body is invisible in the body panes, and product ' +
    'law 9 says every change is shown before it lands');
  const pick = functionBody('cleaningPreviewPick', 'preview');
  mustContain(pick, 'b.worst - a.worst', 'preview',
    'THE WORST, not a random few: if the change looks wrong on the worst ' +
    'cases it is wrong');
  mustContain(pick, '.dates', 'preview',
    'AND AT LEAST ONE NOTE OF EACH KIND: three examples of line breaks ' +
    'discharge nothing for a date being rewritten, so a run that moves any ' +
    'date must show her one');
  mustContain(preview, 'cleaningPreviewPick(', 'preview',
    'and the preview picks through it rather than sorting inline again');
  mustContain(preview, 'cleaning-go', 'preview',
    'and one control that approves the whole run');
  // the approve control must not itself be the write — it hands off, so the
  // write path stays one function with one batch stamp.
  mustContain(preview, 'startCleaningWrite(', 'preview',
    'approving hands off to the one write path');

  // THE LAYOUT RULE HAS ONE HOME. The room must never carry its own copy:
  // the preview she approves and the bytes that reach her file are produced
  // by the same function.
  const laid = functionBody('cleaningLaidOut', 'preview');
  mustContain(laid, 'StudyCore.sentenceBreaksOnly', 'preview',
    'the client lays a body out through the ONE shipped rule, by name');
  if (/StudyCore\.structureBody\([^)]*,[^)]*,/.test(appSrc)) {
    violations.push('[preview] ' + APP + ': app.js must never pass a third ' +
      'argument to structureBody — the write mode is reached by NAME ' +
      '(sentenceBreaksOnly), which is what keeps the S23 fence meaningful');
  }
})();

// ---- 5. ONE BATCH, ONE TAP BACK, AND THE REFUSALS SAID OUT LOUD ----------

(function () {
  const write = functionBody('startCleaningWrite', 'write');
  mustContain(write, "apiPost('/api/librarian/clean/write'", 'write',
    'the write path posts to the write route');
  mustContain(write, 'payload.batch = totals.batch', 'write',
    'ONE batch stamp for the whole run, so one tap puts all of it back — ' +
    'a run split across pages must not become several undo targets');

  // ⚠ 26.95-15, FOUND ON THE OWNER'S REAL VAULT: the write was chunked by
  // COUNT (60 notes) against a server that refuses a body over 1 MB. Sixty
  // of her notes are several megabytes, so the FIRST chunk came back 413 and
  // the whole run wrote NOTHING — the feature was unusable on the only vault
  // that matters. The arithmetic now lives in core.js where a suite can ask
  // it questions (test_core.cjs); these two pins keep the CALL here.
  mustContain(write, 'StudyCore.cleaningWriteChunk(', 'write',
    'the write is bounded in the unit the server\'s limit is spent in — ' +
    'BYTES — through the one exported chunker, never re-spelled here');
  mustNotContain(write, 'queue.splice(0, CLEAN_PAGE)', 'write',
    '⚠ the count-only splice is the defect itself: a batch sized in ITEMS ' +
    'against a limit spent in BYTES (the librarian\'s #63/#83 defect a ' +
    'third time). It must not come back');
  mustContain(write, 'totals.refused += 1', 'write',
    '⚠ a note too large to send alone is SKIPPED AND COUNTED, never sent: ' +
    'sending it would 413 and take every note behind it down with it, and ' +
    'product law 9 says what the room declines to touch is said out loud');

  const done = functionBody('renderCleaningWritten', 'write');
  mustContain(done, 'totals.refused', 'write',
    '⚠ PRODUCT LAW 9: every note the room declines to touch is COUNTED ' +
    'AND SAID OUT LOUD. The pre-sort reporting success while abandoning 18 ' +
    'of 60 notes is the defect this line exists not to repeat');
  mustContain(done, 'CLEAN_RUN.unreadable', 'write',
    'and a note it could not read at all is said out loud too');
  mustContain(done, 'cleaning-undo', 'write',
    'undo is offered whenever anything was written');

  // ⚠ 26.95-22: ONE TAP BACK OUTLIVES ITS PAGE. The batch id was client
  // state, so a reload lost it and no surface offered another way in — while
  // the room kept a verbatim copy of every note it had changed for a button
  // that had already expired. These pins keep the list, and keep it from
  // becoming a list of her NOTES.
  const runs = functionBody('renderCleaningRuns', 'write');
  mustContain(runs, "apiPost('/api/librarian/clean/runs'", 'write',
    'the runs list asks the server, which sends counts and no paths');
  mustNotContain(runs, 'origin_path', 'write',
    '⚠ a list of what the room changed is a list of HER notes, and this ' +
    'surface has no fence in front of it — counts only');
  mustContain(runs, 'r.notes > 0', 'write',
    'a run with nothing left in it offers no button to press');
  ['days ago', 'weeks ago', 'last tidied', 'since you'].forEach(function (p) {
    mustNotContain(runs, p, 'write',
      'law 3: the list carries a plain date, never a gap (' + p + ')');
  });

  // ⚠ ONE UNDO CALL, NOT TWO. A run taken back days later from the list and
  // one taken back the moment it finished must behave identically, and two
  // spellings of one request is how they stop doing that.
  const undoNow = functionBody('undoCleaning', 'write');
  mustContain(undoNow, 'undoCleaningBatch(', 'write',
    'the just-ran button DELEGATES to the shared call');
  mustNotContain(undoNow, "apiPost('/api/librarian/clean/undo'", 'write',
    'and does not spell the request a second time');

  // ⚠ UNDO IS LOAD-BEARING NOW, not a courtesy: approving ~900 notes off
  // three examples is only reasonable if being wrong is cheap.
  // ⚠ THESE THREE MOVED FUNCTION IN 26.95-22, and the claims did not change.
  // `undoCleaning` is now the just-ran BUTTON and delegates; the request
  // itself lives in `undoCleaningBatch`, shared with the runs list so a run
  // taken back days later behaves identically. Following the call is the
  // point of the pin — asserting on the wrapper would have gone green while
  // the shared call quietly lost the route.
  const undo = functionBody('undoCleaningBatch', 'write');
  mustContain(undo, "apiPost('/api/librarian/clean/undo'", 'write',
    'one tap back posts the undo route');
  mustContain(undo, 'CLEAN_UNDO_NONE_COPY', 'write',
    'a SECOND tap is not a failure — restored:0 reads as a plain sentence');
  const undoBtn = functionBody('undoCleaning', 'write');
  mustContain(undoBtn, 'CLEAN.batch', 'write',
    'and the just-ran button hands back the batch the run returned');
})();

// ---- 6. THE COPY IS TRUE, AND ITS DEBT IS DECLARED -----------------------

(function () {
  // ⚠ WHAT IS PINNED HERE IS TRUTH, NOT WORDING. Front-facing wording is the
  // owner's, as ONE pass (#77). These strings were written by an agent so
  // the screen works and can be judged; CLEAN_COPY_OWED is the handover
  // list. What this section gates is that no sentence claims something the
  // code does not do.
  if (appSrc.indexOf('var CLEAN_COPY_OWED') === -1) {
    violations.push('[copy] ' + APP + ': CLEAN_COPY_OWED must exist — the ' +
      'copy pass (#77) needs the list of strings an agent wrote for a ' +
      'screen she has not read yet, and an undeclared placeholder reads as ' +
      'a settled decision');
  }

  // The retired claims must be GONE, not merely unrendered.
  [
    'a short excerpt of the notes you ticked goes to Claude',
    'these are the notes in scope. Untick anything you would rather leave alone.',
    'adds filing labels, never touches your words.',
    'tidy your vault first?'
  ].forEach(function (dead) {
    if (appSrc.indexOf(dead) !== -1) {
      violations.push('[copy] ' + APP + ': the retired sentence "' + dead +
        '" is still in the file — it describes a surface that no longer ' +
        'exists');
    }
  });

  // ⚠ AND THE ONE CLAIM THAT MUST NOT REAPPEAR. The tidy-up now DOES change
  // the file below the --- block, so any sentence promising otherwise is
  // false. This is the promise #88 knowingly retired.
  [
    'everything below it stays exactly as you wrote it',
    'never touches your words'
  ].forEach(function (dead) {
    if (appSrc.indexOf(dead) !== -1) {
      violations.push('[copy] ' + APP + ': "' + dead + '" is FALSE now ' +
        '(#88) — the readability pass writes inside the body. What stays ' +
        'true is that no WORD changes, which is a different sentence');
    }
  });

  // Guilt copy stays banned (law 3) — ⚠ AND THIS CHECK WAS STRENGTHENED
  // WHILE REWRITING THIS SUITE. It used to call firstHitIn over the whole
  // file, which inspects only the FIRST line matching anywhere in 20,000
  // lines and then asks whether that line mentions cleaning: a second,
  // genuinely guilt-tripping sentence further down was invisible to it, and
  // an ordinary comment could shadow a real one. It now reads the VALUES of
  // the tidy-up's own copy constants — the strings a person actually sees —
  // so every one is checked and a comment can never trip it or hide behind.
  const CLEAN_COPY_RE = /var (CLEAN_[A-Z0-9_]+) = '((?:[^'\\]|\\.)*)';/g;
  let m;
  while ((m = CLEAN_COPY_RE.exec(appSrc)) !== null) {
    const name = m[1];
    const value = m[2];
    [/\bbacklog\b/i, /you haven'?t/i, /still need to/i, /\bshould have\b/i,
      /\bfinally\b/i].forEach(function (re) {
      if (re.test(value)) {
        violations.push('[copy] ' + APP + ': ' + name + ' reads "' + value +
          '" — guilt copy on a tidy-up surface (law 3: reward presence, ' +
          'never punish absence)');
      }
    });
  }
})();

// ---- 7. NO SELF-REPEATING READER ----------------------------------------
//
// ⚠ The progress poller is GONE with the model run: this pass is
// synchronous, page by page, so there is nothing to poll. Product law 1's
// ban on self-repeating timers is therefore satisfied by there being no
// timer at all — pinned here so a future edit cannot quietly add one back.

(function () {
  ['cleaningLookPage', 'startCleaningWrite'].forEach(function (name) {
    const body = functionBody(name, 'poll');
    mustNotContain(body, 'setInterval(', 'poll',
      name + ' must never carry a repeating timer (law 1)');
  });
})();

// ---- 8. THE VOICE-MODEL PICKER (26.87-09, S4; D-17 / D-18 / D-19) --------
//
// The same Manage-switch grammar as section 2, applied to the one control in
// this pane that is not a boolean. What is load-bearing here:
//
//   (a) COPY. Seven strings pinned byte-exactly, including the two override
//       lines. Neither override line may name an environment variable or
//       echo a rejected value — that string is an env value rather than her
//       words, and showing it sends her to debug a shell instead of
//       orienting her in the room.
//   (b) NO COLOUR MARKS THE ACTIVE STATE. Coral is reserved and means
//       exactly one thing in this app, so "you are here" is marked by weight
//       of affordance: the current alias renders plain and unwired, the
//       other two render as quiet underlined buttons.
//   (c) THE CURRENT ALIAS IS NOT A TAPPABLE CONTROL. The no-op is
//       STRUCTURAL — only .librarian-voice-pick is wired — rather than an
//       early return some future edit could delete.
//   (d) ONE WRITE, THROUGH THE SHIPPED ROUTE. The pick POSTs voice_model to
//       /api/meta (whose fail-closed validator owns the value) and re-reads
//       the server's answer; it never flips optimistically.
//   (e) ABSENT, NOT DISABLED, when the librarian is off.
//   (f) NEVER a select element, never a dropdown, never a pinned model id.
//
// Fix the SOURCE, never this gate.

(function () {
  // (a) the pinned copy — audit rows 25-30 and 37.
  const PINNED = [
    'which model writes your reflections and desk notes',
    'opus reads most closely and takes longest; haiku is quickest.',
    ' is writing them.',
    "couldn't save. try again.",
    'a setting in your shell is using ',
    ' right now instead.',
    "something in your shell asked for a model i don't have; using ",
    ' instead.',
    ' is the model in use right now.'
  ];
  PINNED.forEach(function (copy) {
    if (appSrc.indexOf(copy) === -1) {
      violations.push('[voice-copy] ' + APP + ": pinned picker copy " +
        "missing: '" + copy + "'");
    }
  });

  // each wording lives in ONE named constant, so a later surface quotes a
  // symbol rather than re-typing a promise.
  ['VOICE_LABEL_COPY', 'VOICE_ORIENTING_COPY', 'VOICE_STATE_TAIL',
    'VOICE_FAIL_COPY', 'VOICE_ENV_HEAD', 'VOICE_ENV_TAIL',
    'VOICE_ENV_BAD_HEAD', 'VOICE_ENV_BAD_TAIL', 'VOICE_STATUS_TAIL']
    .forEach(function (name) {
      if (!new RegExp('var\\s+' + name + '\\s*=').test(appSrc)) {
        violations.push('[voice-copy] ' + APP + ': the ' + name +
          ' constant must be declared — one wording, one place');
      }
    });

  // the override lines never name a shell variable and never carry a slot
  // for the rejected value.
  const overrideDecls = appSrc.split('\n').filter(function (l) {
    return /var\s+VOICE_ENV(_BAD)?_(HEAD|TAIL)\s*=/.test(l);
  });
  if (overrideDecls.length !== 4) {
    violations.push('[voice-copy] ' + APP + ': expected the four override ' +
      'line halves each on its own source line (found ' +
      overrideDecls.length + ') — a byte pin cannot hold otherwise');
  }
  overrideDecls.forEach(function (l) {
    if (/LIBRARIAN_[A-Z_]*MODEL|ANTHROPIC_|env\s+var/i.test(l)) {
      violations.push('[voice-copy] ' + APP + ': an override line names an ' +
        'environment variable — she is being sent to debug a shell: ' +
        l.trim());
    }
  });

  // (b)+(c)+(f) the markup itself.
  const markup = functionBody('librarianVoiceMarkup', 'voice');
  ['librarian-voice-picker', 'librarian-voice-note',
    'librarian-voice-current', 'librarian-voice-pick',
    'role="group"', 'aria-label=', 'aria-pressed=',
    'voiceCurrentStyle()', "pileQuietStyle('ink-soft')",
    'VOICE_LABEL_COPY', 'VOICE_ORIENTING_COPY', 'VOICE_STATE_TAIL']
    .forEach(function (needle) {
      mustContain(markup, needle, 'voice',
        'the picker must render its labelled group, its three aliases and ' +
        'its own failure slot');
    });
  ['<select', 'var(--accent)', 'claude-', '-2025', 'fable']
    .forEach(function (needle) {
      mustNotContain(markup, needle, 'voice',
        'no dropdown, no coral active-state, no pinned model id and no ' +
        'fourth alias — the allow-list narrowing is deliberate (D-31.5)');
    });

  const plain = functionBody('voiceCurrentStyle', 'voice');
  mustContain(plain, 'cursor:default', 'voice',
    'the current alias is where she already is, not a door — default ' +
    'cursor, and the click is never wired');
  mustContain(plain, 'text-decoration:none', 'voice',
    'the current alias is plain text: state is marked by weight of ' +
    'affordance, never by colour (coral is reserved)');
  mustNotContain(plain, 'var(--accent)', 'voice',
    'coral means exactly one thing in this app and a picker is not it');

  // the whole client still contains no select element anywhere (measured
  // baseline at bfee40a: ZERO), so this is an absence assertion.
  if (appSrc.indexOf('<select') !== -1) {
    violations.push('[voice] ' + APP + ': a select element appeared — the ' +
      'picker is three buttons, never a dropdown');
  }

  // (c) ONLY the non-current aliases are wired — the no-op is structural.
  const render = functionBody('renderLibrarianSettings', 'voice');
  mustContain(render, '.librarian-voice-pick', 'voice',
    'the click wiring must select ONLY the non-current aliases, so the ' +
    'current one is a no-op by construction');
  mustNotContain(render, '.librarian-voice-current', 'voice',
    'the current alias must not be wired at all — an early return inside ' +
    'a shared handler is a guard a later edit can delete');
  mustContain(render, 'handleVoiceModelPick(', 'voice',
    'the alias buttons must call the pick handler');

  // (e) absent when the librarian is off, and the status line likewise.
  mustContain(render, 'isOn ? librarianVoiceMarkup(librarian)', 'voice',
    'the picker is gated on the librarian being ON — a model picker with ' +
    'the librarian off is a dead control, and it must be ABSENT rather ' +
    'than disabled or greyed');
  mustContain(render, '!cliOk || !isOn || !voiceEffective', 'voice',
    'the third status line is gated too — with the librarian off nothing ' +
    'is in use, so an ungated line would be false');
  mustContain(render, 'voice_model_effective', 'voice',
    'the status line renders the EFFECTIVE alias from the server, never ' +
    'her stored pick — it must stay true under a shell override');

  // (d) one write, through the shipped route, re-read from the server.
  const pick = functionBody('handleVoiceModelPick', 'voice');
  mustContain(pick, "apiPost('/api/meta', { voice_model:", 'voice',
    'the pick must write voice_model through the existing /api/meta ' +
    'whitelist, whose fail-closed validator owns the value');
  mustContain(pick, 'refreshLibrarianSettings()', 'voice',
    "the picker must re-render from the server's answer — never an " +
    'optimistic local flip');
  mustContain(pick, 'VOICE_FAIL_COPY', 'voice',
    'a failed pick writes ONE quiet neutral line into the picker\'s own ' +
    'slot; nothing flips and the buttons are the retry');
  mustContain(pick, 'voicePickerBusy(', 'voice',
    'a pick in flight disables all three aliases');
  ['console.', 'alert(', 'toast'].forEach(function (needle) {
    mustNotContain(pick, needle, 'voice',
      'never a trace, never a toast — the quiet-failure register');
  });

  const busy = functionBody('voicePickerBusy', 'voice');
  mustContain(busy, "'0.45'", 'voice',
    'the loading state uses the SHIPPED disabled opacity (tokens.css ' +
    '.btn:disabled), never a new one');
  mustContain(busy, 'disabled', 'voice',
    'all three aliases disable together — no spinner, no label change');
  mustNotContain(busy, 'aria-pressed', 'voice',
    'the pressed state must NOT move optimistically — it moves when the ' +
    'server says it moved');

  // the override sentences are chosen server-token-first, never guessed.
  const override = functionBody('voiceOverrideLine', 'voice');
  mustContain(override, 'voice_model_source', 'voice',
    "the divergence line is chosen by the server's own source token");
  mustContain(override, 'voice_model_stored', 'voice',
    'the picker shows HER stored choice and states the shell\'s ' +
    'divergence beneath it — it must never silently contradict the shell');
})();

if (violations.length) {
  console.error('test_cleaning_ui FAILED (' + violations.length +
    ' violation' + (violations.length === 1 ? '' : 's') + ')');
  violations.forEach(function (v) { console.error('  ' + v); });
  process.exit(1);
}
console.log('test_cleaning_ui OK (ONE doorway, in Manage — the post-import ' +
  'offer is gone; ONE switch; a scope is a place and carries no tick; ' +
  'nothing reaches a model; the preview is the three WORST notes before ' +
  'and after; the layout rule has one home, reached by name; one batch and ' +
  'one tap back; refusals said out loud (law 9); the retired sentences are ' +
  'gone and the copy debt is declared; no timer came back; the ' +
  '26.87-09 voice picker: three aliases marked by affordance not colour, ' +
  'the current one unwired, one write through /api/meta, absent with the ' +
  'librarian off, both override lines pinned and neither echoing a shell)');
process.exit(0);
