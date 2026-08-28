# The three seeded reflection examples — THE CANONICAL TEXT

**This file is the one source.** Two other places carry a **deliberate copy**
of the three examples below, and a test proves all copies are byte-equal
after normalisation:

| Consumer | Where | Added by |
|---|---|---|
| the room's librarian | `LIBRARIAN_REFLECT_PROMPT` in `server.py` | 26.995-07 |
| the vault ritual | the `/journal-reflection` skill's `SKILL.md` | 26.995-08 |

**⛔ FIX THE SOURCE, NEVER THIS GATE.** If the equality test goes red, one of
the three copies drifted. Edit the copy back to this file — or, if this file
is what changed, carry the change into every copy in the same commit. A gate
loosened to admit a drifted copy is worth nothing, and re-typing a phrase
into the test instead of lifting it puts the value in a fourth place.

---

## ⛔ WHY THERE ARE COPIES AT ALL, RATHER THAN ONE SHARED REFERENCE

This duplication is **accepted debt with a gate on it**, not an oversight,
and the two reasons are independent — fixing either one alone changes
nothing.

**1. The examples cannot be factored out of the prompt constant.**
`tests/eval_reflection.py` is the offline judge, and its contract is
**text-only extraction**: it reads `server.py` as text and never imports it,
lifting `LIBRARIAN_REFLECT_PROMPT` through a literal evaluation that
**raises on any concatenation** and on any call over a non-literal argument.
So the moment the examples become `EXAMPLES` spliced into the constant, the
harness goes dark — and it goes dark **without turning the test suite red**,
because the harness sits outside the suite glob. That is the worst shape a
failure can take here, so the constant stays a pure literal and the examples
live inside it.

**2. The vault ritual's file is outside both git repos.** The
`/journal-reflection` skill lives under the user's home directory, not in
this repo and not in the planning repo, so no build step and no import can
reach it from here.

**What would force a promotion to a single shared source read at run time:**
the harness gaining the ability to import the app, or dropping its text-only
lift; **or a third consumer appearing.** At two copies a byte-equality test
is cheaper than the refactor. At three it is not, and the constraint should
be revisited rather than the gate widened.

---

## ⛔ WHAT THESE EXAMPLES ARE FOR, AND WHY THEY ARE THE ENFORCEMENT

The shipped prompt used to say *"no advice posture"* some forty words below
three worked examples that **all ended by telling her to do something** —
and 16 of 17 measured essays ended with a forward move anyway.

**A shown example beats a stated prohibition.** The rule text is the cheap
half and it is not the half that works. So every ruling this phase made
about shape and ending is expressed here, as what these three examples
**do** — and a static gate in `tests/test_reflection_shape.py`, written five
waves before these examples existed and with the shipped prompt unread,
judges them.

What the three demonstrate between them:

- **they are a RANGE, never a menu.** Three points to interpolate between. A
  closed list of permitted shapes is the same predictability on a longer
  cycle, which is the exact failure this phase exists to kill.
- **not one of them ends with a forward move.** ⛔⛔ **AND SINCE 2026-08-21 A
  FORWARD MOVE IS NOT LEGAL AT ALL — this bullet said the opposite for two
  days after she ruled.** It used to read *"A soft one stays legal and is
  never required — and it is never shown here, because the moment it appears
  in an example it becomes the ending again."* That was written `d76fef3`,
  2026-08-19 19:51, and never touched again; her ruling landed two days
  later and reached `REFLECTION_JUDGE_PROMPT` and the vault ritual's
  `SKILL.md` but not this file, so **the repo said two different things
  about one rule.** Her verbatim answer, CHOSEN FROM AN OFFERED SET OF TWO
  (`26.995-COPY.md` § C-4 beat 2 — she was shown the canonical essay's own
  closing line first, and chose the wide reading knowing that essay would be
  thrown away):

  > Any ending that points you toward doing something is out, gentle or not.

  ⛔ **THE SENTENCE THE ROOM ENFORCES IS LIFTED, NOT COMPOSED** — one rule
  worded two ways is two rules. `REFLECTION_JUDGE_PROMPT`: *"gentle counts:
  an ending that points her toward doing anything at all is `gives_advice`,
  however softly it is put."*

  The three endings are a sign-off after a line of hers; a line of hers with
  nothing after it; and nothing at all.

  ⬜ **THE ONE THING HER RULING DOES NOT SETTLE IN ITS OWN WORDS, AND NO
  AGENT MAY SETTLE IT.** D-10's gentle form — *"maybe that's worth holding
  onto"* — was quoted inside the option she DECLINED, and it remains this
  phase's standing legal control (`26.995-VALIDATION.md`, which predates that
  sitting and requires it to PASS). The shipped screens keep it legal. That
  adjacency is recorded as a residual in `26.995-COPY.md` § C-4 beat 2 and is
  **hers to narrow; nobody may narrow it for her.**
- **not one of them opens by counting.** Her own words for the defect are
  literal: *"the AI just counting the same words in the notes."* Every arm
  she rejected opened by tallying; every arm she chose opened with something
  happening.
- **the short one answers a HEAVY evening.** On a heavy pool the room is
  told, verbatim, `there is a lot here — 24 pieces.` and nothing anywhere
  told it that a lot of material may still be answered briefly. Example (c)
  is that demonstration: three sentences, against twenty-four pieces.
- **all three carry a heading.** ⛔ THIS IS A DECISION ABOUT THE EXAMPLES AND
  ONLY ABOUT THE EXAMPLES. The owner ruled it verbatim on 2026-08-19 —
  *"All three keep a title"* — before any prompt text or example was
  written. It does **not** restore the *requirement*: the prompt no longer
  demands a heading, the reflection's name is its own separate answer, and a
  headingless reflection is perfectly legal. See the honest-record note at
  the foot of this file.
- **today's essay form is deliberately NOT one of the three.** It is the
  shape the model drifts to unprompted, and spending an example slot on it
  pays to reinforce the habit this phase exists to break.

**⛔ NOTHING HERE IS HERS.** No real folder name, no real note title, not one
sentence she wrote. Invented throughout — this file is tracked in a repo
that gets staged publicly.

---

## The three examples

Each is fenced by the delimiter the gate declared at wave 1. **The fence is
a contract and the direction matters: the gate declares the shape and this
text conforms to it, never the other way round.**

### (a) a letter to her — ends on a sign-off straight after a line of hers

===EXAMPLE===
## the long way round

dear one,

i went back to the tuesday page before i understood why it had stayed with me. you wrote "i took the long way round again and did not mind it," and then, further on, "the bus went past and i let it." i do not think you meant those two to sit beside each other, but they do, and i have been reading them together all evening.

what strikes me is that you explained neither one. you put them down and went on to something else.

"i took the long way round again and did not mind it."

yours, the librarian
===EXAMPLE===

### (b) a handful of separate pieces — ends on something she wrote, nothing after it

===EXAMPLE===
## small weather

the balcony chair moved. in march it faced the door and by july it had been turned all the way round to the rail, and nothing in these pages says you decided that.

you keep a running argument with the bread. "too dense again," you wrote in april, and in june, "too dense, but i ate the whole thing."

there is a green notebook that only comes out when it rains.

"i think i am only really honest about the weather."
===EXAMPLE===

### (c) one single held thing — a few sentences, then it stops, ending with nothing at all

**Given to the room that evening, verbatim:** `there is a lot here — 24 pieces.`

===EXAMPLE===
## the door left open

i am staying with one thing tonight. you left a door open on purpose more than once this month — the balcony, the hallway, the back of the van — and every time it is the air you wrote about, never the door. "it smelled like rain coming," you wrote, and left it there.
===EXAMPLE===

---

## Measured, not assumed

Every number below was taken with the shipped functions, not estimated.

| | (a) letter | (b) pieces | (c) held thing |
|---|---:|---:|---:|
| `ends_by_instructing` | False | False | False |
| `opens_by_tallying` | False | False | False |
| address words / words | 5 / 107 | 3 / 83 | 3 / 65 |
| address per 100 words | 4.67 | 3.61 | 4.62 |
| `address_density_verdict` | pass | pass | pass |
| clinical screen | clean | clean | clean |
| law-3 absence screen | clean | clean | clean |
| exclamation marks | 0 | 0 | 0 |

The owner's address floor is **0.30 per 100 words**, re-ruled 2026-08-19.
All three clear it by more than twelvefold. ⚠ That is **not** evidence the
writing is warm — the floor is gameable and is a floor against exactly one
failure mode, the writing turning away from her altogether.

---

## ⚠ THE HONEST RECORD ON THE HEADINGS

The owner was shown three options and chose `all-headings` — *"All three keep
a title"* — in her own words, before a line of any example existed.

The option cards **did** tell her, at the moment of choosing, that this is
the least visible change, that it **re-teaches the shape the heading ruling
had just deleted**, and that the room copies what it is *shown* far more
reliably than what it is *told*.

They **did not** tell her, at that moment, that two of the three shapes
already existed as writing she had read and judged on the blind pairs, and
that **both of those removed the heading.** That was raised with her
immediately afterwards, in plain terms, with an explicit offer to switch.
**She did not take it up, and the ruling stands.**

So (a) and (b) here are those two arms **with a heading added** — minimal,
in her register, and with nothing else about either arm rewritten.

⚠ **What she has still never seen is these two arms with the headings on
them.** That is an open judgement, not a closed one.
