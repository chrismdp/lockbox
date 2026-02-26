---
name: install
description: Configure Claude Code permissions for lockbox. Run after installing lockbox or when block messages show a permissions warning.
argument-hint: "[check]"
---

# Lockbox Install

Check and fix Claude Code permissions so lockbox can enforce its quarantine.

## What lockbox needs

Two specific commands MUST require user approval (not auto-allowed) for lockbox to work:

1. **Task(lockbox:delegate)** — user reviews the delegate sub-agent prompt before execution (prevents a compromised agent from silently delegating external actions). Regular sub-agents (Explore, Plan, general-purpose) are fine to auto-allow — they inherit the parent's lock and can't take acting commands.
2. **Bash: echo 'lockbox:clean'** — user confirms taint clearing after reviewing sub-agent results (prevents silent lock bypass)

## Steps

1. Read `~/.claude/settings.json`
2. Check `permissions.allow` for dangerous patterns:
   - `Bash(*)` or `Bash` — auto-allows ALL bash including `echo 'lockbox:clean'`
   - `Task`, `Task(*)`, or any `Task(...)` that covers `lockbox:delegate` — auto-allows the delegate sub-agent
3. Check `permissions.deny` for mistakes:
   - `Bash(echo*lockbox*clean*)` in `deny` — this blocks the command entirely, even from the user. It must be in `ask` instead so the user gets prompted.
   - `Task(lockbox:delegate)` in `deny` — same problem, blocks delegation entirely
4. Check `permissions.ask` for required entries:
   - `Task(lockbox:delegate)` MUST be in `ask` (or covered by `Task` in `ask`) — without it, default permission modes like `acceptEdits` may auto-approve the delegate without user review
   - `Bash(echo*lockbox*clean*)` MUST be in `ask` if `Bash(*)` is in `allow` — without it, the clean command auto-runs without user review
5. Report findings to the user
6. If issues found, suggest specific fixes and offer to apply them

## Fix strategies

**If `Bash(*)` is in allow:**
This is the most common issue. The user has auto-allowed all Bash commands for convenience. Options:

- **Option A (recommended)**: Keep `Bash(*)` in `allow` but add lockbox:clean to `ask`. Add to `permissions.ask`: `Bash(echo*lockbox*clean*)`. The ask entry overrides allow for this specific command — you'll be prompted before the lock clears.
- **Option B**: Remove `Bash(*)` and replace with specific patterns the user actually needs (e.g. `Bash(git *)`, `Bash(npm *)`, `Bash(node *)`)

Before suggesting Option B, check what Bash patterns the user already has in their allow list to understand their workflow.

**If `Task(*)` or `Task` is in allow:**
The delegate sub-agent would auto-execute without user review. Options:

- **Option A (recommended)**: Keep `Task(*)` in `allow` (so regular sub-agents work smoothly) and add `Task(lockbox:delegate)` to `permissions.ask`. The ask entry overrides allow for the delegate specifically.
- **Option B**: Move `Task` from `allow` to `ask` entirely. This means ALL sub-agents require approval, which is safer but more interruptions.

**If `Task(lockbox:delegate)` is not in `ask`:**
This is the most common oversight. Default permission modes like `acceptEdits` may auto-approve the delegate without prompting the user. Add `Task(lockbox:delegate)` to `permissions.ask` so the delegate always requires explicit approval.

## Applying changes

Use the Edit tool to modify `~/.claude/settings.json`. Always show the user exactly what will change before editing. After editing, re-read the file and run the permissions check again to confirm the fix.

## Check-only mode

If the user passes "check" as an argument, only report the current state — don't offer to change anything.
