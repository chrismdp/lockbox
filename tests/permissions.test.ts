import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { checkPermissions } from "../src/permissions";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-perms-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSettings(settings: Record<string, unknown>): string {
  const p = path.join(tmpDir, "settings.json");
  fs.writeFileSync(p, JSON.stringify(settings));
  return p;
}

describe("checkPermissions", () => {
  it("warns when Bash(*) is in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash(*)"], ask: ["Task"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Bash(*)");
    expect(warnings[0]).toContain("lockbox:clean");
  });

  it("warns when bare Bash is in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash"], ask: ["Task"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Bash");
  });

  it("warns when Task is in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Task"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate") && w.includes("auto-execute"))).toBe(true);
  });

  it("warns when Task(*) is in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate") && w.includes("auto-execute"))).toBe(true);
  });

  it("warns on both Bash(*) and Task in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash(*)", "Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(2);
  });

  it("no Task warning when deny covers lockbox:delegate", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(*)"],
        deny: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate"))).toBe(false);
  });

  it("no Task warning when deny covers with broader pattern", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(*)"],
        deny: ["Task(*delegate*)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate"))).toBe(false);
  });

  it("still warns when deny has unrelated Task pattern", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(*)"],
        deny: ["Task(some-other-agent)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate"))).toBe(true);
  });

  it("warns when Task is not in ask", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Task not in ask");
  });

  it("no Bash warning when deny covers lockbox:clean", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Bash(*)"],
        deny: ["Bash(echo*lockbox*clean*)"],
        ask: ["Task"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("Bash"))).toBe(false);
  });

  it("no Bash warning when deny covers with broader pattern", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Bash(*)"],
        deny: ["Bash(*lockbox*)"],
        ask: ["Task"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("Bash"))).toBe(false);
  });

  it("still warns when deny has unrelated Bash pattern", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Bash(*)"],
        deny: ["Bash(rm -rf*)"],
        ask: ["Task"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("Bash"))).toBe(true);
  });

  it("no warnings when permissions are correct", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)", "Bash(git status)"],
        ask: ["Task"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("no warnings when no permissions key", () => {
    const p = writeSettings({ model: "opus" });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("handles missing settings file gracefully", () => {
    const warnings = checkPermissions(path.join(tmpDir, "nonexistent.json"));
    expect(warnings).toHaveLength(0);
  });

  it("handles corrupt settings file gracefully", () => {
    const p = path.join(tmpDir, "settings.json");
    fs.writeFileSync(p, "not json{{{");
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });
});
