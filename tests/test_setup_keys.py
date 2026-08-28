#!/usr/bin/env python3
"""tests/test_setup_keys.py — key custody, proved by value.

Standalone one-shot script in the house convention: no runner, no package.json,
nothing installed (law 8). Exits 0/1 on BARE invocation, so it sits inside the
`tests/test_*.py` glob the counting sweep uses. It parses no command-line
options at all — a suite that expects flags exits 2 when the sweep runs it with
none.

WHAT THIS SUITE IS FOR. 26.93-04 gives a key somewhere to live: a directory
under the user's home at mode 0700, a `keys.json` inside it at 0600, and a
SEPARATE `settings.json` that holds no secret at all. The modes are asserted
BY VALUE, the idempotence is asserted by comparing bytes, and a planted fake key
value is proved absent from what `--setup` prints. (The other three
planted-value surfaces — `Routing`'s repr, the five-key return, and anything
the module logs — live in `tests/test_call_seam.py`, which already owns the
recorder and the drill. Two independent instruments, not one.)

⚠⚠ THIS SUITE NEVER TOUCHES THE REAL CONFIG DIRECTORY. Every path it exercises
is under a temp root it created, and `assert_under_temp_root` says so BEFORE
anything is written. The real directory does not exist on this machine, and
this suite must not be the thing that creates it — only `--setup`, run by the
owner, does that. A case below compares the real directory's existence against
what it was at import, and `main()` checks it again after everything has run.

⚠⚠ NO ASSERTION HERE MAY PRINT A KEY VALUE, EVEN THE PLANTED FAKE ONE. Absence
is asserted with a boolean and a message that names the FIELD — never
`assertNotIn`, whose failure output prints the needle and the haystack together
and would turn a failing run in a transcript into the leak the case exists to
prevent (T-26.93-24).

The temp trees this suite makes are removed by this suite. There is one stale
`tests/.tmp-config-fence-*` in this repo already; this must not add a second,
which is why every temp root here is made with `tempfile.mkdtemp` (the system
temp location, outside the repo) and removed on cleanup.
"""

import ast
import builtins
import contextlib
import inspect
import io
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, __file__.rsplit("/", 2)[0])

import librarian_call as L          # noqa: E402
import study_lib                    # noqa: E402
import server                       # noqa: E402  (its import binds the literals)


# The counts this file asserts BY VALUE. A harness that aborts early then fails
# loudly instead of reporting a smaller success.
EXPECTED_CASES = 14
EXPECTED_MUTATIONS = 3
EXPECTED_CONTROLS = 2

# The fake value planted in a TEMPORARY keys file so that "no key value reaches
# this surface" can be asserted by searching for something that is definitely
# there to be found. It is never printed by any assertion in this file.
PLANTED = "planted-fake-credential-never-printed-7b3d"

# The one job row `server.py` binds its literals to at import, so it is the only
# row that reaches a builder without help. ⚠ WAS `heading_proposals` until
# 2026-08-17, when the labelling pass's two jobs were deleted (#95).
GATE_JOB = "import_presort"

# ⚠ CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY. This is how
# the suite proves afterwards that it did not create — or delete, or touch —
# the real config directory.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)


# ---------------------------------------------------------------------------
# ---- the fakes: a recorder, a spy, and a terminal that answers ------------

def canned_transport(status=200, body=b"{}"):
    """A transport that opens nothing and always answers the same triple.

    Takes `auth` as its own argument, exactly as the shipped transport does
    since 26.93-04 — the credential travels beside the request, never inside
    it."""
    def _transport(request, timeout_s, auth=None):
        del request, timeout_s, auth
        return status, {}, body
    return _transport


def tags_transport(names, status=200):
    """What the local server answers `/api/tags` with, for a given tag list."""
    body = json.dumps(
        {"models": [{"name": n} for n in names]}).encode("utf-8")
    return canned_transport(status=status, body=body)


class RejectionSpy:
    """Counts calls to `librarian_call._note_key_rejected` and then lets the
    shipped one run — A SPY, NOT A STUB, so what is counted is the shipped path
    rather than a stand-in for it."""

    def __init__(self, inner):
        self.inner = inner
        self.calls = []

    def __call__(self, provider):
        self.calls.append(provider)
        return self.inner(provider)


class FakeTerminal:
    """Answers `--setup`'s visible questions from a list.

    ⚠ It answers `input` ONLY. The key itself is never read through `input` —
    it is read through hidden input, and a case below asserts that from the
    source rather than trusting this fake."""

    def __init__(self, answers=()):
        self.answers = list(answers)
        self.prompts = []

    def __call__(self, prompt=""):
        self.prompts.append(prompt)
        return self.answers.pop(0) if self.answers else ""


# ---------------------------------------------------------------------------
# ---- "it installs nothing", as a property rather than a grep --------------
#
# ⚠ AGAINST THE SYNTAX TREE, NOT THE TEXT. A bare-word search for "subprocess"
# over `run_setup`'s source would go red the day somebody writes a comment
# saying "we deliberately do not spawn a subprocess here" — a scan tripped by
# its own prose, which is the same defect this suite's sibling had to have
# removed. Comments do not survive parsing and docstrings are inert constants,
# so prose is invisible here while a real spawn is not.

INSTALLER_MODULES = ("subprocess",)


def _dotted_name(node):
    """`os.system` for an attribute chain, `open` for a plain name."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    else:
        parts.append("<expr>")
    return ".".join(reversed(parts))


def installer_violations(source):
    """Every place `source` could run or fetch something, as a list of
    failures. Empty means it installs nothing it did not ship.

    An app asking for access to an entire personal archive must not also be
    the app that quietly downloads gigabytes on the user's behalf, so `--setup`
    checks, says what is missing, prints the exact command, and stops."""
    bad = []
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return ["the source did not parse: " + str(exc.msg)]

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in INSTALLER_MODULES:
                    bad.append("imports " + alias.name)
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] in INSTALLER_MODULES:
                bad.append("imports from " + str(node.module))
        elif isinstance(node, ast.Call):
            name = _dotted_name(node.func)
            if (name.split(".")[0] in INSTALLER_MODULES
                    or name in ("os.system", "os.popen", "os.execv",
                                "os.spawnv")
                    or name.endswith(".urlretrieve")
                    or name.endswith(".urlopen")):
                bad.append("calls " + name)
    return bad


# ---------------------------------------------------------------------------
# ---- the checker the mutation drill actually drives -----------------------

def custody_violations(dir_mode, keys_mode, routing_strings, rejections):
    """This plan's key-custody claims, as a list of failures. Empty means all
    held.

    Factored out for the same reason `seam_violations` is: the SAME function
    that judges a real measurement can be fed in-memory copies with one thing
    wrong each. A positive control proves the measurement happens; it does NOT
    prove the assertions would notice a violation, and those are two different
    claims.

    ⚠ No entry ever contains a key value — each names the FIELD that failed."""
    bad = []

    if dir_mode != 0o700:
        bad.append("the config directory's mode is not 0700: " + oct(dir_mode))
    if keys_mode != 0o600:
        bad.append("the keys file's mode is not 0600: " + oct(keys_mode))

    if any(PLANTED in str(s) for s in routing_strings):
        bad.append("a key value is reachable from the frozen Routing object")

    if not rejections.get("bad_key"):
        bad.append("`bad_key` recorded no rejection — it is the one token "
                   "that must (D-07)")
    for token in ("rate_limited", "provider_down", "offline", "timeout"):
        if rejections.get(token):
            bad.append("`" + token + "` recorded a key rejection and must "
                       "never (D-07) — a busy or unreachable server has not "
                       "looked at the credential")

    return bad


# ---------------------------------------------------------------------------
# ---- the cases ------------------------------------------------------------

class CustodyCase(unittest.TestCase):

    def setUp(self):
        # ⚠ THE TEMP ROOT COMES FIRST, AND NOTHING IS WRITTEN BEFORE THE
        # ASSERTION BELOW. Pointing the home directory at a fresh temp tree is
        # the whole of the isolation: every path in this plan is derived from
        # the home directory on every call, so no production door had to be cut
        # into the module to make this hermetic.
        self.tmp_home = tempfile.mkdtemp(prefix="study-room-custody-")
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = self.tmp_home
        self._saved_env = {}
        for name in L.KEY_ENV_NAMES.values():
            self._saved_env[name] = os.environ.pop(name, None)
        self._saved_transport = L._transport
        self._saved_note = L._note_key_rejected
        self.rejections = RejectionSpy(self._saved_note)
        L._note_key_rejected = self.rejections
        self.addCleanup(self._restore)
        self.assert_under_temp_root()

    def _restore(self):
        L._transport = self._saved_transport
        L._note_key_rejected = self._saved_note
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

        Called BEFORE anything is written, in every case. `realpath` on both
        sides because the system temp location is itself a symlink on macOS,
        and a comparison that ignored that would be comparing two spellings of
        the same directory and calling them different."""
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

    # -- the modes, by value ------------------------------------------------

    def test_the_directory_and_the_keys_file_carry_the_stated_modes(self):
        L.ensure_files()
        dir_mode = stat.S_IMODE(
            os.stat(str(study_lib.room_config_dir())).st_mode)
        keys_mode = stat.S_IMODE(os.stat(str(L.keys_path())).st_mode)
        # BY VALUE. "readable only by you" is a claim the room makes out loud,
        # so it is asserted as a number rather than as an absence of complaint.
        self.assertEqual(dir_mode, 0o700)
        self.assertEqual(keys_mode, 0o600)

    def test_running_the_writer_twice_leaves_byte_identical_files(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        first = (L.settings_path().read_bytes(), L.keys_path().read_bytes())
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        second = (L.settings_path().read_bytes(), L.keys_path().read_bytes())
        # Idempotence ASSERTED, not assumed: re-running `--setup` is how a key
        # is changed, so running it twice with the same answers must be a no-op.
        self.assertEqual(first[0], second[0])
        self.assertEqual(first[1], second[1])
        self.assertEqual(stat.S_IMODE(os.stat(str(L.keys_path())).st_mode),
                         0o600)

    # -- two files, and only one of them is dangerous -----------------------

    def test_the_settings_file_is_separate_and_never_holds_a_key(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        self.assertNotEqual(str(L.settings_path()), str(L.keys_path()))
        settings_text = L.settings_path().read_text(encoding="utf-8")
        # ⚠ The message names the FIELD, never the value.
        self.assertTrue(PLANTED not in settings_text,
                        "a key value is present in the settings file, which is "
                        "the file that is safe to share")
        # ...and the control half: the value really was written somewhere, so
        # this is not passing because nothing was saved at all.
        self.assertTrue(L.load_keys()["anthropic"]["present"])

    def test_a_saved_key_is_reported_as_presence_only(self):
        L.ensure_files()
        L.save_key("openai", PLANTED)
        reported = L.load_keys()
        self.assertIs(reported["openai"]["present"], True)
        self.assertIs(reported["anthropic"]["present"], False)
        self.assertTrue(PLANTED not in json.dumps(reported),
                        "a key value is present in load_keys()'s return, which "
                        "is the shape every surface above the module is given")
        # the local rung has no credential concept at all
        self.assertNotIn("ollama", reported)

    def test_removing_a_key_is_re_running_the_same_command(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        self.assertIs(L.load_keys()["anthropic"]["present"], True)
        L.remove_key("anthropic")
        self.assertIs(L.load_keys()["anthropic"]["present"], False)
        self.assertTrue(PLANTED not in L.keys_path().read_text(
            encoding="utf-8"),
            "a removed key value survives in the keys file")

    # -- the fence gains one refusal (#28, T-26.93-22) ----------------------

    def test_the_keys_file_is_refused_by_the_shipped_fence(self):
        fenced = {"state": "blessed", "library_path": str(L.keys_path())}
        ordinary = {"state": "blessed", "library_path": "files/a-note.md"}
        settings_row = {"state": "blessed",
                        "library_path": str(L.settings_path())}
        # Called, never copied: this is the shipped predicate.
        self.assertIs(study_lib._librarian_fenced(fenced, []), True)
        # ...and the control half, twice: an ordinary row is NOT fenced, and
        # neither is the settings file, which holds nothing secret. A predicate
        # that fenced everything would pass the first assertion for free.
        self.assertIs(study_lib._librarian_fenced(ordinary, []), False)
        self.assertIs(study_lib._librarian_fenced(settings_row, []), False)
        # the same refusal through the tilde spelling, which is what a
        # hand-edited store would most likely carry
        tilde = {"state": "blessed",
                 "library_path": "~/" + study_lib.ROOM_CONFIG_DIR_NAME + "/"
                                 + study_lib.KEYS_FILE_NAME}
        self.assertIs(study_lib._librarian_fenced(tilde, []), True)

    # -- what `--setup` prints (the fourth planted-value surface) -----------

    def test_setup_prints_no_key_value_and_still_reports_presence(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        L._transport = tags_transport(["qwen2.5:7b"])
        printed = self.run_setup_with(["", ""])
        self.assertTrue(PLANTED not in printed,
                        "a key value appears in what --setup prints")
        # ...and the control half: it DID report that provider's key, so the
        # case is not passing because the surface said nothing at all.
        # ⚠ Boolean plus field name throughout, because THIS haystack is the
        # printed surface itself — the one place a key value could ever appear.
        # A failure here must never echo the output it is judging.
        self.assertTrue("a key is saved" in printed,
                        "--setup does not report a saved key at all")
        self.assertTrue("anthropic" in printed,
                        "--setup does not name the provider")

    def test_setup_reads_hidden_input_and_never_the_command_line(self):
        src = inspect.getsource(server.run_setup)
        # ⚠ A BOOLEAN AND A FIELD NAME, NEVER `assertIn`/`assertNotIn`: the
        # haystack is a whole function's source, and a failure that dumps it
        # into a terminal is the shape that leaks when the needle is a value.
        self.assertTrue("getpass.getpass(" in src,
                        "the key is not read through hidden input")
        # ⚠ An argument is visible in the process list to every other process
        # on the machine. There is no path from the command line to a key.
        self.assertTrue("sys.argv" not in src,
                        "the setup reads the command line, which is where a "
                        "key must never come from")
        self.assertTrue("argparse" not in src,
                        "the setup parses command-line options, which is a "
                        "path from the command line to a key")

    def test_setup_installs_nothing_and_prints_the_exact_commands(self):
        src = inspect.getsource(server.run_setup) + inspect.getsource(
            server._setup_local_lines)
        self.assertEqual(installer_violations(src), [])

        # POSITIVE CONTROL — three real spawns, in fabricated CODE, each one
        # caught. A checker that has only ever been seen finding nothing has
        # not been shown to find anything.
        for label, snippet in (
                ("a subprocess import", "import subprocess\n"),
                ("a subprocess call",
                 "def f():\n    subprocess.run(['ollama', 'pull', 'x'])\n"),
                ("a shell call", "def f():\n    os.system('ollama pull x')\n"),
                ("a download",
                 "def f():\n    urllib.request.urlretrieve(u, p)\n")):
            self.assertTrue(installer_violations(snippet), label)

        # NEGATIVE CONTROL — prose ABOUT spawning, in a comment and in a
        # docstring, is not a spawn. A word search would fail here, and the
        # sentence is worth more than the search.
        prose = ('"""It never spawns a subprocess and downloads nothing."""\n'
                 "# no subprocess, no os.system, nothing fetched\n"
                 "\n\ndef f():\n    return []\n")
        self.assertEqual(installer_violations(prose), [])

        printed = "\n".join(server._setup_local_lines(
            {"state": L.PROBE_NOT_RUNNING, "tags": [], "search_model": False}))
        self.assertIn("ollama serve", printed)
        self.assertIn("Nothing here is downloaded for you.", printed)

    def test_the_platform_caveat_is_printed_only_where_it_applies(self):
        # A 0600 mode is close to a no-op on Windows. The room says so THERE,
        # and does not muddy every other platform's setup with a caveat that
        # does not apply — nor claim a protection it is not providing.
        self.assertEqual(server._windows_caveat_lines("posix"), [])
        self.assertEqual(server._windows_caveat_lines("java"), [])
        self.assertTrue(server._windows_caveat_lines("nt"))

    def test_zero_keys_is_stated_as_a_complete_room(self):
        L._transport = tags_transport(["qwen2.5:7b", "nomic-embed-text:v1.5"])
        printed = self.run_setup_with(["", ""])
        # Said FIRST, and said plainly: the minimum is zero keys. Boolean plus
        # field name again — the haystack is the printed surface.
        #
        # ⚠ REWRITTEN, NOT DELETED (#77 site 1, 2026-08-14). The sentence this
        # used to pin — "A room with no keys at all is a complete room." — was
        # the room's own wording for the fact; the owner replaced the whole
        # opening block with #48's approved surface 1, which states the same
        # fact in her words. Deleting the assertion would erase the record that
        # this fact was ever required, and a deletion-shaped fix is
        # indistinguishable from losing coverage.
        self.assertTrue(
            "You can stop here and not give a key." in printed,
            "--setup does not state that zero keys is a complete room")
        # ⚠ THE FACT THE BLOCK EXISTS TO DELIVER, pinned for the first time.
        # Measured 2026-08-14 across all 157 lines of the old `run_setup`:
        # Anthropic 0, OpenAI 0, internet 0, cloud 0, "copy of the text" 0. The
        # telling was in the right place (#34 ruling 6.1) and did not contain
        # the thing it was placed there to say.
        self.assertTrue(
            "a copy of the text to the AI service you give a key to" in
            printed.replace("\n", " ").replace("  ", " "),
            "--setup never says a copy of the text is sent anywhere")
        # ⚠ THE TWO FACTS #74 RULED OWED, in her words (2026-08-20).
        # The block named four features and stopped there, so a reader
        # could take one reflection to be one sending. Both halves are
        # pinned because they are different facts: what she TYPES BACK
        # goes, and each exchange sends her material AGAIN — the second
        # is what makes a long conversation cost more than a short one,
        # and it is load-bearing against the "reflections are nearly
        # the whole bill" line further down the same block.
        # ⛔ NOT a fifth feature: #74 refused "five things".
        flat = printed.replace("\n", " ").replace("  ", " ")
        for owed in ("Anything you write back is sent too",
                     "each time, your writing goes with it again"):
            self.assertIn(
                owed, flat,
                "--setup no longer says: %s" % owed)
        # ⚠ AND NO COMPANY IS NAMED HERE: no key exists yet, so there is no
        # configured provider to name. Asserted as ABSENCE so a later edit
        # cannot quietly reintroduce one.
        for company in ("Anthropic", "OpenAI"):
            self.assertNotIn(
                company, printed,
                "--setup names %s before any key exists" % company)
        self.assertTrue("about 5 GB" in printed,
                        "--setup does not say what the local models cost to "
                        "download, or that it is not downloading them")
        self.assertTrue("no key" in printed,
                        "--setup does not report a provider with no key")

    def test_each_local_state_gets_its_own_command(self):
        not_running = "\n".join(server._setup_local_lines(
            {"state": L.PROBE_NOT_RUNNING, "tags": [], "search_model": False}))
        no_language = "\n".join(server._setup_local_lines(
            {"state": L.PROBE_MODEL_MISSING, "tags": ["llama3:8b"],
             "search_model": False}))
        no_search = "\n".join(server._setup_local_lines(
            {"state": L.PROBE_WORKING, "tags": ["qwen2.5:7b"],
             "search_model": False}))
        working = "\n".join(server._setup_local_lines(
            {"state": L.PROBE_WORKING,
             "tags": ["qwen2.5:7b", "nomic-embed-text:v1.5"],
             "search_model": True}))
        self.assertIn("ollama serve", not_running)
        self.assertIn("ollama pull qwen2.5:7b", no_language)
        self.assertIn("ollama pull nomic-embed-text:v1.5", no_search)
        # ⚠ Its own sentence, because the symptom reads as an empty room rather
        # than a missing model.
        self.assertIn("cannot search your own things", no_search)
        # THREE different states, never flattened: the language model missing
        # is not the same fact as nothing answering.
        self.assertNotIn("ollama serve", no_language)
        self.assertNotIn("ollama pull", working)
        # ...and it reports which models it actually saw.
        self.assertIn("llama3:8b", no_language)

    # -- the two guards that keep this suite honest -------------------------

    def test_the_real_config_directory_is_never_touched(self):
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite changed whether the real config "
                         "directory exists")

    def test_the_two_files_are_derived_from_home_and_not_the_repo(self):
        repo_root = os.path.realpath(__file__.rsplit("/", 2)[0])
        for path in (L.settings_path(), L.keys_path()):
            here = os.path.realpath(str(path))
            self.assertFalse(here.startswith(repo_root + os.sep),
                             "a config file resolves inside the repo, where "
                             "re-cloning would lose it and `git add -f` could "
                             "reach it")
            self.assertTrue(here.startswith(
                os.path.realpath(os.path.expanduser("~")) + os.sep))

    # -- helpers ------------------------------------------------------------

    def run_setup_with(self, answers):
        """Run `--setup`'s function against the temp root and return every
        line it printed. The visible questions are answered from `answers`;
        hidden input is never reached by these cases."""
        terminal = FakeTerminal(answers)
        saved_input = builtins.input
        builtins.input = terminal
        buffer = io.StringIO()
        try:
            with contextlib.redirect_stdout(buffer):
                server.run_setup()
        finally:
            builtins.input = saved_input
        return buffer.getvalue()


# ---------------------------------------------------------------------------
# ---- the mutation drill ---------------------------------------------------

def _anthropic_routing():
    """A frozen Routing whose LOCAL tier is filled by Anthropic, so the one
    bound job row can be driven through the cloud adapter. Built through
    `resolve_routing` with a stored fill, never by hand."""
    return L.resolve_routing(
        {"fills": {"local": list(L.ANTHROPIC_FILLS["good-cloud"])}},
        environ={})


def measure(tmp_home):
    """The real, unmutated measurement, taken inside `tmp_home`.

    Returns (dir_mode, keys_mode, routing_strings, rejections, mismatches):
    the two modes as they actually are on disk, every string reachable from a
    real frozen `Routing` built while a key is planted, and which tokens
    actually recorded a rejection when driven through the shipped seam."""
    saved_home = os.environ.get("HOME")
    saved_transport = L._transport
    saved_sleep = L._sleep
    saved_note = L._note_key_rejected
    spy = RejectionSpy(saved_note)
    saved_env = {}
    os.environ["HOME"] = tmp_home
    for name in L.KEY_ENV_NAMES.values():
        saved_env[name] = os.environ.pop(name, None)
    L._note_key_rejected = spy
    L._sleep = lambda seconds: None
    mismatches = []
    try:
        L.ensure_files()
        L.save_key("anthropic", PLANTED)
        dir_mode = stat.S_IMODE(
            os.stat(str(study_lib.room_config_dir())).st_mode)
        keys_mode = stat.S_IMODE(os.stat(str(L.keys_path())).st_mode)

        routing = L.resolve_routing({}, environ={})
        routing_strings = [repr(routing)]
        for mapping in (routing.fills, routing.bases, routing.timeouts,
                        routing.provenance):
            routing_strings.extend(str(k) for k in mapping)
            routing_strings.extend(str(v) for v in mapping.values())

        drivers = {"bad_key": 401, "rate_limited": 429, "provider_down": 500,
                   "offline": None, "timeout": L.STATUS_TIMED_OUT}
        rejections = {}
        for token in sorted(drivers):
            spy.calls = []
            L._transport = canned_transport(status=drivers[token])
            answer = L.call_librarian(GATE_JOB, "x", _anthropic_routing())
            rejections[token] = len(spy.calls)
            if answer["failure"] != token:
                mismatches.append("the driver for " + token + " produced "
                                  + repr(answer["failure"]))
    finally:
        L._transport = saved_transport
        L._sleep = saved_sleep
        L._note_key_rejected = saved_note
        for name, value in saved_env.items():
            if value is not None:
                os.environ[name] = value
        if saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = saved_home
    return dir_mode, keys_mode, routing_strings, rejections, mismatches


def run_drill():
    """Feed the checker copies with ONE thing wrong each.

    THE THREE MUTATIONS ARE THE THREE THINGS THIS PLAN WOULD ACTUALLY LOSE:
    a busy server recorded as a rejected key (the one that costs her work), the
    credential carried on the routing object (the convenience a later reader
    reaches for), and the keys file's mode loosened (the protection stated out
    loud). Every mutation is counted, the unmutated controls are counted
    separately, and all three totals are asserted BY VALUE against the literals
    at the top of this file."""
    tmp_home = tempfile.mkdtemp(prefix="study-room-drill-")
    try:
        dir_mode, keys_mode, routing_strings, rejections, mismatches = \
            measure(tmp_home)
    finally:
        shutil.rmtree(tmp_home, ignore_errors=True)

    for line in mismatches:
        print("  DRILL DRIVER WRONG: " + line)

    controls = 0
    # Control 1 — the REAL measurement, judged clean.
    if custody_violations(dir_mode, keys_mode, routing_strings,
                          rejections) == [] and not mismatches:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real measurement")
    # Control 2 — an independently built clean copy. Two controls that were
    # the same call twice would only prove the call is deterministic.
    clean_rejections = {"bad_key": 1, "rate_limited": 0, "provider_down": 0,
                        "offline": 0, "timeout": 0}
    if custody_violations(0o700, 0o600, ["fills={'local': ('ollama', ...)}"],
                          clean_rejections) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the fabricated clean copy")

    mutations = [
        # 1 — a busy server recorded as a rejected key. The mutation that does
        # not merely tell her something untrue: it sends her to find, delete
        # and re-paste a key that was working.
        ("rate_limited records a key rejection",
         dir_mode, keys_mode, routing_strings,
         dict(rejections, rate_limited=1)),
        # 2 — the credential carried on the frozen routing object, which is
        # exactly the convenience that would put it into two worker signatures
        # and every repr along the way.
        ("the credential placed on Routing",
         dir_mode, keys_mode,
         list(routing_strings) + ["credential=" + PLANTED],
         dict(rejections)),
        # 3 — the keys file's mode loosened to something the whole machine can
        # read, while the room goes on saying "readable only by you".
        ("the keys file dropped to 0644",
         dir_mode, 0o644, routing_strings, dict(rejections)),
    ]

    caught = 0
    for name, d_mode, k_mode, strings, counts in mutations:
        if custody_violations(d_mode, k_mode, strings, counts):
            caught += 1
        else:
            # Do NOT exit early — a harness that stopped at its first catch
            # once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")

    return caught, len(mutations), controls


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(CustodyCase)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    caught, total, controls = run_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d controls green"
          % (caught, total, controls))

    # ⚠ THE LAST WORD: the real config directory is exactly as this suite found
    # it. Only `--setup`, run by the owner, may create it.
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
    print("test_setup_keys OK (modes by value, idempotence by bytes, "
          "a planted value proved absent, mutation drill)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
