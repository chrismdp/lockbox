import * as fs from "fs";
import { HookInput, HookOutput, LockboxState } from "./types.js";
import { loadState, saveState, deleteState } from "./state.js";
import { loadConfig } from "./config.js";
import { classifyTool, toolDescription } from "./classify.js";
import { checkPermissions } from "./permissions.js";

const LOCKBOX_CLEAN_RE = /^\s*echo\s+(['"]?)lockbox:clean\1\s*$/;

function lockSession(
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

  const permWarnings = checkPermissions();
  const permBlock = permWarnings.length > 0
    ? "\n⚠ LOCKBOX PERMISSIONS NOT CONFIGURED — protection can be bypassed:\n" +
      permWarnings.map((w) => `  - ${w}`).join("\n") +
      "\n  Run /lockbox:install to fix.\n"
    : "";

  const reason =
    "LOCKBOX: Action blocked — session contains untrusted data.\n" +
    permBlock +
    "\n" +
    `Locked by: ${state.locked_by} at ${state.locked_at}\n` +
    `Blocked: ${desc}\n` +
    "\n" +
    "Continue working — read, write, edit, search, and Bash all work.\n" +
    "\n" +
    "If this command is read-only and should be safe, load /lockbox:classify to add it to ~/.claude/lockbox.json.\n" +
    "\n" +
    "To take external actions from a locked session:\n" +
    "1. Spawn a sub-agent with Task — describe the exact actions to perform\n" +
    "2. Sub-agent runs in a clean session and can execute external actions\n" +
    "3. Report the sub-agent's results to the user\n" +
    "4. If the results are safe, run: echo 'lockbox:clean' (user approves to clear the lock)";

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

  if (toolName === "Bash") {
    const command = (toolInput.command as string) ?? "";
    if (LOCKBOX_CLEAN_RE.test(command)) {
      deleteState(sessionId, tmpDir);
      return;
    }
  }

  const config = loadConfig();
  const state = loadState(sessionId, tmpDir);
  const category = classifyTool(toolName, toolInput, config);
  const isLocked = state.locked;

  // Safe: always passthrough
  if (category === "safe") return;

  // Unsafe (read-only lock): lock the session, allow the read
  if (category === "unsafe") {
    if (!isLocked) {
      lockSession(state, toolName, toolInput, sessionId, tmpDir);
    }
    return;
  }

  // Unsafe+Acting: lock on first use, block if already locked
  if (category === "unsafe_acting") {
    if (!isLocked) {
      lockSession(state, toolName, toolInput, sessionId, tmpDir);
      return; // allow the first use
    }
    // Already locked → fall through to block
  }

  // Acting (or unsafe_acting when already locked): block if locked
  if (isLocked) {
    blockTool(state, toolName, toolInput, sessionId, tmpDir);
    return;
  }

  // Acting but session not locked → passthrough
}

const isEntry = process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isEntry) main();
