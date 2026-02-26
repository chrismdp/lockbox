---
name: classify
description: Add or review lockbox bash pattern classifications
triggers:
  - lockbox blocked a command that should be allowed
  - user wants to allowlist a bash command
  - need to check how a command is classified
---

# Lockbox Classify

Manage bash command classifications for the lockbox plugin.

## Configuration Layers

Lockbox uses three configuration layers, merged in order (later layers override earlier):

| Layer | File | Purpose |
|-------|------|---------|
| Plugin defaults | `${CLAUDE_PLUGIN_ROOT}/lockbox.json` | Ships with plugin — **never edit** |
| User overrides | `~/.claude/lockbox.json` | Personal tools across all projects |
| Project overrides | `.claude/lockbox.json` | Project-specific tools, committable |

**Always edit `~/.claude/lockbox.json`** (create it if missing). Read the plugin defaults for reference but don't modify them.

## Categories

- **override_safe** — checked first, always safe regardless of other matches (e.g. `--help`)
- **safe** — always allowed, even in locked sessions
- **acting** — blocked when session is locked (sends data externally)
- **unsafe** — locks the session but the command is allowed (reads external data)
- **unsafe_acting** — locks on first use, blocked if already locked (both reads and sends)

Check order: `override_safe` → `unsafe_acting` → `unsafe` → `acting` → `safe` → default **acting**.

## Merge Semantics

- **Lists are additive** — user patterns prepend to defaults (checked first = higher priority)
- **`!` prefix removes** a default pattern (e.g. `"!^(rm|mv|cp|mkdir)\\s"` removes that exact string from defaults)
- **`mcp_tools` dict** — user keys overlay/overwrite default keys
- **`mcp_default` scalar** — last writer wins

## When a command gets wrongly blocked

If a blocked command is read-only or local, you should proactively reclassify it:

1. Verify the command is genuinely read-only — run it with `--help` to check subcommands
2. Read the plugin defaults (`lockbox.json` in the plugin root) for reference
3. Determine the correct category:
   - Read/search/list/get operations → `safe`
   - Commands that send data externally (send email, post message, upload) → `acting`
   - Commands that fetch untrusted external content → `unsafe`
4. Edit `~/.claude/lockbox.json` to add a regex pattern to the appropriate category
5. Only include the sections you're changing — omitted sections inherit from defaults
6. Retry the blocked command — the new classification takes effect immediately

**Tamper resistance**: Edits to `lockbox.json` and `lockbox-state` files are classified as `acting` — allowed in clean sessions but blocked in locked ones. If you're already locked when a command is blocked, you cannot edit the config to escape. Instead:
- Tell the user what pattern to add (give them the exact JSON) so they can add it manually or in a fresh session
- Or use plan mode to include the reclassification as a step

## User override file format

Only include the keys you want to change:

```json
{
  "bash_patterns": {
    "safe": ["mytool\\s+(list|get|status)"],
    "acting": ["mytool\\s+(deploy|rollback)"]
  },
  "mcp_tools": {
    "mcp__slack__post_message": "acting"
  }
}
```

## Removing a default pattern

To remove a pattern from the plugin defaults, prefix it with `!`:

```json
{
  "bash_patterns": {
    "safe": ["!^(rm|mv|cp|mkdir)\\s"]
  }
}
```

This removes the exact string `^(rm|mv|cp|mkdir)\s` from the safe list.

## Pattern tips

- `--help` is already allowlisted globally (matches any command with --help)
- Use `\\s` for whitespace, `(a|b|c)` for alternatives
- Anchor with `^` only when the command must be at the start of a segment
- Pipe chains are split on `|`, `&`, `;` — each segment is classified independently
- A pipe that combines unsafe + acting segments gets `unsafe_acting`
- Patterns use JS `new RegExp(pattern).test(string)` — no need to match the full string
