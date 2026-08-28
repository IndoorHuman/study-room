#!/usr/bin/env python3
"""law-1 (pull-only) source guard for the ADAPTER TIER (Phase 26.65, Plan 01;
widened to every adapter module in 26.97-01).

Law 1 is absolute: the collect runs ONLY on an explicit user gesture (the
candle tap / onboarding button -> POST /api/adapter/collect). No scheduler,
timer, interval, or poll loop may exist in ANY adapter module or in the collect
route (D-01). This suite reads those sources as TEXT and asserts a
locally-defined forbidden-identifier set never appears in their code lines.

WIDENED 2026-08-18 (26.97-01). The adapter case used to name ONE FILE —
`adapters/apple_notes.py` — so `adapters/apple_photos.py` was unguarded the
whole time it has shipped, and every adapter added later would have arrived
unguarded too. It now iterates the adapters directory, so a module added in a
later phase is scanned WITHOUT a test edit. The scope widened; the FORBIDDEN
tuple did NOT change and must never be softened to make a red go green — if
this gate fires, fix the adapter.

⚠ `__init__.py` IS DELIBERATELY EXCLUDED, and the exclusion was measured, not
assumed: that file is twelve lines and ALL TWELVE are the package docstring —
it carries no executable statement at all — and the docstring says "No
scheduler/timer/poll construct lives here", i.e. the law's own name in prose.
`_strip_comment_lines` drops `#` lines, not docstrings, so including it would
pin a permanent red on a sentence that states the rule being enforced. Anything
that ever becomes executable in the package dunder belongs in a real module.

A one-shot worker thread started BY the explicit POST (the shipped importer's
own pattern) is NOT a background-run construct — it runs because the user
asked, and finishes once. What law 1 forbids is a clock/scheduler/poll that
acts WITHOUT the user asking; those are the identifiers pinned below.

Comment lines (`#`-prefixed) are stripped before the check so an explanatory
comment naming a forbidden construct can never trip the gate (grep-gate
hygiene) — the forbidden literals live ONLY in this test's own set.

Stdlib only (unittest) — zero-dependency law (law 8).
"""
import re
import sys
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# The forbidden scheduler/timer/interval/poll/background-run identifiers. Kept
# HERE only — the target sources must not contain any of these in code.
FORBIDDEN = (
    "Timer",          # threading.Timer / any timer object
    "sched",          # sched.scheduler / apscheduler / "schedule"
    "apscheduler",
    "crontab",
    "cron",
    "launchd",
    "setInterval",
    "setinterval",
    "setTimeout",
    "settimeout",
    "while True",     # a poll loop
    "watchdog",
    "Observer",       # watchdog.observers.Observer
    "fswatch",
    "kqueue",
)


def _strip_comment_lines(src: str) -> str:
    """Drop whole-line `#` comments so a forbidden word inside an explanatory
    comment never trips the gate (only executable code is inspected)."""
    kept = []
    for line in src.splitlines():
        if line.lstrip().startswith("#"):
            continue
        kept.append(line)
    return "\n".join(kept)


def _method_source(module_src: str, name: str) -> str:
    """Slice a single `def <name>(...)` method body out of a module's text,
    from its `def` line to the next same-or-shallower `def`/`class`."""
    lines = module_src.splitlines()
    start = None
    indent = 0
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*)def\s+" + re.escape(name) + r"\b", line)
        if m:
            start = i
            indent = len(m.group(1))
            break
    if start is None:
        return ""
    end = len(lines)
    for j in range(start + 1, len(lines)):
        m = re.match(r"^(\s*)(def|class)\s+", lines[j])
        if m and len(m.group(1)) <= indent:
            end = j
            break
    return "\n".join(lines[start:end])


def _adapter_modules():
    """Every module under `adapters/` that law 1 binds, sorted by name.

    Directory-driven ON PURPOSE (26.97-01): a module added by a later phase is
    scanned without anybody remembering to edit this file. `glob` is
    NON-RECURSIVE, so `__pycache__/` is never descended into; the dunder
    package module is excluded for the reason in this module's docstring.
    """
    return sorted(
        p for p in (_REPO_ROOT / "adapters").glob("*.py")
        if p.is_file() and not p.name.startswith("__")
    )


class TestNoDaemonInAdapter(unittest.TestCase):
    """EVERY adapter module carries no scheduler/timer/poll construct."""

    def test_every_adapter_module_has_no_scheduler(self):
        modules = _adapter_modules()

        # The scan record, printed so a run can be read back afterwards. The
        # byte count is the evidence that each file was OPENED AND READ, not
        # merely listed — a mutation planted in a file that was never read
        # looks exactly like a passing control (26.97-01 drill, property 2).
        sources = {}
        for path in modules:
            text = path.read_text(encoding="utf-8")
            sources[path.name] = text
        print("SCANNED %d adapter module(s): %s" % (
            len(modules),
            " ".join("%s(%dB)" % (n, len(s)) for n, s in
                     sorted(sources.items()))))

        # ⚠ BY VALUE, never by length alone. A glob that matched nothing would
        # satisfy the loop below vacuously, so the scanned SET is pinned: at
        # least two modules, and both shipped adapters by name. apple_photos.py
        # is named because it is the module the old one-filename case could
        # never see — this assertion is the whole point of the widening.
        scanned = sorted(sources)
        self.assertGreaterEqual(
            len(scanned), 2,
            "law 1: the adapter scan found %d module(s) (%s) — a glob that "
            "matches nothing passes vacuously" % (len(scanned), scanned))
        for expected in ("apple_notes.py", "apple_photos.py"):
            self.assertIn(
                expected, scanned,
                "law 1: %s is not in the scanned set %s — the gate is not "
                "seeing the adapter tier" % (expected, scanned))

        for name in scanned:
            code = _strip_comment_lines(sources[name])
            for token in FORBIDDEN:
                self.assertNotIn(
                    token, code,
                    f"law 1: '{token}' must not appear in adapters/{name}")


class TestNoDaemonInRoute(unittest.TestCase):
    """The collect route/worker carries no scheduler/timer/poll construct."""

    def test_collect_handler_has_no_scheduler(self):
        server_src = (_REPO_ROOT / "server.py").read_text(encoding="utf-8")
        handler = _method_source(server_src, "handle_adapter_collect")
        self.assertTrue(handler,
                        "handle_adapter_collect must exist in server.py")
        code = _strip_comment_lines(handler)
        for token in FORBIDDEN:
            self.assertNotIn(
                token, code,
                f"law 1: '{token}' must not appear in handle_adapter_collect")


if __name__ == "__main__":
    unittest.main()
