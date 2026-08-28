'use strict';
/* =========================================================================
   26.91-12 — THE FIVE-CHANNEL LEAK SCAN, AS A CHECKED-IN INSTRUMENT.

   WHY THIS FILE EXISTS. At the 2026-08-07 owner UAT (beat 8) the law-5 leak
   scan was an expression retyped into a browser console. It was ARMED FIRST
   on a planted leak and fired on all five channels — 12 hits — so it was
   proven able to go red before it was trusted, and the clean rescan then
   found no fenced term on any live surface. But THREE of the markup hits
   were SUBSTRING FALSE POSITIVES:

     • two `Memoir` hits were ONE reflection spine whose `aria-label` is a
       FILENAME CONTAINING `Memoirs` — a Claude-authored reflection on the
       reflections shelf, not the fenced `Memoir/` folder;
     • one bare `record` hit was carried by no element attribute and appeared
       in no visible text.

   AN INSTRUMENT THAT FIRES ON FALSE POSITIVES IS THE MIRROR IMAGE OF ONE
   THAT CANNOT FIRE AT ALL, and both are this project's named defect class.
   The finding was a PRECISION defect, not a miss. The fix is therefore NOT
   a narrowing — the five channels are unchanged and the roster is WIDER than
   the law-5 one, not smaller.

   THE FIX IS A UNION OF TWO RULES.

     (1) WORD-BOUNDARY over prose. A roster term matches only when neither
         the character before nor the character after is in [A-Za-z0-9_].
         This catches a fenced folder NAMED in a sentence.
     (2) PATH-SEGMENT over path-shaped strings. The string is split on `/`
         and a segment must EQUAL a roster term exactly, case-sensitively.
         This catches a real directory name and REFUSES a filename that
         merely contains one — precisely the `Memoirs` case.

   NEVER THE INTERSECTION, AND NEVER EITHER RULE ALONE. A prose leak has no
   path segments; a path leak may sit inside a longer filename. Each rule
   alone loses one of the two kinds of leak, which is why the mutation that
   proves this design is replacing the union with the intersection and
   watching the prose leak walk through (driven in tests/test_leak_scan.cjs).

   IT MIRRORS THE SHIPPED FENCE'S KEY RATHER THAN INVENTING A SECOND ONE.
   `study_lib.py` stamps `item["folder"]` as `Path(origin_path).parent.name`
   (the IMMEDIATE parent directory name, :349) and `_origin_under_roster`
   compares the FIRST vault-relative path segment against each roster
   entry's first segment (:1559-1586, read in the body — a docstring is not
   a control). Path-segment EQUALITY is that same shape, which is the whole
   reason a filename containing a roster term is not a fence hit.

   COLLECTION AND MATCHING ARE SEPARATE ON PURPOSE. `SCAN_EXPR` returns a
   SNAPSHOT; `findFencedHits` is a pure function of (snapshot, roster). So a
   snapshot can be saved, re-scanned against a different roster, and DIFFED
   between runs — and the matcher can be unit-tested with no browser at all.
   A collector that also decided would make every scan unauditable.

   THIS FILE LIVES IN tests/lib/, NOT tests/. The node sweep glob is
   `tests/*.cjs` and a library is not a suite; `test_live_render.cjs` asserts
   that boundary by value. This file therefore does NOT move the sweep total.
   Only `tests/test_leak_scan.cjs` does.

   EVERY FAILURE PATH THROWS WITH A NAMED REASON. Nothing here returns a null
   result, degrades to a no-op, or reports success on an absent input. An
   empty page must never be mistakable for a clean page, which is why the
   snapshot carries its own node COUNT and the suite asserts it non-zero in
   the same run as every zero-hit assertion.

   ZERO DEPENDENCIES. No require at all in this file. No package.json, no
   node_modules (law 8).

   ---------------------------------------------------------------------
   A MEASURED COST, STATED RATHER THAN CAPPED.
   The `innerHTML` channel means the snapshot is O(depth x page bytes): a
   leak inside <body> is also inside <html>. Capping it would be a NARROWING
   of a channel the 2026-08-07 finding explicitly did not implicate, so it is
   not capped; instead the snapshot reports `bytes` so the cost is measured
   and visible rather than hidden. If a future page makes the payload
   unworkable, that is an OWNER decision about the channel set, not a quiet
   edit here.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   THE ROSTER.

   BOTH lists, merged. The law-5 fenced roster is the P0 fence
   (`tests/test_display_fence.cjs` FENCED_ROSTER, and `DEFAULT_FENCED_ROSTER`
   in study_lib.py). The trace-scoped never-name entries are an OWNER POLICY:
   D-10 (2026-08-06) rules that `processed jd` is NEVER SPOKEN on a surface
   even though the law-5 fence permits it — it holds nothing fenced, so a
   scanner checking only the law-5 roster would report a surface CLEAN while
   speaking a term she ruled must never be spoken.

   `TRACE_NEVER_NAME`'s third rule, /^studyroom-collect-/, is a REGEX and not
   a term; it is out of this roster's shape by construction, not dropped by
   preference. Its two string literals are both here.

   ⚠ `items` IS A MEASURED NOISE SOURCE AND IS KEPT ANYWAY. Under the
   word-boundary rule it matches inside `align-items` (the hyphen is not a
   word character on either side). Measured 2026-08-08: the shipped
   `tokens.css` carries 15 word-boundary occurrences of `items`, 13 of them
   `align-items`. On the REAL app page those bytes never enter the DOM —
   `index.html:7` loads the stylesheet with <link rel="stylesheet">, so no
   element's text or attributes carry them — but any page that INLINES the
   stylesheet will light this term up. That property is DRIVEN as a named
   fixture in the suite rather than left to be rediscovered at a UAT.
   NARROWING `items` TO THE PATH RULE ALONE WOULD MAKE THE SCAN QUIETER, AND
   THAT IS AN OWNER DECISION, NOT A TIDY-UP. Routed to deferred-items.md.
   --------------------------------------------------------------------------- */
const LAW5_FENCED_ROSTER = Object.freeze([
  'Memoir',
  'personnel notes',
  'billing & insurance notes',
  'appraisal record'
]);

const TRACE_NEVER_NAME_TERMS = Object.freeze([
  'processed jd',
  'items'
]);

const SCAN_ROSTER = Object.freeze(
  LAW5_FENCED_ROSTER.concat(TRACE_NEVER_NAME_TERMS));

/* ---------------------------------------------------------------------------
   26.91-42 — THE DERIVED UNION. WHY THIS EXISTS, AND WHY IT IS NOT A LIST.

   THE DEFECT IT REPAIRS. `LAW5_FENCED_ROSTER` above holds four INVENTED
   EXAMPLE names. It did not always: until 26.91-39 it held the owner's four
   REAL folder names, and that plan correctly moved them out of the source and
   into her own settings. But this file is the instrument whose entire job is
   finding her REAL folder names on a surface, and its expectations moved with
   the source. DRIVEN, NOT ARGUED: a planted real folder name scored 0 hits
   under `SCAN_ROSTER` and 5 under the union of `SCAN_ROSTER` and her stored
   list. NOTHING LEAKED — session 7 scanned her room with the union and it came
   back clean, with the scan proven able to fire first. THE GUARD WAS ASLEEP,
   NOT BREACHED, and those are different claims.

   WHY A SECOND HARD-CODED LIST WAS REFUSED. A second list is the defect with
   an extra copy: the next rename of the shipped examples blinds it again,
   exactly as this one did. The union is therefore a PURE FUNCTION of (shipped
   roster, store), so a rename here CANNOT narrow what the guard sees.

   THE PRECEDENT IS ALREADY IN THIS CODEBASE AND IS CITED RATHER THAN INVENTED.
   `study_lib.py:3785-3789` derives the institutional half of the reflection
   tripwire at RUNTIME from `_active_roster(store)`, with the comment naming
   why it is never shipped as source.

   BUT THIS IS A CHECKER, NOT A FENCE, AND IT MUST NOT COPY THE FENCE'S
   EMPTY-LIST SEMANTICS. `_active_roster` (`study_lib.py:1604-1615`) treats a
   present-but-EMPTY `fenced_roster` as a deliberate CLEAR and returns []. That
   is right for a fence, which acts on what it is told to hide. It is WRONG
   here: a checker may never be made blinder by a value in her store. So an
   empty stored list yields the SHIPPED ROSTER, never nothing. That single
   asymmetry is where copying the fence's logic would put the whole defect back
   through the front door, so it is driven as its own named case in the suite.

   AN ABSENT STORE THROWS. IT DOES NOT FALL BACK. This file's stated law is
   that an absent roster is refused, never treated as an empty one (see
   `findFencedHits` below) — silently scanning for nothing is the purest form
   of a gate that cannot fail. A union that returned the shipped roster when the
   store failed to load would be that same gate wearing this function's hat: a
   caller whose store read failed would scan blind and report CLEAN. The store
   argument is therefore REQUIRED. A caller that genuinely wants
   shipped-examples-only must say so by using `SCAN_ROSTER` deliberately.

   PROVENANCE IS PART OF THE RETURN, NOT A COURTESY OF THE CALLER. The durable
   property bought here is not the union itself — it is that every scan report
   can carry the roster it ACTUALLY used, term by term, with where each term
   came from. A future session cannot be silently blind if the scan prints what
   it was looking for.

   ⚠ THE UNION IS NOISIER AND THE NOISE IS NOT A LICENCE TO NARROW. One stored
   term is an ordinary English word and under the word-boundary rule it fires on
   ordinary phrases. That is the `items` situation one level out, and it gets the
   `items` treatment: measured, named, driven as a fixture, and routed to the
   owner as a decision. NO TERM IS EVER DROPPED FROM THE UNION.

   HER REAL FOLDER NAMES APPEAR NOWHERE IN THIS FILE. They are read from her
   store at runtime and used from there.
   --------------------------------------------------------------------------- */

const STORE_ROSTER_KEY = 'fenced_roster';

/* Where a union term came from. `both` means the term is in the shipped
   examples AND in her settings — recorded rather than collapsed, because a
   report that cannot say which is which cannot be audited. */
const PROVENANCE = Object.freeze(['shipped-example', 'from-her-settings', 'both']);

/* deriveScanRoster(shippedRoster, store) -> { terms, provenance, counts }

   `terms` is a plain array of strings, ready to hand straight to
   findFencedHits. `provenance` is a parallel array of
   { term, origin } with `origin` one of PROVENANCE. `counts` reports how many
   terms came from each side, so a report can state its own shape.

   ORDER IS STABLE AND IS SHIPPED-FIRST: every shipped term in its own order,
   then every stored term not already present, in her stored order. Two runs
   over the same inputs produce byte-identical output. */
function deriveScanRoster(shippedRoster, store) {
  if (!Array.isArray(shippedRoster)) {
    throw new Error('deriveScanRoster: shippedRoster must be an array of ' +
      'strings; got ' + Object.prototype.toString.call(shippedRoster) + '.');
  }
  for (let i = 0; i < shippedRoster.length; i++) {
    if (typeof shippedRoster[i] !== 'string') {
      throw new Error('deriveScanRoster: shippedRoster[' + i + '] is not a ' +
        'string (' + Object.prototype.toString.call(shippedRoster[i]) + ').');
    }
  }

  if (store === null || typeof store !== 'object' || Array.isArray(store)) {
    throw new Error('deriveScanRoster: the store argument is REQUIRED and ' +
      'must be the parsed store object; got ' +
      Object.prototype.toString.call(store) + '. It does NOT fall back to the ' +
      'shipped roster: a caller whose store read failed would then scan blind ' +
      'and report a surface CLEAN that it never checked against her real ' +
      'list. A caller that genuinely wants shipped-examples-only must say so ' +
      'by passing SCAN_ROSTER to findFencedHits directly.');
  }

  const meta = store.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('deriveScanRoster: store.meta must be an object carrying ' +
      'a `' + STORE_ROSTER_KEY + '` array; got ' +
      Object.prototype.toString.call(meta) + '. An absent roster is REFUSED, ' +
      'never treated as an empty one.');
  }

  const stored = meta[STORE_ROSTER_KEY];
  if (!Array.isArray(stored)) {
    throw new Error('deriveScanRoster: store.meta.' + STORE_ROSTER_KEY +
      ' must be an array of strings; got ' +
      Object.prototype.toString.call(stored) + '. An absent or malformed ' +
      'roster is REFUSED, never treated as an empty one — silently scanning ' +
      'for nothing is the purest form of a gate that cannot fail.');
  }
  for (let i = 0; i < stored.length; i++) {
    if (typeof stored[i] !== 'string') {
      throw new Error('deriveScanRoster: store.meta.' + STORE_ROSTER_KEY +
        '[' + i + '] is not a string (' +
        Object.prototype.toString.call(stored[i]) + '). A non-string roster ' +
        'entry has no word-boundary or path-segment meaning here and must ' +
        'not be silently ignored.');
    }
  }

  /* A PRESENT-BUT-EMPTY STORED LIST WIDENS TO THE SHIPPED ROSTER AND NEVER TO
     NOTHING. This is the one place the fence's semantics must NOT be copied.
     No early return is needed — the loops below already produce exactly that —
     but the property is named here because it is the whole reason this
     function is not `_active_roster`. */

  const terms = [];
  const provenance = [];
  const indexOfTerm = Object.create(null);
  let fromShipped = 0;
  let fromStore = 0;
  let fromBoth = 0;

  for (let i = 0; i < shippedRoster.length; i++) {
    const term = shippedRoster[i];
    if (Object.prototype.hasOwnProperty.call(indexOfTerm, term)) continue;
    indexOfTerm[term] = terms.length;
    terms.push(term);
    provenance.push({ term: term, origin: 'shipped-example' });
    fromShipped++;
  }

  for (let i = 0; i < stored.length; i++) {
    const term = stored[i];
    if (Object.prototype.hasOwnProperty.call(indexOfTerm, term)) {
      const at = indexOfTerm[term];
      if (provenance[at].origin === 'shipped-example') {
        provenance[at] = { term: term, origin: 'both' };
        fromShipped--;
        fromBoth++;
      }
      continue;
    }
    indexOfTerm[term] = terms.length;
    terms.push(term);
    provenance.push({ term: term, origin: 'from-her-settings' });
    fromStore++;
  }

  return {
    terms: terms,
    provenance: provenance,
    counts: {
      total: terms.length,
      shippedOnly: fromShipped,
      storeOnly: fromStore,
      both: fromBoth,
      storedRosterLength: stored.length
    }
  };
}

/* formatRosterReport(derived, opts) -> string

   A SCAN THAT DOES NOT PRINT ITS ROSTER IS NOT EVIDENCE. This renders the
   roster a scan actually used, term by term, with provenance.

   `opts.redact` (default false) replaces each `from-her-settings` / `both`
   term with a positional placeholder, so a report can be pasted into a record
   that must never carry her real folder names while still proving the guard
   was looking for them. The COUNTS are never redacted — a redacted report that
   also hid its shape would be no evidence at all. */
function formatRosterReport(derived, opts) {
  if (derived === null || typeof derived !== 'object' ||
      !Array.isArray(derived.provenance)) {
    throw new Error('formatRosterReport: expected the object returned by ' +
      'deriveScanRoster; got ' +
      Object.prototype.toString.call(derived) + '.');
  }
  const redact = !!(opts && opts.redact);
  const lines = [];
  lines.push('roster actually scanned: ' + derived.provenance.length +
    ' terms (shipped-only ' + derived.counts.shippedOnly +
    ', from-her-settings ' + derived.counts.storeOnly +
    ', both ' + derived.counts.both + ')');
  for (let i = 0; i < derived.provenance.length; i++) {
    const p = derived.provenance[i];
    const hidden = redact && p.origin !== 'shipped-example';
    const shown = hidden ?
      '<REDACTED stored term #' + (i + 1) + '>' : p.term;
    lines.push('  [' + p.origin + '] ' + shown);
  }
  return lines.join('\n');
}

/* THE FIVE CHANNELS, PINNED BY VALUE AND IN ORDER. The order is part of the
   stable hit ordering below. Narrowing this list to make a scan quiet is
   forbidden: the 2026-08-07 finding was that the scan fired too BROADLY, not
   that it fired in the wrong places. */
const CHANNELS = Object.freeze([
  'textContent',
  'innerHTML',
  'aria-label',
  'title',
  'data-*'
]);

/* The two rules, in their tie-break order. */
const RULES = Object.freeze(['word', 'segment']);

/* How much of the surrounding string a hit carries. A hit that reports a
   count without saying which rule fired and what it fired on cannot be
   audited. */
const CONTEXT_RADIUS = 40;

/* ---------------------------------------------------------------------------
   SCAN_EXPR — the page-side collection expression.

   Returns { count, bytes, nodes: [ { path, text, innerHTML, ariaLabel,
   title, data } ] }.

   `text` is the element's OWN direct text nodes only, NOT its descendants'.
   That is deliberate: with descendants included, one leak would be reported
   once per ancestor and the hit list would say more about tree depth than
   about the leak. Every descendant is itself in the snapshot, so nothing is
   lost.
   --------------------------------------------------------------------------- */
const SCAN_EXPR = [
  '(function () {',
  '  function pathOf(el) {',
  '    var parts = [];',
  '    var cur = el;',
  '    while (cur && cur.nodeType === 1) {',
  '      var name = cur.tagName.toLowerCase();',
  '      var p = cur.parentElement;',
  '      if (p) {',
  '        var n = 0, idx = 0;',
  '        for (var i = 0; i < p.children.length; i++) {',
  '          if (p.children[i].tagName === cur.tagName) {',
  '            n++;',
  '            if (p.children[i] === cur) idx = n;',
  '          }',
  '        }',
  '        name += "[" + idx + "]";',
  '      }',
  '      parts.unshift(name);',
  '      cur = p;',
  '    }',
  '    return parts.join(">");',
  '  }',
  '  var els = document.querySelectorAll("*");',
  '  var nodes = [];',
  '  var bytes = 0;',
  '  for (var i = 0; i < els.length; i++) {',
  '    var el = els[i];',
  '    var own = "";',
  '    for (var j = 0; j < el.childNodes.length; j++) {',
  '      var cn = el.childNodes[j];',
  '      if (cn.nodeType === 3) own += cn.nodeValue;',
  '    }',
  '    var data = {};',
  '    var attrs = el.attributes;',
  '    for (var a = 0; a < attrs.length; a++) {',
  '      var nm = attrs[a].name;',
  '      if (nm.indexOf("data-") === 0) data[nm] = attrs[a].value;',
  '    }',
  '    var rec = {',
  '      path: pathOf(el),',
  '      text: own,',
  '      innerHTML: el.innerHTML,',
  '      ariaLabel: el.getAttribute("aria-label") || "",',
  '      title: el.getAttribute("title") || "",',
  '      data: data',
  '    };',
  '    bytes += rec.text.length + rec.innerHTML.length +',
  '             rec.ariaLabel.length + rec.title.length;',
  '    for (var dk in data) { bytes += dk.length + data[dk].length; }',
  '    nodes.push(rec);',
  '  }',
  '  return { count: els.length, bytes: bytes, nodes: nodes };',
  '})()'
].join('\n');

/* ---------------------------------------------------------------------------
   THE TWO RULES.
   --------------------------------------------------------------------------- */

/* The word-character class the boundary test uses. Written as an explicit
   character test and NOT as a `\b` regex ON PURPOSE: roster terms contain
   SPACES (`personnel notes`, `appraisal record`, `processed jd`) and an
   AMPERSAND (`billing & insurance notes`), and `\b` semantics around those
   characters are not what a reader of this code would expect — `\b` binds to
   the term's OUTER characters, so the term's own interior punctuation
   silently changes which positions count as boundaries. An explicit test on
   the two characters that actually flank the match says exactly what it
   means. */
function isWordChar(ch) {
  return (ch >= 'A' && ch <= 'Z') ||
         (ch >= 'a' && ch <= 'z') ||
         (ch >= '0' && ch <= '9') ||
         ch === '_';
}

/* RULE 1 — word boundary. Returns the index of the first boundary-clean
   occurrence, or -1. Case-sensitive and un-normalised: `memoir` does not
   match `Memoir`, deliberately, so a future fold cannot merge two roster
   terms' fates unnoticed. */
function wordBoundaryIndex(hay, term) {
  if (typeof hay !== 'string' || typeof term !== 'string' || term === '') {
    return -1;
  }
  let from = 0;
  for (;;) {
    const i = hay.indexOf(term, from);
    if (i === -1) return -1;
    const before = i === 0 ? '' : hay.charAt(i - 1);
    const afterAt = i + term.length;
    const after = afterAt >= hay.length ? '' : hay.charAt(afterAt);
    if ((before === '' || !isWordChar(before)) &&
        (after === '' || !isWordChar(after))) {
      return i;
    }
    from = i + 1;
  }
}

/* RULE 2 — path segment. Only applies to a string that LOOKS like a path
   (it contains a `/`). Splits on `/` and requires a segment to EQUAL the
   term exactly and case-sensitively. A strict prefix or a strict suffix of a
   longer segment is NOT a match — that is the `Memoirs` refusal, and it is
   the same key the shipped fence uses. Returns the character offset of the
   matching segment, or -1. */
function pathSegmentIndex(hay, term) {
  if (typeof hay !== 'string' || typeof term !== 'string' || term === '') {
    return -1;
  }
  if (hay.indexOf('/') === -1) return -1;
  const segs = hay.split('/');
  let pos = 0;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === term) return pos;
    pos += segs[i].length + 1;
  }
  return -1;
}

function contextAt(hay, index, term) {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(hay.length, index + term.length + CONTEXT_RADIUS);
  return hay.slice(start, end);
}

/* ---------------------------------------------------------------------------
   findFencedHits(snapshot, roster) -> Array of
     { path, channel, attr, term, rule, rules, context }

   ONE HIT PER (node, channel, attribute, term) — a hit exists iff EITHER
   rule fired (that is the union), and `rule` names the MOST SPECIFIC rule
   that fired: `segment` when the term is a real path segment, `word`
   otherwise. `rules` lists EVERY rule that fired, so nothing the union saw
   is lost and a report can be audited rule by rule. `attr` names the
   specific `data-*` attribute and is null for the other four channels.

   ⚠ A MEASURED PROPERTY, STATED HERE BECAUSE THE ALTERNATIVE IS A MESSAGE
   THAT OVER-CLAIMS WHAT IT MEASURES. On the DETECTION axis the segment rule
   is a SUBSET of the word rule, universally and by construction: a segment
   match means the occurrence is flanked by `/` or by the string edge, both
   of which are outside [A-Za-z0-9_], so the word rule fires at that index
   too. Therefore the union's HIT SET equals the word rule's hit set. The
   segment rule's contribution is CLASSIFICATION — it is what lets a report
   say "this is a real directory name" rather than "this term was mentioned"
   — not additional detection. The suite DRIVES that containment over the
   whole fixture corpus rather than asserting it in prose, so if a future
   edit breaks the relationship the change is visible.

   ORDER IS STABLE: document order, then channel order, then (within
   `data-*`) attribute name, then roster order. Two runs over the same page
   therefore produce byte-identical output, so a DIFF between two runs means
   the PAGE changed.

   ⚠ THE FINAL SORT IS LOAD-BEARING AND IT IS NOT DECORATION. Hits are
   COLLECTED roster-outer / node-inner — which is exactly how the ad-hoc
   2026-08-07 scan was written, one pass per term — and that insertion order
   is NOT the stable order. Removing the sort changes the output of every
   multi-term scan. Driven as a mutation in the suite.
   --------------------------------------------------------------------------- */
function findFencedHits(snapshot, roster) {
  if (snapshot === null || typeof snapshot !== 'object') {
    throw new Error('findFencedHits: snapshot must be an object with a ' +
      '`nodes` array and a numeric `count`; got ' +
      Object.prototype.toString.call(snapshot) + '. A scan that accepted a ' +
      'missing snapshot would report a page CLEAN that it never read.');
  }
  if (!Array.isArray(snapshot.nodes)) {
    throw new Error('findFencedHits: snapshot.nodes must be an array; got ' +
      Object.prototype.toString.call(snapshot.nodes) + '.');
  }
  if (typeof snapshot.count !== 'number' || !Number.isFinite(snapshot.count)) {
    throw new Error('findFencedHits: snapshot.count must be a finite ' +
      'number. The node count is what stops an EMPTY page reading as a ' +
      'CLEAN page, so a snapshot without one is refused rather than scanned.');
  }
  if (!Array.isArray(roster)) {
    throw new Error('findFencedHits: roster must be an array of strings; ' +
      'got ' + Object.prototype.toString.call(roster) + '. An absent roster ' +
      'is refused, never treated as an empty one — silently scanning for ' +
      'nothing is the purest form of a gate that cannot fail.');
  }
  for (let t = 0; t < roster.length; t++) {
    if (typeof roster[t] !== 'string') {
      throw new Error('findFencedHits: roster[' + t + '] is not a string (' +
        Object.prototype.toString.call(roster[t]) + '). A RegExp roster rule ' +
        'has no word-boundary or path-segment meaning here and must not be ' +
        'silently ignored.');
    }
  }

  const keyed = [];
  const nodes = snapshot.nodes;

  /* roster-outer, node-inner — the ad-hoc scan's shape, kept so the sort
     below has real work to do. */
  for (let t = 0; t < roster.length; t++) {
    const term = roster[t];
    if (term === '') continue;
    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n] || {};
      const nodePath = typeof node.path === 'string' ? node.path : '(no path)';

      const channelStrings = [
        { c: 0, attr: null, s: typeof node.text === 'string' ? node.text : '' },
        { c: 1, attr: null,
          s: typeof node.innerHTML === 'string' ? node.innerHTML : '' },
        { c: 2, attr: null,
          s: typeof node.ariaLabel === 'string' ? node.ariaLabel : '' },
        { c: 3, attr: null,
          s: typeof node.title === 'string' ? node.title : '' }
      ];
      const data = (node.data && typeof node.data === 'object') ?
        node.data : {};
      const dataNames = Object.keys(data).sort();
      for (let d = 0; d < dataNames.length; d++) {
        channelStrings.push({
          c: 4,
          attr: dataNames[d],
          s: typeof data[dataNames[d]] === 'string' ? data[dataNames[d]] : ''
        });
      }

      for (let ci = 0; ci < channelStrings.length; ci++) {
        const chan = channelStrings[ci];
        if (chan.s === '') continue;

        /* THE UNION — asked as an OR, never an AND. Both rules are
           evaluated; a hit exists if EITHER fired; `rules` records every
           one that did and `rule` names the most specific. */
        const wi = wordBoundaryIndex(chan.s, term);
        const si = pathSegmentIndex(chan.s, term);
        if (wi === -1 && si === -1) continue;

        const fired = [];
        if (wi !== -1) fired.push('word');
        if (si !== -1) fired.push('segment');
        const rule = si !== -1 ? 'segment' : 'word';
        const at = si !== -1 ? si : wi;

        keyed.push({
          n: n, c: chan.c, a: chan.attr || '', t: t,
          hit: {
            path: nodePath,
            channel: CHANNELS[chan.c],
            attr: chan.attr,
            term: term,
            rule: rule,
            rules: fired,
            context: contextAt(chan.s, at, term)
          }
        });
      }
    }
  }

  keyed.sort(function (x, y) {
    if (x.n !== y.n) return x.n - y.n;
    if (x.c !== y.c) return x.c - y.c;
    if (x.a !== y.a) return x.a < y.a ? -1 : 1;
    return x.t - y.t;
  });

  return keyed.map(function (k) { return k.hit; });
}

module.exports = {
  SCAN_EXPR: SCAN_EXPR,
  findFencedHits: findFencedHits,
  SCAN_ROSTER: SCAN_ROSTER,
  LAW5_FENCED_ROSTER: LAW5_FENCED_ROSTER,
  TRACE_NEVER_NAME_TERMS: TRACE_NEVER_NAME_TERMS,
  CHANNELS: CHANNELS,
  RULES: RULES,
  deriveScanRoster: deriveScanRoster,
  formatRosterReport: formatRosterReport,
  PROVENANCE: PROVENANCE,
  STORE_ROSTER_KEY: STORE_ROSTER_KEY
};
