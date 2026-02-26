import * as fs from "fs";
import * as os from "os";
import * as path from "path";
/** Convert a glob pattern (with * wildcards) to a RegExp */
function globToRegex(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + escaped + "$");
}
/** Check if any deny entry matching Tool(pattern) would block the given argument */
function isDenied(deny, tool, arg) {
    const prefix = `${tool}(`;
    return deny.some((d) => {
        if (!d.startsWith(prefix) || !d.endsWith(")"))
            return false;
        const inner = d.slice(prefix.length, -1);
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
    const warnings = [];
    if (allow.some((p) => p === "Bash(*)" || p === "Bash") &&
        !isDenied(deny, "Bash", "echo 'lockbox:clean'")) {
        warnings.push("Bash(*) in allow — echo 'lockbox:clean' auto-runs without user review");
    }
    const taskInAllow = allow.some((p) => p === "Task" || p === "Task(*)" || p.startsWith("Task("));
    if (taskInAllow &&
        !isDenied(deny, "Task", "lockbox:delegate")) {
        warnings.push("Task in allow — delegate sub-agent can auto-execute without user review");
    }
    else if (!taskInAllow) {
        const ask = (perms.ask ?? []);
        const taskInAsk = ask.some((p) => p === "Task" || p === "Task(*)" || p.startsWith("Task("));
        if (!taskInAsk) {
            warnings.push("Task not in ask — sub-agent prompts may auto-approve depending on permission mode. Add Task to permissions.ask");
        }
    }
    return warnings;
}
