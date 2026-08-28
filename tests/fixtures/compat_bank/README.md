# Compat bank fixtures (Wave 0 — Phase 26.9996)

Throwaway demos only.

These sample trees exist so the release-time both-direction compat check
(map #144 / UPD-06) can run against known, disposable shapes from past
released dates. They are never her live library.

Rules:

- Never point fixtures at `~/StudyRoom` or any real library path.
- Never import or copy a live key (`keys.json`, Anthropic credentials, etc.).
- Never copy personal notes, photos, or vault content into this bank.
- Samples are synthetic / hand-built for the check; treat them as disposable.

Release-time tooling may also use `tools/compat_bank/` (plan 04). This
`tests/fixtures/compat_bank/` tree is the Wave 0 home for the README and any
suite-local samples.
