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
  // --- Prompt approval gate (primary check) ---
  // The delegate runs `lockbox-prompt "<summary>"` as its first action.
  // This must be in `ask` so the user sees and approves it.

  it("warns when prompt pattern not in ask", () => {
    const p = writeSettings({
      permissions: { allow: ["Read(/home/**)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("lockbox-prompt") && w.includes("not in permissions.ask"))).toBe(true);
  });

  it("warns CRITICAL when prompt auto-allowed via Bash(*)", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("CRITICAL") && w.includes("auto-allowed"))).toBe(true);
  });

  it("warns CRITICAL when prompt auto-allowed via bare Bash", () => {
    const p = writeSettings({
      permissions: { allow: ["Bash"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("CRITICAL") && w.includes("auto-allowed"))).toBe(true);
  });

  it("no warning when generic Bash(*) in allow but specific pattern in ask", () => {
    // Claude Code specificity: specific ask beats generic allow
    const p = writeSettings({
      permissions: {
        allow: ["Bash(*)"],
        ask: ['Bash(*lockbox-prompt*)'],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("no warning when bare Bash in allow but specific pattern in ask", () => {
    // Claude Code specificity: specific ask beats generic allow
    const p = writeSettings({
      permissions: {
        allow: ["Bash"],
        ask: ['Bash(*lockbox-prompt*)'],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("warns CRITICAL when specific allow matches same specificity as ask", () => {
    // Same specificity — allow takes precedence, bypassing the gate
    const p = writeSettings({
      permissions: {
        allow: ["Bash(*lockbox-prompt*)"],
        ask: ['Bash(*lockbox-prompt*)'],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("CRITICAL") && w.includes("auto-allowed"))).toBe(true);
  });

  it("no warning when prompt pattern in ask without broad allow", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ['Bash(*lockbox-prompt*)'],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("no warning when broad Bash in ask covers prompt", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ["Bash"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("no warning when Bash(*) in ask covers prompt", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)"],
        ask: ["Bash(*)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings).toHaveLength(0);
  });

  it("warns when prompt pattern denied", () => {
    const p = writeSettings({
      permissions: {
        deny: ['Bash(*lockbox-prompt*)'],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("lockbox-prompt") && w.includes("deny"))).toBe(true);
  });

  // --- Task secondary warning ---

  it("warns about Task auto-allow when prompt gate missing", () => {
    const p = writeSettings({
      permissions: { allow: ["Task(*)"], defaultMode: "acceptEdits" },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("Task") && w.includes("Permission Required: No"))).toBe(true);
  });

  it("no Task warning when prompt gate is present", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(*)"],
        ask: ['Bash(*lockbox-prompt*)'],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("Task"))).toBe(false);
  });

  it("no Task warning when delegate denied", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Task(*)"],
        deny: ["Task(lockbox:delegate)"],
        defaultMode: "acceptEdits",
      },
    });
    const warnings = checkPermissions(p);
    expect(warnings.some((w) => w.includes("Task") && w.includes("Permission Required: No"))).toBe(false);
  });

  // --- Edge cases ---

  it("no warnings when permissions are correct", () => {
    const p = writeSettings({
      permissions: {
        allow: ["Read(/home/**)", "Task(*)"],
        ask: ['Bash(*lockbox-prompt*)'],
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
