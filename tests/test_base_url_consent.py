#!/usr/bin/env python3
"""tests/test_base_url_consent.py — the shell's address, and the record of
agreeing to it (26.99-08, D-09/D-11/D-15/D-16/D-19).

Standalone one-shot script in the house convention: no runner, no package.json,
nothing installed (law 8). Exits 0/1 on BARE invocation, so it sits inside the
`tests/test_*.py` glob the counting sweep uses. It parses no command-line
options at all — a suite that expects flags exits 2 when the sweep runs it with
none.

WHAT THIS SUITE IS FOR. 26.99-08 makes `ANTHROPIC_BASE_URL` work again and
builds the record of having agreed to it. ⛔ THE READ IS THE UNSAFE SUBSET BY
ITSELF: a base URL from the shell is a bearer credential going to a host
somebody typed, and the only thing that makes it safe is being asked first.
26.99-09 builds the asking. So this file is written in two halves — this half
pins the READ and the RECORD; 26.99-09 extends it with the boundary assertion
that proves no call reaches a non-default address before consent. ⚠ A reader
who finds this suite green and stops here has read half a safety property.

THE FOUR CLAIMS THIS HALF PINS, and why each one is here:

  1. A ROOM WITH NO OVERRIDE DOES NOT CHANGE. The provenance map's key set is
     asserted to be EXACTLY the three tiers — so a base entry that appeared on
     a room that set nothing would fail here, which is the only version of
     "byte-identical" that a suite living in the same process as the change
     can honestly assert.

  2. THE RECORD HOLDS THE VALUE, NEVER A BOOLEAN (L-03). This is the single
     load-bearing line in the plan: `consented: true` recorded for `localhost`
     would ride a later repoint at somebody's cloud proxy and the key would go
     with it — verbatim the hole this phase was taken to close. So the case
     that would PASS with a boolean is written and then MADE TO FAIL: a
     planted `true` in the file must not satisfy any address (see
     `run_drill`, mutation 1).

  3. THE COMPARISON IS AGAINST THE NORMALISED VALUE. `resolve_routing`
     normalises with `.strip().rstrip("/")`, so a record that did not would
     re-ask on a trailing slash and train her to click through the prompt.
     Removing the normalisation from the writer is mutation 2.

  4. THE DECLINE IS PER-VISIT (D-15). A fresh visit finds no consent for the
     address and asks again, exactly as it did the first time. A permanent
     decline is refused as a design — it is a wider promise than she made and
     a one-way trap. The case proves BOTH halves in one run: within a visit the
     state stays `declined` (no second ask), and across a visit it returns to
     `unasked` (the ask returns). One without the other proves only "always
     asks" or only "never asks again".

⚠⚠ THIS SUITE NEVER TOUCHES THE REAL CONFIG DIRECTORY. Every path it exercises
is under a temp root it created, and `assert_under_temp_root` says so BEFORE
anything is written. A case below compares the real directory's existence
against what it was at import, and `main()` checks it again after everything
has run.

⛔ NO KEY VALUE IS READ, WRITTEN OR PRINTED ANYWHERE IN THIS FILE. It never
opens the keys file, never sets a credential environment name, and the only
values it writes are base ADDRESSES. `save_settings`' own rule — *nothing
secret may be put in here* — is what the consent record inherits, and a suite
that planted a credential to prove a point would be the first thing to break
it.

⛔ NOTHING HERE SPAWNS `--setup`, and nothing here starts a server. The
two-process hazard is driven by hand: two independent load -> modify -> write
sequences interleaved in one process, which is the only way to place the two
writes in a known order. A real second process would make the drill a race.

===========================================================================
THE SECOND HALF — 26.99-09, THE BOUNDARY ASSERTION (D-10, read wide per D-19)
===========================================================================

26.99-08 shipped the read and the record and gated NOTHING. This half is the
gate, and it is written as one assertion at ONE PLACE: `librarian_call
._transport` is the single function in this app that opens a connection, and
both calls that could reach an unagreed address — `--setup`'s `check_key` and
the START-UP OLLAMA PROBE EVERY ROOM OPEN MAKES — route through `_send` into
it rather than opening their own. So a fake transport that RECORDS EVERY
REQUEST URL IT IS HANDED can answer the whole question at once.

  * WITH A NON-DEFAULT ADDRESS AND NO CONSENT: the recorded list is EMPTY,
    and it is asserted as a LIST rather than a length, so a failure prints
    the address that got through.
  * WITH CONSENT RECORDED: the same drives produce the SAME THREE requests,
    asserted by value against the consented address. ⚠ THIS POSITIVE CONTROL
    IS NOT OPTIONAL — a zero-request assertion with no witnessed non-zero
    counterpart passes when the code path never ran at all, which is B-3
    exactly. Drill mutation 4 witnesses it a second time, on the UNGATED
    call, so the instrument is proved able to SEE a violation.
  * WITH NO OVERRIDE SET: the request count is captured in the SAME RUN as
    the gated cases and is unchanged — the room a stranger opens takes a
    byte-identical path, and law 6 holds because the prompt can only ever
    appear to somebody who set the address themselves.

⚠ THE FAKE TRANSPORT ANSWERS 503, DELIBERATELY. A 200 would make `_send`
call `_note_key_accepted`, which WRITES THE KEYS FILE — and this suite's
promise one paragraph up is that it never opens it. 503 classifies as
`provider_down`, which touches no key history at all, and `KEY_CHECK_ROW`
carries `retries: 0` so exactly one request is made per drive.
"""

import builtins
import contextlib
import inspect
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, __file__.rsplit("/", 2)[0])

import librarian_call as L          # noqa: E402
import study_lib                    # noqa: E402
import server                       # noqa: E402  (its import binds literals)


# The counts this file asserts BY VALUE. A harness that aborts early then fails
# loudly instead of reporting a smaller success.
#
# ⚠ 29 -> 37 by 26.99-12 (G-1, G-2): four terminal-ordering cases and four on
# the Manage panel's render. ⛔ Raised in the SUITE'S OWN COMMIT, while the
# suite was RED, which is the only order in which "the total was not raised to
# clear a red" is checkable from the history (B-4).
EXPECTED_CASES = 37
EXPECTED_MUTATIONS = 4
EXPECTED_CONTROLS = 3

# ⚠ CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)

# The addresses this suite points the room at. ⚠ NEITHER IS EVER CONTACTED —
# every case calls `resolve_routing` and the consent readers, none of which
# open a socket. `.invalid` is the reserved TLD (RFC 2606) precisely so a
# lookup cannot succeed even by accident.
PROXY = "https://proxy.study-room-test.invalid"
OTHER = "https://other.study-room-test.invalid"

# ⚠ ONE ADDRESS SERVING BOTH PROVIDERS, AND THAT IS THE REALISTIC SHAPE RATHER
# THAN A CONVENIENCE. LiteLLM commonly sits on one host and speaks for
# everything behind it, which is also why D-08 refuses to read a loopback
# address as locality. It also matters mechanically here: the consent record
# holds ONE address (26.99-08's L-03), so one proxy is one answer — and the
# case that pins what happens when TWO DIFFERENT addresses are redirected is
# written out separately rather than left to be discovered.
PROXY_TWO = "https://second.study-room-test.invalid"

# How many requests a room takes on the drives below. Stated here rather than
# inline so the no-override baseline and the consented run are compared against
# the SAME number, in the same run.
DRIVE_REQUEST_COUNT = 3

# Every URL any case handed to the boundary, so the run can state BY VALUE how
# many requests it watched. ⚠ A SUITE THAT WATCHED ZERO REQUESTS PROVES
# NOTHING ABOUT A GATE (B-3) — `main` refuses to report success on an empty
# list, and refuses again if any of them reached an address nobody agreed to.
CAPTURED = []

# A value the scheme gate must refuse. Fail-closed: a base URL is a URL, and
# `ftp` is a scheme the transport could never speak.
REFUSED_SCHEME = "ftp://proxy.study-room-test.invalid"
REFUSED_SHAPE = "proxy.study-room-test.invalid"      # no scheme at all


def _has(*names):
    """Whether the module carries every symbol named — so the drill can report
    the absence once instead of erroring three times while this suite is RED."""
    return all(hasattr(L, name) for name in names)


# ---------------------------------------------------------------------------
# ---- 26.99-12 (G-2): reading app.js as CODE, and one function of it -------
#
# ⚠ B-2: A STATIC GREP FIRES ON ITS OWN PROSE, and this file is now one of the
# places that prose lives — the paragraphs above and the comments below spell
# `base_consent_ask` and `escapeHtml(ask)` in as many words. So every scan
# below runs over COMMENT-STRIPPED source, and it is delimited by BRACE
# MATCHING from the function's own signature rather than by a line range: the
# render this plan moves sits inside one function, the file is a hundred
# thousand lines long, and a line range would silently start measuring its
# neighbours the first time anything above it grew.
#
# ⛔ STRING LITERALS ARE LEFT ALONE ON PURPOSE — the same choice
# tests/test_forecast.py makes and for the same reason: the markup this plan
# reorders IS a string, so blanking strings would blank the very thing under
# test.

def strip_js_comments(src):
    """`src` with `//` and `/* */` comments blanked, line count preserved."""
    out = []
    i = 0
    n = len(src)
    while i < n:
        two = src[i:i + 2]
        if two == "/*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(c if c == "\n" else " " for c in src[i:j]))
            i = j
        elif two == "//":
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        else:
            out.append(src[i])
            i += 1
    return "".join(out)


def js_function_body(src, name):
    """One JS function's text, delimited by BRACE MATCHING from its signature.

    Returns "" when the function is not there at all, so the caller's own
    assertion can say *which* function went missing rather than the run dying
    on a slice of None. ⚠ A zero-length body is itself a failure the cases
    below check for BY VALUE — an offset comparison inside an empty string is
    vacuously true, which is B-3 wearing this plan's clothes."""
    start = src.find("function " + name + "(")
    if start == -1:
        return ""
    brace = src.find("{", start)
    if brace == -1:
        return ""
    depth = 0
    for i in range(brace, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
    return ""


def render_base_consent_body():
    """`renderBaseConsent`'s body, comments blanked, read off disk."""
    root = __file__.rsplit("/", 2)[0]
    with open(os.path.join(root, "app.js"), encoding="utf-8") as fh:
        return js_function_body(strip_js_comments(fh.read()),
                                "renderBaseConsent")


class BaseConsentCase(unittest.TestCase):

    def setUp(self):
        # ⚠ THE TEMP ROOT COMES FIRST, AND NOTHING IS WRITTEN BEFORE THE
        # ASSERTION BELOW. Pointing the home directory at a fresh temp tree is
        # the whole of the isolation: every path in this module is derived from
        # the home directory on every call.
        self.tmp_home = tempfile.mkdtemp(prefix="study-room-base-consent-")
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = self.tmp_home
        # ⛔ Both credential names are popped even though nothing here reads
        # one: a case that resolved a cloud fill because the real shell had a
        # key in it would be reporting the machine, not the code.
        self._saved_env = {}
        for name in list(L.KEY_ENV_NAMES.values()):
            self._saved_env[name] = os.environ.pop(name, None)
        self.addCleanup(self._restore)
        self.assert_under_temp_root()
        self.fresh_visit()

    def _restore(self):
        for name, value in self._saved_env.items():
            if value is not None:
                os.environ[name] = value
            else:
                os.environ.pop(name, None)
        if self._saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._saved_home
        shutil.rmtree(self.tmp_home, ignore_errors=True)

    def assert_under_temp_root(self):
        """Every path this case can write to is inside the tree it made.

        Called BEFORE anything is written. `realpath` on both sides because the
        system temp location is itself a symlink on macOS."""
        root = os.path.realpath(self.tmp_home)
        for path in (study_lib.room_config_dir(), L.settings_path()):
            here = os.path.realpath(str(path))
            self.assertTrue(
                here == root or here.startswith(root + os.sep),
                "a path this suite is about to write is not under its own "
                "temp root")
        self.assertNotEqual(os.path.realpath(str(study_lib.room_config_dir())),
                            os.path.realpath(REAL_ROOM_DIR))

    # -- the two shapes every case uses --------------------------------------

    def fresh_visit(self):
        """What a NEW PROCESS would find: nothing carried over in memory.

        ⚠ THIS IS THE WHOLE OF D-15's PER-VISIT LIFETIME, made testable. The
        decline lives in memory and a fresh process starts without it; the
        settings file is untouched by this call, so whatever is on disk is
        exactly what the next visit reads."""
        getattr(L, "_DECLINED_THIS_VISIT", set()).clear()

    def write_settings(self, settings):
        L.save_settings(settings)

    def raw_settings(self):
        return json.loads(L.settings_path().read_text(encoding="utf-8"))

    # -- the boundary, and the three drives that pass through it (26.99-09) --

    def capture_requests(self):
        """Replace the ONE function that opens a connection with a recorder.

        ⚠ THE ASSERTION LIVES AT THE BOUNDARY, NOT AT THE CALLERS, and that is
        the whole design: `check_key` and `probe_ollama` both route through
        `_send` into `_transport` rather than opening their own connection, so
        one fake answers for both — and for anything a later plan adds that
        also goes through the seam. A per-caller assertion would have to be
        re-written every time a caller appeared, which is how a gate quietly
        stops covering the thing it was built for.

        Answers 503 (see this module's docstring): a 200 would write the keys
        file through `_note_key_accepted`, and this suite never opens it."""
        seen = []

        def fake(request, timeout_s, auth=None):
            seen.append(request.get("url"))
            return 503, {}, b""

        saved = L._transport
        L._transport = fake
        self.addCleanup(lambda: setattr(L, "_transport", saved))
        self.addCleanup(lambda: CAPTURED.extend(seen))
        return seen

    def redirect_everything(self, address):
        """Point every address the room can reach at ONE host, on disk and in
        the returned routing object.

        On disk because `librarian_available` resolves the routing itself from
        her settings file; in the object because the two terminal-side drives
        are handed one. Both readings must agree, or the case would be
        measuring the fixture.

        ⛔⛔ LOAD -> MODIFY -> WRITE, AND THAT IS NOT TIDINESS. Writing a bare
        `{"bases": ...}` REPLACES the file, which silently deletes the consent
        record — so the re-ask case would have gone green because the record
        was erased rather than because the address moved. ⚠ A fixture that
        quietly removes the thing under test pins the defect as correct, which
        is the failure this project has now recorded five times, and this is
        the sixth place it tried to happen. Her real file behaves this way
        too: `--setup` edits it, it does not rewrite it."""
        settings = L.load_settings()
        settings["bases"] = {"anthropic": address, "openai": address,
                             "ollama": address}
        self.write_settings(settings)
        return settings

    def redirect_bases(self, mapping):
        """Point NAMED providers at NAMED addresses, load -> modify -> write.

        `redirect_everything` above sends all three to one host; this one is
        for the cases that need a KNOWN NUMBER of overrides — one address, or
        two different ones — because `base_overrides` returns one entry per
        provider and the terminal asks once per entry.

        ⛔ Same load -> modify -> write discipline, and for the same reason: a
        bare write REPLACES the file and would silently delete the consent
        record, so the already-agreed case below would go green because the
        record was erased rather than because the loop skipped it."""
        settings = L.load_settings()
        settings["bases"] = dict(mapping)
        self.write_settings(settings)
        return settings

    def run_setup_capture(self, answers=()):
        """Drive `server.run_setup()` and return everything it printed.

        ⚠ THE REAL FUNCTION, NOT A RE-IMPLEMENTATION OF ITS ORDERING. A case
        that rebuilt the print order out of the constants would pass while the
        shipped `--setup` printed them the other way round — the mirror this
        project has now recorded several times. So stdout is captured and the
        ORDER IS READ OUT OF THE BYTES.

        ⛔ NOTHING REACHES A HOST. `run_setup` probes Ollama near its end;
        `capture_requests` has already put the recorder in `_transport`'s
        place, which is the ONE function in this app that opens a connection.

        ⛔ NO KEY IS TYPED, READ OR PRINTED. The canned answers feed the
        `yes / no:` consent prompt only; the key loop's `choice:` prompt runs
        out of answers, raises EOFError exactly as a closed terminal would, and
        takes the `left exactly as it is` branch. `getpass` is never reached.

        ⚠ The base-address environment names are popped for the duration:
        `setUp` pops the two credential names, and a shell that happened to
        carry a base override would otherwise make the law-6 control below
        measure the machine instead of the code."""
        queue = list(answers)

        def fake_input(prompt=""):
            # ⚠ THE PROMPT IS ECHOED, because the real `input()` writes it to
            # stdout and this suite is asserting what she READS. A fake that
            # swallowed the prompt would hide `yes / no:` from the captured
            # text, and the ordering case would then be comparing the warning
            # against a question with no visible answer line — measuring less
            # than the surface it claims to measure.
            sys.stdout.write(prompt)
            if queue:
                return queue.pop(0)
            raise EOFError

        saved_input = builtins.input
        saved_env = {}
        for name in L.BASE_ENV_NAMES.values():
            saved_env[name] = os.environ.pop(name, None)
        builtins.input = fake_input
        self.capture_requests()
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                server.run_setup()
        finally:
            builtins.input = saved_input
            for name, value in saved_env.items():
                if value is not None:
                    os.environ[name] = value
        return buf.getvalue()

    def drive_every_call_path(self, settings):
        """Everything that reaches the network before she has answered.

        THREE drives, and each one is a real thing that happens:
          1. `startup_librarian_check` — the probe EVERY ROOM OPEN makes. ⚠ The
             one nobody had named until D-19 read D-10 wide.
          2. `setup_check_key` — `--setup`'s key check, the first call that
             would carry a credential to a redirected address (D-10).
          3. `librarian_available` — a room open, which probes again.

        ⛔ `--setup` ITSELF IS NEVER SPAWNED. It is interactive and it would
        touch her real config directory; the functions it calls are driven
        instead, against the isolated home."""
        routing = L.resolve_routing(settings, environ={})
        server.startup_librarian_check(routing)
        server.setup_check_key("anthropic", routing)
        server.librarian_available({"meta": {}})
        return routing

    # -- (1) a room with no override does not change -------------------------

    def test_with_no_override_nothing_new_appears_on_the_resolved_answer(self):
        routing = L.resolve_routing({}, environ={})
        # ⚠ THE LOAD-BEARING ASSERTION IS THE KEY SET, not the values. The
        # values are read from the same constants the code reads, so asserting
        # them proves little (B-5); asserting that NO KEY BEYOND THE THREE
        # TIERS appeared is a fact about this change and could not have been
        # true by accident before it.
        self.assertEqual(set(routing.provenance), set(L.TIERS),
                         "a room that set no override gained a provenance "
                         "entry it did not have")
        self.assertEqual(dict(routing.bases), dict(L.DEFAULT_BASES))
        self.assertEqual(dict(routing.timeouts), dict(L.DEFAULT_TIMEOUTS))
        for tier in L.TIERS:
            self.assertEqual(routing.provenance[tier], L.SOURCE_DEFAULT)

    def test_with_no_override_no_consent_is_needed_anywhere(self):
        for provider, base in L.DEFAULT_BASES.items():
            self.assertFalse(
                L.base_needs_consent(base, provider),
                "a SHIPPED address is asking for consent — the prompt can "
                "only ever appear to somebody who set the address themselves "
                "(law 6)")

    # -- (2) the shell's address, with provenance ---------------------------

    def test_an_accepted_shell_base_lands_normalised_and_says_where_it_came_from(self):
        env = {L.BASE_ENV_NAMES["anthropic"]: "  " + PROXY + "/  "}
        routing = L.resolve_routing({}, environ=env)
        self.assertEqual(routing.bases["anthropic"], PROXY,
                         "the shell's address did not arrive normalised — a "
                         "record made against the un-normalised spelling "
                         "re-asks on a trailing slash")
        self.assertEqual(
            routing.provenance[L.base_provenance_key("anthropic")],
            L.SOURCE_ENV,
            "the shell's answer is invisible — fail-closed is correct, "
            "invisible is not")

    def test_a_refused_shell_base_falls_to_the_shipped_default_and_says_so(self):
        # ⛔ HER STORED PICK IS PRESENT, and the refusal must NOT land on it.
        settings = {"bases": {"anthropic": OTHER}}
        for bad in (REFUSED_SCHEME, REFUSED_SHAPE, "   "):
            env = {L.BASE_ENV_NAMES["anthropic"]: bad}
            routing = L.resolve_routing(settings, environ=env)
            self.assertEqual(
                routing.bases["anthropic"], L.DEFAULT_BASES["anthropic"],
                "a refused shell address fell to her stored pick instead of "
                "the shipped default")
            self.assertEqual(
                routing.provenance[L.base_provenance_key("anthropic")],
                L.SOURCE_ENV_REJECTED,
                "a present-but-refused override is a fact about the shell, "
                "not permission to pretend the shell said nothing")

    def test_a_legal_shell_base_wins_over_her_stored_pick(self):
        settings = {"bases": {"anthropic": OTHER}}
        env = {L.BASE_ENV_NAMES["anthropic"]: PROXY}
        routing = L.resolve_routing(settings, environ=env)
        self.assertEqual(routing.bases["anthropic"], PROXY)
        self.assertEqual(
            routing.provenance[L.base_provenance_key("anthropic")],
            L.SOURCE_ENV)

    def test_her_stored_base_carries_its_own_provenance(self):
        # ⚠ D-19: this loop is the PRE-EXISTING D-10 violation — it already
        # accepted an override for all three providers and nothing said so.
        # Naming where the address came from is what lets 26.99-09 gate it.
        settings = {"bases": {"anthropic": OTHER + "/"}}
        routing = L.resolve_routing(settings, environ={})
        self.assertEqual(routing.bases["anthropic"], OTHER)
        self.assertEqual(
            routing.provenance[L.base_provenance_key("anthropic")],
            L.SOURCE_STORED)

    # -- (3) the record holds a VALUE ---------------------------------------

    def test_the_record_stores_the_address_and_not_the_fact_of_consenting(self):
        L.record_base_consent(PROXY, L.CONSENT_YES)
        stored = self.raw_settings()[L.SETTINGS_CONSENT_KEY]
        # ⛔ THE ASSERTION IS ON THE TYPE FIRST. A boolean here is the hole
        # #12 was taken to prevent, and it would pass every equality test
        # below by being falsy in the right places.
        self.assertIsInstance(
            stored, str,
            "the consent record is not a string — a boolean cannot express "
            "consented to WHAT, and consent given for one address would ride "
            "a later repoint at another (L-03)")
        self.assertEqual(stored, PROXY)
        self.assertEqual(L.consented_base(L.load_settings()), PROXY)

    def test_consent_for_one_address_does_not_satisfy_another(self):
        L.record_base_consent(PROXY, L.CONSENT_YES)
        self.assertFalse(L.base_needs_consent(PROXY, "anthropic"))
        self.assertTrue(
            L.base_needs_consent(OTHER, "anthropic"),
            "a record made for one address satisfied a different one — this "
            "is the repoint the whole record exists to catch")

    def test_a_trailing_slash_does_not_cause_a_re_ask(self):
        L.record_base_consent(PROXY + "/", L.CONSENT_YES)
        self.assertFalse(
            L.base_needs_consent(PROXY, "anthropic"),
            "consent recorded with a trailing slash did not satisfy the same "
            "address without one — the re-ask that trains her to click "
            "through the prompt")
        self.assertEqual(L.consented_base(L.load_settings()), PROXY)

    def test_a_hand_edited_record_of_the_wrong_shape_fails_closed(self):
        # Her file, hers to edit. A typo costs her the setting it names —
        # never the room, and never a silent yes.
        for planted in (True, 1, {"consented": True}, ["yes"], ""):
            self.write_settings({L.SETTINGS_CONSENT_KEY: planted})
            self.assertIsNone(L.consented_base(L.load_settings()))
            self.assertTrue(
                L.base_needs_consent(PROXY, "anthropic"),
                "an off-shape record was read as a yes")

    # -- (4) three states, and the decline's lifetime ------------------------

    def test_the_record_distinguishes_three_states_not_two(self):
        self.assertEqual(L.base_consent_state(PROXY),
                         L.CONSENT_STATE_UNASKED)
        L.record_base_consent(PROXY, L.CONSENT_NO)
        self.assertEqual(L.base_consent_state(PROXY),
                         L.CONSENT_STATE_DECLINED)
        L.record_base_consent(PROXY, L.CONSENT_YES)
        self.assertEqual(L.base_consent_state(PROXY),
                         L.CONSENT_STATE_CONSENTED)

    def test_the_decline_is_per_visit_and_a_fresh_visit_asks_again(self):
        L.record_base_consent(PROXY, L.CONSENT_NO)
        # CONTROL, in the same run: WITHIN the visit the ask does not return.
        # Without this the case would prove only "always asks".
        self.assertEqual(
            L.base_consent_state(PROXY), L.CONSENT_STATE_DECLINED,
            "the decline did not suppress a second ask inside the same "
            "visit — she would be asked twice for one answer")
        # ...and the librarian is OFF for that visit either way, because the
        # OFF is derived from the ABSENCE of consent.
        self.assertTrue(L.base_needs_consent(PROXY, "anthropic"))

        self.fresh_visit()
        self.assertEqual(
            L.base_consent_state(PROXY), L.CONSENT_STATE_UNASKED,
            "a fresh visit inherited the decline as a settled answer — a "
            "permanent decline is a one-way trap she never agreed to")
        self.assertTrue(L.base_needs_consent(PROXY, "anthropic"))

    def test_a_decline_never_becomes_a_permanent_refusal(self):
        L.record_base_consent(PROXY, L.CONSENT_NO)
        self.fresh_visit()
        # ⛔ NO HAND EDIT OF THE SETTINGS FILE AT ANY POINT. If reaching the
        # consented state needed one, the decline would be the trap D-15
        # refuses.
        L.record_base_consent(PROXY, L.CONSENT_YES)
        self.assertEqual(L.base_consent_state(PROXY),
                         L.CONSENT_STATE_CONSENTED)
        self.assertFalse(L.base_needs_consent(PROXY, "anthropic"))

    def test_a_decline_removes_a_consent_that_was_already_on_disk(self):
        L.record_base_consent(PROXY, L.CONSENT_YES)
        L.record_base_consent(PROXY, L.CONSENT_NO)
        self.assertNotIn(
            L.SETTINGS_CONSENT_KEY, self.raw_settings(),
            "declining left the earlier yes on disk — the next visit would "
            "read it and never ask")

    # -- (5) compared, not remembered ---------------------------------------

    def test_every_surface_gets_the_same_answer_because_it_is_a_comparison(self):
        # The terminal writes; the room reads. Both go through the file, and
        # neither holds a copy — which is what makes the re-ask work ACROSS
        # the two surfaces rather than within each (D-11).
        terminal_wrote = L.record_base_consent(PROXY, L.CONSENT_YES)
        self.assertEqual(terminal_wrote, L.CONSENT_STATE_CONSENTED)
        room_reads = L.base_needs_consent(PROXY, "anthropic")
        self.assertFalse(room_reads)
        # the address moves under both of them
        self.assertTrue(L.base_needs_consent(OTHER, "anthropic"))
        self.assertEqual(L.base_consent_state(OTHER),
                         L.CONSENT_STATE_UNASKED)

    def test_the_reader_re_reads_at_the_moment_it_is_asked(self):
        # ⚠ THE RESOLVE-TIME DISCIPLINE, ON A READ. A value resolved once when
        # the process started can never see what the other surface wrote
        # afterwards — which is the whole of D-11's cross-surface re-ask.
        self.assertTrue(L.base_needs_consent(PROXY, "anthropic"))
        # a write that this process did not make
        self.write_settings({L.SETTINGS_CONSENT_KEY: PROXY})
        self.assertFalse(
            L.base_needs_consent(PROXY, "anthropic"),
            "the reader answered from something it cached at start-up")

    def test_the_consent_record_holds_an_address_and_never_a_credential(self):
        L.record_base_consent(PROXY, L.CONSENT_YES)
        raw = L.settings_path().read_text(encoding="utf-8")
        # Every value in the file is one this suite put there, and every one
        # of them is an address. `save_settings`' own rule, restated as a
        # measurement rather than a promise.
        for name in L.KEY_ENV_NAMES.values():
            self.assertNotIn(name, raw)
        self.assertEqual(set(json.loads(raw)), {L.SETTINGS_CONSENT_KEY})

    def test_the_real_config_directory_is_exactly_as_this_suite_found_it(self):
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite touched the real config directory — only "
                         "--setup, run by the owner, may create it")

    # -- (6) 26.99-09: NO CALL OF ANY KIND, BEFORE CONSENT (D-10, D-19) -----

    def test_no_request_reaches_a_non_default_address_before_consent(self):
        settings = self.redirect_everything(PROXY)
        seen = self.capture_requests()
        self.drive_every_call_path(settings)
        # ⛔ ASSERTED AS A LIST, NEVER AS A LENGTH. A length prints "1 != 0"
        # and tells nobody where the room went; the list prints the address.
        self.assertEqual(
            seen, [],
            "a call reached an address nobody agreed to — D-10 says NO CALL "
            "OF ANY KIND, and this is the terminal's key check and the "
            "start-up probe together")

    def test_with_consent_recorded_the_same_paths_reach_the_consented_address(self):
        # ⚠ THE POSITIVE CONTROL, IN THE SAME RUN AS THE ZERO ABOVE. Without
        # it, "zero requests" is equally satisfied by a code path that never
        # ran, which is the failure this project records as B-3.
        settings = self.redirect_everything(PROXY)
        L.record_base_consent(PROXY, L.CONSENT_YES)
        seen = self.capture_requests()
        self.drive_every_call_path(settings)
        self.assertEqual(
            seen,
            [PROXY + "/api/tags",          # the start-up probe
             PROXY + "/v1/messages",       # --setup's key check
             PROXY + "/api/tags"],         # a room open probes again
            "the agreed address is not being used, or is being used a "
            "different number of times than before the gate landed")

    def test_the_start_up_check_still_answers_with_its_probe_gated(self):
        # ⛔ THE GATE SITS ON THE PATH EVERY USER HITS, so it may not raise and
        # may not stop the room opening. It answers lines either way.
        settings = self.redirect_everything(PROXY)
        seen = self.capture_requests()
        routing = L.resolve_routing(settings, environ={})
        lines = server.startup_librarian_check(routing)
        self.assertEqual(seen, [],
                         "the start-up probe went to an unagreed address")
        self.assertTrue(lines and lines[0] == "The librarian",
                        "the start-up report stopped answering when the "
                        "probe was gated — the gate must never block a room "
                        "from opening")

    def test_with_no_override_the_start_up_request_count_is_unchanged(self):
        # ⚠ THE BASELINE IS CAPTURED IN THE SAME RUN AS THE GATED CASES, which
        # is the only honest way to say "unchanged" from inside the change.
        seen = self.capture_requests()
        self.drive_every_call_path({})
        self.assertEqual(
            len(seen), DRIVE_REQUEST_COUNT,
            "a room that set no override changed its request count: " +
            repr(seen))
        for url in seen:
            self.assertFalse(
                url.startswith(PROXY) or url.startswith(PROXY_TWO),
                "a room that set no override reached a redirected address")
        self.assertTrue(
            seen[0].startswith(L.DEFAULT_BASES["ollama"]),
            "the shipped local address is no longer the one the room asks")
        # ...and nothing was asked of her, because nothing was redirected.
        self.assertIsNone(
            server.base_consent_gap(L.resolve_routing({}, environ={})),
            "a room that set no override was asked a consent question — the "
            "prompt may only ever appear to somebody who set the address "
            "themselves (law 6)")

    def test_an_unagreed_address_turns_the_librarian_off_without_touching_the_switch(self):
        # ⛔ D-15 + D-16: the OFF is a SECOND, INDEPENDENT reason. Routing it
        # through `librarian_enabled` would let the librarian propose flipping
        # a consent record, which is exactly what D-16 forbids.
        self.redirect_everything(PROXY)
        store = {"meta": {"librarian_enabled": True, "other": 1}}
        before = json.dumps(store["meta"], sort_keys=True)
        answer = server.librarian_available(store)
        self.assertEqual(
            json.dumps(store["meta"], sort_keys=True), before,
            "the decline wrote into the store's meta — `librarian_enabled` is "
            "model-proposable and a consent record may not ride it (D-16)")
        self.assertIs(answer["available"], False)
        self.assertIs(answer["enabled"], True,
                      "the switch she set was flipped by a consent answer")
        # ⛔ THE SHIPPED SHAPE, UNCHANGED — three consumers read it.
        self.assertEqual(set(answer),
                         {"available", "why", "auth", "enabled", "version_ok"})
        self.assertTrue(answer["why"],
                        "the room says the librarian is unavailable and gives "
                        "no reason at all")

    def test_the_terminal_writes_and_the_room_reads_it_in_both_directions(self):
        # D-11: the re-ask works ACROSS the two surfaces, not within each.
        settings = self.redirect_everything(PROXY)
        routing = L.resolve_routing(settings, environ={})

        # terminal -> room: --setup writes, and the room's own read sees it
        L.record_base_consent(PROXY, L.CONSENT_YES)
        self.assertIsNone(server.base_consent_gap(routing),
                          "the room did not see what the terminal wrote")
        self.assertIs(server.base_consent_block()["base_consent_needed"],
                      False)

        # room -> terminal: the address moves, the ROOM answers the new
        # question through its own route, and the terminal's reader sees it
        moved = self.redirect_everything(PROXY_TWO)
        moved_routing = L.resolve_routing(moved, environ={})
        self.assertIsNotNone(server.base_consent_gap(moved_routing))
        server.record_base_consent_answer(PROXY_TWO, L.CONSENT_YES)
        self.assertIsNone(server.base_consent_gap(moved_routing),
                          "the terminal did not see what the room wrote")
        self.assertTrue(server.base_agreed("anthropic", moved_routing))

        # ...and a DECLINE taken in the room is the SAME OFF the terminal
        # reads — D-15's stated consequence for D-11, and the half that stops
        # the room silently re-enabling what --setup turned off.
        back = self.redirect_everything(PROXY)
        back_routing = L.resolve_routing(back, environ={})
        server.record_base_consent_answer(PROXY, L.CONSENT_NO)
        gap = server.base_consent_gap(back_routing)
        self.assertIsNotNone(gap)
        self.assertEqual(gap[1], PROXY)
        self.assertEqual(gap[2], L.CONSENT_STATE_DECLINED)
        self.assertFalse(server.base_agreed("anthropic", back_routing))

    def test_a_change_of_address_re_asks_on_both_surfaces(self):
        # D-09's load-bearing half: consent given for one host may not ride a
        # later repoint at somebody else's.
        settings = self.redirect_everything(PROXY)
        L.record_base_consent(PROXY, L.CONSENT_YES)
        self.assertIsNone(
            server.base_consent_gap(L.resolve_routing(settings, environ={})))

        moved = self.redirect_everything(PROXY_TWO)
        gap = server.base_consent_gap(L.resolve_routing(moved, environ={}))
        self.assertIsNotNone(gap, "the address moved and nothing was asked")
        self.assertEqual(gap[1], PROXY_TWO)
        self.assertEqual(gap[2], L.CONSENT_STATE_UNASKED)
        block = server.base_consent_block()
        self.assertIs(block["base_consent_needed"], True)
        self.assertEqual(block["base_consent_address"], PROXY_TWO)
        self.assertEqual(block["base_consent_ask"], server.BASE_CONSENT_ASK)
        # ...and no call goes out while the new address is unagreed.
        seen = self.capture_requests()
        self.drive_every_call_path(moved)
        self.assertEqual(seen, [],
                         "the room kept calling after the address moved")

    def test_the_model_quality_warning_warns_and_never_blocks(self):
        # D-12: warn, do not block. The structural alternative (refuse the
        # reflection pass) was rejected — it hard-codes one judgement about
        # other people's models into a project meant to be forked.
        settings = self.redirect_everything(PROXY)
        L.record_base_consent(PROXY, L.CONSENT_YES)
        block = server.base_consent_block()
        self.assertEqual(block["base_consent_quality"],
                         server.BASE_MODEL_QUALITY_MSG,
                         "the warning went away the moment she agreed — it is "
                         "about the MODEL, not about the consent")
        self.assertIs(block["base_consent_needed"], False)
        # nothing is refused: the calls go out to the address she agreed to
        seen = self.capture_requests()
        self.drive_every_call_path(settings)
        self.assertEqual(len(seen), DRIVE_REQUEST_COUNT,
                         "the warning blocked a call — D-12 says warn")
        # and with NO override there is nothing to warn about
        self.write_settings({})
        self.assertIsNone(server.base_consent_block()["base_consent_quality"])

    def test_each_of_her_sentences_is_one_literal_in_the_tree(self):
        # ⚠ 26.99-COPY.md RULE 3: a sentence needed in two places is applied
        # from ONE constant, never typed twice — and here it is load-bearing,
        # because D-11 says the two surfaces must AGREE and two literals are
        # two chances to disagree. The values are read out of the code rather
        # than retyped here, so this file never becomes the second copy.
        root = __file__.rsplit("/", 2)[0]
        sources = {}
        for name in ("server.py", "app.js"):
            with open(os.path.join(root, name), encoding="utf-8") as fh:
                sources[name] = fh.read()
        for const in ("BASE_CONSENT_ASK", "BASE_CONSENT_DECLINED_MSG",
                      "BASE_MODEL_QUALITY_MSG"):
            sentence = getattr(server, const)
            self.assertEqual(
                sources["server.py"].count(sentence), 1,
                const + " is not exactly one literal in server.py")
            self.assertEqual(
                sources["app.js"].count(sentence), 0,
                const + " was copied into app.js — the room reads the "
                "server's own constant, so the two surfaces cannot drift")

    def test_the_room_records_her_answer_through_the_shipped_dispatch(self):
        settings = self.redirect_everything(PROXY)
        dispatch = inspect.getsource(server.StudyHandler.do_POST)
        self.assertIn("/api/librarian/base-consent", dispatch,
                      "the room has no way to answer — the route is not in "
                      "the shipped POST dispatch, so it inherits neither the "
                      "host guard nor the origin guard")
        self.assertTrue(hasattr(server.StudyHandler, "handle_base_consent"))

        block = server.record_base_consent_answer(PROXY, L.CONSENT_YES)
        self.assertIs(block["base_consent_needed"], False)
        self.assertIsNone(
            server.base_consent_gap(L.resolve_routing(settings, environ={})))
        # ⛔ AND THE ANSWER CARRIES NO CREDENTIAL AT ANY DEPTH.
        rendered = json.dumps(block)
        for name in L.KEY_ENV_NAMES.values():
            self.assertNotIn(name, rendered)

        # An answer about an address that is NOT the one in effect records
        # nothing: fail-closed, so a stale page cannot agree to something she
        # is not looking at.
        server.record_base_consent_answer(OTHER, L.CONSENT_YES)
        self.assertEqual(L.consented_base(L.load_settings()), PROXY)

    def test_two_redirected_addresses_are_agreed_to_one_at_a_time(self):
        # ⚠ A LIMITATION PINNED RATHER THAN DISCOVERED. 26.99-08's record
        # holds ONE address, so two different redirected hosts cannot both be
        # agreed to. The direction that matters is that this is SAFE: the
        # second stays OFF rather than being silently included. Routed to #12.
        settings = {"bases": {"anthropic": PROXY, "ollama": PROXY_TWO}}
        self.write_settings(settings)
        routing = L.resolve_routing(settings, environ={})
        L.record_base_consent(PROXY, L.CONSENT_YES)
        gap = server.base_consent_gap(routing)
        self.assertIsNotNone(
            gap, "the second redirected address was let through on the "
                 "strength of consent given for the first")
        self.assertEqual(gap[1], PROXY_TWO)
        # exactly ONE is offered at a time, so no surface asks two questions
        self.assertEqual(len(server.base_overrides(routing)), 2)
        self.assertEqual(server.base_consent_block()["base_consent_address"],
                         PROXY_TWO)

    # -- (7) 26.99-12: the two orderings she asked to change -----------------
    #
    # G-1, the terminal: *"it reads well, but move the warning below the
    # question"*. G-2, Manage: her question rendered TWICE on one screen — the
    # box stays, the second copy goes, the answers move under the box.
    #
    # ⛔ NOT ONE BYTE OF ANY SENTENCE MOVES. Every assertion below reads the
    # sentence out of `server` rather than retyping it, because a case that
    # retyped one would be the second literal §S-08 rule 3 forbids — and it
    # could then drift away from the very constant it is checking.

    def test_the_warning_prints_below_the_question_in_setup(self):
        # G-1, ASSERTED OVER BYTE OFFSETS IN THE CAPTURED OUTPUT, never over a
        # line number: a line number is a fact about the file, and what she
        # asked to change is what she READS.
        self.redirect_bases({"anthropic": PROXY})
        out = self.run_setup_capture(answers=["no"])
        ask = out.find(server.BASE_CONSENT_ASK)
        warn = out.find(server.BASE_MODEL_QUALITY_MSG)
        self.assertNotEqual(ask, -1, "--setup never asked her question")
        self.assertNotEqual(warn, -1, "--setup never printed the warning")
        self.assertGreater(
            warn, ask,
            "the model-quality warning is printed ABOVE her consent question "
            "(warning at offset %d, question at offset %d) — she asked for it "
            "BELOW the question (G-1)" % (warn, ask))
        # ...and the prompt she answers is between them, because "below the
        # question" means below the whole question, answer included.
        prompt = out.find("yes / no:")
        self.assertNotEqual(prompt, -1, "the yes / no prompt did not print")
        self.assertGreater(
            warn, prompt,
            "the warning landed between the question and its own prompt")

    def test_the_warning_still_prints_for_an_address_she_already_agreed_to(self):
        # ⚠⚠ THE CASE THAT FAILS IF A LATER READER "TIDIES" THE WARNING INTO
        # THE LOOP. The loop `continue`s past every address already agreed to,
        # so a print moved inside it would appear only when a question appears
        # — which GATES IT ON CONSENT. D-12 says it stands beside the question
        # and BLOCKS NOTHING, printed whether or not she has already agreed,
        # because what she agreed to was the destination and not the quality.
        self.redirect_bases({"anthropic": PROXY})
        L.record_base_consent(PROXY, L.CONSENT_YES)
        out = self.run_setup_capture()
        self.assertEqual(
            out.count(server.BASE_CONSENT_ASK), 0,
            "she was asked again about an address she had already agreed to")
        self.assertEqual(
            out.count(server.BASE_MODEL_QUALITY_MSG), 1,
            "the warning went silent for somebody who had already agreed — it "
            "is a fact about the MODEL, not about the consent (D-12), and "
            "moving it must not gate it")

    def test_with_two_redirected_addresses_the_warning_prints_once_below_both(self):
        # Where "below" lands when MORE THAN ONE address is redirected: ONCE,
        # after the whole loop. Stated by the plan rather than discovered here,
        # and driven so it stays true.
        self.redirect_bases({"anthropic": PROXY, "ollama": PROXY_TWO})
        routing = L.resolve_routing(L.load_settings(), environ={})
        self.assertEqual(len(server.base_overrides(routing)), 2,
                         "the fixture did not produce two redirected "
                         "addresses, so this case measures nothing")
        out = self.run_setup_capture(answers=["no", "no"])
        self.assertEqual(
            out.count(server.BASE_MODEL_QUALITY_MSG), 1,
            "the warning printed once per address instead of once per run")
        self.assertEqual(
            out.count(server.BASE_CONSENT_ASK), 2,
            "the question did not arrive once per redirected address")
        self.assertGreater(
            out.rfind(server.BASE_MODEL_QUALITY_MSG),
            out.rfind(server.BASE_CONSENT_ASK),
            "the single warning is not below the LAST question")

    def test_a_room_that_redirected_nothing_prints_none_of_this(self):
        # LAW 6, as a control in the same run. A stranger's setup is
        # byte-identical to what it was: the prompt can only ever appear to
        # somebody who set the address themselves.
        self.write_settings({})
        out = self.run_setup_capture()
        for const in ("BASE_CONSENT_ASK", "BASE_CONSENT_DECLINED_MSG",
                      "BASE_MODEL_QUALITY_MSG"):
            self.assertEqual(
                out.count(getattr(server, const)), 0,
                const + " printed in a setup where nothing was redirected "
                "(law 6)")
        self.assertIn("The Study Room: setup", out,
                      "the control failed: --setup produced no output at all, "
                      "so counting zero sentences proves nothing")

    def test_her_question_is_rendered_once_on_the_manage_panel(self):
        # G-2, THE DEFECT SHE SAW LIVE. ⚠⚠ ANCHORED ON THE RENDERED
        # EXPRESSION, NOT ON THE FIELD NAME, AND THE DIFFERENCE IS THE WHOLE
        # GATE: the field name occurs only in the `typeof` var reads at the top
        # of the body, so a gate counting THOSE is already zero on the shipped
        # code and could never go red on the live defect. Every render uses the
        # LOCAL, so the local is what is counted.
        body = render_base_consent_body()
        self.assertTrue(
            body, "renderBaseConsent could not be delimited in app.js — an "
                  "offset assertion inside an empty body is vacuously true")
        self.assertEqual(
            body.count("escapeHtml(ask)"), 0,
            "her consent question is still rendered as a paragraph by "
            "renderBaseConsent — it also renders in the bordered status box "
            "from librarian.why, so she reads the same sentence twice on one "
            "screen (G-2). The box stays; this copy goes.")

    def test_the_question_field_survives_as_the_controls_guard(self):
        # ⚠ THE OTHER HALF, AND IT IS A SEPARATE ASSERTION ON PURPOSE: a fix
        # that deleted the field along with the paragraph passes the case above
        # and fails this one. `base_consent_ask` is the SERVER'S STATEMENT that
        # the question is pending and unanswered, and it is what decides
        # whether the answers paint at all.
        body = render_base_consent_body()
        self.assertTrue(body, "renderBaseConsent could not be delimited")
        self.assertGreaterEqual(
            body.count("base_consent_ask"), 1,
            "the consent-question field was dropped from renderBaseConsent "
            "along with the paragraph — the controls then paint for an "
            "address whose question is not pending")
        self.assertIn(
            "&& ask &&", body,
            "the controls' guard no longer tests the pending question — a "
            "guard weakened to base_consent_needed alone asks her to answer a "
            "question the server did not send")

    def test_her_answers_sit_above_the_warning_on_the_manage_panel(self):
        # G-2's ordering: box (her question) -> yes / no -> warning. Which is
        # also her G-1 shape on this surface.
        #
        # ⛔ THE REJECTED ANCHOR, RECORDED SO NOBODY REINSTATES IT: comparing
        # against `base_consent_quality` (a `typeof` read near the top of the
        # body) is False BEFORE AND AFTER any correct fix — an assertion this
        # code could never satisfy. The comparison is against the RENDER.
        body = render_base_consent_body()
        self.assertTrue(body, "renderBaseConsent could not be delimited")
        answer = body.find("base-consent-answer")
        quality = body.find("escapeHtml(quality)")
        self.assertNotEqual(answer, -1, "the yes / no controls are gone")
        self.assertNotEqual(quality, -1, "the warning is no longer rendered")
        self.assertLess(
            answer, quality,
            "the model-quality warning renders ABOVE her yes / no controls "
            "(first control at body offset %d, warning at %d) — she asked for "
            "the answers directly under the box, with the warning below them "
            "(G-2)" % (answer, quality))

    def test_the_box_that_carries_her_question_is_untouched(self):
        # ⚠ THE SURVIVING RENDER, RE-ASSERTED HERE so a G-2 edit that reached
        # the server would go red. `base_consent_why` feeds
        # `librarian_available["why"]`, which app.js renders inside the
        # bordered status panel — the box she said she likes.
        self.assertEqual(
            server.base_consent_why(L.CONSENT_STATE_UNASKED),
            server.BASE_CONSENT_ASK,
            "the box stopped carrying her question — that is the ONE render "
            "of it that survives G-2, and deleting it leaves the panel asking "
            "nothing at all")
        self.assertEqual(
            server.base_consent_why(L.CONSENT_STATE_DECLINED),
            server.BASE_CONSENT_DECLINED_MSG)
        # ...and app.js still spells none of it, so the two cannot drift.
        self.assertEqual(
            render_base_consent_body().count(server.BASE_CONSENT_ASK), 0,
            "renderBaseConsent now holds a literal of her question")


# ---------------------------------------------------------------------------
# THE DRILL — three mutations that must be CAUGHT, two controls that must stay
# green. A gate nobody has watched fail is a gate nobody has watched.
# ---------------------------------------------------------------------------

def _drill_home():
    tmp = tempfile.mkdtemp(prefix="study-room-base-drill-")
    os.environ["HOME"] = tmp
    getattr(L, "_DECLINED_THIS_VISIT", set()).clear()
    return tmp


def lost_update_drill():
    """⛔ THE TWO-WRITER DRILL, AND ITS CONTROL (L-02).

    `_FILES_LOCK` is a `threading.Lock` — PER PROCESS. It does not serialize
    `--setup` against a running server, and the write being atomic does not
    help: the hazard is a LOST UPDATE, not a torn file. The field a lost update
    drops here is a consent DECLINE, and dropping it silently re-grants consent
    for an address she refused.

    Both branches drive the same interleaving by hand, in one process, so the
    two writes land in a KNOWN order:

        1. she agrees to PROXY                     disk: consented = PROXY
        2. the OTHER process loads settings        cache: consented = PROXY
        3. she declines PROXY                      disk: (no consent)
        4. the other process writes

    Returns (control_lost_it, disciplined_kept_it)."""
    # --- the control: a writer that writes from the dict it cached ---------
    tmp = _drill_home()
    try:
        L.record_base_consent(PROXY, L.CONSENT_YES)
        cached = L.load_settings()                     # step 2
        L.record_base_consent(PROXY, L.CONSENT_NO)     # step 3
        cached["timeouts"] = {"local": 301}            # an unrelated change
        L.save_settings(cached)                        # step 4, from the cache
        control_lost_it = not L.base_needs_consent(PROXY, "anthropic")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # --- the discipline: load -> modify -> write FROM DISK -----------------
    tmp = _drill_home()
    try:
        L.record_base_consent(PROXY, L.CONSENT_YES)
        _stale = L.load_settings()                     # step 2 (and ignored)
        L.record_base_consent(PROXY, L.CONSENT_NO)     # step 3
        fresh = L.load_settings()                      # re-read at write time
        fresh["timeouts"] = {"local": 301}
        L.save_settings(fresh)                         # step 4, from disk
        disciplined_kept_it = L.base_needs_consent(PROXY, "anthropic")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    return control_lost_it, disciplined_kept_it


def run_drill():
    """Three mutations, each planted in a throwaway home, each of which MUST
    be caught. `caught == len(mutations)` is asserted BY VALUE in `main`."""
    saved_home = os.environ.get("HOME")
    results = []
    controls = 0
    try:
        # 1 — THE BOOLEAN. The record that says "yes" without saying to what.
        #     This is the mutation the plan calls the single most important
        #     line: a case that would pass with a boolean, made to fail.
        tmp = _drill_home()
        try:
            L.save_settings({L.SETTINGS_CONSENT_KEY: True})
            caught = L.base_needs_consent(PROXY, "anthropic")
            results.append(("a boolean in place of the address", caught))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        # 2 — THE MISSING NORMALISATION, planted as the STATE a writer
        #     without `.rstrip("/")` would leave behind. ⚠ THE DEFECT'S
        #     SYMPTOM IS A SPURIOUS RE-ASK, so the drill is caught when the
        #     reader DOES ask: an un-normalised record does not satisfy the
        #     same address spelled without the slash, and she is asked a
        #     second time for an answer she already gave.
        #
        # ⚠⚠ AND THIS IS WHY THE NORMALISATION LIVES IN THE WRITER ALONE.
        # A reader that ALSO normalised what it found would repair the
        # writer's omission — the trailing-slash case would stay green with
        # `record_base_consent`'s normalisation deleted, and the drill above
        # could never fail. A test that quietly absorbs the defect it is
        # watching for pins the defect as correct, which is the failure this
        # project has recorded four times.
        tmp = _drill_home()
        try:
            L.save_settings({L.SETTINGS_CONSENT_KEY: PROXY + "/"})
            caught = L.base_needs_consent(PROXY, "anthropic")
            results.append(("an un-normalised record", caught))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        # 3 — THE LOST UPDATE, with its control in the same run.
        control_lost_it, disciplined_kept_it = lost_update_drill()
        results.append(("a lost update dropping the decline", control_lost_it))
        if disciplined_kept_it:
            controls += 1
        else:
            print("  CONTROL RED: load->modify->write did NOT keep the "
                  "decline — the discipline itself is broken")

        # 4 — THE GATE REMOVED, AND THIS IS THE ONE THAT MAKES "ZERO
        #     REQUESTS" MEAN ANYTHING (26.99-09, B-3). The boundary recorder
        #     is handed the UNGATED call — `check_key` reached directly, the
        #     way the tree reached it before this plan — and the drill is
        #     caught when the recorder SEES the unagreed address. A recorder
        #     that could never see a violation reports every empty list as a
        #     safety it has not measured.
        #
        #     Its CONTROL is in the same block: the same address, the same
        #     recorder, through the GATED entry point instead, producing
        #     nothing.
        tmp = _drill_home()
        try:
            seen = []

            def fake(request, timeout_s, auth=None):
                seen.append(request.get("url"))
                return 503, {}, b""

            saved = L._transport
            L._transport = fake
            try:
                L.check_key("anthropic", base=PROXY)   # ⛔ ungated, on purpose
                ungated = [u for u in seen if u and u.startswith(PROXY)]
                seen[:] = []
                gated = None
                # While 26.99-09 is still RED the gated entry point does not
                # exist yet. The MUTATION is still meaningful (the recorder
                # sees the ungated call); only its control is unavailable, and
                # saying so is better than an attribute error in a harness.
                if hasattr(server, "setup_check_key"):
                    settings = {"bases": {"anthropic": PROXY,
                                          "ollama": PROXY}}
                    L.save_settings(settings)
                    server.setup_check_key(
                        "anthropic", L.resolve_routing(settings, environ={}))
                    gated = list(seen)
            finally:
                L._transport = saved
            results.append(("an ungated call to an unagreed address",
                            bool(ungated)))
            if gated == []:
                controls += 1
            elif gated is None:
                print("  CONTROL ABSENT: server.setup_check_key does not "
                      "exist yet — nothing gates --setup's key check")
            else:
                print("  CONTROL RED: the gated entry point still reached " +
                      repr(gated))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    finally:
        if saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = saved_home

    caught = 0
    for name, hit in results:
        if hit:
            caught += 1
        else:
            # Do NOT exit early — a harness that stopped at its first miss
            # once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")

    # The second control: the drill's own subject is reachable. A drill whose
    # planted value never got as far as the reader catches nothing and says
    # nothing.
    if L.SETTINGS_CONSENT_KEY and L.DEFAULT_BASES:
        controls += 1
    return caught, len(results), controls


_SERVER_SYMBOLS = ("BASE_CONSENT_ASK", "BASE_CONSENT_DECLINED_MSG",
                   "BASE_MODEL_QUALITY_MSG", "base_overrides",
                   "base_consent_gap", "base_consent_block",
                   "setup_check_key", "record_base_consent_answer")


def main():
    if not _has("BASE_ENV_NAMES", "SETTINGS_CONSENT_KEY", "consented_base",
                "record_base_consent", "base_needs_consent",
                "base_consent_state", "base_provenance_key"):
        print("test_base_url_consent RED — librarian_call does not yet carry "
              "the base read or the consent record (26.99-08 Task 2)")
        missing = [n for n in ("BASE_ENV_NAMES", "SETTINGS_CONSENT_KEY",
                               "consented_base", "record_base_consent",
                               "base_needs_consent", "base_consent_state",
                               "base_provenance_key") if not hasattr(L, n)]
        print("  absent: " + ", ".join(missing))
        print("CASES 0 of %d" % EXPECTED_CASES)
        return 1

    # ⛔ THE GATE'S HALF, NAMED SEPARATELY. 26.99-08 shipped the record with no
    # production caller; while that is still true this suite is RED and says
    # WHICH half is missing, rather than reporting a stack of attribute errors.
    absent = [n for n in _SERVER_SYMBOLS if not hasattr(server, n)]
    if absent:
        print("test_base_url_consent RED — server.py does not yet ask, and "
              "gates no call (26.99-09 Tasks 2 and 3)")
        print("  absent: " + ", ".join(absent))

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(BaseConsentCase)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    caught, total, controls = run_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d controls green"
          % (caught, total, controls))

    # ⚠ THE REQUESTS THIS RUN ACTUALLY WATCHED, BY VALUE, AND WHERE THEY WENT.
    # Every case that expected NONE asserts an empty list of its own, so
    # nothing from those cases is in here at all — which is exactly why this
    # total has to be NON-ZERO. A gate asserted over a transport nothing ever
    # reached is not a gate anybody has watched work (B-3).
    print("CAPTURED %d requests at the boundary, %d of them to an address "
          "this run agreed to"
          % (len(CAPTURED),
             len([u for u in CAPTURED if u and u.startswith(PROXY)])))
    boundary_ok = bool(CAPTURED)
    if not boundary_ok:
        print("BOUNDARY NEVER EXERCISED — a zero-request assertion over a "
              "transport nothing reached measures nothing")

    # ⚠ THE LAST WORD: the real config directory is exactly as this suite
    # found it. Only `--setup`, run by the owner, may create it.
    untouched = os.path.exists(REAL_ROOM_DIR) == REAL_ROOM_DIR_EXISTED
    if not untouched:
        print("REAL CONFIG DIRECTORY CHANGED — this suite must never do that")

    ok = (result.wasSuccessful()
          and ran == EXPECTED_CASES
          and caught == total == EXPECTED_MUTATIONS
          and controls == EXPECTED_CONTROLS
          and boundary_ok
          and untouched)
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    if not ok:
        return 1
    print("test_base_url_consent OK (%d cases: the shell's address with "
          "provenance, a refusal falling to the shipped default, the record "
          "holding a VALUE and never a boolean, a trailing slash that does "
          "not re-ask, the three states, the decline proved PER-VISIT with "
          "its within-visit control, the two-writer lost-update drill with "
          "its cached-dict control losing the decline, and the BOUNDARY: "
          "zero requests to an unagreed address from either surface, with "
          "the consented address witnessed in the same run)" % ran)
    return 0


if __name__ == "__main__":
    sys.exit(main())
