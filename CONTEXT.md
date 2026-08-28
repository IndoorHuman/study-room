# The Study Room

A local-first room where a person's already-existing personal archive comes back
to them, a few things at a time, only when they walk in. The product laws, the
item **states** (`unseen` · `blessed` · `never_show` · `resting` · `retired`) and
the **reactions** (`glad` · `not_really` · `never_again`) are defined in
`CLAUDE.md` and are not restated here.

## Language

### Where a thing came from

**Source**:
The *door* an item came through at import — `folder-drop`, `obsidian-vault`,
`ai-chat-export`, or `librarian` for something the librarian itself wrote. It is
not the app the thing originated in.
_Avoid_: origin, provenance, adapter name.

**From-source**:
The app an adapter actually collected an item from — only ever `apple-notes` or
`apple-photos`. Recorded *alongside* Source, never instead of it, and never shown
to the user.
_Avoid_: using "source" for this. They are different facts and conflating them
has already produced one wrong conclusion — that the room can show a visitor
which app something came from. It cannot.

**Adapter**:
The thing that collects items out of an app and stages them as files. Its output
is then imported like any folder, so an adapter's items carry Source
`folder-drop` and From-source names the app.
_Avoid_: importer, connector, integration.

> ⚠️ `CLAUDE.md`'s data-model line lists Source as
> `photos | phone-notes | ai-chat-export | obsidian-vault`. **`photos` and
> `phone-notes` are not real values** — that line predates the adapters and has
> drifted. This glossary is authoritative for Source.

### What the librarian is allowed to see

**Fence**:
The rule that keeps content away from every machine reader — a cloud model, a
local model, or an on-device framework alike. It is a property of the *content*,
decided before any read, and it binds **reading**, not sending: a fenced item is
never read, so nothing is ever derived from it.
_Avoid_: filter, blocklist, guardrail. And _avoid_ reading it as a rule about the
librarian, or about the network — the librarian is only one of its readers, and
a free on-device pass is bound by it exactly as hard as a cloud call.

**Reader**:
The one function that hands item content — a text body, a picture file — to
anything that will machine-read it. It applies the fence, so every consumer
draws from it rather than from the store.
_Avoid_: calling it the payload builder — the builder is one of its callers.

**Snapshot**:
The copy of a file the room takes at import and keeps in its own library. It —
never the person's own file — is what the **Reader** hands over, so anything
written into their file *after* import is never read *until the next import*.
A snapshot is taken once **per version**: an import that finds a changed file
at a path it already knows re-takes the snapshot in place, at the same name,
keeping the item's id (wayfinder #58, built 2026-08-14). The snapshot is also
what the room compares against to answer whether a note's *words* changed or
only its whitespace did.
_Avoid_: "the file" or "the note" when the reading path is what is meant; the two
drift apart the moment anything tidies a vault. And _avoid_ "cache", which
implies it refreshes on its own.

**Facet**:
A small value stamped onto an item at import and stored beside it — today `year`,
`folder`, and the literal `screenshots` tag. Facets are most of what the
librarian sees for an item whose body it may never read, and they are stamped
**once per version**: a new item is stamped on the way in, and an item the
import recognises as a file that has *changed* has them re-derived, because they
are the room's own guesses about bytes that just moved underneath them.
_Avoid_: reading a facet as metadata taken from the person's own writing — today
the only frontmatter key the import reads is `reflects:`, and a note's own tags
never become the item's tags.

> ⚠️ **Amended 2026-08-14 (wayfinder #58 ruling 2, built).** This entry used to
> say facets were stamped *once, on a new item only*, and that an existing
> item's facets were never rewritten. That was true only while an edited file
> became a *different item*; it now keeps its id, so stamped-once became
> stamped-once-per-version. ⚠️ `year` is the exception in practice — `created_ms`
> is deliberately **not** re-derived, because every write in this codebase is a
> temp-write-and-rename and re-reading a tidied note's birth time would move it
> to today.

> ⚠️ The *last* sentence above is still **ruled to change** (wayfinder #71):
> `room` and `tags` are to be read from a note's own `---` block and stamped as
> facets, exactly as `reflects:` already is. Until that lands, this entry
> describes the code and that sentence does not.

**Derived handle**:
Anything a machine made from an item: on-device labels, a feature print, an
embedding vector, a Gist. Always a regenerable cache, and always destroyed when
the item becomes fenced.
_Avoid_: confusing it with her own words — a name she gave a photograph is not
derived, is not regenerable, and is never deleted.

**Read here** / **read by {company}**:
The only two things the room says about a job, and the axis they sit on is **who
reads it** — never where the thing lives. Everything stays on her machine either
way; some jobs additionally send a **copy of the text** out to be read, and read
the answer back. The company is named wherever the fill is resolved; where no key
exists yet it is "the AI service you give a key to".
_Avoid_: the pair "stays on this computer" / "goes to Anthropic" — it puts the two
on the axis of where the item **lives**, where the second value is plainly false,
and "goes to" reads as the thing having left her keeping. And _avoid_ naming a
model: the recipient is a company, whose name outlives the models under it.

**Fenced roster**:
The list of top-level folder names whose contents the fence excludes — seeded by
the app, then editable by the user. Membership is decided at import, by an item's
first vault-relative path segment.
_Avoid_: exclusion list, ignore list, never-list.

**Never-list**:
The items a person marked keep-but-never-show. **A different thing from the
fence**: the never-list is per item and chosen by the user after seeing it; the
fenced roster is per folder and applies before anything is read.
_Avoid_: using "never-list" for the fence, or vice versa.

**Blessed**:
Marked by the user as safe to resurface. Only the user ever blesses; the
librarian proposes and never disposes (law 7).
_Avoid_: approved, whitelisted, allowed.

### What the librarian is asked to do

**Job**:
One kind of thing the librarian is asked to do — pre-sorting, cleaning, headings,
the note, the reflection, connections, the config ask, blessing selection. A job
is a *purpose*, not a call: one job may run many times over many batches.
_Avoid_: task, call, request.

**Tier**:
The class of model a Job is allowed to run on — `on-device`, `local`,
`cheap-cloud`, or `good-cloud`. Every Job is pinned to a tier in code. The owner
may change which model fills a tier; never which tier a Job sits in — except
`on-device`, which has no dial at all because the tier *is* the framework (a free
macOS one: no tokens, no prompt, no judgement).
_Avoid_: using a model alias (`opus`, `haiku`) to mean a tier. A model fills a
tier; it is not the tier. _Avoid_ also: treating `on-device` and `local` as the
same rung — `local` is a language model on her machine, `on-device` is not a
language model at all.

**Supported local** / **Permitted local**:
Two different promises about a Job running on the owner's own machine.
*Supported* means the room stands behind the result. *Permitted* means she may,
and the room says plainly that quality drops — at the picker, and again on the
first output written that way. Every cloud Job is permitted local; only the
**config ask** is neither, because it changes settings from a sentence — with no
cloud key it is absent, and Manage is how settings change.
_Avoid_: "local is supported" as a blanket claim. The distinction is the promise.

**Provider**:
Who answers a call — Anthropic, OpenAI, or a local Ollama model. Distinct from
the model and from the Tier: one provider can fill more than one tier.
_Avoid_: backend, runtime, vendor.

**Working librarian**:
The least the room needs to open: **one** Provider that can answer. For a cloud
Provider that means a key is present; for the local one it means Ollama is
running *and* has its language model. One is always enough — a key-only room and
a local-only room are each complete, and neither is a lesser room.
_Avoid_: "signed in", which describes a login the room no longer has; and
"available", which the code uses for a narrower per-call question.

**Start-up check**:
The look the room takes at its Providers as it starts. It checks only what is
free to check, says only what it checked, and remembers nothing between looks.
It **reports** — it refuses only a room that has nothing in it yet.
_Avoid_: "the front door", which named a metaphor rather than the act, and
"the probe", which named a subprocess that no longer exists.

**A key is here** / **your key works**:
Two different claims, and the room may only ever make the first at start. Having
a key is not proof it is good; only a Provider rejecting it is proof it is not.
_Avoid_: "ready", "set up", "connected" — each quietly asserts the second.

**The pool question** / **The feeling**:
The two separate things the pre-sort asks of every item, one per axis. The **pool
question** answers `life` or `admin` — `admin` is narrow, meaning transactional
paperwork only, so every hobby and everything studied is `life`; it has no third
value, and an unsure item is `life`. The **feeling** answers `joyful`, `heavy` or
`can't tell` — and `can't tell` is **held**, never proposed. The two axes fail in
opposite directions on purpose: holding back is safe about a feeling, and unsafe
about the pool, where it would bury real material.
_Avoid_: **"shelf"** for either of these — the shelf is the deterministic
`blessed` surface the librarian never touches. _Avoid_ also: `receipts`, the old
fourth label, which in practice meant "not emotional" and filed coping notes and
course readings as paperwork; and treating one axis as a value of the other.

**Not relevant**:
What the **owner alone** says to an item the room has offered her: *this carries
no feeling for me either way*. The librarian can never assign it. It changes no
item state — the item stays `unseen`, stays in Manage, stays findable — and it
withdraws that item from **every** librarian proposal, not one surface.
_Avoid_: reading it as a sixth state beside `never_show` and `retired`, whose
absoluteness law 5 protects; and _avoid_ "rejected" or "dismissed", which
describe a verdict on the item rather than the absence of one.

**Blessing selection**:
The librarian offering a few much older **`unseen` photographs** for blessing,
once a visit, because of something the owner recently **blessed** — reaching back
through a **fortnight of other years**, oldest first. Which fortnight comes from
the **Seed**, and when the Seed knows no date, from today. It **proposes**
only; the user blesses. Text is not in its pool: local ranking over her text
found one result above chance in a hundred, so a pool containing text would hold
thousands of things and offer none.
_Avoid_: saying it reaches back because of an **Arrival** — an arrival is not a
trigger at all any more, and on a real store almost nothing ever arrives. _Avoid_ saying it searches by **place**: places are the addresses she
lived at in sequence, so they date a photograph rather than reaching past it —
place is what the room *says* about a result, never how it was found. _Avoid_
confusing it with the **shelf**, which draws from `blessed` and is deterministic
and untouched by the librarian; or with the **guided first pass**
(`pickBlessingCandidates`, oldest-first), which is now the setup beat only.
_Avoid_ also: assuming the pre-sort's labels gate it — they never touch a
photograph.

**Moment**:
What Blessing selection counts when it offers "three things": a burst of frames
taken seconds apart is one Moment, represented by a single frame. Her camera
produces twenty near-identical pictures of one afternoon, and offering all of
them would spend the whole offer on one minute of her life.
_Avoid_: reading it as an event she attended, or as anything stored — a Moment is
computed at the point of offering and never written down.

**Seed**:
The thing a reach is made *from*: everything the owner has blessed since the last
offer. Of that set, the **last** thing she blessed supplies the reach's date —
and a Seed supplies *only* a date. An item that knows when it happened in her
life gives that; an item that does not gives nothing, and the reach falls back to
today's calendar. The rule is about the item, not its type: a photograph without
a capture date falls back too, and a conversation she had in 2024 does not.
_Avoid_: confusing it with the **Arrival**, which is material that merely landed;
a Seed is material she judged, which is why reading it needs no new permission.
_Avoid_: saying its **place** is reached back from, or that the search reaches
back from what a Seed is *about* — neither has ever been true of a photograph
pool, and a date is the whole of what a Seed hands over.

**Offer**:
The one thing the librarian brings out per visit: at most three **Moments** from
`unseen` photographs, reached back through a **fortnight of other years**, shown
under the time of year it reached through ("around mid-March, other years") and
never under a reason. The desk, the album and the journal are four doors onto one
Offer, not four piles. She may bless one, mark it **not relevant**, or ignore it;
there is no "not now". When there is no Offer the doors simply go quiet — no
empty state, no message.
_Avoid_: treating it as something a visit is owed. An Offer answers a blessing;
a visit where she blessed nothing gets none, because the blessing is the asking.
_Avoid_: counting it in files — an Offer counts Moments.

**Reading**:
The librarian taking down everything she has kept and saying what it is *about* —
threads of meaning across the whole **blessed** collection. It is **occasional,
never per-visit**: it happens once twenty newly blessed pieces have accumulated
since the last one, because a shelf that has not changed yields the same answer
twice, and a repeated insight reads as the room having nothing to say. A Reading
she never opens is superseded by the next one, never preserved.
_Avoid_: "connections run", which named a per-visit thing this is not; and
_avoid_ reading it as a search — a Reading has no search step at all, which is
why the whole shelf must be present at once.

**Gist**:
One line saying what a blessed piece is about, written when she blesses it. It is
what lets a **Reading** hold the whole shelf at once without holding every word
of it: the older pieces arrive as Gists, the newly blessed ones in full. A Gist
is a regenerable cache — throw them all away and write them again — and she never
sees one. **A picture has one too**: a sentence describing the photograph,
carrying the capture date and place the file already knows. The two are the same
Gist and the same Job — only the reader differs.
_Avoid_: **heading**, which is a different Job; and the pre-sort's **why**, which
explains a sorting verdict rather than saying what a piece is about. _Avoid_ also
substituting a **title** for a missing Gist: her titles are filenames, so a title
is present while saying nothing, and an item with no Gist is skipped instead — a
photograph's title is a UUID, so this holds hardest there. _Avoid_ calling a
picture's Gist a **name**: it says what is in the frame, it does not identify
anyone, and it is derived — her own word for a picture is neither.

**Arrival**:
The material added since the previous visit — the set of items whose `saved_ms`
is newer than the stored visit marker. **No Job is triggered by an Arrival any
more** — Blessing selection reaches from a **Seed**, and a **Reading** happens on
a count of newly blessed pieces — so the word now describes material, and nothing
else.
_Avoid_: dating an Arrival by when a photograph was **taken**. A picture from
2017 imported tonight arrived tonight.
_Avoid_: using "arrival" for the *person* walking in. She makes a **visit**; the
code's "arrival tap" is the moment a visit begins, not the material. The two
senses collide and only this one is the noun.

**Front call**:
The one cloud call at the start of a visit that reads the **Seed** (or a coherent
Arrival) and says what to search for — one first-person sentence plus any place,
date window or named subjects it can draw from handles the owner has already
given. It writes the query; it never sees, ranks or chooses the results. When
the Seed is a photograph it does not fire at all: the date and place come from
the file.
_Avoid_: calling it a search — the search is local and free. And _avoid_ reading
its sentence as a conclusion about her: it is scaffolding for one search, thrown
away after, never written to the librarian's notebook.

### What tidying writes

**Vault file**:
The person's own file, where they wrote it and where Obsidian opens it — the
counterpart to the **Snapshot**, and the one a tidy-up edits. Because the room
reads the snapshot and never re-reads this, a tidy-up's result is invisible in
the room until the import learns to notice a changed file and take a fresh copy.
_Avoid_: "original" — nothing was moved, so both are originals in the sense that
matters. And _avoid_ treating the two as one thing, which is the mistake
wayfinder #72 found in this project's own prose.

**Shape**:
What form a note takes — a recipe with ingredients and steps, a numbered tip
list, a transcript, a restaurant write-up. Worked out by **reading the note**,
never looked up, and it is what decides which headings a tidy-up may add.
Distinct from Filing type and from Kind, and distinct from what a note is
*about*: a recipe filed under weight management and a recipe filed under a
cuisine are filed differently and have the same Shape.
_Avoid_: type (three different facts in this project are now spelled `type`),
format, template.

**Sidecar**:
A note the app itself wrote, kept in its own place and naming what it is about,
so nothing the app composed ever sits inside a person's own note. The room's
reflections are the shipped example; a diagram summary is the next one. The
pointing goes **one way only** — the sidecar names its subject, and nothing is
written into the subject to reach the sidecar.
_Avoid_: annotation, comment, note-on-a-note — all three suggest something
attached to the person's file, and nothing is.

> ⚠️ **Copying is not writing.** Text read off a picture and placed in the note
> beneath it is the picture's own words, and carries the same promise as
> *never reword*. A sentence describing what a picture shows is the app's
> opinion, and becomes a Sidecar. The line is who composed the words, not who
> typed them. *(Owner ruling, wayfinder #72.)*

**Evening line**:
The one plain sentence the room is told before it writes a reflection, naming
only what actually stands out about tonight's pool — how many pieces there are,
whether they sit in one window or reach back years, whether one of them dwarfs
the rest. An unremarkable evening gets **no sentence at all**. It describes; it
never suggests a form, and the room is never told what to write.
_Avoid_: shape (two other facts in this project are already spelled that way),
summary (it summarises nothing), variation block — that was the deleted
avoid-list, which named what *not* to do. This names what is there.

**Counting**:
The owner's word for a reflection that opens by tallying instances — *"the word
perfect turns up twice"*, *"four of these open at a window"* — instead of by
what happened. She rejected it on sight and named it herself: *"the AI just
counting the same words in the notes."* The room appears to do it to prove a
pattern is real when nothing has told it what the evening holds.
_Avoid_: repetition, listing, pattern-matching — none of them is the complaint.
The complaint is the tally standing where the writing should start.

**Kind**:
The store's own word for what an item is — `text` or `image`, decided at import
from the file extension. Every item has exactly one.
_Avoid_: type. Two different facts in this project are both spelled `type`, and
this is the one the store means.

**Filing type**:
A filing label written into a note's own `---` block, alongside `room`, `tags`
and `domain`/`topic`. It is a word from the person's own vocabulary, not a
classification the room understands. Distinct from Kind, though the key on disk
is also `type`.
_Avoid_: category, class — and _avoid_ reading it as Kind.

**Owner vocabulary**:
The filing labels a tidy-up run is allowed to choose from — drawn only from that
person's own vault, never from a shipped taxonomy. A label the room itself wrote
on an earlier run is **not** owner vocabulary and never becomes it, however many
times it is read back — by **any** route, including a prior write sitting in the
note's own `---` block inside the body excerpt.
_Avoid_: taxonomy (that is a fixed scheme; this is harvested per vault),
suggestions, candidate labels.

**Filing room**:
The one filing label a tidy-up run proposes per note, written to the `room` key
in that note's own `---` block. It is a word from the person's Owner vocabulary,
chosen because it is the field the room itself reads back.
_Avoid_: reading it as a room of the house — the house's rooms are places a
person walks into, and this is a word in a text file. Also _avoid_ folder,
category, destination: nothing moves.

> ⚠️ *"the field the room itself reads back"* is **not true of the code today**
> (wayfinder #71). The room reads `room` off the **proposal record**, to group
> the review screen's counts — once Apply is tapped, the `room:` line in the
> person's own note is read by nothing, ever. The Facet ruling above is what
> makes the sentence true; until it lands, the justification is aspirational.

**Row read** / **Body read**:
The two ways the librarian can be shown a note. A **row read** hands it only the
item's facets — id, title, source, kind, date, tags — a few dozen tokens. A
**body read** hands it the note's text up to the 8 KB cap, roughly twenty-five
times more. The tidy-up's whole case is that good labels let a row read reach the
answer a body read would have reached, so the body is sent only for what the row
could not decide.
_Avoid_: calling a row read a "summary" — nothing is summarised and no model
wrote it; it is the facets and nothing else.

**The scheme**:
How a person's notes are filed. There is no scheme file and nothing stores one:
the scheme **is** the vault — its folders, its tags, its existing `---` values —
re-derived on every tidy-up run. A person edits it by writing their own notes.
_Avoid_: taxonomy, config, filing system — all three suggest a stored artifact
that can drift from the vault, and none exists.

### Demo and publishing

**Demo vault**:
The Katherine Mansfield vault — a complete Obsidian vault assembled from
public-domain writing, shipped as the launch demo data. Its diary is fenced by
default on purpose; see `docs/adr/0001-journal-stays-on-the-default-fence-roster.md`.
_Avoid_: dummy data, test vault, sample vault.

**Staging**:
Copying this repo's tracked files into the public repo through `tools/stage_public.py`,
which excludes, redacts, and then fails loud on anything that should not leave
the machine. It is a file copy — **history is never transferred**.
_Avoid_: publishing, pushing, releasing (all three imply git history moves, and
it does not).
