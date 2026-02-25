import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LockboxConfig } from "./types";

export function mergeList(base: string[], overlay: string[]): string[] {
  const removals = new Set(
    overlay.filter((s) => s.startsWith("!")).map((s) => s.slice(1)),
  );
  const additions = overlay.filter((s) => !s.startsWith("!"));
  const filtered = base.filter((s) => !removals.has(s));
  return [...additions, ...filtered];
}

export function mergeConfigs(
  base: Partial<LockboxConfig>,
  overlay: Partial<LockboxConfig>,
): LockboxConfig {
  // Scalar: last writer wins
  const mcp_default = overlay.mcp_default ?? base.mcp_default ?? "acting";

  // Dict: overlay keys overwrite base keys
  const mcp_tools = {
    ...(base.mcp_tools ?? {}),
    ...(overlay.mcp_tools ?? {}),
  };

  // List groups: merge each category
  const tools: Record<string, string[]> = {};
  const allToolKeys = new Set([
    ...Object.keys(base.tools ?? {}),
    ...Object.keys(overlay.tools ?? {}),
  ]);
  for (const k of allToolKeys) {
    tools[k] = mergeList(
      (base.tools ?? {})[k] ?? [],
      (overlay.tools ?? {})[k] ?? [],
    );
  }

  const bash_patterns: Record<string, string[]> = {};
  const allBashKeys = new Set([
    ...Object.keys(base.bash_patterns ?? {}),
    ...Object.keys(overlay.bash_patterns ?? {}),
  ]);
  for (const k of allBashKeys) {
    bash_patterns[k] = mergeList(
      (base.bash_patterns ?? {})[k] ?? [],
      (overlay.bash_patterns ?? {})[k] ?? [],
    );
  }

  return { tools, mcp_tools, mcp_default, bash_patterns };
}

export function loadConfig(opts?: {
  pluginRoot?: string;
  homeDir?: string;
  cwd?: string;
}): LockboxConfig {
  const pluginRoot =
    opts?.pluginRoot ??
    process.env.CLAUDE_PLUGIN_ROOT ??
    path.resolve(__dirname, "..");
  const homeDir = opts?.homeDir ?? os.homedir();
  const cwd = opts?.cwd ?? process.cwd();

  const defaultsPath = path.join(pluginRoot, "scripts", "lockbox-defaults.json");
  const base: LockboxConfig = JSON.parse(fs.readFileSync(defaultsPath, "utf-8"));

  const overridePaths = [
    path.join(homeDir, ".claude", "lockbox.json"),
    path.join(cwd, ".claude", "lockbox.json"),
  ];

  let config = base;
  for (const p of overridePaths) {
    try {
      const data = fs.readFileSync(p, "utf-8");
      config = mergeConfigs(config, JSON.parse(data));
    } catch {
      // file missing or invalid — skip
    }
  }

  return config;
}
