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
    // Only the delegate sub-agent matters — regular sub-agents inherit the parent's
    // lock and can't take acting commands. The delegate gets clean state, so it must
    // require user approval (approval point 1 of the escape flow).
    const delegateAllowed = matchesEntry(allow, "Task", "lockbox:delegate");
    const delegateDenied = matchesEntry(deny, "Task", "lockbox:delegate");
    const delegateInAsk = matchesEntry(ask, "Task", "lockbox:delegate");
    if (delegateAllowed && !delegateDenied && !delegateInAsk) {
        warnings.push("Task(lockbox:delegate) auto-allowed — delegate sub-agent executes without user review. Add Task(lockbox:delegate) to permissions.ask");
    }
    else if (!delegateAllowed && !delegateInAsk) {
        warnings.push("Task(lockbox:delegate) not in ask — delegate may auto-approve depending on permission mode. Add Task(lockbox:delegate) to permissions.ask");
    }
    return warnings;
}
