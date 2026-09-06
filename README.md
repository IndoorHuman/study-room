# The Study Room

A small visual room that sits on top of your notes and brings your old writing back to you, a few pieces at a time. You point it at your notes folder (an Obsidian vault works as it is), and each time you walk in, a few old pieces are waiting on the shelf, shown exactly as you wrote them. The slow pace is the design.

You need a computer and a terminal to run it. It is free and open source, and nothing you bring in leaves your machine. What it costs is hours, not money: bringing everything in and sorting can take an evening, or longer than a day, and I cannot tell you which until it is in it. Writing comes in first; pictures are much slower.

It is the first room of a visual home I am building for myself; the kitchen is next.

Things to know before you start:

- For reflections you need a model on your own machine or an OpenAI or Anthropic key. If a paid AI key already sits in your setup, the room will use it silently, so check that first.
- The Notes and Photos import doors are Mac-only for now. On Windows you point it at your vault folder.
- If you quit in the middle of a long picture import, that work is lost. Making an interrupted import survivable is the first thing I plan to build after launch.
- Sometimes it goes quiet and looks stuck. It is still working. Having it say more as it goes is planned too.
- Machines with less than 16GB of RAM are not recommended. No mobile yet.

## Ask a question

I'm one person building this on my own. I'll do my best to answer. Getting it running always gets a reply, and it's been tested on Macs. I read questions once a week, usually at the weekend. If I can't answer something, you will still get a short line saying so.

[Ask here](https://github.com/IndoorHuman/study-room/discussions). There is no email, and I am not taking code contributions right now, but it is open source: you have full freedom to change it and run it however you like.

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

<!-- OWNER_COPY_UPDATE_CONSENT_CLAUSE -->
If you say yes to the room's one question, the room asks GitHub once a day
whether a newer version exists. That request carries nothing of yours. You can
change your answer any time on the Manage screen. If you say no, or never
answer, the room makes no request at all, and the steps below still work.

<!-- OWNER_COPY_UPDATE_NEWEST_DATE -->
2026-08-30

<!-- OWNER_COPY_UPDATE_WHATS_NEW -->
Update on the streamline update through the app without you follow the steps to update from the previous readme

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

## How did it go?

If you have run the room, [say how it went](https://docs.google.com/forms/d/e/1FAIpQLSfJqSJb7xO07R40lVNJDKWGEVnfEm8wDbg7jyH0Dqh86x2t9w/viewform?usp=pp_url&entry.970072248=project+page). Six quick taps, and it never asks who you are.
