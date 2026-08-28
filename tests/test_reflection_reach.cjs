#!/usr/bin/env node
'use strict';
/* test_reflection_reach — phase 26.998-04.
 *
 * ⛔⛔ WHAT THIS GATE IS FOR, AND WHAT IT CANNOT DO. Nobody may credit it with
 * more than it does:
 *
 *   - It pins HER SENTENCES BY VALUE against the planning record, byte for
 *     byte. A reword in `app.js` turns it RED, and so does a reword in the
 *     record — the two must agree, and if they ever disagree THE CODE IS
 *     WRONG, not the record.
 *   - It DRIVES the reach parser and the reach state machine over the real
 *     shipped functions, extracted from `app.js` and evaluated.
 *   - ⛔ IT DOES NOT MEASURE GEOMETRY OR READABILITY. It does not open a
 *     browser and it says NOTHING about whether these lines are visible at
 *     any viewport, or after she scrolls. That is a real hole and it is named
 *     here rather than left for a reader to assume otherwise.
 *   - It does not judge whether the words are the RIGHT words. They are hers.
 *
 * ⛔ NO WEIGHT, RATIO, THRESHOLD OR ORDERING VALUE IS ASSERTED ANYWHERE. The
 * spans below are lengths a CASE types, standing in for lengths SHE would
 * type. None of them is a default and none is shipped.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

// The planning record — the ONE source of her words.
const RECORD = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Project Tracker',
  'Project Tracker/Claude Project/Obsidian Visual House/.planning/phases',
  '26.998-what-weighs-in-a-reflection/26.998-COPY.md');

let failures = 0;
let checks = 0;
function ok(cond, what) {
  checks += 1;
  if (!cond) { failures += 1; console.error('  FAIL: ' + what); }
}

// ---- 1. her sentences, pinned BY VALUE against the record ----------------
//
// ⛔ THE LITERALS BELOW ARE THE PIN. They are deliberately written out here
// rather than lifted from `app.js`: a gate that lifts the sentence it is
// checking compares a string with itself and passes through any reword. That
// is this repo's own recorded defect class and this file refuses to repeat it.
const HER_LINES = {
  SESSION_REACH_ASK: 'shall i stay recent, or go further back?',
  SESSION_REACH_TYPE: 'tell me how far back to go.',
  SESSION_REACH_UNREADABLE:
    "i can't read that as a length — try months or years.",
  SESSION_REACH_SET_ASIDE:
    'some things here have no date i can trust — i left those out.',
  SESSION_REACH_RECENT_LABEL: 'stay recent',
  SESSION_REACH_BACK_LABEL: 'go further back',
  // T-7 — the button that SENDS. ⛔ A SEPARATE LABEL from T-5 on purpose.
  SESSION_REACH_SEND_LABEL: 'go',
};

console.log('1. her sentences are hers, in the code AND in the record');
const recordText = fs.existsSync(RECORD) ? fs.readFileSync(RECORD, 'utf8')
  : null;
ok(recordText !== null, 'the planning record is readable');
Object.keys(HER_LINES).forEach(function (name) {
  const want = HER_LINES[name];
  // in app.js, as that constant's value
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\n?\\s*'
    + '([\'"])((?:\\\\.|(?!\\1).)*)\\1\\s*;');
  const m = APP.match(re);
  ok(!!m, name + ' is declared in app.js');
  if (m) {
    const got = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    ok(got === want,
      name + ' in app.js is her sentence byte for byte'
      + (got === want ? '' : '\n      got:  ' + JSON.stringify(got)
        + '\n      want: ' + JSON.stringify(want)));
  }
  if (recordText !== null) {
    ok(recordText.indexOf(want) !== -1,
      name + "'s sentence appears in the planning record verbatim — if this "
      + 'is red the CODE is wrong, not the record');
  }
});

// ⚠ THE EM DASHES ARE HERS. A smoothed hyphen is a reword.
console.log('2. her em dashes survive');
ok(HER_LINES.SESSION_REACH_UNREADABLE.indexOf('—') !== -1
  && APP.indexOf("i can't read that as a length — try months or years.")
    !== -1,
  'the unreadable line keeps its EM DASH in app.js');
ok(APP.indexOf(
  'some things here have no date i can trust — i left those out.') !== -1,
  'the set-aside line keeps its EM DASH in app.js');

// ---- 3. ⛔ NO DEFAULT LENGTH ANYWHERE -----------------------------------
console.log('3. no length was chosen for her');
ok(/SESSION\.reach === null\) \{ return; \}/.test(APP),
  'the POST waits for her reach answer instead of sending without one');
ok(/if \(!resuming && SESSION\.reach > 0\) \{ body\.reach_ms/.test(APP),
  'a reach is sent ONLY when she asked to go further back');
ok(/reach_ms = data\.get\("reach_ms"\)/.test(SERVER),
  'the server reads her reach from the body rather than deriving one');
ok(/reach_set_aside = 0/.test(SERVER),
  'the server starts from "nothing set aside" rather than a guess');
ok(!/span_ms\s*=\s*[1-9]/.test(SERVER),
  '⛔ a literal span reached the server');

// ---- 4. the parser, DRIVEN over the shipped function ---------------------
console.log('4. her typed length, read by the shipped parser');
const fnSrc = APP.match(
  /function sessionParseReach\(text\) \{[\s\S]*?\n  \}/);
ok(!!fnSrc, 'sessionParseReach was found in app.js');
let parse = null;
if (fnSrc) {
  /* eslint-disable no-new-func */
  parse = new Function(fnSrc[0] + '; return sessionParseReach;')();
}
const MONTH = 30 * 24 * 60 * 60 * 1000;
if (parse) {
  ok(parse('3 months') === 3 * MONTH, '"3 months" reads as three months');
  ok(parse('1 year') === 12 * MONTH, '"1 year" reads as twelve months');
  ok(parse('a year') === 12 * MONTH, '"a year" reads as twelve months');
  ok(parse('6 mo') === 6 * MONTH, '"6 mo" reads as six months');
  ok(parse('  2 YEARS ') === 24 * MONTH, 'spacing and capitals do not matter');
  // ⛔ THE REFUSALS. Each of these must read as UNREADABLE, never as a
  // length the room picked. This is the half her T-6 sentence exists for.
  [['', 'an empty box'],
   ['soon', 'a word that is not a length'],
   ['3', 'a bare number with no unit'],
   ['0 months', 'a zero-length reach'],
   ['3 weeks', 'a unit her sentence does not name'],
   ['banana', 'nonsense'],
   ['-2 years', 'a negative reach']].forEach(function (pair) {
    ok(parse(pair[0]) === null,
      '⛔ ' + pair[1] + ' must be UNREADABLE, not a guessed length'
      + ' (got ' + JSON.stringify(parse(pair[0])) + ')');
  });
}

// ---- 5. her T-3 ruling: leave them out, AND TELL ME ---------------------
console.log('5. her ruling is carried out in both halves');
ok(/reach_set_aside = window\["set_aside_undated"\]/.test(SERVER),
  'the server counts what her reach set aside');
// ⚠ COUNT THE RESPONSE ENDINGS ONLY. The worker is HANDED the same value by
// name, which is a third literal match and nothing to do with what she is
// told — so it is removed before counting rather than the expected number
// being quietly raised to swallow it.
// ⚠ RE-AIMED 26.998-08, NOT WEAKENED. The worker's kwargs used to be a
// single-key dict, so stripping it was a fixed string. It now carries the
// ranking's telling alongside, and the old strip stopped matching — which
// left the kwargs occurrence in the count and read as a THIRD ending. The
// property pinned here is unchanged: exactly TWO json_response endings carry
// the count. Driven red by removing one of them.
const bothEndings = (SERVER.replace(
  /kwargs=\{"reach_set_aside": reach_set_aside[\s\S]*?\},/g, '')
  .match(/"reach_set_aside": reach_set_aside/g) || []).length;
ok(bothEndings === 2,
  '⛔ the count rides BOTH endings — a reach that empties the pool must '
  + 'still say what it set aside, or the emptiness reads as "nothing '
  + 'happened" (found ' + bothEndings + ')');
// ⚠ RE-AIMED 26.998-10, NOT WEAKENED. Her T-4 line was a ternary inline in
// ONE painter — which is precisely how it became unreachable: the SPREAD, the
// view she reads a long reflection in, never painted it at all, and on the
// card it rendered 2,100px below a box that clips. It now lives in ONE builder
// that both surfaces call. ⛔ The property pinned is unchanged: painted only
// when something was actually set aside. ⭐ And it is no longer pinned by
// SOURCE SHAPE alone — tests/test_her_telling_reaches_her.cjs drives a real
// rendered page and asserts she can READ it, which is what this check could
// never see.
ok(/if \(SESSION\.reachSetAside > 0\)/.test(APP),
  'her sentence is painted only when something was actually set aside');

// ---- 6. ⛔ the reach may only ever NARROW -------------------------------
console.log('6. the reach cannot widen anything back in');
ok(/pool\[_key\] = \[r for r in _rows\s*\n\s*if str\(r\.get\("id"\)\) in keep\]/
  .test(SERVER),
  'the reach FILTERS rows the builder already produced, so every exclusion '
  + 'the fence made still stands');

// ---- 7. the two defects FOUND BY LOOKING AT THE SCREEN ------------------
//
// ⛔ BOTH OF THESE SHIPPED GREEN AND WERE CAUGHT ONLY BY DRIVING THE REAL
// PAGE. Every check above passed while they were live. They are pinned here
// so they cannot come back quietly — but note what that means: this file's
// own caveat about geometry was WRITTEN AND THEN NOT ACTED ON, and the cost
// was two defects reaching her screen.
console.log('7. the two defects found on the real screen');

// (a) her reach question is asked AFTER consent, never stacked under it —
//     stacked, it sat below the fold at her own window size.
ok(/function sessionReachShowing\(\) \{/.test(APP),
  'the reach block has its own showing condition');
ok(/SESSION\.consent !== null && SESSION\.reach === null/.test(APP),
  '⛔ the reach question is asked AFTER her consent answer — stacked under '
  + 'it, her own question sat BELOW THE FOLD and she had to scroll to find '
  + 'it');
ok(/sessionReachShowing\(\) \?/.test(APP),
  'the painter renders the reach block from that condition');
// ⚠ the two conditions must be MUTUALLY EXCLUSIVE, or the card grows again
ok(/sessionConsentCardShowing\(\)[\s\S]{0,80}SESSION\.consent === null/
  .test(APP)
  || /return SESSION\.consent === null/.test(APP),
  'the consent card shows only while consent is unanswered, so the two '
  + 'blocks can never be on screen together');

// (b) her typed words survive a refusal
ok(/reachText: ''/.test(APP),
  'what she typed is held in state, not only in the DOM');
ok(/value="' \+\s*\n?\s*escapeAttr\(SESSION\.reachText \|\| ''\)/.test(APP),
  '⛔ the box is re-rendered WITH her words in it — the first version wiped '
  + 'them, telling her to try months or years while deleting the thing she '
  + 'would have edited');
ok(/box\.addEventListener\('input'/.test(APP),
  'every keystroke is kept, so a repaint from anywhere cannot discard it');
ok(/SESSION\.reachText = box\.value;\s*\n\s*var reach = sessionParseReach/
  .test(APP),
  'her words are kept at the moment the answer is judged');

// (c) answering the reach releases the POST through the ONE gate
const posts = (APP.match(/sessionMaybePost\(\);/g) || []).length;
ok(posts >= 3,
  'answering the reach funnels through sessionMaybePost rather than '
  + 'POSTing on its own (found ' + posts + ' call sites)');

// ---- 8. ⛔ THE CLOCK MAY NOT GIVE UP WHILE SHE IS ANSWERING -------------
//
// ⛔⛔ THE THIRD DEFECT FOUND ON THE REAL SCREEN, AND THE WORST OF THEM. The
// reach question is a moment the room is asking HER and doing nothing itself
// — exactly like the consent card. It was NOT in the one predicate that
// knows what "waiting for her" means, so the 45-second give-up clock counted
// against her WHILE SHE TYPED THE ANSWER IT HAD JUST ASKED FOR. Driven live:
// the session gave up mid-sentence and she got the gave-up line instead of a
// reflection. Every check above was green while this was true.
//
// ⚠ Fixing it needed NO new ruling from her: her R-6 ruling already says the
// clock may not give up on a room that is waiting for her, and the sentence
// shown when it does run out is already hers.
console.log('8. the clock does not give up while she is answering');
ok(/\(sessionConsentCardShowing\(\) \|\| sessionReachShowing\(\)\)/.test(APP),
  '⛔ the reach question counts as the room WAITING FOR HER — without this '
  + 'the give-up clock runs while she is typing her own answer');
const waitFn = APP.match(
  /function sessionWaitingOnHerAnswer\(\) \{[\s\S]*?\n  \}/);
ok(!!waitFn && /sessionReachShowing/.test(waitFn[0]),
  'the waiting predicate itself names the reach moment');

// ---- 9. ⛔ THE DERIVATION IS ACTUALLY CALLED ----------------------------
//
// ⛔⛔ THE DEFECT CLASS THIS SECTION EXISTS FOR: BUILT, TESTED, AND NEVER
// CALLED. 26.998-03 built the true made-on date with its own suite; 26.998-04
// built the window that consumes it with its own suite. Both were green and
// NOTHING IN THE RUNNING ROOM CALLED THE FIRST — measured on the owner's real
// library, 0 of 16,211 items carried a true date, so every item looked
// undatable and a stretch set ALL of them aside and returned an empty
// reflection. A unit suite cannot see this: it hands the function its inputs
// directly. Only a check on the CALL SITE can.
console.log('9. the true dates are actually derived before the window runs');

const deriveCall = /study_lib\.derive_made_on\(/.exec(SERVER);
ok(!!deriveCall,
  '⛔ NOTHING CALLS derive_made_on — the window would see no dates and set '
  + 'every item aside, returning an empty reflection for any stretch');
const windowCall = SERVER.indexOf('study_lib.reflection_window(');
ok(deriveCall && deriveCall.index < windowCall,
  '⛔ the dates must be derived BEFORE the window reads them');
ok(/def _made_on_header_bytes\(/.test(SERVER),
  'the route has a reader to hand the derivation');
ok(/study_lib\._read_frontmatter_block\(path\)/.test(SERVER),
  'the reader returns the BYTES shape the derivation decodes — handing the '
  + 'other shape is how the header source reached 0 of 16,211');
ok(/_snapshot_path\(library_root, item\)/.test(SERVER),
  'the reader goes through the jailed snapshot path, never her origin file');
// ⛔ derived IN MEMORY: no save on this read path
const derivedBlock = SERVER.slice(deriveCall ? deriveCall.index - 1200 : 0,
  deriveCall ? deriveCall.index + 400 : 0);
ok(!/save_store\(/.test(derivedBlock),
  '⛔ the derivation must NOT persist — the stored stamps feed the boundary '
  + 'that decides what she has already been shown');

// ---- 10. ⛔ NO TWO CONTROLS SHARE A LABEL -------------------------------
//
// ⛔ THE DEFECT: the sending button reused T-5, so TWO buttons read
// `go further back` — one opening the typing box, one sending. Found by
// looking at the screen. Her T-5 label was chosen as an ANSWER TO A QUESTION;
// reusing it as a submit action is an agent putting her word where she did
// not put it. She was asked, and the second button is her T-7.
console.log('10. the two reach buttons do not share a label');
ok(/escapeHtml\(SESSION_REACH_SEND_LABEL\)/.test(APP),
  'the sending button renders its OWN label');
ok(HER_LINES.SESSION_REACH_SEND_LABEL
  !== HER_LINES.SESSION_REACH_BACK_LABEL,
  '⛔ the sending button and the choice button read the same words');
const backUses = (APP.match(/escapeHtml\(SESSION_REACH_BACK_LABEL\)/g)
  || []).length;
ok(backUses === 1,
  '⛔ her choice label is rendered in exactly ONE place — it appeared in '
  + backUses + ', which is how two buttons came to read the same thing');

// ---- 11. the newly-shown line is brought INTO VIEW ---------------------
//
// ⛔ THE DEFECT: the session spot scrolls INSIDE itself, so a line added at
// the bottom is CLIPPED rather than merely low. Measured on the real page at
// her own window: 438px of content in a 348px box, and her refusal sentence
// rendered at 733–792 while the spot's box ended at 733 — she was told to try
// months or years by a sentence she could not see.
//
// ⚠⚠ WHAT THIS CHECK IS AND IS NOT. It pins that the REVEAL EXISTS AND IS
// CALLED. ⛔ IT DOES NOT MEASURE THE GEOMETRY — this file opens no browser.
// The geometry was measured by hand on the live page and the numbers are
// recorded in 26.998-04-SUMMARY.md: after the fix, 673–732 inside a card
// ending at 733. ⛔ Nobody may cite this section as proof the line is
// visible; it proves only that the thing which makes it visible is wired.
console.log('11. the newly-shown line is revealed (wiring only, not geometry)');
ok(/function sessionReachReveal\(spot\) \{/.test(APP),
  'the reveal exists');
ok(/if \(SESSION\.reachAsking\) \{ sessionReachReveal\(spot\); \}/.test(APP),
  '⛔ the reveal is CALLED after the handlers are wired — an uncalled reveal '
  + 'is this phase\'s own built-but-never-called defect in miniature');
ok(/block: 'nearest', inline: 'nearest'/.test(APP),
  "the reveal moves the least that works ('nearest'), so it cannot yank the "
  + 'page out from under her');
ok(/session-reach-unreadable'\) \|\|/.test(APP),
  'the refusal line is preferred over the entry row when both are present');

// ---- 12. ⛔ HER TELLING SURVIVES A RESUME (U-4) -------------------------
//
// ⛔ FOUND IN HER OWN UAT: a stretch set 2,422 undated things aside, the
// sitting came back through `pick up where we left off?`, and her sentence
// was GONE. The count lived only in the client, which a reload or a resume
// wipes — so the room did the leaving-out and never did the telling. ⛔ HALF A
// RULING SHIPPED IS NOT THE RULING.
console.log('12. her set-aside line survives a resume');
ok(/"reach_set_aside": int\(reach_set_aside or 0\)/.test(SERVER),
  '⛔ the count is PERSISTED beside the draft — it has to survive everything '
  + 'the draft survives');
const readsBack = (SERVER.match(
  /"reach_set_aside": int\(doc\.get\("reach_set_aside"\) or 0\)/g) || []).length;
ok(readsBack === 2,
  '⛔ BOTH the resume route and the readout hand it back (found '
  + readsBack + ') — one of the two is how it went missing');
// ⚠ RE-AIMED 26.998-08: the parameter is no longer last in the signature,
// so it is followed by a comma rather than the closing paren. The DEFAULT is
// what this pins and the default is unchanged.
ok(/reach_set_aside=0[,)]/.test(SERVER),
  'the worker defaults it, so a run with no stretch persists a plain 0');
const clientReads = (APP.match(/data\.reach_set_aside/g) || []).length;
ok(clientReads >= 4,
  'the client reads it on the fresh path AND on the resume paths (found '
  + clientReads + ')');

console.log('');
if (failures) {
  console.error('test_reflection_reach FAILED — ' + failures + ' of '
    + checks + ' checks');
  process.exit(1);
}
console.log('test_reflection_reach OK (' + checks + ' checks: her six lines '
  + 'pinned by value against the planning record, her em dashes, no default '
  + 'length anywhere, the parser driven over seven refusals, her '
  + '"tell me" riding both endings, and the two defects found on the real '
  + 'screen, the clock that gave up while she typed, and the derivation '
  + 'actually being called, no two controls sharing a label, and the '
  + 'reveal being wired, and her telling surviving a resume)');
console.log('⛔ GEOMETRY AND READABILITY ARE NOT MEASURED HERE.');
