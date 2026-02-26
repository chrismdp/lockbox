import * as fs from "fs";
import { loadState, saveState, deleteState, startDelegate } from "./state.js";
import { loadConfig } from "./config.js";
import { classifyTool, toolDescription } from "./classify.js";
import { checkPermissions } from "./permissions.js";
const LOCKBOX_CLEAN_RE = /^\s*echo\s+(['"]?)lockbox:clean\1\s*$/;
function lockSession(state, toolName, toolInput, sessionId, tmpDir) {
    state.locked = true;
    state.locked_by = toolDescription(toolName, toolInput);
    state.locked_at = new Date().toISOString();
    state.blocked_tools = [];
    saveState(sessionId, state, tmpDir);
}
function blockTool(state, toolName, toolInput, sessionId, tmpDir) {
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
    const reason = "LOCKBOX: Action blocked — session contains untrusted data.\n" +
        permBlock +
        "\n" +
        `Locked by: ${state.locked_by} at ${state.locked_at}\n` +
        `Blocked: ${desc}\n` +
        "\n" +
        "STOP. Tell the user what was blocked and why. Do NOT attempt to work around this automatically.\n" +
        "\n" +
        "Continue working — read, write, edit, search, and Bash all work.\n" +
        "\n" +
        "If this command is read-only and should be safe, load /lockbox:classify to add it to ~/.claude/lockbox.json.\n" +
        "\n" +
        "If the user asks you to take this external action, load /lockbox:escape first, then spawn a Task with subagent_type 'lockbox:delegate'.\n" +
        "The Task description is the ONLY thing the user sees before approving. Put EVERYTHING in it — prefix with 🔓, list all actions, targets, and services. Leave nothing for the prompt body. (e.g. '🔓 Archive 14 emails + Chloe Mayo thread in Gmail').\n" +
        "Do NOT use a regular Task (general-purpose, Explore, etc.) — those inherit the locked state and will also be blocked.";
    const output = { decision: "block", reason };
    process.stdout.write(JSON.stringify(output));
}
export function main(stdinData, tmpDir) {
    let hookInput;
    try {
        const raw = stdinData ?? fs.readFileSync(0, "utf-8");
        hookInput = JSON.parse(raw);
    }
    catch {
        return; // passthrough on bad input
    }
    const sessionId = hookInput.session_id ?? "unknown";
    const toolName = hookInput.tool_name ?? "";
    const toolInput = hookInput.tool_input ?? {};
    if (toolName === "Bash") {
        const command = toolInput.command ?? "";
        if (LOCKBOX_CLEAN_RE.test(command)) {
            deleteState(sessionId, tmpDir);
            return;
        }
    }
    // Fallback delegate detection: if SubagentStart hooks don't fire,
    // catch delegate Task calls here and prepare clean state.
    // Accept both plugin-local "delegate" and namespaced "lockbox:delegate".
    const subType = String(toolInput.subagent_type ?? "");
    if (toolName === "Task" && (subType === "delegate" || subType === "lockbox:delegate")) {
        const preState = loadState(sessionId, tmpDir);
        if (preState.locked) {
            startDelegate(sessionId, tmpDir); // idempotent via marker
        }
        return; // Task is safe — allow through
    }
    const config = loadConfig();
    const state = loadState(sessionId, tmpDir);
    const category = classifyTool(toolName, toolInput, config);
    const isLocked = state.locked;
    // Safe: always passthrough
    if (category === "safe")
        return;
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
if (isEntry)
    main();
