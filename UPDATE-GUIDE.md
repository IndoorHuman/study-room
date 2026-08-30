# updating the study room: replace the folder, keep your library

<!-- OWNER_COPY_GUIDE_DAILY_CHECK -->
if you said yes to the room's one question, the room asks GitHub once a day,
when it opens, whether a newer version exists. that request carries nothing of
yours. if you said no, or never answered, the room makes no request at all.
you can change the answer any time on the Manage screen. either way, you can
always update by hand with the terminal steps below. your library folder and
everything in `~/.study-room/` stay put through every update.

## what survives a folder replace

| stays | goes |
|-------|------|
| your library folder (e.g. `~/StudyRoom/`) | the app folder you replace |
| `~/.study-room/library.json` (pointer) | old app code |
| `~/.study-room/last_run_version` | |
| `~/.study-room/latest_release_date` | |

only replace the **app folder**. never delete or move your library folder.

## the update button (in the room)

<!-- OWNER_COPY_GUIDE_UPDATE_BUTTON -->
when a newer version exists, the line under the toolbar offers an Update
button. one tap downloads the newest release, keeps your current app folder
beside it as a dated backup (`study-room.update-backup-YYYYMMDDTHHMMSSZ/`),
swaps the new folder into place, and brings the room back in the same
terminal window you started it from. nothing happens until you tap.

<!-- OWNER_COPY_GUIDE_FAILED_INSTALL -->
if the install cannot finish, the room says so in one short line and nothing
changes: the old copy is still in place, untouched, and the terminal steps
below always work.

## the default path (terminal; any computer, no AI required)

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

restart `python3 server.py`; the room may show a behind-latest prompt under
the toolbar (it compares two files on your computer).

## the power path (any coding agent, optional)

Every download includes `skills/visualroom-update/` and a one-command installer:

```bash
python3 tools/install_agent_skills.py
```

That copies the skill into Cursor, Claude Code, and Codex skill folders (see
`skills/README.md`). Then ask your agent to **update the Study Room**; it
should run `tools/update_room.py` only (never reimplement the copy, never
push git; the skill's own rules keep it off the network).

If you prefer not to install the skill, paste this (fill in your paths):

> Update my Study Room: quit server.py first, then run
> `python3 tools/update_room.py --source [downloaded folder] --dest [live app folder]`.

## going back

<!-- OWNER_COPY_GUIDE_GOING_BACK -->
if something goes wrong after an update, quit the room and bring back the
dated backup folder (`study-room.update-backup-…`): the backup is the undo.
older and newer versions both read your library, in both directions, with no
exceptions, so going back is safe. your library is still where you left it.

## two copies on one computer

<!-- OWNER_COPY_GUIDE_SHARED_HOME -->
every copy of the app on this computer shares the same `~/.study-room/` home,
so the daily-check answer is shared too: a no in one copy is a no for the
other. the newest-version pointer is shared the same way.

## about the backups

<!-- OWNER_COPY_GUIDE_BACKUPS -->
the dated backups sit beside the app folder and are never deleted by the
room; you may delete them by hand once you are happy with a new version. if
you got the app with `git clone`, the `.git` folder rides into the backup on
an in-app update; the backup keeps your clone intact.

## what changed in this version

after a real upgrade, the room may show **once**: “See what changed in this
update.” read `WHATS_NEW.md` inside the app folder for the release note.
