"""Every bound job's schema must be one a PROVIDER will accept — not
merely one that is well-formed JSON and legal JSON-Schema.

⚠ WHY THIS FILE EXISTS (map #50, #68). The reflection schema shipped
`whys` as a map keyed by item id, spelled `{"additionalProperties":
{"type": "string"}}`. That is well-formed JSON. It is legal JSON-Schema.
It passed every suite in this repo. And Anthropic refused it outright on
every single call:

    400 invalid_request_error — "output_config.format.schema: For
    'object' type, 'additionalProperties: object' is not supported.
    Please set 'additionalProperties' to false"

Both reflection rows bind that one literal, so the generation turn AND
every refine turn were dead from the day the direct-API adapter landed —
the whole candle session, on any Anthropic key. `reflections.json` held
zero records for two days and nothing anywhere said why.

⚠ THE REASON NOTHING CAUGHT IT IS #63'S RULING: every other suite here
proves what the app SENDS. A schema no test ever hands to a provider can
be wrong in a way only a real call reveals — and the real call cost her
a whole sitting, at the end of a session she sat through.

⚠ AND IT WAS THE SECOND INSTANCE, NOT THE FIRST. #66 had already found
`maxItems` rejected by the same validator and written down the rule that
explains this one too: ONE SCHEMA SERVES EVERY PROVIDER, SO THE STRICTEST
DECIDES. Nobody then checked the other keys. This file is that check,
made mechanical, over EVERY bound job rather than the one that bit.

⚠ WHAT THIS FILE IS NOT: a live call. It encodes the provider's stated
rule, and a rule can move. It cannot replace witnessing a request — it
only stops the same class of defect from shipping unseen, on a job
nobody happened to think about. The OpenAI half is deliberately NOT
asserted: that path has never once run against a real provider (the
owner was offered a witness run and declined), so pinning a rule nobody
has seen enforced would manufacture confidence rather than evidence.
Its own stricter requirement is recorded below as a comment, not a test.
"""

import json
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server            # noqa: E402  — imported for its bind_job_literals
import librarian_call    # noqa: E402


def _walk_objects(node, path="$"):
    """Yield (path, node) for every JSON-Schema node that describes an
    OBJECT. Walks `properties`, `items`, and the composition keywords, so
    a nested map buried three levels down is reached exactly like a
    top-level one — the shipped defect was one level down, inside a
    property, which is precisely how it stayed invisible."""
    if not isinstance(node, dict):
        return
    kind = node.get("type")
    kinds = kind if isinstance(kind, list) else [kind]
    if "object" in kinds or "properties" in node:
        yield path, node
    for name, sub in (node.get("properties") or {}).items():
        yield from _walk_objects(sub, f"{path}.{name}")
    items = node.get("items")
    if isinstance(items, dict):
        yield from _walk_objects(items, path + "[]")
    elif isinstance(items, list):
        for i, sub in enumerate(items):
            yield from _walk_objects(sub, f"{path}[{i}]")
    for keyword in ("anyOf", "oneOf", "allOf"):
        for i, sub in enumerate(node.get(keyword) or []):
            yield from _walk_objects(sub, f"{path}.{keyword}[{i}]")


def bound_schemas():
    """Every JOBS row that carries a schema, as (job, parsed). A row with
    `schema: None` is unbound by design (`blessing_selection` ships that
    way and `call_librarian` refuses it loudly), so it has nothing to
    check — but the count is asserted below, so a row that goes SILENTLY
    unbound cannot hide inside this exemption."""
    out = []
    for job, row in librarian_call.JOBS.items():
        raw = row.get("schema")
        if raw is None:
            continue
        out.append((job, json.loads(raw)))
    return out


class ProviderSchemaShapeTest(unittest.TestCase):

    def test_every_bound_schema_closes_every_object(self):
        """THE RULE ANTHROPIC STATES, applied to every job at once.

        `additionalProperties` must be exactly False on every object
        node. Anything else — a schema fragment (the shipped defect),
        True, or simply absent — is a request the provider refuses
        before a single token exists, which reads to the person as the
        model having answered badly."""
        checked = 0
        for job, schema in bound_schemas():
            for path, node in _walk_objects(schema):
                checked += 1
                self.assertIn(
                    "additionalProperties", node,
                    f"{job} at {path}: an object node with no "
                    f"additionalProperties at all — Anthropic requires "
                    f"it set, and set to false")
                self.assertIs(
                    node["additionalProperties"], False,
                    f"{job} at {path}: additionalProperties is "
                    f"{node['additionalProperties']!r}. It must be "
                    f"exactly False. A SCHEMA FRAGMENT HERE IS THE #68 "
                    f"DEFECT — the provider answers 400 on every call, "
                    f"the whole job is dead, and no suite that only "
                    f"proves what the app SENDS can see it.")
        self.assertGreater(checked, 0,
                           "the walker found no object nodes at all — "
                           "this test would pass vacuously")

    def test_every_bound_schema_is_an_object_at_the_root(self):
        for job, schema in bound_schemas():
            self.assertEqual(schema.get("type"), "object",
                             f"{job}: a structured-output root must be "
                             f"an object")

    def test_the_bound_set_is_pinned(self):
        """⚠ A NUMBER WITH A REASON, so a NEW job cannot join the table
        and quietly skip every check above. If this fails, the honest
        move is to look at the new row and update the list — never to
        delete the assertion.

        ✅ `blessing_selection` WAS the one unbound row and is now bound
        (26.95-34, another session, the same day this file landed) — so
        every row in the table now carries a schema. ⚠ THIS PIN FIRED ON
        ITS FIRST DAY AND THAT IS THE POINT: a new job reached the table
        and a human had to look at it. Its shape passes the object check
        above on its own merits, which is the outcome this file exists to
        make automatic rather than lucky.
        ⛔ `cleaning_labels` and `heading_proposals` LEFT THIS SET on
        2026-08-17: #87 retired the labelling pass, #95 ruled the code
        out, and the deletion landed. Their schemas are not exempted
        here, they no longer exist — which is the honest shape for a
        file whose whole rule is that every bound row is checked.
        ⚠ `reflection_judge` JOINED 2026-08-21 (26.995-25) — her ruling
        *"The model judges each one"*. THIS PIN FIRED AGAIN, which is the
        point: a human looked at the new row rather than a new job slipping
        past every check above. Its schema is one property, one enum and
        `additionalProperties: False`, and it passes the object check on its
        own merits.
        ⚠ `archive_learning` JOINED 2026-08-24 (26.998) — her § W-11 beat 4,
        written by her with nothing offered: the room reads her own older
        writing ONCE and keeps what it learned, so her archive is never sent
        again. THIS PIN FIRED A THIRD TIME, which is the point: a human looked
        at the new row rather than a new job slipping past every check above.
        ⛔ ITS SCHEMA IS ONE FREE-TEXT PROPERTY AND `additionalProperties:
        False`, AND THE SPARSENESS IS DELIBERATE RATHER THAN UNFINISHED: what
        the librarian's notebook may say about her, and in what shape, is a
        decision she has NOT made, and a schema with five named slots would BE
        that decision — made by an agent, in the one place she would never look
        for it. It passes the object check on its own merits.
        ⚠ `subject_finding` JOINED 2026-08-25 (26.9985, R-1/R-2/R-11) — her
        finding pass: the librarian reads what the room already lets it read,
        once, to find subjects she might want set aside, and then ASKS. THIS
        PIN FIRED A FOURTH TIME, which is the point. ⛔ ITS SCHEMA CARRIES
        SUBJECT NAMES AND ITEM IDS AND NOT ONE FREE-TEXT FIELD ABOUT HER —
        the narrowness is deliberate (the R-11 unasked-portrait risk): a
        `why` or `summary` slot would be a second portrait arriving unasked.
        It passes the object check on its own merits.
        ⚠ `subject_merge` JOINED 2026-08-26 (26.9985, R-14 — `Tidy first`,
        her § G words) — the librarian folds ITS OWN list of subject names
        before the § A offer. THIS PIN FIRED A FIFTH TIME, which is the
        point. ⛔ Its schema is groups of INDICES into the numbered name
        list it was handed — it can only point back at names it wrote, and
        the payload gate holds her § G promise that nothing of hers is
        read. It passes the object check on its own merits.
        ⚠ `subject_clearing` JOINED 2026-08-26 (26.9985, R-16 — `Yes — now,
        and every time after`, her § I words) — the librarian clears its
        OWN notebook of a set-aside subject. THIS PIN FIRED A SIXTH TIME,
        which is the point. ⛔ Its schema is line INDICES into the numbered
        notebook it was handed and NOT ONE free-text field about her (the
        R-11 discipline); the payload gate holds her § I promise that only
        the notebook and the subject's names are read. It passes the
        object check on its own merits."""
        bound = sorted(job for job, _ in bound_schemas())
        unbound = sorted(job for job, row in librarian_call.JOBS.items()
                         if row.get("schema") is None)
        self.assertEqual(unbound, [],
                         "every row in the table now carries a schema, so "
                         "every row is checked above — an unbound row is "
                         "the one thing this file cannot see")
        self.assertEqual(
            bound,
            ["archive_learning", "blessing_selection", "config_ask",
             "connections", "import_presort",
             "librarian_note", "reflection", "reflection_judge",
             "reflection_refine", "subject_clearing", "subject_finding",
             "subject_merge"],
            "the bound set moved — see this test's docstring")

    def test_the_reflection_rows_share_one_literal(self):
        """26.93-06 (D-01): the generation turn and every refine turn
        send ONE schema. It is why the #68 defect killed both at once —
        and why repairing one repaired both."""
        rows = librarian_call.JOBS
        self.assertEqual(rows["reflection"]["schema"],
                         rows["reflection_refine"]["schema"])
        self.assertEqual(rows["reflection"]["schema"],
                         server.REFLECTION_SCHEMA_JSON)

    def test_the_shipped_defect_would_now_be_caught(self):
        """The negative control. Without this, every assertion above
        could be walking a shape that never contained the defect —
        and a contract written after the code can pass vacuously.

        This is the EXACT literal that shipped, and it must fail."""
        shipped = json.loads(server.REFLECTION_SCHEMA_JSON)
        shipped["properties"]["whys"] = {
            "type": ["object", "null"],
            "additionalProperties": {"type": "string"},
        }
        offenders = [
            path for path, node in _walk_objects(shipped)
            if node.get("additionalProperties") is not False
        ]
        self.assertEqual(offenders, ["$.whys"],
                         "the walker must find the shipped map spelling "
                         "and name exactly where it sits")

    # ⚠ RECORDED, NOT ASSERTED — the OpenAI path.
    #
    # `strict: True` requires `additionalProperties: false` everywhere
    # (which the test above already gives it) AND every property listed
    # in `required`. The reflection schema's `required` is exactly
    # ["reflection"] — deliberately, because `whys` is optional by design
    # and the eval harness hard-pins that list — so that path is expected
    # to fail too.
    #
    # It is NOT pinned here, and that is a decision rather than an
    # oversight: the OpenAI adapter has never once run against a real
    # provider, its model ids are provisional, and the owner was offered
    # a witness run on 2026-08-13 and declined. A test encoding a rule
    # nobody has seen enforced would look like evidence and be a guess.
    # When that path is witnessed, this comment is the place to start.


if __name__ == "__main__":
    unittest.main()
