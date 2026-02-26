import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getStatePath, loadState, saveState, deleteState, findLockedSessions, isDelegateActive, startDelegate, stopDelegate } from "../src/state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getStatePath", () => {
  it("uses tmpDir and session id", () => {
    const p = getStatePath("abc123", tmpDir);
    expect(p).toBe(path.join(tmpDir, "lockbox-state-abc123.json"));
  });
});

describe("loadState", () => {
  it("returns default state when file is missing", () => {
    const state = loadState("missing", tmpDir);
    expect(state).toEqual({
      locked: false,
      locked_by: null,
      locked_at: null,
      blocked_tools: [],
    });
  });

  it("loads valid state file", () => {
    const data = {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["Bash: git push"],
    };
    fs.writeFileSync(
      path.join(tmpDir, "lockbox-state-valid.json"),
      JSON.stringify(data),
    );
    const state = loadState("valid", tmpDir);
    expect(state).toEqual(data);
  });

  it("returns default state on corrupt JSON", () => {
    fs.writeFileSync(
      path.join(tmpDir, "lockbox-state-corrupt.json"),
      "not json{{{",
    );
    const state = loadState("corrupt", tmpDir);
    expect(state.locked).toBe(false);
  });
});

describe("saveState", () => {
  it("roundtrips with loadState", () => {
    const data = {
      locked: true,
      locked_by: "curl",
      locked_at: "2025-06-01T12:00:00Z",
      blocked_tools: ["Bash: ssh user@host"],
    };
    saveState("rt", data, tmpDir);
    const loaded = loadState("rt", tmpDir);
    expect(loaded).toEqual(data);
  });
});

describe("deleteState", () => {
  it("deletes existing state file", () => {
    saveState("del", { locked: true, locked_by: null, locked_at: null, blocked_tools: [] }, tmpDir);
    const p = getStatePath("del", tmpDir);
    expect(fs.existsSync(p)).toBe(true);
    deleteState("del", tmpDir);
    expect(fs.existsSync(p)).toBe(false);
  });

  it("does not throw when file is missing", () => {
    expect(() => deleteState("nope", tmpDir)).not.toThrow();
  });
});

describe("findLockedSessions", () => {
  it("finds locked sessions excluding own", () => {
    saveState("parent", { locked: false, locked_by: null, locked_at: null, blocked_tools: [] }, tmpDir);
    saveState("child-1", { locked: true, locked_by: "WebFetch", locked_at: "2025-01-01T00:00:00Z", blocked_tools: [] }, tmpDir);
    saveState("child-2", { locked: true, locked_by: "curl", locked_at: "2025-01-01T00:00:00Z", blocked_tools: [] }, tmpDir);

    const result = findLockedSessions("parent", tmpDir);
    expect(result).toContain("child-1");
    expect(result).toContain("child-2");
    expect(result).not.toContain("parent");
  });

  it("excludes own session even if locked", () => {
    saveState("self", { locked: true, locked_by: "WebFetch", locked_at: "2025-01-01T00:00:00Z", blocked_tools: [] }, tmpDir);
    const result = findLockedSessions("self", tmpDir);
    expect(result).toEqual([]);
  });

  it("ignores unlocked sessions", () => {
    saveState("clean", { locked: false, locked_by: null, locked_at: null, blocked_tools: [] }, tmpDir);
    const result = findLockedSessions("parent", tmpDir);
    expect(result).toEqual([]);
  });

  it("handles corrupt state files gracefully", () => {
    fs.writeFileSync(path.join(tmpDir, "lockbox-state-corrupt.json"), "not json{{{");
    const result = findLockedSessions("parent", tmpDir);
    expect(result).toEqual([]);
  });

  it("handles missing tmpDir gracefully", () => {
    const result = findLockedSessions("parent", "/nonexistent/path");
    expect(result).toEqual([]);
  });
});

describe("delegate state", () => {
  it("isDelegateActive returns false when no marker", () => {
    expect(isDelegateActive("no-marker", tmpDir)).toBe(false);
  });

  it("startDelegate backs up state, clears it, and sets marker", () => {
    saveState("del-1", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["git push"],
    }, tmpDir);

    startDelegate("del-1", tmpDir);

    // Marker should be set
    expect(isDelegateActive("del-1", tmpDir)).toBe(true);
    // State should be cleared
    const state = loadState("del-1", tmpDir);
    expect(state.locked).toBe(false);
    // Backup should exist with original state
    const backupPath = path.join(tmpDir, "lockbox-state-del-1.delegate-backup.json");
    expect(fs.existsSync(backupPath)).toBe(true);
    const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
    expect(backup.locked).toBe(true);
    expect(backup.locked_by).toBe("WebFetch");
    expect(backup.blocked_tools).toEqual(["git push"]);
  });

  it("startDelegate is idempotent", () => {
    saveState("del-2", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    startDelegate("del-2", tmpDir);

    // Modify state (simulate delegate work)
    saveState("del-2", {
      locked: true,
      locked_by: "delegate-curl",
      locked_at: "2025-06-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    // Second startDelegate should not overwrite backup
    startDelegate("del-2", tmpDir);

    const backupPath = path.join(tmpDir, "lockbox-state-del-2.delegate-backup.json");
    const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
    expect(backup.locked_by).toBe("WebFetch"); // original preserved
  });

  it("startDelegate works when no state file exists", () => {
    startDelegate("del-3", tmpDir);

    expect(isDelegateActive("del-3", tmpDir)).toBe(true);
    const state = loadState("del-3", tmpDir);
    expect(state.locked).toBe(false);
  });

  it("stopDelegate restores backup and cleans up", () => {
    saveState("del-4", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["git push"],
    }, tmpDir);

    startDelegate("del-4", tmpDir);

    // Simulate delegate accumulating its own state
    saveState("del-4", {
      locked: true,
      locked_by: "delegate-taint",
      locked_at: "2025-06-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    stopDelegate("del-4", tmpDir);

    // Marker should be removed
    expect(isDelegateActive("del-4", tmpDir)).toBe(false);
    // State should be restored to parent's original
    const state = loadState("del-4", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("WebFetch");
    expect(state.blocked_tools).toEqual(["git push"]);
    // Backup should be cleaned up
    const backupPath = path.join(tmpDir, "lockbox-state-del-4.delegate-backup.json");
    expect(fs.existsSync(backupPath)).toBe(false);
  });

  it("stopDelegate is no-op when delegate not active", () => {
    saveState("del-5", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    stopDelegate("del-5", tmpDir);

    // State should be unchanged
    const state = loadState("del-5", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("WebFetch");
  });

  it("stopDelegate handles clean parent (no backup file)", () => {
    // Start delegate from clean session (no state file)
    startDelegate("del-6", tmpDir);

    stopDelegate("del-6", tmpDir);

    expect(isDelegateActive("del-6", tmpDir)).toBe(false);
    // State should be clean (no backup to restore)
    const state = loadState("del-6", tmpDir);
    expect(state.locked).toBe(false);
  });

  it("full delegate cycle: start → delegate works → stop → parent restored", () => {
    // Parent is locked
    saveState("del-7", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["git push", "npm publish"],
    }, tmpDir);

    // Start delegate
    startDelegate("del-7", tmpDir);
    expect(isDelegateActive("del-7", tmpDir)).toBe(true);
    expect(loadState("del-7", tmpDir).locked).toBe(false); // clean for delegate

    // Delegate does work (state stays clean since delegate only acts, doesn't read untrusted)
    // ... delegate executes external commands ...

    // Stop delegate
    stopDelegate("del-7", tmpDir);
    expect(isDelegateActive("del-7", tmpDir)).toBe(false);

    // Parent's lock is restored
    const state = loadState("del-7", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("WebFetch");
    expect(state.blocked_tools).toEqual(["git push", "npm publish"]);
  });
});
