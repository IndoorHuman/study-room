"""librarian_call.py — the ONE call seam between the room and a model.

Replaces `server.py`'s `run_librarian_call`, which drove the `claude` CLI as a
subprocess. A caller hands over a JOB NAME and a payload; this module decides
which tier that job sits in, which model fills the tier right now, how the
request body is shaped for that provider, and what a failure is called. The
caller learns none of it (26.93 D-01).

WHY A SEPARATE MODULE (D-12). `server.py` is already ~8,000 lines. The table,
the three adapters, the transport and the resolver move out into the shape this
repo already uses (`study_lib.py`, `adapters/`). This does NOT weaken the fence:
the claim being protected is "store bytes reach a model through one function and
nowhere else", which is provable wherever the file sits as long as the static
gate follows the code. `tests/test_no_push.cjs` lists this file in APP_SOURCES
for exactly that reason, and `study_lib.build_librarian_payload` — the fence
builder — stays exactly where it is, untouched.

WHY RAW urllib AND NOT THE ANTHROPIC SDK. Product law 8: nothing is installed.
The app has zero runtime dependencies and keeps it that way, so the transport is
stdlib `urllib.request`. There is no SDK here to inherit retries, timeouts or
error classes from — which is precisely why D-08 and D-09 had to be decided
rather than assumed.

HOW THE BIG LITERALS STAY PUT (D-01). The nine schemas and prompts are NOT
copied into this file. `JOBS` carries a `schema`/`prompt` slot per row that is
None until `server.py` binds its own module constants at import time via
`bind_job_literals`. The table points at the literals; it does not own them. A
row still holding None is refused by `call_librarian` with an exception — never
a failure token, because an unbound row is a programming error, not a bad call.

WHAT NEVER CROSSES THIS SEAM
  * a tier name from a caller — there is no parameter for one (D-01)
  * a credential — fetched by `_send` at send time, never stored on `Routing`,
    never returned, never logged (#28)
  * the provider's own error text — only a token from `FAILURES` (D-06); this
    is what keeps a traceback from ever reaching her while still letting the
    front door tell a 401 from a 429 from no network
  * money — the seam has no business holding a rate table. `usage` carries the
    provider's own token counts verbatim plus who reported them; what gets
    shown is map ticket #34's, downstream and still open (D-02)

Return shape, every job, every provider: {ok, structured, model, usage, failure}.
`result` and `verdicts` are deliberately absent — both were dead weight, verified
against the code 2026-08-12.

⚠ ONE SHAPE, PLUS EXACTLY ONE MORE KEY ON A REFUSAL (26.93-05). A call that was
never made because the tier it was pinned to has no fill this job may use is not
an answer, and dressing it as one costs the caller the only distinction that
matters. Such a return carries the same five keys AND a sixth, `refusal`, holding
{outcome, empty_tier, filled_tiers}: `outcome` is `absent` when the job simply
does not exist on this machine and `refused` when a fill is missing, `empty_tier`
names the tier that had nothing usable, and `filled_tiers` names the tiers that
DO — as DATA, so a surface can offer a one-time explicit choice. ⚠ THE OFFER IS A
SURFACE'S JOB AND IS NOT BUILT HERE, and nothing in this module ever substitutes
one tier for another on its own: the silent downgrade is exactly how reflections
end up written by a 7B without her ever choosing that (#27 section 5).
"""

import json
import os
import socket
import threading
import time
import types
import urllib.error
import urllib.parse
import urllib.request

# The house's crash-safe write primitive, and — since 26.93-04 — the derivation
# of the two paths under her home. Stdlib-only itself; importing it binds no
# socket and performs no I/O.
import study_lib


# ---------------------------------------------------------------------------
# ---- the closed vocabularies ----------------------------------------------

# The three tiers a job can sit in. #27 names a FOURTH — `on-device` — which is
# deliberately absent here: it is macOS Vision, a framework call with no request
# body and no provider, and it belongs to Phase 26.94's Swift program. Adding it
# to this tuple before that program exists would make the tier table lie.
#
# ⚠ ANSWERED, 26.94-02: THE PROGRAM NOW EXISTS (`tools/vision_read.swift`,
# spawned once per import by `server.run_vision_pass`) AND `on-device` STILL
# DOES NOT JOIN THIS TUPLE. The hand-off above is settled here rather than left
# open, because an unanswered hand-off is how the subprocess-site count became
# an argument three phases running.
#
# The reason is that every member of this tuple is CONSUMED as an LLM tier:
# `startup_librarian_check` reads `routing.fills` and `routing.provenance` per
# tier and prints a provider and a model for each, and every JOBS row routed
# through `call_librarian(job, payload_text, routing)` needs a request body, a
# `max_tokens`, a schema and retry semantics. macOS Vision has none of them —
# no provider, no model, no body, no tokens, no schema, no retry. A row for it
# would be NULL IN EVERY COLUMN its consumers read, which is the tier table
# lying in the opposite direction from the one this comment already warns
# about. So the reader is named in the start-up report as one line AFTER the
# tier loop (plan 03) instead.
#
# The accepted debt, stated rather than discovered later: the start-up report
# carries a special case outside its loop, and `_TIER_WORDS` (server.py) — the
# only place a tier's plain-words label is learned — does not describe this
# one. ⚠ WHAT WOULD OVERTURN THIS: a SECOND non-LLM tier. At two the special
# case is a pattern, and the right move becomes promoting the general
# representation (a tier whose provider is optional) and demoting the
# LLM-specific columns into the adapters that need them. At one it would be
# generalising from a sample of one.
TIERS = ("local", "cheap-cloud", "good-cloud")

PROVIDERS = ("anthropic", "openai", "ollama")

# The closed failure register (D-06). One static line stopped being honest the
# moment there were three providers. Each surface turns a token into its own
# plain sentence; the token itself never reaches her eyes.
FAILURES = (
    "no_key",             # nothing to authenticate with
    "bad_key",            # the provider explicitly rejected it (401/403 ONLY)
    "rate_limited",       # 429 — says nothing about whether the key is good
    "provider_down",      # 5xx — likewise
    "offline",            # no network reached the provider at all
    "ollama_not_running",  # nothing answering on the local port
    "model_not_pulled",   # answering, but without the model asked for
    "truncated",          # the answer was cut off (decided BEFORE any parse)
    "declined",           # the provider refused on its own safety grounds
    "malformed",          # answered, but the shape is unusable
    "timeout",            # the wait ran out
)

# The four that say nothing about whether the request itself was good, so
# re-asking is honest (D-08). Everything else in FAILURES is never retried:
# re-sending a truncated 7B answer with identical input mostly reproduces the
# truncation, and re-asking differently is a REGENERATION — a job's decision,
# never the transport's.
RETRIED = ("rate_limited", "provider_down", "offline", "timeout")


# ---------------------------------------------------------------------------
# ---- the job table (D-01) --------------------------------------------------

# Every row names exactly one tier, and a caller names only a row. That is what
# turns the map's routing ruling from a habit into a test: nothing above this
# seam can put reflections on a 7B, because nothing above this seam can say
# "7B" at all.
#
# `max_tokens` and `retries` are OWNER-APPROVED VALUES (2026-08-12, plan 26.93-01
# task 1). Output tokens are the expensive half and the app capped them nowhere
# before this table existed. Reflection's ZERO retries is DATA, not a branch:
# a turn IS the product there, so a silent re-ask would hand her a different
# reflection than the one that was written.
#
# ⚠⚠ `permitted_local` IS THE CONFIG ASK'S CARVE-OUT, AND IT IS DATA FOR THE
# SAME REASON REFLECTION'S ZERO IS (26.93-05, #28 section 1). Every cloud job
# may fall to her own machine when there is no cloud fill — a room with her own
# machine in it is a complete room — EXCEPT this one. The config ask is the only
# job that changes a SETTING from a plain sentence, and a 7B answering `"off"`
# where the schema wanted `false` turns something off she meant on. So with no
# cloud fill the ask is ABSENT rather than local, and Manage stays the back door
# that always works.
#
# ⚠ IT IS A FIELD, NEVER A BRANCH ON THE JOB'S NAME. An `if job == "config_ask"`
# is something a later reader deletes while tidying and never notices; a `False`
# in this table is something they have to mean to change. The same argument the
# retries column already won.
JOBS = {
    "import_presort": {
        "tier": "local", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 1500, "permitted_local": True,
    },
    # ⛔ `cleaning_labels` AND `heading_proposals` WERE DELETED HERE (map #50,
    # #87 retired the labelling pass, #95 ruled the code goes). Both rode the
    # same unreachable worker behind one entry point, so both left in one
    # change — never one at a time, because a list that under-states what the
    # room does is worse than one naming something stranded (#74).
    #
    # ⚠ NOTHING REPLACES THEM. The shipped tidy-up is the readability pass,
    # which asks no model anything: where a sentence ends is not a judgement
    # (#89). If a labelling pass ever returns it returns as a ROW HERE, and
    # the standing per-job list she reads follows by derivation — that is the
    # whole reason the list is derived from this table rather than typed.
    "librarian_note": {
        "tier": "good-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 1200, "permitted_local": True,
    },
    # ⚠ 2000 -> 6000, AND `effort` ARRIVES WITH IT (map #50, #96 ruling 2).
    # These two numbers may not be set apart, and that is the whole finding.
    #
    # 2,000 was never sized against a real reflection. The corpus that DEFINES
    # a good one is the owner's own accepted register, counted with the
    # provider's tokenizer: 1,347 · 1,563 · 1,578 · 1,747 · **2,305**. ⛔ ONE OF
    # THE FIVE ESSAYS SHE ACCEPTED AS GOOD DOES NOT FIT THE CAP AT ALL, the
    # median sits at 79%, and that is the ESSAY ALONE — `coda`, `question` and
    # one `whys` entry per row she flagged ride the same budget. A too-long
    # answer is DISCARDED WHOLE, so the failure lands on the sitting she sat
    # through, at the end of it.
    #
    # ⚠⚠ WHY `effort` IS NOT A SEPARATE IMPROVEMENT: ON A THINKING MODEL THE
    # CAP IS A SPEND, NOT A CEILING. #96 measured the room sending no `effort`
    # and no `thinking` while thinking is ON BY DEFAULT on this model — and the
    # thinking is ELASTIC TO THE CAP: ~0 tokens at the shipped 2,000, filling
    # to 3,500-4,400 on the same pool at 8,000. So raising the cap alone buys
    # thinking nobody asked for, at her expense, and buys the essay much less
    # room than the number suggests. ⛔ THIS CORRECTS #66's "`max_tokens` is a
    # CEILING not a spend" for every job on this fill.
    #
    # ⚠ 6,000 IS THE PAIRED NUMBER: worst measured answer 2,695 + CJK 1.24x =
    # ~3,370, refine +25% = ~4,200, thinking ~150. WITHOUT `effort` set the
    # floor is 8,000 — and even 8,000 is not safe at a 60-note pool with a
    # generous walk, which is itself the argument for pinning effort rather
    # than buying headroom.
    #
    # ⚠ THE CJK PREMISE WAS PESSIMISTIC AND IS CORRECTED: English 3.28
    # chars/token vs Chinese 0.87 is 3.8x per CHARACTER, but the same MEANING
    # takes ~3x fewer Chinese characters, so a Chinese-heavy essay costs
    # ~1.24x, not ~3x. Per-character is the wrong unit for prose.
    #
    # ⛔ WHAT THIS DOES NOT FIX: `whys` is a LIST and a cap cannot bound a
    # list (#66's ladder ends at "nothing stops a model mid-answer"). Its
    # length is set by HER TAPS and bounded by nothing. How many things one
    # walk may ask about is an open decision of hers, not a number to invent
    # here.
    #
    # ⚠⚠ AMENDED 2026-08-19 (26.995-02, D-40): `medium` -> `high` AND
    # 6,000 -> 8,000, ON BOTH REFLECTION ROWS. Amends the 2026-08-12
    # owner-approved pair. ⛔ BOTH VALUES ARE HERS AND SHE SET THEM IN THAT
    # ORDER — first the PAIRING (offered measure-first, effort-only, raise
    # both, or hold it out of the phase, she chose raise both together,
    # knowing it overwrites a number she had approved on measured evidence),
    # then the FIGURE, after the measurement she authorised. Recorded in full
    # at 26.995-COPY.md C-10 and C-11.
    #
    # ⛔⛔ AND THE PREDICTION THIS WHOLE PAIRING RESTED ON WAS REFUTED BY THE
    # MEASUREMENT — read it before quoting the paragraph above. The worry was
    # that `high` inside a fixed cap would spend what the answer needs. On the
    # binding evening `high` used LESS than the old setting, not more: default
    # n=8, median 4,714, worst 6,904; high n=6, median 4,277, worst 5,806.
    # NOTHING TRUNCATED IN 8 OF 8 CALLS AT HIGH, and one of them produced ZERO
    # thinking tokens — `high` is not a floor on thinking.
    #
    # ⚠⚠ THE FINDING THAT WAS NOT THE QUESTION, AND IT IS WHY THE BUDGET MOVED
    # AT ALL: the 6,904 call was at the OLD effort, against the shipped 6,000.
    # SO 6,000 HAS ALWAYS BEEN OCCASIONALLY TOO SMALL ON A HEAVY EVENING,
    # independently of the effort setting. The risk was never `high`; it is
    # how much one heavy evening varies from the next.
    #
    # ⚠ 8,000 IS THE WORST CALL EVER RECORDED PLUS REAL MARGIN — it clears
    # 6,904 by about 1,100 and clips none of the 32 calls on file. She was
    # offered 7,000 (the smallest that clips nothing), 10,000 and leaving it
    # at 6,000, each with its price ceiling, and chose 8,000. ✅ Raising the
    # cap costs nothing on a call that would have finished anyway: billing is
    # on tokens PRODUCED, and the eight measured calls cost $0.036-$0.212 each.
    # ⛔ That is a statement about BILLING and does NOT reinstate #66's "a cap
    # is a ceiling not a spend" — the elasticity above is still true, which is
    # exactly why the effort is pinned rather than the cap merely raised.
    #
    # ⚠ LIMITS, RECORDED BEFORE ANYONE LEANS ON THIS: n=8 at high and 24 at
    # default, on ONE holdout corpus; the comparison is high against DEFAULT,
    # never against `medium`, because no clean medium reading exists — if
    # medium sits below default the rise is UNDERSTATED here; the prompt arm
    # is #20's shipped rulings, not this phase's rewritten prompt; and nothing
    # in it measures QUALITY. A longer answer is not a better one.
# ⛔⛔ AMENDED AGAIN 2026-08-25 (26.998): 8,000 -> 12,000 ON BOTH REFLECTION
# ROWS. Amends her own 2026-08-19 figure, and the FIGURE IS HERS by the same
# ceremony that produced 8,000: she was offered a quarter more, half again as
# much, twice as much, and leaving it alone — each with its price ceiling
# stated — and chose **`Half again as much`**. ⚠ Chosen from an offered set.
#
# ⛔ WHY IT HAD TO MOVE, AND THE CAUSE IS HER OWN RULING RATHER THAN A DRIFT.
# A reflection may now END by naming older things she said yes to, and she
# ruled `Let it choose, including none` — **NO CEILING ON HOW MANY**. She held
# that answer after being told plainly that an over-long answer is discarded
# WHOLE and that she would sit through a reflection and get nothing. The
# ending is therefore unbounded by her decision, and the only honest response
# is to give the whole answer real room rather than to quietly bound her
# ending after she declined to.
#
# ⚠ THE TWO FACTS SHE WAS GIVEN, both already measured in this room and
# neither invented for the occasion: raising a cap costs nothing on a call
# that would have finished anyway, because billing is on tokens PRODUCED —
# and this fill's thinking is ELASTIC TO THE CAP, so it is not quite free.
# She was told both.
#
# ⚠ AND THE EQUALITY STILL BINDS: both rows move together, or a generation
# turn and every refine turn of the same sitting write to different rules.
    "reflection": {
        "tier": "good-cloud", "schema": None, "prompt": None,
        "retries": 0, "max_tokens": 12000, "effort": "high",
        "permitted_local": True,
    },
    # ⚠ ONE NUMBER SERVES BOTH, but the two rows now have a REAL reason to
    # differ for the first time: a refine turn re-emits the WHOLE revised
    # essay plus a `coda` plus a `question` (both of which fire only on
    # refine), so its output is always >= a generation turn's — measured
    # 1,711/1,752 against ~1,385 on the same pool, about +25%. That +25% is
    # inside the headroom, so they stay equal until something measures
    # otherwise. This comment is here so a later reader knows the equality is
    # a finding, not an oversight.
    #
    # ⚠⚠ AND THE EQUALITY IS NOW PINNED BY VALUE rather than merely described:
    # `test_the_two_reflection_rows_carry_HER_pair_and_carry_IT_EQUALLY`
    # asserts both rows' effort and both rows' cap, AND asserts the two rows
    # against each other. Both rows point at ONE prompt literal and ONE
    # schema, so a change applied here and forgotten above would leave a
    # generation turn and every refine turn of the same sitting writing to
    # DIFFERENT rules — and each row alone would still look deliberate.
    # ⛔ 2026-08-19's amendment was applied to BOTH; her ruling and the
    # measurement behind it are recorded above the generation row.
    "reflection_refine": {
        "tier": "good-cloud", "schema": None, "prompt": None,
        "retries": 0, "max_tokens": 12000, "effort": "high",
        "permitted_local": True,
    },
    # ⚠ 1200 -> 1500 (map #66, 2026-08-13) — amends the 2026-08-12 owner-approved
    # value on measured evidence. At 1200 this job DESTROYED 7 of 16 calls
    # (44%): the answer is a LIST, nothing told the model how long it could be,
    # and an over-cap answer is lost WHOLE, never trimmed. Bounding the ask at
    # LIBRARIAN_INSIGHTS_CAP took that to 1 in 8 — but a full 10-connection
    # answer measured 1142 tokens against 1200, which is 5% of headroom, and
    # `why` length varies per run. ⚠ A CEILING IS NOT A SPEND: output is billed
    # as produced, not as permitted, and the prompt now caps the count — so the
    # extra 300 costs nothing and buys the margin that stops the whole answer
    # being thrown away. Keep this ABOVE 336 + 78.6 * LIBRARIAN_INSIGHTS_CAP.
    # ⚠⚠ THE JUDGE'S OWN ROW (26.995-25). HER RULING, 2026-08-21, verbatim:
    # "The model judges each one" — 26.995-COPY.md § C-4 continuation beat 3.
    # She held her 2026-08-18 answer with BOTH costs on the table, including
    # the one nobody had told her: that judging is a new job, so it becomes a
    # permanent row on the standing per-job list she reads, and the room will
    # not start until two more sentences of hers exist for it.
    #
    # ⛔ IT COULD NOT BORROW AN EXISTING ROW, AND THAT WAS RE-MEASURED AT HEAD
    # BEFORE THIS ROW WAS WRITTEN rather than taken from a plan or a summary:
    # `call_librarian` resolves a row out of this table BY NAME, raises on an
    # unknown one, and its own contract states there is no argument, keyword
    # or attribute by which a caller may name a tier, a model, a schema or a
    # prompt. A judge riding the `reflection` row would inherit that row's
    # prompt and schema and answer with a reflection. Its own row is the only
    # shape this seam offers.
    #
    # ⚠ TIER: `good-cloud`, AND THE CHEAPER RUNG WAS CONSIDERED AND REFUSED.
    # What this job decides is the boundary her own ruling turns on — a
    # closing line that wonders is legal and a closing line that hands her a
    # chore is not, and the two differ by INTENT rather than by structure.
    # That is exactly the separation the cheap non-model mechanism failed at,
    # in both directions, which is why she was asked again at all. And the
    # arithmetic runs the same way: a false rejection here costs a WHOLE
    # second reflection on the expensive rung, so buying a cheaper judge that
    # is wrong more often is not a saving.
    #
    # ⚠ `max_tokens: 600` — the answer is ONE enum word and nothing else (the
    # schema carries a single property and no free text anywhere, so a
    # rejected draft can never ride its own reason out of this call). 600 is
    # the `blessing_selection` figure, chosen for the same shape of answer,
    # and it leaves real margin for a thinking model's default thinking on a
    # row that sets no `effort`. ⛔ It is a SPEND and it is stated by value in
    # 26.995-25-SUMMARY.md rather than left to be discovered.
    #
    # ⚠ `retries: 2` — NOT the reflection rows' zero, and the difference is
    # the reason those two are zero: "a turn IS the product there, so a
    # silent re-ask would hand her a different reflection than the one that
    # was written." A judge is not the product. Re-asking it produces no new
    # writing at all, and NOT re-asking it costs her a whole regenerated
    # essay, because an unreachable judge is fail-closed and rejects.
    #
    # ⚠ `permitted_local: True` — her own machine may answer it, exactly as
    # it may answer the reflection it is judging. The one False in this
    # column is `config_ask` and its reason does not apply here.
    "reflection_judge": {
        "tier": "good-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 600, "permitted_local": True,
    },
    "connections": {
        "tier": "cheap-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 1500, "permitted_local": True,
    },
    # ⚠ THE ONE FALSE IN THIS COLUMN. See the paragraph above; changing it is
    # a decision about whether a 7B may move her settings, not a tidy-up.
    "config_ask": {
        "tier": "cheap-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 800, "permitted_local": False,
    },
    # Written in Phase 26.95, and BOUND — `server.py` calls
    # `bind_job_literals("blessing_selection", ...)` at import like every
    # other row, so this job really does send.
    #
    # ⚠ THIS SENTENCE USED TO SAY THE ROW WAS NEVER BOUND, AND IT WAS STALE
    # RATHER THAN WRONG-AT-THE-TIME (26.99-04, L-10). It was true while the
    # schema and prompt did not exist; 26.95 wrote them and nobody came back
    # here. Corrected in the plan that makes every job's call recordable,
    # because the standing per-job list and the privacy record are both
    # DERIVED FROM THIS TABLE — so a reader deriving from `JOBS` while
    # reading a comment that says a row does not send would conclude the
    # room sends less than it does, on the one surface that exists to answer
    # exactly that question.
    "blessing_selection": {
        "tier": "cheap-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 600, "permitted_local": True,
    },
    # ⛔⛔ HER SETUP PASS (26.998, § W-11 beat 4 — WRITTEN BY HER). The room
    # reads her own older writing ONCE, learns what she loves from it, and
    # every reflection afterwards consults what it learned instead of her
    # archive. ⭐ It is the only design statement in this phase that dissolved
    # the problem its options were fighting over: four candidates were all ways
    # of rationing a 16 MB archive into a 400 KB budget on EVERY sitting, and
    # hers sends it once.
    #
    # ⚠ TIER: `good-cloud`, AND THE TIER IS HERS. Asked who should read her own
    # writing for the one pass — the cheap rung at about seven cents, the best
    # rung at about thirty, or her own machine for nothing — with the cost of
    # each stated including that a small local model would most likely hand her
    # something thin and waste the trial rather than settle it, she took
    # **`The best reader`** (2026-08-24). ⛔ Chosen from an offered set; the
    # options were an agent's and she was told so.
    #
    # ⚠ `retries: 0` — NOT the two most rows carry, and the reason is money
    # rather than product. `RETRIED` includes `timeout`, and a request that
    # timed out on this side may have completed and been BILLED on the other:
    # a silent second attempt would charge her twice for a pass whose whole
    # promise to her is *once*. ⛔ A failed pass comes back to her as a failed
    # pass and is re-approved by her, which costs a sentence and never a
    # second bill. ⚠ This is NOT the reflection rows' reason (there a turn IS
    # the product); do not merge the two comments.
    #
    # ⚠ `max_tokens: 4000` — a SPEND, stated by value rather than left to be
    # discovered, and it is the one number here no owner ruling covers. What
    # comes back is prose she must be able to RULE on, and an over-cap answer
    # is discarded WHOLE (the `connections` row's 44% lesson). No `effort` is
    # pinned, so this fill's own default applies and thinking is elastic to the
    # cap: at the worst the output adds about a dime to her ~30¢ pass, and she
    # was told both figures before a penny moved.
    #
    # ⚠ `permitted_local: True` — her own machine may answer it, so choosing it
    # later is a setting of hers rather than a code change. The one `False` in
    # this column is `config_ask` and its reason does not apply here.
    "archive_learning": {
        "tier": "good-cloud", "schema": None, "prompt": None,
        "retries": 0, "max_tokens": 4000, "permitted_local": True,
    },
    # ⛔⛔ HER FINDING PASS (26.9985, R-1/R-2/R-11). The librarian reads what
    # the room already lets it read, ONCE, to find the things that might be
    # about a subject she would rather it left alone — and then it ASKS. It
    # proposes; nothing is set aside unless she says so (R-1, law 7). What it
    # found is KEPT (R-9, `librarian/subjects.json`) so a thing she said no to
    # can be re-asked without a page being read or a penny spent again.
    #
    # ⛔ THE EXACT SLICE AND ITS EXACT COST GO TO HER BEFORE A PENNY MOVES
    # (R-2, carrying 26.998 § W-12 unweakened). `tools/subject_finding_trial.py
    # --price` sends nothing; nothing else that could send exists yet, and
    # nothing may be built that sends without her priced word.
    #
    # ⚠ TIER: `cheap-cloud` IS HERS — R-13 as AMENDED BY HER (2026-08-26,
    # both beats recorded in 26.9985-RULINGS.md § R-13). She first chose the
    # best reader at the measured ~$29.88 at-most; after ONE chunk the
    # provider's own reported usage projected ~$36-37 — a fifth over what
    # she was told — so the run was STOPPED and the corrected number taken
    # back to her (the R-2 discipline applied twice). She then chose
    # **`Finish with the cheaper reader`** over finishing at the corrected
    # price and over stopping. ⚠ Chosen from an offered set. ⛔ So this ONE
    # reading was done by two readers: chunk 1 by claude-opus-5, the rest by
    # this tier's fill — recorded, never smoothed into one name.
    #
    # ⚠ `retries: 0` — `archive_learning`'s money reason, not the reflection
    # rows': a timeout on this side may have completed and been BILLED on the
    # other, and this pass's whole promise is *once* (R-9). A failed chunk
    # comes back as a failed chunk and is re-approved by her word, which
    # costs a sentence and never a second bill.
    #
    # ⚠ `max_tokens: 2000` — a SPEND, stated by value, no owner ruling covers
    # it. The answer is a short list of subject names with the ids of the
    # things that carry them — no prose, no free text about her (the schema
    # has no field for any). 2000 clears a generous list with margin, because
    # an over-cap answer is discarded WHOLE and a discarded chunk is a
    # re-approval she has to sit through (the `connections` row's 44% lesson).
    #
    # ⚠ `permitted_local: True` — her own machine may answer it; R-2's offer
    # included the free rung, and choosing it later is a setting of hers.
    "subject_finding": {
        "tier": "cheap-cloud", "schema": None, "prompt": None,
        "retries": 0, "max_tokens": 2000, "permitted_local": True,
    },
    # ⛔⛔ HER TIDY PASS (26.9985, R-14 — `Tidy first`, 2026-08-26). The
    # finding pass kept 262 proposals and the cheaper reader names one
    # subject many ways; before the § A offer, the librarian folds ITS OWN
    # list. ⛔ THE SLICE IS THE NAMES IT WROTE AND NOTHING ELSE — no item
    # ids, no statuses, nothing of hers; her § G sentence promises it ("It
    # does not read your things again") and `tests/test_subject_aside.py`
    # gates the payload. ⛔ It refuses to run once any entry has left
    # `proposed` — a tidy over her rulings would be the room rearranging
    # them.
    #
    # ⚠ TIER: `cheap-cloud`, an agent's placement under her stated cost
    # (~a cent, told to her in the R-14 option she took): the material is
    # model-authored names, never her writing, and the task is folding
    # duplicates. `retries: 2` — not a once-pass and not the money case: a
    # re-ask costs a fraction of a cent and re-reads nothing of hers.
    # `max_tokens: 8000` — a SPEND: the answer must re-emit every group
    # with member indices in one piece (an over-cap answer is discarded
    # WHOLE, the connections row's 44% lesson), and thinking on this fill
    # is elastic to the cap.
    "subject_merge": {
        "tier": "cheap-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 8000, "permitted_local": True,
    },
    # ⛔⛔ HER CLEARING PASS (26.9985, R-16 — `Yes — now, and every time
    # after`, 2026-08-26, chosen with the exact slice and cost stated in
    # the option she took). When she sets a subject aside, the librarian's
    # own notebook (librarian/learned.md) still carries lines about it;
    # this job reads THE NOTEBOOK THE ROOM ITSELF WROTE plus the subject's
    # model-written names, and answers with line INDICES only — code maps
    # them to exact lines and `study_lib.apply_subject_removal` (the
    # proven R-3/R-4/R-6 engine) does the taking out, keeping and showing.
    #
    # ⛔ THE SLICE IS THE NOTEBOOK AND THE SUBJECT'S NAMES AND NOTHING
    # ELSE — no item ids, no titles, not one byte of her vault. Her § I
    # sentence promises the keeping ("It keeps what it takes out, so you
    # can put it back") and tests/test_subject_aside.py gates the payload.
    #
    # ⚠ TIER: `cheap-cloud` IS HERS — R-16's option named the cheaper
    # reader at under one cent per run (measured on her real notebook,
    # ~6.7KB, with R-13's corrected estimator), the best rung at ~ten
    # cents offered and passed over. ⚠ This does NOT touch R-8's *once*:
    # the once-only reading was of HER writings; the notebook is the
    # room's own file, re-read at each set-aside on her R-16 word.
    #
    # ⚠ `retries: 2` — the merge row's reason, not the money case: a
    # re-ask re-reads nothing of hers and costs a fraction of a cent.
    # ⚠ `max_tokens: 2000` — a SPEND, stated by value: the answer is a
    # short list of integers (an over-cap answer is discarded WHOLE, the
    # connections row's 44% lesson).
    "subject_clearing": {
        "tier": "cheap-cloud", "schema": None, "prompt": None,
        "retries": 2, "max_tokens": 2000, "permitted_local": True,
    },
}


class LibrarianCallError(Exception):
    """A programming error at the seam — an unknown job, an unbound row, a fill
    naming a provider with no adapter. Deliberately NOT a failure token: tokens
    describe a call that was made and went wrong, and none of these ever reach a
    socket.

    ⚠ A TIER WITH NO FILL LEFT THIS LIST IN 26.93-05 and is now a REFUSAL she
    can be told about, not an exception. It is not a programming error: it is
    what a machine with no cloud key looks like to `config_ask`, and a room that
    crashed on it would be reporting her setup as a bug."""


def bind_job_literals(job, schema_json, prompt):
    """Point a JOBS row at the big literals that live in `server.py`.

    Called at import time from the module that OWNS each literal, so the schema
    and prompt strings stay exactly where they have always been and this file
    never holds a copy of one. Idempotent by construction — re-binding a row
    just re-points it."""
    row = JOBS.get(job)
    if row is None:
        raise LibrarianCallError("unknown job: " + repr(job))
    row["schema"] = schema_json
    row["prompt"] = prompt


# ---------------------------------------------------------------------------
# ---- routing: resolved ONCE, in the handler, handed down frozen (D-04) -----

# Where a tier's fill came from. Machine tokens, never rendered — each surface
# maps one to its own plain line. Mirrors `resolve_voice_model`'s four, because
# fail-closed is correct but INVISIBLE is not: without `env_rejected`, a shell
# value the gate refused would look identical to a plain default.
SOURCE_STORED = "stored"
SOURCE_ENV = "env"
SOURCE_ENV_REJECTED = "env_rejected"
SOURCE_DEFAULT = "default"

# Where each provider answers. Ollama's is the loopback address on purpose: the
# fence cares about resolved ADDRESSES, never provider names.
#
# ⚠ ONLY THE OPENAI ONE IS REQUIRED TO BE SETTABLE (#27 section 8): Moonshot's
# API is OpenAI-shaped, so an OpenAI-shaped third provider must be a SETTING
# rather than a code change. Making the other two settable is NOT in scope —
# they are here as defaults, and `resolve_routing` happens to accept an override
# for any of the three because refusing two of them would cost a branch and buy
# nothing. Nobody should read that as a promise.
DEFAULT_BASES = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com",
    "ollama": "http://127.0.0.1:11434",
}

# One number per tier (D-09), replacing the single 300-second value that was
# sized for a subprocess talking to a fast cloud model. A 7B measured at 24-26
# tok/s writes 2000 tokens in roughly 80 seconds, so local is generous (it is
# slow and it is free) and cloud is tight. Owner-approved 2026-08-12.
DEFAULT_TIMEOUTS = {
    "local": 300,
    "cheap-cloud": 60,
    "good-cloud": 120,
}

# ⚠⚠ THE LOCAL RUNG'S INPUT WINDOW, DECLARED (map #63, evidenced by #57).
#
# Ollama applies its OWN default context window when a request does not name
# one, and that default is far smaller than anything this app sends. An app
# that has never stated its window can neither size a batch nor notice an
# overrun — and the overrun is SILENT: the model simply never sees the tail.
#
# ⚠ MEASURED (#57, 2026-08-13, qwen2.5:7b, the shipped cleaning payload over a
# 15-note vault — the SAME 49,319-character payload both times):
#
#     undeclared  ->  2,050 input tokens,  1 label carrying an INVENTED id,
#                     15 of 15 notes never mentioned, 0 proposals,
#                     and the run REPORTED SUCCESS
#     32768       -> 12,431 input tokens, 17 labels, 0 silent, 15 of 15
#
# That is map #55's "the shipped tidy-up returns ZERO on a real vault and
# reports success", and its whole cause was this missing field. ~84% of the
# payload never reached the model.
#
# ⚠ IT IS A DECLARED BUDGET, NOT A TUNING KNOB. Its value is what makes a
# batch size arguable at all: #63 sizes batches in tokens per tier against
# this number, so raising or lowering it without re-sizing the batches
# re-opens the same silent truncation from the other side.
LOCAL_NUM_CTX = 32768

# The model that fills each tier when she has never chosen. A fill names a
# PROVIDER AND A MODEL (D-05) so exactly one provider serves a tier at any
# moment and there is no precedence race to resolve — which is what makes the
# front door able to say who is answering BEFORE any call is made.
#
# The local tier is always her own machine: it is the only rung where "your
# words never leave the room" is literally true.
LOCAL_FILL = ("ollama", "qwen2.5:7b")

ANTHROPIC_FILLS = {
    "cheap-cloud": ("anthropic", "claude-haiku-4-5"),
    "good-cloud": ("anthropic", "claude-opus-5"),
}

# ⚠ STILL PROVISIONAL, AND SAYING SO IS THE HONEST ANSWER. The OpenAI model ids
# are the one thing in these tables that has not been checked against a live
# provider. 26.93-04 witnessed the ANTHROPIC path end to end — the owner's own
# key, one real request, the room printed that it worked — but she chose the
# shell for OpenAI, so no OpenAI key exists here and this half is unwitnessed
# exactly as 26.93-CONTEXT F-03 described it. 26.93-05 was written expecting to
# settle these; it settles the SHAPE and leaves the NAMES labelled, because a
# name that has never been offered to a provider is a guess whatever plan writes
# it down, and a guess wearing a settled label is worse than a guess.
# ⛔⛔ THE NAMES ABOVE WERE NOT MERELY UNWITNESSED — THEY DID NOT EXIST.
# Checked against OpenAI's own model documentation on 2026-08-27: there is no
# `gpt-5.1` and no `gpt-5.1-mini`. The current family is GPT-5.6 — `sol` (the
# frontier model, 1.05M context, $4/$20 per million), `terra` (balanced,
# $2/$12) and `luna` (cost-optimised, $0.20/$1.20) — and the room would have
# asked for a model no provider has.
#
# ⚠⚠ AND THE FAILURE WOULD NOT HAVE READ AS ONE. A rejected model id comes
# back through the same path an empty credit balance and a dropped network do,
# and that path surfaces as *the librarian had nothing to say* rather than as
# an error (measured on a separate run the same week: 93 days recorded as
# refusals with no call ever made). So anyone who ran this room on an OpenAI
# key would have met silence, not a message — the app going quiet instead of
# saying what is true, which is this project's own named defect class.
#
# ⚠ STILL UNWITNESSED, AND STILL SAYING SO. There is no OpenAI key on this
# machine, so no call has been made with these ids either. What changed is
# that they now come from the provider's own current documentation rather than
# from a guess, which is the difference between unverified and wrong.
OPENAI_FILLS = {
    "cheap-cloud": ("openai", "gpt-5.6-luna"),
    "good-cloud": ("openai", "gpt-5.6-sol"),
}


# ---------------------------------------------------------------------------
# ⚠⚠ THE ALLOW-LIST — ONE PER TIER, AND AN EXPLICIT LITERAL (D-04, 26.93-05).
#
# WHY A LITERAL AND NEVER A SLICE, A COMPREHENSION, OR A DERIVATION OVER THE
# THREE TABLES ABOVE. `server.py`'s own MODEL_PROPOSABLE_KEYS carries this rule
# with its reason attached, and it applies here word for word: a derived
# allow-list binds membership to the SHAPE of whatever it was derived from, so
# a later edit somewhere else silently changes what is allowed without touching
# the line that defines it. An allow-list must be EDITED to change, and an
# explicit literal is the only shape where a membership change is visible in
# the diff.
#
# THE REPETITION ABOVE IS THE PRICE OF THAT, AND IT IS PAID DELIBERATELY:
# the defaults are spelled once up there and again here, and the seam suite
# asserts every default is a member of its own tier's list. Drift is caught
# by a case rather than prevented by a derivation, which is the trade this
# rule asks for.
#
# ⚠ EVERY ENTRY IS A `(provider, model)` PAIR, NEVER A BARE MODEL STRING
# (D-05). That is what makes exactly ONE provider serve a tier at any
# moment, so there is no precedence race to resolve — and it is what makes
# Plan 26.93-08's start-up line possible at all, because that line names
# WHO IS ANSWERING before any call is made, which is impossible if
# selection is "try one, then try the other". Nothing in this module ever
# tries a second provider after a first one failed.
#
# ⚠ HER OWN MACHINE IS A LEGAL FILL FOR BOTH CLOUD TIERS, and that is not a
# fallback: it is the resolved answer when no cloud key is present anywhere
# (#28 section 1 — a room with her own machine in it is a complete room), named
# up front rather than reached for after something failed. `config_ask` is the
# one job that may not take it; that carve-out lives in the JOBS table above as
# data, never as a branch here.
#
# ⚠ THE CONTENTS ARE THE SHIPPED DEFAULTS AND NOTHING ELSE. Widening this to a
# roster of every model a provider offers would be pretending to knowledge
# nobody has checked against a live provider (see the OpenAI note above); it is
# already enough to refuse an invented model id, which is the whole job.
TIER_FILLS_ALLOWED = {
    "local": (
        ("ollama", "qwen2.5:7b"),
    ),
    "cheap-cloud": (
        ("anthropic", "claude-haiku-4-5"),
        # ⛔ 2026-08-27: `gpt-5.1-mini` did not exist — see the block above
        # OPENAI_FILLS. The cost-optimised model in OpenAI's current family
        # is `gpt-5.6-luna`.
        ("openai", "gpt-5.6-luna"),
        ("ollama", "qwen2.5:7b"),
    ),
    "good-cloud": (
        ("anthropic", "claude-opus-5"),
        # ⭐⭐ HER RULING, 2026-08-26 (26.99955 UAT, G-…-04): "Let your pick do
        # the writing." Her model picker governs exactly this tier — its five
        # jobs ARE "your reflections and desk notes", which is what the picker's
        # own sentence promises — and until this line her pick reached no call
        # at all, so choosing the cheap reader changed nothing while the card
        # said it had. Widening HERE rather than teaching the seam a per-call
        # model is what keeps "every job has exactly one tier" a test instead
        # of a habit: the job still resolves by tier, and the tier's fill is
        # the thing she is allowed to choose.
        #
        # ⚠ THIS IS A REAL WIDENING OF A FAIL-CLOSED SHELL GATE and it is not
        # smuggled in: `LIBRARIAN_REFLECT_MODEL` / `LIBRARIAN_NOTE_MODEL` can
        # now name the cheap reader for this tier as well. That is acceptable
        # for THIS pair and for no other, because this exact pair already fills
        # `cheap-cloud` and has been answering live calls on her own key for
        # weeks — the widening offers a model the room has WITNESSED.
        #
        # ⛔ SONNET IS STILL ABSENT, DELIBERATELY, AND THAT IS ALSO HERS. The
        # picker offered three readers and the room had only ever run two; she
        # was told so and ruled "Offer the two it has run", so the third leaves
        # the picker rather than being tried for the first time on her own
        # writing. `LIBRARIAN_PRICES` still prices it — pricing a model is not
        # supporting one, and that block's own paragraph says so.
        ("anthropic", "claude-haiku-4-5"),
        # ⭐⭐ AND SONNET CAME BACK 2026-08-27, HER RULING THE NEXT DAY. The
        # paragraph above stands unedited — it was right on what was known when
        # it was written. ⛔ WITHOUT THIS LINE THE ROOM WOULD NOT START: the
        # picker's own import-time guard refuses an alias whose pair no tier
        # allows, so offering sonnet and omitting it here is a hard refusal to
        # boot, not a quiet downgrade. ⚠ It is still a model this machine has
        # never called; she accepted that knowingly.
        ("anthropic", "claude-sonnet-5"),
        # ⭐⭐ THE OPENAI THREE — HER RULING, 2026-08-27. She asked for a
        # picker on an OpenAI key and for three readers on it, the same
        # count Anthropic offers, and these are the three OpenAI's own
        # documentation lists today: `sol` reads closest and costs most,
        # `terra` sits between, `luna` is quickest and cheapest.
        #
        # ⛔ ALL THREE ARE ALLOWED **HERE** RATHER THAN AT A CALL, which is
        # the same shape her Anthropic pick already takes: the picker
        # governs this tier's FILL, and `librarian_call`'s own docstring
        # forbids a caller naming a model. Widening here is what keeps
        # "every job has exactly one tier" a test rather than a habit.
        #
        # ⚠ THIS IS A REAL WIDENING OF A FAIL-CLOSED SHELL GATE, stated
        # rather than smuggled: `LIBRARIAN_REFLECT_MODEL` /
        # `LIBRARIAN_NOTE_MODEL` can now name any of the three for this
        # tier. That is the identical trade she accepted for haiku on
        # 2026-08-26 and for sonnet on 2026-08-27.
        #
        # ⚠⚠ AND ALL THREE ARE UNWITNESSED. No OpenAI key exists on this
        # machine, so this room has never made a single OpenAI call. She
        # was told that before ruling — the same way she was told it about
        # sonnet — and chose to have the picker anyway. ⛔ Recorded as
        # ACCEPTED, not resolved: witnessing them is still worth doing, and
        # until it happens the first live OpenAI call anyone makes will be
        # a real one on their own writing.
        ("openai", "gpt-5.6-sol"),
        ("openai", "gpt-5.6-terra"),
        ("openai", "gpt-5.6-luna"),
        ("ollama", "qwen2.5:7b"),
    ),
}

# The env names that carry a cloud credential, and — by membership alone — the
# roster of providers that need one at all. PRESENCE is all that is tested at
# resolve time (`key_present`, a boolean); the VALUE is read once, at send time,
# by `_send`, from the shell first and her keys file second.
KEY_ENV_NAMES = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
}

# ---------------------------------------------------------------------------
# ---- 26.99-08 (D-09/D-19): the shell's ADDRESS, and how it is spelled ------
#
# ⚠ A MAP RATHER THAN A SINGLE NAME, and the membership is the argument. It
# mirrors `KEY_ENV_NAMES` above deliberately: these are exactly the providers
# where redirecting the address REDIRECTS A CREDENTIAL WITH IT, which is the
# whole reason consent is owed before the first call. Ollama is absent because
# it takes no credential — its address is settable through her settings file
# and D-19 gates that path, but nothing here teaches a shell name for it, and
# a third entry would be a wider promise than anything asked for.
#
# ⛔ BOTH NAMES HAD ZERO OCCURRENCES CODEBASE-WIDE BEFORE THIS LINE. Nothing
# in this app has ever read either one, so this is the first appearance of
# both — which is precisely why it cannot ship alone. See `_base_from_env`.
BASE_ENV_NAMES = {
    "anthropic": "ANTHROPIC_BASE_URL",
    "openai": "OPENAI_BASE_URL",
}

# ⚠ V5, FAIL-CLOSED, AND ONLY ON THE SHELL PATH. A base URL is a URL, and the
# only check the settings override has ever applied is *is it a non-empty
# string* — so `bases["anthropic"] = "hello"` is accepted today and fails at
# send time with something unreadable. This gate refuses anything the
# transport could not speak, on the shell path.
#
# ⚠ AND THE SETTINGS PATH IS DELIBERATELY NOT LOOSENED TO MATCH — NOR
# TIGHTENED. Not loosened, because a shell value is somebody reaching past the
# room and fail-closed is the right posture for that; not tightened, because
# her own file is HERS to edit and narrowing it here would silently refuse an
# address that works, which is the same asymmetry the `fills` loop above
# already argues (shape here, membership on the shell). What would overturn
# this is the settings path gaining a witnessed shape of its own.
#
# ⛔ AND NEITHER SCHEME PROVES LOCALITY (D-08). `http://127.0.0.1:4000` passes
# this gate and is very often LiteLLM forwarding to the cloud. Nothing in this
# module may read a loopback address as "nothing leaves this machine".
BASE_ALLOWED_SCHEMES = ("http", "https")

# The provenance map is keyed by TIER. A base's provenance is a fact about a
# PROVIDER, so it is namespaced rather than mixed in: the two vocabularies are
# disjoint today (`local` / `cheap-cloud` / `good-cloud` against `anthropic` /
# `openai` / `ollama`) and a prefix keeps them disjoint by construction rather
# than by luck.
#
# ⚠ WHY THIS IS NOT A FIFTH FIELD ON `Routing`. Two shipped suites scan the
# object for a planted key value by iterating exactly four mappings
# (`tests/test_call_seam.py`, `tests/test_setup_keys.py`). A fifth field would
# be invisible to both — a new surface with no leak scan on it — and widening
# those scans is a suite edit that may not travel in the same commit as the
# code it gates (S-6). Riding the existing mapping keeps the leak scan
# complete for free. What would overturn it is base provenance needing to
# carry something a tier token cannot express.
BASE_PROVENANCE_PREFIX = "base:"


def base_provenance_key(provider):
    """The `provenance` key that says where THIS PROVIDER'S address came from.

    Pure string math. One spelling, so the writer in `resolve_routing` and
    every reader above it cannot disagree about where to look."""
    return BASE_PROVENANCE_PREFIX + str(provider)


def normalise_base(raw):
    """⚠ THE ONE NORMALISER FOR A BASE ADDRESS — `""` for anything unusable.

    `.strip().rstrip("/")`, which is what the settings `bases` loop below has
    always applied. It is extracted here rather than left inline because the
    CONSENT RECORD has to normalise IDENTICALLY: a record written one way and
    compared the other re-asks on a trailing slash, and being asked twice for
    an answer already given is how somebody learns to click through a prompt
    without reading it. Two spellings of one rule is two chances to drift;
    this is one.

    Pure: no I/O, no lock, no network."""
    if not isinstance(raw, str):
        return ""
    return raw.strip().rstrip("/")


def _base_allowed(base):
    """Whether a NORMALISED base is something the transport could speak.

    Fail-closed on everything else — an empty string, a bare hostname with no
    scheme, a scheme with no host, anything that is not http or https."""
    if not base:
        return False
    try:
        parts = urllib.parse.urlsplit(base)
    except ValueError:
        return False
    return parts.scheme in BASE_ALLOWED_SCHEMES and bool(parts.netloc)


def _base_from_env(provider, environ):
    """(base, provenance) for one provider from the shell, or (None, None)
    when the shell says nothing about that provider at all.

    ⚠ `_fill_from_env`'S THREE PROPERTIES, COPIED EXACTLY, because this is the
    same question about a different field:

      * a THREE-VALUED answer — the shell said nothing / the shell said
        something acceptable / the shell said something refused;
      * a refusal falls to the SHIPPED DEFAULT, never to her stored pick. A
        room whose shell names a bad address must not silently inherit
        whatever was in her settings file: she would be sent somewhere she did
        not name on this run;
      * a provenance token, so a refusal is VISIBLE. Fail-closed is correct;
        invisible is not, and without `env_rejected` a refused override looks
        identical to a plain default."""
    name = BASE_ENV_NAMES.get(provider)
    raw = environ.get(name) if name else None
    if raw is None:
        return None, None
    base = normalise_base(raw)
    if _base_allowed(base):
        return base, SOURCE_ENV
    return None, SOURCE_ENV_REJECTED


# ---------------------------------------------------------------------------
# ---- her two files, under her own home (#28) ------------------------------
#
# ⚠ TWO FILES, NOT ONE, AND THE SPLIT IS THE POINT. Which model fills which
# tier — and the settable OpenAI address #27 section 8 requires — is not
# secret. Kept apart, `settings.json` can be pasted into a bug report or copied
# between two machines with no risk at all. Merged with a credential it could
# never be either again, and the harmless half would inherit the dangerous
# half's handling forever.
#
# ⚠ NOT UNDER THE REPO ROOT — `library.local.json`'s precedent runs the other
# way on purpose. A key has to survive re-cloning the repo, and nothing a
# `git add -f` can reach may ever hold one.
#
# ⚠ THE DERIVATION LIVES IN `study_lib`, NOT HERE, and that is deliberate:
# `study_lib._librarian_fenced` has to be able to NAME the keys file in order
# to refuse it, and a fence that could only name it when this module happened
# to have been imported first would be a fence with an import order in it.
# These two are the accessors. Every path is built from the home directory; no
# absolute path is spelled anywhere.

def settings_path():
    """Her fills, her addresses, her timeouts — and nothing secret, by
    design."""
    return study_lib.settings_file_path()


def keys_path():
    """The ONE file a key is ever written to: mode 0600, inside a 0700
    directory, and refused by `study_lib._librarian_fenced` — the librarian may
    never read it."""
    return study_lib.keys_file_path()


# The module's OWN small lock, and it stays small: it serializes the
# read-modify-write of the two files above and nothing else. ⚠ Never
# `WRITE_LOCK` (the store's), never `LIBRARIAN_LOCK` (which must stay cheap),
# and never nested inside either — `_BLESSINGS_LOCK`'s docstring in `server.py`
# states the rule and the reason. Nothing held under this lock takes another.
_FILES_LOCK = threading.Lock()


def _load_json_file(path, fallback):
    """Fail-open read, the shipped notebook idiom (`_load_librarian_json`):
    missing, unreadable, or hand-edited off-shape reads as `fallback`, never as
    an error. Both files are HERS to edit, so a typo in one costs her the
    setting it names — never the room."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback
    return data if isinstance(data, type(fallback)) else fallback


def load_settings():
    """Her fills / bases / timeouts as a plain dict; `{}` when there is no
    usable file. Handed straight to `resolve_routing`."""
    return _load_json_file(settings_path(), {})


def _settings_bytes(settings):
    return json.dumps(settings, ensure_ascii=False, indent=1,
                      sort_keys=True).encode("utf-8")


def _keys_bytes(providers):
    return json.dumps({"providers": providers}, ensure_ascii=False, indent=1,
                      sort_keys=True).encode("utf-8")


def save_settings(settings):
    """Rewrite the settings file atomically (`study_lib.atomic_write_bytes` —
    a torn write on iCloud-adjacent storage is a known hazard).

    ⚠ Nothing secret may be put in here. The split above is the whole reason
    this file can be shared, and one credential in it ends that permanently."""
    with _FILES_LOCK:
        study_lib.ensure_room_config_dir()
        study_lib.atomic_write_bytes(str(settings_path()),
                                     _settings_bytes(settings))


# ---------------------------------------------------------------------------
# ---- 26.99-08 (D-09/D-11/D-15/D-16): the record of agreeing to an address --
#
# ⛔⛔ THE RECORD HOLDS THE VALUE CONSENTED TO. NEVER A BOOLEAN. This is the
# single load-bearing line of the whole design (L-03). Store a bare `true`
# under this key for `http://127.0.0.1:11434`, repoint the room at somebody's
# cloud proxy three weeks later, and that same `true` rides the repoint and
# the key goes with it — VERBATIM the hole #12 was taken to prevent.
#
# ⚠ THE SENTENCE ABOVE IS WORDED TO KEEP THE GATE RUNNABLE BARE. Its first
# draft spelled the forbidden pairing out literally, and the grep that guards
# this rule then fired on the prose explaining the rule — B-2, recorded three
# times on this project and reached here a fourth. The gate reads source, so
# the source does not get to contain its own counter-example.
#
# A boolean cannot
# express *consented to WHAT*, and the question every surface actually has to
# ask is "is the address in effect RIGHT NOW the one that was agreed to".
#
# ⚠ SO CONSENT IS COMPARED, NOT REMEMBERED. `base_needs_consent` re-reads the
# file and compares; nothing caches an answer. That is what makes D-11's
# re-ask work ACROSS the two surfaces rather than within each: the terminal
# writes, the room reads, and neither holds a copy that could go stale.
#
# ⚠ BESIDE `save_settings`' OWN RULE — *Nothing secret may be put in here* —
# this record holds A BASE ADDRESS AND NEVER A CREDENTIAL. The split between
# the two files is the whole reason `settings.json` can be pasted into a bug
# report, and a consent record naming a destination does not endanger it. One
# credential in this file would end that permanently.
#
# ⛔ AND THIS KEY IS IN NEITHER `MODEL_PROPOSABLE_KEYS` NOR
# `CONFIGURABLE_KEYS` (D-16). She flips it; the librarian may not propose
# flipping it. Storage location and proposability are two different questions,
# and #12 settled only the first — a consent record governing where a
# credential goes is a different object from a setting the model may propose
# tuning. `tests/test_librarian_config_fence.cjs` asserts the absence over
# comment-stripped source, with the key planted into a copy of each register
# so the absence is not a vacuous one.
SETTINGS_CONSENT_KEY = "base_consent"

# Her answer, as a token rather than a flag — the same discipline as the four
# SOURCE_* tokens above, and for the same reason: a boolean parameter beside a
# record that deliberately is not a boolean invites the next reader to store
# one.
CONSENT_YES = "yes"
CONSENT_NO = "no"

# The three states the record distinguishes. ⛔ THREE, NOT TWO: D-15 makes a
# decline something the room must be able to READ, not merely the absence of a
# yes — otherwise the room would ask her a second time inside one visit.
CONSENT_STATE_UNASKED = "unasked"
CONSENT_STATE_CONSENTED = "consented"
CONSENT_STATE_DECLINED = "declined"

# ⛔⛔ THE DECLINE'S LIFETIME IS PER-VISIT, AND IT IS STATED HERE RATHER THAN
# LEFT TO WHICHEVER SURFACE LANDS FIRST. D-15's own words are that the
# librarian stays off "for that visit".
#
#   * A decline is scoped to THE VISIT. It stops the room re-asking within
#     that visit, and it is what a surface reads as OFF for that visit.
#   * ⛔ IT IS NOT A PERSISTENT REFUSAL. A fresh visit finds no consent for the
#     effective address and ASKS AGAIN, exactly as it did the first time.
#     Consent was never given, so the room still may not reach that
#     destination — asking is the correct behaviour, not a re-prompt loop.
#   * ⛔ A PERMANENT DECLINE IS REFUSED AS A DESIGN. It is a wider promise than
#     she made and it is a one-way trap: somebody who declined once could
#     never re-enable the librarian for that address without hand-editing this
#     file, and no surface would ever offer to ask again.
#   * ✅ Law 6 is untouched either way: the prompt can only ever reach somebody
#     who set the address themselves.
#
# ⚠ THEREFORE THE OFF IS DERIVED FROM THE ABSENCE OF CONSENT, NOT FROM THE
# PRESENCE OF A DECLINE. `base_needs_consent` asks one question — "the base in
# effect is not a shipped default and no record matches it" — and that one
# rule covers *never asked* and *declined this visit* together. The state
# below exists only to suppress a SECOND ask inside the same visit. What would
# overturn this is a ruling that a decline must outlive the visit, which is
# exactly what D-15 declined to say.
#
# ⛔ AND IT LIVES IN MEMORY, WHICH IS THE REQUIREMENT MADE STRUCTURAL: A FRESH
# PROCESS MUST NOT INHERIT A DECLINE AS A SETTLED ANSWER. Written to the file
# it would need a visit marker that a new process could not match, and the
# first time that marker was got wrong the trap above would ship. A set that
# starts empty every time the interpreter starts cannot get it wrong.
_DECLINED_THIS_VISIT = set()

# The shipped addresses, normalised once. An address equal to one of these was
# not redirected, so nothing is owed and nothing is asked.
_SHIPPED_BASE_VALUES = frozenset(
    normalise_base(value) for value in DEFAULT_BASES.values())


def base_is_shipped_default(base, provider=None):
    """Whether this address is one the app ships — pure, no I/O.

    ⚠ NAME THE PROVIDER WHERE YOU KNOW IT. With a provider the comparison is
    against THAT provider's own shipped address, which is the strict reading;
    without one it is against the shipped SET, which is all a surface holding
    nothing but an address can ask. The difference is not cosmetic: pointing
    the Anthropic base at Ollama's shipped loopback address would pass the
    loose test while sending a key to `127.0.0.1:11434`, and a loopback
    address does not prove locality (D-08).

    Fail-closed: an unusable address, or a provider with no shipped default,
    is NOT a shipped default and therefore owes consent."""
    normalised = normalise_base(base)
    if not normalised:
        return False
    if provider is not None:
        return normalised == normalise_base(DEFAULT_BASES.get(provider, ""))
    return normalised in _SHIPPED_BASE_VALUES


def consented_base(settings):
    """The address recorded as agreed to, or None — read out of a settings
    dict she already has open.

    ⛔ IT RETURNS WHAT WAS RECORDED AND DOES NOT RE-NORMALISE IT, and that is a
    decision rather than an omission. `record_base_consent` is the one place
    the normalisation happens. A reader that normalised too would REPAIR a
    writer that had stopped normalising — the trailing-slash case would stay
    green with `record_base_consent`'s `.rstrip("/")` deleted, and the drill
    that is supposed to catch exactly that could never fail. A test that
    quietly absorbs the defect it watches for pins the defect as correct.

    Fail-open on shape, like every other read of a file that is hers to edit:
    a boolean, a number, a dict, a list or blank space all read as None, which
    means *not consented* and therefore *ask*. ⚠ Fail-open on SHAPE is
    fail-CLOSED on consent, which is the direction that matters here."""
    value = (settings or {}).get(SETTINGS_CONSENT_KEY)
    if not isinstance(value, str):
        return None
    return value.strip() or None


def base_consent_state(base):
    """Which of the three states this address is in, RIGHT NOW.

    ⚠ RE-READ FROM DISK AT THE MOMENT IT IS ASKED, on the resolve-time
    discipline `resolve_routing` states below: a value resolved once when the
    process started can never see what the other surface wrote afterwards, and
    the two surfaces writing and reading one record is the entire mechanism of
    D-11's cross-surface re-ask.

    ⚠ `consented` BEATS `declined` deliberately. Declining and then agreeing
    inside one visit must land on agreed — the alternative is the one-way trap
    D-15 refuses, reached without even leaving the room."""
    normalised = normalise_base(base)
    if not normalised:
        return CONSENT_STATE_UNASKED
    if consented_base(load_settings()) == normalised:
        return CONSENT_STATE_CONSENTED
    if normalised in _DECLINED_THIS_VISIT:
        return CONSENT_STATE_DECLINED
    return CONSENT_STATE_UNASKED


def base_needs_consent(effective_base, provider=None):
    """⚠ THE ONE QUESTION EVERY SURFACE ASKS: is the address in effect right
    now an address that was agreed to?

    One rule, covering *never asked* and *declined this visit* together,
    because the OFF is derived from the ABSENCE of consent and never from the
    presence of a decline. A surface that also needs to know whether to ASK
    (as opposed to whether to STOP) calls `base_consent_state` — `unasked`
    asks, `declined` does not ask again this visit, and both are OFF.

    Re-reads at the moment it is asked; ⛔ never cached at start-up.

    Fail-closed everywhere: an address that normalises to nothing is not an
    address anybody agreed to."""
    if base_is_shipped_default(effective_base, provider):
        return False
    return consented_base(load_settings()) != normalise_base(effective_base)


def record_base_consent(base, answer):
    """Record her answer about ONE address, and return the resulting state.

    ⛔⛔ LOAD -> MODIFY -> WRITE **FROM DISK**, IMMEDIATELY BEFORE WRITING, AND
    NEVER FROM A CACHED DICT. `_FILES_LOCK` is a `threading.Lock` — PER
    PROCESS — and it does not serialize `--setup` against a running server.
    The write itself is atomic, so a torn file is not the hazard here; the
    hazard is a LOST UPDATE, and the field a lost update drops is a consent
    DECLINE, which silently re-grants consent for an address she refused
    (L-02). This is the app's FIRST cross-process settings writer, so there is
    no precedent in this tree to copy — the discipline is written out instead.

    ⚠ IT NARROWS THE WINDOW; IT DOES NOT CLOSE IT. Re-reading immediately
    before the write leaves only the load-to-write instant, which is as far as
    two processes sharing a lock-free file can be taken. What would close it
    is an OS-level lock on the file itself, and that is what would overturn
    this design — not a bigger `threading.Lock`, which cannot see the other
    process at all.

    ⚠ AND THE WRITE IS SKIPPED WHEN THE FILE ALREADY SAYS WHAT IT WOULD SAY —
    the `ensure_files` idempotence discipline. A no-op write is a lost-update
    window opened for nothing.

    ⛔ FAIL-CLOSED ON THE ANSWER: only `CONSENT_YES` grants. Anything else is
    treated as a decline, because the safe direction for an answer nobody
    recognises is *not agreed*.

    ⛔ NOTHING SECRET IS WRITTEN. The value stored is a base address, and no
    credential is read, held or echoed anywhere in this function."""
    normalised = normalise_base(base)
    if not normalised:
        # Not an address. Recording consent for nothing would leave a record
        # that no comparison could ever match, which reads as a permanent
        # unexplained re-ask.
        return CONSENT_STATE_UNASKED

    settings = load_settings()          # FROM DISK, immediately before writing

    if answer == CONSENT_YES:
        _DECLINED_THIS_VISIT.discard(normalised)
        if consented_base(settings) != normalised:
            settings[SETTINGS_CONSENT_KEY] = normalised
            save_settings(settings)
        return CONSENT_STATE_CONSENTED

    # ⚠ A DECLINE REMOVES AN EARLIER YES FOR THE SAME ADDRESS. Without this,
    # somebody who agreed on Monday and refused on Tuesday would be read as
    # having agreed — the record would outlive the answer that replaced it.
    _DECLINED_THIS_VISIT.add(normalised)
    if consented_base(settings) == normalised:
        settings.pop(SETTINGS_CONSENT_KEY, None)
        save_settings(settings)
    return CONSENT_STATE_DECLINED


def _raw_keys():
    """The keys file's provider map, exactly as written.

    ⚠ MODULE-PRIVATE AND VALUE-BEARING. Its only callers are `load_keys` (which
    strips every value out), `_credential` (which returns exactly one of them,
    at send time) and the two history hooks (which never touch one)."""
    data = _load_json_file(keys_path(), {})
    providers = data.get("providers")
    return providers if isinstance(providers, dict) else {}


def _entry_key(entry):
    """One provider's stored key, or None — the other half of `_raw_keys`'s
    confinement. Nothing outside this module calls either."""
    if not isinstance(entry, dict):
        return None
    value = entry.get("key")
    value = value.strip() if isinstance(value, str) else ""
    return value or None


def load_keys():
    """provider -> {'present': bool, 'rejected_ms': int or None}.

    ⚠ NO KEY VALUE IS IN THIS RETURN AT ANY DEPTH, which is what makes it the
    shape every surface above this module is given — Manage, the start-up line,
    `--setup`'s report. Provider plus present-or-absent is the whole of what any
    of them needs: one key per provider means a masked fragment would
    disambiguate nothing while creating something worth screenshotting.

    The local rung is absent from the return entirely rather than carved out by
    name — membership of `KEY_ENV_NAMES` is what decides who needs a key."""
    raw = _raw_keys()
    out = {}
    for provider in KEY_ENV_NAMES:
        entry = raw.get(provider)
        entry = entry if isinstance(entry, dict) else {}
        rejected = entry.get("rejected_ms")
        out[provider] = {
            "present": _entry_key(entry) is not None,
            "rejected_ms": rejected if isinstance(rejected, int) else None,
        }
    return out


def key_present(provider, environ=None):
    """Whether this provider has SOMETHING to authenticate with — a boolean.

    ⚠ This is the question `resolve_routing` and the `no_key` check ask, and it
    is why neither of them ever holds a credential. The shell's value is tested
    for emptiness and read in no other way — never compared, never stored,
    never returned, never printed — and the file half goes through `load_keys`,
    whose return carries no values at all.

    The shell wins over the file (#28 section 5), the same order `_credential`
    uses, so presence and the value can never disagree about who is answering.
    """
    if provider not in KEY_ENV_NAMES:
        return False
    environ = os.environ if environ is None else environ
    if (environ.get(KEY_ENV_NAMES[provider]) or "").strip():
        return True
    return load_keys().get(provider, {}).get("present", False)


def ensure_files():
    """Create the directory and both files when they are missing — 0700 on the
    directory, 0600 on the keys file — and leave anything already there exactly
    as it is.

    ⚠ IDEMPOTENT BY CONSTRUCTION: an existing file is never rewritten, so
    running `--setup` twice in a row leaves the same bytes. The keys file's mode
    is re-asserted on every pass, which is repair rather than a rewrite — a file
    that lost its 0600 to a hand edit gets it back without her having to know
    that happened."""
    with _FILES_LOCK:
        study_lib.ensure_room_config_dir()
        settings = settings_path()
        if not settings.exists():
            study_lib.atomic_write_bytes(str(settings), _settings_bytes({}))
        keys = keys_path()
        if not keys.exists():
            study_lib.atomic_write_bytes(str(keys), _keys_bytes({}))
        os.chmod(str(keys), 0o600)


def _write_keys(providers):
    """Rewrite the keys file atomically and re-assert its 0600. Caller holds
    `_FILES_LOCK`.

    The mode is set EXPLICITLY rather than inherited from the write primitive's
    private temp file, even though that temp file is already private: a
    protection the room states out loud is one it should be seen setting."""
    study_lib.ensure_room_config_dir()
    path = keys_path()
    study_lib.atomic_write_bytes(str(path), _keys_bytes(providers))
    os.chmod(str(path), 0o600)


def save_key(provider, value):
    """Put one provider's key in the 0600 file, and nowhere else.

    ⚠ The value arrives here from a hidden terminal prompt and leaves only into
    that one file — never a log, never the screen, never a return value; this
    function deliberately returns nothing, because no caller needs a key handed
    back.

    A newly given key has no history: whatever the room remembered about the old
    one is dropped here, since a rejection recorded against a key she has just
    replaced would be a lie about the new one."""
    if provider not in KEY_ENV_NAMES:
        raise LibrarianCallError("no key is kept for " + repr(provider))
    with _FILES_LOCK:
        providers = _raw_keys()
        entry = providers.get(provider)
        entry = dict(entry) if isinstance(entry, dict) else {}
        entry["key"] = value.strip()
        entry.pop("rejected_ms", None)
        providers[provider] = entry
        _write_keys(providers)


def remove_key(provider):
    """Forget one provider's key.

    Re-running `--setup` is how a key is changed or removed — there is no second
    surface to find, and no copy left behind anywhere else."""
    if provider not in KEY_ENV_NAMES:
        return
    with _FILES_LOCK:
        providers = _raw_keys()
        entry = providers.get(provider)
        if isinstance(entry, dict):
            entry = dict(entry)
            entry.pop("key", None)
            providers[provider] = entry
        _write_keys(providers)


class Routing(types.SimpleNamespace):
    """The frozen answer to "who is answering, per tier" for ONE run.

    Resolved once in the request handler and handed down to the worker as a
    parameter (D-04) — never re-resolved inside a worker, and this is not a
    style choice. `resolve_voice_model` already works this way for two reasons
    that both still apply: module constants resolve at import and cannot see a
    value written to the store afterwards, and both workers promise to hold no
    store lock and read no store. Resolving inside a worker breaks one or the
    other.

    A run finishes on the routing it started with, or it stops (D-10). "This
    import was sorted by X" has to be true of all 300 batches or the ledger is
    lying. A fill she changes mid-import lands on the NEXT import, and Manage
    says so plainly.

    ⚠ "OR IT STOPS" IS A REAL PATH, NOT A FIGURE OF SPEECH. When a fill breaks
    partway through a run the worker STOPS, KEEPS what it already finished, and
    leaves a truthful record so the next run picks up from there (#27 section 5)
    — it never quietly re-points a tier and carries on. The words that stop says
    belong to Plan 26.93-06. ⚠ The path used to be the labelling scan's; that
    worker was deleted with its two model jobs (#95), and the pre-sort worker
    carries the same stop-keep-tell-resume branch.

    ⚠ FROZEN MECHANICALLY, NOT BY CONVENTION. `__setattr__` and `__delattr__`
    both raise, and each of the four fields is a `MappingProxyType` view over a
    private copy — so neither the object nor any table hanging off it can be
    re-pointed mid-run, and a worker that tried gets an exception rather than a
    silently different second half of an import.

    Carries NO credential. The key is fetched at send time and never lands here.

    Fields:
      fills      tier -> (provider, model)
      bases      provider -> base URL
      timeouts   tier -> seconds
      provenance tier -> one of the four SOURCE_* tokens
    """

    __hash__ = None

    def __setattr__(self, name, value):
        raise AttributeError(
            "Routing is frozen for the life of a run (D-10) — a fill change "
            "takes effect on the NEXT run, and Manage says so plainly")

    def __delattr__(self, name):
        raise AttributeError("Routing is frozen for the life of a run (D-10)")


def _freeze(mapping):
    """A read-only view, so a worker cannot quietly re-point a tier mid-run."""
    return types.MappingProxyType(dict(mapping))


def _make_routing(fills, bases, timeouts, provenance):
    obj = types.SimpleNamespace.__new__(Routing)
    # Bypass the frozen __setattr__ exactly once, at construction.
    object.__setattr__(obj, "fills", _freeze(fills))
    object.__setattr__(obj, "bases", _freeze(bases))
    object.__setattr__(obj, "timeouts", _freeze(timeouts))
    object.__setattr__(obj, "provenance", _freeze(provenance))
    return obj


# The shell names that override a tier's FILL, one per tier. #28 section 5: an
# environment variable still wins over her file — and ⚠ nothing the app ever
# says teaches anyone to set one, which is why these names appear in no printed
# line, no card and no document.
FILL_ENV_NAMES = {
    "local": "STUDY_ROOM_LOCAL_FILL",
    "cheap-cloud": "STUDY_ROOM_CHEAP_CLOUD_FILL",
    "good-cloud": "STUDY_ROOM_GOOD_CLOUD_FILL",
}

# A shell fill is spelled `provider:model`. A fill names a PROVIDER AND A MODEL
# everywhere else (D-05), and the shell does not get a shorter spelling that
# would quietly reintroduce the precedence race D-05 exists to remove.
FILL_ENV_SEPARATOR = ":"


def _parse_fill(raw):
    """`provider:model` -> (provider, model), or None. Fail-closed on
    everything else: an unknown provider, a missing half, an empty model."""
    if not isinstance(raw, str) or FILL_ENV_SEPARATOR not in raw:
        return None
    provider, _sep, model = raw.partition(FILL_ENV_SEPARATOR)
    provider, model = provider.strip(), model.strip()
    if provider not in PROVIDERS or not model:
        return None
    return (provider, model)


def _fill_pair(raw):
    """Any spelling of a fill normalised to a `(provider, model)` pair, or None.

    SHAPE ONLY — a known provider and a non-empty model. Three spellings arrive
    here and all three leave as one: the shell's `provider:model` string, her
    stored file's two-element list, and a pair the code already holds. One
    normaliser rather than three, so `allowed_fill` below has exactly one thing
    to judge and no caller re-types a shape check. Pure; fail-closed on
    everything else."""
    if isinstance(raw, str):
        return _parse_fill(raw)
    if isinstance(raw, (list, tuple)) and len(raw) == 2:
        provider, model = raw[0], raw[1]
        if provider in PROVIDERS and isinstance(model, str) and model.strip():
            return (provider, model.strip())
    return None


def tier_allow_list(tier):
    """The fills this tier will accept — `TIER_FILLS_ALLOWED`'s own row.

    An accessor over the literal above and nothing more, so a reader looking for
    "what may fill good-cloud" finds one answer in one place. An unknown tier
    answers the empty tuple, which refuses everything: fail-closed."""
    return TIER_FILLS_ALLOWED.get(tier, ())


def allowed_fill(raw, tier, default=None):
    """⚠ THE ONE JUDGE OF WHETHER A MODEL MAY FILL A TIER (D-04).

    Returns the `(provider, model)` pair when `raw` names a permitted fill for
    `tier`, and `default` otherwise. With the default `default` of None it is a
    pure membership filter — which is exactly what lets every caller reuse ONE
    judge instead of re-typing the test, the property `server._allowed_model`
    has carried for the voice alias since 26.87-01. `server._allowed_model` is
    WIDENED to reach this rather than duplicated beside it: two gates diverge,
    and a later fence change updates one and not the other.

    ⚠ IT NEVER RETURNS A BARE MODEL STRING. A fill names a provider AND a model
    (D-05), here and everywhere else, so exactly one provider serves a tier at
    any moment and there is no precedence race to resolve.

    Pure: reads the literal above, writes nothing, takes no lock, opens
    nothing."""
    pick = _fill_pair(raw)
    if pick is not None and pick in tier_allow_list(tier):
        return pick
    return default


def _fill_from_env(tier, environ):
    """(fill, provenance) for one tier from the shell, or (None, None) when the
    shell says nothing about that tier at all.

    A refused value answers `(None, SOURCE_ENV_REJECTED)`: it falls to the
    DEFAULT, never to her stored pick, and it says so out loud. ⚠ A
    present-but-refused override is a fact about the shell, not permission to
    pretend the shell said nothing — fail-closed is correct, invisible is not,
    and that is the same reason `resolve_voice_model` carries a fourth token."""
    name = FILL_ENV_NAMES.get(tier)
    raw = environ.get(name) if name else None
    if raw is None:
        return None, None
    pick = allowed_fill(raw, tier)
    if pick is not None:
        return pick, SOURCE_ENV
    return None, SOURCE_ENV_REJECTED


def resolve_routing(settings, environ=None, meta=None):
    """THE ONE resolution of who fills each tier, plus where that came from.

    Pure with respect to the store: reads two plain dicts, the environment and
    her two files, writes nothing, takes no lock. `settings` is her own file
    under her home (`load_settings`), read by the HANDLER and handed down.

    ⚠ THE DEFAULT ORDER, WRITTEN ONCE AND IN ONE PLACE — the loop below is the
    only statement of it anywhere in the app: Anthropic if its key is present,
    else OpenAI if its key is present, else her own machine. PRESENCE ONLY —
    `key_present` answers a boolean, and no key value is read, compared or held
    anywhere in this function. A cloud tier with no cloud key anywhere resolves
    to the local model rather than refusing, because a room with her own machine
    in it is a complete room (#28 section 1). That is a RESOLVED ANSWER, not a
    fallback: nothing is tried and abandoned, and there is no second attempt
    anywhere in this module.

    ⚠ APPLIED AT RESOLVE TIME, NEVER AT IMPORT, and that is the whole reason
    this is a function rather than a constant. A module constant resolves once,
    when the process starts, and can never see a key written afterwards — so
    what the order lands on is a fact about the machine AT THE MOMENT A RUN
    BEGINS, and is therefore observable on the returned object (`fills` and
    `provenance`) rather than assertable in a comment. Nothing in this file
    states what it currently lands on, deliberately: a comment that named
    today's machine state would be false the first time she ran `--setup`.

    THE FOUR PROPERTIES `resolve_voice_model` ESTABLISHED, all kept:
      * value plus provenance, never a bare value;
      * a LEGAL shell override wins over her stored pick — "the environment
        still works, it is just validated" is the compatibility promise;
      * an ILLEGAL shell value falls to the DEFAULT, never to her stored pick,
        and carries `env_rejected` so a refused override cannot be mistaken for
        a plain default;
      * the membership test is never re-typed here — `tier_allow_list` is the
        one place a fill is judged.
    """
    environ = os.environ if environ is None else environ
    settings = settings or {}

    cloud_provider = None
    for name in ("anthropic", "openai"):
        if key_present(name, environ):
            cloud_provider = name
            break

    if cloud_provider == "anthropic":
        cloud_fills = ANTHROPIC_FILLS
    elif cloud_provider == "openai":
        cloud_fills = OPENAI_FILLS
    else:
        # No cloud credential anywhere. Her own machine serves every tier, and
        # the front door says so rather than pretending a cloud tier exists.
        cloud_fills = {"cheap-cloud": LOCAL_FILL, "good-cloud": LOCAL_FILL}

    # The defaults are kept as their own dict, because `env_rejected` has to be
    # able to fall back to THIS and not to whatever her stored pick was.
    defaults = {"local": LOCAL_FILL,
                "cheap-cloud": cloud_fills["cheap-cloud"],
                "good-cloud": cloud_fills["good-cloud"]}
    fills = dict(defaults)
    provenance = dict((tier, SOURCE_DEFAULT) for tier in TIERS)

    # Her stored picks, normalised through the ONE shape function so no caller
    # re-types the check.
    #
    # ⚠ SHAPE HERE, MEMBERSHIP ON THE SHELL — AND THE ASYMMETRY IS DELIBERATE,
    # not an oversight this plan forgot to close. The allow-list's OpenAI half
    # is still unwitnessed (see the note above OPENAI_FILLS), and narrowing a
    # value SHE chose against a list nobody has offered to a live provider would
    # silently refuse a fill that works. The shell is different in kind: nothing
    # the app ever prints teaches anyone to set one, so a shell fill is always
    # somebody reaching past the room, and fail-closed is the right posture for
    # that. When the OpenAI names are witnessed, bringing this line under
    # `allowed_fill` is a one-word change with `allowed_fill` already in place.
    stored = settings.get("fills") or {}
    for tier, pick in stored.items():
        if tier not in TIERS:
            continue
        shaped = _fill_pair(pick)
        if shaped is not None:
            fills[tier] = shaped
            provenance[tier] = SOURCE_STORED

    # The shell, last and strongest — but only when what it names is allowed.
    for tier in TIERS:
        picked, source = _fill_from_env(tier, environ)
        if source is None:
            continue
        fills[tier] = picked if picked is not None else defaults[tier]
        provenance[tier] = source

    bases = dict(DEFAULT_BASES)
    for provider, base in (settings.get("bases") or {}).items():
        # #27 section 8: an OpenAI-shaped third provider must be a SETTING, not
        # a code change, so the address is configurable rather than a literal.
        # ⚠ THE OPENAI ONE IS THE ONLY ADDRESS #27 REQUIRES TO BE SETTABLE —
        # making the other two settable is not in scope, and nobody should
        # build on the fact that this loop happens to accept them. Since
        # 26.93-04 her own file can arrive here carrying one, which is why the
        # shape check above is the gate rather than a formality.
        if provider in PROVIDERS and isinstance(base, str) and base.strip():
            bases[provider] = normalise_base(base)
            # ⚠ D-19, AND THE FINDING IT CLOSES: this loop was ALREADY
            # accepting an override for all three providers with nothing
            # asked, and `startup_librarian_check` probes the Ollama base on
            # every room open — so a hand-edited settings file has been
            # pointing the room's FIRST network call of every session at an
            # arbitrary host. No credential rides that one, so it is not a key
            # leak, but D-10's words are "no call of ANY kind" and this is a
            # call of a kind. Saying WHERE the address came from is what lets
            # 26.99-09 gate it; the narrow reading was refused in writing.
            provenance[base_provenance_key(provider)] = SOURCE_STORED

    # ---- 26.99-08 (D-09): the shell, last and strongest --------------------
    #
    # ⛔⛔ THIS IS THE UNSAFE SUBSET, AND IT IS SHIPPING WITH ITS RECORD BUT
    # WITHOUT ITS GATE. Nothing in this module consults `base_needs_consent`
    # yet, so on the strength of this plan alone nothing NEW reaches a
    # non-default destination — the surfaces that ask, and the call gating
    # that enforces the answer, are 26.99-09's, one wave later. ⚠ 26.99-08 and
    # 26.99-09 are ONE SAFETY UNIT SPLIT ACROSS TWO WAVES; the phase may not
    # close with this landed and that unshipped.
    #
    # No call-site change is needed: `resolve_routing` already receives the
    # real environment and its sole production caller passes nothing.
    for provider in BASE_ENV_NAMES:
        picked, source = _base_from_env(provider, environ)
        if source is None:
            continue
        # ⛔ A REFUSAL FALLS TO THE SHIPPED DEFAULT, NEVER TO HER STORED PICK.
        # Her file may well name a third address; sending her there because
        # the shell named a bad one would be answering a question she did not
        # ask on this run.
        bases[provider] = (picked if picked is not None
                           else DEFAULT_BASES[provider])
        provenance[base_provenance_key(provider)] = source

    timeouts = dict(DEFAULT_TIMEOUTS)
    for tier, seconds in (settings.get("timeouts") or {}).items():
        if tier in TIERS and isinstance(seconds, (int, float)) and seconds > 0:
            timeouts[tier] = seconds

    return _make_routing(fills, bases, timeouts, provenance)


def _credential(provider, environ=None):
    """The key for one provider, read at SEND TIME and nowhere else.

    ⚠ THE ONLY FUNCTION IN THIS APP THAT EVER RETURNS A KEY VALUE, and `_send`
    is its only caller. THE CREDENTIAL NEVER ENTERS `Routing`, NEVER ENTERS THE
    FIVE-KEY RETURN, and is never logged, echoed, rendered or written back.

    WHY IT IS KEPT OFF `Routing` RATHER THAN CARRIED THERE FOR CONVENIENCE:
    the frozen routing object exists so the routing DECISION cannot change
    mid-run (D-10). A credential is not a routing decision. Keeping it out of an
    object that travels through two worker signatures — and whose repr any later
    debugging line might reach for — is strictly safer, and costs one function
    call per request.

    The shell wins over the keys file (#28 section 5): a shell variable is the
    escape hatch for someone who would rather the app store nothing at all, and
    an override that lost to a stored value would not be an override.

    Ollama needs nothing, and saying so here keeps the local rung free of a
    credential concept entirely rather than carving it out by name below."""
    if provider == "ollama":
        return None
    environ = os.environ if environ is None else environ
    name = KEY_ENV_NAMES.get(provider)
    if not name:
        return None
    value = (environ.get(name) or "").strip()
    if value:
        return value
    return _entry_key(_raw_keys().get(provider))


# ---------------------------------------------------------------------------
# ---- the ollama adapter: two pure functions, no networking at all (D-03) ---

def build_ollama_request(job_row, payload_text, fill, base):
    """Build the request body for the local rung. Opens nothing.

    Returns a plain dict — {method, url, headers, body} — so the whole request
    can be asserted at the boundary BEFORE a socket exists. That is what lets a
    test prove what the app sends with zero network and zero mocking, and it is
    the replacement for the recorded-argv pin that read `--model` out of a
    subprocess argv.

    The system prompt is an EXPLICIT field, never inherited from anywhere (#24).
    `payload_text` rides the user message verbatim — the W3 wiring claim, carried
    across from stdin to HTTP."""
    provider, model = fill
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": job_row["prompt"]},
            {"role": "user", "content": payload_text},
        ],
        # Ollama's grammar-constrained decoding: the schema IS the format.
        "format": json.loads(job_row["schema"]),
        "stream": False,
        # ⚠ BOTH HALVES OF THE BUDGET ARE NAMED HERE, and neither is optional.
        # `num_predict` bounds the answer; `num_ctx` bounds what the model is
        # allowed to READ. Omitting the second is not a smaller request — it is
        # an undeclared one, and Ollama's own default silently truncates the
        # payload's tail with no error and no count (see LOCAL_NUM_CTX).
        "options": {"num_predict": job_row["max_tokens"],
                    "num_ctx": LOCAL_NUM_CTX},
    }
    return {
        "method": "POST",
        "url": base.rstrip("/") + "/api/chat",
        "headers": {"Content-Type": "application/json"},
        "body": body,
    }


def read_ollama_response(status, headers, body_bytes, job_row):
    """Turn one local answer into the five-key shape. Opens nothing.

    TRUNCATION IS DECIDED FIRST, BEFORE ANY PARSE ATTEMPT (D-06). A cut-off
    answer that reaches json.loads arrives wearing a parse error's explanation,
    and the two want completely different sentences: one says "the model ran out
    of room", the other says "the model answered something unusable". Checking
    `done_reason` first is the whole reason they stay distinguishable.
    """
    # STEP 1 OF FOUR, AND THE ORDER IS LOAD-BEARING: status, then truncation,
    # then decline, then parse. 26.93-03 owns the table this reads. Before it,
    # every non-2xx here answered `model_not_pulled` — a claim about the model
    # made on the strength of a number that had not mentioned one, so a local
    # server refusing a malformed body sent her to `ollama pull`.
    failure = classify_status("ollama", status, headers, body_bytes)
    if failure is not None:
        return _answer(failure=failure)
    del headers  # nothing else here the seam needs; the status carried it

    try:
        envelope = json.loads(body_bytes.decode("utf-8", errors="replace"))
    except ValueError:
        return _answer(failure="malformed")
    if not isinstance(envelope, dict):
        return _answer(failure="malformed")

    # FIRST — before anything looks at the model's own text.
    if envelope.get("done_reason") not in (None, "stop"):
        return _answer(failure="truncated")

    message = envelope.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        return _answer(failure="malformed")

    try:
        structured = json.loads(content)
    except ValueError:
        return _answer(failure="malformed")
    if not isinstance(structured, dict):
        return _answer(failure="malformed")

    return _answer(
        ok=True,
        structured=structured,
        # Ollama only ECHOES the tag it was asked for, so unlike Anthropic's
        # envelope this is NOT independent evidence of what actually answered.
        # `independent` says so out loud rather than letting a reader assume.
        model={"provider": "ollama",
               "reported": envelope.get("model"),
               "independent": False},
        usage={"provider": "ollama",
               "input_tokens": envelope.get("prompt_eval_count"),
               "output_tokens": envelope.get("eval_count")},
    )


def _answer(ok=False, structured=None, model=None, usage=None, failure=None):
    """The ONLY shape that crosses this seam (D-02). Exactly five keys —
    `result`, `verdicts` and the money figure are gone."""
    return {"ok": ok, "structured": structured, "model": model,
            "usage": usage, "failure": failure}


# ---------------------------------------------------------------------------
# ---- a missing fill refuses, specifically (#27 section 5, 26.93-05) -------

# The two things a refusal can BE, and they are told apart by value rather than
# by reading the failure slot.
#
# ⚠ `absent` IS NOT A TWELFTH FAILURE TOKEN, AND MUST NEVER BECOME ONE. "This
# job does not exist on this machine" and "this job tried and failed" want
# completely different sentences: one is a fact about her setup that a surface
# can simply not offer, the other is something that went wrong and may work on
# the next tap. Folding them together is how a room ends up apologising for a
# feature it was never going to have. Asserted distinct from every member of
# FAILURES in `tests/test_call_seam.py`.
OUTCOME_ABSENT = "absent"
OUTCOME_REFUSED = "refused"


def _fill_is_cloud(fill):
    """Whether this fill is served by a company rather than by her own machine.

    Decided by MEMBERSHIP OF `KEY_ENV_NAMES` — the same rule that decides who
    needs a credential — so the local rung stays free of a cloud concept
    entirely rather than being carved out by name. Pure."""
    return bool(fill) and fill[0] in KEY_ENV_NAMES


def _usable_filled_tiers(routing, permitted_local):
    """The tiers that hold a fill THIS job could actually be served by.

    Returned as DATA on a refusal so a surface can offer a one-time explicit
    choice. ⚠ `permitted_local` narrows it rather than being applied later by
    the caller: for the config ask a local fill is not an option at all, so
    reporting one would invite a surface to offer the exact downgrade #28
    section 1 forbids. Pure."""
    out = []
    for tier in TIERS:
        fill = routing.fills.get(tier)
        if not fill:
            continue
        if permitted_local is False and not _fill_is_cloud(fill):
            continue
        out.append(tier)
    return tuple(out)


def missing_fill_reason(tier):
    """The token for a tier that holds no fill at all — the ACTUAL missing
    thing, never a generic one.

    A cloud tier with nothing in it has nothing to authenticate with, which is
    `no_key`; her own machine with nothing in it has nothing answering, which is
    `ollama_not_running`. The third of the three, `model_not_pulled`, is not
    reachable from here on purpose: it means the local server ANSWERED without
    the model, which only a real call or `probe_ollama` can know, and guessing
    it here would tell her to pull a model when nothing was listening. Pure."""
    return "ollama_not_running" if tier == "local" else "no_key"


def _refusal(empty_tier, filled_tiers, failure=None,
             outcome=OUTCOME_REFUSED):
    """A call that was never made, and why — the five keys plus exactly one.

    ⚠ THE SIXTH KEY EXISTS SO NOTHING HAS TO INVENT A TWELFTH TOKEN. `outcome`
    is `absent` or `refused`; `empty_tier` names the tier that had nothing this
    job could use; `filled_tiers` names the ones that did. All three are DATA
    for a surface to read — ⚠ THE OFFER IS A SURFACE'S JOB AND IS NOT BUILT
    HERE, and this module never substitutes one tier for another on its own."""
    out = _answer(failure=failure)
    out["refusal"] = {"outcome": outcome, "empty_tier": empty_tier,
                      "filled_tiers": tuple(filled_tiers)}
    return out


def is_refusal(result):
    """Whether an answer is a call that was never made. One reader, so no
    caller re-types `"refusal" in result`."""
    return isinstance(result, dict) and result.get("refusal") is not None


# ---------------------------------------------------------------------------
# ---- what came back, as one of the eleven (D-06, D-07) --------------------

# A read that ran out of time is NOT the same fact as a connection that never
# opened, and neither of them is an HTTP code. This sentinel rides the status
# slot of the transport's triple so all three stay apart on the way to the
# table below. It is deliberately not an integer: no real code can collide
# with it, and any arithmetic done to it fails loudly rather than quietly.
STATUS_TIMED_OUT = "timed-out"

# ⚠ THE STATUS TABLE — A LITERAL, NOT A CHAIN OF `if`s. A later reader can
# check this against 26.93-03-PLAN.md line by line, and "eleven tokens and no
# twelfth" becomes a set comparison rather than a hunt through branches.
#
# ⚠⚠ 401 AND 403 ARE THE ONLY CODES THAT MAY SAY ANYTHING ABOUT A KEY (D-07),
# AND THIS IS THE ONE LINE IN THE MODULE MOST LIKELY TO BE "SIMPLIFIED" AWAY.
# The room believes a key is good until a provider EXPLICITLY rejects it. A 429
# means the provider is busy. A 500 or a 529 means it is unwell. No network at
# all means the room never got to ask. NONE of those three has looked at the
# credential. The consequence of folding them together is the reason this
# comment exists rather than just the rule: she would be sent to find, delete
# and re-paste a perfectly good key because a server was busy — which does not
# merely tell her something untrue, it costs her work and leaves her trusting
# the room less afterwards. A tidy-minded `if status >= 400: return "bad_key"`
# is exactly how it would happen.
STATUS_TABLE = {
    401: "bad_key",        # the provider explicitly rejected the credential
    403: "bad_key",        # ...and so does this one. NOTHING ELSE MAY.
    429: "rate_limited",   # busy — says nothing about the key
    500: "provider_down",  # unwell — likewise
    502: "provider_down",
    503: "provider_down",
    504: "provider_down",
    529: "provider_down",  # Anthropic's own "overloaded"
    400: "malformed",      # WE sent something it refused to parse: a defect on
    404: "malformed",      # this side, and still nothing about the key
    422: "malformed",
}

# The same operating-system error, read two different ways. A connection that
# never opened means "no network" when the room was calling out to a company,
# and "nothing is listening on your own machine" when it was calling the local
# rung. ⚠ Two different sentences, two different things to do about it, and
# the room must not flatten them (#35 section 4).
CONNECTION_NEVER_OPENED = {
    "anthropic": "offline",
    "openai": "offline",
    "ollama": "ollama_not_running",
}


def classify_status(provider, status, headers, body_bytes):
    """What came back: `None` (this answer is fine, carry on) or exactly one
    member of `FAILURES`.

    Reads the NUMBER, and for one narrow case a machine signal in the body.
    The provider's own prose is never opened, never carried and never
    returned — only the token travels (D-06), which is what keeps a traceback
    away from her while still letting the front door tell a 401 from a 429.
    """
    del headers   # the meaning is in the status, not the envelope's headers

    if status is None:
        return CONNECTION_NEVER_OPENED.get(provider, "offline")
    if status == STATUS_TIMED_OUT:
        return "timeout"
    if 200 <= status < 300:
        return None

    # ⚠ `model_not_pulled` HAS TWO SOURCES AND BOTH ARE NEEDED: `probe_ollama`
    # seeing a tag list without the language model, and a live call coming back
    # with the local server's own model-not-found answer. They are the same
    # fact to her — it is running, but the model it needs is not there — so
    # they map to the same token.
    if (provider == "ollama" and status == 404
            and _body_names_a_missing_model(body_bytes)):
        return "model_not_pulled"

    token = STATUS_TABLE.get(status)
    if token is not None:
        return token

    # A code the table does not name is answered coarsely ON PURPOSE, and
    # ⚠ never as `bad_key`: an unrecognised code has told the room nothing
    # about the credential, and the carve-out above is the whole of what may.
    return "provider_down" if status >= 500 else "malformed"


def _body_names_a_missing_model(body_bytes):
    """True when the local server's own answer says the tag is not there.

    ⚠ A MACHINE TEST, NOT A READING. It answers a boolean off two fixed words;
    the sentence itself is dropped on the floor here and has no path to a
    return value."""
    try:
        text = (body_bytes or b"").decode("utf-8", errors="replace").lower()
    except AttributeError:
        return False
    return "model" in text and "not found" in text


# ---------------------------------------------------------------------------
# ---- the anthropic adapter: two pure functions, no networking (D-03) ------

def build_anthropic_request(job_row, payload_text, fill, base):
    """Build the request body for Anthropic. Opens nothing.

    Same four-key dict as the local pair — {method, url, headers, body} — so
    the whole request can be asserted at the boundary BEFORE a socket exists.

    THE SYSTEM PROMPT IS AN EXPLICIT FIELD, EVERY CALL (#24). Of the five
    guarantees the CLI's flags used to give, three are vacuous on a raw
    completion request — there is no built-in tool roster, no ambient local
    config and no interactive approval loop for a flag to switch off — and one,
    no session persistence, is vacuous here too, because the Messages API keeps
    no conversation object a later call can read back. The one that is NOT free
    is the replaced prompt: nothing populates `system` for you, so the app owns
    100 percent of what goes there and has to set it unconditionally.

    HOW THE JSON SHAPE IS ASKED FOR. `output_config.format` is Anthropic's
    structured-output field and it is where the job row's schema belongs — NOT
    a sentence in the prompt asking politely for JSON. #25 measured shape
    compliance per provider and this is the mechanism it measured. (The older
    top-level `output_format` spelling is deprecated; the nested one is
    current.)

    ⚠ NO CREDENTIAL IS PLACED HERE. This function never sees a key and never
    returns one — the value is read at send time and nowhere else (#28)."""
    _provider, model = fill
    body = {
        "model": model,
        "max_tokens": job_row["max_tokens"],
        # Verbatim, explicit, never inherited from anywhere.
        "system": job_row["prompt"],
        # `payload_text` rides the user message with no wrapper sentence, no
        # prefix and no suffix — the W3 wiring claim, carried to HTTP.
        "messages": [{"role": "user", "content": payload_text}],
        "output_config": {
            "format": {
                "type": "json_schema",
                "schema": json.loads(job_row["schema"]),
            },
        },
        # D-09: one complete validated object or nothing. No code path in this
        # module reads a partial answer, so there is nothing to stream to.
        "stream": False,
    }
    # map #50 / #96: HOW MUCH THE MODEL MAY THINK, SAID OUT LOUD.
    #
    # ⚠ THIS FIELD WAS ABSENT FROM THIS BUILDER ENTIRELY, and absence is not
    # neutral here: thinking is ON BY DEFAULT on this fill's model, the default
    # effort is HIGH, and thinking spends the SAME `max_tokens` the answer
    # does. So every row without an `effort` has been buying thinking nobody
    # asked for out of the budget its answer needs — measured filling to
    # 3,500-4,400 tokens on a pool where the essay itself wanted ~1,400.
    #
    # ⚠ IT RIDES `output_config`, BESIDE `format` AND NOT AT THE TOP LEVEL.
    # A top-level `effort` is silently ignored, which would look exactly like
    # a setting that works.
    #
    # ⚠ A ROW WITHOUT AN `effort` IS UNCHANGED, DELIBERATELY. Omitting the key
    # is the provider's own "high", so every job that has never been measured
    # keeps the behaviour it shipped with and nothing moves under a job whose
    # numbers nobody has looked at. Only a row that names a level opts in.
    effort = job_row.get("effort")
    if effort:
        body["output_config"]["effort"] = effort
    return {
        "method": "POST",
        "url": base.rstrip("/") + "/v1/messages",
        "headers": {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        },
        "body": body,
    }


def read_anthropic_response(status, headers, body_bytes, job_row):
    """Turn one Anthropic answer into the five-key shape. Opens nothing.

    THE ORDER OF THE CHECKS IS LOAD-BEARING (D-06):
      1. status — a non-2xx never reaches a parse at all;
      2. TRUNCATION, before anything looks at the model's own text.
         `stop_reason == "max_tokens"` answers `truncated`. A cut-off answer
         that reaches json.loads arrives wearing a parse error's explanation,
         and the two want completely different sentences: one says the model
         ran out of room, the other says it answered something unusable;
      3. DECLINE — `stop_reason == "refusal"` answers `declined`. Anthropic has
         a real decline signal, unlike the local rung, where the grammar forces
         a model that wants to refuse into some legal value instead;
      4. only then, parse. A parse that raises answers `malformed`.

    THE UNWRAP PATH. The object arrives nested inside the envelope, as the text
    of the first `content` block of type `text` — the structured-output field
    is what guarantees that block holds JSON matching the schema. Unwrapping it
    is this function's business and nothing above the seam is told it happened.

    ⚠ The provider's own error prose never crosses at any depth — not into
    `failure`, not into `usage`, not into a `why`. Only the token travels."""
    # The row shaped the REQUEST; reading the answer needs nothing from it.
    del job_row

    # STEP 1 OF FOUR. 26.93-03's table replaces Plan 02's placeholder, which
    # answered `provider_down` to every non-2xx — coarse out loud, and unable
    # to tell a rejected key from a busy server, which is the one distinction
    # the front door cannot do without (D-07).
    failure = classify_status("anthropic", status, headers, body_bytes)
    if failure is not None:
        return _answer(failure=failure)
    # Nothing else in the headers the seam needs — the status carried it.
    del headers

    try:
        envelope = json.loads(body_bytes.decode("utf-8", errors="replace"))
    except ValueError:
        return _answer(failure="malformed")
    if not isinstance(envelope, dict):
        return _answer(failure="malformed")

    stop_reason = envelope.get("stop_reason")
    # FIRST — before anything looks at the model's own text.
    if stop_reason == "max_tokens":
        return _answer(failure="truncated")
    if stop_reason == "refusal":
        return _answer(failure="declined")

    text = None
    for block in (envelope.get("content") or []):
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            break
    if not isinstance(text, str) or not text.strip():
        return _answer(failure="malformed")

    try:
        structured = json.loads(text)
    except ValueError:
        return _answer(failure="malformed")
    if not isinstance(structured, dict):
        return _answer(failure="malformed")

    return _answer(
        ok=True,
        structured=structured,
        # Unlike Ollama's echoed tag, the id Anthropic reports is INDEPENDENT
        # evidence of what actually answered — the same fact `_envelope_model`
        # bothered to record when the seam was a subprocess.
        model={"provider": "anthropic",
               "reported": envelope.get("model"),
               "independent": True},
        # The provider's own counts, verbatim, plus who reported them. No
        # dollars: the seam has no business holding a rate table (D-02).
        usage={"provider": "anthropic", "counts": envelope.get("usage") or {}},
    )


# ---------------------------------------------------------------------------
# ---- the openai adapter: two pure functions, no networking (D-03) ---------

def build_openai_request(job_row, payload_text, fill, base):
    """Build the request body for OpenAI. Opens nothing.

    ⚠⚠ THE BODY CARRIES `store: false`, AND DELETING IT IS A DEFECT, NOT A
    STYLE CHANGE. Both the Responses API and, for newer accounts, Chat
    Completions default to `store: true`, which keeps the exchange SERVER-SIDE
    FOR 30 DAYS, RETRIEVABLE BY ID (#24). Anthropic and the local rung need
    nothing equivalent — neither retains a conversation object — so porting the
    Anthropic body shape and calling it done would silently ship a 30-day
    server-side transcript of her fenced payloads. That is a breach of the one
    guarantee this whole seam exists to give. The next reader tidying away a
    redundant-looking flag is exactly how it gets lost, which is why it is
    written down here instead of left to be inferred.

    ⚠ THE ADDRESS COMES FROM `base` — there is deliberately no host literal
    anywhere in this function, and a test asserts its absence. Moonshot's API
    is OpenAI-shaped, so this one constraint turns "add a third OpenAI-shaped
    provider" into editing a setting later rather than reopening the map
    (#27 section 8). Kimi is NOT a day-one provider and there is deliberately
    no fourth `PROVIDERS` entry.

    ⚠ NO CREDENTIAL IS PLACED HERE, exactly as in the other two builders."""
    _provider, model = fill
    body = {
        "model": model,
        "messages": [
            # Explicit, verbatim, every call — the same #24 guarantee the
            # Anthropic builder makes with its top-level `system` field.
            {"role": "system", "content": job_row["prompt"]},
            {"role": "user", "content": payload_text},
        ],
        # The structured-output field: same job as Anthropic's
        # `output_config.format` and Ollama's `format`. The shape is asked for
        # by the REQUEST, never by a sentence in the prompt.
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "librarian_answer",
                "strict": True,
                "schema": json.loads(job_row["schema"]),
            },
        },
        # ⚠ THE LINE THE DOCSTRING IS ABOUT. Without it her fenced payloads sit
        # on someone else's server for 30 days, retrievable by id.
        "store": False,
        # `max_tokens` is the deprecated spelling on this API and newer models
        # reject it outright; `max_completion_tokens` is the current one.
        "max_completion_tokens": job_row["max_tokens"],
        "stream": False,
    }
    return {
        "method": "POST",
        "url": base.rstrip("/") + "/v1/chat/completions",
        "headers": {"Content-Type": "application/json"},
        "body": body,
    }


def read_openai_response(status, headers, body_bytes, job_row):
    """Turn one OpenAI answer into the five-key shape. Opens nothing.

    THE SAME FOUR-STEP ORDER as the Anthropic reader, for the same reason
    (D-06): status, then TRUNCATION before any parse of the model's own text
    (`finish_reason == "length"`), then DECLINE, then parse. OpenAI puts its
    decline in a dedicated `refusal` field on the message rather than in the
    stop signal, so the two providers are read differently and reported the
    same — which is the entire point of a closed register.

    The object arrives as the text of the first choice's message content, which
    the structured-output field constrains to the job row's schema.

    ⚠ The provider's own error prose never crosses at any depth."""
    # Same as the Anthropic reader: the row shaped the request, not the read.
    del job_row

    # STEP 1 OF FOUR, off the same shared table (D-07) — read differently per
    # provider below, classified identically here.
    failure = classify_status("openai", status, headers, body_bytes)
    if failure is not None:
        return _answer(failure=failure)
    del headers

    try:
        envelope = json.loads(body_bytes.decode("utf-8", errors="replace"))
    except ValueError:
        return _answer(failure="malformed")
    if not isinstance(envelope, dict):
        return _answer(failure="malformed")

    choices = envelope.get("choices")
    choice = choices[0] if isinstance(choices, list) and choices else None
    if not isinstance(choice, dict):
        return _answer(failure="malformed")

    # FIRST — before anything looks at the model's own text.
    if choice.get("finish_reason") == "length":
        return _answer(failure="truncated")

    message = choice.get("message")
    message = message if isinstance(message, dict) else {}

    refusal = message.get("refusal")
    if isinstance(refusal, str) and refusal.strip():
        # The token crosses; the provider's sentence does not.
        return _answer(failure="declined")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        return _answer(failure="malformed")

    try:
        structured = json.loads(content)
    except ValueError:
        return _answer(failure="malformed")
    if not isinstance(structured, dict):
        return _answer(failure="malformed")

    return _answer(
        ok=True,
        structured=structured,
        model={"provider": "openai",
               "reported": envelope.get("model"),
               "independent": True},
        usage={"provider": "openai", "counts": envelope.get("usage") or {}},
    )


# ---------------------------------------------------------------------------
# ---- the transport: the ONE place in the app that opens a connection ------

def _real_transport(request, timeout_s, auth=None):
    """Perform one request. THE ONLY connection-opener in the whole app (D-03).

    ⚠ `auth` IS THE CREDENTIAL'S HEADER, AND IT ARRIVES AS ITS OWN ARGUMENT
    RATHER THAN INSIDE `request` ON PURPOSE (#28). The request dict is the
    object the rest of the app can see — it is what the builders produce, what a
    test recorder captures, and what any future logging would reach for. Keeping
    the key out of it means the credential exists only on the last hop into the
    socket, and the shipped assertion that no builder ever places a credential
    in the headers stays true of the request that actually travels.

    stdlib only (law 8). Redirects are not followed — a redirect is a different
    address than the one the fence was pointed at. Returns the same triple a
    fake returns, so nothing above here can tell them apart.

    THREE KINDS OF "NO ANSWER" LEAVE HERE DIFFERENT (D-07): a status number, a
    `None` for a connection that never opened, and `STATUS_TIMED_OUT` for a
    read that ran out. `classify_status` turns the last two into two or three
    different tokens depending on who was being called, which it cannot do if
    this function has already flattened them into one."""
    # A body of None means a request with no body at all (the free `/api/tags`
    # probe). Serialising it would send the four bytes `null` and turn a GET
    # into a POST, because urllib picks the method off the presence of data.
    data = (None if request.get("body") is None
            else json.dumps(request["body"]).encode("utf-8"))
    req = urllib.request.Request(
        request["url"], data=data, method=request["method"])
    for name, value in (request.get("headers") or {}).items():
        req.add_header(name, value)
    if auth:
        # The one place a credential is ever attached to anything.
        req.add_header(auth[0], auth[1])
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read()
    except (TimeoutError, socket.timeout):
        # The wait ran out. A DIFFERENT fact from nothing answering: something
        # was there, it just did not finish in the tier's number of seconds.
        return STATUS_TIMED_OUT, {}, b""
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            return STATUS_TIMED_OUT, {}, b""
        return None, {}, b""
    except OSError:
        # No status at all — nothing answered. `classify_status` turns this
        # into `offline` for a company and `ollama_not_running` for her own
        # machine; the two must never merge.
        return None, {}, b""


def _real_sleep(seconds):
    """Hold still for a moment before trying again. Nothing else."""
    time.sleep(seconds)


# THE TWO INJECTION SEAMS, AND THERE ARE ONLY TWO. A test process swaps these
# module attributes and by NO other means: there is deliberately no environment
# variable and no config key that selects a transport or a wait, so a stray
# value in somebody's shell can never steer a production call. Unlike the
# harness that once swallowed 17 of her saves, both live in a test process,
# they RECORD rather than block, and nothing on a page she may be using can arm
# either. `_sleep` is the second and the last; a third would want the same
# paragraph written again, which is the sign it should not exist.
_transport = _real_transport
_sleep = _real_sleep


# How long to hold between attempts when the provider does not say. Named
# constants rather than numbers inside the loop, so a change to any of them
# shows up in a diff. The wait GROWS — a provider that was busy a second ago is
# given a little more room each time — and is BOUNDED at MAX_WAIT_S, because
# past a few seconds a room that appears frozen is worse than a room that says
# it could not reach the librarian.
FIRST_WAIT_S = 1.0
WAIT_GROWTH = 2.0
MAX_WAIT_S = 8.0

# When the provider DOES say how long to wait, its number wins: it knows when
# it will be ready and the room does not. Still bounded — a provider asking for
# an hour is asking for a frozen room, so past this the room waits this long
# and accepts that the next attempt may be refused too.
MAX_RETRY_AFTER_S = 60.0


def _note_key_rejected(provider):
    """Remember that this provider explicitly rejected its key (401/403).

    ⚠ ONLY A `bad_key` EVER REACHES HERE, and `_send` below is the single
    caller. A `rate_limited`, a `provider_down`, an `offline` and a `timeout`
    must never record anything: not one of them has looked at the credential,
    and a room that remembered them would send her to find, delete and re-paste
    a perfectly good key because a server was busy (D-07, #35 section 2). That
    does not merely tell her something untrue — it costs her work, and leaves
    her trusting the room less afterwards.

    What is recorded is a TIMESTAMP under the provider's name. No key value is
    read, written back, compared or logged here, and a provider whose key lives
    in the shell rather than in the file still gets its history recorded: the
    history is about the provider's answer, not about where the key is kept.

    Never raises into a caller. This is a note in the margin, and a home
    directory that cannot be written to must not turn a librarian call into an
    exception."""
    if provider not in KEY_ENV_NAMES:
        return
    try:
        with _FILES_LOCK:
            providers = _raw_keys()
            entry = providers.get(provider)
            entry = dict(entry) if isinstance(entry, dict) else {}
            entry["rejected_ms"] = int(time.time() * 1000)
            providers[provider] = entry
            _write_keys(providers)
    except OSError:
        pass


def _note_key_accepted(provider):
    """Forget any remembered rejection for this provider: a call succeeded.

    #35's rule is that a 401 is HISTORY, cleared by the first call that works.
    The two hooks arrive together or the memory only ever grows, and the room
    stays wrong about a key she has already replaced.

    Cheap on the ordinary path: the common case is that nothing is remembered,
    and this returns before opening anything for writing at all."""
    if provider not in KEY_ENV_NAMES:
        return
    if load_keys().get(provider, {}).get("rejected_ms") is None:
        return
    try:
        with _FILES_LOCK:
            providers = _raw_keys()
            entry = providers.get(provider)
            if not isinstance(entry, dict):
                return
            entry = dict(entry)
            entry.pop("rejected_ms", None)
            providers[provider] = entry
            _write_keys(providers)
    except OSError:
        pass


def _wait_before_next(headers, default_s):
    """How long to hold before the next attempt, in seconds.

    A `retry-after` the provider sent wins (D-08). Only the plain-seconds
    spelling is read; the HTTP-date spelling falls back to the room's own
    growing pause rather than being parsed, because a date needs the room's
    clock to agree with the provider's and there is no reason to assume it
    does."""
    for name, value in (headers or {}).items():
        if str(name).lower() != "retry-after":
            continue
        try:
            asked = float(str(value).strip())
        except (TypeError, ValueError):
            break
        if asked <= 0:
            break
        return min(asked, MAX_RETRY_AFTER_S)
    return default_s


def _send(request, timeout_s, provider, job_row=None):
    """Hand one built request to whatever transport is installed — and, when
    the answer says nothing about whether the request itself was good, ask
    again, up to the allowance the job's own table row carries.

    ⚠⚠ THE ALLOWANCE IS A TABLE VALUE, READ FROM THE ROW. It is never a
    constant written in here and never a branch on a job's name, and that shape
    is the entire point of D-08: REFLECTION'S DELIBERATE ZERO IS DATA, not a
    special case someone can delete by accident. An `if` on a job name is
    something a later reader removes while tidying and never notices; a `0` in
    the `JOBS` table is something they have to mean to change.

    THE LICENCE FOR ASKING AGAIN AT ALL is that nothing is written until
    success — which is exactly why reflections opt out, because there a turn IS
    the product and a silent second ask would hand her a different reflection
    than the one that was written. For every other job this is what stops one
    429 at batch 150 from killing a 300-batch import.

    ONE CALL AT A TIME, ALWAYS (D-11). No worker pool, no fan-out, no batch of
    requests in flight together. With one call out you know exactly where you
    stopped, which is what makes stop-keep-tell-resume possible at all; going
    wide would buy speed on exactly one tier, make `rate_limited` routine
    instead of rare, and make the running cost tally approximate.

    THE TIMEOUT IS THE TIER'S, handed in by `call_librarian` from
    `routing.timeouts[tier]` for the tier the `JOBS` row names, and no job may
    override it (D-09). One 300-second number for everything was sized for a
    subprocess talking to a fast cloud model; a local 7B measured at 24-26
    tokens a second needs minutes for a reflection-length answer, while a cloud
    call that has not answered in a minute is not going to.

    THE CREDENTIAL IS READ HERE AND NOWHERE ELSE (#28). ⚠ It is fetched once,
    at send time, and handed to the transport as its own argument — it is never
    written into the request dict, never attached to `Routing`, never returned
    and never printed. Which header carries it is the one provider-shaped fact
    that cannot live in an adapter, because the three builders are pure
    functions that must be provable to hold no credential at all.

    Returns the same triple the transport returns, so the read functions above
    cannot tell how many attempts it took."""
    allowance = int((job_row or {}).get("retries") or 0)
    credential = _credential(provider)
    auth = None
    if credential:
        auth = (("x-api-key", credential) if provider == "anthropic"
                else ("Authorization", "Bearer " + credential))
    del credential
    wait_s = FIRST_WAIT_S
    attempt = 0
    while True:
        attempt += 1
        status, headers, body_bytes = _transport(request, timeout_s, auth)
        failure = classify_status(provider, status, headers, body_bytes)

        if failure is None:
            # #35: a call that worked clears whatever the room remembered about
            # this provider's key.
            _note_key_accepted(provider)
            return status, headers, body_bytes
        if failure == "bad_key":
            _note_key_rejected(provider)

        # ⚠ Anything outside RETRIED returns NOW, however much allowance is
        # left. A rejected key will be rejected again. A `truncated` re-asked
        # with identical input mostly reproduces the truncation, and re-asking
        # DIFFERENTLY is a regeneration — a job's decision, never this one's.
        if failure not in RETRIED:
            return status, headers, body_bytes
        if attempt > allowance:
            # 1 + allowance attempts have been made, and that is all.
            return status, headers, body_bytes

        _sleep(_wait_before_next(headers, wait_s))
        wait_s = min(wait_s * WAIT_GROWTH, MAX_WAIT_S)


# ---------------------------------------------------------------------------
# ---- the local rung's free question (D-07, #35 section 4) -----------------

# The three states the local rung can be in, kept apart on purpose. Two of them
# are `FAILURES` tokens because that is what they are; the third is not a
# failure at all.
PROBE_NOT_RUNNING = "ollama_not_running"
PROBE_MODEL_MISSING = "model_not_pulled"
PROBE_WORKING = "working"

# The tag the local tier is filled with, and the family the search model comes
# from. ⚠ THE SEARCH MODEL DOES NOT COUNT AGAINST "WORKING": a room with the
# language model can still clean, label, propose headings and write a
# reflection, and those are real. Reporting a missing search model as a broken
# local rung would take four working features away from her over a fifth.
PROBE_LANGUAGE_TAG = "qwen2.5:7b"
PROBE_SEARCH_TAG = "nomic-embed-text"

# The probe is free, local and takes milliseconds, so it gets a short wait of
# its own rather than a tier's timeout — it belongs to no job.
PROBE_TIMEOUT_S = 5


def probe_ollama(base):
    """Ask the local server what it has, in ONE free call to `/api/tags`.

    ⚠ THE ASYMMETRY WITH THE TWO CLOUD PROVIDERS IS DELIBERATE. For them the
    room can only ever say "a key is here" — nothing short of spending money
    tells it more. For this one it can say "running", and say which models
    answered. Flattening the two into one confident voice would recreate the
    over-claim bug in a new costume; the front door is allowed to sound more
    certain here precisely because here it IS more certain.

    Returns `{state, tags, search_model}` where `state` is one of the three
    PROBE_* values — three, never two, because "nothing is answering" and
    "answering without the model" want different sentences and different
    `ollama` commands.

    ⚠ Goes through `_send` like everything else. It is NOT a second
    connection-opener, and the fence's claim that one function reaches the
    network stays a claim about one function."""
    request = {
        "method": "GET",
        "url": base.rstrip("/") + "/api/tags",
        "headers": {},
        "body": None,
    }
    status, headers, body_bytes = _send(request, PROBE_TIMEOUT_S, "ollama")

    nothing_there = {"state": PROBE_NOT_RUNNING, "tags": [],
                     "search_model": False}
    # Anything that is not a readable answer is reported as nothing there.
    # Coarse, and said out loud: a local server that answers `/api/tags` with
    # an error is not a state she has a different command for.
    if classify_status("ollama", status, headers, body_bytes) is not None:
        return nothing_there
    try:
        envelope = json.loads(body_bytes.decode("utf-8", errors="replace"))
    except ValueError:
        return nothing_there
    if not isinstance(envelope, dict):
        return nothing_there

    tags = [m.get("name") or "" for m in (envelope.get("models") or [])
            if isinstance(m, dict)]
    # Reported SEPARATELY, and never part of the verdict below.
    search_model = any(t.startswith(PROBE_SEARCH_TAG) for t in tags)
    if not any(t.startswith(PROBE_LANGUAGE_TAG) for t in tags):
        return {"state": PROBE_MODEL_MISSING, "tags": tags,
                "search_model": search_model}
    return {"state": PROBE_WORKING, "tags": tags,
            "search_model": search_model}


# ---------------------------------------------------------------------------
# ---- the seam itself -------------------------------------------------------

_ADAPTERS = {
    "ollama": (build_ollama_request, read_ollama_response),
    "anthropic": (build_anthropic_request, read_anthropic_response),
    "openai": (build_openai_request, read_openai_response),
}


# ---------------------------------------------------------------------------
# ---- the one question setup asks a cloud provider (#28) -------------------

# The smallest thing that can be asked of a cloud provider, used by
# `server.run_setup` to find out whether a key works. It is a JOBS-shaped row
# rather than a job: it carries no store bytes, it is not in the table, and
# nothing above the seam can name it.
KEY_CHECK_ROW = {
    "prompt": "Reply with the JSON object {\"ok\": true} and nothing else.",
    "schema": ('{"type": "object", "properties": {"ok": {"type": "boolean"}},'
               ' "required": ["ok"], "additionalProperties": false}'),
    "max_tokens": 16,
    # ⚠ ZERO, and it is DATA here for the same reason it is data for reflection
    # (D-08): this is a question about the KEY, and asking a busy server three
    # times does not answer it any better — it only makes setup feel broken.
    "retries": 0,
}

# Which model the check names. The cheap tier's default for that provider: the
# question is whether the credential is accepted, and the cheapest room in the
# building is the right place to ask it.
KEY_CHECK_FILLS = {
    "anthropic": ANTHROPIC_FILLS["cheap-cloud"],
    "openai": OPENAI_FILLS["cheap-cloud"],
}

# Short on purpose: a setup that appears to hang is worse than one that says
# plainly it could not reach the provider just now.
KEY_CHECK_TIMEOUT_S = 20


def check_key(provider, base=None):
    """One minimal request to a cloud provider, to find out whether its key
    works. Returns `None` when the provider answered, else exactly one member
    of `FAILURES`.

    ⚠ A DELIBERATE NETWORK CALL — the only one this app ever makes that no job
    asked for. `--setup` prints what it is about to do BEFORE calling this,
    because the alternative is that she finds out her key is dead at the moment
    she first wants the room, which is the worst possible time.

    ⚠ THE ANSWER IS ONE OF THE SAME ELEVEN TOKENS the room already produces
    (D-06) — `bad_key`, `provider_down` and `offline` are exactly the three this
    needs. A second vocabulary invented for setup is a setup and a room that can
    disagree about what happened.

    Goes through the provider's own builder and `_send`, like everything else:
    no second transport, and the credential is attached where every other
    credential is attached."""
    fill = KEY_CHECK_FILLS.get(provider)
    if fill is None:
        raise LibrarianCallError("no key check for provider " + repr(provider))
    build, _read = _ADAPTERS[provider]
    base = base or DEFAULT_BASES[provider]
    request = build(KEY_CHECK_ROW, "ok", fill, base)
    status, headers, body_bytes = _send(
        request, KEY_CHECK_TIMEOUT_S, provider, KEY_CHECK_ROW)
    return classify_status(provider, status, headers, body_bytes)


def call_librarian(job, payload_text, routing):
    """The one function that carries store bytes to a model (SRM-13).

    A caller names a JOB. There is no argument, keyword or attribute by which a
    caller can name a tier, a model, a schema or a prompt — which is what makes
    "every job has exactly one tier" a test instead of a habit.

    Returns exactly {ok, structured, model, usage, failure} — plus, on a call
    that was never made at all, the one extra `refusal` key described in this
    module's own docstring.
    """
    row = JOBS.get(job)
    if row is None:
        # A programming error, not a failure: no call was ever attempted.
        raise LibrarianCallError("unknown job: " + repr(job))
    if row["schema"] is None or row["prompt"] is None:
        raise LibrarianCallError(
            "job " + repr(job) + " has no schema or prompt bound — "
            "server.py must call bind_job_literals() at import, and "
            "blessing_selection's literals do not exist until Phase 26.95")

    tier = row["tier"]
    fill = routing.fills.get(tier)
    permitted_local = row.get("permitted_local", True)

    # ⚠⚠ A MISSING FILL REFUSES, SPECIFICALLY, AND NEVER RUNS ON ANOTHER TIER
    # (#27 section 5). This used to raise, which was correct while nothing
    # could produce an unfilled tier; a refusal a surface can read is what the
    # room needs now that `permitted_local` can leave a job with nothing it may
    # use. The token names the ACTUAL missing thing rather than a category —
    # `no_key` and `ollama_not_running` are two different things to do about it
    # — and NOTHING BELOW RUNS: no adapter is chosen, no request is built, no
    # connection is opened, and no other tier's fill is reached for. ⚠ Do not
    # "helpfully" fall through to a filled tier here: the silent downgrade is
    # exactly how reflections end up written by a 7B without her ever choosing
    # that, and it would also make Plan 26.93-08's start-up line a lie.
    if not fill:
        return _refusal(tier, _usable_filled_tiers(routing, permitted_local),
                        failure=missing_fill_reason(tier))

    # ⚠ THE CONFIG ASK'S CARVE-OUT, READ AS DATA (#28 section 1). Its row is the
    # only one whose `permitted_local` is False, and with no cloud fill in its
    # tier the job is ABSENT rather than local — a distinct outcome from all
    # eleven failure tokens, so a caller can tell "this is not available here"
    # from "this failed". Nothing was sent and nothing went wrong; Manage
    # changes every setting either way, which is why absence costs her nothing.
    if permitted_local is False and not _fill_is_cloud(fill):
        return _refusal(tier, _usable_filled_tiers(routing, permitted_local),
                        outcome=OUTCOME_ABSENT)

    provider, _model = fill
    adapter = _ADAPTERS.get(provider)
    if adapter is None:
        # All three of PROVIDERS have a pair as of Plan 26.93-02, so this can
        # only fire on a fill naming something the table does not serve — a
        # programming error, never a failure token.
        raise LibrarianCallError("no adapter for provider " + repr(provider))

    # ⚠ NO KEY IS A DIFFERENT FACT FROM A REJECTED KEY, AND THE TWO MUST NEVER
    # MERGE (D-06, D-07). `no_key` means the room has nothing to authenticate
    # with, so it never opens a connection at all; `bad_key` means a provider
    # looked at a real credential and refused it. One is answered by pasting a
    # key in, the other by replacing one — and telling her to replace a key she
    # never had sends her looking for a mistake that is not there.
    #
    # Membership of `KEY_ENV_NAMES` is what decides whether a provider needs
    # one, so the local rung stays free of a credential concept entirely rather
    # than being carved out by name here.
    #
    # ⚠ `key_present` ANSWERS A BOOLEAN. This function never holds a key value:
    # the shell is tested for emptiness, the file is consulted through a return
    # that carries no values, and the credential itself is fetched two frames
    # below, at send time, by the only function allowed to hold one.
    if provider in KEY_ENV_NAMES and not key_present(provider):
        return _answer(failure="no_key")

    build, read = adapter
    base = routing.bases.get(provider) or DEFAULT_BASES.get(provider, "")
    request = build(row, payload_text, fill, base)

    # The timeout is the TIER's (D-09) and the allowance is the ROW's (D-08);
    # `_send` is handed both rather than deciding either.
    status, headers, body_bytes = _send(
        request, routing.timeouts.get(tier), provider, row)
    return read(status, headers, body_bytes, row)
