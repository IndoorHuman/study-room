#!/usr/bin/env python3
"""tests/test_clt_probe.py — the toolchain probe spawns nothing (26.94-02, V5).

Standalone `unittest` suite in the house convention: no runner, no package,
nothing installed (law 8). Exits 0/1 on BARE invocation so it sits inside the
`tests/test_*.py` glob the counting sweep uses, and still accepts `-k`.

WHAT THIS SUITE IS FOR. Photo reading needs the Apple Command Line Tools, and
the room has to decide whether to OFFER it before anyone asks. Every obvious
way to ask that question is wrong, and each was measured:

  * `xcode-select -p` returns exit **0 for a path that does not exist** — a
    gate on its exit code is green on a machine with no toolchain at all.
  * `shutil.which("swift")` is green on every Mac: /usr/bin/swift,
    /usr/bin/swiftc and /usr/bin/clang are ONE shim with 78 hard links.
  * running the shim is worse than useless — without the tools installed it is
    the thing that opens the `xcode-select --install` GUI, and a start-up
    check must never open a window.

So `server._swiftc_path()` asks the FILESYSTEM: `os.path.isfile` and
`os.access(..., os.X_OK)` over two OS toolchain paths, and nothing else. This
suite proves the two halves that could rot:

  1. IT SPAWNS NOTHING. `subprocess.run` and `subprocess.Popen` are replaced
     with functions that raise, and the probe is driven down its absent branch
     with them in place. A probe that quietly gained a confirmation call would
     raise here rather than passing.
  2. `os.access(..., X_OK)` IS LOAD-BEARING. A present-but-not-executable
     candidate is refused, and the drill re-composes the probe WITHOUT that
     half to show the same fixture then passing.

Both drills are permanent, not notes about a run that happened once.

⚠ ASSUMPTION A2, RECORDED AND NOT DISCHARGED. The genuinely-absent-CLT state
was never constructed — doing so means deleting the owner's toolchain. Every
absent case here is a candidate tuple pointed at a temp path. The installer
dialog is DESIGNED OUT, not OBSERVED AVOIDED, and no case here claims more.

⚠ Every path this suite touches is under a temp root it created, and it never
writes into the library; `tearDownModule` re-hashes the real `items.json` and
fails the run if one byte moved.
"""
import ast
import hashlib
import inspect
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — the importability proof (no socket bound)

REAL_ITEMS = Path.home() / "StudyRoom" / "items.json"
REAL_ITEMS_SHA = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
                  if REAL_ITEMS.exists() else None)


def tearDownModule():
    if REAL_ITEMS_SHA is None:
        return
    now = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
           if REAL_ITEMS.exists() else None)
    if now != REAL_ITEMS_SHA:
        raise AssertionError(
            "the real items.json moved during this suite — it must never")


def _executable_body(func):
    """A function's source with its docstring removed.

    The docstring of `_swiftc_path` NAMES `xcode-select -p` on purpose — that
    sentence is what stops the trap being re-entered — so an assertion about
    what the function DOES has to read the code and not the prose about it.
    """
    tree = ast.parse(textwrap.dedent(inspect.getsource(func)))
    node = tree.body[0]
    body = node.body
    if (body and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


class CltProbeCase(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="clt-probe-"))
        self.addCleanup(shutil.rmtree, str(self.tmp), True)
        self.assert_under_temp_root(self.tmp)
        self.addCleanup(setattr, server, "_CLT_TOOLCHAIN_SWIFTC",
                        server._CLT_TOOLCHAIN_SWIFTC)

    def assert_under_temp_root(self, path):
        root = os.path.realpath(tempfile.gettempdir())
        here = os.path.realpath(str(path))
        self.assertTrue(here.startswith(root + os.sep),
                        "a path this suite is about to write is not under "
                        "the system temp root")

    def point_at(self, *names):
        server._CLT_TOOLCHAIN_SWIFTC = tuple(str(self.tmp / n) for n in names)
        return server._CLT_TOOLCHAIN_SWIFTC

    def make(self, name, executable):
        p = self.tmp / name
        p.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        os.chmod(p, 0o755 if executable else 0o644)
        return str(p)

    def forbid_spawning(self):
        """Any spawn from here on is an AssertionError, not a pass."""
        def refuse(*args, **kwargs):
            raise AssertionError(
                "the probe spawned a process — it must ask the filesystem "
                "only, because the shim it would run is what pops the "
                "installer dialog")
        for name in ("run", "Popen", "check_output", "call"):
            self.addCleanup(setattr, subprocess, name,
                            getattr(subprocess, name))
            setattr(subprocess, name, refuse)


class TheAbsentBranch(CltProbeCase):

    def test_probe_is_filesystem_only(self):
        """V5 — absent toolchain, None returned, and nothing spawned."""
        self.point_at("no-such-swiftc")
        self.forbid_spawning()
        self.assertIsNone(server._swiftc_path())

    def test_the_present_branch_also_spawns_nothing(self):
        """The other side of the same claim: a confirmation probe added
        after stage 1 succeeds would take the pin to 3 (D-12), so the
        no-spawn property has to hold on BOTH branches, not just the one
        that returns early."""
        real = self.make("swiftc", executable=True)
        self.point_at("swiftc")
        self.forbid_spawning()
        self.assertEqual(server._swiftc_path(), real)


class TheCandidates(CltProbeCase):

    def test_an_executable_candidate_is_returned(self):
        real = self.make("swiftc", executable=True)
        self.point_at("swiftc")
        self.assertEqual(server._swiftc_path(), real)

    def test_a_present_but_not_executable_candidate_is_refused(self):
        """The X_OK half, on its own fixture — a file that exists and cannot
        run is exactly the shape a half-removed toolchain leaves behind."""
        self.make("swiftc", executable=False)
        self.point_at("swiftc")
        self.assertIsNone(server._swiftc_path())

    def test_a_directory_named_like_the_tool_is_refused(self):
        """isfile, not exists: a directory is executable by os.access."""
        (self.tmp / "swiftc").mkdir()
        self.point_at("swiftc")
        self.assertIsNone(server._swiftc_path())

    def test_the_first_present_candidate_wins(self):
        first = self.make("a-swiftc", executable=True)
        self.make("b-swiftc", executable=True)
        self.point_at("a-swiftc", "b-swiftc")
        self.assertEqual(server._swiftc_path(), first)

    def test_a_missing_first_candidate_falls_through_to_the_second(self):
        second = self.make("b-swiftc", executable=True)
        self.point_at("a-swiftc", "b-swiftc")
        self.assertEqual(server._swiftc_path(), second)


class Drills(CltProbeCase):

    def test_drill_without_the_executable_test_the_probe_says_yes(self):
        """⚠ V5's red, kept. The shipped probe minus its `os.access` half,
        on the same present-but-not-executable fixture, answers with a path.
        Then the control: the shipped probe answers None on that fixture."""
        candidate = self.make("swiftc", executable=False)
        candidates = self.point_at("swiftc")

        def probe_without_x_ok():
            for path in candidates:
                if os.path.isfile(path):
                    return path
            return None

        self.assertEqual(probe_without_x_ok(), candidate,
                         "the drill did not reproduce the defect, so the "
                         "shipped X_OK test is not what this case measures")
        self.assertIsNone(server._swiftc_path())

    def test_drill_a_spawned_detector_would_raise_here(self):
        """⚠ The second half of V5's red: if the probe asked a PROCESS
        instead of the filesystem, the no-spawn guard would fire. That is
        what makes `test_probe_is_filesystem_only` a measurement rather than
        a case that could never fail."""
        self.point_at("no-such-swiftc")
        self.forbid_spawning()

        def probe_by_spawning():
            proc = subprocess.run(["xcode-select", "-p"],
                                  capture_output=True)
            return proc.stdout

        with self.assertRaises(AssertionError):
            probe_by_spawning()
        self.assertIsNone(server._swiftc_path())


class TheOneBooleanThatCrosses(CltProbeCase):
    """26.94-03 (T-26.94-16): `photo_reading_available()` — the only thing
    about the toolchain that may reach the browser.

    ⚠ THE STATIC HALF LIVES IN `tests/test_no_push.cjs` (`cltCopyViolations`)
    and reads `handle_librarian_status` for the field's value expression and
    for any mention of a path helper. This half DRIVES the function. Neither
    is redundant: a source read cannot prove the answer is a real `bool`, and
    a behaviour test cannot notice the route quietly starting to send the
    path beside it. Do not delete either as duplication."""

    def test_present_is_true_and_absent_is_false(self):
        self.make("swiftc", executable=True)
        self.point_at("swiftc")
        self.assertIs(server.photo_reading_available(), True)
        self.point_at("no-such-swiftc")
        self.assertIs(server.photo_reading_available(), False)

    def test_it_is_a_real_bool_and_never_the_path(self):
        """⚠ `assertIs(..., True)` and `isinstance(..., bool)`, never a
        truthy check: a function that returned the PATH would satisfy every
        truthy assertion in this file and leak on the very first render."""
        path = self.make("swiftc", executable=True)
        self.point_at("swiftc")
        answer = server.photo_reading_available()
        self.assertIsInstance(answer, bool)
        self.assertNotEqual(answer, path)
        # ...and what actually crosses the wire is a bare `true`, with no
        # trace of the machine it was derived from anywhere in it.
        rendered = json.dumps({"photo_reading_ok": answer})
        self.assertEqual(rendered, '{"photo_reading_ok": true}')
        self.assertNotIn(self.tmp.name, rendered)
        self.assertNotIn("/Users/", rendered)

    def test_it_spawns_nothing_either(self):
        """The probe's no-spawn property is inherited, not re-earned — but a
        wrapper that added a confirmation call would still pop the installer
        dialog on a stranger's machine, so it is asserted here too."""
        self.point_at("no-such-swiftc")
        self.forbid_spawning()
        self.assertIs(server.photo_reading_available(), False)

    def test_drill_returning_the_path_passes_every_truthy_check(self):
        """⚠ V6's red for the leak, kept as a permanent drill. The obvious
        "more useful" rewrite — hand back what the boolean was derived from —
        is indistinguishable from the shipped function under a truthy test,
        and is caught only by the `isinstance` assertion above."""
        candidate = self.make("swiftc", executable=True)
        self.point_at("swiftc")

        def available_returning_the_path():
            return server._swiftc_path()

        leaked = available_returning_the_path()
        self.assertEqual(leaked, candidate,
                         "the drill did not reproduce the leak, so nothing "
                         "was measured")
        self.assertTrue(bool(leaked),
                        "the leak is TRUTHY — which is exactly why a truthy "
                        "assertion cannot tell it from the shipped answer")
        self.assertNotIsInstance(leaked, bool)
        # ...and the control: the shipped function, same fixture.
        self.assertIsInstance(server.photo_reading_available(), bool)


class TheSource(CltProbeCase):

    def test_the_probes_code_asks_the_filesystem_and_nothing_else(self):
        """The static half. `xcode-select` is NAMED in the docstring — that
        sentence is the thing that stops the trap being re-entered — so this
        reads the executable body with the docstring removed."""
        body = _executable_body(server._swiftc_path)
        for forbidden in ("xcode-select", "subprocess", "shutil", "which",
                          "popen", "system"):
            self.assertNotIn(forbidden, body.lower(),
                             "the probe's executable body names %r"
                             % forbidden)
        self.assertIn("os.path.isfile", body)
        self.assertIn("os.access", body)
        self.assertIn("os.X_OK", body)

    def test_the_docstring_still_carries_the_warning(self):
        """A gate whose reason has been deleted is a gate about to be
        'simplified' back into the trap."""
        doc = server._swiftc_path.__doc__ or ""
        self.assertIn("xcode-select", doc)
        self.assertIn("SPAWNS NOTHING", doc)

    def test_the_candidates_are_os_paths_and_name_nobody(self):
        for path in server._CLT_TOOLCHAIN_SWIFTC:
            self.assertTrue(path.startswith("/Library/")
                            or path.startswith("/Applications/"),
                            "a candidate that is not an OS path: " + path)
            self.assertNotIn("/Users/", path)


if __name__ == "__main__":
    unittest.main()
