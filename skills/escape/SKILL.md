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

1. **Write a descriptive Task title** — the `description` parameter is what the user sees before approving. It must fully describe what the delegate will do. Format: `"🔓 <specific actions>"`.
   - Bad: `"Delegate email tasks"`, `"Archive emails"`, `"Run blocked commands"`
   - Good: `"🔓 Archive 14 emails and 2 Gmail threads"`
   - Good: `"🔓 Push main to origin and create PR #42"`
   - Good: `"🔓 Send draft reply to alice@example.com re: Q3 Report"`
2. **Prepare a Task prompt** with all concrete data the delegate needs — exact email bodies, recipients, branch names, URLs, file contents. The delegate has NO access to the parent context.
3. **Spawn the delegate** using the Task tool with `subagent_type: "lockbox:delegate"`. Lockbox automatically gives the delegate clean state so it can execute external actions.
4. **The delegate prompts for approval** — the delegate loads the `/lockbox:prompt` skill and runs `lockbox-prompt "<summary>"` as its very first action. This triggers a Claude Code permission prompt. The user sees the command and approves or denies. This is the **actual approval point** — the user reviews the delegate's intended actions before anything executes.
5. **Report the delegate's results** to the user — show what happened, what succeeded, any errors.

## The lockbox-prompt script is the approval point

The delegate loads the `/lockbox:prompt` skill and runs `lockbox-prompt "<what it will do>"` as its first action. A `permissions.ask` rule for this pattern triggers a Claude Code permission dialog. The user sees the task summary and chooses to approve or deny.

This works because:
- Claude Code's Task tool has "Permission Required: No" — `ask` rules for Task are silently ignored
- Claude Code auto-approves `echo` as a built-in safe command — so the old echo pattern was bypassed
- Bash's `ask` rules DO work for named scripts — putting the `lockbox-prompt` pattern in `ask` triggers a real prompt
- `ask` is evaluated before `allow` — so even with `Bash(*)` in allow, the prompt still fires
- The script must stay in `ask`, never `allow` — auto-approving it bypasses the approval gate entirely

If the user does NOT see a permission prompt when the delegate starts, the prompt pattern is missing from `permissions.ask`. Tell them to run `/lockbox:install` to fix it.

## Task title is critical

The user sees BOTH the Task `description` (title) AND the lockbox-prompt permission prompt. Make the title descriptive — it gives context even before the echo prompt appears.

Put EVERYTHING in the title. Be specific and exhaustive:
- What action (archive, send, push, create)
- What target (14 emails, PR #42, alice@example.com)
- What service (Gmail, GitHub, Slack)
- Key details (recipient, branch name, subject line)

Bad: `"🔓 Send email to client"` — which client? about what?
Good: `"🔓 Send draft to alice@example.com re: Q3 Report via Gmail"`
Bad: `"🔓 Archive emails"` — how many? which ones?
Good: `"🔓 Archive 14 emails + Chloe Mayo and Luke Wilde threads in Gmail"`
Bad: `"🔓 Push code"` — where? what branch?
Good: `"🔓 Push master to origin (3 commits: namespace fix, block msg, version bump)"`

## Task prompt quality

The delegate starts with a blank context. Your prompt must be:

- **Specific**: exact values, not "the email we discussed"
- **Complete**: all data inline — email bodies, subject lines, recipients, URLs
- **Ordered**: number the steps so they execute in sequence
- **Bounded**: only the external actions, nothing else

Bad: "Send the email we drafted to the client"
Good: "Send an email to alice@example.com with subject 'Q3 Report' and body: ..."

## How it works

When you spawn a Task with `subagent_type: "lockbox:delegate"`, lockbox:
1. Backs up the parent's locked state
2. Clears the state file so the delegate starts clean
3. The delegate runs lockbox-prompt with its task summary (triggers permission prompt)
4. User approves → delegate executes external actions without lockbox blocking
5. When the delegate finishes, lockbox restores the parent's locked state
6. The delegate's taint does NOT propagate back to the parent

The session stays locked after delegation. This is by design — once untrusted data enters a session, it stays tainted. Use delegation for each external action, or start a new session.

## Last resort: Plan mode

If delegation keeps failing and there is no other way forward, use `EnterPlanMode` to step back and plan the approach. **Warning:** plan mode loses your current thread of context, so only use it when you are truly stuck — not as a first option.
