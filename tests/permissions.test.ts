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
  // --- Delegate sub-agent permissions ---
  // Only lockbox:delegate matters. Regular sub-agents inherit the parent lock.

  it("warns when Task(*) auto-allows delegate", () => {
    const p = writeSettings({
      permissions: { allow: ["Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate") && w.includes("auto-allowed"))).toBe(true);
  });

  it("warns when bare Task auto-allows delegate", () => {
    const p = writeSettings({
      permissions: { allow: ["Task"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate") && w.includes("auto-allowed"))).toBe(true);
  });

  it("no warning when Task(*) in allow but delegate in ask", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(*)"],
        ask: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate"))).toBe(false);
  });

  it("no warning when Task(*) in allow but delegate in deny", () => {
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

  it("no warning when broad Task in ask covers delegate", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ["Task"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("warns when delegate not in allow or ask", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("delegate");
    expect(warnings[0]).toContain("not in ask");
  });

  it("warns when delegate auto-allowed with broad permissions", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash(*)", "Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("delegate");
  });

  it("no warning when non-delegate Task agents are in allow", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(general-purpose)", "Task(Explore)"],
        ask: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("delegate"))).toBe(false);
  });

  it("no warnings when permissions are correct", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)", "Bash(git status)"],
        ask: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("warns when skipDangerousModePermissionPrompt is true", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
      skipDangerousModePermissionPrompt: true,
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("skipDangerousModePermissionPrompt");
    expect(warnings[0]).toContain("dangerous mode");
  });

  it("no warning when skipDangerousModePermissionPrompt is false", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
      skipDangerousModePermissionPrompt: false,
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("no warning when skipDangerousModePermissionPrompt is absent", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ["Task(lockbox:delegate)"],
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
