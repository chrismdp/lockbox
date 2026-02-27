# Lockbox Internals

Technical details on how lockbox enforces its quarantine. For usage and configuration, see [README.md](../README.md).

## Hooks

Lockbox uses five Claude Code hook events:

| Hook | File | Fires when |
|------|------|------------|
| **PreToolUse** | `hook-pre-tool-use.ts` | Before every tool call. Classifies the tool, locks or blocks as needed. |
| **PostToolUse** | `hook-post-tool-use.ts` | After every tool call. Propagates taint from sub-agents to parent. |
| **SubagentStart** | `hook-subagent-start.ts` | When a sub-agent spawns. Prepares clean state for delegate agents. |
| **SubagentStop** | `hook-subagent-stop.ts` | When a sub-agent finishes. Restores parent state after delegation. |
| **SessionEnd** | `hook-session-end.ts` | When session closes. Cleans up state files. |

## State

Session state lives in `/tmp/lockbox-state-{session_id}.json`:

```json
{
  "locked": true,
  "locked_by": "WebFetch: https://example.com",
  "locked_at": "2025-06-01T12:00:00Z",
  "blocked_tools": ["Bash: git push origin main"]
}
```

## PreToolUse flow

```
tool call arrives
  |-- Task(subagent_type=delegate)?  --> start delegate, allow
  |-- classify tool
  |     |-- safe                      --> allow
  |     |-- unsafe                    --> lock session, allow
  |     |-- unsafe_acting (first)     --> lock session, allow
  |     |-- unsafe_acting (locked)    --> block
  |     +-- acting
  |           |-- locked              --> block
  |           +-- clean               --> allow
```

When a tool is blocked, the hook returns `{ "decision": "block", "reason": "..." }` which Claude Code shows to the agent. The block message tells the agent to stop, inform the user, and reference `/lockbox:escape` for delegation.

## Taint propagation

When a sub-agent returns data to the parent (via Task or TaskOutput), PostToolUse checks whether any other session's state file in `/tmp` is locked. If so, the parent gets locked too — the sub-agent may have ingested untrusted content that's now in the parent's context.

This scan uses `findLockedSessions()` which reads all `lockbox-state-*.json` files in `/tmp` and excludes the current session.

## Sub-agent session sharing

Claude Code sub-agents share the parent's `session_id`. This was confirmed empirically with a diagnostic hook that captured raw hook input during sub-agent execution:

```
PreToolUse (parent, Task)     --> session_id: 58141f31-...
SubagentStart                 --> session_id: 58141f31-...
PreToolUse (sub-agent, Glob)  --> session_id: 58141f31-...
SubagentStop                  --> session_id: 58141f31-...
```

This means sub-agents read the same lockbox state file as the parent. Without intervention, a locked parent produces a locked sub-agent — which would defeat delegation entirely.

## Delegate sub-agent

To let a locked session take external actions (with user approval), lockbox provides a **delegate agent** that runs with independent state. The mechanism is backup and restore.

When a delegate starts (`SubagentStart` hook or `PreToolUse` fallback):
1. Back up the parent's locked state to `lockbox-state-{id}.delegate-backup.json`
2. Delete the state file — delegate starts clean
3. Write a marker file `lockbox-delegate-{id}.active`

The delegate can now execute acting commands because its state is clean. When it finishes (`SubagentStop` hook or `PostToolUse` fallback):
1. Delete any state the delegate accumulated
2. Restore the parent's backed-up state
3. Remove the marker and backup files

The delegate's taint is discarded — it does not propagate back to the parent.

**Belt and suspenders:** Both the SubagentStart/SubagentStop hooks and the PreToolUse/PostToolUse hooks implement this logic. The marker file makes both paths idempotent — if SubagentStart already ran, PreToolUse skips. This covers the case where one mechanism doesn't fire.

**Limitation:** The backup/restore is single-slot. Only one delegate can run at a time. Parallel delegates would race on the backup file. Foreground Tasks block the parent so this isn't a problem in normal use, but `run_in_background: true` could trigger it.

## The escape flow

```
 1. Session locks (e.g., after WebFetch)
 2. Agent tries git push --> blocked
 3. Block message: STOP, tell user, use delegate if asked
 4. User asks agent to push
 5. Agent spawns Task(subagent_type="delegate") with concrete instructions
 6. Lockbox backs up state, clears for delegate
 7. Delegate loads /lockbox:prompt, runs lockbox-prompt "push master to origin"
 8. ask rule triggers permission prompt           <-- approval point
 9. User reviews prompt content and approves
10. Delegate executes git push
11. Delegate finishes, lockbox restores parent's lock
12. Agent reports results to user
```

The approval point is the delegate's `lockbox-prompt` script (step 8), NOT the Task spawn (step 5). Claude Code's Task tool has "Permission Required: No" — `ask` rules for Task are silently ignored. Claude Code auto-approves `echo`, so a named script is used instead. Bash's `ask` support works for named scripts. `ask` is evaluated before `allow`, so the prompt fires even when `Bash(*)` is in allow.

The session stays locked after delegation. Once untrusted data enters a session, it stays tainted. Delegate for each external action, or start a new session.

## Required permissions

Lockbox relies on one user approval point to prevent a compromised session from bypassing the quarantine:

| Permission | What it protects | Config |
|---|---|---|
| `Bash(*lockbox-prompt*)` | User reviews the delegate's task before it executes | Must be in `ask` |

The delegate loads the `/lockbox:prompt` skill and runs `lockbox-prompt "<summary>"` as its very first action. The `ask` rule triggers a Claude Code permission prompt — the user sees what the delegate will do and approves or denies.

**Why not echo or Task(lockbox:delegate) in ask?** Claude Code auto-approves `echo` as a built-in safe command, bypassing `ask` rules entirely. Claude Code's Task tool has "Permission Required: No" — `ask` is ignored for Task, only `deny` works. The named `lockbox-prompt` script uses Bash's working `ask` support. It must stay in `ask`, never `allow` — auto-approving it bypasses the approval gate entirely.

Regular sub-agents (Explore, Plan, general-purpose) don't need special permissions — they inherit the parent's lock state and can't take acting commands. Only the delegate gets clean state, so only it needs user approval.

Run `/lockbox:install` to check and fix these automatically.

## Tamper resistance

Edits to `lockbox.json` or `lockbox-state-*` files are reclassified as "acting" regardless of the tool used. This prevents a tainted session from disabling lockbox by modifying its own config or state.

## Architecture

```
src/
  classify.ts            Pattern matching and command classification
  config.ts              3-layer config loading (plugin -> user -> project)
  hook-pre-tool-use.ts   Main enforcement hook (blocks acting when locked)
  hook-post-tool-use.ts  Taint propagation from sub-agents
  hook-subagent-start.ts Delegate state preparation
  hook-subagent-stop.ts  Delegate state restoration
  hook-session-end.ts    Session cleanup
  permissions.ts         Permission validation
  state.ts               Session lock state + delegate backup/restore
  types.ts               Type definitions
hooks/
  hooks.json             Hook event registrations
agents/
  delegate.md            Delegate agent definition
lockbox.json             Default classification patterns
```

## Diagnostics

`scripts/dump-hook-input.sh` captures raw hook input JSON to `/tmp/lockbox-hook-dump-*.json`. Add it as a temporary hook in `~/.claude/settings.json` to inspect what Claude Code passes to each hook event:

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "/path/to/dump-hook-input.sh", "timeout": 5 }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "/path/to/dump-hook-input.sh", "timeout": 5 }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "/path/to/dump-hook-input.sh", "timeout": 5 }] }]
  }
}
```

## Hook input shapes (observed)

**PreToolUse** (parent and sub-agent tool calls share session_id):
```json
{
  "session_id": "58141f31-...",
  "transcript_path": "/home/.../.jsonl",
  "cwd": "/home/.../lockbox",
  "permission_mode": "bypassPermissions",
  "hook_event_name": "PreToolUse",
  "tool_name": "Glob",
  "tool_input": { "pattern": "*.ts", "path": "src" },
  "tool_use_id": "toolu_01E2kz..."
}
```

**SubagentStart**:
```json
{
  "session_id": "58141f31-...",
  "transcript_path": "/home/.../.jsonl",
  "cwd": "/home/.../lockbox",
  "hook_event_name": "SubagentStart",
  "agent_id": "a4aebfa857afd340d",
  "agent_type": "general-purpose"
}
```

**SubagentStop** (includes the sub-agent's final message and its own transcript path):
```json
{
  "session_id": "58141f31-...",
  "transcript_path": "/home/.../.jsonl",
  "cwd": "/home/.../lockbox",
  "permission_mode": "bypassPermissions",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "a4aebfa857afd340d",
  "agent_transcript_path": "/home/.../subagents/agent-a4aebfa857afd340d.jsonl",
  "agent_type": "general-purpose",
  "last_assistant_message": "..."
}
```
