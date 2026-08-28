# ROOM-HANDOFF.md — consolidated art, lighting & motion handoff

*Source: the owner's Claude Design project **"App UI style customization"**, file
`Study Room Handoff.dc.html` (project `b336513e-c78f-4323-8021-b165b15c8465`,
readable via the `claude_design` MCP / `DesignSync`). Dated 7 Aug 2026, v1.
Imported here 2026-08-07 so a drawing or renderer session can work from the
repo without reaching the design canvas.*

`tools/SPRITES.md` is the **pipeline** — canvas sizes, export, the swap
procedure, the craft spec. This file is the **direction** — the ramp, the
lighting model, the sprite briefs, the motion laws. Where they disagree, the
disagreement is written down in §R below rather than resolved silently.

**Its own supersession claim:** this document supersedes *Pixel Build Script*,
*Pixel Build Script II*, *Game Boy Style Guide*, *Motion Plan*, *Where Motion
Lives* and *System State Motion* wherever they disagree with it. That claim is
accepted **for the design project's own files**. It does **not** by itself
override `SPRITES.md` §2/§3/§7, which are repo-binding and carry owner
rulings — see §R.

---

## R. RECONCILIATION — what is blocked, what is live

Read this before pasting anything below into a drawing session.

| Topic | Handoff says | Repo status |
|---|---|---|
| **Outlines** | **No outlines at all.** Separate forms by value; one pixel of the darkest ramp step only where a silhouette would be lost. | ⛔ **REJECTED — the owner ruled 2026-08-07: `#2c2823` stays, ruling unchanged.** `SPRITES.md` §2 remains binding and unamended. Her 2026-08-06 ruling was put to her again *because* this is a third position it never considered; she extended it to cover this one too. **Do not remove outlines from any sprite.** S8's "REMOVE all outlines" clause is struck — see §05. ⊕ **EXTENDED 2026-08-23 (R-3 below):** the plates composited into the frames she rules the palette from must carry them too — routed to `26.98-03` Task 1. |
| **Palette** | One **10-step warm ramp** for the whole room + a parallel cool ramp used only inside the window. No sprite carries a colour of its own. | ✅ **RULED — the owner, 2026-08-24, from the real render she asked for on 2026-08-07 — her words: “Keep the current colours.”** §​2's approved set stays binding; the whole-room repaint onto the two ramps does not happen, and S1–S8 stay parked. **Read all four qualifications before citing this.** **(1)** It declines *the whole-room repaint onto the handoff's two 10-step ramps* and **nothing else** — not the desk zoom rework, not any new sprite, not any individual colour. **(2)** It is **“not now”, not “never”.** **(3)** ⚠ **It was made on a CONFOUNDED comparison and this row says so rather than footnoting it:** the two arms differed in *drawn detail* as well as colour — the shipped arm carries wall and floor line work, the green feature wall and a plant the ramp arm has none of, and the ramp arm was drawn at roughly four times the grain. She was told this plainly before ruling. Do not read it as a clean colour-only verdict; if the question reopens, remove the confound first. **(4)** ⛔ **Her 2026-08-24 permission to propose colours OUTSIDE this palette STANDS and is not overridden.** The same day she asked the design workstream for more colour (*“a lot of items are using the same color especially green”*, *“the desk looks too flat”*); that separate, still-open question lives in `docs/DESK-REDESIGN-HANDOFF.md` §5, and the proposed glazed ceramic blue — a new hue in a warm-throughout palette — is **not ruled here**. The sheet she ruled from: `assets/aseprite/handoff/lit/_ruling-sheet.png`, control arm in `lit-control/`. |
| **Dithering** | Required on every flat region over 30×30; ordered Bayer, 8×8 aligned. | ✅ **Agrees with `SPRITES.md` §7**, which is BINDING and which this doc explicitly endorses ("§7 was right as written"). It also retracts the Pixel Build Script's rule 6 ("no dithering under 40px"), closing §8.4's one real disagreement in §7's favour. |
| **Light direction** | Upper left, 38° from vertical, in every sprite without exception. | ✅ **Compatible** — §3 already says "light from upper-left"; this pins the angle. Adoptable now. |
| **8×8 tile grid** | Ignore it. Six of ten sprites aren't multiples of 8 and their coordinates are pinned. | ✅ **Compatible** — it was never enforced in this repo. |
| **SVG filter theme** | Preview tool only; recolour the source files. | ✅ **Compatible** — no filter theme was ever built. |
| **UI chrome** | UI is exempt from the dither pass: panels, buttons, text and cursors stay flat and clean. | ✅ **Agrees with `SPRITES.md` §8.3.** |
| **Cursors** | The one exception to the no-outline rule; three separate 16×16 files, because `cursor: url()` cannot slice a sheet. | ✅ **Agrees with §8.3's cursor exception.** |
| **Window scenery** | Three conifers, as in the shipped sprite — not a rolling hill. | ✅ **Agrees with what shipped.** No action. |
| **Contact shadows** | Drawn into the sprite as ramp steps. No blur, no separate DOM layer. | ✅ **Compatible** with §7; adoptable once the ramp question is settled. |

**Everything in §01–§05 below that spends the ramp is gated on the palette
row.** The lighting model (§04), the motion laws (§06) and the build order
(§07) are readable and partly actionable without it.

### ✅ THREE RULINGS — THE OWNER, 2026-08-23 (26.98-02)

All three were put to her with the cost of each stated plainly, including which
answer would have flattered the numbers. **Recorded here because a contract line
that code contradicts is a contract that has quietly stopped being true.**

---

**R-1 · §04's STEP FORMULA IS CORRECTED, NOT PRESERVED.**

> ✅ **ANSWERED 2026-08-23 — her words: *"Use the paint's given shade"*.**

§04 states the model as `step = 2 + round(localLuminance * 4)  // sprite keeps
its own value`. **That line is now amended:** for art already painted ON a ramp,
a sprite's own value IS its ramp index, and the index is used directly. The
luminance round-trip is retained as the documented **fallback** for source art
that was never on a ramp, and it must not be deleted — the control arm that
reads the shipped 13-hex set depends on it.

**The reason is measured, not argued.** The ramp is perceptually spaced and
bunched at its dark end, so feeding a ramp colour's own luminance back through
the quoted formula maps TEN distinct steps onto FOUR (0,1,2 → 2 · 3,4,5 → 3 ·
6,7 → 4 · 8,9 → 5). A wall painted at step 2 and a floor at step 5 come out one
step apart instead of three, the frame collapses into shadow, and the morning
room never reads as sunlit: **day measured 86.4 / 13.6 / 0.1 against a
60 / 30 / 10 target** under the quoted formula, versus **62.2 / 29.8 / 8.1**
under the correction. That collapse is precisely the symptom §04's own author
reported ("my day beam reads too weakly, my night render has zero pixels above
0.42") and attributed to tuning. **It was not tuning.**

Implemented as `light.RAMP_ID` + `light.base_ramp_and_step()`.

---

**R-2 · THE FRAMES USE THE REAL PER-BAND WINDOW.**

> ✅ **ANSWERED 2026-08-23 — her words: *"Use the real night window."***

She was told plainly that swapping the true night plate in makes the night frame
**measurably darker and further from its §04 target**, and that leaving the
daytime window in the night frame was the flattering choice. She chose the
honest one.

`light.compose()` now takes the band and blits `light.WINDOW_PLATE[band]` —
`decor-window` / `decor-window-dusk` / `decor-window-night`. Before this, the
day window (conifers and all) was composited into the night frame, which is the
one thing §03 states as absolute ("a night sky cannot be warm") failing in its
most literal form.

**Measured cost, accepted:** night moves from `89.2 / 9.8 / 1.0` to
`93.6 / 6.3 / 0.09`, so the night arm of the CI assertion now fails on **shadow
as well as lit**. ⛔ Nothing was tuned to compensate and no tolerance was
widened. **The gate stays red on a true number.**

---

**R-3 · THE OUTLINES GO IN BEFORE THE PALETTE RULING.**

> ✅ **ANSWERED 2026-08-23 — she was told it changes every measurement taken so
> far and chose it anyway, on the reasoning that the pictures she rules on
> should look like the room she actually has.**
>
> ⚠ *No verbatim wording was supplied for this one; the sentence above is the
> reported ruling, not a quotation. Do not re-quote it as her words.*

The plates composited into the frames she rules the palette from must carry the
`#2c2823` outlines. `#4a3a2c` must **not** appear — it was rejected twice
(2026-08-06 and 2026-08-07).

**⛔ ROUTED, NOT DONE — this is owed by `26.98-03` Task 1, by name.** It was
deliberately NOT executed in 26.98-02, for three reasons stated so the routing
can be argued with rather than guessed at:

1. **It is sprite work, not light-pass work.** Drawing outlines means changing
   the generated plates under `png/` (`build_handoff.py`), which is not in
   26.98-02's `files_modified` at all. What the light pass owes is keeping the
   ink **literal** once it exists, and that is built and fenced — see D-1(b)
   below and `light.DRAW_AFTER_LIGHT`.
2. **It would have entangled two measurements.** R-2 and R-3 both move every
   band number. Landing them in one commit makes neither separately readable.
3. **26.98-03 Task 1's stated job is "produce the sheet she rules from"** — the
   exact artifact this ruling is about, and the last step before the palette
   ruling itself.

`tests/test_room_light.py::test_the_emitted_day_frame_carries_only_ramp_and_exempt_colours`
pins the emitted day frame's exempt-colour count **by value at its measured 0**,
and its failure message instructs the next reader to replace the pin with the
positive assertion the moment outlines land. **That pin is the tripwire for this
ruling: 26.98-03 Task 1 will turn it red, on purpose, and that is the signal
that R-3 has been honoured.**

**✅ DONE — 2026-08-24, `26.98-03` Task 1. The tripwire fired exactly as
written:** the emitted day frame went from **0** exempt-colour pixels to
**8452**, and the pin's own failure message was followed rather than edited —
it is now the positive assertion (*at least one `#2c2823` pixel in the emitted
day frame*), not a bigger number.

**How the outlines were put in, and why not by repainting `png/`.** Every
composited object gets a 1px `#2c2823` rim on its silhouette, drawn **inside**
the silhouette (`light.outlined()`), at composite time. Three reasons this beat
editing `build_handoff.py`:

1. **It applies to BOTH arms through one line of code and no-ops on one of
   them.** The rule is *every composited object carries an outline*; a plate
   that already carries the ink is returned untouched. The shipped sprites
   already have theirs. So the two arms stay one code path with one decision
   rule, and the only difference between them stays **which directory the
   plates came from** — which is the entire design of the control.
2. **Growing the rim outward was refused.** `Img.rim_outside()` is the CURSOR
   exception; using it here would move every object's footprint by a pixel and
   change the pinned §05 coordinates in effect if not in name.
3. **`bg.png` is deliberately NOT rimmed.** It is the room shell, not an
   object, and a rim on it would draw a border around the whole picture. The
   shipped `bg.png` carries interior line work that the handoff plate has none
   of; that is drawn detail, not palette, and it is named to her as such.

**Measured cost, paid not hidden:** the day band moved `62.2 / 29.8 / 8.1` →
`63.3 / 28.9 / 7.8` (still inside §04's tolerance) and the night shadow band
moved `93.6439` → `93.7946`. She was told it would change every measurement.
Nothing was tuned to absorb it.

---

### ✅ RULING 4 — THE OWNER, 2026-08-24 (26.98-05) — §M6's THREE SENTENCES

**R-4 · THE WAIT LADDER SPEAKS IN HER WORDS, AND THE SAME LINE EVERY TIME.**

> ✅ **ANSWERED 2026-08-24.** Three offered sets plus the option of writing her
> own. **She chose SET A**, so these are hers by selection — the same standing
> her W-3 sentence has, and recorded that way for the same reason.

The three sentences, **verbatim**, and they are what ships byte-for-byte:

| moment | her sentence |
|---|---|
| four seconds | `still reading.` |
| twenty seconds | `this one is taking a while.` |
| the permission | `leave it for now — whatever arrives will still be here.` |

⛔ **The lowercase and the trailing full stops are HERS** — exactly what she read
and chose. No agent may sentence-case, repunctuate, smooth or "tidy" them. If a
gate in this repo ever objects to the casing, **that gate is wrong about this
string**; raise it with her rather than editing her words.

⛔ **The permission line is ONE sentence.** It was wrapped across two lines in
the table she read, purely for column width; there is no line break in it. Its
dash is an **em-dash**, not a hyphen.

**And the second half of the ruling — the shape, not just the wording.**

> ✅ **HER WORDS: *"Same line every time"*.**

The four-second line was offered two shapes: a fixed sentence, or one that names
the actual work in flight — *"reading back through February"*, which is the
shape the original §M6 sketch describes and which is warmer. **She was told
plainly that the warmer shape could put the title of one of her notes on screen
where none appears today, and she declined it.**

⛔ **CONSEQUENCES, ALL BINDING:**

1. **There is no interpolation and no hook for one.** The naming shape is
   **dead**, not parked. Every copy slot is one contiguous string literal with
   no substitution point, and that is pinned by value.
2. **T-26.98-27 — the title-exposure question — is ANSWERED AND REFUSED.** It is
   not deferred and it is not an open question. **Do not re-open it as one.**
3. **The refusal is enforced, not merely written down.** `tests/test_session_flow.cjs`
   § 7 arm (r) puts a note name, a draft body, her typed words and a
   title-shaped stage all within the ladder's reach, drives both rungs, and
   fails if any of them lands on a wait line — so an interpolating rung is
   caught **even when the copy slots are untouched**. Re-opening this is HER
   call, never an agent widening it back.

⛔ **The `"reading back through February"` example in §M6's original block is
therefore a SKETCH, not a spec.** It is kept in description rather than deleted,
because it is the thing she was shown and refused.

---

### ✅ TWO RULINGS — THE OWNER, 2026-08-24 (26.98-03), FROM THE FRAMES

---

**R-5 · THE PALETTE: THE TWO RAMPS ARE DECLINED — NOT NOW, NOT NEVER.**

> ✅ **ANSWERED 2026-08-24 — her words: *"Keep the current colours."***

Ruled from the side-by-side she asked for on 2026-08-07: the same room, lit by
the same pass, twice — one arm in the colours the room has, one in the ramps.
`assets/aseprite/handoff/lit/_ruling-sheet.png`, control arm in `lit-control/`.

The full record, with all four qualifications, is in the **Palette row** of the
table above and in `SPRITES.md` §9.2, and a test asserts both records carry a
date, a verbatim quotation and none of a placeholder list
(`tests/test_room_light.py::TestThePaletteRulingIsOnTheRecord`). The three that
matter most, restated here so a reader of this section alone cannot miss them:

1. **It declines the whole-room repaint onto the two 10-step ramps and nothing
   else.** §2's approved set stays binding; S1–S8 stay parked.
2. **⚠ It was made on a CONFOUNDED comparison, and that is written into the
   record rather than footnoted.** The two arms differed in **drawn detail** as
   well as colour — the shipped arm carries wall and floor line work, the green
   feature wall and a plant the ramp arm has none of, and the ramp arm was drawn
   at roughly four times the grain. She was told this plainly before ruling.
3. **⛔ HER SAME-DAY PERMISSION TO PROPOSE COLOURS OUTSIDE THIS PALETTE STANDS.**
   On 2026-08-24 she also told the design workstream it is okay to have more
   colour outside the current palette, and asked for more of it. That question
   is **separate and still open**, it lives in `docs/DESK-REDESIGN-HANDOFF.md`
   §5, and the proposed **glazed ceramic blue — the first cool hue in a
   warm-throughout palette — is NOT ruled here.** Reading R-5 as "the palette
   question is closed" cancels a permission she granted the same morning.

---

**R-6 · THE NIGHT TARGET IS CHANGED, NOT THE TOLERANCE.**

> ✅ **ANSWERED 2026-08-24 — her words: *"Change what night should be."***

**What she was told, and what she gave up.** The night frame cannot reach §04's
3% lit target and no permitted setting gets it there. Measured over a spanning
sweep of the only two values §04 leaves to the implementation (the along-beam
falloff and the flame radius): the **maximum** night lit anywhere the day arm is
still green is **0.97**, against a required **1.5** floor. The reason is
**structural, not tuning** — at night `AMBIENT = −2.2`, `BEAM = 0.55` and the
flame contributes at most `4.2`, so the largest lift any pixel can take is
**+2.55 ramp steps**; the first warm step clearing the 0.42 "lit" threshold is
index **7** (luminance 0.526, with index 6 at 0.396 missing it), so **nothing
painted below source step 5 can ever be lit at night at any flame radius.**
Almost nothing near the candle is painted that high.

**She was offered the alternative and declined it:** drawing **real lamplight
art near the candle** — a genuine pool at ramp steps 7–9 — would have made
86 / 11 / 3 reachable. New art sits above her cut line this close to the freeze.
She asked for the honest number written down instead.

**⛔ SO A TARGET MOVED, WHICH IS THIS PROJECT'S SIGNATURE DEFECT. THESE ARE THE
CONDITIONS UNDER WHICH IT DID NOT BECOME ONE, AND ALL FOUR ARE ENFORCED:**

1. **The TOLERANCE did not move.** `light.NIGHT_LIT_TOL` is still **1.5**, still
   pinned by value, and still load-bearing — it is now the **ceiling** on how
   far the candle may lift, because a night room that comes out 5% lit is not a
   night room either.
2. **The new target is NOT today's measurement.** A target reverse-engineered
   from the current frame can never fail. The night band is now asserted against
   the frame's own **ambient floor** — the split it would have with the beam and
   the flame switched **off** — computed from the art and one constant without
   ever reading the emitted frame.
3. **The comparisons are strict and directional.** Light may only remove shadow
   and only add mid and lit, so a pass whose beam or candle stops working lands
   exactly **on** its floor and fails on a strict `>`. Driven red that way, with
   the printed line recorded in `26.98-03-SUMMARY.md`.
4. **§04's original 86 / 11 / 3 stays in the code**, as `light.NIGHT_TARGET_ORIGINAL`,
   with the measured 0.97 ceiling beside it as `light.NIGHT_LIT_CEILING_MEASURED`,
   and a test fails if either is deleted as dead code or if a night point-target
   comes back into `light.TARGETS`. **What was given up is visible, not erased.**

⛔ No §04 constant moved. Verified by diff on every one of `AMBIENT`, `BEAM`,
`APERTURE`, `THETA`, `HALF0`, `HALFK`, `ALONG`, `EDGE_GAIN`, `ALONG_GAIN`,
`FLAME_R`, `FLAME_XY`, `DESK_FLAME_XY` and `scale=2`.

---

### ✅ RULING — THE OWNER, 2026-08-25 (26.9995-07) — THE DESK'S EVENING, AND THE ONE SWITCHED LIGHT

---

**R-7 · THE DESK ZOOM GETS AN EVENING; THE LAMP IS THE ONLY LIGHT A HAND TURNS ON; THE CANDLE IS NOT A SWITCH.**

> ✅ **ANSWERED 2026-08-25 — AskUserQuestion selections with both renders open;
> the full trail verbatim, typos hers.** Q1 (evening/lamp), typed: *"let user
> to control this"* → clarifier answer, typed: *"The user controls which light
> they wanna turn it on"* → read-back confirmed: *"Yes, exactly that"* → her
> live correction: *"Wait no, only the lamp"* → final clarifier selection:
> *"Candle isn't a switch"*. Q2 (lamp home), selection: *"Stays in design
> mode"*. Q3 (placed-item follow-up), selection: *"Yes, plan it"*.

**What she was shown.** `26.9995-07-lamp-three-ways.png` (planning repo) — the
furnished desk under each offered branch, at the size she sees it — beside the
measured finding of `26.9995-07-NIGHT.md`, put to her in two plain sentences:
her desk close-up looks exactly the same whatever time she opens it (four
real-Chrome captures, byte-identical), so the "a drawn, unlit lamp reads as
broken at night" warning has no night to happen in on that screen as shipped.

**What she was told, including the argument she had already overruled once.**
The candle is the librarian and the light in that room; a second light source
is a story decision, not an art one. She overruled that once to put the lamp
in (Ruling 2, `docs/DESK-REDESIGN-HANDOFF.md` §2 open question 2). Branch C —
a lamp pool baked into the night plate, permanently on — would have overruled
it a second time. **She took none of the three offered branches. She cut a
fourth:** the story stays the candle's *by default*, and a second light exists
only in the moment her own hand turns it on. She chose a user-switched lamp
rather than overruling the fiction a second time.

**The ruling, in force:**

1. **The desk zoom gets an evening.** It follows the room's landing-set
   `body.time-*` bands and dims with the room — the close-up stops being
   time-blind. Wired in 26.9995-07, gated dark until the STOP below clears.
2. **The lamp is the ONLY hand-switched light.** Once placed from the
   design-mode catalog, the user can toggle it on and off. Her correction is
   the fence: *"Wait no, only the lamp"* — **the candle is NOT a switch** and
   keeps behaving exactly as it does today. The other nine catalog sprites
   stay inert.
3. **The lamp stays catalog-only** (Q2: *"Stays in design mode"*). ⛔ THE
   SUPERSESSION, EXPLICIT: her earlier "the lamp goes IN" (Ruling 2 — drawn
   and placed on the default desk, shipped by Plan 05) was SUPERSEDED for
   default placement by her 2026-08-25 uniform relocation ruling (26.9995-06:
   all ten off the default desk, into the catalog), and Q2 re-confirms the
   later uniform ruling stands. The lamp ships as a catalog item, not as
   default desk furniture.
4. **Q3 — the placed-items follow-up is APPROVED FOR PLANNING.** WINDOWS
   ledger #153 (an item placed from the catalog must show in the desk zoom
   too, so the two windows agree) gets its own plan. NOT implemented in
   26.9995-07 — recorded here so the approval is a fact, not a memory.

**Declines, recorded as rulings rather than silence:**

- **Branch A (no evening) — declined.** The desk does not stay time-blind by
  her choice; it stays time-blind only until the shade STOP below clears.
- **Branch B as offered (evening, lamp permanently dark) — absorbed, not
  taken:** the evening ships, and the lamp is dark *until switched*.
- **Branch C as offered (a lamp pool baked into the plate, always lit) —
  declined.** No light in that room turns on without her hand.

**⛔ THE DESIGNED STOP — 21 NIGHT HEXES AWAIT HER RULING, AND THE GATE HOLDS
(T-26.9995-37).** The night pass over the shipped plate (light.py's register,
verbatim maths: one flat ink dim at 0.46, two warm zones lifted with the
checkerboard edge at radii 34/66, wall light clipped at the desk line y=120,
the stepped lit strip under the flame, flame at the shipped candle slot x=300,
snapped output, no ramp-quantise) produces **21 colours — all 21 outside the
23-hex approved set** (`ALLOWED_RGB`). Not one of the day plate's 9 hexes
survives the dim. A new hex is HERS, never an allow-list entry an agent adds.
Until she approves the shades:

- **No night plate reaches `assets/room/`.** The plate exists in scratch only;
  the approval render is `26.9995-07-night-shades.png` (planning repo) — day
  plate beside night plate, real size.
- **`ROOM_PNG_COUNT` stays 47 and `OUTLINED_SPRITE_COUNT` stays 46.** Both
  move only in the same commit that lands the approved plate as codegen
  (`gen_desk_station_night()`), each by a stated addition of exactly one,
  each driven red first.
- **The wiring is gated dark:** `DESK_NIGHT_PLATE` in `app.js`
  (`renderDeskStation`) is `null`, so the station background is byte-for-byte
  today's choice under every band. The same post-approval commit flips the
  constant. Dusk keeps the day plate — the room's dusk treatment is a tint
  the desk zoom never had; a dusk plate is its own later question
  (`26.9995-07-NIGHT.md` scope note).

The 21, by pixel count over the 768×432 scratch plate: `#909090` 123540 ·
`#846c48` 44992 · `#907860` 41824 · `#9c9c90` 36048 · `#6c543c` 21152 ·
`#483c30` 19024 · `#908478` 15244 · `#302424` 11520 · `#a8a89c` 9900 ·
`#9c9084` 2080 · `#a8a890` 1316 · `#78786c` 1280 · `#a89c84` 1028 ·
`#9c9090` 764 · `#b4a89c` 716 · `#ccc0b4` 608 · `#b4b4a8` 240 ·
`#c0a89c` 224 · `#c0c0b4` 192 · `#9c9078` 48 · `#a89c90` 36.

**⚠ THE LAMP SWITCH IS OWED, NOT LANDED IN 26.9995-07 — two reasons, named
rather than left to be rediscovered:**

1. The switch's ON state is an art variant (a lit `lamp-desk` sprite — this
   design bakes light into art: no filter, no gradient, no runtime lighting),
   and any new PNG in `assets/room/` moves the same two pins frozen above
   until her shade approval.
2. A placed catalog item that accepts an everyday tap reverses the added-node
   posture (`buildAddedNode`: decoration with no click logic, pointer-inert
   outside design mode) — machinery that needs its own design, and it
   interlocks with #153 (whether the placed, switched-on lamp shows in the
   desk zoom too — the two windows must agree, her addendum ruling).

Both belong to the follow-up plan Q3 approved. Recorded in the WINDOWS ledger
so the ship gate sees the debt.

**✅ R-7 ADDENDUM — THE STOP CLEARED. THE 21 NIGHT SHADES APPROVED, THE OWNER,
2026-08-25.** She answered by an AskUserQuestion selection made with the
approval render open on her screen (`26.9995-07-night-shades.png`, planning
tracker's phase folder — the shipped day plate beside the scratch night plate,
at real size). Her words, verbatim (the selection label she chose): **"Yes —
ship the evening"**. What shipped, in the one post-approval commit the STOP
prescribed:

- `gen_desk_station_night()` landed as CODEGEN in `tools/gen_room_sprites.py`
  — the register above verbatim (dim 0.46, zones 34/66 checkerboard, wall
  clip y=120, lit strip, flame at the shipped slot x=300, snapped, no
  ramp-quantise). The emitted plate's palette was verified EQUAL to the 21
  listed above, pixel count for pixel count, before landing.
  `FINALIZED_BY_HAND` stays `frozenset()`; `write_png` untouched.
- `ROOM_PNG_COUNT` 47 → 48 and `OUTLINED_SPRITE_COUNT` 46 → 47, each a
  stated addition of exactly one, each seen red first ("48 != 47" and
  "47 != 46", verbatim) — the partition still covers the whole directory.
- The 21 hexes entered `CHARTER_RGB` (20 → 41; `ALLOWED_RGB` 23 → 44) and
  SPRITES.md 8.2 with this ruling as provenance, in the same commit.
- `DESK_NIGHT_PLATE` flipped from `null` to the real plate — the evening is
  LIVE on the landing-set `body.time-night` class; day and dusk keep the day
  plate, nothing re-checks the clock.
- ⚠ One gate note, recorded rather than discovered later: the night pass's
  12-step snap makes the day ink `#2c2823` IMPOSSIBLE in the night plate (44
  is not a multiple of 12) — its outline rides through the dim as `#302424`,
  which is among the 21 she approved. The outline-presence gate carries a
  per-sprite `NIGHT_REGISTER_OUTLINES` mapping for exactly this file, so
  presence is still asserted, in the plate's own ink; every other sprite is
  still held to literal `#2c2823`.

The lamp switch (#154) and the placed-items agreement (#153) remain OWED to
the follow-up plan — this addendum changes nothing about either debt.

---

### ⚠ A NOTE FOR THE RUNG C/D/E CUT — ANOTHER SESSION'S CLAIM, NOT VERIFIED HERE

`docs/DESK-REDESIGN-HANDOFF.md` §6 (a parallel design session's working file —
untracked, not committed by 26.98, and **not** verified by this phase) states
that its approach **bakes light into the art**: one flat night dim over the
whole plate, two dithered candle zones lifted out of it with a **checkerboard
edge**, clipped at the desk line. A smooth radial glow was tried first and
rejected because it banded into rings.

**Its stated consequence, quoted as their claim:** that approach *"needs no
runtime lighting code at all"* — only art variants plus one line to make the
station background time-aware, since the room already sets a single
`body.time-*` class at landing.

If that holds, **rung C (the in-app light pass / compositor) is not merely
deferred but may be unnecessary.** ⛔ This is left as a note for the plan that
owns the cut. Nothing here acts on it, builds it, or weakens the cut record.

---

## 02. TWO DECISIONS THAT BLOCK EVERYTHING — THE OWNER ONLY

Neither is a coding question. **Both were answered by the owner on 2026-08-07.**

**D-1 · THE CORAL ACCENT.** A single shared ramp means no sprite can carry a
colour outside it — including `--accent` `#e8503a`. Either **(a)** the accent
becomes the ramp's top two steps, so light itself means "something waits" —
elegant, and it makes the candle the only bright thing in the room; or **(b)**
a small exempt set draws after the light pass, keeping coral literal. (a) is
stronger but changes what the accent *means*.

> ✅ **ANSWERED 2026-08-07 — (b). Coral stays literal.**
>
> **This is a renderer requirement, not an art note.** The light pass must
> have a **draw-after-light stage**, and the exempt set draws into it. Build
> §04 with that stage from the first commit — retrofitting it means
> re-architecting the compositor, which is why the doc marked D-1 as blocking
> §04 rather than following it. The exempt set stays *small* and is named
> explicitly in code, never inferred: an unnamed exemption is how "no sprite
> carries a colour of its own" quietly stops being true.
>
> This answer holds **whether or not the ramps are adopted** — it is about
> where coral is drawn, not what the other colours are.

**D-2 · DOES THE FEELING MARK ACCUMULATE?** If a note's joyful/not mark
eventually shows in its spine colour on the shelf, then over a year the shelf
becomes a picture of your emotional weather. That is the strongest argument
for collecting the mark at all — and it is a product decision, not a motion
one. If yes, the spine sheet needs a second variant set and §M7's symmetry
contract extends to the shelf.

> ✅ **ANSWERED 2026-08-07 — YES. The shelf shows it.**
>
> Three consequences, all now in scope:
> 1. **The 22×40 spine sheet needs a second variant set** — one per mark. Both
>    sets are gated on the palette ruling, like every other sprite.
> 2. **§M7's symmetry contract extends to the shelf.** Whatever "joyful" and
>    "not joyful" become on a spine must be *equally* legible: identical
>    saturation, identical value, differing only in hue. A warmer/brighter
>    "joyful" spine tells her which answer was hoped for, at a glance, on
>    every visit — the same failure §M7 exists to prevent, made permanent
>    and ambient instead of momentary.
> 3. **Law 3 check before this ships.** A shelf that pictures a year of
>    emotional weather must never read as a record of bad months. It shows
>    what was *marked*, not what was *missed*, and nothing about it decays.
>    Worth a UAT beat of its own on a deliberately lopsided fixture.

---

## 03. ART DIRECTION — the constant block

Target: *The Case of the Golden Idol*. Rough, dithered, unoutlined,
violet-shadowed. Re-paste whenever a session drifts.

> ⛔ Rules 3 and 7 are the two blocked rows in §R. Do not paste this block
> whole until they are ruled on.

```
1. LIGHT COMES FROM THE UPPER LEFT AT 38° FROM VERTICAL, in every sprite
   without exception. Top and left faces one step lighter; bottom and
   right faces one step darker. State which faces you are lighting
   before you draw a pixel.
2. Bake only ONE step of lighting. The renderer adds the rest at runtime.
   A strongly pre-lit sprite fights the engine and looks pasted on.
3. NO OUTLINES. Separate forms by value. Where a silhouette would be
   lost, one pixel of the darkest ramp step — never a black line.
4. DITHER every flat region larger than 30x30. Ordered Bayer between two
   ADJACENT ramp steps, aligned to an 8x8 grid. Required, not optional.
5. Shadows are VIOLET-shifted (hue 260-340). Lights are ORANGE-shifted
   (hue ~30). Never neutral grey.
6. Keep saturation near 50% even in the darkest steps. Muddy grey is the
   most common failure in this style.
7. Every colour comes from the shared room ramp below. No sprite carries
   a colour of its own.
8. Contact shadow is drawn INTO the sprite as darker ramp steps along its
   base. No blur, ever.
9. Sizes stay EXACTLY as specified — they are pinned in the renderer.
10. Re-open the existing .aseprite file; never regenerate from scratch.
```

### The room ramp — 10 steps, violet-black to ember

```
0e0a16 1a1020 2a141e 3c1e22 54382a 6d4a2e 8a5f34 b0813e d8ac5c f2d8a4
```

### Window-only cool ramp — same length

```
0e0a16 141824 1c2634 26384a 365064 48657a 5c8090 7ea4b0 a8c8d0 dcebee
```

Steps 0–1 are ambient darkness. **2–6 is where sprites live.** 7–9 are light
and belong to almost nothing. The window is the only exception to the warm
ramp, because a night sky cannot be warm.

### The detail ladder — for when "add more detail" is the note

Silhouette → structure → *material* → *story* → specular. Sprites currently
stop at 2. Rung 3 is grain and weave; rung 4 is two story details per sprite
(a ribbon left in a book, a mug ring, a chipped corner) and is what makes the
room feel like someone's. Rung 5 is one specular pixel from steps 8–9, added
last, half of it deleted. **Always name the rung in the prompt** — "add
detail" yields noise on every rung at once.

---

## 04. LIGHTING — build this before touching sprites

Light is an index shift on the ramp, dithered — not an overlay.

Measured from three Golden Idol scenes: **lit pixels never exceed ~10% of
frame, and ~3% in lamplight.** Dark ambient plus a small genuinely-hot region
reads as "lights on"; uniform dimming reads as "lights off" at any value.
That distinction is the whole model.

```
step  = 2 + round(localLuminance * 4)     // sprite keeps its own value
beam  = insideWedge(x,y) ? edgeFalloff * alongFalloff : 0
flame = max(0, 1 - dist/r)^2              // radial ONLY at the candle
lit   = step + AMBIENT[band] + beam*BEAM[band] + flame*4.2
n     = floor(lit + bayer8[y&7][x&7])     // the dither IS the gradient
out   = RAMP[clamp(n, 0, 9)]
```

> ⚠ **THE FIRST LINE OF THAT BLOCK IS AMENDED. Read §R · R-1 (2026-08-23)
> before implementing it.** `step = 2 + round(localLuminance * 4)` holds ONLY
> for source art that was never painted on a ramp. For ramp-native art the
> sprite's own value IS its ramp index and the index is used directly —
> the owner ruled *"Use the paint's given shade"* on 2026-08-23. The quoted form
> squashes ten ramp steps into four and is what makes the day frame measure
> 86.4 / 13.6 / 0.1 against its 60 / 30 / 10 target. **The six band numbers
> below are unaffected and unchanged.**
>
> ⚠ **AMENDED AGAIN, 2026-08-24 (26.98-03) — the last line, `out = RAMP[...]`.**
> `RAMP` is not one table. A pixel is emitted into **the palette it was painted
> in**: the warm ramp, the cool ramp, or — for art that was never on a ramp at
> all — that art's own colours, ordered darkest to lightest and discovered by
> reading the plates. This is the same ruling as R-1 carried through to the
> output side, and it is what makes the control arm a control: without it the
> documented luminance round-trip emits **warm-ramp hexes for shipped-palette
> input**, so the "before" picture comes out in the "after" colours and the
> side-by-side asks a question it has already answered. The clamp is to each
> palette's own length; for both 10-step ramps that is the unchanged `[0, 9]`.

- **Per band:** AMBIENT day `+0.1`, dusk `−1.2`, night `−2.2`. BEAM
  `3.4 / 1.8 / 0.55`. Six numbers total.
- **The wedge:** aperture `(150,126)` — the window's lower-left. 38° from
  vertical, half-width `42 + u*0.26`. Reject `u < 0` or it leaks backwards
  through the wall.
- **Run the light pass at 2× the sprite grid.** Sprites are 384×216; dither at
  768×432. At 1× the Bayer pattern reads as a coarse checkerboard — at 2× it
  reads as texture. This is the difference between "dithered" and "broken".
- **Ambient is flat.** No gradient in the darkness, no vignette. Unlit regions
  are one uniform dithered value — that uniformity is what makes the lit wedge
  legible as an event.
- **Shadow is absence.** Where an object blocks the beam, ambient simply
  resumes. Nothing is drawn. You never compute shadow geometry — only the beam.
- **UI is exempt.** Dither the room only. Panels, buttons, text and cursors
  stay flat and clean — rough world, crisp interface.

### The CI test — the only lighting check worth trusting

Compute the shadow / mid / lit split of a rendered frame at thresholds 0.20
and 0.42 on Rec.709 luminance, and assert:

```
day    ≈ 60 / 30 / 10   (±5)
night  ≈ 86 / 11 /  3   (±5)   // lit must NOT be 0
```

Reference measurements: library daylight 60.1/29.8/10.1 · tavern night
85.9/11.4/2.7 · kitchen lamplight 58.3/38.6/3.1. This assertion would have
caught every dark-mode complaint made in this project.

### ⚠ Repo notes on §04 — read before planning it

1. **There is no `lightingLayerFor()` in this repo.** The doc says the model
   "replaces" it; nothing by that name exists. What ships today is a **CSS
   layer**: `#room-tint` carries a flat per-band wash (`--tint-day`
   `transparent` / `--tint-dusk` / `--tint-night`, `tokens.css` §25-01) and
   `applyTimeOfDay()` (`app.js`) sets one `body.time-*` class at the landing
   and swaps the window sprite. That is the "uniform dimming" the doc argues
   against, and replacing it is the real work of build-order step 2.
2. **The room has no compositor** — true of the **app**, and no longer true of
   the **repo**. In the app, objects are DOM `<img>` elements positioned
   through `place()` on the `--x/--y/--w/--h` contract. A per-pixel light pass
   at 768×432 needs a canvas stage that does not exist, and it has to keep
   `place()`, the station zoom, `image-rendering: pixelated` and design-mode
   drag all working. This is an architecture change, not a shader swap.
   **The repo, however, now has an OFFLINE compositor:**
   `assets/aseprite/handoff/light.py` blits the nine pinned objects onto
   `bg.png` and runs the §04 model over the result, emitting 768×432 frames to
   `assets/aseprite/handoff/lit/`. It never touches the app and never writes to
   `assets/room/`. That is what makes the assertion in note 4 runnable today.
   **As of 26.98-03 it also READS `assets/room/`** — `light.py --both` runs the
   identical pass a second time over the shipped sprite set and emits the
   control arm to `assets/aseprite/handoff/lit-control/`, plus the side-by-side
   `lit/_ruling-sheet.png`. Reading art it does not own is why the pass now
   resolves source and destination to absolute paths and **raises** if the
   destination is inside the source or outside `assets/aseprite/handoff/`. The
   intermediate composites moved out of `png/` and into the destination for the
   same reason: a pass that writes into the set it read cannot be re-run.
   `tests/test_room_light.py` asserts `git`-visible cleanliness indirectly, by
   asserting both arms exist, decode at the same size, and are **not byte
   identical** — a control that renders the treatment is not a control.
3. **"Delete the vignette" is ambiguous and must not be read as "delete the
   welcome-back".** The only radial gradient in the room is
   `#room-tint::after`, which is the shipped Phase 25 welcome-back sequence
   (SRM-07 / D-01) — an owner-approved *feature*, not lighting furniture. The
   doc's §04 is arguing about the steady-state model. Confirm with the owner
   before removing anything from that seam.
4. **The CI assertion RUNS TODAY, and it needs no browser.** ⚠ This note used
   to say the opposite, and both halves of it were false by 26.98. First,
   `tests/lib/cdp.cjs` (the zero-dep CDP driver over Node 26's global
   `WebSocket`) **is built and git-tracked** — 12,332 bytes, with three
   companions beside it (`app-server.cjs`, `render-harness.cjs`,
   `leak-scan.cjs`). Second, and more to the point, the assertion does not need
   a headless runner at all: it reads the frames the offline pass in note 2
   emits, so it is a plain stdlib decode-and-measure. It lives in
   **`tests/test_room_light.py`** and the `tests/test_*.py` glob picks it up
   with no runner and no config. A source grep is still not this assertion —
   that part was always right; every number in it comes out of decoded PNG
   bytes.

---

## 05. THE SPRITE WORK — nine prompts, in order

Each assumes §03's constant block is pasted first, and is therefore **gated on
the two blocked rows in §R**.

Coordinates in the 384×216 room: bookshelf 16,56 · window 124,44 · bench
124,152 · album 140,140 · journal 180,138 · chair 250,90 · desk 216,112 ·
notebook 264,94 · candle 300,94 · plant 348,124.

### S1 · Room background — 384 × 216 → `bg.png`

```
"Rebuild bg.png on the room ramp. Room interior seen flat-on, wall above and
floor below, no perspective.

FLOOR y168-216: horizontal planks, ramp step 4, each 11px tall, separated by
1px step-2 lines, with a step-3 grain streak inside each plank at irregular
intervals. Step-1 line at y167 where floor meets wall.

WALL LEFT x0-120: vertical panelling, step 2, with 1px step-1 lines every 7px.
WALL RIGHT x120-384: step 3 plaster, Bayer-dithered between steps 2 and 3
across the whole area so no region is uniform.

SIDEBOARD x60-300, y178-204: step 4 body, step 1 inset panel line, a diamond
escutcheon and two round handles in step 2.
FRAMED PICTURE x300-350, y38-78: step 5 frame, step 3 mount, a step-2 treeline
inside echoing the window.

One story detail only: a nail hole in the plaster where a picture used to hang.
No object sprites — furniture draws on top at runtime."
```

### S2 · Window, day, with trees — 88 × 88 → `decor-window.png`

```
"A square wooden window onto woods. 5px frame on the WARM ramp (step 5, with
step 6 on the top and left inner edges) and a cross mullion dividing four
panes. Everything behind the glass uses the COOL ramp.

Sky cool step 8 in the upper third, Bayer-dithered over 6px into cool step 7.
THREE blocky conifers along the bottom, about 24px wide, cool steps 3 and 4
with the lighter face upper-left, each with a 2px step-2 trunk. Three
different heights.

GEOMETRY, exactly as the shipped sprite: canopy tops stop just BELOW the
horizontal mullion — never crossing it. Upper two panes are sky only. The
centre tree straddles the vertical mullion; the outer two are cropped by the
frame so the woods continue past the window. 3px warm step-5 sill across the
bottom.

Hold at three trees. Five at this size halves each silhouette and loses the
chunkiness."
```

### S3 · Window, dusk and night — recolour only, never move a pixel

```
"Duplicate. DUSK — sky warm steps 5→4 dithered; trees drop to cool steps 2
and 3.
/pixel-export png decor-window-dusk.png

Duplicate again. NIGHT — sky cool steps 2→1 dithered; trees become flat cool
step 1 with no lit face; three single warm step-9 pixels as stars in the
upper panes.
/pixel-export png decor-window-night.png

Frame and EVERY silhouette pixel identical across all three files, and the
dither pattern pixel-identical in position — the renderer hot-swaps these, so
any pixel that moves reads as a glitch at dawn and dusk. Do all three in one
session."
```

### S4 · Empty bookcase — 72 × 112 → `bookshelf-empty.png`

```
"An empty wooden bookcase, side elevation, filling the canvas. Three shelf
boards at even heights. Frame and boards ramp step 5, with step 6 on the
top-left edge of each board and step 3 in the shadow directly beneath it.
Vertical 1px step-4 grain down both side panels at irregular 3-5px intervals.
Back panel behind each opening Bayer-dithered between steps 3 and 4. A 4px
plinth at the base. Contact shadow drawn into the bottom 3px as steps 2 and 1.

Two story details: one shelf board slightly bowed in the middle, and a small
chip out of the top-right frame corner.

It must look cared-for and WAITING, not derelict. This is the first thing a
new user ever sees."
```

### S5 · Three shelf fill overlays — 72 × 112 transparent → `bookshelf-fill-1/2/3.png`

```
"New 72x112 transparent overlay sitting exactly on bookshelf-empty.png. Draw
ONLY books; every non-book pixel stays transparent. Spines 5-7px wide, 20-24px
tall, ramp steps 3 to 6, no outlines.

FILL 1 — bottom shelf only: four upright spines at its left end plus one book
laid flat. Rest empty.
FILL 2 — bottom shelf full end to end, about ten spines of varying height, one
leaning into a gap; middle shelf five spines at its left end and a flat stack
of two at its right. Top shelf empty.
FILL 3 — all three shelves full. Two leaners, three horizontal stacks, one
book pulled forward, one gap where a book is out. Accumulated over years, not
shelved by a librarian."
```

Thresholds: 0 items → empty only · 1–8 → +fill-1 · 9–24 → +fill-2 · 25+ →
+fill-3. Two `<img>` at one coordinate. Coordinates and hotspot are unchanged,
but stacking a second image on one object *is* a render-path change — check
how `place()` emits nodes first. **Do not** place individual spines at room
scale: a spine is 6px wide there and the gaps are the readable feature. The
22×40 spine sheet is for the zoom station only.

### S6 · Desk zoom plate — 384 × 216 → `desk-station.png`

```
"A desk close up, flat-on. Wall above, desktop below. All on the room ramp.

WALL y0-120: step 3 plaster dithered against step 2. A 2px step-5 picture rail
at y26. Hanging from it at x30-88 a framed landscape with a step-2 treeline;
at x104-150 a step-7 index card pinned slightly crooked, three step-4 ruled
lines on it; at x250-354 a 3px step-5 floating shelf holding three small
spines and one book laid flat.

DESKTOP y120-216: 7px step-6 front lip at y120 with a step-2 line beneath,
then step-5 surface with horizontal 1px step-4 grain at irregular intervals,
denser toward the front. 10px step-4 front edge at the bottom.

DRAWER x240-324, y150-194: step 5 face, step 2 inset panel line, a step-7
plate pull with one step-9 highlight pixel, and a small keyhole.

Leave the desktop clear x12-210 — notebook, papers and candle place there at
runtime."
```

### S7 · Shelf zoom plate — 384 × 216 → `shelf-station.png`

```
"The inside of a bookcase close up, filling the frame. No books — they draw on
top at runtime.

CARCASS: 24px step-5 side panels at both edges with vertical 1px step-4 grain
and a 2px step-2 inner edge line. 12px step-4 top rail with a step-2 line
beneath.
BACK PANEL: step 3 boards in 16px vertical bands separated by 1px step-2
lines, Bayer-dithered between steps 2 and 3. Never flat.

BOARDS: four shelf boards with their TOP surface at exactly y56, y104, y152
and y200. Each is 4px of step 6, then a 1px step-2 line, then a 5px shadow
stepping 3 → 2 → back panel. This shadow is the most important element in the
sprite — it is what gives the carcass depth.

Two story details: a faint pale rectangle on the second board where a book sat
for years, and one board with a visible bow.

Keep the region between each board's underside and the next clear — spines
place at runtime on a 26px pitch."
```

### S8 · Recolour the existing nine — re-open each `.aseprite`

```
"Open each of bookshelf, desk, chair, bench, album, journal, notebook,
decor-plant, decor-candle. Map every colour onto the room ramp, keeping the
existing value relationships. Then: REMOVE all outlines, replacing them with
value separation or a single darkest-step pixel where a silhouette would be
lost. Dither any flat region over 30x30. Draw contact shadow into the base as
steps 2 and 1. Do not change the silhouette or the dimensions.

Then add rung 3 (material) and exactly two rung-4 story details per sprite.
Name both before drawing."
```

> ⛔ **STRIKE THE OUTLINE CLAUSE BEFORE PASTING THIS.** the owner ruled
> 2026-08-07 that `#2c2823` outlines stay (§R). The sentence beginning
> *"Then: REMOVE all outlines…"* is void; outlines are preserved as `SPRITES.md`
> §2 specifies. The rest of the prompt — ramp mapping, dithering, contact
> shadow, rung 3 + two rung-4 details — stands, and remains gated on the
> palette ruling.

### S9 · Fix the four that vanish — plant · icons · divider · cursors

```
"These four separate by HUE, so they disappear when hue is removed.
Re-separate them by VALUE: no two adjacent elements may share a ramp step.
Verify by converting to greyscale — every element must still read.

Cursors are the ONE exception to the no-outline rule: they sit on unknown
backgrounds and need a 1px outline to survive light and dark. Keep them as
three separate 16x16 files — CSS cursor: url() cannot slice a sheet."
```

Worth doing regardless of style: anything that vanishes when hue is stripped
is also invisible to a colourblind user and washed out in sunlight.

### Landing procedure — a plain file copy loses the whole set

`tests/test_sprite_geometry.py` runs `tools/gen_room_sprites.py` before
asserting, so everything in `assets/room/` is regenerated on the next test
run. Either port the draw calls into the generator so it stays the source of
truth, or add each filename to the `FINALIZED_BY_HAND` skip-guard first. Then
regenerate twice — `git status` must be clean the second time. Per
`SPRITES.md` §7.3.

---

## 06. MOTION — six laws, five pieces, four waits

The laws are read out of the shipped candle CSS, not invented. Any new motion
satisfying all six will look like it belongs.

1. **Film strips, never CSS transforms of shape.** `background-position-x`
   across a horizontal strip, `background-size: N00% 100%`, keyframe
   `0% → (N ÷ (N−1) × 100)%`. Six frames → 120%. It is *not* N×20 — that only
   coincidentally works at N=6. A 4-frame strip needs **133.333%**, a 5-frame
   strip 125%. Get this wrong and every frame but the first renders sliced.
2. **`steps()` takes a hardcoded integer, never a `var()`.** A themeable step
   count silently breaks the strip. Positional movement steps in whole sprite
   pixels — no sub-pixel travel.
3. **Fail visible.** The still `<img>` stays in the DOM at `visibility:hidden`
   and the strip is a background. A 404 leaves the static sprite showing,
   never a hole.
4. **Reduced motion is designed, not disabled.** If the motion carries
   meaning, a distinct still frame carries it instead. If it carries none, it
   disappears entirely.
5. **One-shots remove their own class at `animationend`.** No timers guessing
   durations, no state left set. Nothing fractional ever rests — a transform
   may pass through non-integer scale, but must be removed rather than settled
   into.
6. **Ambient motion is for light sources only.** Everything else is still. The
   birds break this deliberately and are the only exception. The camera may
   move; the page being read never does.

### M1 · The shelf gaining a book — worth more than all the others combined

```
"When a save crosses a fill threshold, play a one-shot .shelf-gained on the
fill overlay: the new overlay swaps in at the threshold moment, and the candle
plays .reaching. Remove both classes at animationend. No sparkle, no scale, no
sound."
```

A shelf that quietly grows is decoration. A shelf that visibly gains a row
*because of something you saved* is the product loop. Make the crossing
legible.

### M2 · Dust in the light shaft — cheapest warmth here, no new art

```
"Add four dust motes inside the existing light-shaft element — single ramp
step-8 pixels drifting upward. Durations 13, 17, 19 and 23 seconds: no common
factor, so they never visibly realign. Day and dusk only; remove entirely at
night and under reduced motion."
```

> Repo note: there is no light-shaft element today. M2 depends on §04.

### M3 · Birds past the window — 80 × 8, 4 frames of 20 × 8 → `birds-anim.png`

```
"/pixel-new 80x8 — a 4-frame horizontal film strip of two small birds in
silhouette on the cool ramp, wings up / mid / down / mid. Give the second bird
a ONE-FRAME LAG so they don't beat in unison.

Then a scheduler in app.js reusing the candle's class machinery: fire once
every 90-300 seconds, day and dusk only, never at night. Strip is 4 frames →
background-size 400% 100%, keyframe 0% → 133.333%, steps(4)."
```

The 90–300s interval is the number to defend hardest. It is *deliberately* too
rare to demo — you will open the app to show someone and the birds will not
come. That is the point: it is for the person who lives here, not the person
being shown around. The one-frame wing lag is what makes it read as two
animals rather than one stamped twice.

### M4 · Window frame separation — 88 × 88 → `decor-window-frame.png`

```
"Open decor-window.aseprite. Duplicate it, then delete everything except the
frame, mullion and sill, leaving the glass area transparent. Export as
decor-window-frame.png. Birds animate BEHIND this, in front of the glass — so
they pass behind the mullion, which is what sells the depth."
```

### M5 · NOT DOING — four traps

**Swaying trees:** needs three window files in perfect register; at 24px a
conifer's sway is one pixel. **A swaying plant:** not a light source, so it
breaks law 6 for no gain. **Fluttering notebook pages:** the candle already
carries "something waits" — two objects signalling one state teaches the user
to trust neither. **Rain on the glass:** genuinely lovely, but needs a weather
state that does not exist. Defer; don't fake it.

### M6 · SYSTEM STATE — the four waits

Motion tells you *that* something is happening. Only words tell you *what*.

```
0–400ms    nothing. The result simply arrives.
400ms–4s   candle .thinking-glow only. No text, no spinner.
4s–20s     + ONE line in the librarian's voice naming the real task
           ("reading back through February", never "Loading…")
20s+       honest line + "leave it for now". Motion NEVER changes.
on finish  600ms minimum visible duration, or it reads as an error.
```

- **Thinking** — built. Add only the ladder. Never alter the pulse rate; a
  faster pulse reads as anxiety.
- **Blessing** — cross `.thinking-glow` → `.reaching` over 300ms. The note
  appears with NO animation. A blessing that slides in is a toast, and a toast
  is something you dismiss.
- **Reflection** — stream it as it generates. Streaming is content, not
  decoration; law 4 forbids decorating text that has *already* arrived. Once a
  paragraph is on the page it never moves again.
- **Config change** — NO thinking state; it's a local write. The change itself
  is the feedback: one 300ms transition on the thing that changed, then a
  plain sentence and an undo that outlives the animation.

**The missing half — highest priority in this section.** `sessionFlameSync()`
correctly *derives* both classes from `SESSION.busy`, so an orphaned glow is
impossible by construction — good design. But that flag is set true at 4 sites
and cleared at 8, all by hand, with **no `finally` block anywhere in
`app.js`**, and nothing bounds how long it can stay true. Audit the 8 clears;
then put one 45s wall-clock guard where the flag is set. Bounding the flag
once beats auditing every path. On timeout the librarian apologises in her own
voice, the candle returns to its resting breath with no failure state, and
partial output is kept, never rolled back.

**Test before the freeze: pull the network cable mid-reflection.** Whatever
the room does next is the real answer to "can users tell if something is
working".

> ✅ **SHIPPED 2026-08-07 — the bound half.** Verified in source: 4 sets, 8
> clears, one `finally` in `app.js` and none of it in the session region.
> `sessionBusyBegin()` is now the only place the flag goes true and arms a
> 45s bound; `sessionTimedOut()` ends the run through whichever shipped
> failure ending fits the shape in flight (turn → `sessionTurnFailed`, close →
> `sessionCloseFailed`, otherwise → `sessionQuietEnd`), so no fourth kind of
> state joins the room. Every clear site is **untouched**: the guard carries a
> run epoch, so a guard that outlives its own run is inert by construction
> rather than by anyone remembering to disarm it. `sessionFlameSync()` releases
> it from the same derivation that drops the classes — hygiene, not
> correctness. Driven (not grepped) in `tests/test_session_flow.cjs` group 7
> against a fake clock, and mutation-verified six ways.
>
> **Still open:** the pulled-cable test — the bound guarantees the room
> *recovers* from it, but nobody has run it.

> ✅ **SHIPPED 2026-08-24 (26.98-05) — the two speaking rungs and the finish
> floor.** The ladder is complete. `SESSION_WAIT_NAME_MS` 4000,
> `SESSION_WAIT_LEAVE_MS` 20000 and `SESSION_MIN_VISIBLE_MS` 600 sit beside the
> shipped 45000. Both rungs arm from `sessionBusyBegin()` — the one arming
> site — carrying the **same run epoch the bound carries**, and release from
> `sessionBoundRelease()`, so a rung that outlives its own run is inert by
> construction. **No second arming site; none of the 8 clear sites touched.**
> The 600ms floor is derived and released from `sessionFlameSync()`, the same
> derivation that drops the thinking classes, and it is a **floor, never an
> added delay**: a 50ms run is held to 600, a 900ms run clears at 900.
>
> ⛔ **MOTION DID NOT CHANGE, AND THAT IS EVIDENCE RATHER THAN A CLAIM.** Not a
> keyframe, not a class, not the pulse rate, not one byte of `tokens.css`. Two
> proofs, both positive equalities and neither a negative search: the three
> styling blocks governing the wait surface are hashed against the phase
> baseline `7a1f23b`, and every field the ladder writes is recorded as the
> clock moves and compared to a literal set, asserted **separately** at each
> threshold. Driven at 3999/4000, 19999/20000 and 44999/45000 against a fake
> clock; every count is an equality against a literal integer.
>
> ⚠ **A measurement here almost lied.** The first off-by-one drive moved the 4s
> threshold by one millisecond and only the value pin went red — the driven
> arms read the threshold out of source and ticked against it, so the clock
> shifted with the constant it was guarding. The arms now tick against
> hand-written literals. **A check derived from what it guards kills drift and
> then hides it.**

**⛔ THE LADDER'S THREE SENTENCES ARE HERS — ruling 4, 2026-08-24 (§R).**

```
0–400ms    nothing. The result simply arrives.
400ms–4s   candle .thinking-glow only. No text, no spinner.
4s         + "still reading."
20s        "this one is taking a while."
           "leave it for now — whatever arrives will still be here."
           ⛔ the 4s line is REPLACED, not stacked under. Motion NEVER changes.
on finish  600ms minimum visible duration, or it reads as an error.
```

⛔ **The block at the top of this section is the ORIGINAL sketch and its
example line — `"reading back through February"` — IS NOT WHAT SHIPS.** She was
offered that warmer naming-the-work shape and refused it. See §R ruling 4.

### M7 · Marking a note joyful or not — the symmetry contract

If "joyful" gets a warm bloom and "not joyful" gets a shrug, you have told the
user which answer you hoped for — and their answers will drift over months.
For a self-reflection tool that is a failure of the entire premise. Both
answers must be met with identical generosity.

```
"Both options settle into a chosen state over exactly 200ms — background and
border only, no transform, no scale. Identical duration, identical number of
properties animated, identical brightness; they may differ only slightly in
hue. Neither uses --accent.

The unchosen option reduces emphasis over the same 200ms and stays fully
clickable. Switching plays the same transition in reverse with no confirmation
and no message. The note content is untouched. Under prefers-reduced-motion
the state applies with no transition."
```

Acknowledge, never celebrate — a nod, not applause. A reward for disclosing
how you felt about a hard month is grotesque. The librarian says **nothing**
on individual marks; a response every time turns reflection into surveillance
and teaches people to mark what they want said back. **The test:** turn the
animation off. If the chosen state is still obvious, the motion was doing its
proper job. If the interaction becomes unclear, the motion was carrying
information the static design should have carried.

---

## 07. BUILD ORDER

Lighting before sprites — the renderer tells you what the sprites need.

| # | Step | Status |
|---|---|---|
| 0 | **Settle D-1 and D-2** in §02. The owner only. | ✅ **DONE 2026-08-07** — D-1 = (b), D-2 = yes |
| 1 | **Audit the 8 `SESSION.busy` clears** and bound the flag. Independent of all art work; ship it first. | ✅ **DONE 2026-08-07** (see §M6) |
| 2 | **Swap the lighting model** — ramp index shift replacing the multiply overlay, on the existing Bayer map. Delete the vignette. Add the CI assertion. | ✅ **OFFLINE HALF DONE 2026-08-24 (26.98-01→03); the IN-APP half is rung C and is CUT — see the dated block below.** ⛔ The status text that follows is the 26.98-01 reading and is KEPT rather than rewritten, because it is what the row said while the work was in flight and a status quietly overwritten is a status nobody can audit. What changed since: the night-band red it describes was closed by HER OWN RULING (R-6, the target moved to the frame's ambient floor), not by tuning; the ramp collapse it names is real and unchanged. — **the 26.98-01 reading:** 🟡 **IN PROGRESS (26.98-01).** The prototype exists and is tracked: `assets/aseprite/handoff/light.py` runs the §04 model offline over the nine pinned objects and emits day/dusk/night frames, and the CI assertion is live at `tests/test_room_light.py`. ⚠ It is **RED on the night lit band** — the committed night frame reads 0.09% lit against a 3.0% target, which is the ramp collapse §04's own author reported; closing it is the next plan's work. ⛔ "Delete the vignette" is NOT done and must not be read as deleting the Phase 25 welcome-back (see repo note 3). The in-app swap is still ahead; read the four §04 repo notes first — there is no compositor **in the app** and no `lightingLayerFor()`. |
| 3 | **Add the wedge** for day and dusk; candle stays radial. Tune to the §04 numbers. | blocked on 2 |
| 4 | **S1 bg.png, then S2–S3 windows** — all three windows in one session so the dither matches. | ⛔ blocked on the §R palette ruling |
| 5 | **S4–S5 shelf states.** The empty case is the first thing a new user ever sees. | ⛔ blocked on the §R palette ruling |
| 6 | **S8 recolour the nine, then S6–S7 station plates.** | ⛔ blocked on the palette ruling; the outline clause is struck |
| 7 | **M1 shelf-gained, then M6 the four waits.** Both are product-critical. | M1 blocked on S5; **M6 ✅ DONE 2026-08-24 (26.98-05) — the ladder is complete, her three sentences shipped, §R ruling 4** |
| 8 | **S9, M2 dust, M3–M4 birds, M7 symmetry.** Last, and droppable if the freeze bites. | M7 is free; the rest are blocked |
| + | **D-2's spine variants** — a second 22×40 set, plus §M7's symmetry contract extended to the shelf and a law-3 UAT beat on a lopsided fixture. | new, from D-2; gated on the palette ruling |

**Nothing here needs new geometry.** Every coordinate, the `--x/--y/--w/--h`
contract, `place()`, the hotspots and the station board lines at y 56/104/152/
200 all stay exactly as they are. That is what the pinned-coordinate
architecture bought, and it is why a total visual rework can land inside the
freeze.

**Two caveats the author makes on their own illustrations.** The walls and
floors in every test render produced for this document are quick blockouts,
not `bg.png` — treat them as demonstrations of mechanism, not art to match.
And the day beam reads too weakly while the night render has *zero* pixels
above 0.42 against the reference's 2.7%; both need tuning in-engine, which is
what the CI assertion is for.

---

### ✅ PHASE 26.98 CLOSED — 2026-08-24 — WHAT LANDED, AND WHAT WAS CUT AND CARRIED

**This is a RECORD OF A CUT, NOT AN AMENDMENT TO THE LADDER.** The ladder was
pre-committed to be cut FROM THE BOTTOM, and the phase's own contract says in
as many words that it can be declared complete with rungs **C, D and E all
cut**. So the three rungs are written down here as **the next phase's ladder**,
each with its precondition named — not deleted, not renumbered, and not quietly
folded into something else. A cut that leaves no record is indistinguishable
from work nobody remembers dropping.

#### What landed

| Rung / step | What shipped | Where |
|---|---|---|
| **A** (the offline light pass) | the §04 model run OFFLINE over the nine pinned objects, emitting day/dusk/night frames, with a **luminance gate that can fail** — it was RED at the phase baseline on the night lit band, by design | 26.98-01 |
| **A** | the window keeps its **cool ramp**; the named **draw-after-light exempt set** and its by-name fence; the **real per-band night window** (R-2) | 26.98-02 |
| **A — CLOSED** | the **control arm** built from `assets/room/` through the identical pass, the three-row side-by-side sheet she ruled from, and R-3's `#2c2823` outlines landed | 26.98-03 |
| sprite gates | the palette check **widened to all 37 PNGs and inverted**; `#2c2823` asserted PRESENT in 36 name-pinned sprites; **`FINALIZED_BY_HAND` seated inside `write_png`**, the generator's single write choke point, proven by a control arm that must change | 26.98-04 |
| **B** (§M6) | the **wait ladder** — the 4s and 20s rungs and the 600ms floor, driven on a fake clock at 3999/4000, 19999/20000 and 44999/45000 — carrying **HER THREE SENTENCES** (R-4) | 26.98-05 |
| **B** (§M7) | the first **persistent, symmetric chosen state** in the app, class-based so it can carry a media query, measured in computed style on a live page | 26.98-06 |
| the close | **SC-8 turned from a habit into a gate** — nine coordinates, both board-line tables *and their agreement*, both `place()` hosts, the Phase 25 welcome-back and the keyframe set, all pinned by value and each seen red; and **the pulled-cable beat run by a machine for the first time** | 26.98-07 |

#### What was CUT, and carried forward as the next phase's ladder

| Rung | What it is | Precondition, carried forward | Status |
|---|---|---|---|
| **C** | the **in-app light pass** — the compositor the offline arm stands in for | needs rung A's palette ruling to be **yes**. ⛔ **IT WAS NO** (R-5, 2026-08-24: *"Keep the current colours."*) | **CUT.** Stays cut until a later ruling changes A's answer |
| **D** | the **sprite work** — S1–S9, the repaint | needs A's ruling **AND** `FINALIZED_BY_HAND` | **CUT.** ⚠ HALF ITS PRECONDITION IS NOW MET: `FINALIZED_BY_HAND` was **built in 26.98-04** and is live at the generator's write choke point. The other half — A's ruling — is no |
| **E** | the **art-dependent motion** — M1 shelf-gained (needs S5), M2 dust, M3–M4 birds | needs **D and C** | **CUT.** Both its preconditions are cut, so E is the last rung and cannot be climbed first |

⚠ **AND A NOTE THAT MAY SHORTEN THE LADDER RATHER THAN LENGTHEN IT, RECORDED
AS ANOTHER SESSION'S CLAIM AND EXPLICITLY *NOT VERIFIED BY US*.** §R above
carries it in full: `docs/DESK-REDESIGN-HANDOFF.md` §6 — a parallel design
session's untracked working file — states that **baking the light into the art
needs no runtime lighting code at all**, only art variants plus one line to
make the station background time-aware, since the room already sets a single
`body.time-*` class at landing. **If that holds, rung C is not merely deferred
but may be UNNECESSARY.** ⛔ Nothing in this phase acted on it, built it, or
weakened the cut record on the strength of it. It is written down so the plan
that owns the ladder next can test the claim rather than rediscover it.

#### SC-7's reading, written down rather than left to be inferred

SC-7 says no sprite in `assets/room/` carries a colour outside *"whichever
palette the ruling settled on"*, and SC-10 requires this phase to be
declarable complete **either way the ruling went**.

**She ruled `keep-the-current-palette`** — R-5, 2026-08-24, *"Keep the current
colours."* — **so the two coincide and there is nothing to reconcile:** the
palette the ruling settled on IS the shipped one, and 26.98-04's `ALLOWED_RGB`
(`CHARTER_RGB` 12 + `ADDED_RGB` 3) is keyed to exactly that, measured off the
shipped art rather than copied from a table.

⚠ **The counterfactual is recorded too, because a reader who only sees "SC-7
green" cannot tell which world produced it.** Had she ruled `adopt-the-ramps`,
SC-7 and the shipped art would NOT have coincided on the day this phase closed:
the sprites are painted in the shipped hexes and the repaint is **rung D, which
is cut**. The reading in that world would have been — the ruling binds going
FORWARD, the shipped art is measured against WHAT SHIPS TODAY, and the repaint
is rung D, carried, with its precondition named alongside the other carried
rungs. Either way the phase closes; neither way is inferred.

⛔ **R-5 IS RECORDED NARROWLY AND STAYS NARROW.** It is *not now*, **not**
*never*; it was made on a **confounded comparison** and §R says so; and it does
**not** touch her same-day permission for the desk and new-sprite palette.

#### The two halves a person still owes, named rather than quietly claimed

| Criterion | Machine half | The half a person settles |
|---|---|---|
| **SC-5** — the pulled cable | ✅ `tests/test_pulled_cable.cjs`: a real sitting begun, the connection dropped from OUTSIDE through the runner's own network emulation and the drop verified on the page, the room measured back to rest inside the shipped 45s bound with one of HER sentences, a candle at its resting derivation, everything already painted still standing, and a real dispatched tap starting a new sitting while still offline | ⛔ **OUTSTANDING — DELIBERATELY HELD, NOT SKIPPED.** SC-5 says *watched live*. The beat asks HER to turn her own network off part-way through a sitting. It was **not run and not put to her** on 2026-08-24: a 651-item Photos import against her real iCloud-backed library had been destroyed by a server restart that night, she had not yet decided whether to re-run it, and a real network drop during a re-run would have killed it again. A peer session asked that the path be left undisturbed. ⚠ **SC-5 IS THEREFORE PARTIALLY SATISFIED — the automated half is evidence, the watched half is owed.** |
| **SC-6** — the feeling-mark symmetry | ✅ `tests/test_feeling_mark_symmetry.cjs`, live: identical durations and property lists, ΔL inside a third of one 8-bit channel step, and under emulated reduced motion both durations 0s **with the distinction still standing** | ⛔ **OUTSTANDING.** Whether the chosen mark is still **obvious to a person** with animation off is a judgement no instrument makes. 26.98-06 explicitly declined to claim it and said so in its own suite header; 26.98-07 does not self-certify it either. ⚠ **SC-6 IS THEREFORE PARTIALLY SATISFIED.** |

⛔ **NEITHER GREEN LINE MAY BE QUOTED AS THE CRITERION.** Both suites say so in
their own headers, so a later reader who never opens this document still finds
the limit attached to the evidence.

---

## 01. SUPERSEDED — do not paste these

Eight rules from earlier documents that this handoff retracts. Listed because
they exist in prompt-block form in the design project, and pasting one
alongside §03 produces sprites that fight the renderer.

| Topic | What the earlier docs said | This doc's final |
|---|---|---|
| Dithering | "No dithering under 40px, flat fills only," then "flat at ≤30×30." | **Required** on every flat region over 30×30. Ordered Bayer, 8×8 aligned. `SPRITES.md` §7 was right as written. |
| Outlines | Swap `#2c2823` → `#4a3a2c` warm brown. | **No outlines at all.** Separate forms by value. *(⛔ blocked — §R)* |
| Palette | 14 tokens; then 25 colours across five hue-shifted GBA ramps. | **One 10-step ramp** for the whole room, plus a parallel cool ramp used only inside the window. *(⛔ blocked — §R)* |
| Lighting | Radial warm + cool pools, an ambient multiply, and a vignette. | **Directional wedge + ramp index shift.** Delete the multiply and the vignette entirely. |
| Contact shadows | Blurred dark ellipses under each object at ~20% opacity. | Drawn **into the sprite** as ramp steps. No blur, no separate DOM layer — blur is not a pixel-art operation. |
| 8×8 tile grid | "Keep — costs nothing to honour." | **Ignore it.** Six of ten sprites aren't multiples of 8 and their coordinates are pinned. |
| SVG filter theme | "An SVG filter does the whole theme in forty lines." | **Preview tool only.** A filter maps luminance to one fixed ramp and cannot do per-material work. Recolour the source files. |
| Window scenery | A rolling green hill under a gradient sky. | **Three conifers,** as in the shipped sprite. The hill flattened it into a logo. |
