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
    // Pattern uses :* at the end for Claude Code's prefix matching syntax.
    const promptInAsk = matchesEntry(ask, "Bash", DELEGATE_PROMPT_EXAMPLE);
    const promptAutoAllowed = matchesEntry(allow, "Bash", DELEGATE_PROMPT_EXAMPLE);
    const promptDenied = matchesEntry(deny, "Bash", DELEGATE_PROMPT_EXAMPLE);
    // Critical: lockbox-prompt must NEVER be auto-allowed. If it's in allow (via
    // Bash, Bash(*), or a specific pattern), the approval gate is completely bypassed.
    // This can happen if the user clicks "allow always" on the permission prompt.
    // Check this regardless of whether it's also in ask — allow takes precedence once set.
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
