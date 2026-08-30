# agent skills (bundled)

Every Study Room **download includes** this `skills/` folder; it ships in
the public release zip the same way `tools/update_room.py` does.

These files help **coding agents** run Study Room maintenance. They are
**never required**; every skill delegates to a plain terminal command you
can run yourself.

## visualroom-update

**file:** `skills/visualroom-update/SKILL.md`

### install into your agent (once per machine)

From the app folder:

```bash
python3 tools/install_agent_skills.py
```

That copies bundled skills into the usual folders for Cursor, Claude Code,
and Codex (`~/.cursor/skills/`, `~/.claude/skills/`, `~/.codex/skills/`).
Use `--dry-run` to preview.

Or copy/symlink manually:

| agent | typical skills path |
|-------|---------------------|
| Cursor | `~/.cursor/skills/visualroom-update/` |
| Claude Code | `~/.claude/skills/visualroom-update/` |
| Codex | `~/.codex/skills/visualroom-update/` |

After install, invoke however your tool exposes skills (slash command,
@mention, skill picker, etc.). The skill always runs `tools/update_room.py`.
See `UPDATE-GUIDE.md` for the human-readable walkthrough.
