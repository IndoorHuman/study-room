# `tests/fixtures/screenshot_notes/` — the screenshot-to-note fixtures (26.94-05)

Three JSON files feeding `tests/test_screenshot_notes.py`. **Everything here is
synthetic.** No item id, no image, no feature-print byte and no OCR text from the
owner's real library is committed under `tests/` — the standing prohibition, and
the reason the one named regression case below is reproduced at its *measured
coordinates* rather than by copying the two photographs it came from.

| File | Feeds | What it holds |
|---|---|---|
| `library.json` | V12, V13, V18 | a small synthetic library: one photograph per fence class, one burst, one sub-30-character screenshot, one camera-model photograph at screenshot dimensions (the test-1 miss that test 2 rescues), and one non-screenshot carrying the `screenshots` tag today (the false positive the pass must remove) |
| `clean_cases.json` | V16, V17 | chrome-stripping cases, the fail-closed shapes, and the two named encoding cases — 30 Chinese characters, and a decomposed string whose code-point count changes under NFC |
| `burst_cases.json` | V14, V15 | the named WRNS/BccI regression coordinates and its control, as **numbers** — a gap in milliseconds and a cosine — plus the boundary coordinates |

## Why coordinates and not photographs

`group_bursts` consumes exactly two numbers per consecutive pair: the gap in
milliseconds and the cosine of the two feature prints. So a synthetic pair
constructed at the *measured* coordinates exercises exactly the shipped code path
with exactly the measured inputs, and nothing of hers has to be committed to do
it. The real pair is named in `burst_cases.json` (`#40`: `WRNS Studio` then
`BccI Construction`, 27 s apart at cosine 0.872) so a future reader can find the
provenance; the vectors that reproduce that cosine are built in the suite.

## Image bytes are BUILT, never stored

`library.json` records a *recipe* per photograph — format, width, height, and an
optional camera model — and the suite builds the header bytes from it. Two
reasons: a committed `.png`/`.jpeg` under `tests/` is a binary nobody can read in
a diff, and a recipe makes the thing the test is actually about (the exact
dimension table, the presence or absence of a TIFF `Model`) legible at the site.

## ⚠ A5, recorded and not discharged

No precision or recall figure exists for the burst rule and none can be produced
from existing data — the 247 groups in `#40` are a rule's OUTPUT, not labels, so
validating against them is circular. Nothing in these fixtures claims one.
