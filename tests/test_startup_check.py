#!/usr/bin/env python3
"""tests/test_startup_check.py — the front door, proved by value.

Standalone one-shot script in the house convention: no runner, no package.json,
nothing installed (law 8). Exits 0/1 on BARE invocation, so it sits inside the
`tests/test_*.py` glob the counting sweep uses. It parses no command-line
options at all — a suite that expected flags would exit 2 when the sweep runs
it with none.

WHAT THIS SUITE IS FOR. 26.93-08 gives the room a front door that says WHO IS
ANSWERING before anything is asked of anyone, and rebuilds the availability
answer on the routing object instead of on a binary that may or may not be on
PATH. Three claims carry the plan:

  1. the start-up line names a provider AND a model for every filled tier, and
     opens NO cloud connection to do it;
  2. only a recorded 401/403 may move what the room believes about a key — a
     429, a 5xx, no-network and a slow read leave it exactly as it was;
  3. her own machine's three states stay three, each with its own command.

⚠⚠ THIS SUITE NEVER TOUCHES THE REAL CONFIG DIRECTORY, AND IT NEVER SPENDS HER
MONEY. Every path it exercises is under a temp root it created, the home
directory is swapped to that root before anything is written, and the module's
transport seam is replaced with a fake that opens nothing. Both matter: the
owner's real Anthropic key lives on this machine, and a suite that read the
real home directory would resolve the cloud tiers to a real provider and pay
for it. `assert_under_temp_root` says so BEFORE anything is written, a case
compares the real directory's existence against what it was at import, and
`main()` checks it again after everything has run.

⚠⚠ NO ASSERTION HERE MAY PRINT A KEY VALUE, EVEN THE PLANTED FAKE ONE. Where
the haystack could contain a credential, absence is asserted with a boolean and
a message that names the FIELD — never `assertIn`/`assertNotIn`, whose failure
output prints needle and haystack together and would turn a failing run in a
transcript into the leak the case exists to prevent. `assertNotIn` IS used, but
only where the haystack is a plain sentence the room shows her anyway.

⚠ TWO INDEPENDENT INSTRUMENTS, NOT ONE. This suite is the behavioural one. The
second is the static block in `tests/test_no_push.cjs` that Plan 26.93-10
rewrites. Neither is redundant: this one drives the shipped code and would
notice a wrong answer, that one reads the source and would notice a call site
that stopped going through the seam at all. Deleting either leaves one
instrument, and one is how roughly thirty defects of this project's class got
in — including a checker in a shell variable that never ran while three of four
cases printed that they were red.

The temp trees this suite makes are removed by this suite: every root here is
made with `tempfile.mkdtemp` (the system temp location, outside the repo) and
removed on cleanup.
"""

import inspect
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, __file__.rsplit("/", 2)[0])

import librarian_call as L          # noqa: E402
import study_lib                    # noqa: E402
import server                       # noqa: E402  (its import binds the literals)


# The counts this file asserts BY VALUE. A harness that aborts early then fails
# loudly instead of reporting a smaller success.
EXPECTED_CASES = 21          # 26.94-03: 19 + the two V6 cases
EXPECTED_MUTATIONS = 6
EXPECTED_CONTROLS = 2

# ⚠ 26.94-03 (D-03, SRM-11) — THE OWNER'S OWN WORDS, PINNED BY VALUE, ONCE.
# Front-facing wording is hers (the 26.99 precedent); these two lines were
# proposed by 26.94-03 and approved verbatim on 2026-08-13. They are written
# out here rather than imported from `server` so that this suite would notice
# the sentence CHANGING, not merely the constant moving — a case that asserted
# `server.SOMETHING in text` is green on any rewording at all.
#
# ⚠ The command half is assembled from the shipped module constant on purpose:
# `xcode-select --install` must appear EXACTLY ONCE in `server.py`, and the
# fixed prefix is copied byte-for-byte from the search model's line eight
# lines above it in the same file.
CLT_FACT_LINE = ("  reading photographs:  the Command Line Tools are not "
                 "there; the room cannot read your photographs until they "
                 "are.")
CLT_COMMAND_LINE = "    to fetch them, run:   xcode-select --install"

# The fake value planted in a TEMPORARY keys file so that "no key value reaches
# this surface" can be asserted by searching for something that is definitely
# there to be found. It is never printed by any assertion in this file.
PLANTED = "planted-fake-credential-never-printed-08a1"

# The one job row `server.py` binds its literals to first, so it is the row a
# drill can drive through an adapter without help. ⚠ WAS `heading_proposals`
# until 2026-08-17, when the labelling pass's two jobs were deleted (#95) —
# `import_presort` is the first bind now. Any bound row serves: this names a
# row to drive, never a property of that particular job.
GATE_JOB = "import_presort"

# ⚠ THE FOUR THAT HAVE NOT LOOKED AT A CREDENTIAL (D-07). None of them may move
# the room's belief about a key, and none of their answers may mention one.
NEVER_A_KEY = ("rate_limited", "provider_down", "offline", "timeout")

# What a canned transport answers to produce each token through the SHIPPED
# classifier — the drivers, not a re-implementation of the table.
DRIVERS = {"bad_key": 401, "rate_limited": 429, "provider_down": 500,
           "offline": None, "timeout": L.STATUS_TIMED_OUT}

# The four answers her own machine can give, as the probe reports them.
WORKING = {"state": L.PROBE_WORKING,
           "tags": ["qwen2.5:7b", "nomic-embed-text:v1.5"],
           "search_model": True}
NO_SEARCH = {"state": L.PROBE_WORKING, "tags": ["qwen2.5:7b"],
             "search_model": False}
NO_LANGUAGE = {"state": L.PROBE_MODEL_MISSING, "tags": ["llama3:8b"],
               "search_model": False}
NOT_RUNNING = {"state": L.PROBE_NOT_RUNNING, "tags": [], "search_model": False}

# ⚠ CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY. This is how
# the suite proves afterwards that it did not create — or delete, or touch —
# the real config directory, which now holds a real credential.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)


# ---------------------------------------------------------------------------
# ---- the fakes: a recorder, a counted probe, and canned answers -----------

def canned_transport(status=200, body=b"{}"):
    """A transport that opens nothing and always answers the same triple.

    Takes `auth` as its own argument, exactly as the shipped transport does —
    the credential travels beside the request, never inside it."""
    def _transport(request, timeout_s, auth=None):
        del request, timeout_s, auth
        return status, {}, body
    return _transport


def tags_body(names):
    return json.dumps({"models": [{"name": n} for n in names]}).encode("utf-8")


def tags_transport(names, status=200):
    """What the local server answers `/api/tags` with, for a given tag list."""
    return canned_transport(status=status, body=tags_body(names))


class Recorder:
    """Records every request that would have gone out, and classifies it by
    ADDRESS rather than by provider name — the same rule the fence uses.

    A cloud request during the start-up check is the defect this exists to
    notice: it would be paid for, on every single room open."""

    def __init__(self, status=200, body=None):
        self.requests = []
        self.status = status
        self.body = tags_body(["qwen2.5:7b"]) if body is None else body

    def __call__(self, request, timeout_s, auth=None):
        del timeout_s, auth
        self.requests.append(str((request or {}).get("url") or ""))
        return self.status, {}, self.body

    @property
    def calls(self):
        return len(self.requests)

    @property
    def cloud_calls(self):
        here = L.DEFAULT_BASES["ollama"]
        return len([u for u in self.requests if not u.startswith(here)])


class CountingProbe:
    """The injected local question, counted. `startup_librarian_check` takes
    `probe` as a parameter precisely so this is possible with no live server."""

    def __init__(self, answer):
        self.answer = answer
        self.calls = 0

    def __call__(self, base):
        del base
        self.calls += 1
        return dict(self.answer)


def routing_with(fills, provenance=None):
    """A frozen Routing with exactly these fills — built through the module's
    own constructor, so it is the same object shape the handlers hand down."""
    prov = dict((tier, L.SOURCE_DEFAULT) for tier in L.TIERS)
    prov.update(provenance or {})
    return L._make_routing(fills, L.DEFAULT_BASES, L.DEFAULT_TIMEOUTS, prov)


def cloud_only_routing():
    """Every tier served by a company, so nothing asks her machine anything."""
    return routing_with({"local": L.ANTHROPIC_FILLS["cheap-cloud"],
                         "cheap-cloud": L.ANTHROPIC_FILLS["cheap-cloud"],
                         "good-cloud": L.ANTHROPIC_FILLS["good-cloud"]})


def no_local_fill_routing():
    """A routing whose local tier holds nothing at all."""
    return routing_with({"cheap-cloud": L.ANTHROPIC_FILLS["cheap-cloud"],
                         "good-cloud": L.ANTHROPIC_FILLS["good-cloud"]})


def anthropic_routing():
    """A frozen Routing whose LOCAL tier is filled by Anthropic, so the one
    bound job row can be driven through the cloud adapter. Built through
    `resolve_routing` with a stored fill, never by hand."""
    return L.resolve_routing(
        {"fills": {"local": list(L.ANTHROPIC_FILLS["good-cloud"])}},
        environ={})


def store_with(meta=None):
    return {"meta": dict(meta or {}), "items": {}}


# ---------------------------------------------------------------------------
# ---- the home swap: the whole of the isolation, and of the containment ----

def swap_home(tmp_home):
    """Point the home directory, the transport and the wait seam at fakes.

    ⚠ THE HOME SWAP IS WHAT KEEPS THIS SUITE FROM SPENDING HER MONEY. Every
    path in the key plan is derived from the home directory on every call, so
    with it pointed at a fresh temp tree `key_present` answers False for both
    companies and every tier resolves to her own machine — which the fake
    transport then answers without a socket."""
    saved = {"HOME": os.environ.get("HOME"), "transport": L._transport,
             "sleep": L._sleep, "env": {}}
    os.environ["HOME"] = tmp_home
    names = list(L.KEY_ENV_NAMES.values()) + list(L.FILL_ENV_NAMES.values())
    for name in names:
        saved["env"][name] = os.environ.pop(name, None)
    # The module's own wait seam, so a retried token costs no wall clock.
    L._sleep = lambda seconds: None
    return saved


def restore_home(saved):
    L._transport = saved["transport"]
    L._sleep = saved["sleep"]
    for name, value in saved["env"].items():
        if value is not None:
            os.environ[name] = value
        else:
            os.environ.pop(name, None)
    if saved["HOME"] is None:
        os.environ.pop("HOME", None)
    else:
        os.environ["HOME"] = saved["HOME"]


# ---------------------------------------------------------------------------
# ---- the checker the mutation drill actually drives -----------------------

def front_door_violations(lines, answer, planted, whys=None, beliefs=None,
                          cloud_calls=0, search_available=True):
    """This plan's front-door claims, as a list of failures. Empty means all
    held.

    Factored out for the reason `custody_violations` and `seam_violations` are:
    the SAME function that judges a real measurement can be fed in-memory copies
    with one thing wrong each. A gate expressed only as inline assertions cannot
    be driven red without editing its own source, and A GATE NEVER SEEN RED IS
    NOT EVIDENCE.

    ⚠ No entry ever contains a key value — each names the FIELD that failed."""
    bad = []

    text = "\n".join(str(line) for line in (lines or []))
    if planted and planted in text:
        bad.append("a key value is reachable from the start-up lines")
    try:
        rendered = json.dumps(answer, default=str)
    except (TypeError, ValueError):
        rendered = str(answer)
    if planted and planted in rendered:
        bad.append("a key value is reachable from the availability answer")

    if cloud_calls:
        bad.append("the start-up check opened %d connection(s) to a company, "
                   "and it may open none — that is money, on every room open"
                   % cloud_calls)

    if not search_available:
        bad.append("a missing search model reported the librarian "
                   "unavailable, and it must not (#35 section 4) — the "
                   "language model can still clean, label, name sections and "
                   "write a reflection")

    whys = whys or {}
    beliefs = beliefs or {}

    if not beliefs.get("bad_key"):
        bad.append("`bad_key` moved no belief about the key — it is the one "
                   "token that must (D-07)")
    for token in NEVER_A_KEY:
        if beliefs.get(token):
            bad.append("`" + token + "` moved the room's belief about a key "
                       "and must never (D-07) — a busy or unreachable server "
                       "has not looked at the credential, and acting as if it "
                       "had sends her to replace a working one")
        if "key" in whys.get(token, ""):
            bad.append("the room's answer after `" + token + "` mentions a "
                       "key, and that token has not looked at one (D-07)")

    said = whys.get("bad_key", "")
    if "anthropic" not in said or "python3 server.py --setup" not in said:
        bad.append("`bad_key`'s answer does not name the provider that "
                   "refused and the one command that puts a fresh key in")

    local = [whys.get(name, "") for name in
             ("local_working", "local_no_language", "local_not_running")]
    if len(set(local)) != 3:
        bad.append("her own machine's three states did not produce three "
                   "different answers — two of them collapsed into one, and "
                   "they need different commands")

    return bad


# ---------------------------------------------------------------------------
# ---- the cases ------------------------------------------------------------

class FrontDoorCase(unittest.TestCase):

    def setUp(self):
        # ⚠ THE TEMP ROOT COMES FIRST, AND NOTHING IS WRITTEN BEFORE THE
        # ASSERTION BELOW.
        self.tmp_home = tempfile.mkdtemp(prefix="study-room-frontdoor-")
        self.saved = swap_home(self.tmp_home)
        self.addCleanup(self._restore)
        self.assert_under_temp_root()

    def _restore(self):
        restore_home(self.saved)
        shutil.rmtree(self.tmp_home, ignore_errors=True)

    def assert_under_temp_root(self):
        """Every path this case can write to is inside the tree it made.

        `realpath` on both sides because the system temp location is itself a
        symlink on macOS."""
        root = os.path.realpath(self.tmp_home)
        for path in (study_lib.room_config_dir(), L.settings_path(),
                     L.keys_path()):
            here = os.path.realpath(str(path))
            self.assertTrue(
                here == root or here.startswith(root + os.sep),
                "a path this suite is about to write is not under its own "
                "temp root")
        self.assertNotEqual(os.path.realpath(str(study_lib.room_config_dir())),
                            os.path.realpath(REAL_ROOM_DIR))

    # -- helpers ------------------------------------------------------------

    def answer_after(self, token):
        """Drive one failure token through the SHIPPED seam, then ask the room
        what it now believes. A fresh key is saved first, because a newly given
        key has no history."""
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        L._transport = canned_transport(status=DRIVERS[token])
        result = L.call_librarian(GATE_JOB, "x", anthropic_routing())
        self.assertEqual(result["failure"], token,
                         "the driver for this token produced another one")
        return server.librarian_available(store_with())

    # -- the start-up line, and what it costs --------------------------------

    def test_every_filled_tier_names_a_provider_and_a_model(self):
        routing = routing_with({"local": L.LOCAL_FILL,
                                "cheap-cloud": L.ANTHROPIC_FILLS["cheap-cloud"],
                                "good-cloud": L.ANTHROPIC_FILLS["good-cloud"]})
        text = "\n".join(server.startup_librarian_check(
            routing, probe=CountingProbe(WORKING)))
        for provider, model in routing.fills.values():
            self.assertIn(provider, text)
            self.assertIn(model, text)
        self.assertIn("the shipped default", text)
        # ...and a refused shell value is not allowed to look like a default:
        # fail-closed is correct, invisible is not.
        refused = "\n".join(server.startup_librarian_check(
            routing_with({"local": L.LOCAL_FILL},
                         {"local": L.SOURCE_ENV_REJECTED}),
            probe=CountingProbe(WORKING)))
        self.assertIn("refused", refused)

    def test_a_tier_with_no_fill_is_named_and_never_substituted(self):
        text = "\n".join(server.startup_librarian_check(
            no_local_fill_routing(), probe=CountingProbe(WORKING)))
        # the tier is NAMED, and what it costs is said
        self.assertIn("your own machine", text)
        self.assertIn("nothing fills this", text)
        self.assertIn("will refuse", text)
        # ...and nothing stepped in: no other tier's model appears on its line
        self.assertNotIn("qwen2.5:7b", text)

    def test_the_start_up_check_opens_no_connection_at_all(self):
        recorder = Recorder()
        L._transport = recorder
        server.startup_librarian_check(cloud_only_routing(),
                                       probe=CountingProbe(WORKING))
        # ⚠ BY VALUE. A cloud check on every room open is money, every time.
        self.assertEqual(recorder.calls, 0)

    def test_exactly_one_local_question_when_a_local_fill_exists(self):
        probe = CountingProbe(WORKING)
        # no cloud key anywhere, so all three tiers are her own machine
        server.startup_librarian_check(server.resolve_librarian_routing(),
                                       probe=probe)
        self.assertEqual(probe.calls, 1)

    def test_no_local_fill_asks_her_machine_nothing(self):
        probe = CountingProbe(WORKING)
        server.startup_librarian_check(no_local_fill_routing(), probe=probe)
        self.assertEqual(probe.calls, 0)

    def test_each_local_state_carries_its_own_command(self):
        routing = routing_with({"local": L.LOCAL_FILL})

        def lines_for(answer):
            return "\n".join(server.startup_librarian_check(
                routing, probe=CountingProbe(answer)))

        not_running = lines_for(NOT_RUNNING)
        no_language = lines_for(NO_LANGUAGE)
        no_search = lines_for(NO_SEARCH)
        working = lines_for(WORKING)
        self.assertIn("ollama serve", not_running)
        self.assertIn("ollama pull qwen2.5:7b", no_language)
        self.assertIn("ollama pull nomic-embed-text:v1.5", no_search)
        # THREE states, never flattened: the language model missing is not the
        # same fact as nothing answering, and neither is the search model.
        self.assertNotIn("ollama serve", no_language)
        self.assertNotIn("ollama pull", working)
        self.assertIn("cannot search your own things", no_search)

    # -- the planted value, on three surfaces --------------------------------

    def test_the_start_up_lines_carry_no_key_value(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        text = "\n".join(server.startup_librarian_check(
            server.resolve_librarian_routing(), probe=CountingProbe(WORKING)))
        # ⚠ Boolean plus field name — the haystack IS the surface a key could
        # appear on, so a failure here must never echo what it is judging.
        self.assertTrue(PLANTED not in text,
                        "a key value appears in the start-up lines")
        # ...and the control half: it DID report the key's presence, so this is
        # not passing because the surface said nothing at all.
        self.assertTrue("a key is present." in text,
                        "the start-up lines do not report a saved key at all")
        self.assertTrue("anthropic" in text,
                        "the start-up lines do not name the provider")

    def test_the_availability_answer_carries_no_key_value(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        L._transport = tags_transport(["qwen2.5:7b"])
        answer = server.librarian_available(store_with())
        self.assertTrue(PLANTED not in json.dumps(answer, default=str),
                        "a key value is present in librarian_available's "
                        "return, at some depth")
        self.assertIs(answer["available"], True)

    def test_this_suite_never_prints_a_key_value_even_on_failure(self):
        found = front_door_violations(["a line " + PLANTED],
                                      {"why": PLANTED}, PLANTED)
        self.assertTrue(found,
                        "the checker did not notice a planted key value")
        self.assertTrue(PLANTED not in "\n".join(found),
                        "the checker's own failure message carries a key "
                        "value, which would make a failing run the leak")

    # -- the key belief: only a 401/403 may move it --------------------------

    def test_a_rejection_names_the_provider_and_the_setup_command(self):
        answer = self.answer_after("bad_key")
        self.assertIs(answer["available"], False)
        self.assertIn("anthropic", answer["why"])
        self.assertIn("python3 server.py --setup", answer["why"])
        self.assertIsNotNone(L.load_keys()["anthropic"]["rejected_ms"])

    def test_a_busy_or_unreachable_provider_never_mentions_a_key(self):
        for token in NEVER_A_KEY:
            answer = self.answer_after(token)
            # ⚠ The haystack here is a plain sentence the room shows her, never
            # a credential, so `assertNotIn` is safe and is the clearer failure.
            self.assertNotIn("key", str(answer["why"] or ""))
            # the room stayed available on the cloud tiers, because nothing
            # about the key changed...
            self.assertIs(answer["available"], True)
            # ...and the belief itself did not move, which is the real claim.
            self.assertIsNone(L.load_keys()["anthropic"]["rejected_ms"],
                              "a busy or unreachable server moved the room's "
                              "belief about a key")

    def test_a_rejection_against_one_provider_never_doubts_the_other(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        L.save_key("openai", PLANTED)
        L._note_key_rejected("openai")
        # nothing answering on her own machine, so only the cloud tiers can
        # keep the room available
        L._transport = canned_transport(status=None)
        answer = server.librarian_available(store_with())
        self.assertIs(answer["available"], True)
        self.assertIsNone(L.load_keys()["anthropic"]["rejected_ms"])
        self.assertIsNotNone(L.load_keys()["openai"]["rejected_ms"])

    # -- her own machine's three states --------------------------------------

    def test_the_three_local_states_are_three_different_answers(self):
        whys = {}
        L._transport = tags_transport(["qwen2.5:7b"])
        whys["working"] = str(server.librarian_available(store_with())["why"])
        L._transport = tags_transport(["llama3:8b"])
        whys["no_language"] = str(
            server.librarian_available(store_with())["why"])
        L._transport = canned_transport(status=None)
        whys["not_running"] = str(
            server.librarian_available(store_with())["why"])
        self.assertEqual(len(set(whys.values())), 3)
        self.assertIn("ollama serve", whys["not_running"])
        self.assertIn("ollama pull qwen2.5:7b", whys["no_language"])
        # the words come from FAILURE_SENTENCES, never a second vocabulary
        self.assertEqual(whys["not_running"],
                         server.FAILURE_SENTENCES["ollama_not_running"])
        self.assertEqual(whys["no_language"],
                         server.FAILURE_SENTENCES["model_not_pulled"])

    def test_a_missing_search_model_leaves_the_room_available(self):
        L._transport = tags_transport(["qwen2.5:7b"])   # no search model
        answer = server.librarian_available(store_with())
        self.assertIs(answer["available"], True)
        self.assertIsNone(answer["why"])
        # ...and it is still said out loud, with its own command, at start-up
        text = "\n".join(server.startup_librarian_check(
            server.resolve_librarian_routing(),
            probe=CountingProbe(NO_SEARCH)))
        self.assertIn("ollama pull nomic-embed-text:v1.5", text)

    # -- V6: what the room says when it cannot read photographs --------------
    #
    # ⚠ BOTH DIRECTIONS, BECAUSE ONE IS NOT EVIDENCE. A line that appears when
    # the toolchain is absent proves nothing on its own — an unconditional
    # line passes that case perfectly and then tells every user of a healthy
    # machine that their room is broken. The absence case is the one that can
    # only be satisfied by the guard actually being there.
    #
    # ⚠ ASSUMPTION A2 IS NOT DISCHARGED HERE EITHER. The genuinely-absent-CLT
    # state was never constructed on this machine (that means deleting the
    # owner's toolchain), so the absent branch is reached by replacing the
    # PROBE, not by removing the tools. What is proved is the report's
    # behaviour given each probe answer; what is not proved is that the probe
    # answers None on a machine with no tools. 26.94-02 owns that half.

    def clt_report(self, present):
        """The report text with the CLT probe pinned to one answer.

        The probe is the module global `startup_librarian_check` calls, so
        replacing it is the seam. Restored on cleanup, always — a leaked
        replacement would quietly decide every later case in this file."""
        saved = server._swiftc_path
        self.addCleanup(setattr, server, "_swiftc_path", saved)
        server._swiftc_path = (lambda: "/a/toolchain/swiftc") if present \
            else (lambda: None)
        routing = routing_with({"local": L.LOCAL_FILL,
                                "cheap-cloud": L.ANTHROPIC_FILLS["cheap-cloud"],
                                "good-cloud": L.ANTHROPIC_FILLS["good-cloud"]})
        first = server.startup_librarian_check(
            routing, probe=CountingProbe(WORKING))
        second = server.startup_librarian_check(
            routing, probe=CountingProbe(WORKING))
        # No clock and no randomness: the same routing must produce the same
        # report, or a suite pinning it by value is pinning a coin toss.
        self.assertEqual(first, second,
                         "two calls with the same routing produced different "
                         "reports — the start-up report must be pure")
        return first

    def test_clt_absent_names_the_missing_tools(self):
        lines = self.clt_report(present=False)
        # BY VALUE, both lines, whole — the words she reads are the artifact.
        self.assertIn(CLT_FACT_LINE, lines)
        self.assertIn(CLT_COMMAND_LINE, lines)
        # ...and in the shipped shape: the command is the line AFTER the fact,
        # never buried inside it.
        self.assertEqual(lines.index(CLT_COMMAND_LINE),
                         lines.index(CLT_FACT_LINE) + 1)
        # ...positioned after the three tier lines, before the closing lines.
        tier_last = max(i for i, line in enumerate(lines)
                        if "(the shipped default)" in line)
        self.assertGreater(lines.index(CLT_FACT_LINE), tier_last,
                           "the CLT line must come after the tier lines")
        self.assertGreater(len(lines), lines.index(CLT_COMMAND_LINE) + 1,
                           "the CLT block must sit BEFORE the report's "
                           "closing lines, not at the end of the report")
        # ...and it asks for nothing. The room does not want anything from her
        # here: no recommendation, no cost, no provider, no key.
        text = "\n".join(lines)
        for beggar in ("you should", "we recommend", "recommended",
                       "please ", "$", "upgrade"):
            self.assertNotIn(beggar, text.lower(),
                             "the start-up report asked her for something")
        # ...and the tier lines are untouched by any of it.
        self.assertIn("  your own machine:    ollama · qwen2.5:7b   "
                      "(the shipped default)", lines)

    def test_clt_present_says_nothing_about_photographs(self):
        lines = self.clt_report(present=True)
        text = "\n".join(lines)
        # ZERO occurrences, counted — not "not in", so a partial match cannot
        # be read as an absence.
        self.assertEqual(text.count(server._CLT_INSTALL_COMMAND), 0,
                         "the report tells her to install the Command Line "
                         "Tools on a machine that already has them — the "
                         "guard on the CLT block is gone")
        self.assertEqual(text.count(CLT_FACT_LINE), 0,
                         "the report says the Command Line Tools are not "
                         "there on a machine that has them")
        # ...and NO SUBSTITUTE stepped in. A line about photographs of any
        # wording at all is the failure this case exists for: the room is
        # silent about photo reading when the tools are there, and a calm zero
        # is the correct report (law 3).
        for word in ("photograph", "Command Line Tools", "Xcode",
                     "xcode-select"):
            self.assertEqual(text.count(word), 0,
                             "the report mentions '" + word + "' with the "
                             "toolchain present — it must say nothing at all "
                             "about photo reading")

    def test_a_room_with_only_her_own_machine_is_available(self):
        L._transport = tags_transport(["qwen2.5:7b", "nomic-embed-text:v1.5"])
        self.assertIs(L.key_present("anthropic"), False)
        self.assertIs(L.key_present("openai"), False)
        answer = server.librarian_available(store_with())
        self.assertIs(answer["available"], True)
        self.assertIsNone(answer["why"])

    # -- the shape, the flag, and failing open -------------------------------

    def test_the_shipped_shape_is_kept_and_no_binary_is_consulted(self):
        L._transport = tags_transport(["qwen2.5:7b"])
        answer = server.librarian_available(store_with())
        self.assertEqual(sorted(answer),
                         ["auth", "available", "enabled", "version_ok", "why"])
        src = inspect.getsource(server.librarian_available)
        for name in ("_librarian_probe", "detect_librarian_auth",
                     "_parse_claude_version"):
            self.assertTrue(name not in src,
                            "librarian_available still consults " + name)
        # ⚠ This case USED to also assert the replaced things were still
        # PRESENT — Plan 26.93-08 built the replacement one wave before Plan
        # 26.93-07 deleted the originals, and holding both true for that one
        # wave was the whole point of the ordering. Plan 07 has now landed and
        # deleted them, so that half is retired rather than failing: there is
        # nothing left to be present.
        #
        # The half that MATTERS survives above and is the reason this case
        # exists — `librarian_available` consults none of them. That claim was
        # true while they existed and is true now, which is exactly what makes
        # it worth asserting rather than the presence check, whose truth was
        # only ever a fact about the calendar.
        for name in ("_librarian_probe", "detect_librarian_auth",
                     "_parse_claude_version", "LIBRARIAN_MIN_VERSION"):
            self.assertFalse(hasattr(server, name),
                             name + " survived Plan 26.93-07's deletion")

    def test_the_flag_default_is_on_and_a_stored_choice_is_kept(self):
        L._transport = tags_transport(["qwen2.5:7b"])
        absent = server.librarian_available(store_with())
        self.assertIs(absent["enabled"], True)
        off = server.librarian_available(
            store_with({"librarian_enabled": False}))
        self.assertIs(off["enabled"], False)
        self.assertIs(off["available"], False)
        self.assertEqual(off["why"], server.LIBRARIAN_OFF_MSG)
        on = server.librarian_available(store_with({"librarian_enabled": True}))
        self.assertIs(on["available"], True)

    def test_the_front_door_fails_open(self):
        def exploding(request, timeout_s, auth=None):
            del request, timeout_s, auth
            raise ValueError("the local question went wrong")

        L._transport = exploding
        answer = server.librarian_available(store_with())
        self.assertIs(answer["available"], False)
        self.assertTrue(isinstance(answer["why"], str) and answer["why"])
        self.assertEqual(sorted(answer),
                         ["auth", "available", "enabled", "version_ok", "why"])
        # ...and the room still opens: the start-up line is inside a guard, and
        # it runs BEFORE the room serves.
        src = inspect.getsource(server.main)
        self.assertIn("startup_librarian_check", src)
        self.assertLess(src.find("startup_librarian_check"),
                        src.find("serve_forever"))
        self.assertIn("except Exception", src)

    def test_the_real_config_directory_is_never_touched(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite changed whether the real config "
                         "directory exists")


# ---------------------------------------------------------------------------
# ---- the mutation drill ---------------------------------------------------

def measure(tmp_home):
    """The real, unmutated measurement, taken inside `tmp_home`.

    Returns everything the checker judges, plus a list of driver mismatches —
    a driver that produced the wrong token would make a green run meaningless,
    so it is reported rather than absorbed."""
    saved = swap_home(tmp_home)
    mismatches = []
    try:
        L.ensure_files()

        # 1 — the start-up lines, with a key planted and a recorder that would
        #     notice any connection at all.
        L.save_key("anthropic", PLANTED)
        recorder = Recorder()
        L._transport = recorder
        routing = server.resolve_librarian_routing()
        lines = server.startup_librarian_check(routing,
                                               probe=CountingProbe(WORKING))
        cloud_calls = recorder.cloud_calls

        # 2 — the availability answer, with everything healthy.
        L._transport = tags_transport(["qwen2.5:7b", "nomic-embed-text:v1.5"])
        answer = server.librarian_available(store_with())

        # 3 — her own machine's three states, as three answers. The key is
        #     removed first so the local rung is what decides.
        whys = {}
        L.remove_key("anthropic")
        for name, tags in (("local_working", ["qwen2.5:7b"]),
                           ("local_no_language", ["llama3:8b"]),
                           ("local_not_running", None)):
            L._transport = (canned_transport(status=None) if tags is None
                            else tags_transport(tags))
            whys[name] = str(server.librarian_available(store_with())["why"])
        L._transport = tags_transport(["qwen2.5:7b"])
        search_available = server.librarian_available(store_with())["available"]

        # 4 — the five tokens, driven through the SHIPPED seam, and what each
        #     one did to the room's belief about the key.
        beliefs = {}
        for token in sorted(DRIVERS):
            L.save_key("anthropic", PLANTED)   # a fresh key has no history
            L._transport = canned_transport(status=DRIVERS[token])
            result = L.call_librarian(GATE_JOB, "x", anthropic_routing())
            if result["failure"] != token:
                mismatches.append("the driver for " + token + " produced "
                                  + repr(result["failure"]))
            history = L.load_keys().get("anthropic") or {}
            beliefs[token] = history.get("rejected_ms") is not None
            whys[token] = str(server.librarian_available(store_with())["why"])
    finally:
        restore_home(saved)
    return (lines, answer, whys, beliefs, cloud_calls, search_available,
            mismatches)


def run_drill():
    """Feed the checker copies with ONE thing wrong each.

    THE SIX MUTATIONS ARE THE SIX THINGS THIS PLAN WOULD ACTUALLY LOSE. Every
    mutation is counted, the unmutated controls are counted separately, the
    loop never exits early on a catch, and all three totals are asserted BY
    VALUE against the literals at the top of this file — because a harness that
    stopped at its first catch once reported one failure where there were
    four."""
    tmp_home = tempfile.mkdtemp(prefix="study-room-frontdoor-drill-")
    try:
        (lines, answer, whys, beliefs, cloud_calls, search_available,
         mismatches) = measure(tmp_home)
    finally:
        shutil.rmtree(tmp_home, ignore_errors=True)

    for line in mismatches:
        print("  DRILL DRIVER WRONG: " + line)

    controls = 0
    # Control 1 — the REAL measurement, judged clean.
    if front_door_violations(lines, answer, PLANTED, whys, beliefs,
                             cloud_calls, search_available) == [] \
            and not mismatches:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real measurement")
    # Control 2 — an independently fabricated clean copy. Two controls that
    # were the same call twice would only prove the call is deterministic.
    clean_whys = {"bad_key": "anthropic turned down the key it was given. "
                             "run python3 server.py --setup to put a fresh "
                             "one in.",
                  "local_working": "None",
                  "local_no_language": "get it by running: ollama pull",
                  "local_not_running": "start it by running: ollama serve"}
    for token in NEVER_A_KEY:
        clean_whys[token] = "None"
    clean_beliefs = dict((token, token == "bad_key") for token in DRIVERS)
    if front_door_violations(["  your own machine:   ollama · qwen2.5:7b"],
                             {"available": True, "why": None}, PLANTED,
                             clean_whys, clean_beliefs, 0, True) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the fabricated clean copy")

    collapsed = dict(whys)
    collapsed["local_no_language"] = collapsed.get("local_not_running", "")
    mutations = [
        # 1 — a busy server recorded as a rejected key. The mutation that does
        # not merely tell her something untrue: it sends her to find, delete
        # and re-paste a key that was working.
        ("rate_limited moves the room's belief about the key",
         lines, answer, whys, dict(beliefs, rate_limited=True), cloud_calls,
         search_available),
        # 2 — and the same loss one layer later, in the words rather than in
        # the belief: a busy server's sentence talking about her key.
        ("a busy server's answer mentions a key",
         lines, answer, dict(whys, rate_limited=whys.get("bad_key", "")),
         beliefs, cloud_calls, search_available),
        # 3 — the missing SEARCH model reported as "no librarian", which takes
        # four working features away from her over a fifth.
        ("the missing search model reports unavailable",
         lines, answer, whys, beliefs, cloud_calls, False),
        # 4 — two of her machine's three states collapsed into one sentence,
        # which sends her to the wrong `ollama` command.
        ("two of the three local states collapse into one",
         lines, answer, collapsed, beliefs, cloud_calls, search_available),
        # 5 — the credential on the start-up line, which is the one surface
        # somebody screenshots.
        ("the start-up line carries the credential",
         list(lines) + ["key=" + PLANTED], answer, whys, beliefs, cloud_calls,
         search_available),
        # 6 — a paid check at the front door, on every single room open.
        ("the start-up check opens a cloud connection",
         lines, answer, whys, beliefs, 1, search_available),
    ]

    caught = 0
    for name, m_lines, m_answer, m_whys, m_beliefs, m_calls, m_search in \
            mutations:
        if front_door_violations(m_lines, m_answer, PLANTED, m_whys,
                                 m_beliefs, m_calls, m_search):
            caught += 1
        else:
            # Do NOT exit early — a harness that stopped at its first catch
            # once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")

    return caught, len(mutations), controls


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(FrontDoorCase)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    caught, total, controls = run_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d controls green"
          % (caught, total, controls))

    # ⚠ THE LAST WORD: the real config directory is exactly as this suite found
    # it. It now holds a real credential, and only `--setup`, run by the owner,
    # may create or change it.
    untouched = os.path.exists(REAL_ROOM_DIR) == REAL_ROOM_DIR_EXISTED
    if not untouched:
        print("REAL CONFIG DIRECTORY CHANGED — this suite must never do that")

    ok = (result.wasSuccessful()
          and ran == EXPECTED_CASES
          and caught == total == EXPECTED_MUTATIONS
          and controls == EXPECTED_CONTROLS
          and untouched)
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    if not ok:
        return 1
    print("test_startup_check OK (who is answering before any call, only a "
          "401/403 moves the key belief, three local states stay three)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
