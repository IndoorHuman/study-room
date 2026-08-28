# updating the study room — replace the folder, keep your library

the app **never** checks online for updates and has **no** built-in updater.
when a newer release exists, you download it yourself and replace the app
folder. your library folder and everything in `~/.study-room/` stay put.

## what survives a folder replace

| stays | goes |
|-------|------|
| your library folder (e.g. `~/StudyRoom/`) | the app folder you replace |
| `~/.study-room/library.json` (pointer) | old app code |
| `~/.study-room/last_run_version` | |
| `~/.study-room/latest_release_date` | |

only replace the **app folder**. never delete or move your library folder.

## the default path (terminal — any computer, no AI required)

1. **download** the latest release from GitHub and unzip it.
2. **quit** the study room (`Ctrl+C` in the terminal running `python3 server.py`).
3. **replace** the app folder:

   ```bash
   python3 tools/update_room.py \
     --source ~/Downloads/study-room \
     --dest ~/study-room
   ```

   swap the paths for where you unzipped the new copy and where your live
   app folder lives.

4. **start again:**

   ```bash
   cd ~/study-room
   python3 server.py
   ```

the tool backs up a non-empty destination to
`study-room.update-backup-YYYYMMDDTHHMMSSZ/` before copying.

## optional: see the “newer version ready” line before you replace

if the old app is still running and you already downloaded the new tree,
you can refresh the local “latest release” pointer without replacing yet:

```bash
python3 tools/update_room.py --sync-latest-only --source ~/Downloads/study-room
```

restart `python3 server.py` — the room may show a behind-latest prompt under
the toolbar (local file compare only; no network).

## the power path (any coding agent — optional)

if you use Claude Code, Cursor, Codex, Windsurf, or any other coding agent,
paste this (fill in your paths):

> Update my Study Room: quit server.py first, then run
> `python3 tools/update_room.py --source [downloaded folder] --dest [live app folder]`.

the agent should run `tools/update_room.py` only — never reimplement the
copy steps, never push git, never fetch from the network.

### optional agent skill (Cursor, Claude Code, etc.)

a portable skill lives in `skills/visualroom-update/SKILL.md` in this repo.
copy or symlink it into your agent’s skills folder — see `skills/README.md`
for install paths. slash-command names differ by tool; the skill file works
the same everywhere because it only documents the CLI above.

## going back

if something goes wrong after a replace, quit and open your backup folder
(`study-room.update-backup-…`) or the previous app folder you kept aside.
your library is still where you left it.

## what changed in this version

after a real upgrade, the room may show **once**: “See what changed in this
update.” read `WHATS_NEW.md` inside the app folder for the release note.
