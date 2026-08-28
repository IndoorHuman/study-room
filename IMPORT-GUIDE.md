# bringing your things in — the import guide

the study room has one promise about setup: **no coding, no paid key,
ever.** the built-in one-click import is the whole product. everything
under the "power path" heading below is an optional gift for people who
already use a coding agent — never a requirement, never the "real" way.

## the one-click default (for everyone)

1. start the room and open the import screen.
2. point it at any of these, then press "Look inside" and "Bring them in":
   - **a plain folder** of notes and photos (`.md`, `.txt`, `.png`,
     `.jpg`, `.gif`, `.webp`) — attached pictures travel with their
     notes.
   - **a ChatGPT export** — the unzipped export folder containing
     `conversations.json`. each conversation becomes one note, verbatim.
   - **a Claude export** — the unzipped claude.ai data-export folder
     containing `conversations.json`. same treatment.
   - **an Obsidian vault** — the vault folder itself. your vault is
     never changed; the room keeps its own copies.
3. big imports show a plain count and an honest estimate while a
   server-side worker does the copying. you can close the tab; the room
   will be ready when you come back.

that's it. this path is complete: no coding, no paid key, nothing else
to install. the room detects what you pointed it at and does the rest.

## the power path (optional — never required)

if you already use Claude Code (or any coding agent), you can feed the
room from sources it has no adapter for yet — browser bookmarks, another
app's export, an old backup. the recipe is always the same: ask the
agent to convert the exotic thing into a plain folder of markdown, text,
and images, then one-click import that folder like anything else.

a worked example prompt:

> read the bookmarks export at ~/Downloads/bookmarks.html and write each
> bookmark as its own markdown file in ~/room-import/ — the title as the
> first heading, the url and any saved note underneath, nothing else
> changed.

then point the room's import at `~/room-import/`. the room neither
knows nor cares that an agent prepared the folder — and if you never do
this, you are not missing anything: the power path adds sources, never
features.

## honest footnotes

- **re-importing a grown export.** your AI chats are recognized by their
  content — not by where they sit, the way your own notes are (see
  renaming a note, below). if you export them again months later and
  re-import, conversations that haven't changed are recognized as
  already here and skipped; conversations that grew — and brand-new
  ones — come in as new items, while the older snapshots stay too. if
  the older copies bother you, the manage view is the place to tidy
  them.
- **renaming a note.** the room knows a note by where it lives, and by
  its name if you move it. so moving a note to another folder keeps
  everything you have said about it, and so does renaming it while
  leaving the words alone. but if both change between two imports — a
  new name *and* edited words — the room cannot tell it is the same
  note: it arrives as a second, new one, unread. the original stays as
  it was, so nothing you said is lost; but if you had hidden the
  original by hand, the new copy is not hidden, and the manage view is
  where to hide it too. a folder you keep private is not affected —
  anything inside one stays private however it is named.
- **very large exports.** an enormous `conversations.json` may be
  refused with a plain size message. split the JSON into smaller pieces
  and bring each piece in — the content dedup above means overlap
  between pieces is harmless.
- **your sources are never changed.** every path here copies. nothing in
  a source folder is ever edited, moved, or deleted.
