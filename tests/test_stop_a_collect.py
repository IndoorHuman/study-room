"""A RUNNING COLLECT/IMPORT CAN BE STOPPED — 26.997 owner ask 2026-08-28.

Precedent: tests/test_stop_a_sort.py (librarian presort stop).

⭐ HER BUTTON WORDS, verbatim: "fully stop the import".
⛔ No new front-facing stopped sentence — jobs flip to "stopped", message
stays None; the client frees REPULL and clears the panel.

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_stop_a_collect.py`
"""

import contextlib
import inspect
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import server          # noqa: E402
import study_lib       # noqa: E402

APP = REPO_ROOT / "app.js"
HER_BUTTON_VAR = "COLLECT_STOP_COPY"


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-stop-collect-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if not resolved.startswith(str(Path(tmp).resolve()) + os.sep) \
                and not resolved.startswith(tmp + os.sep):
            raise AssertionError(
                "the room's config directory resolved OUTSIDE the temporary "
                "home — refusing to run rather than write anywhere near a "
                "real one")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


@contextlib.contextmanager
def clean_collect_jobs():
    """Module job dicts + collect stop flag, restored afterwards."""
    saved_exp = dict(server.EXPORT_JOB)
    saved_imp = dict(server.IMPORT_JOB)
    stop_was = server._COLLECT_STOP.is_set()
    server._COLLECT_STOP.clear()
    try:
        yield
    finally:
        server.EXPORT_JOB.clear()
        server.EXPORT_JOB.update(saved_exp)
        server.IMPORT_JOB.clear()
        server.IMPORT_JOB.update(saved_imp)
        (server._COLLECT_STOP.set() if stop_was
         else server._COLLECT_STOP.clear())


class Fake(object):
    def __init__(self):
        self.answer = None
        self.code = None

    def json_response(self, data, code=200):
        self.answer = data
        self.code = code
        return data

    def json_error(self, code, msg):
        return self.json_response({"ok": False, "error": msg}, code=code)


def stop_route():
    fn = getattr(server.StudyHandler, "handle_adapter_collect_stop", None)
    if fn is None:
        raise AssertionError(
            "server.StudyHandler.handle_adapter_collect_stop does not exist")
    fake = Fake()
    fn(fake, {})
    return fake


def app_constant(name):
    src = APP.read_text(encoding="utf-8")
    marker = "var %s = '" % (name,)
    at = src.find(marker)
    if at == -1:
        raise AssertionError("app.js has no `%s`" % (name,))
    i = at + len(marker)
    out = []
    while i < len(src):
        ch = src[i]
        if ch == "\\":
            out.append(src[i + 1])
            i += 2
            continue
        if ch == "'":
            break
        out.append(ch)
        i += 1
    value = "".join(out)
    if not value:
        raise AssertionError("`%s` is EMPTY in app.js" % (name,))
    return value


def app_literal_raw(name):
    src = APP.read_text(encoding="utf-8")
    marker = "var %s = '" % (name,)
    at = src.find(marker)
    if at == -1:
        raise AssertionError("app.js has no `%s`" % (name,))
    i = at + len(marker)
    start = i
    while i < len(src):
        if src[i] == "\\":
            i += 2
            continue
        if src[i] == "'":
            break
        i += 1
    return src[start:i]


def stripped_source_of(fn):
    src = inspect.getsource(fn)
    out = []
    i = 0
    while i < len(src):
        ch = src[i]
        if ch == "#":
            while i < len(src) and src[i] != "\n":
                i += 1
            continue
        if src.startswith('"""', i) or src.startswith("'''", i):
            quote = src[i:i + 3]
            end = src.find(quote, i + 3)
            i = len(src) if end == -1 else end + 3
            continue
        if ch in "\"'":
            i += 1
            while i < len(src) and src[i] != ch:
                i += 2 if src[i] == "\\" else 1
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


class StopACollectTest(unittest.TestCase):

    def test_the_stop_is_registered_in_the_dispatch(self):
        post = stripped_source_of(server.StudyHandler.do_POST)
        self.assertIn(
            "handle_adapter_collect_stop", post,
            "no POST route dispatches to collect stop")

    def test_nothing_running_is_not_an_error(self):
        with clean_collect_jobs():
            server.EXPORT_JOB.update(state="idle")
            server.IMPORT_JOB.update(state="idle")
            fake = stop_route()
            self.assertEqual(fake.code, 200)
            self.assertEqual(fake.answer, {"ok": True, "stopping": False})
            self.assertFalse(server._COLLECT_STOP.is_set())

    def test_a_running_export_flips_to_stopped_at_the_route(self):
        with clean_collect_jobs():
            server.EXPORT_JOB.update(state="running", message="keep-me-out")
            server.IMPORT_JOB.update(state="idle")
            fake = stop_route()
            self.assertEqual(fake.answer, {"ok": True, "stopping": True})
            self.assertTrue(server._COLLECT_STOP.is_set())
            self.assertEqual(server.EXPORT_JOB["state"], "stopped")
            self.assertIsNone(server.EXPORT_JOB["message"],
                              "no agent-drafted stopped sentence on the wire")

    def test_a_running_import_flips_to_stopped_at_the_route(self):
        with clean_collect_jobs():
            server.EXPORT_JOB.update(state="done")
            server.IMPORT_JOB.update(state="running", message="keep-me-out")
            fake = stop_route()
            self.assertEqual(fake.answer, {"ok": True, "stopping": True})
            self.assertTrue(server._COLLECT_STOP.is_set())
            self.assertEqual(server.IMPORT_JOB["state"], "stopped")
            self.assertIsNone(server.IMPORT_JOB["message"])

    def test_starting_a_collect_clears_a_stale_stop(self):
        code = stripped_source_of(server.StudyHandler.handle_adapter_collect)
        self.assertIn("_COLLECT_STOP.clear()", code,
                      "a start does not clear a stale stop flag")

    def test_import_folder_should_stop_on_every_unit_bump(self):
        """D-03 additive: both the refresh-continue bump and the main loop
        bump call should_stop when given."""
        src = inspect.getsource(study_lib.import_folder)
        # Strip comments so a docstring naming should_stop cannot satisfy.
        code = stripped_source_of(study_lib.import_folder)
        self.assertGreaterEqual(
            code.count("should_stop()"), 2,
            "should_stop must fire on every unit bump, not only refresh")

    def test_should_stop_aborts_import_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "source"
            src.mkdir()
            (src / "a.md").write_bytes(b"# a\n")
            (src / "b.md").write_bytes(b"# b\n")
            (src / "c.md").write_bytes(b"# c\n")
            lib = root / "library"
            hits = []

            class StopNow(Exception):
                pass

            def should_stop():
                hits.append(1)
                if len(hits) >= 2:
                    raise StopNow()

            with self.assertRaises(StopNow):
                study_lib.import_folder(src, lib, should_stop=should_stop)
            self.assertGreaterEqual(len(hits), 2)

    def test_her_button_sentence_is_exactly_one_literal_in_app_js(self):
        sentence = app_constant(HER_BUTTON_VAR)
        raw = app_literal_raw(HER_BUTTON_VAR)
        src = APP.read_text(encoding="utf-8")
        self.assertEqual(sentence, "fully stop the import")
        self.assertEqual(
            src.count(raw), 1,
            "her stop sentence appears %d times in app.js" % (src.count(raw),))

    def test_the_stop_route_is_reached_by_the_button_she_presses(self):
        src = APP.read_text(encoding="utf-8")
        self.assertIn("collect-stop", src)
        self.assertIn("stopCollectImport", src)
        self.assertIn("/api/adapter/collect/stop", src)
        self.assertIn("freeCollectAfterStop", src,
                      "stopped job state must free REPULL without a scare")

    def test_no_agent_drafted_stopped_prose_on_collect_stop(self):
        """⛔ message stays None on her stop — no new calm sentence."""
        with clean_collect_jobs():
            server.EXPORT_JOB.update(state="running",
                                     message="would-be-scare")
            server.IMPORT_JOB.update(state="running",
                                     message="would-be-scare")
            stop_route()
            self.assertIsNone(server.EXPORT_JOB["message"])
            self.assertIsNone(server.IMPORT_JOB["message"])
            # And the handler must not name a *_MSG constant for this path.
            src = inspect.getsource(
                server.StudyHandler.handle_adapter_collect_stop)
            self.assertNotRegex(
                src, r'[A-Z_]*MSG[A-Z_]*',
                "collect stop must not invent or reuse a calm *_MSG sentence")


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    print("CASES", result.testsRun)
    print("HER BUTTON", json.dumps(app_constant(HER_BUTTON_VAR)))
    if result.wasSuccessful():
        print("test_stop_a_collect OK")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
