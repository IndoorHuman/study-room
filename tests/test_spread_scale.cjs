/*
 * tests/test_spread_scale.cjs — the reading spread's geometry, with a boundary
 * contract that would have caught a 13px miss (Phase 26.88, Plan 18).
 *
 * WHY THIS FILE EXISTS. The blocking owner UAT (26.88-15, F-8) measured
 * `#spread-scroll` clientHeight **298px** against scrollHeight **4394px** — the
 * owner was reading under 7% of a note at a time, and said so: *"the image is
 * too small to read, actually the entire window is too small for the image to
 * display."*
 *
 * The cause is a QUANTISATION CLIFF, not a wrong constant. `fitSpreadScale`
 * moved only in HALF steps (26.5-09 UAT F10), so the reading region was 300px
 * at k=1 and 450px at k=1.5 and nothing in between. Her viewport was 1680x659;
 * the height term was 1.4699; the half-step floor took it to 1.0. **She was
 * thirteen pixels short.** Thirteen pixels of browser chrome cost her a third of
 * the reading area, silently, with no feedback and no fallback.
 *
 * The finding is not that 300px is wrong. It is that the function has a cliff.
 *
 * WHY THE ARITHMETIC HAD TO MOVE INTO core.js FIRST. Executors on this project
 * cannot run a browser, so a formula that only exists inside a DOM function is a
 * formula nobody can gate — which is exactly how a 150px cliff shipped through
 * an owner UAT and seven plans. `CORE.spreadScales` is that formula, pure, and
 * every case below asks the SHIPPED function rather than a simulation of it.
 *
 * The cases:
 *   G1   no cliff — max adjacent scrollH delta over a 1000-step scan <= 2px
 *   G2   monotone and growing (the counterweight that a CONSTANT fails)
 *   G3   the half-step NO-OP, all eleven values, at k = 1, 1.5, 2, 2.5, 3
 *   G4   26.5's art contract — kFrame is the shipped half-step expression
 *   G5   the owner's viewport: kFrame still 1.0, scrollH 300px -> 441px
 *   G6   the 13px boundary, one step either side              (SRM-02 boundary)
 *   G7   the clamp: an already-overflowing viewport gains not one pixel
 *   G8   precision — kInterior is NEVER rounded; kFrame always a half step
 *   G9   degenerate viewports and an :empty ribbon              (SRM-0x empty)
 *   G10  determinism — the whole scan twice                  (SRM-0x ordering)
 *   G11  the ribbon's relationship to the reading region is unchanged
 *   G12  width is untouched — this plan changes nothing horizontal
 *   G13  the upper clamp never changes the RETURNED geometry
 *   G14  the DOM applier DELEGATES and keeps no scale arithmetic  (task 2)
 *   G15  the stylesheet pins the frame to the frame scale         (task 2)
 *
 * Stdlib only (assert / fs / path) plus ../core.js — the zero-dependency law.
 * No package manager, no test framework, no new vendored byte.
 *
 * Every assertion carries a BECAUSE clause naming the decision it protects
 * (the tests/test_cleaning_writer.py convention).
 *
 * Run contract: every case name is printed as it passes, then ONE OK line, exit
 * 0. On failure every violation is listed with its case name and a reason, then
 * exit 1. Every path resolves through the CommonJS resolver relative to this
 * file, so the runner's cwd never matters.
 *
 * HONESTY LABEL: these thirteen cases prove the cliff is gone, the art is
 * unstretched, the clamp never moves the returned geometry, and a half-step
 * viewport is byte-identical. **No node test can tell you whether a page
 * extending below a drawn book frame LOOKS right.** They say nothing whatsoever
 * about whether the owner likes it. Only her blocking verdict (SC-7, plan 20)
 * is evidence for that.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = require(path.join(ROOT, 'core.js'));

const passed = [];
const failures = [];

function testCase(name, fn) {
  try {
    fn();
    passed.push(name);
  } catch (err) {
    failures.push({ name: name, reason: err && err.message ? err.message :
      String(err) });
  }
}

// ---- the independently written references ------------------------------------
//
// These are TRANSCRIBED FROM app.js's shipped expression and from 26.5's
// SPREAD_INTERIOR rect, NOT read out of the function under test. A gate that
// reads its reference value out of the thing it is asserting is the plan-11
// `vm`-simulation defect, and this phase has it on the record.

const RIBBON = 40;                 // a realistic one-row verdict ribbon
const SCAN_W = 1680;               // the owner's own innerWidth
const SCAN_H_LO = 400;
const SCAN_H_HI = 1400;            // inclusive -> 1001 points, 1000 adjacent steps
const WSCAN_LO = 400;
const WSCAN_HI = 2600;             // inclusive -> 2201 points
const WSCAN_H = 900;

// app.js:2108 as it shipped, re-typed here rather than imported.
function shippedKFrame(iw, ih) {
  return Math.max(1, Math.floor(Math.min(
    (iw - 24) / 768,
    (ih - 24) / 432) * 2) / 2);
}

// The two viewport terms, unquantised. `freeFit` is NOT one of the eleven
// returned values and must never become a twelfth — see the plan's prohibition.
function shippedFreeFit(iw, ih) {
  return Math.min((iw - 24) / 768, (ih - 24) / 432);
}

// The WHOLE shipped geometry — 26.5's spread as it stood at b251e5a. G3 asserts
// byte-identity against this at every half step.
function shippedGeometry(iw, ih, rh) {
  const k = shippedKFrame(iw, ih);
  return {
    kFrame: k,
    kInterior: k,
    frameW: 768 * k,
    frameH: 432 * k,
    stageW: 768 * k,
    stageH: 432 * k,
    scrollLeft: 72 * k,
    scrollTop: 84 * k,
    scrollW: 624 * k,
    scrollH: 300 * k,
    scrollPadBottom: rh ? rh + 16 : 16
  };
}

const RETURN_KEYS = ['kFrame', 'kInterior', 'frameW', 'frameH', 'stageW',
  'stageH', 'scrollLeft', 'scrollTop', 'scrollW', 'scrollH', 'scrollPadBottom'];

function heightScan() {
  const out = [];
  for (let h = SCAN_H_LO; h <= SCAN_H_HI; h++) {
    out.push({ iw: SCAN_W, ih: h, g: CORE.spreadScales(SCAN_W, h, RIBBON) });
  }
  return out;
}

function widthScan() {
  const out = [];
  for (let w = WSCAN_LO; w <= WSCAN_HI; w++) {
    out.push({ iw: w, ih: WSCAN_H, g: CORE.spreadScales(w, WSCAN_H, RIBBON) });
  }
  return out;
}

const HSCAN = heightScan();
const WSCAN = widthScan();

// comment-stripped source, for the two task-2 source gates
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');
}

// ---- G1: no cliff ------------------------------------------------------------

testCase('G1 no cliff: the max adjacent scrollH delta over 1000 steps is <= 2px',
  () => {
    let maxDelta = 0;
    let at = 0;
    for (let i = 1; i < HSCAN.length; i++) {
      const d = Math.abs(HSCAN[i].g.scrollH - HSCAN[i - 1].g.scrollH);
      if (d > maxDelta) { maxDelta = d; at = HSCAN[i].ih; }
    }
    // BECAUSE F-8: thirteen pixels of browser chrome cost the owner a third of
    // her reading area. The predicate is not "her viewport is better" — it is
    // that NO 1px change of viewport may move the reading region by more than
    // 2px, anywhere in the scanned range. Derivation of the 2px band: the
    // interior scale is unquantised, so 1px of innerHeight moves it by 1/432
    // and the interior height by 300/432 = 0.69px; 2px allows for the frame
    // scale stepping and the clamp engaging in the same increment.
    assert.ok(maxDelta <= 2,
      'G1 the reading region jumps ' + maxDelta.toFixed(3) + 'px between ' +
      'innerHeight ' + (at - 1) + ' and ' + at + ' — the half-step cliff is ' +
      'still there (band 0-2px)');
  });

// ---- G2: monotone and growing (G1's counterweight) ---------------------------

testCase('G2 monotone and growing: a CONSTANT reading height cannot pass this',
  () => {
    const bad = [];
    for (let i = 1; i < HSCAN.length; i++) {
      if (HSCAN[i].g.scrollH < HSCAN[i - 1].g.scrollH - 1e-9) {
        bad.push(HSCAN[i].ih);
      }
    }
    // BECAUSE a function returning a CONSTANT reading height has a max adjacent
    // delta of 0 and satisfies G1 outright. G1 alone is not a gate; this is the
    // half that makes the pair one. Mutation 1 drives exactly this case red.
    assert.deepStrictEqual(bad.slice(0, 8), [],
      'G2 scrollH DECREASED at innerHeight ' + bad.slice(0, 8).join(', ') +
      ' — a taller viewport must never give a shorter page');
    assert.ok(HSCAN[HSCAN.length - 1].g.scrollH > HSCAN[0].g.scrollH,
      'G2 scrollH(' + SCAN_H_HI + ') = ' + HSCAN[HSCAN.length - 1].g.scrollH +
      ' is not greater than scrollH(' + SCAN_H_LO + ') = ' +
      HSCAN[0].g.scrollH + ' — the region does not grow at all');
  });

// ---- G3: the half-step no-op -------------------------------------------------

testCase('G3 the half-step NO-OP: all eleven values byte-identical at k = 1, ' +
  '1.5, 2, 2.5, 3', () => {
    // Each fixture chooses its OWN innerWidth. `freeFit` is the min of a width
    // term and a height term, so a fixture must satisfy BOTH: innerHeight =
    // 432k + 24 puts the height term exactly on k, and innerWidth = 768k + 24
    // keeps the width term from capping below it. At the scan's innerWidth of
    // 1680 the width term caps freeFit at 2.15625, so k = 2.5 and k = 3 are
    // UNREACHABLE there and asserting them at 1680 is a FALSE RED on a correct
    // implementation.
    const fixtures = [
      { k: 1, iw: 792, ih: 456 },
      { k: 1.5, iw: 1176, ih: 672 },   // the owner's boundary
      { k: 2, iw: 1560, ih: 888 },
      { k: 2.5, iw: 1944, ih: 1104 },
      { k: 3, iw: 2328, ih: 1320 }
    ];
    let equalities = 0;
    for (const f of fixtures) {
      const got = CORE.spreadScales(f.iw, f.ih, RIBBON);
      const want = shippedGeometry(f.iw, f.ih, RIBBON);
      assert.strictEqual(got.kFrame, f.k,
        'G3 fixture ' + f.iw + 'x' + f.ih + ' was built for kFrame ' + f.k +
        ' and produced ' + got.kFrame + ' — the fixture, not the code, is wrong');
      for (const key of RETURN_KEYS) {
        // BECAUSE 26.5-09 UAT F10 was the OWNER'S OWN live decision: a viewport
        // that was already correct must not move by one pixel. At equality the
        // whole computation is a no-op and every emitted pixel is byte-identical
        // to the shipped geometry.
        assert.strictEqual(got[key], want[key],
          'G3 at k = ' + f.k + ' (' + f.iw + 'x' + f.ih + ') ' + key +
          ' is ' + got[key] + ', shipped is ' + want[key] +
          ' — a half-step viewport MOVED');
        equalities++;
      }
      assert.strictEqual(got.kInterior, got.kFrame,
        'G3 at k = ' + f.k + ' the two scales must MERGE, not collide');
      assert.strictEqual(got.stageH, 432 * got.kFrame,
        'G3 at k = ' + f.k + ' stageH must be exactly 432 * kFrame');
      assert.strictEqual(got.scrollPadBottom, RIBBON + 16,
        'G3 at k = ' + f.k + ' scrollPadBottom must be fitSpreadRibbonPad`s ' +
        'own arithmetic, byte for byte');
    }
    assert.strictEqual(equalities, 55,
      'G3 asserted ' + equalities + ' equalities, expected 55 (5 fixtures x ' +
      '11 returned values)');
  });

// ---- G4: 26.5's art contract -------------------------------------------------

testCase('G4 26.5`s art contract: kFrame is the shipped half-step expression ' +
  'at all 1001 scan points, and the frame never stretches', () => {
    let agreements = 0;
    const bad = [];
    for (const p of HSCAN) {
      const want = shippedKFrame(p.iw, p.ih);
      if (p.g.kFrame !== want || p.g.frameH !== 432 * want ||
          p.g.frameW !== 768 * want) {
        bad.push(p.ih + ': kFrame ' + p.g.kFrame + ' vs ' + want +
          ', frameH ' + p.g.frameH + ' vs ' + (432 * want));
      } else {
        agreements++;
      }
    }
    // BECAUSE 26.5-09 F10: the frame art is a 2x2-block PNG, so the art-pixel
    // scale is 2k and stays whole at every half step. A stage that grew must
    // never have grown the art. This is asserted BY VALUE against an
    // independently written copy of the shipped expression, not by reading the
    // same code twice.
    assert.deepStrictEqual(bad.slice(0, 5), [],
      'G4 the frame scale left 26.5`s contract at ' + bad.length +
      ' point(s): ' + bad.slice(0, 5).join(' | '));
    assert.strictEqual(agreements, 1001,
      'G4 agreed at ' + agreements + ' of 1001 points — band is 1001/1001');
  });

// ---- G5: the owner's viewport ------------------------------------------------

testCase('G5 the owner`s viewport 1680x659: kFrame still 1.0, scrollH 441px ' +
  '(was 300px)', () => {
    const g = CORE.spreadScales(1680, 659, RIBBON);
    // BECAUSE the frame's half step is 26.5's and is NOT being re-opened: at
    // her viewport kFrame is 1.0 today and must still be 1.0 after this plan.
    assert.strictEqual(g.kFrame, 1,
      'G5 kFrame at the owner`s viewport is ' + g.kFrame + ', must be 1.0 — ' +
      'the FRAME keeps its half step; only the interior is freed');
    // BECAUSE F-8: U = 635, freeFit = 1.46990741, clampMax = 1.67666,
    // kInterior = 1.46990741, scrollH = 440.97. Band 435-445; outside = STOP.
    assert.ok(g.scrollH >= 435 && g.scrollH <= 445,
      'G5 scrollH at 1680x659 is ' + g.scrollH.toFixed(3) +
      'px, outside the 435-445 band (today`s value is 300px)');
    assert.strictEqual(g.stageH, g.scrollTop + g.scrollH + 48 * g.kFrame,
      'G5 the stage must be the interior`s top and bottom insets at the FRAME ' +
      'scale around the interior at its own scale');
  });

// ---- G6: the 13px boundary ---------------------------------------------------

testCase('G6 the 13px boundary: scrollH(671) and scrollH(672) differ by at ' +
  'most 2px', () => {
    const a = CORE.spreadScales(1680, 671, RIBBON).scrollH;
    const b = CORE.spreadScales(1680, 672, RIBBON).scrollH;
    const c = CORE.spreadScales(1680, 673, RIBBON).scrollH;
    // BECAUSE this is the exact miss F-8 recorded: 672 is the k=1.5 threshold
    // and her 659 was thirteen pixels short of it. Today this pair differs by
    // 150px. Stated as a boundary RULE, not as a fact about one viewport.
    assert.ok(Math.abs(b - a) <= 2,
      'G6 scrollH(671) = ' + a.toFixed(3) + ' and scrollH(672) = ' +
      b.toFixed(3) + ' differ by ' + Math.abs(b - a).toFixed(3) +
      'px — this is the 150px cliff that cost the owner a third of her page');
    assert.ok(c >= b,
      'G6 scrollH(673) = ' + c.toFixed(3) + ' is below scrollH(672) = ' +
      b.toFixed(3));
  });

// ---- G7: the clamp -----------------------------------------------------------

testCase('G7 the clamp: an already-overflowing viewport gains not one pixel',
  () => {
    const g = CORE.spreadScales(1680, 300, RIBBON);
    // BECAUSE T-26.88-53: a viewport where the frame ALREADY overflows must not
    // be made worse. freeFit is 0.6389 there, kFrame floors to 1, and the LOWER
    // clamp is what holds kInterior at 1. Mutation 2 (free-fractional interior
    // with no lower clamp) drives exactly this case red.
    assert.strictEqual(g.kInterior, g.kFrame,
      'G7 at innerHeight 300 kInterior is ' + g.kInterior + ' and kFrame is ' +
      g.kFrame + ' — the interior must not shrink below the frame');
    assert.strictEqual(g.stageH, 432 * g.kFrame,
      'G7 stageH is ' + g.stageH + ', must be exactly ' + (432 * g.kFrame) +
      ' — the change adds not one pixel of overflow to a viewport that was ' +
      'already overflowing');
  });

// ---- G8: precision -----------------------------------------------------------

testCase('G8 precision: kInterior is NEVER quantised; kFrame is always an ' +
  'exact half step at or above 1', () => {
    const g = CORE.spreadScales(1680, 659, RIBBON);
    // BECAUSE the whole defect is quantisation. The content region carries no
    // image-rendering (tokens.css:1360-1372 is the standing evidence), so a
    // sub-pixel interior height costs nothing. No floor, no round, no ceil, no
    // epsilon, no snapping.
    assert.strictEqual(g.kInterior.toFixed(6), (635 / 432).toFixed(6),
      'G8 kInterior at innerHeight 659 is ' + g.kInterior +
      ', expected 1.469907... unrounded to at least six decimal places');
    assert.ok(g.kInterior !== g.kFrame,
      'G8 kInterior equals kFrame at a viewport that is NOT on a half step — ' +
      'the interior is still riding the frame`s quantisation');
    const bad = [];
    for (const p of HSCAN.concat(WSCAN)) {
      if (p.g.kFrame < 1 || (p.g.kFrame * 2) % 1 !== 0) {
        bad.push(p.iw + 'x' + p.ih + ' -> ' + p.g.kFrame);
      }
      if (p.g.kInterior < p.g.kFrame) {
        bad.push(p.iw + 'x' + p.ih + ' kInterior ' + p.g.kInterior +
          ' below kFrame ' + p.g.kFrame);
      }
    }
    assert.deepStrictEqual(bad.slice(0, 5), [],
      'G8 ' + bad.length + ' point(s) broke the scale invariants: ' +
      bad.slice(0, 5).join(' | '));
  });

// ---- G9: degenerate inputs ---------------------------------------------------

testCase('G9 degenerate viewports and an :empty ribbon return a valid ' +
  'geometry and raise nothing', () => {
    const cases = [
      [0, 0], [-100, -100], [NaN, NaN], [Infinity, Infinity],
      [undefined, undefined], [null, null], [1680, 0], [0, 659],
      [100, 100]   // smaller than the frame
    ];
    for (const [w, h] of cases) {
      let g;
      // BECAUSE T-26.88-54 and SRM-01/02/03 [empty]: any width and height,
      // including zero, negative and non-finite, arrives from the browser.
      assert.doesNotThrow(() => { g = CORE.spreadScales(w, h, RIBBON); },
        'G9 spreadScales(' + w + ', ' + h + ') raised');
      assert.strictEqual(g.kFrame, 1,
        'G9 kFrame at (' + w + ', ' + h + ') is ' + g.kFrame + ', must be 1');
      assert.strictEqual(g.kInterior, 1,
        'G9 kInterior at (' + w + ', ' + h + ') is ' + g.kInterior +
        ', must be 1');
      for (const key of RETURN_KEYS) {
        assert.ok(isFinite(g[key]),
          'G9 ' + key + ' is ' + g[key] + ' at (' + w + ', ' + h + ')');
      }
    }
    // BECAUSE #spread-ribbon is `position: absolute; bottom: 12 * k` — an
    // OVERLAY that consumes no stage height. It is a term in NEITHER scale and
    // in stageH; the only value it can move is scrollPadBottom. Stated on the
    // RETURNED value, not as "contributes zero to the foot" — there is no foot.
    const empty = CORE.spreadScales(1680, 659, 0);
    const withBar = CORE.spreadScales(1680, 659, RIBBON);
    assert.strictEqual(empty.scrollPadBottom, 16,
      'G9 an :empty ribbon must give scrollPadBottom 16, byte-identical to ' +
      'fitSpreadRibbonPad; got ' + empty.scrollPadBottom);
    for (const key of RETURN_KEYS) {
      if (key === 'scrollPadBottom') { continue; }
      assert.strictEqual(empty[key], withBar[key],
        'G9 an absent ribbon moved ' + key + ' (' + empty[key] + ' vs ' +
        withBar[key] + ') — the ribbon is an overlay and must change NEITHER ' +
        'scale');
    }
  });

// ---- G10: determinism --------------------------------------------------------

testCase('G10 determinism: the whole scan run twice is identical', () => {
    // BECAUSE SRM-01/02/03 [ordering]: the same three inputs always return the
    // same eleven outputs. Asserted by running the whole scan twice.
    assert.strictEqual(JSON.stringify(heightScan()), JSON.stringify(HSCAN),
      'G10 the height scan is not deterministic');
    assert.strictEqual(JSON.stringify(widthScan()), JSON.stringify(WSCAN),
      'G10 the width scan is not deterministic');
  });

// ---- G11: the ribbon's relationship to the reading region --------------------

testCase('G11 the ribbon`s relationship to the reading region is unchanged at ' +
  'every scale', () => {
    const bad = [];
    for (const p of HSCAN.concat(WSCAN)) {
      // BECAUSE 26.5 gives the interior a 48*k bottom inset (432k - 84k - 300k)
      // and this plan keeps it at the FRAME scale at every interior scale. NOT
      // stated as `stageH >= scrollTop + scrollH + ribbonHeight + 12*kFrame`:
      // that inequality is FALSE of the shipped geometry (84+300+40+12 = 436 >
      // 432 at k=1) and would have made G3 and G11 contradictory. The ribbon
      // DOES overlap the scroll's last 4px today, by design, and
      // fitSpreadRibbonPad's padding-bottom is what clears the text.
      if (p.g.stageH !== p.g.scrollTop + p.g.scrollH + 48 * p.g.kFrame) {
        bad.push(p.iw + 'x' + p.ih + ': stageH ' + p.g.stageH + ' vs ' +
          (p.g.scrollTop + p.g.scrollH + 48 * p.g.kFrame));
      }
      if (p.g.scrollPadBottom !== RIBBON + 16) {
        bad.push(p.iw + 'x' + p.ih + ': scrollPadBottom ' +
          p.g.scrollPadBottom + ' vs ' + (RIBBON + 16));
      }
    }
    assert.deepStrictEqual(bad.slice(0, 5), [],
      'G11 the interior`s bottom inset or the ribbon pad moved at ' +
      bad.length + ' point(s): ' + bad.slice(0, 5).join(' | '));
  });

// ---- G12: width is untouched -------------------------------------------------

testCase('G12 width is untouched: scrollLeft, scrollW and stageW ride the ' +
  'FRAME scale everywhere', () => {
    const bad = [];
    for (const p of HSCAN.concat(WSCAN)) {
      const k = p.g.kFrame;
      if (p.g.scrollLeft !== 72 * k || p.g.scrollW !== 624 * k ||
          p.g.stageW !== 768 * k) {
        bad.push(p.iw + 'x' + p.ih);
      }
    }
    // BECAUSE the width term was 2.16 against the height term's 1.47 at the
    // owner's viewport: HEIGHT is the binding constraint and this plan changes
    // nothing horizontal. 26.5 D-04's ONE shared rect keeps its left and width.
    assert.deepStrictEqual(bad.slice(0, 5), [],
      'G12 horizontal geometry left the frame scale at ' + bad.length +
      ' point(s): ' + bad.slice(0, 5).join(', '));
  });

// ---- G13: the upper clamp never changes the RETURNED geometry ----------------

testCase('G13 the upper clamp never moves the number the DOM receives — ' +
  '3202 of 3202 agreements', () => {
    let agreements = 0;
    const bad = [];
    for (const p of HSCAN.concat(WSCAN)) {
      // `freeFit` comes from an INDEPENDENTLY WRITTEN copy of the shipped two
      // terms, exactly as G4 does for kFrame. It is not one of the eleven
      // returned values and must never become a twelfth: a gate that reads its
      // reference value out of the function it is asserting is the plan-11
      // `vm`-simulation defect.
      const want = Math.max(p.g.kFrame, shippedFreeFit(p.iw, p.ih));
      if (p.g.kInterior !== want) {
        bad.push(p.iw + 'x' + p.ih + ': kInterior ' + p.g.kInterior +
          ' vs max(kFrame ' + p.g.kFrame + ', freeFit ' +
          shippedFreeFit(p.iw, p.ih).toFixed(6) + ') = ' + want);
      } else {
        agreements++;
      }
    }
    // BECAUSE THAT IS WHAT `inert` MEANS FOR A CLAMP: not that it never enters
    // the `min`, but that it never moves the number the DOM receives. BOTH
    // regimes, because an earlier draft of this gate asserted only the first
    // and was RED on arrival at 56 points.
    //   (a) freeFit >= kFrame: stageH = 132kF + 300kI <= 432kI <= 432*(U/432)
    //       = U, so the stage fits by construction and clampMax >= freeFit.
    //   (b) freeFit <  kFrame: exactly freeFit < 1, because kFrame is FLOORED
    //       AT 1. clampMax genuinely CAN be the smaller term inside the `min`
    //       (innerHeight 400..455 at innerWidth 1680 — 56 of the 1001 height
    //       points) and is then overridden by max(kFrame, ...), so the RETURNED
    //       value is unchanged. That is G7, and it is today's behaviour.
    // The clamp therefore ships as a documented FAIL-SAFE. This case is what
    // stops a future reader deleting it as dead code without meeting the
    // identity. Mutation 4 proves the assertion is not vacuous.
    assert.deepStrictEqual(bad.slice(0, 5), [],
      'G13 the clamp CHANGED the returned geometry at ' + bad.length +
      ' point(s) — investigate as a geometry-model error before anything ' +
      'else: ' + bad.slice(0, 5).join(' | '));
    assert.strictEqual(agreements, 3202,
      'G13 agreed at ' + agreements + ' of 3202 points (1001 height + 2201 ' +
      'width) — band is 3202/3202');
  });

// ---- G14: the DOM applier delegates and keeps no arithmetic (task 2) ---------

testCase('G14 the spread fitter DELEGATES: it calls the exported helper and ' +
  'declares no scale arithmetic of its own', () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'app.js'),
      'utf8'));
    const fns = ['fitSpreadScale', 'fitSpreadRibbonPad'];
    for (const name of fns) {
      const start = src.indexOf('function ' + name + '(');
      assert.ok(start >= 0, 'G14 ' + name + ' is not in app.js at all');
      // brace-match the body so the gate reads THIS function and not its
      // neighbours
      const open = src.indexOf('{', start);
      let depth = 0;
      let end = open;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') { depth++; }
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      const body = src.slice(open, end + 1);
      // BECAUSE a source gate that only checks the helper is CALLED passes
      // while the old arithmetic is still sitting there beside it. Mutation 2
      // is exactly that, and it is the load-bearing one.
      assert.ok(/StudyCore\.spreadScales\s*\(/.test(body),
        'G14 ' + name + ' does not call StudyCore.spreadScales — the ' +
        'delegation is not real');
      const forbidden = [
        ['Math.floor', 'the half-step floor'],
        ['Math.min', 'the min of the two viewport terms'],
        ['Math.max', 'the floor-at-1 clamp'],
        ['768', 'the frame canvas width'],
        ['432', 'the frame canvas height'],
        ['300', 'the interior height'],
        ['+ 16', 'fitSpreadRibbonPad`s own arithmetic'],
        ['- 24', 'the viewport margin']
      ];
      for (const [token, what] of forbidden) {
        assert.ok(body.indexOf(token) === -1,
          'G14 ' + name + ' still contains `' + token + '` (' + what + ') — ' +
          'every number it writes must come from the returned object, or the ' +
          'geometry has two spellings again');
      }
    }
    // BECAUSE the geometry is EVENT-DRIVEN ONLY (spread open + window resize):
    // a third caller would make it something else. Band 2-2.
    const callers = (src.match(/fitSpreadScale\b/g) || []).length;
    assert.strictEqual(callers, 3,
      'G14 fitSpreadScale appears ' + callers + ' times in app.js (1 ' +
      'declaration + exactly 2 call sites expected) — a third caller would ' +
      'make the geometry non-event-driven');
  });

// ---- G15: the stylesheet pins the frame to the frame scale (task 2) ---------

testCase('G15 the stylesheet pins #spread-frame to the FRAME scale and still ' +
  'says what is true', () => {
    const css = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
    // Extract rules by EXACT selector. A gate that greps the whole file is
    // satisfiable from a neighbouring `:hover` rule whose selector merely
    // CONTAINS the base selector as a literal prefix — this phase has that
    // failure on the record (F-6's first gate draft). Mutation 5 is that
    // mutation and must still be RED.
    const rules = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      rules.push({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').trim(),
        body: m[2] });
    }
    const frame = rules.filter(r => r.sel === '#spread-frame');
    assert.strictEqual(frame.length, 1,
      'G15 found ' + frame.length + ' rules whose selector is EXACTLY ' +
      '`#spread-frame`, expected 1');
    const b = frame[0].body;
    // BECAUSE this is THE ONE LINE that preserves 26.5's art contract. The
    // stage may grow; the frame art may not. A percentage of the stage is
    // exactly what would have stretched it.
    assert.ok(/width:\s*calc\(768px\s*\*\s*var\(--k\)\)/.test(b),
      'G15 #spread-frame is not sized from the frame scale (width)');
    assert.ok(/height:\s*calc\(432px\s*\*\s*var\(--k\)\)/.test(b),
      'G15 #spread-frame is not sized from the frame scale (height)');
    assert.ok(b.indexOf('100%') === -1,
      'G15 #spread-frame is still a PERCENTAGE of its container — a taller ' +
      'stage would stretch 26.5`s art');
    // BECAUSE 26.5 D-02 / law 4: pixelation applies ONLY to the frame sprite.
    assert.ok(/image-rendering:\s*pixelated/.test(b),
      'G15 #spread-frame lost `image-rendering: pixelated`');

    const stage = rules.filter(r => r.sel === '#spread-stage');
    assert.strictEqual(stage.length, 1,
      'G15 found ' + stage.length + ' rules whose selector is EXACTLY ' +
      '`#spread-stage`, expected 1');
    assert.ok(/--ki:/.test(stage[0].body),
      'G15 #spread-stage does not declare --ki — a reader of the stylesheet ' +
      'cannot see that there are two scales');

    // BECAUSE a stale comment is the same defect class as a stale gate: this
    // block comment is the STANDING EVIDENCE for the content fence and it must
    // not go stale in the commit that acts on it.
    const block = css.slice(css.indexOf('the in-scene reading spread'),
      css.indexOf('#spread-overlay'));
    assert.ok(/--ki/.test(block),
      'G15 the spread block comment does not mention the interior scale');
    assert.ok(!/never\s+free-fractional at rest/.test(block),
      'G15 the spread block comment still says the scale is "never ' +
      'free-fractional at rest" — that is no longer true of the interior');
  });

// ---- report -----------------------------------------------------------------

for (const name of passed) { process.stdout.write('  pass  ' + name + '\n'); }
if (failures.length) {
  process.stdout.write('\n');
  for (const f of failures) {
    process.stdout.write('  FAIL  ' + f.name + '\n        ' + f.reason + '\n');
  }
  process.stdout.write('\n' + failures.length + ' of ' +
    (passed.length + failures.length) + ' cases FAILED\n');
  process.exit(1);
}
process.stdout.write('OK  ' + passed.length +
  ' spread-geometry cases — the cliff, the art contract, the clamp identity ' +
  'and the half-step no-op\n');
process.exit(0);
