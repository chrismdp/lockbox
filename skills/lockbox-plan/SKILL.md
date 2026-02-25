---
name: lockbox-plan
description: Guides plan creation when a session is in lockbox quarantine
triggers:
  - lockbox has blocked a tool
  - session is tainted and agent needs to write a plan
  - agent enters plan mode after a lockbox block
---

# Lockbox Plan Writing

When your session is locked by lockbox (external actions blocked due to untrusted data in context), use Claude Code's built-in plan mode to describe the actions you need taken.

## How to write a lockbox plan

1. **Enter plan mode** using `EnterPlanMode` — this is always allowed, even when locked.

2. **Write your plan** to the plan file. Structure it as a numbered list of concrete actions:

   ```markdown
   ## Actions

   1. **Send email reply** to sender@example.com
      - Subject: Re: [original subject]
      - Body: [exact text to send]
      - Threading: reply to message ID [id]

   2. **Create calendar event** on [date] at [time]
      - Title: [event title]
      - Duration: [length]
      - Attendees: [list]

   3. **Push branch** `feature-x` to origin
   ```

3. **Be specific**: Include exact values, not references to tainted content. The plan will be executed by a clean agent that has NO access to the tainted context. Everything needed must be in the plan text itself.

4. **Exit plan mode** using `ExitPlanMode` — the user sees and reviews the plan.

## Rules

- **One action per numbered item** — makes selective approval possible
- **Include all parameters** — the executing agent needs complete information
- **No references to "the email" or "the page"** — spell out the actual content
- **Safe actions don't need to be in the plan** — you can still read/write/edit local files directly
- **Only external actions go in the plan** — sending emails, pushing to git, creating tasks, etc.

## What happens next

The user reviews the plan via the standard plan mode UI. After the session ends, the stop hook saves the plan metadata. The user starts a clean session and runs `/lockbox-execute` to carry out approved actions with full tool access.
