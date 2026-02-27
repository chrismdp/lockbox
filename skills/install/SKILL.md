---
name: install
description: Configure Claude Code permissions for lockbox. Run after installing lockbox or when block messages show a permissions warning.
argument-hint: "[check]"
---

# Lockbox Install

Check and fix Claude Code permissions so lockbox can enforce its quarantine.

## What lockbox needs

One specific command MUST require user approval (not auto-allowed) for lockbox to work:

- **Task(lockbox:delegate)** — user reviews the delegate sub-agent prompt before execution (prevents a compromised agent from silently delegating external actions). Regular sub-agents (Explore, Plan, general-purpose) are fine to auto-allow — they inherit the parent's lock and can't take acting commands.

## Steps

1. Read `~/.claude/settings.json`
2. Check `permissions.allow` for dangerous patterns:
   - `Task`, `Task(*)`, or any `Task(...)` that covers `lockbox:delegate` — auto-allows the delegate sub-agent
3. Check `permissions.deny` for mistakes:
   - `Task(lockbox:delegate)` in `deny` — this blocks delegation entirely. It must be in `ask` instead so the user gets prompted.
4. Check `permissions.ask` for required entries:
   - `Task(lockbox:delegate)` MUST be in `ask` — without it, default permission modes like `acceptEdits` may auto-approve the delegate without user review. Do NOT use broad `Task` in `ask` — that prompts for every sub-agent (Explore, Plan, etc.) which is noisy and unnecessary
5. Check `skipDangerousModePermissionPrompt`:
   - If `true`, warn the user: dangerous mode auto-approves ALL tool calls including `ask` entries. This means `Task(lockbox:delegate)` would execute without user review, bypassing lockbox's quarantine. The setting also removes the "are you sure?" confirmation before entering dangerous mode, making it easy to end up there accidentally.
   - Recommend setting `skipDangerousModePermissionPrompt` to `false` (or removing it) so the user gets a confirmation gate before entering a mode that disables lockbox's protections.
6. Report findings to the user
7. If issues found, suggest specific fixes and offer to apply them

## Fix strategy

**If `Task(*)` or `Task` is in allow:**
The delegate sub-agent would auto-execute without user review. Options:

- **Option A (recommended)**: Keep `Task(*)` in `allow` (so regular sub-agents work smoothly) and add `Task(lockbox:delegate)` to `permissions.ask`. The ask entry overrides allow for the delegate specifically.
- **Option B**: Remove `Task(*)` from `allow` and add `Task(lockbox:delegate)` to `permissions.ask`. Other sub-agents will follow the default permission mode.

**If `Task(lockbox:delegate)` is not in `ask`:**
This is the most common oversight. Default permission modes like `acceptEdits` may auto-approve the delegate without prompting the user. Add `Task(lockbox:delegate)` to `permissions.ask` so the delegate always requires explicit approval.

**If `skipDangerousModePermissionPrompt` is `true`:**
Dangerous mode auto-approves all tool calls — `ask` entries are ignored, so `Task(lockbox:delegate)` executes without review. The setting also removes the confirmation prompt before entering dangerous mode, making it easy to switch accidentally. Recommend removing or setting to `false`. This doesn't prevent using dangerous mode — it just restores the "are you sure?" gate so the user consciously opts into bypassing lockbox.

## Applying changes

Use the Edit tool to modify `~/.claude/settings.json`. Always show the user exactly what will change before editing. After editing, re-read the file and run the permissions check again to confirm the fix.

## Check-only mode

If the user passes "check" as an argument, only report the current state — don't offer to change anything.
