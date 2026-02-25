import * as fs from "fs";
import { HookInput, HookOutput, LockboxState } from "./types";
import { loadState, saveState } from "./state";
import { loadConfig } from "./config";
import { classifyTool, toolDescription } from "./classify";

function taintSession(
  state: LockboxState,
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string,
  tmpDir?: string,
): void {
  state.locked = true;
  state.locked_by = toolDescription(toolName, toolInput);
  state.locked_at = new Date().toISOString();
  state.blocked_tools = [];
  saveState(sessionId, state, tmpDir);
}

function blockTool(
  state: LockboxState,
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string,
  tmpDir?: string,
): void {
  const desc = toolDescription(toolName, toolInput);
  if (!state.blocked_tools.includes(desc)) {
    state.blocked_tools.push(desc);
    saveState(sessionId, state, tmpDir);
  }

  const reason =
    "LOCKBOX: Action blocked — session contains untrusted data.\n" +
    "\n" +
    `Tainted by: ${state.locked_by} at ${state.locked_at}\n` +
    `Blocked: ${desc}\n` +
    "\n" +
    "Continue working — read, write, edit, search, and Bash all work.\n" +
    "\n" +
    "When ready to take external actions:\n" +
    "1. Enter plan mode (EnterPlanMode)\n" +
    "2. Write plan with ALL concrete data inline (exact email bodies, etc.)\n" +
    "3. Order phases: safe first, then acting, then unsafe\n" +
    "4. Exit plan mode — user selects 'Clear context and bypass permissions'";

  const output: HookOutput = { decision: "block", reason };
  process.stdout.write(JSON.stringify(output));
}

export function main(stdinData?: string, tmpDir?: string): void {
  let hookInput: HookInput;
  try {
    const raw = stdinData ?? fs.readFileSync(0, "utf-8");
    hookInput = JSON.parse(raw);
  } catch {
    return; // passthrough on bad input
  }

  const sessionId = hookInput.session_id ?? "unknown";
  const toolName = hookInput.tool_name ?? "";
  const toolInput = hookInput.tool_input ?? {};

  const config = loadConfig();
  const state = loadState(sessionId, tmpDir);
  const category = classifyTool(toolName, toolInput, config);
  const isLocked = state.locked;

  // Safe: always passthrough
  if (category === "safe") return;

  // Unsafe (read-only taint): taint the session, allow the read
  if (category === "unsafe") {
    if (!isLocked) {
      taintSession(state, toolName, toolInput, sessionId, tmpDir);
    }
    return;
  }

  // Unsafe+Acting: taint on first use, block if already tainted
  if (category === "unsafe_acting") {
    if (!isLocked) {
      taintSession(state, toolName, toolInput, sessionId, tmpDir);
      return; // allow the first use
    }
    // Already locked → fall through to block
  }

  // Acting (or unsafe_acting when already locked): block if tainted
  if (isLocked) {
    blockTool(state, toolName, toolInput, sessionId, tmpDir);
    return;
  }

  // Acting but session not tainted → passthrough
}

/* istanbul ignore next */
if (require.main === module) {
  main();
}
