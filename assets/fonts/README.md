# assets/fonts — the vendored pixel display face

- **font:** pixelify sans — static latin subset, regular (400) + bold (700)
- **files:** `PixelifySans-Regular.woff2`, `PixelifySans-Bold.woff2`
- **license:** SIL Open Font License 1.1 — the full text is in `OFL.txt` in this
  folder. `OFL.txt` must ALWAYS accompany the woff2 files; if the binaries move,
  the license moves with them.
- **upstream:** github.com/eifetx/Pixelify-Sans (the Pixelify Sans Project
  Authors; also distributed via google fonts and fontsource)
- **acquired from:** google-webfonts-helper
  (gwfh.mranftl.com/fonts/pixelify-sans?subsets=latin), downloaded 2026-07-18

the font is served locally because the app must run fully offline — no CDN, no
network font reference anywhere in the repo. `tokens.css` declares the
@font-face with `font-display: swap` and a `var(--font-serif)` fallback chain,
so on load the Georgia serif shows first and a failed font load simply leaves
the existing serif look — never a blank.
