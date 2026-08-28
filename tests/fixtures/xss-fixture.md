# XSS Fixture (manual UAT only)

This note is **only** opened by hand during the reader XSS UAT (SRM-03). It is not
library content and must never be served as a real item. It carries the two canonical
stored-XSS vectors for imported markdown plus a line of benign markdown so the
inert rendering is visibly correct.

Expected result when opened in the reader: **no alert dialog fires**, the payloads
below appear as inert text (or are stripped), and the benign markdown still renders
styled — a styled render proves the escaped-`<pre>` fallback did not silently engage
(RESEARCH Pitfall 8).

## Payload 1 — script injection

<script>alert('xss-script-payload')</script>

## Payload 2 — image onerror injection

<img src=x onerror="alert('xss-onerror-payload')">

## Benign markdown (must still render)

- A normal **bold** list item
- A [normal link](https://example.com)

> A normal blockquote — if you can read this rendered nicely and saw no alert, the seam works.
