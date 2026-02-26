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
      permissions: { allow: ["Bash(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Bash(*)");
    expect(warnings[0]).toContain("lockbox:clean");
  });

  it("warns when bare Bash is in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash"], defaultMode: "acceptEdits" },
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
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Task");
    expect(warnings[0]).toContain("sub-agent");
  });

  it("warns when Task(*) is in allow", () => {
    const p = writeSettings({
      permissions: { allow: ["Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Task");
  });

  it("warns on both Bash(*) and Task together", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash(*)", "Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(2);
  });

  it("no warnings when permissions are correct", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)", "Bash(git status)"],
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
