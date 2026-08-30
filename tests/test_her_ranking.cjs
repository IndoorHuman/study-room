#!/usr/bin/env node
'use strict';
/* test_her_ranking — 26.998-07. HER ranking is the cut.
 *
 * ⛔⛔ WHAT THIS PROTECTS, AND EVERY LINE OF IT IS HERS.
 *
 *   "It is a strict order for now"
 *   "Clippings ranks the same as the screenshot"
 *   "Because both of them = things I am interested and I maybe check them out later"
 *   ...then, shown what that did on her real library:
 *   words first, photos fill what is left        (chosen from an offered set)
 *   keep a small space for photos                (chosen from an offered set)
 *   about 50                                     (chosen from an offered set, against a stated cost)
 *
 * ⛔ NO AGENT ASSIGNED ANY OF IT. The tier order and its reason she wrote
 * cold; the three amendments she chose after being shown, each time, exactly
 * what her previous answer had done when driven on her own library.
 *
 * WHY IT EXISTS. Until today the cut was OLDEST-OUT — a rule she never chose —
 * and on her real library it shed 11,847 rows by age, so her own writing could
 * be dropped for being old while a screenshot survived for being new.
 *
 * ---------------------------------------------------------------------------
 * ⭐⭐ AMENDED 26.998-08 — THE TELLING IS BUILT, SO SECTION 7 IS INVERTED.
 * Until 2026-08-24 this file pinned her two sentences OFF every screen, on
 * purpose: the leaving-out had shipped and the telling had not, so the count
 * of what her ranking dropped rode to the MODEL and was never read back to
 * HER. ⛔ That asymmetry was the defect, not the safeguard. Her § G sentences
 * were committed first (`5a21207`, "recorded BEFORE any code moves") and the
 * wiring came after, which is the house rule in that order.
 *
 * ⛔ THE PIN DID NOT WEAKEN, IT TURNED AROUND. Section 7 now holds her lines
 * BY EXACT VALUE — her lowercase `i`, both EM DASHES, no trimming — so the
 * failure it catches is no longer "someone wired them without her" but
 * "someone edited her words without her", which is the same offence.
 *
 * ⛔ WHAT THIS FILE STILL DOES NOT DO.
 *  - It does NOT judge whether her ranking is a good ranking. It is hers.
 *  - It does NOT decide what happens when BOTH sentences are true at once,
 *    or when the pool is photographs alone. Both are open and both are hers.
 *
 * Exits 0/1, house convention.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { execFileSync } = require('child_process');
const fs = require('fs');

const PY = process.env.GSD_PYTHON_BIN || 'python3';
const LIB = fs.readFileSync(path.join(ROOT, 'study_lib.py'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ok   ' + msg); }
  else { console.log('  FAIL ' + msg); failures++; }
}
function py(body) {
  return execFileSync(PY, ['-c',
    'import sys, json; sys.path.insert(0, ' + JSON.stringify(ROOT) + ')\n' +
    'import study_lib as L\n' + body], { encoding: 'utf8' }).trim();
}

/* A synthetic store: one item of each of her kinds, all far over budget so
 * the cut MUST fire. ⛔ Sizes are chosen so that no single tier fits alone —
 * a fixture where the answer is forced by size rather than by her order would
 * pass under any ranking at all. */
const FIXTURE = `
import json, os, tempfile
ROOTDIR = tempfile.mkdtemp(prefix="her-ranking-")
os.makedirs(os.path.join(ROOTDIR, "items"), exist_ok=True)

def item(iid, kind, stamp, text_len=9000):
    """One item of one of HER kinds, WITH A REAL FILE ON DISK.

    ⛔ The file matters: without it the body read fails and every text item
    silently degrades to a metadata row, so a fixture with no files tests the
    unreadable path while claiming to test the ranking. That is exactly how
    the first version of this gate went green on nothing."""
    body = ("word " * (text_len // 5)).encode()
    open(os.path.join(ROOTDIR, "items", iid + ".md"), "wb").write(body)
    it = {"id": iid, "title": iid + ".md", "source": "obsidian-vault",
          "created_ms": stamp, "saved_ms": stamp, "imported_ms": stamp,
          "state": "blessed", "tags": [], "trigger": False, "comments": [],
          "history": [], "library_path": "items/" + iid + ".md",
          "origin_path": "/v/" + iid + ".md", "last_opened_ms": None,
          "resting_until_ms": None, "content_hash": iid}
    if kind == "journal":     it["type"] = "text"
    elif kind == "hand":      it["type"] = "text"; it["handwritten"] = True
    elif kind == "clip":      it["type"] = "text"
    elif kind == "shotnote":  it["type"] = "text"; it["tags"] = [L.SCREENSHOT_TAG]
    elif kind == "photo":     it["type"] = "image"
    elif kind == "shot":      it["type"] = "image"; it["tags"] = [L.SCREENSHOT_TAG]
    return it
`;

console.log('\n-- 1. her four kinds land in her order ------------------------');
const tiers = JSON.parse(py(FIXTURE + `
J = {"j1"}
out = {}
for iid, kind in [("j1","journal"),("h1","hand"),("p1","photo"),
                  ("s1","shot"),("c1","clip"),("n1","shotnote")]:
    out[kind] = L.reflection_tier(item(iid, kind, 1), J)
print(json.dumps(out))`));
ok(tiers.journal === 1, 'her journal is tier 1');
ok(tiers.hand === 2, 'a thing carrying her hand-written mark is tier 2');
ok(tiers.photo === 3, 'a photograph she took is tier 3');
ok(tiers.clip === 4, 'a CLIPPING is tier 4 — "Clippings ranks the same as the screenshot"');
ok(tiers.shot === 4, 'a screenshot is tier 4');
ok(tiers.shotnote === 4, 'a screenshot turned into a note is tier 4');
ok(tiers.clip === tiers.shot,
  'clippings and screenshots are TIED, not merely adjacent — her ruling');

console.log('\n-- 2. the mark is three-valued ------------------------------');
const marks = JSON.parse(py(FIXTURE + `
J=set(); import json
t=lambda v: L.reflection_tier(dict(item("x","clip",1), **({} if v=="absent" else {"handwritten": v})), J)
print(json.dumps({"true": t(True), "false": t(False), "absent": t("absent"),
                  "junk": t("maybe")}))`));
ok(marks.true === 2, 'only an explicit yes is tier 2');
ok(marks.false === 4, 'she said it is NOT hers — tier 4, never tier 2');
ok(marks.absent === 4,
  'an ABSENT mark is tier 4 — filing an unmarked clipping as her own writing ' +
  'is the exact inversion of what she asked for');
ok(marks.junk === 4, 'a value the reader cannot understand is not a yes');

console.log('\n-- 3. THE CUT COMES OFF THE BOTTOM OF HER ORDER --------------');
// ⛔ THE PRIMARY CASE. Over budget, with one heavy item of every kind: her
// journal must survive and the saved-for-later pile must be the one to go.
const cut = JSON.parse(py(FIXTURE + `
import json
items = {}
for i in range(120):
    items["c%d" % i] = item("c%d" % i, "clip", 2000 + i)
items["j1"] = item("j1", "journal", 1000)
items["h1"] = item("h1", "hand", 1500)
store = {"schema_version": 3, "meta": {"fenced_roster": []}, "items": items}
p = L.build_librarian_payload(store, "reflection", consent="full",
                              store_dir=ROOTDIR, session_marker=0,
                              journal_ids={"j1"})
kept = {r["id"] for r in p["bodies"]} | {r["id"] for r in p["meta_rows"]}
print(json.dumps({"journal": "j1" in kept, "hand": "h1" in kept,
                  "clips_kept": len([k for k in kept if k.startswith("c")]),
                  "shed": p["counts"]["ranking-shed"]}))`));
ok(cut.shed > 0, 'the cut actually fired — a fixture under budget proves nothing');
ok(cut.journal === true,
  'HER JOURNAL SURVIVED the cut (it would not have under oldest-out — it is ' +
  'the oldest thing in the fixture)');
ok(cut.hand === true, 'her hand-written thing survived');
ok(cut.clips_kept < 120, 'the saved-for-later pile is what got shed');

console.log('\n-- 4. words before wordless, and her photo slice -------------');
const slice = JSON.parse(py(FIXTURE + `
import json
items = {}
for i in range(900):
    items["p%d" % i] = item("p%d" % i, "photo", 5000 + i, 40)
for i in range(80):
    items["c%d" % i] = item("c%d" % i, "clip", 1000 + i)
store = {"schema_version": 3, "meta": {"fenced_roster": []}, "items": items}
p = L.build_librarian_payload(store, "reflection", consent="full",
                              store_dir=ROOTDIR, session_marker=0, journal_ids=set())
print(json.dumps({"photos": len(p["meta_rows"]), "readable": len(p["bodies"]),
                  "slice": L.REFLECTION_PHOTO_SLICE,
                  "shed": p["counts"]["ranking-shed"]}))`));
ok(slice.readable > 0,
  'things WITH WORDS survive when photographs compete for the same space — ' +
  '"words first, photos fill what is left"');
ok(slice.photos > 0,
  'and her photographs are NOT wiped out — "keep a small space for photos"');
ok(slice.photos <= slice.slice,
  'the photo slice is a CEILING (' + slice.photos + ' <= ' + slice.slice + ')');
ok(slice.slice === 50, 'her slice is the 50 she chose, against a stated cost');

console.log('\n-- 4b. the slice is for HER PHOTOGRAPHS, not the pile she ranked last --');
// ⛔ ADDED AFTER A MUTANT SURVIVED. The first version of section 4 had no
// screenshots in it, so a mutation that let ANY wordless row into her photo
// slice walked straight through — the gate simply could not see the
// difference. A slice spent on the pile she ranked LAST is the opposite of
// what she asked for, and it is now driven.
const slice2 = JSON.parse(py(FIXTURE + `
import json
items = {}
for i in range(600):
    items["p%d" % i] = item("p%d" % i, "photo", 1000 + i, 40)
for i in range(600):
    items["s%d" % i] = item("s%d" % i, "shot", 9000 + i, 40)
for i in range(80):
    items["c%d" % i] = item("c%d" % i, "clip", 500 + i)
store = {"schema_version": 3, "meta": {"fenced_roster": []}, "items": items}
p = L.build_librarian_payload(store, "reflection", consent="full",
                              store_dir=ROOTDIR, session_marker=0, journal_ids=set())
kept = [r["id"] for r in p["meta_rows"]]
print(json.dumps({"photos": len([k for k in kept if k.startswith("p")]),
                  "shots": len([k for k in kept if k.startswith("s")]),
                  "shed": p["counts"]["ranking-shed"]}))`));
ok(slice2.shed > 0, 'the cut fired with screenshots competing for the slice');
ok(slice2.photos > 0, 'her PHOTOGRAPHS hold the slice');
ok(slice2.shots === 0,
  'and screenshots get NONE of it — even though they are newer, which under ' +
  'the old oldest-out rule is exactly what would have won');

console.log('\n-- 5. an under-budget pool is untouched ----------------------');
const small = JSON.parse(py(FIXTURE + `
import json
items = {"j1": item("j1","journal",1,50), "c1": item("c1","clip",2,50),
         "p1": item("p1","photo",3,50)}
store = {"schema_version": 3, "meta": {"fenced_roster": []}, "items": items}
p = L.build_librarian_payload(store, "reflection", consent="full",
                              store_dir=ROOTDIR, session_marker=0, journal_ids={"j1"})
print(json.dumps({"shed": p["counts"]["ranking-shed"],
                  "n": len(p["bodies"]) + len(p["meta_rows"])}))`));
ok(small.shed === 0,
  'KNOWN-NEGATIVE: nothing is shed when everything fits — the ranking is a ' +
  'CUT, never a filter');
ok(small.n === 3, 'and all three kinds are still there');

console.log('\n-- 6. the count is separate from the undated count -----------');
ok(/out\["counts"\]\["ranking-shed"\] = 0/.test(LIB),
  'the ranking count is reported even at zero — "nothing was left out" and ' +
  '"this build cannot tell you" must not be the same shape');
ok(/ranking-shed/.test(LIB) && /reach_set_aside/.test(SERVER),
  'it is a DIFFERENT number from the undated count her T-4 line carries — ' +
  '"I could not date it" and "I judged it worth less" are two facts');

console.log('\n-- 7. HER TELLING REACHES HER, IN HER OWN BYTES --------------');
// ⛔⛔ PINNED BY EXACT VALUE, NOT BY PATTERN. A regex that merely finds the
// sentence would pass on a "tidied" copy — sentence-cased `I`, a hyphen for
// her em dash, a trimmed full stop. Her words are the thing being protected,
// so the literal is the assertion.
const G1 = "there was more than i could hold; i kept what's yours.";
const G2 = 'nothing of your own writing came in this time; this is built ' +
  'from what you saved.';
ok(APP.indexOf(G1) !== -1,
  'her G-1 sentence reaches the app VERBATIM — lowercase i, semicolon, ' +
  'full stop, untrimmed');
ok(APP.indexOf(G2) !== -1,
  'her G-2 sentence reaches the app VERBATIM');
// ⛔ THE PUNCTUATION SPECIFICALLY. Re-ruled by the owner 2026-08-30: no em
// dash anywhere in the room's copy. A dash creeping back is the reword now.
ok(G1.indexOf('\u2014') === -1 && G2.indexOf('\u2014') === -1,
  'and neither literal carries an EM DASH (U+2014) — re-ruled 2026-08-30');
// ⛔ NO SECOND SPELLING OF HER WORDS. One literal each, or a later edit
// fixes one copy and leaves the other lying in the file.
ok(APP.split(G1).length - 1 === 1, 'her G-1 line appears exactly ONCE');
ok(APP.split(G2).length - 1 === 1, 'her G-2 line appears exactly ONCE');
// ⛔ HER T-3 ZERO PRECEDENT, READ STRAIGHT ONTO THE RANKING: a zero says
// nothing, because there is nothing to say. Both lines are painted behind a
// > 0 test rather than unconditionally.
// ⚠ RE-AIMED 26.998-10, NOT WEAKENED. These were ternaries inline in ONE
// painter. That is exactly how her lines became unreachable — the spread never
// painted them at all — so they now live in ONE builder called by both
// surfaces, and the shape is an `if`, not a `?`. The PROPERTY pinned is
// unchanged: each line is painted only when its own condition holds.
ok(/if \(SESSION\.rankingShed > 0\)/.test(APP),
  'G-1 is painted only when the ranking actually dropped something');
ok(/if \(SESSION\.ownKept === 0 && SESSION\.savedKept > 0\)/.test(APP),
  'G-2 needs BOTH halves of her own sentence true — none of her writing ' +
  'survived AND the saved kind did; a photographs-only pool says nothing ' +
  'rather than half a false sentence');
// ⛔ ONE BUILDER, BOTH SURFACES — the fix for the defect she actually hit.
ok(/function sessionAsideLines\(\)/.test(APP),
  'her three lines have ONE spelling, not one per painter');
ok((APP.match(/sessionAsideLines\(\)/g) || []).length >= 3,
  'and it is CALLED by the card and by the spread, so a line she can reach ' +
  'in one view cannot silently vanish from the other');
// ⛔ U-4's DEFECT MUST NOT COME BACK. Her T-4 count once lived only in the
// client and a resume wiped her sentence off a picked-up draft. These three
// numbers persist with the draft and ride both readouts.
ok(/"ranking_shed": int\(ranking_shed or 0\)/.test(SERVER),
  'the ranking count PERSISTS with the draft, as her T-4 count does');
// ⛔⛔ THE KEY, NOT JUST THE READ. A drill mutant renamed the OUTGOING key on
// one readout while leaving `doc.get("ranking_shed")` in place, and an
// earlier version of this check — which counted the read expression — let it
// walk straight through. That is U-4's defect exactly: the number is fetched
// and never delivered. Both halves are pinned now.
['ranking_shed', 'own_kept', 'saved_kept'].forEach(function (k) {
  const pair = '"' + k + '": int(doc.get("' + k + '") or 0)';
  ok(SERVER.split(pair).length - 1 === 2,
    'the telling\'s `' + k + '` is EMITTED under its own name on BOTH ' +
    'readouts — the resume and the plain read');
});
// ⛔ ONE READER ON THE CLIENT, for the same reason.
ok((APP.match(/sessionReadTelling\(/g) || []).length >= 3,
  'one client reader, called at every door the telling can arrive through');

console.log('\n-- 8. neither signal reaches the model -----------------------');
const rows = LIB.slice(LIB.indexOf('_meta_row = {'), LIB.indexOf('_meta_row = {') + 400);
ok(!/tier|handwritten|journal/.test(rows),
  'the payload row carries no tier, no mark and no journal flag — the ' +
  'ranking orders the pool and nothing more');
// ⛔⛔ 26.998-08: AND THE TELLING'S OWN NUMBERS DO NOT LEAK EITHER. own_kept
// and saved_kept are TIER COUNTS. Putting them in the payload would tell the
// model her journal and hand-written signals through the back door, which is
// exactly what section 8 exists to forbid. They are computed on the server
// and ride the response and the session document — never `pool`.
ok(!/own_kept|saved_kept/.test(LIB),
  'the payload builder knows nothing of the telling counts');
ok(/own_kept = 0/.test(SERVER) && /saved_kept = 0/.test(SERVER),
  'they are derived in the server route instead');
// ⚠ THE END BOUND IS SEARCHED FROM THE START INDEX, NOT FROM 0. The first
// `fenced_titles = _fenced_titles` in the file sits in an EARLIER route, so
// a naive indexOf produced an EMPTY slice — and an empty slice passes a
// "contains nothing bad" test for free. Caught by driving it.
const _s0 = SERVER.indexOf('ranking_shed = int(');
const _s1 = SERVER.indexOf('fenced_titles = _fenced_titles', _s0);
const _startBlock = SERVER.slice(_s0, _s1);
ok(_s0 !== -1 && _s1 > _s0 && _startBlock.length > 200,
  'the telling derivation was actually located (a zero-length slice would ' +
  'pass the next check for free)');
ok(!/pool\[/.test(_startBlock) && !/pool\.setdefault/.test(_startBlock),
  'and that derivation never writes back into the pool the model is sent');
ok(/derive_handwritten\(\s*snapshot/.test(SERVER),
  'the mark is derived on the THROWAWAY SNAPSHOT (it mutates what it is given)');
ok(!/save_store/.test(SERVER.slice(SERVER.indexOf('derive_handwritten('),
                                   SERVER.indexOf('derive_handwritten(') + 1800)),
  'and nothing is persisted on that read path');

console.log('\n-- 9. HER JOURNAL LEADS THE POOL (her 2026-08-24 ruling) -----');
// ⛔⛔ HER RULING, VOLUNTEERED after reading a real reflection on her real
// library: *"I want the reflection can mention about journal the first since
// the journal is the most important material"*. Asked what "first" meant she
// chose `Open on it — it's the first thing I read`; asked how the model should
// be able to tell, she chose `Order them first, don't label` over labelling
// the rows. ⚠ Those two were chosen from an offered set; the ruling and its
// reason are hers and were volunteered.
//
// ⛔ THE FIXTURE IS BUILT IN THE WORST ORDER ON PURPOSE — saved kinds first,
// her journal LAST — so a pass cannot come from the insertion order happening
// to be right. That is this file's own recorded failure mode (§ its header:
// a gate that went green on nothing).
const lead = JSON.parse(py(FIXTURE + `
order = [("clip","c0"),("shotnote","s1"),("photo","p2"),
         ("hand","h3"),("journal","j4"),("clip","c5")]
items = {}
for n,(kind,iid) in enumerate(order):
    items[iid] = item(iid, kind, 100 + n, text_len=200)
store = {"schema_version": 3, "meta": {"fenced_roster": []}, "items": items}
p = L.build_librarian_payload(store, "reflection", consent="full",
                              store_dir=ROOTDIR, session_marker=0,
                              journal_ids={"j4"})
bodies = [r["id"] for r in p["bodies"]]
metas = [r["id"] for r in p["meta_rows"]]
tiers = [L.reflection_tier(items[i], {"j4"}) for i in bodies]
print(json.dumps({"bodies": bodies, "metas": metas, "tiers": tiers,
                  "total": len(bodies) + len(metas), "built": len(items),
                  "keys": sorted({k for r in p["bodies"] + p["meta_rows"]
                                  for k in r})}))`));
ok(lead.bodies.length > 0 && lead.bodies[0] === 'j4',
  '⭐ HER JOURNAL IS THE FIRST THING HANDED OVER — from a pool built with it ' +
  'LAST');
ok(JSON.stringify(lead.tiers) === JSON.stringify(lead.tiers.slice().sort()),
  'and the rest follows HER OWN ORDER, so a sitting with no journal falls to ' +
  'her other writing rather than to whatever came first');
ok(lead.total === lead.built,
  '⛔ ORDER ONLY — every row still present; the sort runs after the shed and ' +
  'moves nothing in or out');
// ⛔⛔ NOTHING IS LABELLED — CHECKED ON THE ROWS THEMSELVES, NOT ON THEIR IDS.
// ⚠ THE FIRST VERSION OF THIS CHECK WAS VACUOUS AND A DRILL MUTANT WALKED
// THROUGH IT: it stringified the list of row IDS, which are plain strings, so
// a `tier` key smuggled onto every row was invisible to it. That is this
// project's own defect class — measuring one term and concluding about
// another — in a gate written to guard the very thing it could not see.
// The keys of every emitted row are now enumerated and asserted directly.
ok(lead.keys.length > 0,
  'the row keys were actually collected (an empty set would pass the next ' +
  'check for free — the vacuity that let mutant 5 through)');
ok(!lead.keys.some(function (k) { return /tier|handwritten|journal/.test(k); }),
  'and NO row carries a tier, mark or journal key — she chose ordering OVER ' +
  'telling the model what anything is, and position is the only signal');

console.log('\n-- 10. THE PROMPT CARRIES HER OPENING RULING ----------------');
// ⛔ ORDERING ALONE IS NOT HER RULING. The pool being handed over in her order
// makes her journal AVAILABLE first; it does not make the writing OPEN there.
// Both halves are required and this pins the second.
ok(/OPEN THE WRITING ON THE FIRST ROW YOU ARE GIVEN/.test(SERVER),
  'the librarian is told to open on the first row it is handed — the row ' +
  'her own order put there');
ok(/HER OWN ORDER OF IMPORTANCE/.test(SERVER),
  'and told the rows arrive in HER order, so the instruction and the sort ' +
  'are describing the same thing');
ok(/nothing goes in front of it/.test(SERVER),
  'nothing may precede it — her ruling was `Open on it — it\'s the first ' +
  'thing I read`, not `the journal ranks high`');

// ⛔⛔ HER 2026-08-24 RULING ON THE PILE LINE: `Cut it entirely`.
// ⚠ SHE RULED THIS AFTER BEING SHOWN A TENSION NOBODY HAD PUT TO HER: her
// standing 2026-07-28 rule bans an exact COUNT from any front-facing surface,
// the shipped screen catches DIGITS, and an agent's instruction told the model
// to "name the size in words instead" — so `over a thousand pieces` satisfied
// the letter and defeated the spirit, and opened the reflection she read.
ok(!/name the size in words instead/.test(SERVER),
  '⛔ the "name the size in words" instruction is GONE — it is what produced ' +
  'the line she cut');
ok(/never name the size of the pile in any other form/.test(SERVER),
  'and the prohibition now covers ANY form, not only digits');
ok(/how much arrived is not something she reads/.test(SERVER),
  'stated plainly rather than left to inference');
// ⛔ THE EXAMPLE TAUGHT THE OPENING SHE CUT. Fixing the instruction while
// leaving an example that demonstrates the banned move is how a prompt rule
// gets quietly out-voted by its own examples.
ok(!/there is a lot in tonight's pile and i am staying/.test(SERVER),
  '⛔ and no shipped example opens by naming the size any more');
// ⛔ D-38 IS NOT OVERTURNED. She ruled on 2026-08-22 that the room may still
// COMPUTE the count and still HAND IT to the librarian; only the echo is
// banned. An agent "simplifying" this into stop-computing changes a decision
// she did not make, and the shipped source says so in terms.
ok(/derive_evening_line/.test(LIB) && /"there is a lot here — \{pieces\}"/.test(LIB),
  '⛔ D-38 UNTOUCHED — the room still computes the evening line and still ' +
  'hands it over; only what the librarian may say back to her changed');

console.log('\n-- 11. HER ORDER WITHIN A TIER, AND HER PHOTOS-ONLY LINE -----');
// ⛔⛔ HER RULING 2026-08-24 (§ I), chosen from an offered set: `Newest first`.
// ⭐ IT WAS ALREADY THE SHIPPED BEHAVIOUR — so this gate does not defend a
// change, it defends a property that had NEVER BEEN RULED ON and could have
// drifted at any time without anyone noticing.
//
// ⛔⛔ THE FIXTURE MUST ACTUALLY OVERFLOW, AND THE FIRST VERSION OF THIS
// MEASUREMENT DID NOT. Six entries fitted inside the budget, the cut never
// fired, and it reported "newest survive" from a run where NOTHING WAS
// DROPPED. That is this file's own recorded failure mode, hit again while
// writing a gate against it. The shed count is asserted FIRST, below.
const within = JSON.parse(py(FIXTURE + `
items = {}
for n in range(120):
    iid = "j%03d" % n
    items[iid] = item(iid, "journal", 1000 + n * 1000, text_len=9000)
store = {"schema_version": 3, "meta": {"fenced_roster": []}, "items": items}
p = L.build_librarian_payload(store, "reflection", consent="full",
                              store_dir=ROOTDIR, session_marker=0,
                              journal_ids=set(items))
kept = [r["id"] for r in p["bodies"]] + [r["id"] for r in p["meta_rows"]]
ages = {k: items[k]["created_ms"] for k in items}
shed = [k for k in items if k not in set(kept)]
print(json.dumps({"shed": p["counts"]["ranking-shed"],
                  "kept": len(kept),
                  "oldest_kept": min([ages[k] for k in kept]) if kept else None,
                  "newest_shed": max([ages[k] for k in shed]) if shed else None}))`));
ok(within.shed > 0 && within.kept > 0,
  '⛔ THE CUT ACTUALLY FIRED (' + within.shed + ' shed, ' + within.kept +
  ' kept) — without this the next check passes on a run that dropped nothing');
ok(within.oldest_kept > within.newest_shed,
  '⭐ NEWEST FIRST WITHIN A TIER — every entry kept is newer than every ' +
  'entry dropped, which is her ruling and was already true');

// ⛔ § H — HER PHOTOGRAPHS-ONLY LINE. ⚠ AN AGENT'S WORDING, CHOSEN BY HER over
// writing it herself and over silence. Pinned BY VALUE against the record.
const ONLY_PHOTOS = 'only your photographs came in this time.';
ok(APP.indexOf(ONLY_PHOTOS) !== -1,
  'her chosen photographs-only line reaches the app VERBATIM — lowercase, ' +
  'no dash, full stop, untrimmed');
ok(APP.split(ONLY_PHOTOS).length - 1 === 1, 'and it appears exactly ONCE');
ok(!/only your photographs came in this time —/.test(APP),
  '⛔ and NO DASH was added to make it match her other lines');
ok(/if \(SESSION\.ownKept === 0 && SESSION\.savedKept === 0 &&\s*\n?\s*SESSION\.photosKept > 0\)/.test(APP),
  'it fires only when nothing of hers AND nothing saved survived, but ' +
  'photographs did');
// ⛔ THE TWO CAN NEVER BOTH FIRE. G-2 needs saved material to have survived;
// this needs none to have. She is never told two things about one sitting.
ok(/SESSION\.savedKept > 0/.test(APP) && /SESSION\.savedKept === 0/.test(APP),
  'and it is mutually exclusive with G-2 by construction, not by ordering');
ok(/"photos_kept": int\(photos_kept or 0\)/.test(SERVER),
  'the count persists with the draft, as her other tellings do');
// ⛔⛔ THE KEY, NOT JUST THE READ — AND I GOT THIS WRONG TWICE.
// 26.998-08's drill caught a mutant that renamed the OUTGOING key on one
// readout while leaving the doc.get() in place; the fix was to pin the
// key-and-value PAIR. Writing this gate I reached for the count of the READ
// again, and the same mutant walked through again. ⚠ The class survives being
// named, fixed once, and looked for — which is why it is pinned in the shape
// below rather than described in a comment.
ok(SERVER.split('"photos_kept": int(doc.get("photos_kept") or 0)').length - 1 === 2,
  'her photographs-only count is EMITTED under its own name on BOTH ' +
  'readouts — the resume and the plain read');

console.log('');
if (failures) {
  console.log('FAIL test_her_ranking — ' + failures + ' check(s)');
  process.exit(1);
}
console.log('test_her_ranking OK — her order is the cut, words come before ' +
  'wordless, her photo slice holds, and her telling now reaches her in her ' +
  'own bytes without either tier count reaching the model.');
process.exit(0);
