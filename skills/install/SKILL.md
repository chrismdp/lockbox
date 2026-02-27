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

### Step 0: Check plugin cache for rogue settings files

The plugin cache at `~/.claude/plugins/cache/` may contain `settings.local.json` files that were accidentally included during local development. These can silently override permissions (e.g. auto-allowing all Task calls).

1. Use Bash to find all `settings.local.json` and `settings.json` files under `~/.claude/plugins/cache/*/lockbox/`
2. Read any found files and check if they contain permission entries (especially `"allow": ["Task"]` or similar)
3. If found, flag as **CRITICAL** — these files bypass all other permission checks and silently auto-approve the delegate sub-agent
4. Offer to delete them (they are never intentionally part of the plugin distribution)

### Step 1: Check global settings

1. Read `~/.claude/settings.json`
2. Check `permissions.allow` for dangerous patterns:
   - `Task`, `Task(*)`, or any `Task(...)` that covers `lockbox:delegate` — auto-allows the delegate sub-agent
3. Check `permissions.deny` for mistakes:
   - `Task(lockbox:delegate)` in `deny` — this blocks delegation entirely. It must be in `ask` instead so the user gets prompted.
4. Check `permissions.ask` for required entries:
   - `Task(lockbox:delegate)` MUST be in `ask` — without it, default permission modes like `acceptEdits` may auto-approve the delegate without user review. Do NOT use broad `Task` in `ask` — that prompts for every sub-agent (Explore, Plan, etc.) which is noisy and unnecessary

### Step 2: Check project-level settings

1. Read `.claude/settings.json` and `.claude/settings.local.json` in the current project
2. Apply the same checks as Step 1 — project-level settings can also auto-allow Task calls

### Step 3: Report and fix

1. Report findings to the user
2. If issues found, suggest specific fixes and offer to apply them

## Fix strategy

**If rogue settings files exist in plugin cache:**
Delete them immediately. These are never intentional — they leak from local development when using a local marketplace. Use `rm` to remove any `.claude/settings.local.json` or `.claude/settings.json` files found under `~/.claude/plugins/cache/*/lockbox/`. Suggest the user reinstall lockbox from the remote marketplace to get a clean copy.

**If `Task(*)` or `Task` is in allow (global or project settings):**
The delegate sub-agent would auto-execute without user review. Options:

- **Option A (recommended)**: Keep `Task(*)` in `allow` (so regular sub-agents work smoothly) and add `Task(lockbox:delegate)` to `permissions.ask`. The ask entry overrides allow for the delegate specifically.
- **Option B**: Remove `Task(*)` from `allow` and add `Task(lockbox:delegate)` to `permissions.ask`. Other sub-agents will follow the default permission mode.

**If `Task(lockbox:delegate)` is not in `ask`:**
This is the most common oversight. Default permission modes like `acceptEdits` may auto-approve the delegate without prompting the user. Add `Task(lockbox:delegate)` to `permissions.ask` so the delegate always requires explicit approval.

## Applying changes

Use the Edit tool to modify settings files. Always show the user exactly what will change before editing. After editing, re-read the file and run the checks again to confirm the fix.

## Check-only mode

If the user passes "check" as an argument, only report the current state — don't offer to change anything.
