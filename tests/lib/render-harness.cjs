'use strict';
/* =========================================================================
   26.91-01 — THE PAGE THE CDP DRIVER MEASURES.

   THE WHOLE POINT IS THAT IT MEASURES THE SHIPPED STYLESHEET. This module
   reads the LITERAL BYTES of `tokens.css` and inlines them in a <style>
   element. It never re-types a rule and never keeps a copy. A harness that
   restated the rule it is checking would be the harness agreeing with itself
   — which is the same failure as a source grep, one layer down.

   THE FONT IS BASE64-INLINED. `assets/fonts/PixelifySans-Regular.woff2` is
   read and emitted as a `data:font/woff2;base64,...` @font-face for the
   family `Pixelify Sans`. That dodges the file:// font-origin question
   entirely, which is why the driver needs none of
   `--allow-file-access-from-files`, `--disable-web-security` or `--no-sandbox`
   (threat T-26.91-05). The data-URI @font-face is emitted AFTER the tokens
   bytes ON PURPOSE: tokens.css declares the same family from a relative URL
   that does not resolve out of a temp dir, and for equal family+weight the
   LAST @font-face wins.

   NOTHING HERE READS OR WRITES THE OWNER'S LIBRARY. The only two files read
   are `tokens.css` and the vendored font, both resolved relative to this
   file. The only file written is the harness page, inside a fresh
   `os.tmpdir()/gsd-2691-*` directory the caller removes.
   ========================================================================= */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TOKENS_CSS = path.join(REPO_ROOT, 'tokens.css');
const FONT_WOFF2 = path.join(REPO_ROOT, 'assets', 'fonts',
  'PixelifySans-Regular.woff2');

/* THE `--k` SWEEP, PINNED BY VALUE. Not a range, not a computed list: a
   literal array the suite asserts the length of BEFORE it measures anything,
   so a silently shortened sweep is a failure rather than a shorter pass. */
const KS = [1, 2, 3, 4, 5];

function buildHarness(opts) {
  opts = opts || {};
  const bodyHtml = opts.bodyHtml;
  const k = opts.k;

  if (typeof bodyHtml !== 'string' || bodyHtml.length === 0) {
    throw new Error('buildHarness: bodyHtml must be a non-empty string.');
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new Error('buildHarness: k must be a positive integer, got ' +
      JSON.stringify(k) + '.');
  }
  if (!fs.existsSync(TOKENS_CSS)) {
    throw new Error('buildHarness: the shipped stylesheet is missing at ' +
      TOKENS_CSS + '.');
  }
  if (!fs.existsSync(FONT_WOFF2)) {
    throw new Error('buildHarness: the vendored pixel font is missing at ' +
      FONT_WOFF2 + '.');
  }

  const css = fs.readFileSync(TOKENS_CSS, 'utf8');
  const font = fs.readFileSync(FONT_WOFF2).toString('base64');

  /* a per-page token the driver polls for, so "the page finished loading" is
     a fact read off the page rather than a sleep. */
  const token = crypto.randomBytes(8).toString('hex');

  const html =
    '<!doctype html>\n' +
    '<html data-harness="' + token + '"><head><meta charset="utf-8">\n' +
    '<title>26.91 render harness</title>\n' +
    '<style>\n' + css + '\n</style>\n' +
    '<style>\n@font-face{font-family:"Pixelify Sans";' +
    'src:url("data:font/woff2;base64,' + font + '") format("woff2");' +
    'font-weight:400;font-style:normal;font-display:block;}\n</style>\n' +
    '</head>\n<body>\n' +
    '<div class="station-scene" id="harness-scene" style="--k:' + k + '">\n' +
    bodyHtml + '\n</div>\n</body></html>\n';

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-2691-'));
  const file = path.join(dir, 'harness.html');
  fs.writeFileSync(file, html, 'utf8');

  return {
    url: 'file://' + file,
    dir: dir,
    token: token,
    k: k
  };
}

module.exports = { buildHarness: buildHarness, KS: KS };
