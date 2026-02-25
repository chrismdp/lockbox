import * as fs from "fs";
import { loadState, saveState } from "./state.js";
import { loadConfig } from "./config.js";
import { classifyTool, toolDescription } from "./classify.js";
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
    const reason = "LOCKBOX: Action blocked — session contains untrusted data.\n" +
        "\n" +
        `Locked by: ${state.locked_by} at ${state.locked_at}\n` +
        `Blocked: ${desc}\n` +
        "\n" +
        "Continue working — read, write, edit, search, and Bash all work.\n" +
        "\n" +
        "When ready to take external actions:\n" +
        "1. Enter plan mode (EnterPlanMode)\n" +
        "2. Write plan with ALL concrete data inline (exact email bodies, etc.)\n" +
        "3. Order phases: safe first, then acting, then unsafe\n" +
        "4. Exit plan mode — user selects 'Clear context and bypass permissions'";
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
