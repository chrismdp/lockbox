/**
 * Tamper resistance: lockbox config and state files must not be editable
 * by tainted sessions. Reclassify Edit/Write as "acting" so they are
 * blocked when the session is locked (but allowed when clean).
 */
function isLockboxFile(toolInput) {
    const filePath = toolInput.file_path ?? "";
    return /lockbox\.json/.test(filePath) || /lockbox-state/.test(filePath);
}
/**
 * Claude Code session transcripts (.jsonl files under .claude/) may contain
 * tainted data from previous sessions. Reading them reintroduces that data
 * into the current context — same risk as fetching an untrusted web page.
 * Plan mode and sub-agents can read these files, so this must be enforced.
 */
function isClaudeSessionFile(toolInput) {
    const filePath = toolInput.file_path ?? toolInput.path ?? "";
    // Direct read of a transcript file
    if (/\.claude\/.*\.jsonl/.test(filePath))
        return true;
    // Grep/Glob searching session transcript directories
    if (/\.claude\/projects\//.test(filePath))
        return true;
    return false;
}
export function classifyTool(toolName, toolInput, config) {
    // Tamper resistance: protect lockbox config/state from tainted sessions
    if ((toolName === "Edit" || toolName === "Write") && isLockboxFile(toolInput)) {
        const filePath = toolInput.file_path ?? "";
        return { category: "acting", reasons: [`tamper resistance: ${filePath} is a lockbox config/state file`] };
    }
    // Session transcript taint: reading old Claude Code sessions reintroduces
    // potentially tainted data. Classify as unsafe so the session locks.
    if ((toolName === "Read" || toolName === "Grep" || toolName === "Glob") && isClaudeSessionFile(toolInput)) {
        return { category: "unsafe", reasons: ["Claude Code session transcript — may contain tainted data"] };
    }
    const tools = config.tools;
    if (tools.safe?.includes(toolName))
        return { category: "safe", reasons: [] };
    if (tools.acting?.includes(toolName))
        return { category: "acting", reasons: [`${toolName} is classified as acting`] };
    if (tools.unsafe?.includes(toolName))
        return { category: "unsafe", reasons: [`${toolName} is classified as unsafe`] };
    if (tools.unsafe_acting?.includes(toolName))
        return { category: "unsafe_acting", reasons: [`${toolName} is classified as unsafe_acting`] };
    // MCP tools: exact match, then prefix-based default
    if (toolName in config.mcp_tools) {
        return { category: config.mcp_tools[toolName], reasons: [`MCP tool ${toolName} is classified as ${config.mcp_tools[toolName]}`] };
    }
    if (toolName.startsWith("mcp__")) {
        return { category: config.mcp_default, reasons: [`unknown MCP tool defaults to ${config.mcp_default}`] };
    }
    // Bash: classify by command content
    if (toolName === "Bash") {
        return classifyBash(toolInput.command ?? "", config.bash_patterns);
    }
    // Unknown tool -> acting (conservative)
    return { category: "acting", reasons: [`unknown tool "${toolName}" defaults to acting`] };
}
/**
 * Split command on unquoted |, &, ; operators, respecting quotes and escapes.
 */
export function splitCommand(command) {
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
            // Don't split on & when preceded by > (shell redirect like 2>&1)
            if (char === "&" && current.length > 0 && current[current.length - 1] === ">") {
                current.push(char);
                continue;
            }
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
export function classifyBashSegment(segment, patterns) {
    for (const p of patterns.override_safe ?? []) {
        if (new RegExp(p).test(segment))
            return { category: "safe", pattern: p, patternCategory: "override_safe" };
    }
    for (const p of patterns.unsafe_acting ?? []) {
        if (new RegExp(p).test(segment))
            return { category: "unsafe_acting", pattern: p, patternCategory: "unsafe_acting" };
    }
    for (const p of patterns.unsafe ?? []) {
        if (new RegExp(p).test(segment))
            return { category: "unsafe", pattern: p, patternCategory: "unsafe" };
    }
    for (const p of patterns.acting ?? []) {
        if (new RegExp(p).test(segment))
            return { category: "acting", pattern: p, patternCategory: "acting" };
    }
    for (const p of patterns.safe ?? []) {
        if (new RegExp(p).test(segment))
            return { category: "safe", pattern: p, patternCategory: "safe" };
    }
    return { category: "acting" };
}
/**
 * Split piped/chained commands, classify each segment.
 * Tracks unsafe and acting independently — a pipe that both reads untrusted
 * data and acts externally gets unsafe_acting.
 */
export function classifyBash(command, patterns) {
    const segments = splitCommand(command);
    const reasons = [];
    let hasUnsafe = false;
    let hasActing = false;
    for (const seg of segments) {
        const result = classifyBashSegment(seg, patterns);
        const cat = result.category;
        if (cat === "unsafe" || cat === "unsafe_acting")
            hasUnsafe = true;
        if (cat === "acting" || cat === "unsafe_acting")
            hasActing = true;
        if (cat !== "safe") {
            const truncSeg = seg.length > 80 ? seg.slice(0, 80) + "..." : seg;
            if (result.pattern) {
                reasons.push(`"${truncSeg}" matched ${result.patternCategory} pattern /${result.pattern}/`);
            }
            else {
                reasons.push(`"${truncSeg}" — no safe pattern matched, defaults to acting`);
            }
        }
    }
    let category;
    if (hasUnsafe && hasActing)
        category = "unsafe_acting";
    else if (hasActing)
        category = "acting";
    else if (hasUnsafe)
        category = "unsafe";
    else
        category = "safe";
    return { category, reasons };
}
export function toolDescription(toolName, toolInput) {
    if (toolName === "Bash") {
        const cmd = (toolInput.command ?? "").slice(0, 120);
        return `Bash: ${cmd}`;
    }
    return toolName;
}
