import * as fs from "fs";
import { loadState, saveState, startDelegate } from "./state.js";
import { loadConfig } from "./config.js";
import { classifyTool, toolDescription } from "./classify.js";
import { checkPermissions } from "./permissions.js";
function lockSession(state, toolName, toolInput, sessionId, tmpDir) {
    state.locked = true;
    state.locked_by = toolDescription(toolName, toolInput);
    state.locked_at = new Date().toISOString();
    state.blocked_tools = [];
    saveState(sessionId, state, tmpDir);
}
function blockDangerousMode(state, toolName, toolInput, sessionId, tmpDir) {
    const desc = toolDescription(toolName, toolInput);
    if (!state.blocked_tools.includes(desc)) {
        state.blocked_tools.push(desc);
        saveState(sessionId, state, tmpDir);
    }
    const reason = "LOCKBOX: Action blocked — session contains untrusted data.\n" +
        "\n" +
        "⚠ DANGEROUS MODE DETECTED — lockbox quarantine cannot be enforced.\n" +
        "In dangerous mode, delegate approval is auto-granted without user review,\n" +
        "so the quarantine escape hatch is broken. Lockbox will block actions but\n" +
        "delegation is disabled.\n" +
        "\n" +
        `Locked by: ${state.locked_by} at ${state.locked_at}\n` +
        `Blocked: ${desc}\n` +
        "\n" +
        "STOP. Tell the user:\n" +
        "  1. Lockbox cannot protect this session in dangerous mode\n" +
        "  2. Switch to a safer permission mode (e.g. acceptEdits) to re-enable quarantine\n" +
        "  3. Or start a new session in a safer mode\n" +
        "\n" +
        "Do NOT attempt delegation — it will auto-approve without user review.";
    const output = { decision: "block", reason };
    process.stdout.write(JSON.stringify(output));
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
        "Do NOT use a regular Task (general-purpose, Explore, etc.) — those inherit the locked state and will also be blocked.\n" +
        "\n" +
        "Last resort: if delegation keeps failing and there is no other way forward, use EnterPlanMode to plan the approach. Warning: plan mode loses your current thread of context, so only use it when you are truly stuck.";
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
    const isDangerousMode = hookInput.permission_mode === "bypassPermissions";
    // Fallback delegate detection: if SubagentStart hooks don't fire,
    // catch delegate Task calls here and prepare clean state.
    // Accept both plugin-local "delegate" and namespaced "lockbox:delegate".
    const subType = String(toolInput.subagent_type ?? "");
    if (toolName === "Task" && (subType === "delegate" || subType === "lockbox:delegate")) {
        const preState = loadState(sessionId, tmpDir);
        if (preState.locked && isDangerousMode) {
            // Dangerous mode auto-approves Task — delegation is unsafe
            blockDangerousMode(preState, toolName, toolInput, sessionId, tmpDir);
            return;
        }
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
        if (isDangerousMode) {
            blockDangerousMode(state, toolName, toolInput, sessionId, tmpDir);
        }
        else {
            blockTool(state, toolName, toolInput, sessionId, tmpDir);
        }
        return;
    }
    // Acting but session not locked → passthrough
}
const isEntry = process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isEntry)
    main();
