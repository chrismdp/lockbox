"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyTool = classifyTool;
exports.splitCommand = splitCommand;
exports.classifyBashSegment = classifyBashSegment;
exports.classifyBash = classifyBash;
exports.toolDescription = toolDescription;
function classifyTool(toolName, toolInput, config) {
    const tools = config.tools;
    if (tools.safe?.includes(toolName))
        return "safe";
    if (tools.acting?.includes(toolName))
        return "acting";
    if (tools.unsafe?.includes(toolName))
        return "unsafe";
    if (tools.unsafe_acting?.includes(toolName))
        return "unsafe_acting";
    // MCP tools: exact match, then prefix-based default
    if (toolName in config.mcp_tools) {
        return config.mcp_tools[toolName];
    }
    if (toolName.startsWith("mcp__")) {
        return config.mcp_default;
    }
    // Bash: classify by command content
    if (toolName === "Bash") {
        return classifyBash(toolInput.command ?? "", config.bash_patterns);
    }
    // Unknown tool -> acting (conservative)
    return "acting";
}
/**
 * Split command on unquoted |, &, ; operators, respecting quotes and escapes.
 */
function splitCommand(command) {
    const segments = [];
    let current = [];
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    for (const char of command) {
        if (escaped) {
            current.push(char);
            escaped = false;
            continue;
        }
        if (char === "\\") {
            current.push(char);
            escaped = true;
            continue;
        }
        if (char === "'" && !inDouble) {
            inSingle = !inSingle;
            current.push(char);
            continue;
        }
        if (char === '"' && !inSingle) {
            inDouble = !inDouble;
            current.push(char);
            continue;
        }
        if (!inSingle && !inDouble && (char === "|" || char === "&" || char === ";")) {
            segments.push(current.join(""));
            current = [];
            continue;
        }
        current.push(char);
    }
    if (current.length > 0) {
        segments.push(current.join(""));
    }
    return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}
/**
 * Classify a single bash segment against pattern lists.
 * Check order: override_safe -> unsafe_acting -> unsafe -> acting -> safe -> default acting.
 */
function classifyBashSegment(segment, patterns) {
    for (const p of patterns.override_safe ?? []) {
        if (new RegExp(p).test(segment))
            return "safe";
    }
    for (const p of patterns.unsafe_acting ?? []) {
        if (new RegExp(p).test(segment))
            return "unsafe_acting";
    }
    for (const p of patterns.unsafe ?? []) {
        if (new RegExp(p).test(segment))
            return "unsafe";
    }
    for (const p of patterns.acting ?? []) {
        if (new RegExp(p).test(segment))
            return "acting";
    }
    for (const p of patterns.safe ?? []) {
        if (new RegExp(p).test(segment))
            return "safe";
    }
    return "acting";
}
/**
 * Split piped/chained commands, classify each segment.
 * Tracks unsafe and acting independently — a pipe that both reads untrusted
 * data and acts externally gets unsafe_acting.
 */
function classifyBash(command, patterns) {
    const segments = splitCommand(command);
    let hasUnsafe = false;
    let hasActing = false;
    for (const seg of segments) {
        const cat = classifyBashSegment(seg, patterns);
        if (cat === "unsafe" || cat === "unsafe_acting")
            hasUnsafe = true;
        if (cat === "acting" || cat === "unsafe_acting")
            hasActing = true;
    }
    if (hasUnsafe && hasActing)
        return "unsafe_acting";
    if (hasActing)
        return "acting";
    if (hasUnsafe)
        return "unsafe";
    return "safe";
}
function toolDescription(toolName, toolInput) {
    if (toolName === "Bash") {
        const cmd = (toolInput.command ?? "").slice(0, 120);
        return `Bash: ${cmd}`;
    }
    return toolName;
}
