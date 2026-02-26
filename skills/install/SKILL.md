---
name: install
description: Configure Claude Code permissions for lockbox. Run after installing lockbox or when block messages show a permissions warning.
argument-hint: "[check]"
---

# Lockbox Install

Check and fix Claude Code permissions so lockbox can enforce its quarantine.

## What lockbox needs

Two tools MUST require user approval (not auto-allowed) for lockbox to work:

1. **Task** — user reviews sub-agent prompts before execution (prevents a compromised agent from silently delegating external actions)
2. **Bash: echo 'lockbox:clean'** — user confirms taint clearing after reviewing sub-agent results (prevents silent lock bypass)

## Steps

1. Read `~/.claude/settings.json`
2. Check `permissions.allow` for dangerous patterns:
   - `Bash(*)` or `Bash` — auto-allows ALL bash including `echo 'lockbox:clean'`
   - `Task`, `Task(*)`, or any `Task(...)` — auto-allows sub-agent creation
3. Report findings to the user
4. If issues found, suggest specific fixes and offer to apply them

## Fix strategies

**If `Bash(*)` is in allow:**
This is the most common issue. The user has auto-allowed all Bash commands for convenience. Options:

- **Option A (recommended)**: Keep `Bash(*)` in `allow` but move lockbox:clean to `deny`. Add to `permissions.deny`: `Bash(echo*lockbox*clean*)`
- **Option B**: Remove `Bash(*)` and replace with specific patterns the user actually needs (e.g. `Bash(git *)`, `Bash(npm *)`, `Bash(node *)`)

Before suggesting Option B, check what Bash patterns the user already has in their allow list to understand their workflow.

**If `Task` is in allow:**
Remove it. Task should use the default permission mode (which prompts the user) or be explicitly in `ask`.

## Applying changes

Use the Edit tool to modify `~/.claude/settings.json`. Always show the user exactly what will change before editing. After editing, re-read the file and run the permissions check again to confirm the fix.

## Check-only mode

If the user passes "check" as an argument, only report the current state — don't offer to change anything.
