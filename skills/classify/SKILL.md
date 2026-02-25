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
| Plugin defaults | `${CLAUDE_PLUGIN_ROOT}/scripts/lockbox-defaults.json` | Ships with plugin — **never edit** |
| User overrides | `~/.claude/lockbox.json` | Personal tools across all projects |
| Project overrides | `.claude/lockbox.json` | Project-specific tools, committable |

**Always edit `~/.claude/lockbox.json`** (create it if missing). Read the plugin defaults for reference but don't modify them.

## Categories

- **override_safe** — checked first, always safe regardless of other matches (e.g. `--help`)
- **safe** — always allowed, even in tainted sessions
- **acting** — blocked when session is tainted (sends data externally)
- **unsafe** — taints the session but the command is allowed (reads external data)
- **unsafe_acting** — taints on first use, blocked if already tainted (both reads and sends)

Check order: `override_safe` → `unsafe_acting` → `unsafe` → `acting` → `safe` → default **acting**.

## Merge Semantics

- **Lists are additive** — user patterns prepend to defaults (checked first = higher priority)
- **`!` prefix removes** a default pattern (e.g. `"!^(rm|mv|cp|mkdir)\\s"` removes that exact string from defaults)
- **`mcp_tools` dict** — user keys overlay/overwrite default keys
- **`mcp_default` scalar** — last writer wins

## When a command gets wrongly blocked

1. Read the plugin defaults to understand existing patterns
2. Determine the correct category for the command
3. Add a regex pattern to the appropriate category in `~/.claude/lockbox.json`
4. Only include the sections you're changing — omitted sections inherit from defaults

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
