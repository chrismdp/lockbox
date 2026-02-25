Execute a plan from a previous lockbox-quarantined session.

This command runs in a CLEAN session (no tainted context). Follow these steps:

1. **Find the plan**: Scan `/tmp/lockbox-plans/` for saved plan metadata files. Sort by `saved_at` descending and pick the most recent. If multiple plans exist, list them and ask the user which one to execute.

2. **Display context**: Show the user:
   - What triggered the lockbox (the unsafe tool that tainted the session)
   - When it was locked
   - What tools were blocked during the locked session
   - The full plan content (read the plan file path from the metadata)

3. **Get approval**: Ask the user how to proceed:
   - **Execute all** — run every action in the plan
   - **Execute selectively** — go through each action, ask approve/skip for each
   - **Reject** — discard the plan, do nothing

4. **Execute approved actions**: For each approved action, execute it using the appropriate tools. You have full tool access in this clean session. Report the result of each action as you go.

5. **Clean up**: After execution (or rejection), delete the plan metadata file from `/tmp/lockbox-plans/` and the corresponding state file from `/tmp/lockbox-state-*.json`.

IMPORTANT: This command only makes sense in a fresh session with no tainted context. If the current session is already locked by lockbox, warn the user and suggest starting a new session first.
