#!/usr/bin/env node
'use strict';
/*
 * tests/test_2699_pins.cjs — PHASE 26.99'S PIN INVENTORY (Plan 26.99-01,
 * Task 1; SRM-11 / SRM-13).
 *
 * WHAT THIS IS. One register, `PHASE_PINS`, with one row per pin in
 * `tests/test_no_push.cjs`, `tests/test_display_fence.cjs` and
 * `tests/test_disclosure_truth.cjs` that this phase's changes can FALSIFY.
 * Each row names: an id, the gate file the pin lives in, the exact subject
 * the gate asserts on, the plan number authorised to move it, and the ruling
 * (D-NN) that authorises the move. After this suite, a red in any later wave
 * of 26.99 can be READ — before it, it cannot.
 *
 * ⚠⚠ WHY TWO INSTRUMENTS, AND WHY THEY MUST BE OF DIFFERENT KINDS (B-7).
 * 26.93's Wave 0 took its inventory from two instruments that AGREED AND WERE
 * BOTH WRONG — both read the same stale document, so their agreement measured
 * the document rather than the code. This project also carries roughly thirty
 * recorded instances of a defect landing INSIDE the measuring instrument, and
 * four separate cases of a suite amended to encode a loss. So every row here
 * runs two instruments that CANNOT agree with each other by reading the same
 * stale thing:
 *
 *   Instrument A — A GREP. The gate file is read and comment-stripped with
 *     the SHIPPED strippers, and the pin's subject must be present in the
 *     stripped source. A pin that has silently VANISHED fails here.
 *
 *   Instrument B — A PLANTED VIOLATION. The gate's own subject is copied IN
 *     MEMORY with the violation the pin exists to catch deliberately planted
 *     in it, the gate's own predicate is run over that copy, and the
 *     predicate must REJECT it. A pin that is PRESENT BUT TOOTHLESS fails
 *     here. A planted violation cannot agree with a stale document, which is
 *     the whole reason it is the second instrument rather than a second grep.
 *
 * ⛔ NOTHING IN THIS SUITE IS RETYPED FROM A GATE. Every pinned sentence,
 * every banned claim and every forbidden regex is LIFTED OUT OF THE GATE FILE
 * AT RUN TIME (see `liftSpan` / `evalLiteral`). A retyped regex passes this
 * suite forever while the gate walks away from it — the silent drift this
 * whole file exists to catch.
 *
 * ⛔ D-14: this suite makes NO claim about what any sentence SAYS. It carries
 * no candidate wording. The front-facing sentences belong to the owner and
 * arrive through #77; what is asserted here is only that a pin exists and has
 * teeth.
 *
 * ⛔ KEY SAFETY, STRUCTURAL NOT PROCEDURAL (S-7). The files this suite may
 * open are an allow-list (`READS`) and `readSource` refuses anything else.
 * Nothing here reads a key, prints a key, opens a socket, spawns a process,
 * or writes any file at all — the only filesystem calls are readFileSync over
 * that allow-list. Every mutation is a STRING IN MEMORY.
 *
 * Run contract (the house's): zero dependency (node builtins only), path
 * independent via path.join(__dirname, '..'), ONE OK line and exit 0 on
 * success, every failure listed with its row id and exit 1. There is no
 * runner and no framework, so a quiet stop is indistinguishable from a pass —
 * which is why the case count is pinned BY VALUE below.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const failures = [];

// ---- the allow-list, and the only filesystem call in this file -------------
//
// Three gate files (the pins), and three subjects the gates assert over. ⛔ Not
// one path under the room's config directory, and no key file of any kind.
const READS = [
  'tests/test_no_push.cjs',
  'tests/test_display_fence.cjs',
  'tests/test_disclosure_truth.cjs',
  'app.js',
  'server.py',
  'LIBRARIAN.md'
];

const cache = Object.create(null);
function readSource(rel) {
  if (READS.indexOf(rel) === -1) {
    throw new Error('refusing to read ' + JSON.stringify(rel) +
      ' — this suite reads an ALLOW-LIST and nothing else (S-7). Adding a ' +
      'path here is a decision, not a convenience.');
  }
  if (!(rel in cache)) {
    cache[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  }
  return cache[rel];
}

// ---- the shipped strippers, COPIED (not re-rolled) -------------------------
//
// Verbatim from tests/test_no_push.cjs:1106-1141. ⛔ Re-rolling them is how a
// static scan quietly stops matching what the gate matches; B-2 is recorded
// three times on this project. They are not exported by that suite, so a copy
// is the only way to share them — and the copy is PINNED against the original
// at run time by `strippersMatchTheShippedOnes` below, so a drift in either
// direction turns this suite red instead of turning the gate blind.

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

function stripPyDocstrings(src) {
  return src.replace(/("""|''')[\s\S]*?\1/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

function flattenDoc(src) {
  return String(src).replace(/\s+/g, ' ');
}

// ---- the lift: a register read OUT OF THE GATE at run time -----------------
//
// Slices the source span of one array literal — from the unique line carrying
// its marker, to the line carrying its terminator — and evaluates it. ⚠ The
// marker must match EXACTLY ONE line: a lift that is not unique is not a lift,
// and silently taking the first of two is how an inventory ends up describing
// the wrong register.
function liftSpan(src, startMarker, endRe, what) {
  const lines = src.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(startMarker) !== -1) { hits.push(i + 1); }
  }
  if (hits.length !== 1) {
    throw new Error('the marker ' + JSON.stringify(startMarker) +
      ' matches ' + hits.length + ' line(s) in ' + what +
      ' (lines ' + hits.join(', ') + ') — a lift that is not unique is not ' +
      'a lift');
  }
  const from = hits[0] - 1;
  const open = lines[from].indexOf('[');
  if (open === -1) {
    throw new Error('no `[` on the marker line in ' + what);
  }
  const out = [lines[from].slice(open)];
  for (let j = from + 1; j < lines.length; j++) {
    if (endRe.test(lines[j])) {
      out.push(lines[j].slice(0, lines[j].indexOf(']') + 1));
      return out.join('\n');
    }
    out.push(lines[j]);
  }
  throw new Error('no terminator ' + endRe + ' after the marker in ' + what);
}

// Evaluated in a context with NO GLOBALS AT ALL. The lifted text is a literal
// today; if a gate's register ever grows a call, that call can reach nothing —
// the evaluation throws and this suite goes red, which is the correct answer
// to "the register stopped being liftable".
function evalLiteral(text, what) {
  try {
    return vm.runInNewContext('(' + text + ')', Object.create(null),
      { timeout: 2000 });
  } catch (e) {
    throw new Error('the register lifted from ' + what +
      ' did not evaluate as a literal: ' + e.message);
  }
}

// The stripper drift pin. Compares this file's copies against the spans still
// standing in tests/test_no_push.cjs, whitespace-normalised (the comparison is
// about the CODE, and a reflow is not a drift).
function fnSpan(src, decl, what) {
  const at = src.indexOf(decl);
  if (at === -1) {
    throw new Error(what + ': ' + JSON.stringify(decl) +
      ' is gone from tests/test_no_push.cjs — the strippers this suite ' +
      'copies no longer exist where they were copied from');
  }
  const rest = src.slice(at);
  const end = rest.indexOf('\n}');
  if (end === -1) { throw new Error(what + ': no closing brace found'); }
  return rest.slice(0, end + 2);
}

function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

function strippersMatchTheShippedOnes() {
  const gate = readSource('tests/test_no_push.cjs');
  const pairs = [
    ['function stripJsComments(src) {', stripJsComments],
    ['function stripPyComments(src) {', stripPyComments],
    ['function stripPyDocstrings(src) {', stripPyDocstrings],
    ['function flattenDoc(src) {', flattenDoc]
  ];
  pairs.forEach(function (p) {
    const shipped = norm(fnSpan(gate, p[0], 'strippers'));
    const mine = norm(String(p[1]));
    if (shipped !== mine) {
      failures.push('[strippers] ' + p[0] + ' has DRIFTED from the shipped ' +
        'one in tests/test_no_push.cjs. Copy it again — a stripper that ' +
        'differs from the gate\'s own is a static scan measuring a ' +
        'different file than the gate does (B-2).');
    }
  });
}

// ===========================================================================
// ---- THE REGISTER ---------------------------------------------------------
//
// ⚠ THE `movedBy` COLUMN IS THE POINT OF THIS FILE. A pin is not "green" or
// "red" — it is AUTHORISED TO MOVE, by exactly one plan, under exactly one
// ruling, or it is not authorised to move at all. Four of the six rows below
// are `null`: nothing in this phase may re-cut them, and a later wave that
// finds one of them red has found a DEFECT IN ITS OWN WORK, never a pin to
// amend. That distinction is the thing 26.93 could not make, and it is why
// four suites on this project were amended to encode a loss.
//
// Each row carries its two instruments as functions. Both run for every row,
// every run, and a throw in one is caught and counted rather than ending the
// loop — a harness that stops at the first catch reports one failure where
// there may be twelve.

// \u26a0 THE FILES A BAN MAY POINT AT (26.99-10). Named once, here, so the
// two instruments below cannot disagree about the register's shape. \u26d4 It
// is an ALLOW-LIST rather than a derivation: a ban whose file this list does
// not hold is a ban nothing checks, and the honest answer to that is red.
const BAN_FILES = ['app.js', 'server.py', 'LIBRARIAN.md'];

const PHASE_PINS = [

  // -- 1 ---------------------------------------------------------------------
  {
    id: 'ceiling-byte-pin',
    gate: 'tests/test_no_push.cjs',
    subject: 'server.py',
    what: 'the byte-exact ceiling sentence, pinned PRESENT in server.py',
    movedBy: '26.99-06',
    ruling: 'D-18',
    moved: '✅ MOVED 2026-08-16 by 26.99-06, under D-18, in its own commit.',
    why: 'D-18 ruled the stop STAYS, counted in work, and that BOTH pinned ' +
      'ceiling messages were FALSE — they said the pass stopped at a cost ' +
      'limit, on a pass that costs nothing. ✅ 26.99-06 wired the derived ' +
      'stop and RE-CUT this pin to the owner\'s own sentence, from #77\'s ' +
      '26.99 slice; ⛔ no agent chose a word of it. Both superseded ' +
      'sentences went into RETIRED_CLAIMS in the same commit, so neither ' +
      'can creep back. ✅ AND THE ASYMMETRY THIS ROW RECORDED IS CLOSED: ' +
      'CLEAN_CEILING_MSG had no pin at all and now has one — pinned as an ' +
      'IDENTITY (it IS the import loop\'s constant) plus a count that her ' +
      'sentence appears exactly once as a literal, because her ruling was ' +
      '"same line both" and a second literal is where two surfaces drift ' +
      'apart. ⛔ THE AUTHORISATION IS SPENT: no later plan in 26.99 may ' +
      'move this pin.',

    // The pinned bytes, LIFTED. Never typed here (D-14, and a retyped pin is
    // not a pin — it is a second copy of her sentence in a file she never
    // approved). ⚠ THE SELECTOR MOVED WITH THE PIN, 26.99-06: it used to
    // reach for the member about a cost limit, which is the very claim D-18
    // struck. It now reaches for the two halves of what she actually wrote —
    // enough, and nothing lost — and the sentence itself still comes from
    // the gate.
    lift: function () {
      const gate = readSource('tests/test_no_push.cjs');
      const rows = evalLiteral(
        liftSpan(gate, "['the librarian is already sorting",
          /^\s*\]\.forEach/, 'test_no_push.cjs guardrail lines'),
        'test_no_push.cjs guardrail lines');
      const picked = rows.filter(function (s) {
        return /done enough to understand you/.test(s) &&
          /Nothing was lost/.test(s);
      });
      if (picked.length !== 1) {
        throw new Error('the guardrail roster holds ' + picked.length +
          ' ceiling sentence(s), not 1');
      }
      return picked[0];
    },

    // A — a grep: the pin's subject is present in the comment-stripped gate.
    grep: function (pin) {
      const gate = stripJsComments(readSource('tests/test_no_push.cjs'));
      return gate.indexOf(pin) !== -1
        ? null
        : 'the ceiling sentence is no longer pinned in live gate code ' +
          '(found only in comments, or gone) — the pin has VANISHED';
    },

    // B — a planted violation: the gate's predicate is an indexOf over RAW
    // server.py ("missing => violation"). Re-expressed here from the gate's
    // own shape, then fed a copy of server.py with the sentence DELETED. A
    // pin that cannot notice its own subject going missing is toothless.
    plant: function (pin) {
      const predicate = function (py) {
        return py.indexOf(pin) === -1 ? ['pinned guardrail line missing'] : [];
      };
      const real = readSource('server.py');
      const mutated = real.split(pin).join('');
      if (mutated === real) {
        return 'the plant changed nothing — the sentence is not in ' +
          'server.py at all, so nothing could be removed from it';
      }
      if (predicate(real).length !== 0) {
        return 'the control failed: the re-expressed predicate reports a ' +
          'violation against the REAL server.py';
      }
      return predicate(mutated).length > 0
        ? null
        : 'PLANTED VIOLATION NOT CAUGHT — the sentence was deleted from a ' +
          'copy of server.py and the pin\'s predicate stayed silent';
    }
  },

  // -- 2 ---------------------------------------------------------------------
  {
    id: 'doc-anchor-billing',
    gate: 'tests/test_no_push.cjs',
    subject: 'LIBRARIAN.md',
    what: 'the DOC_ANCHORS billing anchor, pinned PRESENT in LIBRARIAN.md',
    movedBy: '26.99-10',
    ruling: 'D-22',
    moved: '\u2705 MOVED 2026-08-16 by 26.99-10, under D-22, in its own commit.',
    why: 'D-22: D-04\'s forecast (one rounded-up dollar bound, once, before ' +
      'the expensive action) FALSIFIED this shipped, pinned sentence. ' +
      '\u2705 26.99-10 landed the forecast and RE-CUT this pin to the ' +
      'owner\'s own replacement, from #77\'s 26.99 slice (\u00a7S-02); ' +
      '\u26d4 no agent chose a word of it. The superseded sentence went ' +
      'into RETIRED_CLAIMS in the same commit, so it cannot creep back \u2014 ' +
      'and it is the FIRST ban in that register whose file is a DOCUMENT, ' +
      'checked against the whitespace-flattened text for the same reason ' +
      'DOC_ANCHORS is. \u26d4 THE AUTHORISATION IS SPENT: no later plan in ' +
      '26.99 may move this pin.',

    lift: function () {
      const gate = readSource('tests/test_no_push.cjs');
      const anchors = evalLiteral(
        liftSpan(gate, 'const DOC_ANCHORS = [', /^\s*\];\s*$/,
          'test_no_push.cjs DOC_ANCHORS'),
        'test_no_push.cjs DOC_ANCHORS');
      // \u26a0 THE SELECTOR MOVED WITH THE PIN, 26.99-10: it used to reach for
      // the anchor about the room putting no dollar figure on her screen,
      // which is the very claim D-04 struck. It now reaches for the two
      // halves of what she actually wrote \u2014 that an estimate is shown
      // ahead of time, and that it is not a bill \u2014 and the sentence
      // itself still comes from the gate rather than from this file.
      const picked = anchors.filter(function (pair) {
        return /estimate ahead of time/.test(pair[0]) &&
          /not a bill/.test(pair[0]);
      });
      if (picked.length !== 1) {
        throw new Error('DOC_ANCHORS holds ' + picked.length +
          ' billing anchor(s), not 1');
      }
      return picked[0][0];
    },

    grep: function (pin) {
      const gate = stripJsComments(readSource('tests/test_no_push.cjs'));
      return gate.indexOf(pin) !== -1
        ? null
        : 'the billing anchor is no longer pinned in live gate code — the ' +
          'pin has VANISHED';
    },

    // The gate matches over a WHITESPACE-FLATTENED document, because
    // LIBRARIAN.md is hard-wrapped. The predicate is re-expressed with the
    // same normaliser, or the plant would be measuring the wrapping.
    plant: function (pin) {
      const predicate = function (docFlat) {
        return docFlat.indexOf(pin) === -1 ? ['doc anchor missing'] : [];
      };
      const real = flattenDoc(readSource('LIBRARIAN.md'));
      const mutated = real.split(pin).join('');
      if (mutated === real) {
        return 'the plant changed nothing — the anchor is not in ' +
          'LIBRARIAN.md at all';
      }
      if (predicate(real).length !== 0) {
        return 'the control failed: the re-expressed predicate reports a ' +
          'violation against the REAL LIBRARIAN.md';
      }
      return predicate(mutated).length > 0
        ? null
        : 'PLANTED VIOLATION NOT CAUGHT — the anchor was deleted from a ' +
          'copy of the document and the pin\'s predicate stayed silent';
    }
  },

  // -- 3 ---------------------------------------------------------------------
  {
    id: 'retired-claims-ban-register',
    gate: 'tests/test_no_push.cjs',
    subject: 'app.js + server.py (comment-stripped) + LIBRARIAN.md (flattened)',
    what: 'RETIRED_CLAIMS as a whole — sentences pinned ABSENT from live code',
    movedBy: null,
    ruling: '⛔ AUTHORISED BY NOTHING IN THIS PHASE',
    why: '⛔ THIS IS A BAN REGISTER AND THE ONLY LEGAL DIRECTION IS ADD. ' +
      'This phase puts sentences INTO it (a claim the owner retires stays ' +
      'retired) and takes none out. Its ninth entry is the Manage ' +
      'disclosure retired on the owner\'s own ruling, and it is the first ' +
      'ban in the list that is not about money — it is false about WHO ' +
      'READS HER THINGS, which is the one subject this product may never be ' +
      'wrong about. A later wave that finds this red has re-introduced a ' +
      'banned sentence; it has not found a pin to amend. \u2705 26.99-10 ' +
      'ADDED THE TWELFTH, and it is the first ban in the register whose ' +
      'file is a DOCUMENT rather than source \u2014 LIBRARIAN.md\'s ' +
      'superseded billing sentence, falsified by D-04\'s forecast. Its ' +
      'source is the WHITESPACE-FLATTENED document, because the document ' +
      'is hard-wrapped and the sentence straddles three lines; a ' +
      'comment-strip would be meaningless on prose and a raw indexOf would ' +
      'miss it. \u26a0 THIS INSTRUMENT PAIR HAD TO LEARN THE THIRD FILE: a ' +
      'register that grew a file while its inventory knew two would report ' +
      'the growth as a defect, which is the inventory measuring itself.',

    lift: function () {
      const gate = readSource('tests/test_no_push.cjs');
      const span = liftSpan(gate, 'const RETIRED_CLAIMS = [', /^\s*\];\s*$/,
        'test_no_push.cjs RETIRED_CLAIMS');
      const claims = evalLiteral(span, 'test_no_push.cjs RETIRED_CLAIMS');
      if (!claims.length) {
        throw new Error('RETIRED_CLAIMS lifted EMPTY — an empty ban ' +
          'register bans nothing and would pass every check below');
      }
      return { claims: claims, span: span };
    },

    // A — a grep. ⚠ THE SUBJECT IS THE REGISTER'S SOURCE SPAN, NOT ITS
    // VALUES, and the difference is a real trap this instrument walked into
    // on its first run: RETIRED_CLAIMS's entries are written as CONCATENATED
    // FRAGMENTS across hard-wrapped lines, so the joined sentence never
    // appears contiguously anywhere in the file — grepping for the value
    // reported four "missing" bans that are all perfectly present. So the
    // grep asserts what a grep can honestly assert here: the whole register
    // still stands in COMMENT-STRIPPED gate code (a register commented out
    // bans nothing), and no entry has been blanked or thinned into a ban
    // that cannot bind.
    grep: function (lifted) {
      const gate = stripJsComments(readSource('tests/test_no_push.cjs'));
      if (gate.indexOf(lifted.span) === -1) {
        return 'the RETIRED_CLAIMS register no longer stands in live gate ' +
          'code — it has been commented out, reflowed away, or removed';
      }
      const thin = lifted.claims.filter(function (c) {
        return !c || typeof c.s !== 'string' || c.s.length < 12 ||
          BAN_FILES.indexOf(c.file) === -1;
      });
      return thin.length === 0
        ? null
        : thin.length + ' of ' + lifted.claims.length + ' ban(s) are ' +
          'blanked, too thin to ban anything, or point at no known file';
    },

    // B — a planted violation, one per ban: each banned sentence is appended
    // back into a copy of the very file it was removed from, and the gate's
    // own predicate ("present => violation") must name it. A ban nobody can
    // trip is a ban in name only.
    plant: function (lifted) {
      const claims = lifted.claims;
      const predicate = function (sources) {
        const out = [];
        claims.forEach(function (c) {
          if (sources[c.file].indexOf(c.s) !== -1) { out.push(c.file); }
        });
        return out;
      };
      const real = {
        'app.js': stripJsComments(readSource('app.js')),
        'server.py': stripPyComments(readSource('server.py')),
        'LIBRARIAN.md': flattenDoc(readSource('LIBRARIAN.md'))
      };
      if (predicate(real).length !== 0) {
        return 'the control failed: a RETIRED claim is standing in live ' +
          'source right now (' + predicate(real).join(', ') + ')';
      }
      const missed = [];
      claims.forEach(function (c) {
        const copy = {
          'app.js': real['app.js'],
          'server.py': real['server.py'],
          'LIBRARIAN.md': real['LIBRARIAN.md']
        };
        if (!(c.file in copy)) { missed.push(c.file + ' (unknown file)'); return; }
        copy[c.file] = copy[c.file] + '\n' + c.s + '\n';
        if (copy[c.file] === real[c.file]) {
          missed.push(c.file + ' (the plant changed nothing)');
          return;
        }
        if (predicate(copy).length === 0) {
          missed.push(JSON.stringify(c.s.slice(0, 34)) + '…');
        }
      });
      return missed.length === 0
        ? null
        : 'PLANTED VIOLATION NOT CAUGHT for ' + missed.length + ' of ' +
          claims.length + ' ban(s): ' + missed.join(' | ');
    }
  },

  // -- 4 ---------------------------------------------------------------------
  {
    id: 'display-fence-dollar-literal',
    gate: 'tests/test_display_fence.cjs',
    subject: 'renderLibrarianProgress + renderLibrarianRunState (app.js)',
    what: 'the dollar-sign-literal rule of the cost-line drill',
    movedBy: null,
    ruling: '⛔ NOT AUTHORISED TO MOVE — D-04 / L-05',
    why: '⛔ D-04 puts ONE dollar figure on ONE surface, once, before the ' +
      'expensive action. That does NOT authorise re-cutting this rule: per ' +
      'L-05 the forecast must PROVE it renders OUTSIDE the two renders this ' +
      'rule is scoped to (the gate records that scope itself, and one of ' +
      'its own controls is a non-detection in a neighbouring function). A ' +
      'plan that widens this rule\'s scope to make room for the forecast has ' +
      'moved the gate instead of siting the feature.',

    lift: function () {
      const gate = readSource('tests/test_display_fence.cjs');
      const rules = evalLiteral(
        liftSpan(gate, 'const RULES = [', /^\s*\];\s*$/,
          'test_display_fence.cjs RULES'),
        'test_display_fence.cjs RULES');
      const picked = rules.filter(function (r) {
        return /dollar-sign literal/.test(String(r.name));
      });
      if (picked.length !== 1) {
        throw new Error('the cost-line drill holds ' + picked.length +
          ' dollar-literal rule(s), not 1');
      }
      return picked[0].re;
    },

    // A — a grep: the regex the drill actually runs is still written in live
    // gate code, in its own source form. ⛔ Never retyped — it is stringified
    // from the value lifted out of the file.
    grep: function (re) {
      const gate = stripJsComments(readSource('tests/test_display_fence.cjs'));
      return gate.indexOf(String(re)) !== -1
        ? null
        : 'the dollar-literal regex ' + String(re) + ' is no longer written ' +
          'in live gate code — the pin has VANISHED';
    },

    // B — a planted violation: a render body carrying the exact defect the
    // rule exists to catch (a currency literal built from a price field),
    // plus a NEGATIVE CONTROL — a clean body the rule must NOT match, so the
    // instrument cannot be satisfied by a regex that matches everything.
    //
    // ⚠ THE PLANTED SUBJECT IS SYNTHETIC, AND THAT IS THE HONEST SCOPE OF
    // THIS ROW: it proves the RULE has teeth. That the rule is applied to
    // exactly the two renders — and to no neighbour — is the gate's own
    // claim, proved by the gate's own three controls, and this row does not
    // restate it.
    plant: function (re) {
      const planted = "    var amount = '$' + Number(snap.total || 0)" +
        '.toFixed(2);';
      const clean = "    var line = 'sorting - batch ' + n + ' of ' + all;";
      if (re.test(clean)) {
        return 'the negative control failed: the rule matches a body that ' +
          'carries no currency literal at all';
      }
      return re.test(planted)
        ? null
        : 'PLANTED VIOLATION NOT CAUGHT — a render body carrying a dollar ' +
          'literal did not trip the rule that exists to catch it';
    }
  },

  // -- 5 ---------------------------------------------------------------------
  {
    id: 'display-fence-cost-usd',
    gate: 'tests/test_display_fence.cjs',
    subject: 'renderLibrarianProgress + renderLibrarianRunState (app.js)',
    what: 'the `cost_usd` rule of the cost-line drill',
    movedBy: null,
    ruling: '⛔ NOT AUTHORISED TO MOVE — D-04 / L-05',
    why: '⛔ D-01 is the reason this one is the harder of the pair to argue ' +
      'away: the record file is TOKENS, NEVER DOLLARS, and a stored dollar ' +
      'figure is a price-table snapshot wearing a fact\'s clothes. The ' +
      'forecast is computed FOR DISPLAY AND NEVER STORED, which is a ' +
      'constraint on the forecast rather than a licence to re-cut this rule.',

    lift: function () {
      const gate = readSource('tests/test_display_fence.cjs');
      const rules = evalLiteral(
        liftSpan(gate, 'const RULES = [', /^\s*\];\s*$/,
          'test_display_fence.cjs RULES'),
        'test_display_fence.cjs RULES');
      const picked = rules.filter(function (r) {
        return /price the seam no longer sends/.test(String(r.name));
      });
      if (picked.length !== 1) {
        throw new Error('the cost-line drill holds ' + picked.length +
          ' price-field rule(s), not 1');
      }
      return picked[0].re;
    },

    grep: function (re) {
      const gate = stripJsComments(readSource('tests/test_display_fence.cjs'));
      return gate.indexOf(String(re)) !== -1
        ? null
        : 'the price-field regex ' + String(re) + ' is no longer written in ' +
          'live gate code — the pin has VANISHED';
    },

    plant: function (re) {
      const planted = '    var snapshot = { total: run.cost_usd || 0 };';
      const clean = '    var snapshot = { tokens_in: run.in, tokens_out: ' +
        'run.out };';
      if (re.test(clean)) {
        return 'the negative control failed: the rule matches a body that ' +
          'reads only token counts';
      }
      return re.test(planted)
        ? null
        : 'PLANTED VIOLATION NOT CAUGHT — a render body reading the price ' +
          'field did not trip the rule that exists to catch it';
    }
  },

  // -- 6 ---------------------------------------------------------------------
  {
    id: 'disclosure-locality-ban',
    gate: 'tests/test_disclosure_truth.cjs',
    subject: 'LIBRARIAN.md',
    what: 'the forbidden locality claim — an overclaim banned outright',
    movedBy: null,
    ruling: '⛔ NOT AUTHORISED TO MOVE — D-08',
    why: '⛔ "NOTHING LEAVES THIS MACHINE" IS NOT CLAIMED, and this ban is ' +
      'NOT re-cut. A loopback address does not prove locality — from inside ' +
      'the server, an Ollama port and a proxy that forwards to the cloud are ' +
      'indistinguishable. ⚠ THIS MATTERS MORE AFTER THE REBUILD, NOT LESS: ' +
      'the room now has a genuinely local provider, so the temptation to ' +
      'claim locality is strongest exactly where the claim stays ' +
      'unverifiable. The gate\'s own note records why it refuses to be ' +
      '"improved" into a scoped version — a scoped predicate would have to ' +
      'span the hard wrap, and one that spans the wrap fails OPEN.',

    lift: function () {
      const gate = readSource('tests/test_disclosure_truth.cjs');
      const forbidden = evalLiteral(
        liftSpan(gate, 'const FORBIDDEN = [', /^\s*\];\s*$/,
          'test_disclosure_truth.cjs FORBIDDEN'),
        'test_disclosure_truth.cjs FORBIDDEN');
      const picked = forbidden.filter(function (f) {
        return /never leave/.test(String(f.re));
      });
      if (picked.length !== 1) {
        throw new Error('the overclaim register holds ' + picked.length +
          ' locality ban(s), not 1');
      }
      return picked[0].re;
    },

    grep: function (re) {
      const gate = stripJsComments(
        readSource('tests/test_disclosure_truth.cjs'));
      return gate.indexOf(String(re)) !== -1
        ? null
        : 'the locality ban ' + String(re) + ' is no longer written in live ' +
          'gate code — the pin has VANISHED';
    },

    // B — a planted violation against the REAL subject: the banned sentence
    // is appended to a copy of LIBRARIAN.md and the ban must trip. The
    // control is the shipped document itself, which must be clean today.
    plant: function (re) {
      const real = readSource('LIBRARIAN.md');
      if (re.test(real)) {
        return 'the control failed: LIBRARIAN.md carries the banned ' +
          'locality claim RIGHT NOW';
      }
      const mutated = real + '\n\nthe local rung means your words never ' +
        'leave this room.\n';
      return re.test(mutated)
        ? null
        : 'PLANTED VIOLATION NOT CAUGHT — the banned locality claim was ' +
          'appended to a copy of the document and the ban stayed silent';
    }
  }
];

// ===========================================================================
// ---- THE RUN, AND ITS COUNT PINNED BY VALUE -------------------------------
//
// ⚠ A RUN THAT EXAMINED ZERO ROWS MUST FAIL, NOT PASS (B-3). There is no
// runner here, so an empty register, a renamed row, a loop that never entered
// and a suite that threw before it started all LOOK the same from outside —
// they print nothing and exit 0. So the counts are literals, they are checked
// against each other, and the OK line states them BY VALUE.

const EXAMINED_ROWS = 6;
const EXAMINED_INSTRUMENTS = 12;   // 6 rows x 2 instruments of different kinds

const EXPECTED_IDS = [
  'ceiling-byte-pin',
  'doc-anchor-billing',
  'retired-claims-ban-register',
  'display-fence-dollar-literal',
  'display-fence-cost-usd',
  'disclosure-locality-ban'
];

strippersMatchTheShippedOnes();

let ranRows = 0;
let ranInstruments = 0;
const ranIds = [];
const lines = [];

PHASE_PINS.forEach(function (row) {
  ranRows++;
  ranIds.push(row.id);

  let lifted = null;
  try {
    lifted = row.lift();
  } catch (e) {
    failures.push('[' + row.id + '] the lift failed: ' + e.message +
      ' — every pin in this register is READ OUT OF ITS GATE AT RUN TIME, ' +
      'so a lift that fails is a gate that has changed shape underneath ' +
      'this inventory');
  }

  [['A/grep', 'grep'], ['B/planted-violation', 'plant']].forEach(function (k) {
    ranInstruments++;
    if (lifted === null) {
      failures.push('[' + row.id + '] instrument ' + k[0] +
        ' could not run — nothing was lifted');
      return;
    }
    let verdict;
    try {
      verdict = row[k[1]](lifted);
    } catch (e) {
      verdict = 'threw: ' + e.message;
    }
    if (verdict) {
      failures.push('[' + row.id + '] instrument ' + k[0] + ': ' + verdict);
    }
  });

  lines.push('  ' + row.id + '  |  ' + row.gate + '  |  may be moved by: ' +
    (row.movedBy === null ? '⛔ NO PLAN IN 26.99' : row.movedBy) +
    '  |  ruling: ' + row.ruling);
});

// ---- the count checks -----------------------------------------------------

if (PHASE_PINS.length !== EXAMINED_ROWS) {
  failures.push('[registry] the register holds ' + PHASE_PINS.length +
    ' row(s) — pinned BY VALUE at exactly ' + EXAMINED_ROWS +
    '. A row deleted shrinks this inventory and its own count together.');
}
if (ranRows !== EXAMINED_ROWS || ranRows === 0) {
  failures.push('[registry] ' + ranRows + ' row(s) ran — expected exactly ' +
    EXAMINED_ROWS + ', and never zero (B-3).');
}
if (ranInstruments !== EXAMINED_INSTRUMENTS || ranInstruments === 0) {
  failures.push('[registry] ' + ranInstruments + ' instrument(s) ran — ' +
    'expected exactly ' + EXAMINED_INSTRUMENTS + ', and never zero (B-3).');
}
if (EXAMINED_INSTRUMENTS !== PHASE_PINS.length * 2) {
  failures.push('[registry] the instrument total ' + EXAMINED_INSTRUMENTS +
    ' is not two per row over ' + PHASE_PINS.length + ' row(s) — every row ' +
    'owes a grep AND a planted violation, and a row carrying only one of ' +
    'them is the 26.93 inventory that agreed with itself (B-7).');
}
if (JSON.stringify(ranIds) !== JSON.stringify(EXPECTED_IDS)) {
  failures.push('[registry] the rows that ran are ' + JSON.stringify(ranIds) +
    ' — expected exactly ' + JSON.stringify(EXPECTED_IDS) +
    '. Contents are pinned as well as count, because a count alone is ' +
    'satisfied by a rename.');
}

// ---- verdict --------------------------------------------------------------

if (failures.length) {
  console.error('test_2699_pins FAILED — ' + failures.length +
    ' violation(s) across ' + ranRows + ' row(s) / ' + ranInstruments +
    ' instrument(s):');
  failures.forEach(function (f) { console.error('  ' + f); });
  process.exit(1);
}

console.log('PHASE 26.99 — the pins this phase can falsify, and who may move them:');
lines.forEach(function (l) { console.log(l); });
console.log('test_2699_pins OK — ' + ranRows + '/' + EXAMINED_ROWS +
  ' pin rows examined, ' + ranInstruments + '/' + EXAMINED_INSTRUMENTS +
  ' instruments run (a grep AND a planted violation per row)');
process.exit(0);
