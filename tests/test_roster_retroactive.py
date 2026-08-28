#!/usr/bin/env python3
"""26.96-11 — WHAT THE ROSTER ROUTE ANSWERS ABOUT ITS OWN RETROACTIVE PASS.

⛔ WHY THIS IS A NEW FILE AND NOT THREE MORE CASES IN AN EXISTING ONE.
`tests/test_import.py` and `tests/test_librarian_fence.py` both arrive in this
working tree carrying ANOTHER LIVE SESSION's uncommitted edits. Appending to
either would mean either committing their work or splicing around it on every
save, and it would also blur which session authored which assertion. A new file
avoids both.

WHAT IS BEING MEASURED, AND WHY IT IS A PRIVACY BUG AND NOT A COPY NIT.
`study_lib.add_roster_folder` reaches BACKWARDS — every already-imported item
whose origin sits under the newly-private folder is stamped `trigger=True` —
but ONLY when `meta.vault_root` is stamped, which happens ONLY on a whole-vault
import. A Photos-only or folder-drop user has no `vault_root`, reaches the
roster pane anyway (it is unconditional in the Manage rail by explicit
contract), adds a folder, and the room tells her the things already here are
set aside. They are not.

⚠⚠ AND THE COUNT IS NOT THE DISCRIMINATOR. The route already answers `flagged`,
and `flagged == 0` is ALSO what a real, applicable pass answers when the folder
simply holds nothing yet. A client reading the count would go silent on a pass
that genuinely ran. So the ROUTE has to say whether the pass was APPLICABLE,
and that is the field these cases pin.

⛔ EVERY DRIVE IS AGAINST A SYNTHETIC STORE IN A TEMPORARY DIRECTORY, on an
ephemeral port, through the REAL server. Her library is named nowhere in this
file and nothing here reads or writes it.
"""

import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path

# server.py is a plain module at the repo root; adding the root to sys.path
# lets `import server` resolve regardless of the runner's cwd.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402
import study_lib  # noqa: E402

# The one field under test. Named once so a rename is one edit and so no
# assertion below can quietly drift onto a different key.
FIELD = "retroactive"

# The folder she makes private. ⛔ Deliberately NOT one of the four shipped
# defaults: the add must be a real change to the roster, not a no-op dedup.
PRIVATE = "Diaries"

# The synthetic vault's own directory name. Deliberately distinctive so
# `no_path_on_the_wire` has a concrete needle to hunt for rather than a
# generic one that could be absent for reasons unrelated to the fix.
VAULT_DIRNAME = "roster-retro-vault-root"


def _item(item_id, origin_path):
    """One already-imported item, in the shipped shape's load-bearing parts.
    `trigger` starts UNSET — the whole question is whether the roster add
    stamps it."""
    return {
        "id": item_id,
        "source": "obsidian-vault",
        "origin_path": str(origin_path),
        "library_path": "items/" + item_id + ".md",
        "type": "text",
        "title": Path(origin_path).name,
        "state": "unseen",
        "trigger": None,
        "tags": [],
        "history": [{
            "at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "from": None, "to": "unseen", "via": "import",
        }],
    }


class RosterRetroactiveTest(unittest.TestCase):
    """The real ThreadingHTTPServer on an ephemeral port, over a synthetic
    library in a temp directory — the shape tests/test_server_smoke.py
    establishes. ⛔ Nothing here touches real user data."""

    def setUp(self):
        self._tmps = []
        self._servers = []

    def tearDown(self):
        for httpd, thread in self._servers:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)
        for tmp in self._tmps:
            tmp.cleanup()

    # -- the synthetic store + the real server -------------------------------

    def build(self, stamp_vault_root):
        """Write a synthetic store and start the real server over it.

        `stamp_vault_root` is the ONLY difference between the two arms, which
        is what makes the pair a measurement of that condition and not of
        anything else.

        ⚠ Callable MORE THAN ONCE per case: each call gets its own temp
        directory, its own library and its own ephemeral port, and every one
        of them is torn down. A case that needs both arms therefore compares
        two genuinely independent stores rather than mutating one."""
        tmp = tempfile.TemporaryDirectory()
        self._tmps.append(tmp)
        root = Path(tmp.name)
        self.library = root / "library"
        self.library.mkdir()
        # The synthetic vault, with two notes genuinely under the folder she
        # is about to make private and one deliberately outside it.
        self.vault = root / VAULT_DIRNAME
        (self.vault / PRIVATE).mkdir(parents=True)
        (self.vault / "Notes").mkdir(parents=True)
        self.inside = [self.vault / PRIVATE / "one.md",
                       self.vault / PRIVATE / "two.md"]
        self.outside = self.vault / "Notes" / "three.md"
        for p in self.inside + [self.outside]:
            p.write_bytes(b"# a note\n")

        store = study_lib.new_store(self.library)
        if stamp_vault_root:
            # What a whole-vault import stamps (study_lib `if is_vault:`).
            store["meta"]["vault_root"] = str(self.vault.resolve())
        store["items"] = {
            "in-one": _item("in-one", self.inside[0].resolve()),
            "in-two": _item("in-two", self.inside[1].resolve()),
            "outside": _item("outside", self.outside.resolve()),
        }
        study_lib.save_store(self.library, store)
        httpd = server.create_server(self.library, 0)   # 0 = ephemeral
        self.port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self._servers.append((httpd, thread))

    def raw_post(self, path, body):
        """The SERIALIZED response body, as bytes. ⚠ Handed back raw on
        purpose: `no_path_on_the_wire` must read what actually crossed the
        wire, not a parsed dict — a leak through a nested key or an error
        string would be invisible to a key-name check."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            raw = json.dumps(body).encode("utf-8")
            conn.request("POST", path, raw,
                         {"Content-Type": "application/json"})
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def roster(self, op, folder):
        status, raw = self.raw_post("/api/librarian/roster",
                                    {"op": op, "folder": folder})
        self.assertEqual(status, 200, raw[:300])
        return json.loads(raw), raw

    def stored(self):
        return study_lib.load_store(self.library)

    # -- 1. NO FILESYSTEM PATH CROSSES THIS WIRE -----------------------------
    #
    # ⚠ WRITTEN FIRST AND ASSERTED ON THE SERIALIZED BODY. The value being
    # guarded is a home-directory path; the fix is a BOOLEAN derived from it,
    # and the cheapest wrong implementation answers the path itself. A check
    # against the parsed dict's keys would miss a leak nested one level down
    # or welded into an error string.

    def test_no_path_on_the_wire(self):
        self.build(stamp_vault_root=True)
        root = str(self.vault.resolve())

        # ⛔ ANTI-VACUITY FIRST. A check that something is absent proves
        # nothing unless that something exists and could have leaked. The
        # stamped root is asserted present ON DISK before its absence on the
        # wire means anything at all.
        on_disk = (self.library / "items.json").read_text(encoding="utf-8")
        self.assertIn("vault_root", on_disk,
                      "the store does not carry the key whose absence from "
                      "the wire this case is about — every assertion below "
                      "would be a pass over nothing")
        self.assertIn(root, on_disk)
        self.assertTrue(root, "an empty root would make every needle empty")

        answer, raw = self.roster("add", PRIVATE)
        body = raw.decode("utf-8")

        self.assertNotIn("vault_root", body,
                         "the key itself reached the browser")
        self.assertNotIn(root, body, "the stamped vault root reached "
                                     "the browser by value")
        self.assertNotIn(VAULT_DIRNAME, body,
                         "a segment of the vault root's path reached the "
                         "browser — a partial leak is still a leak")
        self.assertNotIn("/Users/", body,
                         "a home-directory path reached the browser")
        self.assertNotIn(os.sep + "private" + os.sep, body)

        # And the field IS there — otherwise the four assertions above are
        # satisfied by a route that answers nothing new at all.
        self.assertIn(FIELD, answer,
                      "the route does not answer whether the retroactive "
                      "pass was applicable, so the absence checks above are "
                      "passing over a field that does not exist")

    # -- 2. NO VAULT ROOT — THE PASS DID NOT RUN, AND THE ROUTE SAYS SO ------

    def test_retroactive_absent(self):
        self.build(stamp_vault_root=False)
        answer, _ = self.roster("add", PRIVATE)

        self.assertIn(FIELD, answer,
                      "the route must say whether the retroactive pass was "
                      "applicable; without it the room cannot tell a pass "
                      "that ran over nothing from a pass that never ran")
        self.assertIs(answer[FIELD], False)
        self.assertEqual(answer["flagged"], 0)
        self.assertIn(PRIVATE, answer["fenced_roster"],
                      "the folder is still added — only the BACKWARD half "
                      "is inapplicable")

        items = self.stored()["items"]
        for key in ("in-one", "in-two"):
            self.assertIsNot(
                items[key]["trigger"], True,
                "the server set nothing aside, which is exactly why the "
                "room may not say it did")

    # -- 3. WITH A VAULT ROOT — IT DID RUN, AND IT REACHED TWO THINGS --------

    def test_retroactive_present(self):
        self.build(stamp_vault_root=True)
        answer, _ = self.roster("add", PRIVATE)

        self.assertIn(FIELD, answer)
        self.assertIs(answer[FIELD], True)
        self.assertEqual(answer["flagged"], 2)

        items = self.stored()["items"]
        for key in ("in-one", "in-two"):
            self.assertIs(items[key]["trigger"], True,
                          "an already-imported item under the folder she "
                          "just made private was not set aside")
        # The control: the item OUTSIDE the folder is untouched, so the pass
        # is proven selective rather than a blanket stamp.
        self.assertIsNot(items["outside"]["trigger"], True)

    # -- 4. A BOOLEAN, NEVER A STRING AND NEVER A PATH ----------------------
    #
    # ⚠ ON BOTH ARMS, and the remove arm is here rather than in
    # `remove_unaffected` on purpose: that case is a CONTROL and must be green
    # before the fix exists, so it cannot also be the case that asserts the
    # new field.

    def test_retroactive_is_a_bool(self):
        for stamped in (True, False):
            self.build(stamp_vault_root=stamped)
            for op in ("add", "remove"):
                with self.subTest(vault_root=stamped, op=op):
                    answer, _ = self.roster(op, PRIVATE)
                    self.assertIn(FIELD, answer,
                                  "both arms of the route answer the flag; "
                                  "an arm that omits it is a client that has "
                                  "to guess")
                    value = answer[FIELD]
                    # ⛔ BY TYPE, BY VALUE. `isinstance(True, int)` is True in
                    # Python, so `is True / is False` is the assertion that
                    # actually refuses 1, 0, "yes" and a path string.
                    self.assertTrue(value is True or value is False,
                                    "answered %r (%s), which is not a JSON "
                                    "boolean" % (value, type(value).__name__))

    # -- 5. THE CONTROL: REMOVE'S D-07 BEHAVIOUR DOES NOT MOVE --------------
    #
    # ⚠ GREEN BEFORE THE FIX AND AFTER IT, deliberately. Removing never
    # reached backwards and still does not; this plan changes what the route
    # ANSWERS, never what the library DOES. If this goes red, the library
    # moved and that is a finding, not a re-pin.

    def test_remove_unaffected(self):
        self.build(stamp_vault_root=True)
        # Make the folder private first, so there is something already set
        # aside for the remove to fail to hand back.
        self.roster("add", PRIVATE)
        before = self.stored()["items"]
        self.assertIs(before["in-one"]["trigger"], True,
                      "nothing was set aside, so 'stays set aside' below "
                      "would be a pass over nothing")

        answer, _ = self.roster("remove", PRIVATE)
        self.assertIs(answer["ok"], True)
        self.assertNotIn(PRIVATE, answer["fenced_roster"],
                         "the roster meta write is the whole of what remove "
                         "does")

        after = self.stored()["items"]
        for key in ("in-one", "in-two"):
            self.assertIs(after[key]["trigger"], True,
                          "un-fencing is a deliberate per-item release and "
                          "never bulk (D-07) — a remove that handed items "
                          "back would be a bulk exposure")


if __name__ == "__main__":
    unittest.main()


class RosterDirectionMustBeSaidTest(unittest.TestCase):
    """⛔⛔ THE ROOM MAY NEVER OFFER TO DO THE OPPOSITE OF WHAT SHE ASKED.

    WHY THIS CLASS EXISTS, AND IT IS NOT A HYPOTHETICAL. Fixing F-8 (the
    librarian never routed her to the private-folders pane) let a privacy
    request finally classify as the `roster` topic — which is correct. But the
    value resolver's rule everywhere else is "not obviously an add means a
    removal", and on the roster a REMOVAL LETS THE LIBRARIAN READ A FOLDER SHE
    MADE PRIVATE. So "stop the librarian reading my Journal folder" resolved
    into a card offering to un-fence Journal.

    ⛔⛔ AND THE FIRST FIX WAS WRONG IN THE WAY THAT MATTERS. It required a
    positive un-fence signal, which reads like the right shape — but the regex
    was tuned to the ONE example sentence and had no negation handling, so
    "don't let the librarian read my Journal", "the librarian should not read
    my Journal" and eight more still tripped it. The security pass drove 11
    more-privacy sentences and 10 of them still produced an un-fence card. It
    was caught by a pass that DROVE the guard, not by any test, because the
    fix shipped with no test at all — the exact defect class this phase's
    whole record is about.

    THE RULE NOW, and it is deliberately conservative: a roster un-fence needs
    a positive signal AND NO NEGATION ANYWHERE IN THE SENTENCE. Anything else
    resolves to nothing, which lands the honest manage-only line plus the
    route to the pane.

    ⚠ THE COST IS REAL AND IS ACCEPTED. A genuine un-fence phrased with a
    negation ("Journal isn't private any more") is refused and she is routed
    to the pane instead of getting a one-tap card. That is one extra tap in
    the SAFE direction. The failure it prevents is the room proposing to strip
    a folder's privacy while she is asking for more of it.

    ⛔ BOTH ARMS ARE DRIVEN. A guard that simply never resolves would satisfy
    the first arm alone, so the second arm pins sentences that MUST still
    produce a card.
    """

    MORE_PRIVACY = [
        "stop the librarian reading my Journal folder",
        "don't let the librarian read my Journal",
        "the librarian should not read my Journal",
        "the librarian may not read my Journal",
        "the librarian can't read my Journal",
        "please never let anything read my Journal",
        "do not allow the librarian to read my Journal",
        "keep my Journal private, the librarian should never read it",
        "make sure nobody can read my Journal",
        "drop the librarian, keep my Journal private",
        "take the librarian away from my private Journal",
        "hide my Journal",
        "I don't want the librarian in my Journal",
        "never allow the librarian to read Journal",
    ]

    STILL_UNFENCE = [
        "let the librarian read my Journal again",
        "allow the librarian to read Journal",
        "the librarian can read Journal now",
        "unhide my Journal folder",
        "remove Journal from my private folders",
        "permit the librarian to read Journal",
        "take Journal off the private list",
    ]

    def test_no_more_privacy_ask_reads_as_an_unfence(self):
        """⛔ THE ONE THAT MATTERS. Not one of these may trip the signal."""
        tripped = [s for s in self.MORE_PRIVACY
                   if server._config_reads_as_unfence(s)]
        self.assertEqual(
            tripped, [],
            "these ask for MORE privacy and were read as a request to LET "
            "THE LIBRARIAN READ: " + repr(tripped))

    def test_a_more_privacy_ask_never_resolves_to_a_roster_card(self):
        """The whole path, not just the predicate — the resolver must return
        nothing, so the room answers manage-only plus the route."""
        offered = []
        for s in self.MORE_PRIVACY:
            ctx = {"roster": ["Journal", "personnel notes"], "text": s}
            got = server._resolve_value_change("roster", ctx)
            if got is not None:
                offered.append((s, got.get("value")))
        self.assertEqual(
            offered, [],
            "the room offered to UN-FENCE a folder for an ask that wanted it "
            "MORE private: " + repr(offered))

    # ⛔ THE ACCEPTED COST, PINNED RATHER THAN LEFT IMPLICIT. These DO mean
    # "let the librarian read it again", and the negation rule refuses them.
    # They are listed here so the cost is visible in the gate itself and so a
    # later loosening has to delete a named case rather than quietly widen a
    # regex — and each is asserted to fail in the SAFE direction: resolving to
    # nothing lands the manage-only line plus the route to the pane, never a
    # card.
    REFUSED_BUT_GENUINE = [
        "stop keeping Journal private",
        "Journal isn't private any more",
    ]

    def test_the_accepted_cost_fails_in_the_safe_direction(self):
        for s in self.REFUSED_BUT_GENUINE:
            ctx = {"roster": ["Journal", "personnel notes"], "text": s}
            self.assertIsNone(
                server._resolve_value_change("roster", ctx),
                "if this now resolves, the negation rule was loosened — that "
                "is a real decision and needs its own drive of MORE_PRIVACY: "
                + s)

    def test_a_plain_unfence_still_resolves(self):
        """⛔ THE ANTI-DEGENERATE ARM. Without this, a guard that always
        refused would pass the two cases above and quietly remove a real
        capability."""
        missed = []
        for s in self.STILL_UNFENCE:
            ctx = {"roster": ["Journal", "personnel notes"], "text": s}
            got = server._resolve_value_change("roster", ctx)
            if got is None or got.get("value") != "Journal" and "Journal" in s:
                missed.append(s)
        self.assertEqual(
            missed, [],
            "these plainly ask to let the librarian read again and were "
            "refused: " + repr(missed))


class AskTopicGlossTest(unittest.TestCase):
    """⛔⛔ THE PHASE'S OWN GOAL, AND UNTIL NOW IT HAD NO GATE AT ALL.

    F-8, from the owner sitting: she asked the librarian, in her own words, to
    make a folder private, and it never routed her to the private-folders
    pane. Her exact sentence classified as topic `filters` — the WRONG page.
    Three phrasings were driven, including the most explicit one available,
    and not one reached the roster topic.

    ROOT CAUSE. The model must return a `topic` from a fixed enum, and that
    enum carries INTERNAL MACHINE KEYS. The key for this page is `roster`; the
    page's own name — the one she and the room both use — is "private
    folders". Nothing connected the two, while `filters` reads like the
    setting that hides things. The fix glosses the non-obvious keys in
    CONFIG_PROMPT.

    ⚠⚠ WHY THIS FILE CANNOT SIMPLY ASSERT THE FIX WORKS. Whether the model
    picks the right topic is only answerable by ASKING THE MODEL, which costs
    money on every run and is not deterministic. So there are two arms and
    they are honest about which is which:

      ARM 1, always on — the gloss EXISTS and covers every value topic. This
      catches the realistic regression: someone edits the prompt, drops or
      renames a gloss, and the routing silently breaks again. ⛔ It does NOT
      prove the model classifies correctly, and must never be described as if
      it does.

      ARM 2, opt-in — drives the REAL classifier over the sentences that
      failed at her sitting. Run it with STUDYROOM_LIVE_ASK=1 and a server on
      $STUDYROOM_ASK_URL. ⚠ It is SKIPPED loudly rather than silently, because
      a skipped arm that looks like a pass is the same lie this phase keeps
      finding.

    ⛔ ARM 1 IS DERIVED, NEVER HAND-TYPED. It reads VALUE_TOPICS off the
    server, so a value topic added later without a gloss goes red on its own.
    """

    def test_every_value_topic_is_glossed_in_the_prompt(self):
        """⛔ Derived from VALUE_TOPICS — a new one added without a gloss
        turns this red without anybody remembering to update a list."""
        prompt = server.CONFIG_PROMPT
        missing = [t for t in server.VALUE_TOPICS if t not in prompt]
        self.assertEqual(
            missing, [],
            "these topic keys are internal machine words the model must "
            "choose between, and the prompt never says what they mean — "
            "which is exactly how a request to make a folder private "
            "classified as 'filters' and routed her to the wrong page: "
            + repr(missing))

    def test_the_roster_gloss_uses_the_words_a_person_would_use(self):
        """The gloss is worthless if it restates the machine word. It has to
        carry the language she actually types."""
        prompt = server.CONFIG_PROMPT.lower()
        self.assertIn("roster", prompt)
        for word in ("private", "never read"):
            self.assertIn(
                word, prompt,
                "the roster gloss must reach a person's own words; without "
                "%r the model has nothing to match 'keep this folder "
                "private' against" % (word,))

    def test_filters_is_disambiguated_from_privacy(self):
        """⛔ THE OTHER HALF OF THE BUG, AND THE EASIER ONE TO FORGET. Naming
        `roster` is not enough while `filters` still reads like the setting
        that hides things — that is the topic her sentence actually got."""
        prompt = server.CONFIG_PROMPT.lower()
        at = prompt.find("'filters'")
        self.assertNotEqual(at, -1, "the prompt no longer glosses 'filters'")
        window = prompt[at:at + 220]
        self.assertTrue(
            "never a folder" in window or "not a folder" in window,
            "the filters gloss must say it is NOT about a folder's privacy; "
            "without that the model still has two plausible topics for the "
            "same sentence. gloss found: " + repr(window[:160]))

    def test_live_classification_of_the_sentences_that_failed_at_her_sitting(self):
        """ARM 2 — the only arm that proves the fix FIRES. Opt-in.

        ⛔ SKIPPED LOUDLY. A live-model assertion costs money on every run, so
        it is not on by default — but a silent skip would be a green tick over
        an unasked question, which is the defect this whole phase is about.
        """
        if os.environ.get("STUDYROOM_LIVE_ASK") != "1":
            raise unittest.SkipTest(
                "LIVE ARM NOT RUN — the only arm that proves the routing "
                "actually fires. Enable with STUDYROOM_LIVE_ASK=1 and "
                "STUDYROOM_ASK_URL=http://127.0.0.1:8747 (costs one model "
                "call per sentence). Arm 1 above proves only that the gloss "
                "is present.")
        import time
        import urllib.request
        base = os.environ.get("STUDYROOM_ASK_URL", "http://127.0.0.1:8747")
        sentences = [
            "can you hide the content studio folder",
            "keep my Content Studio folder private so the librarian never reads it",
            "stop the librarian reading my Journal folder",
        ]
        wrong = []
        for text in sentences:
            body = json.dumps({"text": text}).encode()
            req = urllib.request.Request(
                base + "/api/librarian/ask", data=body,
                headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=30).read()
            topic = None
            for _ in range(20):
                time.sleep(2.0)
                with urllib.request.urlopen(
                        base + "/api/librarian/ask", timeout=15) as r:
                    d = json.loads(r.read())
                if d.get("state") == "done":
                    topic = d.get("topic")
                    break
            if topic != "roster":
                wrong.append((text, topic))
        self.assertEqual(
            wrong, [],
            "these are the sentences that failed at her sitting; each must "
            "reach the roster topic or she is routed to the wrong page: "
            + repr(wrong))
