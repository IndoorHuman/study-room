# the librarian: who answers, what it costs, and the fence

*(AMENDED 2026-08-13 by the 26.93 rebuild, superseding the sign-in
framing of the 2026-07-21 amendment. What did NOT change: the Study Room
REQUIRES a librarian (laws 7 and 8 as amended 2026-07-21), and there is
no no-AI build and no fail-open fallback. What DID change: a librarian is
no longer a signed-in command-line tool. It is a key you bring, or a
model running on your own machine. The room no longer starts a program to
do its reading; one function makes one plain request. See CLAUDE.md laws
7/8 and `.planning/STUDY-ROOM-JOURNEY.md`, decision of record.)*

the study room is a local-first app: everything in the room (the shelf,
the pile, the album, the journal) lives on this machine and stays on
this machine. the librarian is the companion that reads a big import and
suggests which things look joyful, which look like receipts and
paperwork, and which might be heavy and better set aside unshown. it
suggests; you decide. deterministic rules own the shelf, and nothing the
librarian says changes an item until you tap the change yourself.

it runs when you ask, never on its own, never at app open.

## who answers

three can answer, and the room names which one before anything is asked
of it: on start-up it prints, in plain words, who is filling each kind of
work, and it says so rather than trying one and then another.

- **your own machine**: a model running here, through ollama. this is
  the shipped default and it is a complete room: nothing is withheld from
  it, and it is the one rung where the reading happens right here: what
  you wrote is not carried off this machine at all. ⚠ that sentence is
  worded the long way round on purpose and must not be tidied into the
  short, obvious phrasing for it: said without a rung attached, the short
  version is a claim about the WHOLE app, and the whole app does send
  allowed parts of your library to a company when a company is the one
  answering. the short phrasing is refused outright wherever it appears
  in this file, deliberately without asking whether it was scoped, and a
  reader skimming one line cannot see the qualifier, and this is the one
  subject the room may never be wrong about.
- **anthropic**: used when you have given the room an anthropic key.
- **openai**: used when you have given the room an openai key instead.

⚠ when a company is the one answering, the allowed parts of your library
cross the internet to that company. that is the disclosed path off this
machine, and the fence below is what bounds it. when your own machine is
answering, nothing leaves at all.

a tier nothing can fill is named rather than quietly served by something
else: the jobs pinned to it refuse, and the room says so. it never
substitutes one answerer for another on its own.

## built for self-use

this app is built for the person who owns the room, and it stays free;
nothing about it is monetized, and the librarian does not change that.
no account is bundled and no key ships with the app. what the room does
need is a librarian, and a librarian is one of the three above: a key you
bring, or the model on your own machine.

## giving the room a key

one command, run in a terminal from the folder the room runs in:

```
python3 server.py --setup
```

it asks at a hidden prompt and writes what you give it to ONE file, a
`keys.json` inside a `.study-room` folder in your home directory, the
file at mode 0600 inside a directory at 0700. that is the only place a
key is ever kept. it is never shown back to you, never written to a log,
and the librarian is fenced out of reading that file like any other
private thing. run the same command again to change a key or take it
away; there is no second surface to find and no copy left behind.

there is no key field, no token box and no login button anywhere in the
room itself, on purpose. the one place a key is ever typed is that
terminal prompt.

if you would rather the room stored nothing at all, a key already set in
the shell you start the room from still works, and it wins over the
stored file; the room reads it there, per use, and never writes it down.
this document deliberately does not spell that command out: a key typed
at a shell prompt is a key left behind in your shell history, and the one
command above is the supported way in.

what a run costs is metered by the provider and readable on the
provider's own usage page:

I understand as an individual we want to be token efficient so if you are running a task that requires an extensive token usage by using an advanced AI model, this app will show you the estimate ahead of time, please note this is not a bill provided by your AI service provider

a titles-and-dates
sort of even a large library is small work; a full consented read is the
expensive one, and it is the one that always asks you first.

one rule for forks, stated plainly: a fork must never offer, collect, or
proxy anyone's account login. a key each person brings for themselves,
or the model on their own machine, is the sanctioned shape for anything
beyond self-use.

## the fence, in plain words

some things are never readable by the librarian, under any mode, with
any consent: items you marked never-show, items you retired, items you
trigger-marked, and anything an active filter excludes. they are not
summarized, not named, not counted; they are absent entirely from what
leaves this machine. not even their titles are sent.

everything else is scoped. the default sort sends titles, dates, and
other file facts only, plus the text of items you already blessed.
reading UNJUDGED text takes your ok for that one run, and the ask is
worded exactly: "this reads what's newly arrived, on your own
computer. nothing is sent anywhere and nothing is charged." consent is
per-run; nothing anywhere stores a standing grant.

## the reflection session, in plain words

tapping the candle opens one reflection session. what's newly arrived
is offered for your own judgment first (a short walk through the new
things, where you say how each one lands, with zero AI involved), and
only then does the librarian read the pool + your comments to shape one
reflection. the reflection's thread runs through what you welcomed, and
when you ask the librarian to write the reason for something you
welcomed, that short reason arrives with the reflection and is kept in
the blessings notebook. your one answer at the
start covers the whole session, chat turns included; the librarian
never re-asks mid-conversation, and nothing anywhere stores a standing
grant across sessions. the finished paper has exactly three quiet
doors: keep it (the reflection becomes a book on your shelf), add
details (shape it with the librarian first; everything you add is
covered by the same one answer), or let it go (nothing is kept, and
letting go is free). nothing is ever shelved without your own keep.

## writing a kept reflection back to your vault

off by default. when you turn it on (in manage, under "your
reflections"), a reflection you keep is ALSO written into your vault as
one NEW note in Claude's observation/Journal analysis, with a
reflects: line naming the vault files it grew from, in the same shape
the journal-reflection ritual writes. this writer never opens, edits, or
touches anything already in your vault; it only ever creates one new
file, and an existing name makes it pick a fresh one. with the switch
off, keeping a reflection changes nothing in your vault at all. if the
vault can't be reached, the book still lands on your shelf; the room
never loses your keep over a vault hiccup.

two other switches CAN write into notes you already have: comments, and
tidying. comments is off until you turn it on. tidying arrives on, and
can be turned off; even on, it does nothing until you go to it and ask.
the comments and tidying sections below say exactly what each one
changes, what it leaves alone, and how to take it back.

## a note you leave, written back into the file it came from

off by default. when you turn it on (in manage, under "comments"), a
note you leave on an item that came in from an Obsidian vault is added
under `## Comments` in that original file, timestamped, at the end of
that section, or, if the file has no such section, as one new section
added once at the end of the file. the entry is only ever ADDED: every
line you wrote stays exactly as you wrote it, above it and below it.
with the switch off, your notes stay in the room and touch no vault file
at all.

## how a saved note is laid out for reading

some of what you saved arrives as one long block: a whole recipe, its
ingredients and its steps, run together in a single paragraph. that is
hard to read, and hard to read is where a note gets abandoned.

so when the room shows you a note you clipped from somewhere else, it
may lay that block out the way its own writer already implied: a run of
ingredients becomes a list, and a section that already had a name gets
that name as a heading. a list made that way stops where its own
writer's sentence stops, and whatever was written after it stays as
prose underneath it rather than being pulled into the last item. every
word on the screen is yours.

and where a long block runs on with no break in it at all, the room may
put its sentences on separate lines, at its own writer's full stops and
nowhere else. nothing is added there and nothing is moved: what goes in
is a blank line, in a spot where the writer had already finished a
sentence.

one mark does come off, and you asked for it. a note clipped from a
social app often carries that app's own row of tags (#短发 #穿搭灵感
#fyp), and on a note you clipped from somewhere else, the room takes the
# off a row like that so the words read as words. the hash is the only
thing removed and the word always stays: 短发 is still 短发. it happens
only where two or more of them sit together on one line, and never to a
lone one, never to a heading, never inside a code block, a quote, a
table, a caption or a comment. all of that is true of a tag written as a
link too: if a tag was a link, the link stays a link and only its # goes,
and it goes nowhere the room would not take a plain one. and where you
wrote a # with no space in front of it, stuck to the end of your own
word, the room leaves it alone, because there it is the thing keeping
your sentence and your tags apart. it happens on the screen and not in
your file.

your wording is never changed. every word you saved is there, in the
order you saved it: nothing is rewritten, nothing is summarised,
nothing is shortened, no word is dropped. code blocks, tables, quotes,
pictures, and the picture captions written under them are left exactly
where they were. apart from that one hash, only the spacing around your
words moves.

nothing is written to the file. this happens on the screen while you
read. the one thing that CAN change a note on disk is the tidy-up below;
it only ever changes spacing, it shows you the change first, and it never
runs unless you go to it and ask.

notes you wrote yourself are shown exactly as you wrote them, always;
and if the room cannot tell where a note came from, it treats it as
yours. that includes the hash above: a tag row you typed in your own
note keeps its marks. and on any note where what you are looking at
differs at all from what you saved (laid out, or only with a hash
taken off), "show as saved" puts the original back on the screen in one
tap, every character of it.

## tidying: long notes made easier to read

the tidy-up is here when you arrive, on one switch, in manage under "tidy
your vault". on is not the same as running: it does nothing at all until
you go to it and ask. nothing is offered to you after an import, and
nothing happens in the background.

what it does is one thing. some notes are one long wall of text with no
break in it anywhere: a whole entry, or a whole recipe, run together in
a single paragraph. that is hard to read, and hard to read is where a
note gets abandoned. the tidy-up puts a line break at your own full
stops, so the note can be read.

nothing is sent anywhere. this pass never asks a model anything, because
where your sentence ends is not a matter of opinion. it happens on your
own machine, and there is nothing to consent to except the change itself.

not one word changes. only the spacing does. nothing is added, nothing is
removed, nothing is reworded, no heading is written, no label is written
every character you typed is still there, in the order you typed it.
and that is not a promise about our code: before it writes a single note,
the room compares what it is about to save against what is in your file,
and if anything but spacing has moved it refuses and leaves the note
exactly as it is.

how a run goes: you pick a PLACE: one folder, or the whole vault. you
are never handed a list of your own filenames to tick through. the room
then shows you the three notes in that place it would change most,
before and after, side by side. if it looks right on those, it is right
on the rest, and one tap runs it. if it looks wrong, nothing has
happened yet.

what it changes, exactly: the spacing below the note's own `---` block. a
space after a full stop becomes a line break. the `---` block itself is
not touched by this pass at all. the file's "last edited" date is put
back afterwards, so tidying never looks like an edit and never pushes
your own writing down a list sorted by date. it never moves a file and
never renames one. a note iCloud has not downloaded yet is skipped, never
pulled down.

and every note it does not touch is counted and said out loud: the ones
that already read well, the ones it could not read, and the ones it
refused. a run that skips something never reports that it finished
everything.

undoing it: the whole run goes back in one tap: the exact bytes each
file had before, and its "last edited" date with them. tapping undo a
second time is not an error; it just says it is already the way it was.
if you have edited one of those notes yourself since the run, undo leaves
that note alone rather than throwing your own edit away.

with the switch off, tidying changes nothing in your vault at all, and
the room is the same room it was without it. and the fence above holds
first, as always: a note you marked never-show, retired, or
trigger-marked, or one an active filter excludes, is never listed, never
read, and never tidied, not even its title.

## asking for a change, in your own words

at the desk there is one quiet line, "want the room to work
differently? tell me.", and tapping it opens a single box where you
say, in your own words, what should be different. the librarian only
ever proposes: it reads your sentence and hands back one small card
naming the change and what will actually be different about the room.
nothing changes until you tap the card. your tap is the only writer,
and it lands through the same checked path manage writes through, so a
value manage would refuse is refused here too, and refused before
anything is stored. more than three changes at once is a considered no
rather than a bundle you would have to audit; manage can still make
them together.

what the ask sends, exactly: your own sentence, the names of the
settings the librarian is allowed to name, each one's type, whether
each of those settings is on right now, and, for the one setting that
is not on-or-off, which of the six model aliases is stored. that is
the entire document. it sends no item title, no item body, no filter
value, and no folder from your roster. the last two are not omissions
that could be relaxed later: your roster IS your own list of sensitive
folders, and a filter's value comes from your own items, so both are
worked out here on this machine and never cross that seam at all.

when what you asked for is past the edge of any setting, the librarian
says so and names one door: "that's past what i can change. something
like an ai coding assistant in your terminal could build it, if that's
a door you like opening." then it stops: no how-to, no drafted prompt
for that other tool, no link, no command, no file path. the room does
not name the product, and that is deliberate: a vendor's name inside a
room is a seam in the room, and it ages badly. the specific belongs
here instead, where a builder looks; that door is Claude Code,
Anthropic's coding tool for a terminal. it is a separate thing you
would install yourself, and since the 26.93 rebuild it is no longer
anything this room's own librarian runs on. and when the
librarian simply did not follow your sentence, it says that instead and
asks you to put it another way: an ask it could not read is not
evidence that the room cannot do it, and it will never hand you
homework for one.

## asking the librarian to set something out

there is one more thing that same line answers to. ask it "anything for
me?" and it sets out the few it had already put aside for you: "here
are the ones i'd set out for you." it proposes and stops there;
opening one of them promotes nothing, blesses nothing and shelves
nothing, and your own tap is still the only thing that moves an item
anywhere. when it has none put aside it says so plainly and lets it go:
"nothing i'd set out just now." there is no tally of what is waiting,
because a number of things you have not got to is a debt, and this room
does not keep one.

nothing appears until you ask for it. nothing waits for you when you
open the room, and no shelf, badge, dot or mark anywhere in the room
hints that there is anything to ask for; asking is the whole trigger.
that costs you discoverability and it was chosen with that cost stated
rather than smoothed over; the one place the room ever offers you the
words is the example inside the ask box you already opened.

the fence here is the SAME fence, not a second one. the rows come from
the one guarded selector the librarian's own review surface already
draws from, so a note you marked never-show, retired, or trigger-marked,
or one an active filter excludes, is simply not among them. and the
question you typed crosses to the model exactly as described above:
your sentence and the setting names, nothing else. the model is never
told which notes came back, and neither is anything outside this
machine: that join happens here, after the answer arrives.

<!-- 26.95-31 · copy candidate C-8 (was C-9 before the register was merged and renumbered on 2026-08-15 — see the old→new map in 26.95-COPY.md) · PROVISIONAL WORDING, copy_approved: false — the FACTS below are ruled (D-13, D-14, OD-3 and the owner's keying ruling of 2026-08-15); the SENTENCES are the owner's, to be written in one pass. -->

## saying one of them is not relevant

when the room sets something out for you, one of the answers is "not
relevant for my feelings". it is not a complaint and it is not a
judgment of any kind; it means this one carries no feeling for me
either way. nothing about the room decides that, and no model ever says
it: it is only ever your own word.

the room takes it literally. from then on it stops offering that one,
everywhere it would have offered it, and it does not come round again on
its own.

nothing happens to the thing itself. it is not hidden, not marked, not
moved, and it does not change in any way. it stays where it was, it
stays in manage, and you can still find it and open it whenever you
like. the only thing that changes is what the librarian will put in
front of you unasked.

the answer is written down in one more plain file in the visible
`librarian/` folder, `librarian/not-relevant.json`. each line notes
which thing it was and where its file sits, and either one is enough to
recognise it again, so the answer survives a file being renamed and
survives the same picture arriving a second time.

that file is the whole of it, and it is yours. you can undo it straight
away if you change your mind. after that, open the file and delete that
line, and the next time the room looks, that one can be set out again.

## what the room has noticed about you

the room keeps one plain page of what it has noticed about you, at
`librarian/identity.md` inside your library. the page's own header says
what it is, in the same words this document uses: "derived, not
authored. safe to edit or delete; it re-derives. nothing here ever
comes from a never-show, retired, or trigger-marked item." read it,
correct it, or delete it; deleting it costs you nothing, because the
room writes it again from your own library the next time it looks. the
page is not only there for you to read: what is on it also leans what
the librarian reaches for when it writes, which is exactly why it is a
file you can open and correct rather than something kept out of sight.

it is built from four signals and only four: things you blessed, the
comments you left in your own words, items that came from your own
writing, and the things you said you were glad to see again. a "not
really" is never a signal; the room does not reason about what you
turned away from. and nothing the room itself wrote counts either: a
reflection the librarian made is a machine's prose about you, not your
own voice. the fence holds here exactly as it does everywhere else, and
through the same one gate rather than a second copy of it: an item you
marked never-show, retired or trigger-marked, or one an active filter
excludes, contributes nothing at all: not a word, not a tag, not a
count.

no model writes this page. it is ordinary code reading your own
library, which is the reason it cannot invent a self for you. and when
the room has not seen enough of your library to say something true, the
page is still written and simply says so ("there isn't much here yet")
instead of guessing. it never asks you for more, never counts what is
missing, and nothing in the room keeps a score of how full it is.

## which model writes for you

you choose which model writes your reflections and desk notes. the
picker is in manage, under the librarian, and it reads "which model
writes your reflections and desk notes". which three you are offered
depends on who is answering: on anthropic there are three (opus,
sonnet and haiku) and on openai there are three (sol, terra and
luna). the room starts with opus. it does not rank them for you; the
one orienting line it offers is "opus reads most closely and takes
longest; haiku is quickest." on anthropic, and "sol reads most closely
and takes longest; luna is quickest." on openai, because which one is
right depends on the sitting, not on a league table.

nothing outside those six is accepted. a value that is not one of
them is refused at the moment it would be saved, and never stored: this
is the one setting that travels out as the name of the model asked to
answer, so the list of allowed values is ours and stays short on
purpose.

if you already set one of these in your shell, that still works: a
legal shell value wins over the pick stored in the room, and the pane
says which one is in force rather than pretending the shell said
nothing. a shell value that is not one of the six is refused the same
way: the room falls back to opus, and the pane tells you that too.

## photographs and likeness

Photo-reading is built inside the Apple Vision, which means no tokens will be consumed.

Photographs are also read here for the words printed in them, any faces, and where they were taken.

When it guesses which animal photographs go together, it will sometimes set aside pictures of a different animal. You will not be told when that happens.

## when nothing can answer yet

the librarian needs something to answer with: a key you gave the room, or
a model running on your own machine. until there is one, the room waits
with a calm, plain line, never an error, never a paywall:

- nothing to answer with at all → "nothing can answer yet. run python3
  server.py --setup to add a key, or start a model on your own machine."
- your own machine is the answerer but nothing is listening → start
  ollama. the room looks again on its own, so it is picked up without a
  restart.
- ollama is listening but the model it needs was never pulled → pull it;
  the same applies, and the room says which of the two it is rather than
  guessing.
- a key a provider explicitly rejected → the room says so, and ONLY an
  explicit rejection ever changes what it believes about your key. a
  busy provider, an unwell one, or no network at all never does; you
  are not sent hunting for a good key because a server was busy.
- the switch off (in manage, under "the librarian") → off means not one
  librarian word renders in the room; the manage area itself still opens
  so you can turn it back on whenever you want it.
- a run that fails midway → one plain sentence, and everything already
  sorted stays saved. the librarian's memory is plain files in the
  visible `librarian/` folder inside your library; read them, edit
  them, or delete them anytime. two of those files are
  new. `librarian/identity.md` is the page of what the room has noticed
  about you, above. `librarian/reflections.json` is the short ledger of
  reflections it has already written (the titles it has used and the
  shape each one opened with), kept so it can tell when it is repeating
  itself; its own header says "derived, not authored. one record per
  draft that landed, passed drafts as well as saved ones, because a
  title you saw twice is a repeat either way. safe to edit or delete;
  it starts over." both of those write themselves again from your own
  library, so deleting either one costs you nothing.
- **deleting the whole folder is not free, and it used to say it was.**
  this page told you that deleting `librarian/` was a factory reset for
  the librarian and "touches nothing else". that stopped being true when
  the tidy-up learned to change the words inside a note: the copies that
  let you take a tidy-up back live in this folder, so deleting it throws
  away every way back you still have. it also holds the room's record of
  what you have blessed, allowed and dismissed: your own answers, not
  guesses it can make again. most of what you have blessed is written on
  the things themselves and survives, but not all of it, and nothing
  else here comes back. the folder is still yours to delete: the room
  only owes you the honest version of what it costs.

## if something looks off

the room speaks about this in plain lines. these are the two you are
most likely to meet:

- "nothing can answer yet. run python3 server.py --setup to add a key,
  or start a model on your own machine." Do either one; the room looks
  again on its own, without a restart.
- "the librarian couldn't reach the model just now. nothing was lost."
