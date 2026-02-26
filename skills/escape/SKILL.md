---
name: escape
description: Guides escape from a locked lockbox session via delegate sub-agent
triggers:
  - lockbox has blocked a tool
  - session is locked and agent needs to take external actions
  - agent needs to send email, push code, or call APIs from a locked session
---

# Lockbox Escape — Delegate Sub-Agent

When your session is locked by lockbox (external actions blocked due to untrusted data in context):

**First**: If the blocked command is read-only (search, list, get), it should be classified as safe. Give the user the exact JSON to add to `~/.claude/lockbox.json` so they can do it themselves or in a fresh session. Reference `/lockbox:classify` for the pattern format.

**If the command genuinely acts externally** (sends email, pushes code, posts messages), delegate to the lockbox:delegate agent:

## Step-by-step

1. **Prepare a Task prompt** with all concrete data the delegate needs — exact email bodies, recipients, branch names, URLs, file contents. The delegate has NO access to the parent context.
2. **Spawn the delegate** using the Task tool with `subagent_type: "lockbox:delegate"` — describe the exact actions to perform in order. Lockbox automatically gives the delegate clean state so it can execute external actions.
3. **Report the delegate's results** to the user — show what happened, what succeeded, any errors
4. **If results are safe**, run: `echo 'lockbox:clean'` — the user approves this to clear the lock

## Task prompt quality

The delegate starts with a blank context. Your prompt must be:

- **Specific**: exact values, not "the email we discussed"
- **Complete**: all data inline — email bodies, subject lines, recipients, URLs
- **Ordered**: number the steps so they execute in sequence
- **Bounded**: only the external actions, nothing else

Bad: "Send the email we drafted to the client"
Good: "Send an email to alice@example.com with subject 'Q3 Report' and body: ..."

## Approval flow

The user gets two approval points:

1. **Task prompt** — user reviews the delegate's instructions before it runs (Task tool permission)
2. **lockbox:clean** — user reviews delegate results before clearing the lock

You MUST report delegate results to the user before suggesting `echo 'lockbox:clean'`. The user needs to verify the actions succeeded before clearing the taint.

## When NOT to clean

Do NOT run `echo 'lockbox:clean'` if the delegate returned untrusted content into the parent context. Only clean when the delegate performed actions (sent, pushed, posted) and you're reporting success/failure — not when you're ingesting new external data.

## How it works

When you spawn a Task with `subagent_type: "lockbox:delegate"`, lockbox:
1. Backs up the parent's locked state
2. Clears the state file so the delegate starts clean
3. The delegate executes external actions without lockbox blocking
4. When the delegate finishes, lockbox restores the parent's locked state
5. The delegate's taint does NOT propagate back to the parent

## User setup

For smooth delegation, users should set the Task tool to "ask" permission in Claude Code settings. This ensures they review every delegate prompt before execution.
