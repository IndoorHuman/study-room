# agent skills (optional)

these files help **coding agents** run study room maintenance tasks. they are
**never required** — every skill delegates to a plain terminal command you
can run yourself.

## visualroom-update

**canonical file:** `skills/visualroom-update/SKILL.md`

install by copying or symlinking that folder into your agent’s skills directory:

| agent | typical skills path |
|-------|---------------------|
| Cursor | `~/.cursor/skills/visualroom-update/` |
| Claude Code | `~/.claude/skills/visualroom-update/` |
| Codex | `~/.codex/skills/visualroom-update/` |
| OpenCode / others | your tool’s documented skills directory |

after install, invoke however your tool exposes skills (slash command,
@mention, skill picker, etc.). the skill always runs `tools/update_room.py`
— see `UPDATE-GUIDE.md` for the human-readable walkthrough.
