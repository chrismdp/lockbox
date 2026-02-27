import * as fs from "fs";
import * as os from "os";
import * as path from "path";
/** Convert a glob pattern (with * wildcards) to a RegExp */
function globToRegex(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + escaped + "$");
}
/** Check if any entry in the list matching Tool(pattern) would cover the given argument */
function matchesEntry(entries, tool, arg) {
    return entries.some((entry) => {
        if (entry === tool)
            return true; // bare "Task" or "Bash" covers everything
        const prefix = `${tool}(`;
        if (!entry.startsWith(prefix) || !entry.endsWith(")"))
            return false;
        const inner = entry.slice(prefix.length, -1);
        return globToRegex(inner).test(arg);
    });
}
/**
 * Return the specificity of the best matching entry for a tool+arg.
 * Claude Code uses specificity-based precedence: a specific ask pattern
 * beats a generic allow pattern.
 *
 * Returns: -1 = no match, 0 = bare tool name, 1+ = glob pattern
 * (1 = wildcard-only like *, higher = more literal characters).
 */
function matchSpecificity(entries, tool, arg) {
    let best = -1;
    for (const entry of entries) {
        if (entry === tool) {
            best = Math.max(best, 0);
            continue;
        }
        const prefix = `${tool}(`;
        if (!entry.startsWith(prefix) || !entry.endsWith(")"))
            continue;
        const inner = entry.slice(prefix.length, -1);
        if (globToRegex(inner).test(arg)) {
            const literals = inner.replace(/\*/g, "").length;
            best = Math.max(best, 1 + literals);
        }
    }
    return best;
}
// A concrete command that matches the delegate prompt pattern.
// Used to test whether ask/allow/deny entries would cover the actual prompt command.
const DELEGATE_PROMPT_EXAMPLE = '/path/to/lockbox-prompt "push master to origin"';
export function checkPermissions(settingsPath) {
    const p = settingsPath ?? path.join(os.homedir(), ".claude", "settings.json");
    let settings;
    try {
        settings = JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return []; // can't read settings — don't warn
    }
    const perms = settings.permissions;
    if (!perms)
        return [];
    const allow = (perms.allow ?? []);
    const deny = (perms.deny ?? []);
    const ask = (perms.ask ?? []);
    const warnings = [];
    // Primary check: the delegate's prompt command must trigger a permission prompt.
    // The delegate runs `lockbox-prompt "<summary>"` as its first action.
    // An `ask` rule for this pattern is the user's approval point — they see and
    // approve the delegate's task before it executes anything.
    const promptInAsk = matchesEntry(ask, "Bash", DELEGATE_PROMPT_EXAMPLE);
    const promptDenied = matchesEntry(deny, "Bash", DELEGATE_PROMPT_EXAMPLE);
    // Claude Code uses specificity-based precedence: a specific ask pattern beats
    // a generic allow pattern. So allow:["Bash"] + ask:["Bash(*lockbox-prompt*)"]
    // is safe — the specific ask entry wins. Only warn when the allow match is at
    // least as specific as the ask match (meaning allow actually takes precedence).
    const allowSpec = matchSpecificity(allow, "Bash", DELEGATE_PROMPT_EXAMPLE);
    const askSpec = matchSpecificity(ask, "Bash", DELEGATE_PROMPT_EXAMPLE);
    const promptAutoAllowed = allowSpec >= 0 && (askSpec < 0 || allowSpec >= askSpec);
    if (promptAutoAllowed) {
        warnings.push('CRITICAL: lockbox-prompt is auto-allowed — delegate actions execute without user review. Remove any Bash allow entry that covers lockbox-prompt. The approval gate only works when lockbox-prompt is in permissions.ask, not allow');
    }
    if (promptDenied) {
        warnings.push('Bash(*lockbox-prompt*) in deny — delegate approval prompt is blocked. Move to permissions.ask');
    }
    else if (!promptInAsk && !promptAutoAllowed) {
        warnings.push('Bash(*lockbox-prompt*) not in permissions.ask — delegate actions won\'t prompt for user review. Add to permissions.ask');
    }
    // Secondary: if Task(lockbox:delegate) is auto-allowed without any prompt gate,
    // note that Task's `ask` doesn't actually work (Claude Code "Permission Required: No")
    const delegateAllowed = matchesEntry(allow, "Task", "lockbox:delegate");
    const delegateDenied = matchesEntry(deny, "Task", "lockbox:delegate");
    if (delegateAllowed && !delegateDenied && !promptInAsk) {
        warnings.push("Task(lockbox:delegate) in allow has no effect on approval — Task ignores ask rules (Permission Required: No). The prompt approval gate is the actual control point");
    }
    return warnings;
}
