# The Study Room — Build Handoff (CLAUDE.md)

*Seeded 2026-07-15 from the vault's `User Research/17 Build Handoff (CLAUDE.md seed).md`, amended for the law-7 decision (AI librarian in MVP). Full reasoning lives in the vault: `Claude Project/Obsidian Visual House/User Research/` — `16 PRD - The Study Room.md` (product), `15 Grill Session - Decision Log.md` (decisions + scope ladder), `09 Research Synthesis.md` (evidence). **GSD planning lives in the house project's `.planning/`** (ROADMAP v4.0, Phases 22–27; requirements SRM-01..13) — this repo is the code home only.*

## What this is

A local-first app: a cozy visual **study room** where a user's already-existing personal archive (notes, photos, saved posts, AI-chat exports) comes back to them safely. Core loop: the **bookshelf** shows a few long-unopened items the user pre-approved ("blessed"); the user opens one and reacts. Built for adults recovering from depression/anxiety. This is v1 of a larger private "visual house" — design the data model to outlive this room.

## Product laws (never violate, never "improve")

1. **Pull-only.** No notifications, no reminders, no unprompted surfacing of content. Ever.
2. **User is the only judge.** Nothing decides an item is "positive" except the user's own marking. AI never decides what surfaces.
3. **Reward presence, never punish absence.** Room state only ever improves with visits. Nothing decays, wilts, or references how long the user was away. No streaks, no counters of absence.
4. **Verbatim & undecorated.** Resurfaced content displays exactly as saved: no rewording, no summaries, no filters, no music, no animations on the content itself. *(AMENDED 2026-08-11 by the owner — verbatim: **"Resize oversize ones instead."** A photo whose exported rendition is larger than the room's import size ceiling may be **made smaller so that it fits**, rather than refused. That is the entire permission: it covers **a photo that would otherwise not arrive at all**, and the whole picture is kept — aspect ratio preserved, nothing cropped. It does **NOT** permit cropping, filtering, recolouring, re-encoding for taste, or touching in any way a photo that already fits: anything at or under the ceiling reaches the room **byte-for-byte** as exported, and the resizer never even opens it. Chosen by her over raising the ceiling, because the ceiling applies to the exported **rendition** and renditions cannot be predicted from originals — her three largest still originals (29.1 / 25.3 / 25.1 MB) export to 0.8 / 14.2 / 0.6 MB, yet one rendition in the 5-photo `26.65-07` trial still came out over. Recorded as an amendment rather than argued away: strictly, this changes what is **saved** at import, not how what is saved is **displayed** — but what she ends up looking at is no longer exactly what Photos handed over, and that is the thing law 4 is protecting. Machine-enforced in `adapters/apple_photos.py`, pinned by `tests/test_apple_photos.py`.)*
5. **Never-list integrity is absolute.** An item marked "keep but never show" must never appear on the shelf or in any surface. Treat a leak as a P0 incident. Retired ("never again") items likewise.
6. **Setup: max 2 yes/no questions.** User effort ≤15 minutes; unlimited machine time is fine behind a progress bar with an honest ETA.
7. **The librarian proposes, never disposes.** *(AMENDED 2026-07-15 by the owner — supersedes the original "No AI in the MVP." The full AI librarian IS in the MVP — see the AI Librarian section.)* The librarian only suggests (proposes connections / pre-sorting) and gifts (its note); **only the user promotes anything** (nothing is placed or shelved until the user allows it). *(AMENDED 2026-07-21 by the owner — **AI-NATIVE, supersedes "fully functional with AI off / fail-open": the Study Room REQUIRES AI** (Claude Code login or API key). There is NO no-AI build and NO fail-open fallback, not even for the demo. The librarian is THE product, not an optional upgrade. See `.planning/STUDY-ROOM-JOURNEY.md` decision of record.)*
8. **Local-first data.** All user data and state stay on the user's machine; metrics live in a local stats store. *(AMENDED 2026-07-21 — AI is now CORE, not an opt-in exception: the app requires the librarian, which is the disclosed cloud path behind the hard fence below. User data/state still never leaves the machine except through that fenced, consented librarian path. The "AI optional" framing + "never require coding or a paid key" are superseded; the sensitive-folder fence is correspondingly load-bearing.)*
9. **Never rewrite what someone wrote.** The files in a person's vault are theirs, and the room does not change their words. The tidy-up is the one exception, and it is narrow:
   - It may add headings and fix line breaks on a note that is hard to read — a wall of text with no structure. A note that already reads well is left alone. Not one word changes, and a note is never rebuilt from its source.
   - It may copy the text out of a picture and place it beneath that picture, marked as a transcription. Copying is not writing.
   - Anything the room composes itself never goes in a person's note. It becomes a separate note that says what it is about, and nothing is written into the original to point at it.
   - Nothing on the never-show list is ever touched. Where a person has said which folder holds the things they save, that answer is used both ways: what is inside it may be offered, and what is outside it is theirs.
   - Every change is shown before it lands, and every change is exactly reversible after. Every note the room declines to touch is counted and said out loud.

   That is the entire permission. It does not permit rewording, summarising, deleting, moving or renaming anything. Law 4 continues to govern everything the room *displays*; this law governs the files themselves. *(ADDED 2026-08-14 by the owner, and amended the same day. Human readability became a first-class goal of the tidy-up, which until then was permitted to touch only the labels at the top of a note. Written down rather than implied, on the precedent of law 4's own resize amendment: what a person ends up looking at is no longer exactly what they wrote, and that is the thing these laws protect. ⚠ The first version tested "did the person write this?" — **the owner named that as its weak point while approving it, and measurement proved her right**: on her own vault the test works only because her saved things land in one folder; on the demo vault that ships it would have touched nothing at all; on the untidied test vault it skipped three quarters and skipped the wrong ones. The test is now "is this note hard to read?", which needs no labels and works on any vault, and the protection for a person's own writing moved to the never-show list, the folder they name, and seeing every change before it lands.)*

## Data model (house-compatible — this outlives the room)

**Item**: id · source (photos | phone-notes | ai-chat-export | obsidian-vault | future adapters) · type (text | image | mixed) · created/saved date · last-opened date (nullable) · state · category tags (e.g. "screenshots") · trigger flag.
**States**: `unseen` (imported, not yet judged) · `blessed` (safe to resurface) · `never_show` (kept, never surfaced) · `resting` (blessed but sleeping until date — set by "not really", ~3 months) · `retired` ("never again" — permanent).
**Reactions**: glad | not_really (→ resting) | never_again (→ retired). All state changes revisable by the user forever, except retired stays retired unless the user digs it out deliberately from a management view.
**Shelf selection rule (MVP)**: from `blessed`, prefer items never opened or not opened in 30+ days; 3–5 per visit; no repeats within a visit cycle. Deterministic — the librarian never touches this.

## MVP scope (build in this order — mirrors ROADMAP Phases 22–27)

1. **The loop, plain UI first** *(Phase 22)*: folder/file import → item extraction → guided blessing of ~10 items → shelf → open → react. *Working end-to-end before any room art.*
2. **Blessing at scale** *(Phase 23)*: as-you-go blessing — unblessed items may appear on the shelf behind a "soft cover" (user must mark safe/never/not-now before seeing content). Trigger marking per item AND per category ("no screenshots", "nothing from 2023"). Automated never-list integrity test.
3. **The room** *(Phase 24)*: one static cozy study-room scene. Interactive objects, added one at a time: bookshelf (the loop) → photo album (all photos, volume-consolidated) → journal book (all notes) → desk (blessing home) → light clickable decor (animation only, no data logic).
4. **Welcome-back moment + adapters + stats** *(Phase 25)*: after ~14+ days absence, on open: dim room, one candle already lit → brightens to real local time (curtains lift if daytime, lamps warm if night). ≤3 seconds, skippable, **no text, no day-counts**. Import adapters: folder-drop first (markdown, txt, images, ChatGPT/Claude export JSON, Obsidian vault dir); adapter interface designed so adding a source never touches room code; progress bar + ETA for big imports. **Dual-path setup:** built-in one-click import is the default; agent-assisted setup (pointing Claude Code at your folders) is the documented power path — never a requirement. Local stats page: glad-rate, visits, blessed-pool size, "never again" rate — on-device only.
5. **The AI librarian** *(Phase 26 — see section below)*.
6. **Freeze + demo + self-test** *(Phase 27)*: freeze Aug 15, demo Aug 18, then the 2-week self-test.

## The AI Librarian (Phase 26 — Claude Agent SDK, in MVP as of 2026-07-15)

- **Runtime:** Claude Agent SDK as an optional companion; auth = the user's own Anthropic API key or Claude subscription token — never bundled, never required. Choosing the SDK = the **cloud rung** (the SDK drives Claude only); the local-model rung (Ollama/Qwen harness pattern) is a documented future option. Disclose the cloud reality in plain language in-app.
- **Import pre-sorting (suggest-and-confirm):** during/after import the librarian drafts suggestions ("these look joyful / these look like receipts / these might be heavy — set aside unshown?") that the user confirms by tap. When uncertain, err toward holding back. Only the user promotes to `blessed`.
- **THE HARD FENCE (machine-tested, like never-list integrity):** `never_show` / `retired` / trigger-flagged content is NEVER readable by the agent. Default agent scope = blessed bodies + metadata-only for everything else. Reading *unjudged* bodies (what full pre-sorting needs) requires an explicit per-import consent step, plainly worded. ⚠ THE WORDING CHANGED 2026-08-20 (owner, map #62 #77): the pre-sort is the `local` tier and its allow-list holds her own machine ONLY, so the old line "this sends unreviewed content to Claude" was FALSE. It now reads "this reads what's newly arrived, on your own computer. nothing is sent anywhere and nothing is charged." ⛔ The consent step is NOT retired by that — reading unjudged text is a grant whoever reads it.
- **Librarian's note:** triggered by the user's own current writing, drawn ONLY from blessed material, delivered as a gift in the designated spot — a note on the desk, never a popup.
- **Gentle check-in:** converts a noticed recurring hard topic into ONE tentative question in the same designated spot; never quotes painful material back; asked once — a dismissal is permanent; the user's answer becomes the filter, the AI never sets it.
- **AI memory = plain local files** in `.studyroom/` (the librarian's notebook) — readable, editable, deletable by the user; the user's verdicts feed the same files; no hidden state.
- **Ladder gate:** pre-sorting works on a real import by the **Aug 15 freeze**, or the demo ships the no-AI build (fail-open makes this a config flip) and the librarian completes during the self-test fortnight. The librarian never cuts the loop, safety, or the room.

## Scope ladder (pre-committed; cut from the bottom, never cut the loop or safety)

| Checkpoint | Must be true | If missed, drop |
|---|---|---|
| Jul 28 | loop works end-to-end, plain UI | clickable decor |
| Aug 8 | room scene live w/ working bookshelf | desk-as-object (blessing = plain screen) |
| Aug 13 | album + journal objects live | one container object |
| Aug 15 | feature freeze; polish + demo only — AND the librarian gate: pre-sorting live on a real import | the librarian (falls back to fail-open no-AI) |
| Aug 18 | demo day | worst case: static room + working shelf = still the whole thesis |

The librarian sits on its own rung *below* everything the original ladder protects — it may never displace the loop, safety, or the room in a cut.

## Do NOT build (decided, with reasons on file)

Push notifications · capture/journaling features · AI *deciding* what surfaces or sentiment-verdicts (suggest-and-confirm only) · streaks/gamification/decay · mood tracking dashboards · social/sharing · auto-generated videos/collages/filters · drag-and-drop item placement **in the reading loop** (see amendment below) · avatars · setup questionnaires beyond 2 yes/no · cloud sync of user data · telemetry.

**Amendment (2026-07-18, the owner's decision of record):** drag placement is permitted ONLY inside an explicit owner **design mode** — entered deliberately from Manage, locked by default, never part of the everyday reading loop. Rationale: the fiddly-mechanics research (9/11 hurt) targeted *everyday* interaction; arranging your own space is where belonging comes from. Fences: coarse forgiving snap (12px = 0.5 ft, never pixel-precise); functional objects (bookshelf, album, journal, desk) are move-only — never deletable/duplicatable (they ARE the loop); accessories/decor are free (add/remove/variants); outside design mode everything is locked and click-to-open behaves exactly as today.

## Parked for post-MVP (designed, not scheduled)

- **The cat**: optional pet, adopted from inside the room; greets, never misses; no needs, no sadness, never references absence.
- **Live sync** with phone notes/photos apps; e-reader highlights adapter.
- **The local-model librarian rung** (Ollama/Qwen, reusing the clippings-processor harness pattern) — the only rung where "your words never leave the room" is literally true.

## Self-test protocol (user #1 = the owner, 2 weeks post-loop)

Daily-ish visits anchored to an existing habit; measure: glad-rate (target ≥60%), voluntary visits (≥3/wk), first-session import <15 min effort, "never again" <10%, zero never-list leaks. External testers only after this holds.

## Tech constraints (implementation deliberately open — decide at `/gsd-discuss-phase 22`)

Local web app; must run fully offline (librarian excepted, opt-in); no accounts; data stays in user-controlled files/dirs; prefer boring, durable tech over frameworks-of-the-week; the room art can be simple (flat illustration + positioned hotspots) — charm over fidelity. The librarian's Agent SDK companion implies a Node (or Python SDK) runtime for that tier only — the base app must not inherit the dependency.

## ⛔ Publishing: NEVER push this repo (identity guard)

This repo is published **only** as a clean-room file copy:

```bash
python3 tools/stage_public.py
```

That script copies git-tracked files into a staging tree, applies the exclusion
list, redacts denied patterns (emails etc.), and gates the result. The public
repo therefore starts with a **blank history**.

**Do not "simplify" this into a git push, remote, mirror, subtree, or sync.**
The owner publishes pseudonymously as **IndoorHuman**, and a push would send the
full history in one command:

- author name + email on every commit — **399 of the 472 read
  `The Owner <owner at the-owners-laptop>`** (real name + hostname); only
  73 use the IndoorHuman identity
- every commit timestamp, including ~175 on weekday daytimes
- every version of every file ever committed, **including files deleted later** —
  deleting removes a file from the working tree, not from history
- and it bypasses the redaction gate, which only ever inspects the staged copy

Guards in place: `~/study-room` has **no remote configured**, and a `pre-push`
hook (`.git/hooks/pre-push`, installed 2026-08-11) refuses every push with an
explanation. The hook is local-only — it does not travel with a clone and
`--no-verify` bypasses it — so it is a reminder, not a wall. The real guard is
this rule.

Context: the launch map's Identity note, on the private planning tracker
(`docs/agents/issue-tracker.md` names where that lives — that file is
deliberately untracked, so it never reaches the staged copy). **The tracker's
repo name is itself a DENY pattern in `tools/stage_public.py`**: it must not
appear in any tracked file, including this one. That is why this paragraph
describes the link instead of being the link.

## Local development notes

- After `git pull` or checking out a branch that changes `server.py` or `study_lib.py`, quit and restart `python3 server.py` — the room has no hot reload, and a stale server process can keep serving pre-fix API behavior while the browser loads updated static files.

## Agent skills

*Configuration for the `mattpocock-skills` engineering skills, set up 2026-08-07. These sit BESIDE GSD, not inside it: GSD owns phase planning and execution (`.planning/` in the vault); these own ad-hoc decision-charting, triage, and review in this repo.*

### Issue tracker

Local markdown under `.scratch/` — this repo has no git remote, so GitHub Issues aren't available. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line per issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
