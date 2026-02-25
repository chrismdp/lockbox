import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { mergeList, mergeConfigs, loadConfig } from "../src/config";

describe("mergeList", () => {
  it("prepends additions to base", () => {
    expect(mergeList(["a", "b"], ["c"])).toEqual(["c", "a", "b"]);
  });

  it("removes items with ! prefix", () => {
    expect(mergeList(["a", "b", "c"], ["!b"])).toEqual(["a", "c"]);
  });

  it("handles additions and removals together", () => {
    expect(mergeList(["a", "b"], ["x", "!a"])).toEqual(["x", "b"]);
  });

  it("returns base unchanged with empty overlay", () => {
    expect(mergeList(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("mergeConfigs", () => {
  it("overlay scalar overwrites base", () => {
    const result = mergeConfigs(
      { mcp_default: "acting", tools: {}, mcp_tools: {}, bash_patterns: {} },
      { mcp_default: "safe" },
    );
    expect(result.mcp_default).toBe("safe");
  });

  it("merges mcp_tools dicts", () => {
    const result = mergeConfigs(
      { mcp_default: "acting", tools: {}, mcp_tools: { a: "safe" }, bash_patterns: {} },
      { mcp_tools: { b: "acting" } },
    );
    expect(result.mcp_tools).toEqual({ a: "safe", b: "acting" });
  });

  it("overlay mcp_tools key overwrites base key", () => {
    const result = mergeConfigs(
      { mcp_default: "acting", tools: {}, mcp_tools: { a: "safe" }, bash_patterns: {} },
      { mcp_tools: { a: "acting" } },
    );
    expect(result.mcp_tools).toEqual({ a: "acting" });
  });

  it("merges tool lists with mergeList semantics", () => {
    const result = mergeConfigs(
      { mcp_default: "acting", tools: { safe: ["Read", "Write"] }, mcp_tools: {}, bash_patterns: {} },
      { tools: { safe: ["Custom", "!Read"] } },
    );
    expect(result.tools.safe).toEqual(["Custom", "Write"]);
  });

  it("merges bash_patterns with mergeList semantics", () => {
    const result = mergeConfigs(
      { mcp_default: "acting", tools: {}, mcp_tools: {}, bash_patterns: { safe: ["^ls"] } },
      { bash_patterns: { safe: ["^mytool"], acting: ["^deploy"] } },
    );
    expect(result.bash_patterns.safe).toEqual(["^mytool", "^ls"]);
    expect(result.bash_patterns.acting).toEqual(["^deploy"]);
  });
});

describe("loadConfig", () => {
  let tmpPlugin: string;
  let tmpHome: string;
  let tmpCwd: string;

  beforeEach(() => {
    tmpPlugin = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-plugin-"));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-home-"));
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-cwd-"));

    // Create plugin defaults
    fs.mkdirSync(path.join(tmpPlugin, "scripts"));
    fs.writeFileSync(
      path.join(tmpPlugin, "scripts", "lockbox-defaults.json"),
      JSON.stringify({
        tools: { safe: ["Read"], acting: ["TaskStop"] },
        mcp_tools: {},
        mcp_default: "acting",
        bash_patterns: { safe: ["^ls"] },
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpPlugin, { recursive: true, force: true });
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  it("loads plugin defaults when no overrides exist", () => {
    const config = loadConfig({ pluginRoot: tmpPlugin, homeDir: tmpHome, cwd: tmpCwd });
    expect(config.tools.safe).toEqual(["Read"]);
    expect(config.mcp_default).toBe("acting");
  });

  it("applies user override from homeDir", () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"));
    fs.writeFileSync(
      path.join(tmpHome, ".claude", "lockbox.json"),
      JSON.stringify({ tools: { safe: ["Custom"] } }),
    );
    const config = loadConfig({ pluginRoot: tmpPlugin, homeDir: tmpHome, cwd: tmpCwd });
    expect(config.tools.safe).toEqual(["Custom", "Read"]);
  });

  it("applies project override from cwd", () => {
    fs.mkdirSync(path.join(tmpCwd, ".claude"));
    fs.writeFileSync(
      path.join(tmpCwd, ".claude", "lockbox.json"),
      JSON.stringify({ bash_patterns: { safe: ["^mytool"] } }),
    );
    const config = loadConfig({ pluginRoot: tmpPlugin, homeDir: tmpHome, cwd: tmpCwd });
    expect(config.bash_patterns.safe).toEqual(["^mytool", "^ls"]);
  });

  it("layers all three configs in order", () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"));
    fs.writeFileSync(
      path.join(tmpHome, ".claude", "lockbox.json"),
      JSON.stringify({ mcp_default: "safe" }),
    );
    fs.mkdirSync(path.join(tmpCwd, ".claude"));
    fs.writeFileSync(
      path.join(tmpCwd, ".claude", "lockbox.json"),
      JSON.stringify({ mcp_default: "unsafe" }),
    );
    const config = loadConfig({ pluginRoot: tmpPlugin, homeDir: tmpHome, cwd: tmpCwd });
    // Project override wins (last writer)
    expect(config.mcp_default).toBe("unsafe");
  });

  it("ignores corrupt override files", () => {
    fs.mkdirSync(path.join(tmpHome, ".claude"));
    fs.writeFileSync(path.join(tmpHome, ".claude", "lockbox.json"), "NOT JSON");
    const config = loadConfig({ pluginRoot: tmpPlugin, homeDir: tmpHome, cwd: tmpCwd });
    expect(config.tools.safe).toEqual(["Read"]);
  });
});
