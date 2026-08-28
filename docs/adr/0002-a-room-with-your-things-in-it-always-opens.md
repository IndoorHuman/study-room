---
status: accepted
---

# A room with your things in it always opens

Law 7 says *"the Study Room REQUIRES AI … There is NO no-AI build and NO
fail-open fallback, not even for the demo."* Read literally, that means the room
refuses to open whenever no librarian can be reached. **It does not.** A room
that already holds an archive **always opens**, says plainly that the librarian
is asleep, and names the one command that wakes it. Only a room with **nothing in
it yet** is ever stopped.

This looks like a violation and is not one. **Law 7 forbids *building* a no-AI
product — it is not a lock on someone's own archive.** The amendment was written
in 2026-07-21 against a real temptation: shipping a degraded "AI off" build as
the safe demo, with the librarian as an optional upgrade. It was never aimed at
the case below.

The case that decided it: an Ollama-only room, a Mac reboot, and Ollama does not
start on boot. Under a literal reading the app refuses to open with **16,559 of
her own things inside it** — because a background program didn't start. That is
not a hypothetical; it is the ordinary Tuesday version of this failure. Refusing
there is exactly the friction that loses a fragile user, on the day she most
needs the room. *Loveable over complete* is a standing motto and it applies
hardest here.

**Do not "fix" this by making the app refuse whenever no librarian is reachable,
and do not read law 7 as licence to.** The honest test is *what does opening
actually give her*: for a fresh install, an empty room — so stopping with
instructions is strictly more useful. For an established room, her own things
back.

Decided 2026-08-12 on the planning tracker, ticket 35 — *what does the front
door check, now that it checks for a working librarian?* — which holds the full
reasoning and the approved copy for every state.

## Considered options

- **Always stop** — rejected: one clean rule, and it almost never fires (a
  detected-but-dead key still reads as present, so zero providers means she has
  no key file, no environment variable *and* no Ollama). But "almost never" is
  doing the work there, and the reboot case above is precisely when it does
  fire.
- **Never stop** — rejected: a fresh install would open an empty room with no
  librarian, which is the no-AI build law 7 exists to forbid, and it gives a
  stranger nothing to look at while teaching them nothing.
- **Stop only a room with nothing in it yet** (chosen) — the rule follows from
  what opening actually gives the person, not from a count of providers.

## Consequences

- The stop is **not** a general availability gate. Per-job refusals are separate
  and stay: a job whose pinned tier has no filler refuses **by name** when it
  runs, and the room never silently substitutes another tier.
- `librarian_enabled` **keeps its switch but flips its default to on**. Its
  docstring today calls the absent-flag state "the byte-identical no-AI room" —
  a flag defaulting to the one state the product says does not exist is a bug
  regardless of this ADR.
- The room's start-up line must be able to say *"librarian: asleep"* as a
  first-class state, not as an error. The approved wording is on ticket 35.
- This is the second deliberate narrowing of law 7's 2026-07-21 amendment, after
  the front-door change from *"an Anthropic key"* to *"a working librarian"*.
  Both narrow **what counts as having AI**; neither reintroduces a no-AI build.
