# The Study Room

thank you for using this app I have built, it is an open source app, which it means you have 100% freedom to change it and run it however you like but I cannot provide any kind of support

## Where to start

- See how the visual room works → [open the demo room](https://indoorhuman.github.io/mansfield-room-demo/room/)
- Understand what the product is → [read the walkthrough](https://indoorhuman.github.io/mansfield-room-demo/)
- See how setup works on day one → [what the first day looks like, step by step](https://indoorhuman.github.io/mansfield-room-demo/start/)
- [Watch the two-minute film](https://indoorhuman.github.io/mansfield-room-demo/film.mp4), from an empty computer to the Study Room on your machine, with your own writing coming back a few pieces at a time. No voice; captions only.

## First run

1. Get a copy: download the latest **Release** from this GitHub page and unzip it, or clone the repository.
2. From the app folder, start the room:

   ```bash
   python3 server.py
   ```

   Then open http://127.0.0.1:8747 in your browser.
3. Optional: set up a librarian (a key you bring, or a model on your own machine):

   ```bash
   python3 server.py --setup
   ```

   See **`LIBRARIAN.md`** for what leaves your machine, what stays local, and what it can cost.
4. Bring your notes and photos in; see **`IMPORT-GUIDE.md`**.

5. Optional: install the bundled coding-agent skill (Cursor, Claude Code, etc.):

   ```bash
   python3 tools/install_agent_skills.py
   ```

   The skill ships inside every download at `skills/visualroom-update/`. See
   **`skills/README.md`**.

Your library lives in its own folder (outside this app folder). Setup writes keys only under `~/.study-room/`, readable only by you.

<!-- BEGIN UPDATE SECTION -->

## Update

The app never checks online for updates. When a newer release exists, download
it and replace the app folder. Your library folder stays unchanged.

<!-- OWNER_COPY_UPDATE_NEWEST_DATE -->
2026-08-30

<!-- OWNER_COPY_UPDATE_WHATS_NEW -->
The room says things more plainly now: no dashes in anything it tells you.

An import can be fully stopped while it is running; everything sorted so far is kept.

Every download now includes the coding-agent update skill, with a one-command installer (`python3 tools/install_agent_skills.py`).

Smaller: the Photos export root follows your account home, room copies of your notes carry tidier front matter, and there is a builder for the Mansfield demo library.

<!-- OWNER_COPY_UPDATE_DOWNLOAD -->
Download the latest release from GitHub and unzip it.

<!-- OWNER_COPY_UPDATE_STEPS -->
1. Quit the Study Room (`Ctrl+C` in the terminal running `python3 server.py`).
2. Replace the app folder (not your library folder):

   ```bash
   python3 tools/update_room.py --source ~/Downloads/study-room --dest ~/study-room
   ```

3. Start again: `python3 server.py`

See **`UPDATE-GUIDE.md`** for the full walkthrough, going back, and the
optional coding-agent path (skill included in every download).

<!-- OWNER_COPY_UPDATE_SKILL -->
Coding-agent skill (included; install once): `python3 tools/install_agent_skills.py`

<!-- OWNER_COPY_UPDATE_REPLACE_WARNING -->
Only replace the app folder. Do not delete or move your library folder.

<!-- OWNER_COPY_UPDATE_GOING_BACK -->
If something goes wrong, quit and open your backup folder
(`study-room.update-backup-…`) or the previous app folder. Your library is
still where you left it.

<!-- END UPDATE SECTION -->
