---
status: accepted
---

# `Journal` stays on the default fence roster

`DEFAULT_FENCED_ROSTER` (`study_lib.py`) seeds the fence with `Journal`, and the
shipped demo vault — the Katherine Mansfield vault — has a top-level `Journal/`
holding its 206 public-domain diary entries. So **on a default import the
librarian cannot read the richest content in the demo data**, which reads at
first glance like a packaging mistake: the diary is the reason Mansfield was
chosen over Woolf in the first place. **It is deliberate.** The room declining to
read the diary until the user allows it — and the user then saying *let the
librarian read this* — is the launch demo's central beat, the one place where
law 1 and the hard fence are visible in a single unbroken take rather than
described in a README.

**Do not remove `Journal` from the roster to "unlock" the demo vault**, and do
not special-case the demo vault around the fence.

## The one exception: the public demo page's own copy

Added 2026-08-26 on the owner's ruling, resolving the fence ticket on the
private planning tracker (`docs/agents/issue-tracker.md` names where that
lives; the tracker's repo name is a deny pattern, so this paragraph describes
the link instead of being it). The public Mansfield page shows her diary
days and the reflections made from them, and **a fenced folder is absent
entirely from every librarian payload** — so those reflections cannot exist
until the diary is let through.

**The exception is a SEPARATE, PRIVATE COPY of the vault, released once, used
only to build that page.** The vault that SHIPS keeps refusing `Journal`, so
the beat above survives for the film and for everyone who installs the room.

⛔ **Do not reconcile the two.** Finding a released Mansfield library on the
build machine is not evidence that this ADR was abandoned, and it is not a
licence to drop `Journal` from the shipped roster. Equally, this ADR is not a
licence to un-release the page's copy. The beat was silently deleted once
before (wave 39, ten hours after the ruling that created it); a future wave
that "tidies" either side re-does that.

⚠️ Two mechanics that make the separate copy necessary rather than merely
tidy: `remove_roster_folder` is **future-only** — it does not release items
already imported, which is a per-item release through the person's own tap —
and `refresh_item` **ratchets `trigger` upward only**. So the release must
happen on the import screen before the copy is read, and once released the
copy stays released. A single library cannot be released for the page and
restored to fenced for shipping.

## Considered options

- **Leave it fenced with no path out** — rejected: the librarian then reflects
  only on letters and stories, the weakest material in the corpus, and the fence
  is demonstrated by absence, which reads as a missing feature.
- **Ship the demo vault with `Journal` pre-removed from its roster** — rejected:
  it buys a stronger librarian demo by throwing away the demonstration that makes
  the product unusual.
- **Make the fence the arc** (chosen) — import → the room states it has not read
  the Journal → the user un-fences it in plain words → *then* the librarian
  reflects. Buildable on shipped surfaces: the `route-roster` ask already carries
  the label *let the librarian read this*.

## Consequences

- The other three seeded roster entries — `personnel notes`, `billing & insurance notes`,
  `appraisal record` — are the **owner's own folder names** and are being
  replaced, because every stranger is shown them on the import screen. **That
  replacement must keep `Journal`**: it is the only seeded entry the demo vault
  trips, so dropping it silently deletes the beat described above.
- The roster is duplicated on the client (`REFLECTION_FENCED_ROSTER` and
  `VAULT_DEFAULT_ROSTER` in `app.js`) and pinned in sync by
  `test_reflection_verbatim`. Any change is a three-site change.
- A user whose own vault has a `Journal/` folder gets the same behaviour, which
  is the intended default — the Phase-15 Wizard-of-Oz finding was that the run
  actively declined the rawest writing.
