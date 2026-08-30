---
name: visualroom-update
description: >-
  Replace the Study Room app folder using tools/update_room.py. Use when the
  user asks to update, replace, or refresh the Study Room app folder — on any
  coding agent (Cursor, Claude Code, Codex, etc.).
---

# Visual Room Update

Orchestrate `tools/update_room.py` only — do not duplicate replace logic.

Works on **any** coding agent. Bundled in every download under `skills/` —
install once with `python3 tools/install_agent_skills.py` (see
`skills/README.md`).

## When to use

- User asks to update, replace, or refresh the Study Room app folder
- User downloaded a newer release but has not replaced the live folder yet
- User pasted the in-app agent prompt about `update_room.py`

## Preconditions

1. Confirm the Study Room server is **not running** before a full folder replace
   (`python3 server.py` must be stopped).
2. Locate the downloaded or extracted app tree on disk. Ask the user for paths
   if not obvious.
3. The source tree must contain `LATEST_RELEASE_DATE` (and matching
   `RELEASE_DATE` for a full replace).

## Workflow

### A. Downloaded but not replaced yet (old app still running)

```bash
python3 tools/update_room.py --sync-latest-only --source DOWNLOADED_TREE
```

- Updates `~/.study-room/latest_release_date` without touching the live folder.
- Tell the user to restart `python3 server.py` so the behind-latest prompt can appear.

### B. Full folder replace

```bash
python3 tools/update_room.py --source NEW_TREE --dest CURRENT
```

- Backs up a non-empty destination, copies the tree (skipping `.git`), refreshes
  the latest pointer.
- Then: `python3 server.py` from the live app folder.

## Rules

- **No duplicate logic** — only shell out to `tools/update_room.py`.
- **No network fetch** — user already downloaded the release.
- **No private repo push** — never `git push` the private checkout.
- **No in-app updater** — external terminal workflow only.

## Dry run

```bash
python3 tools/update_room.py --dry-run --sync-latest-only --source DOWNLOADED_TREE
python3 tools/update_room.py --dry-run --source NEW_TREE --dest CURRENT
```
