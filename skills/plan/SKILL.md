---
name: plan
description: Guides plan creation when a session is in lockbox quarantine
triggers:
  - lockbox has blocked a tool
  - session is tainted and agent needs to write a plan
  - agent enters plan mode after a lockbox block
---

# Lockbox Plan Writing

When your session is locked by lockbox (external actions blocked due to untrusted data in context), use Claude Code's built-in plan mode to describe the actions you need taken.

## Plan execution ordering

Structure plans so they can execute in one pass without hitting lockbox:

1. **Safe first** — local reads, writes, edits, search (always work)
2. **Acting second** — outbound actions while context is still clean (send emails, push code, create events)
3. **Unsafe last** — fetch external data, read emails (taints the session, but acting is done)

If an acting step depends on data from an unsafe step, that's a two-cycle plan. Split it: cycle 1 fetches data, user reviews, cycle 2 acts on it. Minimise these — the fewer plan cycles, the less friction for the user.

## Fetching external data

**Always use Task subagents for fetches** (WebFetch, curl, wget). Never call these directly in the main session — parallel direct calls race on the taint state. Launch parallel Task agents instead; each gets its own session. When results enter your context, the session taints naturally.

## How to write a lockbox plan

1. **Enter plan mode** using `EnterPlanMode` — always allowed, even when locked
2. **Write numbered action list** to the plan file — one action per item
3. **Be specific**: include exact values (email body, subject, recipients), not references to tainted content. The executing context is clean and has no access to what you read.
4. **Exit plan mode** using `ExitPlanMode` — user reviews the plan
5. User selects "Clear context and bypass permissions" to execute in a clean context

## Rules

- **Only external actions go in the plan** — safe actions (read/write/edit) work directly
- **ALL concrete data in the plan text** — exact email bodies, URLs, branch names
- **No references to "the email" or "the page"** — spell out actual content
- **Don't re-fetch** what the tainted session already read — put that data in the plan
