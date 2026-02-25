Check the current lockbox state for this session.

1. List all files matching `/tmp/lockbox-state-*.json` to find active lockbox sessions.
2. For each state file found, read it and display:
   - **Session ID**: extracted from the filename
   - **Locked**: yes or no
   - **Locked by**: the tool that triggered taint
   - **Locked at**: timestamp
   - **Blocked tools**: list of tools that were blocked while locked
3. Also check `/tmp/lockbox-plans/` for saved plans from previous locked sessions. For each plan file found, show the session ID, when it was saved, and whether a plan file was captured.

If no state files exist, report: "Lockbox: no active sessions detected."

Format the output as a clear status summary. Keep it concise.
