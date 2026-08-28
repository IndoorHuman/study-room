/*
 * core.js — the Study Room's single JS logic core (Plan 22-03).
 *
 * Dual-load contract: loaded as a plain (non-module) <script> in index.html
 * (exposes window.StudyCore) AND require()-able from node for the frozen-now
 * tests (the CommonJS export). Pure functions only — no DOM, no fetch, and NO
 * wall-clock reads: time is ALWAYS an injected nowMs argument (D-02); app.js
 * is the only file in the app that reads the clock.
 *
 * Loop invariant: an id recorded as shown (meta.cycle.shown_ids) is excluded
 * from the next shelf selection until the cycle resets. selectShelf (Plan
 * 22-04) enforces it; every selector that lives here honors that invariant.
 *
 * Identity rule: the id string used everywhere is item.id — byte-identical
 * across cycle records, shelf picks, and store keys. Nothing here re-derives,
 * trims, or normalizes ids.
 *
 * No randomness anywhere in this module: selection and interleaving are
 * fully deterministic, with explicit multi-key comparators ending in id
 * lexicographic (the house's seeded-random picker is deliberately not
 * ported — the Study Room shelf is locked deterministic).
 */
(function (root) {
  'use strict';

  // The five item states (SRM-01) — must match study_lib.VALID_STATES
  // exactly; the test suite pins the two enums against each other.
  var STATES = ['unseen', 'blessed', 'never_show', 'resting', 'retired'];

  // Tunable thresholds. Every function takes an opts override so tests can
  // pin them; all day thresholds are consumed as multiples of DAY_MS.
  var DEFAULTS = {
    OPEN_STALE_DAYS: 30,   // shelf prefers items unopened this long (D-14)
    RESTING_DAYS: 90,      // "not really" sleeps an item about this long
    SHELF_MIN: 3,          // adaptive shelf size floor (D-14)
    SHELF_MAX: 5,          // ...and ceiling — scarcity is a feature
    SHELF_SIZE_4_AT: 10,   // eligible pool of 10+ widens the shelf to 4
    SHELF_SIZE_5_AT: 25,   // ...and 25+ to the locked ceiling of 5
    BLESSING_COUNT: 10,    // the guided first pass is about ten items (D-11)
    // 26.999 (her ruling, 2026-08-25 night): the pass may lead with things
    // related to what she recently welcomed — but this many places ALWAYS
    // go to the rest of her pile, so nothing she saved can become
    // unreachable. Her words, choosing it over related-first-always:
    // "Always keep a slice for the rest".
    BLESSING_RESERVE: 2,
    COVER_COOLDOWN_DAYS: 14 // a cover offered once rests about two weeks (D-04)
  };

  function opt(opts, key) {
    return opts && opts[key] != null ? opts[key] : DEFAULTS[key];
  }

  var DAY_MS = 86400000;

  // ---- the 5-state transition table (SRM-01) -------------------------------
  //
  // Every judgment is revisable forever: any revision among unseen / blessed /
  // never_show / resting is ordinary and allowed with a plain via label.
  // Transitions INTO retired are always allowed (the never_again reaction,
  // management). The ONE guarded edge: leaving retired requires the
  // deliberate management dig-out route (via === 'management-dig-out').

  function canTransition(fromState, toState, via) {
    if (STATES.indexOf(toState) === -1) { return false; }
    if (STATES.indexOf(fromState) === -1) { return false; }
    if (fromState === 'retired' && toState !== 'retired' &&
        via !== 'management-dig-out') {
      return false;
    }
    return true;
  }

  // Pure: returns a NEW item object (the input is never mutated), with the
  // state set and exactly one history entry {at, from, to, via} appended —
  // `at` derived from the injected nowMs. Leaving resting clears
  // resting_until_ms. Throws a plain Error naming the rejected pair when the
  // table forbids the move (app.js and the server both guard, but core is
  // the source of truth the tests pin).
  // Shallow item copy with the history array copied too — every pure
  // mutator builds on this so the input object is never touched.
  function copyItem(item) {
    var next = {};
    for (var k in item) {
      if (Object.prototype.hasOwnProperty.call(item, k)) { next[k] = item[k]; }
    }
    next.history = (item.history || []).slice();
    return next;
  }

  function historyEntry(nowMs, from, to, via) {
    return {
      at: new Date(nowMs).toISOString(),
      from: from,
      to: to,
      via: via
    };
  }

  function applyTransition(item, toState, via, nowMs) {
    if (!canTransition(item.state, toState, via)) {
      throw new Error("cannot transition from '" + item.state + "' to '" +
        toState + "' via '" + via + "'");
    }
    var next = copyItem(item);
    next.history.push(historyEntry(nowMs, item.state, toState, via));
    next.state = toState;
    if (item.state === 'resting' && toState !== 'resting') {
      next.resting_until_ms = null;
    }
    return next;
  }

  // ---- blessing candidates (D-10: oldest, mixed, rule-based, no AI) ---------

  // The store serves items as an object map keyed by id; selectors also
  // accept a plain array. Either way the output is deterministic.
  function itemList(items) {
    if (Array.isArray(items)) { return items.slice(); }
    var out = [];
    for (var k in items) {
      if (Object.prototype.hasOwnProperty.call(items, k)) {
        out.push(items[k]);
      }
    }
    return out;
  }

  // Deterministic comparator: created_ms ascending (oldest first), ties
  // broken by id lexicographic.
  function byOldest(a, b) {
    var am = a.created_ms || 0;
    var bm = b.created_ms || 0;
    if (am !== bm) { return am - bm; }
    if (a.id < b.id) { return -1; }
    if (a.id > b.id) { return 1; }
    return 0;
  }

  // ---- the exclusion machinery (SRM-04/05, D-07/D-08/D-10/D-11/D-13) --------
  //
  // Four exclusion classes, one union (D-10): never_show, retired, the
  // trigger overlay (hidden regardless of underlying state, D-08), and
  // active category-filter matches (D-07 — a reversible overlay stored in
  // the store's meta, never a state change). surfacePool is THE choke
  // point (D-11): every surface selector in this module draws from it
  // internally, never from raw items, so bypassing the gate requires
  // writing a new selector that skips it — which the wiring suite catches
  // by construction. Only the manage view is exempt, by design.

  // A filter: {facet: 'source'|'type'|'year'|'folder'|'tag', value: scalar}.
  // year (int) and folder (string) are stamped on every item server-side —
  // matching here is a pure compare; core.js never derives a year from
  // created_ms (that would be timezone-dependent and could leak a filtered
  // item across a year boundary).
  function matchesFilter(item, f) {
    if (!f) { return false; }
    if (f.facet === 'source') { return item.source === f.value; }
    if (f.facet === 'type') { return item.type === f.value; }
    if (f.facet === 'year') { return item.year === f.value; }
    if (f.facet === 'folder') { return item.folder === f.value; }
    if (f.facet === 'tag') {
      return (item.tags || []).indexOf(f.value) !== -1;
    }
    // An unknown facet matches nothing — the server already rejects
    // malformed filters at write time (fail closed at the write).
    return false;
  }

  // Union semantics: any one class excludes; an item matching several
  // classes is excluded exactly like an item matching one. Null-guard
  // first (fail closed, the eligibleForShelf shape). The trigger overlay
  // wins regardless of the underlying state — a blessed item stays
  // blessed underneath (D-08).
  function itemExcluded(item, filters) {
    if (!item) { return true; }
    if (item.state === 'never_show' || item.state === 'retired') {
      return true;
    }
    if (item.trigger === true) { return true; }
    var fs = filters || [];
    for (var i = 0; i < fs.length; i++) {
      if (matchesFilter(item, fs[i])) { return true; }
    }
    return false;
  }

  // THE choke point (D-11). Every surface selector's FIRST move is this
  // call. Removing all filters restores the pool exactly — no memory is
  // left on items (D-07). nowMs is part of the uniform selector signature.
  function surfacePool(items, filters, nowMs) {
    return itemList(items).filter(function (it) {
      return !itemExcluded(it, filters);
    });
  }

  // D-13 fail-closed render guard: an INDEPENDENT straight-line re-check
  // at the render boundary — deliberately not a call into itemExcluded,
  // so a bug in the gate cannot hide itself here. Returns null when the
  // item is clean, or a short machine-readable reason string when it must
  // not render.
  function guardSurface(item, filters) {
    if (!item) { return 'missing'; }
    if (item.state === 'never_show') { return 'never_show'; }
    if (item.state === 'retired') { return 'retired'; }
    if (item.trigger === true) { return 'hidden'; }
    var fs = filters || [];
    for (var i = 0; i < fs.length; i++) {
      if (matchesFilter(item, fs[i])) { return 'filter:' + fs[i].facet; }
    }
    return null;
  }

  // origin_path directory segments (filename dropped).
  function dirSegments(originPath) {
    var parts = String(originPath || '').split('/');
    parts.pop();
    return parts;
  }

  // Length of the directory prefix shared by every candidate — the segment
  // right after it is the item's top-level source folder (the subfolder of
  // the imported source it came from).
  function commonDirPrefixLen(candidates) {
    if (!candidates.length) { return 0; }
    var first = dirSegments(candidates[0].origin_path);
    var len = first.length;
    for (var i = 1; i < candidates.length; i++) {
      var segs = dirSegments(candidates[i].origin_path);
      var j = 0;
      while (j < len && j < segs.length && segs[j] === first[j]) { j++; }
      len = j;
    }
    return len;
  }

  // The guided first-blessing candidates (SRM-02, D-10): only unseen items,
  // oldest first, INTERLEAVED round-robin across buckets keyed by
  // (type + top-level source folder of origin_path) so notes and photos from
  // different folders mix instead of one pile front-loading the pass.
  // The guided pass is a gated surface too: an unseen item can be
  // trigger-hidden or filter-matched, so candidates draw from surfacePool
  // — only the manage view is exempt (D-10). Returns an array of ids.
  // Fully deterministic; nowMs is part of the uniform selector signature
  // (fn(items, filters, nowMs, opts)).
  function pickBlessingCandidates(items, filters, nowMs, opts) {
    opts = opts || {};
    var count = opts.BLESSING_COUNT != null ?
      opts.BLESSING_COUNT : DEFAULTS.BLESSING_COUNT;
    var unseen = surfacePool(items, filters, nowMs).filter(function (it) {
      return it && it.state === 'unseen';
    });
    unseen.sort(byOldest);
    var prefixLen = commonDirPrefixLen(unseen);
    // Group into buckets; bucket order = order of each bucket's oldest
    // member (first appearance in the globally sorted list), so the very
    // first card is the oldest thing the user owns.
    var bucketKeys = [];
    var buckets = {};
    unseen.forEach(function (it) {
      var segs = dirSegments(it.origin_path);
      var folder = segs.length > prefixLen ? segs[prefixLen] : '(root)';
      var key = (it.type || '') + '|' + folder;
      if (!buckets[key]) {
        buckets[key] = [];
        bucketKeys.push(key);
      }
      buckets[key].push(it);
    });
    // Round-robin: one item per bucket per round, skipping exhausted
    // buckets, until the count is reached or everything is taken.
    var picks = [];
    var round = 0;
    while (picks.length < count) {
      var took = false;
      for (var i = 0; i < bucketKeys.length && picks.length < count; i++) {
        var bucket = buckets[bucketKeys[i]];
        if (round < bucket.length) {
          picks.push(bucket[round].id);
          took = true;
        }
      }
      if (!took) { break; }
      round++;
    }
    return picks;
  }

  // ---- the pass that leads with what she recently welcomed (26.999) --------
  //
  // HER RULING, 2026-08-25 night, from the built desk: "I cannot tell how
  // much the current blessing is related to what my recenlty things is" —
  // then, choosing from an offered set, "go option2 ... but if the
  // librarian cannot find the enough aomount things like for my example is
  // 10, the librarian will pick the other unrelated blessing things", and
  // on the starvation consequence put back to her: "Always keep a slice
  // for the rest".
  //
  // ⛔ NO MODEL, NO BODIES, NO NETWORK — and that is not an implementation
  // detail, it is what keeps this inside the shipped laws. Relatedness here
  // is computed from what the room ALREADY knows about an item: the time of
  // year it is from, and the folder it came in from. Nothing reads an
  // unjudged body, so the fence (law 5 / the hard fence) and the pre-sort
  // consent are untouched, and the 26.8 D-07 "zero AI calls during the
  // walk" contract holds by construction rather than by care.
  //
  // ⛔ IT PROPOSES AN ORDER, IT DISPOSES OF NOTHING (law 7, law 2). Every
  // item still reaches her judgment; the reserve below guarantees the rest
  // of the pile keeps coming up, so a long related streak can never bury
  // it. That reserve is the whole difference between "leads with" and
  // "only ever shows".
  //
  // The two facets, both deterministic:
  //   · SEASON — the same fortnight of the year as something she recently
  //     welcomed (the Offer's own reach, reused; dateless items P-5 out).
  //   · FOLDER — the same top-level source folder as something she
  //     recently welcomed.

  // How many of her recent blessings set the facets. A COUNT rather than a
  // time window on purpose: someone who blessed a great deal months ago and
  // nothing since still gets a related pass, where a window would quietly
  // hand back the ordinary one and look like the feature had failed.
  var RELATED_FACET_BLESSINGS = 20;

  // The facets of her recent welcomes. Reads item.history for hops to
  // 'blessed' (the 188-of-188 source pickBlessingSeed uses; a history hop's
  // `at` is an ISO string, never epoch ms). Pure; no clock.
  function recentBlessingFacets(items, prefixLen, limit) {
    var take = finiteNumber(limit) ? limit : RELATED_FACET_BLESSINGS;
    var blessed = [];
    itemList(items).forEach(function (it) {
      if (!it || !it.id) { return; }
      var hist = Array.isArray(it.history) ? it.history : [];
      var newest = 0;
      for (var i = 0; i < hist.length; i++) {
        var hop = hist[i] || {};
        if (hop.to !== 'blessed' || !hop.at) { continue; }
        var ms = Date.parse(hop.at);
        if (!isNaN(ms) && ms > newest) { newest = ms; }
      }
      if (newest) { blessed.push({ item: it, at: newest }); }
    });
    blessed.sort(function (a, b) {
      if (a.at !== b.at) { return b.at - a.at; }   // newest welcome first
      return a.item.id < b.item.id ? -1 : 1;       // deterministic on a tie
    });
    var fortnights = {};
    var folders = {};
    blessed.slice(0, take).forEach(function (rec) {
      var it = rec.item;
      if (it.created_ms && !noCaptureDate(it)) {
        fortnights[fortnightOf(it.created_ms)] = true;
      }
      var folder = folderOf(it, prefixLen);
      if (folder) { folders[folder] = true; }
    });
    return { fortnights: fortnights, folders: folders };
  }

  // The top-level source folder of an item, under a shared prefix.
  function folderOf(item, prefixLen) {
    var segs = dirSegments(item && item.origin_path);
    return segs.length > prefixLen ? segs[prefixLen] : '(root)';
  }

  // Why this item is in the pass — the payload the room renders its
  // relation line from. Null when nothing relates it: the reserve's own
  // picks carry no line rather than an invented one.
  function blessingRelation(item, facets, prefixLen) {
    if (!item || !facets) { return null; }
    if (item.created_ms && !noCaptureDate(item)) {
      var fn = fortnightOf(item.created_ms);
      if (facets.fortnights[fn]) {
        return { kind: 'season', fortnight: fn, whenMs: item.created_ms };
      }
    }
    var folder = folderOf(item, prefixLen);
    if (folder && facets.folders[folder]) {
      return { kind: 'folder', folder: folder };
    }
    return null;
  }

  // The pass itself. Returns { ids, relation } — ids in the order they are
  // to be met, and a per-id relation payload (absent for reserve picks).
  //
  // ⚠ ADDITIVE: pickBlessingCandidates above is untouched and keeps every
  // one of its callers and pins. This function REUSES it for the ordinary
  // half, so the diversity round-robin (notes and photos from different
  // folders interleaved) still governs everything the facets did not pick.
  function pickRelatedBlessingCandidates(items, filters, nowMs, opts) {
    opts = opts || {};
    var count = opt(opts, 'BLESSING_COUNT');
    var reserve = opt(opts, 'BLESSING_RESERVE');
    if (!(count > 0)) { return { ids: [], relation: {} }; }
    if (!(reserve >= 0) || reserve > count) { reserve = 0; }

    var unseen = surfacePool(items, filters, nowMs).filter(function (it) {
      return it && it.state === 'unseen';
    });
    if (!unseen.length) { return { ids: [], relation: {} }; }
    unseen.sort(byOldest);

    // ONE prefix over everything the facets and the pass compare, so a
    // folder name means the same thing on both sides of the match.
    var prefixLen = commonDirPrefixLen(unseen.concat(
      itemList(items).filter(function (it) {
        return it && Array.isArray(it.history) && it.history.length;
      })));
    var facets = recentBlessingFacets(items, prefixLen, opts.FACET_BLESSINGS);

    var relation = {};
    var related = [];
    unseen.forEach(function (it) {
      var rel = blessingRelation(it, facets, prefixLen);
      if (rel) {
        relation[it.id] = rel;
        related.push(it);
      }
    });

    // The ordinary pass, in its own diverse order — the source of both the
    // reserve and any top-up. Asked for the whole pool, then read in order.
    var ordinary = pickBlessingCandidates(items, filters, nowMs,
      { BLESSING_COUNT: unseen.length });
    var unrelatedOrder = ordinary.filter(function (id) {
      return !relation[id];
    });

    // Her shape, in three steps: the reserve is filled FIRST (from the rest
    // of her pile, in the ordinary diverse order), the related lead the
    // pass, and anything still short is topped up from whatever remains —
    // so a pass is never short while her library can fill it.
    var reserveIds = unrelatedOrder.slice(0, Math.min(reserve, count));
    var leadRoom = count - reserveIds.length;
    var leadIds = related.slice(0, leadRoom).map(function (it) {
      return it.id;
    });
    var taken = {};
    var ids = [];
    leadIds.concat(reserveIds).forEach(function (id) {
      if (!taken[id]) { taken[id] = true; ids.push(id); }
    });
    if (ids.length < count) {
      ordinary.forEach(function (id) {
        if (ids.length >= count || taken[id]) { return; }
        taken[id] = true;
        ids.push(id);
      });
    }
    // The order she meets them in: the ordinary pass's own diverse order,
    // so the reserve's picks are mixed through rather than trailing at the
    // end where "these are the leftovers" would read off the screen.
    var order = {};
    ordinary.forEach(function (id, i) { order[id] = i; });
    ids.sort(function (a, b) { return (order[a] || 0) - (order[b] || 0); });
    var kept = {};
    ids.forEach(function (id) { if (relation[id]) { kept[id] = relation[id]; } });
    return { ids: ids, relation: kept };
  }

  // ---- the walk pool (26.8-01, D-02/D-06: new arrivals, recent-first) -------

  // The newest ARRIVAL stamp on an item: max(created_ms, saved_ms).
  // Deliberately narrower than the reflection pool's newest-activity
  // predicate server-side (which also reads comment stamps) — a fresh
  // comment on an old item re-enters the reflection, never the walk
  // (two predicates, one boundary value).
  function walkStampMs(item) {
    return Math.max(item.created_ms || 0, item.saved_ms || 0);
  }

  // Deterministic comparator: newest walk stamp first, ties broken by id
  // lexicographic (byOldest's mirror).
  function byWalkRecent(a, b) {
    var am = walkStampMs(a);
    var bm = walkStampMs(b);
    if (am !== bm) { return bm - am; }
    if (a.id < b.id) { return -1; }
    if (a.id > b.id) { return 1; }
    return 0;
  }

  // The blessing walk's candidates (26.8-01, D-02): only unseen items
  // whose newest arrival stamp lands STRICTLY after opts.boundaryMs,
  // sorted recent-first — the opposite order of the guided pass above,
  // hence a selector of its own, never an opts variant. Draws from
  // surfacePool in its own body (the D-11 choke point). Returns ids
  // UNCAPPED — the sitting cap belongs to the caller (app.js
  // blessBatch). Uniform gated-selector signature.
  function pickWalkArrivals(items, filters, nowMs, opts) {
    opts = opts || {};
    var boundary = opts.boundaryMs != null ? opts.boundaryMs : 0;
    var arrivals = surfacePool(items, filters, nowMs).filter(function (it) {
      return it && it.state === 'unseen' && walkStampMs(it) > boundary;
    });
    arrivals.sort(byWalkRecent);
    return arrivals.map(function (it) { return it.id; });
  }

  // ---- the reach back: the fortnight lookup (26.95-30, D-01/D-05/D-12) ------
  //
  // Once a visit the room takes something she recently blessed — the SEED —
  // works out what time of year it is from, and offers up to three much older
  // unseen photographs from the same fortnight of OTHER years. It proposes;
  // she blesses (law 7).
  //
  // WHY TIME OF YEAR AND NOT PLACE (D-05, measured 2026-08-12). Her 4,966
  // GPS-bearing photographs cluster into 193 places, and those clusters are
  // the addresses she has lived at in sequence — only 25 of 193 can reach back
  // even two years. All 27 fortnights in the library hold photographs from
  // more than one year. Place is a LABEL and never the search key; and there
  // is no coordinate anywhere in this product to render one from anyway.
  //
  // WHAT LIVES HERE AND WHAT DOES NOT (P-1). This half is the gated pool draw,
  // the fortnight filter and the oldest-first ordering: one linear pass,
  // exactly pickWalkArrivals' shape, pure and pinnable. The burst collapse and
  // the cap of three live on the SERVER, because the feature prints they need
  // are 3,072 raw bytes per picture on disk and this file has no filesystem.
  // Ids come back UNCAPPED from here (P-2): D-07 caps MOMENTS, not files, so
  // the cap cannot precede the thing that computes Moments.
  //
  // ⛔ THE FACET IS THE BAR (D-06). A fortnight lookup either has older
  // photographs in it or it does not. Nothing here ranks anything, and no
  // plan may add a bar of its own to this path — doing so would recreate the
  // hidden never-offer failure measured on map ticket #36.

  // A bound the lookup can compare against: a real, finite number. NaN is not
  // one — `NaN < 2026` is false, so an unchecked NaN would empty the Offer
  // silently, which is the failure P-9 exists to make impossible.
  function finiteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // The UTC calendar day an epoch-ms stamp falls on, as a day index. Epoch ms
  // are UTC by definition, so this is plain arithmetic and reads no locale.
  function utcDayIndex(ms) {
    return Math.floor(ms / DAY_MS);
  }

  // 0-based UTC day of year: 1 January is 0, 31 December is 364 (365 in a
  // leap year). Derived through Date.UTC on both ends so no local offset can
  // walk a photograph across a day boundary.
  function dayOfYearUTC(ms) {
    var d = new Date(ms);
    var y = d.getUTCFullYear();
    return Math.round((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(y, 0, 1)) / DAY_MS);
  }

  // The fortnight bucket, 0..26. The last bucket is a day or two long on
  // purpose: day 364 and day 365 both land in 26, so a leap year adds no
  // twenty-eighth bucket and no year has a bucket the others lack. Two
  // adjacent buckets never merge — this is integer division, not a window.
  function fortnightOf(ms) {
    return Math.floor(dayOfYearUTC(ms) / 14);
  }

  function yearOfUTC(ms) {
    return new Date(ms).getUTCFullYear();
  }

  // P-5: a photograph carrying NO REAL CAPTURE DATE. 187 of hers have no EXIF
  // date at all, so created_ms falls back to the file's birthtime and they all
  // cluster on the night they were imported — enough to swamp one fortnight
  // with things that were never taken then. CONTEXT §Corrections left the
  // choice open between excluding them and ordering them last; this plan
  // EXCLUDES them, and the predicate needs no new store field: a capture stamp
  // and an import stamp landing on the same UTC calendar day is the tell.
  //
  // Fail-open on absence: an item missing either stamp is NOT judged dateless
  // by this rule, because one missing number is not evidence of anything.
  function noCaptureDate(item) {
    var created = item && item.created_ms;
    var imported = item && item.imported_ms;
    if (!created || !imported) { return false; }
    return utcDayIndex(created) === utcDayIndex(imported);
  }

  // D-05 is OLDEST CAPTURE FIRST — her own "the older the better", finally
  // sortable because photographs carry real EXIF dates where her text does
  // not. Written as its OWN comparator rather than an opts flag on
  // byWalkRecent, for the reason recorded at byWalkRecent above: the two
  // orders are opposite, and an opts variant makes one selector's change the
  // other's bug. It is byOldest's shape today and deliberately not byOldest
  // itself — that one orders the guided pass, this one orders an Offer, and
  // the two are pinned by different suites so either may move without the
  // other following. Ends in an id tiebreak, so reversing the input array
  // cannot change the output.
  function byOldestCapture(a, b) {
    var am = a.created_ms || 0;
    var bm = b.created_ms || 0;
    if (am !== bm) { return am - bm; }
    if (a.id < b.id) { return -1; }
    if (a.id > b.id) { return 1; }
    return 0;
  }

  // One Seed record, from the item that carries the blessing hop.
  function seedRecord(item, blessedMs) {
    var dateMs = item.created_ms || 0;
    return {
      id: item.id,
      blessedMs: blessedMs,
      dateMs: dateMs,
      hasDate: !!dateMs && !noCaptureDate(item)
    };
  }

  // THE SEED (D-02): the newest thing she blessed. Prefer a blessing made
  // after sinceMs; with none, fall back to the newest blessing in the store,
  // so a visit where she blessed nothing new still has something to reach
  // from. Returns {id, blessedMs, dateMs, hasDate}, or null when nothing was
  // ever blessed (day one — the guided first pass is what covers that case).
  //
  // ⛔ READ FROM item.history, NEVER librarian/blessings.json. That file holds
  // 6 entries against 188 blessed items; history carries 188 of 188.
  //
  // ⚠ A HISTORY HOP'S `at` IS AN ISO-8601 STRING, not epoch ms — it is the one
  // timestamp in the store that is not a number, and dividing it raises.
  // Date.parse is the shipped reading (packJournalToc does the same).
  function pickBlessingSeed(items, sinceMs) {
    var since = finiteNumber(sinceMs) ? sinceMs : 0;
    var best = null;      // the newest blessing made after `since`
    var fallback = null;  // ...and the newest of all, if none is
    function better(current, ms, item) {
      if (!current) { return true; }
      if (ms !== current.blessedMs) { return ms > current.blessedMs; }
      return item.id < current.id;   // deterministic on a tie
    }
    itemList(items).forEach(function (it) {
      if (!it || !it.id) { return; }
      var hist = Array.isArray(it.history) ? it.history : [];
      var newest = 0;
      for (var i = 0; i < hist.length; i++) {
        var hop = hist[i] || {};
        if (hop.to !== 'blessed' || !hop.at) { continue; }
        var ms = Date.parse(hop.at);
        if (!isNaN(ms) && ms > newest) { newest = ms; }
      }
      if (!newest) { return; }
      if (better(fallback, newest, it)) { fallback = seedRecord(it, newest); }
      if (newest > since && better(best, newest, it)) {
        best = seedRecord(it, newest);
      }
    });
    return best || fallback;
  }

  // The Offer's candidates: unseen PHOTOGRAPHS from the seed's fortnight in
  // years earlier than THIS one, oldest capture first, ids UNCAPPED (P-2).
  //
  // ⛔ THE YEAR BOUND IS NOT AN INPUT, AND THAT IS THE WHOLE POINT (D-05,
  // amended by the owner 2026-08-16 on UAT finding F-5). It used to be one,
  // and every caller filled it from the SEED's own capture date — so welcoming
  // an old photograph made that photograph the newest blessing and dropped the
  // ceiling to its year. The better the feature worked the faster it switched
  // itself off: measured on her own library, 332 photographs reachable before
  // her first Offer and 0 after it. Her ruling is that "older" means older
  // than THIS year, never older than the Seed, so the window's width is a
  // property of the calendar and not of what she last liked. It is read off
  // the injected clock this function already takes, which is what makes the
  // ratchet unbuildable rather than merely forbidden — no call site can narrow
  // it, so no gate has to watch for one (D-02's own rule: by construction, not
  // by a rule someone must remember).
  //
  // ⚠ THE FORTNIGHT IS STILL THE SEED'S, and still the caller's to supply —
  // that is the reach itself and the amendment does not touch it.
  //
  // ⚠ P-9 — THE BUCKET IS REQUIRED AT EVERY CALL SITE, AND A MISSING ONE IS A
  // PROGRAMMING ERROR RATHER THAN AN EMPTY OFFER. A comparison against
  // undefined is false, so an unsupplied bucket would drop EVERY candidate in
  // silence, on exactly the path that most needs to work. Two guards, because
  // one is not enough: this branch, and a static wiring gate in
  // tests/test_surface_wiring.cjs asserting every call site in app.js passes
  // the key inside the argument span. The gate is what makes the branch below
  // unreachable in production; the branch is what stops it being a leak if the
  // gate is ever gutted. ⚠ `nowMs` joins it: it is now a BOUND and not only a
  // pool argument, so a non-finite clock would empty the Offer just as
  // silently as a missing bucket once did.
  function pickOfferCandidates(items, filters, nowMs, opts) {
    opts = opts || {};
    // P-9: an absent or non-finite bucket, or a clock that is not a number, is
    // a CALL-SITE PROGRAMMING ERROR, never a legitimate empty Offer — the
    // block above says why, and the wiring gate is what keeps this branch
    // unreachable.
    if (!finiteNumber(opts.fortnight) || !finiteNumber(nowMs)) {
      return [];
    }
    var beforeYear = yearOfUTC(nowMs);               // THIS year, always
    var pool = surfacePool(items, filters, nowMs);   // THE choke point (D-11)
    var picks = pool.filter(function (it) {
      if (!it || it.state !== 'unseen' || it.type !== 'image') { return false; }
      var ms = it.created_ms;
      if (!ms) { return false; }
      if (noCaptureDate(it)) { return false; }       // P-5
      if (fortnightOf(ms) !== opts.fortnight) { return false; }
      return yearOfUTC(ms) < beforeYear;             // strictly earlier years
    });
    picks.sort(byOldestCapture);
    return picks.map(function (it) { return it.id; });
  }

  // P-8 — WOULD A DOOR OPEN ANYTHING? A pure, silent, boolean probe, so a
  // container's presence rule can be decided at scene paint without spending
  // the visit's Offer and without reaching a model. It issues no request,
  // reads no client state, writes nothing and reads no clock (nowMs is
  // injected). Deriving the Offer at scene paint instead would spend the
  // Offer before any door was touched AND fire a cloud call on every visit
  // with no tap, which is a law-1 pull-only violation wearing a presence rule.
  //
  // ⚠ A NAMED RESIDUAL, NOT A HIDDEN ONE. On the dateless-Seed path this probe
  // uses the FALLBACK pair (today's calendar) while a later tap may derive a
  // different pair from a model, so the probe can be wrong in both directions:
  // a container can be present and the tap then open nothing (which is the
  // shipped quiet behaviour, not a leak), or a container can be absent while
  // another door would still have offered something. The only exact mechanism
  // is firing the front call at scene paint, and that is forbidden twice over.
  // ⛔ Do not "improve" this into a call — the residual is carried into the
  // owner's beats as an open question instead.
  // ⚠ THE BASIS NOW DECIDES THE BUCKET AND NOTHING ELSE (D-05 amendment). It
  // used to decide the year ceiling too, which is what made the probe agree
  // with a door that was quietly closing itself.
  function offerLikely(items, filters, nowMs, sinceMs) {
    var seed = pickBlessingSeed(items, sinceMs);
    if (!seed) { return false; }
    var basis = seed.hasDate ? seed.dateMs : nowMs;
    return pickOfferCandidates(items, filters, nowMs, {
      fortnight: fortnightOf(basis)
    }).length > 0;
  }

  // #150 (2026-08-25): the desk first-look door's presence rule — would the
  // guided pass set anything out right now? A BOOLEAN on purpose: the desk
  // painter is forbidden count reads (D-15, law 3), so the length stays
  // here, behind the same shipped picker the pass itself runs — never a
  // second selection rule. PURE (no DOM, no clock, no state), like every
  // neighbour in this file.
  function firstLookWaiting(items, filters, nowMs) {
    return pickBlessingCandidates(items, filters, nowMs, {}).length > 0;
  }

  // ---- the shelf (SRM-01, D-14): pure, deterministic, cycle-aware -----------

  // Eligibility by construction (never-list integrity, T-22-14): ONLY
  // blessed items, or resting items whose wake date has passed (lazy wake —
  // pull-only means no timers anywhere; a resting item with no wake date is
  // not held asleep). unseen / never_show / retired are NEVER eligible,
  // regardless of dates.
  function eligibleForShelf(item, nowMs) {
    if (!item) { return false; }
    if (item.state === 'blessed') { return true; }
    if (item.state === 'resting') {
      return item.resting_until_ms == null || item.resting_until_ms <= nowMs;
    }
    return false;
  }

  // Adaptive shelf size (D-14): the pool decides where in the locked 3–5
  // band the shelf sits. Scarcity is a feature — a visit is an event, not
  // a feed, so the ceiling stays at SHELF_MAX.
  function shelfSize(eligibleCount, opts) {
    var min = opt(opts, 'SHELF_MIN');
    var max = opt(opts, 'SHELF_MAX');
    if (eligibleCount >= opt(opts, 'SHELF_SIZE_5_AT')) { return max; }
    if (eligibleCount >= opt(opts, 'SHELF_SIZE_4_AT')) {
      return Math.min(min + 1, max);
    }
    return min;
  }

  // Preference bands: 1 never-opened, 2 opened OPEN_STALE_DAYS+ ago, 3 the
  // rest — the shelf favors the long-forgotten (that is where the lift
  // lives).
  function shelfBand(item, nowMs, staleMs) {
    if (item.last_opened_ms == null) { return 0; }
    if (nowMs - item.last_opened_ms >= staleMs) { return 1; }
    return 2;
  }

  // Deterministic multi-key comparator: band, then oldest created (band 1)
  // or oldest last-opened (bands 2–3), ending in id lexicographic.
  function byShelfPreference(nowMs, staleMs) {
    return function (a, b) {
      var ba = shelfBand(a, nowMs, staleMs);
      var bb = shelfBand(b, nowMs, staleMs);
      if (ba !== bb) { return ba - bb; }
      if (ba === 0) {
        var ac = a.created_ms || 0;
        var bc = b.created_ms || 0;
        if (ac !== bc) { return ac - bc; }
      } else if (a.last_opened_ms !== b.last_opened_ms) {
        return a.last_opened_ms - b.last_opened_ms;
      }
      if (a.id < b.id) { return -1; }
      if (a.id > b.id) { return 1; }
      return 0;
    };
  }

  // The shelf selector (SRM-01). Pure and stateless: same items, cycle, and
  // now give the identical shelf — the caller persists cycle/current_shelf
  // via the server and reuses the shelf within a visit. Returns
  // {picks: [ids], cycleReset: bool}; LOOP INVARIANT — every id in
  // cycle.shown_ids is absent from picks unless the cycle resets. When the
  // eligible-minus-shown pool falls below the shelf size AND the shown list
  // was actually holding items back, cycleReset reports true and the
  // selection recomputes against an empty shown list (repeats allowed
  // again). A pool simply smaller than the shelf is not a reset — the
  // shelf just comes back smaller (the UI handles <3 with the honest
  // empty state, D-12).
  function selectShelf(items, cycle, filters, nowMs, opts) {
    var staleMs = opt(opts, 'OPEN_STALE_DAYS') * DAY_MS;
    // First move: draw from THE choke point (D-11) — exclusion is the
    // pool's job; eligibility (blessed / woken-resting) stays the
    // selector's. Two layers, by construction, never merged.
    var pool = surfacePool(items, filters, nowMs);
    var eligible = pool.filter(function (it) {
      return eligibleForShelf(it, nowMs);
    });
    var size = shelfSize(eligible.length, opts);
    var shown = {};
    ((cycle && cycle.shown_ids) || []).forEach(function (id) {
      shown[id] = true;
    });
    var remaining = eligible.filter(function (it) { return !shown[it.id]; });
    var cycleReset = false;
    if (remaining.length < size && remaining.length < eligible.length) {
      cycleReset = true;
      remaining = eligible.slice();
    }
    remaining.sort(byShelfPreference(nowMs, staleMs));
    return {
      picks: remaining.slice(0, size).map(function (it) { return it.id; }),
      cycleReset: cycleReset
    };
  }

  // ---- the soft cover picker (SRM-04, D-01..D-04) ----------------------------

  // At most ONE unseen item per visit, offered behind a cover (D-01). A
  // "not now" needs no state: the last-offered timestamp in coverOffers
  // (the store's meta.cover_offers map, id -> epoch ms) IS the whole
  // cooldown record (D-04), consumed lazily against the injected nowMs —
  // pull-only, no timers anywhere, exactly like resting. Draws from the
  // choke point first, so an excluded unseen item can never be offered.
  // Deterministic: oldest first, id-lexicographic ties — same inputs give
  // the same cover on any machine. Returns one id, or null.
  function pickCoverCandidate(items, filters, coverOffers, nowMs, opts) {
    var cooldownMs = opt(opts, 'COVER_COOLDOWN_DAYS') * DAY_MS;
    // wayfinder #127 (owner ruling 2026-08-19): THE PERMANENT ANSWER REACHES
    // HERE TOO. The block on selectLibrarianSuggestions below says "this list
    // and the Offer are the tree's only two live proposal surfaces" — that was
    // WRONG, and this picker is the third. The cover chooses one unseen item a
    // visit and puts it in front of her; wrapped is still brought. Her ruling:
    // "the room picking something and putting it in front of you is the room
    // bringing it." The Offer is screened server-side and the suggestions list
    // client-side; this was screened nowhere, and the record was not even
    // loaded on the shelf screen.
    //
    // ADDITIVE, exactly like that selector's sixth argument: an absent
    // opts.notRelevantIds — or anything that is not an array — behaves
    // BYTE-FOR-BYTE as this picker behaved before it existed, so no caller
    // changes meaning by staying silent.
    //
    // Object.create(null) for the reason spelled out on that selector: a plain
    // `{}` inherits `constructor` and an assignable `__proto__`, so an item
    // whose id happened to be one of those two words would be withdrawn by a
    // property nobody wrote — or could never be withdrawn at all.
    var notRelevant = Object.create(null);
    var nrIds = (opts && Array.isArray(opts.notRelevantIds)) ?
      opts.notRelevantIds : [];
    nrIds.forEach(function (id) { notRelevant[id] = true; });
    var pool = surfacePool(items, filters, nowMs).filter(function (it) {
      if (it.state !== 'unseen') { return false; }
      if (notRelevant[it.id]) { return false; }
      // wayfinder #127: hasOwnProperty, not a bare lookup. `coverOffers` is a
      // plain object off the store's meta, so a bare read of an id named
      // `__proto__` or `constructor` returns an INHERITED value — truthy,
      // never a number — and the item is silently barred from the cover
      // forever. Found by the trap test below this picker's own new one; the
      // hazard is the same one selectLibrarianSuggestions documents, in the
      // map that was already here rather than the one just added.
      var offers = coverOffers || {};
      var offered = Object.prototype.hasOwnProperty.call(offers, it.id) ?
        offers[it.id] : null;
      return offered == null || nowMs - offered >= cooldownMs;
    });
    pool.sort(byOldest);
    return pool.length ? pool[0].id : null;
  }

  // ---- the containers (24 D-11/D-12/D-13): album + journal + pile count ------
  //
  // Two NEW pull surfaces: the album browses blessed image items, the
  // journal browses blessed text items — deliberate, user-initiated
  // access that complements the shelf's curated scarcity (D-12). Both
  // draw from THE choke point first (D-11), so an excluded item
  // (never_show / retired / trigger-hidden / filter-matched) can never
  // reach a container. The pile count (D-13) is a surface fact and goes
  // through the same gate — a raw-items count would announce things the
  // user excluded.

  // Oldest saved first, id-lexicographic ties (24 D-12) — the containers'
  // stable quiet order, the manage view's bySavedOldest ported into core
  // so the sort is part of the pure, node-tested selector.
  function bySavedOldestCore(a, b) {
    var am = a.saved_ms || 0;
    var bm = b.saved_ms || 0;
    if (am !== bm) { return am - bm; }
    if (a.id < b.id) { return -1; }
    if (a.id > b.id) { return 1; }
    return 0;
  }

  // The album's browse selector (24 D-11/D-12): FIRST MOVE the choke
  // point, then strictly blessed image items — resting (even past its
  // wake date) stays out until it naturally wakes through a shelf or
  // manage open; rendering a container never causes a wake side-effect.
  // Deterministic, oldest saved first; nowMs is part of the uniform
  // selector signature. Returns an array of ids.
  function pickAlbumItems(items, filters, nowMs) {
    var pool = surfacePool(items, filters, nowMs).filter(function (it) {
      return it.state === 'blessed' && it.type === 'image';
    });
    pool.sort(bySavedOldestCore);
    return pool.map(function (it) { return it.id; });
  }

  // 26.9-04 (D-04/D-11/D-12): the notebook picker's image selector.
  //
  // THE EXCLUSION RULE, IN ONE SENTENCE: the picker shows an image item iff
  // guardSurface(item, filters) === null — i.e. not never_show, not retired,
  // not trigger-flagged, and not matching any active filter. NOTHING ELSE IS
  // EXCLUDED, and there is no second exclusion function anywhere.
  //
  // THE PICKER IS NOT A RESURFACING SURFACE. Law 1 is satisfied by user
  // initiation, not by a gate: this renders only after she opens the
  // notebook, enters design mode, opens the tin, and chooses the pictures
  // tab. FOUR DELIBERATE ACTS. Opening the notebook does not open the tin,
  // and opening the tin does not open the pictures tab.
  //
  // THE PERSONAL FLAG IS DELIBERATELY NOT CONSULTED, and that is D-12,
  // decided by the owner on 2026-08-04 after CONTEXT raised it as a warning.
  // isPersonalNote governs BODY REFORMATTING (26.88 D-19) — it is called from
  // renderSavedBody and renderSavedBodyLaidOut and nowhere else — and it has
  // no branch in guardSurface or itemExcluded. Personal is a REFORMATTING
  // gate, not a DISPLAY gate. The alternative was measured and has no
  // non-degenerate form: isPersonalNote returns true for every image item in
  // the library (they carry no markdown body, so hasFrontmatterBlock is
  // false), which makes the picker permanently EMPTY; the folder-roster half
  // alone excludes none of them and never fires. Choosing to paste her own
  // photograph onto a page is a deliberate pull, not a resurfacing.
  //
  // ONE-WAY, so narrowing this later is a migration and not an edit: from
  // here on every stored image reference re-resolves through the fence on
  // every render, and a narrower picker would orphan already-placed pictures
  // pointing at items it can no longer reach.
  //
  // Recent-first with an id tiebreak — her newest pictures are the ones she
  // is most likely to reach for. Returns an array of ids.
  function pickPickerImages(items, filters, nowMs) {
    var pool = surfacePool(items, filters, nowMs).filter(function (it) {
      return it.type === 'image';
    });
    pool.sort(function (a, b) {
      var am = a.saved_ms || 0;
      var bm = b.saved_ms || 0;
      if (am !== bm) { return bm - am; }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return pool.map(function (it) { return it.id; });
  }

  // The journal's browse selector (24 D-11/D-12) — the identical shape
  // over blessed text items.
  function pickJournalItems(items, filters, nowMs) {
    var pool = surfacePool(items, filters, nowMs).filter(function (it) {
      return it.state === 'blessed' && it.type === 'text';
    });
    pool.sort(bySavedOldestCore);
    return pool.map(function (it) { return it.id; });
  }

  // 26.91-04 (D-06, 2026-08-07): pickSessionReading — the reading door's
  // session cohorts — was REMOVED here with the reading book itself, together
  // with the blessedAtMs helper that existed only for its D-21 blessed-today
  // exclusion. Clean removal, the 26.8.1 D-B method: no flag, no dead code
  // path into the freeze. The removal commit is recorded in
  // 26.91-04-SUMMARY.md so the verbatim recovery 26.9-01 performed on this
  // same object stays available.
  //
  // NOT REMOVED, and deliberately: selectLibrarianSuggestions below. The
  // proposal cohort D-07 wires into the librarian conversation is ITS output,
  // not the `suggested` line that lived inside pickSessionReading — both
  // derived the same cohort (un-acked notebook verdicts joined to live items
  // through surfacePool), and the shipped, already-gated one is the survivor.

  // The gated pile count (24 D-13, knock-not-barge): how many unseen
  // items of a type survive the gate — the containers' quiet hint names
  // this count and nothing else. Draws from the choke point first so a
  // trigger-hidden or filter-matched unseen item never inflates it.
  // Returns a number.
  function countPileByType(items, filters, nowMs, type) {
    return surfacePool(items, filters, nowMs).filter(function (it) {
      return it.state === 'unseen' && it.type === type;
    }).length;
  }

  // 26.95-06 (#86 ruling 3): how many of each group the finished sort shows
  // at once. FOUR is "a few" — enough that a group reads as a group rather
  // than a single card, few enough that three of them together stay a
  // glanceable surface instead of a wall. Exported BY NAME so a fixture sizes
  // itself from the constant instead of hardcoding the number (the
  // SENTENCE_BREAK_MIN precedent), and so it has ONE home if the owner wants
  // it moved.
  var SUGGESTIONS_PER_SHELF = 4;

  // ---- the librarian's suggestions surface (26-02, SRM-11, law 2/7) ---------
  //
  // The review surface's ONE selector: joins the librarian's notebook
  // verdicts to real items THROUGH the choke point — its first move is
  // surfacePool, so a hand-edited suggestions file naming a never_show /
  // retired / trigger-hidden / filter-matched item renders nothing (the
  // two-suite redundancy over the server fence). 'unsure' renders
  // NOTHING (the holding-back bucket), an acked verdict is done (the
  // card dropped when the user took it), and an id the store does not
  // hold renders nothing either. Pure and deterministic: grouped
  // joyful, then receipts, then heavy; id-lexicographic inside each
  // group. Returns [{item, shelf, why}].
  //
  // 26.95-06 (#86 ruling 3): A FEW PER GROUP, AND THE FEW ROTATE.
  //
  // ⚠ THIS FUNCTION HAD NO CAP OF ANY KIND. Every un-acked verdict rendered.
  // Sixty notes was already too many at the #83 UAT; the owner's real vault
  // would paint thousands of rows in three lists. Her ruling: say the sort
  // has finished, show a few per group, and have NO "show more" — *"a
  // backlog with a lid on it, and you'd know it was there"* — because a
  // hidden pile with a handle on it fights the room's whole posture of
  // holding back and offering a little (law 3).
  //
  // ⚠ BUT A CAP ALONE WOULD HAVE BEEN LOSSY, AND THAT NEARLY SHIPPED. This
  // one list is the ONLY consumer of the sort's verdicts in the entire app —
  // nothing else reads `suggestions.verdicts`. Capping at four would mean
  // paying for a sort over 2,600 notes in order to ever see four of them.
  //
  // So the few are RATIONED, NOT CAPPED: `rotation` advances the window each
  // visit, wrapping, so a different few appear each time and every verdict is
  // eventually shown. Same information, delivered over time instead of in one
  // wall — which is how the rest of the room already works, and it is what
  // makes "no show-more" the right answer rather than a lossy one.
  //
  // `rotation` is the room's own visit counter (`room_entries`). It is an
  // ARGUMENT rather than a clock read because this function is pure and must
  // stay so: the same inputs must give the same list, or a repaint mid-visit
  // would reshuffle the cards under her hand. Absent, it is 0 — the first
  // window, which is the old behaviour truncated rather than anything
  // surprising.
  function selectLibrarianSuggestions(items, filters, suggestions, nowMs,
      rotation, notRelevantIds) {
    // 26.95-31 (D-13; owner ruling 2026-08-15): the sixth argument, and it is
    // ADDITIVE. Absent — or anything that is not an array — behaves EXACTLY as
    // this selector behaved before it existed. That is the whole contract, and
    // it is a safety property rather than a convenience: a caller nobody has
    // updated cannot silently change what she is shown.
    //
    // ⚠ THIS IS THE EDIT THAT MAKES D-13's WORD "EVERY" TRUE RATHER THAN
    // ASPIRATIONAL. Saying not relevant withdraws that item from EVERY future
    // librarian proposal, permanently — and this list, the Offer and the soft
    // cover are the tree's live proposal surfaces. Wiring it into the Offer
    // alone would have left the ruling broader than the work.
    //
    // ⛔⛔ THIS BLOCK SAID "this list and the Offer are the tree's only two
    // live proposal surfaces" UNTIL 2026-08-19, AND IT WAS FALSE. The soft
    // cover (pickCoverCandidate) is the third: it chooses one unseen item a
    // visit and puts it in front of her, and it was screened nowhere — the
    // record was not even loaded on the shelf screen. A gate in
    // tests/test_core.cjs (e) had been written BESIDE this claim and inherited
    // it, banning the screening in the cover under a reason that only ever
    // fitted the guided pass. Owner ruling (wayfinder #127): "the room picking
    // something and putting it in front of you is the room bringing it." The
    // gate was SPLIT, never re-baselined. ⚠ A COUNT IN A COMMENT IS NOT A
    // GATE — this one was wrong for as long as it stood.
    //
    // ⛔ AND IT REACHES NO FURTHER. The guided first pass and the Manage grind
    // are deliberately NOT screened against this record, because the glossary
    // requires that a not-relevant item stay unseen, stay in Manage and stay
    // findable — so screening her own deliberate pass would hide material from
    // her, which is the opposite of what the answer means.
    //
    // ⚠ Object.create(null), not an object literal. A plain `{}` inherits
    // `constructor` and an assignable `__proto__`, so an item whose id happens
    // to be one of those two words would be silently withdrawn by a property
    // nobody wrote — or, worse, could never be withdrawn at all. A record like
    // this one is permanent, and invisible until she opens the file, so it
    // must not have a set of ids it quietly gets wrong.
    var notRelevant = Object.create(null);
    (Array.isArray(notRelevantIds) ? notRelevantIds : [])
      .forEach(function (id) { notRelevant[id] = true; });
    var pool = surfacePool(items, filters, nowMs);
    var byId = {};
    pool.forEach(function (it) { byId[it.id] = it; });
    var verdicts = (suggestions && suggestions.verdicts &&
      typeof suggestions.verdicts === 'object') ?
      suggestions.verdicts : {};
    var out = [];
    ['joyful', 'receipts', 'heavy'].forEach(function (shelf) {
      var ids = [];
      for (var id in verdicts) {
        if (!Object.prototype.hasOwnProperty.call(verdicts, id)) {
          continue;
        }
        var v = verdicts[id];
        if (!v || v.shelf !== shelf) { continue; }
        if (v.acked === true) { continue; }
        if (!byId[id]) { continue; } // fenced or unknown: nothing renders
        // 26.95-31 (D-13): she has said this one is not relevant, and that is
        // permanent — a librarian proposal never comes back to it. It sits
        // beside the acked screen and the fence screen deliberately: three
        // different reasons a verdict does not become a card, each on its own
        // line, so a later reader can see which one dropped something.
        //
        // The set is prototype-less (see above), so this plain read is safe
        // for every id a store can hold, including the two words an object
        // literal would have answered for on its own.
        if (notRelevant[id]) { continue; }
        ids.push(id);
      }
      ids.sort();
      // The rotating window. `ids` is already id-lexicographic, so the order
      // is stable across visits and the window simply walks it — an item
      // cannot be skipped forever by a reshuffle, which a random sample of
      // the same size could do.
      var shown = ids;
      if (ids.length > SUGGESTIONS_PER_SHELF) {
        var turn = (typeof rotation === 'number' && isFinite(rotation))
          ? Math.floor(rotation) : 0;
        // A negative counter must not produce a negative index: JS `%` keeps
        // the sign of its left operand, so normalise before using it.
        var start = ((turn * SUGGESTIONS_PER_SHELF) % ids.length + ids.length)
          % ids.length;
        shown = [];
        for (var k = 0; k < SUGGESTIONS_PER_SHELF; k++) {
          shown.push(ids[(start + k) % ids.length]);
        }
      }
      shown.forEach(function (id) {
        out.push({
          item: byId[id],
          shelf: shelf,
          why: String(verdicts[id].why == null ? '' : verdicts[id].why)
        });
      });
    });
    return out;
  }

  // ---- reactions + opens (SRM-01, SRM-03, D-15) ------------------------------

  // The quiet reaction line's three answers. Pure: returns a NEW item.
  //   glad        -> state unchanged; the item ages out naturally because
  //                  last_opened_ms was set on open (via "reaction:glad")
  //   not_really  -> resting for RESTING_DAYS (~3 months) — wrong-day is
  //                  not bad-item (via "reaction:not_really")
  //   never_again -> retired, resting_until_ms cleared; kept forever, shown
  //                  never (via "reaction:never_again")
  // CR-01 fence (law 5): the reaction line belongs to items the room
  // legitimately handed over — blessed, or resting (opened mid-sleep).
  // Reacting on never_show would quietly un-never it (resting resurfaces
  // ~90 days later with no explicit un-never judgment); on unseen it would
  // bypass blessing; retired only ever leaves via the deliberate dig-out.
  function reactionAllowed(item) {
    return item.state === 'blessed' || item.state === 'resting';
  }

  function applyReaction(item, reaction, nowMs, opts) {
    if (!reactionAllowed(item)) {
      throw new Error("reactions are for surfaced items — a '" +
        item.state + "' item is judged from the manage view, never the " +
        'reaction line');
    }
    if (reaction === 'glad') {
      return applyTransition(item, item.state, 'reaction:glad', nowMs);
    }
    if (reaction === 'not_really') {
      var rested = applyTransition(item, 'resting', 'reaction:not_really',
        nowMs);
      rested.resting_until_ms = nowMs + opt(opts, 'RESTING_DAYS') * DAY_MS;
      return rested;
    }
    if (reaction === 'never_again') {
      var retired = applyTransition(item, 'retired', 'reaction:never_again',
        nowMs);
      retired.resting_until_ms = null;
      return retired;
    }
    throw new Error("unknown reaction: '" + reaction + "'");
  }

  // Record an open: last_opened_ms = now plus an "opened" history entry.
  // Opening an expired-resting item also wakes it to blessed (via
  // "resting-wake") so the store reflects the lazy wake. Pure.
  function markOpened(item, nowMs) {
    var next;
    if (item.state === 'resting' &&
        (item.resting_until_ms == null || item.resting_until_ms <= nowMs)) {
      next = applyTransition(item, 'blessed', 'resting-wake', nowMs);
    } else {
      next = copyItem(item);
    }
    next.last_opened_ms = nowMs;
    next.history.push(historyEntry(nowMs, next.state, next.state, 'opened'));
    return next;
  }

  // The trigger overlay (D-08, the user's own iOS-Photos-Hidden design): a
  // boolean flipped on a SAME-STATE transition — the state machine gains
  // zero states and zero edges (same-state pairs are always legal per
  // canTransition, retired included). The item's state is untouched; a
  // blessed item stays blessed underneath. Hidden is indefinite: no timer,
  // no automatic return — resting-wake, dig-out, and reactions never read
  // trigger, so a hidden item stays hidden through every other transition.
  // The ONLY way back is an explicit release (on === false) from the manage
  // view's Hidden section. via: 'hide' | 'release' (a context suffix is
  // fine); the history entry records the judgment. Pure.
  function setTrigger(item, on, via, nowMs) {
    var next = applyTransition(item, item.state, via, nowMs);
    next.trigger = on === true;
    return next;
  }

  // ---- attachments (22-uat): pictures that ARE the note's content -------------
  //
  // A clipped image-post is a caption .md plus its pictures — import records
  // them on the item as 'attachments/<id>/<basename>' rel paths. The reader
  // must show them: body-referenced ones inline at their original positions
  // (rewritten to the /lib/<id>/att/ route so marked renders them), and every
  // attached picture the body never mentions trailing after the body in
  // natural filename order (_1, _2, … _10 — numeric-aware). Verbatim law:
  // no captions invented, no reordering beyond filename order. All name
  // matching mirrors study_lib._match_name — NFC-normalize + lowercase BOTH
  // sides, because macOS filesystems hand back NFD names for CJK/fullwidth
  // characters while note bodies may carry NFC (and vice versa).

  var IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  // Obsidian image wikilink: ![[name.ext]] or ![[name.ext|alias]].
  var WIKILINK_IMG_RE = /!\[\[\s*([^\][|]+?)\s*(?:\|[^\]]*)?\]\]/g;
  // Markdown image: ![alt](path) — optional "title" after the path; the
  // path may be %-encoded (Obsidian writes name%20with%20space.jpg).
  var MD_IMG_RE = /!\[([^\]]*)\]\(\s*<?([^)<>\s]+)>?(?:\s+["'][^)]*)?\s*\)/g;

  // The one folding used for every attachment-name comparison
  // (study_lib._match_name, ported).
  function foldName(name) {
    return String(name).normalize('NFC').toLowerCase();
  }

  function attachmentBasename(rel) {
    return String(rel).split('/').pop();
  }

  // encodeURIComponent leaves ( ) ! ' * raw — real clipped filenames carry
  // parentheses, which would end a markdown image URL early. Encode those
  // too, so the URL survives inside ![](...) syntax.
  function encodePathPart(name) {
    return encodeURIComponent(name).replace(/[()!'*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  // The server route (server.py): /lib/<id>/att/<basename>, resolved there
  // STRICTLY by store lookup — the id must exist and the basename must be
  // an exact member of the item's attachments list.
  function attachmentUrl(itemId, rel) {
    return '/lib/' + encodePathPart(itemId) + '/att/' +
      encodePathPart(attachmentBasename(rel));
  }

  function decodePercent(target) {
    try { return decodeURIComponent(target); } catch (e) { return target; }
  }

  // One raw reference target -> folded basename, or '' when it is not a
  // local image (web URLs, non-image extensions) — study_lib._ref_basename.
  function refKey(target) {
    target = String(target == null ? '' : target).trim();
    if (!target || target.indexOf('://') !== -1) { return ''; }
    var name = foldName(target.replace(/\\/g, '/').split('/').pop().trim());
    var dot = name.lastIndexOf('.');
    var ext = dot === -1 ? '' : name.slice(dot);
    return IMAGE_EXTS.indexOf(ext) === -1 ? '' : name;
  }

  function attachmentsOf(item) {
    return (item && Array.isArray(item.attachments)) ? item.attachments : [];
  }

  // folded basename -> stored rel path (first occurrence wins).
  function attachmentIndex(item) {
    var index = {};
    attachmentsOf(item).forEach(function (rel) {
      var key = foldName(attachmentBasename(rel));
      if (!(key in index)) { index[key] = rel; }
    });
    return index;
  }

  // 26-05 UAT (the owner): a body reference may be written under a vault-prefixed
  // name (<note-stem>_<n>_<original>.jpg) while the stored attachment kept its
  // bare <original>.jpg — study_lib.scan_attachments folds the two together on
  // import, so the reader resolves the same way. True when the stored basename
  // `name` is what reference `key` points at: an exact fold match, or `name`
  // is a separator-boundary SUFFIX of `key`.
  function refPointsAt(key, name) {
    if (!key || !name) { return false; }
    if (key === name) { return true; }
    if (key.length <= name.length) { return false; }
    if (key.slice(-name.length) !== name) { return false; }
    // the clipper prefix separator is always '_' (<note-stem>_<n>_<original>);
    // requiring it keeps a short tail like "11.jpg" from matching mid-token
    // inside "...13-16-11.jpg" (where the preceding char is '-').
    return key.charAt(key.length - name.length - 1) === '_';
  }

  // Resolve a folded reference key to a stored rel path: an exact index hit
  // first, else the LONGEST stored basename that is a boundary-suffix of the
  // key (deterministic when several attachments share a tail).
  function resolveAttachment(index, key) {
    if (!key) { return null; }
    if (index[key]) { return index[key]; }
    var best = null;
    Object.keys(index).forEach(function (name) {
      if (refPointsAt(key, name) && (!best || name.length > best.length)) {
        best = name;
      }
    });
    return best ? index[best] : null;
  }

  // Collect the folded basenames the body references (wikilinks + local
  // markdown images, %-decoded) — study_lib.extract_image_refs, ported.
  function bodyRefKeys(md) {
    var refs = {};
    var body = String(md == null ? '' : md);
    body.replace(WIKILINK_IMG_RE, function (whole, target) {
      var key = refKey(target);
      if (key) { refs[key] = true; }
      return whole;
    });
    body.replace(MD_IMG_RE, function (whole, alt, target) {
      var key = refKey(decodePercent(target));
      if (key) { refs[key] = true; }
      return whole;
    });
    return refs;
  }

  // Rewrite body image references that match an attached picture into
  // standard markdown images over the attachment route, so marked renders
  // them inline at their original positions. Wikilinks and local markdown
  // images both rewrite (the same two forms study_lib.extract_image_refs
  // reads); anything unmatched stays byte-for-byte as saved (verbatim law).
  function rewriteAttachmentRefs(item, md) {
    var index = attachmentIndex(item);
    var out = String(md == null ? '' : md);
    out = out.replace(WIKILINK_IMG_RE, function (whole, target) {
      var rel = resolveAttachment(index, refKey(target));
      return rel ? '![](' + attachmentUrl(item.id, rel) + ')' : whole;
    });
    out = out.replace(MD_IMG_RE, function (whole, alt, target) {
      var rel = resolveAttachment(index, refKey(decodePercent(target)));
      return rel ? '![' + alt + '](' + attachmentUrl(item.id, rel) + ')' : whole;
    });
    return out;
  }

  // The attached pictures the body never references, in natural filename
  // order (_1 before _2 before _10 — numeric-aware compare) — the reader
  // trails these after the body as plain undecorated images.
  function unreferencedAttachments(item, md) {
    var atts = attachmentsOf(item);
    if (!atts.length) { return []; }
    // referenced = an exact body-ref hit OR a boundary-suffix match (the same
    // vault-prefixed-embed / bare-file reconciliation the rewrite resolves);
    // a picture the resolver places inline must never also trail as unref.
    var refKeyList = Object.keys(bodyRefKeys(md));
    return atts.filter(function (rel) {
      var name = foldName(attachmentBasename(rel));
      return !refKeyList.some(function (k) { return refPointsAt(k, name); });
    }).sort(function (a, b) {
      return attachmentBasename(a).localeCompare(
        attachmentBasename(b), undefined, { numeric: true });
    });
  }

  // ---- F-03 (owner ruling 2026-08-14): the wall of text ----------------------
  //
  // A screenshot note is one unbroken run. The reader that produced it returns
  // NO line breaks at all — 0 of 13,453 cached readings contains one — so the
  // machine-read text arrives as a single paragraph however long it is.
  //
  // ⚠ THE HEADLINE IS BIGGER THAN THE PROBLEM, AND THE THRESHOLD IS WHY THIS
  // FUNCTION IS NARROW. Measured over her 3,067 notes: median length 338
  // characters, p90 849, and only 156 notes (5.1%) carry a block over 1,000.
  // A 338-character note IS a paragraph; breaking it would invent a structure
  // that is not in the text. So a block under RUN_SPLIT_MIN is returned byte
  // for byte and the great majority of notes are never touched at all.
  //
  // ⚠ DISPLAY TIME ONLY, AND LOSSLESS BY CONSTRUCTION. Nothing here writes.
  // The ONLY characters this can drop are WHITESPACE already sitting between
  // two sentences, replaced by the paragraph break; every other character
  // survives in order. Cuts are taken at two provably safe places: after CJK
  // sentence punctuation (which normalizeWords tokenises on its own), and at
  // latin sentence punctuation that is ALREADY followed by whitespace
  // (whitespace for whitespace). A cut is never taken where it would have to
  // insert a break between two characters that are currently touching.
  //
  // ⚠ IT DECLINES STRUCTURE, NOT LINE BREAKS, AND THE DIFFERENCE IS 183 OF THE
  // ~200 LONG BLOCKS. A first draft skipped any block containing a newline —
  // which threw away almost the whole population, because markdown renders a
  // SINGLE newline as a space: a two-line block of plain prose is still one
  // unbroken paragraph on screen, and is exactly the wall this exists for. So
  // the test is for markers markdown actually honours, checked on EVERY line
  // rather than only the first: a list, quote, heading, table or fence. A
  // block carrying one of those already has a shape and this function has no
  // opinion about it. Combined with the caller's bodyGuards check, a note this
  // cannot lay out safely simply renders as it does today.
  var RUN_SPLIT_MIN = 900;      // shorter than this and a block is a paragraph
  var RUN_SPLIT_TARGET = 380;   // aim for paragraphs about this long
  var STRUCTURED_OPEN_RE = /^\s{0,3}(?:[-*+>#|]|\d+[.)]|```|~~~)/;
  // A CJK terminator plus any whitespace after it, OR a latin terminator that
  // is already followed by whitespace. Nothing else is a cut point.
  var SENTENCE_CUT_RE = /[。！？][\s\u3000]*|[.!?][\s\u3000]+/g;

  function hasStructuredLine(block) {
    var lines = String(block).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (STRUCTURED_OPEN_RE.test(lines[i])) { return true; }
    }
    return false;
  }

  function splitRun(text, target) {
    var out = [];
    var start = 0;
    var m;
    SENTENCE_CUT_RE.lastIndex = 0;
    while ((m = SENTENCE_CUT_RE.exec(text)) !== null) {
      var keepTo = m.index + 1;              // the terminator stays put
      var nextAt = m.index + m[0].length;    // the next sentence begins here
      if (nextAt >= text.length) { break; }  // never cut a trailing terminator
      if (keepTo - start >= target) {
        out.push(text.slice(start, keepTo));
        start = nextAt;
      }
    }
    out.push(text.slice(start));
    return out.filter(function (x) { return x.trim() !== ''; });
  }

  function splitLongRuns(md) {
    var src = String(md == null ? '' : md);
    var blocks = src.split('\n\n');
    var touched = false;
    var out = blocks.map(function (block) {
      if (block.length < RUN_SPLIT_MIN) { return block; }
      if (hasStructuredLine(block)) { return block; }
      var parts = splitRun(block, RUN_SPLIT_TARGET);
      if (parts.length < 2) { return block; }
      touched = true;
      return parts.join('\n\n');
    });
    // Byte-identical out when nothing qualified — the caller compares by
    // identity to decide whether anything happened at all.
    return touched ? out.join('\n\n') : src;
  }

  // ---- F-02 (owner ruling 2026-08-14): the repeat at a seam ------------------
  //
  // Two screenshots of one scroll overlap, so the shared words appear twice in
  // the merged note. Measured on her library: 376 seams, 203 repeating 20+
  // characters, 42 repeating 80+, the worst a 539-character paragraph said
  // twice.
  //
  // ⚠ SHE RULED "SHOW IT, BUT QUIETLY", AND THAT RULING IS WHAT KEEPS LAW 4
  // INTACT. Removing the second copy is TRUNCATION of resurfaced content,
  // which law 4 forbids in so many words — it would have needed an amendment
  // the way the photo resize did. Dimming removes nothing: every character is
  // still on screen and still selectable, it is simply drawn faintly so the
  // eye skips it. This function therefore only ever REPORTS where a repeat
  // is; it never edits anything.
  //
  // ⚠ THE OVERLAP IS LOOKED FOR AT THE SEAM ONLY — the TAIL of one section
  // against the HEAD of the next. A screenshot repeats the bottom of the
  // previous screen at its top; two identical sentences in different parts of
  // a long note are her words twice, not a capture artefact, and must not be
  // dimmed.
  //
  // ⚠ AND A SHORT ECHO IS NOT A REPEAT. Below SEAM_REPEAT_MIN a match is as
  // likely to be an ordinary phrase ("in the morning") as an overlap, and
  // dimming those would put grey patches through her prose for no reason.
  var SEAM_REPEAT_MIN = 20;   // shorter than this is a coincidence
  var SEAM_WINDOW = 600;      // how far into each side of a seam to look

  function longestCommonRun(a, b) {
    // Plain dynamic programming over the two windows. Returns {aAt, bAt, len}
    // for the longest run they share; len 0 when they share nothing.
    var best = { aAt: 0, bAt: 0, len: 0 };
    if (!a.length || !b.length) { return best; }
    var prev = new Array(b.length + 1);
    var cur = new Array(b.length + 1);
    var j;
    for (j = 0; j <= b.length; j++) { prev[j] = 0; }
    for (var i = 1; i <= a.length; i++) {
      cur[0] = 0;
      for (j = 1; j <= b.length; j++) {
        if (a.charAt(i - 1) === b.charAt(j - 1)) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > best.len) {
            best = { aAt: i - cur[j], bAt: j - cur[j], len: cur[j] };
          }
        } else {
          cur[j] = 0;
        }
      }
      var swap = prev; prev = cur; cur = swap;
    }
    return best;
  }

  // sections -> per seam, WHERE in the next section its repeat of the previous
  // one begins and how long it is: {at, len}. len 0 when there is nothing
  // worth dimming. Index i describes sections[i + 1].
  //
  // ⚠ THE REPEAT DOES NOT START AT CHARACTER ZERO, AND REQUIRING THAT FOUND
  // ALMOST NOTHING. A first draft only accepted a run beginning exactly at the
  // section head; on her library that matched 24 of the 203 real overlaps.
  // Measured, the median repeat begins 77 characters in — because the next
  // screenshot leads with its OWN status bar and chrome before the shared
  // words start. The seam WINDOW is the real constraint here: a long run
  // shared between the end of one screen and the beginning of the next is a
  // capture overlap wherever inside that window it falls.
  function seamRepeats(sections) {
    var out = [];
    for (var i = 0; i + 1 < sections.length; i++) {
      var tail = String(sections[i]).slice(-SEAM_WINDOW);
      var head = String(sections[i + 1]).slice(0, SEAM_WINDOW);
      var run = longestCommonRun(tail, head);
      // ⚠ THE TEXT ITSELF TRAVELS, NOT ONLY THE OFFSET. Markdown rendering
      // drops syntax, so a character offset taken in the SOURCE does not
      // survive into the rendered note; the substring does, and the reader
      // finds it by searching rather than by counting.
      out.push(run.len >= SEAM_REPEAT_MIN
        ? { at: run.bAt, len: run.len,
            text: String(sections[i + 1]).slice(0, SEAM_WINDOW)
              .substr(run.bAt, run.len) }
        : { at: 0, len: 0, text: '' });
    }
    return out;
  }

  // ---- reading-first reformatting (26.88-01) ---------------------------------
  //
  // Display-time layout only. NOTHING in this section writes, opens for
  // writing, renames, or deletes any file: the vault note on disk stays byte
  // for byte the note she saved (SC-6 / D-11). Everything here obeys the
  // module contract at the top of this file — pure, no DOM, no clock, no
  // randomness — so the whole spine is node-testable without a browser.
  //
  // The shape, and why it is two functions and not one: structureBody does
  // the transform, wordsPreserved re-checks it. wordsPreserved is a
  // DELIBERATELY INDEPENDENT straight-line re-check — it never reuses
  // structureBody's zone map and never calls back into it, exactly as
  // guardSurface refuses to call itemExcluded above. A bug in the transform
  // must not be able to hide itself inside its own verifier (D-04).

  // 26.88-01 (D-07.4a, 2026-07-31): the two heading texts the owner's OWN
  // tooling writes into her notes — `## Related`, written by vault_linker.py
  // inside its %% auto-links:start/end %% markers, and a trailing
  // `## Comments`, written by clippings-processor. Neither is AUTHOR
  // structure, so neither disqualifies a note from being laid out.
  // A THIRD ENTRY MUST BE ADDED HERE DELIBERATELY: read literally, D-07.4
  // leaves 71 of 2,945 live notes eligible and the whole phase ships inert.
  // Compared case-folded against a heading's own text.
  var TOOLING_HEADINGS = ['related', 'comments'];

  // 26.88-01 (D-06, 2026-07-31): the vault folders whose bodies are the
  // owner's OWN prose. This is the SECOND signal beside the note's own
  // `source:` value, and since 26.88-10 (D-19) that is ALL it is: it covers
  // notes that DO carry a frontmatter block but name no personal source.
  // Notes with NO block at all are no longer this roster's job — they are
  // covered by the absent-frontmatter branch in isPersonalNote below, which
  // needs no roster entry and no adapter to be remembered. Matched WHOLE and
  // case-folded against the item's stored folder facet, never as a prefix.
  // A NEW OWNER-OWNED FOLDER MUST BE ADDED HERE DELIBERATELY — this roster
  // is what keeps law 4 absolute exactly where it matters most.
  var FOLDER_PERSONAL = ['journal', 'journals', 'personal kb',
    'random ideas', 'reading notes and casual writing', 'work kb'];

  // The one `source:` value that means "she wrote it" (D-06). Compared with
  // EXACT equality, never a prefix and never a substring: the live corpus's
  // source field holds raw URLs, `personal-notes`, and even a wikilink.
  var PERSONAL_SOURCE = 'personal';

  // 26.88-01 (D-03): the two conservative size bounds. A label longer than
  // LABEL_MAX_CHARS codepoints is prose that happens to contain a colon, not
  // a section label; a run whose segments are all longer than
  // ITEM_MAX_CHARS is a sentence with dashes in it, not a list. Both are
  // deliberately tight — D-03 forbids splitting running prose on a guess.
  var LABEL_MAX_CHARS = 24;
  var ITEM_MAX_CHARS = 40;

  // 26.88-01 (D-03, measured against the live corpus 2026-07-31): the
  // separator set. The FULLWIDTH PROSE COMMA `，` is DELIBERATELY
  // ABSENT — it was measured at 75,400 occurrences across the corpus and is
  // the ordinary Chinese sentence comma, so splitting on it would shred
  // running prose. This omission is measured, not overlooked.
  var RUN_SEPARATORS = ['、', '・', '•', ' - ', ' – '];

  // 26.88-03 (D-03/D-03a): the run threshold. A marker seen ONCE is
  // decoration — a single 📍 mid-sentence, a lone ✅ at the end of a
  // recommendation, one "1." that is an ordinary list item. It is a RUN of
  // markers that is the author saying "these are items". Two is the smallest
  // run that reads as a list, and it is the number the corpus supports: the
  // 35 pin-marked notes and the 25 emoji-numeral recipe notes all carry three
  // or more markers, so two leaves headroom without ever firing on a lone
  // decorative glyph.
  //
  // THIS NUMBER DECIDES WHETHER THE D-03a PIN SIGNAL FIRES AT ALL, which is
  // why it is a named exported constant on the same footing as
  // LABEL_MAX_CHARS and ITEM_MAX_CHARS and never a literal buried in a
  // regex: raise it and the 35 pin-marked notes silently stay walls; drop it
  // to 1 and a single decorative pin starts splitting running prose, which
  // D-03 forbids.
  var MARKER_RUN_MIN = 2;

  // 26.88-03 (D-03a, owner amendment 2026-07-31): the emoji section markers
  // of the PIN CLASS. 35 real notes are structured as a run of pin-marked
  // sections; the poster case is a verified single 2,044-character line.
  // Written through fromCodePoint so the source stays reviewable in ASCII
  // while the comment carries the glyph.
  // A THIRD GLYPH MUST BE ADDED HERE DELIBERATELY — this roster is the whole
  // definition of "the pin class", and a silent addition would start
  // restructuring notes nobody measured.
  var PIN_MARKERS = [
    String.fromCodePoint(0x1F4CD),   // 📍 round pushpin — the 35-note shape
    String.fromCodePoint(0x1F4CC)    // 📌 pushpin — the same class, same use
  ];

  // 26.88-03 (D-03a): the FULLWIDTH VERTICAL LINE used as a label separator.
  // 6 real notes use it, and it co-occurs with the pin marker in the same
  // poster case. It is never a list separator and never splits a section: it
  // stays INSIDE the promoted heading, because the position label on its left
  // and the place name on its right are both the author's own words.
  //
  // After Unicode compatibility normalisation (NFKC) this folds to the ASCII
  // pipe — which is exactly why it must never be applied inside a table zone,
  // where a pipe is structure. The zone map runs first for that reason.
  var LABEL_BAR = String.fromCharCode(0xFF5C);   // ｜

  // 26.88-03 (D-03): the checkmark family. A repeated checkmark is the
  // author marking points, not writing prose.
  var CHECK_MARKS = ['✅', '✔', '☑'];        // ✅ ✔ ☑

  // 26.88-03 (D-03): the bullet-CHARACTER family, as item markers at the
  // start of consecutive lines. The katakana middle dot and the bullet glyph
  // are the two the corpus actually uses; the filled circle and small square
  // ride along because they are the same gesture.
  var BULLET_GLYPHS = ['・', '•', '●', '▪'];  // ・ • ● ▪

  // ...and the same family used INLINE, where a hyphen or an en dash between
  // spaces is also an item marker (D-03 names `-` explicitly). The FULLWIDTH
  // PROSE COMMA is absent here for the same measured reason it is absent from
  // RUN_SEPARATORS: 75,400 occurrences across the live corpus as ordinary
  // sentence punctuation.
  var BULLET_MARKS = BULLET_GLYPHS.concat([' - ', ' – ']);

  // 26.88-11 (D-13, measured against the live corpus 2026-08-01): A LINE WHOSE
  // WHOLE CONTENT IS WRAPPED IN ONE EMPHASIS DELIMITER IS A CAPTION, AND A
  // CAPTION IS HANDS-OFF.
  //
  // `*图：…*` is the caption convention the `clippings-processor` skill writes
  // into every image-bearing clipping in this vault. Measured over the
  // eligible pool: 687 `*图` caption lines, exactly 3 bold-wrapped lines and 0
  // underscore-wrapped lines — plus 3,603 sibling `> 图：…` blockquote lines
  // that already sat inside D-07.2's zone and never reached the colon rule at
  // all. The convention is the common case, not an edge case.
  //
  // This is the same gesture D-07 already makes: a line whose whole job is ONE
  // construct is hands-off, exactly as an image line and a fence line are.
  //
  // THE COST IS NAMED RATHER THAN HIDDEN: those 3 bold-wrapped lines stop
  // being promotable. That is the whole price of the caption fix, it was
  // measured before the fix was written, and T14f pins it as a test so it
  // never turns up later as a surprise.
  //
  // The SAME delimiter must open and close, at BOTH ENDS of the line, with no
  // whitespace immediately after the opener and only horizontal whitespace
  // outside the pair. A half-open `*图：…` is ordinary prose the other rules
  // may still refuse on their own terms; `* 图：…` is a list item; `_…*` is
  // two different delimiters and is neither.
  //
  // ADD A DELIMITER HERE DELIBERATELY — this alternation is the whole
  // definition of "wholly emphasized", and widening it silently would take
  // more lines out of every signal rule at once.
  var WHOLLY_EMPHASIZED_RE = /^[ \t]*(\*\*|\*|__|_)(?!\s)[\s\S]*\1[ \t]*$/;

  // 26.88-11 (Q5): THE INLINE-SPAN ROSTERS. Three of them, because the three
  // do different jobs and conflating them is how a guard starts tripping on
  // what a refusal permits. They are exported BY NAME because `openSpanAt`
  // here, `markupPreserved` in plan 12 and the D-15 split refusal in plan 13
  // must all read the SAME sets — three spellings of one roster is the
  // one-rule-many-callers drift this phase has now paid for twice.

  // SYMMETRIC delimiters: the same string opens and closes, so "inside" is a
  // PARITY question. LONGEST FIRST WITHIN EACH FAMILY, and that ordering is
  // load-bearing: consume `**` before `*` or one bold pair is double-counted
  // as two italic ones.
  //
  // `%%` IS LOAD-BEARING AND MUST NOT BE DROPPED as "the renderer deletes it
  // anyway". It is the ONLY construct in this roster that catches F-1 at the
  // `structureBody` seam, and dropping it would regress plan 12's invariant to
  // catching two defects of the three this phase has actually found.
  //
  // ADD ME DELIBERATELY.
  var INLINE_MARKS = ['%%', '```', '**', '*', '__', '_', '~~', '`'];

  // ASYMMETRIC open/close pairs: "inside" is a DEPTH question. Used for BOTH
  // span detection here and (plan 12) pair counting, so a member added here
  // changes both rules at once — which is the point.
  var INLINE_PAIRS = [['[[', ']]'], ['[', ']'], ['(', ')'], ['（', '）'],
    ['{', '}'], ['「', '」'], ['《', '》']];

  // SPAN DETECTION ONLY — NEVER PAIR COUNTING, and the reason is arithmetic
  // rather than taste: `![x]` nests inside `[x]`, so counting both would
  // double-count every image embed and make the invariant trip on notes
  // nothing happened to. The curly quotes are not markdown constructs at all;
  // they are span-like purely so a promotion or a split is refused inside
  // Chinese quoted speech (measured: 11 D-15 split points sit inside `“…”`,
  // and inline `[[…]]` / `![[…]]` image embeds account for 30 more — which
  // `structureBody`'s LINE-ANCHORED `/^\s*!\[/` image branch does not cover).
  var SPAN_ONLY_PAIRS = [['![', ']'], ['“', '”'], ['‘', '’']];

  // ---- 26.88-13 (D-15 / D-20): THE SENTENCE-BOUNDARY BREAK ------------------
  //
  // The ONE rule in this phase that acts on a wall carrying no explicit author
  // marker. It inserts a PARAGRAPH BREAK between sentences inside a run over a
  // length threshold. No heading, no bullet, no reordering, no word moved,
  // added, removed or changed — a blank line is the entire intervention.
  //
  // It rewrites D-03's LETTER ("never split running prose on a guess") but not
  // its spirit: sentence-final punctuation IS author signal, and it is the only
  // signal these walls carry. D-03's marker-run, colon and ordinal rules are
  // otherwise unchanged, and this rule runs LAST, behind all of them.

  // THE THRESHOLD (D-20, owner call 2026-08-01). A named exported constant on
  // exactly the footing LABEL_MAX_CHARS and MARKER_RUN_MIN already set: a
  // threshold is never a literal buried in a condition, because a buried number
  // is one nobody can find, re-measure or argue with.
  //
  // MEASURED AT 600 over the eligible pool: 54 notes reached, 46 of which the
  // fixed deterministic rules do not touch at all, the biggest free-prose block
  // HALVED on 38, median remaining share 21%, and 6 notes left with a block
  // still over the threshold. For comparison the shipped deterministic rules
  // halve it on 1 of 86. (Those figures are the pre-plan-10 pool of 536; the
  // live pool is 384 since D-19 and the shipped figures are lower and recorded
  // in 26.88-13-SUMMARY.md.)
  //
  // MEASURED AT 400, AND DELIBERATELY NOT TAKEN: 86 reached / 55 halved. It
  // starts breaking blocks a reader may never have experienced as a wall, and
  // every newly-touched note is a note that renders differently from how she
  // saved it. p90 of the free-prose block distribution is 628, so 600 is where
  // a block is unambiguously a wall on a phone-width surface. Conservative-rules
  // DNA and "loveable over complete" point the same way.
  //
  // WIDENING LATER IS A ONE-LINE CHANGE PLUS A RE-MEASURE. That promise is
  // D-20's, it is on the record, and `opts.sentenceBreakMin` below is what
  // keeps the re-measure half of it true.
  var SENTENCE_BREAK_MIN = 600;

  // THE TERMINATOR SET. Both halves are measured.
  //
  // The ASCII half roughly DOUBLES the rule's reach, because about a third of
  // this pool is English — leaving `.!?` out would have halved the rule for no
  // safety gain, since the ASCII guards below are what make it safe, not the
  // absence of the characters.
  //
  // `；` AND `…` ARE DELIBERATELY ABSENT: measured at +0 reach, and every
  // character in this set is a false-positive SURFACE. Smaller rule, fewer
  // shapes to get wrong. Same shape as RUN_SEPARATORS's measured omission of
  // the fullwidth prose comma. ADD A CHARACTER HERE DELIBERATELY, with a
  // re-measure.
  var SENTENCE_ENDERS = '。！？.!?';

  // The closed abbreviation roster. An ASCII full stop closing one of these is
  // not a sentence end even though whitespace follows it, which is the only
  // reason the whitespace guard alone is not enough. Measured at 6 occurrences
  // of the 1,304 candidate split points in the library — small, and that is the
  // point: a long roster would start refusing real sentence ends.
  // ADD ME DELIBERATELY.
  var SENTENCE_ABBREVIATIONS = ['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs',
    'etc', 'eg', 'ie', 'approx', 'fig', 'no', 'vol', 'inc', 'ltd', 'jr', 'sr',
    'min', 'max', 'hr'];

  // Closing punctuation that may ride WITH a terminator into the sentence it
  // ends. Chinese quoted speech closes `。”` INSIDE the quote, so the break
  // belongs after the closer or the quotation mark is orphaned at the head of
  // the next block.
  var SENTENCE_CLOSERS = '」』”"’\')）]】》';

  // Built once from the roster above so the roster stays the single spelling.
  var SENTENCE_ABBR_RE = new RegExp('(?:^|[^\\p{L}])(' +
    SENTENCE_ABBREVIATIONS.join('|') + ')\\.$', 'iu');

  var SENTENCE_SPACE_RE = /[\s　]/;
  var SENTENCE_DIGIT_RE = /[0-9]/;

  // 26.88-20 (F-12): the two bounds `splitsOrdinalEnumerator` reads. They live
  // here beside the other sentence-rule character classes rather than inside
  // the predicate so the whole set of "what the sentence rule considers a
  // digit, a space, a word" is readable in one place. Both are named at the
  // predicate's own comment, which also names the two OTHER spellings of the
  // 1-3-digit bound in this file and why they are not collapsed into this one.
  var ORDINAL_ENUMERATOR_MAX_DIGITS = 3;
  var ORDINAL_ENUMERATOR_WORD_RE = new RegExp('[\\p{L}\\p{N}]', 'u');

  // 26.88 code review WR-03: the two rosters the "does this numeral OPEN an
  // item?" test reads. A clause opener is a full stop or a colon in either
  // width; a list marker is what may sit between a line start and the numeral.
  // Named here beside the digit and word classes for the reason those are —
  // so the whole of "what the sentence rule considers an enumerator" is
  // readable in one place.
  var ORDINAL_CLAUSE_OPENER_RE = /[.。！？!?：:；;]/;
  var ORDINAL_LIST_MARKER_RE = /[-*+>#]/;

  // 26.88-03 (vault CLAUDE.md § "Body Readability" RULE 10, verbatim: "Don't
  // add headers if the post is short — for posts under ~5 short lines, skip
  // the headers, just clean up line breaks"). D-03 enumerates rule 3's
  // signals but not rule 10's suppressor; this is it.
  //
  // BOTH halves of the vault rule are load-bearing: "under ~5" AND "short".
  // A count alone would suppress the phase's own headline case, which is ONE
  // line of 79 characters — a 小红书 wall is a short LINE COUNT and a long
  // line, and it is exactly the note this phase exists to break open. So a
  // body is "short" only when every non-blank line is also short, measured
  // against ITEM_MAX_CHARS (the same "this is an item, not a paragraph"
  // bound the run rules use — deliberately reused rather than introducing a
  // fourth length number nobody could calibrate).
  //
  // Corpus support: the median longest paragraph in the eligible pool is 294
  // characters, so the notes this phase is FOR are long-lined and unaffected,
  // and the suppressor lands where rule 10 aimed it — the genuinely brief
  // post that a heading would make fussier rather than clearer.
  //
  // Suppression hides HEADERS only. Marker-run bullet conversion still
  // applies, because rule 10 says "just clean up line breaks".
  var SHORT_POST_LINES = 5;

  // 26.88-03: the size ceiling. Above it the body is returned exactly as
  // saved, with no transform and no exception — law-4-safe by construction,
  // because the original is always a valid answer (the same fail-safe posture
  // the D-04 guard takes when it trips).
  //
  // Measured basis (26.88-RESEARCH § Security Domain, the denial-of-service
  // row): the whole live library took 2,949 ms for a full two-sided tokenize
  // and compare, the worst SINGLE note took 66 ms, and the largest PARAGRAPH
  // is 7,584 characters on one line.
  //
  // MEASURED AGAINST THE LIVE LIBRARY, 2026-08-01, in this constant's own unit
  // (see the code-unit note below). Plan 03 first set this to 262,144 (256Ki)
  // and recorded that it was "orders of magnitude above any note in the
  // library today, so NO LIVE NOTE IS EXCLUDED BY IT". THAT WAS FALSE, and it
  // was written as an assumption because the executor had no shell to check
  // it. The real numbers, over 3,132 items:
  //
  //     largest note   1,070,585 code units      (4x the old ceiling)
  //     over 256Ki            68 items (2.2%)
  //     median             3,536 code units
  //
  // So the old ceiling silently excluded the 68 longest notes in the library —
  // exactly the walls of text this phase exists to make readable. The plan's
  // own acceptance criterion says this constant "is strictly greater than the
  // largest note in the current live library"; 256Ki did not meet it.
  //
  // Set to 2,097,152 (2Mi): ~2x the largest live note, so the whole corpus is
  // covered with real headroom. Cost measured directly on the ten largest live
  // notes with the ceiling lifted — the 1,070,585-unit note transforms in
  // 21 ms and word-preservation holds; the curve is linear at roughly 19 us
  // per KiB, so the worst case AT this ceiling is ~41 ms for a one-shot render
  // on open. That is inside SC-3's "instantly and always" and nowhere near a
  // stall. Raise this only with a fresh measurement; do NOT raise it to
  // unbounded, which is the whole point of having it.
  //
  // What it still closes is the future: an adapter importing large transcripts
  // is the input nobody has measured, and an unbounded input is the only way a
  // linear-time transform still becomes a stall in a reading surface.
  //
  // Counted in UTF-16 code units — the only length a pure browser+node module
  // has without allocating an encoder on every render. For the CJK-heavy
  // corpus that under-counts UTF-8 bytes (3 bytes per CJK character, 1 code
  // unit), so the effective ceiling is generous rather than tight; the
  // time-budget fixture pins the real cost.
  var MAX_REFORMAT_BYTES = 2097152;

  // ---- the renderer's own scaffolding transform (26.88-12, Q4) ---------------
  //
  // MOVED HERE FROM app.js:21/26/40 BY 26.88-12 (Q4), unchanged in behaviour.
  // All three are pure — no DOM, no clock, no randomness, no I/O — so they
  // satisfy this module's contract at the head of the file unchanged, and
  // app.js keeps one-line delegating declarations so every one of its ~400
  // call sites stays byte-identical.
  //
  // WHY IT MOVED, and it is not tidiness. `cleanVaultMarkup` runs between
  // `structureBody` and `marked`: it is the LAST thing to touch a body before
  // the renderer sees it. While it lived in app.js — a browser file with no
  // module surface — no node suite could see what the renderer sees, so:
  //
  //   * D-14's inline-markup invariant could only ever be asserted on
  //     `structureBody`'s output, one transform short of the truth; and
  //   * F-1's VISIBLE symptom — `%% auto-links:start %%` promoted to
  //     `## %% auto-links`, which renders as an EMPTY `## ` heading once the
  //     `%%…%%` span is stripped — was invisible to all 47 green suites. The
  //     empty heading only exists AFTER this function runs. That is precisely
  //     why F-1 shipped.
  //
  // Note for the next reader: `normalizeWords` stage 1 below carries a SECOND
  // spelling of the `%%` rule (core.js:1083-1085 explains why — it is a
  // deliberately INDEPENDENT straight-line re-check and must not be collapsed
  // into a shared helper). The two now sit in one file where both can be read
  // at once, which is the most a deliberate duplication can be given.
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 26-05 UAT (the owner): render the note the way Obsidian renders it, not the
  // raw file. Obsidian HIDES its own %% … %% comments and makes [[wikilinks]]
  // clickable — showing the literal markup was a fidelity bug, not verbatim
  // fidelity. This only touches vault SCAFFOLDING syntax; prose is untouched.
  // ---- 26.88-20 (F-6b): THE HASHTAG CARVE-OUT ------------------------------
  //
  // OWNER DECISION OF RECORD, taken live on 2026-08-03 during the plan-20 UAT.
  // Her words: *"this hashtag is still really bother me, I think the original
  // note is the hyperlink or something similar, can you please remove it?"* —
  // and she was right about the cause. She was shown BOTH halves below and
  // their costs, and chose BOTH, knowingly.
  //
  // THIS IS A NAMED, NARROW CARVE-OUT IN THE VERBATIM CONTRACT (law 4) AND IT
  // IS WRITTEN DOWN AS ONE. Everywhere else in this module the rules only ever
  // move whitespace. This one DELETES CHARACTERS from the rendered body. It is
  // permitted because the owner decided it, it is bounded to the two shapes
  // below, and it is reversible: the `#` is removed from the RENDER only — the
  // file on disk is untouched, the library is untouched, and deleting this
  // function restores the previous rendering exactly.
  //
  // ONLY THE `#` IS EVER REMOVED. The word after it is HERS and survives, byte
  // for byte. That is what keeps the carve-out inside `wordsPreserved` rather
  // than needing a hole cut in it: `#` is already folded away by
  // `normalizeWords`'s DROP_PUNCT_RE, so `wordsPreserved(x,
  // stripHashtagMarkers(x))` is TRUE for every note in the live library —
  // MEASURED, not argued, by `tools/replan_probe.cjs`, which prints the count
  // of notes where it does not hold and whose floor is zero. A widening that
  // ate the WORD would trip that guard on its first note. THE GUARD IS NOT
  // LOOSENED ANYWHERE; the carve-out is required to satisfy it.
  //
  // ---- HALF 1: the link form. Free, and it is markup handling ---------------
  // `[#sanjose](https://www.rednote.com/search_result?keyword=sanjose&…)` is a
  // platform hashtag-SEARCH link, not prose. MEASURED over all 2,945 live text
  // notes on 2026-08-03: 27 such links across 9 notes, and every one of the 27
  // hrefs is a rednote search url. The label loses its leading `#` and NOTHING
  // else — the link, the href and the word all stay.
  //
  // ---- HALF 2: the bare form, and the predicate is a RUN -------------------
  // THE NAIVE PREDICATE IS REJECTED AND MUST NOT BE RE-PROPOSED. "A `#` glued
  // to a word character" matches 1,728 places in 672 notes, and the majority
  // are not hashtags. Measured, with what each tightening step drops:
  //
  //   1,728  # glued to a word character                       672 notes
  //     766  ...not preceded by a word char   (-962: `x.pdf#zoom=`, `page#frag`)
  //     561  ...outside CORE.handsOffSpans    (-205: fences, quotes, tables)
  //     450  ...outside an inline code span   (-111: `` `#applications-team` ``)
  //     214  ...next char a LETTER not a digit (-179: `#1`, `#266`, `#58`)
  //
  // AND 214 IS STILL ABOUT HALF FALSE POSITIVES, which is why the rule is not
  // any of those. Of the 214: 49 are SLACK CHANNEL NAMES in her HR evidence
  // files (`Slack Channel #bugs`, `#applications-team`) — stripping there
  // corrupts a legal record; ~30 are LinkedIn ATS markers in job postings
  // (`#LI-Remote`); 18 are ChatGPT transcripts (`3CE Tinted Eyebrow Mascara
  // #Brown` is a shade code). None of those is a platform hashtag.
  //
  // THE RULE THAT SEPARATES THEM: A PLATFORM HASHTAG NEVER TRAVELS ALONE. It
  // arrives in the tag block at the tail of a post — `#短发 #穿搭灵感 #fyp
  // #中性风` — while a Slack channel, a shade code, an issue ref and a colour
  // each sit ALONE inside a sentence. So the carve-out fires only on a RUN of
  // HASHTAG_RUN_MIN or more tags on ONE line, separated by inline whitespace
  // or directly adjacent. Measured: 111 `#` characters across 25 notes, of
  // which 6 (in 3 notes) are not from a social clipping and none of those 6
  // is harmful. Every Slack channel name, every hex colour, every issue ref,
  // every URL fragment and every shade code is outside it.
  //
  // TWO RESIDUALS ARE NAMED AND LEFT OPEN, because naming a residual is this
  // phase's discipline and hiding one is its recorded failure.
  //   R1: a LONE hashtag stays. Five notes carry a genuine single social
  //       hashtag (`#短发` on its own line, `#古早味`), and they keep it. The
  //       run rule cannot tell them from `Slack Channel #bugs` and refusing is
  //       the safe side of that boundary.
  //   R2: three notes lose a `#` that is not a social hashtag —
  //       `11f6836b2857a2fa`'s `#LI-AN1 #LI-Remote`, `6ed28533cc321622`'s
  //       `(#ClaudeCode #AIEngineering)`, and `f4be7d37cbb8223f`'s
  //       `tagged #artwork #创作`. All three read as tag blocks by shape.
  var HASHTAG_RUN_MIN = 2;

  // The href half of the LINK form. Narrow on purpose: it is not "any link
  // whose label starts with `#`", it is a hashtag-SEARCH url on the two hosts
  // that emit them. A `[#anchor](#section)` table-of-contents link is not one.
  var HASHTAG_SEARCH_HREF_RE = new RegExp(
    '^https?://(?:www\\.)?(?:rednote|xiaohongshu)\\.com/search_result\\b', 'i');

  // A hashtag TOKEN is `#`, then a LETTER, then a run of characters that are
  // none of: whitespace, another `#`, or CJK/ASCII sentence and bracket
  // punctuation.
  //
  // A DIGIT MAY NOT OPEN ONE, and this clause is LABELLED HONESTLY rather than
  // presented as load-bearing. Measured over the live library on 2026-08-03:
  // widening it to `[\p{L}\p{N}]` changes the carve-out's reach on ZERO notes,
  // because the RUN rule already refuses every `#1`, `#266` and `#58` in the
  // corpus — each of them sits alone in a sentence. It is SUBSUMED today, on
  // the same footing as the digit clause in `splitSentences`, and it is kept
  // because a rank list (`Try #1 #2 #3 in order`) is a run by shape and this
  // clause is the only thing that would refuse it. Its fence is a
  // PREDICATE-level fixture, not an output one — the first widening gauntlet
  // run for this carve-out found that mutating it left every output case
  // green, which is a false hole, and F6b-9 closes it.
  //
  // THE HEADING REFUSAL IS TWO CLAUSES, NOT ONE, and that is worth knowing
  // before anyone "simplifies" it: `# ` is refused both because a space is not
  // a letter AND because the tail below may not be empty. Neither alone can be
  // mutated into admitting a heading, which is why F6b-9 fences the pair at
  // the predicate directly.
  var HASHTAG_FIRST_RE = new RegExp('[\\p{L}]', 'u');
  var HASHTAG_TAIL_RE = new RegExp(
    '^[^\\s#，。、！？；：（）()\\[\\]{}<>"\'’”「」『』`|~*_\\\\/!,.?;:]+', 'u');

  // A hex colour by shape (`#fff`, `#e8503a`, `#FFE4A0`). It DECIDES NOTHING
  // on the live library today — measured 0 of 111, because every hex colour in
  // the corpus is inside a fence, an inline code span, or alone in prose and
  // therefore never in a run. It is kept and labelled honestly rather than
  // presented as load-bearing, on the same footing as the subsumed digit
  // clause in `splitSentences`: a two-colour palette line (`#fff #000`) IS a
  // hashtag run by shape, and that trap is worth closing before it is met.
  var HASHTAG_HEX_RE = new RegExp(
    '^[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1,5})?(?![\\p{L}\\p{N}_])', 'u');

  // 26.88 code review WR-02: THE LEFT BOUNDARY. A tag block opens at the start
  // of the document, after whitespace, or after punctuation. A `#` GLUED TO THE
  // PREVIOUS WORD is not a platform sigil — it is the separator she is relying
  // on, and deleting it welds two of her tokens into one. Measured over the
  // live library on 2026-08-04, BEFORE this clause existed: 13 of the run
  // half's 111 cuts had a non-whitespace character in front, and 9 of those 13
  // were a letter or a digit, i.e. a genuine weld. Observed on
  // `da5444ca2c71f64a`:
  //
  //   BEFORE "#日常文案 终于整理出文字版钩织图解啦#哈利波特分院帽#钩织图解#今日快乐今日发"
  //   AFTER  "#日常文案 终于整理出文字版钩织图解啦哈利波特分院帽钩织图解今日快乐今日发"
  //
  // WHY A GUARD ALONE WOULD NOT HAVE CAUGHT IT, and this is the load-bearing
  // part: `wordsPreserved` returns TRUE on that weld, because `normalizeWords`
  // tokenizes CJK per codepoint and is structurally blind to two Chinese words
  // running together. So the guard wired at the seam (see `renderSavedBody`)
  // and this clause are two different fixes for two different failures, and
  // neither one subsumes the other.
  //
  // WHY IT IS NOT THE FOUR-BRACKET LIST the review sketched: the four live
  // sites where the preceding character is `：`, `（`, `(` or `]` are NOT welds
  // — punctuation already separates the tokens — and refusing there would cost
  // the carve-out four sites for nothing. The class is "glued to a word", so
  // the test is a WORD CHARACTER and it is spelled once.
  //
  // IT IS ASKED PER MARK, NOT PER RUN. `玩的丰臣秀吉#太阁立志传5 #光荣游戏 #日本战国史`
  // is one run of three; the first mark is hers and stays, the two that follow
  // a space are the platform's and come off. F6b-6c/6d/6e fence all three
  // directions.
  var HASHTAG_GLUED_RE = new RegExp('[\\p{L}\\p{N}_]', 'u');

  // 26.88 code review IN-01: an ATX heading line, the same shape
  // `tools/replan_probe.cjs`'s own heading gate reads and the same one
  // `headingsBound` matches. Named once here and used by the run scan below.
  var ATX_HEADING_LINE_RE = /^[ \t]{0,3}#{1,6}([ \t]|$)/;

  // Where NEITHER HALF of the carve-out may reach. `handsOffSpans` is REUSED
  // rather than re-spelled — it is the same six zones `structureBody` keys on,
  // so a zone this module gains later is a zone this carve-out loses the same
  // day with no edit here. Two further span kinds are added because they are
  // zones `handsOffSpans` does not have and each one was MEASURED to decide
  // something (an inline code span decides 22 of the naive hits) or to close a
  // named trap (a bare URL carrying `#a #b`).
  //
  // 26.88 code review CR-01: THIS IS THE HALF THE TWO SHARE, AND IT IS SPLIT
  // OUT FOR ONE REASON. HALF 1 shipped with no zone check at all and deleted a
  // `#` from inside a blockquote, a fence and an inline code span while
  // LIBRARIAN.md told the owner it did not. The obvious repair — routing HALF 1
  // through `hashtagProtectedSpans` below — CANNOT WORK, and this comment
  // exists so nobody re-derives that patch: that map lists a markdown link as a
  // protected kind, so HALF 1 would find every one of its own hits inside a
  // zone and refuse all of them. HALF 1 answers to THIS function; HALF 2
  // answers to this function PLUS the markdown-link kind, exactly as it always
  // has. Fixture F6b-5b puts the link form in each zone AND keeps one outside
  // every zone, so neither a missing fence nor a fence that refuses everything
  // can pass.
  function hashtagZoneSpans(text) {
    var s = String(text == null ? '' : text);
    var spans = handsOffSpans(s);
    return pushMatchSpans(s, spans,
      [/`+[^`\n]*`+/g, /(?:https?:\/\/|www\.)[^\s)>\]"']+/g]);
  }

  // HALF 2's fence: the shared zones, plus a markdown link — the shape HALF 1
  // has already dealt with by the time HALF 2 runs, so HALF 2 declining it is
  // what keeps a link's `#` from being counted twice.
  function hashtagProtectedSpans(text) {
    var s = String(text == null ? '' : text);
    return pushMatchSpans(s, hashtagZoneSpans(s), [/\[[^\]\n]*\]\([^)\s]*\)/g]);
  }

  function pushMatchSpans(s, spans, kinds) {
    for (var k = 0; k < kinds.length; k++) {
      var re = kinds[k];
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(s)) !== null) {
        spans.push([m.index, m.index + m[0].length]);
        if (re.lastIndex <= m.index) { re.lastIndex = m.index + 1; }
      }
    }
    return spans;
  }

  // ONE spelling of "is this offset inside one of those spans", read by both
  // halves. Pure; never raises.
  function inSpans(spans, i) {
    for (var p = 0; p < spans.length; p++) {
      if (i >= spans[p][0] && i < spans[p][1]) { return true; }
    }
    return false;
  }

  // The end offset (exclusive) of the hashtag token starting at `i`, or -1.
  function hashtagTokenEnd(s, i) {
    if (s.charAt(i) !== '#') { return -1; }
    if (!HASHTAG_FIRST_RE.test(s.charAt(i + 1))) { return -1; }
    var m = HASHTAG_TAIL_RE.exec(s.slice(i + 1));
    return m ? i + 1 + m[0].length : -1;
  }

  // HALF 1'S EXACT REACH, as a list of `#` offsets — the same contract HALF 2
  // carries below, and it exists for the same reason: a gate must be able to
  // check WHERE it fires and not only WHETHER the output changed. Before the
  // 26.88 code review HALF 1 was an unconditional `String.replace` with no
  // offset list and no fence, and both absences hid the same defect.
  // Pure; never raises; a null body is the empty list.
  function hashtagLinkCuts(text) {
    var s = String(text == null ? '' : text);
    if (!s) { return []; }
    var zones = hashtagZoneSpans(s);
    var cuts = [];
    var re = /\[#([^\]\n]*)\]\(([^)\s]*)\)/g;
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(s)) !== null) {
      if (re.lastIndex <= m.index) { re.lastIndex = m.index + 1; }
      if (!HASHTAG_SEARCH_HREF_RE.test(m[2])) { continue; }
      var hash = m.index + 1;                   // the `#`, just after the `[`
      if (inSpans(zones, hash)) { continue; }
      cuts.push(hash);
    }
    return cuts;
  }

  // THE CARVE-OUT'S EXACT REACH, as a list of `#` offsets — exported so a gate
  // can check WHERE it fires rather than only WHETHER the output changed. A
  // count with no offset list is not accepted anywhere in this phase. Pure;
  // never raises; a null body is the empty list.
  function hashtagRunSpans(text) {
    var s = String(text == null ? '' : text);
    if (!s) { return []; }
    var protectedSpans = hashtagProtectedSpans(s);
    function guarded(i) { return inSpans(protectedSpans, i); }
    var cuts = [];
    var lines = s.split('\n');
    var at = 0;
    for (var l = 0; l < lines.length; l++) {
      var lineEnd = at + lines[l].replace(/\r$/, '').length;
      // 26.88 code review IN-01: A HEADING LINE IS SKIPPED WHOLE. The `# `
      // shape was already refused (a space is not a letter), but a heading
      // that CONTAINS a tag run was not: `# Todo #urgent #work` came out as
      // `# Todo urgent work`. The heading survived as a heading, so the damage
      // was small — but LIBRARIAN.md says "never to a heading" and that is the
      // copy the owner reads, so the code is corrected rather than the
      // promise. Measured: 0 live sites, which is why this costs nothing and
      // why it was invisible.
      if (ATX_HEADING_LINE_RE.test(lines[l].replace(/\r$/, ''))) {
        at += lines[l].length + 1;
        continue;
      }
      var i = at;
      while (i < lineEnd) {
        if (hashtagTokenEnd(s, i) === -1) { i++; continue; }
        var run = [];
        var cur = i;
        for (;;) {
          var end = hashtagTokenEnd(s, cur);
          if (end === -1) { break; }
          run.push(cur);
          var k = end;
          while (k < lineEnd && ' \t　'.indexOf(s.charAt(k)) !== -1) { k++; }
          if (k >= lineEnd) { break; }
          cur = k;
        }
        i = hashtagTokenEnd(s, run[run.length - 1]);
        if (run.length < HASHTAG_RUN_MIN) { continue; }
        for (var r = 0; r < run.length; r++) {
          if (guarded(run[r])) { continue; }
          if (HASHTAG_HEX_RE.test(s.slice(run[r] + 1))) { continue; }
          if (run[r] > 0 &&
              HASHTAG_GLUED_RE.test(s.charAt(run[r] - 1))) { continue; }
          cuts.push(run[r]);
        }
      }
      at += lines[l].length + 1;
    }
    return cuts;
  }

  // `s` with exactly the `#` characters at `cuts` deleted, and NOTHING else —
  // no word, no space, no punctuation, nothing re-joined or reordered. Both
  // halves emit an offset list and both are applied through this one function,
  // so "the carve-out removes the `#` and nothing else" is a property of the
  // code rather than of two separate replacements that happen to agree.
  function cutHashes(s, cuts) {
    if (!cuts.length) { return s; }
    var out = '';
    var at = 0;
    for (var i = 0; i < cuts.length; i++) {
      out += s.slice(at, cuts[i]);
      at = cuts[i] + 1;                       // the `#`, and nothing else
    }
    return out + s.slice(at);
  }

  // The carve-out itself. HALF 1 runs first, so a `[#tag](search-url)` has
  // already lost its `#` by the time HALF 2 looks at the text and can never be
  // counted twice. Pure: no DOM, no clock, no randomness, no I/O; never
  // raises; a null body is the empty string.
  function stripHashtagMarkers(md) {
    var s = String(md == null ? '' : md);
    if (!s) { return s; }
    s = cutHashes(s, hashtagLinkCuts(s));
    return cutHashes(s, hashtagRunSpans(s));
  }

  // 26.88 code review CR-02: THE HASHTAG CARVE-OUT IS NO LONGER CALLED HERE,
  // and its absence is the point. It shipped at the top of this function — the
  // last transform before `marked` and the only one that runs on every rendered
  // body — which put it DOWNSTREAM of `bodyGuards`, downstream of
  // `renderSavedBody`'s nine early returns, and downstream of the "show as
  // saved" toggle. So the one transform in this module that DELETES characters
  // was the one transform with no runtime guard and no off switch. It now runs
  // in `app.js renderSavedBody`, above the toggle and behind the same
  // wordsPreserved check every other transform answers to; see the comment
  // there for the measurement that chose that seam over this one.
  //
  // This function is therefore byte-faithful again on everything except the
  // `%%` comments and the wikilinks it has always rewritten, which is what lets
  // `bodyGuards` use it as a neutral comparison seam on BOTH sides.
  function cleanVaultMarkup(md) {
    var s = String(md == null ? '' : md);
    // Obsidian comments (incl. the vault-linker's %% auto-links:start/end %%)
    s = s.replace(/%%[\s\S]*?%%/g, '');
    // note wikilinks [[target]] / [[target|alias]] -> a clickable link. Image
    // embeds ![[…]] are already resolved upstream by rewriteAttachmentRefs;
    // the [^!] guard leaves any stray one alone.
    s = s.replace(/(^|[^!])\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      function (whole, pre, target, alias) {
        var text = escapeHtml((alias || target).trim());
        var key = escapeAttr(target.trim().split('/').pop());
        return pre + '<a href="#" class="wikilink" data-wiki="' + key +
          '">' + text + '</a>';
      });
    return s;
  }

  // ---- the D-04 normalizer's character classes -------------------------------
  //
  // Carried across from the phase's runnable prototype (26.88-norm-prototype
  // .cjs), which passed 14/14 designed cases with 0 false trips across all
  // 2,945 live notes. The ranges are the prototype's, written as \u escapes
  // so the source stays reviewable in ASCII. Three of these close false-trip
  // traps that were found by EXECUTING the prototype, not by reasoning:
  // keycap emoji-numerals, inline ordinal runs, and CJK per-codepoint
  // tokenisation. Do not re-derive them.

  // CJK / Kana / Hangul / fullwidth: compared PER CODEPOINT, because Chinese
  // has no spaces and a run-length token would hide a dropped character.
  var CJK_CHAR_RE = new RegExp('[　-〿㐀-䶿一-鿿' +
    '豈-﫿＀-￯぀-ヿ가-힯]');

  // A list-forming / label-forming punctuation set that separates the SAME
  // words either side of the transform. Dropped on BOTH sides, so promoting
  // a marked label into a heading is invisible to the compare.
  var DROP_PUNCT_RE = new RegExp('[!-/:-@[-`' +
    '{-~　-〿！-＠［-｠｛-･' +
    '‐-‧‰-⁞·•●▪・]', 'g');

  // Pictographs / arrows / variation selectors / joiners / BOM: bullets,
  // never words. Dropped on both sides.
  var DROP_SYMBOL_RE = new RegExp('[\\u{1F000}-\\u{1FAFF}\\u{2190}-\\u{2BFF}' +
    '\\u{FE00}-\\u{FE0F}\\u{20E3}\\u{200B}-\\u{200D}\\u{2060}\\u{FEFF}' +
    '\\u{2600}-\\u{27BF}]', 'gu');

  // A keycap emoji-numeral (a digit, an optional variation selector, and the
  // combining enclosing keycap) is a BULLET, never a word — the WHOLE
  // sequence including its digit is dropped, and it is dropped BEFORE NFKC
  // while the sequence is still intact. Without this, the D-03
  // emoji-numeral -> ordered-list transform loses a token on the after side
  // and the guard falsely trips on the phase's own headline case. Written
  // through the constructor so the two invisible codepoints are readable.
  var KEYCAP_RE = new RegExp('[0-9#*][\\uFE0F]?[\\u20E3]', 'g');

  // The ordered token list a word-preservation compare runs over: the note's
  // words, in order, with every scaffolding mark this phase may add or
  // remove folded away. Pure and total — a null input is the empty list, it
  // never throws (D-04).
  function normalizeWords(md) {
    var s = String(md == null ? '' : md);
    // stage 1 — Obsidian comments (the shipped cleanVaultMarkup rule)
    s = s.replace(/%%[\s\S]*?%%/g, ' ');
    // stage 2 — zone LINE MARKERS only. The CONTENT of a fenced block or a
    // blockquote is compared as words like everything else, so a character
    // changed inside a code fence still trips the guard.
    //
    // EVERY rule from here to the end of stage 4 is line-anchored (`^` under
    // the `m` flag) and so is a promise about ONE line. The indent class is
    // therefore [ \t] and NEVER \s: \s matches \r and \n, so `^\s{0,3}` reads
    // BACK across a line ending and the rule eats the line above. On CRLF the
    // blank line before a blockquote is exactly three whitespace characters
    // (\n\r\n), which is how `^\s{0,3}>` used to weld a quote onto a fence
    // close and delete both — taking the author's words out of the token
    // stream and blinding wordsPreserved to that whole region of the note.
    // Trailing classes are [ \t\r] for the same reason from the other side: on
    // CRLF a line ends `\r` before the `$`. Found by
    // tests/test_reformat_property.cjs seed 20260884; pinned as E11 in
    // tests/test_reformat_fixtures.cjs. Do not relax [ \t] back to \s.
    s = s.replace(/^[ \t]{0,3}>[ \t]?/gm, ' ');
    s = s.replace(/^[ \t]{0,3}(```|~~~)[^\n]*$/gm, ' ');
    // stage 3 — ATX markers only; the heading TEXT survives, because a
    // PROMOTED heading's words are the author's own.
    s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, ' ');
    s = s.replace(/^[ \t]{0,3}#{1,6}[ \t\r]*$/gm, ' ');
    // stage 4 — the six scaffolding sub-rules.
    // (a) an ordinal run marker ANYWHERE, not just at line start: D-03 turns
    //     an INLINE "1. ... 2. ..." run into a real ordered list, so the
    //     ordinal is scaffolding on both sides. The whitespace lookahead is
    //     what keeps `1.5 cups` intact.
    s = s.replace(
      new RegExp('(^|[^\\p{L}\\p{N}])(\\d{1,3}[.)])(?=[\\s\\u3000]|$)', 'gmu'),
      ' ');
    // (b) line-start list markers
    s = s.replace(/^[ \t]*([-*+]|\d{1,3}[.)])[ \t]+/gm, ' ');
    // (c) thematic breaks
    s = s.replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t\r]*$/gm, ' ');
    // (d) table separator rows, then every pipe
    s = s.replace(/^[ \t]{0,3}\|?[ \t:|-]{3,}\|?[ \t\r]*$/gm, ' ');
    s = s.replace(/\|/g, ' ');
    // (e) emphasis / strike / inline code marks
    s = s.replace(/(\*\*\*|\*\*|\*|___|__|_|~~|`)/g, ' ');
    // (f) wikilinks and markdown links reduce to their DISPLAY text
    s = s.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      function (whole, target, alias) {
        return ' ' + (alias != null ? alias : target) + ' ';
      });
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ');
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ');
    s = s.replace(/<https?:\/\/[^>]*>/g, ' ');
    // stage 5 — codepoint folding, in this exact order
    s = s.replace(KEYCAP_RE, ' ');   // BEFORE NFKC: the sequence is intact
    s = s.normalize('NFKC');         // fullwidth digits/latin fold to ASCII
    s = s.replace(DROP_SYMBOL_RE, ' ');
    s = s.replace(DROP_PUNCT_RE, ' ');
    s = s.replace(/ /g, ' ');   // the prototype's space fold
    // ...restated explicitly: a non-breaking space is whitespace, not a word
    s = s.replace(new RegExp('[\\u00A0]', 'g'), ' ');
    s = s.toLowerCase();
    var chars = Array.from(s);
    var out = [];
    var buf = '';
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (CJK_CHAR_RE.test(ch)) {
        if (buf) { out.push(buf); buf = ''; }
        out.push(ch);
      } else if (/\s/.test(ch)) {
        if (buf) { out.push(buf); buf = ''; }
      } else {
        buf += ch;
      }
    }
    if (buf) { out.push(buf); }
    return out;
  }

  // D-04's runtime guard, and the whole promise of this phase in one
  // predicate: TRUE only when `after` carries exactly `before`'s words, in
  // exactly `before`'s order, once the declared heading runs are subtracted.
  //
  // An INDEPENDENT straight-line re-check (the guardSurface discipline at
  // core.js:195): it shares the tokenizer with nothing but itself, never
  // consults structureBody's zone map, and never calls back into it.
  //
  // `addedHeadings` is the exact list of heading strings the transform
  // INJECTED (model-named headings, plan 06). Their tokens are subtracted
  // from the AFTER side as a TOKEN-RUN subtraction removing ONE left-to-right
  // occurrence per entry — never a string removal, never all occurrences, so
  // a heading word that also appears in her prose cannot be silently eaten.
  // A PROMOTED heading is never in this list: its words came from the source.
  //
  // Fail-closed on malformed input: a null side returns false and throws
  // nothing (the itemExcluded null-guard-first posture).
  function wordsPreserved(before, after, addedHeadings) {
    if (before == null || after == null) { return false; }
    var b = normalizeWords(before);
    var a = normalizeWords(after);
    var added = Array.isArray(addedHeadings) ? addedHeadings : [];
    for (var h = 0; h < added.length; h++) {
      var ht = normalizeWords(added[h]);
      if (!ht.length) { continue; }
      for (var i = 0; i + ht.length <= a.length; i++) {
        var ok = true;
        for (var j = 0; j < ht.length; j++) {
          if (a[i + j] !== ht[j]) { ok = false; break; }
        }
        if (ok) { a = a.slice(0, i).concat(a.slice(i + ht.length)); break; }
      }
    }
    if (a.length !== b.length) { return false; }
    for (var k = 0; k < b.length; k++) {
      if (a[k] !== b[k]) { return false; }
    }
    return true;
  }

  // ---- D-14's inline-markup invariant (26.88-12) ------------------------------
  //
  // THREE DEFECTS IN A ROW WERE INVISIBLE TO wordsPreserved, because every word
  // survived in all three. Word preservation is necessary and nowhere near
  // sufficient, and until this landed nothing in the 48 suites asserted that
  // INLINE MARKUP survives the transform.
  //
  // The demonstration, reproduced from GIT HISTORY rather than from prose (the
  // "after" strings are what the pre-fix core.js actually emitted, replayed at
  // 34be66d^ and 237d0a5 — see tests/test_reformat_fixtures.cjs M2-M4):
  //
  //   defect  construct   pairs before -> after   wordsPreserved   markupPreserved
  //   F-1     %%          2 -> 0                  TRUE             FALSE
  //   F-3     *           1 -> 0                  TRUE             FALSE
  //   F-3b    *           1 -> 0                  TRUE             FALSE
  //
  // PER BLANK-LINE-DELIMITED BLOCK, and that is the whole mechanism rather than
  // a detail: a markdown emphasis pair CANNOT span a blank line, so counting
  // per block is the same rule the renderer applies rather than a heuristic —
  // and all three defects are a pair that SURVIVED in the document and moved
  // across an emitted block boundary. Counted whole-document, every one of the
  // three passes. (Measured, 26.88-12: a whole-document variant returns TRUE on
  // F-1, F-3 and F-3b alike. The per-block choice is the entire guard.)
  //
  // DECREASE-ONLY, NEVER EQUALITY, and the comment says why because a future
  // reader will be tempted: a source line that is ALREADY unbalanced
  // (`lazyweb_search`, the kaomoji `_(:з」∠)_`, an `x_x` identifier) contributes
  // zero pairs on BOTH sides and cannot false-trip. That property is what makes
  // this usable on a corpus with kaomoji and identifiers in it at all. A guard
  // that false-trips on her own library silently disables the feature, which is
  // strictly worse than no guard (T-26.88-39).
  //
  // COST, MEASURED over 400 live notes (3.97M chars) rather than quoted from
  // the research: wordsPreserved 696 us/note, markupPreserved 163 us/note
  // (0.23x), headingsBound 19 us/note (0.03x). renderSavedBody runs
  // markupPreserved TWICE and headingsBound once, so the whole new guard block
  // costs 0.50x the guard that already runs on every render — one-shot on open,
  // nowhere near a stall (SC-3). Re-measure before widening any roster.
  //
  // Reads INLINE_MARKS and INLINE_PAIRS by name — the SAME rosters openSpanAt
  // reads, so the guard cannot trip on what the refusal permits. SPAN_ONLY_PAIRS
  // is deliberately EXCLUDED: `![x]` nests inside `[x]`, so counting both would
  // double-count every image embed.

  // Per-construct pair counts, summed over blank-line-delimited blocks. Private:
  // the exported predicate is the contract, not the shape of its bookkeeping.
  // THE INTRAWORD UNDERSCORE RULE, and it is the renderer's rule rather than a
  // convenience. CommonMark lets `*` open emphasis inside a word (`a*b*c` is
  // emphasised) but NOT `_`: `snake_case`, `pic_1.jpg` and `lazyweb_search` are
  // plain text to every markdown renderer alive. Counting them as delimiters is
  // how a FALSE TRIP is built.
  //
  // FOUND BY EXECUTION, NOT BY REASONING — tests/test_reformat_property.cjs
  // seed 20260769, on the first run of P8. One generated body carried
  // `pic_1.jpg` and `pic_2.jpg` in a single block: two intraword underscores,
  // read as one balanced pair. The transform then inserted a heading between
  // them, splitting the block, and the "pair" appeared to vanish. A guard that
  // false-trips on her own corpus silently disables reformatting for the note
  // (T-26.88-39), and her image filenames are FULL of underscores
  // (`…_1_猪猪包ar_来自小红书网页版.jpg`).
  //
  // Applies to `_` and `__` ONLY. `*` and `**` are deliberately untouched,
  // because there the renderer really does open emphasis intraword.
  var WORD_CHAR_RE = new RegExp('[\\p{L}\\p{N}]', 'u');

  function markupOccurrences(s, needle) {
    var intraword = needle.charAt(0) === '_';
    var c = 0, f = 0, a, before, after;
    for (;;) {
      a = s.indexOf(needle, f);
      if (a === -1) { return c; }
      f = a + needle.length;
      if (intraword) {
        before = a > 0 ? s.charAt(a - 1) : '';
        after = f < s.length ? s.charAt(f) : '';
        if (before && after &&
            WORD_CHAR_RE.test(before) && WORD_CHAR_RE.test(after)) {
          continue;                        // snake_case is not emphasis
        }
      }
      c++;
    }
  }

  function pairsOf(text) {
    var total = {};
    var i, j, blocks, block, s, n, p, o, c;
    for (i = 0; i < INLINE_MARKS.length; i++) { total[INLINE_MARKS[i]] = 0; }
    for (i = 0; i < INLINE_PAIRS.length; i++) {
      total[INLINE_PAIRS[i][0] + INLINE_PAIRS[i][1]] = 0;
    }
    blocks = String(text).split(/\r?\n[ \t]*\r?\n/);
    for (j = 0; j < blocks.length; j++) {
      block = blocks[j];
      s = block;
      // SYMMETRIC families first, LONGEST FIRST (the INLINE_MARKS order), each
      // blanked out of the block once counted so a `**` is never re-read as two
      // `*`. Parity: n marks make floor(n / 2) pairs.
      for (i = 0; i < INLINE_MARKS.length; i++) {
        n = markupOccurrences(s, INLINE_MARKS[i]);
        total[INLINE_MARKS[i]] += Math.floor(n / 2);
        if (n) { s = s.split(INLINE_MARKS[i]).join(' '); }
      }
      // ASYMMETRIC pairs: depth, approximated as min(open, close) within the
      // block — enough for a DECREASE test and immune to ordering games.
      for (i = 0; i < INLINE_PAIRS.length; i++) {
        o = INLINE_PAIRS[i][0];
        c = INLINE_PAIRS[i][1];
        p = Math.min(markupOccurrences(s, o), markupOccurrences(s, c));
        total[o + c] += p;
        if (p) { s = s.split(o).join(' ').split(c).join(' '); }
      }
    }
    return total;
  }

  // TRUE when no construct's pair count DECREASED. On wordsPreserved's posture:
  // an INDEPENDENT straight-line re-check that never consults structureBody's
  // zone map and never calls back into it, and fail-closed on malformed input —
  // a null side returns false and throws nothing.
  function markupPreserved(before, after) {
    if (before == null || after == null) { return false; }
    var b = pairsOf(before);
    var a = pairsOf(after);
    var keys = Object.keys(b);
    for (var i = 0; i < keys.length; i++) {
      if (a[keys[i]] < b[keys[i]]) { return false; }
    }
    return true;
  }

  // F-1's VISIBLE SYMPTOM, stated directly. The pair count above catches F-1's
  // CAUSE (a `%%` pair split across a boundary); it does not assert what the
  // reader actually saw, which was an empty `## ` heading. A HEADING BOUND TO
  // NOTHING IS UI-SPEC CHECK 2 STATED AS CODE.
  //
  // Called on cleanVaultMarkup(out.text) — what `marked` actually receives —
  // which is the seam Q4 opened and the only place this symptom exists at all.
  // It strips `%%…%%` itself as well, so it is honest when handed raw text.
  //
  // A `#` line inside a fenced block is CODE, never a heading (the same reading
  // hasAuthorHeading takes), so fences are skipped — over-tripping here would
  // fall a note back to as-saved for a line no renderer treats as a heading.
  //
  // O(lines). No pair set, no zone map, no allocation per heading.
  function headingsBound(text) {
    if (text == null) { return false; }
    var s = String(text).replace(/%%[\s\S]*?%%/g, '');
    var lines = s.split('\n');
    var fence = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\r$/, '');
      var f = /^[ \t]{0,3}(```+|~~~+)/.exec(line);
      if (f) {
        if (fence === null) { fence = f[1].charAt(0); continue; }
        if (f[1].charAt(0) === fence) { fence = null; }
        continue;
      }
      if (fence !== null) { continue; }
      var h = /^[ \t]{0,3}#{1,6}(?:[ \t]+([\s\S]*))?$/.exec(line);
      if (!h) { continue; }
      if (!String(h[1] == null ? '' : h[1]).replace(/[ \t]+/g, '')) {
        return false;
      }
    }
    return true;
  }

  // 26.88-16 (F-5 / F-4's instrument half): THE FOUR-GUARD VERDICT, ONE
  // SPELLING. `app.js renderSavedBody` composed these four booleans inline,
  // which meant the only way for an instrument to ask the question the app asks
  // was to compose them a SECOND time — and `tools/replan_probe.cjs` composed
  // ONE of them, at ONE seam. Over the 90-note firing set the raw seam trips 0
  // and the clean seam trips 14, so the probe's "no residual trips" line was
  // true of the raw seam and false as a statement about shipped behaviour, and
  // 26.88-COVERAGE.md published 90 where the app lays out 76. F-1 was the same
  // shape one layer down (one rule, two callers that disagreed) and it cost the
  // phase a UAT corpus. So the verdict moves here and both callers read it.
  //
  // ALL FOUR ARE ALWAYS COMPUTED — never short-circuited — so a note that trips
  // two guards is attributed to BOTH rather than to whichever ran first. That
  // is what makes the probe's four printed counts independent of each other; a
  // short-circuiting version would silently make every count downstream of the
  // first failure a count of "and nothing earlier tripped".
  //
  // THE VERDICT IS SHARED; THE POLICY IS NOT. This returns booleans and nothing
  // else. Which warning fires, what `REFORMAT_STATE` records, and the fact that
  // the failure action is `return src` with NOTHING in the UI all stay in
  // `renderSavedBody`, because D-04's whole shape is that the wrapper decides.
  // A `bodyGuards` that also decided what to render would put a reading-surface
  // policy decision in the pure trunk.
  //
  // Pure, synchronous, no DOM, no clock, no I/O, and it never raises: every
  // predicate below is already fail-closed on malformed input, so a null side
  // reads false rather than throwing. An empty `src` and an empty `outText`
  // return all four true.
  function bodyGuards(src, outText, addedHeadings) {
    var words = wordsPreserved(src, outText, addedHeadings);
    var markupRaw = markupPreserved(src, outText);
    var markupClean = markupPreserved(
      cleanVaultMarkup(src), cleanVaultMarkup(outText));
    var bound = headingsBound(cleanVaultMarkup(outText));
    return {
      words: words,
      markupRaw: markupRaw,
      markupClean: markupClean,
      headingsBound: bound,
      ok: words && markupRaw && markupClean && bound
    };
  }

  // D-07.4a: does this note already carry an AUTHOR heading? Two things are
  // discounted first, because they are the owner's own tooling talking and not
  // her structure: the vault_linker.py %% auto-links %% span (which holds the
  // `## Related` block), and a TRAILING boilerplate heading from
  // TOOLING_HEADINGS. A `#` line inside a fenced code block is code, never a
  // heading. Everything left is the author's, and one of it means hands off
  // the whole note (D-07.4 — never layer a second pass).
  function hasAuthorHeading(body) {
    var s = String(body == null ? '' : body);
    s = s.replace(
      /%%\s*auto-links:start\s*%%[\s\S]*?%%\s*auto-links:end\s*%%/g, '\n');
    if (/%%\s*auto-links:start\s*%%/.test(s)) {
      // an unterminated marker block: the rest of the file is the tooling's
      s = s.replace(/%%\s*auto-links:start\s*%%[\s\S]*$/, '\n');
    }
    var lines = s.split('\n');
    var kept = [];
    var inFence = false;
    for (var f = 0; f < lines.length; f++) {
      if (/^\s{0,3}(```|~~~)/.test(lines[f])) { inFence = !inFence; continue; }
      if (!inFence) { kept.push(lines[f]); }
    }
    var heads = [];
    var HEAD_RE = /^[ \t]{0,3}#{1,6}(?:[ \t]+([^\n]*?))?[ \t]*$/;
    for (var i = 0; i < kept.length; i++) {
      var m = HEAD_RE.exec(kept[i].replace(/\r$/, ''));
      if (m) {
        heads.push(String(m[1] == null ? '' : m[1])
          .replace(/[#\s]+$/, '').trim().toLowerCase());
      }
    }
    while (heads.length &&
        TOOLING_HEADINGS.indexOf(heads[heads.length - 1]) !== -1) {
      heads.pop();
    }
    return heads.length > 0;
  }

  // 26.88-16 (F-5): THE FRONTMATTER SPLIT, ONE SPELLING. Moved here VERBATIM
  // from app.js:368-374 — same regex, same null-on-miss shape, same
  // `{ fm, body }` return — because an invariant you cannot assert from a node
  // suite is an invariant nobody checks. This is the Q4 move
  // (`cleanVaultMarkup` / `escapeHtml` / `escapeAttr`, plan 12) repeated one
  // layer up, for the reason Q4 gave.
  //
  // THREE IN-REPO SPELLINGS EXISTED BEFORE THIS: app.js:368, the picker at
  // tools/pick_uat_notes.cjs:117, and the probe at tools/replan_probe.cjs:159
  // — two of them carrying a comment that app.js "has no module surface", which
  // was true and is now irrelevant, because core.js does. TWO MORE were found
  // by executing the scan rather than by reading the census:
  // tests/test_reflection_verbatim.cjs and tests/test_display_fence.cjs each
  // stripped frontmatter with their own copy. All five are re-pointed here.
  //
  // The 25-05 UAT rationale, carried across with the code: a vault note opens
  // with a YAML frontmatter block. Piping that through markdown re-flows her
  // metadata into run-on prose — the opposite of verbatim. Split it off: the
  // body renders as markdown untouched; the frontmatter shows byte-exact in a
  // small collapsed <pre> ("how this was filed"), never re-worded, never
  // re-flowed.
  //
  // IT IS BOM-INTOLERANT AND THAT IS NOT FIXED HERE. A BOM-prefixed note reads
  // as "no frontmatter" — a NAMED, PRE-EXISTING gap (see fmSource below, which
  // is BOM-tolerant on its own precisely because this is not), invisible today
  // because zero live notes carry a BOM. Fixing it in the same commit that
  // moves it would make this plan's behaviour-neutrality gate unattributable:
  // a moved figure could be the move or the fix, and neither would be provable.
  var FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

  function splitFrontmatter(md) {
    var m = FM_RE.exec(md == null ? '' : md);
    if (!m) { return { fm: null, body: md == null ? '' : md }; }
    return { fm: m[1], body: md.slice(m[0].length) };
  }

  // D-06: the note's own `source:` value, read out of the raw frontmatter
  // block. Shaped byte-for-byte like app.js fmTitle — line-anchored regex
  // over the raw string, quote-strip, trim, null on a miss. BOM-tolerant on
  // its own, because the shipped FM_RE is NOT and this phase does not touch
  // it (a BOM-prefixed note reading as "no frontmatter" is a pre-existing
  // gap, invisible today because zero live notes carry a BOM).
  function fmSource(fm) {
    if (!fm) { return null; }
    var text = String(fm).replace(new RegExp('^[\\uFEFF]'), '');
    var m = /^source:[ \t]*(.+?)[ \t]*$/m.exec(text);
    if (!m) { return null; }
    var v = m[1].replace(/^["']|["']$/g, '').trim();
    return v || null;
  }

  // D-19 (26.88-10): does this note carry a frontmatter block AT ALL? Named
  // rather than inlined so the branch below, the comment that justifies it,
  // and the fixture that pins it all point at ONE thing a future reader can
  // find with one grep. Whitespace-only is no block: an adapter that emits an
  // empty `--- ---` pair must not thereby unlock the reformatter.
  function hasFrontmatterBlock(fm) {
    return fm != null && String(fm).trim() !== '';
  }

  // D-06: is this her OWN writing? True when the note carries no frontmatter
  // block at all, when its frontmatter names the personal source EXACTLY, or
  // when the item's folder facet is in the owner-owned roster.
  //
  // THE ABSENT-FRONTMATTER DEFAULT IS PROTECTIVE, and that is a decision, not
  // a fallback. IT WAS REVERSED ON 2026-08-01 (D-19, owner call, post-
  // research) and the reasoning it replaced is recorded here so nobody
  // re-derives it: this block used to read THE ABSENT-SOURCE DEFAULT IS
  // PERMISSIVE, reasoned from the Obsidian vault, where a note with no
  // frontmatter really was overwhelmingly a raw un-processed drop. That was
  // right for that population. THE STUDYROOM ADAPTER IS A DIFFERENT
  // POPULATION AND BREAKS THE REASONING.
  //
  // The measurement that reversed it: 152 of the 536 eligible notes carry no
  // frontmatter block at all, 143 of them in the adapter folder
  // studyroom-collect-k2ks84n7, and 28 were being reformatted on the reading
  // surface. They are the owner's own phone and Apple-Notes captures — personal
  // correspondence, private paperwork, hobby notes, long-form drafts.
  //
  // THE RULE, IN ONE SENTENCE: IF THE APP CANNOT DEMONSTRATE A NOTE IS
  // CLIPPED, IT RENDERS IT EXACTLY AS SAVED. A folder name is not that
  // demonstration.
  //
  // Two alternatives were measured and REJECTED, and re-proposing either
  // should mean answering these:
  //   - a `studyroom-collect-*` prefix match. FOLDER_PERSONAL is matched
  //     WHOLE and case-folded, never as a prefix, deliberately; a prefix
  //     match introduces a new rule shape into a safety gate, and it only
  //     plugs THIS adapter — the next import re-opens the hole. The branch
  //     below needs no adapter to be remembered.
  //   - a provenance test that sniffs adapter identity or path shape. Most
  //     logic, and the most surface for a future import to slip through.
  //
  // THE RESIDUAL, so it is not mistaken for covered: a note that HAS a
  // frontmatter block but carries no `source:` value still takes the
  // permissive road and may be laid out. That population is UNMEASURED.
  // Widening to it is a separate decision with its own measurement, and
  // D-19 deliberately does not speculate past what was measured.
  //
  // Reads the note's OWN frontmatter, never the store item's adapter-identity
  // `source` field (which never carries the personal value in this app —
  // comparing against it would be a branch that is always false).
  function isPersonalNote(item, fm) {
    if (!hasFrontmatterBlock(fm)) { return true; }
    if (fmSource(fm) === PERSONAL_SOURCE) { return true; }
    var folder = (item && item.folder != null) ?
      String(item.folder).trim().toLowerCase() : '';
    return folder !== '' && FOLDER_PERSONAL.indexOf(folder) !== -1;
  }

  // Drop the marker glyphs in front of a label — leading whitespace, a
  // markdown/keycap bullet, and the pictographs the corpus decorates section
  // labels with. Every character removed here is a character the normalizer
  // also drops, on BOTH sides, so stripping cannot cost a word.
  var MARKER_GLYPH_RE = new RegExp('^[\\u{1F000}-\\u{1FAFF}' +
    '\\u{2190}-\\u{2BFF}\\u{2600}-\\u{27BF}\\u{FE00}-\\u{FE0F}' +
    '\\u{200B}-\\u{200D}\\u{2060}\\u{FEFF}\\u{00B7}\\u{2022}\\u{25CF}' +
    '\\u{25AA}\\u{30FB}]', 'u');

  var LEAD_SPACE_RE = new RegExp('^[\\s\\u3000]+');
  var TAIL_SPACE_RE = new RegExp('[\\s\\u3000]+$');
  var LEAD_KEYCAP_RE = new RegExp('^[0-9#*][\\uFE0F]?[\\u20E3]');

  function stripLeadingMarkers(text) {
    var s = String(text);
    var prev = null;
    while (s !== prev) {
      prev = s;
      s = s.replace(LEAD_SPACE_RE, '');
      s = s.replace(LEAD_KEYCAP_RE, '');
      s = s.replace(MARKER_GLYPH_RE, '');
    }
    return s.replace(TAIL_SPACE_RE, '');
  }

  // 26.88-11 (Q5): DOES `index` SIT INSIDE AN UNCLOSED INLINE SPAN IN `text`?
  // One exported pure predicate, serving TWO rules: the colon-label refusal
  // below, and D-15's split refusal in plan 13. The CALLER chooses the scope —
  // `promoteColonLabel` is line-scoped and passes a LINE; plan 13 passes a
  // BLOCK.
  //
  // It scans `text` up to `index`, tracking every INLINE_PAIRS and
  // SPAN_ONLY_PAIRS member as a depth counter and every INLINE_MARKS member as
  // a parity toggle (longest-match-first, so `**` is consumed before `*`), and
  // answers true when a delimiter is still open at `index` AND its closer
  // still lies ahead. BOTH HALVES ARE THE DEFINITION: a span has two ends, and
  // an opener with no closer anywhere is not a span the transform can split —
  // it is already unbalanced in the source, which is exactly the shape (`x_x`,
  // `lazyweb_search`) that must not false-trip.
  //
  // WHAT IT IS NOT: a markdown parser, and it does not need to be. It only
  // ever answers a REFUSAL question, and refusal is always the safe direction
  // — over-refusing renders the note as saved, which is a valid answer by
  // construction (the same fail-safe posture D-04 and the size ceiling take).
  //
  // Pure: no DOM, no clock, no randomness, no I/O. Never raises.
  function openSpanAt(text, index) {
    var s = String(text);
    var i = index;
    if (!(i > 0)) { return false; }              // also catches NaN
    if (i > s.length) { i = s.length; }
    var head = s.slice(0, i);
    var tail = s.slice(i);
    var p, k, o, c, depth;
    var pairs = INLINE_PAIRS.concat(SPAN_ONLY_PAIRS);
    for (p = 0; p < pairs.length; p++) {
      o = pairs[p][0];
      c = pairs[p][1];
      depth = 0;
      for (k = 0; k < head.length; k++) {
        // A PREFIX TEST, not a search. 26.88-13: this read
        // `head.indexOf(o, k) === k`, which scans from k to the end of the
        // string to answer a question about position k alone — O(n) per
        // character, so O(n^2) per pair per call. That was invisible while
        // promoteColonLabel was the only caller (one call per line, short
        // heads); D-15 calls this at EVERY split point of a whole block, and
        // the 10 KB single-line CJK fixture (B3, the T-26.88-04
        // denial-of-service row) went from 22 ms to 10,211 ms against a
        // 1,000 ms budget. Same predicate, same answers — measured
        // byte-identical on the live pool — at linear cost.
        if (head.substr(k, o.length) === o) { depth++; k += o.length - 1; }
        else if (head.substr(k, c.length) === c) {
          if (depth > 0) { depth--; }
          k += c.length - 1;
        }
      }
      if (depth > 0 && tail.indexOf(c) !== -1) { return true; }
    }
    // The symmetric families, longest first. Each family is blanked out of
    // both halves once counted so a `**` is never re-read as two `*`.
    var h = head;
    var t = tail;
    for (var m = 0; m < INLINE_MARKS.length; m++) {
      var mark = INLINE_MARKS[m];
      var n = h.split(mark).length - 1;
      if (n % 2 === 1 && t.indexOf(mark) !== -1) { return true; }
      h = h.split(mark).join(' ');
      t = t.split(mark).join(' ');
    }
    return false;
  }

  // D-03's dominant signal (460 of 469 signal-firing candidates): the author
  // already wrote a short label in front of a colon. Returns
  // {label, rest} or null. Conservative by construction — a URL scheme, a
  // clock time, a sentence with a colon in the middle of it, and an empty
  // remainder are all refused rather than guessed at.
  function promoteColonLabel(line) {
    var text = String(line);
    var idx = -1;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === ':' || c === '：') { idx = i; break; }
    }
    if (idx === -1) { return null; }
    var rest = text.slice(idx + 1);
    if (rest.charAt(0) === '/') { return null; }   // https:// — a URL scheme
    if (!rest.trim()) { return null; }
    // 26.88-11 (Q5): THE FIFTH REFUSAL. A colon sitting inside an OPEN inline
    // span is not a label separator — promoting there emits a heading that
    // splits the pair across a block boundary, and a markdown pair cannot span
    // a blank line, so it provably stops being a pair.
    //
    // Every one of the seven inline-markup breaks measured on the live library
    // is this shape, and closing them HERE closes them at the cause:
    //   `## 正式开火（烹饪时间` / `约1小时）`      b4ead431896578e3  （） 9->8
    //   `## 纪录片叫《地平线` / `走进自闭症》`     43a109e00ef803c8  《》 1->0
    //   `## Logger.log('NOTE`                     f752be221899dc4a, 5e33900d02961a8c  () 226->223
    //   `## lazyweb_search {"query"`              be4c130e18a88359  {} 1->0
    //   the kaomoji `_(:з」∠)_`                   eaff9a31b11c6a86, 9d0911cc105f8805
    //
    // `b4ead431896578e3` is the phase's OWN SHOWCASE NOTE — the best free-prose
    // wall reduction in the library. D-14's guard alone (plan 12) would have
    // been correct and would have fallen it back to as-saved, taking the
    // headline result with it. Fixing the cause refuses exactly the one
    // promotion that broke the fullwidth parenthesis and keeps every other
    // promotion on the note.
    if (openSpanAt(text, idx)) { return null; }
    var label = stripLeadingMarkers(text.slice(0, idx));
    if (!label) { return null; }
    if (Array.from(label).length > LABEL_MAX_CHARS) { return null; }
    // 26.88-11 (Q6): THE FULLWIDTH PROSE COMMA `，` JOINS THIS CLASS. One
    // character, one live case: 43a109e00ef803c8 emitted
    // `## 最近从自闭症纪录片中看到了一个实验，让我很触动` — a 24-character
    // prose SENTENCE promoted as a heading, admitted only because this class
    // rejected `。．！？!?；;…` and not `，`. A heading bound to nothing is
    // UI-SPEC check 2's failure.
    //
    // THE CONTRAST WITH `、` IS DELIBERATE AND MUST NOT BE LOST: the
    // ENUMERATION comma is a LIST SEPARATOR (it is in RUN_SEPARATORS) and
    // stays OUT of this class, so `主料、辅料：…` still promotes. `，` is the
    // ordinary Chinese sentence comma, measured at 75,400 occurrences across
    // the corpus — the same measurement that keeps it out of RUN_SEPARATORS.
    if (/[。．！？!?；;…，]/.test(label)) {
      return null;                                  // a sentence, not a label
    }
    if (!/\p{L}/u.test(label)) { return null; }     // "12:30" is a clock
    return { label: label, rest: rest.trim() };
  }

  // 26.88-17 (F-7): THE SENTENCE THAT CONTAINS `index`, as `[start, end)`.
  //
  // THE RUN'S TWO ENDS COME FROM HERE, and both of them come from ONE call.
  // It is DERIVED FROM `splitSentences` — the SHIPPED sentence-boundary rule,
  // whose terminator guard, span guard and image-token guard it inherits whole
  // — rather than re-testing the ender characters itself. That is the
  // difference between a FOURTH CALLER of one predicate and a SECOND SPELLING
  // of it, and this phase has paid for the difference twice (F-1 at the zone
  // layer, F-5 at the frontmatter layer).
  //
  // The walk is the only honest way to get INDICES out of a rule that returns
  // TRIMMED SEGMENTS: each segment is located from a cursor that only moves
  // forward, so the match is the segment's own occurrence and never an earlier
  // one. `splitSentences` returns null for a block offering fewer than two
  // sentences, and null here means the whole string — which is exactly the
  // pre-26.88-17 behaviour, so a paragraph with no boundary in it is provably
  // unaffected by this change (fixtures F7-R1 and F7-DASH-nobound).
  //
  // The FIRST sentence's span starts at 0 rather than at its trimmed start, so
  // leading whitespace is never emitted as a spurious preceding block.
  //
  // Pure: no DOM, no clock, no randomness, no I/O. Never raises.
  // 26.88-20 (F-12): `ordinalGuard` is threaded THROUGH this second caller
  // as well, and the reason is attribution rather than tidiness. The F-12
  // refusal has TWO callers — D-15's own split, and this bound — and a twin
  // run that disabled only the first would print a mover list that is short
  // by every note whose shape moves through F-7's bound instead. Measured:
  // exactly one live note does (`504c356cb318ac4a`), and a column that
  // silently omitted it would be a number that reads rigorous and is wrong,
  // which is this phase's named defect class. `imageTokenGuard` is
  // deliberately NOT threaded here for the opposite, equally measured reason
  // recorded at its own comment: all fourteen F-4 notes arrive through D-15.
  // Default is the shipped rule; only the exact value `false` disables.
  function runSentenceSpan(text, index, ordinalGuard) {
    var s = String(text == null ? '' : text);
    var at = Number(index);
    if (!isFinite(at) || at < 0) { at = 0; }
    var segs = splitSentences(s, undefined, ordinalGuard);
    if (!segs) { return [0, s.length]; }
    var cursor = 0;
    for (var i = 0; i < segs.length; i++) {
      var start = s.indexOf(segs[i], cursor);
      if (start === -1) { return [0, s.length]; }
      var end = start + segs[i].length;
      cursor = end;
      if (at < end) { return [i === 0 ? 0 : start, end]; }
    }
    return [cursor, s.length];
  }

  // The separator-run rule (D-03): at least two separators AND at least two
  // short segments, or it is prose with dashes in it and nothing happens.
  //
  // 26.88-17 (F-7, THE CAUSE FIX): THE RUN HAS TWO ENDS. Until this plan this
  // comment read *"The FINAL segment may be any length and carries whatever
  // follows it — ending the run earlier would be a guess, which D-03 forbids."*
  // THAT SENTENCE WAS THE FINDING. The run built its first segment from the
  // start of the promoted rest and its last from whatever followed the final
  // separator, so on the owner's essay it swallowed a clause into bullet one
  // and a whole following sentence into the last bullet, and on a recipe it
  // swallowed the cooking steps. ONE defect, two symptoms. All four guards
  // passed it, because every word survived.
  //
  // THE BOUND IS A SIGNAL, NOT A GUESS, which is what keeps the redesign inside
  // D-03: an enumeration lives inside ONE SENTENCE — that is what `、`, `・`,
  // `•` and ` - ` ARE — so the run is bounded to THE SENTENCE THAT CONTAINS ITS
  // FIRST SEPARATOR, at both ends, via `runSentenceSpan`. Everything before that
  // sentence is returned as `pre` and emitted as its own preceding block;
  // everything after it as `rest`, its own following block. Both are
  // byte-identical to their source slices apart from the surrounding-whitespace
  // trim the rest of this module already documents. NOTHING IS EVER DROPPED —
  // a dropped or duplicated remainder would silently lose or repeat her words
  // (T-26.88-45), so F7-TAIL asserts the remainder is EMITTED and
  // `wordsPreserved` is the independent second opinion.
  //
  // FOUR REJECTED DESIGNS, EACH WITH ITS MEASUREMENT. Written down so none of
  // them is rediscovered as a good idea — the same discipline that made the
  // first two worth recording. All four were measured on the probe's own
  // 384-note pool, shipped core against a scratch variant.
  //
  //   1. REFUSE THE RUN when any segment but the last contains sentence-final
  //      punctuation. Firing 90 -> 90 (zero coverage loss), 3 notes change, 0
  //      stop firing — and it DESTROYS `504c356cb318ac4a` 新疆羊肉抓饭's clean
  //      ingredient block, the phase's own worked example from CONTEXT
  //      `<specifics>`. A fix that deletes the best output in the corpus is not
  //      a fix.
  //   2. BOUND THE RUN AT CLAUSE PUNCTUATION (fullwidth and ASCII comma,
  //      semicolon) at both ends. Looks like a strict improvement — it also
  //      closes residual R1 — but it RE-ADMITS THE OWNER'S EXACT QUOTED
  //      SENTENCE AS A FOUR-BULLET LIST, because after a clause bound the head
  //      `会怎么想` reads as an item. It produces the precise output she
  //      rejected at beat 7.
  //   3. `headReadsAsItem` — a REFUSAL over the fragment preceding the first
  //      separator (empty, or at most ITEM_MAX_CHARS with no sentence-final and
  //      no clause punctuation). This was 26.88-17's OWN PRESCRIBED DESIGN, and
  //      the disk falsified its premise: `504c356cb318ac4a`'s run head is not a
  //      short item, it is the note's entire prose intro flattened onto one line
  //      by the clippings-processor, far over ITEM_MAX_CHARS and carrying both
  //      `，` and `！` — INDISTINGUISHABLE from the owner's essay head. Measured:
  //      it destroys the pin's ingredient block AND `cb676cc240495106`'s, a
  //      SECOND list the owner verdicted as reading BETTER. It is the third
  //      spelling of outcome 1, not a new design. Dropped by the owner's
  //      decision of 2026-08-03; see the amendment block in `26.88-17-PLAN.md`.
  //   4. ANCHOR THE SPAN ON THE **LAST** SEPARATOR rather than the first (the
  //      plan's original `runEndBound`). It closes the tail half — the pin's
  //      cooking steps do leave the last bullet — but the run still spans every
  //      sentence in between, so THE OWNER'S QUOTED SENTENCE STAYS BULLETED.
  //      3 movers, and the one she asked about is not fixed.
  //
  // TWO RESIDUALS STAY OPEN, NAMED, AND PINNED AS FIXTURES (F7-R1, F7-R2):
  //   R1  `7290c7f718776f1b` 007 钩织 Marni — `钥匙等等，装进这个包刚刚好。` stays
  //       in the last bullet. No sentence boundary lies between the last
  //       separator and the end of the paragraph, so there is nothing for the
  //       bound to bind to, and the only predicate that closes it is rejected
  //       design 2.
  //   R2  `4e5a6de26cd44d47` 斯蒂芬·金不写怪物 — `很多人以为他最擅长的是制造怪物`
  //       is a short clause carrying no internal punctuation, so it reads as a
  //       first item. No author signal separates it from a genuine one, and
  //       inventing one would be the guess D-03 forbids. Its TAIL now separates,
  //       which is the half this plan closed.
  //
  // `bounded` IS A MEASUREMENT SEAM, not a feature. It arrives from
  // `structureBody`'s `opts.separatorBounds`, documented at its resolver, and
  // the shipped call site never passes it. Passing `false` restores the
  // pre-26.88-17 behaviour exactly, which is what lets the probe attribute a
  // moved figure to THIS change and to nothing else.
  //
  // 26.88-13 (M4b, the cause fix): A SEPARATOR INSIDE AN OPEN INLINE SPAN IS
  // NOT A LIST SEPARATOR. `openSpanAt` — plan 11's helper, and its fourth
  // caller — refuses it, exactly as the colon rule (Q5) and D-15's split
  // already do. Without this, the live note `7290c7f718776f1b` emitted
  //
  //     - 苏苏姐家（03
  //     - 09各一卷） 钩针：包身4.5mm…
  //
  // shredding `（03、09各一卷）` across two list items, and ALL THREE plan-12
  // guards passed it: `markupPreserved` compares per BLANK-LINE-delimited
  // block, both items live in one block, so the fullwidth parenthesis counts 1
  // on both sides and nothing trips. Plan 12 recorded that as a pinned KNOWN
  // GAP (fixture M4b) and handed the cause here.
  //
  // It is the guard that could not see it; it is the SPLIT that should never
  // have happened. Fixing it here means the pair is never broken in the first
  // place, which is the same posture plan 11 took for Q5 rather than letting
  // D-14 fall the whole note back to as-saved.
  function splitSeparatorRun(text, bounded, ordinalGuard) {
    var body = String(text);
    var cuts = [];
    var k;
    for (var i = 0; i < body.length; i++) {
      for (k = 0; k < RUN_SEPARATORS.length; k++) {
        var sep = RUN_SEPARATORS[k];
        if (body.substr(i, sep.length) !== sep) { continue; }
        if (!openSpanAt(body, i)) { cuts.push([i, sep.length]); }
        i += sep.length - 1;
        break;
      }
    }
    if (cuts.length < 2) { return null; }
    // THE TWO ENDS. Computed ONCE per run, from the FIRST separator, and never
    // once per cut — a per-separator call inside this loop would put a linear
    // pass inside a linear loop, which T-26.88-49 accepts only because it does
    // not happen.
    var lo = 0;
    var hi = body.length;
    if (bounded !== false) {
      var span = runSentenceSpan(body, cuts[0][0], ordinalGuard);
      lo = span[0];
      hi = span[1];
      var kept = [];
      for (var q = 0; q < cuts.length; q++) {
        if (cuts[q][0] >= lo && cuts[q][0] < hi) { kept.push(cuts[q]); }
      }
      cuts = kept;
      // A sentence carrying only ONE separator is not a list; the separators
      // that made the count were in other sentences and are not this run's.
      if (cuts.length < 2) { return null; }
    }
    var segs = [];
    var from = lo;
    for (var c = 0; c < cuts.length; c++) {
      var piece = body.slice(from, cuts[c][0]).trim();
      if (piece) { segs.push(piece); }
      from = cuts[c][0] + cuts[c][1];
    }
    var tail = body.slice(from, hi).trim();
    if (tail) { segs.push(tail); }
    if (segs.length < 2) { return null; }
    var shortCount = 0;
    for (var r = 0; r < segs.length; r++) {
      if (Array.from(segs[r]).length <= ITEM_MAX_CHARS) { shortCount++; }
    }
    if (shortCount < 2) { return null; }
    return { segs: segs, pre: body.slice(0, lo).trim(),
      rest: body.slice(hi).trim() };
  }

  // ---- 26.88-03: the rest of D-03's signal set -------------------------------
  //
  // Every rule below obeys the three invariants plan 01 established:
  //   1. the zone map runs FIRST, so a signal only ever touches a free-prose
  //      line (D-07);
  //   2. a signal must be PRESENT — nothing is inferred, and every count
  //      threshold is the named MARKER_RUN_MIN, never a literal;
  //   3. words move, never change — every emitted line is a verbatim slice of
  //      the source plus list or heading scaffolding.
  //
  // All regexes here are linear-time and non-backtracking: no quantifier is
  // nested inside another over an overlapping character class, so a multi-KB
  // single-line CJK paragraph costs a single pass (T-26.88-04).

  // How many times any of `marks` occurs in `text`. Plain indexOf-style
  // splitting — no regex, so a marker glyph can never be read as syntax.
  function countMarks(text, marks) {
    var n = 0;
    for (var i = 0; i < marks.length; i++) {
      n += String(text).split(marks[i]).length - 1;
    }
    return n;
  }

  // Are these segments a LIST, or a sentence that happens to contain a
  // marker? At least two segments, and at least two of them short enough to
  // read as items. The FINAL segment may be any length and carries whatever
  // follows it — ending the run earlier would be a guess, which D-03 forbids.
  function segmentsReadAsItems(segs) {
    if (!segs || segs.length < 2) { return false; }
    var shortCount = 0;
    for (var i = 0; i < segs.length; i++) {
      if (Array.from(segs[i]).length <= ITEM_MAX_CHARS) { shortCount++; }
    }
    return shortCount >= 2;
  }

  // An INLINE run split at literal marker strings: the whole line is one
  // run, the head before the first marker must be empty (prose in front of a
  // marker is prose, not a list), and the segments must read as items.
  // Deliberately NOT folded into splitSeparatorRun: that one is shipped,
  // property-tested, and reached only after a colon promotion, and this phase
  // does not re-cut a proven path to save six lines.
  function splitInlineMarks(text, marks) {
    var body = String(text);
    if (countMarks(body, marks) < MARKER_RUN_MIN) { return null; }
    var parts = [body];
    for (var k = 0; k < marks.length; k++) {
      var next = [];
      for (var p = 0; p < parts.length; p++) {
        next = next.concat(parts[p].split(marks[k]));
      }
      parts = next;
    }
    if (stripLeadingMarkers(parts[0])) { return null; }
    var segs = [];
    for (var q = 1; q < parts.length; q++) {
      var seg = stripLeadingMarkers(parts[q]);
      if (seg) { segs.push(seg); }
    }
    return segmentsReadAsItems(segs) ? segs : null;
  }

  // A keycap emoji-numeral run (a digit, an optional variation selector, and
  // the combining enclosing keycap). Non-global on purpose: String.split
  // splits at every match either way, and a module-level /g regex carries
  // lastIndex state across calls, which is exactly the kind of hidden state
  // the module contract forbids.
  var KEYCAP_ONE_RE = new RegExp('[0-9#*][\\uFE0F]?[\\u20E3]');

  var KEYCAP_ALL_RE = new RegExp('[0-9#*][\\uFE0F]?[\\u20E3]', 'g');

  // Returns items ALREADY CARRYING THEIR OWN ORDINAL — the digit is the one
  // inside the author's keycap, never a renumbering. A run she wrote as
  // 2️⃣ 5️⃣ comes back as `2.` `5.`: renumbering would change a character she
  // typed, which is precisely what "words move, never change" forbids.
  // A non-digit keycap (#️⃣, *️⃣) is refused rather than guessed at.
  function splitKeycapRun(text) {
    var body = String(text);
    var found = body.match(KEYCAP_ALL_RE);
    KEYCAP_ALL_RE.lastIndex = 0;
    if (!found || found.length < MARKER_RUN_MIN) { return null; }
    for (var d = 0; d < found.length; d++) {
      if (!/^[0-9]/.test(found[d])) { return null; }
    }
    var parts = body.split(KEYCAP_ONE_RE);
    if (stripLeadingMarkers(parts[0])) { return null; }
    var segs = [];
    var texts = [];
    for (var i = 1; i < parts.length; i++) {
      var seg = stripLeadingMarkers(parts[i]);
      if (!seg) { return null; }
      texts.push(seg);
      segs.push(found[i - 1].charAt(0) + '. ' + seg);
    }
    return segmentsReadAsItems(texts) ? segs : null;
  }

  // An INLINE ordinal run: at least MARKER_RUN_MIN ordinals appearing
  // mid-line, each a one-to-three-digit number followed by a period or a
  // close paren AND THEN whitespace or end of line. The trailing-whitespace
  // lookahead is load-bearing: without it `1.5 cups` is eaten, and the paired
  // negative fixture is what keeps that honest. Built fresh per call so no
  // lastIndex survives between bodies.
  function splitOrdinalRun(text) {
    var body = String(text);
    var re = new RegExp(
      '(^|[^\\p{L}\\p{N}])(\\d{1,3}[.)])(?=[\\s\\u3000]|$)', 'gu');
    var marks = [];
    var m;
    while ((m = re.exec(body)) !== null) {
      var s = m.index + m[1].length;
      marks.push([s, s + m[2].length]);
      if (re.lastIndex <= m.index) { re.lastIndex = m.index + 1; }
    }
    if (marks.length < MARKER_RUN_MIN) { return null; }
    if (stripLeadingMarkers(body.slice(0, marks[0][0]))) { return null; }
    // The items come back CARRYING THE AUTHOR'S OWN ORDINAL, verbatim. A run
    // she wrote as `2.` `5.` is re-emitted as `2.` `5.` — renumbering it to
    // `1.` `2.` would change a character she typed.
    var segs = [];
    var texts = [];
    for (var i = 0; i < marks.length; i++) {
      var end = (i + 1 < marks.length) ? marks[i + 1][0] : body.length;
      var seg = stripLeadingMarkers(body.slice(marks[i][1], end));
      if (!seg) { return null; }
      texts.push(seg);
      segs.push(body.slice(marks[i][0], marks[i][1]) + ' ' + seg);
    }
    return segmentsReadAsItems(texts) ? segs : null;
  }

  // Whitespace-delimited token spans of a string, as [start, end] pairs.
  var TOKEN_RE = new RegExp('[^ \\t\\u3000]+', 'g');

  function tokenSpans(s) {
    var re = new RegExp(TOKEN_RE.source, 'g');
    var out = [];
    var m;
    while ((m = re.exec(s)) !== null) { out.push([m.index, re.lastIndex]); }
    return out;
  }

  // D-03a: one pin-marked SECTION, turned into {label, text}. The label is a
  // verbatim slice of what the author wrote after the marker; the rest is the
  // section's own text.
  //
  // WHERE THE LABEL ENDS IS THE WHOLE DIFFICULTY, and it is answered with the
  // author's own signal rather than with a character budget: the label runs
  // up to the point where the SCRIPT TURNS OVER into CJK — the shape the
  // corpus actually has, `📍<position>｜<place name> <中文 commentary>`. If the
  // length bound would cut the label before that turn, the rule REFUSES: a
  // label that ended where our budget ran out is not a label the author drew,
  // and inventing one there would be splitting running prose on a guess.
  //
  // The one exception is the fullwidth bar, and it is the author's own
  // explicit label separator: when the very first token carries the bar, that
  // token IS the label even though it begins in CJK. Both sides of the bar
  // survive inside the heading; the bar never splits a section.
  function pinSection(raw) {
    var s = stripLeadingMarkers(raw);
    if (!s) { return null; }
    var toks = tokenSpans(s);
    if (toks.length < 2) { return null; }
    var cut = -1;
    for (var i = 0; i < toks.length; i++) {
      if (CJK_CHAR_RE.test(s.charAt(toks[i][0]))) { cut = i; break; }
    }
    if (cut === -1) { return null; }          // no script turn: not a section
    if (cut === 0) {
      if (s.slice(toks[0][0], toks[0][1]).indexOf(LABEL_BAR) === -1) {
        return null;
      }
      cut = 1;                                // the bar phrase IS the label
    }
    var end = toks[cut - 1][1];
    var label = s.slice(0, end).replace(TAIL_SPACE_RE, '');
    var text = stripLeadingMarkers(s.slice(end));
    if (!label || !text) { return null; }
    if (Array.from(label).length > LABEL_MAX_CHARS) { return null; }
    if (!/\p{L}/u.test(label)) { return null; }
    return { label: label, text: text };
  }

  // D-03a: a run of pin-marked sections on ONE line. Every section must read
  // as a section or the whole line is left alone — a partial split would put
  // a heading in the middle of a sentence.
  function splitPinRun(text) {
    var body = String(text);
    if (countMarks(body, PIN_MARKERS) < MARKER_RUN_MIN) { return null; }
    var parts = [body];
    for (var k = 0; k < PIN_MARKERS.length; k++) {
      var next = [];
      for (var p = 0; p < parts.length; p++) {
        next = next.concat(parts[p].split(PIN_MARKERS[k]));
      }
      parts = next;
    }
    if (stripLeadingMarkers(parts[0])) { return null; }
    var out = [];
    for (var q = 1; q < parts.length; q++) {
      if (!stripLeadingMarkers(parts[q])) { continue; }
      var sec = pinSection(parts[q]);
      if (!sec) { return null; }
      out.push(sec);
    }
    return out.length >= MARKER_RUN_MIN ? out : null;
  }

  // Does this line BEGIN with one of `marks`? Returns the remainder after the
  // marker, or null. Used for runs the author spread across consecutive
  // lines rather than crammed onto one.
  function leadMark(line, marks) {
    var s = String(line).replace(LEAD_SPACE_RE, '');
    for (var i = 0; i < marks.length; i++) {
      if (s.indexOf(marks[i]) === 0) { return s.slice(marks[i].length); }
    }
    return null;
  }

  // Is this body one of rule 10's short posts? Both halves of the vault rule
  // are checked: fewer than SHORT_POST_LINES non-blank lines AND every one of
  // them short. See SHORT_POST_LINES for why the second half is load-bearing.
  function isShortPost(lines) {
    var n = 0;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].replace(/\r$/, '').trim();
      if (!t) { continue; }
      n++;
      if (Array.from(t).length > ITEM_MAX_CHARS) { return false; }
    }
    return n < SHORT_POST_LINES;
  }

  // A run the author spread across CONSECUTIVE lines rather than cramming
  // onto one — each line beginning with the same family's marker.
  function collectLeadRun(lines, start, leadOf) {
    var segs = [];
    var i = start;
    while (i < lines.length) {
      var rest = leadOf(lines[i].replace(/\r$/, ''));
      if (rest === null) { break; }
      var seg = stripLeadingMarkers(rest);
      if (!seg) { break; }
      segs.push(seg);
      i++;
    }
    if (segs.length < MARKER_RUN_MIN) { return null; }
    return { segs: segs, next: i };
  }

  // ...and the same, for a pin run written one section per line.
  function collectPinLeadRun(lines, start) {
    var secs = [];
    var i = start;
    while (i < lines.length) {
      var one = lines[i].replace(/\r$/, '');
      // exactly one pin on the line, or this is an INLINE run and belongs to
      // splitPinRun — swallowing a second pin into a section's text would
      // hide a whole section the author marked.
      if (countMarks(one, PIN_MARKERS) !== 1) { break; }
      var rest = leadMark(one, PIN_MARKERS);
      if (rest === null) { break; }
      var sec = pinSection(rest);
      if (!sec) { break; }
      secs.push(sec);
      i++;
    }
    if (secs.length < MARKER_RUN_MIN) { return null; }
    return { secs: secs, next: i };
  }

  // Returns the item ALREADY CARRYING the author's own digit, so a keycap run
  // written one step per line renumbers nothing.
  function keycapLead(line) {
    var s = String(line).replace(LEAD_SPACE_RE, '');
    var m = LEAD_KEYCAP_RE.exec(s);
    if (!m || !/^[0-9]/.test(m[0])) { return null; }
    var rest = stripLeadingMarkers(s.slice(m[0].length));
    if (!rest) { return null; }
    return m[0].charAt(0) + '. ' + rest;
  }

  function checkLead(line) { return leadMark(line, CHECK_MARKS); }
  function bulletLead(line) { return leadMark(line, BULLET_GLYPHS); }

  // What follows a promoted colon label, when it is a run. Ordered families
  // first (an ordinal or a keycap numbers itself, so the author already said
  // "these are steps"), then the unordered ones. Returns
  // {segs, ordered, pre, rest} or null — null means "one paragraph, verbatim".
  //
  // 26.88-17 (F-7): `pre` and `rest` are the separator family's two bounds and
  // are absent (undefined) for every other family, which is correct rather than
  // an omission — an ordinal, a keycap and a checkmark run each carry the
  // author's own per-item marker, so they already know where each item begins
  // and ends and never had the unbounded-span defect.
  //
  // `separatorBounds` is a MEASUREMENT SEAM threaded from structureBody's opts;
  // it is documented at its resolver and the shipped call site never passes it.
  function restRun(text, separatorBounds, ordinalGuard) {
    var segs = splitOrdinalRun(text);
    if (segs) { return { segs: segs, ordered: true }; }
    segs = splitKeycapRun(text);
    if (segs) { return { segs: segs, ordered: true }; }
    segs = splitInlineMarks(text, CHECK_MARKS);
    if (segs) { return { segs: segs, ordered: false }; }
    var sepRun = splitSeparatorRun(text, separatorBounds, ordinalGuard);
    if (sepRun) {
      return { segs: sepRun.segs, ordered: false, pre: sepRun.pre,
        rest: sepRun.rest };
    }
    return null;
  }

  // The list-forming runs on a line that carries no colon label. Runs the
  // author spread across consecutive LINES are tried first, then the same
  // families crammed INLINE onto this one line. Returns
  // {segs, ordered, next} or null.
  function lineRun(lines, i, line) {
    var r = collectLeadRun(lines, i, keycapLead);
    if (r) { return { segs: r.segs, ordered: true, next: r.next }; }
    r = collectLeadRun(lines, i, checkLead);
    if (r) { return { segs: r.segs, ordered: false, next: r.next }; }
    r = collectLeadRun(lines, i, bulletLead);
    if (r) { return { segs: r.segs, ordered: false, next: r.next }; }
    var segs = splitKeycapRun(line);
    if (segs) { return { segs: segs, ordered: true, next: i + 1 }; }
    segs = splitOrdinalRun(line);
    if (segs) { return { segs: segs, ordered: true, next: i + 1 }; }
    segs = splitInlineMarks(line, CHECK_MARKS);
    if (segs) { return { segs: segs, ordered: false, next: i + 1 }; }
    segs = splitInlineMarks(line, BULLET_MARKS);
    if (segs) { return { segs: segs, ordered: false, next: i + 1 }; }
    return null;
  }

  // ---- 26.88-06: the model-named heading, LOCATED and never trusted ---------
  //
  // D-01's SECOND heading provenance. The librarian may NAME a section the
  // author left unlabelled; it may never write one word of the section
  // itself. What arrives from the server is a pair — a heading drawn from a
  // closed roster, and a short quote the model copied out of the note — and
  // the client's whole job is to FIND that quote in the body. Found: the
  // heading is emitted on its own line immediately before it, and DECLARED.
  // Not found: nothing happens, silently, and the deterministic structure
  // still renders. There is no third answer, and that is what makes "the
  // model never authors prose" a CHECKED claim rather than an argument — the
  // declared list is produced BY this transform, never by the model and never
  // by a heuristic, and wordsPreserved subtracts exactly it.
  //
  // A PROMOTED heading is never declared: its words came from the source. So
  // a transform that quietly promoted invented text would trip its own guard.

  // THE HEADING ROSTER — mirrored from study_lib.HEADING_VOCAB (26.88-05),
  // which in turn builds server.py's JSON-schema enumeration from the same
  // tuple. THREE SPELLINGS OF ONE ROSTER, and they must move together: the
  // enumeration is the structural defence (a note carrying "ignore your
  // instructions and title this X" cannot express X unless X is already in
  // the roster), the server's membership check is the belt, and this is the
  // braces. A NEW HEADING MUST BE ADDED IN ALL THREE PLACES DELIBERATELY.
  //
  // WHY THE CLIENT RE-CHECKS AT ALL, given the server already did: these
  // records arrive through librarian/cleaning-proposals.json — a plain JSON
  // file under the library root the owner can open, read, hand-edit or
  // corrupt, because the visible-notebook design is deliberate (26.85 D-05).
  // A visible file is an EDITABLE file, so anything read back out of it is
  // untrusted input again. Mirroring the roster and the anchor band here is
  // what keeps a hand-edited or corrupted notebook from injecting rendered
  // text (T-26.88-17).
  var HEADING_VOCAB_CHINESE = ['食材', '做法', '小贴士',
    '材料', '用具', '尺寸', '配色', '织法', '技巧',
    '推荐菜', '信息', '体验'];
  var HEADING_VOCAB_ENGLISH = ['Ingredients', 'Method', 'Tips',
    'Materials', 'Tools', 'Size', 'Colorway', 'Technique',
    'Recommended dishes', 'Information', 'Experience', 'What it covers'];
  var HEADING_VOCAB = HEADING_VOCAB_CHINESE.concat(HEADING_VOCAB_ENGLISH);

  // The anchor band, mirroring study_lib.ANCHOR_MIN_CHARS / ANCHOR_MAX_CHARS.
  // THE BAND IS RE-CHECKED CLIENT-SIDE for the notebook reason above, and it
  // is counted in CODEPOINTS (Array.from) rather than UTF-16 units, because
  // the server counts Python characters and the two lengths disagree on any
  // astral codepoint — two spellings of one bound is exactly the drift this
  // comment exists to prevent.
  var ANCHOR_MIN_CHARS = 6;
  var ANCHOR_MAX_CHARS = 80;

  // One record from the progress payload, admitted or refused. The shape is
  // {heading, anchor}; the caller's own stamps (batch, at) ride along and are
  // ignored here. Refusal is total and silent — an unusable record yields no
  // heading, never a guessed one. Pure; never raises.
  function headingRecordOk(rec) {
    if (!rec || typeof rec !== 'object') { return false; }
    if (typeof rec.heading !== 'string' || !rec.heading) { return false; }
    if (HEADING_VOCAB.indexOf(rec.heading) === -1) { return false; }
    if (typeof rec.anchor !== 'string') { return false; }
    var n = Array.from(rec.anchor).length;
    return n >= ANCHOR_MIN_CHARS && n <= ANCHOR_MAX_CHARS;
  }

  // The character ranges of the SIX hands-off zones (D-07 plus the two this
  // file has gained since), as [start, end) pairs over `text`. The predicates
  // are the SAME six the transform's own zone map uses below, in the same
  // order — a heading may be emitted immediately BEFORE such a span, never
  // inside one, and this is how the placement rule answers "inside". Pure.
  //
  // 26.88-11: IT SAID FOUR, AND IT MEANT IT, AND IT WAS WRONG. The F-1 fix
  // (26.88-08) added the `%%` comment zone to `structureBody` and never added
  // it here, while this comment went on claiming parity — a live
  // one-rule-two-callers drift of exactly the shape F-1 itself was. It matters
  // because `placeHeadings` is this function's only caller: an anchor landing
  // inside a `%%` comment would have emitted a model-named heading bound to
  // text `cleanVaultMarkup` then deletes, which is F-1's exact rendered
  // symptom on the OTHER heading provenance. Both missing zones — the comment
  // and D-13's caption — are added here, and Z1/Z2 in
  // tests/test_reformat_fixtures.cjs assert the two callers agree so they
  // cannot drift apart again silently.
  //
  // A ZONE ADDED TO `structureBody` MUST BE ADDED HERE IN THE SAME COMMIT.
  function handsOffSpans(text) {
    var lines = String(text).split('\n');
    var offsets = [];
    var at = 0;
    var i;
    for (i = 0; i < lines.length; i++) {
      offsets.push(at);
      at += lines[i].length + 1;      // the '\n' the split consumed
    }
    var spans = [];
    function span(from, to) {
      spans.push([offsets[from], offsets[to] + lines[to].length]);
    }
    i = 0;
    while (i < lines.length) {
      var line = lines[i].replace(/\r$/, '');
      if (line.indexOf('%%') !== -1) {                // an Obsidian %% comment
        var cOpen = i;
        var cCloses = line.indexOf('%%', line.indexOf('%%') + 2) !== -1;
        i++;
        if (!cCloses) {                               // a multi-line comment
          while (i < lines.length) {
            var cl = lines[i].replace(/\r$/, '');
            i++;
            if (cl.indexOf('%%') !== -1) { break; }
          }
        }
        span(cOpen, i - 1);
        continue;
      }
      if (WHOLLY_EMPHASIZED_RE.test(line)) {          // an emphasis-wrapped
        span(i, i);                                   // caption (D-13)
        i++;
        continue;
      }
      if (/^\s{0,3}(```|~~~)/.test(line)) {           // a fenced block
        var open = i;
        i++;
        while (i < lines.length) {
          var fl = lines[i].replace(/\r$/, '');
          i++;
          if (/^\s{0,3}(```|~~~)/.test(fl)) { break; }
        }
        span(open, i - 1);
        continue;
      }
      if (line.indexOf('|') !== -1 && i + 1 < lines.length) {   // a table
        var sepLine = lines[i + 1].replace(/\r$/, '');
        if (/^[ \t]{0,3}\|?[\s:|-]{3,}\|?[ \t]*$/.test(sepLine) &&
            sepLine.indexOf('-') !== -1) {
          var top = i;
          i += 2;
          while (i < lines.length && lines[i].indexOf('|') !== -1) { i++; }
          span(top, i - 1);
          continue;
        }
      }
      if (/^\s{0,3}>/.test(line)) {                   // a blockquote run
        var quote = i;
        while (i < lines.length &&
            /^\s{0,3}>/.test(lines[i].replace(/\r$/, ''))) { i++; }
        span(quote, i - 1);
        continue;
      }
      if (/^\s*!\[/.test(line)) {                     // an image/attachment
        span(i, i);
        i++;
        continue;
      }
      i++;
    }
    return spans;
  }

  // ANCHOR-OR-SKIP PLACEMENT. For each record, in order: admit it or drop it,
  // locate the anchor as a VERBATIM SUBSTRING of the body, refuse a match
  // inside a hands-off span, else break the line at the anchor's start index
  // and emit the heading on its own line immediately before it. Breaking AT
  // the anchor is what lets a heading land mid-line, which is exactly the
  // shape the worked example needs: it is what terminates the ingredient run
  // and starts the method section.
  //
  // THE FIRST-OCCURRENCE RULE. Where the anchor occurs MORE THAN ONCE in the
  // full body, the heading is placed at the FIRST occurrence. The server
  // already refused every anchor that was ambiguous in the excerpt it sent
  // (anchor_unique != 1 drops), so what is left here is the case that is
  // ambiguous only in the full body — and about that case the client must be
  // DETERMINISTIC rather than clever. First, always.
  //
  // `declared` is the transform's own added-headings list and is appended to
  // ONLY here, ONLY on a heading that actually reached the output. Pure: no
  // DOM, no clock, no randomness, no I/O.
  function placeHeadings(src, headings, declared) {
    var list = Array.isArray(headings) ? headings : [];
    if (!list.length) { return src; }
    var text = String(src);
    // The document's own line ending, so an inserted break matches the note
    // rather than quietly mixing CRLF and LF into her file's display form.
    var nl = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    for (var r = 0; r < list.length; r++) {
      var rec = list[r];
      if (!headingRecordOk(rec)) { continue; }
      var idx = text.indexOf(rec.anchor);
      if (idx === -1) { continue; }            // invented, or the note moved
      var spans = handsOffSpans(text);
      var inside = false;
      for (var s = 0; s < spans.length; s++) {
        if (idx >= spans[s][0] && idx < spans[s][1]) { inside = true; break; }
      }
      if (inside) { continue; }
      var head = text.slice(0, idx);
      var lead;
      if (!head) { lead = ''; }
      else if (/(\r?\n)[ \t]*(\r?\n)$/.test(head)) { lead = ''; }
      else if (/\r?\n$/.test(head)) { lead = nl; }
      else { lead = nl + nl; }
      text = head + lead + '## ' + rec.heading + nl + nl + text.slice(idx);
      declared.push(rec.heading);
    }
    return text;
  }

  // THE transform (D-03/D-03a/D-07, and D-01's placement since 26.88-06).
  // Returns {text, addedHeadings} — a markdown string that is only ever
  // slices of the source plus list/heading scaffolding, and the list of
  // headings this call ADDED.
  //
  // `headings` is the per-item list of records from the server's progress
  // payload: each carries a heading string and an anchor string. A null or
  // an empty list means STRUCTURE-ONLY — the untidied path, and the common
  // one. Only a MODEL-NAMED heading is ever added to the returned list; a
  // PROMOTED heading is not, because its words came from the source.
  //
  // In this order:
  //   (0) the two safety bounds — the size ceiling (above it the body is
  //       returned exactly as saved) and rule 10's short-post suppressor
  //       (which hides HEADERS only; list conversion still applies).
  //   (0b) ANCHOR PLACEMENT, before every signal rule. The signal rules then
  //       run over the RESULTING lines, so a promoted heading and a
  //       model-named heading compose without either one knowing about the
  //       other. The short-post suppressor covers this step too: rule 10 says
  //       don't add headers to a brief post, and a named heading is a header
  //       — so the suppressor is measured on the body AS SAVED, before any
  //       placement, and a suppressed post takes the structure-only path.
  //   (a) the zone map — fenced blocks, markdown tables, blockquote runs and
  //       image/attachment lines are HANDS-OFF (D-07): copied byte for byte,
  //       never split, joined, reordered, or re-marked. A heading may be
  //       emitted immediately BEFORE such a span, never inside one.
  //   (b) the signal rules, on free-prose lines only: the D-03a pin run
  //       first (it out-ranks the colon rule, because a pin-marked section
  //       may itself contain a colon), then the colon-label promotion, then
  //       the four list-forming runs.
  // 26.88-13 (D-15): EACH LINE'S ENCLOSING BLOCK LENGTH, in characters. One
  // pass over the line array, returning a parallel array; a blank line gets 0.
  //
  // THE STRUCTURAL WRINKLE THIS EXISTS FOR: D-15's threshold is a property of
  // the BLOCK, and structureBody iterates LINES. `marked` joins single
  // newlines, so a six-line run with no blank line between the lines is ONE
  // rendered paragraph — one wall, as the reader meets it. Gating on LINE
  // length would be honest about the source and dishonest about what she sees:
  // it would leave exactly that shape untouched while breaking a single long
  // line of the same total size. Fixture S10 pins both halves.
  //
  // The block figure counts the single newlines the renderer joins, so it is
  // the length of the paragraph as rendered rather than the sum of its parts.
  // Pure: no DOM, no clock, no randomness, no I/O.
  function blockLengths(lines) {
    var arr = new Array(lines.length);
    var i = 0;
    while (i < lines.length) {
      var here = String(lines[i]).replace(/\r$/, '');
      if (!here.trim()) { arr[i] = 0; i++; continue; }
      var j = i;
      var n = 0;
      while (j < lines.length) {
        var l = String(lines[j]).replace(/\r$/, '');
        if (!l.trim()) { break; }
        n += l.length;
        j++;
      }
      n += (j - i - 1);                       // the joining newlines
      for (var k = i; k < j; k++) { arr[k] = n; }
      i = j;
    }
    return arr;
  }

  // 26.88-17 (F-4): WOULD A BREAK AFTER `index` TEAR AN IMAGE IN HALF?
  //
  // `!` immediately followed by `[` is ONE TOKEN — the Obsidian embed
  // `![[picture.jpg]]` and the markdown image `![](path.png)`. Both syntaxes
  // begin with those same two characters, so ONE test covers both, and no
  // sentence-boundary break may ever land between them.
  //
  // WHAT IT DECIDES. `index` is the LAST CHARACTER THE SPLIT WOULD CONSUME —
  // `splitSentences`'s `j`, after its run of terminators and closers. The break
  // lands just past it, so the question is whether that character is an
  // exclamation mark with an opening square bracket glued to its right.
  //
  // IT IS D-15'S **THIRD** REFUSAL, alongside the terminator guard and the span
  // guard, and it is a FOURTH instance of this phase's standing posture:
  // REFUSE THE SPLIT AT ITS CAUSE rather than let D-14's guard fall the whole
  // note back to as-saved. Q5 took that posture for the colon (26.88-11), M4b
  // for the separator (26.88-13), and this is the third rule to take it.
  //
  // IT HAS EXACTLY ONE CALLER, and the reason is measured rather than assumed:
  // all FOURTEEN live notes carrying this defect arrive through D-15 (F-4,
  // 26.88-15-FINDINGS.md, verified individually at `2e7f7d2` and re-printed by
  // `tools/replan_probe.cjs` at `b7d7661` as fourteen clean-seam trips, every
  // one breaking `[[]] n->n-1`). No other emitter in this module can place a
  // break between an exclamation mark and a bracket: the colon rule cuts at a
  // colon, the run rules cut at their own separators, and the zone map copies.
  //
  // WHY `openSpanAt` DOES NOT ALREADY ANSWER THIS, stated because it is the
  // first place anyone looks: the split point is BEFORE the `!`, so no span is
  // open at it and `openSpanAt` correctly returns false. The missing rule is
  // not "is a span open" but "does this break strand a trailing `!` from the
  // `[[` it belongs to".
  //
  // WHY D-07'S IMAGE ZONE DOES NOT ALREADY ANSWER IT EITHER: that zone is
  // LINE-ANCHORED. On the two notes measured in F-4 the embed sits at character
  // 980 and 650, with 979 and 649 characters of prose ahead of it ON THE SAME
  // LINE, and `handsOffSpans` reports nothing. A picture on its own line is
  // protected; a picture at the end of a sentence is not.
  //
  // THE FULLWIDTH `！` IS DELIBERATELY NOT IN THIS TEST. It is not part of
  // either image syntax, so refusing there would refuse an ordinary CJK
  // sentence end sitting in front of a plain `[[wiki link]]` — a link, not a
  // picture. Fixture F4-5 says so out loud.
  //
  // Pure: no DOM, no clock, no randomness, no I/O. Never raises — an empty
  // string, a null body, a negative index and an index at or past the last
  // character all answer false, which is the same never-raises posture
  // `openSpanAt` takes.
  function splitsImageToken(text, index) {
    var s = String(text == null ? '' : text);
    var i = Number(index);
    if (!isFinite(i) || i < 0 || i + 1 >= s.length) { return false; }
    return s.charAt(i) === '!' && s.charAt(i + 1) === '[';
  }

  // 26.88-20 (F-12): WOULD A BREAK AFTER `index` STRAND AN ENUMERATOR FROM THE
  // SENTENCE IT NUMBERS?
  //
  // `1.` in `我的几点感受： 1. 费曼父亲对他的引导非常重要。 2. …` is an ORDERED-LIST
  // ENUMERATOR, not a full stop. Its period belongs to the numeral the way
  // F-4's `!` belongs to the `[` — punctuation that is part of a token, read
  // as a terminator. This is that defect's family, at the same seam, taking
  // the same posture: REFUSE THE SPLIT AT ITS CAUSE.
  //
  // WHAT THE READER SAW. Live note `703412c23a752cf6` (观后感 — 费曼采访的几点感受)
  // laid out five numbered points as TEN blocks — `1.` alone on its own line,
  // its sentence in the next block, five times over. Measured at `0a4a221`,
  // before this rule: `CORE.splitSentences('我的几点感受： 1. 费曼父亲对他的引导非常
  // 重要。 2. 费曼很有自己的主见。')` returned four segments, of which two were the
  // bare strings `"我的几点感受： 1."` and `"2."`. That reads WORSE than as-saved,
  // which is a floor this phase cannot ship under. The owner said so on sight
  // during the plan-20 UAT: the sentences after 1./2./3. "should be connected
  // together".
  //
  // WHAT IT DECIDES. `index` is the terminator position `i` — the character
  // the run STARTED at, not `j` where it ended, because the question is about
  // what sits BEFORE the dot rather than after it. True only when that dot is
  // the tail of a short digit run that stands alone: one to three digits, with
  // a NON-ALPHANUMERIC (or the start of the block) in front of them, and
  // whitespace or the end of the block behind the dot.
  //
  // WHY EACH CLAUSE IS THERE, AND THE ONE IT MUST NOT BREAK:
  //   * ASCII `.` ONLY. `。` is never an enumerator's mark, and refusing there
  //     would refuse the entire CJK half of D-15's rule.
  //   * ONE TO THREE DIGITS, and the bound is what keeps `He was born in 1999.
  //     The next year…` splitting exactly as it always has: `1999` is FOUR
  //     digits, so the scan walks three of them and finds `1` — alphanumeric —
  //     in front, which is not a boundary, and the answer is false. Fixture
  //     F12-3 asserts that direction; without a bound this rule would silently
  //     stop every English sentence that ends on a number.
  //   * A NON-ALPHANUMERIC IN FRONT. `v1.` and `1999.` are numbers glued to
  //     something; ` 1.` and `：1.` and a block-initial `1.` are enumerators.
  //   * WHITESPACE OR END BEHIND. `2.5mm` is already refused one clause
  //     earlier by the terminator guard; this clause states the same shape
  //     locally so the predicate is honest read on its own.
  //
  // THREE SPELLINGS OF THE 1-3-DIGIT ENUMERATOR NOW EXIST AND THEY MUST MOVE
  // TOGETHER — it is stated here rather than abstracted away, because two of
  // the three are deliberately independent and collapsing them would be the
  // error, not the fix:
  //   1. `splitOrdinalRun`'s `(^|[^\p{L}\p{N}])(\d{1,3}[.)])(?=[\s　]|$)`
  //      — a FORWARD, GLOBAL scan answering a different question ("is this
  //      whole line a RUN of items?"), over `[.)]` rather than `.` alone.
  //   2. `normalizeWords` stage 4(a)'s copy — DELIBERATELY independent: it is
  //      the guard's own tokenizer and its comment at core.js:1279 says it
  //      "shares the tokenizer with nothing but itself".
  //   3. This one — a BACKWARD, LOCAL answer about ONE dot.
  // A change to the bound is a change to all three.
  //
  // IT HAS EXACTLY ONE CALLER, for F-4's reason: no other emitter in this
  // module can place a break between a numeral and the sentence it numbers.
  //
  // Pure: no DOM, no clock, no randomness, no I/O. Never raises — an empty
  // string, a null body, a negative index and an out-of-range index all answer
  // false, the same never-raises posture `openSpanAt` and `splitsImageToken`
  // take.
  function splitsOrdinalEnumerator(text, index) {
    var s = String(text == null ? '' : text);
    var i = Number(index);
    if (!isFinite(i) || i < 0 || i >= s.length) { return false; }
    if (s.charAt(i) !== '.') { return false; }
    var k = i - 1;
    var n = 0;
    while (k >= 0 && n < ORDINAL_ENUMERATOR_MAX_DIGITS &&
        SENTENCE_DIGIT_RE.test(s.charAt(k))) { k--; n++; }
    if (n === 0) { return false; }
    if (k >= 0 && ORDINAL_ENUMERATOR_WORD_RE.test(s.charAt(k))) { return false; }
    var next = i + 1 < s.length ? s.charAt(i + 1) : null;
    if (next !== null && !SENTENCE_SPACE_RE.test(next)) { return false; }
    return ordinalEnumeratorOpensAnItem(s, i, k + 1, n);
  }

  // TRUE when the enumerator mark `<value>.` or `<value>)` occurs in
  // `s.slice(from, to)` at a legal enumerator position. Values below 1 are not
  // enumerators at all — `$180,000.` walks back three digits to `000`, and
  // without this line its "successor" would be `1.`, which appears in half the
  // enumerated notes in the library.
  function enumeratorMarkAt(s, value, from, to) {
    if (!(value >= 1)) { return false; }
    return new RegExp('(^|[^\\p{L}\\p{N}])' + String(value) +
      '[.)](?=[\\s　]|$)', 'u').test(s.slice(from, to));
  }

  // 26.88 code review WR-03: DOES THIS NUMERAL OPEN AN ITEM, OR IS IT A NUMBER
  // IN HER PROSE? The clauses above answer "could this dot be an enumerator's
  // by shape" — a short digit run, a non-alphanumeric in front, whitespace
  // behind. That was the whole rule, and the whole rule was too wide: over the
  // live library it refused 102 more block boundaries than it allowed, and at
  // least nine of those were plain full stops. Observed, each on a named note:
  //
  //   "They only want an **update** by December 4." | "So you can safely reply:"
  //   "…I have read it three times, at ages 10, 18, and 28." | "Each reading…"
  //   "…I throw the money away for this $800." | "Of course, he couldn't…"
  //   "…didn't realize I'd missed your message until 12:30." | "I understand…"
  //
  // Her words all survive, so this is a legibility regression rather than a
  // law-4 breach — but legibility is what the phase is for, and F-12's own
  // stated floor is "that reads WORSE than as-saved".
  //
  // THREE WAYS A NUMERAL EARNS THE REFUSAL, and there is no fourth:
  //
  //   (a) IT OPENS ITS LINE, through indentation and any list / quote /
  //       heading marker. This is the overwhelming majority of live
  //       enumerators and it is what keeps `\n\n1. **Prepare Your Forms**`
  //       behaving exactly as it always has.
  //   (b) IT OPENS A CLAUSE — a full stop or a colon, in either width, then
  //       optional whitespace. `我的几点感受：1.` is her own shape and the
  //       reason F-12 exists. THE COLON MAY NOT HAVE A DIGIT IN FRONT OF IT:
  //       `12:30.` has the identical local shape and is a clock.
  //   (c) IT IS ONE OF A SEQUENCE — its predecessor appears earlier in the
  //       block or its successor appears later. This is what catches the
  //       inline runs (`…this program has two parts 1. … 2. …`) that neither
  //       (a) nor (b) can see, and BOTH DIRECTIONS ARE REQUIRED: with only
  //       the successor half, the LAST item of every inline run loses its
  //       refusal and comes back as a bare numeral — five of them on the
  //       live corpus when it was measured.
  //
  // THE REVIEW PROPOSED A DIFFERENT RULE — "the token before the digit run is
  // not a letter-word on the same line" — AND IT WAS MEASURED AND REJECTED.
  // It recovers the nine, and it also destroys `So 1.`, `Because 1.`,
  // `two parts 1.` and `烹饪步骤 1.`, which are the exact shape the owner
  // complained about on sight during the plan-20 UAT. A letter-word in front
  // is not the discriminator; being one of a sequence is.
  //
  // MEASURED, the shipped rule vs this one, over all 2,945 text notes:
  //   notes whose laid-out shape moves                 24
  //   bare-numeral blocks emitted, guard OFF / shipped / this rule
  //                                                    12 / 1 / 1
  // The defect F-12 exists to prevent does not come back, and 24 notes get
  // their sentence boundaries returned.
  //
  // Pure: no DOM, no clock, no randomness, no I/O. Never raises.
  function ordinalEnumeratorOpensAnItem(s, dot, first, digits) {
    var p = first - 1;
    while (p >= 0 && (s.charAt(p) === ' ' || s.charAt(p) === '\t')) { p--; }
    while (p >= 0 && ORDINAL_LIST_MARKER_RE.test(s.charAt(p))) {
      p--;
      while (p >= 0 && (s.charAt(p) === ' ' || s.charAt(p) === '\t')) { p--; }
    }
    if (p < 0 || s.charAt(p) === '\n') { return true; }              // (a)
    if (ORDINAL_CLAUSE_OPENER_RE.test(s.charAt(p)) &&                // (b)
        !(p > 0 && SENTENCE_DIGIT_RE.test(s.charAt(p - 1)))) { return true; }
    var v = Number(s.slice(first, first + digits));                  // (c)
    if (!isFinite(v)) { return false; }
    return enumeratorMarkAt(s, v - 1, 0, first) ||
      enumeratorMarkAt(s, v + 1, dot + 1, s.length);
  }

  // 26.88-13 (D-15): THE GUARDED SPLIT. Returns the sentences of `text`, or
  // NULL when no split point survives the guards — and null is the ordinary
  // answer, not an error: a block that offers no legal boundary is left exactly
  // as saved, which is always a valid answer (the same fail-safe posture D-04
  // and the size ceiling take).
  //
  // A split point is a SENTENCE_ENDERS character, plus any RUN of terminators
  // and any following SENTENCE_CLOSERS, that passes ALL FOUR guard rules. The
  // first two are not taste; they are the full classification of all 1,304
  // candidate split points in the live library, MEASURED BEFORE THE THIRD GUARD
  // EXISTED and NOT re-run for it. The third guard's own population is the
  // FOURTEEN notes F-4 names, counted separately and printed by
  // `tools/replan_probe.cjs` as its clean-seam trip list:
  //
  //   1. THE TERMINATOR GUARD (ASCII only — CJK does not use whitespace, so
  //      requiring it there would refuse the entire CJK half of the rule):
  //        * must be followed by whitespace or the end of the block. 310 of the
  //          1,304 points (23.8%) fail here — every `file.pdf`, every
  //          `src="x.png"`, every dotted URL path, every HTML attribute. This
  //          single clause is the highest-value guard in the set.
  //        * must not sit between two digits (`2.5mm`, `3.25mm` — her knitting
  //          notes are full of hook sizes).
  //          HONEST LABEL: on the rule as it ships this clause is SUBSUMED by
  //          the whitespace clause and decides nothing — a digit after the dot
  //          is not whitespace, and the end-of-block case has no following
  //          digit to test. It is kept because D-15 names it and because
  //          relaxing the whitespace clause would make it live again, and it is
  //          labelled here rather than presented as load-bearing. Fixture S14
  //          says the same thing out loud.
  //        * must not close a SENTENCE_ABBREVIATIONS entry (`Dr.`, `etc.`).
  //   2. THE SPAN GUARD: `openSpanAt(text, index)` must be false. The SAME
  //      helper, the same three rosters and the same predicate plan 11 built
  //      for Q5 — one helper, three callers, so the refusals can never disagree
  //      about what a span is. A markdown pair cannot cross a blank line, so a
  //      break inside an open span provably stops it being a pair.
  //   3. THE IMAGE-TOKEN GUARD (26.88-17, F-4): `splitsImageToken(text, j)`
  //      must be false. It decides what NEITHER of the other two can, and that
  //      is why it is a third rule rather than a clause in one of them —
  //      the terminator guard only ever looks at the character AFTER the run
  //      (here `[`, which is neither whitespace nor a digit nor an
  //      abbreviation, so on the CJK path it is never consulted at all), and
  //      the span guard asks about `i`, where nothing is open yet because the
  //      `[[` starts AFTER the break. Its population is the fourteen notes F-4
  //      names: a `。` immediately followed by an inline `![[…]]`, where the
  //      `!` was consumed into the ender run and stranded.
  //   4. THE ORDINAL-ENUMERATOR GUARD (26.88-20, F-12):
  //      `splitsOrdinalEnumerator(text, i)` must be false. F-4's family, one
  //      punctuation mark over: a `.` that belongs to the numeral in front of
  //      it rather than to the sentence behind it. Its population is measured
  //      by `tools/replan_probe.cjs` on the live library rather than declared
  //      here, for the reason the third guard's is: a count nobody can
  //      reproduce is not evidence. Asked at `i`, not `j` — see its own
  //      comment for why, and for the one case it must NOT refuse
  //      (`…in 1999. The next…`).
  //
  // EVERY RETURNED SEGMENT IS A SLICE OF `text`. Nothing is re-joined,
  // normalised, reordered or rewritten. The ONE thing a segment loses is
  // SURROUNDING WHITESPACE: the space that joined two English sentences, and
  // any indentation. That trim is deliberate and is what the measured reference
  // did — without it a block whose sentences are separated by four or more
  // spaces would emit a segment that markdown reads as an INDENTED CODE BLOCK,
  // which would change the rendering of her words rather than just their
  // spacing. Fixtures S8/S11 assert the two sides are identical once whitespace
  // is stripped, so "only whitespace ever moves" is a test rather than a claim.
  //
  // Pure: no DOM, no clock, no randomness, no I/O. Never raises.
  // 26.88-17: `imageTokenGuard` is a MEASUREMENT SEAM on the THIRD refusal
  // only, threaded from `structureBody`'s `opts.imageTokenGuard` and documented
  // at its resolver. Passing `false` restores the pre-F-4 break, which is what
  // lets `tools/replan_probe.cjs` count "recovered" notes as a DIFFERENCE
  // BETWEEN TWO RUNS OF THE SHIPPED TRANSFORM rather than against a list
  // somebody typed in. It reaches ONLY the refusal below: `runSentenceSpan`,
  // this function's other caller, always asks the shipped rule, because the
  // twin run must differ in exactly one thing or it attributes nothing.
  // 26.88-20: `ordinalGuard` is the SAME KIND OF SEAM on the FOURTH refusal,
  // and it exists for a reason worth stating plainly: WITHOUT IT THE PROBE
  // CANNOT SEE F-12 AT ALL. Re-run across the F-12 fix with no seam, every one
  // of `tools/replan_probe.cjs`'s twenty-odd figures was byte-identical — the
  // output sha256 did not change — because none of them counts a block. A
  // re-run that cannot move is a check that measures nothing, which is this
  // phase's named defect class; the seam is what turns "the diff was empty"
  // into a number. Same discipline as the other two: only the exact value
  // `false` disables, and it reaches ONLY the refusal below.
  // ASCII whitespace ONLY, and that restriction is the whole point.
  //
  // ⚠ FOUND ON HER REAL VAULT (2026-08-15), by the write gate refusing three
  // notes it was right to refuse. `String.trim()` strips every character
  // Unicode calls whitespace — which includes NARROW NO-BREAK SPACE (U+202F)
  // and LINE SEPARATOR (U+2028). Those are characters somebody's text
  // actually contains: trimming a sentence with it DELETED 26 of one note's
  // 32 narrow spaces and 2 of another's 3 line separators. Invisible on
  // screen, gone from the file — the exact class of silent loss law 9 is
  // written against, and the sixth thing this rule was found to do that
  // nobody asked it to.
  //
  // ⚠ IT ALSO PUT THE RULE AND ITS GUARD OUT OF STEP. `_readability_same_words`
  // works on BYTES and counts only ASCII whitespace as space, so anything
  // else is a character to it. A layout rule allowed to eat characters its
  // own gate protects can only ever produce refusals — which is what it did.
  // Trimming the same set the gate does is what makes the two agree.
  function trimAsciiSpace(text) {
    return String(text == null ? '' : text)
      .replace(/^[ \t\n\r\f\v]+/, '').replace(/[ \t\n\r\f\v]+$/, '');
  }

  function splitSentences(text, imageTokenGuard, ordinalGuard) {
    var s = String(text == null ? '' : text);
    var out = [];
    var start = 0;
    for (var i = 0; i < s.length; i++) {
      if (SENTENCE_ENDERS.indexOf(s.charAt(i)) === -1) { continue; }
      var ascii = s.charCodeAt(i) < 128;
      // consume the RUN: `！！！` is one person raising her voice once, and a
      // closing quote belongs to the sentence it closes.
      var j = i;
      while (j + 1 < s.length &&
          (SENTENCE_ENDERS.indexOf(s.charAt(j + 1)) !== -1 ||
           SENTENCE_CLOSERS.indexOf(s.charAt(j + 1)) !== -1)) { j++; }
      var next = j + 1 < s.length ? s.charAt(j + 1) : null;
      if (ascii) {
        if (next !== null && !SENTENCE_SPACE_RE.test(next)) { i = j; continue; }
        if (SENTENCE_DIGIT_RE.test(s.charAt(i - 1)) &&
            SENTENCE_DIGIT_RE.test(s.charAt(i + 1))) { i = j; continue; }
        if (SENTENCE_ABBR_RE.test(s.slice(i < 10 ? 0 : i - 10, i + 1))) {
          i = j; continue;
        }
      }
      if (openSpanAt(s, i)) { i = j; continue; }
      // 26.88-17 (F-4): THE THIRD REFUSAL. The run may have swallowed the `!`
      // of an inline image; if it did, the break lands inside one token and
      // tears the picture in half. Continue the scan from `j`, exactly as the
      // other two guards do.
      if (imageTokenGuard !== false && splitsImageToken(s, j)) {
        i = j; continue;
      }
      // 26.88-20 (F-12): THE FOURTH REFUSAL. The dot may be an ordered-list
      // enumerator's rather than a full stop; if it is, the break strands the
      // numeral from the sentence it numbers. Asked at `i` — the terminator
      // itself — because the evidence sits BEFORE the dot, which is why it is
      // a fourth rule rather than a clause in one of the other three: the
      // terminator guard only ever looks at what follows the RUN, and there
      // `1. 费曼…` is whitespace and passes; the digit clause asks about a
      // digit on BOTH sides and here the right side is a space; the span
      // guard asks whether a markup pair is open, and none is. The scan
      // continues from `j`, exactly as the other three do.
      if (ordinalGuard !== false && splitsOrdinalEnumerator(s, i)) {
        i = j; continue;
      }
      var seg = trimAsciiSpace(s.slice(start, j + 1));
      if (seg) { out.push(seg); }
      start = j + 1;
      i = j;
    }
    var tail = trimAsciiSpace(s.slice(start));
    if (tail) { out.push(tail); }
    return out.length > 1 ? out : null;
  }

  // `opts` is a MEASUREMENT SEAM and is documented at its resolver below.
  function structureBody(body, headings, opts) {
    var src = String(body == null ? '' : body);
    var addedHeadings = [];
    if (!src) { return { text: '', addedHeadings: addedHeadings }; }
    // The ceiling. Rendering as saved is ALWAYS a valid answer, so the
    // oversize path is law-4-safe by construction and throws nothing.
    if (src.length > MAX_REFORMAT_BYTES) {
      return { text: src, addedHeadings: addedHeadings };
    }
    // 26.88-13 (D-15/D-20): THE THRESHOLD SEAM. ONE recognized key,
    // `sentenceBreakMin`; a positive FINITE number wins, anything else falls
    // back to the constant. No literal is introduced — the default is
    // SENTENCE_BREAK_MIN and nothing else.
    //
    // WHY IT EXISTS. D-20 is on the record that widening the threshold later is
    // "a one-line change plus a re-measure", and T=400 was measured and
    // deliberately not taken. The re-measure half of that promise is only
    // demonstrable if tools/replan_probe.cjs can run the SHIPPED transform at
    // an alternative threshold — and once the probe's own simulation of this
    // rule is deleted (26.88-13 task 3) it cannot do that by assigning
    // `CORE.SENTENCE_BREAK_MIN`. `root.StudyCore` at the foot of this file is
    // built as a VALUE COPY of the module's closure vars, and every internal
    // reader reads the closure var directly — LABEL_MAX_CHARS is declared once
    // and read by promoteColonLabel, never through the export. Assigning the
    // export changes nothing inside this IIFE. Without this seam the `T` env
    // var silently stops working, `T=400` prints the SAME reach as `T=600`, and
    // D-20's recorded promise quietly becomes false in the same commit that
    // discharged the deletion contract.
    //
    // WHAT IT IS NOT. It is not a feature: no UI, no config key, no persisted
    // setting, and the app's single call site (app.js,
    // `StudyCore.structureBody(src, headingsFor(id))`) passes two arguments and
    // always will — asserted by a fixture that forbids the key's NAME anywhere
    // in app.js, because a third argument at the call site means the shipped
    // room could run at a threshold LIBRARIAN.md does not disclose.
    //
    // TWO ALTERNATIVES, BOTH REJECTED. An exported SETTER would be global
    // mutable state in shipped code, reachable from anywhere and invisible at
    // the call site. Having the probe COMPOSE blockLengths + splitSentences
    // with its own `>` comparison would be a SECOND SPELLING of the D-15 gate —
    // one that runs behind neither the zone map nor the signal rules, so it
    // would over-report reach on the very number the owner is shown in order to
    // decide between 600 and 400. That is exactly the one-rule-two-spellings
    // failure the deletion contract exists to forbid.
    var sentenceBreakMin = SENTENCE_BREAK_MIN;
    if (opts && typeof opts.sentenceBreakMin === 'number' &&
        isFinite(opts.sentenceBreakMin) && opts.sentenceBreakMin > 0) {
      sentenceBreakMin = opts.sentenceBreakMin;
    }
    // 26.88-17 (F-7): THE SECOND MEASUREMENT SEAM, built to the identical
    // shape and fenced by the identical fixture. ONE recognized key,
    // `separatorBounds`; the DEFAULT IS THE SHIPPED BEHAVIOUR and only the
    // exact value `false` turns the bounds off. Everything else — absent,
    // undefined, 0, 'no' — leaves them on, so a typo can never silently
    // measure the wrong transform.
    //
    // WHY IT EXISTS. `tools/replan_probe.cjs` attributes a moved figure to one
    // rule by running the SHIPPED transform TWICE and differencing, one
    // argument apart — the construction the D-15 column already uses and the
    // only one in this repository that can attribute a change to a single
    // rule. Without this seam the probe would have to carry a second spelling
    // of the separator rule to isolate it, which the deletion contract at the
    // head of that file forbids.
    //
    // WHAT IT IS NOT. Not a feature: no UI, no config key, no persisted
    // setting. The app's single call site (`app.js`,
    // `StudyCore.structureBody(src, headingsFor(id))`) passes two arguments and
    // always will — asserted by a fixture that forbids this key's NAME anywhere
    // in app.js, because a third argument at the call site means the shipped
    // room could run at a setting LIBRARIAN.md does not disclose.
    var separatorBounds = true;
    if (opts && opts.separatorBounds === false) { separatorBounds = false; }
    // 26.88-17 (F-4): THE THIRD MEASUREMENT SEAM, same shape, same fence.
    // ONE recognized key, `imageTokenGuard`; the default is the shipped
    // behaviour and only the exact value `false` restores the pre-F-4 break.
    // It exists so the probe can count the notes F-4 RECOVERED as a difference
    // between two runs of the shipped transform — the only construction in this
    // repository that can attribute a change to one rule. Counting them against
    // F-4's recorded fourteen instead would be a gate reading its number from a
    // list rather than from the transform it asserts.
    var imageTokenGuard = true;
    if (opts && opts.imageTokenGuard === false) { imageTokenGuard = false; }
    // 26.88-20 (F-12): THE FOURTH MEASUREMENT SEAM, same shape, same fence.
    // ONE recognized key, `ordinalEnumeratorGuard`; the default is the shipped
    // behaviour and only the exact value `false` restores the pre-F-12 break
    // that left a numeral alone in its own block. It exists because WITHOUT IT
    // THE PROBE CANNOT SEE F-12: measured on 2026-08-03, re-running the probe
    // across the fix produced a byte-identical output, sha256 and all. A
    // re-run that cannot move is not evidence that nothing moved.
    var ordinalEnumeratorGuard = true;
    if (opts && opts.ordinalEnumeratorGuard === false) {
      ordinalEnumeratorGuard = false;
    }
    // 26.95-04 (#90): THE WRITE MODE. ONE recognized key, `breaksOnly`, and
    // ONLY the exact value `true` turns it on — the default is the shipped
    // display behaviour, so a typo can never silently write a file.
    //
    // WHY IT EXISTS, AND WHY IT IS NOT A MEASUREMENT SEAM. The four seams above
    // exist so `tools/replan_probe.cjs` can re-measure; this one exists because
    // the owner ruled at #90 that the tidy-up may write SENTENCE BREAKS ONLY
    // into a person's file. Run across her real vault this function changes
    // 1,423 notes, and only 231 of those changes are whitespace: on the other
    // 1,192 it ALSO promotes a `Label: text` line into a heading, adding `##`
    // and DELETING the colon she typed. That is harmless on a screen — law 4
    // permits a display transform and "show as saved" is one tap away — but
    // #88's ruling to write into the file was made about line breaks, and a
    // deleted character is not a line break.
    //
    // WHAT IT SUPPRESSES. Every rule that is not whitespace, and ⚠ THERE ARE
    // FIVE OF THEM RATHER THAN THE ONE #90 NAMED: `placeHeadings` (inserts a
    // heading line), the colon-label promotion (adds `##`, drops the colon),
    // the list-forming runs (add `- ` scaffolding), THE PIN RUN (turns a
    // `📌 label` into `## label`, deleting the pin) and THE INLINE-ORDINAL
    // SPLIT (re-cuts a numbered line and drops a separator). What survives is
    // the zone map and D-15 — the sentence-boundary break, which swaps the
    // space after a full stop for a newline and touches nothing else.
    //
    // ⚠ THE LAST TWO WERE FOUND BY MEASUREMENT, NOT BY READING, and that is
    // the point worth keeping. #90 concluded "whitespace-only" from the 231
    // notes where the WHOLE display transform happened to be whitespace — a
    // different set from "the breaks-only mode on every note it changes". Run
    // over the owner's real vault (2,635 notes) with only the first three
    // suppressed, this mode changed 493 notes and 2 of them lost characters:
    // an arrow deleted from a numbered line, and a 📌 replaced by `##`. Both
    // are now suppressed and the run is 490 changed, 490 whitespace-only, zero
    // violations. ⚠ A reader must not take that zero as proof the rule is
    // whitespace-only BY CONSTRUCTION — it is a measurement on one vault, and
    // the guarantee a person actually gets is the run-time check below.
    //
    // ⚠ IT IS AN OPTION RATHER THAN A SECOND FUNCTION ON PURPOSE. A separate
    // breaks-only transform would be a SECOND SPELLING of the D-15 gate — the
    // exact failure the deletion contract at the head of tools/replan_probe.cjs
    // forbids — and it would be the spelling that writes to disk, so a drift
    // between the two would show up as a file that does not match its own
    // preview. The screen and the writer run this one function.
    //
    // ⚠ AND IT IS NOT REACHED BY PASSING OPTIONS FROM app.js. The room reaches
    // it through the named export `sentenceBreaksOnly` below, so the S23 fence
    // — app.js passes structureBody TWO arguments, never three — stays true and
    // keeps meaning what it says. `breaksOnly` is added to that fence's key
    // list in the same commit.
    var breaksOnly = !!(opts && opts.breaksOnly === true);
    var lines = src.split('\n');
    var shortPost = isShortPost(lines);
    // (0b) anchor placement, FIRST — see the block comment above for why the
    // suppressor is measured on the body as saved rather than on the placed
    // one (placing a heading adds lines, and reading the count afterwards
    // would let a named heading switch the suppressor off for the promoted
    // ones too).
    if (!shortPost && !breaksOnly) {
      var located = placeHeadings(src, headings, addedHeadings);
      if (located !== src) { lines = located.split('\n'); }
    }
    // (0c) the block figure D-15's gate reads, computed ONCE, over the line
    // array the loop will actually walk — so a heading placeHeadings just
    // inserted is counted as the block boundary it is.
    var blockLen = blockLengths(lines);
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var raw = lines[i];
      var cr = /\r$/.test(raw) ? '\r' : '';
      var line = cr ? raw.slice(0, -1) : raw;
      // --- (a) HANDS-OFF ZONES, copied byte-identically ---------------------
      // An Obsidian %% … %% comment. FIRST, because a comment line can look
      // like anything else and is never prose.
      //
      // 26.88-08, found by the UAT picker on the live library: without this,
      // `%% auto-links:start %%` reached the colon rule as an ordinary line
      // and was promoted to `## %% auto-links` / `start %%`. renderMarkdown's
      // cleanVaultMarkup then strips `%%…%%`, so what actually rendered was an
      // EMPTY `## ` heading — twice, in every clipping carrying a vault_linker
      // Related block. 156 of 417 firing notes fired on nothing else, which
      // also lit the "show as saved" control on notes nothing had been done
      // to. wordsPreserved could not catch it: every word survived.
      //
      // hasAuthorHeading already discounts this exact span (D-07.4a). The bug
      // was one rule with two callers that disagreed; this is the second
      // caller agreeing. Any %% comment is covered, not just auto-links: a
      // comment is scaffolding the renderer deletes, so anything structured
      // out of one is debris by construction.
      if (line.indexOf('%%') !== -1) {
        var openIdx = line.indexOf('%%');
        var closes = line.indexOf('%%', openIdx + 2) !== -1;
        out.push(lines[i]);
        i++;
        if (!closes) {                        // a multi-line comment
          while (i < lines.length) {
            var cl = lines[i].replace(/\r$/, '');
            out.push(lines[i]);
            i++;
            if (cl.indexOf('%%') !== -1) { break; }
          }
        }
        continue;
      }
      // A CAPTION: a line whose whole content is wrapped in ONE emphasis
      // delimiter (D-13, WHOLLY_EMPHASIZED_RE). Placed here among the
      // line-shaped zones for the same reason the `%%` branch is first — it is
      // scaffolding, not prose — and before every rule that could touch it.
      //
      // 26.88-11, found by driving plan 08's six UAT picks through the app's
      // own render path on the live library. On EVERY ONE of the six, the only
      // line the transform changed was an italic image caption, and it broke
      // it. The colon rule fired on the caption's `图：` label, and
      // stripLeadingMarkers cannot remove the `*` (U+002A is in none of
      // MARKER_GLYPH_RE's ranges), so what was emitted was:
      //
      //     ## *图
      //     CAT SCARF 封面照——黄灰条纹钩织围巾…*
      //
      // — the opening italic marker promoted INTO the heading and the closing
      // `*` stranded at the end of the following paragraph. The markdown
      // emphasis pair was split across a heading boundary, so the caption
      // rendered with literal asterisks and the wrong emphasis. On one note a
      // run rule additionally shredded the parenthetical
      // `（芒果、抹茶配树莓、巧克力、开心果撒糖粉）` into four list items,
      // breaking the fullwidth parenthesis across them.
      //
      // Measured post-F-1 over the whole live library: 207 of the 261 firing
      // notes (79%) emitted a broken-italic `## *` heading, and 176 (67%)
      // fired on NOTHING BUT caption lines. So on two thirds of the notes this
      // phase touched, the only thing it did was mangle an image caption.
      //
      // wordsPreserved could not catch it: every word survived, and
      // normalizeWords drops `*` on BOTH sides by design. That is the third
      // defect in a row invisible to the D-04 guard (F-1, F-3, the
      // parenthetical shred), which is why D-14's inline-markup invariant
      // follows in plan 12 — this branch makes the transform RIGHT, that guard
      // makes a future wrong transform VISIBLE.
      if (WHOLLY_EMPHASIZED_RE.test(line)) {
        out.push(lines[i]);
        i++;
        continue;
      }
      if (/^\s{0,3}(```|~~~)/.test(line)) {           // a fenced block
        out.push(lines[i]);
        i++;
        while (i < lines.length) {
          var fl = lines[i].replace(/\r$/, '');
          out.push(lines[i]);
          i++;
          if (/^\s{0,3}(```|~~~)/.test(fl)) { break; }
        }
        continue;
      }
      if (line.indexOf('|') !== -1 && i + 1 < lines.length) {   // a table
        var sepLine = lines[i + 1].replace(/\r$/, '');
        if (/^[ \t]{0,3}\|?[\s:|-]{3,}\|?[ \t]*$/.test(sepLine) &&
            sepLine.indexOf('-') !== -1) {
          out.push(lines[i]);
          i++;
          out.push(lines[i]);
          i++;
          while (i < lines.length && lines[i].indexOf('|') !== -1) {
            out.push(lines[i]);
            i++;
          }
          continue;
        }
      }
      if (/^\s{0,3}>/.test(line)) {                   // a blockquote run
        while (i < lines.length &&
            /^\s{0,3}>/.test(lines[i].replace(/\r$/, ''))) {
          out.push(lines[i]);
          i++;
        }
        continue;
      }
      if (/^\s*!\[/.test(line)) {                     // an image/attachment
        out.push(raw);
        i++;
        continue;
      }
      // --- lines that are already structure, or are not prose --------------
      if (!line.trim() || /^[ \t]{0,3}#{1,6}([ \t]|$)/.test(line)) {
        out.push(raw);
        i++;
        continue;
      }
      if (/^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]/.test(line)) {
        // ONE exception to "a list item is already structure": a line that
        // OPENS as a list item but carries a RUN of inline ordinals is a wall
        // wearing a list item's clothes — `1. 先烧水 2. 下面 3. 捞出` renders as
        // a single item. A line with exactly one ordinal is an ordinary list
        // item and is left alone.
        var listOrd = breaksOnly ? null : splitOrdinalRun(line);
        if (listOrd) {
          for (var lo = 0; lo < listOrd.length; lo++) {
            out.push(listOrd[lo] + cr);
          }
          i++;
          continue;
        }
        out.push(raw);
        i++;
        continue;
      }
      // --- (b) D-03a: a run of pin-marked sections -------------------------
      // Tried BEFORE the colon rule: a pin-marked section may itself contain
      // a colon, and promoting the first one would put a heading in the
      // middle of the author's own section run.
      if (!shortPost && !breaksOnly) {
        var pinRun = collectPinLeadRun(lines, i);
        if (!pinRun) {
          var inlinePins = splitPinRun(line);
          if (inlinePins) { pinRun = { secs: inlinePins, next: i + 1 }; }
        }
        if (pinRun) {
          for (var pz = 0; pz < pinRun.secs.length; pz++) {
            if (pz > 0) { out.push(cr); }
            out.push('## ' + pinRun.secs[pz].label + cr);
            out.push(cr);
            out.push(pinRun.secs[pz].text + cr);
          }
          i = pinRun.next;
          continue;
        }
      }
      // --- (b) the colon-label signal --------------------------------------
      // Suppressed on a short post: vault rule 10 skips the HEADERS, and a
      // promotion here is a header.
      var promoted = (shortPost || breaksOnly) ? null : promoteColonLabel(line);
      if (promoted) {
        out.push('## ' + promoted.label + cr);
        out.push(cr);
        var restList = restRun(promoted.rest, separatorBounds,
            ordinalEnumeratorGuard);
        if (restList) {
          // 26.88-17 (F-7): the run's two ends, emitted as their own blocks —
          // exactly ONE blank line between two blocks, and never folded into
          // the first or last bullet. Both are verbatim source slices.
          if (restList.pre) { out.push(restList.pre + cr); out.push(cr); }
          for (var s = 0; s < restList.segs.length; s++) {
            // an ORDERED family's items already carry the author's own
            // marker; only bullets need scaffolding added.
            out.push((restList.ordered ? '' : '- ') + restList.segs[s] + cr);
          }
          if (restList.rest) { out.push(cr); out.push(restList.rest + cr); }
        } else {
          out.push(promoted.rest + cr);
        }
        i++;
        continue;
      }
      // --- (b) the list-forming runs, on a line carrying no colon label ----
      // NOT suppressed on a short post: rule 10 says "skip the headers, just
      // clean up line breaks" — a bullet is a line break, not a header.
      var run = breaksOnly ? null : lineRun(lines, i, line);
      if (run) {
        for (var t = 0; t < run.segs.length; t++) {
          out.push((run.ordered ? '' : '- ') + run.segs[t] + cr);
        }
        i = run.next;
        continue;
      }
      // --- (c) D-15: the sentence-boundary break. LAST, AND THAT IS THE
      // LOAD-BEARING PART OF IT.
      //
      // It runs after the zone map, which is what keeps D-07's six hands-off
      // zones ABSOLUTE — D-15 never sees a fence, a table, a blockquote run, an
      // image line, a caption or a `%%` comment, however long they are. And it
      // runs after every D-03/D-03a signal rule has DECLINED the line, which is
      // what makes it NON-COMPETING: a line the colon rule promotes, or a
      // marker run bullets, never arrives here, so no ordering conflict with
      // D-03 can arise by construction rather than by negotiation.
      //
      // `placeHeadings` runs at step (0b), BEFORE this loop, and locates its
      // anchor as a verbatim substring of the pre-split body — so D-15 cannot
      // move an anchor out from under a model-named heading. No change was
      // needed there and none was made.
      if (blockLen[i] > sentenceBreakMin) {
        var sentences = splitSentences(line, imageTokenGuard,
            ordinalEnumeratorGuard);
        if (sentences) {
          for (var sb = 0; sb < sentences.length; sb++) {
            if (sb > 0) { out.push(cr); }
            out.push(sentences[sb] + cr);
          }
          i++;
          continue;
        }
      }
      out.push(raw);
      i++;
    }
    return { text: out.join('\n'), addedHeadings: addedHeadings };
  }

  // ---- the reading spread's geometry (26.5 D-01/D-04; 26.88-18, F-8) --------
  //
  // TWO SCALES. The FRAME wears 26.5's half step; the INTERIOR is free.
  //
  // WHY THE ARITHMETIC LIVES HERE AND NOT IN app.js. Executors on this project
  // cannot run a browser, so a formula that only exists inside a DOM function is
  // a formula nobody can gate — which is exactly how a 150px cliff shipped
  // through an owner UAT and seven plans. Every boundary and precision claim
  // below is a case in `tests/test_spread_scale.cjs` (G1-G15).
  //
  // WHAT 26.5 DECIDED, stated before it is changed:
  //   D-01  form is a drawn spread frame with the verbatim content region
  //         SCROLLING inside it — no pagination engine.
  //   D-04  ONE shared interior rect that every skin obeys, skins being frame
  //         art and never layout. Moving the rect here gives that "one" ONE
  //         HOME instead of a literal in a script and a set of literals in a
  //         stylesheet. Its value is unchanged: {72, 84, 624, 300}.
  //   26.5-09 UAT F10  the largest fitting HALF step (1, 1.5, 2 ...), chosen
  //         live by the OWNER over whole integers because the frame art is a
  //         2x2-block PNG: the art-pixel scale is 2k and stays whole at every
  //         half step.
  //
  // THE MEASURED DEFECT (26.88-15 F-8, raised by the owner at a blocking UAT).
  // `#spread-scroll` clientHeight 298px against scrollHeight 4394px — under 7%
  // of the note at a time, with an embedded image clipped rather than scaled.
  // Her viewport was 1680x659; the height term is 1.4699; the half-step floor
  // takes it to 1.0; the innerHeight needed for 1.5 is 672. THIRTEEN PIXELS of
  // browser chrome cost her a third of the reading area, silently, with no
  // feedback and no fallback. The finding is not that 300px is wrong. It is
  // that the function has a CLIFF.
  //
  // THE CHANGE, AND ITS AUTHORITY. The interior scroll region's HEIGHT is
  // computed from a second, free-fractional scale. The owner authorised this on
  // 2026-08-03, WITH THE RISK FLAGGED, re-opening a decision she personally made
  // at 26.5-09 F10. Written up as a named, dated, owner-attributed amendment in
  // 26.5's OWN phase directory:
  //   .planning/phases/26.5-.../26.5-AMENDMENT-2026-08-03-free-fractional-interior.md
  // A phase that quietly edits another phase's decision of record has made that
  // record worthless.
  //
  // WHAT DOES NOT CHANGE: the frame art, its half-step scale, its
  // `image-rendering: pixelated`, the title band, the back button, the ribbon,
  // D-01's one-scroller discipline, and the content fence that keeps the reading
  // region out of the pixel pipeline (law 4, D-02).
  //
  // THE VISIBLE CONSEQUENCE, stated here rather than discovered at a UAT: when
  // kInterior > kFrame the page panel extends BELOW the frame art's drawn bottom
  // edge. It is a bounded panel in its own right (`background: var(--card)`, a
  // `1px solid var(--wood-deep)` border) so it reads as a longer page rather
  // than a break — but it IS a visible change to 26.5's spread.
  //
  // THE NAMED FALLBACK, decided in advance so it is not improvised under a
  // verdict: if the owner says the page leaving the frame reads as wrong, pin
  //     var kInterior = kFrame;
  // — a ONE-LINE revert restoring today's geometry exactly — and re-open F-8
  // with the finding's third direction (a clipped image gets its own
  // tap-to-enlarge) as the candidate.
  //
  // THE TWO REJECTED DIRECTIONS, from the finding, recorded so neither is
  // rediscovered as new:
  //   1. Keep half steps and let the interior grow past the frame's drawn rect.
  //      Rejected: it moves the reading region OUTSIDE the interior contract
  //      D-04 exists to hold, and it still leaves the cliff — a 1px viewport
  //      change would still cost 150px at a boundary.
  //   2. Give a clipped image its own tap-to-enlarge. Rejected as the FIRST
  //      move: it treats the symptom the owner happened to name (an image) and
  //      leaves 76 legible notes being read through a 300px slot. Kept as the
  //      fallback's candidate.

  var SPREAD_FRAME = { w: 768, h: 432 };
  var SPREAD_INTERIOR = { x: 72, y: 84, w: 624, h: 300 };
  var SPREAD_MARGIN = 24;
  var SPREAD_INTERIOR_BOTTOM = 48;

  // THE QUANTISATION CONTRACT, stated explicitly because it IS the defect.
  //
  //   usable    = innerHeight - 24                        // the shipped margin
  //   freeFit   = min((innerWidth - 24) / 768, usable / 432)   // both shipped
  //   kFrame    = max(1, floor(freeFit * 2) / 2)     // byte-identical to today
  //   clampMax  = (usable - 132 * kFrame) / 300            // a FAIL-SAFE, below
  //   kInterior = max(kFrame, min(freeFit, clampMax))
  //
  // `kFrame` FLOORS to a half step (never rounds, never ceils) and is floored at
  // 1 — byte for byte the shipped `fitSpreadScale` expression. It sizes the
  // frame art, the stage width, the title band, the back button, the ribbon and
  // the interior's left, width and top.
  //
  // `kInterior` IS NOT QUANTISED AT ALL: no floor, no round, no ceil, no
  // epsilon, no snapping. A sub-pixel interior height costs nothing because the
  // content region carries NO `image-rendering` — the fence comment in
  // tokens.css is the standing evidence for exactly that.
  //
  // `132` is SPREAD_INTERIOR.y (84) plus the interior's shipped bottom inset
  // (48), both at the FRAME scale; `300` is SPREAD_INTERIOR.h.
  //
  // `ribbonHeight` IS DELIBERATELY ABSENT FROM ALL OF IT. tokens.css
  // `#spread-ribbon` is `position: absolute; bottom: 12 * k` — an OVERLAY pinned
  // inside the stage — and the scroll's padding-bottom compensates. The ribbon
  // consumes NO stage height, so it is a term in NEITHER scale. It feeds exactly
  // one returned value, `scrollPadBottom`, and nothing else. (An earlier draft
  // of this plan held a FOOT model in which the ribbon ate stage height; it was
  // measured against tokens.css and was wrong. It survives as mutation 4, which
  // is what proves G13 is not vacuous.)
  //
  // `clampMax` IS A DOCUMENTED FAIL-SAFE, NOT A LIVE CONSTRAINT ON THE OUTPUT —
  // and both regimes are written down, because it is FALSE that it never enters
  // the `min`:
  //   (a) freeFit >= kFrame. It cannot bind at all:
  //       stageH = 132*kFrame + 300*kInterior <= 432*kInterior, and
  //       kInterior <= freeFit <= usable/432, so stageH <= usable. The stage
  //       fits by construction, so clampMax >= freeFit.
  //   (b) freeFit <  kFrame — which is exactly freeFit < 1, since kFrame is
  //       FLOORED AT 1. Here clampMax genuinely CAN be the smaller term inside
  //       the `min` (innerHeight < 456 at innerWidth 1680 — 56 of G13's 1001
  //       height-scan points), and the LOWER clamp then restores kFrame, so the
  //       RETURNED value is unchanged anyway. That is G7, and it is today's
  //       behaviour.
  // Keep the clamp: it is the guard that catches a future change to the interior
  // rect or the inset. G13 pins its effect-freedom by asserting the RETURNED
  // kInterior === max(kFrame, freeFit) at all 3202 scan points, so nobody
  // deletes it without meeting the identity. `freeFit` is NEVER exported and
  // never becomes a twelfth returned value — a gate that reads its reference
  // value out of the function it asserts is the plan-11 vm-simulation defect.
  //
  // AT EQUALITY THE WHOLE THING IS A NO-OP. When the free-fractional fit lands
  // on a half step the two scales are equal and the returned geometry is
  // byte-identical to what shipped. The branch is written EXPLICITLY rather than
  // left to the arithmetic to coincide — that is what makes G3 an exact equality
  // instead of a tolerance.
  //
  // THE STAGE GROWS; THE FRAME DOES NOT. `frameW`/`frameH` are always the FRAME
  // scale times the canvas, so a taller stage cannot stretch the art, and the
  // interior keeps the same 48*kFrame bottom inset at every scale (G11) so the
  // ribbon's relationship to the reading region is unchanged. THAT SEPARATION IS
  // THE SINGLE THING that lets the owner have her reading area while 26.5 keeps
  // its crisp frame.

  // ---- the tidy-up's write chunker (26.95-15) -----------------------------
  //
  // ⚠ FOUND ON HER REAL VAULT, NOT IN A TEST. The client used to send
  // `CLEAN_PAGE` (60) notes per write REGARDLESS OF SIZE, against a server
  // that refuses any request body over 1 MB. Sixty of her notes are several
  // megabytes, so the FIRST chunk came back 413 and the whole run wrote
  // NOTHING — a whole-vault tidy-up she could not perform from the app at
  // all.
  //
  // ⚠ THIS IS THE SAME DEFECT AS THE LIBRARIAN'S, A THIRD TIME: a batch
  // sized in ITEMS against a limit spent in BYTES (wayfinder #63 on the
  // model's context window, #83 on its answer cap, this on an HTTP body).
  // The cure is the same one both times: bound it in the unit the limit is
  // actually spent in, and keep the count bound as a second ceiling.
  //
  // ⚠ MEASURED, NOT ESTIMATED. The size that matters is the SERIALIZED size,
  // and JSON escaping is not a constant factor — a newline becomes two bytes,
  // a quote becomes two, while CJK passes through unescaped. Every note this
  // pass touches is one the layout rule just filled with new newlines, so an
  // estimate would be wrong in exactly the direction that 413s. So each row is
  // stringified and weighed as it will actually be sent.
  //
  // ⚠ AN OVERSIZE NOTE IS SKIPPED, NOT SENT. One note too big to fit alone
  // cannot be made to fit, and sending it anyway would 413 and take the whole
  // remaining run down with it — the shape of the pre-sort worker that
  // stopped on one bad batch. The caller counts it and says it out loud
  // (product law 9). Returning `take: 0` with `oversize: true` is how this
  // function says so without knowing what a person is told.
  var CLEAN_WRITE_BUDGET = 1000000;   // bytes; the server's cap is 1 MiB

  function utf8Length(text) {
    var s = String(text == null ? '' : text);
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(s).length;
    }
    var n = 0;                        // the arithmetic, for any runtime
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) { n += 1; }
      else if (c < 0x800) { n += 2; }
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else { n += 3; }
    }
    return n;
  }

  // How many of `rows` may go in ONE write, and whether the first one is
  // unsendable. `rows` are {id, body} shaped; pure, allocates nothing it does
  // not return, and never reorders or mutates.
  function cleaningWriteChunk(rows, budget, maxCount) {
    var list = rows || [];
    var cap = (typeof budget === 'number' && budget > 0)
      ? budget : CLEAN_WRITE_BUDGET;
    var most = (typeof maxCount === 'number' && maxCount > 0)
      ? maxCount : list.length;
    if (!list.length) { return { take: 0, oversize: false, bytes: 0 }; }
    var used = 32;                    // the wrapper: {"writes":[...],"batch":}
    var take = 0;
    for (var i = 0; i < list.length && take < most; i++) {
      var row = list[i] || {};
      var size = utf8Length(JSON.stringify(
        { id: String(row.id == null ? '' : row.id),
          body: String(row.body == null ? '' : row.body) })) + 1;  // + comma
      if (used + size > cap) {
        // the first row on its own does not fit: it never will
        if (take === 0) { return { take: 0, oversize: true, bytes: size }; }
        break;
      }
      used += size;
      take++;
    }
    return { take: take, oversize: false, bytes: used };
  }

  function spreadScales(innerWidth, innerHeight, ribbonHeight) {
    var W = Number(innerWidth); if (!isFinite(W)) { W = 0; }
    var H = Number(innerHeight); if (!isFinite(H)) { H = 0; }
    var R = Number(ribbonHeight); if (!isFinite(R) || R < 0) { R = 0; }

    var usable = H - SPREAD_MARGIN;
    var freeFit = Math.min((W - SPREAD_MARGIN) / SPREAD_FRAME.w,
      usable / SPREAD_FRAME.h);
    var kFrame = Math.max(1, Math.floor(freeFit * 2) / 2);
    var foot = SPREAD_INTERIOR.y + SPREAD_INTERIOR_BOTTOM;
    var clampMax = (usable - foot * kFrame) / SPREAD_INTERIOR.h;
    var kInterior = Math.max(kFrame, Math.min(freeFit, clampMax));

    var scrollTop = SPREAD_INTERIOR.y * kFrame;
    var scrollH = SPREAD_INTERIOR.h * kInterior;
    var stageH = (kInterior === kFrame)
      ? SPREAD_FRAME.h * kFrame
      : scrollTop + scrollH + SPREAD_INTERIOR_BOTTOM * kFrame;

    return {
      kFrame: kFrame,
      kInterior: kInterior,
      frameW: SPREAD_FRAME.w * kFrame,
      frameH: SPREAD_FRAME.h * kFrame,
      stageW: SPREAD_FRAME.w * kFrame,
      stageH: stageH,
      scrollLeft: SPREAD_INTERIOR.x * kFrame,
      scrollTop: scrollTop,
      scrollW: SPREAD_INTERIOR.w * kFrame,
      scrollH: scrollH,
      scrollPadBottom: R ? R + 16 : 16
    };
  }

  // ---- exports ---------------------------------------------------------------

  root.StudyCore = {
    STATES: STATES,
    DEFAULTS: DEFAULTS,
    DAY_MS: DAY_MS,
    canTransition: canTransition,
    applyTransition: applyTransition,
    matchesFilter: matchesFilter,
    itemExcluded: itemExcluded,
    surfacePool: surfacePool,
    guardSurface: guardSurface,
    setTrigger: setTrigger,
    pickBlessingCandidates: pickBlessingCandidates,
    pickWalkArrivals: pickWalkArrivals,
    // 26.95-30 (D-01/D-05/D-12; P-2/P-5/P-8/P-9): the reach back's pure half.
    // Every piece is exported BY NAME so a fixture asks the SHIPPED rule what
    // fortnight a stamp falls in instead of re-spelling the arithmetic — the
    // SENTENCE_BREAK_MIN precedent. pickOfferCandidates goes on the
    // GATED_SELECTORS roster in tests/test_surface_wiring.cjs deliberately;
    // a selector that is not on that roster is not under the choke-point gate.
    dayOfYearUTC: dayOfYearUTC,
    fortnightOf: fortnightOf,
    yearOfUTC: yearOfUTC,
    byOldestCapture: byOldestCapture,
    pickBlessingSeed: pickBlessingSeed,
    // 26.999 (her ruling, night of 2026-08-25): the pass that leads with
    // what she recently welcomed, with a reserve for the rest of the pile.
    // Pure, no model, no bodies — see the block above.
    pickRelatedBlessingCandidates: pickRelatedBlessingCandidates,
    recentBlessingFacets: recentBlessingFacets,
    blessingRelation: blessingRelation,
    pickOfferCandidates: pickOfferCandidates,
    offerLikely: offerLikely,
    firstLookWaiting: firstLookWaiting,
    pickCoverCandidate: pickCoverCandidate,
    bySavedOldestCore: bySavedOldestCore,
    pickAlbumItems: pickAlbumItems,
    // 26.9-04 (D-04/D-12): the notebook picker's gated image selector.
    pickPickerImages: pickPickerImages,
    pickJournalItems: pickJournalItems,
    // 26.91-04 (D-06, 2026-08-07): the reading door's gated selector
    // pickSessionReading left this table with the reading book. Tests read
    // its absence from THIS evaluated export, never from file text.
    countPileByType: countPileByType,
    selectLibrarianSuggestions: selectLibrarianSuggestions,
    SUGGESTIONS_PER_SHELF: SUGGESTIONS_PER_SHELF,
    eligibleForShelf: eligibleForShelf,
    shelfSize: shelfSize,
    selectShelf: selectShelf,
    reactionAllowed: reactionAllowed,
    applyReaction: applyReaction,
    markOpened: markOpened,
    attachmentUrl: attachmentUrl,
    rewriteAttachmentRefs: rewriteAttachmentRefs,
    unreferencedAttachments: unreferencedAttachments,
    // F-02: where a seam repeats itself (reported, never edited)
    seamRepeats: seamRepeats,
    SEAM_REPEAT_MIN: SEAM_REPEAT_MIN,
    // F-03: the wall of text, broken at display time only
    splitLongRuns: splitLongRuns,
    RUN_SPLIT_MIN: RUN_SPLIT_MIN,
    RUN_SPLIT_TARGET: RUN_SPLIT_TARGET,
    // 26.88-01: the reading-first reformatting spine (D-03/D-04/D-06/D-07)
    TOOLING_HEADINGS: TOOLING_HEADINGS,
    FOLDER_PERSONAL: FOLDER_PERSONAL,
    LABEL_MAX_CHARS: LABEL_MAX_CHARS,
    ITEM_MAX_CHARS: ITEM_MAX_CHARS,
    RUN_SEPARATORS: RUN_SEPARATORS,
    // 26.88-03: the rest of D-03's signal set, D-03a's two marker families,
    // and the two safety bounds. Every threshold is exported by NAME so a
    // fixture can reference it instead of hardcoding a number that goes
    // stale the moment the threshold moves.
    MARKER_RUN_MIN: MARKER_RUN_MIN,
    PIN_MARKERS: PIN_MARKERS,
    LABEL_BAR: LABEL_BAR,
    CHECK_MARKS: CHECK_MARKS,
    BULLET_GLYPHS: BULLET_GLYPHS,
    BULLET_MARKS: BULLET_MARKS,
    SHORT_POST_LINES: SHORT_POST_LINES,
    MAX_REFORMAT_BYTES: MAX_REFORMAT_BYTES,
    // 26.88-12 (Q4): the renderer's own scaffolding transform and its two
    // escapers, moved out of app.js so a node suite can assert an invariant on
    // what `marked` ACTUALLY RECEIVES. app.js delegates to these by name; there
    // is exactly one spelling of each.
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    cleanVaultMarkup: cleanVaultMarkup,
    // 26.88-20 (F-6b): the hashtag carve-out, exported in THREE pieces on
    // purpose. `stripHashtagMarkers` is the transform; `hashtagRunSpans` is
    // WHERE it fires, so a gate can assert the reach rather than only the
    // output (a count with no offset list is not accepted in this phase); and
    // the run minimum is exported so a fixture asserts the run contract
    // against the constant instead of against a literal 2. The carve-out is
    // NAMED here because it is the one place in this module that deletes a
    // character from her rendered body, and it must never be possible to
    // widen it without editing something that says so out loud.
    stripHashtagMarkers: stripHashtagMarkers,
    hashtagRunSpans: hashtagRunSpans,
    hashtagLinkCuts: hashtagLinkCuts,
    HASHTAG_RUN_MIN: HASHTAG_RUN_MIN,
    HASHTAG_SEARCH_HREF_RE: HASHTAG_SEARCH_HREF_RE,
    // 26.88-11 (D-13): the caption zone's predicate, exported BY NAME so the
    // fixture suite and the measuring probe both ask the SHIPPED rule whether
    // a line is a caption instead of carrying a second spelling of it. A
    // second spelling in tools/ is the one-rule-two-callers drift this plan
    // spent half a task closing between structureBody and handsOffSpans.
    WHOLLY_EMPHASIZED_RE: WHOLLY_EMPHASIZED_RE,
    // 26.88-11 (Q5): ONE helper, TWO rules — the colon refusal here and D-15's
    // split refusal in plan 13 — over THREE named rosters that plan 12's
    // markupPreserved reads as well. Exported by name so no caller ever
    // re-spells a set.
    INLINE_MARKS: INLINE_MARKS,
    INLINE_PAIRS: INLINE_PAIRS,
    SPAN_ONLY_PAIRS: SPAN_ONLY_PAIRS,
    openSpanAt: openSpanAt,
    // 26.88-17 (F-4): D-15's THIRD refusal, exported BY NAME on the same
    // footing as openSpanAt so a fixture asks the SHIPPED predicate whether a
    // break would tear an image in half rather than re-spelling the two
    // characters it tests. ONE caller, and the plan says why only one: all
    // fourteen live notes carrying the defect arrive through D-15, measured.
    splitsImageToken: splitsImageToken,
    // 26.88-20 (F-12): D-15's FOURTH refusal, exported BY NAME on the same
    // footing as the third so a fixture asks the SHIPPED predicate whether a
    // dot belongs to the numeral in front of it, rather than re-spelling the
    // digit bound. ONE caller. The bound it reads is exported beside it so a
    // fixture can assert the 1-3-digit contract against the constant instead
    // of against a literal 3 typed a fourth time.
    splitsOrdinalEnumerator: splitsOrdinalEnumerator,
    ORDINAL_ENUMERATOR_MAX_DIGITS: ORDINAL_ENUMERATOR_MAX_DIGITS,
    // 26.88-17 (F-7): the separator run's TWO ENDS, from ONE call. DERIVED from
    // splitSentences rather than re-testing the ender characters — a FOURTH
    // caller of one predicate, never a second spelling. Exported by name so a
    // fixture asks the SHIPPED helper where a sentence begins and ends instead
    // of re-spelling a boundary rule that already carries three guards.
    runSentenceSpan: runSentenceSpan,
    // 26.88-06: D-01's second heading provenance. The roster and the anchor
    // band are exported BY NAME so a fixture references the constant instead
    // of hardcoding a number or a word list that goes stale the moment the
    // server's own roster moves.
    HEADING_VOCAB_CHINESE: HEADING_VOCAB_CHINESE,
    HEADING_VOCAB_ENGLISH: HEADING_VOCAB_ENGLISH,
    HEADING_VOCAB: HEADING_VOCAB,
    ANCHOR_MIN_CHARS: ANCHOR_MIN_CHARS,
    ANCHOR_MAX_CHARS: ANCHOR_MAX_CHARS,
    // 26.88-09 (D-21): exported so the UAT measuring instrument can measure
    // FREE PROSE — the text a rule is actually permitted to touch — using the
    // SAME four zone predicates the transform itself refuses to touch. A
    // second spelling of these shapes in tools/ is precisely the
    // one-rule-two-callers drift that F-1 was (hasAuthorHeading discounted a
    // span structureBody did not), and it cost the phase a UAT corpus. One
    // rule, one spelling: a zone the transform gains later moves the
    // instrument automatically.
    handsOffSpans: handsOffSpans,
    normalizeWords: normalizeWords,
    wordsPreserved: wordsPreserved,
    // 26.88-12 (D-14): the inline-markup invariant and F-1's symptom assertion.
    // Both read INLINE_MARKS / INLINE_PAIRS above, so the guard and the Q5
    // refusal can never disagree about what a span is.
    markupPreserved: markupPreserved,
    headingsBound: headingsBound,
    // markupPairs is the SAME counting the predicate above runs on, exported so
    // the measuring probe can name a residual trip BY THE CONSTRUCT THAT BROKE
    // rather than printing a bare number (26.88-11 deviation 3 established that
    // a bare count cannot be named). Without it the probe would have to carry a
    // second spelling of this counting, which is the one thing the deletion
    // contract in tools/replan_probe.cjs exists to forbid.
    markupPairs: pairsOf,
    // 26.88-16 (F-4's instrument half): the FOUR-GUARD VERDICT, exported BY
    // NAME so `app.js renderSavedBody` and `tools/replan_probe.cjs` answer the
    // same question with the same code. The probe measured ONE of these four,
    // at ONE seam, and published a coverage number for a note set the app
    // declines to lay out. A second composition of this ladder in tools/ is the
    // one-rule-two-callers drift F-1 was.
    bodyGuards: bodyGuards,
    hasAuthorHeading: hasAuthorHeading,
    // 26.88-16 (F-5): the FRONTMATTER SPLIT and its regex, exported BY NAME.
    // FIVE spellings existed in this repository; there is now exactly one, and
    // app.js, the picker, the probe and two suites all call it. It is
    // load-bearing on a SAFETY gate rather than merely on tidiness: a note
    // carrying no frontmatter block is personal (D-19), and `fm: null` is what
    // that branch reads.
    FM_RE: FM_RE,
    splitFrontmatter: splitFrontmatter,
    fmSource: fmSource,
    hasFrontmatterBlock: hasFrontmatterBlock,
    isPersonalNote: isPersonalNote,
    // 26.88-13 (D-15/D-20): the sentence-boundary break. The threshold and the
    // three rosters are exported BY NAME so a fixture sizes itself from the
    // constant instead of hardcoding 600 — the PAD / SHORT_POST_LINES
    // precedent — and so the D-20 alternative can be argued against a number
    // that has one home. blockLengths and splitSentences are exported because
    // they are the two halves a reader has to see to check the rule, not
    // because anything outside this module composes them: composing them into a
    // second spelling of the D-15 gate is explicitly forbidden (see the
    // `opts.sentenceBreakMin` comment in structureBody).
    // 26.95-04 (#90): THE ONE DOOR TO THE WRITE MODE. The room asks for a
    // breaks-only body by NAME rather than by passing options, which is what
    // lets the S23 fence keep saying the true and useful thing — app.js passes
    // `structureBody` two arguments, never three — while the tidy-up still runs
    // the one shipped rule rather than a copy of it.
    //
    // It takes a body and returns a body, because that is all its caller wants:
    // no headings are placed in this mode, so there is no `addedHeadings` for
    // anyone to read. The `[]` is the empty heading roster, which the mode would
    // ignore anyway — passed explicitly so the suppression is visible here and
    // not only inside the function.
    //
    // ⚠ THE PROMISE THIS MAKES IS WHITESPACE-ONLY, NOT INSERT-ONLY (#90
    // corrects #89): the break swaps the space after a full stop for a newline,
    // so every word survives in its order but a strict insertion test would
    // fail. It is CHECKED AT RUN TIME on the way to disk rather than trusted —
    // `apply_readability_body` in study_lib.py re-derives it from the bytes it
    // is about to write and refuses the write if it does not hold. This
    // function being correct is not what keeps a person's note safe.
    sentenceBreaksOnly: function (body) {
      return structureBody(body, [], { breaksOnly: true }).text;
    },
    SENTENCE_BREAK_MIN: SENTENCE_BREAK_MIN,
    SENTENCE_ENDERS: SENTENCE_ENDERS,
    SENTENCE_ABBREVIATIONS: SENTENCE_ABBREVIATIONS,
    SENTENCE_CLOSERS: SENTENCE_CLOSERS,
    blockLengths: blockLengths,
    splitSentences: splitSentences,
    structureBody: structureBody,
    // 26.88-18 (F-8): the reading spread's geometry. 26.5 D-04's ONE shared
    // interior rect now has ONE HOME instead of a literal in app.js and a set
    // of literals in a stylesheet — moved here with its value unchanged.
    // `spreadScales` is the whole geometry as a pure function, exported BY NAME
    // so a node suite can assert a boundary contract that a DOM-only formula
    // could never be asked about.
    SPREAD_FRAME: SPREAD_FRAME,
    SPREAD_INTERIOR: SPREAD_INTERIOR,
    spreadScales: spreadScales,
    // 26.95-15: exported BY NAME for the same reason `spreadScales` is — the
    // arithmetic that broke a whole-vault run on her real vault has to be
    // answerable by a node suite, and a chunker living inside app.js could
    // only ever be pinned as text.
    CLEAN_WRITE_BUDGET: CLEAN_WRITE_BUDGET,
    utf8Length: utf8Length,
    cleaningWriteChunk: cleaningWriteChunk
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = root.StudyCore; }
})(typeof window !== 'undefined' ? window : globalThis);
