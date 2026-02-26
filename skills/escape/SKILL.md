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

1. **Write a descriptive Task title** — the `description` parameter is the ONLY thing the user sees before approving. It must fully describe what the delegate will do. Format: `"🔓 <specific actions>"`.
   - Bad: `"Delegate email tasks"`, `"Archive emails"`, `"Run blocked commands"`
   - Good: `"🔓 Archive 14 emails and 2 Gmail threads"`
   - Good: `"🔓 Push main to origin and create PR #42"`
   - Good: `"🔓 Send draft reply to alice@example.com re: Q3 Report"`
2. **Prepare a Task prompt** with all concrete data the delegate needs — exact email bodies, recipients, branch names, URLs, file contents. The delegate has NO access to the parent context.
3. **Spawn the delegate** using the Task tool with `subagent_type: "lockbox:delegate"`. Lockbox automatically gives the delegate clean state so it can execute external actions.
4. **Report the delegate's results** to the user — show what happened, what succeeded, any errors.

## Task title is critical

The user ONLY sees the Task `description` (title) in their approval prompt — not the full prompt text. This is their sole review checkpoint before the delegate runs. The title IS the approval — treat it as a complete summary, not a teaser.

Put EVERYTHING in the title. Do not leave details for the prompt body thinking the user will see them — they won't. Be specific and exhaustive:
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
3. The delegate executes external actions without lockbox blocking
4. When the delegate finishes, lockbox restores the parent's locked state
5. The delegate's taint does NOT propagate back to the parent

The session stays locked after delegation. This is by design — once untrusted data enters a session, it stays tainted. Use delegation for each external action, or start a new session.

## Last resort: Plan mode

If delegation keeps failing and there is no other way forward, use `EnterPlanMode` to step back and plan the approach. **Warning:** plan mode loses your current thread of context, so only use it when you are truly stuck — not as a first option.
