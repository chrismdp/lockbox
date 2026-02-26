import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
    const warnings = [];
    if (allow.some((p) => p === "Bash(*)" || p === "Bash")) {
        warnings.push("Bash(*) in allow — echo 'lockbox:clean' auto-runs without user review");
    }
    if (allow.some((p) => p === "Task" || p === "Task(*)" || p.startsWith("Task("))) {
        warnings.push("Task in allow — sub-agent prompts execute without user review");
    }
    else {
        const ask = (perms.ask ?? []);
        const taskInAsk = ask.some((p) => p === "Task" || p === "Task(*)" || p.startsWith("Task("));
        if (!taskInAsk) {
            warnings.push("Task not in ask — sub-agent prompts may auto-approve depending on permission mode. Add Task to permissions.ask");
        }
    }
    return warnings;
}
