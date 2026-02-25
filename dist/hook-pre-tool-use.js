"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const fs = __importStar(require("fs"));
const state_1 = require("./state");
const config_1 = require("./config");
const classify_1 = require("./classify");
function taintSession(state, toolName, toolInput, sessionId, tmpDir) {
    state.locked = true;
    state.locked_by = (0, classify_1.toolDescription)(toolName, toolInput);
    state.locked_at = new Date().toISOString();
    state.blocked_tools = [];
    (0, state_1.saveState)(sessionId, state, tmpDir);
}
function blockTool(state, toolName, toolInput, sessionId, tmpDir) {
    const desc = (0, classify_1.toolDescription)(toolName, toolInput);
    if (!state.blocked_tools.includes(desc)) {
        state.blocked_tools.push(desc);
        (0, state_1.saveState)(sessionId, state, tmpDir);
    }
    const reason = "LOCKBOX: Action blocked — session contains untrusted data.\n" +
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
    const output = { decision: "block", reason };
    process.stdout.write(JSON.stringify(output));
}
function main(stdinData, tmpDir) {
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
    const config = (0, config_1.loadConfig)();
    const state = (0, state_1.loadState)(sessionId, tmpDir);
    const category = (0, classify_1.classifyTool)(toolName, toolInput, config);
    const isLocked = state.locked;
    // Safe: always passthrough
    if (category === "safe")
        return;
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
