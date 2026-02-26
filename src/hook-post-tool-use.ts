import * as fs from "fs";
import { HookInput } from "./types.js";
import { loadState, saveState, findLockedSessions, isDelegateActive, stopDelegate } from "./state.js";

const TAINT_TOOLS = new Set(["Task", "TaskOutput"]);

export function main(stdinData?: string, tmpDir?: string): void {
  let hookInput: HookInput;
  try {
    const raw = stdinData ?? fs.readFileSync(0, "utf-8");
    hookInput = JSON.parse(raw);
  } catch {
    return; // passthrough on bad input
  }

  const toolName = hookInput.tool_name ?? "";
  if (!TAINT_TOOLS.has(toolName)) return;

  const sessionId = hookInput.session_id ?? "unknown";

  // Delegate returning: restore parent state, skip taint propagation.
  // Fallback for when SubagentStop hooks don't fire.
  if (isDelegateActive(sessionId, tmpDir)) {
    stopDelegate(sessionId, tmpDir); // idempotent via marker
    return;
  }

  const state = loadState(sessionId, tmpDir);
  if (state.locked) return; // already locked, nothing to propagate

  const lockedSessions = findLockedSessions(sessionId, tmpDir);
  if (lockedSessions.length === 0) return;

  state.locked = true;
  state.locked_by = "subagent (tainted data returned via Task)";
  state.locked_at = new Date().toISOString();
  state.blocked_tools = [];
  saveState(sessionId, state, tmpDir);
}

const isEntry = process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isEntry) main();
