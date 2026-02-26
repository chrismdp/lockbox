import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Convert a glob pattern (with * wildcards) to a RegExp */
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + "$");
}

/** Check if any deny entry with Bash(...) would block the given command string */
function bashDenied(deny: string[], cmd: string): boolean {
  return deny.some((d) => {
    const m = d.match(/^Bash\((.+)\)$/);
    return m && globToRegex(m[1]).test(cmd);
  });
}

export function checkPermissions(settingsPath?: string): string[] {
  const p = settingsPath ?? path.join(os.homedir(), ".claude", "settings.json");
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return []; // can't read settings — don't warn
  }

  const perms = settings.permissions as Record<string, unknown> | undefined;
  if (!perms) return [];

  const allow = (perms.allow ?? []) as string[];
  const deny = (perms.deny ?? []) as string[];
  const warnings: string[] = [];

  if (
    allow.some((p) => p === "Bash(*)" || p === "Bash") &&
    !bashDenied(deny, "echo 'lockbox:clean'")
  ) {
    warnings.push(
      "Bash(*) in allow — echo 'lockbox:clean' auto-runs without user review",
    );
  }

  if (allow.some((p) => p === "Task" || p === "Task(*)" || p.startsWith("Task("))) {
    warnings.push(
      "Task in allow — sub-agent prompts execute without user review",
    );
  } else {
    const ask = (perms.ask ?? []) as string[];
    const taskInAsk = ask.some((p) => p === "Task" || p === "Task(*)" || p.startsWith("Task("));
    if (!taskInAsk) {
      warnings.push(
        "Task not in ask — sub-agent prompts may auto-approve depending on permission mode. Add Task to permissions.ask",
      );
    }
  }

  return warnings;
}
