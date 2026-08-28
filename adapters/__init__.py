"""Local import adapters (Phase 26.65).

Source FRONT-ENDS only: each adapter turns a macOS local source (Apple Notes,
Apple Photos) into a folder the shipped importer already ingests (D-03). An
adapter's job ends at "content is staged in a folder" — study_lib.import_folder
is CALLED, never forked (SRM-08). Adding a source never touches room or
importer code.

Zero new runtime dependencies (law 8): osascript (a macOS built-in) plus the
Python stdlib only. No scheduler/timer/poll construct lives here — a collect
runs solely on an explicit user gesture (law 1, D-01).
"""
