#!/usr/bin/env python3
"""tests/test_vision_program.py — the on-device reader, proved through a PIPE.

Standalone `unittest` suite in the house convention: no runner, no package,
nothing installed (law 8). It exits 0/1 on BARE invocation, so it sits inside
the `tests/test_*.py` glob the counting sweep uses, and it still accepts `-k`
for the V-table's per-claim commands — `tests/test_server_smoke.py` is the
precedent that satisfies both.

WHAT THIS SUITE IS FOR. `tools/vision_read.swift` is greenfield product code
merging three throwaway research probes that had never been run together. Two
of the three landmines this phase carries live in that program, and both are
the kind that pass while doing nothing:

  V1  THE PIPE. All three probes read their path list with
      `String(contentsOfFile:"/dev/stdin")`, which reads NOTHING when standard
      input is a pipe — exit 0, zero rows, a finished-looking pass. The probes
      were only ever run under shell redirection, which is why nobody saw it.
      `test_pipe_stdin` drives a real pipe and asserts rows == len(paths) BY
      VALUE, and `test_drill_the_probe_stdin_idiom_reads_nothing_through_a_pipe`
      keeps the defect itself on the record permanently: it rebuilds the
      program with that one line swapped back and observes both stdin shapes,
      because the shape that still works is the whole explanation.

  V2  THE EMPTY LIST. None of the three probes ever exits non-zero for any
      reason, so a caller checking `returncode` learned nothing. Zero paths in
      is a REFUSAL here, and the drill re-checks that by removing the refusal
      and watching the program report success on nothing.

  V4  THE GUARD. `automaticallyDetectsLanguage` is macOS 13.0+ and the
      `#available` guard around it is load-bearing: the source must compile at
      BOTH the current deployment target and `arm64-apple-macosx12.0`, and the
      same source with the guard replaced by `if true` must FAIL at the older
      target. That failure is what proves the guard is doing work rather than
      decorating.

⚠ ASSUMPTION A1, RECORDED AND NOT DISCHARGED. `#available(macOS 13.0, *)` is a
RUNTIME check against the running OS. This machine reports macOS 26.5.1, so
only the `automaticallyDetectsLanguage` arm is ever SELECTED here — even in a
binary built with a macOS 12 deployment target. The else-arm's SELECTION is
therefore UNWITNESSED and cannot be witnessed on any machine this project has.
What this suite does witness is the else-arm's CODE, through the program's
`VR_LANG=zhfirst` seam, which sets byte-identically the same configuration.
No case here, and no document anywhere, may say more than that.

⚠⚠ THIS SUITE RUNS ON A MACHINE HOLDING A 44 GB REAL LIBRARY. Every path it
writes is under a temp root it created, asserted BEFORE anything is written;
nothing it writes goes near `~/StudyRoom`; and `tearDownModule` re-hashes the
real `items.json` and fails the run if one byte moved. The mutated copies of
the program are written into the temp root too — no case here opens a file in
the repository for writing.
"""
import base64
import hashlib
import http.client
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import zlib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — the importability proof (no socket bound)
import study_lib  # noqa: E402

PROGRAM = _REPO_ROOT / "tools" / "vision_read.swift"

# The Apple toolchain, resolved the way the room resolves it: on the
# filesystem, never through `xcode-select -p`, which returns exit 0 for a path
# that does not exist. That probe decides only WHETHER the toolchain is here;
# it spawns nothing.
_TOOLCHAIN_DIRS = ("/Library/Developer/CommandLineTools/usr/bin",
                   "/Applications/Xcode.app/Contents/Developer/usr/bin")


def _toolchain(name):
    for d in _TOOLCHAIN_DIRS:
        p = os.path.join(d, name)
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


# RUNNING the program uses the toolchain's own `swift`, which is what the room
# does (server._vision_swift_path). Measured 2026-08-13: it interprets this
# source correctly.
SWIFT = _toolchain("swift")
SWIFTC = _toolchain("swiftc")

# ⚠ COMPILING is different, and the difference is measured, not assumed.
# `/Library/Developer/CommandLineTools/usr/bin/swiftc` is a SYMLINK to
# `swift-frontend`, and invoking it directly to build this source fails with
# `unable to load standard library for target 'arm64-apple-macosx26.0'`
# because nothing supplied an `-sdk`. `/usr/bin/swiftc` — the shim that
# resolves the active developer directory — builds it at both targets, rc 0.
# So the toolchain path above is the right DETECTOR and the wrong COMPILER,
# and V4 uses the driver here. Nothing the room ships ever compiles; this
# exists only to prove the `#available` guard is load-bearing.
SWIFTC_DRIVER = "/usr/bin/swiftc"

# ⚠ CAPTURED AT IMPORT, READ-ONLY. The owner's real library lives here. This
# suite never writes into it; these two names are how it proves so afterwards.
REAL_ITEMS = Path.home() / "StudyRoom" / "items.json"
REAL_ITEMS_SHA = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
                  if REAL_ITEMS.exists() else None)


def tearDownModule():
    """The last word: the real store is exactly as this suite found it."""
    if REAL_ITEMS_SHA is None:
        return
    now = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
           if REAL_ITEMS.exists() else None)
    if now != REAL_ITEMS_SHA:
        raise AssertionError(
            "the real items.json moved during this suite — it must never")


def write_png(path, width=96, height=96, rgb=(200, 120, 80)):
    """A tiny, real PNG, built from the standard library alone (law 8).

    Vision needs a decodable picture, not a pretty one; 96x96 of one colour
    decodes, classifies, and yields a feature print in a few milliseconds.
    """
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff))

    blob = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height,
                                         8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    Path(path).write_bytes(blob)


def strip_swift_comments(src):
    """Whole-line and trailing `//` comments removed.

    The program's own comments NAME the defective idiom on purpose — that is
    the sentence that stops it coming back — so any assertion about what the
    CODE does has to read the code and not the prose about it. Deliberately
    line-based: this file has no block comments, and `tests/test_no_push.cjs`
    strips the same way for the same reason.
    """
    out = []
    for line in src.split("\n"):
        stripped = line.strip()
        if stripped.startswith("//"):
            out.append("")
            continue
        idx = line.find("//")
        out.append(line[:idx] if idx >= 0 else line)
    return "\n".join(out)


class VisionProgramCase(unittest.TestCase):
    """Shared temp root, fixture pictures, and the two ways to feed stdin."""

    def setUp(self):
        if SWIFT is None or SWIFTC is None:
            raise unittest.SkipTest(
                "the Apple toolchain is not on this machine — photo reading "
                "needs it, and this suite says so rather than passing "
                "quietly (xcode-select --install)")
        self.tmp = Path(tempfile.mkdtemp(prefix="vision-program-"))
        self.addCleanup(shutil.rmtree, str(self.tmp), True)
        self.assert_under_temp_root(self.tmp)

    def assert_under_temp_root(self, path):
        """Said BEFORE anything is written, because of what else is on disk."""
        root = os.path.realpath(tempfile.gettempdir())
        here = os.path.realpath(str(path))
        self.assertTrue(here.startswith(root + os.sep),
                        "a path this suite is about to write is not under "
                        "the system temp root")
        library = os.path.realpath(str(Path.home() / "StudyRoom"))
        self.assertFalse(here == library or here.startswith(library + os.sep),
                         "a path this suite is about to write resolves "
                         "inside the real library")

    def make_images(self, n):
        paths = []
        for i in range(n):
            p = self.tmp / ("pic%d.png" % i)
            write_png(p, rgb=(30 + 40 * i, 90, 160))
            paths.append(str(p))
        return paths

    def variant(self, name, *pairs):
        """A copy of the program with the given substitutions applied, written
        into the temp root. EVERY substitution must actually land — one that
        matched nothing is a mutation that was never planted, and a checker
        asked nothing at all would otherwise score as a pass."""
        src = PROGRAM.read_text(encoding="utf-8")
        mutated = src
        for old, new in pairs:
            step = mutated.replace(old, new)
            # A boolean, never assertNotEqual: the haystack is the whole
            # program, and a failure that prints it twice is unreadable.
            self.assertTrue(step != mutated,
                            "a substitution matched nothing, so it was "
                            "never planted: " + name)
            mutated = step
        target = self.tmp / (name + ".swift")
        self.assert_under_temp_root(target.parent)
        target.write_text(mutated, encoding="utf-8")
        return target

    def run_program(self, paths, source=None, env_extra=None, feed="pipe"):
        """(returncode, rows, stderr). `feed` is 'pipe' or 'file'."""
        env = dict(os.environ)
        env.update(env_extra or {})
        argv = [SWIFT, str(source or PROGRAM)]
        payload = "\n".join(paths) + ("\n" if paths else "")
        if feed == "file":
            listing = self.tmp / "paths.txt"
            listing.write_text(payload, encoding="utf-8")
            with open(listing, "rb") as handle:
                proc = subprocess.Popen(
                    argv, stdin=handle, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, env=env)
                out, err = proc.communicate(timeout=600)
        else:
            proc = subprocess.Popen(
                argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, env=env)
            out, err = proc.communicate(payload, timeout=600)
        rows = [json.loads(line) for line in out.splitlines() if line.strip()]
        return proc.returncode, rows, err

    def compile_at(self, source, target=None):
        """(returncode, stderr) from swiftc, output written to the temp root."""
        out = self.tmp / ("built-" + (target or "current").replace(".", "_"))
        argv = [SWIFTC_DRIVER, "-O"]
        if target:
            argv += ["-target", target]
        argv += ["-o", str(out), str(source)]
        proc = subprocess.run(argv, capture_output=True, text=True,
                              timeout=600)
        return proc.returncode, proc.stderr


class PipeStdin(VisionProgramCase):

    def test_pipe_stdin(self):
        """V1 — every path is read when standard input is a PIPE.

        The count is asserted BY VALUE and the paths are compared as a set:
        a program that read three of four would otherwise pass a
        rows-are-non-empty check, which is the shape the probes' defect wore.
        """
        paths = self.make_images(4)
        rc, rows, err = self.run_program(paths)
        self.assertEqual(len(rows), 4,
                         "rows through a pipe: %d, expected 4 — stderr %r"
                         % (len(rows), err))
        self.assertEqual(sorted(r["path"] for r in rows), sorted(paths))
        self.assertEqual(rc, 0, "stderr: %r" % err)

    def test_pipe_and_file_stdin_agree(self):
        """The two stdin shapes are the same run. They were not, once."""
        paths = self.make_images(3)
        rc_pipe, rows_pipe, _ = self.run_program(paths, feed="pipe")
        rc_file, rows_file, _ = self.run_program(paths, feed="file")
        self.assertEqual((rc_pipe, len(rows_pipe)), (0, 3))
        self.assertEqual((rc_file, len(rows_file)), (0, 3))

    def test_drill_the_probe_stdin_idiom_reads_nothing_through_a_pipe(self):
        """⚠ THE DEFECT ITSELF, KEPT ON THE RECORD (V1's red).

        The program is rebuilt with the one load-bearing line swapped back to
        the idiom all three probes used, and both stdin shapes are observed.
        Through a PIPE it reads nothing and reports success. Under `< file` it
        reads everything — and that second half is the whole reason the defect
        survived: every probe run was a shell redirection.
        """
        paths = self.make_images(3)
        broken = self.variant(
            "probe-stdin-idiom",
            ('let stdinData = FileHandle.standardInput.readDataToEndOfFile()\n'
             'let paths = (String(data: stdinData, encoding: .utf8) ?? "")',
             'let paths = ((try? String(contentsOfFile: "/dev/stdin",\n'
             '                          encoding: .utf8)) ?? "")'))

        rc, rows, _ = self.run_program(paths, source=broken, feed="pipe")
        self.assertEqual(len(rows), 0,
                         "the probe idiom read something through a pipe — "
                         "this drill is measuring the wrong thing")
        self.assertEqual(rc, 2,
                         "the broken program refuses only because THIS "
                         "program added a zero-path refusal; the probes "
                         "themselves exited 0 here")

        rc, rows, _ = self.run_program(paths, source=broken, feed="file")
        self.assertEqual(len(rows), 3,
                         "the same broken program under `< file` must read "
                         "all three — that is why nobody saw this")
        self.assertEqual(rc, 0)

        rc, rows, _ = self.run_program(paths, feed="pipe")
        self.assertEqual((rc, len(rows)), (0, 3),
                         "the control: the shipped source reads all three "
                         "through the same pipe")


class ZeroPaths(VisionProgramCase):

    def test_zero_paths_refuses(self):
        """V2 — nothing in, non-zero out, and one plain line saying so."""
        rc, rows, err = self.run_program([])
        self.assertEqual(len(rows), 0)
        self.assertNotEqual(rc, 0,
                            "zero paths must be a refusal, never a pass")
        self.assertEqual(len(err.strip().splitlines()), 1,
                         "one plain line, never a trace: %r" % err)
        self.assertIn("no paths", err)

    def test_drill_without_the_refusals_the_program_reports_success(self):
        """⚠ V2's red, kept — and it took BOTH refusals to reproduce.

        Removing only the zero-path refusal leaves the empty run caught by the
        second one (`succeeded == 0`), and the exit code moves 2 -> 3 rather
        than to 0. That is asserted here as the middle step, because it is the
        evidence that the two refusals are independent rather than one
        written twice. With both gone, the program reports a finished pass
        over nothing at all — which is exactly what all three probes did.
        """
        zero_path_refusal = ('if paths.isEmpty {\n    refuse("no paths '
                             'arrived on standard input — nothing was '
                             'read.", 2)\n}')
        all_failed_refusal = ('if succeeded == 0 {\n    refuse("every picture '
                              'failed to read (\\(attempted) attempted).", '
                              '3)\n}')

        half = self.variant("no-zero-path-refusal",
                            (zero_path_refusal, "// removed by the drill"))
        rc, rows, _ = self.run_program([], source=half)
        self.assertEqual(len(rows), 0)
        self.assertEqual(rc, 3,
                         "with one refusal gone the other must still catch "
                         "the empty run, at its own exit code")

        blind = self.variant("no-refusal-at-all",
                             (zero_path_refusal, "// removed by the drill"),
                             (all_failed_refusal, "// removed by the drill"))
        rc, rows, _ = self.run_program([], source=blind)
        self.assertEqual(len(rows), 0)
        self.assertEqual(rc, 0,
                         "the drill did not reproduce the defect, so the "
                         "shipped refusals are not what this case measures")


class AvailableGuard(VisionProgramCase):

    def test_available_guard_both_targets(self):
        """V4 — compiles at both deployment targets, and the guard is load-
        bearing: without it the older target refuses the source outright."""
        rc, err = self.compile_at(PROGRAM)
        self.assertEqual(rc, 0, "current target: %s" % err[-800:])
        rc, err = self.compile_at(PROGRAM, "arm64-apple-macosx12.0")
        self.assertEqual(rc, 0, "macosx12.0: %s" % err[-800:])

        unguarded = self.variant("unguarded",
                                 ("if #available(macOS 13.0, *) {",
                                  "if true {"))
        rc, err = self.compile_at(unguarded, "arm64-apple-macosx12.0")
        self.assertNotEqual(rc, 0,
                            "with the guard gone the macOS 12 target still "
                            "compiled — the guard would then be decoration")
        self.assertIn("automaticallyDetectsLanguage", err)
        self.assertIn("macOS 13.0", err)

    def test_language_toggle_selects_the_fallback(self):
        """A1's witnessable half: the CODE branch, never the OS condition."""
        paths = self.make_images(1)
        _, rows, _ = self.run_program(paths,
                                      env_extra={"VR_LANG": "zhfirst"})
        self.assertEqual([r.get("lang") for r in rows], ["zh-first"])
        _, rows, _ = self.run_program(paths)
        self.assertEqual([r.get("lang") for r in rows], ["auto"],
                         "on this machine (macOS 13+) the selected arm is "
                         "automatic detection")


class RowShape(VisionProgramCase):

    def test_error_row_carries_only_path_and_error(self):
        """A failed picture still counts, and says nothing else about itself.

        `ocr_auto.swift` and `fprint.swift` returned silently here, which
        makes a caller joining rows to inputs read a failure as an empty
        string — correct only by luck.
        """
        paths = self.make_images(2) + [str(self.tmp / "not-a-picture.png")]
        rc, rows, _ = self.run_program(paths)
        self.assertEqual(len(rows), 3, "the failed picture must still be a row")
        bad = [r for r in rows if "error" in r]
        self.assertEqual(len(bad), 1)
        self.assertEqual(sorted(bad[0].keys()), ["error", "path"])
        self.assertEqual(rc, 0, "two of three read, so the run succeeded")

    def test_every_picture_failing_is_a_non_zero_exit(self):
        rc, rows, err = self.run_program([str(self.tmp / "nope.png")])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rc, 3)
        self.assertIn("every picture failed", err)

    def test_feature_print_is_768_floats_and_3072_bytes(self):
        """The precision edge: the consumer refuses anything else, so the
        producer is pinned to the same two numbers BY VALUE."""
        paths = self.make_images(2)
        _, rows, _ = self.run_program(paths)
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertEqual(row["dim"], 768)
            self.assertEqual(len(base64.b64decode(row["fp"])), 3072)
            self.assertEqual(sorted(row.keys()),
                             ["dim", "faces", "fp", "lang", "path",
                              "text", "themes", "type"])


class SourceGates(VisionProgramCase):

    def test_the_defective_idiom_appears_only_in_prose(self):
        """⚠ The program NAMES the idiom it must never use — that sentence is
        the thing that stops it coming back — so the check reads the CODE.

        Comments are stripped first, and the raw occurrences are then
        confirmed to be comment lines, so this case cannot pass by the token
        having quietly moved into executable text.
        """
        src = PROGRAM.read_text(encoding="utf-8")
        self.assertEqual(strip_swift_comments(src).count("contentsOfFile"), 0,
                         "the program reads standard input by NAME somewhere")
        raw = [ln for ln in src.split("\n") if "contentsOfFile" in ln]
        self.assertTrue(raw, "the warning sentence went missing")
        for line in raw:
            self.assertTrue(line.strip().startswith("//"),
                            "an occurrence outside a comment: %r" % line)
        self.assertIn("readDataToEndOfFile", strip_swift_comments(src))

    def test_no_absolute_home_path_in_the_program(self):
        src = PROGRAM.read_text(encoding="utf-8")
        self.assertEqual([ln for ln in src.split("\n") if "/Users/" in ln], [])


class TheTracer(VisionProgramCase):
    """One photograph, all the way through: a path list on a pipe, one spawn,
    two cache files on disk, and the progress bar counting it."""

    def setUp(self):
        super().setUp()
        self.library = self.tmp / "library"
        (self.library / "items").mkdir(parents=True)
        self.assert_under_temp_root(self.library)
        store = study_lib.new_store(str(self.library))
        study_lib.save_store(str(self.library), store)
        self.items_json = self.library / "items.json"
        with server.JOB_LOCK:
            server.VISION_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None, message=None)

    def picture(self, item_id, rgb=(200, 120, 80)):
        path = self.library / "items" / (item_id + ".png")
        write_png(path, rgb=rgb)
        return (item_id, str(path))

    def sha(self, path):
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()

    def test_the_cache_is_a_sibling_of_librarian_not_a_child(self):
        """⚠ D-05's placement, ASSERTED rather than assumed. `rm -rf
        librarian/` is a documented, supported operation; a cache inside it
        would share the librarian's delete path with the machine's readings
        of her photographs."""
        root = Path(self.library)
        cache = study_lib.vision_dir_path(str(root))
        self.assertEqual(cache.parent, root)
        self.assertNotEqual(cache, root / "librarian")
        self.assertEqual(study_lib.vision_entry_path(str(root), "abc").parent,
                         cache)
        self.assertEqual(study_lib.vision_print_path(str(root), "abc").parent,
                         cache)

    def test_one_photograph_end_to_end(self):
        """THE TRACER. Everything this phase expands out from."""
        target = self.picture("aa11")
        before = self.sha(self.items_json)

        seen = []
        result = server.run_vision_pass(
            str(self.library), [target],
            progress_cb=lambda done, total: seen.append((done, total)))

        self.assertTrue(result["ok"], result.get("why"))
        self.assertEqual(result["report"]["ok"], 1)
        self.assertEqual(result["report"]["attempted"], 1)

        entry_path = study_lib.vision_entry_path(str(self.library), "aa11")
        print_path = study_lib.vision_print_path(str(self.library), "aa11")
        self.assertTrue(entry_path.is_file())
        entry = json.loads(entry_path.read_text("utf-8"))
        self.assertEqual(entry["dim"], 768)
        self.assertEqual(entry["lang"], "auto")
        self.assertEqual(
            entry["program_fp"],
            study_lib.vision_program_fingerprint(PROGRAM))
        self.assertEqual(print_path.stat().st_size, 3072,
                         "the print is 768 float32s and nothing else")

        with server.JOB_LOCK:
            snap = dict(server.VISION_JOB)
        self.assertEqual((snap["state"], snap["total"], snap["done"]),
                         ("done", 1, 1))
        self.assertEqual(seen, [(1, 1)],
                         "once per ATTEMPTED picture, law 6")

        # ⚠ THE PASS WRITES ONLY THE CACHE. Her judgements are untouched.
        self.assertEqual(self.sha(self.items_json), before)

    def test_the_progress_route_returns_the_same_snapshot(self):
        self.picture("aa11")
        with server.JOB_LOCK:
            server.VISION_JOB.update(state="running", total=7, done=3,
                                     started_ms=123, report=None,
                                     message=None)
        httpd = server.create_server(str(self.library), 0)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)

        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        try:
            conn.request("GET", "/api/vision-progress")
            body = json.loads(conn.getresponse().read().decode("utf-8"))
        finally:
            conn.close()
        self.assertTrue(body["ok"])
        self.assertEqual((body["state"], body["total"], body["done"]),
                         ("running", 7, 3))

    def test_rows_are_matched_by_path_never_by_arrival_order(self):
        """⚠ The program reads eight pictures at a time, so rows come back in
        ARBITRARY order. A pass that joined them to inputs by position would
        file one photograph's reading under another photograph's id — over
        her own pictures, silently. Each id's stored print is compared
        against that picture's own print, read separately."""
        targets = [self.picture("aa11", rgb=(240, 20, 20)),
                   self.picture("bb22", rgb=(20, 20, 240)),
                   self.picture("cc33", rgb=(20, 200, 40))]
        alone = {}
        for item_id, path in targets:
            _, rows, _ = self.run_program([path])
            self.assertEqual(len(rows), 1)
            alone[item_id] = base64.b64decode(rows[0]["fp"])
        self.assertEqual(len(set(alone.values())), 3,
                         "the three fixtures must have distinct prints or "
                         "this case cannot tell a mismatch from a match")

        result = server.run_vision_pass(str(self.library), targets)
        self.assertEqual(result["report"]["ok"], 3)
        for item_id, _ in targets:
            stored = study_lib.vision_print_path(
                str(self.library), item_id).read_bytes()
            self.assertEqual(stored, alone[item_id],
                             "%s was filed with another picture's print"
                             % item_id)

    def test_a_second_pass_writes_nothing_and_spawns_nothing(self):
        """Idempotency, and the skip decision proved rather than inferred:
        with Popen replaced by a function that raises, a second pass over the
        same photograph must still return cleanly."""
        target = self.picture("aa11")
        self.assertTrue(server.run_vision_pass(str(self.library),
                                               [target])["ok"])
        entry_path = study_lib.vision_entry_path(str(self.library), "aa11")
        print_path = study_lib.vision_print_path(str(self.library), "aa11")
        before = (entry_path.read_bytes(), print_path.read_bytes())

        def refuse(*args, **kwargs):
            raise AssertionError("the second pass spawned the reader again")

        saved = subprocess.Popen
        subprocess.Popen = refuse
        try:
            result = server.run_vision_pass(str(self.library), [target])
        finally:
            subprocess.Popen = saved

        self.assertTrue(result["ok"])
        self.assertEqual(result["report"]["skipped_cached"], 1)
        self.assertEqual(result["report"]["attempted"], 0)
        self.assertEqual((entry_path.read_bytes(), print_path.read_bytes()),
                         before, "both cache files must be byte-identical")

    def test_a_changed_program_makes_every_entry_stale(self):
        """The other half of the fingerprint: the skip above must NOT happen
        when the reading was produced by a different program. Driven by
        writing an entry with a fingerprint that is not the current one."""
        target = self.picture("aa11")
        self.assertTrue(server.run_vision_pass(str(self.library),
                                               [target])["ok"])
        entry_path = study_lib.vision_entry_path(str(self.library), "aa11")
        entry = json.loads(entry_path.read_text("utf-8"))
        entry["program_fp"] = "0" * 64
        entry_path.write_text(json.dumps(entry), encoding="utf-8")

        result = server.run_vision_pass(str(self.library), [target])
        self.assertEqual(result["report"]["skipped_cached"], 0,
                         "a reading from another program must not be reused")
        self.assertEqual(result["report"]["ok"], 1)
        self.assertEqual(
            json.loads(entry_path.read_text("utf-8"))["program_fp"],
            study_lib.vision_program_fingerprint(PROGRAM))

    def test_a_truncated_entry_reads_as_not_read_yet(self):
        """FAIL-OPEN, and it composes with the counted gate rather than
        fighting it: nothing raises, the entry simply is not there, and the
        note pass's count comes up short and refuses loudly."""
        target = self.picture("aa11")
        self.assertTrue(server.run_vision_pass(str(self.library),
                                               [target])["ok"])
        entry_path = study_lib.vision_entry_path(str(self.library), "aa11")
        entry_path.write_text('{"text": "half a fi',
                              encoding="utf-8")
        self.assertIsNone(study_lib.vision_read_entry(str(self.library),
                                                      "aa11"))
        self.assertIsNone(study_lib.vision_read_entry(str(self.library),
                                                      "no-such-id"))

    def test_an_empty_target_list_never_spawns(self):
        """Zero pictures in is zero work — and the program itself refuses an
        empty path list with a non-zero exit, so spawning here would turn
        'nothing to do' into 'the reading failed'."""
        def refuse(*args, **kwargs):
            raise AssertionError("an empty list must never reach a spawn")

        saved = subprocess.Popen
        subprocess.Popen = refuse
        try:
            result = server.run_vision_pass(str(self.library), [])
        finally:
            subprocess.Popen = saved
        self.assertTrue(result["ok"])
        self.assertEqual(result["report"]["attempted"], 0)

    def test_a_short_print_is_refused_and_counted_never_written(self):
        """SRM-11's precision edge, on the WRITER: the cache is the thing a
        later phase computes similarities from, so a print that is not
        exactly 3,072 bytes must not reach it under any caller."""
        good = {"path": "/x.png", "text": "hi", "themes": [], "faces": 0,
                "lang": "auto", "dim": 768, "type": 1,
                "fp": base64.b64encode(b"\0" * 3072).decode("ascii")}
        self.assertIsNone(study_lib.vision_row_refusal(good))
        short = dict(good, fp=base64.b64encode(b"\0" * 3071).decode("ascii"))
        self.assertEqual(study_lib.vision_row_refusal(short), "bad_fp_len")
        wrong_dim = dict(good, dim=512)
        self.assertEqual(study_lib.vision_row_refusal(wrong_dim), "bad_dim")
        self.assertEqual(
            study_lib.vision_row_refusal({"path": "/x.png",
                                          "error": "unreadable"}), "error")
        self.assertEqual(study_lib.vision_row_refusal("not a row"),
                         "unparseable")
        with self.assertRaises(ValueError):
            study_lib.vision_write_entry(str(self.library), "aa11", short,
                                         "deadbeef")
        self.assertFalse(
            study_lib.vision_entry_path(str(self.library), "aa11").exists())

    def test_chinese_text_round_trips_byte_identically(self):
        """SRM-13's encoding edge. The whole phase exists because 87% of her
        screenshots lost their Chinese once; a cache that mangled it on the
        way to disk would be the same loss one step later."""
        row = {"path": "/x.png", "text": "我叫Cheng 有字幕的", "themes": ["a"],
               "faces": 0, "lang": "auto", "dim": 768, "type": 1,
               "fp": base64.b64encode(b"\1" * 3072).decode("ascii")}
        study_lib.vision_write_entry(str(self.library), "zz99", row, "abc123")
        raw = study_lib.vision_entry_path(str(self.library),
                                          "zz99").read_bytes()
        self.assertIn("我叫Cheng".encode("utf-8"), raw,
                      "the characters must be on disk as themselves, not as "
                      "\\u escapes")
        back = study_lib.vision_read_entry(str(self.library), "zz99")
        self.assertEqual(back["text"], row["text"])


# ---------------------------------------------------------------------------
# ---- 26.94-06: the tracer's one photograph becomes thirteen thousand -------
# ---------------------------------------------------------------------------
#
# ⚠ WHY THESE CASES DRIVE A STUB READER AND NOT `swift vision_read.swift`.
# Everything below is about the SHAPE of the pass — that `done` moves DURING
# the stream and not after it, that an error row advances the bar exactly as a
# good row does, that a child which stops talking is killed rather than
# waited on for ever, that WRITE_LOCK is free the whole time, and that the
# fence is re-derived when the run ends. None of those is a property of the
# Swift program; every one is a property of the python around it, and each
# needs a child whose TIMING this suite controls. The real program is proved
# end to end by TheTracer above and stays the only thing that ever reads a
# real picture.
#
# The stub is spawned through the SAME single Popen call site — the two
# resolver functions are replaced, never the call — so the subprocess pin
# stays at 2 and these cases exercise the shipped code path rather than a
# parallel one.

_STUB = r'''
import base64, json, sys, time

PLAN = json.loads(PLAN_JSON)
paths = []
for line in sys.stdin:
    line = line.strip()
    if line:
        paths.append(line)
fp = base64.b64encode(b"\0" * 3072).decode("ascii")
for i, p in enumerate(paths):
    if i in PLAN.get("error_rows", []):
        row = {"path": p, "error": "unreadable"}
    else:
        row = {"path": p, "text": "hi", "themes": [], "faces": 0,
               "lang": "auto", "dim": 768, "type": 1, "fp": fp}
    sys.stdout.write(json.dumps(row) + "\n")
    sys.stdout.flush()
    time.sleep(PLAN.get("row_delay", 0.0))
    if PLAN.get("stall_after") is not None and i + 1 >= PLAN["stall_after"]:
        # ⚠ the wedge this suite exists to catch: still alive, still holding
        # stdout open, saying nothing. Without the watchdog the parent's
        # `for line in proc.stdout` blocks here until this sleep ends.
        time.sleep(PLAN.get("stall_for", 30))
        break
sys.exit(0)
'''


class TheFullBatch(VisionProgramCase):
    """13,453 photographs, one spawn: counted per attempt, restartable,
    bounded by three constants, and the fence re-derived when it ends."""

    def setUp(self):
        super().setUp()
        self.library = self.tmp / "library"
        (self.library / "items").mkdir(parents=True)
        self.assert_under_temp_root(self.library)
        self.store = study_lib.new_store(str(self.library))
        study_lib.save_store(str(self.library), self.store)
        self.items_json = self.library / "items.json"
        with server.JOB_LOCK:
            server.VISION_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None, message=None)

    # -- fixtures ---------------------------------------------------------

    def picture(self, item_id, state="unseen"):
        """A real store item AND a real file, so the shipped derivation
        (type / fence / jail / newline / existence) can run over it."""
        rel = "items/%s.png" % item_id
        write_png(self.library / rel)
        store = study_lib.load_store(str(self.library))
        store["items"][item_id] = {
            "id": item_id, "type": "image", "state": state,
            "trigger": False, "library_path": rel,
            "title": item_id, "source": "test"}
        study_lib.save_store(str(self.library), store)
        return (item_id, str(self.library / rel))

    def fence(self, item_id):
        """Her judgement, landing on disk — the transition A3 is about."""
        store = study_lib.load_store(str(self.library))
        store["items"][item_id]["state"] = "never_show"
        study_lib.save_store(str(self.library), store)

    def use_stub(self, **plan):
        """Point the two resolvers at a python stub. The CALL SITE is
        untouched: same Popen, same argv shape, same env whitelist."""
        # argv stays [interpreter, program] — a LIST, exactly the shipped
        # shape — so the plan rides INSIDE the stub rather than as an extra
        # argument the real call site would never pass.
        stub = self.tmp / "stub_reader.py"
        self.assert_under_temp_root(stub.parent)
        stub.write_text("PLAN_JSON = %r\n" % json.dumps(plan) + _STUB,
                        encoding="utf-8")
        saved_swift = server._vision_swift_path
        saved_prog = server._vision_program_path
        server._vision_swift_path = lambda: sys.executable
        server._vision_program_path = lambda: stub
        self.addCleanup(setattr, server, "_vision_swift_path", saved_swift)
        self.addCleanup(setattr, server, "_vision_program_path", saved_prog)

    def watcher(self, samples, locks_free, stop):
        """Another thread, reading the job dict WHILE the stream runs."""
        def loop():
            while not stop.is_set():
                with server.JOB_LOCK:
                    samples.append(server.VISION_JOB["done"])
                got = server.WRITE_LOCK.acquire(blocking=False)
                if got:
                    server.WRITE_LOCK.release()
                locks_free.append(got)
                time.sleep(0.01)
        thread = threading.Thread(target=loop, daemon=True)
        thread.start()
        return thread

    # -- the constants ----------------------------------------------------

    def test_the_three_timeout_constants_exist_by_name_and_value(self):
        """⚠ Popen HAS NO timeout=. The deleted vault tidy-up's guarantee
        (it passed a whole-run timeout to a blocking call; that path was
        removed 2026-08-14 under #56) does not travel to the streaming shape,
        so it is REPLACED here rather than inherited — one constant per way a child can fail to end. Asserted BY
        VALUE so a future edit that quietly softens a bound is a red suite
        and not a silent change."""
        self.assertEqual(server.VISION_STALL_S, 120)
        self.assertEqual(server.VISION_DRAIN_S, 30)
        self.assertEqual(server.VISION_TOTAL_CAP_S, 5400)
        src = (_REPO_ROOT / "server.py").read_text(encoding="utf-8")
        for name in ("VISION_STALL_S", "VISION_DRAIN_S",
                     "VISION_TOTAL_CAP_S"):
            self.assertEqual(src.count(name + " = "), 1,
                             name + " must be spelled once, as a constant")
        self.assertNotIn("VISION_DRAIN_TIMEOUT_S", src,
                         "the replaced constant must not linger beside its "
                         "replacement")

    def test_capture_output_never_appears_in_the_pass(self):
        """Pitfall 5: buffering the whole run holds the bar at zero for
        twenty minutes and then jumps it to done — law 6 broken by
        omission."""
        src = (_REPO_ROOT / "server.py").read_text(encoding="utf-8")
        start = src.index("def run_vision_pass(")
        body = src[start:src.index("\ndef ", start + 10)]
        self.assertNotIn("capture_output", body)
        self.assertIn("for line in proc.stdout:", body)

    # -- the batch --------------------------------------------------------

    def test_batch_counts_attempted(self):
        """⚠ PER ATTEMPTED ITEM, AND DURING THE STREAM (V22, law 6).

        Six photographs, one of which comes back as an {path, error} row.
        `done` must reach 6 — an error row consumed wall-clock exactly as a
        good row did, and a bar that counted only successes would stall at 5
        while the ETA quietly lied about the rest.

        And it must reach it BY MOVING: a watcher thread reads the job dict
        while the child is still talking, and at least one sample must land
        strictly between 0 and 6. A pass that buffered the whole run would
        satisfy every count above and fail this one.
        """
        self.use_stub(error_rows=[2], row_delay=0.08)
        targets = [self.picture("p%02d" % i) for i in range(6)]
        samples, locks_free, stop = [], [], threading.Event()
        thread = self.watcher(samples, locks_free, stop)
        seen = []
        try:
            result = server.run_vision_pass(
                str(self.library), targets,
                progress_cb=lambda d, t: seen.append((d, t)))
        finally:
            stop.set()
            thread.join(5)

        self.assertTrue(result["ok"], result.get("why"))
        self.assertEqual(result["report"]["attempted"], 6)
        self.assertEqual(result["report"]["ok"], 5)
        self.assertEqual(result["report"]["error"], 1)
        self.assertEqual(seen, [(i, 6) for i in range(1, 7)],
                         "once per ATTEMPTED picture, in order")
        with server.JOB_LOCK:
            self.assertEqual(server.VISION_JOB["done"], 6)
        mid = [n for n in samples if 0 < n < 6]
        self.assertTrue(mid, "the job dict never showed partial progress "
                             "from another thread — the rows were not "
                             "streamed, they were buffered (Pitfall 5). "
                             "samples: %r" % (samples,))

    def test_write_lock_not_held(self):
        """T-26.94-34: WRITE_LOCK across a twenty-minute run would freeze
        every other write in the room. Asserted by taking it from another
        thread while the stream is running — not by reading the source."""
        self.use_stub(row_delay=0.08)
        targets = [self.picture("p%02d" % i) for i in range(5)]
        samples, locks_free, stop = [], [], threading.Event()
        thread = self.watcher(samples, locks_free, stop)
        try:
            result = server.run_vision_pass(str(self.library), targets)
        finally:
            stop.set()
            thread.join(5)
        self.assertTrue(result["ok"], result.get("why"))
        self.assertTrue(locks_free, "the watcher never sampled")
        self.assertTrue(all(locks_free),
                        "WRITE_LOCK was held during the stream — %d of %d "
                        "samples blocked"
                        % (locks_free.count(False), len(locks_free)))

    # -- resumability (D-15) ----------------------------------------------

    def test_resumable_skips_current_fingerprint(self):
        """D-15. The first run reads three; the second is handed all three
        and reads NONE of them, because each carries this program's own
        fingerprint. That is what makes a twenty-minute one-way door
        restartable."""
        self.use_stub()
        targets = [self.picture("p%02d" % i) for i in range(3)]
        first = server.run_vision_pass(str(self.library), targets)
        self.assertEqual(first["report"]["attempted"], 3)
        self.assertEqual(first["report"]["skipped_cached"], 0)

        second = server.run_vision_pass(str(self.library), targets)
        self.assertTrue(second["ok"])
        self.assertEqual(second["report"]["skipped_cached"], 3)
        self.assertEqual(second["report"]["attempted"], 0)

    def test_progress_across_a_resume_counts_only_what_is_left(self):
        """⚠ THE BAR MUST BE HONEST ACROSS A RESUME (D-15). Read three of
        five, then hand all five back: `total` is 2 and `done` reaches 2.
        A resumed run that restarted at 0 of 5 would be counting work it is
        not going to do, and the ETA computed from it would be wrong by the
        same factor."""
        self.use_stub()
        targets = [self.picture("p%02d" % i) for i in range(5)]
        server.run_vision_pass(str(self.library), targets[:3])
        result = server.run_vision_pass(str(self.library), targets)
        self.assertEqual(result["report"]["skipped_cached"], 3)
        self.assertEqual(result["report"]["attempted"], 2)
        with server.JOB_LOCK:
            snap = dict(server.VISION_JOB)
        self.assertEqual((snap["state"], snap["total"], snap["done"]),
                         ("done", 2, 2),
                         "a resumed run's bar counts what is LEFT, and it "
                         "reaches its own total")

    def test_second_pass_spawns_nothing(self):
        """SRM-11's idempotency edge, proved rather than inferred: with
        Popen replaced by a function that raises, a second pass over a fully
        cached library must still return cleanly, report attempted 0, and
        leave every cache file byte-identical."""
        self.use_stub()
        targets = [self.picture("p%02d" % i) for i in range(3)]
        self.assertTrue(server.run_vision_pass(str(self.library),
                                               targets)["ok"])
        before = {}
        for item_id, _ in targets:
            before[item_id] = (
                study_lib.vision_entry_path(str(self.library),
                                            item_id).read_bytes(),
                study_lib.vision_print_path(str(self.library),
                                            item_id).read_bytes())

        def refuse(*args, **kwargs):
            raise AssertionError("a fully cached library must never spawn")

        saved = subprocess.Popen
        subprocess.Popen = refuse
        try:
            result = server.run_vision_pass(str(self.library), targets)
        finally:
            subprocess.Popen = saved
        self.assertTrue(result["ok"])
        self.assertEqual(result["report"]["attempted"], 0)
        self.assertEqual(result["report"]["skipped_cached"], 3)
        for item_id, _ in targets:
            self.assertEqual(
                (study_lib.vision_entry_path(str(self.library),
                                             item_id).read_bytes(),
                 study_lib.vision_print_path(str(self.library),
                                             item_id).read_bytes()),
                before[item_id], item_id + " changed on a no-op pass")

    def test_zero_eligible_paths_is_not_an_error(self):
        """SRM-11's empty edge: nothing to read is a calm done, never an
        alarm (law 3). No spawn, total 0, done 0, ok True."""
        def refuse(*args, **kwargs):
            raise AssertionError("an empty library must never spawn")

        saved = subprocess.Popen
        subprocess.Popen = refuse
        try:
            store = study_lib.load_store(str(self.library))
            result = server.vision_run_over_library(str(self.library), store)
        finally:
            subprocess.Popen = saved
        self.assertTrue(result["ok"])
        self.assertIsNone(result["why"])
        self.assertEqual(result["report"]["eligible"], 0)
        self.assertEqual(result["report"]["attempted"], 0)

    # -- the watchdog -----------------------------------------------------

    def test_stall_watchdog_kills_and_reports(self):
        """⚠ T-26.94-33, AND THE ONE BOUND Popen CANNOT GIVE FOR FREE.

        The stub emits two good rows and then sleeps holding stdout open.
        With the watchdog, the child is killed, the pass returns the one
        plain-words line, and THE TWO ROWS IT DID WRITE ARE STILL ON DISK —
        a bounded failure, not a lost run. Without it, `for line in
        proc.stdout` blocks until the stub's own sleep ends.

        VISION_STALL_S is lowered for this case only; its shipped value is
        asserted by name and by value in its own case above.
        """
        self.use_stub(stall_after=2, stall_for=30)
        targets = [self.picture("p%02d" % i) for i in range(5)]
        saved = server.VISION_STALL_S
        server.VISION_STALL_S = 1.0
        started = time.monotonic()
        try:
            result = server.run_vision_pass(str(self.library), targets)
        finally:
            server.VISION_STALL_S = saved
        elapsed = time.monotonic() - started

        self.assertFalse(result["ok"])
        self.assertEqual(result["why"], server.VISION_ERROR_MSG)
        self.assertNotIn("Traceback", result["why"])
        self.assertLess(elapsed, 20,
                        "the watchdog did not fire — the pass waited on a "
                        "wedged child for %.1fs" % elapsed)
        self.assertEqual(result["report"]["attempted"], 2)
        for item_id, _ in targets[:2]:
            self.assertTrue(
                study_lib.vision_entry_path(str(self.library),
                                            item_id).is_file(),
                item_id + "'s reading was lost when the child was killed")
        with server.JOB_LOCK:
            self.assertEqual(server.VISION_JOB["state"], "error")

    def test_drill_without_the_watchdog_a_wedged_child_is_waited_on(self):
        """⚠ THE WATCHDOG, SEEN NOT FIRING — a gate never seen red is not
        evidence. threading.Timer is replaced by one that never fires, and
        the same stall is observed to hold the pass for the child's whole
        sleep instead of ending it. The control runs in the same case."""
        class DeadTimer(object):
            def __init__(self, interval, fn):
                pass

            def start(self):
                pass

            def cancel(self):
                pass

        self.use_stub(stall_after=1, stall_for=3)
        targets = [self.picture("p%02d" % i) for i in range(3)]
        saved_stall = server.VISION_STALL_S
        saved_timer = threading.Timer
        server.VISION_STALL_S = 0.3

        # MUTATED: the watchdog cannot fire.
        threading.Timer = DeadTimer
        try:
            started = time.monotonic()
            mutated = server.run_vision_pass(str(self.library), targets)
            mutated_elapsed = time.monotonic() - started
        finally:
            threading.Timer = saved_timer
        self.assertGreater(mutated_elapsed, 2.5,
                           "the mutation did not reproduce the hang, so the "
                           "control below measures nothing")
        self.assertTrue(mutated["ok"],
                        "without the watchdog the wedge is simply waited "
                        "out and reported as a finished pass")

        # CONTROL: the shipped code, same stall, ends promptly and loudly.
        for item_id, _ in targets:
            study_lib.vision_forget(str(self.library), item_id)
        try:
            started = time.monotonic()
            control = server.run_vision_pass(str(self.library), targets)
            control_elapsed = time.monotonic() - started
        finally:
            server.VISION_STALL_S = saved_stall
        self.assertFalse(control["ok"])
        self.assertLess(control_elapsed, mutated_elapsed,
                        "the shipped watchdog must end the wedge sooner "
                        "than waiting it out")

    # -- A3: the fence, re-derived when the run ends -----------------------

    def test_the_fence_is_re_derived_when_the_run_ends(self):
        """⚠⚠ A3, CLOSED HERE. 26.94-04 recorded the window and handed it on:
        `vision_forget` is idempotent, so write-then-forget always ends in an
        absence — but forget-then-write does not. A photograph she fences
        WHILE the pass is in flight can have its reading land afterwards, and
        law 5 calls a never-list leak a P0.

        Constructed exactly that way: two photographs are eligible when the
        list is derived; her judgement lands on the second one DURING the
        stream; and the end-of-run re-derivation must take that reading off
        disk. Counted, not merely done.
        """
        self.use_stub()
        aa = self.picture("aa11")
        bb = self.picture("bb22")

        def judge(done, total):
            # her tap, landing mid-run — after the derivation that let bb22
            # through, and before the pass has finished writing.
            if done == 1:
                self.fence("bb22")

        store = study_lib.load_store(str(self.library))
        result = server.vision_run_over_library(
            str(self.library), store, progress_cb=judge)

        self.assertTrue(result["ok"], result.get("why"))
        self.assertEqual(result["report"]["eligible"], 2,
                         "both were eligible when the list was derived")
        self.assertEqual(result["report"]["fenced"], 0)
        self.assertEqual(result["report"]["fenced_now"], 1,
                         "one photograph became fenced while the pass ran")
        self.assertEqual(result["report"]["swept_files"], 2,
                         "its two cache files must be counted out loud")
        self.assertFalse(
            study_lib.vision_entry_path(str(self.library),
                                        bb[0]).exists(),
            "a fenced photograph's WORDS are still on disk (D-05, law 5 P0)")
        self.assertFalse(
            study_lib.vision_print_path(str(self.library), bb[0]).exists())
        self.assertTrue(
            study_lib.vision_entry_path(str(self.library), aa[0]).is_file(),
            "the sweep took a reading nobody fenced")

    def test_drill_without_the_end_of_run_sweep_the_reading_survives(self):
        """⚠ A3's gate, SEEN RED. The sweep is replaced by a no-op and the
        same scenario is re-run: bb22's reading stays on disk. The control —
        the shipped sweep, same scenario — runs in the same case."""
        self.use_stub()
        self.picture("aa11")
        bb = self.picture("bb22")

        def judge(done, total):
            if done == 1:
                self.fence("bb22")

        saved = server.vision_sweep_fenced
        server.vision_sweep_fenced = (
            lambda root, store: {"fenced_now": 0, "swept_files": 0})
        try:
            store = study_lib.load_store(str(self.library))
            mutated = server.vision_run_over_library(
                str(self.library), store, progress_cb=judge)
        finally:
            server.vision_sweep_fenced = saved
        self.assertEqual(mutated["report"]["swept_files"], 0)
        self.assertTrue(
            study_lib.vision_entry_path(str(self.library), bb[0]).is_file(),
            "the mutation did not reproduce the leak, so the control below "
            "measures nothing")

        # CONTROL: the shipped sweep takes it.
        store = study_lib.load_store(str(self.library))
        control = server.vision_sweep_fenced(str(self.library), store)
        self.assertEqual(control["swept_files"], 2)
        self.assertFalse(
            study_lib.vision_entry_path(str(self.library), bb[0]).exists())

    def test_the_sweep_reads_the_store_fresh_not_the_snapshot(self):
        """The whole window is a judgement made DURING the run, so a sweep
        driven by the STARTING snapshot would sweep nothing while reporting
        success. Asserted by handing a snapshot in which bb22 is not fenced
        and fencing it on disk before the run ends."""
        self.use_stub()
        self.picture("aa11")
        bb = self.picture("bb22")
        stale = study_lib.load_store(str(self.library))
        self.assertEqual(study_lib.vision_fenced_ids(stale), [])

        def judge(done, total):
            if done == 1:
                self.fence("bb22")

        result = server.vision_run_over_library(
            str(self.library), stale, progress_cb=judge)
        self.assertEqual(result["report"]["fenced_now"], 1)
        self.assertFalse(
            study_lib.vision_print_path(str(self.library), bb[0]).exists())

    def test_the_sweep_runs_after_a_FAILED_pass_too(self):
        """A pass that stalled wrote rows on its way to failing, and a row
        that landed after a forget is no less on disk for the run having
        ended badly."""
        self.use_stub(stall_after=1, stall_for=20)
        self.picture("aa11")
        bb = self.picture("bb22")
        # aa11 sorts first, so the one row that lands is aa11's; fence it,
        # and the failed run must still sweep it.
        saved = server.VISION_STALL_S
        server.VISION_STALL_S = 1.0

        def judge(done, total):
            self.fence("aa11")

        try:
            store = study_lib.load_store(str(self.library))
            result = server.vision_run_over_library(
                str(self.library), store, progress_cb=judge)
        finally:
            server.VISION_STALL_S = saved
        self.assertFalse(result["ok"])
        self.assertEqual(result["report"]["fenced_now"], 1)
        self.assertFalse(
            study_lib.vision_entry_path(str(self.library), "aa11").exists(),
            "a failed run left a fenced photograph's reading on disk")
        self.assertIsNotNone(bb)

    def test_vision_fenced_ids_calls_the_shipped_predicate(self):
        """The five classes, through the SHIPPED fence and never a copy —
        the vision_path_list discipline, one function over."""
        self.picture("aa11")
        self.picture("bb22", state="never_show")
        self.picture("cc33", state="retired")
        store = study_lib.load_store(str(self.library))
        store["items"]["dd44"] = {"id": "dd44", "type": "image",
                                  "state": "blessed", "trigger": True,
                                  "library_path": "items/dd44.png"}
        store["items"]["ee55"] = {"id": "ee55", "type": "text",
                                  "state": "never_show",
                                  "library_path": "items/ee55.md"}
        self.assertEqual(study_lib.vision_fenced_ids(store),
                         ["bb22", "cc33", "dd44"],
                         "never_show, retired and the trigger overlay — and "
                         "a note is not a photograph")

    # -- the flag on the room ---------------------------------------------

    def test_the_vision_pass_flag_starts_no_server(self):
        """`--vision-pass` is a FLAG ON THE ROOM, not a second script. Its
        help exits 0 and binds no socket; its dry run reports the derivation
        by reason and reads nothing."""
        self.assertEqual(server.run_vision_pass_cli(["--vision-pass",
                                                     "--help"]), 0)

        self.picture("aa11")
        self.picture("bb22", state="never_show")
        buf = io.StringIO()
        saved = sys.stdout
        sys.stdout = buf

        def refuse(*args, **kwargs):
            raise AssertionError("a dry run must never spawn")

        saved_popen = subprocess.Popen
        subprocess.Popen = refuse
        try:
            rc = server.run_vision_pass_cli(
                ["--vision-pass", "--library", str(self.library),
                 "--dry-run"])
        finally:
            sys.stdout = saved
            subprocess.Popen = saved_popen
        out = buf.getvalue()
        self.assertEqual(rc, 0)
        self.assertIn("eligible       1", out)
        self.assertIn("fenced         1", out)

    def test_the_vision_pass_flag_runs_the_whole_pass(self):
        """The same entry point the import's fourth stage uses — one call
        site, so the sweep cannot be present at one and missing at the
        other."""
        self.use_stub()
        self.picture("aa11")
        self.picture("bb22")
        buf = io.StringIO()
        saved = sys.stdout
        sys.stdout = buf
        try:
            rc = server.run_vision_pass_cli(
                ["--vision-pass", "--library", str(self.library)])
        finally:
            sys.stdout = saved
        out = buf.getvalue()
        self.assertEqual(rc, 0, out)
        self.assertIn("attempted      2", out)
        self.assertIn("swept_files    0", out)
        self.assertTrue(
            study_lib.vision_entry_path(str(self.library), "aa11").is_file())


if __name__ == "__main__":
    unittest.main()
