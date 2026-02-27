---
name: install
description: Configure Claude Code permissions for lockbox. Run after installing lockbox or when block messages show a permissions warning.
argument-hint: "[check]"
---

# Lockbox Install

Check and fix Claude Code permissions so lockbox can enforce its quarantine.

## What lockbox needs

One specific Bash command MUST require user approval (not auto-allowed) for lockbox to work:

- **`Bash(*lockbox-prompt*)`** in `permissions.ask` — the delegate sub-agent runs `lockbox-prompt` as its very first action via the `/lockbox:prompt` skill. The `ask` rule triggers a Claude Code permission prompt showing the user what the delegate will do before it executes. This is the approval point — without it, a compromised session could silently delegate external actions.

Regular sub-agents (Explore, Plan, general-purpose) are fine to auto-allow — they inherit the parent's lock and can't take acting commands.

**Why not echo or Task(lockbox:delegate) in ask?** Claude Code auto-approves `echo` as a built-in safe command, bypassing `ask` rules entirely. Claude Code's Task tool has "Permission Required: No" — `ask` rules for Task are silently ignored. The named `lockbox-prompt` script uses Bash's `ask` support, which does work. It must stay in `ask`, never `allow` — auto-approving it bypasses the approval gate entirely.

## Steps

### Step 0: Check plugin cache for rogue settings files

The plugin cache at `~/.claude/plugins/cache/` may contain `settings.local.json` files that were accidentally included during local development. These can silently override permissions (e.g. auto-allowing all Bash or Task calls).

1. Use Bash to find all `settings.local.json` and `settings.json` files under `~/.claude/plugins/cache/*/lockbox/`
2. Read any found files and check if they contain permission entries (especially `"allow": ["Bash"]` or similar)
3. If found, flag as **CRITICAL** — these files bypass all other permission checks and silently auto-approve delegate actions
4. Offer to delete them (they are never intentionally part of the plugin distribution)

### Step 1: Check global settings

1. Read `~/.claude/settings.json`
2. Check `permissions.ask` for the required entry:
   - `Bash(*lockbox-prompt*)` MUST be in `ask` — without it, the delegate's approval prompt won't trigger and actions execute without user review
   - Also check for the old pattern `Bash(echo "🔓 LOCKBOX DELEGATE:*)` — if present, flag it as outdated and needing replacement (Claude Code auto-approves `echo`, so the old pattern no longer works)
3. Check `permissions.allow` for patterns that auto-allow the prompt command:
   - `Bash`, `Bash(*)`, or any `Bash(...)` pattern covering the lockbox-prompt command — if present, the approval prompt is bypassed. **`allow` takes precedence over `ask`** in Claude Code, so the prompt pattern MUST NOT appear in `allow` even if it's also in `ask`
4. Check `permissions.deny` for mistakes:
   - `Bash(*lockbox-prompt*)` in `deny` — this blocks the approval prompt entirely, breaking delegation
5. Optionally check for `Task(lockbox:delegate)` in `ask` — note that this has no effect (Task ignores `ask`), but keeping it is harmless as belt-and-suspenders in case Claude Code adds support later

### Step 2: Check project-level settings

1. Read `.claude/settings.json` and `.claude/settings.local.json` in the current project
2. Apply the same checks as Step 1 — project-level settings can also affect permissions

### Step 3: Report and fix

1. Report findings to the user
2. If issues found, suggest specific fixes and offer to apply them

## Fix strategy

**If rogue settings files exist in plugin cache:**
Delete them immediately. These are never intentional — they leak from local development when using a local marketplace. Use `rm` to remove any `.claude/settings.local.json` or `.claude/settings.json` files found under `~/.claude/plugins/cache/*/lockbox/`. Suggest the user reinstall lockbox from the remote marketplace to get a clean copy.

**If `Bash(*lockbox-prompt*)` is not in `ask`:**
This is the most critical fix. Add it to `permissions.ask`. This is the actual approval gate — the delegate's `lockbox-prompt` script triggers a permission prompt that the user must approve. Example:

```json
{
  "permissions": {
    "ask": [
      "Bash(*lockbox-prompt*)"
    ]
  }
}
```

**Important:** If `Bash(*)` or `Bash` is already in `allow`, `Bash(*lockbox-prompt*)` in `ask` will NOT trigger — `allow` takes precedence over `ask`. The user must either remove the broad Bash allow, or accept that the delegate approval gate is bypassed.

**If the old echo pattern is in `ask`:**
Replace `Bash(echo "🔓 LOCKBOX DELEGATE:*)` with the new `Bash(*lockbox-prompt*)` pattern. Claude Code auto-approves `echo` as a built-in safe command, so the old pattern no longer triggers a permission prompt. The `lockbox-prompt` script must be in `ask`, never `allow` — auto-approving it bypasses the approval gate.

**If the prompt pattern is in `deny`:**
Move it from `deny` to `ask`. Having it in `deny` blocks the delegate's approval prompt entirely, which prevents delegation from working.

**Optionally, add `Task(lockbox:delegate)` to `ask` as well:**
This has no current effect (Task ignores `ask`), but if Claude Code adds `ask` support for Task in the future, it would provide a second approval gate. Harmless to include.

## Applying changes

Use the Edit tool to modify settings files. Always show the user exactly what will change before editing. After editing, re-read the file and run the checks again to confirm the fix.

## Check-only mode

If the user passes "check" as an argument, only report the current state — don't offer to change anything.
